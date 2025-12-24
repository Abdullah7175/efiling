# E-Filing System Separation Plan

## Overview

This document outlines the plan to separate the E-Filing system from the Video Archiving system into an independent project with its own database, using a database copy approach.

**Target Architecture:**
- **E-Filing System**: Port 5000 (Intranet-only, organization network)
- **Video Archiving System**: Port 3000 (Internet-facing, standalone)
- **Communication**: RESTful APIs on localhost (not exposed to internet)
- **Infrastructure**: VMware with separate VMs for apps, databases, and file storage

---

## Infrastructure Setup

### VMware Architecture

**Server 1: E-Filing Application Server**
- Runs E-Filing Next.js app (Port 5000)
- Intranet only (organization network, not exposed to internet)
- Connects to E-Filing Database Server
- Connects to File Storage Server
- Exposes internal APIs for Video Archiving: `/api/external/divisions` and `/api/external/zones`

**Server 2: Video Archiving Application Server**
- Runs Video Archiving Next.js app (Port 3000)
- Internet-facing
- Connects to Video Archiving Database Server
- Connects to File Storage Server
- Exposes internal APIs for E-Filing: `/api/external/work-requests/**`

**Server 3: E-Filing Database Server**
- PostgreSQL database: `efiling`
- Contains all efiling tables + shared tables (divisions, efiling_zones)
- Accessible only from E-Filing App Server (localhost/internal network)

**Server 4: Video Archiving Database Server**
- PostgreSQL database: `video_archiving`
- Contains video archiving tables + shared tables
- Accessible only from Video Archiving App Server (localhost/internal network)

**Server 5: File Storage Server**
- Shared file storage (uploads, documents, videos, images)
- Accessible from both app servers via network mount or API
- Path configured via environment variables
- Separate directories: `/efiling/` and `/video-archiving/`

### Network Configuration

- **Internal APIs**: All cross-system APIs use `localhost` or internal IPs (e.g., `http://localhost:3000`, `http://localhost:5000`)
- **No External Exposure**: E-Filing APIs never exposed to internet
- **API Authentication**: API keys stored in environment variables
- **Rate Limiting**: Per API key (100 requests/minute)
- **Request Logging**: All API requests logged for audit
- **File Storage**: Network mount (e.g., `/mnt/shared-storage/`) or shared storage API

---

## Phase 1: Database Strategy

### 1.1 Database Copy Approach

**Steps:**
1. **Backup current database** to a safe location
2. **Create `efiling` database copy** from current database using `pg_dump`/`pg_restore`
3. **Clean up `efiling` database**:
   - Delete all video archiving tables
   - Remove FK constraint from `efiling_files.work_request_id`
   - Keep `divisions` and `efiling_zones` (these are managed by E-Filing)

### 1.2 Tables in E-Filing Database

#### E-Filing Core Tables (Keep):
- All `efiling_*` tables:
  - `efiling_files` (with `work_request_id` as external reference, no FK)
  - `efiling_users`
  - `efiling_departments`
  - `efiling_roles`
  - `efiling_role_groups`
  - `efiling_file_categories`
  - `efiling_file_types`
  - `efiling_file_status`
  - `efiling_file_attachments`
  - `efiling_file_movements`
  - `efiling_file_workflow_states`
  - `efiling_document_pages`
  - `efiling_document_comments`
  - `efiling_document_signatures`
  - `efiling_documents`
  - `efiling_comments`
  - `efiling_notifications`
  - `efiling_signatures`
  - `efiling_sla_matrix`
  - `efiling_sla_policies`
  - `efiling_sla_pause_history`
  - `efiling_templates`
  - `efiling_template_departments`
  - `efiling_template_roles`
  - `efiling_permissions`
  - `efiling_role_permissions`
  - `efiling_permission_audit_log`
  - `efiling_user_actions`
  - `efiling_user_signatures`
  - `efiling_user_teams`
  - `efiling_user_tools`
  - `efiling_daak`
  - `efiling_daak_categories`
  - `efiling_daak_recipients`
  - `efiling_daak_acknowledgments`
  - `efiling_daak_attachments`
  - `efiling_meetings`
  - `efiling_meeting_attendees`
  - `efiling_meeting_external_attendees`
  - `efiling_meeting_attachments`
  - `efiling_meeting_reminders`
  - `efiling_meeting_settings`
  - `efiling_otp_codes`
  - `efiling_tools`
  - `efiling_department_locations`
  - `efiling_zone_locations`
  - `efiling_role_locations`
  - `efiling_role_group_locations`

