import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

async function getEfilingUserId(session, client) {
    if ([1, 2].includes(parseInt(session.user.role))) {
        const adminEfiling = await client.query(
            'SELECT id FROM efiling_users WHERE user_id = $1 AND is_active = true',
            [session.user.id]
        );
        return adminEfiling.rows[0]?.id || null;
    }
    
    const efilingUser = await client.query(
        'SELECT id FROM efiling_users WHERE user_id = $1 AND is_active = true',
        [session.user.id]
    );
    
    return efilingUser.rows[0]?.id || null;
}

// GET - Get single meeting
export async function GET(request, { params }) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        client = await connectToDatabase();
        const efilingUserId = await getEfilingUserId(session, client);

        // Get meeting with details
        const meetingResult = await client.query(
            `SELECT 
                m.*,
                u.designation as organizer_designation,
                u.employee_id as organizer_employee_id,
                dept.name as department_name
             FROM efiling_meetings m
             LEFT JOIN efiling_users u ON m.organizer_id = u.id
             LEFT JOIN efiling_departments dept ON m.department_id = dept.id
             WHERE m.id = $1`,
            [id]
        );

        if (meetingResult.rows.length === 0) {
            return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
        }

        const meeting = meetingResult.rows[0];

        // Check access: organizer or attendee
        if (meeting.organizer_id !== efilingUserId && ![1, 2].includes(parseInt(session.user.role))) {
            const isAttendee = await client.query(
                'SELECT 1 FROM efiling_meeting_attendees WHERE meeting_id = $1 AND attendee_id = $2',
                [id, efilingUserId]
            );
            
            if (isAttendee.rows.length === 0) {
                return NextResponse.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // Get attachments
        const attachments = await client.query(
            'SELECT * FROM efiling_meeting_attachments WHERE meeting_id = $1 ORDER BY created_at',
            [id]
        );
        meeting.attachments = attachments.rows;

        // Get internal attendees
        const internalAttendees = await client.query(
            `SELECT 
                ma.*,
                u.designation,
                u.employee_id,
                dept.name as department_name,
                r.name as role_name
             FROM efiling_meeting_attendees ma
             LEFT JOIN efiling_users u ON ma.attendee_id = u.id
             LEFT JOIN efiling_departments dept ON u.department_id = dept.id
             LEFT JOIN efiling_roles r ON u.efiling_role_id = r.id
             WHERE ma.meeting_id = $1
             ORDER BY ma.created_at`,
            [id]
        );
        meeting.internal_attendees = internalAttendees.rows;

        // Get external attendees
        const externalAttendees = await client.query(
            'SELECT * FROM efiling_meeting_external_attendees WHERE meeting_id = $1 ORDER BY created_at',
            [id]
        );
        meeting.external_attendees = externalAttendees.rows;

        // Get user's response if attendee
        if (efilingUserId) {
            const userResponse = await client.query(
                'SELECT * FROM efiling_meeting_attendees WHERE meeting_id = $1 AND attendee_id = $2',
                [id, efilingUserId]
            );
            meeting.user_response = userResponse.rows[0] || null;
            meeting.is_attending = userResponse.rows.length > 0;
        }

        return NextResponse.json({ meeting });
    } catch (error) {
        console.error('Error fetching meeting:', error);
        return NextResponse.json(
            { error: 'Failed to fetch meeting', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

// PUT - Update meeting
export async function PUT(request, { params }) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        client = await connectToDatabase();
        const efilingUserId = await getEfilingUserId(session, client);

        // Check if meeting exists and user is organizer
        const meetingCheck = await client.query(
            'SELECT organizer_id, status FROM efiling_meetings WHERE id = $1',
            [id]
        );

        if (meetingCheck.rows.length === 0) {
            return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
        }

        const meeting = meetingCheck.rows[0];
        
        // Only organizer or admin can update
        if (meeting.organizer_id !== efilingUserId && ![1, 2].includes(parseInt(session.user.role))) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        // Can't update if completed or cancelled
        if (['COMPLETED', 'CANCELLED'].includes(meeting.status)) {
            return NextResponse.json(
                { error: 'Cannot update meeting that is completed or cancelled' },
                { status: 400 }
            );
        }

        const {
            title,
            description,
            agenda,
            meeting_type,
            meeting_date,
            start_time,
            end_time,
            venue_address,
            meeting_link,
            department_id,
            status
        } = body;

        const updateFields = [];
        const updateValues = [];
        let paramCount = 1;

        if (title !== undefined) {
            updateFields.push(`title = $${paramCount++}`);
            updateValues.push(title);
        }
        if (description !== undefined) {
            updateFields.push(`description = $${paramCount++}`);
            updateValues.push(description);
        }
        if (agenda !== undefined) {
            updateFields.push(`agenda = $${paramCount++}`);
            updateValues.push(agenda);
        }
        if (meeting_type !== undefined) {
            updateFields.push(`meeting_type = $${paramCount++}`);
            updateValues.push(meeting_type);
        }
        if (meeting_date !== undefined) {
            updateFields.push(`meeting_date = $${paramCount++}`);
            updateValues.push(meeting_date);
        }
        if (start_time !== undefined) {
            updateFields.push(`start_time = $${paramCount++}`);
            updateValues.push(start_time);
        }
        if (end_time !== undefined) {
            updateFields.push(`end_time = $${paramCount++}`);
            updateValues.push(end_time);
        }
        if (venue_address !== undefined) {
            updateFields.push(`venue_address = $${paramCount++}`);
            updateValues.push(venue_address);
        }
        if (meeting_link !== undefined) {
            updateFields.push(`meeting_link = $${paramCount++}`);
            updateValues.push(meeting_link);
        }
        if (department_id !== undefined) {
            updateFields.push(`department_id = $${paramCount++}`);
            updateValues.push(department_id);
        }
        if (status !== undefined) {
            updateFields.push(`status = $${paramCount++}`);
            updateValues.push(status);
        }

        // Recalculate duration if times changed
        if (start_time !== undefined || end_time !== undefined || meeting_date !== undefined) {
            const finalDate = meeting_date || meetingCheck.rows[0].meeting_date;
            const finalStart = start_time || meetingCheck.rows[0].start_time;
            const finalEnd = end_time || meetingCheck.rows[0].end_time;
            
            const start = new Date(`${finalDate}T${finalStart}`);
            const end = new Date(`${finalDate}T${finalEnd}`);
            const durationMinutes = Math.round((end - start) / (1000 * 60));
            
            updateFields.push(`duration_minutes = $${paramCount++}`);
            updateValues.push(durationMinutes);
        }

        if (updateFields.length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
        }

        updateValues.push(id);
        const updateQuery = `
            UPDATE efiling_meetings 
            SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await client.query(updateQuery, updateValues);
        
        return NextResponse.json({
            success: true,
            meeting: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating meeting:', error);
        return NextResponse.json(
            { error: 'Failed to update meeting', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

// DELETE - Delete meeting
export async function DELETE(request, { params }) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        client = await connectToDatabase();
        const efilingUserId = await getEfilingUserId(session, client);

        // Check if meeting exists and user is organizer
        const meetingCheck = await client.query(
            'SELECT organizer_id, status FROM efiling_meetings WHERE id = $1',
            [id]
        );

        if (meetingCheck.rows.length === 0) {
            return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
        }

        const meeting = meetingCheck.rows[0];
        
        // Only organizer or admin can delete
        if (meeting.organizer_id !== efilingUserId && ![1, 2].includes(parseInt(session.user.role))) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        // Can't delete if already started or completed
        if (['ONGOING', 'COMPLETED'].includes(meeting.status)) {
            return NextResponse.json(
                { error: 'Cannot delete meeting that has started or completed' },
                { status: 400 }
            );
        }

        // Delete meeting (cascade will delete attendees, attachments, reminders)
        await client.query('DELETE FROM efiling_meetings WHERE id = $1', [id]);
        
        return NextResponse.json({ success: true, message: 'Meeting deleted successfully' });
    } catch (error) {
        console.error('Error deleting meeting:', error);
        return NextResponse.json(
            { error: 'Failed to delete meeting', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

