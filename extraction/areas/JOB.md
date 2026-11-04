# JOB: Jobs & job monitoring

Schema basis: "prod DDL" = `attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql`. "Migration" = `backend/migrations/*`. Each DB claim below names its basis. Nothing was run against a live database.

## Summary
Two unrelated things share the name "job" and the `/api/jobs` URL space.
1. Transformation jobs (table `transformation_jobs`): execution records of ETL/mapping runs. Served by the router `backend/routes/jobs.js`, mounted at `server.js:5234-5235` as `app.use('/api/jobs', authenticateToken, jobRoutes)`. Access is by project membership (`validateJobAccess`, admin bypass via `userHasAdminAccess`).
2. Legacy "Process Management" jobs (table `jobs`, tied to `business_processes` and `groups`) plus `job_schedules`. Served by handlers in `server.js` at 12558-13284. Access is by group membership.

The router is mounted at `server.js:5235`, before the legacy handlers (12558+). Express runs the router first, so the legacy `GET /api/jobs` and `GET /api/jobs/:id` are shadowed, provided the `require` at `server.js:5234` succeeds. The mount is wrapped in try/catch that only logs on failure (`server.js:5233-5239`); if it fails, the legacy handlers become live. Legacy `POST/PUT/DELETE /api/jobs`, `/api/jobs/:jobId/profiles`, `/run` and `/job-schedules` are not defined in the router, so they fall through to server.js.

Key defects found on the prod DDL as dumped (details in Flags): `GET /api/jobs/:id/full`, which both job pages call, queries a table `job_metrics` that is defined nowhere in the repo, so it would return 500; `GET /api/jobs/v2` selects five columns that are not in the prod `transformation_jobs`; cancel only changes the DB row and never stops the engine.

Frontend: Jobs.jsx lists and cancels transformation jobs. ETLJobDetails.jsx shows one job. Monitor.jsx does NOT use `/api/jobs` (see Flags).

## Entry points

### Router `backend/routes/jobs.js` (all behind `authenticateToken`, `server.js:5235`)
Common: ids go to `validateJobAccess` (`backend/utils/jobAccessHelpers.js:16`). It looks up `transformation_jobs.job_id = $1` (:20-25). Not found gives 404 (:27-31). Project id is `tj.project_id`, else the mapping's project via `transformation_mappings` (:36-46). Non-admins whose project is not in `getUserProjects(user.id)` get 403 'You do not have access to this job' (:49-58). If the job has no project id, access is granted to everyone (:50). That branch is dead on a DB matching the prod DDL, where `transformation_jobs.project_id` is `INTEGER NOT NULL` (prod DDL line 6243); the migration `backend/migrations/addProjectIdToRemainingTables.js:98-105` backfills and sets NOT NULL too.

`userHasAdminAccess` (`permissionHelpers.js:80-92`) grants admin by role, or by `users:write`, `roles:write` or `project_management:write`. `getUserProjects` (`requireProjectAccess.js:362-433`) returns `[]` on any DB error (:426-432), so an error becomes "no projects". No JOB route uses `requireProjectAccess` or `authorizeProjectResource`, so their client-supplied `project_id` weaknesses are not exposed here.

1. GET /api/jobs/stats/summary (jobs.js:18). No role check. Query `days` (default 30) and `projectId`.
   - Tries materialized view `mv_dashboard_summary` (:28-67). With `projectId` it filters `project_id = $1`, otherwise `project_id = 0`. On any error or empty result it falls back to a live query on `transformation_jobs` and `anomalies` with `created_at >= now - days` (:76-104).
   - MV path hardcodes `total_rows_failed: 0`, `medium_severity: 0`, `low_severity: 0`, and `total_rows_written = total_records_processed` (:51-62). `open_anomalies = total_anomalies`.
   - Response is `{period: "Last N days", jobs, anomalies, source}`. Error is 500.
   - Neither path filters by the caller's projects. The live path ignores `projectId`. The MV path ignores `days`. On the MV path `projectId` comes from the query with no membership check (:36-40), so any authenticated user can read any project's counts if the MV exists.
   - The MV is created only in migration `enterprisePerformanceOptimizations.js:277`; no `mv_dashboard_summary` appears in any `*.sql` file in the repo, so it is not in the prod DDL. Its definition uses `tj.records_processed` (:287), a column absent from the prod `transformation_jobs`, and the migration swallows the error (:302). Inference: on a DB matching the prod DDL the view probably does not exist and the live path is always taken.
