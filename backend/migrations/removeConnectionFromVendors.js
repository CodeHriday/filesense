/**
 * Remove Connection Fields from Vendors Migration
 * Removes vendor_connection_id and drop_location_path from vendors table
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting remove connection from vendors migration...');

    // Remove vendor_connection_id and drop_location_path from vendors table
    await client.query(`
      ALTER TABLE vendors
      DROP COLUMN IF EXISTS vendor_connection_id,
      DROP COLUMN IF EXISTS drop_location_path;
    `);
    systemLogger.info('✓ Removed vendor_connection_id and drop_location_path columns from vendors');

    await client.query('COMMIT');
    systemLogger.info('✅ Remove connection from vendors migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Remove connection from vendors migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting remove connection from vendors migration...');

    // Add columns back
    await client.query(`
      ALTER TABLE vendors
      ADD COLUMN IF NOT EXISTS vendor_connection_id VARCHAR REFERENCES storage_connections(connection_id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS drop_location_path VARCHAR(500);
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Remove connection from vendors migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Remove connection from vendors migration revert failed', { error: error.message });
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
