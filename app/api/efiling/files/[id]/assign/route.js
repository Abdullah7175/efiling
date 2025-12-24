import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { eFileActionLogger } from '@/lib/efilingActionLogger';
import { getAllowedRecipients, getSLA, validateGeographicMatch } from '@/lib/efilingGeographicRouting';
import { isCEORole } from '@/lib/efilingSLAManager';
import { auth } from '@/auth';

export async function POST(request, { params }) {
    let client;
    try {
        client = await connectToDatabase();
        const { id } = await params; // file id
        const body = await request.json();
        const { to_user_id, remarks } = body;

        // Actor identity from session
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!id || !to_user_id) {
            return NextResponse.json({ error: 'file id and to_user_id are required' }, { status: 400 });
        }

        // Load file with geographic information
        const fileRes = await client.query(`
            SELECT f.*, 
                   eu_from.id as from_user_efiling_id,
                   eu_from.district_id as from_district_id,
                   eu_from.town_id as from_town_id,
                   eu_from.division_id as from_division_id,
                   eu_from.efiling_role_id as from_role_id
            FROM efiling_files f
            LEFT JOIN efiling_users eu_from ON eu_from.id = f.assigned_to
            WHERE f.id = $1
        `, [id]);
        
        if (fileRes.rows.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }
        const file = fileRes.rows[0];

        // Load current user (from) and target user (to)
        const fromRes = await client.query(`
            SELECT eu.id, eu.department_id, eu.efiling_role_id, eu.district_id, eu.town_id, eu.division_id,
                   r.code as role_code, eu.is_consultant
            FROM efiling_users eu
            JOIN users u ON eu.user_id = u.id
            LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
            WHERE u.id = $1 AND eu.is_active = true
        `, [session.user.id]);
        
        if (fromRes.rows.length === 0) {
            return NextResponse.json({ error: 'Current user not active in e-filing' }, { status: 403 });
        }
        const fromUser = fromRes.rows[0];

        const toRes = await client.query(`
            SELECT eu.id, eu.department_id, eu.efiling_role_id, eu.district_id, eu.town_id, eu.division_id,
                   r.code as role_code, eu.is_consultant
            FROM efiling_users eu
            LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
            WHERE eu.id = $1 AND eu.is_active = true
        `, [to_user_id]);
        
        if (toRes.rows.length === 0) {
            return NextResponse.json({ error: 'Target user not found or inactive' }, { status: 404 });
        }
        const toUser = toRes.rows[0];

        // Get role codes
        const fromRoleCode = fromUser.role_code || '';
        const toRoleCode = toUser.role_code || '';
        const fromRoleUpper = fromRoleCode.toUpperCase();
        const isCEO = isCEORole(fromRoleUpper);
        const isCOO = fromRoleUpper === 'COO';

        // Get department type for geographic validation
        // Determine allowed recipients using SLA matrix rules
        const allowedRecipients = await getAllowedRecipients(client, {
            fromUserEfilingId: fromUser.id,
            fileId: id,
            fileDepartmentId: file.department_id,
            fileDistrictId: file.district_id,
            fileTownId: file.town_id,
            fileDivisionId: file.division_id
        });

        const allowedRecipientMap = new Map(allowedRecipients.map((recipient) => [recipient.id, recipient]));

        const targetRecipient = allowedRecipientMap.get(toUser.id);

        if (!isCEO && !isCOO) {
            if (!targetRecipient) {
                return NextResponse.json({
                    error: 'Selected user is not allowed based on SLA matrix/location rules'
                }, { status: 403 });
            }

            const expectedScope = targetRecipient.allowed_level_scope || 'district';
            const isValid = validateGeographicMatch(
                {
                    district_id: file.district_id,
                    town_id: file.town_id,
                    division_id: file.division_id
                },
                {
                    district_id: toUser.district_id,
                    town_id: toUser.town_id,
                    division_id: toUser.division_id
                },
                expectedScope
            );

            if (!isValid) {
                return NextResponse.json({ 
                    error: `Geographic mismatch: Target user must be in same ${expectedScope}`
                }, { status: 403 });
            }
        }

        // Check if SLA deadline column exists
        let hasSlaDeadline = false;
        try {
            const slaDeadlineCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                    AND table_name = 'efiling_files'
                    AND column_name = 'sla_deadline'
                );
            `);
            hasSlaDeadline = slaDeadlineCheck.rows[0]?.exists || false;
        } catch (checkError) {
            console.warn('Could not check for SLA deadline column:', checkError.message);
        }

        // Compute SLA deadline from SLA matrix (only if SLA deadline column exists)
        let slaDeadline = null;
        if (hasSlaDeadline) {
            try {
                const slaHours = await getSLA(client, fromRoleCode, toRoleCode);
                const deadline = new Date();
                deadline.setHours(deadline.getHours() + slaHours);
                slaDeadline = deadline.toISOString();
            } catch (slaError) {
                console.warn('Error computing SLA deadline:', slaError.message);
                // Continue without SLA deadline if computation fails
            }
        }

        // Begin transaction
        await client.query('BEGIN');

        // Update file and assignment
        const updateQuery = hasSlaDeadline && slaDeadline
            ? `UPDATE efiling_files 
               SET assigned_to = $1, updated_at = NOW(), sla_deadline = COALESCE($2, sla_deadline)
               WHERE id = $3`
            : `UPDATE efiling_files 
               SET assigned_to = $1, updated_at = NOW()
               WHERE id = $2`;
        
        const updateParams = hasSlaDeadline && slaDeadline
            ? [toUser.id, slaDeadline, id]
            : [toUser.id, id];
        
        await client.query(updateQuery, updateParams);

        // Log movement
        await client.query(`
            INSERT INTO efiling_file_movements (
                file_id, from_user_id, to_user_id, 
                from_department_id, to_department_id, 
                action_type, remarks, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [
            id, 
            fromUser.id, 
            toUser.id, 
            fromUser.department_id, 
            toUser.department_id, 
            'ASSIGNED', 
            remarks || null
        ]);

        // Notification to new assignee
        await client.query(`
            INSERT INTO efiling_notifications (
                user_id, file_id, type, message, priority, action_required, created_at
            )
            VALUES ($1, $2, $3, $4, 'normal', true, NOW())
        `, [toUser.id, id, 'file_assigned', `A file has been assigned to you by user ${fromUser.id}`]);

        // Notify creator as well about current assignment
        try {
            const creatorRes = await client.query('SELECT created_by FROM efiling_files WHERE id = $1', [id]);
            const creatorEUserId = creatorRes.rows[0]?.created_by;
            if (creatorEUserId && creatorEUserId !== toUser.id) {
                await client.query(`
                    INSERT INTO efiling_notifications (
                        user_id, file_id, type, message, priority, action_required, created_at
                    )
                    VALUES ($1, $2, $3, $4, 'low', false, NOW())
                `, [creatorEUserId, id, 'workflow_action', `File is now assigned to user ${toUser.id}`]);
            }
        } catch (e) {
            console.warn('Creator notify failed', e);
        }

        await client.query('COMMIT');

        // High-level logging
        try {
            await eFileActionLogger.logAction({
                entityType: 'efiling_file',
                entityId: id.toString(),
                action: 'FILE_ASSIGNED',
                userId: fromUser.id.toString(),
                details: { to_user_id, sla_deadline: slaDeadline, remarks }
            });
        } catch {}

        return NextResponse.json({ success: true, sla_deadline: slaDeadline });
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch {}
        }
        console.error('Assign error:', error);
        return NextResponse.json({ error: error.message || 'Failed to assign file' }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}
