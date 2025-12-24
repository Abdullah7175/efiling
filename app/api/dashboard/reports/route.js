import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await auth();

    if (!session?.user || (session.user.userType !== 'user' || (parseInt(session.user.role) !== 1 && parseInt(session.user.role) !== 2))) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Admin or Manager access required." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const reportType = searchParams.get('report_type') || 'all';

    // Build date filter
    let dateFilter = '';
    if (dateFrom && dateTo) {
      dateFilter = `AND wr.request_date BETWEEN '${dateFrom}' AND '${dateTo}'`;
    } else if (dateFrom) {
      dateFilter = `AND wr.request_date >= '${dateFrom}'`;
    } else if (dateTo) {
      dateFilter = `AND wr.request_date <= '${dateTo}'`;
    }

    // Get basic statistics
    const [
      totalRequests,
      completedRequests,
      pendingRequests,
      activeRequests,
      totalUsers,
      totalAgents,
      departmentDistribution,
      districtDistribution,
      townDistribution,
      monthlyTrends,
      requestTypeDistribution,
      statusDistribution,
      completionRate,
      avgCompletionTime,
      topDepartment,
      topDistrict
    ] = await Promise.all([
      // Total requests
      query(`
        SELECT COUNT(*) as count
        FROM work_requests wr
        WHERE 1=1 ${dateFilter}
      `),
      
      // Completed requests
      query(`
        SELECT COUNT(*) as count
        FROM work_requests wr
        LEFT JOIN status s ON wr.status_id = s.id
        WHERE s.name = 'Completed' ${dateFilter}
      `),
      
      // Pending requests
      query(`
        SELECT COUNT(*) as count
        FROM work_requests wr
        LEFT JOIN status s ON wr.status_id = s.id
        WHERE s.name = 'Pending' ${dateFilter}
      `),
      
      // Active requests (In Progress)
      query(`
        SELECT COUNT(*) as count
        FROM work_requests wr
        LEFT JOIN status s ON wr.status_id = s.id
        WHERE s.name = 'In Progress' ${dateFilter}
      `),
      
      // Total users
      query(`
        SELECT COUNT(*) as count
        FROM users
      `),
      
      // Total agents
      query(`
        SELECT COUNT(*) as count
        FROM agents
      `),
      
      // Department distribution
      query(`
        SELECT 
          ct.type_name as department,
          COUNT(*) as count
        FROM work_requests wr
        LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
        WHERE 1=1 ${dateFilter}
        GROUP BY ct.type_name
        ORDER BY count DESC
        LIMIT 10
      `),
      
      // District distribution
      query(`
        SELECT 
          d.title as district,
          COUNT(*) as count
        FROM work_requests wr
        LEFT JOIN town t ON wr.town_id = t.id
        LEFT JOIN district d ON t.district_id = d.id
        WHERE 1=1 ${dateFilter}
        GROUP BY d.title
        ORDER BY count DESC
        LIMIT 10
      `),
      
      // Town distribution
      query(`
        SELECT 
          t.town,
          COUNT(*) as count
        FROM work_requests wr
        LEFT JOIN town t ON wr.town_id = t.id
        WHERE 1=1 ${dateFilter}
        GROUP BY t.town
        ORDER BY count DESC
        LIMIT 10
      `),
      
      // Monthly trends (last 12 months)
      query(`
        SELECT 
          DATE_TRUNC('month', wr.request_date) as month,
          COUNT(*) as count
        FROM work_requests wr
        WHERE wr.request_date >= CURRENT_DATE - INTERVAL '12 months'
        ${dateFilter.replace('wr.request_date', 'wr.request_date')}
        GROUP BY DATE_TRUNC('month', wr.request_date)
        ORDER BY month DESC
        LIMIT 12
      `),
      
      // Request type distribution
      query(`
        SELECT 
          ct.type_name as type,
          COUNT(*) as count
        FROM work_requests wr
        LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
        WHERE 1=1 ${dateFilter}
        GROUP BY ct.type_name
        ORDER BY count DESC
      `),
      
      // Status distribution
      query(`
        SELECT 
          s.name as status,
          COUNT(*) as count
        FROM work_requests wr
        LEFT JOIN status s ON wr.status_id = s.id
        WHERE 1=1 ${dateFilter}
        GROUP BY s.name
        ORDER BY count DESC
      `),
      
      // Completion rate
      query(`
        SELECT 
          CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND((COUNT(CASE WHEN s.name = 'Completed' THEN 1 END) * 100.0 / COUNT(*)), 2)
          END as rate
        FROM work_requests wr
        LEFT JOIN status s ON wr.status_id = s.id
        WHERE 1=1 ${dateFilter}
      `),
      
      // Average completion time
      query(`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (wr.updated_date - wr.created_date))/86400) as avg_days
        FROM work_requests wr
        LEFT JOIN status s ON wr.status_id = s.id
        WHERE s.name = 'Completed' 
        AND wr.updated_date IS NOT NULL
        ${dateFilter}
      `),
      
      // Top department
      query(`
        SELECT 
          ct.type_name as department
        FROM work_requests wr
        LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
        WHERE 1=1 ${dateFilter}
        GROUP BY ct.type_name
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `),
      
      // Top district
      query(`
        SELECT 
          d.title as district
        FROM work_requests wr
        LEFT JOIN town t ON wr.town_id = t.id
        LEFT JOIN district d ON t.district_id = d.id
        WHERE 1=1 ${dateFilter}
        GROUP BY d.title
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `)
    ]);

    const analyticsData = {
      totalRequests: parseInt(totalRequests.rows[0]?.count || 0),
      completedRequests: parseInt(completedRequests.rows[0]?.count || 0),
      pendingRequests: parseInt(pendingRequests.rows[0]?.count || 0),
      activeRequests: parseInt(activeRequests.rows[0]?.count || 0),
      totalUsers: parseInt(totalUsers.rows[0]?.count || 0),
      totalAgents: parseInt(totalAgents.rows[0]?.count || 0),
      departmentDistribution: departmentDistribution.rows || [],
      districtDistribution: districtDistribution.rows || [],
      townDistribution: townDistribution.rows || [],
      monthlyTrends: monthlyTrends.rows || [],
      requestTypeDistribution: requestTypeDistribution.rows || [],
      statusDistribution: statusDistribution.rows || [],
      completionRate: parseFloat(completionRate.rows[0]?.rate || 0),
      avgCompletionTime: parseFloat(avgCompletionTime.rows[0]?.avg_days || 0).toFixed(1),
      topDepartment: topDepartment.rows[0]?.department || '',
      topDistrict: topDistrict.rows[0]?.district || ''
    };

    return NextResponse.json({
      success: true,
      data: analyticsData
    });

  } catch (error) {
    console.error('Error fetching reports data:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
