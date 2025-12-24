import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';
import { getTeamMembers, getManagerForUser, isTeamMember } from '@/lib/efilingTeamManager';

/**
 * GET /api/efiling/teams
 * Get team members for a manager
 * Query params: manager_id (optional, defaults to current user)
 */
export async function GET(request) {
    let client;
    try {
        const { searchParams } = new URL(request.url);
        const managerId = searchParams.get('manager_id');
        
        const session = await auth();
        if (!session) {
            console.error('Teams GET - No session found');
            return NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 });
        }
        if (!session.user) {
            console.error('Teams GET - No user in session:', session);
            return NextResponse.json({ error: 'Unauthorized - No user in session' }, { status: 401 });
        }
        if (!session.user.id) {
            console.error('Teams GET - No user ID in session:', session.user);
            return NextResponse.json({ error: 'Unauthorized - No user ID' }, { status: 401 });
        }
        
        client = await connectToDatabase();
        
        let targetManagerId = managerId;
        
        // If no manager_id provided, get current user's efiling ID
        if (!targetManagerId) {
            const userRes = await client.query(`
                SELECT eu.id
                FROM efiling_users eu
                JOIN users u ON eu.user_id = u.id
                WHERE u.id = $1 AND eu.is_active = true
            `, [session.user.id]);
            
            if (userRes.rows.length === 0) {
                return NextResponse.json({ error: 'User not found in e-filing system' }, { status: 404 });
            }
            
            targetManagerId = userRes.rows[0].id;
        }
        
        const teamMembers = await getTeamMembers(client, parseInt(targetManagerId));
        
        return NextResponse.json({
            success: true,
            manager_id: parseInt(targetManagerId),
            team_members: teamMembers
        });
        
    } catch (error) {
        console.error('Error fetching team members:', error);
        return NextResponse.json(
            { error: 'Failed to fetch team members', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

/**
 * POST /api/efiling/teams
 * Add a team member to a manager
 * Body: { manager_id, team_member_id, team_role }
 */
export async function POST(request) {
    let client;
    try {
        const body = await request.json();
        const { manager_id, team_member_id, team_role } = body;
        
        if (!manager_id || !team_member_id || !team_role) {
            return NextResponse.json(
                { error: 'manager_id, team_member_id, and team_role are required' },
                { status: 400 }
            );
        }
        
        const session = await auth();
        if (!session) {
            console.error('Teams POST - No session found');
            return NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 });
        }
        if (!session.user) {
            console.error('Teams POST - No user in session:', session);
            return NextResponse.json({ error: 'Unauthorized - No user in session' }, { status: 401 });
        }
        if (!session.user.id) {
            console.error('Teams POST - No user ID in session:', session.user);
            return NextResponse.json({ error: 'Unauthorized - No user ID' }, { status: 401 });
        }
        
        client = await connectToDatabase();
        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        
        if (!isAdmin) {
            // Verify user is the manager
            const userRes = await client.query(`
                SELECT eu.id
                FROM efiling_users eu
                JOIN users u ON eu.user_id = u.id
                WHERE u.id = $1 AND eu.id = $2 AND eu.is_active = true
            `, [session.user.id, manager_id]);
            
            if (userRes.rows.length === 0) {
                await client.release();
                return NextResponse.json({ error: 'Unauthorized - Not the manager' }, { status: 403 });
            }
        }
        await client.query('BEGIN');
        
        // Check if team member already exists
        const existingRes = await client.query(`
            SELECT id FROM efiling_user_teams
            WHERE manager_id = $1 AND team_member_id = $2
        `, [manager_id, team_member_id]);
        
        if (existingRes.rows.length > 0) {
            // Update existing record
            await client.query(`
                UPDATE efiling_user_teams
                SET team_role = $1, is_active = true, updated_at = CURRENT_TIMESTAMP
                WHERE manager_id = $2 AND team_member_id = $3
            `, [team_role, manager_id, team_member_id]);
        } else {
            // Insert new record
            await client.query(`
                INSERT INTO efiling_user_teams (manager_id, team_member_id, team_role)
                VALUES ($1, $2, $3)
            `, [manager_id, team_member_id, team_role]);
        }
        
        await client.query('COMMIT');
        
        // Return updated team members
        const teamMembers = await getTeamMembers(client, manager_id);
        
        return NextResponse.json({
            success: true,
            message: 'Team member added successfully',
            team_members: teamMembers
        });
        
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error adding team member:', error);
        return NextResponse.json(
            { error: 'Failed to add team member', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

/**
 * DELETE /api/efiling/teams
 * Remove a team member from a manager
 * Query params: manager_id, team_member_id
 */
export async function DELETE(request) {
    let client;
    try {
        const { searchParams } = new URL(request.url);
        const managerId = searchParams.get('manager_id');
        const teamMemberId = searchParams.get('team_member_id');
        
        if (!managerId || !teamMemberId) {
            return NextResponse.json(
                { error: 'manager_id and team_member_id are required' },
                { status: 400 }
            );
        }
        
        const session = await auth();
        if (!session) {
            console.error('Teams DELETE - No session found');
            return NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 });
        }
        if (!session.user) {
            console.error('Teams DELETE - No user in session:', session);
            return NextResponse.json({ error: 'Unauthorized - No user in session' }, { status: 401 });
        }
        if (!session.user.id) {
            console.error('Teams DELETE - No user ID in session:', session.user);
            return NextResponse.json({ error: 'Unauthorized - No user ID' }, { status: 401 });
        }
        
        // Check if user is admin or the manager
        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        
        client = await connectToDatabase();
        
        if (!isAdmin) {
            // Verify user is the manager
            const userRes = await client.query(`
                SELECT eu.id
                FROM efiling_users eu
                JOIN users u ON eu.user_id = u.id
                WHERE u.id = $1 AND eu.id = $2 AND eu.is_active = true
            `, [session.user.id, managerId]);
            
            if (userRes.rows.length === 0) {
                return NextResponse.json({ error: 'Unauthorized - Not the manager' }, { status: 403 });
            }
        }
        
        await client.query('BEGIN');
        
        // Soft delete (set is_active = false)
        await client.query(`
            UPDATE efiling_user_teams
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE manager_id = $1 AND team_member_id = $2
        `, [managerId, teamMemberId]);
        
        await client.query('COMMIT');
        
        return NextResponse.json({
            success: true,
            message: 'Team member removed successfully'
        });
        
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error removing team member:', error);
        return NextResponse.json(
            { error: 'Failed to remove team member', details: error.message },
            { status: 500 }
        );
    } finally {
        if (client) await client.release();
    }
}

