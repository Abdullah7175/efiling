import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { eFileActionLogger } from '@/lib/efilingActionLogger';
import { auth } from '@/auth';
import { getUserGeography, isGlobalRoleCode } from '@/lib/efilingGeographicRouting';

export async function GET(request) {
    let client;
    try {
        // SECURITY: Require authentication
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const categoryId = searchParams.get('categoryId');

        client = await connectToDatabase();

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
            // Fetch single file type
            const result = await client.query(`
                SELECT 
                    ft.*,
                    fc.name as category_name,
                    fc.description as category_description,
                    d.name as department_name,
                    d.code as department_code
                FROM efiling_file_types ft
                LEFT JOIN efiling_file_categories fc ON ft.category_id = fc.id
                LEFT JOIN efiling_departments d ON ft.department_id = d.id
                WHERE ft.id = $1
            `, [id]);

            if (result.rows.length === 0) {
                return NextResponse.json(
                    { error: 'File type not found' },
                    { status: 404 }
                );
            }

            // Log the action
            try {
                await eFileActionLogger.logAction({
                    entityId: null,
                    userId: session?.user?.id || 'system',
                    action: 'FILE_TYPE_VIEWED',
                    entityType: 'efiling_file_type',
                    details: { 
                        fileTypeId: id, 
                        name: result.rows[0].name,
                        description: `File type "${result.rows[0].name}" viewed`
                    }
                });
            } catch (logError) {
                console.error('Error logging file type view action:', logError);
            }

            return NextResponse.json(result.rows[0]);

        } else {
            // Fetch all file types
            let query = `
                SELECT DISTINCT
                    ft.*,
                    fc.name as category_name,
                    fc.description as category_description,
                    d.name as department_name,
                    d.code as department_code
                FROM efiling_file_types ft
                LEFT JOIN efiling_file_categories fc ON ft.category_id = fc.id
                LEFT JOIN efiling_departments d ON ft.department_id = d.id
                LEFT JOIN efiling_department_locations dl ON dl.department_id = d.id
                WHERE 1=1
            `;
            
            const params = [];

            if (categoryId) {
                query += ` AND ft.category_id = $${params.length + 1}`;
                params.push(categoryId);
            }

            if (!canSeeAll && userGeography) {
                const parts = [];
                const pushParam = (value) => {
                    params.push(value);
                    return `$${params.length}`;
                };

                if (userGeography.zone_ids && userGeography.zone_ids.length > 0) {
                    const placeholder = pushParam(userGeography.zone_ids);
                    parts.push(`dl.zone_id = ANY(${placeholder}::int[])`);
                }
                if (userGeography.division_id) {
                    parts.push(`dl.division_id = ${pushParam(userGeography.division_id)}`);
                }
                if (userGeography.district_id) {
                    parts.push(`dl.district_id = ${pushParam(userGeography.district_id)}`);
                }
                if (userGeography.town_id) {
                    parts.push(`dl.town_id = ${pushParam(userGeography.town_id)}`);
                }

                if (parts.length > 0) {
                    query += ` AND (dl.id IS NULL OR ${parts.join(' OR ')})`;
                }
            }

            query += ` ORDER BY ft.name ASC`;

            const result = await client.query(query, params);

            // Log the action
            try {
                await eFileActionLogger.logAction({
                    entityId: null,
                    userId: session?.user?.id || 'system',
                    action: 'FILE_TYPES_LISTED',
                    entityType: 'efiling_file_type',
                    details: { 
                        count: result.rows.length,
                        description: `File types list viewed (${result.rows.length} types)`
                    }
                });
            } catch (logError) {
                console.error('Error logging file types list action:', logError);
            }

            return NextResponse.json({
                success: true,
                fileTypes: result.rows
            });
        }

    } catch (error) {
        console.error('Error fetching file types:', error);
        return NextResponse.json(
            { error: 'Failed to fetch file types' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function POST(request) {
    let client;
    try {
        const session = await auth();
        if (!session) {
            console.error('File types POST - No session found');
            return NextResponse.json({ error: 'Forbidden - No session' }, { status: 403 });
        }
        if (!session.user) {
            console.error('File types POST - No user in session:', session);
            return NextResponse.json({ error: 'Forbidden - No user in session' }, { status: 403 });
        }
        if (!session.user.role || ![1,2].includes(parseInt(session.user.role))) {
            console.error('File types POST - User is not admin. Role:', session.user.role);
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }
        const body = await request.json();
        const { 
            name, 
            description, 
            categoryId, 
            code, 
            requiresApproval, 
            createdBy, 
            ipAddress, 
            userAgent,
            can_create_roles,
            department_id,
            sla_matrix_id,
            max_approval_level
        } = body;

        // Input validation
        if (!name || !categoryId || !code) {
            return NextResponse.json(
                { error: 'Name, category ID, and code are required' },
                { status: 400 }
            );
        }



        client = await connectToDatabase();

        // Check if code already exists
        const existingCode = await client.query(`
            SELECT id FROM efiling_file_types WHERE code = $1
        `, [code]);

        if (existingCode.rows.length > 0) {
            return NextResponse.json(
                { error: 'File type code already exists' },
                { status: 409 }
            );
        }

        // Create file type
        const result = await client.query(`
            INSERT INTO efiling_file_types (
                name, description, category_id, code, requires_approval, 
                created_at, can_create_roles, department_id, sla_matrix_id, max_approval_level
            ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9)
            RETURNING *
        `, [
            name,
            description,
            categoryId,
            code,
            requiresApproval !== false,
            Array.isArray(can_create_roles) ? JSON.stringify(can_create_roles) : (typeof can_create_roles === 'string' ? can_create_roles : null),
            department_id || null,
            sla_matrix_id || null,
            max_approval_level || null
        ]);

        const fileType = result.rows[0];

        // Log the action
        try {
            await eFileActionLogger.logAction({
                entityId: null,
                userId: createdBy || 'system',
                action: 'FILE_TYPE_CREATED',
                entityType: 'efiling_file_type',
                details: {
                    fileTypeName: name,
                    code,
                    categoryId,
                    requiresApproval,
                    description: `File type "${name}" (${code}) created`
                }
            });
        } catch (logError) {
            console.error('Error logging file type creation action:', logError);
        }

        return NextResponse.json({
            success: true,
            fileType: {
                id: fileType.id,
                name: fileType.name,
                description: fileType.description,
                code: fileType.code,
                categoryId: fileType.category_id,
                requiresApproval: fileType.requires_approval,
                can_create_roles: fileType.can_create_roles
            }
        }, { status: 201 });

    } catch (error) {
        console.error('Error creating file type:', error);
        return NextResponse.json(
            { error: 'Failed to create file type' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function PUT(request) {
    let client;
    try {
        const session = await auth();
        if (!session) {
            console.error('File types PUT - No session found');
            return NextResponse.json({ error: 'Forbidden - No session' }, { status: 403 });
        }
        if (!session.user) {
            console.error('File types PUT - No user in session:', session);
            return NextResponse.json({ error: 'Forbidden - No user in session' }, { status: 403 });
        }
        if (!session.user.role || ![1,2].includes(parseInt(session.user.role))) {
            console.error('File types PUT - User is not admin. Role:', session.user.role);
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }
        const body = await request.json();
        const { id, name, description, code, requires_approval, department_id, can_create_roles, sla_matrix_id, max_approval_level } = body;
        const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
        const userAgent = request.headers.get('user-agent');

        if (!id || !name || !code) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();

        // Check if code already exists for other file types
        const existingCode = await client.query(`
            SELECT id FROM efiling_file_types WHERE code = $1 AND id != $2
        `, [code, id]);

        if (existingCode.rows.length > 0) {
            return NextResponse.json(
                { error: 'File type code already exists' },
                { status: 409 }
            );
        }

        // Update file type
        // Handle sla_matrix_id: allow setting to NULL if empty string or null is provided
        const finalSlaMatrixId = (sla_matrix_id === '' || sla_matrix_id === null || sla_matrix_id === undefined) 
            ? null 
            : parseInt(sla_matrix_id);
        
        const result = await client.query(`
            UPDATE efiling_file_types SET
                name = $1,
                description = $2,
                code = $3,
                requires_approval = $4,
                department_id = $5,
                can_create_roles = COALESCE($6, can_create_roles),
                sla_matrix_id = $7,
                max_approval_level = COALESCE($8, max_approval_level),
                updated_at = NOW()
            WHERE id = $9
            RETURNING *
        `, [
            name,
            description,
            code,
            requires_approval,
            department_id,
            Array.isArray(can_create_roles) ? JSON.stringify(can_create_roles) : (typeof can_create_roles === 'string' ? can_create_roles : null),
            finalSlaMatrixId,
            max_approval_level,
            id
        ]);

        if (result.rows.length === 0) {
            return NextResponse.json(
                { error: 'File type not found' },
                { status: 404 }
            );
        }

        const fileType = result.rows[0];

        // Log the action
        try {
            await eFileActionLogger.logAction({
                entityId: null,
                userId: 'system',
                action: 'FILE_TYPE_UPDATED',
                entityType: 'efiling_file_type',
                details: {
                    fileTypeName: name,
                    code,
                    requires_approval,
                    department_id,
                    description: `File type "${name}" (${code}) updated`
                }
            });
        } catch (logError) {
            console.error('Error logging file type update action:', logError);
        }

        return NextResponse.json({
            success: true,
            fileType: fileType
        });

    } catch (error) {
        console.error('Error updating file type:', error);
        return NextResponse.json(
            { error: 'Failed to update file type' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function DELETE(request) {
    let client;
    try {
        const session = await auth();
        if (!session) {
            console.error('File types DELETE - No session found');
            return NextResponse.json({ error: 'Forbidden - No session' }, { status: 403 });
        }
        if (!session.user) {
            console.error('File types DELETE - No user in session:', session);
            return NextResponse.json({ error: 'Forbidden - No user in session' }, { status: 403 });
        }
        if (!session.user.role || ![1,2].includes(parseInt(session.user.role))) {
            console.error('File types DELETE - User is not admin. Role:', session.user.role);
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
        const userAgent = request.headers.get('user-agent');

        if (!id) {
            return NextResponse.json(
                { error: 'File type ID is required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();

        // Check if file type exists
        const existingFileType = await client.query(`
            SELECT name FROM efiling_file_types WHERE id = $1
        `, [id]);

        if (existingFileType.rows.length === 0) {
            return NextResponse.json(
                { error: 'File type not found' },
                { status: 404 }
            );
        }

        // Check if file type is being used by any files
        const filesUsingType = await client.query(`
            SELECT COUNT(*) as count FROM efiling_files WHERE file_type_id = $1
        `, [id]);

        if (parseInt(filesUsingType.rows[0].count) > 0) {
            return NextResponse.json(
                { error: 'Cannot delete file type that is being used by existing files' },
                { status: 409 }
            );
        }

        // Delete file type
        await client.query(`
            DELETE FROM efiling_file_types WHERE id = $1
        `, [id]);

        // Log the action
        try {
            await eFileActionLogger.logAction({
                entityId: null,
                userId: 'system',
                action: 'FILE_TYPE_DELETED',
                entityType: 'efiling_file_type',
                details: {
                    fileTypeName: existingFileType.rows[0].name,
                    description: `File type "${existingFileType.rows[0].name}" deleted`
                }
            });
        } catch (logError) {
            console.error('Error logging file type deletion action:', logError);
        }

        return NextResponse.json({
            success: true,
            message: 'File type deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting file type:', error);
        return NextResponse.json(
            { error: 'Failed to delete file type' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}
