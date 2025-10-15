const { v4: uuidv4 } = require('uuid');
const { systemLogger } = require('../utils/logger');

/**
 * Anomaly Detection and Logging Service
 * Handles anomaly detection, logging, and management
 */

/**
 * Log a schema drift anomaly
 * @param {Pool} pool - Database connection pool
 * @param {Object} driftData - Schema drift detection result
 * @param {string} fileId - File ID
 * @param {string} filename - Filename
 * @param {string} mappingId - Optional mapping ID
 * @param {string} jobId - Optional job ID
 * @returns {Promise<Object>} - Created anomaly record
 */
async function logSchemaDriftAnomaly(pool, driftData, fileId, filename, mappingId = null, jobId = null) {
  try {
    const anomalyId = `DRIFT-${Date.now()}-${uuidv4().substring(0, 8)}`;
    
    // Calculate severity based on type of changes
    let severity = 'low';
    const diff = driftData.differences;
    
    if (diff.columnCountMismatch || diff.modifiedColumns.length > 0) {
      severity = 'high';
    } else if (diff.addedColumns.length > 2 || diff.removedColumns.length > 2) {
      severity = 'medium';
    }
    
    // Build description
    const changes = [];
    if (diff.addedColumns.length > 0) {
      changes.push(`${diff.addedColumns.length} column(s) added`);
    }
    if (diff.removedColumns.length > 0) {
      changes.push(`${diff.removedColumns.length} column(s) removed`);
    }
    if (diff.modifiedColumns.length > 0) {
      changes.push(`${diff.modifiedColumns.length} column(s) modified`);
    }
    if (diff.reorderedColumns) {
      changes.push('columns reordered');
    }
    
    const description = `Schema drift detected: ${changes.join(', ')}`;
    
    const result = await pool.query(`
      INSERT INTO anomalies (
        anomaly_id, file_id, file_name, mapping_id, job_id,
        anomaly_type, severity, title, description, anomaly_details,
        expected_value, actual_value, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      anomalyId, fileId, filename, mappingId, jobId,
      'schema_drift', severity, 'Schema Drift Detected', description,
      JSON.stringify(diff),
      JSON.stringify(driftData.previousSchema),
      JSON.stringify(driftData.currentSchema),
      'open'
    ]);
    
    systemLogger.warn('Schema drift anomaly logged', { 
      anomalyId, 
      fileId, 
      severity,
      changes: changes.join(', ')
    });
    
    return result.rows[0];
    
  } catch (error) {
    systemLogger.error('Error logging schema drift anomaly:', error);
    throw error;
  }
}

/**
 * Log a data quality anomaly
 * @param {Pool} pool - Database connection pool
 * @param {Object} params - Anomaly parameters
 * @returns {Promise<Object>} - Created anomaly record
 */
async function logDataQualityAnomaly(pool, params) {
  try {
    const {
      fileId,
      filename,
      mappingId = null,
      jobId = null,
      anomalyType,
      severity,
      title,
      description,
      details = {},
      expectedValue = null,
      actualValue = null,
      deviationPercentage = null
    } = params;
    
    const anomalyId = `${anomalyType.toUpperCase()}-${Date.now()}-${uuidv4().substring(0, 8)}`;
    
    const result = await pool.query(`
      INSERT INTO anomalies (
        anomaly_id, file_id, file_name, mapping_id, job_id,
        anomaly_type, severity, title, description, anomaly_details,
        expected_value, actual_value, deviation_percentage, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      anomalyId, fileId, filename, mappingId, jobId,
      anomalyType, severity, title, description,
      JSON.stringify(details),
      expectedValue, actualValue, deviationPercentage,
      'open'
    ]);
    
    systemLogger.warn('Data quality anomaly logged', { 
      anomalyId, 
      fileId, 
      anomalyType,
      severity
    });
    
    return result.rows[0];
    
  } catch (error) {
    systemLogger.error('Error logging data quality anomaly:', error);
    throw error;
  }
}

/**
 * Log a numeric sum deviation anomaly
 * @param {Pool} pool - Database connection pool
 * @param {Object} params - Anomaly parameters
 * @returns {Promise<Object>} - Created anomaly record
 */
async function logNumericDeviationAnomaly(pool, params) {
  const {
    fileId,
    filename,
    mappingId = null,
    jobId = null,
    columnName,
    expectedSum,
    actualSum,
    weeklyAverage,
    deviationPercentage,
    threshold = 10
  } = params;
  
  let severity = 'low';
  if (deviationPercentage > threshold * 3) {
    severity = 'high';
  } else if (deviationPercentage > threshold) {
    severity = 'medium';
  }
  
  return logDataQualityAnomaly(pool, {
    fileId,
    filename,
    mappingId,
    jobId,
    anomalyType: 'numeric_deviation',
    severity,
    title: `Numeric Sum Deviation: ${columnName}`,
    description: `Column "${columnName}" sum deviates ${deviationPercentage.toFixed(2)}% from weekly average (threshold: ${threshold}%)`,
    details: {
      columnName,
      expectedSum,
      actualSum,
      weeklyAverage,
      threshold
    },
    expectedValue: weeklyAverage.toString(),
    actualValue: actualSum.toString(),
    deviationPercentage
  });
}

