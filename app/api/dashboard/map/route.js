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
    const district_id = searchParams.get('district_id');
    const town_id = searchParams.get('town_id');
    const subtown_id = searchParams.get('subtown_id');
    const complaint_type_id = searchParams.get('complaint_type_id');
    const complaint_subtype_id = searchParams.get('complaint_subtype_id');
    const status_id = searchParams.get('status_id');
    const creator_type = searchParams.get('creator_type');
    const creator_id = searchParams.get('creator_id');
    const date_from = searchParams.get('date_from');
    const date_to = searchParams.get('date_to');

    const client = await connectToDatabase();
    
    try {
        let whereClauses = [];
        let params = [];
        let paramIdx = 1;

        // Build dynamic WHERE clause based on filters
        if (district_id) {
            whereClauses.push(`district_id = $${paramIdx}`);
            params.push(district_id);
            paramIdx++;
        }

        if (town_id) {
            whereClauses.push(`town_id = $${paramIdx}`);
            params.push(town_id);
            paramIdx++;
        }

        if (subtown_id) {
            whereClauses.push(`subtown_id = $${paramIdx}`);
            params.push(subtown_id);
            paramIdx++;
        }

        if (complaint_type_id) {
            whereClauses.push(`complaint_type_id = $${paramIdx}`);
            params.push(complaint_type_id);
            paramIdx++;
        }

        if (complaint_subtype_id) {
            whereClauses.push(`complaint_subtype_id = $${paramIdx}`);
            params.push(complaint_subtype_id);
            paramIdx++;
        }

        if (status_id) {
            whereClauses.push(`status_id = $${paramIdx}`);
            params.push(status_id);
            paramIdx++;
        }

        if (creator_type) {
            whereClauses.push(`creator_type = $${paramIdx}`);
            params.push(creator_type);
            paramIdx++;
        }

        if (creator_id) {
            whereClauses.push(`creator_id = $${paramIdx}`);
            params.push(creator_id);
            paramIdx++;
        }

        if (date_from) {
            whereClauses.push(`request_date >= $${paramIdx}`);
            params.push(date_from);
            paramIdx++;
        }

        if (date_to) {
            whereClauses.push(`request_date <= $${paramIdx}`);
            params.push(date_to);
            paramIdx++;
        }

        // Only show requests with valid coordinates
        whereClauses.push(`latitude IS NOT NULL AND longitude IS NOT NULL`);

        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const query = `
            SELECT 
                id,
                request_date,
                contact_number,
                address,
                description,
                budget_code,
                file_type,
                nature_of_work,
                latitude,
                longitude,
                town_name,
                district_name,
                subtown_name,
                complaint_type,
                complaint_subtype,
                status_name,
                creator_name,
                creator_type,
                executive_engineer_name,
                contractor_name,
                additional_locations,
                image_count,
                video_count,
                final_video_count,
                assigned_sm_agents_count
            FROM dashboard_requests_view
            ${whereClause}
            ORDER BY request_date DESC
        `;

        const result = await client.query(query, params);

        // Transform the data for the map
        const mapData = result.rows.map(row => ({
            id: row.id,
            position: {
                lat: parseFloat(row.latitude),
                lng: parseFloat(row.longitude)
            },
            title: `Request #${row.id}`,
            description: row.description,
            address: row.address,
            status: row.status_name,
            town: row.town_name,
            district: row.district_name,
            subtown: row.subtown_name,
            complaintType: row.complaint_type,
            complaintSubtype: row.complaint_subtype,
            creator: row.creator_name,
            creatorType: row.creator_type,
            executiveEngineer: row.executive_engineer_name,
            contractor: row.contractor_name,
            requestDate: row.request_date,
            budgetCode: row.budget_code,
            fileType: row.file_type,
            natureOfWork: row.nature_of_work,
            mediaCounts: {
                images: row.image_count,
                videos: row.video_count,
                finalVideos: row.final_video_count
            },
            assignedAgentsCount: row.assigned_sm_agents_count,
            additionalLocations: row.additional_locations || []
        }));

        return NextResponse.json({
            data: mapData,
            total: mapData.length
        }, { status: 200 });

    } catch (error) {
        console.error('Error fetching map data:', error);
        return NextResponse.json({ error: 'Failed to fetch map data' }, { status: 500 });
    } finally {
        client.release();
    }
}
