import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { actionLogger, ENTITY_TYPES } from '@/lib/actionLogger';

export async function POST(request, { params }) {
    try {
        const { id } = params;
        const body = await request.json();
        const { method, signature_text, user_id } = body;

        if (!method || !signature_text) {
            return NextResponse.json({ error: 'Method and signature text are required' }, { status: 400 });
        }

        const client = await connectToDatabase();

        // Check if the efiling_signatures table exists, if not create it
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS efiling_signatures (
                    id SERIAL PRIMARY KEY,
                    file_id INTEGER NOT NULL REFERENCES efiling_files(id) ON DELETE CASCADE,
                    user_id INTEGER,
                    signature_text TEXT NOT NULL,
                    signature_method VARCHAR(50) NOT NULL,
                    signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status VARCHAR(50) DEFAULT 'SIGNED',
                    ip_address INET,
                    user_agent TEXT
                )
            `);
        } catch (tableError) {
            console.error('Error creating signatures table:', tableError);
        }

        // Insert signature record
        const result = await client.query(`
            INSERT INTO efiling_signatures (
                file_id, user_id, signature_text, signature_method, status
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [id, user_id, signature_text, method, 'SIGNED']);

        // Update file status to indicate it has been signed
        await client.query(`
            UPDATE efiling_files 
            SET status_id = (
                SELECT id FROM efiling_file_status WHERE code = 'PENDING_APPROVAL'
            ), updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [id]);

        // Log the action
        await actionLogger.logAction({
            entityType: ENTITY_TYPES.EFILING_FILE,
            entityId: id,
            action: 'SIGN',
            details: { 
                signature_method: method,
                signature_id: result.rows[0].id,
                user_id: user_id
            }
        });

        return NextResponse.json({
            message: 'Document signed successfully',
            signature: result.rows[0]
        }, { status: 201 });

    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function GET(request, { params }) {
    try {
        const { id } = params;
        const client = await connectToDatabase();

        // Check if the efiling_signatures table exists
        try {
            const tableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'efiling_signatures'
                );
            `);

            if (!tableCheck.rows[0].exists) {
                return NextResponse.json({ error: 'Signatures table does not exist' }, { status: 404 });
            }
        } catch (tableError) {
            console.error('Error checking signatures table existence:', tableError);
            return NextResponse.json({ error: 'Signatures table does not exist' }, { status: 404 });
        }

        // Fetch signatures for the file
        const result = await client.query(`
            SELECT 
                s.*,
                u.name as user_name,
                u.designation as user_designation,
                d.name as user_department
            FROM efiling_signatures s
            LEFT JOIN efiling_users u ON s.user_id = u.id
            LEFT JOIN efiling_departments d ON u.department_id = d.id
            WHERE s.file_id = $1
            ORDER BY s.signed_at ASC
        `, [id]);

        return NextResponse.json(result.rows);
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function PUT(request, { params }) {
    let client;
    try {
        const { id } = await params;
        const body = await request.json();
        
        client = await connectToDatabase();
        
        // Update signature
        const result = await client.query(`
            UPDATE efiling_document_signatures 
            SET content = $1, position = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3 AND file_id = $4
            RETURNING *
        `, [body.content, body.position, body.signature_id, id]);
        
        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
        }
        
        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
}
