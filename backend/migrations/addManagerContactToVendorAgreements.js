/**
 * Add Manager Contact to Vendor Agreements Migration
 * Adds manager_contact column to vendor_agreements table
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting add manager contact to vendor agreements migration...');

    // Add manager_contact column to vendor_agreements table
    await client.query(`
      ALTER TABLE vendor_agreements
      ADD COLUMN IF NOT EXISTS manager_contact TEXT;
    `);
    systemLogger.info('✓ Added manager_contact column to vendor_agreements');

    await client.query('COMMIT');
    systemLogger.info('✅ Add manager contact to vendor agreements migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Add manager contact to vendor agreements migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting add manager contact to vendor agreements migration...');

    // Remove column
    await client.query(`
      ALTER TABLE vendor_agreements
      DROP COLUMN IF EXISTS manager_contact;
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Add manager contact to vendor agreements migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Add manager contact to vendor agreements migration revert failed', { error: error.message });
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
