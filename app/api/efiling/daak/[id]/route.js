import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

async function getEfilingUserId(session, client) {
    if (session?.user && [1, 2].includes(parseInt(session.user.role))) {
        const adminEfiling = await client.query(
            'SELECT id FROM efiling_users WHERE user_id = $1 AND is_active = true',
            [session.user.id]
        );
        return adminEfiling.rows[0]?.id || null;
    }
    
    if (session?.user) {
        const efilingUser = await client.query(
            'SELECT id FROM efiling_users WHERE user_id = $1 AND is_active = true',
            [session.user.id]
        );
        
        return efilingUser.rows[0]?.id || null;
    }
    
    return null;
}

// GET - Get single daak
export async function GET(request, { params }) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        client = await connectToDatabase();
        const efilingUserId = await getEfilingUserId(session, client);

        // Get daak with details
        const daakResult = await client.query(
            `SELECT 
                d.*,
                dc.name as category_name,
                dc.code as category_code,
                dc.color as category_color,
                u.designation as created_by_designation,
                u.employee_id as created_by_employee_id,
                dept.name as department_name,
                r.name as role_name,
                (SELECT COUNT(*) FROM efiling_daak_recipients dr WHERE dr.daak_id = d.id) as recipient_count,
                (SELECT COUNT(*) FROM efiling_daak_acknowledgments da WHERE da.daak_id = d.id) as acknowledged_count
             FROM efiling_daak d
             LEFT JOIN efiling_daak_categories dc ON d.category_id = dc.id
             LEFT JOIN efiling_users u ON d.created_by = u.id
             LEFT JOIN efiling_departments dept ON d.department_id = dept.id
             LEFT JOIN efiling_roles r ON d.role_id = r.id
             WHERE d.id = $1`,
            [id]
        );

        if (daakResult.rows.length === 0) {
            return NextResponse.json({ error: 'Daak not found' }, { status: 404 });
        }

        const daak = daakResult.rows[0];

        // Check access: public, creator, or recipient
        if (!daak.is_public && daak.created_by !== efilingUserId && ![1, 2].includes(parseInt(session.user.role))) {
            const isRecipient = await client.query(
                'SELECT 1 FROM efiling_daak_recipients WHERE daak_id = $1 AND efiling_user_id = $2',
                [id, efilingUserId]
            );
            
            if (isRecipient.rows.length === 0) {
                return NextResponse.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // Get attachments
        const attachments = await client.query(
            'SELECT * FROM efiling_daak_attachments WHERE daak_id = $1 ORDER BY created_at',
            [id]
        );
        daak.attachments = attachments.rows;

        // Get recipients list
        const recipients = await client.query(
            `SELECT 
                dr.*,
                u.designation,
                u.employee_id,
                dept.name as department_name,
                r.name as role_name,
                da.acknowledged_at,
                da.acknowledgment_text
             FROM efiling_daak_recipients dr
             LEFT JOIN efiling_users u ON dr.efiling_user_id = u.id
             LEFT JOIN efiling_departments dept ON u.department_id = dept.id
             LEFT JOIN efiling_roles r ON u.efiling_role_id = r.id
             LEFT JOIN efiling_daak_acknowledgments da ON da.daak_id = dr.daak_id AND da.recipient_id = dr.efiling_user_id
             WHERE dr.daak_id = $1
             ORDER BY dr.created_at`,
            [id]
        );
        daak.recipients = recipients.rows;

        // Get user's acknowledgment if exists
        if (efilingUserId) {
            const userAck = await client.query(
                'SELECT * FROM efiling_daak_acknowledgments WHERE daak_id = $1 AND recipient_id = $2',
                [id, efilingUserId]
            );
            daak.user_acknowledgment = userAck.rows[0] || null;
            daak.is_acknowledged = userAck.rows.length > 0;
        }

        return NextResponse.json({ daak });
    } catch (error) {
        console.error('Error fetching daak:', error);
        return NextResponse.json(
            { error: 'Failed to fetch daak', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

// PUT - Update daak
export async function PUT(request, { params }) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        client = await connectToDatabase();
        const efilingUserId = await getEfilingUserId(session, client);

        // Check if daak exists and user is creator
        const daakCheck = await client.query(
            'SELECT created_by, status FROM efiling_daak WHERE id = $1',
            [id]
        );

        if (daakCheck.rows.length === 0) {
            return NextResponse.json({ error: 'Daak not found' }, { status: 404 });
        }

        const daak = daakCheck.rows[0];
        
        // Only creator or admin can update
        if (daak.created_by !== efilingUserId && ![1, 2].includes(parseInt(session.user.role))) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        // Can't update if already sent
        if (daak.status === 'SENT') {
            return NextResponse.json(
                { error: 'Cannot update daak that has already been sent' },
                { status: 400 }
            );
        }

        const {
            subject,
            content,
            category_id,
            priority,
            department_id,
            role_id,
            is_urgent,
            is_public,
            expires_at
        } = body;

        const updateFields = [];
        const updateValues = [];
        let paramCount = 1;

        if (subject !== undefined) {
            updateFields.push(`subject = $${paramCount++}`);
            updateValues.push(subject);
        }
        if (content !== undefined) {
            updateFields.push(`content = $${paramCount++}`);
            updateValues.push(content);
        }
        if (category_id !== undefined) {
            updateFields.push(`category_id = $${paramCount++}`);
            updateValues.push(category_id);
        }
        if (priority !== undefined) {
            updateFields.push(`priority = $${paramCount++}`);
            updateValues.push(priority);
        }
        if (department_id !== undefined) {
            updateFields.push(`department_id = $${paramCount++}`);
            updateValues.push(department_id);
        }
        if (role_id !== undefined) {
            updateFields.push(`role_id = $${paramCount++}`);
            updateValues.push(role_id);
        }
        if (is_urgent !== undefined) {
            updateFields.push(`is_urgent = $${paramCount++}`);
            updateValues.push(is_urgent);
        }
        if (is_public !== undefined) {
            updateFields.push(`is_public = $${paramCount++}`);
            updateValues.push(is_public);
        }
        if (expires_at !== undefined) {
            updateFields.push(`expires_at = $${paramCount++}`);
            updateValues.push(expires_at);
        }

        if (updateFields.length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
        }

        updateValues.push(id);
        const updateQuery = `
            UPDATE efiling_daak 
            SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await client.query(updateQuery, updateValues);
        
        return NextResponse.json({
            success: true,
            daak: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating daak:', error);
        return NextResponse.json(
            { error: 'Failed to update daak', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

// DELETE - Delete daak
export async function DELETE(request, { params }) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        client = await connectToDatabase();
        const efilingUserId = await getEfilingUserId(session, client);

        // Check if daak exists and user is creator
        const daakCheck = await client.query(
            'SELECT created_by, status FROM efiling_daak WHERE id = $1',
            [id]
        );

        if (daakCheck.rows.length === 0) {
            return NextResponse.json({ error: 'Daak not found' }, { status: 404 });
        }

        const daak = daakCheck.rows[0];
        
        // Only creator or admin can delete
        if (daak.created_by !== efilingUserId && ![1, 2].includes(parseInt(session.user.role))) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        // Can't delete if already sent (should cancel instead)
        if (daak.status === 'SENT') {
            return NextResponse.json(
                { error: 'Cannot delete daak that has been sent. Cancel it instead.' },
                { status: 400 }
            );
        }

        // Delete daak (cascade will delete recipients, acknowledgments, attachments)
        await client.query('DELETE FROM efiling_daak WHERE id = $1', [id]);
        
        return NextResponse.json({ success: true, message: 'Daak deleted successfully' });
    } catch (error) {
        console.error('Error deleting daak:', error);
        return NextResponse.json(
            { error: 'Failed to delete daak', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

