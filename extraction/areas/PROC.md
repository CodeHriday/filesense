# PROC - Async file processing pipeline

## Summary

Files that come in through interactive upload, drop ingestion or delimiter re-profiling are not processed inside the HTTP request. The request puts a job on the queue named `file-processing`, and a single in-process consumer, `FileProcessingWorker`, does the work. The worker:
1. runs a virus scan;
2. optionally copies the file to an S3 drop location;
3. extracts archives;
4. parses and profiles the file, either with the Python CLIs or with the Flask Profile API;
5. validates vendor files;
6. detects duplicate rows;
7. writes `files`, `file_columns`, `file_preview_data`, ownership, governance, schema history and audit rows;
8. runs the quality rules on the preview rows;
9. deletes the uploaded file.

It reports progress by updating `files.processing_step`, which the upload page polls through `GET /api/files/:fileId/status`.

Main pieces:
- Queue abstraction: `backend/queue/queueFactory.js` returns a process-wide singleton. The default is `MemoryQueue`. `RedisQueue` (BullMQ) is used when `QUEUE_TYPE=redis` (queueFactory.js:42-62). `aws` and `gcp` fall back to memory (queueFactory.js:64-82). The same singleton is used by server.js:38 and by the DI key `queue` (backend/di/bootstrapper.js:98).
- Worker: built and started when server.js loads (server.js:38-45). There is one listener per process. Each `waiting` event calls `processJob` immediately (fileProcessingWorker.js:250-253) with no concurrency limit.
- Orphan recovery: re-queues rows still in `processing_step='queued'` after a restart (fileProcessingWorker.js:289-398). It is triggered twice at startup (fileProcessingWorker.js:282; server.js:14187) and also by `/api/debug/recover-orphans` (server.js:11754, owned by ADM).
- UploadCleanupWorker: deletes anything in `uploads/` older than 1 h, checking every 15 min (server.js:55-60; uploadCleanupWorker.js:22-24, :48).
- Status endpoints: `/api/files/:fileId/status` requires JWT and a project check (server.js:703). `/api/files/:fileId/job-status` has no authentication (server.js:3442).
- Also in this area, but dead or semi-dead: `backend/utils/asyncProcessor.js` and `processorWorker.js` (worker threads), `backend/services/streamingFileProcessor.js`, and `backend/services/UploadProcessor.js`. The last one is live but called only by the API area's upload routes.

## Entry points

### Producers (who enqueues `file-processing` jobs)
These handlers belong to other areas. They are listed here because they define the job payload.

| Producer | Location | Payload notes |
|---|---|---|
| POST /api/files/upload (ING) | server.js:3227-3250 | `fileId, filePath (multer path), originalName, fileSize, fileType, userId, fileHash, projectId, subProjectId, qualityRuleIds (manual merged with agreement rules), agreementId, delimiter, headerConfig, fixedWidthSchema, archivePassword, dropLocationConnectionId/Bucket/Prefix`. Options are `attempts:3, backoff exponential 5000, timeout 1800000`. Before queueing, it inserts a placeholder `files` row with `processing_step='queued'` and `metadata={file_path}` (server.js:3131-3136), and stores the archive password in the vault (server.js:3146-3148). |
| POST /api/files/drop (ING) | server.js:4496-4516 | Adds `storageLocation, storageKey, provider, isVendorFile: !!connectionId`. Sends no `subProjectId`, `fileHash` or `delimiter`. The `files` insert (server.js:4462-4463) does not set `processing_step`. |
| POST /api/files/:fileId/delimiter (SCH) | server.js:8912-8931 | Sends `qualityRuleIds: []` and `fixedWidthSchema: null`. `filePath` is either a temp download from S3 (`os.tmpdir()/reprofile/<fileId>_<filename>`, server.js:8828-8835) or `FILE_STORAGE_PATH/<yyyy-mm-dd>/<filename>` (server.js:8893). Before enqueueing it deletes the file's `profiling_metrics` rows (server.js:8905-8908). After enqueueing it runs `UPDATE files SET processing_step='queued', failure_reason_code=NULL, processing_error=NULL` (server.js:8936-8938). Because this runs after `addJob`, it can overwrite a `processing_step` the worker has already written (the worker starts on a `setImmediate` after `addJob`, MemoryQueue.js:70-74). |
| Orphan recovery (PROC) | fileProcessingWorker.js:364-380 | See the orphan recovery entry point. |
| POST /api/files/:fileId/password and /retry (ARC) | server.js:4692, :4846 | These enqueue on queue names `process_file_<fileId>`, not on `file-processing`. See BUG-1. |

### GET /api/files/:fileId/status
- Handler: server.js:703-764. Trigger: FileUpload.jsx:824. Polling is adaptive: 1 s for the first 10 s, 3 s up to 30 s, then 5 s (FileUpload.jsx:854-867). It starts after a successful upload (FileUpload.jsx:1234-1238).
- Placement: registered before `app.use('/api/', generalLimiter)` (server.js:767), so it is not rate-limited. The comment at server.js:700-702 says this is on purpose.
- Auth: `authenticateToken` (server.js:704). Admin bypass is `userHasAllProjectAccess(req.user)` (server.js:711). For anyone else, the file's `project_id` must have a `project_members` row for the caller, or a `user_groups` to `project_access_groups` link (server.js:727-736). There is no sub-project or vendor-specific check. A file with `project_id` NULL can only be read by admins, because the access query matches nothing.
- Input: path parameter `fileId`. There is no other validation.
- Output: 200 `{fileId, step, isComplete, rowCount, columnCount, processedAt}` (server.js:746-753).
  - `step` is `processing_step`, or `'pending'` if it is null (server.js:743).
  - `isComplete` is `step === 'complete' || processed_at !== null` (server.js:744). The worker and the upload and drop handlers do not write `files.processed_at`: neither the placeholder insert (server.js:3132-3136) nor the drop insert (server.js:4462-4463) sets it, and the worker's upsert does not (fileProcessingWorker.js:2067-2079). The one JS writer found is `FileService` (backend/services/FileService.js:178-188, `INSERT INTO files (..., processed_at, metadata) VALUES (..., NOW(), ...)`); its callers were not traced. All three schema dumps in the repo give `files.processed_at` a default of `CURRENT_TIMESTAMP`: attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql:4992 (inside `CREATE TABLE public.files` at :4983), attached_assets/database_ddl_1767770486833.sql:1410 (files table at :1401) and database_ddl_2026-01-07.sql:1297 (repo root). Under those schemas `processed_at` is non-null from row creation, so `isComplete` is true on the first poll whatever `step` is. See BUG-9 and BUG-19.
- Errors: 404 `{error:'File not found'}` (:720); 403 `{error:"Access denied to this file's project"}` (:739); 500 `{error:'Failed to fetch file status'}` (:761).
- Side effects: none.
- Step values the worker writes: `analyzing` (:925), `profiling` (:968), `header_validation` (:988), `duplicates` (:1051), `schema` (:1177), `quality_validation` (:1259), `complete` (:747, :785, :796, :1392), `failed` (:260, :358, :1376, :1489), `password_required` (:876). Other writers: `queued` (server.js:3134, :8938) and `processing` (server.js:4701, :4855).
- Frontend mapping: StepProgress.jsx:24-32 maps `scanning/analyzing/profiling/duplicates/schema` to "Processing" and `complete` to "Done". Any other value (`header_validation`, `quality_validation`, `failed`, `password_required`, `queued`) falls back to index 0, "Upload" (StepProgress.jsx:46-51). Polling stops only when `isComplete` (FileUpload.jsx:834-848); on completion the page redirects after 1.5 s (FileUpload.jsx:834-848). See BUG-9.

