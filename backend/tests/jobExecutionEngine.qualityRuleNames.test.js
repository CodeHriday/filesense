/**
 * jobExecutionEngine — quality rule name accumulation integration tests
 *
 * Invokes executeTransformationJob with mocked infrastructure and inspects
 * the actual transformation_logs INSERT calls emitted by logJobExecution to
 * verify that abort/warning rule names are correctly accumulated (and
 * deduplicated) per file.
 *
 * Note: jest.config.js sets resetMocks: true, which clears mock implementations
 * between tests. All mock implementations are therefore re-applied in beforeEach.
 *
 * Done criteria (Task #226):
 *  ✓ When two different warn-action rules fire (one per file), both rule names
 *    appear across the execution log (each file's log entry shows its own rule)
 *  ✓ Names are NOT duplicated when the same rule fires multiple times on the
 *    same file (per-file deduplication via seenAbortIds / seenWarnIds)
 *  ✓ Abort-action rule: error log contains the correct rule name
 *  ✓ Abort-action rule fires multiple times on one file: name appears once
 *  ✓ Unknown rule ID (not in quality rules result) falls back to "Rule #<id>"
 *  ✓ Global violation_handling fallback used when per_rule_error_action is null
 */

// ---------------------------------------------------------------------------
// Heavy infrastructure mocks — must come before any require() of the engine.
// Factories use plain jest.fn() (no implementations) because resetMocks: true
// clears implementations between tests; re-apply in beforeEach instead.
// ---------------------------------------------------------------------------

jest.mock('../db', () => ({})); // guard: DI container not bootstrapped in tests

jest.mock('../utils/logger', () => ({
  systemLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../utils/cloudStorageFileList', () => ({
  downloadFileFromConnection: jest.fn(),
  uploadFileToConnection: jest.fn(),
  listAndFilterFiles: jest.fn()
}));

jest.mock('../services/schemaService', () => ({
  validateSchemaConsistency: jest.fn(),
  saveSchemaSnapshot: jest.fn(),
  inferDataType: jest.fn(),
  extractSchemaFromBuffer: jest.fn()
}));

jest.mock('../services/transformationEngine', () => ({
  transformRow: jest.fn()
}));

jest.mock('../services/anomalyRulesEngine', () => ({
  executeAnomalyDetection: jest.fn()
}));

jest.mock('../services/fileAuditService', () => ({
  captureFileAudit: jest.fn(),
  captureFileSchema: jest.fn()
}));

jest.mock('../services/etlProfilingService', () => ({
  profileETLOutputFile: jest.fn(),
  profileETLFile: jest.fn()
}));

jest.mock('../services/transformationProfilingService', () => ({
  profileFileBuffer: jest.fn(),
  downloadAndProfileFile: jest.fn()
}));

jest.mock('../services/governanceService', () => ({
  persistGovernanceMetadata: jest.fn()
}));

jest.mock('../services/schemaRuleEnforcer', () => ({
  enforceSchemaRulesForJob: jest.fn()
}));

jest.mock('../services/rdmContextLoader', () => ({
  loadRDMContext: jest.fn()
}));

jest.mock('../services/AlertAggregationWorker', () => ({
  onScheduleExecuted: jest.fn()
}));

jest.mock('../services/visualMappingWebSocket', () => ({
  emitExecutionProgress: jest.fn(),
  emitExecutionLog: jest.fn(),
  emitNodeStatus: jest.fn(),
  emitEdgeRowCount: jest.fn(),
  emitExecutionStart: jest.fn()
}));

jest.mock('../services/archiveExtractionService', () =>
  jest.fn()
);

// QualityValidationEngine is lazily required inside processFile; provide a
// factory so Jest never loads the real module (which transitively requires
// db.js → DI container → fails in unit test environment).
jest.mock('../services/qualityValidationEngine', () => jest.fn());

jest.mock('../services/ImmutableAuditLedgerService', () =>
  jest.fn()
);

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------
const { executeTransformationJob } = require('../services/jobExecutionEngine');
const { listAndFilterFiles, downloadFileFromConnection, uploadFileToConnection } =
  require('../utils/cloudStorageFileList');
