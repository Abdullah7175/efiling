import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * Proxy API route to fetch work requests from Video Archiving system
 * This avoids CORS issues and keeps API keys server-side
 */
export async function GET(request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';
        const status = searchParams.get('status');
        const limit = searchParams.get('limit') || '50';
        const offset = searchParams.get('offset') || '0';

        // Get Video Archiving API configuration
        const apiUrl = process.env.VIDEO_ARCHIVING_API_URL || 'http://localhost:3000/api/external';
        const apiKey = process.env.VIDEO_ARCHIVING_API_KEY || process.env.EXTERNAL_API_KEY || '';

        // Build query parameters
        const queryParams = new URLSearchParams({
            scope: 'efiling',
            limit: Math.min(parseInt(limit), 500).toString(),
            offset: offset.toString(),
        });

        if (search) {
            queryParams.append('search', search);
        }

        if (status) {
            queryParams.append('status', status.toString());
        }

        // Make request to Video Archiving API
        const response = await fetch(`${apiUrl}/work-requests?${queryParams.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'X-API-Key': apiKey } : {}),
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            return NextResponse.json(
                { error: errorData.error || 'Failed to fetch work requests' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('Error proxying work requests request:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * POST endpoint to verify work request
 */
export async function POST(request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const workRequestId = body.work_request_id || body.workRequestId;

        if (!workRequestId) {
            return NextResponse.json(
                { error: 'work_request_id is required' },
                { status: 400 }
            );
        }

        // Get Video Archiving API configuration
        const apiUrl = process.env.VIDEO_ARCHIVING_API_URL || 'http://localhost:3000/api/external';
        const apiKey = process.env.VIDEO_ARCHIVING_API_KEY || process.env.EXTERNAL_API_KEY || '';

        // Make request to Video Archiving API
        const response = await fetch(`${apiUrl}/work-requests/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'X-API-Key': apiKey } : {}),
            },
            body: JSON.stringify({ work_request_id: workRequestId }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            return NextResponse.json(
                { error: errorData.error || 'Failed to verify work request' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('Error proxying work request verification:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

