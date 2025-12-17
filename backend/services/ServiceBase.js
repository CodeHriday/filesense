/**
 * Base Service Class
 * 
 * This is the foundation for all domain-specific services.
 * It provides common functionality like logging, database access,
 * transaction management, and error handling.
 */

const { systemLogger } = require('../utils/logger');
const { Pool } = require('pg');
const crypto = require('crypto');
const {
  createDatabaseError,
  createNotFoundError,
  createValidationError,
  createBusinessLogicError
} = require('../utils/errorHelpers');

class ServiceBase {
  /**
   * Create a new ServiceBase instance
   * 
   * @param {Pool} dbPool - PostgreSQL connection pool (optional, will create if not provided)
   * @param {Object} logger - Logger instance (optional, will use system logger if not provided)
   */
  constructor(dbPool, logger) {
    // Support dependency injection or fall back to defaults
    this.logger = logger || systemLogger;
    
    // Use provided DB pool or create a new one
    this.dbPool = dbPool || new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    
    // Add error handler
    this.dbPool.on('error', (err) => {
      this.logger.error('Unexpected database pool error', { error: err.message });
    });
  }

  /**
   * Execute a database query with error handling and logging
   * 
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Query result
   * @throws {DatabaseError} When the query fails
   */
  async executeQuery(query, params = [], options = {}) {
    const { traceId, shouldLog = true, operation = 'query' } = options;
    
    if (shouldLog) {
      this.logger.debug('Executing database query', { 
        query: query.replace(/\s+/g, ' ').trim(),
        paramsCount: params.length,
        traceId
      });
    }
    
    try {
      const result = await this.dbPool.query(query, params);
      return result;
    } catch (error) {
      this.logger.error('Database query error', { 
        error: error.message,
        query: query.replace(/\s+/g, ' ').trim(),
        paramsCount: params.length,
        traceId
      });
      
      // Throw a standardized database error
      throw createDatabaseError(operation, error);
    }
  }

  /**
   * Execute a transaction with multiple queries
   * 
   * @param {Function} callback - Function that receives a client and executes queries
   * @param {Object} options - Additional options
   * @returns {Promise<any>} Transaction result
   * @throws {DatabaseError} When the transaction fails
   */
  async executeTransaction(callback, options = {}) {
    const { 
      traceId,
      isolationLevel = 'READ COMMITTED', // Default isolation level
      readOnly = false,
      maxRetries = 3,
      retryDelay = 100, // ms
      operation = 'transaction'
    } = options;
    
    const client = await this.dbPool.connect();
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount <= maxRetries) {
      try {
        this.logger.debug('Starting database transaction', { 
          traceId,
          isolationLevel,
          readOnly,
          attempt: retryCount + 1
        });
        
        // Start transaction with specified isolation level
        await client.query('BEGIN');
        
        // Set isolation level and read-only status if needed
        if (isolationLevel) {
          // Validate isolation level to prevent SQL injection
          const validIsolationLevels = ['READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'];
          const normalizedLevel = isolationLevel.toUpperCase().trim();
          
          if (!validIsolationLevels.includes(normalizedLevel)) {
            throw new Error(`Invalid isolation level: ${isolationLevel}`);
          }
          
          await client.query(`SET TRANSACTION ISOLATION LEVEL ${normalizedLevel}`); // NOSONAR S3649 - normalizedLevel is validated against whitelist, no SQL injection risk
        }
        
        if (readOnly) {
          await client.query('SET TRANSACTION READ ONLY');
        }
        
        const result = await callback(client);
        
        await client.query('COMMIT');
        this.logger.debug('Transaction committed successfully', { 
          traceId,
          attempt: retryCount + 1
        });
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Handle serialization failures or deadlocks with retry logic
        const isRetryable = this._isRetryableError(error);
        
        try {
          await client.query('ROLLBACK');
          this.logger.warn('Transaction rolled back', { 
            error: error.message,
            code: error.code,
            traceId,
            attempt: retryCount + 1,
            retryable: isRetryable
          });
        } catch (rollbackError) {
          this.logger.error('Error during transaction rollback', { 
            error: rollbackError.message,
            traceId
          });
        }
        
        // If it's a retryable error and we have retries left, try again
        if (isRetryable && retryCount < maxRetries) {
          retryCount++;
          
          // Exponential backoff for retries
          const delay = retryDelay * Math.pow(2, retryCount - 1);
          this.logger.info('Retrying transaction', { 
            attempt: retryCount + 1,
            delay, 
            traceId
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If it's already our custom error type, just re-throw
        if (error.name && error.name !== 'Error') {
          throw error;
        }
        
        // For other errors, convert to our standardized database error
        throw createDatabaseError(operation, error);
      } finally {
        if (retryCount >= maxRetries) {
          this.logger.error('Transaction failed after max retries', {
            maxRetries,
            traceId,
            error: lastError ? lastError.message : 'Unknown error'
          });
        }
        client.release();
      }
    }
  }
  
  /**
   * Check if an error is retryable for transaction purposes
   * 
   * @private
   * @param {Error} error - The error to check
   * @returns {boolean} Whether the error is retryable
   */
  _isRetryableError(error) {
    if (!error || !error.code) {
      return false;
    }
    
    // PostgreSQL error codes for retryable errors:
    // 40001: serialization_failure
    // 40P01: deadlock_detected
    // 55P03: lock_not_available
    const retryableCodes = ['40001', '40P01', '55P03'];
    
    return retryableCodes.includes(error.code);
  }
  
  /**
   * Execute a read-only transaction (for queries that don't modify data)
   * 
   * @param {Function} callback - Function that receives a client and executes queries
   * @param {Object} options - Additional options
   * @returns {Promise<any>} Transaction result
   */
  async executeReadTransaction(callback, options = {}) {
    return this.executeTransaction(callback, {
      ...options,
      readOnly: true,
      isolationLevel: options.isolationLevel || 'REPEATABLE READ'
    });
  }

  /**
   * Generate a trace ID for request tracking
   * 
   * @returns {string} Trace ID
   */
  generateTraceId() {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(4).toString('hex');
    return `svc_${timestamp}_${randomBytes}`;
  }
  
  /**
   * Create a not found error for a resource
   * 
   * @param {string} resource - Resource type
   * @param {string|number} id - Resource identifier
   * @param {string} [customMessage] - Optional custom message
   * @returns {NotFoundError} Not found error
   */
  createNotFoundError(resource, id, customMessage) {
    return createNotFoundError(resource, id, customMessage);
  }
  
  /**
   * Create a validation error
   * 
   * @param {Object} validationErrors - Validation errors by field
   * @param {string} [customMessage] - Optional custom message
   * @returns {ValidationError} Validation error
   */
  createValidationError(validationErrors, customMessage) {
    return createValidationError(validationErrors, customMessage);
  }
  
  /**
   * Create a business logic error
   * 
   * @param {string} rule - Business rule that was violated
   * @param {string} message - Error message
   * @param {Object} context - Additional context
   * @returns {BusinessLogicError} Business logic error
   */
  createBusinessLogicError(rule, message, context) {
    return createBusinessLogicError(rule, message, context);
  }
}

module.exports = ServiceBase;