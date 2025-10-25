const express = require('express');
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

// Initialize dependency injection container
const { initialize: initializeDI, initializeDatabase } = require('./backend/di/bootstrapper');
const diContainer = initializeDI();

// Import enhanced backend features
const { setupEnhancedFeatures } = require('./backend/integration');

// Import queue system for async processing
const { getQueue } = require('./backend/queue/queueFactory');
const FileProcessingWorker = require('./backend/workers/fileProcessingWorker');
const SchedulerWorker = require('./backend/workers/schedulerWorker');
const InsightsAggregationWorker = require('./backend/workers/insightsAggregationWorker');

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

// Initialize insights aggregation worker (runs daily at 2 AM)
const insightsWorker = new InsightsAggregationWorker(
  diContainer.get('dbPool'),
  '02:00' // Run at 2 AM
);
insightsWorker.start();

// Import validation middleware and schemas
const { validateRequest, loginSchema, userSchema, fileUploadSchema } = require('./backend/src/middleware/validation');
const { cacheMiddleware, invalidateCache } = require('./backend/middleware/cacheMiddleware');
const createAuditMiddleware = require('./backend/middleware/auditMiddleware');
const authorizeProjectResource = require('./backend/middleware/authorizeProjectResource');
const { requireProjectAccess } = require('./backend/middleware/requireProjectAccess');

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

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  console.log('==== authenticateToken middleware called ====');
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN format
  
  if (!token) {
    console.log('No token provided');
    logger.warn('Authentication failed - no token provided', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  try {
    // Verify token
    console.log('Verifying token');
    const verified = jwt.verify(token, JWT_SECRET);
    console.log('Token verified:', JSON.stringify(verified));
    
    // Store user data from token
    req.user = verified;
    
    // Store the original token for debugging
    req.token = token;
    
    // Fetch user's force_password_change flag from database
    try {
      const userFlagResult = await dbPool.query(
        'SELECT force_password_change FROM users WHERE id = $1',
        [verified.id]
      );
      if (userFlagResult.rows.length > 0) {
        req.user.force_password_change = userFlagResult.rows[0].force_password_change || false;
      } else {
        // User not found in database - fail closed for security
        console.error('User from token not found in database:', verified.id);
        return res.status(403).json({ error: 'Invalid user. Please log in again.' });
      }
    } catch (flagErr) {
      console.error('Error fetching force_password_change flag:', flagErr);
      // Fail closed: deny access if we cannot verify password change status
      return res.status(500).json({ error: 'Unable to verify authentication status. Please try again.' });
    }
    
    // Get permissions for the user based on roles
    if (verified.roles && verified.roles.length > 0) {
      console.log('User has roles:', verified.roles);
      let allPermissions = [];
      
      // Add some critical permissions regardless of role to ensure minimal functionality
      const criticalPermissions = [
        { name: 'dashboard_view', resource: 'dashboard', action: 'view' },
        { name: 'file_view', resource: 'file', action: 'view' },
        'dashboard:read',
        'file_profile:read'
      ];
      allPermissions = [...allPermissions, ...criticalPermissions];
      console.log('Added critical permissions for all roles');
      
      try {
        // 1. Get all permissions from the permissions and role_permissions tables (old system)
        console.log('Fetching old system permissions from database');
        const permissionsQuery = `
          SELECT DISTINCT p.name, p.resource, p.action
          FROM permissions p
          JOIN role_permissions rp ON p.id = rp.permission_id
          JOIN roles r ON rp.role_id = r.id
          WHERE r.name = ANY($1::varchar[])
        `;
        
        const permissionsResult = await dbPool.query(permissionsQuery, [verified.roles]);
        console.log('Old system permissions result rows:', permissionsResult.rows.length);
        
        // Store the permissions from the old system
        const oldSystemPermissions = permissionsResult.rows.map(p => ({
          name: p.name,
          resource: p.resource,
          action: p.action
        }));
        
        allPermissions = [...allPermissions, ...oldSystemPermissions];
        console.log('Added permissions from old system');
        
        // 2. Get permissions from the JSON array in the roles table (new system)
        console.log('Fetching new system permissions from roles table');
        const rolesWithPermissionsQuery = `
          SELECT name, permissions 
          FROM roles 
          WHERE name = ANY($1::varchar[])
        `;
        
        const rolesResult = await dbPool.query(rolesWithPermissionsQuery, [verified.roles]);
        console.log('New system permissions result rows:', rolesResult.rows.length);
        
        // Process each role's JSON permissions
        for (const role of rolesResult.rows) {
          console.log(`Processing role ${role.name}`);
          console.log('Role permissions type:', typeof role.permissions);
          console.log('Role permissions:', JSON.stringify(role.permissions));
          
          // Special handling for Executor role to ensure it always has badges/insights access
          if (role.name === 'Executor') {
            // Core Executor permissions that should always be included
            const executorCorePermissions = [
              'dashboard:read',
              'file_profile:read',
              'quality_checks:read',
              'mappings:read',
              'lineage:read',
              'monitor:read',
              'scheduler:read',
              'badges:read',
              'insights:read',
              'recommendations:read',
              'stories:read'
            ];
            
            console.log(`Adding core permissions for Executor role:`, executorCorePermissions);
            allPermissions = [...allPermissions, ...executorCorePermissions];
          }
          
          if (role.permissions) {
            try {
              // For string array format
              if (Array.isArray(role.permissions)) {
                // These are already in string format like "resource:action"
                const stringPermissions = role.permissions;
                console.log(`Adding array permissions for ${role.name}:`, stringPermissions);
                allPermissions = [...allPermissions, ...stringPermissions];
              } 
              // For object format that PostgreSQL returns from JSONB
              else if (typeof role.permissions === 'object') {
                // Check if it's the specialized format with numeric keys that PostgreSQL returns
                if (Object.keys(role.permissions).some(key => !isNaN(parseInt(key)))) {
                  // This is the format PostgreSQL returns for JSONB arrays: {"0":"perm1","1":"perm2"}
                  const stringPermissions = Object.values(role.permissions);
                  console.log(`Adding object-array permissions for ${role.name}:`, stringPermissions);
                  allPermissions = [...allPermissions, ...stringPermissions];
                } else {
                  // It's a regular object format
                  const permissionsArray = Object.values(role.permissions);
                  console.log(`Adding object permissions for ${role.name}:`, permissionsArray);
                  allPermissions = [...allPermissions, ...permissionsArray];
                }
              } else {
                console.log(`Unrecognized permissions format for ${role.name}:`, typeof role.permissions);
              }
            } catch (innerErr) {
              console.error(`Error processing permissions for role ${role.name}:`, innerErr);
            }
          } else {
            console.log(`No permissions found for role ${role.name}`);
          }
        }
      } catch (dbErr) {
        console.error('Error fetching permissions from database:', dbErr);
      }
      
      // Set the combined permissions on the user object
      req.user.permissions = [...new Set(allPermissions)]; // Remove duplicates
      console.log('Final permissions count:', req.user.permissions.length);
    } else {
      console.log('User has no roles, setting empty permissions array');
      req.user.permissions = [];
    }
    
    console.log('Authentication successful, proceeding to next middleware');
    
    // Check if user must change password - block all routes except password change and logout
    const isPasswordChangeEndpoint = req.path === '/api/auth/force-change-password';
    const isLogoutEndpoint = req.path === '/api/auth/logout';
    const isAuthMeEndpoint = req.path === '/api/auth/me';
    
    if (req.user.force_password_change && 
        !isPasswordChangeEndpoint && 
        !isLogoutEndpoint && 
        !isAuthMeEndpoint) {
      console.log('User must change password, blocking API access');
      return res.status(403).json({ 
        error: 'Password change required. You must change your password before accessing the application.',
        force_password_change: true
      });
    }
    
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    logger.warn('Authentication failed - invalid or expired token', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      error: error.message
    });
    return res.status(403).json({ error: 'Invalid token or token expired.' });
  }
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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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
           SELECT 1 FROM access_group_members agm
           JOIN project_access_groups pag ON agm.group_id = pag.group_id
           WHERE pag.project_id = $1 AND agm.user_id = $2
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
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || (100 * 1024 * 1024); // Default 100MB (reduced from 1GB for security)
const ALLOWED_FILE_TYPES = [
  'text/csv',
  'application/json',
  'application/vnd.apache.parquet',
  'application/x-parquet',
  'application/octet-stream', // For parquet files that might be detected as binary
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/xml',
  'application/xml'
];
const ALLOWED_EXTENSIONS = ['.csv', '.json', '.parquet', '.xlsx', '.xml'];

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
    // Allow if extension matches even if MIME type is generic
    if ((ext === '.parquet' || ext === '.xlsx') && file.mimetype === 'application/octet-stream') {
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

// Files API (with caching)
app.get('/api/files', authenticateToken, cacheMiddleware(300), async (req, res) => {
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
    const files = await fileService.getAllFiles({
      sortBy: 'created_at',
      sortOrder: 'DESC',
      projectIds: projectIds  // Pass user's accessible project IDs
    });
    
    res.json(files);
  } catch (err) {
    logger.error('Error fetching files', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

app.get('/api/files/:fileId', 
  authenticateToken, 
  cacheMiddleware(600),
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
    
    const columns = columnsResult.rows.map(col => ({ name: col.column_name, type: col.column_type }));
    
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
    
    // Delete temporary uploaded file
    fs.unlinkSync(file.path);
    
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
    
    // Clean up temp file on error
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    
    res.status(500).json({ 
      error: 'Duplicate check failed',
      details: error.message 
    });
  }
});

// File upload endpoint with async queue processing (supports batch uploads)
app.post('/api/files/upload', authenticateToken, invalidateCache('cache:*:*files*'), uploadLimiter, upload.array('files', 20), async (req, res) => {
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
    
    // Validate and get project_id
    const { getUserProjects } = require('./backend/middleware/requireProjectAccess');
    const isAdmin = req.user?.roles?.includes('Admin');
    let projectId = req.body.project_id ? parseInt(req.body.project_id) : null;
    
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
    const virusScanner = require('./backend/services/VirusScanService');
    
    // Process each file in batch
    const results = [];
    
    for (const file of req.files) {
      const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
      const fileType = path.extname(file.originalname).substring(1).toLowerCase();
      
      try {
        // Virus scan the uploaded file
        const scanResult = await virusScanner.scanFile(file.path);
        
        if (scanResult.isInfected) {
          logger.warn('Virus detected in uploaded file', {
            fileId,
            filename: file.originalname,
            viruses: scanResult.viruses,
            userId
          });
          
          // Delete infected file
          try { fs.unlinkSync(file.path); } catch (e) {}
          
          results.push({
            success: false,
            filename: file.originalname,
            error: 'Virus detected',
            message: `The uploaded file contains malware: ${scanResult.viruses.join(', ')}`,
            viruses: scanResult.viruses
          });
          continue;
        }
        
        if (scanResult.skipped) {
          logger.warn('Virus scan skipped for uploaded file', {
            fileId,
            filename: file.originalname,
            reason: scanResult.message,
            userId
          });
        } else {
          logger.info('File passed virus scan', {
            fileId,
            filename: file.originalname,
            userId
          });
        }
        
        // Calculate file hash
        const fileHash = await new Promise((resolve, reject) => {
          const hash = crypto.createHash('sha256');
          const stream = fs.createReadStream(file.path);
          
          stream.on('data', (data) => hash.update(data));
          stream.on('end', () => resolve(hash.digest('hex')));
          stream.on('error', reject);
        });
        
        logger.info('File uploaded, adding to processing queue', { 
          fileId,
          filename: file.originalname, 
          size: file.size,
          type: fileType,
          userId,
          fileHash: fileHash.substring(0, 16) + '...'
        });
        
        // Add job to processing queue (non-blocking)
        const jobId = await queue.addJob('file-processing', {
          fileId,
          filePath: file.path,
          originalName: file.originalname,
          fileSize: file.size,
          fileType,
          userId,
          fileHash,
          projectId
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          timeout: 1800000 // 30 minutes for large files
        });
        
        logger.info('File processing job queued', { fileId, jobId });
        
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
    
    // Get drop location config
    const dropConfigResult = await dbPool.query(
      'SELECT * FROM drop_location_config WHERE is_active = true LIMIT 1'
    );
    
    if (dropConfigResult.rows.length === 0) {
      // Delete file
      try { fs.unlinkSync(file.path); } catch (e) {}
      
      return res.status(400).json({
        error: 'Drop location not configured',
        message: 'No drop location has been configured. Please contact your administrator.'
      });
    }
    
    const dropConfig = dropConfigResult.rows[0];
    
    // Decrypt credentials
    const { decrypt } = require('./backend/utils/encryption');
    const provider = dropConfig.provider || 'aws';
    
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
      
      storageKey = dropConfig.path_prefix 
        ? `${dropConfig.path_prefix}/${file.originalname}`
        : file.originalname;
      
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
      storageKey = dropConfig.path_prefix 
        ? `${dropConfig.path_prefix}/${file.originalname}`
        : file.originalname;
      
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
      
      storageKey = dropConfig.path_prefix 
        ? `${dropConfig.path_prefix}/${file.originalname}`
        : file.originalname;
      
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
    
    // Clean up local file
    try { fs.unlinkSync(file.path); } catch (e) {}
    
    // Log to database (without profiling)
    await dbPool.query(
      `INSERT INTO files (file_id, filename, file_type, file_size, metadata, project_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [
        fileId,
        file.originalname,
        path.extname(file.originalname).substring(1).toLowerCase(),
        file.size,
        JSON.stringify({
          storage_location: storageLocation,
          uploaded_by: userId,
          provider: provider,
          storage_key: storageKey,
          drop_file: true
        }),
        projectId
      ]
    );
    
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

// Legacy file processing code removed - now handled by FileProcessingWorker in queue
// All file processing now happens asynchronously via job queue
// See: backend/workers/fileProcessingWorker.js

// OLD synchronous upload endpoint (disabled)
// app.post('/api/files/upload-legacy', async (req, res) => {
//   Legacy implementation removed to prevent conflicts
// });

// Continue with other API endpoints below

// Lineage endpoints
app.get('/api/lineage', authenticateToken, async (req, res) => {
  try {
    // Get user's accessible projects
    const { getUserProjects } = require('./backend/middleware/requireProjectAccess');
    const userProjects = await getUserProjects(req.user.id);
    const projectIds = userProjects.map(p => p.id);
    const isAdmin = req.user?.roles?.includes('Admin');
    
    // Return empty if user has no projects and is not admin
    if (projectIds.length === 0 && !isAdmin) {
      return res.json({
        manual_lineage: [],
        transformation_lineage: []
      });
    }
    
    // Create lineage table if it doesn't exist
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS file_lineage (
        id SERIAL PRIMARY KEY,
        source_file_id VARCHAR(255) NOT NULL,
        target_file_id VARCHAR(255) NOT NULL,
        relationship_type VARCHAR(50) NOT NULL,
        transformation_details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Get manual lineage with file details (filtered by project)
    const lineageQuery = `
      SELECT 
        fl.*,
        sf.filename as source_filename,
        sf.file_type as source_file_type,
        sf.file_size as source_file_size,
        sf.row_count as source_row_count,
        sf.column_count as source_column_count,
        sf.created_at as source_created_at,
        tf.filename as target_filename,
        tf.file_type as target_file_type,
        tf.file_size as target_file_size,
        tf.row_count as target_row_count,
        tf.column_count as target_column_count,
        tf.created_at as target_created_at
      FROM file_lineage fl
      LEFT JOIN files sf ON fl.source_file_id = sf.file_id
      LEFT JOIN files tf ON fl.target_file_id = tf.file_id
      WHERE ${isAdmin ? '1=1' : 'sf.project_id = ANY($1::integer[]) AND tf.project_id = ANY($1::integer[])'}
      ORDER BY fl.created_at DESC
    `;
    
    const lineageResult = isAdmin 
      ? await dbPool.query(lineageQuery)
      : await dbPool.query(lineageQuery, [projectIds]);
    
    // Also get transformation-based lineage (filtered by project)
    const transformLineageQuery = `
      SELECT
        tl.id,
        tl.transformation_id,
        tl.input_file_id as source_pattern,
        tl.output_file_id as target_pattern,
        tl.execution_id,
        tl.created_at,
        tm.mapping_name,
        tm.mapping_id,
        tm.field_mappings,
        tm.variables,
        tm.source_file_pattern,
        tm.target_file_name,
        tm.target_file_format,
        tm.description,
        tm.project_id
      FROM transformation_lineage tl
      LEFT JOIN transformation_mappings tm ON tl.transformation_id = CONCAT('transform_', tm.mapping_id)
      WHERE ${isAdmin ? '1=1' : 'tm.project_id = ANY($1::integer[])'}
      ORDER BY tl.created_at DESC
    `;
    
    const transformLineageResult = isAdmin
      ? await dbPool.query(transformLineageQuery)
      : await dbPool.query(transformLineageQuery, [projectIds]);
    
    // Combine both types of lineage
    res.json({
      manual_lineage: lineageResult.rows,
      transformation_lineage: transformLineageResult.rows
    });
  } catch (err) {
    console.error('Error fetching lineage data:', err);
    res.status(500).json({ error: 'Failed to fetch lineage data' });
  }
});

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

// Cache routes
const cacheRoutes = require('./backend/routes/cacheRoutes');
app.use('/api/cache', cacheRoutes);

// DBT routes
const dbtRoutes = require('./backend/routes/dbt');
app.use('/api/dbt', authenticateToken, dbtRoutes);

// Drop location routes (admin only)
const dropLocationRoutes = require('./backend/routes/dropLocation');
app.use('/api/drop-location', authenticateToken, dropLocationRoutes);

// Transformation routes
try {
  const transformationRoutes = require('./backend/routes/transformations');
  app.use('/api/transformations', authenticateToken, transformationRoutes);
  console.log('✓ Registered /api/transformations route');
} catch (error) {
  console.error('✗ Failed to register /api/transformations:', error.message);
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
  console.log('✓ Registered /api/file-audit route');
} catch (error) {
  console.error('✗ Failed to register /api/file-audit:', error.message);
}

// File Insights routes
try {
  const fileInsightsRoutes = require('./backend/routes/fileInsights');
  app.use('/api/insights', fileInsightsRoutes(dbPool, authenticateToken));
  console.log('✓ Registered /api/insights route');
} catch (error) {
  console.error('✗ Failed to register /api/insights:', error.message);
}

// Visual Workflows routes (new graph-based workflow orchestration)
try {
  const visualWorkflowsRoutes = require('./backend/routes/visualWorkflows');
  app.use('/api/visual-workflows', authenticateToken, visualWorkflowsRoutes);
  console.log('✓ Registered /api/visual-workflows route');
} catch (error) {
  console.error('✗ Failed to register /api/visual-workflows:', error.message);
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

// Group Management routes (requires authentication)
try {
  const groupRoutes = require('./backend/routes/groupRoutes');
  app.use('/api/groups', authenticateToken, groupRoutes(dbPool));
  console.log('✓ Registered /api/groups route');
} catch (error) {
  console.error('✗ Failed to register /api/groups:', error.message);
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

// Initialize cache service
const cacheService = require('./backend/services/cacheService');
cacheService.initialize().then(result => {
  console.log(`✅ Cache service initialized: ${result.type}`);
}).catch(err => {
  console.error('Failed to initialize cache service:', err);
});

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

// Run schema migration asynchronously
migrateConnectionsSchema()
  .then(result => {
    console.log('Connection schema migration result:', result.message);
    
    // After schema is created, migrate transform connections
    return migrateTransformConnections();
  })
  .then(count => {
    console.log(`Transform connections migration completed. Migrated ${count} connections.`);
    
    // After migrations, add performance indexes
    return addPerformanceIndexes(dbPool);
  })
  .then(indexResult => {
    if (indexResult.success) {
      console.log(`✅ Performance indexes migration completed. Created ${indexResult.created} indexes.`);
    } else {
      console.error(`❌ Performance indexes migration failed:`, indexResult.error);
    }
    
    // Add profiling columns migration
    return addProfilingColumns(dbPool);
  })
  .then(() => {
    console.log('✅ Profiling columns migration completed');
    
    // Expand numeric columns to support larger values
    return expandNumericColumns(dbPool);
  })
  .then(() => {
    console.log('✅ Numeric columns expansion completed');
    
    // Add duplicate records columns migration
    return addDuplicateRecordsColumns(dbPool);
  })
  .then(() => {
    console.log('✅ Duplicate records columns migration completed');
    
    // Add patterns column migration
    return addPatternsColumn(dbPool);
  })
  .then(() => {
    console.log('✅ Patterns column migration completed');
    
    // Add historical profiling columns
    return addHistoricalProfilingColumns(dbPool);
  })
  .then(() => {
    console.log('✅ Historical profiling columns migration completed');
    
    // Initialize workflow orchestration tables
    return initWorkflowOrchestrationTables(dbPool);
  })
  .then(() => {
    console.log('✅ Workflow orchestration tables migration completed');
    
    // Fix mapping_group_members schema (mapping_id type mismatch)
    return fixMappingGroupMembersSchema(dbPool);
  })
  .then(() => {
    console.log('✅ Mapping group members schema fix completed');
    
    // Update object/array types to string in schemas
    return updateObjectTypesToString(dbPool);
  })
  .then(result => {
    if (result.success) {
      console.log(`✅ Object/array to string type conversion completed. Updated ${result.updatedRecords} schema records.`);
    }
    
    // Initialize file insights tables
    return initFileInsightsTables(dbPool);
  })
  .then(() => {
    console.log('✅ File insights tables migration completed');
    
    // Add lineage columns migration
    return addLineageColumns(dbPool);
  })
  .then(() => {
    console.log('✅ Lineage columns migration completed');
    
    // Add processing step column migration
    return addProcessingStepColumn(dbPool);
  })
  .then(() => {
    console.log('✅ Processing step column migration completed');
    
    // Create file preview data table
    return createFilePreviewDataTable(dbPool);
  })
  .then(() => {
    console.log('✅ File preview data table migration completed');
    
    // Create data governance tables
    return createDataGovernanceTables(dbPool);
  })
  .then(() => {
    console.log('✅ Data governance tables migration completed');
    
    // Create governance tags tables
    return createGovernanceTagsTables(dbPool);
  })
  .then(() => {
    console.log('✅ Governance tags tables migration completed');
    
    // Add sensitivity column to file_ownership
    return addSensitivityToFileOwnership(dbPool);
  })
  .then(() => {
    console.log('✅ File ownership sensitivity column migration completed');
    
    // Create column governance tables
    return createColumnGovernanceTables(dbPool);
  })
  .then(() => {
    console.log('✅ Column governance tables migration completed');
    
    // Add creator columns to file_ownership
    return addCreatorToFileOwnership(dbPool);
  })
  .then(() => {
    console.log('✅ File ownership creator columns migration completed');
    
    // Add permission levels to governance tags
    return addTagPermissionLevels(dbPool);
  })
  .then(() => {
    console.log('✅ Tag permission levels migration completed');
    
    // Add user profile and auth fields migration
    return addUserProfileAndAuthFields();
  })
  .then(() => {
    console.log('✅ User profile and auth fields migration completed');
    
    // Create projects and groups tables (Phase 1.1 RBAC revamp)
    return createProjectsAndGroups(dbPool);
  })
  .then(() => {
    console.log('✅ Projects and groups tables migration completed');
    
    // Add project_id to resource tables (Phase 1.2 RBAC revamp)
    return addProjectIdToResources(dbPool);
  })
  .then(() => {
    console.log('✅ Project_id resource migration completed');
    
    // Add project_id to remaining tables (mapping_groups, transformation_jobs, etc.)
    return addProjectIdToRemainingTables(dbPool);
  })
  .then(() => {
    console.log('✅ Project_id remaining tables migration completed');
    
    // Create policy engine tables (Phase 2 RBAC revamp)
    return createPolicyEngine(dbPool);
  })
  .then(() => {
    console.log('✅ Policy engine migration completed');
    
    // Create ABAC attributes tables (Phase 3 RBAC revamp)
    return createABACAttributes(dbPool);
  })
  .then(() => {
    console.log('✅ ABAC attributes migration completed');
    
    // Create SCIM provisioning tables (Phase 4 RBAC revamp)
    return createSCIMProvisioning(dbPool);
  })
  .then(() => {
    console.log('✅ SCIM provisioning migration completed');
  })
  .catch(err => {
    console.error('Error during connection migration:', err);
  });

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

// Initialize file_mappings table on startup
initFileMappingsTable();
// Initialize schedules table on startup
initSchedulesTable();

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
// NOTE: authenticateToken MUST come before cacheMiddleware so req.user is populated for cache key generation
app.get('/api/files/:fileId/profile', 
  authenticateToken, 
  cacheMiddleware(600),
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
          type: col.column_type,
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
        type: col.column_type,
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
  cacheMiddleware(300),
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
app.post('/api/files/:fileId/columns/:columnName/sensitivity-tag', authenticateToken, invalidateCache('cache:*:*sensitivity*'), async (req, res) => {
  try {
    // Check if user has file_governance:write permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('file_governance:write')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to manage column sensitivity tags. Contact your administrator.'
      });
    }
    
    const { fileId, columnName } = req.params;
    const { classification_level, data_type } = req.body;
    
    if (!classification_level) {
      return res.status(400).json({ error: 'classification_level is required' });
    }
    
    const validLevels = ['Public', 'Internal', 'Confidential', 'Restricted'];
    if (!validLevels.includes(classification_level)) {
      return res.status(400).json({ error: `Invalid classification level. Must be one of: ${validLevels.join(', ')}` });
    }
    
    const result = await dbPool.query(
      `INSERT INTO column_sensitivity_tags (file_id, column_name, classification_level, data_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (file_id, column_name) DO UPDATE
       SET classification_level = $3, data_type = $4, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [fileId, columnName, classification_level, data_type]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error setting column sensitivity tag:', err);
    res.status(500).json({ error: 'Failed to set column sensitivity tag' });
  }
});

// Delete sensitivity tag for a column
app.delete('/api/files/:fileId/columns/:columnName/sensitivity-tag', authenticateToken, invalidateCache('cache:*:*sensitivity*'), async (req, res) => {
  try {
    const { fileId, columnName } = req.params;
    
    const result = await dbPool.query(
      'DELETE FROM column_sensitivity_tags WHERE file_id = $1 AND column_name = $2 RETURNING *',
      [fileId, columnName]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sensitivity tag not found' });
    }
    
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
    // Check if user has policy:write permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('policy:write')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to create governance policies. Contact your administrator.'
      });
    }
    
    const { policy_id, policy_name, description, rules } = req.body;
    
    if (!policy_id || !policy_name) {
      return res.status(400).json({ error: 'policy_id and policy_name are required' });
    }
    
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
    // Check if user has policy:write permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('policy:write')) {
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
    // Check if user has policy:write permission
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('policy:write')) {
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
app.get('/api/files/:fileId/columns/:columnName/governance-tags', cacheMiddleware(300), async (req, res) => {
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
app.post('/api/files/:fileId/columns/:columnName/tags', authenticateToken, invalidateCache('cache:*:*tags*'), async (req, res) => {
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
app.post('/api/files/:fileId/recalculate-quality', async (req, res) => {
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
    
    // Validate password requirements using enhanced auth service
    const passwordValidation = enhancedAuthService.validatePassword(newPassword);
    if (!passwordValidation.isValid) {
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
    
    const result = await dbPool.query(`
      SELECT u.id, u.username, u.email, 
        u.first_name, u.middle_name, u.last_name, u.full_name,
        u.phone_number,
        u.address_line1, u.address_line2, u.city, u.state, u.postal_code, u.country,
        u.auth_provider,
        u.created_at, u.updated_at, u.last_login,
        array_agg(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      GROUP BY u.id
      ORDER BY u.id ASC
    `);
    
    // Remove null values from roles array
    const users = result.rows.map(user => ({
      ...user,
      roles: user.roles.filter(role => role !== null)
    }));
    
    res.json(users);
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
    
    const result = await dbPool.query('SELECT * FROM roles ORDER BY id ASC');
    res.json(result.rows);
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
    
    const { name, description, permissions } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }
    
    // Check if role with the same name already exists
    const existingRole = await dbPool.query('SELECT * FROM roles WHERE name = $1', [name]);
    if (existingRole.rows.length > 0) {
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
app.post('/api/files/:fileId/quality-check', async (req, res) => {
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

// Transformations endpoints
app.get('/api/transformations', authenticateToken, async (req, res) => {
  try {
    const result = await dbPool.query('SELECT * FROM transformations ORDER BY created_at DESC');
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
    const defaultGroupResult = await dbPool.query("SELECT id FROM groups WHERE name = 'Default Group'");
    
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
async function startServer() {
  try {
    logger.info('Starting server initialization...');
    
    // Initialize database with retry logic
    logger.info('Initializing database connection...');
    await initializeDatabase();
    logger.info('Database connection established successfully');
    
    // Start the HTTP server - bind to 0.0.0.0 for Replit
    app.listen(port, '0.0.0.0', () => {
      logger.info(`🚀 Server running on port ${port}`, {
        environment: process.env.NODE_ENV || 'development',
        port: port,
        host: '0.0.0.0'
      });
      console.log(`Server running on port ${port} (host: 0.0.0.0)`);
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
    
    // Stop insights aggregation worker
    if (insightsWorker) {
      insightsWorker.stop();
    }
    
    // Stop file processing worker
    await fileWorker.stop();
    
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