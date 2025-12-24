import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAuth } from '@/lib/authMiddleware';

export async function GET(request) {
    // SECURITY: Require authentication
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    const client = await connectToDatabase();

    try {
        if (id) {
            const query = 'SELECT * FROM status WHERE id = $1';
            const result = await client.query(query, [id]);

            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Status not found' }, { status: 404 });
            }

            return NextResponse.json(result.rows[0], { status: 200 });
        } else {
            const query = 'SELECT * FROM status ORDER BY id';
            const result = await client.query(query);
            return NextResponse.json(result.rows, { status: 200 });
        }
    } catch (error) {
        console.error('Error fetching statuses:', error);
        return NextResponse.json({ error: 'Failed to fetch statuses' }, { status: 500 });
    } finally {
        client.release && client.release();
    }
}

export async function POST(req) {
    const client = await connectToDatabase();

    try {
        const body = await req.json();
        const { name } = body;

        if (!name) {
            return NextResponse.json({ error: 'Status name is required' }, { status: 400 });
        }

        const query = `
            INSERT INTO status (name)
            VALUES ($1)
            RETURNING *;
        `;

        const result = await client.query(query, [name]);
        return NextResponse.json(result.rows[0], { status: 201 });

    } catch (error) {
        console.error('Error creating status:', error);
        return NextResponse.json({ error: 'Failed to create status' }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function PUT(req) {
    const client = await connectToDatabase();

    try {
        const body = await req.json();
        const { id, name } = body;

        if (!id || !name) {
            return NextResponse.json({ error: 'Both id and name are required' }, { status: 400 });
        }

        const query = `
            UPDATE status
            SET name = $1
            WHERE id = $2
            RETURNING *;
        `;

        const result = await client.query(query, [name, id]);

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Status not found' }, { status: 404 });
        }

        return NextResponse.json(result.rows[0], { status: 200 });

    } catch (error) {
        console.error('Error updating status:', error);
        return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function DELETE(req) {
    const client = await connectToDatabase();

    try {
        const body = await req.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'Status ID is required' }, { status: 400 });
        }

        // Check if status is being used in any work requests
        const checkQuery = 'SELECT id FROM work_requests WHERE status_id = $1 LIMIT 1';
        const checkResult = await client.query(checkQuery, [id]);

        if (checkResult.rows.length > 0) {
            return NextResponse.json(
                { error: 'Cannot delete status as it is being used in work requests' },
                { status: 400 }
            );
        }

        const deleteQuery = 'DELETE FROM status WHERE id = $1 RETURNING *';
        const result = await client.query(deleteQuery, [id]);

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Status not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Status deleted successfully' }, { status: 200 });

    } catch (error) {
        console.error('Error deleting status:', error);
        return NextResponse.json({ error: 'Failed to delete status' }, { status: 500 });
    } finally {
        client.release();
    }
}