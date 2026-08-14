const { systemLogger } = require('../utils/logger');
const pool = require('../db');
const { validateRegexSafety } = require('../utils/regexValidator');

/**
 * Quality Validation Engine
 * Executes data quality rules against files and ETL job data
 * Supports 5 rule types: completeness, validity, consistency, uniqueness, freshness
 */

class QualityValidationEngine {
  constructor(dbPool = pool) {
    this.pool = dbPool;
  }

  /**
   * Detect the primary key column from data
   * Looks for columns with names like *_id, id, *_number, etc.
   * Uses length-limited patterns to prevent ReDoS attacks
   * @param {Array} data - Data rows
   * @returns {string|null} - Primary key column name or null
   */
  detectPrimaryKeyColumn(data) {
    if (!data || data.length === 0) return null;
    
    const firstRow = data[0];
    const columns = Object.keys(firstRow);
    
    // Priority order for primary key detection
    // Use more specific patterns to prevent ReDoS attacks
    const idPatterns = [
      /^id$/i,                    // exact match 'id'
      /^[a-zA-Z0-9_]{1,50}_id$/i, // ends with '_id' with reasonable length limit
      /^[a-zA-Z0-9_]{1,50}_number$/i, // ends with '_number' with length limit
      /^[a-zA-Z0-9_]{1,50}_code$/i,   // ends with '_code' with length limit
      /^(order|shipment|invoice|customer|product|transaction|record)$/i  // common entity names
    ];
    
    // Try each pattern in order of priority
    for (const pattern of idPatterns) {
      const matchingColumn = columns.find(col => pattern.test(col));
      if (matchingColumn) {
        systemLogger.info('Detected primary key column', { column: matchingColumn });
        return matchingColumn;
      }
    }
    
    // Fallback: use first column that looks like an ID
    const fallbackColumn = columns.find(col => 
      col.toLowerCase().includes('id') || 
      col.toLowerCase().includes('number') ||
      col.toLowerCase().includes('code')
    );
    
    if (fallbackColumn) {
      systemLogger.info('Using fallback primary key column', { column: fallbackColumn });
      return fallbackColumn;
    }
    
    // Last resort: use first column
    systemLogger.warn('No obvious primary key found, using first column', { column: columns[0] });
    return columns[0];
  }

