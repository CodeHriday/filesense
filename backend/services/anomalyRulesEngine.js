const { systemLogger } = require('../utils/logger');
const { profileFile } = require('./profilingService');
const { detectSchemaDrift } = require('./schemaService');
const { logSchemaDriftAnomaly } = require('./anomalyService');

/**
 * Anomaly Detection Rules Engine
 * Configurable rules engine for detecting and managing data quality anomalies
 */

/**
 * Default anomaly detection rules
 */
const DEFAULT_RULES = {
  numeric_deviation: {
    enabled: true,
    threshold: 10, // percentage
    severity: 'medium',
    description: 'Detect when numeric column sums deviate from weekly average'
  },
  row_count_anomaly: {
    enabled: true,
    threshold: 15, // percentage
    severity: 'medium',
    description: 'Detect significant changes in row count'
  },
  null_spike: {
    enabled: true,
    threshold: 20, // percentage
    severity: 'medium',
    description: 'Detect spikes in null values'
  },
  type_mismatch: {
    enabled: true,
    severity: 'high',
    description: 'Detect data type inconsistencies across files'
  },
  schema_drift: {
    enabled: true,
    severity: 'high',
    description: 'Detect schema changes (added/removed/modified columns)'
  },
  duplicate_detection: {
    enabled: false,
    threshold: 5, // percentage
    severity: 'low',
    description: 'Detect high duplicate rates'
  },
  completeness_check: {
    enabled: false,
    threshold: 80, // minimum percentage of non-null values
    severity: 'medium',
    description: 'Check data completeness'
  }
};

/**
 * Get rules for a mapping (from mapping config or defaults)
 * @param {Pool} pool - Database connection pool
 * @param {string} mappingId - Mapping ID
 * @returns {Promise<Object>} - Anomaly detection rules
 */
async function getMappingRules(pool, mappingId) {
  try {
    const result = await pool.query(
      'SELECT anomaly_rules FROM transformation_mappings WHERE mapping_id = $1',
      [mappingId]
    );
    
    if (result.rows.length === 0) {
      return DEFAULT_RULES;
    }
    
    const mappingRules = result.rows[0].anomaly_rules;
    
    // Merge with defaults (mapping rules override defaults)
    return {
      ...DEFAULT_RULES,
      ...(mappingRules || {})
    };
    
  } catch (error) {
    systemLogger.error('Error getting mapping rules:', error);
    return DEFAULT_RULES;
  }
}

/**
 * Save anomaly detection rules for a mapping
 * @param {Pool} pool - Database connection pool
 * @param {string} mappingId - Mapping ID
 * @param {Object} rules - Anomaly detection rules
 * @returns {Promise<Object>} - Updated mapping
 */
async function saveMappingRules(pool, mappingId, rules) {
  try {
    const result = await pool.query(`
      UPDATE transformation_mappings
      SET anomaly_rules = $1, updated_at = CURRENT_TIMESTAMP
      WHERE mapping_id = $2
      RETURNING *
    `, [JSON.stringify(rules), mappingId]);
    
    systemLogger.info('Anomaly rules saved', { mappingId });
    
    return result.rows[0];
    
  } catch (error) {
    systemLogger.error('Error saving mapping rules:', error);
    throw error;
  }
}

/**
 * Execute anomaly detection based on rules
 * @param {Pool} pool - Database connection pool
 * @param {Object} params - Execution parameters
 * @returns {Promise<Object>} - Detection results
 */
async function executeAnomalyDetection(pool, params) {
  const {
    fileId,
    filename,
    filePattern,
    mappingId = null,
    jobId = null,
    rules = null,
    runSchemaValidation = true
  } = params;
  
  try {
    const detectionRules = rules || await getMappingRules(pool, mappingId);
    const results = {
      fileId,
      filename,
      totalAnomalies: 0,
      anomaliesByType: {},
      executedRules: []
    };
    
    // Run profiling-based checks if any are enabled
    const profilingRules = ['numeric_deviation', 'row_count_anomaly', 'null_spike', 'type_mismatch'];
    const enabledProfilingRules = profilingRules.filter(rule => detectionRules[rule]?.enabled);
    
    if (enabledProfilingRules.length > 0) {
      const profilingOptions = {
        numericDeviationThreshold: detectionRules.numeric_deviation?.threshold || 10,
        rowCountThreshold: detectionRules.row_count_anomaly?.threshold || 15,
        nullSpikeThreshold: detectionRules.null_spike?.threshold || 20,
        mappingId,
        jobId
      };
      
      const profilingResults = await profileFile(pool, fileId, filename, filePattern, profilingOptions);
      
      results.totalAnomalies += profilingResults.anomaliesDetected;
      results.anomaliesByType = {
        ...results.anomaliesByType,
        numeric_deviation: profilingResults.checks.numericDeviation,
        row_count_anomaly: profilingResults.checks.rowCountAnomaly,
        null_spike: profilingResults.checks.nullSpikes,
        type_mismatch: profilingResults.checks.typeMismatches
      };
      results.executedRules.push(...enabledProfilingRules);
    }
    
    // Run schema drift detection if enabled
    if (detectionRules.schema_drift?.enabled && runSchemaValidation) {
      const currentSchemaResult = await pool.query(
        'SELECT schema_definition FROM files WHERE file_id = $1',
        [fileId]
      );
      
      if (currentSchemaResult.rows.length > 0 && currentSchemaResult.rows[0].schema_definition) {
        const driftResult = await detectSchemaDrift(pool, fileId, currentSchemaResult.rows[0].schema_definition);
        
        if (driftResult.hasDrift) {
          await logSchemaDriftAnomaly(pool, driftResult, fileId, filename, mappingId, jobId);
          results.totalAnomalies += 1;
          results.anomaliesByType.schema_drift = 1;
        }
        
        results.executedRules.push('schema_drift');
      }
    }
    
    systemLogger.info('Anomaly detection complete', {
      fileId,
      totalAnomalies: results.totalAnomalies,
      executedRules: results.executedRules.length
    });
    
    return results;
    
  } catch (error) {
    systemLogger.error('Error executing anomaly detection:', error);
    throw error;
  }
}

