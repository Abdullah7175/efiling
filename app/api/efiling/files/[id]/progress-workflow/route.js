import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { logAction, ENTITY_TYPES } from '@/lib/actionLogger';

const STATUS_CODE_MAP = {
    APPROVE: 'APPROVED',
    REJECT: 'REJECTED',
    RETURN: 'DRAFT'
};

export async function POST(request, { params }) {
    let client;
    try {
        client = await connectToDatabase();
        const { id } = await params;
        const body = await request.json();
        const { action, userId, remarks } = body;

        if (!action) {
            return NextResponse.json({ error: 'Action is required' }, { status: 400 });
        }

        const upperAction = action.toUpperCase();

        if (upperAction === 'FORWARD') {
            return NextResponse.json({
                message: 'Use the mark-to flow to forward files under geographic routing.'
            });
        }

        if (!STATUS_CODE_MAP[upperAction]) {
            return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
        }

        await client.query('BEGIN');

        const fileRes = await client.query(`
            SELECT f.id, f.file_number, f.status_id, f.assigned_to, f.department_id
            FROM efiling_files f
            WHERE f.id = $1
        `, [id]);

        if (fileRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const file = fileRes.rows[0];
        const statusCode = STATUS_CODE_MAP[upperAction];

        const statusRes = await client.query(`
            SELECT id FROM efiling_file_status WHERE code = $1
        `, [statusCode]);

        if (statusRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: `Status not configured for code ${statusCode}` }, { status: 500 });
        }

        const newStatusId = statusRes.rows[0].id;

        await client.query(`
            UPDATE efiling_files
            SET status_id = $1,
                updated_at = NOW(),
                remarks = COALESCE($2, remarks)
            WHERE id = $3
        `, [newStatusId, remarks || null, file.id]);

        if (remarks) {
            await client.query(`
                INSERT INTO efiling_comments (
                    file_id, user_id, comment, is_internal, created_at
                ) VALUES ($1, $2, $3, true, NOW())
            `, [file.id, userId || null, remarks]);
        }

        await client.query(`
            INSERT INTO efiling_file_movements (
                file_id, from_user_id, to_user_id, action_type, remarks, created_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
            file.id,
            userId || null,
            file.assigned_to || null,
            upperAction,
            remarks || null
        ]);

        await client.query('COMMIT');

        await logAction(request, 'FILE_STATUS_CHANGE', ENTITY_TYPES.EFILING_FILE, {
            entityId: file.id,
            entityName: file.file_number,
            details: {
                action: upperAction,
                newStatus: statusCode,
                remarks
            }
        });

        return NextResponse.json({
            success: true,
            action: upperAction,
            status_code: statusCode
        });
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch {}
        }
        console.error('Progress workflow error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function GET(request, { params }) {
    let client;
    try {
        client = await connectToDatabase();
        const { id } = await params;

        // Check if SLA columns exist (check each column individually)
        let hasSlaDeadline = false;
        let hasSlaPaused = false;
        let hasSlaPauseCount = false;
        try {
            const [slaDeadlineCheck, slaPausedCheck, slaPauseCountCheck] = await Promise.all([
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
                        AND column_name = 'sla_pause_count'
                    );
                `)
            ]);
            hasSlaDeadline = slaDeadlineCheck.rows[0]?.exists || false;
            hasSlaPaused = slaPausedCheck.rows[0]?.exists || false;
            hasSlaPauseCount = slaPauseCountCheck.rows[0]?.exists || false;
        } catch (checkError) {
            console.warn('Could not check for SLA columns:', checkError.message);
        }

        const res = await client.query(`
            SELECT 
                f.id,
                f.file_number,
                f.subject,
                ${hasSlaDeadline ? `f.sla_deadline,` : `NULL as sla_deadline,`}
                ${hasSlaPaused ? `f.sla_paused,` : `false as sla_paused,`}
                ${hasSlaPauseCount ? `f.sla_pause_count,` : `0 as sla_pause_count,`}
                f.updated_at,
                s.name AS status_name,
                s.code AS status_code,
                d.name AS department_name,
                assignee_user.name AS assignee_name,
                assignee_role.name AS assignee_role
            FROM efiling_files f
            LEFT JOIN efiling_file_status s ON f.status_id = s.id
            LEFT JOIN efiling_departments d ON f.department_id = d.id
            LEFT JOIN efiling_users assignee ON f.assigned_to = assignee.id
            LEFT JOIN users assignee_user ON assignee.user_id = assignee_user.id
            LEFT JOIN efiling_roles assignee_role ON assignee.efiling_role_id = assignee_role.id
            WHERE f.id = $1
        `, [id]);

        if (res.rows.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const record = res.rows[0];
        const slaStatus = hasSlaPaused && record.sla_paused
            ? 'PAUSED'
            : hasSlaDeadline && record.sla_deadline && new Date(record.sla_deadline).getTime() < Date.now()
                ? 'BREACHED'
                : (hasSlaDeadline && record.sla_deadline ? 'ACTIVE' : 'PENDING');

        return NextResponse.json({
            workflow_template_name: 'Geographic Routing',
            stage_name: record.assignee_role || 'Unassigned',
            stage_order: null,
            workflow_status: record.status_code || 'UNKNOWN',
            description: 'Workflow stages have been replaced with geographic routing rules.',
            department_name: record.department_name,
            role_name: record.assignee_role || 'Unassigned',
            assignee_name: record.assignee_name || null,
            sla_deadline: hasSlaDeadline ? record.sla_deadline : null,
            sla_status: slaStatus,
            sla_paused: hasSlaPaused ? record.sla_paused : false,
            sla_pause_count: hasSlaPauseCount ? (record.sla_pause_count || 0) : 0,
            updated_at: record.updated_at
        });
    } catch (error) {
        console.error('Workflow status fetch error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
}
