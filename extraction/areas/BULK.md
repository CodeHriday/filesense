# BULK - Bulk profiling of cloud storage

## Summary
Users browse an S3 bucket, create a "bulk profiling job" (path, glob pattern, recursive flag, duplicate handling, optional quality rules, optional schedule), and start it. A job lists matching S3 objects, stores them as file rows, then downloads each one, virus-scans it, runs Python profiling and writes catalog rows. Only AWS S3 is supported in this area (BulkProfilingService.js:34-38, 145-146). All 10 routes use `authenticateToken` only; there are no role or ownership checks (bulkProfiling.js:18-330). `cloudStorageFileList.js` is not used by the bulk routes; it is used elsewhere (see DUPLICATE and Flags).

Router mount: root `server.js:5189-5190` does `require('./backend/routes/bulkProfiling')` and `app.use('/api/bulk-profiling', authenticateToken, bulkProfilingRoutes)`, inside a try/catch whose handler logs `Failed to register /api/bulk-profiling` (server.js:5193). Two different auth middlewares run in sequence, not the same one twice. The mount uses `authenticateToken` imported at server.js:406 from `./backend/src/middleware/authenticate` (it sets `req.user` at :53 of that file). The route file imports `../middleware/authenticate` (bulkProfiling.js:9), which is backend/middleware/authenticate.js, a plain JWT verify (`req.user = decoded`, :35; 401 body `{error}`). `/jobs/:jobId` and `/jobs/:jobId/start` do not collide because `:jobId` matches one path segment.

## Entry points
All routes are in backend/routes/bulkProfiling.js. Auth for all: JWT (`authenticateToken`), no role, no ownership. Every error returns HTTP 500 `{success:false,message}` unless stated.

### POST /api/bulk-profiling/browse (:18)
- Input: `connectionId` or `rawCredentials`, `s3Path` (default ''). 400 `Connection ID or raw credentials are required` if both missing (:22-27).
- Calls `browseS3Path` (Service:135). Rawcredentials: provider (`provider|storage_type|connection_type`) must be `aws` or `s3` (:144-147). Saved connection: `getConnectionById`; type `vendor` requires provider aws/s3 and decrypts as vendor (:171-182); otherwise type must be `aws` (:185-192).
- IAM role: used when `authMethod==='aws-iam-role'` and role ARN present; AssumeRole with `session_duration: 3600`, session name `DataObservatory-Browse`, default region `us-east-1` for STS (:222-247). Otherwise static keys (:250-254). Authentication method defaults to `aws-iam-role` if an ARN exists, else `key-based` (:220).
- Lists with `Delimiter:'/'`, `MaxKeys:1000` (:258-263); no pagination, so max 1000 entries are returned.
- Browse extension filter: .csv .json .parquet .xlsx .xml .dat .txt .zip .7z .tar .tgz .gz (:280-293).
- Output: `{success, currentPath, bucketName, folders[{name,path,type:'folder'}], files[{name,path,type,size,lastModified}]}` (:317-322).
- Frontend callers: S3FolderBrowser.jsx:7 (default `browseEndpoint='/api/bulk-profiling/browse'`), EditSubProjectModal.jsx:302, ProjectManagement.jsx:1399. Also reused by vendorAccessRoutes.js:278 (`browseS3Path`).

### POST /api/bulk-profiling/discover (:53)
- Input: `connectionId`, `s3Path` (both required, else 400), `filePattern` default `*`, `recursive` default false.
- `discoverFiles` (Service:25): connection must exist and `type==='aws'` (:30-38). Bucket from config, or from `s3://bucket/...` path (:47-50). Prefix gets trailing `/` (:56). `MaxKeys:1000`, single `listObjectsV2` call, no continuation (:68-78). Non-recursive uses Delimiter `/`.
- Discover extension filter (differs from browse): .csv .json .parquet .xlsx .xml .dat .zip .7z .tar .tar.gz .tgz (:82-94). Extension is `path.extname`, so `.tar.gz` can never match (gives `.gz`), and `.gz`/`.txt` files are excluded.
- Pattern: `*` matches all; otherwise `.`->`\.`, `*`->`.*`, `?`->`.`, anchored, case-insensitive (:332-339). Other regex characters are not escaped.
- Output: `{success, files[{path:'s3://bucket/key',name,size,type,lastModified}], count}`.
- Frontend: BulkProfilingTab.jsx:252; also SchemaValidationTab.jsx:239.

