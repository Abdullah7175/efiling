import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

export async function PUT(request, { params }) {
    let client;
    try {
        // SECURITY: Require authentication
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        
        if (!id) {
            return NextResponse.json(
                { error: 'Notification ID is required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();
        
        // Get current user's efiling_user_id
        const userRes = await client.query(`
            SELECT id FROM efiling_users WHERE user_id = $1 AND is_active = true
        `, [session.user.id]);
        
        if (userRes.rows.length === 0) {
            await client.release();
            return NextResponse.json({ error: 'E-filing user profile not found' }, { status: 403 });
        }
        const efilingUserId = userRes.rows[0].id;
        
        // SECURITY: Only allow users to dismiss their own notifications
        const query = `
            UPDATE efiling_notifications 
            SET is_dismissed = true, updated_at = NOW()
            WHERE id = $1 AND user_id = $2
            RETURNING *
        `;
        
        const result = await client.query(query, [id, efilingUserId]);
        
        if (result.rows.length === 0) {
            return NextResponse.json(
                { error: 'Notification not found or access denied' },
                { status: 404 }
            );
        }
        
        return NextResponse.json({
            success: true,
            notification: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error dismissing notification:', error);
        return NextResponse.json(
            { error: 'Failed to dismiss notification' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}
