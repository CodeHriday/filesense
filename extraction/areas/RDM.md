# RDM - Reference data management

## Summary
Integration with an external RDM system (datasets and crosswalks). Two parts: (1) HTTP API under `/api/rdm` for the UI to pick datasets/crosswalks and read schemas; (2) job-time enrichment: `loadRDMContext` pre-fetches resources (called from jobExecutionEngine.js:1316), `applyRDMLookups` joins datasets and maps crosswalk values on rows (called from jobExecutionEngine.js:3078 in the archive branch and :3640 in the normal path). Upstream calls use header `x-api-key` against `{RDM_BASE_URL}/api/external/...` (rdmService.js:67-71). Credentials come from the secrets store, else env (rdmService.js:22-26; server.js:1261-1262). In-process cache TTL 300 s (rdmService.js:7).

## Entry points
Mounting: `app.use('/api/rdm', authenticateToken, rdmRoutes)` at server.js:13920-13921. The four inline routes in server.js (:1258, :1293, :1330, :1365) are registered earlier, so Express serves them first; the matching routes in rdm.js are unreachable. Every route requires a valid JWT only; no role/permission/ownership check. On rdm.js routes authenticateToken runs twice (server.js:13921 and in each route).

### Inline routes in server.js (live)
1. GET /api/rdm/datasets (server.js:1258). Forwards GET `/api/external/datasets`, returns the upstream body as-is. Missing config: 500 `{error:'RDM configuration missing', message}` (:1264-1269). Error: upstream status or 500, `{error:'Failed to fetch datasets from RDM', message}` (:1285-1288). No cache.
2. GET /api/rdm/datasets/:datasetId/schema (:1293). Same pattern, `/datasets/${datasetId}/schema`; id interpolated unvalidated into the URL (:1307).
3. GET /api/rdm/crosswalks (:1330). Same pattern.
4. GET /api/rdm/crosswalks/:crosswalkId/schema (:1365). Same pattern; unvalidated id in URL (:1379).

### Routes in backend/routes/rdm.js
5. GET /health (rdm.js:7). Returns `{available, message}`; 500 `{error, available:false}` on exception. Reports only `isConfigured`.
6. GET /datasets (rdm.js:22) - SHADOWED by 1. `{success:true,data}`; error status = upstream status or 500, with `details` (status, endpoint, responseBody, timestamp) for RDM errors.
7. GET /datasets/:id (rdm.js:46). `{success, data}` (`response.data || null`, rdmService.js:139). Errors always 500.
8. GET /datasets/:id/schema (rdm.js:60) - SHADOWED by 2.
9. GET /datasets/:id/data (rdm.js:85). Query `limit`, `offset` parsed with parseInt (:91-92), `filters` JSON.parse (:96); invalid JSON gives 400 `Invalid filters format` (:103-106). The options are then ignored: getDatasetData never reads `options` (rdmService.js:146-171). Returns all rows as an array (`Object.values(dataset.data)`, :157-158); "not found" is thrown when the dataset is falsy (:153-155). Errors 500.
10. GET /crosswalks (rdm.js:126) - SHADOWED by 3.
11. GET /crosswalks/:id (rdm.js:150). Errors 500.
12. GET /crosswalks/:id/schema (rdm.js:164) - SHADOWED by 4.
13. GET /crosswalks/:id/data (rdm.js:189). Reads `limit`/`offset` (parseInt, :195-196) but getCrosswalkData ignores options (rdmService.js:203). Rows come from the crosswalks list, normalized to `{source_code,target_code,sourceValue,targetValue,status}` (:223-229). Crosswalk id not in list returns `[]` (:213-216).
14. POST /crosswalks/:id/lookup (rdm.js:209). Body `{sourceValue, sourceField}`; `!sourceValue` gives 400 `sourceValue is required` (:214-219). Default `sourceField` 'source_code' (:224). Match is case-insensitive string equality (rdmService.js:260-262). Returns `{success:true, data: match|null}`. Lookup errors are swallowed and return null (:266-272).
15. GET /relationships (rdm.js:237). Upstream `/api/external/relationships`.
16. POST /cache/clear (rdm.js:250). Flushes the whole rdmCache for any authenticated user.

