# SCHD - Scheduling

## Summary
Two unrelated schedule systems share the `/api/schedules` URL space.
1. Current: table `schedules`, served by `backend/routes/scheduler.js` (mounted at server.js:5270-5271 with `authenticateToken`). It supports cron and interval schedules for mappings, visual mappings, mapping groups and workflows. The service also executes `bulk_profiling_job` and `vendor_agreement_expiration`, which the HTTP create route rejects. A `SchedulerWorker` (server.js:48-51, started :14111) polls every 60000 ms and calls `processDueSchedules` and `processDigests` (backend/workers/schedulerWorker.js:54-57).
2. Legacy: table `file_schedules` (frequency hourly/daily/weekly/monthly), inline in server.js:11810-12234. Most of its `/api/schedules` routes are shadowed by the router above. `Scheduler.jsx` is half migrated between the legacy and current shapes (see E23).

## Entry points

### E1 POST /api/schedules (scheduler.js:123)
- Auth: JWT from the mount (server.js:5271). The project check is in `validateEntityProjectAccess` (scheduler.js:62-93).
- Inputs: entity_type, entity_id, schedule_name, schedule_type, cron_expression, interval_value, interval_unit, timezone (default `'UTC'`, :135), sub_project_id, created_by, enabled (:127-139).
- Validation:
  - entity_type, entity_id and schedule_type are required (:147), otherwise 400.
  - entity_type must be one of mapping, visual_mapping, mapping_group, workflow (:159).
  - schedule_type must be cron or interval (:166).
  - A cron schedule needs cron_expression (:174). An interval schedule needs interval_value and interval_unit (:182).
- `enabled` maps to `is_active`, default true (:144).
- Access rule:
  - The project is looked up from the entity (:17-57).
  - A missing entity returns 404.
  - Non-admins must belong to the entity's project, otherwise 403 (:80-89).
  - The admin check at :80 is `user.roles.includes('Admin')`. The null-project branch at :70 uses `userHasAdminAccess` instead.
- Side effects:
  - `createSchedule` (cronSchedulerService.js:88) computes next_run and inserts into `schedules`.
  - entity_id is stored as `String(entity_id)` (:124).
  - created_by is taken from the body, falling back to the authenticated user (:203).
- Response: 201 `{success, schedule}` with `enabled` added. Errors: 403 or 404 as above, otherwise 500 with `error.message`.
- Rules:
  - Cron next_run is computed with `tz:'UTC'` (service :27-30). The `timezone` field is stored but not used for computation.
  - Interval units are minute, hour, day, week, month, year (:57-75). Any other unit throws, which surfaces as a 500 from this route.
  - interval_value is not type-checked. A string value would concatenate (see BUG).

### E2 GET /api/schedules (scheduler.js:229)
- Auth: JWT. Admins (`userHasAdminAccess`) see all schedules. Others see only schedules whose project_id is in their projects (:282). A user with no projects gets `[]` (:242).
- Response: a bare array with schedule_id, enabled, entity_name and project_name, ordered by created_at DESC.
- Entity names are resolved by LEFT JOIN to the mapping, group and workflow tables.

### E3 GET /api/schedules/active (scheduler.js:301)
- Same filter as E2, restricted to `is_active = true`, ordered by next_run ASC. Response `{success, schedules}` (`s.*`, so the raw field is `is_active`, not `enabled`).

### E4 GET /api/schedules/init-data (scheduler.js:370)
- Returns the lists the form needs: transformations (mappings plus visual mappings with `is_visual_mapping`), mappingGroups, nStepWorkflows, visualWorkflows, projects.
- Non-admins are filtered by project ids (:429-435). Visual mappings are filtered by `is_active = true` (:406). Visual workflows are filtered by `is_active = true OR is_active IS NULL` (:421).
- Projects are limited to `parent_id IS NULL` (:426).

### E5 GET /api/schedules/:entityType/:entityId (scheduler.js:480)
- JWT only. There is no project or ownership check.
- entityType must be one of the four values (:484), otherwise 400.
- Returns `{success, schedules}` with `SELECT *`.

