import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { eFileActionLogger, EFILING_ACTION_TYPES, EFILING_ENTITY_TYPES } from '@/lib/efilingActionLogger';
import { auth } from '@/auth';
import { getUserGeography, isGlobalRoleCode } from '@/lib/efilingGeographicRouting';

export async function GET(request) {
    // SECURITY: Require authentication
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const is_active = searchParams.get('is_active');
    
    let client;
    try {
        client = await connectToDatabase();
        console.log('Database connected successfully');
        
        // First, check if the efiling_departments table exists
        try {
            const tableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'efiling_departments'
                );
            `);
            console.log('Departments table exists check:', tableCheck.rows[0]);
            
            if (!tableCheck.rows[0].exists) {
                console.log('efiling_departments table does not exist - returning empty array');
                return NextResponse.json([]);
            }
        } catch (tableError) {
            console.error('Error checking departments table existence:', tableError);
            // Return empty array instead of error
            return NextResponse.json([]);
        }
        
        const session = await auth();
        let userGeography = null;
        let canSeeAll = false;

        if (session?.user) {
            if ([1, 2].includes(parseInt(session.user.role))) {
                canSeeAll = true;
            } else {
                userGeography = await getUserGeography(client, session.user.id);
                if (userGeography && isGlobalRoleCode(userGeography.role_code)) {
                    canSeeAll = true;
                }
            }
        }

        if (id) {
            const query = `
                SELECT d.*, 
                       p.name as parent_department_name,
                       COUNT(DISTINCT u.id) as user_count
                FROM efiling_departments d
                LEFT JOIN efiling_departments p ON d.parent_department_id = p.id
                LEFT JOIN efiling_users u ON d.id = u.department_id AND u.is_active = true
                LEFT JOIN efiling_department_locations dl ON dl.department_id = d.id
                WHERE d.id = $1
                GROUP BY d.id, p.name
            `;
            const result = await client.query(query, [id]);
            
            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Department not found' }, { status: 404 });
            }
            
            return NextResponse.json(result.rows[0]);
        } else {
            let query = `
                SELECT d.*, 
                       p.name as parent_department_name,
                       COUNT(DISTINCT u.id) as user_count
                FROM efiling_departments d
                LEFT JOIN efiling_departments p ON d.parent_department_id = p.id
                LEFT JOIN efiling_users u ON d.id = u.department_id AND u.is_active = true
                LEFT JOIN efiling_department_locations dl ON dl.department_id = d.id
            `;
            const params = [];
            const conditions = [];
            let paramIndex = 1;
            
            if (is_active !== null && is_active !== undefined) {
                conditions.push(`d.is_active = $${paramIndex}`);
                params.push(is_active === 'true');
                paramIndex++;
            }

            if (!canSeeAll && userGeography) {
                const locationParts = [];
                const pushParam = (value) => {
                    params.push(value);
                    return `$${params.length}`;
                };

                if (userGeography.zone_ids && userGeography.zone_ids.length > 0) {
                    const placeholder = pushParam(userGeography.zone_ids);
                    locationParts.push(`dl.zone_id = ANY(${placeholder}::int[])`);
                }
                if (userGeography.division_id) {
                    locationParts.push(`dl.division_id = ${pushParam(userGeography.division_id)}`);
                }
                if (userGeography.district_id) {
                    locationParts.push(`dl.district_id = ${pushParam(userGeography.district_id)}`);
                }
                if (userGeography.town_id) {
                    locationParts.push(`dl.town_id = ${pushParam(userGeography.town_id)}`);
                }

                if (locationParts.length > 0) {
                    conditions.push(`(dl.id IS NULL OR ${locationParts.join(' OR ')})`);
                }
            }
            
            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }
            
            query += ` GROUP BY d.id, p.name ORDER BY d.name ASC`;
            
            console.log('Executing departments query:', query);
            console.log('Query parameters:', params);
            
            const result = await client.query(query, params);
            console.log('Departments query result rows:', result.rows.length);
            
            return NextResponse.json(result.rows);
        }
    } catch (error) {
        console.error('Database error in GET /api/efiling/departments:', error);
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
        const { name, code, description, parent_department_id } = body;
        
        // Validate required fields
        if (!name || !code) {
            return NextResponse.json({ error: 'Name and code are required' }, { status: 400 });
        }
        
        // Check if code already exists
        const existingCode = await client.query(
            'SELECT id FROM efiling_departments WHERE code = $1',
            [code]
        );
        
        if (existingCode.rows.length > 0) {
            return NextResponse.json({ error: 'Department code already exists' }, { status: 400 });
        }
        
        const query = `
            INSERT INTO efiling_departments (name, code, description, parent_department_id)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        
        const result = await client.query(query, [name, code, description, parent_department_id]);
        
        // Log the action
        try {
            await eFileActionLogger.logAction({
                entityId: null,
                userId: 'system', // Since this is system-level action
                action: 'DEPARTMENT_CREATED',
                entityType: 'efiling_department',
                details: { 
                    name, 
                    code, 
                    description, 
                    parent_department_id,
                    description: `Department "${name}" (${code}) created`
                }
            });
        } catch (logError) {
            console.error('Error logging department creation action:', logError);
        }
        
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
        const { id, name, code, description, parent_department_id, is_active } = body;
        
        if (!id) {
            return NextResponse.json({ error: 'Department ID is required' }, { status: 400 });
        }
        
        // Check if department exists
        const existing = await client.query(
            'SELECT * FROM efiling_departments WHERE id = $1',
            [id]
        );
        
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Department not found' }, { status: 404 });
        }
        
        // Check if code already exists (excluding current department)
        if (code) {
            const existingCode = await client.query(
                'SELECT id FROM efiling_departments WHERE code = $1 AND id != $2',
                [code, id]
            );
            
            if (existingCode.rows.length > 0) {
                return NextResponse.json({ error: 'Department code already exists' }, { status: 400 });
            }
        }
        
        const query = `
            UPDATE efiling_departments 
            SET name = COALESCE($2, name),
                code = COALESCE($3, code),
                description = COALESCE($4, description),
                parent_department_id = COALESCE($5, parent_department_id),
                is_active = COALESCE($6, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `;
        
        const result = await client.query(query, [id, name, code, description, parent_department_id, is_active]);
        
        // Log the action
        try {
            await eFileActionLogger.logAction({
                entityId: null,
                userId: 'system', // Since this is system-level action
                action: 'DEPARTMENT_UPDATED',
                entityType: 'efiling_department',
                details: { 
                    name, 
                    code, 
                    description, 
                    parent_department_id, 
                    is_active,
                    description: `Department "${name}" (${code}) updated`
                }
            });
        } catch (logError) {
            console.error('Error logging department update action:', logError);
        }
        
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
        return NextResponse.json({ error: 'Department ID is required' }, { status: 400 });
    }
    
    let client;
    try {
        client = await connectToDatabase();
        
        // Check if department exists
        const existing = await client.query(
            'SELECT * FROM efiling_departments WHERE id = $1',
            [id]
        );
        
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Department not found' }, { status: 404 });
        }
        
        // Check if department has users
        const usersCount = await client.query(
            'SELECT COUNT(*) FROM efiling_users WHERE department_id = $1',
            [id]
        );
        
        if (parseInt(usersCount.rows[0].count) > 0) {
            return NextResponse.json({ 
                error: 'Cannot delete department with assigned users' 
            }, { status: 400 });
        }
        
        // Check if department has child departments
        const childCount = await client.query(
            'SELECT COUNT(*) FROM efiling_departments WHERE parent_department_id = $1',
            [id]
        );
        
        if (parseInt(childCount.rows[0].count) > 0) {
            return NextResponse.json({ 
                error: 'Cannot delete department with child departments' 
            }, { status: 400 });
        }
        
        await client.query('DELETE FROM efiling_departments WHERE id = $1', [id]);
        
        // Log the action
        try {
            await eFileActionLogger.logAction({
                entityId: null,
                userId: 'system', // Since this is system-level action
                action: 'DEPARTMENT_DELETED',
                entityType: 'efiling_department',
                details: { 
                    name: existing.rows[0].name, 
                    code: existing.rows[0].code,
                    description: `Department "${existing.rows[0].name}" deleted`
                }
            });
        } catch (logError) {
            console.error('Error logging department deletion action:', logError);
        }
        
        return NextResponse.json({ message: 'Department deleted successfully' });
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
} 