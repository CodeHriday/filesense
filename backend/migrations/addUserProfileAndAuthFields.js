/**
 * Migration: Add user profile fields, auth provider fields, and security fields
 * This supports hybrid authentication (local + Okta SSO) and enhanced security
 */

const pool = require('../db');

async function addUserProfileAndAuthFields() {
  const client = await pool.connect();
  
  try {
    console.log('INFO: Starting user profile and auth fields migration');
    
    await client.query('BEGIN');
    
    // Add profile fields
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
        ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
        ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
        ADD COLUMN IF NOT EXISTS city VARCHAR(100),
        ADD COLUMN IF NOT EXISTS state VARCHAR(100),
        ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
        ADD COLUMN IF NOT EXISTS country VARCHAR(100)
    `);
    console.log('INFO: ✓ Added profile fields');
    
    // Add auth provider fields
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'local',
        ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)
    `);
    console.log('INFO: ✓ Added auth provider fields');
    
    // Add security fields for local users
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP,
        ADD COLUMN IF NOT EXISTS password_history JSONB DEFAULT '[]'::jsonb
    `);
    console.log('INFO: ✓ Added security fields');
    
    // Make password nullable for Okta users
    await client.query(`
      ALTER TABLE users
        ALTER COLUMN password DROP NOT NULL
    `);
    console.log('INFO: ✓ Made password field nullable for Okta users');
    
    // Add unique constraint on external_id for SSO users
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_id 
      ON users(external_id) 
      WHERE external_id IS NOT NULL
    `);
    console.log('INFO: ✓ Created unique index on external_id');
    
    // Add index on auth_provider for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_auth_provider 
      ON users(auth_provider)
    `);
    console.log('INFO: ✓ Created index on auth_provider');
    
    // Add trigger to compute full_name from first, middle, last name
    await client.query(`
      CREATE OR REPLACE FUNCTION update_full_name()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.full_name := TRIM(CONCAT_WS(' ', 
          NEW.first_name, 
          NEW.middle_name, 
          NEW.last_name
        ));
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_full_name ON users;
      CREATE TRIGGER trigger_update_full_name
      BEFORE INSERT OR UPDATE OF first_name, middle_name, last_name ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_full_name();
    `);
    console.log('INFO: ✓ Created trigger to auto-compute full_name');
    
    await client.query('COMMIT');
    console.log('✅ User profile and auth fields migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('ERROR: User profile and auth fields migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addUserProfileAndAuthFields;

// Run migration if executed directly
if (require.main === module) {
  addUserProfileAndAuthFields()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
