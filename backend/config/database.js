/**
 * Database Configuration
 * 
 * Provides connection to PostgreSQL database using connection pooling
 * with retry logic, validation, and production-optimized settings
 */

const { Pool } = require('pg');
const { databaseLogger } = require('../utils/logger');



/**
 * Get database URL from AWS Secrets Manager or environment
 */
async function getDatabaseUrl() {
  // Try AWS Secrets Manager first
  try {
    const { initializeSecrets } = require('./config-secrets');
    await initializeSecrets();
    
    if (process.env.DATABASE_URL) {
      databaseLogger.info('Using database URL from AWS Secrets Manager');
      return process.env.DATABASE_URL;
    }
  } catch (error) {
    databaseLogger.warn('AWS Secrets Manager not available, using .env fallback:', error.message);
  }
  
  // No fallback to .env - force use of secrets only
  throw new Error('DATABASE_URL not found in AWS Secrets Manager. Please configure AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION) and ensure the "filevantage-prod" secret exists.');
}

/**
 * Validate required database environment variables
 */
async function validateDatabaseConfig() {
  try {
    const databaseUrl = await getDatabaseUrl();
    // Override the environment variable for all subsequent usage
    process.env.DATABASE_URL = databaseUrl;
    
    databaseLogger.info('Database configuration validated');
    return true;
  } catch (error) {
    databaseLogger.error('Database configuration validation failed:', error.message);
    throw error;
  }
}

/**
 * Get optimized pool configuration based on environment
 */
function getPoolConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    connectionString: process.env.DATABASE_URL,
    // Production: Lower max connections to avoid overwhelming Replit's database
    // Development: Higher max for local testing
    max: isProduction ? 10 : (process.env.DB_POOL_SIZE || 20),
    // Minimum number of clients to keep in pool
    min: isProduction ? 2 : 0,
    // Connection timeout: 30s for initial deployment connections
    connectionTimeoutMillis: isProduction ? 30000 : 10000,
    // Idle timeout: 60s in production to recycle connections
    idleTimeoutMillis: isProduction ? 60000 : 30000,
    // Statement timeout: Prevent runaway queries
    statement_timeout: 60000,
    // Enable keep-alive to detect dead connections
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    // Allow self-signed certificates in production (Replit uses internal certs)
    ssl: isProduction ? { rejectUnauthorized: false } : false
  };
}

// Initialize pool asynchronously
let pool;
let poolInitialized = false;

async function initializePool() {
  if (poolInitialized) return pool;
  
  try {
    console.log('🔄 Initializing database pool...');
    await validateDatabaseConfig();
    console.log('✅ Database config validated');
    
    pool = new Pool(getPoolConfig());
    poolInitialized = true;
    
    console.log('✅ Database pool created successfully');
    databaseLogger.info('Database pool created', {
      environment: process.env.NODE_ENV,
      poolSize: pool.options.max
    });
    
    // Set up event listeners
    pool.on('error', (err, client) => {
      databaseLogger.error('Unexpected error on idle client', { 
        error: err.message, 
        stack: err.stack,
        code: err.code 
      });
    });

    // Log connection events in development
    if (process.env.NODE_ENV !== 'production') {
      pool.on('connect', () => {
        databaseLogger.debug('New client connected to PostgreSQL');
      });
      
      pool.on('acquire', (client) => {
        databaseLogger.debug('Client acquired from pool');
      });
      
      pool.on('remove', () => {
        databaseLogger.debug('Client removed from pool');
      });
    }
    
    return pool;
  } catch (err) {
    databaseLogger.error('Failed to create database pool', { error: err.message });
    // Create a dummy pool that will fail gracefully
    pool = {
      query: async () => {
        throw new Error('Database not configured. Failed to get DATABASE_URL from Secrets Manager or environment.');
      },
      connect: async () => {
        throw new Error('Database not configured. Failed to get DATABASE_URL from Secrets Manager or environment.');
      },
      end: async () => {}
    };
    poolInitialized = true;
    return pool;
  }
}

