import { NextResponse } from 'next/server';

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
            { error: 'Unauthorized - API key required. Provide X-API-Key header.' },
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

