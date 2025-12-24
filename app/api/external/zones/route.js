import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { validateApiKey, checkRateLimit, getRateLimitHeaders } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/**
 * Helper function to fetch zones with locations
 */
async function fetchZonesWithLocations(client, zoneIds) {
    if (!zoneIds.length) return new Map();
    const { rows } = await client.query(
        `SELECT zl.zone_id,
                zl.district_id,
                d.title AS district_name,
                zl.town_id,
                t.town AS town_name
         FROM efiling_zone_locations zl
         LEFT JOIN district d ON d.id = zl.district_id
         LEFT JOIN town t ON t.id = zl.town_id
         WHERE zl.zone_id = ANY($1::int[])`,
        [zoneIds]
    );
    const map = new Map();
    for (const row of rows) {
        if (!map.has(row.zone_id)) {
            map.set(row.zone_id, []);
        }
        map.get(row.zone_id).push({
            district_id: row.district_id,
            district_name: row.district_name,
            town_id: row.town_id,
            town_name: row.town_name,
        });
    }
    return map;
}

/**
 * GET /api/external/zones
 * List all zones (read-only for video archiving system)
 * Query params: id, active=true
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
    
    let client;
    try {
        client = await connectToDatabase();
        
        if (id) {
            // Get specific zone
            const zoneId = Number(id);
            if (Number.isNaN(zoneId)) {
                return NextResponse.json(
                    { error: 'Invalid zone id' },
                    { status: 400 }
                );
            }
            
            const zoneRes = await client.query(
                `SELECT 
                    id, 
                    name, 
                    ce_type, 
                    description, 
                    is_active, 
                    created_at, 
                    updated_at 
                FROM efiling_zones 
                WHERE id = $1`,
                [zoneId]
            );
            
            if (zoneRes.rows.length === 0) {
                return NextResponse.json(
                    { error: 'Zone not found' },
                    { status: 404 }
                );
            }
            
            const zone = zoneRes.rows[0];
            const locationsMap = await fetchZonesWithLocations(client, [zoneId]);
            zone.locations = locationsMap.get(zone.id) || [];
            
            return NextResponse.json({
                data: zone
            }, {
                headers: getRateLimitHeaders(request)
            });
        }
        
        // List zones with filters
        let query = `
            SELECT 
                id, 
                name, 
                ce_type, 
                description, 
                is_active, 
                created_at, 
                updated_at 
            FROM efiling_zones
        `;
        const params = [];
        let paramIndex = 1;
        
        if (active === 'true') {
            query += ` WHERE is_active = $${paramIndex}`;
            params.push(true);
            paramIndex++;
        } else if (active === 'false') {
            query += ` WHERE is_active = $${paramIndex}`;
            params.push(false);
            paramIndex++;
        }
        
        query += ' ORDER BY name ASC';
        
        const result = await client.query(query, params);
        const zones = result.rows;
        
        // Fetch locations for all zones
        const locationsMap = await fetchZonesWithLocations(
            client, 
            zones.map((z) => z.id)
        );
        
        // Enrich zones with locations
        const enriched = zones.map((zone) => ({
            ...zone,
            locations: locationsMap.get(zone.id) || [],
        }));
        
        return NextResponse.json({
            data: enriched,
            count: enriched.length
        }, {
            headers: getRateLimitHeaders(request)
        });
        
    } catch (error) {
        console.error('Error fetching zones:', error);
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

