# API Integration Guide - Video Archiving & E-Filing

This document describes the APIs created for connecting Video Archiving system with E-Filing system.

---

## Overview

Two sets of APIs have been created:

1. **External APIs in E-Filing** - For Video Archiving to call (work requests data)

2. **E-Filing API Client** - For Video Archiving to call E-Filing (divisions/zones data)

---

## 1. E-Filing External APIs

**Base URL:** `http://localhost:5000/api/external` (will be IP-based in production: `http://119.30.113.18:5000/api/external`)

**Authentication:** API Key via `X-API-Key` header

**Rate Limiting:** 100 requests per minute per API key

### Environment Variables Required

```env
VIDEO_ARCHIVING_API_KEY=your_secret_api_key_here
# OR
EXTERNAL_API_KEY=your_secret_api_key_here
```

---

### 1.1 GET /api/external/work-requests

List/search work requests for E-Filing integration.

**Query Parameters:**

- `scope` (required): Must be `efiling`

- `search` (optional): Search term (searches address and description)

- `status` (optional): Filter by status ID or status name

- `limit` (optional): Number of results (default: 100, max: 500)

- `offset` (optional): Pagination offset (default: 0)

**Example Request:**

```bash
curl -X GET "http://localhost:5000/api/external/work-requests?scope=efiling&search=street&limit=50" \
  -H "X-API-Key: your_secret_api_key_here"
```

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "address": "123 Main Street",
      "description": "Water leak repair",
      "request_date": "2025-01-15",
      "status_id": 1,
      "status_name": "Pending",
      "complaint_type": "Water Supply",
      "town_name": "Karachi",
      "district_name": "East",
      "division_id": 5,
      "zone_id": 3,
      "contact_number": "03001234567",
      "created_date": "2025-01-15T10:00:00Z",
      "updated_date": "2025-01-15T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### 1.2 GET /api/external/work-requests/{id}

Get specific work request details.

**Example Request:**

```bash
curl -X GET "http://localhost:5000/api/external/work-requests/123" \
  -H "X-API-Key: your_secret_api_key_here"
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "id": 123,
    "address": "123 Main Street",
    "description": "Water leak repair",
    "request_date": "2025-01-15",
    "status_id": 1,
    "status_name": "Pending",
    "complaint_type": "Water Supply",
    "complaint_subtype": "Leak Repair",
    "town_name": "Karachi",
    "subtown_name": "Gulshan",
    "district_name": "East",
    "division_id": 5,
    "zone_id": 3,
    "contact_number": "03001234567",
    "assigned_to_name": "John Doe",
    "executive_engineer_name": "Engineer Smith",
    "contractor_name": "ABC Contractors",
    "latitude": 24.8607,
    "longitude": 67.0011,
    "created_date": "2025-01-15T10:00:00Z",
    "updated_date": "2025-01-15T10:00:00Z"
  }
}
```

---

### 1.3 GET /api/external/work-requests/{id}/before-content

Get before content (images/videos) for a work request.

**Example Request:**

```bash
curl -X GET "http://localhost:5000/api/external/work-requests/123/before-content" \
  -H "X-API-Key: your_secret_api_key_here"
```

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 456,
      "link": "/uploads/before/image1.jpg",
      "content_type": "image",
      "description": "Before repair photo",
      "file_name": "image1.jpg",
      "file_size": 2048576,
      "file_type": "image/jpeg",
      "created_at": "2025-01-15T10:30:00Z",
      "creator_name": "John Doe"
    }
  ]
}
```

---

### 1.4 GET /api/external/work-requests/{id}/videos

Get videos for a work request (optional endpoint).

**Example Request:**

```bash
curl -X GET "http://localhost:5000/api/external/work-requests/123/videos" \
  -H "X-API-Key: your_secret_api_key_here"
