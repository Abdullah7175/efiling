import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

export async function POST(request) {
  try {
    const session = await auth();
    
    // Only allow CEO users (role 5) to access this endpoint
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 5) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. CEO access required." },
        { status: 401 }
      );
    }

    // Get current CEO profile from database
    const result = await query(`
      SELECT 
        id,
        name,
        email,
        contact_number,
        image,
        created_date,
        updated_date
      FROM users 
      WHERE id = $1 AND role = 5
    `, [session.user.id]);

    if (!result.rows || result.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Profile not found" },
        { status: 404 }
      );
    }

    const userData = result.rows[0];

    return NextResponse.json({
      success: true,
      message: "Session data refreshed",
      data: {
        user: {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          contact_number: userData.contact_number,
          image: userData.image,
          role: 5,
          userType: 'user'
        },
        session: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          image: session.user.image
        }
      }
    });

  } catch (error) {
    console.error('Error refreshing CEO session:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
