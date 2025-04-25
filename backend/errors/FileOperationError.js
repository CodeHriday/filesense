/**
 * File Operation Error
 * 
 * Used for file system related errors (uploads, read/write failures, etc.)
 */
const AppError = require('./AppError');

class FileOperationError extends AppError {
  /**
   * Create a new file operation error
   * 
   * @param {string} message - Error message
   * @param {string} operation - File operation that failed (upload, read, write, etc.)
   * @param {string} filePath - Path of the file (can be sanitized if needed)
   * @param {Error} originalError - Original file system error
   * @param {string} code - Error code (default: FILE_ERROR)
   */
  constructor(
    message = 'File operation failed',
    operation = null,
    filePath = null,
    originalError = null,
    code = 'FILE_ERROR'
  ) {
    // For security, we may want to sanitize the file path to avoid exposing
    // the full system path to the client
    const sanitizedPath = sanitizeFilePath(filePath);
    
    super(message, code, 500, { operation, path: sanitizedPath });
    
    this.operation = operation;
    this.filePath = filePath; // Store the original unsanitized path for logging
    this.sanitizedPath = sanitizedPath;
    this.originalError = originalError;
  }
  
  /**
   * Log the error with the original file system error details
   * 
   * @param {Object} logger - Logger instance
   */
  log(logger = console) {
    logger.error(`[${this.code}] ${this.message}`, {
      errorName: this.name,
      operation: this.operation,
      filePath: this.filePath,
      originalError: this.originalError ? {
        message: this.originalError.message,
        code: this.originalError.code,
        errno: this.originalError.errno
      } : null,
      stack: this.stack
    });
  }
}

/**
 * Sanitize file paths to avoid exposing system paths
 * 
 * @private
 * @param {string} filePath - Original file path
 * @returns {string} - Sanitized file path
 */
function sanitizeFilePath(filePath) {
  if (!filePath) return null;
  
  // Extract just the file name from the full path for security
  const pathParts = filePath.split(/[\/\\]/);
  const fileName = pathParts[pathParts.length - 1];
  
  return fileName;
}

module.exports = FileOperationError;