### E6 GET /api/schedules/:id (scheduler.js:504)
- JWT only. There is no project check.
- The id must match `^\d+$` (:509), otherwise 400. A missing schedule returns 404.
- Response is a single object. It does not include project_id (:519-532).
- Because E5's `/:entityType/:entityId` has two segments, there is no collision with this route.

### E7 PUT /api/schedules/:id (scheduler.js:566)
- Auth: JWT plus `validateScheduleAccess` (:98) on the existing entity. The new entity is not access-checked if entity_type or entity_id are changed in the body (:597-601).
- The body is passed straight to `updateSchedule`. Only id, created_at, updated_at and schedule_id are stripped (:575-578).
- project_id is overwritten from the entity (:602). `enabled` becomes `is_active` (:605).
- `updateSchedule` (service :219):
  - Runs in a transaction with `FOR UPDATE`.
  - Recomputes next_run when cron_expression, interval_value, interval_unit, schedule_type or timezone changed (:238-273).
  - Builds the SET clause from the keys of the body (:280-286).
  - Throws "No fields to update" when nothing is left.
- Errors: 403 or 404 are mapped. Every other error returns 500, including validation errors thrown in the service (such as a missing cron_expression).

### E8 PATCH /api/schedules/:id/toggle (scheduler.js:635)
- Auth: JWT plus `validateScheduleAccess`.
- Runs `SET is_active = NOT is_active`. Response `{success, schedule}`.
- next_run is not recalculated on re-enable (:642-647). A schedule disabled for a while is therefore due immediately when re-enabled (next_run is in the past), and the worker runs it on the next tick.

### E9 DELETE /api/schedules/:id (scheduler.js:681)
- Auth: JWT plus `validateScheduleAccess`. Calls `deleteSchedule`. Response `{success, deleted}`.

### E10 POST /api/schedules/process-due (scheduler.js:707)
- The comment says "admin endpoint" (:706), but there is no admin check, only the mount JWT. Any authenticated user can trigger execution of all due schedules.
- Response is the `processDueSchedules` result.
- The route is declared after `/:id`-style routes. POST is only matched by `/` and `/process-due`, so there is no clash.

### E11 Scheduler worker (backend/workers/schedulerWorker.js)
- Trigger: runs immediately at start, then every 60000 ms (:31-37). The overlap guard is `isProcessing` (:46), so a run is skipped if the previous one is still active.
- Each tick runs `processDueSchedules` and `processDigests` together via `Promise.allSettled` (:54).
- `processDueSchedules` (service :360):
  - Selects `is_active = true AND next_run <= now`, ordered by next_run ASC (:371-375). Schedules run sequentially.
  - userId is `schedule.created_by || null` (:397).
  - Dispatch by entity_type:
    - mapping -> `executeTransformationJob(pool, entity_id, userId, {scheduleId})` (:403).
    - mapping_group -> `executeMappingGroup(parseInt(id), null, userId, {scheduleId})` (:410).
    - workflow -> if an active row exists in `visual_workflows` with that id, `VisualWorkflowExecutor.execute()`. Otherwise `executeNStepWorkflow` (:418-437).
    - visual_mapping -> `VisualWorkflowExecutor(null,userId).executeMapping(parseInt(id))` (:442-443).
    - bulk_profiling_job -> `bulkProfilingService.startJob(entity_id,userId)` (:446).
    - vendor_agreement_expiration -> `vendorAgreementService.autoDisableExpiredAgreements()` (:454).
    - any other value throws `Unknown entity type`.
  - After a successful run, next_run is computed from `now` (not from the old next_run) and last_run is set (:459-476). Missed runs are therefore not caught up.
  - After success or failure it emits `alertAggregationWorker.onScheduleExecuted(id,'completed'|'failed')` via `setImmediate` (:479, :512).
  - On failure it logs and pushes `{success:false}`. It does not update last_run or next_run (:503-534).
  - No dedup exists if the same entity is already running; an overlapping execution runs twice (service :400-457).

### E12 Startup hook: table creation (server.js:11811)
- Creates `file_schedules` if absent (:11814). It also creates the `transformations` table (:11839), which is not scheduling.
- The current `schedules` table is not created here. ETL.md says `initSchedulesTable` creates `job_schedules` at server.js:6011. The `schedules` DDL is at backend/migrations/workflowOrchestration.js:66-87 (constraints per source are listed under Data touched).