const { transformRow } = require('../services/transformationEngine');
const { loadRDMContext } = require('../services/rdmContextLoader');
const { enforceSchemaRulesForJob } = require('../services/schemaRuleEnforcer');
const { executeAnomalyDetection } = require('../services/anomalyRulesEngine');
const { captureFileAudit, captureFileSchema } = require('../services/fileAuditService');
const { profileFileBuffer } = require('../services/transformationProfilingService');
const { persistGovernanceMetadata } = require('../services/governanceService');
const QualityValidationEngine = require('../services/qualityValidationEngine');
const ImmutableAuditLedgerService = require('../services/ImmutableAuditLedgerService');
const ArchiveExtractionService = require('../services/archiveExtractionService');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MAPPING_ID = 'MAP-TEST-001';
const JOB_ID = 'JOB-TEST-001';

/** A minimal two-row CSV buffer that survives the transformRow pass-through. */
const SIMPLE_CSV = Buffer.from('id,name\n1,Alice\n2,Bob\n');

/** Mapping row returned by getMappingConfig (SELECT * FROM transformation_mappings). */
function buildMapping(overrides = {}) {
  return {
    mapping_id: MAPPING_ID,
    mapping_name: 'Test Mapping',
    source_connection_id: 'conn-src-1',
    target_connection_id: null, // no upload path in tests
    file_path: '',
    file_name_pattern: '*.csv',
    source_file_pattern: '*.csv',
    field_mappings: [],
    variables: [],
    violation_handling: 'log_continue', // per-rule action wins; this is the fallback
    is_visual_mapping: false,
    visual_mapping_id: null,
    vendor_agreement_id: null,  // skips governance / vendor-agreement branches
    source_schema: null,
    rdm_lookup_enabled: false,
    rdm_crosswalk_config: null,
    rdm_dataset_config: null,
    rdm_crosswalk_configs: [],
    rdm_dataset_configs: [],
    project_id: 1,
    ...overrides
  };
}

/** Pre-built job object passed as existingJob to skip createJob DB queries. */
function buildExistingJob() {
  return {
    job_id: JOB_ID,
    id: 1,
    mapping_id: MAPPING_ID,
    status: 'running',
    correlation_id: JOB_ID,
    start_time: new Date(Date.now() - 5000)
  };
}

/**
 * Build a smart pool mock that:
 *  - Intercepts getMappingConfig SELECT → returns buildMapping(mappingOverrides)
 *  - Intercepts quality rules SELECT → returns qualityRuleRows
 *  - Captures every transformation_logs INSERT into pool._logMessages
 *  - Returns safe defaults for all other queries
 */
function buildPoolMock({ qualityRuleRows = [], mappingOverrides = {} } = {}) {
  const logMessages = [];
  const mapping = buildMapping(mappingOverrides);

  const pool = {
    query: jest.fn(async (sql, params = []) => {
      const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      // getMappingConfig — SELECT * FROM transformation_mappings
      if (q.includes('transformation_mappings') && q.includes('where mapping_id')) {
        return { rows: [mapping] };
      }

      // logJobExecution — INSERT INTO transformation_logs
      // params: [$1=job_id, $2=level, $3=message, $4=details_json]
      if (q.includes('insert into transformation_logs')) {
        logMessages.push({
          level: params[1],
          message: params[2],
          details: (() => { try { return JSON.parse(params[3]); } catch { return {}; } })()
        });
        return { rows: [] };
      }

      // processFile — SELECT correlation_id FROM transformation_jobs
      if (q.includes('correlation_id') && q.includes('transformation_jobs')) {
        return { rows: [{ correlation_id: JOB_ID }] };
      }

      // Quality rules query — SELECT qr.*, tqr.error_action ... FROM transformation_quality_rules
      if (q.includes('transformation_quality_rules')) {
        return { rows: qualityRuleRows };
      }

      // persistViolations — INSERT INTO quality_rule_violations
      if (q.includes('quality_rule_violations')) {
        return { rows: [] };
      }

      // updateJob (end_time branch) — SELECT start_time FROM transformation_jobs
      if (q.includes('start_time') && q.includes('transformation_jobs')) {
        return { rows: [{ start_time: new Date(Date.now() - 2000) }] };
      }

      // updateJob — UPDATE transformation_jobs SET ... RETURNING *
      if (q.includes('update transformation_jobs')) {
        return { rows: [{ job_id: JOB_ID, status: 'running', start_time: new Date() }] };
      }

      // Everything else (lineage checks, schema fingerprint, etc.) — empty result
      return { rows: [] };
    }),

    /** Captured log entries: { level, message, details }. */
    _logMessages: logMessages
  };

  return pool;
}

