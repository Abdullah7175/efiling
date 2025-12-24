import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAuth } from '@/lib/authMiddleware';

export async function GET(request) {
    // SECURITY: Require authentication
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const client = await connectToDatabase();
    if (id) {
        try {
            const query = 'SELECT * FROM complaint_types WHERE id = $1';
            const result = await client.query(query, [id]);
            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Types not found' }, { status: 404 });
            }
            return NextResponse.json(result.rows[0], { status: 200 });
        } catch (error) {
            console.error('Error fetching data:', error);
            return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
        } finally {
            client.release && client.release();
        }
    } else {
        // Paginated list
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '20', 10);
        const offset = (page - 1) * limit;
        try {
            const countResult = await client.query('SELECT COUNT(*) FROM main');
            const total = parseInt(countResult.rows[0].count, 10);
            const query = `
                SELECT 
                w.id AS id,
                w.subject AS subject,
                w.survey_date AS survey_date,
                w.status AS status,
                t.town AS town,
                a.name AS agent,
                ct.type_name AS complaint_type,
                cst.subtype_name AS complaint_subtype
                FROM main m
                JOIN work w ON w.id = m.work_id
                JOIN agents a ON a.id = m.agent_id
                JOIN town t ON w.town_id = t.id
                JOIN complaint_types ct ON w.complaint_type_id = ct.id
                JOIN complaint_subtypes cst ON ct.id = cst.complaint_type_id
                ORDER BY w.id DESC
                LIMIT $1 OFFSET $2;
            `;
            const result = await client.query(query, [limit, offset]);
            return NextResponse.json({ data: result.rows, total }, { status: 200 });
        } catch (error) {
            console.error('Error fetching data:', error);
            return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
        } finally {
            client.release && client.release();
        }
    }
}

export async function POST(req) {
    // SECURITY: Require authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    
    const client = await connectToDatabase();

    try {
        const body = await req.json();

        const { 
            subject, district_id, town_id, site_location, size_of_pipe, 
            length_of_pipe, allied_items, associated_work, survey_date, 
            completion_date, geo_tag, assistant_id, status, shoot_date, 
            complaint_type_id, complaint_subtype_id, expenditure_charge, 
            before_image, after_image, link
        } = body;

        await client.query('BEGIN'); 

        const workData = await saveWorkDetails(
            client, subject, district_id, town_id, site_location, 
            size_of_pipe, length_of_pipe, allied_items, associated_work, 
            survey_date, completion_date, geo_tag, before_image, 
            after_image, assistant_id, shoot_date, link, expenditure_charge, 
            complaint_type_id, complaint_subtype_id, status
        );

        console.log("work data", workData);

        await client.query('COMMIT');
        return NextResponse.json({ message: 'Work and related data saved successfully', id: workData }, { status: 200 });

    } catch (error) {
        console.error('Error saving complaint:', error);
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Error saving complaint' }, { status: 500 });
    } finally {
        client.release();
    }
}


// export async function PUT(req) {
//     try {
//         const body = await req.json();
//         const client = await connectToDatabase();
//         const { id, subtype_name, complaint_type_id, description } = body;

//         if (!id || !subtype_name || !complaint_type_id || !description) {
//             return NextResponse.json({ error: 'All fields (subtype_name,complaint_type_id,description) are required' }, { status: 400 });
//         }

//         const query = `
//             UPDATE complaint_subtypes
//             SET subtype_name = $1, complaint_type_id = $2, description = $3
//             WHERE id = $4
//             RETURNING *;
//         `;
//         const { rows: updatedSubtype } = await client.query(query, [
//             subtype_name,
//             complaint_type_id,
//             description,
//             id
//         ]);

//         if (updatedSubtype.length === 0) {
//             return NextResponse.json({ error: 'Subtype not found' }, { status: 404 });
//         }

//         return NextResponse.json({ message: 'Subtype updated successfully', type: updatedSubtype[0] }, { status: 200 });

//     } catch (error) {
//         console.error('Error updating subtype:', error);
//         return NextResponse.json({ error: 'Error updating subtype' }, { status: 500 });
//     }
// }




export async function DELETE(req) {
    // SECURITY: Require authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    
    try {
        const body = await req.json();
        const client = await connectToDatabase();

        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'Complaint Id is required' }, { status: 400 });
        }

        const query = `
            DELETE FROM work 
            WHERE id = $1
            RETURNING *;
        `;

        const { rows: deletedComplaint } = await client.query(query, [id]);

        if (deletedComplaint.length === 0) {
            return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Complaint deleted successfully', user: deletedComplaint[0] }, { status: 200 });

    } catch (error) {
        console.error('Error deleting complaint:', error);
        return NextResponse.json({ error: 'Error deleting complaint' }, { status: 500 });
    }
}


async function saveWorkDetails(
    client, 
    subject,
    district_id,
    town_id,
    site_location,
    size_of_pipe,
    length_of_pipe,
    allied_items,
    associated_work,
    survey_date,
    completion_date,
    geo_tag,
    before_image,
    after_image,
    assistant_id,
    shoot_date,
    link,
    expenditure_charge,
    complaint_type_id,
    complaint_subtype_id,
    status
) {
    district_id = district_id === '' ? null : district_id;
    town_id = town_id === '' ? null : town_id;
    assistant_id = assistant_id === '' ? null : assistant_id;
    complaint_type_id = complaint_type_id === '' ? null : complaint_type_id;
    complaint_subtype_id = complaint_subtype_id === '' ? null : complaint_subtype_id;
    expenditure_charge = expenditure_charge === '' || expenditure_charge === null ? null : expenditure_charge;
    length_of_pipe = length_of_pipe === '' ? null : Number(length_of_pipe);
    link = link === '' ? null : Number(link);

    const geoArray = geo_tag.split(',');
    let latitude, longitude;

    if (geoArray.length === 2) {
        latitude = parseFloat(geoArray[0].trim());
        longitude = parseFloat(geoArray[1].trim());
    } else {
        console.error('Invalid geo_tag format');
        throw new Error('Invalid geo_tag format');
    }

    const geoPoint = `SRID=4326;POINT(${longitude} ${latitude})`;

    const query = `
        INSERT INTO work (
          subject, district_id, town_id, site_location, size_of_pipe, 
          length_of_pipe, allied_items, associated_work, survey_date, 
          completion_date, geo_tag, before_image, after_image, assistant_id, 
          shoot_date, link, expenditure_charge, complaint_type_id, 
          complaint_subtype_id, status
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        ) RETURNING id;
    `;

    try {
        const { rows } = await client.query(query, [
            subject,
            district_id,
            town_id,
            site_location,
            size_of_pipe,
            length_of_pipe,
            allied_items,
            associated_work,
            survey_date,
            completion_date,
            geoPoint,
            before_image,
            after_image,
            assistant_id,
            shoot_date,
            link,
            expenditure_charge,
            complaint_type_id,
            complaint_subtype_id,
            status
        ]);

        return rows[0].id;
    } catch (err) {
        console.error('Error inserting work details:', err);
        throw err;
    }
}