2. GET /api/jobs/v2 (:125). Cursor pagination.
   - Query: status, mappingId, projectId, cursor, limit (default 50, capped `Math.min(...,100)` :137), sortBy (allowed created_at/end_time/status, else created_at), sortOrder (ASC else DESC).
   - Non-admin with no projects gets an empty page (:146-148). Non-admins are filtered by `tm.project_id = ANY(...)` (:187-191). The `projectId` query is an extra AND filter on top of the membership filter, not a bypass. The query fetches limit+1 rows to detect more pages (:225).
   - The SELECT includes `tj.records_processed`, `tj.records_failed`, `tj.execution_type`, `tj.jira_issue_key` (:163-167); these are not in the prod DDL `transformation_jobs` (lines 6220-6251), so against that schema the query would fail and the route returns 500 (inference from DDL, not run).
   - Joins mapping group, n-step workflow and visual workflow names. Error is 500.
3. GET /api/jobs/ (:252). Offset pagination.
   - Query: status, mappingId, limit (50), offset (0), sortBy (created_at/end_time/status/mapping_name), sortOrder.
   - Same project filter and empty-result rule. Returns `{jobs, total, limit, offset}` with `tj.*` plus schedule fields. A separate count query is built (:339-369). The SELECT has `tj.*` together with `tm.project_id` and `s.id AS schedule_id` (jobs.js:283, 292), so the row has duplicate column names (`project_id`, `schedule_id`). With node `pg` the last one wins (inference about the driver, not run): `project_id` would be the mapping's project and `schedule_id` would be `schedules.id`, not the job's own values.
   - `limit` and `offset` are passed as raw strings to LIMIT/OFFSET (:334). There is no cap.
   - Ignores `business_process_id` (the FE sends it, see Frontend callers).
4. GET /api/jobs/:id (:390). `validateJobAccess`, then `getJobStatus` (`backend/services/jobExecutionEngine.js:5807`), which selects `job_id = $1`. Returns the job row only (logs fetched but dropped, :400). Errors: 403/404 from the helper; message containing 'not found' gives 404; otherwise 500.
5. GET /api/jobs/:id/logs (:421). Query `level`, `limit` (default 100, no cap). Selects `transformation_logs` by `job_id` (:430-441), ordered by timestamp ASC. Returns `{jobId, logs, total}`.
6. POST /api/jobs/:id/cancel (:464).
   - Requires `req.user.permissions` to include `'jobs:write'`, otherwise 403 (:467). The admin bypass does not cover this check. Then `validateJobAccess`.
   - `cancelJob` (jobExecutionEngine.js:5840): job not found throws; status `completed|failed|cancelled` gives 409 'Cannot cancel job: Job is already X' (:5855-5859). Otherwise `updateJob` sets `status='cancelled'`, `end_time=new Date()` (:5862); `updateJob` also computes and writes `duration_ms = end_time - start_time` (:951-961). It writes an info log 'Job cancelled by user' (:5867) and fires a notification via `setImmediate` (:5873-5883) with `userId: _cancelledJob.user_id` (:5875). `user_id` is not a column of the prod DDL `transformation_jobs`, so `userId` is undefined on that schema (inference).
   - Cancel never stops the engine. `cancelJob` only updates the DB row. The string 'cancelled' appears in the engine only at jobExecutionEngine.js:5855-5879; there is no check of the job status elsewhere in the engine, no abort signal and no queue removal. A running job keeps running, and its later final `updateJob` can overwrite the `cancelled` status.
   - Response `{message:'Job cancelled successfully', job}`.
