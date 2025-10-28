const pool = require('../db');
const { systemLogger } = require('../utils/logger');

/**
 * Migration: Create vendor_users table
 * Purpose: Store contact information for vendor personnel
 */
async function createVendorUsersTable() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    systemLogger.info('Creating vendor_users table');
    
    // Create vendor_users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_users (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        designation VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id)
      )
    `);
    
    systemLogger.info('✓ vendor_users table created');
    
    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_users_vendor_id 
      ON vendor_users(vendor_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_users_email 
      ON vendor_users(email)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_users_is_active 
      ON vendor_users(is_active)
    `);
    
    systemLogger.info('✓ Created indexes for vendor_users table');
    
    // Create trigger for updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION update_vendor_users_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_vendor_users_updated_at ON vendor_users;
      CREATE TRIGGER trigger_vendor_users_updated_at
        BEFORE UPDATE ON vendor_users
        FOR EACH ROW
        EXECUTE FUNCTION update_vendor_users_updated_at();
    `);
    
    systemLogger.info('✓ Created update trigger for vendor_users');
    
    await client.query('COMMIT');
    systemLogger.info('Vendor users table migration completed successfully');
    
    return {
      success: true,
      message: 'Vendor users table created successfully'
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error creating vendor_users table', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = createVendorUsersTable;
