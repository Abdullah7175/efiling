import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(request) {
    // SECURITY: Require authentication
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const department_id = searchParams.get('department_id');
    const is_active = searchParams.get('is_active');
    
    let client;
    try {
        client = await connectToDatabase();
        console.log('Database connected successfully');
        
        // First, check if the efiling_file_categories table exists
        try {
            const tableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'efiling_file_categories'
                );
            `);
            console.log('Categories table exists check:', tableCheck.rows[0]);
            
            if (!tableCheck.rows[0].exists) {
                console.log('efiling_file_categories table does not exist - returning empty array');
                return NextResponse.json([]);
            }
        } catch (tableError) {
            console.error('Error checking categories table existence:', tableError);
            // Return empty array instead of error
            return NextResponse.json([]);
        }
        
        if (id) {
            const query = `
                SELECT c.*, d.name as department_name
                FROM efiling_file_categories c
                LEFT JOIN efiling_departments d ON c.department_id = d.id
                WHERE c.id = $1
            `;
            const result = await client.query(query, [id]);
            
            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Category not found' }, { status: 404 });
            }
            
            return NextResponse.json(result.rows[0]);
        } else {
            let query = `
                SELECT c.*, d.name as department_name
                FROM efiling_file_categories c
                LEFT JOIN efiling_departments d ON c.department_id = d.id
            `;
            const params = [];
            const conditions = [];
            let paramIndex = 1;
            
            if (department_id) {
                conditions.push(`c.department_id = $${paramIndex}`);
                params.push(department_id);
                paramIndex++;
            }
            
            if (is_active !== null && is_active !== undefined) {
                conditions.push(`c.is_active = $${paramIndex}`);
                params.push(is_active === 'true');
                paramIndex++;
            }
            
            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }
            
            query += ` ORDER BY c.name ASC`;
            
            console.log('Executing categories query:', query);
            console.log('Query parameters:', params);
            
            const result = await client.query(query, params);
            console.log('Categories query result rows:', result.rows.length);
            
            return NextResponse.json(result.rows);
        }
    } catch (error) {
        console.error('Database error in GET /api/efiling/categories:', error);
        console.error('Error stack:', error.stack);
        // Return empty array instead of 500 error to prevent frontend crash
        return NextResponse.json([]);
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function POST(request) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.role || ![1,2].includes(parseInt(session.user.role))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { name, code, description, department_id, is_work_related, is_active } = body;

        // Input validation
        if (!name || !code) {
            return NextResponse.json(
                { error: 'Name and code are required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();

        // Check if code already exists
        const existingCode = await client.query(`
            SELECT id FROM efiling_file_categories WHERE code = $1
        `, [code]);

        if (existingCode.rows.length > 0) {
            return NextResponse.json(
                { error: 'Category code already exists' },
                { status: 409 }
            );
        }

        // Create category
        const result = await client.query(`
            INSERT INTO efiling_file_categories (
                name, code, description, department_id, is_work_related, is_active, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            RETURNING *
        `, [
            name,
            code,
            description || null,
            department_id || null,
            is_work_related || false,
            is_active !== false
        ]);

        const category = result.rows[0];

        return NextResponse.json({
            success: true,
            category: category
        });

    } catch (error) {
        console.error('Error creating category:', error);
        return NextResponse.json(
            { error: 'Failed to create category' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function PUT(request) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.role || ![1,2].includes(parseInt(session.user.role))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { id, name, code, description, department_id, is_work_related, is_active } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'Category ID is required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();

        // Check if category exists
        const existingCategory = await client.query(`
            SELECT * FROM efiling_file_categories WHERE id = $1
        `, [id]);

        if (existingCategory.rows.length === 0) {
            return NextResponse.json(
                { error: 'Category not found' },
                { status: 404 }
            );
        }

        // Check if code already exists (excluding current category)
        if (code) {
            const existingCode = await client.query(`
                SELECT id FROM efiling_file_categories WHERE code = $1 AND id != $2
            `, [code, id]);

            if (existingCode.rows.length > 0) {
                return NextResponse.json(
                    { error: 'Category code already exists' },
                    { status: 409 }
                );
            }
        }

        // Update category
        const result = await client.query(`
            UPDATE efiling_file_categories 
            SET 
                name = COALESCE($2, name),
                code = COALESCE($3, code),
                description = COALESCE($4, description),
                department_id = $5,
                is_work_related = COALESCE($6, is_work_related),
                is_active = COALESCE($7, is_active),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [
            id,
            name || null,
            code || null,
            description || null,
            department_id,
            is_work_related !== undefined ? is_work_related : null,
            is_active !== undefined ? is_active : null
        ]);

        return NextResponse.json({
            success: true,
            category: result.rows[0]
        });

    } catch (error) {
        console.error('Error updating category:', error);
        return NextResponse.json(
            { error: 'Failed to update category' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function DELETE(request) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.role || ![1,2].includes(parseInt(session.user.role))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Category ID is required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();

        // Check if category exists
        const existingCategory = await client.query(`
            SELECT * FROM efiling_file_categories WHERE id = $1
        `, [id]);

        if (existingCategory.rows.length === 0) {
            return NextResponse.json(
                { error: 'Category not found' },
                { status: 404 }
            );
        }

        // Delete category
        await client.query(`
            DELETE FROM efiling_file_categories WHERE id = $1
        `, [id]);

        return NextResponse.json({
            success: true,
            message: 'Category deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting category:', error);
        return NextResponse.json(
            { error: 'Failed to delete category' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
} 