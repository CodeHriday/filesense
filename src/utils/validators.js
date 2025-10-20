/**
 * Validate a file's format against allowed formats
 * @param {File} file - The file object to validate
 * @param {string[]} allowedFormats - Array of allowed file extensions (e.g. ['.csv', '.json'])
 * @returns {string|null} Error message if invalid, null if valid
 */
export const validateFileFormat = (file, allowedFormats) => {
  const fileName = file.name.toLowerCase();
  const isValidFormat = allowedFormats.some(format => 
    fileName.endsWith(format.toLowerCase())
  );

  if (!isValidFormat) {
    const formatList = allowedFormats.join(', ');
    return `Invalid file format. Please upload ${formatList} files.`;
  }

  return null;
};

/**
 * Validate a file's size
 * @param {File} file - The file object to validate
 * @param {number} maxSizeBytes - Maximum allowed size in bytes
 * @returns {string|null} Error message if invalid, null if valid
 */
export const validateFileSize = (file, maxSizeBytes) => {
  if (file.size > maxSizeBytes) {
    const maxSizeMB = maxSizeBytes / (1024 * 1024);
    return `File is too large. Maximum file size is ${maxSizeMB}MB.`;
  }

  return null;
};

/**
 * Validate if a value is within a specified range
 * @param {number} value - The value to check
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {boolean} True if valid, false otherwise
 */
export const isInRange = (value, min, max) => {
  const numValue = Number(value);
  return !isNaN(numValue) && numValue >= min && numValue <= max;
};

/**
 * Validate if a string matches a regex pattern
 * @param {string} value - The string to validate
 * @param {string|RegExp} pattern - Regex pattern (string or RegExp object)
 * @returns {boolean} True if valid, false otherwise
 * 
 * Note: For security, this function validates patterns to prevent ReDoS attacks.
 * If you need to match literal strings with wildcards, consider using a glob-to-regex converter.
 */
export const matchesPattern = (value, pattern) => {
  try {
    if (typeof pattern === 'string') {
      // Validate pattern length to prevent overly complex regex
      if (pattern.length > 200) {
        console.warn('Pattern too long, rejecting to prevent ReDoS');
        return false;
      }
      
      // For client-side, perform basic validation without full safe-regex library
      // Check for dangerous nested quantifiers
      const dangerousPatterns = [
        /(\.\*){2,}/, // Multiple .*
        /(\.\+){2,}/, // Multiple .+
        /(\*.*\*)/, // Nested *
        /(\+.*\+)/, // Nested +
      ];
      
      for (const dangerous of dangerousPatterns) {
        if (dangerous.test(pattern)) {
          console.warn('Pattern contains potentially dangerous nested quantifiers');
          return false;
        }
      }
      
      pattern = new RegExp(pattern);
    }
    return pattern.test(value);
  } catch (error) {
    console.error('Invalid regex pattern:', error);
    return false;
  }
};

/**
 * Validate if a value is not null or undefined
 * @param {any} value - The value to check
 * @returns {boolean} True if value is not null/undefined
 */
export const isNotNull = (value) => {
  return value !== null && value !== undefined;
};

/**
 * Validate if a string is not empty
 * @param {string} value - The string to check
 * @returns {boolean} True if string is not empty
 */
export const isNotEmpty = (value) => {
  return typeof value === 'string' && value.trim().length > 0;
};