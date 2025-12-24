import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { auth } from '@/auth';
import { logUserAction } from '@/lib/userActionLogger';
import { promises as fs } from 'fs';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);
    const workRequestId = searchParams.get('workRequestId');
    const creatorId = searchParams.get('creator_id');
    const creatorType = searchParams.get('creator_type');

    let queryText = `
      SELECT 
        bi.*,
        wr.address,
        wr.description as work_description,
        ct.type_name as complaint_type,
        t.town,
        st.subtown
      FROM before_content bi
      LEFT JOIN work_requests wr ON bi.work_request_id = wr.id
      LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
      LEFT JOIN town t ON wr.town_id = t.id
      LEFT JOIN subtown st ON wr.subtown_id = st.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (workRequestId) {
      queryText += ` AND bi.work_request_id = $${paramCount}`;
      params.push(workRequestId);
      paramCount++;
    }

    if (creatorId && creatorType) {
      queryText += ` AND bi.creator_id = $${paramCount} AND bi.creator_type = $${paramCount + 1}`;
      params.push(creatorId, creatorType);
      paramCount += 2;
    }

    queryText += ` ORDER BY bi.created_at DESC`;

    const result = await query(queryText, params);

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
        entity_name: workRequestId ? `Before Images for Request #${workRequestId}` : 'All Before Images',
        details: {
          work_request_id: workRequestId,
          creator_filter: creatorId ? { creator_id: creatorId, creator_type: creatorType } : null,
          result_count: result.length
        },
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent')
      });
    }

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching before images:', error);
    return NextResponse.json({ error: 'Failed to fetch before images' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type');
    
    // Handle FormData upload (new direct upload method)
    if (contentType && contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const workRequestId = formData.get('workRequestId');
      const description = formData.get('description') || '';
      const img = formData.get('img');
      const latitude = formData.get('latitude') || '0';
      const longitude = formData.get('longitude') || '0';
      const creatorId = formData.get('creator_id');
      const creatorType = formData.get('creator_type');

      if (!workRequestId || !img) {
        return NextResponse.json({ error: 'Work request ID and image file are required' }, { status: 400 });
      }

      // Validate file
      if (!img || img.size === 0) {
        return NextResponse.json({ error: 'Invalid image file' }, { status: 400 });
      }

      // Validate file size (5MB max for images)
      if (img.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'File size exceeds limit. Maximum allowed: 5MB' }, { status: 400 });
      }

      // Create upload directory (handle standalone mode)
      let baseDir = process.cwd();
      if (baseDir.includes('.next/standalone') || baseDir.includes('.next\\standalone')) {
        baseDir = join(baseDir, '..', '..');
      }
      const uploadDir = join(baseDir, 'public', 'uploads', 'before-content', 'image');
      await mkdir(uploadDir, { recursive: true });

      // Generate unique filename
      const fileExtension = img.name.split('.').pop();
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
      const filePath = join(uploadDir, uniqueName);
      
      // Save file
      const buffer = await img.arrayBuffer();
      await writeFile(filePath, Buffer.from(buffer));
      
      // Create relative URL
      const link = `/uploads/before-content/image/${uniqueName}`;
      const geoTag = `POINT(${longitude} ${latitude})`;
      const creatorName = session.user.name || 'Unknown';

      // Insert into database
      const insertQuery = `
        INSERT INTO before_content (work_request_id, description, link, creator_id, creator_type, creator_name, geo_tag, content_type)
        VALUES ($1, $2, $3, $4, $5, $6, ST_GeomFromText($7, 4326), $8)
        RETURNING *
      `;

      const result = await query(insertQuery, [
        workRequestId,
        description,
        link,
        creatorId || session.user.id,
        creatorType || session.user.userType || 'user',
        creatorName,
        geoTag,
        'image'
      ]);

      // Log upload action
      await logUserAction({
        user_id: session.user.id,
        user_type: session.user.userType,
        user_role: session.user.role,
        user_name: session.user.name || 'Unknown',
        user_email: session.user.email || 'unknown@example.com',
        action_type: 'UPLOAD',
        entity_type: 'before_content',
        entity_id: result[0]?.id,
        entity_name: `Before Image for Request #${workRequestId}`,
        details: {
          work_request_id: workRequestId,
          image_link: link,
          description: description,
          has_geolocation: !!(latitude && longitude),
          latitude: latitude,
          longitude: longitude,
          file_name: img.name,
          file_size: img.size,
          file_type: img.type
        },
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent')
      });

      return NextResponse.json({ 
        success: true, 
        data: result[0],
        message: 'Before image uploaded successfully' 
      });
    }

    // Handle JSON upload (existing method for backward compatibility)
    const body = await request.json();
    const { workRequestId, description, link, latitude, longitude, additionalImages } = body;

    if (!workRequestId || !link) {
      return NextResponse.json({ error: 'Work request ID and image link are required' }, { status: 400 });
    }

    // Insert main before image
    const insertQuery = `
      INSERT INTO before_content (work_request_id, description, link, creator_id, creator_type, creator_name, geo_tag, content_type)
      VALUES ($1, $2, $3, $4, $5, $6, ST_GeomFromText($7, 4326), $8)
      RETURNING *
    `;

    const geoTag = `POINT(${longitude || 0} ${latitude || 0})`;
    const creatorName = session.user.name || 'Unknown';

    const result = await query(insertQuery, [
      workRequestId,
      description || '',
      link,
      session.user.id,
      session.user.userType || 'user',
      creatorName,
      geoTag,
      'image' // Default content_type for this legacy API
    ]);

    const beforeImageId = result[0]?.id;

    // Log before image upload action
    await logUserAction({
      user_id: session.user.id,
      user_type: session.user.userType,
      user_role: session.user.role,
      user_name: session.user.name || 'Unknown',
      user_email: session.user.email || 'unknown@example.com',
      action_type: 'UPLOAD',
      entity_type: 'before_content',
      entity_id: beforeImageId,
      entity_name: `Before Image for Request #${workRequestId}`,
      details: {
        work_request_id: workRequestId,
        image_link: link,
        description: description || '',
        has_geolocation: !!(latitude && longitude),
        latitude: latitude,
        longitude: longitude
      },
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      user_agent: request.headers.get('user-agent')
    });

    // Insert additional images if provided
    if (additionalImages && additionalImages.length > 0) {
      for (const additionalImage of additionalImages) {
        const additionalGeoTag = additionalImage.latitude && additionalImage.longitude 
          ? `POINT(${additionalImage.longitude} ${additionalImage.latitude})` 
          : null;

        const additionalResult = await query(insertQuery, [
          workRequestId,
          additionalImage.description || '',
          additionalImage.link,
          session.user.id,
          session.user.userType || 'user',
          creatorName,
          additionalGeoTag,
          'image'
        ]);

        // Log additional before image upload action
        await logUserAction({
          user_id: session.user.id,
          user_type: session.user.userType,
          user_role: session.user.role,
          user_name: session.user.name || 'Unknown',
          user_email: session.user.email || 'unknown@example.com',
          action_type: 'UPLOAD',
          entity_type: 'before_content',
          entity_id: additionalResult[0]?.id,
          entity_name: `Additional Before Image for Request #${workRequestId}`,
          details: {
            work_request_id: workRequestId,
            image_link: additionalImage.link,
            description: additionalImage.description || '',
            has_geolocation: !!(additionalImage.latitude && additionalImage.longitude),
            latitude: additionalImage.latitude,
            longitude: additionalImage.longitude,
            is_additional: true
          },
          ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
          user_agent: request.headers.get('user-agent')
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      data: result[0],
      message: 'Before images uploaded successfully' 
    });
  } catch (error) {
    console.error('Error uploading before images:', error);
    return NextResponse.json({ error: 'Failed to upload before images' }, { status: 500 });
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
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
    }

    // Check if user has permission to delete (creator or admin)
    const checkQuery = `
      SELECT creator_id, creator_type FROM before_content WHERE id = $1
    `;
    const checkResult = await query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const image = checkResult.rows[0];
    const isCreator = image.creator_id === session.user.id && image.creator_type === session.user.userType;
    const isAdmin = session.user.userType === 'user' && [1, 2].includes(session.user.role);
    const isSMAgent = session.user.userType === 'socialmedia';

    if (!isCreator && !isAdmin && !isSMAgent) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get image details before deletion for logging
    const imageDetailsQuery = `
      SELECT bi.*, wr.id as work_request_id, wr.description as work_description
      FROM before_content bi
      LEFT JOIN work_requests wr ON bi.work_request_id = wr.id
      WHERE bi.id = $1
    `;
    const imageDetails = await query(imageDetailsQuery, [id]);

    const deleteQuery = 'DELETE FROM before_content WHERE id = $1';
    await query(deleteQuery, [id]);

    // Log before image deletion action
    if (imageDetails.length > 0) {
      const image = imageDetails[0];
      await logUserAction({
        user_id: session.user.id,
        user_type: session.user.userType,
        user_role: session.user.role,
        user_name: session.user.name || 'Unknown',
        user_email: session.user.email || 'unknown@example.com',
        action_type: 'DELETE',
        entity_type: 'before_content',
        entity_id: parseInt(id),
        entity_name: `Before Image for Request #${image.work_request_id}`,
        details: {
          work_request_id: image.work_request_id,
          work_description: image.work_description,
          image_link: image.link,
          description: image.description,
          original_creator_id: image.creator_id,
          original_creator_type: image.creator_type,
          original_creator_name: image.creator_name,
          has_geolocation: !!image.geo_tag,
          deletion_reason: 'User initiated deletion'
        },
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent')
      });
    }

    return NextResponse.json({ success: true, message: 'Before image deleted successfully' });
  } catch (error) {
    console.error('Error deleting before image:', error);
    return NextResponse.json({ error: 'Failed to delete before image' }, { status: 500 });
  }
}