#### Shared Tables (Keep in E-Filing):
- `divisions` ⚠️ - **Managed by E-Filing**, has FK to `efiling_departments`
- `efiling_zones` ⚠️ - **Managed by E-Filing**
- `district` - Districts (shared geography)
- `town` - Towns (shared geography)
- `subtown` - Subtowns (shared geography)
- `complaint_types` - Complaint types (shared, but has FK to divisions)
- `complaint_subtypes` - Complaint subtypes (shared)
- `status` - Status values (shared)
- `users` - User accounts (shared, but filtered by system usage)
- `role` - Roles (shared)
- `ce_users` - CE users (E-Filing specific)
- `ce_user_districts`, `ce_user_towns`, `ce_user_zones`, `ce_user_divisions`, `ce_user_departments`

#### Security & Logging Tables (Keep):
- `security_events`
- `security_audit_log`
- `security_config`
- `access_control`
- `rate_limiting`
- `suspicious_activity`
- `public_access_log`
- `secure_files`

#### Video Archiving Tables (Delete):
- `work_requests`
- `work_request_approvals`
- `work_request_locations`
- `work_request_soft_approvals`
- `work_request_subtowns`
- `videos`
- `images`
- `before_content`
- `final_videos`
- `request_assign_smagent`
- `request_assign_agent`
- `work`
- `main`

### 1.3 Special Handling: Divisions and Zones

**Divisions Table:**
- **Status**: Managed by E-Filing, used by Video Archiving
- **FK Constraint**: `divisions.department_id` → `efiling_departments.id` (keep this)
- **Action**: 
  - Keep `divisions` table in E-Filing database
  - Expose read-only API: `GET /api/external/divisions`
  - Video Archiving will access divisions via API

**E-Filing Zones Table:**
- **Status**: Managed by E-Filing, used by Video Archiving
- **Action**:
  - Keep `efiling_zones` table in E-Filing database
  - Expose read-only API: `GET /api/external/zones`
  - Video Archiving will access zones via API

### 1.4 Special Handling: Work Request ID

**Current State:**
- `efiling_files.work_request_id` has FK constraint to `work_requests.id`

**After Separation:**
- Remove FK constraint: `efiling_files_work_request_id_fkey`
- Keep `work_request_id` column as integer (external reference)
- Validate `work_request_id` via API call to Video Archiving
- Add comment: `'External reference to work_request in video_archiving database. Validated via API call.'`

---

## Phase 2: Database Separation SQL Script

### 2.1 Script Overview

The SQL script will:
1. Create database backup
2. Create `efiling` database copy from current database
3. Delete video archiving tables from `efiling` database
4. Remove FK constraint from `efiling_files.work_request_id`
5. Verify data integrity

### 2.2 Key SQL Operations