### E13 Legacy GET /api/schedules (server.js:11862)
- Shadowed by E2 (the router is mounted at :5271, earlier than :11862, and always responds to this path). Never reached.

### E14 Legacy GET /api/schedules/:id (server.js:11873)
- Shadowed by E6 for numeric ids. For non-numeric ids the router responds 400, so the legacy route is never reached.

### E15 Legacy POST /api/schedules (server.js:11890)
- Shadowed by E1. Never reached.
- Its logic, for reference: required file_id and frequency (:11894); next_run computed from server-local time (see E18).
- It does not set project_id (server.js:11930), so on the prod dump (`file_schedules.project_id` NOT NULL, dump :4925) the insert would fail. The FK constraints in the prod dump (:7487-7489) do not change this.

### E16 PATCH /api/schedules/:id (server.js:11945)
- Reachable. The router has no PATCH `/:id`, only `/:id/toggle`, so the request falls through to this route after the mount JWT.
- It updates `file_schedules`, not `schedules`.
- There is no access check, only the JWT from the mount.
- frequency, time, day and is_active are updated. next_run is NOT recalculated (:11955-11973). The updated_at value is set from the app clock.
- A non-existent id returns 404. The default 500 body leaks `error.message` in `details`.
- The frontend `updateSchedule` in `src/api/schedulerService.js:41` calls this route (PATCH), so it operates on the legacy table with no auth beyond the JWT.

### E17 POST /api/schedules/:id/run (server.js:12018)
- Reachable after the mount JWT. Requires `req.user.permissions` to include `schedule:execute`, otherwise 403 (:12021).
- Looks up `file_schedules` by id (404 if missing), then the file in `files` (404 if missing).
- Sets `last_run` and returns `{message, job:{id: uuidv4(), status:'processing', file, started_at}}`.
- It does nothing else. The comment at :12054 says "Here you would trigger the file processing logic", so the job is a stub.
- `schedule:execute` is seeded in backend/scripts/seedProductionManual.sql:30 and :77.

### E18 PATCH /api/schedules/:id (server.js:12075) - second definition
- Dead. Express uses the first matching handler (E16 at :11945) and E16 always responds.
- It differs from E16 by validating frequency in `['hourly','daily','weekly','monthly']` (:12092) and recomputing next_run when frequency is given (:12098-12127).
- It would also have failed on an empty updateFields check that can never be true, because updated_at is always pushed (:12172, :12180).

### E19 DELETE /api/job-schedules/:id (server.js:12000 and :12198)
- Two copies in the legacy block, plus a third authenticated copy at :13055 (JOB area).
- The first one registered (:12000) wins. It has no `authenticateToken` in its definition and there is no `/api/job-schedules` mount, so it is unauthenticated (the mount at :5271 covers only `/api/schedules`).
- It deletes from `file_schedules` and returns `{message, schedule}`.
- The :12198 copy is dead. The :13055 authenticated copy is also dead for this path, because :12000 is registered earlier and always responds.
- Inventory rows :177 and :180 for this route exist and are assigned to the JOB area, not SCHD.

### E20 GET /api/files/:fileId/schedules (server.js:12220)
- Authenticated: `app.use('/api/files', authenticateToken, schemaHistoryRoutes)` at server.js:5283 runs the JWT check for every `/api/files/*` request. There is no project or ownership filter.
- Returns every `file_schedules` row for the file ID, ordered by created_at DESC.
- Response: `{schedules}`. The 500 body includes `details: error.message`.

### E21 Frontend: ETLScheduler.jsx
- Route `/etl-scheduler`. Calls GET `/api/schedules` (:33), PUT `/api/schedules/:id` with `{enabled: !currentEnabled}` (:48), and DELETE `/api/schedules/:id` (:68). It uses the current (router) API.
- The PUT toggle sends only `enabled`, so `updateSchedule` gets `is_active` only. next_run is not recalculated (same issue as E8).

