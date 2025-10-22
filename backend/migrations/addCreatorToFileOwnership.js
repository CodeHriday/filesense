const systemLogger = {
  info: (msg) => console.log(`INFO: ${msg}`),
  error: (msg, error) => console.error(`ERROR: ${msg}`, error)
};

async function addCreatorToFileOwnership(pool) {
  try {
    systemLogger.info('Starting file ownership creator columns migration');

    // Add creator_user_id column
    await pool.query(`
      ALTER TABLE file_ownership 
      ADD COLUMN IF NOT EXISTS creator_user_id INTEGER
    `);
    systemLogger.info('✓ Added creator_user_id column to file_ownership table');
    
    // Add creator_name column
    await pool.query(`
      ALTER TABLE file_ownership 
      ADD COLUMN IF NOT EXISTS creator_name VARCHAR(255)
    `);
    systemLogger.info('✓ Added creator_name column to file_ownership table');
    
    // Add creator_email column
    await pool.query(`
      ALTER TABLE file_ownership 
      ADD COLUMN IF NOT EXISTS creator_email VARCHAR(255)
    `);
    systemLogger.info('✓ Added creator_email column to file_ownership table');
    
    systemLogger.info('File ownership creator columns migration completed successfully');
    
    console.log('✅ File ownership creator columns migration completed');
  } catch (error) {
    console.error('Error adding creator columns to file ownership:', error);
    systemLogger.error('Failed to add creator columns to file ownership', error);
    throw error;
  }
}

module.exports = addCreatorToFileOwnership;
