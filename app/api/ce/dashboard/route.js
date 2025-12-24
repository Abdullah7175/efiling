import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET(request) {
  let client;
  try {
    const session = await auth();
    
    // Only allow CE users (role 7) to access this endpoint
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 7) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. CE access required." },
        { status: 401 }
      );
    }

    client = await connectToDatabase();

    // Get CE user departments (complaint types) and geographic assignments
    const ceUserQuery = await client.query(`
      SELECT 
        cu.id as ce_user_id,
        cu.user_id,
        cu.designation,
        cu.address,
        array_agg(DISTINCT cud.complaint_type_id) FILTER (WHERE cud.complaint_type_id IS NOT NULL) as department_ids,
        array_agg(DISTINCT cuz.zone_id) FILTER (WHERE cuz.zone_id IS NOT NULL) as zone_ids,
        array_agg(DISTINCT cudiv.division_id) FILTER (WHERE cudiv.division_id IS NOT NULL) as division_ids,
        array_agg(DISTINCT cudist.district_id) FILTER (WHERE cudist.district_id IS NOT NULL) as district_ids,
        array_agg(DISTINCT cut.town_id) FILTER (WHERE cut.town_id IS NOT NULL) as town_ids
      FROM ce_users cu
      LEFT JOIN ce_user_departments cud ON cu.id = cud.ce_user_id
      LEFT JOIN ce_user_zones cuz ON cu.id = cuz.ce_user_id
      LEFT JOIN ce_user_divisions cudiv ON cu.id = cudiv.ce_user_id
      LEFT JOIN ce_user_districts cudist ON cu.id = cudist.ce_user_id
      LEFT JOIN ce_user_towns cut ON cu.id = cut.ce_user_id
      WHERE cu.user_id = $1
      GROUP BY cu.id, cu.user_id, cu.designation, cu.address
    `, [session.user.id]);

    if (ceUserQuery.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "CE user not found or no departments assigned." },
        { status: 404 }
      );
    }

    const ceUser = ceUserQuery.rows[0];
    const departmentIds = ceUser.department_ids?.filter(id => id !== null) || [];
    const zoneIds = ceUser.zone_ids?.filter(id => id !== null) || [];
    const divisionIds = ceUser.division_ids?.filter(id => id !== null) || [];
    const districtIds = ceUser.district_ids?.filter(id => id !== null) || [];
    const townIds = ceUser.town_ids?.filter(id => id !== null) || [];

    if (departmentIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          totalRequests: 0,
          pendingApprovals: 0,
          approvedToday: 0,
          rejectedToday: 0,
          ceUser: {
            id: ceUser.ce_user_id,
            designation: ceUser.designation,
            departments: []
          },
          departmentStats: []
        }
      });
    }

    // Get department names
    const departmentNamesQuery = await client.query(`
      SELECT id, type_name FROM complaint_types WHERE id = ANY($1)
    `, [departmentIds]);

    const departmentNames = departmentNamesQuery.rows.reduce((acc, dept) => {
      acc[dept.id] = dept.type_name;
      return acc;
    }, {});

    // Build WHERE clause conditions for filtering
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Department filter (required)
    if (departmentIds.length > 0) {
      const deptPlaceholders = departmentIds.map(() => `$${paramIndex++}`).join(',');
      conditions.push(`wr.complaint_type_id IN (${deptPlaceholders})`);
      params.push(...departmentIds);
    }

    // Geographic filters (if any are assigned)
    const hasGeographicFilters = zoneIds.length > 0 || divisionIds.length > 0 || districtIds.length > 0 || townIds.length > 0;
    
    if (hasGeographicFilters) {
      const geoConditions = [];
      
      // Zone filter
      if (zoneIds.length > 0) {
        const zonePlaceholders = zoneIds.map(() => `$${paramIndex++}`).join(',');
        geoConditions.push(`(
          wr.zone_id IN (${zonePlaceholders})
          OR EXISTS (
            SELECT 1 FROM efiling_zone_locations ezl
            WHERE ezl.zone_id IN (${zonePlaceholders})
            AND (
              (wr.town_id IS NOT NULL AND ezl.town_id = wr.town_id)
              OR (wr.district_id IS NOT NULL AND ezl.district_id = wr.district_id)
            )
          )
        )`);
        params.push(...zoneIds, ...zoneIds);
      }
      
      // Division filter
      if (divisionIds.length > 0) {
        const divPlaceholders = divisionIds.map(() => `$${paramIndex++}`).join(',');
        geoConditions.push(`wr.division_id IN (${divPlaceholders})`);
        params.push(...divisionIds);
      }
      
      // District filter
      if (districtIds.length > 0) {
        const distPlaceholders = districtIds.map(() => `$${paramIndex++}`).join(',');
        geoConditions.push(`(
          wr.district_id IN (${distPlaceholders})
          OR EXISTS (
            SELECT 1 FROM town t2
            WHERE t2.id = wr.town_id
            AND t2.district_id IN (${distPlaceholders})
          )
        )`);
        params.push(...districtIds, ...districtIds);
      }
      
      // Town filter
      if (townIds.length > 0) {
        const townPlaceholders = townIds.map(() => `$${paramIndex++}`).join(',');
        geoConditions.push(`wr.town_id IN (${townPlaceholders})`);
        params.push(...townIds);
      }
      
      if (geoConditions.length > 0) {
        conditions.push(`(${geoConditions.join(' OR ')})`);
      }
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total requests count
    const totalRequestsQuery = await client.query(`
      SELECT COUNT(*) as count
      FROM work_requests wr
      ${whereClause}
    `, params);

    // Get pending approvals count
    const pendingApprovalsQuery = await client.query(`
      SELECT COUNT(*) as count
      FROM work_requests wr
      LEFT JOIN work_request_soft_approvals ce_approval ON wr.id = ce_approval.work_request_id AND ce_approval.approver_type = 'ce'
      ${whereClause}
      AND (ce_approval.approval_status IS NULL OR ce_approval.approval_status = 'pending')
    `, params);

    // Get approved today count
    const approvedTodayQuery = await client.query(`
      SELECT COUNT(*) as count
      FROM work_requests wr
      LEFT JOIN work_request_soft_approvals ce_approval ON wr.id = ce_approval.work_request_id AND ce_approval.approver_type = 'ce'
      ${whereClause}
      AND ce_approval.approval_status = 'approved'
      AND DATE(ce_approval.approved_at) = CURRENT_DATE
    `, params);

    // Get rejected today count
    const rejectedTodayQuery = await client.query(`
      SELECT COUNT(*) as count
      FROM work_requests wr
      LEFT JOIN work_request_soft_approvals ce_approval ON wr.id = ce_approval.work_request_id AND ce_approval.approver_type = 'ce'
      ${whereClause}
      AND ce_approval.approval_status = 'not_approved'
      AND DATE(ce_approval.approved_at) = CURRENT_DATE
    `, params);

    // Get department-wise statistics
    const departmentStatsQuery = await client.query(`
      SELECT 
        wr.complaint_type_id,
        ct.type_name as department_name,
        COUNT(*) as total,
        COUNT(CASE WHEN ce_approval.approval_status IS NULL OR ce_approval.approval_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN ce_approval.approval_status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN ce_approval.approval_status = 'not_approved' THEN 1 END) as rejected
      FROM work_requests wr
      LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
      LEFT JOIN work_request_soft_approvals ce_approval ON wr.id = ce_approval.work_request_id AND ce_approval.approver_type = 'ce'
      ${whereClause}
      GROUP BY wr.complaint_type_id, ct.type_name
      ORDER BY ct.type_name
    `, params);

    return NextResponse.json({
      success: true,
      data: {
        totalRequests: parseInt(totalRequestsQuery.rows[0].count),
        pendingApprovals: parseInt(pendingApprovalsQuery.rows[0].count),
        approvedToday: parseInt(approvedTodayQuery.rows[0].count),
        rejectedToday: parseInt(rejectedTodayQuery.rows[0].count),
        ceUser: {
          id: ceUser.ce_user_id,
          designation: ceUser.designation,
          departments: departmentIds.map(id => ({
            id: id,
            type_name: departmentNames[id]
          }))
        },
        departmentStats: departmentStatsQuery.rows.map(row => ({
          department_id: row.complaint_type_id,
          department_name: row.department_name,
          total: parseInt(row.total),
          pending: parseInt(row.pending),
          approved: parseInt(row.approved),
          rejected: parseInt(row.rejected)
        }))
      }
    });

  } catch (error) {
    console.error('Error in CE dashboard API:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  } finally {
    if (client && client.release) {
      client.release();
    }
  }
}
