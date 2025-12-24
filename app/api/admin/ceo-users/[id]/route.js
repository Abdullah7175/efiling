import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import bcrypt from "bcryptjs";
import path from "path";
import { promises as fs } from "fs";

export async function DELETE(request, { params }) {
  try {
    const session = await auth();
    
    // Only allow admins (role 1) to delete CEO users
    if (!session?.user || session.user.role !== 1) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { success: false, message: "CEO user ID is required" },
        { status: 400 }
      );
    }

    // Get CEO user details before deletion
    const ceoUser = await query(`
      SELECT name, email FROM users WHERE id = $1 AND role = 5
    `, [id]);

    if (ceoUser.length === 0) {
      return NextResponse.json(
        { success: false, message: "CEO user not found" },
        { status: 404 }
      );
    }

    // Check if CEO has any pending approvals
    const pendingApprovals = await query(`
      SELECT COUNT(*) as count FROM work_request_approvals 
      WHERE ceo_id = $1 AND approval_status = 'pending'
    `, [id]);

    if (pendingApprovals[0]?.count > 0) {
      return NextResponse.json(
        { success: false, message: "Cannot delete CEO user with pending approvals. Please process all pending approvals first." },
        { status: 400 }
      );
    }

    // Delete CEO user
    const result = await query(`
      DELETE FROM users WHERE id = $1 AND role = 5 RETURNING id, name, email
    `, [id]);

    if (result.length === 0) {
      return NextResponse.json(
        { success: false, message: "Failed to delete CEO user" },
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
      'DELETE',
      'ceo_user',
      parseInt(id),
      `CEO User: ${ceoUser[0].name}`,
      JSON.stringify({
        deletedCeoEmail: ceoUser[0].email,
        deletedCeoName: ceoUser[0].name
      })
    ]);

    return NextResponse.json({
      success: true,
      message: "CEO user deleted successfully"
    });

  } catch (error) {
    console.error('Error deleting CEO user:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const session = await auth();
    
    // Only allow admins (role 1) to update CEO users
    if (!session?.user || session.user.role !== 1) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Admin access required." },
        { status: 403 }
      );
    }

    const { id } = params;
    
    // Handle both JSON and FormData
    let name, email, contact_number, password, image;
    
    const contentType = request.headers.get('content-type');
    if (contentType && contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      name = formData.get('name');
      email = formData.get('email');
      contact_number = formData.get('contact_number');
      password = formData.get('password');
      image = formData.get('image');
    } else {
      const body = await request.json();
      name = body.name;
      email = body.email;
      contact_number = body.contact_number;
      password = body.password;
    }

    if (!id) {
      return NextResponse.json(
        { success: false, message: "CEO user ID is required" },
        { status: 400 }
      );
    }

    // Check if CEO user exists
    const existingUser = await query(`
      SELECT id, name, email FROM users WHERE id = $1 AND role = 5
    `, [id]);

    if (existingUser.length === 0) {
      return NextResponse.json(
        { success: false, message: "CEO user not found" },
        { status: 404 }
      );
    }

    // Check if email already exists for another user
    if (email && email !== existingUser[0].email) {
      const emailExists = await query(`
        SELECT id FROM users WHERE email = $1 AND id != $2
      `, [email, id]);

      if (emailExists.length > 0) {
        return NextResponse.json(
          { success: false, message: "Email already exists" },
          { status: 400 }
        );
      }
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }

    if (email) {
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }

    if (contact_number !== undefined) {
      updates.push(`contact_number = $${paramCount++}`);
      values.push(contact_number);
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 12);
      updates.push(`password = $${paramCount++}`);
      values.push(hashedPassword);
    }

    // Handle image upload
    let imagePath = null;
    if (image && image instanceof File) {
      const bytes = await image.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Generate unique filename
      const timestamp = Date.now();
      const fileExtension = path.extname(image.name);
      const fileName = `ceo_${id}_${timestamp}${fileExtension}`;
      imagePath = path.join(process.cwd(), 'public', 'uploads', 'ceo', fileName);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(imagePath), { recursive: true });
      
      // Save file
      await fs.writeFile(imagePath, buffer);
      
      // Update image path in database
      updates.push(`image = $${paramCount++}`);
      values.push(`/uploads/ceo/${fileName}`);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, message: "No fields to update" },
        { status: 400 }
      );
    }

    updates.push(`updated_date = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await query(`
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND role = 5
      RETURNING id, name, email, contact_number, updated_date
    `, values);

    if (result.length === 0) {
      return NextResponse.json(
        { success: false, message: "Failed to update CEO user" },
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
      'UPDATE',
      'ceo_user',
      parseInt(id),
      `CEO User: ${result[0].name}`,
      JSON.stringify({
        updatedFields: { name, email, contact_number, password: password ? '[HIDDEN]' : undefined },
        previousEmail: existingUser[0].email,
        previousName: existingUser[0].name
      })
    ]);

    return NextResponse.json({
      success: true,
      message: "CEO user updated successfully",
      data: result[0]
    });

  } catch (error) {
    console.error('Error updating CEO user:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
