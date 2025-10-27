/**
 * Add Project to Vendor Agreements Migration
 * Adds project_id column to vendor_agreements table and populates from vendors
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting add project to vendor agreements migration...');

    // Add project_id column to vendor_agreements table
    await client.query(`
      ALTER TABLE vendor_agreements
      ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
    `);
    systemLogger.info('✓ Added project_id column to vendor_agreements');

    // Backfill project_id from vendors table
    await client.query(`
      UPDATE vendor_agreements va
      SET project_id = v.project_id
      FROM vendors v
      WHERE va.vendor_id = v.id
      AND va.project_id IS NULL;
    `);
    systemLogger.info('✓ Backfilled project_id from vendors table');

    // Create index for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_agreements_project_id ON vendor_agreements(project_id);
    `);
    systemLogger.info('✓ Created index on project_id');

    await client.query('COMMIT');
    systemLogger.info('✅ Add project to vendor agreements migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Add project to vendor agreements migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting add project to vendor agreements migration...');

    // Drop index
    await client.query(`
      DROP INDEX IF EXISTS idx_vendor_agreements_project_id;
    `);

    // Remove column
    await client.query(`
      ALTER TABLE vendor_agreements
      DROP COLUMN IF EXISTS project_id;
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Add project to vendor agreements migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Add project to vendor agreements migration revert failed', { error: error.message });
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