### E22 Frontend: SchedulerForm.jsx
- Routes `/etl-scheduler/create` and `/etl-scheduler/:scheduleId/edit`.
- Calls GET `/api/schedules/init-data` (:76), GET `/api/schedules/:id` (:125), PUT `/api/schedules/:id` (:192), POST `/api/schedules` (:195), and GET `/api/projects/:id/sub-projects` (:64).
- It uses the current (router) API.

### E23 Frontend: Scheduler.jsx
- Route `/scheduler`. Uses `src/api/schedulerService.js` (:9): GET `/api/schedules` (:10), POST `/api/schedules` (:25), PATCH (:41), DELETE (:56), POST `/:id/run` (:71).
- The page is half migrated. The search filter uses `schedule.file_id` and `schedule.frequency` (Scheduler.jsx:59-60), which are legacy `file_schedules` fields. It also renders `schedule.entity_name || schedule.schedule_name || schedule.file_id` (:638, :750) and groups by project (`schedulerGrouping`, :14), which fit the current shape.
- GET and POST now hit the router (new shape: no `file_id` or `frequency`). Delete goes to the router DELETE. Only PATCH and run hit the legacy handlers.
- The page does not throw. `src/api/schedulerService.js:11` returns `response.data.schedules || []`, but the router GET returns a bare array (E2), so `.schedules` is undefined and the page receives `[]`. The list is silently empty and the search filter never sees a row.

### E24 Frontend: ProcessManagementWizard.jsx
- `src/pages/ProcessManagementWizard.jsx:1776` POSTs `{job_id, enabled, type, cron_expression | one_time_date}` (payload built at :1763-1776) to `/api/schedules`. The router requires entity_type, entity_id and schedule_type (scheduler.js:147), so it returns 400. Wizard schedules are never created (links to SCHV).

### E25 Frontend: schedulesService.js
- `src/api/schedulesService.js:199` and `:226` call `/api/schedules/:id/enable` and `/api/schedules/:id/disable`. Neither the router nor the legacy block defines these routes, so they return 404. No importer was found.
- The same file also calls, with fetch, POST `/api/schedules` (:19), GET `/api/schedules` (:72), PUT `/api/schedules/:id` (:115) and DELETE `/api/schedules/:id` (:158). Nothing imports the file, so none of these calls is reached.

### E26 Non-HTTP and other callers of the schedule service
- `backend/routes/bulkProfiling.js:11` imports `getSchedulesByType`, `updateSchedule` and `deleteSchedule`. It calls them at :272 (`getSchedulesByType('bulk_profiling_job')`), :310 and :334, without `validateScheduleAccess`.
- `backend/services/BulkProfilingService.js:378-405` calls `createSchedule` with entity_type `bulk_profiling_job`. Recurring: schedule_type cron with the given `cronExpression`. One-time: a cron built at :397-402 from `getMinutes()`, `getHours()`, `getDate()` and `getMonth()+1` of `scheduleStartDate` (server-local time), while the service evaluates cron in UTC.
- `server.js:6034-6080` `initVendorAgreementExpirationSchedule` (called at :6080) seeds a daily `0 0 * * *` vendor schedule with `project_id = null` and created_by 1. It fails on the prod dump because project_id is NOT NULL.
- `autoDisableExpiredAgreements` runs in its own transaction and sets `updated_by = 1` (vendorAgreementService.js:3208).

## Data touched
- `schedules` (router, service, worker): entity_type, entity_id (stored as text), schedule_name, schedule_type, cron_expression, interval_value, interval_unit, timezone, next_run, last_run, project_id, sub_project_id, created_by, is_active, created_at, updated_at.
- `schedules` constraints differ by source:
  - backend/migrations/workflowOrchestration.js:66-87: entity_type CHECK of mapping, mapping_group, workflow only; `valid_cron` CHECK; interval_unit CHECK.
  - Prod dumps (attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql:6001-6027, identical to the _1767956647766 dump): entity_type CHECK also includes `vendor_agreement_expiration`; `project_id` NOT NULL.
  - Prod dump foreign keys on `schedules`: `fk_schedules_project` (project_id -> projects) ON DELETE CASCADE (:7723), so deleting a project silently deletes its schedules; `schedules_sub_project_id_fkey` ON DELETE SET NULL (:7724).
  - backend/migrations/addVisualMappingToSchedulesConstraint.js adds `visual_mapping`. Without it, POST with `visual_mapping` fails the CHECK and returns 500.
  - database_ddl_2026-01-07.sql:1915: no CHECKs, project_id nullable.
