import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    let client;
    try {
        const { searchParams } = new URL(request.url);
        const dateRange = searchParams.get('dateRange') || '30';
        const includeInactive = searchParams.get('includeInactive') === 'true';

        client = await connectToDatabase();
        
        // Calculate date threshold based on dateRange
        const daysAgo = parseInt(dateRange);
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - daysAgo);
        
        // Get department performance data
        const query = `
            WITH department_stats AS (
                SELECT 
                    d.id as department_id,
                    d.name as department_name,
                    d.is_active,
                    COUNT(DISTINCT f.id) as total_files,
                    COUNT(DISTINCT CASE WHEN f.status = 'completed' THEN f.id END) as completed_files,
                    COUNT(DISTINCT CASE WHEN f.status = 'pending' OR f.status = 'in_progress' THEN f.id END) as pending_files,
                    COUNT(DISTINCT CASE WHEN f.status = 'overdue' THEN f.id END) as overdue_files,
                    AVG(EXTRACT(EPOCH FROM (f.updated_at - f.created_at)) / 86400) as avg_processing_days,
                    COUNT(DISTINCT eu.id) as active_users,
                    CASE 
                        WHEN COUNT(DISTINCT f.id) > 0 THEN 
                            ROUND(
                                (COUNT(DISTINCT CASE WHEN f.status = 'completed' THEN f.id END)::float / 
                                 COUNT(DISTINCT f.id)::float) * 100
                            )
                        ELSE 0 
                    END as completion_rate
                FROM efiling_departments d
                LEFT JOIN efiling_files f ON d.id = f.department_id 
                    AND f.created_at >= $1
                LEFT JOIN efiling_users eu ON d.id = eu.department_id 
                    AND eu.is_active = true
                WHERE ${includeInactive ? '1=1' : 'd.is_active = true'}
                GROUP BY d.id, d.name, d.is_active
            )
            SELECT 
                department_id,
                department_name,
                is_active,
                COALESCE(total_files, 0) as total_files,
                COALESCE(completed_files, 0) as completed_files,
                COALESCE(pending_files, 0) as pending_files,
                COALESCE(overdue_files, 0) as overdue_files,
                COALESCE(avg_processing_days, 0) as avg_processing_time,
                COALESCE(active_users, 0) as active_users,
                COALESCE(completion_rate, 0) as sla_compliance
            FROM department_stats
            ORDER BY total_files DESC, completion_rate DESC
        `;
        
        const result = await client.query(query, [dateThreshold]);
        
        // Transform the data to match frontend expectations
        const performance = result.rows.map(row => ({
            department_id: row.department_id,
            department_name: row.department_name,
            is_active: row.is_active,
            totalFiles: parseInt(row.total_files),
            completedFiles: parseInt(row.completed_files),
            pendingFiles: parseInt(row.pending_files),
            overdueFiles: parseInt(row.overdue_files),
            avgProcessingTime: parseFloat(row.avg_processing_time) || 0,
            activeUsers: parseInt(row.active_users),
            slaCompliance: parseInt(row.sla_compliance)
        }));
        
        return NextResponse.json({
            success: true,
            performance,
            dateRange: daysAgo,
            totalDepartments: performance.length
        });
        
    } catch (error) {
        console.error('Error fetching department performance:', error);
        return NextResponse.json(
            { error: 'Failed to fetch department performance data' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}
