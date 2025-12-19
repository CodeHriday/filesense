/**
 * Database configuration module
 * 
 * This module provides a configured PostgreSQL pool for database access.
 * Updated to use AWS Secrets Manager integration with .env fallback.
 */
const { Pool } = require('pg');
const { DATABASE_CONFIG } = require('./environment');

// Import AWS Secrets Manager integration
const { initializeSecrets } = require('../../config/config-secrets');

// Initialize pool with AWS Secrets Manager support
let pool;
let poolInitialized = false;

async function initializePool() {
  if (poolInitialized) return pool;
  
  try {
    // Initialize AWS Secrets Manager first
    await initializeSecrets();
    
    // Create a connection pool using the updated DATABASE_URL (from secrets manager or .env)
    // Automatically enable SSL for AWS RDS connections
    const isAWSRDS = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('.rds.amazonaws.com');
    const sslConfig = isAWSRDS ? { rejectUnauthorized: false } : (
      DATABASE_CONFIG.SSL_ENABLED ? {
        rejectUnauthorized: DATABASE_CONFIG.SSL_REJECT_UNAUTHORIZED
      } : false
    );
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
      max: DATABASE_CONFIG.POOL_MAX || 20,
      idleTimeoutMillis: DATABASE_CONFIG.POOL_IDLE_TIMEOUT || 30000,
      connectionTimeoutMillis: DATABASE_CONFIG.CONNECTION_TIMEOUT || 5000
    });
    
    // Set up event listeners
    pool.on('connect', () => {
      console.log('New client connected to PostgreSQL');
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on PostgreSQL client', err);
    });
    
    poolInitialized = true;
    return pool;
  } catch (error) {
    console.error('Failed to initialize database pool with secrets manager:', error.message);
    // Fallback to original configuration
    const isAWSRDSFallback = DATABASE_CONFIG.CONNECTION_STRING && DATABASE_CONFIG.CONNECTION_STRING.includes('.rds.amazonaws.com');
    const sslConfigFallback = isAWSRDSFallback ? { rejectUnauthorized: false } : (
      DATABASE_CONFIG.SSL_ENABLED ? {
        rejectUnauthorized: DATABASE_CONFIG.SSL_REJECT_UNAUTHORIZED
      } : false
    );
    
    pool = new Pool({
      connectionString: DATABASE_CONFIG.CONNECTION_STRING,
      ssl: sslConfigFallback,
      max: DATABASE_CONFIG.POOL_MAX || 20,
      idleTimeoutMillis: DATABASE_CONFIG.POOL_IDLE_TIMEOUT || 30000,
      connectionTimeoutMillis: DATABASE_CONFIG.CONNECTION_TIMEOUT || 5000
    });
    poolInitialized = true;
    return pool;
  }
}

// Initialize pool immediately
initializePool();

/**
 * Execute a SQL query
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
const query = async (text, params) => {
  // Ensure pool is initialized before executing query
  await initializePool();
  
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  
  // Log query if duration exceeds threshold
  if (duration > 100) {
    console.log('Slow query:', {
      text,
      params,
      duration,
      rows: res.rowCount
    });
  }
  
  return res;
};

/**
 * Get a client from the pool
 * @returns {Promise<Object>} Database client
 */
const getClient = async () => {
  // Ensure pool is initialized before getting client
  await initializePool();
  
  const client = await pool.connect();
  
  // Monkey patch the client's query method to add logging
  const query = client.query;
  client.query = (...args) => {
    const start = Date.now();
    return query.apply(client, args).then(res => {
      const duration = Date.now() - start;
      
      // Log transaction queries if duration exceeds threshold
      if (duration > 100) {
        console.log('Slow transaction query:', {
          text: args[0],
          params: args[1],
          duration,
          rows: res.rowCount
        });
      }
      
      return res;
    });
  };
  
  return client;
};

/**
 * Close the database connection pool
 * @returns {Promise<void>}
 */
const closePool = async () => {
  if (pool) {
    await pool.end();
    console.log('Database connection pool closed');
  }
};

// Export the database interface
module.exports = {
  query,
  getClient,
  closePool
};