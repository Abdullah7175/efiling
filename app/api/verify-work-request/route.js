import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAuth } from '@/lib/authMiddleware';

export async function POST(req) {
    // SECURITY: Require authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    try {
        const { workRequestId, contactNumber } = await req.json();
        
        if (!workRequestId || !contactNumber) {
            return NextResponse.json(
                { valid: false, message: 'Work request ID and contact number are required' },
                { status: 400 }
            );
        }

        const client = await connectToDatabase();
        const query = `
            SELECT id FROM work_requests 
            WHERE id = $1 AND contact_number = $2
        `;
        
        const { rows } = await client.query(query, [workRequestId, contactNumber]);
        
        if (rows.length === 0) {
            return NextResponse.json(
                { valid: false, message: 'No matching work request found with these details' },
                { status: 404 }
            );
        }

        return NextResponse.json({ valid: true });
    } catch (error) {
        console.error('Verification error:', error);
        return NextResponse.json(
            { valid: false, message: 'Failed to verify work request' },
            { status: 500 }
        );
    }
}