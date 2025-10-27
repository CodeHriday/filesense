/**
 * Fix source_connection_id column to support both integer and UUID connections
 * Vendor connections use UUID strings while transform connections use integers
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Fixing source_connection_id column type for vendor connections...');

    // Drop the existing constraint
    await client.query(`
      ALTER TABLE transformation_mappings 
      DROP CONSTRAINT IF EXISTS transformation_mappings_source_exclusivity;
    `);
    systemLogger.info('✓ Dropped existing constraint');

    // Change source_connection_id from INTEGER to VARCHAR to support UUIDs
    await client.query(`
      ALTER TABLE transformation_mappings 
      ALTER COLUMN source_connection_id TYPE VARCHAR(255);
    `);
    systemLogger.info('✓ Changed source_connection_id to VARCHAR(255)');

    // Re-add the mutual exclusivity constraint
    await client.query(`
      ALTER TABLE transformation_mappings 
      ADD CONSTRAINT transformation_mappings_source_exclusivity 
      CHECK (
        (source_connection_id IS NOT NULL AND vendor_agreement_id IS NULL) OR
        (source_connection_id IS NULL AND vendor_agreement_id IS NOT NULL)
      );
    `);
    systemLogger.info('✓ Re-added mutual exclusivity constraint');

    await client.query('COMMIT');
    systemLogger.info('✅ Migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting source_connection_id type change...');

    // Drop constraint
    await client.query(`
      ALTER TABLE transformation_mappings 
      DROP CONSTRAINT IF EXISTS transformation_mappings_source_exclusivity;
    `);

    // Change back to INTEGER (this will fail if there are UUID values)
    await client.query(`
      ALTER TABLE transformation_mappings 
      ALTER COLUMN source_connection_id TYPE INTEGER USING source_connection_id::INTEGER;
    `);

    // Re-add constraint
    await client.query(`
      ALTER TABLE transformation_mappings 
      ADD CONSTRAINT transformation_mappings_source_exclusivity 
      CHECK (
        (source_connection_id IS NOT NULL AND vendor_agreement_id IS NULL) OR
        (source_connection_id IS NULL AND vendor_agreement_id IS NOT NULL)
      );
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Migration revert failed', { error: error.message });
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
      systemLogger.info('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      systemLogger.error('Migration failed:', error);
      process.exit(1);
    });
}
