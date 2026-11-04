# Area API: Programmatic upload API and tokens

## Summary
Admins create bearer API tokens (`dfo_` + 64 hex chars). Machine clients use them to upload files to a vendor agreement, an internal project, or in bulk. Uploads return 202. Processing is asynchronous: a BullMQ queue `file-upload` if Redis works, otherwise `setImmediate` in-process. Clients poll status endpoints. Mounted at server.js:13950-13951 (`/api/uploads`) and :13955-13956 (`/api/tokens`). Worker started at server.js:14135-14137. Frontend: src/pages/APITokens.jsx, src/pages/APIDocumentation.jsx.

Important: both processing paths call `updateFileStatus` with the wrong argument shape (see BUG-1). As written, uploads probably fail at the first status update.

## Entry points

### Token admin (all use `authenticateToken` JWT; every handler repeats the admin check)
Admin check: `req.user.is_admin || roles.some(r => r?.toLowerCase()==='admin')`, else 403 `Admin privileges required` (apiTokenRoutes.js:13-17, repeated at :52-56, :78-82, :99-103, :121-125, :143-147).

1. POST /api/tokens (apiTokenRoutes.js:9)
   - Input: `name, projectId, scopes, rateLimit, rateWindowHours, expiresAt`.
   - Validation: `!name || !scopes || scopes.length===0` gives 400 (:19-21). Scope values are not checked against the allowed list. `rateLimit` is not validated as a number.
   - Defaults: `rateLimit || 100`, `rateWindowHours || 1`, `projectId || null`, `expiresAt` null (:26-30).
   - Service (APITokenService.js:27-84): name must be unique across all tokens, including revoked (:38-44). Token is `dfo_` + `randomBytes(32)` hex (:47). Prefix is the first 11 chars (:48). Stored as bcrypt hash with cost 10 (:49). Insert into `api_tokens` (:52-71). Scopes are stored as a JSON string.
   - Output: 201 `{message, token, tokenId, tokenPrefix, warning}` (:34-40). The plaintext is shown once.
   - Errors: any error, including duplicate name, gives 500 `Failed to create token` (:46). The duplicate-name message is not returned to the client.
   - The token owner `user_id` is the creating admin (:25). `projectId` is not checked for existence.
2. GET /api/tokens (:50). Query `userId, projectId, isActive` (parsed with parseInt, `isActive==='true'`). Returns `{tokens}` ordered by created_at DESC. Hash is excluded (APITokenService.js:326-333). 500 on error.
3. GET /api/tokens/:tokenId/usage (:76). Returns `{usage}` from `checkRateLimit`: `{limit, remaining, used, resetAt}`. A missing token throws `Token not found`, which becomes 500, not 404.
4. DELETE /api/tokens/:tokenId (:97). Revoke: `is_active=false, revoked_at=NOW(), revoked_by` (APITokenService.js:200-214). There is no existence check, so a non-existent id still returns 200 `Token revoked successfully`.
5. DELETE /api/tokens/:tokenId/permanent (:119). Hard delete. Refused if any `upload_batches` row references the token (APITokenService.js:222-241). A missing token gives `Token not found`. All errors return 500 with `error.message` (:137), including "usage history".
6. POST /api/tokens/bulk-delete (:141). Body `tokenIds` must be a non-empty array (else 400). Elements go through parseInt. If any id has usage, the whole call throws (APITokenService.js:272-280) and the route returns 500 `Failed to delete tokens`. Returns `{message, deletedCount}`. Ids that do not exist are silently skipped.