### GET /api/files/:fileId/job-status
- Handler: server.js:3442-3473. The repository has no frontend caller (grep for `job-status` finds only server.js:412 and :3442).
- Auth: none. No `authenticateToken`, no ownership check, and no global JWT mount before it (see SECURITY-1).
- Input: query `jobId` is required, otherwise 400 `{error:'jobId query parameter is required'}` (:3447-3449). The path `fileId` is only echoed back; nothing checks that the job belongs to it.
- Output: 200 `{fileId, jobId, state, progress, result, error, createdAt, finishedAt}` from `queue.getJobStatus(jobId)` (:3452-3465).
  - MemoryQueue states are `waiting | active | delayed | completed | failed` (MemoryQueue.js:53, :110, :118, :168, :180).
  - MemoryQueue's `getJobStatus` returns `state, progress, result, error, attemptsMade, createdAt, updatedAt` (MemoryQueue.js:87-98). It has no `finishedAt`, so `finishedAt` is always undefined in memory mode. `attemptsMade` and `updatedAt` are returned by the queue but the handler does not pass them on.
  - `result` for archive jobs includes `files: extractionResult.files` (fileProcessingWorker.js:819-825). Each entry carries `fullPath`/`relativePath` on the server (archiveExtractionService.js:229-235, :368-370).
- Errors: 500 `{error:'Failed to retrieve job status', details: error.message}` (:3466-3471). This includes "Job <id> not found" (MemoryQueue.js:82; RedisQueue.js:95).
  - In memory mode, completed jobs are removed 5 s after completion and failed jobs 30 s after final failure (MemoryQueue.js:138-144, :192-198). After that the endpoint returns 500.

### Queue consumer: FileProcessingWorker.processJob
- Started at server.js:45. `start()` (fileProcessingWorker.js:245-283):
  - registers `onJobWaiting('file-processing')` only if the queue has that method (:250);
  - registers log-only completed and failed listeners (:272-279);
  - schedules `recoverOrphanedJobs()` after 2000 ms (:282).
- Constructor (:36-60): builds `PasswordVaultService`, `ArchiveDetectionService`, `ArchiveExtractionService` (with VirusScanService) and `DLQService`. It throws if any of them fail.
- Trigger: a `waiting` event. MemoryQueue emits it on `addJob` (via setImmediate, MemoryQueue.js:70-74), when a backoff retry fires (:172-175), and on `retryJob` (:214).
- Who may trigger: anyone who can reach a producer. The worker does no authorization of its own; it trusts `job.data`.
- Callback guard (:251-267): if `processJob` throws past its own try/catch, it sets `processing_step='failed'` and `processing_error='Callback error: <msg>'`. The queue job is never failed or completed in that case. Example: the first audit insert at :442-459 sits outside the try block that starts at :461.
- `AuditService.logExecutionStateChange` rethrows on a DB error (AuditService.js:227-230), so every audit call in the pipeline can throw. See BUG-20 for the four call sites that matter.

Pipeline, in order, with the progress value set at each point (`queue.updateProgress`):
1. Audit `execution_audit`: `queued -> processing`, `executionType 'file_processing'`, `triggerType 'upload'` (:442-459; AuditService.js:172-226).
2. `activateJob`, progress 10 (:463-466).
3. Virus scan with `VirusScanService.scanFile(filePath)` (:469-511):
   - Infected: throws `Virus detected: <names>` (:474-481).
   - Otherwise it merges `metadata.virus_scan_status` = `'skipped'|'completed'` and `virus_scan_message` (:491-495).
   - Any other scan error is logged and processing continues with status `skipped` (:496-510). VirusScanService itself never throws and returns `skipped:true` on errors (VirusScanService.js:228-241, :271-307).
   - Progress 15 (:513).
4. S3 drop copy, only if `dropLocationConnectionId && dropLocationBucket` (:516-568):
   - Loads the connection (`ConnectionService.getConnectionById`) and calls `putObject` (fileProcessingWorker.js:541). The key is `<prefix without trailing slash>/<originalName>`, or `originalName` alone (:533-535). The content type comes from `getContentType` (:85-103).
   - The whole file is read into memory with `readFileSync` (:540).
   - On success it merges `metadata.s3_location, s3_bucket, s3_key` (:556-559). Errors are logged and ignored (:561-567).
   - Progress 20 (:570).
5. Extension: `getFileExtension` lowercases the name and normalises `.tgz` to `.tar.gz` and `.tbz2` to `.tar.bz2` (:74-80). Archive means one of `.zip .tar .tar.gz .tar.bz2 .tgz .tbz2` (:31). `.7z` and `.gz` are not in this list, although upload accepts them (server.js:843).
6. Delimiter: if `job.data.delimiter` is empty, it reads `files.metadata.delimiter` (:578-600).
7. Archive branch (:602-922):
   - Password source, in order: `job.data.archivePassword`; then the vault entry for `vendor_agreement_file_schema/<schemaId>`, where the schema is the first active `vendor_agreement_file_schemas` row for the agreement whose `file_name_pattern` matches the name (ordered by `priority ASC`, case-insensitive glob where `.` is escaped, `*` becomes `.*`, `?` becomes `.`) (:613-666); then the vault entry for `file/<fileId>` (:670-677). Vault errors are swallowed (:678-685).
   - `archiveExtractionService.extractArchive(filePath, fileId, password, userId)` (:694-699).
   - On success it picks the primary data file: the first extracted entry with `fullPath` that is not under `__MACOSX` and not `._*` (:708-713). It profiles that file through the Flask API with no password (:724-732), then updates the parent `files` row with `row_count`, `column_count`, `schema_definition` and `processing_step='complete'`, and saves `file_columns` and `file_preview_data` (:742-766).
     - If profiling fails, or there is no primary file, it still sets `complete` (:783-797).
     - It removes the extraction temp dir (:801-816), calls `completeJob` (:819-825) and audits `archive_extraction processing -> completed` (:828-844; the call is at :829).
     - It returns at :846. That skips `saveFileMetadata`, the quality score, ownership, governance, schema capture and snapshot, quality rules and the uploaded-file cleanup.
     - The audit at :829 sits inside the try whose `catch (extractionError)` is at :847. If the audit throws, it is handled as an extraction failure after `completeJob` (see BUG-20).
   - On a password-related failure (`reasonCode password_missing`, or the message contains `password` or `encrypted`) (:857-859):
     - creates a DLQ job of type `archive_extraction` with `{archiveFilePath, archiveFileId, userId}` (:861-870);
     - sets `processing_step='password_required'` and `metadata.password_required=true` (:875-878);
     - calls `failJob` (:881) and audits `failed_password_required` (:884-900);
     - returns at :902 without cleaning up the uploaded file.
   - On any other extraction failure it creates a DLQ job whose payload includes `password: archivePassword || null` (:905-915). Processing then falls through to profile the archive container (:917-920).
