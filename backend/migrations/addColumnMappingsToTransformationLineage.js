/**
 * Add Column Mappings to Transformation Lineage Migration
 * Adds column-level transformation tracking including PII tag propagation
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting transformation lineage column mappings migration...');

    await client.query(`
      ALTER TABLE transformation_lineage
      ADD COLUMN IF NOT EXISTS column_mappings JSONB DEFAULT '[]'::jsonb;
    `);
    systemLogger.info('✓ Added column_mappings JSONB column');

    await client.query(`
      COMMENT ON COLUMN transformation_lineage.column_mappings IS 'Column-level transformation mappings including PII tag propagation. Structure: [{"source_column": "email", "target_column": "customer_email", "contains_pii": true, "pii_type": "contact", "transformation_applied": "lowercase"}]';
    `);
    systemLogger.info('✓ Added column comment');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transformation_lineage_column_mappings 
      ON transformation_lineage USING GIN (column_mappings);
    `);
    systemLogger.info('✓ Created GIN index for column_mappings');

    await client.query('COMMIT');
    systemLogger.info('✅ Transformation lineage column mappings migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Transformation lineage column mappings migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting transformation lineage column mappings migration...');

    await client.query(`
      DROP INDEX IF EXISTS idx_transformation_lineage_column_mappings;
    `);

    await client.query(`
      ALTER TABLE transformation_lineage
      DROP COLUMN IF EXISTS column_mappings;
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Transformation lineage column mappings migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Transformation lineage column mappings migration revert failed', { error: error.message });
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
