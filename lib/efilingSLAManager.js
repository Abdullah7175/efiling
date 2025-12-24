/**
 * E-Filing SLA (TAT) Management Utility
 * 
 * Handles SLA pause/resume logic for CEO review workflow
 * When file reaches CEO, SLA timer pauses
 * When CEO forwards file, SLA timer resumes
 */

/**
 * Check if a role is CEO
 * @param {string} roleCode - Role code from efiling_roles
 * @returns {boolean}
 */
export function isCEORole(roleCode) {
    if (!roleCode) return false;
    const ceoRoles = ['CEO', 'CEO_GROUP'];
    return ceoRoles.includes(roleCode.toUpperCase());
}

/**
 * Pause SLA timer for a file (workflow-free)
 */
export async function pauseSLA(client, fileId, _workflowId = null, userId = null, _stageId = null, reason = 'MANUAL_PAUSE') {
    try {
        // Check if SLA columns exist
        let hasSlaPaused = false;
        let hasSlaPausedAt = false;
        let hasSlaPauseCount = false;
        let hasSlaPauseHistoryTable = false;
        
        try {
            const [slaPausedCheck, slaPausedAtCheck, slaPauseCountCheck, historyTableCheck] = await Promise.all([
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_paused'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_paused_at'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_pause_count'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_sla_pause_history'
                    );
                `)
            ]);
            hasSlaPaused = slaPausedCheck.rows[0]?.exists || false;
            hasSlaPausedAt = slaPausedAtCheck.rows[0]?.exists || false;
            hasSlaPauseCount = slaPauseCountCheck.rows[0]?.exists || false;
            hasSlaPauseHistoryTable = historyTableCheck.rows[0]?.exists || false;
        } catch (checkError) {
            console.warn('Could not check for SLA columns:', checkError.message);
            // If we can't check, assume columns don't exist and return early
            return;
        }

        // If SLA columns don't exist, skip pause operation
        if (!hasSlaPaused) {
            console.warn('SLA pause columns do not exist, skipping pause operation');
            return;
        }

        const fileRes = await client.query(`
            SELECT ${hasSlaPaused ? 'sla_paused' : 'false as sla_paused'}
            FROM efiling_files
            WHERE id = $1
        `, [fileId]);

        if (fileRes.rows.length === 0) {
            console.error('File not found for SLA pause');
            return;
        }

        const file = fileRes.rows[0];
        if (file.sla_paused) {
            return;
        }

        // Build update query based on available columns
        const updateColumns = ['updated_at = NOW()'];
        const updateParams = [];
        
        if (hasSlaPaused) updateColumns.push('sla_paused = TRUE');
        if (hasSlaPausedAt) updateColumns.push('sla_paused_at = NOW()');
        if (hasSlaPauseCount) updateColumns.push('sla_pause_count = COALESCE(sla_pause_count, 0) + 1');
        
        updateParams.push(fileId);
        
        await client.query(`
            UPDATE efiling_files
            SET ${updateColumns.join(', ')}
            WHERE id = $${updateParams.length}
        `, updateParams);

        // Insert into history table only if it exists
        if (hasSlaPauseHistoryTable) {
            try {
                await client.query(`
                    INSERT INTO efiling_sla_pause_history (
                        file_id, paused_at, pause_reason, paused_by_user_id
                    ) VALUES ($1, NOW(), $2, $3)
                `, [fileId, reason, userId]);
            } catch (historyError) {
                console.warn('Could not insert into SLA pause history:', historyError.message);
                // Don't fail the whole operation if history insert fails
            }
        }
    } catch (error) {
        console.error('Error pausing SLA:', error);
        // Don't throw - allow operation to continue even if SLA pause fails
        console.warn('SLA pause failed, but continuing with file operation');
    }
}

/**
 * Resume SLA timer for a file (workflow-free)
 */
export async function resumeSLA(client, fileId, _workflowId = null, slaExtensionHours = null) {
    try {
        // Check if SLA columns exist
        let hasSlaPaused = false;
        let hasSlaPausedAt = false;
        let hasSlaDeadline = false;
        let hasSlaAccumulatedHours = false;
        let hasSlaPauseHistoryTable = false;
        
        try {
            const [slaPausedCheck, slaPausedAtCheck, slaDeadlineCheck, slaAccumulatedHoursCheck, historyTableCheck] = await Promise.all([
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_paused'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_paused_at'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_deadline'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_accumulated_hours'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_sla_pause_history'
                    );
                `)
            ]);
            hasSlaPaused = slaPausedCheck.rows[0]?.exists || false;
            hasSlaPausedAt = slaPausedAtCheck.rows[0]?.exists || false;
            hasSlaDeadline = slaDeadlineCheck.rows[0]?.exists || false;
            hasSlaAccumulatedHours = slaAccumulatedHoursCheck.rows[0]?.exists || false;
            hasSlaPauseHistoryTable = historyTableCheck.rows[0]?.exists || false;
        } catch (checkError) {
            console.warn('Could not check for SLA columns:', checkError.message);
            // If we can't check, assume columns don't exist and return early
            return;
        }

        // If SLA columns don't exist, skip resume operation
        if (!hasSlaPaused) {
            console.warn('SLA resume columns do not exist, skipping resume operation');
            return;
        }

        const selectColumns = [];
        if (hasSlaPaused) selectColumns.push('sla_paused');
        if (hasSlaPausedAt) selectColumns.push('sla_paused_at');
        if (hasSlaDeadline) selectColumns.push('sla_deadline');
        if (hasSlaAccumulatedHours) selectColumns.push('sla_accumulated_hours');
        
        const fileRes = await client.query(`
            SELECT ${selectColumns.length > 0 ? selectColumns.join(', ') : 'id'}
            FROM efiling_files
            WHERE id = $1
        `, [fileId]);

        if (fileRes.rows.length === 0) {
            console.error('File not found for SLA resume');
            return;
        }

        const file = fileRes.rows[0];
        if (!file.sla_paused || (hasSlaPausedAt && !file.sla_paused_at)) {
            return;
        }

        const now = new Date();
        const pausedAt = hasSlaPausedAt && file.sla_paused_at ? new Date(file.sla_paused_at) : now;
        const pauseDurationHours = (now - pausedAt) / (1000 * 60 * 60);
        const additionalHours = slaExtensionHours ?? pauseDurationHours;

        // Update history table only if it exists
        if (hasSlaPauseHistoryTable) {
            try {
                await client.query(`
                    UPDATE efiling_sla_pause_history
                    SET resumed_at = NOW(),
                        duration_hours = $1,
                        updated_at = NOW()
                    WHERE id = (
                        SELECT id FROM efiling_sla_pause_history
                        WHERE file_id = $2 AND resumed_at IS NULL
                        ORDER BY paused_at DESC
                        LIMIT 1
                    )
                `, [pauseDurationHours, fileId]);
            } catch (historyError) {
                console.warn('Could not update SLA pause history:', historyError.message);
                // Don't fail the whole operation if history update fails
            }
        }

        // Build update query based on available columns
        const updateColumns = ['updated_at = NOW()'];
        const updateParams = [];
        
        if (hasSlaPaused) updateColumns.push('sla_paused = FALSE');
        if (hasSlaPausedAt) updateColumns.push('sla_paused_at = NULL');
        if (hasSlaDeadline) {
            updateColumns.push(`sla_deadline = CASE WHEN sla_deadline IS NOT NULL THEN sla_deadline + ($${updateParams.length + 1} * INTERVAL '1 hour') ELSE NULL END`);
            updateParams.push(additionalHours);
        }
        if (hasSlaAccumulatedHours) {
            updateColumns.push(`sla_accumulated_hours = COALESCE(sla_accumulated_hours, 0) + $${updateParams.length + 1}`);
            updateParams.push(pauseDurationHours);
        }
        
        updateParams.push(fileId);
        
        await client.query(`
            UPDATE efiling_files
            SET ${updateColumns.join(', ')}
            WHERE id = $${updateParams.length}
        `, updateParams);
    } catch (error) {
        console.error('Error resuming SLA:', error);
        // Don't throw - allow operation to continue even if SLA resume fails
        console.warn('SLA resume failed, but continuing with file operation');
    }
}

