# JOB: Jobs & job monitoring

## Summary
Two unrelated things share the name "job" and the `/api/jobs` URL space.
1. Transformation jobs (table `transformation_jobs`): execution records of ETL/mapping runs. Served by the router `backend/routes/jobs.js`, mounted at `server.js:5234-5235` as `app.use('/api/jobs', authenticateToken, jobRoutes)`. Access is by project membership (`validateJobAccess`, admin bypass via `userHasAdminAccess`).
2. Legacy "Process Management" jobs (table `jobs`, tied to `business_processes` and `groups`) plus `job_schedules`. Served by handlers in `server.js` at 12558-13284. Access is by group membership.

The router is mounted at `server.js:5235`, before the legacy handlers (12558+). Express runs the router first, so the legacy `GET /api/jobs` and `GET /api/jobs/:id` are shadowed. Legacy `POST/PUT/DELETE /api/jobs`, `/api/jobs/:jobId/profiles`, `/run` and `/job-schedules` are not defined in the router, so they fall through to server.js.

Frontend: Jobs.jsx lists and cancels transformation jobs. ETLJobDetails.jsx shows one job. Monitor.jsx does NOT use `/api/jobs` (see Flags).

## Entry points

### Router `backend/routes/jobs.js` (all behind `authenticateToken`, `server.js:5235`)
Common: ids go to `validateJobAccess` (`backend/utils/jobAccessHelpers.js:16`). It looks up `transformation_jobs.job_id = $1` (:20-25). Not found gives 404 (:27-31). Project id is `tj.project_id`, else the mapping's project via `transformation_mappings` (:36-46). Non-admins whose project is not in `getUserProjects(user.id)` get 403 'You do not have access to this job' (:49-58). If the job has no project id, access is granted to everyone (:50).

1. GET /api/jobs/stats/summary (jobs.js:18). No role check. Query `days` (default 30) and `projectId`.
   - Tries materialized view `mv_dashboard_summary` (:28-67). With `projectId` it filters `project_id = $1`, otherwise `project_id = 0`. On any error or empty result it falls back to a live query on `transformation_jobs` and `anomalies` with `created_at >= now - days` (:76-104).
   - MV path hardcodes `total_rows_failed: 0`, `medium_severity: 0`, `low_severity: 0`, and `total_rows_written = total_records_processed` (:51-62). `open_anomalies = total_anomalies`.
   - Response is `{period: "Last N days", jobs, anomalies, source}`. Error is 500.
   - Neither path filters by the caller's projects. The live path ignores `projectId`. The MV path ignores `days`.
2. GET /api/jobs/v2 (:125). Cursor pagination.
   - Query: status, mappingId, projectId, cursor, limit (default 50, capped `Math.min(...,100)` :137), sortBy (allowed created_at/end_time/status, else created_at), sortOrder (ASC else DESC).
   - Non-admin with no projects gets an empty page (:146-148). Non-admins are filtered by `tm.project_id = ANY(...)` (:187-191). The query fetches limit+1 rows to detect more pages (:225).
   - Joins mapping group, n-step workflow and visual workflow names. Error is 500.
3. GET /api/jobs/ (:252). Offset pagination.
   - Query: status, mappingId, limit (50), offset (0), sortBy (created_at/end_time/status/mapping_name), sortOrder.
   - Same project filter and empty-result rule. Returns `{jobs, total, limit, offset}` with `tj.*` plus schedule fields. A separate count query is built (:339-369).
   - `limit` and `offset` are passed as raw strings to LIMIT/OFFSET (:334). There is no cap.
