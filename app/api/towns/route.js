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
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '0', 10);
    const offset = (page - 1) * limit;
    const filter = searchParams.get('filter') || '';
    const client = await connectToDatabase();

    try {
        if (id) {
            const query = `
                SELECT t.*, d.title as district_name
                FROM town t
                LEFT JOIN district d ON t.district_id = d.id
                WHERE t.id = $1
            `;
            const result = await client.query(query, [id]);

            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Town not found' }, { status: 404 });
            }

            return NextResponse.json(result.rows[0], { status: 200 });
        } else if (limit > 0) {
            // Paginated with optional filter
            let countQuery = 'SELECT COUNT(*) FROM town';
            let dataQuery = `
                SELECT t.*, d.title as district_name
                FROM town t
                LEFT JOIN district d ON t.district_id = d.id
            `;
            let params = [];
            if (filter) {
                countQuery += ' WHERE t.town ILIKE $1';
                dataQuery += ' WHERE t.town ILIKE $1';
                params = [`%${filter}%`];
            }
            dataQuery += ' ORDER BY t.created_date DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
            const countResult = filter ? await client.query(countQuery, params) : await client.query(countQuery);
            const total = parseInt(countResult.rows[0].count, 10);
            const dataParams = [...params, limit, offset];
            const result = await client.query(dataQuery, dataParams);
            return NextResponse.json({ data: result.rows, total }, { status: 200 });
        } else {
            const query = `
                SELECT t.*, d.title as district_name
                FROM town t
                LEFT JOIN district d ON t.district_id = d.id
                ORDER BY t.created_date DESC
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
        const { town, district_id, subtown } = body;

        if (!town) {
            return NextResponse.json({ error: 'Town name is required' }, { status: 400 });
        }

        const query = `
            INSERT INTO town (town, district_id, subtown)
            VALUES ($1, $2, $3) RETURNING *;
        `;
        const { rows: newTown } = await client.query(query, [
            town,
            district_id || null,
            subtown || null
        ]);

        return NextResponse.json({ message: 'Town added successfully', town: newTown[0] }, { status: 201 });

    } catch (error) {
        console.error('Error saving town:', error);
        return NextResponse.json({ error: 'Error saving town' }, { status: 500 });
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
        const { id, town, district_id, subtown } = body;

        if (!id || !town) {
            return NextResponse.json({ error: 'Town ID and name are required' }, { status: 400 });
        }

        const query = `
            UPDATE town 
            SET town = $1, district_id = $2, subtown = $3, updated_date = CURRENT_TIMESTAMP
            WHERE id = $4
            RETURNING *;
        `;
        const { rows: updatedTown } = await client.query(query, [
            town,
            district_id || null,
            subtown || null,
            id
        ]);

        if (updatedTown.length === 0) {
            return NextResponse.json({ error: 'Town not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Town updated successfully', town: updatedTown[0] }, { status: 200 });

    } catch (error) {
        console.error('Error updating town:', error);
        return NextResponse.json({ error: 'Error updating town' }, { status: 500 });
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
            return NextResponse.json({ error: 'Town ID is required' }, { status: 400 });
        }

        // Check if town is being used in subtowns
        const checkSubtownQuery = 'SELECT id FROM subtown WHERE town_id = $1 LIMIT 1';
        const checkSubtownResult = await client.query(checkSubtownQuery, [id]);

        if (checkSubtownResult.rows.length > 0) {
            return NextResponse.json(
                { error: 'Cannot delete town as it has associated subtowns' },
                { status: 400 }
            );
        }

        // Check if town is being used in work requests
        const checkWorkRequestQuery = 'SELECT id FROM work_requests WHERE town_id = $1 LIMIT 1';
        const checkWorkRequestResult = await client.query(checkWorkRequestQuery, [id]);

        if (checkWorkRequestResult.rows.length > 0) {
            return NextResponse.json(
                { error: 'Cannot delete town as it is being used in work requests' },
                { status: 400 }
            );
        }

        const query = `
            DELETE FROM town 
            WHERE id = $1
            RETURNING *;
        `;

        const { rows: deletedTown } = await client.query(query, [id]);

        if (deletedTown.length === 0) {
            return NextResponse.json({ error: 'Town not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Town deleted successfully', town: deletedTown[0] }, { status: 200 });

    } catch (error) {
        console.error('Error deleting town:', error);
        return NextResponse.json({ error: 'Error deleting town' }, { status: 500 });
    }
} 