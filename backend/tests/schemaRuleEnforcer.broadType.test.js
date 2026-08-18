/**
 * Schema Rule Enforcer — Broad-type rule matching tests
 *
 * Verifies that template-uploaded contracts (quality_rule_ids = []) correctly
 * reuse existing named quality_rules rows rather than creating phantom
 * __schema_default__* rows for date_format / null_check / duplicate_check.
 *
 * Done criteria (Task #193):
 *  ✓ Broad-type lookup matches an existing named rule when candidateRuleIds = []
 *  ✓ No __schema_default__* rows are created for broad-type-compatible rule types
 *  ✓ File-level record_count reuses existing real rule (no phantom) or skips when none exists
 *  ✓ Candidate pre-lookup still wins when caller supplies real IDs
 *  ✓ Falls through to synthetic creation when no broad match exists in DB
 */

// Mock heavy infrastructure pulled in transitively by schemaRuleEnforcer
jest.mock('../services/qualityValidationEngine', () => {
  return jest.fn().mockImplementation(() => ({
    validateData: jest.fn().mockResolvedValue({ violations: [], errors: [], summary: {} }),
    persistViolations: jest.fn().mockResolvedValue(undefined)
  }));
});
jest.mock('../utils/logger', () => ({
  systemLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const { resolveRuleType, findOrCreateSchemaRule } = require('../services/schemaRuleEnforcer');

// ---------------------------------------------------------------------------
// Helpers to build lightweight mock DB clients
// ---------------------------------------------------------------------------

/**
 * Build a mock pg-style db object whose .query() resolves to rows or records
 * based on a lookup table keyed by the first $N placeholder pattern.
 *
 * @param {Object} opts
 * @param {Array}  opts.existingRules  - Rows already in quality_rules
 * @param {Array}  opts.insertedRules  - Collector: rows "inserted" during the test
 */
function buildMockDb({ existingRules = [], insertedRules = [] } = {}) {
  return {
    query: jest.fn(async (sql, params) => {
      const normalised = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      // -----------------------------------------------------------------------
      // Candidate pre-lookup (step 0) — WHERE id = ANY($1::int[])
      // The new SQL accepts rules stored under either the engine type OR UI aliases,
      // so columnName is always the LAST param and accepted types are in params[1..n-1].
      // -----------------------------------------------------------------------
      if (normalised.includes('id = any($1::int[])')) {
        const ids     = params[0];                    // always first
        const colName = params[params.length - 1];    // always last
        const KNOWN_DATATYPES = new Set(['date', 'email', 'phone', 'number']);
        const acceptedTypes = new Set();
        let datatype = null;
        for (let i = 1; i < params.length - 1; i++) {
          const p = params[i];
          if (typeof p === 'string') {
            if (KNOWN_DATATYPES.has(p)) datatype = p;
            else acceptedTypes.add(p);
          }
          if (Array.isArray(p)) p.forEach(t => acceptedTypes.add(t));
        }
        const rows = existingRules.filter(r => {
          if (!ids.includes(r.id)) return false;
          if (!r.enabled) return false;
          if (r.rule_name.startsWith('__schema_default__')) return false;
          if (acceptedTypes.size > 0 && !acceptedTypes.has(r.rule_type)) return false;
          if (r.column_name !== null && r.column_name !== colName) return false;
          // For the canonical 'validity' engine arm, guard with datatype to avoid
          // an email_validity rule matching a date_format request
          if (r.rule_type === 'validity' && datatype !== null) {
            return r.rule_config?.datatype === datatype;
          }
          if (r.rule_type === 'completeness') {
            const t = r.rule_config?.threshold ?? 1.0;
            return Number(t) === 1.0;
          }
          return true;
        });
        rows.sort((a, b) => {
          const aExact = a.column_name === colName ? 1 : 0;
          const bExact = b.column_name === colName ? 1 : 0;
          return bExact - aExact || a.id - b.id;
        });
        return { rows: rows.slice(0, 1) };
      }

      // -----------------------------------------------------------------------
      // Record-count file-level lookup (step 0c) — WHERE rule_type = 'record_count'
      // AND (column_name = '__file__' OR column_name IS NULL)
      // Distinguishing features: SQL contains "column_name = '__file__'" and params.length <= 1
      // (either [] for legacy or [null/projectId] for project-scoped lookup).
      // -----------------------------------------------------------------------
      if (
        normalised.includes("column_name = '__file__'") &&
        normalised.includes("not starts_with(rule_name, '__schema_default__')") &&
        params.length <= 1
      ) {
        const projectId = params.length > 0 ? params[0] : null;
        let rows = existingRules.filter(r => {
          if (r.rule_type !== 'record_count') return false;
          if (!r.enabled) return false;
          if (r.rule_name.startsWith('__schema_default__')) return false;
          // Allow global (project_id IS NULL) or matching project-scoped rule
          if (r.project_id !== null && r.project_id !== undefined) {
            if (projectId === null || r.project_id !== projectId) return false;
          }
          if (r.column_name !== null && r.column_name !== '__file__') return false;
          return true;
        });
        rows.sort((a, b) => {
          // Prefer project-specific over global, then __file__-scoped over null
          const aProj = (a.project_id !== null && a.project_id !== undefined) ? 1 : 0;
          const bProj = (b.project_id !== null && b.project_id !== undefined) ? 1 : 0;
          const aFile = a.column_name === '__file__' ? 1 : 0;
          const bFile = b.column_name === '__file__' ? 1 : 0;
          return (bProj - aProj) || (bFile - aFile) || a.id - b.id;
        });
        return { rows: rows.slice(0, 1) };
      }

      // -----------------------------------------------------------------------
      // Broad-type lookup (step 0b) — NOT starts_with(__schema_default__)
      // The new SQL accepts multiple rule_type values via ANY(). Accepted types and
      // any discriminating values (datatype) are all embedded in the params array;
      // columnName is always the last element.
      // -----------------------------------------------------------------------
      if (
        normalised.includes("not starts_with(rule_name, '__schema_default__')") ||
        normalised.includes("not starts_with(rule_name, '__schema_default") // safety variant
      ) {
        const colName = params[params.length - 1];    // always last
        const KNOWN_DATATYPES = new Set(['date', 'email', 'phone', 'number']);
        const acceptedTypes = new Set();
        let datatype = null;
        for (let i = 0; i < params.length - 1; i++) {
          const p = params[i];
          if (typeof p === 'string') {
            if (KNOWN_DATATYPES.has(p)) datatype = p;
            else acceptedTypes.add(p);
          }
          if (Array.isArray(p)) p.forEach(t => acceptedTypes.add(t));
        }
        let rows = existingRules.filter(r => {
          if (!acceptedTypes.has(r.rule_type)) return false;
          if (!r.enabled) return false;
          if (r.rule_name.startsWith('__schema_default__')) return false;
          if (r.project_id !== null && r.project_id !== undefined) return false;
          if (r.column_name !== null && r.column_name !== colName) return false;
          // Guard the canonical 'validity' engine arm with the datatype discriminator
          if (r.rule_type === 'validity' && datatype !== null) {
            return r.rule_config?.datatype === datatype;
          }
          // Guard the canonical 'completeness' engine arm with threshold = 1.0
          if (r.rule_type === 'completeness') {
            const t = r.rule_config?.threshold ?? 1.0;
            return Number(t) === 1.0;
          }
          return true;
        });
        rows.sort((a, b) => {
          const aExact = a.column_name === colName ? 1 : 0;
          const bExact = b.column_name === colName ? 1 : 0;
          return bExact - aExact || a.id - b.id;
        });
        return { rows: rows.slice(0, 1) };
      }

      // -----------------------------------------------------------------------
      // Name-first lookup (step -1) — WHERE rule_name = $1 AND enabled = true
      //   AND (project_id IS NULL OR ($2::int IS NOT NULL AND project_id = $2::int))
      // Distinguishing feature: has "rule_name = $1" but NOT "column_name = $2".
      // -----------------------------------------------------------------------
      if (normalised.includes('where rule_name = $1') && !normalised.includes('column_name = $2')) {
        const [namedRuleName, projectId] = params;
        const rows = existingRules.filter(
          r => r.rule_name === namedRuleName && r.enabled &&
               (r.project_id == null || (projectId != null && r.project_id === projectId))
        );
        rows.sort((a, b) => {
          // Prefer project-specific over global
          const aProj = (a.project_id !== null && a.project_id !== undefined) ? 1 : 0;
          const bProj = (b.project_id !== null && b.project_id !== undefined) ? 1 : 0;
          return bProj - aProj || a.id - b.id;
        });
        return { rows: rows.slice(0, 1) };
      }

      // -----------------------------------------------------------------------
      // Exact-name lookup (step 1) — WHERE rule_name = $1 AND column_name = $2
      // -----------------------------------------------------------------------
      if (normalised.includes('where rule_name = $1 and column_name = $2')) {
        const [ruleName, colName] = params;
        const rows = existingRules.filter(
          r => r.rule_name === ruleName && r.column_name === colName && r.project_id == null
        );
        return { rows };
      }

      // -----------------------------------------------------------------------
      // INSERT — simulate creation, push to insertedRules, return new row
      // -----------------------------------------------------------------------
      if (normalised.startsWith('insert into quality_rules')) {
        const [ruleName, engineType, , colName, ruleConfigJson, severity] = params;
        const newRow = {
          id: 900 + insertedRules.length,
          rule_name: ruleName,
          rule_type: engineType,
          column_name: colName,
          rule_config: typeof ruleConfigJson === 'string' ? JSON.parse(ruleConfigJson) : ruleConfigJson,
          severity,
          enabled: true
        };
        insertedRules.push(newRow);
        return { rows: [newRow] };
      }

      // Default: no rows
      return { rows: [] };
    })
  };
}

// ---------------------------------------------------------------------------
// Fixtures — typical named rules a user creates in the UI
// ---------------------------------------------------------------------------

const DATE_FORMAT_RULE = {
  id: 10,
  rule_name: 'Date Format Check',
  rule_type: 'validity',
  column_name: null,            // global (no column scope)
  rule_config: { type: 'datatype', datatype: 'date' },
  severity: 'warning',
  enabled: true,
  project_id: null
};

const NULL_CHECK_RULE = {
  id: 20,
  rule_name: 'Null Check',
  rule_type: 'completeness',
  column_name: null,
  rule_config: { threshold: 1.0 },
  severity: 'warning',
  enabled: true,
  project_id: null
};

const UNIQUENESS_RULE = {
  id: 30,
  rule_name: 'Duplicate Check',
  rule_type: 'uniqueness',
  column_name: null,
  rule_config: {},
  severity: 'warning',
  enabled: true,
  project_id: null
};

const EMAIL_RULE = {
  id: 40,
  rule_name: 'Email Validity',
  rule_type: 'validity',
  column_name: null,
  rule_config: { type: 'datatype', datatype: 'email' },
  severity: 'warning',
  enabled: true,
  project_id: null
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('schemaRuleEnforcer — broad-type rule matching', () => {

  // =========================================================================
  // Step 0b: Broad-type lookup — template contracts (candidateRuleIds = [])
  // =========================================================================

  describe('Broad-type lookup when candidateRuleIds is empty', () => {

    test('date_format reuses existing named "validity/date" rule — no __schema_default__ row created', async () => {
      const inserted = [];
      const db = buildMockDb({ existingRules: [DATE_FORMAT_RULE, EMAIL_RULE], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'date_format', 'order_date', 'warning', null, []);

      expect(result).not.toBeNull();
      expect(result.id).toBe(DATE_FORMAT_RULE.id);
      expect(result.rule_name).toBe('Date Format Check');
      // No synthetic row should have been created
      expect(inserted).toHaveLength(0);
    });

    test('date_format does NOT match email_validity (different datatype in rule_config)', async () => {
      // Only EMAIL_RULE in DB — broad lookup must not cross-match to wrong datatype
      const inserted = [];
      const db = buildMockDb({ existingRules: [EMAIL_RULE], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'date_format', 'order_date', 'warning', null, []);

      // Should fall through to synthetic __schema_default__date_format creation
      expect(result).not.toBeNull();
      expect(result.rule_name).toBe('__schema_default__date_format');
      expect(inserted).toHaveLength(1);
    });

    test('null_check reuses existing named "completeness/threshold:1.0" rule', async () => {
      const inserted = [];
      const db = buildMockDb({ existingRules: [NULL_CHECK_RULE], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'null_check', 'customer_id', 'warning', null, []);

      expect(result).not.toBeNull();
      expect(result.id).toBe(NULL_CHECK_RULE.id);
      expect(result.rule_name).toBe('Null Check');
      expect(inserted).toHaveLength(0);
    });

    test('column_completeness also reuses completeness rule (alias)', async () => {
      const inserted = [];
      const db = buildMockDb({ existingRules: [NULL_CHECK_RULE], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'column_completeness', 'amount', 'warning', null, []);

      expect(result).not.toBeNull();
      expect(result.id).toBe(NULL_CHECK_RULE.id);
      expect(inserted).toHaveLength(0);
    });

    test('completeness rule with threshold < 1.0 is NOT reused (threshold mismatch)', async () => {
      const LENIENT_COMPLETENESS = {
        ...NULL_CHECK_RULE,
        id: 21,
        rule_name: 'Lenient Completeness',
        rule_config: { threshold: 0.8 }
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [LENIENT_COMPLETENESS], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'null_check', 'customer_id', 'warning', null, []);

      // 0.8 threshold ≠ 1.0 → broad lookup misses → synthetic row created
      expect(result).not.toBeNull();
      expect(result.rule_name).toBe('__schema_default__null_check');
      expect(inserted).toHaveLength(1);
    });

    test('duplicate_check reuses existing named "uniqueness" rule', async () => {
      const inserted = [];
      const db = buildMockDb({ existingRules: [UNIQUENESS_RULE], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'duplicate_check', 'transaction_id', 'warning', null, []);

      expect(result).not.toBeNull();
      expect(result.id).toBe(UNIQUENESS_RULE.id);
      expect(result.rule_name).toBe('Duplicate Check');
      expect(inserted).toHaveLength(0);
    });

    test('uniqueness alias also reuses uniqueness rule', async () => {
      const inserted = [];
      const db = buildMockDb({ existingRules: [UNIQUENESS_RULE], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'uniqueness', 'email', 'warning', null, []);

      expect(result).not.toBeNull();
      expect(result.id).toBe(UNIQUENESS_RULE.id);
      expect(inserted).toHaveLength(0);
    });

    test('disabled rules are NOT returned by the broad lookup', async () => {
      const DISABLED = { ...DATE_FORMAT_RULE, id: 11, enabled: false };
      const inserted = [];
      const db = buildMockDb({ existingRules: [DISABLED], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'date_format', 'order_date', 'warning', null, []);

      // Disabled rule skipped → synthetic created
      expect(result.rule_name).toBe('__schema_default__date_format');
      expect(inserted).toHaveLength(1);
    });

    test('project-scoped rules are NOT returned by the broad lookup', async () => {
      const PROJECT_SCOPED = { ...DATE_FORMAT_RULE, id: 12, project_id: 42 };
      const inserted = [];
      const db = buildMockDb({ existingRules: [PROJECT_SCOPED], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'date_format', 'order_date', 'warning', null, []);

      expect(result.rule_name).toBe('__schema_default__date_format');
      expect(inserted).toHaveLength(1);
    });

    test('existing __schema_default__ rows are NOT returned by the broad lookup', async () => {
      // Even if a prior upload created a __schema_default__ row, the broad lookup
      // must skip it (so it is replaced by a real rule if one now exists)
      const SYNTHETIC = {
        id: 13,
        rule_name: '__schema_default__date_format',
        rule_type: 'validity',
        column_name: 'order_date',
        rule_config: { type: 'datatype', datatype: 'date' },
        severity: 'warning',
        enabled: true,
        project_id: null
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [SYNTHETIC, DATE_FORMAT_RULE], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'date_format', 'order_date', 'warning', null, []);

      // Real named rule must win over the synthetic one
      expect(result.id).toBe(DATE_FORMAT_RULE.id);
      expect(result.rule_name).toBe('Date Format Check');
      expect(inserted).toHaveLength(0);
    });

  });

  // =========================================================================
  // Step 0b: Normalization — rules stored under UI alias are returned with
  // the canonical engine type/config so QualityValidationEngine can execute them
  // =========================================================================

  describe('Alias-backed matched rules are normalized to canonical engine type', () => {

    test('rule stored as rule_type="date_format" is matched AND normalized to rule_type="validity"', async () => {
      const DATE_FORMAT_UI_STORED = {
        id: 14,
        rule_name: 'Date Format Validation',
        rule_type: 'date_format',      // stored under UI alias, not engine type
        column_name: null,
        rule_config: { formats: ['YYYY-MM-DD'] }, // custom config — overwritten on return
        severity: 'warning',
        enabled: true,
        project_id: null
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [DATE_FORMAT_UI_STORED], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'date_format', 'enrollment_date', 'warning', null, []);

      expect(result).not.toBeNull();
      // Rule identity preserved for file_quality_rules association
      expect(result.id).toBe(14);
      expect(result.rule_name).toBe('Date Format Validation');
      // Normalized so QualityValidationEngine can dispatch it
      expect(result.rule_type).toBe('validity');
      expect(result.rule_config).toMatchObject({ datatype: 'date' });
      // No synthetic row created
      expect(inserted).toHaveLength(0);
    });

    test('rule stored as rule_type="null_check" is matched AND normalized to rule_type="completeness"', async () => {
      const NULL_CHECK_UI = {
        id: 22,
        rule_name: 'Null Check Validation',
        rule_type: 'null_check',
        column_name: null,
        rule_config: {},
        severity: 'warning',
        enabled: true,
        project_id: null
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [NULL_CHECK_UI], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'null_check', 'customer_id', 'warning', null, []);

      expect(result).not.toBeNull();
      expect(result.id).toBe(22);
      expect(result.rule_name).toBe('Null Check Validation');
      expect(result.rule_type).toBe('completeness');
      expect(result.rule_config).toMatchObject({ threshold: 1.0 });
      expect(inserted).toHaveLength(0);
    });

    test('rule stored as rule_type="duplicate_check" is matched AND normalized to rule_type="uniqueness"', async () => {
      const DUPLICATE_CHECK_UI = {
        id: 31,
        rule_name: 'Duplicate Detection',
        rule_type: 'duplicate_check',
        column_name: null,
        rule_config: {},
        severity: 'warning',
        enabled: true,
        project_id: null
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [DUPLICATE_CHECK_UI], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'duplicate_check', 'order_id', 'warning', null, []);

      expect(result).not.toBeNull();
      expect(result.id).toBe(31);
      expect(result.rule_type).toBe('uniqueness');
      expect(inserted).toHaveLength(0);
    });

    test('candidate rule stored as rule_type="date_format" is matched AND normalized', async () => {
      const CANDIDATE_UI_TYPE = {
        id: 200,
        rule_name: 'My Date Format Rule',
        rule_type: 'date_format',       // user saved it with UI alias as rule_type
        column_name: null,
        rule_config: { formats: ['MM-DD-YYYY'] },
        severity: 'error',
        enabled: true,
        project_id: null
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [CANDIDATE_UI_TYPE], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'date_format', 'enrollment_date', 'warning', null, [200]);

      expect(result).not.toBeNull();
      expect(result.id).toBe(200);
      expect(result.rule_name).toBe('My Date Format Rule');
      // Normalized so the engine can execute it — rule identity (id) is preserved
      expect(result.rule_type).toBe('validity');
      expect(result.rule_config).toMatchObject({ datatype: 'date' });
      expect(inserted).toHaveLength(0);
    });

    test('rule already stored under canonical engine type is returned unchanged', async () => {
      // DATE_FORMAT_RULE uses rule_type='validity' — no normalization needed
      const inserted = [];
      const db = buildMockDb({ existingRules: [DATE_FORMAT_RULE], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'date_format', 'order_date', 'warning', null, []);

      expect(result).not.toBeNull();
      expect(result.id).toBe(DATE_FORMAT_RULE.id);
      expect(result.rule_type).toBe('validity');
      // Config from the stored rule (not overwritten) since rule_type already matches engine
      expect(result.rule_config).toMatchObject({ datatype: 'date' });
      expect(inserted).toHaveLength(0);
    });

  });

  // =========================================================================
  // File-level record_count — new behavior: reuse real rule or skip, never create phantom
  // =========================================================================

  describe('File-level record_count — reuse real rule or skip (no phantom creation)', () => {

    const FILE_REC_COUNT_RULE = {
      id: 55,
      rule_name: 'file_rec_count',
      rule_type: 'record_count',
      column_name: '__file__',
      rule_config: { operator: 'exactly', expected_count: 750 },
      severity: 'warning',
      enabled: true,
      project_id: null
    };

    const FILE_REC_COUNT_GLOBAL = {
      id: 56,
      rule_name: 'file_rec_count_global',
      rule_type: 'record_count',
      column_name: null,          // global (no column scope)
      rule_config: { operator: 'exactly', expected_count: 1000 },
      severity: 'warning',
      enabled: true,
      project_id: null
    };

    test('real file_rec_count rule is reused — no phantom __schema_default__ row created', async () => {
      const inserted = [];
      const db = buildMockDb({ existingRules: [FILE_REC_COUNT_RULE], insertedRules: inserted });
      const config = { operator: 'exactly', expected_count: 1000 };

      const result = await findOrCreateSchemaRule(db, 'record_count', '__file__', 'warning', config, []);

      expect(result).not.toBeNull();
      // Real rule ID preserved for file_quality_rules association
      expect(result.id).toBe(FILE_REC_COUNT_RULE.id);
      expect(result.rule_name).toBe('file_rec_count');
      // configOverride applied so QualityValidationEngine uses the schema's thresholds
      expect(result.rule_config).toEqual(config);
      // No synthetic row created
      expect(inserted).toHaveLength(0);
    });

    test('returns null (skip) when no real record_count rule exists — no phantom created', async () => {
      const inserted = [];
      // DB is empty — no real record_count rule at all
      const db = buildMockDb({ existingRules: [], insertedRules: inserted });
      const config = { operator: 'exactly', expected_count: 1000 };

      const result = await findOrCreateSchemaRule(db, 'record_count', '__file__', 'warning', config, []);

      // Must be null — no insert, no phantom
      expect(result).toBeNull();
      expect(inserted).toHaveLength(0);
    });

    test('different schema configs all reuse the same real rule (ID preserved, config varied)', async () => {
      const inserted = [];
      const db = buildMockDb({ existingRules: [FILE_REC_COUNT_RULE], insertedRules: inserted });

      const cfg1 = { operator: 'exactly',  expected_count: 500 };
      const cfg2 = { operator: 'at_least', expected_count: 100 };

      const r1 = await findOrCreateSchemaRule(db, 'record_count', '__file__', 'warning', cfg1, []);
      const r2 = await findOrCreateSchemaRule(db, 'record_count', '__file__', 'warning', cfg2, []);

      // Both return the same real rule ID
      expect(r1.id).toBe(FILE_REC_COUNT_RULE.id);
      expect(r2.id).toBe(FILE_REC_COUNT_RULE.id);
      // Each gets its own config override
      expect(r1.rule_config).toEqual(cfg1);
      expect(r2.rule_config).toEqual(cfg2);
      // No synthetic rows created
      expect(inserted).toHaveLength(0);
    });

    test('global (column_name IS NULL) record_count rule is also matched', async () => {
      const inserted = [];
      const db = buildMockDb({ existingRules: [FILE_REC_COUNT_GLOBAL], insertedRules: inserted });
      const config = { operator: 'at_least', expected_count: 200 };

      const result = await findOrCreateSchemaRule(db, 'record_count', '__file__', 'warning', config, []);

      expect(result).not.toBeNull();
      expect(result.id).toBe(FILE_REC_COUNT_GLOBAL.id);
      expect(result.rule_config).toEqual(config);
      expect(inserted).toHaveLength(0);
    });

    test('column_name="__file__" rule takes priority over global (column_name IS NULL) rule', async () => {
      const inserted = [];
      const db = buildMockDb({
        existingRules: [FILE_REC_COUNT_GLOBAL, FILE_REC_COUNT_RULE],
        insertedRules: inserted
      });
      const config = { operator: 'exactly', expected_count: 750 };

      const result = await findOrCreateSchemaRule(db, 'record_count', '__file__', 'warning', config, []);

      // __file__-scoped rule wins over global
      expect(result.id).toBe(FILE_REC_COUNT_RULE.id);
      expect(inserted).toHaveLength(0);
    });

    test('disabled record_count rules are not matched (returns null)', async () => {
      const DISABLED = { ...FILE_REC_COUNT_RULE, enabled: false };
      const inserted = [];
      const db = buildMockDb({ existingRules: [DISABLED], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'record_count', '__file__', 'warning',
        { operator: 'exactly', expected_count: 750 }, []);

      expect(result).toBeNull();
      expect(inserted).toHaveLength(0);
    });

    test('__schema_default__ record_count rows are not matched by broad lookup', async () => {
      // A pre-existing phantom must not be recycled — a real rule must exist for reuse
      const PHANTOM = {
        id: 57,
        rule_name: '__schema_default__record_count__exactly_ec750',
        rule_type: 'record_count',
        column_name: '__file__',
        rule_config: { operator: 'exactly', expected_count: 750 },
        severity: 'warning',
        enabled: true,
        project_id: null
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [PHANTOM], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'record_count', '__file__', 'warning',
        { operator: 'exactly', expected_count: 750 }, []);

      // Phantom excluded → no real rule → null returned, no new insert
      expect(result).toBeNull();
      expect(inserted).toHaveLength(0);
    });

    test('no configOverride returns real rule with its stored config unchanged', async () => {
      const inserted = [];
      const db = buildMockDb({ existingRules: [FILE_REC_COUNT_RULE], insertedRules: inserted });

      // No configOverride (null) — should return the rule as-is
      const result = await findOrCreateSchemaRule(db, 'record_count', '__file__', 'warning', null, []);

      expect(result).not.toBeNull();
      expect(result.id).toBe(FILE_REC_COUNT_RULE.id);
      // rule_config unchanged — stored config used
      expect(result.rule_config).toEqual(FILE_REC_COUNT_RULE.rule_config);
      expect(inserted).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // Project-scoped record_count rules (new behavior added for Fix 1)
    // -----------------------------------------------------------------------

    test('project-scoped record_count rule is matched when projectId is provided', async () => {
      const PROJECT_RC = {
        id: 28,
        rule_name: 'file_rec_count',
        rule_type: 'record_count',
        column_name: '__file__',
        rule_config: { operator: 'exactly', expected_count: 4 },
        severity: 'warning',
        enabled: true,
        project_id: 1469
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [PROJECT_RC], insertedRules: inserted });
      const config = { operator: 'exactly', expected_count: 4 };

      const result = await findOrCreateSchemaRule(
        db, 'record_count', '__file__', 'warning', config, [], '', 1469
      );

      expect(result).not.toBeNull();
      expect(result.id).toBe(28);
      expect(result.rule_name).toBe('file_rec_count');
      // configOverride applied
      expect(result.rule_config).toEqual(config);
      expect(inserted).toHaveLength(0);
    });

    test('project-scoped record_count rule is NOT matched when projectId is null', async () => {
      const PROJECT_RC = {
        id: 28,
        rule_name: 'file_rec_count',
        rule_type: 'record_count',
        column_name: '__file__',
        rule_config: { operator: 'exactly', expected_count: 4 },
        severity: 'warning',
        enabled: true,
        project_id: 1469
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [PROJECT_RC], insertedRules: inserted });

      // No projectId supplied — project-scoped rule must NOT be returned
      const result = await findOrCreateSchemaRule(
        db, 'record_count', '__file__', 'warning', null, [], '', null
      );

      expect(result).toBeNull();
      expect(inserted).toHaveLength(0);
    });

    test('project-scoped record_count rule takes priority over global rule when projectId matches', async () => {
      const GLOBAL_RC = {
        id: 10,
        rule_name: 'global_rec_count',
        rule_type: 'record_count',
        column_name: '__file__',
        rule_config: {},
        severity: 'warning',
        enabled: true,
        project_id: null
      };
      const PROJECT_RC = {
        id: 28,
        rule_name: 'file_rec_count',
        rule_type: 'record_count',
        column_name: '__file__',
        rule_config: {},
        severity: 'warning',
        enabled: true,
        project_id: 1469
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [GLOBAL_RC, PROJECT_RC], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(
        db, 'record_count', '__file__', 'warning', null, [], '', 1469
      );

      // Project-specific rule must be preferred over global
      expect(result).not.toBeNull();
      expect(result.id).toBe(28);
      expect(inserted).toHaveLength(0);
    });

  });

  describe('Config-sensitive column-level rules (length_check) still create synthetic rows', () => {

    test('length_check is excluded from broad-type lookup (config-sensitive)', async () => {
      // length_check should never reuse a global length_check rule via broad lookup;
      // it must always create/reuse by exact fingerprint name
      const GLOBAL_LENGTH = {
        id: 50,
        rule_name: 'Length Check',
        rule_type: 'length_check',
        column_name: null,
        rule_config: { min_length: 0, max_length: 255 },
        severity: 'warning',
        enabled: true,
        project_id: null
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [GLOBAL_LENGTH], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'length_check', 'name', 'warning', null, []);

      // Broad lookup is excluded for length_check → falls through to exact-name lookup
      // No existing __schema_default__length_check row → creates new one
      expect(result.rule_name).toBe('__schema_default__length_check');
      expect(inserted).toHaveLength(1);
    });

  });

  // =========================================================================
  // Step -1: Name-first lookup — namedRuleName wins before candidate/broad
  // =========================================================================

  describe('Name-first lookup when namedRuleName is provided', () => {

    const FILE_REC_CNT_RULE = {
      id: 60,
      rule_name: 'file_rec_cnt',
      rule_type: 'record_count',
      column_name: null,
      rule_config: { operator: 'exactly', expected_count: 5 },
      severity: 'warning',
      enabled: true,
      project_id: null
    };

    const DATE_FORMAT_NAMED = {
      id: 70,
      rule_name: 'Date Format Validation',
      rule_type: 'date_format',   // stored as UI alias
      column_name: null,
      rule_config: {},
      severity: 'warning',
      enabled: true,
      project_id: null
    };

    test('column-level: named rule "Date Format Validation" is returned by name, no phantom created', async () => {
      const inserted = [];
      // DB has the named rule; no broad-type candidate would match without namedRuleName
      const db = buildMockDb({ existingRules: [DATE_FORMAT_NAMED], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(
        db, 'date_format', 'Enrollment_date', 'warning', null, [], 'Date Format Validation'
      );

      expect(result).not.toBeNull();
      expect(result.id).toBe(70);
      expect(result.rule_name).toBe('Date Format Validation');
      // Normalized so QualityValidationEngine can execute it
      expect(result.rule_type).toBe('validity');
      expect(result.rule_config).toMatchObject({ datatype: 'date' });
      expect(inserted).toHaveLength(0);
    });

    test('file-level: named rule "file_rec_cnt" is returned by name — no phantom record_count row', async () => {
      const inserted = [];
      const db = buildMockDb({ existingRules: [FILE_REC_CNT_RULE], insertedRules: inserted });

      // Caller passes specific config override (from schema); name-first lookup wins before
      // the config fingerprint path that would create __schema_default__record_count__exactly_5
      const result = await findOrCreateSchemaRule(
        db, 'record_count', '__file__', 'warning',
        { operator: 'exactly', expected_count: 5 },
        [], 'file_rec_cnt'
      );

      expect(result).not.toBeNull();
      expect(result.id).toBe(60);
      expect(result.rule_name).toBe('file_rec_cnt');
      expect(result.rule_type).toBe('record_count');
      // No phantom __schema_default__record_count__* row created
      expect(inserted).toHaveLength(0);
    });

    test('file-level named record_count: schema configOverride applied even when different from stored config', async () => {
      // FILE_REC_CNT_RULE stores expected_count:5; schema declares 1000.
      // QualityValidationEngine must execute against 1000, not 5.
      const inserted = [];
      const db = buildMockDb({ existingRules: [FILE_REC_CNT_RULE], insertedRules: inserted });
      const schemaConfig = { operator: 'exactly', expected_count: 1000 };

      const result = await findOrCreateSchemaRule(
        db, 'record_count', '__file__', 'warning',
        schemaConfig, [], 'file_rec_cnt'
      );

      expect(result).not.toBeNull();
      // Real rule ID preserved for file_quality_rules association
      expect(result.id).toBe(60);
      expect(result.rule_name).toBe('file_rec_cnt');
      // Schema thresholds override stored config for execution
      expect(result.rule_config).toEqual(schemaConfig);
      // Stored rule not mutated (execution-scoped copy only)
      expect(FILE_REC_CNT_RULE.rule_config.expected_count).toBe(5);
      expect(inserted).toHaveLength(0);
    });

    test('name-first lookup takes priority over a broader candidate match', async () => {
      const inserted = [];
      const SPECIFIC_NAMED = {
        id: 71,
        rule_name: 'Customer Date Format',
        rule_type: 'validity',
        column_name: 'order_date',
        rule_config: { type: 'datatype', datatype: 'date' },
        severity: 'error',
        enabled: true,
        project_id: null
      };
      // Both the named rule and DATE_FORMAT_RULE exist; name-first must win
      const db = buildMockDb({
        existingRules: [DATE_FORMAT_RULE, SPECIFIC_NAMED],
        insertedRules: inserted
      });

      const result = await findOrCreateSchemaRule(
        db, 'date_format', 'order_date', 'warning', null, [10], 'Customer Date Format'
      );

      expect(result).not.toBeNull();
      expect(result.id).toBe(71);
      expect(result.rule_name).toBe('Customer Date Format');
      expect(inserted).toHaveLength(0);
    });

    test('name not found in DB falls through to broad-type lookup', async () => {
      const inserted = [];
      // DATE_FORMAT_RULE exists but name "Missing Rule" does not
      const db = buildMockDb({ existingRules: [DATE_FORMAT_RULE], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(
        db, 'date_format', 'order_date', 'warning', null, [], 'Missing Rule'
      );

      // Falls through to broad lookup → DATE_FORMAT_RULE reused
      expect(result).not.toBeNull();
      expect(result.id).toBe(DATE_FORMAT_RULE.id);
      expect(inserted).toHaveLength(0);
    });

    test('empty namedRuleName skips name-first lookup (backward compatible)', async () => {
      const inserted = [];
      const db = buildMockDb({ existingRules: [DATE_FORMAT_RULE], insertedRules: inserted });

      // No namedRuleName passed — uses broad lookup as before
      const result = await findOrCreateSchemaRule(db, 'date_format', 'order_date', 'warning', null, [], '');

      expect(result).not.toBeNull();
      expect(result.id).toBe(DATE_FORMAT_RULE.id);
      expect(inserted).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // Project-scoped named-rule lookup (new behavior added for Fix 1)
    // -----------------------------------------------------------------------

    test('project-scoped named rule is found when projectId matches', async () => {
      const PROJECT_RULE = {
        id: 28,
        rule_name: 'file_rec_count',
        rule_type: 'record_count',
        column_name: '__file__',
        rule_config: { operator: 'exactly', expected_count: 4 },
        severity: 'warning',
        enabled: true,
        project_id: 1469
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [PROJECT_RULE], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(
        db, 'record_count', '__file__', 'warning',
        { operator: 'exactly', expected_count: 4 },
        [], 'file_rec_count', 1469
      );

      expect(result).not.toBeNull();
      expect(result.id).toBe(28);
      expect(result.rule_name).toBe('file_rec_count');
      expect(inserted).toHaveLength(0);
    });

    test('project-scoped named rule is NOT found when projectId is null', async () => {
      const PROJECT_RULE = {
        id: 28,
        rule_name: 'file_rec_count',
        rule_type: 'record_count',
        column_name: '__file__',
        rule_config: { operator: 'exactly', expected_count: 4 },
        severity: 'warning',
        enabled: true,
        project_id: 1469
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [PROJECT_RULE], insertedRules: inserted });

      // No projectId → project-scoped rule is not visible → name-first misses
      // → falls to broad lookup → also misses (project-scoped excluded) → null
      const result = await findOrCreateSchemaRule(
        db, 'record_count', '__file__', 'warning',
        null, [], 'file_rec_count', null
      );

      expect(result).toBeNull();
      expect(inserted).toHaveLength(0);
    });

    test('project-scoped named rule preferred over same-named global rule', async () => {
      const GLOBAL_RULE = {
        id: 10,
        rule_name: 'file_rec_count',
        rule_type: 'record_count',
        column_name: '__file__',
        rule_config: { operator: 'exactly', expected_count: 100 },
        severity: 'warning',
        enabled: true,
        project_id: null
      };
      const PROJECT_RULE = {
        id: 28,
        rule_name: 'file_rec_count',
        rule_type: 'record_count',
        column_name: '__file__',
        rule_config: { operator: 'exactly', expected_count: 4 },
        severity: 'warning',
        enabled: true,
        project_id: 1469
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [GLOBAL_RULE, PROJECT_RULE], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(
        db, 'record_count', '__file__', 'warning',
        null, [], 'file_rec_count', 1469
      );

      // Project-specific rule takes precedence over global one
      expect(result).not.toBeNull();
      expect(result.id).toBe(28);
      expect(inserted).toHaveLength(0);
    });

  });

  // =========================================================================
  // Step 0: Candidate pre-lookup still wins when real IDs are supplied
  // =========================================================================

  describe('Candidate pre-lookup takes priority over broad lookup', () => {

    test('supplied candidateRuleId is returned even when a broad match also exists', async () => {
      const CANDIDATE = {
        id: 100,
        rule_name: 'Customer Date Format',
        rule_type: 'validity',        // engine type
        column_name: 'order_date',
        rule_config: { type: 'datatype', datatype: 'date' },
        severity: 'error',
        enabled: true,
        project_id: null
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [DATE_FORMAT_RULE, CANDIDATE], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'date_format', 'order_date', 'warning', null, [100]);

      // Candidate (id=100) must win over DATE_FORMAT_RULE (id=10) from broad lookup
      expect(result.id).toBe(100);
      expect(result.rule_name).toBe('Customer Date Format');
      expect(inserted).toHaveLength(0);
    });

    test('disabled candidate falls through to broad lookup, not creates synthetic', async () => {
      // Candidate ID supplied but rule is disabled → step 0 returns nothing → step 0b fires
      const DISABLED_CANDIDATE = { ...DATE_FORMAT_RULE, id: 101, enabled: false };
      const inserted = [];
      const db = buildMockDb({ existingRules: [DISABLED_CANDIDATE, DATE_FORMAT_RULE], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'date_format', 'order_date', 'warning', null, [101]);

      // Disabled candidate skipped → broad lookup finds DATE_FORMAT_RULE
      expect(result.id).toBe(DATE_FORMAT_RULE.id);
      expect(inserted).toHaveLength(0);
    });

    test('candidate record_count rule: schema configOverride applied even when different from stored config', async () => {
      // Candidate rule stores expected_count:5; schema declares 1000.
      // QualityValidationEngine must validate against 1000, not 5.
      const CANDIDATE_RC = {
        id: 102,
        rule_name: 'file_rec_count_candidate',
        rule_type: 'record_count',
        column_name: '__file__',
        rule_config: { operator: 'exactly', expected_count: 5 },
        severity: 'warning',
        enabled: true,
        project_id: null
      };
      const inserted = [];
      const db = buildMockDb({ existingRules: [CANDIDATE_RC], insertedRules: inserted });
      const schemaConfig = { operator: 'at_least', expected_count: 1000 };

      const result = await findOrCreateSchemaRule(
        db, 'record_count', '__file__', 'warning', schemaConfig, [102]
      );

      expect(result).not.toBeNull();
      // Real rule ID preserved for file_quality_rules association
      expect(result.id).toBe(102);
      expect(result.rule_name).toBe('file_rec_count_candidate');
      // Schema thresholds override stored config for execution
      expect(result.rule_config).toEqual(schemaConfig);
      // Stored rule not mutated (execution-scoped copy only)
      expect(CANDIDATE_RC.rule_config.expected_count).toBe(5);
      expect(inserted).toHaveLength(0);
    });

  });

  // =========================================================================
  // Fall-through: synthetic creation when no match at all
  // =========================================================================

  describe('Synthetic __schema_default__ row is created when no match found', () => {

    test('creates __schema_default__date_format when no enabled validity/date rule exists', async () => {
      const inserted = [];
      const db = buildMockDb({ existingRules: [], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'date_format', 'ship_date', 'warning', null, []);

      expect(result).not.toBeNull();
      expect(result.rule_name).toBe('__schema_default__date_format');
      expect(result.rule_type).toBe('validity');
      expect(result.rule_config).toMatchObject({ datatype: 'date' });
      expect(inserted).toHaveLength(1);
    });

    test('creates __schema_default__null_check when no enabled completeness rule exists', async () => {
      const inserted = [];
      const db = buildMockDb({ existingRules: [], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'null_check', 'vendor_id', 'warning', null, []);

      expect(result.rule_name).toBe('__schema_default__null_check');
      expect(result.rule_type).toBe('completeness');
      expect(inserted).toHaveLength(1);
    });

    test('creates __schema_default__duplicate_check when no uniqueness rule exists', async () => {
      const inserted = [];
      const db = buildMockDb({ existingRules: [], insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'duplicate_check', 'order_id', 'warning', null, []);

      expect(result.rule_name).toBe('__schema_default__duplicate_check');
      expect(result.rule_type).toBe('uniqueness');
      expect(inserted).toHaveLength(1);
    });

    test('returns null for unrecognised rule type', async () => {
      const inserted = [];
      const db = buildMockDb({ insertedRules: inserted });

      const result = await findOrCreateSchemaRule(db, 'unknown_rule_xyz', 'col', 'warning', null, []);

      expect(result).toBeNull();
      expect(inserted).toHaveLength(0);
    });

  });

  // =========================================================================
  // resolveRuleType — static helper coverage
  // =========================================================================

  describe('resolveRuleType', () => {
    test.each([
      ['null_check',          'completeness'],
      ['column_completeness', 'completeness'],
      ['isna_check',          'completeness'],
      ['duplicate_check',     'uniqueness'],
      ['uniqueness',          'uniqueness'],
      ['date_format',         'validity'],
      ['email_validity',      'validity'],
      ['phone_validity',      'validity'],
      ['timestamp_format',    'validity'],
      ['numeric_only_string', 'validity'],
      ['length_check',        'length_check'],
      ['range_check',         'range_check'],
      ['record_count',        'record_count'],
      ['special_character_presence', 'validity_check'],
      ['validity_check',      'validity_check'],
    ])('%s → engineType %s', (uiType, expected) => {
      const r = resolveRuleType(uiType);
      expect(r).not.toBeNull();
      expect(r.engineType).toBe(expected);
    });

    test('unknown type returns null', () => {
      expect(resolveRuleType('not_a_real_rule')).toBeNull();
      expect(resolveRuleType('')).toBeNull();
      expect(resolveRuleType(null)).toBeNull();
      expect(resolveRuleType(undefined)).toBeNull();
    });

    test('case-insensitive resolution', () => {
      expect(resolveRuleType('NULL_CHECK')).not.toBeNull();
      expect(resolveRuleType('Date_Format')).not.toBeNull();
      expect(resolveRuleType('DUPLICATE_CHECK')).not.toBeNull();
    });
  });

  // =========================================================================
  // normaliseSchema — object-form and string-form entries
  // =========================================================================

  describe('normaliseSchema — per-column quality_rules normalisation', () => {
    const { normaliseSchema } = require('../services/schemaRuleEnforcer');

    test('bare-string column entries are preserved as { rule_type, rule_name: "" }', () => {
      const schema = [
        { column_name: 'enrollment_date', quality_rules: ['date_format', 'null_check'] }
      ];
      const { columns } = normaliseSchema(schema);
      expect(columns[0].quality_rules).toEqual([
        { rule_type: 'date_format', rule_name: '' },
        { rule_type: 'null_check',  rule_name: '' }
      ]);
    });

    test('object-form column entries preserve rule_name', () => {
      const schema = [
        {
          column_name: 'enrollment_date',
          quality_rules: [
            { rule_type: 'date_format', rule_name: 'Date Format Validation' },
            { rule_type: 'null_check'  }   // rule_name absent → ''
          ]
        }
      ];
      const { columns } = normaliseSchema(schema);
      expect(columns[0].quality_rules).toEqual([
        { rule_type: 'date_format', rule_name: 'Date Format Validation' },
        { rule_type: 'null_check',  rule_name: '' }
      ]);
    });

    test('file_quality_rules entries preserve rule_name', () => {
      const schema = {
        columns: [],
        file_quality_rules: [
          { rule_type: 'record_count', rule_name: 'file_rec_cnt', config: { operator: 'exactly', expected_count: 5 } },
          'some_bare_string_rule'
        ]
      };
      const { fileQualityRules } = normaliseSchema(schema);
      expect(fileQualityRules[0]).toEqual({
        rule_type: 'record_count',
        rule_name: 'file_rec_cnt',
        config:    { operator: 'exactly', expected_count: 5 }
      });
      expect(fileQualityRules[1]).toEqual({ rule_type: 'some_bare_string_rule', rule_name: '', config: {} });
    });

    test('columns without quality_rules are passed through unchanged', () => {
      const schema = [
        { column_name: 'name', data_type: 'string' }
      ];
      const { columns } = normaliseSchema(schema);
      expect(columns[0].quality_rules).toBeUndefined();
    });
  });

  // =========================================================================
  // validateSchemaRulesInline — object-form entries must not throw
  // =========================================================================

  describe('validateSchemaRulesInline handles object-form quality_rules entries', () => {
    const { validateSchemaRulesInline } = require('../services/schemaRuleEnforcer');

    test('object-form entries resolve without throwing (bare-string backward compat)', async () => {
      const schema = [
        { column_name: 'enrollment_date', quality_rules: ['date_format'] }
      ];
      const sampleData = [{ enrollment_date: '2024-01-01' }, { enrollment_date: 'not-a-date' }];
      await expect(validateSchemaRulesInline(schema, sampleData, {})).resolves.not.toThrow();
    });

    test('object-form entries { rule_type, rule_name } resolve without throwing', async () => {
      const schema = [
        {
          column_name: 'enrollment_date',
          quality_rules: [{ rule_type: 'date_format', rule_name: 'Date Format Validation' }]
        }
      ];
      const sampleData = [{ enrollment_date: '2024-01-01' }];
      // Should not throw a TypeError from calling .toLowerCase() on an object
      await expect(validateSchemaRulesInline(schema, sampleData, {})).resolves.not.toThrow();
    });

    test('mixed object and string entries resolve without throwing', async () => {
      const schema = [
        {
          column_name: 'enrollment_date',
          quality_rules: [
            { rule_type: 'date_format', rule_name: 'Date Format Validation' },
            'null_check'
          ]
        }
      ];
      const sampleData = [{ enrollment_date: '2024-01-01' }];
      await expect(validateSchemaRulesInline(schema, sampleData, {})).resolves.not.toThrow();
    });
  });

  // =========================================================================
  // enforceSchemaRules — execution scoping: global named rule must validate
  // the schema column, not skip due to null column_name
  // =========================================================================

  describe('enforceSchemaRules — global named rule is scoped to schema column for execution', () => {

    test('global named date rule produces violation scoped to Enrollment_date column', async () => {
      // Simulates the "Date Format Validation" scenario: the DB rule has column_name=null
      // (it is a global/shared rule), but the contract schema applies it to Enrollment_date.
      // QualityValidationEngine must receive the rule with column_name='Enrollment_date'
      // so it can find and validate the correct data column.
      const GLOBAL_DATE_NAMED = {
        id:          70,
        rule_name:   'Date Format Validation',
        rule_type:   'date_format',   // stored as UI alias → normalised to 'validity'
        column_name: null,            // global row — no column pinned in DB
        rule_config: {},
        severity:    'warning',
        enabled:     true,
        project_id:  null
      };

      const db = buildMockDb({ existingRules: [GLOBAL_DATE_NAMED] });

      const { enforceSchemaRules } = require('../services/schemaRuleEnforcer');
      const QualityValidationEngine = require('../services/qualityValidationEngine');

      // Use mockImplementationOnce to capture the rules array passed to validateData directly,
      // avoiding fragile mock.results indexing across multiple test-suite calls.
      let capturedRules = null;
      QualityValidationEngine.mockImplementationOnce(() => ({
        validateData: jest.fn(async (rules) => {
          capturedRules = rules;
          return { violations: [], errors: [], summary: {} };
        }),
        persistViolations: jest.fn().mockResolvedValue(undefined)
      }));

      const schema = [
        {
          column_name:   'Enrollment_date',
          quality_rules: [{ rule_type: 'date_format', rule_name: 'Date Format Validation' }]
        }
      ];
      const previewData = [
        { Enrollment_date: '2024-01-01' },  // valid
        { Enrollment_date: 'not-a-date'  }  // invalid
      ];

      await enforceSchemaRules(db, 99, schema, previewData, 2);

      // validateData must have been called with our rules
      expect(capturedRules).not.toBeNull();
      expect(capturedRules).toHaveLength(1);

      const execRule = capturedRules[0];
      // id must be preserved (for file_quality_rules association)
      expect(execRule.id).toBe(70);
      // column_name must be the schema column, NOT null — engine needs this to find the data
      expect(execRule.column_name).toBe('Enrollment_date');
      // rule_type must be normalised to engine type so the engine can execute it
      expect(execRule.rule_type).toBe('validity');
    });

  });

  // =========================================================================
  // enforceSchemaRules — multi-column merge: same rule applied to two columns
  // =========================================================================

  describe('enforceSchemaRules — multi-column target_columns merging', () => {

    test('same rule applied to two columns accumulates both in target_columns via DISTINCT unnest', async () => {
      // Arrange: one global date_format rule; schema applies it to two columns
      const insertedParams = [];
      const db = buildMockDb({ existingRules: [DATE_FORMAT_RULE] });

      // Override db.query to capture INSERT params for file_quality_rules
      const origQuery = db.query.bind(db);
      db.query = jest.fn(async (sql, params) => {
        const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        if (norm.includes('insert into file_quality_rules')) {
          insertedParams.push({ sql, params });
          return { rows: [] };
        }
        return origQuery(sql, params);
      });

      const { enforceSchemaRules } = require('../services/schemaRuleEnforcer');

      const schema = [
        { column_name: 'enrollment_date', quality_rules: [{ rule_type: 'date_format', rule_name: '' }] },
        { column_name: 'start_date',      quality_rules: [{ rule_type: 'date_format', rule_name: '' }] }
      ];

      // enforceSchemaRules early-returns when previewData is empty and column rules exist;
      // supply a minimal sample row to allow the association loop to run.
      const previewData = [{ enrollment_date: '2024-01-01', start_date: '2024-06-01' }];
      await enforceSchemaRules(db, 42, schema, previewData, 1);

      // Two columns → two INSERT/upsert calls for the same rule
      expect(insertedParams).toHaveLength(2);

      // The SQL must use DISTINCT unnest merge rather than overwrite
      for (const { sql } of insertedParams) {
        expect(sql.toLowerCase()).toContain('distinct');
        expect(sql.toLowerCase()).toContain('unnest');
      }

      // Each call carries the correct column name as the 3rd param
      const colNames = insertedParams.map(({ params }) => params[2]);
      expect(colNames).toContain('enrollment_date');
      expect(colNames).toContain('start_date');
    });

  });

});
