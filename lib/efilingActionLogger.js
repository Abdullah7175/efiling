import { connectToDatabase } from './db';

// Entity types for e-filing system
export const EFILING_ENTITY_TYPES = {
    EFILING_FILE: 'efiling_file',
    EFILING_USER: 'efiling_user',
    EFILING_ROLE: 'efiling_role',
    EFILING_DEPARTMENT: 'efiling_department',
    EFILING_WORKFLOW: 'efiling_workflow',
    EFILING_SIGNATURE: 'efiling_signature',
    EFILING_COMMENT: 'efiling_comment',
    EFILING_ATTACHMENT: 'efiling_attachment',
    EFILING_WORKFLOW_ACTION: 'efiling_workflow_action',
    EFILING_STAGE_INSTANCE: 'efiling_stage_instance',
    EFILING_FILE_TYPE: 'efiling_file_type',
    EFILING_CATEGORY: 'efiling_category',
    EFILING_TEMPLATE: 'efiling_template'
};

// Action types for comprehensive e-filing tracking
export const EFILING_ACTION_TYPES = {
    // File actions
    FILE_CREATED: 'FILE_CREATED',
    FILE_UPDATED: 'FILE_UPDATED',
    FILE_DELETED: 'FILE_DELETED',
    FILE_STATUS_CHANGED: 'FILE_STATUS_CHANGED',
    FILE_ASSIGNED: 'FILE_ASSIGNED',
    FILE_FORWARDED: 'FILE_FORWARDED',
    FILE_RETURNED: 'FILE_RETURNED',
    FILE_ESCALATED: 'FILE_ESCALATED',
    FILE_PRIORITY_CHANGED: 'FILE_PRIORITY_CHANGED',
    FILE_CONFIDENTIALITY_CHANGED: 'FILE_CONFIDENTIALITY_CHANGED',
    
    // Workflow actions
    WORKFLOW_STARTED: 'WORKFLOW_STARTED',
    WORKFLOW_VIEWED: 'WORKFLOW_VIEWED',
    WORKFLOW_STAGE_COMPLETED: 'WORKFLOW_STAGE_COMPLETED',
    WORKFLOW_STAGE_ESCALATED: 'WORKFLOW_STAGE_ESCALATED',
    WORKFLOW_STAGE_TIMEOUT: 'WORKFLOW_STAGE_TIMEOUT',
    WORKFLOW_COMPLETED: 'WORKFLOW_COMPLETED',
    WORKFLOW_CANCELLED: 'WORKFLOW_CANCELLED',
    WORKFLOW_PAUSED: 'WORKFLOW_PAUSED',
    WORKFLOW_RESUMED: 'WORKFLOW_RESUMED',
    
    // Document actions
    DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
    DOCUMENT_DOWNLOADED: 'DOCUMENT_DOWNLOADED',
    DOCUMENT_DELETED: 'DOCUMENT_DELETED',
    DOCUMENT_VIEWED: 'DOCUMENT_VIEWED',
    DOCUMENT_EDITED: 'DOCUMENT_EDITED',
    DOCUMENT_VERSION_CREATED: 'DOCUMENT_VERSION_CREATED',
    
    // Signature actions
    SIGNATURE_ADDED: 'SIGNATURE_ADDED',
    SIGNATURE_VERIFIED: 'SIGNATURE_VERIFIED',
    SIGNATURE_REJECTED: 'SIGNATURE_REJECTED',
    SIGNATURE_EXPIRED: 'SIGNATURE_EXPIRED',
    SIGNATURE_METHOD_CHANGED: 'SIGNATURE_METHOD_CHANGED',
    
    // Comment actions
    COMMENT_ADDED: 'COMMENT_ADDED',
    COMMENT_EDITED: 'COMMENT_EDITED',
    COMMENT_DELETED: 'COMMENT_DELETED',
    COMMENT_INTERNAL: 'COMMENT_INTERNAL',
    COMMENT_PUBLIC: 'COMMENT_PUBLIC',
    
    // User actions
    USER_LOGIN: 'USER_LOGIN',
    USER_LOGOUT: 'USER_LOGOUT',
    USER_PERMISSION_CHANGED: 'USER_PERMISSION_CHANGED',
    
    // System actions
    FILE_TYPES_LISTED: 'FILE_TYPES_LISTED',
    USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
    USER_DEPARTMENT_CHANGED: 'USER_DEPARTMENT_CHANGED',
    USER_APPROVAL_LEVEL_CHANGED: 'USER_APPROVAL_LEVEL_CHANGED',
    
    // Security actions
    AUTHENTICATION_ATTEMPT: 'AUTHENTICATION_ATTEMPT',
    AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
    SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    INVALID_ACCESS_ATTEMPT: 'INVALID_ACCESS_ATTEMPT',
    
    // System actions
    CONFIGURATION_CHANGED: 'CONFIGURATION_CHANGED',
    WORKFLOW_TEMPLATE_CREATED: 'WORKFLOW_TEMPLATE_CREATED',
    WORKFLOW_TEMPLATE_UPDATED: 'WORKFLOW_TEMPLATE_UPDATED',
    SLA_POLICY_CHANGED: 'SLA_POLICY_CHANGED',
    FILE_TYPE_CREATED: 'FILE_TYPE_CREATED',
    FILE_TYPE_UPDATED: 'FILE_TYPE_UPDATED',
    
    // Approval actions
    APPROVAL_REQUESTED: 'APPROVAL_REQUESTED',
    APPROVAL_GRANTED: 'APPROVAL_GRANTED',
    APPROVAL_DENIED: 'APPROVAL_DENIED',
    APPROVAL_DELEGATED: 'APPROVAL_DELEGATED',
    APPROVAL_ESCALATED: 'APPROVAL_ESCALATED',
    
    // SLA actions
    SLA_BREACHED: 'SLA_BREACHED',
    SLA_WARNING: 'SLA_WARNING',
    SLA_RESET: 'SLA_RESET',
    SLA_EXTENDED: 'SLA_EXTENDED'
};

