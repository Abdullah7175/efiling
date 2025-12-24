// lib/authMiddleware.js
// Reusable authentication middleware for API routes
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

/**
 * Require authentication for API routes
 * @param {Request} request - The incoming request
 * @returns {Promise<{session: any, user: any} | NextResponse>} - Session and user if authenticated, or error response
 */
export async function requireAuth(request) {
    const session = await auth();
    
    if (!session?.user) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }
    
    return { session, user: session.user };
}

/**
 * Require admin role
 * @param {Request} request - The incoming request
 * @returns {Promise<{session: any, user: any} | NextResponse>} - Session and user if admin, or error response
 */
export async function requireAdmin(request) {
    const authResult = await requireAuth(request);
    
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    
    const { user } = authResult;
    const isAdmin = [1, 2].includes(parseInt(user.role));
    
    if (!isAdmin) {
        return NextResponse.json(
            { error: 'Forbidden - Admin access required' },
            { status: 403 }
        );
    }
    
    return authResult;
}

/**
 * Check if user owns a resource or is admin
 * @param {number|string} userId - The user ID from session
 * @param {number|string} resourceUserId - The user ID who owns the resource
 * @param {boolean} isAdmin - Whether the user is an admin
 * @returns {boolean} - True if user can access the resource
 */
export function checkOwnership(userId, resourceUserId, isAdmin = false) {
    if (isAdmin) return true;
    return parseInt(userId) === parseInt(resourceUserId);
}

/**
 * Check if user can access a file (for e-filing system)
 * @param {any} client - Database client
 * @param {number} fileId - The file ID
 * @param {number} userId - The user ID from users table
 * @param {boolean} isAdmin - Whether the user is an admin
 * @returns {Promise<boolean>} - True if user can access the file
 */
export async function checkFileAccess(client, fileId, userId, isAdmin = false) {
    if (isAdmin) return true;
    
    try {
        // First, get the e-filing user ID for this user
        const efilingUserResult = await client.query(
            `SELECT id FROM efiling_users WHERE user_id = $1 AND is_active = true`,
            [userId]
        );
        
        // If user is not an e-filing user, deny access (unless admin, which is already checked)
        if (efilingUserResult.rows.length === 0) {
            console.log(`[checkFileAccess] User ${userId} is not an e-filing user, denying access to file ${fileId}`);
            return false;
        }
        
        const efilingUserId = efilingUserResult.rows[0].id;
        
        // Get file details - created_by and assigned_to reference efiling_users.id
        const result = await client.query(
            `SELECT created_by, assigned_to, department_id 
             FROM efiling_files 
             WHERE id = $1`,
            [fileId]
        );
        
        if (result.rows.length === 0) {
            return false;
        }
        
        const file = result.rows[0];
        
        // Check if user created the file or is assigned to it
        // Both created_by and assigned_to reference efiling_users.id
        if (file.created_by === efilingUserId || file.assigned_to === efilingUserId) {
            console.log(`[checkFileAccess] User ${userId} (efiling: ${efilingUserId}) has access to file ${fileId} - created_by: ${file.created_by}, assigned_to: ${file.assigned_to}`);
            return true;
        }
        
        // Check if user is in the same department (optional enhancement)
        if (file.department_id) {
            const deptCheck = await client.query(
                `SELECT eu.id 
                 FROM efiling_users eu
                 WHERE eu.user_id = $1 
                 AND eu.department_id = $2 
                 AND eu.is_active = true`,
                [userId, file.department_id]
            );
            if (deptCheck.rows.length > 0) {
                console.log(`[checkFileAccess] User ${userId} has department access to file ${fileId} (department: ${file.department_id})`);
                return true;
            }
        }
        
        console.log(`[checkFileAccess] User ${userId} (efiling: ${efilingUserId}) denied access to file ${fileId} - created_by: ${file.created_by}, assigned_to: ${file.assigned_to}, department: ${file.department_id}`);
        return false;
    } catch (error) {
        console.error('Error checking file access:', error);
        return false;
    }
}

