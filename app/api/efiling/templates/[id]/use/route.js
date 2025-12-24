import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

/**
 * POST /api/efiling/templates/[id]/use
 * Track template usage (increment usage count)
 */
export async function POST(request, { params }) {
    let client;
    try {
        const { id } = await params;
        if (!id) {
            return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
        }

        const session = await auth();
        if (!session?.user?.id) {
            console.error('Template use - No session or user ID');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        client = await connectToDatabase();

        // Check if template exists
        const templateRes = await client.query(`
            SELECT id, name FROM efiling_templates
            WHERE id = $1 AND is_active = true
        `, [id]);

        if (templateRes.rows.length === 0) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        // Increment usage count
        const result = await client.query(`
            UPDATE efiling_templates
            SET usage_count = COALESCE(usage_count, 0) + 1,
                last_used_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING usage_count, last_used_at
        `, [id]);

        return NextResponse.json({
            success: true,
            usage_count: result.rows[0].usage_count,
            last_used_at: result.rows[0].last_used_at,
            message: 'Template usage tracked'
        });

    } catch (error) {
        console.error('Error tracking template usage:', error);
        return NextResponse.json(
            { error: 'Failed to track template usage', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