/**
 * Get current SLA status for a file
 */
export async function getSLAStatus(client, fileId) {
    try {
        // Check if SLA columns exist
        let hasSlaDeadline = false;
        let hasSlaPaused = false;
        let hasSlaPausedAt = false;
        let hasSlaAccumulatedHours = false;
        let hasSlaPauseCount = false;
        
        try {
            const [slaDeadlineCheck, slaPausedCheck, slaPausedAtCheck, slaAccumulatedHoursCheck, slaPauseCountCheck] = await Promise.all([
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_deadline'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_paused'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_paused_at'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_accumulated_hours'
                    );
                `),
                client.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'efiling_files'
                        AND column_name = 'sla_pause_count'
                    );
                `)
            ]);
            hasSlaDeadline = slaDeadlineCheck.rows[0]?.exists || false;
            hasSlaPaused = slaPausedCheck.rows[0]?.exists || false;
            hasSlaPausedAt = slaPausedAtCheck.rows[0]?.exists || false;
            hasSlaAccumulatedHours = slaAccumulatedHoursCheck.rows[0]?.exists || false;
            hasSlaPauseCount = slaPauseCountCheck.rows[0]?.exists || false;
        } catch (checkError) {
            console.warn('Could not check for SLA columns:', checkError.message);
            // Return null if we can't check
            return null;
        }

        const selectColumns = [];
        if (hasSlaDeadline) selectColumns.push('sla_deadline');
        if (hasSlaPaused) selectColumns.push('sla_paused');
        if (hasSlaPausedAt) selectColumns.push('sla_paused_at');
        if (hasSlaAccumulatedHours) selectColumns.push('sla_accumulated_hours');
        if (hasSlaPauseCount) selectColumns.push('sla_pause_count');
        
        // If no SLA columns exist, return null
        if (selectColumns.length === 0) {
            return null;
        }

        const res = await client.query(`
            SELECT ${selectColumns.join(', ')}
            FROM efiling_files
            WHERE id = $1
        `, [fileId]);

        return res.rows[0] || null;
    } catch (error) {
        console.error('Error getting SLA status:', error);
        return null;
    }
}