8. `processing_step='analyzing'`, progress 30 (:925-927).
9. Parser choice: `needsFlaskAPI` = archive or special format (`.sas7bdat .xpt .avro .dat .txt`, :32), or delimiter, headerConfig or fixedWidthSchema present (:933).
   - Flask: `POST ${PROFILE_API_URL || 'http://localhost:8000'}/api/vendor-profile` with JSON `{file_id, local_file_path, filename, password?, delimiter?, header_config?, fixed_width_schema?}`, a 300000 ms timeout and unlimited body size (:1613-1663).
     - The response is mapped to `row_count, column_count, schema[] (from column_profiles or metadata.columns), preview_data, format_specific, processing_error`, with `encoding` and `delimiter` set to null (:1666-1711).
     - On HTTP 400, a message containing `password` is rethrown as "Archive requires password. Please provide a password and retry." (:1734-1735) and `Virus detected` as "File failed virus scan..." (:1731-1744). If the file is missing on disk it throws "...may have been deleted prematurely" (:1746-1748).
     - The "Archive requires password" message is not categorised as `password_missing`: `categorizeError` needs `password` plus one of `required`, `protected` or `encrypted` (:122), and "requires" matches none of them. See BUG-21.
   - Legacy: `run_python_with_venv.sh utils/process_file.py <filePath> <fileType>` with `PYTHONPATH` set to the repo root (:1515-1607). Results:
     - non-zero exit rejects with stderr (:1562-1570);
     - JSON with `error` rejects (:1576-1583);
     - unparseable stdout rejects (:1587-1598).
     - A missing script rejects with a "DEPLOYMENT ISSUE" error (:1520-1528).
   - Progress 50 (:957).
10. Defaults when the Flask path is used (:960-962): `headerValidation = {success:true,status:'healthy',health_score:100,issues:[]}`, duplicates all 0. Steps 11-14 run only on the legacy path (:964); the Flask path skips them (:1060-1066).
11. `profiling`: `utils/profile_columns.py` (:1757-1817). Results are merged into the schema by column name, keeping the original `type` (:973-983). Any failure resolves to `{columns:[]}`. Progress 65 (:985).
12. `header_validation`: `utils/header_validator.py` (:1822-1882). Any failure resolves to the healthy default. Progress 70 (:998).
13. Vendor file validation, only when `isVendorFile` (:1001-1048). Errors are collected as follows:
    - `row_count` null or undefined: "File could not be parsed - unable to determine row count";
    - 0 rows and no schema: "File is completely empty (no header or data rows)";
    - 0 rows with a schema: "File contains only a header row with no data records" (:1005-1011);
    - when not fixed-width, any header issue with `severity==='critical'` or type `multiple_headers|missing_headers|header_data_mismatch` adds "Header issue: <description|type>" (:1014-1027).
    - Any error throws `Vendor file validation failed:\n- ...` (:1030-1039).
14. `duplicates`: an inline Python `-c` program calls `quality_checks.detect_duplicate_rows('<filePath>', '<fileType>')` (:1887-1957). Failures resolve to zeros. See SECURITY-2.
15. Progress 75. `saveFileMetadata` (:1071; :2006-2103):
    - It merges the existing `metadata` with `encoding`, `delimiter` (user value, then detected, then null), `preview_data`, `header_validation`, `header_config`, `fixed_width_schema`.
    - It computes `quality_score` (rule 1 under Business rules).
    - It upserts `files`. On conflict it updates only `row_count, column_count, quality_score, metadata, checksum, duplicate_records_count/percentage, sub_project_id, vendor_agreement_id, processing_error, updated_at`. Filename, type, size and project are not updated on conflict (:2067-2079).
    - `processing_error` is the Flask `processing_error`/`load_error`, so a file can be `complete` with a `processing_error` (:2059, :1710).
16. The `archive_members` and `file_processing_artifacts` inserts are gated on sub-keys of the Flask result's `format_specific` (outer check at :1074):
    - if `format_specific.archive_members` is set (:1077), `trackArchiveMembers` runs (:1078; :2206-2257). Its INSERT column list is `member_id, file_id, member_name, member_size, is_directory, extracted` (:2234-2239). The prod schema dump's `public.archive_members` has different columns (`id, parent_file_id, logical_name, original_name, ...`, with `UNIQUE (parent_file_id, logical_name)`; FileSence_prod_schema_Jan_05_1767956647766.sql:4297-4311). See BUG-4a;
    - if `format_specific.profiled_member` is set (:1086), it inserts a `file_processing_artifacts` row of type `primary_extraction` (:2172-2201).
    - Errors here are swallowed (:1074-1104; :1097-1103).
17. Calls `invalidateFileCache(fileId)` and `invalidateFileCatalogCache()` (:1107-1108; backend/src/middleware/cache.js:119, :152).
18. `file_quality_rules`: inserts each id in `qualityRuleIds` with `ON CONFLICT DO NOTHING`. Per-row errors are swallowed (:1111-1128).
19. `file_ownership` (:2262-2365), with `ON CONFLICT (file_id) DO NOTHING`:
    - with a known user: creator and owner are the uploader (`full_name || username || 'Unknown'`, email), `sensitivity_level 'Public'`;
    - with no userId: creator `'Unknown'`, owner `'Unassigned'`;
    - with an unknown userId: the ids are set and the names default the same way.
    - It never throws (:2356-2364). Progress 85 (:1133).
20. `file_columns`: deletes all rows for the file, then inserts one row per column (:2406-2474). Rules:
    - decimal min and max are parsed only for types `integer|float|decimal|numeric|number`;
    - values with absolute value above `9.9999999999e27` become NULL (:2371-2401);
    - columns that fail to insert are skipped, and `files.column_count` is then set to the number that succeeded (:2466-2473).
21. `file_preview_data`: at most 10000 rows, batches of 100, upsert on `(file_id,row_number)` (:2481-2524). Errors are swallowed. Existing rows beyond the new row count are not deleted.
22. Agreement governance, when `agreementId` is set and the schema is non-empty (:1146-1157; :2535-2866):
    - loads the agreement and its active file schemas ordered by `priority ASC NULLS LAST`;
    - matches with `^pattern.replace('*','.*')$/i`, with no escaping of `.` or other regex characters (:2589). If nothing matches, it falls back to the first row only if `rows[0].schema` is truthy (:2616-2625); otherwise it returns with no governance applied (:2629);
    - PII columns are the union of `schema[].is_pii/pii === true` and `column_metadata[col].contains_pii === true` (:2660-2672). It deletes all `column_governance_tag_assignments` for the file and inserts the `governance_tags.tag_name='PII'` tag for each PII column (:2687-2734);
    - for the enabled `vafs.quality_rule_ids` it uses the rule names as file tags and links the rules in `file_quality_rules` (:2739-2785);
    - calls `persistGovernanceMetadata` (:2788-2795);
    - calls `enforceSchemaRules` when the schema has rules and there are preview rows or file-level rules. It passes `projectId = agreement_project_id || projectId` (:2811-2865). `QUALITY_ABORT` is rethrown (:2857).
    - Errors other than `QUALITY_ABORT` are logged and processing continues (:1149-1156). A `QUALITY_ABORT` from `enforceSchemaRules` is also caught there and does not fail the job; see UNCLEAR-4.
23. Vendor file governance, only when `isVendorFile && !agreementId` (:1162-1172; :2877-3095):
    - takes `metadata.connection_id` and finds schemas where `va.vendor_connection_id = connection_id`, `approval_status` is in `FINAL_APPROVED_AGREEMENT_STATUSES`, `is_locked = true`, `status='active'` and `vafs.is_active` (:2906-2926);
    - matches with `filePatternMatcher.matchesPattern` (:2947-2955). If nothing matches, it falls back to the first row only if `rows[0].schema` is truthy (:2972); otherwise it returns with no governance applied (:2983);
    - the PII, tag and rule linking is the same as step 22. There is no column tag assignment and no `enforceSchemaRules`.
    - Progress 90 (:1174).
24. `schema` step:
    - `captureFileSchema` (:1181-1191);
    - `captureFileAudit` with `source 'upload'`, `loadType 'manual_upload'` and `status 'success'` for every producer, drop and re-profile included (:1201-1224);
    - `saveSchemaSnapshot` with columns `{name, type||data_type||'string', nullable !== false, index}`. Its errors are swallowed (:1232-1254).
