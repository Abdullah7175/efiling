import { NextResponse } from 'next/server';

// In-memory rate limit store (use Redis in production)
const rateLimitStore = new Map();

/**
 * Rate limiting configuration
 */
const RATE_LIMIT_CONFIG = {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
};

/**
 * Cleans up old rate limit entries
 */
function cleanupRateLimit() {
    const now = Date.now();
    for (const [key, value] of rateLimitStore.entries()) {
        if (now > value.resetAt) {
            rateLimitStore.delete(key);
        }
    }
}

/**
 * Validates API key for external API access
 * @param {Request} request - The incoming request
 * @returns {NextResponse|null} - Error response if invalid, null if valid
 */
export function validateApiKey(request) {
    const apiKey = request.headers.get('X-API-Key') || request.headers.get('x-api-key');
    const expectedKey = process.env.VIDEO_ARCHIVING_API_KEY || process.env.EXTERNAL_API_KEY;
    
    // Allow requests from localhost without API key in development
    const isLocalhost = request.headers.get('host')?.includes('localhost') || 
                       request.headers.get('host')?.includes('127.0.0.1') ||
                       request.headers.get('x-forwarded-for')?.includes('127.0.0.1');
    
    // In development, allow localhost without API key
    if (process.env.NODE_ENV === 'development' && isLocalhost && !apiKey) {
        return null; // Allow
    }
    
    if (!apiKey) {
        return NextResponse.json(
            { error: 'API key required. Provide X-API-Key header.' },
            { status: 401 }
        );
    }
    
    if (!expectedKey) {
        console.warn('VIDEO_ARCHIVING_API_KEY or EXTERNAL_API_KEY not set in environment');
        // In development, allow if no key is configured
        if (process.env.NODE_ENV === 'development') {
            return null;
        }
        return NextResponse.json(
            { error: 'Server configuration error' },
            { status: 500 }
        );
    }
    
    if (apiKey !== expectedKey) {
        return NextResponse.json(
            { error: 'Unauthorized - Invalid API key' },
            { status: 401 }
        );
    }
    
    return null; // Valid
}

/**
 * Checks rate limit for API key
 * @param {Request} request - The incoming request
 * @returns {NextResponse|null} - Error response if rate limited, null if allowed
 */
export function checkRateLimit(request) {
    const apiKey = request.headers.get('X-API-Key') || request.headers.get('x-api-key');
    
    // Skip rate limiting in development for localhost
    const isLocalhost = request.headers.get('host')?.includes('localhost') || 
                       request.headers.get('host')?.includes('127.0.0.1');
    if (process.env.NODE_ENV === 'development' && isLocalhost && !apiKey) {
        return null;
    }
    
    if (!apiKey) {
        return null; // Will be caught by validateApiKey
    }
    
    cleanupRateLimit();
    
    const now = Date.now();
    const key = `rate_limit:${apiKey}`;
    const limit = rateLimitStore.get(key);
    
    if (!limit) {
        rateLimitStore.set(key, {
            count: 1,
            resetAt: now + RATE_LIMIT_CONFIG.windowMs,
        });
        return null; // Allowed
    }
    
    if (now > limit.resetAt) {
        // Reset window
        rateLimitStore.set(key, {
            count: 1,
            resetAt: now + RATE_LIMIT_CONFIG.windowMs,
        });
        return null; // Allowed
    }
    
    if (limit.count >= RATE_LIMIT_CONFIG.maxRequests) {
        return NextResponse.json(
            {
                error: 'Rate limit exceeded',
                resetAt: new Date(limit.resetAt).toISOString(),
            },
            {
                status: 429,
                headers: {
                    'X-RateLimit-Limit': RATE_LIMIT_CONFIG.maxRequests.toString(),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': new Date(limit.resetAt).toISOString(),
                },
            }
        );
    }
    
    // Increment count
    limit.count++;
    rateLimitStore.set(key, limit);
    
    return null; // Allowed
}

/**
 * Gets rate limit headers for response
 * @param {Request} request - The incoming request
 * @returns {Object} - Headers object with rate limit info
 */
export function getRateLimitHeaders(request) {
    const apiKey = request.headers.get('X-API-Key') || request.headers.get('x-api-key');
    
    if (!apiKey) {
        return {};
    }
    
    const key = `rate_limit:${apiKey}`;
    const limit = rateLimitStore.get(key);
    
    if (!limit) {
        return {
            'X-RateLimit-Limit': RATE_LIMIT_CONFIG.maxRequests.toString(),
            'X-RateLimit-Remaining': (RATE_LIMIT_CONFIG.maxRequests - 1).toString(),
            'X-RateLimit-Reset': new Date(Date.now() + RATE_LIMIT_CONFIG.windowMs).toISOString(),
        };
    }
    
    return {
        'X-RateLimit-Limit': RATE_LIMIT_CONFIG.maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, RATE_LIMIT_CONFIG.maxRequests - limit.count).toString(),
        'X-RateLimit-Reset': new Date(limit.resetAt).toISOString(),
    };
}

