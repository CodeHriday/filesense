/**
 * DI Bootstrapper
 * 
 * This module initializes the dependency injection container and
 * registers all services. It provides access to the configured container.
 */

const { Pool } = require('pg');
const { systemLogger } = require('../utils/logger');
const container = require('./container');
const { registerServices } = require('./services');

// Import service classes (not instances)
const ServiceBase = require('../services/ServiceBase');

// External dependencies and utilities
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

/**
 * Configure the DI container with all services and dependencies
 */
function configureDI() {
  // Register shared resources
  container.register('dbPool', () => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Production-optimized connection pool settings
      max: parseInt(process.env.DB_POOL_MAX || '100', 10), // Maximum 100 connections (configurable)
      min: parseInt(process.env.DB_POOL_MIN || '10', 10),  // Minimum 10 idle connections
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10), // 30 seconds
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '2000', 10), // 2 seconds
      // Allow graceful shutdown
      allowExitOnIdle: false
    });
    
    // Add error handler for unhandled pool errors
    pool.on('error', (err) => {
      systemLogger.error('Unhandled database pool error', { error: err.message });
    });
    
    // Log pool configuration
    systemLogger.info('Database connection pool initialized', {
      max: pool.options.max,
      min: pool.options.min,
      idleTimeout: pool.options.idleTimeoutMillis,
      connectionTimeout: pool.options.connectionTimeoutMillis
    });
    
    return pool;
  });
  
  container.register('logger', () => systemLogger);
  container.register('uuid', () => uuidv4, false); // Non-singleton, return a new UUID each time
  
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

module.exports = {
  initialize,
  getContainer: () => container
};