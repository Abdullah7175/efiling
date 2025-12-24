# E-Filing Code Modifications Guide

This document provides detailed code modification instructions for separating the E-Filing system from Video Archiving.

---

## 1. API Routes to Modify

### 1.1 `app/api/efiling/files/route.js`

#### Current Code Analysis:
- **Line 37**: Parses `work_request_id` from query parameters
- **Line 520**: Accepts `work_request_id` in POST body
- **Line 727, 738, 757**: Uses `work_request_id` in INSERT statements

#### Required Changes:

**Step 1: Add API client import at top of file**
```javascript
import { verifyWorkRequest } from '@/lib/videoArchivingApiClient';
```

**Step 2: Add work_request_id validation in POST handler (after line 600)**
```javascript
// Validate work_request_id via API if provided
if (work_request_id) {
    try {
        const verifyResult = await verifyWorkRequest(work_request_id);
        if (!verifyResult.exists || !verifyResult.valid) {
            return NextResponse.json(
                { error: `Invalid work request ID: ${work_request_id}. The work request does not exist in the Video Archiving system.` },
                { status: 400 }
            );
        }
    } catch (error) {
        console.error('Error verifying work request:', error);
        return NextResponse.json(
            { error: 'Failed to verify work request. Please try again later.' },
            { status: 503 }
        );
    }
}
```

**Step 3: No changes needed for INSERT statements**
- The `work_request_id` column will remain as integer (no FK constraint)
- Database will accept any integer value
- Validation is done via API before insertion

---

### 1.2 `app/api/efiling/files/[id]/route.js`

#### Current Code Analysis:
- **Line 99**: May join with `work_requests` table
- **Line 109**: May reference work request data
- **Line 247-249**: Updates `work_request_id` in PUT handler

#### Required Changes:

**Step 1: Remove work_requests table join (if exists)**
```javascript
// Before (if exists):
// LEFT JOIN work_requests wr ON f.work_request_id = wr.id

// After: Remove the join
// Work request data will be fetched separately via API if needed
```

**Step 2: Add work_request_id validation in PUT handler (around line 247)**
```javascript
// If work_request_id is being updated, validate it
if (body.work_request_id !== undefined && body.work_request_id !== null) {
    try {
        const verifyResult = await verifyWorkRequest(body.work_request_id);
        if (!verifyResult.exists || !verifyResult.valid) {
            return NextResponse.json(
                { error: `Invalid work request ID: ${body.work_request_id}` },
                { status: 400 }
            );
        }
    } catch (error) {
        console.error('Error verifying work request:', error);
        return NextResponse.json(
            { error: 'Failed to verify work request' },
            { status: 503 }
        );
    }
}
```

**Step 3: Import API client**
```javascript
import { verifyWorkRequest } from '@/lib/videoArchivingApiClient';
```

---

### 1.3 `app/api/efiling/files/[id]/history/route.js`

#### Current Code Analysis:
- **Line 92**: May reference `work_requests` table

#### Required Changes:
- Remove any `work_requests` table references
- If work request data is needed, fetch via API (optional, may not be critical for history)

---

## 2. Frontend Pages to Modify

### 2.1 `app/efilinguser/files/new/page.js`

#### Current Code:
```javascript
// Line 119
const res = await fetch(`/api/requests?${params.toString()}`);

// Line 337
const res = await fetch(`/api/requests?${params.toString()}`);
```

#### Required Changes:

**Step 1: Create API client file**
Create `lib/videoArchivingApiClient.js` (see section 3.1)

**Step 2: Update imports**
```javascript
import { fetchWorkRequests } from '@/lib/videoArchivingApiClient';
```

**Step 3: Replace fetch calls**
```javascript
// Replace line 119
const fetchWorkRequestsFromVideoArchiving = async (searchTerm = '', replaceExisting = false) => {
    if (sessionStatus !== 'authenticated' || !session?.user?.id) {
        return;
    }
    
    setWorkRequestLoading(true);
    try {
        const result = await fetchWorkRequests({ 
            limit: '100',
            scope: 'efiling',
            search: searchTerm
        });
        const list = Array.isArray(result?.data) ? result.data : [];
        mergeWorkRequestOptions(list, { replace: replaceExisting || Boolean(searchTerm) });
    } catch (error) {
        console.error('Error fetching work requests:', error);
        toast({
            title: 'Error',
            description: 'Failed to load work requests. Please try again.',
            variant: 'destructive'
        });
        if (replaceExisting || searchTerm) {
            mergeWorkRequestOptions([], { replace: true });
        }
    } finally {
        setWorkRequestLoading(false);
    }
};

// Replace line 337 with same function call
```

