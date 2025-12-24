import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const filePath = searchParams.get('path');
        
        if (!filePath) {
            return NextResponse.json({ error: 'File path is required' }, { status: 400 });
        }

        // SECURITY: Validate and sanitize path to prevent path traversal
        // Remove any path traversal sequences
        if (filePath.includes('..') || filePath.includes('//') || filePath.includes('\\\\')) {
            return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
        }

        // Normalize the path
        const normalizedPath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');

        // Security check - ensure the path is within uploads directory
        const uploadsDir = path.resolve(path.join(process.cwd(), 'public', 'uploads'));
        const fullPath = path.resolve(path.join(process.cwd(), 'public', normalizedPath));
        
        // Check if the file path is within the uploads directory
        if (!fullPath.startsWith(uploadsDir)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        // Check if file exists
        try {
            await fs.access(fullPath);
        } catch (error) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        // Get file stats
        const stats = await fs.stat(fullPath);
        const fileSize = stats.size;
        const fileName = path.basename(fullPath);
        const ext = path.extname(fileName).toLowerCase();
        
        // Determine content type based on file extension
        let contentType = 'application/octet-stream';
        const contentTypes = {
            '.mp4': 'video/mp4',
            '.m4v': 'video/mp4', // Use mp4 MIME type for better browser compatibility
            '.mov': 'video/quicktime',
            '.avi': 'video/avi',
            '.mkv': 'video/mkv',
            '.webm': 'video/webm',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        };
        
        if (contentTypes[ext]) {
            contentType = contentTypes[ext];
        }

        // Read file
        const fileBuffer = await fs.readFile(fullPath);

        // Set appropriate headers
        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Content-Length', fileSize.toString());
        
        // Check if this is a video streaming request (no download parameter)
        const download = searchParams.get('download');
        if (download === 'true' || download === '1') {
            // Force download
            headers.set('Content-Disposition', `attachment; filename="${fileName}"`);
        } else if (contentType.startsWith('video/')) {
            // For video streaming, use inline disposition
            headers.set('Content-Disposition', `inline; filename="${fileName}"`);
        } else {
            // Default to attachment for other files
            headers.set('Content-Disposition', `attachment; filename="${fileName}"`);
        }
        
        headers.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        
        // For video files, also set range headers for streaming
        if (contentType.startsWith('video/')) {
            headers.set('Accept-Ranges', 'bytes');
        }

        return new NextResponse(fileBuffer, {
            status: 200,
            headers
        });

    } catch (error) {
        console.error('Error serving file:', error);
        return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
    }
}
