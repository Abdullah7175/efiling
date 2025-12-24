import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { actionLogger, ENTITY_TYPES } from '@/lib/actionLogger';
import { auth } from '@/auth';
import {
    resolveEfilingScope,
    appendGeographyFilters,
    recordMatchesGeography,
} from '@/lib/efilingGeographyFilters';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const creator_id = searchParams.get('creator_id');
    const creator_type = searchParams.get('creator_type');
    const assigned_smagent_id = searchParams.get('assigned_smagent_id');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '0', 10);
    const offset = (page - 1) * limit;
    const filter = searchParams.get('filter') || '';
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const sortBy = searchParams.get('sortBy');
    const sortOrder = searchParams.get('sortOrder') || 'asc';
    const includeApprovalStatus = searchParams.get('include_approval_status') === 'true';
    if (id && !Number.isInteger(Number(id))) {
        return NextResponse.json(
            { error: 'Invalid request ID format' },
            { status: 400 }
        );
    }
    let client;
    try {
        console.log('Starting database connection for requests API');
        client = await connectToDatabase();
        console.log('Database connected successfully for requests API');
        
        const scopeInfo = await resolveEfilingScope(request, client, { scopeKeys: ['scope', 'efiling', 'efilingScoped'] });
        if (scopeInfo.apply && scopeInfo.error) {
            // If user doesn't have e-filing profile, return error
            return NextResponse.json({ error: scopeInfo.error.message }, { status: scopeInfo.error.status });
        }
        
        // Get user ID for potential fallback filtering
        let efilingUserId = null;
        let session = null;
        if (scopeInfo.apply) {
            session = await auth();
            if (session?.user?.id) {
                const efUserRes = await client.query(
                    'SELECT id FROM efiling_users WHERE user_id = $1 AND is_active = true',
                    [session.user.id]
                );
                efilingUserId = efUserRes.rows[0]?.id || null;
            }
        }

        if (id) {
            const numericId = Number(id);
            const query = `
                SELECT 
                    wr.*,
                    ST_Y(wr.geo_tag) as latitude,
                    ST_X(wr.geo_tag) as longitude,
                    t.district_id as town_district_id,
                    t.town as town_name,
                    st.subtown as subtown_name,
                    ct.type_name as complaint_type,
                    cst.subtype_name as complaint_subtype,
                    COALESCE(u.name, ag.name, sm.name) as creator_name,
                    wr.creator_type,
                    a.name as assigned_to_name,
                    s.name as status_name,
                    d.title as district_name,
                    exen.name as executive_engineer_name,
                    COALESCE(contractor.company_name, contractor.name) as contractor_name,
                    assistant.name as assistant_name,
                    ${includeApprovalStatus ? 'wra.approval_status,' : ''}
                    (
                        SELECT name FROM socialmediaperson WHERE id IN (
                            SELECT socialmedia_agent_id FROM request_assign_smagent WHERE work_requests_id = wr.id AND (role = 1 OR role = 3) LIMIT 1
                        )
                    ) as videographer_name,
                    (
                        SELECT json_agg(
                            json_build_object(
                                'sm_agent_id', ras.socialmedia_agent_id,
                                'status', ras.status,
                                'name', sm.name
                            )
                        ) FROM request_assign_smagent ras
                        LEFT JOIN socialmediaperson sm ON ras.socialmedia_agent_id = sm.id
                        WHERE ras.work_requests_id = wr.id
                    ) as assigned_sm_agents,
                    (
                        SELECT link FROM final_videos WHERE work_request_id = wr.id LIMIT 1
                    ) as final_video_link,
                    wr.updated_date as completion_date,
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', wrl.id,
                                'latitude', wrl.latitude,
                                'longitude', wrl.longitude,
                                'description', wrl.description
                            )
                        ) FROM work_request_locations wrl WHERE wrl.work_request_id = wr.id
                    ) as additional_locations
                FROM work_requests wr
                LEFT JOIN town t ON wr.town_id = t.id
                LEFT JOIN subtown st ON wr.subtown_id = st.id
                LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
                LEFT JOIN complaint_subtypes cst ON wr.complaint_subtype_id = cst.id
                LEFT JOIN users u ON wr.creator_type = 'user' AND wr.creator_id = u.id
                LEFT JOIN agents ag ON wr.creator_type = 'agent' AND wr.creator_id = ag.id
                LEFT JOIN socialmediaperson sm ON wr.creator_type = 'socialmedia' AND wr.creator_id = sm.id
                LEFT JOIN users a ON wr.assigned_to = a.id
                LEFT JOIN status s ON wr.status_id = s.id
                LEFT JOIN district d ON t.district_id = d.id
                LEFT JOIN agents exen ON wr.executive_engineer_id = exen.id AND exen.role = 1
                LEFT JOIN agents contractor ON wr.contractor_id = contractor.id AND contractor.role = 2
                LEFT JOIN users assistant ON wr.creator_type = 'user' AND wr.creator_id = assistant.id AND assistant.role = 5
                ${includeApprovalStatus ? 'LEFT JOIN work_request_approvals wra ON wr.id = wra.work_request_id' : ''}
                WHERE wr.id = $1
            `;
            const result = await client.query(query, [numericId]);

            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Request not found' }, { status: 404 });
            }

            const request = result.rows[0];

            // SECURITY: IDOR Fix - Check ownership or admin role
            const session = await auth();
            if (session?.user) {
                const isAdmin = [1, 2].includes(parseInt(session.user.role));
                const isCreator = request.creator_id === parseInt(session.user.id) && request.creator_type === session.user.userType;
                
                if (!isCreator && !isAdmin) {
                    return NextResponse.json({ error: 'Forbidden - You do not have access to this request' }, { status: 403 });
                }
            }

            if (scopeInfo.apply && !scopeInfo.isGlobal) {
                const allowed = recordMatchesGeography(request, scopeInfo.geography, {
                    getDistrict: (row) => row.town_district_id,
                });
                if (!allowed) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                }
            }

            return NextResponse.json(request, { status: 200 });
        } else {
            // Paginated with optional filter and creator filters
            let countQuery = `
                SELECT COUNT(*) FROM work_requests wr
                LEFT JOIN town t ON wr.town_id = t.id
                LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
                LEFT JOIN status s ON wr.status_id = s.id
                LEFT JOIN users u ON wr.creator_type = 'user' AND wr.creator_id = u.id
                LEFT JOIN agents ag ON wr.creator_type = 'agent' AND wr.creator_id = ag.id
                LEFT JOIN socialmediaperson sm ON wr.creator_type = 'socialmedia' AND wr.creator_id = sm.id
                LEFT JOIN divisions dv ON wr.division_id = dv.id
            `;
            
            let dataQuery = `
                SELECT 
                    wr.id, 
                    wr.request_date, 
                    wr.address,
                    wr.zone_id,
                    wr.division_id,
                    dv.name AS division_name,
                    ST_Y(wr.geo_tag) as latitude, 
                    ST_X(wr.geo_tag) as longitude, 
                    t.district_id as town_district_id,
                    t.town as town_name, 
                    ct.type_name as complaint_type, 
                    cst.subtype_name as complaint_subtype, 
                    wr.complaint_subtype_id, 
                    s.name as status_name,
                    s.id as status_id,
                    COALESCE(u.name, ag.name, sm.name) as creator_name,
                    wr.creator_type,
                    ceo_approval.approval_status as ceo_approval_status,
                    ceo_approval.comments as ceo_comments,
                    coo_approval.approval_status as coo_approval_status,
                    coo_approval.comments as coo_comments,
                    ce_approval.approval_status as ce_approval_status,
                    ce_approval.comments as ce_comments
                    ${includeApprovalStatus ? ', wra.approval_status' : ''}
                FROM work_requests wr
                LEFT JOIN town t ON wr.town_id = t.id
                LEFT JOIN complaint_types ct ON wr.complaint_type_id = ct.id
                LEFT JOIN complaint_subtypes cst ON wr.complaint_subtype_id = cst.id
                LEFT JOIN status s ON wr.status_id = s.id
                LEFT JOIN users u ON wr.creator_type = 'user' AND wr.creator_id = u.id
                LEFT JOIN agents ag ON wr.creator_type = 'agent' AND wr.creator_id = ag.id
                LEFT JOIN socialmediaperson sm ON wr.creator_type = 'socialmedia' AND wr.creator_id = sm.id
                LEFT JOIN divisions dv ON wr.division_id = dv.id
                LEFT JOIN work_request_soft_approvals ceo_approval ON wr.id = ceo_approval.work_request_id AND ceo_approval.approver_type = 'ceo'
                LEFT JOIN work_request_soft_approvals coo_approval ON wr.id = coo_approval.work_request_id AND coo_approval.approver_type = 'coo'
                LEFT JOIN work_request_soft_approvals ce_approval ON wr.id = ce_approval.work_request_id AND ce_approval.approver_type = 'ce'
                ${includeApprovalStatus ? 'LEFT JOIN work_request_approvals wra ON wr.id = wra.work_request_id' : ''}
            `;
            
            // Add JOIN for assigned social media agents if filtering by assigned_smagent_id
            if (assigned_smagent_id) {
                countQuery += ' JOIN request_assign_smagent ras ON wr.id = ras.work_requests_id';
                dataQuery += ' JOIN request_assign_smagent ras ON wr.id = ras.work_requests_id';
            }
            
            let whereClauses = [];
            let params = [];
            let paramIdx = 1;
            
            if (creator_id && creator_type === 'agent') {
                whereClauses.push(`(wr.contractor_id = $${paramIdx} OR wr.executive_engineer_id = $${paramIdx})`);
                params.push(creator_id);
                paramIdx += 1;
            } else if (creator_id && creator_type) {
                whereClauses.push(`wr.creator_id = $${paramIdx} AND wr.creator_type = $${paramIdx + 1}`);
                params.push(creator_id, creator_type);
                paramIdx += 2;
            }
            
            if (assigned_smagent_id) {
                whereClauses.push(`ras.socialmedia_agent_id = $${paramIdx}`);
                params.push(assigned_smagent_id);
                paramIdx += 1;
            }
            
            if (filter) {
                whereClauses.push(`(
                    CAST(wr.id AS TEXT) ILIKE $${paramIdx} OR
                    wr.address ILIKE $${paramIdx} OR
                    t.town ILIKE $${paramIdx} OR
                    ct.type_name ILIKE $${paramIdx} OR
                    s.name ILIKE $${paramIdx} OR
                    COALESCE(u.name, ag.name, sm.name) ILIKE $${paramIdx}
                )`);
                params.push(`%${filter}%`);
                paramIdx++;
            }
            
            if (dateFrom) {
                whereClauses.push(`wr.request_date >= $${paramIdx}`);
                params.push(dateFrom);
                paramIdx++;
            }
            
            if (dateTo) {
                whereClauses.push(`wr.request_date <= $${paramIdx}`);
                params.push(dateTo);
                paramIdx++;
            }
            
            let dataWhereClauses = [];
            let dataParamIdx = 1;
            let dataParams = [];
            
            if (creator_id && creator_type === 'agent') {
                dataWhereClauses.push(`(wr.contractor_id = $${dataParamIdx} OR wr.executive_engineer_id = $${dataParamIdx})`);
                dataParams.push(creator_id);
                dataParamIdx += 1;
            } else if (creator_id && creator_type) {
                dataWhereClauses.push(`wr.creator_id = $${dataParamIdx} AND wr.creator_type = $${dataParamIdx + 1}`);
                dataParams.push(creator_id, creator_type);
                dataParamIdx += 2;
            }
            
            if (assigned_smagent_id) {
                dataWhereClauses.push(`ras.socialmedia_agent_id = $${dataParamIdx}`);
                dataParams.push(assigned_smagent_id);
                dataParamIdx += 1;
            }
            
            if (filter) {
                dataWhereClauses.push(`(
                    CAST(wr.id AS TEXT) ILIKE $${dataParamIdx} OR
                    wr.address ILIKE $${dataParamIdx} OR
                    t.town ILIKE $${dataParamIdx} OR
                    dv.name ILIKE $${dataParamIdx} OR
                    ct.type_name ILIKE $${dataParamIdx} OR
                    s.name ILIKE $${dataParamIdx} OR
                    COALESCE(u.name, ag.name, sm.name) ILIKE $${dataParamIdx}
                )`);
                dataParams.push(`%${filter}%`);
                dataParamIdx++;
            }
            
            if (dateFrom) {
                dataWhereClauses.push(`wr.request_date >= $${dataParamIdx}`);
                dataParams.push(dateFrom);
                dataParamIdx++;
            }
            
            if (dateTo) {
                dataWhereClauses.push(`wr.request_date <= $${dataParamIdx}`);
                dataParams.push(dateTo);
                dataParamIdx++;
            }

            if (scopeInfo.apply && !scopeInfo.isGlobal) {
                const beforeLength = whereClauses.length;
                const geoAliases = {
                    zone: 'wr.zone_id',
                    division: 'wr.division_id',
                    town: 'wr.town_id',
                    district: 't.district_id',
                };
                
                // Log geography for debugging
                if (process.env.NODE_ENV === 'development') {
                    console.log('[DEBUG] User geography:', JSON.stringify(scopeInfo.geography, null, 2));
                }
                
                paramIdx = appendGeographyFilters(whereClauses, params, paramIdx, scopeInfo.geography, geoAliases);
                dataParamIdx = appendGeographyFilters(
                    dataWhereClauses,
                    dataParams,
                    dataParamIdx,
                    scopeInfo.geography,
                    geoAliases
                );

                if (whereClauses.length === beforeLength) {
                    // If no geography filters were added, check if user has any geography configured
                    // If user has no geography, allow query to proceed but return empty results
                    // (This is better than blocking access - user can see empty list and understand they need to configure geography)
                    const hasAnyGeo = scopeInfo.geography.divisionId || 
                                     scopeInfo.geography.townId || 
                                     scopeInfo.geography.districtId || 
                                     (scopeInfo.geography.zoneIds && scopeInfo.geography.zoneIds.length > 0);
                    
                    if (!hasAnyGeo) {
                        // User has no geography configured - return empty results instead of error
                        // This allows the frontend to display properly and show a message if needed
                        console.warn('[WARNING] User has no geography configured. Returning empty results. User ID:', session?.user?.id);
                        return NextResponse.json({ 
                            data: [], 
                            total: 0,
                            message: 'No geography configured. Please update your e-filing profile to include your division, town, or district assignment.'
                        }, { status: 200 });
                    }
                    // If geography exists but no filters were added, it might be a data mismatch
                    // Log warning but allow query to proceed
                    if (process.env.NODE_ENV === 'development') {
                        console.warn('[WARNING] Geography configured but no filters added. Geography:', scopeInfo.geography);
                    }
                }
            }
            
            if (whereClauses.length > 0) {
                countQuery += ' WHERE ' + whereClauses.join(' AND ');
            }
            if (dataWhereClauses.length > 0) {
                dataQuery += ' WHERE ' + dataWhereClauses.join(' AND ');
            }
            
            // Handle sorting (ensure deterministic ordering with tie-breakers)
            let orderBy = 'wr.request_date DESC, wr.created_date DESC, wr.id DESC'; // default
            if (sortBy) {
                const allowedSortFields = {
                    'id': 'wr.id',
                    'request_date': 'wr.request_date',
                    'address': 'wr.address',
                    'town_name': 't.town',
                    'division_name': 'dv.name',
                    'complaint_type': 'ct.type_name',
                    'status_name': 's.name'
                };
                
                if (allowedSortFields[sortBy]) {
                    const direction = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
                    orderBy = `${allowedSortFields[sortBy]} ${direction}, wr.request_date DESC, wr.created_date DESC, wr.id DESC`;
                }
            }
            
            dataQuery += ` ORDER BY ${orderBy}`;
            if (limit > 0) {
                dataQuery += ` LIMIT $${dataParamIdx} OFFSET $${dataParamIdx + 1}`;
                dataParams.push(limit, offset);
            }
            const countResult = await client.query(countQuery, params);
            const total = parseInt(countResult.rows[0].count, 10);
            const result = await client.query(dataQuery, dataParams);
            return NextResponse.json({ data: result.rows, total }, { status: 200 });
        }
    } catch (error) {
        console.error('Error fetching data:', {
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString()
        });
        
        // Check if it's a database connection error
        if (error.message.includes('timeout') || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return NextResponse.json({ 
                error: 'Database connection failed. Please try again later.' 
            }, { status: 503 });
        }
        
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    } finally {
        if (client && typeof client.release === 'function') {
            try {
                client.release();
            } catch (releaseError) {
                console.error('Error releasing database client:', releaseError);
            }
        }
    }
}

