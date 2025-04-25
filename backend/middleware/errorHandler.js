/**
 * Global Error Handler Middleware
 * 
 * This middleware catches all errors thrown in the application and formats
 * them appropriately for client response.
 */

const { AppError } = require('../errors');

/**
 * Error handler middleware
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, next) {
  // Get logger instance - this would typically come from the DI container
  // For now, we'll check if it's available on the request
  const logger = req.logger || console;
  
  // Log the error
  if (err instanceof AppError) {
    // Use the custom logging method for application errors
    err.log(logger);
  } else {
    // For regular errors, log them with the stack trace
    logger.error('Unhandled error', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip
    });
  }
  
  // Determine if this is an operation error (from our error hierarchy)
  if (err instanceof AppError) {
    // Return the formatted response from our custom error
    return res.status(err.status).json(err.toResponse());
  }
  
  // Handle validation errors from express-validator
  if (err.array && typeof err.array === 'function') {
    const validationErrors = err.array().reduce((acc, error) => {
      acc[error.param] = error.msg;
      return acc;
    }, {});
    
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
        details: { validationErrors }
      }
    });
  }
  
  // Handle JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: {
        message: 'Authentication failed',
        code: 'AUTHENTICATION_FAILED',
        timestamp: new Date().toISOString(),
        details: { reason: err.message }
      }
    });
  }
  
  // Handle Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: {
        message: 'File too large',
        code: 'FILE_TOO_LARGE',
        timestamp: new Date().toISOString(),
        details: { maxSize: err.limit }
      }
    });
  }
  
  // Default error response for unhandled errors
  const isProduction = process.env.NODE_ENV === 'production';
  
  // In production, don't expose error details
  const errorResponse = {
    error: {
      message: isProduction ? 'An unexpected error occurred' : err.message,
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
      details: isProduction ? {} : { 
        stack: err.stack,
        originalError: err.toString()
      }
    }
  };
  
  return res.status(500).json(errorResponse);
}

module.exports = errorHandler;