### POST /api/bulk-profiling/jobs (:90)
- Input: body spread plus `createdBy=req.user.id` (:92-95). No validation in the route.
- `createJob` (Service:345): connectionId in UUID format must exist in `storage_connections` with `status='active'`; otherwise looked up in `transform_connections` with `is_active=TRUE` (:350-375). Error `Connection not found or inactive...`.
- If `executionType==='scheduled'`: creates a schedule BEFORE the job insert (:378-408). `recurring`: `schedule_type='cron'`, cron from `cronExpression`. `one-time`: cron built as `minute hour day month *` from `scheduleStartDate` using server local getters (:394-403). An invalid `scheduleStartDate` makes `new Date(...)` invalid, so the getters return NaN and the cron string contains `NaN` fields (:396-402); `createSchedule` then throws `Invalid cron expression` and `createJob` fails with 500. Any other `scheduleType` makes `createSchedule` throw `Invalid schedule type: undefined` (cronSchedulerService.js:111-113); `createJob` fails with 500 and no job row is inserted. The cron is validated at create time through `parseAndCalculateNextRun` (cronSchedulerService.js:24-42, evaluated in UTC, :29), so an invalid cron also fails with 500. Schedule name `jobName` or `Bulk Profile Schedule - <s3Path>`; `is_active:true`. `sub_project_id` is not passed to `createSchedule`.
- Inserts job: name default `Bulk Profiling <ISO time>`, `file_pattern` default `*`, `duplicate_handling` default `skip`, `recursive` default false, status `pending`, `execution_type` default `manual`, `quality_rule_ids` or null (:418-433).
- Then route discovers files (route :101); if none, sets job `completed` and returns `{success, job, message:'No files found matching the criteria'}` (:108-115); the schedule row remains. The `job` in that response is the object returned by `createJob` before the update (:98, 109, 112), so the client sees status `pending` while the DB row is `completed`. Otherwise inserts files (status `pending`) in one multi-row insert and sets `total_files` (:451-478). Returns re-read job.
- Failure paths: if `discoverFiles` throws after `createJob`, the job stays `pending` with 0 files and the schedule row remains (route :101). If the job insert fails after `createSchedule`, the schedule is orphaned (Service:378-433).
- Frontend: BulkProfilingTab.jsx:351.

### GET /api/bulk-profiling/jobs (:141)
- Query filters: `status`, `projectId`, `createdBy`, `jobName` (ILIKE `%x%`), `limit`, `offset` (parseInt) (:143-150). Parameterised except LIMIT/OFFSET, which are interpolated after `parseInt` (Service:581-587). Sorted `created_at DESC`. Joins users and schedules.
- Output `{success, jobs, total}`; each job gets `frequency` via `describeCronExpression` or `'Ad-hoc'` (:591-598; getJob :512-516).
- No default limit. Any user can list all users' jobs and filter by any `createdBy`.
- Frontend: Monitor.jsx:180.

### GET /api/bulk-profiling/jobs/:jobId (:173)
- Returns job with `files` (ordered `created_at ASC`) and `frequency`. 404 `Job not found`. No ownership check. Frontend: :280.

