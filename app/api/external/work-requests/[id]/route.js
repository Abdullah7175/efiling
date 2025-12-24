import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { validateApiKey, checkRateLimit, getRateLimitHeaders } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/external/work-requests/{id}
 * Get specific work request details for video archiving system
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
        
            const query = `
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
                cst.id as complaint_subtype_id,
                t.town as town_name,
                t.district_id as town_district_id,
                st.subtown as subtown_name,
                d.title as district_name,
                wr.created_date,
                wr.updated_date,
                wr.creator_id,
                wr.creator_type,
                COALESCE(u.name, ag.name, sm.name) as creator_name,
                wr.assigned_to,
                a.name as assigned_to_name,
                exen.name as executive_engineer_name,
                COALESCE(contractor.company_name, contractor.name) as contractor_name,
                (
                    SELECT json_agg(
                        json_build_object(
                            'id', wrl.id,
                            'latitude', wrl.latitude,
                            'longitude', wrl.longitude,
                            'description', wrl.description
                        )
                    )
                    FROM work_request_locations wrl 
                    WHERE wrl.work_request_id = wr.id
                ) as additional_locations,
                (
                    SELECT link 
                    FROM final_videos 
                    WHERE work_request_id = wr.id 
                    LIMIT 1
                ) as final_video_link
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
            LEFT JOIN users a ON wr.assigned_to = a.id
            LEFT JOIN agents exen ON wr.executive_engineer_id = exen.id AND exen.role = 1
            LEFT JOIN agents contractor ON wr.contractor_id = contractor.id AND contractor.role = 2
            WHERE wr.id = $1
        `;
        
        const result = await client.query(query, [id]);
        
        if (result.rows.length === 0) {
            return NextResponse.json(
                { error: 'Work request not found' },
                { status: 404 }
            );
        }
        
        return NextResponse.json({
            success: true,
            data: result.rows[0]
        }, {
            headers: getRateLimitHeaders(request)
        });
        
    } catch (error) {
        console.error('Error fetching work request:', error);
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

