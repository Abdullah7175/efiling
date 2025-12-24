import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';
import { getUserGeography, isGlobalRoleCode } from '@/lib/efilingGeographicRouting';

export async function GET(request) {
    let client;
    try {
        client = await connectToDatabase();
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const isActive = searchParams.get('is_active');

        const session = await auth(request);
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
            const res = await client.query(
                'SELECT * FROM efiling_role_groups WHERE id = $1',
                [id]
            );
            if (res.rows.length === 0) {
                return NextResponse.json({ error: 'Role group not found' }, { status: 404 });
            }
            return NextResponse.json(res.rows[0]);
        }

        let query = `
            SELECT DISTINCT rg.*
            FROM efiling_role_groups rg
            LEFT JOIN efiling_role_group_locations rgl ON rgl.role_group_id = rg.id
        `;
        const params = [];
        const conditions = [];
        if (isActive !== null) {
            conditions.push(`rg.is_active = $${params.length + 1}`);
            params.push(isActive === 'true');
        }

        if (!canSeeAll && userGeography) {
            const parts = [];
            const pushParam = (value) => {
                params.push(value);
                return `$${params.length}`;
            };

            if (userGeography.zone_ids && userGeography.zone_ids.length > 0) {
                const placeholder = pushParam(userGeography.zone_ids);
                parts.push(`rgl.zone_id = ANY(${placeholder}::int[])`);
            }
            if (userGeography.division_id) {
                parts.push(`rgl.division_id = ${pushParam(userGeography.division_id)}`);
            }
            if (userGeography.district_id) {
                parts.push(`rgl.district_id = ${pushParam(userGeography.district_id)}`);
            }
            if (userGeography.town_id) {
                parts.push(`rgl.town_id = ${pushParam(userGeography.town_id)}`);
            }

            if (parts.length > 0) {
                conditions.push(`(rgl.id IS NULL OR ${parts.join(' OR ')})`);
            }
        }

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }
        query += ' ORDER BY rg.name ASC';
        const res = await client.query(query, params);
        return NextResponse.json({ success: true, roleGroups: res.rows });
    } catch (error) {
        console.error('Error fetching role groups:', error);
        return NextResponse.json({ error: 'Failed to fetch role groups' }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}

export async function POST(request) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.role || parseInt(session.user.role) !== 1 || session.user.id !== '1') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const body = await request.json();
        const { name, code, description, role_codes, is_active } = body;
        if (!name || !code) {
            return NextResponse.json({ error: 'Name and code are required' }, { status: 400 });
        }
        client = await connectToDatabase();
        const res = await client.query(
            `INSERT INTO efiling_role_groups (name, code, description, role_codes, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, COALESCE($5,true), NOW(), NOW())
             RETURNING *`,
            [name, code, description || null,
                Array.isArray(role_codes)
                    ? JSON.stringify(role_codes)
                    : (typeof role_codes === 'string' ? role_codes : JSON.stringify([])),
                is_active]
        );
        return NextResponse.json({ success: true, roleGroup: res.rows[0] }, { status: 201 });
    } catch (error) {
        console.error('Error creating role group:', error);
        return NextResponse.json({ error: 'Failed to create role group' }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}

export async function PUT(request) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.role || parseInt(session.user.role) !== 1 || session.user.id !== '1') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'Role group ID is required' }, { status: 400 });
        }
        const body = await request.json();
        const { name, code, description, role_codes, is_active } = body;
        client = await connectToDatabase();
        const res = await client.query(
            `UPDATE efiling_role_groups SET
                name = COALESCE($2, name),
                code = COALESCE($3, code),
                description = COALESCE($4, description),
                role_codes = COALESCE($5, role_codes),
                is_active = COALESCE($6, is_active),
                updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [
                id,
                name || null,
                code || null,
                description || null,
                Array.isArray(role_codes)
                    ? JSON.stringify(role_codes)
                    : (typeof role_codes === 'string' ? role_codes : null),
                typeof is_active === 'boolean' ? is_active : null
            ]
        );
        if (res.rows.length === 0) {
            return NextResponse.json({ error: 'Role group not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, roleGroup: res.rows[0] });
    } catch (error) {
        console.error('Error updating role group:', error);
        return NextResponse.json({ error: 'Failed to update role group' }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}

export async function DELETE(request) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.role || parseInt(session.user.role) !== 1 || session.user.id !== '1') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'Role group ID is required' }, { status: 400 });
        }
        client = await connectToDatabase();
        const res = await client.query('DELETE FROM efiling_role_groups WHERE id = $1 RETURNING id', [id]);
        if (res.rows.length === 0) {
            return NextResponse.json({ error: 'Role group not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting role group:', error);
        return NextResponse.json({ error: 'Failed to delete role group' }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}


