import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectToDatabase } from '@/lib/db';
import { eFileActionLogger, EFILING_ACTION_TYPES, EFILING_ENTITY_TYPES } from '@/lib/efilingActionLogger';
import { auth } from '@/auth';
import { getFiscalYear } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    // SECURITY: Require authentication
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    // Helper function to parse and validate integer parameters
    const parseIntegerParam = (value, paramName) => {
        if (!value || value === 'undefined' || value === 'null' || value.trim() === '') {
            return null;
        }
        const parsed = parseInt(value, 10);
        if (isNaN(parsed) || parsed <= 0) {
            console.warn(`Invalid ${paramName} parameter: ${value}`);
            return null;
        }
        return parsed;
    };
    
    const department_id = parseIntegerParam(searchParams.get('department_id'), 'department_id');
    const status_id = parseIntegerParam(searchParams.get('status_id'), 'status_id');
    const created_by = parseIntegerParam(searchParams.get('created_by'), 'created_by');
    const assigned_to = parseIntegerParam(searchParams.get('assigned_to'), 'assigned_to');
    const work_request_id = parseIntegerParam(searchParams.get('work_request_id'), 'work_request_id');
    const priority = searchParams.get('priority'); // String, not integer
    
    // New filter parameters
    const file_id = parseIntegerParam(searchParams.get('file_id'), 'file_id');
    const district_id = parseIntegerParam(searchParams.get('district_id'), 'district_id');
    const town_id = parseIntegerParam(searchParams.get('town_id'), 'town_id');
    const division_id = parseIntegerParam(searchParams.get('division_id'), 'division_id');
    const zone_id = parseIntegerParam(searchParams.get('zone_id'), 'zone_id');
    const category_id = parseIntegerParam(searchParams.get('category_id'), 'category_id');
    const file_type_id = parseIntegerParam(searchParams.get('file_type_id'), 'file_type_id');
    const subject_search = searchParams.get('subject_search'); // Text search
    const file_number_search = searchParams.get('file_number_search'); // Text search
    const date_from = searchParams.get('date_from'); // Date string
    const date_to = searchParams.get('date_to'); // Date string
    
    let page = parseInt(searchParams.get('page') || '1');
    let limit = parseInt(searchParams.get('limit') || '10');
    let offset = (page - 1) * limit;
    
    // Add authentication check for general access
    try {
        // Log request details for debugging
        const cookieHeader = request.headers.get('cookie');
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get(
            process.env.NODE_ENV === 'production' 
                ? '__Secure-next-auth.session-token' 
                : 'next-auth.session-token'
        ) || cookieStore.get('authjs.session-token') || cookieStore.get('__Secure-authjs.session-token');
        
        console.log('Files route - Cookie header present:', !!cookieHeader);
        console.log('Files route - Session cookie present:', !!sessionCookie);
        console.log('Files route - Request URL:', request.url);
        
        const session = await auth();
        
        // Better error logging
        if (!session) {
            console.error('Files route - No session found. Cookies:', cookieHeader ? 'Present' : 'Missing', 'Session cookie:', sessionCookie ? 'Present' : 'Missing');
            return NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 });
        }
        
        if (!session.user) {
            console.error('Files route - No user in session:', JSON.stringify(session, null, 2));
            return NextResponse.json({ error: 'Unauthorized - No user in session' }, { status: 401 });
        }
        
        if (!session.user.id) {
            console.error('Files route - No user ID in session:', JSON.stringify(session.user, null, 2));
            return NextResponse.json({ error: 'Unauthorized - No user ID' }, { status: 401 });
        }
        
        console.log('Files route - Session found for user:', session.user.id);
        
        // Allow access for admin/manager roles (1,2) or efiling users
        if (![1,2].includes(parseInt(session.user.role))) {
            // Check if this is an efiling user
            const client = await connectToDatabase();
            try {
                const efilingUserCheck = await client.query(
                    'SELECT id FROM efiling_users WHERE user_id = $1 AND is_active = true', 
                    [session.user.id]
                );
                if (efilingUserCheck.rows.length === 0) {
                    await client.release();
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                }
                await client.release();
            } catch (dbError) {
                console.error('Database error checking efiling user:', dbError);
                return NextResponse.json({ error: 'Database error' }, { status: 500 });
            }
        }

        // Admins should see all files by default (no server-side limit) unless a limit is explicitly provided
        if ([1,2].includes(parseInt(session.user.role)) && !searchParams.get('limit')) {
            limit = 0; // no limit
            offset = 0;
        }
    } catch (authError) {
        console.error('Authentication error:', authError);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const client = await connectToDatabase();
    
    try {
        // Check if the efiling_files table exists
        try {
            const tableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'efiling_files'
                );
            `);
            console.log('efiling_files table exists:', tableCheck.rows[0].exists);
            
            if (!tableCheck.rows[0].exists) {
                return NextResponse.json({ error: 'efiling_files table does not exist' }, { status: 500 });
            }
        } catch (tableError) {
            console.error('Error checking table existence:', tableError);
            return NextResponse.json({ error: 'Database schema error' }, { status: 500 });
        }
        
        if (id) {
            try {
                // First, let's try a simple query to see if the file exists
                const simpleQuery = 'SELECT * FROM efiling_files WHERE id = $1';
                console.log('Fetching file with ID:', id);
                const simpleResult = await client.query(simpleQuery, [id]);
                console.log('Simple file query result:', simpleResult.rows.length, 'rows found');
                
                if (simpleResult.rows.length === 0) {
                    return NextResponse.json({ error: 'File not found' }, { status: 404 });
                }

                // Access control: only creator or current assignee may view
                try {
                    const session = await auth(request);
                    if (!session?.user?.id) {
                        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
                    }
                    // Admin/Manager bypasses ACL for single file fetch
                    if (![1,2].includes(parseInt(session.user.role))) {
                        const userId = session.user.id;
                        const efUserRes = await client.query('SELECT id FROM efiling_users WHERE user_id = $1 AND is_active = true', [userId]);
                        const efUserId = efUserRes.rows[0]?.id;
                        if (!efUserId) {
                            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
                        }
                        const aclRes = await client.query(`
                            SELECT 1
                            FROM efiling_files f
                    WHERE f.id = $1 AND (f.created_by = $2 OR f.assigned_to = $2)
                        `, [id, efUserId]);
                        if (aclRes.rows.length === 0) {
                            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                        }
                    }
                } catch (aclErr) {
                    console.error('ACL check error:', aclErr);
                    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
                }
                
                // Now let's try the full query with JOINs
                const fullQuery = `
                    SELECT f.*, 
                           c.name AS category_name,
                           d.name AS department_name,
                           s.name AS status_name,
                           s.code AS status_code,
                           s.color AS status_color,
                           COALESCE(ab.designation, 'Unassigned') AS assigned_to_name,
                           cr_users.name AS created_by_name,
                           cr_users.name AS creator_user_name
                    FROM efiling_files f
                    LEFT JOIN efiling_file_categories c ON f.category_id = c.id
                    LEFT JOIN efiling_departments d ON f.department_id = d.id
                    LEFT JOIN efiling_file_status s ON f.status_id = s.id
                    LEFT JOIN efiling_users ab ON f.assigned_to = ab.id
                    LEFT JOIN efiling_users cr ON f.created_by = cr.id
                    LEFT JOIN users cr_users ON cr.user_id = cr_users.id
                    WHERE f.id = $1
                `;
                
                const fullResult = await client.query(fullQuery, [id]);
                console.log('Full file query result:', fullResult.rows.length, 'rows found');
                
                return NextResponse.json(fullResult.rows[0]);
            } catch (error) {
                console.error('Error fetching single file:', error);
                return NextResponse.json({ 
                    error: 'Database error while fetching file',
                    details: error.message 
                }, { status: 500 });
            }
        } else {
            // We'll compute total with filters later; also compute overall for logs
            const overallCountQuery = await client.query('SELECT COUNT(*) as total FROM efiling_files');
            console.log('Total files in database:', overallCountQuery.rows[0].total);
            
            // Check if optional tables and columns exist
            let hasDocumentSignaturesTable = false;
            let hasFileTypesTable = false;
            let hasSlaDeadline = false;
            let hasSlaPaused = false;
            let hasSlaAccumulatedHours = false;
            let hasSlaPauseCount = false;
            try {
                const [signaturesCheck, fileTypesCheck, slaDeadlineCheck, slaPausedCheck, slaAccumulatedHoursCheck, slaPauseCountCheck] = await Promise.all([
                    client.query(`
                        SELECT EXISTS (
                            SELECT FROM information_schema.tables 
                            WHERE table_schema = 'public' 
                            AND table_name = 'efiling_document_signatures'
                        );
                    `),
                    client.query(`
                        SELECT EXISTS (
                            SELECT FROM information_schema.tables 
                            WHERE table_schema = 'public' 
                            AND table_name = 'efiling_file_types'
                        );
                    `),
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
                hasDocumentSignaturesTable = signaturesCheck.rows[0]?.exists || false;
                hasFileTypesTable = fileTypesCheck.rows[0]?.exists || false;
                hasSlaDeadline = slaDeadlineCheck.rows[0]?.exists || false;
                hasSlaPaused = slaPausedCheck.rows[0]?.exists || false;
                hasSlaAccumulatedHours = slaAccumulatedHoursCheck.rows[0]?.exists || false;
                hasSlaPauseCount = slaPauseCountCheck.rows[0]?.exists || false;
            } catch (checkError) {
                console.warn('Could not check for optional tables/columns:', checkError.message);
            }
            
            let query = `
                SELECT DISTINCT ON (f.id)
                       f.*,
                       c.name as category_name,
                       d.name as department_name,
                       s.name as status_name, s.code as status_code, s.color as status_color,
                       COALESCE(ab.designation, 'Unassigned') as assigned_to_name,
                       r.name as assigned_to_role_name,
                       cr_users.name as creator_user_name,
                       curr_users.name as current_assignee_user_name,
                       ${hasDocumentSignaturesTable ? `ls.last_signed_by_name,
                       ls.last_signed_at,` : `NULL as last_signed_by_name,
                       NULL as last_signed_at,`}
                       ${hasSlaDeadline ? `f.sla_deadline,
                       (f.sla_deadline IS NOT NULL AND f.sla_deadline < NOW()) as is_sla_breached,
                       ROUND(EXTRACT(EPOCH FROM (f.sla_deadline - NOW()))/60.0) as minutes_remaining,` : `NULL as sla_deadline,
                       false as is_sla_breached,
                       NULL as minutes_remaining,`}
                       ${hasSlaPaused ? `f.sla_paused,` : `false as sla_paused,`}
                       ${hasSlaAccumulatedHours ? `f.sla_accumulated_hours,` : `0 as sla_accumulated_hours,`}
                       ${hasSlaPauseCount ? `f.sla_pause_count,` : `0 as sla_pause_count,`}
                       ${hasFileTypesTable ? `ft.name as file_type_name,
                       ft.code as file_type_code,` : `NULL as file_type_name,
                       NULL as file_type_code,`}
                       r.name as current_stage_name,
                       r.code as current_stage_code,
                       r.name as current_stage
                FROM efiling_files f
                LEFT JOIN efiling_file_categories c ON f.category_id = c.id
                LEFT JOIN efiling_departments d ON f.department_id = d.id
                LEFT JOIN efiling_file_status s ON f.status_id = s.id
                ${hasFileTypesTable ? `LEFT JOIN efiling_file_types ft ON f.file_type_id = ft.id` : ''}
                LEFT JOIN efiling_users ab ON f.assigned_to = ab.id
                LEFT JOIN efiling_roles r ON ab.efiling_role_id = r.id
                LEFT JOIN efiling_users cr ON f.created_by = cr.id
                LEFT JOIN users cr_users ON cr.user_id = cr_users.id
                LEFT JOIN efiling_users curr ON curr.id = f.assigned_to
                LEFT JOIN users curr_users ON curr.user_id = curr_users.id
                ${hasDocumentSignaturesTable ? `LEFT JOIN (
                    SELECT DISTINCT ON (file_id) 
                        file_id, user_name as last_signed_by_name, "timestamp" as last_signed_at
                    FROM efiling_document_signatures
                    ORDER BY file_id, "timestamp" DESC
                ) ls ON ls.file_id = f.id` : ''}
            `;
            const params = [];
            const conditions = [];
            let paramIndex = 1;
            
            if (department_id) {
                conditions.push(`f.department_id = $${paramIndex}`);
                params.push(department_id);
                paramIndex++;
            }
            
            if (status_id) {
                conditions.push(`f.status_id = $${paramIndex}`);
                params.push(status_id);
                paramIndex++;
            }
            
            if (created_by) {
                console.log('Adding created_by filter:', created_by);
                conditions.push(`f.created_by = $${paramIndex}`);
                params.push(created_by);
                paramIndex++;
            }
            
            if (assigned_to) {
                conditions.push(`f.assigned_to = $${paramIndex}`);
                params.push(assigned_to);
                paramIndex++;
            }
            
            if (priority) {
                conditions.push(`f.priority = $${paramIndex}`);
                params.push(priority);
                paramIndex++;
            }
            
            // New filter conditions
            if (file_id) {
                conditions.push(`f.id = $${paramIndex}`);
                params.push(file_id);
                paramIndex++;
            }
            
            if (district_id) {
                conditions.push(`f.district_id = $${paramIndex}`);
                params.push(district_id);
                paramIndex++;
            }
            
            if (town_id) {
                conditions.push(`f.town_id = $${paramIndex}`);
                params.push(town_id);
                paramIndex++;
            }
            
            if (division_id) {
                conditions.push(`f.division_id = $${paramIndex}`);
                params.push(division_id);
                paramIndex++;
            }
            
            if (zone_id) {
                conditions.push(`f.zone_id = $${paramIndex}`);
                params.push(zone_id);
                paramIndex++;
            }
            
            if (category_id) {
                conditions.push(`f.category_id = $${paramIndex}`);
                params.push(category_id);
                paramIndex++;
            }
            
            if (file_type_id) {
                conditions.push(`f.file_type_id = $${paramIndex}`);
                params.push(file_type_id);
                paramIndex++;
            }
            
            if (subject_search) {
                conditions.push(`LOWER(f.subject) LIKE $${paramIndex}`);
                params.push(`%${subject_search.toLowerCase()}%`);
                paramIndex++;
            }
            
            if (file_number_search) {
                conditions.push(`LOWER(f.file_number) LIKE $${paramIndex}`);
                params.push(`%${file_number_search.toLowerCase()}%`);
                paramIndex++;
            }
            
            if (date_from) {
                conditions.push(`DATE(f.created_at) >= $${paramIndex}`);
                params.push(date_from);
                paramIndex++;
            }
            
            if (date_to) {
                conditions.push(`DATE(f.created_at) <= $${paramIndex}`);
                params.push(date_to);
                paramIndex++;
            }
            
            // Add user-based filtering for efiling users (only if no specific filters are applied)
            const session = await auth(request);
            if (session?.user?.id && ![1,2].includes(parseInt(session.user.role)) && !created_by && !assigned_to) {
                // For efiling users, only show files they created or are assigned to
                const efilingUserRes = await client.query(
                    'SELECT id FROM efiling_users WHERE user_id = $1 AND is_active = true', 
                    [session.user.id]
                );
                if (efilingUserRes.rows.length > 0) {
                    const efilingUserId = efilingUserRes.rows[0].id;
                    conditions.push(`(f.created_by = $${paramIndex} OR f.assigned_to = $${paramIndex})`);
                    params.push(efilingUserId);
                    paramIndex++;
                }
            }
            
            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }

            // Build total count with same filters (without joins)
            let totalCountQuery = 'SELECT COUNT(*) as total FROM efiling_files f';
            if (conditions.length > 0) {
                totalCountQuery += ` WHERE ${conditions.join(' AND ')}`;
            }
            const totalCountRes = await client.query(totalCountQuery, params);
            const totalCount = parseInt(totalCountRes.rows[0]?.total || '0');

            query += ` ORDER BY f.id, f.created_at DESC`;
            
            if (limit > 0) {
                query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
                params.push(limit, offset);
            }
            
            console.log('Final query:', query);
            console.log('Query parameters:', params);
            
            const result = await client.query(query, params);
            console.log('Files query result:', result.rows.length, 'files found');
            console.log('Sample result rows:', result.rows.slice(0, 2));
            
            return NextResponse.json({
                success: true,
                files: result.rows,
                total: totalCount
            });
        }
    } catch (error) {
        console.error('Database error:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            hint: error.hint,
            position: error.position,
            where: error.where
        });
        // Return detailed error in development, generic in production
        const errorMessage = process.env.NODE_ENV === 'development' 
            ? `Database error: ${error.message}${error.detail ? ` - ${error.detail}` : ''}${error.hint ? ` (${error.hint})` : ''}`
            : 'Internal server error';
        return NextResponse.json({ 
            error: errorMessage,
            code: error.code,
            details: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                detail: error.detail,
                hint: error.hint,
                position: error.position
            } : undefined
        }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}

export async function POST(request) {
    const client = await connectToDatabase();
    
    try {
        const body = await request.json();
        const { 
            subject, 
            category_id, 
            department_id, 
            work_request_id,
            assigned_to,
            remarks,
            file_type_id
        } = body;
        
        // Validate required fields
        if (!subject || !category_id || !department_id) {
            return NextResponse.json({ 
                error: 'Subject, category, and department are required' 
            }, { status: 400 });
        }
        
        // Get current user from session token
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const currentUserId = session.user.id;
        
        // Get user's efiling_users.id, department, and geography
        const userQuery = await client.query(`
            SELECT eu.id as efiling_user_id, eu.department_id, eu.efiling_role_id, 
                   eu.district_id, eu.town_id, eu.division_id,
                   d.name as department_name, d.department_type
            FROM efiling_users eu 
            JOIN users u ON eu.user_id = u.id 
            JOIN efiling_departments d ON eu.department_id = d.id
            WHERE u.id = $1 AND eu.is_active = true
        `, [currentUserId]);
        
        if (userQuery.rows.length === 0) {
            return NextResponse.json({ 
                error: 'User not found or not active in e-filing system' 
            }, { status: 403 });
        }
        
        const userData = userQuery.rows[0];
        const createdBy = userData.efiling_user_id;
        const userDept = userData.department_id;
        const userDistrictId = userData.district_id;
        const userTownId = userData.town_id;
        const userDivisionId = userData.division_id;
        const userDeptType = userData.department_type;
        
        // Resolve user's role code (for role-code-based checks)
        let userRoleCode = null;
        try {
            const roleRes = await client.query(
                'SELECT code FROM efiling_roles WHERE id = $1',
                [userData.efiling_role_id]
            );
            userRoleCode = roleRes.rows[0]?.code || null;
        } catch (e) {
            // ignore, will fail later if needed
        }
        
        // If a file_type_id is provided, fetch its metadata first to drive validation
        let fileTypeMeta = null;
        if (file_type_id) {
            const ftRes = await client.query(
                'SELECT id, code, can_create_roles, department_id as ft_department_id, category_id as ft_category_id, is_active FROM efiling_file_types WHERE id = $1',
                [file_type_id]
            );
            if (ftRes.rows.length === 0 || ftRes.rows[0].is_active === false) {
                return NextResponse.json({ error: 'Invalid or inactive file type' }, { status: 400 });
            }
            fileTypeMeta = ftRes.rows[0];
        }
        
        // Department ownership check: prefer the file type's department when provided
        const effectiveDeptId = fileTypeMeta?.ft_department_id ?? parseInt(department_id);
        if (effectiveDeptId !== userDept) {
            return NextResponse.json({ 
                error: `You can only create files for your department. Required: ${effectiveDeptId}, Yours: ${userDept}` 
            }, { status: 403 });
        }
        
        if (!createdBy) {
            return NextResponse.json({ 
                error: 'No active e-filing users found. Please create a user first.' 
            }, { status: 500 });
        }
        
        // If a file_type_id is provided, enforce creator permissions using role codes
        if (file_type_id && fileTypeMeta) {
            try {
                const canCreateRaw = fileTypeMeta.can_create_roles;
                let allowedList = [];
                if (Array.isArray(canCreateRaw)) {
                    allowedList = canCreateRaw;
                } else if (typeof canCreateRaw === 'string') {
                    const trimmed = canCreateRaw.trim();
                    if (trimmed.startsWith('[')) {
                        try { allowedList = JSON.parse(trimmed); } catch { allowedList = []; }
                    } else {
                        allowedList = trimmed.split(',').map(s => s.trim()).filter(Boolean);
                    }
                }
                const roleMatches = (roleCode, pattern) => {
                    if (!roleCode || !pattern) return false;
                    const rc = roleCode.toUpperCase();
                    const p = String(pattern).toUpperCase();
                    if (p.endsWith('*')) return rc.startsWith(p.slice(0, -1));
                    if (p.length <= 4) return rc.includes(p);
                    return rc === p;
                };
                const isAllowed = allowedList.some(p => roleMatches(userRoleCode, p));
                if (!isAllowed) {
                    return NextResponse.json({ 
                        error: `Your role (${userRoleCode || 'UNKNOWN'}) is not permitted to create this file type` 
                    }, { status: 403 });
                }
            } catch (permErr) {
                console.error('Error checking file type creator permissions:', permErr);
                return NextResponse.json({ error: 'Permission check failed' }, { status: 500 });
            }
        }
        
        // Generate file number (format: DEPT/FISCAL_YEAR/SEQUENTIAL, e.g., WB/2025-26/0001)
        const now = new Date();
        const fiscalYear = getFiscalYear(now);
        const deptToUse = effectiveDeptId;
        const deptQuery = await client.query(
            'SELECT code FROM efiling_departments WHERE id = $1',
            [deptToUse]
        );
        
        if (deptQuery.rows.length === 0) {
            return NextResponse.json({ error: 'Department not found' }, { status: 400 });
        }
        
        const deptCode = deptQuery.rows[0].code;
        
        // Calculate fiscal year start and end dates for SQL matching
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 1-12
        let fiscalYearStart, fiscalYearEnd;
        
        if (currentMonth >= 7) {
            // July 1 - December 31: Fiscal year is current year to next year
            fiscalYearStart = new Date(currentYear, 6, 1); // July 1
            fiscalYearEnd = new Date(currentYear + 1, 5, 30, 23, 59, 59); // June 30 next year
        } else {
            // January 1 - June 30: Fiscal year is previous year to current year
            fiscalYearStart = new Date(currentYear - 1, 6, 1); // July 1 previous year
            fiscalYearEnd = new Date(currentYear, 5, 30, 23, 59, 59); // June 30 current year
        }
        
        // Get next sequence number for this department and fiscal year
        // Match files created within the fiscal year period AND with matching fiscal year pattern
        const seqQuery = await client.query(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(file_number FROM '\\d{4}$') AS INTEGER)), 0) + 1 as next_seq 
             FROM efiling_files 
             WHERE department_id = $1 
             AND created_at >= $2
             AND created_at <= $3
             AND file_number LIKE $4`,
            [deptToUse, fiscalYearStart, fiscalYearEnd, `${deptCode}/${fiscalYear}/%`]
        );
        
        let sequence = seqQuery.rows[0].next_seq;
        let fileNumber = `${deptCode}/${fiscalYear}/${sequence.toString().padStart(4, '0')}`;
        
        // Double-check if file number exists and increment if needed
        let attempts = 0;
        while (attempts < 10) {
            const existsQuery = await client.query(
                'SELECT id FROM efiling_files WHERE file_number = $1',
                [fileNumber]
            );
            
            if (existsQuery.rows.length === 0) {
                break; // File number is unique
            }
            
            // File number exists, increment and try again
            sequence++;
            fileNumber = `${deptCode}/${fiscalYear}/${sequence.toString().padStart(4, '0')}`;
            attempts++;
        }
        
        if (attempts >= 10) {
            return NextResponse.json({ 
                error: 'Unable to generate unique file number after multiple attempts' 
            }, { status: 500 });
        }
        
        // Get default status (Draft)
        const statusQuery = await client.query(
            'SELECT id FROM efiling_file_status WHERE code = $1',
            ['DRAFT']
        );
        
        if (statusQuery.rows.length === 0) {
            return NextResponse.json({ error: 'Default status not found' }, { status: 500 });
        }
        
        const statusId = statusQuery.rows[0].id;
        console.log('Using status ID:', statusId, 'for DRAFT status');
        
        // Workflow templates deprecated - using geographic routing instead
        
        // Create file with geographic fields auto-populated from creator
        const query = `
            INSERT INTO efiling_files (
                file_number, subject, category_id, department_id, status_id,
                priority, confidentiality_level, work_request_id, created_by, assigned_to, remarks, 
                file_type_id, district_id, town_id, division_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
        `;
        
        const categoryToUse = fileTypeMeta?.ft_category_id ?? category_id;
        
        console.log('Inserting file with values:', {
            fileNumber, subject, category_id: categoryToUse, department_id: deptToUse, statusId,
            priority: 'high', confidentiality_level: 'normal', work_request_id: work_request_id || null,
            created_by: createdBy, assigned_to: assigned_to || null, remarks, file_type_id
        });
        
        // Auto-populate geography based on department type
        let fileDistrictId = null;
        let fileTownId = null;
        let fileDivisionId = null;
        
        if (userDeptType === 'district') {
            fileDistrictId = userDistrictId;
            fileTownId = userTownId;
        } else if (userDeptType === 'division') {
            fileDivisionId = userDivisionId;
        }
        // For 'global' type, geography fields remain null
        
        const result = await client.query(query, [
            fileNumber, subject, categoryToUse, deptToUse, statusId,
            'high', 'normal', work_request_id || null, createdBy, assigned_to || null, remarks, 
            file_type_id || null, fileDistrictId, fileTownId, fileDivisionId
        ]);
        
        console.log('File created successfully:', result.rows[0]);
        
        // Create notification if file is assigned to someone
        if (assigned_to && assigned_to !== createdBy) {
            try {
                await client.query(`
                    INSERT INTO efiling_notifications (
                        user_id, file_id, type, message, is_read, created_at
                    ) VALUES ($1, $2, $3, $4, $5, NOW())
                `, [
                    assigned_to,
                    result.rows[0].id,
                    'FILE_ASSIGNED',
                    `A new file "${subject}" has been assigned to you.`,
                    false
                ]);
                console.log('Notification created for assigned user:', assigned_to);
            } catch (notificationError) {
                console.error('Error creating notification:', notificationError);
            }
        }
        
        // Workflow system deprecated - files now use geographic routing
        // SLA can be managed at file level using efiling_files.sla_deadline directly if needed
        
        // Log the action
        try {
            await eFileActionLogger.logAction({
                entityId: result.rows[0].id.toString(),
                userId: createdBy.toString(),
                action: 'FILE_CREATED',
                entityType: 'efiling_file',
                details: { 
                    file_number: fileNumber, 
                    subject, 
                    category_id, 
                    department_id,
                    description: `File "${fileNumber}" created`
                }
            });
        } catch (logError) {
            console.error('Error logging action:', logError);
            // Don't fail the request if logging fails
        }
        
        return NextResponse.json(result.rows[0], { status: 201 });
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}