/**
 * Calculate effective SLA time remaining based on file-level data
 * Updated to handle team workflow - no TAT for team internal files
 */
export function calculateEffectiveSLA(record, workflowState = null) {
    if (!record) {
        return {
            status: 'UNKNOWN',
            message: 'No SLA data found'
        };
    }
    
    // If file is within team workflow, no TAT applies
    if (workflowState && workflowState.is_within_team && workflowState.current_state === 'TEAM_INTERNAL') {
        return {
            status: 'TEAM_INTERNAL',
            message: 'File is within team workflow - TAT not applicable',
            isTeamInternal: true
        };
    }

    if (record.sla_paused) {
        return {
            status: 'PAUSED',
            reason: 'SLA paused',
            accumulatedHours: record.sla_accumulated_hours || 0,
            pausedAt: record.sla_paused_at,
            pauseCount: record.sla_pause_count || 0
        };
    }

    if (!record.sla_deadline) {
        return {
            status: 'PENDING',
            message: 'No SLA deadline set'
        };
    }

    const now = Date.now();
    const deadline = new Date(record.sla_deadline).getTime();
    const remainingHours = (deadline - now) / (1000 * 60 * 60);
    const accumulated = parseFloat(record.sla_accumulated_hours) || 0;

    return {
        status: remainingHours < 0 ? 'BREACHED' : 'ACTIVE',
        remainingHours: Math.round(remainingHours * 100) / 100,
        accumulatedHours: accumulated,
        deadline: record.sla_deadline,
        breached: remainingHours < 0
    };
}

