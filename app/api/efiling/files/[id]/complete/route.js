import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { logAction, ENTITY_TYPES } from '@/lib/actionLogger';
import { resumeSLA, isCEORole } from '@/lib/efilingSLAManager';
import { auth } from '@/auth';

/**
 * POST /api/efiling/files/[id]/complete
 * CEO-specific endpoint to complete files without going through all workflow stages
 * Only accessible to CEO role
 */
export async function POST(request, { params }) {
    let client;
    try {
        const { id } = await params;
        const body = await request.json();
        const { remarks } = body;

        // Get current user from session
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        client = await connectToDatabase();
        await client.query('BEGIN');

        // Check if SLA columns exist (check each column individually)
        let hasSlaPaused = false;
        try {
            const slaPausedCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                    AND table_name = 'efiling_files'
                    AND column_name = 'sla_paused'
                );
            `);
            hasSlaPaused = slaPausedCheck.rows[0]?.exists || false;
        } catch (checkError) {
            console.warn('Could not check for SLA columns:', checkError.message);
        }

        // Get file and current user details
        const fileRes = await client.query(`
            SELECT f.*, 
                   eu.id AS ceo_efiling_id,
                   r.code as role_code
                   ${hasSlaPaused ? ', f.sla_paused' : ', false as sla_paused'}
            FROM efiling_files f
            LEFT JOIN efiling_users eu ON eu.user_id = $1 AND eu.is_active = true
            LEFT JOIN efiling_roles r ON r.id = eu.efiling_role_id
            WHERE f.id = $2
        `, [session.user.id, id]);

        if (fileRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const fileData = fileRes.rows[0];
        const roleCode = (fileData.role_code || '').toUpperCase();

        // Verify current user is CEO
        if (!isCEORole(roleCode)) {
            await client.query('ROLLBACK');
            return NextResponse.json({ 
                error: 'Only CEO can complete files using this endpoint',
                code: 'CEO_ONLY'
            }, { status: 403 });
        }

        const ceoEfilingId = fileData.ceo_efiling_id;

        // Check if file is assigned to or marked to this CEO
        const isAssigned = fileData.assigned_to === ceoEfilingId;
        const isMarkedTo = await client.query(`
            SELECT COUNT(*) as count
            FROM efiling_file_movements
            WHERE file_id = $1 AND to_user_id = $2
        `, [id, ceoEfilingId]);

        const isMarkedToThisUser = parseInt(isMarkedTo.rows[0]?.count || 0) > 0;

        if (!isAssigned && !isMarkedToThisUser && !fileData.sla_paused) {
            await client.query('ROLLBACK');
            return NextResponse.json({ 
                error: 'File must be assigned to or in your review to complete',
                code: 'NOT_ASSIGNED'
            }, { status: 403 });
        }

        // Update file status to completed
        const updateQuery = hasSlaPaused 
            ? `UPDATE efiling_files 
               SET status_id = (
                   SELECT id FROM efiling_file_status WHERE code = 'COMPLETED'
               ), 
               sla_paused = FALSE,
               sla_paused_at = NULL,
               updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`
            : `UPDATE efiling_files 
               SET status_id = (
                   SELECT id FROM efiling_file_status WHERE code = 'COMPLETED'
               ), 
               updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`;
        
        await client.query(updateQuery, [id]);
        
        if (hasSlaPaused && fileData.sla_paused) {
            try {
                await resumeSLA(client, id, null, 0);
            } catch (slaError) {
                console.warn('Error resuming SLA:', slaError.message);
                // Don't fail the request if SLA resume fails
            }
        }

        // Log the completion action
        await client.query(`
            INSERT INTO efiling_file_movements (
                file_id, from_user_id, to_user_id, action_type, remarks, created_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, [id, ceoEfilingId, null, 'COMPLETED', remarks || 'Completed by CEO']);

        // Notify file creator
        try {
            await client.query(`
                INSERT INTO efiling_notifications (
                    user_id, file_id, type, message, priority, action_required, created_at
                ) VALUES ($1, $2, $3, $4, 'high', false, NOW())
            `, [
                fileData.created_by, 
                id, 
                'file_completed', 
                `Your file has been completed by CEO: File ${id}`
            ]);
        } catch (e) {
            console.warn('Notify creator on completion failed', e);
        }

        await client.query('COMMIT');

        // Log the action
            await logAction(request, 'CEO_COMPLETE', ENTITY_TYPES.EFILING_FILE, {
            entityId: id,
            entityName: `File ${id}`,
            details: { 
                remarks, 
                completed_by: 'CEO'
            }
        });

        return NextResponse.json({ 
            success: true,
            message: 'File completed successfully',
            file_id: id
        });

    } catch (error) {
        console.error('Error completing file:', error);
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch {}
        }
        return NextResponse.json({ 
            error: error.message || 'Internal server error' 
        }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
}

/**
 * GET /api/efiling/files/[id]/complete
 * Check if current user (CEO) can complete this file
 */
export async function GET(request, { params }) {
    let client;
    try {
        const { id } = await params;

        // Get current user from session
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        client = await connectToDatabase();

        // Check if SLA paused column exists
        let hasSlaPaused = false;
        try {
            const slaPausedCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                    AND table_name = 'efiling_files'
                    AND column_name = 'sla_paused'
                );
            `);
            hasSlaPaused = slaPausedCheck.rows[0]?.exists || false;
        } catch (checkError) {
            console.warn('Could not check for SLA columns:', checkError.message);
        }

        // Check if user is CEO and if file is assigned to them
        const result = await client.query(`
            SELECT 
                f.*,
                eu.id as efiling_user_id,
                r.code as role_code,
                CASE 
                    WHEN f.assigned_to = eu.id THEN true
                    ELSE false
                END as is_assigned,
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM efiling_file_movements 
                        WHERE file_id = f.id AND to_user_id = eu.id
                    ) THEN true
                    ELSE false
                END as is_marked_to,
                ${hasSlaPaused ? 'f.sla_paused' : 'false as sla_paused'}
            FROM efiling_files f
            LEFT JOIN efiling_users eu ON eu.user_id = $1 AND eu.is_active = true
            LEFT JOIN efiling_roles r ON r.id = eu.efiling_role_id
            WHERE f.id = $2
        `, [session.user.id, id]);

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const data = result.rows[0];
        const roleCode = (data.role_code || '').toUpperCase();
        
        const canComplete = isCEORole(roleCode) && 
                           (data.is_assigned || data.is_marked_to || data.sla_paused);

        return NextResponse.json({ 
            can_complete: canComplete,
            is_ceo: isCEORole(roleCode),
            is_assigned: data.is_assigned || data.is_marked_to,
            sla_paused: data.sla_paused
        });

    } catch (error) {
        console.error('Error checking completion permission:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
}

