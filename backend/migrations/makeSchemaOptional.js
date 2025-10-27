/**
 * Make schema column optional in vendor_agreements table
 * Allows agreements to be created without a schema and populated later
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Making schema column optional in vendor_agreements table...');

    // Alter the schema column to allow NULL values
    await client.query(`
      ALTER TABLE vendor_agreements 
      ALTER COLUMN schema DROP NOT NULL;
    `);
    
    systemLogger.info('✓ Schema column is now optional');

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
    systemLogger.info('Reverting: Making schema column required again...');

    // First, update any NULL schemas to empty array
    await client.query(`
      UPDATE vendor_agreements 
      SET schema = '[]'::jsonb 
      WHERE schema IS NULL;
    `);
    
    // Then make it required again
    await client.query(`
      ALTER TABLE vendor_agreements 
      ALTER COLUMN schema SET NOT NULL;
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
