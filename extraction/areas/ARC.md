# ARC - Archives, virus scan & dead-letter queue

## Summary

This area covers six things:
- **Archive detection.** `ArchiveDetectionService` (archiveDetectionService.js) decides whether a file is an archive by magic bytes and extension.
- **Archive extraction.** `ArchiveExtractionService` (archiveExtractionService.js) extracts zip, tar, tar.gz, tar.bz2 and 7z archives. It virus-scans every extracted member and records the attempt in `archive_extractions` and each member in `archive_members`.
- **Password vault.** `PasswordVaultService` (passwordVaultService.js) stores archive passwords with AES-256-GCM in `encrypted_passwords`.
- **ClamAV scanning.** `VirusScanService` (VirusScanService.js) is a singleton that wraps the `clamscan` binary. scripts/init-clamav.sh downloads virus definitions.
- **Dead-letter queue (DLQ).** `DLQService` (dlqService.js) and dlqRoutes.js manage `dlq_jobs`. These rows record failed archive extractions for manual retry or password entry.
- **UI.** The `/failed-jobs` page (FailedJobs.jsx) shows the DLQ. FileCatalog.jsx uses `PasswordInputModal` and `DLQBadge`.

The only producer of DLQ rows is the file-processing worker (PROC area). When the worker extracts an archive and extraction throws, it creates a `dlq_jobs` row (fileProcessingWorker.js:847-921). The worker attempts extraction only for `.zip`, `.tar`, `.tar.gz`, `.tar.bz2`, `.tgz` and `.tbz2`; `.7z` is not in its list (fileProcessingWorker.js:31, :575).

Two HTTP endpoints in server.js are meant to re-run processing of a file: `/api/files/:fileId/password` and `/api/files/:fileId/retry`. Both put the job on a queue that no worker consumes (see Flags). The password endpoint also fails earlier because it references an undefined variable `pool`.

The SQL migrations in `migrations/002-005*.sql` and `backend/migrations/003_dlq_handling_enhancements.sql` are not referenced by any code (grep for the file names finds nothing). The tables exist in the prod schema dump (attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql:4263, :4297, :4532, :4615, :4841, :5587).

## Entry points

### POST /api/files/:fileId/password
- Handler: server.js:4651-4720. Middleware: `authenticateToken` from backend/src/middleware/authenticate.js (server.js:406).
- Caller: FileCatalog.jsx:237-260 → `submitFilePassword` (src/api/fileService.js:416-429), which posts `{ password }`.
  - The catalog shows the lock button only when `file.failure_reason_code === 'password_missing'` (FileCatalog.jsx:531).
  - `PasswordInputModal` sends only a trimmed-non-empty value (PasswordInputModal.jsx:18). It sends the original untrimmed string, not the trimmed one.
- Input: `password` from the body. If it is missing or falsy: 400 `{error:'Password is required'}` (:657-659). There is no other validation.
- Steps as written:
  1. `fileService.getFileById(fileId)` (FileService.js:265-290; `SELECT * FROM files WHERE file_id=$1` plus `file_columns`). If no row: 404 `{error:'File not found'}` (:665-667).
  2. Project access check: direct `project_members` row, or a group membership through `project_access_groups`/`user_groups` (:670-677), run with `pool.query` (:678). Users for whom `userHasAllProjectAccess` (server.js:348-369) is true bypass it. Otherwise: 403 `{error:'Unauthorized to access this file'}` (:680-682).
  3. `passwordVaultService.storePassword('file', fileId, password, userId)` (:684-687).
  4. `queue.addJob('process_file_' + fileId, {fileId, userId, filePath:null, retryWithPassword:true})` (:691-697).
  5. `UPDATE files SET processing_step='processing', failure_reason_code=NULL, processing_error=NULL` (:700-703).
  6. 200 `{success:true, message:'Password submitted successfully. File processing has been requeued.', fileId}` (:707-711).
- Actual behaviour: `pool` is not declared in server.js. The only line that would declare it is commented out at server.js:897, and grep finds no other `pool` binding. Step 2 therefore throws a ReferenceError. The catch returns 500 `{error:'Failed to submit password', details:'pool is not defined'}` (:713-719) for every existing file. Steps 3-6 are never reached.
- If step 2 worked, step 4 would still enqueue into a queue no one consumes (see Flags, BUG).
- Side effects (as written): an `encrypted_passwords` upsert, a queue job, and a `files` update.

### POST /api/files/:fileId/retry
- Handler: server.js:4725-4874. Middleware: `authenticateToken`.
- Callers:
  - DataProfile.jsx:1532 and :1571. Both run only when `file.metadata.s3_bucket` and `s3_key` exist, with the message "Fetching file from S3 and re-profiling..." (:1529, :1569).
  - DataProfile.jsx:4199, after a schema is saved.
  - `retryFileProcessing` in src/api/fileService.js:434-447 has no importer (DEAD).
- Input: path `fileId` only. There is no body.
- Steps:
  1. `getFileById`. 404 if the file is not found (:733-736).
  2. Same project access check as the password route, this time using `dbPool` (:739-751). 403 on failure.
  3. **Fixed-width branch.** Applies when `file.filename.toLowerCase().endsWith('.dat')` (:754) and a `fixed_width_schemas` row exists for the file (:758-761).
     - It lists `uploads/` with `readdirSync` and keeps names ending in `-${filename}` (:770-775). None: 404 `{error:'File not found on disk', details:'Could not find <filename> in uploads directory'}` (:777-783).
     - With several matches it picks the one whose numeric prefix (before the first `-`) is closest to `files.created_at` in ms (:787-800).
     - It reads `metadata.header_config` (:805-809).
     - It POSTs to `${PROFILING_SERVICE_URL || 'http://localhost:8000'}/api/vendor-profile` with `{file_id, local_file_path, filename, header_config}` (:812-817).
     - 200 `{success:true, message:'File re-profiled successfully with custom schema.', fileId, profile}` (:821-826).
     - Any error in this block (including the `readdirSync`): 500 `{error:'Failed to re-profile file', details}` (:827-839).
     - This branch does not change `processing_step`.
  4. **Standard branch.**
     - `queue.addJob('process_file_' + fileId, {fileId, userId, filePath:null, retry:true})` (:845-851).
     - `UPDATE files SET processing_step='processing', failure_reason_code=NULL, processing_error=NULL` (:854-857).
     - 200 `{success:true, message:'File processing has been requeued.', fileId}` (:861-865).