class EFileActionLogger {
    constructor() {
        this.client = null;
    }

    async connect() {
        if (!this.client) {
            this.client = await connectToDatabase();
        }
        return this.client;
    }

    async logAction({
        entityType,
        entityId,
        action,
        userId,
        details = {},
        ipAddress = null,
        userAgent = null,
        severity = 'INFO',
        sessionId = null,
        requestId = null,
        workflowId = null,
        stageId = null
    }) {
        try {
            // Ensure userId is never null
            const safeUserId = userId || 'system';
            
            const client = await this.connect();
            
            // Enhanced logging with workflow context
            const logData = {
                entityType,
                entityId,
                details,
                severity,
                sessionId,
                requestId,
                workflowId,
                stageId,
                ipAddress,
                userAgent,
                timestamp: new Date().toISOString()
            };

            // Get user details for comprehensive logging
            // Handle both admin users (users.id) and efiling users (efiling_users.id)
            let userDetails = { name: 'System', email: 'system@local', role: 0, user_type: 'efiling_user' };
            try {
                if (safeUserId && safeUserId !== 'system') {
                    // First try to find as efiling_users.id (most common case)
                    const efilingUserResult = await client.query(`
                        SELECT 
                            u.name, 
                            u.email, 
                            u.role, 
                            eu.designation,
                            er.name as role_name,
                            'efiling_user' as user_type
                        FROM efiling_users eu
                        JOIN users u ON eu.user_id = u.id
                        LEFT JOIN efiling_roles er ON eu.efiling_role_id = er.id
                        WHERE eu.id = $1
                    `, [safeUserId]);
                    
                    if (efilingUserResult.rows.length > 0) {
                        const row = efilingUserResult.rows[0];
                        userDetails = {
                            name: row.designation ? `${row.name} (${row.designation})` : row.name,
                            email: row.email || 'unknown@local',
                            role: row.role || 0,
                            role_name: row.role_name || null,
                            user_type: 'efiling_user'
                        };
                    } else {
                        // If not found as efiling_users.id, try as users.id (admin users)
                        const adminUserResult = await client.query(`
                            SELECT u.name, u.email, u.role, 'admin' as user_type
                            FROM users u 
                            WHERE u.id = $1
                        `, [safeUserId]);
                        
                        if (adminUserResult.rows.length > 0) {
                            const row = adminUserResult.rows[0];
                            userDetails = {
                                name: row.name || 'Admin User',
                                email: row.email || 'unknown@local',
                                role: row.role || 0,
                                user_type: 'admin',
                                role_name: row.role === 1 ? 'Super Admin' : row.role === 2 ? 'Admin' : 'User'
                            };
                        } else {
                            // Last try: maybe safeUserId is users.id but we need efiling_users via user_id
                            const userViaUserIdResult = await client.query(`
                                SELECT 
                                    u.name, 
                                    u.email, 
                                    u.role, 
                                    eu.designation,
                                    er.name as role_name,
                                    'efiling_user' as user_type
                                FROM users u
                                LEFT JOIN efiling_users eu ON eu.user_id = u.id
                                LEFT JOIN efiling_roles er ON eu.efiling_role_id = er.id
                                WHERE u.id = $1
                                LIMIT 1
                            `, [safeUserId]);
                            
                            if (userViaUserIdResult.rows.length > 0) {
                                const row = userViaUserIdResult.rows[0];
                                const isAdmin = row.role && [1, 2].includes(parseInt(row.role));
                                userDetails = {
                                    name: row.designation ? `${row.name} (${row.designation})` : row.name,
                                    email: row.email || 'unknown@local',
                                    role: row.role || 0,
                                    role_name: row.role_name || (isAdmin ? (row.role === 1 ? 'Super Admin' : 'Admin') : 'User'),
                                    user_type: isAdmin ? 'admin' : 'efiling_user'
                                };
                            }
                        }
                    }
                }
            } catch (userError) {
                console.log('Could not fetch user details, using defaults:', userError.message);
            }

            // Log to efiling_user_actions table with enhanced schema
            await client.query(`
                INSERT INTO efiling_user_actions (
                    file_id, user_id, action_type, description, timestamp, created_at,
                    user_type, user_role, user_name, user_email, entity_type, entity_name,
                    details, ip_address, user_agent
                ) VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [
                entityType === EFILING_ENTITY_TYPES.EFILING_FILE ? entityId : null,
                safeUserId.toString(), // Use safeUserId which is guaranteed to not be null
                action || 'UNKNOWN_ACTION', // Ensure action is never null
                JSON.stringify(logData),
                userDetails.user_type || 'efiling_user',
                userDetails.role || 0,
                userDetails.name || 'System',
                userDetails.email || 'system@local',
                entityType,
                entityId ? `${entityId}` : 'system',
                JSON.stringify(details),
                ipAddress,
                userAgent
            ]);

            // Log to workflow actions if workflow context exists
            if (workflowId && stageId) {
                await client.query(`
                    INSERT INTO efiling_workflow_actions (
                        workflow_id, stage_instance_id, action_type, action_data, 
                        performed_by, performed_at, ip_address, user_agent
                    ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
                `, [
                    workflowId,
                    stageId,
                    action,
                    JSON.stringify(details),
                    userId ? userId.toString() : null, // Convert to string to match VARCHAR column
                    ipAddress,
                    userAgent
                ]);
            }

            console.log(`[${severity}] E-Filing Action logged: ${action} by user ${userId} on ${entityType} ${entityId}`);
            
        } catch (error) {
            console.error('Error logging e-filing action:', error);
            // Don't throw error to prevent breaking main functionality
        }
    }

    async logSecurityEvent({
        eventType,
        userId,
        ipAddress,
        userAgent,
        details = {},
        severity = 'WARNING'
    }) {
        await this.logAction({
            entityType: 'SECURITY',
            entityId: null,
            action: eventType,
            userId,
            details,
            ipAddress,
            userAgent,
            severity
        });
    }

    async logWorkflowAction({
        workflowId,
        stageId,
        action,
        userId,
        details = {},
        ipAddress = null,
        userAgent = null
    }) {
        await this.logAction({
            entityType: EFILING_ENTITY_TYPES.EFILING_WORKFLOW,
            entityId: workflowId,
            action,
            userId,
            details: {
                ...details,
                stageId,
                workflowId
            },
            ipAddress,
            userAgent,
            workflowId,
            stageId
        });
    }

    async logFileAction({
        fileId,
        action,
        userId,
        details = {},
        ipAddress = null,
        userAgent = null
    }) {
        await this.logAction({
            entityType: EFILING_ENTITY_TYPES.EFILING_FILE,
            entityId: fileId,
            action,
            userId,
            details,
            ipAddress,
            userAgent
        });
    }

    async logUserAction({
        userId,
        action,
        targetUserId,
        details = {},
        ipAddress = null,
        userAgent = null
    }) {
        await this.logAction({
            entityType: EFILING_ENTITY_TYPES.EFILING_USER,
            entityId: targetUserId || userId,
            action,
            userId,
            details,
            ipAddress,
            userAgent
        });
    }

    async getActionHistory({
        entityType = null,
        entityId = null,
        userId = null,
        actionType = null,
        workflowId = null,
        startDate = null,
        endDate = null,
        limit = 100,
        offset = 0
    }) {
        try {
            const client = await this.connect();
            
            let query = `
                SELECT 
                    ua.*,
                    d.name as department_name
                FROM efiling_user_actions ua
                LEFT JOIN efiling_users eu ON ua.user_id = eu.user_id
                LEFT JOIN efiling_departments d ON eu.department_id = d.id
                WHERE 1=1
            `;
            
            const params = [];
            let paramCount = 1;

            if (entityType) {
                query += ` AND ua.entity_type = $${paramCount}`;
                params.push(entityType);
                paramCount++;
            }

            if (entityId) {
                query += ` AND ua.file_id = $${paramCount}`;
                params.push(entityId.toString());
                paramCount++;
            }

            if (userId) {
                query += ` AND ua.user_id = $${paramCount}::VARCHAR`;
                params.push(userId.toString());
                paramCount++;
            }

            if (actionType) {
                query += ` AND ua.action_type = $${paramCount}`;
                params.push(actionType);
                paramCount++;
            }

            if (workflowId) {
                query += ` AND ua.details::jsonb->>'workflowId' = $${paramCount}`;
                params.push(workflowId.toString());
                paramCount++;
            }

            if (startDate) {
                query += ` AND ua.timestamp >= $${paramCount}`;
                params.push(startDate);
                paramCount++;
            }

            if (endDate) {
                query += ` AND ua.timestamp <= $${paramCount}`;
                params.push(endDate);
                paramCount++;
            }

            query += ` ORDER BY ua.timestamp DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
            params.push(limit, offset);

            const result = await client.query(query, params);
            return result.rows;

        } catch (error) {
            console.error('Error fetching e-filing action history:', error);
            return [];
        }
    }

    async getWorkflowActionHistory(workflowId, limit = 50) {
        try {
            const client = await this.connect();
            
            const result = await client.query(`
                SELECT 
                    wa.*,
                    u.name as user_name,
                    u.designation as user_designation,
                    d.name as department_name
                FROM efiling_workflow_actions wa
                LEFT JOIN efiling_users u ON wa.performed_by = u.id
                LEFT JOIN efiling_departments d ON u.department_id = d.id
                WHERE wa.workflow_id = $1
                ORDER BY wa.performed_at DESC
                LIMIT $2
            `, [workflowId, limit]);

            return result.rows;

        } catch (error) {
            console.error('Error fetching workflow action history:', error);
            return [];
        }
    }

    async cleanup() {
        if (this.client) {
            await this.client.release();
            this.client = null;
        }
    }
}

// Export singleton instance
export const eFileActionLogger = new EFileActionLogger();

// Export individual functions for backward compatibility
export const logEFileAction = (action, description, userId, details = {}) => 
    eFileActionLogger.logAction({
        entityType: 'SYSTEM',
        entityId: null,
        action,
        userId,
        details: { description, ...details }
    });

export const logEFileSecurityEvent = (eventType, userId, details = {}) =>
    eFileActionLogger.logSecurityEvent({
        eventType,
        userId,
        details
    });

export const logEFileWorkflowAction = (workflowId, stageId, action, userId, details = {}) =>
    eFileActionLogger.logWorkflowAction({
        workflowId,
        stageId,
        action,
        userId,
        details
    });

export const logEFileFileAction = (fileId, action, userId, details = {}) =>
    eFileActionLogger.logFileAction({
        fileId,
        action,
        userId,
        details
    });

export const logEFileUserAction = (userId, action, targetUserId, details = {}) =>
    eFileActionLogger.logUserAction({
        userId,
        action,
        targetUserId,
        details
    });
