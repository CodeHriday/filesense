/**
 * Migration: Add Additional Stakeholders to Vendor Agreements
 * 
 * Adds support for additional notification recipients:
 * - additional_stakeholder_user_ids: Array of internal user IDs
 * - additional_stakeholder_group_ids: Array of access group IDs
 * 
 * These users/groups will receive notifications when the agreement is updated.
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting additional stakeholders migration...');

    // Add additional_stakeholder_user_ids column (JSONB array of user IDs)
    await client.query(`
      ALTER TABLE vendor_agreements
      ADD COLUMN IF NOT EXISTS additional_stakeholder_user_ids JSONB DEFAULT '[]'::jsonb;
    `);
    systemLogger.info('✓ Added additional_stakeholder_user_ids column');

    // Add additional_stakeholder_group_ids column (JSONB array of group IDs)
    await client.query(`
      ALTER TABLE vendor_agreements
      ADD COLUMN IF NOT EXISTS additional_stakeholder_group_ids JSONB DEFAULT '[]'::jsonb;
    `);
    systemLogger.info('✓ Added additional_stakeholder_group_ids column');

    // Create index for querying agreements by stakeholder user
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_agreements_stakeholder_users 
      ON vendor_agreements USING GIN (additional_stakeholder_user_ids);
    `);
    systemLogger.info('✓ Created GIN index for stakeholder user IDs');

    // Create index for querying agreements by stakeholder group
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_agreements_stakeholder_groups 
      ON vendor_agreements USING GIN (additional_stakeholder_group_ids);
    `);
    systemLogger.info('✓ Created GIN index for stakeholder group IDs');

    await client.query('COMMIT');
    systemLogger.info('✅ Additional stakeholders migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Additional stakeholders migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting additional stakeholders migration...');

    await client.query(`
      DROP INDEX IF EXISTS idx_vendor_agreements_stakeholder_groups;
    `);
    
    await client.query(`
      DROP INDEX IF EXISTS idx_vendor_agreements_stakeholder_users;
    `);

    await client.query(`
      ALTER TABLE vendor_agreements
      DROP COLUMN IF EXISTS additional_stakeholder_group_ids;
    `);

    await client.query(`
      ALTER TABLE vendor_agreements
      DROP COLUMN IF EXISTS additional_stakeholder_user_ids;
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Additional stakeholders migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Additional stakeholders migration revert failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };

// Run migration if executed directly
if (require.main === module) {
  up()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
