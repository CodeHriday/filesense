const { Pool } = require('pg');
const { systemLogger } = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function addVendorIdToUsers() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    systemLogger.info('Starting vendor_id column migration for users table');
    
    // Check if vendor_id column already exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'vendor_id'
    `);
    
    if (columnCheck.rows.length > 0) {
      systemLogger.info('vendor_id column already exists in users table');
      await client.query('COMMIT');
      return {
        success: true,
        backfilledUsers: 0,
        alreadyExists: true
      };
    }
    
    // Add vendor_id column to users table
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL
    `);
    
    systemLogger.info('✓ Added vendor_id column to users table');
    
    // Backfill vendor_id for existing vendor users
    // Set vendor_id for users who are the primary contact of a vendor
    const backfillResult = await client.query(`
      UPDATE users u
      SET vendor_id = v.id
      FROM vendors v
      WHERE u.id = v.vendor_user_id
        AND u.internal_user = false 
        AND u.user_type = 'Vendor'
    `);
    
    systemLogger.info(`✓ Backfilled vendor_id for ${backfillResult.rowCount} primary contact users`);
    
    // Create index on vendor_id for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_vendor_id ON users(vendor_id)
    `);
    
    systemLogger.info('✓ Created index on users.vendor_id');
    
    await client.query('COMMIT');
    systemLogger.info('Vendor_id column migration completed successfully');
    
    return {
      success: true,
      backfilledUsers: backfillResult.rowCount
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error during vendor_id column migration', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = addVendorIdToUsers;

// Run migration if called directly
if (require.main === module) {
  addVendorIdToUsers()
    .then((result) => {
      console.log('✅ Vendor_id column migration completed successfully');
      console.log(`Backfilled ${result.backfilledUsers} users`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Vendor_id column migration failed:', error);
      process.exit(1);
    });
}
