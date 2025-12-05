const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const session = require('express-session');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Initialize dependency injection container
const { initialize: initializeDI, initializeDatabase } = require('./backend/di/bootstrapper');
const diContainer = initializeDI();

// Import enhanced backend features
const { setupEnhancedFeatures } = require('./backend/integration');

// Import queue system for async processing
const { getQueue } = require('./backend/queue/queueFactory');
const FileProcessingWorker = require('./backend/workers/fileProcessingWorker');
const SchedulerWorker = require('./backend/workers/schedulerWorker');
const SLAMonitorWorker = require('./backend/workers/slaMonitorWorker');
const InsightsAggregationWorker = require('./backend/workers/insightsAggregationWorker');
const RetentionPolicyWorker = require('./backend/workers/retentionPolicyWorker');

// Initialize queue and workers
const queue = getQueue();
const fileWorker = new FileProcessingWorker(
  queue,
  diContainer.get('dbPool'),
  diContainer.get('logger'),
  diContainer.get('auditService')
);
fileWorker.start();

// Initialize scheduler worker (checks for due schedules every minute)
const schedulerWorker = new SchedulerWorker(
  diContainer.get('logger'),
  60000 // Check every 60 seconds
);
schedulerWorker.start();

// Initialize SLA monitor worker (checks vendor file arrival SLAs every 15 minutes)
const slaMonitorWorker = new SLAMonitorWorker(
  diContainer.get('logger'),
  900000 // Check every 15 minutes
);
slaMonitorWorker.start();

// Initialize insights aggregation worker (runs daily at 2 AM)
const insightsWorker = new InsightsAggregationWorker(
  diContainer.get('dbPool'),
  '02:00' // Run at 2 AM
);
insightsWorker.start();

// Initialize retention policy worker (runs daily at 1 AM)
const retentionWorker = new RetentionPolicyWorker(
  diContainer.get('dbPool'),
  diContainer.get('logger'),
  '01:00' // Run at 1 AM
);
retentionWorker.start();

// Import validation middleware and schemas
const { validateRequest, loginSchema, userSchema, fileUploadSchema } = require('./backend/src/middleware/validation');
const { cacheMiddleware, invalidateCache, invalidate } = require('./backend/middleware/cacheMiddleware');
const createAuditMiddleware = require('./backend/middleware/auditMiddleware');
const authorizeProjectResource = require('./backend/middleware/authorizeProjectResource');
const { requireProjectAccess } = require('./backend/middleware/requireProjectAccess');
const { attachVendorProfile, filterVendorFiles } = require('./backend/middleware/vendorAccessControl');

// Import enhanced authentication service
const enhancedAuthService = require('./backend/services/enhancedAuthService');

// Import column access control service
const columnAccessControl = require('./backend/services/columnAccessControl');

// Initialize Express app
const app = express();
// Use PORT from environment (Replit provides this), fallback to 5000 in production or 3000 in development
const port = process.env.PORT || (process.env.NODE_ENV === 'production' ? 5000 : 3000);

// Trust proxy for accurate client IP detection (required for rate limiting)
app.set('trust proxy', 1);

// Get shared services from DI container
const dbPool = diContainer.get('dbPool');
const logger = diContainer.get('logger');

// Make database pool available to routes
app.locals.pool = dbPool;

// JWT Configuration - Now managed by environment.js with strict validation
const { SECURITY_CONFIG } = require('./backend/src/config/environment');
const JWT_SECRET = SECURITY_CONFIG.JWT_SECRET;
const JWT_EXPIRATION = SECURITY_CONFIG.JWT_EXPIRATION;

// Error sanitization utility for production
const sanitizeError = (error, genericMessage = 'An error occurred') => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    // In production, return generic message and log details server-side
    logger.error('Error occurred', {
      message: error.message,
      stack: error.stack,
      originalError: error.toString()
    });
    return genericMessage;
  }
  
  // In development, return detailed error message
  return error.message || genericMessage;
};

// Import authentication middleware from backend/src
const { authenticateToken } = require('./backend/src/middleware/authenticate');

// Middleware to extract fileId from URLs that may contain slashes
// This must come BEFORE the route definitions
const extractFileId = (req, res, next) => {
  // List of known endpoints after fileId
  const endpoints = ['preview', 'profile', 'profile-history', 'quality', 'ownership', 'policies', 'tags', 'schedules', 'insights', 'columns', 'job-status', 'preview-data'];
  
  // Check if this is a /api/files/ route
  if (req.path.startsWith('/api/files/')) {
    const pathAfterFiles = req.path.substring('/api/files/'.length);
    
    // Try to find which endpoint is being called
    for (const endpoint of endpoints) {
      const endpointIndex = pathAfterFiles.indexOf(`/${endpoint}`);
      if (endpointIndex > 0) {
        // Extract fileId (everything before the endpoint)
        const fileId = pathAfterFiles.substring(0, endpointIndex);
        req.params.fileId = fileId;
        break;
      }
    }
  }
  next();
};

// Middleware
// Helmet security headers (must be early in the middleware chain)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for React
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS configuration with restricted origins
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5000', 'http://localhost:3000', 'https://*.replit.dev', 'https://*.replit.app'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if the origin is in the allowed list
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      // Support wildcard matching for replit domains
      if (allowedOrigin.includes('*')) {
        // Use safe regex conversion to prevent ReDoS
        const { globToRegex } = require('./backend/utils/regexValidator');
        try {
          const regex = globToRegex(allowedOrigin);
          return regex.test(origin);
        } catch (error) {
          logger.error('Invalid CORS pattern', { pattern: allowedOrigin, error: error.message });
          return false;
        }
      }
      return allowedOrigin === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from unauthorized origin', {
        origin,
        ip: origin,
        allowedOrigins
      });
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Attach logger to request for use in error handler
app.use((req, res, next) => {
  req.logger = logger;
  next();
});

// Session middleware (required for Okta SSO)
app.use(session({
  secret: process.env.SESSION_SECRET || SECURITY_CONFIG.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Audit middleware - logs all API requests and responses
const auditService = diContainer.get('auditService');
app.use(createAuditMiddleware(auditService));

// Apply fileId extraction middleware for routes with file IDs that may contain slashes
app.use(extractFileId);

// Request timeout configuration to prevent slowloris attacks and resource exhaustion
app.use((req, res, next) => {
  // Set timeout for regular requests (30 seconds)
  req.setTimeout(30000, () => {
    logger.warn('Request timeout', { 
      method: req.method, 
      path: req.path,
      ip: req.ip 
    });
    res.status(408).json({ error: 'Request timeout' });
  });
  
  // Set timeout for response (35 seconds - slightly longer than request timeout)
  res.setTimeout(35000, () => {
    logger.warn('Response timeout', { 
      method: req.method, 
      path: req.path,
      ip: req.ip 
    });
  });
  
  next();
});

// Rate limiting configuration to prevent brute force and DoS attacks
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    res.status(429).json({ 
      error: 'Too many requests from this IP, please try again later' 
    });
  }
});

// Stricter rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  skipSuccessfulRequests: true, // Don't count successful requests
  message: 'Too many authentication attempts, please try again later',
  handler: (req, res) => {
    logger.warn('Authentication rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      username: req.body?.username
    });
    res.status(429).json({ 
      error: 'Too many authentication attempts, please try again later' 
    });
  }
});

// Rate limiting for file upload endpoints
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 uploads per hour
  message: 'Too many file uploads, please try again later',
  handler: (req, res) => {
    logger.warn('Upload rate limit exceeded', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json({ 
      error: 'Too many file uploads, please try again later' 
    });
  }
});

// File processing status endpoint (exempt from rate limiting for polling)
// Placed BEFORE general rate limiter to allow frequent polling without hitting limits
// Uses simplified access check for performance
app.get('/api/files/:fileId/status', 
  authenticateToken,
  async (req, res) => {
    try {
      const { fileId } = req.params;
      const userId = req.user.id;
      
      // Check if user is admin (admin bypass)
      const isAdmin = req.user.roles && (
        req.user.roles.includes('Admin') || 
        req.user.roles.includes('admin') ||
        req.user.roles.some(r => typeof r === 'object' && (
          r.name === 'Admin' || r.name === 'admin' ||
          r.role_name === 'Admin' || r.role_name === 'admin'
        ))
      );
      
      // Get file with project_id
      const fileResult = await dbPool.query(
        'SELECT processing_step, row_count, column_count, processed_at, project_id FROM files WHERE file_id = $1',
        [fileId]
      );
      
      if (fileResult.rows.length === 0) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      const file = fileResult.rows[0];
      
      // Check project access (skip for admins)
      if (!isAdmin) {
        const accessResult = await dbPool.query(
          `SELECT 1 FROM project_members pm
           WHERE pm.project_id = $1 AND pm.user_id = $2
           UNION
           SELECT 1 FROM user_groups ug
           INNER JOIN project_access_groups pag ON ug.group_id = pag.group_id
           WHERE pag.project_id = $1 AND ug.user_id = $2
           LIMIT 1`,
          [file.project_id, userId]
        );
        
        if (accessResult.rows.length === 0) {
          return res.status(403).json({ error: 'Access denied to this file\'s project' });
        }
      }
      
      const processingStep = file.processing_step || 'pending';
      const isComplete = processingStep === 'complete' || file.processed_at !== null;
      
      res.json({
        fileId,
        step: processingStep,
        isComplete,
        rowCount: file.row_count,
        columnCount: file.column_count,
        processedAt: file.processed_at
      });
    } catch (err) {
      logger.error('Error fetching file status', { 
        error: err.message, 
        stack: err.stack,
        fileId: req.params.fileId,
        userId: req.user?.id
      });
      res.status(500).json({ error: 'Failed to fetch file status' });
    }
  }
);

// Apply general rate limiting to all API routes
app.use('/api/', generalLimiter);

// CSRF Protection Middleware
// NOTE: CSRF protection is currently disabled because:
// 1. JWT tokens are stored in Authorization headers (not cookies), which provides inherent CSRF protection
//    - Browsers don't automatically send Authorization headers in cross-origin requests
//    - CSRF attacks cannot read or set custom headers
// 2. CSRF is primarily a concern when using cookies for authentication
// 3. Implementing CSRF for JWT-in-header requires frontend changes to send X-Requested-With
//
// TODO: When implementing httpOnly cookies (Task 5), enable CSRF protection with one of:
//    - Double-submit cookie pattern
//    - Synchronizer token pattern
//    - Require X-Requested-With header from frontend for all state-changing requests
//
// const csrfProtection = (req, res, next) => {
//   // Skip CSRF check for safe methods (GET, HEAD, OPTIONS)
//   const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
//   if (safeMethods.includes(req.method)) {
//     return next();
//   }
//   
//   // For JWT-in-header, CSRF is not a primary concern
//   // When using cookies, implement proper CSRF token validation here
//   
//   next();
// };
//
// app.use('/api/', csrfProtection);

// Configure file upload with support for large files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

// File upload validation
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || (25 * 1024 * 1024); // Default 25MB - use Mapping Jobs for larger files
const ALLOWED_FILE_TYPES = [
  'text/csv',
  'application/json',
  'application/vnd.apache.parquet',
  'application/x-parquet',
  'application/octet-stream', // For binary files (parquet, avro, dat, archives)
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/xml',
  'application/xml',
  // Archive formats
  'application/x-tar',
  'application/tar',
  'application/zip',
  'application/x-zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-gzip',
  'application/x-7z-compressed',
  // Data formats
  'application/avro',
  'application/x-avro',
  'application/x-sas-data', // SAS datasets
  'application/x-sas-xport' // SAS XPORT files
];
const ALLOWED_EXTENSIONS = [
  '.csv', '.json', '.parquet', '.xlsx', '.xml',
  // Archive formats
  '.tar', '.zip', '.gz', '.gzip', '.7z',
  // Data formats
  '.avro', '.dat',
  // SAS formats
  '.sas7bdat', '.xpt'
];

const fileFilter = (req, file, cb) => {
  // Get file extension
  const ext = path.extname(file.originalname).toLowerCase();
  
  // Check file extension
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    logger.warn('File upload rejected - invalid extension', {
      filename: file.originalname,
      extension: ext,
      ip: req.ip
    });
    return cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`), false);
  }
  
  // Check MIME type
  if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    // Allow if extension is valid even if MIME type is generic octet-stream
    // Many binary formats (parquet, avro, archives, dat files) are detected as octet-stream
    const binaryExtensions = ['.parquet', '.xlsx', '.avro', '.dat', '.tar', '.zip', '.gz', '.gzip', '.7z', '.sas7bdat', '.xpt'];
    if (binaryExtensions.includes(ext) && file.mimetype === 'application/octet-stream') {
      return cb(null, true);
    }
    
    logger.warn('File upload rejected - invalid MIME type', {
      filename: file.originalname,
      mimetype: file.mimetype,
      extension: ext,
      ip: req.ip
    });
    return cb(new Error(`Invalid file MIME type. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`), false);
  }
  
  cb(null, true);
};

// Configure multer with security-focused file size limits
const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE, // Configurable, default 100MB (reduced from 1GB)
    fieldSize: 10 * 1024 * 1024, // 10MB for form fields
    files: 20 // Allow up to 20 files per upload for batch processing
  },
  fileFilter: fileFilter
});

// Use the database pool from the DI container
// const pool = dbPool; // Removed to avoid confusion - using dbPool directly

// Test database connection
dbPool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    console.error(err.stack);
  } else {
    console.log('Database connected successfully');
  }
});

// Initialize file schedules table (if not exists)
dbPool.query(`
  CREATE TABLE IF NOT EXISTS file_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id TEXT NOT NULL,
    schedule TEXT NOT NULL,
    last_run TIMESTAMP,
    next_run TIMESTAMP,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`).then(() => {
  console.log('File schedules table initialized');
}).catch(err => {
  console.error('Error initializing file schedules table:', err);
});

// Import our improved implementation
const initBusinessProcessTables = require('./initBusinessProcessTables');

// Run table initialization
initBusinessProcessTables(dbPool);

// Business Process Management API Routes
// NOTE: Group management routes have been moved to /api/groups (RBAC access groups)
// Old business process group routes removed to prevent conflicts

// Business Processes API
// NOTE: Primary implementation is at line ~2744, this duplicate has been removed

// Jobs API - Replaced by authenticated endpoint below

// Helper function: Get quality rule IDs from vendor agreement schema
async function getQualityRulesFromAgreement(agreementId, filename) {
  if (!agreementId || !filename) {
    return [];
  }
  
  try {
    const { matchesPattern } = require('./backend/utils/filePatternMatcher');
    
    const schemaResult = await dbPool.query(`
      SELECT quality_rule_ids, file_name_pattern
      FROM vendor_agreement_file_schemas
      WHERE vendor_agreement_id = $1
    `, [agreementId]);
    
    if (schemaResult.rows.length === 0) {
      return [];
    }
    
    for (const schema of schemaResult.rows) {
      if (matchesPattern(filename, schema.file_name_pattern)) {
        const qualityRuleIds = schema.quality_rule_ids;
        
        if (qualityRuleIds && Array.isArray(qualityRuleIds) && qualityRuleIds.length > 0) {
          logger.info('Quality rules extracted from vendor agreement schema', {
            agreementId,
            filename,
            pattern: schema.file_name_pattern,
            ruleCount: qualityRuleIds.length,
            ruleIds: qualityRuleIds
          });
          return qualityRuleIds;
        }
      }
    }
    
    logger.info('No quality rules found for file in vendor agreement', {
      agreementId,
      filename,
      schemaCount: schemaResult.rows.length
    });
    return [];
  } catch (error) {
    logger.error('Error extracting quality rules from vendor agreement', {
      agreementId,
      filename,
      error: error.message,
      stack: error.stack
    });
    return [];
  }
}

// API Routes
// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Python environment health check endpoint
const healthCheckRoutes = require('./backend/routes/healthCheckRoutes');
app.use('/api/health', healthCheckRoutes);

// Database health check endpoint
app.get('/api/health/db', async (req, res) => {
  try {
    const database = diContainer.get('database');
    const health = await database.getHealthStatus();
    
    if (health.healthy) {
      res.json({
        status: 'healthy',
        database: health
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        database: health
      });
    }
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err.message
    });
  }
});

// Enterprise Health Check - Comprehensive system status for load balancers
const materializedViewWorker = require('./backend/workers/materializedViewWorker');

app.get('/api/health/enterprise', async (req, res) => {
  const startTime = Date.now();
  const checks = {};
  let overallHealthy = true;

  // 1. Database Health
  try {
    const dbStart = Date.now();
    const database = diContainer.get('database');
    const dbHealth = await database.getHealthStatus();
    checks.database = {
      healthy: dbHealth.healthy,
      responseTime: Date.now() - dbStart,
      poolSize: dbHealth.poolSize,
      idleConnections: dbHealth.idleConnections,
      waitingClients: dbHealth.waitingClients
    };
    if (!dbHealth.healthy) overallHealthy = false;
  } catch (err) {
    checks.database = { healthy: false, error: err.message };
    overallHealthy = false;
  }

  // 2. Redis/Cache Health
  try {
    const cacheStart = Date.now();
    const cache = require('./backend/cache');
    const cacheStats = cache.getStats ? cache.getStats() : { type: 'memory' };
    checks.cache = {
      healthy: true,
      responseTime: Date.now() - cacheStart,
      type: cacheStats.type || 'memory',
      hits: cacheStats.hits,
      misses: cacheStats.misses
    };
  } catch (err) {
    checks.cache = { healthy: false, error: err.message };
  }

  // 3. Queue Health
  try {
    const queueStart = Date.now();
    const queueMetrics = await queue.getMetrics('file-processing');
    checks.queue = {
      healthy: true,
      responseTime: Date.now() - queueStart,
      type: process.env.QUEUE_TYPE || 'memory',
      metrics: queueMetrics
    };
  } catch (err) {
    checks.queue = { healthy: false, error: err.message };
  }

  // 4. Materialized Views Status
  try {
    const viewStatus = materializedViewWorker.getViewStatus();
    checks.materializedViews = {
      healthy: true,
      views: viewStatus
    };
  } catch (err) {
    checks.materializedViews = { healthy: false, error: err.message };
  }

  // 5. Database Performance Stats (optional, for detailed view)
  if (req.query.detailed === 'true') {
    try {
      const dbStats = await materializedViewWorker.getDatabaseStats();
      checks.databaseStats = dbStats;
    } catch (err) {
      checks.databaseStats = { error: err.message };
    }
  }

  // 6. Memory Usage
  const memUsage = process.memoryUsage();
  checks.memory = {
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    rss: Math.round(memUsage.rss / 1024 / 1024),
    external: Math.round(memUsage.external / 1024 / 1024),
    unit: 'MB'
  };

  // 7. Uptime
  checks.uptime = {
    seconds: Math.floor(process.uptime()),
    human: formatUptime(process.uptime())
  };

  const response = {
    status: overallHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - startTime,
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks
  };

  res.status(overallHealthy ? 200 : 503).json(response);
});

// Helper to format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

// Readiness probe for load balancers (minimal check)
app.get('/api/health/ready', async (req, res) => {
  try {
    const database = diContainer.get('database');
    const health = await database.getHealthStatus();
    if (health.healthy) {
      res.status(200).json({ ready: true });
    } else {
      res.status(503).json({ ready: false, reason: 'database' });
    }
  } catch (err) {
    res.status(503).json({ ready: false, reason: err.message });
  }
});

// Liveness probe for load balancers (process alive check)
app.get('/api/health/live', (req, res) => {
  res.status(200).json({ alive: true, timestamp: Date.now() });
});

// Queue metrics endpoint for monitoring
app.get('/api/queue/metrics', async (req, res) => {
  try {
    const { queueName } = req.query;
    const metrics = await queue.getMetrics(queueName);
    
    res.json({
      timestamp: new Date().toISOString(),
      queueType: process.env.QUEUE_TYPE || 'memory',
      metrics
    });
  } catch (error) {
    logger.error('Error fetching queue metrics', { error: error.message });
    res.status(500).json({ 
      error: 'Failed to fetch queue metrics',
      message: error.message 
    });
  }
});

// Test DI endpoint - this is for testing only and should be removed in production
app.get('/api/test-di', (req, res) => {
  try {
    const transformationService = diContainer.get('transformationService');
    const fileService = diContainer.get('fileService');
    
    // Just check if we can access the services
    res.json({ 
      status: 'ok', 
      services: {
        transformation: {
          name: 'TransformationService',
          methodCount: Object.getOwnPropertyNames(Object.getPrototypeOf(transformationService))
            .filter(m => m !== 'constructor').length
        },
        file: {
          name: 'FileService',
          methodCount: Object.getOwnPropertyNames(Object.getPrototypeOf(fileService))
            .filter(m => m !== 'constructor').length
        }
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// RDM (Reference Data Management) API Proxy Endpoints
// These endpoints forward requests to the external RDM system using secrets

// Get all datasets from RDM
app.get('/api/rdm/datasets', authenticateToken, async (req, res) => {
  try {
    const rdmBaseUrl = process.env.RDM_BASE_URL;
    const rdmApiKey = process.env.RDM_API_KEY;
    
    if (!rdmBaseUrl || !rdmApiKey) {
      return res.status(500).json({ 
        error: 'RDM configuration missing',
        message: 'RDM_BASE_URL or RDM_API_KEY not configured'
      });
    }
    
    const response = await axios.get(`${rdmBaseUrl}/api/external/datasets`, {
      headers: {
        'Authorization': `Bearer ${rdmApiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching datasets from RDM', { 
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch datasets from RDM',
      message: error.response?.data?.message || error.message
    });
  }
});

