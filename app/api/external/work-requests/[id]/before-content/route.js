import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { validateApiKey, checkRateLimit, getRateLimitHeaders } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/external/work-requests/{id}/before-content
 * Get before content for a specific work request
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
        
        // Get before content
        const query = `
            SELECT 
                bc.id,
                bc.work_request_id,
                bc.description,
                bc.link,
                bc.content_type,
                bc.file_name,
                bc.file_size,
                bc.file_type,
                bc.created_at,
                bc.creator_id,
                bc.creator_type,
                bc.creator_name,
                ST_Y(bc.geo_tag) as latitude,
                ST_X(bc.geo_tag) as longitude
            FROM before_content bc
            WHERE bc.work_request_id = $1
            ORDER BY bc.created_at DESC
        `;
        
        const result = await client.query(query, [id]);
        
        return NextResponse.json({
            success: true,
            data: result.rows
        }, {
            headers: getRateLimitHeaders(request)
        });
        
    } catch (error) {
        console.error('Error fetching before content:', error);
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

