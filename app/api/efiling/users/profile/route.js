import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Get e-filing user profile by users.id
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        // Validate userId - must be a valid integer, not "undefined" or empty
        if (!userId || userId === 'undefined' || userId === 'null' || userId.trim() === '') {
            return NextResponse.json(
                { error: 'User ID is required' },
                { status: 400 }
            );
        }

        // Ensure userId is a valid integer
        const userIdNum = parseInt(userId, 10);
        if (isNaN(userIdNum) || userIdNum <= 0) {
            return NextResponse.json(
                { error: 'Invalid user ID format' },
                { status: 400 }
            );
        }

        const client = await connectToDatabase();

        try {
            // Check if the view exists, if not use direct joins
            let viewExists = false;
            try {
                const viewCheck = await client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.views 
                        WHERE table_schema = 'public' 
                        AND table_name = 'v_efiling_users_by_location'
                    );
                `);
                viewExists = viewCheck.rows[0]?.exists || false;
            } catch (checkError) {
                console.warn('Could not check for view existence:', checkError.message);
            }

            let userResult;
            if (viewExists) {
                // Use the view if it exists
                userResult = await client.query(
                    `SELECT 
                        u.id,
                        u.name,
                        u.email,
                        u.contact_number,
                        u.created_date,
                        u.updated_date,
                        u.role,
                        eu.id AS efiling_user_id,
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
                        eu.is_consultant,
                        eu.district_id,
                        eu.town_id,
                        eu.subtown_id,
                        eu.division_id,
                        eu.created_at,
                        eu.updated_at,
                        eu.google_email,
                        loc.role_code,
                        loc.role_name,
                        loc.department_type,
                        loc.department_name,
                        loc.district_id AS location_district_id,
                        loc.district_name,
                        loc.town_id AS location_town_id,
                        loc.town_name,
                        loc.subtown_id AS location_subtown_id,
                        loc.subtown_name,
                        loc.division_id AS location_division_id,
                        loc.division_name,
                        loc.division_type
                    FROM users u
                    LEFT JOIN efiling_users eu ON u.id = eu.user_id
                    LEFT JOIN v_efiling_users_by_location loc ON loc.user_id = u.id
                    WHERE u.id = $1`,
                    [userIdNum]
                );
            } else {
                // Fallback to direct joins if view doesn't exist
                userResult = await client.query(
                    `SELECT 
                        u.id,
                        u.name,
                        u.email,
                        u.contact_number,
                        u.created_date,
                        u.updated_date,
                        u.role,
                        eu.id AS efiling_user_id,
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
                        eu.is_consultant,
                        eu.district_id,
                        eu.town_id,
                        eu.subtown_id,
                        eu.division_id,
                        eu.created_at,
                        eu.updated_at,
                        eu.google_email,
                        r.code AS role_code,
                        r.name AS role_name,
                        dept.department_type,
                        dept.name AS department_name,
                        d.title AS district_name,
                        t.town AS town_name,
                        st.subtown AS subtown_name,
                        div.name AS division_name,
                        div.ce_type AS division_type
                    FROM users u
                    LEFT JOIN efiling_users eu ON u.id = eu.user_id
                    LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
                    LEFT JOIN efiling_departments dept ON eu.department_id = dept.id
                    LEFT JOIN district d ON eu.district_id = d.id
                    LEFT JOIN town t ON eu.town_id = t.id
                    LEFT JOIN subtown st ON eu.subtown_id = st.id
                    LEFT JOIN divisions div ON eu.division_id = div.id
                    WHERE u.id = $1 AND (eu.is_active = true OR eu.is_active IS NULL)`,
                    [userIdNum]
                );
            }

            if (userResult.rows.length === 0) {
                return NextResponse.json(
                    { error: 'User not found' },
                    { status: 404 }
                );
            }

            const user = userResult.rows[0];

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
        console.error('Error fetching user profile:', error);
        return NextResponse.json(
            { error: 'Failed to fetch user profile', details: error.message },
            { status: 500 }
        );
    }
}
