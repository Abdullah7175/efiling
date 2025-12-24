import { videoArchivingSecurityManager, VIDEO_ARCHIVING_SECURITY_CONFIG } from './videoArchivingSecurity';
import { connectToDatabase } from './db';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

class SecureFileUploadManager {
    constructor() {
        this.uploadDirectory = process.env.UPLOAD_DIRECTORY || './uploads';
        this.maxFileSize = VIDEO_ARCHIVING_SECURITY_CONFIG.FILE_UPLOAD.MAX_FILE_SIZE;
        this.allowedTypes = [
            ...VIDEO_ARCHIVING_SECURITY_CONFIG.FILE_UPLOAD.ALLOWED_VIDEO_TYPES,
            ...VIDEO_ARCHIVING_SECURITY_CONFIG.FILE_UPLOAD.ALLOWED_IMAGE_TYPES,
            ...VIDEO_ARCHIVING_SECURITY_CONFIG.FILE_UPLOAD.ALLOWED_DOCUMENT_TYPES
        ];
    }

    // Validate and process file upload
    async processFileUpload(file, userId, userRole, ipAddress) {
        try {
            // Step 1: Basic file validation
            const basicValidation = this.validateBasicFileProperties(file);
            if (!basicValidation.valid) {
                await this.logSecurityEvent('FILE_UPLOAD_REJECTED', userId, ipAddress, {
                    reason: basicValidation.reason,
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type
                }, 'WARNING');
                return basicValidation;
            }

            // Step 2: Security validation using security manager
            const securityValidation = await videoArchivingSecurityManager.validateFileUpload(file, userId, userRole);
            if (!securityValidation.allowed) {
                await this.logSecurityEvent('FILE_UPLOAD_SECURITY_REJECTED', userId, ipAddress, {
                    reason: securityValidation.reason,
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type
                }, 'WARNING');
                return securityValidation;
            }

            // Step 3: Content validation
            const contentValidation = await this.validateFileContent(file);
            if (!contentValidation.valid) {
                await this.logSecurityEvent('FILE_CONTENT_REJECTED', userId, ipAddress, {
                    reason: contentValidation.reason,
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type
                }, 'WARNING');
                return contentValidation;
            }

            // Step 4: Generate secure file information
            const fileInfo = await this.generateSecureFileInfo(file, userId);
            
            // Step 5: Store file securely
            const storageResult = await this.storeFileSecurely(file, fileInfo);
            if (!storageResult.success) {
                await this.logSecurityEvent('FILE_STORAGE_FAILED', userId, ipAddress, {
                    reason: storageResult.reason,
                    fileName: file.name
                }, 'ERROR');
                return storageResult;
            }

            // Step 6: Log successful upload
            await this.logSecurityEvent('FILE_UPLOAD_SUCCESS', userId, ipAddress, {
                fileName: file.name,
                secureFileName: fileInfo.secureFileName,
                fileHash: fileInfo.fileHash,
                fileSize: file.size,
                fileType: file.type
            }, 'INFO');

            return {
                success: true,
                fileInfo,
                storagePath: storageResult.storagePath
            };

        } catch (error) {
            console.error('File upload processing error:', error);
            await this.logSecurityEvent('FILE_UPLOAD_ERROR', userId, ipAddress, {
                error: error.message,
                fileName: file.name
            }, 'ERROR');
            
            return {
                success: false,
                reason: 'File processing failed',
                error: error.message
            };
        }
    }

    // Basic file property validation
    validateBasicFileProperties(file) {
        // Check if file exists
        if (!file) {
            return { valid: false, reason: 'No file provided' };
        }

        // Check file size
        if (file.size > this.maxFileSize) {
            return { 
                valid: false, 
                reason: `File size exceeds maximum allowed size of ${this.maxFileSize / (1024 * 1024)}MB` 
            };
        }

        // Check file type
        if (!this.allowedTypes.includes(file.type)) {
            return { 
                valid: false, 
                reason: `File type ${file.type} is not allowed` 
            };
        }

        // Check file name
        if (!file.name || file.name.length > 255) {
            return { valid: false, reason: 'Invalid file name' };
        }

        // Check for suspicious file extensions
        const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js'];
        const fileExtension = path.extname(file.name).toLowerCase();
        if (suspiciousExtensions.includes(fileExtension)) {
            return { valid: false, reason: 'Suspicious file extension detected' };
        }

        return { valid: true };
    }

    // Validate file content for security
    async validateFileContent(file) {
        try {
            // Read file buffer for content analysis
            const buffer = await this.fileToBuffer(file);
            
            // Check for executable content in non-executable files
            if (this.containsExecutableContent(buffer, file.type)) {
                return { valid: false, reason: 'Executable content detected in non-executable file' };
            }

            // Check for suspicious patterns
            if (this.containsSuspiciousPatterns(buffer)) {
                return { valid: false, reason: 'Suspicious content patterns detected' };
            }

            // Validate file header matches declared type
            if (!this.validateFileHeader(buffer, file.type)) {
                return { valid: false, reason: 'File header does not match declared type' };
            }

            return { valid: true };
        } catch (error) {
            console.error('Content validation error:', error);
            return { valid: false, reason: 'Content validation failed' };
        }
    }

    // Generate secure file information
    async generateSecureFileInfo(file, userId) {
        const timestamp = Date.now();
        const randomString = crypto.randomBytes(16).toString('hex');
        const fileExtension = path.extname(file.name);
        const secureFileName = `${timestamp}_${randomString}${fileExtension}`;
        
        // Generate file hash
        const fileHash = await this.generateFileHash(file);
        
        // Generate checksum
        const checksum = await this.generateChecksum(file);
        
        return {
            originalName: file.name,
            secureFileName,
            fileHash,
            checksum,
            fileSize: file.size,
            fileType: file.type,
            uploadedBy: userId,
            uploadedAt: new Date().toISOString(),
            mimeType: file.type
        };
    }

