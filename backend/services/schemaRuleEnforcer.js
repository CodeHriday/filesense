/**
 * Schema Rule Enforcer
 *
 * Enforces quality_rules declared per-column in a contract schema.
 * When a file is uploaded against a contract, each column's declared rule types
 * run automatically during profiling — no manual "Assign Rules" step needed.
 *
 * Maps schema-level rule type names to QualityValidationEngine-compatible
 * rule types and configs, creates/reuses canonical system quality_rules rows,
 * wires file_quality_rules associations, runs validation, and persists violations.
 */

const QualityValidationEngine = require('./qualityValidationEngine');
const { systemLogger } = require('../utils/logger');

/**
 * Rule types exposed in the UI and their mapping to the engine.
 *
 * QualityValidationEngine.executeRule handles:
 *   completeness, validity, consistency, uniqueness, freshness,
 *   record_count, validity_check, length_check, range_check
 *
 * We map each UI alias to one of those engine types plus a concrete
 * default rule_config so validation actually fires without further setup.
 */
const RULE_TYPE_MAP = {
  // null / completeness checks → completeness (threshold 1.0 = 0 nulls allowed)
  null_check:          { engineType: 'completeness',  config: { threshold: 1.0 } },
  column_completeness: { engineType: 'completeness',  config: { threshold: 1.0 } },
  isna_check:          { engineType: 'completeness',  config: { threshold: 1.0 } },

  // duplicate / uniqueness checks → uniqueness
  duplicate_check: { engineType: 'uniqueness', config: {} },
  uniqueness:      { engineType: 'uniqueness', config: {} },

  // format / datatype checks → validity with type:'datatype'
  email_validity:       { engineType: 'validity', config: { type: 'datatype', datatype: 'email'  } },
  phone_validity:       { engineType: 'validity', config: { type: 'datatype', datatype: 'phone'  } },
  date_format:          { engineType: 'validity', config: { type: 'datatype', datatype: 'date'   } },
  timestamp_format:     { engineType: 'validity', config: { type: 'datatype', datatype: 'date'   } },
  numeric_only_string:  { engineType: 'validity', config: { type: 'datatype', datatype: 'number' } },

  // length / range checks — keep engine types, use correct key names
  length_check: { engineType: 'length_check', config: { min_length: 0, max_length: 255 } },
  range_check:  { engineType: 'range_check',  config: { min: 0, max: 999999 } },

  // special_character_presence — map to a validity_check with a pattern
  // that flags values containing any non-alphanumeric character
  special_character_presence: {
    engineType: 'validity_check',
    config: { pattern: '^[a-zA-Z0-9\\s]+$', custom_message: 'Value contains special characters' }
  },

  // validity_check — no useful default without user config; expose as-is so
  // existing schemas that already carry explicit config still work
  validity_check: { engineType: 'validity_check', config: {} }
};

/** Rule types that users can assign through the FileSchemaManager UI. */
const SUPPORTED_RULE_TYPES = Object.keys(RULE_TYPE_MAP);

/**
 * Resolve a UI rule type name to the engine type + config it requires.
 * Returns null for unknown types.
 */
function resolveRuleType(uiRuleType) {
  const lower = (uiRuleType || '').toLowerCase().trim();
  return RULE_TYPE_MAP[lower] || null;
}

/**
 * Find or create a canonical system quality_rules row for a specific
 * uiRuleType + columnName combination.
 *
 * The row uses:
 *   rule_name   = '__schema_default__<uiRuleType>'   (unique UI-visible label)
 *   rule_type   = <engineType>                        (what the engine understands)
 *   column_name = <columnName>
 *   project_id  = NULL                               (global system rule)
 *
 * @param {Object} db
 * @param {string} uiRuleType   - The rule name from the schema column (e.g. 'null_check')
 * @param {string} columnName
 * @param {string} severity
 * @returns {Promise<Object|null>}
 */
