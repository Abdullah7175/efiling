/**
 * E-Filing Login Action Logger
 * This module specifically handles logging of e-filing user login/logout actions
 * to the efiling_user_actions table instead of the general user_actions table
 */

import { connectToDatabase } from './db';
import { EFILING_ACTION_TYPES, EFILING_ENTITY_TYPES } from './efilingActionLogger';

/**
 * Log e-filing user login action
 * @param {Object} req - Request object
 * @param {Object} user - User object with id, name, email, role
 * @param {Object} options - Additional options
 */
export async function logEFilingLogin(req, user, options = {}) {
    try {
        const client = await connectToDatabase();
        
        // Extract client information
        const ipAddress = getClientIP(req);
        const userAgent = getUserAgent(req);
        
        // Prepare login details
        const loginDetails = {
            method: 'email_password',
            userType: 'efiling_user',
            timestamp: new Date().toISOString(),
            ...options
        };

        // Log to efiling_user_actions table
        await client.query(`
            INSERT INTO efiling_user_actions (
                file_id, user_id, action_type, description, timestamp, created_at,
                user_type, user_role, user_name, user_email, entity_type, entity_name,
                details, ip_address, user_agent
            ) VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            null, // file_id - not applicable for login
            user.id.toString(), // Convert to string to match VARCHAR column
            EFILING_ACTION_TYPES.USER_LOGIN,
            `User ${user.name} logged into e-filing system`,
            'efiling_user',
            user.role || 0,
            user.name,
            user.email,
            'auth',
            'e-filing_login',
            JSON.stringify(loginDetails),
            ipAddress,
            userAgent
        ]);

        console.log(`E-Filing login logged for user: ${user.name} (${user.email})`);
        
        if (client.release) {
            await client.release();
        }
        
        return true;
    } catch (error) {
        console.error('Error logging e-filing login:', error);
        return false;
    }
}

/**
 * Log e-filing user logout action
 * @param {Object} req - Request object
 * @param {Object} user - User object with id, name, email, role
 * @param {Object} options - Additional options
 */
export async function logEFilingLogout(req, user, options = {}) {
    try {
        const client = await connectToDatabase();
        
        // Extract client information
        const ipAddress = getClientIP(req);
        const userAgent = getUserAgent(req);
        
        // Prepare logout details
        const logoutDetails = {
            method: 'session_timeout',
            userType: 'efiling_user',
            timestamp: new Date().toISOString(),
            ...options
        };

        // Log to efiling_user_actions table
        await client.query(`
            INSERT INTO efiling_user_actions (
                file_id, user_id, action_type, description, timestamp, created_at,
                user_type, user_role, user_name, user_email, entity_type, entity_name,
                details, ip_address, user_agent
            ) VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            null, // file_id - not applicable for logout
            user.id.toString(), // Convert to string to match VARCHAR column
            EFILING_ACTION_TYPES.USER_LOGOUT,
            `User ${user.name} logged out of e-filing system`,
            'efiling_user',
            user.role || 0,
            user.name,
            user.email,
            'auth',
            'e-filing_logout',
            JSON.stringify(logoutDetails),
            ipAddress,
            userAgent
        ]);

        console.log(`E-Filing logout logged for user: ${user.name} (${user.email})`);
        
        if (client.release) {
            await client.release();
        }
        
        return true;
    } catch (error) {
        console.error('Error logging e-filing logout:', error);
        return false;
    }
}

/**
 * Get client IP address from request
 * @param {Object} req - Request object
 * @returns {string} IP address
 */
function getClientIP(req) {
    try {
        // Check for forwarded headers (common in production)
        const forwarded = req.headers.get('x-forwarded-for');
        if (forwarded) {
            return forwarded.split(',')[0].trim();
        }
        
        // Check for real IP header
        const realIP = req.headers.get('x-real-ip');
        if (realIP) {
            return realIP;
        }
        
        // Fallback to connection remote address
        return req.headers.get('x-forwarded-for') || '127.0.0.1';
    } catch (error) {
        return '127.0.0.1';
    }
}

/**
 * Get user agent from request
 * @param {Object} req - Request object
 * @returns {string} User agent string
 */
function getUserAgent(req) {
    try {
        return req.headers.get('user-agent') || 'Unknown';
    } catch (error) {
        return 'Unknown';
    }
}

/**
 * Log e-filing authentication attempt (successful or failed)
 * @param {Object} req - Request object
 * @param {Object} user - User object (null for failed attempts)
 * @param {boolean} success - Whether authentication was successful
 * @param {Object} options - Additional options
 */
export async function logEFilingAuthAttempt(req, user, success, options = {}) {
    try {
        const client = await connectToDatabase();
        
        // Extract client information
        const ipAddress = getClientIP(req);
        const userAgent = getUserAgent(req);
        
        // Prepare auth details
        const authDetails = {
            success,
            method: 'email_password',
            userType: user ? 'efiling_user' : 'unknown',
            timestamp: new Date().toISOString(),
            ...options
        };

        const actionType = success ? EFILING_ACTION_TYPES.USER_LOGIN : EFILING_ACTION_TYPES.AUTHENTICATION_ATTEMPT;
        const description = success 
            ? `User ${user.name} successfully authenticated`
            : `Failed authentication attempt for email: ${options.email || 'unknown'}`;

        // Log to efiling_user_actions table
        await client.query(`
            INSERT INTO efiling_user_actions (
                file_id, user_id, action_type, description, timestamp, created_at,
                user_type, user_role, user_name, user_email, entity_type, entity_name,
                details, ip_address, user_agent
            ) VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            null, // file_id - not applicable for auth
            user ? user.id.toString() : '0',
            actionType,
            description,
            user ? 'efiling_user' : 'unknown',
            user ? (user.role || 0) : 0,
            user ? user.name : 'Unknown User',
            user ? user.email : (options.email || 'unknown@example.com'),
            'auth',
            success ? 'e-filing_login' : 'e-filing_auth_failed',
            JSON.stringify(authDetails),
            ipAddress,
            userAgent
        ]);

        console.log(`E-Filing auth attempt logged: ${success ? 'SUCCESS' : 'FAILED'} for ${user ? user.email : options.email}`);
        
        if (client.release) {
            await client.release();
        }
        
        return true;
    } catch (error) {
        console.error('Error logging e-filing auth attempt:', error);
        return false;
    }
}

// Export the main functions
export const eFilingLoginLogger = {
    login: logEFilingLogin,
    logout: logEFilingLogout,
    authAttempt: logEFilingAuthAttempt
};
