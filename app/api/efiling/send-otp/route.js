import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { logAction } from '@/lib/actionLogger';
import { sendOTPViaWhatsApp } from '@/lib/whatsappService';
import { auth } from '@/auth';

export async function POST(request) {
    let client;
    let userId;
    const method = 'whatsapp'; // Always use WhatsApp method
    try {
        // Call auth first before reading request body to avoid "body already consumed" error
        let session;
        let sessionUserId;
        try {
            session = await auth();
            sessionUserId = session?.user?.id; // This is users.id
        } catch (authError) {
            console.error('Auth error in send-otp:', authError);
            // Continue without session if auth fails - might be using userId directly
        }
        
        const body = await request.json();
        userId = body.userId;
        
        if (!sessionUserId && !userId) {
            return NextResponse.json(
                { error: 'User authentication required' },
                { status: 401 }
            );
        }

        client = await connectToDatabase();
        
        // Get user's phone number and name from database
        // session.user.id is users.id, so we need to find efiling_users by user_id
        // OR if userId is provided and it's an efiling_users.id, use that
        let userResult;
        if (userId && !sessionUserId) {
            // If userId is provided and no session, assume it's efiling_users.id
            userResult = await client.query(`
                SELECT eu.id, u.name, u.contact_number, u.email
                FROM efiling_users eu
                LEFT JOIN users u ON eu.user_id = u.id
                WHERE eu.id = $1
            `, [userId]);
        } else {
            // Use session user.id (which is users.id) to find efiling_users
            // Get the most recent active efiling_users record for this user
            userResult = await client.query(`
                SELECT eu.id, u.name, u.contact_number, u.email
                FROM efiling_users eu
                LEFT JOIN users u ON eu.user_id = u.id
                WHERE eu.user_id = $1 AND eu.is_active = true
                ORDER BY eu.id DESC
                LIMIT 1
            `, [sessionUserId]);
        }

        if (userResult.rows.length === 0) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        const user = userResult.rows[0];
        
        // Debug: Log what we retrieved
        console.log('Retrieved user data:', {
            efilingUserId: user.id,
            name: user.name,
            contact_number: user.contact_number,
            email: user.email,
            sessionUserId: sessionUserId,
            sessionName: session?.user?.name
        });
        const efilingUserId = user.id; // This is efiling_users.id
        const phoneNumber = user.contact_number;
        // Use session name if available (it's more reliable), otherwise fall back to database name
        const userName = session?.user?.name || user.name || 'User';

        if (!phoneNumber) {
            return NextResponse.json(
                { error: 'Phone number not found. Please update your profile with a contact number.' },
                { status: 400 }
            );
        }

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        
        // Store OTP in database
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS efiling_otp_codes (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    otp_code VARCHAR(6) NOT NULL,
                    method VARCHAR(50) NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(user_id, method)
                )
            `);
        } catch (tableError) {
            // Table might already exist, continue
            console.log('OTP table check:', tableError.message);
        }

        await client.query(`
            INSERT INTO efiling_otp_codes (user_id, otp_code, method, expires_at, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (user_id, method) 
            DO UPDATE SET 
                otp_code = $2, 
                expires_at = $4, 
                created_at = NOW()
        `, [efilingUserId, otpCode, method, expiresAt]);
        
        // Check if current user is admin (for admin fallback when WhatsApp fails)
        const isAdmin = session?.user?.role && [1, 2].includes(parseInt(session.user.role));
        console.log('[OTP DEBUG] Admin check:', {
            hasSession: !!session,
            userRole: session?.user?.role,
            isAdmin: isAdmin,
            sessionUserId: sessionUserId
        });
        
        // Send OTP via WhatsApp
        try {
            console.log(`Attempting to send OTP ${otpCode} to ${phoneNumber} via WhatsApp...`);
            const whatsappResult = await sendOTPViaWhatsApp(phoneNumber, otpCode, userName);
            
            if (!whatsappResult.success) {
                console.error('WhatsApp OTP send failed:', whatsappResult.error);
                
                // SECURITY: Log OTP for admin users only (server-side only, never exposed to browser)
                if (isAdmin) {
                    console.log(`[ADMIN OTP LOG] WhatsApp failed. OTP for user ${efilingUserId} (${userName}): ${otpCode}`);
                    console.log(`[ADMIN OTP LOG] User can verify this OTP manually. Expires at: ${expiresAt.toISOString()}`);
                }
                
                // Still store OTP in database even if WhatsApp fails
                // Return error but allow manual OTP entry for testing
                return NextResponse.json({
                    success: false,
                    error: whatsappResult.error || 'Failed to send OTP via WhatsApp',
                    message: 'OTP generated but WhatsApp delivery failed. Please try again or contact support.',
                    // Include OTP in development mode for testing
                    ...(process.env.NODE_ENV === 'development' && { otpCode: otpCode })
                }, { status: 500 });
            }
            
            console.log(`OTP ${otpCode} sent to user ${efilingUserId} (${phoneNumber}) via WhatsApp`);
        } catch (whatsappError) {
            console.error('Exception while sending WhatsApp OTP:', whatsappError);
            // Log the full error for debugging
            console.error('WhatsApp error details:', {
                message: whatsappError.message,
                stack: whatsappError.stack,
                phoneNumber: phoneNumber,
                otpCode: otpCode
            });
            
            // SECURITY: Log OTP for admin users only (server-side only, never exposed to browser)
            if (isAdmin) {
                console.log(`[ADMIN OTP LOG] WhatsApp exception. OTP for user ${efilingUserId} (${userName}): ${otpCode}`);
                console.log(`[ADMIN OTP LOG] User can verify this OTP manually. Expires at: ${expiresAt.toISOString()}`);
            }
            
            // Return error but don't fail completely - OTP is still stored in DB
            return NextResponse.json({
                success: false,
                error: whatsappError.message || 'Failed to send OTP via WhatsApp',
                message: 'OTP was generated but could not be sent. Please try again.',
                // Include OTP in development mode for testing
                ...(process.env.NODE_ENV === 'development' && { otpCode: otpCode })
            }, { status: 500 });
        }
        
        // Log the action
        try {
            await logAction(request, 'SEND_OTP', 'efiling_otp', {
                entityId: efilingUserId,
                entityName: `User ${efilingUserId}`,
                details: { method, phoneNumber: phoneNumber ? phoneNumber.replace(/(\d{4})(\d{3})(\d{4})/, '$1***$3') : 'N/A' }
            });
        } catch (logError) {
            console.error('Error logging action:', logError);
            // Don't fail if logging fails
        }
        
        return NextResponse.json({
            success: true,
            message: 'OTP sent to your WhatsApp number',
            expiresIn: '10 minutes',
            phoneNumber: phoneNumber.replace(/(\d{4})(\d{3})(\d{4})/, '$1***$3') // Mask phone number
        });
        
    } catch (error) {
        console.error('Error sending OTP:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            userId: userId,
            method: method
        });
        return NextResponse.json(
            { 
                error: error.message || 'Failed to send OTP',
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            },
            { status: 500 }
        );
    } finally {
        if (client) {
            try {
                await client.release();
            } catch (releaseError) {
                console.error('Error releasing database client:', releaseError);
            }
        }
    }
}
