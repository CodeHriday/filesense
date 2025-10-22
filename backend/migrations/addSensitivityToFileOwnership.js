const systemLogger = {
  info: (msg) => console.log(`INFO: ${msg}`),
  error: (msg, error) => console.error(`ERROR: ${msg}`, error)
};

async function addSensitivityToFileOwnership(dbPool) {
  
  try {
    systemLogger.info('Starting file ownership sensitivity column migration');
    
    await dbPool.query(`
      ALTER TABLE file_ownership 
      ADD COLUMN IF NOT EXISTS sensitivity_level VARCHAR(50) DEFAULT 'Public'
    `);
    
    systemLogger.info('✓ Added sensitivity_level column to file_ownership table');
    
    console.log('✅ File ownership sensitivity column migration completed');
    systemLogger.info('File ownership sensitivity column migration completed successfully');
  } catch (error) {
    console.error('Error adding sensitivity column:', error);
    systemLogger.error('Failed to add sensitivity column', { error: error.message });
    throw error;
  }
}

module.exports = addSensitivityToFileOwnership;