7. GET /api/jobs/:id/anomalies (:511). Query `severity`, `status` (default 'open'). Reads `anomalies` by `job_id`, ordered by detected_at DESC.
8. GET /api/jobs/:id/metrics (:560). Reads `profiling_metrics` by `job_id`, ordered by profiled_at DESC.
9. GET /api/jobs/:id/profiling (:594). `validateJobAccess`, then `correlation_id` is read from `transformation_jobs WHERE job_id = $1`. 404 'Job not found' or 'No profiling data available for this job' (:608-616). Loads `files` by `correlation_id`, takes the first `file_role='source'` and `'target'`, and attaches `file_columns` ordered by `column_index`. Called by TransformationProfilingModal.jsx:29.
10. GET /api/jobs/:id/full (:685). Used by Jobs.jsx:101, ETLJobDetails.jsx:81 and useJobs.js:14. Fails on the prod DDL as dumped, for three reasons.
   - Job lookup: `SELECT * FROM transformation_jobs WHERE id = $1 OR correlation_id = $1` (:691). One parameter is compared with `id` (INTEGER, prod DDL line 6221) and `correlation_id` (VARCHAR(255), line 6244). Inference: Postgres cannot give `$1` both types and should reject it with an operator/type error (not run). The UI sends the string `job_id` (Jobs.jsx:487 passes `job.job_id`, see Frontend callers), which has the form "JOB-<ts>-<uuid>" (jobExecutionEngine.js:838) and matches neither column as intended. It would be 404 at best.
   - Metrics query: `SELECT metric_name, metric_value, recorded_at FROM job_metrics WHERE job_id = $1` (:729-734). `job_metrics` is defined in no `.js` or `.sql` file in the repo (grep finds only jobs.js:731), so the query errors, `Promise.all` (:711) rejects and the handler returns 500 'Failed to fetch job details' (:745-747). A `job_metrics` table created outside the repo would change this; confirm on a running DB.
   - Anomalies query: `anomalies WHERE job_id = $1` with `job.id` (:723-728), an integer. `anomalies.job_id` is `varchar(255)` (prod DDL line 2589) and holds the "JOB-..." string (insert at jobExecutionEngine.js:1609, per verifier). Even if the query ran it would match nothing (inference).
   - Logs query is correct: `transformation_logs WHERE job_id = job.job_id` LIMIT 1000, aliased (level, details, created_at) (:712-722). It selects `message`, which matches the prod DDL (line 6276) but not the migration (`createETLTransformationTables.js:107` names the column `log_message`).
   - Access: does NOT call `validateJobAccess`. Checks membership only if `!isAdmin && job.project_id` (:702-709) against `job.project_id`, with no mapping-derived fallback. Because `project_id` is NOT NULL in the prod DDL (line 6243), the falsy-`project_id` bypass is dead on that schema.
   - Success shape (never reached on the prod DDL): `{success:true, job, logs, anomalies, metrics}`. A 500 does not distinguish causes.

### Legacy handlers in `server.js` (all `authenticateToken` unless noted)
11. GET /api/jobs (12558). SHADOWED by #3 (never reached while the router mount succeeds). Behaviour if reached: it creates the 'Default Group' if missing (:12567-12582) and inserts the user into it (:12594). It then lists `jobs` for business processes in the user's groups (and Default Group), with `run_count: 0`, `last_run_time: null` placeholders (:12636-12642).
12. GET /api/jobs/:id (12653). SHADOWED by #4. Same default-group auto-enrol logic. Returns the job with `history: []`.
13. GET /api/jobs/:jobId/profiles (12745). No project/group access check, only JWT. Intended behaviour: read `profiling_metrics` by `job_id`, LIMIT 2, ordered by `profile_timestamp DESC, file_role DESC`, returning `source_profile`/`target_profile`/`hasBothProfiles` (:12789-12811). The `jobs/:id/profiles` URL is used by ETLJobDetails.jsx:127.
   - INFERRED, not run: this probably always returns 500 'Failed to fetch job profiles' (:12814). The scalar subquery at :12770-12787 is `SELECT json_agg(...) FROM file_columns fc WHERE ... ORDER BY fc.column_index`. It is an aggregate with no GROUP BY, yet it orders by the non-aggregated `fc.column_index` (:12787). Postgres should reject that ("must appear in the GROUP BY clause or be used in an aggregate function"), which fails the whole statement and lands in the catch. If so, the route never succeeds.
   - The 404 at :12800 is unreachable regardless: the outer SELECT (:12795-12797) always returns one row.