```

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 789,
      "link": "/uploads/videos/video1.mp4",
      "description": "Work progress video",
      "file_name": "video1.mp4",
      "file_size": 5242880,
      "file_type": "video/mp4",
      "created_at": "2025-01-15T11:00:00Z",
      "creator_name": "John Doe",
      "latitude": 24.8607,
      "longitude": 67.0011
    }
  ]
}
```

---

### 1.5 GET /api/external/work-requests/{id}/images

Get images for a work request (optional endpoint).

**Example Request:**

```bash
curl -X GET "http://localhost:5000/api/external/work-requests/123/images" \
  -H "X-API-Key: your_secret_api_key_here"
```

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 101,
      "link": "/uploads/images/image1.jpg",
      "description": "Work progress image",
      "file_name": "image1.jpg",
      "file_size": 2048576,
      "file_type": "image/jpeg",
      "created_at": "2025-01-15T11:00:00Z",
      "creator_name": "John Doe",
      "latitude": 24.8607,
      "longitude": 67.0011
    }
  ]
}
```

---

### 1.6 POST /api/external/work-requests/verify

Verify work request exists. Used by E-Filing to validate `work_request_id` before creating files.

**Request Body:**

```json
{
  "work_request_id": 123
}
```

**Example Request:**

```bash
curl -X POST "http://localhost:5000/api/external/work-requests/verify" \
  -H "X-API-Key: your_secret_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{"work_request_id": 123}'
```

**Example Response (Exists):**

```json
{
  "exists": true,
  "valid": true,
  "data": {
    "id": 123,
    "address": "123 Main Street",
    "description": "Water leak repair",
    "status_id": 1,
    "status_name": "Pending",
    "request_date": "2025-01-15",
    "created_date": "2025-01-15T10:00:00Z",
    "complaint_type": "Water Supply"
  }
}
```

**Example Response (Not Found):**

```json
{
  "exists": false,
  "valid": false,
  "data": null
}
```

---

## 2. E-Filing API Client Library

**Location:** `lib/efilingApiClient.js`

**Purpose:** Video Archiving uses this to fetch divisions and zones from E-Filing system.

### Environment Variables Required

```env
EFILING_API_URL=http://localhost:5000/api/external
EFILING_API_KEY=your_efiling_api_key_here
```

### Available Functions

#### 2.1 getDivisions(filters)

Fetch divisions from E-Filing system.

```javascript
import { getDivisions } from '@/lib/efilingApiClient';

// Get all active divisions
const result = await getDivisions({ active: true });

// Get divisions by department
const result = await getDivisions({ department_id: 5 });

// Get all divisions
const result = await getDivisions();
```

**Returns:**

```javascript
{
  success: true,
  data: [
    {
      id: 1,
      name: "Division A",
      code: "DIV-A",
      ce_type: "CE",
      department_id: 5,
      description: "...",
      is_active: true
    }
  ]
}
```

#### 2.2 getDivisionById(id)

Get specific division by ID.

```javascript
import { getDivisionById } from '@/lib/efilingApiClient';

const result = await getDivisionById(1);
```

#### 2.3 getZones(filters)

Fetch zones from E-Filing system.

```javascript
import { getZones } from '@/lib/efilingApiClient';

// Get all active zones
const result = await getZones({ active: true });

// Get all zones
const result = await getZones();
```

#### 2.4 getZoneById(id)

Get specific zone by ID.

```javascript
import { getZoneById } from '@/lib/efilingApiClient';

const result = await getZoneById(1);
```

#### 2.5 testConnection()

Test E-Filing API connection.

```javascript
import { testConnection } from '@/lib/efilingApiClient';

const isConnected = await testConnection();

