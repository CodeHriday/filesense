/**
 * RDM Service & Lookup Processor Tests
 *
 * Covers:
 * - Bearer authentication header (not x-api-key)
 * - Non-JSON response guard
 * - getCrosswalkData: extraction from embedded list response + field normalization
 * - getDatasetData: throws with a clear message (no /data endpoint on this API)
 * - applyRDMDatasetJoin: throws durably when dataset marked available:false
 * - applyRDMCrosswalkLookup: translates values via normalized source_code/target_code
 * - applyRDMLookups: propagates dataset-unavailable error to job engine
 */

// ─── Mock dependencies before any require ────────────────────────────────────
jest.mock('axios');
jest.mock('../utils/logger', () => ({
  systemLogger: {
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));
jest.mock('../config/config-secrets', () => ({
  getAllSecretData: jest.fn().mockResolvedValue({})
}));
// node-cache: use a simple in-memory stub so the 300s TTL doesn't affect tests
jest.mock('node-cache', () => {
  return jest.fn().mockImplementation(() => {
    const store = new Map();
    return {
      get:   (k)    => store.get(k),
      set:   (k, v) => store.set(k, v),
      del:   (k)    => store.delete(k),
      flushAll: ()  => store.clear()
    };
  });
});

const axios = require('axios');
const { systemLogger } = require('../utils/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(data) {
  return { status: 200, headers: { 'content-type': 'application/json' }, data };
}

function crosswalkListResponse(crosswalks) {
  return jsonResponse({ success: true, data: crosswalks });
}

const SAMPLE_CROSSWALKS = [
  {
    id: 3,
    name: 'Country codes',
    mappingData: {
      mappings: [
        { sourceValue: 'US', targetValue: 'United States', status: 'APPROVED' },
        { sourceValue: 'GB', targetValue: 'United Kingdom', status: 'APPROVED' }
      ]
    }
  },
  {
    id: 7,
    name: 'Phase codes',
    mappingData: {
      mappings: [
        { sourceValue: '1', targetValue: 'Phase I', status: 'APPROVED' }
      ]
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// rdmService (singleton)
// ─────────────────────────────────────────────────────────────────────────────

describe('rdmService', () => {
  let service;

  beforeAll(() => {
    process.env.RDM_BASE_URL = 'https://rdm.example.com';
    process.env.RDM_API_KEY  = 'test-api-key-123';
    // Require after mocks are in place; the singleton is created once per module
    service = require('../services/rdmService');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the cache stub so each test starts fresh
    service.clearCache();
  });

  // ── Bearer authentication ───────────────────────────────────────────────────

  describe('makeRequest – authentication', () => {
    test('sends Authorization: Bearer header, never x-api-key', async () => {
      axios.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));

      await service.getCrosswalks();

      expect(axios).toHaveBeenCalledTimes(1);
      const { headers } = axios.mock.calls[0][0];
      expect(headers['Authorization']).toBe('Bearer test-api-key-123');
      expect(headers['x-api-key']).toBeUndefined();
    });

    test('throws descriptive error when API returns a non-object body', async () => {
      // Axios delivers a plain string when it cannot parse the body as JSON
      axios.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'text/html' },
        data: '<!DOCTYPE html><html></html>'
      });

      await expect(service.getCrosswalks()).rejects.toThrow(
        /RDM API returned a non-JSON response/
      );
    });

    test('error includes config hint about RDM_BASE_URL', async () => {
      axios.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: '<!DOCTYPE html>'   // string → non-object → guard fires
      });

      await expect(service.getCrosswalks()).rejects.toThrow(
        /check RDM_BASE_URL configuration/
      );
    });
  });

  // ── getCrosswalkData ────────────────────────────────────────────────────────

  describe('getCrosswalkData', () => {
    test('fetches from /api/external/crosswalks (not a /data sub-path)', async () => {
      axios.mockResolvedValueOnce(crosswalkListResponse(SAMPLE_CROSSWALKS));

      await service.getCrosswalkData(3);

      expect(axios).toHaveBeenCalledTimes(1);
      const { url } = axios.mock.calls[0][0];
      expect(url).toMatch(/\/api\/external\/crosswalks$/);
      expect(url).not.toMatch(/\/data/);
    });

    test('extracts rows for the requested crosswalk ID', async () => {
      axios.mockResolvedValueOnce(crosswalkListResponse(SAMPLE_CROSSWALKS));
      const result = await service.getCrosswalkData(3);
      expect(result).toHaveLength(2);
    });

    test('normalizes sourceValue → source_code and targetValue → target_code', async () => {
      axios.mockResolvedValueOnce(crosswalkListResponse(SAMPLE_CROSSWALKS));
      const [row] = await service.getCrosswalkData(3);
      expect(row.source_code).toBe('US');
      expect(row.target_code).toBe('United States');
    });

    test('also preserves raw API field names for compatibility', async () => {
      axios.mockResolvedValueOnce(crosswalkListResponse(SAMPLE_CROSSWALKS));
      const [row] = await service.getCrosswalkData(3);
      expect(row.sourceValue).toBe('US');
      expect(row.targetValue).toBe('United States');
    });

    test('filters by ID — does not return another crosswalk\'s rows', async () => {
      axios.mockResolvedValueOnce(crosswalkListResponse(SAMPLE_CROSSWALKS));
      const result = await service.getCrosswalkData(7);
      expect(result).toHaveLength(1);
      expect(result[0].source_code).toBe('1');
    });

    test('returns [] when crosswalk ID is not in the list', async () => {
      axios.mockResolvedValueOnce(crosswalkListResponse(SAMPLE_CROSSWALKS));
      const result = await service.getCrosswalkData(999);
      expect(result).toEqual([]);
    });

    test('returns [] when crosswalk has no mappings', async () => {
      axios.mockResolvedValueOnce(crosswalkListResponse([
        { id: 5, name: 'Empty', mappingData: { mappings: [] } }
      ]));
      const result = await service.getCrosswalkData(5);
      expect(result).toEqual([]);
    });

    test('returns [] when crosswalk has no mappingData at all', async () => {
      axios.mockResolvedValueOnce(crosswalkListResponse([{ id: 5, name: 'NoData' }]));
      const result = await service.getCrosswalkData(5);
      expect(result).toEqual([]);
    });

    test('coerces string and numeric IDs to string for comparison', async () => {
      axios.mockResolvedValueOnce(crosswalkListResponse(SAMPLE_CROSSWALKS));
      // API returns id as number 3; passing string '3' should still match
      const result = await service.getCrosswalkData('3');
      expect(result).toHaveLength(2);
    });
  });

  // ── getDatasetData ──────────────────────────────────────────────────────────

  describe('getDatasetData', () => {
    test('throws immediately (no network call) with API-limitation message', async () => {
      await expect(service.getDatasetData(8)).rejects.toThrow(
        /does not provide a row-data endpoint/
      );
      expect(axios).not.toHaveBeenCalled();
    });

    test('error message names the crosswalk alternative', async () => {
      await expect(service.getDatasetData(8)).rejects.toThrow(/Crosswalk Lookup/);
    });

    test('error includes the requested dataset ID', async () => {
      await expect(service.getDatasetData(42)).rejects.toThrow(/42/);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rdmLookupProcessor
// ─────────────────────────────────────────────────────────────────────────────

describe('rdmLookupProcessor', () => {
  const {
    applyRDMDatasetJoin,
    applyRDMCrosswalkLookup,
    applyRDMLookups
  } = require('../services/rdmLookupProcessor');

  // ── applyRDMDatasetJoin: unavailable ────────────────────────────────────────

  describe('applyRDMDatasetJoin – dataset marked available:false', () => {
    function unavailableCtx(msg = 'The RDM API does not provide a row-data endpoint for dataset 8') {
      return {
        rdm: {
          datasets: {
            8: { available: false, error: msg, data: [], map: new Map(), keyField: null }
          }
        }
      };
    }

    const rows   = [{ Country: 'US' }, { Country: 'GB' }];
    const config = { dataset_id: '8', source_column: 'Country', dataset_column: 'Code', join_type: 'inner' };

    test('throws instead of silently returning empty rows (inner join)', () => {
      expect(() => applyRDMDatasetJoin(rows, config, unavailableCtx())).toThrow(
        /dataset join for dataset 8 cannot proceed/
      );
    });

    test('thrown error includes the underlying reason from context', () => {
      expect(() => applyRDMDatasetJoin(rows, config, unavailableCtx())).toThrow(
        /does not provide a row-data endpoint/
      );
    });

    test('thrown error names Crosswalk Lookup as the alternative', () => {
      expect(() => applyRDMDatasetJoin(rows, config, unavailableCtx())).toThrow(
        /Crosswalk Lookup/
      );
    });

    test('throws for left join too — no silent data degradation', () => {
      const leftConfig = { ...config, join_type: 'left' };
      expect(() => applyRDMDatasetJoin(rows, leftConfig, unavailableCtx())).toThrow(
        /cannot proceed/
      );
    });

    test('throws for full join too', () => {
      const fullConfig = { ...config, join_type: 'full' };
      expect(() => applyRDMDatasetJoin(rows, fullConfig, unavailableCtx())).toThrow();
    });
  });

  // ── applyRDMDatasetJoin: working dataset ────────────────────────────────────

  describe('applyRDMDatasetJoin – available dataset (available:true)', () => {
    const datasetMap = new Map([
      ['us', { Code: 'US', Value: 'United States' }],
      ['gb', { Code: 'GB', Value: 'United Kingdom' }]
    ]);
    const ctx = {
      rdm: {
        datasets: {
          8: { available: true, data: [], map: datasetMap, keyField: 'Code' }
        }
      }
    };

    test('inner join returns only matched rows', () => {
      const rows   = [{ Country: 'US' }, { Country: 'FR' }, { Country: 'GB' }];
      const config = { dataset_id: '8', source_column: 'Country', dataset_column: 'Code', join_type: 'inner' };
      const result = applyRDMDatasetJoin(rows, config, ctx);
      expect(result).toHaveLength(2);
      expect(result.map(r => r.Value)).toEqual(['United States', 'United Kingdom']);
    });

    test('left join keeps all source rows and enriches matched ones', () => {
      const rows   = [{ Country: 'US' }, { Country: 'FR' }];
      const config = { dataset_id: '8', source_column: 'Country', dataset_column: 'Code', join_type: 'left' };
      const result = applyRDMDatasetJoin(rows, config, ctx);
      expect(result).toHaveLength(2);
      expect(result[0].Value).toBe('United States');
      expect(result[1].Value).toBeUndefined(); // FR not in dataset
    });
  });

  // ── applyRDMCrosswalkLookup ─────────────────────────────────────────────────

  describe('applyRDMCrosswalkLookup – normalized source_code / target_code', () => {
    function buildCtx(mappings) {
      const map = new Map();
      mappings.forEach(m => {
        map.set(String(m.source_code).toLowerCase(), m);
      });
      return { rdm: { crosswalks: { 3: { data: mappings, map } } } };
    }

    const mappings = [
      { source_code: 'US', target_code: 'United States' },
      { source_code: 'GB', target_code: 'United Kingdom' }
    ];

    test('translates source value to target using source_code / target_code', () => {
      const rows   = [{ Country: 'US' }, { Country: 'GB' }];
      const config = { crosswalk_id: 3, source_column: 'Country', target_column: 'CountryName' };
      const result = applyRDMCrosswalkLookup(rows, config, buildCtx(mappings));
      expect(result[0].CountryName).toBe('United States');
      expect(result[1].CountryName).toBe('United Kingdom');
    });

    test('lookup is case-insensitive on source value', () => {
      const rows   = [{ Country: 'us' }, { Country: 'gB' }];
      const config = { crosswalk_id: 3, source_column: 'Country', target_column: 'CountryName' };
      const result = applyRDMCrosswalkLookup(rows, config, buildCtx(mappings));
      expect(result[0].CountryName).toBe('United States');
      expect(result[1].CountryName).toBe('United Kingdom');
    });

    test('unmatched → kept as-is with keep_source (default)', () => {
      const rows   = [{ Country: 'FR' }];
      const config = { crosswalk_id: 3, source_column: 'Country', target_column: 'CountryName', no_match_behavior: 'keep_source' };
      const result = applyRDMCrosswalkLookup(rows, config, buildCtx(mappings));
      expect(result[0].CountryName).toBe('FR');
    });

    test('unmatched → null with set_null', () => {
      const rows   = [{ Country: 'FR' }];
      const config = { crosswalk_id: 3, source_column: 'Country', target_column: 'CountryName', no_match_behavior: 'set_null' };
      const result = applyRDMCrosswalkLookup(rows, config, buildCtx(mappings));
      expect(result[0].CountryName).toBeNull();
    });

    test('unmatched → default_value with set_default', () => {
      const rows   = [{ Country: 'ZZ' }];
      const config = { crosswalk_id: 3, source_column: 'Country', target_column: 'CountryName', no_match_behavior: 'set_default', default_value: 'Unknown' };
      const result = applyRDMCrosswalkLookup(rows, config, buildCtx(mappings));
      expect(result[0].CountryName).toBe('Unknown');
    });

    test('skips with warning when crosswalk is not in context', () => {
      const rows   = [{ Country: 'US' }];
      const config = { crosswalk_id: 999, source_column: 'Country', target_column: 'CountryName' };
      const result = applyRDMCrosswalkLookup(rows, config, { rdm: { crosswalks: {} } });
      expect(result).toEqual(rows); // unchanged
      expect(systemLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('999')
      );
    });
  });

  // ── applyRDMLookups: error propagation ──────────────────────────────────────

  describe('applyRDMLookups – unavailable dataset propagates as a thrown error', () => {
    test('throws so the job engine can log it durably and fail the job', () => {
      const mapping = {
        rdm_lookup_enabled: true,
        rdm_dataset_config: {
          dataset_id: '8',
          source_column: 'Country',
          dataset_column: 'Code',
          join_type: 'inner'
        }
      };
      const ctx = {
        rdm: {
          datasets: {
            8: { available: false, error: 'no row-data endpoint', data: [], map: new Map(), keyField: null }
          },
          crosswalks: {}
        }
      };

      expect(() => applyRDMLookups([{ Country: 'US' }], mapping, ctx)).toThrow(/cannot proceed/);
    });
  });
});