- `file_schedules` (legacy, server.js:11814): file_id, frequency, time, day, is_active, last_run, next_run, created_by. The FK to `files` exists in server.js:11826 and database_ddl_2026-01-07.sql (`fk_file`, `fk_file_schedules_project`). The prod dumps have `project_id int4 NOT NULL` (:4925) and these constraints (:7487-7489): `file_schedules_sub_project_id_fkey` ON DELETE SET NULL, `fk_file` (file_id -> files) ON DELETE CASCADE, `fk_file_schedules_project` (project_id -> projects) ON DELETE CASCADE.
- Read-only: `transformation_mappings`, `visual_mapping_defs`, `mapping_groups`, `n_step_workflows`, `visual_workflows`, `projects`, `files`.
- Side effects on other areas: executions in the EXE, MGRP, WFL and bulk profiling areas; `autoDisableExpiredAgreements`; digests via `processDigests`; alert events via `alertAggregationWorker`.

## Flags

### DUPLICATE
- Two schedule systems (`schedules` vs `file_schedules`) share `/api/schedules`.
- The next_run calculation for legacy schedules (server.js:11898-11927) is copied at :12098-12127. Both differ from the cron/interval logic in the service.
- PATCH /api/schedules/:id appears twice (server.js:11945, :12075). DELETE /api/job-schedules/:id appears three times (server.js:12000, :12198, :13055).
- Access checks in the router: `userHasAdminAccess` (:70, :235) vs `user.roles.includes('Admin')` (:80) for the same concept.

### BUG
- `calculateIntervalNextRun` is called with `interval_value` unconverted on create (service :110). A string from JSON would concatenate in `setMinutes(...+value)`. `updateSchedule` does normalise it with `Number` (:260), so create and update differ.
- Toggle (E8) and the `enabled`-only PUT (E21) re-enable without recomputing next_run (:642), so a re-enabled schedule runs immediately.
- E7 PUT: when the update includes `timezone` only, next_run is recomputed using UTC anyway (service :27-30), because the timezone is never passed to the parser.
- Legacy weekly next_run (server.js:11913-11914): `(dayOfWeek + 7 - now.getDay()) % 7`, with `daysToAdd === 0` meaning +7. If `day` is falsy (0 = Sunday or missing), then `day || 0` treats both the same way.
- Legacy monthly: `setMonth(+1)` then `setDate(day)` can overflow to the following month for day > 28 (:11920-11921).
- The legacy `file_schedules` rows are never executed by the worker (the worker only reads `schedules`), so file schedules created via legacy routes never run. POST `/:id/run` is a stub.
- The route comment in E10 says admin, but there is no check.
- `updateSchedule` error mapping: a missing schedule inside the service throws a plain Error, so the response is 500 rather than 404.
- A failed run leaves next_run unchanged, so a failing schedule is retried on every 60 s tick indefinitely.
- Multi-instance double execution: the worker has no lock across processes. The `isProcessing` flag is in-process only (worker :46).
- `getEntityProjectId` for `bulk_profiling` returns null (:42), but the service uses the entity type `bulk_profiling_job`, so the names differ. Effect: a `bulk_profiling_job` schedule falls through to `Unsupported entity_type` and PUT, toggle and DELETE through the router return 500.
- Recurring bulk schedules fail from run 2 onward: `startBulkProfiling` throws `Job ... is not in pending status` (BulkProfilingService.js:725) once the job has left pending. `processDueSchedules` does not update next_run on failure, so it retries and emits a `failed` alert every 60 s tick. The catch (service :503) also covers the post-run next_run and last_run UPDATE, so an error there reports a job that ran as failed and re-runs it.
- The one-time bulk cron is built from local time (BulkProfilingService.js:397-402) but evaluated in UTC (service :27-30), so the run time shifts by the server's UTC offset.
- The one-time bulk cron is `${minute} ${hour} ${day} ${month} *` (BulkProfilingService.js:402). The year is not constrained, so it matches every year and recurs annually instead of running once. The second run fails with "not in pending status" (:725), like the recurring case.
- Mapping-group runs with failed members are reported as success: `mappingGroupExecutionEngine.js:160` always gives status `completed`, so next_run advances and a `completed` alert is emitted.
- Schedules whose entity was deleted return 404 on PUT, toggle and DELETE for every user including admins (`validateScheduleAccess` -> `getEntityProjectId` throws 404, scheduler.js:50-54).
- Schedules with a null project_id (such as the vendor seed) are visible in GET /api/schedules and /active only to admins, because the `project_id = ANY` filter excludes NULL.
- `DigestService.js:418-428` advances `next_send_at` and `last_sent_at` unconditionally ("regardless of success"), so a failed digest is not retried (links to NTF). Digests share the worker tick with schedules, so a long schedule execution delays them.
- Creation conflicts: `bulk_profiling_job` is outside the entity_type CHECK in the migration and the prod dump, so the `createSchedule` call at BulkProfilingService.js:405 fails there. The vendor seed (server.js:6034-6080) has project_id null and violates NOT NULL on the prod dump.
- Legacy POST /api/schedules (E15) would fail on prod because `file_schedules.project_id` is NOT NULL; the route is shadowed anyway.
- `schedulesService.js` calls enable/disable routes that do not exist (E25). ProcessManagementWizard posts a payload the router rejects with 400 (E24).

