/**
 * E-Filing Workflow State Manager
 * Handles file workflow state transitions and permission checks
 */

import { connectToDatabase } from './db';
import { isTeamMember, getManagerForUser, isSEOrCEAssistant } from './efilingTeamManager';

/**
 * Initialize workflow state for a new file
 * @param {Object} client - Database client
 * @param {number} fileId - File ID
 * @param {number} creatorId - Creator's efiling_user_id
 * @returns {Promise<number>} Workflow state ID
 */
export async function initializeWorkflowState(client, fileId, creatorId) {
    const result = await client.query(`
        INSERT INTO efiling_file_workflow_states (
            file_id,
            creator_id,
            current_assigned_to,
            current_state,
            is_within_team,
            tat_started
        ) VALUES ($1, $2, $3, 'TEAM_INTERNAL', true, false)
        ON CONFLICT (file_id) DO UPDATE SET
            creator_id = EXCLUDED.creator_id,
            current_assigned_to = EXCLUDED.current_assigned_to,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id
    `, [fileId, creatorId, creatorId]);
    
    const stateId = result.rows[0].id;
    
    // Update file with workflow state ID
    await client.query(`
        UPDATE efiling_files
        SET workflow_state_id = $1
        WHERE id = $2
    `, [stateId, fileId]);
    
    return stateId;
}

/**
 * Get workflow state for a file
 * @param {Object} client - Database client
 * @param {number} fileId - File ID
 * @returns {Promise<Object|null>} Workflow state object
 */
