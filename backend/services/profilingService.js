const { systemLogger } = require('../utils/logger');
const { 
  logNumericDeviationAnomaly, 
  logRowCountAnomaly, 
  logNullSpikeAnomaly,
  logDataQualityAnomaly 
} = require('./anomalyService');

/**
 * Profiling Service
 * Applies quality checks to transformation files and detects anomalies
 */

/**
 * Convert file pattern to SQL LIKE pattern
 * @param {string} pattern - Pattern with wildcards (* and ?)
 * @returns {string} - SQL LIKE pattern
 */
function patternToSQLLike(pattern) {
  if (!pattern) return pattern;
  
  // Replace all * with % and all ? with _
  return pattern.replace(/\*/g, '%').replace(/\?/g, '_');
}

/**
 * Calculate weekly average for numeric columns
 * @param {Pool} pool - Database connection pool
 * @param {string} columnName - Column name
 * @param {string} filePattern - File pattern
 * @param {number} days - Number of days to look back (default 7)
 * @returns {Promise<number>} - Weekly average sum
 */
async function getWeeklyAverageSum(pool, columnName, filePattern, days = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const result = await pool.query(`
      SELECT AVG(numeric_sum) as avg_sum
      FROM (
        SELECT 
          fc.numeric_sum
        FROM file_columns fc
        JOIN files f ON fc.file_id = f.file_id
        WHERE fc.column_name = $1
          AND f.filename LIKE $2
          AND f.created_at >= $3
          AND fc.numeric_sum IS NOT NULL
        ORDER BY f.created_at DESC
      ) recent_sums
    `, [columnName, patternToSQLLike(filePattern), cutoffDate]);
    
    return result.rows[0]?.avg_sum || 0;
    
  } catch (error) {
    systemLogger.error('Error calculating weekly average:', error);
    return 0;
  }
}

/**
 * Calculate weekly average row count
 * @param {Pool} pool - Database connection pool
 * @param {string} filePattern - File pattern
 * @param {number} days - Number of days to look back
 * @returns {Promise<number>} - Average row count
 */
async function getWeeklyAverageRowCount(pool, filePattern, days = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const result = await pool.query(`
      SELECT AVG(row_count) as avg_count
      FROM files
      WHERE filename LIKE $1
        AND created_at >= $2
        AND row_count IS NOT NULL
    `, [patternToSQLLike(filePattern), cutoffDate]);
    
    return result.rows[0]?.avg_count || 0;
    
  } catch (error) {
    systemLogger.error('Error calculating average row count:', error);
    return 0;
  }
}

/**
 * Calculate average null percentage for a column
 * @param {Pool} pool - Database connection pool
 * @param {string} columnName - Column name
 * @param {string} filePattern - File pattern
 * @param {number} days - Number of days to look back
 * @returns {Promise<number>} - Average null percentage
 */
async function getAverageNullPercentage(pool, columnName, filePattern, days = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const result = await pool.query(`
      SELECT AVG(
        CASE 
          WHEN fc.total_count > 0 
          THEN (fc.null_count::float / fc.total_count::float) * 100 
          ELSE 0 
        END
      ) as avg_null_pct
      FROM file_columns fc
      JOIN files f ON fc.file_id = f.file_id
      WHERE fc.column_name = $1
        AND f.filename LIKE $2
        AND f.created_at >= $3
    `, [columnName, patternToSQLLike(filePattern), cutoffDate]);
    
    return result.rows[0]?.avg_null_pct || 0;
    
  } catch (error) {
    systemLogger.error('Error calculating average null percentage:', error);
    return 0;
  }
}

/**
 * Check for numeric sum deviations
 * @param {Pool} pool - Database connection pool
 * @param {string} fileId - File ID
 * @param {string} filename - Filename
 * @param {string} filePattern - File pattern
 * @param {Object} options - Options
 * @returns {Promise<Array>} - Array of detected anomalies
 */
async function checkNumericDeviations(pool, fileId, filename, filePattern, options = {}) {
  const { threshold = 10, mappingId = null, jobId = null } = options;
  const anomalies = [];
  
  try {
    // Get numeric columns for this file
    const columnsResult = await pool.query(`
      SELECT column_name, numeric_sum, total_count
      FROM file_columns
      WHERE file_id = $1 
        AND column_type IN ('integer', 'float', 'decimal', 'number')
        AND numeric_sum IS NOT NULL
    `, [fileId]);
    
    for (const column of columnsResult.rows) {
      const weeklyAvg = await getWeeklyAverageSum(pool, column.column_name, filePattern);
      
      if (weeklyAvg > 0) {
        const deviation = Math.abs((column.numeric_sum - weeklyAvg) / weeklyAvg) * 100;
        
        if (deviation > threshold) {
          const anomaly = await logNumericDeviationAnomaly(pool, {
            fileId,
            filename,
            mappingId,
            jobId,
            columnName: column.column_name,
            expectedSum: weeklyAvg,
            actualSum: column.numeric_sum,
            weeklyAverage: weeklyAvg,
            deviationPercentage: deviation,
            threshold
          });
          
          anomalies.push(anomaly);
        }
      }
    }
    
    return anomalies;
    
  } catch (error) {
    systemLogger.error('Error checking numeric deviations:', error);
    return anomalies;
  }
}

