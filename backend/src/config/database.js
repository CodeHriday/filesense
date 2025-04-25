/**
 * Database configuration module
 * 
 * This module provides a configured PostgreSQL pool for database access.
 */
const { Pool } = require('pg');
const { DATABASE_CONFIG } = require('./environment');

// Create a connection pool
const pool = new Pool({
  connectionString: DATABASE_CONFIG.CONNECTION_STRING,
  ssl: DATABASE_CONFIG.SSL_ENABLED ? {
    rejectUnauthorized: DATABASE_CONFIG.SSL_REJECT_UNAUTHORIZED
  } : false,
  max: DATABASE_CONFIG.POOL_MAX || 20,
  idleTimeoutMillis: DATABASE_CONFIG.POOL_IDLE_TIMEOUT || 30000,
  connectionTimeoutMillis: DATABASE_CONFIG.CONNECTION_TIMEOUT || 5000
});

// Log connection events
pool.on('connect', () => {
  console.log('New client connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('Unexpected error on PostgreSQL client', err);
});

/**
 * Execute a SQL query
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
const query = async (text, params) => {
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
  await pool.end();
  console.log('Database connection pool closed');
};

// Export the database interface
module.exports = {
  query,
  getClient,
  closePool
};