// import { NextResponse } from 'next/server';
// import multer from 'multer';
// import { promises as fs } from 'fs';

// // Configure Multer for file storage
// const upload = multer({
//     storage: multer.diskStorage({
//         destination: 'C:/Users/DELL/Downloads/uploads',
//         filename: (req, file, cb) => {
//             cb(null, `${Date.now()}-${file.originalname}`);
//         },
//     }),
// });

// // Helper function to handle Multer middleware
// const runMiddleware = (req, res, fn) => {
//     return new Promise((resolve, reject) => {
//         fn(req, res, (result) => {
//             if (result instanceof Error) {
//                 return reject(result);
//             }
//             resolve(result);
//         });
//     });
// };

// // Define the POST method for file upload
// export async function POST(req) {
//     try {
//         // Convert the incoming request to form data
//         const formData = await req.formData();

//         // Extract the file from form data
//         const file = formData.get('vid');
//         if (!file) {
//             return NextResponse.json({ error: 'No file provided' }, { status: 400 });
//         }

//         // Save the file to the uploads directory
//         const buffer = await file.arrayBuffer();
//         const filename = `C:/Users/DELL/Downloads/uploads/${Date.now()}-${file.name}`;
//         await fs.writeFile(filename, Buffer.from(buffer));

//         return NextResponse.json({
//             message: 'Video uploaded successfully',
//             path: filename, // Send back the saved file path
//         });
//     } catch (error) {
//         console.error('File upload error:', error);
//         return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
//     }
// }
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { promises as fs } from 'fs';
import path from 'path';
import { auth } from '@/auth';
import { 
  UPLOAD_CONFIG, 
  validateFile, 
  generateUniqueFilename, 
  saveFileStream, 
  getDatabaseConnectionWithRetry,
  createErrorResponse,
  createSuccessResponse 
} from '@/lib/fileUploadOptimized';

export async function POST(req) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const workRequestId = formData.get('workRequestId');
        const creatorId = formData.get('creator_id');
        const creatorType = formData.get('creator_type');
        const files = formData.getAll('vid');
        const descriptions = formData.getAll('description');
        const latitudes = formData.getAll('latitude');
        const longitudes = formData.getAll('longitude');

        // Increased limits: up to 15 videos, 100MB each
        const MAX_VIDEOS = 15;
        const MAX_FILE_SIZE = UPLOAD_CONFIG.MAX_VIDEO_SIZE; // 100MB

        if (!workRequestId || files.length === 0) {
            return createErrorResponse('Work Request ID and at least one video are required', 400);
        }

        if (files.length > MAX_VIDEOS) {
            return createErrorResponse(`Maximum ${MAX_VIDEOS} videos allowed per upload`, 400);
        }

        // Validate files with improved error handling
        for (const file of files) {
            const validation = validateFile(file, UPLOAD_CONFIG.ALLOWED_VIDEO_TYPES, MAX_FILE_SIZE);
            if (!validation.isValid) {
                return createErrorResponse(`File ${file.name}: ${validation.errors.join(', ')}`, 400);
            }
        }

        if (files.length !== descriptions.length || files.length !== latitudes.length || files.length !== longitudes.length) {
            return createErrorResponse('Each video must have a description, latitude, and longitude', 400);
        }

        // Use optimized database connection with retry logic
        const client = await getDatabaseConnectionWithRetry();
        
        try {
            // Check if work request exists
            const workRequest = await client.query(`
                SELECT id FROM work_requests WHERE id = $1
            `, [workRequestId]);

            if (!workRequest.rows || workRequest.rows.length === 0) {
                return createErrorResponse('Work request not found', 404);
            }

            // Handle standalone mode - get correct base directory
            let baseDir = process.cwd();
            if (baseDir.includes('.next/standalone') || baseDir.includes('.next\\standalone')) {
                // In standalone mode, go up two levels to get to project root
                baseDir = path.join(baseDir, '..', '..');
            }
            const uploadsDir = path.join(baseDir, 'public', UPLOAD_CONFIG.UPLOAD_DIRS.videos);
            const uploadedVideos = [];
            
            // Process files with optimized handling
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const description = descriptions[i];
                const latitude = latitudes[i] || '0';
                const longitude = longitudes[i] || '0';
                
                if (!description) {
                    continue;
                }
                
                // Generate unique filename and save file
                const filename = generateUniqueFilename(file.name);
                const saveResult = await saveFileStream(file, uploadsDir, filename);
                
                if (!saveResult.success) {
                    console.error(`Failed to save file ${file.name}:`, saveResult.error);
                    continue;
                }
                
                const geoTag = `SRID=4326;POINT(${longitude} ${latitude})`;
                const query = `
                    INSERT INTO videos (work_request_id, description, link, geo_tag, created_at, updated_at, creator_id, creator_type, file_name, file_size, file_type, creator_name)
                    VALUES ($1, $2, $3, ST_GeomFromText($4, 4326), NOW(), NOW(), $5, $6, $7, $8, $9, $10)
                    RETURNING *;
                `;
                const { rows } = await client.query(query, [
                    workRequestId,
                    description,
                    `/uploads/videos/${filename}`,
                    geoTag,
                    creatorId || null,
                    creatorType || null,
                    file.name,
                    file.size,
                    file.type,
                    session.user.name || 'Unknown'
                ]);
                uploadedVideos.push(rows[0]);
            }
            // Notify all managers (role=1 or 2)
            try {
                const managers = await client.query('SELECT id FROM users WHERE role IN (1,2)');
                for (const mgr of managers.rows) {
                    await client.query(
                        'INSERT INTO notifications (user_id, type, entity_id, message) VALUES ($1, $2, $3, $4)',
                        [mgr.id, 'video', workRequestId, `New video uploaded for request #${workRequestId}.`]
                    );
                }
            } catch (notifErr) {
                // Log but don't fail
                console.error('Notification insert error:', notifErr);
            }
            
            return createSuccessResponse({
                videos: uploadedVideos,
                count: uploadedVideos.length
            }, 'Video(s) uploaded successfully');
            
        } finally {
            // Ensure client is released
            if (client && client.release) {
                await client.release();
            }
        }
    } catch (error) {
        console.error('File upload error:', error);
        return createErrorResponse('Failed to upload file(s)', 500, error.message);
    }
}