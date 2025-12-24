import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { logAction, ENTITY_TYPES } from '@/lib/actionLogger';
import { auth } from '@/auth';
import { canEditFile, getWorkflowState } from '@/lib/efilingWorkflowStateManager';

export async function POST(request, { params }) {
    let client;
    try {
        const { id } = await params;
        
        // Call auth first before reading request body to avoid "body already consumed" error
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const body = await request.json();
        const { content, template } = body;

        client = await connectToDatabase();
        
        // Check if user can edit (workflow state check)
        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        if (!isAdmin) {
            // Get user's efiling ID
            const userRes = await client.query(`
                SELECT eu.id
                FROM efiling_users eu
                JOIN users u ON eu.user_id = u.id
                WHERE u.id = $1 AND eu.is_active = true
            `, [session.user.id]);
            
            if (userRes.rows.length === 0) {
                return NextResponse.json({ error: 'User not found in e-filing system' }, { status: 403 });
            }
            
            const efilingUserId = userRes.rows[0].id;
            
            // Get file info to check assigned_to
            const fileRes = await client.query(`
                SELECT created_by, assigned_to, workflow_state_id
                FROM efiling_files
                WHERE id = $1
            `, [id]);
            
            if (fileRes.rows.length === 0) {
                return NextResponse.json({ error: 'File not found' }, { status: 404 });
            }
            
            const file = fileRes.rows[0];
            const isCreator = file.created_by === efilingUserId;
            
            // Get workflow state
            const state = await getWorkflowState(client, id);
            
            // STRICT CHECK: If creator and file is assigned to someone else, block unless explicitly returned
            if (isCreator && file.assigned_to && file.assigned_to !== efilingUserId) {
                // Only allow if state is RETURNED_TO_CREATOR
                // TEAM_INTERNAL should not allow editing if file is assigned to someone else
                if (state && state.current_state === 'RETURNED_TO_CREATOR') {
                    // Allow edit - file was returned to creator
                } else {
                    // Block edit - file is assigned to someone else
                    console.log('BLOCKING EDIT:', {
                        userId: efilingUserId,
                        fileId: id,
                        isCreator: isCreator,
                        assignedTo: file.assigned_to,
                        workflowState: state ? state.current_state : 'NONE',
                        reason: 'File assigned to someone else'
                    });
                    return NextResponse.json({
                        error: 'You cannot edit this file. File is marked to a higher level. Editing is only allowed when the file is marked back to you.',
                        code: 'EDIT_NOT_ALLOWED'
                    }, { status: 403 });
                }
            }
            
            // Use canEditFile for final check
            const canEdit = await canEditFile(client, id, efilingUserId);
            if (!canEdit) {
                console.log('BLOCKING EDIT: canEditFile returned false', {
                    userId: efilingUserId,
                    fileId: id,
                    isCreator: isCreator,
                    assignedTo: file.assigned_to,
                    workflowState: state ? state.current_state : 'NONE'
                });
                return NextResponse.json({
                    error: 'You cannot edit this file. File is in external workflow or not returned to creator.',
                    code: 'EDIT_NOT_ALLOWED'
                }, { status: 403 });
            }
            
            console.log('ALLOWING EDIT:', {
                userId: efilingUserId,
                fileId: id,
                isCreator: isCreator,
                assignedTo: file.assigned_to,
                workflowState: state ? state.current_state : 'NONE'
            });
        }

        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS efiling_document_pages (
                    id SERIAL PRIMARY KEY,
                    file_id INTEGER NOT NULL REFERENCES efiling_files(id) ON DELETE CASCADE,
                    page_number INTEGER NOT NULL,
                    page_title VARCHAR(255),
                    page_content JSONB NOT NULL,
                    page_type VARCHAR(50) DEFAULT 'MAIN',
                    is_active BOOLEAN DEFAULT true,
                    created_by INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } catch (tableError) {
            console.error('Error creating document pages table:', tableError);
        }

        const result = await client.query(`
            UPDATE efiling_files 
            SET document_content = $1::jsonb, updated_at = CURRENT_TIMESTAMP, page_count = $2
            WHERE id = $3
            RETURNING *
        `, [content ?? {}, body.pages ? body.pages.length : 1, id]);

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        if (body.pages && Array.isArray(body.pages)) {
            await client.query(`
                DELETE FROM efiling_document_pages WHERE file_id = $1
            `, [id]);

            for (let i = 0; i < body.pages.length; i++) {
                const page = body.pages[i];
                await client.query(`
                    INSERT INTO efiling_document_pages 
                    (file_id, page_number, page_title, page_content, page_type, created_by)
                    VALUES ($1, $2, $3, $4::jsonb, $5, $6)
                `, [
                    id,
                    page.pageNumber || (i + 1),
                    page.title || `Page ${i + 1}`,
                    page.content ?? {},
                    page.type || 'MAIN',
                    null
                ]);
            }
        }

        await logAction(request, 'UPDATE', ENTITY_TYPES.EFILING_FILE, {
            entityId: id,
            entityName: `Document content for file ${id}`,
            details: { 
                file_id: id, 
                template_id: template,
                pages_count: body.pages ? body.pages.length : 1
            }
        });

        return NextResponse.json({ success: true, file_id: id, document_content: content, pages_saved: body.pages ? body.pages.length : 1 });
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}

export async function GET(request, { params }) {
    let client;
    try {
        // SECURITY: Require authentication
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        client = await connectToDatabase();

        // SECURITY: Check file access using authMiddleware
        const { checkFileAccess } = await import('@/lib/authMiddleware');
        const userId = parseInt(session.user.id);
        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        
        const hasAccess = await checkFileAccess(client, parseInt(id), userId, isAdmin);
        if (!hasAccess) {
            return NextResponse.json(
                { error: 'Forbidden - You do not have access to this file' },
                { status: 403 }
            );
        }

        const result = await client.query(`
            SELECT id, file_number, subject, document_content, page_count, created_at, updated_at
            FROM efiling_files 
            WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const file = result.rows[0];

        const pagesResult = await client.query(`
            SELECT id, page_number, page_title, page_content, page_type, is_active, created_at, updated_at
            FROM efiling_document_pages 
            WHERE file_id = $1 AND is_active = true
            ORDER BY page_number ASC
        `, [id]);

        const pages = pagesResult.rows.map(row => ({
            id: row.id,
            pageNumber: row.page_number,
            title: row.page_title,
            content: typeof row.page_content === 'string' ? JSON.parse(row.page_content) : (row.page_content || {}),
            type: row.page_type,
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
        
        return NextResponse.json({
            id: file.id,
            file_number: file.file_number,
            subject: file.subject,
            document_content: typeof file.document_content === 'string' ? JSON.parse(file.document_content) : (file.document_content || {}),
            page_count: file.page_count || 1,
            pages,
            created_at: file.created_at,
            updated_at: file.updated_at
        });
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}

export async function PUT(request, { params }) {
    let client;
    try {
        const { id } = await params;
        
        // Call auth first before reading request body to avoid "body already consumed" error
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const body = await request.json();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        client = await connectToDatabase();

        // Check if user can edit (workflow state check)
        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        if (!isAdmin) {
            // Get user's efiling ID
            const userRes = await client.query(`
                SELECT eu.id
                FROM efiling_users eu
                JOIN users u ON eu.user_id = u.id
                WHERE u.id = $1 AND eu.is_active = true
            `, [session.user.id]);
            
            if (userRes.rows.length === 0) {
                return NextResponse.json({ error: 'User not found in e-filing system' }, { status: 403 });
            }
            
            const canEdit = await canEditFile(client, id, userRes.rows[0].id);
            if (!canEdit) {
                return NextResponse.json({
                    error: 'You cannot edit this file. File is in external workflow or not returned to creator.',
                    code: 'EDIT_NOT_ALLOWED'
                }, { status: 403 });
            }
        }
        
        const fileRes = await client.query(`SELECT created_by FROM efiling_files WHERE id = $1`, [id]);
        if (fileRes.rows.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const result = await client.query(`
            UPDATE efiling_files 
            SET subject = $1, document_content = $2::jsonb, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
        `, [body.subject, JSON.stringify(body.document_content || {}), id]);
        
        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }
        
        return NextResponse.json({ success: true, file_id: id, subject: body.subject, document_content: body.document_content || {} });
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}
