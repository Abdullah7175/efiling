import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

export async function POST(request) {
    // SECURITY: Require authentication
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }
    try {
        const { action, signatureId, userId } = await request.json();
        
        if (!action || !signatureId || !userId) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }
        
        // SECURITY: Users can only manage their own signatures (unless admin)
        const isAdmin = session.user.role && [1, 2].includes(parseInt(session.user.role));
        if (!isAdmin) {
            // Check if userId matches session user or is an efiling_users.id that maps to session user
            const client = await connectToDatabase();
            try {
                const efilingUserCheck = await client.query(
                    `SELECT user_id FROM efiling_users WHERE id = $1`,
                    [userId]
                );
                if (efilingUserCheck.rows.length > 0) {
                    const mappedUserId = efilingUserCheck.rows[0].user_id;
                    if (parseInt(mappedUserId) !== parseInt(session.user.id)) {
                        await client.release();
                        return NextResponse.json(
                            { error: 'Forbidden - You can only manage your own signatures' },
                            { status: 403 }
                        );
                    }
                } else {
                    // userId might be users.id directly
                    if (parseInt(userId) !== parseInt(session.user.id)) {
                        await client.release();
                        return NextResponse.json(
                            { error: 'Forbidden - You can only manage your own signatures' },
                            { status: 403 }
                        );
                    }
                }
            } catch (e) {
                await client.release();
                return NextResponse.json(
                    { error: 'Forbidden - You can only manage your own signatures' },
                    { status: 403 }
                );
            }
        }

        const client = await connectToDatabase();

        if (action === 'activate') {
            // Deactivate all signatures for the user
            await client.query(
                `UPDATE efiling_user_signatures SET is_active = false WHERE user_id = $1`,
                [userId]
            );

            // Activate the selected signature
            const result = await client.query(
                `UPDATE efiling_user_signatures 
                 SET is_active = true 
                 WHERE id = $1 AND user_id = $2
                 RETURNING *`,
                [signatureId, userId]
            );

            if (result.rows.length === 0) {
                await client.release();
                return NextResponse.json(
                    { error: 'Signature not found' },
                    { status: 404 }
                );
            }

            await client.release();
            return NextResponse.json({
                success: true,
                message: 'Signature activated successfully',
                signature: result.rows[0]
            });

        } else if (action === 'deactivate') {
            // Deactivate the selected signature
            const result = await client.query(
                `UPDATE efiling_user_signatures 
                 SET is_active = false 
                 WHERE id = $1 AND user_id = $2
                 RETURNING *`,
                [signatureId, userId]
            );

            if (result.rows.length === 0) {
                await client.release();
                return NextResponse.json(
                    { error: 'Signature not found' },
                    { status: 404 }
                );
            }

            await client.release();
            return NextResponse.json({
                success: true,
                message: 'Signature deactivated successfully',
                signature: result.rows[0]
            });

        } else if (action === 'delete') {
            // Delete the signature
            const result = await client.query(
                `DELETE FROM efiling_user_signatures 
                 WHERE id = $1 AND user_id = $2
                 RETURNING *`,
                [signatureId, userId]
            );

            if (result.rows.length === 0) {
                await client.release();
                return NextResponse.json(
                    { error: 'Signature not found' },
                    { status: 404 }
                );
            }

            await client.release();
            return NextResponse.json({
                success: true,
                message: 'Signature deleted successfully'
            });

        } else {
            await client.release();
            return NextResponse.json(
                { error: 'Invalid action' },
                { status: 400 }
            );
        }

    } catch (error) {
        console.error('Error managing signature:', error);
        return NextResponse.json(
            { error: 'Failed to manage signature' },
            { status: 500 }
        );
    }
}

export async function GET(request) {
    try {
        // SECURITY: Require authentication
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }
        
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        
        if (!userId) {
            return NextResponse.json(
                { error: 'User ID is required' },
                { status: 400 }
            );
        }
        
        // SECURITY: Users can only view their own signatures (unless admin)
        const isAdmin = session.user.role && [1, 2].includes(parseInt(session.user.role));
        if (!isAdmin && parseInt(userId) !== parseInt(session.user.id)) {
            // For efiling users, need to check if userId is efiling_users.id
            // If so, map it to users.id for comparison
            const client = await connectToDatabase();
            try {
                const efilingUserCheck = await client.query(
                    `SELECT user_id FROM efiling_users WHERE id = $1`,
                    [userId]
                );
                if (efilingUserCheck.rows.length > 0) {
                    const mappedUserId = efilingUserCheck.rows[0].user_id;
                    if (parseInt(mappedUserId) !== parseInt(session.user.id)) {
                        await client.release();
                        return NextResponse.json(
                            { error: 'Forbidden - You can only view your own signatures' },
                            { status: 403 }
                        );
                    }
                } else {
                    // userId might be users.id directly
                    if (parseInt(userId) !== parseInt(session.user.id)) {
                        await client.release();
                        return NextResponse.json(
                            { error: 'Forbidden - You can only view your own signatures' },
                            { status: 403 }
                        );
                    }
                }
            } catch (e) {
                await client.release();
                return NextResponse.json(
                    { error: 'Forbidden - You can only view your own signatures' },
                    { status: 403 }
                );
            }
        }

        const client = await connectToDatabase();
        
        // Get all signatures for the user
        const result = await client.query(
            `SELECT * FROM efiling_user_signatures 
             WHERE user_id = $1 
             ORDER BY signature_type, created_at DESC`,
            [userId]
        );

        await client.release();

        return NextResponse.json({
            success: true,
            signatures: result.rows
        });

    } catch (error) {
        console.error('Error fetching signatures:', error);
        return NextResponse.json(
            { error: 'Failed to fetch signatures' },
            { status: 500 }
        );
    }
}
