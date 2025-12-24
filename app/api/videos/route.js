// import { NextResponse } from 'next/server';
// import { connectToDatabase } from '@/lib/db';


// export async function GET(request) {
//     const { searchParams } = new URL(request.url);
//     const id = searchParams.get('id');
//     const client = await connectToDatabase();

//     try {
//         if (id) {
//             const query = 'SELECT * FROM videos WHERE id = $1';
//             const result = await client.query(query, [id]);

//             if (result.rows.length === 0) {
//                 return NextResponse.json({ error: 'Video not found' }, { status: 404 });
//             }

//             return NextResponse.json(result.rows[0], { status: 200 });
//         } else {
//             const query = `'SELECT * FROM videos`;
//             const result = await client.query(query);

//             return NextResponse.json(result.rows, { status: 200 });
//         }
//     } catch (error) {
//         console.error('Error fetching data:', error);
//         return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
//     } finally {
//         client.release && client.release();
//     }
// }

// export async function POST(req) {
//     try {
//         const body = await req.json();
//         const client = await connectToDatabase();

//         const query = `
//       INSERT INTO videos (link)
//       VALUES ($1) RETURNING *;
//     `;
//         const { rows: newVideo } = await client.query(query, [
//          body.link,
//         ]);

//         return NextResponse.json({ message: 'Video added successfully', video: newVideo[0] }, { status: 201 });

//     } catch (error) {
//         console.error('Error saving video:', error);
//         return NextResponse.json({ error: 'Error saving video' }, { status: 500 });
//     }
// }

// export async function PUT(req) {
//     try {
//         const body = await req.json();
//         const client = await connectToDatabase();
//         const {id, link} = body;

//         if (!id || !link ) {
//             return NextResponse.json({ error: 'All fields (id, name) are required' }, { status: 400 });
//         }

//         const query = `
//             UPDATE videos 
//             SET link = $1
//             WHERE id = $2
//             RETURNING *;
//         `; 
//         const { rows: updatedVideo } = await client.query(query, [
//             link,
//             id
//         ]);

//         if (updatedVideo.length === 0) {
//             return NextResponse.json({ error: 'Video not found' }, { status: 404 });
//         }

//         return NextResponse.json({ message: 'Video updated successfully', video: updatedVideo[0] }, { status: 200 });

//     } catch (error) {
//         console.error('Error updating video:', error);
//         return NextResponse.json({ error: 'Error updating video' }, { status: 500 });
//     }
// }

// export async function DELETE(req) {
//     try {
//         const body = await req.json();
//         const client = await connectToDatabase();

//         const { id } = body;

//         if (!id) {
//             return NextResponse.json({ error: 'Video Id is required' }, { status: 400 });
//         }

//         const query = `
//             DELETE FROM videos 
//             WHERE id = $1
//             RETURNING *;
//         `;

//         const { rows: deletedVideo } = await client.query(query, [id]);

//         if (deletedVideo.length === 0) {
//             return NextResponse.json({ error: 'Video not found' }, { status: 404 });
//         }

//         return NextResponse.json({ message: 'Video deleted successfully', user: deletedVideo[0] }, { status: 200 });

//     } catch (error) {
//         console.error('Error deleting video:', error);
//         return NextResponse.json({ error: 'Error deleting video' }, { status: 500 });
//     }
// }

import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { promises as fs } from 'fs';
import path from 'path';
import { auth } from '@/auth';
import {
    resolveEfilingScope,
    appendGeographyFilters,
    recordMatchesGeography,
} from '@/lib/efilingGeographyFilters';

