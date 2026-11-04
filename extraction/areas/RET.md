# RET - Retention & archival

## Summary
Admins define retention policies (CRUD), run them manually or via a daily worker, and browse/restore archived files. All HTTP routes are mounted at `/api/retention-policies` (server.js:5401-5402) and gated by JWT plus `settings:read` / `settings:write` (retentionRoutes.js). The worker (`RetentionPolicyWorker`) is started at server.js:78-83 with schedule '01:00'. Archival goes through `ArchivalStorageService` (s3/gcs/azure/local).

The route layer and the worker/restore code disagree about the schema. Routes read and write flat columns (`retention_days`, `min_quality_score`, `archive_storage_type`, ...) defined in migrations/001_retention_archival_system.sql:8-41. The worker selects `criteria` and `storage_config` (retentionPolicyWorker.js:99), and no such columns exist in that migration. The worker also inserts into `archived_files` columns the migration does not define. As written, the automated and manual execution paths cannot work against the migration schema. This is based on the migration alone; other migrations were not checked (see Open questions).

## Entry points

All routes: `authenticateToken` then `authorize(permission)` (retentionRoutes.js:3-8). No ownership checks; any holder of the permission acts on any policy.

### GET /api/retention-policies (retentionRoutes.js:15)
- Auth: settings:read. Inputs: query `enabled` ('true' means true, any other value means false, line 37), `storage_type` (filters `archive_storage_type`, :41-44).
- Output: `{success, policies, count}`. Each row has `created_by_name`, `archived_files_count`, `total_bytes_archived` (LEFT JOIN on `archived_files` where `is_deleted=false`, :22-30). Ordered by `priority ASC, name ASC` (:48).
- Errors: 500 'Failed to fetch retention policies'.

### GET /api/retention-policies/:id (:72)
- Auth: settings:read. Returns `{success, policy}` with `created_by_name`, `updated_by_name`, and `stats` (:98-111).
- Stats query: `SUM(total_bytes_archived)`, `MAX(completed_at)` over runs with `status='completed'` (:98-106). It reads `files_archived` and `total_bytes_archived` from `retention_policy_runs`.
- Errors: 404 'Retention policy not found'; 500.

### POST /api/retention-policies (:131)
- Auth: settings:write; audit middleware ('retention_policy','create') (:134).
- Inputs (body): name, description, enabled (default true), retention_days, min_quality_score, max_file_size_mb, file_types, tags, access_pattern, custom_condition, archive_storage_type, archive_connection_id, archive_path_prefix, priority (default 50), run_frequency (default 'daily') (:137-153).
- Validation: only `name` and `archive_storage_type` required, else 400 (:156-161). No validation of numeric ranges, storage type values, or `run_frequency` values.
- `next_run_at`: now+1 day (daily), +7 days (weekly), +1 month (monthly); any other frequency leaves it at now (:164-171). Nothing in the worker reads `next_run_at`.
- Output: 201 `{success, policy, message}`. `created_by` = `req.user.id`.
- Errors: 500.

### PUT /api/retention-policies/:id (:213)
- Auth: settings:write; audit middleware ('update').
- Update uses `COALESCE($n, col)` for every field (:241-255). Fields cannot be cleared to NULL, and `enabled=false` works only because false is not NULL.
- Sets `updated_by`; `updated_at` is handled by trigger (migration :174-177).
- No validation. 404 if not found; 500 on error.

### DELETE /api/retention-policies/:id (:297)
- Auth: settings:write; audit middleware ('delete').
- Rule: 400 if any `archived_files` row for the policy has `is_deleted=false` (:306-317). Otherwise hard `DELETE`.
- Referential integrity: `retention_policy_runs.policy_id` references the policy with no ON DELETE clause (migration :135), so a policy with run history will fail at the DB and return 500. Not otherwise handled.
- Errors: 404; 500.

