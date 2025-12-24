import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { eFileActionLogger, EFILING_ACTION_TYPES, EFILING_ENTITY_TYPES } from '@/lib/efilingActionLogger';

export async function POST(request) {
    try {
        const {
            name,
            email,
            password,
            contact_number,
            cnic,
            employee_id,
            designation,
            department_id,
            efiling_role_id,
            image,
            supervisor_id,
            approval_level,
            approval_amount_limit,
            can_sign,
            can_create_files,
            can_approve_files,
            can_reject_files,
            can_transfer_files,
            max_concurrent_files,
            preferred_signature_method,
            signature_settings,
            notification_preferences,
            is_consultant,
            google_email,
            district_id,
            town_id,
            subtown_id,
            division_id
        } = await request.json();

        // Validate required fields
        if (!name || !email || !password || !efiling_role_id || !cnic) {
            return NextResponse.json(
                { error: 'Missing required fields: name, email, password, cnic, efiling_role_id' },
                { status: 400 }
            );
        }

        // Validate CNIC format (13 digits with hyphens: 42101-8065450-1)
        const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
        if (!cnicRegex.test(cnic)) {
            return NextResponse.json(
                { error: 'Invalid CNIC format. CNIC must be in the format: 11111-1111111-1 (13 digits with hyphens)' },
                { status: 400 }
            );
        }

        // For consultants, employee_id, designation, and department_id are not required
        // For KWSC employees, these fields are required
        if (!is_consultant && (!employee_id || !department_id)) {
            return NextResponse.json(
                { error: 'Missing required fields for KWSC employee: employee_id, department_id' },
                { status: 400 }
            );
        }

        const client = await connectToDatabase();

        try {
            // Check if email already exists in users table
            const existingUser = await client.query(
                'SELECT id FROM users WHERE email = $1',
                [email]
            );

            if (existingUser.rows.length > 0) {
                await client.release();
                return NextResponse.json(
                    { error: 'User with this email already exists' },
                    { status: 400 }
                );
            }

            // Check if CNIC already exists
            const existingCnic = await client.query(
                'SELECT id FROM users WHERE cnic = $1',
                [cnic]
            );

            if (existingCnic.rows.length > 0) {
                await client.release();
                return NextResponse.json(
                    { error: 'User with this CNIC already exists' },
                    { status: 400 }
                );
            }

            // Check if employee_id already exists in efiling_users table (only for KWSC employees)
            if (!is_consultant && employee_id) {
                const existingEmployee = await client.query(
                    'SELECT id FROM efiling_users WHERE employee_id = $1',
                    [employee_id]
                );

                if (existingEmployee.rows.length > 0) {
                    await client.release();
                    return NextResponse.json(
                        { error: 'Employee ID already exists' },
                        { status: 400 }
                    );
                }
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 12);

            // Start transaction
            await client.query('BEGIN');

            // 1. Create user in main users table
            const userResult = await client.query(
                `INSERT INTO users (name, email, password, contact_number, cnic, image, role, created_date, updated_date)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                 RETURNING id`,
                [name, email, hashedPassword, contact_number || null, cnic, image || null, 4] // role = 4 for e-filing users
            );

            const userId = userResult.rows[0].id;

            // Auto-populate geographic fields from department if not provided
            let finalDistrictId = district_id || null;
            let finalTownId = town_id || null;
            let finalSubtownId = subtown_id || null;
            let finalDivisionId = division_id || null;

            if (!is_consultant && department_id && !finalDivisionId && !finalTownId && !finalDistrictId) {
                // Fetch department locations to auto-populate
                const deptLocRes = await client.query(
                    `SELECT division_id, district_id, town_id 
                     FROM efiling_department_locations 
                     WHERE department_id = $1 
                     ORDER BY 
                         CASE WHEN division_id IS NOT NULL THEN 1 ELSE 2 END,
                         CASE WHEN town_id IS NOT NULL THEN 1 ELSE 2 END,
                         CASE WHEN district_id IS NOT NULL THEN 1 ELSE 2 END
                     LIMIT 1`,
                    [department_id]
                );

                if (deptLocRes.rows.length > 0) {
                    const loc = deptLocRes.rows[0];
                    // Priority: division > town > district
                    if (loc.division_id) {
                        finalDivisionId = loc.division_id;
                    } else if (loc.town_id) {
                        finalTownId = loc.town_id;
                        if (loc.district_id) {
                            finalDistrictId = loc.district_id;
                        }
                    } else if (loc.district_id) {
                        finalDistrictId = loc.district_id;
                    }
                }
            }

            // 2. Create e-filing user record
            const efilingUserResult = await client.query(
                `INSERT INTO efiling_users (
                    user_id, employee_id, designation, department_id, efiling_role_id, 
                    approval_level, can_sign, can_create_files, can_approve_files, 
                    can_reject_files, can_transfer_files, max_concurrent_files,
                    preferred_signature_method, signature_settings, notification_preferences,
                    is_consultant, google_email,
                    district_id, town_id, subtown_id, division_id,
                    created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())
                RETURNING id`,
                [
                    userId,
                    is_consultant ? null : employee_id, // null for consultants
                    is_consultant ? null : designation, // null for consultants
                    is_consultant ? null : department_id, // null for consultants
                    efiling_role_id,
                    approval_level || 1,
                    can_sign !== undefined ? can_sign : true,
                    can_create_files !== undefined ? can_create_files : true,
                    can_approve_files !== undefined ? can_approve_files : false,
                    can_reject_files !== undefined ? can_reject_files : false,
                    can_transfer_files !== undefined ? can_transfer_files : true,
                    max_concurrent_files || 10,
                    preferred_signature_method || 'SMS_OTP',
                    JSON.stringify(signature_settings || {}),
                    JSON.stringify(notification_preferences || {}),
                    is_consultant || false,
                    google_email || null,
                    is_consultant ? null : finalDistrictId,
                    is_consultant ? null : finalTownId,
                    is_consultant ? null : finalSubtownId,
                    is_consultant ? null : finalDivisionId
                ]
            );

            // Commit transaction
            await client.query('COMMIT');

            // Log the action
            try {
                await eFileActionLogger.logAction({
                    entityId: null, // No file associated with user creation
                    userId: userId.toString(),
                    action: 'USER_CREATED',
                    entityType: 'efiling_user',
                    details: { 
                        name, 
                        email, 
                        employee_id: is_consultant ? 'N/A (Consultant)' : employee_id, 
                        department_id: is_consultant ? 'N/A (Consultant)' : department_id, 
                        efiling_role_id,
                        designation: is_consultant ? 'N/A (Consultant)' : designation,
                        is_consultant,
                        description: `E-filing ${is_consultant ? 'consultant' : 'user'} "${name}" ${!is_consultant ? `(${employee_id})` : ''} created`
                    }
                });
            } catch (logError) {
                console.error('Error logging user creation action:', logError);
                // Don't fail the request if logging fails
            }

            return NextResponse.json({
                success: true,
                message: `E-filing ${is_consultant ? 'consultant' : 'user'} created successfully`,
                user: {
                    id: userId,
                    efiling_user_id: efilingUserResult.rows[0].id,
                    name,
                    email,
                    employee_id: is_consultant ? null : employee_id,
                    is_consultant
                }
            });

        } catch (error) {
            // Rollback transaction on error
            await client.query('ROLLBACK');
            throw error;
        } finally {
            await client.release();
        }

    } catch (error) {
        console.error('Error creating e-filing user:', error);
        return NextResponse.json(
            { error: 'Failed to create e-filing user', details: error.message },
            { status: 500 }
        );
    }
}