25. `quality_validation`, only when `qualityRuleIds` is non-empty (:1257-1387):
    - loads rules with `enabled = true` (:1268-1271);
    - validates the preview rows, or runs with empty data when a `record_count` rule exists and `row_count` is known (:1275-1281);
    - calls `QualityValidationEngine.validateData` with `{file_id, file_name, upload_date, actual_row_count}` (:1288-1297);
    - stamps `file_quality_rules.last_run_at` only for rules that executed. With empty data, only `record_count` rules count as executed (:1310-1334);
    - persists violations with source `'file_upload'` and errors as `data_quality`/`error` on entity `'file'` (:1337-1362).
    - `QUALITY_ABORT` sets `failed` and rethrows (:1371-1378). Other errors are swallowed (:1380-1386).
26. Progress 100 and `processing_step='complete'`. It invalidates caches again, calls `completeJob({success, fileId, rowCount, columnCount, processingTime})`, audits `processing -> completed` (call at :1411) and deletes the uploaded file (:1389-1433). The audit sits between `completeJob` and the cleanup. It calls `global.gc()` if exposed (:1436; :3129-3146).

Failure path (catch at :1438-1509):
- `categorizeError` maps the message to `{reasonCode, actionableMessage}` (rule 3 under Business rules).
- `saveFailedFileMetadata` (:2108-2167):
  - upserts with `row_count 0, column_count 0, quality_score 0` on insert;
  - on conflict it updates only `processing_error` (the actionable message), `failure_reason_code`, `metadata` and `vendor_agreement_id`;
  - `metadata` keeps the existing keys but forces `encoding:null, delimiter:null, preview_data:[]` and adds `error`.
- Audits `processing -> failed` with the original error and stack in metadata (:1467-1486; call at :1468). This call is in the catch block, outside any try.
- Sets `processing_step='failed'` (:1489).
- Deletes the uploaded file only on the last attempt (:1492-1506).
- Calls `queue.failJob` (:1508).

### Orphan recovery (startup hook)
- Triggers:
  - `start()` schedules it after 2000 ms (fileProcessingWorker.js:282). This runs right after module load at server.js:45, before `startServer()`.
  - `startServer()` calls it again after the database is ready (server.js:14184-14192).
  - ADM's unauthenticated `GET /api/debug/recover-orphans` (server.js:11754-11795) also calls it. That route lists candidates using a different window, 2 min to 24 h (server.js:11767-11774).
- Auth: none (internal).
- Behaviour (fileProcessingWorker.js:289-398):
  1. Upserts `system_settings('orphan_recovery_last_run', now ISO)`. Errors are ignored (:301-306).
  2. Selects up to 20 `files` with `processing_step='queued'` and `created_at` between 5 minutes and 24 hours ago, oldest first (:308-317).
  3. Takes the path from `metadata.file_path`. If that is missing, it scans the relative directory `uploads` for a name ending in `-<filename>` or equal to it (:334-350).
  4. If no file is found: sets `processing_step='failed'` and `processing_error='File not found on disk after server restart'` (:352-361).
  5. Otherwise it re-queues with `{fileId, filePath, originalName, fileSize, fileType, projectId, subProjectId, agreementId (vendor_agreement_id), isVendorFile, delimiter, headerConfig, fixedWidthSchema, archivePassword}`, all taken from the row and its metadata, using the default options (:364-380).
     - `userId`, `fileHash`, `qualityRuleIds` and drop-location fields are not carried over.
     - The row's `processing_step` is not changed before re-queueing.
- Errors: per-file errors are logged (:387-392). Global errors are logged and swallowed (:394-397). The function returns undefined, which the debug route ignores.

### UploadCleanupWorker (interval)
- Constructed with `uploadsDir = path.join(__dirname,'uploads')` and `maxAgeMs = 3600000` (server.js:55-59), and started at module load (server.js:60).
- `start()` runs `cleanup()` immediately and then every 15 minutes (uploadCleanupWorker.js:13-25). An `isProcessing` flag prevents overlapping runs (:28-32).
- `cleanup()` deletes every regular file in the top level of `uploads/` whose `mtime` is older than 1 h. It does not look at DB or processing state (:36-56). `ENOENT` is ignored and other per-file errors are logged as warnings (:57-64).
- Stopped by graceful shutdown (server.js:14240-14242).

### Queue abstraction (`backend/queue/*`)
- `QueueInterface` declares `addJob, getJob, getJobStatus, updateProgress, activateJob, completeJob, failJob, retryJob, getQueueStats, getMetrics, removeJob, cleanOldJobs, onJobCompleted, onJobFailed, close` (QueueInterface.js:21-152). `onJobWaiting` is not part of the interface.
- `createQueue()` and `getQueue()` return a singleton (queueFactory.js:31-40, :97-102). `QUEUE_TYPE` defaults to `memory`. For `redis` it constructs `RedisQueue(REDIS_URL)` and falls back to memory only if the constructor throws, for example when `REDIS_URL` is missing (RedisQueue.js:22-24) or bullmq/ioredis are absent (queueFactory.js:47-56). Unknown types fall back to memory with a warning (:84-87).
- MemoryQueue (MemoryQueue.js):
  - `addJob`: uuid id; defaults `attempts 3`, `backoff {exponential, 5000}`, `timeout 1800000`, `removeOnComplete 100`, `removeOnFail 500`, and caller options override them through the spread (:39-60). The `waiting` event is emitted on `setImmediate` (:70-74).
  - `updateProgress` clamps to 0-100 (:102).
  - `completeJob`: sets state `completed` and progress 100. It records the time from creation to finish (last 100 kept) and removes the job after 5 s unless `removeOnComplete === false` (:116-145).
  - `failJob`: increments `attemptsMade`. If `attemptsMade < attempts`, state becomes `delayed` and a timer re-emits `waiting` after `delay * 2^(attemptsMade-1)` for exponential backoff, or after `delay` otherwise (:157-177). With the defaults that is 5 s and then 10 s. On the final failure it sets state `failed`, stores the error message and removes the job after 30 s (:178-199).
  - `retryJob` works only from `failed` and resets the attempts (:202-215).
  - `getMetrics` returns totals, `successRate` with 2 decimals plus `%`, average time, uptime, and per-queue stats (:234-272).
  - Jobs live only in process memory (:22-23).
- RedisQueue (RedisQueue.js):
  - one ioredis connection with `maxRetriesPerRequest:null, enableReadyCheck:false` (:26-29);
  - BullMQ `Queue` per name (:37-45);
  - `addJob` defaults: name `'default'`, `attempts 3`, exponential backoff 5000, `timeout 1800000`, `removeOnComplete {count:100, age:86400}`, `removeOnFail {count:500, age:604800}`, `priority` (:47-72);
  - `getJob` searches only the queues already opened in this process (:74-96);
  - `activateJob` is a no-op (:125-129);
  - `completeJob` and `failJob` call `moveToCompleted/moveToFailed(..., null, false)` (:131-153);
  - `getMetrics` returns zero totals with a note (:180-213);
  - `onJobCompleted/Failed/Progress` subscribe to `Queue` events (:237-256).
  - It has no `onJobWaiting` and creates no BullMQ `Worker`. `this.workers` is never filled (:32, :260). See BUG-2.

