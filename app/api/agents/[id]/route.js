import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const uploadDir = path.join(process.cwd(), 'public/uploads/agents');
async function ensureUploadDir() {
  await fs.mkdir(uploadDir, { recursive: true });
}
async function saveUploadedFile(file) {
  // Validate file size (5MB max for profile images)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File size exceeds limit. Maximum allowed: 5MB');
  }
  await ensureUploadDir();
  const buffer = await file.arrayBuffer();
  const uniqueName = `${uuidv4()}${path.extname(file.name)}`;
  const filePath = path.join(uploadDir, uniqueName);
  await fs.writeFile(filePath, Buffer.from(buffer));
  return `/uploads/agents/${uniqueName}`;
}

export async function GET(request, { params }) {
    const { id } = await params;
    
    // SECURITY: Require authentication
    const { auth } = await import('@/auth');
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await connectToDatabase();
    try {
        const query = 'SELECT * FROM agents WHERE id = $1';
        const result = await client.query(query, [id]);
        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }

        // SECURITY: IDOR Fix - Admin-only access for agent data
        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }

        return NextResponse.json(result.rows[0], { status: 200 });
    } catch (error) {
        console.error('Error fetching agent:', error);
        return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
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
        const designation = formData.get('designation');
        const contact = formData.get('contact');
        const address = formData.get('address');
        const department = formData.get('department');
        const email = formData.get('email');
        const company_name = formData.get('company_name');
        const town_id = formData.get('town_id');
        const division_id = formData.get('division_id');
        const password = formData.get('password');
        const complaint_type_id = formData.get('complaint_type_id');
        const role = formData.get('role');
        const imageFile = formData.get('image');
        let imageUrl = null;
        const normalizedTownId = town_id ? Number(town_id) : null;
        const normalizedDivisionId = division_id ? Number(division_id) : null;
        const normalizedRole = role ? Number(role) : null;
        const normalizedComplaintTypeId = complaint_type_id ? Number(complaint_type_id) : null;

        const client = await connectToDatabase();
        
        // Get current agent data to check role
        const currentQuery = 'SELECT role, image FROM agents WHERE id = $1';
        const currentResult = await client.query(currentQuery, [id]);
        if (currentResult.rows.length === 0) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }
        const currentRole = normalizedRole || currentResult.rows[0].role;
        imageUrl = currentResult.rows[0]?.image || null;
        
        // Contractor-specific validations
        if (currentRole === 2) {
            // Contractors require company_name
            if (!company_name || company_name.trim() === '') {
                return NextResponse.json({ error: 'Company name is required for contractors' }, { status: 400 });
            }
            // Contractors don't need town, division, or department
        } else {
            // Non-contractors require location
            if (!normalizedTownId && !normalizedDivisionId) {
                return NextResponse.json(
                    { error: 'Either town or division must be selected for agent location' },
                    { status: 400 }
                );
            }
        }
        
        if (imageFile && imageFile.size > 0) {
            imageUrl = await saveUploadedFile(imageFile);
        }
        let query, paramsArr;
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query = `
                UPDATE agents 
                SET name = $1, designation = $2, contact_number = $3, address = $4 , department = $5, email = $6, company_name = $7, town_id = $8, division_id = $9, complaint_type_id = $10, role = $11, password = $12, image = $13, updated_date = NOW()
                WHERE id = $14
                RETURNING *;
            `;
            paramsArr = [
                name,
                designation,
                contact,
                address,
                department,
                email,
                company_name || null,
                normalizedTownId,
                normalizedDivisionId,
                normalizedComplaintTypeId,
                normalizedRole,
                hashedPassword,
                imageUrl,
                id
            ];
        } else {
            query = `
                UPDATE agents 
                SET name = $1, designation = $2, contact_number = $3, address = $4 , department = $5, email = $6, company_name = $7, town_id = $8, division_id = $9, complaint_type_id = $10, role = $11, image = $12, updated_date = NOW()
                WHERE id = $13
                RETURNING *;
            `;
            paramsArr = [
                name,
                designation,
                contact,
                address,
                department,
                email,
                company_name || null,
                normalizedTownId,
                normalizedDivisionId,
                normalizedComplaintTypeId,
                normalizedRole,
                imageUrl,
                id
            ];
        }
        const { rows: updatedAgent } = await client.query(query, paramsArr);
        if (updatedAgent.length === 0) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }
        return NextResponse.json({ message: 'Agent updated successfully', agent: updatedAgent[0] }, { status: 200 });
    } catch (error) {
        console.error('Error updating agent:', error);
        return NextResponse.json({ error: 'Error updating agent' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
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
        const client = await connectToDatabase();
        const query = 'DELETE FROM agents WHERE id = $1 RETURNING *;';
        const { rows: deletedAgent } = await client.query(query, [id]);
        if (deletedAgent.length === 0) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }
        return NextResponse.json({ message: 'Agent deleted successfully', agent: deletedAgent[0] }, { status: 200 });
    } catch (error) {
        console.error('Error deleting agent:', error);
        return NextResponse.json({ error: 'Error deleting agent' }, { status: 500 });
    }
} 