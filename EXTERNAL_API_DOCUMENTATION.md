# External API Documentation for Video Archiving Integration

This document describes the external APIs available for the Video Archiving system to connect with the E-Filing system.

## Base URL

- **Development**: `http://localhost:5000/api/external`
- **Production**: `http://119.30.113.18:5000/api/external`

## Authentication

All external APIs require API key authentication via the `X-API-Key` header.

### Environment Variables

Set the following environment variable in your `.env` file:

```env
VIDEO_ARCHIVING_API_KEY=your-secret-api-key-here
# OR
EXTERNAL_API_KEY=your-secret-api-key-here
```

### Request Headers

```http
X-API-Key: your-secret-api-key-here
```

**Note**: In development mode, requests from localhost may be allowed without an API key for testing purposes.

---

## Work Requests APIs

### 1. List Work Requests

**GET** `/api/external/work-requests`

List and search work requests.

#### Query Parameters

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| `search` | string | Search in address, description, ID, or complaint type | No |
| `filter` | string | Alias for `search` | No |
| `status` | string | Filter by status name | No |
| `limit` | number | Number of results per page (default: 100) | No |
| `offset` | number | Number of results to skip (default: 0) | No |
| `scope` | string | Can be 'efiling' to indicate e-filing system calling | No |

#### Example Request

```bash
curl -X GET "http://localhost:5000/api/external/work-requests?search=road&limit=10" \
  -H "X-API-Key: your-api-key"
```

#### Example Response

```json
{
  "data": [
    {
      "id": 123,
      "request_date": "2024-01-15",
      "address": "Main Street, Block A",
      "description": "Road repair needed",
      "zone_id": 1,
      "division_id": 2,
      "town_id": 5,
      "latitude": 31.5204,
      "longitude": 74.3587,
      "status_name": "In Progress",
      "complaint_type": "Road Maintenance",
      "town_name": "Lahore",
      "district_name": "Lahore District",
      "creator_name": "John Doe",
      "created_date": "2024-01-15T10:00:00Z"
    }
  ],
  "total": 50,
  "limit": 10,
  "offset": 0,
  "hasMore": true
}
```

---

### 2. Get Work Request by ID

**GET** `/api/external/work-requests/{id}`

Get detailed information about a specific work request.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Work request ID |

#### Example Request

```bash
curl -X GET "http://localhost:5000/api/external/work-requests/123" \
  -H "X-API-Key: your-api-key"
```

#### Example Response

```json
{
  "data": {
    "id": 123,
    "request_date": "2024-01-15",
    "address": "Main Street, Block A",
    "description": "Road repair needed",
    "zone_id": 1,
    "division_id": 2,
    "town_id": 5,
    "subtown_id": 10,
    "latitude": 31.5204,
    "longitude": 74.3587,
    "contact_number": "+92-300-1234567",
    "status_id": 3,
    "status_name": "In Progress",
    "complaint_type": "Road Maintenance",
    "complaint_type_id": 5,
    "complaint_subtype": "Pothole Repair",
    "town_name": "Lahore",
    "subtown_name": "Gulberg",
    "district_name": "Lahore District",
    "created_date": "2024-01-15T10:00:00Z",
    "updated_date": "2024-01-16T14:30:00Z",
    "creator_id": 10,
    "creator_type": "user",
    "creator_name": "John Doe",
    "assigned_to": 15,
    "assigned_to_name": "Jane Smith",
    "additional_locations": [
      {
        "id": 1,
        "latitude": 31.5210,
        "longitude": 74.3590,
        "description": "Secondary location"
      }
    ],
    "final_video_link": "/uploads/final-videos/video123.mp4"
  }
}
```

---

### 3. Get Before Content for Work Request

**GET** `/api/external/work-requests/{id}/before-content`

Get all before content (images/videos) associated with a work request.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | number | Work request ID |

#### Example Request

```bash
curl -X GET "http://localhost:5000/api/external/work-requests/123/before-content" \
  -H "X-API-Key: your-api-key"
```

#### Example Response

```json
{
  "data": [
    {
      "id": 456,
      "work_request_id": 123,
      "description": "Before repair photo",
      "link": "/uploads/before-content/images/photo123.jpg",
      "content_type": "image",
      "file_name": "photo123.jpg",
      "file_size": 245678,
      "file_type": "image/jpeg",
      "created_at": "2024-01-15T11:00:00Z",
      "creator_id": 10,
      "creator_type": "user",
      "creator_name": "John Doe",
      "latitude": 31.5204,
      "longitude": 74.3587
    },
    {
      "id": 457,
      "work_request_id": 123,
      "description": "Before repair video",
      "link": "/uploads/before-content/videos/video123.mp4",
      "content_type": "video",
      "file_name": "video123.mp4",
      "file_size": 5242880,
      "file_type": "video/mp4",
      "created_at": "2024-01-15T11:30:00Z",
      "creator_id": 10,
      "creator_type": "user",
      "creator_name": "John Doe",
      "latitude": 31.5205,
      "longitude": 74.3588
    }
  ],
  "count": 2,
  "work_request_id": 123
}
```

