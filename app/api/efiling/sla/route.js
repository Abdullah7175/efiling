import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

/**
 * CRUD API for efiling_sla_matrix
 * GET: List all SLA matrix entries
 * POST: Create new SLA matrix entry
 */
export async function GET(request) {
    let client;
    try {
        client = await connectToDatabase();
        
        const { searchParams } = new URL(request.url);
        const fromRole = searchParams.get('from_role_code');
        const toRole = searchParams.get('to_role_code');
        const departmentId = searchParams.get('department_id');
        const activeOnly = searchParams.get('active_only') !== 'false';

        let query = `
            SELECT sm.id, sm.from_role_code, sm.to_role_code, sm.level_scope, sm.sla_hours, 
                   sm.description, sm.is_active, sm.department_id, sm.created_at, sm.updated_at,
                   d.name as department_name, d.code as department_code
            FROM efiling_sla_matrix sm
            LEFT JOIN efiling_departments d ON sm.department_id = d.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (activeOnly) {
            query += ` AND sm.is_active = $${paramIndex}`;
            params.push(true);
            paramIndex++;
        }

        if (fromRole) {
            query += ` AND sm.from_role_code = $${paramIndex}`;
            params.push(fromRole);
            paramIndex++;
        }

        if (toRole) {
            query += ` AND sm.to_role_code = $${paramIndex}`;
            params.push(toRole);
            paramIndex++;
        }

        if (departmentId) {
            // Show entries for this department OR global entries (department_id IS NULL)
            query += ` AND (sm.department_id = $${paramIndex} OR sm.department_id IS NULL)`;
            params.push(departmentId);
            paramIndex++;
        }

        query += ` ORDER BY sm.department_id NULLS LAST, sm.from_role_code, sm.to_role_code ASC`;

        const result = await client.query(query, params);
        
        return NextResponse.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching SLA matrix:', error);
        return NextResponse.json({ 
            error: error.message || 'Internal server error' 
        }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}

/**
 * POST: Create new SLA matrix entry
 */
export async function POST(request) {
    let client;
    try {
        // Check authentication - pass request to auth() for proper cookie reading
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // TODO: Add admin role check
        // const isAdmin = [1, 2].includes(token.user.role);
        // if (!isAdmin) {
        //     return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        // }

        const body = await request.json();
        const { from_role_code, to_role_code, level_scope = 'district', sla_hours = 24, description, department_id, is_active = true } = body;

        if (!from_role_code || !to_role_code) {
            return NextResponse.json({ 
                error: 'from_role_code and to_role_code are required' 
            }, { status: 400 });
        }

        if (typeof sla_hours !== 'number' || sla_hours < 0) {
            return NextResponse.json({ 
                error: 'sla_hours must be a positive number' 
            }, { status: 400 });
        }

        if (!['district', 'division', 'global'].includes(level_scope)) {
            return NextResponse.json({ 
                error: 'level_scope must be district, division, or global' 
            }, { status: 400 });
        }

        client = await connectToDatabase();
        
        const result = await client.query(`
            INSERT INTO efiling_sla_matrix (
                from_role_code, to_role_code, level_scope, sla_hours, 
                description, department_id, is_active, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
            RETURNING *
        `, [
            from_role_code.toUpperCase(), 
            to_role_code.toUpperCase(), 
            level_scope, 
            sla_hours, 
            description || null, 
            department_id || null,
            is_active
        ]);

        return NextResponse.json({
            success: true,
            message: 'SLA matrix entry created successfully',
            data: result.rows[0]
        }, { status: 201 });
    } catch (error) {
        console.error('Error creating SLA matrix:', error);
        if (error.code === '23505') { // Unique violation
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

