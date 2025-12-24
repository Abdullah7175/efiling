// Higher-order function to automatically log user actions

/**
 * Higher-order function to automatically log user actions in API routes
 * This function wraps API route handlers and automatically logs actions
 */

import { logUserAction, getClientIP, getUserAgent, ACTION_TYPES, ENTITY_TYPES } from './userActionLogger.js';

export function withActionLogging(handler, options = {}) {
    return async (req, context) => {
        const startTime = Date.now();
        let response;
        let error = null;

        try {
            // Execute the original handler
            response = await handler(req, context);
            
            // Log the action if it was successful
            if (response && response.status < 400) {
                await logAction(req, response, options, startTime);
            }
            
            return response;
        } catch (err) {
            error = err;
            throw err;
        } finally {
            // Log failed actions too
            if (error && response) {
                await logAction(req, response, { ...options, error: true }, startTime);
            }
        }
    };
}

async function logAction(req, response, options, startTime) {
    try {
        const {
            actionType,
            entityType,
            entityIdExtractor,
            entityNameExtractor,
            detailsExtractor,
            userExtractor,
            skipLogging = false
        } = options;

        if (skipLogging) return;

        // Extract user information
        const user = userExtractor ? await userExtractor(req) : await extractUserFromRequest(req);
        if (!user) return;

        // Extract entity information
        const entityId = entityIdExtractor ? entityIdExtractor(req, response) : null;
        const entityName = entityNameExtractor ? entityNameExtractor(req, response) : null;
        const details = detailsExtractor ? detailsExtractor(req, response, Date.now() - startTime) : {};

        // Get client information
        const ipAddress = getClientIP(req);
        const userAgent = getUserAgent(req);

        // Log the action
        await logUserAction({
            user_id: user.id,
            user_type: user.userType,
            user_role: user.role,
            user_name: user.name,
            user_email: user.email,
            action_type: actionType || ACTION_TYPES.VIEW,
            entity_type: entityType || ENTITY_TYPES.REQUEST,
            entity_id: entityId,
            entity_name: entityName,
            details: {
                method: req.method,
                url: req.url,
                status: response.status,
                duration: Date.now() - startTime,
                ...details
            },
            ip_address: ipAddress,
            user_agent: userAgent
        });
    } catch (error) {
        console.error('Error logging action:', error);
        // Don't throw error to avoid breaking the main request
    }
}

async function extractUserFromRequest(req) {
    try {
        // Try to get user from session
        if (req.headers.get('authorization')) {
            // Handle JWT token
            const token = req.headers.get('authorization').replace('Bearer ', '');
            // You might need to implement JWT verification here
            // For now, we'll return null if we can't extract user info
            return null;
        }
        
        // Try to get from cookies or other sources
        // This is a simplified version - you might need to adapt based on your auth setup
        return null;
    } catch (error) {
        console.error('Error extracting user from request:', error);
        return null;
    }
}

/**
 * Helper function to create action logging options for common operations
 */
export const createLoggingOptions = {
    create: (entityType, entityIdExtractor, entityNameExtractor) => ({
        actionType: ACTION_TYPES.CREATE,
        entityType,
        entityIdExtractor,
        entityNameExtractor,
        detailsExtractor: (req, response, duration) => ({
            operation: 'create',
            duration,
            success: response.status < 400
        })
    }),

    update: (entityType, entityIdExtractor, entityNameExtractor) => ({
        actionType: ACTION_TYPES.UPDATE,
        entityType,
        entityIdExtractor,
        entityNameExtractor,
        detailsExtractor: (req, response, duration) => ({
            operation: 'update',
            duration,
            success: response.status < 400
        })
    }),

    delete: (entityType, entityIdExtractor, entityNameExtractor) => ({
        actionType: ACTION_TYPES.DELETE,
        entityType,
        entityIdExtractor,
        entityNameExtractor,
        detailsExtractor: (req, response, duration) => ({
            operation: 'delete',
            duration,
            success: response.status < 400
        })
    }),

    view: (entityType, entityIdExtractor, entityNameExtractor) => ({
        actionType: ACTION_TYPES.VIEW,
        entityType,
        entityIdExtractor,
        entityNameExtractor,
        detailsExtractor: (req, response, duration) => ({
            operation: 'view',
            duration,
            success: response.status < 400
        })
    }),

    upload: (entityType, entityIdExtractor, entityNameExtractor) => ({
        actionType: ACTION_TYPES.UPLOAD,
        entityType,
        entityIdExtractor,
        entityNameExtractor,
        detailsExtractor: (req, response, duration) => ({
            operation: 'upload',
            duration,
            success: response.status < 400
        })
    }),

    download: (entityType, entityIdExtractor, entityNameExtractor) => ({
        actionType: ACTION_TYPES.DOWNLOAD,
        entityType,
        entityIdExtractor,
        entityNameExtractor,
        detailsExtractor: (req, response, duration) => ({
            operation: 'download',
            duration,
            success: response.status < 400
        })
    })
}; 