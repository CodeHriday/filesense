/**
 * Database Configuration
 * 
 * Provides connection to PostgreSQL database using connection pooling
 */

const { Pool } = require('pg');
const { databaseLogger } = require('../utils/logger');

// Create connection pool with environment variables
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Max number of clients in the pool
  max: process.env.DB_POOL_SIZE || 20,
  // Connection timeout in milliseconds
  connectionTimeoutMillis: 10000,
  // Idle timeout in milliseconds
  idleTimeoutMillis: 30000
});

// Log pool errors
pool.on('error', (err, client) => {
  databaseLogger.error('Unexpected error on idle client', { error: err.message, stack: err.stack });
});

// Log connection creation and release for debugging in development
if (process.env.NODE_ENV !== 'production') {
  pool.on('connect', () => {
    databaseLogger.debug('New client connected to the pool');
  });
  
  pool.on('acquire', (client) => {
    databaseLogger.debug('Client acquired from the pool');
  });
  
  pool.on('remove', () => {
    databaseLogger.debug('Client removed from the pool');
  });
}

/**
 * Execute a query with parameters
 * 
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} - Query result
 */
async function query(text, params) {
  const start = Date.now();
  
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log query performance (debug level)
    databaseLogger.debug('Executed query', { 
      query: text, 
      duration, 
      rows: res.rowCount,
      // Only log params if not sensitive
      params: params && params.length > 0 ? '[hidden]' : null
    });
    
    return res;
  } catch (err) {
    const duration = Date.now() - start;
    
    // Log query error
    databaseLogger.error('Query error', { 
      query: text, 
      duration, 
      error: err.message,
      code: err.code,
      // Only log params if not sensitive
      params: params && params.length > 0 ? '[hidden]' : null 
    });
    
    throw err;
  }
}

/**
 * Execute a transaction with multiple queries
 * 
 * @param {Function} callback - Callback that receives the client and executes queries
 * @returns {Promise<*>} - Result of the transaction
 */
async function transaction(callback) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Initialize the database tables required by the application
 */
async function initializeTables() {
  try {
    // Ensure transformations table exists
    await query(`
      CREATE TABLE IF NOT EXISTS transformations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        config JSONB NOT NULL,
        task_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        error TEXT,
        result JSONB,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    databaseLogger.info('Transformations table initialized');
    
    // Add task_id column if not exists (for backward compatibility)
    try {
      await query(`
        ALTER TABLE transformations 
        ADD COLUMN IF NOT EXISTS task_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS error TEXT,
        ADD COLUMN IF NOT EXISTS result JSONB
      `);
    } catch (err) {
      // Columns might already exist, which is fine
      databaseLogger.warn('Error adding columns to transformations table', { error: err.message });
    }
  } catch (err) {
    databaseLogger.error('Error initializing database tables', { error: err.message, stack: err.stack });
    throw err;
  }
}

// Call initialization on module load
initializeTables().catch(err => {
  console.error('Failed to initialize database tables:', err);
});

module.exports = {
  query,
  transaction,
  pool
};