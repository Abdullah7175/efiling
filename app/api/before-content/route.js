import { NextResponse } from 'next/server';
import { connectToDatabase, query } from '@/lib/db';
import { auth } from '@/auth';
import { logUserAction } from '@/lib/userActionLogger';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { resolveEfilingScope, appendGeographyFilters } from '@/lib/efilingGeographyFilters';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  let client;
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);
    const workRequestId = searchParams.get('workRequestId');
    const creatorId = searchParams.get('creator_id');
    const creatorType = searchParams.get('creator_type');

    client = await connectToDatabase();

    const scopeInfo = await resolveEfilingScope(request, client, { scopeKeys: ['scope', 'efiling', 'efilingScoped'] });
    if (scopeInfo.apply && scopeInfo.error) {
      return NextResponse.json({ error: scopeInfo.error.message }, { status: scopeInfo.error.status });
    }

    const whereClauses = [];
    const params = [];
    let paramIdx = 1;

    if (workRequestId) {
      whereClauses.push(`bc.work_request_id = $${paramIdx}`);
      params.push(workRequestId);
      paramIdx += 1;
    }

    if (creatorId && creatorType) {
      whereClauses.push(`bc.creator_id = $${paramIdx} AND bc.creator_type = $${paramIdx + 1}`);
      params.push(creatorId, creatorType);
      paramIdx += 2;
    }

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

    let queryText = `
      SELECT 
        bc.*,
        bc.link,
        wr.address,
        wr.description as work_description,
        wr.zone_id,
        wr.division_id,
        wr.town_id,
        t.district_id as town_district_id,
        ct.type_name as complaint_type,
        t.town,
        st.subtown
      FROM before_content bc
      LEFT JOIN work_requests wr ON bc.work_request_id = wr.id
      LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
      LEFT JOIN town t ON wr.town_id = t.id
      LEFT JOIN subtown st ON wr.subtown_id = st.id
      WHERE 1=1
    `;

    if (whereClauses.length > 0) {
      queryText += ' AND ' + whereClauses.join(' AND ');
    }

    queryText += ' ORDER BY bc.created_at DESC';

    const result = await client.query(queryText, params);

    // Log view action if user is authenticated
    if (session?.user) {
      await logUserAction({
        user_id: session.user.id,
        user_type: session.user.userType,
        user_role: session.user.role,
        user_name: session.user.name || 'Unknown',
        user_email: session.user.email || 'unknown@example.com',
        action_type: 'VIEW',
        entity_type: 'before_content',
        entity_id: workRequestId,
        entity_name: workRequestId ? `Before Content for Request #${workRequestId}` : 'All Before Content',
        details: {
          work_request_id: workRequestId,
          creator_filter: creatorId ? { creator_id: creatorId, creator_type: creatorType } : null,
          result_count: result.rows.length
        },
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent')
      });
    }

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching before content:', error);
    return NextResponse.json({ error: 'Failed to fetch before content' }, { status: 500 });
  } finally {
    if (client && typeof client.release === 'function') {
      client.release();
    }
  }
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if request is FormData (file upload) or JSON
    const contentType = request.headers.get('content-type');
    let workRequestId, description, contentTypeValue, files, descriptions, latitudes, longitudes;

    if (contentType && contentType.includes('multipart/form-data')) {
      // Handle FormData upload
      const formData = await request.formData();
      workRequestId = formData.get('work_request_id');
      description = formData.get('description');
      contentTypeValue = formData.get('content_type');
      
      // Get all files
      files = formData.getAll('files');
      descriptions = formData.getAll('descriptions');
      latitudes = formData.getAll('latitudes');
      longitudes = formData.getAll('longitudes');
    } else {
      // Handle JSON upload (legacy)
      const body = await request.json();
      workRequestId = body.workRequestId;
      description = body.description;
      contentTypeValue = body.contentType;
      const link = body.link;
      const latitude = body.latitude;
      const longitude = body.longitude;
      const additionalContent = body.additionalContent;

      if (!workRequestId || !link || !contentTypeValue) {
        return NextResponse.json({ error: 'Work request ID, content link, and content type are required' }, { status: 400 });
      }

      // Validate content type
      if (!['image', 'video'].includes(contentTypeValue)) {
        return NextResponse.json({ error: 'Content type must be either "image" or "video"' }, { status: 400 });
      }

      // Process legacy JSON format
      const insertQuery = `
        INSERT INTO before_content (work_request_id, description, link, content_type, creator_id, creator_type, creator_name, geo_tag)
        VALUES ($1, $2, $3, $4, $5, $6, $7, ST_GeomFromText($8, 4326))
        RETURNING *
      `;

      const geoTag = `POINT(${longitude || 0} ${latitude || 0})`;
      const creatorName = session.user.name || 'Unknown';

      const result = await query(insertQuery, [
        workRequestId,
        description || '',
        link,
        contentTypeValue,
        session.user.id,
        session.user.userType || 'user',
        creatorName,
        geoTag
      ]);

      const beforeContentId = result[0]?.id;

      // Log before content upload action
      await logUserAction({
        user_id: session.user.id,
        user_type: session.user.userType,
        user_role: session.user.role,
        user_name: session.user.name || 'Unknown',
        user_email: session.user.email || 'unknown@example.com',
        action_type: 'UPLOAD',
        entity_type: 'before_content',
        entity_id: beforeContentId,
        entity_name: `Before ${contentTypeValue.charAt(0).toUpperCase() + contentTypeValue.slice(1)} for Request #${workRequestId}`,
        details: {
          work_request_id: workRequestId,
          content_link: link,
          content_type: contentTypeValue,
          description: description || '',
          has_geolocation: !!(latitude && longitude),
          latitude: latitude,
          longitude: longitude
        },
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent')
      });

      // Insert additional content if provided
      if (additionalContent && additionalContent.length > 0) {
        for (const additionalItem of additionalContent) {
          const additionalGeoTag = additionalItem.latitude && additionalItem.longitude 
            ? `POINT(${additionalItem.longitude} ${additionalItem.latitude})` 
            : null;

          const additionalResult = await query(insertQuery, [
            workRequestId,
            additionalItem.description || '',
            additionalItem.link,
            additionalItem.contentType || contentTypeValue,
            session.user.id,
            session.user.userType || 'user',
            creatorName,
            additionalGeoTag
          ]);

          // Log additional before content upload action
          await logUserAction({
            user_id: session.user.id,
            user_type: session.user.userType,
            user_role: session.user.role,
            user_name: session.user.name || 'Unknown',
            user_email: session.user.email || 'unknown@example.com',
            action_type: 'UPLOAD',
            entity_type: 'before_content',
            entity_id: additionalResult[0]?.id,
            entity_name: `Additional Before ${(additionalItem.contentType || contentTypeValue).charAt(0).toUpperCase() + (additionalItem.contentType || contentTypeValue).slice(1)} for Request #${workRequestId}`,
            details: {
              work_request_id: workRequestId,
              content_link: additionalItem.link,
              content_type: additionalItem.contentType || contentTypeValue,
              description: additionalItem.description || '',
              has_geolocation: !!(additionalItem.latitude && additionalItem.longitude),
              latitude: additionalItem.latitude,
              longitude: additionalItem.longitude,
              is_additional: true
            },
            ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
            user_agent: request.headers.get('user-agent')
          });
        }
      }

      return NextResponse.json({ 
        success: true, 
        data: result.rows[0],
        message: 'Before content uploaded successfully' 
      });
    }

    // Handle FormData upload
    if (!workRequestId || !contentTypeValue) {
      return NextResponse.json({ error: 'Work request ID and content type are required' }, { status: 400 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'At least one file is required' }, { status: 400 });
    }

    // Validate content type
    if (!['image', 'video'].includes(contentTypeValue)) {
      return NextResponse.json({ error: 'Content type must be either "image" or "video"' }, { status: 400 });
    }

    // Process file uploads
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'before-content', contentTypeValue);
    await mkdir(uploadDir, { recursive: true });

    const uploadedFiles = [];
    const creatorName = session.user.name || 'Unknown';

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file || file.size === 0) continue;

      // Validate file size based on content type
      const maxSize = contentTypeValue === 'video' ? 100 * 1024 * 1024 : 5 * 1024 * 1024; // 100MB for videos, 5MB for images
      if (file.size > maxSize) {
        const maxSizeMB = contentTypeValue === 'video' ? '100MB' : '5MB';
        return NextResponse.json({ error: `File ${file.name}: File size exceeds limit. Maximum allowed: ${maxSizeMB}` }, { status: 400 });
      }

      // Generate unique filename
      const fileExtension = file.name.split('.').pop();
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
      const filePath = join(uploadDir, uniqueName);
      
      // Save file
      const buffer = await file.arrayBuffer();
      await writeFile(filePath, Buffer.from(buffer));
      
      // Create relative URL
      const relativeUrl = `/uploads/before-content/${contentTypeValue}/${uniqueName}`;
      uploadedFiles.push({
        link: relativeUrl,
        description: descriptions[i] || '',
        latitude: latitudes[i] || '',
        longitude: longitudes[i] || '',
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json({ error: 'No valid files uploaded' }, { status: 400 });
    }

    // Insert each uploaded file
    const insertQuery = `
      INSERT INTO before_content (work_request_id, description, link, content_type, creator_id, creator_type, creator_name, geo_tag, file_name, file_size, file_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, ST_GeomFromText($8, 4326), $9, $10, $11)
      RETURNING *
    `;

    const results = [];
    for (const fileData of uploadedFiles) {
      const geoTag = fileData.latitude && fileData.longitude 
        ? `POINT(${fileData.longitude} ${fileData.latitude})` 
        : `POINT(0 0)`;

      const result = await query(insertQuery, [
        workRequestId,
        fileData.description,
        fileData.link,
        contentTypeValue,
        session.user.id,
        session.user.userType || 'user',
        creatorName,
        geoTag,
        fileData.fileName || null,
        fileData.fileSize || null,
        fileData.fileType || null
      ]);

      results.push(result.rows[0]);

      // Log before content upload action
      await logUserAction({
        user_id: session.user.id,
        user_type: session.user.userType,
        user_role: session.user.role,
        user_name: session.user.name || 'Unknown',
        user_email: session.user.email || 'unknown@example.com',
        action_type: 'UPLOAD',
        entity_type: 'before_content',
        entity_id: result.rows[0].id,
        entity_name: `Before ${contentTypeValue.charAt(0).toUpperCase() + contentTypeValue.slice(1)} for Request #${workRequestId}`,
        details: {
          work_request_id: workRequestId,
          content_link: fileData.link,
          content_type: contentTypeValue,
          description: fileData.description,
          has_geolocation: !!(fileData.latitude && fileData.longitude),
          latitude: fileData.latitude,
          longitude: fileData.longitude
        },
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent')
      });
    }

    return NextResponse.json({ 
      success: true, 
      data: results,
      message: `${results.length} file(s) uploaded successfully` 
    });
  } catch (error) {
    console.error('Error uploading before content:', error);
    return NextResponse.json({ error: 'Failed to upload before content' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Content ID is required' }, { status: 400 });
    }

    // Check if user has permission to delete (creator or admin)
    const checkQuery = `
      SELECT creator_id, creator_type FROM before_content WHERE id = $1
    `;
    const checkResult = await query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    const content = checkResult.rows[0];
    const isCreator = content.creator_id === session.user.id && content.creator_type === session.user.userType;
    const isAdmin = session.user.userType === 'user' && [1, 2].includes(session.user.role);
    const isSMAgent = session.user.userType === 'socialmedia';

    if (!isCreator && !isAdmin && !isSMAgent) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get content details before deletion for logging
    const contentDetailsQuery = `
      SELECT bc.*, wr.id as work_request_id, wr.description as work_description
      FROM before_content bc
      LEFT JOIN work_requests wr ON bc.work_request_id = wr.id
      WHERE bc.id = $1
    `;
    const contentDetails = await query(contentDetailsQuery, [id]);

    const deleteQuery = 'DELETE FROM before_content WHERE id = $1';
    await query(deleteQuery, [id]);

    // Log before content deletion action
    if (contentDetails.length > 0) {
      const content = contentDetails[0];
      await logUserAction({
        user_id: session.user.id,
        user_type: session.user.userType,
        user_role: session.user.role,
        user_name: session.user.name || 'Unknown',
        user_email: session.user.email || 'unknown@example.com',
        action_type: 'DELETE',
        entity_type: 'before_content',
        entity_id: parseInt(id),
        entity_name: `Before ${content.content_type.charAt(0).toUpperCase() + content.content_type.slice(1)} for Request #${content.work_request_id}`,
        details: {
          work_request_id: content.work_request_id,
          work_description: content.work_description,
          content_link: content.link,
          content_type: content.content_type,
          description: content.description,
          original_creator_id: content.creator_id,
          original_creator_type: content.creator_type,
          original_creator_name: content.creator_name,
          has_geolocation: !!content.geo_tag,
          deletion_reason: 'User initiated deletion'
        },
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent')
      });
    }

    return NextResponse.json({ success: true, message: 'Before content deleted successfully' });
  } catch (error) {
    console.error('Error deleting before content:', error);
    return NextResponse.json({ error: 'Failed to delete before content' }, { status: 500 });
  }
}
