/**
 * Main application module
 * 
 * This module sets up the Express application with all middleware and routes.
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

// Import application modules
const { APP_CONFIG, SECURITY_CONFIG } = require('./config/environment');
const { errorHandler, notFoundHandler } = require('./middleware/error-handler');
const routes = require('./routes');
const db = require('./config/database');
const { applyMigrations } = require('./migrations');

// Create Express application
const app = express();

// Set up request logging
if (APP_CONFIG.NODE_ENV === 'production') {
  // In production, log to file
  const logDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }
  
  const accessLogStream = fs.createWriteStream(
    path.join(logDir, 'access.log'),
    { flags: 'a' }
  );
  
  app.use(morgan('combined', { stream: accessLogStream }));
} else {
  // In development, log to console
  app.use(morgan('dev'));
}

// Apply security middleware
app.use(helmet()); // Set security headers
app.use(cors({
  origin: APP_CONFIG.CORS_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Apply rate limiting
const limiter = rateLimit({
  windowMs: APP_CONFIG.RATE_LIMIT_WINDOW_MS,
  max: APP_CONFIG.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests from this IP, please try again later.'
  }
});

// Apply rate limiter to all requests
app.use(limiter);

// Parse request body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Parse cookies
app.use(cookieParser(SECURITY_CONFIG.COOKIE_SECRET));

// Compress responses
app.use(compression());

// Mount API routes
app.use(APP_CONFIG.API_PREFIX, routes);

// Static files for the React frontend in production
if (APP_CONFIG.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../build')));
  
  // Serve React app for any unmatched routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../build/index.html'));
  });
}

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Initialize the application
 * @returns {Promise<void>}
 */
const initializeApp = async () => {
  try {
    // Apply database migrations
    console.log('Applying database migrations...');
    const migrationsApplied = await applyMigrations();
    console.log(`Applied ${migrationsApplied} database migrations`);
    
    // Additional initialization if needed
    // ...
    
    console.log('Application initialization complete');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  }
};

module.exports = { app, initializeApp };