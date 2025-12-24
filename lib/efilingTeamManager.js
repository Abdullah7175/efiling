/**
 * E-Filing Team Management Library
 * Handles team relationships and team-based workflow logic
 */

import { connectToDatabase } from './db';

/**
 * Get all active team members for a manager
 * @param {Object} client - Database client
 * @param {number} managerId - Manager's efiling_user_id
 * @returns {Promise<Array>} Array of team members
 */
export async function getTeamMembers(client, managerId) {
    const result = await client.query(`
        SELECT 
            t.id,
            t.team_member_id,
            t.team_role,
            eu.user_id,
            u.name,
            u.email,
            eu.efiling_role_id,
            r.code as role_code,
            r.name as role_name
        FROM efiling_user_teams t
        JOIN efiling_users eu ON t.team_member_id = eu.id
        JOIN users u ON eu.user_id = u.id
        LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
        WHERE t.manager_id = $1 
        AND t.is_active = true
        AND eu.is_active = true
        ORDER BY t.team_role, u.name
    `, [managerId]);
    
    return result.rows;
}

/**
 * Check if a user is a team member of a manager
 * @param {Object} client - Database client
 * @param {number} managerId - Manager's efiling_user_id
 * @param {number} userId - User's efiling_user_id
 * @returns {Promise<boolean>} True if user is team member
 */
export async function isTeamMember(client, managerId, userId) {
    const result = await client.query(`
        SELECT 1
        FROM efiling_user_teams
        WHERE manager_id = $1 
        AND team_member_id = $2 
        AND is_active = true
        LIMIT 1
    `, [managerId, userId]);
    
    return result.rows.length > 0;
}

/**
 * Get manager for a team member
 * @param {Object} client - Database client
 * @param {number} userId - Team member's efiling_user_id
 * @returns {Promise<Object|null>} Manager info or null
 */
