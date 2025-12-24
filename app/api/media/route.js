import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
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
        const workRequestId = formData.get('workRequestId');
        const geoTag = formData.get('geo_tag');
        
        if (!workRequestId) {
            return NextResponse.json({ error: 'Work Request ID is required' }, { status: 400 });
        }

        // Process images
        const imageFiles = formData.getAll('images');
        const imageDescriptions = formData.getAll('imageDescriptions');
        const imageResults = await processMediaFiles(
            imageFiles, 
            imageDescriptions, 
            workRequestId, 
            geoTag, 
            'images'
        );

        // Process videos
        const videoFiles = formData.getAll('videos');
        const videoDescriptions = formData.getAll('videoDescriptions');
        const videoResults = await processMediaFiles(
            videoFiles, 
            videoDescriptions, 
            workRequestId, 
            geoTag, 
            'videos'
        );

        return NextResponse.json({
            message: 'Media uploaded successfully',
            images: imageResults,
            videos: videoResults
        }, { status: 201 });

    } catch (error) {
        console.error('File upload error:', error);
        return NextResponse.json({ error: 'Failed to upload files' }, { status: 500 });
    }
}

async function processMediaFiles(files, descriptions, workRequestId, geoTag, mediaType) {
    const client = await connectToDatabase();
    const results = [];
    
    // Handle standalone mode
    let baseDir = process.cwd();
    if (baseDir.includes('.next/standalone') || baseDir.includes('.next\\standalone')) {
      baseDir = path.join(baseDir, '..', '..');
    }
    const uploadsDir = path.join(baseDir, 'public', 'uploads', mediaType);
    await fs.mkdir(uploadsDir, { recursive: true });

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;

        const buffer = await file.arrayBuffer();
        
        // Sanitize filename
        const ext = path.extname(file.name);
        let sanitizedName = path.basename(file.name, ext);
        sanitizedName = sanitizedName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
        if (!sanitizedName) sanitizedName = 'file';
        if (sanitizedName.length > 50) sanitizedName = sanitizedName.substring(0, 50);
        
        const filename = `${sanitizedName}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const filePath = path.join(uploadsDir, filename);
        await fs.writeFile(filePath, Buffer.from(buffer));
        
        // Verify file exists after writing
        try {
            await fs.access(filePath);
        } catch (accessError) {
            console.error(`File verification failed: ${filePath}`, accessError);
            continue; // Skip this file and continue with others
        }

        const query = `
            INSERT INTO ${mediaType} 
            (work_request_id, description, link, geo_tag, created_at)
            VALUES ($1, $2, $3, ST_GeomFromText($4, 4326), NOW())
            RETURNING *;
        `;

        const { rows } = await client.query(query, [
            workRequestId,
            descriptions[i] || null,
            `/uploads/${mediaType}/${filename}`,
            geoTag || null
        ]);

        results.push(rows[0]);
    }

    return results;
}