export async function POST(req) {
    let client;
    try {
        console.log('Starting database connection for POST requests API');
        client = await connectToDatabase();
        console.log('Database connected successfully for POST requests API');
        const body = await req.json();
        console.log('[POST /api/requests] Incoming payload', JSON.stringify(body, null, 2));
        const {
            town_id,
            subtown_id,
            subtown_ids, // array of additional subtowns
            division_id, // for division-based departments
            complaint_type_id,
            complaint_subtype_id,
            contact_number,
            address,
            description,
            latitude,
            longitude,
            creator_id,
            creator_type, // 'user', 'agent', 'socialmedia'
            executive_engineer_id,
            contractor_id,
            nature_of_work,
            budget_code,
            file_type,
            additional_locations // array of additional locations
        } = body;
        console.log('[POST /api/requests] Raw location inputs', {
            town_id,
            division_id,
            typeof_town_id: typeof town_id,
            typeof_division_id: typeof division_id,
        });
        // Validate required fields - town_id OR division_id must be present
        if ((!town_id && !division_id) || !complaint_type_id || !contact_number || !address || !description || !creator_id || !creator_type) {
            console.warn('[POST /api/requests] Missing required fields', {
                town_id,
                division_id,
                complaint_type_id,
                contact_number,
                addressPresent: Boolean(address),
                descriptionPresent: Boolean(description),
                creator_id,
                creator_type,
            });
            return NextResponse.json({
                error: 'Missing required fields',
                details: {
                    town_id, division_id, complaint_type_id, contact_number, address, description, creator_id, creator_type
                }
            }, { status: 400 });
        }
        // Validate creator type
        const allowedCreatorTypes = ['user', 'agent', 'socialmedia'];
        if (!allowedCreatorTypes.includes(creator_type)) {
            return NextResponse.json({
                error: 'Invalid creator type. Must be user, agent, or socialmedia',
                received: creator_type
            }, { status: 400 });
        }
        // Validate that the creator_id exists in the correct table
        let validationQuery;
        switch (creator_type) {
            case 'user':
                validationQuery = 'SELECT id FROM users WHERE id = $1';
                break;
            case 'agent':
                validationQuery = 'SELECT id FROM agents WHERE id = $1';
                break;
            case 'socialmedia':
                validationQuery = 'SELECT id FROM socialmediaperson WHERE id = $1';
                break;
        }
        const validationResult = await client.query(validationQuery, [creator_id]);
        if (validationResult.rows.length === 0) {
            return NextResponse.json({
                error: `Invalid ${creator_type} ID`,
                received: creator_id
            }, { status: 400 });
        }
        let geoTag = null;
        if (latitude && longitude) {
            geoTag = `SRID=4326;POINT(${longitude} ${latitude})`;
        }
        // --- Auto-fill contractor/executive engineer IDs for agent submissions ---
        let final_contractor_id = contractor_id;
        let final_executive_engineer_id = executive_engineer_id;
        if (creator_type === 'agent') {
            // Fetch agent role
            const agentRoleRes = await client.query('SELECT role FROM agents WHERE id = $1', [creator_id]);
            const agentRole = agentRoleRes.rows[0]?.role;
            if (Number(agentRole) === 2) {
                // Contractor: set contractor_id to own id, executive_engineer_id from form
                final_contractor_id = creator_id;
            } else if (Number(agentRole) === 1) {
                // Executive Engineer: set executive_engineer_id to own id, contractor_id from form
                final_executive_engineer_id = creator_id;
            }
        }
        // Prepare extra fields for executive_engineer_id, contractor_id, nature_of_work, budget_code, file_type
        // Base params: $1-$11 (11 params), geoTag: $12 (if present), extraFields start after that
        let extraFields = '';
        let extraValues = '';
        let extraParams = [];
        // Next param number: 12 base params ($1-$11) + 1 for geoTag (if present) = 12 or 13
        const nextParamNum = 12 + (geoTag ? 1 : 0);
        if (final_executive_engineer_id) {
            extraFields += ', executive_engineer_id';
            extraValues += ', $' + (nextParamNum + extraParams.length);
            extraParams.push(final_executive_engineer_id);
        }
        if (final_contractor_id) {
            extraFields += ', contractor_id';
            extraValues += ', $' + (nextParamNum + extraParams.length);
            extraParams.push(final_contractor_id);
        }
        if (nature_of_work) {
            extraFields += ', nature_of_work';
            extraValues += ', $' + (nextParamNum + extraParams.length);
            extraParams.push(nature_of_work);
        }
        if (budget_code) {
            extraFields += ', budget_code';
            extraValues += ', $' + (nextParamNum + extraParams.length);
            extraParams.push(budget_code);
        }
        if (file_type) {
            extraFields += ', file_type';
            extraValues += ', $' + (nextParamNum + extraParams.length);
            extraParams.push(file_type);
        }
        // Get the default "Pending" status_id
        const statusResult = await client.query('SELECT id FROM status WHERE name = $1', ['Pending']);
        const pendingStatusId = statusResult.rows[0]?.id || 1; // Default to 1 if not found

        const query = `
            INSERT INTO work_requests (
                town_id,
                subtown_id,
                division_id,
                complaint_type_id,
                complaint_subtype_id,
                contact_number,
                address,
                description,
                creator_id,
                creator_type,
                status_id,
                geo_tag${extraFields}
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ${geoTag ? `$12` : 'NULL'}${extraValues})
            RETURNING id;
        `;
        // Explicitly nullify town/subtown when division_id is present, and vice versa
        const finalTownId = division_id ? null : (town_id || null);
        const finalSubtownId = division_id ? null : (subtown_id || null);
        const finalDivisionId = division_id || null;
        
        const params = [
            finalTownId,
            finalSubtownId,
            finalDivisionId,
            complaint_type_id,
            complaint_subtype_id || null,
            contact_number,
            address,
            description,
            creator_id,
            creator_type,
            pendingStatusId
        ];
        if (geoTag) params.push(geoTag);
        params.push(...extraParams);
        console.log('[POST /api/requests] Final parameter list', {
            params,
            extraParams,
            geoTag,
            finalTownId,
            finalDivisionId,
            final_subtowns_count: Array.isArray(subtown_ids) ? subtown_ids.length : 0,
            final_additional_locations_count: Array.isArray(additional_locations) ? additional_locations.length : 0,
            final_executive_engineer_id,
            final_contractor_id,
        });

        await client.query('BEGIN');
        const result = await client.query(query, params);
        const workRequestId = result.rows[0].id;
        console.log('[POST /api/requests] Inserted request id', workRequestId);
        // Insert into work_request_subtowns if subtown_ids is present and is an array
        // Only insert if division_id is not present (division-based requests don't use subtowns)
        if (!division_id && Array.isArray(subtown_ids) && subtown_ids.length > 0) {
            for (const stId of subtown_ids) {
                await client.query(
                    'INSERT INTO work_request_subtowns (work_request_id, subtown_id) VALUES ($1, $2)',
                    [workRequestId, stId]
                );
            }
        }

        // Insert additional locations if present
        if (Array.isArray(additional_locations) && additional_locations.length > 0) {
            for (const location of additional_locations) {
                if (location.latitude && location.longitude) {
                    await client.query(
                        'INSERT INTO work_request_locations (work_request_id, latitude, longitude, description) VALUES ($1, $2, $3, $4)',
                        [workRequestId, location.latitude, location.longitude, location.description || '']
                    );
                }
            }
        }

        // CEO approval mechanism removed - new requests default to Pending status

        await client.query('COMMIT');
        
        // Log the request creation action
        await actionLogger.create(req, ENTITY_TYPES.REQUEST, workRequestId, `Request #${workRequestId}`, {
            town_id: town_id || null,
            division_id: division_id || null,
            complaint_type_id,
            complaint_subtype_id,
            creator_type,
            creator_id,
            hasLocation: !!(latitude && longitude),
            subtownCount: Array.isArray(subtown_ids) ? subtown_ids.length : 0,
            additionalLocationsCount: Array.isArray(additional_locations) ? additional_locations.length : 0,
            executive_engineer_id: final_executive_engineer_id,
            contractor_id: final_contractor_id
        });
        console.log('[POST /api/requests] Completed, action log recorded for request', workRequestId);
        
        // Insert notifications for relevant users
        try {
            // Get creator info
            let creatorName = '';
            if (creator_type === 'agent') {
                const res = await client.query('SELECT name, role FROM agents WHERE id = $1', [creator_id]);
                creatorName = res.rows[0]?.name || '';
                const creatorRole = res.rows[0]?.role;
                
                // Notify the other agent (contractor <-> executive engineer)
                if (Number(creatorRole) === 2 && final_executive_engineer_id && final_executive_engineer_id !== creator_id) {
                    // Contractor created, notify executive engineer
                    await client.query(
                        'INSERT INTO notifications (agent_id, type, entity_id, message) VALUES ($1, $2, $3, $4)',
                        [final_executive_engineer_id, 'request', workRequestId, `New work request from ${creatorName} for you.`]
                    );
                } else if (Number(creatorRole) === 1 && final_contractor_id && final_contractor_id !== creator_id) {
                    // Executive engineer created, notify contractor
                    await client.query(
                        'INSERT INTO notifications (agent_id, type, entity_id, message) VALUES ($1, $2, $3, $4)',
                        [final_contractor_id, 'request', workRequestId, `New work request from ${creatorName} for you.`]
                    );
                }
                
                // Notify all managers (role=1 or 2) and admins
                const managers = await client.query('SELECT id FROM users WHERE role IN (1,2)');
                for (const mgr of managers.rows) {
                    await client.query(
                        'INSERT INTO notifications (user_id, type, entity_id, message) VALUES ($1, $2, $3, $4)',
                        [mgr.id, 'request', workRequestId, `New work request from ${creatorName} (Agent).`]
                    );
                }
            } else if (creator_type === 'user') {
                const res = await client.query('SELECT name FROM users WHERE id = $1', [creator_id]);
                creatorName = res.rows[0]?.name || 'Manager';
                
                // Manager created, notify both contractor and executive engineer if present
                if (final_contractor_id && final_contractor_id !== creator_id) {
                    await client.query(
                        'INSERT INTO notifications (agent_id, type, entity_id, message) VALUES ($1, $2, $3, $4)',
                        [final_contractor_id, 'request', workRequestId, `New work request from ${creatorName} for you.`]
                    );
                }
                if (final_executive_engineer_id && final_executive_engineer_id !== creator_id) {
                    await client.query(
                        'INSERT INTO notifications (agent_id, type, entity_id, message) VALUES ($1, $2, $3, $4)',
                        [final_executive_engineer_id, 'request', workRequestId, `New work request from ${creatorName} for you.`]
                    );
                }
            }
        } catch (notifErr) {
            // Log but don't fail request
            console.error('Notification creation failed:', notifErr);
        }
        console.log('[POST /api/requests] Returning success response for request', workRequestId);
        return NextResponse.json({
            message: 'Work request submitted successfully',
            id: workRequestId
        }, { status: 200 });
    } catch (error) {
        if (client) {
            await client.query('ROLLBACK').catch(() => {});
        }
        console.error('Error submitting work request:', {
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString()
        });
        
        // Check if it's a database connection error
        if (error.message.includes('timeout') || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return NextResponse.json({ 
                error: 'Database connection failed. Please try again later.' 
            }, { status: 503 });
        }
        
        return NextResponse.json({ error: 'Failed to submit work request', details: error.message }, { status: 500 });
    } finally {
        if (client && typeof client.release === 'function') {
            try {
                client.release();
            } catch (releaseError) {
                console.error('Error releasing database client:', releaseError);
            }
        }
    }
}

