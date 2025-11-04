/**
 * Filename Pattern Validator
 * 
 * Validates that uploaded filenames match expected patterns, ignoring common timestamp formats.
 * This ensures vendors upload files with the correct naming convention as defined in their agreements.
 */

/**
 * Strip ONLY UNAMBIGUOUS trailing timestamp patterns from filenames
 * Preserves legitimate numeric segments that could be identifiers
 * 
 * Removes CLEARLY timestamps:
 * - fisher_supply_chain_20231204T153045.csv → fisher_supply_chain.csv (ISO timestamp)
 * - data_20231204_153045.csv → data.csv (date + time)
 * - orders-2023-12-04.json → orders.json (formatted date)
 * - file_1699234567890.txt → file.txt (Unix timestamp)
 * 
 * Preserves AMBIGUOUS patterns that could be legitimate:
 * - report_202312.csv → report_202312.csv (could be YYYYMM identifier, NOT removed)
 * - data_153045.csv → data_153045.csv (could be reference number, NOT removed)
 * - product_20231204.csv → product_20231204.csv (could be product code, NOT removed)
 * 
 * @param {string} filename - The filename to normalize
 * @returns {string} Filename with ONLY unambiguous timestamps removed
 */
function normalizeFilename(filename) {
  if (!filename) return '';
  
  // Extract base name and extension
  const lastDot = filename.lastIndexOf('.');
  const baseName = lastDot === -1 ? filename : filename.substring(0, lastDot);
  const extension = lastDot === -1 ? '' : filename.substring(lastDot);
  
  // ONLY match UNAMBIGUOUS timestamp patterns at the END of the basename
  // We avoid removing patterns that could be legitimate identifiers (like _202312 or _153045)
  // Only remove patterns that are CLEARLY timestamps
  const trailingTimestampPatterns = [
    // ISO timestamps with T separator (CLEARLY timestamps): _20231204T153045, -2023-12-04T15:30:45
    /[-_]\d{8}T\d{6}$/,
    /[-_]\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
    /[-_]\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/,
    
    // Combined date+time (CLEARLY timestamps): _20231204_153045, _2023-12-04_15:30:45
    /[-_]\d{8}[-_]\d{6}$/,
    /[-_]\d{4}-\d{2}-\d{2}[-_]\d{2}:\d{2}:\d{2}$/,
    /[-_]\d{4}-\d{2}-\d{2}[-_]\d{2}-\d{2}-\d{2}$/,
    /[-_]\d{4}_\d{2}_\d{2}[-_]\d{2}_\d{2}_\d{2}$/,
    
    // Unix timestamps (CLEARLY timestamps due to length): _1699234567890 (10-13 digits)
    /[-_]\d{10,13}$/,
    
    // Formatted dates with separators (CLEARLY timestamps): -2023-12-04, _2023_12_04
    /[-_]\d{4}-\d{2}-\d{2}$/,
    /[-_]\d{4}_\d{2}_\d{2}$/,
    
    // Formatted times with separators (CLEARLY timestamps): -15:30:45, _15-30-45
    /[-_]\d{2}:\d{2}:\d{2}$/,
    /[-_]\d{2}-\d{2}-\d{2}$/,
    /[-_]\d{2}_\d{2}_\d{2}$/,
    
    // NOTE: We do NOT remove the following patterns as they could be legitimate identifiers:
    // - /[-_]\d{8}$/ (could be YYYYMMDD date OR product code like _20231204)
    // - /[-_]\d{6}$/ (could be YYYYMM OR HHmmss OR reference number like _202312 or _153045)
    // - /[-_]\d{4}$/ (could be YYYY OR HHmm OR product code)
  ];
  
  let normalized = baseName;
  let changed;
  
  // Keep removing trailing timestamps until none remain
  // This handles cascading timestamps like "file_20231204_153045"
  do {
    changed = false;
    for (const pattern of trailingTimestampPatterns) {
      if (pattern.test(normalized)) {
        normalized = normalized.replace(pattern, '');
        changed = true;
        break;  // Re-check from the start after each removal
      }
    }
  } while (changed);
  
  return normalized + extension;
}

/**
 * Check if a filename matches the expected pattern
 * 
 * Supports wildcards:
 * - * matches any characters (non-greedy)
 * - ? matches single character
 * 
 * @param {string} actualFilename - The uploaded filename
 * @param {string} expectedPattern - The expected filename pattern (e.g., "orders_*.csv")
 * @returns {object} Validation result with { valid: boolean, normalizedActual: string, message: string }
 */
function validateFilename(actualFilename, expectedPattern) {
  if (!expectedPattern) {
    return {
      valid: true,
      normalizedActual: actualFilename,
      message: 'No filename pattern defined'
    };
  }
  
  // Check if expected pattern contains wildcards
  const hasWildcard = expectedPattern.includes('*') || expectedPattern.includes('?');
  
  // Strategy:
  // - If pattern has wildcards: DON'T normalize (use raw filename for wildcard matching)
  // - If pattern is exact: Normalize (remove trailing timestamps for exact comparison)
  const normalizedActual = hasWildcard ? actualFilename : normalizeFilename(actualFilename);
  
  // NEVER normalize the expected pattern - it may contain legitimate numbers
  // that look like timestamps (e.g., "report_202312.csv")
  const normalizedExpected = expectedPattern;
  
  // Case-insensitive comparison
  const actualLower = normalizedActual.toLowerCase();
  const expectedLower = normalizedExpected.toLowerCase();
  
  // Exact match (case-insensitive)
  if (actualLower === expectedLower) {
    return {
      valid: true,
      normalizedActual,
      message: 'Filename matches expected pattern'
    };
  }
  
  // Wildcard pattern matching
  // Convert pattern to regex:
  // - Escape special regex characters except * and ?
  // - Replace * with .*? (non-greedy)
  // - Replace ? with .
  const regexPattern = expectedLower
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special chars
    .replace(/\*/g, '.*?')                  // * -> .*? (non-greedy any chars)
    .replace(/\?/g, '.');                   // ? -> . (single char)
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  
  if (regex.test(actualLower)) {
    return {
      valid: true,
      normalizedActual,
      message: 'Filename matches wildcard pattern'
    };
  }
  
  // Pattern mismatch
  return {
    valid: false,
    normalizedActual,
    normalizedExpected,
    message: `Filename does not match expected pattern. Expected: "${expectedPattern}", but got: "${actualFilename}" (normalized to: "${normalizedActual}")`
  };
}

module.exports = {
  normalizeFilename,
  validateFilename
};
