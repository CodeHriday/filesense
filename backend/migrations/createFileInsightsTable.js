const { systemLogger } = require('../utils/logger');

/**
 * Initialize File Insights tables for time-series metric tracking
 * Supports daily aggregations with weekly/monthly/yearly rollups
 * Implements 18-month retention policy
 * 
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Promise<void>}
 */
async function initFileInsightsTables(pool) {
  try {
    systemLogger.info('Initializing file insights tables');
    
    // Add retention_until columns to existing tables for 18-month retention
    await pool.query(`
      DO $$ 
      BEGIN
        -- Add retention_until to profiling_metrics
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'profiling_metrics' AND column_name = 'retention_until'
        ) THEN
          ALTER TABLE profiling_metrics 
          ADD COLUMN retention_until TIMESTAMP DEFAULT NOW() + INTERVAL '18 months';
        END IF;
        
        -- Add retention_until to file_columns if not exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'file_columns') THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'file_columns' AND column_name = 'retention_until'
          ) THEN
            ALTER TABLE file_columns 
            ADD COLUMN retention_until TIMESTAMP DEFAULT NOW() + INTERVAL '18 months';
          END IF;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added retention_until columns');
    
    // Create file_pattern_metrics table for daily aggregations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_pattern_metrics (
        id SERIAL PRIMARY KEY,
        
        -- Pattern identification
        file_pattern VARCHAR(500) NOT NULL,
        metric_date DATE NOT NULL,
        
        -- Aggregate metrics
        record_count BIGINT DEFAULT 0,
        file_count INTEGER DEFAULT 1,
        duplicate_count BIGINT DEFAULT 0,
        duplicate_percentage DECIMAL(5,2) DEFAULT 0,
        
        -- Null counts per column (JSONB: {column_name: null_count})
        null_counts JSONB DEFAULT '{}',
        null_percentages JSONB DEFAULT '{}',
        
        -- Numeric field statistics (JSONB: {column_name: {sum, avg, min, max, count}})
        numeric_stats JSONB DEFAULT '{}',
        
        -- String field ranges (JSONB: {column_name: {min_length, max_length, avg_length}})
        string_stats JSONB DEFAULT '{}',
        
        -- Quality scores
        completeness_score DECIMAL(5,2),
        consistency_score DECIMAL(5,2),
        validity_score DECIMAL(5,2),
        overall_quality_score DECIMAL(5,2),
        
        -- Alert flags
        has_alerts BOOLEAN DEFAULT false,
        alert_count INTEGER DEFAULT 0,
        
        -- Metadata
        column_count INTEGER,
        data_types JSONB DEFAULT '{}',
        retention_until TIMESTAMP DEFAULT NOW() + INTERVAL '18 months',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(file_pattern, metric_date)
      );
    `);
    systemLogger.info('✓ file_pattern_metrics table created');
    
    // Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_file_pattern_metrics_pattern ON file_pattern_metrics(file_pattern);
      CREATE INDEX IF NOT EXISTS idx_file_pattern_metrics_date ON file_pattern_metrics(metric_date DESC);
      CREATE INDEX IF NOT EXISTS idx_file_pattern_metrics_pattern_date ON file_pattern_metrics(file_pattern, metric_date DESC);
      CREATE INDEX IF NOT EXISTS idx_file_pattern_metrics_retention ON file_pattern_metrics(retention_until);
      CREATE INDEX IF NOT EXISTS idx_file_pattern_metrics_alerts ON file_pattern_metrics(has_alerts, file_pattern);
    `);
    systemLogger.info('✓ Created indexes for file_pattern_metrics');
    
    // Create materialized view for weekly aggregations
    await pool.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS file_pattern_metrics_weekly AS
      SELECT 
        file_pattern,
        DATE_TRUNC('week', metric_date)::DATE AS week_start,
        SUM(record_count) AS total_records,
        SUM(file_count) AS total_files,
        SUM(duplicate_count) AS total_duplicates,
        AVG(duplicate_percentage) AS avg_duplicate_percentage,
        jsonb_object_agg(
          metric_date::TEXT, 
          null_counts
        ) FILTER (WHERE null_counts IS NOT NULL) AS daily_null_counts,
        jsonb_object_agg(
          metric_date::TEXT,
          numeric_stats
        ) FILTER (WHERE numeric_stats IS NOT NULL) AS daily_numeric_stats,
        AVG(completeness_score) AS avg_completeness_score,
        AVG(consistency_score) AS avg_consistency_score,
        AVG(validity_score) AS avg_validity_score,
        AVG(overall_quality_score) AS avg_overall_quality_score,
        BOOL_OR(has_alerts) AS has_alerts,
        SUM(alert_count) AS total_alerts,
        MAX(updated_at) AS last_updated
      FROM file_pattern_metrics
      GROUP BY file_pattern, DATE_TRUNC('week', metric_date)
      WITH DATA;
      
      CREATE UNIQUE INDEX IF NOT EXISTS idx_file_pattern_metrics_weekly_pattern_week 
      ON file_pattern_metrics_weekly(file_pattern, week_start DESC);
    `);
    systemLogger.info('✓ Created weekly aggregation materialized view');
    
    // Create materialized view for monthly aggregations
    await pool.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS file_pattern_metrics_monthly AS
      SELECT 
        file_pattern,
        DATE_TRUNC('month', metric_date)::DATE AS month_start,
        SUM(record_count) AS total_records,
        SUM(file_count) AS total_files,
        SUM(duplicate_count) AS total_duplicates,
        AVG(duplicate_percentage) AS avg_duplicate_percentage,
        jsonb_object_agg(
          TO_CHAR(metric_date, 'YYYY-MM-DD'), 
          null_counts
        ) FILTER (WHERE null_counts IS NOT NULL) AS daily_null_counts,
        jsonb_object_agg(
          TO_CHAR(metric_date, 'YYYY-MM-DD'),
          numeric_stats
        ) FILTER (WHERE numeric_stats IS NOT NULL) AS daily_numeric_stats,
        AVG(completeness_score) AS avg_completeness_score,
        AVG(consistency_score) AS avg_consistency_score,
        AVG(validity_score) AS avg_validity_score,
        AVG(overall_quality_score) AS avg_overall_quality_score,
        BOOL_OR(has_alerts) AS has_alerts,
        SUM(alert_count) AS total_alerts,
        MAX(updated_at) AS last_updated
      FROM file_pattern_metrics
      GROUP BY file_pattern, DATE_TRUNC('month', metric_date)
      WITH DATA;
      
      CREATE UNIQUE INDEX IF NOT EXISTS idx_file_pattern_metrics_monthly_pattern_month 
      ON file_pattern_metrics_monthly(file_pattern, month_start DESC);
    `);
    systemLogger.info('✓ Created monthly aggregation materialized view');
    
    // Create trigger function to refresh materialized views
    await pool.query(`
      CREATE OR REPLACE FUNCTION refresh_file_pattern_metrics_views()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Refresh weekly view concurrently (non-blocking)
        REFRESH MATERIALIZED VIEW CONCURRENTLY file_pattern_metrics_weekly;
        
        -- Refresh monthly view concurrently (non-blocking)
        REFRESH MATERIALIZED VIEW CONCURRENTLY file_pattern_metrics_monthly;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      
      DROP TRIGGER IF EXISTS trigger_refresh_file_pattern_metrics_views ON file_pattern_metrics;
      
      CREATE TRIGGER trigger_refresh_file_pattern_metrics_views
      AFTER INSERT OR UPDATE ON file_pattern_metrics
      FOR EACH STATEMENT
      EXECUTE FUNCTION refresh_file_pattern_metrics_views();
    `);
    systemLogger.info('✓ Created auto-refresh trigger for materialized views');
    
    systemLogger.info('File insights tables initialized successfully');
    
  } catch (error) {
    systemLogger.error('Error initializing file insights tables:', error);
    throw error;
  }
}

module.exports = initFileInsightsTables;
