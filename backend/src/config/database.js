/**
 * Database configuration module
 * 
 * This module centralizes database connection management using a connection pool
 * and provides error handling for database connections.
 */
const { Pool } = require('pg');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Configure PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Add error handler to connection pool for unexpected errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
  process.exit(-1); // Exit on connection pool error
});

/**
 * Test database connection
 * @returns {Promise<boolean>} True if connection successful, false otherwise
 */
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('Database connected successfully');
    return true;
  } catch (err) {
    console.error('Error connecting to the database:', err);
    return false;
  }
};

/**
 * Execute a query with parameters
 * @param {string} text - SQL query text
 * @param {Array} params - Parameters for the query
 * @returns {Promise<Object>} Query result
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries (over 100ms) for performance monitoring
    if (duration > 100) {
      console.log('Slow query detected:', { text, duration, rows: result.rowCount });
    }
    
    return result;
  } catch (err) {
    console.error('Error executing query:', err);
    throw err; // Re-throw for handling by caller
  }
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} Client and release function
 */
const getClient = async () => {
  const client = await pool.connect();
  const originalRelease = client.release;
  
  // Override client release method to make it safe
  client.release = () => {
    client.release = originalRelease;
    return client.release();
  };
  
  // Return both client and release function
  return {
    client,
    release: () => client.release(),
  };
};

// Export database pool and utility functions
module.exports = {
  pool,
  query,
  getClient,
  testConnection
};