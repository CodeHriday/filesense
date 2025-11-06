/**
 * Add Sub-Project to Vendor Agreements Migration
 * Adds sub_project_id column to vendor_agreements table for organizational hierarchy
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting add sub-project to vendor agreements migration...');

    // Check if column already exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vendor_agreements' 
      AND column_name = 'sub_project_id'
    `);
    
    if (columnCheck.rows.length > 0) {
      systemLogger.info('⏭️  sub_project_id column already exists in vendor_agreements');
      await client.query('COMMIT');
      return;
    }

    // Add sub_project_id column to vendor_agreements table
    // Note: Sub-projects are stored in the projects table with parent_id set
    await client.query(`
      ALTER TABLE vendor_agreements
      ADD COLUMN sub_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
    `);
    systemLogger.info('✓ Added sub_project_id column to vendor_agreements');

    // Create index for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_agreements_sub_project_id 
      ON vendor_agreements(sub_project_id);
    `);
    systemLogger.info('✓ Created index on sub_project_id');

    await client.query('COMMIT');
    systemLogger.info('✅ Add sub-project to vendor agreements migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Add sub-project to vendor agreements migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting add sub-project to vendor agreements migration...');

    // Drop index
    await client.query(`
      DROP INDEX IF EXISTS idx_vendor_agreements_sub_project_id;
    `);

    // Remove column
    await client.query(`
      ALTER TABLE vendor_agreements
      DROP COLUMN IF EXISTS sub_project_id;
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Add sub-project to vendor agreements migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Add sub-project to vendor agreements migration revert failed', { error: error.message });
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
