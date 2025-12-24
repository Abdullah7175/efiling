import { auth } from '@/auth';
import { getUserGeography, isGlobalRoleCode } from './efilingGeographicRouting.js';

/**
 * Resolve whether a request should be scoped by the e-filing geography rules.
 * Returns information about the authenticated e-filing user (if any) together with
 * flags indicating whether filters should be applied.
 *
 * @param {Request} request - Next.js request object
 * @param {object} client - Database client
 * @param {object} [options]
 * @param {string[]} [options.scopeKeys=['efiling','efilingScoped']] - query param keys that trigger geography scoping
 * @returns {Promise<{apply:boolean,isGlobal?:boolean,geography?:object,error?:{status:number,message:string}}>}
 */
export async function resolveEfilingScope(request, client, options = {}) {
    const { scopeKeys = ['efiling', 'efilingScoped'] } = options;
    const searchParams = new URL(request.url).searchParams;

    const shouldScope = scopeKeys.some((key) => {
        const value = searchParams.get(key);
        if (!value) return false;
        if (value === 'true' || value === '1' || value === 'efiling') return true;
        return key === 'efiling' && value === null; // support ?scope=efiling
    });

    if (!shouldScope) {
        return { apply: false };
    }

    const session = await auth();
    if (!session?.user?.id) {
        console.error('resolveEfilingScope: No session or user ID found');
        return {
            apply: true,
            error: { status: 401, message: 'Unauthorized: e-filing user session required' },
        };
    }

    console.log('resolveEfilingScope: Checking geography for user ID:', session.user.id);
    const geography = await getUserGeography(client, session.user.id);
    if (!geography) {
        // Check if user exists in efiling_users table at all
        const checkUser = await client.query(`
            SELECT id, is_active, user_id 
            FROM efiling_users 
            WHERE user_id = $1
        `, [session.user.id]);
        
        if (checkUser.rows.length === 0) {
            console.error('resolveEfilingScope: User not found in efiling_users table for user_id:', session.user.id);
            return {
                apply: true,
                error: { status: 403, message: 'User not found in e-filing system. Please contact administrator.' },
            };
        } else if (!checkUser.rows[0].is_active) {
            console.error('resolveEfilingScope: User found but is_active = false for user_id:', session.user.id);
            return {
                apply: true,
                error: { status: 403, message: 'Your e-filing account is inactive. Please contact administrator.' },
            };
        } else {
            // User exists and is active but has no geography configured
            // Allow them to proceed but with empty geography (no filters will be applied)
            console.warn('resolveEfilingScope: User found and active but no geography configured for user_id:', session.user.id);
            return {
                apply: true,
                isGlobal: false,
                geography: {
                    divisionId: null,
                    districtId: null,
                    townId: null,
                    zoneIds: [],
                },
            };
        }
    }
    
    console.log('resolveEfilingScope: Geography found for user:', session.user.id, 'Role:', geography.role_code);

    return {
        apply: true,
        isGlobal: isGlobalRoleCode(geography.role_code),
        geography: {
            divisionId: geography.division_id || null,
            districtId: geography.district_id || null,
            townId: geography.town_id || null,
            zoneIds: Array.isArray(geography.zone_ids) ? geography.zone_ids.filter(Boolean) : [],
        },
    };
}

/**
 * Append geography-aware filters into an existing where clause builder.
 *
 * @param {string[]} whereClauses - Array of SQL condition strings (without leading AND/OR)
 * @param {any[]} params - Parameter array to mutate
 * @param {number} paramIndex - Starting parameter index (1-based)
 * @param {object} geography - Geography payload from resolveEfilingScope
 * @param {object} aliases - Column aliases for zone/division/town/district
 * @param {string} aliases.zone - Column reference for zone_id
 * @param {string} aliases.division - Column reference for division_id
 * @param {string} aliases.town - Column reference for town_id
 * @param {string} [aliases.district] - Column reference for district_id (optional)
 * @returns {number} - The next available parameter index after appending filters
 */
export function appendGeographyFilters(whereClauses, params, paramIndex, geography, aliases) {
    if (!geography) return paramIndex;

    const zoneColumn = aliases.zone;
    const divisionColumn = aliases.division;
    const townColumn = aliases.town;
    const districtColumn = aliases.district;

    const segments = [];

    // Priority 1: Zone filtering (if zones are assigned)
    if (Array.isArray(geography.zoneIds) && geography.zoneIds.length > 0 && zoneColumn) {
        segments.push(`${zoneColumn} = ANY($${paramIndex})`);
        params.push(geography.zoneIds);
        paramIndex += 1;
    }

    // Priority 2: Division filtering (for division-based users)
    // If user has division_id, they should ONLY see work requests in their division
    if (geography.divisionId && divisionColumn) {
        segments.push(`${divisionColumn} = $${paramIndex}`);
        params.push(geography.divisionId);
        paramIndex += 1;
    }

    // Priority 3: Town filtering (for town-based users, but only if not division-based)
    if (!geography.divisionId && geography.townId && townColumn) {
        segments.push(`${townColumn} = $${paramIndex}`);
        params.push(geography.townId);
        paramIndex += 1;
    }

    // Priority 4: District filtering (for district-based users, but only if not division or town-based)
    if (!geography.divisionId && !geography.townId && geography.districtId && districtColumn) {
        segments.push(`${districtColumn} = $${paramIndex}`);
        params.push(geography.districtId);
        paramIndex += 1;
    }

    if (segments.length > 0) {
        whereClauses.push(`(${segments.join(' OR ')})`);
    }

    return paramIndex;
}

/**
 * Utility to verify a single record matches the user's geography constraints.
 *
 * @param {object} record - Database record (must expose zone_id/division_id/town_id/etc)
 * @param {object} geography - Geography descriptor
 * @param {object} [options]
 * @param {function} [options.getDistrict] - Optional getter to derive district id from record
 * @returns {boolean}
 */
export function recordMatchesGeography(record, geography, options = {}) {
    if (!geography) return true;

    const { zoneIds, divisionId, townId, districtId } = geography;
    const { getDistrict } = options;

    if (divisionId && record?.division_id && Number(record.division_id) === Number(divisionId)) {
        return true;
    }

    if (townId && record?.town_id && Number(record.town_id) === Number(townId)) {
        return true;
    }

    if (Array.isArray(zoneIds) && zoneIds.length > 0 && record?.zone_id && zoneIds.includes(Number(record.zone_id))) {
        return true;
    }

    if (!townId && districtId) {
        const derivedDistrict =
            (typeof getDistrict === 'function' ? getDistrict(record) : undefined) ??
            record?.town_district_id ??
            record?.district_id ??
            null;

        if (derivedDistrict && Number(derivedDistrict) === Number(districtId)) {
            return true;
        }
    }

    return false;
}

