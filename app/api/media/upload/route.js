import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { auth } from '@/auth';

export async function POST(req) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file');
        const type = formData.get('type') || 'before-content';

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Determine content type based on file MIME type
        const contentType = file.type.startsWith('video/') ? 'video' : 'image';
        
        // Validate file type
        const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        const allowedVideoTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/webm'];
        
        if (contentType === 'image' && !allowedImageTypes.includes(file.type)) {
            return NextResponse.json({ error: 'Invalid image format. Allowed: JPEG, PNG, GIF, WebP' }, { status: 400 });
        }
        
        if (contentType === 'video' && !allowedVideoTypes.includes(file.type)) {
            return NextResponse.json({ error: 'Invalid video format. Allowed: MP4, AVI, MOV, WMV, WebM' }, { status: 400 });
        }

        // Check file size (5MB for images, 100MB for videos)
        const maxSize = contentType === 'image' ? 5 * 1024 * 1024 : 100 * 1024 * 1024;
        if (file.size > maxSize) {
            const maxSizeMB = contentType === 'image' ? '5MB' : '100MB';
            return NextResponse.json({ error: `File size exceeds limit. Maximum allowed: ${maxSizeMB}` }, { status: 400 });
        }

        // Create upload directory based on content type (handle standalone mode)
        let baseDir = process.cwd();
        if (baseDir.includes('.next/standalone') || baseDir.includes('.next\\standalone')) {
            baseDir = path.join(baseDir, '..', '..');
        }
        const uploadsDir = path.join(baseDir, 'public', 'uploads', type, contentType);
        await fs.mkdir(uploadsDir, { recursive: true });

        // Generate unique filename with sanitization
        const buffer = await file.arrayBuffer();
        
        // Sanitize filename
        const ext = path.extname(file.name);
        let sanitizedName = path.basename(file.name, ext);
        sanitizedName = sanitizedName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
        if (!sanitizedName) sanitizedName = 'file';
        if (sanitizedName.length > 50) sanitizedName = sanitizedName.substring(0, 50);
        
        const filename = `${sanitizedName}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const filePath = path.join(uploadsDir, filename);

        // Save file
        await fs.writeFile(filePath, Buffer.from(buffer));
        
        // Verify file exists after writing
        try {
            await fs.access(filePath);
        } catch (accessError) {
            console.error(`File verification failed: ${filePath}`, accessError);
            return NextResponse.json({ error: 'File was written but verification failed' }, { status: 500 });
        }

        // Return the public URL
        const link = `/uploads/${type}/${contentType}/${filename}`;

        return NextResponse.json({ 
            success: true,
            link,
            filename,
            size: file.size,
            type: file.type,
            contentType: contentType
        });

    } catch (error) {
        console.error('File upload error:', error);
        return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }
}
