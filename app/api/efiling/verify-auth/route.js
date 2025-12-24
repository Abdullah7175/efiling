import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { logAction } from '@/lib/actionLogger';
import { auth } from '@/auth';

export async function POST(request) {
    let client;
    try {
        // CRITICAL: Call auth() BEFORE reading request body to avoid "body already consumed" error
        let session;
        let sessionUserId;
        try {
            session = await auth();
            sessionUserId = session?.user?.id;
        } catch (authError) {
            console.error('Auth error in verify-auth:', authError);
            // Continue without session - userId might be provided directly
        }
        
        const { userId, code } = await request.json();
        
        if (!userId || !code) {
            return NextResponse.json(
                { error: 'User ID and code are required' },
                { status: 400 }
            );
        }
        
        // Always use WhatsApp method
        const method = 'whatsapp';

        client = await connectToDatabase();
        
        // userId might be users.id (from session) or efiling_users.id
        // OTP is stored in efiling_otp_codes.user_id as varchar(255) with efiling_users.id as string
        // We need to always convert users.id to efiling_users.id first
        
        let efilingUserId = userId;
        
        // Convert userId to number for comparison
        const userIdNum = typeof userId === 'string' ? parseInt(userId) : userId;
        const sessionUserIdNum = sessionUserId ? (typeof sessionUserId === 'string' ? parseInt(sessionUserId) : sessionUserId) : null;
        
        // If userId matches session user.id, it's users.id - need to convert to efiling_users.id
        // Also check if userId is a number that matches sessionUserId
        if (sessionUserIdNum && (userIdNum === sessionUserIdNum || String(userId) === String(sessionUserId))) {
            // userId is users.id, need to find efiling_users.id
            const efilingUserResult = await client.query(`
                SELECT id FROM efiling_users 
                WHERE user_id = $1 AND is_active = true
                ORDER BY id DESC
                LIMIT 1
            `, [userIdNum || sessionUserIdNum]);
            
            if (efilingUserResult.rows.length > 0) {
                efilingUserId = efilingUserResult.rows[0].id;
                console.log('Converted users.id to efiling_users.id:', { 
                    usersId: userId, 
                    efilingUserId: efilingUserId,
                    efilingUserIdType: typeof efilingUserId
                });
            } else {
                console.log('No efiling_users record found for users.id:', userId);
                return NextResponse.json(
                    { error: 'E-filing user not found' },
                    { status: 404 }
                );
            }
        } else {
            // userId might already be efiling_users.id, but let's verify it exists
            const verifyEfilingUser = await client.query(`
                SELECT id FROM efiling_users 
                WHERE id = $1 AND is_active = true
            `, [userIdNum || userId]);
            
            if (verifyEfilingUser.rows.length === 0) {
                // Try to find by user_id in case userId is actually users.id
                const tryUserLookup = await client.query(`
                    SELECT id FROM efiling_users 
                    WHERE user_id = $1 AND is_active = true
                    ORDER BY id DESC
                    LIMIT 1
                `, [userIdNum || userId]);
                
                if (tryUserLookup.rows.length > 0) {
                    efilingUserId = tryUserLookup.rows[0].id;
                    console.log('Found efiling_users.id by user_id lookup:', {
                        providedUserId: userId,
                        foundEfilingUserId: efilingUserId
                    });
                } else {
                    console.log('Could not find efiling_users record for userId:', userId);
                    // Last attempt: try as string if it was a number
                    if (userIdNum) {
                        const tryStringLookup = await client.query(`
                            SELECT id FROM efiling_users 
                            WHERE id = $1 OR user_id = $1 AND is_active = true
                            ORDER BY id DESC
                            LIMIT 1
                        `, [String(userIdNum)]);
                        
                        if (tryStringLookup.rows.length > 0) {
                            efilingUserId = tryStringLookup.rows[0].id;
                            console.log('Found efiling_users.id by string lookup:', {
                                providedUserId: userId,
                                foundEfilingUserId: efilingUserId
                            });
                        }
                    }
                }
            } else {
                // It exists as efiling_users.id, use it directly
                efilingUserId = verifyEfilingUser.rows[0].id;
                console.log('UserId is already efiling_users.id:', efilingUserId);
            }
        }
        
        // Convert efilingUserId to string since efiling_otp_codes.user_id is varchar(255)
        const efilingUserIdStr = String(efilingUserId);
        
        console.log('[OTP VERIFY DEBUG] Looking up OTP:', {
            originalUserId: userId,
            efilingUserId: efilingUserId,
            efilingUserIdStr: efilingUserIdStr,
            method: method,
            sessionUserId: sessionUserId
        });
        
        // Look up OTP using efiling_users.id (as string)
        const result = await client.query(`
            SELECT otp_code, expires_at, created_at
            FROM efiling_otp_codes 
            WHERE user_id = $1 AND method = $2 AND expires_at > NOW()
            ORDER BY created_at DESC 
            LIMIT 1
        `, [efilingUserIdStr, method]);
        
        console.log('[OTP VERIFY DEBUG] OTP lookup result:', {
            found: result.rows.length > 0,
            expiresAt: result.rows[0]?.expires_at,
            createdAt: result.rows[0]?.created_at
        });
        
        if (result.rows.length === 0) {
            console.log('OTP verification failed - no valid OTP found:', {
                userId,
                efilingUserId,
                method,
                sessionUserId
            });
            return NextResponse.json(
                { error: 'Invalid or expired code' },
                { status: 400 }
            );
        }
        
        const storedCode = result.rows[0].otp_code;
        
        console.log('OTP verification attempt:', {
            userId,
            efilingUserId,
            method,
            providedCode: code,
            storedCode: storedCode.substring(0, 2) + '****' // Mask for security
        });
        
        // Check if current user is admin (for admin fallback verification)
        const isAdmin = session?.user?.role && [1, 2].includes(parseInt(session.user.role));
        
        // SECURITY: Log verification attempt for admins (server-side only)
        if (isAdmin) {
            console.log(`[ADMIN OTP VERIFY] Admin ${session.user.id} (${session.user.name}) verifying OTP for user ${efilingUserId}`);
            console.log(`[ADMIN OTP VERIFY] Provided code: ${code}, Stored code: ${storedCode}, Match: ${code === storedCode}`);
        }
        
        // Verify the code
        if (code !== storedCode) {
            console.log('OTP verification failed - code mismatch');
            
            // SECURITY: For admins, provide more detailed logging (server-side only)
            if (isAdmin) {
                console.log(`[ADMIN OTP VERIFY] Code mismatch. Expected: ${storedCode}, Provided: ${code}`);
            }
            
            return NextResponse.json(
                { error: 'Invalid code' },
                { status: 400 }
            );
        }
        
        console.log('OTP verification successful for efiling user:', efilingUserId);
        
        // Delete the used OTP (user_id is varchar, so use string)
        await client.query(`
            DELETE FROM efiling_otp_codes 
            WHERE user_id = $1 AND method = $2
        `, [efilingUserIdStr, method]);
        
        // Log the successful authentication
        try {
            await logAction(request, 'VERIFY_AUTH', 'efiling_auth', {
                entityId: efilingUserId,
                entityName: `User ${efilingUserId}`,
                details: { method, originalUserId: userId }
            });
        } catch (logError) {
            console.error('Error logging action:', logError);
            // Don't fail if logging fails
        }
        
        return NextResponse.json({
            success: true,
            message: 'Authentication successful'
        });
        
    } catch (error) {
        console.error('Error verifying authentication:', error);
        return NextResponse.json(
            { error: 'Authentication failed' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}
