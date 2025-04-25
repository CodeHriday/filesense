/**
 * Authorization Error
 * 
 * Used when a user is authenticated but doesn't have permission to access a resource
 */
const AppError = require('./AppError');

class AuthorizationError extends AppError {
  /**
   * Create a new authorization error
   * 
   * @param {string} message - Error message
   * @param {string} action - Action that was denied
   * @param {string} resource - Resource type that was accessed
   * @param {string} code - Error code (default: FORBIDDEN)
   */
  constructor(
    message = 'Permission denied',
    action = null,
    resource = null,
    code = 'FORBIDDEN'
  ) {
    super(message, code, 403, { action, resource });
    
    this.action = action;
    this.resource = resource;
  }
}

module.exports = AuthorizationError;