export async function getWorkflowState(client, fileId) {
    const result = await client.query(`
        SELECT *
        FROM efiling_file_workflow_states
        WHERE file_id = $1
    `, [fileId]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Update workflow state
 * @param {Object} client - Database client
 * @param {number} fileId - File ID
 * @param {string} newState - New state: 'TEAM_INTERNAL', 'EXTERNAL', 'RETURNED_TO_CREATOR'
 * @param {number} assignedTo - Assigned user ID
 * @param {boolean} isTeamInternal - Whether movement is within team
 * @param {boolean} startTAT - Whether to start TAT timer
 * @returns {Promise<void>}
 */
export async function updateWorkflowState(client, fileId, newState, assignedTo, isTeamInternal, startTAT = false) {
    const updates = {
        current_state: newState,
        current_assigned_to: assignedTo,
        is_within_team: isTeamInternal,
        updated_at: 'CURRENT_TIMESTAMP'
    };
    
    if (startTAT && !isTeamInternal) {
        updates.tat_started = true;
        updates.tat_started_at = 'CURRENT_TIMESTAMP';
        updates.last_external_mark_at = 'CURRENT_TIMESTAMP';
    }
    
    const setClause = Object.keys(updates).map((key, index) => {
        const value = updates[key];
        if (value === 'CURRENT_TIMESTAMP') {
            return `${key} = CURRENT_TIMESTAMP`;
        }
        return `${key} = $${index + 2}`;
    }).join(', ');
    
    const values = [fileId, ...Object.values(updates).filter(v => v !== 'CURRENT_TIMESTAMP')];
    
    await client.query(`
        UPDATE efiling_file_workflow_states
        SET ${setClause}
        WHERE file_id = $1
    `, values);
}

/**
 * Check if file is within team workflow
 * @param {Object} client - Database client
 * @param {number} fileId - File ID
 * @returns {Promise<boolean>} True if file is within team
 */
export async function isFileWithTeam(client, fileId) {
    const state = await getWorkflowState(client, fileId);
    return state ? (state.is_within_team && state.current_state === 'TEAM_INTERNAL') : false;
}

/**
 * Check if user can edit file
 * @param {Object} client - Database client
 * @param {number} fileId - File ID
 * @param {number} userId - User's efiling_user_id
 * @returns {Promise<boolean>} True if user can edit
 */
export async function canEditFile(client, fileId, userId) {
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
    
    // Only creator can edit
    if (userId !== creatorId) {
        return false;
    }
    
    // Get workflow state
    const state = await getWorkflowState(client, fileId);
    
    // CRITICAL: If file is assigned to someone else (not creator), block editing
    // unless explicitly returned to creator
    if (file.assigned_to && file.assigned_to !== creatorId) {
        // Only allow if state is RETURNED_TO_CREATOR
        if (state && state.current_state === 'RETURNED_TO_CREATOR') {
            return true;
        }
        // Block if assigned to someone else
        return false;
    }
    
    // If workflow state exists
    if (state) {
        // Can edit if:
        // 1. File is within team (TEAM_INTERNAL state) AND not assigned to someone else
        // 2. File is returned to creator (RETURNED_TO_CREATOR state)
        return state.current_state === 'TEAM_INTERNAL' || 
               state.current_state === 'RETURNED_TO_CREATOR';
    }
    
    // If no workflow state and not assigned to someone else, creator can edit (new file)
    return true;
}

/**
 * Check if user can add pages (SE/CE and their assistants)
 * @param {Object} client - Database client
 * @param {number} fileId - File ID
 * @param {number} userId - User's efiling_user_id
 * @returns {Promise<boolean>} True if user can add pages
 */
export async function canAddPages(client, fileId, userId) {
    // Get file info
    const fileRes = await client.query(`
        SELECT assigned_to, workflow_state_id
        FROM efiling_files
        WHERE id = $1
    `, [fileId]);
    
    if (fileRes.rows.length === 0) {
        return false;
    }
    
    const file = fileRes.rows[0];
    
    // Get user's role
    const userRes = await client.query(`
        SELECT eu.id, eu.efiling_role_id, r.code as role_code
        FROM efiling_users eu
        LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
        WHERE eu.id = $1 AND eu.is_active = true
    `, [userId]);
    
    if (userRes.rows.length === 0) {
        return false;
    }
    
    const user = userRes.rows[0];
    const roleCode = (user.role_code || '').toUpperCase();
    
    // SE and CE can add pages if file is assigned to them
    if ((roleCode === 'SE' || roleCode === 'CE') && file.assigned_to === userId) {
        return true;
    }
    
    // Check if user is SE/CE assistant
    const assistantInfo = await isSEOrCEAssistant(client, userId);
    if (assistantInfo) {
        // Assistant can add pages if file is assigned to their manager
        return file.assigned_to === assistantInfo.manager_id;
    }
    
    return false;
}

/**
 * Start TAT timer when file moves to external
 * @param {Object} client - Database client
 * @param {number} fileId - File ID
 * @returns {Promise<void>}
 */
export async function startTAT(client, fileId) {
    await client.query(`
        UPDATE efiling_file_workflow_states
        SET 
            tat_started = true,
            tat_started_at = CURRENT_TIMESTAMP,
            last_external_mark_at = CURRENT_TIMESTAMP,
            is_within_team = false,
            current_state = 'EXTERNAL',
            updated_at = CURRENT_TIMESTAMP
        WHERE file_id = $1
    `, [fileId]);
}

/**
 * Mark file as returned to creator
 * @param {Object} client - Database client
 * @param {number} fileId - File ID
 * @param {number} creatorId - Creator's efiling_user_id
 * @returns {Promise<void>}
 */
export async function markReturnToCreator(client, fileId, creatorId) {
    await client.query(`
        UPDATE efiling_file_workflow_states
        SET 
            current_state = 'RETURNED_TO_CREATOR',
            current_assigned_to = $2,
            is_within_team = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE file_id = $1
    `, [fileId, creatorId]);
}

/**
 * Check if file movement requires e-signature before marking
 * @param {Object} client - Database client
 * @param {number} fileId - File ID
 * @param {number} fromUserId - From user's efiling_user_id
 * @param {number} toUserId - To user's efiling_user_id
 * @returns {Promise<boolean>} True if e-signature required
 */
export async function requiresESignatureBeforeMarking(client, fileId, fromUserId, toUserId) {
    // Get file and workflow state
    const fileRes = await client.query(`
        SELECT created_by, workflow_state_id
        FROM efiling_files
        WHERE id = $1
    `, [fileId]);
    
    if (fileRes.rows.length === 0) {
        return false;
    }
    
    const file = fileRes.rows[0];
    const state = await getWorkflowState(client, fileId);
    
    // If file is within team, no e-signature required for team members
    if (state && state.current_state === 'TEAM_INTERNAL') {
        const isTeamMovement = await isTeamMember(client, file.created_by, fromUserId) &&
                               await isTeamMember(client, file.created_by, toUserId);
        if (isTeamMovement) {
            return false; // Team members can mark between themselves without e-sign
        }
    }
    
    // Get from user's role
    const fromUserRes = await client.query(`
        SELECT eu.id, r.code as role_code
        FROM efiling_users eu
        LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
        WHERE eu.id = $1
    `, [fromUserId]);
    
    if (fromUserRes.rows.length === 0) {
        return true; // Default: require e-signature
    }
    
    const fromRoleCode = (fromUserRes.rows[0].role_code || '').toUpperCase();
    
    // E-signature required when:
    // 1. EE marks to SE (external flow starts)
    // 2. SE marks to Consultant
    // 3. Consultant marks to CE
    // 4. CE marks forward
    // 5. Any external marking
    
    // Check if this is a transition to external workflow
    const toUserRes = await client.query(`
        SELECT eu.id, r.code as role_code
        FROM efiling_users eu
        LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
        WHERE eu.id = $1
    `, [toUserId]);
    
    if (toUserRes.rows.length === 0) {
        return true;
    }
    
    const toRoleCode = (toUserRes.rows[0].role_code || '').toUpperCase();
    
    // External roles that require e-signature before marking
    const externalRoles = ['SE', 'CE', 'CFO', 'COO', 'CEO'];
    
    // If marking to external role, require e-signature
    if (externalRoles.includes(toRoleCode)) {
        return true;
    }
    
    // If from external role, require e-signature
    if (externalRoles.includes(fromRoleCode)) {
        return true;
    }
    
    // If file is in external state and marking forward, require e-signature
    if (state && state.current_state === 'EXTERNAL') {
        return true;
    }
    
    return false;
}

/**
 * Check if user can mark file forward (with e-signature check)
 * @param {Object} client - Database client
 * @param {number} fileId - File ID
 * @param {number} userId - User's efiling_user_id
 * @param {number} toUserId - Target user's efiling_user_id
 * @returns {Promise<{canMark: boolean, requiresSignature: boolean, reason?: string}>}
 */
export async function canMarkFileForward(client, fileId, userId, toUserId) {
    // Check if user has signed
    const signatureRes = await client.query(`
        SELECT COUNT(*) as count
        FROM efiling_document_signatures eds
        JOIN efiling_users eu ON eds.user_id = eu.user_id
        WHERE eds.file_id = $1 AND eu.id = $2 AND eds.is_active = true
    `, [fileId, userId]);
    
    const hasSigned = parseInt(signatureRes.rows[0].count) > 0;
    
    // Check if e-signature is required
    const requiresSignature = await requiresESignatureBeforeMarking(client, fileId, userId, toUserId);
    
    if (requiresSignature && !hasSigned) {
        return {
            canMark: false,
            requiresSignature: true,
            reason: 'E-signature required before marking forward'
        };
    }
    
    // Additional checks for team workflow
    const fileRes = await client.query(`
        SELECT created_by, assigned_to, workflow_state_id
        FROM efiling_files
        WHERE id = $1
    `, [fileId]);
    
    if (fileRes.rows.length === 0) {
        return { canMark: false, requiresSignature: false, reason: 'File not found' };
    }
    
    const file = fileRes.rows[0];
    
    // Check if user is assigned or creator
    if (userId !== file.assigned_to && userId !== file.created_by) {
        return { canMark: false, requiresSignature: false, reason: 'Not assigned to file' };
    }
    
    return { canMark: true, requiresSignature };
}

