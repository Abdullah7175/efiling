// Utility function to log user actions in the e-filing system
export const logEfilingUserAction = async (actionData) => {
    try {
        const {
            user_id,
            action_type,
            description,
            file_id = null,
            entity_type = 'efiling_file',
            entity_name = 'E-Filing File',
            details = {},
            ip_address = null,
            user_agent = null
        } = actionData;

        if (!user_id || !action_type) {
            console.error('Missing required fields for action logging:', { user_id, action_type });
            return;
        }

        const response = await fetch('/api/efiling/user-actions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: user_id.toString(),
                action_type,
                description,
                file_id,
                entity_type,
                entity_name,
                details,
                ip_address,
                user_agent,
                user_type: 'efiling_user',
                user_role: 0, // Default role for efiling users
                user_name: 'E-Filing User',
                user_email: 'efiling@example.com'
            }),
        });

        if (!response.ok) {
            console.error('Failed to log user action:', await response.text());
        }
    } catch (error) {
        console.error('Error logging user action:', error);
    }
};

// Helper function to get user info from session
export const getUserInfoFromSession = (session) => {
    if (!session?.user) return null;
    
    return {
        user_id: session.user.id,
        user_name: session.user.name || 'Unknown User',
        user_email: session.user.email || 'unknown@example.com'
    };
};

// Common action types for e-filing system
export const EFILING_ACTIONS = {
    // File actions
    FILE_CREATED: 'file_created',
    FILE_VIEWED: 'file_viewed',
    FILE_EDITED: 'file_edited',
    FILE_UPDATED: 'file_updated',
    FILE_DELETED: 'file_deleted',
    FILE_DOWNLOADED: 'file_downloaded',
    FILE_SIGNED: 'file_signed',
    FILE_ASSIGNED: 'file_assigned',
    FILE_STATUS_CHANGED: 'file_status_changed',
    
    // Document actions
    DOCUMENT_UPLOADED: 'document_uploaded',
    DOCUMENT_EDITED: 'document_edited',
    DOCUMENT_DELETED: 'document_deleted',
    
    // Workflow actions
    WORKFLOW_STARTED: 'workflow_started',
    WORKFLOW_COMPLETED: 'workflow_completed',
    WORKFLOW_REJECTED: 'workflow_rejected',
    
    // User actions
    PROFILE_UPDATED: 'profile_updated',
    PASSWORD_CHANGED: 'password_changed',
    LOGIN: 'login',
    LOGOUT: 'logout',
    
    // Notification actions
    NOTIFICATION_READ: 'notification_read',
    NOTIFICATION_DISMISSED: 'notification_dismissed',
    
    // Report actions
    REPORT_GENERATED: 'report_generated',
    REPORT_EXPORTED: 'report_exported'
};
