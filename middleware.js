import { NextResponse } from "next/server";
import { efilingAuthMiddleware } from "./middleware/efilingAuth";

const PUBLIC_PATHS = ["/", "/elogin", "/unauthorized", "/_next", "/api", "/favicon.ico", "/public"];

// Allowed roles for smagent
const smagentRolesA = [1, 2, 3, 6]; // CAMERA MAN, ASSISTANT, PHOTOGRAPHER, CONTENT CREATOR
const smagentRolesB = [4, 5]; // VIDEO EDITOR, MANAGER
const editorOnlyRoles = [4]; // VIDEO EDITOR only
// Allowed roles for dashboard
const dashboardRoles = [1, 2, 3];

// List of allowed dashboard paths (prefixes)
const dashboardAllowed = [
  "/dashboard",
  "/dashboard/districts",
  "/dashboard/districts/add",
  "/dashboard/districts/edit",
  "/dashboard/towns",
  "/dashboard/towns/add",
  "/dashboard/towns/edit",
  "/dashboard/subtowns",
  "/dashboard/complaints/types",
  "/dashboard/complaints/types/add",
  "/dashboard/complaints/types/edit",
  "/dashboard/complaints/sub-types",
  "/dashboard/complaints/sub-types/add",
  "/dashboard/complaints/sub-types/edit",
  "/dashboard/requests",
  "/dashboard/requests/new",
  "/dashboard/requests/performa",
  "/dashboard/videos",
  "/dashboard/videos/add",
  "/dashboard/uploads/videos",
  "/dashboard/videos/edit",
  "/dashboard/final-videos",
  "/dashboard/final-videos/add",
  "/dashboard/images",
  "/dashboard/images/add",
  "/dashboard/images/edit",
  "/dashboard/users",
  "/dashboard/users/add",
  "/dashboard/users/edit",
  "/dashboard/agents",
  "/dashboard/agents/add",
  "/dashboard/agents/edit",
  "/dashboard/socialmediaagent",
  "/dashboard/socialmediaagent/add",
  "/dashboard/socialmediaagent/edit",
  "/dashboard/user-actions",
  "/dashboard/user-actions/add",
  "/dashboard/user-actions/edit",
  "/dashboard/user-actions/delete",
  "/dashboard/ceo-users",
  "/dashboard/ceo-users/add",
  "/dashboard/ceo-users/edit",
  "/dashboard/ceo-users/delete",
  "/dashboard/before-images",
  "/dashboard/before-images/add",
  "/dashboard/reports"
];

const agentAllowed = [
  "/agent",
  "/agent/requests",
  "/agent/requests/new",
  "/agent/videos",
  "/agent/images",
  "/agent/before-images",
  "/agent/before-images/add"
];

const smagentAllowedA = [
  "/smagent",
  "/smagent/assigned-requests",
  "/smagent/videos/add",
  "/smagent/images/add",
  "/smagent/before-images",
  "/smagent/before-images/add"
];
const smagentAllowedB = [
  "/smagent",
  "/smagent/assigned-requests",
  "/smagent/final-videos",
  "/smagent/final-videos/add",
  "/smagent/final-videos/edit",
  "/smagent/final-videos/view",
  "/smagent/my-uploads",
  "/smagent/images/download",
  "/smagent/videos/download",
  "/smagent/images/add",
  "/smagent/videos/add",
  "/smagent/before-images",
  "/smagent/before-images/add"
];

// CEO allowed routes (role 5)
const ceoAllowed = [
  "/ceo",
  "/ceo/requests",
  "/ceo/approved",
  "/ceo/rejected",
  "/ceo/notifications"
];

// COO allowed routes (role 6)
const cooAllowed = [
  "/coo",
  "/coo/requests",
  "/coo/analytics",
  "/coo/profile"
];

function getDashboardForUser(session) {
  if (!session || !session.user) return "/login";
  // Route CEO to CEO portal
  if (session.user?.role === 5 && session.user?.userType === "user") return "/ceo";
  // Route COO to COO portal
  if (session.user?.role === 6 && session.user?.userType === "user") return "/coo";
  // Route admins/managers directly to e-filing admin
  if (session.user?.role === 1 || session.user?.role === 2) return "/efiling";
  if (session.user?.userType === "agent") return "/agent";
  if (session.user?.userType === "socialmedia") return "/smagent";
  if (session.user?.userType === "user") return "/dashboard";
  return "/login";
}

function isAllowed(pathname, allowedList) {
  return allowedList.some((route) => {
    if (route === "/smagent") {
      // Only allow exact match for /smagent
      return pathname === "/smagent";
    }
    // For other routes, allow exact match or subpaths
    return pathname === route || pathname.startsWith(route + "/");
  });
}

// Helper function to set origin header for Server Actions
function setOriginHeader(req, response) {
    const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const forwardedProto = req.headers.get('x-forwarded-proto') || (req.nextUrl.protocol.replace(':', ''));
    const origin = req.headers.get('origin');
    const referer = req.headers.get('referer');
    
    // Preserve forwarded headers
    if (req.headers.get('x-forwarded-host')) {
        response.headers.set('x-forwarded-host', req.headers.get('x-forwarded-host'));
    }
    if (req.headers.get('x-forwarded-proto')) {
        response.headers.set('x-forwarded-proto', req.headers.get('x-forwarded-proto'));
    }
    
    // Set origin header - critical for Server Actions
    if (origin) {
        response.headers.set('origin', origin);
        req.headers.set('origin', origin);
    } else if (forwardedProto && forwardedHost) {
        const reconstructedOrigin = `${forwardedProto}://${forwardedHost}`;
        response.headers.set('origin', reconstructedOrigin);
        req.headers.set('origin', reconstructedOrigin);
    } else if (referer) {
        try {
            const refererUrl = new URL(referer);
            response.headers.set('origin', refererUrl.origin);
            req.headers.set('origin', refererUrl.origin);
        } catch {}
    } else if (req.nextUrl.origin) {
        response.headers.set('origin', req.nextUrl.origin);
        req.headers.set('origin', req.nextUrl.origin);
    }
}

