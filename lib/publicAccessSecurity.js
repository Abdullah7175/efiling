import { videoArchivingSecurityManager } from './videoArchivingSecurity';
import { connectToDatabase } from './db';

class PublicAccessSecurityManager {
    constructor() {
        this.publicAccessLog = new Map();
        this.suspiciousActivityLog = new Map();
    }

    // Validate public access to media files
    async validatePublicAccess(request, mediaType, mediaId) {
        try {
            const ipAddress = this.getClientIP(request);
            const userAgent = this.getUserAgent(request);
            const referer = this.getReferer(request);

            // Step 1: Rate limiting for public access
            const rateLimit = this.checkPublicAccessRateLimit(ipAddress, mediaType);
            if (!rateLimit.allowed) {
                await this.logSecurityEvent('PUBLIC_ACCESS_RATE_LIMITED', null, ipAddress, {
                    mediaType,
                    mediaId,
                    reason: rateLimit.reason,
                    userAgent,
                    referer
                }, 'WARNING');
                return rateLimit;
            }

            // Step 2: Check for suspicious activity
            const suspiciousCheck = this.detectSuspiciousActivity(ipAddress, userAgent, referer);
            if (suspiciousCheck.detected) {
                await this.logSecurityEvent('SUSPICIOUS_PUBLIC_ACCESS', null, ipAddress, {
                    mediaType,
                    mediaId,
                    reason: suspiciousCheck.reason,
                    userAgent,
                    referer,
                    patterns: suspiciousCheck.patterns
                }, 'WARNING');
                return { allowed: false, reason: 'Suspicious activity detected' };
            }

            // Step 3: Validate media access permissions
            const mediaAccess = await this.validateMediaAccess(mediaType, mediaId, ipAddress);
            if (!mediaAccess.allowed) {
                await this.logSecurityEvent('PUBLIC_ACCESS_DENIED', null, ipAddress, {
                    mediaType,
                    mediaId,
                    reason: mediaAccess.reason,
                    userAgent,
                    referer
                }, 'INFO');
                return mediaAccess;
            }

            // Step 4: Log successful access
            await this.logSecurityEvent('PUBLIC_ACCESS_GRANTED', null, ipAddress, {
                mediaType,
                mediaId,
                userAgent,
                referer,
                timestamp: new Date().toISOString()
            }, 'INFO');

            return { allowed: true, mediaInfo: mediaAccess.mediaInfo };
        } catch (error) {
            console.error('Public access validation error:', error);
            await this.logSecurityEvent('PUBLIC_ACCESS_ERROR', null, this.getClientIP(request), {
                mediaType,
                mediaId,
                error: error.message
            }, 'ERROR');
            
            return { allowed: false, reason: 'Access validation failed' };
        }
    }

    // Rate limiting for public access
    checkPublicAccessRateLimit(ipAddress, mediaType) {
        const now = Date.now();
        const key = `public_access:${ipAddress}:${mediaType}`;
        const userRequests = this.publicAccessLog.get(key) || [];

        // Remove expired requests (1 hour window)
        const validRequests = userRequests.filter(time => now - time < 60 * 60 * 1000);

        // Different limits for different media types
        const limits = {
            'video': 100, // 100 video views per hour
            'image': 200, // 200 image views per hour
            'document': 50  // 50 document views per hour
        };

        const limit = limits[mediaType] || 100;

        if (validRequests.length >= limit) {
            return { 
                allowed: false, 
                reason: `Rate limit exceeded for ${mediaType} access` 
            };
        }

        // Add current request
        validRequests.push(now);
        this.publicAccessLog.set(key, validRequests);

        return { 
            allowed: true, 
            remaining: limit - validRequests.length 
        };
    }

    // Detect suspicious activity patterns
    detectSuspiciousActivity(ipAddress, userAgent, referer) {
        const patterns = [];

        // Check for missing or suspicious user agent
        if (!userAgent || userAgent === 'unknown') {
            patterns.push('missing_user_agent');
        }

        if (userAgent && (
            userAgent.includes('bot') || 
            userAgent.includes('crawler') || 
            userAgent.includes('spider') ||
            userAgent.length < 10
        )) {
            patterns.push('suspicious_user_agent');
        }

        // Check for missing referer (could indicate direct access)
        if (!referer) {
            patterns.push('missing_referer');
        }

        // Check for suspicious referer patterns
        if (referer && (
            referer.includes('javascript:') ||
            referer.includes('data:') ||
            referer.includes('vbscript:') ||
            referer.length > 500
        )) {
            patterns.push('suspicious_referer');
        }

        // Check for rapid access patterns
        const rapidAccessKey = `rapid_access:${ipAddress}`;
        const rapidAccessLog = this.suspiciousActivityLog.get(rapidAccessKey) || [];
        const now = Date.now();
        const recentAccess = rapidAccessLog.filter(time => now - time < 60 * 1000); // 1 minute

        if (recentAccess.length > 20) { // More than 20 requests per minute
            patterns.push('rapid_access');
        }

        // Update rapid access log
        recentAccess.push(now);
        this.suspiciousActivityLog.set(rapidAccessKey, recentAccess);

        // Check for suspicious IP patterns
        if (this.isSuspiciousIP(ipAddress)) {
            patterns.push('suspicious_ip');
        }

        const detected = patterns.length > 0;
        return {
            detected,
            patterns,
            reason: detected ? `Suspicious patterns detected: ${patterns.join(', ')}` : null
        };
    }

