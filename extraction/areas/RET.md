# RET - Retention & archival

## Summary
Admins define retention policies (CRUD), run them manually or via a daily worker, and browse/restore archived files. All HTTP routes are mounted at `/api/retention-policies` (server.js:5401-5402) and gated by JWT plus `settings:read` / `settings:write` (retentionRoutes.js). The worker (`RetentionPolicyWorker`) is started at server.js:78-83 with schedule '01:00'. Archival goes through `ArchivalStorageService` (s3/gcs/azure/local).

The route layer and the worker/restore code disagree about the schema. Routes read and write flat columns (`retention_days`, `min_quality_score`, `archive_storage_type`, ...) defined in migrations/001_retention_archival_system.sql:8-41. The worker selects `criteria` and `storage_config` (retentionPolicyWorker.js:99), and no such columns exist in that migration or in the prod schema dump (attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql, `retention_policies` at :5937-5961). The worker also inserts into `archived_files` columns that neither the migration nor prod define (prod `archived_files` :4324-4351). Settled: no other migration or DDL in the repo adds `criteria`, `storage_config`, `archive_status` etc. (repo-wide search for `storage_config` and `retention_policies` finds only migrations/001, the worker, the routes, the prod dumps, database_ddl_2026-01-07.sql and a permission-name seed, seedProductionManual.sql:33). On prod, the automated and manual execution paths and the restore path cannot work (BUG-1 to BUG-4, BUG-17 to BUG-20). Only the CRUD, runs, `archives/list` (without `status` filter) and history routes can run, and the Retentions page itself fails to load (see Frontend).

## Entry points

All routes: `authenticateToken` then `authorize(permission)` (retentionRoutes.js:3-8). No ownership checks; any holder of the permission acts on any policy. `authorize` lets any "admin-level" user bypass the permission check (backend/middleware/authorize.js:31 calls `userHasAdminAccess`; the logic is in backend/utils/permissionHelpers.js:80-92: admin role, or `users:write` / `roles:write` / `project_management:write`).

