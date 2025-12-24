import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

export async function POST(request) {
    try {
        const { email, userId } = await request.json();
        
        if (!email || !userId) {
            return NextResponse.json(
                { error: 'Email and User ID are required' },
                { status: 400 }
            );
        }

        const client = await connectToDatabase();
        
        try {
            // First, check if the user has a registered google_email in efiling_users table
            const efilingUserResult = await client.query(
                `SELECT google_email FROM efiling_users WHERE user_id = $1`,
                [userId]
            );

            if (efilingUserResult.rows.length > 0) {
                const efilingUser = efilingUserResult.rows[0];
                
                // If user has a registered google_email, check if it matches
                if (efilingUser.google_email) {
                    if (efilingUser.google_email.toLowerCase() === email.toLowerCase()) {
                        // Email matches, proceed with authentication
                        await client.release();
                        
                        // Generate a verification token
                        const verificationToken = `google_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                        return NextResponse.json({
                            success: true,
                            message: 'Google Auth verification successful',
                            verificationToken: verificationToken,
                            verifiedEmail: email,
                            emailRegistered: true
                        });
                    } else {
                        // Email doesn't match the registered one
                        await client.release();
                        return NextResponse.json(
                            { 
                                error: 'Email mismatch. Please use your registered Google email for authentication.',
                                registeredEmail: efilingUser.google_email ? 
                                    efilingUser.google_email.replace(/(.{3}).*(@.*)/, '$1***$2') : null
                            },
                            { status: 401 }
                        );
                    }
                } else {
                    // User doesn't have a registered google_email, ask them to register it
                    await client.release();
                    return NextResponse.json(
                        { 
                            error: 'Google email not registered. Please register your Google email first.',
                            needsRegistration: true
                        },
                        { status: 402 }
                    );
                }
            } else {
                // User not found in efiling_users table
                await client.release();
                return NextResponse.json(
                    { error: 'User not found in e-filing system' },
                    { status: 404 }
                );
            }

        } catch (dbError) {
            await client.release();
            console.error('Database error in Google auth:', dbError);
            return NextResponse.json(
                { error: 'Database error occurred' },
                { status: 500 }
            );
        }

    } catch (error) {
        console.error('Google Auth error:', error);
        return NextResponse.json(
            { error: 'Google Auth verification failed' },
            { status: 500 }
        );
    }
}

export async function PUT(request) {
    try {
        const { email, userId } = await request.json();
        
        if (!email || !userId) {
            return NextResponse.json(
                { error: 'Email and User ID are required' },
                { status: 400 }
            );
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: 'Invalid email format' },
                { status: 400 }
            );
        }

        const client = await connectToDatabase();
        
        try {
            // Check if user exists in efiling_users table
            const userCheck = await client.query(
                `SELECT id FROM efiling_users WHERE user_id = $1`,
                [userId]
            );

            if (userCheck.rows.length === 0) {
                await client.release();
                return NextResponse.json(
                    { error: 'User not found in e-filing system' },
                    { status: 404 }
                );
            }

            // Check if this email is already registered by another user
            const existingEmailCheck = await client.query(
                `SELECT user_id FROM efiling_users WHERE google_email = $1 AND user_id != $2`,
                [email, userId]
            );

            if (existingEmailCheck.rows.length > 0) {
                await client.release();
                return NextResponse.json(
                    { error: 'This Google email is already registered by another user' },
                    { status: 409 }
                );
            }

            // Update the google_email for the user
            await client.query(
                `UPDATE efiling_users SET google_email = $1, updated_at = NOW() WHERE user_id = $2`,
                [email, userId]
            );

            await client.release();

            return NextResponse.json({
                success: true,
                message: 'Google email registered successfully',
                registeredEmail: email
            });

        } catch (dbError) {
            await client.release();
            console.error('Database error in Google email registration:', dbError);
            return NextResponse.json(
                { error: 'Database error occurred' },
                { status: 500 }
            );
        }

    } catch (error) {
        console.error('Google email registration error:', error);
        return NextResponse.json(
            { error: 'Failed to register Google email' },
            { status: 500 }
        );
    }
}
