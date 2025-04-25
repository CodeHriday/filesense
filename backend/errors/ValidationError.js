/**
 * Validation Error
 * 
 * Used when data validation fails (request body, query params, etc.)
 */
const AppError = require('./AppError');

class ValidationError extends AppError {
  /**
   * Create a new validation error
   * 
   * @param {string} message - Error message
   * @param {Object} validationErrors - Validation errors by field
   * @param {string} code - Error code (default: VALIDATION_ERROR)
   */
  constructor(message = 'Validation failed', validationErrors = {}, code = 'VALIDATION_ERROR') {
    super(message, code, 400, { validationErrors });
    
    // Add specific validation errors for easy access
    this.validationErrors = validationErrors;
  }
  
  /**
   * Add a validation error for a specific field
   * 
   * @param {string} field - Field name
   * @param {string} message - Error message for this field
   * @returns {ValidationError} This instance for chaining
   */
  addFieldError(field, message) {
    if (!this.validationErrors) {
      this.validationErrors = {};
    }
    
    this.validationErrors[field] = message;
    this.details.validationErrors = this.validationErrors;
    
    return this;
  }
}

module.exports = ValidationError;