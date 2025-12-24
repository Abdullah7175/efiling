import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/efiling/dashboard/stats
 * Comprehensive dashboard statistics for e-filing system
 * Returns detailed insights including:
 * - Files by location (town/division/district)
 * - Files by department
 * - Files by status
 * - Files by workflow state
 * - Files by assigned role/level
 * - Files in progress
 * - Files at different levels
 */
export async function GET(request) {
    let client;
    try {
        const session = await auth();
        if (!session) {
            console.error('Dashboard stats - No session found');
            return NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 });
        }
        if (!session.user) {
            console.error('Dashboard stats - No user in session:', session);
            return NextResponse.json({ error: 'Unauthorized - No user in session' }, { status: 401 });
        }
        if (!session.user.id) {
            console.error('Dashboard stats - No user ID in session:', session.user);
            return NextResponse.json({ error: 'Unauthorized - No user ID' }, { status: 401 });
        }

        client = await connectToDatabase();
        const isAdmin = [1, 2].includes(parseInt(session.user.role));

        // Get user's efiling profile if not admin
        let userEfilingId = null;
        let userDepartmentId = null;
        let userDistrictId = null;
        let userTownId = null;
        let userDivisionId = null;

        if (!isAdmin) {
            const userRes = await client.query(`
                SELECT eu.id, eu.department_id, eu.district_id, eu.town_id, eu.division_id
                FROM efiling_users eu
                JOIN users u ON eu.user_id = u.id
                WHERE u.id = $1 AND eu.is_active = true
            `, [session.user.id]);

            if (userRes.rows.length > 0) {
                const userEfiling = userRes.rows[0];
                userEfilingId = userEfiling.id;
                userDepartmentId = userEfiling.department_id;
                userDistrictId = userEfiling.district_id;
                userTownId = userEfiling.town_id;
                userDivisionId = userEfiling.division_id;
            }
        }

        // Build WHERE clause for non-admin users
        let whereClause = '';
        const params = [];
        let paramIndex = 1;

        if (!isAdmin && userEfilingId) {
            // Non-admin users see files from their department/location
            whereClause = `WHERE (
                f.department_id = $${paramIndex} OR
                (f.district_id = $${paramIndex + 1} AND $${paramIndex + 1} IS NOT NULL) OR
                (f.town_id = $${paramIndex + 2} AND $${paramIndex + 2} IS NOT NULL) OR
                (f.division_id = $${paramIndex + 3} AND $${paramIndex + 3} IS NOT NULL) OR
                f.created_by = $${paramIndex + 4} OR
                f.assigned_to = $${paramIndex + 4}
            )`;
            params.push(userDepartmentId, userDistrictId, userTownId, userDivisionId, userEfilingId);
            paramIndex += 5;
        }

        // Helper function to add conditions to WHERE clause
        const addCondition = (condition) => {
            return whereClause ? `${whereClause} AND ${condition}` : `WHERE ${condition}`;
        };

        // Helper to build WHERE clause for detailed queries
        const buildWhereForDetails = (baseCondition) => {
            if (whereClause) {
                return `${whereClause} AND ${baseCondition}`;
            }
            return `WHERE ${baseCondition}`;
        };

        // 1. Overall Statistics
        const overallStats = await client.query(`
            SELECT 
                COUNT(*) as total_files,
                COUNT(CASE WHEN f.status_id = (SELECT id FROM efiling_file_status WHERE code = 'DRAFT') THEN 1 END) as draft_files,
                COUNT(CASE WHEN f.status_id = (SELECT id FROM efiling_file_status WHERE code = 'IN_PROGRESS') THEN 1 END) as in_progress_files,
                COUNT(CASE WHEN f.status_id = (SELECT id FROM efiling_file_status WHERE code = 'PENDING_APPROVAL') THEN 1 END) as pending_approval_files,
                COUNT(CASE WHEN f.status_id = (SELECT id FROM efiling_file_status WHERE code = 'APPROVED') THEN 1 END) as approved_files,
                COUNT(CASE WHEN f.status_id = (SELECT id FROM efiling_file_status WHERE code = 'COMPLETED') THEN 1 END) as completed_files,
                COUNT(CASE WHEN f.sla_breached = true THEN 1 END) as overdue_files,
                COUNT(CASE WHEN f.sla_deadline IS NOT NULL AND f.sla_deadline < NOW() AND f.sla_breached = false THEN 1 END) as at_risk_files
            FROM efiling_files f
            ${whereClause}
        `, params);

        // 2. Files by Workflow State
        const workflowStats = await client.query(`
            SELECT 
                COALESCE(ws.current_state, 'TEAM_INTERNAL') as workflow_state,
                COUNT(*) as count
            FROM efiling_files f
            LEFT JOIN efiling_file_workflow_states ws ON f.workflow_state_id = ws.id
            ${whereClause}
            GROUP BY COALESCE(ws.current_state, 'TEAM_INTERNAL')
        `, params);

        // 3. Files by Department
        const departmentStats = await client.query(`
            SELECT 
                d.id,
                d.name as department_name,
                d.department_type,
                COUNT(*) as count,
                COUNT(CASE WHEN f.status_id = (SELECT id FROM efiling_file_status WHERE code = 'IN_PROGRESS') THEN 1 END) as in_progress,
                COUNT(CASE WHEN f.sla_breached = true THEN 1 END) as overdue
            FROM efiling_files f
            LEFT JOIN efiling_departments d ON f.department_id = d.id
            ${whereClause}
            GROUP BY d.id, d.name, d.department_type
            ORDER BY count DESC
        `, params);

        // 4. Files by Location (Town-based) - Use file's town_id or fallback to creator's town_id
        const townStats = await client.query(`
            SELECT 
                t.id,
                t.town as town_name,
                d.title as district_name,
                COUNT(*) as count,
                COUNT(CASE WHEN f.status_id = (SELECT id FROM efiling_file_status WHERE code = 'IN_PROGRESS') THEN 1 END) as in_progress
            FROM efiling_files f
            LEFT JOIN efiling_users eu ON f.created_by = eu.id
            LEFT JOIN town t ON COALESCE(f.town_id, eu.town_id) = t.id
            LEFT JOIN district d ON t.district_id = d.id
            ${whereClause ? `${whereClause} AND COALESCE(f.town_id, eu.town_id) IS NOT NULL` : 'WHERE COALESCE(f.town_id, eu.town_id) IS NOT NULL'}
            GROUP BY t.id, t.town, d.title
            ORDER BY count DESC
            LIMIT 20
        `, params);

        // 5. Files by Location (Division-based) - Use file's division_id or fallback to creator's division_id
        const divisionStats = await client.query(`
            SELECT 
                div.id,
                div.name as division_name,
                div.code as division_code,
                COUNT(*) as count,
                COUNT(CASE WHEN f.status_id = (SELECT id FROM efiling_file_status WHERE code = 'IN_PROGRESS') THEN 1 END) as in_progress
            FROM efiling_files f
            LEFT JOIN efiling_users eu ON f.created_by = eu.id
            LEFT JOIN divisions div ON COALESCE(f.division_id, eu.division_id) = div.id
            ${whereClause ? `${whereClause} AND COALESCE(f.division_id, eu.division_id) IS NOT NULL` : 'WHERE COALESCE(f.division_id, eu.division_id) IS NOT NULL'}
            GROUP BY div.id, div.name, div.code
            ORDER BY count DESC
            LIMIT 20
        `, params);

        // 6. Files by District - Use file's district_id, or derive from file's town, or fallback to creator's district_id/town
        const districtStats = await client.query(`
            SELECT 
                d.id,
                d.title as district_name,
                COUNT(*) as count,
                COUNT(CASE WHEN f.status_id = (SELECT id FROM efiling_file_status WHERE code = 'IN_PROGRESS') THEN 1 END) as in_progress
            FROM efiling_files f
            LEFT JOIN efiling_users eu ON f.created_by = eu.id
            LEFT JOIN town t ON COALESCE(f.town_id, eu.town_id) = t.id
            LEFT JOIN district d ON COALESCE(f.district_id, t.district_id, eu.district_id) = d.id
            ${whereClause ? `${whereClause} AND COALESCE(f.district_id, t.district_id, eu.district_id) IS NOT NULL` : 'WHERE COALESCE(f.district_id, t.district_id, eu.district_id) IS NOT NULL'}
            GROUP BY d.id, d.title
            ORDER BY count DESC
        `, params);

        // 7. Files by Assigned Role/Level
        const roleLevelStats = await client.query(`
            SELECT 
                r.id,
                r.name as role_name,
                r.code as role_code,
                COUNT(*) as count,
                COUNT(CASE WHEN f.status_id = (SELECT id FROM efiling_file_status WHERE code = 'IN_PROGRESS') THEN 1 END) as in_progress,
                COUNT(CASE WHEN ws.current_state = 'EXTERNAL' THEN 1 END) as at_external_level
            FROM efiling_files f
            LEFT JOIN efiling_users eu ON f.assigned_to = eu.id
            LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
            LEFT JOIN efiling_file_workflow_states ws ON f.workflow_state_id = ws.id
            ${addCondition('f.assigned_to IS NOT NULL')}
            GROUP BY r.id, r.name, r.code
            ORDER BY count DESC
        `, params);

        // 8. Files by Status (Detailed)
        const statusStats = await client.query(`
            SELECT 
                s.id,
                s.name as status_name,
                s.code as status_code,
                s.color,
                COUNT(*) as count
            FROM efiling_files f
            LEFT JOIN efiling_file_status s ON f.status_id = s.id
            ${whereClause}
            GROUP BY s.id, s.name, s.code, s.color
            ORDER BY count DESC
        `, params);

        // 9. Files by Priority
        const priorityStats = await client.query(`
            SELECT 
                COALESCE(f.priority, 'normal') as priority,
                COUNT(*) as count
            FROM efiling_files f
            ${whereClause}
            GROUP BY f.priority
            ORDER BY count DESC
        `, params);

        // 10. Files at Different Levels (EE, SE, CE, etc.)
        const levelStats = await client.query(`
            SELECT 
                level,
                COUNT(*) as count,
                COUNT(CASE WHEN status_id = (SELECT id FROM efiling_file_status WHERE code = 'IN_PROGRESS') THEN 1 END) as in_progress
            FROM (
                SELECT 
                    f.id,
                    f.status_id,
                    CASE 
                        WHEN r.code LIKE 'EE%' OR r.code LIKE 'XEN%' THEN 'Executive Engineer'
                        WHEN r.code LIKE 'SE%' THEN 'Superintending Engineer'
                        WHEN r.code LIKE 'CE%' THEN 'Chief Engineer'
                        WHEN r.code = 'COO' THEN 'Chief Operating Officer'
                        WHEN r.code = 'CEO' THEN 'Chief Executive Officer'
                        WHEN r.code LIKE 'CFO%' THEN 'Chief Financial Officer'
                        ELSE 'Other'
                    END as level
                FROM efiling_files f
                LEFT JOIN efiling_users eu ON f.assigned_to = eu.id
                LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
                ${addCondition('f.assigned_to IS NOT NULL')}
            ) subquery
            GROUP BY level
            ORDER BY 
                CASE level
                    WHEN 'Executive Engineer' THEN 1
                    WHEN 'Superintending Engineer' THEN 2
                    WHEN 'Chief Engineer' THEN 3
                    WHEN 'Chief Operating Officer' THEN 4
                    WHEN 'Chief Executive Officer' THEN 5
                    WHEN 'Chief Financial Officer' THEN 6
                    ELSE 7
                END
        `, params);

        // 11. Files by Category
        const categoryStats = await client.query(`
            SELECT 
                c.id,
                c.name as category_name,
                c.code as category_code,
                COUNT(*) as count
            FROM efiling_files f
            LEFT JOIN efiling_file_categories c ON f.category_id = c.id
            ${whereClause}
            GROUP BY c.id, c.name, c.code
            ORDER BY count DESC
            LIMIT 20
        `, params);

        // 12. Recent Activity (Last 7 days)
        const recentActivity = await client.query(`
            SELECT 
                DATE(f.created_at) as date,
                COUNT(*) as files_created
            FROM efiling_files f
            ${addCondition('f.created_at >= CURRENT_DATE - INTERVAL \'7 days\'')}
            GROUP BY DATE(f.created_at)
            ORDER BY date DESC
        `, params);

        // 13. Files by Workflow State with Details
        const workflowDetails = await client.query(`
            SELECT 
                COALESCE(ws.current_state, 'TEAM_INTERNAL') as workflow_state,
                COUNT(*) as total,
                COUNT(CASE WHEN f.status_id = (SELECT id FROM efiling_file_status WHERE code = 'IN_PROGRESS') THEN 1 END) as in_progress,
                COUNT(CASE WHEN ws.is_within_team = true THEN 1 END) as within_team,
                COUNT(CASE WHEN ws.is_within_team = false THEN 1 END) as external,
                COUNT(CASE WHEN ws.current_state = 'RETURNED_TO_CREATOR' THEN 1 END) as returned_to_creator
            FROM efiling_files f
            LEFT JOIN efiling_file_workflow_states ws ON f.workflow_state_id = ws.id
            ${whereClause}
            GROUP BY COALESCE(ws.current_state, 'TEAM_INTERNAL')
        `, params);

        // 14. SLA Statistics
        const slaStats = await client.query(`
            SELECT 
                COUNT(CASE WHEN f.sla_deadline IS NOT NULL THEN 1 END) as files_with_sla,
                COUNT(CASE WHEN f.sla_breached = true THEN 1 END) as breached,
                COUNT(CASE WHEN f.sla_deadline IS NOT NULL AND f.sla_deadline > NOW() AND f.sla_breached = false THEN 1 END) as on_track,
                COUNT(CASE WHEN f.sla_paused = true THEN 1 END) as paused,
                AVG(CASE WHEN f.sla_deadline IS NOT NULL AND f.sla_breached = false 
                    THEN EXTRACT(EPOCH FROM (f.sla_deadline - NOW())) / 3600 
                    ELSE NULL END) as avg_hours_remaining
            FROM efiling_files f
            ${whereClause}
        `, params);


        // 15. Detailed Breakdowns for each status
        // In Progress - WHERE files are (which level, which user)
        const inProgressDetails = await client.query(`
            SELECT 
                f.id,
                f.file_number,
                f.subject,
                s.code as status_code,
                f.assigned_to,
                eu.designation as assigned_to_designation,
                r.name as assigned_to_role_name,
                r.code as assigned_to_role_code,
                ws.current_state as workflow_state,
                d.name as department_name,
                t.town as town_name,
                div.name as division_name,
                f.sla_deadline,
                f.sla_breached
            FROM efiling_files f
            LEFT JOIN efiling_file_status s ON f.status_id = s.id
            LEFT JOIN efiling_users eu ON f.assigned_to = eu.id
            LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
            LEFT JOIN efiling_file_workflow_states ws ON f.workflow_state_id = ws.id
            LEFT JOIN efiling_departments d ON f.department_id = d.id
            LEFT JOIN town t ON f.town_id = t.id
            LEFT JOIN divisions div ON f.division_id = div.id
            ${buildWhereForDetails("s.code = 'IN_PROGRESS'")}
            ORDER BY f.created_at DESC
            LIMIT 50
        `, params);

        // Pending Approval - WHY pending (waiting for what action)
        const pendingDetails = await client.query(`
            SELECT 
                f.id,
                f.file_number,
                f.subject,
                s.code as status_code,
                f.assigned_to,
                eu.designation as assigned_to_designation,
                r.name as assigned_to_role_name,
                r.code as assigned_to_role_code,
                ws.current_state as workflow_state,
                d.name as department_name,
                t.town as town_name,
                div.name as division_name,
                f.sla_deadline,
                f.sla_breached,
                CASE 
                    WHEN ws.current_state = 'EXTERNAL' THEN 'Waiting for external approval'
                    WHEN f.assigned_to IS NULL THEN 'Not assigned to anyone'
                    WHEN r.code LIKE 'SE%' THEN 'Waiting for Superintending Engineer approval'
                    WHEN r.code LIKE 'CE%' THEN 'Waiting for Chief Engineer approval'
                    WHEN r.code = 'COO' THEN 'Waiting for COO approval'
                    WHEN r.code = 'CEO' THEN 'Waiting for CEO approval'
                    ELSE 'Waiting for approval'
                END as pending_reason
            FROM efiling_files f
            LEFT JOIN efiling_file_status s ON f.status_id = s.id
            LEFT JOIN efiling_users eu ON f.assigned_to = eu.id
            LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
            LEFT JOIN efiling_file_workflow_states ws ON f.workflow_state_id = ws.id
            LEFT JOIN efiling_departments d ON f.department_id = d.id
            LEFT JOIN town t ON f.town_id = t.id
            LEFT JOIN divisions div ON f.division_id = div.id
            ${buildWhereForDetails("s.code = 'PENDING_APPROVAL'")}
            ORDER BY f.created_at DESC
            LIMIT 50
        `, params);

        // Approved - WHO approved
        const approvedDetails = await client.query(`
            SELECT DISTINCT ON (f.id)
                f.id,
                f.file_number,
                f.subject,
                s.code as status_code,
                ds.user_name as approved_by_name,
                ds.user_designation as approved_by_designation,
                ds.timestamp as approved_at,
                d.name as department_name,
                t.town as town_name,
                div.name as division_name
            FROM efiling_files f
            LEFT JOIN efiling_file_status s ON f.status_id = s.id
            LEFT JOIN LATERAL (
                SELECT user_name, user_designation, timestamp
                FROM efiling_document_signatures
                WHERE file_id = f.id AND is_active = true
                ORDER BY timestamp DESC
                LIMIT 1
            ) ds ON true
            LEFT JOIN efiling_departments d ON f.department_id = d.id
            LEFT JOIN town t ON f.town_id = t.id
            LEFT JOIN divisions div ON f.division_id = div.id
            ${buildWhereForDetails("s.code = 'APPROVED'")}
            ORDER BY f.id, ds.timestamp DESC
            LIMIT 50
        `, params);

        // Overdue - WHY overdue (SLA breached)
        const overdueDetails = await client.query(`
            SELECT 
                f.id,
                f.file_number,
                f.subject,
                s.code as status_code,
                f.assigned_to,
                eu.designation as assigned_to_designation,
                r.name as assigned_to_role_name,
                r.code as assigned_to_role_code,
                f.sla_deadline,
                EXTRACT(EPOCH FROM (NOW() - f.sla_deadline)) / 3600 as hours_overdue,
                d.name as department_name,
                t.town as town_name,
                div.name as division_name,
                CASE 
                    WHEN f.sla_deadline IS NULL THEN 'No SLA deadline set'
                    WHEN f.sla_deadline < NOW() THEN CONCAT('SLA deadline passed ', ROUND(EXTRACT(EPOCH FROM (NOW() - f.sla_deadline)) / 3600), ' hours ago')
                    ELSE 'Within SLA'
                END as overdue_reason
            FROM efiling_files f
            LEFT JOIN efiling_file_status s ON f.status_id = s.id
            LEFT JOIN efiling_users eu ON f.assigned_to = eu.id
            LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
            LEFT JOIN efiling_departments d ON f.department_id = d.id
            LEFT JOIN town t ON f.town_id = t.id
            LEFT JOIN divisions div ON f.division_id = div.id
            ${buildWhereForDetails("(f.sla_breached = true OR (f.sla_deadline IS NOT NULL AND f.sla_deadline < NOW() AND s.code != 'COMPLETED'))")}
            ORDER BY f.sla_deadline ASC NULLS LAST
            LIMIT 50
        `, params);

        // At Risk - WHY at risk (approaching SLA deadline)
        const atRiskDetails = await client.query(`
            SELECT 
                f.id,
                f.file_number,
                f.subject,
                s.code as status_code,
                f.assigned_to,
                eu.designation as assigned_to_designation,
                r.name as assigned_to_role_name,
                r.code as assigned_to_role_code,
                f.sla_deadline,
                EXTRACT(EPOCH FROM (f.sla_deadline - NOW())) / 3600 as hours_remaining,
                d.name as department_name,
                t.town as town_name,
                div.name as division_name,
                CASE 
                    WHEN EXTRACT(EPOCH FROM (f.sla_deadline - NOW())) / 3600 < 24 THEN 'Less than 24 hours remaining'
                    WHEN EXTRACT(EPOCH FROM (f.sla_deadline - NOW())) / 3600 < 48 THEN 'Less than 48 hours remaining'
                    ELSE 'Approaching deadline'
                END as risk_reason
            FROM efiling_files f
            LEFT JOIN efiling_file_status s ON f.status_id = s.id
            LEFT JOIN efiling_users eu ON f.assigned_to = eu.id
            LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
            LEFT JOIN efiling_departments d ON f.department_id = d.id
            LEFT JOIN town t ON f.town_id = t.id
            LEFT JOIN divisions div ON f.division_id = div.id
            ${buildWhereForDetails("f.sla_deadline IS NOT NULL AND f.sla_deadline > NOW() AND f.sla_breached = false AND EXTRACT(EPOCH FROM (f.sla_deadline - NOW())) / 3600 < 72")}
            ORDER BY f.sla_deadline ASC
            LIMIT 50
        `, params);

        const overall = overallStats.rows[0] || {};

        return NextResponse.json({
            success: true,
            data: {
                overall: {
                    total_files: parseInt(overall.total_files || 0),
                    draft_files: parseInt(overall.draft_files || 0),
                    in_progress_files: parseInt(overall.in_progress_files || 0),
                    pending_approval_files: parseInt(overall.pending_approval_files || 0),
                    approved_files: parseInt(overall.approved_files || 0),
                    completed_files: parseInt(overall.completed_files || 0),
                    overdue_files: parseInt(overall.overdue_files || 0),
                    at_risk_files: parseInt(overall.at_risk_files || 0)
                },
                detailed_breakdowns: {
                    in_progress: inProgressDetails.rows.map(row => ({
                        id: row.id,
                        file_number: row.file_number,
                        subject: row.subject,
                        assigned_to_role: row.assigned_to_role_name,
                        assigned_to_role_code: row.assigned_to_role_code,
                        assigned_to_designation: row.assigned_to_designation,
                        workflow_state: row.workflow_state,
                        department: row.department_name,
                        town: row.town_name,
                        division: row.division_name,
                        sla_deadline: row.sla_deadline,
                        sla_breached: row.sla_breached
                    })),
                    pending: pendingDetails.rows.map(row => ({
                        id: row.id,
                        file_number: row.file_number,
                        subject: row.subject,
                        assigned_to_role: row.assigned_to_role_name,
                        assigned_to_role_code: row.assigned_to_role_code,
                        assigned_to_designation: row.assigned_to_designation,
                        workflow_state: row.workflow_state,
                        department: row.department_name,
                        town: row.town_name,
                        division: row.division_name,
                        pending_reason: row.pending_reason,
                        sla_deadline: row.sla_deadline,
                        sla_breached: row.sla_breached
                    })),
                    approved: approvedDetails.rows.map(row => ({
                        id: row.id,
                        file_number: row.file_number,
                        subject: row.subject,
                        approved_by_name: row.approved_by_name,
                        approved_by_designation: row.approved_by_designation,
                        approved_at: row.approved_at,
                        department: row.department_name,
                        town: row.town_name,
                        division: row.division_name
                    })),
                    overdue: overdueDetails.rows.map(row => ({
                        id: row.id,
                        file_number: row.file_number,
                        subject: row.subject,
                        assigned_to_role: row.assigned_to_role_name,
                        assigned_to_role_code: row.assigned_to_role_code,
                        assigned_to_designation: row.assigned_to_designation,
                        department: row.department_name,
                        town: row.town_name,
                        division: row.division_name,
                        sla_deadline: row.sla_deadline,
                        hours_overdue: parseFloat(row.hours_overdue || 0),
                        overdue_reason: row.overdue_reason
                    })),
                    at_risk: atRiskDetails.rows.map(row => ({
                        id: row.id,
                        file_number: row.file_number,
                        subject: row.subject,
                        assigned_to_role: row.assigned_to_role_name,
                        assigned_to_role_code: row.assigned_to_role_code,
                        assigned_to_designation: row.assigned_to_designation,
                        department: row.department_name,
                        town: row.town_name,
                        division: row.division_name,
                        sla_deadline: row.sla_deadline,
                        hours_remaining: parseFloat(row.hours_remaining || 0),
                        risk_reason: row.risk_reason
                    }))
                },
                by_workflow_state: workflowStats.rows.map(row => ({
                    state: row.workflow_state,
                    count: parseInt(row.count || 0)
                })),
                by_department: departmentStats.rows.map(row => ({
                    id: row.id,
                    name: row.department_name,
                    type: row.department_type,
                    total: parseInt(row.count || 0),
                    in_progress: parseInt(row.in_progress || 0),
                    overdue: parseInt(row.overdue || 0)
                })),
                by_town: townStats.rows.map(row => ({
                    id: row.id,
                    town_name: row.town_name,
                    district_name: row.district_name,
                    total: parseInt(row.count || 0),
                    in_progress: parseInt(row.in_progress || 0)
                })),
                by_division: divisionStats.rows.map(row => ({
                    id: row.id,
                    division_name: row.division_name,
                    division_code: row.division_code,
                    total: parseInt(row.count || 0),
                    in_progress: parseInt(row.in_progress || 0)
                })),
                by_district: districtStats.rows.map(row => ({
                    id: row.id,
                    district_name: row.district_name,
                    total: parseInt(row.count || 0),
                    in_progress: parseInt(row.in_progress || 0)
                })),
                by_role_level: roleLevelStats.rows.map(row => ({
                    id: row.id,
                    role_name: row.role_name,
                    role_code: row.role_code,
                    total: parseInt(row.count || 0),
                    in_progress: parseInt(row.in_progress || 0),
                    at_external_level: parseInt(row.at_external_level || 0)
                })),
                by_status: statusStats.rows.map(row => ({
                    id: row.id,
                    status_name: row.status_name,
                    status_code: row.status_code,
                    color: row.color,
                    count: parseInt(row.count || 0)
                })),
                by_priority: priorityStats.rows.map(row => ({
                    priority: row.priority,
                    count: parseInt(row.count || 0)
                })),
                by_level: levelStats.rows.map(row => ({
                    level: row.level,
                    total: parseInt(row.count || 0),
                    in_progress: parseInt(row.in_progress || 0)
                })),
                by_category: categoryStats.rows.map(row => ({
                    id: row.id,
                    category_name: row.category_name,
                    category_code: row.category_code,
                    count: parseInt(row.count || 0)
                })),
                recent_activity: recentActivity.rows.map(row => ({
                    date: row.date,
                    files_created: parseInt(row.files_created || 0)
                })),
                workflow_details: workflowDetails.rows.map(row => ({
                    workflow_state: row.workflow_state,
                    total: parseInt(row.total || 0),
                    in_progress: parseInt(row.in_progress || 0),
                    within_team: parseInt(row.within_team || 0),
                    external: parseInt(row.external || 0),
                    returned_to_creator: parseInt(row.returned_to_creator || 0)
                })),
                sla: {
                    files_with_sla: parseInt(slaStats.rows[0]?.files_with_sla || 0),
                    breached: parseInt(slaStats.rows[0]?.breached || 0),
                    on_track: parseInt(slaStats.rows[0]?.on_track || 0),
                    paused: parseInt(slaStats.rows[0]?.paused || 0),
                    avg_hours_remaining: parseFloat(slaStats.rows[0]?.avg_hours_remaining || 0)
                }
            }
        });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        return NextResponse.json(
            { error: 'Failed to fetch dashboard statistics', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