/** Standard options that keep the execution path as shallow as possible. */
const STANDARD_OPTIONS = {
  existingJob: buildExistingJob(),
  runSchemaValidation: false, // skip multi-file schema-consistency check
  runProfilingChecks: false,  // skip anomaly detection (requires DB file_id)
  dryRun: true                // skip upload, audit, and target profiling steps
};

/** Build a QualityValidationEngine.validateData return value. */
function makeValidationResult(violations) {
  return {
    violations,
    errors: [],
    summary: {
      violations_found: violations.length,
      critical_count: 0,
      error_count: 0,
      warning_count: violations.length
    }
  };
}

// ---------------------------------------------------------------------------
// Shared per-test state
// ---------------------------------------------------------------------------

let validateDataMock;

beforeEach(() => {
  // Re-apply all mock implementations (resetMocks: true clears them each test)

  loadRDMContext.mockResolvedValue({ rdm: { crosswalks: {}, datasets: {} } });
  enforceSchemaRulesForJob.mockResolvedValue({ violations: [], errors: [] });
  executeAnomalyDetection.mockResolvedValue({ totalAnomalies: 0, anomaliesByType: {} });
  captureFileAudit.mockResolvedValue('audit-id-1');
  captureFileSchema.mockResolvedValue({ schemaId: 'schema-id-1' });
  profileFileBuffer.mockResolvedValue({ success: false, error: 'disabled in tests' });
  persistGovernanceMetadata.mockResolvedValue({ success: true, governanceApplied: false });
  uploadFileToConnection.mockResolvedValue({ location: 's3://bucket/output.csv' });

  // transformRow: pass every row through so transformedRows is non-empty and
  // quality validation is triggered.
  transformRow.mockImplementation((row) => ({ ...row }));

  // listAndFilterFiles: one file by default; overridden per test for multi-file cases.
  listAndFilterFiles.mockResolvedValue([{ filename: 'data.csv', size: 100 }]);

  // downloadFileFromConnection: return a two-row CSV buffer.
  downloadFileFromConnection.mockResolvedValue(SIMPLE_CSV);

  // ImmutableAuditLedgerService: silence audit ledger writes.
  ImmutableAuditLedgerService.mockImplementation(() => ({
    appendEntry: jest.fn().mockResolvedValue(undefined)
  }));

  // ArchiveExtractionService: not needed in these tests.
  ArchiveExtractionService.mockImplementation(() => ({
    extractArchive: jest.fn().mockResolvedValue({ files: [], extractedCount: 0 })
  }));

  // QualityValidationEngine: shared validateData mock for sequential per-file control.
  validateDataMock = jest.fn();
  QualityValidationEngine.mockImplementation(() => ({
    validateData: validateDataMock
  }));
});

// ---------------------------------------------------------------------------
// Tests: single-file deduplication
// ---------------------------------------------------------------------------

