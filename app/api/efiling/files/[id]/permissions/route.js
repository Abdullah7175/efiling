import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';
import { canEditFile, canAddPages, getWorkflowState } from '@/lib/efilingWorkflowStateManager';
import { isTeamMember, canMarkFile } from '@/lib/efilingTeamManager';

/**
 * GET /api/efiling/files/[id]/permissions
 * Returns permission set for current user on specified file
 * 
 * Permissions:
 * - canEdit: Admin or file creator only
 * - canView: All assigned users
 * - canAddSignature: All users
 * - canAddComment: All users  
 * - canAddAttachment: All users
 * - canMarkTo: Creator (with signature) or admin
 * - canApprove/Reject: Assigned user (with signature)
 */
export async function GET(request, { params }) {
    let client;
    
    try {
        const { id } = await params;
        const session = await auth();
        
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        client = await connectToDatabase();
        
        // Get user's efiling profile
        const userRes = await client.query(`
            SELECT eu.id, eu.user_id, eu.efiling_role_id, r.code as role_code, r.name as role_name
            FROM efiling_users eu
            LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
            WHERE eu.user_id = $1 AND eu.is_active = true
        `, [session.user.id]);
        
        if (userRes.rows.length === 0) {
            // Not an efiling user - check if admin
            const isSystemAdmin = [1, 2].includes(parseInt(session.user.role));
            if (!isSystemAdmin) {
                return NextResponse.json({ error: 'User not found in e-filing system' }, { status: 403 });
            }
            
            // Admin has full permissions
            return NextResponse.json({ 
                permissions: {
                    canEdit: true,
                    canView: true,
                    canAddSignature: true,
                    canAddComment: true,
                    canAddAttachment: true,
                    canMarkTo: true,
                    canApprove: true,
                    canReject: true,
                    canForward: true,
                    isAdmin: true,
                    isCreator: false,
                    isAssigned: false,
                    hasSigned: false,
                    requiresSignature: false
                }
            });
        }
        
        const userEfiling = userRes.rows[0];
        
        // Get file details with geographic routing context
        const fileRes = await client.query(`
            SELECT f.*, 
                   assigned.efiling_role_id AS assigned_role_id,
                   assigned_roles.code AS assigned_role_code
            FROM efiling_files f
            LEFT JOIN efiling_users assigned ON f.assigned_to = assigned.id
            LEFT JOIN efiling_roles assigned_roles ON assigned.efiling_role_id = assigned_roles.id
            WHERE f.id = $1
        `, [id]);
        
        if (fileRes.rows.length === 0) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }
        
        const file = fileRes.rows[0];
        
        // Check if user is system admin
        const isSystemAdmin = userEfiling.role_code === 'SYS_ADMIN' || [1, 2].includes(parseInt(session.user.role));
        
        // Check if user is file creator
        const isCreator = file.created_by === userEfiling.id;
        
        // Check if user is currently assigned
        const isAssigned = file.assigned_to === userEfiling.id;
        
        // Check if file has been marked to this user
        const markedToRes = await client.query(`
            SELECT COUNT(*) as count
            FROM efiling_file_movements
            WHERE file_id = $1 AND to_user_id = $2
        `, [id, userEfiling.id]);
        
        const isMarkedTo = markedToRes.rows[0].count > 0;
        
        // Check if user has signed the file
        const signatureRes = await client.query(`
            SELECT COUNT(*) as count, MAX(timestamp) as last_signed_at
            FROM efiling_document_signatures
            WHERE file_id = $1 AND user_id = $2 AND is_active = true
        `, [id, session.user.id]);
        
        const hasSigned = signatureRes.rows[0].count > 0;
        const lastSignedAt = signatureRes.rows[0].last_signed_at;
        
        // Get file creator's signature status
        const creatorSignatureRes = await client.query(`
            SELECT COUNT(*) as count
            FROM efiling_document_signatures eds
            JOIN efiling_users eu ON eds.user_id = eu.user_id
            WHERE eds.file_id = $1 AND eu.id = $2 AND eds.is_active = true
        `, [id, file.created_by]);
        
        const creatorHasSigned = creatorSignatureRes.rows[0].count > 0;
        
        // Get workflow state for team workflow checks
        const workflowState = await getWorkflowState(client, id);
        const isWithinTeam = workflowState ? workflowState.is_within_team : false;
        const currentState = workflowState ? workflowState.current_state : 'TEAM_INTERNAL';
        
        // Check if user is team member
        const isTeamMemberOfCreator = isCreator ? false : await isTeamMember(client, file.created_by, userEfiling.id);
        
        // Check editing permissions (updated for team workflow)
        const canEdit = isSystemAdmin || await canEditFile(client, id, userEfiling.id);
        
        // Check if user can add pages (SE/CE and assistants)
        const canAddPage = await canAddPages(client, id, userEfiling.id);
        
        // Check if user can mark file (updated for team workflow)
        const canMark = isSystemAdmin || await canMarkFile(client, id, userEfiling.id);
        
        // Check if e-signature is required for marking
        // Team members can mark between themselves without e-sign until EE marks to SE
        const requiresSignatureForMarking = !isWithinTeam && !isTeamMemberOfCreator;
        
        // Permission calculations based on requirements
        const permissions = {
            // EDIT: Only admin or file creator (when within team or returned)
            canEdit: canEdit,
            
            // VIEW: All users who have access
            canView: true,
            
            // SIGNATURE: All users can add signatures
            canAddSignature: true,
            
            // COMMENT: All users can add comments
            canAddComment: true,
            
            // ATTACHMENT: All users can add attachments
            canAddAttachment: true,
            
            // ADD PAGE: SE/CE and their assistants can add pages
            canAddPage: canAddPage,
            
            // MARK TO: Updated for team workflow
            canMarkTo: canMark && (!requiresSignatureForMarking || hasSigned),
            
            // APPROVE: Assigned user (must have signed)
            canApprove: isAssigned && hasSigned,
            
            // REJECT: Assigned user (must have signed)
            canReject: isAssigned && hasSigned,
            
            // FORWARD: Assigned user (must have signed) OR admin
            canForward: (isAssigned && hasSigned) || isSystemAdmin,
            
            // Status flags
            isAdmin: isSystemAdmin,
            isCreator,
            isAssigned,
            isMarkedTo,
            isTeamMember: isTeamMemberOfCreator,
            hasSigned,
            creatorHasSigned,
            lastSignedAt,
            
            // Workflow state
            workflow_state: currentState,
            is_within_team: isWithinTeam,
            
            // Requirements
            requiresSignature: requiresSignatureForMarking && !hasSigned,
            requiresCreatorSignature: !creatorHasSigned && currentState !== 'TEAM_INTERNAL',
            
            // Detailed access
            access: {
                file,
                userRole: userEfiling.role_code,
                assignedRole: file.assigned_role_code
            }
        };
        
        return NextResponse.json({ permissions });
        
    } catch (error) {
        console.error('Error checking permissions:', error);
        return NextResponse.json({ 
            error: 'Server error', 
            details: error.message 
        }, { status: 500 });
    } finally {
        if (client && client.release) {
            await client.release();
        }
    }
}

