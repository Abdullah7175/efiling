import { NextResponse } from 'next/server';
import { actionLogger, ACTION_TYPES, ENTITY_TYPES } from '@/lib/actionLogger';
import { requireAuth } from '@/lib/authMiddleware';

export async function GET(req) {
    // SECURITY: Require authentication (debug endpoint should be protected)
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    try {
        // Test logging an action
        const result = await actionLogger.create(req, ENTITY_TYPES.USER, 999, 'Test User', {
            test: true,
            message: 'Testing action logging system'
        });

        return NextResponse.json({
            success: true,
            actionLogged: result,
            message: 'Test action logged successfully'
        });
    } catch (error) {
        console.error('Test action logging error:', error);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

export async function POST(req) {
    // SECURITY: Require authentication (debug endpoint should be protected)
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    
    try {
        const body = await req.json();
        const { actionType, entityType, entityId, entityName, details } = body;

        // Test logging with provided data
        const result = await actionLogger.create(req, entityType || ENTITY_TYPES.USER, entityId || 999, entityName || 'Test Entity', {
            test: true,
            customDetails: details,
            timestamp: new Date().toISOString()
        });

        return NextResponse.json({
            success: true,
            actionLogged: result,
            message: 'Custom test action logged successfully'
        });
    } catch (error) {
        console.error('Custom test action logging error:', error);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
} 