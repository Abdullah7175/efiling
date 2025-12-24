import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

// Get user actions with optional filtering
export async function GET(request) {
    let client;
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('user_id');
        const actionType = searchParams.get('action_type');
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = (page - 1) * limit;

        client = await connectToDatabase();
        
        let baseWhere = 'WHERE 1=1';
        const whereParams = [];
        let p = 0;
        if (userId) {
            p++; baseWhere += ` AND ua.user_id = $${p}::VARCHAR`; whereParams.push(userId.toString());
        }
        if (actionType) {
            p++; baseWhere += ` AND ua.action_type = $${p}`; whereParams.push(actionType);
        }
        
        // Count total
        const countRes = await client.query(`
            SELECT COUNT(*)::int AS total
            FROM efiling_user_actions ua
            ${baseWhere}
        `, whereParams);
        const total = countRes.rows[0]?.total || 0;
        const totalPages = Math.ceil(total / limit) || 1;
        
        // Data query
        const dataRes = await client.query(`
            SELECT 
                ua.id,
                ua.file_id,
                ua.user_id,
                ua.action_type,
                ua.description,
                ua.timestamp,
                ua.created_at,
                ua.user_type,
                ua.user_role,
                ua.user_name,
                ua.user_email,
                ua.entity_type,
                ua.entity_name,
                ua.details,
                ua.ip_address,
                ua.user_agent,
                COALESCE(ef.file_number, 'N/A') as file_number,
                COALESCE(ef.subject, 'N/A') as file_subject
            FROM efiling_user_actions ua
            LEFT JOIN efiling_files ef ON (ua.file_id IS NOT NULL AND ua.file_id = ef.id::VARCHAR)
            ${baseWhere}
            ORDER BY ua.timestamp DESC
            LIMIT $${p + 1} OFFSET $${p + 2}
        `, [...whereParams, limit, offset]);
        
        return NextResponse.json({
            success: true,
            data: dataRes.rows,
            page,
            limit,
            total,
            totalPages
        });
    } catch (error) {
        console.error('Error fetching user actions:', error);
        return NextResponse.json(
            { error: 'Failed to fetch user actions' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

// Create new user action
export async function POST(request) {
    let client;
    try {
        const body = await request.json();
        const { 
            file_id, 
            user_id, 
            action_type, 
            description, 
            user_type = 'efiling_user',
            user_role = 0,
            user_name = 'Unknown User',
            user_email = 'unknown@example.com',
            entity_type = 'efiling_file',
            entity_name = 'E-Filing File',
            details = {},
            ip_address = null,
            user_agent = null
        } = body;

        // Ensure user_id is a string to match the VARCHAR column type
        const userIdString = user_id ? user_id.toString() : null;

        if (!user_id || !action_type) {
            return NextResponse.json(
                { error: 'User ID and action type are required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();
        
        // Fetch user information from efiling_users and users tables
        // Handle both users.id and efiling_users.id
        let actualUserName = user_name;
        let actualUserEmail = user_email;
        let actualUserRole = user_role;
        let actualEfilingUserId = userIdString;
        
        try {
            // First, try to find efiling_user by efiling_users.id
            let userInfoQuery = `
                SELECT 
                    eu.id,
                    u.name,
                    u.email,
                    eu.efiling_role_id,
                    r.code as role_code,
                    r.name as role_name,
                    eu.division_id,
                    eu.district_id,
                    eu.town_id
                FROM efiling_users eu
                LEFT JOIN users u ON eu.user_id = u.id
                LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
                WHERE eu.id = $1
            `;
            let userInfoResult = await client.query(userInfoQuery, [userIdString]);
            
            // If not found, try to find by users.id
            if (userInfoResult.rows.length === 0) {
                userInfoQuery = `
                    SELECT 
                        eu.id,
                        u.name,
                        u.email,
                        eu.efiling_role_id,
                        r.code as role_code,
                        r.name as role_name,
                        eu.division_id,
                        eu.district_id,
                        eu.town_id
                    FROM efiling_users eu
                    LEFT JOIN users u ON eu.user_id = u.id
                    LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
                    WHERE u.id = $1
                `;
                userInfoResult = await client.query(userInfoQuery, [userIdString]);
            }
            
            if (userInfoResult.rows.length > 0) {
                const userInfo = userInfoResult.rows[0];
                actualEfilingUserId = userInfo.id.toString(); // Use efiling_users.id
                actualUserName = userInfo.name || user_name;
                actualUserEmail = userInfo.email || user_email;
                actualUserRole = userInfo.efiling_role_id || user_role;
                
                // Add user geographic info to details
                if (!details.division_id && userInfo.division_id) {
                    details.division_id = userInfo.division_id;
                }
                if (!details.district_id && userInfo.district_id) {
                    details.district_id = userInfo.district_id;
                }
                if (!details.town_id && userInfo.town_id) {
                    details.town_id = userInfo.town_id;
                }
                if (!details.role_code && userInfo.role_code) {
                    details.role_code = userInfo.role_code;
                }
            }
        } catch (userInfoError) {
            console.warn('Failed to fetch user info for action logging:', userInfoError);
            // Continue with provided values if fetch fails
        }
        
        const query = `
            INSERT INTO efiling_user_actions 
            (file_id, user_id, action_type, description, timestamp, created_at,
             user_type, user_role, user_name, user_email, entity_type, entity_name,
             details, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `;
        
        const result = await client.query(query, [
            file_id, actualEfilingUserId, action_type, description, user_type, actualUserRole,
            actualUserName, actualUserEmail, entity_type, entity_name, JSON.stringify(details),
            ip_address, user_agent
        ]);
        
        return NextResponse.json({
            success: true,
            action: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating user action:', error);
        return NextResponse.json(
            { error: 'Failed to create user action' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}