### asyncProcessor / processorWorker (worker threads)
- `processFileAsync` (asyncProcessor.js:25-113) and `processTransformationAsync` (:122-229) start a `worker_threads` Worker on processorWorker.js. They keep task state in an in-memory map and delete it 1 h after exit (:107-109, :223-225). `getTaskStatus`, `getAllTasks` and `cancelTask` read and terminate tasks (:335-418).
- processorWorker.js:
  - `file_processing` counts CSV lines and reads the header, parses JSON fully, and returns stub metadata for parquet (:76-251).
  - `transformation` is a simulation: fixed delays, hard-coded row counts (join 500, filter 300, aggregate 50, map `inputFiles[0].rowCount || 400`, generic 400) and placeholder output files written to `cwd/uploads/output_<ts>.csv` (:258-476).
- Callers: none live. See DEAD-1.

### UploadProcessor.processUploadFile (called by API area)
- Called from backend/routes/uploadRoutes.js:151, :293, :469.
- Sets the `UploadBatchService` file status to `processing` (UploadProcessor.js:13-15), checks the file exists (:17-19), scans it (:21-24), runs `BatchRecordProcessor.processFile` (:26) and sets `completed` with `records_processed` (:28-31). It does not delete the file; the comment says FileProcessingWorker does (:33-34).
- On error: sets `failed` with `error_message` and stack (:43-50), deletes the file only if the message contains `Virus detected` (:54-64), and rethrows.
- See BUG-3 for the scan check.

### streamingFileProcessor (dead)
- backend/services/streamingFileProcessor.js exports CSV and JSON stream processing with `COPY` bulk insert. CONFIG: `CHUNK_SIZE 1000`, `MAX_MEMORY_MB 256`, `CHECKPOINT_INTERVAL 10000`, 64 KB high-water mark (:23-28, :110, :144, :302, :553).
- No module requires it (grep for `streamingFileProcessor` finds only the file itself). inventory.md:1089 says it is reached through DI auto-registration, but the DI loader registers only files ending in `Service.js` or `Repository.js` (backend/di/services.js:21-24), and `streamingFileProcessor.js` matches neither. This note disagrees with the inventory; the code supports DEAD-2.

### run_python_with_venv.sh
- Used for every Python CLI the worker calls (fileProcessingWorker.js:1538, :1775, :1840, :1900). It tries, in order:
  1. `venv/bin/activate` with `python`;
  2. `python3`;
  3. `python`;
  4. `pip install --user -r requirements.txt` (or a hard-coded package list), then `python3`;
  5. the same install, then `python`;
  6. `uv run python`;
  7. bare `python3` (run_python_with_venv.sh:45-89).
- A candidate is accepted only if it can import `flask, flask_cors, pandas, numpy, boto3, psycopg2, pyzipper, pyreadstat, fastavro` (:7-26).
- All paths (`venv/`, `requirements.txt`) are relative to the Node process's cwd, because spawn passes no `cwd`.

## Business rules (literal values)
1. Quality score (fileProcessingWorker.js:1962-2001). Start at 100, then:
   - subtract `(100 - header health_score) * 0.5`;
   - subtract `min(duplicate_percentage,100) * 0.3`;
   - subtract `min(avg null %, 100) * 0.2`, where the average is over columns that have `null_count` when `row_count > 0`;
   - clamp to 0-100 and round.

   On the Flask path the header and duplicate terms are always 0 (:960-962). Failed files get 0 (:2154).
2. Retries: every producer uses `attempts 3`, exponential backoff `5000` ms, `timeout 1800000` (server.js:3246-3249, :4512-4515, :8927-8930). The worker treats an attempt as the last when `attemptsMade >= (job.opts?.attempts || 3) - 1` (fileProcessingWorker.js:420-422). Every exception is retried, including virus, vendor validation and `QUALITY_ABORT`.
3. Failure reason codes, from the first matching lowercase substring rule (fileProcessingWorker.js:110-222):
   - `virus_detected` (virus, malware, infected);
   - `password_missing` (password plus required, protected or encrypted; :122);
   - `clamav_unavailable`;
   - `unsupported_encoding` (encoding, decode, utf, ascii);
   - `extraction_failed` (extract, unzip, decompress, corrupt);
   - `schema_validation_failed` (schema plus mismatch, validation or drift);
   - `empty_file`;
   - `header_only_file`;
   - `header_validation_failed`;
   - `vendor_validation_failed`;
   - `conversion_failed` (conversion, transform, format);
   - `malformed_file` (parse, invalid, malformed);
   - default `conversion_failed` with "Processing failed: <msg>".
4. Orphan window: `queued`, older than 5 min and younger than 24 h, at most 20 per run (fileProcessingWorker.js:312-316).
5. Upload retention: files in `uploads/` are deleted after 1 h by mtime, checked every 15 min (server.js:58; uploadCleanupWorker.js:24, :48). The worker deletes the upload after success, and after failure on the last attempt (fileProcessingWorker.js:1433, :1492-1498). The comment calls this "security policy - metadata and preview stored" (:3110-3112).
6. Preview cap: 10000 rows stored (fileProcessingWorker.js:2489). Quality rules are evaluated on the preview rows only, not the full file (:1274-1275).
7. Flask Profile API timeout: 300000 ms (:1659). Default URL: `http://localhost:8000` (:1615).
8. Default sensitivity for new files: `'Public'` (:2284, :2315, :2346).

## Data touched
- Writes:
  - `files`: `processing_step`, `processing_error`, `failure_reason_code`, `metadata` (virus_scan_*, s3_*, password_required, preview_data, header_validation, delimiter, encoding, header_config, fixed_width_schema, error), `row_count`, `column_count`, `quality_score`, `checksum`, `duplicate_records_*`, `sub_project_id`, `vendor_agreement_id`, `schema_definition`, `updated_at`. The worker and the upload and drop handlers do not write `processed_at`; the schema dumps give it a default (see the status endpoint), and `FileService` inserts it with `NOW()` (backend/services/FileService.js:178-188; callers not traced).
  - `file_columns` (delete and insert), `file_preview_data` (upsert), `file_quality_rules` (insert, `last_run_at`), `file_ownership`, `archive_members`, `file_processing_artifacts`, `column_governance_tag_assignments` (delete and insert), `system_settings` (`orphan_recovery_last_run`), `execution_audit` (AuditService.js:196-206).
  - `profiling_metrics` (delete, by the re-profile handler before enqueueing; server.js:8905-8908).
  - Through other areas' services: file schema and audit tables (`captureFileSchema`, `captureFileAudit`), schema snapshots (`saveSchemaSnapshot`), governance (`persistGovernanceMetadata`), schema rule enforcement, quality violations and errors (`QualityValidationEngine`), DLQ jobs (`DLQService.createDLQJob`), archive extraction records (archiveExtractionService.js:206-214, :257-264).
- Reads: `files.metadata`, `vendor_agreement_file_schemas`, `vendor_agreements`, `quality_rules`, `users`, `governance_tags`, `storage_connections` (via ConnectionService), password vault.
- Filesystem:
  - `uploads/` (multer `Date.now()-<originalname>`, server.js:798-808);
  - archive temp dirs (removed after success, :801-816);
  - `os.tmpdir()/reprofile/` (re-profile, deleted by the worker after success).
- External:
  - Flask Profile API `/api/vendor-profile`;
  - Python CLIs `utils/process_file.py`, `utils/profile_columns.py`, `utils/header_validator.py`, `quality_checks.detect_duplicate_rows`;
  - ClamAV through VirusScanService;
  - S3 `putObject` (AWS SDK v2; the call is at fileProcessingWorker.js:541 on a client from `createS3Client`, which returns `new AWS.S3(s3Config)` at ConnectionService.js:187);
  - Redis (BullMQ) when `QUEUE_TYPE=redis`;
  - Redis cache invalidation.

