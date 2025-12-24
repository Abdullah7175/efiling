import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

export async function PUT(request, { params }) {
    let client;
    try {
        const { id } = await params;
        client = await connectToDatabase();
        
        const result = await client.query(`
            UPDATE efiling_notifications 
            SET is_archived = true, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id]);
        
        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
        }
        
        return NextResponse.json({
            success: true,
            notification: result.rows[0]
        });
    } catch (error) {
        console.error('Error archiving notification:', error);
        return NextResponse.json(
            { error: 'Failed to archive notification' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}