### POST /api/retention-policies/:id/execute (:355)
- Auth: settings:write. No audit middleware (contrast with create/update/delete).
- Rules: 404 if missing; 400 'Cannot execute disabled policy' if not enabled (:376-381). Calls `retentionWorker.executeManually(parseInt(id))` (:390).
- The call is synchronous: the HTTP request waits for the full evaluation.
- Output: `{success, message, filesEvaluated, filesMarkedForArchival, bytesArchived, duration_ms}`. `bytesArchived` is read from the result of `executeManually`, which takes it from `evaluatePolicy` (worker :537-543).
- Errors: 500 generic. `req.user.id` is never recorded as executor on the run (the worker's run INSERT does not set `executed_by` or `triggered_by`).

### GET /api/retention-policies/:id/runs (:420)
- Auth: settings:read. Query `limit` (default 50), `offset` (default 0), passed straight into SQL params (:426, :437) with no cap or numeric validation. Non-numeric values give a DB error and a 500.
- Output: `{success, runs, total, limit, offset}`. Rows are joined to `users` for `executed_by_name`.

### GET /api/retention-policies/archives/list (:466)
- Auth: settings:read. Query: `policy_id`, `status` (matches `archive_status`), `start_date`, `end_date` (cast `::timestamptz` against `archived_at`), `limit` (default 100), `offset` (default 0) (:471-514).
- Always filters `is_deleted=false`. Ordered by `archived_at DESC`.
- Output: `{success, archives, pagination{total, limit, offset, hasMore}}`.
- Joins `files f ON af.file_id = f.file_id`, `users u` (`archived_by_email`). Selects `af.archive_status`, which is not in the migration's `archived_files` definition (see Flags).
- Route order: `/:id` (:72) is registered before `/archives/list`, but since `/archives/list` has two segments it does not collide with `/:id`.

### POST /api/retention-policies/archives/:id/restore (:583)
- Auth: settings:write. No audit middleware, but `auditService.logAction` is called in code (:673, :705).
- Inputs: body `restore_path`, `reason`.
- Flow, inside one transaction (`dbPool.getClient()`, BEGIN):
  1. Select the archived file (not deleted) joined with `rp.storage_config` and the original file path. 404 if none.
  2. 400 `Cannot restore file with status: X` unless `archive_status === 'archived'` (:618).
  3. `storageConfig` = policy `storage_config`, else `{storage_type:'local', local_archive_path:'./archive'}` (:627-630).
  4. Destination = `restore_path` || `archivedFile.original_path` || `./uploads/${filename}` (:633).
  5. INSERT `file_restorations` with `restoration_status='pending'`, `reason || 'Manual restoration'`.
  6. `storageService.restoreFile(archive_path, destination, storageConfig)`. Sets status 'completed' or 'failed' and writes a SUCCESS or FAILURE audit entry using the transaction client.
  7. UPDATE `file_restorations` with the status, `completed_at`, `error_message`; COMMIT.
- Output: `{success: status==='completed', restoration, message}`. A failed restore still returns HTTP 200 with `success:false` (:738-749).
- Side effects: writes the file to the caller-supplied path. The path is not validated or restricted (see SECURITY).
- Not done: `archived_files.archive_status`, `is_restored`, `restored_at`, `restored_by` are never updated after a restore. A file can be restored repeatedly.
- Errors: outer catch rolls back and returns 500.

### GET /api/retention-policies/restorations/history (:767)
- Auth: settings:read. Query: `status`, `start_date`, `end_date` (against `fr.requested_at`), `limit` (default 50), `offset` (default 0).
- Joins `users u ON fr.restored_by = u.id` (:784). The migration's `file_restorations` has `requested_by`, not `restored_by`; the restore route writes `requested_by`.
- Filters on `fr.restoration_status`; the migration column is `status`.
- Output: `{success, restorations, pagination{...}}`.

### Daily worker: RetentionPolicyWorker (backend/workers/retentionPolicyWorker.js)
- Trigger: `start()` runs `setInterval` hourly (:39-41) and also calls `checkAndRun()` immediately at startup (:44). Server shutdown calls `stop()` (server.js:14235-14236).
- Schedule check: runs when `now.getHours() === targetHour` and `getMinutes() >= targetMinute && < targetMinute+60` (:71), i.e. any minute in the 01:00 hour, server-local time. `lastRunDate` is kept in memory and set from UTC date (`toISOString`, :73). It resets on restart, so a restart during the 01:00 hour re-runs. The local hour check and UTC date key can disagree near midnight in non-UTC zones.
- `run()`: selects `id, name, criteria, description, storage_config` from `retention_policies` where `enabled = true` ordered by `priority ASC` (:98-103); evaluates each policy in sequence, errors per policy are logged and the loop continues. `isProcessing` guards concurrency inside one process only.
- `evaluatePolicy(policy)` (:166): one transaction per policy.
  - INSERT `retention_policy_runs` with status 'running' (:174-184), using columns `files_archived`, `bytes_archived`.
  - `buildFileQuery(policy.criteria)` (:412). Criteria keys and conditions:
    - `max_age_days`: `f.created_at < NOW() - (n * INTERVAL '1 day')`
    - `min_quality_score`: quality_score < value
    - `max_quality_score`: quality_score > value
    - `min_file_size_bytes`: file_size < value
    - `max_file_size_bytes`: file_size > value
    - `file_types`: `f.file_type = ANY(...)`
    - `required_tags`: file must have all tags
    - `custom_sql_filter`: appended raw (`(${criteria.custom_sql_filter})`, :497)
    - Appended `LIMIT 10000` (:506).
  - For each matching file: skip if an `archived_files` row exists with `is_deleted=false` (:203-214), including rows with status 'failed'. Then call `storageService.archiveFile(fileInfo, policy.storage_config)`. `file_path` falls back to `./uploads/${filename}` (:220).
  - Writes an audit entry (userId 'system', actionType 'ARCHIVE') for success and for failure.
  - INSERTs an `archived_files` row regardless of outcome, with `archived_by` hardcoded to 1 (:325) and `archive_status` 'archived' or 'failed'.
  - `filesMarkedForArchival` and `bytesArchived` count successes only; bytes use `compressedSize || size` (:347). `files_evaluated` is the number of query matches, including ones skipped as already archived (:195).
  - Run row set to 'completed' even when individual files failed (:359-369).
  - On exception: ROLLBACK, then UPDATE all rows `WHERE policy_id=$2 AND status='running'` to 'failed' (:389-396). Since the run INSERT was rolled back too, this matches only other (stale) running rows.
- `executeManually(policyId)` (:518): single policy requires `enabled = true`, else throws 'Policy not found or not enabled'. With no id it calls `run()` (the route always passes an id).
- Source files are never deleted or moved after archiving. Only a copy is made (archiveToLocal/archiveToS3 read and write, no unlink of the original).

### Storage service: ArchivalStorageService (backend/services/archivalStorageService.js)
- `archiveFile` (:29): switch on `storage_type`: s3/aws, gcs/google, azure, local/filesystem; otherwise throws `Unsupported storage type`.
- Archive path: `${prefix}/${yyyy}/${mm}/${dd}/${fileId}_${filename}`, prefix default 'archive', date in server local time (:476-484).
- S3: reads the whole file into memory, SHA-256 checksum, `s3.upload` to `connection.config.bucket_name` (:211-241). Connection loaded via `SELECT * FROM connections WHERE id=$1` (:461-471).
- Local: copies to `<local_archive_path || './archive'>/<archivePath>` plus a `.metadata.json` sidecar (:398-425).
- Despite the `compressedSize` naming, there is no compression; the size is the raw file length (:238, :422).
- `restoreFile` (:106) mirrors the switch; `deleteArchivedFile` (:167) exists.
- The checksum is returned but the worker does not store it (the INSERT has no checksum column value).

### Frontend
- /retention-policies -> src/pages/RetentionPolicies.jsx (App.jsx:440). Calls GET list (:57), `/api/storage-connections` (:60), POST (:163), PUT (:167), DELETE (:190), POST execute (:208). Form uses flat fields such as `retention_days` parsed with parseInt (:153).
- /archived-files -> src/pages/ArchivedFiles.jsx (App.jsx:441). Calls GET `/api/retention-policies` (:32), GET `archives/list` (:55), POST `archives/:id/restore` (:92) with `restore_path` (default `archive.original_path || ./uploads/<filename>`, :81) and `reason`. Alerts 'File restored successfully!' on success (:98). Restoration history endpoint is not called from either page (grep of both pages found no use).

## Data touched
- `retention_policies` (read/write): migration columns are flat (retention_days, min_quality_score, max_file_size_mb, file_types, tags, access_pattern, custom_condition, archive_storage_type, archive_connection_id, archive_path_prefix, priority, run_frequency, last_run_at, next_run_at). The worker additionally reads `criteria` and `storage_config`; the restore route reads `rp.storage_config`.
- `archived_files` (migration :50-89): columns include `original_filename`, `archive_storage_type`, `archive_checksum`, `original_metadata`, `is_restored`, `is_deleted`. The worker inserts `filename`, `compressed_size_bytes`, `metadata_snapshot`, `archive_status`, `error_message`, which are not in the migration.
- `file_restorations` (migration :100-124): `status`, `restored_to_path`, `restoration_reason`, `requested_by`. The route writes `restoration_path`, `reason`, `restoration_status` and also omits the NOT NULL `file_id`.
- `retention_policy_runs` (migration :133-155): `total_bytes_archived`, `files_skipped`, `triggered_by`, `executed_by`. The worker writes `bytes_archived`.
- Also read: `files`, `users`, `file_tags`, `tags`, `connections`; audit log via AuditService.
- Filesystem: `./archive` (local archives), `./uploads` (restore default).
- Schedule of record: no table-driven schedule; `run_frequency` and `next_run_at` are stored but unused by the worker.

## Flags

### DUPLICATE
- DUP-1: Two competing policy shapes. Flat columns (migration; routes; FE) versus `criteria` and `storage_config` (worker; restore route). Criteria names differ: `retention_days` vs `max_age_days`, `max_file_size_mb` vs `max_file_size_bytes`, `tags` vs `required_tags`, `custom_condition` vs `custom_sql_filter`, `archive_storage_type` vs `storage_config.storage_type`.
- DUP-2: Status columns named differently across layers: `status` (migration) vs `restoration_status` (routes); `archive_status` (routes/worker) not in the migration.

### BUG
- BUG-1: Worker selects `criteria` and `storage_config` from `retention_policies` (retentionPolicyWorker.js:99, :525), columns absent from migration 001 (:8-41). Unless added elsewhere (not verified), `run()` and `executeManually` fail with a DB error, so the daily job and the Execute button would not work. Per-policy errors are swallowed.
- BUG-2: Worker INSERT into `archived_files` uses columns `filename`, `compressed_size_bytes`, `metadata_snapshot`, `archive_status`, `error_message` (:311-325) not in migration (:50-89). Same caveat.
- BUG-3: `retention_policy_runs` writes `bytes_archived` (worker :182, :364), but the migration has `total_bytes_archived`; the GET :id stats query reads `total_bytes_archived` (:102).
- BUG-4: Restore INSERT into `file_restorations` (routes :636-646) uses `restoration_path`, `reason`, `restoration_status` and omits NOT NULL `file_id`. The history route reads `fr.restored_by` and `restoration_status` (:784, :793).
- BUG-5: Local archive path is stored as the full path including the base directory (`archivePath: fullArchivePath`, service :421), but `restoreFromLocal` joins the base again (:429), producing a doubled prefix such as `archive/archive/...`.
- BUG-6: Restore never updates `archived_files` (`is_restored`, `restored_at`, `restored_by`, status), so restores are not reflected in the archive list and can be repeated.
- BUG-7: `archived_by` hardcoded to 1 for automated archival (worker :325).
- BUG-8: Run marked 'completed' even if every file failed (:359-369); a failed file leaves an `archived_files` row, and the "already archived" check (:203-208) matches it, so failed files are never retried despite the comment "allows retry later" (:306-307).
- BUG-9: `compressedSize` and "compression_ratio" imply compression, but none is performed; the ratio is always 1.00 (worker :267, service :238).
- BUG-10: Failure-path UPDATE (worker :389-396) after ROLLBACK targets all 'running' rows for the policy and cannot mark the rolled-back run.
- BUG-11: Schedule check uses local hour (`getHours`) but UTC date for `lastRunDate` (:71-73); the in-memory date means a restart in the 01:00 hour re-runs. The comparison `getMinutes() < targetMinute + 60` is always true.
- BUG-12: `next_run_at`, `last_run_at` are never maintained by the worker; `run_frequency` has no effect on scheduling (the worker is always daily).
- BUG-13: Manual `bytesArchived` returned to the client is taken from `result.bytesArchived`, which `evaluatePolicy` returns; this works for the single-policy path only.
- BUG-14: DELETE of a policy with run history: FK from `retention_policy_runs.policy_id` has no cascade (migration :135) and the route does not delete runs, so it returns 500 (inferred from the schema).
- BUG-15: Restore holds a DB transaction open during storage I/O, and a failed restore still COMMITs and returns HTTP 200 (:736-749).
- BUG-16: `GET /` stats `SUM(af.original_size_bytes)` is multiplied by the join but only one join, so no fan-out; however `COUNT(af.id)` is returned as a string from pg (bigint). Minor; not counted as a bug.

### DEAD
- DEAD-1: `deleteArchivedFile` and the `deleteFrom*` methods (service :167, :256, :317, :377, :438): no caller found in the files read; no permanent-delete route exists although the DELETE error message tells users to "permanently delete archived files first" (routes :315). Callers were searched only in server.js, the service, and backend/routes.
- DEAD-2: `GET /restorations/history` is not called from either FE page.
- DEAD-3: `retention_policies.access_pattern`, `tags`, `max_file_size_mb`, `min_quality_score` (flat) are stored but never evaluated by the worker.

### SECURITY
- SEC-1: `criteria.custom_sql_filter` is concatenated raw into the SELECT (worker :493-498) with an in-code comment acknowledging no sanitization. Whoever can set `criteria` (no route currently writes it) controls SQL run by the worker.
- SEC-2: `restore_path` from the request body is used unvalidated as the destination (routes :633; service :432-435, :253). A settings:write user can write archived content to any path the server process can write to (path traversal and overwrite).
- SEC-3: `archive_path_prefix` and `local_archive_path` flow into `path.join` unvalidated (service :43, :399-400).
- SEC-4: Manual execute and restore have no audit middleware on the route (restore logs in code); execute is not audited.
- SEC-5: Permissions are the generic `settings:*`; no retention-specific role and no ownership scoping.
- SEC-6: `SELECT * FROM connections` loads connection configs (may include credentials) into memory (service :462); not returned to clients.
- SEC-7: `limit` and `offset` are uncapped, allowing very large page requests.

### UNCLEAR
- UNC-1: Whether another migration adds `criteria`, `storage_config`, `archive_status`, etc. (see Open questions).
- UNC-2: `access_pattern` ('cold','warm','hot') has no evaluating code.
- UNC-3: `max_file_size_mb` and `min_quality_score` in the flat model mean "archive larger/lower"; the worker's `min_file_size_bytes` means "archive smaller than". Intended semantics are not stated.
- UNC-4: Hardcoded `'./archive'` default, with no config override.

## Domain terms
- Retention policy / policy: rule set plus archive destination.
- Archive / archived file / archived_files row: the record of a file moved or copied to archive storage.
- Restoration / restore: copying an archive back to a path; `file_restorations` row.
- Run: one `retention_policy_runs` execution row.
- `criteria` (worker) vs flat rule columns (routes); `storage_config` vs `archive_storage_type`, `archive_connection_id`, `archive_path_prefix`.
- Storage type aliases: s3 = aws; gcs = google; local = filesystem.
- "Compressed size" (worker/service) = raw archived bytes; "original size" = `original_size_bytes`.
- `status` (migration) = `restoration_status` (route) = `archive_status` (for archived files).
- `filesMarkedForArchival` (API) = `files_archived` (DB).
- Priority: lower number runs first (migration :31; ORDER BY ASC).
- Drop of a "deleted" archive: `is_deleted` flag.

## Open questions
1. Is there another migration or runtime DDL adding `criteria`, `storage_config`, `archive_status`, `filename`, `compressed_size_bytes`, `metadata_snapshot`, `error_message`, `restoration_status`, `restoration_path`, `reason`, `bytes_archived`? I only read migrations/001. This determines whether BUG-1 to BUG-4 are real failures. A search of other migrations was not performed.
2. How is `criteria` / `storage_config` populated? No route in retentionRoutes.js writes them.
3. What does the FE `/api/storage-connections` endpoint return, and is it the same table as `connections` used by the service (service :462)? Not traced.
4. Are GCS and Azure archive and restore methods complete? Only S3 and local were read in detail (service :211-264, :398-452).
5. Is `deleteArchivedFile` called from anywhere outside the files searched?
6. What do `createAuditMiddleware` and `auditService.logAction` write, and how does `userId: 'system'` fit the audit table's user column type? Not traced.
7. What timezone does the server run in, and is a single-instance deployment assumed (the in-memory `isProcessing` / `lastRunDate` guards)?
8. What is the semantics of `authorize('settings:read'/'settings:write')` and which roles hold them? The middleware (backend/middleware/authorize) was not read.
9. Intended retry behaviour for failed archives (BUG-8).
