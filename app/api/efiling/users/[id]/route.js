import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { requireAuth } from '@/lib/authMiddleware';

// Get e-filing user by ID
export async function GET(request, { params }) {
    try {
        // SECURITY: Require authentication
        const authResult = await requireAuth(request);
        if (authResult instanceof NextResponse) {
            return authResult;
        }
        const { user: sessionUser } = authResult;

        const { id } = await params;

        if (!id) {
            return NextResponse.json(
                { error: 'User ID is required' },
                { status: 400 }
            );
        }

        const client = await connectToDatabase();

        try {
            // Get user data with joins to get related information
            const userResult = await client.query(
                `SELECT 
                    u.id,
                    u.name,
                    u.email,
                    u.contact_number,
                    u.cnic,
                    u.created_date,
                    u.updated_date,
                    eu.id as efiling_user_id,
                    eu.employee_id,
                    eu.designation,
                    eu.address,
                    eu.department_id,
                    eu.efiling_role_id,
                    eu.supervisor_id,
                    eu.approval_level,
                    eu.approval_amount_limit,
                    eu.can_sign,
                    eu.can_create_files,
                    eu.can_approve_files,
                    eu.can_reject_files,
                    eu.can_transfer_files,
                    eu.max_concurrent_files,
                    eu.preferred_signature_method,
                    eu.signature_settings,
                    eu.notification_preferences,
                    eu.is_active,
                    eu.created_at,
                    eu.updated_at,
                    eu.google_email,
                    eu.district_id,
                    eu.town_id,
                    eu.subtown_id,
                    eu.division_id,
                    d.name as department_name,
                    r.name as role_name
                FROM users u
                JOIN efiling_users eu ON u.id = eu.user_id
                LEFT JOIN efiling_departments d ON eu.department_id = d.id
                LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
                WHERE eu.id = $1`,
                [id]
            );

            if (userResult.rows.length === 0) {
                return NextResponse.json(
                    { error: 'E-filing user not found' },
                    { status: 404 }
                );
            }

            const user = userResult.rows[0];

            // SECURITY: IDOR Fix - Check ownership or admin role
            const efilingUserId = parseInt(id);
            const sessionUserId = parseInt(sessionUser.id);
            const isAdmin = [1, 2].includes(parseInt(sessionUser.role));
            
            // Check if the e-filing user belongs to the session user
            const userOwnershipCheck = await client.query(
                `SELECT user_id FROM efiling_users WHERE id = $1`,
                [efilingUserId]
            );
            
            if (userOwnershipCheck.rows.length === 0) {
                return NextResponse.json(
                    { error: 'E-filing user not found' },
                    { status: 404 }
                );
            }
            
            const efilingUserUserId = parseInt(userOwnershipCheck.rows[0].user_id);
            
            if (sessionUserId !== efilingUserUserId && !isAdmin) {
                return NextResponse.json(
                    { error: 'Forbidden - You can only access your own data' },
                    { status: 403 }
                );
            }

            // Parse JSON fields
            if (user.signature_settings) {
                try {
                    user.signature_settings = JSON.parse(user.signature_settings);
                } catch (e) {
                    user.signature_settings = {};
                }
            }

            if (user.notification_preferences) {
                try {
                    user.notification_preferences = JSON.parse(user.notification_preferences);
                } catch (e) {
                    user.notification_preferences = {};
                }
            }

            return NextResponse.json(user);

        } finally {
            await client.release();
        }

    } catch (error) {
        console.error('Error fetching e-filing user:', error);
        return NextResponse.json(
            { error: 'Failed to fetch e-filing user', details: error.message },
            { status: 500 }
        );
    }
}

