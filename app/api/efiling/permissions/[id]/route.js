import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

// Get permission by ID
export async function GET(request, { params }) {
    let client;
    try {
        const { id } = params;
        
        if (!id) {
            return NextResponse.json(
                { error: 'Permission ID is required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();
        
        const query = `
            SELECT id, name, description, resource_type, action, resource_subtype, is_active, created_at
            FROM efiling_permissions
            WHERE id = $1
        `;
        
        const result = await client.query(query, [id]);
        
        if (result.rows.length === 0) {
            return NextResponse.json(
                { error: 'Permission not found' },
                { status: 404 }
            );
        }
        
        return NextResponse.json({
            success: true,
            permission: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching permission:', error);
        return NextResponse.json(
            { error: 'Failed to fetch permission' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

// Update permission
export async function PUT(request, { params }) {
    let client;
    try {
        const { id } = params;
        const body = await request.json();
        const { name, description, resource_type, action, resource_subtype, is_active } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'Permission ID is required' },
                { status: 400 }
            );
        }

        if (!name || !resource_type || !action) {
            return NextResponse.json(
                { error: 'Name, resource_type, and action are required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();

        // Check if permission exists
        const existingQuery = `
            SELECT id FROM efiling_permissions WHERE id = $1
        `;
        const existingResult = await client.query(existingQuery, [id]);
        
        if (existingResult.rows.length === 0) {
            return NextResponse.json(
                { error: 'Permission not found' },
                { status: 404 }
            );
        }

        // Check if updated permission conflicts with existing ones
        const conflictQuery = `
            SELECT id FROM efiling_permissions 
            WHERE name = $1 AND resource_type = $2 AND action = $3 AND id != $4
        `;
        const conflictResult = await client.query(conflictQuery, [name, resource_type, action, id]);
        
        if (conflictResult.rows.length > 0) {
            return NextResponse.json(
                { error: 'Permission already exists with these parameters' },
                { status: 409 }
            );
        }

        // Update permission
        const updateQuery = `
            UPDATE efiling_permissions 
            SET name = $1, description = $2, resource_type = $3, action = $4, 
                resource_subtype = $5, is_active = $6, updated_at = NOW()
            WHERE id = $7
            RETURNING *
        `;
        
        const result = await client.query(updateQuery, [
            name, description, resource_type, action, resource_subtype, is_active, id
        ]);

        return NextResponse.json({
            success: true,
            permission: result.rows[0]
        });

    } catch (error) {
        console.error('Error updating permission:', error);
        return NextResponse.json(
            { error: 'Failed to update permission' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

// Delete permission
export async function DELETE(request, { params }) {
    let client;
    try {
        const { id } = params;
        
        if (!id) {
            return NextResponse.json(
                { error: 'Permission ID is required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();

        // Check if permission exists
        const existingQuery = `
            SELECT id FROM efiling_permissions WHERE id = $1
        `;
        const existingResult = await client.query(existingQuery, [id]);
        
        if (existingResult.rows.length === 0) {
            return NextResponse.json(
                { error: 'Permission not found' },
                { status: 404 }
            );
        }

        // Soft delete by setting is_active to false
        const deleteQuery = `
            UPDATE efiling_permissions 
            SET is_active = false, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `;
        
        const result = await client.query(deleteQuery, [id]);

        return NextResponse.json({
            success: true,
            message: 'Permission deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting permission:', error);
        return NextResponse.json(
            { error: 'Failed to delete permission' },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