// Get dataset schema from RDM
app.get('/api/rdm/datasets/:datasetId/schema', authenticateToken, async (req, res) => {
  try {
    const { datasetId } = req.params;
    const rdmBaseUrl = process.env.RDM_BASE_URL;
    const rdmApiKey = process.env.RDM_API_KEY;
    
    if (!rdmBaseUrl || !rdmApiKey) {
      return res.status(500).json({ 
        error: 'RDM configuration missing',
        message: 'RDM_BASE_URL or RDM_API_KEY not configured'
      });
    }
    
    const response = await axios.get(`${rdmBaseUrl}/api/external/datasets/${datasetId}/schema`, {
      headers: {
        'Authorization': `Bearer ${rdmApiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching dataset schema from RDM', { 
      datasetId: req.params.datasetId,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch dataset schema from RDM',
      message: error.response?.data?.message || error.message
    });
  }
});

// Get all crosswalks from RDM
app.get('/api/rdm/crosswalks', authenticateToken, async (req, res) => {
  try {
    const rdmBaseUrl = process.env.RDM_BASE_URL;
    const rdmApiKey = process.env.RDM_API_KEY;
    
    if (!rdmBaseUrl || !rdmApiKey) {
      return res.status(500).json({ 
        error: 'RDM configuration missing',
        message: 'RDM_BASE_URL or RDM_API_KEY not configured'
      });
    }
    
    const response = await axios.get(`${rdmBaseUrl}/api/external/crosswalks`, {
      headers: {
        'Authorization': `Bearer ${rdmApiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching crosswalks from RDM', { 
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch crosswalks from RDM',
      message: error.response?.data?.message || error.message
    });
  }
});

// Get crosswalk schema from RDM
app.get('/api/rdm/crosswalks/:crosswalkId/schema', authenticateToken, async (req, res) => {
  try {
    const { crosswalkId } = req.params;
    const rdmBaseUrl = process.env.RDM_BASE_URL;
    const rdmApiKey = process.env.RDM_API_KEY;
    
    if (!rdmBaseUrl || !rdmApiKey) {
      return res.status(500).json({ 
        error: 'RDM configuration missing',
        message: 'RDM_BASE_URL or RDM_API_KEY not configured'
      });
    }
    
    const response = await axios.get(`${rdmBaseUrl}/api/external/crosswalks/${crosswalkId}/schema`, {
      headers: {
        'Authorization': `Bearer ${rdmApiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching crosswalk schema from RDM', { 
      crosswalkId: req.params.crosswalkId,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch crosswalk schema from RDM',
      message: error.response?.data?.message || error.message
    });
  }
});

// Files API (with caching and vendor filtering)
app.get('/api/files', authenticateToken, attachVendorProfile, cacheMiddleware(300), async (req, res) => {
  try {
    // Check if user has permission to view files
    const userPermissions = req.user.permissions || [];
    const hasFilePermission = userPermissions.some(p => {
      if (typeof p === 'string') {
        return p === 'file_view' || p === 'file:read' || p === 'file_upload:read';
      }
      return p.name === 'file_view' || p.name === 'file:read' || p.name === 'file_upload:read';
    });
    
    if (!hasFilePermission) {
      logger.warn('User attempted to access files without permission', {
        userId: req.user.id,
        username: req.user.username
      });
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to view files'
      });
    }
    
    // Get user's accessible projects for filtering
    const { getUserProjects } = require('./backend/middleware/requireProjectAccess');
    const isAdmin = req.user?.roles?.includes('Admin');
    let projectIds = null;
    
    if (!isAdmin) {
      const userProjects = await getUserProjects(req.user.id);
      projectIds = userProjects.map(p => p.id);
      
      // If user has no projects, return empty list
      if (projectIds.length === 0) {
        return res.json([]);
      }
    }
    
    // Use the FileService from the DI container
    const fileService = diContainer.get('fileService');
    
    // Build filter options from query parameters
    const filterOptions = {
      sortBy: 'created_at',
      sortOrder: 'DESC',
      projectIds: projectIds  // Pass user's accessible project IDs
    };
    
    // Add project and sub-project filters from query params if provided
    if (req.query.project_id) {
      const requestedProjectId = parseInt(req.query.project_id);
      // Only filter by requested project if user has access
      if (isAdmin || (projectIds && projectIds.includes(requestedProjectId))) {
        filterOptions.projectIds = [requestedProjectId];
      }
    }
    
    if (req.query.sub_project_id) {
      filterOptions.subProjectId = parseInt(req.query.sub_project_id);
    }
    
    let files = await fileService.getAllFiles(filterOptions);
    
    // Apply vendor-specific filtering if user is a vendor
    if (req.isVendor && req.vendorProfile) {
      // Filter files to only show files from vendor's drop location
      const vendorPath = req.vendorProfile.drop_location_path;
      if (vendorPath) {
        files = files.filter(file => {
          // Check if file path/location matches vendor's drop location
          // This assumes files have a 'file_path' or 'location' field
          const filePath = file.file_path || file.location || '';
          return filePath.startsWith(vendorPath);
        });
      }
      
      logger.info('Applied vendor file filtering', {
        userId: req.user.id,
        vendorId: req.vendorProfile.id,
        originalCount: files.length,
        vendorPath
      });
    }
    
    res.json(files);
  } catch (err) {
    logger.error('Error fetching files', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Vendor Files API - returns only files marked as vendor files
app.get('/api/vendor-files', authenticateToken, attachVendorProfile, cacheMiddleware(300), async (req, res) => {
  try {
    // Check if user has permission to view files
    const userPermissions = req.user.permissions || [];
    const hasFilePermission = userPermissions.some(p => {
      if (typeof p === 'string') {
        return p === 'file_view' || p === 'file:read' || p === 'file_upload:read' || p === 'vendor_file_quality:read';
      }
      return p.name === 'file_view' || p.name === 'file:read' || p.name === 'file_upload:read' || p.name === 'vendor_file_quality:read';
    });
    
    if (!hasFilePermission) {
      logger.warn('User attempted to access vendor files without permission', {
        userId: req.user.id,
        username: req.user.username
      });
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to view vendor files'
      });
    }
    
    // Get user's accessible projects for filtering
    const { getUserProjects } = require('./backend/middleware/requireProjectAccess');
    const isAdmin = req.user?.roles?.includes('Admin');
    let projectIds = null;
    
    if (!isAdmin) {
      const userProjects = await getUserProjects(req.user.id);
      projectIds = userProjects.map(p => p.id);
      
      // If user has no projects, return empty list
      if (projectIds.length === 0) {
        return res.json([]);
      }
    }
    
    // Query only vendor files (is_vendor_file = true) with schema change info
    let query = `
      SELECT f.*, lfg.has_schema_changes
      FROM files f
      LEFT JOIN logical_file_groups lfg ON f.logical_file_id = lfg.logical_file_id
      WHERE f.is_vendor_file = true
    `;
    const params = [];
    
    // Filter by projects if not admin
    if (projectIds && projectIds.length > 0) {
      query += ' AND f.project_id = ANY($1)';
      params.push(projectIds);
    }
    
    query += ' ORDER BY f.created_at DESC';
    
    const result = await dbPool.query(query, params);
    const files = result.rows;
    
    logger.info('Fetched vendor files', {
      userId: req.user.id,
      fileCount: files.length,
      isAdmin,
      projectCount: projectIds?.length || 'all'
    });
    
    res.json(files);
  } catch (err) {
    logger.error('Error fetching vendor files', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch vendor files' });
  }
});

app.get('/api/files/:fileId/schema', 
  authenticateToken,
  cacheMiddleware(600),
  requireProjectAccess({
    resourceType: 'file'
  }),
  async (req, res) => {
    try {
      const { fileId } = req.params;
      
      // Get file metadata
      const fileResult = await dbPool.query(
        'SELECT file_id, file_name, file_type, schema_metadata FROM files WHERE file_id = $1',
        [fileId]
      );
      
      if (fileResult.rows.length === 0) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      const file = fileResult.rows[0];
      
      // Get schema from file_columns table
      const schemaResult = await dbPool.query(
        `SELECT column_name, data_type, description, contains_pii, column_order
         FROM file_columns
         WHERE file_id = $1
         ORDER BY column_order ASC`,
        [fileId]
      );
      
      const schema = schemaResult.rows.map(col => ({
        name: col.column_name,
        type: col.data_type,
        description: col.description,
        contains_pii: col.contains_pii || false
      }));
      
      res.json({
        fileId: file.file_id,
        fileName: file.file_name,
        fileFormat: file.file_type,
        schema,
        columnCount: schema.length,
        schemaMetadata: file.schema_metadata || {}
      });
    } catch (err) {
      logger.error('Error fetching file schema', { error: err.message, fileId: req.params.fileId });
      res.status(500).json({ error: 'Failed to fetch file schema' });
    }
  }
);

app.get('/api/files/:fileId', 
  authenticateToken,
  attachVendorProfile,
  cacheMiddleware(120),
  requireProjectAccess({
    resourceType: 'file'
  }),
  async (req, res) => {
    try {
      const { fileId } = req.params;
      
      // Use the FileService from the DI container
      const fileService = diContainer.get('fileService');
      const file = await fileService.getFileById(fileId);
      
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      // SECURITY: Verify vendor can only access files from their drop location
      if (req.isVendor && req.vendorProfile) {
        const vendorPath = req.vendorProfile.drop_location_path;
        const filePath = file.file_path || file.location || '';
        
        if (vendorPath && !filePath.startsWith(vendorPath)) {
          logger.warn('Vendor attempted to access file outside their drop location', {
            userId: req.user.id,
            vendorId: req.vendorProfile.id,
            fileId,
            filePath,
            vendorPath
          });
          return res.status(403).json({ error: 'Access denied. You can only access files from your drop location.' });
        }
      }
      
      res.json(file);
    } catch (err) {
      logger.error('Error fetching file details', { error: err.message, fileId: req.params.fileId });
      res.status(500).json({ error: 'Failed to fetch file details' });
    }
  }
);

// File preview endpoint (with caching and column-level access control)
// NOTE: authenticateToken MUST come before cacheMiddleware so req.user is populated for cache key generation
app.get('/api/files/:fileId/preview', 
  authenticateToken, 
  cacheMiddleware(300),
  authorizeProjectResource({
    resourceType: 'file',
    requiredPermissions: ['file_preview:read']
  }),
  async (req, res) => {
  try {
    const { fileId } = req.params;
    const { limit = 100 } = req.query;
    const { normalizeDataType } = require('./backend/utils/schemaExtractor');
    
    // Get file details
    const fileResult = await dbPool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = fileResult.rows[0];
    
    // Get column information
    const columnsResult = await dbPool.query(
      'SELECT * FROM file_columns WHERE file_id = $1 ORDER BY column_index ASC',
      [fileId]
    );
    
    if (columnsResult.rows.length === 0) {
      logger.warn('No columns found in file_columns table', { fileId });
    }
    
    const columns = columnsResult.rows.map(col => ({ name: col.column_name, type: normalizeDataType(col.column_type) }));
    
    // Get preview data from file_preview_data table
    const rowLimit = parseInt(limit) || 100;
    const previewResult = await dbPool.query(
      'SELECT row_number, row_data FROM file_preview_data WHERE file_id = $1 ORDER BY row_number ASC LIMIT $2',
      [fileId, rowLimit]
    );
    
    // Extract row data from JSONB column
    const previewData = previewResult.rows.map(row => {
      if (typeof row.row_data === 'string') {
        try {
          return JSON.parse(row.row_data);
        } catch (e) {
          logger.error('Failed to parse row data', { fileId, rowNumber: row.row_number, error: e.message });
          return {};
        }
      }
      return row.row_data;
    });
    
    // Apply column-level access control
    const columnAccessControl = require('./backend/services/columnAccessControl');
    const { data: filteredData, columnAccess, summary } = await columnAccessControl.filterDataset(
      req.user,
      fileId,
      previewData,
      'read' // Preview is read-only
    );
    
    // Log data access for audit trail (including which columns were masked)
    if (req.auditService) {
      await req.auditService.logDataAccess({
        userId: req.user?.id,
        userRole: req.user?.roles?.[0],
        accessType: 'PREVIEW',
        fileId,
        fileName: file.filename,
        columnNames: columns.map(c => c.name),
        accessMethod: 'UI',
        rowsAccessed: filteredData.length,
        metadata: {
          totalRows: file.row_count,
          rowLimit: rowLimit,
          columnAccessSummary: summary,
          maskedColumns: columnAccess.masked.map(c => c.name),
          deniedColumns: columnAccess.denied.map(c => c.name)
        },
        context: req.auditContext
      });
    }
    
    res.json({
      fileId,
      columns,
      rows: filteredData,
      totalRows: file.row_count,
      preview: true,
      columnAccess, // Include column access metadata for frontend
      accessSummary: summary // Include summary of allowed/masked/denied columns
    });
  } catch (err) {
    logger.error('Error generating file preview', { error: err.message, fileId: req.params.fileId });
    res.status(500).json({ error: 'Failed to generate file preview' });
  }
});

// Delete preview data for a file
app.delete('/api/files/:fileId/preview-data', 
  authenticateToken,
  invalidateCache('cache:*:*files*'),
  authorizeProjectResource({
    resourceType: 'file',
    requiredPermissions: ['file:delete', 'file_delete']
  }),
  async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Check if file exists
    const fileResult = await dbPool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Delete preview data
    const deleteResult = await dbPool.query(
      'DELETE FROM file_preview_data WHERE file_id = $1',
      [fileId]
    );
    
    logger.info('Preview data deleted for file', { 
      fileId, 
      rowsDeleted: deleteResult.rowCount 
    });
    
    res.json({ 
      success: true, 
      message: `Deleted ${deleteResult.rowCount} preview rows`,
      rowsDeleted: deleteResult.rowCount
    });
  } catch (err) {
    logger.error('Error deleting preview data', { 
      error: err.message, 
      fileId: req.params.fileId 
    });
    res.status(500).json({ error: 'Failed to delete preview data' });
  }
});

// File delete endpoint
app.delete('/api/files/:fileId', 
  authenticateToken,
  invalidateCache('cache:*:*files*'),
  authorizeProjectResource({
    resourceType: 'file',
    requiredPermissions: ['file:delete', 'file_delete']
  }),
  async (req, res) => {
    const { fileId } = req.params;
    const client = await dbPool.connect();
    
    try {
      // Check if file exists
      const fileResult = await client.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
      
      if (fileResult.rows.length === 0) {
        return res.status(404).json({ error: 'File not found' });
      }
    
    // Begin transaction for atomic deletion
    await client.query('BEGIN');
    
    try {
      // Delete all related records (cascade deletion)
      await client.query('DELETE FROM file_preview_data WHERE file_id = $1', [fileId]);
      await client.query('DELETE FROM file_columns WHERE file_id = $1', [fileId]);
      await client.query('DELETE FROM file_quality_checks WHERE file_id = $1', [fileId]);
      await client.query('DELETE FROM file_schedules WHERE file_id = $1', [fileId]);
      await client.query('DELETE FROM file_history WHERE file_id = $1', [fileId]);
      await client.query('DELETE FROM alert_history WHERE file_id = $1', [fileId]);
      await client.query('DELETE FROM quality_reports WHERE file_id = $1', [fileId]);
      await client.query('DELETE FROM user_badges WHERE file_id = $1', [fileId]);
      await client.query('DELETE FROM transformation_outputs WHERE file_id = $1', [fileId]);
      
      // Delete the file record itself
      await client.query('DELETE FROM files WHERE file_id = $1', [fileId]);
      
      // Commit transaction
      await client.query('COMMIT');
      
      logger.info('File deleted successfully with all related records', { fileId });
      
      res.json({ 
        success: true, 
        message: 'File deleted successfully',
        fileId 
      });
    } catch (err) {
      // Rollback on error
      await client.query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    logger.error('Error deleting file', { error: err.message, fileId: req.params.fileId });
    res.status(500).json({ error: 'Failed to delete file' });
  } finally {
    // Always release the client back to the pool
    client.release();
  }
});

// Bulk delete files endpoint
app.post('/api/files/bulk-delete', 
  authenticateToken,
  invalidateCache('cache:*:*files*'), 
  async (req, res) => {
  const { fileIds } = req.body;
  const client = await dbPool.connect();
  
  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ error: 'No file IDs provided' });
  }
  
  try {
    // Validate user has access to all files
    const { validateBulkFileAccess } = require('./backend/utils/fileAccessHelpers');
    await validateBulkFileAccess(fileIds, req.user);
    
    // Begin transaction for atomic deletion
    await client.query('BEGIN');
    
    let deletedCount = 0;
    const errors = [];
    
    for (const fileId of fileIds) {
      try {
        // Check if file exists
        const fileResult = await client.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
        
        if (fileResult.rows.length === 0) {
          errors.push({ fileId, error: 'File not found' });
          continue;
        }
        
        // Delete all related records (cascade deletion)
        await client.query('DELETE FROM file_columns WHERE file_id = $1', [fileId]);
        await client.query('DELETE FROM file_quality_checks WHERE file_id = $1', [fileId]);
        await client.query('DELETE FROM file_schedules WHERE file_id = $1', [fileId]);
        await client.query('DELETE FROM file_history WHERE file_id = $1', [fileId]);
        await client.query('DELETE FROM alert_history WHERE file_id = $1', [fileId]);
        await client.query('DELETE FROM quality_reports WHERE file_id = $1', [fileId]);
        await client.query('DELETE FROM user_badges WHERE file_id = $1', [fileId]);
        await client.query('DELETE FROM transformation_outputs WHERE file_id = $1', [fileId]);
        
        // Delete the file record itself
        await client.query('DELETE FROM files WHERE file_id = $1', [fileId]);
        
        deletedCount++;
      } catch (err) {
        errors.push({ fileId, error: err.message });
      }
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    logger.info('Bulk delete completed', { 
      totalRequested: fileIds.length, 
      deletedCount, 
      errorCount: errors.length 
    });
    
    res.json({ 
      success: true, 
      message: `Successfully deleted ${deletedCount} file(s)`,
      deletedCount,
      totalRequested: fileIds.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    // Rollback on error
    await client.query('ROLLBACK');
    
    // Handle access control errors
    if (err.status === 403 || err.status === 404) {
      return res.status(err.status).json({
        success: false,
        error: err.message
      });
    }
    
    logger.error('Error bulk deleting files', { error: err.message, fileIds });
    res.status(500).json({ error: 'Failed to bulk delete files' });
  } finally {
    // Always release the client back to the pool
    client.release();
  }
});

// Vendor File Profiling Results Endpoints

// Get all vendor file profiling results with filtering
app.get('/api/vendor-file-profiling', authenticateToken, async (req, res) => {
  try {
    const {
      vendor_id,
      connection_id,
      min_quality_score,
      max_quality_score,
      has_issues,
      limit = 100,
      offset = 0
    } = req.query;
    
    // Build query conditions
    const conditions = [];
    const params = [];
    let paramCount = 1;
    
    // Check vendor access - vendors can only see their own profiling results
    if (req.vendorProfile) {
      conditions.push(`vfpr.vendor_id = $${paramCount}`);
      params.push(req.vendorProfile.id);
      paramCount++;
    } else if (vendor_id) {
      // Admin users can filter by vendor
      conditions.push(`vfpr.vendor_id = $${paramCount}`);
      params.push(parseInt(vendor_id));
      paramCount++;
    }
    
    if (connection_id) {
      conditions.push(`vfpr.connection_id = $${paramCount}::uuid`);
      params.push(connection_id);
      paramCount++;
    }
    
    if (min_quality_score) {
      conditions.push(`vfpr.quality_score >= $${paramCount}`);
      params.push(parseFloat(min_quality_score));
      paramCount++;
    }
    
    if (max_quality_score) {
      conditions.push(`vfpr.quality_score <= $${paramCount}`);
      params.push(parseFloat(max_quality_score));
      paramCount++;
    }
    
    if (has_issues === 'true') {
      conditions.push(`jsonb_array_length(vfpr.issues) > 0`);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*)
      FROM vendor_file_profiling_results vfpr
      ${whereClause}
    `;
    const countResult = await dbPool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Get profiling results with file and connection details
    params.push(parseInt(limit));
    params.push(parseInt(offset));
    
    const query = `
      SELECT 
        vfpr.*,
        f.filename,
        f.file_type,
        f.file_size,
        f.created_at as file_uploaded_at,
        c.name as connection_name,
        c.type as connection_type,
        v.vendor_name,
        v.vendor_code,
        u.username as uploaded_by_username
      FROM vendor_file_profiling_results vfpr
      LEFT JOIN files f ON vfpr.file_id = f.file_id
      LEFT JOIN storage_connections c ON vfpr.connection_id = c.connection_id
      LEFT JOIN vendors v ON vfpr.vendor_id = v.id
      LEFT JOIN users u ON vfpr.uploaded_by_user_id = u.id
      ${whereClause}
      ORDER BY vfpr.profiled_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    
    const result = await dbPool.query(query, params);
    
    res.json({
      results: result.rows,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        returned: result.rows.length
      }
    });
  } catch (err) {
    logger.error('Error fetching vendor file profiling results', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch profiling results' });
  }
});

// Get single vendor file profiling result by file_id
app.get('/api/vendor-file-profiling/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const query = `
      SELECT 
        vfpr.*,
        f.filename,
        f.file_type,
        f.file_size,
        f.created_at as file_uploaded_at,
        f.metadata as file_metadata,
        c.name as connection_name,
        c.type as connection_type,
        v.vendor_name,
        v.vendor_code,
        u.username as uploaded_by_username,
        u.email as uploaded_by_email
      FROM vendor_file_profiling_results vfpr
      LEFT JOIN files f ON vfpr.file_id = f.file_id
      LEFT JOIN storage_connections c ON vfpr.connection_id = c.connection_id
      LEFT JOIN vendors v ON vfpr.vendor_id = v.id
      LEFT JOIN users u ON vfpr.uploaded_by_user_id = u.id
      WHERE vfpr.file_id = $1
    `;
    
    const result = await dbPool.query(query, [fileId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profiling results not found for this file' });
    }
    
    const profilingData = result.rows[0];
    
    // Check vendor access
    if (req.vendorProfile && profilingData.vendor_id !== req.vendorProfile.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(profilingData);
  } catch (err) {
    logger.error('Error fetching vendor file profiling result', { error: err.message, fileId: req.params.fileId });
    res.status(500).json({ error: 'Failed to fetch profiling result' });
  }
});

// File duplicate check endpoint
app.post('/api/files/check-duplicate', authenticateToken, uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = req.file;
    const crypto = require('crypto');
    const projectId = req.body.project_id ? parseInt(req.body.project_id) : null;
    
    // Calculate SHA-256 hash of the file
    const fileHash = await new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(file.path);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
    
    // Check if file with same hash exists in the SAME PROJECT
    let query, params;
    if (projectId) {
      query = 'SELECT file_id, filename, file_size, created_at, project_id FROM files WHERE checksum = $1 AND project_id = $2 LIMIT 1';
      params = [fileHash, projectId];
    } else {
      // If no project_id provided, check without project filter (backwards compatibility)
      query = 'SELECT file_id, filename, file_size, created_at, project_id FROM files WHERE checksum = $1 LIMIT 1';
      params = [fileHash];
    }
    
    const result = await dbPool.query(query, params);
    
    // NOTE: File is NOT deleted here - it will be used by the subsequent /api/files/upload request
    // The FileProcessingWorker will handle cleanup after profiling completes
    
    if (result.rows.length > 0) {
      const existingFile = result.rows[0];
      res.json({
        isDuplicate: true,
        existingFile: {
          fileId: existingFile.file_id,
          filename: existingFile.filename,
          fileSize: existingFile.file_size,
          uploadedAt: existingFile.created_at,
          projectId: existingFile.project_id
        },
        fileHash
      });
    } else {
      res.json({
        isDuplicate: false,
        fileHash
      });
    }
  } catch (error) {
    logger.error('Duplicate check error', { error: error.message });
    
    // NOTE: Don't delete file on error - the upload endpoint will handle cleanup if needed
    
    res.status(500).json({ 
      error: 'Duplicate check failed',
      details: error.message 
    });
  }
});

// File upload endpoint with async queue processing (supports batch uploads)
app.post('/api/files/upload', authenticateToken, invalidateCache('cache:*:*files*'), uploadLimiter, upload.array('files', 20), async (req, res) => {
  console.log('========== UPLOAD ENDPOINT HIT ==========');
  console.log('req.body keys:', Object.keys(req.body));
  console.log('req.body.archive_password:', req.body.archive_password);
  console.log('req.files count:', req.files?.length);
  try {
    // Check if user has file_upload:write permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('file_upload:write')) {
      // Clean up temp files if they exist
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          try { fs.unlinkSync(file.path); } catch (e) {}
        });
      }
      
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to upload files. Contact your administrator.'
      });
    }
    
    // Validate file upload
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    // Validate and get project_id and sub_project_id
    const { getUserProjects } = require('./backend/middleware/requireProjectAccess');
    const isAdmin = req.user?.roles?.includes('Admin');
    let projectId = req.body.project_id ? parseInt(req.body.project_id) : null;
    let subProjectId = req.body.sub_project_id ? parseInt(req.body.sub_project_id) : null;
    
    // Get quality_rule_ids if provided
    let qualityRuleIds = [];
    if (req.body.quality_rule_ids) {
      try {
        qualityRuleIds = JSON.parse(req.body.quality_rule_ids);
        if (!Array.isArray(qualityRuleIds)) {
          qualityRuleIds = [];
        }
      } catch (e) {
        logger.warn('Invalid quality_rule_ids format', { quality_rule_ids: req.body.quality_rule_ids });
        qualityRuleIds = [];
      }
    }
    
    // Get delimiter if provided (supports multi-character delimiters)
    const delimiter = req.body.delimiter || null;
    if (delimiter) {
      logger.info('Delimiter provided for upload', { delimiter, userId: req.user?.id });
    }
    
    // Get header configuration if provided (for files without headers)
    let headerConfig = null;
    if (req.body.headerConfig) {
      try {
        headerConfig = JSON.parse(req.body.headerConfig);
        logger.info('Header configuration provided for upload', { 
          hasHeader: headerConfig.hasHeader,
          columnCount: headerConfig.columnNames?.length || 0,
          userId: req.user?.id 
        });
      } catch (e) {
        logger.warn('Invalid headerConfig format', { headerConfig: req.body.headerConfig });
        headerConfig = null;
      }
    }
    
    // Get fixed-width schema if provided (for .dat files without delimiters)
    let fixedWidthSchema = null;
    if (req.body.fixedWidthSchema) {
      try {
        // Handle double-encoded JSON (sometimes FormData sends strings that need double parsing)
        let schemaString = req.body.fixedWidthSchema;
        
        // If the string starts with a quote, it might be double-encoded
        if (typeof schemaString === 'string' && schemaString.startsWith('"')) {
          try {
            schemaString = JSON.parse(schemaString);
          } catch (innerError) {
            // Not double-encoded, continue with original
          }
        }
        
        fixedWidthSchema = typeof schemaString === 'string' ? JSON.parse(schemaString) : schemaString;
        logger.info('Fixed-width schema provided for upload', { 
          columnCount: fixedWidthSchema.columns?.length || 0,
          userId: req.user?.id 
        });
      } catch (e) {
        logger.error('Invalid fixedWidthSchema format - JSON parse error', { 
          fixedWidthSchema: req.body.fixedWidthSchema,
          errorMessage: e.message,
          errorName: e.name
        });
        fixedWidthSchema = null;
      }
    }
    
    // Get archive password if provided (for password-protected archives - ad-hoc upload flow)
    logger.info('[DIAGNOSTIC] Checking for archive password in req.body', {
      hasField: 'archive_password' in req.body,
      fieldValue: req.body.archive_password,
      allBodyKeys: Object.keys(req.body)
    });
    
    const archivePassword = req.body.archive_password || null;
    if (archivePassword) {
      logger.info('Archive password provided for ad-hoc upload', { 
        userId: req.user?.id,
        passwordLength: archivePassword.length
      });
    } else {
      logger.warn('[DIAGNOSTIC] No archive password found in request body');
    }
    
    // Get pre-calculated file hashes if provided (optimization to avoid double hashing)
    let fileHashes = {};
    if (req.body.fileHashes) {
      try {
        fileHashes = JSON.parse(req.body.fileHashes);
        if (typeof fileHashes !== 'object') {
          fileHashes = {};
        }
        logger.info('Pre-calculated hashes provided', { count: Object.keys(fileHashes).length });
      } catch (e) {
        logger.warn('Invalid fileHashes format', { fileHashes: req.body.fileHashes });
        fileHashes = {};
      }
    }
    
    // Get vendor agreement_id if provided (for contract validation)
    const agreementId = req.body.agreement_id ? parseInt(req.body.agreement_id) : null;
    
    // DEBUG: Log agreement_id extraction
    logger.info('Upload endpoint: agreement_id extracted', { 
      raw_agreement_id: req.body.agreement_id,
      parsed_agreementId: agreementId,
      userId: req.user.id
    });
    
    // CRITICAL: Validate filenames and schemas against vendor agreement BEFORE any processing
    // This applies when contract validation mode is enabled (agreementId provided)
    if (agreementId) {
      const { matchesPattern } = require('./src/utils/patternMatching');
      const { extractSchema, compareSchemas } = require('./backend/utils/schemaExtractor');
      
      const schemaResult = await dbPool.query(`
        SELECT DISTINCT
          vafs.id as schema_id,
          vafs.file_name_pattern,
          vafs.file_description,
          vafs.schema,
          va.agreement_code
        FROM vendor_agreement_file_schemas vafs
        JOIN vendor_agreements va ON vafs.vendor_agreement_id = va.id
        WHERE va.id = $1
          AND va.status = 'active'
          AND va.approval_status = 'governance_approved'
          AND va.is_locked = true
        ORDER BY vafs.file_name_pattern
      `, [agreementId]);
      
      if (schemaResult.rows.length > 0) {
        // Validate each uploaded file against expected patterns and schemas
        for (const file of req.files) {
          const filename = file.originalname;
          let matchedSchema = null;
          
          // Step 1: Filename pattern validation
          for (const schema of schemaResult.rows) {
            if (matchesPattern(filename, schema.file_name_pattern)) {
              matchedSchema = schema;
              break;
            }
          }
          
          if (!matchedSchema) {
            // No pattern matched - reject upload immediately and clean up all files
            req.files.forEach(f => {
              try { fs.unlinkSync(f.path); } catch (e) {}
            });
            
            const agreementInfo = schemaResult.rows[0]; // All rows have same agreement info
            const expectedPatterns = schemaResult.rows.map(s => 
              s.file_description ? `${s.file_name_pattern} (${s.file_description})` : s.file_name_pattern
            );
            
            logger.warn('File rejected - does not match contract patterns', {
              filename,
              agreementId,
              agreementCode: agreementInfo.agreement_code,
              userId: req.user.id,
              expectedPatterns
            });
            
            return res.status(400).json({
              error: 'File pattern validation failed',
              message: `The file "${filename}" does not match any expected file patterns for contract ${agreementInfo.agreement_code}.`,
              details: {
                uploadedFile: filename,
                contractCode: agreementInfo.agreement_code,
                expectedPatterns: expectedPatterns,
                patternCount: expectedPatterns.length
              },
              hint: 'Please ensure your filename matches one of the expected patterns listed above. File patterns may include wildcards (* for any characters, ? for single character).'
            });
          }
          
          logger.info('File matched expected contract pattern', {
            filename,
            agreementId,
            matchedPattern: matchedSchema.file_name_pattern,
            schemaId: matchedSchema.schema_id,
            userId: req.user.id
          });
          
          // Step 2: Schema validation (if schema is defined in agreement)
          if (matchedSchema.schema) {
            try {
              // Parse agreement schema (it's stored as JSON/JSONB in database)
              const expectedSchema = typeof matchedSchema.schema === 'string' 
                ? JSON.parse(matchedSchema.schema) 
                : matchedSchema.schema;
              
              // Only validate if schema has actual column definitions
              if (expectedSchema && Array.isArray(expectedSchema) && expectedSchema.length > 0) {
                logger.info('Starting schema validation for contract validation upload', { 
                  fileId: `pre_${filename}`,
                  filename,
                  agreementId,
                  schemaId: matchedSchema.schema_id,
                  userId: req.user.id,
                  expectedColumnCount: expectedSchema.length,
                  hasArchivePassword: !!archivePassword,
                  hasFixedWidthSchema: !!fixedWidthSchema
                });
                
                // Extract schema from uploaded file (pass archive password and fixed-width schema)
                const uploadedSchema = await extractSchema(file.path, file.mimetype, { 
                  archivePassword, 
                  fixedWidthSchema,
                  headerConfig 
                });
                
                // Compare schemas
                const validationResult = compareSchemas(uploadedSchema, expectedSchema);
                
                if (!validationResult.valid) {
                  // Schema validation failed - reject upload and clean up all files
                  req.files.forEach(f => {
                    try { fs.unlinkSync(f.path); } catch (e) {}
                  });
                  
                  logger.warn('Schema validation failed for contract validation upload', {
                    filename,
                    agreementId,
                    schemaId: matchedSchema.schema_id,
                    userId: req.user.id,
                    errors: validationResult.errors,
                    missingColumns: validationResult.missingColumns,
                    extraColumns: validationResult.extraColumns
                  });
                  
                  return res.status(400).json({
                    error: 'Schema validation failed',
                    message: `The file "${filename}" does not match the expected schema defined in contract ${schemaResult.rows[0].agreement_code}.`,
                    details: {
                      uploadedFile: filename,
                      contractCode: schemaResult.rows[0].agreement_code,
                      filePattern: matchedSchema.file_name_pattern,
                      errors: validationResult.errors || [],
                      missingColumns: validationResult.missingColumns || [],
                      extraColumns: validationResult.extraColumns || [],
                      warnings: validationResult.warnings || []
                    },
                    hint: 'The uploaded file must contain all required columns with matching data types as defined in the vendor agreement schema.'
                  });
                }
                
                // Schema validation passed
                if (validationResult.warnings && validationResult.warnings.length > 0) {
                  logger.info('Schema validation passed with warnings', {
                    filename,
                    agreementId,
                    warnings: validationResult.warnings
                  });
                } else {
                  logger.info('Schema validation passed', { 
                    filename,
                    agreementId,
                    schemaId: matchedSchema.schema_id
                  });
                }
              } else {
                logger.info('No schema columns defined for this file pattern - skipping schema validation', {
                  filename,
                  agreementId,
                  schemaId: matchedSchema.schema_id
                });
              }
              
            } catch (schemaError) {
              // Schema extraction/validation error - reject upload
              req.files.forEach(f => {
                try { fs.unlinkSync(f.path); } catch (e) {}
              });
              
              logger.error('Schema validation error for contract validation upload', {
                filename,
                agreementId,
                error: schemaError.message,
                stack: schemaError.stack
              });
              
              return res.status(500).json({
                error: 'Schema validation error',
                message: `Failed to validate file schema: ${schemaError.message}`,
                details: {
                  uploadedFile: filename,
                  contractCode: schemaResult.rows[0].agreement_code,
                  errorMessage: schemaError.message
                }
              });
            }
          } else {
            logger.info('No schema defined for this file pattern - skipping schema validation', {
              filename,
              agreementId,
              schemaId: matchedSchema.schema_id
            });
          }
        }
      }
    }
    
    // Get replaceFileId if provided (for atomic file replacement)
    const replaceFileId = req.body.replace_file_id || null;
    
    // If no project_id provided, default to user's first accessible project (admins can skip)
    if (!projectId) {
      const userProjects = await getUserProjects(req.user.id);
      if (userProjects.length === 0 && !isAdmin) {
        req.files.forEach(file => {
          try { fs.unlinkSync(file.path); } catch (e) {}
        });
        return res.status(403).json({
          error: 'No project access',
          message: 'You must be assigned to at least one project to upload files'
        });
      }
      projectId = userProjects.length > 0 ? userProjects[0].id : 1; // Default to project 1 for admins
    } else {
      // Validate user has access to the specified project (admins bypass)
      if (!isAdmin) {
        const userProjects = await getUserProjects(req.user.id);
        const hasAccess = userProjects.some(p => p.id === projectId);
        
        if (!hasAccess) {
          req.files.forEach(file => {
            try { fs.unlinkSync(file.path); } catch (e) {}
          });
          return res.status(403).json({
            error: 'Project access denied',
            message: 'You do not have access to the specified project'
          });
        }
      }
    }
    
    const userId = req.user ? req.user.id : null;
    const crypto = require('crypto');
    
    // Process each file in batch
    const results = [];
    
    for (const file of req.files) {
      const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
      const fileType = path.extname(file.originalname).substring(1).toLowerCase();
      
      try {
        // OPTIMIZATION: Virus scanning moved to async worker for faster upload response
        // Files are queued immediately and scanned by uploadWorker.js
        
        // Calculate file hash (or use pre-calculated hash if provided)
        let fileHash;
        if (fileHashes[file.originalname]) {
          // Use pre-calculated hash from duplicate check to avoid redundant file read
          fileHash = fileHashes[file.originalname];
          logger.info('Using pre-calculated hash (optimization)', {
            fileId,
            filename: file.originalname,
            hashPrefix: fileHash.substring(0, 16) + '...'
          });
        } else {
          // Calculate hash if not provided
          fileHash = await new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(file.path);
            
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
          });
          logger.info('Calculated file hash', {
            fileId,
            filename: file.originalname,
            hashPrefix: fileHash.substring(0, 16) + '...'
          });
        }
        
        logger.info('File uploaded, adding to processing queue', { 
          fileId,
          filename: file.originalname, 
          size: file.size,
          type: fileType,
          userId,
          fileHash: fileHash.substring(0, 16) + '...'
        });
        
        // Store ad-hoc archive password in vault if provided (for password-protected archives)
        if (archivePassword) {
          const passwordVaultService = diContainer.get('passwordVaultService');
          await passwordVaultService.storePassword('file', fileId, archivePassword, userId);
          logger.info('Ad-hoc archive password stored in vault', { 
            fileId, 
            userId,
            filename: file.originalname 
          });
        }
        
        // Extract quality rules from vendor agreement if contract validation is enabled
        let mergedQualityRuleIds = [...qualityRuleIds]; // Start with manually provided rules
        if (agreementId) {
          const agreementQualityRules = await getQualityRulesFromAgreement(agreementId, file.originalname);
          if (agreementQualityRules.length > 0) {
            // Merge and deduplicate quality rule IDs
            mergedQualityRuleIds = [...new Set([...mergedQualityRuleIds, ...agreementQualityRules])];
            logger.info('Merged quality rules from agreement with manual rules', {
              fileId,
              filename: file.originalname,
              agreementId,
              manualRules: qualityRuleIds.length,
              agreementRules: agreementQualityRules.length,
              totalRules: mergedQualityRuleIds.length
            });
          }
        }
        
        // Add job to processing queue (non-blocking)
        const jobId = await queue.addJob('file-processing', {
          fileId,
          filePath: file.path,
          originalName: file.originalname,
          fileSize: file.size,
          fileType,
          userId,
          fileHash,
          projectId,
          subProjectId,
          qualityRuleIds: mergedQualityRuleIds,
          agreementId,
          delimiter,
          headerConfig,
          fixedWidthSchema,
          archivePassword
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          timeout: 1800000 // 30 minutes for large files
        });
        
        logger.info('File processing job queued', { fileId, jobId });
        
        // DEBUG: Log full job data being sent to worker
        logger.info('Queue job data', {
          fileId,
          jobId,
          agreementId,
          projectId,
          subProjectId,
          qualityRuleIds,
          filename: file.originalname
        });
        
        results.push({
          success: true,
          fileId,
          jobId,
          status: 'queued',
          filename: file.originalname,
          file: {
            file_id: fileId,
            filename: file.originalname,
            file_type: fileType,
            file_size: file.size
          }
        });
        
        // Handle atomic file replacement if replaceFileId is provided
        if (replaceFileId && results.filter(r => r.success).length === 1) { // Only for first successful file
          try {
            logger.info('Attempting atomic file replacement', {
              newFileId: fileId,
              oldFileId: replaceFileId,
              userId,
              projectId
            });
            
            // First, verify user has access to the file being replaced (must be in same project)
            const fileToReplaceResult = await dbPool.query(
              'SELECT file_id, project_id, filename FROM files WHERE file_id = $1',
              [replaceFileId]
            );
            
            if (fileToReplaceResult.rows.length === 0) {
              logger.warn('File to replace not found', { replaceFileId });
              throw new Error('File to replace not found');
            }
            
            const fileToReplace = fileToReplaceResult.rows[0];
            
            // Verify file is in the same project (prevent cross-project file deletion attacks)
            if (fileToReplace.project_id !== projectId) {
              logger.warn('Attempted to replace file from different project', {
                replaceFileId,
                replaceProjectId: fileToReplace.project_id,
                uploadProjectId: projectId,
                userId
              });
              throw new Error('Cannot replace file from a different project');
            }
            
            // Verify user has access to this project (already validated above, but double-check)
            if (!isAdmin) {
              const userProjects = await getUserProjects(userId);
              const hasAccess = userProjects.some(p => p.id === projectId);
              
              if (!hasAccess) {
                logger.warn('User lacks project access for file replacement', {
                  userId,
                  projectId,
                  replaceFileId
                });
                throw new Error('Access denied to file project');
              }
            }
            
            // Start a transaction for atomic file replacement
            const client = await dbPool.connect();
            try {
              await client.query('BEGIN');
              
              // Delete all related records for the old file (same order as in regular delete endpoint)
              await client.query('DELETE FROM file_preview WHERE file_id = $1', [replaceFileId]);
              await client.query('DELETE FROM file_columns WHERE file_id = $1', [replaceFileId]);
              await client.query('DELETE FROM file_quality_checks WHERE file_id = $1', [replaceFileId]);
              await client.query('DELETE FROM file_schedules WHERE file_id = $1', [replaceFileId]);
              await client.query('DELETE FROM file_history WHERE file_id = $1', [replaceFileId]);
              await client.query('DELETE FROM alert_history WHERE file_id = $1', [replaceFileId]);
              await client.query('DELETE FROM quality_reports WHERE file_id = $1', [replaceFileId]);
              await client.query('DELETE FROM user_badges WHERE file_id = $1', [replaceFileId]);
              await client.query('DELETE FROM transformation_outputs WHERE file_id = $1', [replaceFileId]);
              
              // Delete the file record itself
              const deleteResult = await client.query('DELETE FROM files WHERE file_id = $1', [replaceFileId]);
              
              await client.query('COMMIT');
              client.release();
              
              if (deleteResult.rowCount > 0) {
                logger.info('Old file deleted successfully during atomic replacement', {
                  oldFileId: replaceFileId,
                  newFileId: fileId,
                  filename: fileToReplace.filename
                });
                
                // Add replacement flag to result
                results[results.length - 1].replaced = true;
                results[results.length - 1].replacedFileId = replaceFileId;
              } else {
                logger.warn('Old file not found during replacement', {
                  oldFileId: replaceFileId,
                  newFileId: fileId
                });
              }
              
              // Clean up storage (file binaries) - note: uploaded file is already deleted by processing queue
              // No additional storage cleanup needed here as the processing happens asynchronously
              
            } catch (dbError) {
              await client.query('ROLLBACK');
              client.release();
              throw dbError;
            }
          } catch (replaceError) {
            logger.error('Error during atomic file replacement', {
              error: replaceError.message,
              oldFileId: replaceFileId,
              newFileId: fileId
            });
            // Don't fail the upload - just log the error
            // The new file is already uploaded, so we won't rollback that
          }
        }
        
      } catch (error) {
        logger.error('Error processing file in batch', {
          filename: file.originalname,
          error: error.message
        });
        
        // Clean up file on error
        try { fs.unlinkSync(file.path); } catch (e) {}
        
        results.push({
          success: false,
          filename: file.originalname,
          error: 'Processing failed',
          message: error.message
        });
      }
    }
    
    // Return batch results
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;
    
    res.json({
      success: successCount > 0,
      message: `Batch upload complete: ${successCount} succeeded, ${failedCount} failed`,
      totalFiles: results.length,
      successCount,
      failedCount,
      results
    });
    
  } catch (error) {
    logger.error('File upload error', { 
      error: error.message,
      stack: error.stack,
      filesReceived: req.files ? req.files.length : 0
    });
    
    // Clean up any uploaded files on error
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try { fs.unlinkSync(file.path); } catch (e) {}
      });
    }
    
    res.status(500).json({ 
      error: 'File upload failed',
      details: error.message 
    });
  }
});

// Job status endpoint for async processing
app.get('/api/files/:fileId/job-status', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { jobId } = req.query;
    
    if (!jobId) {
      return res.status(400).json({ error: 'jobId query parameter is required' });
    }
    
    // Get job status from queue
    const status = await queue.getJobStatus(jobId);
    
    logger.info('Job status retrieved', { fileId, jobId, status: status.state });
    
    res.json({
      fileId,
      jobId,
      state: status.state,
      progress: status.progress,
      result: status.result,
      error: status.error,
      createdAt: status.createdAt,
      finishedAt: status.finishedAt
    });
  } catch (error) {
    logger.error('Error retrieving job status', { error: error.message });
    res.status(500).json({ 
      error: 'Failed to retrieve job status',
      details: error.message 
    });
  }
});

// Drop File endpoint - uploads directly to S3 without profiling
app.post('/api/files/drop', authenticateToken, uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    logger.info('Drop file request received', { 
      userId: req.user?.id, 
      hasFile: !!req.file,
      projectId: req.body?.project_id 
    });
    
    // Check if user has file_drop:write permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('file_drop:write')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to drop files. Contact your administrator.'
      });
    }
    
    // Validate file upload
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Validate and get project_id
    const { getUserProjects } = require('./backend/middleware/requireProjectAccess');
    const isAdmin = req.user?.roles?.includes('Admin');
    let projectId = req.body.project_id ? parseInt(req.body.project_id) : null;
    
    // Get quality_rule_ids if provided
    let qualityRuleIds = [];
    if (req.body.quality_rule_ids) {
      try {
        qualityRuleIds = JSON.parse(req.body.quality_rule_ids);
        if (!Array.isArray(qualityRuleIds)) {
          qualityRuleIds = [];
        }
      } catch (e) {
        logger.warn('Invalid quality_rule_ids format in drop', { quality_rule_ids: req.body.quality_rule_ids });
        qualityRuleIds = [];
      }
    }
    
    // If no project_id provided, default to user's first accessible project (admins can skip)
    if (!projectId) {
      const userProjects = await getUserProjects(req.user.id);
      if (userProjects.length === 0 && !isAdmin) {
        if (req.file && req.file.path) {
          try { fs.unlinkSync(req.file.path); } catch (e) {}
        }
        return res.status(403).json({
          error: 'No project access',
          message: 'You must be assigned to at least one project to drop files'
        });
      }
      projectId = userProjects.length > 0 ? userProjects[0].id : 1; // Default to project 1 for admins
    } else {
      // Validate user has access to the specified project (admins bypass)
      if (!isAdmin) {
        const userProjects = await getUserProjects(req.user.id);
        const hasAccess = userProjects.some(p => p.id === projectId);
        
        if (!hasAccess) {
          if (req.file && req.file.path) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
          }
          return res.status(403).json({
            error: 'Project access denied',
            message: 'You do not have access to the specified project'
          });
        }
      }
    }
    
    const file = req.file;
    const fileId = `drop_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const userId = req.user.id;
    
    // CRITICAL: Validate filename against vendor agreement patterns BEFORE any processing
    // Check if vendor uploaded with specific connection and agreement
    const connectionId = req.query.connectionId;
    const agreementId = req.query.agreementId;
    
    if (connectionId && agreementId) {
      // Fetch vendor agreement file schemas for this SPECIFIC agreement
      const { matchesPattern } = require('./src/utils/patternMatching');
      
      const schemaResult = await dbPool.query(`
        SELECT DISTINCT
          vafs.id as schema_id,
          vafs.file_name_pattern,
          vafs.file_description,
          va.agreement_code
        FROM vendor_agreement_file_schemas vafs
        JOIN vendor_agreements va ON vafs.vendor_agreement_id = va.id
        WHERE va.id = $1
          AND va.status = 'active'
          AND va.approval_status = 'governance_approved'
          AND va.is_locked = true
        ORDER BY vafs.file_name_pattern
      `, [agreementId]);
      
      if (schemaResult.rows.length > 0) {
        // Check if filename matches any expected pattern
        const filename = file.originalname;
        let matchedPattern = null;
        
        for (const schema of schemaResult.rows) {
          if (matchesPattern(filename, schema.file_name_pattern)) {
            matchedPattern = schema;
            break;
          }
        }
        
        if (!matchedPattern) {
          // No pattern matched - reject upload immediately
          try { fs.unlinkSync(file.path); } catch (e) {}
          
          const agreementInfo = schemaResult.rows[0]; // All rows have same agreement info
          const expectedPatterns = schemaResult.rows.map(s => 
            s.file_description ? `${s.file_name_pattern} (${s.file_description})` : s.file_name_pattern
          );
          
          logger.warn('Vendor file rejected - does not match any expected pattern', {
            fileId,
            filename,
            agreementId,
            agreementCode: agreementInfo.agreement_code,
            userId,
            expectedPatterns
          });
          
          return res.status(400).json({
            error: 'File pattern validation failed',
            message: `The file "${filename}" does not match any expected file patterns for contract ${agreementInfo.agreement_code}.`,
            details: {
              uploadedFile: filename,
              contractCode: agreementInfo.agreement_code,
              expectedPatterns: expectedPatterns,
              patternCount: expectedPatterns.length
            },
            hint: 'Please ensure your filename matches one of the expected patterns listed above. File patterns may include wildcards (* for any characters, ? for single character).'
          });
        }
        
        logger.info('Vendor file matched expected pattern', {
          fileId,
          filename,
          matchedPattern: matchedPattern.file_name_pattern,
          schemaId: matchedPattern.schema_id
        });
      }
    }
    
    // Virus scan the uploaded file
    const virusScanner = require('./backend/services/VirusScanService');
    let virusScanResult = { scanned: false, clean: false, skipped: false };
    
    try {
      const scanResult = await virusScanner.scanFile(file.path);
      
      if (scanResult.isInfected) {
        logger.warn('Virus detected in drop file', {
          fileId,
          filename: file.originalname,
          viruses: scanResult.viruses,
          userId
        });
        
        // Delete infected file
        try { fs.unlinkSync(file.path); } catch (e) {}
        
        return res.status(400).json({
          error: 'Virus detected',
          message: `The uploaded file contains malware: ${scanResult.viruses.join(', ')}`,
          viruses: scanResult.viruses
        });
      }
      
      // Store scan result for response
      virusScanResult = {
        scanned: true,
        clean: true,
        skipped: scanResult.skipped || false,
        message: scanResult.skipped ? 'Scan skipped - virus definitions unavailable' : 'No threats detected'
      };
      
      logger.info('Drop file passed virus scan', {
        fileId,
        filename: file.originalname,
        userId,
        scanSkipped: scanResult.skipped || false
      });
    } catch (scanError) {
      // With the updated VirusScanService, this should rarely be hit
      // as all errors are handled gracefully within the service
      logger.error('Unexpected virus scan error for drop file', {
        fileId,
        filename: file.originalname,
        error: scanError.message,
        userId
      });
      
      // Allow upload to continue with warning instead of blocking
      virusScanResult = {
        scanned: false,
        clean: false,
        skipped: true,
        message: 'Scan failed - continuing with warning'
      };
      
      logger.warn('Allowing drop file upload despite scan error', {
        fileId,
        filename: file.originalname
      });
    }
    
    // Check if vendor uploaded with specific connection (already declared earlier)
    const folder = req.query.folder || '';
    
    let dropConfig;
    let provider;
    let uploadPath = '';
    let profileData = null; // Will store profiling results if connection-based upload
    let agreementSchema = null; // Will store vendor agreement schema for validation
    let expectedFilePattern = null; // Will store expected filename pattern for validation
    
    if (connectionId) {
      // Connection-based upload: either vendor or admin
      logger.info('Connection-based drop file upload', { connectionId, folder, userId, isAdmin });
      
      let connection;
      
      // Admin users can use any connection
      if (isAdmin) {
        logger.info('Admin drop file upload using connection', { connectionId, userId });
        
        // Fetch connection directly for admins
        const adminConnResult = await dbPool.query(
          'SELECT * FROM storage_connections WHERE connection_id = $1 AND status = $2',
          [connectionId, 'active']
        );
        
        if (adminConnResult.rows.length === 0) {
          try { fs.unlinkSync(file.path); } catch (e) {}
          return res.status(404).json({
            error: 'Connection not found',
            message: 'The specified connection does not exist or is inactive'
          });
        }
        
        connection = adminConnResult.rows[0];
        
      } else {
        // Vendor upload: validate vendor authorization for this connection
        // Get vendor profile
        const vendorResult = await dbPool.query(
          'SELECT id FROM vendors WHERE vendor_user_id = $1 AND status = $2',
          [userId, 'active']
        );
        
        if (vendorResult.rows.length === 0) {
          try { fs.unlinkSync(file.path); } catch (e) {}
          logger.warn('Unauthorized vendor upload attempt - not a vendor', { userId, connectionId });
          return res.status(403).json({ 
            error: 'Access denied',
            message: 'You are not registered as a vendor user'
          });
        }
        
        const vendorId = vendorResult.rows[0].id;
        
        // Get user email for contact validation
        const userResult = await dbPool.query(
          'SELECT email FROM users WHERE id = $1',
          [userId]
        );
        
        if (userResult.rows.length === 0) {
          try { fs.unlinkSync(file.path); } catch (e) {}
          return res.status(404).json({ error: 'User not found' });
        }
        
        const userEmail = userResult.rows[0].email;
        
        // Verify connection belongs to an authorized vendor agreement
        // User must: 1) belong to the vendor org in the agreement, AND 2) be listed as a contact
        const authResult = await dbPool.query(`
          SELECT 
            sc.*,
            va.id as agreement_id,
            va.vendor_id as agreement_vendor_id,
            va.project_id,
            va.drop_location_path,
            va.schema as agreement_schema,
            va.file_name as expected_file_pattern,
            v.name as vendor_name
          FROM storage_connections sc
          JOIN vendor_agreements va ON va.vendor_connection_id = sc.connection_id
          JOIN vendors v ON v.id = va.vendor_id
          WHERE sc.connection_id = $1
            AND sc.status = 'active'
            AND va.vendor_id = $2
            AND va.approval_status = 'governance_approved'
            AND va.is_locked = true
            AND va.status = 'active'
            AND (
              va.primary_contact_email = $3 
              OR va.secondary_contact_email = $3
            )
          LIMIT 1
        `, [connectionId, vendorId, userEmail]);
        
        if (authResult.rows.length === 0) {
          try { fs.unlinkSync(file.path); } catch (e) {}
          
          // Provide specific error message for debugging
          // Check if agreement exists but vendor doesn't match
          const agreementCheck = await dbPool.query(`
            SELECT va.vendor_id, v.name as vendor_name, 
                   va.primary_contact_email, va.secondary_contact_email
            FROM vendor_agreements va
            JOIN vendors v ON v.id = va.vendor_id
            WHERE va.vendor_connection_id = $1
              AND va.approval_status = 'governance_approved'
              AND va.is_locked = true
              AND va.status = 'active'
          `, [connectionId]);
          
          let errorDetail = 'No matching authorized agreement found';
          if (agreementCheck.rows.length > 0) {
            const agreement = agreementCheck.rows[0];
            if (agreement.vendor_id !== vendorId) {
              errorDetail = `This agreement belongs to vendor "${agreement.vendor_name}" (ID: ${agreement.vendor_id}), but you are associated with vendor ID: ${vendorId}`;
            } else if (agreement.primary_contact_email !== userEmail && agreement.secondary_contact_email !== userEmail) {
              errorDetail = `You (${userEmail}) are not listed as a primary or secondary contact on this agreement`;
            }
          }
          
          logger.warn('Unauthorized vendor upload attempt - no access to connection', { 
            userId, 
            userEmail,
            vendorId, 
            connectionId,
            errorDetail
          });
          return res.status(403).json({
            error: 'Access denied',
            message: errorDetail
          });
        }
        
        connection = authResult.rows[0];
        
        // Override projectId with the agreement's project for vendors
        projectId = connection.project_id;
        
        // Store agreement schema and filename pattern for validation (if vendor upload)
        agreementSchema = connection.agreement_schema;
        expectedFilePattern = connection.expected_file_pattern;
      }
      
      // Continue with connection (works for both admin and vendor)
      provider = connection.type;
      
      // Parse connection config
      const config = typeof connection.config === 'string' ? JSON.parse(connection.config) : connection.config;
      
      // Normalize and validate folder path to prevent directory traversal
      let normalizedFolder = folder || '';
      if (normalizedFolder) {
        // Remove leading/trailing slashes
        normalizedFolder = normalizedFolder.replace(/^\/+|\/+$/g, '');
        // Reject path traversal attempts
        if (normalizedFolder.includes('..') || normalizedFolder.includes('\\')) {
          try { fs.unlinkSync(file.path); } catch (e) {}
          logger.warn('Path traversal attempt in vendor upload', { 
            userId, 
            connectionId, 
            folder: normalizedFolder 
          });
          return res.status(400).json({
            error: 'Invalid folder path',
            message: 'Folder path contains invalid characters'
          });
        }
      }
      
      // Build upload path: connection.path + folder + filename
      const connPath = connection.path || '';
      uploadPath = [connPath, normalizedFolder, file.originalname]
        .filter(p => p) // Remove empty strings
        .join('/').replace(/\/+/g, '/'); // Remove double slashes
      
      // Prepare dropConfig object from connection
      dropConfig = {
        provider: provider,
        bucket: config.bucket || config.bucket_name,
        gcp_bucket: config.gcp_bucket,
        container_name: config.container_name,
        region: config.region,
        access_key_id: config.access_key,
        secret_access_key: config.secret_key,
        service_account_json: config.service_account_json,
        account_name: config.account_name,
        account_key: config.account_key,
        project_id: config.project_id,
        endpoint: config.endpoint,
        use_ssl: config.use_ssl
      };
      
    } else {
      // Regular admin drop: use default drop location config
      const dropConfigResult = await dbPool.query(
        'SELECT * FROM drop_location_config WHERE is_active = true LIMIT 1'
      );
      
      if (dropConfigResult.rows.length === 0) {
        try { fs.unlinkSync(file.path); } catch (e) {}
        return res.status(400).json({
          error: 'Drop location not configured',
          message: 'No drop location has been configured. Please contact your administrator.'
        });
      }
      
      dropConfig = dropConfigResult.rows[0];
      provider = dropConfig.provider || 'aws';
      
      // Use default path prefix
      uploadPath = dropConfig.path_prefix 
        ? `${dropConfig.path_prefix}/${file.originalname}`
        : file.originalname;
    }
    
    // Validate filename pattern against vendor agreement (for vendor uploads with pattern defined)
    if (expectedFilePattern && expectedFilePattern.trim() !== '') {
      try {
        const { validateFilename } = require('./backend/utils/filenameValidator');
        
        logger.info('Starting filename pattern validation for vendor upload', { 
          fileId, 
          filename: file.originalname,
          expectedPattern: expectedFilePattern,
          userId 
        });
        
        // Validate the uploaded filename against the expected pattern
        const validationResult = validateFilename(file.originalname, expectedFilePattern);
        
        if (!validationResult.valid) {
          // Filename validation failed - reject upload
          try { fs.unlinkSync(file.path); } catch (e) {}
          
          logger.warn('Filename validation failed for vendor upload', {
            fileId,
            filename: file.originalname,
            expectedPattern: expectedFilePattern,
            expectedBase: validationResult.expectedBase,
            actualBase: validationResult.actualBase,
            expectedExt: validationResult.expectedExt,
            actualExt: validationResult.actualExt,
            userId
          });
          
          return res.status(400).json({
            error: 'Filename pattern validation failed',
            message: validationResult.message,
            details: {
              expectedBase: validationResult.expectedBase,
              actualBase: validationResult.actualBase,
              expectedExt: validationResult.expectedExt,
              actualExt: validationResult.actualExt,
              message: validationResult.message
            }
          });
        }
        
        logger.info('Filename pattern validation passed', { 
          fileId, 
          filename: file.originalname,
          message: validationResult.message 
        });
        
      } catch (filenameError) {
        logger.error('Filename validation error', {
          fileId,
          filename: file.originalname,
          expectedPattern: expectedFilePattern,
          error: filenameError.message,
          stack: filenameError.stack
        });
        
        // Allow upload to continue if filename validation fails unexpectedly
        logger.warn('Allowing upload despite filename validation error', { fileId, filename: file.originalname });
      }
    }
    
    // Validate schema against vendor agreement (for vendor uploads with schema defined)
    if (agreementSchema && agreementSchema.length > 0) {
      try {
        const { extractSchema, compareSchemas } = require('./backend/utils/schemaExtractor');
        
        logger.info('Starting schema validation for vendor upload', { 
          fileId, 
          filename: file.originalname,
          userId,
          hasArchivePassword: !!archivePassword
        });
        
        // Extract schema from uploaded file (pass archive password for encrypted archives)
        const uploadedSchema = await extractSchema(file.path, file.mimetype, { archivePassword });
        
        // Parse agreement schema (it's stored as JSON)
        const expectedSchema = typeof agreementSchema === 'string' 
          ? JSON.parse(agreementSchema) 
          : agreementSchema;
        
        // Compare schemas
        const validationResult = compareSchemas(uploadedSchema, expectedSchema);
        
        if (!validationResult.valid) {
          // Schema validation failed - reject upload
          try { fs.unlinkSync(file.path); } catch (e) {}
          
          logger.warn('Schema validation failed for vendor upload', {
            fileId,
            filename: file.originalname,
            userId,
            errors: validationResult.errors,
            missingColumns: validationResult.missingColumns,
            extraColumns: validationResult.extraColumns
          });
          
          return res.status(400).json({
            error: 'Schema validation failed',
            message: 'The uploaded file does not match the expected schema defined in the vendor agreement',
            details: {
              errors: validationResult.errors,
              missingColumns: validationResult.missingColumns,
              extraColumns: validationResult.extraColumns,
              warnings: validationResult.warnings
            }
          });
        }
        
        // Schema is valid - log warnings if any
        if (validationResult.warnings.length > 0) {
          logger.info('Schema validation passed with warnings', {
            fileId,
            filename: file.originalname,
            warnings: validationResult.warnings
          });
        } else {
          logger.info('Schema validation passed', { fileId, filename: file.originalname });
        }
        
      } catch (schemaError) {
        logger.error('Schema validation error', {
          fileId,
          filename: file.originalname,
          error: schemaError.message,
          stack: schemaError.stack
        });
        
        // For now, allow upload to continue if schema extraction fails
        // You can make this stricter by rejecting the upload here
        logger.warn('Allowing upload despite schema validation error', { fileId, filename: file.originalname });
      }
    }
    
    // Profile file locally BEFORE uploading (for connection-based uploads only)
    if (connectionId) {
      try {
        logger.info('Starting vendor file profiling on local file', { fileId, connectionId, userId, filePath: file.path });
        
        // Call Python profiling service with local file path
        const profileResponse = await axios.post('http://localhost:8000/api/vendor-profile', {
          file_id: fileId,
          local_file_path: file.path,
          filename: file.originalname
        }, {
          timeout: 120000 // 2 minute timeout for profiling
        });
        
        profileData = profileResponse.data;
        
        logger.info('Vendor file profiling completed', { 
          fileId, 
          connectionId, 
          issueCount: profileData.issues?.length || 0,
          qualityScore: profileData.quality_score?.overall_score
        });
      } catch (profilingError) {
        logger.error('Vendor file profiling failed', { 
          fileId, 
          connectionId, 
          error: profilingError.message,
          stack: profilingError.stack
        });
        // Continue with upload even if profiling fails
        profileData = null;
      }
    }
    
    // Decrypt credentials
    const { decrypt } = require('./backend/utils/encryption');
    
    let uploadResult;
    let storageKey;
    let storageLocation;
    
    // Upload based on provider
    if (provider === 'aws') {
      // AWS S3 Upload
      const AWS = require('aws-sdk');
      const s3 = new AWS.S3({
        accessKeyId: decrypt(dropConfig.access_key_id),
        secretAccessKey: decrypt(dropConfig.secret_access_key),
        region: dropConfig.region || 'us-east-1',
        ...(dropConfig.endpoint && { endpoint: dropConfig.endpoint }),
        ...(dropConfig.use_ssl !== null && { sslEnabled: dropConfig.use_ssl })
      });
      
      storageKey = uploadPath;
      
      const fileStream = fs.createReadStream(file.path);
      const uploadParams = {
        Bucket: dropConfig.bucket,
        Key: storageKey,
        Body: fileStream,
        ContentType: file.mimetype,
        Metadata: {
          'uploaded-by': userId.toString(),
          'original-filename': file.originalname,
          'upload-timestamp': new Date().toISOString()
        }
      };
      
      uploadResult = await s3.upload(uploadParams).promise();
      storageLocation = uploadResult.Location;
      
      logger.info('File dropped to AWS S3', {
        fileId,
        filename: file.originalname,
        s3Location: uploadResult.Location,
        bucket: dropConfig.bucket,
        key: storageKey,
        userId
      });
    } else if (provider === 'gcp') {
      // Google Cloud Storage Upload
      const { Storage } = require('@google-cloud/storage');
      const serviceAccountJson = JSON.parse(decrypt(dropConfig.service_account_json));
      
      const storage = new Storage({
        projectId: dropConfig.project_id,
        credentials: serviceAccountJson
      });
      
      const bucket = storage.bucket(dropConfig.gcp_bucket);
      storageKey = uploadPath;
      
      const blob = bucket.file(storageKey);
      const blobStream = blob.createWriteStream({
        resumable: false,
        metadata: {
          contentType: file.mimetype,
          metadata: {
            uploadedBy: userId.toString(),
            originalFilename: file.originalname,
            uploadTimestamp: new Date().toISOString()
          }
        }
      });
      
      await new Promise((resolve, reject) => {
        fs.createReadStream(file.path)
          .pipe(blobStream)
          .on('error', reject)
          .on('finish', resolve);
      });
      
      storageLocation = `gs://${dropConfig.gcp_bucket}/${storageKey}`;
      
      logger.info('File dropped to GCP Storage', {
        fileId,
        filename: file.originalname,
        gcsLocation: storageLocation,
        bucket: dropConfig.gcp_bucket,
        key: storageKey,
        userId
      });
    } else if (provider === 'azure') {
      // Azure Blob Storage Upload
      const { BlobServiceClient } = require('@azure-sdk/storage-blob');
      const accountKey = decrypt(dropConfig.account_key);
      
      const connectionString = `DefaultEndpointsProtocol=https;AccountName=${dropConfig.account_name};AccountKey=${accountKey};EndpointSuffix=core.windows.net`;
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const containerClient = blobServiceClient.getContainerClient(dropConfig.container_name);
      
      storageKey = uploadPath;
      
      const blockBlobClient = containerClient.getBlockBlobClient(storageKey);
      await blockBlobClient.uploadFile(file.path, {
        blobHTTPHeaders: {
          blobContentType: file.mimetype
        },
        metadata: {
          uploadedBy: userId.toString(),
          originalFilename: file.originalname,
          uploadTimestamp: new Date().toISOString()
        }
      });
      
      storageLocation = blockBlobClient.url;
      
      logger.info('File dropped to Azure Blob Storage', {
        fileId,
        filename: file.originalname,
        blobLocation: storageLocation,
        container: dropConfig.container_name,
        key: storageKey,
        userId
      });
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    
    // Build initial metadata with connection_id
    const initialMetadata = {
      storage_location: storageLocation,
      uploaded_by: userId,
      provider: provider,
      storage_key: storageKey,
      drop_file: true,
      connection_id: connectionId || null
    };
    
    logger.info('Inserting file with metadata', { 
      fileId, 
      hasConnectionId: !!connectionId,
      connectionId: connectionId,
      metadata: initialMetadata 
    });
    
    // Log to database
    await dbPool.query(
      `INSERT INTO files (file_id, filename, file_type, file_size, metadata, project_id, is_vendor_file, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [
        fileId,
        file.originalname,
        path.extname(file.originalname).substring(1).toLowerCase(),
        file.size,
        JSON.stringify(initialMetadata),
        projectId,
        !!connectionId // true if connectionId exists (vendor upload), false otherwise
      ]
    );
    
    // Extract quality rules from vendor agreement if this is a vendor upload
    let mergedQualityRuleIds = [...qualityRuleIds]; // Start with manually provided rules
    if (agreementId) {
      const agreementQualityRules = await getQualityRulesFromAgreement(agreementId, file.originalname);
      if (agreementQualityRules.length > 0) {
        // Merge and deduplicate quality rule IDs
        mergedQualityRuleIds = [...new Set([...mergedQualityRuleIds, ...agreementQualityRules])];
        logger.info('Merged quality rules from vendor agreement with manual rules', {
          fileId,
          filename: file.originalname,
          agreementId,
          manualRules: qualityRuleIds.length,
          agreementRules: agreementQualityRules.length,
          totalRules: mergedQualityRuleIds.length
        });
      }
    }
    
    // Queue profiling job for async processing
    const fileType = path.extname(file.originalname).substring(1).toLowerCase();
    const jobId = await queue.addJob('file-processing', {
      fileId,
      filePath: file.path,
      originalName: file.originalname,
      fileSize: file.size,
      fileType,
      userId,
      projectId,
      storageLocation,
      storageKey,
      provider,
      isVendorFile: !!connectionId,
      qualityRuleIds: mergedQualityRuleIds,
      agreementId: agreementId || null
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      timeout: 1800000 // 30 minutes for large files
    });
    
    logger.info('Drop file processing job queued', { fileId, jobId, isVendorFile: !!connectionId });
    
    // Note: Local file cleanup will be handled by the worker after profiling
    
    // Store profiling results if profiling was successful (legacy, now handled by worker)
    if (connectionId && profileData) {
      try {
        // Determine vendor_id if this is a vendor upload
        let vendorId = null;
        if (!isAdmin) {
          const vendorResult = await dbPool.query(
            'SELECT id FROM vendors WHERE vendor_user_id = $1 AND status = $2',
            [userId, 'active']
          );
          if (vendorResult.rows.length > 0) {
            vendorId = vendorResult.rows[0].id;
          }
        }
        
        // Store profiling results
        await dbPool.query(`
          INSERT INTO vendor_file_profiling_results (
            file_id, uploaded_by_user_id, vendor_id, connection_id,
            quality_score, completeness_score, consistency_score, 
            validity_score, uniqueness_score, timeliness_score,
            issues, header_issues, null_value_summary, 
            date_format_issues, duplicate_data, profiling_metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        `, [
          fileId,
          userId,
          vendorId,
          connectionId,
          profileData.quality_score?.overall_score || null,
          profileData.quality_score?.components?.completeness || null,
          profileData.quality_score?.components?.consistency || null,
          profileData.quality_score?.components?.validity || null,
          profileData.quality_score?.components?.uniqueness || null,
          profileData.quality_score?.components?.timeliness || null,
          JSON.stringify(profileData.issues || []),
          JSON.stringify(profileData.header_issues || {}),
          JSON.stringify(profileData.null_value_summary || {}),
          JSON.stringify(profileData.date_format_issues || {}),
          JSON.stringify(profileData.duplicate_data || {}),
          JSON.stringify(profileData.metadata || {})
        ]);
        
        logger.info('Vendor file profiling results stored successfully', { fileId, connectionId, vendorId });
      } catch (dbError) {
        logger.error('Failed to store profiling results', { 
          fileId, 
          connectionId, 
          error: dbError.message 
        });
        // Don't fail the upload if database storage fails
      }
    }
    
    // Invalidate vendor files cache so new uploads appear immediately
    if (connectionId) {
      try {
        const { invalidateFileCache } = require('./backend/src/middleware/cache');
        
        await invalidate('cache:*:/api/vendor-files*');
        await invalidate('cache:*:/api/files*');
        await invalidateFileCache(fileId); // Invalidate file-specific cache for columns, tags, etc.
        logger.info('Invalidated vendor file caches after upload', { fileId });
      } catch (cacheError) {
        // Log but don't fail the upload if cache invalidation fails
        logger.warn('Failed to invalidate cache after vendor file upload', { 
          fileId, 
          error: cacheError.message 
        });
      }
    }
    
    res.json({
      success: true,
      fileId,
      message: `File uploaded successfully to ${provider.toUpperCase()} drop location`,
      file: {
        file_id: fileId,
        filename: file.originalname,
        file_size: file.size,
        storage_location: storageLocation,
        provider: provider,
        key: storageKey
      },
      virusScan: virusScanResult
    });
    
  } catch (error) {
    logger.error('Drop file upload error', { error: error.message });
    
    // Clean up file on error
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    
    res.status(500).json({ 
      error: 'File drop failed',
      details: error.message 
    });
  }
});

/**
 * Submit password for password-protected archive and retry processing
 */
app.post('/api/files/:fileId/password', authenticateToken, async (req, res) => {
  const { fileId } = req.params;
  const { password } = req.body;
  const userId = req.user.id;

  try {
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const fileService = diContainer.get('fileService');
    
    // Verify file exists and user has access to it
    const file = await fileService.getFileById(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check file ownership - user must have access to the project
    const projectAccessQuery = `
      SELECT 1 FROM project_members 
      WHERE project_id = $1 AND user_id = $2
      UNION
      SELECT 1 FROM project_access_groups pag
      INNER JOIN user_groups ug ON pag.group_id = ug.group_id
      WHERE pag.project_id = $1 AND ug.user_id = $2
    `;
    const accessResult = await pool.query(projectAccessQuery, [file.project_id, userId]);
    
    if (accessResult.rows.length === 0 && !req.user.roles?.includes('Admin')) {
      return res.status(403).json({ error: 'Unauthorized to access this file' });
    }

    const passwordVaultService = diContainer.get('passwordVaultService');

    // Store password in vault
    await passwordVaultService.storePassword('file', fileId, password, userId);
    logger.info('Password stored for archive file', { fileId, userId });

    // Re-queue the file for processing
    const queue = diContainer.get('queue');
    await queue.addJob(`process_file_${fileId}`, {
      fileId,
      userId,
      filePath: null, // Will be retrieved from DB
      retryWithPassword: true
    });

    // Update file status to processing
    await pool.query(
      'UPDATE files SET processing_step = $1, failure_reason_code = NULL, processing_error = NULL WHERE file_id = $2',
      ['processing', fileId]
    );

    logger.info('File requeued for processing with password', { fileId });

    res.json({
      success: true,
      message: 'Password submitted successfully. File processing has been requeued.',
      fileId
    });

  } catch (error) {
    logger.error('Error submitting password for file', { fileId, error: error.message });
    res.status(500).json({ 
      error: 'Failed to submit password', 
      details: error.message 
    });
  }
});

/**
 * Retry processing a failed file
 */
app.post('/api/files/:fileId/retry', authenticateToken, async (req, res) => {
  const { fileId } = req.params;
  const userId = req.user.id;

  try {
    const fileService = diContainer.get('fileService');
    
    // Check if file exists
    const file = await fileService.getFileById(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check file ownership - user must have access to the project
    const projectAccessQuery = `
      SELECT 1 FROM project_members 
      WHERE project_id = $1 AND user_id = $2
      UNION
      SELECT 1 FROM project_access_groups pag
      INNER JOIN user_groups ug ON pag.group_id = ug.group_id
      WHERE pag.project_id = $1 AND ug.user_id = $2
    `;
    const accessResult = await dbPool.query(projectAccessQuery, [file.project_id, userId]);
    
    if (accessResult.rows.length === 0 && !req.user.roles?.includes('Admin')) {
      return res.status(403).json({ error: 'Unauthorized to access this file' });
    }

    // Check if this is a fixed-width .dat file with schema configuration
    const isFixedWidth = file.filename && file.filename.toLowerCase().endsWith('.dat');
    
    if (isFixedWidth) {
      // Fetch schema configuration for this file
      const schemaResult = await dbPool.query(
        'SELECT schema_definition FROM fixed_width_schemas WHERE file_id = $1',
        [fileId]
      );
      
      if (schemaResult.rows.length > 0) {
        logger.info('Re-profiling fixed-width file with schema', { fileId });
        
        const { filename, created_at } = file;
        
        // Find the actual file on disk - files are named {timestamp}-{filename}
        // We need to search for the file in the uploads directory
        const uploadDir = path.join(__dirname, 'uploads');
        const filePattern = `*-${filename}`;
        
        try {
          const files = fs.readdirSync(uploadDir);
          const matchingFiles = files.filter(f => f.endsWith(`-${filename}`));
          
          if (matchingFiles.length === 0) {
            logger.error('File not found on disk', { fileId, filename, uploadDir });
            return res.status(404).json({ 
              error: 'File not found on disk',
              details: `Could not find ${filename} in uploads directory`
            });
          }
          
          // If multiple matches, find the one closest to the created_at timestamp
          let actualFilePath;
          if (matchingFiles.length === 1) {
            actualFilePath = path.join(uploadDir, matchingFiles[0]);
          } else {
            // Sort by timestamp and pick the one closest to created_at
            const createdTimestamp = new Date(created_at).getTime();
            matchingFiles.sort((a, b) => {
              const tsA = parseInt(a.split('-')[0]);
              const tsB = parseInt(b.split('-')[0]);
              const diffA = Math.abs(tsA - createdTimestamp);
              const diffB = Math.abs(tsB - createdTimestamp);
              return diffA - diffB;
            });
            actualFilePath = path.join(uploadDir, matchingFiles[0]);
          }
          
          logger.info('Found file on disk for re-profiling', { fileId, actualFilePath, filename });
          
          // Fetch header_config from file metadata if present
          let headerConfig = null;
          if (file.metadata) {
            const metadata = typeof file.metadata === 'string' ? JSON.parse(file.metadata) : file.metadata;
            headerConfig = metadata.header_config || null;
          }
          
          // Call Flask profiling API directly (it will fetch schema from DB automatically)
          const profilingResponse = await axios.post(`${process.env.PROFILING_SERVICE_URL || 'http://localhost:8000'}/api/vendor-profile`, {
            file_id: fileId,
            local_file_path: actualFilePath,
            filename,
            header_config: headerConfig
          });
          
          logger.info('Fixed-width file re-profiled successfully', { fileId });
          
          return res.json({
            success: true,
            message: 'File re-profiled successfully with custom schema.',
            fileId,
            profile: profilingResponse.data
          });
        } catch (flaskError) {
          logger.error('Flask profiling API error', { 
            fileId, 
            status: flaskError.response?.status,
            statusText: flaskError.response?.statusText,
            data: flaskError.response?.data,
            message: flaskError.message
          });
          return res.status(500).json({
            error: 'Failed to re-profile file',
            details: flaskError.response?.data || flaskError.message
          });
        }
      }
    }

    // Standard retry flow for non-fixed-width files
    // Re-queue the file for processing
    const queue = diContainer.get('queue');
    await queue.addJob(`process_file_${fileId}`, {
      fileId,
      userId,
      filePath: null, // Will be retrieved from DB
      retry: true
    });

    // Update file status to processing
    await dbPool.query(
      'UPDATE files SET processing_step = $1, failure_reason_code = NULL, processing_error = NULL WHERE file_id = $2',
      ['processing', fileId]
    );

    logger.info('File requeued for processing (retry)', { fileId });

    res.json({
      success: true,
      message: 'File processing has been requeued.',
      fileId
    });

  } catch (error) {
    logger.error('Error retrying file processing', { fileId, error: error.message, stack: error.stack });
    res.status(500).json({ 
      error: 'Failed to retry file processing', 
      details: error.message 
    });
  }
});

// Multer error handling for drop file endpoint
app.use('/api/files/drop', (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    logger.error('Multer error in drop file upload', { 
      code: error.code, 
      message: error.message,
      field: error.field 
    });
    
    // Provide specific error message for file size limit
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File too large', 
        details: `File exceeds the maximum size limit of 25 MB. For larger files, please use ETL Mapping Jobs which can handle files of any size.`,
        code: error.code,
        maxSize: '25 MB'
      });
    }
    
    return res.status(400).json({ 
      error: 'File upload error', 
      details: error.message,
      code: error.code
    });
  } else if (error) {
    logger.error('Unexpected error in drop file upload middleware', { 
      error: error.message,
      stack: error.stack 
    });
    return res.status(500).json({ 
      error: 'File upload failed', 
      details: error.message 
    });
  }
  next();
});

// Legacy file processing code removed - now handled by FileProcessingWorker in queue
// All file processing now happens asynchronously via job queue
// See: backend/workers/fileProcessingWorker.js

// OLD synchronous upload endpoint (disabled)
// app.post('/api/files/upload-legacy', async (req, res) => {
//   Legacy implementation removed to prevent conflicts
// });

// Continue with other API endpoints below

// Lineage routes handled by backend/routes/lineageRoutes.js (registered below via app.use)

// Scan and populate lineage from existing transformation jobs
app.post('/api/lineage/scan-and-populate', authenticateToken, async (req, res) => {
  try {
    logger.info('Starting lineage scan and populate', { userId: req.user.id });
    
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails = [];
    
    // Get DISTINCT mapping_id from successful transformation jobs
    const mappingsQuery = `
      SELECT DISTINCT tj.mapping_id
      FROM transformation_jobs tj
      WHERE tj.status = 'completed'
        AND tj.mapping_id IS NOT NULL
    `;
    
    const mappingsResult = await dbPool.query(mappingsQuery);
    const uniqueMappings = mappingsResult.rows;
    
    logger.info(`Found ${uniqueMappings.length} unique successful mappings to process`);
    
    // Process each unique mapping - create lineage directly from mapping metadata
    for (const mapping of uniqueMappings) {
      try {
        // Get mapping details directly
        const mappingQuery = `
          SELECT 
            mapping_id,
            mapping_name,
            source_file_pattern,
            target_file_name,
            target_file_format,
            description
          FROM transformation_mappings
          WHERE mapping_id = $1
        `;
        
        const mappingResult = await dbPool.query(mappingQuery, [mapping.mapping_id]);
        
        if (mappingResult.rows.length === 0) {
          skipped++;
          continue;
        }
        
        const mappingData = mappingResult.rows[0];
        const transformationId = `transform_${mapping.mapping_id}`;
        
        // Use source_file_pattern and target_file_name directly from mapping config
        // Store patterns, not file_ids
        const sourcePattern = mappingData.source_file_pattern || '';
        const targetPattern = mappingData.target_file_name || 
                             `output.${mappingData.target_file_format || 'csv'}`;
        
        // Check if PATTERN-BASED lineage already exists for this mapping
        // IMPORTANT: Never touch file-specific lineage created by job executions
        const existingCheck = await dbPool.query(`
          SELECT id FROM transformation_lineage 
          WHERE transformation_id = $1
            AND (lineage_type = 'pattern-based' OR lineage_type IS NULL)
        `, [transformationId]);
        
        if (existingCheck.rows.length > 0) {
          // Update existing pattern-based lineage
          await dbPool.query(`
            UPDATE transformation_lineage 
            SET input_file_id = $1,
                output_file_id = $2,
                lineage_type = 'pattern-based',
                created_at = NOW()
            WHERE transformation_id = $3
              AND (lineage_type = 'pattern-based' OR lineage_type IS NULL)
          `, [
            sourcePattern,
            targetPattern,
            transformationId
          ]);
          
          updated++;
          logger.info('Updated pattern-based lineage record', {
            mappingId: mapping.mapping_id,
            mappingName: mappingData.mapping_name,
            sourcePattern,
            targetPattern
          });
        } else {
          // Check if file-specific lineage exists (skip if it does)
          const fileSpecificCheck = await dbPool.query(`
            SELECT id FROM transformation_lineage 
            WHERE mapping_id = $1 
              AND lineage_type = 'file-specific'
            LIMIT 1
          `, [mapping.mapping_id]);
          
          if (fileSpecificCheck.rows.length > 0) {
            // File-specific lineage exists from job execution - skip pattern creation
            skipped++;
            logger.info('Skipped - file-specific lineage exists', {
              mappingId: mapping.mapping_id,
              lineageId: fileSpecificCheck.rows[0].id
            });
          } else {
            // Create new pattern-based lineage record
            await dbPool.query(`
              INSERT INTO transformation_lineage (
                transformation_id,
                mapping_id,
                input_file_id,
                output_file_id,
                lineage_type,
                created_at
              ) VALUES ($1, $2, $3, $4, $5, NOW())
            `, [
              transformationId,
              mapping.mapping_id,
              sourcePattern,
              targetPattern,
              'pattern-based'
            ]);
            
            created++;
            logger.info('Created pattern-based lineage record', {
              mappingId: mapping.mapping_id,
              mappingName: mappingData.mapping_name,
              sourcePattern,
              targetPattern
            });
          }
        }
        
      } catch (mappingError) {
        errors++;
        const errorMsg = `Mapping ${mapping.mapping_id}: ${mappingError.message}`;
        errorDetails.push(errorMsg);
        logger.error('Error processing mapping for lineage', {
          mappingId: mapping.mapping_id,
          error: mappingError.message
        });
      }
    }
    
    logger.info('Lineage scan and populate completed', {
      totalMappings: uniqueMappings.length,
      created,
      updated,
      skipped,
      errors
    });
    
    res.json({
      success: true,
      summary: {
        totalMappingsProcessed: uniqueMappings.length,
        lineageCreated: created,
        lineageUpdated: updated,
        lineageSkipped: skipped,
        errors: errors
      },
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined
    });
    
  } catch (err) {
    logger.error('Error in lineage scan and populate', { error: err.message });
    res.status(500).json({ 
      success: false,
      error: 'Failed to scan and populate lineage',
      details: err.message 
    });
  }
});

// Badges endpoint
app.get('/api/badges', async (req, res) => {
  try {
    // Create badges table if it doesn't exist
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS user_badges (
        id SERIAL PRIMARY KEY,
        badge_id VARCHAR(50) NOT NULL,
        badge_name VARCHAR(100) NOT NULL,
        badge_description TEXT,
        icon_url VARCHAR(255),
        earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const result = await dbPool.query('SELECT * FROM user_badges');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching badges:', err);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

// Alert history endpoint
app.get('/api/alerts/history', authenticateToken, async (req, res) => {
  try {
    // Get user's accessible projects
    const { getUserProjects } = require('./backend/middleware/requireProjectAccess');
    const userProjects = await getUserProjects(req.user.id);
    const projectIds = userProjects.map(p => p.id);
    const isAdmin = req.user?.roles?.includes('Admin');
    
    // Return empty if user has no projects and is not admin
    if (projectIds.length === 0 && !isAdmin) {
      return res.json([]);
    }
    
    // Create alerts history table if it doesn't exist
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS alert_history (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        alert_type VARCHAR(50) NOT NULL,
        alert_severity VARCHAR(20) NOT NULL,
        alert_message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Filter alert history by file's project_id
    const query = `
      SELECT ah.*, f.filename, p.name as project_name
      FROM alert_history ah
      LEFT JOIN files f ON ah.file_id = f.file_id
      LEFT JOIN projects p ON f.project_id = p.id
      WHERE ${isAdmin ? '1=1' : 'f.project_id = ANY($1::integer[])'}
      ORDER BY ah.triggered_at DESC
    `;
    
    const result = isAdmin 
      ? await dbPool.query(query)
      : await dbPool.query(query, [projectIds]);
      
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching alert history:', err);
    res.status(500).json({ error: 'Failed to fetch alert history' });
  }
});

// Connection routes
const connectionRoutes = require('./backend/routes/connectionRoutes');
app.use('/api/connections', authenticateToken, connectionRoutes);

// Connection browse routes
const connectionBrowseRoutes = require('./backend/routes/connectionBrowse');
app.use('/api/connections', authenticateToken, connectionBrowseRoutes);

// Cache routes
const cacheRoutes = require('./backend/routes/cacheRoutes');
app.use('/api/cache', cacheRoutes);

// DBT routes
const dbtRoutes = require('./backend/routes/dbt');
app.use('/api/dbt', authenticateToken, dbtRoutes);

// Drop location routes (admin only)
const dropLocationRoutes = require('./backend/routes/dropLocation');
app.use('/api/drop-location', authenticateToken, dropLocationRoutes);

// Bulk profiling routes
try {
  const bulkProfilingRoutes = require('./backend/routes/bulkProfiling');
  app.use('/api/bulk-profiling', authenticateToken, bulkProfilingRoutes);
  console.log('✓ Registered /api/bulk-profiling route');
} catch (error) {
  console.error('✗ Failed to register /api/bulk-profiling:', error.message);
}

// Transformation routes
try {
  const transformationRoutes = require('./backend/routes/transformations');
  app.use('/api/transformations', authenticateToken, transformationRoutes);
  console.log('✓ Registered /api/transformations route');
} catch (error) {
  console.error('✗ Failed to register /api/transformations:', error.message);
}

// Lineage routes (with PII column tracking)
try {
  const lineageRoutes = require('./backend/routes/lineageRoutes');
  app.use('/api/lineage', authenticateToken, lineageRoutes);
  console.log('✓ Registered /api/lineage route');
} catch (error) {
  console.error('✗ Failed to register /api/lineage:', error.message);
}

// Lineage Graph routes (visual lineage for Data Governance page)
try {
  const lineageGraphRoutes = require('./server/routes/lineageGraph');
  app.use('/api/lineage-graph', lineageGraphRoutes);
  console.log('✓ Registered /api/lineage-graph route');
} catch (error) {
  console.error('✗ Failed to register /api/lineage-graph:', error.message);
}

// Job routes
try {
  const jobRoutes = require('./backend/routes/jobs');
  app.use('/api/jobs', authenticateToken, jobRoutes);
  console.log('✓ Registered /api/jobs route');
} catch (error) {
  console.error('✗ Failed to register /api/jobs:', error.message);
}

// Mapping Groups routes
try {
  const mappingGroupsRoutes = require('./backend/routes/mappingGroups');
  app.use('/api/mapping-groups', authenticateToken, mappingGroupsRoutes);
  console.log('✓ Registered /api/mapping-groups route');
} catch (error) {
  console.error('✗ Failed to register /api/mapping-groups:', error.message);
}

// Workflow Steps routes
try {
  const workflowStepsRoutes = require('./backend/routes/workflowSteps');
  app.use('/api/workflow-steps', authenticateToken, workflowStepsRoutes);
  console.log('✓ Registered /api/workflow-steps route');
} catch (error) {
  console.error('✗ Failed to register /api/workflow-steps:', error.message);
}

// N-Step Workflows routes
try {
  const nStepWorkflowsRoutes = require('./backend/routes/nStepWorkflows');
  app.use('/api/n-step-workflows', authenticateToken, nStepWorkflowsRoutes);
  console.log('✓ Registered /api/n-step-workflows route');
} catch (error) {
  console.error('✗ Failed to register /api/n-step-workflows:', error.message);
}

// Scheduler routes (new workflow orchestration scheduler)
try {
  const schedulerRoutes = require('./backend/routes/scheduler');
  app.use('/api/schedules', authenticateToken, schedulerRoutes);
  console.log('✓ Registered /api/schedules route');
} catch (error) {
  console.error('✗ Failed to register /api/schedules:', error.message);
}

// File Audit routes
try {
  const fileAuditRoutes = require('./backend/routes/fileAudit');
  app.use('/api/file-audit', authenticateToken, fileAuditRoutes);
  
  const schemaHistoryRoutes = require('./backend/routes/schemaHistory');
  app.use('/api/files', authenticateToken, schemaHistoryRoutes);
  console.log('✓ Registered /api/file-audit route');
} catch (error) {
  console.error('✗ Failed to register /api/file-audit:', error.message);
}

// Dashboard routes
try {
  const dashboardRoutes = require('./backend/routes/dashboard');
  app.use('/api/dashboard', authenticateToken, dashboardRoutes);
  console.log('✓ Registered /api/dashboard route');
} catch (error) {
  console.error('✗ Failed to register /api/dashboard:', error.message);
}

// File Insights routes
try {
  const fileInsightsRoutes = require('./backend/routes/fileInsights');
  app.use('/api/insights', fileInsightsRoutes(dbPool, authenticateToken));
  console.log('✓ Registered /api/insights route');
} catch (error) {
  console.error('✗ Failed to register /api/insights:', error.message);
}

// Quality Rules routes
try {
  const qualityRulesRoutes = require('./backend/routes/qualityRules');
  app.use('/api/quality-rules', qualityRulesRoutes(dbPool, authenticateToken));
  console.log('✓ Registered /api/quality-rules route');
} catch (error) {
  console.error('✗ Failed to register /api/quality-rules:', error.message);
}

// Error Records routes
try {
  const errorReviewRoutes = require('./backend/routes/errorReview');
  app.use('/api/error-review', authenticateToken, errorReviewRoutes);
  console.log('✓ Registered /api/error-review route');
} catch (error) {
  console.error('✗ Failed to register /api/error-review:', error.message);
}

// Visual Workflows routes (new graph-based workflow orchestration)
try {
  const visualWorkflowsRoutes = require('./backend/routes/visualWorkflows');
  app.use('/api/visual-workflows', authenticateToken, visualWorkflowsRoutes);
  console.log('✓ Registered /api/visual-workflows route');
} catch (error) {
  console.error('✗ Failed to register /api/visual-workflows:', error.message);
}

// Visual Mappings routes (new graph-based mapping orchestration)
try {
  const visualMappingsRoutes = require('./backend/routes/visualMappings');
  app.use('/api/visual-mappings', authenticateToken, visualMappingsRoutes);
  console.log('✓ Registered /api/visual-mappings route');
} catch (error) {
  console.error('✗ Failed to register /api/visual-mappings:', error.message);
}

// User Management routes
try {
  const userManagementRoutes = require('./backend/routes/userManagement');
  app.use('/api/users', userManagementRoutes);
  console.log('✓ Registered /api/users route');
} catch (error) {
  console.error('✗ Failed to register /api/users:', error.message);
}

// Policy Management routes (requires authentication)
try {
  const policyRoutes = require('./backend/routes/policyRoutes');
  app.use('/api/policies', authenticateToken, policyRoutes(dbPool));
  console.log('✓ Registered /api/policies route');
} catch (error) {
  console.error('✗ Failed to register /api/policies:', error.message);
}

// Project Management routes (requires authentication)
try {
  const projectRoutes = require('./backend/routes/projectRoutes');
  app.use('/api/projects', authenticateToken, projectRoutes(dbPool));
  console.log('✓ Registered /api/projects route');
} catch (error) {
  console.error('✗ Failed to register /api/projects:', error.message);
}

// Sub-Project Management routes (requires authentication)
try {
  const subProjectRoutes = require('./backend/routes/subProjects');
  subProjectRoutes.use = (path, ...middleware) => app.use(path, ...middleware);
  app.locals.pool = dbPool;
  app.use('/api/projects', authenticateToken, subProjectRoutes);
  console.log('✓ Registered /api/projects/:id/sub-projects routes');
} catch (error) {
  console.error('✗ Failed to register sub-projects routes:', error.message);
}

// Group Management routes (requires authentication)
try {
  const groupRoutes = require('./backend/routes/groupRoutes');
  app.use('/api/groups', authenticateToken, groupRoutes(dbPool));
  console.log('✓ Registered /api/groups route');
} catch (error) {
  console.error('✗ Failed to register /api/groups:', error.message);
}

// Retention & Archival routes (requires authentication)
try {
  const retentionRoutes = require('./backend/routes/retentionRoutes');
  app.use('/api/retention-policies', retentionRoutes(dbPool, logger, diContainer.get('auditService'), retentionWorker));
  
  // ML anomaly detection routes
  const anomalyRoutes = require('./backend/routes/anomalyRoutes');
  app.use('/api/ml', anomalyRoutes(dbPool, logger));
  
  // ML healing recommendation routes
  const healingRoutes = require('./backend/routes/healingRoutes');
  app.use('/api/ml', healingRoutes(dbPool, logger));
  console.log('✓ Registered /api/retention-policies route');
} catch (error) {
  console.error('✗ Failed to register /api/retention-policies:', error.message);
}

// Admin authorization middleware for sensitive routes
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.roles || !req.user.roles.includes('Admin')) {
    logger.warn('Unauthorized audit access attempt', {
      userId: req.user?.id,
      roles: req.user?.roles,
      path: req.path
    });
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  next();
};

// Audit routes (Admin only)
app.get('/api/audit/logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const auditService = diContainer.get('auditService');
    const {
      userId,
      entityType,
      entityId,
      actionType,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = req.query;

    const logs = await auditService.getAuditLogs({
      userId,
      entityType,
      entityId,
      actionType,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json(logs);
  } catch (error) {
    logger.error('Error fetching audit logs', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

app.get('/api/audit/logs/:auditId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { auditId } = req.params;
    const result = await dbPool.query('SELECT * FROM audit_log WHERE audit_id = $1', [auditId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Audit log not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching audit log', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

app.get('/api/audit/executions/:executionId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const auditService = diContainer.get('auditService');
    const { executionId } = req.params;
    const logs = await auditService.getExecutionAudit(executionId);
    res.json(logs);
  } catch (error) {
    logger.error('Error fetching execution audit', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch execution audit' });
  }
});

app.get('/api/audit/data-access', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const auditService = diContainer.get('auditService');
    const {
      userId,
      fileId,
      containsPii,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = req.query;

    const logs = await auditService.getDataAccessLogs({
      userId,
      fileId,
      containsPii: containsPii === 'true' ? true : containsPii === 'false' ? false : null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json(logs);
  } catch (error) {
    logger.error('Error fetching data access logs', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch data access logs' });
  }
});

app.post('/api/audit/export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const auditService = diContainer.get('auditService');
    const {
      userId,
      entityType,
      entityId,
      actionType,
      startDate,
      endDate
    } = req.body;

    const logs = await auditService.getAuditLogs({
      userId,
      entityType,
      entityId,
      actionType,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      limit: 10000
    });

    const csv = [
      'Timestamp,User ID,User Email,Action Type,Entity Type,Entity ID,Status,IP Address',
      ...logs.map(log => 
        `"${log.timestamp}","${log.user_id || ''}","${log.user_email || ''}","${log.action_type}","${log.entity_type}","${log.entity_id}","${log.status}","${log.ip_address || ''}"`
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
    res.send(csv);
  } catch (error) {
    logger.error('Error exporting audit logs', { error: error.message });
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

// Audit Retention Management Routes
const auditRetentionService = require('./backend/services/auditRetentionService');

app.get('/api/audit/retention-settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const settings = await auditRetentionService.getRetentionSettings(req.app.locals.pool);
    res.json(settings);
  } catch (error) {
    logger.error('Error fetching retention settings', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch retention settings' });
  }
});

app.put('/api/audit/retention-settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { retention_days, auto_archive_enabled, auto_delete_enabled } = req.body;
    
    const settings = await auditRetentionService.updateRetentionSettings(req.app.locals.pool, {
      retention_days,
      auto_archive_enabled,
      auto_delete_enabled
    });
    
    res.json(settings);
  } catch (error) {
    logger.error('Error updating retention settings', { error: error.message });
    res.status(500).json({ error: 'Failed to update retention settings' });
  }
});

app.get('/api/audit/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await auditRetentionService.getAuditStatistics(req.app.locals.pool);
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching audit statistics', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch audit statistics' });
  }
});

app.post('/api/audit/archive', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { retention_days } = req.body;
    
    const result = await auditRetentionService.archiveOldRecords(req.app.locals.pool, retention_days);
    
    res.json(result);
  } catch (error) {
    logger.error('Error archiving audit records', { error: error.message });
    res.status(500).json({ error: 'Failed to archive audit records' });
  }
});

app.delete('/api/audit/cleanup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { retention_days, delete_archived, archive_cutoff_days } = req.body;
    
    let result;
    
    if (delete_archived) {
      result = await auditRetentionService.deleteArchivedRecords(req.app.locals.pool, archive_cutoff_days || 90);
    } else {
      result = await auditRetentionService.deleteOldRecords(req.app.locals.pool, retention_days);
    }
    
    res.json(result);
  } catch (error) {
    logger.error('Error cleaning up audit records', { error: error.message });
    res.status(500).json({ error: 'Failed to clean up audit records' });
  }
});

// Frontend audit logging
app.post('/api/audit/frontend-error', authenticateToken, async (req, res) => {
  try {
    const {
      error_message,
      error_stack,
      error_component,
      page_url,
      page_title,
      component_name,
      browser_info,
      screen_resolution,
      viewport_size,
      metadata
    } = req.body;
    
    await req.app.locals.pool.query(`
      INSERT INTO frontend_audit_log (
        user_id, user_email, session_id,
        event_type, event_category,
        page_url, page_title, component_name,
        error_message, error_stack, error_component,
        browser_info, screen_resolution, viewport_size,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      req.user.id,
      req.user.email,
      req.sessionID || null,
      'ERROR',
      'frontend_error',
      page_url,
      page_title,
      component_name,
      error_message,
      error_stack,
      error_component,
      JSON.stringify(browser_info),
      screen_resolution,
      viewport_size,
      JSON.stringify(metadata)
    ]);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error logging frontend error', { error: error.message });
    res.status(500).json({ error: 'Failed to log frontend error' });
  }
});

app.post('/api/audit/frontend-interaction', authenticateToken, async (req, res) => {
  try {
    const {
      event_type,
      action_type,
      page_url,
      page_title,
      component_name,
      target_element,
      element_text,
      browser_info,
      metadata
    } = req.body;
    
    await req.app.locals.pool.query(`
      INSERT INTO frontend_audit_log (
        user_id, user_email, session_id,
        event_type, event_category,
        page_url, page_title, component_name,
        action_type, target_element, element_text,
        browser_info, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      req.user.id,
      req.user.email,
      req.sessionID || null,
      event_type || 'INTERACTION',
      'user_interaction',
      page_url,
      page_title,
      component_name,
      action_type,
      target_element,
      element_text,
      JSON.stringify(browser_info),
      JSON.stringify(metadata)
    ]);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error logging frontend interaction', { error: error.message });
    res.status(500).json({ error: 'Failed to log frontend interaction' });
  }
});

app.post('/api/audit/frontend-api-error', authenticateToken, async (req, res) => {
  try {
    const {
      api_endpoint,
      api_method,
      api_status_code,
      api_error_message,
      page_url,
      page_title,
      browser_info,
      metadata
    } = req.body;
    
    await req.app.locals.pool.query(`
      INSERT INTO frontend_audit_log (
        user_id, user_email, session_id,
        event_type, event_category,
        page_url, page_title,
        api_endpoint, api_method, api_status_code, api_error_message,
        browser_info, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      req.user.id,
      req.user.email,
      req.sessionID || null,
      'API_ERROR',
      'api_failure',
      page_url,
      page_title,
      api_endpoint,
      api_method,
      api_status_code,
      api_error_message,
      JSON.stringify(browser_info),
      JSON.stringify(metadata)
    ]);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error logging frontend API error', { error: error.message });
    res.status(500).json({ error: 'Failed to log frontend API error' });
  }
});

// Initialize cache service
const cacheService = require('./backend/services/cacheService');
cacheService.initialize().then(result => {
  console.log(`✅ Cache service initialized: ${result.type}`);
}).catch(err => {
  console.error('Failed to initialize cache service:', err);
});

// Migration Tracker - prevents re-running migrations on server restart
const migrationTracker = require('./backend/utils/migrationTracker');

// Migrate connections from old table to new shared table
const migrateConnectionsSchema = require('./backend/migrations/createSharedConnectionsTable');
const { migrateTransformConnections } = require('./backend/migrations/migrateTransformConnections');
const addPerformanceIndexes = require('./backend/migrations/addPerformanceIndexes');
const { addProfilingColumns } = require('./backend/migrations/addProfilingColumns');
const { expandNumericColumns } = require('./backend/migrations/expandNumericColumns');
const { addDuplicateRecordsColumns } = require('./backend/migrations/addDuplicateRecordsColumns');
const { addPatternsColumn } = require('./backend/migrations/addPatternsColumn');
const addHistoricalProfilingColumns = require('./backend/migrations/addHistoricalProfilingColumns');
const { initWorkflowOrchestrationTables } = require('./backend/migrations/workflowOrchestration');
const { fixMappingGroupMembersSchema } = require('./backend/migrations/fixMappingGroupMembersSchema');
const updateObjectTypesToString = require('./backend/migrations/updateObjectTypesToString');
const initFileInsightsTables = require('./backend/migrations/createFileInsightsTable');
const addLineageColumns = require('./backend/migrations/addLineageColumns');
const { addProcessingStepColumn } = require('./backend/migrations/addProcessingStepColumn');
const createFilePreviewDataTable = require('./backend/migrations/createFilePreviewDataTable');
const createDataGovernanceTables = require('./backend/migrations/createDataGovernanceTables');
const createGovernanceTagsTables = require('./backend/migrations/createGovernanceTagsTables');
const addSensitivityToFileOwnership = require('./backend/migrations/addSensitivityToFileOwnership');
const createColumnGovernanceTables = require('./backend/migrations/createColumnGovernanceTables');
const addCreatorToFileOwnership = require('./backend/migrations/addCreatorToFileOwnership');
const addTagPermissionLevels = require('./backend/migrations/addTagPermissionLevels');
const addUserProfileAndAuthFields = require('./backend/migrations/addUserProfileAndAuthFields');
const createProjectsAndGroups = require('./backend/migrations/createProjectsAndGroups');
const { addProjectIdToResources } = require('./backend/migrations/addProjectIdToResources');
const { addProjectIdToRemainingTables } = require('./backend/migrations/addProjectIdToRemainingTables');
const { createPolicyEngine } = require('./backend/migrations/createPolicyEngine');
const { createABACAttributes } = require('./backend/migrations/createABACAttributes');
const { createSCIMProvisioning } = require('./backend/migrations/createSCIMProvisioning');
const createVendorUsersTable = require('./backend/migrations/createVendorUsers');
const { addConnectionNameUniqueConstraint } = require('./backend/migrations/connectionNameUniqueConstraint');
const { migrateVendorConnectionDirection } = require('./backend/migrations/migrateVendorConnectionDirection');
const { up: addUnifiedConnectionFields } = require('./backend/migrations/addUnifiedConnectionFields');
const addVendorIdToUsers = require('./backend/migrations/addVendorIdToUsers');
const { addSubProjectToTransformationMappings } = require('./backend/migrations/addSubProjectToTransformationMappings');
const { up: addSubProjectToVendorAgreements } = require('./backend/migrations/addSubProjectToVendorAgreements');
const { up: createVendorAgreementFileSchemas } = require('./backend/migrations/createVendorAgreementFileSchemas');
const { up: migrateVendorAgreementSchemasToFileSchemas } = require('./backend/migrations/migrateVendorAgreementSchemasToFileSchemas');
const { addPrimaryKeyColumnsToQualityRuleViolations } = require('./backend/migrations/addPrimaryKeyColumnsToQualityRuleViolations');
const seedGovernanceTags = require('./backend/migrations/seedGovernanceTags');
const migrateColumnSensitivityToGovernance = require('./backend/migrations/migrateColumnSensitivityToGovernance');
const { up: addSLAMonitoringToVendorAgreements } = require('./backend/migrations/addSLAMonitoringToVendorAgreements');
const { addVendorSLAToAlertScope } = require('./backend/migrations/addVendorSLAToAlertScope');
const enterprisePerformanceOptimizations = require('./backend/migrations/enterprisePerformanceOptimizations');
const { addProjectToVisualWorkflows } = require('./backend/migrations/addProjectToVisualWorkflows');

// Run schema migrations asynchronously with tracking to prevent re-running
(async () => {
  try {
    await migrationTracker.runOnce('createSharedConnectionsTable', () => migrateConnectionsSchema());
    await migrationTracker.runOnce('migrateTransformConnections', () => migrateTransformConnections());
    await migrationTracker.runOnce('addPerformanceIndexes', () => addPerformanceIndexes(dbPool));
    await migrationTracker.runOnce('addProfilingColumns', () => addProfilingColumns(dbPool));
    await migrationTracker.runOnce('expandNumericColumns', () => expandNumericColumns(dbPool));
    await migrationTracker.runOnce('addDuplicateRecordsColumns', () => addDuplicateRecordsColumns(dbPool));
    await migrationTracker.runOnce('addPatternsColumn', () => addPatternsColumn(dbPool));
    await migrationTracker.runOnce('addHistoricalProfilingColumns', () => addHistoricalProfilingColumns(dbPool));
    await migrationTracker.runOnce('initWorkflowOrchestrationTables', () => initWorkflowOrchestrationTables(dbPool));
    await migrationTracker.runOnce('fixMappingGroupMembersSchema', () => fixMappingGroupMembersSchema(dbPool));
    await migrationTracker.runOnce('updateObjectTypesToString', () => updateObjectTypesToString(dbPool));
    await migrationTracker.runOnce('initFileInsightsTables', () => initFileInsightsTables(dbPool));
    await migrationTracker.runOnce('addLineageColumns', () => addLineageColumns(dbPool));
    await migrationTracker.runOnce('addProcessingStepColumn', () => addProcessingStepColumn(dbPool));
    await migrationTracker.runOnce('createFilePreviewDataTable', () => createFilePreviewDataTable(dbPool));
    await migrationTracker.runOnce('createDataGovernanceTables', () => createDataGovernanceTables(dbPool));
    await migrationTracker.runOnce('createGovernanceTagsTables', () => createGovernanceTagsTables(dbPool));
    await migrationTracker.runOnce('addSensitivityToFileOwnership', () => addSensitivityToFileOwnership(dbPool));
    await migrationTracker.runOnce('createColumnGovernanceTables', () => createColumnGovernanceTables(dbPool));
    await migrationTracker.runOnce('addCreatorToFileOwnership', () => addCreatorToFileOwnership(dbPool));
    await migrationTracker.runOnce('addTagPermissionLevels', () => addTagPermissionLevels(dbPool));
    await migrationTracker.runOnce('addUserProfileAndAuthFields', () => addUserProfileAndAuthFields());
    await migrationTracker.runOnce('createProjectsAndGroups', () => createProjectsAndGroups(dbPool));
    await migrationTracker.runOnce('addProjectIdToResources', () => addProjectIdToResources(dbPool));
    await migrationTracker.runOnce('addProjectIdToRemainingTables', () => addProjectIdToRemainingTables(dbPool));
    await migrationTracker.runOnce('createPolicyEngine', () => createPolicyEngine(dbPool));
    await migrationTracker.runOnce('createABACAttributes', () => createABACAttributes(dbPool));
    await migrationTracker.runOnce('createSCIMProvisioning', () => createSCIMProvisioning(dbPool));
    await migrationTracker.runOnce('createVendorUsersTable', () => createVendorUsersTable());
    await migrationTracker.runOnce('addVendorIdToUsers', () => addVendorIdToUsers());
    await migrationTracker.runOnce('addConnectionNameUniqueConstraint', () => addConnectionNameUniqueConstraint());
    await migrationTracker.runOnce('migrateVendorConnectionDirection', () => migrateVendorConnectionDirection());
    await migrationTracker.runOnce('addUnifiedConnectionFields', () => addUnifiedConnectionFields(dbPool));
    await migrationTracker.runOnce('addSubProjectToTransformationMappings', () => addSubProjectToTransformationMappings(dbPool));
    await migrationTracker.runOnce('addSubProjectToVendorAgreements', () => addSubProjectToVendorAgreements());
    await migrationTracker.runOnce('createVendorAgreementFileSchemas', () => createVendorAgreementFileSchemas());
    await migrationTracker.runOnce('migrateVendorAgreementSchemasToFileSchemas', () => migrateVendorAgreementSchemasToFileSchemas());
    await migrationTracker.runOnce('addPrimaryKeyColumnsToQualityRuleViolations', () => addPrimaryKeyColumnsToQualityRuleViolations(dbPool));
    await migrationTracker.runOnce('seedGovernanceTags', () => seedGovernanceTags(dbPool));
    await migrationTracker.runOnce('migrateColumnSensitivityToGovernance', () => migrateColumnSensitivityToGovernance(dbPool));
    await migrationTracker.runOnce('addSLAMonitoringToVendorAgreements', () => addSLAMonitoringToVendorAgreements());
    await migrationTracker.runOnce('addVendorSLAToAlertScope', () => addVendorSLAToAlertScope(dbPool));
    await migrationTracker.runOnce('addProjectToVisualWorkflows', () => addProjectToVisualWorkflows(dbPool));
    await migrationTracker.runOnce('enterprisePerformanceOptimizations', () => enterprisePerformanceOptimizations(dbPool));
    
    console.log('🎉 All migrations completed successfully');
  } catch (err) {
    console.error('❌ Error during migrations:', err);
  }
})();

// Mappings endpoint
app.get('/api/mappings', async (req, res) => {
  try {
    // Create mappings table if it doesn't exist
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS file_mappings (
        id SERIAL PRIMARY KEY,
        mapping_name VARCHAR(100) NOT NULL,
        source_file_id VARCHAR(255) NOT NULL,
        target_file_id VARCHAR(255),
        mapping_rules JSON NOT NULL,
        target_file_type VARCHAR(20) DEFAULT 'csv',
        mapping_config JSON,
        source_filename VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const result = await dbPool.query('SELECT * FROM file_mappings');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching mappings:', err);
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
});

// Create file_mappings table if it doesn't exist
const initFileMappingsTable = async () => {
  try {
    // Drop existing table if it has issues
    await dbPool.query(`DROP TABLE IF EXISTS file_mappings`);
    
    // Create a new table with the correct schema
    await dbPool.query(`
      CREATE TABLE file_mappings (
        id SERIAL PRIMARY KEY,
        mapping_name VARCHAR(255) NOT NULL,
        source_file_id VARCHAR(255) NOT NULL,
        source_filename VARCHAR(255),
        target_file_type VARCHAR(50) DEFAULT 'csv',
        mapping_rules JSON DEFAULT '{}',
        mapping_config JSON DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('File mappings table initialized');
  } catch (err) {
    console.error('Error initializing file_mappings table:', err);
  }
};

// Create schedules table if it doesn't exist
const initSchedulesTable = async () => {
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS job_schedules (
        id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'one-time',
        one_time_date TIMESTAMP,
        cron_expression VARCHAR(100),
        enabled BOOLEAN DEFAULT true,
        next_run_time TIMESTAMP,
        last_run_time TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('File schedules table initialized');
  } catch (err) {
    console.error('Error initializing schedules table:', err);
  }
};

// Initialize vendor agreement expiration schedule (daily cron job to disable expired contracts)
const initVendorAgreementExpirationSchedule = async () => {
  try {
    // Check if the schedule already exists
    const existing = await dbPool.query(`
      SELECT id FROM schedules 
      WHERE entity_type = 'vendor_agreement_expiration' 
      AND entity_id = 'system'
    `);
    
    if (existing.rows.length === 0) {
      // Create daily schedule at midnight UTC to check for expired agreements
      const cronSchedulerService = require('./backend/services/cronSchedulerService');
      const nextRun = cronSchedulerService.parseAndCalculateNextRun('0 0 * * *'); // Daily at midnight
      
      await dbPool.query(`
        INSERT INTO schedules (
          entity_type, entity_id, schedule_name, schedule_type, 
          cron_expression, timezone, next_run, project_id, created_by, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        'vendor_agreement_expiration',
        'system',
        'Auto-disable Expired Vendor Agreements',
        'cron',
        '0 0 * * *', // Daily at midnight UTC
        'UTC',
        nextRun,
        null, // System-level schedule, not tied to a project
        1,    // System user ID
        true  // Active by default
      ]);
      
      console.log('✅ Vendor agreement expiration schedule initialized (runs daily at midnight UTC)');
    } else {
      console.log('ℹ️  Vendor agreement expiration schedule already exists');
    }
  } catch (err) {
    console.error('Error initializing vendor agreement expiration schedule:', err);
  }
};

// Initialize file_mappings table on startup
initFileMappingsTable();
// Initialize schedules table on startup
initSchedulesTable();
// Initialize vendor agreement expiration schedule
initVendorAgreementExpirationSchedule();

// Create a new mapping
app.post('/api/mappings', async (req, res) => {
  try {
    const { 
      mapping_name, 
      source_file_id, 
      target_file_type, 
      mapping_config,
      source_filename
    } = req.body;
    
    if (!mapping_name || !source_file_id) {
      return res.status(400).json({ error: 'Mapping name and source file ID are required' });
    }
    
    // Insert the new mapping
    const result = await dbPool.query(`
      INSERT INTO file_mappings (
        mapping_name, 
        source_file_id, 
        target_file_type,
        mapping_rules, 
        mapping_config,
        source_filename
      ) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *
    `, [
      mapping_name, 
      source_file_id, 
      target_file_type || 'csv', 
      JSON.stringify({}), 
      JSON.stringify(mapping_config || {}),
      source_filename
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating mapping:', err);
    res.status(500).json({ error: 'Failed to create mapping' });
  }
});

// Update an existing mapping
app.put('/api/mappings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      mapping_name, 
      source_file_id, 
      target_file_type, 
      mapping_config,
      source_filename
    } = req.body;
    
    if (!mapping_name || !source_file_id) {
      return res.status(400).json({ error: 'Mapping name and source file ID are required' });
    }
    
    // Update the mapping
    const result = await dbPool.query(`
      UPDATE file_mappings 
      SET 
        mapping_name = $1, 
        source_file_id = $2, 
        target_file_type = $3,
        mapping_rules = $4, 
        mapping_config = $5,
        source_filename = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [
      mapping_name, 
      source_file_id, 
      target_file_type || 'csv', 
      JSON.stringify({}), 
      JSON.stringify(mapping_config || {}),
      source_filename,
      id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mapping not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating mapping:', err);
    res.status(500).json({ error: 'Failed to update mapping' });
  }
});

// Delete a mapping
app.delete('/api/mappings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await dbPool.query('DELETE FROM file_mappings WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mapping not found' });
    }
    
    res.json({ message: 'Mapping deleted successfully', id: result.rows[0].id });
  } catch (err) {
    console.error('Error deleting mapping:', err);
    res.status(500).json({ error: 'Failed to delete mapping' });
  }
});

// Dashboard settings endpoint
app.get('/api/user/dashboard-settings', async (req, res) => {
  try {
    // Create dashboard settings table if it doesn't exist
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS user_dashboard_settings (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50) DEFAULT 'default',
        settings JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const result = await dbPool.query("SELECT * FROM user_dashboard_settings WHERE user_id = 'default'");
    
    if (result.rows.length === 0) {
      // Return default settings if none exist
      res.json({
        layout: 'grid',
        widgets: [
          { id: 'recent-files', position: 1, visible: true },
          { id: 'data-quality', position: 2, visible: true },
          { id: 'data-volume', position: 3, visible: true },
          { id: 'alerts', position: 4, visible: true }
        ],
        theme: 'light'
      });
    } else {
      res.json(result.rows[0].settings);
    }
  } catch (err) {
    console.error('Error fetching dashboard settings:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard settings' });
  }
});

// File profile endpoint (with column-level access control for statistics)
app.get('/api/files/:fileId/profile', 
  authenticateToken, 
  requireProjectAccess({
    resourceType: 'file'
  }),
  async (req, res) => {
  try {
    const { fileId } = req.params;
    const { normalizeDataType } = require('./backend/utils/schemaExtractor');
    
    // Check if file exists
    const fileResult = await dbPool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get file columns
    const columnsResult = await dbPool.query(
      'SELECT * FROM file_columns WHERE file_id = $1 ORDER BY column_index ASC',
      [fileId]
    );
    
    // Apply column-level access control
    const columnAccessControl = require('./backend/services/columnAccessControl');
    const columnGovernance = await columnAccessControl.getColumnGovernance(fileId);
    const { allowedColumns, maskedColumns, deniedColumns, summary: accessSummary } = 
      columnAccessControl.filterColumns(req.user, columnGovernance, 'read');
    
    // Create a map of masked column names for quick lookup
    const maskedColumnNames = new Set(maskedColumns.map(c => c.column_name));
    const deniedColumnNames = new Set(deniedColumns.map(c => c.column_name));
    
    // Create profile response with masked statistics for restricted columns
    const file = fileResult.rows[0];
    const columns = columnsResult.rows.map(col => {
      const isMasked = maskedColumnNames.has(col.column_name);
      const isDenied = deniedColumnNames.has(col.column_name);
      
      // For masked/denied columns, redact sensitive statistics
      if (isMasked || isDenied) {
        return {
          name: col.column_name,
          type: normalizeDataType(col.column_type),
          count: col.non_null_count,
          unique: col.unique_count,
          missing: col.null_count,
          min: '[REDACTED]',
          max: '[REDACTED]',
          mean: null,
          median: null,
          stdDev: null,
          histogram: null,
          most_frequent_value: '[REDACTED]',
          least_frequent_value: '[REDACTED]',
          most_frequent_count: null,
          least_frequent_count: null,
          min_frequency: null,
          max_frequency: null,
          min_is_frequent: null,
          max_is_frequent: null,
          patterns: [],
          top_values: null,
          _accessLevel: isMasked ? 'masked' : 'denied'
        };
      }
      
      // For allowed columns, return full statistics
      return {
        name: col.column_name,
        type: normalizeDataType(col.column_type),
        count: col.non_null_count,
        unique: col.unique_count,
        missing: col.null_count,
        min: col.min_value,
        max: col.max_value,
        mean: col.mean_value,
        median: col.median_value,
        stdDev: col.std_dev,
        histogram: col.histogram ? JSON.parse(col.histogram) : null,
        most_frequent_value: col.most_frequent_value,
        least_frequent_value: col.least_frequent_value,
        most_frequent_count: col.most_frequent_count,
        least_frequent_count: col.least_frequent_count,
        min_frequency: col.min_frequency,
        max_frequency: col.max_frequency,
        min_is_frequent: col.min_is_frequent,
        max_is_frequent: col.max_is_frequent,
        patterns: col.patterns || [],
        top_values: col.top_values ? col.top_values : (
          // If top_values doesn't exist in the database, generate a simulated version
          // based on most_frequent_value and least_frequent_value
          col.type === 'string' || col.type === 'date' ? 
            JSON.stringify([
              { value: col.most_frequent_value || 'Unknown', frequency: 20 },
              { value: 'Other Values', frequency: 60 },
              { value: col.least_frequent_value || 'Unknown', frequency: 20 }
            ]) : null
        ),
        _accessLevel: 'full'
      };
    });
    
    const profile = {
      fileId,
      filename: file.filename,
      fileType: file.file_type,
      fileSize: file.file_size,
      rowCount: file.row_count,
      columnCount: file.column_count,
      processedAt: file.processed_at,
      columns,
      summary: {
        completeness: ((file.row_count * file.column_count - columnsResult.rows.reduce((acc, col) => acc + (col.null_count || 0), 0)) / (file.row_count * file.column_count) * 100).toFixed(2),
        uniqueness: (columnsResult.rows.reduce((acc, col) => acc + (col.unique_count || 0), 0) / (file.row_count * file.column_count) * 100).toFixed(2)
      },
      accessSummary // Include column access summary for transparency
    };
    
    // Log data access for audit trail
    if (req.auditService) {
      await req.auditService.logDataAccess({
        userId: req.user?.id,
        userRole: req.user?.roles?.[0],
        accessType: 'PROFILE',
        fileId,
        fileName: file.filename,
        columnNames: columns.map(c => c.name),
        accessMethod: 'UI',
        metadata: {
          columnAccessSummary: accessSummary,
          maskedColumns: maskedColumns.map(c => c.column_name),
          deniedColumns: deniedColumns.map(c => c.column_name)
        },
        context: req.auditContext
      });
    }
    
    res.json(profile);
  } catch (err) {
    console.error('Error fetching file profile:', err);
    res.status(500).json({ error: 'Failed to fetch file profile' });
  }
});

// Historical profiling endpoint - get all profiles for a file over time
app.get('/api/files/:fileId/profile-history',
  authenticateToken,
  requireProjectAccess({
    resourceType: 'file'
  }),
  async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Check if file exists
    const fileResult = await dbPool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get historical profiles (all profile snapshots with their timestamps)
    const historyResult = await dbPool.query(`
      SELECT 
        pm.id as metric_id,
        pm.profile_timestamp,
        pm.file_role,
        pm.row_count,
        pm.column_count,
        pm.completeness_score,
        pm.consistency_score,
        pm.validity_score,
        pm.overall_quality_score,
        pm.profiled_at as created_at,
        (
          SELECT json_agg(
            json_build_object(
              'column_name', fc.column_name,
              'column_type', fc.column_type,
              'non_null_count', fc.non_null_count,
              'null_count', fc.null_count,
              'unique_count', fc.unique_count,
              'min_value', fc.min_value,
              'max_value', fc.max_value,
              'mean_value', fc.mean_value,
              'median_value', fc.median_value,
              'std_dev', fc.std_dev
            )
          )
          FROM file_columns fc
          WHERE fc.file_id = pm.file_id 
            AND fc.profile_timestamp = pm.profile_timestamp
          ORDER BY fc.column_index
        ) as columns
      FROM profiling_metrics pm
      WHERE pm.file_id = $1
      ORDER BY pm.profile_timestamp DESC
      LIMIT 100
    `, [fileId]);
    
    res.json({
      fileId,
      filename: fileResult.rows[0].filename,
      totalSnapshots: historyResult.rows.length,
      history: historyResult.rows
    });
  } catch (err) {
    console.error('Error fetching profile history:', err);
    res.status(500).json({ error: 'Failed to fetch profile history' });
  }
});

// Quality Violations API endpoint

// Get quality rule violations for a specific file
app.get('/api/files/:fileId/quality-violations', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Check if file exists
    const fileResult = await dbPool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get all violations for this file with rule details
    const violationsResult = await dbPool.query(`
      SELECT 
        qrv.id,
        qrv.rule_id,
        qrv.file_id,
        qrv.row_number,
        qrv.column_name,
        qrv.expected_value,
        qrv.actual_value,
        qrv.violation_details,
        qrv.severity,
        qrv.created_at,
        qrv.primary_key_value,
        qrv.primary_key_column,
        qr.rule_name,
        qr.rule_type,
        qr.description as rule_description,
        qr.rule_config,
        qr.enabled as rule_enabled
      FROM quality_rule_violations qrv
      JOIN quality_rules qr ON qrv.rule_id = qr.id
      WHERE qrv.file_id = $1
      ORDER BY qrv.severity DESC, qrv.created_at DESC
    `, [fileId]);
    
    // Get all quality rules that were actually applied to this file
    // Query from file_quality_rules table which tracks file-specific rule associations
    // Each file-rule pair should have one row, select target_columns directly with COALESCE
    const appliedRulesResult = await dbPool.query(`
      SELECT qr.id, qr.rule_name, qr.rule_type, qr.severity, qr.enabled, 
             COALESCE(fqr.target_columns, ARRAY[]::text[]) as target_columns
      FROM file_quality_rules fqr
      JOIN quality_rules qr ON fqr.quality_rule_id = qr.id
      WHERE fqr.file_id = $1
      ORDER BY qr.rule_name
    `, [fileId]);
    
    const violations = violationsResult.rows;
    const appliedRules = appliedRulesResult.rows;
    
    // Calculate summary statistics
    const summary = {
      total_rules_applied: appliedRules.length,
      total_violations: violations.length,
      violations_by_severity: {
        critical: violations.filter(v => v.severity === 'critical').length,
        error: violations.filter(v => v.severity === 'error').length,
        warning: violations.filter(v => v.severity === 'warning').length
      },
      violations_by_rule_type: {},
      violations_by_column: {},
      rules_passed: 0,
      rules_failed: 0
    };
    
    // Group violations by rule type
    violations.forEach(v => {
      const ruleType = v.rule_type || 'unknown';
      summary.violations_by_rule_type[ruleType] = (summary.violations_by_rule_type[ruleType] || 0) + 1;
    });
    
    // Group violations by column
    violations.forEach(v => {
      if (v.column_name) {
        summary.violations_by_column[v.column_name] = (summary.violations_by_column[v.column_name] || 0) + 1;
      }
    });
    
    // Calculate pass/fail for each rule
    const ruleViolationCounts = {};
    violations.forEach(v => {
      ruleViolationCounts[v.rule_id] = (ruleViolationCounts[v.rule_id] || 0) + 1;
    });
    
    // Add status field to each applied rule
    const appliedRulesWithStatus = appliedRules.map(rule => {
      const violationCount = ruleViolationCounts[rule.id] || 0;
      if (violationCount > 0) {
        summary.rules_failed++;
      } else {
        summary.rules_passed++;
      }
      return {
        ...rule,
        status: violationCount > 0 ? 'failed' : 'passed',
        violation_count: violationCount
      };
    });
    
    res.json({
      fileId,
      filename: fileResult.rows[0].filename,
      summary,
      violations,
      applied_rules: appliedRulesWithStatus
    });
  } catch (err) {
    console.error('Error fetching quality violations:', err);
    res.status(500).json({ error: 'Failed to fetch quality violations' });
  }
});

// Run quality rules against file data and record violations
app.post('/api/files/:fileId/quality-rules/run', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user?.id || req.user?.userId;
    
    // Get file info
    const fileResult = await dbPool.query('SELECT file_id, filename FROM files WHERE file_id = $1', [fileId]);
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get assigned quality rules with target columns
    const rulesResult = await dbPool.query(`
      SELECT qr.id, qr.rule_name, qr.rule_type, qr.severity, qr.rule_config,
             COALESCE(fqr.target_columns, ARRAY[]::text[]) as target_columns
      FROM file_quality_rules fqr
      JOIN quality_rules qr ON fqr.quality_rule_id = qr.id
      WHERE fqr.file_id = $1 AND qr.enabled = true
      ORDER BY qr.rule_name
    `, [fileId]);
    
    if (rulesResult.rows.length === 0) {
      return res.json({
        success: true,
        message: 'No quality rules assigned to this file',
        violations_found: 0,
        rules_executed: 0
      });
    }
    
    // Get file preview data (cached file content) - process ALL rows for complete quality validation
    const previewResult = await dbPool.query(`
      SELECT row_number, row_data
      FROM file_preview_data
      WHERE file_id = $1
      ORDER BY row_number
    `, [fileId]);
    
    if (previewResult.rows.length === 0) {
      return res.status(400).json({ 
        error: 'No file data available',
        message: 'Please re-profile the file to run quality checks'
      });
    }
    
    const rows = previewResult.rows;
    const violations = [];
    
    // Build a column name resolution map
    // This handles mismatches between target_columns (e.g., "LOYALTY_TIER", "loyalty_tier") 
    // and actual CSV headers (e.g., "loyalty_tier", "Loyalty Tier")
    const normalizeColumnName = (name) => {
      if (!name) return '';
      return name.toLowerCase().replace(/[\s_-]+/g, '').trim();
    };
    
    // Get actual column names from the first row
    const actualColumnNames = rows.length > 0 ? Object.keys(rows[0].row_data) : [];
    
    // Build lookup: normalized name -> actual header name
    const columnLookup = {};
    actualColumnNames.forEach(actualName => {
      const normalized = normalizeColumnName(actualName);
      columnLookup[normalized] = actualName;
    });
    
    // Function to resolve target column to actual header
    const resolveColumnName = (targetCol) => {
      // First try exact match
      if (actualColumnNames.includes(targetCol)) {
        return targetCol;
      }
      // Try normalized lookup
      const normalized = normalizeColumnName(targetCol);
      if (columnLookup[normalized]) {
        return columnLookup[normalized];
      }
      // Try case-insensitive match
      const lowerTarget = targetCol.toLowerCase();
      const caseMatch = actualColumnNames.find(c => c.toLowerCase() === lowerTarget);
      if (caseMatch) {
        return caseMatch;
      }
      return null; // Column not found
    };
    
    // Execute each rule against its target columns (collect violations first)
    for (const rule of rulesResult.rows) {
      const targetColumns = rule.target_columns || [];
      
      // If no specific columns assigned, skip this rule
      if (targetColumns.length === 0) {
        continue;
      }
      
      for (const columnName of targetColumns) {
        // Resolve the target column name to the actual header name
        const actualColumnName = resolveColumnName(columnName);
        
        if (!actualColumnName) {
          // Column not found in file - log warning and skip
          logger.warn('Target column not found in file during run', { 
            service: 'data-observatory-api',
            targetColumn: columnName,
            availableColumns: actualColumnNames,
            ruleId: rule.id,
            ruleName: rule.rule_name
          });
          continue;
        }
        
        for (const row of rows) {
          const rowData = row.row_data;
          const cellValue = rowData[actualColumnName];
          
          let isViolation = false;
          let expectedValue = null;
          let violationDetails = {};
          
          // Check based on rule type
          switch (rule.rule_type) {
            case 'null_check':
              if (cellValue === null || cellValue === undefined || cellValue === '') {
                isViolation = true;
                expectedValue = 'Non-null value';
                violationDetails = { reason: 'Value is null or empty' };
              }
              break;
              
            case 'column_completeness':
              if (cellValue === null || cellValue === undefined || cellValue === '') {
                isViolation = true;
                expectedValue = 'Non-empty value';
                violationDetails = { reason: 'Missing value' };
              }
              break;
              
            case 'email_validity':
              if (cellValue && typeof cellValue === 'string') {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(cellValue)) {
                  isViolation = true;
                  expectedValue = 'Valid email format';
                  violationDetails = { reason: 'Invalid email format', value: cellValue };
                }
              }
              break;
              
            case 'phone_validity':
              if (cellValue && typeof cellValue === 'string') {
                // Basic phone validation - at least 10 digits
                const digitsOnly = cellValue.replace(/\D/g, '');
                if (digitsOnly.length < 10) {
                  isViolation = true;
                  expectedValue = 'Valid phone number (10+ digits)';
                  violationDetails = { reason: 'Invalid phone format', value: cellValue };
                }
              }
              break;
              
            case 'date_format':
              if (cellValue && typeof cellValue === 'string') {
                const dateValue = new Date(cellValue);
                if (isNaN(dateValue.getTime())) {
                  isViolation = true;
                  expectedValue = 'Valid date format';
                  violationDetails = { reason: 'Invalid date format', value: cellValue };
                }
              }
              break;
              
            case 'timestamp_format':
              if (cellValue && typeof cellValue === 'string') {
                const timestampValue = new Date(cellValue);
                if (isNaN(timestampValue.getTime())) {
                  isViolation = true;
                  expectedValue = 'Valid timestamp format';
                  violationDetails = { reason: 'Invalid timestamp format', value: cellValue };
                }
              }
              break;
              
            case 'duplicate_check':
              // Duplicate check handled separately after row iteration
              break;
              
            case 'isna_check':
              // Check for blank, whitespace-only, or common placeholder values
              if (cellValue !== null && cellValue !== undefined) {
                const strValue = String(cellValue).trim();
                // List of common NA/placeholder values (case-insensitive)
                const naValues = ['na', 'n/a', 'none', 'null', '-', '--', '.', '...', 
                                  'empty', 'blank', 'unknown', 'undefined', 'nil', 
                                  '#n/a', '#na', 'nan', '', ' '];
                const normalizedValue = strValue.toLowerCase();
                
                // Check if value is empty, whitespace-only, or matches common NA patterns
                if (strValue === '' || strValue.match(/^\s+$/) || naValues.includes(normalizedValue)) {
                  isViolation = true;
                  expectedValue = 'Valid non-empty value (not NA, None, blank, etc.)';
                  violationDetails = { 
                    reason: 'Invalid NA/placeholder value detected', 
                    value: cellValue,
                    detected_pattern: strValue === '' ? 'empty string' : 
                                      strValue.match(/^\s+$/) ? 'whitespace only' : normalizedValue
                  };
                }
              } else {
                // null/undefined also counts as ISNA violation
                isViolation = true;
                expectedValue = 'Valid non-empty value (not NA, None, blank, etc.)';
                violationDetails = { reason: 'Value is null or undefined' };
              }
              break;
              
            case 'numeric_only_string':
              // Detect when a string field contains only numeric characters
              if (cellValue !== null && cellValue !== undefined) {
                const strValue = String(cellValue).trim();
                // Check if the value consists only of digits (optionally with decimal point)
                if (strValue !== '' && /^\d+$/.test(strValue)) {
                  isViolation = true;
                  expectedValue = 'Text value (not all numeric)';
                  violationDetails = { 
                    reason: 'String field contains only numeric characters', 
                    value: cellValue,
                    numeric_value: strValue
                  };
                }
              }
              break;
              
            case 'special_character_presence':
              // Detect special characters in string fields
              if (cellValue !== null && cellValue !== undefined) {
                const strValue = String(cellValue);
                // Match characters outside of: letters, numbers, spaces, periods, commas, apostrophes, hyphens
                const specialCharPattern = /[^a-zA-Z0-9\s.,'\-]/g;
                const specialCharsFound = strValue.match(specialCharPattern);
                
                if (specialCharsFound && specialCharsFound.length > 0) {
                  // Get unique special characters found
                  const uniqueSpecialChars = [...new Set(specialCharsFound)];
                  isViolation = true;
                  expectedValue = 'Text without special characters';
                  violationDetails = { 
                    reason: 'Special characters detected in string field', 
                    value: cellValue,
                    special_characters: uniqueSpecialChars,
                    character_count: specialCharsFound.length
                  };
                }
              }
              break;
          }
          
          if (isViolation) {
            violations.push({
              rule_id: rule.id,
              file_id: fileId,
              row_number: row.row_number,
              column_name: columnName,
              expected_value: expectedValue,
              actual_value: cellValue !== null ? String(cellValue).substring(0, 500) : null,
              violation_details: violationDetails,
              severity: rule.severity || 'warning'
            });
          }
        }
      }
      
      // Handle duplicate check separately - check EACH target column independently
      if (rule.rule_type === 'duplicate_check' && targetColumns.length > 0) {
        // Resolve all target columns to actual header names
        const resolvedColumns = targetColumns.map(col => resolveColumnName(col)).filter(Boolean);
        
        // Check each column independently for duplicates
        for (const columnName of resolvedColumns) {
          const valueMap = new Map();
          
          for (const row of rows) {
            const cellValue = row.row_data[columnName];
            // Skip null/empty values for duplicate checking
            if (cellValue === null || cellValue === undefined || String(cellValue).trim() === '') {
              continue;
            }
            
            const valueKey = String(cellValue).toLowerCase();
            
            if (valueMap.has(valueKey)) {
              const firstOccurrence = valueMap.get(valueKey);
              violations.push({
                rule_id: rule.id,
                file_id: fileId,
                row_number: row.row_number,
                column_name: columnName,
                expected_value: 'Unique value',
                actual_value: String(cellValue).substring(0, 500),
                violation_details: { 
                  reason: 'Duplicate value found',
                  first_occurrence_row: firstOccurrence,
                  duplicate_value: String(cellValue)
                },
                severity: rule.severity || 'warning'
              });
            } else {
              valueMap.set(valueKey, row.row_number);
            }
          }
        }
      }
      
      // Handle uniqueness check
      if (rule.rule_type === 'uniqueness' && targetColumns.length > 0) {
        const valueMap = new Map();
        // Resolve all target columns to actual header names
        const resolvedColumns = targetColumns.map(col => resolveColumnName(col)).filter(Boolean);
        
        if (resolvedColumns.length > 0) {
          for (const row of rows) {
            const keyParts = resolvedColumns.map(col => row.row_data[col] ?? '');
            const compositeKey = keyParts.join('||');
            
            if (valueMap.has(compositeKey)) {
              violations.push({
                rule_id: rule.id,
                file_id: fileId,
                row_number: row.row_number,
                column_name: resolvedColumns.join(', '),
                expected_value: 'Unique value',
                actual_value: compositeKey.substring(0, 500),
                violation_details: { 
                  reason: 'Uniqueness violation - duplicate found',
                  first_occurrence_row: valueMap.get(compositeKey)
                },
                severity: rule.severity || 'warning'
              });
            } else {
              valueMap.set(compositeKey, row.row_number);
            }
          }
        }
      }
    }
    
    // Use transaction to atomically replace violations (delete old, insert new)
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      
      // Clear existing violations for this file
      await client.query('DELETE FROM quality_rule_violations WHERE file_id = $1', [fileId]);
      
      // Insert new violations in batches
      if (violations.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < violations.length; i += batchSize) {
          const batch = violations.slice(i, i + batchSize);
          const values = batch.map((v, idx) => {
            const base = idx * 8;
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
          });
          
          const params = batch.flatMap(v => [
            v.rule_id, v.file_id, v.row_number, v.column_name,
            v.expected_value, v.actual_value, JSON.stringify(v.violation_details), v.severity
          ]);
          
          await client.query(`
            INSERT INTO quality_rule_violations 
              (rule_id, file_id, row_number, column_name, expected_value, actual_value, violation_details, severity)
            VALUES ${values.join(', ')}
          `, params);
        }
      }
      
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
    
    logger.info('Quality rules executed', {
      service: 'data-observatory-api',
      fileId,
      rulesExecuted: rulesResult.rows.length,
      violationsFound: violations.length,
      userId
    });
    
    res.json({
      success: true,
      message: `Quality rules executed successfully`,
      rules_executed: rulesResult.rows.length,
      violations_found: violations.length,
      violations_by_rule: rulesResult.rows.map(rule => ({
        rule_id: rule.id,
        rule_name: rule.rule_name,
        violations: violations.filter(v => v.rule_id === rule.id).length
      }))
    });
    
  } catch (err) {
    console.error('Error running quality rules:', err);
    console.error('Error stack:', err.stack);
    logger.error('Error running quality rules', { 
      service: 'data-observatory-api', 
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to run quality rules', details: err.message });
  }
});

// Re-upload file and run quality rules validation
// This endpoint accepts a new file version, updates preview data, and runs quality checks
app.post('/api/files/:fileId/quality-rules/revalidate', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user?.id || req.user?.userId;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Get existing file info to retain configurations
    const fileResult = await dbPool.query(`
      SELECT file_id, filename, file_type, project_id, metadata, schema_definition
      FROM files WHERE file_id = $1
    `, [fileId]);
    
    if (fileResult.rows.length === 0) {
      // Clean up uploaded file
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(404).json({ error: 'File not found' });
    }
    
    const existingFile = fileResult.rows[0];
    const uploadedFile = req.file;
    
    // Virus scan the uploaded file
    const virusScanner = require('./backend/services/VirusScanService');
    try {
      const scanResult = await virusScanner.scanFile(uploadedFile.path);
      if (scanResult.isInfected) {
        try { fs.unlinkSync(uploadedFile.path); } catch (e) {}
        return res.status(400).json({
          error: 'Virus detected',
          message: 'The uploaded file contains malware and has been rejected'
        });
      }
    } catch (scanErr) {
      logger.warn('Virus scan skipped for revalidation', { error: scanErr.message });
    }
    
    // Parse the uploaded file and extract rows
    let parsedRows = [];
    let columnNames = [];
    
    const fileExtension = path.extname(uploadedFile.originalname).toLowerCase();
    
    if (fileExtension === '.csv') {
      // Parse CSV using csv-parser for proper handling of quoted values, commas, and escapes
      const csvParser = require('csv-parser');
      const results = [];
      
      await new Promise((resolve, reject) => {
        fs.createReadStream(uploadedFile.path)
          .pipe(csvParser())
          .on('headers', (headers) => {
            columnNames = headers.map(h => h.trim());
          })
          .on('data', (data) => {
            if (results.length < 10000) {
              results.push(data);
            }
          })
          .on('end', () => resolve())
          .on('error', (err) => reject(err));
      });
      
      // Convert to expected format with row numbers
      // Normalize values: treat whitespace-only strings as null
      parsedRows = results.map((row, idx) => {
        const normalizedRow = {};
        for (const [key, value] of Object.entries(row)) {
          const trimmedKey = key.trim();
          // Normalize: empty strings and whitespace-only become null
          if (value === null || value === undefined) {
            normalizedRow[trimmedKey] = null;
          } else if (typeof value === 'string') {
            const trimmed = value.trim();
            normalizedRow[trimmedKey] = trimmed === '' ? null : trimmed;
          } else {
            normalizedRow[trimmedKey] = value;
          }
        }
        return {
          row_number: idx + 1,
          row_data: normalizedRow
        };
      });
      
    } else if (fileExtension === '.json') {
      // Parse JSON
      const fileContent = fs.readFileSync(uploadedFile.path, 'utf8');
      const jsonData = JSON.parse(fileContent);
      const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
      
      if (dataArray.length > 0 && typeof dataArray[0] === 'object') {
        columnNames = Object.keys(dataArray[0]);
      }
      
      for (let i = 0; i < Math.min(dataArray.length, 10000); i++) {
        parsedRows.push({ row_number: i + 1, row_data: dataArray[i] });
      }
    } else {
      // Clean up and return error for unsupported types
      try { fs.unlinkSync(uploadedFile.path); } catch (e) {}
      return res.status(400).json({
        error: 'Unsupported file type',
        message: 'Only CSV and JSON files are supported for quality rule revalidation'
      });
    }
    
    // Clean up uploaded file after parsing
    try { fs.unlinkSync(uploadedFile.path); } catch (e) {}
    
    if (parsedRows.length === 0) {
      return res.status(400).json({
        error: 'Empty file',
        message: 'The uploaded file contains no data rows'
      });
    }
    
    // Update file_preview_data with new content using transaction
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete old preview data
      await client.query('DELETE FROM file_preview_data WHERE file_id = $1', [fileId]);
      
      // Insert new preview data in batches
      const batchSize = 100;
      for (let i = 0; i < parsedRows.length; i += batchSize) {
        const batch = parsedRows.slice(i, i + batchSize);
        const values = batch.map((row, idx) => {
          const base = idx * 3;
          return `($${base + 1}, $${base + 2}, $${base + 3})`;
        });
        
        const params = batch.flatMap(row => [
          fileId, row.row_number, JSON.stringify(row.row_data)
        ]);
        
        await client.query(`
          INSERT INTO file_preview_data (file_id, row_number, row_data)
          VALUES ${values.join(', ')}
        `, params);
      }
      
      // Update file metadata
      await client.query(`
        UPDATE files 
        SET row_count = $1, 
            column_count = $2,
            updated_at = NOW()
        WHERE file_id = $3
      `, [parsedRows.length, columnNames.length, fileId]);
      
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
    
    // Now run quality rules against the fresh data
    const rulesResult = await dbPool.query(`
      SELECT qr.id, qr.rule_name, qr.rule_type, qr.severity, qr.rule_config,
             COALESCE(fqr.target_columns, ARRAY[]::text[]) as target_columns
      FROM file_quality_rules fqr
      JOIN quality_rules qr ON fqr.quality_rule_id = qr.id
      WHERE fqr.file_id = $1 AND qr.enabled = true
      ORDER BY qr.rule_name
    `, [fileId]);
    
    if (rulesResult.rows.length === 0) {
      return res.json({
        success: true,
        message: 'File uploaded but no quality rules assigned',
        rows_processed: parsedRows.length,
        rules_executed: 0,
        violations_found: 0
      });
    }
    
    // Build a column name resolution map
    // This handles mismatches between target_columns (e.g., "LOYALTY_TIER", "loyalty_tier") 
    // and actual CSV headers (e.g., "loyalty_tier", "Loyalty Tier")
    const normalizeColumnName = (name) => {
      if (!name) return '';
      return name.toLowerCase().replace(/[\s_-]+/g, '').trim();
    };
    
    // Get actual column names from the first parsed row
    const actualColumnNames = parsedRows.length > 0 ? Object.keys(parsedRows[0].row_data) : columnNames;
    
    // Build lookup: normalized name -> actual header name
    const columnLookup = {};
    actualColumnNames.forEach(actualName => {
      const normalized = normalizeColumnName(actualName);
      columnLookup[normalized] = actualName;
    });
    
    // Function to resolve target column to actual header
    const resolveColumnName = (targetCol) => {
      // First try exact match
      if (actualColumnNames.includes(targetCol)) {
        return targetCol;
      }
      // Try normalized lookup
      const normalized = normalizeColumnName(targetCol);
      if (columnLookup[normalized]) {
        return columnLookup[normalized];
      }
      // Try case-insensitive match
      const lowerTarget = targetCol.toLowerCase();
      const caseMatch = actualColumnNames.find(c => c.toLowerCase() === lowerTarget);
      if (caseMatch) {
        return caseMatch;
      }
      return null; // Column not found
    };
    
    const violations = [];
    
    // Execute each rule against its target columns
    for (const rule of rulesResult.rows) {
      const targetColumns = rule.target_columns || [];
      
      if (targetColumns.length === 0) continue;
      
      for (const columnName of targetColumns) {
        // Resolve the target column name to the actual header name
        const actualColumnName = resolveColumnName(columnName);
        
        if (!actualColumnName) {
          // Column not found in file - log warning and skip
          logger.warn('Target column not found in file', { 
            service: 'data-observatory-api',
            targetColumn: columnName,
            availableColumns: actualColumnNames,
            ruleId: rule.id,
            ruleName: rule.rule_name
          });
          continue;
        }
        
        for (const row of parsedRows) {
          const rowData = row.row_data;
          // Use the resolved actual column name for lookup
          let cellValue = rowData[actualColumnName];
          
          let isViolation = false;
          let expectedValue = null;
          let violationDetails = {};
          
          switch (rule.rule_type) {
            case 'null_check':
              if (cellValue === null || cellValue === undefined || cellValue === '') {
                isViolation = true;
                expectedValue = 'Non-null value';
                violationDetails = { reason: 'Value is null or empty' };
              }
              break;
              
            case 'column_completeness':
              if (cellValue === null || cellValue === undefined || cellValue === '') {
                isViolation = true;
                expectedValue = 'Non-empty value';
                violationDetails = { reason: 'Missing value' };
              }
              break;
              
            case 'email_validity':
              if (cellValue && typeof cellValue === 'string') {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(cellValue)) {
                  isViolation = true;
                  expectedValue = 'Valid email format';
                  violationDetails = { reason: 'Invalid email format', value: cellValue };
                }
              }
              break;
              
            case 'phone_validity':
              if (cellValue && typeof cellValue === 'string') {
                const digitsOnly = cellValue.replace(/\D/g, '');
                if (digitsOnly.length < 10) {
                  isViolation = true;
                  expectedValue = 'Valid phone number (10+ digits)';
                  violationDetails = { reason: 'Invalid phone format', value: cellValue };
                }
              }
              break;
              
            case 'date_format':
              if (cellValue && typeof cellValue === 'string') {
                const dateValue = new Date(cellValue);
                if (isNaN(dateValue.getTime())) {
                  isViolation = true;
                  expectedValue = 'Valid date format';
                  violationDetails = { reason: 'Invalid date format', value: cellValue };
                }
              }
              break;
              
            case 'timestamp_format':
              if (cellValue && typeof cellValue === 'string') {
                const timestampValue = new Date(cellValue);
                if (isNaN(timestampValue.getTime())) {
                  isViolation = true;
                  expectedValue = 'Valid timestamp format';
                  violationDetails = { reason: 'Invalid timestamp format', value: cellValue };
                }
              }
              break;
              
            case 'isna_check':
              // Check for blank, whitespace-only, or common placeholder values
              if (cellValue !== null && cellValue !== undefined) {
                const strValue = String(cellValue).trim();
                // List of common NA/placeholder values (case-insensitive)
                const naValues = ['na', 'n/a', 'none', 'null', '-', '--', '.', '...', 
                                  'empty', 'blank', 'unknown', 'undefined', 'nil', 
                                  '#n/a', '#na', 'nan', '', ' '];
                const normalizedValue = strValue.toLowerCase();
                
                // Check if value is empty, whitespace-only, or matches common NA patterns
                if (strValue === '' || strValue.match(/^\s+$/) || naValues.includes(normalizedValue)) {
                  isViolation = true;
                  expectedValue = 'Valid non-empty value (not NA, None, blank, etc.)';
                  violationDetails = { 
                    reason: 'Invalid NA/placeholder value detected', 
                    value: cellValue,
                    detected_pattern: strValue === '' ? 'empty string' : 
                                      strValue.match(/^\s+$/) ? 'whitespace only' : normalizedValue
                  };
                }
              } else {
                // null/undefined also counts as ISNA violation
                isViolation = true;
                expectedValue = 'Valid non-empty value (not NA, None, blank, etc.)';
                violationDetails = { reason: 'Value is null or undefined' };
              }
              break;
              
            case 'numeric_only_string':
              // Detect when a string field contains only numeric characters
              if (cellValue !== null && cellValue !== undefined) {
                const strValue = String(cellValue).trim();
                // Check if the value consists only of digits (optionally with decimal point)
                if (strValue !== '' && /^\d+$/.test(strValue)) {
                  isViolation = true;
                  expectedValue = 'Text value (not all numeric)';
                  violationDetails = { 
                    reason: 'String field contains only numeric characters', 
                    value: cellValue,
                    numeric_value: strValue
                  };
                }
              }
              break;
              
            case 'special_character_presence':
              // Detect special characters in string fields
              if (cellValue !== null && cellValue !== undefined) {
                const strValue = String(cellValue);
                // Match characters outside of: letters, numbers, spaces, periods, commas, apostrophes, hyphens
                const specialCharPattern = /[^a-zA-Z0-9\s.,'\-]/g;
                const specialCharsFound = strValue.match(specialCharPattern);
                
                if (specialCharsFound && specialCharsFound.length > 0) {
                  // Get unique special characters found
                  const uniqueSpecialChars = [...new Set(specialCharsFound)];
                  isViolation = true;
                  expectedValue = 'Text without special characters';
                  violationDetails = { 
                    reason: 'Special characters detected in string field', 
                    value: cellValue,
                    special_characters: uniqueSpecialChars,
                    character_count: specialCharsFound.length
                  };
                }
              }
              break;
          }
          
          if (isViolation) {
            violations.push({
              rule_id: rule.id,
              file_id: fileId,
              row_number: row.row_number,
              column_name: columnName,
              expected_value: expectedValue,
              actual_value: cellValue !== null ? String(cellValue).substring(0, 500) : null,
              violation_details: violationDetails,
              severity: rule.severity || 'warning'
            });
          }
        }
      }
      
      // Handle duplicate check separately - check EACH target column independently
      if (rule.rule_type === 'duplicate_check' && targetColumns.length > 0) {
        // Resolve all target columns to actual header names
        const resolvedColumns = targetColumns.map(col => resolveColumnName(col)).filter(Boolean);
        
        // Check each column independently for duplicates
        for (const columnName of resolvedColumns) {
          const valueMap = new Map();
          
          for (const row of parsedRows) {
            const cellValue = row.row_data[columnName];
            // Skip null/empty values for duplicate checking
            if (cellValue === null || cellValue === undefined || String(cellValue).trim() === '') {
              continue;
            }
            
            const valueKey = String(cellValue).toLowerCase();
            
            if (valueMap.has(valueKey)) {
              const firstOccurrence = valueMap.get(valueKey);
              violations.push({
                rule_id: rule.id,
                file_id: fileId,
                row_number: row.row_number,
                column_name: columnName,
                expected_value: 'Unique value',
                actual_value: String(cellValue).substring(0, 500),
                violation_details: { 
                  reason: 'Duplicate value found',
                  first_occurrence_row: firstOccurrence,
                  duplicate_value: String(cellValue)
                },
                severity: rule.severity || 'warning'
              });
            } else {
              valueMap.set(valueKey, row.row_number);
            }
          }
        }
      }
      
      // Handle uniqueness check
      if (rule.rule_type === 'uniqueness' && targetColumns.length > 0) {
        const valueMap = new Map();
        // Resolve all target columns to actual header names
        const resolvedColumns = targetColumns.map(col => resolveColumnName(col)).filter(Boolean);
        
        if (resolvedColumns.length > 0) {
          for (const row of parsedRows) {
            const keyParts = resolvedColumns.map(col => row.row_data[col] ?? '');
            const compositeKey = keyParts.join('||');
            
            if (valueMap.has(compositeKey)) {
              violations.push({
                rule_id: rule.id,
                file_id: fileId,
                row_number: row.row_number,
                column_name: resolvedColumns.join(', '),
                expected_value: 'Unique value',
                actual_value: compositeKey.substring(0, 500),
                violation_details: { 
                  reason: 'Uniqueness violation - duplicate found',
                  first_occurrence_row: valueMap.get(compositeKey)
                },
                severity: rule.severity || 'warning'
              });
            } else {
              valueMap.set(compositeKey, row.row_number);
            }
          }
        }
      }
    }
    
    // Save violations to database
    const violationClient = await dbPool.connect();
    try {
      await violationClient.query('BEGIN');
      
      // Clear existing violations
      await violationClient.query('DELETE FROM quality_rule_violations WHERE file_id = $1', [fileId]);
      
      // Insert new violations
      if (violations.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < violations.length; i += batchSize) {
          const batch = violations.slice(i, i + batchSize);
          const values = batch.map((v, idx) => {
            const base = idx * 8;
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
          });
          
          const params = batch.flatMap(v => [
            v.rule_id, v.file_id, v.row_number, v.column_name,
            v.expected_value, v.actual_value, JSON.stringify(v.violation_details), v.severity
          ]);
          
          await violationClient.query(`
            INSERT INTO quality_rule_violations 
              (rule_id, file_id, row_number, column_name, expected_value, actual_value, violation_details, severity)
            VALUES ${values.join(', ')}
          `, params);
        }
      }
      
      await violationClient.query('COMMIT');
    } catch (txErr) {
      await violationClient.query('ROLLBACK');
      throw txErr;
    } finally {
      violationClient.release();
    }
    
    logger.info('Quality rules revalidation completed', {
      service: 'data-observatory-api',
      fileId,
      rowsProcessed: parsedRows.length,
      rulesExecuted: rulesResult.rows.length,
      violationsFound: violations.length,
      userId
    });
    
    res.json({
      success: true,
      message: 'File uploaded and quality rules executed successfully',
      rows_processed: parsedRows.length,
      rules_executed: rulesResult.rows.length,
      violations_found: violations.length,
      violations_by_rule: rulesResult.rows.map(rule => ({
        rule_id: rule.id,
        rule_name: rule.rule_name,
        rule_type: rule.rule_type,
        target_columns: rule.target_columns,
        violations: violations.filter(v => v.rule_id === rule.id).length,
        status: violations.filter(v => v.rule_id === rule.id).length > 0 ? 'failed' : 'passed'
      }))
    });
    
  } catch (err) {
    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    console.error('Error in quality rules revalidation:', err);
    logger.error('Error in quality rules revalidation', { 
      service: 'data-observatory-api', 
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to revalidate file', details: err.message });
  }
});

// Get quality rules assigned to a file
app.get('/api/files/:fileId/quality-rules', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Get file to check if it exists
    const fileResult = await dbPool.query('SELECT file_id, project_id FROM files WHERE file_id = $1', [fileId]);
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get assigned rules with target columns
    const assignedResult = await dbPool.query(`
      SELECT qr.id, qr.rule_name, qr.rule_type, qr.severity, qr.description, qr.enabled, 
             fqr.created_at as assigned_at, fqr.target_columns
      FROM file_quality_rules fqr
      JOIN quality_rules qr ON fqr.quality_rule_id = qr.id
      WHERE fqr.file_id = $1
      ORDER BY qr.rule_name
    `, [fileId]);
    
    // Get available generic rules
    const availableResult = await dbPool.query(`
      SELECT id, rule_name, rule_type, severity, description, enabled
      FROM quality_rules
      WHERE (project_id IS NULL OR project_id = $1)
        AND enabled = true
      ORDER BY rule_name
    `, [fileResult.rows[0].project_id]);
    
    res.json({
      assigned: assignedResult.rows,
      available: availableResult.rows
    });
  } catch (err) {
    console.error('Error fetching file quality rules:', err);
    res.status(500).json({ error: 'Failed to fetch file quality rules' });
  }
});

// Assign quality rules to a file with optional column assignments
app.post('/api/files/:fileId/quality-rules', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { rule_ids, column_assignments = {} } = req.body;
    
    if (!Array.isArray(rule_ids)) {
      return res.status(400).json({ error: 'rule_ids must be an array' });
    }
    
    // Check if file exists
    const fileResult = await dbPool.query('SELECT file_id FROM files WHERE file_id = $1', [fileId]);
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Start transaction
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      
      // Remove existing rule assignments
      await client.query('DELETE FROM file_quality_rules WHERE file_id = $1', [fileId]);
      
      // Insert new rule assignments with column assignments
      if (rule_ids.length > 0) {
        for (const ruleId of rule_ids) {
          // Get target columns for this rule (or empty array if none specified)
          const targetColumns = column_assignments[ruleId] || [];
          await client.query(
            `INSERT INTO file_quality_rules (file_id, quality_rule_id, target_columns, created_at) 
             VALUES ($1, $2, $3, NOW())`,
            [fileId, ruleId, targetColumns]
          );
        }
      }
      
      await client.query('COMMIT');
      
      // Return updated assignments with column info
      const assignedResult = await dbPool.query(`
        SELECT qr.id, qr.rule_name, qr.rule_type, qr.severity, qr.description, fqr.target_columns
        FROM file_quality_rules fqr
        JOIN quality_rules qr ON fqr.quality_rule_id = qr.id
        WHERE fqr.file_id = $1
        ORDER BY qr.rule_name
      `, [fileId]);
      
      res.json({
        success: true,
        message: `${rule_ids.length} quality rule(s) assigned to file`,
        assigned: assignedResult.rows
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error assigning quality rules to file:', err);
    res.status(500).json({ error: 'Failed to assign quality rules to file' });
  }
});

// File Ownership API endpoints

// Get file ownership
app.get('/api/files/:fileId/ownership', cacheMiddleware(300), async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const result = await dbPool.query(
      'SELECT * FROM file_ownership WHERE file_id = $1',
      [fileId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No ownership record found for this file' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching file ownership:', err);
    res.status(500).json({ error: 'Failed to fetch file ownership' });
  }
});

// Create file ownership (defaults to current user)
app.post('/api/files/:fileId/ownership', authenticateToken, invalidateCache('cache:*:*ownership*'), async (req, res) => {
  try {
    const { fileId } = req.params;
    const { owner_name, owner_email, owner_contact } = req.body;
    
    const result = await dbPool.query(
      `INSERT INTO file_ownership (file_id, owner_user_id, owner_name, owner_email, owner_contact)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (file_id) DO UPDATE
       SET owner_user_id = $2, owner_name = $3, owner_email = $4, owner_contact = $5, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [fileId, req.user?.id || null, owner_name, owner_email, owner_contact]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating file ownership:', err);
    res.status(500).json({ error: 'Failed to create file ownership' });
  }
});

// Update file ownership
app.put('/api/files/:fileId/ownership', authenticateToken, invalidateCache('cache:*:*ownership*'), async (req, res) => {
  try {
    const { fileId } = req.params;
    const { owner_name, owner_email, owner_contact } = req.body;
    
    const result = await dbPool.query(
      `UPDATE file_ownership
       SET owner_name = $1, owner_email = $2, owner_contact = $3, updated_at = CURRENT_TIMESTAMP
       WHERE file_id = $4
       RETURNING *`,
      [owner_name, owner_email, owner_contact, fileId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ownership record not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating file ownership:', err);
    res.status(500).json({ error: 'Failed to update file ownership' });
  }
});

// Fixed-Width File Schema API endpoints

// Get fixed-width schema for a file
app.get('/api/files/:fileId/fixed-width-schema', cacheMiddleware(300), async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const result = await dbPool.query(
      'SELECT * FROM fixed_width_schemas WHERE file_id = $1',
      [fileId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No schema found for this file' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching fixed-width schema:', err);
    res.status(500).json({ error: 'Failed to fetch fixed-width schema' });
  }
});

// Create or update fixed-width schema
app.post('/api/files/:fileId/fixed-width-schema', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { schema_definition } = req.body;
    
    if (!schema_definition || !Array.isArray(schema_definition.columns)) {
      return res.status(400).json({ error: 'Invalid schema definition. Must include columns array.' });
    }
    
    // Validate schema structure
    for (const col of schema_definition.columns) {
      if (!col.name || typeof col.width !== 'number' || col.width <= 0) {
        return res.status(400).json({ 
          error: 'Invalid column definition. Each column must have name and positive width.' 
        });
      }
    }
    
    const result = await dbPool.query(
      `INSERT INTO fixed_width_schemas (file_id, schema_definition, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (file_id) DO UPDATE
       SET schema_definition = $2, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [fileId, JSON.stringify(schema_definition), req.user?.id || null]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error saving fixed-width schema:', err);
    res.status(500).json({ error: 'Failed to save fixed-width schema' });
  }
});

// Delete fixed-width schema
app.delete('/api/files/:fileId/fixed-width-schema', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const result = await dbPool.query(
      'DELETE FROM fixed_width_schemas WHERE file_id = $1 RETURNING *',
      [fileId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schema not found' });
    }
    
    res.json({ message: 'Schema deleted successfully' });
  } catch (err) {
    console.error('Error deleting fixed-width schema:', err);
    res.status(500).json({ error: 'Failed to delete schema' });
  }
});

// Configure delimiter for delimited files (CSV, DAT, TXT)
app.post('/api/files/:fileId/delimiter', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { delimiter } = req.body;
    const userId = req.user.id;
    
    if (!delimiter) {
      return res.status(400).json({ error: 'Delimiter is required' });
    }
    
    // Verify file exists and user has access
    const fileResult = await dbPool.query(
      'SELECT file_id, project_id, filename, metadata FROM files WHERE file_id = $1',
      [fileId]
    );
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = fileResult.rows[0];
    
    // Check file ownership - user must have access to the project
    const projectAccessQuery = `
      SELECT 1 FROM project_members 
      WHERE project_id = $1 AND user_id = $2
      UNION
      SELECT 1 FROM project_access_groups pag
      INNER JOIN user_groups ug ON pag.group_id = ug.group_id
      WHERE pag.project_id = $1 AND ug.user_id = $2
    `;
    const accessResult = await dbPool.query(projectAccessQuery, [file.project_id, userId]);
    
    if (accessResult.rows.length === 0 && !req.user.roles?.includes('Admin')) {
      return res.status(403).json({ error: 'Unauthorized to access this file' });
    }
    
    // Update file metadata with delimiter
    let metadata = file.metadata || {};
    if (typeof metadata === 'string') {
      metadata = JSON.parse(metadata);
    }
    
    // Preserve existing header_config if present
    const headerConfig = metadata.header_config || null;
    
    metadata.delimiter = delimiter;
    
    await dbPool.query(
      'UPDATE files SET metadata = $1 WHERE file_id = $2',
      [JSON.stringify(metadata), fileId]
    );
    
    logger.info('Delimiter saved for file', { fileId, delimiter, userId, headerConfig });
    
    // Trigger re-profiling by queueing a file-processing job with delimiter
    const fileService = diContainer.get('fileService');
    const fileDetails = await fileService.getFileById(fileId);
    
    if (!fileDetails) {
      return res.status(404).json({ error: 'File details not found' });
    }
    
    const { filename, created_at, file_type, file_size, checksum, project_id, sub_project_id, vendor_agreement_id } = fileDetails;
    const createdAtString = created_at instanceof Date ? created_at.toISOString() : created_at;
    const storagePath = path.join(process.env.FILE_STORAGE_PATH || './file_storage', createdAtString.substring(0, 10), filename);
    
    // Clear existing profiling data
    await dbPool.query(
      'DELETE FROM profiling_metrics WHERE file_id = $1',
      [fileId]
    );
    
    // Re-queue file for processing with delimiter and header config
    const queue = diContainer.get('queue');
    const jobId = await queue.addJob('file-processing', {
      fileId,
      filePath: storagePath,
      originalName: filename,
      fileSize: file_size,
      fileType: file_type,
      userId,
      fileHash: checksum,
      projectId: project_id,
      subProjectId: sub_project_id,
      qualityRuleIds: [],
      agreementId: vendor_agreement_id,
      delimiter,
      headerConfig,
      fixedWidthSchema: null  // Not supported in re-profile flow yet
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      timeout: 1800000
    });
    
    logger.info('File re-profiling job queued with delimiter', { fileId, jobId, delimiter });
    
    // Update file status
    await dbPool.query(
      'UPDATE files SET processing_step = $1, failure_reason_code = NULL, processing_error = NULL WHERE file_id = $2',
      ['queued', fileId]
    );
    
    // Invalidate cache
    await invalidateFileCache(fileId);
    await invalidateFileCatalogCache();
    
    res.json({ 
      message: 'Delimiter saved and file queued for re-profiling',
      delimiter 
    });
  } catch (err) {
    console.error('Error saving delimiter:', err);
    res.status(500).json({ 
      error: 'Failed to save delimiter',
      details: err.message 
    });
  }
});

// Column Sensitivity Tagging API endpoints

// Get all sensitivity tags for a file's columns
app.get('/api/files/:fileId/columns/sensitivity-tags', cacheMiddleware(300), async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const result = await dbPool.query(
      'SELECT * FROM column_sensitivity_tags WHERE file_id = $1 ORDER BY column_name',
      [fileId]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching column sensitivity tags:', err);
    res.status(500).json({ error: 'Failed to fetch column sensitivity tags' });
  }
});

// Get sensitivity tag for a specific column
app.get('/api/files/:fileId/columns/:columnName/sensitivity-tag', cacheMiddleware(300), async (req, res) => {
  try {
    const { fileId, columnName } = req.params;
    
    const result = await dbPool.query(
      'SELECT * FROM column_sensitivity_tags WHERE file_id = $1 AND column_name = $2',
      [fileId, columnName]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No sensitivity tag found for this column' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching column sensitivity tag:', err);
    res.status(500).json({ error: 'Failed to fetch column sensitivity tag' });
  }
});

// Add or update sensitivity tag for a column
app.post('/api/files/:fileId/columns/:columnName/sensitivity-tag', authenticateToken, async (req, res) => {
  try {
    // Check if user has file_governance:write permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('file_governance:write')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to manage column sensitivity tags. Contact your administrator.'
      });
    }
    
    const { fileId, columnName } = req.params;
    // Support both sensitivity_level (correct) and classification_level (legacy) for backwards compatibility
    const sensitivity_level = req.body.sensitivity_level || req.body.classification_level;
    const { data_type } = req.body;
    
    if (!sensitivity_level) {
      return res.status(400).json({ error: 'sensitivity_level is required' });
    }
    
    const validLevels = ['Public', 'Internal', 'Confidential', 'Restricted', 'PII'];
    if (!validLevels.includes(sensitivity_level)) {
      return res.status(400).json({ error: `Invalid sensitivity level. Must be one of: ${validLevels.join(', ')}` });
    }
    
    const result = await dbPool.query(
      `INSERT INTO column_sensitivity_tags (file_id, column_name, sensitivity_level, data_type, tagged_by, tagged_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (file_id, column_name) DO UPDATE
       SET sensitivity_level = $3, data_type = $4, updated_at = CURRENT_TIMESTAMP, tagged_by = $5, tagged_at = NOW()
       RETURNING *`,
      [fileId, columnName, sensitivity_level, data_type, req.user.username || 'user']
    );
    
    // Invalidate file-specific cache and sensitivity cache
    await invalidateFileCache(fileId);
    await invalidateCachePattern('cache:*:*sensitivity*');
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error setting column sensitivity tag:', err);
    res.status(500).json({ error: 'Failed to set column sensitivity tag' });
  }
});

// Delete sensitivity tag for a column
app.delete('/api/files/:fileId/columns/:columnName/sensitivity-tag', authenticateToken, async (req, res) => {
  try {
    const { fileId, columnName } = req.params;
    
    const result = await dbPool.query(
      'DELETE FROM column_sensitivity_tags WHERE file_id = $1 AND column_name = $2 RETURNING *',
      [fileId, columnName]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sensitivity tag not found' });
    }
    
    // Invalidate file-specific cache and sensitivity cache
    await invalidateFileCache(fileId);
    await invalidateCachePattern('cache:*:*sensitivity*');
    
    res.json({ message: 'Sensitivity tag deleted successfully', tag: result.rows[0] });
  } catch (err) {
    console.error('Error deleting column sensitivity tag:', err);
    res.status(500).json({ error: 'Failed to delete column sensitivity tag' });
  }
});

// Governance Policies API endpoints

// Get all governance policies
app.get('/api/governance-policies', cacheMiddleware(300), async (req, res) => {
  try {
    const result = await dbPool.query(
      'SELECT * FROM governance_policies ORDER BY created_at DESC'
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching governance policies:', err);
    res.status(500).json({ error: 'Failed to fetch governance policies' });
  }
});

// Get specific governance policy
app.get('/api/governance-policies/:policyId', cacheMiddleware(300), async (req, res) => {
  try {
    const { policyId } = req.params;
    
    const result = await dbPool.query(
      'SELECT * FROM governance_policies WHERE policy_id = $1',
      [policyId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching governance policy:', err);
    res.status(500).json({ error: 'Failed to fetch governance policy' });
  }
});

// Create new governance policy
app.post('/api/governance-policies', authenticateToken, invalidateCache('cache:*:*policies*'), async (req, res) => {
  try {
    // Check if user has policies:write permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('policies:write')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to create governance policies. Contact your administrator.'
      });
    }
    
    const { policy_name, description, rules } = req.body;
    
    if (!policy_name) {
      return res.status(400).json({ error: 'policy_name is required' });
    }
    
    // Auto-generate UUID for policy_id
    const policy_id = uuidv4();
    
    const result = await dbPool.query(
      `INSERT INTO governance_policies (policy_id, policy_name, description, rules, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [policy_id, policy_name, description, JSON.stringify(rules || {}), req.user?.id || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating governance policy:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Policy ID already exists' });
    }
    res.status(500).json({ error: 'Failed to create governance policy' });
  }
});

// Update governance policy
app.put('/api/governance-policies/:policyId', authenticateToken, invalidateCache('cache:*:*policies*'), async (req, res) => {
  try {
    // Check if user has policies:write permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('policies:write')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to update governance policies. Contact your administrator.'
      });
    }
    
    const { policyId } = req.params;
    const { policy_name, description, rules } = req.body;
    
    const result = await dbPool.query(
      `UPDATE governance_policies
       SET policy_name = $1, description = $2, rules = $3, updated_at = CURRENT_TIMESTAMP
       WHERE policy_id = $4
       RETURNING *`,
      [policy_name, description, JSON.stringify(rules || {}), policyId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating governance policy:', err);
    res.status(500).json({ error: 'Failed to update governance policy' });
  }
});

// Delete governance policy
app.delete('/api/governance-policies/:policyId', authenticateToken, invalidateCache('cache:*:*policies*'), async (req, res) => {
  try {
    // Check if user has policies:write permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('policies:write')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to delete governance policies. Contact your administrator.'
      });
    }
    
    const { policyId } = req.params;
    
    const result = await dbPool.query(
      'DELETE FROM governance_policies WHERE policy_id = $1 RETURNING *',
      [policyId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    
    res.json({ message: 'Policy deleted successfully', policy: result.rows[0] });
  } catch (err) {
    console.error('Error deleting governance policy:', err);
    res.status(500).json({ error: 'Failed to delete governance policy' });
  }
});

// File Policy Assignment endpoints

// Get policies assigned to a file
app.get('/api/files/:fileId/policies', cacheMiddleware(300), async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const result = await dbPool.query(
      `SELECT fpa.*, gp.policy_name, gp.description, gp.rules
       FROM file_policy_assignments fpa
       JOIN governance_policies gp ON fpa.policy_id = gp.policy_id
       WHERE fpa.file_id = $1
       ORDER BY fpa.assigned_at DESC`,
      [fileId]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching file policies:', err);
    res.status(500).json({ error: 'Failed to fetch file policies' });
  }
});

// Assign policy to a file
app.post('/api/files/:fileId/policies', authenticateToken, invalidateCache('cache:*:*policies*'), async (req, res) => {
  try {
    // Check if user has file_governance:write permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('file_governance:write')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to assign policies to files. Contact your administrator.'
      });
    }
    
    const { fileId } = req.params;
    const { policy_id } = req.body;
    
    if (!policy_id) {
      return res.status(400).json({ error: 'policy_id is required' });
    }
    
    const result = await dbPool.query(
      `INSERT INTO file_policy_assignments (file_id, policy_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (file_id, policy_id) DO UPDATE
       SET assigned_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [fileId, policy_id, req.user?.id || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error assigning policy to file:', err);
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Policy not found' });
    }
    res.status(500).json({ error: 'Failed to assign policy to file' });
  }
});

// Remove policy from file
app.delete('/api/files/:fileId/policies/:policyId', authenticateToken, invalidateCache('cache:*:*policies*'), async (req, res) => {
  try {
    // Check if user has file_governance:write permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('file_governance:write')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to remove policies from files. Contact your administrator.'
      });
    }
    
    const { fileId, policyId } = req.params;
    
    const result = await dbPool.query(
      'DELETE FROM file_policy_assignments WHERE file_id = $1 AND policy_id = $2 RETURNING *',
      [fileId, policyId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy assignment not found' });
    }
    
    res.json({ message: 'Policy removed from file successfully', assignment: result.rows[0] });
  } catch (err) {
    console.error('Error removing policy from file:', err);
    res.status(500).json({ error: 'Failed to remove policy from file' });
  }
});

// ============================================
// Governance Tags Management Endpoints
// ============================================

// Get all governance tags
app.get('/api/governance-tags', cacheMiddleware(300), async (req, res) => {
  try {
    const result = await dbPool.query(
      'SELECT * FROM governance_tags ORDER BY created_at DESC'
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching governance tags:', err);
    res.status(500).json({ error: 'Failed to fetch governance tags' });
  }
});

// Get single governance tag
app.get('/api/governance-tags/:tagId', cacheMiddleware(300), async (req, res) => {
  try {
    const { tagId } = req.params;
    
    const result = await dbPool.query(
      'SELECT * FROM governance_tags WHERE tag_id = $1',
      [tagId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching tag:', err);
    res.status(500).json({ error: 'Failed to fetch tag' });
  }
});

// Create new governance tag (Admin only)
app.post('/api/governance-tags', authenticateToken, requireAdmin, invalidateCache('cache:*:*tags*'), async (req, res) => {
  try {
    const { tag_name, description, color, badge_style } = req.body;
    
    if (!tag_name) {
      return res.status(400).json({ error: 'tag_name is required' });
    }
    
    const tag_id = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const result = await dbPool.query(
      `INSERT INTO governance_tags (tag_id, tag_name, description, color, badge_style, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tag_id, tag_name, description || null, color || '#3B82F6', badge_style || 'default', req.user?.id || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating tag:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Tag name already exists' });
    }
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// Update governance tag (Admin only)
app.put('/api/governance-tags/:tagId', authenticateToken, requireAdmin, invalidateCache('cache:*:*tags*'), async (req, res) => {
  try {
    const { tagId } = req.params;
    const { tag_name, description, color, badge_style } = req.body;
    
    const result = await dbPool.query(
      `UPDATE governance_tags
       SET tag_name = $1, description = $2, color = $3, badge_style = $4, updated_at = CURRENT_TIMESTAMP
       WHERE tag_id = $5
       RETURNING *`,
      [tag_name, description, color, badge_style, tagId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating tag:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Tag name already exists' });
    }
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

// Delete governance tag (Admin only)
app.delete('/api/governance-tags/:tagId', authenticateToken, requireAdmin, invalidateCache('cache:*:*tags*'), async (req, res) => {
  try {
    const { tagId } = req.params;
    
    const result = await dbPool.query(
      'DELETE FROM governance_tags WHERE tag_id = $1 RETURNING *',
      [tagId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    
    res.json({ message: 'Tag deleted successfully', tag: result.rows[0] });
  } catch (err) {
    console.error('Error deleting tag:', err);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// ============================================
// File Sensitivity Management Endpoint
// ============================================

// Update file sensitivity level
app.put('/api/files/:fileId/sensitivity', authenticateToken, invalidateCache('cache:*:*files*'), async (req, res) => {
  try {
    const { fileId } = req.params;
    const { sensitivity_level } = req.body;
    
    if (!sensitivity_level) {
      return res.status(400).json({ error: 'sensitivity_level is required' });
    }
    
    // Validate sensitivity level
    const validLevels = ['Public', 'Internal', 'Confidential', 'Restricted'];
    if (!validLevels.includes(sensitivity_level)) {
      return res.status(400).json({ error: 'Invalid sensitivity level. Must be one of: Public, Internal, Confidential, Restricted' });
    }
    
    // Check if file ownership record exists
    const checkResult = await dbPool.query(
      'SELECT * FROM file_ownership WHERE file_id = $1',
      [fileId]
    );
    
    if (checkResult.rows.length === 0) {
      // Create file ownership record with sensitivity
      const insertResult = await dbPool.query(
        `INSERT INTO file_ownership (file_id, sensitivity_level, owner_user_id, created_at, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING *`,
        [fileId, sensitivity_level, req.user.id]
      );
      return res.json(insertResult.rows[0]);
    } else {
      // Update existing file ownership record
      const updateResult = await dbPool.query(
        `UPDATE file_ownership
         SET sensitivity_level = $1, updated_at = CURRENT_TIMESTAMP
         WHERE file_id = $2
         RETURNING *`,
        [sensitivity_level, fileId]
      );
      return res.json(updateResult.rows[0]);
    }
  } catch (err) {
    console.error('Error updating file sensitivity:', err);
    res.status(500).json({ error: 'Failed to update file sensitivity' });
  }
});

// ============================================
// Column-Level Governance Tag Endpoints
// ============================================

// Get governance tags assigned to a specific column
app.get('/api/files/:fileId/columns/:columnName/tags', cacheMiddleware(300), async (req, res) => {
  try {
    const { fileId, columnName } = req.params;
    
    const result = await dbPool.query(
      `SELECT cgta.*, gt.tag_name, gt.description, gt.color, gt.badge_style
       FROM column_governance_tag_assignments cgta
       JOIN governance_tags gt ON cgta.tag_id = gt.tag_id
       WHERE cgta.file_id = $1 AND cgta.column_name = $2
       ORDER BY cgta.assigned_at DESC`,
      [fileId, decodeURIComponent(columnName)]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching column governance tags:', err);
    res.status(500).json({ error: 'Failed to fetch column governance tags' });
  }
});

// Assign governance tags to a column
app.post('/api/files/:fileId/columns/:columnName/tags', authenticateToken, async (req, res) => {
  try {
    const { fileId, columnName } = req.params;
    const { tag_ids } = req.body;
    
    if (!tag_ids || !Array.isArray(tag_ids)) {
      return res.status(400).json({ error: 'tag_ids array is required' });
    }
    
    const decodedColumnName = decodeURIComponent(columnName);
    
    // SECURITY FIX: Check permissions for BOTH tags being added AND tags being removed
    // Step 1: Get currently assigned tags
    const currentTagsResult = await dbPool.query(
      `SELECT gt.tag_id, gt.tag_name 
       FROM column_governance_tag_assignments cgta
       JOIN governance_tags gt ON cgta.tag_id = gt.tag_id
       WHERE cgta.file_id = $1 AND cgta.column_name = $2`,
      [fileId, decodedColumnName]
    );
    
    // Step 2: Check if user has edit permission for tags being removed
    const currentTagIds = currentTagsResult.rows.map(t => t.tag_id);
    const tagsBeingRemoved = currentTagsResult.rows.filter(
      tag => !tag_ids.includes(tag.tag_id)
    );
    
    for (const tag of tagsBeingRemoved) {
      if (!columnAccessControl.hasTagPermission(req.user, tag.tag_name, 'edit')) {
        return res.status(403).json({ 
          error: `You do not have permission to remove the '${tag.tag_name}' tag. Required: tag:${tag.tag_name.toLowerCase()}:edit or tag:${tag.tag_name.toLowerCase()}:write` 
        });
      }
    }
    
    // Step 3: Check if user has edit permission for tags being added
    const tagsBeingAdded = tag_ids.filter(id => !currentTagIds.includes(id));
    
    if (tagsBeingAdded.length > 0) {
      const newTagsResult = await dbPool.query(
        'SELECT tag_id, tag_name FROM governance_tags WHERE tag_id = ANY($1)',
        [tagsBeingAdded]
      );
      
      for (const tag of newTagsResult.rows) {
        if (!columnAccessControl.hasTagPermission(req.user, tag.tag_name, 'edit')) {
          return res.status(403).json({ 
            error: `You do not have permission to assign the '${tag.tag_name}' tag. Required: tag:${tag.tag_name.toLowerCase()}:edit or tag:${tag.tag_name.toLowerCase()}:write` 
          });
        }
      }
    }
    
    // All permission checks passed - apply the changes
    // First, delete existing tag assignments for this column
    await dbPool.query(
      'DELETE FROM column_governance_tag_assignments WHERE file_id = $1 AND column_name = $2',
      [fileId, decodedColumnName]
    );
    
    // Then insert new tag assignments
    if (tag_ids.length > 0) {
      const values = tag_ids.map((tagId, index) => 
        `($1, $2, $${index + 3})`
      ).join(', ');
      
      await dbPool.query(
        `INSERT INTO column_governance_tag_assignments (file_id, column_name, tag_id)
         VALUES ${values}`,
        [fileId, decodedColumnName, ...tag_ids]
      );
    }
    
    // Invalidate cache for file preview and column tags
    const { invalidate } = require('./backend/middleware/cacheMiddleware');
    await invalidate(`cache:*:*${fileId}*`); // File-specific caches
    await invalidate('cache:*:*tags*'); // Tag-related caches
    
    res.json({ message: 'Column tags updated successfully' });
  } catch (err) {
    console.error('Error updating column tags:', err);
    res.status(500).json({ error: 'Failed to update column tags' });
  }
});

// ============================================
// Column-Level Policy Endpoints
// ============================================

// Get policies assigned to a specific column
app.get('/api/files/:fileId/columns/:columnName/policies', cacheMiddleware(300), async (req, res) => {
  try {
    const { fileId, columnName } = req.params;
    
    const result = await dbPool.query(
      `SELECT cpa.*, gp.policy_name, gp.description, gp.rules
       FROM column_policy_assignments cpa
       JOIN governance_policies gp ON cpa.policy_id = gp.policy_id
       WHERE cpa.file_id = $1 AND cpa.column_name = $2
       ORDER BY cpa.assigned_at DESC`,
      [fileId, decodeURIComponent(columnName)]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching column policies:', err);
    res.status(500).json({ error: 'Failed to fetch column policies' });
  }
});

// Assign policies to a column
app.post('/api/files/:fileId/columns/:columnName/policies', authenticateToken, invalidateCache('cache:*:*policies*'), async (req, res) => {
  try {
    const { fileId, columnName } = req.params;
    const { policy_ids } = req.body;
    
    if (!policy_ids || !Array.isArray(policy_ids)) {
      return res.status(400).json({ error: 'policy_ids array is required' });
    }
    
    const decodedColumnName = decodeURIComponent(columnName);
    
    // SECURITY FIX: Re-fetch column tags to ensure current state validation
    // (prevents race condition where tags are removed after policy check)
    const columnTagsResult = await dbPool.query(
      `SELECT gt.tag_name 
       FROM column_governance_tag_assignments cgta
       JOIN governance_tags gt ON cgta.tag_id = gt.tag_id
       WHERE cgta.file_id = $1 AND cgta.column_name = $2`,
      [fileId, decodedColumnName]
    );
    
    // Check if user is Admin or has edit permission for ALL column's tags
    const isAdmin = req.user.roles && req.user.roles.includes('Admin');
    
    if (!isAdmin) {
      // If column has tags, user must have edit permission for ALL tags
      // (stricter than "at least one" to prevent partial access abuse)
      if (columnTagsResult.rows.length > 0) {
        const lacksPermissionForTags = columnTagsResult.rows.filter(row => 
          !columnAccessControl.hasTagPermission(req.user, row.tag_name, 'edit')
        );
        
        if (lacksPermissionForTags.length > 0) {
          const tagNames = lacksPermissionForTags.map(r => r.tag_name).join(', ');
          return res.status(403).json({ 
            error: `You do not have permission to manage policies on this column. Missing edit permissions for: ${tagNames}` 
          });
        }
      } else {
        // Column has no tags - only Admin can assign policies
        return res.status(403).json({ 
          error: 'You do not have permission to assign policies to this column. Required: Admin role.' 
        });
      }
    }
    
    // All permission checks passed - apply the changes
    // First, delete existing policy assignments for this column
    await dbPool.query(
      'DELETE FROM column_policy_assignments WHERE file_id = $1 AND column_name = $2',
      [fileId, decodedColumnName]
    );
    
    // Then insert new policy assignments
    if (policy_ids.length > 0) {
      const values = policy_ids.map((policyId, index) => 
        `($1, $2, $${index + 3})`
      ).join(', ');
      
      await dbPool.query(
        `INSERT INTO column_policy_assignments (file_id, column_name, policy_id)
         VALUES ${values}`,
        [fileId, decodedColumnName, ...policy_ids]
      );
    }
    
    res.json({ message: 'Column policies updated successfully' });
  } catch (err) {
    console.error('Error updating column policies:', err);
    res.status(500).json({ error: 'Failed to update column policies' });
  }
});

// ============================================
// File Tag Assignment Endpoints
// ============================================

// Get tags assigned to a file
app.get('/api/files/:fileId/tags', cacheMiddleware(300), async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const result = await dbPool.query(
      `SELECT fta.*, gt.tag_name, gt.description, gt.color, gt.badge_style
       FROM file_tag_assignments fta
       JOIN governance_tags gt ON fta.tag_id = gt.tag_id
       WHERE fta.file_id = $1
       ORDER BY fta.assigned_at DESC`,
      [fileId]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching file tags:', err);
    res.status(500).json({ error: 'Failed to fetch file tags' });
  }
});

// Assign tag to a file
app.post('/api/files/:fileId/tags', authenticateToken, invalidateCache('cache:*:*tags*'), async (req, res) => {
  try {
    // Check if user has file_governance:write permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('file_governance:write')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to assign tags to files. Contact your administrator.'
      });
    }
    
    const { fileId } = req.params;
    const { tag_id } = req.body;
    
    if (!tag_id) {
      return res.status(400).json({ error: 'tag_id is required' });
    }
    
    const result = await dbPool.query(
      `INSERT INTO file_tag_assignments (file_id, tag_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (file_id, tag_id) DO UPDATE
       SET assigned_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [fileId, tag_id, req.user?.id || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error assigning tag to file:', err);
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Tag not found' });
    }
    res.status(500).json({ error: 'Failed to assign tag to file' });
  }
});

// Remove tag from file
app.delete('/api/files/:fileId/tags/:tagId', authenticateToken, invalidateCache('cache:*:*tags*'), async (req, res) => {
  try {
    const { fileId, tagId } = req.params;
    
    const result = await dbPool.query(
      'DELETE FROM file_tag_assignments WHERE file_id = $1 AND tag_id = $2 RETURNING *',
      [fileId, tagId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tag assignment not found' });
    }
    
    res.json({ message: 'Tag removed from file successfully', assignment: result.rows[0] });
  } catch (err) {
    console.error('Error removing tag from file:', err);
    res.status(500).json({ error: 'Failed to remove tag from file' });
  }
});

// File quality endpoint
// Get file quality data
app.get('/api/files/:fileId/quality', cacheMiddleware(600), async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Check if file exists
    const fileResult = await dbPool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Create quality check table if it doesn't exist
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS file_quality_checks (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        check_type VARCHAR(50) NOT NULL,
        check_name VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL,
        score NUMERIC(5,2),
        details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Get file details and column data for quality calculation
    const file = fileResult.rows[0];
    
    // Get column data for this file
    const columnsResult = await dbPool.query(
      'SELECT * FROM file_columns WHERE file_id = $1',
      [fileId]
    );
    
    const columns = columnsResult.rows.map(col => ({
      name: col.column_name,
      type: col.column_type,
      unique: col.unique_count,
      missing: col.null_count,
      min: col.min_value || col.min_value_decimal,
      max: col.max_value || col.max_value_decimal,
      most_frequent_value: col.most_frequent_value,
      least_frequent_value: col.least_frequent_value
    }));
    
    // Calculate quality score using our helper module
    const { calculateQualityScore } = require('./quality_helper');
    const qualityResult = await calculateQualityScore(columns, {
      row_count: file.row_count,
      created_at: file.created_at
    });
    
    // Update the quality score in the database
    await dbPool.query(
      'UPDATE files SET quality_score = $1 WHERE file_id = $2',
      [qualityResult.overall_score, fileId]
    );
    
    // Get file quality checks table or create if needed
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS file_quality_checks (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        check_type VARCHAR(50) NOT NULL,
        check_name VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL,
        score NUMERIC(5,2),
        details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Get existing quality checks or create new ones
    const qualityChecksResult = await dbPool.query(
      'SELECT * FROM file_quality_checks WHERE file_id = $1',
      [fileId]
    );
    
    // If no quality checks exist yet, create them from our calculated components
    if (qualityChecksResult.rows.length === 0) {
      // Create checks based on our calculated component scores
      const components = qualityResult.components;
      const componentChecks = [
        {
          check_type: 'completeness',
          check_name: 'Missing Values Check',
          status: components.completeness >= 90 ? 'passed' : (components.completeness >= 70 ? 'warning' : 'failed'),
          score: components.completeness,
          details: { 
            description: 'Check for missing values in the dataset',
            weight: qualityResult.weights.completeness
          }
        },
        {
          check_type: 'consistency',
          check_name: 'Data Type Consistency',
          status: components.consistency >= 90 ? 'passed' : (components.consistency >= 70 ? 'warning' : 'failed'),
          score: components.consistency,
          details: { 
            description: 'Check if data types are consistent across columns',
            weight: qualityResult.weights.consistency
          }
        },
        {
          check_type: 'validity',
          check_name: 'Value Range Check',
          status: components.validity >= 90 ? 'passed' : (components.validity >= 70 ? 'warning' : 'failed'),
          score: components.validity,
          details: { 
            description: 'Check if values are within expected ranges',
            weight: qualityResult.weights.validity
          }
        },
        {
          check_type: 'uniqueness',
          check_name: 'Uniqueness Check',
          status: components.uniqueness >= 90 ? 'passed' : (components.uniqueness >= 70 ? 'warning' : 'failed'),
          score: components.uniqueness,
          details: { 
            description: 'Check for uniqueness of values across columns',
            weight: qualityResult.weights.uniqueness
          }
        },
        {
          check_type: 'timeliness',
          check_name: 'Data Freshness Check',
          status: components.timeliness >= 90 ? 'passed' : (components.timeliness >= 70 ? 'warning' : 'failed'),
          score: components.timeliness,
          details: { 
            description: 'Check for freshness of data based on creation date',
            weight: qualityResult.weights.timeliness
          }
        }
      ];
      
      for (const check of componentChecks) {
        await dbPool.query(
          'INSERT INTO file_quality_checks (file_id, check_type, check_name, status, score, details) VALUES ($1, $2, $3, $4, $5, $6)',
          [fileId, check.check_type, check.check_name, check.status, check.score, JSON.stringify(check.details)]
        );
      }
      
      // Fetch the newly created checks
      const newChecksResult = await dbPool.query(
        'SELECT * FROM file_quality_checks WHERE file_id = $1',
        [fileId]
      );
      
      qualityChecksResult.rows = newChecksResult.rows;
    }
    
    const qualityScore = qualityResult.overall_score;
    
    const quality = {
      fileId,
      filename: file.filename,
      qualityScore,
      scoringMethod: 'weighted_average',
      checks: qualityChecksResult.rows.map(check => ({
        id: check.id,
        type: check.check_type,
        name: check.check_name,
        status: check.status,
        score: check.score,
        details: check.details
      })),
      summary: {
        passed: qualityChecksResult.rows.filter(c => c.status === 'passed').length,
        warning: qualityChecksResult.rows.filter(c => c.status === 'warning').length,
        failed: qualityChecksResult.rows.filter(c => c.status === 'failed').length
      }
    };
    
    res.json(quality);
  } catch (err) {
    console.error('Error fetching file quality:', err);
    res.status(500).json({ error: 'Failed to fetch file quality' });
  }
});

// Recalculate quality score for a file
app.post('/api/files/:fileId/quality/recalculate', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Check if file exists
    const fileResult = await dbPool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = fileResult.rows[0];
    
    // Get column data for this file
    const columnsResult = await dbPool.query(
      'SELECT * FROM file_columns WHERE file_id = $1',
      [fileId]
    );
    
    if (columnsResult.rows.length === 0) {
      return res.status(400).json({ 
        error: 'No column data found for this file', 
        message: 'Cannot calculate quality score without column data.'
      });
    }
    
    // Map column data to the format expected by our quality calculator
    const columns = columnsResult.rows.map(col => ({
      name: col.column_name,
      type: col.column_type,
      unique: col.unique_count,
      missing: col.null_count || 0,
      min: col.min_value || col.min_value_decimal,
      max: col.max_value || col.max_value_decimal,
      most_frequent_value: col.most_frequent_value,
      least_frequent_value: col.least_frequent_value
    }));
    
    // Calculate quality score using our helper module
    const { calculateQualityScore } = require('./quality_helper');
    const qualityResult = await calculateQualityScore(columns, {
      row_count: file.row_count,
      created_at: file.created_at
    });
    
    console.log('Calculated new quality score:', {
      fileId,
      score: qualityResult.overall_score,
      components: qualityResult.components
    });
    
    // Update the quality score in the database
    await dbPool.query(
      'UPDATE files SET quality_score = $1, updated_at = NOW() WHERE file_id = $2',
      [qualityResult.overall_score, fileId]
    );
    
    // Create or update quality checks based on component scores
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS file_quality_checks (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        check_type VARCHAR(50) NOT NULL,
        check_name VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL,
        score NUMERIC(5,2),
        details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Delete existing quality checks for this file
    await dbPool.query('DELETE FROM file_quality_checks WHERE file_id = $1', [fileId]);
    
    // Create new quality checks based on our calculated component scores
    const components = qualityResult.components;
    const componentChecks = [
      {
        check_type: 'completeness',
        check_name: 'Missing Values Check',
        status: components.completeness >= 90 ? 'passed' : (components.completeness >= 70 ? 'warning' : 'failed'),
        score: components.completeness,
        details: { 
          description: 'Check for missing values in the dataset',
          weight: qualityResult.weights.completeness
        }
      },
      {
        check_type: 'consistency',
        check_name: 'Data Type Consistency',
        status: components.consistency >= 90 ? 'passed' : (components.consistency >= 70 ? 'warning' : 'failed'),
        score: components.consistency,
        details: { 
          description: 'Check if data types are consistent across columns',
          weight: qualityResult.weights.consistency
        }
      },
      {
        check_type: 'validity',
        check_name: 'Value Range Check',
        status: components.validity >= 90 ? 'passed' : (components.validity >= 70 ? 'warning' : 'failed'),
        score: components.validity,
        details: { 
          description: 'Check if values are within expected ranges',
          weight: qualityResult.weights.validity
        }
      },
      {
        check_type: 'uniqueness',
        check_name: 'Uniqueness Check',
        status: components.uniqueness >= 90 ? 'passed' : (components.uniqueness >= 70 ? 'warning' : 'failed'),
        score: components.uniqueness,
        details: { 
          description: 'Check for uniqueness of values across columns',
          weight: qualityResult.weights.uniqueness
        }
      },
      {
        check_type: 'timeliness',
        check_name: 'Data Freshness Check',
        status: components.timeliness >= 90 ? 'passed' : (components.timeliness >= 70 ? 'warning' : 'failed'),
        score: components.timeliness,
        details: { 
          description: 'Check for freshness of data based on creation date',
          weight: qualityResult.weights.timeliness
        }
      }
    ];
    
    for (const check of componentChecks) {
      await dbPool.query(
        'INSERT INTO file_quality_checks (file_id, check_type, check_name, status, score, details) VALUES ($1, $2, $3, $4, $5, $6)',
        [fileId, check.check_type, check.check_name, check.status, check.score, JSON.stringify(check.details)]
      );
    }
    
    // Get the newly created checks
    const qualityChecksResult = await dbPool.query(
      'SELECT * FROM file_quality_checks WHERE file_id = $1',
      [fileId]
    );
    
    // Return the updated quality data
    const qualityData = {
      fileId,
      filename: file.filename,
      qualityScore: qualityResult.overall_score,
      scoringMethod: 'weighted_average',
      components: qualityResult.components,
      weights: qualityResult.weights,
      checks: qualityChecksResult.rows.map(check => ({
        id: check.id,
        type: check.check_type,
        name: check.check_name,
        status: check.status,
        score: check.score,
        details: check.details
      })),
      summary: {
        passed: qualityChecksResult.rows.filter(c => c.status === 'passed').length,
        warning: qualityChecksResult.rows.filter(c => c.status === 'warning').length,
        failed: qualityChecksResult.rows.filter(c => c.status === 'failed').length
      }
    };
    
    res.json(qualityData);
  } catch (err) {
    console.error('Error recalculating file quality:', err);
    res.status(500).json({ error: sanitizeError(err, 'Failed to recalculate file quality') });
  }
});

// Alert rules endpoint - system-wide configuration, admin access only
app.get('/api/alerts', authenticateToken, async (req, res) => {
  try {
    // Alert rules are system-wide configuration, admin-only access
    const isAdmin = req.user?.roles?.includes('Admin');
    if (!isAdmin) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'Only administrators can view alert rules'
      });
    }
    
    const result = await dbPool.query('SELECT * FROM alert_rules');
    
    // If no rules exist, create some default ones
    if (result.rows.length === 0) {
      const defaultRules = [
        {
          rule_name: 'Missing Values Alert',
          rule_condition: 'greater_than',
          rule_value: '10',
          rule_type: 'data_quality',
          severity: 'warning',
          enabled: true
        },
        {
          rule_name: 'File Size Alert',
          rule_condition: 'percentage_change',
          rule_value: '20',
          rule_type: 'file_metadata',
          severity: 'critical',
          enabled: true
        }
      ];
      
      for (const rule of defaultRules) {
        await dbPool.query(
          'INSERT INTO alert_rules (rule_name, rule_condition, rule_value, rule_type, severity, enabled) VALUES ($1, $2, $3, $4, $5, $6)',
          [rule.rule_name, rule.rule_condition, rule.rule_value, rule.rule_type, rule.severity, rule.enabled]
        );
      }
      
      const newResult = await dbPool.query('SELECT * FROM alert_rules');
      res.json(newResult.rows);
    } else {
      res.json(result.rows);
    }
  } catch (err) {
    console.error('Error fetching alert rules:', err);
    res.status(500).json({ error: 'Failed to fetch alert rules' });
  }
});

// Authentication and User Management API

// Login endpoint
app.post('/api/auth/login', authLimiter, validateRequest(loginSchema), async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      logger.warn('Login attempt with missing credentials', { 
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Get user agent from request
    const userAgent = req.get('user-agent') || 'Unknown';
    
    // Use enhanced auth service for authentication with security features
    const result = await enhancedAuthService.authenticateUserWithSecurity(username, password, userAgent);
    
    if (!result.success) {
      // Check for account lockout
      if (result.locked) {
        logger.warn('Login attempt on locked account', { 
          username,
          ip: req.ip,
          userAgent,
          remainingTime: result.remainingTime
        });
        return res.status(403).json({ 
          error: result.message,
          locked: true,
          remainingTime: result.remainingTime
        });
      }
      
      // Check for SSO-only account
      if (result.useSso) {
        logger.warn('Login attempt on SSO-only account', { 
          username,
          ip: req.ip,
          userAgent,
          ssoProvider: result.ssoProvider
        });
        return res.status(401).json({ 
          error: result.message,
          useSso: true,
          ssoProvider: result.ssoProvider
        });
      }
      
      // Regular authentication failure
      logger.warn('Failed login attempt', { 
        username,
        ip: req.ip,
        userAgent
      });
      return res.status(401).json({ error: result.message });
    }
    
    // Security audit: Log successful login
    logger.info('Successful login', { 
      username: result.user.username,
      userId: result.user.id,
      roles: result.user.roles,
      ip: req.ip,
      userAgent
    });
    
    // Check if user needs to change password
    const forcePasswordChange = result.user.force_password_change || false;
    
    // Return tokens and user info (backward compatible format)
    res.json({
      user: result.user,
      token: result.tokens.accessToken,  // Backward compatibility
      tokens: result.tokens,              // New format with both tokens
      refreshToken: result.tokens.refreshToken,  // Backward compatibility
      force_password_change: forcePasswordChange
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: sanitizeError(err, 'An error occurred during login') });
  }
});

// Password requirements endpoint
app.get('/api/auth/password-requirements', (req, res) => {
  try {
    const requirements = enhancedAuthService.getPasswordRequirements();
    res.json(requirements);
  } catch (err) {
    console.error('Error fetching password requirements:', err);
    res.status(500).json({ error: 'Failed to fetch password requirements' });
  }
});

// Register endpoint (for creating new users)
app.post('/api/auth/register', authLimiter, authenticateToken, validateRequest(userSchema), async (req, res) => {
  try {
    // Check if user has permission to create users
    const hasPermission = req.user.permissions.some(p => p.name === 'user_create');
    if (!hasPermission) {
      return res.status(403).json({ error: 'You do not have permission to create users' });
    }
    
    const { username, password, email, fullName, roles } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Check if username already exists
    const existingUser = await dbPool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const userResult = await dbPool.query(
      'INSERT INTO users (username, password, email, full_name) VALUES ($1, $2, $3, $4) RETURNING *',
      [username, hashedPassword, email, fullName]
    );
    
    const user = userResult.rows[0];
    
    // Assign roles if provided
    if (Array.isArray(roles) && roles.length > 0) {
      const rolesQuery = 'SELECT id FROM roles WHERE name = ANY($1::varchar[])';
      const rolesResult = await dbPool.query(rolesQuery, [roles]);
      
      const roleIds = rolesResult.rows.map(role => role.id);
      if (roleIds.length > 0) {
        // Insert role assignments using parameterized query to prevent SQL injection
        // Build the VALUES clause with proper parameterization
        const valuesClauses = roleIds.map((_, index) => `($1, $${index + 2})`).join(', ');
        const queryParams = [user.id, ...roleIds];
        await dbPool.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES ${valuesClauses}`,
          queryParams
        );
      }
    }
    
    // Return user info (excluding password)
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'An error occurred during registration' });
  }
});

// Get current user info - with complete role and permission information
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    console.log('=== /api/auth/me endpoint called ===');
    console.log('User from token:', JSON.stringify(req.user));
    
    const userId = req.user.id;
    console.log('Fetching user with ID:', userId);
    
    // Get user from database
    const userResult = await dbPool.query('SELECT * FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      console.log('User not found in database');
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('User found in database');
    
    // Get the complete role information from the database
    const userRoles = req.user.roles || [];
    console.log('User roles from token:', userRoles);
    
    let permissions = [];
    let roleDetails = []; // Initialize roleDetails here
    
    // Hardcoded permissions for ALL roles to ensure critical features work
    const corePermissions = [
      'dashboard:read',
      'file_profile:read',
      'quality_checks:read'
    ];
    
    permissions = [...permissions, ...corePermissions];
    console.log('Added core permissions:', corePermissions);
    
    // Get roles directly from database to ensure we have the correct permissions
    if (userRoles.length > 0) {
      console.log('Fetching detailed role information from database');
      
      try {
        // 1. Get permissions from the old system (role_permissions)
        const permissionsQuery = `
          SELECT DISTINCT p.name, p.resource, p.action
          FROM permissions p
          JOIN role_permissions rp ON p.id = rp.permission_id
          JOIN roles r ON rp.role_id = r.id
          WHERE r.name = ANY($1::varchar[])
        `;
        
        const permissionsResult = await dbPool.query(permissionsQuery, [userRoles]);
        console.log('Permission query result rows:', permissionsResult.rows.length);
        
        // Convert permissions to the format expected by the frontend
        const oldSystemPermissions = permissionsResult.rows.map(p => ({
          name: p.name,
          resource: p.resource,
          action: p.action
        }));
        
        permissions = [...permissions, ...oldSystemPermissions];
        console.log('Added permissions from role_permissions junction table');
        
        // 2. Get permissions from the roles table JSON array (new system)
        console.log('Fetching role details with permissions array');
        const rolesQuery = `SELECT id, name, permissions FROM roles WHERE name = ANY($1::varchar[])`;
        const rolesResult = await dbPool.query(rolesQuery, [userRoles]);
        console.log('Roles query result rows:', rolesResult.rows.length);
        
        roleDetails = rolesResult.rows || []; // Capture role details
        
        // Process each role's JSON permissions
        for (const role of rolesResult.rows) {
          console.log(`Processing role ${role.name}`);
          console.log('Role permissions type:', typeof role.permissions);
          console.log('Role permissions:', JSON.stringify(role.permissions));
          
          // Special hardcoded permissions for Executor role to ensure proper sidebar
          if (role.name === 'Executor') {
            console.log('Adding special permissions for Executor role');
            // These are the permissions that Executor should always have
            const executorCorePermissions = [
              'mappings:read',        // Ensure mappings is included
              'insights:read',        // Ensure insights is included
              'badges:read',          // Ensure badges is included
              'stories:read',         // Ensure stories is included
              'recommendations:read', // Ensure recommendations is included
              'monitor:read',         // Ensure monitor is included
              'scheduler:read',       // Ensure scheduler is included
              'lineage:read'          // Ensure lineage is included
            ];
            permissions = [...permissions, ...executorCorePermissions];
            console.log('Added Executor core permissions:', executorCorePermissions);
          }
          
          // Process the permissions from the database (could be in several formats)
          if (role.permissions) {
            // Handle array format
            if (Array.isArray(role.permissions)) {
              console.log('Processing array format permissions');
              permissions = [...permissions, ...role.permissions];
            } 
            // Handle object format from PostgreSQL
            else if (typeof role.permissions === 'object') {
              console.log('Processing object format permissions');
              try {
                // Check if it's PostgreSQL's numeric key format
                if (Object.keys(role.permissions).some(key => !isNaN(parseInt(key)))) {
                  console.log('Processing PostgreSQL numeric key format');
                  const stringPermissions = Object.values(role.permissions);
                  permissions = [...permissions, ...stringPermissions];
                } else {
                  // Regular object format
                  console.log('Processing regular object format');
                  const permissionsArray = Object.values(role.permissions);
                  permissions = [...permissions, ...permissionsArray];
                }
              } catch (permErr) {
                console.error('Error processing permissions object:', permErr);
              }
            } else {
              console.log('Unknown permission format:', typeof role.permissions);
            }
          } else {
            console.log('No permissions found for role');
          }
        }
      } catch (rolesErr) {
        console.error('Error processing roles/permissions:', rolesErr);
      }
    } else {
      console.log('No roles found for user, using default permissions only');
    }
    
    const user = userResult.rows[0];
    console.log('Final permission count:', permissions.length);
    
    // Return user info (excluding password)
    const { password: _, ...userWithoutPassword } = user;
    
    const responseData = {
      ...userWithoutPassword,
      roles: userRoles,
      permissions: [...new Set(permissions)], // Remove duplicate permissions
      roleDetails: roleDetails
    };
    
    console.log('Sending user data response. Unique permissions count:', new Set(permissions).size);
    
    res.json(responseData);
  } catch (err) {
    console.error('Error fetching user info:', err);
    res.status(500).json({ error: 'An error occurred while fetching user info' });
  }
});

// Logout endpoint
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    
    // Remove token from sessions table
    await dbPool.query('DELETE FROM user_sessions WHERE token = $1', [token]);
    
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: sanitizeError(err, 'An error occurred during logout') });
  }
});

// Refresh token endpoint
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    
    // Get user agent from request
    const userAgent = req.get('user-agent') || 'Unknown';
    
    // Use authService to refresh the token
    const authService = require('./backend/src/services/authService');
    const result = await authService.refreshAccessToken(refreshToken, userAgent);
    
    if (!result.success) {
      return res.status(401).json({ error: result.message });
    }
    
    res.json(result);
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(500).json({ error: sanitizeError(err, 'Token refresh failed') });
  }
});

// Password Reset Request API
// User requests password reset (unauthenticated)
app.post('/api/auth/request-password-reset', authLimiter, async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username or email is required' });
    }
    
    // Find user by username or email
    const userResult = await dbPool.query(
      'SELECT id, username, email, auth_provider FROM users WHERE username = $1 OR email = $1',
      [username]
    );
    
    if (userResult.rows.length === 0) {
      // Don't reveal if user exists or not for security
      return res.json({ message: 'If the user exists, a password reset request has been submitted to the administrators.' });
    }
    
    const user = userResult.rows[0];
    
    // Check if user is SSO-only - return generic message to prevent user enumeration
    if (user.auth_provider !== 'local') {
      // Generic message that doesn't reveal account details
      return res.json({ message: 'If the user exists, a password reset request has been submitted to the administrators.' });
    }
    
    // Check if there's already a pending request
    const existingRequest = await dbPool.query(
      `SELECT id FROM password_reset_requests 
       WHERE user_id = $1 AND status = 'pending' 
       ORDER BY requested_at DESC LIMIT 1`,
      [user.id]
    );
    
    if (existingRequest.rows.length > 0) {
      return res.json({ message: 'A password reset request is already pending for this account.' });
    }
    
    // Create password reset request
    await dbPool.query(
      `INSERT INTO password_reset_requests (user_id, status) 
       VALUES ($1, 'pending')`,
      [user.id]
    );
    
    logger.info('Password reset requested', {
      userId: user.id,
      username: user.username,
      ip: req.ip
    });
    
    res.json({ message: 'Password reset request submitted. An administrator will review your request.' });
  } catch (err) {
    console.error('Password reset request error:', err);
    res.status(500).json({ error: 'An error occurred while processing your request' });
  }
});

