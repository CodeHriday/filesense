/**
 * Server entry point
 * 
 * This module initializes and starts the HTTP server for the application.
 */
const { app, initializeTables } = require('./app');
const { SERVER_CONFIG } = require('./config/environment');

// Set the port
const PORT = SERVER_CONFIG.PORT;

// Initialize database tables and start the server
const startServer = async () => {
  try {
    // Initialize database tables
    await initializeTables();
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // For now, we won't exit the process, but in production you might want to
  // process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // For now, we won't exit the process, but in production you might want to
  // process.exit(1);
});