describe('Quality rule name deduplication within a single file', () => {
  test('same warn rule fires multiple times → name appears exactly once in the warn log', async () => {
    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 10, rule_name: 'Null Check', enabled: true, per_rule_error_action: 'log_warn' }
      ]
    });

    // Rule 10 fires on 3 different rows in the same file
    validateDataMock.mockResolvedValueOnce(
      makeValidationResult([
        { rule_id: 10, row_number: 1 },
        { rule_id: 10, row_number: 2 },
        { rule_id: 10, row_number: 3 }
      ])
    );

    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    const warnLogs = pool._logMessages.filter(m =>
      m.level === 'warn' && m.message.includes('Warn-action rule')
    );
    expect(warnLogs.length).toBeGreaterThanOrEqual(1);

    const warnMsg = warnLogs[0].message;
    // "Null Check" must appear exactly once (within-file deduplication)
    const occurrences = (warnMsg.match(/"Null Check"/g) || []).length;
    expect(occurrences).toBe(1);
  });

  test('two different warn rules fire on one file → both names appear in one warn log', async () => {
    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 10, rule_name: 'Null Check',     enabled: true, per_rule_error_action: 'log_warn' },
        { id: 20, rule_name: 'Range Validator', enabled: true, per_rule_error_action: 'log_warn' }
      ]
    });

    validateDataMock.mockResolvedValueOnce(
      makeValidationResult([{ rule_id: 10 }, { rule_id: 20 }, { rule_id: 10 }])
    );

    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    const warnLogs = pool._logMessages.filter(m =>
      m.level === 'warn' && m.message.includes('Warn-action rule')
    );
    expect(warnLogs.length).toBeGreaterThanOrEqual(1);

    const warnMsg = warnLogs[0].message;
    expect(warnMsg).toMatch(/"Null Check"/);
    expect(warnMsg).toMatch(/"Range Validator"/);
    // Neither name is duplicated
    expect((warnMsg.match(/"Null Check"/g) || []).length).toBe(1);
    expect((warnMsg.match(/"Range Validator"/g) || []).length).toBe(1);
  });

  test('abort rule fires multiple times on one file → name appears once in error log', async () => {
    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 10, rule_name: 'Null Check', enabled: true, per_rule_error_action: 'log_abort' }
      ]
    });

    validateDataMock.mockResolvedValueOnce(
      makeValidationResult([
        { rule_id: 10, row_number: 1 },
        { rule_id: 10, row_number: 2 },
        { rule_id: 10, row_number: 5 }
      ])
    );

    // Abort errors are re-thrown from processFile but caught by the file-level
    // catch in the engine's file loop; the error log is emitted before the throw.
    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    const abortLogs = pool._logMessages.filter(m =>
      m.level === 'error' && m.message.includes('Aborting due to Abort-action rule')
    );
    expect(abortLogs.length).toBeGreaterThanOrEqual(1);

    const errMsg = abortLogs[0].message;
    expect(errMsg).toMatch(/"Null Check"/);
    // Deduplicated — appears exactly once
    expect((errMsg.match(/"Null Check"/g) || []).length).toBe(1);
  });

  test('abort details metadata includes abort_rule_names array (no duplicates)', async () => {
    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 10, rule_name: 'Null Check', enabled: true, per_rule_error_action: 'log_abort' }
      ]
    });

    validateDataMock.mockResolvedValueOnce(
      makeValidationResult([{ rule_id: 10 }, { rule_id: 10 }])
    );

    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    const abortLogs = pool._logMessages.filter(m =>
      m.level === 'error' && m.message.includes('Aborting due to Abort-action rule')
    );
    expect(abortLogs.length).toBeGreaterThanOrEqual(1);

    const { details } = abortLogs[0];
    expect(details).toHaveProperty('abort_rule_names');
    expect(details.abort_rule_names).toEqual(['Null Check']);
  });

  test('warn details metadata includes warn_rule_names array (no duplicates)', async () => {
    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 30, rule_name: 'Range Validator', enabled: true, per_rule_error_action: 'log_warn' }
      ]
    });

    validateDataMock.mockResolvedValueOnce(
      makeValidationResult([{ rule_id: 30 }, { rule_id: 30 }])
    );

    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    const warnLogs = pool._logMessages.filter(m =>
      m.level === 'warn' && m.message.includes('Warn-action rule')
    );
    expect(warnLogs.length).toBeGreaterThanOrEqual(1);

    const { details } = warnLogs[0];
    expect(details).toHaveProperty('warn_rule_names');
    expect(details.warn_rule_names).toEqual(['Range Validator']);
  });
});

// ---------------------------------------------------------------------------
// Tests: multi-file scenarios
// ---------------------------------------------------------------------------