**Step 4: Update SearchableDropdown usage**
```javascript
<SearchableDropdown
    options={workRequestOptions}
    value={formik.values.work_request_id?.toString() || ''}
    onValueChange={(value) => {
        formik.setFieldValue('work_request_id', value === 'none' ? null : parseInt(value));
    }}
    onSearch={fetchWorkRequestsFromVideoArchiving}
    loading={workRequestLoading}
    placeholder="Search work requests..."
    emptyMessage="No work requests found"
/>
```

---

### 2.2 `app/efilinguser/files/[id]/page.js`

#### Current Code:
```javascript
// Line 81
const res = await fetch('/api/requests?limit=1000&scope=efiling');

// Line 240
const res = await fetch(`/api/before-content?workRequestId=${file.work_request_id}`);
```

#### Required Changes:

**Step 1: Add imports**
```javascript
import { fetchWorkRequests, getWorkRequestBeforeContent } from '@/lib/videoArchivingApiClient';
```

**Step 2: Replace fetchWorkRequests function (line 79-89)**
```javascript
const fetchWorkRequests = async () => {
    try {
        const result = await fetchWorkRequests({ limit: '1000', scope: 'efiling' });
        setWorkRequests(Array.isArray(result?.data) ? result.data : []);
    } catch (error) {
        console.error('Error fetching work requests:', error);
        toast({
            title: 'Error',
            description: 'Failed to load work requests.',
            variant: 'destructive'
        });
    }
};
```

**Step 3: Replace fetchBeforeContent function (around line 240)**
```javascript
const fetchBeforeContent = async () => {
    if (!file?.work_request_id) return;
    
    try {
        const result = await getWorkRequestBeforeContent(file.work_request_id);
        setBeforeContent(Array.isArray(result?.data) ? result.data : []);
    } catch (error) {
        console.error('Error fetching before content:', error);
        toast({
            title: 'Error',
            description: 'Failed to load before content.',
            variant: 'destructive'
        });
    }
};
```

---

### 2.3 `app/efilinguser/files/[id]/view-document/page.js`

#### Current Code:
```javascript
// Line 71
const workRes = await fetch(`/api/requests?id=${fileData.work_request_id}`);

// Line 80
const contentRes = await fetch(`/api/before-content?workRequestId=${fileData.work_request_id}`);
```

#### Required Changes:

**Step 1: Add imports**
```javascript
import { getWorkRequestById, getWorkRequestBeforeContent } from '@/lib/videoArchivingApiClient';
```

**Step 2: Replace work request fetch (line 71)**
```javascript
// Replace the fetch call with:
try {
    const workRequest = await getWorkRequestById(fileData.work_request_id);
    // Use workRequest.data for work request details
} catch (error) {
    console.error('Error fetching work request:', error);
    // Handle error (show message or set to null)
}
```

**Step 3: Replace before content fetch (line 80)**
```javascript
// Replace the fetch call with:
try {
    const contentResult = await getWorkRequestBeforeContent(fileData.work_request_id);
    const beforeContent = Array.isArray(contentResult?.data) ? contentResult.data : [];
    // Use beforeContent array
} catch (error) {
    console.error('Error fetching before content:', error);
    // Handle error
}
```

---

### 2.4 `app/efiling/files/[id]/page.js`

#### Current Code:
```javascript
// Line 69
const res = await fetch('/api/requests?limit=1000&scope=efiling');
```

#### Required Changes:
- Same as section 2.2, Step 2

---

### 2.5 `app/efiling/files/new/page.js`

#### Current Code:
```javascript
// Line 48
fetch('/api/requests?limit=1000&scope=efiling')
```

#### Required Changes:
- Same as section 2.2, Step 2

---

## 3. New Files to Create

### 3.1 `lib/videoArchivingApiClient.js` (NEW)

**Full Implementation:**
```javascript
// lib/videoArchivingApiClient.js

const VIDEO_ARCHIVING_API_URL = process.env.NEXT_PUBLIC_VIDEO_ARCHIVING_API_URL || 'http://localhost:3000/api/external';
const VIDEO_ARCHIVING_API_KEY = process.env.NEXT_PUBLIC_VIDEO_ARCHIVING_API_KEY;

/**
 * Make API request to Video Archiving system
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${VIDEO_ARCHIVING_API_URL}${endpoint}`;
    
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': VIDEO_ARCHIVING_API_KEY,
                ...options.headers
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ 
                error: `API request failed: ${response.statusText}` 
            }));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response.json();
    } catch (error) {
        // Log error for debugging
        console.error(`Video Archiving API Error (${endpoint}):`, error);
        throw error;
    }
}

