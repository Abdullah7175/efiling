import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;
    const filter = searchParams.get('filter') || '';
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const userType = searchParams.get('user_type');
    const actionType = searchParams.get('action_type');
    const entityType = searchParams.get('entity_type');
    const userId = searchParams.get('user_id');

    // Check if user is admin (role 1)
    const session = await auth();
    if (!session || session.user?.userType !== 'user' || session.user?.role !== 1) {
        return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    let client;
    try {
        client = await connectToDatabase();

        let countQuery = 'SELECT COUNT(*) FROM user_actions';
        let dataQuery = 'SELECT * FROM user_actions';
        let whereClauses = [];
        let params = [];
        let paramIdx = 1;

        if (filter) {
            whereClauses.push(`(
                CAST(user_id AS TEXT) ILIKE $${paramIdx} OR 
                user_name ILIKE $${paramIdx} OR 
                user_email ILIKE $${paramIdx} OR 
                action_type ILIKE $${paramIdx} OR 
                entity_type ILIKE $${paramIdx} OR 
                entity_name ILIKE $${paramIdx}
            )`);
            params.push(`%${filter}%`);
            paramIdx++;
        }

        if (dateFrom) {
            whereClauses.push(`created_at >= $${paramIdx}`);
            params.push(dateFrom);
            paramIdx++;
        }

        if (dateTo) {
            whereClauses.push(`created_at <= $${paramIdx}`);
            params.push(dateTo);
            paramIdx++;
        }

        if (userType) {
            whereClauses.push(`user_type = $${paramIdx}`);
            params.push(userType);
            paramIdx++;
        }

        if (actionType) {
            whereClauses.push(`action_type = $${paramIdx}`);
            params.push(actionType);
            paramIdx++;
        }

        if (entityType) {
            whereClauses.push(`entity_type = $${paramIdx}`);
            params.push(entityType);
            paramIdx++;
        }

        if (userId) {
            whereClauses.push(`user_id = $${paramIdx}`);
            params.push(userId);
            paramIdx++;
        }

        if (whereClauses.length > 0) {
            countQuery += ' WHERE ' + whereClauses.join(' AND ');
            dataQuery += ' WHERE ' + whereClauses.join(' AND ');
        }

        dataQuery += ' ORDER BY created_at DESC LIMIT $' + paramIdx + ' OFFSET $' + (paramIdx + 1);
        params.push(limit, offset);

        const countResult = await client.query(countQuery, params.slice(0, -2));
        const total = parseInt(countResult.rows[0].count, 10);
        const result = await client.query(dataQuery, params);

        return NextResponse.json({ 
            data: result.rows, 
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }, { status: 200 });

    } catch (error) {
        console.error('Error fetching user actions:', error);
        return NextResponse.json({ error: 'Failed to fetch user actions', details: error.message }, { status: 500 });
    } finally {
        if (client && client.release) {
            client.release();
        }
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const {
            user_id,
            user_type,
            user_role,
            user_name,
            user_email,
            action_type,
            entity_type,
            entity_id,
            entity_name,
            details,
            ip_address,
            user_agent
        } = body;

        // Validate required fields
        if (!user_id || !user_type || !user_role || !user_name || !user_email || !action_type || !entity_type) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const client = await connectToDatabase();
        const query = `
            INSERT INTO user_actions (
                user_id, user_type, user_role, user_name, user_email, 
                action_type, entity_type, entity_id, entity_name, 
                details, ip_address, user_agent
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *;
        `;

        const { rows } = await client.query(query, [
            user_id,
            user_type,
            user_role,
            user_name,
            user_email,
            action_type,
            entity_type,
            entity_id || null,
            entity_name || null,
            details ? JSON.stringify(details) : null,
            ip_address || null,
            user_agent || null
        ]);

        return NextResponse.json({
            message: 'User action logged successfully',
            action: rows[0]
        }, { status: 201 });

    } catch (error) {
        console.error('Error logging user action:', error);
        return NextResponse.json({ error: 'Failed to log user action', details: error.message }, { status: 500 });
    }
} 