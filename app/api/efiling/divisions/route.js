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

export async function GET(request) {
    // SECURITY: Require authentication
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const isActive = searchParams.get('is_active');
    const departmentId = searchParams.get('department_id');
    const client = await connectToDatabase();

    try {
        if (id) {
            const res = await client.query(`SELECT * FROM divisions WHERE id = $1`, [id]);
            if (res.rows.length === 0) {
                return NextResponse.json({ error: 'Division not found' }, { status: 404 });
            }
            return NextResponse.json(res.rows[0]);
        }

        const params = [];
        let query = `SELECT * FROM divisions WHERE 1=1`;
        if (isActive !== null) {
            params.push(isActive === 'true');
            query += ` AND is_active = $${params.length}`;
        }
        if (departmentId) {
            params.push(departmentId);
            query += ` AND department_id = $${params.length}`;
        }
        query += ' ORDER BY name ASC';
        const res = await client.query(query, params);
        return NextResponse.json({ success: true, divisions: res.rows });
    } catch (error) {
        console.error('Error fetching divisions:', error);
        return NextResponse.json({ error: 'Failed to fetch divisions' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

export async function POST(request) {
    const authResult = await requireAdmin(request);
    if (authResult.error) return authResult.error;

    const client = await connectToDatabase();
    try {
        const { name, code, ce_type, department_id, description, is_active = true } = await request.json();
        if (!name) {
            return NextResponse.json({ error: 'Division name is required' }, { status: 400 });
        }

        const duplicate = await client.query(`SELECT id FROM divisions WHERE name ILIKE $1`, [name]);
        if (duplicate.rows.length > 0) {
            return NextResponse.json({ error: 'Division with this name already exists' }, { status: 409 });
        }

        const codeDuplicate = code
            ? await client.query(`SELECT id FROM divisions WHERE code ILIKE $1`, [code])
            : { rows: [] };
        if (code && codeDuplicate.rows.length > 0) {
            return NextResponse.json({ error: 'Division with this code already exists' }, { status: 409 });
        }

        const res = await client.query(
            `INSERT INTO divisions (name, code, ce_type, department_id, description, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
             RETURNING *`,
            [name, code || null, ce_type || null, department_id || null, description || null, is_active]
        );

        return NextResponse.json({ success: true, division: res.rows[0] }, { status: 201 });
    } catch (error) {
        console.error('Error creating division:', error);
        return NextResponse.json({ error: 'Failed to create division' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

export async function PUT(request) {
    const authResult = await requireAdmin(request);
    if (authResult.error) return authResult.error;

    const client = await connectToDatabase();
    try {
        const { id, name, code, ce_type, department_id, description, is_active } = await request.json();
        if (!id) {
            return NextResponse.json({ error: 'Division id is required' }, { status: 400 });
        }

        const existing = await client.query(`SELECT * FROM divisions WHERE id = $1`, [id]);
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Division not found' }, { status: 404 });
        }

        if (name) {
            const dup = await client.query(`SELECT id FROM divisions WHERE name ILIKE $1 AND id <> $2`, [name, id]);
            if (dup.rows.length > 0) {
                return NextResponse.json({ error: 'Another division with this name already exists' }, { status: 409 });
            }
        }
        if (code) {
            const dupCode = await client.query(`SELECT id FROM divisions WHERE code ILIKE $1 AND id <> $2`, [code, id]);
            if (dupCode.rows.length > 0) {
                return NextResponse.json({ error: 'Another division with this code already exists' }, { status: 409 });
            }
        }

        const res = await client.query(
            `UPDATE divisions
             SET name = COALESCE($2, name),
                 code = COALESCE($3, code),
                 ce_type = COALESCE($4, ce_type),
                 department_id = COALESCE($5, department_id),
                 description = COALESCE($6, description),
                 is_active = COALESCE($7, is_active),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [id, name || null, code || null, ce_type || null, department_id || null, description || null, typeof is_active === 'boolean' ? is_active : null]
        );

        return NextResponse.json({ success: true, division: res.rows[0] });
    } catch (error) {
        console.error('Error updating division:', error);
        return NextResponse.json({ error: 'Failed to update division' }, { status: 500 });
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
        return NextResponse.json({ error: 'Division id is required' }, { status: 400 });
    }

    const client = await connectToDatabase();
    try {
        const references = await client.query(
            `SELECT (
                SELECT COUNT(*) FROM efiling_users WHERE division_id = $1
            ) + (
                SELECT COUNT(*) FROM efiling_department_locations WHERE division_id = $1
            ) + (
                SELECT COUNT(*) FROM efiling_role_locations WHERE division_id = $1
            ) + (
                SELECT COUNT(*) FROM efiling_role_group_locations WHERE division_id = $1
            ) AS ref_count`,
            [id]
        );

        if (parseInt(references.rows[0].ref_count, 10) > 0) {
            return NextResponse.json({ error: 'Cannot delete division with existing references' }, { status: 409 });
        }

        const res = await client.query(`DELETE FROM divisions WHERE id = $1 RETURNING id`, [id]);
        if (res.rows.length === 0) {
            return NextResponse.json({ error: 'Division not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting division:', error);
        return NextResponse.json({ error: 'Failed to delete division' }, { status: 500 });
    } finally {
        client.release?.();
    }
}

