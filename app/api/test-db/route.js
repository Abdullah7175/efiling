import { NextResponse } from 'next/server';
import { connectToDatabase, checkDbConnection } from '@/lib/db';
import { requireAuth } from '@/lib/authMiddleware';

// Mark as dynamic to prevent static generation
export const dynamic = 'force-dynamic';

export async function GET(request) {
    // SECURITY: Require authentication (debug endpoint should be protected)
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    let client;
    const startTime = Date.now();
    
    try {
        // Skip logging during build phase
        const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' || 
                            process.env.NEXT_PHASE === 'phase-export';
        
        if (!isBuildPhase) {
            console.log('Starting database health check...');
        }
        
        client = await connectToDatabase();
        
        // Handle build phase gracefully
        if (!client) {
            return NextResponse.json({ 
                success: false, 
                error: 'Database connection unavailable during build phase',
                buildPhase: true,
                timing: {
                    totalTime: Date.now() - startTime
                },
                timestamp: new Date().toISOString()
            }, { status: 503 });
        }
        
        const connectionTime = Date.now() - startTime;
        
        // Test multiple queries to ensure database is fully functional
        const queries = [
            { name: 'users', query: 'SELECT COUNT(*) as count FROM users' },
            { name: 'agents', query: 'SELECT COUNT(*) as count FROM agents' },
            { name: 'work_requests', query: 'SELECT COUNT(*) as count FROM work_requests' },
            { name: 'timestamp', query: 'SELECT NOW() as current_time' }
        ];
        
        const results = {};
        let totalQueryTime = 0;
        
        for (const { name, query } of queries) {
            const queryStart = Date.now();
            const result = await client.query(query);
            const queryTime = Date.now() - queryStart;
            totalQueryTime += queryTime;
            
            results[name] = {
                data: result.rows[0],
                queryTime: queryTime
            };
        }
        
        const totalTime = Date.now() - startTime;
        
        return NextResponse.json({ 
            success: true, 
            message: 'Database health check successful',
            timing: {
                connectionTime: connectionTime,
                totalQueryTime: totalQueryTime,
                totalTime: totalTime
            },
            results: results,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        const totalTime = Date.now() - startTime;
        
        // Don't log errors during build phase
        const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build' || 
                            process.env.NEXT_PHASE === 'phase-export';
        
        if (!isBuildPhase) {
            console.error('Database health check error:', {
                error: error.message,
                code: error.code,
                totalTime: totalTime,
                timestamp: new Date().toISOString()
            });
        }
        
        return NextResponse.json({ 
            success: false, 
            error: error.message,
            code: error.code,
            timing: {
                totalTime: totalTime
            },
            timestamp: new Date().toISOString()
        }, { status: 500 });
    } finally {
        if (client && client.release) {
            client.release();
        }
    }
} 