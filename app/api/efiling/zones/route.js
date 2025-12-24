import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

async function requireAdmin(request) {
    const session = await auth(request);
    const role = parseInt(session?.user?.role);
    if (!session?.user || ![1, 2].includes(role)) {
        return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    return { session };
}

async function safeRollback(client) {
    try {
        await client.query('ROLLBACK');
    } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
    }
}

function sanitiseLocations(rawLocations) {
    if (!Array.isArray(rawLocations)) return [];
    return rawLocations
        .map((loc) => ({
            district_id: loc?.district_id ? Number(loc.district_id) : null,
            town_id: loc?.town_id ? Number(loc.town_id) : null,
        }))
        .filter((loc) => loc.district_id || loc.town_id);
}

async function fetchZonesWithLocations(client, zoneIds) {
    if (!zoneIds.length) return new Map();
    const { rows } = await client.query(
        `SELECT zl.zone_id,
                zl.district_id,
                d.title AS district_name,
                zl.town_id,
                t.town AS town_name
         FROM efiling_zone_locations zl
         LEFT JOIN district d ON d.id = zl.district_id
         LEFT JOIN town t ON t.id = zl.town_id
         WHERE zl.zone_id = ANY($1::int[])`
        , [zoneIds]
    );
    const map = new Map();
    for (const row of rows) {
        if (!map.has(row.zone_id)) {
            map.set(row.zone_id, []);
        }
        map.get(row.zone_id).push({
            district_id: row.district_id,
            district_name: row.district_name,
            town_id: row.town_id,
            town_name: row.town_name,
        });
    }
    return map;
}

async function getZoneById(client, zoneId) {
    const zoneRes = await client.query(`SELECT * FROM efiling_zones WHERE id = $1`, [zoneId]);
    if (zoneRes.rows.length === 0) {
        return null;
    }
    const locationsMap = await fetchZonesWithLocations(client, [zoneId]);
    const zone = zoneRes.rows[0];
    zone.locations = locationsMap.get(zone.id) || [];
    return zone;
}

