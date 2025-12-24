/**
 * Video Archiving API Client Library
 * 
 * This library provides functions for E-Filing system to call
 * Video Archiving system APIs to fetch work requests data.
 * 
 * Uses proxy API routes to avoid CORS and keep API keys server-side.
 */

/**
 * Makes an API request through the proxy route
 * @param {string} endpoint - API endpoint (e.g., '/work-requests')
 * @param {Object} options - Request options (method, body, etc.)
 * @returns {Promise<Object>} - Response data
 */
async function apiRequest(endpoint, options = {}) {
    const { method = 'GET', body = null, queryParams = {} } = options;
    
    // Use proxy route instead of direct API call
    const proxyUrl = `/api/efiling/video-archiving${endpoint}`;
    const url = new URL(proxyUrl, window.location.origin);
    
    // Add query parameters
    Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            url.searchParams.append(key, value.toString());
        }
    });
    
    const headers = {
        'Content-Type': 'application/json',
    };
    
    const requestOptions = {
        method,
        headers,
    };
    
    if (body && method !== 'GET') {
        requestOptions.body = JSON.stringify(body);
    }
    
    try {
        const response = await fetch(url.toString(), requestOptions);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        return {
            success: true,
            data: data.data || data,
            ...data
        };
    } catch (error) {
        console.error(`Video Archiving API Error (${endpoint}):`, error);
        return {
            success: false,
            error: error.message || 'Unknown error',
            data: null
        };
    }
}

/**
 * Search work requests from Video Archiving system
 * @param {Object} filters - Filter options
 * @param {string} filters.search - Search term
 * @param {string|number} filters.status - Filter by status ID or name
 * @param {number} filters.limit - Number of results (default: 100, max: 500)
 * @param {number} filters.offset - Pagination offset
 * @returns {Promise<Object>} - Response with work requests data
 */
export async function searchWorkRequests(filters = {}) {
    const queryParams = {
        scope: 'efiling', // Required parameter
    };
    
    if (filters.search) {
        queryParams.search = filters.search;
    }
    
    if (filters.status) {
        queryParams.status = filters.status.toString();
    }
    
    if (filters.limit) {
        queryParams.limit = Math.min(parseInt(filters.limit), 500).toString();
    } else {
        queryParams.limit = '100';
    }
    
    if (filters.offset) {
        queryParams.offset = filters.offset.toString();
    }
    
    return await apiRequest('/work-requests', {
        method: 'GET',
        queryParams
    });
}

/**
 * Get specific work request by ID
 * @param {number} id - Work request ID
 * @returns {Promise<Object>} - Response with work request data
 */
export async function getWorkRequestById(id) {
    if (!id) {
        return {
            success: false,
            error: 'Work request ID is required',
            data: null
        };
    }
    
    return await apiRequest(`/work-requests/${id}`, {
        method: 'GET'
    });
}

/**
 * Verify work request exists
 * @param {number} workRequestId - Work request ID to verify
 * @returns {Promise<Object>} - Response with verification result
 */
export async function verifyWorkRequest(workRequestId) {
    if (!workRequestId) {
        return {
            success: false,
            exists: false,
            valid: false,
            error: 'Work request ID is required'
        };
    }
    
    // Use proxy route for verification
    try {
        const response = await fetch('/api/efiling/video-archiving/work-requests', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ work_request_id: workRequestId })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            return {
                success: false,
                exists: false,
                valid: false,
                error: errorData.error || 'Verification failed'
            };
        }
        
        const data = await response.json();
        return {
            success: true,
            exists: data.exists || false,
            valid: data.valid || false,
            data: data.data || null,
            error: data.error || null
        };
    } catch (error) {
        console.error('Error verifying work request:', error);
        return {
            success: false,
            exists: false,
            valid: false,
            error: error.message || 'Unknown error'
        };
    }
}

/**
 * Test connection to Video Archiving API
 * @returns {Promise<boolean>} - True if connection is successful
 */
export async function testConnection() {
    try {
        const result = await searchWorkRequests({ limit: 1 });
        return result.success === true;
    } catch (error) {
        console.error('Video Archiving API connection test failed:', error);
        return false;
    }
}

/**
 * Get API configuration info
 * @returns {Object} - API configuration
 */
export function getApiConfig() {
    return {
        apiUrl: DEFAULT_API_URL,
        hasApiKey: !!API_KEY,
        apiKeySet: API_KEY ? '***' : 'Not set'
    };
}

// Export default object with all functions
export default {
    searchWorkRequests,
    getWorkRequestById,
    verifyWorkRequest,
    testConnection,
    getApiConfig
};