    // Validate media access permissions
    async validateMediaAccess(mediaType, mediaId, ipAddress) {
        try {
            const client = await connectToDatabase();

            // Check if media exists and is public
            let mediaQuery;
            let mediaTable;

            switch (mediaType) {
                case 'video':
                    mediaTable = 'videos';
                    mediaQuery = 'SELECT * FROM videos WHERE id = $1 AND is_public = true AND is_active = true';
                    break;
                case 'image':
                    mediaTable = 'images';
                    mediaQuery = 'SELECT * FROM images WHERE id = $1 AND is_public = true AND is_active = true';
                    break;
                case 'document':
                    mediaTable = 'documents';
                    mediaQuery = 'SELECT * FROM documents WHERE id = $1 AND is_public = true AND is_active = true';
                    break;
                default:
                    await client.release();
                    return { allowed: false, reason: 'Invalid media type' };
            }

            const mediaResult = await client.query(mediaQuery, [mediaId]);
            await client.release();

            if (mediaResult.rows.length === 0) {
                return { allowed: false, reason: 'Media not found or not public' };
            }

            const media = mediaResult.rows[0];

            // Check if media has any access restrictions
            if (media.access_restrictions) {
                const restrictions = JSON.parse(media.access_restrictions);
                
                // Check IP restrictions
                if (restrictions.allowed_ips && restrictions.allowed_ips.length > 0) {
                    if (!restrictions.allowed_ips.includes(ipAddress)) {
                        return { allowed: false, reason: 'IP address not allowed' };
                    }
                }

                // Check time restrictions
                if (restrictions.time_restrictions) {
                    const now = new Date();
                    const currentHour = now.getHours();
                    const currentDay = now.getDay();

                    if (restrictions.time_restrictions.hours && 
                        !restrictions.time_restrictions.hours.includes(currentHour)) {
                        return { allowed: false, reason: 'Access not allowed at this time' };
                    }

                    if (restrictions.time_restrictions.days && 
                        !restrictions.time_restrictions.days.includes(currentDay)) {
                        return { allowed: false, reason: 'Access not allowed on this day' };
                    }
                }

                // Check geographic restrictions (if implemented)
                if (restrictions.geographic_restrictions) {
                    // This would require IP geolocation service
                    // For now, skip this check
                }
            }

            return { 
                allowed: true, 
                mediaInfo: {
                    id: media.id,
                    name: media.name,
                    type: mediaType,
                    size: media.file_size,
                    uploadedAt: media.uploaded_at
                }
            };

        } catch (error) {
            console.error('Media access validation error:', error);
            return { allowed: false, reason: 'Media validation failed' };
        }
    }

    // Check if IP address is suspicious
    isSuspiciousIP(ipAddress) {
        // Check for localhost or private network access
        if (ipAddress === '127.0.0.1' || ipAddress === 'localhost') {
            return true;
        }

        // Check for private network ranges
        const privateRanges = [
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./
        ];

        for (const range of privateRanges) {
            if (range.test(ipAddress)) {
                return true;
            }
        }

        // Check for suspicious patterns (e.g., sequential IPs)
        const parts = ipAddress.split('.');
        if (parts.length === 4) {
            const lastPart = parseInt(parts[3]);
            if (lastPart === 0 || lastPart === 255) {
                return true;
            }
        }

        return false;
    }

    // Get client IP address
    getClientIP(request) {
        return request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               request.headers.get('x-client-ip') || 
               'unknown';
    }

    // Get user agent
    getUserAgent(request) {
        return request.headers.get('user-agent') || 'unknown';
    }

    // Get referer
    getReferer(request) {
        return request.headers.get('referer') || null;
    }

    // Log security events
    async logSecurityEvent(eventType, userId, ipAddress, details, severity) {
        try {
            await videoArchivingSecurityManager.logSecurityEvent(
                eventType, userId, ipAddress, details, severity
            );
        } catch (error) {
            console.error('Security event logging error:', error);
        }
    }

    // Clean up old logs (should be called periodically)
    cleanupOldLogs() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        // Clean public access log
        for (const [key, requests] of this.publicAccessLog.entries()) {
            const validRequests = requests.filter(time => now - time < maxAge);
            if (validRequests.length === 0) {
                this.publicAccessLog.delete(key);
            } else {
                this.publicAccessLog.set(key, validRequests);
            }
        }

        // Clean suspicious activity log
        for (const [key, requests] of this.suspiciousActivityLog.entries()) {
            const validRequests = requests.filter(time => now - time < maxAge);
            if (validRequests.length === 0) {
                this.suspiciousActivityLog.delete(key);
            } else {
                this.suspiciousActivityLog.set(key, validRequests);
            }
        }
    }

    // Get security statistics
    getSecurityStats() {
        return {
            publicAccessLogSize: this.publicAccessLog.size,
            suspiciousActivityLogSize: this.suspiciousActivityLog.size,
            totalPublicAccesses: Array.from(this.publicAccessLog.values())
                .reduce((sum, requests) => sum + requests.length, 0),
            totalSuspiciousActivities: Array.from(this.suspiciousActivityLog.values())
                .reduce((sum, requests) => sum + requests.length, 0)
        };
    }
}

// Export singleton instance
export const publicAccessSecurityManager = new PublicAccessSecurityManager();

// Export middleware function for use in API routes
export const publicAccessSecurityMiddleware = async (req, res, next) => {
    try {
        // This would be used in API routes to validate public access
        // Implementation depends on your specific API framework
        return publicAccessSecurityManager;
    } catch (error) {
        console.error('Public access security middleware error:', error);
        throw error;
    }
};

// Clean up logs every hour
setInterval(() => {
    publicAccessSecurityManager.cleanupOldLogs();
}, 60 * 60 * 1000);
