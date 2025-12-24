import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { validateApiKey, checkRateLimit, getRateLimitHeaders } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/external/work-requests/{id}/videos
 * Get videos for a specific work request
 */
export async function GET(request, { params }) {
    // Validate API key
    const authError = validateApiKey(request);
    if (authError) return authError;
    
    // Check rate limit
    const rateLimitError = checkRateLimit(request);
    if (rateLimitError) return rateLimitError;
    
    const { id } = params;
    
    if (!id || isNaN(Number(id))) {
        return NextResponse.json(
            { error: 'Invalid work request ID' },
            { status: 400 }
        );
    }
    
    let client;
    try {
        client = await connectToDatabase();
        
        // First verify work request exists
        const workRequestCheck = await client.query(
            'SELECT id FROM work_requests WHERE id = $1',
            [id]
        );
        
        if (workRequestCheck.rows.length === 0) {
            return NextResponse.json(
                { error: 'Work request not found' },
                { status: 404 }
            );
        }
        
        // Get videos
        const query = `
            SELECT 
                v.id,
                v.link,
                v.description,
                v.file_name,
                v.file_size,
                v.file_type,
                v.created_at,
                v.creator_id,
                v.creator_type,
                COALESCE(u.name, ag.name, sm.name) as creator_name,
                ST_Y(v.geo_tag) as latitude,
                ST_X(v.geo_tag) as longitude
            FROM videos v
            LEFT JOIN users u ON v.creator_type = 'user' AND v.creator_id = u.id
            LEFT JOIN agents ag ON v.creator_type = 'agent' AND v.creator_id = ag.id
            LEFT JOIN socialmediaperson sm ON v.creator_type = 'socialmedia' AND v.creator_id = sm.id
            WHERE v.work_request_id = $1
            ORDER BY v.created_at DESC
        `;
        
        const result = await client.query(query, [id]);
        
        return NextResponse.json({
            success: true,
            data: result.rows
        }, {
            headers: getRateLimitHeaders(request)
        });
        
    } catch (error) {
        console.error('Error fetching videos:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    } finally {
        if (client && typeof client.release === 'function') {
            client.release();
        }
    }
}

