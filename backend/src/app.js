/**
 * Main application module
 * 
 * This module initializes the Express application with all middleware
 * and routes. It centralizes application setup and configuration.
 */
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { SERVER_CONFIG, UPLOAD_CONFIG } = require('./config/environment');
const db = require('./config/database');
const { configureSecurityMiddleware } = require('./middleware/security');
const { notFoundHandler, errorHandler } = require('./middleware/error-handler');

// Import route modules (will add more as they're created)
const transformationsRoutes = require('./routes/transformations');

// Initialize Express application
const app = express();

// Configure file upload storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create upload directory if it doesn't exist
    if (!fs.existsSync(UPLOAD_CONFIG.UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_CONFIG.UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_CONFIG.UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE }
});

// Apply security middleware (CORS, helmet, rate limiting)
configureSecurityMiddleware(app);

// Apply common middleware
app.use(compression()); // Compress responses
app.use(bodyParser.json({ limit: '50mb' })); // Parse JSON request bodies
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' })); // Parse URL-encoded request bodies
app.use(cookieParser()); // Parse cookies

// Serve static files
app.use(express.static(path.join(__dirname, '../../public')));

// Set up API routes
app.use('/api/transformations', transformationsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Apply error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize database tables
const initializeTables = async () => {
  try {
    // Test database connection
    const isConnected = await db.testConnection();
    
    if (!isConnected) {
      console.error('Database connection failed');
      return;
    }
    
    // Create transformations table
    await db.query(`
      CREATE TABLE IF NOT EXISTS transformations (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        source_file_id VARCHAR(255),
        target_file_id VARCHAR(255),
        transform_type VARCHAR(50) NOT NULL,
        transform_config JSONB,
        status VARCHAR(50) DEFAULT 'created',
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `);
    console.log('Transformations table initialized');
    
    // Create lineage table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS file_lineage (
        id SERIAL PRIMARY KEY,
        source_file_id VARCHAR(255) NOT NULL,
        target_file_id VARCHAR(255) NOT NULL,
        transformation_id VARCHAR(36) REFERENCES transformations(id),
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(source_file_id, target_file_id)
      )
    `);
    console.log('File lineage table initialized');
    
  } catch (error) {
    console.error('Error initializing tables:', error);
  }
};

// Export the configured app and initialization function
module.exports = {
  app,
  initializeTables
};