describe('Quality rule name accumulation across multiple files', () => {
  beforeEach(() => {
    // Override to return two source files for all tests in this describe block
    listAndFilterFiles.mockResolvedValue([
      { filename: 'file1.csv', size: 100 },
      { filename: 'file2.csv', size: 100 }
    ]);
  });

  test('different warn rule fires on each file → both names appear across log messages', async () => {
    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 10, rule_name: 'Null Check',     enabled: true, per_rule_error_action: 'log_warn' },
        { id: 20, rule_name: 'Range Validator', enabled: true, per_rule_error_action: 'log_warn' }
      ]
    });

    // File 1: only rule 10 fires; File 2: only rule 20 fires
    validateDataMock
      .mockResolvedValueOnce(makeValidationResult([{ rule_id: 10 }]))
      .mockResolvedValueOnce(makeValidationResult([{ rule_id: 20 }]));

    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    const warnLogs = pool._logMessages.filter(m =>
      m.level === 'warn' && m.message.includes('Warn-action rule')
    );

    // One warn log entry per file
    expect(warnLogs.length).toBe(2);

    // Across both entries, both rule names surface
    const allNames = warnLogs.flatMap(l => l.details.warn_rule_names || []);
    expect(allNames).toContain('Null Check');
    expect(allNames).toContain('Range Validator');

    // Each entry contains exactly its own rule (correct per-file scoping)
    expect(warnLogs[0].details.warn_rule_names).toEqual(['Null Check']);
    expect(warnLogs[1].details.warn_rule_names).toEqual(['Range Validator']);
  });

  test('same warn rule fires on both files → name appears once per file log (per-file dedup)', async () => {
    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 10, rule_name: 'Null Check', enabled: true, per_rule_error_action: 'log_warn' }
      ]
    });

    // Rule 10 fires twice on file 1, twice on file 2
    validateDataMock
      .mockResolvedValueOnce(makeValidationResult([{ rule_id: 10 }, { rule_id: 10 }]))
      .mockResolvedValueOnce(makeValidationResult([{ rule_id: 10 }, { rule_id: 10 }]));

    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    const warnLogs = pool._logMessages.filter(m =>
      m.level === 'warn' && m.message.includes('Warn-action rule')
    );

    // Two files → two warn log entries
    expect(warnLogs.length).toBe(2);

    // Each file's log is deduplicated: rule appears exactly once per entry
    warnLogs.forEach(l => {
      expect(l.details.warn_rule_names).toEqual(['Null Check']);
    });
  });

  test('three files with distinct warn rules → all three names appear across logs', async () => {
    listAndFilterFiles.mockResolvedValue([
      { filename: 'file1.csv', size: 100 },
      { filename: 'file2.csv', size: 100 },
      { filename: 'file3.csv', size: 100 }
    ]);

    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 10, rule_name: 'Null Check',     enabled: true, per_rule_error_action: 'log_warn' },
        { id: 20, rule_name: 'Range Validator', enabled: true, per_rule_error_action: 'log_warn' },
        { id: 30, rule_name: 'Regex Match',     enabled: true, per_rule_error_action: 'log_warn' }
      ]
    });

    validateDataMock
      .mockResolvedValueOnce(makeValidationResult([{ rule_id: 10 }]))
      .mockResolvedValueOnce(makeValidationResult([{ rule_id: 20 }]))
      .mockResolvedValueOnce(makeValidationResult([{ rule_id: 30 }]));

    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    const warnLogs = pool._logMessages.filter(m =>
      m.level === 'warn' && m.message.includes('Warn-action rule')
    );
    expect(warnLogs.length).toBe(3);

    const allNames = warnLogs.flatMap(l => l.details.warn_rule_names || []);
    expect(allNames).toContain('Null Check');
    expect(allNames).toContain('Range Validator');
    expect(allNames).toContain('Regex Match');
  });

  test('file 1 aborts → abort log names its rule; file 2 warn-rule also processed', async () => {
    // Per engine design: DQ_ABORT is re-thrown from processFile but caught by the
    // file-loop catch block in executeTransformationJob (which does NOT re-throw),
    // so processing continues to file 2.
    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 10, rule_name: 'Null Check',     enabled: true, per_rule_error_action: 'log_abort' },
        { id: 20, rule_name: 'Range Validator', enabled: true, per_rule_error_action: 'log_warn'  }
      ]
    });

    validateDataMock
      .mockResolvedValueOnce(makeValidationResult([{ rule_id: 10 }])) // file 1: abort
      .mockResolvedValueOnce(makeValidationResult([{ rule_id: 20 }])); // file 2: warn

    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    // File 1: abort log must name "Null Check"
    const abortLogs = pool._logMessages.filter(m =>
      m.level === 'error' && m.message.includes('Aborting due to Abort-action rule')
    );
    expect(abortLogs.length).toBeGreaterThanOrEqual(1);
    expect(abortLogs[0].message).toMatch(/"Null Check"/);
    expect(abortLogs[0].details.abort_rule_names).toEqual(['Null Check']);

    // File 2: warn log must name "Range Validator"
    const warnLogs = pool._logMessages.filter(m =>
      m.level === 'warn' && m.message.includes('Warn-action rule')
    );
    expect(warnLogs.length).toBeGreaterThanOrEqual(1);
    expect(warnLogs[0].message).toMatch(/"Range Validator"/);
  });
});

// ---------------------------------------------------------------------------
// Tests: edge cases
// ---------------------------------------------------------------------------

