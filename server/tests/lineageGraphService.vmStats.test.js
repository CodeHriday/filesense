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

// ─────────────────────────────────────────────────────────────────────────────
// getNodeDetails — VM transformation: field_mappings from expression nodes
// ─────────────────────────────────────────────────────────────────────────────

describe('getNodeDetails — VM transformation node returns field_mappings from expression nodes', () => {
  const VM_ID = 13;
  const nodeId = `mapping-vm-${VM_ID}-synthetic`;

  /** VM def row returned by the combined visual_mapping_defs + LATERAL JOIN query. */
  const VM_TRANSFORM_ROW = {
    vm_id:            VM_ID,
    vm_name:          'gmap_vendor1_fileload',
    project_id:       PROJECT_ID,
    last_executed_at: '2026-08-07T10:00:00Z',
    execution_count:  10,
    completed_at:     '2026-08-07T10:00:00Z',
    rows_processed:   4,
    rows_read:        4,
    rows_written:     4,
    graph_data: {
      nodes: [
        {
          type: 'sourceConfig',
          data: { config: { filePattern: '*.csv' } }
        },
        {
          type: 'targetRules',
          data: { config: { fileName: 'enrollment-tgt', fileFormat: 'csv' } }
        },
        {
          type: 'expression',
          data: {
            config: {
              // Modal stores container as camelCase 'fieldMappings'; entries use
              // snake_case keys; operation stored as 'transformation' (not transformation_type).
              fieldMappings: [
                {
                  source_field: 'Country_code',
                  target_field: 'Country',
                  transformation: 'none',
                  transformation_params: {},
                  data_type: 'STRING',
                  include: true
                },
                {
                  source_field: 'Value',
                  target_field: 'Country_name',
                  transformation: 'none',
                  transformation_params: {},
                  data_type: 'STRING',
                  include: true
                },
                {
                  source_field: 'Patient_ID',
                  target_field: 'Patient_ID',
                  transformation: 'UPPER',
                  transformation_params: {},
                  data_type: 'STRING',
                  include: true
                },
                // Excluded entry — must be skipped
                {
                  source_field: 'internal_col',
                  target_field: 'internal_col',
                  transformation: 'none',
                  transformation_params: {},
                  data_type: 'STRING',
                  include: false
                }
              ]
            }
          }
        }
      ]
    }
  };

  beforeEach(() => {
    mockQuery.mockImplementation(
      mockQueryRouter([
        // The transformation detail query is a single SQL with LATERAL JOIN;
        // it matches 'FROM visual_mapping_defs vmd'.
        ['FROM visual_mapping_defs vmd', { rows: [VM_TRANSFORM_ROW] }]
      ])
    );
  });

  test('returns a field_mappings array with only included entries', async () => {
    const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);
    expect(details).not.toBeNull();
    expect(Array.isArray(details.field_mappings)).toBe(true);
    // 3 included entries (the include:false one is skipped)
    expect(details.field_mappings).toHaveLength(3);
  });

  test('direct mappings (transformation: "none") become transformation_type "direct"', async () => {
    const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);
    const directMappings = details.field_mappings.filter(
      fm => fm.transformation_type === 'direct'
    );
    expect(directMappings).toHaveLength(2);

    const countryMapping = directMappings.find(fm => fm.source_field === 'Country_code');
    expect(countryMapping).toBeDefined();
    expect(countryMapping.target_field).toBe('Country');

    const valueMapping = directMappings.find(fm => fm.source_field === 'Value');
    expect(valueMapping).toBeDefined();
    expect(valueMapping.target_field).toBe('Country_name');
  });

  test('derived mappings carry the real transformation_type and source_fields array', async () => {
    const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);
    const derivedMappings = details.field_mappings.filter(
      fm => fm.transformation_type !== 'direct' && fm.transformation_type !== 'rename'
    );
    expect(derivedMappings).toHaveLength(1);

    const upperMapping = derivedMappings[0];
    expect(upperMapping.transformation_type).toBe('UPPER');
    expect(upperMapping.source_field).toBe('Patient_ID');
    expect(upperMapping.target_field).toBe('Patient_ID');
    expect(Array.isArray(upperMapping.source_fields)).toBe(true);
    expect(upperMapping.source_fields).toContain('Patient_ID');
    expect(typeof upperMapping.expression).toBe('string');
    expect(upperMapping.expression).toContain('UPPER');
  });

  test('returns is_visual_mapping flag and active status', async () => {
    const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);
    expect(details.is_visual_mapping).toBe(true);
    expect(details.status).toBe('active');
  });

  test('returns empty field_mappings when graph_data has no expression nodes', async () => {
    const vmNoExpression = {
      ...VM_TRANSFORM_ROW,
      graph_data: {
        nodes: [
          { type: 'sourceConfig', data: { config: { filePattern: '*.csv' } } },
          { type: 'targetRules',  data: { config: { fileName: 'out', fileFormat: 'csv' } } }
        ]
      }
    };
    mockQuery.mockImplementation(
      mockQueryRouter([['FROM visual_mapping_defs vmd', { rows: [vmNoExpression] }]])
    );

    const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);
    expect(details).not.toBeNull();
    expect(details.field_mappings).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getNodeDetails — VM transformation: field_mappings enriched with PII status
// ─────────────────────────────────────────────────────────────────────────────

describe('getNodeDetails — VM transformation field_mappings carry source_is_pii / target_is_pii', () => {
  const VM_ID = 13;
  const nodeId = `mapping-vm-${VM_ID}-synthetic`;
  const TARGET_FILE_ID = 'enrollment-tgt-storage-uuid';
  const SOURCE_FILE_ID = 'source-vendor-file-storage-uuid';

  /**
   * VM def with two mappings that use DIFFERENT column names for source and target:
   *   SSN (PII in source)          → patient_ssn (not PII in output)
   *   Country_code (not PII)       → Patient_ID  (PII in output)
   *
   * This decouples source and target PII so tests can independently verify
   * that source_is_pii comes from the source file and target_is_pii from the
   * output file — not both from the same set.
   */
  const VM_TRANSFORM_PII_ROW = {
    vm_id:            VM_ID,
    vm_name:          'gmap_vendor1_fileload',
    project_id:       PROJECT_ID,
    last_executed_at: '2026-08-07T10:00:00Z',
    execution_count:  10,
    completed_at:     '2026-08-07T10:00:00Z',
    rows_processed:   4,
    rows_read:        4,
    rows_written:     4,
    graph_data: {
      nodes: [
        {
          type: 'sourceConfig',
          data: { config: { filePattern: '*.csv' } }
        },
        {
          type: 'targetRules',
          data: { config: { fileName: 'enrollment-tgt', fileFormat: 'csv' } }
        },
        {
          type: 'expression',
          data: {
            config: {
              fieldMappings: [
                // Only PII in SOURCE (SSN); not tagged in output
                {
                  source_field: 'SSN',
                  target_field: 'patient_ssn',
                  transformation: 'none',
                  transformation_params: {},
                  data_type: 'STRING',
                  include: true
                },
                // Only PII in TARGET (Patient_ID); not PII under that name in source
                {
                  source_field: 'Country_code',
                  target_field: 'Patient_ID',
                  transformation: 'none',
                  transformation_params: {},
                  data_type: 'STRING',
                  include: true
                },
                // No PII on either side
                {
                  source_field: 'Site_code',
                  target_field: 'Site_code',
                  transformation: 'none',
                  transformation_params: {},
                  data_type: 'STRING',
                  include: true
                }
              ]
            }
          }
        }
      ]
    }
  };

  /** Output file has Patient_ID as PII; patient_ssn is NOT tagged. */
  const TARGET_PII_ROWS = [{ column_name: 'Patient_ID' }];
  /** Source file has SSN as PII; Country_code is NOT tagged. */
  const SOURCE_PII_ROWS = [{ column_name: 'SSN' }];

  const TARGET_FILE_LOOKUP_ROW  = { file_id: TARGET_FILE_ID };
  const SOURCE_AUDIT_ROW        = { file_id: SOURCE_FILE_ID };

  /**
   * Route order matters for the mock router (first match wins):
   * 1. VM details query       — 'FROM visual_mapping_defs vmd'
   * 2. Source audit query     — 'file_audit_details fad'  (more specific; canonical join)
   *    The source audit now joins on f.file_id = fad.file_id (not filename) so that
   *    same-named files in different uploads cannot bleed PII across file boundaries.
   * 3. Output file lookup     — 'FROM files f'
   * 4. Source PII query       — /file_id = ANY/           (must precede #5)
   * 5. Target PII query       — 'column_governance_tag_assignments'
   */
  const buildRoutes = ({
    targetFileRows = [TARGET_FILE_LOOKUP_ROW],
    auditRows      = [SOURCE_AUDIT_ROW],
    sourcePiiRows  = SOURCE_PII_ROWS,
    targetPiiRows  = TARGET_PII_ROWS
  } = {}) => [
    ['FROM visual_mapping_defs vmd',    { rows: [VM_TRANSFORM_PII_ROW] }],
    // Source audit uses canonical join: fad.file_id = f.file_id (not filename matching)
    ['file_audit_details fad',          { rows: auditRows }],
    ['FROM files f',                    { rows: targetFileRows }],
    [/file_id = ANY/,                   { rows: sourcePiiRows }],
    ['column_governance_tag_assignments', { rows: targetPiiRows }]
  ];

  describe('when both source and target files are known with different PII columns', () => {
    beforeEach(() => {
      mockQuery.mockImplementation(mockQueryRouter(buildRoutes()));
    });

    test('SSN→patient_ssn: only source_is_pii is true', async () => {
      const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);
      expect(details).not.toBeNull();

      const ssnMapping = details.field_mappings.find(fm => fm.source_field === 'SSN');
      expect(ssnMapping).toBeDefined();
      expect(ssnMapping.source_is_pii).toBe(true);    // SSN is PII in source file
      expect(ssnMapping.target_is_pii).toBe(false);   // patient_ssn is not tagged in output
    });

    test('Country_code→Patient_ID: only target_is_pii is true', async () => {
      const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);

      const countryMapping = details.field_mappings.find(fm => fm.source_field === 'Country_code');
      expect(countryMapping).toBeDefined();
      expect(countryMapping.source_is_pii).toBe(false);  // Country_code not PII in source
      expect(countryMapping.target_is_pii).toBe(true);   // Patient_ID is PII in output
    });

    test('Site_code→Site_code: neither flag is true', async () => {
      const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);

      const siteMapping = details.field_mappings.find(fm => fm.source_field === 'Site_code');
      expect(siteMapping).toBeDefined();
      expect(!!siteMapping.source_is_pii).toBe(false);
      expect(!!siteMapping.target_is_pii).toBe(false);
    });

    test('all field_mappings entries are present after PII enrichment', async () => {
      const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);
      expect(details.field_mappings).toHaveLength(3);
    });
  });

  describe('when source provenance cannot be resolved (no audit records)', () => {
    beforeEach(() => {
      mockQuery.mockImplementation(
        mockQueryRouter(buildRoutes({ auditRows: [], sourcePiiRows: [] }))
      );
    });

    test('source_is_pii stays false for all mappings; target_is_pii still works', async () => {
      const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);
      expect(details).not.toBeNull();

      for (const fm of details.field_mappings) {
        expect(!!fm.source_is_pii).toBe(false);   // not inferred from output
      }
      // Target PII should still work independently
      const patientTargetMapping = details.field_mappings.find(
        fm => fm.target_field === 'Patient_ID'
      );
      expect(patientTargetMapping?.target_is_pii).toBe(true);
    });
  });

  describe('when neither output file nor source audit records exist', () => {
    beforeEach(() => {
      mockQuery.mockImplementation(
        mockQueryRouter(buildRoutes({
          targetFileRows: [],
          auditRows:      [],
          sourcePiiRows:  [],
          targetPiiRows:  []
        }))
      );
    });

    test('field_mappings are returned without any PII flags (graceful degradation)', async () => {
      const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);
      expect(details).not.toBeNull();
      expect(details.field_mappings).toHaveLength(3);

      for (const fm of details.field_mappings) {
        expect(!!fm.source_is_pii).toBe(false);
        expect(!!fm.target_is_pii).toBe(false);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getNodeDetails — VM targetFile: governance tags from column_governance_tag_assignments
// ─────────────────────────────────────────────────────────────────────────────

describe('getNodeDetails — VM targetFile enriches columns with governance tags', () => {
  const TARGET_FILENAME = 'genmab-vend1-enrollment-tgt.csv';
  const FILE_STRING_ID  = 'output-file-storage-uuid-xyz';

  /** Row returned by the VM JSONB lookup (targetFile path, no graph_data needed here). */
  const VM_TARGET_ROW = {
    vm_id:            13,
    vm_name:          'gmap_vendor1_fileload',
    project_id:       PROJECT_ID,
    last_executed_at: '2026-08-07T10:00:00Z',
    execution_count:  10,
    // orderedColumns is serialised by pg as a JS array from JSONB
    ordered_columns: ['Country_name', 'Patient_ID', 'Country_code', 'Gender']
  };

  /** Only Patient_ID is PII in this scenario. */
  const PII_TAG_ROWS = [
    { column_name: 'Patient_ID', governance_tags: ['tag_pii'] }
  ];

  const FILE_LOOKUP_ROW = { file_id: FILE_STRING_ID };

  beforeEach(() => {
    mockQuery.mockImplementation(
      mockQueryRouter([
        // 1. VM JSONB lookup — matches the EXISTS subquery SQL fragment
        ['visual_mapping_defs vmd', { rows: [VM_TARGET_ROW] }],
        // 2. Execution stats
        ['visual_mapping_executions vme', { rows: [EXEC_ROW] }],
        // 3. File record lookup (new governance tag enrichment step)
        ['FROM files f', { rows: [FILE_LOOKUP_ROW] }],
        // 4. Tag assignments per column
        ['column_governance_tag_assignments', { rows: PII_TAG_ROWS }]
      ])
    );
  });

  test('Patient_ID column has tag_pii in governance_tags', async () => {
    const details = await getNodeDetails(
      `target-file-${TARGET_FILENAME}`,
      'targetFile',
      PROJECT_ID
    );

    expect(details).not.toBeNull();
    const patientCol = details.columns.find(c => c.column_name === 'Patient_ID');
    expect(patientCol).toBeDefined();
    expect(patientCol.governance_tags).toContain('tag_pii');
  });

  test('columns without tag assignments have empty governance_tags array', async () => {
    const details = await getNodeDetails(
      `target-file-${TARGET_FILENAME}`,
      'targetFile',
      PROJECT_ID
    );

    const countryCol = details.columns.find(c => c.column_name === 'Country_name');
    expect(countryCol).toBeDefined();
    expect(countryCol.governance_tags).toEqual([]);
  });

  test('all ordered columns are still present after tag enrichment', async () => {
    const details = await getNodeDetails(
      `target-file-${TARGET_FILENAME}`,
      'targetFile',
      PROJECT_ID
    );

    expect(details.columns).toHaveLength(4);
    const names = details.columns.map(c => c.column_name);
    expect(names).toContain('Country_name');
    expect(names).toContain('Patient_ID');
    expect(names).toContain('Country_code');
    expect(names).toContain('Gender');
  });

  test('governance_tags defaults to empty array when no matching file record exists', async () => {
    // File lookup returns nothing — enrichment is skipped gracefully.
    mockQuery.mockImplementation(
      mockQueryRouter([
        ['visual_mapping_defs vmd', { rows: [VM_TARGET_ROW] }],
        ['visual_mapping_executions vme', { rows: [EXEC_ROW] }],
        ['FROM files f', { rows: [] }],
        ['column_governance_tag_assignments', { rows: PII_TAG_ROWS }]
      ])
    );

    const details = await getNodeDetails(
      `target-file-${TARGET_FILENAME}`,
      'targetFile',
      PROJECT_ID
    );

    for (const col of details.columns) {
      expect(Array.isArray(col.governance_tags)).toBe(true);
      expect(col.governance_tags).toEqual([]);
    }
  });

  test('is_visual_mapping and is_synthetic flags remain set after enrichment', async () => {
    const details = await getNodeDetails(
      `target-file-${TARGET_FILENAME}`,
      'targetFile',
      PROJECT_ID
    );

    expect(details.is_visual_mapping).toBe(true);
    expect(details.is_synthetic).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getNodeDetails — VM targetFile: PII tags read directly from graph_data piiColumns
// ─────────────────────────────────────────────────────────────────────────────

describe('getNodeDetails — VM targetFile reads PII from graph_data piiColumns (no profiling needed)', () => {
  /**
   * Simulates the TargetRulesModal save format:
   *   config.orderedColumns = columns.map(c => c.name)        ← name strings only
   *   config.piiColumns     = columns.filter(c=>c.pii).map(c=>c.name)  ← PII names
   *
   * The SQL now extracts both as `ordered_columns` and `pii_columns` in the same
   * query; pg returns JSONB arrays as JS arrays automatically.
   */
  const VM_TARGET_PII_ROW = {
    vm_id:            20,
    vm_name:          'enrollment_transform',
    project_id:       PROJECT_ID,
    last_executed_at: '2026-08-08T09:00:00Z',
    execution_count:  5,
    ordered_columns:  ['Country_name', 'Patient_ID', 'Country_code', 'Gender'],
    pii_columns:      ['Patient_ID']   // ← the authoritative PII list from graph_data
  };

  beforeEach(() => {
    mockQuery.mockImplementation(
      mockQueryRouter([
        ['visual_mapping_defs vmd', { rows: [VM_TARGET_PII_ROW] }],
        ['visual_mapping_executions vme', { rows: [EXEC_ROW] }]
        // Deliberately no 'FROM files f' or 'column_governance_tag_assignments' route —
        // the fix must NOT require profiling data; graph_data is the primary source.
      ])
    );
  });

  test('Patient_ID column has tag_pii from graph_data without any DB profiling rows', async () => {
    const details = await getNodeDetails(
      'target-file-enrollment_transform.csv',
      'targetFile',
      PROJECT_ID
    );

    expect(details).not.toBeNull();
    const patientCol = details.columns.find(c => c.column_name === 'Patient_ID');
    expect(patientCol).toBeDefined();
    expect(patientCol.governance_tags).toContain('tag_pii');
  });

  test('columns not in piiColumns have empty governance_tags', async () => {
    const details = await getNodeDetails(
      'target-file-enrollment_transform.csv',
      'targetFile',
      PROJECT_ID
    );

    const countryCol = details.columns.find(c => c.column_name === 'Country_name');
    expect(countryCol).toBeDefined();
    expect(countryCol.governance_tags).toEqual([]);

    const genderCol = details.columns.find(c => c.column_name === 'Gender');
    expect(genderCol).toBeDefined();
    expect(genderCol.governance_tags).toEqual([]);
  });

  test('all ordered columns are present after PII application', async () => {
    const details = await getNodeDetails(
      'target-file-enrollment_transform.csv',
      'targetFile',
      PROJECT_ID
    );

    expect(details.columns).toHaveLength(4);
    const names = details.columns.map(c => c.column_name);
    expect(names).toEqual(['Country_name', 'Patient_ID', 'Country_code', 'Gender']);
  });

  test('gracefully handles missing piiColumns (no PII tags applied)', async () => {
    const rowNoPii = { ...VM_TARGET_PII_ROW, pii_columns: null };
    mockQuery.mockImplementation(
      mockQueryRouter([
        ['visual_mapping_defs vmd', { rows: [rowNoPii] }],
        ['visual_mapping_executions vme', { rows: [EXEC_ROW] }]
      ])
    );

    const details = await getNodeDetails(
      'target-file-enrollment_transform.csv',
      'targetFile',
      PROJECT_ID
    );

    expect(details).not.toBeNull();
    for (const col of details.columns) {
      expect(col.governance_tags).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getNodeDetails — VM transformation: target_is_pii read from fm.pii in graph_data
// ─────────────────────────────────────────────────────────────────────────────

describe('getNodeDetails — VM transformation reads target_is_pii from fm.pii in fieldMappings', () => {
  const VM_ID = 21;
  const nodeId = `mapping-vm-${VM_ID}-synthetic`;

  /**
   * Simulates the ExpressionModal save format:
   *   fieldMappings[n].pii = piiColumns.includes(targetField)
   * Patient_ID is the PII target; Country is not.
   */
  const VM_TRANSFORM_PII_FM_ROW = {
    vm_id:            VM_ID,
    vm_name:          'pii_fm_test_mapping',
    project_id:       PROJECT_ID,
    last_executed_at: '2026-08-08T09:00:00Z',
    execution_count:  2,
    completed_at:     '2026-08-08T09:00:00Z',
    rows_processed:   3,
    rows_read:        3,
    rows_written:     3,
    graph_data: {
      nodes: [
        {
          type: 'sourceConfig',
          data: { config: { filePattern: '*.csv' } }
        },
        {
          type: 'targetRules',
          data: { config: { fileName: 'out', fileFormat: 'csv' } }
        },
        {
          type: 'expression',
          data: {
            config: {
              fieldMappings: [
                // Patient_ID is PII — fm.pii: true saved by ExpressionModal
                {
                  source_field: 'src_patient',
                  target_field: 'Patient_ID',
                  transformation: 'none',
                  data_type: 'STRING',
                  include: true,
                  pii: true      // ← ExpressionModal sets this
                },
                // Country is not PII
                {
                  source_field: 'Country_code',
                  target_field: 'Country',
                  transformation: 'none',
                  data_type: 'STRING',
                  include: true,
                  pii: false
                },
                // No pii property at all — should default to false
                {
                  source_field: 'Site',
                  target_field: 'Site',
                  transformation: 'none',
                  data_type: 'STRING',
                  include: true
                }
              ]
            }
          }
        }
      ]
    }
  };

  beforeEach(() => {
    // Deliberately no files / audit / column_governance_tag routes —
    // target_is_pii must resolve from graph_data alone.
    mockQuery.mockImplementation(
      mockQueryRouter([
        ['FROM visual_mapping_defs vmd', { rows: [VM_TRANSFORM_PII_FM_ROW] }]
      ])
    );
  });

  test('mapping with pii:true has target_is_pii true', async () => {
    const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);
    expect(details).not.toBeNull();

    const patientMapping = details.field_mappings.find(
      fm => fm.target_field === 'Patient_ID'
    );
    expect(patientMapping).toBeDefined();
    expect(patientMapping.target_is_pii).toBe(true);
  });

  test('mapping with pii:false has target_is_pii false', async () => {
    const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);

    const countryMapping = details.field_mappings.find(
      fm => fm.target_field === 'Country'
    );
    expect(countryMapping).toBeDefined();
    expect(countryMapping.target_is_pii).toBe(false);
  });

  test('mapping with no pii property has target_is_pii false', async () => {
    const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);

    const siteMapping = details.field_mappings.find(
      fm => fm.target_field === 'Site'
    );
    expect(siteMapping).toBeDefined();
    expect(siteMapping.target_is_pii).toBe(false);
  });

  test('all three mappings are present and count is correct', async () => {
    const details = await getNodeDetails(nodeId, 'transformation', PROJECT_ID);
    expect(details.field_mappings).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Merge-semantics regression tests
//
// These tests verify that the supplemental DB enrichment paths (task #108)
// MERGE with, rather than OVERWRITE, the graph_data-derived PII flags set
// by task #111.  They exercise the exact overwrite paths the code reviewer
// flagged.
// ─────────────────────────────────────────────────────────────────────────────

describe('getNodeDetails — VM targetFile: DB enrichment merges with graph_data piiColumns', () => {
  /**
   * Scenario: Patient_ID is in graph_data piiColumns (so it starts with
   * governance_tags: ['tag_pii']), but the matching output file in the DB
   * has ONLY a 'tag_sensitive' tag for Patient_ID — no tag_pii row.
   * After merging, the column should have BOTH tags, not just tag_sensitive.
   */
  const VM_ROW_WITH_PII = {
    vm_id:           30,
    vm_name:         'merge_test_mapping',
    project_id:      PROJECT_ID,
    last_executed_at:'2026-08-08T10:00:00Z',
    execution_count: 1,
    ordered_columns: ['Patient_ID', 'Country_code'],
    pii_columns:     ['Patient_ID']   // graph_data says Patient_ID is PII
  };

  const FILE_ID_FOR_OUTPUT = 'output-file-merge-test-uuid';

  beforeEach(() => {
    mockQuery.mockImplementation(
      mockQueryRouter([
        ['visual_mapping_defs vmd',         { rows: [VM_ROW_WITH_PII] }],
        ['visual_mapping_executions vme',   { rows: [EXEC_ROW] }],
        // DB enrichment: output file found, but its tags table has only tag_sensitive
        // for Patient_ID — no tag_pii entry (as if profiling ran but didn't detect PII).
        ['FROM files f',                    { rows: [{ file_id: FILE_ID_FOR_OUTPUT }] }],
        ['column_governance_tag_assignments', {
          rows: [
            { column_name: 'Patient_ID', governance_tags: ['tag_sensitive'] }
          ]
        }]
      ])
    );
  });

  test('Patient_ID retains tag_pii from graph_data even when DB omits it', async () => {
    const details = await getNodeDetails(
      'target-file-merge_test_mapping.csv',
      'targetFile',
      PROJECT_ID
    );

    expect(details).not.toBeNull();
    const patientCol = details.columns.find(c => c.column_name === 'Patient_ID');
    expect(patientCol).toBeDefined();
    // graph_data-seeded tag_pii must survive the DB merge
    expect(patientCol.governance_tags).toContain('tag_pii');
    // DB-sourced tag_sensitive must also be present
    expect(patientCol.governance_tags).toContain('tag_sensitive');
  });

  test('Country_code has no tags (neither graph_data nor DB tagged it PII)', async () => {
    const details = await getNodeDetails(
      'target-file-merge_test_mapping.csv',
      'targetFile',
      PROJECT_ID
    );

    const countryCol = details.columns.find(c => c.column_name === 'Country_code');
    expect(countryCol).toBeDefined();
    expect(countryCol.governance_tags).toEqual([]);
  });
});

describe('getNodeDetails — VM transformation: DB enrichment merges with fm.pii target_is_pii', () => {
  /**
   * Scenario: fm.pii:true sets target_is_pii:true on Patient_ID mapping.
   * Then the DB enrichment fires (source audit finds a source file with SSN
   * as PII). targetPiiSet from the output file lookup does NOT include
   * Patient_ID (the output file was never profiled). After merging, the
   * Patient_ID mapping must still have target_is_pii:true (from graph_data)
   * and the SSN mapping must have source_is_pii:true (from DB).
   */
  const VM_ID_MERGE = 31;
  const nodeIdMerge = `mapping-vm-${VM_ID_MERGE}-synthetic`;
  const SOURCE_FILE_ID_MERGE = 'source-file-merge-uuid';

  const VM_TRANSFORM_MERGE_ROW = {
    vm_id:           VM_ID_MERGE,
    vm_name:         'merge_transform_test',
    project_id:      PROJECT_ID,
    last_executed_at:'2026-08-08T10:00:00Z',
    execution_count: 2,
    completed_at:    '2026-08-08T10:00:00Z',
    rows_processed:  5,
    rows_read:       5,
    rows_written:    5,
    graph_data: {
      nodes: [
        { type: 'sourceConfig', data: { config: { filePattern: '*.csv' } } },
        { type: 'targetRules',  data: { config: { fileName: 'merge-out', fileFormat: 'csv' } } },
        {
          type: 'expression',
          data: {
            config: {
              fieldMappings: [
                // Patient_ID is PII per fm.pii; must survive DB enrichment
                {
                  source_field: 'src_patient',
                  target_field: 'Patient_ID',
                  transformation: 'none',
                  data_type: 'STRING',
                  include: true,
                  pii: true
                },
                // SSN is PII in the source file (DB), not flagged in graph_data
                {
                  source_field: 'SSN',
                  target_field: 'patient_ssn',
                  transformation: 'none',
                  data_type: 'STRING',
                  include: true,
                  pii: false
                }
              ]
            }
          }
        }
      ]
    }
  };

  beforeEach(() => {
    mockQuery.mockImplementation(
      mockQueryRouter([
        ['FROM visual_mapping_defs vmd', { rows: [VM_TRANSFORM_MERGE_ROW] }],
        // Source audit: SSN is PII in the source file
        ['file_audit_details fad',       { rows: [{ file_id: SOURCE_FILE_ID_MERGE }] }],
        // Output file: NOT in the files table (never profiled) — targetPiiSet stays empty
        ['FROM files f',                 { rows: [] }],
        // Source PII tags: SSN is PII
        [/file_id = ANY/,                { rows: [{ column_name: 'SSN' }] }],
        ['column_governance_tag_assignments', { rows: [] }]
      ])
    );
  });

  test('Patient_ID mapping keeps target_is_pii:true from fm.pii even though targetPiiSet is empty', async () => {
    const details = await getNodeDetails(nodeIdMerge, 'transformation', PROJECT_ID);
    expect(details).not.toBeNull();

    const patientMapping = details.field_mappings.find(
      fm => fm.target_field === 'Patient_ID'
    );
    expect(patientMapping).toBeDefined();
    expect(patientMapping.target_is_pii).toBe(true);
  });

  test('SSN mapping gets source_is_pii:true from DB audit even though fm.pii is false', async () => {
    const details = await getNodeDetails(nodeIdMerge, 'transformation', PROJECT_ID);

    const ssnMapping = details.field_mappings.find(
      fm => fm.source_field === 'SSN'
    );
    expect(ssnMapping).toBeDefined();
    expect(ssnMapping.source_is_pii).toBe(true);
    // target (patient_ssn) is not PII in either source
    expect(!!ssnMapping.target_is_pii).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getNodeDetails — VM transformation: targetRules piiColumns fallback
//
// Covers the real-world case where fieldMappings were saved before ExpressionModal
// persisted the fm.pii flag per row (so fm.pii is null/absent for every entry),
// but the targetRules node carries config.piiColumns with the user's intent.
// ─────────────────────────────────────────────────────────────────────────────

describe('getNodeDetails — VM transformation: targetRules piiColumns used as fallback when fm.pii is absent', () => {
  const VM_ID_FALLBACK = 40;
  const nodeIdFallback = `mapping-vm-${VM_ID_FALLBACK}-synthetic`;

  /**
   * Simulates a mapping saved before ExpressionModal wrote fm.pii per row:
   * - All fieldMappings have pii: null (never written).
   * - targetRules.config.piiColumns carries Patient_ID as the authoritative PII list.
   */
  const VM_FALLBACK_ROW = {
    vm_id:            VM_ID_FALLBACK,
    vm_name:          'fallback_pii_test',
    project_id:       PROJECT_ID,
    last_executed_at: '2026-08-08T10:00:00Z',
    execution_count:  1,
    completed_at:     '2026-08-08T10:00:00Z',
    rows_processed:   4,
    rows_read:        4,
    rows_written:     4,
    graph_data: {
      nodes: [
        { type: 'sourceConfig', data: { config: { filePattern: '*.csv' } } },
        {
          type: 'targetRules',
          data: {
            config: {
              fileName: 'enrollment-out',
              fileFormat: 'csv',
              // User marked Patient_ID as PII in the Output Schema panel
              piiColumns: ['Patient_ID']
            }
          }
        },
        {
          type: 'expression',
          data: {
            config: {
              fieldMappings: [
                // fm.pii is null — saved before per-row pii flag existed
                {
                  source_field: 'src_patient',
                  target_field: 'Patient_ID',
                  transformation: 'none',
                  data_type: 'STRING',
                  include: true,
                  pii: null
                },
                {
                  source_field: 'Country_code',
                  target_field: 'Country',
                  transformation: 'none',
                  data_type: 'STRING',
                  include: true,
                  pii: null
                }
              ]
            }
          }
        }
      ]
    }
  };

  beforeEach(() => {
    mockQuery.mockImplementation(
      mockQueryRouter([
        ['FROM visual_mapping_defs vmd', { rows: [VM_FALLBACK_ROW] }]
      ])
    );
  });

  test('Patient_ID mapping gets target_is_pii:true from targetRules piiColumns when fm.pii is null', async () => {
    const details = await getNodeDetails(nodeIdFallback, 'transformation', PROJECT_ID);
    expect(details).not.toBeNull();

    const patientMapping = details.field_mappings.find(
      fm => fm.target_field === 'Patient_ID'
    );
    expect(patientMapping).toBeDefined();
    expect(patientMapping.target_is_pii).toBe(true);
  });

  test('Country mapping stays target_is_pii:false when not in targetRules piiColumns', async () => {
    const details = await getNodeDetails(nodeIdFallback, 'transformation', PROJECT_ID);

    const countryMapping = details.field_mappings.find(
      fm => fm.target_field === 'Country'
    );
    expect(countryMapping).toBeDefined();
    expect(countryMapping.target_is_pii).toBe(false);
  });

  test('fm.pii:true and field in piiColumns together still produce target_is_pii:true (no doubling)', async () => {
    // Simulate a row where BOTH signals agree — result must be a plain true, not an error
    const rowBothTrue = {
      ...VM_FALLBACK_ROW,
      graph_data: {
        nodes: [
          { type: 'sourceConfig', data: { config: { filePattern: '*.csv' } } },
          {
            type: 'targetRules',
            data: { config: { fileName: 'out', fileFormat: 'csv', piiColumns: ['Patient_ID'] } }
          },
          {
            type: 'expression',
            data: {
              config: {
                fieldMappings: [
                  {
                    source_field: 'src_patient',
                    target_field: 'Patient_ID',
                    transformation: 'none',
                    data_type: 'STRING',
                    include: true,
                    pii: true   // ← explicit fm.pii also set
                  }
                ]
              }
            }
          }
        ]
      }
    };
    mockQuery.mockImplementation(
      mockQueryRouter([['FROM visual_mapping_defs vmd', { rows: [rowBothTrue] }]])
    );

    const details = await getNodeDetails(nodeIdFallback, 'transformation', PROJECT_ID);
    const mapping = details.field_mappings.find(fm => fm.target_field === 'Patient_ID');
    expect(mapping).toBeDefined();
    expect(mapping.target_is_pii).toBe(true);
  });

  test('targetRules node with no piiColumns key does not mark any mapping PII', async () => {
    const rowNoPiiKey = {
      ...VM_FALLBACK_ROW,
      graph_data: {
        nodes: [
          { type: 'sourceConfig', data: { config: { filePattern: '*.csv' } } },
          {
            type: 'targetRules',
            // piiColumns key entirely absent
            data: { config: { fileName: 'out', fileFormat: 'csv' } }
          },
          {
            type: 'expression',
            data: {
              config: {
                fieldMappings: [
                  {
                    source_field: 'src_patient',
                    target_field: 'Patient_ID',
                    transformation: 'none',
                    data_type: 'STRING',
                    include: true,
                    pii: null
                  }
                ]
              }
            }
          }
        ]
      }
    };
    mockQuery.mockImplementation(
      mockQueryRouter([['FROM visual_mapping_defs vmd', { rows: [rowNoPiiKey] }]])
    );

    const details = await getNodeDetails(nodeIdFallback, 'transformation', PROJECT_ID);
    const mapping = details.field_mappings.find(fm => fm.target_field === 'Patient_ID');
    expect(mapping).toBeDefined();
    expect(mapping.target_is_pii).toBe(false);
  });
});
