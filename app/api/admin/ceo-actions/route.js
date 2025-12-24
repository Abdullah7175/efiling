import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await auth();
    
    // Only allow admins (role 1) to access this endpoint
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 1) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Admin access required." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit')) || 50;
    const offset = parseInt(searchParams.get('offset')) || 0;
    const userId = searchParams.get('userId');

    let whereClause = "WHERE ua.user_type = 'ceo'";
    let queryParams = [limit, offset];

    if (userId) {
      whereClause += " AND ua.user_id = $3";
      queryParams.push(userId);
    }

    // Get CEO user actions with user details
    const actions = await query(`
      SELECT 
        ua.id,
        ua.user_id,
        ua.user_type,
        ua.action,
        ua.entity_type,
        ua.entity_id,
        ua.details,
        ua.ip_address,
        ua.created_at,
        u.name as user_name,
        u.email as user_email
      FROM user_actions ua
      LEFT JOIN users u ON ua.user_id = u.id
      ${whereClause}
      ORDER BY ua.created_at DESC
      LIMIT $1 OFFSET $2
    `, queryParams);

    // Get total count for pagination
    const countQuery = userId 
      ? `SELECT COUNT(*) as total FROM user_actions ua WHERE ua.user_type = 'ceo' AND ua.user_id = $1`
      : `SELECT COUNT(*) as total FROM user_actions ua WHERE ua.user_type = 'ceo'`;
    
    const countParams = userId ? [userId] : [];
    const countResult = await query(countQuery, countParams);

    return NextResponse.json({
      success: true,
      data: {
        actions: actions.rows || [],
        total: countResult.rows?.[0]?.total || 0,
        limit,
        offset
      }
    });

  } catch (error) {
    console.error('Error fetching CEO actions:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