- Errors: 500 `{error:'Failed to retry file processing', details}` (:867-873).
- The route does not check that the file has failed or is an archive. Any file the caller can access can be reset to `processing`.
- The route does not fetch from S3, although DataProfile.jsx tells the user that it does.

### GET /api/dlq-jobs/
- Handler: dlqRoutes.js:9-41. Mounted at server.js:13961 with `authenticateToken` and nothing else. The router uses `pool = require('../db')`, the DI `dbPool` proxy (backend/db.js:6-12).
- Caller: FailedJobs.jsx:47-70, with `page` and `limit=20` (FailedJobs.jsx:17), plus optional `status`, `errorCode`, `fromDate`, `toDate`.
- Query parameters: `status`, `errorCode`, `jobType`, `fromDate`, `toDate`. `page = parseInt || 1` and `limit = parseInt || 50` (:11-22). There is no upper bound and no check for negative values.
- Service: dlqService.js:76-139.
  - Equality filters on `status`, `error_code` and `job_type`; `created_at >= fromDate` and `created_at <= toDate`.
  - `ORDER BY created_at DESC LIMIT/OFFSET`, with offset = `(page-1)*limit`.
- Output: 200 `{success:true, jobs:[dlq_jobs.*], total, page, limit, totalPages: ceil(total/limit)}` (dlqRoutes.js:26-29; dlqService.js:125-131).
- Scope: none. Every user with a valid JWT sees every DLQ row, including `original_payload` (see SECURITY).
- Errors: 500 `{error:'Failed to fetch DLQ jobs', details}` (:36-39).

### GET /api/dlq-jobs/statistics
- Handler: dlqRoutes.js:43-62. No frontend caller (grep of `dlq-jobs` in src finds only FailedJobs.jsx:59, :75, :91, :110).
- Service: dlqService.js:228-253. `SELECT status, error_code, COUNT(*) ... GROUP BY status, error_code ORDER BY count DESC`, plus a total count.
- Output: 200 `{success:true, statistics:{total, byStatusAndError:[{status,error_code,count}]}}`. 500 `{error:'Failed to fetch DLQ statistics', details}`.
- Scope: none (all rows).

### GET /api/dlq-jobs/:id
- Handler: dlqRoutes.js:64-94. No frontend caller.
- `parseInt(req.params.id)`; NaN gives 400 `{error:'Invalid DLQ job ID'}` (:66-70). Because `parseInt` is used, `12abc` is accepted as 12.
- Not found: 404 `{error:'DLQ job not found'}`. Found: 200 `{success:true, job}` (the full row). Error: 500 `{error:'Failed to fetch DLQ job', details}`.
- Scope: none.

### POST /api/dlq-jobs/:id/retry
- Handler: dlqRoutes.js:96-186. Caller: FailedJobs.jsx:72-84. The button is shown when `status !== 'resolved'` (FailedJobs.jsx:279). On success the toast says "Job retry has been queued successfully" (:76), although the work runs synchronously in the request.
- Validation, in order:
  - NaN id: 400.
  - Not found: 404.
  - `status === 'resolved'`: 400 `{error:'Job already resolved', message:'This DLQ job has already been successfully resolved'}` (:110-115).
  - Payload without `archiveFilePath` or `archiveFileId`: 400 `{error:'Invalid job payload', ...}` (:121-126).
- Action:
  - Creates a new `ArchiveExtractionService(pool, VirusScanService singleton, systemLogger)` (:128-134).
  - Calls `extractArchive(payload.archiveFilePath, payload.archiveFileId, payload.password || null, req.user?.id)` (:137-142).
- On success:
  - `updateDLQJobStatus(id, 'resolved', true)`, which sets `status`, increments `retry_count` and sets `resolved_at = CURRENT_TIMESTAMP` (dlqService.js:168-173).
  - 200 `{success:true, message:'Archive extraction retry succeeded', extractedCount, files}` (:153-158). `files` includes each member's server `fullPath`.
- On extraction error:
  - `updateDLQJobStatus(id, 'failed', true)`, which increments `retry_count` and sets `resolved_at = NULL`.
  - 500 `{error:'Archive extraction retry failed', details}` (:160-173).
- Not done on success:
  - no profiling of the extracted files;
  - no update of the `files` row, so `processing_step` stays `password_required` or whatever the worker set;
  - no clean-up of the extraction temp directory (see BUG).
- `max_retries` (default 3) is never checked. `resolved_by` is never set.

### POST /api/dlq-jobs/:id/provide-password
- Handler: dlqRoutes.js:188-303. Caller: FailedJobs.jsx:86-103, from a modal.
  - The modal button is shown for `error_code` `ARCHIVE_PASSWORD_REQUIRED` or `INVALID_PASSWORD` when status is not resolved (FailedJobs.jsx:269).
- Validation, in order:
  - NaN id: 400.
  - `password` missing, not a string, or whitespace only: 400 `{error:'Password is required', message:'Please provide a non-empty password'}` (:197-202).
  - Not found: 404.
  - Resolved: 400 (:210-215).
  - `error_code` not in {`ARCHIVE_PASSWORD_REQUIRED`, `INVALID_PASSWORD`}: 400 `{error:'Password not applicable', message:'This DLQ job failed due to: <code>, not a password issue'}` (:217-222).
  - Payload invalid: 400 (:228-233).
- Action: `extractArchive(archiveFilePath, archiveFileId, password, req.user?.id)` (:246-251).
  - The password is set on the in-memory payload object (:235) but is not saved to the DB or the vault.
- Outcomes:
  - Success: status `resolved` with `retry_count+1`; 200 `{success:true, message:'Archive extraction succeeded with provided password', extractedCount, files}` (:253-267).
  - Error message contains the lowercase substring `password`: 400 `{error:'Incorrect password', message:'The provided password is incorrect. Please try again.', details}` (:270-276). Status and `retry_count` are unchanged.
  - Any other error: status `failed` with `retry_count+1`; 500 `{error:'Archive extraction failed', details}` (:278-289).
- The same omissions as /retry apply: no profiling, no `files` update, no temp clean-up.

