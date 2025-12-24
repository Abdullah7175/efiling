import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

// Helper function to get efiling user ID
async function getEfilingUserId(session, client) {
    if (session?.user && [1, 2].includes(parseInt(session.user.role))) {
        // Admin can act as any user, but we'll use their efiling profile if exists
        const adminEfiling = await client.query(
            'SELECT id FROM efiling_users WHERE user_id = $1 AND is_active = true',
            [session.user.id]
        );
        return adminEfiling.rows[0]?.id || null;
    }
    
    if (session?.user) {
        const efilingUser = await client.query(
            'SELECT id FROM efiling_users WHERE user_id = $1 AND is_active = true',
            [session.user.id]
        );
        
        return efilingUser.rows[0]?.id || null;
    }
    
    return null;
}

// Helper function to expand recipients (roles, groups, teams, departments to users)
async function expandRecipients(client, recipientType, recipientId) {
    let users = [];
    
    switch (recipientType) {
        case 'USER':
            if (recipientId) {
                const user = await client.query(
                    'SELECT id FROM efiling_users WHERE id = $1 AND is_active = true',
                    [recipientId]
                );
                if (user.rows.length > 0) users.push(user.rows[0].id);
            }
            break;
            
        case 'ROLE':
            if (recipientId) {
                const roleUsers = await client.query(
                    'SELECT id FROM efiling_users WHERE efiling_role_id = $1 AND is_active = true',
                    [recipientId]
                );
                users = roleUsers.rows.map(r => r.id);
            }
            break;
            
        case 'ROLE_GROUP':
            if (recipientId) {
                // Get role codes from the group (stored as JSONB array)
                const groupRes = await client.query(
                    `SELECT role_codes FROM efiling_role_groups WHERE id = $1 AND is_active = true`,
                    [recipientId]
                );
                if (groupRes.rows.length > 0 && groupRes.rows[0].role_codes) {
                    const roleCodes = Array.isArray(groupRes.rows[0].role_codes) 
                        ? groupRes.rows[0].role_codes 
                        : JSON.parse(groupRes.rows[0].role_codes);
                    
                    if (roleCodes.length > 0) {
                        // Get roles by codes, then get users with those roles
                        const roleUsers = await client.query(
                            `SELECT eu.id 
                             FROM efiling_users eu
                             JOIN efiling_roles r ON eu.efiling_role_id = r.id
                             WHERE r.code = ANY($1::text[]) AND eu.is_active = true`,
                            [roleCodes]
                        );
                        users = roleUsers.rows.map(r => r.id);
                    }
                }
            }
            break;
            
        case 'TEAM':
            if (recipientId) {
                // Get team members (manager and team members)
                const teamMembers = await client.query(
                    `SELECT DISTINCT team_member_id as id 
                     FROM efiling_user_teams 
                     WHERE manager_id = $1 AND is_active = true
                     UNION
                     SELECT $1 as id`,
                    [recipientId]
                );
                users = teamMembers.rows.map(r => r.id);
            }
            break;
            
        case 'DEPARTMENT':
            if (recipientId) {
                const deptUsers = await client.query(
                    'SELECT id FROM efiling_users WHERE department_id = $1 AND is_active = true',
                    [recipientId]
                );
                users = deptUsers.rows.map(r => r.id);
            }
            break;
            
        case 'EVERYONE':
            const allUsers = await client.query(
                'SELECT id FROM efiling_users WHERE is_active = true'
            );
            users = allUsers.rows.map(r => r.id);
            break;
    }
    
    return users;
}