---

### 4. Verify Work Request

**POST** `/api/external/work-requests/verify`

Verify if a work request exists and is valid.

#### Request Body

```json
{
  "work_request_id": 123
}
```

#### Example Request

```bash
curl -X POST "http://localhost:5000/api/external/work-requests/verify" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"work_request_id": 123}'
```

#### Example Response (Valid)

```json
{
  "exists": true,
  "valid": true,
  "data": {
    "id": 123,
    "address": "Main Street, Block A",
    "description": "Road repair needed",
    "status": "In Progress",
    "status_id": 3,
    "request_date": "2024-01-15",
    "created_date": "2024-01-15T10:00:00Z"
  }
}
```

#### Example Response (Not Found)

```json
{
  "exists": false,
  "valid": false,
  "message": "Work request not found"
}
```

---

## Divisions API

### Get Divisions

**GET** `/api/external/divisions`

Get list of divisions or a specific division.

#### Query Parameters

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| `id` | number | Get specific division by ID | No |
| `active` | boolean | Filter by active status (`true` or `false`) | No |
| `department_id` | number | Filter by department ID | No |

#### Example Request (List All)

```bash
curl -X GET "http://localhost:5000/api/external/divisions?active=true" \
  -H "X-API-Key: your-api-key"
```

#### Example Request (Get Specific)

```bash
curl -X GET "http://localhost:5000/api/external/divisions?id=5" \
  -H "X-API-Key: your-api-key"
```

#### Example Response

```json
{
  "data": [
    {
      "id": 1,
      "name": "Water Supply Division",
      "code": "WSD-001",
      "ce_type": "water",
      "department_id": 1,
      "description": "Handles water supply operations",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "count": 1
}
```

---

## Zones API

### Get Zones

**GET** `/api/external/zones`

Get list of zones or a specific zone with location mappings.

#### Query Parameters

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| `id` | number | Get specific zone by ID | No |
| `active` | boolean | Filter by active status (`true` or `false`) | No |

#### Example Request (List All)

```bash
curl -X GET "http://localhost:5000/api/external/zones?active=true" \
  -H "X-API-Key: your-api-key"
```

#### Example Request (Get Specific)

```bash
curl -X GET "http://localhost:5000/api/external/zones?id=3" \
  -H "X-API-Key: your-api-key"
```

#### Example Response

```json
{
  "data": [
    {
      "id": 1,
      "name": "Zone A",
      "ce_type": "water",
      "description": "Central zone for water operations",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z",
      "locations": [
        {
          "district_id": 1,
          "district_name": "Lahore District",
          "town_id": 5,
          "town_name": "Lahore"
        }
      ]
    }
  ],
  "count": 1
}
```

---

## Error Responses

All APIs return standard error responses:

### 401 Unauthorized

```json
{
  "error": "Unauthorized - API key required. Provide X-API-Key header."
}
```

### 400 Bad Request

```json
{
  "error": "Invalid work request ID"
}
```

### 404 Not Found

```json
{
  "error": "Work request not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Internal server error"
}
```

---

## Rate Limiting

Currently, there is no rate limiting implemented, but it is recommended to:
- Implement client-side rate limiting (100 requests/minute per API key)
- Cache responses when appropriate
- Use pagination for large result sets

---

## Testing

### Test API Key Authentication

```bash
# Without API key (should fail in production)
curl -X GET "http://localhost:5000/api/external/work-requests"

# With API key (should succeed)
curl -X GET "http://localhost:5000/api/external/work-requests" \
  -H "X-API-Key: your-api-key"
```

### Test Work Request Verification

```bash
curl -X POST "http://localhost:5000/api/external/work-requests/verify" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"work_request_id": 123}'
```

---

## Integration Example (JavaScript/Node.js)

```javascript
const API_BASE_URL = 'http://localhost:5000/api/external';
const API_KEY = 'your-api-key';

async function getWorkRequest(id) {
  const response = await fetch(`${API_BASE_URL}/work-requests/${id}`, {
    headers: {
      'X-API-Key': API_KEY
    }
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.data;
}

async function verifyWorkRequest(workRequestId) {
  const response = await fetch(`${API_BASE_URL}/work-requests/verify`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ work_request_id: workRequestId })
  });
  
  const data = await response.json();
  return data.valid && data.exists;
}

// Usage
const workRequest = await getWorkRequest(123);
const isValid = await verifyWorkRequest(123);
```

---

## Notes

1. All date/time fields are returned in ISO 8601 format (UTC)
2. Geographic coordinates (latitude/longitude) use WGS84 (EPSG:4326)
3. File paths in responses are relative to the server root
4. The APIs are read-only for video archiving system (no POST/PUT/DELETE operations)
5. In development mode, localhost requests may bypass API key authentication for easier testing

