/**
 * E-Filing API Client Library
 * 
 * This library provides functions for Video Archiving system to call
 * E-Filing system APIs to fetch divisions and zones data.
 * 
 * Environment Variables Required:
 * - EFILING_API_URL: Base URL for E-Filing API (default: http://localhost:5000/api/external)
 * - EFILING_API_KEY: API key for authentication
 */

const DEFAULT_API_URL = process.env.EFILING_API_URL || 'http://localhost:5000/api/external';
const API_KEY = process.env.EFILING_API_KEY || '';

/**
 * Makes an API request to E-Filing system
 * @param {string} endpoint - API endpoint (e.g., '/divisions')
 * @param {Object} options - Request options (method, body, etc.)
 * @returns {Promise<Object>} - Response data
 */
async function apiRequest(endpoint, options = {}) {
    const { method = 'GET', body = null, queryParams = {} } = options;
    
    const url = new URL(`${DEFAULT_API_URL}${endpoint}`);
    
    // Add query parameters
    Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
            url.searchParams.append(key, value.toString());
        }
    });
    
    const headers = {
        'Content-Type': 'application/json',
    };
    
    // Add API key if available
    if (API_KEY) {
        headers['X-API-Key'] = API_KEY;
    }
    
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
        console.error(`E-Filing API Error (${endpoint}):`, error);
        return {
            success: false,
            error: error.message || 'Unknown error',
            data: null
        };
    }
}

/**
 * Get all divisions from E-Filing system
 * @param {Object} filters - Filter options
 * @param {boolean} filters.active - Filter by active status
 * @param {number} filters.department_id - Filter by department ID
 * @returns {Promise<Object>} - Response with divisions data
 */
export async function getDivisions(filters = {}) {
    const queryParams = {};
    
    if (filters.active !== undefined) {
        queryParams.active = filters.active ? 'true' : 'false';
    }
    
    if (filters.department_id) {
        queryParams.department_id = filters.department_id;
    }
    
    return await apiRequest('/divisions', {
        method: 'GET',
        queryParams
    });
}

/**
 * Get specific division by ID
 * @param {number} id - Division ID
 * @returns {Promise<Object>} - Response with division data
 */
export async function getDivisionById(id) {
    if (!id) {
        return {
            success: false,
            error: 'Division ID is required',
            data: null
        };
    }
    
    return await apiRequest('/divisions', {
        method: 'GET',
        queryParams: { id }
    });
}

/**
 * Get all zones from E-Filing system
 * @param {Object} filters - Filter options
 * @param {boolean} filters.active - Filter by active status
 * @returns {Promise<Object>} - Response with zones data
 */
export async function getZones(filters = {}) {
    const queryParams = {};
    
    if (filters.active !== undefined) {
        queryParams.active = filters.active ? 'true' : 'false';
    }
    
    return await apiRequest('/zones', {
        method: 'GET',
        queryParams
    });
}

/**
 * Get specific zone by ID
 * @param {number} id - Zone ID
 * @returns {Promise<Object>} - Response with zone data
 */
export async function getZoneById(id) {
    if (!id) {
        return {
            success: false,
            error: 'Zone ID is required',
            data: null
        };
    }
    
    return await apiRequest('/zones', {
        method: 'GET',
        queryParams: { id }
    });
}

/**
 * Test connection to E-Filing API
 * @returns {Promise<boolean>} - True if connection is successful
 */
export async function testConnection() {
    try {
        const result = await getDivisions({ active: true });
        return result.success === true;
    } catch (error) {
        console.error('E-Filing API connection test failed:', error);
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
    getDivisions,
    getDivisionById,
    getZones,
    getZoneById,
    testConnection,
    getApiConfig
};

