import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

// GET - Get all daak categories
export async function GET(request) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        client = await connectToDatabase();

        const result = await client.query(
            'SELECT * FROM efiling_daak_categories WHERE is_active = true ORDER BY name'
        );

        return NextResponse.json({ categories: result.rows });
    } catch (error) {
        console.error('Error fetching daak categories:', error);
        return NextResponse.json(
            { error: 'Failed to fetch categories', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

