import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { actionLogger, ENTITY_TYPES } from '@/lib/actionLogger';

export const dynamic = 'force-dynamic';

// Configure upload directory
const uploadDir = path.join(process.cwd(), 'public/uploads/users');

// Ensure upload directory exists
async function ensureUploadDir() {
  try {
    await fs.mkdir(uploadDir, { recursive: true });
  } catch (error) {
    console.error('Error creating upload directory:', error);
    throw error;
  }
}

// Save uploaded file to disk
async function saveUploadedFile(file) {
  // Validate file size (5MB max for profile images)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File size exceeds limit. Maximum allowed: 5MB');
  }
  await ensureUploadDir();
  
  try {
    const buffer = await file.arrayBuffer();
    const uniqueName = `${uuidv4()}${path.extname(file.name)}`;
    const filePath = path.join(uploadDir, uniqueName);
    
    await fs.writeFile(filePath, Buffer.from(buffer));
    
    return `/uploads/users/${uniqueName}`;
  } catch (error) {
    console.error('Error saving file:', error);
    throw new Error('Failed to save file');
  }
}

// Delete file from disk
async function deleteFile(filePath) {
  try {
    if (!filePath) return;
    
    const fullPath = path.join(process.cwd(), 'public', filePath);
    await fs.unlink(fullPath);
  } catch (error) {
    console.error('Error deleting file:', error);
  }
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const role = searchParams.get('role');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '0', 10);
    const offset = (page - 1) * limit;
    const filter = searchParams.get('filter') || '';
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const client = await connectToDatabase();
    try {
        if (id) {
            const query = 'SELECT * FROM users WHERE id = $1';
            const result = await client.query(query, [id]);
            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }
            return NextResponse.json(result.rows[0], { status: 200 });
        } else {
            let countQuery = 'SELECT COUNT(*) FROM users';
            let dataQuery = 'SELECT id, name, email, contact_number, role, image, created_date FROM users';
            let whereClauses = [];
            let params = [];
            let paramIdx = 1;
            if (filter) {
                whereClauses.push(`(
                    CAST(id AS TEXT) ILIKE $${paramIdx} OR
                    name ILIKE $${paramIdx} OR
                    email ILIKE $${paramIdx} OR
                    contact_number ILIKE $${paramIdx}
                )`);
                params.push(`%${filter}%`);
                paramIdx++;
            }
            if (role) {
                whereClauses.push(`role = $${paramIdx}`);
                params.push(role);
                paramIdx++;
            }
            if (dateFrom) {
                whereClauses.push(`created_date >= $${paramIdx}`);
                params.push(dateFrom);
                paramIdx++;
            }
            if (dateTo) {
                whereClauses.push(`created_date <= $${paramIdx}`);
                params.push(dateTo);
                paramIdx++;
            }
            if (whereClauses.length > 0) {
                countQuery += ' WHERE ' + whereClauses.join(' AND ');
                dataQuery += ' WHERE ' + whereClauses.join(' AND ');
            }
            dataQuery += ' ORDER BY created_date DESC';
            if (limit > 0) {
                dataQuery += ` LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
                params.push(limit, offset);
            }
            const countResult = await client.query(countQuery, params.slice(0, params.length - (limit > 0 ? 2 : 0)));
            const total = parseInt(countResult.rows[0].count, 10);
            const result = await client.query(dataQuery, params);
            return NextResponse.json({ data: result.rows, total }, { status: 200 });
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    } finally {
        client.release && client.release();
    }
}

export async function POST(req) {
    const JWT_SECRET = process.env.JWT_SECRET;
    try {
        const formData = await req.formData();
        
        const name = formData.get('name');
        const email = formData.get('email');
        const password = formData.get('password');
        const contact = formData.get('contact');
        const role = formData.get('role');
        const imageFile = formData.get('image');

        let imageUrl = null;
        
        // Handle image upload if exists
        if (imageFile && imageFile.size > 0) {
            imageUrl = await saveUploadedFile(imageFile);
        }

        const client = await connectToDatabase();

        const query = `
            INSERT INTO users (name, email, password, contact_number, role, image)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
        `;
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const { rows: newUser } = await client.query(query, [
            name,
            email,
            hashedPassword,
            contact,
            role,
            imageUrl
        ]);

        const payload = {
            userId: newUser[0].id,
            email: newUser[0].email,
            role: newUser[0].role
        };
        
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
        
        // Log the user creation action
        await actionLogger.create(req, ENTITY_TYPES.USER, newUser[0].id, newUser[0].name, {
            email: newUser[0].email,
            role: newUser[0].role,
            contact: newUser[0].contact_number,
            hasImage: !!imageUrl
        });
        
        return NextResponse.json({
            message: 'User added successfully',
            user: newUser[0],
            token,
        }, { status: 201 });
   
    } catch (error) {
        console.error('Error saving user:', error);
        return NextResponse.json({ 
            error: error.message || 'Error saving user' 
        }, { status: 500 });
    }
}

export async function PUT(req) {
    try {
        // SECURITY: Require authentication
        const { auth } = await import('@/auth');
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        
        const id = formData.get('id');
        const name = formData.get('name');
        const email = formData.get('email');
        const contact = formData.get('contact');
        const role = formData.get('role');
        const imageFile = formData.get('image');
        const password = formData.get('password');

        const client = await connectToDatabase();

        // First get current user to check if we have an existing image
        const currentUserQuery = 'SELECT id, image FROM users WHERE id = $1';
        const currentUserResult = await client.query(currentUserQuery, [id]);
        
        if (currentUserResult.rows.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // SECURITY: IDOR Fix - Check ownership or admin role
        const userId = parseInt(id);
        const sessionUserId = parseInt(session.user.id);
        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        
        if (sessionUserId !== userId && !isAdmin) {
            return NextResponse.json(
                { error: 'Forbidden - You can only modify your own data' },
                { status: 403 }
            );
        }
        
        let imageUrl = currentUserResult.rows[0]?.image || null;
        
        // Handle image upload if a new file was provided
        if (imageFile && imageFile.size > 0) {
            // Delete old image if exists
            if (imageUrl) {
                await deleteFile(imageUrl);
            }
            // Save new image
            imageUrl = await saveUploadedFile(imageFile);
        }

        let query;
        let params;
        
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query = `
                UPDATE users 
                SET name = $1, email = $2, contact_number = $3, 
                    role = $4, image = $5, password = $6,
                    updated_date = CURRENT_TIMESTAMP
                WHERE id = $7
                RETURNING *;
            `;
            params = [name, email, contact, role, imageUrl, hashedPassword, id];
        } else {
            query = `
                UPDATE users 
                SET name = $1, email = $2, contact_number = $3, 
                    role = $4, image = $5,
                    updated_date = CURRENT_TIMESTAMP
                WHERE id = $6
                RETURNING *;
            `;
            params = [name, email, contact, role, imageUrl, id];
        }

        const { rows: updatedUser } = await client.query(query, params);

        if (updatedUser.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Log the user update action
        await actionLogger.update(req, ENTITY_TYPES.USER, updatedUser[0].id, updatedUser[0].name, {
            email: updatedUser[0].email,
            role: updatedUser[0].role,
            contact: updatedUser[0].contact_number,
            hasImage: !!imageUrl,
            passwordChanged: !!password
        });

        return NextResponse.json({ 
            message: 'User updated successfully', 
            user: updatedUser[0] 
        }, { status: 200 });

    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json({ 
            error: error.message || 'Error updating user' 
        }, { status: 500 });
    }
}

export async function DELETE(req) {
    try {
        // SECURITY: Require authentication
        const { auth } = await import('@/auth');
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const client = await connectToDatabase();

        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'User Id is required' }, { status: 400 });
        }

        // First get user to delete their image
        const currentUser = await client.query('SELECT id, image FROM users WHERE id = $1', [id]);
        
        if (currentUser.rows.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // SECURITY: IDOR Fix - Admin-only delete
        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }

        const imageUrl = currentUser.rows[0]?.image;

        const query = `
            DELETE FROM users 
            WHERE id = $1
            RETURNING *;
        `;

        const { rows: deletedUser } = await client.query(query, [id]);

        if (deletedUser.length === 0) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Delete associated image file
        if (imageUrl) {
            await deleteFile(imageUrl);
        }

        // Log the user deletion action
        await actionLogger.delete(req, ENTITY_TYPES.USER, deletedUser[0].id, deletedUser[0].name, {
            email: deletedUser[0].email,
            role: deletedUser[0].role,
            contact: deletedUser[0].contact_number,
            hadImage: !!imageUrl
        });

        return NextResponse.json({ 
            message: 'User deleted successfully', 
            user: deletedUser[0] 
        }, { status: 200 });

    } catch (error) {
        console.error('Error deleting user:', error);
        return NextResponse.json({ 
            error: error.message || 'Error deleting user' 
        }, { status: 500 });
    }
}