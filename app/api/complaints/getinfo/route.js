import { NextResponse } from 'next/server';
import { connectToDatabase, disconnectFromDatabase } from '@/lib/db';
import { requireAuth } from '@/lib/authMiddleware';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    // SECURITY: Require authentication
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
  const client = await connectToDatabase();

  try {
    await client.query('BEGIN');
    const query = `
      SELECT * FROM district;
      SELECT * FROM town;
      SELECT * FROM status;
    `;
    const result = await client.query(query);
    await client.query('COMMIT');

    const data = {
      districts: result[0].rows,
      towns: result[1].rows,
      status: result[2].rows,
    };

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error fetching data:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  } finally {
    await disconnectFromDatabase(client);
  }
}
