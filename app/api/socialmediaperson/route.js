import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { actionLogger, ENTITY_TYPES } from '@/lib/actionLogger';

const uploadDir = path.join(process.cwd(), 'public/uploads/socialmediaagents');
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
  return `/uploads/socialmediaagents/${uniqueName}`;
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const work_request_id = searchParams.get('work_request_id');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;
    const filter = searchParams.get('filter') || '';
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    let client;
    try {
        client = await connectToDatabase();
        if (id) {
            const query = 'SELECT * FROM socialmediaperson WHERE id = $1';
            const result = await client.query(query, [id]);
            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Videographer not found' }, { status: 404 });
            }
            return NextResponse.json(result.rows[0], { status: 200 });
        } else if (work_request_id) {
            // Fetch social media agents assigned to a specific work request
            const query = `
                SELECT DISTINCT sm.*
                FROM socialmediaperson sm
                JOIN request_assign_smagent ras ON sm.id = ras.socialmedia_agent_id
                WHERE ras.work_requests_id = $1
                ORDER BY sm.name
            `;
            const result = await client.query(query, [work_request_id]);
            return NextResponse.json({ data: result.rows }, { status: 200 });
        } else {
            let countQuery = 'SELECT COUNT(*) FROM socialmediaperson';
            let dataQuery = 'SELECT * FROM socialmediaperson';
            let params = [];
            let whereClauses = [];
            if (filter) {
                whereClauses.push('(' +
                    'CAST(id AS TEXT) ILIKE $' + (params.length + 1) + ' OR ' +
                    'name ILIKE $' + (params.length + 1) + ' OR ' +
                    'email ILIKE $' + (params.length + 1) + ' OR ' +
                    'contact_number ILIKE $' + (params.length + 1) + ' OR ' +
                    'address ILIKE $' + (params.length + 1) + ' OR ' +
                    'CAST(role AS TEXT) ILIKE $' + (params.length + 1) +
                ')');
                params.push(`%${filter}%`);
            }
            if (dateFrom) {
                whereClauses.push('created_at >= $' + (params.length + 1));
                params.push(dateFrom);
            }
            if (dateTo) {
                whereClauses.push('created_at <= $' + (params.length + 1));
                params.push(dateTo);
            }
            if (whereClauses.length > 0) {
                countQuery += ' WHERE ' + whereClauses.join(' AND ');
                dataQuery += ' WHERE ' + whereClauses.join(' AND ');
            }
            dataQuery += ' ORDER BY id DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
            params.push(limit, offset);
            const countResult = await client.query(countQuery, params.slice(0, -2));
            const total = parseInt(countResult.rows[0].count, 10);
            const result = await client.query(dataQuery, params);
            return NextResponse.json({ data: result.rows, total }, { status: 200 });
        }
    } catch (error) {
        console.error('Error fetching social media person data:', error);
        return NextResponse.json({ error: 'Failed to fetch data', details: error.message }, { status: 500 });
    } finally {
        if (client && client.release) {
            client.release();
        }
    }
}

export async function POST(req) {
    let client;
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
        if (imageFile && imageFile.size > 0) {
            imageUrl = await saveUploadedFile(imageFile);
        }
        client = await connectToDatabase();
        if (!password || !role) {
            return NextResponse.json({ error: 'Password and role are required' }, { status: 400 });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = `
      INSERT INTO socialmediaperson (name, email, contact_number, address, role, password, image)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;
    `;
        const { rows: newAgent } = await client.query(query, [
            name,
            email,
            contact,
            address,
            role,
            hashedPassword,
            imageUrl,
        ]);
        
        // Log the social media person creation action
        await actionLogger.create(req, ENTITY_TYPES.SOCIALMEDIAPERSON, newAgent[0].id, newAgent[0].name, {
            email: newAgent[0].email,
            contact: newAgent[0].contact_number,
            address: newAgent[0].address,
            role: newAgent[0].role,
            hasImage: !!imageUrl
        });
        
        return NextResponse.json({ message: 'Videographer added successfully', agent: newAgent[0] }, { status: 201 });
    } catch (error) {
        console.error('Error saving Videographer:', error);
        return NextResponse.json({ error: 'Error saving Videographer', details: error.message }, { status: 500 });
    } finally {
        if (client && client.release) {
            client.release();
        }
    }
}

export async function PUT(req) {
    let client;
    try {
        const formData = await req.formData();
        const id = formData.get('id');
        const name = formData.get('name');
        const email = formData.get('email');
        const contact = formData.get('contact');
        const address = formData.get('address');
        const role = formData.get('role');
        client = await connectToDatabase();

        if (!id || !name || !email || !contact || !address || !role) {
            return NextResponse.json({ error: 'All fields (id, name, email, contact, address, role) are required' }, { status: 400 });
        }

        const query = `
            UPDATE socialmediaperson 
            SET name = $1, email = $2, contact_number = $3, address = $4, role = $5
            WHERE id = $6
            RETURNING *;
        `; 
        const { rows: updatedSocialagent } = await client.query(query, [
            name,
            email,
            contact,
            address,
            role,
            id
        ]);

        if (updatedSocialagent.length === 0) {
            return NextResponse.json({ error: 'Videographer not found' }, { status: 404 });
        }

        // Log the social media person update action
        await actionLogger.update(req, ENTITY_TYPES.SOCIALMEDIAPERSON, updatedSocialagent[0].id, updatedSocialagent[0].name, {
            email: updatedSocialagent[0].email,
            contact: updatedSocialagent[0].contact_number,
            address: updatedSocialagent[0].address,
            role: updatedSocialagent[0].role
        });

        return NextResponse.json({ message: 'Videographer updated successfully', agent: updatedSocialagent[0] }, { status: 200 });

    } catch (error) {
        console.error('Error updating Videographer:', error);
        return NextResponse.json({ error: 'Error updating Videographer', details: error.message }, { status: 500 });
    } finally {
        if (client && client.release) {
            client.release();
        }
    }
}

export async function DELETE(req) {
    let client;
    try {
        const body = await req.json();
        client = await connectToDatabase();

        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'Videographer Id is required' }, { status: 400 });
        }

        const query = `
            DELETE FROM socialmediaperson 
            WHERE id = $1
            RETURNING *;
        `;

        const { rows: deletedSocialagent } = await client.query(query, [id]);

        if (deletedSocialagent.length === 0) {
            return NextResponse.json({ error: 'Videographer not found' }, { status: 404 });
        }

        // Log the social media person deletion action
        await actionLogger.delete(req, ENTITY_TYPES.SOCIALMEDIAPERSON, deletedSocialagent[0].id, deletedSocialagent[0].name, {
            email: deletedSocialagent[0].email,
            contact: deletedSocialagent[0].contact_number,
            address: deletedSocialagent[0].address,
            role: deletedSocialagent[0].role
        });

        return NextResponse.json({ message: 'Videographer deleted successfully', user: deletedSocialagent[0] }, { status: 200 });

    } catch (error) {
        console.error('Error deleting Videographer:', error);
        return NextResponse.json({ error: 'Error deleting Videographer', details: error.message }, { status: 500 });
    } finally {
        if (client && client.release) {
            client.release();
        }
    }
}