/**
 * Check for row count anomalies
 * @param {Pool} pool - Database connection pool
 * @param {string} fileId - File ID
 * @param {string} filename - Filename
 * @param {string} filePattern - File pattern
 * @param {Object} options - Options
 * @returns {Promise<Array>} - Array of detected anomalies
 */
async function checkRowCountAnomaly(pool, fileId, filename, filePattern, options = {}) {
  const { threshold = 15, mappingId = null, jobId = null } = options;
  const anomalies = [];
  
  try {
    const fileResult = await pool.query(
      'SELECT row_count FROM files WHERE file_id = $1',
      [fileId]
    );
    
    if (fileResult.rows.length === 0) {
      return anomalies;
    }
    
    const actualRowCount = fileResult.rows[0].row_count;
    const avgRowCount = await getWeeklyAverageRowCount(pool, filePattern);
    
    if (avgRowCount > 0) {
      const deviation = Math.abs((actualRowCount - avgRowCount) / avgRowCount) * 100;
      
      if (deviation > threshold) {
        const anomaly = await logRowCountAnomaly(pool, {
          fileId,
          filename,
          mappingId,
          jobId,
          expectedRowCount: avgRowCount,
          actualRowCount,
          averageRowCount: avgRowCount,
          deviationPercentage: deviation,
          threshold
        });
        
        anomalies.push(anomaly);
      }
    }
    
    return anomalies;
    
  } catch (error) {
    systemLogger.error('Error checking row count anomaly:', error);
    return anomalies;
  }
}

/**
 * Check for null value spikes
 * @param {Pool} pool - Database connection pool
 * @param {string} fileId - File ID
 * @param {string} filename - Filename
 * @param {string} filePattern - File pattern
 * @param {Object} options - Options
 * @returns {Promise<Array>} - Array of detected anomalies
 */
async function checkNullSpikes(pool, fileId, filename, filePattern, options = {}) {
  const { threshold = 20, mappingId = null, jobId = null } = options;
  const anomalies = [];
  
  try {
    const columnsResult = await pool.query(`
      SELECT column_name, null_count, total_count
      FROM file_columns
      WHERE file_id = $1 AND total_count > 0
    `, [fileId]);
    
    for (const column of columnsResult.rows) {
      const nullPercentage = (column.null_count / column.total_count) * 100;
      const avgNullPercentage = await getAverageNullPercentage(pool, column.column_name, filePattern);
      
      // Check if null percentage exceeds threshold or is significantly higher than average
      if (nullPercentage > threshold || (avgNullPercentage > 0 && nullPercentage > avgNullPercentage * 1.5)) {
        const anomaly = await logNullSpikeAnomaly(pool, {
          fileId,
          filename,
          mappingId,
          jobId,
          columnName: column.column_name,
          nullPercentage,
          averageNullPercentage: avgNullPercentage,
          threshold
        });
        
        anomalies.push(anomaly);
      }
    }
    
    return anomalies;
    
  } catch (error) {
    systemLogger.error('Error checking null spikes:', error);
    return anomalies;
  }
}

/**
 * Check for data type mismatches across pattern-matched files
 * @param {Pool} pool - Database connection pool
 * @param {string} fileId - File ID
 * @param {string} filename - Filename
 * @param {string} filePattern - File pattern
 * @param {Object} options - Options
 * @returns {Promise<Array>} - Array of detected anomalies
 */
async function checkTypeMismatches(pool, fileId, filename, filePattern, options = {}) {
  const { mappingId = null, jobId = null } = options;
  const anomalies = [];
  
  try {
    // Get expected column types from most recent files with same pattern
    const expectedTypesResult = await pool.query(`
      SELECT 
        fc.column_name,
        fc.column_type,
        COUNT(*) as occurrence_count
      FROM file_columns fc
      JOIN files f ON fc.file_id = f.file_id
      WHERE f.filename LIKE $1
        AND f.file_id != $2
        AND f.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY fc.column_name, fc.column_type
      ORDER BY fc.column_name, occurrence_count DESC
    `, [patternToSQLLike(filePattern), fileId]);
    
    // Build expected types map (most common type for each column)
    const expectedTypes = {};
    for (const row of expectedTypesResult.rows) {
      if (!expectedTypes[row.column_name]) {
        expectedTypes[row.column_name] = row.column_type;
      }
    }
    
    // Get actual column types for current file
    const actualTypesResult = await pool.query(
      'SELECT column_name, column_type FROM file_columns WHERE file_id = $1',
      [fileId]
    );
    
    // Compare and detect mismatches
    for (const column of actualTypesResult.rows) {
      const expectedType = expectedTypes[column.column_name];
      
      if (expectedType && expectedType !== column.column_type) {
        const anomaly = await logDataQualityAnomaly(pool, {
          fileId,
          filename,
          mappingId,
          jobId,
          anomalyType: 'type_mismatch',
          severity: 'high',
          title: `Data Type Mismatch: ${column.column_name}`,
          description: `Column "${column.column_name}" has type "${column.column_type}" but expected "${expectedType}" based on recent files`,
          details: {
            columnName: column.column_name,
            expectedType,
            actualType: column.column_type
          },
          expectedValue: expectedType,
          actualValue: column.column_type
        });
        
        anomalies.push(anomaly);
      }
    }
    
    return anomalies;
    
  } catch (error) {
    systemLogger.error('Error checking type mismatches:', error);
    return anomalies;
  }
}