### DELETE /api/dlq-jobs/:id
- Handler: dlqRoutes.js:305-340. Caller: FailedJobs.jsx:105-119, after `window.confirm`.
- `DELETE FROM dlq_jobs WHERE id=$1 RETURNING id` (dlqService.js:205-226). Not found: 404. Deleted: 200 `{success:true, message:'DLQ job deleted successfully'}`. Error: 500 `{error:'Failed to delete DLQ job', details}`.
- Scope: none. Any authenticated user can delete any DLQ row. The extracted or uploaded files are not touched.

### FE /failed-jobs (FailedJobs.jsx)
- Route: src/App.jsx:413, `<ProtectedRoute>` with no permission prop.
- No sidebar or component link points to it (grep of `failed-jobs`/`dlq` in src/components finds nothing).
- Page title: "Failed Archive Extraction Jobs" (FailedJobs.jsx:150).
- Filters (:153-209):
  - Status: All, pending, failed, resolved.
  - Error type: ARCHIVE_PASSWORD_REQUIRED, INVALID_PASSWORD, FILE_SIZE_EXCEEDED, UNSUPPORTED_FORMAT, CORRUPTED_ARCHIVE, VIRUS_DETECTED.
  - From and To date (`<input type=date>`, sent as `YYYY-MM-DD`).
  - Filters re-fetch on change (`useEffect` on `[page, filters]`, :43-45). The "Apply Filters" button re-fetches again.
- Table columns (:226-233): Job ID; "File Name" (actually `payload.archiveFileId`, :251); Error Type badge; Error Message plus remediation; Status; Retry Count; Created At (`toLocaleString`).
- Actions per row:
  - key icon (provide password, when the condition above holds);
  - retry (if not resolved);
  - delete (always).
- Pagination: `Math.ceil(total/20)` (:309).

### Script scripts/init-clamav.sh
- Trigger: `VirusScanService.initializeVirusDefinitions()` runs `exec('bash <path>', {timeout:300000})` (VirusScanService.js:79-100). This happens when `/home/runner/.clamav` has neither `main.cvd/cld` nor `daily.cvd/cld` (VirusScanService.js:157-164).
- Behaviour:
  - Target directory: `CLAMAV_DIR="/home/runner/.clamav"` (:7).
  - It checks `main.cvd`, `daily.cvd` and `bytecode.cvd`. An update is needed if any is missing or older than 7 days (`find -mtime +7`) (:40-48). If none is needed: exit 0 (:50-54).
  - For each file it downloads from `https://packages.microsoft.com/clamav` (:8). On failure it falls back to `http://database.clamav.net/` (:67).
  - Each URL gets 3 attempts with `sleep 2`, curl `--connect-timeout 30 --max-time 300` (:16-34).
  - Success (exit 0) requires both `main.cvd` and `daily.cvd` (:74). Otherwise exit 1 (:92-96).
  - The "verification" step runs `clamscan --database=... --version` and only warns on failure (:84-88).
  - `download_success` is set (:60, :64) but never read.

### Internal entry: archive handling in the file-processing worker (PROC-owned, ARC behaviour)
- Every queued file is virus-scanned first (fileProcessingWorker.js:468-511).
  - Infected: throws `Virus detected: <names>`, which goes to the general failure path and is categorised `virus_detected` (:114-118, :1449-1453).
  - Skipped scans and scan errors are allowed through. `metadata.virus_scan_status` is set to `skipped` or `completed` (:490-495, :506-510).
- Archive branch: `getFileExtension(filePath)` normalises `.tgz`→`.tar.gz` and `.tbz2`→`.tar.bz2` (:74-79). The branch runs only for the extensions in :31.
- Password lookup, when the job has no `archivePassword` (:609-685):
  1. If `agreementId` is set: active `vendor_agreement_file_schemas` ordered by `priority ASC`. Each `file_name_pattern` is converted to a regex (escape `.`, `*`→`.*`, `?`→`.`, case-insensitive, anchored). The first schema matching `originalName` wins, and its password comes from vault entity `vendor_agreement_file_schema` (:613-666).
  2. Otherwise, or if that finds nothing: vault entity `file`/`fileId` (:670-677).
  3. Any vault error is logged, and processing continues with no password (:678-685).
- Extraction success (:694-846):
  - It picks the first extracted file that is not `__MACOSX`, `._*` or `/._` (:708-713).
  - It profiles that file with the Flask profile API (:724-732).
  - It writes `row_count`, `column_count`, `schema_definition` and `processing_step='complete'` onto the **parent archive's** `files` row (:742-756), and saves columns and preview.
  - If profiling fails, it still sets `processing_step='complete'` (:783-786).
  - It removes the temp directory (:801-816) and completes the job (:819-825).
  - Only the first data file is profiled. Other members get no `files` row.
- Extraction failure (:847-921):
  - **Password branch.** Applies when `categorizeError` returns `password_missing`, or the message contains `password` or `encrypted` (case-insensitive) (:857-859).
    - `createDLQJob('archive_extraction', {archiveFilePath:filePath, archiveFileId:fileId, userId}, err, 'Provide the correct password for this password-protected archive')` (:861-870).
    - `UPDATE files SET processing_step='password_required', metadata.password_required=true` (:875-878).
    - `failJob` and return (:881-902). `failure_reason_code` and `processing_error` are not set, and the uploaded file is not removed in this branch.
  - **Other failures.**
    - `createDLQJob('archive_extraction', {archiveFilePath, archiveFileId, userId, password: archivePassword || null}, err, actionableMessage)` (:905-915).
    - Processing then continues with the whole archive through the Flask API (:917-945). Python's `load_archive` (profile_api.py:991-1156) extracts again on its own.

## Business rules (with literal values)

