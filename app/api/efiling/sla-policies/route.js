import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';
import { eFileActionLogger, EFILING_ENTITY_TYPES, EFILING_ACTION_TYPES } from '@/lib/efilingActionLogger';
import { validateEFileAccess, checkEFileRateLimit } from '@/lib/efilingSecurity';

export async function GET(request) {
    let client;
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const fileTypeId = searchParams.get('fileTypeId');
        const departmentId = searchParams.get('department_id');
        const isActive = searchParams.get('is_active');
        const userId = searchParams.get('userId');
        const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');

        // Rate limiting
        const rateLimit = checkEFileRateLimit(userId || 'anonymous', 'api', userId);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429 }
            );
        }

        // Validate access
        const accessValidation = await validateEFileAccess(userId, 'sla_policy', null, 'VIEW_SLA_POLICIES');
        if (!accessValidation.allowed) {
            return NextResponse.json(
                { error: accessValidation.reason },
                { status: 403 }
            );
        }

        client = await connectToDatabase();

        if (id) {
            // Fetch single SLA policy
            const result = await client.query(`
                SELECT 
                    sp.*,
                    d.name as department_name,
                    d.code as department_code
                FROM efiling_sla_policies sp
                LEFT JOIN efiling_departments d ON sp.department_id = d.id
                WHERE sp.id = $1
            `, [id]);

            if (result.rows.length === 0) {
                return NextResponse.json(
                    { error: 'SLA policy not found' },
                    { status: 404 }
                );
            }

            // Log the action
            await eFileActionLogger.logAction({
                entityType: 'SLA_POLICY',
                entityId: id,
                action: 'SLA_POLICY_VIEWED',
                userId: userId || 'anonymous',
                details: { slaPolicyId: id },
                ipAddress
            });

            return NextResponse.json(result.rows[0]);

        } else {
            // Fetch all SLA policies
            let query = `
                SELECT 
                    sp.*,
                    d.name as department_name,
                    d.code as department_code
                FROM efiling_sla_policies sp
                LEFT JOIN efiling_departments d ON sp.department_id = d.id
                WHERE 1=1
            `;
            
            const params = [];
            let paramCount = 1;

            if (fileTypeId) {
                query += ` AND EXISTS (
                    SELECT 1 FROM efiling_file_types ft 
                    WHERE ft.sla_policy_id = sp.id AND ft.id = $${paramCount}
                )`;
                params.push(fileTypeId);
                paramCount++;
            }

            if (departmentId) {
                // Show policies for this department OR global policies (department_id IS NULL)
                query += ` AND (sp.department_id = $${paramCount} OR sp.department_id IS NULL)`;
                params.push(departmentId);
                paramCount++;
            }

            if (isActive !== null && isActive !== '') {
                query += ` AND sp.is_active = $${paramCount}`;
                params.push(isActive === 'true');
                paramCount++;
            }

            query += ` ORDER BY sp.department_id NULLS LAST, sp.name ASC`;

            const result = await client.query(query, params);

            // Log the action
            await eFileActionLogger.logAction({
                entityType: 'SLA_POLICY',
                entityId: null,
                action: 'SLA_POLICY_VIEWED',
                userId: userId || 'anonymous',
                details: { count: result.rows.length },
                ipAddress
            });

            return NextResponse.json({
                success: true,
                slaPolicies: result.rows
            });
        }

    } catch (error) {
        console.error('Error fetching SLA policies:', error);
        return NextResponse.json(
            { error: 'Failed to fetch SLA policies' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function POST(request) {
    let client;
    try {
        // Get session for authentication
        const session = await auth(request);
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = session.user.id.toString();
        const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
        const userAgent = request.headers.get('user-agent');

        const body = await request.json();
        const { 
            name, 
            description, 
            departmentId,
            policyType
        } = body;

        // Input validation
        if (!name) {
            return NextResponse.json(
                { error: 'Name is required' },
                { status: 400 }
            );
        }

        // Rate limiting
        const rateLimit = checkEFileRateLimit(userId, 'workflow_action', userId);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429 }
            );
        }

        // Validate access
        const accessValidation = await validateEFileAccess(userId, 'sla_policy', null, 'CREATE_SLA_POLICY');
        if (!accessValidation.allowed) {
            return NextResponse.json(
                { error: accessValidation.reason },
                { status: 403 }
            );
        }

        client = await connectToDatabase();

        // Create SLA policy
        const result = await client.query(`
            INSERT INTO efiling_sla_policies (
                name, description, department_id, policy_type, 
                is_active, created_at
            ) VALUES ($1, $2, $3, $4, true, NOW())
            RETURNING *
        `, [
            name,
            description,
            departmentId || null,
            policyType || 'TIME_BASED'
        ]);

        const slaPolicy = result.rows[0];

        // Log the action
        await eFileActionLogger.logAction({
            entityType: 'SLA_POLICY',
            entityId: slaPolicy.id,
            action: 'SLA_POLICY_CREATED',
            userId: userId,
            details: {
                slaPolicyName: name,
                departmentId: departmentId || 'global'
            },
            ipAddress,
            userAgent
        });

        return NextResponse.json({
            success: true,
            slaPolicy: {
                id: slaPolicy.id,
                name: slaPolicy.name,
                description: slaPolicy.description,
                departmentId: slaPolicy.department_id,
                policyType: slaPolicy.policy_type
            }
        }, { status: 201 });

    } catch (error) {
        console.error('Error creating SLA policy:', error);
        return NextResponse.json(
            { error: 'Failed to create SLA policy' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}
