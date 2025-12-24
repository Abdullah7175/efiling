import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAuth, checkFileAccess } from '@/lib/authMiddleware';

export async function GET(request, { params }) {
    let client;
    try {
        // SECURITY: Require authentication
        const authResult = await requireAuth(request);
        if (authResult instanceof NextResponse) {
            return authResult;
        }
        const { user: sessionUser } = authResult;

        const { id } = await params;
        client = await connectToDatabase();

        // SECURITY: IDOR Fix - Check file access
        const fileId = parseInt(id);
        const userId = parseInt(sessionUser.id);
        const isAdmin = [1, 2].includes(parseInt(sessionUser.role));
        
        const hasAccess = await checkFileAccess(client, fileId, userId, isAdmin);
        if (!hasAccess) {
            return NextResponse.json(
                { error: 'Forbidden - You do not have access to this file' },
                { status: 403 }
            );
        }

        // Check if SLA columns exist (check each column individually)
        let hasSlaDeadline = false;
        let hasSlaPaused = false;
        let hasSlaAccumulatedHours = false;
        let hasSlaPauseCount = false;
        try {
            const [slaDeadlineCheck, slaPausedCheck, slaAccumulatedHoursCheck, slaPauseCountCheck] = await Promise.all([
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_deadline'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_paused'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_accumulated_hours'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_pause_count'
                    );
                `)
            ]);
            hasSlaDeadline = slaDeadlineCheck.rows[0]?.exists || false;
            hasSlaPaused = slaPausedCheck.rows[0]?.exists || false;
            hasSlaAccumulatedHours = slaAccumulatedHoursCheck.rows[0]?.exists || false;
            hasSlaPauseCount = slaPauseCountCheck.rows[0]?.exists || false;
        } catch (checkError) {
            console.warn('Could not check for SLA columns:', checkError.message);
        }

        // Fetch file with detailed information including SLA data (conditionally)
        const result = await client.query(`
            SELECT 
                f.*,
                d.name AS department_name,
                c.name AS category_name,
                s.name AS status_name,
                s.code AS status_code,
                s.color AS status_color,
                CASE 
                    WHEN f.assigned_to IS NULL THEN 'Unassigned'
                    WHEN assigned_user.name IS NOT NULL AND assigned_efiling.designation IS NOT NULL AND assigned_efiling.designation != ''
                    THEN assigned_user.name || ' (' || assigned_efiling.designation || ')'
                    WHEN assigned_user.name IS NOT NULL THEN assigned_user.name
                    WHEN assigned_efiling.designation IS NOT NULL THEN assigned_efiling.designation
                    ELSE 'Unassigned'
                END AS assigned_to_name,
                ar.name AS current_stage_name,
                ar.code AS current_stage_code,
                ar.name AS current_stage,
                f.work_request_id,
                COALESCE(creator_users.name, 'Unknown') AS creator_user_name,
                creator_users.name AS created_by_name,
                creator_efiling.designation AS created_by_designation,
                CASE 
                    WHEN creator_efiling.designation IS NOT NULL AND creator_efiling.designation != '' 
                    THEN creator_users.name || ' (' || creator_efiling.designation || ')'
                    ELSE creator_users.name
                END AS created_by_name_with_designation,
                CASE 
                    WHEN f.work_request_id IS NOT NULL THEN 'Yes'
                    ELSE 'No'
                END AS has_video_request,
                ${hasSlaDeadline ? `f.sla_deadline,` : `NULL as sla_deadline,`}
                ${hasSlaPaused ? `f.sla_paused,` : `false as sla_paused,`}
                ${hasSlaAccumulatedHours ? `f.sla_accumulated_hours,` : `0 as sla_accumulated_hours,`}
                ${hasSlaPauseCount ? `f.sla_pause_count,` : `0 as sla_pause_count,`}
                CASE 
                    WHEN ${hasSlaPaused ? 'f.sla_paused' : 'false'} THEN 'PAUSED'
                    WHEN ${hasSlaDeadline ? 'f.sla_deadline' : 'NULL'} IS NOT NULL AND ${hasSlaDeadline ? 'f.sla_deadline' : 'NULL'} < NOW() THEN 'BREACHED'
                    WHEN ${hasSlaDeadline ? 'f.sla_deadline' : 'NULL'} IS NOT NULL THEN 'ACTIVE'
                    ELSE 'PENDING'
                END AS sla_status,
                CASE
                    WHEN ${hasSlaPaused ? 'f.sla_paused' : 'false'} THEN NULL
                    WHEN ${hasSlaDeadline ? 'f.sla_deadline' : 'NULL'} IS NOT NULL THEN 
                        ROUND(EXTRACT(EPOCH FROM (${hasSlaDeadline ? 'f.sla_deadline' : 'NULL'} - NOW()))/3600.0, 2)
                    ELSE NULL
                END AS hours_remaining
            FROM efiling_files f
            LEFT JOIN efiling_departments d ON f.department_id = d.id
            LEFT JOIN efiling_file_categories c ON f.category_id = c.id
            LEFT JOIN efiling_file_status s ON f.status_id = s.id
            LEFT JOIN efiling_users assigned_efiling ON f.assigned_to = assigned_efiling.id
            LEFT JOIN users assigned_user ON assigned_efiling.user_id = assigned_user.id
            LEFT JOIN efiling_roles ar ON assigned_efiling.efiling_role_id = ar.id
            LEFT JOIN efiling_users creator_efiling ON f.created_by = creator_efiling.id
            LEFT JOIN users creator_users ON creator_efiling.user_id = creator_users.id
            WHERE f.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        return NextResponse.json(result.rows[0]);

    } catch (error) {
        console.error('Error fetching file:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function PUT(request, { params }) {
    let client;
    try {
        // SECURITY: Require authentication
        const authResult = await requireAuth(request);
        if (authResult instanceof NextResponse) {
            return authResult;
        }
        const { user: sessionUser } = authResult;

        const { id } = await params;
        const body = await request.json();
        
        client = await connectToDatabase();
        
        // Check if file exists
        const existingFile = await client.query(
            'SELECT * FROM efiling_files WHERE id = $1',
            [id]
        );
        
        if (existingFile.rows.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        // SECURITY: IDOR Fix - Check file access
        const fileId = parseInt(id);
        const userId = parseInt(sessionUser.id);
        const isAdmin = [1, 2].includes(parseInt(sessionUser.role));
        
        const hasAccess = await checkFileAccess(client, fileId, userId, isAdmin);
        if (!hasAccess) {
            return NextResponse.json(
                { error: 'Forbidden - You do not have access to modify this file' },
                { status: 403 }
            );
        }
        
        // Update file fields
        const updateFields = [];
        const updateValues = [];
        let paramCount = 1;
        
        if (body.subject !== undefined) {
            updateFields.push(`subject = $${paramCount}`);
            updateValues.push(body.subject);
            paramCount++;
        }
        
        if (body.category_id !== undefined) {
            updateFields.push(`category_id = $${paramCount}`);
            updateValues.push(body.category_id);
            paramCount++;
        }
        
        if (body.department_id !== undefined) {
            updateFields.push(`department_id = $${paramCount}`);
            updateValues.push(body.department_id);
            paramCount++;
        }
        
        if (body.status_id !== undefined) {
            updateFields.push(`status_id = $${paramCount}`);
            updateValues.push(body.status_id);
            paramCount++;
        }
        
        if (body.priority !== undefined) {
            updateFields.push(`priority = $${paramCount}`);
            updateValues.push(body.priority);
            paramCount++;
        }
        
        if (body.confidentiality_level !== undefined) {
            updateFields.push(`confidentiality_level = $${paramCount}`);
            updateValues.push(body.confidentiality_level);
            paramCount++;
        }
        
        if (body.assigned_to !== undefined) {
            updateFields.push(`assigned_to = $${paramCount}`);
            updateValues.push(body.assigned_to);
            paramCount++;
        }
        
        if (body.remarks !== undefined) {
            updateFields.push(`remarks = $${paramCount}`);
            updateValues.push(body.remarks);
            paramCount++;
        }
        
        if (body.work_request_id !== undefined) {
            updateFields.push(`work_request_id = $${paramCount}`);
            updateValues.push(body.work_request_id || null);
            paramCount++;
        }
        
        if (updateFields.length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
        }
        
        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
        updateValues.push(id);
        
        const query = `
            UPDATE efiling_files 
            SET ${updateFields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;
        
        const result = await client.query(query, updateValues);
        
        // Log the action
        // await logAction(request, 'UPDATE', ENTITY_TYPES.EFILING_FILE, {
        //     entityId: id,
        //     entityName: result.rows[0].file_number,
        //     details: { updatedFields: Object.keys(body) }
        // });
        
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

export async function DELETE(request, { params }) {
    let client;
    try {
        // SECURITY: Require admin authentication
        const authResult = await requireAuth(request);
        if (authResult instanceof NextResponse) {
            return authResult;
        }
        const { user: sessionUser } = authResult;

        const { id } = await params;

        // SECURITY: IDOR Fix - Admin-only delete
        const isAdmin = [1, 2].includes(parseInt(sessionUser.role));
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }

        client = await connectToDatabase();

        // Check if file exists
        const existingFile = await client.query(
            'SELECT id, file_number FROM efiling_files WHERE id = $1',
            [id]
        );
        if (existingFile.rows.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        await client.query('BEGIN');

        // Clean up non-cascading dependencies first (some FKs lack ON DELETE CASCADE)
        await client.query('DELETE FROM efiling_document_comments WHERE file_id = $1', [id]);
        await client.query('DELETE FROM efiling_user_actions WHERE file_id::text = $1::text', [String(id)]);
        await client.query('DELETE FROM efiling_file_attachments WHERE file_id = $1', [String(id)]);

        // Proactively clear related records even if cascades exist (idempotent)
        await client.query('DELETE FROM efiling_documents WHERE file_id = $1', [id]);
        await client.query('DELETE FROM efiling_document_pages WHERE file_id = $1', [id]);
        await client.query('DELETE FROM efiling_document_signatures WHERE file_id = $1', [id]);
        await client.query('DELETE FROM efiling_file_movements WHERE file_id = $1', [id]);
        await client.query('DELETE FROM efiling_notifications WHERE file_id = $1', [id]);
        await client.query('DELETE FROM efiling_signatures WHERE file_id = $1', [id]);

        // Finally delete the file
        await client.query('DELETE FROM efiling_files WHERE id = $1', [id]);

        await client.query('COMMIT');

        return NextResponse.json({ success: true, message: 'File and related data deleted successfully' });
    } catch (error) {
        console.error('Database error:', error);
        if (client) {
            try { await client.query('ROLLBACK'); } catch {}
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
} 