- **Archive size limit.** 25 MB (`MAX_FILE_SIZE = 25 * 1024 * 1024`, archiveExtractionService.js:11). It is checked on the compressed archive only (:118-121). Message: `Archive size <x.xx> MB exceeds maximum limit of 25 MB`.
- **No limit on uncompressed member size or member count** in the Node extractors (archiveExtractionService.js:306-769). Python's tar path skips members larger than 2 GB (profile_api.py:1070).
- **Detection order** (archiveDetectionService.js:35-67), checked against the first 16 bytes (`readFileHeader(filePath, 16)`, :28):
  1. ZIP `50 4B 03 04` / `50 4B 05 06` / `50 4B 07 08` gives `zip`.
  2. 7z `37 7A BC AF 27 1C` gives `7z`.
  3. RAR v4 or v5 gives `rar`.
  4. GZIP `1F 8B` gives `tar.gz` if the name ends `.tar.gz` or `.tgz`, else `gzip`.
  5. BZIP2 `42 5A` (`"BZ"`) gives `tar.bz2` if the name ends `.tar.bz2` or `.tbz2`, else `bzip2`.
  6. Extension `.tar` gives `tar` (there is no magic check).
  7. Any other extension in `['.zip','.7z','.tar','.gz','.bz2','.tgz','.tbz2','.rar']` gives the extension without the dot.
- **Supported for extraction:** `['zip','7z','tar','tar.gz','tar.bz2','tgz','tbz2']` (:18). `rar`, `gzip` and `bzip2` give `Archive format <t> is not supported` (archiveExtractionService.js:114-116).
- **Password detection** (archiveDetectionService.js:84-128). This is informational only: `extractArchive` records it in `archive_extractions.is_encrypted/password_required` (:126-130) but does not gate on it.
  - zip: any entry with `generalPurposeBitFlag & 0x01` (:153).
  - 7z: heuristic on header bytes (:188-234; see BUG).
  - rar: always "encrypted" (:93-98).
  - tar family: never encrypted (:100-107).
- **ZIP extraction.**
  - Without a password: yauzl (:314-396). Directory entries are skipped. Entries whose name contains `..` anywhere, or is absolute, are skipped. Output name is `path.basename`. An encrypted entry without a password gives `ARCHIVE_PASSWORD_REQUIRED: Archive contains encrypted entries but no password was provided` (:350-353).
  - With a password: `python3 -c <pyzipper script>` (:399-532). It skips directories, names containing `..`, `._*` and `__MACOSX`. Repeated basenames get an `N_` prefix (:447-452). A wrong password gives `ARCHIVE_PASSWORD_REQUIRED: Incorrect password provided` (:469-471). The sentinel `__NO_PASSWORD__` means no password (:425, :482).
- **TAR extraction** (tar, tar.gz via gunzip-maybe, tar.bz2 via the `bunzip2 -c` binary). Only `header.type === 'file'` entries are extracted. Names containing `..` and absolute paths are skipped. Output name is `basename` (:534-723). The `bunzip2` exit code is not checked (:712-721).
- **7z extraction.** `node-7z-archive.extractFull(path, dir, {password?})` (:725-769). Afterwards only top-level regular files in the output directory are reported (:739-753). An error message containing `password` or `encrypted` gives `ARCHIVE_PASSWORD_REQUIRED: ...` (:762-763).
- **Per-member processing.**
  - Members are processed in batches of `CONCURRENCY_LIMIT = 5` (:175, :249-255). For each: virus scan, SHA-256 checksum and stat run in parallel (:179-183).
  - Infected member: the file is deleted and the member dropped. Extraction still succeeds (:185-193).
  - Skipped scan: a warning only (:195-201).
  - If `archiveFileId` is set, it inserts `archive_members(parent_file_id, logical_name=relativePath, original_name=basename, file_format=ext, file_size_bytes, extraction_status='completed', extracted_at=now)` (:782-801). The returned `fileId` is `archive_members.id`, not a `files.file_id` (:215).
  - Any per-member error deletes the member and drops it (:237-245).
- **Extraction record.** Written only when `archiveFileId` is truthy (:125-136).
  - Created with `extraction_status='in_progress'`, `started_at=NOW()` and `password_required = is_encrypted` (:26-39).
  - Updated to `completed` with `extracted_count` (:257-264), or `failed` with `error_message` (:279-285).
  - The temp directory is `uploads/archive_extraction/extract_<Date.now()>_<8 hex>` (:12, :138). It is never removed by the service (:289-303).
- **DLQ error classification** (dlqService.js:9-35). Case-sensitive substring tests in this order:
  1. `ARCHIVE_PASSWORD_REQUIRED` gives `ARCHIVE_PASSWORD_REQUIRED`, with message `Archive is password-protected but no password was provided`.
  2. `password` or `encrypted` gives `INVALID_PASSWORD`.
  3. `size` and `exceed` give `FILE_SIZE_EXCEEDED`, with remediation "Archive exceeds the 25 MB size limit...".
  4. `Unsupported archive type` or `not supported` gives `UNSUPPORTED_FORMAT`.
  5. `corrupt` or `invalid` gives `CORRUPTED_ARCHIVE`.
  6. `virus` or `malware` gives `VIRUS_DETECTED`.
  7. Otherwise `UNKNOWN_ERROR`.

  The caller's remediation is used only for `UNKNOWN_ERROR` (:33-34). Matched codes get fixed texts (:16, :20, :23, :26, :29, :32). New rows have `retry_count=0` and `status='pending'` (:44-56). `file_id`, `project_id`, `vendor_agreement_id` and `stack_trace` are never written.
- **DLQ status transitions** (dlqService.js:163-203; dlqRoutes.js):
  - Statuses: `pending` (create), `resolved` (successful retry or password), `failed` (failed retry).
  - Allowed moves: `pending`/`failed` → `resolved` or `failed`. Only `resolved` is terminal; the routes refuse to act on it.
  - `in_progress` and `abandoned` appear only in the migration comment (migrations/003_dlq_system.sql:20) and are never set.
  - `resolved_at` is set on `resolved` and cleared otherwise.
- **File failure reasons** (worker `categorizeError`, fileProcessingWorker.js:110-222). Lowercased message tests, first match wins:
  1. `virus_detected`: virus, malware, infected.
  2. `password_missing`: password plus required, protected or encrypted.
  3. `clamav_unavailable`.
  4. `unsupported_encoding`.
  5. `extraction_failed`: extract, unzip, decompress, corrupt.
  6. `schema_validation_failed`.
  7. `empty_file`, `header_only_file`, `header_validation_failed`, `vendor_validation_failed`.
  8. `conversion_failed`.
  9. `malformed_file`.
  10. Default: `conversion_failed`.

  The DB enum `file_failure_reason` holds only `virus_detected, password_missing, unsupported_encoding, conversion_failed, extraction_failed, clamav_unavailable, malformed_file, schema_validation_failed` (backend/migrations/003_dlq_handling_enhancements.sql:6-15; prod schema :9-17).