async function findOrCreateSchemaRule(db, uiRuleType, columnName, severity = 'warning') {
  const ruleName   = `__schema_default__${uiRuleType}`;
  const resolution = resolveRuleType(uiRuleType);
  if (!resolution) return null;

  const { engineType, config } = resolution;

  // 1. Look for an existing system rule for this UI type + column
  const existing = await db.query(
    `SELECT id, rule_name, rule_type, column_name, rule_config, severity, enabled
     FROM quality_rules
     WHERE rule_name = $1 AND column_name = $2 AND project_id IS NULL
     LIMIT 1`,
    [ruleName, columnName]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  // 2. Not found — create it
  try {
    const result = await db.query(
      `INSERT INTO quality_rules
         (rule_name, rule_type, description, column_name, rule_config, severity, enabled, project_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, NULL, NULL)
       RETURNING id, rule_name, rule_type, column_name, rule_config, severity, enabled`,
      [
        ruleName,
        engineType,
        `Schema-enforced ${uiRuleType} check on column "${columnName}"`,
        columnName,
        JSON.stringify(config),
        severity
      ]
    );
    return result.rows[0] || null;
  } catch (insertErr) {
    // Concurrent insert race — find the winner
    if (insertErr.code === '23505') {
      const retry = await db.query(
        `SELECT id, rule_name, rule_type, column_name, rule_config, severity, enabled
         FROM quality_rules
         WHERE rule_name = $1 AND column_name = $2 AND project_id IS NULL
         LIMIT 1`,
        [ruleName, columnName]
      );
      return retry.rows[0] || null;
    }
    throw insertErr;
  }
}

/**
 * Enforce schema-defined quality rules for an uploaded file.
 *
 * For each column in schemaColumns that carries a quality_rules array:
 *  1. Resolves the UI rule type to an engine-compatible rule + config
 *  2. Finds or creates a canonical system quality_rules DB row
 *  3. Associates that rule with the file via file_quality_rules
 *  4. Runs all collected rules through QualityValidationEngine
 *  5. Persists violations to quality_rule_violations
 *
 * Non-fatal — caller should catch QUALITY_ABORT specifically and let
 * everything else be logged without failing the upload.
 *
 * @param {Object}  db            - pg Pool or Client
 * @param {string}  fileId
 * @param {Array}   schemaColumns - Schema column array (each may have quality_rules:[...])
 * @param {Array}   previewData   - Sample rows (up to 100)
 * @param {number}  rowCount      - Total file row count
 * @param {Object}  [options]
 * @param {string}  [options.fileName]
 * @returns {Promise<Object>}
 */
async function enforceSchemaRules(db, fileId, schemaColumns, previewData, rowCount, options = {}) {
  if (!schemaColumns || !Array.isArray(schemaColumns) || schemaColumns.length === 0) {
    return { executed: false, reason: 'No schema columns provided' };
  }

  const columnsWithRules = schemaColumns.filter(
    col => col.quality_rules && Array.isArray(col.quality_rules) && col.quality_rules.length > 0
  );
  if (columnsWithRules.length === 0) {
    return { executed: false, reason: 'No schema quality_rules defined on any column' };
  }
  if (!previewData || previewData.length === 0) {
    systemLogger.warn('[schemaRuleEnforcer] No preview data available for enforcement', { fileId });
    return { executed: false, reason: 'No preview data available' };
  }

  systemLogger.info('[schemaRuleEnforcer] Enforcing schema quality rules', {
    fileId,
    columnCount: columnsWithRules.length,
    totalRules: columnsWithRules.reduce((n, col) => n + col.quality_rules.length, 0)
  });

  const createdRules = [];
  const ruleErrors  = [];

  for (const col of columnsWithRules) {
    const columnName = col.name || col.column_name;
    if (!columnName) continue;

    for (const uiRuleType of col.quality_rules) {
      const normalized = (uiRuleType || '').toLowerCase().trim();
      if (!RULE_TYPE_MAP[normalized]) {
        systemLogger.warn('[schemaRuleEnforcer] Unknown rule type — skipping', {
          fileId, columnName, uiRuleType
        });
        continue;
      }

      try {
        const rule = await findOrCreateSchemaRule(db, normalized, columnName, 'warning');
        if (!rule) {
          ruleErrors.push({ columnName, uiRuleType, error: 'rule row not created' });
          continue;
        }

        createdRules.push(rule);

        await db.query(
          `INSERT INTO file_quality_rules (file_id, quality_rule_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [fileId, rule.id]
        );
      } catch (err) {
        systemLogger.error('[schemaRuleEnforcer] Failed to find/create schema rule', {
          fileId, columnName, uiRuleType, error: err.message
        });
        ruleErrors.push({ columnName, uiRuleType, error: err.message });
      }
    }
  }

  if (createdRules.length === 0) {
    systemLogger.warn('[schemaRuleEnforcer] No rules could be created/found', { fileId, ruleErrors });
    return { executed: false, reason: 'No rules could be resolved', errors: ruleErrors };
  }

  const engine   = new QualityValidationEngine(db);
  const metadata = {
    file_id:          fileId,
    file_name:        options.fileName || fileId,
    upload_date:      new Date(),
    actual_row_count: rowCount
  };

  let validationResult;
  try {
    validationResult = await engine.validateData(createdRules, previewData, metadata);
  } catch (validationErr) {
    systemLogger.error('[schemaRuleEnforcer] validateData threw', {
      fileId, error: validationErr.message
    });
    return { executed: false, reason: validationErr.message, errors: ruleErrors };
  }

  systemLogger.info('[schemaRuleEnforcer] Validation completed', {
    fileId,
    rulesRun:   createdRules.length,
    violations: validationResult.violations.length,
    errors:     validationResult.errors.length
  });

  if (validationResult.violations.length > 0) {
    try {
      await engine.persistViolations(validationResult.violations, previewData, 'schema_enforcement');
    } catch (persistErr) {
      if (persistErr.code === 'QUALITY_ABORT') throw persistErr;
      systemLogger.error('[schemaRuleEnforcer] Failed to persist violations', {
        fileId, error: persistErr.message
      });
    }
  }

  return {
    executed:       true,
    rulesEnforced:  createdRules.length,
    violationCount: validationResult.violations.length,
    summary:        validationResult.summary,
    errors:         ruleErrors
  };
}

/**
 * Validate schema column quality_rules inline (no DB persistence).
 * Used by FastSchemaValidationService where a persistent file_id may not exist.
 *
 * Builds synthetic rule objects mapped to engine-compatible types,
 * runs them through FastSchemaValidationService.executeRule's logic,
 * and returns a summary suitable for embedding in the validation response.
 *
 * @param {Array}  schemaColumns
 * @param {Array}  sampleData
 * @param {Object} metadata
 * @returns {Promise<Object>}
 */
async function validateSchemaRulesInline(schemaColumns, sampleData, metadata) {
  if (!schemaColumns || !Array.isArray(schemaColumns) || schemaColumns.length === 0) {
    return { executed: false, reason: 'No schema columns' };
  }
  const columnsWithRules = schemaColumns.filter(
    col => col.quality_rules && Array.isArray(col.quality_rules) && col.quality_rules.length > 0
  );
  if (columnsWithRules.length === 0) {
    return { executed: false, reason: 'No schema quality_rules defined' };
  }
  if (!sampleData || sampleData.length === 0) {
    return { executed: false, reason: 'No sample data' };
  }

  // Build synthetic rule objects using the resolved engine types
  const syntheticRules = [];
  for (const col of columnsWithRules) {
    const columnName = col.name || col.column_name;
    if (!columnName) continue;
    for (const uiRuleType of col.quality_rules) {
      const normalized  = (uiRuleType || '').toLowerCase().trim();
      const resolution  = resolveRuleType(normalized);
      if (!resolution) continue;
      syntheticRules.push({
        id:          `synthetic_${normalized}_${columnName}`,
        rule_name:   `__schema_default__${normalized}`,
        rule_type:   resolution.engineType,
        column_name: columnName,
        rule_config: resolution.config,
        severity:    'warning',
        enabled:     true
      });
    }
  }

  if (syntheticRules.length === 0) {
    return { executed: false, reason: 'No valid rule types found' };
  }

  const violations  = [];
  const ruleResults = [];
  let rulesPassed   = 0;

  for (const rule of syntheticRules) {
    try {
      const ruleViolations = await executeRuleInline(rule, sampleData, metadata);
      const passed = ruleViolations.length === 0;
      if (passed) rulesPassed++;
      else violations.push(...ruleViolations.slice(0, 10));
      ruleResults.push({
        uiRuleType:     rule.rule_name.replace('__schema_default__', ''),
        engineRuleType: rule.rule_type,
        columnName:     rule.column_name,
        violationCount: ruleViolations.length,
        passed
      });
    } catch (err) {
      ruleResults.push({
        uiRuleType:     rule.rule_name.replace('__schema_default__', ''),
        engineRuleType: rule.rule_type,
        columnName:     rule.column_name,
        error:          err.message,
        passed:         false
      });
    }
  }

  return {
    executed:       true,
    rulesValidated: syntheticRules.length,
    rulesPassed,
    violationCount: violations.length,
    violations:     violations.slice(0, 50),
    ruleResults,
    status:         violations.length > 0 ? 'failed' : 'passed'
  };
}

/**
 * Lightweight inline rule execution for validateSchemaRulesInline.
 * Uses already-resolved engine rule types so every supported type
 * actually produces violations.
 */
async function executeRuleInline(rule, data, metadata) {
  const violations = [];
  const engineType = (rule.rule_type || '').toLowerCase();
  const col        = rule.column_name;
  const config     = rule.rule_config || {};

  switch (engineType) {
    case 'completeness': {
      // null / isna / column_completeness checks
      const threshold = config.threshold !== undefined ? config.threshold : 1.0;
      let nullCount = 0;
      data.forEach(row => {
        const val = row[col];
        if (val === null || val === undefined || String(val).trim() === '') nullCount++;
      });
      const actual = data.length > 0 ? (data.length - nullCount) / data.length : 1;
      if (actual < threshold) {
        violations.push({
          rule_id:          rule.id,
          column_name:      col,
          expected_value:   `${(threshold * 100).toFixed(1)}% non-null`,
          actual_value:     `${(actual * 100).toFixed(1)}% non-null (${nullCount} nulls)`,
          severity:         rule.severity,
          violation_details: { rule_type: engineType }
        });
      }
      break;
    }

    case 'uniqueness': {
      const seen = new Map();
      data.forEach((row, i) => {
        const val = row[col];
        if (val === null || val === undefined || val === '') return;
        const key = String(val);
        if (seen.has(key)) {
          violations.push({
            rule_id:          rule.id,
            column_name:      col,
            row_number:       i + 1,
            expected_value:   'Unique value',
            actual_value:     key,
            severity:         rule.severity,
            violation_details: { rule_type: engineType, duplicate_of_row: seen.get(key) }
          });
        } else {
          seen.set(key, i + 1);
        }
      });
      break;
    }

    case 'validity': {
      // datatype-based checks: email, phone, date, number
      const { type: validationType, datatype } = config;
      if (validationType === 'datatype' && datatype) {
        const patterns = {
          email:  /^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,}$/,
          phone:  /^[\d\s\-\(\)\+]{7,20}$/,
          number: /^-?\d+(\.\d+)?$/
        };
        data.forEach((row, i) => {
          const val = row[col];
          if (val === null || val === undefined || val === '') return;
          const str  = String(val).trim();
          let isValid = true;
          if (datatype === 'email')  isValid = patterns.email.test(str);
          else if (datatype === 'phone') isValid = patterns.phone.test(str) && str.replace(/\D/g, '').length >= 10;
          else if (datatype === 'number') isValid = patterns.number.test(str);
          else if (datatype === 'date') isValid = !isNaN(new Date(str).getTime());
          if (!isValid) {
            violations.push({
              rule_id:          rule.id,
              column_name:      col,
              row_number:       i + 1,
              expected_value:   `Valid ${datatype}`,
              actual_value:     str,
              severity:         rule.severity,
              violation_details: { rule_type: engineType, datatype }
            });
          }
        });
      }
      break;
    }

    case 'validity_check': {
      if (config.pattern) {
        try {
          const regex = new RegExp(config.pattern);
          data.forEach((row, i) => {
            const val = row[col];
            if (val === null || val === undefined || val === '') return;
            if (!regex.test(String(val))) {
              violations.push({
                rule_id:          rule.id,
                column_name:      col,
                row_number:       i + 1,
                expected_value:   config.custom_message || `Matches pattern ${config.pattern}`,
                actual_value:     String(val),
                severity:         rule.severity,
                violation_details: { rule_type: engineType, pattern: config.pattern }
              });
            }
          });
        } catch (_) { /* unsafe pattern — skip */ }
      }
      break;
    }

    case 'length_check': {
      const minLen = config.min_length !== undefined ? config.min_length : null;
      const maxLen = config.max_length !== undefined ? config.max_length : null;
      data.forEach((row, i) => {
        const val = row[col];
        if (val === null || val === undefined) return;
        const len = String(val).length;
        if ((minLen !== null && len < minLen) || (maxLen !== null && len > maxLen)) {
          violations.push({
            rule_id:          rule.id,
            column_name:      col,
            row_number:       i + 1,
            expected_value:   `Length ${minLen || 0}–${maxLen !== null ? maxLen : '∞'}`,
            actual_value:     `Length ${len}`,
            severity:         rule.severity,
            violation_details: { rule_type: engineType, min_length: minLen, max_length: maxLen, actual_length: len }
          });
        }
      });
      break;
    }

    case 'range_check': {
      const min = config.min !== undefined ? Number(config.min) : null;
      const max = config.max !== undefined ? Number(config.max) : null;
      data.forEach((row, i) => {
        const val = row[col];
        if (val === null || val === undefined || val === '') return;
        const num = Number(val);
        if (isNaN(num)) return;
        if ((min !== null && num < min) || (max !== null && num > max)) {
          violations.push({
            rule_id:          rule.id,
            column_name:      col,
            row_number:       i + 1,
            expected_value:   `Range ${min !== null ? min : '−∞'} – ${max !== null ? max : '∞'}`,
            actual_value:     String(num),
            severity:         rule.severity,
            violation_details: { rule_type: engineType, min, max, actual: num }
          });
        }
      });
      break;
    }

    default:
      break;
  }

  return violations;
}

/**
 * Enforce schema-defined quality rules during a VM job execution.
 *
 * Unlike enforceSchemaRules (which wires file_quality_rules associations for upload flow),
 * this variant:
 *  - Skips the file_quality_rules insertion step (no persistent file association)
 *  - Sets job_id in violation metadata so violations are queryable by job after the fact
 *  - Returns a per-rule summary structured for execution-log formatting
 *
 * @param {Object}  pool          - pg Pool
 * @param {string}  jobId         - Transformation job ID (stored on violations)
 * @param {string|null} fileId    - Source file ID (may be null; stored for reference)
 * @param {Array}   schemaColumns - Schema column array (each may have quality_rules:[...])
 * @param {Array}   rows          - Sample rows to validate (up to ~100)
 * @param {number}  rowCount      - Total file row count
 * @returns {Promise<Object>} { executed, ruleResults, totalPassed, totalFailed, violationCount, errors }
 */
async function enforceSchemaRulesForJob(pool, jobId, fileId, schemaColumns, rows, rowCount) {
  if (!schemaColumns || !Array.isArray(schemaColumns) || schemaColumns.length === 0) {
    return { executed: false, reason: 'No schema columns provided' };
  }

  const columnsWithRules = schemaColumns.filter(
    col => col.quality_rules && Array.isArray(col.quality_rules) && col.quality_rules.length > 0
  );
  if (columnsWithRules.length === 0) {
    return { executed: false, reason: 'No schema quality_rules defined on any column' };
  }
  if (!rows || rows.length === 0) {
    systemLogger.warn('[schemaRuleEnforcer] No rows available for job DQ enforcement', { jobId });
    return { executed: false, reason: 'No rows available for validation' };
  }

  systemLogger.info('[schemaRuleEnforcer] Enforcing schema quality rules for job', {
    jobId,
    columnCount: columnsWithRules.length,
    totalRules: columnsWithRules.reduce((n, col) => n + col.quality_rules.length, 0),
    sampleRows: rows.length
  });

  const createdRules = [];
  const ruleErrors  = [];

  for (const col of columnsWithRules) {
    const columnName = col.name || col.column_name;
    if (!columnName) continue;

    for (const uiRuleType of col.quality_rules) {
      const normalized = (uiRuleType || '').toLowerCase().trim();
      if (!RULE_TYPE_MAP[normalized]) {
        systemLogger.warn('[schemaRuleEnforcer] Unknown rule type in job DQ — skipping', {
          jobId, columnName, uiRuleType
        });
        continue;
      }

      try {
        const rule = await findOrCreateSchemaRule(pool, normalized, columnName, 'warning');
        if (!rule) {
          ruleErrors.push({ columnName, uiRuleType, error: 'rule row not created' });
          continue;
        }
        createdRules.push({ ...rule, _uiRuleType: normalized });
      } catch (err) {
        systemLogger.error('[schemaRuleEnforcer] Failed to find/create schema rule for job', {
          jobId, columnName, uiRuleType, error: err.message
        });
        ruleErrors.push({ columnName, uiRuleType, error: err.message });
      }
    }
  }

  if (createdRules.length === 0) {
    systemLogger.warn('[schemaRuleEnforcer] No rules could be resolved for job DQ', { jobId, ruleErrors });
    return { executed: false, reason: 'No rules could be resolved', errors: ruleErrors };
  }

  const engine   = new QualityValidationEngine(pool);
  const metadata = {
    job_id:           jobId,
    file_id:          fileId || null,
    file_name:        fileId || jobId,
    upload_date:      new Date(),
    actual_row_count: rowCount
  };

  let validationResult;
  try {
    validationResult = await engine.validateData(createdRules, rows, metadata);
  } catch (validationErr) {
    systemLogger.error('[schemaRuleEnforcer] validateData threw during job DQ', {
      jobId, error: validationErr.message
    });
    return { executed: false, reason: validationErr.message, errors: ruleErrors };
  }

  systemLogger.info('[schemaRuleEnforcer] Job DQ validation completed', {
    jobId,
    rulesRun:   createdRules.length,
    violations: validationResult.violations.length,
    errors:     validationResult.errors.length
  });

  // Persist violations with job_id reference (non-fatal)
  if (validationResult.violations.length > 0) {
    // Attach job_id to each violation so persistViolations stores it
    const violationsWithJob = validationResult.violations.map(v => ({
      ...v,
      job_id: jobId,
      file_id: fileId || v.file_id || null
    }));
    try {
      await engine.persistViolations(violationsWithJob, rows, 'job_execution');
    } catch (persistErr) {
      if (persistErr.code === 'QUALITY_ABORT') {
        // Non-blocking — log but do not rethrow; job should continue
        systemLogger.warn('[schemaRuleEnforcer] QUALITY_ABORT from job DQ persistViolations — continuing', {
          jobId, error: persistErr.message
        });
      } else {
        systemLogger.error('[schemaRuleEnforcer] Failed to persist job DQ violations', {
          jobId, error: persistErr.message
        });
      }
    }
  }

  // Build per-rule summary for execution log formatting
  // Group violations by rule_id → column+type combination
  const violationsByRuleId = new Map();
  for (const v of validationResult.violations) {
    const key = v.rule_id;
    if (!violationsByRuleId.has(key)) violationsByRuleId.set(key, []);
    violationsByRuleId.get(key).push(v);
  }

  const ruleResults = createdRules.map(rule => {
    const ruleViolations = violationsByRuleId.get(rule.id) || [];
    const passed = ruleViolations.length === 0;
    const firstViolation = ruleViolations[0];
    return {
      columnName:     rule.column_name,
      uiRuleType:     rule._uiRuleType,
      engineRuleType: rule.rule_type,
      passed,
      violationCount: ruleViolations.length,
      // Representative expected/actual for the first violation (for log message)
      expectedValue:  firstViolation?.expected_value || null,
      actualValue:    firstViolation?.actual_value   || null
    };
  });

  const totalPassed = ruleResults.filter(r => r.passed).length;
  const totalFailed = ruleResults.filter(r => !r.passed).length;

  return {
    executed:       true,
    ruleResults,
    totalPassed,
    totalFailed,
    violationCount: validationResult.violations.length,
    errors:         ruleErrors
  };
}

module.exports = { enforceSchemaRules, enforceSchemaRulesForJob, validateSchemaRulesInline, SUPPORTED_RULE_TYPES };