14. POST /api/jobs (12819). Body: name, description, business_process_id (required, 400 'Job name and business process are required'; must parse as an int, 400), source/target_connection_id, four settings jsonb (default `{}`), created_by, status (default 'active'). `description` is destructured (:12827) but never inserted; the comment at :12874 says there is no description column. `created_by` is overridden by `req.user.id`. The comment says access verification is skipped "temporarily to debug" (:12862-12863), so there is no group/ownership check. Inserts into `jobs` and returns 201 with the row. On error returns 500 with `details: err.message` and `code`. Logs the full request body.
15. GET /api/job-schedules (12916). Lists all `job_schedules` joined to `jobs`, newest first. No ownership or group filter.
16. GET /api/jobs/:jobId/job-schedules (12931). Lists `job_schedules` by `job_id`. No access check.
17. POST /api/job-schedules (12942). Body: job_id (required), type (default 'one-time'), one_time_date, cron_expression, enabled (`enabled !== false`, so default true). Validation: type 'one-time' needs one_time_date; type 'recurring' needs cron_expression (400). `next_run_time` is the one_time_date, or for anything else now + 24h (`24*60*60*1000`), with the cron expression not parsed (:12965-12973). When `type` is missing the stored type is 'one-time' but `next_run_time` is now+24h (:12967-12973), so the row is inconsistent. No check that the job exists or that the user has access to it. Returns 201. The INSERT lists only job_id, type, one_time_date, cron_expression, enabled, next_run_time (server.js:12976-12994) and omits `project_id`. `job_schedules.project_id` is `INTEGER NOT NULL` in the prod DDL (line 5270) and is added NOT NULL by `addProjectIdToConnections.js:83-99`, so on a DB from either source the insert should fail with a not-null violation and return 500 'Failed to create schedule' (:12998-12999; inferred from DDL, not run). The `server.js:6014-6025` bootstrap has no `project_id` column, so on a table created by that bootstrap alone the insert succeeds. The outcome depends on which source created the table.
18. PUT /api/job-schedules/:id (13003). Updates type, one_time_date, cron_expression, enabled and recomputes `next_run_time` with the same rule. There is no validation, and omitted `one_time_date`, `cron_expression` and `enabled` are written as NULL (server.js:13036-13041). An omitted `type` is also passed as undefined (NULL), but `job_schedules.type` is NOT NULL (prod DDL line 5262; bootstrap server.js:6017), so a PUT without `type` fails and returns 500 'Failed to update schedule'; it does not write NULL. 404 if not found. No ownership check.
19. DELETE /api/job-schedules/:id. Three registrations:
   - server.js:12000 has NO auth and deletes from `file_schedules` (not `job_schedules`). It wins by registration order. Response `{message, schedule}` (200) or 404.
   - server.js:12198 is a duplicate (no auth, `file_schedules`, response `{message}`), unreachable.
   - server.js:13055 has auth and deletes from `job_schedules`, unreachable because :12000 matches first.
   Effective behaviour: an unauthenticated DELETE `/api/job-schedules/:id` removes a row from `file_schedules` with that id.
20. POST /api/job-schedules/:id/enable (13072) and 21. POST .../disable (13092). Set `enabled` true/false and `updated_at`. 404 if not found. No ownership check.
22. PUT /api/jobs/:id (13113). `name` required (400). Access: caller must be in a group (`user_groups`) owning the business process (404 otherwise). It uses the strict membership join, NOT the Default Group fallback used by GET. A changed `business_process_id` needs access to the new process (403). The status falls back to the existing status, then 'active'. Other fields are overwritten with whatever is sent (undefined for omitted fields). Note `business_process_id !== existing` compares a raw body value (possibly string) to a number, so a string id always triggers the extra check.
23. DELETE /api/jobs/:id (13211). Same group-membership check, then `DELETE FROM jobs`. The comment says "cascade will delete history". In the prod DDL, `job_history` and `job_runs` have FKs to `jobs(id)` with `ON DELETE CASCADE` (prod DDL lines 7554, 7559), so the cascade exists on that schema (source: the `FileSence_prod_schema_Jan_05_1767780691950.sql` dump). `job_schedules` has no FK to `jobs`: its only FK in that dump is `fk_job_schedules_project` to `projects` (lines 7562-7564), and the `server.js:6014-6025` bootstrap declares none. Deleting a job therefore leaves its `job_schedules` rows as orphans. Returns `{message:'Job deleted successfully'}`.
24. POST /api/jobs/:id/run (13242). Requires permission `'job:execute'` (singular `job`, vs `'jobs:write'` for cancel), 403 otherwise. Group check as above. It does NOT run anything: it logs, returns `{message:'Job started successfully', job_history_id: Date.now().toString()}` (:13270-13279). This is a stub with a fake history id.

