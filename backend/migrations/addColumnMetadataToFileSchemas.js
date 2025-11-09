/**
 * Add Column Metadata to File Schemas Migration
 * Adds column-level PII tags and metadata to vendor_agreement_file_schemas
 * for tracking PII at the column level through the lineage process
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting column metadata migration...');

    await client.query(`
      ALTER TABLE vendor_agreement_file_schemas
      ADD COLUMN IF NOT EXISTS column_metadata JSONB DEFAULT '{}'::jsonb;
    `);
    systemLogger.info('✓ Added column_metadata JSONB column');

    await client.query(`
      COMMENT ON COLUMN vendor_agreement_file_schemas.column_metadata IS 'Column-level metadata including PII tags, data types, and transformations. Structure: {"column_name": {"contains_pii": true, "pii_type": "identifier|contact|financial|health|demographic", "data_type": "string", "description": "..."}}';
    `);
    systemLogger.info('✓ Added column comment');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_file_schemas_column_metadata 
      ON vendor_agreement_file_schemas USING GIN (column_metadata);
    `);
    systemLogger.info('✓ Created GIN index for column_metadata');

    await client.query('COMMIT');
    systemLogger.info('✅ Column metadata migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Column metadata migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting column metadata migration...');

    await client.query(`
      DROP INDEX IF EXISTS idx_file_schemas_column_metadata;
    `);

    await client.query(`
      ALTER TABLE vendor_agreement_file_schemas
      DROP COLUMN IF EXISTS column_metadata;
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Column metadata migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Column metadata migration revert failed', { error: error.message });
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
