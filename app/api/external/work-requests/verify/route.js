import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { validateApiKey, checkRateLimit, getRateLimitHeaders } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/external/work-requests/verify
 * Verify if a work request exists
 * Body: { work_request_id: 123 }
 */
export async function POST(request) {
    // Validate API key
    const authError = validateApiKey(request);
    if (authError) return authError;
    
    // Check rate limit
    const rateLimitError = checkRateLimit(request);
    if (rateLimitError) return rateLimitError;
    
    try {
        const body = await request.json();
        const workRequestId = body.work_request_id || body.workRequestId;
        
        if (!workRequestId) {
            return NextResponse.json(
                { error: 'work_request_id is required' },
                { status: 400 }
            );
        }
        
        if (isNaN(Number(workRequestId))) {
            return NextResponse.json(
                { error: 'Invalid work_request_id format' },
                { status: 400 }
            );
        }
        
        const client = await connectToDatabase();
        
        const query = `
            SELECT 
                wr.id,
                wr.address,
                wr.description,
                wr.status_id,
                s.name as status_name,
                wr.request_date,
                wr.created_date,
                ct.type_name as complaint_type
            FROM work_requests wr
            LEFT JOIN status s ON wr.status_id = s.id
            LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
            WHERE wr.id = $1
        `;
        
        const result = await client.query(query, [workRequestId]);
        
        if (result.rows.length === 0) {
            return NextResponse.json({
                exists: false,
                valid: false,
                data: null
            }, {
                headers: getRateLimitHeaders(request)
            });
        }
        
        const workRequest = result.rows[0];
        
        return NextResponse.json({
            exists: true,
            valid: true,
            data: {
                id: workRequest.id,
                address: workRequest.address,
                description: workRequest.description,
                status: workRequest.status_name,
                status_id: workRequest.status_id,
                request_date: workRequest.request_date,
                created_date: workRequest.created_date,
                complaint_type: workRequest.complaint_type || null
            }
        }, {
            headers: getRateLimitHeaders(request)
        });
        
    } catch (error) {
        console.error('Error verifying work request:', error);
        return NextResponse.json(
            { 
                exists: false,
                valid: false,
                error: 'Internal server error' 
            },
            { status: 500 }
        );
    }
}