**For E-Filing Database:**
```sql
-- Connect to efiling database
\c efiling

-- Drop all Video Archiving specific tables
DROP TABLE IF EXISTS public.work_requests CASCADE;
DROP TABLE IF EXISTS public.work_request_approvals CASCADE;
DROP TABLE IF EXISTS public.work_request_locations CASCADE;
DROP TABLE IF EXISTS public.work_request_soft_approvals CASCADE;
DROP TABLE IF EXISTS public.work_request_subtowns CASCADE;
DROP TABLE IF EXISTS public.videos CASCADE;
DROP TABLE IF EXISTS public.images CASCADE;
DROP TABLE IF EXISTS public.before_content CASCADE;
DROP TABLE IF EXISTS public.final_videos CASCADE;
DROP TABLE IF EXISTS public.request_assign_smagent CASCADE;
DROP TABLE IF EXISTS public.request_assign_agent CASCADE;
DROP TABLE IF EXISTS public.work CASCADE;
DROP TABLE IF EXISTS public.main CASCADE;

-- Remove FK constraint from efiling_files.work_request_id
ALTER TABLE public.efiling_files 
    DROP CONSTRAINT IF EXISTS efiling_files_work_request_id_fkey;

-- Add comment to document the change
COMMENT ON COLUMN public.efiling_files.work_request_id IS 
    'External reference to work_request in video_archiving database. Validated via API call to Video Archiving system.';

-- Keep divisions and efiling_zones (these are managed by E-Filing)
-- These tables remain in the E-Filing database and will be exposed via API
```

---

## Phase 3: Code Modifications

### 3.1 API Routes to Modify

#### `app/api/efiling/files/route.js`
**Current Behavior:**
- Line 37: Queries `work_request_id` parameter
- Line 520, 727, 738, 757: May validate `work_request_id` against `work_requests` table

**Required Changes:**
- Remove direct `work_requests` table queries
- Replace with API call to Video Archiving: `POST /api/external/work-requests/verify`
- Keep `work_request_id` as external reference (no database validation)

**Implementation:**
```javascript
// Before: Direct database query
const workRequestCheck = await client.query(
    'SELECT id FROM work_requests WHERE id = $1',
    [work_request_id]
);

// After: API call to Video Archiving
const verifyResponse = await fetch(
    `${process.env.VIDEO_ARCHIVING_API_URL}/work-requests/verify`,
    {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.VIDEO_ARCHIVING_API_KEY
        },
        body: JSON.stringify({ work_request_id })
    }
);
const verifyResult = await verifyResponse.json();
if (!verifyResult.exists || !verifyResult.valid) {
    return NextResponse.json(
        { error: 'Invalid work request ID' },
        { status: 400 }
    );
}
```

#### `app/api/efiling/files/[id]/route.js`
**Current Behavior:**
- Line 99, 109: May join with `work_requests` table to get work request details

**Required Changes:**
- Remove `work_requests` table join
- Fetch work request details via API: `GET /api/external/work-requests/{id}`
- Cache work request data if needed (optional)

**Implementation:**
```javascript
// Before: Direct database join
LEFT JOIN work_requests wr ON f.work_request_id = wr.id

// After: Fetch via API (in frontend or separate API call)
const workRequest = file.work_request_id 
    ? await fetchWorkRequestFromVideoArchiving(file.work_request_id)
    : null;
```

#### `app/api/efiling/files/[id]/history/route.js`
**Current Behavior:**
- Line 92: May reference `work_requests` table

**Required Changes:**
- Remove `work_requests` table reference
- Fetch work request data via API if needed

### 3.2 Frontend Pages to Modify

#### `app/efilinguser/files/new/page.js`
**Current Behavior:**
- Line 119: Fetches work requests from `/api/requests?limit=100&scope=efiling`
- Line 337: Similar fetch for work requests

**Required Changes:**
- Replace `/api/requests` with external API: `http://localhost:3000/api/external/work-requests`
- Create API client function: `fetchWorkRequestsFromVideoArchiving()`
- Update SearchableDropdown to use new API endpoint
- Handle API errors gracefully

