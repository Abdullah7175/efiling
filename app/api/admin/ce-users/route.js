import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/db";
import bcrypt from "bcryptjs";
import { logUserAction } from "@/lib/userActionLogger";

export async function GET(request) {
  let client;
  try {
    const session = await auth();
    
    // Only allow admin users (role 1) to access this endpoint
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 1) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Admin access required." },
        { status: 401 }
      );
    }

    // Fetch all CE users with their departments and geographic assignments
    client = await connectToDatabase();
    const ceUsers = await client.query(`
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
          (SELECT json_agg(jsonb_build_object('id', t.id, 'town', t.town))
           FROM ce_user_towns cut
           LEFT JOIN town t ON cut.town_id = t.id
           WHERE cut.ce_user_id = cu.id AND t.id IS NOT NULL),
          '[]'::json
        ) as towns
      FROM ce_users cu
      LEFT JOIN users u ON cu.user_id = u.id
      ORDER BY cu.created_at DESC
    `);

    // Process the arrays to remove null values
    const processedUsers = ceUsers.rows.map(user => ({
      ...user,
      departments: user.departments.filter(d => d.id !== null),
      zones: user.zones.filter(z => z.id !== null),
      divisions: user.divisions.filter(d => d.id !== null),
      districts: user.districts.filter(d => d.id !== null),
      towns: user.towns.filter(t => t.id !== null)
    }));

    client.release();

    return NextResponse.json({
      success: true,
      data: processedUsers
    });

  } catch (error) {
    if (client) {
      client.release();
    }
    console.error('Error in CE users GET API:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  let client;
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
    const { 
      name, email, password, contact_number, designation, address, departments,
      zone_ids, division_ids, district_ids, town_ids 
    } = body;

    // Validate required fields
    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, message: "Name, email, and password are required." },
        { status: 400 }
      );
    }

    if (!departments || departments.length === 0) {
      return NextResponse.json(
        { success: false, message: "At least one department must be selected." },
        { status: 400 }
      );
    }

    // Check if user with this email already exists
    client = await connectToDatabase();
    const existingUser = await client.query(`
      SELECT id FROM users WHERE email = $1
    `, [email]);

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { success: false, message: "User with this email already exists." },
        { status: 400 }
      );
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Start transaction
    await client.query('BEGIN');

    try {
      // Create user with role 7 (CE)
      const userResult = await client.query(`
        INSERT INTO users (name, email, password, contact_number, role, created_date, updated_date)
        VALUES ($1, $2, $3, $4, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [name, email, hashedPassword, contact_number]);

      const userId = userResult.rows[0].id;

      // Create CE user record
      const ceUserResult = await client.query(`
        INSERT INTO ce_users (user_id, designation, address, created_at, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [userId, designation, address]);

      const ceUserId = ceUserResult.rows[0].id;

      // Create department assignments
      for (const departmentId of departments) {
        await client.query(`
          INSERT INTO ce_user_departments (ce_user_id, complaint_type_id, created_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
        `, [ceUserId, departmentId]);
      }

      // Create geographic assignments
      if (zone_ids && Array.isArray(zone_ids) && zone_ids.length > 0) {
        for (const zoneId of zone_ids) {
          await client.query(`
            INSERT INTO ce_user_zones (ce_user_id, zone_id, created_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (ce_user_id, zone_id) DO NOTHING
          `, [ceUserId, zoneId]);
        }
      }

      if (division_ids && Array.isArray(division_ids) && division_ids.length > 0) {
        for (const divisionId of division_ids) {
          await client.query(`
            INSERT INTO ce_user_divisions (ce_user_id, division_id, created_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (ce_user_id, division_id) DO NOTHING
          `, [ceUserId, divisionId]);
        }
      }

      if (district_ids && Array.isArray(district_ids) && district_ids.length > 0) {
        for (const districtId of district_ids) {
          await client.query(`
            INSERT INTO ce_user_districts (ce_user_id, district_id, created_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (ce_user_id, district_id) DO NOTHING
          `, [ceUserId, districtId]);
        }
      }

      if (town_ids && Array.isArray(town_ids) && town_ids.length > 0) {
        for (const townId of town_ids) {
          await client.query(`
            INSERT INTO ce_user_towns (ce_user_id, town_id, created_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (ce_user_id, town_id) DO NOTHING
          `, [ceUserId, townId]);
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
        action_type: 'CREATE_CE_USER',
        entity_type: 'CE_USER',
        entity_id: ceUserId,
        details: `Admin created CE user: ${name} (${email}) with departments: ${departments.join(', ')}`,
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      });

      return NextResponse.json({
        success: true,
        message: "CE user created successfully",
        data: { id: ceUserId, user_id: userId }
      });

    } catch (error) {
      // Rollback transaction
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      }
      client.release();
    }
    console.error('Error in CE users POST API:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}