import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

async function requireAdmin() {
    const session = await auth();
    if (!session) {
        console.error('Roles locations - No session found');
        return { error: NextResponse.json({ error: 'Forbidden - No session' }, { status: 403 }) };
    }
    if (!session.user) {
        console.error('Roles locations - No user in session:', session);
        return { error: NextResponse.json({ error: 'Forbidden - No user in session' }, { status: 403 }) };
    }
    const role = parseInt(session.user.role);
    if (![1, 2].includes(role)) {
        console.error('Roles locations - User is not admin. Role:', role);
        return { error: NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 }) };
    }
    return { session };
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const roleId = searchParams.get('role_id');
    const client = await connectToDatabase();

    try {
        // Check if efiling_role_locations table exists
        let hasRoleLocationsTable = false;
        try {
            const tableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'efiling_role_locations'
                );
            `);
            hasRoleLocationsTable = tableCheck.rows[0]?.exists || false;
        } catch (tableError) {
            console.warn('Could not check for efiling_role_locations table:', tableError.message);
        }

        if (!hasRoleLocationsTable) {
            return NextResponse.json({ success: true, locations: [] });
        }

        if (id) {
            const res = await client.query(
                `SELECT rl.*, r.name AS role_name, r.code AS role_code,
                        z.name AS zone_name, dist.title AS district_name,
                        t.town AS town_name, divs.name AS division_name
                 FROM efiling_role_locations rl
                 LEFT JOIN efiling_roles r ON rl.role_id = r.id
                 LEFT JOIN efiling_zones z ON rl.zone_id = z.id
                 LEFT JOIN district dist ON rl.district_id = dist.id
                 LEFT JOIN town t ON rl.town_id = t.id
                 LEFT JOIN divisions divs ON rl.division_id = divs.id
                 WHERE rl.id = $1`,
                [id]
            );
            if (res.rows.length === 0) {
                return NextResponse.json({ error: 'Role location not found' }, { status: 404 });
            }
            return NextResponse.json(res.rows[0]);
        }

        const params = [];
        let query = `
            SELECT rl.*, r.name AS role_name, r.code AS role_code,
                   z.name AS zone_name, dist.title AS district_name,
                   t.town AS town_name, divs.name AS division_name
            FROM efiling_role_locations rl
            LEFT JOIN efiling_roles r ON rl.role_id = r.id
            LEFT JOIN efiling_zones z ON rl.zone_id = z.id
            LEFT JOIN district dist ON rl.district_id = dist.id
            LEFT JOIN town t ON rl.town_id = t.id
            LEFT JOIN divisions divs ON rl.division_id = divs.id
            WHERE 1=1
        `;

        if (roleId) {
            params.push(roleId);
            query += ` AND rl.role_id = $${params.length}`;
        }

        query += ` ORDER BY r.name ASC, rl.id ASC`;
        const res = await client.query(query, params);
        return NextResponse.json({ success: true, locations: res.rows });
    } catch (error) {
        console.error('Error fetching role locations:', error);
        return NextResponse.json({ error: 'Failed to fetch role locations' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

export async function POST(request) {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const client = await connectToDatabase();
    try {
        const { role_id, zone_id, district_id, town_id, division_id } = await request.json();
        if (!role_id) {
            return NextResponse.json({ error: 'role_id is required' }, { status: 400 });
        }
        if (!zone_id && !district_id && !town_id && !division_id) {
            return NextResponse.json({ error: 'At least one of zone_id, district_id, town_id, division_id must be provided' }, { status: 400 });
        }

        const duplicate = await client.query(
            `SELECT id FROM efiling_role_locations
             WHERE role_id = $1
             AND zone_id IS NOT DISTINCT FROM $2
             AND district_id IS NOT DISTINCT FROM $3
             AND town_id IS NOT DISTINCT FROM $4
             AND division_id IS NOT DISTINCT FROM $5`,
            [role_id, zone_id || null, district_id || null, town_id || null, division_id || null]
        );
        if (duplicate.rows.length > 0) {
            return NextResponse.json({ error: 'Location mapping already exists for this role' }, { status: 409 });
        }

        const insertRes = await client.query(
            `INSERT INTO efiling_role_locations (
                role_id, zone_id, district_id, town_id, division_id, created_at
             ) VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING id`,
            [role_id, zone_id || null, district_id || null, town_id || null, division_id || null]
        );

        const id = insertRes.rows[0].id;
        const result = await client.query(
            `SELECT rl.*, r.name AS role_name, r.code AS role_code,
                    z.name AS zone_name, dist.title AS district_name,
                    t.town AS town_name, divs.name AS division_name
             FROM efiling_role_locations rl
             LEFT JOIN efiling_roles r ON rl.role_id = r.id
             LEFT JOIN efiling_zones z ON rl.zone_id = z.id
             LEFT JOIN district dist ON rl.district_id = dist.id
             LEFT JOIN town t ON rl.town_id = t.id
             LEFT JOIN divisions divs ON rl.division_id = divs.id
             WHERE rl.id = $1`,
            [id]
        );

        return NextResponse.json({ success: true, location: result.rows[0] }, { status: 201 });
    } catch (error) {
        console.error('Error creating role location:', error);
        return NextResponse.json({ error: 'Failed to create role location' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

export async function PUT(request) {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const client = await connectToDatabase();
    try {
        const { id, role_id, zone_id, district_id, town_id, division_id } = await request.json();
        if (!id || !role_id) {
            return NextResponse.json({ error: 'id and role_id are required' }, { status: 400 });
        }
        if (!zone_id && !district_id && !town_id && !division_id) {
            return NextResponse.json({ error: 'At least one of zone_id, district_id, town_id, division_id must be provided' }, { status: 400 });
        }

        const existing = await client.query(`SELECT id FROM efiling_role_locations WHERE id = $1`, [id]);
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Role location not found' }, { status: 404 });
        }

        const duplicate = await client.query(
            `SELECT id FROM efiling_role_locations
             WHERE role_id = $1 AND id <> $2
             AND zone_id IS NOT DISTINCT FROM $3
             AND district_id IS NOT DISTINCT FROM $4
             AND town_id IS NOT DISTINCT FROM $5
             AND division_id IS NOT DISTINCT FROM $6`,
            [role_id, id, zone_id || null, district_id || null, town_id || null, division_id || null]
        );
        if (duplicate.rows.length > 0) {
            return NextResponse.json({ error: 'Another mapping with the same location already exists for this role' }, { status: 409 });
        }

        await client.query(
            `UPDATE efiling_role_locations
             SET role_id = $2,
                 zone_id = $3,
                 district_id = $4,
                 town_id = $5,
                 division_id = $6
             WHERE id = $1`,
            [id, role_id, zone_id || null, district_id || null, town_id || null, division_id || null]
        );

        const result = await client.query(
            `SELECT rl.*, r.name AS role_name, r.code AS role_code,
                    z.name AS zone_name, dist.title AS district_name,
                    t.town AS town_name, divs.name AS division_name
             FROM efiling_role_locations rl
             LEFT JOIN efiling_roles r ON rl.role_id = r.id
             LEFT JOIN efiling_zones z ON rl.zone_id = z.id
             LEFT JOIN district dist ON rl.district_id = dist.id
             LEFT JOIN town t ON rl.town_id = t.id
             LEFT JOIN divisions divs ON rl.division_id = divs.id
             WHERE rl.id = $1`,
            [id]
        );

        return NextResponse.json({ success: true, location: result.rows[0] });
    } catch (error) {
        console.error('Error updating role location:', error);
        return NextResponse.json({ error: 'Failed to update role location' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

export async function DELETE(request) {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const client = await connectToDatabase();
    try {
        const res = await client.query(`DELETE FROM efiling_role_locations WHERE id = $1 RETURNING id`, [id]);
        if (res.rows.length === 0) {
            return NextResponse.json({ error: 'Role location not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting role location:', error);
        return NextResponse.json({ error: 'Failed to delete role location' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

