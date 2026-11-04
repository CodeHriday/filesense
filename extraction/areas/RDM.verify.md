# RDM verification (round 2, after fix round 1)

Verdict: PASS

Counts: about 45 claims checked, 0 WRONG, 0 UNSUPPORTED, 0 entry points missing, 4 minor omissions (below). The full-file rewrite lost nothing from round 1.

## Coverage
All 16 entry points are present: 4 inline in server.js (:1258, :1293, :1330, :1365) and 12 in rdm.js. Mount at server.js:13921 confirmed (the only other `/api/rdm` hits in server.js are the four inline routes).

## Round-1 changes, all CORRECT
- Summary: :1316 is `loadRDMContext`. `applyRDMLookups` is at :3078 (archive branch, inside `if (mapping.rdm_lookup_enabled && allTransformedRows.length > 0)` at :3065) and at :3640 (inside `if (mapping.rdm_lookup_enabled)` at :3631). Both wrap failures as `RDM enrichment failed: ...` and throw (:3097, :3653).
- OQ 5 and XFM facts:
  - transformationEngine.js:95 and :98 dispatch to `rdmCrosswalkLookup` (:811) and `rdmDatasetJoin` (:854).
  - `sourceField` is destructured at :814 and never used.
  - A context or map miss returns `defaultValue` (:829-837).
  - A key miss returns `defaultValue !== null ? defaultValue : value` (:847).
  - XFM.md BUG 21 does say what RDM.md attributes to it.
- Dataset-map cite: rdmLookupProcessor.js:262-265, filter `row[joinField] !== undefined`.
- Column types: prod schema (attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql:6327-6329) has `rdm_lookup_enabled bool`, `rdm_dataset_config jsonb`, `rdm_crosswalk_config jsonb`. The plural columns are not in the dump. visualMappingCompiler.js:86-87 sets them on the in-memory object. The notes cite the file without its `attached_assets/` directory; that is a path nit only.
- Fatal context load: engine :1336-1358 logs, emits failed node status, calls `updateJob` with status 'failed' and `RDM context loading failed: <msg>`, marks the execution FAILED, and rethrows.
- Not gated on `rdm_lookup_enabled`: the block at :1272-1323 never reads the flag, and `loadRDMContext` is always called.
- Silent skip when unconfigured: rdmContextLoader.js:24-27 returns an empty context. Processor :22-25 and :170-173 warn and return rows unchanged.
- Non-JSON guard: rdmService.js:86-95 as stated (throws when `typeof response.data !== 'object'` or it is null).
- Config normalisation: engine :1280-1291 parses strings and :1295-1302 folds singular arrays into the plural lists. The `loadRDMContext` call is at :1316-1323. `applyRDMLookups` gets the raw `mapping`.
- Step 3.2.5: `hasCrosswalkEnrichment` at :3270-3274; `delayMappings` at :3293 and following; re-application at :3662.
- OQ 2 answer is correct.

## The two "per verifier" markers: both hold, drop them
1. Crosswalk last-row-wins. rdmContextLoader.js:67-72 builds the map with `map.set(key, row)` on every row, with no existence check, so the last duplicate wins. CORRECT.
2. Non-JSON error and the rdm.js 500 fallback. The throw at rdmService.js:91 sits inside the `try`, so the catch (:102-122) wraps it with `isRDMError = true` and `status = error.response?.status`, which is undefined because there is no response. rdm.js list and schema routes use `error.status || 500` (:29, :68), giving 500. The by-id and data routes are always 500. CORRECT. Extra detail worth adding: the final message is prefixed `RDM API request failed: RDM API returned a non-JSON response ...`.

## Other claims spot-checked, all CORRECT
- rdmService.js:
  - header and URL (:67-71)
  - TTL (:7)
  - cache key and GET-only caching (:54, :56, :97-99)
  - secrets fallback (:22-26)
  - un-awaited `initialize()` (:15)
  - `getDatasetData` ignores options and uses `Object.values` (:146-171)
  - `getCrosswalkData` normalisation and `[]` on a miss (:209-229)
  - `lookupCrosswalk` swallows errors (:256-274)
  - `joinDataset` has the "undefined" string issue (:284, :289)
  - full response headers logged on failure (:110)
- rdm.js:
  - health (:7-19)
  - details leak (:33-39)
  - filters 400 (:103-106)
  - `!sourceValue` rejects 0 (:214)
  - cache clear open to any authenticated user (:250)
  - by-id and data routes always 500 (:53, :202)
- server.js: missing-config 500 body (:1264-1269), error shape (:1285-1288), secrets read per request (:1260-1262).
- rdmContextLoader.js: dedupe (:31-46); crosswalk throw (:86); dataset `available:false` (:133-139); key candidates (:101-106); both analyzers (:156, :206); `rebuildDatasetMap` (:264) is a dead duplicate.
- rdmLookupProcessor.js:
  - join defaults and semantics (:17, :60-110)
  - unknown join_type with no match drops the row (no else at :88-98)
  - `column_mappings` chain (:214-222)
  - legacy chain omits `targetValue` (:228)
  - ordering (:323-340)
  - array/object normalisation (:294-310)

## Open questions answered
- OQ 6 (does pg return jsonb parsed?): Yes. The engine loads mappings with `SELECT * FROM transformation_mappings` (jobExecutionEngine.js:826-827; getMappingConfig :2493-2494). node-pg's default type parser JSON.parses jsonb, and a grep for `setTypeParser` finds no override in the repo. So `mapping.rdm_*_config` is an object or array, not a string, unless the stored jsonb value is itself a double-encoded string. The writers (visualMappings.js:631-650, visualWorkflowExecutor.js:461) go through pool.query. I did not read their serialisation of the rdm args, so the double-encoding risk is unproven. The engine's JSON.parse at :1280-1291 would cover it for the loader but not for the processor (:295-300).
- OQ 7 (lineageGraphService.js:1386-1389): this is in `extractDerivedColumns(fieldMappings)` (:1341), inside a switch on `mapping.transformation_type || mapping.type`. It only builds a display expression string for lineage derived columns: `LOOKUP(src, '<lookup_table || crosswalk_name>')` for `rdm_crosswalk_lookup` (:1386-1387) and `JOIN(src, '<dataset_name>')` for `rdm_dataset_join` (:1389-1390). It makes no RDM calls and does not touch the RDM service. It is a LIN concern, not RDM runtime behaviour.

## Minor omissions (not blocking)
1. visualMappings.js:624-637 and visualWorkflowExecutor.js:447-461 write the plural arrays into the singular jsonb columns. That is why the engine folds arrays at :1295-1302 and why applyRDMLookups accepts arrays in singular fields. Worth one line.
2. `hasCrosswalkEnrichment` (engine :3272) tests the singular config for truthiness, so an empty array `[]` there counts as true. Field_mappings are then delayed and re-applied at :3662, so it is harmless but real.
3. `rebuildDatasetMapForJoin` mutates the shared context entry in place (processor :269-270). Two joins on the same dataset with different `dataset_column` values share one entry, and the second rebuild changes `keyField`.
4. The cite for the prod DDL should read `attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql:6327-6329`. A second dump, `..._1767956647766.sql`, also exists and was not compared.
