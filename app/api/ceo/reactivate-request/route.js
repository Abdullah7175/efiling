import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

export async function POST(request) {
  try {
    const session = await auth();
    
    // Only allow CEO (role 5) or Admin (role 1) to reactivate requests
    if (!session?.user || 
        !(session.user.role === 5 || session.user.role === 1) || 
        session.user.userType !== 'user') {
      return NextResponse.json(
        { success: false, message: "Unauthorized. CEO or Admin access required." },
        { status: 403 }
      );
    }

    const { workRequestId } = await request.json();

    if (!workRequestId) {
      return NextResponse.json(
        { success: false, message: "Work request ID is required" },
        { status: 400 }
      );
    }

    // Check if request exists and is rejected
    const existingRequest = await query(`
      SELECT 
        wr.id,
        wr.creator_id,
        wra.approval_status,
        wra.rejection_reason
      FROM work_requests wr
      LEFT JOIN work_request_approvals wra ON wr.id = wra.work_request_id
      WHERE wr.id = $1 AND wra.approval_status = 'rejected'
    `, [workRequestId]);

    if (!existingRequest.rows || existingRequest.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Rejected request not found" },
        { status: 404 }
      );
    }

    // Update the approval status to pending
    const result = await query(`
      UPDATE work_request_approvals 
      SET 
        approval_status = 'pending',
        approval_date = NULL,
        rejection_reason = NULL,
        ceo_comments = CONCAT(COALESCE(ceo_comments, ''), '\n\nRequest reactivated by ${session.user.role === 5 ? 'CEO' : 'Admin'} on ', CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
      WHERE work_request_id = $1
      RETURNING *
    `, [workRequestId]);

    if (!result.rows || result.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Failed to reactivate request" },
        { status: 500 }
      );
    }

    // Get request details for notification
    const requestDetails = await query(`
      SELECT 
        wr.creator_id,
        wr.creator_type,
        wr.description,
        u.name as creator_name,
        u.email as creator_email
      FROM work_requests wr
      LEFT JOIN users u ON wr.creator_id = u.id
      WHERE wr.id = $1
    `, [workRequestId]);

    if (requestDetails.length > 0) {
      const request = requestDetails[0];
      
      // Create notification for the request creator
      await query(`
        INSERT INTO notifications (user_id, type, entity_id, message, created_at, read)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, false)
      `, [
        request.creator_id,
        'ceo_reactivation',
        workRequestId,
        `Your work request #${workRequestId} has been reactivated and is now pending CEO approval again.`
      ]);
    }

    // Log the action
    await query(`
      INSERT INTO user_actions (
        user_id, user_type, user_role, user_name, user_email,
        action_type, entity_type, entity_id, entity_name,
        details, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
    `, [
      session.user.id,
      'user',
      session.user.role,
      session.user.name || (session.user.role === 5 ? 'CEO' : 'Admin'),
      session.user.email,
      'REACTIVATE',
      'work_request',
      workRequestId,
      `Work Request #${workRequestId}`,
      JSON.stringify({
        previousStatus: 'rejected',
        newStatus: 'pending',
        requestDescription: requestDetails[0]?.description
      })
    ]);

    return NextResponse.json({
      success: true,
      message: "Request reactivated successfully",
      data: result[0]
    });

  } catch (error) {
    console.error('Error reactivating request:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
