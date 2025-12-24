import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await auth();
    
    // Only allow COO users (role 6) to access this endpoint
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 6) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. COO access required." },
        { status: 401 }
      );
    }

    // Get basic statistics
    const [
      totalRequests,
      activeRequests,
      completedRequests,
      pendingRequests,
      totalUsers,
      totalAgents,
      recentRequests
    ] = await Promise.all([
      query('SELECT COUNT(*) as count FROM work_requests'),
      query("SELECT COUNT(*) as count FROM work_requests wr JOIN status s ON wr.status_id = s.id WHERE s.name = 'In Progress'"),
      query("SELECT COUNT(*) as count FROM work_requests wr JOIN status s ON wr.status_id = s.id WHERE s.name = 'Completed'"),
      query("SELECT COUNT(*) as count FROM work_requests wr JOIN status s ON wr.status_id = s.id WHERE s.name = 'Pending'"),
      query('SELECT COUNT(*) as count FROM users'),
      query('SELECT COUNT(*) as count FROM agents'),
      query(`
        SELECT 
          wr.id,
          wr.request_date,
          wr.description,
          wr.address,
          wr.contact_number,
          ct.type_name as complaint_type,
          t.town,
          d.title as district,
          u.name as creator_name,
          s.name as status_name
        FROM work_requests wr
        LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
        LEFT JOIN town t ON wr.town_id = t.id
        LEFT JOIN district d ON t.district_id = d.id
        LEFT JOIN users u ON wr.creator_id = u.id
        LEFT JOIN status s ON wr.status_id = s.id
        ORDER BY wr.created_date DESC
        LIMIT 10
      `)
    ]);

    const analyticsData = {
      totalRequests: parseInt(totalRequests.rows[0]?.count || 0),
      activeRequests: parseInt(activeRequests.rows[0]?.count || 0),
      completedRequests: parseInt(completedRequests.rows[0]?.count || 0),
      pendingRequests: parseInt(pendingRequests.rows[0]?.count || 0),
      totalUsers: parseInt(totalUsers.rows[0]?.count || 0),
      totalAgents: parseInt(totalAgents.rows[0]?.count || 0),
      totalBudget: 0,
      recentRequests: recentRequests.rows || [],
      departmentDistribution: [],
      districtDistribution: [],
      townDistribution: [],
      monthlyTrends: [],
      requestTypeDistribution: [],
      statusDistribution: []
    };

    return NextResponse.json({
      success: true,
      data: analyticsData
    });

  } catch (error) {
    console.error('Error in COO analytics API:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
