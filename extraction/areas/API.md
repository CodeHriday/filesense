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
   - A malformed `governanceTags` throws inside the queue try block (:279). That is caught as a queue error, so it falls back to the sync path, which throws again inside `setImmediate`. The client still gets 202 and the file fails silently (see BUG-5).
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
12. UploadWorker (backend/workers/uploadWorker.js:17-59). Queue `file-upload`, concurrency 5, limiter 10 jobs per 1000 ms. Pipeline: status `queued`, file-exists check, `scanning`, virus scan (`isClean` false throws `Virus detected: ...`), `processing`, `batchProcessor.processFile`, `completed`. On error: status `failed` with `error_message` and `error_details`. An infected file is deleted immediately. Other files are left for FileProcessingWorker (:103-104, :124-136).
    - Queue defaults (uploadQueue.js:56-74): 3 attempts, exponential backoff 5000 ms, removeOnComplete age 3600 / count 1000, removeOnFail age 86400 / count 5000, `timeout` 600000. `timeout` is not a BullMQ job option and is probably ignored (UNCLEAR).
    - Redis: `REDIS_HOST` (default localhost), `REDIS_PORT` (default 6379), `REDIS_PASSWORD` optional. Retry gives up after 3 attempts (uploadQueue.js:13-28).
13. UploadProcessor.processUploadFile (services/UploadProcessor.js:11-68). The synchronous fallback. It is the same flow without the `queued` and `scanning` steps. It is also reachable from nothing else.
14. Frontend: /api-tokens (APITokens.jsx) offers scopes `vendor_agreements:upload`, `projects:upload`, `bulk:upload` (:32-34). /api-documentation (APIDocumentation.jsx) holds the usage examples. `BatchRecordProcessor.processFile` (services/BatchRecordProcessor.js:32) is the downstream processor. It is only partly read, so what it does is under Open questions.

## Data touched
- `api_tokens`: name, token_hash, token_prefix, user_id, project_id, scopes (JSON), rate_limit, rate_window_hours, is_active, expires_at, last_used_at, revoked_at, revoked_by, created_by.
- `upload_batches`: batch_id (`batch_<ms>_<8 bytes hex>`), user_id, api_token_id, project_id, target_type, target_id, total_files, completed_files, failed_files, total_records, processed_records, status, started_at, completed_at.
- `upload_files`: file_id (`file_<ms>_<hex>`), batch_id (FK to the batch pk), original_filename, file_type, file_size_bytes, mime_type, target_type, target_id, status, phase, error fields, virus_scan_*, cloud_storage_*, catalog_file_id, etl_job_id.
- `upload_file_records`, `upload_staging` (written by BatchRecordProcessor.js:463).
- Reads: `vendor_agreements`, `projects`.
- Filesystem: `uploads/programmatic/`.
- Redis queue `file-upload`.
- Migration: backend/migrations/createProgrammaticUploadTables.js:19, :59, :101, :156.

Batch status rule (UploadBatchService.js:215-223):
- all files failed gives `failed`;
- all files completed or failed gives `completed`;
- any file processing gives `processing`;
- otherwise `pending`.

File statuses used across the code: pending, queued, scanning, processing, completed, failed.

Rate limit (APITokenService.js:160-191):
- counts `upload_batches` rows for the token in the last `rate_window_hours` hours;
- `remaining = max(0, rate_limit - count)`;
- `resetAt = now + window`, a rolling value rather than a fixed window.

## Flags

BUG-1 (critical). `uploadWorker.js:67, 78, 90, 98, 115` and `UploadProcessor.js:13, 28, 43` call `updateFileStatus(fileId, 'status', {...})`. The signature is `(fileId, updates)` (UploadBatchService.js:93). The second argument is a string, so destructuring yields all `undefined` and the method throws `No updates provided` (:170-172). The `BatchRecordProcessor` calls use the object form (BatchRecordProcessor.js:42 etc.). Net effect as written: the first status update throws. The catch block then calls `updateFileStatus` again with the same bad shape, which throws again. Files appear never to progress past `pending`. Not run, so this is inferred from reading.

BUG-2. `updateFileStatus` has no `started_at` or `scanning_started_at` handling, and the keys `records_processed`, `error_message`, `error_details` (snake_case) and `completed_at` are never read by the destructuring. Even with the right shape the snake_case keys are ignored. Only camelCase keys are honoured.

BUG-3. `uploadRoutes.js:405` and `:241`. The bulk token project check compares `req.apiToken.project_id !== projectId`. For a bulk internal target, `projectId` is `firstFileManifest.targetId`, which may be a string. A strict compare would then always mismatch. The vendor path (:99) compares values from the DB, which is fine. In bulk, the uploaded temp files are NOT deleted on this 403 (:405-410), nor on 400 ("Invalid target project", :367-369), nor on the other manifest validation errors (:338-359). They leak on disk. The same leak occurs on the 403 permission-scope paths because multer has already stored the file (the scope check runs before multer, so it does not apply there).

