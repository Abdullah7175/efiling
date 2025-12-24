import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const uploadDir = path.join(process.cwd(), 'public/uploads/socialmediaagents');
async function ensureUploadDir() {
  await fs.mkdir(uploadDir, { recursive: true });
}
async function saveUploadedFile(file) {
  await ensureUploadDir();
  const buffer = await file.arrayBuffer();
  const uniqueName = `${uuidv4()}${path.extname(file.name)}`;
  const filePath = path.join(uploadDir, uniqueName);
  await fs.writeFile(filePath, Buffer.from(buffer));
  return `/uploads/socialmediaagents/${uniqueName}`;
}

export async function GET(request, { params }) {
    const { id } = await params;
    
    // SECURITY: Require authentication
    const { auth } = await import('@/auth');
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // SECURITY: IDOR Fix - Admin-only access
    const isAdmin = [1, 2].includes(parseInt(session.user.role));
    if (!isAdmin) {
        return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const client = await connectToDatabase();
    try {
        const query = 'SELECT * FROM socialmediaperson WHERE id = $1';
        const result = await client.query(query, [id]);
        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Videographer not found' }, { status: 404 });
        }
        return NextResponse.json(result.rows[0], { status: 200 });
    } catch (error) {
        console.error('Error fetching videographer:', error);
        return NextResponse.json({ error: 'Failed to fetch videographer' }, { status: 500 });
    } finally {
        client.release && client.release();
    }
}

export async function PUT(req, { params }) {
    const { id } = await params;
    
    // SECURITY: Require authentication
    const { auth } = await import('@/auth');
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // SECURITY: IDOR Fix - Admin-only access
    const isAdmin = [1, 2].includes(parseInt(session.user.role));
    if (!isAdmin) {
        return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    try {
        const formData = await req.formData();
        const name = formData.get('name');
        const email = formData.get('email');
        const contact = formData.get('contact');
        const address = formData.get('address');
        const password = formData.get('password');
        const role = formData.get('role');
        const imageFile = formData.get('image');
        let imageUrl = null;
        const client = await connectToDatabase();
        // Get current image if exists
        const currentQuery = 'SELECT image FROM socialmediaperson WHERE id = $1';
        const currentResult = await client.query(currentQuery, [id]);
        imageUrl = currentResult.rows[0]?.image || null;
        if (imageFile && imageFile.size > 0) {
            imageUrl = await saveUploadedFile(imageFile);
        }
        let query, paramsArr;
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query = `
                UPDATE socialmediaperson 
                SET name = $1, email = $2, contact_number = $3, address = $4, role = $5, password = $6, image = $7
                WHERE id = $8
                RETURNING *;
            `;
            paramsArr = [name, email, contact, address, role, hashedPassword, imageUrl, id];
        } else {
            query = `
                UPDATE socialmediaperson 
                SET name = $1, email = $2, contact_number = $3, address = $4, role = $5, image = $6
                WHERE id = $7
                RETURNING *;
            `;
            paramsArr = [name, email, contact, address, role, imageUrl, id];
        }
        const { rows: updatedAgent } = await client.query(query, paramsArr);
        if (updatedAgent.length === 0) {
            return NextResponse.json({ error: 'Videographer not found' }, { status: 404 });
        }
        return NextResponse.json({ message: 'Videographer updated successfully', agent: updatedAgent[0] }, { status: 200 });
    } catch (error) {
        console.error('Error updating videographer:', error);
        return NextResponse.json({ error: 'Error updating videographer' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    const { id } = await params;
    try {
        const client = await connectToDatabase();
        const query = 'DELETE FROM socialmediaperson WHERE id = $1 RETURNING *;';
        const { rows: deletedAgent } = await client.query(query, [id]);
        if (deletedAgent.length === 0) {
            return NextResponse.json({ error: 'Videographer not found' }, { status: 404 });
        }
        return NextResponse.json({ message: 'Videographer deleted successfully', agent: deletedAgent[0] }, { status: 200 });
    } catch (error) {
        console.error('Error deleting videographer:', error);
        return NextResponse.json({ error: 'Error deleting videographer' }, { status: 500 });
    }
} 