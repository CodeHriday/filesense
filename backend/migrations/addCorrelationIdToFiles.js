/**
 * Add correlation_id and file_role columns to files table
 * 
 * This migration adds:
 * - correlation_id: Links source and target files from the same transformation job execution
 * - file_role: Identifies whether a file is 'source' or 'target' in a transformation
 */

const { systemLogger } = require('../utils/logger');

async function addCorrelationIdToFiles(client) {
  try {
    systemLogger.info('Starting correlation_id and file_role migration for files table');
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

    // Add file_role column
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'files' AND column_name = 'file_role'
        ) THEN
          ALTER TABLE files ADD COLUMN file_role VARCHAR(50);
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added file_role column to files table');

    // Add indexes for better query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_files_correlation_id ON files(correlation_id);
    `);
    systemLogger.info('✓ Added index on files.correlation_id');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_files_file_role ON files(file_role);
    `);
    systemLogger.info('✓ Added index on files.file_role');

    await client.query('COMMIT');
    systemLogger.info('✓ Correlation ID and file_role migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Correlation ID and file_role migration failed:', error);
    throw error;
  }
}

module.exports = addCorrelationIdToFiles;