BUG-4. Bulk upload authorises only the first manifest entry's project (:362-410). Later entries can target other projects or agreements. Their `targetType`/`targetId` are saved unchecked, and the vendor `agreementId` is passed to processing. Inactive-project and token-scope project checks are bypassable for entries 2..n. This is also SECURITY.

BUG-5. Failures after the 202 response are silent to the client. A malformed `governanceTags` in /internal is caught by the queue try/catch and retried synchronously, and it fails there with no status update (:279, :296).

BUG-6. An invalid `projectId` or `agreementId` (non-numeric) reaches `query` and gives 500 (:73-79, :202-205), with `details: error.message` and the temp file not deleted.

BUG-7. `bulkDeleteTokens` and `deleteToken` return all failures as 500. `revokeToken` returns 200 for a missing id. `/usage` returns 500 for a missing id.

BUG-8. `createToken` duplicate name returns a generic 500 to the client (apiTokenRoutes.js:46).

SECURITY-1. `GET /api/uploads/batch/:batchId` and `/:fileId/status` require only a valid token, with no scope and no ownership check. Any valid token can read any batch or file by id, including other users' and other projects'. Ids are guessable-ish (`batch_<ms>_<hex>`) but are returned to the client.

SECURITY-2. `/vendor/:agreementId` and `/internal/:projectId`: a token with `project_id` NULL can upload to any project or agreement. There is no user-level permission check. The token's `user_id` is not checked for project membership. Access depends on the scope and token project only.

SECURITY-3. Upload has no file-type or extension allowlist. The original extension is preserved on disk (`path.extname`). 2 GB limit. Virus scan only runs in the (broken) processing path. See BUG-1: if the scan is never reached, nothing is scanned.

SECURITY-4. Error responses expose `error.message` and `details` (uploadRoutes.js:178, :320, :497) and the auth failure message (apiTokenAuth.js:72). `permanent` delete returns `error.message` (apiTokenRoutes.js:137). The scope check message echoes the required scope.

SECURITY-5. Rate-limit SQL interpolates `rate_window_hours` into the query text (APITokenService.js:178). The value comes from the DB, written from request body `rateWindowHours` without type validation (apiTokenRoutes.js:29). A non-numeric string stored by an admin would be injected. Admin-only, but the input is unvalidated. If the DB column is an integer type the risk is limited by that column type (not verified, see Open questions).

SECURITY-6. Token lookup by an 11-char prefix with `is_active = true` and takes `result.rows[0]` only (APITokenService.js:101-111). If two tokens share a prefix, only the first is tried. Collision is unlikely (7 hex chars after `dfo_`, about 268M values) but is possible. Whether `token_prefix` has a unique constraint was not verified.

SECURITY-7. The `*` wildcard scope is honoured by `hasScope` (APITokenService.js:151), but the UI cannot create it. The API (POST /api/tokens) accepts any scope strings, including `*`.

SECURITY-8. Rate limiting counts upload batches, not requests. Status polling requests (GET endpoints) and failed uploads rejected before batch creation do not consume the limit, but each rate-limit check is a DB query per request.

DUPLICATE-1. `UploadProcessor.processUploadFile` and `UploadWorker.processUploadJob` implement the same pipeline (UploadProcessor.js:11-68; uploadWorker.js:61-140). They differ in extra `queued` and `scanning` steps and progress updates in the worker.

DUPLICATE-2. The inactive-project and parent-inactive checks are copied three times (uploadRoutes.js:88-96, :214-238, :371-402) with the same messages. The queue/fallback block is copied three times. The admin check is copied in six handlers.

DUPLICATE-3. The vendor and internal routes have separate batch creation. The only differences are the target type and the extra checks (parent project is checked only on /internal and /bulk, NOT on /vendor: uploadRoutes.js:88-96 vs :224-238).

DEAD-1. `UploadBatchService.listBatches` (:297-332) has no caller within the area files read (not searched repo-wide; marked as likely).
DEAD-2. `uploadWorker` `job.updateProgress` values are not read by any API.
DEAD-3. `APITokenService.tokenHasUsage` is used only internally by `deleteToken`.

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
1. What `BatchRecordProcessor.processFile` does (staging, catalog entry, ETL trigger, cloud upload) was not traced. It is not described here beyond calling `updateFileStatus` in the object form.
2. Is the `updateFileStatus` string-argument call (BUG-1) really failing in production? There may be a runtime that differs. It needs confirmation by running it.
3. Does `api_tokens.token_prefix` have a unique constraint or index? `rate_window_hours` column type? (Migration lines not fully read.)
4. Where are `upload_staging` and `upload_file_records` created and cleaned? (`upload_staging` has no migration per the inventory.)
5. Who calls `listBatches`? Is anything outside this area using the token service?
6. Does `FileProcessingWorker` pick up files after the upload worker (the comment at uploadWorker.js:103 says so)? How, and who deletes `uploads/programmatic` files that were not profiled?
7. Is `authenticateToken` (backend/middleware/authenticate) the same as the main JWT check? The inventory's `JWT*` footnote was not examined.
8. What are the intended `X-RateLimit` semantics? The reset is always `now + window`.
9. APIDocumentation.jsx content and whether it matches the actual responses (not compared).