if (!isConnected) {
  console.error('E-Filing API is not accessible');
}
```

---

## 3. Error Handling

All APIs return standard error responses:

**401 Unauthorized:**

```json
{
  "error": "API key required. Provide X-API-Key header."
}
```

**429 Too Many Requests:**

```json
{
  "error": "Rate limit exceeded",
  "resetAt": "2025-01-15T11:00:00Z"
}
```

**400 Bad Request:**

```json
{
  "error": "Invalid scope. Must provide scope=efiling parameter."
}
```

**404 Not Found:**

```json
{
  "error": "Work request not found"
}
```

**500 Internal Server Error:**

```json
{
  "error": "Internal server error"
}
```

---

## 4. Rate Limiting

- **Limit:** 100 requests per minute per API key

- **Response Headers:**

  - `X-RateLimit-Limit`: Maximum requests allowed

  - `X-RateLimit-Remaining`: Remaining requests in current window

  - `X-RateLimit-Reset`: Timestamp when rate limit resets

---

## 5. Security Considerations

1. **API Keys:** Store in environment variables, never commit to git

2. **HTTPS:** Use HTTPS in production (currently localhost for development)

3. **IP Whitelisting:** Consider IP whitelisting for production

4. **Rate Limiting:** Already implemented (100 req/min)

5. **Scope Parameter:** Required for work-requests endpoint to prevent accidental exposure

---

## 6. Production Deployment

When deploying to production:

1. **Update Base URLs:**

   - E-Filing: `http://119.30.113.18:5000/api/external`

2. **Update Environment Variables:**

   ```env
   # E-Filing .env
   VIDEO_ARCHIVING_API_KEY=strong_random_key_here
   EXTERNAL_API_KEY=strong_random_key_here
   
   # Video Archiving .env
   EFILING_API_URL=http://119.30.113.18:5000/api/external
   EFILING_API_KEY=efiling_api_key_here
   ```

3. **Network Configuration:**

   - Ensure both systems can reach each other on internal network

   - Do not expose external APIs to internet

   - Use firewall rules to restrict access

---

## 7. Testing

### Test E-Filing External API:

```bash
# Test verify endpoint
curl -X POST "http://localhost:5000/api/external/work-requests/verify" \
  -H "X-API-Key: test_key" \
  -H "Content-Type: application/json" \
  -d '{"work_request_id": 1}'

# Test list endpoint
curl -X GET "http://localhost:5000/api/external/work-requests?scope=efiling&limit=10" \
  -H "X-API-Key: test_key"
```

### Test E-Filing API Client:

```javascript
// In a Next.js API route or server component
import { getDivisions, testConnection } from '@/lib/efilingApiClient';

// Test connection
const connected = await testConnection();
console.log('E-Filing connected:', connected);

// Get divisions
const divisions = await getDivisions({ active: true });
console.log('Divisions:', divisions);
```

---

## 8. Next Steps

1. **Set up environment variables** in both systems

2. **Test API connectivity** between systems

3. **Implement sync mechanism** for divisions/zones (see sync plan)

4. **Update Video Archiving code** to use E-Filing API client for divisions/zones

5. **Update E-Filing code** to use Video Archiving external APIs for work requests

---

## Files Created

### E-Filing External APIs:

- `app/api/external/work-requests/route.js` - List/search work requests
- `app/api/external/work-requests/[id]/route.js` - Get work request details
- `app/api/external/work-requests/[id]/before-content/route.js` - Get before content
- `app/api/external/work-requests/[id]/videos/route.js` - Get videos
- `app/api/external/work-requests/[id]/images/route.js` - Get images
- `app/api/external/work-requests/verify/route.js` - Verify work request
- `app/api/external/divisions/route.js` - Get divisions
- `app/api/external/zones/route.js` - Get zones

### Authentication & Utilities:

- `lib/apiAuth.js` - API key validation and rate limiting

### E-Filing API Client:

- `lib/efilingApiClient.js` - Client library to call E-Filing APIs

---

## Support

For issues or questions, refer to:

- `EFILING_SEPARATION_PLAN.md` - Overall separation plan
- `EFILING_CODE_MODIFICATIONS.md` - Code modification checklist

