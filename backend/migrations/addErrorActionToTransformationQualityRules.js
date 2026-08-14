const { systemLogger } = require('../utils/logger');

/**
 * Migration: Add error_action column to transformation_quality_rules
 * Enables per-rule On Failure action (log_continue / log_warn / log_abort)
 * instead of relying solely on the global violation_handling setting.
 */

async function up(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add error_action column if it doesn't already exist
    await client.query(`
      ALTER TABLE transformation_quality_rules
      ADD COLUMN IF NOT EXISTS error_action VARCHAR(50) NOT NULL DEFAULT 'log_continue'
    `);

    await client.query('COMMIT');
    systemLogger.info('Added error_action column to transformation_quality_rules');
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error adding error_action column to transformation_quality_rules:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function down(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE transformation_quality_rules
      DROP COLUMN IF EXISTS error_action
    `);
    await client.query('COMMIT');
    systemLogger.info('Dropped error_action column from transformation_quality_rules');
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error dropping error_action column from transformation_quality_rules:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
