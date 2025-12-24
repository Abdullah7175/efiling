import { NextResponse } from 'next/server';
// Note: getToken from next-auth/jwt uses Node.js crypto which isn't available in Edge runtime
// We'll check for session cookies directly instead

export async function efilingAuthMiddleware(request) {
    const pathname = request.nextUrl.pathname;
    const isDev = process.env.NODE_ENV === 'development';
    const withSecurityHeaders = (res) => {
        try {
            // Skip setting headers for API routes that handle their own headers (like /api/uploads/)
            // These routes set their own X-Frame-Options and CSP headers
            if (pathname.startsWith('/api/')) {
                // Don't set X-Frame-Options here - let the API route handler set it
                // This allows /api/uploads/[...path]/route.js to set SAMEORIGIN for PDFs
                return res;
            }
            
            // For non-API routes, set full security headers
            res.headers.set('X-Frame-Options', 'DENY');
            res.headers.set('X-Content-Type-Options', 'nosniff');
            res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
            res.headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
            const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";
            const connectSrc = isDev ? "connect-src 'self' ws: http://localhost:5000 ws: http://119.30.113.18:5000" : "connect-src 'self'";
            // Allow object-src 'self' for PDF embedding via <object> tag
            const csp = `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; media-src 'self' blob: https: http:; ${connectSrc}; frame-ancestors 'none'; object-src 'self'`;
            res.headers.set('Content-Security-Policy', csp);
            
            // Ensure origin header is set for Server Actions (POST requests)
            if (request.method === 'POST') {
                const origin = request.headers.get('origin');
                const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
                const forwardedProto = request.headers.get('x-forwarded-proto') || (request.nextUrl.protocol.replace(':', ''));
                const referer = request.headers.get('referer');
                
                if (origin) {
                    res.headers.set('origin', origin);
                    request.headers.set('origin', origin);
                } else if (forwardedProto && forwardedHost) {
                    const reconstructedOrigin = `${forwardedProto}://${forwardedHost}`;
                    res.headers.set('origin', reconstructedOrigin);
                    request.headers.set('origin', reconstructedOrigin);
                } else if (referer) {
                    try {
                        const refererUrl = new URL(referer);
                        res.headers.set('origin', refererUrl.origin);
                        request.headers.set('origin', refererUrl.origin);
                    } catch {}
                } else if (request.nextUrl.origin) {
                    res.headers.set('origin', request.nextUrl.origin);
                    request.headers.set('origin', request.nextUrl.origin);
                }
            }
        } catch {}
        return res;
    };
    
    // Allow access to elogin page without authentication
    if (pathname === '/elogin') {
        return withSecurityHeaders(NextResponse.next());
    }
    
    // Check for session cookie directly (Edge runtime compatible)
    // In Edge runtime, we can't use getToken, so we check cookies directly
    // Use e-filing specific cookie names to avoid conflicts with video archiving
    const sessionCookie = request.cookies.get(
        process.env.NODE_ENV === 'production' 
            ? '__Secure-efiling-next-auth.session-token' 
            : 'efiling-next-auth.session-token'
    ) || request.cookies.get(
        process.env.NODE_ENV === 'production' 
            ? '__Secure-next-auth.session-token' 
            : 'next-auth.session-token'
    ) || request.cookies.get('authjs.session-token') || request.cookies.get('__Secure-authjs.session-token');
    
    // For next-auth v5, check for e-filing specific cookie names first
    // Use e-filing specific cookie names to avoid conflicts with video archiving
    const nextAuthCookie = request.cookies.get('efiling-next-auth.session-token') || 
                           request.cookies.get('__Secure-efiling-next-auth.session-token') ||
                           request.cookies.get('next-auth.session-token') || // Fallback for old cookies
                           request.cookies.get('__Secure-next-auth.session-token') ||
                           request.cookies.get('authjs.session-token') ||
                           request.cookies.get('__Secure-authjs.session-token');

    // If no session cookie, redirect to login
    // But allow POST requests and Server Actions to pass through
    // (they might be part of the authentication flow or form submissions)
    if (!sessionCookie && !nextAuthCookie) {
        // Allow POST requests to pass through (might be Server Actions or form submissions)
        if (request.method === 'POST') {
            return withSecurityHeaders(NextResponse.next());
        }
        
        // Check if there's a referer from elogin (user just logged in)
        // Give a small grace period by checking for session cookie directly
        // Use e-filing specific cookie names
        const sessionCookie = request.cookies.get(
            process.env.NODE_ENV === 'production' 
                ? '__Secure-efiling-next-auth.session-token' 
                : 'efiling-next-auth.session-token'
        ) || request.cookies.get(
            process.env.NODE_ENV === 'production' 
                ? '__Secure-next-auth.session-token' 
                : 'next-auth.session-token'
        );
        
        // If there's a session cookie but no token yet, it might be in the process of being set
        // Allow the request through but it will be checked again on the next request
        if (sessionCookie) {
            // Still redirect to login, but this should be rare
            // The session should be available by the time the redirect happens
            return withSecurityHeaders(NextResponse.redirect(new URL('/elogin', request.url)));
        }
        
        return withSecurityHeaders(NextResponse.redirect(new URL('/elogin', request.url)));
    }

    // Basic path-based routing without role checking in middleware
    // Role checking will be done in the page components since we can't decode JWT in Edge runtime
    if (pathname.startsWith('/efilinguser')) {
        return withSecurityHeaders(NextResponse.next());
    }
    
    if (pathname.startsWith('/efiling')) {
        return withSecurityHeaders(NextResponse.next());
    }

    return withSecurityHeaders(NextResponse.next());
}
