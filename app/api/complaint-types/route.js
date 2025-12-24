import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAuth } from '@/lib/authMiddleware';

export async function GET(request) {
    // SECURITY: Require authentication
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
  try {
    const client = await connectToDatabase();
    
    const query = `
      SELECT 
        ct.id,
        ct.type_name,
        ct.description,
        ct.created_date
      FROM complaint_types ct
      ORDER BY ct.type_name ASC
    `;
    
    const result = await client.query(query);
    
    return NextResponse.json({
      success: true,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Error fetching complaint types:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch complaint types' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
    // SECURITY: Require authentication
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    
  try {
    const { type_name, description } = await request.json();
    
    if (!type_name || !type_name.trim()) {
      return NextResponse.json(
        { success: false, message: 'Type name is required' },
        { status: 400 }
      );
    }
    
    const client = await connectToDatabase();
    
    const query = `
      INSERT INTO complaint_types (type_name, description, created_date)
      VALUES ($1, $2, NOW())
      RETURNING *
    `;
    
    const result = await client.query(query, [type_name.trim(), description?.trim() || null]);
    
    return NextResponse.json({
      success: true,
      data: result.rows[0],
      message: 'Complaint type created successfully'
    });
    
  } catch (error) {
    console.error('Error creating complaint type:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create complaint type' },
      { status: 500 }
    );
  }
}