// GET - List daak
export async function GET(request) {
    // SECURITY: Require authentication
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        client = await connectToDatabase();
        const efilingUserId = await getEfilingUserId(session, client);
        
        if (!efilingUserId && session?.user && ![1, 2].includes(parseInt(session.user.role))) {
            return NextResponse.json({ error: 'User not found in e-filing system' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = (page - 1) * limit;
        const status = searchParams.get('status');
        const categoryId = searchParams.get('category_id');
        const myDaak = searchParams.get('my_daak'); // Only daak I created
        const receivedDaak = searchParams.get('received_daak'); // Only daak I received
        const acknowledged = searchParams.get('acknowledged'); // true/false

        const isAdmin = session?.user && [1, 2].includes(parseInt(session.user.role));
        const params = [];
        let paramCount = 0;

        // Build WHERE clause conditions
        let whereConditions = [];
        let fromClause = '';
        let joinClause = '';

        if (receivedDaak === 'true' && efilingUserId) {
            // Only daak where user is a recipient
            paramCount++;
            fromClause = `
                FROM efiling_daak d
                INNER JOIN efiling_daak_recipients dr ON d.id = dr.daak_id
            `;
            joinClause = `
                LEFT JOIN efiling_daak_categories dc ON d.category_id = dc.id
                LEFT JOIN efiling_users u ON d.created_by = u.id
                LEFT JOIN efiling_departments dept ON d.department_id = dept.id
                LEFT JOIN efiling_roles r ON d.role_id = r.id
            `;
            whereConditions.push(`dr.efiling_user_id = $${paramCount}`);
            params.push(efilingUserId);
        } else if (myDaak === 'true' && efilingUserId) {
            // Only daak I created
            paramCount++;
            fromClause = `FROM efiling_daak d`;
            joinClause = `
                LEFT JOIN efiling_daak_categories dc ON d.category_id = dc.id
                LEFT JOIN efiling_users u ON d.created_by = u.id
                LEFT JOIN efiling_departments dept ON d.department_id = dept.id
                LEFT JOIN efiling_roles r ON d.role_id = r.id
            `;
            whereConditions.push(`d.created_by = $${paramCount}`);
            params.push(efilingUserId);
        } else if (isAdmin) {
            // Admins see all daak
            fromClause = `FROM efiling_daak d`;
            joinClause = `
                LEFT JOIN efiling_daak_categories dc ON d.category_id = dc.id
                LEFT JOIN efiling_users u ON d.created_by = u.id
                LEFT JOIN efiling_departments dept ON d.department_id = dept.id
                LEFT JOIN efiling_roles r ON d.role_id = r.id
            `;
            // No WHERE conditions for admins
        } else if (efilingUserId) {
            // Regular users see public daak or daak they created or received
            paramCount++;
            fromClause = `FROM efiling_daak d`;
            joinClause = `
                LEFT JOIN efiling_daak_categories dc ON d.category_id = dc.id
                LEFT JOIN efiling_users u ON d.created_by = u.id
                LEFT JOIN efiling_departments dept ON d.department_id = dept.id
                LEFT JOIN efiling_roles r ON d.role_id = r.id
            `;
            whereConditions.push(`(d.is_public = true OR d.created_by = $${paramCount} OR EXISTS (
                SELECT 1 FROM efiling_daak_recipients dr 
                WHERE dr.daak_id = d.id AND dr.efiling_user_id = $${paramCount}
            ))`);
            params.push(efilingUserId); // Same parameter used twice in the query
        } else {
            // No efiling user ID and not admin - return empty
            return NextResponse.json({
                daak: [],
                pagination: {
                    page,
                    limit,
                    total: 0,
                    totalPages: 0
                }
            });
        }

        if (status) {
            paramCount++;
            whereConditions.push(`d.status = $${paramCount}`);
            params.push(status);
        }

        if (categoryId) {
            paramCount++;
            whereConditions.push(`d.category_id = $${paramCount}`);
            params.push(categoryId);
        }

        if (acknowledged === 'true' && efilingUserId) {
            paramCount++;
            whereConditions.push(`EXISTS (
                SELECT 1 FROM efiling_daak_acknowledgments da 
                WHERE da.daak_id = d.id AND da.recipient_id = $${paramCount}
            )`);
            params.push(efilingUserId);
        } else if (acknowledged === 'false' && efilingUserId) {
            paramCount++;
            whereConditions.push(`NOT EXISTS (
                SELECT 1 FROM efiling_daak_acknowledgments da 
                WHERE da.daak_id = d.id AND da.recipient_id = $${paramCount}
            )`);
            params.push(efilingUserId);
        }

        // Build main query
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        
        // Add LIMIT and OFFSET parameters
        paramCount++;
        const limitParam = paramCount;
        paramCount++;
        const offsetParam = paramCount;
        
        let query = `
            SELECT DISTINCT
                d.*,
                dc.name as category_name,
                dc.code as category_code,
                dc.color as category_color,
                u.designation as created_by_designation,
                dept.name as department_name,
                r.name as role_name,
                (SELECT COUNT(*) FROM efiling_daak_recipients dr WHERE dr.daak_id = d.id) as recipient_count,
                (SELECT COUNT(*) FROM efiling_daak_acknowledgments da WHERE da.daak_id = d.id) as acknowledged_count
            ${fromClause}
            ${joinClause}
            ${whereClause}
            ORDER BY d.created_at DESC
            LIMIT $${limitParam} OFFSET $${offsetParam}
        `;

        // Build count query
        let countQuery = `
            SELECT COUNT(DISTINCT d.id) as count
            ${fromClause}
            ${joinClause}
            ${whereClause}
        `;

        params.push(limit, offset);
        const countParams = params.slice(0, -2); // Remove limit and offset

        let total = 0;
        try {
            const countResult = await client.query(countQuery, countParams);
            total = parseInt(countResult.rows[0]?.count || 0);
        } catch (countError) {
            console.error('Error in count query:', countError);
            console.error('Count query:', countQuery);
            console.error('Count params:', countParams);
            // Continue with total = 0 if count fails
        }

        console.log('Executing query:', query);
        console.log('Query params:', params);
        const result = await client.query(query, params);

        // Get acknowledgment status for each daak if user is recipient
        const daakList = await Promise.all(result.rows.map(async (daak) => {
            if (efilingUserId) {
                const ack = await client.query(
                    'SELECT * FROM efiling_daak_acknowledgments WHERE daak_id = $1 AND recipient_id = $2',
                    [daak.id, efilingUserId]
                );
                daak.is_acknowledged = ack.rows.length > 0;
                daak.acknowledgment = ack.rows[0] || null;
            } else {
                daak.is_acknowledged = false;
                daak.acknowledgment = null;
            }
            return daak;
        }));

        return NextResponse.json({
            daak: daakList,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching daak:', error);
        console.error('Error stack:', error.stack);
        return NextResponse.json(
            { error: 'Failed to fetch daak', details: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

// POST - Create daak
export async function POST(request) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            subject,
            content,
            category_id,
            priority = 'NORMAL',
            department_id,
            role_id,
            is_urgent = false,
            is_public = false,
            expires_at,
            recipients = [] // Array of {type: 'USER'|'ROLE'|..., id: number}
        } = body;

        if (!subject || !content) {
            return NextResponse.json(
                { error: 'Subject and content are required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();
        const efilingUserId = await getEfilingUserId(session, client);
        
        if (!efilingUserId && session?.user && ![1, 2].includes(parseInt(session.user.role))) {
            return NextResponse.json({ error: 'User not found in e-filing system' }, { status: 403 });
        }

        // Generate daak number
        const year = new Date().getFullYear();
        const countResult = await client.query(
            `SELECT COUNT(*) FROM efiling_daak WHERE daak_number LIKE $1`,
            [`DAAK-${year}-%`]
        );
        const count = parseInt(countResult.rows[0].count) + 1;
        const daakNumber = `DAAK-${year}-${String(count).padStart(4, '0')}`;

        // Create daak
        const daakResult = await client.query(
            `INSERT INTO efiling_daak 
             (daak_number, subject, content, category_id, priority, created_by, department_id, role_id, 
              is_urgent, is_public, expires_at, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'DRAFT')
             RETURNING *`,
            [
                daakNumber, subject, content, category_id || null, priority,
                efilingUserId, department_id || null, role_id || null,
                is_urgent, is_public, expires_at || null
            ]
        );

        const daak = daakResult.rows[0];

        // Process recipients
        const allUserIds = new Set();
        
        for (const recipient of recipients) {
            const userIds = await expandRecipients(client, recipient.type, recipient.id);
            userIds.forEach(id => allUserIds.add(id));
        }

        // Insert recipients
        if (allUserIds.size > 0) {
            const recipientValues = Array.from(allUserIds).map((userId, idx) => {
                const paramNum = idx * 3 + 1;
                return `($${paramNum}, $${paramNum + 1}, $${paramNum + 2})`;
            }).join(', ');

            const recipientParams = [];
            Array.from(allUserIds).forEach(userId => {
                recipientParams.push(daak.id, userId, 'PENDING');
            });

            await client.query(
                `INSERT INTO efiling_daak_recipients (daak_id, efiling_user_id, status)
                 VALUES ${recipientValues}`,
                recipientParams
            );
        }

        // Update recipient count
        await client.query(
            `UPDATE efiling_daak SET total_recipients = $1 WHERE id = $2`,
            [allUserIds.size, daak.id]
        );

        return NextResponse.json({
            success: true,
            daak: {
                ...daak,
                recipient_count: allUserIds.size
            }
        });
    } catch (error) {
        console.error('Error creating daak:', error);
        return NextResponse.json(
            { error: 'Failed to create daak', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

