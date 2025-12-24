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
import {
  resolveEfilingScope,
  appendGeographyFilters,
  recordMatchesGeography,
} from '@/lib/efilingGeographyFilters';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const workRequestId = searchParams.get('workRequestId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '0', 10);
    const offset = (page - 1) * limit;
    const filter = searchParams.get('filter') || '';
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const creatorId = searchParams.get('creator_id');
    const creatorType = searchParams.get('creator_type');

    const client = await connectToDatabase();

    try {
        const scopeInfo = await resolveEfilingScope(request, client, { scopeKeys: ['scope', 'efiling', 'efilingScoped'] });
        if (scopeInfo.apply && scopeInfo.error) {
            return NextResponse.json({ error: scopeInfo.error.message }, { status: scopeInfo.error.status });
        }

        if (id) {
            const query = `
                SELECT fv.*,
                       wr.request_date,
                       wr.address,
                       wr.zone_id,
                       wr.division_id,
                       wr.town_id,
                       t.district_id AS town_district_id,
                       ST_AsGeoJSON(fv.geo_tag) AS geo_tag
                FROM final_videos fv
                JOIN work_requests wr ON fv.work_request_id = wr.id
                LEFT JOIN town t ON wr.town_id = t.id
                WHERE fv.id = $1
            `;
            const result = await client.query(query, [id]);

            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Final video not found' }, { status: 404 });
            }

            if (scopeInfo.apply && !scopeInfo.isGlobal) {
                const allowed = recordMatchesGeography(result.rows[0], scopeInfo.geography, {
                    getDistrict: (row) => row.town_district_id,
                });
                if (!allowed) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                }
            }

            return NextResponse.json(result.rows[0], { status: 200 });
        }

        let countQuery = `
            SELECT COUNT(*)
            FROM final_videos fv
            JOIN work_requests wr ON fv.work_request_id = wr.id
            LEFT JOIN town t ON wr.town_id = t.id
        `;
        let dataQuery = `
            SELECT fv.*,
                   wr.request_date,
                   wr.address,
                   wr.zone_id,
                   wr.division_id,
                   wr.town_id,
                   t.district_id AS town_district_id,
                   ST_AsGeoJSON(fv.geo_tag) AS geo_tag
            FROM final_videos fv
            JOIN work_requests wr ON fv.work_request_id = wr.id
            LEFT JOIN town t ON wr.town_id = t.id
        `;

        let countWhereClauses = [];
        let dataWhereClauses = [];
        let countParams = [];
        let dataParams = [];
        let countIdx = 1;
        let dataIdx = 1;

        if (creatorId && creatorType) {
            countWhereClauses.push(`fv.creator_id = $${countIdx} AND fv.creator_type = $${countIdx + 1}`);
            countParams.push(creatorId, creatorType);
            countIdx += 2;

            dataWhereClauses.push(`fv.creator_id = $${dataIdx} AND fv.creator_type = $${dataIdx + 1}`);
            dataParams.push(creatorId, creatorType);
            dataIdx += 2;
        }

        if (workRequestId) {
            countWhereClauses.push(`fv.work_request_id = $${countIdx}`);
            countParams.push(workRequestId);
            countIdx += 1;

            dataWhereClauses.push(`fv.work_request_id = $${dataIdx}`);
            dataParams.push(workRequestId);
            dataIdx += 1;
        }

        if (filter) {
            const likeClauseCount = `(
                CAST(fv.id AS TEXT) ILIKE $${countIdx} OR
                fv.description ILIKE $${countIdx} OR
                wr.address ILIKE $${countIdx} OR
                CAST(fv.work_request_id AS TEXT) ILIKE $${countIdx}
            )`;
            countWhereClauses.push(likeClauseCount);
            countParams.push(`%${filter}%`);
            countIdx += 1;

            const likeClauseData = `(
                CAST(fv.id AS TEXT) ILIKE $${dataIdx} OR
                fv.description ILIKE $${dataIdx} OR
                wr.address ILIKE $${dataIdx} OR
                CAST(fv.work_request_id AS TEXT) ILIKE $${dataIdx}
            )`;
            dataWhereClauses.push(likeClauseData);
            dataParams.push(`%${filter}%`);
            dataIdx += 1;
        }

        if (dateFrom) {
            countWhereClauses.push(`fv.created_at >= $${countIdx}`);
            countParams.push(dateFrom);
            countIdx += 1;

            dataWhereClauses.push(`fv.created_at >= $${dataIdx}`);
            dataParams.push(dateFrom);
            dataIdx += 1;
        }

        if (dateTo) {
            countWhereClauses.push(`fv.created_at <= $${countIdx}`);
            countParams.push(dateTo);
            countIdx += 1;

            dataWhereClauses.push(`fv.created_at <= $${dataIdx}`);
            dataParams.push(dateTo);
            dataIdx += 1;
        }

        if (scopeInfo.apply && !scopeInfo.isGlobal) {
            const beforeLength = countWhereClauses.length;
            const geoAliases = {
                zone: 'wr.zone_id',
                division: 'wr.division_id',
                town: 'wr.town_id',
                district: 't.district_id',
            };

            countIdx = appendGeographyFilters(countWhereClauses, countParams, countIdx, scopeInfo.geography, geoAliases);
            dataIdx = appendGeographyFilters(dataWhereClauses, dataParams, dataIdx, scopeInfo.geography, geoAliases);

            if (countWhereClauses.length === beforeLength) {
                return NextResponse.json({ error: 'User geography not configured for scoped access' }, { status: 403 });
            }
        }

        if (countWhereClauses.length > 0) {
            countQuery += ' WHERE ' + countWhereClauses.join(' AND ');
        }
        if (dataWhereClauses.length > 0) {
            dataQuery += ' WHERE ' + dataWhereClauses.join(' AND ');
        }

        dataQuery += ' ORDER BY fv.created_at DESC';

        if (limit > 0) {
            dataQuery += ` LIMIT $${dataIdx} OFFSET $${dataIdx + 1}`;
            dataParams.push(limit, offset);
        }

        const countResult = await client.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count, 10);
        const result = await client.query(dataQuery, dataParams);
        return NextResponse.json({ data: result.rows, total }, { status: 200 });
    } catch (error) {
        console.error('Error fetching data:', error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    } finally {
        client.release && client.release();
    }
}

