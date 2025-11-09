/**
 * Add Source and Target Metadata to Transformation Lineage Migration
 * Adds source/target owner, path, and agreement information to track data lineage properly
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting transformation lineage source/target metadata migration...');

    await client.query(`
      ALTER TABLE transformation_lineage
      ADD COLUMN IF NOT EXISTS source_owner TEXT,
      ADD COLUMN IF NOT EXISTS target_owner TEXT,
      ADD COLUMN IF NOT EXISTS source_path TEXT,
      ADD COLUMN IF NOT EXISTS target_path TEXT,
      ADD COLUMN IF NOT EXISTS source_agreement_name TEXT;
    `);
    systemLogger.info('✓ Added source_owner, target_owner, source_path, target_path, source_agreement_name columns');

    await client.query(`
      COMMENT ON COLUMN transformation_lineage.source_owner IS 'Owner of the source file - from vendor agreement primary contact (if vendor source) or from mapping source config (if regular connection)';
    `);
    await client.query(`
      COMMENT ON COLUMN transformation_lineage.target_owner IS 'Owner of the target file - from mapping target configuration';
    `);
    await client.query(`
      COMMENT ON COLUMN transformation_lineage.source_path IS 'Path to source file - vendor drop location (if vendor source) or connection path (if regular connection)';
    `);
    await client.query(`
      COMMENT ON COLUMN transformation_lineage.target_path IS 'Path to target file - from mapping target configuration';
    `);
    await client.query(`
      COMMENT ON COLUMN transformation_lineage.source_agreement_name IS 'Vendor agreement name - only populated if source is from vendor agreement';
    `);
    systemLogger.info('✓ Added column comments');

    await client.query('COMMIT');
    systemLogger.info('✅ Transformation lineage source/target metadata migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Transformation lineage source/target metadata migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting transformation lineage source/target metadata migration...');

    await client.query(`
      ALTER TABLE transformation_lineage
      DROP COLUMN IF EXISTS source_owner,
      DROP COLUMN IF EXISTS target_owner,
      DROP COLUMN IF EXISTS source_path,
      DROP COLUMN IF EXISTS target_path,
      DROP COLUMN IF EXISTS source_agreement_name;
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Transformation lineage source/target metadata migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Transformation lineage source/target metadata migration revert failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };

if (require.main === module) {
  up()
    .then(() => {
      systemLogger.info('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      systemLogger.error('Migration failed', { error: error.message });
      process.exit(1);
    });
}
