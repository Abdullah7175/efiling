import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(request, { params }) {
    let client;
    try {
        // SECURITY: Require authentication
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        
        if (!id) {
            return NextResponse.json(
                { error: 'File ID is required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();

        // SECURITY: Check file access
        const { checkFileAccess } = await import('@/lib/authMiddleware');
        const userId = parseInt(session.user.id);
        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        
        const hasAccess = await checkFileAccess(client, parseInt(id), userId, isAdmin);
        if (!hasAccess) {
            return NextResponse.json(
                { error: 'Forbidden - You do not have access to this file' },
                { status: 403 }
            );
        }
        
        // Get all active attachments for the file
        const result = await client.query(`
            SELECT 
                id,
                file_id,
                file_name,
                file_size,
                file_type,
                file_url,
                uploaded_by,
                uploaded_at,
                is_active
            FROM efiling_file_attachments 
            WHERE file_id = $1 AND is_active = true
            ORDER BY uploaded_at DESC
        `, [id]);
        
        return NextResponse.json(result.rows);
        
    } catch (error) {
        console.error('Error fetching attachments:', error);
        return NextResponse.json(
            { error: 'Failed to fetch attachments' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}
