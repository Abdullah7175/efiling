import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const client = await connectToDatabase();
    
    const query = `
      SELECT 
        ct.id,
        ct.type_name,
        ct.description,
        ct.created_date,
        COUNT(DISTINCT st.id) as subtype_count,
        COUNT(DISTINCT cu.id) as assigned_ce_count
      FROM complaint_types ct
      LEFT JOIN subtypes st ON ct.id = st.complaint_type_id
      LEFT JOIN ce_users cu ON ct.id = ANY(cu.assigned_department_ids)
      WHERE ct.id = $1
      GROUP BY ct.id, ct.type_name, ct.description, ct.created_date
    `;
    
    const result = await client.query(query, [id]);
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Complaint type not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error fetching complaint type:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch complaint type' },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const { type_name, description } = await request.json();
    
    if (!type_name || !type_name.trim()) {
      return NextResponse.json(
        { success: false, message: 'Type name is required' },
        { status: 400 }
      );
    }
    
    const client = await connectToDatabase();
    
    const query = `
      UPDATE complaint_types 
      SET type_name = $1, description = $2
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await client.query(query, [type_name.trim(), description?.trim() || null, id]);
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Complaint type not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: result.rows[0],
      message: 'Complaint type updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating complaint type:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update complaint type' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const client = await connectToDatabase();
    
    // Check if there are any subtypes or CE users assigned to this complaint type
    const checkQuery = `
      SELECT 
        COUNT(DISTINCT st.id) as subtype_count,
        COUNT(DISTINCT cu.id) as assigned_ce_count
      FROM complaint_types ct
      LEFT JOIN subtypes st ON ct.id = st.complaint_type_id
      LEFT JOIN ce_users cu ON ct.id = ANY(cu.assigned_department_ids)
      WHERE ct.id = $1
      GROUP BY ct.id
    `;
    
    const checkResult = await client.query(checkQuery, [id]);
    
    if (checkResult.rows.length > 0) {
      const { subtype_count, assigned_ce_count } = checkResult.rows[0];
      
      if (parseInt(subtype_count) > 0) {
        return NextResponse.json(
          { success: false, message: 'Cannot delete complaint type with existing subtypes' },
          { status: 400 }
        );
      }
      
      if (parseInt(assigned_ce_count) > 0) {
        return NextResponse.json(
          { success: false, message: 'Cannot delete complaint type with assigned CE users' },
          { status: 400 }
        );
      }
    }
    
    const deleteQuery = `DELETE FROM complaint_types WHERE id = $1 RETURNING *`;
    const result = await client.query(deleteQuery, [id]);
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Complaint type not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Complaint type deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting complaint type:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete complaint type' },
      { status: 500 }
    );
  }
}
