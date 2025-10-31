const { systemLogger } = require('../utils/logger');

/**
 * Initialize logical file groups tables for cross-upload schema tracking
 * Enables tracking schema evolution across multiple uploads of the same file
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Promise<void>}
 */
async function initLogicalFileGroupsTables(pool) {
  try {
    systemLogger.info('Initializing logical file groups tables');
    
    // Create logical_file_groups table - groups uploads of the same logical file
    await pool.query(`
      CREATE TABLE IF NOT EXISTS logical_file_groups (
        id SERIAL PRIMARY KEY,
        logical_file_id VARCHAR(255) UNIQUE NOT NULL,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        
        -- Canonical filename (normalized, no timestamps)
        canonical_name VARCHAR(500) NOT NULL,
        
        -- Optional pattern metadata for matching vendor files
        file_pattern VARCHAR(500),
        pattern_metadata JSONB,
        
        -- Tracking
        first_upload_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_upload_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        upload_count INTEGER DEFAULT 0,
        
        -- Schema change detection
        has_schema_changes BOOLEAN DEFAULT false,
        last_schema_change_at TIMESTAMP,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(project_id, canonical_name)
      );
    `);
    systemLogger.info('✓ logical_file_groups table created');
    
    // Add logical_file_id column to files table if it doesn't exist
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'files' AND column_name = 'logical_file_id'
        ) THEN
          ALTER TABLE files ADD COLUMN logical_file_id VARCHAR(255) REFERENCES logical_file_groups(logical_file_id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added logical_file_id column to files table');
    
    // Add logical_file_id column to file_schemas table if it doesn't exist
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'file_schemas' AND column_name = 'logical_file_id'
        ) THEN
          ALTER TABLE file_schemas ADD COLUMN logical_file_id VARCHAR(255) REFERENCES logical_file_groups(logical_file_id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added logical_file_id column to file_schemas table');
    
    // Create indexes for efficient querying
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_logical_file_groups_project ON logical_file_groups(project_id);
      CREATE INDEX IF NOT EXISTS idx_logical_file_groups_canonical ON logical_file_groups(canonical_name);
      CREATE INDEX IF NOT EXISTS idx_logical_file_groups_pattern ON logical_file_groups(file_pattern);
      CREATE INDEX IF NOT EXISTS idx_logical_file_groups_changes ON logical_file_groups(has_schema_changes) WHERE has_schema_changes = true;
      
      CREATE INDEX IF NOT EXISTS idx_files_logical_file ON files(logical_file_id);
      CREATE INDEX IF NOT EXISTS idx_file_schemas_logical_file ON file_schemas(logical_file_id, captured_at DESC);
    `);
    systemLogger.info('✓ Created indexes for logical file groups');
    
    systemLogger.info('Logical file groups tables initialized successfully');
    
  } catch (error) {
    systemLogger.error('Error initializing logical file groups tables:', error);
    throw error;
  }
}

module.exports = initLogicalFileGroupsTables;
