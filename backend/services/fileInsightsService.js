const { systemLogger } = require('../utils/logger');

/**
 * File Insights Service
 * Handles aggregation and retrieval of file pattern metrics over time
 */
class FileInsightsService {
  constructor(dbPool) {
    this.pool = dbPool;
  }

  /**
   * Extract file pattern from filename (group similar files)
   * Examples: orders_2024-01-15.csv -> orders*.csv
   *          users_sample_A.json -> users_sample*.json
   */
  extractFilePattern(filename) {
    if (!filename) return null;
    
    // Remove common date patterns, timestamps, and version suffixes
    let pattern = filename
      .replace(/_\d{4}-\d{2}-\d{2}/g, '*') // dates like _2024-01-15
      .replace(/_\d{8}/g, '*') // dates like _20240115
      .replace(/_\d{14}/g, '*') // timestamps like _20240115120000
      .replace(/_v?\d+(\.\d+)*/g, '*') // versions like _v1.0 or _2
      .replace(/_[A-Z](?=\.)/g, '*') // single letter suffixes like _A
      .replace(/_sample_[A-Z]/g, '_sample*') // sample variations
      .replace(/_trans_\d+/g, '_trans*') // transformation IDs
      .replace(/_fallback/g, '*'); // fallback suffixes
    
    return pattern;
  }

  /**
   * Check if a column is likely an ID field (to be excluded from numeric stats)
   */
  isIdField(columnName, uniqueCount, rowCount) {
    if (!columnName) return false;
    
    const namePattern = /^.*(id|key|code|number|num)$/i;
    const isHighCardinality = uniqueCount / rowCount > 0.9; // >90% unique
    
    return namePattern.test(columnName) || isHighCardinality;
  }

  /**
   * Aggregate daily metrics from profiling_metrics and file_columns tables
   * Should be run daily via scheduled job
   */
  async aggregateDailyMetrics(targetDate = new Date()) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const dateStr = targetDate.toISOString().split('T')[0];
      
      systemLogger.info('Starting daily metrics aggregation', { date: dateStr });
      
      // Get all files profiled on target date
      const filesResult = await client.query(`
        SELECT 
          f.file_id,
          f.filename,
          f.file_type,
          f.row_count,
          f.column_count,
          f.duplicate_records_count,
          f.duplicate_records_percentage,
          f.quality_score,
          pm.profiled_at,
          pm.null_counts,
          pm.numeric_sum,
          pm.completeness_score,
          pm.consistency_score,
          pm.validity_score,
          pm.overall_quality_score
        FROM files f
        LEFT JOIN profiling_metrics pm ON pm.file_id = f.file_id
        WHERE DATE(COALESCE(pm.profiled_at, f.processed_at)) = $1
        ORDER BY f.filename
      `, [dateStr]);
      
      systemLogger.info(`Found ${filesResult.rows.length} files for aggregation`);
      
      // Group files by pattern
      const patternGroups = {};
      
      for (const file of filesResult.rows) {
        const pattern = this.extractFilePattern(file.filename);
        if (!pattern) continue;
        
        if (!patternGroups[pattern]) {
          patternGroups[pattern] = [];
        }
        patternGroups[pattern].push(file);
      }
      
      systemLogger.info(`Grouped into ${Object.keys(patternGroups).length} patterns`);
      
      // Aggregate metrics for each pattern
      for (const [pattern, files] of Object.entries(patternGroups)) {
        const metrics = await this.aggregatePatternMetrics(client, pattern, files, dateStr);
        
        // Upsert into file_pattern_metrics
        await client.query(`
          INSERT INTO file_pattern_metrics (
            file_pattern,
            metric_date,
            record_count,
            file_count,
            duplicate_count,
            duplicate_percentage,
            null_counts,
            null_percentages,
            numeric_stats,
            string_stats,
            completeness_score,
            consistency_score,
            validity_score,
            overall_quality_score,
            column_count,
            data_types,
            has_alerts,
            alert_count,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()
          )
          ON CONFLICT (file_pattern, metric_date)
          DO UPDATE SET
            record_count = EXCLUDED.record_count,
            file_count = EXCLUDED.file_count,
            duplicate_count = EXCLUDED.duplicate_count,
            duplicate_percentage = EXCLUDED.duplicate_percentage,
            null_counts = EXCLUDED.null_counts,
            null_percentages = EXCLUDED.null_percentages,
            numeric_stats = EXCLUDED.numeric_stats,
            string_stats = EXCLUDED.string_stats,
            completeness_score = EXCLUDED.completeness_score,
            consistency_score = EXCLUDED.consistency_score,
            validity_score = EXCLUDED.validity_score,
            overall_quality_score = EXCLUDED.overall_quality_score,
            column_count = EXCLUDED.column_count,
            data_types = EXCLUDED.data_types,
            has_alerts = EXCLUDED.has_alerts,
            alert_count = EXCLUDED.alert_count,
            updated_at = NOW()
        `, [
          pattern,
          dateStr,
          metrics.record_count,
          metrics.file_count,
          metrics.duplicate_count,
          metrics.duplicate_percentage,
          JSON.stringify(metrics.null_counts),
          JSON.stringify(metrics.null_percentages),
          JSON.stringify(metrics.numeric_stats),
          JSON.stringify(metrics.string_stats),
          metrics.completeness_score,
          metrics.consistency_score,
          metrics.validity_score,
          metrics.overall_quality_score,
          metrics.column_count,
          JSON.stringify(metrics.data_types),
          metrics.has_alerts,
          metrics.alert_count
        ]);
      }
      