export async function POST(req) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();

        const workRequestId = formData.get('workRequestId');
        const description = formData.get('description');
        const latitude = formData.get('latitude');
        const longitude = formData.get('longitude');
        const file = formData.get('videoFile');
        const creatorId = formData.get('creator_id');
        const creatorType = formData.get('creator_type');
        const creatorName = formData.get('creator_name');

        if (!workRequestId || !description || !file || !creatorId || !creatorType) {
            return createErrorResponse('Missing required fields', 400);
        }

        if (!latitude || !longitude) {
            return createErrorResponse('Location coordinates are required', 400);
        }

        // Validate file size and type
        const validation = validateFile(file, UPLOAD_CONFIG.ALLOWED_VIDEO_TYPES, UPLOAD_CONFIG.MAX_VIDEO_SIZE);
        if (!validation.isValid) {
            return createErrorResponse(`File validation failed: ${validation.errors.join(', ')}`, 400);
        }

        // Validate creator type (only social media agents can upload final videos)
        if (creatorType !== 'socialmedia') {
            return createErrorResponse('Only Media Cell agents can upload final videos', 403);
        }

        // Use optimized database connection with retry logic
        const client = await getDatabaseConnectionWithRetry();

        try {
        // Check upload permission for final videos
            const workRequestResult = await client.query(`
            SELECT id FROM work_requests WHERE id = $1
        `, [workRequestId]);

        if (workRequestResult.rows.length === 0) {
                return createErrorResponse('Work request not found', 404);
            }

            // Handle standalone mode - get correct base directory
            let baseDir = process.cwd();
            if (baseDir.includes('.next/standalone') || baseDir.includes('.next\\standalone')) {
                // In standalone mode, go up two levels to get to project root
                baseDir = path.join(baseDir, '..', '..');
            }
            const uploadsDir = path.join(baseDir, 'public', UPLOAD_CONFIG.UPLOAD_DIRS.finalVideos);
            const filename = generateUniqueFilename(file.name);
            const saveResult = await saveFileStream(file, uploadsDir, filename);

            if (!saveResult.success) {
                return createErrorResponse(`Failed to save file: ${saveResult.error}`, 500);
            }

        // Create geo_tag from latitude and longitude (use defaults if not provided)
        const geoTag = `SRID=4326;POINT(${longitude || 0} ${latitude || 0})`;

            // Save to database
        const query = `
                INSERT INTO final_videos (work_request_id, description, link, geo_tag, created_at, updated_at, creator_id, creator_type, creator_name, file_name, file_size, file_type)
                VALUES ($1, $2, $3, ST_GeomFromText($4, 4326), NOW(), NOW(), $5, $6, $7, $8, $9, $10)
            RETURNING *;
        `;
            const { rows } = await client.query(query, [
            workRequestId,
            description,
            `/uploads/final-videos/${filename}`,
            geoTag,
            creatorId,
            creatorType,
                creatorName || null,
                file.name,
                file.size,
                file.type
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

            return createSuccessResponse({
            video: rows[0]
            }, 'Final video uploaded successfully');

        } finally {
            // Ensure client is released
            if (client && client.release) {
                await client.release();
            }
        }

    } catch (error) {
        console.error('File upload error:', error);
        return createErrorResponse('Failed to upload file', 500, error.message);
    }
}

