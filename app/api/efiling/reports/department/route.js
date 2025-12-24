import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.role || ![1,2].includes(parseInt(session.user.role))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const dateRange = searchParams.get('dateRange') || '30';
        const performance = searchParams.get('performance') || 'all';

        client = await connectToDatabase();
        
        // Calculate date threshold based on dateRange
        const daysAgo = parseInt(dateRange);
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - daysAgo);
        
        // Get department performance data with enhanced metrics
        const query = `
            WITH department_stats AS (
                SELECT 
                    d.id as department_id,
                    d.name as department_name,
                    d.code as department_code,
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
                WHERE d.is_active = true
                GROUP BY d.id, d.name, d.code, d.is_active
            )
            SELECT 
                department_id,
                department_name,
                department_code,
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
        const departments = result.rows.map(row => ({
            id: row.department_id,
            name: row.department_name,
            code: row.department_code,
            is_active: row.is_active,
            totalFiles: parseInt(row.total_files),
            completedFiles: parseInt(row.completed_files),
            pendingFiles: parseInt(row.pending_files),
            overdueFiles: parseInt(row.overdue_files),
            avgProcessingTime: Math.round(parseFloat(row.avg_processing_time) || 0),
            activeUsers: parseInt(row.active_users),
            slaCompliance: parseInt(row.sla_compliance),
            performanceScore: parseInt(row.sla_compliance),
            trend: Math.random() > 0.5 ? 'up' : 'down' // Placeholder for trend calculation
        }));

        // Filter by performance if specified
        let filteredDepartments = departments;
        if (performance !== 'all') {
            filteredDepartments = departments.filter(dept => {
                switch (performance) {
                    case 'excellent':
                        return dept.performanceScore >= 90;
                    case 'good':
                        return dept.performanceScore >= 75 && dept.performanceScore < 90;
                    case 'average':
                        return dept.performanceScore >= 60 && dept.performanceScore < 75;
                    case 'poor':
                        return dept.performanceScore < 60;
                    default:
                        return true;
                }
            });
        }

        // Calculate summary statistics
        const summary = {
            totalDepartments: filteredDepartments.length,
            totalUsers: filteredDepartments.reduce((sum, dept) => sum + dept.activeUsers, 0),
            averagePerformance: filteredDepartments.length > 0 
                ? Math.round(filteredDepartments.reduce((sum, dept) => sum + dept.performanceScore, 0) / filteredDepartments.length)
                : 0,
            activeFiles: filteredDepartments.reduce((sum, dept) => sum + dept.pendingFiles, 0)
        };

        // Get top performers and departments needing attention
        const topPerformers = departments
            .filter(dept => dept.performanceScore >= 75)
            .sort((a, b) => b.performanceScore - a.performanceScore)
            .slice(0, 5);

        const needsAttention = departments
            .filter(dept => dept.performanceScore < 60)
            .sort((a, b) => a.performanceScore - b.performanceScore)
            .slice(0, 5);
        
        return NextResponse.json({
            success: true,
            summary,
            departments: filteredDepartments,
            topPerformers,
            needsAttention,
            dateRange: daysAgo,
            filters: { dateRange, performance }
        });
        
    } catch (error) {
        console.error('Error fetching department report:', error);
        return NextResponse.json(
            { error: 'Failed to fetch department report data' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}
