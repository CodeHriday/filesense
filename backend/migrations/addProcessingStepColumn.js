const { Pool } = require('pg');

const systemLogger = {
  info: (msg) => console.log(`INFO: ${msg}`),
  error: (msg, error) => console.error(`ERROR: ${msg}`, error)
};

async function addProcessingStepColumn(pool) {
  const client = await pool.connect();
  
  try {
    systemLogger.info('Adding processing_step column to files table');
    
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'files' AND column_name = 'processing_step'
        ) THEN
          ALTER TABLE files 
          ADD COLUMN processing_step VARCHAR(50) DEFAULT 'pending';
        END IF;
      END $$;
    `);
    
    systemLogger.info('Processing step column added successfully');
  } catch (error) {
    systemLogger.error('Error adding processing_step column', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { addProcessingStepColumn };
