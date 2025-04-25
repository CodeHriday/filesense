/**
 * Base Application Error
 * 
 * This is the foundation of our error hierarchy. All custom errors in the 
 * application should extend this class to ensure consistent error handling.
 */
class AppError extends Error {
  /**
   * Create a new application error
   * 
   * @param {string} message - Error message
   * @param {string} code - Error code (should be unique per error type)
   * @param {number} status - HTTP status code to return (default: 500)
   * @param {Object} details - Additional error details
   */
  constructor(message, code = 'INTERNAL_ERROR', status = 500, details = {}) {
    super(message);
    
    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name;
    
    // Properties specific to our application errors
    this.code = code;
    this.status = status;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  /**
   * Convert error to a standard response object
   * 
   * @returns {Object} Standardized error response
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
  
  /**
   * Log the error to the console (can be extended for more logging options)
   * 
   * @param {Object} logger - Optional logger instance
   */
  log(logger = console) {
    logger.error(`[${this.code}] ${this.message}`, {
      errorName: this.name,
      details: this.details,
      stack: this.stack
    });
  }
}

module.exports = AppError;