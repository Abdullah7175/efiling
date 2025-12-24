import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function POST(request) {
    try {
        const { signatureData, userId, userName, signatureType, signatureColor, signatureText, signatureFont } = await request.json();
        
        if (!userId || !userName) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }
        
        // For typed signatures, signatureText is required instead of signatureData
        if (signatureType === 'typed' && !signatureText) {
            return NextResponse.json(
                { error: 'Signature text is required for typed signatures' },
                { status: 400 }
            );
        }
        
        // For drawn/scanned signatures, signatureData is required
        if (signatureType !== 'typed' && !signatureData) {
            return NextResponse.json(
                { error: 'Signature data is required' },
                { status: 400 }
            );
        }

        let publicUrl = null;
        let filename = null;
        let buffer = null;
        
        // Handle typed signatures differently
        if (signatureType === 'typed') {
            // For typed signatures, we don't need to save a file
            // The text, font, and color will be stored in the database
            publicUrl = null;
            filename = null;
            buffer = null;
        } else {
            // Convert base64 to buffer first to check size
            const base64Data = signatureData.replace(/^data:image\/png;base64,/, '');
            buffer = Buffer.from(base64Data, 'base64');
            
            // Validate file size (5MB max for signature images)
            if (buffer.length > 5 * 1024 * 1024) {
                return NextResponse.json(
                    { error: 'Signature image size exceeds limit. Maximum allowed: 5MB' },
                    { status: 400 }
                );
            }
            
            // Create user-specific folder path
            const userFolderName = userName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            
            // Handle standalone mode - get correct base directory
            let baseDir = process.cwd();
            if (baseDir.includes('.next/standalone') || baseDir.includes('.next\\standalone')) {
                // In standalone mode, go up two levels to get to project root
                baseDir = join(baseDir, '..', '..');
            }
            
            const uploadDir = join(baseDir, 'public', 'uploads', 'signatures', userFolderName);
            
            // Create directory if it doesn't exist
            if (!existsSync(uploadDir)) {
                await mkdir(uploadDir, { recursive: true });
            }

            // Generate unique filename
            const timestamp = Date.now();
            filename = `${signatureType}_${timestamp}.png`;
            const filePath = join(uploadDir, filename);
            
            await writeFile(filePath, buffer);
            
            // Verify file exists after writing
            if (!existsSync(filePath)) {
                console.error(`Failed to write signature file to disk: ${filePath}`);
                return NextResponse.json({ error: 'Failed to save signature file to disk' }, { status: 500 });
            }
            console.log(`Signature file uploaded successfully: ${filePath}`);

            // Return the public URL - Next.js serves files from public/ directly at /uploads/
            publicUrl = `/uploads/signatures/${userFolderName}/${filename}`;
        }

        // Save signature info to database with signature management
        const client = await connectToDatabase();
        
        // Check if user already has a signature of this type
        const existingSignature = await client.query(
            `SELECT id FROM efiling_user_signatures 
             WHERE user_id = $1 AND signature_type = $2`,
            [userId, signatureType]
        );

        let result;
        if (existingSignature.rows.length > 0) {
            // Update existing signature
            if (signatureType === 'typed') {
                result = await client.query(
                    `UPDATE efiling_user_signatures 
                     SET signature_name = $1, signature_text = $2, signature_font = $3, 
                         signature_color = $4, created_at = NOW()
                     WHERE user_id = $5 AND signature_type = $6
                     RETURNING id`,
                    [
                        `${signatureType}_signature`,
                        signatureText,
                        signatureFont || 'Arial',
                        signatureColor || 'black',
                        userId,
                        signatureType
                    ]
                );
            } else {
                result = await client.query(
                    `UPDATE efiling_user_signatures 
                     SET signature_name = $1, file_name = $2, file_size = $3, file_type = $4, 
                         file_url = $5, signature_data = $6, signature_color = $7, created_at = NOW()
                     WHERE user_id = $8 AND signature_type = $9
                     RETURNING id`,
                    [
                        `${signatureType}_signature`,
                        filename,
                        buffer?.length || 0,
                        'image/png',
                        publicUrl,
                        signatureData,
                        signatureColor || 'black',
                        userId,
                        signatureType
                    ]
                );
            }
        } else {
            // Check if user already has 3 signatures
            const signatureCount = await client.query(
                `SELECT COUNT(*) FROM efiling_user_signatures WHERE user_id = $1`,
                [userId]
            );

            if (parseInt(signatureCount.rows[0].count) >= 3) {
                return NextResponse.json(
                    { error: 'Maximum 3 signatures allowed per user. Please update an existing signature.' },
                    { status: 400 }
                );
            }

            // Deactivate all other signatures for this user
            await client.query(
                `UPDATE efiling_user_signatures SET is_active = false WHERE user_id = $1`,
                [userId]
            );

            // Insert new signature as active
            if (signatureType === 'typed') {
                result = await client.query(
                    `INSERT INTO efiling_user_signatures 
                     (id, user_id, signature_name, signature_type, signature_text, signature_font, signature_color, is_active, created_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW()) 
                     RETURNING id`,
                    [
                        `sig_${Date.now()}`,
                        userId,
                        `${signatureType}_signature`,
                        signatureType,
                        signatureText,
                        signatureFont || 'Arial',
                        signatureColor || 'black'
                    ]
                );
            } else {
                result = await client.query(
                    `INSERT INTO efiling_user_signatures 
                     (id, user_id, signature_name, signature_type, file_name, file_size, file_type, file_url, signature_data, signature_color, is_active, created_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW()) 
                     RETURNING id`,
                    [
                        `sig_${Date.now()}`,
                        userId,
                        `${signatureType}_signature`,
                        signatureType,
                        filename,
                        buffer?.length || 0,
                        'image/png',
                        publicUrl,
                        signatureData,
                        signatureColor || 'black'
                    ]
                );
            }
        }

        await client.release();

        return NextResponse.json({
            success: true,
            signatureId: result.rows[0].id,
            fileUrl: publicUrl,
            message: 'Signature saved successfully'
        });

    } catch (error) {
        console.error('Error uploading signature:', error);
        return NextResponse.json(
            { error: 'Failed to upload signature' },
            { status: 500 }
        );
    }
}
