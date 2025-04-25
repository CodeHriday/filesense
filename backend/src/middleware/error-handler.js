/**
 * Error handling middleware module
 * 
 * This module provides centralized error handling for the application.
 */

/**
 * Global error handler middleware
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  console.error('Global error handler caught:', err);
  
  // Default to 500 server error
  let statusCode = err.status || 500;
  let errorMessage = err.message || 'Internal Server Error';
  let errorDetails = null;
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorMessage = 'Validation Error';
    errorDetails = err.errors;
  } else if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorMessage = 'Authentication Error';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    errorMessage = 'Access Denied';
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    errorMessage = 'Resource Not Found';
  } else if (err.code === '23505') { // PostgreSQL unique violation
    statusCode = 409;
    errorMessage = 'Conflict Error';
    if (err.constraint) {
      if (err.constraint.includes('users_username_key')) {
        errorMessage = 'Username already exists';
      } else if (err.constraint.includes('users_email_key')) {
        errorMessage = 'Email already exists';
      }
    }
  }
  
  // Use NODE_ENV to determine error details in response
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Send the error response
  res.status(statusCode).json({
    error: {
      message: errorMessage,
      details: errorDetails,
      ...(isDevelopment && {
        stack: err.stack,
        name: err.name,
        code: err.code
      })
    }
  });
};

/**
 * Async handler to wrap async route handlers
 * This catches errors in async routes and forwards them to the error handler
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped route handler
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Not found middleware - creates a 404 error for undefined routes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.status = 404;
  error.name = 'NotFoundError';
  next(error);
};

/**
 * Create an error with a specific name, message, and status code
 * @param {string} name - Error name
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @returns {Error} Configured error object
 */
const createError = (name, message, statusCode) => {
  const error = new Error(message);
  error.name = name;
  error.status = statusCode;
  return error;
};

// Common error creators
const notFoundError = (message = 'Resource not found') => {
  return createError('NotFoundError', message, 404);
};

const unauthorizedError = (message = 'Unauthorized') => {
  return createError('UnauthorizedError', message, 401);
};

const forbiddenError = (message = 'Access denied') => {
  return createError('ForbiddenError', message, 403);
};

const badRequestError = (message = 'Bad request', details = null) => {
  const error = createError('ValidationError', message, 400);
  error.errors = details;
  return error;
};

const conflictError = (message = 'Resource already exists') => {
  return createError('ConflictError', message, 409);
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  createError,
  notFoundError,
  unauthorizedError,
  forbiddenError,
  badRequestError,
  conflictError
};