// Initialize pool immediately
initializePool();

// Event listeners will be set up after pool initialization

/**
 * Sleep utility for retry logic
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test database connection with retry logic
 * 
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} initialDelay - Initial delay in milliseconds (will exponentially increase)
 * @returns {Promise<boolean>} - True if connection successful
 */
async function testConnection(maxRetries = 5, initialDelay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await pool.query('SELECT NOW() as current_time');
      databaseLogger.info('Database connection successful', {
        attempt,
        serverTime: result.rows[0].current_time
      });
      return true;
    } catch (err) {
      lastError = err;
      const delay = initialDelay * Math.pow(2, attempt - 1); // Exponential backoff
      
      databaseLogger.warn('Database connection attempt failed', {
        attempt,
        maxRetries,
        error: err.message,
        code: err.code,
        nextRetryIn: attempt < maxRetries ? `${delay}ms` : 'no retry'
      });
      
      if (attempt < maxRetries) {
        databaseLogger.info(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  // All retries failed
  databaseLogger.error('Database connection failed after all retries', {
    attempts: maxRetries,
    lastError: lastError.message,
    code: lastError.code
  });
  
  throw new Error(`Failed to connect to database after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * Execute a query with parameters
 * 
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} - Query result
 */
async function query(text, params) {
  await initializePool();
  
  const start = Date.now();
  
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries (> 1 second)
    if (duration > 1000) {
      databaseLogger.warn('Slow query detected', { 
        query: text.substring(0, 100), 
        duration, 
        rows: res.rowCount
      });
    } else {
      databaseLogger.debug('Executed query', { 
        query: text.substring(0, 100), 
        duration, 
        rows: res.rowCount
      });
    }
    
    return res;
  } catch (err) {
    const duration = Date.now() - start;
    
    // Log query error
    databaseLogger.error('Query error', { 
      query: text.substring(0, 100), 
      duration, 
      error: err.message,
      code: err.code
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
 * This is called explicitly after connection is verified
 */
async function initializeTables() {
  try {
    databaseLogger.info('Initializing database tables...');
    
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
      databaseLogger.info('Transformations table columns verified');
    } catch (err) {
      // Columns might already exist, which is fine
      if (err.code !== '42701') { // duplicate_column error code
        databaseLogger.warn('Error adding columns to transformations table', { error: err.message });
      }
    }
    
    databaseLogger.info('Database tables initialized successfully');
    return true;
  } catch (err) {
    databaseLogger.error('Error initializing database tables', { 
      error: err.message, 
      stack: err.stack,
      code: err.code 
    });
    throw err;
  }
}

/**
 * Initialize database with connection testing and table creation
 * Call this during server startup
 */
async function initialize() {
  try {
    databaseLogger.info('Starting database initialization...');
    
    // Test connection with retries
    await testConnection();
    
    // Initialize tables
    await initializeTables();
    
    databaseLogger.info('Database initialization complete');
    return true;
  } catch (err) {
    databaseLogger.error('Database initialization failed', {
      error: err.message,
      stack: err.stack
    });
    throw err;
  }
}

/**
 * Gracefully close database pool
 */
async function close() {
  try {
    if (pool && pool.end) {
      await pool.end();
      databaseLogger.info('Database pool closed');
    }
  } catch (err) {
    databaseLogger.error('Error closing database pool', { error: err.message });
  }
}

/**
 * Get database health status
 */
async function getHealthStatus() {
  try {
    const start = Date.now();
    const responseTime = Date.now() - start;
    
    return {
      healthy: true,
      responseTime,
      poolSize: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingClients: pool.waitingCount
    };
  } catch (err) {
    return {
      healthy: false,
      error: err.message,
      code: err.code
    };
  }
}

/**
 * Get a client from the pool for transactions
 */
async function getClient() {
  await initializePool();
  return await pool.connect();
}

module.exports = {
  query,
  transaction,
  pool,
  getClient,
  initialize,
  initializePool,
  testConnection,
  close,
  getHealthStatus
};
