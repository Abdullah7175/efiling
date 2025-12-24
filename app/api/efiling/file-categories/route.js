import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { eFileActionLogger, EFILING_ENTITY_TYPES, EFILING_ACTION_TYPES } from '@/lib/efilingActionLogger';
import { validateEFileAccess, checkEFileRateLimit } from '@/lib/efilingSecurity';
import { auth } from '@/auth';
import { getUserGeography, isGlobalRoleCode } from '@/lib/efilingGeographicRouting';

export async function GET(request) {
    // SECURITY: Require authentication
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    let client;
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const isActive = searchParams.get('is_active');
        const userId = searchParams.get('userId');
        const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');

        // Rate limiting - simplified for now
        // const rateLimit = checkEFileRateLimit(userId || 'anonymous', 'api', userId);
        // if (!rateLimit.allowed) {
        //     return NextResponse.json(
        //         { error: 'Rate limit exceeded. Please try again later.' },
        //         { status: 429 }
        //     );
        // }

        // Validate access - simplified for now
        // const accessValidation = await validateEFileAccess(userId, 'file_category', null, 'VIEW_CATEGORIES');
        // if (!accessValidation.allowed) {
        //     return NextResponse.json(
        //         { error: accessValidation.reason },
        //         { status: 403 }
        //     );
        // }

        client = await connectToDatabase();

        const session = await auth(request);
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
            // Fetch single category
            const result = await client.query(`
                SELECT * FROM efiling_file_categories WHERE id = $1
            `, [id]);

            if (result.rows.length === 0) {
                return NextResponse.json(
                    { error: 'File category not found' },
                    { status: 404 }
                );
            }

            // Log the action
            await eFileActionLogger.logAction({
                entityType: EFILING_ENTITY_TYPES.EFILING_CATEGORY,
                entityId: id,
                action: EFILING_ACTION_TYPES.FILE_TYPE_VIEWED,
                userId: userId || 'anonymous',
                details: { categoryId: id },
                ipAddress
            });

            return NextResponse.json(result.rows[0]);

        } else {
            // Fetch all categories
            let query = `
                SELECT DISTINCT fc.*
                FROM efiling_file_categories fc
                LEFT JOIN efiling_departments d ON fc.department_id = d.id
                LEFT JOIN efiling_department_locations dl ON dl.department_id = fc.department_id
                WHERE 1=1
            `;
            const params = [];

            if (isActive !== null) {
                query += ` AND fc.is_active = $${params.length + 1}`;
                params.push(isActive === 'true');
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

            query += ` ORDER BY fc.name ASC`;

            const result = await client.query(query, params);

            // Log the action
            await eFileActionLogger.logAction({
                entityType: EFILING_ENTITY_TYPES.EFILING_CATEGORY,
                entityId: null,
                action: EFILING_ACTION_TYPES.FILE_TYPE_VIEWED,
                userId: userId || 'anonymous',
                details: { count: result.rows.length },
                ipAddress
            });

            return NextResponse.json({
                success: true,
                categories: result.rows
            });
        }

    } catch (error) {
        console.error('Error fetching file categories:', error);
        return NextResponse.json(
            { error: 'Failed to fetch file categories' },
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
        const body = await request.json();
        const { 
            name, 
            description, 
            createdBy, 
            ipAddress, 
            userAgent 
        } = body;

        // Input validation
        if (!name) {
            return NextResponse.json(
                { error: 'Category name is required' },
                { status: 400 }
            );
        }

        // Rate limiting
        const rateLimit = checkEFileRateLimit(createdBy, 'workflow_action', createdBy);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429 }
            );
        }

        // Validate access
        const accessValidation = await validateEFileAccess(createdBy, 'file_category', null, 'CREATE_CATEGORY');
        if (!accessValidation.allowed) {
            return NextResponse.json(
                { error: accessValidation.reason },
                { status: 403 }
            );
        }

        client = await connectToDatabase();

        // Check if category already exists
        const existingCategory = await client.query(`
            SELECT id FROM efiling_file_categories WHERE name = $1
        `, [name]);

        if (existingCategory.rows.length > 0) {
            return NextResponse.json(
                { error: 'Category with this name already exists' },
                { status: 409 }
            );
        }

        // Create category
        const result = await client.query(`
            INSERT INTO efiling_file_categories (
                name, description, is_active, created_at
            ) VALUES ($1, $2, true, NOW())
            RETURNING *
        `, [name, description]);

        const category = result.rows[0];

        // Log the action
        await eFileActionLogger.logAction({
            entityType: EFILING_ENTITY_TYPES.EFILING_CATEGORY,
            entityId: category.id,
            action: EFILING_ACTION_TYPES.FILE_TYPE_CREATED,
            userId: createdBy,
            details: {
                categoryName: name,
                description
            },
            ipAddress,
            userAgent
        });

        return NextResponse.json({
            success: true,
            category: {
                id: category.id,
                name: category.name,
                description: category.description,
                isActive: category.is_active
            }
        }, { status: 201 });

    } catch (error) {
        console.error('Error creating file category:', error);
        return NextResponse.json(
            { error: 'Failed to create file category' },
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
        const body = await request.json();
        const { id, name, description, is_active = true, updatedBy, ipAddress, userAgent } = body;
        if (!id) {
            return NextResponse.json({ error: 'Category id is required' }, { status: 400 });
        }
        client = await connectToDatabase();
        const existing = await client.query('SELECT * FROM efiling_file_categories WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
        }
        const result = await client.query(`
            UPDATE efiling_file_categories
            SET name = COALESCE($2, name),
                description = COALESCE($3, description),
                is_active = COALESCE($4, is_active),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id, name, description, is_active]);
        const cat = result.rows[0];
        await eFileActionLogger.logAction({
            entityType: EFILING_ENTITY_TYPES.EFILING_CATEGORY,
            entityId: id,
            action: EFILING_ACTION_TYPES.FILE_TYPE_UPDATED,
            userId: updatedBy || 'system',
            details: { name: cat.name, is_active: cat.is_active },
            ipAddress,
            userAgent
        });
        return NextResponse.json({ success: true, category: cat });
    } catch (error) {
        console.error('Error updating file category:', error);
        return NextResponse.json({ error: 'Failed to update file category' }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}

export async function DELETE(request) {
    let client;
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const userId = searchParams.get('userId') || 'system';
        if (!id) {
            return NextResponse.json({ error: 'Category id is required' }, { status: 400 });
        }
        client = await connectToDatabase();
        const existing = await client.query('SELECT * FROM efiling_file_categories WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
        }
        // Soft delete by inactivating if referenced by file_types
        const refs = await client.query('SELECT COUNT(*)::int AS cnt FROM efiling_file_types WHERE category_id = $1', [id]);
        if (refs.rows[0].cnt > 0) {
            await client.query('UPDATE efiling_file_categories SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
        } else {
            await client.query('DELETE FROM efiling_file_categories WHERE id = $1', [id]);
        }
        await eFileActionLogger.logAction({
            entityType: EFILING_ENTITY_TYPES.EFILING_CATEGORY,
            entityId: id,
            action: EFILING_ACTION_TYPES.FILE_TYPE_DELETED,
            userId,
            details: { softDeleted: refs.rows[0].cnt > 0 }
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting file category:', error);
        return NextResponse.json({ error: 'Failed to delete file category' }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}