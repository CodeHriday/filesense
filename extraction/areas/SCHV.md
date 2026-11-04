# SCHV - Bulk schema validation jobs

## Summary
Users pick a storage connection, S3 path, and vendor agreement. The UI discovers files through the BULK endpoint `/api/bulk-profiling/discover` (SchemaValidationTab.jsx:238). It then POSTs a job that carries the explicit file list (SchemaValidationTab.jsx:327-340). The backend stores the job and its files, then validates each file's column headers against the agreement's file schemas. It runs optional data-quality (DQ) rules on a 100-row sample and writes an Excel report to the OS temp dir. Scheduled (one-time or cron) jobs are stored, but no code found executes them (see BUG).

All 8 routes are mounted at `/api/schema-validation` behind `authenticateToken` (server.js:5198-5199). Each route also applies `authenticateToken` again (routes/schemaValidation.js:19 etc.). No role checks and no ownership checks exist anywhere in the route or service.

## Entry points
Common to all: JWT is required and nothing else is checked. Every error returns 500 `{success:false, message}`. The exception is POST /jobs validation, which returns 400 with `error` instead of `message` (schemaValidation.js:25-42), so error key names are inconsistent.

### 1. POST /api/schema-validation/jobs (schemaValidation.js:19)
- **Inputs:**
  - `connectionId` must match a UUID regex (:23-24).
  - `projectId` and `vendorAgreementId` must pass `!isNaN(parseInt())` (:31, :38).
  - Other body fields are spread through unvalidated (:45-48): jobName, s3Path, filePattern, recursive, files, executionType, scheduleType, cronExpression, scheduleStartDate. `createdBy` is set from `req.user.id`.
  - The UI sends `executionType` 'manual' (default, SchemaValidationTab.jsx:50) or 'scheduled'; the select offers only those two (SchemaValidationTab.jsx:897-898). When scheduled, `scheduleType` is 'one-time' or 'recurring' (SchemaValidationTab.jsx:337-339); otherwise null. `cronExpression` is sent only for recurring, `scheduleStartDate` only for one-time (:338-339).
  - No check that the project, connection, or agreement exists or belongs to the caller. No validation of the cron expression or the start date.
- **Side effects, createJob (FastSchemaValidationService.js:34-124):**
  - One transaction. Inserts the job row. `status` = 'scheduled' if `executionType==='scheduled'`, else 'pending' (:72). `total_files` = `files.length` or 0 (:71).
  - Inserts one `schema_validation_job_files` row per file with status 'pending'. Null, non-string, or blank paths are dropped (:85) and `total_files` is corrected (:99-103). Without a `files` array the job has 0 files.
  - If every entry in `files` is blank, both the file insert and the `total_files` correction are skipped (service:87, 99), so `total_files` stays at `files.length` with 0 file rows.
- **Execution:** if `executionType !== 'scheduled'`, `processJob` runs in `setImmediate` after the response is built, in-process, with no queue (schemaValidation.js:52-63). Errors are only logged.
- **Response:** 200 `{success, job}` where job is the raw inserted row.

### 2. GET /jobs (:83)
- **Inputs:** query `status`, `projectId` (parseInt, NaN is not checked).
- **Output:** `{success, jobs}`. `getJobs` joins project, connection, agreement, and vendor names. `ORDER BY created_at DESC LIMIT 100`, no pagination (FastSchemaValidationService.js:151-182).
- No filter by user. Every authenticated user sees all jobs.

### 3. GET /jobs/:jobId (:110)
- `getJob` (service:129) returns 404 `{message:'Job not found'}` if absent (:116). No ownership check.
- The progress UI polls this endpoint every 2000 ms (SchemaValidationTab.jsx:74-76), only while the status is 'running' or 'pending' (:73). `MAX_POLL_RETRIES = 5` (:12, :281) counts consecutive failures, because the counter resets to 0 on success (:273); after 5 in a row it shows the toast 'Job Monitoring Failed' (:288).
- Note: `getJob` joins `svj.connection_id = sc.connection_id` without a cast, while `getJobs` uses `svj.connection_id::text` (service:138 vs :160). In production `connection_id` is VARCHAR(255) (database_ddl_2026-01-07.sql:1958), so the uncast join works there (see UNCLEAR on the migration).

