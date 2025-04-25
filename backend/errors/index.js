/**
 * Error module exports
 * 
 * This file exports all error classes for easy importing throughout the application.
 */

const AppError = require('./AppError');

/**
 * ValidationError
 * 
 * Used when data fails validation rules
 */
class ValidationError extends AppError {
  constructor(message, validationErrors, details = {}) {
    super(
      message || 'Validation failed',
      'VALIDATION_ERROR',
      400,
      { ...details, validationErrors }
    );
  }
}

/**
 * NotFoundError
 * 
 * Used when a requested resource is not found
 */
class NotFoundError extends AppError {
  constructor(message, resource, id, details = {}) {
    super(
      message || `${resource} with id ${id} not found`,
      'NOT_FOUND_ERROR',
      404,
      { ...details, resource, id }
    );
  }
}

/**
 * AuthenticationError
 * 
 * Used when authentication fails (e.g., invalid credentials)
 */
class AuthenticationError extends AppError {
  constructor(message, details = {}) {
    super(
      message || 'Authentication failed',
      'AUTHENTICATION_ERROR',
      401,
      details
    );
  }
}

/**
 * AuthorizationError
 * 
 * Used when a user doesn't have permission to access a resource
 */
class AuthorizationError extends AppError {
  constructor(message, action, resource, details = {}) {
    super(
      message || `Permission denied to ${action} ${resource}`,
      'AUTHORIZATION_ERROR',
      403,
      { ...details, action, resource }
    );
  }
}

/**
 * BusinessLogicError
 * 
 * Used when an operation violates a business rule
 */
class BusinessLogicError extends AppError {
  constructor(message, rule, context = {}, details = {}) {
    super(
      message || `Business rule violation: ${rule}`,
      'BUSINESS_LOGIC_ERROR',
      400,
      { ...details, rule, context }
    );
  }
}

/**
 * DatabaseError
 * 
 * Used for database operation failures
 */
class DatabaseError extends AppError {
  constructor(message, operation, originalError, details = {}) {
    const errorDetails = {
      ...details,
      operation,
      dbErrorCode: originalError?.code,
      dbErrorMessage: originalError?.message
    };
    
    super(
      message || 'Database operation failed',
      'DATABASE_ERROR',
      500,
      errorDetails
    );
    
    // Store original error for internal use
    this.originalError = originalError;
  }
}

/**
 * FileOperationError
 * 
 * Used for file system operation failures
 */
class FileOperationError extends AppError {
  constructor(message, operation, filePath, originalError, details = {}) {
    const errorDetails = {
      ...details,
      operation,
      filePath: filePath ? filePath.replace(/^.*[\\\/]/, '...') : null, // Sanitize path
      fileErrorCode: originalError?.code,
      fileErrorMessage: originalError?.message
    };
    
    super(
      message || `File ${operation} operation failed`,
      'FILE_OPERATION_ERROR',
      500,
      errorDetails
    );
    
    // Store original error for internal use
    this.originalError = originalError;
  }
}

/**
 * ExternalServiceError
 * 
 * Used for failures when interacting with external services/APIs
 */
class ExternalServiceError extends AppError {
  constructor(message, service, operation, originalError, details = {}) {
    const errorDetails = {
      ...details,
      service,
      operation,
      externalErrorCode: originalError?.code || originalError?.status,
      externalErrorMessage: originalError?.message
    };
    
    super(
      message || `External service (${service}) operation failed`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      errorDetails
    );
    
    // Store original error for internal use
    this.originalError = originalError;
  }
}

/**
 * TransformationError
 * 
 * Used for failures during data transformation operations
 */
class TransformationError extends AppError {
  constructor(message, transformationType, transformationId, originalError, details = {}) {
    const errorDetails = {
      ...details,
      transformationType,
      transformationId,
      originalErrorMessage: originalError?.message
    };
    
    super(
      message || `Transformation (${transformationType}) failed`,
      'TRANSFORMATION_ERROR',
      500,
      errorDetails
    );
    
    // Store original error for internal use
    this.originalError = originalError;
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  BusinessLogicError,
  DatabaseError,
  FileOperationError,
  ExternalServiceError,
  TransformationError
};