export async function getManagerForUser(client, userId) {
    const result = await client.query(`
        SELECT 
            t.manager_id,
            eu.user_id,
            u.name,
            u.email,
            eu.efiling_role_id,
            r.code as role_code,
            r.name as role_name
        FROM efiling_user_teams t
        JOIN efiling_users eu ON t.manager_id = eu.id
        JOIN users u ON eu.user_id = u.id
        LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
        WHERE t.team_member_id = $1 
        AND t.is_active = true
        AND eu.is_active = true
        LIMIT 1
    `, [userId]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Check if a file movement is within team workflow
 * @param {Object} client - Database client
 * @param {number} fileId - File ID
 * @param {number} fromUserId - From user's efiling_user_id
 * @param {number} toUserId - To user's efiling_user_id
 * @returns {Promise<boolean>} True if movement is within team
 */
export async function isWithinTeamWorkflow(client, fileId, fromUserId, toUserId) {
    // Get file creator
    const fileRes = await client.query(`
        SELECT created_by, workflow_state_id
        FROM efiling_files
        WHERE id = $1
    `, [fileId]);
    
    if (fileRes.rows.length === 0) {
        return false;
    }
    
    const file = fileRes.rows[0];
    const creatorId = file.created_by;
    
    // Check if file is still in team internal state
    if (file.workflow_state_id) {
        const stateRes = await client.query(`
            SELECT is_within_team, current_state
            FROM efiling_file_workflow_states
            WHERE id = $1
        `, [file.workflow_state_id]);
        
        if (stateRes.rows.length > 0) {
            const state = stateRes.rows[0];
            // If already external, not within team
            if (state.current_state === 'EXTERNAL') {
                return false;
            }
        }
    }
    
    // Check if from user is creator or team member
    const isCreator = fromUserId === creatorId;
    const isFromTeamMember = await isTeamMember(client, creatorId, fromUserId);
    
    if (!isCreator && !isFromTeamMember) {
        return false;
    }
    
    // Check if to user is creator or team member
    const isToCreator = toUserId === creatorId;
    const isToTeamMember = await isTeamMember(client, creatorId, toUserId);
    
    return isToCreator || isToTeamMember;
}

/**
 * Get team members for marking (includes creator's team)
 * @param {Object} client - Database client
 * @param {number} creatorId - Creator's efiling_user_id
 * @returns {Promise<Array>} Array of team members including creator
 */
export async function getTeamMembersForMarking(client, creatorId) {
    const teamMembers = await getTeamMembers(client, creatorId);
    
    // Also include creator in the list
    const creatorRes = await client.query(`
        SELECT 
            eu.id as team_member_id,
            u.name,
            u.email,
            eu.efiling_role_id,
            r.code as role_code,
            r.name as role_name,
            'CREATOR' as team_role
        FROM efiling_users eu
        JOIN users u ON eu.user_id = u.id
        LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
        WHERE eu.id = $1 AND eu.is_active = true
    `, [creatorId]);
    
    const allMembers = [...teamMembers, ...creatorRes.rows];
    
    return allMembers.map(member => ({
        id: member.team_member_id,
        name: member.name,
        email: member.email,
        role_code: member.role_code,
        role_name: member.role_name,
        team_role: member.team_role,
        is_creator: member.team_role === 'CREATOR'
    }));
}

/**
 * Check if user can mark file (team members can mark between themselves)
 * @param {Object} client - Database client
 * @param {number} fileId - File ID
 * @param {number} userId - User's efiling_user_id
 * @returns {Promise<boolean>} True if user can mark
 */
export async function canMarkFile(client, fileId, userId) {
    // Get file info
    const fileRes = await client.query(`
        SELECT created_by, workflow_state_id, assigned_to
        FROM efiling_files
        WHERE id = $1
    `, [fileId]);
    
    if (fileRes.rows.length === 0) {
        return false;
    }
    
    const file = fileRes.rows[0];
    const creatorId = file.created_by;
    
    // Check workflow state
    if (file.workflow_state_id) {
        const stateRes = await client.query(`
            SELECT current_state, is_within_team
            FROM efiling_file_workflow_states
            WHERE id = $1
        `, [file.workflow_state_id]);
        
        if (stateRes.rows.length > 0) {
            const state = stateRes.rows[0];
            
            // If external and not returned, only assigned user can mark
            if (state.current_state === 'EXTERNAL' && !state.is_within_team) {
                return file.assigned_to === userId;
            }
            
            // If within team, creator and team members can mark
            if (state.is_within_team || state.current_state === 'TEAM_INTERNAL') {
                const isCreator = userId === creatorId;
                const userIsTeamMember = await isTeamMember(client, creatorId, userId);
                return isCreator || userIsTeamMember;
            }
            
            // If returned to creator, only creator can mark
            if (state.current_state === 'RETURNED_TO_CREATOR') {
                return userId === creatorId;
            }
        }
    }
    
    // Default: creator and assigned user can mark
    return userId === creatorId || userId === file.assigned_to;
}

/**
 * Get assistants for SE/CE (for simultaneous visibility)
 * @param {Object} client - Database client
 * @param {number} managerId - SE/CE's efiling_user_id
 * @returns {Promise<Array>} Array of assistants
 */
export async function getAssistantsForManager(client, managerId) {
    const result = await client.query(`
        SELECT 
            t.team_member_id,
            eu.user_id,
            u.name,
            u.email,
            eu.efiling_role_id,
            r.code as role_code,
            r.name as role_name,
            t.team_role
        FROM efiling_user_teams t
        JOIN efiling_users eu ON t.team_member_id = eu.id
        JOIN users u ON eu.user_id = u.id
        LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
        WHERE t.manager_id = $1 
        AND t.is_active = true
        AND eu.is_active = true
        AND t.team_role IN ('AO', 'ASSISTANT', 'SE_ASSISTANT')
        ORDER BY t.team_role, u.name
    `, [managerId]);
    
    return result.rows;
}

/**
 * Check if user is SE/CE assistant
 * @param {Object} client - Database client
 * @param {number} userId - User's efiling_user_id
 * @returns {Promise<Object|null>} Manager info if user is assistant
 */
export async function isSEOrCEAssistant(client, userId) {
    const result = await client.query(`
        SELECT 
            t.manager_id,
            eu.efiling_role_id,
            r.code as manager_role_code,
            r.name as manager_role_name,
            t.team_role
        FROM efiling_user_teams t
        JOIN efiling_users eu ON t.manager_id = eu.id
        LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
        WHERE t.team_member_id = $1 
        AND t.is_active = true
        AND eu.is_active = true
        AND t.team_role IN ('AO', 'ASSISTANT', 'SE_ASSISTANT')
        AND r.code IN ('SE', 'CE')
        LIMIT 1
    `, [userId]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
}

