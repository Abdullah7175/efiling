import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

// Get all permissions
export async function GET() {
    let client;
    try {
        client = await connectToDatabase();
        
        const query = `
            SELECT id, name, description, resource_type, action, resource_subtype, is_active, created_at
            FROM efiling_permissions
            WHERE is_active = true
            ORDER BY resource_type, action, resource_subtype
        `;
        
        const result = await client.query(query);
        
        return NextResponse.json({
            success: true,
            permissions: result.rows
        });
    } catch (error) {
        console.error('Error fetching permissions:', error);
        return NextResponse.json(
            { error: 'Failed to fetch permissions' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

// Create new permission
export async function POST(request) {
    let client;
    try {
        const body = await request.json();
        const { name, description, resource_type, action, resource_subtype, is_active } = body;

        if (!name || !resource_type || !action) {
            return NextResponse.json(
                { error: 'Name, resource_type, and action are required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();

        // Check if permission already exists
        const existingQuery = `
            SELECT id FROM efiling_permissions 
            WHERE name = $1 AND resource_type = $2 AND action = $3
        `;
        const existingResult = await client.query(existingQuery, [name, resource_type, action]);
        
        if (existingResult.rows.length > 0) {
            return NextResponse.json(
                { error: 'Permission already exists' },
                { status: 409 }
            );
        }

        // Insert new permission
        const insertQuery = `
            INSERT INTO efiling_permissions (name, description, resource_type, action, resource_subtype, is_active)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        
        const result = await client.query(insertQuery, [
            name, description, resource_type, action, resource_subtype, is_active
        ]);

        return NextResponse.json({
            success: true,
            permission: result.rows[0]
        }, { status: 201 });

    } catch (error) {
        console.error('Error creating permission:', error);
        return NextResponse.json(
            { error: 'Failed to create permission' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

