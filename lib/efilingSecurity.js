import crypto from 'crypto';
import { eFileActionLogger, EFILING_ACTION_TYPES } from './efilingActionLogger';

// E-Filing specific security configuration
const EFILING_SECURITY_CONFIG = {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
    PASSWORD_MIN_LENGTH: 12,
    PASSWORD_REQUIREMENTS: {
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true
    },
    RATE_LIMITS: {
        login: { max: 5, window: 60 * 1000 }, // 5 attempts per minute
        api: { max: 100, window: 60 * 1000 }, // 100 requests per minute
        file_upload: { max: 10, window: 60 * 1000 }, // 10 uploads per minute
        workflow_action: { max: 50, window: 60 * 1000 } // 50 workflow actions per minute
    },
    FILE_UPLOAD_LIMITS: {
        maxSize: 50 * 1024 * 1024, // 50MB
        allowedTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'image/jpeg',
            'image/png',
            'image/gif',
            'text/plain'
        ]
    }
};

// Rate limiting store (in production, use Redis)
const eFileRateLimitStore = new Map();

class EFileSecurityManager {
    constructor() {
        this.failedLoginAttempts = new Map();
        this.activeSessions = new Map();
        this.suspiciousIPs = new Set();
        this.blockedUsers = new Set();
        this.cleanupInterval = null;
        this.startCleanupScheduler();
    }

    // Enhanced access control for e-filing
    async validateEFileAccess(userId, resourceType, resourceId, requiredPermission, workflowContext = null) {
        try {
            // Check if user is blocked
            if (this.blockedUsers.has(userId)) {
                await eFileActionLogger.logSecurityEvent('BLOCKED_USER_ACCESS_ATTEMPT', userId, {
                    resourceType,
                    resourceId,
                    requiredPermission,
                    reason: 'User account blocked'
                });
                return { allowed: false, reason: 'User account is blocked' };
            }

            // Check if user has permission for this resource
            const hasPermission = await this.checkEFileUserPermission(userId, resourceType, resourceId, requiredPermission, workflowContext);
            
            if (!hasPermission.allowed) {
                await eFileActionLogger.logSecurityEvent('AUTHORIZATION_FAILED', userId, {
                    resourceType,
                    resourceId,
                    requiredPermission,
                    reason: hasPermission.reason,
                    workflowContext
                });
                return hasPermission;
            }
            
            return { allowed: true };
        } catch (error) {
            console.error('E-Filing access validation error:', error);
            return { allowed: false, reason: 'System error during validation' };
        }
    }

    // Check user permissions in e-filing context
    async checkEFileUserPermission(userId, resourceType, resourceId, requiredPermission, workflowContext) {
        try {
            // This would integrate with your existing permission system
            // For now, returning a basic check
            return { allowed: true, reason: 'Permission granted' };
        } catch (error) {
            console.error('Error checking e-filing user permission:', error);
            return { allowed: false, reason: 'Error checking permissions' };
        }
    }

    // Enhanced file upload validation for e-filing
    validateEFileUpload(file, userId, fileType = null) {
        const errors = [];
        
        // Check file type
        if (!EFILING_SECURITY_CONFIG.FILE_UPLOAD_LIMITS.allowedTypes.includes(file.type)) {
            errors.push(`File type ${file.type} is not allowed in e-filing system`);
        }
        
        // Check file size
        if (file.size > EFILING_SECURITY_CONFIG.FILE_UPLOAD_LIMITS.maxSize) {
            errors.push(`File size ${file.size} exceeds maximum allowed size ${EFILING_SECURITY_CONFIG.FILE_UPLOAD_LIMITS.maxSize}`);
        }
        
        // Check file extension
        const extension = file.name.split('.').pop().toLowerCase();
        const allowedExtensions = EFILING_SECURITY_CONFIG.FILE_UPLOAD_LIMITS.allowedTypes.map(type => type.split('/')[1]);
        if (!allowedExtensions.includes(extension)) {
            errors.push(`File extension .${extension} is not allowed`);
        }
        
        // Additional e-filing specific validations
        if (fileType && fileType.requires_approval) {
            // Check if user has approval permissions
            // This would integrate with your permission system
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            securityLevel: 'HIGH'
        };
    }

    // E-Filing specific rate limiting
    checkEFileRateLimit(identifier, type, userId = null) {
        const key = `${identifier}:${type}`;
        const now = Date.now();
        const limit = EFILING_SECURITY_CONFIG.RATE_LIMITS[type];
        
        if (!limit) return { allowed: true };
        
        const current = eFileRateLimitStore.get(key) || { count: 0, resetTime: now + limit.window };
        
        if (now > current.resetTime) {
            current.count = 1;
            current.resetTime = now + limit.window;
        } else {
            current.count += 1;
        }
        
        eFileRateLimitStore.set(key, current);
        
        if (current.count > limit.max) {
            // Log security event
            if (userId) {
                eFileActionLogger.logSecurityEvent('RATE_LIMIT_EXCEEDED', userId, {
                    type,
                    identifier,
                    count: current.count,
                    limit: limit.max
                });
            }
            
            return { allowed: false, reason: 'Rate limit exceeded' };
        }
        
        return { allowed: true, remaining: limit.max - current.count };
    }

