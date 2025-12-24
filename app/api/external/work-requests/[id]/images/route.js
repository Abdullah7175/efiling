import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { validateApiKey, checkRateLimit, getRateLimitHeaders } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/external/work-requests/{id}/images
 * Get images for a specific work request
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
        
        // Get images
        const query = `
            SELECT 
                i.id,
                i.link,
                i.description,
                i.file_name,
                i.file_size,
                i.file_type,
                i.created_at,
                i.creator_id,
                i.creator_type,
                COALESCE(u.name, ag.name, sm.name) as creator_name,
                ST_Y(i.geo_tag) as latitude,
                ST_X(i.geo_tag) as longitude
            FROM images i
            LEFT JOIN users u ON i.creator_type = 'user' AND i.creator_id = u.id
            LEFT JOIN agents ag ON i.creator_type = 'agent' AND i.creator_id = ag.id
            LEFT JOIN socialmediaperson sm ON i.creator_type = 'socialmedia' AND i.creator_id = sm.id
            WHERE i.work_request_id = $1
            ORDER BY i.created_at DESC
        `;
        
        const result = await client.query(query, [id]);
        
        return NextResponse.json({
            success: true,
            data: result.rows
        }, {
            headers: getRateLimitHeaders(request)
        });
        
    } catch (error) {
        console.error('Error fetching images:', error);
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

