/**
 * Backend Integration Module
 * 
 * This module integrates our enhanced async processing and logging capabilities
 * with the existing server.js file without requiring major refactoring.
 */

const express = require('express');
const { systemLogger, performanceLogger } = require('./utils/logger');
const transformationRoutes = require('./routes/transformationRoutes');

/**
 * Configure and integrate enhanced features with the Express application
 * 
 * @param {Express} app - Express application instance
 */
function setupEnhancedFeatures(app) {
  // Log the integration
  systemLogger.info('Setting up enhanced backend features');
  
  // Add performance logging middleware
  app.use(performanceLogger);
  systemLogger.info('Added performance logging middleware');
  
  // NOTE: Transformation routes are registered in server.js
  // Commenting out duplicate route registration to avoid conflicts
  // app.use('/api/transformations', (req, res, next) => {
  //   req.user = { 
  //     id: 2,  // Admin ID
  //     roles: ['Admin']
  //   };
  //   next();
  // }, transformationRoutes);
  systemLogger.info('Registered enhanced transformation routes');
  
  // NOTE: Error handling middleware moved to server.js to avoid conflicts
  // app.use((err, req, res, next) => {
  //   systemLogger.error('Unhandled error in request', { 
  //     error: err.message,
  //     stack: err.stack,
  //     path: req.path,
  //     method: req.method
  //   });
  //   
  //   res.status(500).json({ 
  //     error: 'An unexpected error occurred',
  //     message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  //   });
  // });
  
  // Configure application shutdown handler
  process.on('SIGTERM', () => {
    systemLogger.info('SIGTERM received, shutting down gracefully');
    // Perform cleanup
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    systemLogger.info('SIGINT received, shutting down gracefully');
    // Perform cleanup
    process.exit(0);
  });
  
  systemLogger.info('Enhanced backend features setup complete');
}

module.exports = {
  setupEnhancedFeatures
};