4. GET /api/jobs/:id (:390). `validateJobAccess`, then `getJobStatus` (`backend/services/jobExecutionEngine.js:5807`), which selects `job_id = $1`. Returns the job row only (logs fetched but dropped, :400). Errors: 403/404 from the helper; message containing 'not found' gives 404; otherwise 500.
5. GET /api/jobs/:id/logs (:421). Query `level`, `limit` (default 100, no cap). Selects `transformation_logs` by `job_id` (:430-441), ordered by timestamp ASC. Returns `{jobId, logs, total}`.
6. POST /api/jobs/:id/cancel (:464).
   - Requires `req.user.permissions` to include `'jobs:write'`, otherwise 403 (:467). Then `validateJobAccess`.
   - `cancelJob` (jobExecutionEngine.js:5840): job not found throws; status `completed|failed|cancelled` gives 409 'Cannot cancel job: Job is already X' (:5855-5859). Otherwise `updateJob` sets `status='cancelled'`, `end_time=new Date()` (:5862). It writes an info log 'Job cancelled by user' (:5867) and fires a notification via `setImmediate` (:5873-5883).
   - The code in cancelJob does not stop any running worker or queue entry. It only changes the DB row (not verified elsewhere; see Open questions).
   - Response `{message:'Job cancelled successfully', job}`.
7. GET /api/jobs/:id/anomalies (:511). Query `severity`, `status` (default 'open'). Reads `anomalies` by `job_id`, ordered by detected_at DESC.
8. GET /api/jobs/:id/metrics (:560). Reads `profiling_metrics` by `job_id`, ordered by profiled_at DESC.
9. GET /api/jobs/:id/profiling (:594). `validateJobAccess`, then `correlation_id` is read from `transformation_jobs WHERE job_id = $1`. 404 'Job not found' or 'No profiling data available for this job' (:608-616). Loads `files` by `correlation_id`, takes the first `file_role='source'` and `'target'`, and attaches `file_columns` ordered by `column_index`.
10. GET /api/jobs/:id/full (:685). Used by Jobs.jsx:101 and ETLJobDetails.jsx:81.
   - Finds the job by `id = $1 OR correlation_id = $1` (:691). It does NOT call `validateJobAccess`. It uses `job.project_id` and checks membership only if `!isAdmin && job.project_id` (:702-709). Jobs with a null `project_id` are visible to any authenticated user. Mapping-derived project is not consulted.
   - Parallel queries: logs `WHERE job_id = job.job_id` LIMIT 1000, anomalies `WHERE job_id = job.id`, `job_metrics WHERE job_id = job.id`. Logs are aliased (level, details, created_at).
   - Returns `{success:true, job, logs, anomalies, metrics}`. A 500 does not distinguish other errors.

### Legacy handlers in `server.js` (all `authenticateToken` unless noted)
11. GET /api/jobs (12558). SHADOWED by #3 (never reached). Behaviour if reached: it creates the 'Default Group' if missing (:12567-12582) and inserts the user into it (:12594). It then lists `jobs` for business processes in the user's groups (and Default Group), with `run_count: 0`, `last_run_time: null` placeholders (:12636-12642).
12. GET /api/jobs/:id (12653). SHADOWED by #4. Same default-group auto-enrol logic. Returns the job with `history: []`.
13. GET /api/jobs/:jobId/profiles (12745). No project/group access check, only JWT. Reads `profiling_metrics` by `job_id`, LIMIT 2, ordered by `profile_timestamp DESC, file_role DESC`, returning `source_profile`/`target_profile`/`hasBothProfiles`. The `jobs/:id/profiles` URL is used by ETLJobDetails.jsx:127. No error path for an empty result: the aggregate query always returns one row, so the 404 at :12800 is unreachable in practice (the row has null columns). Inference from SQL structure.
14. POST /api/jobs (12819). Body: name, business_process_id (required, 400 'Job name and business process are required'; must parse as an int, 400), source/target_connection_id, four settings jsonb (default `{}`), created_by, status (default 'active'). `created_by` is overridden by `req.user.id`. The comment says access verification is skipped "temporarily to debug" (:12862-12863), so there is no group/ownership check. Inserts into `jobs` and returns 201 with the row. On error returns 500 with `details: err.message` and `code`. Logs the full request body.
15. GET /api/job-schedules (12916). Lists all `job_schedules` joined to `jobs`, newest first. No ownership or group filter.
16. GET /api/jobs/:jobId/job-schedules (12931). Lists `job_schedules` by `job_id`. No access check.
17. POST /api/job-schedules (12942). Body: job_id (required), type (default 'one-time'), one_time_date, cron_expression, enabled (`enabled !== false`, so default true). Validation: type 'one-time' needs one_time_date; type 'recurring' needs cron_expression (400). `next_run_time` is the one_time_date, or for anything else now + 24h (`24*60*60*1000`), with the cron expression not parsed (:12965-12973). No check that the job exists or that the user has access to it. Returns 201.
18. PUT /api/job-schedules/:id (13003). Updates type, one_time_date, cron_expression, enabled and recomputes `next_run_time` with the same rule. There is no validation, and missing fields are written as NULL (including `enabled`). 404 if not found. No ownership check.
19. DELETE /api/job-schedules/:id. Three registrations:
   - server.js:12000 has NO auth and deletes from `file_schedules` (not `job_schedules`). It wins by registration order.
   - server.js:12198 is a duplicate (no auth, `file_schedules`), unreachable.
   - server.js:13055 has auth and deletes from `job_schedules`, unreachable because :12000 matches first.
   Effective behaviour: an unauthenticated DELETE `/api/job-schedules/:id` removes a row from `file_schedules` with that id. Response `{message, schedule}` (200) or 404.
