/**
 * Enhanced Vendor Management Migration
 * Adds vendor type, onboarding date, contact fields, and data classification fields
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting enhanced vendor management migration...');

    // Add columns to vendors table
    await client.query(`
      ALTER TABLE vendors
      ADD COLUMN IF NOT EXISTS vendor_onboarding_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS vendor_type VARCHAR(100);
    `);
    systemLogger.info('✓ Added vendor_onboarding_date and vendor_type to vendors table');

    // Rename columns in vendor_agreements table
    await client.query(`
      ALTER TABLE vendor_agreements
      RENAME COLUMN file_creator TO vendor_department_team;
    `);
    systemLogger.info('✓ Renamed file_creator to vendor_department_team');

    await client.query(`
      ALTER TABLE vendor_agreements
      RENAME COLUMN vendor_contact TO primary_contact_name;
    `);
    systemLogger.info('✓ Renamed vendor_contact to primary_contact_name');

    // Add primary contact fields to vendor_agreements table
    await client.query(`
      ALTER TABLE vendor_agreements
      ADD COLUMN IF NOT EXISTS primary_contact_phone VARCHAR(50),
      ADD COLUMN IF NOT EXISTS primary_contact_email VARCHAR(255),
      ADD COLUMN IF NOT EXISTS primary_contact_designation VARCHAR(255);
    `);
    systemLogger.info('✓ Added primary contact fields');

    // Add secondary contact fields to vendor_agreements table
    await client.query(`
      ALTER TABLE vendor_agreements
      ADD COLUMN IF NOT EXISTS secondary_contact_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS secondary_contact_phone VARCHAR(50),
      ADD COLUMN IF NOT EXISTS secondary_contact_email VARCHAR(255),
      ADD COLUMN IF NOT EXISTS secondary_contact_designation VARCHAR(255);
    `);
    systemLogger.info('✓ Added secondary contact fields');

    // Add data classification fields to vendor_agreements table
    await client.query(`
      ALTER TABLE vendor_agreements
      ADD COLUMN IF NOT EXISTS contains_pii BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS file_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS data_classification VARCHAR(50) CHECK (data_classification IN ('Public', 'Private', 'Confidential') OR data_classification IS NULL),
      ADD COLUMN IF NOT EXISTS domain VARCHAR(255),
      ADD COLUMN IF NOT EXISTS retention_days INTEGER,
      ADD COLUMN IF NOT EXISTS expected_arrival_time VARCHAR(50),
      ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(100);
    `);
    systemLogger.info('✓ Added data classification fields');

    await client.query('COMMIT');
    systemLogger.info('✅ Enhanced vendor management migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Enhanced vendor management migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting enhanced vendor management migration...');

    // Remove columns from vendors table
    await client.query(`
      ALTER TABLE vendors
      DROP COLUMN IF EXISTS vendor_onboarding_date,
      DROP COLUMN IF EXISTS vendor_type;
    `);

    // Rename columns back in vendor_agreements table
    await client.query(`
      ALTER TABLE vendor_agreements
      RENAME COLUMN vendor_department_team TO file_creator;
    `);

    await client.query(`
      ALTER TABLE vendor_agreements
      RENAME COLUMN primary_contact_name TO vendor_contact;
    `);

    // Remove new columns from vendor_agreements table
    await client.query(`
      ALTER TABLE vendor_agreements
      DROP COLUMN IF EXISTS primary_contact_phone,
      DROP COLUMN IF EXISTS primary_contact_email,
      DROP COLUMN IF EXISTS primary_contact_designation,
      DROP COLUMN IF EXISTS secondary_contact_name,
      DROP COLUMN IF EXISTS secondary_contact_phone,
      DROP COLUMN IF EXISTS secondary_contact_email,
      DROP COLUMN IF EXISTS secondary_contact_designation,
      DROP COLUMN IF EXISTS contains_pii,
      DROP COLUMN IF EXISTS file_type,
      DROP COLUMN IF EXISTS data_classification,
      DROP COLUMN IF EXISTS domain,
      DROP COLUMN IF EXISTS retention_days,
      DROP COLUMN IF EXISTS expected_arrival_time,
      DROP COLUMN IF EXISTS delivery_method;
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Enhanced vendor management migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Enhanced vendor management migration revert failed', { error: error.message });
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
