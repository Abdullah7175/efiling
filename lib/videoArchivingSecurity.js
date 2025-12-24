import { connectToDatabase } from '@/lib/db';

// OWASP Top 10 Security Configuration
const VIDEO_ARCHIVING_SECURITY_CONFIG = {
    // Rate limiting configuration
    RATE_LIMITS: {
        API_CALLS: { max: 100, windowMs: 15 * 60 * 1000 }, // 100 calls per 15 minutes
        FILE_UPLOADS: { max: 10, windowMs: 60 * 60 * 1000 }, // 10 uploads per hour
        LOGIN_ATTEMPTS: { max: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts per 15 minutes
        PUBLIC_VIEWS: { max: 1000, windowMs: 60 * 60 * 1000 } // 1000 views per hour
    },
    
    // File upload security
    FILE_UPLOAD: {
        MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB
        ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv'],
        ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        SCAN_FOR_MALWARE: true,
        VALIDATE_FILE_CONTENT: true
    },
    
    // Session security
    SESSION: {
        MAX_AGE: 2 * 60 * 60 * 1000, // 2 hours
        REGENERATE_ID: true,
        SECURE_COOKIES: true,
        HTTP_ONLY: true,
        SAME_SITE: 'strict'
    },
    
    // Input validation
    VALIDATION: {
        MAX_STRING_LENGTH: 1000,
        ALLOWED_HTML_TAGS: ['b', 'i', 'u', 'strong', 'em'],
        SQL_INJECTION_PATTERNS: [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT|JAVASCRIPT)\b)/i,
            /(--|\/\*|\*\/|xp_|sp_|@@|char\(|nchar\(|varchar\(|nvarchar\(|cast\(|convert\(|exec\(|execute\(|sp_executesql)/i
        ],
        XSS_PATTERNS: [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi
        ]
    },
    
    // Access control
    ACCESS_CONTROL: {
        PUBLIC_ROUTES: ['/public/videos', '/public/images', '/public/documents'],
        PROTECTED_ROUTES: ['/agent', '/smagent', '/dashboard'],
        ADMIN_ROLES: [1, 2], // Role IDs for admin access
        AGENT_ROLES: [3, 4], // Role IDs for agent access
        SOCIAL_MEDIA_ROLES: [5, 6] // Role IDs for social media access
    }
};

class VideoArchivingSecurityManager {
    constructor() {
        this.rateLimitStore = new Map();
        this.securityEvents = [];
    }

    // OWASP #1: Broken Access Control
    async validateAccess(userId, userRole, resourceType, resourceId, action) {
        try {
            if (!userId || !userRole) {
                return { allowed: false, reason: 'Authentication required' };
            }

            // Check if user has permission for this action
            const hasPermission = await this.checkUserPermissions(userId, userRole, resourceType, action);
            if (!hasPermission) {
                return { allowed: false, reason: 'Insufficient permissions' };
            }

            // Check if user can access this specific resource
            if (resourceId) {
                const canAccessResource = await this.checkResourceAccess(userId, userRole, resourceType, resourceId);
                if (!canAccessResource) {
                    return { allowed: false, reason: 'Resource access denied' };
                }
            }

            return { allowed: true };
        } catch (error) {
            console.error('Access validation error:', error);
            return { allowed: false, reason: 'Access validation failed' };
        }
    }

    // OWASP #2: Cryptographic Failures
    async validateFileIntegrity(fileHash, expectedHash) {
        if (!fileHash || !expectedHash) {
            return false;
        }
        
        // Use constant-time comparison to prevent timing attacks
        return this.constantTimeComparison(fileHash, expectedHash);
    }

    // OWASP #3: Injection Prevention
    validateInput(input, type = 'string') {
        if (!input) return { valid: false, reason: 'Input is required' };

        // Check for SQL injection patterns
        for (const pattern of VIDEO_ARCHIVING_SECURITY_CONFIG.VALIDATION.SQL_INJECTION_PATTERNS) {
            if (pattern.test(input)) {
                return { valid: false, reason: 'Invalid input pattern detected' };
            }
        }

        // Check for XSS patterns
        for (const pattern of VIDEO_ARCHIVING_SECURITY_CONFIG.VALIDATION.XSS_PATTERNS) {
            if (pattern.test(input)) {
                return { valid: false, reason: 'XSS pattern detected' };
            }
        }

        // Length validation
        if (input.length > VIDEO_ARCHIVING_SECURITY_CONFIG.VALIDATION.MAX_STRING_LENGTH) {
            return { valid: false, reason: 'Input too long' };
        }

        return { valid: true, sanitized: this.sanitizeInput(input, type) };
    }

    // OWASP #4: Insecure Design
    async validateFileUpload(file, userId, userRole) {
        try {
            // Check file size
            if (file.size > VIDEO_ARCHIVING_SECURITY_CONFIG.FILE_UPLOAD.MAX_FILE_SIZE) {
                return { allowed: false, reason: 'File too large' };
            }

            // Check file type
            const allowedTypes = [
                ...VIDEO_ARCHIVING_SECURITY_CONFIG.FILE_UPLOAD.ALLOWED_VIDEO_TYPES,
                ...VIDEO_ARCHIVING_SECURITY_CONFIG.FILE_UPLOAD.ALLOWED_IMAGE_TYPES,
                ...VIDEO_ARCHIVING_SECURITY_CONFIG.FILE_UPLOAD.ALLOWED_DOCUMENT_TYPES
            ];

            if (!allowedTypes.includes(file.type)) {
                return { allowed: false, reason: 'File type not allowed' };
            }

            // Check user upload limits
            const uploadLimit = await this.checkUserUploadLimits(userId, userRole);
            if (!uploadLimit.allowed) {
                return uploadLimit;
            }

            // Generate secure filename
            const secureFilename = this.generateSecureFilename(file.name);

            return {
                allowed: true,
                secureFilename,
                fileHash: await this.generateFileHash(file)
            };
        } catch (error) {
            console.error('File upload validation error:', error);
            return { allowed: false, reason: 'File validation failed' };
        }
    }

    // OWASP #5: Security Misconfiguration
    async validateSystemConfiguration() {
        try {
            const client = await connectToDatabase();
            
            // Check database connection security
            const dbConfig = await client.query('SHOW VARIABLES LIKE "ssl_mode"');
            const sslEnabled = dbConfig.rows.some(row => row.Value === 'REQUIRED');
            
            // Check for default accounts
            const defaultAccounts = await client.query(`
                SELECT COUNT(*) as count FROM users 
                WHERE username IN ('admin', 'root', 'test') 
                AND password_hash = 'default_hash'
            `);
            
            await client.release();

            return {
                sslEnabled,
                noDefaultAccounts: defaultAccounts.rows[0].count === 0,
                secure: sslEnabled && defaultAccounts.rows[0].count === 0
            };
        } catch (error) {
            console.error('Configuration validation error:', error);
            return { secure: false, error: error.message };
        }
    }

    // OWASP #6: Vulnerable Components
    async checkDependencies() {
        // This would typically check package.json and known vulnerabilities
        // For now, return a placeholder
        return {
            secure: true,
            lastChecked: new Date().toISOString(),
            vulnerabilities: []
        };
    }

    // OWASP #7: Authentication Failures
    async validateAuthentication(credentials, ipAddress) {
        try {
            // Rate limiting for login attempts
            const rateLimit = this.checkRateLimit(ipAddress, 'LOGIN_ATTEMPTS');
            if (!rateLimit.allowed) {
                return { valid: false, reason: 'Too many login attempts' };
            }

            // Validate credentials format
            if (!credentials.username || !credentials.password) {
                return { valid: false, reason: 'Invalid credentials format' };
            }

            // Check for brute force patterns
            const bruteForceCheck = this.detectBruteForce(ipAddress);
            if (bruteForceCheck.detected) {
                return { valid: false, reason: 'Suspicious activity detected' };
            }

            return { valid: true };
        } catch (error) {
            console.error('Authentication validation error:', error);
            return { valid: false, reason: 'Authentication validation failed' };
        }
    }

    // OWASP #8: Software and Data Integrity Failures
    async validateDataIntegrity(data, checksum) {
        try {
            const calculatedChecksum = await this.calculateChecksum(data);
            return this.constantTimeComparison(calculatedChecksum, checksum);
        } catch (error) {
            console.error('Data integrity validation error:', error);
            return false;
        }
    }

    // OWASP #9: Logging Failures
    async logSecurityEvent(eventType, userId, ipAddress, details, severity = 'INFO') {
        try {
            const event = {
                timestamp: new Date().toISOString(),
                eventType,
                userId: userId || 'anonymous',
                ipAddress,
                details,
                severity,
                userAgent: details.userAgent || 'unknown'
            };

            this.securityEvents.push(event);

            // Log to database
            const client = await connectToDatabase();
            await client.query(`
                INSERT INTO security_events (
                    event_type, user_id, ip_address, details, severity, timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [eventType, userId, ipAddress, JSON.stringify(details), severity, event.timestamp]);

            await client.release();

            // Log to console for development
            console.log(`[SECURITY] ${severity}: ${eventType}`, event);
        } catch (error) {
            console.error('Security event logging error:', error);
        }
    }

    // OWASP #10: Server-Side Request Forgery
    validateExternalRequest(url, method) {
        try {
            const parsedUrl = new URL(url);
            
            // Block internal network access
            const internalNetworks = [
                '127.0.0.1', 'localhost', '0.0.0.0',
                '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'
            ];

            for (const network of internalNetworks) {
                if (parsedUrl.hostname.includes(network)) {
                    return { allowed: false, reason: 'Internal network access blocked' };
                }
            }

            // Only allow specific methods
            const allowedMethods = ['GET', 'POST'];
            if (!allowedMethods.includes(method.toUpperCase())) {
                return { allowed: false, reason: 'Method not allowed' };
            }

            return { allowed: true };
        } catch (error) {
            return { allowed: false, reason: 'Invalid URL' };
        }
    }

    // Rate limiting implementation
    checkRateLimit(identifier, type) {
        const now = Date.now();
        const config = VIDEO_ARCHIVING_SECURITY_CONFIG.RATE_LIMITS[type];
        
        if (!config) return { allowed: true };

        const key = `${identifier}:${type}`;
        const userRequests = this.rateLimitStore.get(key) || [];

        // Remove expired requests
        const validRequests = userRequests.filter(time => now - time < config.windowMs);

        if (validRequests.length >= config.max) {
            return { allowed: false, reason: 'Rate limit exceeded' };
        }

        // Add current request
        validRequests.push(now);
        this.rateLimitStore.set(key, validRequests);

        return { allowed: true, remaining: config.max - validRequests.length };
    }

    // Helper methods
    async checkUserPermissions(userId, userRole, resourceType, action) {
        // This would check against a permissions table
        // For now, return basic role-based permissions
        if (userRole === 1 || userRole === 2) return true; // Admin
        if (userRole === 3 || userRole === 4) return ['view', 'upload'].includes(action); // Agent
        if (userRole === 5 || userRole === 6) return ['view', 'upload'].includes(action); // Social Media
        
        return false;
    }

    async checkResourceAccess(userId, userRole, resourceType, resourceId) {
        // This would check if user can access specific resource
        // For now, return true for basic access
        return true;
    }

    async checkUserUploadLimits(userId, userRole) {
        // This would check user's upload limits
        // For now, return allowed
        return { allowed: true };
    }

    constantTimeComparison(a, b) {
        if (a.length !== b.length) return false;
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
    }

    sanitizeInput(input, type) {
        // Basic sanitization - in production, use a proper sanitization library
        return input.replace(/[<>]/g, '');
    }

    generateSecureFilename(originalName) {
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 15);
        const extension = originalName.split('.').pop();
        return `${timestamp}_${randomString}.${extension}`;
    }

    async generateFileHash(file) {
        // In production, use crypto.subtle.digest for proper hashing
        return `${file.name}_${file.size}_${file.lastModified}`;
    }

    detectBruteForce(ipAddress) {
        // Basic brute force detection
        const key = `brute_force:${ipAddress}`;
        const attempts = this.rateLimitStore.get(key) || [];
        const now = Date.now();
        const recentAttempts = attempts.filter(time => now - time < 5 * 60 * 1000); // 5 minutes
        
        return {
            detected: recentAttempts.length > 10,
            attempts: recentAttempts.length
        };
    }

    async calculateChecksum(data) {
        // In production, use proper cryptographic hashing
        return `checksum_${data.length}_${Date.now()}`;
    }
}

// Export singleton instance
export const videoArchivingSecurityManager = new VideoArchivingSecurityManager();
