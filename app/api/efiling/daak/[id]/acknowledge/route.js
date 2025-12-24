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

// POST - Acknowledge daak
export async function POST(request, { params }) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const { acknowledgment_text } = body || {};

        client = await connectToDatabase();
        const efilingUserId = await getEfilingUserId(session, client);

        if (!efilingUserId) {
            return NextResponse.json({ error: 'User not found in e-filing system' }, { status: 403 });
        }

        // Check if daak exists
        const daakCheck = await client.query(
            'SELECT id, status FROM efiling_daak WHERE id = $1',
            [id]
        );

        if (daakCheck.rows.length === 0) {
            return NextResponse.json({ error: 'Daak not found' }, { status: 404 });
        }

        // Check if user is a recipient
        const recipientCheck = await client.query(
            'SELECT id FROM efiling_daak_recipients WHERE daak_id = $1 AND efiling_user_id = $2',
            [id, efilingUserId]
        );

        if (recipientCheck.rows.length === 0) {
            return NextResponse.json(
                { error: 'You are not a recipient of this daak' },
                { status: 403 }
            );
        }

        // Check if already acknowledged
        const existingAck = await client.query(
            'SELECT id FROM efiling_daak_acknowledgments WHERE daak_id = $1 AND recipient_id = $2',
            [id, efilingUserId]
        );

        if (existingAck.rows.length > 0) {
            return NextResponse.json(
                { error: 'Daak has already been acknowledged' },
                { status: 400 }
            );
        }

        // Get IP address and user agent from request headers
        const ipAddress = request.headers.get('x-forwarded-for') || 
                         request.headers.get('x-real-ip') || 
                         'unknown';
        const userAgent = request.headers.get('user-agent') || 'unknown';

        // Create acknowledgment
        const ackResult = await client.query(
            `INSERT INTO efiling_daak_acknowledgments 
             (daak_id, recipient_id, acknowledgment_text, ip_address, user_agent, acknowledged_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
             RETURNING *`,
            [id, efilingUserId, acknowledgment_text || null, ipAddress, userAgent]
        );

        // Update recipient status
        await client.query(
            `UPDATE efiling_daak_recipients 
             SET status = 'ACKNOWLEDGED', acknowledged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE daak_id = $1 AND efiling_user_id = $2`,
            [id, efilingUserId]
        );

        // Update daak acknowledged count
        const countResult = await client.query(
            'SELECT COUNT(*) FROM efiling_daak_acknowledgments WHERE daak_id = $1',
            [id]
        );
        const acknowledgedCount = parseInt(countResult.rows[0].count);

        await client.query(
            'UPDATE efiling_daak SET acknowledged_count = $1 WHERE id = $2',
            [acknowledgedCount, id]
        );

        // Mark notification as read if exists
        await client.query(
            `UPDATE efiling_notifications 
             SET is_read = true, read_at = NOW()
             WHERE user_id = $1 AND type = 'DAAK_RECEIVED' 
             AND metadata->>'daak_id' = $2`,
            [efilingUserId, id.toString()]
        );

        return NextResponse.json({
            success: true,
            acknowledgment: ackResult.rows[0],
            message: 'Daak acknowledged successfully'
        });
    } catch (error) {
        console.error('Error acknowledging daak:', error);
        return NextResponse.json(
            { error: 'Failed to acknowledge daak', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

