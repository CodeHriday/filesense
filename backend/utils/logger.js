/**
 * Advanced Logging Utility for Node.js Backend
 * 
 * This module provides structured logging capabilities for server operations
 * with support for different log levels, contextual logging, and various outputs.
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { format } = winston;

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define custom format for console
const consoleFormat = format.printf(({ level, message, timestamp, context, ...meta }) => {
  const contextStr = context ? `[${context}] ` : '';
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level}: ${contextStr}${message}${metaStr}`;
});

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  defaultMeta: { service: 'data-observatory-api' },
  transports: [
    // Write to all logs with level 'info' and below to combined.log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Write all logs error (and below) to error.log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: format.combine(
      format.colorize(),
      format.timestamp(),
      consoleFormat
    )
  }));
}

// Create a context-aware logger generator
const createContextLogger = (context) => {
  return {
    error: (message, meta = {}) => logger.error(message, { context, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { context, ...meta }),
    info: (message, meta = {}) => logger.info(message, { context, ...meta }),
    http: (message, meta = {}) => logger.http(message, { context, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { context, ...meta }),
    silly: (message, meta = {}) => logger.silly(message, { context, ...meta })
  };
};

// Performance logging middleware
const performanceLogger = (req, res, next) => {
  const start = Date.now();
  
  // Add response listener to log when the request is complete
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel](`${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${duration}ms`, {
      context: 'http',
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('user-agent'),
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
    });
  });
  
  next();
};

// Log execution time for async functions
const logExecutionTime = (context = 'performance') => {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args) {
      const start = Date.now();
      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - start;
        
        logger.debug(`${propertyKey} executed in ${duration}ms`, {
          context,
          method: propertyKey,
          duration,
          args: args.map(arg => typeof arg === 'object' ? '[Object]' : arg).join(', ')
        });
        
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        
        logger.error(`${propertyKey} failed after ${duration}ms: ${error.message}`, {
          context,
          method: propertyKey,
          duration,
          error: error.stack
        });
        
        throw error;
      }
    };
    
    return descriptor;
  };
};

// Common loggers
const systemLogger = createContextLogger('system');
const apiLogger = createContextLogger('api');
const databaseLogger = createContextLogger('database');
const authLogger = createContextLogger('auth');
const transformLogger = createContextLogger('transformations');
const fileLogger = createContextLogger('files');
const schedulerLogger = createContextLogger('scheduler');

module.exports = {
  logger,
  createContextLogger,
  performanceLogger,
  logExecutionTime,
  systemLogger,
  apiLogger,
  databaseLogger,
  authLogger,
  transformLogger,
  fileLogger,
  schedulerLogger
};