describe('Quality rule name edge cases (via real engine)', () => {
  test('unknown rule ID falls back to "Rule #<id>" in the log', async () => {
    // Quality rules table knows only rule 10; violation references rule 99.
    // With global violation_handling = log_warn, rule 99's action falls back to log_warn.
    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 10, rule_name: 'Null Check', enabled: true, per_rule_error_action: 'log_warn' }
      ],
      mappingOverrides: { violation_handling: 'log_warn' }
    });

    validateDataMock.mockResolvedValueOnce(
      makeValidationResult([{ rule_id: 99 }]) // unknown rule; not in qualityRuleRows
    );

    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    const warnLogs = pool._logMessages.filter(m =>
      m.level === 'warn' && m.message.includes('Warn-action rule')
    );
    expect(warnLogs.length).toBeGreaterThanOrEqual(1);
    expect(warnLogs[0].message).toMatch(/"Rule #99"/);
    expect(warnLogs[0].details.warn_rule_names).toContain('Rule #99');
  });

  test('global violation_handling log_abort fires when per_rule_error_action is null', async () => {
    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 77, rule_name: 'Legacy Rule', enabled: true, per_rule_error_action: null }
      ],
      mappingOverrides: { violation_handling: 'log_abort' }
    });

    validateDataMock.mockResolvedValueOnce(
      makeValidationResult([{ rule_id: 77 }])
    );

    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    const abortLogs = pool._logMessages.filter(m =>
      m.level === 'error' && m.message.includes('Aborting due to Abort-action rule')
    );
    expect(abortLogs.length).toBeGreaterThanOrEqual(1);
    expect(abortLogs[0].message).toMatch(/"Legacy Rule"/);
    expect(abortLogs[0].details.abort_rule_names).toEqual(['Legacy Rule']);
  });

  test('rule with null rule_name falls back to "Rule #<id>"', async () => {
    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 88, rule_name: null, enabled: true, per_rule_error_action: 'log_warn' }
      ]
    });

    validateDataMock.mockResolvedValueOnce(
      makeValidationResult([{ rule_id: 88 }])
    );

    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    const warnLogs = pool._logMessages.filter(m =>
      m.level === 'warn' && m.message.includes('Warn-action rule')
    );
    expect(warnLogs.length).toBeGreaterThanOrEqual(1);
    expect(warnLogs[0].message).toMatch(/"Rule #88"/);
    expect(warnLogs[0].details.warn_rule_names).toEqual(['Rule #88']);
  });

  test('no violations → no abort or warn rule-name log emitted', async () => {
    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 10, rule_name: 'Null Check', enabled: true, per_rule_error_action: 'log_abort' }
      ]
    });

    validateDataMock.mockResolvedValueOnce(makeValidationResult([]));

    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    const abortLogs = pool._logMessages.filter(m =>
      m.level === 'error' && m.message.includes('Aborting due to Abort-action rule')
    );
    const warnLogs = pool._logMessages.filter(m =>
      m.level === 'warn' && m.message.includes('Warn-action rule')
    );
    expect(abortLogs).toHaveLength(0);
    expect(warnLogs).toHaveLength(0);
  });

  test('log_continue violations do not emit any rule-name log', async () => {
    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 50, rule_name: 'Soft Audit', enabled: true, per_rule_error_action: 'log_continue' }
      ]
    });

    validateDataMock.mockResolvedValueOnce(
      makeValidationResult([{ rule_id: 50 }, { rule_id: 50 }])
    );

    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    const abortLogs = pool._logMessages.filter(m =>
      m.level === 'error' && m.message.includes('Aborting due to Abort-action rule')
    );
    const warnLogs = pool._logMessages.filter(m =>
      m.level === 'warn' && m.message.includes('Warn-action rule')
    );
    expect(abortLogs).toHaveLength(0);
    expect(warnLogs).toHaveLength(0);
  });

  test('abort + warn violations on same file: abort wins; only abort names logged', async () => {
    const pool = buildPoolMock({
      qualityRuleRows: [
        { id: 10, rule_name: 'Null Check',     enabled: true, per_rule_error_action: 'log_abort' },
        { id: 30, rule_name: 'Range Validator', enabled: true, per_rule_error_action: 'log_warn'  }
      ]
    });

    validateDataMock.mockResolvedValueOnce(
      makeValidationResult([{ rule_id: 30 }, { rule_id: 10 }]) // warn first, then abort
    );

    await executeTransformationJob(pool, MAPPING_ID, 'user-1', STANDARD_OPTIONS);

    const abortLogs = pool._logMessages.filter(m =>
      m.level === 'error' && m.message.includes('Aborting due to Abort-action rule')
    );
    expect(abortLogs.length).toBeGreaterThanOrEqual(1);
    expect(abortLogs[0].message).toMatch(/"Null Check"/);
    // Warn-only rule must NOT appear in the abort message
    expect(abortLogs[0].message).not.toMatch(/"Range Validator"/);
  });
});