Non-JSON upstream responses: makeRequest throws `RDM API returned a non-JSON response (content-type: ...)` when `response.data` is not a non-null object (rdmService.js:86-95). Per the verifier, this is wrapped as an RDM error with undefined status, so rdm.js falls back to 500.

### Job-time (non-HTTP) paths
- Engine config normalisation before context load (jobExecutionEngine.js:1273-1302): the singular and plural configs are JSON.parsed if they are strings (:1280-1291); if a singular config is an array, its items are appended to the plural list and the singular is set to null (:1295-1302). `loadRDMContext` is called with `mapping.field_mappings || []`, `mapping.variables || []` and these four values (:1316-1323). `applyRDMLookups` later receives the raw `mapping` (:3078, :3640), not the normalised values.
- Context loading is not gated on `rdm_lookup_enabled`: the block at jobExecutionEngine.js:1272-1323 only checks config presence for node status (:1305-1310) and always calls `loadRDMContext`. A mapping with `rdm_lookup_enabled` false but configs present still triggers the load.
- Fatal context load: on any error the engine logs, emits failed node status, sets the job `status:'failed'` with `RDM context loading failed: <msg>`, updates the transformation execution to FAILED, and rethrows (jobExecutionEngine.js:1336-1358).
- loadRDMContext (rdmContextLoader.js:16). If the service is unavailable it returns an empty context silently (:24-27). Merges singular configs (`dataset_id`/`crosswalk_id`) with array configs, deduping by id (:31-46). Collects ids from legacy transformations `rdm_crosswalk_lookup` (`params.rdmCrosswalkId`) and `rdm_dataset_join` (`params.rdmDatasetId`) in field mappings and variables (:213-218), plus config arrays. Crosswalk load failure throws (:86), which is fatal per jobExecutionEngine.js:1336-1358. Dataset load failure is NOT fatal in the loader: stored as `{available:false, error}` (:133-139), which only throws later in applyRDMDatasetJoin if a join uses it. Crosswalk map keyed by lowercase of `source_code || source_value || from || ''` (:69-70). Dataset map default key field is the first of `['id','code','key','name']` present in the first row (:101-106); no map entries if none. Duplicate keys: the last row wins in the crosswalk map (:71, per verifier) and the dataset maps (Map.set, rdmLookupProcessor.js:265).
- Silent no-op: when RDM is unconfigured, loadRDMContext returns an empty context (rdmContextLoader.js:24-27); if `rdm_lookup_enabled` is true, applyRDMLookups warns and skips missing crosswalk/dataset context entries (rdmLookupProcessor.js:22-25, :170-173) and the job succeeds with un-enriched data.
- applyRDMLookups (rdmLookupProcessor.js:287). Skipped unless `mapping.rdm_lookup_enabled` (:288). Accepts arrays or single objects in both `rdm_dataset_config(s)` and `rdm_crosswalk_config(s)` (:294-310). Order: all dataset joins, then all crosswalk lookups (:323-340). If a config is still a JSON string on `mapping`, it would be wrapped as `[string]` and skipped because `.dataset_id` is undefined (:295-300, :324); whether pg returns it parsed (jsonb) is unconfirmed (see Open questions).
  - Failure handling at call sites: both wrap errors as `RDM enrichment failed: ...` and throw (jobExecutionEngine.js:3094-3097 archive branch; :3650-3653 normal path), fatal for the file.
  - Call-site relationship: :3078 is in the archive-extraction branch (inside `if (mapping.rdm_lookup_enabled && allTransformedRows.length > 0)`, :3065); :3640 is in the normal single-file path (inside `if (mapping.rdm_lookup_enabled)`, :3631). They are different branches, so double enrichment is not apparent.
  - Step 3.2.5: `hasCrosswalkEnrichment` is `rdm_lookup_enabled` and (`rdm_crosswalk_config` or non-empty `rdm_crosswalk_configs`) (jobExecutionEngine.js:3270-3274). When true, field_mappings are withheld from the parser (`delayMappings`, :3293 and following) and re-applied after RDM enrichment (:3662).
  - Dataset join (:12-121): `join_type` default 'left' (:17). Key compare is lowercase string (:73). Matched: `{...row, ...datasetRecord}` (dataset fields overwrite row fields on name collision, :78-81). Null/undefined source value: dropped for inner, kept otherwise (:60-70). No match: inner drops; left/right/full keep (:88-98). right/full append unmatched dataset records (:103-110). Unknown join_type with no match: the row is silently dropped (no else branch, :88-98). Missing context entry: warn and skip (:22-25). `available:false`: throws (:30-35).
  - Before each join the map is rebuilt on `dataset_column` if given (:327-329); rows lacking that field (`row[joinField] !== undefined` is false) are left out of the map (:262-265).
  - Crosswalk lookup (:132-250): `no_match_behavior` default 'keep_source'; also 'set_null' and 'set_default' with `default_value` default null (:141-142, :153-156). Null source value also goes through no-match handling (:193-199). Match key is lowercase string (:202). With `column_mappings` (non-empty array) every mapping gets the same value: `target_code || target_value || to || targetValue || null` (:214-222), output column `targetColumn || target || target_column`. Legacy path writes `target_code || target_value || to` to `target_column` only if set (:227-230); it omits `targetValue` from its fallback chain (:228). Missing crosswalk in context: warn and skip, rows unchanged (:170-173).
