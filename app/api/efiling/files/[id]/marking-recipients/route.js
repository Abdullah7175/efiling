import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { getAllowedRecipients } from '@/lib/efilingGeographicRouting';
import { auth } from '@/auth';

/**
 * GET endpoint to fetch users who can receive this file based on marking rules and geography
 * Used by the "Mark To" dropdown UI
 */
export async function GET(request, { params }) {
    let client;
    try {
        const { id } = await params;
        client = await connectToDatabase();

        // Get current user from session
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get file with geographic info
        const fileRes = await client.query(`
            SELECT f.*, eu.id as assigned_user_efiling_id
            FROM efiling_files f
            LEFT JOIN efiling_users eu ON eu.id = f.assigned_to
            WHERE f.id = $1
        `, [id]);

        if (fileRes.rows.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const file = fileRes.rows[0];
        const fromUserEfilingId = file.assigned_to || file.created_by;

        // Get current user's efiling ID
        const currentUserRes = await client.query(`
            SELECT eu.id
            FROM efiling_users eu
            JOIN users u ON eu.user_id = u.id
            WHERE u.id = $1 AND eu.is_active = true
        `, [session.user.id]);

        if (currentUserRes.rows.length === 0) {
            return NextResponse.json({ error: 'Current user not found in e-filing system' }, { status: 403 });
        }

        // Use current user as fromUser if they're the assigned user, otherwise use assigned user
        const effectiveFromUserId = (currentUserRes.rows[0].id === fromUserEfilingId) 
            ? currentUserRes.rows[0].id 
            : fromUserEfilingId;

        // Get allowed recipients using geographic routing
        const allowedRecipients = await getAllowedRecipients(client, {
            fromUserEfilingId: effectiveFromUserId,
            fileId: id,
            fileDepartmentId: file.department_id,
            fileTypeId: file.file_type_id,
            fileDistrictId: file.district_id,
            fileTownId: file.town_id,
            fileDivisionId: file.division_id
        });

        return NextResponse.json({ 
            file_id: id,
            recipients: allowedRecipients,
            count: allowedRecipients.length
        });
    } catch (error) {
        console.error('Error fetching marking recipients:', error);
        return NextResponse.json({ 
            error: error.message || 'Internal server error' 
        }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}