/**
 * Fetch work requests list
 * @param {Object} filters - Filter parameters
 * @returns {Promise<Object>} Response with data array
 */
export async function fetchWorkRequests(filters = {}) {
    const params = new URLSearchParams({
        scope: 'efiling',
        limit: '100',
        ...filters
    });
    
    return apiRequest(`/work-requests?${params}`);
}

/**
 * Get specific work request by ID
 * @param {number|string} id - Work request ID
 * @returns {Promise<Object>} Work request data
 */
export async function getWorkRequestById(id) {
    return apiRequest(`/work-requests/${id}`);
}

/**
 * Get before content for a work request
 * @param {number|string} id - Work request ID
 * @returns {Promise<Object>} Before content data
 */
export async function getWorkRequestBeforeContent(id) {
    return apiRequest(`/work-requests/${id}/before-content`);
}

/**
 * Get videos for a work request (optional)
 * @param {number|string} id - Work request ID
 * @returns {Promise<Object>} Videos data
 */
export async function getWorkRequestVideos(id) {
    return apiRequest(`/work-requests/${id}/videos`);
}

/**
 * Get images for a work request (optional)
 * @param {number|string} id - Work request ID
 * @returns {Promise<Object>} Images data
 */
export async function getWorkRequestImages(id) {
    return apiRequest(`/work-requests/${id}/images`);
}

/**
 * Verify work request exists
 * @param {number|string} id - Work request ID
 * @returns {Promise<Object>} Verification result
 */
export async function verifyWorkRequest(id) {
    return apiRequest('/work-requests/verify', {
        method: 'POST',
        body: JSON.stringify({ work_request_id: parseInt(id) })
    });
}
```

---

### 3.2 `app/api/external/divisions/route.js` (NEW)

**Full Implementation:**
```javascript
// app/api/external/divisions/route.js
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Validate API key from request headers
 */
function validateApiKey(request) {
    const apiKey = request.headers.get('X-API-Key');
    const expectedKey = process.env.EXTERNAL_API_KEY;
    
    if (!apiKey || apiKey !== expectedKey) {
        return NextResponse.json(
            { error: 'Unauthorized - Invalid or missing API key' },
            { status: 401 }
        );
    }
    
    return null;
}

/**
 * GET /api/external/divisions
 * List all divisions or get specific division by ID
 */
