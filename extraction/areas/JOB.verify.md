# JOB verification (final, after fix round 2)

Verdict: PASS

Counts: 44 claims checked, 0 WRONG, 0 UNSUPPORTED, 0 missed.

Coverage: all 10 jobs.js routes and all 16 server.js registrations (`/api/jobs*`, `/api/job-schedules*`, including the three DELETE `/api/job-schedules/:id`) have subsections. The 3 FE routes are covered too. A grep of route registrations found nothing extra. The full-file rewrite lost nothing I could find.

## Round-2 changes
- #13/B13 CORRECT. server.js:12770-12787 is `SELECT json_agg(...) FROM file_columns fc WHERE ... ORDER BY fc.column_index`. That is an aggregate with no GROUP BY ordering by a non-aggregated column, so Postgres should reject it. The note labels this inferred, which is right. The outer SELECT (:12795-12797) is two scalar subqueries, so it always returns one row and the 404 at :12800 is unreachable. The catch at :12812-12815 returns 500 'Failed to fetch job profiles'.
- W6/B5 CORRECT. PUT /api/job-schedules/:id passes `type` unmodified (server.js:13036). `type` is NOT NULL in prod DDL :5262 and in the bootstrap at server.js:6017 (NOT NULL DEFAULT, but an explicit NULL param does not take the default). A PUT without `type` is therefore a not-null violation and the catch returns 500 (:13049-13052).
- B18 CORRECT. The INSERT at server.js:12976-12994 omits `project_id`. Prod DDL :5270 has `project_id int4 NOT NULL`. addProjectIdToConnections.js:83-99 adds the column, backfills it with 1 and sets NOT NULL. The bootstrap (server.js:6014-6025) has no such column. The 500 path is at :12998-12999. The note correctly says the outcome depends on which source created the table.
- B19 CORRECT. The only job_schedules FK in the Jan_05 dump is `fk_job_schedules_project` to projects (:7564). The bootstrap declares no FK. The job_history (:7554) and job_runs (:7559) FKs to `jobs(id)` are ON DELETE CASCADE, as the note says.
- U1 / #3 duplicate columns CORRECT. jobs.js:283 has `tj.*`, :286 `s.id as schedule_id`, :292 `tm.project_id`, and `tj` also has `project_id` and `schedule_id` (prod DDL :6240, :6243). The "last wins in pg" point is labelled as an inference.
- job_runs is also created at initBusinessProcessTables.js:71 (`job_id ... REFERENCES jobs(id) ON DELETE CASCADE`, :73). CORRECT.

## Other claims spot-checked (all CORRECT)
- Mount and try/catch at server.js:5233-5239, so the shadowing caveat holds.
- Router #3 (:252-384): the filter is `tm.project_id = ANY`, limit and offset are raw strings (:334), the count query is separate, and the empty-result rule matches.
- Cancel (jobs.js:464-505): `jobs:write` check at :467, 403/404 via `error.status`, 409 via `error.statusCode`, 'not found' gives 404.
- cancelJob (jobExecutionEngine.js:5840-5885): terminal-status 409 at :5855-5859, updateJob at :5862, log at :5867, notification via setImmediate with `_cancelledJob.user_id` at :5875. `user_id` is absent from the prod DDL (:6220-6251).
- `/full` (jobs.js:685-749): the query shape, the `job_metrics` read at :731 (repo grep finds only jobs.js, plus coverage HTML and the notes), the anomalies query using `job.id`, the logs query using `message`, and the access check at :702 all match.
- jobAccessHelpers.js:16-62: the job_id lookup, the mapping fallback, and 404/403.
- DELETE job-schedules: :12000 has no auth and deletes `file_schedules`; :12198 is a no-auth duplicate; :13055 has auth and `job_schedules`.
- Legacy POST (:12942) validation and next_run_time rule, and PUT /api/jobs/:id (:13113-13208): the strict group join, `business_process_id !==` comparison at :13150, and the status fallback.
- DELETE /api/jobs/:id (:13211-13239) and the run stub (:13242-13284): `job:execute` check at :13245 and the fake history id.
- Permission seeds: `jobs:write` appears only in seedProductionManual.sql (:30, :77). seedProduction.js has `job:execute` (:125) and no `jobs:write`.
- jobsService.js: the Authorization header is present only at lines 21-22, 92-94, 166-168 and 225-226. getJob (:39), run (:259), stop (:273) and logs (:287) have no header.
- Frontend callers match a grep of `src/`. `/stop`, `/api/jobs/:id/schedules`, `/execute` and `/status` have no routes.

## Residual notes (not defects)
- Everything marked "inferred" (Postgres type and aggregate errors, pg duplicate-column behaviour) is labelled as such. Nothing was run against a database.
- The database_ddl_* dumps omit ON DELETE and CHECK clauses, so the note's use of the Jan_05 dump as its basis is right.
