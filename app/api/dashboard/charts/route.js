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
        // Get requests by month for the last 6 months (line chart data)
        const lineChartData = await client.query(`
            SELECT 
                DATE_TRUNC('month', request_date) as month,
                COUNT(*) as total_requests,
                COUNT(CASE WHEN status_name = 'Completed' THEN 1 END) as completed_requests,
                COUNT(CASE WHEN status_name = 'Pending' THEN 1 END) as pending_requests,
                COUNT(CASE WHEN status_name = 'In Progress' THEN 1 END) as in_progress_requests,
                COUNT(CASE WHEN status_name = 'Assigned' THEN 1 END) as assigned_requests
            FROM dashboard_requests_view
            WHERE request_date >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY DATE_TRUNC('month', request_date)
            ORDER BY month
        `);

        // Get requests by status (pie chart data)
        const pieChartData = await client.query(`
            SELECT 
                status_name as status,
                COUNT(*) as count
            FROM dashboard_requests_view
            GROUP BY status_name
            ORDER BY count DESC
        `);

        // Get requests by district (additional pie chart data)
        const districtData = await client.query(`
            SELECT 
                district_name as district,
                COUNT(*) as count
            FROM dashboard_requests_view
            WHERE district_name IS NOT NULL
            GROUP BY district_name
            ORDER BY count DESC
            LIMIT 5
        `);

        // Get requests by complaint type (additional pie chart data)
        const complaintTypeData = await client.query(`
            SELECT 
                complaint_type as type,
                COUNT(*) as count
            FROM dashboard_requests_view
            WHERE complaint_type IS NOT NULL
            GROUP BY complaint_type
            ORDER BY count DESC
            LIMIT 5
        `);

        // Calculate trend (percentage change from last month)
        const trendData = await client.query(`
            WITH monthly_counts AS (
                SELECT 
                    DATE_TRUNC('month', request_date) as month,
                    COUNT(*) as count
                FROM dashboard_requests_view
                WHERE request_date >= CURRENT_DATE - INTERVAL '2 months'
                GROUP BY DATE_TRUNC('month', request_date)
                ORDER BY month
            ),
            trend_calc AS (
                SELECT 
                    LAG(count) OVER (ORDER BY month) as prev_count,
                    count as current_count
                FROM monthly_counts
            )
            SELECT 
                CASE 
                    WHEN prev_count IS NULL OR prev_count = 0 THEN 0
                    ELSE ROUND(((current_count - prev_count)::float / prev_count * 100)::numeric, 1)
                END as trend_percentage
            FROM trend_calc
            WHERE prev_count IS NOT NULL
            ORDER BY trend_percentage DESC
            LIMIT 1
        `);

        // Format line chart data
        const formattedLineData = lineChartData.rows.map(row => ({
            month: row.month.toISOString().split('T')[0],
            total: parseInt(row.total_requests),
            completed: parseInt(row.completed_requests),
            pending: parseInt(row.pending_requests),
            inProgress: parseInt(row.in_progress_requests),
            assigned: parseInt(row.assigned_requests)
        }));

        // Format pie chart data for status
        const formattedStatusData = pieChartData.rows.map((row, index) => ({
            status: row.status,
            count: parseInt(row.count),
            fill: `var(--color-status-${index + 1})`
        }));

        // Format pie chart data for districts
        const formattedDistrictData = districtData.rows.map((row, index) => ({
            district: row.district,
            count: parseInt(row.count),
            fill: `var(--color-district-${index + 1})`
        }));

        // Format pie chart data for complaint types
        const formattedComplaintTypeData = complaintTypeData.rows.map((row, index) => ({
            type: row.type,
            count: parseInt(row.count),
            fill: `var(--color-type-${index + 1})`
        }));

        const trendPercentage = trendData.rows.length > 0 ? trendData.rows[0].trend_percentage : 0;

        return NextResponse.json({
            lineChart: {
                data: formattedLineData,
                total: formattedLineData.reduce((acc, curr) => acc + curr.total, 0),
                completed: formattedLineData.reduce((acc, curr) => acc + curr.completed, 0),
                pending: formattedLineData.reduce((acc, curr) => acc + curr.pending, 0),
                inProgress: formattedLineData.reduce((acc, curr) => acc + curr.inProgress, 0),
                assigned: formattedLineData.reduce((acc, curr) => acc + curr.assigned, 0)
            },
            pieChart: {
                status: formattedStatusData,
                districts: formattedDistrictData,
                complaintTypes: formattedComplaintTypeData
            },
            trend: trendPercentage
        }, { status: 200 });

    } catch (error) {
        console.error('Error fetching chart data:', error);
        return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 });
    } finally {
        client.release();
    }
}
