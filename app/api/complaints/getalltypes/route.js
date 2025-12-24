
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAuth } from '@/lib/authMiddleware';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    // SECURITY: Require authentication
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    const client = await connectToDatabase();

    try {
        // Check if complaint_type_divisions bridge table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'complaint_type_divisions'
            );
        `);
        
        const hasBridgeTable = tableCheck.rows[0]?.exists || false;
        
        let query;
        if (hasBridgeTable) {
            // Use bridge table for multiple divisions support
            query = `
                SELECT 
                    ct.*,
                    ct.division_id as single_division_id,
                    d.name as division_name,
                    ed.department_type as efiling_department_type,
                    -- Check if complaint type has divisions (from bridge table or direct column)
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 FROM complaint_type_divisions ctd 
                            WHERE ctd.complaint_type_id = ct.id
                        ) THEN true
                        WHEN ct.division_id IS NOT NULL THEN true
                        WHEN ct.efiling_department_id IS NOT NULL AND ed.department_type = 'division' THEN true
                        ELSE false
                    END as is_division_based,
                    -- Get divisions array from bridge table (use subquery to avoid aggregation issues)
                    COALESCE(
                        (SELECT json_agg(jsonb_build_object('id', d2.id, 'name', d2.name))
                         FROM complaint_type_divisions ctd
                         LEFT JOIN divisions d2 ON ctd.division_id = d2.id
                         WHERE ctd.complaint_type_id = ct.id AND d2.id IS NOT NULL),
                        NULL
                    ) as divisions_from_bridge,
                    -- Fallback to single division if bridge table has no entries
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 FROM complaint_type_divisions ctd 
                            WHERE ctd.complaint_type_id = ct.id
                        ) THEN NULL
                        WHEN ct.division_id IS NOT NULL THEN 
                            json_build_array(jsonb_build_object('id', d.id, 'name', d.name))
                        ELSE '[]'::json
                    END as divisions_from_direct
                FROM complaint_types ct
                LEFT JOIN divisions d ON ct.division_id = d.id
                LEFT JOIN efiling_departments ed ON ct.efiling_department_id = ed.id
                ORDER BY ct.type_name ASC
            `;
        } else {
            // Fallback to direct division_id column
            query = `
                SELECT 
                    ct.*,
                    d.name as division_name,
                    ed.department_type as efiling_department_type,
                    -- Check if complaint type is division-based
                    CASE 
                        WHEN ct.division_id IS NOT NULL THEN true
                        WHEN ct.efiling_department_id IS NOT NULL AND ed.department_type = 'division' THEN true
                        ELSE false
                    END as is_division_based,
                    -- Return single division as array for consistency
                    CASE 
                        WHEN ct.division_id IS NOT NULL THEN 
                            json_build_array(jsonb_build_object('id', d.id, 'name', d.name))
                        ELSE '[]'::json
                    END as divisions
                FROM complaint_types ct
                LEFT JOIN divisions d ON ct.division_id = d.id
                LEFT JOIN efiling_departments ed ON ct.efiling_department_id = ed.id
                ORDER BY ct.type_name ASC
            `;
        }
        
        const result = await client.query(query);
        
        // Process results to combine divisions_from_bridge and divisions_from_direct
        const processedRows = result.rows.map(row => {
            // Combine divisions from bridge table and direct column
            let divisions = [];
            if (row.divisions_from_bridge && Array.isArray(row.divisions_from_bridge)) {
                divisions = row.divisions_from_bridge;
            } else if (row.divisions_from_direct && Array.isArray(row.divisions_from_direct)) {
                divisions = row.divisions_from_direct;
            }
            
            return {
                ...row,
                divisions: divisions,
                // Remove intermediate fields
                divisions_from_bridge: undefined,
                divisions_from_direct: undefined
            };
        });
        
        return NextResponse.json(processedRows, { status: 200 });
    } catch (error) {
        console.error('Error fetching data:', error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    } finally {
        if (client && client.release) {
            client.release();
        }
    }
}