- Legacy transformation executors: `rdm_crosswalk_lookup` and `rdm_dataset_join` are executed in transformationEngine.js:95 and :98, implemented by `rdmCrosswalkLookup` (:811) and `rdmDatasetJoin` (:854). `rdmCrosswalkLookup` never reads `sourceField` (destructured at :814 but unused; the lookup uses `value`, :840). Context miss or missing map returns `defaultValue` (:829-837). A key miss returns `defaultValue` if non-null, else the original value (:847). These types are likely unreachable via the live converter: rdmContextLoader scans `mapping.transformations[]` while the engine passes raw `field_mappings` (jobExecutionEngine.js:1316-1317), and convertFieldMappings ignores `transformations` (XFM BUG 21; see XFM.md).
- rdmService.joinDataset (rdmService.js:276): prefixes fields `rdm_`; no caller found by grep.

## Data touched
Database: the singular mapping configs `rdm_lookup_enabled` (bool), `rdm_dataset_config` and `rdm_crosswalk_config` (jsonb) are columns of `transformation_mappings` (FileSence_prod_schema_Jan_05_1767780691950.sql:6327-6329). The plural `rdm_dataset_configs` / `rdm_crosswalk_configs` have no column in the prod dump; they are read from the in-memory mapping object (jobExecutionEngine.js:1277-1278). This area's own code (rdm*.js, rdmService.js) performs no queries. External: RDM API `/api/external/datasets`, `/datasets/:id`, `/datasets/:id/schema`, `/crosswalks`, `/crosswalks/:id`, `/crosswalks/:id/schema`, `/relationships`. In-memory NodeCache `rdmCache` (stdTTL 300, checkperiod 60; key `METHOD:endpoint:JSON(data)`, rdmService.js:7, :54). Secret names `RDM_BASE_URL`, `RDM_API_KEY`. Mapping fields read: `rdm_lookup_enabled`, `rdm_dataset_config(s)`, `rdm_crosswalk_config(s)`. Config keys: dataset `dataset_id, source_column, dataset_column, join_type`; crosswalk `crosswalk_id, source_column, target_column, no_match_behavior, default_value, column_mappings[{sourceColumn,targetColumn}]`. Frontend callers (URL grep only): CrosswalkLookupStep.jsx:37,54; RdmLookupStep.jsx:48-49,86; RdmLookupModal.jsx:102-103,121,143. They use only the four paths served by server.js.