async function saveZoneLocations(client, zoneId, locations = []) {
    const cleanLocations = sanitiseLocations(locations);
    await client.query(`DELETE FROM efiling_zone_locations WHERE zone_id = $1`, [zoneId]);
    if (!cleanLocations.length) return;

    const townIds = [...new Set(cleanLocations.filter((loc) => loc.town_id).map((loc) => loc.town_id))];
    let townLookup = new Map();
    if (townIds.length) {
        const townRes = await client.query(`SELECT id, district_id FROM town WHERE id = ANY($1::int[])`, [townIds]);
        townLookup = new Map(townRes.rows.map((row) => [row.id, row.district_id]));
    }

    const seen = new Set();
    for (const loc of cleanLocations) {
        const townId = loc.town_id || null;
        let districtId = loc.district_id || null;
        if (townId && !districtId) {
            districtId = townLookup.get(townId) || null;
        }
        if (!districtId && !townId) continue;
        const key = `${districtId || 0}-${townId || 0}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await client.query(
            `INSERT INTO efiling_zone_locations (zone_id, district_id, town_id, created_at)
             VALUES ($1, $2, $3, NOW())`,
            [zoneId, districtId, townId]
        );
    }
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const isActive = searchParams.get('is_active');
    const client = await connectToDatabase();

    try {
        if (id) {
            const zoneId = Number(id);
            if (Number.isNaN(zoneId)) {
                return NextResponse.json({ error: 'Invalid zone id' }, { status: 400 });
            }
            const zone = await getZoneById(client, zoneId);
            if (!zone) {
                return NextResponse.json({ error: 'Zone not found' }, { status: 404 });
            }
            return NextResponse.json(zone);
        }

        let query = `SELECT * FROM efiling_zones`;
        const params = [];
        if (isActive !== null) {
            query += ` WHERE is_active = $1`;
            params.push(isActive === 'true');
        }
        query += ` ORDER BY name ASC`;

        const res = await client.query(query, params);
        const zones = res.rows;
        const locationsMap = await fetchZonesWithLocations(client, zones.map((z) => z.id));
        const enriched = zones.map((zone) => ({
            ...zone,
            locations: locationsMap.get(zone.id) || [],
        }));

        return NextResponse.json({ success: true, zones: enriched });
    } catch (error) {
        console.error('Error fetching zones:', error);
        return NextResponse.json({ error: 'Failed to fetch zones' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

export async function POST(request) {
    const authResult = await requireAdmin(request);
    if (authResult.error) return authResult.error;

    const client = await connectToDatabase();

    try {
        const { name, ce_type, description, is_active = true, locations = [] } = await request.json();
        if (!name) {
            return NextResponse.json({ error: 'Zone name is required' }, { status: 400 });
        }

        await client.query('BEGIN');

        const existing = await client.query(
            `SELECT id FROM efiling_zones WHERE name ILIKE $1`,
            [name]
        );
        if (existing.rows.length > 0) {
            await safeRollback(client);
            return NextResponse.json({ error: 'Zone with this name already exists' }, { status: 409 });
        }

        const res = await client.query(
            `INSERT INTO efiling_zones (name, ce_type, description, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())
             RETURNING id`,
            [name, ce_type || null, description || null, is_active]
        );

        const zoneId = res.rows[0].id;
        await saveZoneLocations(client, zoneId, locations);
        const zone = await getZoneById(client, zoneId);

        await client.query('COMMIT');

        return NextResponse.json({ success: true, zone }, { status: 201 });
    } catch (error) {
        await safeRollback(client);
        console.error('Error creating zone:', error);
        return NextResponse.json({ error: 'Failed to create zone' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

export async function PUT(request) {
    const authResult = await requireAdmin(request);
    if (authResult.error) return authResult.error;

    const client = await connectToDatabase();

    try {
        const { id, name, ce_type, description, is_active, locations = [] } = await request.json();
        if (!id) {
            return NextResponse.json({ error: 'Zone id is required' }, { status: 400 });
        }

        await client.query('BEGIN');

        const existing = await client.query(
            `SELECT * FROM efiling_zones WHERE id = $1`,
            [id]
        );
        if (existing.rows.length === 0) {
            await safeRollback(client);
            return NextResponse.json({ error: 'Zone not found' }, { status: 404 });
        }

        if (name) {
            const duplicate = await client.query(
                `SELECT id FROM efiling_zones WHERE name ILIKE $1 AND id <> $2`,
                [name, id]
            );
            if (duplicate.rows.length > 0) {
                await safeRollback(client);
                return NextResponse.json({ error: 'Another zone with this name already exists' }, { status: 409 });
            }
        }

        await client.query(
            `UPDATE efiling_zones
             SET name = COALESCE($2, name),
                 ce_type = COALESCE($3, ce_type),
                 description = COALESCE($4, description),
                 is_active = COALESCE($5, is_active),
                 updated_at = NOW()
             WHERE id = $1`,
            [id, name || null, ce_type || null, description || null, typeof is_active === 'boolean' ? is_active : null]
        );

        await saveZoneLocations(client, id, locations);
        const zone = await getZoneById(client, id);

        await client.query('COMMIT');

        return NextResponse.json({ success: true, zone });
    } catch (error) {
        await safeRollback(client);
        console.error('Error updating zone:', error);
        return NextResponse.json({ error: 'Failed to update zone' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

export async function DELETE(request) {
    const authResult = await requireAdmin(request);
    if (authResult.error) return authResult.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
        return NextResponse.json({ error: 'Zone id is required' }, { status: 400 });
    }

    const client = await connectToDatabase();
    try {
        // Check which tables exist before checking references
        let hasDepartmentLocations = false;
        let hasRoleLocations = false;
        let hasRoleGroupLocations = false;
        
        try {
            const [deptCheck, roleCheck, roleGroupCheck] = await Promise.all([
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_department_locations'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_role_locations'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_role_group_locations'
                    );
                `)
            ]);
            hasDepartmentLocations = deptCheck.rows[0]?.exists || false;
            hasRoleLocations = roleCheck.rows[0]?.exists || false;
            hasRoleGroupLocations = roleGroupCheck.rows[0]?.exists || false;
        } catch (checkError) {
            console.warn('Could not check for location tables:', checkError.message);
        }

        // Build reference check query based on existing tables
        const refParts = [];
        if (hasDepartmentLocations) {
            refParts.push('(SELECT COUNT(*) FROM efiling_department_locations WHERE zone_id = $1)');
        }
        if (hasRoleLocations) {
            refParts.push('(SELECT COUNT(*) FROM efiling_role_locations WHERE zone_id = $1)');
        }
        if (hasRoleGroupLocations) {
            refParts.push('(SELECT COUNT(*) FROM efiling_role_group_locations WHERE zone_id = $1)');
        }

        if (refParts.length > 0) {
            const referenceCheck = await client.query(
                `SELECT ${refParts.join(' + ')} AS ref_count`,
                [id]
            );

            if (parseInt(referenceCheck.rows[0].ref_count, 10) > 0) {
                return NextResponse.json({ error: 'Cannot delete zone with existing location mappings' }, { status: 409 });
            }
        }

        const res = await client.query(`DELETE FROM efiling_zones WHERE id = $1 RETURNING *`, [id]);
        if (res.rows.length === 0) {
            return NextResponse.json({ error: 'Zone not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting zone:', error);
        return NextResponse.json({ error: 'Failed to delete zone' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