- **DLQBadge labels** (DLQBadge.jsx:6-55):

  | Code | Label |
  |---|---|
  | virus_detected | Virus Detected |
  | password_missing | Password Required |
  | unsupported_encoding | Encoding Error |
  | conversion_failed | Conversion Failed |
  | extraction_failed | Extraction Failed |
  | clamav_unavailable | Security Check Failed |
  | malformed_file | Invalid Format |
  | schema_validation_failed | Schema Mismatch |

  Any other code, or none, shows "Failed". FileCatalog shows the badge only when `processing_error` is set (FileCatalog.jsx:465-484).
- **Vault crypto** (passwordVaultService.js).
  - `aes-256-gcm`, 12-byte random IV, 16-byte tag (:3-5, :39-59).
  - Key: `VAULT_ENCRYPTION_KEY`. It must exist and match `/^[0-9a-f]{64}$/i`, otherwise the constructor throws (:14-28).
  - Storage: hex ciphertext, IV and tag; `encryption_version='v2'` on insert (:110-124).
  - Upsert on `(entity_type, entity_id)` replaces ciphertext, IV, tag, `created_by` and `created_at`, but not `encryption_version` (:115-121).
  - Decryption: if there is no tag, it falls back to legacy `aes-256-cbc`, zero-padding a 12-byte IV to 16 bytes (:83-92).
  - `retrievePassword` also sets `last_accessed_at` (:169-175).
  - The audit calls (`password_vault_store`, `_retrieve`, `_delete`) run only if the injected `auditService.logAction` exists (:127-140, :186-199, :236-249).
- **Vault entity types in use:**
  - `file`: server.js:3148, :4687; fileProcessingWorker.js:671.
  - `vendor_agreement_file_schema`: fileProcessingWorker.js:648; vendorAgreementFileSchemaRoutes.js:412, :677, :929; FastSchemaValidationService.js:835; jobExecutionEngine.js:564.
  - `vendor_agreement`: vendorAgreementRoutes.js:1916; read only by jobExecutionEngine.js:570-575.
- **Virus scan policy (Node, VirusScanService.js).** Fail-open.
  - `DISABLE_VIRUS_SCAN === 'true'` disables scanning (:24).
  - The binary is found with `which clamscan` (:33). The definitions path is hardcoded to `/home/runner/.clamav` (:132, :157).
  - `NodeClam` runs with `removeInfected:false`, `quarantineInfected:false`, the clamscan binary, and no daemon (:184-198).
  - Disabled, unavailable, or any scan error gives `{isInfected:false, skipped:true}` (:228-241, :279-307).
  - Definitions count as present if **either** main **or** daily exists (:55-62).
- **Virus scan policy (Python, profile_api.py:452-505).** Fail-closed if enabled: a missing binary or exit code ≥2 raises. It is disabled by `DISABLE_VIRUS_SCAN == 'true'`, and that variable defaults to `'true'` when started by productionBootstrap.js:38 and in .replit:65.

## Data touched

| Table / resource | Access | Where |
|---|---|---|
| `dlq_jobs` | INSERT, SELECT, UPDATE status/retry_count/resolved_at, DELETE | dlqService.js:37-57, :112-123, :143-146, :169-182, :207-210, :230-240 |
| `archive_extractions` | INSERT, UPDATE | archiveExtractionService.js:28-39, :71-78 |
| `archive_members` | INSERT (service, correct columns) | archiveExtractionService.js:786-798 |
| `archive_members` | INSERT (worker, non-existent columns) | fileProcessingWorker.js:2234-2241 |
| `file_processing_artifacts` | INSERT (worker, non-existent columns) | fileProcessingWorker.js:2175-2183 |
| `encrypted_passwords` | upsert, update `last_accessed_at`, delete, select, `rotation_scheduled_at` | passwordVaultService.js:112-124, :169-175, :228-231, :276-279, :301-306 |
| `encrypted_passwords` | direct SELECT (bypassing the service) | jobExecutionEngine.js:561-575 |
| `encrypted_passwords` | direct DELETE | connectionRoutes.js:730 |
| `files` | UPDATE `processing_step`, `failure_reason_code`, `processing_error` | server.js:4700-4703, :4854-4857 |
| `files` | UPDATE `processing_step='password_required'` and metadata | fileProcessingWorker.js:875-878 |
| `files`, `file_columns` | SELECT | FileService.js:270-286 |
| `project_members`, `project_access_groups`, `user_groups` | SELECT (access check) | server.js:4670-4678, :4739-4747 |
| `fixed_width_schemas` | SELECT | server.js:4758-4761 |
| `processing_events` | none (no code reads or writes it) | migrations/002:64 |
| Filesystem `uploads/archive_extraction/extract_*` | created, never removed by service or DLQ routes | archiveExtractionService.js:12, :138-139 |
| Filesystem `uploads/` | listed by /retry | server.js:4770-4775 |
| Filesystem `/home/runner/.clamav/*.cvd` | written by init script | init-clamav.sh:7, :62-71 |
| External: `python3` + pyzipper, `bunzip2`, `clamscan`, 7z binary (through node-7z-archive) | spawned | archiveExtractionService.js:478, :712, :726; VirusScanService.js:33 |
| External: Flask `/api/vendor-profile` | POST | server.js:812 |
| External: Microsoft mirror and database.clamav.net | HTTP(S) download | init-clamav.sh:8, :67 |
| Queue | `addJob('process_file_<id>')` | server.js:4692, :4846 |

The `files` archive columns `is_archive`, `archive_format`, `is_password_protected`, `member_count` and `parent_archive_id` are added by migrations/002:113-118. Grep finds no JS or Python code that writes them.

## Flags