export async function GET(request) {
    // Validate API key
    const authError = validateApiKey(request);
    if (authError) return authError;
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const active = searchParams.get('active');
    const department_id = searchParams.get('department_id');
    
    try {
        const client = await connectToDatabase();
        
        if (id) {
            // Get specific division
            const result = await client.query(
                `SELECT 
                    id, name, code, ce_type, department_id, 
                    description, is_active, created_at, updated_at 
                FROM divisions 
                WHERE id = $1`,
                [parseInt(id)]
            );
            
            if (result.rows.length === 0) {
                return NextResponse.json(
                    { error: 'Division not found' },
                    { status: 404 }
                );
            }
            
            return NextResponse.json({ data: result.rows[0] });
        }
        
        // List divisions with filters
        let query = `
            SELECT 
                id, name, code, ce_type, department_id, 
                description, is_active, created_at, updated_at 
            FROM divisions 
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;
        
        if (active === 'true') {
            query += ` AND is_active = $${paramIndex}`;
            params.push(true);
            paramIndex++;
        }
        
        if (department_id) {
            query += ` AND department_id = $${paramIndex}`;
            params.push(parseInt(department_id));
            paramIndex++;
        }
        
        query += ' ORDER BY name';
        
        const result = await client.query(query, params);
        
        return NextResponse.json({ 
            data: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching divisions:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
```

---

### 3.3 `app/api/external/zones/route.js` (NEW)

**Full Implementation:**
```javascript
// app/api/external/zones/route.js
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Validate API key from request headers
 */
function validateApiKey(request) {
    const apiKey = request.headers.get('X-API-Key');
    const expectedKey = process.env.EXTERNAL_API_KEY;
    
    if (!apiKey || apiKey !== expectedKey) {
        return NextResponse.json(
            { error: 'Unauthorized - Invalid or missing API key' },
            { status: 401 }
        );
    }
    
    return null;
}

/**
 * GET /api/external/zones
 * List all zones or get specific zone by ID
 */
export async function GET(request) {
    // Validate API key
    const authError = validateApiKey(request);
    if (authError) return authError;
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const active = searchParams.get('active');
    
    try {
        const client = await connectToDatabase();
        
        if (id) {
            // Get specific zone
            const result = await client.query(
                `SELECT 
                    id, name, ce_type, description, 
                    is_active, created_at, updated_at 
                FROM efiling_zones 
                WHERE id = $1`,
                [parseInt(id)]
            );
            
            if (result.rows.length === 0) {
                return NextResponse.json(
                    { error: 'Zone not found' },
                    { status: 404 }
                );
            }
            
            return NextResponse.json({ data: result.rows[0] });
        }
        
        // List zones with filters
        let query = `
            SELECT 
                id, name, ce_type, description, 
                is_active, created_at, updated_at 
            FROM efiling_zones 
            WHERE 1=1
        `;
        const params = [];
        
        if (active === 'true') {
            query += ' AND is_active = $1';
            params.push(true);
        }
        
        query += ' ORDER BY name';
        
        const result = await client.query(query, params);
        
        return NextResponse.json({ 
            data: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching zones:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
```

---

## 4. Environment Variables

### 4.1 Add to `.env` file:

```env
# Video Archiving API Integration (Internal)
VIDEO_ARCHIVING_API_URL=http://localhost:3000/api/external
VIDEO_ARCHIVING_API_KEY=your_video_archiving_api_key_here

# External API Key (for Video Archiving to access divisions/zones)
EXTERNAL_API_KEY=your_efiling_external_api_key_here

# File Storage
FILE_STORAGE_PATH=/mnt/shared-storage/efiling
UPLOAD_MAX_SIZE=500MB
```

### 4.2 Add to `.env.local` for development:

```env
VIDEO_ARCHIVING_API_URL=http://localhost:3000/api/external
VIDEO_ARCHIVING_API_KEY=dev_api_key_here
EXTERNAL_API_KEY=dev_external_api_key_here
```

---

## 5. Testing Checklist

### 5.1 API Endpoints
- [ ] Test `/api/external/divisions` with API key
- [ ] Test `/api/external/divisions` without API key (should fail)
- [ ] Test `/api/external/divisions/{id}` with valid ID
- [ ] Test `/api/external/divisions/{id}` with invalid ID
- [ ] Test `/api/external/zones` with API key
- [ ] Test `/api/external/zones/{id}` with valid ID
- [ ] Test rate limiting (make 101 requests, should be limited)

### 5.2 File Creation
- [ ] Create file without work_request_id (should work)
- [ ] Create file with valid work_request_id (should work)
- [ ] Create file with invalid work_request_id (should fail with error)
- [ ] Create file when Video Archiving API is down (should handle gracefully)

### 5.3 File Viewing
- [ ] View file with work_request_id (should load work request data)
- [ ] View file with work_request_id (should load before content)
- [ ] View file when Video Archiving API is down (should handle gracefully)

### 5.4 Error Handling
- [ ] Test API timeout handling
- [ ] Test API error response handling
- [ ] Test network error handling
- [ ] Test invalid API key handling

---

## 6. Migration Order

1. **Database Migration**
   - [ ] Backup current database
   - [ ] Create `efiling` database copy
   - [ ] Run `efiling_database_cleanup.sql` script
   - [ ] Verify data integrity

2. **API Development**
   - [ ] Create `/api/external/divisions` route
   - [ ] Create `/api/external/zones` route
   - [ ] Test API endpoints
   - [ ] Test API authentication

3. **Code Updates**
   - [ ] Create `lib/videoArchivingApiClient.js`
   - [ ] Update API routes
   - [ ] Update frontend pages
   - [ ] Test all changes

4. **Deployment**
   - [ ] Update environment variables
   - [ ] Deploy to E-Filing server (port 5000)
   - [ ] Configure firewall (block internet access)
   - [ ] Test integration with Video Archiving

---

## Notes

- All API calls should include proper error handling
- All API calls should include timeout handling
- Consider implementing retry logic for failed API calls
- Consider implementing caching for frequently accessed data (optional)
- Monitor API response times and adjust as needed
- Log all API calls for debugging and audit purposes

