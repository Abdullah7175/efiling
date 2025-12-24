import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { logAction } from '@/lib/actionLogger';

// GET - Fetch comments for a file
export async function GET(request, { params }) {
    const { id } = await params;
    let client;

    try {
        client = await connectToDatabase();
        
        // Check if comments table exists, create if not
        await client.query(`
            CREATE TABLE IF NOT EXISTS efiling_document_comments (
                id SERIAL PRIMARY KEY,
                file_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                user_name VARCHAR(255) NOT NULL,
                user_role VARCHAR(100) NOT NULL,
                text TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                edited BOOLEAN DEFAULT FALSE,
                edited_at TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE,
                FOREIGN KEY (file_id) REFERENCES efiling_files(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Fetch comments for the file
        const result = await client.query(`
            SELECT * FROM efiling_document_comments 
            WHERE file_id = $1 AND is_active = TRUE 
            ORDER BY timestamp ASC
        `, [id]);

        return NextResponse.json(result.rows);
    } catch (error) {
        console.error('Error fetching comments:', error);
        return NextResponse.json(
            { error: 'Failed to fetch comments' },
            { status: 500 }
        );
    } finally {
        if (client) {
            client.release();
        }
    }
}

// POST - Add a new comment to a file
export async function POST(request, { params }) {
    const { id } = await params;
    let client;

    try {
        const body = await request.json();
        const { user_id, user_name, user_role, text } = body;

        // Validate required fields
        if (!user_id || !user_name || !user_role || !text) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();
        
        // Check if comments table exists, create if not
        await client.query(`
            CREATE TABLE IF NOT EXISTS efiling_document_comments (
                id SERIAL PRIMARY KEY,
                file_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                user_name VARCHAR(255) NOT NULL,
                user_role VARCHAR(100) NOT NULL,
                text TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                edited BOOLEAN DEFAULT FALSE,
                edited_at TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE,
                FOREIGN KEY (file_id) REFERENCES efiling_files(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Insert new comment
        const result = await client.query(`
            INSERT INTO efiling_document_comments 
            (file_id, user_id, user_name, user_role, text)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [id, user_id, user_name, user_role, text]);

        // Get efiling user ID for notifications
        let efilingUserId = null;
        try {
            const efilingUserRes = await client.query(
                `SELECT id FROM efiling_users WHERE user_id = $1 AND is_active = true LIMIT 1`,
                [user_id]
            );
            if (efilingUserRes.rows.length > 0) {
                efilingUserId = efilingUserRes.rows[0].id;
            }
        } catch (e) {
            console.error('Error getting efiling user ID for notifications:', e);
        }

        // Notify file creator and all users who have been marked to this file
        try {
            // Get file creator and current assignee
            const fileMeta = await client.query(`
                SELECT f.created_by, f.assigned_to
                FROM efiling_files f
                WHERE f.id = $1
            `, [id]);
            
            if (fileMeta.rows.length > 0) {
                const createdBy = fileMeta.rows[0]?.created_by;
                const currentAssignee = fileMeta.rows[0]?.assigned_to;
                
                // Notify creator (if not the commenter)
                if (createdBy && createdBy !== efilingUserId) {
                    await client.query(`
                        INSERT INTO efiling_notifications (user_id, file_id, type, message, priority, action_required, created_at)
                        VALUES ($1, $2, $3, $4, 'normal', true, NOW())
                    `, [createdBy, id, 'comment_added', `${user_name} added a comment on file`]);
                }
                
                // Notify current assignee (if not creator and not commenter)
                if (currentAssignee && currentAssignee !== createdBy && currentAssignee !== efilingUserId) {
                    await client.query(`
                        INSERT INTO efiling_notifications (user_id, file_id, type, message, priority, action_required, created_at)
                        VALUES ($1, $2, $3, $4, 'normal', true, NOW())
                    `, [currentAssignee, id, 'comment_added', `${user_name} added a comment on file`]);
                }
                
                // Notify all users who have been marked to this file
                const markedUsers = await client.query(`
                    SELECT DISTINCT to_user_id
                    FROM efiling_file_movements
                    WHERE file_id = $1 AND to_user_id IS NOT NULL
                `, [id]);
                
                for (const markedUser of markedUsers.rows) {
                    const markedUserId = markedUser.to_user_id;
                    // Skip if already notified (creator or assignee) or is the commenter
                    if (markedUserId !== createdBy && markedUserId !== currentAssignee && markedUserId !== efilingUserId) {
                        await client.query(`
                            INSERT INTO efiling_notifications (user_id, file_id, type, message, priority, action_required, created_at)
                            VALUES ($1, $2, $3, $4, 'normal', false, NOW())
                        `, [markedUserId, id, 'comment_added', `${user_name} added a comment on file`]);
                    }
                }
            }
        } catch (notifyError) {
            console.error('Error creating comment notifications:', notifyError);
            // Don't fail the request if notifications fail
        }

        // Log the action
        await logAction({
            user_id,
            file_id: id,
            action_type: 'ADD_COMMENT',
            details: 'Added comment to document',
            ip_address: request.headers.get('x-forwarded-for') || 'unknown'
        });

        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('Error adding comment:', error);
        return NextResponse.json(
            { error: 'Failed to add comment' },
            { status: 500 }
        );
    } finally {
        if (client) {
            client.release();
        }
    }
}
