/**
 * Path Validation Utility
 * 
 * Provides secure path validation to prevent directory traversal attacks.
 * All file operations involving user input should use these validators.
 */

const path = require('path');

/**
 * Safely join paths and validate that the result stays within the base directory
 * 
 * @param {string} baseDir - The base directory that all paths must stay within
 * @param {string} userPath - The user-provided path component
 * @returns {string} The safely resolved absolute path
 * @throws {Error} If path traversal is detected
 * 
 * @example
 * const safePath = safePath('/var/data', 'uploads/file.csv');
 * // Returns: '/var/data/uploads/file.csv'
 * 
 * const maliciousPath = safePath('/var/data', '../../../etc/passwd');
 * // Throws: Error: Path traversal attempt detected
 */
function safePath(baseDir, userPath) {
  if (!baseDir || !userPath) {
    throw new Error('Both baseDir and userPath are required');
  }
  
  // Normalize the user path to remove any traversal patterns
  // This removes sequences like ../, ..\, /./, etc.
  const normalized = path.normalize(userPath).replace(/^(\.\.(\/|\\|$))+/, '');
  
  // Resolve both paths to absolute paths
  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(resolvedBase, normalized);
  
  // Check that the resolved path is still within the base directory
  // Using startsWith ensures the path hasn't escaped via traversal
  if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
    throw new Error('Path traversal attempt detected');
  }
  
  return resolvedPath;
}

/**
 * Validate that a filename contains only safe characters
 * Prevents issues with special characters in filenames
 * 
 * @param {string} filename - The filename to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.allowSpaces - Allow spaces in filename (default: true)
 * @param {boolean} options.allowDots - Allow dots in filename (default: true)
 * @returns {boolean} True if filename is safe
 * 
 * @example
 * isSafeFilename('report.csv') // true
 * isSafeFilename('../../../etc/passwd') // false
 * isSafeFilename('my report.xlsx') // true
 * isSafeFilename('file<script>.txt') // false
 */
function isSafeFilename(filename, options = {}) {
  const { allowSpaces = true, allowDots = true } = options;
  
  if (!filename || typeof filename !== 'string') {
    return false;
  }
  
  // Check for null bytes (can cause issues in C-based file systems)
  if (filename.includes('\0')) {
    return false;
  }
  
  // Check for path separators (prevents traversal)
  if (filename.includes('/') || filename.includes('\\')) {
    return false;
  }
  
  // Check for dangerous characters
  const dangerousChars = /[<>:"|?*\x00-\x1f]/;
  if (dangerousChars.test(filename)) {
    return false;
  }
  
  // Check for spaces if not allowed
  if (!allowSpaces && filename.includes(' ')) {
    return false;
  }
  
  // Check for dots in suspicious positions
  if (allowDots) {
    // Prevent filenames that are just dots (., .., ...)
    if (/^\.+$/.test(filename)) {
      return false;
    }
  } else {
    // Disallow any dots
    if (filename.includes('.')) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get the file extension safely
 * 
 * @param {string} filename - The filename
 * @returns {string} The file extension (lowercase, without dot) or empty string
 * 
 * @example
 * getSafeExtension('report.CSV') // 'csv'
 * getSafeExtension('file.tar.gz') // 'gz'
 * getSafeExtension('noextension') // ''
 */
function getSafeExtension(filename) {
  if (!filename || typeof filename !== 'string') {
    return '';
  }
  
  const ext = path.extname(filename);
  return ext ? ext.slice(1).toLowerCase() : '';
}

/**
 * Validate that a path is within allowed directories
 * 
 * @param {string} filePath - The absolute file path to validate
 * @param {string[]} allowedDirs - Array of allowed base directories
 * @returns {boolean} True if path is within allowed directories
 * 
 * @example
 * isPathAllowed('/var/data/uploads/file.csv', ['/var/data']) // true
 * isPathAllowed('/etc/passwd', ['/var/data']) // false
 */
function isPathAllowed(filePath, allowedDirs) {
  if (!filePath || !Array.isArray(allowedDirs) || allowedDirs.length === 0) {
    return false;
  }
  
  const resolvedPath = path.resolve(filePath);
  
  return allowedDirs.some(dir => {
    const resolvedDir = path.resolve(dir);
    return resolvedPath.startsWith(resolvedDir + path.sep) || resolvedPath === resolvedDir;
  });
}

module.exports = {
  safePath,
  isSafeFilename,
  getSafeExtension,
  isPathAllowed
};