Audit: a global `app.use(createAuditMiddleware(auditService))` at server.js:606 runs before all routes (including every route here). It runs before `authenticateToken`, so its entry has a null user (auditMiddleware.js:140). `createAuditMiddleware` takes a single parameter (auditMiddleware.js:124); the extra arguments passed by the per-route calls (`'retention_policy','create'` etc., retentionRoutes.js:134, :216, :300) are ignored, and entity type/action are derived from path and method (auditMiddleware.js:28-100). Create, update and delete therefore get two audit rows each (global + per-route); execute and restore get the global row only (plus restore's in-code `logAction`).

### GET /api/retention-policies (retentionRoutes.js:15)
- Auth: settings:read. Inputs: query `enabled` ('true' means true, any other value means false, line 37), `storage_type` (filters `archive_storage_type`, :41-44).
- Output: `{success, policies, count}`. Each row has `created_by_name`, `archived_files_count`, `total_bytes_archived` (LEFT JOIN on `archived_files` where `is_deleted=false`, :22-30). Ordered by `priority ASC, name ASC` (:48).
- Errors: 500 'Failed to fetch retention policies'.

### GET /api/retention-policies/:id (:72)
- Auth: settings:read. Returns `{success, policy}` with `created_by_name`, `updated_by_name`, and `stats` (:98-111).
- Stats query: `SUM(total_bytes_archived)`, `MAX(completed_at)` over runs with `status='completed'` (:98-106). It reads `files_archived` and `total_bytes_archived` from `retention_policy_runs`. These columns exist in prod (`retention_policy_runs` dump :5973-5989), so this route works there.
- A non-numeric `:id` (e.g. `/abc`) is passed to an integer column and returns a DB error 500.
- Errors: 404 'Retention policy not found'; 500.

### POST /api/retention-policies (:131)
- Auth: settings:write; per-route audit middleware (:134; the `'retention_policy','create'` arguments are ignored, see above).
- Inputs (body): name, description, enabled (default true), retention_days, min_quality_score, max_file_size_mb, file_types, tags, access_pattern, custom_condition, archive_storage_type, archive_connection_id, archive_path_prefix, priority (default 50), run_frequency (default 'daily') (:137-153).
- Validation: only `name` and `archive_storage_type` required, else 400 (:156-161). No validation of numeric ranges, storage type values, or `run_frequency` values.
- `next_run_at`: now+1 day (daily), +7 days (weekly), +1 month (monthly); any other frequency leaves it at now (:164-171). Nothing in the worker reads `next_run_at`.
- Output: 201 `{success, policy, message}`. `created_by` = `req.user.id`.
- Errors: 500.

### PUT /api/retention-policies/:id (:213)
- Auth: settings:write; per-route audit middleware (:216; arguments ignored).
- Update uses `COALESCE($n, col)` for every field (:241-255). Fields cannot be cleared to NULL, and `enabled=false` works only because false is not NULL.
- Sets `updated_by`. `updated_at` is set by a trigger that exists only in the migration (migrations/001 :174-177); neither prod schema dump contains a retention `updated_at` trigger, so on prod nothing in the code path shown sets `updated_at` (not otherwise verified).
- No validation. 404 if not found; 500 on error.

### DELETE /api/retention-policies/:id (:297)
- Auth: settings:write; per-route audit middleware (:300; arguments ignored).
- Rule: 400 if any `archived_files` row for the policy has `is_deleted=false` (:306-317). Otherwise hard `DELETE`.
- Referential integrity: `retention_policy_runs.policy_id` (prod dump :7718) and `archived_files.policy_id` (prod dump :7366) reference the policy with no ON DELETE clause (migration :135 for runs). A policy with run history, or with any `archived_files` row (including `is_deleted=true` rows, which the 400 check does not count), fails at the DB and returns 500. Not otherwise handled.
- Errors: 404; 500.

### POST /api/retention-policies/:id/execute (:355)
- Auth: settings:write. No per-route audit middleware; the global middleware at server.js:606 still logs the request, with a null user.
- Rules: 404 if missing; 400 'Cannot execute disabled policy' if not enabled (:376-381). Calls `retentionWorker.executeManually(parseInt(id))` (:390).
- The call is synchronous: the HTTP request waits for the full evaluation.
- Output: `{success, message, filesEvaluated, filesMarkedForArchival, bytesArchived, duration_ms}`. `bytesArchived` is read from the result of `executeManually`, which takes it from `evaluatePolicy` (worker :537-543).
- Errors: 500 generic. On prod `executeManually` throws at its SELECT (worker :525, missing `criteria`/`storage_config`), so this route returns 500. `req.user.id` is never recorded as executor on the run (the worker's run INSERT does not set `executed_by` or `triggered_by`).

### GET /api/retention-policies/:id/runs (:420)
- Auth: settings:read. Query `limit` (default 50), `offset` (default 0), passed straight into SQL params (:426, :437) with no cap or numeric validation. Non-numeric values give a DB error and a 500. (The response echoes `parseInt` values while the raw strings go to SQL.)
- Output: `{success, runs, total, limit, offset}`. Rows are joined to `users` for `executed_by_name`.

### GET /api/retention-policies/archives/list (:466)
- Auth: settings:read. Query: `policy_id`, `status` (matches `archive_status`, :500, :542), `start_date`, `end_date` (cast `::timestamptz` against `archived_at`), `limit` (default 100), `offset` (default 0) (:471-514).
- Always filters `is_deleted=false`. Ordered by `archived_at DESC`.
- Output: `{success, archives, pagination{total, limit, offset, hasMore}}`.
- Joins `files f ON af.file_id = f.file_id`, `users u` (`archived_by_email`). The SELECT uses `af.*` (:475); `archive_status` is referenced only in the optional `status` filter. With no `status` filter the list works on prod, returning rows without an `archive_status` field; with `status` it errors (column absent in prod).
- Route order: `/:id` (:72) is registered before `/archives/list`, but since `/archives/list` has two segments it does not collide with `/:id`.

### POST /api/retention-policies/archives/:id/restore (:583)
- Auth: settings:write. No per-route audit middleware; the global middleware logs the request with a null user, and `auditService.logAction` is called in code (:673, :705).
- Inputs: body `restore_path`, `reason`.
- First statement of the handler is `const client = await dbPool.getClient()` (:587), outside the `try` (:589). `dbPool` is the DI object from backend/di/bootstrapper.js:29-80, which exposes query/connect/end/on/off/removeListener and no `getClient` (no `getClient` in bootstrapper.js or server.js). Every call therefore throws a TypeError before any step below and is forwarded to the Express error handler (about 500). The flow below is what the code would do if that call worked.
- Flow, inside one transaction (BEGIN):
  1. Select the archived file (not deleted) joined with `rp.storage_config` and the original file path (`f.file_path`, :600-601). Neither `retention_policies.storage_config` nor `files.file_path` exists in prod (`files` dump :4983-5021). 404 if none.
  2. 400 `Cannot restore file with status: X` unless `archive_status === 'archived'` (:618).
  3. `storageConfig` = policy `storage_config`, else `{storage_type:'local', local_archive_path:'./archive'}` (:627-630).
  4. Destination = `restore_path` || `archivedFile.original_path` || `./uploads/${filename}` (:633).
  5. INSERT `file_restorations` with `restoration_status='pending'`, `reason || 'Manual restoration'`.
  6. `storageService.restoreFile(archive_path, destination, storageConfig)`. Sets status 'completed' or 'failed' and writes a SUCCESS or FAILURE audit entry using the transaction client.
  7. UPDATE `file_restorations` with the status, `completed_at`, `error_message`; COMMIT.
- Output (code-level): `{success: status==='completed', restoration, message}`. A failed restore still returns HTTP 200 with `success:false` (:738-749).
- Side effects (code-level): writes the file to the caller-supplied path. The path is not validated or restricted (see SECURITY).
- Not done: `archived_files.archive_status`, `is_restored`, `restored_at`, `restored_by` are never updated after a restore. A file can be restored repeatedly.
- Errors: outer catch rolls back and returns 500. Even if `getClient` existed, steps 1 and 5 would fail on prod columns.

### GET /api/retention-policies/restorations/history (:767)
- Auth: settings:read. Query: `status`, `start_date`, `end_date` (against `fr.requested_at`), `limit` (default 50), `offset` (default 0).
- Joins `users u ON fr.restored_by = u.id` (:784). The migration's `file_restorations` has `requested_by`, not `restored_by`; the restore route writes `requested_by`. Prod `file_restorations` (dump :4883-4900) also has `requested_by`, not `restored_by`.
- Selects `af.filename` (:777), which does not exist in `archived_files` (migration or prod), so the route errors on prod even without filters.
- Filters on `fr.restoration_status`; the migration and prod column is `status`.
- Output: `{success, restorations, pagination{...}}`.

### Daily worker: RetentionPolicyWorker (backend/workers/retentionPolicyWorker.js)
- Trigger: `start()` runs `setInterval` hourly (:39-41) and also calls `checkAndRun()` immediately at startup (:44). Server shutdown calls `stop()` (server.js:14235-14236).
- Schedule check: runs when `now.getHours() === targetHour` and `getMinutes() >= targetMinute && < targetMinute+60` (:71), i.e. any minute in the 01:00 hour, server-local time. `lastRunDate` is kept in memory and set from UTC date (`toISOString`, :73). It resets on restart, so a restart during the 01:00 hour re-runs. The local hour check and UTC date key can disagree near midnight in non-UTC zones.
- `run()`: selects `id, name, criteria, description, storage_config` from `retention_policies` where `enabled = true` ordered by `priority ASC` (:98-103); evaluates each policy in sequence, errors per policy are logged and the loop continues. `isProcessing` guards concurrency inside one process only. On prod the SELECT fails (columns absent); the failure is caught by the outer try, logged and swallowed, so nothing is ever archived.
- `evaluatePolicy(policy)` (:166): one transaction per policy.
  - INSERT `retention_policy_runs` with status 'running' (:174-184), using columns `files_archived`, `bytes_archived`.
  - `buildFileQuery(policy.criteria)` (:412). It selects `f.file_path` (:421), which does not exist in prod `files`. A NULL `criteria` would throw a TypeError at `criteria.max_age_days` (:435). Criteria keys and conditions:
    - `max_age_days`: `f.created_at < NOW() - (n * INTERVAL '1 day')`
    - `min_quality_score`: quality_score < value
    - `max_quality_score`: quality_score > value
    - `min_file_size_bytes`: file_size < value
    - `max_file_size_bytes`: file_size > value
    - `file_types`: `f.file_type = ANY(...)`
    - `required_tags`: file must have all tags (`required_tags.length` is interpolated into the SQL, :486)
    - `custom_sql_filter`: appended raw (`(${criteria.custom_sql_filter})`, :497)
    - Appended `LIMIT 10000` (:506).
  - For each matching file: skip if an `archived_files` row exists with `is_deleted=false` (:203-214), including rows with status 'failed'. Then call `storageService.archiveFile(fileInfo, policy.storage_config)`. `file_path` falls back to `./uploads/${filename}` (:220).
  - Writes an audit entry (userId 'system', actionType 'ARCHIVE') for success and for failure. A null `storage_config` throws a TypeError before any upload, at the destructuring in `archiveFile` (archivalStorageService.js:30), inside the inner try; it goes to the `archiveError` catch (worker :275), is audited as FAILURE and the file is recorded as 'failed'. `auditService.logAction` rethrows on failure (AuditService.js:123-125); an audit failure in the success path lands in the per-file catch and the file is recorded as 'failed' although it was already archived.
  - INSERTs an `archived_files` row regardless of outcome, with `archived_by` hardcoded to 1 (:325) and `archive_status` 'archived' or 'failed'.
  - `filesMarkedForArchival` and `bytesArchived` count successes only; bytes use `compressedSize || size` (:347). `files_evaluated` is the number of query matches, including ones skipped as already archived (:195).
  - Run row set to 'completed' even when individual files failed (:359-369).
  - On exception: ROLLBACK, then UPDATE all rows `WHERE policy_id=$2 AND status='running'` to 'failed' (:389-396). Since the run INSERT was rolled back too, this matches only other (stale) running rows.
  - Copies already written to S3/GCS/Azure/local are not rolled back with the DB transaction. If an exception rolls back the run (for example a failed `archived_files` INSERT aborts the PG transaction and the later UPDATE/COMMIT fail), the `archived_files` rows are lost but the copies stay in storage, and the next run archives the same files again.
- `executeManually(policyId)` (:518): single policy requires `enabled = true`, else throws 'Policy not found or not enabled'. With no id it calls `run()` (the route always passes an id).
- Source files are never deleted or moved after archiving. Only a copy is made (archiveToLocal/archiveToS3 read and write, no unlink of the original).

### Storage service: ArchivalStorageService (backend/services/archivalStorageService.js)
- `archiveFile` (:29): switch on `storage_type`: s3/aws, gcs/google, azure, local/filesystem; otherwise throws `Unsupported storage type`.
- `storage_config` shape as read by the service (it is not defined by any DDL): `storage_type` (archive :30, restore :107, delete :168), `connection_id` (cloud types), `archive_path_prefix` (archive path, :30, :43), `local_archive_path` (local, default './archive', :399, :428, :439). The restore route's fallback config is `{storage_type:'local', local_archive_path:'./archive'}` (routes :627-630).
- Archive path: `${prefix}/${yyyy}/${mm}/${dd}/${fileId}_${filename}`, prefix default 'archive', date in server local time (:476-484). (A source comment says filename_fileId; the code builds fileId_filename.)
- S3: reads the whole file into memory, SHA-256 checksum, `s3.upload` to `connection.config.bucket_name` (:211-241); credentials from `connection.config.access_key`, `secret_key`, `region` (default 'us-east-1', :268-270). Connection loaded via `SELECT * FROM connections WHERE id=$1` (:461-471).
- GCS (:278-337) and Azure (:343-392) also read the whole file into memory; GCS uses `config.bucket_name`, `project_id`, `private_key`, `client_email` (:282, :328-330); Azure uses `config.account_name`, `account_key`, `container_name` (:385, :388).
- Wrong connection table: `connections` in prod (dump :2907-2923) has a serial `id` and no `config` column, whereas the FE connection list and `retention_policies.archive_connection_id` (uuid) correspond to `storage_connections` (varchar `connection_id`, `config jsonb`, dump :6108-6129). For every cloud type on prod, the lookup finds no usable row or `connection.config.*` is undefined/throws, so S3, GCS and Azure archive and restore fail.
- Restore for S3 (:253) and GCS/Azure (:314, :374) does not create the destination directory; local restore does (`fs.mkdir` :432), so a nested destination fails for cloud types.
- Local: copies to `<local_archive_path || './archive'>/<archivePath>` plus a `.metadata.json` sidecar (:398-425).
- Despite the `compressedSize` naming, there is no compression; the size is the raw file length (:238, :422).
- `restoreFile` (:106) mirrors the switch; `deleteArchivedFile` (:167) exists.
- The checksum is returned but the worker does not store it (the INSERT has no checksum column value).

### Frontend
- /retention-policies -> src/pages/RetentionPolicies.jsx (App.jsx:440). Calls GET list (:57), `/api/storage-connections` (:60), POST (:163), PUT (:167), DELETE (:190), POST execute (:208). Form uses flat fields such as `retention_days` parsed with parseInt (:153). `/api/storage-connections` has no backend route (repo-wide search of js/jsx finds only this FE call and a table-name list at SystemCleanup.jsx:49); the unmatched request returns 404, and because it is inside `Promise.all` (jsx :56-66) the whole page load fails with "Failed to load retention policies", so the page cannot show policies.
- /archived-files -> src/pages/ArchivedFiles.jsx (App.jsx:441). Calls GET `/api/retention-policies` (:32), GET `archives/list` (:55), POST `archives/:id/restore` (:92) with `restore_path` (default `archive.original_path || ./uploads/<filename>`, :81) and `reason`. Alerts 'File restored successfully!' on success (:98). The row Restore button is `disabled={archive.archive_status !== 'archived' || restoringId === archive.id}` (:269); prod `archived_files` has no `archive_status`, so every Restore button is permanently disabled. Restoration history endpoint is not called from either page (grep of both pages found no use).

## Data touched
- `retention_policies` (read/write): migration and prod columns are flat (retention_days, min_quality_score, max_file_size_mb, file_types, tags, access_pattern, custom_condition, archive_storage_type, archive_connection_id, archive_path_prefix, priority, run_frequency, last_run_at, next_run_at). The worker additionally reads `criteria` and `storage_config`; the restore route reads `rp.storage_config`. Neither column exists in prod, and no code writes them (only routes :174 and :239 write `retention_policies`, flat columns only).
- `archived_files` (migration :50-89): columns include `original_filename`, `archive_storage_type`, `archive_checksum`, `original_metadata`, `is_restored`, `is_deleted`. The worker inserts `filename`, `compressed_size_bytes`, `metadata_snapshot`, `archive_status`, `error_message`, which are in neither the migration nor prod.
- `file_restorations` (migration :100-124, prod :4883-4900): `status`, `restored_to_path`, `restoration_reason`, `requested_by`; `file_id` NOT NULL. The route writes `restoration_path`, `reason`, `restoration_status` and also omits the NOT NULL `file_id`.
- `retention_policy_runs` (migration :133-155, prod :5973-5989): `total_bytes_archived`, `files_skipped`, `triggered_by`, `executed_by`. The worker writes `bytes_archived`.
- Also read: `files` (no `file_path` column in prod), `users`, `file_tags`, `tags`, `connections` (service; likely the wrong table, see Storage service); audit log via AuditService.
- Filesystem: `./archive` (local archives), `./uploads` (restore default).
- Schedule of record: no table-driven schedule; `run_frequency` and `next_run_at` are stored but unused by the worker.

## Flags

### DUPLICATE
- DUP-1: Two competing policy shapes. Flat columns (migration; routes; FE) versus `criteria` and `storage_config` (worker; restore route). Criteria names differ: `retention_days` vs `max_age_days`, `max_file_size_mb` vs `max_file_size_bytes`, `tags` vs `required_tags`, `custom_condition` vs `custom_sql_filter`, `archive_storage_type` vs `storage_config.storage_type`.
- DUP-2: Status columns named differently across layers: `status` (migration) vs `restoration_status` (routes); `archive_status` (routes/worker) not in the migration or prod.
- DUP-3: Two connection stores: `connections` (service, serial id, no config) versus `storage_connections` (FE, `archive_connection_id` uuid, `config jsonb`).
- DUP-4: Audit logged twice for create/update/delete (global middleware server.js:606 plus per-route middleware).

### BUG
- BUG-1: Worker selects `criteria` and `storage_config` from `retention_policies` (retentionPolicyWorker.js:99, :525), columns absent from migration 001 (:8-41) and prod (:5937-5961). `run()` fails at the SELECT, logged and swallowed; `executeManually` throws and the execute route returns 500. The daily job and the Execute button do not work on prod.
- BUG-2: Worker INSERT into `archived_files` uses columns `filename`, `compressed_size_bytes`, `metadata_snapshot`, `archive_status`, `error_message` (:311-325) not in migration (:50-89) or prod (:4324-4351). The INSERT also omits the NOT NULL `archive_storage_type` (prod :4331, migration :59), and for a failed archive supplies `archive_path` NULL (`let archivePath = null`, worker :227; only set on success, :238) into NOT NULL `archive_path` (prod :4333, migration :61). So it would still fail if the missing columns were added; a failed insert aborts the PG transaction and rolls back the run.
- BUG-3: `retention_policy_runs` writes `bytes_archived` (worker :182, :364), but migration and prod have `total_bytes_archived`; the GET :id stats query reads `total_bytes_archived` (:102).
- BUG-4: Restore INSERT into `file_restorations` (routes :636-646) uses `restoration_path`, `reason`, `restoration_status` and omits NOT NULL `file_id`. The history route reads `fr.restored_by` and `restoration_status` (:784, :793) and selects `af.filename` (:777), which does not exist in `archived_files` (migration or prod), so it errors on prod even without filters.
- BUG-5: Local archive path is stored as the full path including the base directory (`archivePath: fullArchivePath`, service :421), but `restoreFromLocal` joins the base again (:429), producing a doubled prefix such as `archive/archive/...`.
- BUG-6: Restore never updates `archived_files` (`is_restored`, `restored_at`, `restored_by`, status), so restores are not reflected in the archive list and can be repeated.
- BUG-7: `archived_by` hardcoded to 1 for automated archival (worker :325).
- BUG-8: Run marked 'completed' even if every file failed (:359-369); a failed file leaves an `archived_files` row, and the "already archived" check (:203-208) matches it, so failed files are never retried despite the comment "allows retry later" (:306-307).
- BUG-9: `compressedSize` and "compression_ratio" imply compression, but none is performed; the ratio is always 1.00 (worker :267, service :238).
- BUG-10: Failure-path UPDATE (worker :389-396) after ROLLBACK targets all 'running' rows for the policy and cannot mark the rolled-back run.
- BUG-11: Schedule check uses local hour (`getHours`) but UTC date for `lastRunDate` (:71-73); the in-memory date means a restart in the 01:00 hour re-runs. The comparison `getMinutes() < targetMinute + 60` is always true.
- BUG-12: `next_run_at`, `last_run_at` are never maintained by the worker; `run_frequency` has no effect on scheduling (the worker is always daily).
- BUG-14: DELETE of a policy with run history: FK from `retention_policy_runs.policy_id` has no ON DELETE (migration :135; prod :7718) and the route does not delete runs, so it returns 500. The same applies to `archived_files.policy_id` (prod :7366), including `is_deleted=true` rows that the 400 check ignores.
- BUG-15: Restore holds a DB transaction open during storage I/O, and a failed restore still COMMITs and returns HTTP 200 (:736-749).
- BUG-17: Restore route calls `dbPool.getClient()` (routes :587) outside the `try`; the DI pool has no such method (bootstrapper.js:29-80), so every restore request throws.
- BUG-18: `files.file_path` does not exist in prod `files`; the worker query (:421) and the restore SELECT (routes :601) both select it, an additional independent failure for each path.
- BUG-19: `/api/storage-connections` is called by the Retention Policies page inside `Promise.all` (RetentionPolicies.jsx:56-66) but no backend route exists, so the page load fails.
- BUG-20: ArchivedFiles.jsx:269 disables Restore unless `archive_status === 'archived'`; the column is absent in prod, so every Restore button is disabled.
- BUG-21: Service reads `connections` (serial id, no `config`) instead of `storage_connections` (service :462); all cloud archive and restore fail on prod.
- BUG-22: Archive copies in storage are not rolled back with the DB transaction; after a rollback the files are re-archived on the next run (see worker).
- BUG-23: `AuditService.logAction` rethrows (AuditService.js:123-125); in the worker's success path an audit failure marks an already archived file as 'failed'.
- BUG-24: S3/GCS/Azure restore does not `mkdir` the destination directory (service :253, :314, :374), unlike local (:432).

### DEAD
- DEAD-1: `deleteArchivedFile` and the `deleteFrom*` methods (service :167, :256, :317, :377, :438): no caller anywhere in the repo (only the routes, worker and service reference the service); no permanent-delete route exists although the DELETE error message tells users to "permanently delete archived files first" (routes :315).
- DEAD-2: `GET /restorations/history` is not called from either FE page.
- DEAD-3: `retention_policies.access_pattern`, `tags`, `max_file_size_mb`, `min_quality_score` (flat) are stored but never evaluated by the worker.

### SECURITY
- SEC-1 (dormant/latent): `criteria.custom_sql_filter` is concatenated raw into the SELECT (worker :493-498) with an in-code comment acknowledging no sanitization. Not reachable on prod today: the `criteria` column does not exist (prod :5937-5961), so the worker fails at its SELECT first, and no code writes `criteria` (only routes :174 and :239 write `retention_policies`, flat columns). The route-side `custom_condition` is stored but never read by the worker. It becomes live SQL injection if a `criteria` column and a writer are added; keep it visible for the rebuild.
- SEC-2: `restore_path` from the request body is used unvalidated as the destination (routes :633; service :432-435, :253). A settings:write user could write archived content to any path the server process can write to (path traversal and overwrite). Currently unreachable on prod because restore fails earlier (BUG-17).
- SEC-3: `archive_path_prefix` and `local_archive_path` flow into `path.join` unvalidated (service :43, :399-400).
- SEC-4: Execute and restore have no per-route audit middleware, but the global middleware (server.js:606) logs them with a null user (it runs before `authenticateToken`, auditMiddleware.js:140); restore also logs in code. The audit entry for these routes does not identify the caller.
- SEC-5: Permissions are the generic `settings:*`; no retention-specific role and no ownership scoping. The seed file grants `retention_policies:read/write` and `archived_files:*` (seedProductionManual.sql:33), but nothing checks those permissions. `authorize` also lets admin-level users bypass the check (authorize.js:31; logic at permissionHelpers.js:80-92).
- SEC-6: `SELECT * FROM connections` loads connection configs (may include credentials) into memory (service :462); not returned to clients.
- SEC-7: `limit` and `offset` are uncapped, allowing very large page requests.

### UNCLEAR
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
- `connections` (service lookup) vs `storage_connections` (FE connection list / `archive_connection_id`).

## Open questions
1. What timezone does the server run in, and is a single-instance deployment assumed (the in-memory `isProcessing` / `lastRunDate` guards)?
2. Which roles hold `settings:read` / `settings:write`? `authorize` was read only for its admin-level bypass; role-to-permission assignments were not traced.
3. Intended retry behaviour for failed archives (BUG-8).
4. How does `userId: 'system'` (worker audit calls) fit the audit table's user column type? Not traced.
5. (Closed: BUG-21 stands; the service reads `connections`, which on prod has no `config` column, whereas `storage_connections` has `config jsonb`.)
