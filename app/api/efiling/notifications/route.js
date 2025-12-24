import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

export async function GET(request) {
    let client;
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('user_id');
        const limit = searchParams.get('limit') || '50';
        const offset = searchParams.get('offset') || '0';

        client = await connectToDatabase();
        
        let query = `
            SELECT 
                n.*,
                ef.file_number,
                ef.subject as file_subject
            FROM efiling_notifications n
            LEFT JOIN efiling_files ef ON n.file_id = ef.id
            WHERE 1=1
        `;
        
        const queryParams = [];
        let paramCount = 0;

        if (userId) {
            // Translate users.id to efiling_users.id if needed
            let targetId = userId;
            try {
                const map = await client.query(`
                    SELECT eu.id AS efiling_user_id
                    FROM efiling_users eu
                    JOIN users u ON eu.user_id = u.id
                    WHERE u.id = $1
                `, [userId]);
                if (map.rows[0]?.efiling_user_id) {
                    targetId = map.rows[0].efiling_user_id.toString();
                }
            } catch {}

            paramCount++;
            query += ` AND n.user_id = $${paramCount}`;
            queryParams.push(targetId);
        }

        query += ` ORDER BY n.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
        queryParams.push(parseInt(limit), parseInt(offset));
        
        const result = await client.query(query, queryParams);
        
        return NextResponse.json({
            notifications: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return NextResponse.json(
            { error: 'Failed to fetch notifications' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

export async function POST(request) {
    let client;
    try {
        const body = await request.json();
        const { 
            user_id, 
            type, 
            message, 
            file_id = null,
            priority = 'normal',
            action_required = false,
            expires_at = null,
            metadata = {}
        } = body;

        if (!user_id || !type || !message) {
            return NextResponse.json(
                { error: 'User ID, type, and message are required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();
        
        const query = `
            INSERT INTO efiling_notifications 
            (user_id, type, message, file_id, priority, action_required, expires_at, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            RETURNING *
        `;
        
        const result = await client.query(query, [
            user_id, type, message, file_id, priority, action_required, expires_at, JSON.stringify(metadata)
        ]);
        
        return NextResponse.json({
            success: true,
            notification: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating notification:', error);
        return NextResponse.json(
            { error: 'Failed to create notification' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

export async function PUT(request) {
    let client;
    try {
        const body = await request.json();
        const { notificationId, userId, action } = body;

        if (!notificationId || !userId || !action) {
            return NextResponse.json({ 
                error: 'Notification ID, user ID, and action are required' 
            }, { status: 400 });
        }

        client = await connectToDatabase();

        let query;
        let params;

        switch (action) {
            case 'mark_read':
                query = `
                    UPDATE efiling_notifications 
                    SET is_read = true, read_at = NOW(), updated_at = NOW()
                    WHERE id = $1 AND user_id = $2
                    RETURNING *
                `;
                params = [notificationId, userId];
                break;

            case 'mark_unread':
                query = `
                    UPDATE efiling_notifications 
                    SET is_read = false, read_at = NULL, updated_at = NOW()
                    WHERE id = $1 AND user_id = $2
                    RETURNING *
                `;
                params = [notificationId, userId];
                break;

            case 'dismiss':
                query = `
                    UPDATE efiling_notifications 
                    SET is_dismissed = true, dismissed_at = NOW(), updated_at = NOW()
                    WHERE id = $1 AND user_id = $2
                    RETURNING *
                `;
                params = [notificationId, userId];
                break;

            default:
                return NextResponse.json({ 
                    error: 'Invalid action. Use: mark_read, mark_unread, or dismiss' 
                }, { status: 400 });
        }

        const result = await client.query(query, params);

        if (result.rows.length === 0) {
            return NextResponse.json({ 
                error: 'Notification not found or access denied' 
            }, { status: 404 });
        }

        const updatedNotification = result.rows[0];

        // Log the notification action
        // await eFileActionLogger.logAction({
        //     entityType: 'NOTIFICATION',
        //     entityId: notificationId,
        //     action: `NOTIFICATION_${action.toUpperCase()}`,
        //     userId: userId,
        //     details: { action }
        // });

        return NextResponse.json({
            success: true,
            notification: updatedNotification
        });

    } catch (error) {
        console.error('Error updating notification:', error);
        return NextResponse.json(
            { error: 'Failed to update notification' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function DELETE(request) {
    let client;
    try {
        const body = await request.json();
        const { notificationId, userId } = body;

        if (!notificationId || !userId) {
            return NextResponse.json({ 
                error: 'Notification ID and user ID are required' 
            }, { status: 400 });
        }

        client = await connectToDatabase();

        // Soft delete - mark as deleted
        const result = await client.query(`
            UPDATE efiling_notifications 
            SET is_deleted = true, deleted_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND user_id = $2
            RETURNING *
        `, [notificationId, userId]);

        if (result.rows.length === 0) {
            return NextResponse.json({ 
                error: 'Notification not found or access denied' 
            }, { status: 404 });
        }

        // Log the notification deletion
        // await eFileActionLogger.logAction({
        //     entityType: 'NOTIFICATION',
        //     entityId: notificationId,
        //     action: 'NOTIFICATION_DELETED',
        //     userId: userId
        // });

        return NextResponse.json({
            success: true,
            message: 'Notification deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting notification:', error);
        return NextResponse.json(
            { error: 'Failed to delete notification' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}
