import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

async function requireAdmin() {
    const session = await auth();
    if (!session) {
        console.error('Role groups locations - No session found');
        return { error: NextResponse.json({ error: 'Forbidden - No session' }, { status: 403 }) };
    }
    if (!session.user) {
        console.error('Role groups locations - No user in session:', session);
        return { error: NextResponse.json({ error: 'Forbidden - No user in session' }, { status: 403 }) };
    }
    const role = parseInt(session.user.role);
    if (![1, 2].includes(role)) {
        console.error('Role groups locations - User is not admin. Role:', role);
        return { error: NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 }) };
    }
    return { session };
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const roleGroupId = searchParams.get('role_group_id');
    const client = await connectToDatabase();

    try {
        if (id) {
            const res = await client.query(
                `SELECT rgl.*, rg.name AS role_group_name, rg.code AS role_group_code,
                        z.name AS zone_name, dist.title AS district_name,
                        t.town AS town_name, divs.name AS division_name
                 FROM efiling_role_group_locations rgl
                 LEFT JOIN efiling_role_groups rg ON rgl.role_group_id = rg.id
                 LEFT JOIN efiling_zones z ON rgl.zone_id = z.id
                 LEFT JOIN district dist ON rgl.district_id = dist.id
                 LEFT JOIN town t ON rgl.town_id = t.id
                 LEFT JOIN divisions divs ON rgl.division_id = divs.id
                 WHERE rgl.id = $1`,
                [id]
            );
            if (res.rows.length === 0) {
                return NextResponse.json({ error: 'Role group location not found' }, { status: 404 });
            }
            return NextResponse.json(res.rows[0]);
        }

        const params = [];
        let query = `
            SELECT rgl.*, rg.name AS role_group_name, rg.code AS role_group_code,
                   z.name AS zone_name, dist.title AS district_name,
                   t.town AS town_name, divs.name AS division_name
            FROM efiling_role_group_locations rgl
            LEFT JOIN efiling_role_groups rg ON rgl.role_group_id = rg.id
            LEFT JOIN efiling_zones z ON rgl.zone_id = z.id
            LEFT JOIN district dist ON rgl.district_id = dist.id
            LEFT JOIN town t ON rgl.town_id = t.id
            LEFT JOIN divisions divs ON rgl.division_id = divs.id
            WHERE 1=1
        `;

        if (roleGroupId) {
            params.push(roleGroupId);
            query += ` AND rgl.role_group_id = $${params.length}`;
        }

        query += ` ORDER BY rg.name ASC, rgl.id ASC`;
        const res = await client.query(query, params);
        return NextResponse.json({ success: true, locations: res.rows });
    } catch (error) {
        console.error('Error fetching role group locations:', error);
        return NextResponse.json({ error: 'Failed to fetch role group locations' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

export async function POST(request) {
    console.log('Role groups locations POST - Starting authentication check');
    const authResult = await requireAdmin();
    if (authResult.error) {
        console.log('Role groups locations POST - Authentication failed, returning error');
        return authResult.error;
    }
    console.log('Role groups locations POST - Authentication successful, user ID:', authResult.session?.user?.id, 'Role:', authResult.session?.user?.role);

    const client = await connectToDatabase();
    try {
        const { role_group_id, zone_id, district_id, town_id, division_id } = await request.json();
        if (!role_group_id) {
            return NextResponse.json({ error: 'role_group_id is required' }, { status: 400 });
        }
        if (!zone_id && !district_id && !town_id && !division_id) {
            return NextResponse.json({ error: 'At least one of zone_id, district_id, town_id, division_id must be provided' }, { status: 400 });
        }

        const duplicate = await client.query(
            `SELECT id FROM efiling_role_group_locations
             WHERE role_group_id = $1
             AND zone_id IS NOT DISTINCT FROM $2
             AND district_id IS NOT DISTINCT FROM $3
             AND town_id IS NOT DISTINCT FROM $4
             AND division_id IS NOT DISTINCT FROM $5`,
            [role_group_id, zone_id || null, district_id || null, town_id || null, division_id || null]
        );
        if (duplicate.rows.length > 0) {
            return NextResponse.json({ error: 'Location mapping already exists for this role group' }, { status: 409 });
        }

        const insertRes = await client.query(
            `INSERT INTO efiling_role_group_locations (
                role_group_id, zone_id, district_id, town_id, division_id, created_at
             ) VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING id`,
            [role_group_id, zone_id || null, district_id || null, town_id || null, division_id || null]
        );

        const id = insertRes.rows[0].id;
        const result = await client.query(
            `SELECT rgl.*, rg.name AS role_group_name, rg.code AS role_group_code,
                    z.name AS zone_name, dist.title AS district_name,
                    t.town AS town_name, divs.name AS division_name
             FROM efiling_role_group_locations rgl
             LEFT JOIN efiling_role_groups rg ON rgl.role_group_id = rg.id
             LEFT JOIN efiling_zones z ON rgl.zone_id = z.id
             LEFT JOIN district dist ON rgl.district_id = dist.id
             LEFT JOIN town t ON rgl.town_id = t.id
             LEFT JOIN divisions divs ON rgl.division_id = divs.id
             WHERE rgl.id = $1`,
            [id]
        );

        return NextResponse.json({ success: true, location: result.rows[0] }, { status: 201 });
    } catch (error) {
        console.error('Error creating role group location:', error);
        return NextResponse.json({ error: 'Failed to create role group location' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

export async function PUT(request) {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const client = await connectToDatabase();
    try {
        const { id, role_group_id, zone_id, district_id, town_id, division_id } = await request.json();
        if (!id || !role_group_id) {
            return NextResponse.json({ error: 'id and role_group_id are required' }, { status: 400 });
        }
        if (!zone_id && !district_id && !town_id && !division_id) {
            return NextResponse.json({ error: 'At least one of zone_id, district_id, town_id, division_id must be provided' }, { status: 400 });
        }

        const existing = await client.query(`SELECT id FROM efiling_role_group_locations WHERE id = $1`, [id]);
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Role group location not found' }, { status: 404 });
        }

        const duplicate = await client.query(
            `SELECT id FROM efiling_role_group_locations
             WHERE role_group_id = $1 AND id <> $2
             AND zone_id IS NOT DISTINCT FROM $3
             AND district_id IS NOT DISTINCT FROM $4
             AND town_id IS NOT DISTINCT FROM $5
             AND division_id IS NOT DISTINCT FROM $6`,
            [role_group_id, id, zone_id || null, district_id || null, town_id || null, division_id || null]
        );
        if (duplicate.rows.length > 0) {
            return NextResponse.json({ error: 'Another mapping with the same location already exists for this role group' }, { status: 409 });
        }

        await client.query(
            `UPDATE efiling_role_group_locations
             SET role_group_id = $2,
                 zone_id = $3,
                 district_id = $4,
                 town_id = $5,
                 division_id = $6
             WHERE id = $1`,
            [id, role_group_id, zone_id || null, district_id || null, town_id || null, division_id || null]
        );

        const result = await client.query(
            `SELECT rgl.*, rg.name AS role_group_name, rg.code AS role_group_code,
                    z.name AS zone_name, dist.title AS district_name,
                    t.town AS town_name, divs.name AS division_name
             FROM efiling_role_group_locations rgl
             LEFT JOIN efiling_role_groups rg ON rgl.role_group_id = rg.id
             LEFT JOIN efiling_zones z ON rgl.zone_id = z.id
             LEFT JOIN district dist ON rgl.district_id = dist.id
             LEFT JOIN town t ON rgl.town_id = t.id
             LEFT JOIN divisions divs ON rgl.division_id = divs.id
             WHERE rgl.id = $1`,
            [id]
        );

        return NextResponse.json({ success: true, location: result.rows[0] });
    } catch (error) {
        console.error('Error updating role group location:', error);
        return NextResponse.json({ error: 'Failed to update role group location' }, { status: 500 });
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
        const res = await client.query(`DELETE FROM efiling_role_group_locations WHERE id = $1 RETURNING id`, [id]);
        if (res.rows.length === 0) {
            return NextResponse.json({ error: 'Role group location not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting role group location:', error);
        return NextResponse.json({ error: 'Failed to delete role group location' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