### BUG
- **`pool is not defined` in the password route.** server.js:4678 and :4700 use `pool`, which is never declared in server.js. The declaration is commented out at :897. POST /api/files/:fileId/password therefore always answers 500 for an existing file, and the FileCatalog password flow cannot succeed.
- **Re-queued jobs go to a queue nobody consumes.**
  - `queue.addJob(queueName, data, options)` takes the queue name first (MemoryQueue.js:39; RedisQueue.js:47).
  - The password and retry routes pass `process_file_${fileId}` as the queue name (server.js:4692, :4846).
  - The worker listens only on `'file-processing'` (fileProcessingWorker.js:250, :272, :277), and every other producer uses that name (server.js:3227, :4496, :8912; fileProcessingWorker.js:380).
  - Result: the standard /retry flow sets `processing_step='processing'` and then nothing runs, so the file stays in `processing`.
  - Even if the job were consumed, `filePath: null` would reach `getFileExtension(null)` (fileProcessingWorker.js:74-75) and `virusScanService.scanFile(null)` (:472). The flags `retry` and `retryWithPassword` are not read anywhere in the worker (grep).
- **DLQ resolution does not finish file processing.** /retry and /provide-password only extract (dlqRoutes.js:137-142, :246-251). They do not profile, do not update the parent `files` row (which stays `password_required` from fileProcessingWorker.js:877), and do not remove the extraction temp directory. `extractArchive` explicitly leaves clean-up to the caller (archiveExtractionService.js:289-303). UploadCleanupWorker deletes only regular files directly in `uploads/` (uploadCleanupWorker.js:39-50), so `uploads/archive_extraction/extract_*` directories created from DLQ routes stay on disk indefinitely.
- **The DLQ payload points at a temporary upload path.** `archiveFilePath` is the multer upload path (fileProcessingWorker.js:864, :908). UploadCleanupWorker deletes files in `uploads/` older than 1 h (server.js:55-59; uploadCleanupWorker.js:46-49). A DLQ retry more than an hour after upload therefore fails with an ENOENT from `readFileHeader`, wrapped as `Failed to detect archive type: ...` (archiveDetectionService.js:76-80).
- **The worker's archive-member and artifact inserts use columns that do not exist.** `trackArchiveMembers` inserts `member_id, file_id, member_name, member_size, is_directory, extracted` (fileProcessingWorker.js:2235-2237). `trackProcessingArtifact` inserts `artifact_id, file_id, artifact_type, artifact_name` (:2176-2178). The actual tables have different columns (migrations/002:7-37; prod schema :4297-4311, :4841-4852). The errors are caught as a warning (:1097-1099).
  - Separately, the worker tests `format_specific.archive_members`, while Python returns `member_manifest` and `profiled_member` (profile_api.py:1143-1148). So `trackArchiveMembers` is not reached from that path.
- **Basename collisions overwrite extracted members.** The yauzl and tar extractors write every entry to `outputDir/basename(entry)` (archiveExtractionService.js:344-345, :553-554, :613-614, :675-676). Two entries `a/data.csv` and `b/data.csv` overwrite each other, yet both are reported with the same `fullPath`. Only the pyzipper path de-duplicates names (:447-452).
- **DLQ retry after partial success hits a unique constraint.** `archive_members` has `UNIQUE(parent_file_id, logical_name)` (migrations/002:36). Re-extracting the same archive with an `archiveFileId` hits that constraint for each member already recorded. The per-member catch then deletes the extracted file and drops it (archiveExtractionService.js:237-245), so the retry can report fewer, or zero, files.
- **The 7z encryption heuristic almost always says "encrypted".** It reports encryption if any byte `0x06` or `0x17` occurs in up to 200 bytes from offset 12 (archiveDetectionService.js:209-227). Those bytes include header offset and CRC fields and packed data. It also reads the whole file into memory (:189). The result only feeds `archive_extractions.is_encrypted/password_required` (archiveExtractionService.js:126-130).
- **The detection service is constructed with the wrong arguments in the worker.** `new ArchiveDetectionService(dbPool, logger)` (fileProcessingWorker.js:53), but the constructor takes `(logger)` (archiveDetectionService.js:22-24). This instance is never used (grep shows no `this.archiveDetectionService.` call).
- **Password-required archives get no catalog password button.** The worker's password branch sets `processing_step='password_required'` but not `failure_reason_code` or `processing_error` (fileProcessingWorker.js:875-878). FileCatalog shows the badge only when `processing_error` is set (FileCatalog.jsx:465), and shows the lock button only for `failure_reason_code === 'password_missing'` (:531). Only the unlinked /failed-jobs page offers password entry for these files.
- **The vault method `getPassword` does not exist.** vendorAgreementFileSchemaRoutes.js:517 calls `passwordVaultService.getPassword`, but the service defines only `retrievePassword` (passwordVaultService.js:167). The TypeError is caught (:522-524). The old schema passwords are then deleted (:529-536), so passwords meant to be kept with `__KEEP_EXISTING__` are lost. This code is in the VAS area; it is recorded here because it misuses the vault API.
- **Failure codes outside the DB enum.** `categorizeError` returns `empty_file`, `header_only_file`, `header_validation_failed` and `vendor_validation_failed` (fileProcessingWorker.js:164-198). These are not in the `file_failure_reason` enum (backend/migrations/003_dlq_handling_enhancements.sql:6-15). `saveFailedFileMetadata` writes the code into `failure_reason_code` (:2135, :2162), so for those codes the insert would fail. It is caught at :1459-1463.
- **DLQ `toDate` excludes the selected day.** FailedJobs.jsx sends `toDate` as `YYYY-MM-DD` (FailedJobs.jsx:196-202), compared as `created_at <= toDate` (dlqService.js:105-107). That is midnight at the start of the selected day, so jobs created later that day are excluded.
- **Log field name mismatch.** Logs use `f.filename` on extracted files (fileProcessingWorker.js:704, :840), but the objects have `fileName`. These log fields are always undefined.
- **`.tbz2` is not handled by the Flask fallback.** The worker treats `.tbz2` as an archive (:31, :78). Flask `get_file_extension` returns `.tbz2` (profile_api.py:1164-1167), and `profile_vendor_file` accepts only `['.zip','.tar','.tar.gz','.tar.bz2','.tgz']` (:1212). So the Flask fallback raises `Unsupported file type: .tbz2`.

