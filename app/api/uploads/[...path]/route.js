import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join, resolve, normalize } from 'path';
import { existsSync } from 'fs';
import { auth } from '@/auth';

export async function GET(request, { params }) {
  try {
    // SECURITY: Require authentication
    let session;
    try {
      session = await auth();
    } catch (authError) {
      console.error('[Uploads API] Auth error:', authError);
      // For images, we might want to allow unauthenticated access in some cases
      // But for now, we'll log and return 401
      return NextResponse.json({ error: 'Unauthorized - Auth failed' }, { status: 401 });
    }
    
    if (!session?.user) {
      console.error('[Uploads API] No session or user. Session:', session);
      console.error('[Uploads API] Request URL:', request.url);
      console.error('[Uploads API] Request headers:', Object.fromEntries(request.headers.entries()));
      return NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 });
    }
    
    console.log('[Uploads API] Authenticated user:', session.user.id);

    const { path: filePath } = await params;
    
    if (!filePath || filePath.length === 0) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    // SECURITY: Validate and sanitize path segments to prevent path traversal
    const normalizedPath = filePath.map(segment => {
      // Remove any path traversal sequences
      if (segment.includes('..') || segment.includes('/') || segment.includes('\\')) {
        throw new Error('Invalid path segment');
      }
      return segment;
    });

    // Handle standalone mode - get correct base directory
    let baseDir = process.cwd();
    
    // Check for environment variable first (highest priority)
    if (process.env.APP_BASE_DIR) {
      baseDir = process.env.APP_BASE_DIR;
      console.log(`[Uploads API] Using APP_BASE_DIR: ${baseDir}`);
    } else {
      // Detect if we're in standalone mode
      const cwd = process.cwd();
      if (cwd.includes('.next/standalone') || cwd.includes('.next\\standalone')) {
        // In standalone mode, go up to project root
        // .next/standalone -> project root (two levels up)
        baseDir = resolve(join(cwd, '..', '..'));
        console.log(`[Uploads API] Detected standalone mode, baseDir: ${baseDir}`);
      }
      
      // Always verify and try alternative production paths as fallback
      const testUploadsPath = join(baseDir, 'public', 'uploads');
      if (!existsSync(testUploadsPath)) {
        console.log(`[Uploads API] Uploads not found at ${testUploadsPath}, trying alternatives...`);
        // Try alternative production paths
        const productionPaths = ['/opt/wmp16', '/opt/wmp', process.cwd()];
        for (const prodPath of productionPaths) {
          const testPath = join(prodPath, 'public', 'uploads');
          if (existsSync(testPath)) {
            baseDir = prodPath;
            console.log(`[Uploads API] Found uploads at: ${baseDir}`);
            break;
          }
        }
      }
    }

    // Construct the full file path
    const uploadsDir = resolve(join(baseDir, 'public', 'uploads'));
    const fullPath = resolve(join(uploadsDir, ...normalizedPath));

    // SECURITY: Ensure resolved path stays within uploads directory
    if (!fullPath.startsWith(uploadsDir)) {
      console.error(`Path traversal attempt detected. Resolved path: ${fullPath}, Uploads dir: ${uploadsDir}`);
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Check if file exists
    if (!existsSync(fullPath)) {
      console.error(`[Uploads API] File not found: ${fullPath}`);
      console.error(`[Uploads API] Requested path segments: ${filePath.join('/')}`);
      console.error(`[Uploads API] Base directory: ${baseDir}`);
      console.error(`[Uploads API] Process CWD: ${process.cwd()}`);
      console.error(`[Uploads API] Uploads directory: ${uploadsDir}`);
      console.error(`[Uploads API] Normalized path segments: ${normalizedPath.join(', ')}`);
      console.error(`[Uploads API] Full resolved path: ${fullPath}`);
      
      // Also check if uploads directory exists
      if (!existsSync(uploadsDir)) {
        console.error(`[Uploads API] Uploads directory does not exist: ${uploadsDir}`);
      } else {
        // List what's actually in the uploads directory for debugging
        try {
          const fs = require('fs');
          const uploadsContents = fs.readdirSync(uploadsDir);
          console.error(`[Uploads API] Contents of uploads directory: ${uploadsContents.join(', ')}`);
        } catch (e) {
          console.error(`[Uploads API] Could not read uploads directory: ${e.message}`);
        }
      }
      
      // Return a proper 404 response without JSON for media files
      return new NextResponse('File not found', { 
        status: 404,
        headers: {
          'Content-Type': 'text/plain',
        }
      });
    }
    
    // Log successful file resolution for debugging (can help diagnose path issues)
    console.log(`[Uploads API] Successfully resolved file: ${fullPath} from request: ${filePath.join('/')}`);

    // Read the file
    const fileBuffer = await readFile(fullPath);
    
    // Determine content type based on file extension
    const extension = filePath[filePath.length - 1].split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';
    
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        contentType = 'image/jpeg';
        break;
      case 'png':
        contentType = 'image/png';
        break;
      case 'gif':
        contentType = 'image/gif';
        break;
      case 'webp':
        contentType = 'image/webp';
        break;
      case 'pdf':
        contentType = 'application/pdf';
        break;
      case 'doc':
        contentType = 'application/msword';
        break;
      case 'docx':
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'xls':
        contentType = 'application/vnd.ms-excel';
        break;
      case 'xlsx':
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      case 'ppt':
        contentType = 'application/vnd.ms-powerpoint';
        break;
      case 'pptx':
        contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        break;
      case 'mp4':
        contentType = 'video/mp4';
        break;
      case 'webm':
        contentType = 'video/webm';
        break;
      case 'mov':
        contentType = 'video/quicktime';
        break;
      case 'avi':
        contentType = 'video/x-msvideo';
        break;
      default:
        contentType = 'application/octet-stream';
    }

    // Return the file with appropriate headers
    const headers = {
      'Content-Type': contentType,
      'Content-Length': fileBuffer.length.toString(),
      'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
    };
    
    // SECURITY: Allow PDFs to be displayed in iframes (same-origin only)
    // This is safe because the file is served from the same origin and requires authentication
    if (extension === 'pdf') {
      headers['X-Frame-Options'] = 'SAMEORIGIN';
      // Also set Content-Disposition to inline for PDFs so they can be displayed
      headers['Content-Disposition'] = `inline; filename="${filePath[filePath.length - 1]}"`;
    } else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) {
      // For images, allow same-origin embedding and ensure proper content type
      headers['X-Frame-Options'] = 'SAMEORIGIN';
      headers['Content-Disposition'] = `inline; filename="${filePath[filePath.length - 1]}"`;
      // Ensure CORS headers for images if needed
      headers['Access-Control-Allow-Origin'] = '*';
      headers['Access-Control-Allow-Methods'] = 'GET';
    } else {
      // For other file types, deny iframe embedding
      headers['X-Frame-Options'] = 'DENY';
    }
    
    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    });

  } catch (error) {
    console.error('[Uploads API] Error serving file:', error);
    console.error('[Uploads API] Error stack:', error.stack);
    console.error('[Uploads API] Request path segments:', filePath?.join('/') || 'unknown');
    return NextResponse.json({ 
      error: 'Failed to serve file',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}