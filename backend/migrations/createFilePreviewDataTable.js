const logger = require('../utils/logger');

async function createFilePreviewDataTable(pool) {
  try {
    logger.info('Starting file_preview_data table migration', { service: 'data-observatory-api' });

    // Create file_preview_data table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_preview_data (
        preview_id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        row_number INTEGER NOT NULL,
        row_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_file_preview_file 
          FOREIGN KEY (file_id) 
          REFERENCES files(file_id) 
          ON DELETE CASCADE,
        CONSTRAINT unique_file_row 
          UNIQUE (file_id, row_number)
      )
    `);

    logger.info('✓ file_preview_data table created', { service: 'data-observatory-api' });

    // Create indexes for better query performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_file_preview_data_file_id 
      ON file_preview_data(file_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_file_preview_data_created_at 
      ON file_preview_data(created_at)
    `);

    logger.info('✓ Created indexes for file_preview_data table', { service: 'data-observatory-api' });

    logger.info('File preview data table initialized successfully', { service: 'data-observatory-api' });
    console.log('✅ File preview data table migration completed');
    
    return { success: true, message: 'File preview data table migration completed' };
  } catch (error) {
    logger.error('Error creating file_preview_data table', { 
      service: 'data-observatory-api',
      error: error.message,
      stack: error.stack
    });
    console.error('❌ File preview data table migration failed:', error.message);
    throw error;
  }
}

module.exports = createFilePreviewDataTable;
