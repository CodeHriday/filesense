const { Pool } = require('pg');

const systemLogger = {
  info: (msg) => console.log(`INFO: ${msg}`),
  error: (msg, error) => console.error(`ERROR: ${msg}`, error)
};

async function expandNumericColumns(pool) {
  const client = await pool.connect();
  
  try {
    systemLogger.info('Expanding numeric columns in file_columns table from numeric(10,2) to numeric(30,6)');
    
    // Alter the min_value_decimal and max_value_decimal columns to support larger numbers
    await client.query(`
      ALTER TABLE file_columns 
      ALTER COLUMN min_value_decimal TYPE numeric(30,6),
      ALTER COLUMN max_value_decimal TYPE numeric(30,6)
    `);
    
    systemLogger.info('Numeric columns expansion completed successfully');
  } catch (error) {
    systemLogger.error('Error expanding numeric columns', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { expandNumericColumns };