// Update e-filing user
export async function PUT(request, { params }) {
    let userId = null;
    try {
        // SECURITY: Require authentication
        const authResult = await requireAuth(request);
        if (authResult instanceof NextResponse) {
            return authResult;
        }
        const { user: sessionUser } = authResult;

        const { id } = await params;
        userId = id;
        const body = await request.json();
        const {
            name,
            email,
            password,
            contact_number,
            cnic,
            address,
            employee_id,
            designation,
            department_id,
            efiling_role_id,
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
            is_active,
            google_email,
            district_id,
            town_id,
            subtown_id,
            division_id
        } = body;

        console.log(`PUT /api/efiling/users/${id} - Request body keys:`, Object.keys(body));
        console.log(`PUT /api/efiling/users/${id} - Updating user with data:`, {
            name, email, cnic, employee_id, department_id, efiling_role_id
        });

        if (!id) {
            console.error('PUT /api/efiling/users/[id] - User ID is missing');
            return NextResponse.json(
                { error: 'User ID is required' },
                { status: 400 }
            );
        }

        const client = await connectToDatabase();

        try {
            // First, try to find by efiling_users.id, if not found, try by users.id
            let currentUser = await client.query(
                `SELECT u.id, u.email, u.cnic, eu.id as efiling_user_id, eu.employee_id 
                 FROM users u 
                 JOIN efiling_users eu ON u.id = eu.user_id 
                 WHERE eu.id = $1`,
                [id]
            );

            // If not found by efiling_users.id, try by users.id
            if (currentUser.rows.length === 0) {
                currentUser = await client.query(
                    `SELECT u.id, u.email, u.cnic, eu.id as efiling_user_id, eu.employee_id 
                     FROM users u 
                     JOIN efiling_users eu ON u.id = eu.user_id 
                     WHERE u.id = $1`,
                    [id]
                );
            }

            if (currentUser.rows.length === 0) {
                return NextResponse.json(
                    { error: 'E-filing user not found' },
                    { status: 404 }
                );
            }

            const userId = currentUser.rows[0].id;
            const efilingUserId = currentUser.rows[0].efiling_user_id;
            const currentEmail = currentUser.rows[0].email;
            const currentCnic = currentUser.rows[0].cnic;
            const currentEmployeeId = currentUser.rows[0].employee_id;

            // SECURITY: IDOR Fix - Check ownership or admin role
            const sessionUserId = parseInt(sessionUser.id);
            const isAdmin = [1, 2].includes(parseInt(sessionUser.role));
            
            if (sessionUserId !== userId && !isAdmin) {
                return NextResponse.json(
                    { error: 'Forbidden - You can only modify your own data' },
                    { status: 403 }
                );
            }

            if (!efilingUserId) {
                console.error(`PUT /api/efiling/users/${id} - E-filing profile not found for user ${userId}`);
                return NextResponse.json(
                    { error: 'E-filing profile not found for this user' },
                    { status: 404 }
                );
            }

            // Validate CNIC format if provided
            if (cnic !== undefined && cnic !== null && cnic !== '') {
                const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
                if (!cnicRegex.test(cnic)) {
                    console.error(`PUT /api/efiling/users/${id} - Invalid CNIC format: ${cnic}`);
                    return NextResponse.json(
                        { error: 'Invalid CNIC format. CNIC must be in the format: 11111-1111111-1 (13 digits with hyphens)' },
                        { status: 400 }
                    );
                }
            }

            // Check if email already exists (if changed)
            if (email && email !== currentEmail) {
                console.log(`PUT /api/efiling/users/${id} - Checking email uniqueness: ${email} (current: ${currentEmail})`);
                const existingUser = await client.query(
                    'SELECT id FROM users WHERE email = $1 AND id != $2',
                    [email, userId]
                );

                if (existingUser.rows.length > 0) {
                    console.error(`PUT /api/efiling/users/${id} - Email already exists: ${email}`);
                    return NextResponse.json(
                        { error: 'User with this email already exists' },
                        { status: 400 }
                    );
                }
            }

            // Check if CNIC already exists (if changed)
            if (cnic && cnic !== currentCnic) {
                console.log(`PUT /api/efiling/users/${id} - Checking CNIC uniqueness: ${cnic} (current: ${currentCnic})`);
                const existingCnic = await client.query(
                    'SELECT id FROM users WHERE cnic = $1 AND id != $2',
                    [cnic, userId]
                );

                if (existingCnic.rows.length > 0) {
                    console.error(`PUT /api/efiling/users/${id} - CNIC already exists: ${cnic}`);
                    return NextResponse.json(
                        { error: 'User with this CNIC already exists' },
                        { status: 400 }
                    );
                }
            }

            // Check if employee_id already exists (if changed)
            if (employee_id !== undefined && employee_id !== null && employee_id !== '' && employee_id !== currentEmployeeId) {
                console.log(`PUT /api/efiling/users/${id} - Checking employee_id uniqueness: ${employee_id} (current: ${currentEmployeeId})`);
                const existingEmployee = await client.query(
                    'SELECT id FROM efiling_users WHERE employee_id = $1 AND id != $2',
                    [employee_id, efilingUserId]
                );

                if (existingEmployee.rows.length > 0) {
                    console.error(`PUT /api/efiling/users/${id} - Employee ID already exists: ${employee_id}`);
                    return NextResponse.json(
                        { error: 'Employee ID already exists' },
                        { status: 400 }
                    );
                }
            }

            // Start transaction
            await client.query('BEGIN');

            // Update main user table
            let userUpdateQuery = 'UPDATE users SET updated_date = NOW()';
            let userParams = [];
            let paramCount = 1;

            if (name) {
                userUpdateQuery += `, name = $${paramCount}`;
                userParams.push(name);
                paramCount++;
            }

            if (email) {
                userUpdateQuery += `, email = $${paramCount}`;
                userParams.push(email);
                paramCount++;
            }

            if (password) {
                const hashedPassword = await bcrypt.hash(password, 12);
                userUpdateQuery += `, password = $${paramCount}`;
                userParams.push(hashedPassword);
                paramCount++;
            }

            if (contact_number !== undefined) {
                userUpdateQuery += `, contact_number = $${paramCount}`;
                userParams.push(contact_number);
                paramCount++;
            }

            if (cnic !== undefined) {
                userUpdateQuery += `, cnic = $${paramCount}`;
                userParams.push(cnic);
                paramCount++;
            }

            // Note: address is now handled in efiling_users table

            userUpdateQuery += ` WHERE id = $${paramCount}`;
            userParams.push(userId);

            if (userParams.length > 1) {
                await client.query(userUpdateQuery, userParams);
            }

            // Update e-filing user table
            let efilingUpdateQuery = 'UPDATE efiling_users SET updated_at = NOW()';
            let efilingParams = [];
            paramCount = 1;

            if (employee_id !== undefined) {
                efilingUpdateQuery += `, employee_id = $${paramCount}`;
                efilingParams.push(employee_id);
                paramCount++;
            }

            if (designation !== undefined) {
                efilingUpdateQuery += `, designation = $${paramCount}`;
                efilingParams.push(designation);
                paramCount++;
            }

            if (department_id !== undefined) {
                efilingUpdateQuery += `, department_id = $${paramCount}`;
                efilingParams.push(department_id);
                paramCount++;
            }

            if (efiling_role_id !== undefined) {
                efilingUpdateQuery += `, efiling_role_id = $${paramCount}`;
                efilingParams.push(efiling_role_id);
                paramCount++;
            }

            if (supervisor_id !== undefined) {
                efilingUpdateQuery += `, supervisor_id = $${paramCount}`;
                efilingParams.push(supervisor_id);
                paramCount++;
            }

            if (approval_level !== undefined) {
                efilingUpdateQuery += `, approval_level = $${paramCount}`;
                efilingParams.push(approval_level);
                paramCount++;
            }

            if (approval_amount_limit !== undefined) {
                efilingUpdateQuery += `, approval_amount_limit = $${paramCount}`;
                efilingParams.push(approval_amount_limit);
                paramCount++;
            }

            if (can_sign !== undefined) {
                efilingUpdateQuery += `, can_sign = $${paramCount}`;
                efilingParams.push(can_sign);
                paramCount++;
            }

            if (can_create_files !== undefined) {
                efilingUpdateQuery += `, can_create_files = $${paramCount}`;
                efilingParams.push(can_create_files);
                paramCount++;
            }

            if (can_approve_files !== undefined) {
                efilingUpdateQuery += `, can_approve_files = $${paramCount}`;
                efilingParams.push(can_approve_files);
                paramCount++;
            }

            if (address !== undefined) {
                efilingUpdateQuery += `, address = $${paramCount}`;
                efilingParams.push(address);
                paramCount++;
            }

            if (can_reject_files !== undefined) {
                efilingUpdateQuery += `, can_reject_files = $${paramCount}`;
                efilingParams.push(can_reject_files);
                paramCount++;
            }

            if (can_transfer_files !== undefined) {
                efilingUpdateQuery += `, can_transfer_files = $${paramCount}`;
                efilingParams.push(can_transfer_files);
                paramCount++;
            }

            if (max_concurrent_files !== undefined) {
                efilingUpdateQuery += `, max_concurrent_files = $${paramCount}`;
                efilingParams.push(max_concurrent_files);
                paramCount++;
            }

            if (preferred_signature_method !== undefined) {
                efilingUpdateQuery += `, preferred_signature_method = $${paramCount}`;
                efilingParams.push(preferred_signature_method);
                paramCount++;
            }

            if (signature_settings !== undefined) {
                efilingUpdateQuery += `, signature_settings = $${paramCount}`;
                efilingParams.push(JSON.stringify(signature_settings));
                paramCount++;
            }

            if (notification_preferences !== undefined) {
                efilingUpdateQuery += `, notification_preferences = $${paramCount}`;
                efilingParams.push(JSON.stringify(notification_preferences));
                paramCount++;
            }

            if (google_email !== undefined) {
                efilingUpdateQuery += `, google_email = $${paramCount}`;
                efilingParams.push(google_email);
                paramCount++;
            }

            if (is_active !== undefined) {
                efilingUpdateQuery += `, is_active = $${paramCount}`;
                efilingParams.push(is_active);
                paramCount++;
            }

            // Handle geographic fields
            if (district_id !== undefined) {
                efilingUpdateQuery += `, district_id = $${paramCount}`;
                efilingParams.push(district_id || null);
                paramCount++;
            }

            if (town_id !== undefined) {
                efilingUpdateQuery += `, town_id = $${paramCount}`;
                efilingParams.push(town_id || null);
                paramCount++;
            }

            if (subtown_id !== undefined) {
                efilingUpdateQuery += `, subtown_id = $${paramCount}`;
                efilingParams.push(subtown_id || null);
                paramCount++;
            }

            if (division_id !== undefined) {
                efilingUpdateQuery += `, division_id = $${paramCount}`;
                efilingParams.push(division_id || null);
                paramCount++;
            }

            // Auto-populate geographic fields from department if not provided and department changed
            if (department_id !== undefined && division_id === undefined && town_id === undefined && district_id === undefined) {
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
                        efilingUpdateQuery += `, division_id = $${paramCount}`;
                        efilingParams.push(loc.division_id);
                        paramCount++;
                    } else if (loc.town_id) {
                        efilingUpdateQuery += `, town_id = $${paramCount}`;
                        efilingParams.push(loc.town_id);
                        paramCount++;
                        if (loc.district_id) {
                            efilingUpdateQuery += `, district_id = $${paramCount}`;
                            efilingParams.push(loc.district_id);
                            paramCount++;
                        }
                    } else if (loc.district_id) {
                        efilingUpdateQuery += `, district_id = $${paramCount}`;
                        efilingParams.push(loc.district_id);
                        paramCount++;
                    }
                }
            }

            efilingUpdateQuery += ` WHERE id = $${paramCount}`;
            efilingParams.push(efilingUserId);

            if (efilingParams.length > 1) {
                await client.query(efilingUpdateQuery, efilingParams);
            }

            // Commit transaction
            await client.query('COMMIT');

            return NextResponse.json({
                success: true,
                message: 'E-filing user updated successfully'
            });

        } catch (error) {
            // Rollback transaction on error
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Error during rollback:', rollbackError);
            }
            
            // Check for database constraint violations
            if (error.code === '23505') { // Unique violation
                const constraint = error.constraint || 'unknown';
                console.error(`PUT /api/efiling/users/${userId} - Database unique constraint violation: ${constraint}`, error.detail);
                
                // Try to provide a user-friendly error message
                let errorMessage = 'A record with this information already exists';
                if (constraint.includes('email')) {
                    errorMessage = 'User with this email already exists';
                } else if (constraint.includes('cnic')) {
                    errorMessage = 'User with this CNIC already exists';
                } else if (constraint.includes('employee_id')) {
                    errorMessage = 'Employee ID already exists';
                }
                
                return NextResponse.json(
                    { error: errorMessage, details: error.detail },
                    { status: 400 }
                );
            }
            
            // Check for foreign key violations
            if (error.code === '23503') { // Foreign key violation
                console.error(`PUT /api/efiling/users/${userId} - Foreign key constraint violation:`, error.detail);
                return NextResponse.json(
                    { error: 'Invalid reference. One or more referenced records do not exist.', details: error.detail },
                    { status: 400 }
                );
            }
            
            // Check for not null violations
            if (error.code === '23502') { // Not null violation
                console.error(`PUT /api/efiling/users/${userId} - Not null constraint violation:`, error.detail);
                return NextResponse.json(
                    { error: 'Required field is missing', details: error.detail },
                    { status: 400 }
                );
            }
            
            // Re-throw to be caught by outer catch
            throw error;
        } finally {
            await client.release();
        }

    } catch (error) {
        console.error(`Error updating e-filing user ${userId || 'unknown'}:`, error);
        console.error('Error stack:', error.stack);
        console.error('Error code:', error.code);
        console.error('Error detail:', error.detail);
        console.error('Error constraint:', error.constraint);
        
        // Check if it's a validation error that should return 400
        if (error.message && (
            error.message.includes('already exists') ||
            error.message.includes('Invalid') ||
            error.message.includes('required') ||
            error.message.includes('CNIC')
        )) {
            return NextResponse.json(
                { error: error.message, details: error.details || error.message },
                { status: 400 }
            );
        }
        
        return NextResponse.json(
            { error: 'Failed to update e-filing user', details: error.message },
            { status: 500 }
        );
    }
}

