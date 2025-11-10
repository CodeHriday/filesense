const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function addSoftDeleteToConnections() {
  try {
    console.log('Adding soft delete columns to storage_connections table');
    systemLogger?.info?.('Adding soft delete columns to storage_connections table');
    
    await pool.query(`
      ALTER TABLE storage_connections
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
    `);
    
    console.log('Successfully added soft delete columns to storage_connections');
    systemLogger?.info?.('Successfully added soft delete columns to storage_connections');
    
    return { success: true, message: 'Soft delete columns added successfully' };
  } catch (error) {
    console.error('Error adding soft delete columns:', error);
    systemLogger?.error?.('Error adding soft delete columns', { 
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

if (require.main === module) {
  addSoftDeleteToConnections()
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = addSoftDeleteToConnections;