## Flags
- DUPLICATE: rdm.js routes /datasets, /datasets/:id/schema, /crosswalks, /crosswalks/:id/schema (rdm.js:22,60,126,164) vs server.js:1258,1293,1330,1365. server.js returns the raw upstream body, no cache, reads secrets per request, 500 on missing config; rdm.js returns `{success,data}`, cached 300 s, `response.data || []`. The frontend gets the server.js shape.
- DUPLICATE: `analyzeRDMRequirements` (rdmContextLoader.js:156) vs `analyzeRDMRequirementsExtended` (:206); the former is exported only, no caller found.
- DUPLICATE: `rebuildDatasetMap` (rdmContextLoader.js:264) vs `rebuildDatasetMapForJoin` (rdmLookupProcessor.js:256); the first has no caller found.
- DEAD: the four shadowed rdm.js routes; `rdmService.joinDataset` (:276); `analyzeRDMRequirements`; `rebuildDatasetMap` (callers searched in server.js, backend/services, backend/src; tests excluded).
- BUG: `limit`/`offset`/`filters` accepted by GET datasets/:id/data and crosswalks/:id/data but ignored (rdmService.js:146, :203).
- BUG: POST lookup rejects a falsy sourceValue such as numeric 0 (rdm.js:214).
- BUG: lookup swallows all errors and returns null, so a 200 `data:null` hides an upstream failure (rdmService.js:266-272).
- BUG: dataset join with an unknown join_type and no match drops the row silently (rdmLookupProcessor.js:88-98).
- BUG: crosswalk target extraction uses `||`, so an empty-string target falls through to the next field and then null (:214-219, :228).
- BUG: a missing key in a source row becomes the string "undefined" in `joinDataset` and `lookupCrosswalk` comparisons (rdmService.js:261, 284, 289).
- BUG: rdm.js by-id and data routes always return 500 even for upstream 4xx (rdm.js:53, :157, :202).
- BUG: RDMService `initialize()` is async and not awaited in the constructor (rdmService.js:10-16), so early requests see the env-only configured state.
- UNCLEAR: dataset load failure is non-fatal in context loading but crosswalk failure is fatal (rdmContextLoader.js:86 vs :133).
- UNCLEAR: context loading runs regardless of `rdm_lookup_enabled`, so a disabled mapping with configs can still fail the job (jobExecutionEngine.js:1272-1358).
- SECURITY: no role/permission check; any authenticated user can list RDM resources and call POST /cache/clear (rdm.js:250).
- SECURITY: path params interpolated unencoded into the upstream URL (server.js:1307,1379; rdmService.js:138 and similar), allowing path manipulation against the upstream API using the server's API key.
- SECURITY: rdm.js error `details` returns upstream `responseBody`, endpoint and status to the client (rdm.js:33-39); full upstream response headers are logged on failure (rdmService.js:110).
- SECURITY: all users share one upstream API key; no per-user scoping.

## Domain terms
RDM = reference data management (external system); dataset (reference table, joined; legacy transform `rdm_dataset_join`); crosswalk (source-to-target code map; legacy `rdm_crosswalk_lookup`); mapping row fields `sourceValue/targetValue` = `source_code/target_code` = `source_value`/`target_value`/`from`/`to`; relationships; no-match behaviour (`keep_source`, `set_null`, `set_default`); join type (inner, left, right, full); RDM context (`context.rdm.crosswalks/datasets`).

## Open questions
1. Do the frontend components depend on response fields only present in one shape? Frontend files were only grepped for URLs, not read.
2. Answered: :3078 (archive branch) and :3640 (normal path) are different branches; both RDM failures are fatal for the file (see Job-time paths).
3. What paging/filtering semantics does the upstream API have? Nothing in code documents it.
4. config-secrets `getAllSecretData` behaviour (caching, rotation) was not read.
5. Answered: see "Legacy transformation executors" above (transformationEngine.js:95/:98).
6. Does pg return the jsonb config columns already parsed, so that applyRDMLookups never sees JSON strings on `mapping`? Not confirmed.
7. lineageGraphService.js:1386-1389 also recognises the legacy rdm_* types per the verifier; not read.
