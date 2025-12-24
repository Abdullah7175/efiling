import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request) {
    let client;
    try {
        const body = await request.json();
        const { current_password, new_password } = body;

        if (!current_password || !new_password) {
            return NextResponse.json(
                { error: 'Current password and new password are required' },
                { status: 400 }
            );
        }

        if (new_password.length < 6) {
            return NextResponse.json(
                { error: 'New password must be at least 6 characters long' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();
        
        // For now, we'll use a simple approach
        // In a real application, you'd want to verify the current user's session
        // and get their user ID from the session
        
        // Hash the new password
        const hashedPassword = await bcrypt.hash(new_password, 12);
        
        // Update the password in the database
        // Note: This is a simplified version - you'll need to implement proper user authentication
        const query = `
            UPDATE users 
            SET password = $1, updated_date = CURRENT_TIMESTAMP 
            WHERE id = $2
        `;
        
        // For demo purposes, using user ID 1
        // In production, get this from the authenticated session
        const result = await client.query(query, [hashedPassword, 1]);
        
        if (result.rowCount === 0) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Password updated successfully'
        });

    } catch (error) {
        console.error('Error updating password:', error);
        return NextResponse.json(
            { error: 'Failed to update password' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}
