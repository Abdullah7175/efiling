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
            const query = 'SELECT * FROM district WHERE id = $1';
            const result = await client.query(query, [id]);

            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'District not found' }, { status: 404 });
            }

            return NextResponse.json(result.rows[0], { status: 200 });
        } else if (limit > 0) {
            // Paginated with optional filter
            let countQuery = 'SELECT COUNT(*) FROM district';
            let dataQuery = 'SELECT * FROM district';
            let params = [];
            if (filter) {
                countQuery += ' WHERE title ILIKE $1';
                dataQuery += ' WHERE title ILIKE $1';
                params = [`%${filter}%`];
            }
            dataQuery += ' ORDER BY created_date DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
            const countResult = filter ? await client.query(countQuery, params) : await client.query(countQuery);
            const total = parseInt(countResult.rows[0].count, 10);
            const dataParams = [...params, limit, offset];
            const result = await client.query(dataQuery, dataParams);
            return NextResponse.json({ data: result.rows, total }, { status: 200 });
        } else {
            const query = 'SELECT * FROM district ORDER BY created_date DESC';
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
        const { title } = body;

        if (!title) {
            return NextResponse.json({ error: 'District title is required' }, { status: 400 });
        }

        const query = `
            INSERT INTO district (title)
            VALUES ($1) RETURNING *;
        `;
        const { rows: newDistrict } = await client.query(query, [title]);

        return NextResponse.json({ message: 'District added successfully', district: newDistrict[0] }, { status: 201 });

    } catch (error) {
        console.error('Error saving district:', error);
        return NextResponse.json({ error: 'Error saving district' }, { status: 500 });
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
        const { id, title } = body;

        if (!id || !title) {
            return NextResponse.json({ error: 'District ID and title are required' }, { status: 400 });
        }

        const query = `
            UPDATE district 
            SET title = $1, updated_date = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *;
        `;
        const { rows: updatedDistrict } = await client.query(query, [title, id]);

        if (updatedDistrict.length === 0) {
            return NextResponse.json({ error: 'District not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'District updated successfully', district: updatedDistrict[0] }, { status: 200 });

    } catch (error) {
        console.error('Error updating district:', error);
        return NextResponse.json({ error: 'Error updating district' }, { status: 500 });
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
            return NextResponse.json({ error: 'District ID is required' }, { status: 400 });
        }

        // Check if district is being used in towns
        const checkTownQuery = 'SELECT id FROM town WHERE district_id = $1 LIMIT 1';
        const checkTownResult = await client.query(checkTownQuery, [id]);

        if (checkTownResult.rows.length > 0) {
            return NextResponse.json(
                { error: 'Cannot delete district as it has associated towns' },
                { status: 400 }
            );
        }

        const query = `
            DELETE FROM district 
            WHERE id = $1
            RETURNING *;
        `;

        const { rows: deletedDistrict } = await client.query(query, [id]);

        if (deletedDistrict.length === 0) {
            return NextResponse.json({ error: 'District not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'District deleted successfully', district: deletedDistrict[0] }, { status: 200 });

    } catch (error) {
        console.error('Error deleting district:', error);
        return NextResponse.json({ error: 'Error deleting district' }, { status: 500 });
    }
} 