/**
 * Error handling middleware module
 * 
 * This module provides centralized error handling for the application.
 */
const { SERVER_CONFIG } = require('../config/environment');

/**
 * Log error details
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 */
const logError = (err, req) => {
  const timestamp = new Date().toISOString();
  const errorMessage = err.message || 'Unknown error';
  const errorStack = err.stack || '';
  const url = req.originalUrl || req.url;
  const method = req.method;
  const ip = req.ip || req.connection.remoteAddress;
  const userId = req.user ? req.user.id : 'unauthenticated';
  
  console.error(`[${timestamp}] ERROR: ${errorMessage}`);
  console.error(`URL: ${method} ${url}`);
  console.error(`User: ${userId}, IP: ${ip}`);
  console.error(errorStack);
  
  // In a production app, we would log to a file or external service
};

/**
 * Normalize error for client response
 * @param {Error} err - Error object
 * @returns {Object} Normalized error object
 */
const normalizeError = (err) => {
  // Basic structure for client-friendly error
  const normalizedError = {
    message: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    status: err.status || 500,
  };
  
  // Add validation errors if available
  if (err.errors) {
    normalizedError.errors = err.errors;
  }
  
  // Remove sensitive information in production
  if (SERVER_CONFIG.IS_PRODUCTION) {
    // Scrub potentially sensitive error details in production
    if (normalizedError.message.toLowerCase().includes('sql') ||
        normalizedError.message.toLowerCase().includes('database') ||
        normalizedError.message.toLowerCase().includes('syntax')) {
      normalizedError.message = 'An error occurred while processing your request';
    }
  } else {
    // Include stack trace in development
    normalizedError.stack = err.stack;
  }
  
  return normalizedError;
};

/**
 * Not found (404) middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Resource not found - ${req.originalUrl}`);
  error.status = 404;
  error.code = 'NOT_FOUND';
  next(error);
};

/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  logError(err, req);
  
  // Normalize error for client response
  const normalizedError = normalizeError(err);
  
  // Set status code and send response
  res.status(normalizedError.status).json({
    error: normalizedError.code,
    message: normalizedError.message,
    errors: normalizedError.errors,
    stack: normalizedError.stack, // Only included in development
  });
};

/**
 * Error handler for async route handlers
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped route handler with error handling
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  notFoundHandler,
  errorHandler,
  asyncHandler,
};