  /**
   * Validate data against a set of quality rules
   * @param {Array} rules - Array of quality rule objects
   * @param {Array} data - Array of data rows to validate
   * @param {Object} metadata - File/job metadata (file_id or job_id, file_name, upload_date, etc.)
   * @returns {Promise<{violations: Array, errors: Array, summary: Object}>}
   */
  async validateData(rules, data, metadata) {
    try {
      const violations = [];
      const errors = [];
      const summary = {
        total_rows: data.length,
        rules_applied: rules.length,
        violations_found: 0,
        critical_count: 0,
        error_count: 0,
        warning_count: 0
      };

      if (!data || data.length === 0) {
        // If actual_row_count is explicitly set, record_count rules can still be evaluated
        // (e.g. a VM job that produced 0 output rows). Other rules need row data and are skipped.
        const recordCountRules = rules.filter(r => r.enabled !== false &&
          (r.rule_type === 'record_count' || r.rule_type === 'record_count_match'));
        if (recordCountRules.length === 0 || metadata.actual_row_count === undefined) {
          systemLogger.warn('No data provided for validation', metadata);
          return { violations, errors, summary };
        }
        // Fall through with empty data — only record_count rules will produce results
        for (const rule of recordCountRules) {
          try {
            const ruleViolations = await this.executeRule(rule, [], metadata);
            violations.push(...ruleViolations);
            ruleViolations.forEach(violation => {
              summary.violations_found++;
              if (violation.severity === 'critical') summary.critical_count++;
              else if (violation.severity === 'error') summary.error_count++;
              else if (violation.severity === 'warning') summary.warning_count++;
            });
          } catch (error) {
            systemLogger.error('Error executing record_count quality rule on empty data', {
              rule_id: rule.id,
              rule_name: rule.rule_name,
              error: error.message
            });
            errors.push({ rule_id: rule.id, rule_name: rule.rule_name, error_message: error.message });
          }
        }
        return { violations, errors, summary };
      }

      // Filter enabled rules
      const enabledRules = rules.filter(rule => rule.enabled !== false);

      if (enabledRules.length === 0) {
        systemLogger.info('No enabled quality rules to apply', metadata);
        return { violations, errors, summary };
      }

      // Detect primary key column once for all validations
      const primaryKeyColumn = this.detectPrimaryKeyColumn(data);
      metadata.primaryKeyColumn = primaryKeyColumn;

      // Execute each rule
      for (const rule of enabledRules) {
        try {
          const ruleViolations = await this.executeRule(rule, data, metadata);
          violations.push(...ruleViolations);
          
          // Update summary counts
          ruleViolations.forEach(violation => {
            summary.violations_found++;
            if (violation.severity === 'critical') summary.critical_count++;
            else if (violation.severity === 'error') summary.error_count++;
            else if (violation.severity === 'warning') summary.warning_count++;
          });
        } catch (error) {
          systemLogger.error('Error executing quality rule', { 
            rule_id: rule.id, 
            rule_name: rule.rule_name,
            error: error.message 
          });
          errors.push({
            rule_id: rule.id,
            rule_name: rule.rule_name,
            error_message: error.message
          });
        }
      }

      return { violations, errors, summary };
    } catch (error) {
      systemLogger.error('Quality validation engine error', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute a single quality rule
   * @param {Object} rule - Quality rule definition
   * @param {Array} data - Data rows to validate
   * @param {Object} metadata - File/job metadata
   * @returns {Promise<Array>} - Array of violations
   */
  async executeRule(rule, data, metadata) {
    const ruleType = rule.rule_type.toLowerCase();
    
    switch (ruleType) {
      case 'completeness':
        return this.validateCompleteness(rule, data, metadata);
      case 'validity':
        return this.validateValidity(rule, data, metadata);
      case 'consistency':
        return this.validateConsistency(rule, data, metadata);
      case 'uniqueness':
        return this.validateUniqueness(rule, data, metadata);
      case 'freshness':
        return this.validateFreshness(rule, data, metadata);
      case 'record_count':
      case 'record_count_match':
        return this.validateRecordCount(rule, data, metadata);
      // Generic rule types for contract/profiling modules
      case 'validity_check':
        return this.validateValidityCheck(rule, data, metadata);
      case 'length_check':
        return this.validateLengthCheck(rule, data, metadata);
      case 'range_check':
        return this.validateRangeCheck(rule, data, metadata);
      // Date/timestamp format checks — user-created rules store these as their own rule_type
      case 'date_format':
        return this.validateDateFormat(rule, data, metadata, false);
      case 'timestamp_format':
        return this.validateDateFormat(rule, data, metadata, true);
      default:
        throw new Error(`Unsupported rule type: ${ruleType}`);
    }
  }

  /**
   * Validate completeness - check for null/empty values
   * rule_config: { threshold: 0.95 (95% completeness required), columns: ['col1', 'col2'] or null for all }
   */
  async validateCompleteness(rule, data, metadata) {
    const violations = [];
    const config = rule.rule_config;
    // Normalize threshold: if > 1, assume it's a percentage (95) and convert to decimal (0.95)
    let threshold = config.threshold || 1.0; // Default: 100% completeness
    if (threshold > 1) {
      threshold = threshold / 100;
    }
    const columnsToCheck = config.columns || null; // null = check specific column from rule
    
    // If rule specifies a column, check only that column
    if (rule.column_name) {
      const columnStats = this.calculateCompleteness(data, rule.column_name);
      
      if (columnStats.completeness < threshold) {
        violations.push({
          rule_id: rule.id,
          file_id: metadata.file_id || null,
          job_id: metadata.job_id || null,
          column_name: rule.column_name,
          expected_value: `${(threshold * 100).toFixed(1)}% completeness`,
          actual_value: `${(columnStats.completeness * 100).toFixed(1)}% completeness (${columnStats.null_count} nulls out of ${columnStats.total_rows})`,
          violation_details: {
            rule_type: 'completeness',
            threshold_required: threshold,
            actual_completeness: columnStats.completeness,
            null_count: columnStats.null_count,
            empty_count: columnStats.empty_count
          },
          severity: rule.severity
        });
      }
    } else if (columnsToCheck && Array.isArray(columnsToCheck)) {
      // Check multiple columns
      for (const column of columnsToCheck) {
        const columnStats = this.calculateCompleteness(data, column);
        
        if (columnStats.completeness < threshold) {
          violations.push({
            rule_id: rule.id,
            file_id: metadata.file_id || null,
            job_id: metadata.job_id || null,
            column_name: column,
            expected_value: `${(threshold * 100).toFixed(1)}% completeness`,
            actual_value: `${(columnStats.completeness * 100).toFixed(1)}% completeness`,
            violation_details: {
              rule_type: 'completeness',
              threshold_required: threshold,
              actual_completeness: columnStats.completeness,
              null_count: columnStats.null_count,
              empty_count: columnStats.empty_count
            },
            severity: rule.severity
          });
        }
      }
    }
    
    return violations;
  }

  /**
   * Calculate completeness statistics for a column
   */
  calculateCompleteness(data, columnName) {
    let null_count = 0;
    let empty_count = 0;
    
    data.forEach(row => {
      const value = row[columnName];
      if (value === null || value === undefined) {
        null_count++;
      } else if (typeof value === 'string' && value.trim() === '') {
        empty_count++;
      }
    });
    
    const total_rows = data.length;
    const missing = null_count + empty_count;
    const completeness = total_rows > 0 ? (total_rows - missing) / total_rows : 0;
    
    return { completeness, null_count, empty_count, total_rows };
  }

  /**
   * Validate validity - check values against patterns, ranges, enums
   * rule_config: { 
   *   type: 'pattern|range|enum|datatype',
   *   pattern: 'regex',
   *   min: number,
   *   max: number,
   *   allowed_values: [],
   *   datatype: 'string|number|date|email|phone'
   * }
   */
  async validateValidity(rule, data, metadata) {
    const violations = [];
    const config = rule.rule_config;
    const validationType = config.type;
    
    if (!rule.column_name) {
      systemLogger.warn('Validity rule requires column_name', { rule_id: rule.id });
      return violations;
    }
    
    data.forEach((row, rowIndex) => {
      const value = row[rule.column_name];
      
      // Skip null/empty values unless explicitly checking for them
      if (value === null || value === undefined || value === '') {
        return;
      }
      
      let isValid = true;
      let violationMessage = '';
      
      switch (validationType) {
        case 'pattern':
          if (config.pattern) {
            try {
              // Validate regex safety before creating RegExp
              validateRegexSafety(config.pattern);
              const regex = new RegExp(config.pattern);
              isValid = regex.test(String(value));
              violationMessage = `Value does not match pattern: ${config.pattern}`;
            } catch (e) {
              systemLogger.warn('Unsafe or invalid regex pattern in validity rule', { 
                pattern: config.pattern, 
                error: e.message 
              });
              isValid = true; // Skip validation for unsafe patterns
            }
          }
          break;
          
        case 'range':
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            if (config.min !== undefined && numValue < config.min) {
              isValid = false;
              violationMessage = `Value ${numValue} is less than minimum ${config.min}`;
            }
            if (config.max !== undefined && numValue > config.max) {
              isValid = false;
              violationMessage = `Value ${numValue} exceeds maximum ${config.max}`;
            }
          }
          break;
          
        case 'enum':
          if (config.allowed_values && Array.isArray(config.allowed_values)) {
            isValid = config.allowed_values.includes(value);
            violationMessage = `Value "${value}" not in allowed list: ${config.allowed_values.join(', ')}`;
          }
          break;
          
        case 'datatype':
          const datatypeCheck = this.validateDatatype(value, config.datatype);
          isValid = datatypeCheck.valid;
          violationMessage = datatypeCheck.message;
          break;
      }
      
      if (!isValid) {
        const primaryKeyColumn = metadata.primaryKeyColumn;
        const primaryKeyValue = primaryKeyColumn ? String(row[primaryKeyColumn] || '') : '';
        
        violations.push({
          rule_id: rule.id,
          file_id: metadata.file_id || null,
          job_id: metadata.job_id || null,
          row_number: rowIndex + 1,
          column_name: rule.column_name,
          expected_value: violationMessage.split(':')[0],
          actual_value: String(value),
          primary_key_column: primaryKeyColumn,
          primary_key_value: primaryKeyValue,
          violation_details: {
            rule_type: 'validity',
            validation_type: validationType,
            reason: violationMessage
          },
          severity: rule.severity,
          record_snapshot: row
        });
      }
    });
    
    return violations;
  }

  /**
   * Validate datatype
   */
  validateDatatype(value, datatype) {
    switch (datatype) {
      case 'number':
        return {
          valid: !isNaN(Number(value)),
          message: 'Value must be a valid number'
        };
      case 'email':
        // Use more specific pattern to prevent ReDoS attacks
        const emailRegex = /^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,}$/;
        return {
          valid: emailRegex.test(String(value)),
          message: 'Value must be a valid email address'
        };
      case 'phone':
        // Use a more specific pattern to prevent ReDoS attacks
        // Allow digits, spaces, hyphens, parentheses, and plus signs with reasonable limits
        const phoneRegex = /^[\d\s\-\(\)\+]{7,20}$/;
        const phoneStr = String(value);
        return {
          valid: phoneRegex.test(phoneStr) && phoneStr.replace(/\D/g, '').length >= 10,
          message: 'Value must be a valid phone number'
        };
      case 'date':
        const dateValue = new Date(value);
        return {
          valid: !isNaN(dateValue.getTime()),
          message: 'Value must be a valid date'
        };
      case 'string':
        return {
          valid: typeof value === 'string',
          message: 'Value must be a string'
        };
      default:
        return { valid: true, message: '' };
    }
  }

  /**
   * Validate record count - check that the file's row count meets expectations
   * rule_config: {
   *   operator: 'at_least' | 'exactly' | 'at_most' | 'between',
   *   expected_count: number (used by at_least / exactly / at_most),
   *   min_count: number (used by between),
   *   max_count: number (used by between),
   *   tolerance_percent: number (optional, 0-100)
   * }
   */
  async validateRecordCount(rule, data, metadata) {
    const violations = [];
    const config = typeof rule.rule_config === 'string' ? JSON.parse(rule.rule_config) : rule.rule_config;
    const operator = config.operator || 'exactly';
    const expectedCount = config.expected_count;
    const minCount = config.min_count;
    const maxCount = config.max_count;
    const tolerancePercent = config.tolerance_percent || 0;

    // Prefer the actual row count from metadata (full file) over the preview slice length
    const actualCount = metadata.actual_row_count !== undefined
      ? metadata.actual_row_count
      : data.length;

    let isViolation = false;
    let expectedValue = '';
    const actualValue = `${actualCount} records`;

    switch (operator) {
      case 'exactly': {
        const tolerance = tolerancePercent > 0
          ? Math.ceil(expectedCount * tolerancePercent / 100)
          : 0;
        isViolation = Math.abs(actualCount - expectedCount) > tolerance;
        expectedValue = tolerancePercent > 0
          ? `Exactly ${expectedCount} records (±${tolerancePercent}%)`
          : `Exactly ${expectedCount} records`;
        break;
      }
      case 'at_least': {
        const threshold = tolerancePercent > 0
          ? Math.floor(expectedCount * (1 - tolerancePercent / 100))
          : expectedCount;
        isViolation = actualCount < threshold;
        expectedValue = tolerancePercent > 0
          ? `At least ${expectedCount} records (−${tolerancePercent}% tolerance)`
          : `At least ${expectedCount} records`;
        break;
      }
      case 'at_most': {
        const threshold = tolerancePercent > 0
          ? Math.ceil(expectedCount * (1 + tolerancePercent / 100))
          : expectedCount;
        isViolation = actualCount > threshold;
        expectedValue = tolerancePercent > 0
          ? `At most ${expectedCount} records (+${tolerancePercent}% tolerance)`
          : `At most ${expectedCount} records`;
        break;
      }
      case 'between': {
        isViolation = actualCount < minCount || actualCount > maxCount;
        expectedValue = `Between ${minCount} and ${maxCount} records`;
        break;
      }
      default:
        systemLogger.warn('Unknown record_count operator', { rule_id: rule.id, operator });
        return violations;
    }

    if (isViolation) {
      violations.push({
        rule_id: rule.id,
        file_id: metadata.file_id || null,
        job_id: metadata.job_id || null,
        column_name: null,
        expected_value: expectedValue,
        actual_value: actualValue,
        violation_details: {
          rule_type: 'record_count',
          operator,
          expected_count: expectedCount,
          min_count: minCount,
          max_count: maxCount,
          actual_count: actualCount,
          tolerance_percent: tolerancePercent
        },
        severity: rule.severity
      });
    }

    return violations;
  }

  /**
   * Validate consistency - check for consistent formatting, cross-field relationships
   * rule_config: { 
   *   type: 'cross_field|format_consistency',
   *   expression: 'column1 > column2',
   *   columns: ['col1', 'col2']
   * }
   */
  async validateConsistency(rule, data, metadata) {
    const violations = [];
    const config = rule.rule_config;
    const consistencyType = config.type;
    
    if (consistencyType === 'cross_field' && config.expression) {
      // Evaluate cross-field expressions like "start_date < end_date"
      data.forEach((row, rowIndex) => {
        try {
          const isConsistent = this.evaluateExpression(config.expression, row);
          
          if (!isConsistent) {
            const primaryKeyColumn = metadata.primaryKeyColumn;
            const primaryKeyValue = primaryKeyColumn ? String(row[primaryKeyColumn] || '') : '';
            
            violations.push({
              rule_id: rule.id,
              file_id: metadata.file_id || null,
              job_id: metadata.job_id || null,
              row_number: rowIndex + 1,
              column_name: rule.column_name,
              expected_value: config.expression,
              actual_value: JSON.stringify(row),
              primary_key_column: primaryKeyColumn,
              primary_key_value: primaryKeyValue,
              violation_details: {
                rule_type: 'consistency',
                consistency_type: consistencyType,
                expression: config.expression
              },
              severity: rule.severity,
              record_snapshot: row
            });
          }
        } catch (error) {
          // Skip rows where expression can't be evaluated
        }
      });
    } else if (consistencyType === 'format_consistency') {
      // Check that all values in a column follow the same format pattern
      const formatPattern = this.detectFormatPattern(data, rule.column_name);
      
      data.forEach((row, rowIndex) => {
        const value = row[rule.column_name];
        if (value && !this.matchesFormatPattern(value, formatPattern)) {
          const primaryKeyColumn = metadata.primaryKeyColumn;
          const primaryKeyValue = primaryKeyColumn ? String(row[primaryKeyColumn] || '') : '';
          
          violations.push({
            rule_id: rule.id,
            file_id: metadata.file_id || null,
            job_id: metadata.job_id || null,
            row_number: rowIndex + 1,
            column_name: rule.column_name,
            expected_value: `Format: ${formatPattern.description}`,
            actual_value: String(value),
            primary_key_column: primaryKeyColumn,
            primary_key_value: primaryKeyValue,
            violation_details: {
              rule_type: 'consistency',
              consistency_type: consistencyType,
              expected_format: formatPattern.description
            },
            severity: rule.severity,
            record_snapshot: row
          });
        }
      });
    }
    
    return violations;
  }

  /**
   * Simple expression evaluator for cross-field validation
   */
  evaluateExpression(expression, row) {
    try {
      // Basic safety: only allow simple comparison operators
      const safeExpression = expression.replace(/[^a-zA-Z0-9_\s<>=!&|()]/g, '');
      
      // Replace column names with values
      let evaluableExpression = expression;
      for (const [key, value] of Object.entries(row)) {
        // Use a safer approach for variable replacement to avoid ReDoS
        // Escape the key to prevent regex injection
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedKey}\\b`, 'g');
        const safeValue = typeof value === 'string' ? `"${value}"` : value;
        evaluableExpression = evaluableExpression.replace(regex, safeValue);
      }
      
      // Evaluate using Function (safer than eval) - expression is sanitized and validated
      const result = new Function(`return ${evaluableExpression}`)(); // NOSONAR S1523 - Expression sanitized for data quality rules, controlled admin input only
      return Boolean(result);
    } catch (error) {
      systemLogger.debug('Expression evaluation failed', { expression, error: error.message });
      return true; // Don't flag as violation if we can't evaluate
    }
  }

  /**
   * Detect common format pattern in a column
   */
  detectFormatPattern(data, columnName) {
    // Sample first 100 rows to detect pattern
    const sample = data.slice(0, 100).map(row => row[columnName]).filter(v => v);
    
    if (sample.length === 0) {
      return { description: 'empty', pattern: null };
    }
    
    // Detect if it's a date pattern, phone pattern, etc.
    const firstValue = String(sample[0]);
    
    if (/^\d{4}-\d{2}-\d{2}/.test(firstValue)) {
      return { description: 'ISO date (YYYY-MM-DD)', pattern: /^\d{4}-\d{2}-\d{2}/ };
    }
    if (/^\d{2}\/\d{2}\/\d{4}/.test(firstValue)) {
      return { description: 'US date (MM/DD/YYYY)', pattern: /^\d{2}\/\d{2}\/\d{4}/ };
    }
    
    return { description: 'mixed format', pattern: null };
  }

  /**
   * Check if value matches detected format pattern
   */
  matchesFormatPattern(value, formatPattern) {
    if (!formatPattern.pattern) return true;
    return formatPattern.pattern.test(String(value));
  }

  /**
   * Validate uniqueness - check for duplicate values
   * rule_config: { columns: ['col1'] or ['col1', 'col2'] for composite uniqueness }
   */
  async validateUniqueness(rule, data, metadata) {
    const violations = [];
    const config = rule.rule_config;
    const columnsToCheck = config.columns || [rule.column_name];
    
    if (!columnsToCheck || columnsToCheck.length === 0) {
      systemLogger.warn('Uniqueness rule requires columns', { rule_id: rule.id });
      return violations;
    }
    
    // Track seen values
    const seen = new Map();
    
    data.forEach((row, rowIndex) => {
      // Create composite key
      const keyParts = columnsToCheck.map(col => row[col]);
      
      // Skip rows where any column is NULL/undefined/empty - these should be caught by completeness checks
      const hasNullValue = keyParts.some(val => val === null || val === undefined || val === '');
      if (hasNullValue) {
        return; // Skip this row - NULL values are not duplicates
      }
      
      const key = JSON.stringify(keyParts);
      
      if (seen.has(key)) {
        const firstOccurrence = seen.get(key);
        const primaryKeyColumn = metadata.primaryKeyColumn;
        
        // Get primary key value - try exact match first, then case-insensitive
        let primaryKeyValue = '';
        if (primaryKeyColumn) {
          primaryKeyValue = String(row[primaryKeyColumn] || '');
          
          // If empty, try case-insensitive match as fallback
          if (!primaryKeyValue && row) {
            const caseInsensitiveMatch = Object.keys(row).find(
              k => k.toLowerCase() === primaryKeyColumn.toLowerCase()
            );
            if (caseInsensitiveMatch) {
              primaryKeyValue = String(row[caseInsensitiveMatch] || '');
            }
          }
        }
        
        systemLogger.debug('Uniqueness violation primary key', {
          primaryKeyColumn,
          primaryKeyValue,
          rowIndex,
          rowKeys: Object.keys(row)
        });
        
        violations.push({
          rule_id: rule.id,
          file_id: metadata.file_id || null,
          job_id: metadata.job_id || null,
          row_number: rowIndex + 1,
          column_name: columnsToCheck.join(', '),
          expected_value: 'Unique value',
          actual_value: key,
          primary_key_column: primaryKeyColumn,
          primary_key_value: primaryKeyValue,
          violation_details: {
            rule_type: 'uniqueness',
            duplicate_of_row: firstOccurrence.row,
            columns_checked: columnsToCheck,
            duplicate_value: keyParts
          },
          severity: rule.severity,
          record_snapshot: row
        });
      } else {
        seen.set(key, { row: rowIndex + 1, value: keyParts });
      }
    });
    
    return violations;
  }

  /**
   * Validate freshness - check file timestamps, update timestamps
   * rule_config: { 
   *   max_age_hours: 24,
   *   timestamp_column: 'updated_at' (optional - check column values)
   * }
   */
  async validateFreshness(rule, data, metadata) {
    const violations = [];
    const config = rule.rule_config;
    const maxAgeHours = config.max_age_hours || 24;
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const now = new Date();
    
    // Check file upload timestamp
    if (metadata.upload_date) {
      const uploadDate = new Date(metadata.upload_date);
      const ageMs = now - uploadDate;
      
      if (ageMs > maxAgeMs) {
        violations.push({
          rule_id: rule.id,
          file_id: metadata.file_id || null,
          job_id: metadata.job_id || null,
          column_name: null,
          expected_value: `File age < ${maxAgeHours} hours`,
          actual_value: `File age: ${(ageMs / (60 * 60 * 1000)).toFixed(1)} hours`,
          violation_details: {
            rule_type: 'freshness',
            max_age_hours: maxAgeHours,
            actual_age_hours: ageMs / (60 * 60 * 1000),
            upload_date: uploadDate.toISOString()
          },
          severity: rule.severity
        });
      }
    }
    
    // Check timestamp column if specified
    if (config.timestamp_column && rule.column_name) {
      data.forEach((row, rowIndex) => {
        const timestamp = row[rule.column_name];
        if (timestamp) {
          const rowDate = new Date(timestamp);
          const ageMs = now - rowDate;
          
          if (ageMs > maxAgeMs) {
            violations.push({
              rule_id: rule.id,
              file_id: metadata.file_id || null,
              job_id: metadata.job_id || null,
              row_number: rowIndex + 1,
              column_name: rule.column_name,
              expected_value: `Timestamp < ${maxAgeHours} hours old`,
              actual_value: `${(ageMs / (60 * 60 * 1000)).toFixed(1)} hours old`,
              violation_details: {
                rule_type: 'freshness',
                max_age_hours: maxAgeHours,
                actual_age_hours: ageMs / (60 * 60 * 1000),
                timestamp: rowDate.toISOString()
              },
              severity: rule.severity
            });
          }
        }
      });
    }
    
    return violations;
  }

  /**
   * Persist violations to database
   * @param {Array} violations - Array of violation objects
   * @param {Array} data - Original data rows (optional, for record snapshot)
   * @param {string} context - Context: 'file_upload' or 'etl_job'
   * @returns {Promise<void>}
   */
  async persistViolations(violations, data = null, context = 'file_upload') {
    if (violations.length === 0) return;
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Fetch quality rule configurations for all unique file_id + rule_id combinations
      const configMap = new Map();
      const uniqueCombos = [...new Set(violations.map(v => `${v.file_id || 'null'}:${v.rule_id}`))];
      
      for (const combo of uniqueCombos) {
        const [fileId, ruleId] = combo.split(':');
        if (fileId !== 'null') {
          const configResult = await client.query(
            `SELECT error_action, apply_to FROM quality_rule_configurations 
             WHERE file_id = $1 AND rule_id = $2 AND enabled = true`,
            [fileId, parseInt(ruleId)]
          );
          if (configResult.rows.length > 0) {
            const config = configResult.rows[0];
            // Check if this configuration applies to current context
            if (config.apply_to === 'both' || config.apply_to === context) {
              configMap.set(combo, config.error_action);
            }
          }
        }
      }
      
      let shouldAbort = false;
      const abortReasons = [];
      
      for (const violation of violations) {
        const comboKey = `${violation.file_id || 'null'}:${violation.rule_id}`;
        const errorAction = configMap.get(comboKey) || 'log_continue';
        
        // Capture record snapshot if data is provided
        let recordSnapshot = null;
        if (data && violation.row_number && violation.row_number <= data.length) {
          recordSnapshot = data[violation.row_number - 1];
        }
        
        await client.query(
          `INSERT INTO quality_rule_violations 
          (rule_id, file_id, job_id, row_number, column_name, expected_value, actual_value, 
           violation_details, severity, status, processing_action, record_snapshot)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            violation.rule_id,
            violation.file_id,
            violation.job_id,
            violation.row_number,
            violation.column_name,
            violation.expected_value,
            violation.actual_value,
            JSON.stringify(violation.violation_details),
            violation.severity,
            'new', // Default status
            errorAction,
            recordSnapshot ? JSON.stringify(recordSnapshot) : null
          ]
        );
        
        // Track if we should abort
        if (errorAction === 'log_abort') {
          shouldAbort = true;
          abortReasons.push({
            rule_id: violation.rule_id,
            file_id: violation.file_id,
            row_number: violation.row_number,
            severity: violation.severity
          });
        }
      }
      