export async function PUT(request) {
    const client = await connectToDatabase();
    
    try {
        const body = await request.json();
        const { 
            id, subject, category_id, department_id, status_id,
            priority, confidentiality_level, assigned_to, remarks 
        } = body;
        
        if (!id) {
            return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
        }
        
        // Check if file exists
        const existing = await client.query(
            'SELECT * FROM efiling_files WHERE id = $1',
            [id]
        );
        
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }
        
        const query = `
            UPDATE efiling_files 
            SET subject = COALESCE($2, subject),
                category_id = COALESCE($3, category_id),
                department_id = COALESCE($4, department_id),
                status_id = COALESCE($5, status_id),
                priority = COALESCE($6, priority),
                confidentiality_level = COALESCE($7, confidentiality_level),
                assigned_to = COALESCE($8, assigned_to),
                remarks = COALESCE($9, remarks),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `;
        
        const result = await client.query(query, [
            id, subject, category_id, department_id, status_id,
            priority, confidentiality_level, assigned_to, remarks
        ]);
        
        // Create notification if file is assigned to someone new
        if (assigned_to && assigned_to !== existing.rows[0].assigned_to && assigned_to !== existing.rows[0].created_by) {
            try {
                await client.query(`
                    INSERT INTO efiling_notifications (
                        user_id, file_id, type, message, is_read, created_at
                    ) VALUES ($1, $2, $3, $4, $5, NOW())
                `, [
                    assigned_to,
                    id,
                    'FILE_ASSIGNED',
                    `File "${result.rows[0].subject || existing.rows[0].subject}" has been assigned to you.`,
                    false
                ]);
                console.log('Notification created for newly assigned user:', assigned_to);
            } catch (notificationError) {
                console.error('Error creating notification:', notificationError);
            }
        }
        
        // Log the action
        try {
            await eFileActionLogger.logAction({
                entityId: id.toString(),
                userId: result.rows[0].created_by?.toString() || 'unknown',
                action: 'FILE_UPDATED',
                entityType: 'efiling_file',
                details: { 
                    file_number: result.rows[0].file_number, 
                    changes: body,
                    description: `File "${result.rows[0].file_number}" updated`
                }
            });
        } catch (logError) {
            console.error('Error logging action:', logError);
        }
        
        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}

