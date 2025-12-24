import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { logUserAction } from "@/lib/userActionLogger";

export async function GET(request) {
  try {
    const session = await auth();
    
    // Only allow admin users (role 1) to access this endpoint
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 1) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Admin access required." },
        { status: 401 }
      );
    }

    // Check if complaint_type_divisions table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'complaint_type_divisions'
      );
    `);
    
    const hasBridgeTable = tableCheck.rows[0]?.exists || false;
    
    // Fetch all complaint types with multiple divisions (if bridge table exists) or single division
    let complaintTypes;
    if (hasBridgeTable) {
      complaintTypes = await query(`
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
        ORDER BY ct.type_name ASC
      `);
    } else {
      // Fallback query when bridge table doesn't exist yet
      complaintTypes = await query(`
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
          -- Single division as array for consistency
          CASE 
            WHEN ct.division_id IS NOT NULL THEN 
              json_build_array(jsonb_build_object('id', ct.division_id, 'name', d.name))
            ELSE '[]'::json
          END as divisions
        FROM complaint_types ct
        LEFT JOIN efiling_departments ed ON ct.efiling_department_id = ed.id
        LEFT JOIN divisions d ON ct.division_id = d.id
        ORDER BY ct.type_name ASC
      `);
    }

    return NextResponse.json({
      success: true,
      data: complaintTypes.rows
    });

  } catch (error) {
    console.error('Error in complaint types GET API:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const session = await auth();
    
    // Only allow admin users (role 1) to access this endpoint
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 1) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Admin access required." },
        { status: 401 }
      );
    }

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

    // Check if complaint type with this name already exists
    const existingType = await query(`
      SELECT id FROM complaint_types WHERE LOWER(type_name) = LOWER($1)
    `, [type_name.trim()]);

    if (existingType.rows.length > 0) {
      return NextResponse.json(
        { success: false, message: "A complaint type with this name already exists." },
        { status: 400 }
      );
    }

    // Create new complaint type (keep single division_id for backward compatibility)
    const singleDivisionId = finalDivisionIds.length === 1 ? finalDivisionIds[0] : null;
    
    const result = await query(`
      INSERT INTO complaint_types (type_name, description, efiling_department_id, division_id, created_date, updated_date)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      type_name.trim(), 
      description?.trim() || null,
      efiling_department_id ? parseInt(efiling_department_id) : null,
      singleDivisionId
    ]);

    const complaintTypeId = result.rows[0].id;

    // Insert multiple divisions (only if bridge table exists)
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'complaint_type_divisions'
      );
    `);
    
    const hasBridgeTable = tableCheck.rows[0]?.exists || false;
    
    if (hasBridgeTable && finalDivisionIds.length > 0) {
      for (const divId of finalDivisionIds) {
        try {
          await query(`
            INSERT INTO complaint_type_divisions (complaint_type_id, division_id)
            VALUES ($1, $2)
            ON CONFLICT (complaint_type_id, division_id) DO NOTHING
          `, [complaintTypeId, divId]);
        } catch (err) {
          console.error('Error inserting division:', err);
          // Continue even if insertion fails
        }
      }
    }

    // Log the action
    await logUserAction({
      user_id: session.user.id,
      user_type: 'admin',
      user_role: 1,
      user_name: session.user.name || 'Admin',
      user_email: session.user.email,
      action_type: 'CREATE_COMPLAINT_TYPE',
      entity_type: 'COMPLAINT_TYPE',
      entity_id: result.rows[0].id,
      details: `Admin created complaint type: ${type_name}`,
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    });

    return NextResponse.json({
      success: true,
      message: "Complaint type created successfully",
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error in complaint types POST API:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}