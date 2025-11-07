/**
 * Safe Pattern Matching Utility
 * Port of backend's globToRegex for secure client-side file pattern matching
 * 
 * This prevents ReDoS (Regular Expression Denial of Service) attacks by:
 * 1. Escaping all regex metacharacters except glob wildcards (* and ?)
 * 2. Enforcing pattern length limits
 * 3. Validating against dangerous nested quantifiers
 */

/**
 * Create a safe regular expression with validation
 * @param {string} pattern - The regex pattern
 * @param {string} flags - Optional regex flags
 * @param {Object} options - Validation options
 * @returns {RegExp} Safe regular expression
 * @throws {Error} If pattern is unsafe or invalid
 */
function safeRegex(pattern, flags = '', options = {}) {
  const { maxLength = 200, strict = true } = options;
  
  // Validate input
  if (!pattern || typeof pattern !== 'string') {
    throw new Error('Pattern must be a non-empty string');
  }
  
  // Check pattern length
  if (pattern.length > maxLength) {
    throw new Error(`Pattern exceeds maximum length of ${maxLength} characters`);
  }
  
  // Validate flags
  const validFlags = /^[gimsuvy]*$/;
  if (flags && !validFlags.test(flags)) {
    throw new Error('Invalid regex flags');
  }
  
  if (strict) {
    // Check for dangerous patterns that can cause catastrophic backtracking
    const dangerousPatterns = [
      /(\.\*){2,}/, // Multiple .*
      /(\.\+){2,}/, // Multiple .+
      /(\*.*\*)/,    // Nested quantifiers
      /(\+.*\+)/,    // Nested quantifiers
    ];
    
    for (const dangerous of dangerousPatterns) {
      if (dangerous.test(pattern)) {
        throw new Error('Pattern contains potentially dangerous nested quantifiers');
      }
    }
  }
  
  // Try to construct the regex
  try {
    return new RegExp(pattern, flags);
  } catch (error) {
    throw new Error(`Invalid regex pattern: ${error.message}`);
  }
}

/**
 * Convert a glob pattern to a safe regular expression
 * Supports wildcards: * (match any characters) and ? (match single character)
 * 
 * @param {string} pattern - Glob pattern (e.g., "*.csv", "orders_*.json")
 * @param {boolean} caseSensitive - Whether to be case sensitive (default: false)
 * @returns {RegExp} Safe regex from glob pattern
 * 
 * @example
 * const regex = globToRegex('orders_*.csv');
 * regex.test('orders_2025.csv') // true
 * regex.test('users_2025.csv')  // false
 */
export function globToRegex(pattern, caseSensitive = false) {
  if (!pattern || typeof pattern !== 'string') {
    throw new Error('Pattern must be a non-empty string');
  }
  
  // Escape all special regex characters EXCEPT * and ?
  // This includes: . + ^ $ { } ( ) | [ ] \
  let regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape all metacharacters
    .replace(/\*/g, '.*')                   // * becomes .* (match any chars)
    .replace(/\?/g, '.');                   // ? becomes . (match single char)
  
  // Anchor the pattern to match entire string
  regexPattern = `^${regexPattern}$`;
  
  const flags = caseSensitive ? '' : 'i';
  
  // Use safeRegex with strict=false since we control the pattern transformation
  return safeRegex(regexPattern, flags, { strict: false });
}

/**
 * Check if a filename matches a glob pattern
 * @param {string} filename - The filename to check
 * @param {string} pattern - The glob pattern with wildcards
 * @returns {boolean} True if filename matches the pattern
 * 
 * @example
 * matchesPattern('orders_2025.csv', 'orders_*.csv')  // true
 * matchesPattern('orders_2025.csv', 'users_*.csv')   // false
 * matchesPattern('data.CSV', 'data.csv')             // true (case-insensitive)
 */
export function matchesPattern(filename, pattern) {
  if (!filename || !pattern) {
    return false;
  }
  
  try {
    const regex = globToRegex(pattern, false); // Case-insensitive by default
    return regex.test(filename);
  } catch (error) {
    console.error('Pattern matching error:', error);
    return false;
  }
}

/**
 * Find the first pattern that matches the filename from a list
 * Patterns are tested in order (should be pre-sorted by priority)
 * 
 * @param {string} filename - The filename to match
 * @param {Array} patterns - Array of pattern strings
 * @returns {string|null} The first matching pattern, or null if no match
 * 
 * @example
 * const patterns = ['orders_*.csv', 'users_*.csv', '*.csv'];
 * findMatchingPattern('orders_2025.csv', patterns) // 'orders_*.csv'
 */
export function findMatchingPattern(filename, patterns) {
  if (!filename || !Array.isArray(patterns)) {
    return null;
  }
  
  for (const pattern of patterns) {
    if (matchesPattern(filename, pattern)) {
      return pattern;
    }
  }
  
  return null;
}