### DUPLICATE
- **Archive extraction exists four times:**
  - archiveExtractionService.js (Node yauzl, tar-stream, bunzip2, node-7z, and Python pyzipper for password zips);
  - profile_api.py `load_archive` (:991-1156): zip and tar only, no 7z, skips tar members over 2 GB, chunked reads, its own ClamAV scan of the whole archive;
  - FastSchemaValidationService.js `extractArchiveContents`/`extractZipWithPython` (:981-1009, :1014+): zip, tar, tar.gz, tgz and 7z, no tar.bz2, its own pyzipper script;
  - jobExecutionEngine.js, which reuses ArchiveExtractionService but with a mock virus scanner (:284-289, :2922-2927).
- **Three near-identical tar extractors** in one file: `extractTar`, `extractTarGz`, `extractTarBz2` (archiveExtractionService.js:534-592, :594-654, :656-723). They differ only in the input stream.
- **Archive extension lists differ:**

  | Where | List |
  |---|---|
  | archiveDetectionService.js:19 | `.zip,.7z,.tar,.gz,.bz2,.tgz,.tbz2,.rar` |
  | fileProcessingWorker.js:31 | `.zip,.tar,.tar.gz,.tar.bz2,.tgz,.tbz2` (no 7z) |
  | FastSchemaValidationService.js:27 | `.zip,.7z,.tar,.tar.gz,.tar.bz2,.tgz,.tbz2` |
  | jobExecutionEngine.js:33 | `zip,7z,tar,gz,tgz,bz2,tar.gz,tar.bz2` |
  | profile_api.py:1212 | `.zip,.tar,.tar.gz,.tar.bz2,.tgz` |

- **Vendor-agreement password lookup exists three times:**
  - Worker (fileProcessingWorker.js:613-666): first pattern match, `priority ASC`, no fallback.
  - jobExecutionEngine `getArchivePasswordFromVault` (:521-606): `priority ASC NULLS LAST`. If no pattern matches it falls back to the **first schema**, then to the `vendor_agreement` entity. It decrypts directly from SQL rather than through `retrievePassword`, so `last_accessed_at` is not updated and no audit is written.
  - FastSchemaValidationService `getArchivePasswords`/`findPasswordForFile` (:821-887): loads every schema password and uses `matchesPattern`.
- **Virus scanning has two implementations with opposite failure policies.** Node `VirusScanService` is fail-open (VirusScanService.js:279-307). Python `scan_file_with_clamav` is fail-closed but disabled by default (profile_api.py:461-505; productionBootstrap.js:38).
- **Error classification exists three times, with different code sets:**
  - `DLQService.createDLQJob`: upper-case codes, case-sensitive (dlqService.js:13-35).
  - Worker `categorizeError`: snake_case codes, lowercased (fileProcessingWorker.js:110-222).
  - DLQ route "incorrect password" test: lowercase `password` (dlqRoutes.js:270).
  - Password-related names in use: `ARCHIVE_PASSWORD_REQUIRED` / `INVALID_PASSWORD` (DLQ), `password_missing` (files), `password_required` (processing_step), `PASSWORD_REQUIRED` / `PASSWORD_INVALID` (migration comment, migrations/003_dlq_system.sql:14), `awaiting_password` (enum value, migrations/002:90).
- **The project-access SQL is copy-pasted** in server.js:4670-4677 and :4739-4746.
- **DLQ /retry and /provide-password repeat the same payload parse, service construction and extraction block** (dlqRoutes.js:117-142 vs :224-251).

### DEAD
- `processing_events` table: no reader or writer (grep).
- `files.is_archive`, `archive_format`, `is_password_protected`, `member_count`, `parent_archive_id` and the `file_status` enum values `awaiting_password`, `extraction_failed`, `extracting` (migrations/002:84-118): never written (grep).
- `VirusScanService.reset()`, `getVersion()`, `isAvailable()` (VirusScanService.js:107-113, :315-339): no callers (grep).
- The "unavailable but definitions now exist" re-check (VirusScanService.js:131-137) can never run after a failed init. It requires `!this.initPromise`, and `initPromise` is never cleared except by the uncalled `reset()`. Once initialisation fails, scanning is skipped for the life of the process.
- `PasswordVaultService.scheduleRotation` (passwordVaultService.js:299-323): no callers. `rotation_scheduled_at` is never acted on.
- Unused imports: `fileType` (archiveDetectionService.js:3) and `unzipper` (archiveExtractionService.js:5).
- `this.archiveDetectionService` in the worker (fileProcessingWorker.js:53): never used.
- `GET /api/dlq-jobs/statistics` and `GET /api/dlq-jobs/:id`: no frontend caller.
- `retryFileProcessing` (src/api/fileService.js:434-447): no importer.
- `dlq_jobs` columns `file_id`, `project_id`, `vendor_agreement_id`, `stack_trace`, `max_retries`, `resolved_by`, `resolution_notes` (migrations/003_dlq_system.sql:10-25): never written.
- The SQL migrations `migrations/002-005*.sql` and `backend/migrations/003_dlq_handling_enhancements.sql` are not referenced by any runner (grep).
- DI auto-registers `passwordVaultService`, `dlqService` and `archiveDetectionService` (backend/di/services.js:21-60). Only `passwordVaultService` is fetched from DI (server.js:3147, :4684).
  - It is built as `new PasswordVaultService(dbPool, logger)`, so the winston `systemLogger` is passed as `auditService` and `this.logger` falls back to `console` (passwordVaultService.js:8-11).
  - `systemLogger` has no `logAction` (grep of backend/utils/logger.js), so vault operations through DI are never audited.

