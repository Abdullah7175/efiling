import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { auth } from '@/auth';
import { eFileActionLogger } from '@/lib/efilingActionLogger';
import { validateEFileAccess, checkEFileRateLimit } from '@/lib/efilingSecurity';

export async function PUT(request, { params }) {
    let client;
    try {
        const { id } = await params;
        const body = await request.json();
        const { 
            name, 
            description, 
            departmentId,
            policyType,
            isActive
        } = body;

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

        // Rate limiting
        const rateLimit = checkEFileRateLimit(userId, 'workflow_action', userId);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429 }
            );
        }

        // Validate access
        const accessValidation = await validateEFileAccess(userId, 'sla_policy', id, 'UPDATE_SLA_POLICY');
        if (!accessValidation.allowed) {
            return NextResponse.json(
                { error: accessValidation.reason },
                { status: 403 }
            );
        }

        client = await connectToDatabase();

        // Check if SLA policy exists
        const existingPolicy = await client.query(`
            SELECT * FROM efiling_sla_policies WHERE id = $1
        `, [id]);

        if (existingPolicy.rows.length === 0) {
            return NextResponse.json(
                { error: 'SLA policy not found' },
                { status: 404 }
            );
        }

        // Build update query
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramCount++}`);
            values.push(name);
        }

        if (description !== undefined) {
            updates.push(`description = $${paramCount++}`);
            values.push(description);
        }

        if (departmentId !== undefined) {
            updates.push(`department_id = $${paramCount++}`);
            values.push(departmentId || null);
        }

        if (policyType !== undefined) {
            updates.push(`policy_type = $${paramCount++}`);
            values.push(policyType);
        }

        if (isActive !== undefined) {
            updates.push(`is_active = $${paramCount++}`);
            values.push(isActive);
        }

        if (updates.length === 0) {
            return NextResponse.json(
                { error: 'No fields to update' },
                { status: 400 }
            );
        }

        values.push(id);

        // Update SLA policy
        const result = await client.query(`
            UPDATE efiling_sla_policies
            SET ${updates.join(', ')}, updated_at = NOW()
            WHERE id = $${paramCount}
            RETURNING *
        `, values);

        const updatedPolicy = result.rows[0];

        // Log the action
        await eFileActionLogger.logAction({
            entityType: 'SLA_POLICY',
            entityId: updatedPolicy.id,
            action: 'SLA_POLICY_UPDATED',
            userId: userId,
            details: {
                slaPolicyName: updatedPolicy.name,
                departmentId: updatedPolicy.department_id || 'global',
                changes: {
                    name: name !== undefined ? { from: existingPolicy.rows[0].name, to: name } : undefined,
                    description: description !== undefined ? { from: existingPolicy.rows[0].description, to: description } : undefined,
                    departmentId: departmentId !== undefined ? { from: existingPolicy.rows[0].department_id, to: departmentId } : undefined,
                    policyType: policyType !== undefined ? { from: existingPolicy.rows[0].policy_type, to: policyType } : undefined,
                    isActive: isActive !== undefined ? { from: existingPolicy.rows[0].is_active, to: isActive } : undefined
                }
            },
            ipAddress,
            userAgent
        });

        return NextResponse.json({
            success: true,
            slaPolicy: {
                id: updatedPolicy.id,
                name: updatedPolicy.name,
                description: updatedPolicy.description,
                departmentId: updatedPolicy.department_id,
                policyType: updatedPolicy.policy_type,
                isActive: updatedPolicy.is_active
            }
        });

    } catch (error) {
        console.error('Error updating SLA policy:', error);
        return NextResponse.json(
            { error: 'Failed to update SLA policy' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}

export async function DELETE(request, { params }) {
    let client;
    try {
        const { id } = await params;

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

        // Rate limiting
        const rateLimit = checkEFileRateLimit(userId, 'workflow_action', userId);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429 }
            );
        }

        // Validate access
        const accessValidation = await validateEFileAccess(userId, 'sla_policy', id, 'DELETE_SLA_POLICY');
        if (!accessValidation.allowed) {
            return NextResponse.json(
                { error: accessValidation.reason },
                { status: 403 }
            );
        }

        client = await connectToDatabase();

        // Check if SLA policy exists
        const existingPolicy = await client.query(`
            SELECT * FROM efiling_sla_policies WHERE id = $1
        `, [id]);

        if (existingPolicy.rows.length === 0) {
            return NextResponse.json(
                { error: 'SLA policy not found' },
                { status: 404 }
            );
        }

        // Check if policy is being used by any file types
        const fileTypesUsingPolicy = await client.query(`
            SELECT COUNT(*) as count FROM efiling_file_types WHERE sla_policy_id = $1
        `, [id]);

        if (parseInt(fileTypesUsingPolicy.rows[0].count) > 0) {
            return NextResponse.json(
                { error: 'Cannot delete SLA policy. It is being used by file types.' },
                { status: 400 }
            );
        }

        // Delete SLA policy (soft delete by setting is_active = false)
        const result = await client.query(`
            UPDATE efiling_sla_policies
            SET is_active = false, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id]);

        // Log the action
        await eFileActionLogger.logAction({
            entityType: 'SLA_POLICY',
            entityId: id,
            action: 'SLA_POLICY_DELETED',
            userId: userId,
            details: {
                slaPolicyName: existingPolicy.rows[0].name,
                departmentId: existingPolicy.rows[0].department_id || 'global'
            },
            ipAddress,
            userAgent
        });

        return NextResponse.json({
            success: true,
            message: 'SLA policy deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting SLA policy:', error);
        return NextResponse.json(
            { error: 'Failed to delete SLA policy' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}