export async function PUT(req) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();

        const id = formData.get('id');
        const workRequestId = formData.get('workRequestId');
        const description = formData.get('description');
        const latitude = formData.get('latitude');
        const longitude = formData.get('longitude');
        const file = formData.get('videoFile');
        const creatorId = formData.get('creator_id') || session.user.id;
        const creatorType = formData.get('creator_type') || 'admin';
        const creatorName = formData.get('creator_name') || session.user.name;

        if (!id || !workRequestId || !description) {
            return createErrorResponse('Missing required fields', 400);
        }

        if (!latitude || !longitude) {
            return createErrorResponse('Location coordinates are required', 400);
        }

        const client = await getDatabaseConnectionWithRetry();

        try {
            // Check if video exists
            const checkQuery = 'SELECT * FROM final_videos WHERE id = $1';
            const { rows: existingVideo } = await client.query(checkQuery, [id]);

            if (existingVideo.length === 0) {
                return createErrorResponse('Final video not found', 404);
            }

            let updateQuery;
            let queryParams;
            let newLink = existingVideo[0].link;

            // If a new file is provided, handle file upload
            if (file) {
                // Validate file
                const validationResult = validateFile(file, UPLOAD_CONFIG.ALLOWED_VIDEO_TYPES, UPLOAD_CONFIG.MAX_VIDEO_SIZE);
                if (!validationResult.isValid) {
                    return createErrorResponse(`File validation failed: ${validationResult.errors.join(', ')}`, 400);
                }

                // Handle standalone mode - get correct base directory
                let baseDir = process.cwd();
                if (baseDir.includes('.next/standalone') || baseDir.includes('.next\\standalone')) {
                    // In standalone mode, go up two levels to get to project root
                    baseDir = path.join(baseDir, '..', '..');
                }
                
                // Generate unique filename
                const uniqueFilename = generateUniqueFilename(file.name);
                const uploadDir = path.join(baseDir, 'public', UPLOAD_CONFIG.UPLOAD_DIRS.finalVideos);

                // Ensure directory exists
                await fs.mkdir(uploadDir, { recursive: true });

                // Save new file
                const saveResult = await saveFileStream(file, uploadDir, uniqueFilename);
                if (!saveResult.success) {
                    return createErrorResponse(`Failed to save file: ${saveResult.error}`, 500);
                }

                // Delete old file if it exists
                if (existingVideo[0].link) {
                    const oldFilePath = path.join(baseDir, 'public', existingVideo[0].link);
                    try {
                        await fs.unlink(oldFilePath);
                    } catch (unlinkError) {
                        console.warn('Could not delete old file:', unlinkError.message);
                    }
                }

                newLink = `/uploads/final-videos/${uniqueFilename}`;

                // Create geo_tag from latitude and longitude
                const geoTag = `SRID=4326;POINT(${longitude || 0} ${latitude || 0})`;

                // Update with new file
                updateQuery = `
                    UPDATE final_videos
                    SET work_request_id = $2, description = $3, link = $4, geo_tag = ST_GeomFromText($5, 4326),
                        file_name = $6, file_size = $7, file_type = $8, updated_at = NOW()
                    WHERE id = $1
                    RETURNING *;
                `;
                queryParams = [
                    id, workRequestId, description, newLink, geoTag,
                    file.name, file.size, file.type
                ];
            } else {
                // Create geo_tag from latitude and longitude
                const geoTag = `SRID=4326;POINT(${longitude || 0} ${latitude || 0})`;

                // Update without new file
                updateQuery = `
                    UPDATE final_videos
                    SET work_request_id = $2, description = $3, geo_tag = ST_GeomFromText($4, 4326),
                        updated_at = NOW()
                    WHERE id = $1
                    RETURNING *;
                `;
                queryParams = [id, workRequestId, description, geoTag];
            }

            const { rows: updatedVideo } = await client.query(updateQuery, queryParams);

            return createSuccessResponse({
                message: 'Final video updated successfully',
                video: updatedVideo[0]
            });

        } finally {
            client.release && client.release();
        }

    } catch (error) {
        console.error('Error updating final video:', error);
        return createErrorResponse('Failed to update final video', 500);
    }
}

export async function DELETE(req) {
    try {
        const body = await req.json();
        const client = await connectToDatabase();

        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'Final video ID is required' }, { status: 400 });
        }

        // First get the video to delete the file
        const getQuery = 'SELECT link FROM final_videos WHERE id = $1';
        const { rows: [video] } = await client.query(getQuery, [id]);

        if (!video) {
            return NextResponse.json({ error: 'Final video not found' }, { status: 404 });
        }

        // Handle standalone mode - get correct base directory
        let baseDir = process.cwd();
        if (baseDir.includes('.next/standalone') || baseDir.includes('.next\\standalone')) {
            // In standalone mode, go up two levels to get to project root
            baseDir = path.join(baseDir, '..', '..');
        }
        
        // Delete the file
        if (video.link) {
            try {
                const filePath = path.join(baseDir, 'public', video.link);
                await fs.unlink(filePath);
            } catch (fileError) {
                console.error('Error deleting final video file:', fileError);
            }
        }

        // Delete from database
        const deleteQuery = `
            DELETE FROM final_videos
            WHERE id = $1
            RETURNING *;
        `;

        const { rows: deletedVideo } = await client.query(deleteQuery, [id]);

        return NextResponse.json({ message: 'Final video deleted successfully', video: deletedVideo[0] }, { status: 200 });

    } catch (error) {
        console.error('Error deleting final video:', error);
        return NextResponse.json({ error: 'Error deleting final video' }, { status: 500 });
    }
} 