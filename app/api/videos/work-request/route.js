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
            // Fetch videos for specific work request
            const query = `
                SELECT 
                    v.id,
                    v.link,
                    v.description,
                    v.created_at,
                    v.creator_id,
                    v.creator_type,
                    COALESCE(u.name, ag.name, sm.name) as creator_name
                FROM videos v
                LEFT JOIN users u ON v.creator_type = 'user' AND v.creator_id = u.id
                LEFT JOIN agents ag ON v.creator_type = 'agent' AND v.creator_id = ag.id
                LEFT JOIN socialmediaperson sm ON v.creator_type = 'socialmedia' AND v.creator_id = sm.id
                WHERE v.work_request_id = $1
                ORDER BY v.created_at DESC
            `;
            const result = await client.query(query, [work_request_id]);
            return NextResponse.json({ data: result.rows }, { status: 200 });
        } else {
            // Fetch all videos with work request info
            const query = `
                SELECT 
                    v.id,
                    v.link,
                    v.description,
                    v.created_at,
                    v.work_request_id,
                    wr.id as request_id,
                    wr.request_date,
                    wr.address,
                    COALESCE(u.name, ag.name, sm.name) as creator_name
                FROM videos v
                LEFT JOIN work_requests wr ON v.work_request_id = wr.id
                LEFT JOIN users u ON v.creator_type = 'user' AND v.creator_id = u.id
                LEFT JOIN agents ag ON v.creator_type = 'agent' AND v.creator_id = ag.id
                LEFT JOIN socialmediaperson sm ON v.creator_type = 'socialmedia' AND v.creator_id = sm.id
                ORDER BY v.created_at DESC
                LIMIT 100
            `;
            const result = await client.query(query);
            return NextResponse.json({ data: result.rows }, { status: 200 });
        }
    } catch (error) {
        console.error('Error fetching videos:', error);
        return NextResponse.json({ error: 'Failed to fetch videos' }, { status: 500 });
    } finally {
        client.release && client.release();
    }
}