/**
 * Not Found Error
 * 
 * Used when a requested resource is not found
 */
const AppError = require('./AppError');

class NotFoundError extends AppError {
  /**
   * Create a new not found error
   * 
   * @param {string} message - Error message
   * @param {string} resource - Resource type that was not found
   * @param {string} identifier - Resource identifier that was not found
   * @param {string} code - Error code (default: NOT_FOUND)
   */
  constructor(
    message = 'Resource not found',
    resource = null,
    identifier = null,
    code = 'NOT_FOUND'
  ) {
    super(message, code, 404, { resource, identifier });
    
    this.resource = resource;
    this.identifier = identifier;
  }
}

module.exports = NotFoundError;