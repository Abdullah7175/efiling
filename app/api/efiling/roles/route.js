import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { eFileActionLogger } from '@/lib/efilingActionLogger';
import { auth } from '@/auth';
import { getUserGeography, isGlobalRoleCode } from '@/lib/efilingGeographicRouting';

export async function GET(request) {
    // SECURITY: Require authentication
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const isActive = searchParams.get('is_active');

        const client = await connectToDatabase();

        try {
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
                // Fetch single role by ID
                const query = `
                    SELECT r.*, d.name as department_name
                    FROM efiling_roles r
                    LEFT JOIN efiling_departments d ON r.department_id = d.id
                    WHERE r.id = $1
                `;
                
                const result = await client.query(query, [id]);
                
                if (result.rows.length === 0) {
                    return NextResponse.json(
                        { error: 'Role not found' },
                        { status: 404 }
                    );
                }

                return NextResponse.json(result.rows[0]);
            } else {
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

                // Fetch all roles
                let query = `
                    SELECT DISTINCT r.*, d.name as department_name
                    FROM efiling_roles r
                    LEFT JOIN efiling_departments d ON r.department_id = d.id
                    ${hasRoleLocationsTable ? 'LEFT JOIN efiling_role_locations rl ON rl.role_id = r.id' : ''}
                `;
                
                const params = [];
                const conditions = [];

                if (isActive !== null) {
                    conditions.push(`r.is_active = $${params.length + 1}`);
                    params.push(isActive === 'true');
                }

                if (!canSeeAll && userGeography && hasRoleLocationsTable) {
                    const locationParts = [];
                    const pushParam = (value) => {
                        params.push(value);
                        return `$${params.length}`;
                    };

                    if (userGeography.zone_ids && userGeography.zone_ids.length > 0) {
                        const placeholder = pushParam(userGeography.zone_ids);
                        locationParts.push(`rl.zone_id = ANY(${placeholder}::int[])`);
                    }
                    if (userGeography.division_id) {
                        locationParts.push(`rl.division_id = ${pushParam(userGeography.division_id)}`);
                    }
                    if (userGeography.district_id) {
                        locationParts.push(`rl.district_id = ${pushParam(userGeography.district_id)}`);
                    }
                    if (userGeography.town_id) {
                        locationParts.push(`rl.town_id = ${pushParam(userGeography.town_id)}`);
                    }

                    if (locationParts.length > 0) {
                        conditions.push(`(rl.id IS NULL OR ${locationParts.join(' OR ')})`);
                    }
                }

                if (conditions.length > 0) {
                    query += ` WHERE ${conditions.join(' AND ')}`;
                }

                query += ` ORDER BY r.name ASC`;

                const result = await client.query(query, params);

                return NextResponse.json({
                    success: true,
                    roles: result.rows
                });
            }

        } finally {
            await client.release();
        }

    } catch (error) {
        console.error('Error fetching roles:', error);
        return NextResponse.json(
            { error: 'Failed to fetch roles', details: error.message },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const { name, code, description, department_id, permissions, is_active } = await request.json();

        // Validate required fields
        if (!name || !code) {
            return NextResponse.json(
                { error: 'Name and code are required' },
                { status: 400 }
            );
        }

        const client = await connectToDatabase();

        try {
            // Check if code already exists
            const existingCode = await client.query(
                'SELECT id FROM efiling_roles WHERE code = $1',
                [code]
            );

            if (existingCode.rows.length > 0) {
                return NextResponse.json(
                    { error: 'Role code already exists' },
                    { status: 400 }
                );
            }

            const query = `
                INSERT INTO efiling_roles (name, code, description, department_id, permissions, is_active)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;

            const result = await client.query(query, [
                name, 
                code, 
                description || null, 
                department_id || null, 
                permissions ? JSON.stringify(permissions) : null,
                is_active !== undefined ? is_active : true
            ]);

            // Log the action
            try {
                            await eFileActionLogger.logAction({
                entityId: null,
                userId: 'system', // Since this is system-level action
                action: 'ROLE_CREATED',
                entityType: 'efiling_role',
                details: { 
                    name, 
                    code, 
                    description, 
                    department_id, 
                    permissions, 
                    is_active,
                    description: `Role "${name}" (${code}) created`
                }
            });
            } catch (logError) {
                console.error('Error logging role creation action:', logError);
            }

            return NextResponse.json({
                success: true,
                role: result.rows[0]
            }, { status: 201 });

        } finally {
            await client.release();
        }

    } catch (error) {
        console.error('Error creating role:', error);
        return NextResponse.json(
            { error: 'Failed to create role', details: error.message },
            { status: 500 }
        );
    }
}

export async function PUT(request) {
    try {
        const { id, name, code, description, department_id, permissions, is_active } = await request.json();

        if (!id) {
            return NextResponse.json(
                { error: 'Role ID is required' },
                { status: 400 }
            );
        }

        const client = await connectToDatabase();

        try {
            // Check if role exists
            const existing = await client.query(
                'SELECT * FROM efiling_roles WHERE id = $1',
                [id]
            );

            if (existing.rows.length === 0) {
                return NextResponse.json(
                    { error: 'Role not found' },
                    { status: 404 }
                );
            }

            // Check if code already exists (excluding current role)
            if (code) {
                const existingCode = await client.query(
                    'SELECT id FROM efiling_roles WHERE code = $1 AND id != $2',
                    [code, id]
                );

                if (existingCode.rows.length > 0) {
                    return NextResponse.json(
                        { error: 'Role code already exists' },
                        { status: 400 }
                    );
                }
            }

            const query = `
                UPDATE efiling_roles 
                SET name = COALESCE($2, name),
                    code = COALESCE($3, code),
                    description = COALESCE($4, description),
                    department_id = COALESCE($5, department_id),
                    permissions = COALESCE($6, permissions),
                    is_active = COALESCE($7, is_active),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *
            `;

            const result = await client.query(query, [
                id, 
                name, 
                code, 
                description, 
                department_id, 
                permissions ? JSON.stringify(permissions) : null,
                is_active
            ]);

            // Log the action
            try {
                            await eFileActionLogger.logAction({
                entityId: null,
                userId: 'system', // Since this is system-level action
                action: 'ROLE_UPDATED',
                entityType: 'efiling_role',
                details: { 
                    name, 
                    code, 
                    description, 
                    department_id, 
                    permissions, 
                    is_active,
                    description: `Role "${name}" (${code}) updated`
                }
            });
            } catch (logError) {
                console.error('Error logging role update action:', logError);
            }

            return NextResponse.json({
                success: true,
                role: result.rows[0]
            });

        } finally {
            await client.release();
        }

    } catch (error) {
        console.error('Error updating role:', error);
        return NextResponse.json(
            { error: 'Failed to update role', details: error.message },
            { status: 500 }
        );
    }
}

export async function DELETE(request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Role ID is required' },
                { status: 400 }
            );
        }

        const client = await connectToDatabase();

        try {
            // Check if role exists
            const existing = await client.query(
                'SELECT * FROM efiling_roles WHERE id = $1',
                [id]
            );

            if (existing.rows.length === 0) {
                return NextResponse.json(
                    { error: 'Role not found' },
                    { status: 404 }
                );
            }

            // Check if role has users
            const usersCount = await client.query(
                'SELECT COUNT(*) FROM efiling_users WHERE efiling_role_id = $1',
                [id]
            );

            if (parseInt(usersCount.rows[0].count) > 0) {
                return NextResponse.json({ 
                    error: 'Cannot delete role with assigned users' 
                }, { status: 400 });
            }

            await client.query('DELETE FROM efiling_roles WHERE id = $1', [id]);

            // Log the action
            try {
                            await eFileActionLogger.logAction({
                entityId: null,
                userId: 'system', // Since this is system-level action
                action: 'ROLE_DELETED',
                entityType: 'efiling_role',
                details: { 
                    name: existing.rows[0].name, 
                    code: existing.rows[0].code,
                    description: `Role "${existing.rows[0].name}" (${existing.rows[0].code}) deleted`
                }
            });
            } catch (logError) {
                console.error('Error logging role deletion action:', logError);
            }

            return NextResponse.json({
                success: true,
                message: 'Role deleted successfully'
            });

        } finally {
            await client.release();
        }

    } catch (error) {
        console.error('Error deleting role:', error);
        return NextResponse.json(
            { error: 'Failed to delete role', details: error.message },
            { status: 500 }
        );
    }
}