**Implementation:**
```javascript
// Create lib/videoArchivingApiClient.js
const VIDEO_ARCHIVING_API_URL = process.env.NEXT_PUBLIC_VIDEO_ARCHIVING_API_URL || 'http://localhost:3000/api/external';
const VIDEO_ARCHIVING_API_KEY = process.env.NEXT_PUBLIC_VIDEO_ARCHIVING_API_KEY;

export async function fetchWorkRequests(filters = {}) {
    const params = new URLSearchParams({
        limit: '100',
        scope: 'efiling',
        ...filters
    });
    
    const response = await fetch(`${VIDEO_ARCHIVING_API_URL}/work-requests?${params}`, {
        headers: {
            'X-API-Key': VIDEO_ARCHIVING_API_KEY
        }
    });
    
    if (!response.ok) {
        throw new Error('Failed to fetch work requests');
    }
    
    return response.json();
}

// In page.js
import { fetchWorkRequests } from '@/lib/videoArchivingApiClient';

const fetchWorkRequestsFromVideoArchiving = async (searchTerm = '') => {
    setWorkRequestLoading(true);
    try {
        const result = await fetchWorkRequests({ 
            search: searchTerm,
            limit: '100'
        });
        const list = Array.isArray(result?.data) ? result.data : [];
        mergeWorkRequestOptions(list, { replace: Boolean(searchTerm) });
    } catch (error) {
        console.error('Error fetching work requests:', error);
        toast({
            title: 'Error',
            description: 'Failed to load work requests. Please try again.',
            variant: 'destructive'
        });
    } finally {
        setWorkRequestLoading(false);
    }
};
```

#### `app/efilinguser/files/[id]/page.js`
**Current Behavior:**
- Line 81: Fetches work requests from `/api/requests?limit=1000&scope=efiling`
- Line 240: Fetches before content from `/api/before-content?workRequestId=${file.work_request_id}`

**Required Changes:**
- Replace `/api/requests` with external API
- Replace `/api/before-content` with external API: `http://localhost:3000/api/external/work-requests/{id}/before-content`
- Create API client functions
- Update error handling

**Implementation:**
```javascript
// Add to lib/videoArchivingApiClient.js
export async function getWorkRequestById(id) {
    const response = await fetch(`${VIDEO_ARCHIVING_API_URL}/work-requests/${id}`, {
        headers: {
            'X-API-Key': VIDEO_ARCHIVING_API_KEY
        }
    });
    
    if (!response.ok) {
        throw new Error('Failed to fetch work request');
    }
    
    return response.json();
}

export async function getWorkRequestBeforeContent(id) {
    const response = await fetch(`${VIDEO_ARCHIVING_API_URL}/work-requests/${id}/before-content`, {
        headers: {
            'X-API-Key': VIDEO_ARCHIVING_API_KEY
        }
    });
    
    if (!response.ok) {
        throw new Error('Failed to fetch before content');
    }
    
    return response.json();
}

// In page.js
import { getWorkRequestById, getWorkRequestBeforeContent } from '@/lib/videoArchivingApiClient';

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

#### `app/efilinguser/files/[id]/view-document/page.js`
**Current Behavior:**
- Line 71: Fetches work request from `/api/requests?id=${fileData.work_request_id}`
- Line 80: Fetches before content from `/api/before-content?workRequestId=${fileData.work_request_id}`

**Required Changes:**
- Same as above - replace with external API calls

#### `app/efiling/files/[id]/page.js`
**Current Behavior:**
- Line 69: Fetches work requests from `/api/requests?limit=1000&scope=efiling`

**Required Changes:**
- Replace with external API call

#### `app/efiling/files/new/page.js`
**Current Behavior:**
- Line 48: Fetches work requests from `/api/requests?limit=1000&scope=efiling`

**Required Changes:**
- Replace with external API call

### 3.3 New API Routes to Create

#### `app/api/external/divisions/route.js` (NEW)
**Purpose**: Expose read-only divisions API for Video Archiving

**Endpoints:**
- `GET /api/external/divisions` - List all divisions
  - Query params: `active=true`, `department_id=123`
  - Returns: `{ data: [{ id, name, code, ce_type, department_id, description, is_active, ... }] }`
- `GET /api/external/divisions/{id}` - Get specific division
  - Returns: `{ id, name, code, ce_type, department_id, description, is_active, ... }`

**Authentication**: API key required (header: `X-API-Key`)
**Rate Limiting**: 100 requests/minute per API key
**Security**: Only accessible from localhost/internal network

**Implementation:**
```javascript
// app/api/external/divisions/route.js
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Middleware for API key authentication
function validateApiKey(request) {
    const apiKey = request.headers.get('X-API-Key');
    const expectedKey = process.env.EXTERNAL_API_KEY; // Set in .env
    
    if (!apiKey || apiKey !== expectedKey) {
        return NextResponse.json(
            { error: 'Unauthorized - Invalid API key' },
            { status: 401 }
        );
    }
    
    return null;
}

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
                'SELECT id, name, code, ce_type, department_id, description, is_active, created_at, updated_at FROM divisions WHERE id = $1',
                [id]
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
        let query = 'SELECT id, name, code, ce_type, department_id, description, is_active, created_at, updated_at FROM divisions WHERE 1=1';
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

