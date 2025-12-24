// Client-side file upload validation utility

// File size limits (in bytes)
export const FILE_SIZE_LIMITS = {
  FILE: 5 * 1024 * 1024, // 5MB
  IMAGE: 5 * 1024 * 1024, // 5MB
  VIDEO: 100 * 1024 * 1024, // 100MB
};

/**
 * Validate file size based on file type
 * @param {File} file - The file to validate
 * @returns {{isValid: boolean, error?: string, maxSizeMB?: string}}
 */
export function validateFileSize(file) {
  if (!file) {
    return { isValid: false, error: 'No file provided' };
  }

  let maxSize;
  let maxSizeMB;

  if (file.type.startsWith('video/')) {
    maxSize = FILE_SIZE_LIMITS.VIDEO;
    maxSizeMB = '100MB';
  } else if (file.type.startsWith('image/')) {
    maxSize = FILE_SIZE_LIMITS.IMAGE;
    maxSizeMB = '5MB';
  } else {
    maxSize = FILE_SIZE_LIMITS.FILE;
    maxSizeMB = '5MB';
  }

  if (file.size > maxSize) {
    return {
      isValid: false,
      error: `File size exceeds limit. Maximum allowed: ${maxSizeMB}`,
      maxSizeMB
    };
  }

  return { isValid: true, maxSizeMB };
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get max size message for a file type
 * @param {string} fileType - MIME type of the file
 * @returns {string} Maximum size message
 */
export function getMaxSizeMessage(fileType) {
  if (fileType?.startsWith('video/')) {
    return 'Maximum file size: 100MB';
  } else if (fileType?.startsWith('image/')) {
    return 'Maximum file size: 5MB';
  } else {
    return 'Maximum file size: 5MB';
  }
}