export async function GET(request) {
    // SECURITY: Require authentication
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
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
                SELECT 
                    v.*, 
                    wr.request_date, 
                    wr.address,
                    wr.zone_id,
                    wr.division_id,
                    wr.town_id,
                    t.district_id AS town_district_id,
                    t.town AS town_name,
                    d.name AS division_name,
                    ST_Y(v.geo_tag) as latitude,
                    ST_X(v.geo_tag) as longitude
                FROM videos v
                JOIN work_requests wr ON v.work_request_id = wr.id
                LEFT JOIN town t ON wr.town_id = t.id
                LEFT JOIN divisions d ON wr.division_id = d.id
                WHERE v.id = $1
            `;
            const result = await client.query(query, [id]);

            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Video not found' }, { status: 404 });
            }

            const video = result.rows[0];

            // SECURITY: IDOR Fix - Check ownership or admin role
            const isAdmin = [1, 2].includes(parseInt(session.user.role));
            const isCreator = video.creator_id === parseInt(session.user.id) && video.creator_type === session.user.userType;
            
            if (!isCreator && !isAdmin) {
                return NextResponse.json({ error: 'Forbidden - You do not have access to this video' }, { status: 403 });
            }

            if (scopeInfo.apply && !scopeInfo.isGlobal) {
                const allowed = recordMatchesGeography(video, scopeInfo.geography, {
                    getDistrict: (row) => row.town_district_id,
                });
                if (!allowed) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                }
            }

            return NextResponse.json(video, { status: 200 });
        } else if (creatorId && creatorType) {
            const query = `
                SELECT 
                    v.*, 
                    wr.request_date, 
                    wr.address,
                    wr.zone_id,
                    wr.division_id,
                    wr.town_id,
                    t.district_id AS town_district_id,
                    t.town AS town_name,
                    d.name AS division_name,
                    ST_Y(v.geo_tag) as latitude, 
                    ST_X(v.geo_tag) as longitude
                FROM videos v
                JOIN work_requests wr ON v.work_request_id = wr.id
                LEFT JOIN town t ON wr.town_id = t.id
                LEFT JOIN divisions d ON wr.division_id = d.id
                WHERE v.creator_id = $1 AND v.creator_type = $2
            `;
            const params = [creatorId, creatorType];

            const whereClauses = [];
            let paramIdx = params.length + 1;
            if (scopeInfo.apply && !scopeInfo.isGlobal) {
                const beforeLength = whereClauses.length;
                paramIdx = appendGeographyFilters(
                    whereClauses,
                    params,
                    paramIdx,
                    scopeInfo.geography,
                    {
                        zone: 'wr.zone_id',
                        division: 'wr.division_id',
                        town: 'wr.town_id',
                        district: 't.district_id',
                    }
                );
                if (whereClauses.length === beforeLength) {
                    return NextResponse.json({ error: 'User geography not configured for scoped access' }, { status: 403 });
                }
            }

            let scopedQuery = query;
            if (whereClauses.length > 0) {
                scopedQuery += ' AND ' + whereClauses.join(' AND ');
            }
            scopedQuery += ' ORDER BY v.created_at DESC';

            const result = await client.query(scopedQuery, params);
            return NextResponse.json({ data: result.rows, total: result.rows.length }, { status: 200 });
        } else if (workRequestId) {
            const query = `
                SELECT 
                    v.*, 
                    wr.request_date, 
                    wr.address,
                    wr.zone_id,
                    wr.division_id,
                    wr.town_id,
                    t.district_id AS town_district_id,
                    t.town AS town_name,
                    d.name AS division_name,
                    ST_Y(v.geo_tag) as latitude,
                    ST_X(v.geo_tag) as longitude
                FROM videos v
                JOIN work_requests wr ON v.work_request_id = wr.id
                LEFT JOIN town t ON wr.town_id = t.id
                LEFT JOIN divisions d ON wr.division_id = d.id
                WHERE v.work_request_id = $1
            `;
            const params = [workRequestId];
            const whereClauses = [];
            let paramIdx = params.length + 1;

            if (scopeInfo.apply && !scopeInfo.isGlobal) {
                const beforeLength = whereClauses.length;
                paramIdx = appendGeographyFilters(
                    whereClauses,
                    params,
                    paramIdx,
                    scopeInfo.geography,
                    {
                        zone: 'wr.zone_id',
                        division: 'wr.division_id',
                        town: 'wr.town_id',
                        district: 't.district_id',
                    }
                );
                if (whereClauses.length === beforeLength) {
                    return NextResponse.json({ error: 'User geography not configured for scoped access' }, { status: 403 });
                }
            }

            let scopedQuery = query;
            if (whereClauses.length > 0) {
                scopedQuery += ' AND ' + whereClauses.join(' AND ');
            }
            scopedQuery += ' ORDER BY v.created_at DESC';

            const result = await client.query(scopedQuery, params);
            if (scopeInfo.apply && !scopeInfo.isGlobal && result.rows.length > 0) {
                const allowed = recordMatchesGeography(result.rows[0], scopeInfo.geography, {
                    getDistrict: (row) => row.town_district_id,
                });
                if (!allowed) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                }
            }
            return NextResponse.json({ data: result.rows, total: result.rows.length }, { status: 200 });
        } else {
            let countQuery = `
                SELECT COUNT(*) 
                FROM videos v 
                JOIN work_requests wr ON v.work_request_id = wr.id
                LEFT JOIN town t ON wr.town_id = t.id
                LEFT JOIN divisions d ON wr.division_id = d.id
            `;
            let dataQuery = `
                SELECT 
                    v.*, 
                    wr.request_date, 
                    wr.address,
                    wr.zone_id,
                    wr.division_id,
                    wr.town_id,
                    t.district_id AS town_district_id,
                    t.town AS town_name,
                    d.name AS division_name,
                    ST_Y(v.geo_tag) as latitude,
                    ST_X(v.geo_tag) as longitude
                FROM videos v 
                JOIN work_requests wr ON v.work_request_id = wr.id
                LEFT JOIN town t ON wr.town_id = t.id
                LEFT JOIN divisions d ON wr.division_id = d.id
            `;
            let whereClauses = [];
            let params = [];
            let paramIdx = 1;
            let dataWhereClauses = [];
            let dataParams = [];
            let dataParamIdx = 1;
            if (filter) {
                whereClauses.push(`(
                    CAST(v.id AS TEXT) ILIKE $${paramIdx} OR
                    v.description ILIKE $${paramIdx} OR
                    wr.address ILIKE $${paramIdx} OR
                    CAST(v.work_request_id AS TEXT) ILIKE $${paramIdx}
                )`);
                params.push(`%${filter}%`);
                paramIdx++;

                dataWhereClauses.push(`(
                    CAST(v.id AS TEXT) ILIKE $${dataParamIdx} OR
                    v.description ILIKE $${dataParamIdx} OR
                    wr.address ILIKE $${dataParamIdx} OR
                    CAST(v.work_request_id AS TEXT) ILIKE $${dataParamIdx}
                )`);
                dataParams.push(`%${filter}%`);
                dataParamIdx++;
            }
            if (dateFrom) {
                whereClauses.push(`v.created_at >= $${paramIdx}`);
                params.push(dateFrom);
                paramIdx++;

                dataWhereClauses.push(`v.created_at >= $${dataParamIdx}`);
                dataParams.push(dateFrom);
                dataParamIdx++;
            }
            if (dateTo) {
                whereClauses.push(`v.created_at <= $${paramIdx}`);
                params.push(dateTo);
                paramIdx++;

                dataWhereClauses.push(`v.created_at <= $${dataParamIdx}`);
                dataParams.push(dateTo);
                dataParamIdx++;
            }

            if (scopeInfo.apply && !scopeInfo.isGlobal) {
                const beforeLength = whereClauses.length;
                const geoAliases = {
                    zone: 'wr.zone_id',
                    division: 'wr.division_id',
                    town: 'wr.town_id',
                    district: 't.district_id',
                };
                paramIdx = appendGeographyFilters(whereClauses, params, paramIdx, scopeInfo.geography, geoAliases);
                dataParamIdx = appendGeographyFilters(
                    dataWhereClauses,
                    dataParams,
                    dataParamIdx,
                    scopeInfo.geography,
                    geoAliases
                );

                if (whereClauses.length === beforeLength) {
                    return NextResponse.json({ error: 'User geography not configured for scoped access' }, { status: 403 });
                }
            }

            if (whereClauses.length > 0) {
                countQuery += ' WHERE ' + whereClauses.join(' AND ');
            }
            if (dataWhereClauses.length > 0) {
                dataQuery += ' WHERE ' + dataWhereClauses.join(' AND ');
            }
            dataQuery += ' ORDER BY v.created_at DESC';
            if (limit > 0) {
                dataQuery += ` LIMIT $${dataParamIdx} OFFSET $${dataParamIdx + 1}`;
                dataParams.push(limit, offset);
            }
            const countResult = await client.query(countQuery, params);
            const total = parseInt(countResult.rows[0].count, 10);
            const result = await client.query(dataQuery, dataParams);
            return NextResponse.json({ data: result.rows, total }, { status: 200 });
        }
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
        const creatorId = formData.get('creator_id');
        const creatorType = formData.get('creator_type');
        const files = formData.getAll('vid');
        const descriptions = formData.getAll('description');
        const latitudes = formData.getAll('latitude');
        const longitudes = formData.getAll('longitude');

        if (!workRequestId || files.length === 0) {
            return NextResponse.json({ error: 'Work Request ID and at least one video are required' }, { status: 400 });
        }

        // Validate files
        for (const file of files) {
            if (!file || file.size === 0) {
                return NextResponse.json({ error: 'Invalid video file' }, { status: 400 });
            }
            // Validate file size (100MB max for videos)
            if (file.size > 100 * 1024 * 1024) {
                return NextResponse.json({ error: `File ${file.name}: File size exceeds limit. Maximum allowed: 100MB` }, { status: 400 });
            }
        }

        const client = await connectToDatabase();
        
        try {
            // Check if work request exists
            const workRequest = await client.query(`
                SELECT id FROM work_requests WHERE id = $1
            `, [workRequestId]);

            if (!workRequest.rows || workRequest.rows.length === 0) {
                return NextResponse.json({ error: 'Work request not found' }, { status: 404 });
            }

            // Handle standalone mode - ensure files go to correct public directory
            let baseDir = process.cwd();
            if (baseDir.includes('.next/standalone') || baseDir.includes('.next\\standalone')) {
                baseDir = path.join(baseDir, '..', '..');
            }
            const uploadsDir = path.join(baseDir, 'public', 'uploads', 'videos');
            await fs.mkdir(uploadsDir, { recursive: true });
            
            const uploadedVideos = [];
            
            // Process each file
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const description = descriptions[i] || '';
                const latitude = latitudes[i] || '0';
                const longitude = longitudes[i] || '0';
                
                // Generate unique filename
                const fileExtension = file.name.split('.').pop();
                const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                const filePath = path.join(uploadsDir, uniqueName);
                
                // Save file
                const buffer = await file.arrayBuffer();
                await fs.writeFile(filePath, Buffer.from(buffer));
                
                // Verify file exists after writing
                try {
                    await fs.access(filePath);
                } catch (accessError) {
                    console.error(`File verification failed: ${filePath}`, accessError);
                    continue; // Skip this file and continue with others
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
                    `/uploads/videos/${uniqueName}`,
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
            
            return NextResponse.json({
                message: 'Video(s) uploaded successfully',
                videos: uploadedVideos,
                count: uploadedVideos.length
            }, { status: 201 });
            
        } finally {
            client.release && client.release();
        }
    } catch (error) {
        console.error('Error saving video:', error);
        return NextResponse.json({ error: 'Error saving video' }, { status: 500 });
    }
}

export async function PUT(req) {
    try {
        const client = await connectToDatabase();
        
        // Check if it's a multipart form data (file upload)
        const contentType = req.headers.get('content-type');
        
        if (contentType && contentType.includes('multipart/form-data')) {
            // Handle file upload
            const formData = await req.formData();
            const id = formData.get('id');
            const description = formData.get('description');
            const workRequestId = formData.get('workRequestId');
            const latitude = formData.get('latitude');
            const longitude = formData.get('longitude');
            const file = formData.get('file');

            if (!id) {
                return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
            }

            // SECURITY: Require authentication
            const { auth } = await import('@/auth');
            const session = await auth();
            if (!session?.user) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            // Get current video info to delete old file
            const currentVideoQuery = await client.query('SELECT link, creator_id, creator_type FROM videos WHERE id = $1', [id]);
            if (currentVideoQuery.rows.length === 0) {
                return NextResponse.json({ error: 'Video not found' }, { status: 404 });
            }

            const currentVideo = currentVideoQuery.rows[0];

            // SECURITY: IDOR Fix - Check ownership or admin role
            const isAdmin = [1, 2].includes(parseInt(session.user.role));
            const isCreator = currentVideo.creator_id === parseInt(session.user.id) && currentVideo.creator_type === session.user.userType;
            
            if (!isCreator && !isAdmin) {
                return NextResponse.json({ error: 'Forbidden - You can only modify your own videos' }, { status: 403 });
            }
            let newLink = currentVideo.link;

            // Handle file upload if provided
            if (file && file.size > 0) {
                // Validate file size (100MB max for videos)
                if (file.size > 100 * 1024 * 1024) {
                    return NextResponse.json({ error: 'File size exceeds limit. Maximum allowed: 100MB' }, { status: 400 });
                }

                const fs = require('fs');
                const path = require('path');
                
                // Delete old file
                if (currentVideo.link) {
                    let baseDir = process.cwd();
                    if (baseDir.includes('.next/standalone') || baseDir.includes('.next\\standalone')) {
                        baseDir = path.join(baseDir, '..', '..');
                    }
                    const oldFilePath = path.join(baseDir, 'public', currentVideo.link);
                    if (fs.existsSync(oldFilePath)) {
                        fs.unlinkSync(oldFilePath);
                    }
                }

                // Upload new file with sanitized filename
                const bytes = await file.arrayBuffer();
                const buffer = Buffer.from(bytes);
                
                // Sanitize filename
                const ext = path.extname(file.name);
                let sanitizedName = path.basename(file.name, ext);
                sanitizedName = sanitizedName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
                if (!sanitizedName) sanitizedName = 'video';
                if (sanitizedName.length > 50) sanitizedName = sanitizedName.substring(0, 50);
                
                const fileName = `${sanitizedName}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
                
                // Handle standalone mode
                let baseDir = process.cwd();
                if (baseDir.includes('.next/standalone') || baseDir.includes('.next\\standalone')) {
                    baseDir = path.join(baseDir, '..', '..');
                }
                const filePath = path.join(baseDir, 'public/uploads/videos', fileName);
                
                // Ensure directory exists
                const uploadDir = path.join(baseDir, 'public/uploads/videos');
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }
                
                fs.writeFileSync(filePath, buffer);
                newLink = `/uploads/videos/${fileName}`;
            }

            // Update video in database
            const updateQuery = `
                UPDATE videos 
                SET 
                    link = $1,
                    description = $2,
                    work_request_id = $3,
                    geo_tag = CASE 
                        WHEN $4::numeric IS NOT NULL AND $5::numeric IS NOT NULL 
                        THEN ST_SetSRID(ST_MakePoint($5::numeric, $4::numeric), 4326)
                        ELSE geo_tag
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $6
                RETURNING *;
            `;
            
            // Convert empty strings to null for latitude/longitude
            const latValue = latitude && latitude.trim() !== '' ? parseFloat(latitude) : null;
            const lngValue = longitude && longitude.trim() !== '' ? parseFloat(longitude) : null;
            
            const { rows: updatedVideo } = await client.query(updateQuery, [
                newLink,
                description,
                workRequestId,
                latValue,
                lngValue,
                id
            ]);

            return NextResponse.json({ 
                message: 'Video updated successfully', 
                video: updatedVideo[0] 
            }, { status: 200 });

        } else {
            // Handle JSON update (no file upload)
            const body = await req.json();
            const { id, description, workRequestId, latitude, longitude } = body;

            if (!id) {
                return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
            }

            const query = `
                UPDATE videos 
                SET 
                    description = $1,
                    work_request_id = $2,
                    geo_tag = CASE 
                        WHEN $3::numeric IS NOT NULL AND $4::numeric IS NOT NULL 
                        THEN ST_SetSRID(ST_MakePoint($4::numeric, $3::numeric), 4326)
                        ELSE geo_tag
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $5
                RETURNING *;
            `;
            
            // Convert empty strings to null for latitude/longitude
            const latValue = latitude && latitude.toString().trim() !== '' ? parseFloat(latitude) : null;
            const lngValue = longitude && longitude.toString().trim() !== '' ? parseFloat(longitude) : null;
            
            const { rows: updatedVideo } = await client.query(query, [
                description,
                workRequestId,
                latValue,
                lngValue,
                id
            ]);

            if (updatedVideo.length === 0) {
                return NextResponse.json({ error: 'Video not found' }, { status: 404 });
            }

            return NextResponse.json({ 
                message: 'Video updated successfully', 
                video: updatedVideo[0] 
            }, { status: 200 });
        }

    } catch (error) {
        console.error('Error updating video:', error);
        return NextResponse.json({ error: 'Error updating video' }, { status: 500 });
    }
}

export async function DELETE(req) {
    try {
        // SECURITY: Require authentication
        const { auth } = await import('@/auth');
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const client = await connectToDatabase();

        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'Video Id is required' }, { status: 400 });
        }

        // First get the video to check ownership
        const getQuery = 'SELECT creator_id, creator_type FROM videos WHERE id = $1';
        const { rows: [video] } = await client.query(getQuery, [id]);

        if (!video) {
            return NextResponse.json({ error: 'Video not found' }, { status: 404 });
        }

        // SECURITY: IDOR Fix - Check ownership or admin role
        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        const isCreator = video.creator_id === parseInt(session.user.id) && video.creator_type === session.user.userType;
        
        if (!isCreator && !isAdmin) {
            return NextResponse.json({ error: 'Forbidden - You can only delete your own videos' }, { status: 403 });
        }

        const query = `
            DELETE FROM videos 
            WHERE id = $1
            RETURNING *;
        `;

        const { rows: deletedVideo } = await client.query(query, [id]);

        return NextResponse.json({ message: 'Video deleted successfully', user: deletedVideo[0] }, { status: 200 });

    } catch (error) {
        console.error('Error deleting video:', error);
        return NextResponse.json({ error: 'Error deleting video' }, { status: 500 });
    }
}