#### `app/api/external/zones/route.js` (NEW)
**Purpose**: Expose read-only zones API for Video Archiving

**Endpoints:**
- `GET /api/external/zones` - List all zones
  - Query params: `active=true`
  - Returns: `{ data: [{ id, name, ce_type, description, is_active, ... }] }`
- `GET /api/external/zones/{id}` - Get specific zone
  - Returns: `{ id, name, ce_type, description, is_active, ... }`

**Authentication**: API key required
**Rate Limiting**: 100 requests/minute per API key
**Security**: Only accessible from localhost/internal network

**Implementation:**
```javascript
// app/api/external/zones/route.js
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

function validateApiKey(request) {
    const apiKey = request.headers.get('X-API-Key');
    const expectedKey = process.env.EXTERNAL_API_KEY;
    
    if (!apiKey || apiKey !== expectedKey) {
        return NextResponse.json(
            { error: 'Unauthorized - Invalid API key' },
            { status: 401 }
        );
    }
    
    return null;
}

export async function GET(request) {
    const authError = validateApiKey(request);
    if (authError) return authError;
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const active = searchParams.get('active');
    
    try {
        const client = await connectToDatabase();
        
        if (id) {
            const result = await client.query(
                'SELECT id, name, ce_type, description, is_active, created_at, updated_at FROM efiling_zones WHERE id = $1',
                [id]
            );
            
            if (result.rows.length === 0) {
                return NextResponse.json(
                    { error: 'Zone not found' },
                    { status: 404 }
                );
            }
            
            return NextResponse.json({ data: result.rows[0] });
        }
        
        let query = 'SELECT id, name, ce_type, description, is_active, created_at, updated_at FROM efiling_zones WHERE 1=1';
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

### 3.4 Libraries to Create

#### `lib/videoArchivingApiClient.js` (NEW)
**Purpose**: API client for Video Archiving system

**Functions:**
- `fetchWorkRequests(filters)` - Fetch work requests list
- `getWorkRequestById(id)` - Get specific work request
- `getWorkRequestBeforeContent(id)` - Get before content
- `getWorkRequestVideos(id)` - Get videos (optional)
- `getWorkRequestImages(id)` - Get images (optional)
- `verifyWorkRequest(id)` - Verify work request exists

**Implementation:**
```javascript
// lib/videoArchivingApiClient.js
const VIDEO_ARCHIVING_API_URL = process.env.VIDEO_ARCHIVING_API_URL || 'http://localhost:3000/api/external';
const VIDEO_ARCHIVING_API_KEY = process.env.VIDEO_ARCHIVING_API_KEY;

