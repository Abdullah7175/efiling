import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";

export async function GET(request) {
  try {
    const session = await auth();

    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 6) { // COO role is 6
      return NextResponse.json(
        { success: false, message: "Unauthorized. COO access required." },
        { status: 403 }
      );
    }

    const userId = session.user.id;

    // Fetch user profile data
    const userResult = await query(
      `SELECT id, name, email, contact_number, image FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "User not found." },
        { status: 404 }
      );
    }

    const user = userResult.rows[0];

    return NextResponse.json({
      success: true,
      message: "Profile fetched successfully.",
      data: user,
    });
  } catch (error) {
    console.error("Error fetching COO profile:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const session = await auth();

    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 6) { // COO role is 6
      return NextResponse.json(
        { success: false, message: "Unauthorized. COO access required." },
        { status: 403 }
      );
    }

    const userId = session.user.id;
    const formData = await request.formData();
    
    const name = formData.get('name');
    const email = formData.get('email');
    const contact_number = formData.get('contact_number');
    const imageFile = formData.get('image');

    // Validate required fields
    if (!name || !email) {
      return NextResponse.json(
        { success: false, message: "Name and email are required." },
        { status: 400 }
      );
    }

    // Check if email is already taken by another user
    const emailCheckResult = await query(
      `SELECT id FROM users WHERE email = $1 AND id != $2`,
      [email, userId]
    );

    if (emailCheckResult.rows.length > 0) {
      return NextResponse.json(
        { success: false, message: "Email is already taken by another user." },
        { status: 400 }
      );
    }

    let imagePath = null;

    // Handle image upload if provided
    if (imageFile && imageFile.size > 0) {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'coo');
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const fileExtension = path.extname(imageFile.name);
      const fileName = `coo_${userId}_${Date.now()}${fileExtension}`;
      const filePath = path.join(uploadsDir, fileName);
      
      // Convert file to buffer and save
      const bytes = await imageFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      fs.writeFileSync(filePath, buffer);
      
      imagePath = `/uploads/coo/${fileName}`;
    }

    // Update user profile
    const updateFields = ['name = $1', 'email = $2', 'contact_number = $3'];
    const updateValues = [name, email, contact_number || null];
    let paramCount = 3;

    if (imagePath) {
      updateFields.push(`image = $${paramCount + 1}`);
      updateValues.push(imagePath);
      paramCount++;
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount + 1}
      RETURNING id, name, email, contact_number, image
    `;

    updateValues.push(userId);

    const result = await query(updateQuery, updateValues);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Failed to update profile." },
        { status: 500 }
      );
    }

    const updatedUser = result.rows[0];

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully.",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating COO profile:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error." },
      { status: 500 }
    );
  }
}