### 4. GET /jobs/:jobId/files (:141)
- **Query defaults:** page=1, pageSize=25, `sortBy='id'`, `sortOrder='asc'`, optional `status` (schemaValidation.js:144-158).
- **Rules:**
  - Sort column is whitelisted to id, file_path, status, created_at (service:197-198). Anything else falls back to id. Order is DESC only if sortOrder is 'desc' (:199).
  - Page and pageSize are `parseInt`'d with no bounds. pageSize can be arbitrarily large, and a non-numeric value gives NaN and a failed query (500).
  - `sortOrder` given as an array in the query string (e.g. `sortOrder=a&sortOrder=b`) makes `.toLowerCase()` throw (service:199), giving 500.
- **Output:** `{success, files[], pagination{page,pageSize,totalCount,totalPages,hasNext,hasPrev}}`.
  - Each file row is flattened from the `validation_result` JSON (service:233-267): fileType, fileSize, recordCount, matchedPattern, column counts, missingColumns, extraColumns, reason, valid, dqValidation, plus createdAt and updatedAt (:265-266).
  - Fallbacks: fileType = extension or 'unknown'. reason = result.reason, then error_message, then '-'. valid = result.valid, or `status==='valid'` when absent.
  - Corrupt JSON is logged and becomes {}.
- No check that the job exists. A nonexistent job returns an empty list with 200.

### 5. GET /jobs/:jobId/report (:178)
- **Behaviour:**
  - `getReportPath` reads `report_path` from the job and returns null if it is missing or the file is absent from disk (service:2357-2374). The route then returns 404 'Report not found or expired'.
  - Otherwise it streams the xlsx. Content-Type is the spreadsheetml type. `Content-Disposition` carries a sanitised filename: `[^\w-.]` becomes `_` (schemaValidation.js:191-195).
- **Side effects:** none.
- No ownership check. The report lives in `os.tmpdir()/schema-validation-reports` (service:2271), so it is lost on temp cleanup or restart, which is the "expired" meaning. No expiry logic exists in code.
- The stream has no `error` handler (schemaValidation.js:184-198).

### 6. GET /schedules (:213)
- `getScheduledJobs` (service:286-302) returns jobs with `execution_type='scheduled' AND status IN ('scheduled','pending')`, ordered by `next_run_at ASC` (:296-298).
- Joins project, agreement, and vendor, but not connection. Returns `{success, schedules}`. Not filtered by user.

### 7. PUT /schedules/:scheduleId (:235)
- **Inputs:** body `cronExpression` and `isActive` only. No validation.
- **Side effects:** `updateSchedule` (service:2389-2414) builds a dynamic SET for `cron_expression` and `is_active`. Nothing happens if neither is provided. It always returns 200 'Schedule updated', even if no row matched. It does not touch `next_run_at`, `status`, or `execution_type`, so it can modify any job, including non-scheduled ones.
- The UI never calls this route (SchemaValidationTab.jsx is the only front-end file that references these routes, and it has no PUT call).

### 8. DELETE /schedules/:scheduleId (:263)
- `deleteSchedule` (service:2379-2384) runs `DELETE FROM schema_validation_jobs WHERE id=$1 AND status='scheduled'` (hard delete). The migration FK cascades files (migrations/createSchemaValidationJobs.js:59), but the production DDL dump shows the `schema_validation_job_files.job_id` FK without an ON DELETE clause (database_ddl_2026-01-07.sql:3415); see Open questions.
- Returns 200 'Schedule cancelled' even if nothing was deleted. For example, a schedule in status 'pending', which GET /schedules lists, is not deletable.

### Internal flow: processJob (service:337-815)
Status transitions: pending or scheduled, then 'running' (sets `started_at=NOW()`), then 'completed' or 'failed' (sets `completed_at=NOW()`) (service:307-324, 347, 777, 809).

