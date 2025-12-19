/**
 * DI Bootstrapper
 * 
 * This module initializes the dependency injection container and
 * registers all services. It provides access to the configured container.
 */

const { systemLogger } = require('../utils/logger');
const container = require('./container');
const { registerServices } = require('./services');

// Import improved database configuration
const database = require('../config/database');

// Import queue system
const { getQueue } = require('../queue/queueFactory');

// Import service classes (not instances)
const ServiceBase = require('../services/ServiceBase');

// External dependencies and utilities
const { v4: uuidv4 } = require('uuid');

/**
 * Configure the DI container with all services and dependencies
 */
function configureDI() {
  // Register improved database pool with connection retry logic
  container.register('dbPool', () => {
    systemLogger.info('Registering database pool from improved configuration');
    // Return a comprehensive proxy that ensures pool initialization on method calls
    return {
      query: async (...args) => {
        const pool = await database.initializePool();
        if (!pool) {
          throw new Error('Database pool not initialized');
        }
        return pool.query(...args);
      },
      connect: async (...args) => {
        const pool = await database.initializePool();
        if (!pool) {
          throw new Error('Database pool not initialized');
        }
        return pool.connect(...args);
      },
      end: async (...args) => {
        const pool = await database.initializePool();
        if (!pool) {
          throw new Error('Database pool not initialized');
        }
        return pool.end(...args);
      },
      // Event listener methods that ServiceBase expects
      on: (event, listener) => {
        // Initialize pool first, then add listener
        database.initializePool().then((pool) => {
          if (pool && pool.on) {
            pool.on(event, listener);
          }
        }).catch(err => {
          systemLogger.error('Failed to initialize pool for event listener', { error: err.message });
        });
      },
      off: (event, listener) => {
        if (database.pool && database.pool.off) {
          database.pool.off(event, listener);
        }
      },
      removeListener: (event, listener) => {
        if (database.pool && database.pool.removeListener) {
          database.pool.removeListener(event, listener);
        }
      },
      // Synchronous properties
      get totalCount() {
        return database.pool?.totalCount;
      },
      get idleCount() {
        return database.pool?.idleCount;
      },
      get waitingCount() {
        return database.pool?.waitingCount;
      },
      get options() {
        return database.pool?.options;
      }
    };
  });
  
  // Register database module (for initialization and health checks)
  container.register('database', () => database, false);
  
  container.register('logger', () => systemLogger);
  container.register('uuid', () => uuidv4, false); // Non-singleton, return a new UUID each time
  
  // Register queue system (singleton)
  container.register('queue', () => getQueue());
  
  // Register services
  
  // ServiceBase - foundation for all services
  container.register('serviceBase', function() {
    return new ServiceBase(
      this.get('dbPool'),
      this.get('logger')
    );
  });
  
  // Register all domain services
  registerServices(container);
  
  return container;
}

/**
 * Initialize the DI container
 * 
 * @returns {Object} Configured DI container
 */
function initialize() {
  // Only configure once
  if (!container.isConfigured) {
    configureDI();
    container.isConfigured = true;
  }
  
  return container;
}

/**
 * Initialize database with connection testing and retry logic
 * Call this during server startup
 * 
 * @returns {Promise<boolean>} True if successful
 */
async function initializeDatabase() {
  try {
    systemLogger.info('Initializing database connection...');
    await database.initialize();
    systemLogger.info('Database initialized successfully');
    return true;
  } catch (err) {
    systemLogger.error('Database initialization failed', {
      error: err.message,
      stack: err.stack
    });
    throw err;
  }
}

module.exports = {
  initialize,
  initializeDatabase,
  getContainer: () => container
};
