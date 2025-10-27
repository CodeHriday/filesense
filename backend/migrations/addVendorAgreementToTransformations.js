/**
 * Add vendor_agreement_id to transformation_mappings table
 * Allows transformation mappings to be linked to vendor agreements
 * Makes source_connection_id and vendor_agreement_id mutually exclusive
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Adding vendor_agreement_id to transformation_mappings table...');

    // Add vendor_agreement_id column to transformation_mappings
    await client.query(`
      ALTER TABLE transformation_mappings 
      ADD COLUMN IF NOT EXISTS vendor_agreement_id INTEGER REFERENCES vendor_agreements(id) ON DELETE SET NULL;
    `);
    systemLogger.info('✓ Added vendor_agreement_id column');

    // Make source_connection_id nullable (if not already) in transformation_mappings
    await client.query(`
      ALTER TABLE transformation_mappings 
      ALTER COLUMN source_connection_id DROP NOT NULL;
    `);
    systemLogger.info('✓ Made source_connection_id nullable');

    // Add check constraint to ensure mutual exclusivity
    // Either source_connection_id OR vendor_agreement_id must be set, but not both
    await client.query(`
      ALTER TABLE transformation_mappings 
      ADD CONSTRAINT transformation_mappings_source_exclusivity 
      CHECK (
        (source_connection_id IS NOT NULL AND vendor_agreement_id IS NULL) OR
        (source_connection_id IS NULL AND vendor_agreement_id IS NOT NULL)
      );
    `);
    systemLogger.info('✓ Added mutual exclusivity constraint');

    // Create index for vendor_agreement_id
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transformation_mappings_vendor_agreement_id 
      ON transformation_mappings(vendor_agreement_id);
    `);
    systemLogger.info('✓ Created index on vendor_agreement_id');

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
    systemLogger.info('Reverting vendor_agreement_id migration...');

    // Drop constraint
    await client.query(`
      ALTER TABLE transformation_mappings 
      DROP CONSTRAINT IF EXISTS transformation_mappings_source_exclusivity;
    `);

    // Drop index
    await client.query(`
      DROP INDEX IF EXISTS idx_transformation_mappings_vendor_agreement_id;
    `);

    // Drop column
    await client.query(`
      ALTER TABLE transformation_mappings 
      DROP COLUMN IF EXISTS vendor_agreement_id;
    `);

    // Make source_connection_id required again
    await client.query(`
      ALTER TABLE transformation_mappings 
      ALTER COLUMN source_connection_id SET NOT NULL;
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
