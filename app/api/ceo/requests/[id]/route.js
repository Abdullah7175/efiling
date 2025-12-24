import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { logUserAction } from "@/lib/userActionLogger";

export async function GET(request, { params }) {
  try {
    const session = await auth();
    
    // Only allow CEO users (role 5) to access this endpoint
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 5) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. CEO access required." },
        { status: 401 }
      );
    }

    const requestId = params.id;

    // Log CEO request detail access
    await logUserAction({
      user_id: session.user.id,
      user_type: 'ceo',
      user_role: 5,
      user_name: session.user.name || 'CEO',
      user_email: session.user.email,
      action_type: 'VIEW_REQUEST_DETAILS',
      entity_type: 'WORK_REQUEST',
      entity_id: requestId,
      details: `CEO viewed details for request #${requestId}`,
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    });

    // Get request details
    const request = await query(`
      SELECT 
        wr.id,
        wr.request_date,
        wr.description,
        wr.address,
        wr.contact_number,
        wr.created_date,
        wr.nature_of_work,
        wr.budget_code,
        wr.file_type,
        wr.executive_engineer_id,
        wr.contractor_id,
        ct.type_name as complaint_type,
        cst.subtype_name as complaint_subtype,
        t.town,
        st.subtown,
        d.title as district,
        u.name as creator_name,
        u.email as creator_email,
        wra.approval_status,
        wra.created_at as approval_request_date,
        wra.ceo_comments,
        s.name as status_name,
        ee.name as executive_engineer_name,
        COALESCE(c.company_name, c.name) as contractor_name
      FROM work_requests wr
      LEFT JOIN work_request_approvals wra ON wr.id = wra.work_request_id
      LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
      LEFT JOIN complaint_subtypes cst ON wr.complaint_subtype_id = cst.id
      LEFT JOIN town t ON wr.town_id = t.id
      LEFT JOIN subtown st ON wr.subtown_id = st.id
      LEFT JOIN district d ON t.district_id = d.id
      LEFT JOIN users u ON wr.creator_id = u.id
      LEFT JOIN status s ON wr.status_id = s.id
      LEFT JOIN agents ee ON wr.executive_engineer_id = ee.id
      LEFT JOIN agents c ON wr.contractor_id = c.id
      WHERE wr.id = $1 AND wra.approval_status = 'pending'
    `, [requestId]);

    if (!request.rows || request.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Request not found or not pending approval" },
        { status: 404 }
      );
    }

    // Get before content for this request
    const beforeContent = await query(`
      SELECT 
        id,
        link,
        description,
        created_at,
        creator_name,
        content_type
      FROM before_content 
      WHERE work_request_id = $1
      ORDER BY created_at DESC
    `, [requestId]);

    const requestData = {
      request: request.rows[0],
      beforeContent: beforeContent.rows || []
    };

    return NextResponse.json({
      success: true,
      data: requestData
    });

  } catch (error) {
    console.error('Error fetching request details:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