export async function middleware(req) {
    const { pathname } = req.nextUrl;
    
    // Helper to ensure origin header is always set for POST requests
    const ensureOriginHeader = () => {
        if (req.method === 'POST') {
            const origin = req.headers.get('origin');
            if (!origin) {
                const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
                const forwardedProto = req.headers.get('x-forwarded-proto') || (req.nextUrl.protocol.replace(':', ''));
                const referer = req.headers.get('referer');
                
                let reconstructedOrigin = null;
                
                if (forwardedProto && forwardedHost) {
                    reconstructedOrigin = `${forwardedProto}://${forwardedHost}`;
                } else if (referer) {
                    try {
                        const refererUrl = new URL(referer);
                        reconstructedOrigin = refererUrl.origin;
                    } catch {}
                } else if (req.nextUrl.origin) {
                    reconstructedOrigin = req.nextUrl.origin;
                }
                
                if (reconstructedOrigin) {
                    req.headers.set('origin', reconstructedOrigin);
                }
            }
        }
    };
    
    // Always set origin header early for POST requests (Server Actions need this)
    ensureOriginHeader();
    
    // Skip middleware for static files, API routes, and Server Action paths
    // Server Actions can be POST requests to page routes or use special Next.js paths
    if (pathname.startsWith('/_next') || 
        pathname.startsWith('/api') || 
        pathname.includes('.') ||
        pathname.startsWith('/_action')) {
        const response = NextResponse.next();
        setOriginHeader(req, response);
        return response;
    }
    
    // For POST requests (might be Server Actions), ensure origin header is set
    // But still run authentication checks for protected routes
    if (req.method === 'POST') {
        // Ensure origin is set on request before creating response
        ensureOriginHeader();
        
        const response = NextResponse.next();
        setOriginHeader(req, response);
        
        // Continue with authentication checks for efiling routes
        if (pathname.startsWith('/efiling') || pathname.startsWith('/efilinguser') || pathname === '/elogin') {
            const authResponse = await efilingAuthMiddleware(req);
            // Ensure origin header is set on both request and response
            ensureOriginHeader();
            setOriginHeader(req, authResponse);
            return authResponse;
        }
        
        // For other POST requests, return with origin header set
        return response;
    }

    // Handle e-filing authentication for efiling and efilinguser routes
    if (pathname.startsWith('/efiling') || pathname.startsWith('/efilinguser') || pathname === '/elogin') {
        const response = await efilingAuthMiddleware(req);
        // Ensure origin header is set for Server Actions
        if (req.method === 'POST') {
            setOriginHeader(req, response);
        }
        return response;
    }

    try {
        // In Edge runtime, we can't use auth() which requires Node.js crypto
        // Instead, check for session cookies directly
        // Use e-filing specific cookie names to avoid conflicts with video archiving
        const sessionCookie = req.cookies.get('efiling-next-auth.session-token') || 
                             req.cookies.get('__Secure-efiling-next-auth.session-token') ||
                             req.cookies.get('next-auth.session-token') || // Fallback for old cookies
                             req.cookies.get('__Secure-next-auth.session-token') ||
                             req.cookies.get('authjs.session-token') ||
                             req.cookies.get('__Secure-authjs.session-token');
        
        if (!sessionCookie) {
            // Allow access to root (login page) and public paths
            if (pathname === '/' || pathname.startsWith('/public')) {
                return NextResponse.next();
            }
            // Redirect to root (login page) if no token and trying to access protected routes
            if (!pathname.startsWith('/_next') && !pathname.startsWith('/api')) {
                return NextResponse.redirect(new URL('/', req.url));
            }
            return NextResponse.next();
        }

        // In Edge runtime, we can't decode JWT to get user info
        // So we'll do basic routing and let page components handle role-based access
        // If user is authenticated and on root, let them through (page will redirect)
        if (pathname === '/') {
            return NextResponse.next();
        }

        // Role-based access control is handled in page components
        // Middleware in Edge runtime can't decode JWT tokens
        // So we just check if session exists and let pages handle authorization 
        
        // else if (userType === 'efiling') {
        //     // E-Filing user access
        //     const allowedPaths = ['/efiling', '/efiling/files', '/efiling/assignments', '/efiling/departments', '/efiling/tools', '/efiling/reports', '/efiling/settings'];
        //     if (!isAllowed(pathname, allowedPaths)) {
        //         return NextResponse.redirect(new URL('/unauthorized', req.url));
        //     }
        // }

        return NextResponse.next();
    } catch (error) {
        console.error('Middleware error:', error);
        return NextResponse.redirect(new URL('/', req.url));
    }
}

export const config = {
  matcher: ["/smagent/:path*", "/agent/:path*", "/dashboard/:path*", "/efiling/:path*", "/efilinguser/:path*", "/elogin", "/ceo/:path*"],
}; 