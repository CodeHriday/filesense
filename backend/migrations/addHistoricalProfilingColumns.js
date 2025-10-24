const { systemLogger } = require('../utils/logger');

/**
 * Add historical profiling columns to support capturing profiles
 * for both source and target files at different points in time
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Promise<void>}
 */
async function addHistoricalProfilingColumns(pool) {
  try {
    console.log('INFO: Starting historical profiling columns migration');
    
    // Add profile_timestamp and file_role to profiling_metrics table
    await pool.query(`
      DO $$ 
      BEGIN
        -- Add profile_timestamp column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'profiling_metrics' AND column_name = 'profile_timestamp'
        ) THEN
          ALTER TABLE profiling_metrics 
          ADD COLUMN profile_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
          
          -- Update existing records to use profiled_at as profile_timestamp
          UPDATE profiling_metrics 
          SET profile_timestamp = profiled_at 
          WHERE profile_timestamp IS NULL;
        END IF;
        
        -- Add file_role column (source/target/adhoc)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'profiling_metrics' AND column_name = 'file_role'
        ) THEN
          ALTER TABLE profiling_metrics 
          ADD COLUMN file_role VARCHAR(20) DEFAULT 'adhoc' CHECK (file_role IN ('source', 'target', 'adhoc'));
          
          -- Set existing records as 'adhoc' (manually uploaded files)
          UPDATE profiling_metrics 
          SET file_role = 'adhoc' 
          WHERE file_role IS NULL;
        END IF;
      END $$;
    `);
    console.log('INFO: ✓ Added profile_timestamp and file_role columns to profiling_metrics');
    
    // Add the same columns to file_columns table for historical column-level profiling
    await pool.query(`
      DO $$ 
      BEGIN
        -- Add profile_timestamp column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'file_columns' AND column_name = 'profile_timestamp'
        ) THEN
          ALTER TABLE file_columns 
          ADD COLUMN profile_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
          
          -- Update existing records
          UPDATE file_columns 
          SET profile_timestamp = created_at 
          WHERE profile_timestamp IS NULL;
        END IF;
        
        -- Add file_role column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'file_columns' AND column_name = 'file_role'
        ) THEN
          ALTER TABLE file_columns 
          ADD COLUMN file_role VARCHAR(20) DEFAULT 'adhoc' CHECK (file_role IN ('source', 'target', 'adhoc'));
          
          UPDATE file_columns 
          SET file_role = 'adhoc' 
          WHERE file_role IS NULL;
        END IF;
      END $$;
    `);
    console.log('INFO: ✓ Added profile_timestamp and file_role columns to file_columns');
    
    // Create composite indexes for efficient historical queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_profiling_metrics_file_timestamp 
      ON profiling_metrics(file_id, profile_timestamp DESC);
      
      CREATE INDEX IF NOT EXISTS idx_profiling_metrics_job_role 
      ON profiling_metrics(job_id, file_role);
      
      CREATE INDEX IF NOT EXISTS idx_file_columns_file_timestamp 
      ON file_columns(file_id, profile_timestamp DESC);
      
      CREATE INDEX IF NOT EXISTS idx_file_columns_job_role 
      ON file_columns(job_id, file_role) WHERE job_id IS NOT NULL;
    `);
    console.log('INFO: ✓ Created indexes for historical profiling queries');
    
    console.log('INFO: Historical profiling columns migration completed successfully');
    console.log('✅ Historical profiling columns migration completed');
    
  } catch (error) {
    console.error('ERROR: Historical profiling columns migration failed:', error);
    throw error;
  }
}

module.exports = addHistoricalProfilingColumns;