### Frontend routes
25. /jobs, /jobs/:jobId, /business-processes/:processId (Jobs.jsx; App.jsx:417-419). Lists via `GET /api/jobs?limit=100` + cache buster (:71), polls every 60000 ms (:42-46), detail via `/full` (:101), cancel via POST `/cancel` (:131). It also calls `/api/jira/connections` (:33). Rows are keyed and acted on by `job.job_id`: `handleViewJob(job.job_id)` (:487) and `openCancelModal(job.job_id)` (:495). So `/full` and `/cancel` receive the "JOB-..." string, not `id`. For `/cancel` that is the correct key (cancelJob selects `job_id`); for `/full` it is not (see #10).
26. /etl-jobs/:jobId (ETLJobDetails.jsx; App.jsx:420). `/full` (:81), polling every 5000 ms (:71-75), cancel (:108), profiles `/api/jobs/${jobId}/profiles` (:127).
27. /monitor (Monitor.jsx; App.jsx:396). Calls `/api/file-audit` (:91), `/api/file-audit/${rowId}/logs` (:282), `/api/bulk-profiling/jobs` (:180), and audit-ledger service functions. Auto-refresh every 5 s (labelled at :414). It is a file-audit / bulk-profiling monitor and does not call any endpoint of this area. Status-to-badge mapping: 'success'|'completed' success and 'failed'|'error' danger (:326-329).

### Frontend callers (grep of `src/` for `api/jobs`)
- `src/hooks/useJobs.js:7` GET `/api/jobs?limit=`; `:14` GET `/api/jobs/:id/full`.
- `src/components/TransformationProfilingModal.jsx:29` GET `/api/jobs/:id/profiling`.
- `src/api/jobsService.js` (uses `fetch`):
  - `getJobs` GET `/api/jobs` (:20); expects an array, router returns `{jobs,...}`. Used by JobGroups.jsx:10 and JobGroupDetail.jsx:9.
  - `getJob` GET `/api/jobs/:id` (:39), no auth header, so 401 against the authenticated router. Used via JobDetail.jsx:9.
  - `createJob` POST `/api/jobs` (:90, converts string business_process_id to int :81-85). Used by JobCreate.jsx:4.
  - `updateJob` PUT `/api/jobs/:id` (:164), `deleteJob` DELETE (:223; used by BusinessProcessDetail.jsx:9).
  - `POST /api/jobs/:id/run` (:259) with no auth header, so 401 (route also needs `job:execute`).
  - `POST /api/jobs/:id/stop` (:273): no such route exists in the router or in server.js, and no auth header.
  - `GET /api/jobs/:id/logs` (:287), no auth header, so 401.
  - `getBusinessProcessJobs` GET `/api/business-processes/:id/jobs` (:51; not a route of this area).
- `src/api/schedulesService.js:46` GET `/api/jobs/:id/schedules`: no route in JOB serves it (the legacy path is `/api/jobs/:jobId/job-schedules`).
- `src/pages/ProcessManagementWizard.jsx:373` GET `/api/jobs?business_process_id=` (router ignores that filter) and `:404` POST `/api/jobs` (legacy handler).
- `src/pages/Documentation.jsx:240-241` mentions `POST /api/jobs/:id/execute` and `GET /api/jobs/:id/status` as text; neither route exists.
- Calls that hit missing routes: `/api/jobs/:id/stop`, `/api/jobs/:id/schedules`, `/api/jobs/:id/execute`, `/api/jobs/:id/status`.
- Nothing in `src/` calls `/api/job-schedules*`, `/stats/summary`, `/v2`, `/:id/anomalies` or `/:id/metrics`.

## Data touched
Basis noted per item.
- `transformation_jobs`, columns present in prod DDL (lines 6220-6251): id, job_id (UNIQUE), mapping_id, mapping_name, status, start_time, end_time, duration_ms, files_processed, rows_read/written/failed, error_message, execution_metadata, triggered_by, created_at, executed_by, updated_at, mapping_group_execution_id, schedule_id, workflow_execution_id, file_id, project_id (NOT NULL), correlation_id, schema_validation, failure_reason_code, visual_workflow_execution_id. Migration basis: `createETLTransformationTables.js:72-97`, `addProjectIdToRemainingTables.js:98-105` (project_id NOT NULL).
- Columns used by JOB code but missing from the prod DDL `transformation_jobs` and from `createETLTransformationTables.js:72-97`, with no `ADD COLUMN` for them anywhere under `backend/` (searched): `records_processed`, `records_failed` (jobs.js:163-164, enterprisePerformanceOptimizations.js:287), `execution_type` (jobs.js:166), `jira_issue_key` (jobs.js:167; written by JiraService.js:288), `user_id` (jobExecutionEngine.js:5875). Consequences: `/v2` would fail; `mv_dashboard_summary` probably cannot be created; cancel notification gets undefined `userId`. Migration-vs-prod column drift also exists on `transformation_logs`: `log_message` (migration) vs `message` (prod DDL, line 6276); jobs.js:714 uses `message`.
- `transformation_logs` (job_id, log_level, message, log_details, timestamp; prod DDL 6272-6279, FK to `transformation_jobs(job_id)` ON DELETE CASCADE line 7779), `anomalies` (job_id varchar(255), prod DDL 2589), `profiling_metrics` (job_id varchar, prod DDL 3519), `files`, `file_columns`, `transformation_mappings`, `projects`, `mapping_groups`/`mapping_group_executions`, `n_step_workflows(+_runs)`, `visual_workflows(+_executions)`, `schedules`.
- `job_metrics`: read by jobs.js:731; defined nowhere in the repo (grep of all `*.js`, `*.sql`, `*.jsx`).
- Materialized view `mv_dashboard_summary`: created only by migration `enterprisePerformanceOptimizations.js:277`; not in the prod DDL.
- Legacy: `jobs`, `job_schedules` (prod DDL 5259-5271: `type` NOT NULL, `project_id` INTEGER NOT NULL, no FK to `jobs`; bootstrap server.js:6014-6025 has no `project_id`), `business_processes`, `groups`, `user_groups`, `file_schedules` (written by the live DELETE). `job_history` and `job_runs` exist in the prod DDL with FKs to `jobs` (7554, 7559) but are not touched by these handlers. Earlier note that they are created at server.js:5217/5237 was wrong: those lines are `app.use` mounts for other routers. `job_runs` is also created by `initBusinessProcessTables.js:71` (repo root; `job_id ... REFERENCES jobs(id) ON DELETE CASCADE`, :73).

## Flags

SECURITY
- S1. DELETE /api/job-schedules/:id (server.js:12000) has no authentication and deletes `file_schedules` rows.
- S2. `/api/jobs/:id/full` (jobs.js:685) skips `validateJobAccess` and checks only `job.project_id` (`tj.project_id`), with no mapping fallback. The earlier claim that null-project jobs are readable by everyone does not hold on the prod DDL or the migration, where `project_id` is NOT NULL (prod DDL 6243); the `job.project_id` falsy branch (jobs.js:702) and jobAccessHelpers.js:50 are dead code there. Only on a DB lacking the NOT NULL constraint would it apply.
- S3. `/api/jobs/stats/summary` (jobs.js:18): the live path has no project filtering, so any user sees global counts. The MV path takes `projectId` from the query with no membership check (:36-40), so any user can read any project's counts if the MV exists.
- S4. `/api/jobs/:jobId/profiles` (server.js:12745) has only JWT: no group or project check.
- S5. All `job-schedules` handlers (12916-13110) and `POST /api/jobs` (12819) have no ownership or group check. POST /api/jobs explicitly skips verification (:12862).
- S6. POST /api/jobs and the create error response log the full body and return `err.message`/`code` to the client (12822, 12907-12911).
- S7. `getJob` in jobsService.js:39, `getBusinessProcessJobs` :51, and the `run` (:259), `stop` (:273) and `logs` (:287) calls send no Authorization header, so they fail against authenticated routes.
- S8. Permission names inconsistent: cancel needs `jobs:write`, run needs `job:execute` (jobs.js:467, server.js:13245). Read endpoints need no permission. The seeds diverge: `jobs:write` appears only in `backend/scripts/seedProductionManual.sql:30,77`; `backend/scripts/seedProduction.js` defines only `job:create|read|update|delete|execute` (lines 121-125). Whether a role can cancel depends on which seed ran, and the admin bypass does not cover this check.

DUPLICATE
- D1. Job list: jobs.js:252 (project-based, offset), jobs.js:125 (v2 cursor) and server.js:12558 (group-based, legacy). Different data sources (`transformation_jobs` vs `jobs`), different access models and different response shapes (`{jobs,total,...}` vs array).
- D2. Job detail: jobs.js:390 vs server.js:12653. Same URL, different tables.
- D3. DELETE job-schedules x3 (12000, 12198, 13055), differing as in #19.
- D4. Job-detail data exists as `/:id`, `/logs`, `/anomalies`, `/metrics`, and the batch `/full`. `/full` is not an equivalent batch: it looks up by `id` or `correlation_id`, uses `job.id` for anomalies (the parts use `job_id`), queries the undefined `job_metrics` table (where `/metrics` uses `profiling_metrics`), LIMIT 1000 logs, and bypasses the access helper.
- D5. Two cancel/permission models and two profile endpoints (`/:id/profiling` vs `/:jobId/profiles`).
- D6. Default Group bootstrap code copied in 11 and 12.

BUG
- B1. Id confusion: `validateJobAccess`, `getJobStatus`, `/logs`, `/profiling`, `/cancel` use `transformation_jobs.job_id`; `/full` accepts `id` or `correlation_id`; `/v2` returns `tj.id` (no `job_id`) and cursor uses `tj.id`. The UI sends `job.job_id` to both `/full` and `/cancel` (Jobs.jsx:487, :495). So `/cancel` works with that value, while `/full` receives a value that matches neither of its columns (see #10).
- B2. `GET /:id` fetches logs but discards them (jobs.js:400) despite the docstring "Get job details with logs".
- B3. `/full` undefined table, type-mix and anomalies mismatch: see #10 (`job_metrics` jobs.js:731; `id = $1 OR correlation_id = $1` jobs.js:691, type error inferred; `anomalies WHERE job_id = job.id` jobs.js:728). `/full` returns 500 on the prod DDL as dumped.
- B4. Schedule `next_run_time` for recurring schedules is always now+24h and the cron expression is ignored (server.js:12970-12972, 13018-13020). Comment admits it. `type` other than 'one-time' (including missing) is treated as recurring for `next_run_time`, but a missing `type` on POST is stored as 'one-time' (12967-12973), leaving the row inconsistent.
- B5. PUT /api/job-schedules/:id writes NULL for omitted `one_time_date`, `cron_expression` and `enabled` (13024-13042), and recomputes `next_run_time` even if `one_time_date` is missing (null). Omitting `type` fails with a not-null violation (500), since `type` is NOT NULL (prod DDL 5262), instead of writing NULL.
- B6. POST /api/jobs/:id/run is a stub with a fake history id (13270-13274), but is returned as 'Job started successfully'.
- B7. `/stats/summary`: MV path ignores `days` and `total_rows_failed`/medium/low are hard 0; `period` string says "Last N days" regardless (jobs.js:108).
- B8. `/api/jobs` `limit`/`offset` unvalidated strings (jobs.js:334) and `/logs` `limit` unvalidated (:439); an invalid value gives a 500 from Postgres.
- B9. `/v2` cursor condition mixes sort column and id with one operator (:217-220); `status` and `end_time` sorts with NULL values can skip or duplicate rows (inference from SQL semantics, not tested).
- B10. The lists (`/v2`, `/`) filter by `tm.project_id` (mapping's project, :187-191), while `validateJobAccess` and `/full` use `tj.project_id` (jobAccessHelpers.js:21, jobs.js:702). The two can disagree for a job whose mapping and job project differ, or whose mapping is missing (null `tm.project_id`, invisible to non-admins in lists). The earlier "granted to everyone when project unknown" half does not apply where `tj.project_id` is NOT NULL.
- B11. Legacy PUT `/api/jobs/:id` compares `business_process_id !== existing` without type conversion (13150).
- B12. Legacy GET handlers treat Default Group members as having access, while PUT/DELETE/run require real group membership (12612 vs 13140).
- B13. `/api/jobs/:jobId/profiles`: the 404 branch is unreachable (12800), and the query probably fails outright (aggregate subquery with ORDER BY `fc.column_index` and no GROUP BY, server.js:12770-12787), so the route likely always returns 500 to ETLJobDetails.jsx:127. Inferred from SQL semantics, not run.
- B14. Schema drift: `/v2` selects `records_processed`, `records_failed`, `execution_type`, `jira_issue_key` that the prod DDL `transformation_jobs` lacks (jobs.js:163-167), so it would 500; `cancelJob` reads `user_id` (jobExecutionEngine.js:5875), also absent, so the notification has no user.
- B15. Cancel does not stop the running job and a later final `updateJob` can overwrite `cancelled` (jobExecutionEngine.js:5855-5879; no other status check in the engine).
- B16. Legacy POST /api/jobs destructures `description` but never inserts it (server.js:12827, 12874-12887).
- B17. `jobsService.stopJob` calls `POST /api/jobs/:id/stop` (jobsService.js:273), a route that does not exist.
- B18. POST /api/job-schedules omits the NOT NULL `project_id`, so it probably returns 500 on a prod-DDL or migrated table (server.js:12976-12994; prod DDL 5270; `addProjectIdToConnections.js:83-99`). Not run. The bootstrap table (server.js:6014) has no such column.
- B19. Deleting a job leaves orphan `job_schedules` rows: no FK to `jobs` (prod DDL 7562-7564 has only the project FK; bootstrap has none).

DEAD
- DEAD1. server.js:12558 and 12653 are shadowed by the router mounted at 5235, as long as the `require` at 5234 succeeds; if it throws, only a log line is written (5237-5238) and these handlers become live.
- DEAD2. server.js:12198 and 13055 (DELETE job-schedules shadowed by 12000).
- DEAD3. Legacy GET /api/jobs handlers' `run_count`/`last_run_time`/`history` placeholders are never real.
- Null-`project_id` branches (jobAccessHelpers.js:50, jobs.js:702) are dead on a schema matching the prod DDL or migration (see S2).
- Frontend `jobsService` functions are used by JobCreate.jsx, JobDetail.jsx, JobGroups.jsx, JobGroupDetail.jsx and BusinessProcessDetail.jsx (imports), so they are not unused; whether those pages are routed was not checked.

UNCLEAR
- U1. Nothing in `src/` calls `/stats/summary`, `/v2`, `/:id/anomalies` or `/:id/metrics` (grep of `api/jobs` in `src/`). Callers outside `src/` were not searched.
- U2. Monitor.jsx is listed under JOB but concerns file audit and bulk profiling, not jobs.

## Domain terms
- job / transformation job (`transformation_jobs`) vs legacy job (`jobs`, Process Management) vs bulk-profiling job (`/api/bulk-profiling/jobs`, Monitor.jsx) vs queue job (see PROC).
- job_id vs id vs correlation_id: three identifiers of a transformation job. `job_id` is the "JOB-<ts>-<uuid>" string (jobExecutionEngine.js:838), `id` the serial integer.
- schedule: `schedules` (ETL scheduler, joined in list), `job_schedules` (legacy, "OLD Job Schedule endpoints", 12915), `file_schedules` (what the live DELETE touches).
- project (transformation jobs) vs group / business process (legacy jobs).
- statuses seen: pending, running, completed, failed, cancelled (jobExecutionEngine.js:5855-5861); legacy job status default 'active'. Schedule types 'one-time', 'recurring'.
- profile / profiling metrics, anomalies (severity high/medium/low, status 'open'), correlation_id (links source and target files).
- Permissions: `jobs:write`, `job:execute`.
- Admin: `userHasAdminAccess` (role, or `users:write`, `roles:write`, `project_management:write`; permissionHelpers.js:80-92).

## Open questions
1. Does a `job_metrics` table exist on the live database (created outside the repo)? Its existence decides whether `/full` returns 500. Also unconfirmed: the exact Postgres error for `id = $1 OR correlation_id = $1` with one parameter (inferred, not run).
2. Does the live database match the prod DDL (missing `records_processed`, `records_failed`, `execution_type`, `jira_issue_key`, `user_id`, and `mv_dashboard_summary`)? This decides whether `/v2` and the MV path work.
3. Is there any job scheduler that reads `job_schedules.next_run_time` and executes legacy jobs? Not searched. Inventory says only the table creation at server.js:6014.
4. Are `job_history`/`job_runs` written anywhere? Not touched by the JOB handlers; the prod DDL defines them (FKs at 7554, 7559).
5. How is `mv_dashboard_summary` refreshed (if it exists)? Not traced.
6. Why Monitor.jsx is listed in this area (it covers file audit and bulk profiling, not jobs).
7. Are the pages that import `jobsService` (JobCreate, JobDetail, JobGroups, JobGroupDetail, BusinessProcessDetail) reachable through routes in App.jsx? Not checked.

## Inventory corrections
- Inventory marks the `/api/jobs/:jobId/profiles`, `POST /api/jobs`, PUT, DELETE and run routes as simply JWT. This is right, but run additionally needs `job:execute` and cancel needs `jobs:write`.
- Router endpoints in the inventory carry auth "-"; they are in fact behind `authenticateToken` via the mount at server.js:5235.
- The inventory says :13055 is "Dead: :12000 matches first". Confirmed. It also notes :12000 targets `file_schedules`, not `job_schedules`.
- /monitor does not use any JOB endpoints.
