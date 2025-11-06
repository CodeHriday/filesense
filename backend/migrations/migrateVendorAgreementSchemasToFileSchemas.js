/**
 * Migrate Vendor Agreement Schemas to File Schemas Migration
 * Copies existing file_name and schema from vendor_agreements to vendor_agreement_file_schemas
 * This preserves backward compatibility when moving to multi-schema support
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting migration of vendor agreement schemas to file schemas table...');

    // Check if vendor_agreement_file_schemas table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'vendor_agreement_file_schemas'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      systemLogger.info('⏭️  vendor_agreement_file_schemas table does not exist yet, skipping migration');
      await client.query('COMMIT');
      return;
    }

    // Check if migration has already been run by looking for existing entries
    const existingCheck = await client.query(`
      SELECT COUNT(*) as count FROM vendor_agreement_file_schemas;
    `);
    
    if (existingCheck.rows[0].count > 0) {
      systemLogger.info('⏭️  vendor_agreement_file_schemas already has data, skipping migration');
      await client.query('COMMIT');
      return;
    }

    // Migrate existing file_name and schema from vendor_agreements
    // Only migrate agreements that have both file_name and schema defined
    const result = await client.query(`
      INSERT INTO vendor_agreement_file_schemas (
        vendor_agreement_id,
        file_name_pattern,
        file_description,
        schema,
        priority,
        is_active,
        created_by,
        created_at
      )
      SELECT 
        id as vendor_agreement_id,
        file_name as file_name_pattern,
        file_description,
        schema,
        0 as priority,
        TRUE as is_active,
        created_by,
        created_at
      FROM vendor_agreements
      WHERE file_name IS NOT NULL 
      AND file_name != ''
      AND schema IS NOT NULL
      AND jsonb_array_length(schema) > 0
      RETURNING id;
    `);
    
    const migratedCount = result.rowCount;
    systemLogger.info(`✓ Migrated ${migratedCount} vendor agreement schemas to file schemas table`);

    await client.query('COMMIT');
    systemLogger.info('✅ Vendor agreement schemas migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Vendor agreement schemas migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting vendor agreement schemas migration...');

    // Clear all entries from vendor_agreement_file_schemas
    // Note: This assumes the table was empty before the migration
    await client.query(`
      DELETE FROM vendor_agreement_file_schemas;
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Vendor agreement schemas migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Vendor agreement schemas migration revert failed', { error: error.message });
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