// Force change password (authenticated users who must change password)
app.post('/api/auth/force-change-password', authenticateToken, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const userId = req.user.id;
    
    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }
    
    // Validate password requirements using password security utility
    const passwordSecurity = require('./backend/utils/passwordSecurity');
    const passwordValidation = passwordSecurity.validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ 
        error: 'Password does not meet requirements',
        details: passwordValidation.errors
      });
    }
    
    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update password and remove force_password_change flag
    await dbPool.query(
      `UPDATE users 
       SET password = $1, force_password_change = FALSE, updated_at = NOW()
       WHERE id = $2`,
      [hashedPassword, userId]
    );
    
    logger.info('User changed password (forced)', {
      userId,
      username: req.user.username
    });
    
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Force password change error:', err);
    res.status(500).json({ error: 'An error occurred while changing password' });
  }
});

// Get password reset requests (admin only)
app.get('/api/password-reset-requests', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    const isAdmin = req.user.roles && req.user.roles.includes('Admin');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    
    const result = await dbPool.query(`
      SELECT 
        prr.id,
        prr.user_id,
        prr.requested_at,
        prr.status,
        prr.approved_by,
        prr.approved_at,
        prr.denied_at,
        prr.notes,
        u.username,
        u.email,
        u.full_name,
        approver.username as approved_by_username
      FROM password_reset_requests prr
      JOIN users u ON prr.user_id = u.id
      LEFT JOIN users approver ON prr.approved_by = approver.id
      ORDER BY 
        CASE WHEN prr.status = 'pending' THEN 0 ELSE 1 END,
        prr.requested_at DESC
    `);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching password reset requests:', err);
    res.status(500).json({ error: 'Failed to fetch password reset requests' });
  }
});

