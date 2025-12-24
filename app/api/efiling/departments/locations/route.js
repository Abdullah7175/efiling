import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

async function requireAdmin() {
    const session = await auth();
    if (!session) {
        console.error('Departments locations - No session found');
        return { error: NextResponse.json({ error: 'Forbidden - No session' }, { status: 403 }) };
    }
    if (!session.user) {
        console.error('Departments locations - No user in session:', session);
        return { error: NextResponse.json({ error: 'Forbidden - No user in session' }, { status: 403 }) };
    }
    const role = parseInt(session.user.role);
    if (![1, 2].includes(role)) {
        console.error('Departments locations - User is not admin. Role:', role);
        return { error: NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 }) };
    }
    return { session };
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const departmentId = searchParams.get('department_id');
    const client = await connectToDatabase();

    try {
        if (id) {
            const res = await client.query(
                `SELECT dl.*, d.name AS department_name, d.code AS department_code,
                        z.name AS zone_name, dist.title AS district_name,
                        t.town AS town_name, divs.name AS division_name
                 FROM efiling_department_locations dl
                 LEFT JOIN efiling_departments d ON dl.department_id = d.id
                 LEFT JOIN efiling_zones z ON dl.zone_id = z.id
                 LEFT JOIN district dist ON dl.district_id = dist.id
                 LEFT JOIN town t ON dl.town_id = t.id
                 LEFT JOIN divisions divs ON dl.division_id = divs.id
                 WHERE dl.id = $1`,
                [id]
            );
            if (res.rows.length === 0) {
                return NextResponse.json({ error: 'Department location not found' }, { status: 404 });
            }
            return NextResponse.json(res.rows[0]);
        }

        const params = [];
        let query = `
            SELECT dl.*, d.name AS department_name, d.code AS department_code,
                   z.name AS zone_name, dist.title AS district_name,
                   t.town AS town_name, divs.name AS division_name
            FROM efiling_department_locations dl
            LEFT JOIN efiling_departments d ON dl.department_id = d.id
            LEFT JOIN efiling_zones z ON dl.zone_id = z.id
            LEFT JOIN district dist ON dl.district_id = dist.id
            LEFT JOIN town t ON dl.town_id = t.id
            LEFT JOIN divisions divs ON dl.division_id = divs.id
            WHERE 1=1
        `;

        if (departmentId) {
            params.push(departmentId);
            query += ` AND dl.department_id = $${params.length}`;
        }

        query += ` ORDER BY d.name ASC, dl.id ASC`;
        const res = await client.query(query, params);
        return NextResponse.json({ success: true, locations: res.rows });
    } catch (error) {
        console.error('Error fetching department locations:', error);
        return NextResponse.json({ error: 'Failed to fetch department locations' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

export async function POST(request) {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const client = await connectToDatabase();
    try {
        const { department_id, zone_id, district_id, town_id, division_id } = await request.json();
        if (!department_id) {
            return NextResponse.json({ error: 'department_id is required' }, { status: 400 });
        }
        if (!zone_id && !district_id && !town_id && !division_id) {
            return NextResponse.json({ error: 'At least one of zone_id, district_id, town_id, division_id must be provided' }, { status: 400 });
        }

        const duplicate = await client.query(
            `SELECT id FROM efiling_department_locations
             WHERE department_id = $1
             AND zone_id IS NOT DISTINCT FROM $2
             AND district_id IS NOT DISTINCT FROM $3
             AND town_id IS NOT DISTINCT FROM $4
             AND division_id IS NOT DISTINCT FROM $5`,
            [department_id, zone_id || null, district_id || null, town_id || null, division_id || null]
        );
        if (duplicate.rows.length > 0) {
            return NextResponse.json({ error: 'Location mapping already exists for this department' }, { status: 409 });
        }

        const insertRes = await client.query(
            `INSERT INTO efiling_department_locations (
                department_id, zone_id, district_id, town_id, division_id, created_at
             ) VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING id`,
            [department_id, zone_id || null, district_id || null, town_id || null, division_id || null]
        );

        const id = insertRes.rows[0].id;
        const result = await client.query(
            `SELECT dl.*, d.name AS department_name, d.code AS department_code,
                    z.name AS zone_name, dist.title AS district_name,
                    t.town AS town_name, divs.name AS division_name
             FROM efiling_department_locations dl
             LEFT JOIN efiling_departments d ON dl.department_id = d.id
             LEFT JOIN efiling_zones z ON dl.zone_id = z.id
             LEFT JOIN district dist ON dl.district_id = dist.id
             LEFT JOIN town t ON dl.town_id = t.id
             LEFT JOIN divisions divs ON dl.division_id = divs.id
             WHERE dl.id = $1`,
            [id]
        );

        return NextResponse.json({ success: true, location: result.rows[0] }, { status: 201 });
    } catch (error) {
        console.error('Error creating department location:', error);
        return NextResponse.json({ error: 'Failed to create department location' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

export async function PUT(request) {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const client = await connectToDatabase();
    try {
        const { id, department_id, zone_id, district_id, town_id, division_id } = await request.json();
        if (!id || !department_id) {
            return NextResponse.json({ error: 'id and department_id are required' }, { status: 400 });
        }
        if (!zone_id && !district_id && !town_id && !division_id) {
            return NextResponse.json({ error: 'At least one of zone_id, district_id, town_id, division_id must be provided' }, { status: 400 });
        }

        const existing = await client.query(`SELECT id FROM efiling_department_locations WHERE id = $1`, [id]);
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Department location not found' }, { status: 404 });
        }

        const duplicate = await client.query(
            `SELECT id FROM efiling_department_locations
             WHERE department_id = $1 AND id <> $2
             AND zone_id IS NOT DISTINCT FROM $3
             AND district_id IS NOT DISTINCT FROM $4
             AND town_id IS NOT DISTINCT FROM $5
             AND division_id IS NOT DISTINCT FROM $6`,
            [department_id, id, zone_id || null, district_id || null, town_id || null, division_id || null]
        );
        if (duplicate.rows.length > 0) {
            return NextResponse.json({ error: 'Another mapping with the same location already exists for this department' }, { status: 409 });
        }

        await client.query(
            `UPDATE efiling_department_locations
             SET department_id = $2,
                 zone_id = $3,
                 district_id = $4,
                 town_id = $5,
                 division_id = $6
             WHERE id = $1`,
            [id, department_id, zone_id || null, district_id || null, town_id || null, division_id || null]
        );

        const result = await client.query(
            `SELECT dl.*, d.name AS department_name, d.code AS department_code,
                    z.name AS zone_name, dist.title AS district_name,
                    t.town AS town_name, divs.name AS division_name
             FROM efiling_department_locations dl
             LEFT JOIN efiling_departments d ON dl.department_id = d.id
             LEFT JOIN efiling_zones z ON dl.zone_id = z.id
             LEFT JOIN district dist ON dl.district_id = dist.id
             LEFT JOIN town t ON dl.town_id = t.id
             LEFT JOIN divisions divs ON dl.division_id = divs.id
             WHERE dl.id = $1`,
            [id]
        );

        return NextResponse.json({ success: true, location: result.rows[0] });
    } catch (error) {
        console.error('Error updating department location:', error);
        return NextResponse.json({ error: 'Failed to update department location' }, { status: 500 });
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
        const res = await client.query(`DELETE FROM efiling_department_locations WHERE id = $1 RETURNING id`, [id]);
        if (res.rows.length === 0) {
            return NextResponse.json({ error: 'Department location not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting department location:', error);
        return NextResponse.json({ error: 'Failed to delete department location' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

