import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { logAction } from '@/lib/actionLogger';

// PUT - Update a comment
export async function PUT(request, { params }) {
    const { id: fileId, commentId } = await params;
    let client;

    try {
        const body = await request.json();
        const { text, user_id } = body;

        if (!text || !user_id) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();

        // Check if user can edit this comment
        const commentCheck = await client.query(`
            SELECT user_id FROM efiling_document_comments 
            WHERE id = $1 AND file_id = $2 AND is_active = TRUE
        `, [commentId, fileId]);

        if (commentCheck.rows.length === 0) {
            return NextResponse.json(
                { error: 'Comment not found' },
                { status: 404 }
            );
        }

        const comment = commentCheck.rows[0];
        
        // Only the comment creator or superadmin/CEO/Chief IT Officer can edit
        if (comment.user_id !== user_id) {
            // Check if user has special privileges
            const userCheck = await client.query(`
                SELECT role FROM users WHERE id = $1
            `, [user_id]);

            if (!userCheck.rows.length || 
                !['superadmin', 'CEO', 'Chief IT Officer'].includes(userCheck.rows[0].role)) {
                return NextResponse.json(
                    { error: 'Unauthorized to edit this comment' },
                    { status: 403 }
                );
            }
        }

        // Update the comment
        const result = await client.query(`
            UPDATE efiling_document_comments 
            SET text = $1, edited = TRUE, edited_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND file_id = $3
            RETURNING *
        `, [text, commentId, fileId]);

        // Log the action
        await logAction({
            user_id,
            file_id: fileId,
            action_type: 'EDIT_COMMENT',
            details: `Edited comment ${commentId}`,
            ip_address: request.headers.get('x-forwarded-for') || 'unknown'
        });

        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating comment:', error);
        return NextResponse.json(
            { error: 'Failed to update comment' },
            { status: 500 }
        );
    } finally {
        if (client) {
            client.release();
        }
    }
}

// DELETE - Delete a comment (soft delete)
export async function DELETE(request, { params }) {
    const { id: fileId, commentId } = await params;
    let client;

    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json(
                { error: 'User ID required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();

        // Check if user can delete this comment
        const commentCheck = await client.query(`
            SELECT user_id FROM efiling_document_comments 
            WHERE id = $1 AND file_id = $2 AND is_active = TRUE
        `, [commentId, fileId]);

        if (commentCheck.rows.length === 0) {
            return NextResponse.json(
                { error: 'Comment not found' },
                { status: 404 }
            );
        }

        const comment = commentCheck.rows[0];
        
        // Only the comment creator or superadmin/CEO/Chief IT Officer can delete
        if (comment.user_id !== userId) {
            // Check if user has special privileges
            const userCheck = await client.query(`
                SELECT role FROM users WHERE id = $1
            `, [userId]);

            if (!userCheck.rows.length || 
                !['superadmin', 'CEO', 'Chief IT Officer'].includes(userCheck.rows[0].role)) {
                return NextResponse.json(
                    { error: 'Unauthorized to delete this comment' },
                    { status: 403 }
                );
            }
        }

        // Soft delete the comment
        const result = await client.query(`
            UPDATE efiling_document_comments 
            SET is_active = FALSE
            WHERE id = $1 AND file_id = $2
            RETURNING *
        `, [commentId, fileId]);

        // Log the action
        await logAction({
            user_id: userId,
            file_id: fileId,
            action_type: 'DELETE_COMMENT',
            details: `Deleted comment ${commentId}`,
            ip_address: request.headers.get('x-forwarded-for') || 'unknown'
        });

        return NextResponse.json({ success: true, message: 'Comment deleted successfully' });
    } catch (error) {
        console.error('Error deleting comment:', error);
        return NextResponse.json(
            { error: 'Failed to delete comment' },
            { status: 500 }
        );
    } finally {
        if (client) {
            client.release();
        }
    }
}
