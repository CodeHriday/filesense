/**
 * File Pattern Matching Utility
 * Supports wildcard patterns (* and ?) for matching file names
 */

const { globToRegex } = require('./regexValidator');

/**
 * Convert a wildcard pattern to a RegExp
 * @param {string} pattern - Pattern with wildcards (* and ?)
 * @returns {RegExp} - Regular expression for matching
 */
function patternToRegex(pattern) {
  // Use safe regex conversion to prevent ReDoS
  return globToRegex(pattern);
}

/**
 * Check if a filename matches a pattern
 * @param {string} filename - The filename to check
 * @param {string} pattern - The pattern with wildcards
 * @returns {boolean} - True if filename matches the pattern
 */
function matchesPattern(filename, pattern) {
  const regex = patternToRegex(pattern);
  return regex.test(filename);
}

/**
 * Find all files matching a pattern from the database
 * @param {Pool} pool - Database connection pool
 * @param {string} pattern - File pattern with wildcards
 * @param {Object} options - Additional filtering options
 * @returns {Promise<Array>} - Array of matching files
 */
async function findMatchingFiles(pool, pattern, options = {}) {
  try {
    const { 
      connectionId = null, 
      fileType = null,
      minRows = null,
      maxRows = null,
      limit = null
    } = options;
    
    // If pattern contains wildcards, we need to fetch and filter
    const hasWildcards = pattern.includes('*') || pattern.includes('?');
    
    if (!hasWildcards) {
      // Direct filename match - simple query
      let query = 'SELECT * FROM files WHERE filename = $1';
      const params = [pattern];
      let paramIndex = 2;
      
      // Note: connectionId filtering removed as files table doesn't have connection_id column
      // Connection info is stored in metadata JSONB field
      
      if (fileType) {
        query += ` AND file_type = $${paramIndex}`;
        params.push(fileType);
        paramIndex++;
      }
      
      if (minRows !== null) {
        query += ` AND row_count >= $${paramIndex}`;
        params.push(minRows);
        paramIndex++;
      }
      
      if (maxRows !== null) {
        query += ` AND row_count <= $${paramIndex}`;
        params.push(maxRows);
        paramIndex++;
      }
      
      query += ' ORDER BY created_at DESC';
      
      if (limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(limit);
      }
      
      const result = await pool.query(query, params);
      
      // Filter by connectionId if provided (check metadata field)
      let rows = result.rows;
      if (connectionId) {
        rows = rows.filter(file => {
          const metadata = file.metadata || {};
          return metadata.connection_id === connectionId;
        });
      }
      
      return rows;
    } else {
      // Wildcard pattern - fetch all files and filter in memory
      let query = 'SELECT * FROM files WHERE 1=1';
      const params = [];
      let paramIndex = 1;
      
      // Note: connectionId filtering removed from SQL as files table doesn't have connection_id column
      
      if (fileType) {
        query += ` AND file_type = $${paramIndex}`;
        params.push(fileType);
        paramIndex++;
      }
      
      if (minRows !== null) {
        query += ` AND row_count >= $${paramIndex}`;
        params.push(minRows);
        paramIndex++;
      }
      
      if (maxRows !== null) {
        query += ` AND row_count <= $${paramIndex}`;
        params.push(maxRows);
        paramIndex++;
      }
      
      query += ' ORDER BY created_at DESC';
      
      const result = await pool.query(query, params);
      
      // Filter files by pattern
      const regex = patternToRegex(pattern);
      let matchedFiles = result.rows.filter(file => regex.test(file.filename));
      
      // Filter by connectionId if provided (check metadata field)
      if (connectionId) {
        matchedFiles = matchedFiles.filter(file => {
          const metadata = file.metadata || {};
          return metadata.connection_id === connectionId;
        });
      }
      
      // Apply limit if specified
      if (limit) {
        matchedFiles = matchedFiles.slice(0, limit);
      }
      
      return matchedFiles;
    }
  } catch (error) {
    console.error('Error finding matching files:', error);
    throw error;
  }
}

/**
 * Count files matching a pattern
 * @param {Pool} pool - Database connection pool
 * @param {string} pattern - File pattern with wildcards
 * @param {Object} options - Additional filtering options
 * @returns {Promise<number>} - Count of matching files
 */
async function countMatchingFiles(pool, pattern, options = {}) {
  const files = await findMatchingFiles(pool, pattern, options);
  return files.length;
}

/**
 * Get unique file patterns from a list of filenames
 * Suggests patterns based on common prefixes and naming conventions
 * @param {Array<string>} filenames - List of filenames
 * @returns {Array<Object>} - Array of suggested patterns with match counts
 */
function suggestPatterns(filenames) {
  const patterns = [];
  const prefixMap = new Map();
  
  // Group files by common prefixes
  filenames.forEach(filename => {
    // Extract base name without extension
    const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
    
    // Find common prefixes
    for (let i = 3; i <= baseName.length; i++) {
      const prefix = baseName.substring(0, i);
      if (!prefixMap.has(prefix)) {
        prefixMap.set(prefix, []);
      }
      prefixMap.get(prefix).push(filename);
    }
  });
  
  // Find patterns that match multiple files
  const seenPatterns = new Set();
  prefixMap.forEach((files, prefix) => {
    if (files.length > 1 && prefix.length >= 3) {
      const pattern = `${prefix}*`;
      if (!seenPatterns.has(pattern)) {
        seenPatterns.add(pattern);
        patterns.push({
          pattern,
          matchCount: files.length,
          sampleFiles: files.slice(0, 3)
        });
      }
    }
  });
  
  // Sort by match count descending
  patterns.sort((a, b) => b.matchCount - a.matchCount);
  
  return patterns.slice(0, 10); // Return top 10 patterns
}

module.exports = {
  patternToRegex,
  matchesPattern,
  findMatchingFiles,
  countMatchingFiles,
  suggestPatterns
};
