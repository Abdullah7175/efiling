import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { logAction } from '@/lib/actionLogger';

export async function POST(request) {
    let client;
    try {
        const formData = await request.formData();
        const signatureFile = formData.get('signatureFile');
        const userId = formData.get('userId');
        const signatureName = formData.get('signatureName');
        
        if (!signatureFile || !userId || !signatureName) {
            return NextResponse.json(
                { error: 'Signature file, user ID, and signature name are required' },
                { status: 400 }
            );
        }

        client = await connectToDatabase();
        
        // For demo purposes, we'll store the file info in the database
        // In production, you would upload the file to a cloud storage service
        const fileName = signatureFile.name;
        const fileSize = signatureFile.size;
        const fileType = signatureFile.type;
        
        // Generate a unique signature ID
        const signatureId = Date.now().toString();
        
        // Store signature information in the database
        const result = await client.query(`
            INSERT INTO efiling_user_signatures (
                id, user_id, signature_name, signature_type, file_name, 
                file_size, file_type, created_at, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), true)
            RETURNING *
        `, [signatureId, userId, signatureName, 'scanned', fileName, fileSize, fileType]);
        
        const signature = result.rows[0];
        
        // Log the action
        await logAction('CREATE_SCANNED_SIGNATURE', `User ${userId} created scanned signature: ${signatureName}`, userId);
        
        // In production, you would also:
        // 1. Upload the file to cloud storage (AWS S3, Google Cloud Storage, etc.)
        // 2. Store the file URL in the database
        // 3. Process the image (resize, optimize, etc.)
        
        console.log(`Scanned signature created: ${signatureName} for user ${userId}`);
        
        return NextResponse.json({
            success: true,
            signature: {
                id: signature.id,
                name: signature.signature_name,
                type: signature.signature_type,
                fileName: signature.file_name,
                createdAt: signature.created_at
            }
        });
        
    } catch (error) {
        console.error('Error creating scanned signature:', error);
        return NextResponse.json(
            { error: 'Failed to create scanned signature' },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.release();
        }
    }
}