export async function PUT(req) {
    let client;
    try {
        // SECURITY: Require authentication
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('Starting database connection for PUT requests API');
        client = await connectToDatabase();
        console.log('Database connected successfully for PUT requests API');
        const body = await req.json();
        const { 
            id,
            assigned_to,
            status_id,
            assigned_sm_agents,
            shoot_date,
            executive_engineer_id,
            contractor_id,
            budget_code,
            file_type,
            nature_of_work,
            latitude,
            longitude,
            town_id,
            subtown_id,
            complaint_type_id,
            complaint_subtype_id,
            contact_number,
            address,
            description
        } = body;

        // Fetch current request to check ownership
        const currentRequest = await client.query('SELECT creator_id, creator_type, status_id, assigned_to FROM work_requests WHERE id = $1', [id]);
        if (currentRequest.rows.length === 0) {
            return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        }

        const request = currentRequest.rows[0];

        // SECURITY: IDOR Fix - Check ownership or admin role
        const isAdmin = [1, 2].includes(parseInt(session.user.role));
        const isCreator = request.creator_id === parseInt(session.user.id) && request.creator_type === session.user.userType;
        
        if (!isCreator && !isAdmin) {
            return NextResponse.json({ error: 'Forbidden - You can only modify your own requests' }, { status: 403 });
        }

        // Fetch current status_id and assigned_to if not provided
        let finalStatusId = status_id;
        let finalAssignedTo = assigned_to;
        if (!status_id || !assigned_to) {
            if (!status_id) finalStatusId = request.status_id;
            if (!assigned_to) finalAssignedTo = request.assigned_to;
        }

        await client.query('BEGIN');

        // Handle geolocation update
        let geoTag = null;
        if (latitude !== undefined && longitude !== undefined) {
            if (latitude && longitude) {
                geoTag = `SRID=4326;POINT(${longitude} ${latitude})`;
            }
        }

        // If shoot_date is present, update it
        // shoot_date is UI-only and not stored in the database

        // Helper to validate and convert integer parameters
        const validateIntegerParam = (value, paramName) => {
            if (value === undefined || value === null) return null;
            if (value === '' || value === 'undefined' || value === 'null') return null;
            const parsed = parseInt(value, 10);
            if (isNaN(parsed) || parsed <= 0) {
                console.warn(`Invalid ${paramName} parameter: ${value}, skipping`);
                return null;
            }
            return parsed;
        };

        // Update extra fields
        const updateFields = [];
        const updateParams = [];
        let paramIdx = 3; // 1: assigned_to, 2: status_id, 3: id
        if (executive_engineer_id !== undefined && executive_engineer_id !== null && executive_engineer_id !== '') {
            const validExecEngId = validateIntegerParam(executive_engineer_id, 'executive_engineer_id');
            if (validExecEngId !== null) {
                updateFields.push(`executive_engineer_id = $${++paramIdx}`);
                updateParams.push(validExecEngId);
            }
        }
        if (contractor_id !== undefined && contractor_id !== null && contractor_id !== '') {
            const validContractorId = validateIntegerParam(contractor_id, 'contractor_id');
            if (validContractorId !== null) {
                updateFields.push(`contractor_id = $${++paramIdx}`);
                updateParams.push(validContractorId);
            }
        }
        if (budget_code !== undefined) {
            updateFields.push(`budget_code = $${++paramIdx}`);
            updateParams.push(budget_code);
        }
        if (file_type !== undefined) {
            updateFields.push(`file_type = $${++paramIdx}`);
            updateParams.push(file_type);
        }
        if (nature_of_work !== undefined) {
            updateFields.push(`nature_of_work = $${++paramIdx}`);
            updateParams.push(nature_of_work);
        }

        if (town_id !== undefined && town_id !== null && town_id !== '') {
            const validTownId = validateIntegerParam(town_id, 'town_id');
            if (validTownId !== null) {
                updateFields.push(`town_id = $${++paramIdx}`);
                updateParams.push(validTownId);
            }
        }
        if (subtown_id !== undefined && subtown_id !== null && subtown_id !== '') {
            const validSubtownId = validateIntegerParam(subtown_id, 'subtown_id');
            if (validSubtownId !== null) {
                updateFields.push(`subtown_id = $${++paramIdx}`);
                updateParams.push(validSubtownId);
            }
        }
        if (complaint_type_id !== undefined && complaint_type_id !== null && complaint_type_id !== '') {
            const validComplaintTypeId = validateIntegerParam(complaint_type_id, 'complaint_type_id');
            if (validComplaintTypeId !== null) {
                updateFields.push(`complaint_type_id = $${++paramIdx}`);
                updateParams.push(validComplaintTypeId);
            }
        }
        if (complaint_subtype_id !== undefined && complaint_subtype_id !== null && complaint_subtype_id !== '') {
            const validComplaintSubtypeId = validateIntegerParam(complaint_subtype_id, 'complaint_subtype_id');
            if (validComplaintSubtypeId !== null) {
                updateFields.push(`complaint_subtype_id = $${++paramIdx}`);
                updateParams.push(validComplaintSubtypeId);
            }
        }
        if (contact_number !== undefined) {
            updateFields.push(`contact_number = $${++paramIdx}`);
            updateParams.push(contact_number);
        }
        if (address !== undefined) {
            updateFields.push(`address = $${++paramIdx}`);
            updateParams.push(address);
        }
        if (description !== undefined) {
            updateFields.push(`description = $${++paramIdx}`);
            updateParams.push(description);
        }
        if (geoTag !== null) {
            updateFields.push(`geo_tag = $${++paramIdx}`);
            updateParams.push(geoTag);
        }

        let updateQuery = `
            UPDATE work_requests
            SET 
                assigned_to = $1,
                status_id = $2`;
        if (updateFields.length > 0) {
            updateQuery += ', ' + updateFields.join(', ');
        }
        updateQuery += `
            WHERE id = $3
            RETURNING *;
        `;

        const updateResult = await client.query(updateQuery, [
            finalAssignedTo,
            finalStatusId,
            id,
            ...updateParams
        ]);

        if (updateResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        }

        // Handle social media agent assignments
        if (assigned_sm_agents && assigned_sm_agents.length > 0) {
            await client.query('DELETE FROM request_assign_smagent WHERE work_requests_id = $1', [id]);
            for (const smAgent of assigned_sm_agents) {
                await client.query(
                    'INSERT INTO request_assign_smagent (work_requests_id, socialmedia_agent_id, status) VALUES ($1, $2, $3)',
                    [id, smAgent.sm_agent_id, smAgent.status || 1]
                );
                // Insert notification for the assigned smagent
                await client.query(
                    'INSERT INTO notifications (socialmedia_id, type, entity_id, message) VALUES ($1, $2, $3, $4)',
                    [smAgent.sm_agent_id, 'assignment', id, `You have been assigned to request #${id}.`]
                );
            }
        }

        await client.query('COMMIT');

        // Log the request update action
        await actionLogger.update(req, ENTITY_TYPES.REQUEST, id, `Request #${id}`, {
            assigned_to: finalAssignedTo,
            status_id: finalStatusId,
            shoot_date,
            executive_engineer_id,
            contractor_id,
            budget_code,
            file_type,
            nature_of_work,
            latitude,
            longitude,
            town_id,
            subtown_id,
            complaint_type_id,
            complaint_subtype_id,
            contact_number,
            address,
            description,
            smAgentsAssigned: assigned_sm_agents ? assigned_sm_agents.length : 0
        });

        return NextResponse.json({ 
            message: 'Work request updated successfully', 
            request: updateResult.rows[0] 
        }, { status: 200 });

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK').catch(() => {});
        }
        console.error('Error updating work request:', {
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString()
        });
        
        // Check if it's a database connection error
        if (error.message.includes('timeout') || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return NextResponse.json({ 
                error: 'Database connection failed. Please try again later.' 
            }, { status: 503 });
        }
        
        return NextResponse.json({ error: 'Failed to update work request' }, { status: 500 });
    } finally {
        if (client && typeof client.release === 'function') {
            try {
                client.release();
            } catch (releaseError) {
                console.error('Error releasing database client:', releaseError);
            }
        }
    }
}