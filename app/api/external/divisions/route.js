import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { validateApiKey, checkRateLimit, getRateLimitHeaders } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/external/divisions
 * List all divisions (read-only for video archiving system)
 * Query params: id, active=true, department_id=123
 */
export async function GET(request) {
    // Validate API key
    const authError = validateApiKey(request);
    if (authError) return authError;
    
    // Check rate limit
    const rateLimitError = checkRateLimit(request);
    if (rateLimitError) return rateLimitError;
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const active = searchParams.get('active');
    const departmentId = searchParams.get('department_id');
    
    let client;
    try {
        client = await connectToDatabase();
        
        if (id) {
            // Get specific division
            const result = await client.query(
                `SELECT 
                    id, 
                    name, 
                    code, 
                    ce_type, 
                    department_id, 
                    description, 
                    is_active, 
                    created_at, 
                    updated_at 
                FROM divisions 
                WHERE id = $1`,
                [id]
            );
            
            if (result.rows.length === 0) {
                return NextResponse.json(
                    { error: 'Division not found' },
                    { status: 404 }
                );
            }
            
            return NextResponse.json({
                data: result.rows[0]
            }, {
                headers: getRateLimitHeaders(request)
            });
        }
        
        // List divisions with filters
        let query = `
            SELECT 
                id, 
                name, 
                code, 
                ce_type, 
                department_id, 
                description, 
                is_active, 
                created_at, 
                updated_at 
            FROM divisions 
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;
        
        if (active === 'true') {
            query += ` AND is_active = $${paramIndex}`;
            params.push(true);
            paramIndex++;
        } else if (active === 'false') {
            query += ` AND is_active = $${paramIndex}`;
            params.push(false);
            paramIndex++;
        }
        
        if (departmentId) {
            query += ` AND department_id = $${paramIndex}`;
            params.push(parseInt(departmentId));
            paramIndex++;
        }
        
        query += ' ORDER BY name ASC';
        
        const result = await client.query(query, params);
        
        return NextResponse.json({
            data: result.rows,
            count: result.rows.length
        }, {
            headers: getRateLimitHeaders(request)
        });
        
    } catch (error) {
        console.error('Error fetching divisions:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    } finally {
        if (client && typeof client.release === 'function') {
            client.release();
        }
    }
}