1. Load the agreement schema (`getAgreementSchema`, :1231-1294). If the agreement has any active file schema, it is a multi-pattern agreement and the patterns come from those file schemas. Otherwise it falls back to the legacy `vendor_agreements.schema`; if that agreement is not found it throws 'Vendor agreement not found' (:1285) and the job ends 'failed'. The legacy branch returns `qualityRules: []`, so no legacy DQ runs for legacy agreements.
2. Load connection credentials (:1299-1325). The connection is looked up in `storage_connections` by `connection_id::toString`. Credentials are decrypted with `decryptCredentials`. Bucket and region come from config, region defaulting to 'us-east-1' (:1324). Only an AWS S3 client is built (:1331); there is no GCS or Azure path in this service.
   - The bucket in an `s3://bucket/key` file path is discarded (`extractS3Key`, :1346-1358). Everything is read from the connection's configured bucket.
3. Archive handling:
   - **Detection:** archives are recognised by the extensions `.zip .7z .tar .tar.gz .tar.bz2 .tgz .tbz2` (:27, :912).
   - **Extraction:** each archive is downloaded to `os.tmpdir()/schema-validation-<jobId>` (:900) and extracted using a password looked up from the agreement's file schemas (vault) by file-name pattern (:821, :919). `extractArchiveContents` supports only zip, tar, tar.gz/tgz and 7z (:994-1006); `.tar.bz2` and `.tbz2` are detected as archives but always end as archiveError ('Unsupported archive type', :1005, or 'not a valid archive').
   - **Result:** the original archive row is marked status 'valid' with reason "Archive extracted successfully (N files)" (:393-420, :401-419). New rows are inserted for each extracted file (:423-432). `total_files` is updated.
   - **Zero extracted files:** an archive that extracts to zero files is dropped from the list (:943) and its DB row is never updated, because the update loop only covers archives that have extracted files (:393-420). The row stays 'pending' forever and `total_files` shrinks.
   - **Failure:** on extraction failure the archive row stays in the list with `archiveError` and the exception/archive-failure path counts it as an error (:503-529).
   - **Zip details:** extraction runs `python3` with `pyzipper` (:995-1055). The archive password is passed as a process argv (:1055), so it is visible in the process list, with the literal '__NO_PASSWORD__' when none. There is no timeout, no zip-bomb or size limit, names are flattened (collisions overwrite), and extracted files are never cleaned up.
4. Files are processed in batches of `BATCH_SIZE = 10` in parallel (:451, :490). Counters are updated after each file via a debounced writer and again after each batch (:465-487, :753-759).
   - Per-file metadata comes from `getFileMetadata(s3, bucket, filePath)` (:1177), which takes 3 parameters although processJob passes a 4th (:534-539). It ignores `isExtracted` and stats the local path whenever `fs.existsSync(filePath)` is true (:1182), so a local server path in `files` returns its size. On any error it logs a warning and returns `{size:null, fileType, lastModified:null}` (:1201-1212).
5. Per-file validation, `validateFileMetadata` (:1377-1521):
   - **Pattern match:** the file's basename is matched with `matchesPattern` against each pattern's `file_name_pattern` (first match wins). If none match, the file is invalid with reason 'No matching schema pattern'. This applies to multi-pattern agreements only.
   - **No schema:** an empty schema gives valid=true, 'No schema defined' (:1410).
   - **Header read:** if the header cannot be read, the file is invalid with 'Failed to read file headers: ...' (:1427-1433). This also covers files that do not exist in S3 and files with an unsupported extension: they count as invalid, not error.
   - **Archive marker:** an archive marker column gives invalid, reason 'Archive file needs extraction before validation' (:1440).
   - **Fixed-width without header:** `.dat` and `.txt` files with no header are valid by schema column count only (:1456-1476).
   - **Column comparison:** case-insensitive. Missing columns = expected but absent. Extra columns = present but not expected. `valid = missingColumns.length === 0` (:1496), so extra columns do NOT invalidate. Types, nullability, and order are not checked.
   - **Record count:** counted for files under 10 MB (`10*1024*1024`, :1545). Larger files are estimated from a 1 MB range read as `round(sampleRecords/sampleSize*fileSize)` (:1551-1563), see BUG. Parquet counts come from metadata and `getParquetRecordCount` downloads the entire parquet object regardless of size (:1575).
