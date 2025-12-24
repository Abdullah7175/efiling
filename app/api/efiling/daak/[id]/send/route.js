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

// POST - Send daak to recipients
export async function POST(request, { params }) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        client = await connectToDatabase();
        const efilingUserId = await getEfilingUserId(session, client);

        // Check if daak exists and user is creator
        const daakCheck = await client.query(
            'SELECT created_by, status FROM efiling_daak WHERE id = $1',
            [id]
        );

        if (daakCheck.rows.length === 0) {
            return NextResponse.json({ error: 'Daak not found' }, { status: 404 });
        }

        const daak = daakCheck.rows[0];
        
        // Only creator or admin can send
        if (daak.created_by !== efilingUserId && ![1, 2].includes(parseInt(session.user.role))) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        if (daak.status === 'SENT') {
            return NextResponse.json(
                { error: 'Daak has already been sent' },
                { status: 400 }
            );
        }

        // Update recipient statuses to SENT
        await client.query(
            `UPDATE efiling_daak_recipients 
             SET status = 'SENT', received_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE daak_id = $1 AND status = 'PENDING'`,
            [id]
        );

        // Update daak status
        await client.query(
            `UPDATE efiling_daak 
             SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        // Create notifications for all recipients
        const recipients = await client.query(
            'SELECT efiling_user_id FROM efiling_daak_recipients WHERE daak_id = $1',
            [id]
        );

        // Get daak details for notification
        const daakDetails = await client.query(
            'SELECT subject, daak_number FROM efiling_daak WHERE id = $1',
            [id]
        );

        if (daakDetails.rows.length > 0) {
            const { subject, daak_number } = daakDetails.rows[0];
            
            // Insert notifications
            for (const recipient of recipients.rows) {
                try {
                    await client.query(
                        `INSERT INTO efiling_notifications 
                         (user_id, type, message, priority, action_required, metadata, created_at)
                         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                        [
                            recipient.efiling_user_id,
                            'DAAK_RECEIVED',
                            `You have received a new daak: ${subject}`,
                            'normal',
                            true,
                            JSON.stringify({ daak_id: id, daak_number })
                        ]
                    );
                } catch (notifError) {
                    console.error('Error creating notification:', notifError);
                    // Continue even if notification fails
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Daak sent successfully',
            recipients_count: recipients.rows.length
        });
    } catch (error) {
        console.error('Error sending daak:', error);
        return NextResponse.json(
            { error: 'Failed to send daak', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

