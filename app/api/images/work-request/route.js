import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAuth } from '@/lib/authMiddleware';

export async function GET(request) {
    // SECURITY: Require authentication
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    const { searchParams } = new URL(request.url);
    const work_request_id = searchParams.get('work_request_id');
    const client = await connectToDatabase();

    try {
        if (work_request_id) {
            // Fetch images for specific work request
            const query = `
                SELECT 
                    i.id,
                    i.link,
                    i.description,
                    i.created_at,
                    i.creator_id,
                    i.creator_type,
                    COALESCE(u.name, ag.name, sm.name) as creator_name
                FROM images i
                LEFT JOIN users u ON i.creator_type = 'user' AND i.creator_id = u.id
                LEFT JOIN agents ag ON i.creator_type = 'agent' AND i.creator_id = ag.id
                LEFT JOIN socialmediaperson sm ON i.creator_type = 'socialmedia' AND i.creator_id = sm.id
                WHERE i.work_request_id = $1
                ORDER BY i.created_at DESC
            `;
            const result = await client.query(query, [work_request_id]);
            return NextResponse.json({ data: result.rows }, { status: 200 });
        } else {
            // Fetch all images with work request info
            const query = `
                SELECT 
                    i.id,
                    i.link,
                    i.description,
                    i.created_at,
                    i.work_request_id,
                    wr.id as request_id,
                    wr.request_date,
                    wr.address,
                    COALESCE(u.name, ag.name, sm.name) as creator_name
                FROM images i
                LEFT JOIN work_requests wr ON i.work_request_id = wr.id
                LEFT JOIN users u ON i.creator_type = 'user' AND i.creator_id = u.id
                LEFT JOIN agents ag ON i.creator_type = 'agent' AND i.creator_id = ag.id
                LEFT JOIN socialmediaperson sm ON i.creator_type = 'socialmedia' AND i.creator_id = sm.id
                ORDER BY i.created_at DESC
                LIMIT 100
            `;
            const result = await client.query(query);
            return NextResponse.json({ data: result.rows }, { status: 200 });
        }
    } catch (error) {
        console.error('Error fetching images:', error);
        return NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 });
    } finally {
        client.release && client.release();
    }
}