20. POST /api/job-schedules/:id/enable (13072) and 21. POST .../disable (13092). Set `enabled` true/false and `updated_at`. 404 if not found. No ownership check.
22. PUT /api/jobs/:id (13113). `name` required (400). Access: caller must be in a group (`user_groups`) owning the business process (404 otherwise). It uses the strict membership join, NOT the Default Group fallback used by GET. A changed `business_process_id` needs access to the new process (403). The status falls back to the existing status, then 'active'. Other fields are overwritten with whatever is sent (undefined for omitted fields). Note `business_process_id !== existing` compares a raw body value (possibly string) to a number, so a string id always triggers the extra check.
23. DELETE /api/jobs/:id (13211). Same group-membership check, then `DELETE FROM jobs`. The comment says "cascade will delete history"; no code here confirms the cascade. Returns `{message:'Job deleted successfully'}`.
24. POST /api/jobs/:id/run (13242). Requires permission `'job:execute'` (singular `job`, vs `'jobs:write'` for cancel), 403 otherwise. Group check as above. It does NOT run anything: it logs, returns `{message:'Job started successfully', job_history_id: Date.now().toString()}` (:13270-13279). This is a stub with a fake history id.

### Frontend routes
25. /jobs, /jobs/:jobId, /business-processes/:processId (Jobs.jsx; App.jsx:417-419). Lists via `GET /api/jobs?limit=100` + cache buster (:71), polls every 60000 ms (:42-46), detail via `/full` (:101), cancel via POST `/cancel` (:131). It also calls `/api/jira/connections` (:33).
26. /etl-jobs/:jobId (ETLJobDetails.jsx; App.jsx:420). `/full` (:81), polling every 5000 ms (:71-75), cancel (:108), profiles `/api/jobs/${jobId}/profiles` (:127).
27. /monitor (Monitor.jsx; App.jsx:396). Calls `/api/file-audit` (:91), `/api/file-audit/${rowId}/logs` (:282), `/api/bulk-profiling/jobs` (:180), and audit-ledger service functions. Refresh interval at :59. It is a file-audit / bulk-profiling monitor and does not call any endpoint of this area. Status-to-badge mapping: 'success'|'completed' success and 'failed'|'error' danger (:326-329).

Also `src/api/jobsService.js`: `getJobs` GET `/api/jobs` (expects the response shape handled by `handleApiSuccess`; router returns `{jobs,...}`, legacy returned an array), `getJob` GET `/api/jobs/:id` WITHOUT an auth header (:39), `getBusinessProcessJobs` GET `/api/business-processes/:id/jobs` (:51; not a route of this area), `createJob` POST `/api/jobs` (:90, converts string business_process_id to int :81-85).

## Data touched
- `transformation_jobs` (id, job_id, mapping_id, mapping_name, status, project_id, correlation_id, start/end_time, records_processed, records_failed, files_processed, rows_read/written/failed, error_message, execution_type, jira_issue_key, schedule_id, user_id, mapping_group_execution_id, workflow_execution_id, visual_workflow_execution_id), `transformation_logs` (job_id, log_level, message, log_details, timestamp), `anomalies`, `profiling_metrics`, `job_metrics`, `files`, `file_columns`, `transformation_mappings`, `projects`, `mapping_groups`/`mapping_group_executions`, `n_step_workflows(+_runs)`, `visual_workflows(+_executions)`, `schedules`, materialized view `mv_dashboard_summary`.
- Legacy: `jobs`, `job_schedules`, `business_processes`, `groups`, `user_groups`, `file_schedules` (written by the live DELETE), `job_history`/`job_runs` (created at server.js:5217/5237 per inventory, not touched by these handlers).