/**
 * Validate rules configuration
 * @param {Object} rules - Rules to validate
 * @returns {Object} - Validation result
 */
function validateRules(rules) {
  const errors = [];
  const validRuleTypes = Object.keys(DEFAULT_RULES);
  
  for (const [ruleType, config] of Object.entries(rules)) {
    if (!validRuleTypes.includes(ruleType)) {
      errors.push(`Invalid rule type: ${ruleType}`);
      continue;
    }
    
    if (typeof config !== 'object') {
      errors.push(`Rule ${ruleType} must be an object`);
      continue;
    }
    
    if ('enabled' in config && typeof config.enabled !== 'boolean') {
      errors.push(`Rule ${ruleType}.enabled must be boolean`);
    }
    
    if ('threshold' in config) {
      const threshold = parseFloat(config.threshold);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        errors.push(`Rule ${ruleType}.threshold must be a number between 0 and 100`);
      }
    }
    
    if ('severity' in config && !['low', 'medium', 'high'].includes(config.severity)) {
      errors.push(`Rule ${ruleType}.severity must be 'low', 'medium', or 'high'`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get anomaly statistics for a mapping
 * @param {Pool} pool - Database connection pool
 * @param {string} mappingId - Mapping ID
 * @param {number} days - Number of days to look back
 * @returns {Promise<Object>} - Anomaly statistics
 */
async function getAnomalyStatistics(pool, mappingId, days = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const result = await pool.query(`
      SELECT 
        anomaly_type,
        severity,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_count,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_count
      FROM anomalies
      WHERE mapping_id = $1
        AND detected_at >= $2
      GROUP BY anomaly_type, severity
      ORDER BY count DESC
    `, [mappingId, cutoffDate]);
    
    const stats = {
      totalAnomalies: 0,
      openAnomalies: 0,
      resolvedAnomalies: 0,
      byType: {},
      bySeverity: {
        low: 0,
        medium: 0,
        high: 0
      }
    };
    
    for (const row of result.rows) {
      stats.totalAnomalies += parseInt(row.count);
      stats.openAnomalies += parseInt(row.open_count);
      stats.resolvedAnomalies += parseInt(row.resolved_count);
      
      if (!stats.byType[row.anomaly_type]) {
        stats.byType[row.anomaly_type] = {
          count: 0,
          open: 0,
          resolved: 0
        };
      }
      
      stats.byType[row.anomaly_type].count += parseInt(row.count);
      stats.byType[row.anomaly_type].open += parseInt(row.open_count);
      stats.byType[row.anomaly_type].resolved += parseInt(row.resolved_count);
      
      stats.bySeverity[row.severity] += parseInt(row.count);
    }
    
    return stats;
    
  } catch (error) {
    systemLogger.error('Error getting anomaly statistics:', error);
    throw error;
  }
}

/**
 * Get rule suggestions based on historical data
 * @param {Pool} pool - Database connection pool
 * @param {string} mappingId - Mapping ID
 * @returns {Promise<Object>} - Suggested rule adjustments
 */
async function suggestRuleAdjustments(pool, mappingId) {
  try {
    const stats = await getAnomalyStatistics(pool, mappingId, 30);
    const suggestions = [];
    
    // Suggest disabling rules with too many false positives
    for (const [type, data] of Object.entries(stats.byType)) {
      if (data.count > 20 && data.resolved / data.count > 0.8) {
        suggestions.push({
          ruleType: type,
          action: 'increase_threshold',
          reason: `${data.count} anomalies detected with ${Math.round(data.resolved / data.count * 100)}% resolution rate - consider increasing threshold`,
          currentThreshold: DEFAULT_RULES[type]?.threshold,
          suggestedThreshold: DEFAULT_RULES[type]?.threshold ? DEFAULT_RULES[type].threshold + 5 : null
        });
      }
    }
    
    return {
      mappingId,
      suggestions,
      statistics: stats
    };
    
  } catch (error) {
    systemLogger.error('Error suggesting rule adjustments:', error);
    throw error;
  }
}

module.exports = {
  DEFAULT_RULES,
  getMappingRules,
  saveMappingRules,
  executeAnomalyDetection,
  validateRules,
  getAnomalyStatistics,
  suggestRuleAdjustments
};
