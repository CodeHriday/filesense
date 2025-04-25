/**
 * Database Error
 * 
 * Used for database-related errors (connection issues, query failures, etc.)
 */
const AppError = require('./AppError');

class DatabaseError extends AppError {
  /**
   * Create a new database error
   * 
   * @param {string} message - Error message
   * @param {string} operation - Database operation that failed
   * @param {Error} originalError - Original database error
   * @param {string} code - Error code (default: DATABASE_ERROR)
   */
  constructor(
    message = 'Database operation failed',
    operation = null,
    originalError = null,
    code = 'DATABASE_ERROR'
  ) {
    // Don't include the original error in the public-facing details
    // to avoid leaking sensitive info
    const details = { operation };
    
    // Sanitize SQL error messages for the client response
    const clientMessage = sanitizeErrorMessage(message, originalError);
    
    super(clientMessage, code, 500, details);
    
    // Store the original error for internal logging
    this.originalError = originalError;
    this.operation = operation;
    
    // Determine if this is a transient error that can be retried
    this.isTransient = isTransientError(originalError);
  }
  
  /**
   * Log the error with the original database error details
   * 
   * @param {Object} logger - Logger instance
   */
  log(logger = console) {
    logger.error(`[${this.code}] ${this.message}`, {
      errorName: this.name,
      operation: this.operation,
      isTransient: this.isTransient,
      originalError: this.originalError ? {
        message: this.originalError.message,
        code: this.originalError.code,
        detail: this.originalError.detail,
      } : null,
      stack: this.stack
    });
  }
}

/**
 * Determine if an error is transient and can be retried
 * 
 * @private
 * @param {Error} err - Original database error
 * @returns {boolean} - Whether the error is transient
 */
function isTransientError(err) {
  if (!err) return false;
  
  // PostgreSQL error codes that are typically transient
  const transientErrorCodes = [
    '08000', // connection_exception
    '08003', // connection_does_not_exist
    '08006', // connection_failure
    '08001', // sqlclient_unable_to_establish_sqlconnection
    '08004', // sqlserver_rejected_establishment_of_sqlconnection
    '08007', // transaction_resolution_unknown
    '40001', // serialization_failure
    '40P01', // deadlock_detected
    '57P01', // admin_shutdown
    '57P02', // crash_shutdown
    '57P03'  // cannot_connect_now
  ];
  
  // Check for specific PostgreSQL error codes
  if (err.code && transientErrorCodes.includes(err.code)) {
    return true;
  }
  
  // Check for connection timeout messages
  if (err.message && (
    err.message.includes('timeout') || 
    err.message.includes('connection') ||
    err.message.includes('temporarily') ||
    err.message.includes('idle')
  )) {
    return true;
  }
  
  return false;
}

/**
 * Sanitize error messages to avoid leaking sensitive information
 * 
 * @private
 * @param {string} message - Original error message
 * @param {Error} originalError - Original database error
 * @returns {string} - Sanitized error message
 */
function sanitizeErrorMessage(message, originalError) {
  // If no original error, just return the message
  if (!originalError) return message;
  
  // Generic message for security-sensitive errors
  const sensitiveErrorPatterns = [
    /password/i,
    /authentication/i, 
    /permission denied/i,
    /credentials/i,
    /role/i
  ];
  
  if (originalError.message && 
      sensitiveErrorPatterns.some(pattern => pattern.test(originalError.message))) {
    return 'A database security error occurred';
  }
  
  // For duplicate key errors, provide a more user-friendly message
  if (originalError.code === '23505') { // unique_violation
    return 'The record already exists';
  }
  
  // For foreign key errors, provide a more user-friendly message
  if (originalError.code === '23503') { // foreign_key_violation
    return 'The operation would violate data integrity constraints';
  }
  
  return message;
}

module.exports = DatabaseError;