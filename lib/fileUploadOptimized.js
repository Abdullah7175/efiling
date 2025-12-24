import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

// Configuration for file uploads
export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB for files and images
  MAX_VIDEO_SIZE: 100 * 1024 * 1024, // 100MB for videos
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB for images
  CHUNK_SIZE: 64 * 1024 * 1024, // 64MB chunks for processing
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/mkv', 'video/webm', 'video/avi', 'video/mov', 'video/m4v', 'video/quicktime', 'video/wmv'],
  ALLOWED_FILE_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/jpg'],
  UPLOAD_DIRS: {
    images: 'uploads/images',
    videos: 'uploads/videos',
    finalVideos: 'uploads/final-videos',
    beforeImages: 'uploads/before-images'
  }
};

// Ensure upload directory exists
export async function ensureUploadDir(uploadPath) {
  try {
    await fs.mkdir(uploadPath, { recursive: true });
    return true;
  } catch (error) {
    console.error('Error creating upload directory:', error);
    return false;
  }
}

// Sanitize filename by removing special characters and spaces
function sanitizeFilename(filename) {
  // Remove file extension
  const ext = path.extname(filename);
  let name = path.basename(filename, ext);
  
  // Replace spaces with hyphens
  name = name.replace(/\s+/g, '-');
  
  // Remove special characters except hyphens and underscores
  name = name.replace(/[^a-zA-Z0-9-_]/g, '');
  
  // Remove multiple consecutive hyphens
  name = name.replace(/-+/g, '-');
  
  // Remove leading/trailing hyphens
  name = name.replace(/^-+|-+$/g, '');
  
  // If name is empty after sanitization, use a default
  if (!name) {
    name = 'file';
  }
  
  // Limit length to 50 characters
  if (name.length > 50) {
    name = name.substring(0, 50);
  }
  
  return name + ext;
}

// Generate unique filename
export function generateUniqueFilename(originalName) {
  const timestamp = Date.now();
  const randomSuffix = Math.round(Math.random() * 1e9);
  const ext = path.extname(originalName);
  const sanitizedName = sanitizeFilename(originalName);
  const nameWithoutExt = path.basename(sanitizedName, ext);
  
  return `${nameWithoutExt}-${timestamp}-${randomSuffix}${ext}`;
}

// Validate file type and size
export function validateFile(file, allowedTypes, maxSize = null) {
  const errors = [];
  
  if (!file) {
    errors.push('No file provided');
    return { isValid: false, errors };
  }
  
  // Determine max size based on file type if not provided
  if (!maxSize) {
    if (file.type.startsWith('video/')) {
      maxSize = UPLOAD_CONFIG.MAX_VIDEO_SIZE;
    } else if (file.type.startsWith('image/')) {
      maxSize = UPLOAD_CONFIG.MAX_IMAGE_SIZE;
    } else {
      maxSize = UPLOAD_CONFIG.MAX_FILE_SIZE;
    }
  }
  
  if (file.size > maxSize) {
    const maxSizeMB = maxSize === UPLOAD_CONFIG.MAX_VIDEO_SIZE ? '100MB' : '5MB';
    errors.push(`File size exceeds limit of ${maxSizeMB}. Maximum allowed: ${maxSizeMB}`);
  }
  
  if (allowedTypes && !allowedTypes.includes(file.type)) {
    errors.push(`File type ${file.type} is not allowed`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Validate file size only (for client-side use)
export function validateFileSize(file) {
  if (!file) {
    return { isValid: false, error: 'No file provided' };
  }
  
  let maxSize;
  let maxSizeMB;
  
  if (file.type.startsWith('video/')) {
    maxSize = UPLOAD_CONFIG.MAX_VIDEO_SIZE;
    maxSizeMB = '100MB';
  } else if (file.type.startsWith('image/')) {
    maxSize = UPLOAD_CONFIG.MAX_IMAGE_SIZE;
    maxSizeMB = '5MB';
  } else {
    maxSize = UPLOAD_CONFIG.MAX_FILE_SIZE;
    maxSizeMB = '5MB';
  }
  
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: `File size exceeds limit. Maximum allowed: ${maxSizeMB}`
    };
  }
  
  return { isValid: true };
}

// Format file size for display
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Save file with streaming for large files
export async function saveFileStream(file, uploadPath, filename) {
  try {
    const filePath = path.join(uploadPath, filename);
    
    // Ensure directory exists
    await ensureUploadDir(uploadPath);
    
    // For large files, we'll use a streaming approach
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    await fs.writeFile(filePath, buffer);
    
    // Verify file exists after writing
    try {
      await fs.access(filePath);
    } catch (accessError) {
      console.error(`File verification failed: ${filePath}`, accessError);
      return {
        success: false,
        error: 'File was written but verification failed'
      };
    }
    
    return {
      success: true,
      filePath,
      filename,
      size: file.size
    };
  } catch (error) {
    console.error('Error saving file:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Process multiple files with progress tracking
export async function processMultipleFiles(files, uploadPath, options = {}) {
  const results = [];
  const { maxConcurrent = 3, onProgress } = options;
  
  // Process files in batches to avoid overwhelming the system
  for (let i = 0; i < files.length; i += maxConcurrent) {
    const batch = files.slice(i, i + maxConcurrent);
    
    const batchPromises = batch.map(async (file, index) => {
      const globalIndex = i + index;
      
      try {
        const filename = generateUniqueFilename(file.name);
        const result = await saveFileStream(file, uploadPath, filename);
        
        if (onProgress) {
          onProgress(globalIndex + 1, files.length, file.name);
        }
        
        return {
          ...result,
          originalName: file.name,
          index: globalIndex
        };
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        return {
          success: false,
          error: error.message,
          originalName: file.name,
          index: globalIndex
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  return results;
}

// Database connection with retry logic for large file uploads
export async function getDatabaseConnectionWithRetry(maxRetries = 5) {
  const { connectToDatabase } = await import('@/lib/db');
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = await connectToDatabase();
      
      // Test the connection
      await client.query('SELECT 1');
      
      return client;
    } catch (error) {
      console.error(`Database connection attempt ${i + 1} failed:`, error);
      
      if (i === maxRetries - 1) {
        throw new Error(`Failed to connect to database after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Wait before retrying (exponential backoff)
      const delay = Math.min(Math.pow(2, i) * 1000, 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Enhanced error response
export function createErrorResponse(message, status = 500, details = null) {
  return NextResponse.json({
    error: message,
    details,
    timestamp: new Date().toISOString()
  }, { status });
}

// Success response with metadata
export function createSuccessResponse(data, message = 'Success') {
  return NextResponse.json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
}

// Clean up old temporary files
export async function cleanupTempFiles(uploadPath, maxAge = 24 * 60 * 60 * 1000) { // 24 hours
  try {
    const files = await fs.readdir(uploadPath);
    const now = Date.now();
    
    for (const file of files) {
      const filePath = path.join(uploadPath, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        await fs.unlink(filePath);
        console.log(`Cleaned up old file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
  }
}
