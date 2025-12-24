import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

export async function POST(request) {
    let client;
    try {
        const { fileId, userId, action, description, timestamp } = await request.json();
        
        if (!fileId || !userId || !action || !description) {
            return NextResponse.json(
                { error: 'File ID, user ID, action, and description are required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();
        
        // Log the user action with comprehensive schema
        await client.query(`
            INSERT INTO efiling_user_actions (
                file_id, user_id, action_type, description, timestamp, created_at,
                user_type, user_role, user_name, user_email, entity_type, entity_name,
                details, ip_address, user_agent
            ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
            fileId, 
            userId ? userId.toString() : null, // Convert to string to match VARCHAR column
            action, 
            description, 
            timestamp || new Date().toISOString(),
            'efiling_user', // user_type
            0, // user_role
            'Unknown User', // user_name
            'unknown@example.com', // user_email
            'efiling_file', // entity_type
            fileId ? `file_${fileId}` : 'system', // entity_name
            '{}', // details
            null, // ip_address
            null // user_agent
        ]);
        
        console.log(`Action logged: ${action} by user ${userId} on file ${fileId}`);
        
        return NextResponse.json({
            success: true,
            message: 'Action logged successfully'
        });
        
    } catch (error) {
        console.error('Error logging action:', error);
        return NextResponse.json(
            { error: 'Failed to log action' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}