## Flags

### DUPLICATE
- **DUPLICATE-1: three different filename-pattern matchers inside one worker.**
  - Archive password lookup: escapes `.`, `*` becomes `.*`, `?` becomes `.`, anchored, case-insensitive (fileProcessingWorker.js:628-632).
  - Agreement governance: only `*` becomes `.*`; `.` and other regex metacharacters are not escaped, so a pattern with `(` or `[` can throw (:2589).
  - Vendor governance: `filePatternMatcher.matchesPattern` (:2947-2955).

  The same file can therefore match different schemas in different steps.
- **DUPLICATE-2: two governance paths with near-identical PII, tag and rule-linking code.** `applyAgreementGovernance` (:2535-2866) and `applyVendorFileGovernance` (:2877-3095). Only the first writes `column_governance_tag_assignments` and runs `enforceSchemaRules`. They also choose schemas differently: the agreement path takes any agreement status; the vendor path requires final-approved, locked and active.
- **DUPLICATE-3: two cleanup mechanisms for uploads.** Per-job deletion (:3102-3123) and a 1 h sweep (uploadCleanupWorker.js:27-77). UploadProcessor deletes infected files itself (UploadProcessor.js:54-64).
- **DUPLICATE-4: two orphan-recovery triggers at startup.** fileProcessingWorker.js:282 and server.js:14187, plus the debug route with a different 2-minute window (server.js:11771).
- **DUPLICATE-5: two in-memory "async task" systems.** MemoryQueue (queue jobs) and asyncProcessor's `activeTasks` (worker threads), each with its own status model (`waiting/active/...` vs `processing/completed/error/cancelled`).

### BUG
- **BUG-1: password and retry jobs are never consumed.** POST /api/files/:fileId/password and /retry enqueue on `process_file_<fileId>` with `filePath: null` (server.js:4692-4697, :4846-4851). Nothing listens on those queue names; the only listener is `file-processing` (fileProcessingWorker.js:250). The handlers then set `processing_step='processing'` (server.js:4700-4703, :4854-4857). Orphan recovery only looks for `queued` (fileProcessingWorker.js:312), so these files stay in `processing` permanently.
- **BUG-2: Redis mode processes nothing.** RedisQueue has no `onJobWaiting` and never creates a BullMQ `Worker` (RedisQueue.js:18-275). The worker registers its consumer only `if this.queue.onJobWaiting` (fileProcessingWorker.js:250). With `QUEUE_TYPE=redis`, jobs pile up in Redis and files stay `queued`. Orphan recovery then re-adds them to the same unconsumed queue.
- **BUG-3: UploadProcessor rejects every file as infected.** It checks `!scanResult.isClean` (UploadProcessor.js:22), but VirusScanService only returns `isInfected` and never `isClean` (VirusScanService.js:235-306). The condition is always true, so every programmatic upload that reaches it throws `Virus detected: Unknown threat`. It also reads `scanResult.virus`, while the field is `viruses`.
- **BUG-4: deterministic failures are retried.** A failure caused by the file's content (virus, vendor validation, `QUALITY_ABORT`, password) is retried twice more with 5 s and 10 s backoff (MemoryQueue.js:157-177). Each attempt writes failure metadata and audit rows again. An infected file stays on disk until the last attempt (fileProcessingWorker.js:1492-1506).
  - The password path calls `failJob` (:881), so the retry creates a second and third DLQ `archive_extraction` job for the same file (:861-870).
  - `QUALITY_ABORT` from step 25 re-runs validation and persists violations again on each attempt (:1337-1342).
- **BUG-4a: `trackArchiveMembers` column list does not match the dumped `archive_members` table.** The INSERT uses `member_id, file_id, member_name, member_size, is_directory, extracted` (fileProcessingWorker.js:2234-2239). The prod schema dump's `public.archive_members` has `id, parent_file_id, logical_name, original_name, ...` and `UNIQUE (parent_file_id, logical_name)` (attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql:4297-4311). If the deployed table matches that dump, the INSERT would fail on column names, and the error is swallowed (:1097-1103), so no member rows are written. The deployed schema was not verified.
- **BUG-5: `maxAttempts` reads the BullMQ property name.** It reads `job.opts?.attempts` (:421), but MemoryQueue stores `job.options.attempts` (MemoryQueue.js:45-46). The value is always the fallback 3. That matches today's producers but ignores any other setting.
- **BUG-6: orphan recovery loses context.** Recovered jobs have no `userId` (ownership becomes "Unknown"/"Unassigned", :2265-2287), no `fileHash` (checksum is overwritten with NULL by the upsert, :2073, :2092) and no `qualityRuleIds` (fileProcessingWorker.js:364-378). The upload placeholder sets neither `vendor_agreement_id` nor `is_vendor_file` (server.js:3133-3136), so recovered contract uploads run without agreement governance or vendor validation.
- **BUG-7: the effective orphan window is 5 min to 1 h, not 5 min to 24 h.** UploadCleanupWorker runs immediately at module load (server.js:60; uploadCleanupWorker.js:20) and deletes uploads older than 1 h, so older candidates are marked `failed` "File not found on disk after server restart" (fileProcessingWorker.js:352-361). Files queued less than 5 min before a restart are never picked up automatically, because recovery runs only at startup.
- **BUG-8: double startup recovery can enqueue the same file twice.** Both triggers select `queued` rows, and recovery does not change `processing_step` before `addJob` (fileProcessingWorker.js:282; server.js:14187; :329-386). If both runs see the row, the file is processed concurrently twice.
- **BUG-9: the status endpoint reports completion too early.** The page stops polling only on `isComplete` (FileUpload.jsx:834-848), and `isComplete` is `step === 'complete' || processed_at !== null` (server.js:744). All three schema dumps give `files.processed_at` a default of `CURRENT_TIMESTAMP` (see the status endpoint and BUG-19), and the placeholder and drop inserts do not set it (server.js:3132-3136, :4462-4463). So `isComplete` is true on the first poll, and the page stops polling and redirects after 1.5 s, before processing has finished. The same applies to `failed` and `password_required` files: they also report `isComplete` true. This holds if the deployed schema matches the dumps (not verified).
- **BUG-10: a failure wipes the stored delimiter.** `saveFailedFileMetadata` forces `metadata.delimiter=null`, `encoding=null` and `preview_data=[]` (fileProcessingWorker.js:2123-2129). A user-set delimiter saved in metadata, which steps 6 (:578-600) and orphan recovery (:374) read, is lost after any failed attempt. Later attempts of the same job still use `job.data.delimiter`.
- **BUG-11: vendor validation is skipped on the Flask path.** It runs only inside the legacy branch (:964, :1001). Vendor `.txt`/`.dat` files, files with a custom delimiter or header config, and fixed-width files bypass the empty-file and header-only checks. Header validation and duplicate detection are also skipped there, so the quality score uses `health_score` 100 and 0 % duplicates (:960-962).
- **BUG-12: archive success is a short-circuit.** It returns before the quality score, `saveFileMetadata`, ownership, quality rules, governance, schema capture and snapshot, and upload cleanup (:846). Archive parents get none of these, and the uploaded archive waits for the 1 h sweep. The comment "extracted files will be queued separately" (:818) has no code behind it; nothing queues the extracted files.
- **BUG-13: archive extraction deletes the extracted files that child records point to.** Extraction creates child file records whose paths point at the temp dir (archiveExtractionService.js:206-214). The worker then deletes that temp dir (fileProcessingWorker.js:801-816).
- **BUG-14: wrong property names in archive logs.** Archive logging and audit use `f.filename` (:704, :840), but extracted entries carry `fileName` and `relativePath` (archiveExtractionService.js:368-370). The audit `extractedFiles` therefore contains undefined values.
- **BUG-15: TSV delimiter is a literal backslash-t.** processorWorker uses `'\\t'`, a two-character backslash-t string, not a tab (processorWorker.js:132). This is in dead code.
- **BUG-16: `asyncTransformationService` imports a function that does not exist.** It imports `executeTransformation` from asyncProcessor (asyncTransformationService.js:8, :48), which asyncProcessor does not export (asyncProcessor.js:420-426).
- **BUG-17: the Python runner can corrupt the JSON it returns.** In strategies 4 and 5, run_python_with_venv.sh prints "Installing Python dependencies..." to stdout (run_python_with_venv.sh:32, :35). The worker JSON-parses stdout (fileProcessingWorker.js:1573), so a run that installs dependencies fails `process_file.py` with "Failed to parse Python processor output". The other CLIs fall back silently to their defaults.
- **BUG-18: job-status loses jobs and fields in memory mode.** It returns 500 "not found" 5 s after a job completes (MemoryQueue.js:138-144), and `finishedAt` is always undefined (MemoryQueue.js:89-97; server.js:3464).
- **BUG-19: `isComplete` is true from row creation because `files.processed_at` has a DB default.** The status endpoint reads `processed_at` (server.js:715, :744). All three schema dumps declare `files.processed_at ... DEFAULT CURRENT_TIMESTAMP`: attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql:4992 (in `CREATE TABLE public.files` at :4983), attached_assets/database_ddl_1767770486833.sql:1410 (files table at :1401) and database_ddl_2026-01-07.sql:1297. The placeholder insert (server.js:3132-3136) and the drop insert (server.js:4462-4463) do not set it, and neither does the worker's upsert (fileProcessingWorker.js:2067-2079). The other `processed_at` columns without a default in database_ddl_1767770486833.sql:545 and database_ddl_2026-01-07.sql:524 belong to `archive_members`, not `files`. `FileService` inserts the column with `NOW()` (backend/services/FileService.js:178-188; callers not traced). Result: premature completion on the first poll (see BUG-9).
- **BUG-20: audit failures can hang, double-process or mis-handle jobs.** `AuditService.logExecutionStateChange` rethrows on a DB error (AuditService.js:227-230). Four call sites matter:
  - First audit (:442-459), outside the try block. If it throws, the job is never completed or failed: it stays `waiting` in MemoryQueue and is not retried. The callback guard marks the file `failed` (:255-266).
  - Success audit (call at :1411), after `completeJob` and before `cleanupUploadedFile` (:1433). A throw goes to the catch (:1438), which marks the file failed and writes failed metadata. `failJob` then runs on an already-completed MemoryQueue job, which can schedule a retry that reprocesses a successfully processed file, and the success cleanup is skipped. MemoryQueue.failJob has no state guard (MemoryQueue.js:147-177), so the job moves to `delayed` and `waiting` is re-emitted; this was read from code and not run.
  - Failure audit (call at :1468), in the catch block outside any try. A throw skips `updateProcessingStep('failed')` (:1489), the last-attempt cleanup (:1492) and `failJob` (:1508). Only the callback guard (:254-266) marks the file failed, and the job is never failed or retried.
  - Archive success audit (:829), inside the try with `catch (extractionError)` at :847. A throw is treated as an extraction failure after `completeJob` (:819), which creates a second DLQ job (:905) and falls through to profiling the archive container.
