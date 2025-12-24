import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import bcrypt from "bcryptjs";
import fs from "fs/promises";
import path from "path";

export async function POST(request) {
  try {
    const session = await auth();
    
    // Only allow admins (role 1) to create CEO users
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 1) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const name = formData.get('name');
    const email = formData.get('email');
    const password = formData.get('password');
    const contact_number = formData.get('contact_number');
    const imageFile = formData.get('image');

    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, message: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await query(`
      SELECT id FROM users WHERE email = $1
    `, [email]);

    if (existingUser.rows && existingUser.rows.length > 0) {
      return NextResponse.json(
        { success: false, message: "Email already exists. Please use a different email address." },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Handle image upload
    let imagePath = null;
    if (imageFile && imageFile.size > 0) {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'users');
      await fs.mkdir(uploadsDir, { recursive: true });
      
      const filename = `${Date.now()}-${imageFile.name}`;
      const filePath = path.join(uploadsDir, filename);
      const buffer = await imageFile.arrayBuffer();
      await fs.writeFile(filePath, Buffer.from(buffer));
      imagePath = `/uploads/users/${filename}`;
    }

    // Create CEO user
    const result = await query(`
      INSERT INTO users (name, email, password, contact_number, role, image, created_date, updated_date)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, name, email, contact_number, role, image, created_date
    `, [name, email, hashedPassword, contact_number, 5, imagePath]);

    if (!result.rows || result.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Failed to create CEO user" },
        { status: 500 }
      );
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
      1,
      session.user.name || 'Admin',
      session.user.email,
      'CREATE',
      'ceo_user',
      result.rows[0].id,
      `CEO User: ${name}`,
      JSON.stringify({
        ceoEmail: email,
        ceoName: name,
        ceoContact: contact_number
      })
    ]);

    return NextResponse.json({
      success: true,
      message: "CEO user created successfully",
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating CEO user:', error);
    
    // Handle specific database errors
    if (error.code === '23505') {
      // Unique constraint violation (duplicate email)
      return NextResponse.json(
        { success: false, message: "Email already exists. Please use a different email address." },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const session = await auth();
    
    // Only allow admins (role 1) to view CEO users
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 1) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const ceoUsers = await query(`
      SELECT 
        id, name, email, contact_number, image, created_date, updated_date
      FROM users 
      WHERE role = 5
      ORDER BY created_date DESC
    `);

    return NextResponse.json({
      success: true,
      data: ceoUsers.rows || []
    });

  } catch (error) {
    console.error('Error fetching CEO users:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
