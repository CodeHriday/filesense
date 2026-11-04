# API verify (final re-verify after fix round 2)

Verdict: PASS. Checked 48, wrong 0, unsupported 0, missing entry points 0.

## Coverage
All 11 HTTP entry points in inventory (6 token routes at apiTokenRoutes.js:9/:50/:76/:97/:119/:141, 5 upload routes at uploadRoutes.js:58/:187/:329/:506/:527) have subsections (entries 1-11). The queue consumer (entry 12), the frontend routes /api-tokens and /api-documentation (App.jsx:444-445, entry 14), the sync fallback (entry 13), the downstream processor (entry 15) and the prod-schema tables are covered. The full-file rewrite lost nothing I could find.

## Round-2 changes
- SECURITY-8, 4 queries: CORRECT. APITokenService.js :101 lookup, :126 last_used_at update, :162 settings read, :174 batch count. checkRateLimit is called at apiTokenAuth.js:37, after the update.
- DEAD-4 without crypto: CORRECT. crypto is used at uploadRoutes.js:39. Lines :24-26 are the only references to fileService, virusScanService and batchRecordProcessor. FileService.saveFile (:133) has no caller.
- upload_files columns: CORRECT. The prod schema :6428-6455 matches, including uploaded_at (:6454, timestamp default now()) and metadata (:6455, jsonb default {}). uploaded_at is the ordering column at UploadBatchService.js:262.
- BUG-3b: CORRECT. The vendor and internal catch blocks (uploadRoutes.js:173-179, :315-321) do not unlink req.file. The bulk list of leaking paths is accurate. Only :380 and :394 unlink.
- BUG-3c, null manifest: CORRECT. JSON.parse('null') returns null and `manifestData.files` at :348 throws a TypeError inside the outer try, giving 500. A null first entry throws at :363.
- Entry 15, no recordsProcessed: CORRECT. BatchRecordProcessor.js has no `recordsProcessed`. It returns the process* result, which has totalRecords and processedRecords. uploadWorker.js:99 and :110 read the undefined value.
- BUG-5 / entry 8: CORRECT. JSON.parse of governanceTags at :279 sits inside the queue try. The sync fallback re-parses at :296 inside the setImmediate try. The catch is at :299, and the `systemLogger.error` call is at :300. The file stays pending and the client gets 202. This is a one-line citation imprecision, not a wrong claim.

## Other claims checked (all CORRECT)
- Token create: validation and defaults at apiTokenRoutes.js:19-30. Name uniqueness at APITokenService.js:38-44. Token, prefix and bcrypt cost 10 at :47-49. Duplicate name gives generic 500 at routes :46. Response shape at :34-40.
- List: listTokens excludes the hash (:326-333). Usage route 500 for missing token. Revoke has no existence check (:200-214). Permanent delete returns error.message (routes :137). Bulk delete throws if any id has usage (:272-280); missing ids are skipped.
- Auth middleware: Bearer check, 429 and X-RateLimit headers (apiTokenAuth.js:24-54), 401 with message (:70-73). requireScope message (:98-102). `*` wildcard at APITokenService.js:151.
- Multer config (uploadRoutes.js:29-51). Vendor checks: 404 with unlink, PROJECT_INACTIVE, token project mismatch. The vendor route has no parent-project check, as noted in DUPLICATE-3. Internal checks, including PARENT_PROJECT_INACTIVE. Bulk project-from-first-entry, the strict `!==` compare at :405, and the response shape.
- Worker: concurrency 5 and limiter 10/1000 (uploadWorker.js:17-33). Virus check at :83. Failed-status and delete path at :114-136.
- BUG-1: updateFileStatus signature is `(fileId, updates)` (UploadBatchService.js:93). A string second argument leaves every field undefined, so line 171 throws "No updates provided". The call sites cited in the notes are right.
- BUG-2, BUG-10 (UploadBatchService.js:185), BUG-9: only uploadWorker.js:83 and UploadProcessor.js:22 use `isClean`; VirusScanService returns `isInfected`. The skipped-scan returns at VirusScanService.js:235-241 and :284-290 match.
- Queue defaults (uploadQueue.js:56-74), Redis env vars and retry (:13-28), and the non-BullMQ `timeout` (:72).
- Batch aggregates and status rule (UploadBatchService.js:195-239), batch/file id formats (:17, :24), rate-limit SQL interpolation (:178).
- Prod schema for api_tokens (:4231-4254), upload_batches (:6374-6399), upload_file_records (:6408), and the FKs at :7346-7348, :7799-7801, :7806 and :7811. token_prefix has no unique constraint and no index.
- Mounts at server.js:13950-13956, worker start at :14135-14137, and the JWT middleware at authenticate.js:32-35.
- Frontend scopes at APITokens.jsx:32-34, upload_staging created at runtime (BatchRecordProcessor.js:389-392, written at :463), DEAD-1 (listBatches has no caller).

## Minor gaps (not blocking)
- Open question 2 is answerable: besides apiTokenRoutes.js, APITokenService is also used by apiTokenAuth.js:8-11. Nothing else uses it.
- Not noted: a mid-loop failure in bulk (addFileToBatch or createBatch) returns 500 after some files may already be queued. Multer errors (for example more than 50 files) have no route-level handler.
- api_tokens created_by and revoked_by FKs to users (schema :7345, :7347) are not listed.
- Entry 13 says UploadProcessor is "reachable from nothing else". The sentence is ambiguous: it is called from the three upload routes' fallback blocks.
