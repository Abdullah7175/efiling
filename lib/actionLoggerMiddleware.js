/**
 * Middleware function to log user actions
 * This can be used in API routes to automatically log user activities
 */

import { logUserAction, getClientIP, getUserAgent, ACTION_TYPES, ENTITY_TYPES } from './userActionLogger.js';
import { auth } from '@/auth';

/**
 * Extract user information from the request
 * This function should be customized based on your authentication setup
 */
export async function extractUserFromRequest(req) {
    try {
        // Try to get user from NextAuth session
        const session = await auth();
        
        if (session && session.user) {
            return {
                id: session.user.id,
                name: session.user.name,
                email: session.user.email,
                role: session.user.role,
                userType: session.user.userType
            };
        }

        // For JWT tokens (fallback)
        const authHeader = req.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            // You would need to verify the JWT token here
            // For now, we'll return null
            return null;
        }

        return null;
    } catch (error) {
        console.error('Error extracting user from request:', error);
        return null;
    }
}

/**
 * Log a user action
 * This function can be called directly from API routes
 */
export async function logAction({
    req,
    user,
    actionType,
    entityType,
    entityId = null,
    entityName = null,
    details = {}
}) {
    try {
        if (!user) {
            user = await extractUserFromRequest(req);
        }

        if (!user) {
            console.log('No user found for action logging');
            return false;
        }

        const ipAddress = getClientIP(req);
        const userAgent = getUserAgent(req);

        await logUserAction({
            user_id: user.id,
            user_type: user.userType || user.user_type,
            user_role: user.role,
            user_name: user.name,
            user_email: user.email,
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

        return true;
    } catch (error) {
        console.error('Error logging action:', error);
        return false;
    }
}

/**
 * Helper functions for common actions
 */
export const actionHelpers = {
    // Log user login
    logLogin: (req, user) => logAction({
        req,
        user,
        actionType: ACTION_TYPES.LOGIN,
        entityType: 'auth',
        details: { operation: 'login' }
    }),

    // Log user logout
    logLogout: (req, user) => logAction({
        req,
        user,
        actionType: ACTION_TYPES.LOGOUT,
        entityType: 'auth',
        details: { operation: 'logout' }
    }),

    // Log request creation
    logRequestCreate: (req, user, requestId, requestName) => logAction({
        req,
        user,
        actionType: ACTION_TYPES.CREATE,
        entityType: ENTITY_TYPES.REQUEST,
        entityId: requestId,
        entityName: requestName,
        details: { operation: 'create_request' }
    }),

    // Log request update
    logRequestUpdate: (req, user, requestId, requestName, changes) => logAction({
        req,
        user,
        actionType: ACTION_TYPES.UPDATE,
        entityType: ENTITY_TYPES.REQUEST,
        entityId: requestId,
        entityName: requestName,
        details: { operation: 'update_request', changes }
    }),

    // Log request deletion
    logRequestDelete: (req, user, requestId, requestName) => logAction({
        req,
        user,
        actionType: ACTION_TYPES.DELETE,
        entityType: ENTITY_TYPES.REQUEST,
        entityId: requestId,
        entityName: requestName,
        details: { operation: 'delete_request' }
    }),

    // Log image upload
    logImageUpload: (req, user, imageId, imageName, requestId) => logAction({
        req,
        user,
        actionType: ACTION_TYPES.UPLOAD,
        entityType: ENTITY_TYPES.IMAGE,
        entityId: imageId,
        entityName: imageName,
        details: { operation: 'upload_image', requestId }
    }),

    // Log video upload
    logVideoUpload: (req, user, videoId, videoName, requestId) => logAction({
        req,
        user,
        actionType: ACTION_TYPES.UPLOAD,
        entityType: ENTITY_TYPES.VIDEO,
        entityId: videoId,
        entityName: videoName,
        details: { operation: 'upload_video', requestId }
    }),

    // Log user creation
    logUserCreate: (req, user, newUserId, newUserName) => logAction({
        req,
        user,
        actionType: ACTION_TYPES.CREATE,
        entityType: ENTITY_TYPES.USER,
        entityId: newUserId,
        entityName: newUserName,
        details: { operation: 'create_user' }
    }),

    // Log agent creation
    logAgentCreate: (req, user, agentId, agentName) => logAction({
        req,
        user,
        actionType: ACTION_TYPES.CREATE,
        entityType: ENTITY_TYPES.AGENT,
        entityId: agentId,
        entityName: agentName,
        details: { operation: 'create_agent' }
    }),

    // Log social media person creation
    logSocialMediaCreate: (req, user, smId, smName) => logAction({
        req,
        user,
        actionType: ACTION_TYPES.CREATE,
        entityType: ENTITY_TYPES.SOCIALMEDIAPERSON,
        entityId: smId,
        entityName: smName,
        details: { operation: 'create_socialmedia_person' }
    })
};

/**
 * Middleware function to wrap API routes with automatic action logging
 */
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
                await logActionFromResponse(req, response, options, startTime);
            }
            
            return response;
        } catch (err) {
            error = err;
            throw err;
        } finally {
            // Log failed actions too
            if (error && response) {
                await logActionFromResponse(req, response, { ...options, error: true }, startTime);
            }
        }
    };
}

async function logActionFromResponse(req, response, options, startTime) {
    try {
        const {
            actionType,
            entityType,
            entityIdExtractor,
            entityNameExtractor,
            detailsExtractor,
            skipLogging = false
        } = options;

        if (skipLogging) return;

        // Extract user information
        const user = await extractUserFromRequest(req);
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
        console.error('Error logging action from response:', error);
        // Don't throw error to avoid breaking the main request
    }
} 