## Flags

SECURITY
- S1. DELETE /api/job-schedules/:id (server.js:12000) has no authentication and deletes `file_schedules` rows.
- S2. `/api/jobs/:id/full` (jobs.js:685) skips `validateJobAccess`, and jobs with null `project_id` are readable by any authenticated user. `validateJobAccess` also grants access when the project is unknown (jobAccessHelpers.js:50).
- S3. `/api/jobs/stats/summary` (jobs.js:18) has no project filtering in the live path, so any user sees global counts.
- S4. `/api/jobs/:jobId/profiles` (server.js:12745) has only JWT: no group or project check.
- S5. All `job-schedules` handlers (12916-13110) and `POST /api/jobs` (12819) have no ownership or group check. POST /api/jobs explicitly skips verification (:12862).
- S6. POST /api/jobs and the create error response log the full body and return `err.message`/`code` to the client (12822, 12907-12911).
- S7. `getJob` in jobsService.js:39 and `getBusinessProcessJobs` :51 send no Authorization header, so they fail against the authenticated route.
- S8. Permission names inconsistent: cancel needs `jobs:write`, run needs `job:execute` (jobs.js:467, server.js:13245). Read endpoints need no permission.

DUPLICATE
- D1. Job list: jobs.js:252 (project-based, offset), jobs.js:125 (v2 cursor) and server.js:12558 (group-based, legacy). Different data sources (`transformation_jobs` vs `jobs`), different access models and different response shapes (`{jobs,total,...}` vs array).
- D2. Job detail: jobs.js:390 vs server.js:12653. Same URL, different tables.
- D3. DELETE job-schedules x3 (12000, 12198, 13055), differing as in #19.
- D4. Job-detail data exists as `/:id`, `/logs`, `/anomalies`, `/metrics`, and the batch `/full`. `/full` differs from the parts (id or correlation_id lookup, LIMIT 1000 logs, `job_metrics` table vs `profiling_metrics` in `/metrics`, no access helper).
- D5. Two cancel/permission models and two profile endpoints (`/:id/profiling` vs `/:jobId/profiles`).
- D6. Default Group bootstrap code copied in 11 and 12.

BUG
- B1. Id confusion: `validateJobAccess`, `getJobStatus`, `/logs`, `/profiling` use `transformation_jobs.job_id`; `/full` accepts `id` or `correlation_id`; `/v2` returns `tj.id` (no `job_id`) and cursor uses `tj.id`. Jobs.jsx uses the `id` passed to `/cancel`, which uses `job_id`. Which value the client passes is not established (see Open questions).
- B2. `GET /:id` fetches logs but discards them (jobs.js:400) despite the docstring "Get job details with logs".
- B3. `/profiling` selects `FROM transformation_jobs WHERE job_id = $1` (:604), while `/full` uses `job.project_id` (:702), a column assumed on the same table. Consistent with `validateJobAccess` reading `tj.project_id` (helper :21), so not a bug by itself.
- B4. Schedule `next_run_time` for recurring schedules is always now+24h and the cron expression is ignored (server.js:12970-12972, 13018-13020). Comment admits it. `type` other than 'one-time' (including missing) is treated as recurring.
- B5. PUT /api/job-schedules/:id writes NULL for any omitted field, including `enabled` and `type` (13024-13042), and recomputes `next_run_time` even if `one_time_date` is missing (null).
- B6. POST /api/jobs/:id/run is a stub with a fake history id (13270-13274), but is returned as 'Job started successfully'.
- B7. `/stats/summary`: MV path ignores `days` and `total_rows_failed`/medium/low are hard 0; `period` string says "Last N days" regardless (jobs.js:108).
- B8. `/api/jobs` `limit`/`offset` unvalidated strings (jobs.js:334) and `/logs` `limit` unvalidated (:439); an invalid value gives a 500 from Postgres.
- B9. `/v2` cursor condition mixes sort column and id with one operator (:217-220); `status` and `end_time` sorts with NULL values can skip or duplicate rows (inference from SQL semantics, not tested).
- B10. `/v2` and `/` filter only by `tm.project_id`, so jobs with no mapping (null `tm.project_id`) are invisible to non-admins, but `validateJobAccess` grants them to everyone. Inconsistent rule.
- B11. Legacy PUT `/api/jobs/:id` compares `business_process_id !== existing` without type conversion (13150).
- B12. Legacy GET handlers treat Default Group members as having access, while PUT/DELETE/run require real group membership (12612 vs 13140).
- B13. `/api/jobs/:jobId/profiles` 404 branch unreachable (12800).

