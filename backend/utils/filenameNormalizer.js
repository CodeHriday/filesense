/**
 * Filename Normalization Utility
 * Creates canonical filenames for logical file grouping across uploads
 * Handles vendor file timestamps, GUIDs, and other transient tokens
 */

/**
 * Normalize a filename to create a canonical name for grouping
 * Strips timestamps, GUIDs, and converts to lowercase
 * Uses length-limited regex patterns to prevent ReDoS attacks
 * @param {string} filename - Original filename
 * @param {string} filePattern - Optional file pattern for additional context
 * @returns {string} Canonical filename
 */
function normalizeFilename(filename, filePattern = null) {
  if (!filename) return '';
  
  // Split filename into base and extension
  const lastDotIndex = filename.lastIndexOf('.');
  const hasExtension = lastDotIndex > 0;
  const baseName = hasExtension ? filename.substring(0, lastDotIndex) : filename;
  const extension = hasExtension ? filename.substring(lastDotIndex) : '';
  
  let normalized = baseName;
  
  // Remove common timestamp patterns
  // Pattern 1: _YYYYMMDDTHHMMSS (ISO-like timestamps)
  normalized = normalized.replace(/_\d{8}T\d{6}$/i, '');
  
  // Pattern 2: _YYYYMMDD_HHMMSS
  normalized = normalized.replace(/_\d{8}_\d{6}$/i, '');
  
  // Pattern 3: _YYYYMMDD-HHMMSS
  normalized = normalized.replace(/_\d{8}-\d{6}$/i, '');
  
  // Pattern 4: _YYYYMMDD
  normalized = normalized.replace(/_\d{8}$/i, '');
  
  // Pattern 5: _YYYY-MM-DD
  normalized = normalized.replace(/_\d{4}-\d{2}-\d{2}$/i, '');
  
  // Pattern 6: _YYYYMMDDHHMMSS (no separator)
  normalized = normalized.replace(/_\d{14}$/i, '');
  
  // Pattern 7: Trailing timestamps with milliseconds (limit to reasonable length)
  normalized = normalized.replace(/_\d{13,20}$/i, '');
  
  // Remove UUID/GUID patterns (8-4-4-4-12 hex digits)
  normalized = normalized.replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '');
  
  // Remove common sequential numbers at the end (e.g., _001, _1, _v2, etc.)
  normalized = normalized.replace(/_v?\d{1,10}$/i, '');
  
  // Remove multiple consecutive underscores or hyphens (limit to prevent ReDoS)
  normalized = normalized.replace(/[_-]{2,20}/g, '_');
  
  // Remove trailing underscores or hyphens (limit to prevent ReDoS)
  normalized = normalized.replace(/[_-]{1,10}$/, '');
  
  // Convert to lowercase for case-insensitive matching
  normalized = normalized.toLowerCase();
  
  // Combine with extension (also lowercase)
  return normalized + extension.toLowerCase();
}

/**
 * Create a logical file group ID from project and canonical name
 * @param {number} projectId - Project ID
 * @param {string} canonicalName - Canonical filename
 * @returns {string} Logical file ID
 */
function createLogicalFileId(projectId, canonicalName) {
  // Create a consistent ID format
  const sanitized = canonicalName.replace(/[^a-z0-9_.-]/gi, '_');
  return `logical_${projectId}_${sanitized}`;
}

/**
 * Extract file pattern from filename if it contains wildcards or patterns
 * @param {string} filename - Filename to analyze
 * @returns {string|null} File pattern if detected, null otherwise
 */
function extractFilePattern(filename) {
  const normalized = normalizeFilename(filename);
  
  // Check if the normalized name suggests a pattern
  // For example, if original was sales_20251031.csv, normalized is sales.csv
  // Pattern would be sales_*.csv
  if (filename !== normalized) {
    const ext = filename.substring(filename.lastIndexOf('.'));
    const base = normalized.substring(0, normalized.lastIndexOf('.'));
    return `${base}_*${ext}`;
  }
  
  return null;
}

/**
 * Check if two filenames belong to the same logical file
 * @param {string} filename1 - First filename
 * @param {string} filename2 - Second filename
 * @returns {boolean} True if they should be grouped together
 */
function isSameLogicalFile(filename1, filename2) {
  const normalized1 = normalizeFilename(filename1);
  const normalized2 = normalizeFilename(filename2);
  return normalized1 === normalized2;
}

module.exports = {
  normalizeFilename,
  createLogicalFileId,
  extractFilePattern,
  isSameLogicalFile
};