### POST /api/bulk-profiling/jobs/:jobId/start (:204)
- `startBulkProfiling(jobId, userId)` (Service:711). Not found: throws (500). Status not `pending`: if `running` returns `{message:'Job is already running'}` with 200; any other status throws `...not in pending status` (500) (:719-726). The status check and the update to `running` are not atomic (:719-729), so a double-start race is possible.
- Sets `running` (`started_at=NOW()`), returns immediately, processes in background (:729-739). Background failure sets job `failed` (:734-737); that `this.updateJobStatus(jobId,'failed',...)` call inside the `.catch` is neither awaited nor given its own `.catch` (:736), so if the update itself fails it becomes an unhandled promise rejection.
- On error, if job is still `pending` it is marked `failed` (:743-746).
- Per file (sequential loop, :773): status `processing`; if `duplicate_handling==='skip'`, checks `files` by `filename` + `project_id` and marks `skipped` with message `Already in catalog - duplicate skipped` (:778-795, 1040-1046). Only `skip` is implemented; other values behave like no duplicate check.
- Download to `/tmp/bulk_profiling_<jobId>_<ts>_<name>` (:799); virus scan, infected files are deleted and marked `failed` `Virus detected: ...` (:809-829). `VirusScanService.scanFile` never throws and fails open: it returns `isInfected:false, skipped:true` when scanning is disabled (`DISABLE_VIRUS_SCAN=true`, VirusScanService.js:24), when ClamAV is unavailable, or when the scan errors (VirusScanService.js:227-242, 271-307). It hardcodes definitions dir `/home/runner/.clamav` (:132, 157) and may run `bash scripts/init-clamav.sh` for up to 300 s on first use (:87).
- Profile: `utils/process_file.py` (rejects if script missing, :1060-1062; preview_data already limited to 100 rows by process_file.py:108), `utils/profile_columns.py` (failures swallowed, empty columns), `quality_checks.detect_duplicate_rows` via `python3 -c` (failures swallowed, zeros) (:1056-1198). Merge column stats into schema by name. `_detectDuplicates` uses `sys.path.insert(0,'.')` (:1154) and the `spawn` call passes no `env` option (:1161), so the child inherits `process.env`; the code itself does not set PYTHONPATH. The import therefore only works if the process cwd is the repo root (or the server's environment supplies a PYTHONPATH); otherwise the swallowed failure yields zeros.
- Writes: `files` row with hard-coded `quality_score` 85 and `processing_step 'complete'` (:1247, 1225); new `checksum` is `uuidv4()` not a content hash (:864); `file_columns` (delete then insert, per-column errors swallowed); `file_preview_data` first 100 rows (:1321); `file_ownership` (owner = starting user, :1345); audit via `captureFileSchema` and `captureFileAudit` with `source 's3_bulk_profiling'`, `loadType 'bulk_profiling'`.
- Quality rule validation (:888-915, 1388-1414): does not work. BulkProfilingService.js:19 destructures `validateDataWithRules` from `./qualityValidationEngine`, but that module exports only the class (qualityValidationEngine.js:1396 `module.exports = QualityValidationEngine`). `validateDataWithRules` is undefined, so the call at :1389 throws a TypeError, which is caught and logged (:907-914); the file still completes and nothing reaches the `quality_violations` insert (:1395-1413). That insert also targets `quality_violations`; no `CREATE TABLE quality_violations` was found in the DDL dump or the migrations searched (only `quality_rule_violations`, DDL:1782), and per-violation insert errors are swallowed (:1414).
- File failure sets `failed` with error; job ends `completed` even if some or all files failed (:999). `updateJobProgress` recomputes processed/successful/failed/skipped counts (:681-694). Temp file cleanup only in the inner `finally` (:981-986).
- Frontend: :380.

### DELETE /api/bulk-profiling/jobs/:jobId (:229)
- 404 if missing; 400 `Cannot delete a running job` if status `running`; otherwise deletes (files cascade) (:233-250). Raw SQL from the route. The linked schedule row is not deleted. No ownership check.

### GET /api/bulk-profiling/schedules (:270)
- `getSchedulesByType('bulk_profiling_job')` (cronSchedulerService.js:192), all users. For each schedule loads the job (N+1 queries, :275-285) and adds `job_name` (or `Unknown`), `job_status`, `frequency` (or `N/A`). Frontend: :183.

### PUT /api/bulk-profiling/schedules/:scheduleId (:305)
- Body `cronExpression`, `isActive` mapped to `cron_expression`, `is_active` and passed to `updateSchedule` (cronSchedulerService.js:238-266, transactional with row lock). Missing schedule throws `Schedule ... not found` (500). No check that the schedule is a bulk profiling one.
- `updateSchedule` uses `in`, so an absent `cronExpression` still arrives as `cron_expression: undefined` and counts as changed. For a cron schedule it throws `cron_expression is required for cron-type schedules` (cronSchedulerService.js:251-253), so the route returns 500. Changing `isActive` alone through the API therefore fails. When a cron is supplied, it is validated and `next_run` recalculated (:254); undefined values are skipped in the SET clause (:281). The frontend always sends both keys (BulkProfilingTab.jsx:221-224), so it does not hit this. Frontend: :220.

### DELETE /api/bulk-profiling/schedules/:scheduleId (:330)
- `deleteSchedule` (cronSchedulerService.js:330-338): hard delete, throws (500) if not found. Any schedule id (any entity type) can be deleted through this route. Frontend: :203.

### Scheduler trigger (non-HTTP)
- `processDueSchedules` calls `bulkProfilingService.startJob(entity_id, userId)` for `entity_type==='bulk_profiling_job'` (cronSchedulerService.js:444-449); `startJob` aliases `startBulkProfiling` (Service:707). A job only runs if `pending`, so a recurring schedule fires effectively once: after the first run the job is `completed` and later starts throw `not in pending status`. Files list is fixed at creation time, not rediscovered.
- `last_run`/`next_run` are only updated after a successful `startJob` (cronSchedulerService.js:459-476). The throw for a non-pending job goes to the catch at :503, so the schedule stays due and is retried every poll tick, emitting a 'failed' alert each time (:514).

## Data touched
- Tables: `bulk_profiling_jobs`, `bulk_profiling_files`, `schedules`, `storage_connections`, `transform_connections`, `users`, `files`, `file_columns`, `file_preview_data`, `file_ownership`, `quality_rules`, `quality_violations` (insert never reached, see above; table not found in DDL), plus audit tables via fileAuditService.
- Migration 004 (migrations/index.js:226-268) defines `connection_id INTEGER` (:230), no `sub_project_id`, `quality_rule_ids`, `skipped_files`. The DDL dump (database_ddl_2026-01-07.sql:704, 722-724) shows the live table has `connection_id VARCHAR(255)`, `skipped_files`, `sub_project_id`, and `quality_rule_ids _int4`; so these columns exist in the live schema but not in migrations 004/005. (Another table at DDL:2481 uses JSONB for rule ids.)
- S3 objects (read only). Temp files under `/tmp`. Child processes `python3`.
- adminCleanupRoutes.js:297 deletes jobs for all projects other than id 1.

## Flags
- BUG: Job status is `completed` even when every file failed (Service:999).
- BUG: `_processFilesAsync` builds S3 client from `config.access_key/secret_key/bucket_name` and requires static keys; it ignores IAM role, vendor field names, and `s3://bucket` in the path (Service:761-770). Jobs created on connections that browse/discover fine through other forms can fail. Also uses `config.bucket_name` rather than the bucket in each file path.
- BUG: `discoverFiles` rejects `type !== 'aws'` and uses `config.access_key` only; vendor connections accepted by browse (:171) fail on discover and start. (Related to above.)
- BUG: `.tar.gz` listed in discover filter can never match `path.extname` (Service:92, 102).
- BUG: Discover and browse use only one `listObjectsV2` page, max 1000 keys, silently truncated (Service:71, 262).
- BUG: Recurring schedule runs once only because job status does not reset to `pending` (Service:719-725; scheduler :444). Afterwards the schedule stays due and re-fails every poll tick (cronSchedulerService.js:459-476, 503, 514).
- BUG: Temp download file is not deleted if virus scan throws or if download fails after partial write (cleanup only in the inner `finally` after scan, Service:809-986).
- BUG: `file_hash` is a random UUID, not a hash (Service:864), so it cannot detect duplicates.
- BUG: Deleting a job leaves its schedule row; scheduled start would then throw (Route :250).
- BUG: One-time schedule cron `m h d M *` has no year, so it repeats annually; built from server-local getters (Service:396-402) while schedules are evaluated in UTC (cronSchedulerService.js:29).
- BUG: An invalid `scheduleStartDate` yields a cron with NaN fields (Service:396-402), so `createSchedule` throws `Invalid cron expression` and job creation fails with a generic 500.
- BUG: Zero-files response returns the pre-update job (status `pending`) while the DB row is `completed` (route :108-115).
- BUG: In `startBulkProfiling`, `this.updateJobStatus(jobId,'failed',...)` inside the `.catch` is not awaited and has no `.catch` (Service:736), so a failing update is an unhandled rejection.
- BUG: Hard-coded `quality_score` 85 on every profiled file (Service:1247).
- BUG: Quality rule validation can never run: `validateDataWithRules` is imported (Service:19) but not exported by qualityValidationEngine.js:1396; the call at :1389 throws a TypeError that is swallowed (:907-914). Also writes to `quality_violations`, which has no DDL (see Data touched).
- BUG: PUT schedule with only `isActive` fails with 500 because `cron_expression: undefined` is treated as changed (cronSchedulerService.js:251-253).
- BUG: Orphaned rows: schedule left behind when job insert or file discovery fails, or when zero files are found (Service:378-433; route :101, 108-115).
- BUG: `startBulkProfiling` status check and update to `running` are not atomic (:719-729).
- SECURITY: No ownership/role check on any route: any authenticated user can list, read, start, delete any job and update/delete any schedule (bulkProfiling.js:141-345).
- SECURITY: `/schedules/:id` PUT and DELETE act on any schedule regardless of entity type (:305-345).
- SECURITY: `browse` accepts raw credentials in the request body (:20), and any user can pass any `connectionId`, so any user can browse any stored connection's bucket.
- SECURITY: `s3Path` may name an arbitrary bucket via `s3://other-bucket/...` using the connection's credentials (Service:47-50, 200-203).
- SECURITY: `_detectDuplicates` builds Python source with interpolated `filePath` escaping only `'` (not backslash/newline); filename comes from S3 key (Service:1157).
- SECURITY: Glob pattern is turned into a regex without escaping other metacharacters (Service:336); ReDoS possible. The other util uses `globToRegex` as a safe version.
- SECURITY: Error messages (including AWS/IAM details) returned to the client in 500s.
- SECURITY: Virus scanning fails open: if disabled, ClamAV unavailable or scan errors, files are treated as clean with `skipped:true` (VirusScanService.js:24, 227-242, 271-307).
- DUPLICATE: S3 prefix parsing, extension lists and S3 client setup repeated in `discoverFiles`, `browseS3Path` and `_processFilesAsync`, with different behaviour (extension lists differ; IAM only in browse).
- DUPLICATE: `cloudStorageFileList.js` has three copies of connection lookup + decrypt + vendor field normalisation (:145-224, 430-504, 509-583) and a third pattern matcher (`globToRegex`, :276) vs `matchesPattern`. Also overlaps ConnectionService.createS3Client (noted in file :16-19).
- DUPLICATE: Two different auth middlewares are applied to the same routes: `src/middleware/authenticate` at the mount (server.js:406, 5190) and `middleware/authenticate` in the route file (bulkProfiling.js:9), with different `req.user` construction and 401 bodies.
- DEAD: `duplicate_handling` values other than `skip` have no effect.
- UNCLEAR: `updateJobStatus('completed')` for zero files leaves a job with `total_files` 0 and no start possible.
- UNCLEAR: `cloudStorageFileList.js` is not used by bulk routes, but is imported by other code (transformations.js:1068, schemaService.js:623, schemaValidationService.js:13 for `listAndFilterFiles`; jobExecutionEngine.js:14; LargeAttachmentService.js:11 `uploadFileToConnection`; transformationProfilingService.js:8 `downloadFileFromConnection`). Whether its GCS/Azure paths are reached from those callers was not traced; the earlier DEAD claim is withdrawn.

## Domain terms
- Bulk profiling job (`bulk_profiling_jobs`), job file (`bulk_profiling_files`), `s3Path`/prefix, `filePattern` (glob), `recursive`, `duplicateHandling` (`skip`), `executionType` (`manual`/`scheduled`), `scheduleType` (`recurring`/`one-time`), schedule (entity `bulk_profiling_job`), `frequency` (human-readable cron or `Ad-hoc`), catalog (the `files` table: "Already in catalog"), transform connection (integer id) vs storage/vendor connection (UUID id), `qualityRuleIds`, profiling = schema + column stats + duplicate stats + preview.
- Job statuses: pending, running, completed, failed. File statuses: pending, processing, completed, failed, skipped.

## Open questions
1. Intent of `file_hash = uuidv4()` and the fixed quality score 85.
2. Whether recurring schedules are meant to re-run (job status never returns to `pending`).
3. Whether GCS/Azure functions in cloudStorageFileList.js are reached from its other importers (jobExecutionEngine, LargeAttachmentService, schemaService, schemaValidationService, transformationProfilingService); not traced.
4. Which table quality violations were meant to be stored in (`quality_violations` has no DDL; `quality_rule_violations` exists at DDL:1782).