async function apiRequest(endpoint, options = {}) {
    const url = `${VIDEO_ARCHIVING_API_URL}${endpoint}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': VIDEO_ARCHIVING_API_KEY,
            ...options.headers
        }
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `API request failed: ${response.statusText}`);
    }
    
    return response.json();
}

export async function fetchWorkRequests(filters = {}) {
    const params = new URLSearchParams({
        scope: 'efiling',
        limit: '100',
        ...filters
    });
    
    return apiRequest(`/work-requests?${params}`);
}

export async function getWorkRequestById(id) {
    return apiRequest(`/work-requests/${id}`);
}

export async function getWorkRequestBeforeContent(id) {
    return apiRequest(`/work-requests/${id}/before-content`);
}

export async function getWorkRequestVideos(id) {
    return apiRequest(`/work-requests/${id}/videos`);
}

export async function getWorkRequestImages(id) {
    return apiRequest(`/work-requests/${id}/images`);
}

export async function verifyWorkRequest(id) {
    return apiRequest('/work-requests/verify', {
        method: 'POST',
        body: JSON.stringify({ work_request_id: id })
    });
}
```

---

## Phase 4: Environment Configuration

### 4.1 E-Filing System (.env)

```env
# Database
DATABASE_URL=postgresql://user:pass@efiling-db-server:5432/efiling

# Server
PORT=5000
NODE_ENV=production
NEXT_PUBLIC_APP_URL=http://internal-efiling-server:5000

# Video Archiving API Integration (Internal)
VIDEO_ARCHIVING_API_URL=http://localhost:3000/api/external
VIDEO_ARCHIVING_API_KEY=your_video_archiving_api_key_here

# External API Key (for Video Archiving to access divisions/zones)
EXTERNAL_API_KEY=your_efiling_external_api_key_here

# File Storage
FILE_STORAGE_PATH=/mnt/shared-storage/efiling
UPLOAD_MAX_SIZE=500MB

# Security
JWT_SECRET=your_jwt_secret
API_RATE_LIMIT=100
ALLOWED_ORIGINS=http://internal-efiling-server:5000

# NextAuth
NEXTAUTH_URL=http://internal-efiling-server:5000
NEXTAUTH_SECRET=your_nextauth_secret

# Network
INTERNAL_NETWORK_ONLY=true
```

---

## Phase 5: Implementation Steps

### Step 1: Database Preparation
- [ ] Backup current database
- [ ] Create `efiling` database copy using `pg_dump`/`pg_restore`
- [ ] Verify database copy integrity

### Step 2: Database Cleanup
- [ ] Run SQL script to delete video archiving tables from `efiling` database
- [ ] Remove FK constraint from `efiling_files.work_request_id`
- [ ] Verify `divisions` and `efiling_zones` tables exist
- [ ] Verify all efiling tables exist
- [ ] Run verification queries

### Step 3: API Development
- [ ] Create `/api/external/divisions` route
- [ ] Create `/api/external/zones` route
- [ ] Implement API key authentication
- [ ] Add rate limiting
- [ ] Test API endpoints

### Step 4: Code Updates
- [ ] Create `lib/videoArchivingApiClient.js`
- [ ] Update `app/api/efiling/files/route.js` to use API for work_request validation
- [ ] Update `app/api/efiling/files/[id]/route.js` to remove work_requests join
- [ ] Update `app/efilinguser/files/new/page.js` to use external API
- [ ] Update `app/efilinguser/files/[id]/page.js` to use external API
- [ ] Update `app/efilinguser/files/[id]/view-document/page.js` to use external API
- [ ] Update `app/efiling/files/[id]/page.js` to use external API
- [ ] Update `app/efiling/files/new/page.js` to use external API

### Step 5: File Storage Setup
- [ ] Set up shared file storage server
- [ ] Configure network mount: `/mnt/shared-storage/efiling`
- [ ] Update file upload paths in code
- [ ] Test file storage access

### Step 6: Testing
- [ ] Test E-Filing standalone (without video archiving)
- [ ] Test divisions/zones API endpoints
- [ ] Test work request API integration
- [ ] Test file creation with work_request_id
- [ ] Test file viewing with linked work request
- [ ] Test API error handling
- [ ] Test rate limiting

### Step 7: Deployment
- [ ] Deploy E-Filing on port 5000 (intranet)
- [ ] Configure firewall rules (block internet access)
- [ ] Configure internal network access
- [ ] Set up monitoring
- [ ] Document API endpoints

---

## Phase 6: API Integration Points

### 6.1 E-Filing → Video Archiving APIs

**Base URL:** `http://localhost:3000/api/external` (internal only)

1. **GET /api/external/work-requests**
   - List/search work requests
   - Query params: `search`, `status`, `limit`, `offset`, `scope=efiling`
   - Returns: `{ data: [{ id, address, complaint_type, status, ... }] }`
   - Used in: File creation dropdown

2. **GET /api/external/work-requests/{id}**
   - Get specific work request details
   - Returns: `{ id, address, description, status, dates, ... }`
   - Used in: File detail page

3. **GET /api/external/work-requests/{id}/before-content**
   - Get before content for work request
   - Returns: `{ data: [{ id, link, content_type, description, ... }] }`
   - Used in: File detail page

4. **POST /api/external/work-requests/verify**
   - Verify work request exists
   - Body: `{ work_request_id: 123 }`
   - Returns: `{ exists: true, valid: true, data: {...} }`
   - Used in: File creation/update validation

**Authentication:**
- API key in environment variable: `VIDEO_ARCHIVING_API_KEY`
- Header: `X-API-Key: <key>`
- Rate limiting: 100 requests/minute per API key

### 6.2 Video Archiving → E-Filing APIs

**Base URL:** `http://localhost:5000/api/external` (internal only)

1. **GET /api/external/divisions**
   - List all divisions
   - Query params: `active=true`, `department_id=123`
   - Returns: `{ data: [{ id, name, code, ce_type, department_id, ... }] }`
   - Used in: Video archiving work request forms, filters

2. **GET /api/external/divisions/{id}**
   - Get specific division details
   - Returns: `{ id, name, code, ce_type, department_id, ... }`

3. **GET /api/external/zones**
   - List all zones
   - Query params: `active=true`
   - Returns: `{ data: [{ id, name, ce_type, description, ... }] }`
   - Used in: Video archiving work request forms, filters

4. **GET /api/external/zones/{id}**
   - Get specific zone details
   - Returns: `{ id, name, ce_type, description, ... }`

**Authentication:**
- API key in environment variable: `EXTERNAL_API_KEY`
- Header: `X-API-Key: <key>`
- Rate limiting: 100 requests/minute per API key

---

## Phase 7: File Storage Configuration

### 7.1 File Storage Structure

```
/mnt/shared-storage/
├── efiling/
│   ├── documents/
│   ├── attachments/
│   ├── signatures/
│   └── templates/
└── video-archiving/
    ├── videos/
    ├── images/
    ├── before-content/
    └── final-videos/
```

### 7.2 Environment Variables

**E-Filing:**
```env
FILE_STORAGE_PATH=/mnt/shared-storage/efiling
UPLOAD_MAX_SIZE=500MB
```

**Video Archiving:**
```env
FILE_STORAGE_PATH=/mnt/shared-storage/video-archiving
UPLOAD_MAX_SIZE=500MB
```

### 7.3 File Access

- Both systems access files via network mount
- Files stored with secure naming (UUIDs or hashes)
- Access control via application logic
- Backup strategy for file storage

---

## Phase 8: Security Considerations

### 8.1 Network Security

- **E-Filing Server**: 
  - Not exposed to internet
  - Only accessible from organization network
  - Firewall rules: Block all external access
  - Internal network: Allow access from Video Archiving server only

- **API Endpoints**:
  - All `/api/external/*` endpoints only accessible from localhost/internal network
  - IP whitelist for API access (optional)
  - Request logging for audit

### 8.2 API Security

- **Authentication**: API keys stored in environment variables
- **Rate Limiting**: 100 requests/minute per API key
- **Request Logging**: All API requests logged
- **Error Handling**: Don't expose internal errors to external systems

### 8.3 Data Security

- **Database Access**: Only from app servers (localhost/internal network)
- **File Storage**: Secure access, proper permissions
- **Encryption**: Encrypted connections between servers
- **Audit Logs**: All cross-system API calls logged

---

## Phase 9: Migration Checklist

### Pre-Migration
- [ ] Backup existing database
- [ ] Document all current integrations
- [ ] Test database backup restoration
- [ ] Review all code dependencies
- [ ] Set up VMware infrastructure
- [ ] Configure network settings
- [ ] Set up file storage server

### Migration
- [ ] Copy database to create `efiling` database
- [ ] Run SQL cleanup script
- [ ] Verify data integrity
- [ ] Remove FK constraint from `efiling_files.work_request_id`
- [ ] Create API endpoints (divisions, zones)
- [ ] Update code to use external APIs
- [ ] Test API integration
- [ ] Set up file storage

### Post-Migration
- [ ] Verify E-Filing works independently
- [ ] Test API integration with Video Archiving
- [ ] Monitor error logs
- [ ] Update documentation
- [ ] Train team on new architecture
- [ ] Set up monitoring and alerts

---

## Phase 10: Testing Strategy

### 10.1 Unit Tests
- Test API endpoints independently
- Test database queries
- Test API authentication
- Test rate limiting

### 10.2 Integration Tests
- Test API calls to Video Archiving
- Test error handling
- Test data consistency
- Test file storage access

### 10.3 End-to-End Tests
- Test complete file creation workflow
- Test file creation with work_request_id
- Test file viewing with linked work request
- Test before content display
- Test divisions/zones API access

### 10.4 Performance Tests
- Test API response times
- Test database query performance
- Test concurrent API requests
- Test file upload/download performance

---

## Phase 11: Rollback Plan

If issues occur during migration:

1. **Immediate Rollback:**
   - Restore database from backup
   - Revert code changes
   - Restore FK constraint

2. **Partial Rollback:**
   - Keep new database but don't use it
   - Revert code changes
   - Continue using original database

3. **Data Recovery:**
   - Export data from new database
   - Import back to original database
   - Verify data integrity

---

## Phase 12: Code Modification Summary

### Files to Modify:

1. **API Routes:**
   - `app/api/efiling/files/route.js` - Remove work_request validation
   - `app/api/efiling/files/[id]/route.js` - Remove work_requests join
   - `app/api/efiling/files/[id]/history/route.js` - Remove work_requests reference

2. **Frontend Pages:**
   - `app/efilinguser/files/new/page.js` - Replace `/api/requests` with external API
   - `app/efilinguser/files/[id]/page.js` - Replace `/api/requests` and `/api/before-content`
   - `app/efilinguser/files/[id]/view-document/page.js` - Replace API calls
   - `app/efiling/files/[id]/page.js` - Replace `/api/requests`
   - `app/efiling/files/new/page.js` - Replace `/api/requests`

3. **New Files to Create:**
   - `app/api/external/divisions/route.js` - Divisions API
   - `app/api/external/zones/route.js` - Zones API
   - `lib/videoArchivingApiClient.js` - API client library

---

## Notes

- The SQL script should be run during a maintenance window
- E-Filing system should be tested thoroughly before going live
- API rate limiting should be configured to prevent abuse
- Monitoring should be set up for both systems
- Documentation should be updated for API endpoints
- File storage should be backed up regularly
- Database backups should be automated
- All internal APIs should use localhost/internal network only
- E-Filing server should never be exposed to internet

