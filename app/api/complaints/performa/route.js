
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { Buffer } from 'buffer';
import { requireAuth } from '@/lib/authMiddleware';
// Update the path to your DB connection utility

function decodeWKBToGeoPoint(wkbHex) {
        const buffer = Buffer.from(wkbHex, 'hex');
    
        // Determine byte order: 1 = little-endian, 0 = big-endian
        const byteOrder = buffer.readUInt8(0);
        const isLittleEndian = byteOrder === 1;
    
        // Read the geometry type (next 4 bytes)
        const geometryType = isLittleEndian
            ? buffer.readUInt32LE(1)
            : buffer.readUInt32BE(1);
    
        if (geometryType !== 1) { // 1 indicates "Point"
            throw new Error('Invalid geometry type. Expected Point.');
        }
    
        // Read the coordinates (longitude and latitude as doubles)
        const readDouble = (offset) =>
            isLittleEndian ? buffer.readDoubleLE(offset) : buffer.readDoubleBE(offset);
    
        const longitude = readDouble(5); // First double (longitude)
        const latitude = readDouble(13); // Second double (latitude)
    
        // Return coordinates in "latitude,longitude" format
        return `${latitude},${longitude}`;
}

export async function GET(request) {
    // SECURITY: Require authentication
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) {
        return authResult; // Error response
    }
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    const client = await connectToDatabase();

    try {
        if (id) {
            const query = ` SELECT * 
            FROM performa_details_view
            WHERE id = $1;`;
            const result = await client.query(query, [id]);
            console.log("Work", result);

            if (result.rows.length === 0) {
                return NextResponse.json({ error: 'Data not found' }, { status: 404 });
            }

            const workDetails = result.rows[0];

            // Decode geo_tag to SRID=4326;POINT format if it exists
            if (workDetails.geo_tag) {
                try {
                    workDetails.geo_tag = decodeWKBToGeoPoint(workDetails.geo_tag);
                } catch (error) {
                    console.error('Error decoding geo_tag:', error);
                    workDetails.geo_tag = null; // Handle invalid geo_tag gracefully
                }
            }

            return NextResponse.json(workDetails, { status: 200 });
        } else {
            const query = 'SELECT * FROM work';
            const result = await client.query(query);

            return NextResponse.json(result.rows, { status: 200 });
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    } finally {
        client.release && client.release();
    }
}





