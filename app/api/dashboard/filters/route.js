import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAuth } from '@/lib/authMiddleware';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    // SECURITY: Require authentication
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    const client = await connectToDatabase();
    
    try {
        // Get districts
        const districtsResult = await client.query(`
            SELECT DISTINCT d.id, d.title as name
            FROM district d
            JOIN town t ON d.id = t.district_id
            JOIN dashboard_requests_view drv ON t.id = drv.town_id
            ORDER BY d.title
        `);

        // Get towns
        const townsResult = await client.query(`
            SELECT DISTINCT t.id, t.town as name, d.title as district_name
            FROM town t
            JOIN district d ON t.district_id = d.id
            JOIN dashboard_requests_view drv ON t.id = drv.town_id
            ORDER BY d.title, t.town
        `);

        // Get subtowns
        const subtownsResult = await client.query(`
            SELECT DISTINCT st.id, st.subtown as name, t.town as town_name, d.title as district_name
            FROM subtown st
            JOIN town t ON st.town_id = t.id
            JOIN district d ON t.district_id = d.id
            JOIN dashboard_requests_view drv ON st.id = drv.subtown_id
            ORDER BY d.title, t.town, st.subtown
        `);

        // Get complaint types
        const complaintTypesResult = await client.query(`
            SELECT DISTINCT ct.id, ct.type_name as name
            FROM complaint_types ct
            JOIN dashboard_requests_view drv ON ct.id = drv.complaint_type_id
            ORDER BY ct.type_name
        `);

        // Get complaint subtypes
        const complaintSubtypesResult = await client.query(`
            SELECT DISTINCT cst.id, cst.subtype_name as name, ct.type_name as complaint_type_name
            FROM complaint_subtypes cst
            JOIN complaint_types ct ON cst.complaint_type_id = ct.id
            JOIN dashboard_requests_view drv ON cst.id = drv.complaint_subtype_id
            ORDER BY ct.type_name, cst.subtype_name
        `);

        // Get statuses
        const statusesResult = await client.query(`
            SELECT DISTINCT s.id, s.name
            FROM status s
            JOIN dashboard_requests_view drv ON s.id = drv.status_id
            ORDER BY s.name
        `);

        // Get creator types
        const creatorTypesResult = await client.query(`
            SELECT DISTINCT creator_type as name
            FROM dashboard_requests_view
            WHERE creator_type IS NOT NULL
            ORDER BY creator_type
        `);

        return NextResponse.json({
            districts: districtsResult.rows,
            towns: townsResult.rows,
            subtowns: subtownsResult.rows,
            complaintTypes: complaintTypesResult.rows,
            complaintSubtypes: complaintSubtypesResult.rows,
            statuses: statusesResult.rows,
            creatorTypes: creatorTypesResult.rows
        }, { status: 200 });

    } catch (error) {
        console.error('Error fetching filter options:', error);
        return NextResponse.json({ error: 'Failed to fetch filter options' }, { status: 500 });
    } finally {
        client.release();
    }
}
