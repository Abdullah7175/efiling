import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query, connectToDatabase } from "@/lib/db";
import bcrypt from "bcryptjs";
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

    // Fetch CE user with departments and geographic assignments
    const ceUser = await query(`
      SELECT 
        cu.id,
        cu.user_id,
        cu.designation,
        cu.address,
        cu.created_at,
        cu.updated_at,
        u.name,
        u.email,
        u.contact_number,
        u.created_date,
        -- Departments
        COALESCE(
          (SELECT json_agg(jsonb_build_object('id', ct.id, 'type_name', ct.type_name))
           FROM ce_user_departments cud
           LEFT JOIN complaint_types ct ON cud.complaint_type_id = ct.id
           WHERE cud.ce_user_id = cu.id AND ct.id IS NOT NULL),
          '[]'::json
        ) as departments,
        -- Zones
        COALESCE(
          (SELECT json_agg(jsonb_build_object('id', ez.id, 'name', ez.name))
           FROM ce_user_zones cuz
           LEFT JOIN efiling_zones ez ON cuz.zone_id = ez.id
           WHERE cuz.ce_user_id = cu.id AND ez.id IS NOT NULL),
          '[]'::json
        ) as zones,
        -- Divisions
        COALESCE(
          (SELECT json_agg(jsonb_build_object('id', d.id, 'name', d.name))
           FROM ce_user_divisions cudiv
           LEFT JOIN divisions d ON cudiv.division_id = d.id
           WHERE cudiv.ce_user_id = cu.id AND d.id IS NOT NULL),
          '[]'::json
        ) as divisions,
        -- Districts
        COALESCE(
          (SELECT json_agg(jsonb_build_object('id', dist.id, 'title', dist.title))
           FROM ce_user_districts cudist
           LEFT JOIN district dist ON cudist.district_id = dist.id
           WHERE cudist.ce_user_id = cu.id AND dist.id IS NOT NULL),
          '[]'::json
        ) as districts,
        -- Towns
        COALESCE(
          (SELECT json_agg(jsonb_build_object('id', t.id, 'town', t.town, 'district_id', t.district_id))
           FROM ce_user_towns cut
           LEFT JOIN town t ON cut.town_id = t.id
           WHERE cut.ce_user_id = cu.id AND t.id IS NOT NULL),
          '[]'::json
        ) as towns
      FROM ce_users cu
      LEFT JOIN users u ON cu.user_id = u.id
      WHERE cu.id = $1
    `, [id]);

    if (ceUser.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "CE user not found." },
        { status: 404 }
      );
    }

    const userData = ceUser.rows[0];
    
    // Process arrays to remove null values
    const processedData = {
      ...userData,
      departments: userData.departments.filter(d => d.id !== null),
      zones: userData.zones.filter(z => z.id !== null),
      divisions: userData.divisions.filter(d => d.id !== null),
      districts: userData.districts.filter(d => d.id !== null),
      towns: userData.towns.filter(t => t.id !== null),
      assigned_department_ids: userData.departments.filter(d => d.id !== null).map(d => d.id),
      assigned_zone_ids: userData.zones.filter(z => z.id !== null).map(z => z.id),
      assigned_division_ids: userData.divisions.filter(d => d.id !== null).map(d => d.id),
      assigned_district_ids: userData.districts.filter(d => d.id !== null).map(d => d.id),
      assigned_town_ids: userData.towns.filter(t => t.id !== null).map(t => t.id)
    };

    return NextResponse.json({
      success: true,
      data: processedData
    });

  } catch (error) {
    console.error('Error in CE user GET API:', error);
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
    const { 
      name, email, password, contact_number, designation, address, departments,
      zone_ids, division_ids, district_ids, town_ids 
    } = body;

    // Validate required fields
    if (!name || !email) {
      return NextResponse.json(
        { success: false, message: "Name and email are required." },
        { status: 400 }
      );
    }

    if (!departments || departments.length === 0) {
      return NextResponse.json(
        { success: false, message: "At least one department must be selected." },
        { status: 400 }
      );
    }

    // Get the CE user and associated user
    const ceUserQuery = await query(`
      SELECT cu.user_id, u.email as current_email
      FROM ce_users cu
      LEFT JOIN users u ON cu.user_id = u.id
      WHERE cu.id = $1
    `, [id]);

    if (ceUserQuery.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "CE user not found." },
        { status: 404 }
      );
    }

    const ceUser = ceUserQuery.rows[0];
    const userId = ceUser.user_id;

    // Check if email is being changed and if new email already exists
    if (email !== ceUser.current_email) {
      const existingUser = await query(`
        SELECT id FROM users WHERE email = $1 AND id != $2
      `, [email, userId]);

      if (existingUser.rows.length > 0) {
        return NextResponse.json(
          { success: false, message: "User with this email already exists." },
          { status: 400 }
        );
      }
    }

    // Start transaction
    const client = await connectToDatabase();
    await client.query('BEGIN');

    try {
      // Update user record
      if (password && password.trim() !== '') {
        // Update with new password
        const hashedPassword = await bcrypt.hash(password, 12);
        await client.query(`
          UPDATE users 
          SET name = $1, email = $2, password = $3, contact_number = $4, updated_date = CURRENT_TIMESTAMP
          WHERE id = $5
        `, [name, email, hashedPassword, contact_number, userId]);
      } else {
        // Update without changing password
        await client.query(`
          UPDATE users 
          SET name = $1, email = $2, contact_number = $3, updated_date = CURRENT_TIMESTAMP
          WHERE id = $4
        `, [name, email, contact_number, userId]);
      }

      // Update CE user record
      await client.query(`
        UPDATE ce_users 
        SET designation = $1, address = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [designation, address, id]);

      // Delete existing department assignments
      await client.query(`
        DELETE FROM ce_user_departments WHERE ce_user_id = $1
      `, [id]);

      // Create new department assignments
      for (const departmentId of departments) {
        await client.query(`
          INSERT INTO ce_user_departments (ce_user_id, complaint_type_id, created_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
        `, [id, departmentId]);
      }

      // Delete existing geographic assignments
      await client.query(`DELETE FROM ce_user_zones WHERE ce_user_id = $1`, [id]);
      await client.query(`DELETE FROM ce_user_divisions WHERE ce_user_id = $1`, [id]);
      await client.query(`DELETE FROM ce_user_districts WHERE ce_user_id = $1`, [id]);
      await client.query(`DELETE FROM ce_user_towns WHERE ce_user_id = $1`, [id]);

      // Create new geographic assignments
      if (zone_ids && Array.isArray(zone_ids) && zone_ids.length > 0) {
        for (const zoneId of zone_ids) {
          await client.query(`
            INSERT INTO ce_user_zones (ce_user_id, zone_id, created_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (ce_user_id, zone_id) DO NOTHING
          `, [id, zoneId]);
        }
      }

      if (division_ids && Array.isArray(division_ids) && division_ids.length > 0) {
        for (const divisionId of division_ids) {
          await client.query(`
            INSERT INTO ce_user_divisions (ce_user_id, division_id, created_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (ce_user_id, division_id) DO NOTHING
          `, [id, divisionId]);
        }
      }

      if (district_ids && Array.isArray(district_ids) && district_ids.length > 0) {
        for (const districtId of district_ids) {
          await client.query(`
            INSERT INTO ce_user_districts (ce_user_id, district_id, created_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (ce_user_id, district_id) DO NOTHING
          `, [id, districtId]);
        }
      }

      if (town_ids && Array.isArray(town_ids) && town_ids.length > 0) {
        for (const townId of town_ids) {
          await client.query(`
            INSERT INTO ce_user_towns (ce_user_id, town_id, created_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (ce_user_id, town_id) DO NOTHING
          `, [id, townId]);
        }
      }

      // Commit transaction
      await client.query('COMMIT');

      // Log the action
      await logUserAction({
        user_id: session.user.id,
        user_type: 'admin',
        user_role: 1,
        user_name: session.user.name || 'Admin',
        user_email: session.user.email,
        action_type: 'UPDATE_CE_USER',
        entity_type: 'CE_USER',
        entity_id: parseInt(id),
        details: `Admin updated CE user: ${name} (${email}) with departments: ${departments.join(', ')}`,
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      });

      return NextResponse.json({
        success: true,
        message: "CE user updated successfully"
      });

    } catch (error) {
      // Rollback transaction
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error in CE user PUT API:', error);
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

    // Get CE user info for logging
    const ceUserQuery = await query(`
      SELECT cu.user_id, u.name, u.email
      FROM ce_users cu
      LEFT JOIN users u ON cu.user_id = u.id
      WHERE cu.id = $1
    `, [id]);

    if (ceUserQuery.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "CE user not found." },
        { status: 404 }
      );
    }

    const ceUser = ceUserQuery.rows[0];
    const userId = ceUser.user_id;

    // Start transaction
    const client = await connectToDatabase();
    await client.query('BEGIN');

    try {
      // Delete department assignments
      await client.query(`
        DELETE FROM ce_user_departments WHERE ce_user_id = $1
      `, [id]);

      // Delete geographic assignments
      await client.query(`DELETE FROM ce_user_zones WHERE ce_user_id = $1`, [id]);
      await client.query(`DELETE FROM ce_user_divisions WHERE ce_user_id = $1`, [id]);
      await client.query(`DELETE FROM ce_user_districts WHERE ce_user_id = $1`, [id]);
      await client.query(`DELETE FROM ce_user_towns WHERE ce_user_id = $1`, [id]);

      // Delete CE user record
      await client.query(`
        DELETE FROM ce_users WHERE id = $1
      `, [id]);

      // Delete user record (this will cascade delete related records)
      await client.query(`
        DELETE FROM users WHERE id = $1
      `, [userId]);

      // Commit transaction
      await client.query('COMMIT');

      // Log the action
      await logUserAction({
        user_id: session.user.id,
        user_type: 'admin',
        user_role: 1,
        user_name: session.user.name || 'Admin',
        user_email: session.user.email,
        action_type: 'DELETE_CE_USER',
        entity_type: 'CE_USER',
        entity_id: parseInt(id),
        details: `Admin deleted CE user: ${ceUser.name} (${ceUser.email})`,
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      });

      return NextResponse.json({
        success: true,
        message: "CE user deleted successfully"
      });

    } catch (error) {
      // Rollback transaction
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error in CE user DELETE API:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}