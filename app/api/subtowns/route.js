import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from "@/auth";
import { requireAuth } from '@/lib/authMiddleware';

export async function GET(request) {
    // SECURITY: Require authentication
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const town_id = searchParams.get('town_id');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '0', 10);
    const offset = (page - 1) * limit;
    const filter = searchParams.get('filter') || '';
    const client = await connectToDatabase();

    try {
        if (id) {
            const query = `
                SELECT st.*, t.town as town_name, d.title as district_name
                FROM subtown st
                LEFT JOIN town t ON st.town_id = t.id
                LEFT JOIN district d ON t.district_id = d.id
                WHERE st.id = $1
            `;
            const result = await client.query(query, [id]);

            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Subtown not found' }, { status: 404 });
            }

            return NextResponse.json(result.rows[0], { status: 200 });
        } else if (town_id) {
            const query = `
                SELECT st.*, t.town as town_name, d.title as district_name
                FROM subtown st
                LEFT JOIN town t ON st.town_id = t.id
                LEFT JOIN district d ON t.district_id = d.id
                WHERE st.town_id = $1
                ORDER BY st.subtown ASC
            `;
            const result = await client.query(query, [town_id]);
            return NextResponse.json(result.rows, { status: 200 });
        } else if (limit > 0) {
            // Paginated with optional filter
            let countQuery = 'SELECT COUNT(*) FROM subtown';
            let dataQuery = `
                SELECT st.*, t.town as town_name, d.title as district_name
                FROM subtown st
                LEFT JOIN town t ON st.town_id = t.id
                LEFT JOIN district d ON t.district_id = d.id
            `;
            let params = [];
            if (filter) {
                countQuery += ' WHERE st.subtown ILIKE $1 OR t.town ILIKE $1';
                dataQuery += ' WHERE st.subtown ILIKE $1 OR t.town ILIKE $1';
                params = [`%${filter}%`];
            }
            dataQuery += ' ORDER BY st.created_date DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
            const countResult = filter ? await client.query(countQuery, params) : await client.query(countQuery);
            const total = parseInt(countResult.rows[0].count, 10);
            const dataParams = [...params, limit, offset];
            const result = await client.query(dataQuery, dataParams);
            return NextResponse.json({ data: result.rows, total }, { status: 200 });
        } else {
            const query = `
                SELECT st.*, t.town as town_name, d.title as district_name
                FROM subtown st
                LEFT JOIN town t ON st.town_id = t.id
                LEFT JOIN district d ON t.district_id = d.id
                ORDER BY st.created_date DESC
            `;
            const result = await client.query(query);
            return NextResponse.json(result.rows, { status: 200 });
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    } finally {
        client.release && client.release();
    }
}

export async function POST(req) {
    try {
        // Check authentication
        const session = await auth();
        
        if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 1) {
            return NextResponse.json(
                { error: 'Unauthorized. Admin access required.' },
                { status: 403 }
            );
        }

        const body = await req.json();
        const client = await connectToDatabase();
        const { subtown, town_id } = body;

        if (!subtown || !town_id) {
            return NextResponse.json({ error: 'Subtown name and town ID are required' }, { status: 400 });
        }

        // Verify that the town exists
        const townCheckQuery = 'SELECT id FROM town WHERE id = $1';
        const townCheckResult = await client.query(townCheckQuery, [town_id]);
        
        if (townCheckResult.rows.length === 0) {
            return NextResponse.json({ error: 'Invalid town ID' }, { status: 400 });
        }

        const query = `
            INSERT INTO subtown (subtown, town_id)
            VALUES ($1, $2) RETURNING *;
        `;
        const { rows: newSubtown } = await client.query(query, [subtown, town_id]);

        return NextResponse.json({ message: 'Subtown added successfully', subtown: newSubtown[0] }, { status: 201 });

    } catch (error) {
        console.error('Error saving subtown:', error);
        return NextResponse.json({ error: 'Error saving subtown' }, { status: 500 });
    }
}

export async function PUT(req) {
    try {
        // Check authentication
        const session = await auth();
        
        if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 1) {
            return NextResponse.json(
                { error: 'Unauthorized. Admin access required.' },
                { status: 403 }
            );
        }

        const body = await req.json();
        const client = await connectToDatabase();
        const { id, subtown, town_id } = body;

        if (!id || !subtown || !town_id) {
            return NextResponse.json({ error: 'Subtown ID, name, and town ID are required' }, { status: 400 });
        }

        // Verify that the town exists
        const townCheckQuery = 'SELECT id FROM town WHERE id = $1';
        const townCheckResult = await client.query(townCheckQuery, [town_id]);
        
        if (townCheckResult.rows.length === 0) {
            return NextResponse.json({ error: 'Invalid town ID' }, { status: 400 });
        }

        const query = `
            UPDATE subtown 
            SET subtown = $1, town_id = $2, updated_date = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *;
        `;
        const { rows: updatedSubtown } = await client.query(query, [subtown, town_id, id]);

        if (updatedSubtown.length === 0) {
            return NextResponse.json({ error: 'Subtown not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Subtown updated successfully', subtown: updatedSubtown[0] }, { status: 200 });

    } catch (error) {
        console.error('Error updating subtown:', error);
        return NextResponse.json({ error: 'Error updating subtown' }, { status: 500 });
    }
}

export async function DELETE(req) {
    try {
        // Check authentication
        const session = await auth();
        
        if (!session?.user || session.user.userType !== 'user' || parseInt(session.user.role) !== 1) {
            return NextResponse.json(
                { error: 'Unauthorized. Admin access required.' },
                { status: 403 }
            );
        }

        const body = await req.json();
        const client = await connectToDatabase();

        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'Subtown ID is required' }, { status: 400 });
        }

        // Check if subtown is being used in work requests
        const checkWorkRequestQuery = 'SELECT id FROM work_requests WHERE subtown_id = $1 LIMIT 1';
        const checkWorkRequestResult = await client.query(checkWorkRequestQuery, [id]);

        if (checkWorkRequestResult.rows.length > 0) {
            return NextResponse.json(
                { error: 'Cannot delete subtown as it is being used in work requests' },
                { status: 400 }
            );
        }

        const query = `
            DELETE FROM subtown 
            WHERE id = $1
            RETURNING *;
        `;

        const { rows: deletedSubtown } = await client.query(query, [id]);

        if (deletedSubtown.length === 0) {
            return NextResponse.json({ error: 'Subtown not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Subtown deleted successfully', subtown: deletedSubtown[0] }, { status: 200 });

    } catch (error) {
        console.error('Error deleting subtown:', error);
        return NextResponse.json({ error: 'Error deleting subtown' }, { status: 500 });
    }
} 