/**
 * Log a row count anomaly
 * @param {Pool} pool - Database connection pool
 * @param {Object} params - Anomaly parameters
 * @returns {Promise<Object>} - Created anomaly record
 */
async function logRowCountAnomaly(pool, params) {
  const {
    fileId,
    filename,
    mappingId = null,
    jobId = null,
    expectedRowCount,
    actualRowCount,
    averageRowCount,
    deviationPercentage,
    threshold = 15
  } = params;
  
  let severity = 'low';
  if (deviationPercentage > threshold * 2) {
    severity = 'high';
  } else if (deviationPercentage > threshold) {
    severity = 'medium';
  }
  
  return logDataQualityAnomaly(pool, {
    fileId,
    filename,
    mappingId,
    jobId,
    anomalyType: 'row_count_anomaly',
    severity,
    title: 'Row Count Anomaly',
    description: `Row count ${actualRowCount} deviates ${deviationPercentage.toFixed(2)}% from average ${averageRowCount} (threshold: ${threshold}%)`,
    details: {
      expectedRowCount,
      actualRowCount,
      averageRowCount,
      threshold
    },
    expectedValue: averageRowCount.toString(),
    actualValue: actualRowCount.toString(),
    deviationPercentage
  });
}

/**
 * Log a null value spike anomaly
 * @param {Pool} pool - Database connection pool
 * @param {Object} params - Anomaly parameters
 * @returns {Promise<Object>} - Created anomaly record
 */
async function logNullSpikeAnomaly(pool, params) {
  const {
    fileId,
    filename,
    mappingId = null,
    jobId = null,
    columnName,
    nullPercentage,
    averageNullPercentage,
    threshold = 20
  } = params;
  
  const deviationPercentage = ((nullPercentage - averageNullPercentage) / averageNullPercentage) * 100;
  
  let severity = 'medium';
  if (nullPercentage > 50) {
    severity = 'high';
  }
  
  return logDataQualityAnomaly(pool, {
    fileId,
    filename,
    mappingId,
    jobId,
    anomalyType: 'null_spike',
    severity,
    title: `Null Value Spike: ${columnName}`,
    description: `Column "${columnName}" has ${nullPercentage.toFixed(2)}% null values (average: ${averageNullPercentage.toFixed(2)}%, threshold: ${threshold}%)`,
    details: {
      columnName,
      nullPercentage,
      averageNullPercentage,
      threshold
    },
    expectedValue: averageNullPercentage.toFixed(2),
    actualValue: nullPercentage.toFixed(2),
    deviationPercentage
  });
}

/**
 * Get all open anomalies
 * @param {Pool} pool - Database connection pool
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} - Array of anomaly records
 */
async function getOpenAnomalies(pool, filters = {}) {
  try {
    let query = 'SELECT * FROM anomalies WHERE status = $1';
    const params = ['open'];
    let paramIndex = 2;
    
    if (filters.fileId) {
      query += ` AND file_id = $${paramIndex}`;
      params.push(filters.fileId);
      paramIndex++;
    }
    
    if (filters.mappingId) {
      query += ` AND mapping_id = $${paramIndex}`;
      params.push(filters.mappingId);
      paramIndex++;
    }
    
    if (filters.anomalyType) {
      query += ` AND anomaly_type = $${paramIndex}`;
      params.push(filters.anomalyType);
      paramIndex++;
    }
    
    if (filters.severity) {
      query += ` AND severity = $${paramIndex}`;
      params.push(filters.severity);
      paramIndex++;
    }
    
    query += ' ORDER BY detected_at DESC';
    
    if (filters.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
    }
    
    const result = await pool.query(query, params);
    return result.rows;
    
  } catch (error) {
    systemLogger.error('Error getting open anomalies:', error);
    throw error;
  }
}

/**
 * Resolve an anomaly
 * @param {Pool} pool - Database connection pool
 * @param {string} anomalyId - Anomaly ID
 * @param {string} resolvedBy - User who resolved it
 * @param {string} resolutionNotes - Notes about resolution
 * @returns {Promise<Object>} - Updated anomaly record
 */
async function resolveAnomaly(pool, anomalyId, resolvedBy, resolutionNotes) {
  try {
    const result = await pool.query(`
      UPDATE anomalies 
      SET status = 'resolved',
          resolved_at = CURRENT_TIMESTAMP,
          resolved_by = $2,
          resolution_notes = $3
      WHERE anomaly_id = $1
      RETURNING *
    `, [anomalyId, resolvedBy, resolutionNotes]);
    
    if (result.rows.length > 0) {
      systemLogger.info('Anomaly resolved', { anomalyId, resolvedBy });
    }
    
    return result.rows[0];
    
  } catch (error) {
    systemLogger.error('Error resolving anomaly:', error);
    throw error;
  }
}

module.exports = {
  logSchemaDriftAnomaly,
  logDataQualityAnomaly,
  logNumericDeviationAnomaly,
  logRowCountAnomaly,
  logNullSpikeAnomaly,
  getOpenAnomalies,
  resolveAnomaly
};
