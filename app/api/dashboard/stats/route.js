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
        // Get total requests count
        const totalRequestsResult = await client.query('SELECT COUNT(*) as count FROM dashboard_requests_view');
        const totalRequests = parseInt(totalRequestsResult.rows[0].count);

        // Get active requests count (not completed or cancelled)
        const activeRequestsResult = await client.query(`
            SELECT COUNT(*) as count 
            FROM dashboard_requests_view 
            WHERE status_name NOT IN ('Completed', 'Cancelled')
        `);
        const activeRequests = parseInt(activeRequestsResult.rows[0].count);

        // Get completed requests count
        const completedRequestsResult = await client.query(`
            SELECT COUNT(*) as count 
            FROM dashboard_requests_view 
            WHERE status_name = 'Completed'
        `);
        const completedRequests = parseInt(completedRequestsResult.rows[0].count);

        // Get pending requests count
        const pendingRequestsResult = await client.query(`
            SELECT COUNT(*) as count 
            FROM dashboard_requests_view 
            WHERE status_name = 'Pending'
        `);
        const pendingRequests = parseInt(pendingRequestsResult.rows[0].count);

        // Get requests by status
        const statusStatsResult = await client.query(`
            SELECT status_name, COUNT(*) as count
            FROM dashboard_requests_view
            GROUP BY status_name
            ORDER BY count DESC
        `);

        // Get requests by district
        const districtStatsResult = await client.query(`
            SELECT district_name, COUNT(*) as count
            FROM dashboard_requests_view
            WHERE district_name IS NOT NULL
            GROUP BY district_name
            ORDER BY count DESC
            LIMIT 10
        `);

        // Get requests by complaint type
        const complaintTypeStatsResult = await client.query(`
            SELECT complaint_type, COUNT(*) as count
            FROM dashboard_requests_view
            WHERE complaint_type IS NOT NULL
            GROUP BY complaint_type
            ORDER BY count DESC
            LIMIT 10
        `);

        // Get recent requests (last 30 days)
        const recentRequestsResult = await client.query(`
            SELECT COUNT(*) as count
            FROM dashboard_requests_view
            WHERE request_date >= CURRENT_DATE - INTERVAL '30 days'
        `);
        const recentRequests = parseInt(recentRequestsResult.rows[0].count);

        return NextResponse.json({
            totalRequests,
            activeRequests,
            completedRequests,
            pendingRequests,
            recentRequests,
            statusStats: statusStatsResult.rows,
            districtStats: districtStatsResult.rows,
            complaintTypeStats: complaintTypeStatsResult.rows
        }, { status: 200 });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        return NextResponse.json({ error: 'Failed to fetch dashboard statistics' }, { status: 500 });
    } finally {
        client.release();
    }
}
