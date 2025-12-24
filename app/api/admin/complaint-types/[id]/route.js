import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { logUserAction } from "@/lib/userActionLogger";

export async function GET(request, { params }) {
  try {
    const session = await auth();
    
    // Only allow admin users (role 1) to access this endpoint
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 1) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Admin access required." },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Check if complaint_type_divisions table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'complaint_type_divisions'
      );
    `);
    
    const hasBridgeTable = tableCheck.rows[0]?.exists || false;
    
    // Fetch complaint type with related data and multiple divisions (if bridge table exists) or single division
    let complaintType;
    if (hasBridgeTable) {
      complaintType = await query(`
        SELECT 
          ct.id,
          ct.type_name,
          ct.description,
          ct.created_date,
          ct.updated_date,
          ct.efiling_department_id,
          ct.division_id as single_division_id,
          ed.name as efiling_department_name,
          (SELECT COUNT(*) FROM complaint_subtypes WHERE complaint_type_id = ct.id) as subtype_count,
          (SELECT COUNT(*) FROM ce_user_departments WHERE complaint_type_id = ct.id) as assigned_ce_count,
          -- Subtypes
          COALESCE(
            (SELECT json_agg(jsonb_build_object('id', cst.id, 'subtype_name', cst.subtype_name, 'description', cst.description))
             FROM complaint_subtypes cst
             WHERE cst.complaint_type_id = ct.id),
            '[]'::json
          ) as subtypes,
          -- Assigned CE users
          COALESCE(
            (SELECT json_agg(jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'designation', ce.designation))
             FROM ce_user_departments ceud
             LEFT JOIN ce_users ce ON ceud.ce_user_id = ce.id
             LEFT JOIN users u ON ce.user_id = u.id
             WHERE ceud.complaint_type_id = ct.id AND u.id IS NOT NULL),
            '[]'::json
          ) as assigned_ce_users,
          -- Multiple divisions
          COALESCE(
            (SELECT json_agg(jsonb_build_object('id', d.id, 'name', d.name))
             FROM complaint_type_divisions ctd
             LEFT JOIN divisions d ON ctd.division_id = d.id
             WHERE ctd.complaint_type_id = ct.id AND d.id IS NOT NULL),
            '[]'::json
          ) as divisions
        FROM complaint_types ct
        LEFT JOIN efiling_departments ed ON ct.efiling_department_id = ed.id
        WHERE ct.id = $1
      `, [id]);
    } else {
      // Fallback query when bridge table doesn't exist yet
      complaintType = await query(`
        SELECT 
          ct.id,
          ct.type_name,
          ct.description,
          ct.created_date,
          ct.updated_date,
          ct.efiling_department_id,
          ct.division_id as single_division_id,
          ed.name as efiling_department_name,
          d.name as division_name,
          (SELECT COUNT(*) FROM complaint_subtypes WHERE complaint_type_id = ct.id) as subtype_count,
          (SELECT COUNT(*) FROM ce_user_departments WHERE complaint_type_id = ct.id) as assigned_ce_count,
          -- Subtypes
          COALESCE(
            (SELECT json_agg(jsonb_build_object('id', cst.id, 'subtype_name', cst.subtype_name, 'description', cst.description))
             FROM complaint_subtypes cst
             WHERE cst.complaint_type_id = ct.id),
            '[]'::json
          ) as subtypes,
          -- Assigned CE users
          COALESCE(
            (SELECT json_agg(jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'designation', ce.designation))
             FROM ce_user_departments ceud
             LEFT JOIN ce_users ce ON ceud.ce_user_id = ce.id
             LEFT JOIN users u ON ce.user_id = u.id
             WHERE ceud.complaint_type_id = ct.id AND u.id IS NOT NULL),
            '[]'::json
          ) as assigned_ce_users,
          -- Single division as array for consistency
          CASE 
            WHEN ct.division_id IS NOT NULL THEN 
              json_build_array(jsonb_build_object('id', ct.division_id, 'name', d.name))
            ELSE '[]'::json
          END as divisions
        FROM complaint_types ct
        LEFT JOIN efiling_departments ed ON ct.efiling_department_id = ed.id
        LEFT JOIN divisions d ON ct.division_id = d.id
        WHERE ct.id = $1
      `, [id]);
    }

    if (complaintType.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Complaint type not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: complaintType.rows[0]
    });

  } catch (error) {
    console.error('Error in complaint type GET API:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const session = await auth();
    
    // Only allow admin users (role 1) to access this endpoint
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 1) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Admin access required." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { type_name, description, efiling_department_id, division_id, division_ids } = body;

    // Support both single and multiple divisions
    const finalDivisionIds = division_ids && Array.isArray(division_ids) && division_ids.length > 0 
      ? division_ids.filter(id => id).map(id => parseInt(id)) 
      : (division_id ? [parseInt(division_id)] : []);

    // Validate required fields
    if (!type_name || !type_name.trim()) {
      return NextResponse.json(
        { success: false, message: "Type name is required." },
        { status: 400 }
      );
    }

    // Check if complaint type exists
    const existingType = await query(`
      SELECT id, type_name FROM complaint_types WHERE id = $1
    `, [id]);

    if (existingType.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Complaint type not found." },
        { status: 404 }
      );
    }

    // Check if another complaint type with this name already exists
    const duplicateType = await query(`
      SELECT id FROM complaint_types WHERE LOWER(type_name) = LOWER($1) AND id != $2
    `, [type_name.trim(), id]);

    if (duplicateType.rows.length > 0) {
      return NextResponse.json(
        { success: false, message: "A complaint type with this name already exists." },
        { status: 400 }
      );
    }

    // Update complaint type (keep single division_id for backward compatibility)
    const singleDivisionId = finalDivisionIds.length === 1 ? finalDivisionIds[0] : null;
    
    const result = await query(`
      UPDATE complaint_types 
      SET type_name = $1, description = $2, efiling_department_id = $3, division_id = $4, updated_date = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [
      type_name.trim(), 
      description?.trim() || null,
      efiling_department_id ? parseInt(efiling_department_id) : null,
      singleDivisionId,
      id
    ]);

    // Update multiple divisions if division_ids is provided (only if bridge table exists)
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'complaint_type_divisions'
      );
    `);
    
    const hasBridgeTable = tableCheck.rows[0]?.exists || false;
    
    if (hasBridgeTable && division_ids !== undefined) {
      // Delete existing division assignments
      try {
        await query(`
          DELETE FROM complaint_type_divisions WHERE complaint_type_id = $1
        `, [id]);
        
        // Insert new division assignments
        if (finalDivisionIds.length > 0) {
          for (const divId of finalDivisionIds) {
            await query(`
              INSERT INTO complaint_type_divisions (complaint_type_id, division_id)
              VALUES ($1, $2)
              ON CONFLICT (complaint_type_id, division_id) DO NOTHING
            `, [id, divId]);
          }
        }
      } catch (err) {
        console.error('Error updating divisions:', err);
        // Continue even if update fails
      }
    }

    // Log the action
    await logUserAction({
      user_id: session.user.id,
      user_type: 'admin',
      user_role: 1,
      user_name: session.user.name || 'Admin',
      user_email: session.user.email,
      action_type: 'UPDATE_COMPLAINT_TYPE',
      entity_type: 'COMPLAINT_TYPE',
      entity_id: parseInt(id),
      details: `Admin updated complaint type: ${existingType.rows[0].type_name} -> ${type_name}`,
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    });

    return NextResponse.json({
      success: true,
      message: "Complaint type updated successfully",
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error in complaint type PUT API:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await auth();
    
    // Only allow admin users (role 1) to access this endpoint
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 1) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Admin access required." },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Check if complaint type exists and get its name for logging
    const existingType = await query(`
      SELECT id, type_name FROM complaint_types WHERE id = $1
    `, [id]);

    if (existingType.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Complaint type not found." },
        { status: 404 }
      );
    }

    // Check if complaint type is being used by work requests
    const workRequestsCount = await query(`
      SELECT COUNT(*) as count FROM work_requests WHERE complaint_type_id = $1
    `, [id]);

    if (parseInt(workRequestsCount.rows[0].count) > 0) {
      return NextResponse.json(
        { success: false, message: "Cannot delete complaint type. It is being used by existing work requests." },
        { status: 400 }
      );
    }

    // Check if complaint type is assigned to CE users
    const ceUsersCount = await query(`
      SELECT COUNT(*) as count FROM ce_user_departments WHERE complaint_type_id = $1
    `, [id]);

    if (parseInt(ceUsersCount.rows[0].count) > 0) {
      return NextResponse.json(
        { success: false, message: "Cannot delete complaint type. It is assigned to CE users. Please reassign or remove CE users first." },
        { status: 400 }
      );
    }

    // Delete complaint type (this will cascade delete subtypes due to foreign key constraint)
    await query(`
      DELETE FROM complaint_types WHERE id = $1
    `, [id]);

    // Log the action
    await logUserAction({
      user_id: session.user.id,
      user_type: 'admin',
      user_role: 1,
      user_name: session.user.name || 'Admin',
      user_email: session.user.email,
      action_type: 'DELETE_COMPLAINT_TYPE',
      entity_type: 'COMPLAINT_TYPE',
      entity_id: parseInt(id),
      details: `Admin deleted complaint type: ${existingType.rows[0].type_name}`,
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    });

    return NextResponse.json({
      success: true,
      message: "Complaint type deleted successfully"
    });

  } catch (error) {
    console.error('Error in complaint type DELETE API:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}