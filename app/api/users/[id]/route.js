import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(request, { params }) {
    let client;
    try {
        const { id } = await params;
        
        if (!id || id === 'undefined' || id === 'null') {
            return NextResponse.json(
                { error: 'User ID is required' },
                { status: 400 }
            );
        }

        // Validate that id is a number
        const userId = parseInt(id);
        if (isNaN(userId)) {
            return NextResponse.json(
                { error: 'Invalid user ID format' },
                { status: 400 }
            );
        }

        // Get session to ensure user is authenticated
        const session = await auth();
        if (!session || !session.user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // SECURITY: IDOR Fix - Check ownership or admin role
        const sessionUserId = parseInt(session.user.id);
        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        
        if (sessionUserId !== userId && !isAdmin) {
            return NextResponse.json(
                { error: 'Forbidden - You can only access your own data' },
                { status: 403 }
            );
        }

        client = await connectToDatabase();
        
        // Fetch user from database
        const query = `
            SELECT id, name, email, contact_number, image, role, created_date, updated_date
            FROM users 
            WHERE id = $1
        `;
        
        const result = await client.query(query, [userId]);
        
        if (result.rows.length === 0) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        const user = result.rows[0];
        
        // Remove sensitive information
        delete user.password;
        delete user.session_token;
        
        return NextResponse.json(user);
        
    } catch (error) {
        console.error('Error fetching user:', error);
        return NextResponse.json(
            { error: 'Failed to fetch user' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}