DEAD
- DEAD1. server.js:12558 and 12653 (shadowed by router mounted at 5235).
- DEAD2. server.js:12198 and 13055 (DELETE job-schedules shadowed by 12000).
- DEAD3. Legacy GET /api/jobs handlers' `run_count`/`last_run_time`/`history` placeholders are never real.
- Possibly dead: `jobsService.getJob`/`getBusinessProcessJobs`/`createJob` usage by the UI not checked.

UNCLEAR
- U1. `/stats/summary` and `/v2` have no callers found in the files read (not grepped across `src/`).
- U2. Whether job cancel actually stops execution (see Open questions).
- U3. Monitor.jsx is listed under JOB but concerns file audit and bulk profiling, not jobs.

## Domain terms
- job / transformation job (`transformation_jobs`) vs legacy job (`jobs`, Process Management) vs bulk-profiling job (`/api/bulk-profiling/jobs`, Monitor.jsx) vs queue job (see PROC).
- job_id vs id vs correlation_id: three identifiers of a transformation job.
- schedule: `schedules` (ETL scheduler, joined in list), `job_schedules` (legacy, "OLD Job Schedule endpoints", 12915), `file_schedules` (what the live DELETE touches).
- project (transformation jobs) vs group / business process (legacy jobs).
- statuses seen: pending, running, completed, failed, cancelled (jobExecutionEngine.js:5855-5861); legacy job status default 'active'. Schedule types 'one-time', 'recurring'.
- profile / profiling metrics, anomalies (severity high/medium/low, status 'open'), correlation_id (links source and target files).
- Permissions: `jobs:write`, `job:execute`.

## Open questions
1. Does cancelling stop the actual running work (queue, worker, abort signal)? `cancelJob` only updates the DB and logs; no other code was traced.
2. Which id does the UI send to `/cancel` and `/full` (`id` or `job_id`)? Not traced into the list response fields.
3. What does `userHasAdminAccess` and `getUserProjects` actually grant? Not read (permissionHelpers.js, requireProjectAccess.js).
4. Does anything call `/stats/summary`, `/v2`, `/:id/logs`, `/anomalies`, `/metrics`, `/profiling` from the frontend or elsewhere?
5. Is there any job scheduler that reads `job_schedules.next_run_time` and executes legacy jobs? Not searched. Inventory says only the table creation at server.js:6014.
6. Do `job_history`/`job_runs` get written anywhere (server.js:5217/5237 only create tables per inventory)?
7. Does the `mv_dashboard_summary` view exist in any migration, and how is it refreshed?
8. Why Monitor.jsx is listed in this area (it covers file audit and bulk profiling, not jobs).
9. Schema of `transformation_jobs` (does it have `project_id`, `duration_ms`, `user_id`?). Not verified from DDL.

## Inventory corrections
- Inventory marks the `/api/jobs/:jobId/profiles`, `POST /api/jobs`, PUT, DELETE and run routes as simply JWT. This is right, but run additionally needs `job:execute` and cancel needs `jobs:write`.
- Router endpoints in the inventory carry auth "-"; they are in fact behind `authenticateToken` via the mount at server.js:5235.
- The inventory says :13055 is "Dead: :12000 matches first". Confirmed. It also notes :12000 targets `file_schedules`, not `job_schedules`.
- /monitor does not use any JOB endpoints.
