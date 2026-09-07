const { systemLogger } = require('../utils/logger');

/**
 * Initialize ETL transformation system tables
 * Includes: mappings, schemas, jobs, logs, profiling, and anomalies
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Promise<void>}
 */
async function initETLTransformationTables(pool) {
  try {
    systemLogger.info('Initializing ETL transformation system tables');
    
    // Create transformation_mappings table - stores complete ETL mapping definitions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transformation_mappings (
        id SERIAL PRIMARY KEY,
        mapping_id VARCHAR(255) UNIQUE NOT NULL,
        mapping_name VARCHAR(255) NOT NULL,
        description TEXT,
        
        -- Source configuration
        source_connection_id INTEGER REFERENCES connections(id) ON DELETE SET NULL,
        source_file_pattern VARCHAR(500) NOT NULL,
        source_schema JSONB,
        
        -- Field mappings with transformations
        field_mappings JSONB NOT NULL DEFAULT '[]',
        
        -- Target configuration
        target_connection_id INTEGER REFERENCES connections(id) ON DELETE SET NULL,
        target_table_name VARCHAR(255),
        target_schema JSONB,
        
        -- Anomaly detection rules
        anomaly_rules JSONB,
        
        -- Metadata
        created_by INTEGER,
        status VARCHAR(50) DEFAULT 'draft',
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_executed_at TIMESTAMP
      );
    `);
    systemLogger.info('✓ transformation_mappings table created');
    
    // Create file_schemas table - stores schema snapshots for each file
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_schemas (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_pattern VARCHAR(500),
        
        -- Schema definition
        schema_definition JSONB NOT NULL,
        schema_hash VARCHAR(64) NOT NULL,
        
        -- Metadata
        row_count BIGINT,
        column_count INTEGER,
        captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(file_id, schema_hash)
      );
    `);
    systemLogger.info('✓ file_schemas table created');
    
    // Create transformation_jobs table - tracks job executions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transformation_jobs (
        id SERIAL PRIMARY KEY,
        job_id VARCHAR(255) UNIQUE NOT NULL,
        mapping_id VARCHAR(255) REFERENCES transformation_mappings(mapping_id) ON DELETE CASCADE,
        mapping_name VARCHAR(255) NOT NULL,
        
        -- Execution details
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        duration_ms BIGINT,
        
        -- Processing stats
        files_processed INTEGER DEFAULT 0,
        rows_read BIGINT DEFAULT 0,
        rows_written BIGINT DEFAULT 0,
        rows_failed BIGINT DEFAULT 0,
        
        -- Results
        error_message TEXT,
        execution_metadata JSONB,
        
        -- Audit
        triggered_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    systemLogger.info('✓ transformation_jobs table created');
    
    // Create transformation_logs table - detailed execution logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transformation_logs (
        id SERIAL PRIMARY KEY,
        job_id VARCHAR(255) NOT NULL,
        log_level VARCHAR(20) NOT NULL,
        log_message TEXT NOT NULL,
        log_details JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (job_id) REFERENCES transformation_jobs(job_id) ON DELETE CASCADE
      );
    `);
    systemLogger.info('✓ transformation_logs table created');
    
    // Create profiling_metrics table - stores profiling data for trend analysis
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiling_metrics (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        mapping_id VARCHAR(255),
        
        -- Metrics
        row_count BIGINT,
        column_count INTEGER,
        numeric_sum JSONB,
        null_counts JSONB,
        data_types JSONB,
        value_distributions JSONB,
        
        -- Quality scores
        completeness_score DECIMAL(5,2),
        consistency_score DECIMAL(5,2),
        validity_score DECIMAL(5,2),
        overall_quality_score DECIMAL(5,2),
        
        -- Metadata
        profiled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        job_id VARCHAR(255)
      );
    `);
    systemLogger.info('✓ profiling_metrics table created');
    
    // Create anomalies table - stores detected anomalies and schema drifts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS anomalies (
        id SERIAL PRIMARY KEY,
        anomaly_id VARCHAR(255) UNIQUE NOT NULL,
        
        -- Source
        file_id VARCHAR(255),
        file_name VARCHAR(500),
        mapping_id VARCHAR(255),
        job_id VARCHAR(255),
        
        -- Anomaly details
        anomaly_type VARCHAR(100) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        anomaly_details JSONB,
        
        -- Thresholds
        expected_value TEXT,
        actual_value TEXT,
        deviation_percentage DECIMAL(10,2),
        
        -- Resolution
        status VARCHAR(50) DEFAULT 'open',
        resolved_at TIMESTAMP,
        resolved_by VARCHAR(255),
        resolution_notes TEXT,
        
        -- Metadata
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    systemLogger.info('✓ anomalies table created');
    
    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transformation_mappings_status ON transformation_mappings(status);
      CREATE INDEX IF NOT EXISTS idx_transformation_mappings_source ON transformation_mappings(source_connection_id);
      CREATE INDEX IF NOT EXISTS idx_transformation_mappings_pattern ON transformation_mappings(source_file_pattern);
      
      CREATE INDEX IF NOT EXISTS idx_file_schemas_file ON file_schemas(file_id);
      CREATE INDEX IF NOT EXISTS idx_file_schemas_pattern ON file_schemas(file_pattern);
      CREATE INDEX IF NOT EXISTS idx_file_schemas_hash ON file_schemas(schema_hash);
      
      CREATE INDEX IF NOT EXISTS idx_transformation_jobs_mapping ON transformation_jobs(mapping_id);
      CREATE INDEX IF NOT EXISTS idx_transformation_jobs_status ON transformation_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_transformation_jobs_start ON transformation_jobs(start_time DESC);
      
      CREATE INDEX IF NOT EXISTS idx_transformation_logs_job ON transformation_logs(job_id);
      CREATE INDEX IF NOT EXISTS idx_transformation_logs_level ON transformation_logs(log_level);
      CREATE INDEX IF NOT EXISTS idx_transformation_logs_timestamp ON transformation_logs(timestamp DESC);
      
      CREATE INDEX IF NOT EXISTS idx_profiling_metrics_file ON profiling_metrics(file_id);
      CREATE INDEX IF NOT EXISTS idx_profiling_metrics_mapping ON profiling_metrics(mapping_id);
      CREATE INDEX IF NOT EXISTS idx_profiling_metrics_date ON profiling_metrics(profiled_at DESC);
      
      CREATE INDEX IF NOT EXISTS idx_anomalies_file ON anomalies(file_id);
      CREATE INDEX IF NOT EXISTS idx_anomalies_mapping ON anomalies(mapping_id);
      CREATE INDEX IF NOT EXISTS idx_anomalies_job ON anomalies(job_id);
      CREATE INDEX IF NOT EXISTS idx_anomalies_type ON anomalies(anomaly_type);
      CREATE INDEX IF NOT EXISTS idx_anomalies_status ON anomalies(status);
      CREATE INDEX IF NOT EXISTS idx_anomalies_detected ON anomalies(detected_at DESC);
    `);
    systemLogger.info('✓ Created indexes for all tables');
    
    // Extend files table to add schema_definition column if it doesn't exist
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'files' AND column_name = 'schema_definition'
        ) THEN
          ALTER TABLE files ADD COLUMN schema_definition JSONB;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Extended files table with schema_definition column');

    // Add quality_rule_columns to transformation_mappings if not present.
    // Stores a {ruleId: columnName} map so VM expression-node column assignments
    // can override a null column_name on the global quality_rules row.
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transformation_mappings' AND column_name = 'quality_rule_columns'
        ) THEN
          ALTER TABLE transformation_mappings ADD COLUMN quality_rule_columns JSONB DEFAULT '{}'::jsonb;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Extended transformation_mappings with quality_rule_columns column');
    
    systemLogger.info('ETL transformation system tables initialized successfully');
    
  } catch (error) {
    systemLogger.error('Error initializing ETL transformation tables:', error);
    throw error;
  }
}

module.exports = initETLTransformationTables;
