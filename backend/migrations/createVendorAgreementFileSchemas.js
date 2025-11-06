/**
 * Create Vendor Agreement File Schemas Migration
 * Creates table for storing multiple file patterns and schemas per vendor agreement
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting vendor agreement file schemas table migration...');

    // Create vendor_agreement_file_schemas table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_agreement_file_schemas (
        id SERIAL PRIMARY KEY,
        vendor_agreement_id INTEGER NOT NULL REFERENCES vendor_agreements(id) ON DELETE CASCADE,
        
        -- File pattern matching (supports glob patterns: *, ?)
        file_name_pattern VARCHAR(500) NOT NULL,
        file_description TEXT,
        
        -- Schema (stored as JSONB - array of column definitions)
        -- Format: [{"column_name": "id", "data_type": "INTEGER", "precision": null, "scale": null, "nullable": false}, ...]
        schema JSONB NOT NULL,
        
        -- Pattern matching priority (lower number = higher priority)
        -- Used when multiple patterns could match a file
        priority INTEGER DEFAULT 0,
        
        -- Status flag
        is_active BOOLEAN DEFAULT TRUE,
        
        -- Audit fields
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    systemLogger.info('✓ vendor_agreement_file_schemas table created');

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_agreement_file_schemas_agreement_id 
      ON vendor_agreement_file_schemas(vendor_agreement_id);
      
      CREATE INDEX IF NOT EXISTS idx_vendor_agreement_file_schemas_priority 
      ON vendor_agreement_file_schemas(vendor_agreement_id, priority, is_active);
    `);
    systemLogger.info('✓ Indexes created for vendor_agreement_file_schemas');

    // Create trigger to update updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_vendor_agreement_file_schemas_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_update_vendor_agreement_file_schemas_updated_at 
      ON vendor_agreement_file_schemas;
      
      CREATE TRIGGER trigger_update_vendor_agreement_file_schemas_updated_at
      BEFORE UPDATE ON vendor_agreement_file_schemas
      FOR EACH ROW
      EXECUTE FUNCTION update_vendor_agreement_file_schemas_updated_at();
    `);
    systemLogger.info('✓ Created trigger for updated_at timestamp');

    await client.query('COMMIT');
    systemLogger.info('✅ Vendor agreement file schemas table migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Vendor agreement file schemas table migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting vendor agreement file schemas table migration...');

    // Drop trigger
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_vendor_agreement_file_schemas_updated_at 
      ON vendor_agreement_file_schemas;
      
      DROP FUNCTION IF EXISTS update_vendor_agreement_file_schemas_updated_at();
    `);

    // Drop indexes
    await client.query(`
      DROP INDEX IF EXISTS idx_vendor_agreement_file_schemas_agreement_id;
      DROP INDEX IF EXISTS idx_vendor_agreement_file_schemas_priority;
    `);

    // Drop table
    await client.query('DROP TABLE IF EXISTS vendor_agreement_file_schemas CASCADE');

    await client.query('COMMIT');
    systemLogger.info('✅ Vendor agreement file schemas table migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Vendor agreement file schemas table migration revert failed', { error: error.message });
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
