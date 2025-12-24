import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

/**
 * PUT: Update SLA matrix entry
 * DELETE: Delete SLA matrix entry
 */
export async function PUT(request, { params }) {
    let client;
    try {
        const { id } = await params;
        
        // Check authentication - pass request to auth() for proper cookie reading
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // TODO: Add admin role check

        const body = await request.json();
        const updates = {};
        const allowedFields = ['from_role_code', 'to_role_code', 'level_scope', 'sla_hours', 'description', 'department_id', 'is_active'];
        
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                if (field === 'sla_hours' && (typeof body[field] !== 'number' || body[field] < 0)) {
                    return NextResponse.json({ 
                        error: 'sla_hours must be a positive number' 
                    }, { status: 400 });
                }
                if (field === 'level_scope' && !['district', 'division', 'global'].includes(body[field])) {
                    return NextResponse.json({ 
                        error: 'level_scope must be district, division, or global' 
                    }, { status: 400 });
                }
                updates[field] = body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ 
                error: 'No valid fields to update' 
            }, { status: 400 });
        }

        client = await connectToDatabase();
        
        // Convert role codes to uppercase if provided
        if (updates.from_role_code) updates.from_role_code = updates.from_role_code.toUpperCase();
        if (updates.to_role_code) updates.to_role_code = updates.to_role_code.toUpperCase();
        
        const setClause = Object.keys(updates).map((key, idx) => `${key} = $${idx + 2}`).join(', ');
        const values = Object.values(updates);
        values.unshift(id);

        const result = await client.query(`
            UPDATE efiling_sla_matrix
            SET ${setClause}, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, values);

        // Fetch with department name for response
        if (result.rows.length > 0) {
            const withDept = await client.query(`
                SELECT sm.*, d.name as department_name, d.code as department_code
                FROM efiling_sla_matrix sm
                LEFT JOIN efiling_departments d ON sm.department_id = d.id
                WHERE sm.id = $1
            `, [id]);
            if (withDept.rows.length > 0) {
                result.rows[0] = withDept.rows[0];
            }
        }

        if (result.rows.length === 0) {
            return NextResponse.json({ 
                error: 'SLA matrix entry not found' 
            }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            message: 'SLA matrix entry updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating SLA matrix:', error);
        if (error.code === '23505') {
            return NextResponse.json({ 
                error: 'SLA matrix entry already exists for this role pair' 
            }, { status: 409 });
        }
        return NextResponse.json({ 
            error: error.message || 'Internal server error' 
        }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}

/**
 * DELETE: Delete SLA matrix entry (soft delete by setting is_active = false)
 */
export async function DELETE(request, { params }) {
    let client;
    try {
        const { id } = await params;
        
        // Check authentication - pass request to auth() for proper cookie reading
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // TODO: Add admin role check

        client = await connectToDatabase();
        
        // Soft delete by setting is_active = false
        const result = await client.query(`
            UPDATE efiling_sla_matrix
            SET is_active = false, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id]);

        if (result.rows.length === 0) {
            return NextResponse.json({ 
                error: 'SLA matrix entry not found' 
            }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            message: 'SLA matrix entry deleted successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error deleting SLA matrix:', error);
        return NextResponse.json({ 
            error: error.message || 'Internal server error' 
        }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}

