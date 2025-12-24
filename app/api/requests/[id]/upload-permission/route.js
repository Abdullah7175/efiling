import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

export async function GET(request, { params }) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = params;
    const { searchParams } = new URL(request.url);
    const mediaType = searchParams.get('type'); // 'images', 'videos', 'final_videos'

    if (!id || !mediaType) {
      return NextResponse.json(
        { success: false, message: "Work request ID and media type are required" },
        { status: 400 }
      );
    }

    // Check if work request exists
    const workRequest = await query(`
      SELECT id FROM work_requests WHERE id = $1
    `, [id]);

    if (!workRequest.rows || workRequest.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Work request not found" },
        { status: 404 }
      );
    }

    // All users can upload all media types to any work request
    return NextResponse.json({
      success: true,
      data: {
        canUpload: true,
        allowedMediaTypes: ['before_content', 'images', 'videos', 'final_videos'],
        requestedMediaType: mediaType,
        isMediaTypeAllowed: true,
        reason: "All users can upload media to work requests"
      }
    });

  } catch (error) {
    console.error('Error checking upload permission:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