6. DQ validation, run only if schema-valid and a pattern matched (:564):
   - **Legacy rules:** `qualityRules` of the matched pattern run via `executeDQValidation` on a sample of 100 rows. Disabled rules (`!rule.enabled`) are skipped (:2441).
   - **Rule types:** `executeRule` (:2502-2534) supports only completeness (also null_check, column_completeness), validity (validity_check, email_validity, phone_validity, date_format, timestamp_format), uniqueness (duplicate_check), range_check and length_check. Any other rule_type hits `default` and returns [] (:2531-2533), so it is counted as executed and passed (:2455-2456). Violations are capped at 10 per rule (:2458) and 50 in total (:2483).
   - **Schema-inline rules:** per-column `quality_rules` and file-level `file_quality_rules` run via `validateSchemaRulesInline`, with `actual_row_count` taken from the record count (:594-656, :639). The result goes to `result.schemaRuleValidation`. A failure only logs a warning.
   - **Not counted in validity:** DQ violations do NOT change the file's valid/invalid status (:685 uses `validationResult.valid`). Stored in `dq_status`, `dq_rules_executed`, `dq_violation_count`.
7. Counters: valid, error (an exception during processing of the file, or archive failure), or invalid. Missing or unreadable files are normally invalid (see step 5), so the 'error' status is rare (archive failures or exceptions in DQ or DB code). Final status is 'completed' even if every file is invalid or errored. 'failed' only occurs on a job-level exception (:803-811).
8. `generateReport` (:2270) writes `schema-validation-<jobId>-<Date.now()>.xlsx` with sheets Summary, File Details, and Column Issues (only if there are missing columns, :2339). `report_path` is saved on the job.

## Data touched
- **`schema_validation_jobs`** (migrations/createSchemaValidationJobs.js:16-53; production DDL database_ddl_2026-01-07.sql:1955-1985, including dq_* columns and dq_enabled). Columns used by code: job_name, project_id, connection_id, vendor_agreement_id, s3_path, file_pattern, recursive, total_files, status, created_by, execution_type, schedule_type, cron_expression, schedule_start_date, next_run_at, is_active, processed_count, valid_count, invalid_count, error_count, started_at, completed_at, report_path, error_message.
  - Production DDL: `connection_id VARCHAR(255)` (:1958), `error_count INTEGER DEFAULT 0` (:1981), `execution_type DEFAULT 'manual'` (:1963). The migration file differs (connection_id INTEGER at createSchemaValidationJobs.js:20, no error_count).
- **`schema_validation_job_files`** (:57-67): job_id with ON DELETE CASCADE in the migration, file_path, status (pending, valid, invalid, error), validation_result JSONB, error_message. Plus dq_status, dq_rules_executed, dq_violation_count from migrations/addDQValidationColumns.js.
- **Read only:**
  - projects, vendors, vendor_agreements
  - storage_connections
  - vendor agreement file schemas, via getAgreementSchema, which also uses a rules table (service:1231-1290)
  - password vault, via PasswordVaultService
- **Files:** OS temp dirs `schema-validation-reports/` (:2271) and `schema-validation-<jobId>/` (:900). Neither temp dir is ever deleted by this code (extracted files stay).
- **External:** S3 getObject, headObject, and range reads. A Python subprocess for zip extraction (service:1014).

## Flags

