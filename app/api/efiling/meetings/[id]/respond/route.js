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

// POST - Respond to meeting invitation (Accept/Decline/Tentative)
export async function POST(request, { params }) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const { response_status, notes } = body;

        if (!response_status || !['ACCEPTED', 'DECLINED', 'TENTATIVE'].includes(response_status)) {
            return NextResponse.json(
                { error: 'Valid response_status (ACCEPTED, DECLINED, TENTATIVE) is required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();
        const efilingUserId = await getEfilingUserId(session, client);

        if (!efilingUserId) {
            return NextResponse.json({ error: 'User not found in e-filing system' }, { status: 403 });
        }

        // Check if meeting exists
        const meetingCheck = await client.query(
            'SELECT id, status FROM efiling_meetings WHERE id = $1',
            [id]
        );

        if (meetingCheck.rows.length === 0) {
            return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
        }

        // Check if user is an attendee
        const attendeeCheck = await client.query(
            'SELECT id FROM efiling_meeting_attendees WHERE meeting_id = $1 AND attendee_id = $2',
            [id, efilingUserId]
        );

        if (attendeeCheck.rows.length === 0) {
            return NextResponse.json(
                { error: 'You are not an attendee of this meeting' },
                { status: 403 }
            );
        }

        // Update response
        await client.query(
            `UPDATE efiling_meeting_attendees 
             SET response_status = $1, responded_at = CURRENT_TIMESTAMP, notes = $2, updated_at = CURRENT_TIMESTAMP
             WHERE meeting_id = $3 AND attendee_id = $4
             RETURNING *`,
            [response_status, notes || null, id, efilingUserId]
        );

        // Update meeting accepted count
        const acceptedCount = await client.query(
            `SELECT COUNT(*) FROM efiling_meeting_attendees 
             WHERE meeting_id = $1 AND response_status = 'ACCEPTED'`,
            [id]
        );
        await client.query(
            'UPDATE efiling_meetings SET accepted_count = $1 WHERE id = $2',
            [parseInt(acceptedCount.rows[0].count), id]
        );

        // Mark notification as read
        await client.query(
            `UPDATE efiling_notifications 
             SET is_read = true, read_at = NOW()
             WHERE user_id = $1 AND type = 'MEETING_INVITATION' 
             AND metadata->>'meeting_id' = $2`,
            [efilingUserId, id.toString()]
        );

        return NextResponse.json({
            success: true,
            message: `Meeting invitation ${response_status.toLowerCase()} successfully`
        });
    } catch (error) {
        console.error('Error responding to meeting:', error);
        return NextResponse.json(
            { error: 'Failed to respond to meeting', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