### Upload endpoints (auth: `authenticateAPIToken`, Bearer API token)
Auth middleware (apiTokenAuth.js:19-75):
- Header must start with `Bearer ` (else 401).
- `verifyToken`: must start with `dfo_`. Lookup by `token_prefix` (first 11 chars) AND `is_active=true`. Expiry is checked. bcrypt compare. `last_used_at` is updated. Failures give 401 `Authentication failed` with the message (APITokenService.js:93-137).
- Rate limit: `remaining <= 0` gives 429 (apiTokenAuth.js:39-45). It sets `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers.
- `requireScope`: `scopes.includes(scope) || scopes.includes('*')` else 403 (APITokenService.js:146-152; apiTokenAuth.js:83-107).

Common upload rules:
- Multer disk storage to `<cwd>/uploads/programmatic`, filename `<field>-<Date.now()>-<4 random bytes hex><ext>` (uploadRoutes.js:29-43).
- Limits: `fileSize` 2 GB, `files` 50 (:47-50). No file type or extension restriction.
- Success is 202 `{message, batchId, fileId, status:'pending', nextStep}`.
- On handler failure: 500 `{error, details: error.message}`.

7. POST /api/uploads/vendor/:agreementId (uploadRoutes.js:58). Scope `vendor_agreements:upload`. Field `file`. Body `triggerETL`.
   - No file gives 400. The agreement is joined to its project (:73-79). Not found gives 404 and the temp file is deleted.
   - Project `is_active===false` gives 403 `PROJECT_INACTIVE` (:89-96).
   - Token `project_id` set and different from the agreement's project gives 403 (:99-105).
   - Creates an `upload_batches` row with `targetType 'vendor'`, `totalFiles 1`, status `pending`. Adds an `upload_files` row with status `pending`. `fileType` is the extension without the dot.
   - Enqueues job `process-upload` with `jobId upload-<fileId>` and `priority 1` (:128-143). On queue exception it runs `uploadProcessor.processUploadFile` via `setImmediate` (:144-164). `triggerETL` is true only if 'true' or true.
8. POST /api/uploads/internal/:projectId (:187). Scope `projects:upload`. Extra body `governanceTags` (JSON string, parsed with `JSON.parse`, default `[]`).
   - Checks: project exists (404); project active (403 `PROJECT_INACTIVE`); parent project active if `parent_id` (403 `PARENT_PROJECT_INACTIVE`, :225-238); token project match (403, :241-247). Same queue and fallback, `priority 1`.
   - A malformed `governanceTags` throws inside the queue try block (:279). That is caught as a queue error, so it falls back to the sync path, where the `JSON.parse` at :296 fails again inside the try within `setImmediate` and is caught and logged (:299). The client still gets 202 and the file fails silently (see BUG-5).
9. POST /api/uploads/bulk (:329). Scope `bulk:upload`. Field `files` (max 50). Body `manifest` (JSON string) `{files:[{targetType,targetId,governanceTags,triggerETL,priority}]}`.
   - 400 for no files, no manifest, invalid manifest shape, or a count mismatch (returns expected and received).
   - `JSON.parse(manifest)` is outside any specific try, so bad JSON gives 500, not 400 (:346).
   - Project id comes only from the FIRST manifest file (:362-365). If its `targetType==='vendor'`, the id is looked up from `vendor_agreements`. Otherwise `targetId` is used as the project id.
   - Active and parent-active checks apply to that one project (:372-402). The token project check follows (:405-410).
   - Batch `targetType 'bulk'`, `targetId null`. Each file is added with its own manifest targetType and targetId. `priority` is `fileManifest.priority || 5`. `triggerETL` is `fileManifest.triggerETL || false`.
   - Response: `files:[{clientName,fileId,status}]`.
10. GET /api/uploads/batch/:batchId (:506). Auth only, no scope. Returns the batch row plus `files` (UploadBatchService.js:247-270). An error message containing 'not found' gives 404.
11. GET /api/uploads/:fileId/status (:527). Auth only, no scope. Returns the `upload_files` row (UploadBatchService.js:278-289). 404 when not found.

### Background processing
12. UploadWorker (backend/workers/uploadWorker.js:17-59). Queue `file-upload`, concurrency 5, limiter 10 jobs per 1000 ms. Pipeline: status `queued`, file-exists check, `scanning`, virus scan (`!scanResult.isClean` throws `Virus detected: ...`, uploadWorker.js:83-84), `processing`, `batchProcessor.processFile`, `completed`. On error: status `failed` with `error_message` and `error_details`, then, if the message includes `Virus detected`, the file is deleted (:114-136). Other files are left for FileProcessingWorker (:103-104, :125). But `VirusScanService.scanFile` returns `isInfected`, never `isClean` (VirusScanService.js:235-241, :255-269, :284-290, :300-), so `!scanResult.isClean` is always true: every file that reaches the scan is treated as infected, with message `Virus detected: Unknown threat` (`scanResult.virus` is also undefined), and is deleted (see BUG-9). When ClamAV is disabled or unavailable, `scanFile` skips the scan and returns `isInfected: false, skipped: true` (VirusScanService.js:227-242, :277-291), and a scan error not matching those cases also lets the file through (:293-); the worker's check still fails on the missing `isClean`. None of this is reached today because of BUG-1.
    - Queue defaults (uploadQueue.js:56-74): 3 attempts, exponential backoff 5000 ms, removeOnComplete age 3600 / count 1000, removeOnFail age 86400 / count 5000, `timeout` 600000. `timeout` is not a BullMQ job option and is probably ignored (UNCLEAR).
    - Redis: `REDIS_HOST` (default localhost), `REDIS_PORT` (default 6379), `REDIS_PASSWORD` optional. Retry gives up after 3 attempts (uploadQueue.js:13-28).
13. UploadProcessor.processUploadFile (services/UploadProcessor.js:11-68). The synchronous fallback. It is the same flow without the `queued` and `scanning` steps. It is also reachable from nothing else.
14. Frontend: /api-tokens (APITokens.jsx) offers scopes `vendor_agreements:upload`, `projects:upload`, `bulk:upload` (:32-34). /api-documentation (APIDocumentation.jsx) holds the usage examples.
15. BatchRecordProcessor.processFile (services/BatchRecordProcessor.js:32-127), the downstream processor.
    - File type is the lower-cased extension (:33). Supported: csv, json, xml, xlsx/xls, parquet, zip/tar/gz/tgz/bz2 (archive), sas7bdat/xpt (:49-76). Anything else throws `Unsupported file type: <ext>` (:78). So "no file type restriction" (SECURITY-3) holds at upload time but not at processing time.
    - Sets phase `parsing`, status `processing` (:42-45), parses into `upload_staging`, and a result with `totalRecords === 0` fails with "File contains no data rows..." (:82-90). On success it writes status/phase `completed` with totalRecords and processedRecords (:93-98); on error it writes `failed` with `errorMessage` and `errorDetails` {stack, fileType} (:115-123) and rethrows. The worker then writes `completed` again (duplicate write). `processFile` returns no `recordsProcessed`, but the worker reads `result.recordsProcessed` (uploadWorker.js:99, :110), so that value is undefined.
    - It does not read `triggerETL`, `governanceTags`, `agreementId` or `options.userId` (grep finds only `options.startRecordNumber`). It writes no `catalog_file_id`, `etl_job_id` or `cloud_storage_*`. So the API path creates no catalog entry, no cloud upload and no ETL run, and the `triggerETL` and `governanceTags` inputs have no effect.
    - It hands nothing to FileProcessingWorker (no enqueue in these files). Inferred, not traced in FileProcessingWorker: uploaded files probably stay in `uploads/programmatic`.

## Data touched
Prod schema source: attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql.
- `api_tokens` (prod :4231-4254): id, name, token_hash (unique), token_prefix (varchar(20), no unique constraint, no index), user_id, project_id, scopes (jsonb), rate_limit (int4, default 100), rate_window_hours (int4, default 1), is_active, expires_at, last_used_at, created_at, created_by, revoked_at, revoked_by, metadata (jsonb). FKs: user_id and project_id ON DELETE CASCADE (:7346, :7348), so deleting a user or project deletes its tokens.
- `upload_batches` (prod :6374-6399): id, batch_id (`batch_<ms>_<8 bytes hex>`, unique), user_id, api_token_id, project_id, target_type, target_id, status, total_files, completed_files, failed_files, total_records, processed_records, failed_records, total_size_bytes, started_at, completed_at, created_at, metadata. FKs to api_tokens, projects and users have no ON DELETE (:7799-7801), so deleting a user, project or token that has batches is blocked.
- `upload_files` (prod :6428-6455): id, file_id (`file_<ms>_<hex>`), batch_id (int4 FK to the batch pk), original_filename, normalized_filename, file_type, file_size_bytes, mime_type, target_type, target_id, status, phase (default `uploaded`), total_records, processed_records, failed_records, virus_scan_status, virus_scan_result, cloud_storage_path, cloud_storage_url, catalog_file_id, etl_job_id, error_message, error_details (jsonb), started_at, completed_at, uploaded_at (timestamp, default now(), prod :6454; used as the ordering column in UploadBatchService.js:262), metadata (jsonb, default `{}`, prod :6455).
- `upload_file_records` (prod :6408-6419): id, upload_file_id, record_number, status, error_message, error_code, row_data, created_at. Nothing in this area writes it. `upload_files.batch_id` and `upload_file_records.upload_file_id` cascade on delete (prod :7806, :7811).
- No CHECK constraints on the status columns (plain varchar), so the status vocabulary exists only in code.
- `upload_staging`: created at runtime by BatchRecordProcessor.ensureStagingTable (BatchRecordProcessor.js:389-416), written at :463. It is absent from the prod dump.
- Reads: `vendor_agreements`, `projects`.
- Filesystem: `uploads/programmatic/`.
- Redis queue `file-upload`.
- Migration: backend/migrations/createProgrammaticUploadTables.js:19, :59, :101, :156. The migration is never called, but the four tables exist in prod (:4231, :6374, :6408, :6428), so the API is live as far as schema goes.

Batch status rule (UploadBatchService.js:215-223):
- all files failed gives `failed`;
- all files completed or failed gives `completed`;
- any file processing gives `processing`;
- otherwise `pending`.

Batch aggregates (UploadBatchService.js:195-239), recomputed after every file update: `completed_files` and `failed_files` are counts of files by status; `total_records` and `processed_records` are sums over the batch's files; batch `started_at` is set to NOW() once any file has a non-null `started_at`; batch `completed_at` is set to NOW() once all files are completed or failed.

File statuses used across the code: pending, queued, scanning, processing, completed, failed.

Rate limit (APITokenService.js:160-191):
- counts `upload_batches` rows for the token in the last `rate_window_hours` hours;
- `remaining = max(0, rate_limit - count)`;
- `resetAt = now + window`, a rolling value rather than a fixed window.

## Flags

BUG-1 (critical, confirmed by reading the code, not by running it). `uploadWorker.js:67, 78, 90, 98, 115` and `UploadProcessor.js:13, 28, 43` call `updateFileStatus(fileId, 'status', {...})`. The signature is `(fileId, updates)` (UploadBatchService.js:93). The second argument is a string. Destructuring a string is legal JS and gives all fields `undefined` (:94-107); `updates.started_at` is undefined and `status === 'processing'` is false, so no clauses are added and the method throws `No updates provided` (:170-172). The `BatchRecordProcessor` calls use the object form (BatchRecordProcessor.js:42 etc.). Net effect as written: the first status update throws, before the file-exists check and the scan. The catch block then makes the same bad call, which throws again and replaces the original error. Files stay `pending`. Under BullMQ the job retries 3 times (uploadQueue.js:59) and each attempt fails the same way.

BUG-2. In `updateFileStatus`, `started_at = NOW()` is set when status is `processing` and `updates.started_at` is falsy, and `completed_at = NOW()` is set on `completed`/`failed` (UploadBatchService.js:163-168). `scanning_started_at` and `processing_started_at` are not handled. The snake_case keys `records_processed`, `error_message`, `error_details` are never read by the destructuring (:94-107); only camelCase keys are honoured, so snake_case keys passed would be ignored.

BUG-3. `uploadRoutes.js:405`. The bulk token project check compares `req.apiToken.project_id !== projectId` with a strict compare. When the first manifest entry is not `vendor`, `projectId` is `firstFileManifest.targetId` straight from the JSON (:365), so a JSON string id would always mismatch a token with a project. A number is fine. The vendor-derived value (:364) comes from the DB. The `/internal` check at :241 uses `parseInt(projectId)` and is not affected.

BUG-3b. Bulk upload leaks temp files. Multer has already written them, and they are not deleted on: manifest validation errors (:338-359), 400 `Invalid target project` (:367-369), the token project 403 (:405-410), a `JSON.parse` failure (:346) and the generic catch (:492). Only the inactive-project and inactive-parent paths unlink them (:380, :394). The same leak exists on the single-file endpoints: the vendor and internal catch blocks (uploadRoutes.js:173, :315) do not unlink `req.file` (for example on a createBatch or addFileToBatch failure).

BUG-3c. Bulk with a nonexistent project id: the active and parent checks sit inside `if (projectCheck.rows.length > 0)` (uploadRoutes.js:376), so a missing project skips them and processing continues. A token with a project_id is rejected only by the mismatch at :405; a null-project token goes on to `createBatch`. The outcome there (FK failure or not) was not traced. A manifest whose first entry is null throws a TypeError on `firstFileManifest.targetType` (:363), giving 500. A `manifest` of the JSON text `null` throws a TypeError on `manifestData.files` (:348), also a 500.

BUG-4. Bulk upload authorises only the first manifest entry's project (:362-410). Later entries can target other projects or agreements. Their `targetType`/`targetId` are saved unchecked, and the vendor `agreementId` is passed to processing. Inactive-project and token-scope project checks are bypassable for entries 2..n. This is also SECURITY.

BUG-5. Failures after the 202 response are silent to the client. A malformed `governanceTags` in /internal is caught by the queue try/catch and retried synchronously, and the `JSON.parse` fails again there (:279, :296); that error is caught and logged (:299), with no status update, so the file stays `pending`.

BUG-6. An invalid `projectId` or `agreementId` (non-numeric) reaches `query` and gives 500 (:73-79, :202-205), with `details: error.message` and the temp file not deleted.

BUG-7. `bulkDeleteTokens` and `deleteToken` return all failures as 500. `revokeToken` returns 200 for a missing id. `/usage` returns 500 for a missing id.

BUG-8. `createToken` duplicate name returns a generic 500 to the client (apiTokenRoutes.js:46).

BUG-9. Every file is treated as infected. `uploadWorker.js:83` and `UploadProcessor.js:22` test `!scanResult.isClean`, but `VirusScanService.scanFile` returns `isInfected` and never `isClean` (VirusScanService.js:236, :256, :265, :285, :301). So once BUG-1 is fixed every file throws `Virus detected: Unknown threat` and is deleted by the catch (uploadWorker.js:126-129). This also holds when the scan is skipped because ClamAV is unavailable (VirusScanService.js:228-242). Other callers use `isInfected` correctly (BulkProfilingService.js:810, fileProcessingWorker.js:474).

BUG-10. `updateFileStatus` throws a TypeError when the UPDATE matches no row, because it reads `result.rows[0].batch_id` (UploadBatchService.js:176-185).

SECURITY-1. `GET /api/uploads/batch/:batchId` and `/:fileId/status` require only a valid token, with no scope and no ownership check. Any valid token can read any batch or file by id, including other users' and other projects'. Ids are guessable-ish (`batch_<ms>_<hex>`) but are returned to the client.

SECURITY-2. `/vendor/:agreementId` and `/internal/:projectId`: a token with `project_id` NULL can upload to any project or agreement. There is no user-level permission check. The token's `user_id` is not checked for project membership. Access depends on the scope and token project only.

SECURITY-3. Upload has no file-type or extension allowlist. The original extension is preserved on disk (`path.extname`). 2 GB limit. Virus scan only runs in the (broken) processing path. See BUG-1: if the scan is never reached, nothing is scanned. At processing time only the types listed in entry 15 are accepted.

SECURITY-4. Error responses expose `error.message` and `details` (uploadRoutes.js:178, :320, :497) and the auth failure message (apiTokenAuth.js:72). `permanent` delete returns `error.message` (apiTokenRoutes.js:137). The scope check message echoes the required scope.

SECURITY-5 (downgraded, code smell). Rate-limit SQL interpolates `rate_window_hours` into the query text (APITokenService.js:178). The request body `rateWindowHours` is not validated (apiTokenRoutes.js:29), but the column is `int4` in prod (schema :4240), so the value read back is a number and a non-numeric value fails at the INSERT. Not injectable through this column.

SECURITY-6. Token lookup by an 11-char prefix with `is_active = true` takes `result.rows[0]` only (APITokenService.js:101-111). `token_prefix` has no unique constraint and no index (prod schema :4231-4254; only `token_hash` is unique). If two tokens share a prefix, only the first is tried. Collision is unlikely (7 hex chars after `dfo_`, about 268M values) but possible.

SECURITY-7. The `*` wildcard scope is honoured by `hasScope` (APITokenService.js:151), but the UI cannot create it. The API (POST /api/tokens) accepts any scope strings, including `*`.

SECURITY-8. Rate limiting counts upload batches, not requests. Status polling requests (GET endpoints) and failed uploads rejected before batch creation do not consume the limit. But the GET status routes also use `authenticateAPIToken` (uploadRoutes.js:506, :527), so an exhausted token gets 429 on status polls too. Each authenticated request runs 4 queries: token lookup (APITokenService.js:101), `last_used_at` update (:126), and in `checkRateLimit` the token settings read (:162) and the batch count (:174) (called at apiTokenAuth.js:37). `last_used_at` is updated before the rate-limit check, so 429 requests still update it.

SECURITY-9. The token admin routes use the plain JWT middleware `authenticateToken` (backend/middleware/authenticate.js:32-35), which sets `req.user` from the token payload. `is_admin` and `roles` come from the JWT claims with no DB check, so a revoked or demoted admin keeps token-admin access until the JWT expires.

DUPLICATE-1. `UploadProcessor.processUploadFile` and `UploadWorker.processUploadJob` implement the same pipeline (UploadProcessor.js:11-68; uploadWorker.js:61-140). They differ in extra `queued` and `scanning` steps and progress updates in the worker.

DUPLICATE-2. The inactive-project and parent-inactive checks are copied three times (uploadRoutes.js:88-96, :214-238, :371-402) with the same messages. The queue/fallback block is copied three times. The admin check is copied in six handlers.

DUPLICATE-3. The vendor and internal routes have separate batch creation. The only differences are the target type and the extra checks (parent project is checked only on /internal and /bulk, NOT on /vendor: uploadRoutes.js:88-96 vs :224-238).

DEAD-1. `UploadBatchService.listBatches` (:297-332) has no caller (repo-wide grep of backend finds only the definition at UploadBatchService.js:297).
DEAD-2. `uploadWorker` `job.updateProgress` values are not read by any API.
DEAD-3. `APITokenService.tokenHasUsage` is used only internally by `deleteToken`.
DEAD-4. Unused in uploadRoutes.js: `fileService = new FileService(null, systemLogger)` (:24), `virusScanService` (:25) and `batchRecordProcessor = new BatchRecordProcessor()` (:26) are declared and not otherwise referenced in that file (grep shows only the declarations). `FileService.saveFile` (FileService.js:133) has no caller in backend.

UNCLEAR-1. `timeout: 600000` in queue defaultJobOptions (uploadQueue.js:72) is not a documented BullMQ option.
UNCLEAR-2. Queue availability detection. `queue.add` only throws if Redis is down at add time. With `lazyConnect` and `maxRetriesPerRequest: null`, `add` may hang rather than throw. The sync fallback may then never trigger (behaviour not verified).
UNCLEAR-3. When Redis is down at startup, the worker may still be created without throwing (the Worker constructor is lazy), so the "not started" warning (server.js:14140) might not fire.
UNCLEAR-4. Parent-inactive check missing on /vendor. Unclear if intended (see DUPLICATE-3).
UNCLEAR-5. A file read from disk after a restart: queued jobs reference local paths (`filePath`), so a job processed on another host cannot find the file.

## Domain terms
- API token / programmatic upload token / `dfo_` token (prefix `dfo_` is probably "DataFlow Ops"; not confirmed in code).
- Scope: `vendor_agreements:upload`, `projects:upload`, `bulk:upload`, `*`.
- Batch (`upload_batches`) vs file (`upload_files`). Batch id `batch_...`, file id `file_...`.
- Target type: `vendor` (target = agreement), `internal` (target = project), `bulk`. In the UI "Vendor Agreement" vs "Project / internal".
- Manifest (bulk upload JSON).
- `triggerETL`, `governanceTags`, `priority` (1 for single uploads, 5 default for bulk).
- Revoke (soft, `is_active=false`) vs permanent delete (hard, only if unused).
- Rate limit window: `rate_limit` requests per `rate_window_hours`.
- Project "active/inactive"; parent project (subproject via `parent_id`).
- "Programmatic upload", "machine API" (inventory name), "upload API".

## Open questions
1. Not run: BUG-1 and BUG-9 are from reading the code only.
2. Is anything outside this area using the token service? (`APITokenService` was not searched repo-wide.)
3. Does `FileProcessingWorker` pick up files after the upload worker (the comment at uploadWorker.js:103 says so)? How, and who deletes `uploads/programmatic` files that were not profiled? Nothing in the API path enqueues it.
4. What happens in bulk with a nonexistent project and a null-project token at `createBatch` (BUG-3c)? Who cleans `upload_staging`?
5. What are the intended `X-RateLimit` semantics? The reset is always `now + window`.
6. APIDocumentation.jsx content and whether it matches the actual responses (not compared).
