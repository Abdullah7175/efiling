/**
 * Simplified action logger for API routes
 * This provides an easy way to log user actions from API routes
 */

import { logUserAction, getClientIP, getUserAgent, ACTION_TYPES, ENTITY_TYPES } from './userActionLogger.js';
import { auth } from '@/auth';

/**
 * Log a user action from an API route
 * @param {Request} req - The request object
 * @param {string} actionType - The type of action (CREATE, UPDATE, DELETE, etc.)
 * @param {string} entityType - The type of entity being acted upon
 * @param {Object} options - Additional options
 */
export async function logAction(req, actionType, entityType, options = {}) {
    try {
        const {
            entityId = null,
            entityName = null,
            details = {},
            user = null
        } = options;

        // Get user from session if not provided
        let currentUser = user;
        if (!currentUser) {
            try {
                const session = await auth();
                console.log('Session retrieved:', session ? 'Yes' : 'No');
                if (session && session.user) {
                    currentUser = {
                        id: session.user.id,
                        name: session.user.name,
                        email: session.user.email,
                        role: session.user.role,
                        userType: session.user.userType
                    };
                    console.log('User from session:', currentUser);
                }
            } catch (sessionError) {
                console.error('Error getting session:', sessionError);
            }
        }

        if (!currentUser) {
            console.log('No user found for action logging - using fallback user');
            // Use a fallback user for system actions
            currentUser = {
                id: 0,
                name: 'System',
                email: 'system@example.com',
                role: 0,
                userType: 'system'
            };
        }

        // Get client information
        const ipAddress = getClientIP(req);
        const userAgent = getUserAgent(req);

        console.log('Logging action:', {
            actionType,
            entityType,
            entityId,
            entityName,
            user: currentUser.name,
            ipAddress
        });

        // Log the action
        const result = await logUserAction({
            user_id: currentUser.id,
            user_type: currentUser.userType,
            user_role: currentUser.role,
            user_name: currentUser.name,
            user_email: currentUser.email,
            action_type: actionType,
            entity_type: entityType,
            entity_id: entityId,
            entity_name: entityName,
            details: {
                method: req.method,
                url: req.url,
                timestamp: new Date().toISOString(),
                ...details
            },
            ip_address: ipAddress,
            user_agent: userAgent
        });

        console.log('Action logged successfully:', result);
        return result;
    } catch (error) {
        console.error('Error logging action:', error);
        return false;
    }
}

/**
 * Helper functions for common actions
 */
export const actionLogger = {
    // Log creation actions
    create: (req, entityType, entityId, entityName, details = {}) => 
        logAction(req, ACTION_TYPES.CREATE, entityType, { entityId, entityName, details }),

    // Log update actions
    update: (req, entityType, entityId, entityName, details = {}) => 
        logAction(req, ACTION_TYPES.UPDATE, entityType, { entityId, entityName, details }),

    // Log deletion actions
    delete: (req, entityType, entityId, entityName, details = {}) => 
        logAction(req, ACTION_TYPES.DELETE, entityType, { entityId, entityName, details }),

    // Log view actions
    view: (req, entityType, entityId, entityName, details = {}) => 
        logAction(req, ACTION_TYPES.VIEW, entityType, { entityId, entityName, details }),

    // Log upload actions
    upload: (req, entityType, entityId, entityName, details = {}) => 
        logAction(req, ACTION_TYPES.UPLOAD, entityType, { entityId, entityName, details }),

    // Log download actions
    download: (req, entityType, entityId, entityName, details = {}) => 
        logAction(req, ACTION_TYPES.DOWNLOAD, entityType, { entityId, entityName, details }),

    // Log login actions
    login: (req, user, details = {}) => 
        logAction(req, ACTION_TYPES.LOGIN, 'auth', { 
            entityId: user.id,
            entityName: user.name,
            details: { ...details, operation: 'login' },
            user: user
        }),

    // Log logout actions
    logout: (req, user, details = {}) => 
        logAction(req, ACTION_TYPES.LOGOUT, 'auth', { 
            entityId: user.id,
            entityName: user.name,
            details: { ...details, operation: 'logout' },
            user: user
        })
};

// Export constants for use in API routes
export { ACTION_TYPES, ENTITY_TYPES }; 