import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { logAction } from '@/lib/actionLogger';
import { auth } from '@/auth';

// GET - Fetch signatures for a file
export async function GET(request, { params }) {
    const { id } = await params;
    let client;

    try {
        // SECURITY: Require authentication
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        client = await connectToDatabase();

        // SECURITY: Check file access
        const { checkFileAccess } = await import('@/lib/authMiddleware');
        const userId = parseInt(session.user.id);
        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        
        const hasAccess = await checkFileAccess(client, parseInt(id), userId, isAdmin);
        if (!hasAccess) {
            return NextResponse.json(
                { error: 'Forbidden - You do not have access to this file' },
                { status: 403 }
            );
        }
        
        // Check if signatures table exists, create if not
        await client.query(`
            CREATE TABLE IF NOT EXISTS efiling_document_signatures (
                id SERIAL PRIMARY KEY,
                file_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                user_name VARCHAR(255) NOT NULL,
                user_role VARCHAR(100) NOT NULL,
                type VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                position JSONB NOT NULL,
                font VARCHAR(100),
                color VARCHAR(20) DEFAULT 'black',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE,
                FOREIGN KEY (file_id) REFERENCES efiling_files(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        
        // Add color column if it doesn't exist
        await client.query(`
            ALTER TABLE efiling_document_signatures 
            ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT 'black'
        `);

        // Fetch signatures for the file
        const result = await client.query(`
            SELECT * FROM efiling_document_signatures 
            WHERE file_id = $1 AND is_active = TRUE 
            ORDER BY timestamp ASC
        `, [id]);

        return NextResponse.json(result.rows);
    } catch (error) {
        console.error('Error fetching signatures:', error);
        return NextResponse.json(
            { error: 'Failed to fetch signatures' },
            { status: 500 }
        );
    } finally {
        if (client) {
            client.release();
        }
    }
}

// POST - Add a new signature to a file
export async function POST(request, { params }) {
    const { id } = await params;
    let client;

    try {
        // SECURITY: Require authentication
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { user_id, user_name, user_role, type, content, position, font } = body;

        // Validate required fields
        if (!user_id || !user_name || !user_role || !type || !content || !position) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();
        
        // Check if signatures table exists, create if not
        await client.query(`
            CREATE TABLE IF NOT EXISTS efiling_document_signatures (
                id SERIAL PRIMARY KEY,
                file_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                user_name VARCHAR(255) NOT NULL,
                user_role VARCHAR(100) NOT NULL,
                type VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                position JSONB NOT NULL,
                font VARCHAR(100),
                color VARCHAR(20) DEFAULT 'black',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE,
                FOREIGN KEY (file_id) REFERENCES efiling_files(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        
        // Add color column if it doesn't exist
        await client.query(`
            ALTER TABLE efiling_document_signatures 
            ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT 'black'
        `);

        const { color } = body;
        const signatureColor = color || 'black';

        // Get historical user information (designation, town, division) at time of signature
        const userInfo = await client.query(`
            SELECT eu.designation, eu.town_id, eu.division_id
            FROM efiling_users eu
            WHERE eu.user_id = $1 AND eu.is_active = true
            LIMIT 1
        `, [user_id]);
        const userData = userInfo.rows[0] || {};

        // Add historical columns if they don't exist
        await client.query(`
            ALTER TABLE efiling_document_signatures 
            ADD COLUMN IF NOT EXISTS user_designation VARCHAR(255) NULL,
            ADD COLUMN IF NOT EXISTS user_town_id INT4 NULL,
            ADD COLUMN IF NOT EXISTS user_division_id INT4 NULL
        `);

        // Insert new signature with historical user info
        const result = await client.query(`
            INSERT INTO efiling_document_signatures 
            (file_id, user_id, user_name, user_role, type, content, position, font, color, user_designation, user_town_id, user_division_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            id, user_id, user_name, user_role, type, content, position, font, signatureColor,
            userData.designation || null,
            userData.town_id || null,
            userData.division_id || null
        ]);

        // Get efiling user ID for checking if user already notified themselves
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
        
        // Notify creator, current assignee, and all users who have been marked to this file
        try {
            const meta = await client.query(`
                SELECT f.created_by, f.assigned_to
                FROM efiling_files f
                WHERE f.id = $1
            `, [id]);
            const createdBy = meta.rows[0]?.created_by;
            const currentAssignee = meta.rows[0]?.assigned_to;
            const message = `${user_name} added a ${type} signature`;
            
            // Notify creator (if not the signer)
            if (createdBy && createdBy !== efilingUserId) {
                await client.query(`
                    INSERT INTO efiling_notifications (user_id, file_id, type, message, priority, action_required, created_at)
                    VALUES ($1, $2, $3, $4, 'normal', false, NOW())
                `, [createdBy, id, 'signature_added', message]);
            }
            
            // Notify current assignee (if not creator and not signer)
            if (currentAssignee && currentAssignee !== createdBy && currentAssignee !== efilingUserId) {
                await client.query(`
                    INSERT INTO efiling_notifications (user_id, file_id, type, message, priority, action_required, created_at)
                    VALUES ($1, $2, $3, $4, 'normal', false, NOW())
                `, [currentAssignee, id, 'signature_added', message]);
            }
            
            // Notify all users who have been marked to this file
            const markedUsers = await client.query(`
                SELECT DISTINCT to_user_id
                FROM efiling_file_movements
                WHERE file_id = $1 AND to_user_id IS NOT NULL
            `, [id]);
            
            for (const markedUser of markedUsers.rows) {
                const markedUserId = markedUser.to_user_id;
                // Skip if already notified (creator or assignee) or is the signer
                if (markedUserId !== createdBy && markedUserId !== currentAssignee && markedUserId !== efilingUserId) {
                    await client.query(`
                        INSERT INTO efiling_notifications (user_id, file_id, type, message, priority, action_required, created_at)
                        VALUES ($1, $2, $3, $4, 'normal', false, NOW())
                    `, [markedUserId, id, 'signature_added', message]);
                }
            }
        } catch (e) {
            console.warn('Signature notify failed', e);
        }

        // Log the action
        await logAction({
            user_id,
            file_id: id,
            action_type: 'ADD_SIGNATURE',
            details: `Added ${type} signature to document`,
            ip_address: request.headers.get('x-forwarded-for') || 'unknown'
        });

        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('Error adding signature:', error);
        return NextResponse.json(
            { error: 'Failed to add signature' },
            { status: 500 }
        );
    } finally {
        if (client) {
            client.release();
        }
    }
}
