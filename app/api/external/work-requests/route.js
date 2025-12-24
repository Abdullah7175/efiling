import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { validateApiKey, checkRateLimit, getRateLimitHeaders } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/external/work-requests
 * List/search work requests for E-Filing integration
 * Query params: scope=efiling (required), search, status, limit, offset
 */
export async function GET(request) {
    // Validate API key
    const authError = validateApiKey(request);
    if (authError) return authError;
    
    // Check rate limit
    const rateLimitError = checkRateLimit(request);
    if (rateLimitError) return rateLimitError;
    
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope');
    const search = searchParams.get('search') || searchParams.get('filter') || '';
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500); // Max 500
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    
    // Require scope=efiling
    if (scope !== 'efiling') {
        return NextResponse.json(
            { error: 'Invalid scope. Must provide scope=efiling parameter.' },
            { status: 400 }
        );
    }
    
    let client;
    try {
        client = await connectToDatabase();
        
        let whereClauses = [];
        let params = [];
        let paramIndex = 1;
        
        // Search filter
        if (search) {
            whereClauses.push(`(
                wr.address ILIKE $${paramIndex} OR 
                wr.description ILIKE $${paramIndex} OR 
                CAST(wr.id AS TEXT) ILIKE $${paramIndex} OR
                ct.type_name ILIKE $${paramIndex}
            )`);
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        // Status filter (can be status name or status_id)
        if (status) {
            if (isNaN(Number(status))) {
                // Status name
                whereClauses.push(`s.name = $${paramIndex}`);
                params.push(status);
            } else {
                // Status ID
                whereClauses.push(`wr.status_id = $${paramIndex}`);
                params.push(parseInt(status));
            }
            paramIndex++;
        }
        
        const whereClause = whereClauses.length > 0 
            ? 'WHERE ' + whereClauses.join(' AND ')
            : '';
        
        // Count query
        const countQuery = `
            SELECT COUNT(*) as total
            FROM work_requests wr
            LEFT JOIN status s ON wr.status_id = s.id
            LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
            ${whereClause}
        `;
        
        const countResult = await client.query(countQuery, params);
        const total = parseInt(countResult.rows[0]?.total || 0, 10);
        
        // Data query
        const dataQuery = `
            SELECT 
                wr.id,
                wr.request_date,
                wr.address,
                wr.description,
                wr.zone_id,
                wr.division_id,
                wr.town_id,
                wr.subtown_id,
                ST_Y(wr.geo_tag) as latitude,
                ST_X(wr.geo_tag) as longitude,
                wr.contact_number,
                wr.status_id,
                s.name as status_name,
                ct.type_name as complaint_type,
                ct.id as complaint_type_id,
                cst.subtype_name as complaint_subtype,
                t.town as town_name,
                t.district_id as town_district_id,
                st.subtown as subtown_name,
                d.title as district_name,
                wr.created_date,
                wr.updated_date,
                COALESCE(u.name, ag.name, sm.name) as creator_name,
                wr.creator_type
            FROM work_requests wr
            LEFT JOIN status s ON wr.status_id = s.id
            LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
            LEFT JOIN complaint_subtypes cst ON wr.complaint_subtype_id = cst.id
            LEFT JOIN town t ON wr.town_id = t.id
            LEFT JOIN subtown st ON wr.subtown_id = st.id
            LEFT JOIN district d ON t.district_id = d.id
            LEFT JOIN users u ON wr.creator_type = 'user' AND wr.creator_id = u.id
            LEFT JOIN agents ag ON wr.creator_type = 'agent' AND wr.creator_id = ag.id
            LEFT JOIN socialmediaperson sm ON wr.creator_type = 'socialmedia' AND wr.creator_id = sm.id
            ${whereClause}
            ORDER BY wr.created_date DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        
        params.push(limit, offset);
        const dataResult = await client.query(dataQuery, params);
        
        return NextResponse.json({
            success: true,
            data: dataResult.rows,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            }
        }, {
            headers: getRateLimitHeaders(request)
        });
        
    } catch (error) {
        console.error('Error fetching work requests:', error);
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

