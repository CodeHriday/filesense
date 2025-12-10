/**
 * Migration: Create schema validation jobs tables
 * Tables for fast schema validation without database storage
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_validation_jobs (
        id SERIAL PRIMARY KEY,
        job_name VARCHAR(255) NOT NULL,
        project_id INTEGER REFERENCES projects(id),
        connection_id INTEGER,
        vendor_agreement_id INTEGER REFERENCES vendor_agreements(id),
        s3_path TEXT,
        file_pattern VARCHAR(255) DEFAULT '*',
        recursive BOOLEAN DEFAULT false,
        
        -- Execution and scheduling
        execution_type VARCHAR(50) DEFAULT 'manual',
        schedule_type VARCHAR(50),
        cron_expression VARCHAR(100),
        schedule_start_date TIMESTAMPTZ,
        next_run_at TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT true,
        
        -- Status and progress
        status VARCHAR(50) DEFAULT 'pending',
        total_files INTEGER DEFAULT 0,
        processed_count INTEGER DEFAULT 0,
        valid_count INTEGER DEFAULT 0,
        invalid_count INTEGER DEFAULT 0,
        
        -- Timing
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        
        -- Results
        report_path TEXT,
        error_message TEXT,
        
        -- Audit
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_validation_job_files (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES schema_validation_jobs(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        validation_result JSONB,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_schema_validation_jobs_status 
      ON schema_validation_jobs(status)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_schema_validation_jobs_project 
      ON schema_validation_jobs(project_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_schema_validation_job_files_job 
      ON schema_validation_job_files(job_id)
    `);

    await client.query('COMMIT');
    
    systemLogger.info('Schema validation jobs tables created successfully');
    return { success: true };

  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error creating schema validation jobs tables', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    await client.query('DROP TABLE IF EXISTS schema_validation_job_files CASCADE');
    await client.query('DROP TABLE IF EXISTS schema_validation_jobs CASCADE');
    
    await client.query('COMMIT');
    
    systemLogger.info('Schema validation jobs tables dropped successfully');
    return { success: true };

  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error dropping schema validation jobs tables', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
