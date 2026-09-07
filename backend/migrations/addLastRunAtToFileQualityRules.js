const { systemLogger } = require('../utils/logger');

/**
 * Migration: Add last_run_at to file_quality_rules
 * Enables the API to distinguish "ran and passed" from "never ran",
 * so the frontend shows a "Not Run" badge instead of a false PASSED badge
 * for rules that have been saved but not yet executed.
 */

async function up(pool) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    systemLogger.info('Adding last_run_at column to file_quality_rules');

    await client.query(`
      ALTER TABLE file_quality_rules
      ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
    `);

    await client.query('COMMIT');
    systemLogger.info('last_run_at column added to file_quality_rules');
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error adding last_run_at to file_quality_rules:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function down(pool) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    systemLogger.info('Dropping last_run_at column from file_quality_rules');

    await client.query(`
      ALTER TABLE file_quality_rules
      DROP COLUMN IF EXISTS last_run_at
    `);

    await client.query('COMMIT');
    systemLogger.info('last_run_at column dropped from file_quality_rules');
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error dropping last_run_at from file_quality_rules:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
