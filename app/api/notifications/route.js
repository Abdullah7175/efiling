import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

export async function GET(request) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const limit = parseInt(searchParams.get('limit')) || 50;

    let whereClause = "";
    let params = [];

    // Determine user type and ID for notifications
    if (session.user.userType === 'user') {
      whereClause = "WHERE n.user_id = $1";
      params = [session.user.id];
    } else if (session.user.userType === 'agent') {
      whereClause = "WHERE n.agent_id = $1";
      params = [session.user.id];
    } else if (session.user.userType === 'socialmedia') {
      whereClause = "WHERE n.socialmedia_id = $1";
      params = [session.user.id];
    } else {
      return NextResponse.json(
        { success: false, message: "Invalid user type" },
        { status: 400 }
      );
    }

    if (unreadOnly) {
      whereClause += " AND n.read = false";
    }

    const notifications = await query(`
      SELECT 
        n.id,
        n.type,
        n.entity_id,
        n.message,
        n.created_at,
        n.read
      FROM notifications n
      ${whereClause}
      AND n.message IS NOT NULL 
      AND n.message != ''
      AND n.message != 'No message'
      ORDER BY n.created_at DESC
      LIMIT $${params.length + 1}
    `, [...params, limit]);

    // Get unread count
    const unreadCount = await query(`
      SELECT COUNT(*) as count
      FROM notifications n
      ${whereClause} 
      AND n.read = false
      AND n.message IS NOT NULL 
      AND n.message != ''
      AND n.message != 'No message'
    `, params);

    return NextResponse.json({
      success: true,
      data: {
        notifications: notifications.rows || [],
        unreadCount: unreadCount.rows[0]?.count || 0
      }
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { notificationIds, action } = await request.json();

    if (!notificationIds || !Array.isArray(notificationIds) || !action) {
      return NextResponse.json(
        { success: false, message: "Invalid request data" },
        { status: 400 }
      );
    }

    if (action === 'mark_read') {
      const result = await query(`
        UPDATE notifications 
        SET read = true 
        WHERE id = ANY($1) AND (
          (user_id = $2 AND $3 = 'user') OR
          (agent_id = $2 AND $3 = 'agent') OR
          (socialmedia_id = $2 AND $3 = 'socialmedia')
        )
        RETURNING id
      `, [notificationIds, session.user.id, session.user.userType]);

      return NextResponse.json({
        success: true,
        message: `${result.length} notifications marked as read`,
        data: { updatedCount: result.length }
      });
    }

    return NextResponse.json(
      { success: false, message: "Invalid action" },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error updating notifications:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}