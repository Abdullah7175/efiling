import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { auth } from '@/auth';
import { logUserAction } from '@/lib/userActionLogger';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const queryText = `
      SELECT 
        bc.*,
        bc.link,
        wr.address,
        wr.description as work_description,
        ct.type_name as complaint_type,
        t.town,
        st.subtown
      FROM before_content bc
      LEFT JOIN work_requests wr ON bc.work_request_id = wr.id
      LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
      LEFT JOIN town t ON wr.town_id = t.id
      LEFT JOIN subtown st ON wr.subtown_id = st.id
      WHERE bc.id = $1
    `;

    const result = await query(queryText, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    // SECURITY: IDOR Fix - Check ownership or admin role
    const content = result.rows[0];
    const isCreator = content.creator_id === session.user.id && content.creator_type === session.user.userType;
    const isAdmin = session.user.userType === 'user' && [1, 2].includes(session.user.role);

    if (!isCreator && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden - You do not have access to this content' }, { status: 403 });
    }

    return NextResponse.json(content);
  } catch (error) {
    console.error('Error fetching before content:', error);
    return NextResponse.json({ error: 'Failed to fetch before content' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { description, workRequestId } = body;

    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    // Check if user has permission to edit (creator or admin)
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

    if (!isCreator && !isAdmin) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Update the content
    const updateQuery = `
      UPDATE before_content 
      SET description = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await query(updateQuery, [description, id]);

    // Log the edit action
    await logUserAction({
      user_id: session.user.id,
      user_type: session.user.userType,
      user_role: session.user.role,
      user_name: session.user.name || 'Unknown',
      user_email: session.user.email || 'unknown@example.com',
      action_type: 'UPDATE',
      entity_type: 'before_content',
      entity_id: parseInt(id),
      entity_name: `Before ${result.rows[0].content_type.charAt(0).toUpperCase() + result.rows[0].content_type.slice(1)} for Request #${result.rows[0].work_request_id}`,
      details: {
        work_request_id: result.rows[0].work_request_id,
        content_link: result.rows[0].link,
        content_type: result.rows[0].content_type,
        old_description: content.description,
        new_description: description,
        original_creator_id: content.creator_id,
        original_creator_type: content.creator_type,
        edit_reason: 'User initiated edit'
      },
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      user_agent: request.headers.get('user-agent')
    });

    return NextResponse.json({ 
      success: true, 
      data: result.rows[0],
      message: 'Before content updated successfully' 
    });
  } catch (error) {
    console.error('Error updating before content:', error);
    return NextResponse.json({ error: 'Failed to update before content' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

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

    if (!isCreator && !isAdmin) {
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
