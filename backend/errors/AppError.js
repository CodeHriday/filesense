/**
 * Base Application Error Class
 * 
 * This is the foundation for all application-specific errors.
 * It extends the native Error class with additional functionality
 * for consistent error handling and logging.
 */

class AppError extends Error {
  /**
   * Create a new AppError
   * 
   * @param {string} message - Error message
   * @param {string} code - Error code (used for client-side error handling)
   * @param {number} status - HTTP status code
   * @param {Object} details - Additional error details
   */
  constructor(message, code = 'INTERNAL_ERROR', status = 500, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  /**
   * Log the error with appropriate severity and context
   * 
   * @param {Object} logger - Logger instance
   */
  log(logger) {
    const errorContext = {
      errorName: this.name,
      errorCode: this.code,
      statusCode: this.status,
      details: this.details,
      stack: this.stack
    };
    
    // Select log level based on status code
    if (this.status >= 500) {
      logger.error(this.message, errorContext);
    } else if (this.status >= 400) {
      logger.warn(this.message, errorContext);
    } else {
      logger.info(this.message, errorContext);
    }
  }
  
  /**
   * Convert the error to a response object for the client
   * 
   * @returns {Object} Response object
   */
  toResponse() {
    return {
      error: {
        message: this.message,
        code: this.code,
        timestamp: this.timestamp,
        details: this.details
      }
    };
  }
}

module.exports = AppError;