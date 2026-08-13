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
 *  ✓ Config-specific rules (record_count) still produce distinct synthetic rows
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
      // -----------------------------------------------------------------------
      if (normalised.includes('id = any($1::int[])')) {
        const [candidateIds, colName] = params;
        const rows = existingRules.filter(
          r => candidateIds.includes(r.id) && r.enabled &&
               (r.column_name === colName || r.column_name === null)
        );
        // mirror ORDER BY (column_name = $2) DESC NULLS LAST, id
        rows.sort((a, b) => {
          const aExact = a.column_name === colName ? 1 : 0;
          const bExact = b.column_name === colName ? 1 : 0;
          return bExact - aExact || a.id - b.id;
        });
        return { rows: rows.slice(0, 1) };
      }

      // -----------------------------------------------------------------------
      // Broad-type lookup (step 0b) — WHERE rule_type = $1 AND NOT starts_with…
      // -----------------------------------------------------------------------
      if (
        normalised.includes("not starts_with(rule_name, '__schema_default__')") ||
        normalised.includes("not starts_with(rule_name, '__schema_default") // safety variant
      ) {
        const [engineType, colName, extra] = params;
        let rows = existingRules.filter(r => {
          if (r.rule_type !== engineType) return false;
          if (!r.enabled) return false;
          if (r.rule_name.startsWith('__schema_default__')) return false;
          if (r.project_id !== null && r.project_id !== undefined) return false;
          if (r.column_name !== null && r.column_name !== colName) return false;
          return true;
        });

        // Apply extra discriminating filter supplied in params
        if (engineType === 'validity' && extra) {
          // $3 = datatype value
          rows = rows.filter(r => r.rule_config?.datatype === extra);
        }
        if (engineType === 'completeness') {
          // threshold filter via COALESCE(threshold, 1.0) = 1.0
          rows = rows.filter(r => {
            const t = r.rule_config?.threshold ?? 1.0;
            return Number(t) === 1.0;
          });
        }

        rows.sort((a, b) => {
          const aExact = a.column_name === colName ? 1 : 0;
          const bExact = b.column_name === colName ? 1 : 0;
          return bExact - aExact || a.id - b.id;
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
  // Config-specific types — record_count must still get synthetic rows
  // =========================================================================

  describe('Config-specific rules (record_count) still create distinct synthetic rows', () => {

    test('record_count with config override produces __schema_default__record_count__* row', async () => {
      const inserted = [];
      const db = buildMockDb({ insertedRules: inserted });
      const config = { operator: 'exactly', expected_count: 1000 };

      const result = await findOrCreateSchemaRule(db, 'record_count', '__file__', 'warning', config, []);

      expect(result).not.toBeNull();
      expect(result.rule_name).toMatch(/^__schema_default__record_count__/);
      expect(result.rule_name).toContain('exactly');
      expect(result.rule_name).toContain('ec1000');
      expect(inserted).toHaveLength(1);
    });

    test('different record_count configs produce different rule names', async () => {
      const inserted = [];
      const db = buildMockDb({ insertedRules: inserted });

      const cfg1 = { operator: 'exactly',   expected_count: 500  };
      const cfg2 = { operator: 'at_least',  expected_count: 100  };
      const cfg3 = { operator: 'between',   min_count: 200, max_count: 300 };

      const r1 = await findOrCreateSchemaRule(db, 'record_count', '__file__', 'warning', cfg1, []);
      const r2 = await findOrCreateSchemaRule(db, 'record_count', '__file__', 'warning', cfg2, []);
      const r3 = await findOrCreateSchemaRule(db, 'record_count', '__file__', 'warning', cfg3, []);

      const names = [r1.rule_name, r2.rule_name, r3.rule_name];
      const unique = new Set(names);
      expect(unique.size).toBe(3);
      expect(r3.rule_name).toContain('mn200');
      expect(r3.rule_name).toContain('mx300');
    });

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

});