      await client.query('COMMIT');
      
      systemLogger.info('Daily metrics aggregation completed', { 
        date: dateStr,
        patterns: Object.keys(patternGroups).length 
      });
      
      return {
        success: true,
        date: dateStr,
        patterns_processed: Object.keys(patternGroups).length,
        files_processed: filesResult.rows.length
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error aggregating daily metrics', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Aggregate metrics for a single file pattern
   */
  async aggregatePatternMetrics(client, pattern, files, dateStr) {
    const metrics = {
      record_count: 0,
      file_count: files.length,
      duplicate_count: 0,
      duplicate_percentage: 0,
      null_counts: {},
      null_percentages: {},
      numeric_stats: {},
      string_stats: {},
      completeness_score: 0,
      consistency_score: 0,
      validity_score: 0,
      overall_quality_score: 0,
      column_count: 0,
      data_types: {},
      has_alerts: false,
      alert_count: 0
    };
    
    // Aggregate basic metrics across files
    for (const file of files) {
      metrics.record_count += file.row_count || 0;
      metrics.duplicate_count += file.duplicate_records_count || 0;
      
      if (file.null_counts) {
        for (const [col, count] of Object.entries(file.null_counts)) {
          metrics.null_counts[col] = (metrics.null_counts[col] || 0) + count;
        }
      }
    }
    
    // Calculate averages
    const fileCount = files.length || 1;
    metrics.duplicate_percentage = files.reduce((sum, f) => sum + (parseFloat(f.duplicate_records_percentage) || 0), 0) / fileCount;
    metrics.completeness_score = files.reduce((sum, f) => sum + (parseFloat(f.completeness_score) || 0), 0) / fileCount;
    metrics.consistency_score = files.reduce((sum, f) => sum + (parseFloat(f.consistency_score) || 0), 0) / fileCount;
    metrics.validity_score = files.reduce((sum, f) => sum + (parseFloat(f.validity_score) || 0), 0) / fileCount;
    metrics.overall_quality_score = files.reduce((sum, f) => sum + (parseFloat(f.overall_quality_score) || 0), 0) / fileCount;
    
    // Get column-level details from first file (assuming schema is consistent)
    if (files.length > 0) {
      const firstFile = files[0];
      metrics.column_count = firstFile.column_count || 0;
      
      // Get detailed column stats
      const columnsResult = await client.query(`
        SELECT 
          column_name,
          column_type,
          null_count,
          unique_count,
          min_value,
          max_value,
          min_value_decimal,
          max_value_decimal
        FROM file_columns
        WHERE file_id = $1
        ORDER BY column_index
      `, [firstFile.file_id]);
      
      for (const col of columnsResult.rows) {
        metrics.data_types[col.column_name] = col.column_type;
        
        // Calculate null percentages
        if (metrics.record_count > 0) {
          const nullCount = metrics.null_counts[col.column_name] || 0;
          metrics.null_percentages[col.column_name] = ((nullCount / metrics.record_count) * 100).toFixed(2);
        }
        
        // Skip ID fields for numeric stats
        if (this.isIdField(col.column_name, col.unique_count, firstFile.row_count)) {
          continue;
        }
        
        // Aggregate numeric stats (excluding ID fields)
        if (col.column_type === 'numeric' || col.column_type === 'integer' || col.column_type === 'float') {
          metrics.numeric_stats[col.column_name] = {
            min: col.min_value_decimal,
            max: col.max_value_decimal,
            // Sum and avg will be calculated from file numeric_sum if available
          };
          
          // Try to get sum/avg from profiling_metrics
          if (firstFile.numeric_sum && firstFile.numeric_sum[col.column_name]) {
            metrics.numeric_stats[col.column_name].sum = firstFile.numeric_sum[col.column_name];
            metrics.numeric_stats[col.column_name].avg = (firstFile.numeric_sum[col.column_name] / firstFile.row_count).toFixed(2);
          }
        }
        
        // Aggregate string stats
        if (col.column_type === 'string' || col.column_type === 'text' || col.column_type === 'varchar') {
          const minLen = col.min_value ? col.min_value.length : 0;
          const maxLen = col.max_value ? col.max_value.length : 0;
          
          metrics.string_stats[col.column_name] = {
            min_length: minLen,
            max_length: maxLen,
            avg_length: Math.round((minLen + maxLen) / 2)
          };
        }
      }
    }
    
    // Check for alerts on this pattern
    const alertsResult = await client.query(`
      SELECT COUNT(*) as count
      FROM anomalies
      WHERE file_name ~ $1
        AND status = 'open'
        AND DATE(detected_at) = $2
    `, [pattern.replace(/\*/g, '.*'), dateStr]);
    
    metrics.alert_count = parseInt(alertsResult.rows[0]?.count || 0);
    metrics.has_alerts = metrics.alert_count > 0;
    
    return metrics;
  }

  /**
   * Get list of all file patterns with basic stats
   */
  async getFilePatterns(limit = 100, offset = 0) {
    const result = await this.pool.query(`
      SELECT 
        file_pattern,
        COUNT(DISTINCT metric_date) as days_tracked,
        MAX(metric_date) as last_metric_date,
        SUM(file_count) as total_files,
        AVG(overall_quality_score) as avg_quality_score,
        BOOL_OR(has_alerts) as has_alerts,
        SUM(alert_count) as total_alerts
      FROM file_pattern_metrics
      GROUP BY file_pattern
      ORDER BY has_alerts DESC, last_metric_date DESC, file_pattern
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    return result.rows;
  }

  /**
   * Get time-series metrics for a specific pattern
   */
  async getPatternMetrics(pattern, granularity = 'daily', rangeInDays = 30) {
    let query, params;
    
    if (granularity === 'daily') {
      query = `
        SELECT *
        FROM file_pattern_metrics
        WHERE file_pattern = $1
          AND metric_date >= CURRENT_DATE - INTERVAL '${rangeInDays} days'
        ORDER BY metric_date DESC
      `;
      params = [pattern];
    } else if (granularity === 'weekly') {
      query = `
        SELECT *
        FROM file_pattern_metrics_weekly
        WHERE file_pattern = $1
          AND week_start >= CURRENT_DATE - INTERVAL '${rangeInDays} days'
        ORDER BY week_start DESC
      `;
      params = [pattern];
    } else if (granularity === 'monthly') {
      query = `
        SELECT *
        FROM file_pattern_metrics_monthly
        WHERE file_pattern = $1
          AND month_start >= CURRENT_DATE - INTERVAL '${rangeInDays} days'
        ORDER BY month_start DESC
      `;
      params = [pattern];
    } else {
      throw new Error(`Invalid granularity: ${granularity}`);
    }
    
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get alerts for a specific file pattern
   */
  async getPatternAlerts(pattern, limit = 50) {
    const result = await this.pool.query(`
      SELECT 
        anomaly_id,
        file_name,
        anomaly_type,
        severity,
        title,
        description,
        anomaly_details,
        expected_value,
        actual_value,
        deviation_percentage,
        status,
        detected_at
      FROM anomalies
      WHERE file_name ~ $1
      ORDER BY detected_at DESC
      LIMIT $2
    `, [pattern.replace(/\*/g, '.*'), limit]);
    
    return result.rows;
  }

  /**
   * Clean up records older than 18 months
   */
  async cleanupOldRecords() {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete from file_pattern_metrics
      const metricsResult = await client.query(`
        DELETE FROM file_pattern_metrics
        WHERE retention_until < NOW()
        RETURNING file_pattern, metric_date
      `);
      
      // Delete from profiling_metrics
      const profilingResult = await client.query(`
        DELETE FROM profiling_metrics
        WHERE retention_until IS NOT NULL AND retention_until < NOW()
      `);
      
      // Delete from file_columns
      const columnsResult = await client.query(`
        DELETE FROM file_columns
        WHERE retention_until IS NOT NULL AND retention_until < NOW()
      `);
      
      await client.query('COMMIT');
      
      systemLogger.info('Cleanup completed', {
        metrics_deleted: metricsResult.rowCount,
        profiling_deleted: profilingResult.rowCount,
        columns_deleted: columnsResult.rowCount
      });
      
      return {
        success: true,
        metrics_deleted: metricsResult.rowCount,
        profiling_deleted: profilingResult.rowCount,
        columns_deleted: columnsResult.rowCount
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Error cleaning up old records', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = FileInsightsService;