    // Store file securely
    async storeFileSecurely(file, fileInfo) {
        try {
            // Create upload directory if it doesn't exist
            const uploadPath = path.join(this.uploadDirectory, this.getFileTypeDirectory(fileInfo.fileType));
            if (!fs.existsSync(uploadPath)) {
                fs.mkdirSync(uploadPath, { recursive: true });
            }

            // Generate secure storage path
            const storagePath = path.join(uploadPath, fileInfo.secureFileName);
            
            // Convert file to buffer and write
            const buffer = await this.fileToBuffer(file);
            fs.writeFileSync(storagePath, buffer);
            
            // Set restrictive file permissions (read-only for owner)
            fs.chmodSync(storagePath, 0o400);
            
            // Store file metadata in database
            await this.storeFileMetadata(fileInfo, storagePath);
            
            return {
                success: true,
                storagePath,
                fileInfo
            };
        } catch (error) {
            console.error('File storage error:', error);
            return {
                success: false,
                reason: 'File storage failed',
                error: error.message
            };
        }
    }

    // Helper methods
    async fileToBuffer(file) {
        if (file.buffer) {
            return file.buffer;
        }
        
        if (file.arrayBuffer) {
            return Buffer.from(await file.arrayBuffer());
        }
        
        // For multipart form data
        return new Promise((resolve, reject) => {
            const chunks = [];
            file.on('data', chunk => chunks.push(chunk));
            file.on('end', () => resolve(Buffer.concat(chunks)));
            file.on('error', reject);
        });
    }

    containsExecutableContent(buffer, mimeType) {
        // Check for common executable signatures
        const executableSignatures = [
            Buffer.from([0x4D, 0x5A]), // MZ header (Windows executables)
            Buffer.from([0x7F, 0x45, 0x4C, 0x46]), // ELF header (Linux executables)
            Buffer.from([0xFE, 0xED, 0xFA, 0xCE]), // Mach-O header (macOS executables)
        ];

        for (const signature of executableSignatures) {
            if (buffer.includes(signature)) {
                return true;
            }
        }

        return false;
    }

    containsSuspiciousPatterns(buffer) {
        const suspiciousPatterns = [
            /eval\s*\(/i,
            /document\.write/i,
            /window\.open/i,
            /<script/i,
            /javascript:/i,
            /vbscript:/i,
            /onload\s*=/i,
            /onerror\s*=/i
        ];

        const content = buffer.toString('utf8', 0, Math.min(buffer.length, 10000)); // Check first 10KB
        
        for (const pattern of suspiciousPatterns) {
            if (pattern.test(content)) {
                return true;
            }
        }

        return false;
    }

    validateFileHeader(buffer, mimeType) {
        // Basic file header validation
        const headers = {
            'image/jpeg': [0xFF, 0xD8, 0xFF],
            'image/png': [0x89, 0x50, 0x4E, 0x47],
            'image/gif': [0x47, 0x49, 0x46],
            'video/mp4': [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70],
            'application/pdf': [0x25, 0x50, 0x44, 0x46]
        };

        const expectedHeader = headers[mimeType];
        if (!expectedHeader) return true; // Skip validation for unknown types

        for (let i = 0; i < expectedHeader.length; i++) {
            if (buffer[i] !== expectedHeader[i]) {
                return false;
            }
        }

        return true;
    }

    getFileTypeDirectory(mimeType) {
        if (mimeType.startsWith('video/')) return 'videos';
        if (mimeType.startsWith('image/')) return 'images';
        if (mimeType.startsWith('application/')) return 'documents';
        return 'others';
    }

    async generateFileHash(file) {
        const buffer = await this.fileToBuffer(file);
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    async generateChecksum(file) {
        const buffer = await this.fileToBuffer(file);
        return crypto.createHash('md5').update(buffer).digest('hex');
    }

    async storeFileMetadata(fileInfo, storagePath) {
        try {
            const client = await connectToDatabase();
            
            await client.query(`
                INSERT INTO secure_files (
                    original_name, secure_name, file_hash, checksum, file_size,
                    file_type, mime_type, uploaded_by, uploaded_at, storage_path,
                    is_active, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW())
            `, [
                fileInfo.originalName,
                fileInfo.secureFileName,
                fileInfo.fileHash,
                fileInfo.checksum,
                fileInfo.fileSize,
                fileInfo.fileType,
                fileInfo.mimeType,
                fileInfo.uploadedBy,
                fileInfo.uploadedAt,
                storagePath
            ]);

            await client.release();
        } catch (error) {
            console.error('File metadata storage error:', error);
            throw error;
        }
    }

    async logSecurityEvent(eventType, userId, ipAddress, details, severity) {
        try {
            await videoArchivingSecurityManager.logSecurityEvent(
                eventType, userId, ipAddress, details, severity
            );
        } catch (error) {
            console.error('Security event logging error:', error);
        }
    }
}

// Export singleton instance
export const secureFileUploadManager = new SecureFileUploadManager();

// Export middleware function for use in API routes
export const secureFileUploadMiddleware = async (req, res, next) => {
    try {
        // This would be used in API routes to validate file uploads
        // Implementation depends on your specific API framework
        return secureFileUploadManager;
    } catch (error) {
        console.error('Secure file upload middleware error:', error);
        throw error;
    }
};