/**
 * Run complete profiling and quality checks on a file
 * @param {Pool} pool - Database connection pool
 * @param {string} fileId - File ID
 * @param {string} filename - Filename
 * @param {string} filePattern - File pattern
 * @param {Object} options - Options and thresholds
 * @returns {Promise<Object>} - Profiling results with anomalies
 */
async function profileFile(pool, fileId, filename, filePattern, options = {}) {
  const {
    numericDeviationThreshold = 10,
    rowCountThreshold = 15,
    nullSpikeThreshold = 20,
    mappingId = null,
    jobId = null
  } = options;
  
  try {
    const allAnomalies = [];
    
    // Run all quality checks
    const numericAnomalies = await checkNumericDeviations(pool, fileId, filename, filePattern, {
      threshold: numericDeviationThreshold,
      mappingId,
      jobId
    });
    allAnomalies.push(...numericAnomalies);
    
    const rowCountAnomalies = await checkRowCountAnomaly(pool, fileId, filename, filePattern, {
      threshold: rowCountThreshold,
      mappingId,
      jobId
    });
    allAnomalies.push(...rowCountAnomalies);
    
    const nullAnomalies = await checkNullSpikes(pool, fileId, filename, filePattern, {
      threshold: nullSpikeThreshold,
      mappingId,
      jobId
    });
    allAnomalies.push(...nullAnomalies);
    
    const typeAnomalies = await checkTypeMismatches(pool, fileId, filename, filePattern, {
      mappingId,
      jobId
    });
    allAnomalies.push(...typeAnomalies);
    
    // Save profiling metrics
    await saveProfilingMetrics(pool, fileId, mappingId, jobId, allAnomalies);
    
    systemLogger.info('File profiling complete', { 
      fileId, 
      anomalyCount: allAnomalies.length 
    });
    
    return {
      fileId,
      filename,
      anomaliesDetected: allAnomalies.length,
      anomalies: allAnomalies,
      checks: {
        numericDeviation: numericAnomalies.length,
        rowCountAnomaly: rowCountAnomalies.length,
        nullSpikes: nullAnomalies.length,
        typeMismatches: typeAnomalies.length
      }
    };
    
  } catch (error) {
    systemLogger.error('Error profiling file:', error);
    throw error;
  }
}

/**
 * Save profiling metrics to database
 * @param {Pool} pool - Database connection pool
 * @param {string} fileId - File ID
 * @param {string} mappingId - Mapping ID
 * @param {string} jobId - Job ID
 * @param {Array} anomalies - Detected anomalies
 */
async function saveProfilingMetrics(pool, fileId, mappingId, jobId, anomalies) {
  try {
    const severityCounts = {
      low: anomalies.filter(a => a.severity === 'low').length,
      medium: anomalies.filter(a => a.severity === 'medium').length,
      high: anomalies.filter(a => a.severity === 'high').length
    };
    
    const qualityScore = calculateQualityScore(anomalies);
    
    await pool.query(`
      INSERT INTO profiling_metrics (
        file_id, mapping_id, job_id, quality_score,
        anomaly_count, severity_counts, profiling_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      fileId,
      mappingId,
      jobId,
      qualityScore,
      anomalies.length,
      JSON.stringify(severityCounts),
      JSON.stringify({ checks_performed: ['numeric_deviation', 'row_count', 'null_spike', 'type_mismatch'] })
    ]);
    
  } catch (error) {
    systemLogger.error('Error saving profiling metrics:', error);
  }
}

/**
 * Calculate quality score based on anomalies
 * @param {Array} anomalies - Detected anomalies
 * @returns {number} - Quality score (0-100)
 */
function calculateQualityScore(anomalies) {
  if (anomalies.length === 0) {
    return 100;
  }
  
  // Deduct points based on severity
  let score = 100;
  
  for (const anomaly of anomalies) {
    switch (anomaly.severity) {
      case 'high':
        score -= 15;
        break;
      case 'medium':
        score -= 10;
        break;
      case 'low':
        score -= 5;
        break;
    }
  }
  
  return Math.max(0, score);
}

module.exports = {
  profileFile,
  checkNumericDeviations,
  checkRowCountAnomaly,
  checkNullSpikes,
  checkTypeMismatches,
  getWeeklyAverageSum,
  getWeeklyAverageRowCount,
  getAverageNullPercentage,
  calculateQualityScore
};