### DEAD
- server.js:12075 (second PATCH).
- server.js:12198 and server.js:13055 are unreachable for DELETE /api/job-schedules/:id.
- server.js:11862, :11873 and :11890 (shadowed by the router).
- Router `getEntityProjectId` cases `vendor_agreement_expiration` and `bulk_profiling` are only reachable from PUT, toggle and delete (via `validateScheduleAccess`), because create rejects those types.
- `src/api/schedulesService.js` (no importer found; E25).

### SECURITY
- E19 (legacy DELETE /api/job-schedules/:id, :12000) has no authentication.
- E20 is authenticated (server.js:5283) but has no project filter: any authenticated user can list any file's schedules.
- E5 and E6: any authenticated user can read any schedule by id or entity, with no project filter.
- E10: any authenticated user can trigger all due schedules.
- E7: changing entity_type or entity_id in the body is not access-checked against the new entity (:597-601). `updateSchedule` uses all remaining body keys as SQL column names (service :280-283). The key names come from the request body, so this is column-name SQL injection. Values are parameterized.
- E7 can also set fields such as created_by, which determines the user the schedule executes as (service :397).
- E1: created_by is taken from the body (:203), so a user can create a schedule that runs as another user.
- E16 and E17: legacy handlers on a path under a JWT mount have no project check. Error bodies in the legacy routes expose `error.message` as `details`.
- E26: bulkProfiling.js calls `updateSchedule` and `deleteSchedule` directly, skipping `validateScheduleAccess`.

### UNCLEAR
- Why `timezone` is stored but ignored.

## Domain terms
- schedule / job schedule / file schedule: `schedules` (new) vs `file_schedules` (legacy) vs `job_schedules` (JOB area).
- entity_type values: mapping, visual_mapping, mapping_group, workflow, bulk_profiling_job, vendor_agreement_expiration. "transformation" is the frontend name for a mapping.
- enabled (API) = is_active (DB).
- due: `next_run <= now`.
- interval units: minute, hour, day, week, month, year. Legacy frequency: hourly, daily, weekly, monthly.
- n-step workflow vs visual workflow.

## Open questions
1. Which `schedules` DDL source matches the live database? The DDL exists (workflowOrchestration.js:66-87 and the dumps; see Data touched) but the constraints differ between them.
2. (Resolved) `schedule:execute` is seeded in backend/scripts/seedProductionManual.sql:30 and :77.
3. (Resolved) `getSchedulesByType` is called from backend/routes/bulkProfiling.js:272. Creators of `bulk_profiling_job` and `vendor_agreement_expiration` schedules are in E26.
4. Is `Scheduler.jsx` (route `/scheduler`) still in use, given that it is half migrated between the legacy and current shapes?
5. What does `processDigests` do (the NTF area)?
6. (Resolved) Inventory rows :177 and :180 (DELETE /api/job-schedules/:id) exist and belong to JOB.
