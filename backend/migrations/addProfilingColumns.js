const { Pool } = require('pg');

const systemLogger = {
  info: (msg) => console.log(`INFO: ${msg}`),
  error: (msg, error) => console.error(`ERROR: ${msg}`, error)
};

async function addProfilingColumns(pool) {
  const client = await pool.connect();
  
  try {
    systemLogger.info('Adding profiling columns to file_columns table');
    
    await client.query(`
      ALTER TABLE file_columns 
      ADD COLUMN IF NOT EXISTS most_frequent_count INTEGER,
      ADD COLUMN IF NOT EXISTS least_frequent_count INTEGER,
      ADD COLUMN IF NOT EXISTS min_frequency INTEGER,
      ADD COLUMN IF NOT EXISTS max_frequency INTEGER,
      ADD COLUMN IF NOT EXISTS min_is_frequent BOOLEAN,
      ADD COLUMN IF NOT EXISTS max_is_frequent BOOLEAN
    `);
    
    systemLogger.info('Profiling columns migration completed successfully');
  } catch (error) {
    systemLogger.error('Error adding profiling columns', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { addProfilingColumns };
