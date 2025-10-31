/**
 * Add correlation_id column to files table
 * 
 * This migration adds the correlation_id column to files table to link
 * source and target files from the same transformation job execution.
 */

const { systemLogger } = require('../utils/logger');

async function addCorrelationIdToFiles(client) {
  try {
    systemLogger.info('Starting correlation_id migration for files table');
    await client.query('BEGIN');

    // Add correlation_id column
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'files' AND column_name = 'correlation_id'
        ) THEN
          ALTER TABLE files ADD COLUMN correlation_id VARCHAR(255);
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added correlation_id column to files table');

    // Add index for better query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_files_correlation_id ON files(correlation_id);
    `);
    systemLogger.info('✓ Added index on files.correlation_id');

    await client.query('COMMIT');
    systemLogger.info('✓ Correlation ID migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Correlation ID migration failed:', error);
    throw error;
  }
}

module.exports = addCorrelationIdToFiles;
