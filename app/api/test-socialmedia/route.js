import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
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
    try {
        client = await connectToDatabase();
        
        // Handle build phase gracefully
        if (!client) {
            return NextResponse.json({ 
                success: false, 
                error: 'Database connection unavailable during build phase',
                buildPhase: true
            }, { status: 503 });
        }
        
        // Test if socialmediaperson table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'socialmediaperson'
            );
        `);
        
        const tableExists = tableCheck.rows[0].exists;
        
        if (!tableExists) {
            return NextResponse.json({ 
                success: false, 
                error: 'socialmediaperson table does not exist' 
            });
        }
        
        // Get count of socialmediaperson records
        const countResult = await client.query('SELECT COUNT(*) as count FROM socialmediaperson');
        const count = countResult.rows[0].count;
        
        // Get sample data (first 5 records)
        const sampleResult = await client.query('SELECT id, name, email, role FROM socialmediaperson LIMIT 5');
        const sampleData = sampleResult.rows;
        
        return NextResponse.json({ 
            success: true, 
            message: 'socialmediaperson table exists',
            count: count,
            sampleData: sampleData
        });
    } catch (error) {
        // Don't log errors during build phase
        if (!error.message?.includes('build phase')) {
            console.error('Test error:', error);
        }
        return NextResponse.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    } finally {
        if (client && client.release) {
            client.release();
        }
    }
} 