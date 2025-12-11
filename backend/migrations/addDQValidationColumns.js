const { systemLogger } = require('../utils/logger');

/**
 * Migration: Add DQ validation columns to schema validation tables
 * Adds dq_violation_count, dq_error_count, and dq_passed columns
 */

async function up(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    systemLogger.info('Adding DQ validation columns to schema_validation_jobs table');
    
    await client.query(`
      ALTER TABLE schema_validation_jobs 
      ADD COLUMN IF NOT EXISTS dq_violation_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS dq_rules_executed INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS dq_rules_passed INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS dq_enabled BOOLEAN DEFAULT TRUE
    `);
    
    systemLogger.info('Adding DQ validation columns to schema_validation_job_files table');
    
    await client.query(`
      ALTER TABLE schema_validation_job_files 
      ADD COLUMN IF NOT EXISTS dq_violation_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS dq_rules_executed INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS dq_rules_passed INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS dq_status VARCHAR(20) DEFAULT NULL
    `);
    
    await client.query(`
      COMMENT ON COLUMN schema_validation_job_files.dq_status IS 'DQ validation status: passed, failed, skipped, error'
    `);
    
    await client.query('COMMIT');
    systemLogger.info('DQ validation columns added successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error adding DQ validation columns:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function down(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    systemLogger.info('Removing DQ validation columns');
    
    await client.query(`
      ALTER TABLE schema_validation_jobs 
      DROP COLUMN IF EXISTS dq_violation_count,
      DROP COLUMN IF EXISTS dq_rules_executed,
      DROP COLUMN IF EXISTS dq_rules_passed,
      DROP COLUMN IF EXISTS dq_enabled
    `);
    
    await client.query(`
      ALTER TABLE schema_validation_job_files 
      DROP COLUMN IF EXISTS dq_violation_count,
      DROP COLUMN IF EXISTS dq_rules_executed,
      DROP COLUMN IF EXISTS dq_rules_passed,
      DROP COLUMN IF EXISTS dq_status
    `);
    
    await client.query('COMMIT');
    systemLogger.info('DQ validation columns removed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error removing DQ validation columns:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