### BUG
- **Large-file record estimate yields 0 for json (and possibly xlsx, xls).** For files of 10 MB or more, the 1 MB range slice of a json file is truncated, so `JSON.parse` throws (service:1663) and `countRecordsFromBuffer` returns null via its catch (:1700-1703). For xlsx/xls the code calls `xlsx.read` on the slice (:1677); that it throws on a truncated buffer is not shown in code (see Open questions). Then `Math.round((null/sampleSize)*fileSize)` = 0 (:1562). `getRecordCount` therefore returns 0, not null. `validateFileMetadata` always returns `recordCount` (:1514), and the stored result is built as `recordCount: validationResult.recordCount || null, ...validationResult` (:556-557); the later spread overwrites the first key, so the stored count stays 0. Only the readers turn 0 into null or '-' (:256, :2304). The DQ call passes `actual_row_count` with a `!= null` check (:639), so it becomes 0 and `record_count` rules see 0 rows. For csv/txt/dat the formula is records-per-byte times file size, but a 1 MB cut may split a row. Estimates are reported as exact `recordCount` with no "estimated" flag.
- **`extractSampleData` called with more args than it takes.** The caller passes `isExtracted` (service:582, 621) but the method has 5 parameters (:1715). The local-file check uses `fs.existsSync(filePath)` instead (:1721). `getFileMetadata` has the same mismatch: 3 parameters (:1177), called with 4 (:534-539).
- **Scheduled jobs are never executed.**
  - `processJob` is only called from the POST route for non-scheduled jobs (schemaValidation.js:52-55).
  - A grep of backend/*.js finds no other caller (the fileProcessingWorker.js:253 `processJob` is its own method). No other caller of FastSchemaValidationService or schema_validation_jobs exists.
  - cronSchedulerService.js has no schema-validation handler.
  - `next_run_at` is never written, only read (service:56-79, 298). So scheduled jobs sit at 'scheduled' forever.
- **PUT /schedules/:id does not recompute `next_run_at`** and has no relation to a runner. `is_active` is not filtered by GET /schedules or any runner.
- **Delete/list status mismatch.** GET /schedules lists 'scheduled' and 'pending' (service:297), but DELETE only removes 'scheduled' (:2381) and still reports success.
- **Job reported 'completed' when all files error or are invalid.** 'failed' only on a job-level exception.
- **Report totals.** The Summary 'Invalid Files' counts errors as invalid (`!r.valid`, service:2292), while the job row separates invalid_count and error_count.
- **Bulk `pageSize`/`page` NaN not guarded** (schemaValidation.js:153-154). Array `sortOrder` also throws (service:199).
- **Report stream has no error handler.** If the file disappears between `existsSync` and the stream open, the request can hang or crash (schemaValidation.js:197-198).
- **Fixed-width `.dat`/`.txt` without header are always valid** (service:1456-1476). The check compares the schema's column count to itself.
- **Archives that extract to zero files stay 'pending'** and shrink `total_files` (service:943, 393-420).
- **`.tar.bz2`/`.tbz2` detected but unsupported** (service:27, 912 vs 994-1006).
- **Unknown DQ rule types pass silently** (service:2531-2533, 2455-2456).
- **All-blank `files` leaves `total_files` wrong** (service:87, 99).

### SECURITY
- **No ownership or role check on any route.** Any authenticated user can list, read, report on, update, or delete any job and schedule (e.g. schemaValidation.js:110, 178, 235, 263).
- **IDOR on connections.** The `connectionId` is not checked against the caller. A user can validate against anyone's storage connection and read column names, row counts, and DQ results (POST /jobs, schemaValidation.js:21-50; getConnectionCredentials service:1299).
- **Arbitrary S3 keys.** `files` entries are used as S3 keys without checking they fall under `s3Path` (service:85, 1346-1366). The bucket in an `s3://` path is ignored (:1346-1358).
- **Local path read.** `getFileMetadata` (service:1182), `getRecordCount` (:1530) and `extractSampleData` (:1721) read the local filesystem when `fs.existsSync(filePath)` is true. A file entry such as an absolute server path would be stat'd, read and parsed. `s3://` prefix is excluded in getRecordCount only (:1530), not in getFileMetadata or extractSampleData. `extractFileColumns` guards local reads with `isExtracted && fs.existsSync` (:1868, :1900) for the cases shown.
- **Zip password on argv** (service:1055), visible in the process list. No timeout or size limit on extraction.
- **Unvalidated `cronExpression`** is stored (no format or frequency limit).
- **Raw error messages returned.** The 500 responses return `error.message`, which may contain internal detail.
- **Dynamic SQL column in `updateJobStatus`.** `additionalFields` keys are interpolated into the SQL (service:320-323). Currently all callers pass fixed keys, so it is not exploitable today.
- **Reports on shared tmp dir.** Report files are written under `os.tmpdir()` with a guessable name `schema-validation-<id>-<timestamp>.xlsx`. They are served only through the authenticated route.

### DUPLICATE
- Two schema-validation services: `FastSchemaValidationService.js` (this area) and `schemaValidationService.js` (`validateFileSchema`, used by routes/transformations.js:10 and jobExecutionEngine.js:1508).
  - The older one supports AWS, GCS, and Azure (schemaValidationService.js:3-5).
  - It uses `listAndFilterFiles`, with legacy single-schema fallback and 'drift' comparison (:148, :370).
  - The Fast one is AWS S3 only. It supports archives and DQ and has no drift handling.
  - Both resolve the agreement schema separately (Fast: service:1231; old: schemaValidationService.js:27-170). The second is outside this area and was only skimmed.
- Schedule CRUD is duplicated: `updateSchedule`/`deleteSchedule` here (service:2379-2414) and in `cronSchedulerService.js:219, 330` (used by bulkProfiling.js:310, 334 and scheduler.js:610, 688). Different tables and semantics.
- File discovery is borrowed from the BULK area (`/api/bulk-profiling/discover`).

### DEAD
- Not confirmed as unreachable, but nothing in the code reads these: `is_active`, `next_run_at` (only read for ordering, service:298), `schedule_type`, `schedule_start_date`, `cron_expression` (stored only, never acted on). `file_pattern` and `recursive` are stored but processing uses only the `files` array.
- `GET /jobs?status=` is used by the UI only with 'completed' (SchemaValidationTab.jsx:194).
- `PUT /schedules/:scheduleId` is not called by any front-end file (only SchemaValidationTab.jsx references these routes, and it uses GET/DELETE of schedules, :175, :213).
- `extractedFileName` and the `originalArchive` field are used for audit only (service:1375-1383).

### UNCLEAR
- Whether stale 'running' jobs after a restart are ever recovered. No code was found; `processJob` is in-process only.
- Migration drift: createSchemaValidationJobs.js has `connection_id INTEGER` (:20) and no `error_count`, while the production DDL has `connection_id VARCHAR(255)` and `error_count INTEGER DEFAULT 0` (database_ddl_2026-01-07.sql:1958, 1981). Only the migration file is stale; code matches production.

## Domain terms
- **Schema validation job** (`schema_validation_jobs`): one run over a set of files. UI labels: "scheduled job" and "completed job".
- **Schedule / scheduled job**: the same table row with `execution_type='scheduled'`. The routes call it `scheduleId`, but it is the job id.
- **Execution type**: 'manual' (UI default, DB default) or 'scheduled'. **Schedule type**: 'one-time' or 'recurring'.
- **Vendor agreement** (`vendor_agreements`, display name `agreement_code` or `file_name`): holds the file schemas that define the expected columns.
- **Pattern / file schema**: `file_name_pattern` plus a column list. "multi-pattern" is the agreement type (service:1388). The legacy single schema is the other type.
- **Connection / storage connection**: `storage_connections.connection_id`, a UUID string.
- **s3Path / path**: the folder; **filePattern**: a name filter; **files**: the explicit paths.
- **DQ validation**: data quality rules (`qualityRules` legacy vs schema `quality_rules` / `file_quality_rules`).
- **Report**: an xlsx with Summary, File Details, and Column Issues sheets.
- File status values: pending, valid, invalid, error. Job status values: pending, scheduled, running, completed, failed.

## Open questions
1. What actually runs scheduled jobs? Nothing was found in the backend. Is there a runner outside the searched code, or is the feature unfinished?
2. Should extra columns, type mismatches, or DQ violations affect validity? The code ignores all three.
3. How long should reports and temp files be retained? No cleanup is found, yet the 404 message says "expired".
4. Is the UI-only call to GET /jobs filtered to 'completed' intended to hide failed jobs?
5. In production, does deleting a scheduled job with file rows succeed? The production DDL shows the job_files FK without ON DELETE CASCADE (database_ddl_2026-01-07.sql:3415), whereas the migration cascades (createSchemaValidationJobs.js:59). The DDL dump may omit the clause; this was not tested.
6. Does `xlsx.read` throw on a truncated 1 MB slice of a 10 MB+ xlsx/xls file? Only the json throw is shown in code (service:1663); the xlsx outcome was not verified.