// Delete e-filing user
export async function DELETE(request, { params }) {
    try {
        const { id } = params;

        if (!id) {
            return NextResponse.json(
                { error: 'User ID is required' },
                { status: 400 }
            );
        }

        const client = await connectToDatabase();

        try {
            // Get user info for deletion
            const userInfo = await client.query(
                `SELECT u.id, u.email, eu.employee_id 
                 FROM users u 
                 JOIN efiling_users eu ON u.id = eu.user_id 
                 WHERE eu.id = $1`,
                [id]
            );

            if (userInfo.rows.length === 0) {
                return NextResponse.json(
                    { error: 'E-filing user not found' },
                    { status: 404 }
                );
            }

            const userId = userInfo.rows[0].id;

            // Start transaction
            await client.query('BEGIN');

            // Soft delete from efiling_users (set is_active = false)
            await client.query(
                'UPDATE efiling_users SET is_active = false, updated_at = NOW() WHERE id = $1',
                [id]
            );

            // Soft delete from main users table (set role = null or add a deleted flag)
            await client.query(
                'UPDATE users SET role = NULL, updated_date = NOW() WHERE id = $1',
                [userId]
            );

            // Commit transaction
            await client.query('COMMIT');

            return NextResponse.json({
                success: true,
                message: 'E-filing user deleted successfully'
            });

        } catch (error) {
            // Rollback transaction on error
            await client.query('ROLLBACK');
            throw error;
        } finally {
            await client.release();
        }

    } catch (error) {
        console.error('Error deleting e-filing user:', error);
        return NextResponse.json(
            { error: 'Failed to delete e-filing user', details: error.message },
            { status: 500 }
        );
    }
}
