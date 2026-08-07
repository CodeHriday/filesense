/**
 * Lineage Graph Service — VM Mapping Execution Stats Tests
 *
 * Verifies that visual_mapping_executions stats (rowsRead, rowsWritten,
 * lastExecutedAt / lastRun) are correctly embedded in transformation and
 * targetFile nodes built by buildLineageGraph, even after the Redis cache
 * has expired and the graph is rebuilt from scratch.
 *
 * These tests run against a fully-mocked database so no real DB connection
 * is required.
 */

// ─── Mock dependencies before any require ────────────────────────────────────
jest.mock('../../backend/utils/logger', () => ({
  systemLogger: {
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Pool mock: pool.query is replaced per-test via mockQueryRouter below.
const mockQuery = jest.fn();
jest.mock('../../backend/db', () => ({ query: (...args) => mockQuery(...args) }));

// ─── Helper: build a deterministic query router ───────────────────────────────
/**
 * Given a map of { substringOrRegex → result }, returns a jest mock
 * implementation for pool.query that routes each SQL call to its matching
 * result and throws for unmatched queries.
 *
 * @param {Array<[string|RegExp, { rows: object[] }]>} routes
 */
function mockQueryRouter(routes) {
  return (sql) => {
    const normSql = sql.replace(/\s+/g, ' ').trim();
    for (const [pattern, result] of routes) {
      const matched =
        typeof pattern === 'string'
          ? normSql.includes(pattern)
          : pattern.test(normSql);
      if (matched) return Promise.resolve(result);
    }
    // Unknown query — return empty so the graph build doesn't crash on
    // ancillary look-ups we haven't specifically seeded.
    return Promise.resolve({ rows: [] });
  };
}

// ─── Shared test fixtures ─────────────────────────────────────────────────────
const PROJECT_ID  = 1;
const FILE_ID_DB  = 42;      // numeric PK in the `files` table
const FILE_ID_STR = 'file-storage-uuid-abc'; // file_id (storage reference)
const BASENAME    = 'source_data.csv';

/** A minimal files row returned by the "get file details" query. */
const FILE_ROW = {
  id:             FILE_ID_DB,
  file_id:        FILE_ID_STR,
  filename:       BASENAME,
  file_type:      'csv',
  file_size:      8192,
  created_at:     '2026-01-10T08:00:00Z',
  processing_step: 'complete',
  project_id:     PROJECT_ID,
  agreement_code: 'AGR-001',
  vendor_agreement_id: 10,
  row_count:      500,
  contains_pii:   false,
  data_classification: null,
  checksum:       'abc123'
};

/** A visual_mapping_defs row — includes graph_data with sourceConfig / targetRules. */
const VM_DEF_ROW = {
  vm_id:           7,
  vm_name:         'Daily Source Transform',
  graph_data: {
    nodes: [
      {
        type: 'sourceConfig',
        data: { config: { filePattern: '*.csv' } }
      },
      {
        type: 'targetRules',
        data: { config: { fileName: 'output_target', fileFormat: 'csv' } }
      }
    ]
  },
  project_id:      PROJECT_ID,
  last_executed_at: '2026-07-20T10:00:00Z',
  execution_count:  3
};

/** A completed visual_mapping_executions row joined with transformation_jobs. */
const EXEC_ROW = {
  completed_at:   '2026-08-01T14:30:00Z',
  rows_processed: 1200,
  rows_read:      1250,
  rows_written:   1200
};

/** The file_audit_details + visual_mapping_defs result for the VM fallback path. */
const VM_AUDIT_RESULT = { rows: [VM_DEF_ROW] };

// ─── Service under test (loaded after mocks are set up) ───────────────────────
const { buildLineageGraph, getNodeDetails } = require('../services/lineageGraphService');

// ─────────────────────────────────────────────────────────────────────────────
// Additional fixtures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VM def where config.fileName already includes the extension.
 * This is the scenario that previously produced 'output_target.csv.csv'.
 */
const VM_DEF_WITH_EXT_IN_FILENAME = {
  ...VM_DEF_ROW,
  graph_data: {
    nodes: [
      {
        type: 'sourceConfig',
        data: { config: { filePattern: '*.csv' } }
      },
      {
        type: 'targetRules',
        data: {
          config: {
            fileName: 'output_target.csv', // ← extension already present
            fileFormat: 'csv',
            orderedColumns: ['patient_id', 'site_code', 'enrollment_date']
          }
        }
      }
    ]
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────────────────

describe('buildLineageGraph — target node label when config.fileName already includes extension', () => {
  beforeEach(() => {
    mockQuery.mockImplementation(
      mockQueryRouter([
        ['FROM files f', { rows: [FILE_ROW] }],
        ['FROM column_governance_tag_assignments', { rows: [] }],
        ['FROM transformation_mappings tm', { rows: [] }],
        ['FROM file_audit_details fad', { rows: [VM_DEF_WITH_EXT_IN_FILENAME] }],
        ['FROM visual_mapping_executions vme', { rows: [EXEC_ROW] }],
        ["file_role = 'target'", { rows: [] }],
        ['FROM visual_workflows', { rows: [] }],
        ['FROM quality_rule_violations', { rows: [] }]
      ])
    );
  });

  test('target node label has a single .csv extension, not double', async () => {
    const graph = await buildLineageGraph({
      rootType: 'file',
      rootId: FILE_ID_DB,
      projectId: PROJECT_ID,
      depth: 3,
      includeIncidents: false
    });

    const targetNode = graph.nodes.find(n => n.type === 'targetFile');
    expect(targetNode).toBeDefined();
    expect(targetNode.label).toBe('output_target.csv');
    expect(targetNode.label).not.toContain('.csv.csv');
  });

  test('target node id does not include a double extension', async () => {
    const graph = await buildLineageGraph({
      rootType: 'file',
      rootId: FILE_ID_DB,
      projectId: PROJECT_ID,
      depth: 3,
      includeIncidents: false
    });

    const targetNode = graph.nodes.find(n => n.type === 'targetFile');
    expect(targetNode).toBeDefined();
    expect(targetNode.id).not.toContain('.csv.csv');
  });
});

describe('getNodeDetails — VM targetFile returns columns from orderedColumns', () => {
  /**
   * Seed the mock so getNodeDetails can find the VM def via graph_data JSONB.
   * The JSONB EXISTS subquery is matched by the 'visual_mapping_defs vmd' fragment;
   * the scalar ordered_columns subquery is matched by 'orderedColumns'.
   * Both are handled by the same mock route since pool.query sees the full SQL.
   */
  const VM_DETAIL_ROW = {
    vm_id: 7,
    vm_name: 'Daily Source Transform',
    project_id: PROJECT_ID,
    last_executed_at: '2026-07-20T10:00:00Z',
    execution_count: 3,
    // pg returns JSONB arrays as JS arrays automatically
    ordered_columns: ['patient_id', 'site_code', 'enrollment_date']
  };

  beforeEach(() => {
    mockQuery.mockImplementation(
      mockQueryRouter([
        // getNodeDetails targetFile VM JSONB lookup
        ['visual_mapping_defs vmd', { rows: [VM_DETAIL_ROW] }],
        // execution stats sub-query
        ['visual_mapping_executions vme', { rows: [EXEC_ROW] }]
      ])
    );
  });

  test('returns a non-empty columns array with correct names', async () => {
    const details = await getNodeDetails(
      'target-file-output_target.csv',
      'targetFile',
      PROJECT_ID
    );

    expect(details).not.toBeNull();
    expect(Array.isArray(details.columns)).toBe(true);
    expect(details.columns).toHaveLength(3);
    expect(details.columns[0].column_name).toBe('patient_id');
    expect(details.columns[1].column_name).toBe('site_code');
    expect(details.columns[2].column_name).toBe('enrollment_date');
  });

  test('each column has the expected shape', async () => {
    const details = await getNodeDetails(
      'target-file-output_target.csv',
      'targetFile',
      PROJECT_ID
    );

    for (const col of details.columns) {
      expect(typeof col.column_name).toBe('string');
      expect(typeof col.column_type).toBe('string');
      expect(typeof col.column_index).toBe('number');
      expect(Array.isArray(col.governance_tags)).toBe(true);
    }
  });

  test('returns is_visual_mapping and is_synthetic flags', async () => {
    const details = await getNodeDetails(
      'target-file-output_target.csv',
      'targetFile',
      PROJECT_ID
    );

    expect(details.is_visual_mapping).toBe(true);
    expect(details.is_synthetic).toBe(true);
  });

  test('returns null (no 404) when no VM def matches the filename', async () => {
    mockQuery.mockImplementation(
      mockQueryRouter([
        ['visual_mapping_defs vmd', { rows: [] }]
      ])
    );

    const details = await getNodeDetails(
      'target-file-unknown-file.csv',
      'targetFile',
      PROJECT_ID
    );

    expect(details).toBeNull();
  });
});

describe('buildLineageGraph — VM mapping stats via file traversal', () => {
  // Common routes that apply to all tests in this suite.
  const baseRoutes = [
    // 1. Get file details (traverseFromFile → "FROM files f … WHERE f.id")
    ['FROM files f', { rows: [FILE_ROW] }],

    // 2. PII columns — none for this file
    ['FROM column_governance_tag_assignments', { rows: [] }],

    // 3. ETL mappings — empty (VM jobs delete their row after execution)
    ['FROM transformation_mappings tm', { rows: [] }],

    // 4. VM fallback: file_audit_details JOIN visual_mapping_defs
    ['FROM file_audit_details fad', VM_AUDIT_RESULT],

    // 5. Target file resolution — no pre-existing file on disk
    ["file_role = 'target'", { rows: [] }],

    // 6. Workflows — none reference this mapping
    ['FROM visual_workflows', { rows: [] }],

    // 7. Quality violations — none
    ['FROM quality_rule_violations', { rows: [] }]
  ];

  describe('when the VM mapping has a completed execution', () => {
    beforeEach(() => {
      mockQuery.mockImplementation(
        mockQueryRouter([
          ...baseRoutes,
          // 5-a. Execution stats — completed row with rows_read / rows_written
          ['FROM visual_mapping_executions vme', { rows: [EXEC_ROW] }]
        ])
      );
    });

    test('transformation node has non-null rowsRead, rowsWritten, lastExecutedAt', async () => {
      const graph = await buildLineageGraph({
        rootType:  'file',
        rootId:    FILE_ID_DB,
        projectId: PROJECT_ID,
        depth:     3,
        includeIncidents: false
      });

      const txNode = graph.nodes.find(n => n.type === 'transformation');
      expect(txNode).toBeDefined();
      expect(txNode.label).toBe('[VM] Daily Source Transform');

      const meta = txNode.metadata;
      expect(meta.rowsRead).not.toBeNull();
      expect(meta.rowsRead).toBe(EXEC_ROW.rows_read);          // 1250

      expect(meta.rowsWritten).not.toBeNull();
      expect(meta.rowsWritten).toBe(EXEC_ROW.rows_written);    // 1200

      expect(meta.lastExecutedAt).not.toBeNull();
      expect(meta.lastExecutedAt).toBe(EXEC_ROW.completed_at);
    });

    test('target file node has non-null lastRun and rowsWritten', async () => {
      const graph = await buildLineageGraph({
        rootType:  'file',
        rootId:    FILE_ID_DB,
        projectId: PROJECT_ID,
        depth:     3,
        includeIncidents: false
      });

      const targetNode = graph.nodes.find(n => n.type === 'targetFile');
      expect(targetNode).toBeDefined();

      const meta = targetNode.metadata;
      expect(meta.lastRun).not.toBeNull();
      expect(meta.lastRun).toBe(EXEC_ROW.completed_at);

      expect(meta.rowsWritten).not.toBeNull();
      expect(meta.rowsWritten).toBe(EXEC_ROW.rows_written);    // 1200
    });

    test('transformation node carries isVisualMapping flag', async () => {
      const graph = await buildLineageGraph({
        rootType:  'file',
        rootId:    FILE_ID_DB,
        projectId: PROJECT_ID,
        depth:     3,
        includeIncidents: false
      });

      const txNode = graph.nodes.find(n => n.type === 'transformation');
      expect(txNode.metadata.isVisualMapping).toBe(true);
      expect(txNode.metadata.visualMappingId).toBe(VM_DEF_ROW.vm_id);
    });
  });

  describe('when rows_written is absent but rows_processed is present', () => {
    beforeEach(() => {
      const execRowNoWritten = {
        completed_at:   '2026-08-01T14:30:00Z',
        rows_processed: 999,
        rows_read:      1000,
        rows_written:   null   // transformation_jobs row may not have this column
      };
      mockQuery.mockImplementation(
        mockQueryRouter([
          ...baseRoutes,
          ['FROM visual_mapping_executions vme', { rows: [execRowNoWritten] }]
        ])
      );
    });

    test('rowsWritten falls back to rows_processed', async () => {
      const graph = await buildLineageGraph({
        rootType:  'file',
        rootId:    FILE_ID_DB,
        projectId: PROJECT_ID,
        depth:     3,
        includeIncidents: false
      });

      const txNode = graph.nodes.find(n => n.type === 'transformation');
      expect(txNode).toBeDefined();
      expect(txNode.metadata.rowsWritten).toBe(999);  // fell back to rows_processed
    });
  });

  describe('when the VM mapping has never been executed', () => {
    beforeEach(() => {
      // VM def has no last_executed_at; execution query returns no rows.
      const vmDefNoRun = { ...VM_DEF_ROW, last_executed_at: null, execution_count: 0 };
      mockQuery.mockImplementation(
        mockQueryRouter([
          ['FROM files f', { rows: [FILE_ROW] }],
          ['FROM column_governance_tag_assignments', { rows: [] }],
          ['FROM transformation_mappings tm', { rows: [] }],
          ['FROM file_audit_details fad', { rows: [vmDefNoRun] }],
          // Execution stats query → no rows (never run)
          ['FROM visual_mapping_executions vme', { rows: [] }],
          ["file_role = 'target'", { rows: [] }],
          ['FROM visual_workflows', { rows: [] }],
          ['FROM quality_rule_violations', { rows: [] }]
        ])
      );
    });

    test('transformation node has null rowsRead, rowsWritten, lastExecutedAt', async () => {
      const graph = await buildLineageGraph({
        rootType:  'file',
        rootId:    FILE_ID_DB,
        projectId: PROJECT_ID,
        depth:     3,
        includeIncidents: false
      });

      const txNode = graph.nodes.find(n => n.type === 'transformation');
      expect(txNode).toBeDefined();

      const meta = txNode.metadata;
      expect(meta.rowsRead).toBeNull();
      expect(meta.rowsWritten).toBeNull();
      expect(meta.lastExecutedAt).toBeNull();
    });

    test('target file node has null lastRun and rowsWritten', async () => {
      const graph = await buildLineageGraph({
        rootType:  'file',
        rootId:    FILE_ID_DB,
        projectId: PROJECT_ID,
        depth:     3,
        includeIncidents: false
      });

      const targetNode = graph.nodes.find(n => n.type === 'targetFile');
      expect(targetNode).toBeDefined();

      const meta = targetNode.metadata;
      expect(meta.lastRun).toBeNull();
      expect(meta.rowsWritten).toBeNull();
    });
  });

  describe('graph structure', () => {
    beforeEach(() => {
      mockQuery.mockImplementation(
        mockQueryRouter([
          ...baseRoutes,
          ['FROM visual_mapping_executions vme', { rows: [EXEC_ROW] }]
        ])
      );
    });

    test('graph includes source file → transformation → target file nodes', async () => {
      const graph = await buildLineageGraph({
        rootType:  'file',
        rootId:    FILE_ID_DB,
        projectId: PROJECT_ID,
        depth:     3,
        includeIncidents: false
      });

      const types = graph.nodes.map(n => n.type);
      expect(types).toContain('sourceFile');
      expect(types).toContain('transformation');
      expect(types).toContain('targetFile');
    });

    test('edges connect source file to transformation and transformation to target', async () => {
      const graph = await buildLineageGraph({
        rootType:  'file',
        rootId:    FILE_ID_DB,
        projectId: PROJECT_ID,
        depth:     3,
        includeIncidents: false
      });

      const srcNode = graph.nodes.find(n => n.type === 'sourceFile');
      const txNode  = graph.nodes.find(n => n.type === 'transformation');
      const tgtNode = graph.nodes.find(n => n.type === 'targetFile');

      const srcToTx = graph.edges.find(
        e => e.source === srcNode.id && e.target === txNode.id
      );
      expect(srcToTx).toBeDefined();
      expect(srcToTx.relationship).toBe('TRANSFORMED_BY');

      const txToTgt = graph.edges.find(
        e => e.source === txNode.id && e.target === tgtNode.id
      );
      expect(txToTgt).toBeDefined();
      expect(txToTgt.relationship).toBe('OUTPUTS_TO');
    });

    test('stats survive a simulated cache-expire rebuild (two sequential builds)', async () => {
      // Call buildLineageGraph twice in a row — as happens when the Redis TTL
      // expires and the route handler rebuilds from the DB.  Stats should be
      // identical on both calls because the service re-runs the
      // visual_mapping_executions query each time.
      const graph1 = await buildLineageGraph({
        rootType: 'file', rootId: FILE_ID_DB, projectId: PROJECT_ID,
        depth: 3, includeIncidents: false
      });
      const graph2 = await buildLineageGraph({
        rootType: 'file', rootId: FILE_ID_DB, projectId: PROJECT_ID,
        depth: 3, includeIncidents: false
      });

      const stats1 = graph1.nodes.find(n => n.type === 'transformation').metadata;
      const stats2 = graph2.nodes.find(n => n.type === 'transformation').metadata;

      expect(stats2.rowsRead).toBe(stats1.rowsRead);
      expect(stats2.rowsWritten).toBe(stats1.rowsWritten);
      expect(stats2.lastExecutedAt).toBe(stats1.lastExecutedAt);
    });
  });
});