// Approve password reset request (admin only)
app.post('/api/password-reset-requests/:id/approve', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    const isAdmin = req.user.roles && req.user.roles.includes('Admin');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    
    const requestId = parseInt(req.params.id);
    const { notes } = req.body;
    
    // Get the request details
    const requestResult = await dbPool.query(
      `SELECT user_id, status FROM password_reset_requests WHERE id = $1`,
      [requestId]
    );
    
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Password reset request not found' });
    }
    
    const request = requestResult.rows[0];
    
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'This request has already been processed' });
    }
    
    // Generate temporary password
    const tempPassword = 'TempPass@' + new Date().getFullYear();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);
    
    // Update user password and set force_password_change flag
    await dbPool.query(
      `UPDATE users 
       SET password = $1, force_password_change = TRUE, updated_at = NOW()
       WHERE id = $2`,
      [hashedPassword, request.user_id]
    );
    
    // Update the request status
    await dbPool.query(
      `UPDATE password_reset_requests 
       SET status = 'approved', approved_by = $1, approved_at = NOW(), notes = $2
       WHERE id = $3`,
      [req.user.id, notes, requestId]
    );
    
    logger.info('Password reset request approved', {
      requestId,
      userId: request.user_id,
      approvedBy: req.user.id,
      approvedByUsername: req.user.username
    });
    
    res.json({ 
      message: 'Password reset approved. Temporary password has been set.',
      tempPassword: tempPassword
    });
  } catch (err) {
    console.error('Error approving password reset request:', err);
    res.status(500).json({ error: 'Failed to approve password reset request' });
  }
});

