import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { eFileActionLogger, EFILING_ACTION_TYPES, EFILING_ENTITY_TYPES } from '@/lib/efilingActionLogger';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const department_id = searchParams.get('department_id');
    const is_active = searchParams.get('is_active');
    const role_prefix = searchParams.get('role_prefix');
    
    let client;
    try {
        client = await connectToDatabase();
        console.log('Database connected successfully');
        
        // First, check if the efiling_users table exists
        try {
            const tableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'efiling_users'
                );
            `);
            console.log('Users table exists check:', tableCheck.rows[0]);
            
            if (!tableCheck.rows[0].exists) {
                console.log('efiling_users table does not exist - returning empty array');
                return NextResponse.json([]);
            }
        } catch (tableError) {
            console.error('Error checking users table existence:', tableError);
            // Return empty array instead of error
            return NextResponse.json([]);
        }
        
        if (id) {
            const query = `
                SELECT u.*, d.name as department_name, d.department_type,
                       r.name as role_name, r.code as role_code,
                       dist.title as district_name,
                       t.town as town_name,
                       st.subtown as subtown_name,
                       div.name as division_name
                FROM efiling_users u
                LEFT JOIN efiling_departments d ON u.department_id = d.id
                LEFT JOIN efiling_roles r ON u.efiling_role_id = r.id
                LEFT JOIN district dist ON u.district_id = dist.id
                LEFT JOIN town t ON u.town_id = t.id
                LEFT JOIN subtown st ON u.subtown_id = st.id
                LEFT JOIN divisions div ON u.division_id = div.id
                WHERE u.id = $1
            `;
            const result = await client.query(query, [id]);
            
            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }
            
            return NextResponse.json(result.rows[0]);
        } else {
            let query = `
                SELECT u.*, d.name as department_name, d.department_type, 
                       r.name as role_name, r.code as role_code,
                       dist.title as district_name,
                       t.town as town_name,
                       st.subtown as subtown_name,
                       div.name as division_name
                FROM efiling_users u
                LEFT JOIN efiling_departments d ON u.department_id = d.id
                LEFT JOIN efiling_roles r ON u.efiling_role_id = r.id
                LEFT JOIN district dist ON u.district_id = dist.id
                LEFT JOIN town t ON u.town_id = t.id
                LEFT JOIN subtown st ON u.subtown_id = st.id
                LEFT JOIN divisions div ON u.division_id = div.id
            `;
            const params = [];
            const conditions = [];
            let paramIndex = 1;
            
            if (department_id) {
                conditions.push(`u.department_id = $${paramIndex}`);
                params.push(department_id);
                paramIndex++;
            }
            
            if (is_active !== null && is_active !== undefined) {
                conditions.push(`u.is_active = $${paramIndex}`);
                params.push(is_active === 'true');
                paramIndex++;
            }

            if (role_prefix) {
                conditions.push(`r.code ILIKE $${paramIndex}`);
                params.push(`${role_prefix}%`);
                paramIndex++;
            }
            
            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }
            
            query += ` ORDER BY u.employee_id ASC`;
            
            console.log('Executing users query:', query);
            console.log('Query parameters:', params);
            
            const result = await client.query(query, params);
            console.log('Users query result rows:', result.rows.length);
            
            return NextResponse.json(result.rows);
        }
    } catch (error) {
        console.error('Database error in GET /api/efiling/users:', error);
        console.error('Error stack:', error.stack);
        // Return empty array instead of 500 error to prevent frontend crash
        return NextResponse.json([]);
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function POST(request) {
    let client;
    try {
        client = await connectToDatabase();
        const body = await request.json();
        const { 
            user_id, 
            employee_id, 
            designation, 
            department_id, 
            efiling_role_id, 
            supervisor_id,
            district_id,
            town_id,
            subtown_id,
            division_id
        } = body;
        
        // Validate required fields
        if (!user_id || !department_id || !efiling_role_id) {
            return NextResponse.json({ 
                error: 'User ID, department, and role are required' 
            }, { status: 400 });
        }
        
        // Check if user already has e-filing access
        const existingUser = await client.query(
            'SELECT id FROM efiling_users WHERE user_id = $1',
            [user_id]
        );
        
        if (existingUser.rows.length > 0) {
            return NextResponse.json({ 
                error: 'User already has e-filing access' 
            }, { status: 400 });
        }
        
        // Check if employee ID already exists
        if (employee_id) {
            const existingEmployee = await client.query(
                'SELECT id FROM efiling_users WHERE employee_id = $1',
                [employee_id]
            );
            
            if (existingEmployee.rows.length > 0) {
                return NextResponse.json({ 
                    error: 'Employee ID already exists' 
                }, { status: 400 });
            }
        }
        
        const districtId = body.district_id || null;
        const townId = body.town_id || null;
        const subtownId = body.subtown_id || null;
        const divisionId = body.division_id || null;

        const query = `
            INSERT INTO efiling_users (
                user_id, employee_id, designation, department_id, 
                efiling_role_id, supervisor_id,
                district_id, town_id, subtown_id, division_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `;
        
        const result = await client.query(query, [
            user_id, employee_id, designation, department_id, 
            efiling_role_id, supervisor_id,
            districtId, townId, subtownId, divisionId
        ]);
        
        // Log the action
        await eFileActionLogger.logAction(request, EFILING_ACTION_TYPES.CREATE, EFILING_ENTITY_TYPES.EFILING_USER, {
            entityId: result.rows[0].id,
            entityName: `User ${employee_id || user_id}`,
            details: { user_id, employee_id, designation }
        });
        
        return NextResponse.json(result.rows[0], { status: 201 });
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function PUT(request) {
    let client;
    try {
        client = await connectToDatabase();
        const body = await request.json();
        const { 
            id, employee_id, designation, department_id, 
            efiling_role_id, supervisor_id, is_active, is_consultant,
            district_id, town_id, subtown_id, division_id
        } = body;
        
        if (!id) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }
        
        // Check if user exists
        const existing = await client.query(
            'SELECT * FROM efiling_users WHERE id = $1',
            [id]
        );
        
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        
        // For consultants, employee_id, designation, and department_id should be null
        // For KWSC employees, these fields are required
        if (is_consultant && (employee_id || designation || department_id)) {
            return NextResponse.json({ 
                error: 'Consultants cannot have employee ID, designation, or department' 
            }, { status: 400 });
        }
        
        if (!is_consultant && (!employee_id || !department_id)) {
            return NextResponse.json({ 
                error: 'KWSC employees must have employee ID and department' 
            }, { status: 400 });
        }
        
        // Check if employee ID already exists (excluding current user and only for KWSC employees)
        if (!is_consultant && employee_id) {
            const existingEmployee = await client.query(
                'SELECT id FROM efiling_users WHERE employee_id = $1 AND id != $2',
                [employee_id, id]
            );
            
            if (existingEmployee.rows.length > 0) {
                return NextResponse.json({ 
                    error: 'Employee ID already exists' 
                }, { status: 400 });
            }
        }
        
        const query = `
            UPDATE efiling_users 
            SET employee_id = $2,
                designation = $3,
                department_id = $4,
                efiling_role_id = $5,
                supervisor_id = $6,
                is_active = $7,
                is_consultant = $8,
                district_id = $9,
                town_id = $10,
                subtown_id = $11,
                division_id = $12,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `;
        
        const result = await client.query(query, [
            id, 
            is_consultant ? null : employee_id, 
            is_consultant ? null : designation, 
            is_consultant ? null : department_id, 
            efiling_role_id, 
            supervisor_id, 
            is_active,
            is_consultant,
            is_consultant ? null : (district_id || null),
            is_consultant ? null : (town_id || null),
            is_consultant ? null : (subtown_id || null),
            is_consultant ? null : (division_id || null)
        ]);
        
        // Log the action
        await eFileActionLogger.logAction(request, EFILING_ACTION_TYPES.UPDATE, EFILING_ENTITY_TYPES.EFILING_USER, {
            entityId: id,
            entityName: `User ${is_consultant ? '(Consultant)' : (employee_id || id)}`,
            details: { 
                employee_id: is_consultant ? null : employee_id, 
                designation: is_consultant ? null : designation,
                is_consultant 
            }
        });
        
        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function DELETE(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    let client;
    try {
        client = await connectToDatabase();
        // Check if user exists
        const existing = await client.query(
            'SELECT * FROM efiling_users WHERE id = $1',
            [id]
        );
        
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        
        // Check if user has assigned files
        const filesCount = await client.query(
            'SELECT COUNT(*) FROM efiling_files WHERE assigned_to = $1 OR created_by = $1',
            [id]
        );
        
        if (parseInt(filesCount.rows[0].count) > 0) {
            return NextResponse.json({ 
                error: 'Cannot delete user with assigned files' 
            }, { status: 400 });
        }
        
        await client.query('DELETE FROM efiling_users WHERE id = $1', [id]);
        
        // Log the action
        await eFileActionLogger.logAction(request, EFILING_ACTION_TYPES.DELETE, EFILING_ENTITY_TYPES.EFILING_USER, {
            entityId: id,
            entityName: `User ${existing.rows[0].employee_id || id}`,
            details: { employee_id: existing.rows[0].employee_id }
        });
        
        return NextResponse.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
} 