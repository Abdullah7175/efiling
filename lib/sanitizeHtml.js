// lib/sanitizeHtml.js
// HTML sanitization utility using DOMPurify
// SECURITY: Prevents XSS attacks by sanitizing HTML content

// Lazy load DOMPurify for client-side (browser-only library)
let DOMPurify = null;

function getDOMPurify() {
    if (typeof window === 'undefined') {
        return null; // Server-side, DOMPurify not available
    }
    
    if (!DOMPurify) {
        try {
            // Use require for compatibility with Next.js bundling
            DOMPurify = require('dompurify');
        } catch (error) {
            console.error('DOMPurify not available, using fallback sanitization:', error);
            return null;
        }
    }
    
    return DOMPurify;
}

// For client-side and server-side components
export function sanitizeHtml(html) {
    if (!html || typeof html !== "string") return "";
    
    // If running on client side, use DOMPurify
    const purify = getDOMPurify();
    if (purify) {
        try {
            return purify.sanitize(html, {
                ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'div', 'span'],
                ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style', 'width', 'height'],
                ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
            });
        } catch (error) {
            console.error('Error sanitizing HTML with DOMPurify, using fallback:', error);
            return fallbackSanitize(html);
        }
    }
    
    // Server-side or DOMPurify unavailable - use fallback sanitization
    return fallbackSanitize(html);
}

// Fallback sanitization for server-side or when DOMPurify is not available
function fallbackSanitize(html) {
    if (!html || typeof html !== "string") return "";
    let out = html;
    
    // Remove script, style, iframe tags
    out = out.replace(/<\s*(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
    
    // Remove event handlers
    out = out
        .replace(/on[a-zA-Z]+\s*=\s*"[^"]*"/g, "")
        .replace(/on[a-zA-Z]+\s*=\s*'[^']*'/g, "")
        .replace(/on[a-zA-Z]+\s*=\s*[^\s>]+/g, "");
    
    // Remove javascript: and vbscript: protocols
    out = out
        .replace(/javascript\s*:/gi, "")
        .replace(/vbscript\s*:/gi, "")
        .replace(/data\s*:\s*text\/html/gi, "");
    
    return out;
}

