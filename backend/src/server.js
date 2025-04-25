/**
 * Server entry point
 * 
 * This module starts the Express application server.
 */
const { app, initializeApp } = require('./app');
const { APP_CONFIG } = require('./config/environment');
const db = require('./config/database');

// Start the server
const port = APP_CONFIG.PORT;
const host = APP_CONFIG.HOST;

const startServer = async () => {
  try {
    // Initialize the application
    await initializeApp();
    
    // Start listening for requests
    app.listen(port, host, () => {
      console.log(`Server running on ${host}:${port}`);
      console.log(`API available at ${APP_CONFIG.API_PREFIX}`);
      console.log(`Environment: ${APP_CONFIG.NODE_ENV}`);
    });
    
    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM signal received: closing HTTP server');
      // Close database connection
      await db.closePool();
      // Exit process
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      console.log('SIGINT signal received: closing HTTP server');
      // Close database connection
      await db.closePool();
      // Exit process
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };