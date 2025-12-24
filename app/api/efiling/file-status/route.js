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
    let client;
    try {
        client = await connectToDatabase();

        // Check if the efiling_file_status table exists, if not create it with default values
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS efiling_file_status (
                    id SERIAL PRIMARY KEY,
                    code VARCHAR(50) UNIQUE NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    description TEXT,
                    color VARCHAR(20) DEFAULT '#6B7280',
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Insert default statuses if they don't exist
            await client.query(`
                INSERT INTO efiling_file_status (code, name, description, color) 
                VALUES 
                    ('DRAFT', 'Draft', 'File is in draft mode and can be edited', '#6B7280'),
                    ('IN_PROGRESS', 'In Progress', 'File is being processed', '#3B82F6'),
                    ('PENDING_APPROVAL', 'Pending Approval', 'File is waiting for approval', '#F59E0B'),
                    ('APPROVED', 'Approved', 'File has been approved', '#10B981'),
                    ('REJECTED', 'Rejected', 'File has been rejected', '#EF4444'),
                    ('COMPLETED', 'Completed', 'File workflow is complete', '#8B5CF6')
                ON CONFLICT (code) DO NOTHING
            `);
        } catch (tableError) {
            console.error('Error creating/updating file status table:', tableError);
        }

        // Fetch all active statuses
        const result = await client.query(`
            SELECT * FROM efiling_file_status 
            WHERE is_active = true 
            ORDER BY id
        `);

        return NextResponse.json(result.rows);
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
}
