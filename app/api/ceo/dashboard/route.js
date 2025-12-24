import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { logUserAction } from "@/lib/userActionLogger";

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await auth();
    
    // Only allow CEO users (role 5) to access this endpoint
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 5) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. CEO access required." },
        { status: 401 }
      );
    }

    // Log CEO dashboard access
    await logUserAction({
      user_id: session.user.id,
      user_type: 'ceo',
      user_role: 5,
      user_name: session.user.name || 'CEO',
      user_email: session.user.email,
      action_type: 'VIEW_DASHBOARD',
      entity_type: 'DASHBOARD',
      entity_id: null,
      details: 'CEO accessed dashboard overview',
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    });

    // Get pending approvals count
    const pendingCount = await query(`
      SELECT COUNT(*) as count 
      FROM work_request_approvals wra 
      WHERE wra.approval_status = 'pending'
    `);

    // Get approved requests count (last 30 days)
    const approvedCount = await query(`
      SELECT COUNT(*) as count 
      FROM work_request_approvals wra 
      WHERE wra.approval_status = 'approved'
      AND wra.approval_date >= CURRENT_DATE - INTERVAL '30 days'
    `);

    // Get rejected requests count (last 30 days)
    const rejectedCount = await query(`
      SELECT COUNT(*) as count 
      FROM work_request_approvals wra 
      WHERE wra.approval_status = 'rejected'
      AND wra.approval_date >= CURRENT_DATE - INTERVAL '30 days'
    `);

    // Get recent pending requests
    const recentRequests = await query(`
      SELECT 
        wr.id,
        wr.request_date,
        wr.description,
        wr.address,
        wr.contact_number,
        wr.created_date,
        ct.type_name as complaint_type,
        t.town,
        st.subtown,
        u.name as creator_name,
        wra.approval_status,
        wra.created_at as approval_request_date
      FROM work_requests wr
      LEFT JOIN work_request_approvals wra ON wr.id = wra.work_request_id
      LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
      LEFT JOIN town t ON wr.town_id = t.id
      LEFT JOIN subtown st ON wr.subtown_id = st.id
      LEFT JOIN users u ON wr.creator_id = u.id
      WHERE wra.approval_status = 'pending'
      ORDER BY wra.created_at DESC
      LIMIT 5
    `);

    const dashboardData = {
      pendingCount: pendingCount.rows?.[0]?.count || 0,
      approvedCount: approvedCount.rows?.[0]?.count || 0,
      rejectedCount: rejectedCount.rows?.[0]?.count || 0,
      recentRequests: recentRequests.rows || []
    };

    return NextResponse.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Error fetching CEO dashboard data:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
