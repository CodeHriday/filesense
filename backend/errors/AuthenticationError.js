/**
 * Authentication Error
 * 
 * Used for authentication-related errors (invalid credentials, expired tokens, etc.)
 */
const AppError = require('./AppError');

class AuthenticationError extends AppError {
  /**
   * Create a new authentication error
   * 
   * @param {string} message - Error message
   * @param {string} reason - Specific reason for authentication failure
   * @param {string} code - Error code (default: AUTHENTICATION_FAILED)
   */
  constructor(
    message = 'Authentication failed',
    reason = null,
    code = 'AUTHENTICATION_FAILED'
  ) {
    super(message, code, 401, { reason });
    
    this.reason = reason;
  }
}

module.exports = AuthenticationError;