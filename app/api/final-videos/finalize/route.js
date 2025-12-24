import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { promises as fs } from 'fs';
import path from 'path';
import { 
  UPLOAD_CONFIG, 
  generateUniqueFilename, 
  ensureUploadDir,
  createErrorResponse,
  createSuccessResponse,
  getDatabaseConnectionWithRetry
} from '@/lib/fileUploadOptimized';

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await req.json();
    const { uploadId, fileName, fileSize, totalChunks, workRequestId, description, latitude, longitude, creator_id, creator_type, creator_name } = body;
    
    if (!uploadId || !fileName || !totalChunks) {
      return createErrorResponse('Missing required finalize data', 400);
    }

    // Get base directory (handle standalone mode)
    let baseDir = process.cwd();
    if (baseDir.includes('.next/standalone') || baseDir.includes('.next\\standalone')) {
      baseDir = path.join(baseDir, '..', '..');
    }
    
    const tempDir = path.join(baseDir, 'temp', 'chunks', uploadId);
    
    // Check if temp directory exists
    try {
      await fs.access(tempDir);
    } catch (error) {
      return createErrorResponse('Upload session not found or expired', 404);
    }

    try {
      // Read all chunks and combine them
      const chunks = [];
      for (let i = 0; i < totalChunks; i++) {
        const chunkFilePath = path.join(tempDir, `chunk_${i}`);
        try {
          const chunkData = await fs.readFile(chunkFilePath);
          chunks.push(chunkData);
        } catch (error) {
          console.error(`Error reading chunk ${i}:`, error);
          throw new Error(`Missing chunk ${i}. Upload may be incomplete.`);
        }
      }

      // Combine chunks
      const combinedBuffer = Buffer.concat(chunks);
      
      // Verify combined file size matches expected size
      if (fileSize && Math.abs(combinedBuffer.length - fileSize) > 1024) { // Allow 1KB variance
        throw new Error(`File size mismatch. Expected ${fileSize}, got ${combinedBuffer.length}`);
      }
      
      // Validate final file size (videos can be up to 100MB)
      if (combinedBuffer.length > UPLOAD_CONFIG.MAX_VIDEO_SIZE) {
        throw new Error(`Final file size (${(combinedBuffer.length / (1024 * 1024)).toFixed(2)}MB) exceeds limit of ${UPLOAD_CONFIG.MAX_VIDEO_SIZE / (1024 * 1024)}MB`);
      }

      // Generate final filename and save to uploads directory
      const finalFilename = generateUniqueFilename(fileName);
      
      // Get the correct public directory path
      // In standalone mode, process.cwd() is .next/standalone, so we need to go up
      let publicDir = path.join(baseDir, 'public');
      
      const uploadsDir = path.join(publicDir, UPLOAD_CONFIG.UPLOAD_DIRS.finalVideos);
      await ensureUploadDir(uploadsDir);
      
      const finalPath = path.join(uploadsDir, finalFilename);
      await fs.writeFile(finalPath, combinedBuffer);
      
      // Verify file exists after writing
      try {
        await fs.access(finalPath);
      } catch (accessError) {
        console.error(`File verification failed: ${finalPath}`, accessError);
        return createErrorResponse('File was written but verification failed', 500);
      }
      
      const filePath = `/uploads/final-videos/${finalFilename}`;

      // If workRequestId and description are provided, create database entry
      if (workRequestId && description) {
        const client = await getDatabaseConnectionWithRetry();
        
        try {
          // Check if work request exists
          const workRequestResult = await client.query(`
            SELECT id FROM work_requests WHERE id = $1
          `, [workRequestId]);

          if (workRequestResult.rows.length === 0) {
            // Clean up file if work request not found
            await fs.unlink(finalPath);
            return createErrorResponse('Work request not found', 404);
          }

          // Create geo_tag from latitude and longitude
          const geoTag = `SRID=4326;POINT(${longitude || 0} ${latitude || 0})`;

          // Save to database
          const query = `
            INSERT INTO final_videos (work_request_id, description, link, geo_tag, created_at, updated_at, creator_id, creator_type, creator_name, file_name, file_size, file_type)
            VALUES ($1, $2, $3, ST_GeomFromText($4, 4326), NOW(), NOW(), $5, $6, $7, $8, $9, $10)
            RETURNING *;
          `;
          
          const fileExt = fileName.split('.').pop();
          const mimeType = `video/${fileExt}`;
          
          const { rows } = await client.query(query, [
            workRequestId,
            description,
            filePath,
            geoTag,
            creator_id || session.user.id,
            creator_type || 'admin',
            creator_name || session.user.name,
            fileName,
            combinedBuffer.length,
            mimeType
          ]);

          // Notify all managers (role=1 or 2)
          try {
            const managers = await client.query('SELECT id FROM users WHERE role IN (1,2)');
            for (const mgr of managers.rows) {
              await client.query(
                'INSERT INTO notifications (user_id, type, entity_id, message) VALUES ($1, $2, $3, $4)',
                [mgr.id, 'final_video', workRequestId, `New final video uploaded for request #${workRequestId}.`]
              );
            }
          } catch (notifErr) {
            // Log but don't fail
            console.error('Notification insert error:', notifErr);
          }

          // Clean up temporary chunks
          await fs.rm(tempDir, { recursive: true, force: true });

          return createSuccessResponse({
            success: true,
            video: rows[0],
            fileName: finalFilename,
            filePath,
            fileSize: combinedBuffer.length,
            message: 'File uploaded and finalized successfully'
          });
          
        } finally {
          if (client && client.release) {
            await client.release();
          }
        }
      } else {
        // No database entry needed, just return file info
        // Clean up temporary chunks
        await fs.rm(tempDir, { recursive: true, force: true });

        return createSuccessResponse({
          success: true,
          fileName: finalFilename,
          filePath,
          fileSize: combinedBuffer.length,
          message: 'File uploaded and finalized successfully'
        });
      }

    } catch (error) {
      // Clean up on error
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Error cleaning up chunks:', cleanupError);
      }
      
      console.error('Error finalizing upload:', error);
      return createErrorResponse(`Failed to finalize upload: ${error.message}`, 500);
    }

  } catch (error) {
    console.error('Finalize upload error:', error);
    return createErrorResponse('Failed to finalize upload', 500, error.message);
  }
}

