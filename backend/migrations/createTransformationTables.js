/**
 * Transformation Tables Creation
 * 
 * Creates the tables necessary for storing transformations and their
 * execution history.
 */

const { Pool } = require('pg');
const { systemLogger } = require('../utils/logger');

/**
 * Initialize transformation tables
 * 
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Promise<void>}
 */
async function initTransformationTables(pool) {
  try {
    systemLogger.info('Initializing transformation tables');
    
    // Create transformations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transformations (
        id SERIAL PRIMARY KEY,
        transformation_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        config JSONB DEFAULT '{}',
        input_files JSONB DEFAULT '[]',
        output_format TEXT DEFAULT 'csv',
        enabled BOOLEAN DEFAULT true,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    systemLogger.info('Transformations table initialized');
    
    // Create transformation executions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transformation_executions (
        id SERIAL PRIMARY KEY,
        execution_id TEXT UNIQUE NOT NULL,
        transformation_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TIMESTAMP NOT NULL,
        completed_at TIMESTAMP,
        parameters JSONB DEFAULT '{}',
        result JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    systemLogger.info('Transformation executions table initialized');
    
    // Create transformation output files table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transformation_outputs (
        id SERIAL PRIMARY KEY,
        execution_id TEXT NOT NULL,
        file_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size BIGINT,
        row_count INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    systemLogger.info('Transformation outputs table initialized');
    
    // Create transformation lineage table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transformation_lineage (
        id SERIAL PRIMARY KEY,
        transformation_id TEXT NOT NULL,
        input_file_id TEXT NOT NULL,
        output_file_id TEXT NOT NULL,
        execution_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    systemLogger.info('Transformation lineage table initialized');
    
    systemLogger.info('All transformation tables initialized successfully');
  } catch (error) {
    systemLogger.error('Error initializing transformation tables', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

module.exports = initTransformationTables;