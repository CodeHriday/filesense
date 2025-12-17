/**
 * Enhanced Logging Module
 * 
 * Provides structured logging with different log levels, performance tracking,
 * and file/console output options.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, json } = format;

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length 
    ? JSON.stringify(meta, null, 0)
    : '';
  
  return `${timestamp} ${level}: ${message} ${metaStr}`;
});

// Configure system logger for application events
const systemLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    json()
  ),
  defaultMeta: { service: 'data-observatory-api' },
  transports: [
    // Console output with colors (for development)
    new transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        consoleFormat
      )
    }),
    // File output (JSON format for machine processing)
    new transports.File({ 
      filename: path.join(logsDir, 'system.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

// Configure database logger for database operations
const databaseLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    json()
  ),
  defaultMeta: { service: 'data-observatory-db' },
  transports: [
    // Console output with colors (for development)
    new transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        consoleFormat
      )
    }),
    // File output (JSON format for machine processing)
    new transports.File({ 
      filename: path.join(logsDir, 'database.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

// Configure audit logger for security and user actions
const auditLogger = createLogger({
  level: 'info',
  format: combine(
    timestamp(),
    json()
  ),
  defaultMeta: { service: 'data-observatory-audit' },
  transports: [
    // Separate file for audit logs (for compliance)
    new transports.File({ 
      filename: path.join(logsDir, 'audit.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true
    })
  ]
});

// Performance monitoring middleware
const performanceLogger = (req, res, next) => {
  const start = Date.now();
  
  // Add request ID for correlation
  req.requestId = Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
  
  // Log at completion
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Only log performance for non-static resources
    if (!req.url.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
      systemLogger.debug('API Request completed', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: duration,
        requestId: req.requestId,
        userAgent: req.get('user-agent'),
        apiCategory: 'performance'
      });
      
      // Log detailed performance for slow responses
      if (duration > 1000) {
        systemLogger.warn('Slow API response detected', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: duration,
          requestId: req.requestId,
          threshold: 1000,
          apiCategory: 'performance'
        });
      }
    }
  });
  
  next();
};

// Log user actions (for audit trail)
function logUserAction(userId, action, details) {
  auditLogger.info('User action', {
    userId,
    action,
    details,
    timestamp: new Date().toISOString()
  });
}

// Log security events
function logSecurityEvent(event, details, severity = 'info') {
  auditLogger.log(severity, 'Security event', {
    event,
    details,
    timestamp: new Date().toISOString()
  });
}

// Log database operations
function logDatabaseOperation(operation, details, duration) {
  systemLogger.debug('Database operation', {
    operation,
    details,
    duration,
    category: 'database'
  });
}

module.exports = {
  systemLogger,
  auditLogger,
  databaseLogger,
  performanceLogger,
  logUserAction,
  logSecurityEvent,
  logDatabaseOperation
};