import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import bcrypt from "bcryptjs";
import { logUserAction } from "@/lib/userActionLogger";

export async function PUT(request) {
  try {
    const session = await auth();
    
    // Only allow CEO users (role 5) to update their password
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 5) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. CEO access required." },
        { status: 401 }
      );
    }

    const { currentPassword, newPassword } = await request.json();

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, message: "Current password and new password are required" },
        { status: 400 }
      );
    }

    // Validate new password length
    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, message: "New password must be at least 6 characters long" },
        { status: 400 }
      );
    }

    // Get current user data
    const userResult = await query(
      'SELECT password FROM users WHERE id = $1',
      [session.user.id]
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const user = userResult.rows[0];

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect" },
        { status: 400 }
      );
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    const updateResult = await query(
      'UPDATE users SET password = $1, updated_date = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedNewPassword, session.user.id]
    );

    if (!updateResult.rowsAffected || updateResult.rowsAffected === 0) {
      return NextResponse.json(
        { success: false, message: "Failed to update password" },
        { status: 500 }
      );
    }

    // Log CEO password change
    await logUserAction({
      user_id: session.user.id,
      user_type: 'ceo',
      user_role: 5,
      user_name: session.user.name || 'CEO',
      user_email: session.user.email,
      action_type: 'CHANGE_PASSWORD',
      entity_type: 'USER_PROFILE',
      entity_id: session.user.id,
      details: 'CEO changed account password',
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    });

    return NextResponse.json({
      success: true,
      message: "Password updated successfully"
    });

  } catch (error) {
    console.error('Error updating CEO password:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
