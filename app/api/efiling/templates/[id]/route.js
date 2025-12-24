import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

/**
 * GET /api/efiling/templates/[id]
 * Get a single template by ID
 */
export async function GET(request, { params }) {
    let client;
    try {
        const { id } = await params;
        if (!id) {
            return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
        }

        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        client = await connectToDatabase();

        const result = await client.query(`
            SELECT 
                t.*,
                c.name as category_name,
                u_creator.name as created_by_name,
                -- Multiple departments
                COALESCE(
                    json_agg(DISTINCT jsonb_build_object('id', td.department_id, 'name', d.name)) 
                    FILTER (WHERE td.department_id IS NOT NULL),
                    '[]'::json
                ) as departments,
                -- Multiple roles
                COALESCE(
                    json_agg(DISTINCT jsonb_build_object('id', tr.role_id, 'name', r.name, 'code', r.code)) 
                    FILTER (WHERE tr.role_id IS NOT NULL),
                    '[]'::json
                ) as roles
            FROM efiling_templates t
            LEFT JOIN efiling_file_categories c ON t.category_id = c.id
            LEFT JOIN efiling_template_departments td ON t.id = td.template_id
            LEFT JOIN efiling_departments d ON td.department_id = d.id
            LEFT JOIN efiling_template_roles tr ON t.id = tr.template_id
            LEFT JOIN efiling_roles r ON tr.role_id = r.id
            LEFT JOIN efiling_users eu_creator ON t.created_by = eu_creator.id
            LEFT JOIN users u_creator ON eu_creator.user_id = u_creator.id
            WHERE t.id = $1 AND t.is_active = true
            GROUP BY t.id, c.name, u_creator.name
        `, [id]);

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            template: result.rows[0]
        });

    } catch (error) {
        console.error('Error fetching template:', error);
        return NextResponse.json(
            { error: 'Failed to fetch template', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

/**
 * PUT /api/efiling/templates/[id]
 * Update a template
 * Admin can update any template, users can only update their own
 */
export async function PUT(request, { params }) {
    let client;
    try {
        const { id } = await params;
        
        if (!id) {
            return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
        }
        
        // Call auth first before reading request body to avoid "body already consumed" error
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const body = await request.json();
        const { name, template_type, title, subject, main_content, category_id, department_id, role_id, department_ids, role_ids } = body;

        // Support both single and multiple departments/roles
        const finalDepartmentIds = department_ids && Array.isArray(department_ids) && department_ids.length > 0 
            ? department_ids.filter(id => id) 
            : (department_id ? [department_id] : []);
        
        const finalRoleIds = role_ids && Array.isArray(role_ids) && role_ids.length > 0 
            ? role_ids.filter(id => id) 
            : (role_id ? [role_id] : []);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        client = await connectToDatabase();

        const isAdmin = [1, 2].includes(parseInt(session.user.role));

        // Get user's e-filing profile
        const userRes = await client.query(`
            SELECT eu.id, eu.department_id, eu.efiling_role_id
            FROM efiling_users eu
            JOIN users u ON eu.user_id = u.id
            WHERE u.id = $1 AND eu.is_active = true
        `, [session.user.id]);

        if (userRes.rows.length === 0 && !isAdmin) {
            return NextResponse.json({ error: 'User not found in e-filing system' }, { status: 403 });
        }

        const userEfiling = userRes.rows[0];

        // Check if template exists and user has permission
        const templateRes = await client.query(`
            SELECT created_by, is_system_template
            FROM efiling_templates
            WHERE id = $1
        `, [id]);

        if (templateRes.rows.length === 0) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        const template = templateRes.rows[0];

        // Non-admin users can only edit their own templates
        if (!isAdmin && template.created_by !== userEfiling.id) {
            return NextResponse.json(
                { error: 'You can only edit your own templates' },
                { status: 403 }
            );
        }

        await client.query('BEGIN');

        // Build update query dynamically
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (name !== undefined) {
            updateFields.push(`name = $${paramIndex}`);
            updateValues.push(name);
            paramIndex++;
        }
        if (template_type !== undefined) {
            updateFields.push(`template_type = $${paramIndex}`);
            updateValues.push(template_type);
            paramIndex++;
        }
        if (title !== undefined) {
            updateFields.push(`title = $${paramIndex}`);
            updateValues.push(title);
            paramIndex++;
        }
        if (subject !== undefined) {
            updateFields.push(`subject = $${paramIndex}`);
            updateValues.push(subject);
            paramIndex++;
        }
        if (main_content !== undefined) {
            updateFields.push(`main_content = $${paramIndex}`);
            updateValues.push(main_content);
            paramIndex++;
        }
        if (category_id !== undefined) {
            updateFields.push(`category_id = $${paramIndex}`);
            updateValues.push(category_id);
            paramIndex++;
        }

        // Only admin can change department/role
        if (isAdmin) {
            // Update single department_id/role_id for backward compatibility
            const singleDepartmentId = finalDepartmentIds.length === 1 ? finalDepartmentIds[0] : (finalDepartmentIds.length === 0 ? null : undefined);
            const singleRoleId = finalRoleIds.length === 1 ? finalRoleIds[0] : (finalRoleIds.length === 0 ? null : undefined);
            
            if (department_ids !== undefined || department_id !== undefined) {
                updateFields.push(`department_id = $${paramIndex}`);
                updateValues.push(singleDepartmentId);
                paramIndex++;
            }
            if (role_ids !== undefined || role_id !== undefined) {
                updateFields.push(`role_id = $${paramIndex}`);
                updateValues.push(singleRoleId);
                paramIndex++;
            }
        }

        if (updateFields.length === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
        }

        updateValues.push(id);
        const updateQuery = `
            UPDATE efiling_templates
            SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        const result = await client.query(updateQuery, updateValues);

        // Update multiple departments/roles if provided (admin only)
        if (isAdmin && (department_ids !== undefined || role_ids !== undefined)) {
            // Update departments
            if (department_ids !== undefined) {
                // Delete existing department assignments
                await client.query(`
                    DELETE FROM efiling_template_departments WHERE template_id = $1
                `, [id]);
                
                // Insert new department assignments
                if (finalDepartmentIds.length > 0) {
                    for (const deptId of finalDepartmentIds) {
                        await client.query(`
                            INSERT INTO efiling_template_departments (template_id, department_id)
                            VALUES ($1, $2)
                            ON CONFLICT (template_id, department_id) DO NOTHING
                        `, [id, deptId]);
                    }
                }
            }

            // Update roles
            if (role_ids !== undefined) {
                // Delete existing role assignments
                await client.query(`
                    DELETE FROM efiling_template_roles WHERE template_id = $1
                `, [id]);
                
                // Insert new role assignments
                if (finalRoleIds.length > 0) {
                    for (const roleIdVal of finalRoleIds) {
                        await client.query(`
                            INSERT INTO efiling_template_roles (template_id, role_id)
                            VALUES ($1, $2)
                            ON CONFLICT (template_id, role_id) DO NOTHING
                        `, [id, roleIdVal]);
                    }
                }
            }
        }

        await client.query('COMMIT');

        return NextResponse.json({
            success: true,
            template: result.rows[0],
            message: 'Template updated successfully'
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error updating template:', error);
        return NextResponse.json(
            { error: 'Failed to update template', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

/**
 * DELETE /api/efiling/templates/[id]
 * Delete a template (admin only)
 */
export async function DELETE(request, { params }) {
    let client;
    try {
        const { id } = await params;
        if (!id) {
            return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
        }

        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        if (!isAdmin) {
            return NextResponse.json(
                { error: 'Only administrators can delete templates' },
                { status: 403 }
            );
        }

        client = await connectToDatabase();

        await client.query('BEGIN');

        // Soft delete (set is_active = false)
        const result = await client.query(`
            UPDATE efiling_templates
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING id, name
        `, [id]);

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        await client.query('COMMIT');

        return NextResponse.json({
            success: true,
            message: `Template "${result.rows[0].name}" deleted successfully`
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error deleting template:', error);
        return NextResponse.json(
            { error: 'Failed to delete template', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

