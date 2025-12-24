import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    const client = await connectToDatabase();

    try {
        if (id) {
            const query = `SELECT 
    w.id AS work_id,
    w.subject,
    v.link AS video_link
FROM 
    public."Work" w
LEFT JOIN 
    public."Videos" v ON w.link = v.id
`;
            const result = await client.query(query, [id]);

            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Video not found' }, { status: 404 });
            }

            return NextResponse.json(result.rows[0], { status: 200 });
        } else {
            const query = `SELECT 
    w.id, 
    w.subject, 
    v.link AS video_link,
    v.id AS video_id
FROM 
    public."work" w
JOIN 
    public.videos v ON w.link = v.id `;
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