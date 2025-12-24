import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

export async function POST(request) {
  try {
    const session = await auth();
    
    // Check if user is COO (role 6) and userType is 'user'
    if (!session?.user || parseInt(session.user.role) !== 6 || session.user.userType !== 'user') {
      return NextResponse.json(
        { success: false, message: "Unauthorized. COO access required." },
        { status: 403 }
      );
    }

    // Get updated user data from database
    const userResult = await query(`
      SELECT 
        id,
        name,
        email,
        image,
        contact_number,
        role,
        created_date,
        updated_date
      FROM users 
      WHERE id = $1
    `, [session.user.id]);

    if (!userResult.rows || userResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const user = userResult.rows[0];

    // Check if image file exists
    let imageInfo = {
      imagePath: user.image,
      exists: false,
      fullPath: null,
      uploadsDir: process.cwd() + '/uploads/coo/'
    };

    if (user.image) {
      const fs = require('fs');
      const path = require('path');
      
      // Check if it's a full URL or relative path
      if (user.image.startsWith('http')) {
        imageInfo.exists = true;
        imageInfo.fullPath = user.image;
      } else {
        // Handle relative paths
        const imagePath = user.image.startsWith('/') ? user.image.substring(1) : user.image;
        const fullPath = path.join(process.cwd(), 'public', imagePath);
        imageInfo.fullPath = fullPath;
        imageInfo.exists = fs.existsSync(fullPath);
        
        // If not found in public, try uploads/coo directory
        if (!imageInfo.exists) {
          const cooImagePath = path.join(process.cwd(), 'uploads', 'coo', path.basename(imagePath));
          imageInfo.fullPath = cooImagePath;
          imageInfo.exists = fs.existsSync(cooImagePath);
          
          if (imageInfo.exists) {
            // Update the image path to the correct location
            user.image = `/uploads/coo/${path.basename(imagePath)}`;
          }
        }
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
          contact_number: user.contact_number,
          role: user.role,
          created_date: user.created_date,
          updated_date: user.updated_date
        },
        imageInfo
      }
    });

  } catch (error) {
    console.error('Error in COO refresh session API:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