export async function DELETE(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
        return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
    }
    
    const client = await connectToDatabase();
    
    try {
        // Admin-only hard delete with full cleanup (mirror of /efiling/files/[id])
        const session = await auth(request);
        if (!session?.user?.role || ![1, 2].includes(parseInt(session.user.role))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Check if file exists first
        const existing = await client.query('SELECT id, file_number, created_by FROM efiling_files WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        await client.query('BEGIN');

        // Non-cascading dependencies (defensive cleanup)
        await client.query('DELETE FROM efiling_document_comments WHERE file_id = $1', [id]);
        await client.query('DELETE FROM efiling_user_actions WHERE file_id::text = $1::text', [String(id)]);
        await client.query('DELETE FROM efiling_file_attachments WHERE file_id = $1', [String(id)]);
        await client.query('DELETE FROM efiling_documents WHERE file_id = $1', [id]);
        await client.query('DELETE FROM efiling_document_pages WHERE file_id = $1', [id]);
        await client.query('DELETE FROM efiling_document_signatures WHERE file_id = $1', [id]);
        await client.query('DELETE FROM efiling_file_movements WHERE file_id = $1', [id]);
        await client.query('DELETE FROM efiling_notifications WHERE file_id = $1', [id]);
        await client.query('DELETE FROM efiling_signatures WHERE file_id = $1', [id]);

        // Finally delete the file
        await client.query('DELETE FROM efiling_files WHERE id = $1', [id]);

        await client.query('COMMIT');

        // Log action (best-effort)
        try {
            await eFileActionLogger.logAction({
                entityId: String(id),
                userId: existing.rows[0].created_by?.toString() || 'unknown',
                action: 'FILE_DELETED',
                entityType: 'efiling_file',
                details: {
                    file_number: existing.rows[0].file_number,
                    description: `File "${existing.rows[0].file_number}" deleted (hard delete)`
                }
            });
        } catch (logError) {
            console.error('Error logging action:', logError);
        }

        return NextResponse.json({ success: true, message: 'File and related data deleted successfully' });
    } catch (error) {
        console.error('Database error:', error);
        try { await client.query('ROLLBACK'); } catch {}
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
} 