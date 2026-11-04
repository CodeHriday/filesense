# SCH verification (final, after fix round 2)

Verdict: PASS

Counts: checked 52, WRONG 0, UNSUPPORTED 0, missing entry points 0. Minor gaps are listed at the end.

## Nothing lost
- All 6 HTTP entry points have subsections and match inventory.md lines 64, 115-118 and 570: GET /schema, GET, POST and DELETE /fixed-width-schema, POST /delimiter, GET /schema-history.
- The header_validator CLI (inventory line 882) is covered as entry 7.
- All library sections are present: schemaService, schemaExtractor, schemaParser, schemaFingerprint, fileDataValidator, schemaRuleEnforcer, callers, data touched.
- Flags are intact: DUPLICATE 1-7, BUG 1-13 (3 and 10 are marked removed or moved), DEAD 1-8, SECURITY 1-9, UNCLEAR 1-7.
- Open questions 1-8 are intact.

## Round-2 changes
- BUG 13 and `resolveLogicalFileGroup`: CORRECT.
  - `createLogicalFileId` returns `logical_${projectId}_${sanitized}` (filenameNormalizer.js:73-77). schemaService.js:410 passes `projectId || 0`.
  - The lookup is `project_id = $1` with the raw `projectId` (schemaService.js:416-419).
  - The INSERT uses `ON CONFLICT (project_id, canonical_name)` (:435-444). The catch rethrows (:450-452).
  - The DDL has a unique index on `logical_file_id` (:4400-4401) and on `(project_id, canonical_name)` (:4402-4403). `project_id` is nullable (DDL :1677) and `logical_file_id` is `NOT NULL`.
  - The conclusion is therefore correct: a null `project_id` never matches the lookup or the conflict target, so the second insert raises 23505 on `logical_file_id`.
  - Null `projectId` is reachable. transformationProfilingService.js:247 passes `projectId || null`, and :273 calls `saveSchemaSnapshot` with it. The note does not name this caller.
  - Both callers wrap the call in try/catch (fileProcessingWorker.js:1232-1248; transformationProfilingService.js:264-281), so the failure is logged and does not abort the upload. The note says only "saveSchemaSnapshot fails".
  - The fileProcessingWorker.js:1241 caller probably cannot pass null, because `files.project_id` looks NOT NULL in the DDL (:1419). I did not check this closely.
- BUG 10 stub and UNCLEAR 3: CORRECT.
  - schemaRuleEnforcer.js:535 reads `Sample rows (up to 100)`. I found no slice or cap in `enforceSchemaRules` (:544-744). `previewData` goes straight to `validateData` (:711) and `persistViolations` (:728).
  - The worker passes `fileInfo.preview_data` (fileProcessingWorker.js:1148, :2535, :2830-2834). The origin is `profileResult.preview_data` (:740).
  - Open question 7 is still honestly open.
- Delimiter 404 after the metadata update (step 3 and BUG 4): CORRECT.
  - The UPDATE is at server.js:8797-8800 and the 404 `File details not found` is at :8808-8809.
  - File-location 500s are at :8848-8853, :8886-8889 and :8898-8900. The `profiling_metrics` DELETE is at :8905 and the enqueue at :8912.
  - The `processing_step` update at :8936 comes after the enqueue.
  - The parse failure at :8789 happens before the UPDATE, so it is not a partial-save case.
- UNCLEAR 7, the cache-key mismatch: CORRECT as stated, and fairly hedged.
  - cache.js:152-153 builds the pattern `GET:/api/files/${fileId}*`. cacheMiddleware.js:19-23 builds `cache:${userId}:${baseKey}`.
  - server.js:87 imports `cacheMiddleware` from backend/middleware/cacheMiddleware.
  - The note could be firmer:
    - cache.js:78-80 anchors the memory regex with `^...$`, so `GET:...` cannot match a `cache:<uid>:/api/...` key.
    - src/middleware/cache.js uses its own stores (`config/redis` and a local NodeCache). The routes use `services/cacheService`, a separate store.
  - The `/schema` and `/fixed-width-schema` cache entries therefore very probably survive `invalidateFileCache`. This is not an error in the note.

## Sampled pass
All CORRECT:
- server.js:1822-1873.
- server.js:8672-8746.
- The auth mount at server.js:5282-5283.
- authenticate.js:17-38.
- schemaHistory.js:12-340, including the SQL, the pattern ranking at :58, the 404, the 500, the single-snapshot path and the output fields.
- schemaService.js:90-148 (hash and `normalizeType`).
- schemaService.js:166-259 (`compareSchemas`, including the safety branch at :177-183 and reorder at :243-256).
- schemaService.js:467-559 (`saveSchemaSnapshot`).
- header_validator.py:495-645, including the usage branch, scoring at :601-610, `import json` at :20, and the redundant import at :644.
- server.js:1932, :2752, :3790, :4161, :6332, :6603 (caller lines).
- DDL for `fixed_width_schemas` (:3600, :4335).

## Minor gaps (not enough to fail)
- DEAD 7 is listed under DEAD but the text says the branch is reachable (header_validator.py:536-543). It is mislabeled, not wrong.
- UNCLEAR 7 and open question 6 could be resolved with the evidence above.
- The BUG 13 text does not mention that callers catch the failure, nor name transformationProfilingService.js:273 as the null-project path.
