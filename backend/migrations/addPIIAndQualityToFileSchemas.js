/**
 * Add PII, Data Classification, File Type, and Quality Rules to File Schemas Migration
 * Adds file-level data governance and quality rule associations to vendor_agreement_file_schemas
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting file schema data governance fields migration...');

    // Add new columns for data governance and quality rules
    await client.query(`
      ALTER TABLE vendor_agreement_file_schemas
      ADD COLUMN IF NOT EXISTS contains_pii BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS data_classification VARCHAR(50),
      ADD COLUMN IF NOT EXISTS file_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS quality_rule_ids JSONB DEFAULT '[]'::jsonb;
    `);
    systemLogger.info('✓ Added PII, classification, file type, and quality rule columns');

    // Add comment for documentation
    await client.query(`
      COMMENT ON COLUMN vendor_agreement_file_schemas.contains_pii IS 'Indicates if this file pattern contains Personally Identifiable Information';
      COMMENT ON COLUMN vendor_agreement_file_schemas.data_classification IS 'Data classification level: Public, Internal, Confidential, Highly Confidential';
      COMMENT ON COLUMN vendor_agreement_file_schemas.file_type IS 'File type: csv, json, xml, xlsx, parquet';
      COMMENT ON COLUMN vendor_agreement_file_schemas.quality_rule_ids IS 'Array of quality rule IDs that apply to this file pattern';
    `);
    systemLogger.info('✓ Added column comments');

    // Create index for quality rule lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_file_schemas_quality_rules 
      ON vendor_agreement_file_schemas USING GIN (quality_rule_ids);
    `);
    systemLogger.info('✓ Created GIN index for quality_rule_ids');

    await client.query('COMMIT');
    systemLogger.info('✅ File schema data governance fields migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ File schema data governance fields migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting file schema data governance fields migration...');

    // Drop index
    await client.query(`
      DROP INDEX IF EXISTS idx_file_schemas_quality_rules;
    `);

    // Remove columns
    await client.query(`
      ALTER TABLE vendor_agreement_file_schemas
      DROP COLUMN IF EXISTS contains_pii,
      DROP COLUMN IF EXISTS data_classification,
      DROP COLUMN IF EXISTS file_type,
      DROP COLUMN IF EXISTS quality_rule_ids;
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ File schema data governance fields migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ File schema data governance fields migration revert failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };

// Run migration if called directly
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
