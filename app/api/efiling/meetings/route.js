import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

async function getEfilingUserId(session, client) {
    if (session?.user && [1, 2].includes(parseInt(session.user.role))) {
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

// Helper to expand attendees (roles, groups, teams to users)
async function expandAttendees(client, attendeeType, sourceId) {
    let users = [];
    
    switch (attendeeType) {
        case 'USER':
            if (sourceId) {
                const user = await client.query(
                    'SELECT id FROM efiling_users WHERE id = $1 AND is_active = true',
                    [sourceId]
                );
                if (user.rows.length > 0) users.push(user.rows[0].id);
            }
            break;
            
        case 'ROLE':
            if (sourceId) {
                const roleUsers = await client.query(
                    'SELECT id FROM efiling_users WHERE efiling_role_id = $1 AND is_active = true',
                    [sourceId]
                );
                users = roleUsers.rows.map(r => r.id);
            }
            break;
            
        case 'ROLE_GROUP':
            if (sourceId) {
                const groupRoles = await client.query(
                    `SELECT r.id 
                     FROM efiling_roles r
                     JOIN efiling_role_groups rg ON r.role_group_id = rg.id
                     WHERE rg.id = $1`,
                    [sourceId]
                );
                if (groupRoles.rows.length > 0) {
                    const roleIds = groupRoles.rows.map(r => r.id);
                    const roleUsers = await client.query(
                        `SELECT id FROM efiling_users 
                         WHERE efiling_role_id = ANY($1::int[]) AND is_active = true`,
                        [roleIds]
                    );
                    users = roleUsers.rows.map(r => r.id);
                }
            }
            break;
            
        case 'TEAM':
            if (sourceId) {
                const teamMembers = await client.query(
                    `SELECT DISTINCT team_member_id as id 
                     FROM efiling_user_teams 
                     WHERE manager_id = $1 AND is_active = true
                     UNION
                     SELECT $1 as id`,
                    [sourceId]
                );
                users = teamMembers.rows.map(r => r.id);
            }
            break;
    }
    
    return users;
}

// GET - List meetings
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
        const meetingType = searchParams.get('meeting_type');
        const myMeetings = searchParams.get('my_meetings'); // Only meetings I organized
        const attendingMeetings = searchParams.get('attending_meetings'); // Only meetings I'm attending
        const dateFrom = searchParams.get('date_from');
        const dateTo = searchParams.get('date_to');

        let query = `
            SELECT DISTINCT
                m.*,
                u.designation as organizer_designation,
                u.employee_id as organizer_employee_id,
                dept.name as department_name,
                (SELECT COUNT(*) FROM efiling_meeting_attendees ma WHERE ma.meeting_id = m.id) as internal_attendee_count,
                (SELECT COUNT(*) FROM efiling_meeting_external_attendees mea WHERE mea.meeting_id = m.id) as external_attendee_count,
                (SELECT COUNT(*) FROM efiling_meeting_attendees ma 
                 WHERE ma.meeting_id = m.id AND ma.response_status = 'ACCEPTED') as accepted_count
        `;

        if (attendingMeetings === 'true' && efilingUserId) {
            query += `
                FROM efiling_meetings m
                INNER JOIN efiling_meeting_attendees ma ON m.id = ma.meeting_id
                LEFT JOIN efiling_users u ON m.organizer_id = u.id
                LEFT JOIN efiling_departments dept ON m.department_id = dept.id
                WHERE ma.attendee_id = $1
            `;
        } else if (myMeetings === 'true' && efilingUserId) {
            query += `
                FROM efiling_meetings m
                LEFT JOIN efiling_users u ON m.organizer_id = u.id
                LEFT JOIN efiling_departments dept ON m.department_id = dept.id
                WHERE m.organizer_id = $1
            `;
        } else {
            query += `
                FROM efiling_meetings m
                LEFT JOIN efiling_users u ON m.organizer_id = u.id
                LEFT JOIN efiling_departments dept ON m.department_id = dept.id
                WHERE m.organizer_id = $1 
                   OR EXISTS (
                       SELECT 1 FROM efiling_meeting_attendees ma 
                       WHERE ma.meeting_id = m.id AND ma.attendee_id = $1
                   )
            `;
        }

        const params = [efilingUserId || 0];
        let paramCount = 1;

        if (status) {
            paramCount++;
            query += ` AND m.status = $${paramCount}`;
            params.push(status);
        }

        if (meetingType) {
            paramCount++;
            query += ` AND m.meeting_type = $${paramCount}`;
            params.push(meetingType);
        }

        if (dateFrom) {
            paramCount++;
            query += ` AND m.meeting_date >= $${paramCount}`;
            params.push(dateFrom);
        }

        if (dateTo) {
            paramCount++;
            query += ` AND m.meeting_date <= $${paramCount}`;
            params.push(dateTo);
        }

        query += ` ORDER BY m.meeting_date DESC, m.start_time DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
        params.push(limit, offset);

        const result = await client.query(query, params);

        // Get user's response status for each meeting
        const meetings = await Promise.all(result.rows.map(async (meeting) => {
            if (efilingUserId) {
                const userResponse = await client.query(
                    'SELECT * FROM efiling_meeting_attendees WHERE meeting_id = $1 AND attendee_id = $2',
                    [meeting.id, efilingUserId]
                );
                meeting.user_response = userResponse.rows[0] || null;
                meeting.is_attending = userResponse.rows.length > 0;
            } else {
                meeting.user_response = null;
                meeting.is_attending = false;
            }
            return meeting;
        }));

        // Get total count - build a separate count query to avoid GROUP BY issues
        let countQuery = `
            SELECT COUNT(DISTINCT m.id) as count
        `;
        
        if (attendingMeetings === 'true' && efilingUserId) {
            countQuery += `
                FROM efiling_meetings m
                INNER JOIN efiling_meeting_attendees ma ON m.id = ma.meeting_id
                WHERE ma.attendee_id = $1
            `;
        } else if (myMeetings === 'true' && efilingUserId) {
            countQuery += `
                FROM efiling_meetings m
                WHERE m.organizer_id = $1
            `;
        } else {
            countQuery += `
                FROM efiling_meetings m
                WHERE m.organizer_id = $1 
                   OR EXISTS (
                       SELECT 1 FROM efiling_meeting_attendees ma 
                       WHERE ma.meeting_id = m.id AND ma.attendee_id = $1
                   )
            `;
        }

        const countParams = [efilingUserId || 0];
        let countParamCount = 1;

        if (status) {
            countParamCount++;
            countQuery += ` AND m.status = $${countParamCount}`;
            countParams.push(status);
        }

        if (meetingType) {
            countParamCount++;
            countQuery += ` AND m.meeting_type = $${countParamCount}`;
            countParams.push(meetingType);
        }

        if (dateFrom) {
            countParamCount++;
            countQuery += ` AND m.meeting_date >= $${countParamCount}`;
            countParams.push(dateFrom);
        }

        if (dateTo) {
            countParamCount++;
            countQuery += ` AND m.meeting_date <= $${countParamCount}`;
            countParams.push(dateTo);
        }

        const countResult = await client.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        return NextResponse.json({
            meetings,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching meetings:', error);
        return NextResponse.json(
            { error: 'Failed to fetch meetings', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

// POST - Create meeting
export async function POST(request) {
    let client;
    try {
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            title,
            description,
            agenda,
            meeting_type = 'IN_PERSON',
            meeting_date,
            start_time,
            end_time,
            venue_address,
            meeting_link,
            department_id,
            attendees = [], // Array of {type: 'USER'|'ROLE'|..., id: number}
            external_attendees = [] // Array of {email, name, designation, organization}
        } = body;

        if (!title || !meeting_date || !start_time || !end_time) {
            return NextResponse.json(
                { error: 'Title, meeting date, start time, and end time are required' },
                { status: 400 }
            );
        }

        // Validate meeting type requirements
        if (meeting_type === 'IN_PERSON' && !venue_address) {
            return NextResponse.json(
                { error: 'Venue address is required for in-person meetings' },
                { status: 400 }
            );
        }

        if (meeting_type === 'VIRTUAL' && !meeting_link) {
            return NextResponse.json(
                { error: 'Meeting link is required for virtual meetings' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();
        const efilingUserId = await getEfilingUserId(session, client);
        
        if (!efilingUserId && session?.user && ![1, 2].includes(parseInt(session.user.role))) {
            return NextResponse.json({ error: 'User not found in e-filing system' }, { status: 403 });
        }

        // Calculate duration
        const start = new Date(`${meeting_date}T${start_time}`);
        const end = new Date(`${meeting_date}T${end_time}`);
        const durationMinutes = Math.round((end - start) / (1000 * 60));

        if (durationMinutes <= 0) {
            return NextResponse.json(
                { error: 'End time must be after start time' },
                { status: 400 }
            );
        }

        // Generate meeting number
        const year = new Date().getFullYear();
        const countResult = await client.query(
            `SELECT COUNT(*) FROM efiling_meetings WHERE meeting_number LIKE $1`,
            [`MEET-${year}-%`]
        );
        const count = parseInt(countResult.rows[0].count) + 1;
        const meetingNumber = `MEET-${year}-${String(count).padStart(4, '0')}`;

        // Create meeting
        const meetingResult = await client.query(
            `INSERT INTO efiling_meetings 
             (meeting_number, title, description, agenda, meeting_type, meeting_date, start_time, end_time,
              duration_minutes, venue_address, meeting_link, organizer_id, department_id, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'SCHEDULED')
             RETURNING *`,
            [
                meetingNumber, title, description || null, agenda || null, meeting_type,
                meeting_date, start_time, end_time, durationMinutes,
                venue_address || null, meeting_link || null,
                efilingUserId, department_id || null
            ]
        );

        const meeting = meetingResult.rows[0];

        // Process internal attendees
        const allUserIds = new Set();
        
        for (const attendee of attendees) {
            const userIds = await expandAttendees(client, attendee.type, attendee.id);
            userIds.forEach(id => allUserIds.add(id));
        }

        // Insert internal attendees
        if (allUserIds.size > 0) {
            for (const userId of allUserIds) {
                await client.query(
                    `INSERT INTO efiling_meeting_attendees 
                     (meeting_id, attendee_id, attendee_type, source_id, response_status)
                     VALUES ($1, $2, $3, $4, 'PENDING')`,
                    [meeting.id, userId, 'USER', null]
                );
            }
        }

        // Insert external attendees
        if (external_attendees.length > 0) {
            for (const extAttendee of external_attendees) {
                const responseToken = `token_${meeting.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                await client.query(
                    `INSERT INTO efiling_meeting_external_attendees 
                     (meeting_id, email, name, designation, organization, response_status, response_token)
                     VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)`,
                    [
                        meeting.id,
                        extAttendee.email,
                        extAttendee.name,
                        extAttendee.designation || null,
                        extAttendee.organization || null,
                        responseToken
                    ]
                );
            }
        }

        // Update attendee counts
        const totalAttendees = allUserIds.size + external_attendees.length;
        await client.query(
            `UPDATE efiling_meetings 
             SET total_attendees = $1 
             WHERE id = $2`,
            [totalAttendees, meeting.id]
        );

        // Create notifications for internal attendees
        for (const userId of allUserIds) {
            try {
                await client.query(
                    `INSERT INTO efiling_notifications 
                     (user_id, type, message, priority, action_required, metadata, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                    [
                        userId,
                        'MEETING_INVITATION',
                        `You have been invited to a meeting: ${title}`,
                        'normal',
                        true,
                        JSON.stringify({ meeting_id: meeting.id, meeting_number: meetingNumber })
                    ]
                );
            } catch (notifError) {
                console.error('Error creating notification:', notifError);
            }
        }

        return NextResponse.json({
            success: true,
            meeting: {
                ...meeting,
                internal_attendee_count: allUserIds.size,
                external_attendee_count: external_attendees.length
            }
        });
    } catch (error) {
        console.error('Error creating meeting:', error);
        return NextResponse.json(
            { error: 'Failed to create meeting', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