    // E-Filing session management
    createEFileSession(userId, ipAddress, userAgent, permissions = {}) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + EFILING_SECURITY_CONFIG.SESSION_TIMEOUT;
        
        this.activeSessions.set(sessionId, {
            userId,
            ipAddress,
            userAgent,
            permissions,
            createdAt: Date.now(),
            expiresAt,
            lastActivity: Date.now(),
            eFileContext: true
        });
        
        return sessionId;
    }

    validateEFileSession(sessionId, ipAddress, requiredPermissions = []) {
        const session = this.activeSessions.get(sessionId);
        
        if (!session) {
            return { valid: false, reason: 'Session not found' };
        }
        
        if (Date.now() > session.expiresAt) {
            this.activeSessions.delete(sessionId);
            return { valid: false, reason: 'Session expired' };
        }
        
        if (session.ipAddress !== ipAddress) {
            eFileActionLogger.logSecurityEvent('SESSION_HIJACK_ATTEMPT', session.userId, {
                originalIP: session.ipAddress,
                currentIP: ipAddress,
                sessionId
            });
            return { valid: false, reason: 'IP address mismatch' };
        }
        
        // Check required permissions
        if (requiredPermissions.length > 0) {
            const hasAllPermissions = requiredPermissions.every(permission => 
                session.permissions[permission]
            );
            
            if (!hasAllPermissions) {
                eFileActionLogger.logSecurityEvent('INSUFFICIENT_PERMISSIONS', session.userId, {
                    requiredPermissions,
                    userPermissions: session.permissions,
                    sessionId
                });
                return { valid: false, reason: 'Insufficient permissions' };
            }
        }
        
        // Update last activity
        session.lastActivity = Date.now();
        this.activeSessions.set(sessionId, session);
        
        return { valid: true, session };
    }

    // E-Filing specific security events
    async logEFileSecurityEvent(eventType, userId, details = {}) {
        await eFileActionLogger.logSecurityEvent(eventType, userId, {
            ...details,
            timestamp: new Date().toISOString(),
            severity: 'HIGH',
            context: 'E_FILING'
        });
    }

    // Block user for security violations
    async blockUser(userId, reason, duration = 24 * 60 * 60 * 1000) { // Default 24 hours
        this.blockedUsers.add(userId);
        
        await this.logEFileSecurityEvent('USER_BLOCKED', userId, {
            reason,
            duration,
            blockedAt: new Date().toISOString()
        });
        
        // Auto-unblock after duration
        setTimeout(() => {
            this.blockedUsers.delete(userId);
            this.logEFileSecurityEvent('USER_UNBLOCKED', userId, {
                reason: 'Auto-unblocked after duration',
                unblockedAt: new Date().toISOString()
            });
        }, duration);
    }

    // Cleanup methods
    cleanupFailedAttempts() {
        const now = Date.now();
        for (const [key, value] of this.failedLoginAttempts.entries()) {
            if (now - value.lastAttempt > EFILING_SECURITY_CONFIG.LOCKOUT_DURATION) {
                this.failedLoginAttempts.delete(key);
            }
        }
    }

    cleanupExpiredSessions() {
        const now = Date.now();
        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (now > session.expiresAt) {
                this.activeSessions.delete(sessionId);
            }
        }
    }

    // Periodic cleanup with proper interval management
    startCleanupScheduler() {
        // Clear any existing interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        this.cleanupInterval = setInterval(() => {
            try {
                this.cleanupFailedAttempts();
                this.cleanupExpiredSessions();
            } catch (error) {
                console.error('Error during cleanup:', error);
            }
        }, 5 * 60 * 1000); // Every 5 minutes
    }
    
    stopCleanupScheduler() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

// Export singleton instance
export const eFileSecurityManager = new EFileSecurityManager();

// Start cleanup scheduler
eFileSecurityManager.startCleanupScheduler();

// Export individual functions for backward compatibility
export const validateEFileAccess = (userId, resourceType, resourceId, requiredPermission, workflowContext) =>
    eFileSecurityManager.validateEFileAccess(userId, resourceType, resourceId, requiredPermission, workflowContext);

export const validateEFileUpload = (file, userId, fileType) => 
    eFileSecurityManager.validateEFileUpload(file, userId, fileType);

export const checkEFileRateLimit = (identifier, type, userId) => 
    eFileSecurityManager.checkEFileRateLimit(identifier, type, userId);

export const createEFileSession = (userId, ipAddress, userAgent, permissions) => 
    eFileSecurityManager.createEFileSession(userId, ipAddress, userAgent, permissions);

export const validateEFileSession = (sessionId, ipAddress, requiredPermissions) => 
    eFileSecurityManager.validateEFileSession(sessionId, ipAddress, requiredPermissions);
