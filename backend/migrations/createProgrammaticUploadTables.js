/**
 * Migration: Create Programmatic Upload Tables
 * 
 * Creates tables for:
 * - API tokens for programmatic authentication
 * - Upload batches for tracking bulk uploads
 * - Upload files for per-file status tracking
 */

const { query } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  try {
    systemLogger.info('Creating programmatic upload tables...');

    // Create api_tokens table
    await query(`
      CREATE TABLE IF NOT EXISTS api_tokens (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        token_hash VARCHAR(255) NOT NULL UNIQUE,
        token_prefix VARCHAR(20) NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        scopes JSONB NOT NULL DEFAULT '[]',
        rate_limit INTEGER DEFAULT 100,
        rate_window_hours INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        expires_at TIMESTAMP,
        last_used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id),
        revoked_at TIMESTAMP,
        revoked_by INTEGER REFERENCES users(id),
        metadata JSONB DEFAULT '{}'
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_api_tokens_token_hash 
      ON api_tokens(token_hash)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_api_tokens_user_project 
      ON api_tokens(user_id, project_id)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_api_tokens_active 
      ON api_tokens(is_active, expires_at)
    `);

    systemLogger.info('✓ api_tokens table created');

    // Create upload_batches table
    await query(`
      CREATE TABLE IF NOT EXISTS upload_batches (
        id SERIAL PRIMARY KEY,
        batch_id VARCHAR(100) NOT NULL UNIQUE,
        user_id INTEGER REFERENCES users(id),
        api_token_id INTEGER REFERENCES api_tokens(id),
        project_id INTEGER REFERENCES projects(id),
        target_type VARCHAR(50) NOT NULL,
        target_id INTEGER,
        status VARCHAR(50) DEFAULT 'pending',
        total_files INTEGER DEFAULT 0,
        completed_files INTEGER DEFAULT 0,
        failed_files INTEGER DEFAULT 0,
        total_records BIGINT DEFAULT 0,
        processed_records BIGINT DEFAULT 0,
        failed_records BIGINT DEFAULT 0,
        total_size_bytes BIGINT DEFAULT 0,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_upload_batches_batch_id 
      ON upload_batches(batch_id)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_upload_batches_user_project 
      ON upload_batches(user_id, project_id)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_upload_batches_status 
      ON upload_batches(status, created_at DESC)
    `);

    systemLogger.info('✓ upload_batches table created');

    // Create upload_files table
    await query(`
      CREATE TABLE IF NOT EXISTS upload_files (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(100) NOT NULL UNIQUE,
        batch_id INTEGER REFERENCES upload_batches(id) ON DELETE CASCADE,
        original_filename VARCHAR(500) NOT NULL,
        normalized_filename VARCHAR(500),
        file_type VARCHAR(50),
        file_size_bytes BIGINT,
        mime_type VARCHAR(100),
        target_type VARCHAR(50),
        target_id INTEGER,
        status VARCHAR(50) DEFAULT 'pending',
        phase VARCHAR(100) DEFAULT 'uploaded',
        total_records BIGINT DEFAULT 0,
        processed_records BIGINT DEFAULT 0,
        failed_records BIGINT DEFAULT 0,
        virus_scan_status VARCHAR(50),
        virus_scan_result VARCHAR(255),
        cloud_storage_path VARCHAR(1000),
        cloud_storage_url TEXT,
        catalog_file_id VARCHAR(255),
        etl_job_id VARCHAR(100),
        error_message TEXT,
        error_details JSONB,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        uploaded_at TIMESTAMP DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_upload_files_file_id 
      ON upload_files(file_id)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_upload_files_batch_id 
      ON upload_files(batch_id)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_upload_files_status 
      ON upload_files(status, uploaded_at DESC)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_upload_files_catalog 
      ON upload_files(catalog_file_id)
    `);

    systemLogger.info('✓ upload_files table created');

    // Create upload_file_records table for tracking record-level errors
    await query(`
      CREATE TABLE IF NOT EXISTS upload_file_records (
        id SERIAL PRIMARY KEY,
        upload_file_id INTEGER REFERENCES upload_files(id) ON DELETE CASCADE,
        record_number BIGINT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        error_message TEXT,
        error_code VARCHAR(100),
        row_data JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_upload_file_records_file_status 
      ON upload_file_records(upload_file_id, status)
    `);

    systemLogger.info('✓ upload_file_records table created');

    systemLogger.info('✅ Programmatic upload tables created successfully');
    return true;
  } catch (error) {
    systemLogger.error('Failed to create programmatic upload tables', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

async function down() {
  try {
    systemLogger.info('Dropping programmatic upload tables...');

    await query('DROP TABLE IF EXISTS upload_file_records CASCADE');
    await query('DROP TABLE IF EXISTS upload_files CASCADE');
    await query('DROP TABLE IF EXISTS upload_batches CASCADE');
    await query('DROP TABLE IF EXISTS api_tokens CASCADE');

    systemLogger.info('✅ Programmatic upload tables dropped successfully');
    return true;
  } catch (error) {
    systemLogger.error('Failed to drop programmatic upload tables', {
      error: error.message
    });
    throw error;
  }
}

module.exports = { up, down };
