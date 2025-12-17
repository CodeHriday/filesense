/**
 * Regular Expression Validation Utility
 * 
 * Provides safe regex construction and validation to prevent ReDoS (Regular Expression Denial of Service) attacks.
 * All dynamic regex creation should use these validators.
 */

/**
 * Create a safe regular expression with validation and timeout protection
 * 
 * @param {string} pattern - The regex pattern
 * @param {string} flags - Optional regex flags (g, i, m, etc.)
 * @param {Object} options - Validation options
 * @param {number} options.maxLength - Maximum pattern length (default: 200)
 * @param {boolean} options.strict - Enable strict validation (default: true)
 * @returns {RegExp} Safe regular expression
 * @throws {Error} If pattern is unsafe or invalid
 * 
 * @example
 * const regex = safeRegex('^[a-z]+$', 'i');
 * const result = regex.test('hello');
 */
function safeRegex(pattern, flags = '', options = {}) {
  const { maxLength = 200, strict = true } = options;
  
  // Validate input
  if (!pattern || typeof pattern !== 'string') {
    throw new Error('Pattern must be a non-empty string');
  }
  
  // Check pattern length to prevent complexity attacks
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
      /(\(.*\)){2,}/, // Nested capturing groups with .*
      /(\[.*\]){2,}/, // Multiple character classes with .*
      /(\w\+){3,}/, // Repeated \w+
      /(\d\+){3,}/, // Repeated \d+
      /(a\+){3,}/, // Repeated a+
      /(\*.*\*)/,    // Nested quantifiers
      /(\+.*\+)/,    // Nested quantifiers
    ];
    
    for (const dangerous of dangerousPatterns) {
      if (dangerous.test(pattern)) {
        throw new Error('Pattern contains potentially dangerous nested quantifiers that could cause ReDoS');
      }
    }
    
    // Check for excessive alternations
    const alternationCount = (pattern.match(/\|/g) || []).length;
    if (alternationCount > 10) {
      throw new Error('Pattern contains too many alternations (limit: 10)');
    }
    
    // Check for excessive capturing groups
    const capturingGroupCount = (pattern.match(/\(/g) || []).length;
    if (capturingGroupCount > 20) {
      throw new Error('Pattern contains too many capturing groups (limit: 20)');
    }
  }
  
  // Try to construct the regex and catch syntax errors
  try {
    return new RegExp(pattern, flags);
  } catch (error) {
    throw new Error(`Invalid regex pattern: ${error.message}`);
  }
}

/**
 * Test if a regex pattern is safe (without creating it)
 * 
 * @param {string} pattern - The regex pattern to test
 * @param {Object} options - Validation options
 * @returns {Object} Result with safe flag and error message if unsafe
 * 
 * @example
 * const result = isPatternSafe('^[a-z]+$');
 * if (!result.safe) {
 *   console.error(result.error);
 * }
 */
function isPatternSafe(pattern, options = {}) {
  try {
    safeRegex(pattern, '', options);
    return { safe: true, error: null };
  } catch (error) {
    return { safe: false, error: error.message };
  }
}

/**
 * Create a regex from user input with automatic escaping
 * Useful for literal string matching with user input
 * 
 * @param {string} userInput - The user input to match literally
 * @param {string} flags - Optional regex flags
 * @returns {RegExp} Safe regular expression that matches the literal string
 * 
 * @example
 * const regex = createLiteralRegex('hello.world', 'i');
 * // Matches "hello.world" literally (dot is escaped)
 */
function createLiteralRegex(userInput, flags = '') {
  if (!userInput || typeof userInput !== 'string') {
    throw new Error('User input must be a non-empty string');
  }
  
  // Escape all special regex characters
  const escaped = userInput.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  return safeRegex(escaped, flags, { strict: false });
}

/**
 * Execute a regex test with timeout protection
 * Prevents infinite loops from catastrophic backtracking
 * 
 * @param {RegExp} regex - The regular expression
 * @param {string} input - The string to test
 * @param {number} timeout - Timeout in milliseconds (default: 1000)
 * @returns {Promise<boolean>} Test result
 * @throws {Error} If test times out
 * 
 * @example
 * const regex = /^[a-z]+$/;
 * const result = await regexTestWithTimeout(regex, 'hello', 1000);
 */
async function regexTestWithTimeout(regex, input, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Regex test timed out - possible ReDoS'));
    }, timeout);
    
    try {
      const result = regex.test(input);
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * Execute a regex match with timeout protection
 * 
 * @param {RegExp} regex - The regular expression
 * @param {string} input - The string to match
 * @param {number} timeout - Timeout in milliseconds (default: 1000)
 * @returns {Promise<Array|null>} Match result
 * @throws {Error} If match times out
 */
async function regexMatchWithTimeout(regex, input, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Regex match timed out - possible ReDoS'));
    }, timeout);
    
    try {
      const result = input.match(regex);
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * Sanitize a glob pattern for safe regex conversion
 * Converts wildcards to safe regex equivalents
 * 
 * @param {string} pattern - Glob pattern (e.g., "*.csv")
 * @param {boolean} caseSensitive - Whether to be case sensitive (default: false)
 * @returns {RegExp} Safe regex from glob pattern
 * 
 * @example
 * const regex = globToRegex('*.csv');
 * regex.test('data.csv') // true
 * regex.test('data.txt') // false
 */
function globToRegex(pattern, caseSensitive = false) {
  if (!pattern || typeof pattern !== 'string') {
    throw new Error('Pattern must be a non-empty string');
  }
  
  // Escape special regex characters except * and ?
  let regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  
  // Anchor the pattern
  regexPattern = `^${regexPattern}$`;
  
  const flags = caseSensitive ? '' : 'i';
  return safeRegex(regexPattern, flags, { strict: false });
}

/**
 * Validate regex safety without creating the RegExp object
 * This is the function used by other services to validate user-provided patterns
 * 
 * @param {string} pattern - The regex pattern to validate
 * @param {Object} options - Validation options
 * @throws {Error} If pattern is unsafe
 */
function validateRegexSafety(pattern, options = {}) {
  const result = isPatternSafe(pattern, options);
  if (!result.safe) {
    throw new Error(result.error);
  }
}

module.exports = {
  safeRegex,
  isPatternSafe,
  validateRegexSafety,
  createLiteralRegex,
  regexTestWithTimeout,
  regexMatchWithTimeout,
  globToRegex
};
