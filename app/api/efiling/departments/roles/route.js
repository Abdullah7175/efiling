import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';
import { getUserGeography, isGlobalRoleCode } from '@/lib/efilingGeographicRouting';

/**
 * GET /api/efiling/departments/roles
 * Get all roles (alias for /api/efiling/roles for backward compatibility)
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const isActive = searchParams.get('is_active');

        const client = await connectToDatabase();

        try {
            const session = await auth();
            let userGeography = null;
            let canSeeAll = false;

            if (session?.user) {
                if ([1, 2].includes(parseInt(session.user.role))) {
                    canSeeAll = true;
                } else {
                    userGeography = await getUserGeography(client, session.user.id);
                    if (userGeography && isGlobalRoleCode(userGeography.role_code)) {
                        canSeeAll = true;
                    }
                }
            }

            if (id) {
                // Fetch single role by ID
                const query = `
                    SELECT r.*, d.name as department_name
                    FROM efiling_roles r
                    LEFT JOIN efiling_departments d ON r.department_id = d.id
                    WHERE r.id = $1
                `;
                
                const result = await client.query(query, [id]);
                
                if (result.rows.length === 0) {
                    return NextResponse.json(
                        { error: 'Role not found' },
                        { status: 404 }
                    );
                }

                return NextResponse.json(result.rows[0]);
            } else {
                // Check if efiling_role_locations table exists
                let hasRoleLocationsTable = false;
                try {
                    const tableCheck = await client.query(`
                        SELECT EXISTS (
                            SELECT FROM information_schema.tables 
                            WHERE table_schema = 'public' 
                            AND table_name = 'efiling_role_locations'
                        );
                    `);
                    hasRoleLocationsTable = tableCheck.rows[0]?.exists || false;
                } catch (tableError) {
                    console.warn('Could not check for efiling_role_locations table:', tableError.message);
                }

                // Fetch all roles
                let query = `
                    SELECT DISTINCT r.*, d.name as department_name
                    FROM efiling_roles r
                    LEFT JOIN efiling_departments d ON r.department_id = d.id
                    ${hasRoleLocationsTable ? 'LEFT JOIN efiling_role_locations rl ON rl.role_id = r.id' : ''}
                `;
                
                const params = [];
                const conditions = [];

                if (isActive !== null) {
                    conditions.push(`r.is_active = $${params.length + 1}`);
                    params.push(isActive === 'true');
                }

                // Apply geography filters if user is not admin and has geography
                if (!canSeeAll && userGeography) {
                    const locationParts = [];
                    const pushParam = (value) => {
                        params.push(value);
                        return `$${params.length}`;
                    };

                    if (hasRoleLocationsTable) {
                        if (userGeography.division_id) {
                            locationParts.push(`rl.division_id = ${pushParam(userGeography.division_id)}`);
                        }
                        if (userGeography.district_id) {
                            locationParts.push(`rl.district_id = ${pushParam(userGeography.district_id)}`);
                        }
                        if (userGeography.town_id) {
                            locationParts.push(`rl.town_id = ${pushParam(userGeography.town_id)}`);
                        }

                        if (locationParts.length > 0) {
                            conditions.push(`(rl.id IS NULL OR ${locationParts.join(' OR ')})`);
                        }
                    }
                }

                if (conditions.length > 0) {
                    query += ` WHERE ${conditions.join(' AND ')}`;
                }

                query += ` ORDER BY r.name ASC`;

                const result = await client.query(query, params);

                // Return as array for backward compatibility (frontend expects array or { roles: [] })
                return NextResponse.json(result.rows);
            }

        } finally {
            await client.release();
        }

    } catch (error) {
        console.error('Error fetching roles:', error);
        return NextResponse.json(
            { error: 'Failed to fetch roles', details: error.message },
            { status: 500 }
        );
    }
}

