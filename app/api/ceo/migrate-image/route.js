import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import fs from "fs/promises";
import path from "path";

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

    // Get current CEO profile
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
    
    if (!user.image) {
      return NextResponse.json({
        success: true,
        message: "No image to migrate",
        data: { user }
      });
    }

    // Check if image is in old location (/uploads/users/)
    if (user.image.startsWith('/uploads/users/')) {
      const oldPath = path.join(process.cwd(), 'public', user.image);
      const newDir = path.join(process.cwd(), 'public', 'uploads', 'ceo');
      
      try {
        // Check if old file exists
        await fs.access(oldPath);
        
        // Create new directory if it doesn't exist
        await fs.mkdir(newDir, { recursive: true });
        
        // Generate new filename
        const timestamp = Date.now();
        const fileExtension = path.extname(user.image);
        const newFilename = `ceo_${user.id}_${timestamp}${fileExtension}`;
        const newPath = path.join(newDir, newFilename);
        
        // Copy file to new location
        await fs.copyFile(oldPath, newPath);
        
        // Update database with new path
        const newImagePath = `/uploads/ceo/${newFilename}`;
        await query(`
          UPDATE users 
          SET image = $1, updated_date = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [newImagePath, user.id]);
        
        // Delete old file
        await fs.unlink(oldPath);
        
        return NextResponse.json({
          success: true,
          message: "Image migrated successfully",
          data: {
            oldPath: user.image,
            newPath: newImagePath,
            user: {
              ...user,
              image: newImagePath
            }
          }
        });
        
      } catch (error) {
        console.error('Error migrating image:', error);
        return NextResponse.json(
          { success: false, message: "Failed to migrate image" },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json({
        success: true,
        message: "Image is already in correct location",
        data: { user }
      });
    }

  } catch (error) {
    console.error('Error in image migration:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
