const logger = require('../utils/logger');

async function addPatternsColumn(pool) {
  try {
    logger.info('Adding patterns column to file_columns table');
    
    // Add patterns column as JSONB with null default
    await pool.query(`
      ALTER TABLE file_columns 
      ADD COLUMN IF NOT EXISTS patterns JSONB DEFAULT NULL
    `);
    
    // Convert any existing stringified JSON patterns to proper JSONB
    // Use #>> '{}' operator to extract text without quotes, then cast to JSONB
    await pool.query(`
      UPDATE file_columns 
      SET patterns = (patterns #>> '{}')::jsonb
      WHERE patterns IS NOT NULL 
      AND jsonb_typeof(patterns) = 'string'
    `);
    
    logger.info('Successfully added patterns column and cleaned up data');
    console.log('✅ Successfully added patterns column');
    
    return { success: true, message: 'Patterns column added successfully' };
  } catch (error) {
    logger.error('Error adding patterns column', { error: error.message });
    console.error('Error adding patterns column:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { addPatternsColumn };
