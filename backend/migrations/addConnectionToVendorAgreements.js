/**
 * Add Connection Fields to Vendor Agreements Migration
 * Moves vendor_connection_id and drop_location_path from vendors to vendor_agreements
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting add connection to vendor agreements migration...');

    // Add vendor_connection_id and drop_location_path to vendor_agreements table
    await client.query(`
      ALTER TABLE vendor_agreements
      ADD COLUMN IF NOT EXISTS vendor_connection_id VARCHAR REFERENCES storage_connections(connection_id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS drop_location_path VARCHAR(500);
    `);
    systemLogger.info('✓ Added vendor_connection_id and drop_location_path columns to vendor_agreements');

    // Create index for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_agreements_connection_id ON vendor_agreements(vendor_connection_id);
    `);
    systemLogger.info('✓ Created index on vendor_connection_id');

    await client.query('COMMIT');
    systemLogger.info('✅ Add connection to vendor agreements migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Add connection to vendor agreements migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting add connection to vendor agreements migration...');

    // Drop index
    await client.query('DROP INDEX IF EXISTS idx_vendor_agreements_connection_id');
    
    // Remove columns
    await client.query(`
      ALTER TABLE vendor_agreements
      DROP COLUMN IF EXISTS vendor_connection_id,
      DROP COLUMN IF EXISTS drop_location_path;
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Add connection to vendor agreements migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Add connection to vendor agreements migration revert failed', { error: error.message });
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
