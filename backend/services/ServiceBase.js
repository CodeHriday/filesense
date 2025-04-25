/**
 * Base Service Class
 * 
 * This is the foundation for all domain-specific services.
 * It provides common functionality like logging, database access,
 * transaction management, and event emitting.
 */

const { systemLogger } = require('../utils/logger');
const { Pool } = require('pg');

class ServiceBase {
  constructor() {
    this.logger = systemLogger;
    this.dbPool = new Pool({
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
   */
  async executeQuery(query, params = [], options = {}) {
    const { traceId, shouldLog = true } = options;
    
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
      throw error;
    }
  }

  /**
   * Execute a transaction with multiple queries
   * 
   * @param {Function} callback - Function that receives a client and executes queries
   * @param {Object} options - Additional options
   * @returns {Promise<any>} Transaction result
   */
  async executeTransaction(callback, options = {}) {
    const { traceId } = options;
    const client = await this.dbPool.connect();
    
    try {
      this.logger.debug('Starting database transaction', { traceId });
      await client.query('BEGIN');
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      this.logger.debug('Transaction committed', { traceId });
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Transaction rolled back', { 
        error: error.message,
        traceId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate a trace ID for request tracking
   * 
   * @returns {string} Trace ID
   */
  generateTraceId() {
    return `svc_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }
}

module.exports = ServiceBase;