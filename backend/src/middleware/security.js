/**
 * Security middleware module
 * 
 * This module provides various security middleware for the application,
 * including CORS, rate limiting, and HTTP headers security.
 */
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { CORS_CONFIG, RATE_LIMIT_CONFIG } = require('../config/environment');

/**
 * Configure security middleware
 * @param {Object} app - Express application
 */
const configureSecurityMiddleware = (app) => {
  // 1. Configure CORS
  app.use(cors({
    origin: CORS_CONFIG.ALLOWED_ORIGINS,
    methods: CORS_CONFIG.ALLOWED_METHODS,
    allowedHeaders: CORS_CONFIG.ALLOWED_HEADERS,
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  }));

  // 2. Configure Helmet for security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'https://*']
      }
    },
    crossOriginEmbedderPolicy: false, // Allow loading resources from different origins
    crossOriginResourcePolicy: { policy: 'cross-origin' } // Allow cross-origin resource sharing
  }));

  // 3. Configure rate limiting
  const apiLimiter = rateLimit({
    windowMs: RATE_LIMIT_CONFIG.WINDOW_MS, // 15 minutes by default
    max: RATE_LIMIT_CONFIG.MAX_REQUESTS, // Limit each IP to 100 requests per window
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.'
    }
  });

  // Apply rate limiting to API routes
  app.use('/api/', apiLimiter);

  // 4. Set other security headers
  app.use((req, res, next) => {
    // Set strict transport security header
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Disable caching for API responses
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    
    next();
  });
};

module.exports = {
  configureSecurityMiddleware
};