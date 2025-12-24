import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(request, { params }) {
    let client;
    try {
        // SECURITY: Require authentication
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        if (!id) return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
        
        client = await connectToDatabase();

        // SECURITY: Check file access
        const { checkFileAccess } = await import('@/lib/authMiddleware');
        const userId = parseInt(session.user.id);
        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        
        const hasAccess = await checkFileAccess(client, parseInt(id), userId, isAdmin);
        if (!hasAccess) {
            return NextResponse.json(
                { error: 'Forbidden - You do not have access to this file' },
                { status: 403 }
            );
        }

        // File created event with creator info and location
        const fileRes = await client.query(`
            SELECT 
                f.id, 
                f.created_at,
                f.created_by,
                u.name as creator_name,
                eu.designation as creator_designation,
                eu.town_id as creator_town_id,
                eu.division_id as creator_division_id,
                t.town as creator_town_name,
                d.name as creator_division_name
            FROM efiling_files f
            LEFT JOIN efiling_users eu ON f.created_by = eu.id
            LEFT JOIN users u ON eu.user_id = u.id
            LEFT JOIN town t ON eu.town_id = t.id
            LEFT JOIN divisions d ON eu.division_id = d.id
            WHERE f.id = $1
        `, [id]);
        if (fileRes.rows.length === 0) return NextResponse.json({ error: 'File not found' }, { status: 404 });
        const file = fileRes.rows[0];

        // Movements (mark/assign) with historical designations and locations
        const moveRes = await client.query(`
            SELECT m.id, m.created_at, m.action_type, m.remarks,
                   COALESCE(m.from_user_name, fu.name) as from_user_name, 
                   COALESCE(m.from_user_designation, fu.designation) as from_user_designation,
                   m.from_user_town_id,
                   m.from_user_division_id,
                   t_from.town as from_user_town_name,
                   d_from.name as from_user_division_name,
                   COALESCE(m.to_user_name, tu.name) as to_user_name,
                   COALESCE(m.to_user_designation, tu.designation) as to_user_designation,
                   m.to_user_town_id,
                   m.to_user_division_id,
                   t_to.town as to_user_town_name,
                   d_to.name as to_user_division_name
            FROM efiling_file_movements m
            LEFT JOIN (
                SELECT eu.id, u.name, eu.designation 
                FROM efiling_users eu 
                LEFT JOIN users u ON eu.user_id = u.id
            ) fu ON fu.id = m.from_user_id
            LEFT JOIN (
                SELECT eu.id, u.name, eu.designation 
                FROM efiling_users eu 
                LEFT JOIN users u ON eu.user_id = u.id
            ) tu ON tu.id = m.to_user_id
            LEFT JOIN town t_from ON m.from_user_town_id = t_from.id
            LEFT JOIN divisions d_from ON m.from_user_division_id = d_from.id
            LEFT JOIN town t_to ON m.to_user_town_id = t_to.id
            LEFT JOIN divisions d_to ON m.to_user_division_id = d_to.id
            WHERE m.file_id = $1
            ORDER BY m.created_at ASC
        `, [id]);

        // Signatures - check if table exists first
        let sigRes = { rows: [] };
        try {
            const tableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'efiling_document_signatures'
                );
            `);
            
            if (tableCheck.rows[0]?.exists) {
                sigRes = await client.query(`
                    SELECT 
                        s.id, 
                        s.user_name, 
                        s.user_role,
                        s.type, 
                        s.timestamp,
                        s.user_id,
                        COALESCE(s.user_designation, eu.designation) as designation,
                        s.user_town_id,
                        s.user_division_id,
                        t.town as user_town_name,
                        d.name as user_division_name,
                        er.name as role_name
                    FROM efiling_document_signatures s
                    LEFT JOIN users u ON s.user_id = u.id
                    LEFT JOIN efiling_users eu ON u.id = eu.user_id
                    LEFT JOIN efiling_roles er ON eu.efiling_role_id = er.id
                    LEFT JOIN town t ON s.user_town_id = t.id
                    LEFT JOIN divisions d ON s.user_division_id = d.id
                    WHERE s.file_id = $1 AND s.is_active = true
                    ORDER BY s.timestamp ASC
                `, [id]);
            }
        } catch (sigError) {
            console.warn('Could not fetch signatures:', sigError.message);
            // Continue without signatures
        }

        // Comments - check if table exists first
        let commentRes = { rows: [] };
        try {
            const commentTableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'efiling_document_comments'
                );
            `);
            
            if (commentTableCheck.rows[0]?.exists) {
                commentRes = await client.query(`
                    SELECT 
                        c.id, 
                        c.user_name, 
                        c.user_role,
                        c.text,
                        c.timestamp,
                        c.user_id,
                        c.edited,
                        c.edited_at,
                        COALESCE(eu.designation, '') as designation,
                        eu.town_id as user_town_id,
                        eu.division_id as user_division_id,
                        t.town as user_town_name,
                        d.name as user_division_name,
                        er.name as role_name
                    FROM efiling_document_comments c
                    LEFT JOIN users u ON c.user_id = u.id
                    LEFT JOIN efiling_users eu ON u.id = eu.user_id
                    LEFT JOIN efiling_roles er ON eu.efiling_role_id = er.id
                    LEFT JOIN town t ON eu.town_id = t.id
                    LEFT JOIN divisions d ON eu.division_id = d.id
                    WHERE c.file_id = $1 AND c.is_active = true
                    ORDER BY c.timestamp ASC
                `, [id]);
            }
        } catch (commentError) {
            console.warn('Could not fetch comments:', commentError.message);
            // Continue without comments
        }

        const events = [];
        // File created event with creator name, designation, and location
        let creatorDisplay = file.creator_name || 'System';
        if (file.creator_designation) {
            creatorDisplay += ` (${file.creator_designation})`;
        }
        if (file.creator_town_name) {
            creatorDisplay += ` - ${file.creator_town_name}`;
        } else if (file.creator_division_name) {
            creatorDisplay += ` - ${file.creator_division_name}`;
        }
        events.push({
            type: 'CREATED',
            title: `File Created by ${creatorDisplay}`,
            timestamp: file.created_at,
            meta: { 
                creator_name: file.creator_name, 
                creator_designation: file.creator_designation,
                creator_town_name: file.creator_town_name,
                creator_division_name: file.creator_division_name
            }
        });
        
        // Movements
        for (const m of moveRes.rows) {
            // Build from user display with location if available
            let fromDisplay = m.from_user_name || 'System';
            if (m.from_user_designation) {
                fromDisplay += ` (${m.from_user_designation})`;
            }
            if (m.from_user_town_name) {
                fromDisplay += ` - ${m.from_user_town_name}`;
            } else if (m.from_user_division_name) {
                fromDisplay += ` - ${m.from_user_division_name}`;
            }

            // Build to user display with location if available
            let toDisplay = m.to_user_name || 'user';
            if (m.to_user_designation) {
                toDisplay += ` (${m.to_user_designation})`;
            }
            if (m.to_user_town_name) {
                toDisplay += ` - ${m.to_user_town_name}`;
            } else if (m.to_user_division_name) {
                toDisplay += ` - ${m.to_user_division_name}`;
            }

            events.push({
                type: 'ASSIGNED',
                title: `Marked to ${toDisplay}`,
                timestamp: m.created_at,
                meta: { 
                    from: fromDisplay, 
                    to: toDisplay, 
                    remarks: m.remarks,
                    from_user_name: m.from_user_name,
                    from_user_designation: m.from_user_designation,
                    from_user_town_name: m.from_user_town_name,
                    from_user_division_name: m.from_user_division_name,
                    to_user_name: m.to_user_name,
                    to_user_designation: m.to_user_designation,
                    to_user_town_name: m.to_user_town_name,
                    to_user_division_name: m.to_user_division_name
                }
            });
        }
        
        // Signatures with role name, designation, and location
        for (const s of sigRes.rows) {
            // Build user display with designation and location
            let userDisplay = s.user_name || 'Unknown User';
            if (s.designation) {
                userDisplay += ` (${s.designation})`;
            }
            if (s.user_town_name) {
                userDisplay += ` - ${s.user_town_name}`;
            } else if (s.user_division_name) {
                userDisplay += ` - ${s.user_division_name}`;
            }
            
            events.push({
                type: 'SIGNED',
                title: `Signature by ${userDisplay}`,
                timestamp: s.timestamp,
                meta: { 
                    user_name: s.user_name,
                    designation: s.designation,
                    role_name: s.role_name,
                    user_town_name: s.user_town_name,
                    user_division_name: s.user_division_name,
                    signType: s.type 
                }
            });
        }

        // Comments with role name, designation, and location
        for (const c of commentRes.rows) {
            // Build user display with designation and location
            let userDisplay = c.user_name || 'Unknown User';
            if (c.designation) {
                userDisplay += ` (${c.designation})`;
            }
            if (c.user_town_name) {
                userDisplay += ` - ${c.user_town_name}`;
            } else if (c.user_division_name) {
                userDisplay += ` - ${c.user_division_name}`;
            }
            
            events.push({
                type: 'COMMENT',
                title: `Comment added by ${userDisplay}`,
                timestamp: c.timestamp,
                meta: { 
                    user_name: c.user_name,
                    designation: c.designation,
                    role_name: c.role_name,
                    user_town_name: c.user_town_name,
                    user_division_name: c.user_division_name,
                    text: c.text,
                    edited: c.edited || false,
                    edited_at: c.edited_at
                }
            });
        }

        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        return NextResponse.json({ events });
    } catch (e) {
        console.error('Timeline error:', e);
        return NextResponse.json({ error: 'Failed to load timeline' }, { status: 500 });
    } finally {
        if (client) await client.release();
    }
}