- **BUG-21: the Flask password error is mis-categorised.** The error "Archive requires password. Please provide a password and retry." (:1735) does not match `categorizeError`'s password rule, which needs `password` plus `required`, `protected` or `encrypted` (:122); "requires" matches none. The lowercased message also matches none of the other rules (:114-215), so it falls to the default: reason code `conversion_failed` with actionable message "Processing failed: Archive requires password. Please provide a password and retry." (:218-220). It never reaches `password_required`. The Flask error is thrown at step 9, after the archive branch has fallen through. Inside the archive `try` (:693), a primary-file profiling error is caught by the inner catch at :776 and only marks the file complete. The password check at :857-859 applies only to errors from `extractArchive`, so a container-profiling password error always takes the generic failure path (:1438-1509).

### DEAD
- **DEAD-1: asyncProcessor is not reachable from any live path.**
  - `processFileAsync` is never called (grep shows only its definition and export, asyncProcessor.js:25, :421).
  - `processTransformationAsync` is imported by TransformationService.js:14 but never called (grep).
  - `getTaskStatus` is used only by asyncTransformationService.js:133, and no module references that service by name.

  This contradicts the inventory note "used by TransformationService.js:14 and asyncTransformationService.js:8" (inventory.md:858).
- **DEAD-2: streamingFileProcessor.js is never required.** grep for `streamingFileProcessor` finds only the file itself. The inventory's claim of DI auto-registration (inventory.md:1089) does not hold: the DI loader registers only `*Service.js` and `*Repository.js` files (backend/di/services.js:21-24).
- **DEAD-3: unused members of the worker.** `LEGACY_EXTENSIONS` (fileProcessingWorker.js:33) and `getExtensionFromFilename` (:403-407) are never used. `stop()` is a no-op (:3151-3154).
- **DEAD-4: unimplemented queue types.** The `aws`/`gcp` branches are placeholders that fall back to MemoryQueue (queueFactory.js:64-82). In MemoryQueue, `cleanOldJobs`, `retryJob` and `getQueueStats`/`getMetrics` have no PROC caller. `getMetrics` is used by OPS health and queue-metrics endpoints (server.js:1111, :1211).
- **DEAD-5: MemoryQueue never enforces `timeout`.** It is stored (MemoryQueue.js:48) but nothing reads it. No job is ever timed out in memory mode.

### SECURITY
- **SECURITY-1: job-status has no authentication.** `GET /api/files/:fileId/job-status` (server.js:3442) lets anyone who has or guesses a job id read job state, error messages and archive results, including server-side extracted file paths (fileProcessingWorker.js:819-825). It also returns raw `error.message` on 500 (server.js:3470). MemoryQueue ids are UUIDv4 (MemoryQueue.js:40); BullMQ ids are sequential.
- **SECURITY-2: Python code injection in duplicate detection.** `detectDuplicates` builds Python source by string interpolation: `'${filePath.replace(/'/g, "\\'")}'` and `'${fileType}'` (fileProcessingWorker.js:1889-1897). Backslashes are not escaped, so a name containing `\'` ends the string literal.
  - `filePath` contains the client-supplied `originalname` (server.js:806-807). The upload route does not sanitize it; the only `validateFilename` call is in the drop route (server.js:4098).
  - The NOSONAR comment "no user input in script" (:1901) is inaccurate.
- **SECURITY-3: archive passwords appear in plaintext in several places.**
  - In memory job data (`archivePassword`, server.js:3242).
  - In the HTTP request body to the Profile API, which defaults to plain `http://` (fileProcessingWorker.js:1615, :1625-1627).
  - In the DLQ job payload `password: archivePassword || null` (:911).
  - Orphan recovery reads `metadata.archivePassword` (:377), which implies some writer may store it in `files.metadata`. No writer was found in server.js.
