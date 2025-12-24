import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import fs from "fs/promises";
import path from "path";

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await auth();
    
    // Only allow CEO users (role 5) to access this endpoint
    if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 5) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. CEO access required." },
        { status: 401 }
      );
    }

    // Get CEO profile with image
    const result = await query(`
      SELECT 
        id,
        name,
        email,
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

    const user = result.rows[0];
    
    // Check if image file exists
    let imageExists = false;
    let imagePath = null;
    
    if (user.image) {
      imagePath = path.join(process.cwd(), 'public', user.image);
      try {
        await fs.access(imagePath);
        imageExists = true;
      } catch (error) {
        imageExists = false;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          created_date: user.created_date,
          updated_date: user.updated_date
        },
        imageInfo: {
          imagePath: user.image,
          fullPath: imagePath,
          exists: imageExists,
          uploadsDir: path.join(process.cwd(), 'public', 'uploads', 'ceo')
        }
      }
    });

  } catch (error) {
    console.error('Error testing CEO image:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
