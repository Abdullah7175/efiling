/**
 * E-Filing Geographic Routing Helper Functions
 * Simplified version: Pure geography-based routing with SLA matrix
 */

export const GLOBAL_ROLE_CODES = new Set(['CEO', 'COO']);

function normaliseRoleCode(code) {
    return (code || '').toUpperCase();
}

function rolePatternMatches(roleCode, pattern) {
    const candidate = normaliseRoleCode(roleCode);
    const rawPattern = normaliseRoleCode(pattern || '');

    if (!rawPattern || rawPattern === '*') {
        return true;
    }

    if (!rawPattern.includes('*')) {
        return candidate === rawPattern;
    }

    const escaped = rawPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`);
    return regex.test(candidate);
}

function scopeMatches(scope, fileLocation, userLocation) {
    const level = (scope || 'district').toLowerCase();
    switch (level) {
        case 'global':
            return true;
        case 'division':
            return fileLocation.division_id && userLocation.division_id && Number(fileLocation.division_id) === Number(userLocation.division_id);
        case 'town':
            if (fileLocation.town_id && userLocation.town_id) {
                return Number(fileLocation.town_id) === Number(userLocation.town_id);
            }
            // Fall back to district when town information is missing
            return fileLocation.district_id && userLocation.district_id && Number(fileLocation.district_id) === Number(userLocation.district_id);
        case 'district':
        default:
            return fileLocation.district_id && userLocation.district_id && Number(fileLocation.district_id) === Number(userLocation.district_id);
    }
}

function dedupeRecipients(recipients) {
    const seen = new Set();
    return recipients.filter((recipient) => {
        if (seen.has(recipient.id)) {
            return false;
        }
        seen.add(recipient.id);
        return true;
    });
}

function pickBestScope(scopes) {
    if (!scopes || scopes.length === 0) {
        return null;
    }
    const priority = ['global', 'division', 'district', 'town'];
    const normalised = scopes.map((s) => (s || '').toLowerCase());
    for (const level of priority) {
        if (normalised.includes(level)) {
            return level;
        }
    }
    return normalised[0];
}

async function getDepartmentType(client, departmentId, fallbackDepartmentId) {
    const targetId = departmentId || fallbackDepartmentId;
    if (!targetId) {
        return 'district';
    }
    const res = await client.query(
        `SELECT department_type FROM efiling_departments WHERE id = $1`,
        [targetId]
    );
    return res.rows[0]?.department_type || 'district';
}

function buildFallbackRules(departmentType) {
    const scope = (departmentType || 'district').toLowerCase();
    return [
        {
            from_role_code: '*',
            to_role_code: '*',
            level_scope: scope === 'global' ? 'global' : scope,
        }
    ];
}

/**
 * Get users that can receive files based on geography and hierarchy
 * @param {Object} client - Database client
 * @param {Object} options - Routing options
 * @param {number} options.fromUserEfilingId - Current user's efiling_users.id
 * @param {number} options.fileId - File ID being marked
 * @param {number} options.fileDepartmentId - File's department_id
 * @param {number} options.fileDistrictId - File's district_id
 * @param {number} options.fileTownId - File's town_id
 * @param {number} options.fileDivisionId - File's division_id
 * @returns {Promise<Array>} Array of allowed users with scope metadata
 */
export async function getAllowedRecipients(client, options) {
    const {
        fromUserEfilingId,
        fileDepartmentId = null,
        fileDistrictId = null,
        fileTownId = null,
        fileDivisionId = null
    } = options;

    if (!fromUserEfilingId) {
        throw new Error('fromUserEfilingId is required');
    }

    const fromUserRes = await client.query(`
        SELECT 
            eu.id,
            eu.department_id,
            eu.district_id,
            eu.town_id,
            eu.division_id,
            r.code AS role_code,
            dept.department_type
        FROM efiling_users eu
        LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
        LEFT JOIN efiling_departments dept ON eu.department_id = dept.id
        WHERE eu.id = $1 AND eu.is_active = true
    `, [fromUserEfilingId]);

    if (fromUserRes.rows.length === 0) {
        throw new Error('Current user not found or inactive');
    }

    const fromUser = fromUserRes.rows[0];
    const fromRoleCode = normaliseRoleCode(fromUser.role_code);
    const isGlobalUser = GLOBAL_ROLE_CODES.has(fromRoleCode);

    const departmentType = await getDepartmentType(
        client,
        fileDepartmentId,
        fromUser.department_id
    );

    const baseLocation = {
        district_id: fileDistrictId || fromUser.district_id || null,
        town_id: fileTownId || fromUser.town_id || null,
        division_id: fileDivisionId || fromUser.division_id || null
    };

    // Global users can see everyone regardless of SLA rules
    if (isGlobalUser) {
        const res = await client.query(`
            SELECT DISTINCT
                eu.id,
                eu.user_id,
                u.name AS user_name,
                u.email,
                eu.efiling_role_id,
                r.code AS role_code,
                r.name AS role_name,
                eu.department_id,
                dept.name AS department_name,
                dept.department_type,
                eu.district_id,
                d.title AS district_name,
                eu.town_id,
                t.town AS town_name,
                eu.division_id,
                div.name AS division_name,
                eu.is_active
            FROM efiling_users eu
            JOIN users u ON eu.user_id = u.id
            LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
            LEFT JOIN efiling_departments dept ON eu.department_id = dept.id
            LEFT JOIN district d ON eu.district_id = d.id
            LEFT JOIN town t ON eu.town_id = t.id
            LEFT JOIN divisions div ON eu.division_id = div.id
            WHERE eu.is_active = true AND eu.id <> $1
            ORDER BY u.name ASC
        `, [fromUserEfilingId]);

        return res.rows.map((row) => ({
            ...row,
            allowed_level_scope: 'global',
            allowed_reason: 'GLOBAL_ROLE'
        }));
    }

    const matrixRes = await client.query(`
        SELECT from_role_code, to_role_code, level_scope
        FROM efiling_sla_matrix
        WHERE is_active = true
    `);

    let applicableRules = matrixRes.rows.filter((row) =>
        rolePatternMatches(fromRoleCode, row.from_role_code)
    );

    if (applicableRules.length === 0) {
        applicableRules = buildFallbackRules(departmentType);
    }

    const queryParams = [fromUserEfilingId];
    let paramIndex = 2;
    const whereClauses = ['eu.is_active = true', 'eu.id <> $1'];

    const locationClauses = [];
    if (baseLocation.division_id) {
        locationClauses.push(`eu.division_id = $${paramIndex}`);
        queryParams.push(baseLocation.division_id);
        paramIndex++;
    }
    if (baseLocation.district_id) {
        locationClauses.push(`eu.district_id = $${paramIndex}`);
        queryParams.push(baseLocation.district_id);
        paramIndex++;
    }
    if (baseLocation.town_id) {
        locationClauses.push(`eu.town_id = $${paramIndex}`);
        queryParams.push(baseLocation.town_id);
        paramIndex++;
    }

    if (locationClauses.length > 0) {
        whereClauses.push(`(${locationClauses.join(' OR ')} OR dept.department_type = 'global')`);
    }

    const candidatesQuery = `
        SELECT DISTINCT
            eu.id,
            eu.user_id,
            u.name AS user_name,
            u.email,
            eu.efiling_role_id,
            r.code AS role_code,
            r.name AS role_name,
            eu.department_id,
            dept.name AS department_name,
            dept.department_type,
            eu.district_id,
            d.title AS district_name,
            eu.town_id,
            t.town AS town_name,
            eu.division_id,
            div.name AS division_name,
            eu.is_active
        FROM efiling_users eu
        JOIN users u ON eu.user_id = u.id
        LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
        LEFT JOIN efiling_departments dept ON eu.department_id = dept.id
        LEFT JOIN district d ON eu.district_id = d.id
        LEFT JOIN town t ON eu.town_id = t.id
        LEFT JOIN divisions div ON eu.division_id = div.id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY u.name ASC
    `;

    const candidatesRes = await client.query(candidatesQuery, queryParams);

    const allowed = [];
    for (const candidate of candidatesRes.rows) {
        const candidateRoleCode = normaliseRoleCode(candidate.role_code);
        const candidateLocation = {
            district_id: candidate.district_id,
            town_id: candidate.town_id,
            division_id: candidate.division_id
        };

        const matchedScopes = applicableRules
            .filter((rule) => rolePatternMatches(candidateRoleCode, rule.to_role_code))
            .filter((rule) => scopeMatches(rule.level_scope, baseLocation, candidateLocation))
            .map((rule) => rule.level_scope || departmentType);

        if (matchedScopes.length > 0) {
            allowed.push({
                ...candidate,
                allowed_level_scope: pickBestScope(matchedScopes),
                allowed_reason: 'SLA_RULE'
            });
        }
    }

    return dedupeRecipients(allowed);
}

/**
 * Get SLA hours for a role transition from the SLA matrix
 * @param {Object} client - Database client
 * @param {string} fromRoleCode - From role code (e.g., 'WAT_XEN_SAF', 'CEO')
 * @param {string} toRoleCode - To role code (e.g., 'SE_CEN', 'CE_WAT')
 * @returns {Promise<number>} SLA hours (default: 24)
 */
export async function getSLA(client, fromRoleCode, toRoleCode) {
    const fromCode = normaliseRoleCode(fromRoleCode);
    const toCode = normaliseRoleCode(toRoleCode);

    if (!fromCode || !toCode) {
        return 24;
    }

    const rows = await client.query(`
        SELECT sla_hours, from_role_code, to_role_code
        FROM efiling_sla_matrix
        WHERE is_active = true
    `);

    for (const row of rows.rows) {
        if (rolePatternMatches(fromCode, row.from_role_code) && rolePatternMatches(toCode, row.to_role_code)) {
            return row.sla_hours || 24;
        }
    }

    return 24;
}

/**
 * Validate geographic matching between file and user based on requested scope
 * @param {Object} file - File object with district_id, town_id, division_id
 * @param {Object} user - User object with district_id, town_id, division_id
 * @param {string} levelScope - Expected scope (district | town | division | global)
 * @returns {boolean} True if geographic match is valid
 */
export function validateGeographicMatch(file, user, levelScope = 'district') {
    const fileLocation = {
        district_id: file?.district_id ?? null,
        town_id: file?.town_id ?? null,
        division_id: file?.division_id ?? null
    };

    const userLocation = {
        district_id: user?.district_id ?? null,
        town_id: user?.town_id ?? null,
        division_id: user?.division_id ?? null
    };

    return scopeMatches(levelScope, fileLocation, userLocation);
}

export function isGlobalRoleCode(roleCode) {
    return GLOBAL_ROLE_CODES.has(normaliseRoleCode(roleCode));
}

export async function getUserGeography(client, systemUserId) {
    if (!systemUserId) {
        console.error('getUserGeography: systemUserId is null or undefined');
        return null;
    }

    console.log('getUserGeography: Querying for user_id:', systemUserId);
    const res = await client.query(`
        SELECT 
            eu.id AS efiling_user_id,
            eu.user_id,
            eu.efiling_role_id,
            r.code AS role_code,
            eu.department_id,
            eu.district_id,
            eu.town_id,
            eu.subtown_id,
            eu.division_id,
            eu.is_active
        FROM efiling_users eu
        JOIN users u ON eu.user_id = u.id
        LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
        WHERE u.id = $1 AND eu.is_active = true
    `, [systemUserId]);

    if (res.rows.length === 0) {
        console.error('getUserGeography: No active e-filing user found for user_id:', systemUserId);
        // Check if user exists but is inactive
        const inactiveCheck = await client.query(`
            SELECT id, is_active FROM efiling_users WHERE user_id = $1
        `, [systemUserId]);
        if (inactiveCheck.rows.length > 0) {
            console.error('getUserGeography: User exists but is_active =', inactiveCheck.rows[0].is_active);
        } else {
            console.error('getUserGeography: User does not exist in efiling_users table');
        }
        return null;
    }
    
    console.log('getUserGeography: Found user with efiling_user_id:', res.rows[0].efiling_user_id);

    const user = res.rows[0];

    // If user has no personal geography, try to get it from role locations
    let districtId = user.district_id;
    let townId = user.town_id;
    let divisionId = user.division_id;
    const zoneIds = [];
    
    if (user.efiling_role_id) {
        try {
            // Check if efiling_role_locations table exists
            const tableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'efiling_role_locations'
                );
            `);
            
            if (tableCheck.rows[0]?.exists) {
                // Get role locations (zones, districts, towns, divisions)
                const roleLocRes = await client.query(`
                    SELECT DISTINCT 
                        zone_id,
                        district_id,
                        town_id,
                        division_id
                    FROM efiling_role_locations
                    WHERE role_id = $1
                `, [user.efiling_role_id]);
                
                // Collect zone IDs
                roleLocRes.rows.forEach(row => {
                    if (row.zone_id) {
                        zoneIds.push(row.zone_id);
                    }
                });
                
                // If user has no personal geography, use role's geography as fallback
                if (!districtId && !townId && !divisionId && roleLocRes.rows.length > 0) {
                    // Use the first role location entry (or aggregate if multiple)
                    const roleLoc = roleLocRes.rows[0];
                    if (roleLoc.division_id) divisionId = roleLoc.division_id;
                    if (roleLoc.district_id) districtId = roleLoc.district_id;
                    if (roleLoc.town_id) townId = roleLoc.town_id;
                    
                    console.log('[getUserGeography] Using role location as fallback for user_id:', systemUserId, {
                        role_id: user.efiling_role_id,
                        divisionId,
                        districtId,
                        townId,
                        zoneIds,
                        roleLocations: roleLocRes.rows
                    });
                } else if (districtId || townId || divisionId) {
                    console.log('[getUserGeography] Using personal geography for user_id:', systemUserId, {
                        divisionId,
                        districtId,
                        townId
                    });
                }
            }
        } catch (zoneError) {
            console.warn('Could not fetch role locations for user:', zoneError.message);
            // Continue without role locations - not critical
        }
    }

    return {
        ...user,
        district_id: districtId,
        town_id: townId,
        division_id: divisionId,
        role_code: normaliseRoleCode(user.role_code),
        zone_ids: zoneIds
    };
}