- **SECURITY-4: the debug route is unauthenticated.** `GET /api/debug/recover-orphans` (server.js:11754, area ADM) triggers recovery, exposes queue internals, and returns `error.stack` on 500 (server.js:11793).
- **SECURITY-5: a failed virus scan does not block the file.** When ClamAV is unavailable or errors, processing continues with `virus_scan_status:'skipped'` (fileProcessingWorker.js:496-510; VirusScanService.js:228-241, :293-307). The `clamav_unavailable` message says "File upload rejected as a security precaution" (fileProcessingWorker.js:133), but no code path rejects.
- **SECURITY-6: S3 drop copies can overwrite each other.** The S3 key is the raw `originalName` under the prefix (fileProcessingWorker.js:533-535), so two uploads with the same name overwrite each other in the drop bucket.
- **SECURITY-7: no rate limit on status polling.** `/api/files/:fileId/status` sits before `generalLimiter` on purpose (server.js:700-703, :767).

### UNCLEAR
- **UNCLEAR-1: no concurrency control.** Each `waiting` event starts `processJob` at once (fileProcessingWorker.js:250-253). An upload of up to 20 files (server.js:891) starts up to 20 parallel Python and Flask pipelines in one process. It is unclear whether this is intended.
- **UNCLEAR-2: `.7z` and `.gz` handling.** Upload accepts them (server.js:843), but they are neither archive nor special format for the worker (fileProcessingWorker.js:31-32). They go to `process_file.py` with fileType `7z`/`gz`. The intended handling is unknown.
- **UNCLEAR-3: complete files can carry a processing error.** On the Flask path a file can be `complete` with a non-null `processing_error` (from `load_error`) (:1710, :2059, :1392). It is unclear whether the UI treats this as a failure.
- **UNCLEAR-4: `QUALITY_ABORT` is handled differently depending on where it is raised.** From `enforceSchemaRules` it is rethrown inside `applyAgreementGovernance` (:2857), then caught and logged by the caller's catch (:1149-1156). From step 25 it fails the job (:1371-1378). The difference may not be intended.
- **UNCLEAR-5: the audit `loadType` is always `'manual_upload'` and `source` always `'upload'`.** This applies to drop and re-profile jobs too (:1211-1218).
- **UNCLEAR-6: re-profiling a local file would delete it.** The delimiter re-profile local path is `FILE_STORAGE_PATH/<date>/<filename>` (server.js:8893). No code in the repo writes there (grep `FILE_STORAGE_PATH|file_storage`). If such a file existed, the worker would delete it after success (fileProcessingWorker.js:1433, :3102-3115).
- **UNCLEAR-7: mismatched upload directory paths.** Orphan recovery looks in the relative `uploads` directory (fileProcessingWorker.js:337), while multer and the cleanup worker use `path.join(__dirname,'uploads')` (server.js:57, :800). They match only when cwd is the repo root.
- **UNCLEAR-8: the DLQ password retry may find its file already deleted.** It references `archiveFilePath` in `uploads/` (fileProcessingWorker.js:864), which the cleanup worker deletes after 1 h (uploadCleanupWorker.js:48).

## Domain terms
- **file / fileId / file_id**: the catalog row in `files`. The same id is used as the job payload key and the vault entity id (`'file'`, :671).
- **job / jobId**: a queue job (MemoryQueue UUID or BullMQ id). This is different from the `jobs` table (JOB area), from DLQ jobs (ARC) and from asyncProcessor "tasks" (`taskId`).
- **processing_step / step**: the progress state of a file. The frontend shows only three coarse steps: "Upload", "Processing", "Done" (StepProgress.jsx:6-22). DataProfile.jsx:1952 comments list `pending, queued, scanning, profiling, complete, failed`, which differs from what the worker writes.
- **progress**: a separate 0-100 number on the queue job (10/15/20/30/50/65/70/75/85/90/92/100).
- **orphaned file**: a `queued` row whose in-memory job was lost on restart.
- **vendor file** (`isVendorFile` / `is_vendor_file`): set by drop ingestion when a connection is used (server.js:4507). It is distinct from **contract validation** / **agreement** files (`agreementId` / `vendor_agreement_id`). The worker keeps the two paths apart (:1159-1162).
- **file schema / pattern schema**: a `vendor_agreement_file_schemas` row matched by `file_name_pattern`. Also called "matched schema" (:2579).
- **drop location**: an S3 bucket and prefix configured on a project or sub-project, which uploads are copied to (server.js:3015-3017, :3073-3075).
- **legacy path vs Flask path**: the local Python CLIs vs the Profile API `/api/vendor-profile` (:933, :947).
- **special format**: `.sas7bdat .xpt .avro .dat .txt` (:32).
- **archive / container**: the uploaded archive file. **primary data file**: the first extracted member that gets profiled. **archive members**: the manifest rows. **processing artifact**: an output tracked from an archive.
- **preview data**: up to 10000 rows stored per file and used as the data for quality rules.
- **header validation / health_score**: the output of header_validator.py (0-100).
- **quality_score**: the composite score computed by the worker. It is different from the DQ area's rule-based scores.
- **failure_reason_code / reasonCode** and **actionableMessage** (stored as `processing_error`).
- **queue type**: `memory | redis | aws | gcp` (`QUEUE_TYPE`).

## Open questions
- Whether the deployed `files` table matches the schema dumps. All three dumps give `files.processed_at` a `CURRENT_TIMESTAMP` default (attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql:4992; attached_assets/database_ddl_1767770486833.sql:1410; database_ddl_2026-01-07.sql:1297). No migration in the repo was traced to confirm the running database. BUG-9 and BUG-19 assume it matches.
- Who calls `FileService` (backend/services/FileService.js:178-188), which inserts `files` rows with `processed_at = NOW()`. Callers were not traced, so it is unknown whether it is live.
- Whether the deployed `archive_members` table has the columns that `trackArchiveMembers` inserts into (fileProcessingWorker.js:2234-2239), or those in the prod dump (FileSence_prod_schema_Jan_05_1767956647766.sql:4297-4311). See BUG-4a.
- Whether `diContainer.get('auditService')` at server.js:43 resolves at module load. It is registered only through auto-discovery of `AuditService.js` with `(dbPool, logger)` (backend/di/services.js:28-60). If it is undefined, all audit calls are skipped (`if (this.auditService)`).
- Whether BullMQ accepts `moveToCompleted/moveToFailed(result, null, false)` without a lock token (RedisQueue.js:136, :148), whether BullMQ's `Queue` emits `completed`/`failed` events (RedisQueue.js:239, :246), and whether a BullMQ job honours the `timeout` option (RedisQueue.js:59). None of this can be confirmed from repo code.
- `passwordVaultService.retrievePassword(entityType, id, userId)` with `userId` undefined (the orphan recovery path): whether the vault allows retrieval without a user. Not traced (ARC area).
- Output contracts of `utils/process_file.py`, `profile_columns.py`, `header_validator.py`, `quality_checks.detect_duplicate_rows` and the Profile API `/api/vendor-profile` (PROF/SCH/DQ areas). This document lists only the fields the worker reads.
- Behaviour of `captureFileSchema`, `captureFileAudit`, `saveSchemaSnapshot`, `persistGovernanceMetadata`, `enforceSchemaRules`, `QualityValidationEngine.validateData/persistViolations/persistErrors`, `DLQService.createDLQJob` and `archiveExtractionService.extractArchive` internals. These belong to LEDG/SCH/GOV/DQ/ARC and are not traced here.
- Whether any deployment sets `QUEUE_TYPE=redis`. No config file in the scope checked sets it. Without that, BUG-2 is latent.
- Who, if anyone, writes `metadata.archivePassword`, `metadata.headerConfig` or `metadata.fixedWidthSchema`, the camelCase keys orphan recovery reads (fileProcessingWorker.js:375-377). The worker itself writes the snake_case `header_config` and `fixed_width_schema` (:2037-2038).