### SECURITY
- **The DLQ has no authorization or scoping.** All six `/api/dlq-jobs` routes need only a valid JWT (server.js:13961). Any authenticated user can list, read, retry, supply passwords for, or delete any tenant's DLQ jobs (dlqRoutes.js:9-340). DLQ rows carry no `project_id` or `file_id` to scope by (dlqService.js:38-56).
- **Plaintext archive passwords are stored in `dlq_jobs.original_payload`.** For non-password extraction failures the worker stores `password: archivePassword || null` (fileProcessingWorker.js:911). `GET /api/dlq-jobs` returns `SELECT *` (dlqService.js:119) to any authenticated user.
- **Server filesystem paths are exposed.** `original_payload.archiveFilePath` (fileProcessingWorker.js:864, :908) and `files[].fullPath` in retry responses (dlqRoutes.js:157, :266) go to clients.
- **Passwords are visible on process command lines.** Archive passwords are passed as argv to `python3 -c` (archiveExtractionService.js:478-483; FastSchemaValidationService.js:1055), which makes them visible to other local users through the process list.
- **No decompression-bomb protection** in the Node extractors. Only the compressed size is limited to 25 MB (archiveExtractionService.js:118-121). The pyzipper script reads each member fully into memory with `source.read()` (:456-458).
- **The 7z extraction has no path-traversal filter.** It relies on `extractFull` (archiveExtractionService.js:730). zip and tar filter `..` and absolute paths (:336, :545, :605, :667).
- **Virus scanning fails open.** Any ClamAV error, missing binary, missing definitions or `DISABLE_VIRUS_SCAN=true` lets files through as `{isInfected:false, skipped:true}` (VirusScanService.js:228-241, :279-307). The worker records only a metadata flag (fileProcessingWorker.js:490-510).
- **ETL and visual-mapping archive extraction is never virus-scanned.** It injects a mock scanner that always returns `skipped` (jobExecutionEngine.js:284-286, :2922-2924).
- **Virus definitions have an unauthenticated download fallback.** The fallback uses plain `http://database.clamav.net/` (init-clamav.sh:67). The only check is `clamscan --version`, which does not validate the database (:84-88).
- **/retry can reset any accessible file.** It resets `processing_error` and `failure_reason_code` with no check of the file's state (server.js:4854-4857), and the file is never re-processed (see BUG).
- **Vault passwords are never deleted after use.** PasswordInputModal tells users passwords "are automatically deleted after successful extraction" (PasswordInputModal.jsx:94-95). No code deletes `file`-entity vault rows (grep of `deletePassword` finds only `vendor_agreement_file_schema` callers and the `vendor_agreement` DELETE route).

### UNCLEAR
- Whether DLQ "resolved" is meant to complete processing of the parent file. Today it only extracts files to a temp directory (dlqRoutes.js:137-158).
- Whether `rar` being always "encrypted" (archiveDetectionService.js:93-98) is intentional, given that rar is unsupported for extraction anyway (:18).
- Whether skipping every entry whose name contains `..` anywhere (for example `report..final.csv`) is intended (archiveExtractionService.js:336, :545).
- BZIP2 detection uses only the 2-byte magic `BZ` (archiveDetectionService.js:11, :54). A non-archive file whose first bytes are `BZ` is classified as `bzip2`, which is "unsupported". Only reachable where detection runs on non-archive extensions; current callers pass archive files only.
- Glob-to-regex conversion in the worker and jobExecutionEngine escapes only `.` (fileProcessingWorker.js:628-632; jobExecutionEngine.js:543-548). Patterns containing `(`, `+`, `[` and similar behave as regex or throw (caught at fileProcessingWorker.js:678).
- /retry's fixed-width branch picks the upload file by the timestamp closest to `created_at` (server.js:787-800). The intent when several uploads share a filename is not documented.
- No pagination bounds on `/api/dlq-jobs`. `limit` is unbounded, and a negative `page` or `limit` reaches SQL (dlqRoutes.js:19-22; dlqService.js:78-79).

## Domain terms
- **DLQ job** (code), also called **failed job** (UI title "Failed Archive Extraction Jobs", route `/failed-jobs`) or **dead letter queue**. Table `dlq_jobs`. `job_type` is always `archive_extraction` in practice (fileProcessingWorker.js:862, :906).
- **Error code** (DLQ, upper case: `ARCHIVE_PASSWORD_REQUIRED`, `INVALID_PASSWORD`, `FILE_SIZE_EXCEEDED`, `UNSUPPORTED_FORMAT`, `CORRUPTED_ARCHIVE`, `VIRUS_DETECTED`, `UNKNOWN_ERROR`) is not the same as **failure reason code** (files, snake_case, `failure_reason_code`). The UI calls both "Error Type" or "DLQ badge".
- **Remediation instructions**: the human text on a DLQ row.
- **Archive / parent archive / container**: the uploaded file. **Archive member / extracted file / logical name**: an entry inside it (`archive_members.logical_name` is the path inside the archive). **Primary data file / profiled member**: the first member that gets profiled.
- **Extraction record / extraction attempt**: a row in `archive_extractions`.
- **Password vault / vault / encrypted password**: table `encrypted_passwords`. Entity types: `file`, `vendor_agreement_file_schema`, `vendor_agreement`. **Ad-hoc password**: supplied at upload (`archive_password` body field, server.js:2710). **Agreement / schema password**: stored per agreement file schema.
- Password-state names for the same situation: `password_required` (processing_step), `password_missing` (failure code), `ARCHIVE_PASSWORD_REQUIRED` / `INVALID_PASSWORD` (DLQ), `awaiting_password` (unused enum), `failed_password_required` (audit status, fileProcessingWorker.js:891).
- **Virus scan status**: `completed` or `skipped` in `files.metadata.virus_scan_status`. "Skipped" covers disabled, unavailable and errored.
- `processing_step` values written in this area: `processing`, `password_required`, `complete`, `analyzing`, `failed`.

## Open questions
- Does `node-7z-archive` export `extractFull` returning an event stream with `data`, `end` and `error`, as archiveExtractionService.js:730-767 assumes? node_modules is not present in the workspace, so the dependency could not be inspected (package.json:94 declares `^1.1.7`).
- `updateDLQJobStatus` uses `$1` both as `SET status = $1` and in `CASE WHEN $1 = 'resolved'` (dlqService.js:169-179). Whether PostgreSQL infers consistent types for both uses (varchar vs text) cannot be confirmed without running it.
- `authenticateToken` admits every JWT holder. Whether vendor-portal users hold JWTs that pass it, and can therefore reach `/api/dlq-jobs`, is in the SEC and VND areas and was not traced here.
- Whether any deployment sets `DISABLE_VIRUS_SCAN` for the Node process. Only the Python process gets a default (`'true'`, productionBootstrap.js:38; .replit:65). The Node service reads the raw env var (VirusScanService.js:24).
- Whether legacy `v1` (CBC) vault rows exist in production. If they do, it is unknown whether their IVs are 16 bytes or 12 bytes (zero-padded on decrypt, passwordVaultService.js:86).
- Whether the hardcoded ClamAV definitions path `/home/runner/.clamav` (VirusScanService.js:132, :157; init-clamav.sh:7) exists outside Replit.