      await client.query('COMMIT');
      systemLogger.info('Quality rule violations persisted', { 
        count: violations.length,
        abort_triggered: shouldAbort 
      });
      
      // Throw error if any violation requires aborting
      if (shouldAbort) {
        const error = new Error('Quality check failed: One or more violations configured to abort processing');
        error.code = 'QUALITY_ABORT';
        error.violations = abortReasons;
        throw error;
      }
    } catch (error) {
      await client.query('ROLLBACK');
      
      // Re-throw QUALITY_ABORT errors
      if (error.code === 'QUALITY_ABORT') {
        throw error;
      }
      
      systemLogger.error('Failed to persist violations', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Persist errors to appropriate error table
   * @param {Array} errors - Array of error objects
   * @param {string} context - 'file' or 'mapping_job'
   * @param {string} entityId - file_id or job_id
   * @returns {Promise<void>}
   */
  async persistErrors(errors, context, entityId) {
    if (errors.length === 0) return;
    
    const tableName = context === 'file' ? 'file_errors' : 'mapping_job_errors';
    const idColumn = context === 'file' ? 'file_id' : 'job_id';
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      for (const error of errors) {
        const query = context === 'file'
          ? `INSERT INTO file_errors (file_id, error_type, severity, row_number, column_name, error_message, error_details)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`
          : `INSERT INTO mapping_job_errors (job_id, mapping_id, error_type, severity, row_number, column_name, error_message, error_details)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
        
        const params = context === 'file'
          ? [entityId, error.error_type, error.severity, error.row_number, error.column_name, error.error_message, JSON.stringify(error.error_details || {})]
          : [entityId, error.mapping_id, error.error_type, error.severity, error.row_number, error.column_name, error.error_message, JSON.stringify(error.error_details || {})];
        
        await client.query(query, params);
      }
      
      await client.query('COMMIT');
      systemLogger.info('Errors persisted', { context, count: errors.length });
    } catch (error) {
      await client.query('ROLLBACK');
      systemLogger.error('Failed to persist errors', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generic validity check - validates values against patterns, datatypes, or custom rules
   * rule_config: { 
   *   pattern: 'regex pattern',
   *   datatype: 'string|number|email|phone|date|boolean',
   *   custom_message: 'Custom error message'
   * }
   */
  async validateValidityCheck(rule, data, metadata) {
    const violations = [];
    const config = rule.rule_config || {};
    
    if (!rule.column_name) {
      systemLogger.warn('validity_check rule requires column_name', { rule_id: rule.id });
      return violations;
    }
    
    data.forEach((row, rowIndex) => {
      const value = row[rule.column_name];
      
      if (value === null || value === undefined || value === '') {
        return;
      }
      
      let isValid = true;
      let violationMessage = config.custom_message || 'Value failed validity check';
      
      if (config.pattern) {
        try {
          // Validate regex safety before creating RegExp
          validateRegexSafety(config.pattern);
          const regex = new RegExp(config.pattern);
          isValid = regex.test(String(value));
          violationMessage = config.custom_message || `Value does not match pattern: ${config.pattern}`;
        } catch (e) {
          systemLogger.warn('Unsafe or invalid regex pattern in validity_check', { 
            pattern: config.pattern, 
            error: e.message 
          });
          isValid = true; // Skip validation for unsafe patterns
        }
      } else if (config.datatype) {
        const check = this.validateDatatype(value, config.datatype);
        isValid = check.valid;
        violationMessage = config.custom_message || check.message;
      }
      
      if (!isValid) {
        const primaryKeyColumn = metadata.primaryKeyColumn;
        const primaryKeyValue = primaryKeyColumn ? String(row[primaryKeyColumn] || '') : '';
        
        violations.push({
          rule_id: rule.id,
          file_id: metadata.file_id || null,
          job_id: metadata.job_id || null,
          row_number: rowIndex + 1,
          column_name: rule.column_name,
          expected_value: 'Valid value',
          actual_value: String(value),
          primary_key_column: primaryKeyColumn,
          primary_key_value: primaryKeyValue,
          violation_details: {
            rule_type: 'validity_check',
            pattern: config.pattern,
            datatype: config.datatype,
            reason: violationMessage
          },
          severity: rule.severity || 'warning',
          record_snapshot: row
        });
      }
    });
    
    return violations;
  }

  /**
   * Length check - validates string length within min/max bounds
   * rule_config: { 
   *   min_length: number,
   *   max_length: number,
   *   exact_length: number (optional, overrides min/max if set)
   * }
   */
  async validateLengthCheck(rule, data, metadata) {
    const violations = [];
    const config = rule.rule_config || {};
    
    if (!rule.column_name) {
      systemLogger.warn('length_check rule requires column_name', { rule_id: rule.id });
      return violations;
    }
    
    const minLength = config.min_length !== undefined ? config.min_length : null;
    const maxLength = config.max_length !== undefined ? config.max_length : null;
    const exactLength = config.exact_length !== undefined ? config.exact_length : null;
    
    data.forEach((row, rowIndex) => {
      const value = row[rule.column_name];
      
      if (value === null || value === undefined) {
        return;
      }
      
      const strValue = String(value);
      const length = strValue.length;
      let isValid = true;
      let violationMessage = '';
      
      if (exactLength !== null) {
        if (length !== exactLength) {
          isValid = false;
          violationMessage = `Length must be exactly ${exactLength} characters (actual: ${length})`;
        }
      } else {
        if (minLength !== null && length < minLength) {
          isValid = false;
          violationMessage = `Length must be at least ${minLength} characters (actual: ${length})`;
        }
        if (maxLength !== null && length > maxLength) {
          isValid = false;
          violationMessage = `Length must be at most ${maxLength} characters (actual: ${length})`;
        }
        if (!isValid && minLength !== null && maxLength !== null) {
          violationMessage = `Length must be between ${minLength} and ${maxLength} characters (actual: ${length})`;
        }
      }
      
      if (!isValid) {
        const primaryKeyColumn = metadata.primaryKeyColumn;
        const primaryKeyValue = primaryKeyColumn ? String(row[primaryKeyColumn] || '') : '';
        
        violations.push({
          rule_id: rule.id,
          file_id: metadata.file_id || null,
          job_id: metadata.job_id || null,
          row_number: rowIndex + 1,
          column_name: rule.column_name,
          expected_value: exactLength !== null 
            ? `Exactly ${exactLength} characters` 
            : `${minLength || 0} - ${maxLength || 'unlimited'} characters`,
          actual_value: `"${strValue}" (${length} characters)`,
          primary_key_column: primaryKeyColumn,
          primary_key_value: primaryKeyValue,
          violation_details: {
            rule_type: 'length_check',
            min_length: minLength,
            max_length: maxLength,
            exact_length: exactLength,
            actual_length: length,
            reason: violationMessage
          },
          severity: rule.severity || 'warning',
          record_snapshot: row
        });
      }
    });
    
    return violations;
  }

  /**
   * Range check - validates numeric values within min/max bounds
   * rule_config: { 
   *   min: number,
   *   max: number,
   *   exclusive_min: boolean (optional, default false),
   *   exclusive_max: boolean (optional, default false)
   * }
   */
  async validateRangeCheck(rule, data, metadata) {
    const violations = [];
    const config = rule.rule_config || {};
    
    if (!rule.column_name) {
      systemLogger.warn('range_check rule requires column_name', { rule_id: rule.id });
      return violations;
    }
    
    const min = config.min !== undefined ? Number(config.min) : null;
    const max = config.max !== undefined ? Number(config.max) : null;
    const exclusiveMin = config.exclusive_min || false;
    const exclusiveMax = config.exclusive_max || false;
    
    data.forEach((row, rowIndex) => {
      const value = row[rule.column_name];
      
      if (value === null || value === undefined || value === '') {
        return;
      }
      
      const numValue = Number(value);
      
      if (isNaN(numValue)) {
        const primaryKeyColumn = metadata.primaryKeyColumn;
        const primaryKeyValue = primaryKeyColumn ? String(row[primaryKeyColumn] || '') : '';
        
        violations.push({
          rule_id: rule.id,
          file_id: metadata.file_id || null,
          job_id: metadata.job_id || null,
          row_number: rowIndex + 1,
          column_name: rule.column_name,
          expected_value: 'Numeric value',
          actual_value: String(value),
          primary_key_column: primaryKeyColumn,
          primary_key_value: primaryKeyValue,
          violation_details: {
            rule_type: 'range_check',
            reason: 'Value is not a valid number'
          },
          severity: rule.severity || 'warning',
          record_snapshot: row
        });
        return;
      }
      
      let isValid = true;
      let violationMessage = '';
      
      if (min !== null) {
        if (exclusiveMin ? numValue <= min : numValue < min) {
          isValid = false;
          violationMessage = `Value ${numValue} is ${exclusiveMin ? 'not greater than' : 'less than'} minimum ${min}`;
        }
      }
      
      if (max !== null) {
        if (exclusiveMax ? numValue >= max : numValue > max) {
          isValid = false;
          violationMessage = `Value ${numValue} is ${exclusiveMax ? 'not less than' : 'greater than'} maximum ${max}`;
        }
      }
      
      if (!isValid && min !== null && max !== null) {
        const minOp = exclusiveMin ? '>' : '>=';
        const maxOp = exclusiveMax ? '<' : '<=';
        violationMessage = `Value ${numValue} is not in range ${min} ${minOp} x ${maxOp} ${max}`;
      }
      
      if (!isValid) {
        const primaryKeyColumn = metadata.primaryKeyColumn;
        const primaryKeyValue = primaryKeyColumn ? String(row[primaryKeyColumn] || '') : '';
        
        violations.push({
          rule_id: rule.id,
          file_id: metadata.file_id || null,
          job_id: metadata.job_id || null,
          row_number: rowIndex + 1,
          column_name: rule.column_name,
          expected_value: `${min !== null ? min : '-inf'} to ${max !== null ? max : '+inf'}`,
          actual_value: String(numValue),
          primary_key_column: primaryKeyColumn,
          primary_key_value: primaryKeyValue,
          violation_details: {
            rule_type: 'range_check',
            min: min,
            max: max,
            exclusive_min: exclusiveMin,
            exclusive_max: exclusiveMax,
            reason: violationMessage
          },
          severity: rule.severity || 'warning',
          record_snapshot: row
        });
      }
    });
    
    return violations;
  }

  /**
   * Validate date / timestamp format.
   * rule_config options (all optional):
   *   format  — human-readable token string, e.g. "MM/DD/YYYY" or "YYYY-MM-DD HH:mm:ss".
   *             Tokens YYYY, MM, DD, HH, mm, ss are converted to \d{N} patterns.
   *   pattern — raw regex string (takes precedence over format).
   * Falls back to broad date/timestamp regexes when neither is supplied.
   * @param {boolean} isTimestamp - when true, use a timestamp-aware fallback regex.
   */
  validateDateFormat(rule, data, metadata, isTimestamp = false) {
    const violations = [];
    const config = typeof rule.rule_config === 'string'
      ? JSON.parse(rule.rule_config)
      : (rule.rule_config || {});

    // Resolve the column to validate: quality_rules.column_name > rule_config.column_name > rule_config.column
    const columnToValidate = rule.column_name || config.column_name || config.column || null;
    if (!columnToValidate) {
      systemLogger.warn('date_format rule requires column_name', {
        rule_id: rule.id,
        rule_config_keys: Object.keys(config),
        hint: 'Set column_name on the quality_rules row, or add column_name/column to rule_config'
      });
      return violations;
    }

    // Build the test regex from config.pattern > config.format > built-in fallback
    let testRegex;
    try {
      if (config.pattern) {
        validateRegexSafety(config.pattern);
        testRegex = new RegExp(config.pattern);
      } else if (config.format) {
        // Convert format tokens to regex fragments (e.g. "MM/DD/YYYY" → /^\d{2}\/\d{2}\/\d{4}$/)
        const escaped = config.format
          .replace(/YYYY/g, '\\d{4}')
          .replace(/MM/g,   '\\d{2}')
          .replace(/DD/g,   '\\d{2}')
          .replace(/HH/g,   '\\d{2}')
          .replace(/mm/g,   '\\d{2}')
          .replace(/ss/g,   '\\d{2}')
          .replace(/[.+?^${}()|[\]\\]/g, c => c === '\\' ? c : `\\${c}`);
        testRegex = new RegExp(`^${escaped}$`);
      } else if (isTimestamp) {
        // ISO 8601 and common timestamp variants
        testRegex = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;
      } else {
        // YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY
        testRegex = /^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}$|^\d{2}-\d{2}-\d{4}$/;
      }
    } catch (e) {
      systemLogger.warn('Invalid pattern in date_format rule, skipping', { rule_id: rule.id, error: e.message });
      return violations;
    }

    const expectedDesc = config.format || config.pattern || (isTimestamp ? 'timestamp format' : 'date format (YYYY-MM-DD or MM/DD/YYYY)');
    const primaryKeyColumn = metadata.primaryKeyColumn;

    data.forEach((row, rowIndex) => {
      const value = row[rule.column_name];

      // Skip null / empty — completeness rules handle those separately
      if (value === null || value === undefined || String(value).trim() === '') return;

      const strValue = String(value).trim();
      if (!testRegex.test(strValue)) {
        violations.push({
          rule_id: rule.id,
          file_id: metadata.file_id || null,
          job_id: metadata.job_id || null,
          row_number: rowIndex + 1,
          column_name: rule.column_name,
          expected_value: expectedDesc,
          actual_value: strValue,
          primary_key_column: primaryKeyColumn,
          primary_key_value: primaryKeyColumn ? String(row[primaryKeyColumn] || '') : '',
          violation_details: {
            rule_type: isTimestamp ? 'timestamp_format' : 'date_format',
            expected_format: expectedDesc,
            reason: `Value "${strValue}" does not match expected ${isTimestamp ? 'timestamp' : 'date'} format: ${expectedDesc}`
          },
          severity: rule.severity || 'warning',
          record_snapshot: row
        });
      }
    });

    return violations;
  }
}

module.exports = QualityValidationEngine;
