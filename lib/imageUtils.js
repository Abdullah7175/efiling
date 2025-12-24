/**
 * Utility functions for handling image URLs with special characters
 */

/**
 * Safely encode image URL for Next.js Image component
 * @param {string} url - The image URL
 * @returns {string} - Encoded URL or fallback
 */
export function safeImageUrl(url) {
  if (!url) return '/placeholder-image.svg';
  
  try {
    // For URLs with special characters, return as-is for regular img tags
    // Next.js Image component will handle the encoding internally
    return url;
  } catch (error) {
    console.error('Error processing image URL:', error);
    return '/placeholder-image.svg';
  }
}

/**
 * Check if URL is safe for Next.js Image component
 * @param {string} url - The image URL
 * @returns {boolean} - Whether URL is safe
 */
export function isImageUrlSafe(url) {
  if (!url) return false;
  
  try {
    // Check for problematic characters
    const problematicChars = /[<>"{}|\\^`\[\]]/;
    return !problematicChars.test(url);
  } catch (error) {
    return false;
  }
}

/**
 * Get image error handler for Next.js Image component
 * @param {Function} onError - Custom error handler
 * @returns {Function} - Error handler function
 */
export function getImageErrorHandler(onError) {
  return (e) => {
    console.error('Image load error:', e.target.src);
    if (onError) {
      onError(e);
    } else {
      // Default error handling - hide image and show placeholder
      e.target.style.display = 'none';
      const placeholder = e.target.nextSibling;
      if (placeholder) {
        placeholder.style.display = 'flex';
      }
    }
  };
}

 */

/**
 * Safely encode image URL for Next.js Image component
 * @param {string} url - The image URL
 * @returns {string} - Encoded URL or fallback
 */
export function safeImageUrl(url) {
  if (!url) return '/placeholder-image.svg';
  
  try {
    // For URLs with special characters, return as-is for regular img tags
    // Next.js Image component will handle the encoding internally
    return url;
  } catch (error) {
    console.error('Error processing image URL:', error);
    return '/placeholder-image.svg';
  }
}

/**
 * Check if URL is safe for Next.js Image component
 * @param {string} url - The image URL
 * @returns {boolean} - Whether URL is safe
 */
export function isImageUrlSafe(url) {
  if (!url) return false;
  
  try {
    // Check for problematic characters
    const problematicChars = /[<>"{}|\\^`\[\]]/;
    return !problematicChars.test(url);
  } catch (error) {
    return false;
  }
}

/**
 * Get image error handler for Next.js Image component
 * @param {Function} onError - Custom error handler
 * @returns {Function} - Error handler function
 */
export function getImageErrorHandler(onError) {
  return (e) => {
    console.error('Image load error:', e.target.src);
    if (onError) {
      onError(e);
    } else {
      // Default error handling - hide image and show placeholder
      e.target.style.display = 'none';
      const placeholder = e.target.nextSibling;
      if (placeholder) {
        placeholder.style.display = 'flex';
      }
    }
  };
}
