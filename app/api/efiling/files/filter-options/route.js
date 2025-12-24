import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await connectToDatabase();
    
    try {
        // Fetch all filter options in parallel
        const [
            districtsResult,
            townsResult,
            divisionsResult,
            zonesResult,
            categoriesResult,
            fileTypesResult
        ] = await Promise.all([
            // Districts
            client.query(`
                SELECT DISTINCT d.id, d.title as name
                FROM district d
                JOIN efiling_files f ON f.district_id = d.id
                ORDER BY d.title
            `).catch(() => ({ rows: [] })),
            
            // Towns
            client.query(`
                SELECT DISTINCT t.id, t.town as name, d.title as district_name
                FROM town t
                LEFT JOIN district d ON t.district_id = d.id
                JOIN efiling_files f ON f.town_id = t.id
                ORDER BY d.title, t.town
            `).catch(() => ({ rows: [] })),
            
            // Divisions
            client.query(`
                SELECT DISTINCT d.id, d.name, d.code
                FROM divisions d
                JOIN efiling_files f ON f.division_id = d.id
                WHERE d.is_active = true
                ORDER BY d.name
            `).catch(() => ({ rows: [] })),
            
            // Zones
            client.query(`
                SELECT DISTINCT ez.id, ez.name
                FROM efiling_zones ez
                JOIN efiling_files f ON f.zone_id = ez.id
                WHERE ez.is_active = true
                ORDER BY ez.name
            `).catch(() => ({ rows: [] })),
            
            // Categories
            client.query(`
                SELECT DISTINCT fc.id, fc.name, fc.code
                FROM efiling_file_categories fc
                JOIN efiling_files f ON f.category_id = fc.id
                WHERE fc.is_active = true
                ORDER BY fc.name
            `).catch(() => ({ rows: [] })),
            
            // File Types
            client.query(`
                SELECT DISTINCT ft.id, ft.name, ft.code
                FROM efiling_file_types ft
                JOIN efiling_files f ON f.file_type_id = ft.id
                WHERE ft.is_active = true
                ORDER BY ft.name
            `).catch(() => ({ rows: [] }))
        ]);

        return NextResponse.json({
            districts: districtsResult.rows,
            towns: townsResult.rows,
            divisions: divisionsResult.rows,
            zones: zonesResult.rows,
            categories: categoriesResult.rows,
            fileTypes: fileTypesResult.rows
        });
    } catch (error) {
        console.error('Error fetching filter options:', error);
        return NextResponse.json({ error: 'Failed to fetch filter options' }, { status: 500 });
    } finally {
        client.release();
    }
}

