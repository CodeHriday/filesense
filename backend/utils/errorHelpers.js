/**
 * Error Helper Utilities
 * 
 * Provides helper functions for creating and throwing errors consistently 
 * throughout the application.
 */

const {
  NotFoundError,
  ValidationError,
  AuthorizationError,
  DatabaseError,
  FileOperationError,
  BusinessLogicError
} = require('../errors');

/**
 * Create a not found error for a specific resource
 * 
 * @param {string} resource - Resource type (e.g., 'file', 'user', 'transformation')
 * @param {string|number} id - Resource identifier
 * @param {string} [customMessage] - Optional custom message
 * @returns {NotFoundError} - Not found error instance
 */
function createNotFoundError(resource, id, customMessage = null) {
  const message = customMessage || `${resource} with id ${id} not found`;
  return new NotFoundError(message, resource, id);
}

/**
 * Create a validation error with field-specific validation messages
 * 
 * @param {Object} validationErrors - Object with field names as keys and error messages as values
 * @param {string} [customMessage] - Optional custom message
 * @returns {ValidationError} - Validation error instance
 */
function createValidationError(validationErrors, customMessage = null) {
  const message = customMessage || 'Validation failed';
  return new ValidationError(message, validationErrors);
}

/**
 * Create a business logic error for a specific business rule
 * 
 * @param {string} rule - Business rule that was violated
 * @param {string} message - Error message
 * @param {Object} context - Additional context
 * @returns {BusinessLogicError} - Business logic error instance
 */
function createBusinessLogicError(rule, message, context = {}) {
  return new BusinessLogicError(message, rule, context);
}

/**
 * Create a permission denied error
 * 
 * @param {string} action - Action being performed (e.g., 'read', 'write', 'delete')
 * @param {string} resource - Resource being accessed (e.g., 'file', 'user', 'transformation')
 * @param {string} [customMessage] - Optional custom message
 * @returns {AuthorizationError} - Authorization error instance
 */
function createPermissionDeniedError(action, resource, customMessage = null) {
  const message = customMessage || `Permission denied to ${action} ${resource}`;
  return new AuthorizationError(message, action, resource);
}

/**
 * Create a database error for a failed database operation
 * 
 * @param {string} operation - Database operation that failed
 * @param {Error} originalError - Original database error
 * @param {string} [customMessage] - Optional custom message
 * @returns {DatabaseError} - Database error instance
 */
function createDatabaseError(operation, originalError, customMessage = null) {
  const message = customMessage || 'Database operation failed';
  return new DatabaseError(message, operation, originalError);
}

/**
 * Create a file operation error
 * 
 * @param {string} operation - File operation that failed (e.g., 'upload', 'read', 'write')
 * @param {string} filePath - Path to the file
 * @param {Error} originalError - Original file system error
 * @param {string} [customMessage] - Optional custom message
 * @returns {FileOperationError} - File operation error instance
 */
function createFileError(operation, filePath, originalError, customMessage = null) {
  const message = customMessage || `File ${operation} operation failed`;
  return new FileOperationError(message, operation, filePath, originalError);
}

/**
 * Custom async handler that catches errors in async Express route handlers
 * 
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function that handles errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  createNotFoundError,
  createValidationError,
  createBusinessLogicError,
  createPermissionDeniedError,
  createDatabaseError,
  createFileError,
  asyncHandler
};