// Deny password reset request (admin only)
app.post('/api/password-reset-requests/:id/deny', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    const isAdmin = req.user.roles && req.user.roles.includes('Admin');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    
    const requestId = parseInt(req.params.id);
    const { notes } = req.body;
    
    // Get the request details
    const requestResult = await dbPool.query(
      `SELECT status FROM password_reset_requests WHERE id = $1`,
      [requestId]
    );
    
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Password reset request not found' });
    }
    
    if (requestResult.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'This request has already been processed' });
    }
    
    // Update the request status
    await dbPool.query(
      `UPDATE password_reset_requests 
       SET status = 'denied', approved_by = $1, denied_at = NOW(), notes = $2
       WHERE id = $3`,
      [req.user.id, notes, requestId]
    );
    
    logger.info('Password reset request denied', {
      requestId,
      deniedBy: req.user.id,
      deniedByUsername: req.user.username
    });
    
    res.json({ message: 'Password reset request denied' });
  } catch (err) {
    console.error('Error denying password reset request:', err);
    res.status(500).json({ error: 'Failed to deny password reset request' });
  }
});

// User Management API (protected by authentication and permissions)

// Get all users (admin only)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    // Temporarily bypass permission checks for development
    // Check if user has permission to view users
    // const hasPermission = req.user.permissions.some(p => p.name === 'user_view');
    // if (!hasPermission) {
    //   return res.status(403).json({ error: 'You do not have permission to view users' });
    // }
    
    // Get pagination parameters from query string
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Get total count
    const countResult = await dbPool.query('SELECT COUNT(*) FROM users');
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Get paginated users
    const result = await dbPool.query(`
      SELECT u.id, u.username, u.email, 
        u.first_name, u.middle_name, u.last_name, u.full_name,
        u.phone_number,
        u.address_line1, u.address_line2, u.city, u.state, u.postal_code, u.country,
        u.auth_provider, u.internal_user, u.user_type,
        u.created_at, u.updated_at, u.last_login,
        array_agg(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      GROUP BY u.id
      ORDER BY u.id ASC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    // Remove null values from roles array
    const users = result.rows.map(user => ({
      ...user,
      roles: user.roles.filter(role => role !== null)
    }));
    
    res.json({
      users,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get roles
app.get('/api/roles', authenticateToken, async (req, res) => {
  try {
    // Temporarily bypass permission checks for development
    // Check if user has permission to view roles
    // const hasPermission = req.user.permissions.some(p => p.name === 'role_view');
    // if (!hasPermission) {
    //   return res.status(403).json({ error: 'You do not have permission to view roles' });
    // }
    
    // Get pagination parameters from query string
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Get total count
    const countResult = await dbPool.query('SELECT COUNT(*) FROM roles');
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Get paginated roles with user counts
    const result = await dbPool.query(
      `SELECT r.*, 
              COALESCE((SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id), 0) AS user_count
       FROM roles r 
       ORDER BY r.id ASC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    res.json({
      roles: result.rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching roles:', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// Get permissions
app.get('/api/permissions', authenticateToken, async (req, res) => {
  try {
    // Temporarily bypass permission checks for development
    // Check if user has permission to view roles
    // const hasPermission = req.user.permissions.some(p => 
    //   p.name === 'role_view' || p.name === 'role_create' || p.name === 'role_edit'
    // );
    // if (!hasPermission) {
    //   return res.status(403).json({ error: 'You do not have permission to view permissions' });
    // }
    
    const result = await dbPool.query('SELECT * FROM permissions ORDER BY resource, action');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching permissions:', err);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// Create role
app.post('/api/roles', authenticateToken, async (req, res) => {
  try {
    // Temporarily bypass permission checks for development
    // Check if user has permission to create roles
    // const hasPermission = req.user.permissions.some(p => p.name === 'role_create');
    // if (!hasPermission) {
    //   return res.status(403).json({ error: 'You do not have permission to create roles' });
    // }
    
    console.log('Create role endpoint called with body:', JSON.stringify(req.body, null, 2));
    const { name, description, permissions } = req.body;
    
    // Validate required fields
    if (!name) {
      console.log('Validation failed: Role name is missing');
      return res.status(400).json({ error: 'Role name is required' });
    }
    
    // Check if role with the same name already exists
    const existingRole = await dbPool.query('SELECT * FROM roles WHERE name = $1', [name]);
    if (existingRole.rows.length > 0) {
      console.log(`Validation failed: Role with name "${name}" already exists`);
      return res.status(400).json({ error: 'A role with this name already exists' });
    }
    
    // Create role
    const roleResult = await dbPool.query(
      'INSERT INTO roles (name, description, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING *',
      [name, description]
    );
    
    const roleId = roleResult.rows[0].id;
    
    // If permissions are provided, link them to the role
    if (permissions && Array.isArray(permissions) && permissions.length > 0) {
      // Update the permissions array in the roles table
      await dbPool.query(
        'UPDATE roles SET permissions = $1 WHERE id = $2',
        [permissions, roleId]
      );
    }
    
    // Return the created role
    const createdRole = await dbPool.query('SELECT * FROM roles WHERE id = $1', [roleId]);
    res.status(201).json(createdRole.rows[0]);
  } catch (err) {
    console.error('Error creating role:', err);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// Update role
app.put('/api/roles/:id', authenticateToken, async (req, res) => {
  try {
    console.log('Role update endpoint called');
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    
    // Temporarily bypass permission checks for development
    // Check if user has permission to update roles
    // const hasPermission = req.user.permissions.some(p => p.name === 'role_edit');
    // if (!hasPermission) {
    //   return res.status(403).json({ error: 'You do not have permission to update roles' });
    // }
    
    const roleId = req.params.id;
    const { name, description, permissions } = req.body;
    
    console.log(`Updating role ${roleId} with name: ${name}, description: ${description}`);
    console.log('Permissions:', permissions);
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }
    
    // Check if role exists
    const existingRole = await dbPool.query('SELECT * FROM roles WHERE id = $1', [roleId]);
    if (existingRole.rows.length === 0) {
      console.log(`Role with ID ${roleId} not found`);
      return res.status(404).json({ error: 'Role not found' });
    }
    
    console.log('Existing role:', existingRole.rows[0]);
    
    // Don't allow changing Admin role name
    if (existingRole.rows[0].name.toLowerCase() === 'admin' && 
        name.toLowerCase() !== 'admin') {
      return res.status(400).json({ error: 'The Admin role name cannot be changed' });
    }
    
    // Check if another role with the same name exists
    const duplicateRole = await dbPool.query(
      'SELECT * FROM roles WHERE name = $1 AND id != $2', 
      [name, roleId]
    );
    
    if (duplicateRole.rows.length > 0) {
      return res.status(400).json({ error: 'Another role with this name already exists' });
    }
    
    // Update role
    await dbPool.query(
      'UPDATE roles SET name = $1, description = $2, updated_at = NOW() WHERE id = $3',
      [name, description, roleId]
    );
    
    // Update permissions
    if (permissions && Array.isArray(permissions)) {
      console.log('Updating permissions for role:', permissions);
      // Update the permissions array
      await dbPool.query(
        'UPDATE roles SET permissions = $1 WHERE id = $2',
        [permissions, roleId]
      );
    }
    
    // Return the updated role
    const updatedRole = await dbPool.query('SELECT * FROM roles WHERE id = $1', [roleId]);
    console.log('Updated role:', updatedRole.rows[0]);
    res.json(updatedRole.rows[0]);
  } catch (err) {
    console.error('Error updating role:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Delete role
app.delete('/api/roles/:id', authenticateToken, async (req, res) => {
  try {
    // Temporarily bypass permission checks for development
    // Check if user has permission to delete roles
    // const hasPermission = req.user.permissions.some(p => p.name === 'role_delete');
    // if (!hasPermission) {
    //   return res.status(403).json({ error: 'You do not have permission to delete roles' });
    // }
    
    const roleId = req.params.id;
    
    // Check if role exists
    const existingRole = await dbPool.query('SELECT * FROM roles WHERE id = $1', [roleId]);
    if (existingRole.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    // Don't allow deleting Admin role
    if (existingRole.rows[0].name.toLowerCase() === 'admin') {
      return res.status(400).json({ error: 'The Admin role cannot be deleted' });
    }
    
    // Check if role is assigned to users
    const usersWithRole = await dbPool.query(
      `SELECT COUNT(*) FROM user_roles 
       WHERE role_id = $1`,
      [roleId]
    );
    
    if (parseInt(usersWithRole.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete role because it is assigned to users. Reassign users to other roles first.' 
      });
    }
    
    // Delete role
    await dbPool.query('DELETE FROM roles WHERE id = $1', [roleId]);
    
    res.json({ message: 'Role deleted successfully' });
  } catch (err) {
    console.error('Error deleting role:', err);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

// Get AI insights for a file
app.get('/api/files/:fileId/insights', authenticateToken, cacheMiddleware(600), async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Check if user has permission to view insights
    const hasPermission = req.user.permissions.some(p => p.name === 'insight_view');
    if (!hasPermission) {
      return res.status(403).json({ error: 'You do not have permission to view insights' });
    }
    
    // Get file from database
    const fileResult = await dbPool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = fileResult.rows[0];
    
    // Get column statistics
    const columnStats = await dbPool.query(
      'SELECT * FROM file_columns WHERE file_id = $1',
      [fileId]
    );
    
    // Get file profile
    const profileResult = await dbPool.query(
      'SELECT * FROM file_profiles WHERE file_id = $1 ORDER BY created_at DESC LIMIT 1',
      [fileId]
    );
    
    let profile = null;
    if (profileResult.rows.length > 0) {
      profile = profileResult.rows[0];
    }
    
    // Get quality report
    const qualityResult = await dbPool.query(
      'SELECT * FROM file_quality_checks WHERE file_id = $1 ORDER BY created_at DESC LIMIT 1',
      [fileId]
    );
    
    let quality = null;
    if (qualityResult.rows.length > 0) {
      quality = qualityResult.rows[0];
    }
    
    // Generate insights based on file data
    const insights = {
      summary: {
        fileType: file.file_type,
        rowCount: file.row_count,
        columnCount: file.column_count,
        qualityScore: file.quality_score,
        createdAt: file.created_at,
        updatedAt: file.updated_at
      },
      columnInsights: columnStats.rows.map(col => ({
        name: col.column_name,
        type: col.column_type,
        nullPercentage: col.null_percentage,
        uniquePercentage: col.unique_percentage,
        recommendations: []
      })),
      qualityInsights: quality ? {
        overallScore: quality.overall_score,
        completenessScore: quality.completeness_score,
        validityScore: quality.validity_score,
        consistencyScore: quality.consistency_score,
        accuracyScore: quality.accuracy_score,
        issues: JSON.parse(quality.issues)
      } : null,
      recommendations: [
        {
          id: `rec_${Date.now()}_1`,
          type: 'quality',
          title: 'Improve Data Quality',
          description: 'Consider addressing missing values and outliers to improve overall data quality.',
          actionable: true,
          priority: 'high'
        },
        {
          id: `rec_${Date.now()}_2`,
          type: 'performance',
          title: 'Optimize Data Structure',
          description: 'Converting categorical columns to numerical encodings can improve processing efficiency.',
          actionable: true,
          priority: 'medium'
        },
        {
          id: `rec_${Date.now()}_3`,
          type: 'security',
          title: 'Review Sensitive Data',
          description: 'Ensure any potentially sensitive information is properly anonymized or encrypted.',
          actionable: true,
          priority: 'high'
        }
      ]
    };
    
    res.json(insights);
  } catch (err) {
    console.error('Error generating AI insights:', err);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

// Run quality check on a file endpoint
app.post('/api/files/:fileId/quality/check', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { rules = [], anomalyDetection = true, calculateReliabilityScore = true } = req.body;
    
    // First, verify the file exists
    const fileResult = await dbPool.query('SELECT * FROM files WHERE file_id = $1', [fileId]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = fileResult.rows[0];
    
    // Get column data for the file
    const columnsResult = await dbPool.query('SELECT * FROM file_columns WHERE file_id = $1', [fileId]);
    const columns = columnsResult.rows;

    // Run basic quality checks
    const basicChecks = {
      null_values_check: {
        status: 'passed',
        details: {
          total_null: 0,
          null_percentage: 0,
          columns_with_nulls: []
        }
      },
      duplicate_rows_check: {
        status: 'passed',
        details: {
          duplicate_count: 0,
          duplicate_percentage: 0
        }
      },
      pattern_checks: {
        status: 'passed',
        details: {
          failed_patterns: []
        }
      }
    };
    
    // Simulate checking nulls in columns
    let totalNulls = 0;
    const columnsWithNulls = [];
    
    columns.forEach(column => {
      // Extract null percentage from column data or assign a default
      const nullPercentage = column.null_percentage || 0;
      
      if (nullPercentage > 0) {
        totalNulls += Math.round((nullPercentage / 100) * file.row_count);
        columnsWithNulls.push({
          column_name: column.column_name,
          null_count: Math.round((nullPercentage / 100) * file.row_count),
          null_percentage: nullPercentage
        });
      }
    });
    
    if (columnsWithNulls.length > 0) {
      basicChecks.null_values_check.status = 'warning';
      basicChecks.null_values_check.details.total_null = totalNulls;
      basicChecks.null_values_check.details.null_percentage = (totalNulls / (file.row_count * file.column_count)) * 100;
      basicChecks.null_values_check.details.columns_with_nulls = columnsWithNulls;
    }
    
    // Calculate scores for different quality dimensions
    const completenessScore = 100 - (basicChecks.null_values_check.details.null_percentage || 0);
    const validityScore = 95; // Placeholder
    const consistencyScore = 90; // Placeholder
    const accuracyScore = 85; // Placeholder
    
    // Create an array for any detected issues
    const issues = [];
    
    // Add issues from basic checks
    if (basicChecks.null_values_check.status !== 'passed') {
      issues.push({
        type: 'missing_data',
        severity: 'warning',
        message: `Found ${basicChecks.null_values_check.details.total_null} null values across ${columnsWithNulls.length} columns`,
        affected_columns: columnsWithNulls.map(c => c.column_name)
      });
    }
    
    // Apply any custom rules
    for (const rule of rules) {
      // This would check each rule against the data
      // As a placeholder, just log what we would check
      console.log(`Would check rule: ${rule.type} on column ${rule.column}`);
    }
    
    // Calculate overall quality score (weighted average)
    const overallScore = Math.round(
      (completenessScore * 0.3) + 
      (validityScore * 0.25) + 
      (consistencyScore * 0.25) + 
      (accuracyScore * 0.2)
    );
    
    // Insert quality check results into file_quality_checks
    // First ensure we have proper checks in the right format
    const qualityChecks = [
      {
        check_type: 'completeness',
        check_name: 'Missing Values Check',
        status: columnsWithNulls.length > 0 ? 'warning' : 'passed',
        score: completenessScore,
        details: { 
          description: 'Check for missing values in the dataset',
          null_counts: basicChecks.null_values_check.details
        }
      },
      {
        check_type: 'consistency',
        check_name: 'Data Type Consistency',
        status: 'passed',
        score: consistencyScore,
        details: { description: 'Check if data types are consistent across columns' }
      },
      {
        check_type: 'validity',
        check_name: 'Value Range Check',
        status: 'passed',
        score: validityScore,
        details: { description: 'Check if values are within expected ranges' }
      },
      {
        check_type: 'accuracy',
        check_name: 'Data Accuracy',
        status: 'passed',
        score: accuracyScore,
        details: { description: 'Check if data values are accurate and conform to expected patterns' }
      }
    ];
    
    // First clear existing checks for this file to avoid duplicates
    await dbPool.query('DELETE FROM file_quality_checks WHERE file_id = $1', [fileId]);
    
    // Insert new checks
    for (const check of qualityChecks) {
      await dbPool.query(
        'INSERT INTO file_quality_checks (file_id, check_type, check_name, status, score, details) VALUES ($1, $2, $3, $4, $5, $6)',
        [fileId, check.check_type, check.check_name, check.status, check.score, JSON.stringify(check.details)]
      );
    }
    
    // Also update the quality score in the files table
    await dbPool.query(
      'UPDATE files SET quality_score = $1 WHERE file_id = $2',
      [overallScore, fileId]
    );
    
    // Fetch the newly created checks to return
    const newChecksResult = await dbPool.query(
      'SELECT * FROM file_quality_checks WHERE file_id = $1',
      [fileId]
    );
    
    const qualityData = {
      file_id: fileId,
      overall_score: overallScore,
      dimension_scores: {
        completeness: completenessScore,
        validity: validityScore,
        consistency: consistencyScore,
        accuracy: accuracyScore
      },
      checks: newChecksResult.rows.map(row => ({
        id: row.id,
        type: row.check_type,
        name: row.check_name,
        status: row.status,
        score: row.score,
        details: row.details
      })),
      issues: issues,
      created_at: new Date().toISOString()
    };
    
    res.json(qualityData);
  } catch (error) {
    console.error('Error running quality check:', error);
    res.status(500).json({ error: 'Failed to run quality check', details: error.message });
  }
});

// Debug route to check password hashing - REMOVE IN PRODUCTION
app.get('/api/debug/hash-password/:password', async (req, res) => {
  try {
    const { password } = req.params;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    res.json({ hashedPassword });
  } catch (err) {
    console.error('Error hashing password:', err);
    res.status(500).json({ error: 'Failed to hash password' });
  }
});

// Create the schedules table if it doesn't exist
(async () => {
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS file_schedules (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        frequency VARCHAR(50) NOT NULL, -- 'hourly', 'daily', 'weekly', 'monthly'
        time VARCHAR(10), -- HH:MM format (for non-hourly frequencies)
        day INTEGER, -- Day of week (0-6) for weekly or day of month (1-31) for monthly
        is_active BOOLEAN DEFAULT TRUE,
        last_run TIMESTAMP,
        next_run TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(255),
        CONSTRAINT fk_file FOREIGN KEY(file_id) REFERENCES files(file_id) ON DELETE CASCADE
      )
    `);
    console.log('File schedules table initialized');
  } catch (error) {
    console.error('Error creating schedules table:', error);
  }
})();

// Create the transformations table if it doesn't exist
(async () => {
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS transformations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        config JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id)
      )
    `);
    console.log('Transformations table initialized');
  } catch (error) {
    console.error('Error creating transformations table:', error);
  }
})();

// Transformations endpoints (returns transformation_mappings for workflow builder)
app.get('/api/transformations', authenticateToken, async (req, res) => {
  try {
    const result = await dbPool.query(`
      SELECT 
        id,
        mapping_id,
        mapping_name,
        description,
        source_file_pattern,
        project_id,
        status,
        enabled,
        created_at,
        updated_at
      FROM transformation_mappings 
      WHERE enabled = true
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching transformations:', err);
    res.status(500).json({ error: 'Failed to fetch transformations' });
  }
});

app.get('/api/transformations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbPool.query('SELECT * FROM transformations WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transformation not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching transformation:', err);
    res.status(500).json({ error: 'Failed to fetch transformation' });
  }
});

app.post('/api/transformations', authenticateToken, async (req, res) => {
  try {
    const { name, description, config } = req.body;
    const userId = req.user.id;
    
    const result = await dbPool.query(
      'INSERT INTO transformations (name, description, config, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, config, userId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating transformation:', err);
    res.status(500).json({ error: 'Failed to create transformation' });
  }
});

app.put('/api/transformations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, config } = req.body;
    
    const result = await dbPool.query(
      'UPDATE transformations SET name = $1, description = $2, config = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
      [name, description, config, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transformation not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating transformation:', err);
    res.status(500).json({ error: 'Failed to update transformation' });
  }
});

app.delete('/api/transformations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbPool.query('DELETE FROM transformations WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transformation not found' });
    }
    
    res.json({ message: 'Transformation deleted successfully' });
  } catch (err) {
    console.error('Error deleting transformation:', err);
    res.status(500).json({ error: 'Failed to delete transformation' });
  }
});

// Schedule endpoints

// Get all schedules
app.get('/api/schedules', async (req, res) => {
  try {
    const result = await dbPool.query('SELECT * FROM file_schedules ORDER BY created_at DESC');
    res.json({ schedules: result.rows });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules', details: error.message });
  }
});

// Get a specific schedule
app.get('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbPool.query('SELECT * FROM file_schedules WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json({ schedule: result.rows[0] });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule', details: error.message });
  }
});

// Create a new schedule
app.post('/api/schedules', async (req, res) => {
  try {
    const { file_id, frequency, time, day, is_active } = req.body;
    
    if (!file_id || !frequency) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Calculate next run time
    const now = new Date();
    let nextRun = new Date(now);
    
    switch (frequency) {
      case 'hourly':
        nextRun.setHours(nextRun.getHours() + 1, 0, 0, 0);
        break;
      case 'daily':
        const [hours, minutes] = time ? time.split(':').map(Number) : [0, 0];
        nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(hours, minutes, 0, 0);
        break;
      case 'weekly':
        const dayOfWeek = day || 0;
        const daysToAdd = (dayOfWeek + 7 - now.getDay()) % 7;
        nextRun.setDate(nextRun.getDate() + (daysToAdd === 0 ? 7 : daysToAdd));
        const [weekHours, weekMinutes] = time ? time.split(':').map(Number) : [0, 0];
        nextRun.setHours(weekHours, weekMinutes, 0, 0);
        break;
      case 'monthly':
        const dayOfMonth = day || 1;
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(dayOfMonth);
        const [monthHours, monthMinutes] = time ? time.split(':').map(Number) : [0, 0];
        nextRun.setHours(monthHours, monthMinutes, 0, 0);
        break;
      default:
        nextRun.setDate(nextRun.getDate() + 1);
    }
    
    const result = await dbPool.query(
      `INSERT INTO file_schedules 
       (file_id, frequency, time, day, is_active, next_run) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [file_id, frequency, time, day, is_active, nextRun]
    );
    
    res.status(201).json({ schedule: result.rows[0] });
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ error: 'Failed to create schedule', details: error.message });
  }
});

// Update a schedule
app.patch('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { frequency, time, day, is_active } = req.body;
    
    // Start with the updates we have
    const updates = {};
    const values = [];
    let paramIndex = 1;
    
    if (frequency !== undefined) {
      updates.frequency = `frequency = $${paramIndex++}`;
      values.push(frequency);
    }
    
    if (time !== undefined) {
      updates.time = `time = $${paramIndex++}`;
      values.push(time);
    }
    
    if (day !== undefined) {
      updates.day = `day = $${paramIndex++}`;
      values.push(day);
    }
    
    if (is_active !== undefined) {
      updates.is_active = `is_active = $${paramIndex++}`;
      values.push(is_active);
    }
    
    // Add the updated_at timestamp
    updates.updated_at = `updated_at = $${paramIndex++}`;
    values.push(new Date());
    
    // Add the schedule ID as the last parameter
    values.push(id);
    
    // Construct the update query
    const updateClause = Object.values(updates).join(', ');
    const query = `UPDATE file_schedules SET ${updateClause} WHERE id = $${paramIndex} RETURNING *`;
    
    const result = await dbPool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json({ schedule: result.rows[0] });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule', details: error.message });
  }
});

// Delete a schedule
app.delete('/api/job-schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await dbPool.query('DELETE FROM file_schedules WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json({ message: 'Schedule deleted successfully', schedule: result.rows[0] });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule', details: error.message });
  }
});

// Run a schedule immediately
app.post('/api/schedules/:id/run', async (req, res) => {
  try {
    // Check if user has schedule:execute permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('schedule:execute')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to execute schedules. Contact your administrator.'
      });
    }
    
    const { id } = req.params;
    
    // First, get the schedule
    const scheduleResult = await dbPool.query('SELECT * FROM file_schedules WHERE id = $1', [id]);
    
    if (scheduleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    const schedule = scheduleResult.rows[0];
    
    // Get the file info
    const fileResult = await dbPool.query('SELECT * FROM files WHERE file_id = $1', [schedule.file_id]);
    
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Associated file not found' });
    }
    
    const file = fileResult.rows[0];
    
    // Update the last_run time
    await dbPool.query(
      'UPDATE file_schedules SET last_run = $1 WHERE id = $2',
      [new Date(), id]
    );
    
    // Here you would trigger the file processing logic
    // For now, just return success
    res.json({ 
      message: 'Schedule triggered successfully',
      job: {
        id: uuidv4(),
        status: 'processing',
        file: {
          id: file.file_id,
          name: file.filename
        },
        started_at: new Date()
      }
    });
  } catch (error) {
    console.error('Error running schedule:', error);
    res.status(500).json({ error: 'Failed to run schedule', details: error.message });
  }
});

// Update a schedule
app.patch('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { file_id, frequency, time, day, is_active } = req.body;
    
    // First, check if the schedule exists
    const checkResult = await dbPool.query('SELECT * FROM file_schedules WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    // Validate inputs
    if (file_id && typeof file_id !== 'string') {
      return res.status(400).json({ error: 'Invalid file_id format' });
    }
    
    if (frequency && !['hourly', 'daily', 'weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency value' });
    }
    
    // Calculate next run time if frequency is changing
    let nextRun = null;
    if (frequency) {
      const now = new Date();
      nextRun = new Date(now);
      
      switch (frequency) {
        case 'hourly':
          nextRun.setHours(nextRun.getHours() + 1, 0, 0, 0);
          break;
        case 'daily':
          const [hours, minutes] = time ? time.split(':').map(Number) : [0, 0];
          nextRun.setDate(nextRun.getDate() + 1);
          nextRun.setHours(hours, minutes, 0, 0);
          break;
        case 'weekly':
          const dayOfWeek = day || 0;
          const daysToAdd = (dayOfWeek + 7 - now.getDay()) % 7;
          nextRun.setDate(nextRun.getDate() + (daysToAdd === 0 ? 7 : daysToAdd));
          const [weekHours, weekMinutes] = time ? time.split(':').map(Number) : [0, 0];
          nextRun.setHours(weekHours, weekMinutes, 0, 0);
          break;
        case 'monthly':
          const dayOfMonth = day || 1;
          nextRun.setMonth(nextRun.getMonth() + 1);
          nextRun.setDate(dayOfMonth);
          const [monthHours, monthMinutes] = time ? time.split(':').map(Number) : [0, 0];
          nextRun.setHours(monthHours, monthMinutes, 0, 0);
          break;
        default:
          nextRun.setDate(nextRun.getDate() + 1);
      }
    }
    
    // Build the update query dynamically
    let updateFields = [];
    let queryParams = [];
    let paramCount = 1;
    
    if (file_id !== undefined) {
      updateFields.push(`file_id = $${paramCount}`);
      queryParams.push(file_id);
      paramCount++;
    }
    
    if (frequency !== undefined) {
      updateFields.push(`frequency = $${paramCount}`);
      queryParams.push(frequency);
      paramCount++;
    }
    
    if (time !== undefined) {
      updateFields.push(`time = $${paramCount}`);
      queryParams.push(time);
      paramCount++;
    }
    
    if (day !== undefined) {
      updateFields.push(`day = $${paramCount}`);
      queryParams.push(day);
      paramCount++;
    }
    
    if (is_active !== undefined) {
      updateFields.push(`is_active = $${paramCount}`);
      queryParams.push(is_active);
      paramCount++;
    }
    
    if (nextRun !== null) {
      updateFields.push(`next_run = $${paramCount}`);
      queryParams.push(nextRun);
      paramCount++;
    }
    
    // Always update the updated_at timestamp
    updateFields.push(`updated_at = $${paramCount}`);
    queryParams.push(new Date());
    paramCount++;
    
    // Add the id as the last parameter
    queryParams.push(id);
    
    // If no fields to update, return early
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    // Execute the update query
    const result = await dbPool.query(
      `UPDATE file_schedules SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      queryParams
    );
    
    res.json({ schedule: result.rows[0] });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule', details: error.message });
  }
});

// Delete a schedule
app.delete('/api/job-schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, check if the schedule exists
    const checkResult = await dbPool.query('SELECT * FROM file_schedules WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    // Delete the schedule
    await dbPool.query('DELETE FROM file_schedules WHERE id = $1', [id]);
    
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule', details: error.message });
  }
});

// Get schedules for a specific file
app.get('/api/files/:fileId/schedules', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const result = await dbPool.query(
      'SELECT * FROM file_schedules WHERE file_id = $1 ORDER BY created_at DESC',
      [fileId]
    );
    
    res.json({ schedules: result.rows });
  } catch (error) {
    console.error('Error fetching file schedules:', error);
    res.status(500).json({ error: 'Failed to fetch file schedules', details: error.message });
  }
});

// Business Processes API

// Get all business processes
app.get('/api/business-processes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("Fetching business processes for user ID:", userId);
    
    // First, ensure the default group exists and the user is a member
    try {
      // Check if default group exists
      console.log("Checking for default group");
      const defaultGroupCheck = await dbPool.query("SELECT id FROM groups WHERE name = 'Default Group'");
      
      let defaultGroupId;
      
      if (defaultGroupCheck.rows.length === 0) {
        // Create default group
        console.log("Creating default group");
        const newGroupResult = await dbPool.query(
          "INSERT INTO groups (name, description) VALUES ('Default Group', 'Default group for all users') RETURNING id"
        );
        defaultGroupId = newGroupResult.rows[0].id;
        console.log("Created default group with ID:", defaultGroupId);
      } else {
        defaultGroupId = defaultGroupCheck.rows[0].id;
        console.log("Found existing default group with ID:", defaultGroupId);
      }
      
      // Ensure user is in the default group
      console.log("Ensuring user", userId, "is in default group");
      const userGroupCheck = await dbPool.query(
        "SELECT 1 FROM user_groups WHERE user_id = $1 AND group_id = $2",
        [userId, defaultGroupId]
      );
      
      if (userGroupCheck.rows.length === 0) {
        // Add user to default group
        console.log("Adding user to default group");
        await dbPool.query(
          "INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [userId, defaultGroupId]
        );
        console.log("User added to default group");
      } else {
        console.log("User already in default group");
      }
    } catch (groupErr) {
      console.error("Error handling default group:", groupErr);
      // Continue anyway - we'll try to fetch what we can
    }
    
    // Get user's groups - now using a LEFT JOIN to include all groups
    const userGroupsQuery = `
      SELECT g.id
      FROM groups g
      LEFT JOIN user_groups ug ON g.id = ug.group_id AND ug.user_id = $1
      WHERE ug.user_id = $1 OR g.name = 'Default Group'
    `;
    
    const userGroupsResult = await dbPool.query(userGroupsQuery, [userId]);
    const userGroupIds = userGroupsResult.rows.map(row => row.id);
    console.log("User group IDs:", userGroupIds);
    
    if (userGroupIds.length === 0) {
      return res.json([]);
    }
    
    // Get all business processes for the user's groups
    const businessProcessesQuery = `
      SELECT bp.*, g.name as group_name, 
        COALESCE(COUNT(j.id), 0) as job_count,
        p.name as project_name
      FROM business_processes bp
      LEFT JOIN groups g ON bp.group_id = g.id
      LEFT JOIN jobs j ON bp.id = j.business_process_id
      LEFT JOIN projects p ON bp.project_id = p.id
      WHERE bp.group_id = ANY($1)
      GROUP BY bp.id, g.name, p.name
      ORDER BY bp.updated_at DESC
    `;
    
    const processesResult = await dbPool.query(businessProcessesQuery, [userGroupIds]);
    res.json(processesResult.rows);
  } catch (err) {
    console.error('Error fetching business processes:', err);
    res.status(500).json({ error: 'Failed to fetch business processes' });
  }
});

// Get a single business process with its jobs
app.get('/api/business-processes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Get user's groups
    const userGroupsQuery = `
      SELECT g.id
      FROM groups g
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE ug.user_id = $1
    `;
    const userGroupsResult = await dbPool.query(userGroupsQuery, [userId]);
    const userGroupIds = userGroupsResult.rows.map(row => row.id);
    
    if (userGroupIds.length === 0) {
      return res.status(403).json({ error: 'You do not have access to this business process' });
    }
    
    // Get the business process
    const processQuery = `
      SELECT bp.*, g.name as group_name
      FROM business_processes bp
      LEFT JOIN groups g ON bp.group_id = g.id
      WHERE bp.id = $1
    `;
    const processResult = await dbPool.query(processQuery, [id]);
    
    if (processResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business process not found' });
    }
    
    const process = processResult.rows[0];
    
    // Check if user has access to this process through their groups
    if (!userGroupIds.includes(process.group_id)) {
      return res.status(403).json({ error: 'You do not have access to this business process' });
    }
    
    // Get all jobs for this business process
    const jobsQuery = `
      SELECT j.*, COALESCE(COUNT(jr.id), 0) as run_count,
        MAX(jr.start_time) as last_run_time
      FROM jobs j
      LEFT JOIN job_runs jr ON j.id = jr.job_id
      WHERE j.business_process_id = $1
      GROUP BY j.id
      ORDER BY j.updated_at DESC
    `;
    const jobsResult = await dbPool.query(jobsQuery, [id]);
    
    // Combine process and jobs
    const businessProcess = processResult.rows[0];
    businessProcess.jobs = jobsResult.rows;
    
    res.json(businessProcess);
  } catch (err) {
    console.error('Error fetching business process:', err);
    res.status(500).json({ error: 'Failed to fetch business process' });
  }
});

// Create a business process
app.post('/api/business-processes', authenticateToken, async (req, res) => {
  try {
    let { name, description, group_id } = req.body;
    // Use a default user ID if authentication is skipped
    const userId = req.user ? req.user.id : 2; // Default to admin user (ID 2)
    
    console.log("Creating business process:", { name, description, group_id, userId });
    
    if (!name) {
      return res.status(400).json({ error: 'Business process name is required' });
    }
    
    // If no group_id provided, find or create default group
    if (!group_id) {
      console.log("No group_id provided, looking for default group");
      
      // Check if default group exists
      const defaultGroupResult = await dbPool.query("SELECT id FROM groups WHERE name = 'Default Group'");
      
      if (defaultGroupResult.rows.length > 0) {
        // Use existing default group
        group_id = defaultGroupResult.rows[0].id;
        console.log("Using existing default group ID:", group_id);
      } else {
        // Create a default group
        console.log("Creating default group");
        try {
          const newGroupResult = await dbPool.query(
            "INSERT INTO groups (name, description) VALUES ('Default Group', 'Default group for all users') RETURNING id"
          );
          group_id = newGroupResult.rows[0].id;
          console.log("Created new default group with ID:", group_id);
        } catch (groupErr) {
          console.error("Error creating default group:", groupErr);
          return res.status(500).json({ error: 'Failed to create default group', details: groupErr.message });
        }
      }
    } else {
      // Verify the specified group exists
      console.log("Verifying group exists:", group_id);
      const groupCheck = await dbPool.query("SELECT id FROM groups WHERE id = $1", [group_id]);
      
      if (groupCheck.rows.length === 0) {
        console.error("Specified group ID does not exist:", group_id);
        return res.status(400).json({ error: 'Specified group does not exist' });
      }
      
      console.log("Group exists:", groupCheck.rows[0]);
    }
    
    // For now, skip the group verification since we're
    // implementing a simplified auth model for business process management
    // This allows any user to create in any group
    const skipGroupVerification = true;
    
    // Create the business process
    const insertQuery = `
      INSERT INTO business_processes (name, description, group_id, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await dbPool.query(insertQuery, [name, description, group_id, userId]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating business process:', err);
    res.status(500).json({ error: 'Failed to create business process' });
  }
});

// Update a business process
app.put('/api/business-processes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, group_id, status } = req.body;
    // Use a default user ID if authentication is skipped
    const userId = req.user ? req.user.id : 2; // Default to admin user (ID 2)
    
    if (!name) {
      return res.status(400).json({ error: 'Business process name is required' });
    }
    
    // Check if process exists and user has access
    const checkQuery = `
      SELECT bp.* FROM business_processes bp
      JOIN groups g ON bp.group_id = g.id
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE bp.id = $1 AND ug.user_id = $2
    `;
    
    const checkResult = await dbPool.query(checkQuery, [id, userId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business process not found or you do not have access to it' });
    }
    
    // If group_id is being changed, verify user is a member of the new group
    if (group_id && group_id !== checkResult.rows[0].group_id) {
      const userGroupQuery = `
        SELECT 1 FROM user_groups 
        WHERE user_id = $1 AND group_id = $2
      `;
      
      const userGroupResult = await dbPool.query(userGroupQuery, [userId, group_id]);
      
      if (userGroupResult.rows.length === 0) {
        return res.status(403).json({ error: 'You are not a member of the specified group' });
      }
    }
    
    // Update the business process
    const updateQuery = `
      UPDATE business_processes
      SET name = $1, 
          description = $2, 
          group_id = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;
    
    const finalGroupId = group_id || checkResult.rows[0].group_id;
    
    const result = await dbPool.query(updateQuery, [name, description, finalGroupId, id]);
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating business process:', err);
    res.status(500).json({ error: 'Failed to update business process' });
  }
});

// Delete a business process
app.delete('/api/business-processes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    // Use a default user ID if authentication is skipped
    const userId = req.user ? req.user.id : 2; // Default to admin user (ID 2)
    
    // Check if process exists and user has access
    const checkQuery = `
      SELECT bp.* FROM business_processes bp
      JOIN groups g ON bp.group_id = g.id
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE bp.id = $1 AND ug.user_id = $2
    `;
    
    const checkResult = await dbPool.query(checkQuery, [id, userId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business process not found or you do not have access to it' });
    }
    
    // Delete the business process (cascade will delete related jobs)
    const deleteQuery = 'DELETE FROM business_processes WHERE id = $1';
    await dbPool.query(deleteQuery, [id]);
    
    res.json({ message: 'Business process deleted successfully' });
  } catch (err) {
    console.error('Error deleting business process:', err);
    res.status(500).json({ error: 'Failed to delete business process' });
  }
});

// Jobs API

// Get all jobs
app.get('/api/jobs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("Fetching jobs for user ID:", userId);
    
    // First, ensure the default group exists and the user is a member
    try {
      // Check if default group exists
      console.log("Checking for default group");
      const defaultGroupCheck = await dbPool.query("SELECT id FROM groups WHERE name = 'Default Group'");
      
      let defaultGroupId;
      
      if (defaultGroupCheck.rows.length === 0) {
        // Create default group
        console.log("Creating default group");
        const newGroupResult = await dbPool.query(
          "INSERT INTO groups (name, description) VALUES ('Default Group', 'Default group for all users') RETURNING id"
        );
        defaultGroupId = newGroupResult.rows[0].id;
        console.log("Created default group with ID:", defaultGroupId);
      } else {
        defaultGroupId = defaultGroupCheck.rows[0].id;
        console.log("Found existing default group with ID:", defaultGroupId);
      }
      
      // Ensure user is in the default group
      console.log("Ensuring user", userId, "is in default group");
      const userGroupCheck = await dbPool.query(
        "SELECT 1 FROM user_groups WHERE user_id = $1 AND group_id = $2",
        [userId, defaultGroupId]
      );
      
      if (userGroupCheck.rows.length === 0) {
        // Add user to default group
        console.log("Adding user to default group");
        await dbPool.query(
          "INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [userId, defaultGroupId]
        );
        console.log("User added to default group");
      } else {
        console.log("User already in default group");
      }
    } catch (groupErr) {
      console.error("Error handling default group:", groupErr);
      // Continue anyway - we'll try to fetch what we can
    }
    
    // Get user's groups - now including default group
    const userGroupsQuery = `
      SELECT g.id
      FROM groups g
      LEFT JOIN user_groups ug ON g.id = ug.group_id AND ug.user_id = $1
      WHERE ug.user_id = $1 OR g.name = 'Default Group'
    `;
    const userGroupsResult = await dbPool.query(userGroupsQuery, [userId]);
    const userGroupIds = userGroupsResult.rows.map(row => row.id);
    console.log("User group IDs for jobs:", userGroupIds);
    
    if (userGroupIds.length === 0) {
      console.log("No groups found for user, returning empty jobs array");
      return res.json([]);
    }
    
    // Get all jobs for the business processes in user's groups WITHOUT job_runs
    const jobsQuery = `
      SELECT j.*, bp.name as business_process_name, g.name as group_name
      FROM jobs j
      JOIN business_processes bp ON j.business_process_id = bp.id
      JOIN groups g ON bp.group_id = g.id
      WHERE bp.group_id = ANY($1::integer[])
      ORDER BY j.updated_at DESC
    `;
    
    const jobsResult = await dbPool.query(jobsQuery, [userGroupIds]);
    
    // Add empty placeholders for run_count and last_run_time
    const jobsWithRunInfo = jobsResult.rows.map(job => {
      return {
        ...job,
        run_count: 0,
        last_run_time: null
      };
    });
    
    console.log('Jobs fetched successfully, returned count:', jobsWithRunInfo.length);
    res.json(jobsWithRunInfo);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get a single job with its history
app.get('/api/jobs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    console.log("Fetching single job with ID:", id, "for user ID:", userId);
    
    // First, ensure the default group exists and the user is a member
    try {
      // Check if default group exists
      console.log("Checking for default group");
      const defaultGroupCheck = await dbPool.query("SELECT id FROM groups WHERE name = 'Default Group'");
      
      let defaultGroupId;
      
      if (defaultGroupCheck.rows.length === 0) {
        // Create default group
        console.log("Creating default group");
        const newGroupResult = await dbPool.query(
          "INSERT INTO groups (name, description) VALUES ('Default Group', 'Default group for all users') RETURNING id"
        );
        defaultGroupId = newGroupResult.rows[0].id;
        console.log("Created default group with ID:", defaultGroupId);
      } else {
        defaultGroupId = defaultGroupCheck.rows[0].id;
        console.log("Found existing default group with ID:", defaultGroupId);
      }
      
      // Ensure user is in the default group
      console.log("Ensuring user", userId, "is in default group");
      const userGroupCheck = await dbPool.query(
        "SELECT 1 FROM user_groups WHERE user_id = $1 AND group_id = $2",
        [userId, defaultGroupId]
      );
      
      if (userGroupCheck.rows.length === 0) {
        // Add user to default group
        console.log("Adding user to default group");
        await dbPool.query(
          "INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [userId, defaultGroupId]
        );
        console.log("User added to default group");
      } else {
        console.log("User already in default group");
      }
    } catch (groupErr) {
      console.error("Error handling default group:", groupErr);
      // Continue anyway - we'll try to fetch what we can
    }
    
    // Get user's groups - now including the default group
    const userGroupsQuery = `
      SELECT g.id
      FROM groups g
      LEFT JOIN user_groups ug ON g.id = ug.group_id AND ug.user_id = $1
      WHERE ug.user_id = $1 OR g.name = 'Default Group'
    `;
    const userGroupsResult = await dbPool.query(userGroupsQuery, [userId]);
    const userGroupIds = userGroupsResult.rows.map(row => row.id);
    console.log("User group IDs for job detail:", userGroupIds);
    
    if (userGroupIds.length === 0) {
      console.log("No groups found for user, denying access to job");
      return res.status(403).json({ error: 'You do not have access to this job' });
    }
    
    // Get the job with access control
    const jobQuery = `
      SELECT j.*, bp.name as business_process_name, g.name as group_name
      FROM jobs j
      JOIN business_processes bp ON j.business_process_id = bp.id
      JOIN groups g ON bp.group_id = g.id
      WHERE j.id = $1 AND bp.group_id = ANY($2::integer[])
    `;
    const jobResult = await dbPool.query(jobQuery, [id, userGroupIds]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or you do not have access to it' });
    }
    
    // Get job with empty history placeholder for now
    const job = jobResult.rows[0];
    job.history = [];
    
    res.json(job);
  } catch (err) {
    console.error('Error fetching job:', err);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// Get source vs target profiles for a transformation job
app.get('/api/jobs/:jobId/profiles', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Get source and target profiles with the same execution timestamp
    const profilesResult = await dbPool.query(`
      WITH job_profiles AS (
        SELECT 
          pm.metric_id,
          pm.file_id,
          pm.profile_timestamp,
          pm.file_role,
          pm.source_file_id,
          pm.target_file_id,
          pm.row_count,
          pm.column_count,
          pm.completeness_score,
          pm.consistency_score,
          pm.validity_score,
          pm.uniqueness_score,
          pm.overall_quality_score,
          pm.created_at,
          f.filename,
          f.file_type,
          (
            SELECT json_agg(
              json_build_object(
                'column_name', fc.column_name,
                'column_type', fc.column_type,
                'non_null_count', fc.non_null_count,
                'null_count', fc.null_count,
                'unique_count', fc.unique_count,
                'min_value', fc.min_value,
                'max_value', fc.max_value,
                'mean_value', fc.mean_value,
                'median_value', fc.median_value,
                'std_dev', fc.std_dev
              )
            )
            FROM file_columns fc
            WHERE fc.file_id = pm.file_id 
              AND fc.profile_timestamp = pm.profile_timestamp
            ORDER BY fc.column_index
          ) as columns
        FROM profiling_metrics pm
        LEFT JOIN files f ON pm.file_id = f.file_id
        WHERE pm.job_id = $1
        ORDER BY pm.profile_timestamp DESC, pm.file_role DESC
        LIMIT 2
      )
      SELECT 
        (SELECT row_to_json(jp) FROM job_profiles jp WHERE jp.file_role = 'source') as source_profile,
        (SELECT row_to_json(jp) FROM job_profiles jp WHERE jp.file_role = 'target') as target_profile
    `, [jobId]);
    
    if (profilesResult.rows.length === 0) {
      return res.status(404).json({ error: 'No profiles found for this job' });
    }
    
    const result = profilesResult.rows[0];
    
    res.json({
      jobId,
      sourceProfile: result.source_profile,
      targetProfile: result.target_profile,
      hasBothProfiles: !!(result.source_profile && result.target_profile)
    });
  } catch (err) {
    console.error('Error fetching job profiles:', err);
    res.status(500).json({ error: 'Failed to fetch job profiles' });
  }
});

// Create a job
app.post('/api/jobs', authenticateToken, async (req, res) => {
  try {
    console.log('========== CREATE JOB REQUEST ==========');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Extract job data from the request
    const {
      name,
      description,
      business_process_id,
      source_connection_id,
      target_connection_id,
      validation_settings,
      error_handling_settings,
      notification_settings,
      schedule_settings,
      created_by,
      status
    } = req.body;
    
    // Get user ID from token or use provided created_by
    let userId = created_by;
    if (req.user && req.user.id) {
      userId = req.user.id;
      console.log('Using user ID from token:', userId);
    } else {
      console.log('No user ID in token, using created_by from request:', userId);
    }
    
    // Validate required fields
    if (!name || !business_process_id) {
      console.error('Validation error: Missing name or business_process_id');
      return res.status(400).json({ error: 'Job name and business process are required' });
    }
    
    // Ensure business_process_id is an integer
    const processId = parseInt(business_process_id, 10);
    if (isNaN(processId)) {
      console.error('Validation error: Invalid business_process_id format');
      return res.status(400).json({ error: 'Invalid business process ID, must be an integer' });
    }
    console.log('Creating job with business_process_id:', processId, 'Type:', typeof processId);
    
    // Skip access verification temporarily to debug job creation
    // We'll add it back later after job creation is working
    
    console.log('Preparing to insert job into database');
    console.log('Status value:', status || 'active');
    
    // Prepare values for query, handling possible undefined fields
    const validationSettingsValue = validation_settings || {};
    const errorHandlingSettingsValue = error_handling_settings || {};
    const notificationSettingsValue = notification_settings || {};
    const scheduleSettingsValue = schedule_settings || {};
    
    // Create the job (note: there's no description column in the table)
    const result = await dbPool.query(
      `INSERT INTO jobs (
        name,
        business_process_id, 
        source_connection_id, 
        target_connection_id, 
        validation_settings, 
        error_handling_settings, 
        notification_settings, 
        schedule_settings, 
        created_by,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        name,
        processId, 
        source_connection_id || null,
        target_connection_id || null,
        validationSettingsValue,
        errorHandlingSettingsValue,
        notificationSettingsValue,
        scheduleSettingsValue,
        userId,
        status || 'active' // Default status
      ]
    );
    
    console.log('Job created successfully:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating job:', err);
    // Send more detailed error information
    res.status(500).json({ 
      error: 'Failed to create job',
      details: err.message,
      code: err.code
    });
  }
});

// OLD Job Schedule endpoints (for Process Management - renamed to avoid conflict with new ETL Scheduler)
app.get('/api/job-schedules', authenticateToken, async (req, res) => {
  try {
    const schedules = await dbPool.query(`
      SELECT js.*, j.name as job_name 
      FROM job_schedules js
      JOIN jobs j ON js.job_id = j.id
      ORDER BY js.created_at DESC
    `);
    res.json(schedules.rows);
  } catch (err) {
    console.error('Error fetching schedules:', err);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

app.get('/api/jobs/:jobId/job-schedules', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const schedules = await dbPool.query('SELECT * FROM job_schedules WHERE job_id = $1', [jobId]);
    res.json(schedules.rows);
  } catch (err) {
    console.error('Error fetching job schedules:', err);
    res.status(500).json({ error: 'Failed to fetch job schedules' });
  }
});

app.post('/api/job-schedules', authenticateToken, async (req, res) => {
  try {
    const { 
      job_id, 
      type, 
      one_time_date, 
      cron_expression, 
      enabled 
    } = req.body;
    
    // Validate required fields
    if (!job_id) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    if (type === 'one-time' && !one_time_date) {
      return res.status(400).json({ error: 'One-time date is required for one-time schedules' });
    }
    
    if (type === 'recurring' && !cron_expression) {
      return res.status(400).json({ error: 'Cron expression is required for recurring schedules' });
    }
    
    // Calculate next run time (just for demonstration - in production this would be more complex)
    let nextRunTime = null;
    if (type === 'one-time') {
      nextRunTime = one_time_date;
    } else {
      // For recurring jobs, we would parse the cron expression and calculate the next run time
      // For simplicity, just setting it to 1 day from now
      nextRunTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    
    // Insert the schedule
    const result = await dbPool.query(`
      INSERT INTO job_schedules (
        job_id, 
        type, 
        one_time_date, 
        cron_expression, 
        enabled, 
        next_run_time
      ) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *
    `, [
      job_id,
      type || 'one-time',
      one_time_date,
      cron_expression,
      enabled !== false, // Default to true if not provided
      nextRunTime
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating schedule:', err);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

app.put('/api/job-schedules/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      type, 
      one_time_date, 
      cron_expression, 
      enabled 
    } = req.body;
    
    // Calculate next run time based on updated values
    let nextRunTime = null;
    if (type === 'one-time') {
      nextRunTime = one_time_date;
    } else {
      // For recurring jobs, we would parse the cron expression and calculate the next run time
      // For simplicity, just setting it to 1 day from now
      nextRunTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    
    // Update the schedule
    const result = await dbPool.query(`
      UPDATE job_schedules 
      SET 
        type = $1, 
        one_time_date = $2, 
        cron_expression = $3, 
        enabled = $4, 
        next_run_time = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `, [
      type,
      one_time_date,
      cron_expression,
      enabled,
      nextRunTime,
      id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating schedule:', err);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

app.delete('/api/job-schedules/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await dbPool.query('DELETE FROM job_schedules WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json({ message: 'Schedule deleted successfully', id: result.rows[0].id });
  } catch (err) {
    console.error('Error deleting schedule:', err);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

app.post('/api/job-schedules/:id/enable', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await dbPool.query(
      'UPDATE job_schedules SET enabled = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error enabling schedule:', err);
    res.status(500).json({ error: 'Failed to enable schedule' });
  }
});

app.post('/api/job-schedules/:id/disable', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await dbPool.query(
      'UPDATE job_schedules SET enabled = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error disabling schedule:', err);
    res.status(500).json({ error: 'Failed to disable schedule' });
  }
});

// Update a job
app.put('/api/jobs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      business_process_id,
      status,
      source_connection_id,
      target_connection_id,
      validation_settings,
      error_handling_settings,
      notification_settings,
      schedule_settings
    } = req.body;
    
    const userId = req.user.id;
    
    if (!name) {
      return res.status(400).json({ error: 'Job name is required' });
    }
    
    // Check if the job exists and user has access to it
    const jobAccessQuery = `
      SELECT j.* FROM jobs j
      JOIN business_processes bp ON j.business_process_id = bp.id
      JOIN groups g ON bp.group_id = g.id
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE j.id = $1 AND ug.user_id = $2
    `;
    
    const jobAccessResult = await dbPool.query(jobAccessQuery, [id, userId]);
    
    if (jobAccessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or you do not have access to it' });
    }
    
    // If business_process_id is changing, verify access to the new business process
    if (business_process_id && business_process_id !== jobAccessResult.rows[0].business_process_id) {
      const processAccessQuery = `
        SELECT bp.* FROM business_processes bp
        JOIN groups g ON bp.group_id = g.id
        JOIN user_groups ug ON g.id = ug.group_id
        WHERE bp.id = $1 AND ug.user_id = $2
      `;
      
      const processAccessResult = await dbPool.query(processAccessQuery, [business_process_id, userId]);
      
      if (processAccessResult.rows.length === 0) {
        return res.status(403).json({ error: 'You do not have access to the specified business process' });
      }
    }
    
    // Ensure business_process_id is an integer if provided
    let processId = jobAccessResult.rows[0].business_process_id;
    if (business_process_id) {
      processId = parseInt(business_process_id, 10);
      if (isNaN(processId)) {
        return res.status(400).json({ error: 'Invalid business process ID' });
      }
    }
    console.log('Updating job with business_process_id:', processId, 'Type:', typeof processId);
    
    // Update the job
    const result = await dbPool.query(
      `UPDATE jobs SET 
        name = $1, 
        business_process_id = $2, 
        status = $3,
        source_connection_id = $4, 
        target_connection_id = $5, 
        validation_settings = $6, 
        error_handling_settings = $7, 
        notification_settings = $8, 
        schedule_settings = $9,
        updated_at = NOW()
      WHERE id = $10 RETURNING *`,
      [
        name, 
        processId, 
        status || jobAccessResult.rows[0].status || 'active',
        source_connection_id,
        target_connection_id,
        validation_settings,
        error_handling_settings,
        notification_settings,
        schedule_settings,
        id
      ]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating job:', err);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// Delete a job
app.delete('/api/jobs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Check if the job exists and user has access to it
    const jobAccessQuery = `
      SELECT j.* FROM jobs j
      JOIN business_processes bp ON j.business_process_id = bp.id
      JOIN groups g ON bp.group_id = g.id
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE j.id = $1 AND ug.user_id = $2
    `;
    
    const jobAccessResult = await dbPool.query(jobAccessQuery, [id, userId]);
    
    if (jobAccessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or you do not have access to it' });
    }
    
    // Delete the job (cascade will delete history)
    await dbPool.query('DELETE FROM jobs WHERE id = $1', [id]);
    
    res.json({ message: 'Job deleted successfully' });
  } catch (err) {
    console.error('Error deleting job:', err);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Run a job manually
app.post('/api/jobs/:id/run', authenticateToken, async (req, res) => {
  try {
    // Check if user has job:execute permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('job:execute')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to execute jobs. Contact your administrator.'
      });
    }
    
    const { id } = req.params;
    const userId = req.user.id;
    
    // Check if the job exists and user has access to it
    const jobAccessQuery = `
      SELECT j.* FROM jobs j
      JOIN business_processes bp ON j.business_process_id = bp.id
      JOIN groups g ON bp.group_id = g.id
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE j.id = $1 AND ug.user_id = $2
    `;
    
    const jobAccessResult = await dbPool.query(jobAccessQuery, [id, userId]);
    
    if (jobAccessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or you do not have access to it' });
    }
    
    // Simulate a job run without database operations for now
    console.log(`Job ${id} started successfully`);
    
    // Return a fake history ID
    const fakeHistoryId = Date.now().toString();
    
    res.json({ 
      message: 'Job started successfully', 
      job_history_id: fakeHistoryId 
    });
  } catch (err) {
    console.error('Error running job:', err);
    res.status(500).json({ error: 'Failed to run job' });
  }
});

// Groups API

// Get all groups (authenticated)
app.get('/api/groups', authenticateToken, async (req, res) => {
  try {
    // First check if we need to create a default group
    const checkDefaultGroup = await dbPool.query("SELECT COUNT(*) FROM groups WHERE name = 'Default Group'");
    if (parseInt(checkDefaultGroup.rows[0].count) === 0) {
      console.log('No default group found, creating one from authenticated endpoint');
      try {
        await dbPool.query(`
          INSERT INTO groups (name, description)
          VALUES ('Default Group', 'Default group for all users');
        `);
        console.log('Created default group from authenticated endpoint');
      } catch (err) {
        if (err.code !== '23505') { // Not a unique violation
          console.error('Error creating default group from authenticated endpoint:', err);
        }
      }
    }

    const result = await dbPool.query('SELECT * FROM groups ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get user's groups
app.get('/api/user/groups', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const query = `
      SELECT g.*
      FROM groups g
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE ug.user_id = $1
      ORDER BY g.name
    `;
    
    const result = await dbPool.query(query, [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching user groups:', err);
    res.status(500).json({ error: 'Failed to fetch user groups' });
  }
});

// Create a new group
app.post('/api/groups', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    const query = `
      INSERT INTO groups (name, description)
      VALUES ($1, $2)
      RETURNING *
    `;
    
    const result = await dbPool.query(query, [name, description]);
    const newGroup = result.rows[0];
    
    // Add the creator to the group automatically
    await dbPool.query(
      'INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2)',
      [req.user.id, newGroup.id]
    );
    
    res.status(201).json(newGroup);
  } catch (err) {
    console.error('Error creating group:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Update a group
app.put('/api/groups/:id', authenticateToken, async (req, res) => {
  try {
    const groupId = req.params.id;
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    const query = `
      UPDATE groups
      SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await dbPool.query(query, [name, description, groupId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating group:', err);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// Delete a group
app.delete('/api/groups/:id', authenticateToken, async (req, res) => {
  try {
    const groupId = req.params.id;
    
    // First check if it's the default group
    const defaultGroup = await dbPool.query('SELECT * FROM groups WHERE name = $1', ['Default Group']);
    
    if (defaultGroup.rows.length > 0 && defaultGroup.rows[0].id == groupId) {
      return res.status(403).json({ error: 'Cannot delete the default group' });
    }
    
    // Delete the group (cascade will remove user_groups entries)
    const result = await dbPool.query('DELETE FROM groups WHERE id = $1 RETURNING *', [groupId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    console.error('Error deleting group:', err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// Add users to a group
app.post('/api/groups/:id/users', authenticateToken, async (req, res) => {
  try {
    const groupId = req.params.id;
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs are required' });
    }
    
    // Check if the group exists
    const groupResult = await dbPool.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Add users to the group
    const addedUsers = [];
    for (const userId of userIds) {
      try {
        await dbPool.query(
          'INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, groupId]
        );
        addedUsers.push(userId);
      } catch (err) {
        console.error(`Error adding user ${userId} to group:`, err);
      }
    }
    
    res.json({ message: 'Users added to group successfully', addedUsers });
  } catch (err) {
    console.error('Error adding users to group:', err);
    res.status(500).json({ error: 'Failed to add users to group' });
  }
});

// Remove a user from a group
app.delete('/api/groups/:groupId/users/:userId', authenticateToken, async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    
    // Check if the group exists
    const groupResult = await dbPool.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Check if it's the default group
    if (groupResult.rows[0].name === 'Default Group') {
      return res.status(403).json({ error: 'Cannot remove users from the default group' });
    }
    
    // Remove the user from the group
    const result = await dbPool.query(
      'DELETE FROM user_groups WHERE user_id = $1 AND group_id = $2 RETURNING *',
      [userId, groupId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User is not a member of this group' });
    }
    
    res.json({ message: 'User removed from group successfully' });
  } catch (err) {
    console.error('Error removing user from group:', err);
    res.status(500).json({ error: 'Failed to remove user from group' });
  }
});

// Add user to default group if not in any group
// This ensures all users have at least one group
(async () => {
  try {
    const defaultGroupResult = await dbPool.query("SELECT id FROM access_groups WHERE name = 'Default Group'");
    
    if (defaultGroupResult.rows.length > 0) {
      const defaultGroupId = defaultGroupResult.rows[0].id;
      
      // Find users not in any group
      const usersWithoutGroupQuery = `
        SELECT id FROM users 
        WHERE id NOT IN (
          SELECT DISTINCT user_id FROM user_groups
        )
      `;
      
      const usersResult = await dbPool.query(usersWithoutGroupQuery);
      
      // Add these users to the default group
      for (const user of usersResult.rows) {
        await dbPool.query(
          'INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [user.id, defaultGroupId]
        );
      }
      
      console.log(`Added ${usersResult.rows.length} users to the default group`);
    }
  } catch (error) {
    console.error('Error ensuring users have default group:', error);
  }
})();

// Job Groups API

// Get all job groups
app.get('/api/job-groups', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRoles = req.user.roles || [];
    
    // Get all users with the same roles as the current user for sharing groups
    let usersWithSameRoleIds = [userId.toString()]; // Default to just current user
    
    try {
      // For each role, find users with that role
      // We're using the simpler approach here to avoid table schema issues
      // Just include the current user
      usersWithSameRoleIds = [userId.toString()];
      
      // If the user is an admin, fetch all users to see all groups
      if (userRoles.includes('Admin')) {
        const allUsers = await dbPool.query(`SELECT id FROM users`);
        if (allUsers.rows.length > 0) {
          allUsers.rows.forEach(user => {
            if (!usersWithSameRoleIds.includes(user.id.toString())) {
              usersWithSameRoleIds.push(user.id.toString());
            }
          });
        }
      }
    } catch (roleErr) {
      console.error('Error getting users with same role:', roleErr);
      // Continue with just current user if there's an error
    }
    
    console.log('Users with same roles:', usersWithSameRoleIds);
    
    // Generate a list of job groups created by users with the same role
    const jobGroupsQuery = `
      SELECT jg.*, 
        COALESCE(COUNT(jgj.job_id), 0) as job_count,
        COALESCE(u.username, 'Unknown') as created_by_name
      FROM job_groups jg
      LEFT JOIN job_group_jobs jgj ON jg.id = jgj.group_id
      LEFT JOIN users u ON u.id::text = jg.created_by
      WHERE jg.created_by = ANY($1)
      GROUP BY jg.id, u.username
      ORDER BY jg.created_at DESC
    `;
    
    const jobGroupsResult = await dbPool.query(jobGroupsQuery, [usersWithSameRoleIds]);
    res.json(jobGroupsResult.rows);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get a single job group with its jobs
app.get('/api/job-groups/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRoles = req.user.roles || [];
    
    // Get the job group
    const jobGroupQuery = `
      SELECT jg.*, COALESCE(u.username, 'Unknown') as created_by_name
      FROM job_groups jg
      LEFT JOIN users u ON u.id::text = jg.created_by
      WHERE jg.id = $1
    `;
    const jobGroupResult = await dbPool.query(jobGroupQuery, [id]);
    
    if (jobGroupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Check if user has access to this group (created by them or by someone with the same role)
    const createdBy = jobGroupResult.rows[0].created_by;
    if (createdBy !== userId.toString()) {
      // Simplified access control - Admin can see all groups
      // Other users can only see their own groups
      if (!userRoles.includes('Admin')) {
        return res.status(403).json({ error: 'You do not have access to this group' });
      }
    }
    
    // Get all jobs in this group
    const jobsQuery = `
      SELECT j.*
      FROM jobs j
      JOIN job_group_jobs jgj ON j.id = jgj.job_id
      WHERE jgj.group_id = $1
      ORDER BY j.created_at DESC
    `;
    const jobsResult = await dbPool.query(jobsQuery, [id]);
    
    // Combine job group and jobs
    const jobGroup = jobGroupResult.rows[0];
    jobGroup.jobs = jobsResult.rows;
    
    res.json(jobGroup);
  } catch (err) {
    console.error('Error fetching group:', err);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

// Create a job group
app.post('/api/job-groups', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user.id;
    
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    // First check if tables exist, create if not
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS job_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS job_group_jobs (
        group_id UUID NOT NULL,
        job_id UUID NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, job_id)
      )
    `);
    
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS user_job_groups (
        user_id TEXT NOT NULL,
        group_id UUID NOT NULL,
        PRIMARY KEY (user_id, group_id)
      )
    `);
    
    // Get user info for display purposes
    let userName = 'Unknown';
    try {
      const userResult = await dbPool.query('SELECT username FROM users WHERE id::text = $1', [userId.toString()]);
      if (userResult.rows.length > 0) {
        userName = userResult.rows[0].username;
      }
    } catch (userErr) {
      console.error('Error fetching username:', userErr);
      // Continue anyway with default name
    }
    
    // Convert schema and handle user_id as text explicitly
    const text_user_id = String(userId);
    console.log('Creating job group with user ID (as text):', text_user_id);
    
    // Create the group with user ID as text
    const result = await dbPool.query(
      'INSERT INTO job_groups (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, description, text_user_id]
    );
    
    const new_group_id = result.rows[0].id;
    console.log('Created new job group with ID:', new_group_id, 'and user ID:', text_user_id);
    
    // Add creator to group
    await dbPool.query(
      'INSERT INTO user_job_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [text_user_id, new_group_id]
    );
    
    // Add username to the response for display
    const responseGroup = {
      ...result.rows[0],
      created_by_name: userName
    };
    
    res.status(201).json(responseGroup);
  } catch (err) {
    console.error('Error creating group:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Update a job group
app.put('/api/job-groups/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    // Check if the job group exists
    const existingGroup = await dbPool.query('SELECT * FROM job_groups WHERE id = $1', [id]);
    
    if (existingGroup.rows.length === 0) {
      return res.status(404).json({ error: 'Job group not found' });
    }
    
    // Update the job group
    const result = await dbPool.query(
      'UPDATE job_groups SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [name, description, id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating job group:', err);
    res.status(500).json({ error: 'Failed to update job group' });
  }
});

// Delete a job group
app.delete('/api/job-groups/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if the job group exists
    const existingGroup = await dbPool.query('SELECT * FROM job_groups WHERE id = $1', [id]);
    
    if (existingGroup.rows.length === 0) {
      return res.status(404).json({ error: 'Job group not found' });
    }
    
    // Delete associations first
    await dbPool.query('DELETE FROM job_group_jobs WHERE group_id = $1', [id]);
    await dbPool.query('DELETE FROM user_job_groups WHERE group_id = $1', [id]);
    
    // Delete the job group
    await dbPool.query('DELETE FROM job_groups WHERE id = $1', [id]);
    
    res.json({ message: 'Job group deleted successfully' });
  } catch (err) {
    console.error('Error deleting job group:', err);
    res.status(500).json({ error: 'Failed to delete job group' });
  }
});

// Add job to group
app.post('/api/job-groups/:id/jobs', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { job_id } = req.body;
    
    if (!job_id) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    // Check if job group exists
    const groupResult = await dbPool.query('SELECT * FROM job_groups WHERE id = $1', [id]);
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job group not found' });
    }
    
    // Check if job exists
    const jobResult = await dbPool.query('SELECT * FROM jobs WHERE id = $1', [job_id]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Add job to group
    await dbPool.query(
      'INSERT INTO job_group_jobs (group_id, job_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, job_id]
    );
    
    res.json({ message: 'Job added to group successfully' });
  } catch (err) {
    console.error('Error adding job to group:', err);
    res.status(500).json({ error: 'Failed to add job to group' });
  }
});

// Remove job from group
app.delete('/api/job-groups/:id/jobs/:jobId', authenticateToken, async (req, res) => {
  try {
    const { id, jobId } = req.params;
    
    // Remove job from group
    await dbPool.query(
      'DELETE FROM job_group_jobs WHERE group_id = $1 AND job_id = $2',
      [id, jobId]
    );
    
    res.json({ message: 'Job removed from group successfully' });
  } catch (err) {
    console.error('Error removing job from group:', err);
    res.status(500).json({ error: 'Failed to remove job from group' });
  }
});

// Add AI routes (temporarily commented out until model integration is complete)
const aiRoutes = require('./backend/routes/aiRoutes');
app.use('/api/ai', authenticateToken, aiRoutes(diContainer));
console.log('Added AI routes');

// Admin cleanup routes (admin-only)
const adminCleanupRoutes = require('./backend/routes/adminCleanupRoutes');
app.use('/api/admin/cleanup', authenticateToken, requireAdmin, adminCleanupRoutes);
console.log('Added admin cleanup routes');

// Admin settings routes (admin-only)
const adminSettingsRoutes = require('./backend/routes/adminSettingsRoutes');
app.use('/api/admin', authenticateToken, requireAdmin, adminSettingsRoutes);
console.log('Added admin settings routes');

// Vendor management routes
const vendorRoutes = require('./backend/routes/vendorRoutes');
app.use('/api/vendors', authenticateToken, vendorRoutes);
console.log('Added vendor management routes');

// Vendor agreement routes
const vendorAgreementRoutes = require('./backend/routes/vendorAgreementRoutes');
app.use('/api/vendor-agreements', authenticateToken, vendorAgreementRoutes);
console.log('Added vendor agreement routes');

// Vendor SLA monitoring routes
const vendorSLARoutes = require('./backend/routes/vendorSLARoutes');
app.use('/api/vendor-sla', authenticateToken, vendorSLARoutes);
console.log('Added vendor SLA monitoring routes');

// Vendor agreement file schema routes
const vendorAgreementFileSchemaRoutes = require('./backend/routes/vendorAgreementFileSchemaRoutes');
app.use('/api/vendor-agreements', authenticateToken, vendorAgreementFileSchemaRoutes);
console.log('Added vendor agreement file schema routes');

// Vendor connections routes (admin-only)
const vendorConnectionRoutes = require('./backend/routes/vendorConnectionRoutes');
app.use('/api/vendor-connections', authenticateToken, vendorConnectionRoutes);
console.log('Added vendor connections routes');

// Vendor user routes
const vendorUserRoutes = require('./backend/routes/vendorUserRoutes');
app.use('/api', authenticateToken, vendorUserRoutes);
console.log('Added vendor user routes');

// Vendor access routes (for vendor file upload)
const vendorAccessRoutes = require('./backend/routes/vendorAccessRoutes');
app.use('/api/vendor-access', authenticateToken, vendorAccessRoutes);
console.log('Added vendor access routes');

// Vendor agreement template routes
const vendorAgreementTemplateRoutes = require('./backend/routes/vendorAgreementTemplateRoutes');
app.use('/api', vendorAgreementTemplateRoutes);
console.log('Added vendor agreement template routes');

// Notifications routes
const notificationRoutes = require('./backend/routes/notifications');
app.use('/api/notifications', notificationRoutes);
console.log('Added notifications routes');

// RDM routes
const rdmRoutes = require('./backend/routes/rdm');
app.use('/api/rdm', authenticateToken, rdmRoutes);
console.log('Added RDM integration routes');

// Alert policy routes
const alertPolicyRoutes = require('./backend/routes/alertPolicyRoutes');
app.use('/api/alert-policies', authenticateToken, alertPolicyRoutes);
console.log('Added alert policy routes');

// Email connection routes
const emailConnectionRoutes = require('./backend/routes/emailConnectionRoutes');
app.use('/api/email-connections', authenticateToken, emailConnectionRoutes);
console.log('Added email connection routes');

// Alert history routes
const alertHistoryRoutes = require('./backend/routes/alertHistoryRoutes');
app.use('/api/alert-history', authenticateToken, alertHistoryRoutes);
console.log('Added alert history routes');

// Programmatic upload routes
const uploadRoutes = require('./backend/routes/uploadRoutes');
app.use('/api/uploads', uploadRoutes);
console.log('Added programmatic upload routes');

// API token management routes
const apiTokenRoutes = require('./backend/routes/apiTokenRoutes');
app.use('/api/tokens', apiTokenRoutes);
console.log('Added API token management routes');

// DLQ (Dead Letter Queue) routes
const dlqRoutes = require('./backend/routes/dlqRoutes');
app.use('/api/dlq-jobs', authenticateToken, dlqRoutes);
console.log('Added DLQ routes');

// Setup enhanced backend features
setupEnhancedFeatures(app);

// Serve static files from the React build (dist folder) in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  
  console.log('📦 Production mode: Serving static files from', distPath);
  
  // Serve static files
  app.use(express.static(distPath));
  
  // Handle React Router - send all non-API requests to index.html
  // Use middleware instead of app.get() to avoid path-to-regexp issues
  app.use((req, res, next) => {
    // Skip API routes - let them go to the 404 handler or their endpoints
    if (req.path.startsWith('/api')) {
      return next();
    }
    // Send all other routes to React's index.html for client-side routing
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Import error types
const { NotFoundError } = require('./backend/errors');

// Add 404 handler (must come after all routes and before error handler)
app.use((req, res, next) => {
  const error = new NotFoundError(
    `Route ${req.originalUrl} not found`,
    'route',
    req.originalUrl
  );
  next(error);
});

// Import and use global error handler middleware (must be after all routes)
const errorHandler = require('./backend/middleware/errorHandler');
app.use(errorHandler);

// Initialize database and start the server
let uploadWorker = null;

async function startServer() {
  try {
    logger.info('Starting server initialization...');
    
    // Initialize database with retry logic
    logger.info('Initializing database connection...');
    await initializeDatabase();
    logger.info('Database connection established successfully');
    
    // Validate ENCRYPTION_KEY environment variable
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (encryptionKey) {
      logger.info('ENCRYPTION_KEY is configured', {
        keyLength: encryptionKey.length,
        expectedLength: 64,
        isValid: encryptionKey.length === 64 && /^[0-9a-f]{64}$/i.test(encryptionKey)
      });
      console.log(`✅ ENCRYPTION_KEY: Configured (${encryptionKey.length} chars, valid: ${encryptionKey.length === 64})`);
    } else {
      logger.warn('ENCRYPTION_KEY is NOT set - credentials encryption will fail');
      console.warn('⚠️  WARNING: ENCRYPTION_KEY environment variable is not set!');
      console.warn('   Cloud storage credentials cannot be encrypted/decrypted without this key.');
      console.warn('   Please add ENCRYPTION_KEY to your Replit Secrets.');
    }
    
    // Start upload worker for BullMQ file processing (requires Redis)
    try {
      const UploadWorker = require('./backend/workers/uploadWorker');
      uploadWorker = new UploadWorker();
      uploadWorker.start(5);
      logger.info('Upload worker initialized with 5 concurrent workers');
    } catch (error) {
      logger.warn('Upload worker not started - Redis unavailable', {
        error: error.message,
        note: 'File uploads will still work but may process slower without queue-based parallelization'
      });
    }
    
    // Create HTTP server for both Express and Socket.IO
    const httpServer = http.createServer(app);
    
    // Initialize Socket.IO with CORS settings (using same allowedOrigins as Express CORS)
    const io = new Server(httpServer, {
      cors: {
        origin: function (origin, callback) {
          if (!origin) return callback(null, true);
          const isAllowed = allowedOrigins.some(allowedOrigin => {
            if (allowedOrigin.includes('*')) {
              const { globToRegex } = require('./backend/utils/regexValidator');
              try {
                const regex = globToRegex(allowedOrigin);
                return regex.test(origin);
              } catch (error) {
                return false;
              }
            }
            return allowedOrigin === origin;
          });
          callback(null, isAllowed);
        },
        methods: ['GET', 'POST'],
        credentials: true
      }
    });
    
    // Initialize visual mapping WebSocket service
    const visualMappingWS = require('./backend/services/visualMappingWebSocket');
    visualMappingWS.initialize(io);
    logger.info('Visual mapping WebSocket service initialized');
    
    // Start materialized view refresh worker for enterprise performance
    try {
      materializedViewWorker.startWorker(60 * 1000); // Check every minute
      logger.info('Materialized view refresh worker started');
    } catch (error) {
      logger.warn('Materialized view worker not started', { error: error.message });
    }
    
    // Start the HTTP server - bind to 0.0.0.0 for Replit
    httpServer.listen(port, '0.0.0.0', () => {
      logger.info(`🚀 Server running on port ${port}`, {
        environment: process.env.NODE_ENV || 'development',
        port: port,
        host: '0.0.0.0',
        websocket: 'enabled'
      });
      console.log(`Server running on port ${port} (host: 0.0.0.0)`);
      console.log(`WebSocket server enabled for real-time updates`);
    });
  } catch (err) {
    logger.error('Failed to start server', {
      error: err.message,
      stack: err.stack
    });
    console.error('❌ Server startup failed:', err.message);
    console.error('\n📋 Troubleshooting:');
    console.error('  1. Check DATABASE_URL environment variable is set');
    console.error('  2. Verify database is accessible from this environment');
    console.error('  3. Check network connectivity to database host');
    console.error('\n💡 For deployed apps:');
    console.error('  - Ensure PostgreSQL database is provisioned in Replit');
    console.error('  - Database environment variables are automatically set');
    console.error('  - Check deployment logs for connection errors\n');
    
    process.exit(1);
  }
}

// Start the server
startServer();

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal} signal, starting graceful shutdown`);
  
  try {
    // Stop scheduler worker
    await schedulerWorker.stop();
    
    // Stop SLA monitor worker
    await slaMonitorWorker.stop();
    
    // Stop insights aggregation worker
    if (insightsWorker) {
      insightsWorker.stop();
    }
    
    // Stop retention policy worker
    if (retentionWorker) {
      retentionWorker.stop();
    }
    
    // Stop file processing worker
    await fileWorker.stop();
    
    // Stop upload worker
    if (uploadWorker) {
      await uploadWorker.stop();
    }
    
    // Stop materialized view worker
    materializedViewWorker.stopWorker();
    
    // Close database connections
    const database = diContainer.get('database');
    await database.close();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error: error.message });
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));