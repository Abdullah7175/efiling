import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { actionLogger, ENTITY_TYPES } from '@/lib/actionLogger';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const code = searchParams.get('code');
    
    let client;
    try {
        client = await connectToDatabase();
        
        if (id) {
            const query = 'SELECT * FROM efiling_file_status WHERE id = $1';
            const result = await client.query(query, [id]);
            
            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Status not found' }, { status: 404 });
            }
            
            return NextResponse.json(result.rows[0]);
        } else if (code) {
            const query = 'SELECT * FROM efiling_file_status WHERE code = $1';
            const result = await client.query(query, [code]);
            
            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Status not found' }, { status: 404 });
            }
            
            return NextResponse.json(result.rows[0]);
        } else {
            const query = `
                SELECT s.*, 
                       (SELECT COUNT(*) FROM efiling_files WHERE status_id = s.id) as file_count
                FROM efiling_file_status s 
                ORDER BY s.name
            `;
            const result = await client.query(query);
            return NextResponse.json(result.rows);
        }
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function POST(request) {
    let client;
    try {
        client = await connectToDatabase();
        
        const body = await request.json();
        const { name, code, description, color } = body;
        
        // Validate required fields
        if (!name || !code) {
            return NextResponse.json({ error: 'Name and code are required' }, { status: 400 });
        }
        
        // Check if code already exists
        const existingCode = await client.query(
            'SELECT id FROM efiling_file_status WHERE code = $1',
            [code]
        );
        
        if (existingCode.rows.length > 0) {
            return NextResponse.json({ error: 'Status code already exists' }, { status: 400 });
        }
        
        const query = `
            INSERT INTO efiling_file_status (name, code, description, color)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        
        const result = await client.query(query, [name, code, description, color]);
        
        // Log the action
        await actionLogger.logAction({
            entityType: ENTITY_TYPES.EFILING_FILE_STATUS,
            entityId: result.rows[0].id,
            action: 'CREATE',
            details: { name, code }
        });
        
        return NextResponse.json(result.rows[0], { status: 201 });
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function PUT(request) {
    let client;
    try {
        client = await connectToDatabase();
        
        const body = await request.json();
        const { id, name, code, description, color, is_active } = body;
        
        if (!id) {
            return NextResponse.json({ error: 'Status ID is required' }, { status: 400 });
        }
        
        // Check if status exists
        const existing = await client.query(
            'SELECT * FROM efiling_file_status WHERE id = $1',
            [id]
        );
        
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Status not found' }, { status: 404 });
        }
        
        // Check if code already exists (excluding current status)
        if (code) {
            const existingCode = await client.query(
                'SELECT id FROM efiling_file_status WHERE code = $1 AND id != $2',
                [code, id]
            );
            
            if (existingCode.rows.length > 0) {
                return NextResponse.json({ error: 'Status code already exists' }, { status: 400 });
            }
        }
        
        const query = `
            UPDATE efiling_file_status 
            SET name = COALESCE($2, name),
                code = COALESCE($3, code),
                description = COALESCE($4, description),
                color = COALESCE($5, color),
                is_active = COALESCE($6, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `;
        
        const result = await client.query(query, [id, name, code, description, color, is_active]);
        
        // Log the action
        await actionLogger.logAction({
            entityType: ENTITY_TYPES.EFILING_FILE_STATUS,
            entityId: id,
            action: 'UPDATE',
            details: { name, code }
        });
        
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

export async function DELETE(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
        return NextResponse.json({ error: 'Status ID is required' }, { status: 400 });
    }
    
    let client;
    try {
        client = await connectToDatabase();
        
        // Check if status exists
        const existing = await client.query(
            'SELECT * FROM efiling_file_status WHERE id = $1',
            [id]
        );
        
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Status not found' }, { status: 404 });
        }
        
        // Check if status is being used by files
        const filesCount = await client.query(
            'SELECT COUNT(*) FROM efiling_files WHERE status_id = $1',
            [id]
        );
        
        if (parseInt(filesCount.rows[0].count) > 0) {
            return NextResponse.json({ 
                error: 'Cannot delete status that is being used by files' 
            }, { status: 400 });
        }
        
        // Soft delete by setting is_active to false
        await client.query(
            'UPDATE efiling_file_status SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );
        
        // Log the action
        await actionLogger.logAction({
            entityType: ENTITY_TYPES.EFILING_FILE_STATUS,
            entityId: id,
            action: 'DELETE',
            details: { name: existing.rows[0].name }
        });
        
        return NextResponse.json({ message: 'Status deleted successfully' });
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        if (client) {
            await client.release();
        }
    }
} 