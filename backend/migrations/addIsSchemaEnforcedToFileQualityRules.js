const { systemLogger } = require('../utils/logger');

/**
 * Migration: Add is_schema_enforced to file_quality_rules
 *
 * Adds a boolean flag that the schema rule enforcer sets to TRUE when it links
 * a quality rule to a file automatically via contract-schema enforcement.
 * Used by the UI to render the "Contract" badge on rules applied by the enforcer,
 * even when those rules are real named rules (not phantom __schema_default__ rows).
 *
 * Default is FALSE so existing manually-assigned associations are unaffected.
 */

async function up(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    systemLogger.info('Adding is_schema_enforced column to file_quality_rules');

    await client.query(`
      ALTER TABLE file_quality_rules
      ADD COLUMN IF NOT EXISTS is_schema_enforced BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await client.query('COMMIT');
    systemLogger.info('is_schema_enforced column added to file_quality_rules');
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error adding is_schema_enforced to file_quality_rules:', error);
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
      ALTER TABLE file_quality_rules
      DROP COLUMN IF EXISTS is_schema_enforced
    `);

    await client.query('COMMIT');
    systemLogger.info('is_schema_enforced column dropped from file_quality_rules');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
