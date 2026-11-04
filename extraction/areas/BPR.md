# BPR - Business processes & job groups

Paths are relative to the repo root. `server.js` is the ROOT `server.js` (not `backend/src/server.js`, which is 53 lines).

Schema bases used below (the three disagree, so every schema claim names its basis):
- **init DDL** = `initBusinessProcessTables.js` (run at startup).
- **migration** = `backend/migrations/createJobDependencyTables.js` (CLI only).
- **prod dump** = `database_ddl_2026-01-07.sql` (repo root; line numbers are that file's own). `attached_assets/database_ddl_1767770486833.sql` was also checked for `files` (:1401-1404) and the verifier reports it agrees on the tables cited here; I re-read only the `files` part of it.

## Summary
Business processes are group-scoped containers of jobs (`business_processes` -> `jobs`). Job groups are a separate, user-scoped bundling of jobs. Both are served from root `server.js`. Business-process access is by membership of `groups` (via `user_groups`). Job-group access is by creator or admin. The UI page `src/pages/BusinessProcesses.jsx` (titled "Workflows") calls `src/api/businessProcessesService.js` and `groupsService.getUserGroups` (:10-11). The page is traced below. The unrouted UI files were not read (see Open questions). No BPR route uses `requireProjectAccess` or any project scoping (see Flags).

## Entry points
All use `authenticateToken` (route lines below). No role check except where noted.

### GET /api/business-processes (server.js:12239)
- Side effect on every read: if no group named 'Default Group' exists it is inserted (:12248-12258). The caller is inserted into `user_groups` for it (:12267-12279). Errors there are swallowed (:12283-12286).
- Visible groups: groups the user belongs to, OR any group named 'Default Group' (:12293).
- Returns `[]` if no groups (:12300). Otherwise returns `bp.*`, `group_name`, `job_count`, `project_name`, filtered by `bp.group_id = ANY(groups)`, ordered by `updated_at DESC` (:12305-12319). 500 `Failed to fetch business processes`.
- Joins `projects` through `bp.project_id` (:12308, :12312). No project filter is applied.
- Basis prod dump: `user_groups.group_id` references `access_groups(id)`, not `groups(id)` (dump:3487; 1767 dump:3806), so the enrol insert (:12267-12279) writes a `groups` id into an `access_groups` FK column; see the id-space BUG in Flags.

### GET /api/business-processes/:id (server.js:12327)
- Groups taken from `user_groups` only; there is no Default Group fallback here (:12333-12340). 403 if the user has no groups (:12342), 404 if the process is missing (:12355), 403 if `process.group_id` is not in the user's groups (:12362).
- Returns the process plus `jobs[]` with `run_count` and `last_run_time` from `job_runs` (:12367-12380).
- A non-numeric `:id` is an integer cast error and gives 500, not 404 (inferred from the Postgres integer `id`; not exercised).

### POST /api/business-processes (server.js:12390)
- Input: `name` (required, else 400, :12398), `description`, `group_id`. `created_by` = `req.user.id`.
- No `group_id`: use or create 'Default Group' (:12403-12426). Given `group_id`: it must exist, else 400 (:12430-12435).
- Membership in the target group is NOT checked: `skipGroupVerification = true` (:12440-12443, variable unused). Any user can create in any group.
- The INSERT is `INSERT INTO business_processes (name, description, group_id, created_by)` (:12446-12452). It never sets `project_id` and never sets `status`. Returns 201 with the row. Other errors: 500 `Failed to create business process` (:12457).
- Basis init DDL: `status` takes the DB default 'active' (init:44); `project_id` does not exist as a column there (init:38-47), so the INSERT would succeed.
- Basis prod dump: `business_processes` has no `status` column and `project_id INTEGER NOT NULL` with no default (dump:727-735). The INSERT omits `project_id`, so by the schema every POST would fail with a 500 (inferred from the DDL; not run). The FE form also never sends `project_id` (BusinessProcesses.jsx:84-88).

### PUT /api/business-processes/:id (server.js:12462)
- `name` required (400, :12469). The caller must be in the process's group, else 404 (:12474-12485).
- If `group_id` changes, the caller must be a member of the new group, else 403 (:12488-12498). `finalGroupId = group_id || current` (:12512).
- The change test is `group_id !== checkResult.rows[0].group_id` (:12488), a strict comparison. The edit form is prefilled with the integer `group_id: process.group_id` (BusinessProcesses.jsx:127), so with the select untouched the body carries an integer, the test is false and the membership query is skipped. Once the user touches the `<select>` the value becomes a string (BusinessProcesses.jsx:145-148, :442-446) while `group_id` is an integer in the DB (dump:730; init:42), so the test is true even if the same group is re-picked and the membership query runs. Minor; the outcome is the same unless the user is no longer in their own group.
- Basis prod dump: the membership checks (:12474-12478, :12488-12498) join `user_groups` to `groups.id`, but prod `user_groups.group_id` references `access_groups(id)` (see Flags, id-space BUG).
- `status` is read from the body (:12465) but is not written (:12502-12510). Updates name, description, group_id, `updated_at`.

### DELETE /api/business-processes/:id (server.js:12524)
- The caller must be in the process's group, else 404 (:12531-12542). Hard delete (:12545). Returns `{message:'Business process deleted successfully'}`.
- Basis init DDL: jobs are removed by the FK cascade (`jobs.business_process_id ... ON DELETE CASCADE`, init:55; comment :12544).
- Basis prod dump: there is no FK from `jobs.business_process_id` to `business_processes` (`jobs.business_process_id INTEGER`, dump:1499; the only FKs on `jobs` are `jobs_created_by_fkey`, dump:3314-3315, and `job_runs`/`job_history` point at `jobs`, dump:3308-3311). So no cascade: jobs are orphaned, not deleted.
- Basis prod dump: `workflow_executions.workflow_id` and `workflow_steps.workflow_id` reference `business_processes(id)` (dump:3609, :3615) with no ON DELETE action. Deleting a process that those tables reference fails with an FK violation, so the route returns 500 (inferred from the DDL; I did not read the delete handler's error branch beyond the catch).

### GET /api/process-wizard/init-data (server.js:13293)
- Returns `{success, groups, files, connections}`.
- groups: all rows of `groups`, by name (:13296).
- files: `id, file_name, file_type, file_size, uploaded_at, project_id, status` where `status != 'deleted'`, newest first (:13297-13302).
- connections: `id, name, connection_type, storage_type, status, created_at` where `status='active'` (:13303-13308).
- No per-user or project filtering. 500 on error.
- Basis prod dump: `files` has `file_id` and `filename`, and no `file_name` column (dump:1289-1291; also 1767770486833:1401-1404). The files query therefore throws and the endpoint returns 500 in prod (inferred from the DDL). Its page route was removed (App.jsx:423).

### GET /api/job-groups (server.js:13570)
- Visibility: the caller's own groups. If `userHasAdminAccess(req.user)` (:380), all users' groups (:13585-13593). The admin users query is inside the try/catch, so if it fails the code falls back to the caller's own groups (verifier-confirmed, :13576-13616).
- Match is `jg.created_by = ANY(ids)` (:13610). Returns `jg.*`, `job_count`, `created_by_name` (default 'Unknown'), newest first.
- Basis prod dump: `job_groups.created_by` is UUID (dump:1455) but the queries use `u.id::text = jg.created_by`, a text = uuid comparison with no operator; likely a 500 (inferred, not run).

### GET /api/job-groups/:id (server.js:13624)
- 404 `Group not found` (:13640). 403 unless the caller is `created_by` or an admin (:13645-13650). Returns the group plus `jobs[]` (:13654-13665).
- Basis prod dump: `job_group_jobs.job_id` is UUID (dump:1432) but `jobs.id` is INTEGER (dump:1497), so the join `j.id = jgj.job_id` fails with a type error (inferred, not run). A non-UUID `:id` gives a 500 cast error, not a 404.

### POST /api/job-groups (server.js:13675)
- `name` is required (400, :13680). `description` is optional.
- Runs `CREATE TABLE IF NOT EXISTS` on every call for `job_groups`, `job_group_jobs` and `user_job_groups` with UUID ids (:13685-13711).
- Inserts with `created_by = String(userId)` (:13730-13733). Adds the creator to `user_job_groups` (:13739). Returns 201 with `created_by_name`.
- Basis prod dump: `users.id` is INTEGER (dump:2394) and `job_groups.created_by` is UUID (dump:1455), so inserting `String(userId)` (for example '2') is rejected as an invalid uuid and every create returns 500 (inferred from the DDL, not run). `user_job_groups.user_id` is also UUID (dump:2367).
- Audit: `backend/middleware/auditMiddleware.js:48` maps `/api/job-groups` to resource type `job_group`; the middleware is applied globally (`app.use(createAuditMiddleware(auditService))`, server.js:606). A grep of that file found no entry for `/api/business-processes`.
- Basis prod dump: `job_group_jobs` has `group_id, job_id, added_at` and no `id` (dump:1431-1433). That matches the server.js DDL and not the init DDL (`id`, `created_at`, init:97-104).
- Basis init DDL on a fresh DB: the init file creates `job_groups.id` as SERIAL (init:86-87) first, so the `CREATE TABLE IF NOT EXISTS` in this route is skipped. `user_job_groups.group_id` is UUID in the server.js DDL, so the creator insert (:13739) fails after the group row is already written (inferred).

### PUT /api/job-groups/:id (server.js:13758)
- 404 if the group is missing (:13766). No ownership check. No name validation (`name` may be undefined). Updates name, description, `updated_at = NOW()`.

### DELETE /api/job-groups/:id (server.js:13784)
- 404 if the group is missing. No ownership check. Deletes `job_group_jobs` and `user_job_groups` rows, then the group, with no transaction (:13796-13800).

### POST /api/job-groups/:id/jobs (server.js:13810)
- Body `job_id` is required (400, :13815). 404 if the group is missing (:13822), 404 if the job is missing (:13829). Inserts `ON CONFLICT DO NOTHING` (:13835). No ownership check.
- Basis prod dump: `job_group_jobs.job_id` is UUID (dump:1432) and `jobs.id` is INTEGER (dump:1497), so the INSERT fails with a 500 (inferred, not run).

### DELETE /api/job-groups/:id/jobs/:jobId (server.js:13847)
- Deletes the membership row. Returns success even when no row exists (:13852). No existence or ownership check.

### Startup hook initBusinessProcessTables (initBusinessProcessTables.js:7; called server.js:14102)
- Creates the `uuid-ossp` extension and the tables `groups`, `user_groups`, `business_processes`, `jobs`, `job_runs`, `job_groups`, `job_group_jobs` (:10-105).
- Inserts 'Default Group' if missing, and tolerates a 23505 race (:108-126). Basis prod dump: `groups` has no UNIQUE on `name`, so that 23505 path cannot fire there (see Flags).
- Then calls the transformation, ETL transformation and logical file groups migrations (:131-137). Errors are caught and logged only (:138-140). The call site also catches errors (server.js:14104-14105).

### Startup IIFE: enrol users without a group (server.js:13535-13565)
- Runs once at module load, no caller. Looks up `SELECT id FROM access_groups WHERE name = 'Default Group'` (:13537), not `groups`. If found, inserts every user that has no `user_groups` row into `user_groups` with that group id, `ON CONFLICT DO NOTHING` (:13543-13558), and logs the count (:13560). Errors are caught and logged (:13562-13564).
- The group id comes from `access_groups` and is written to `user_groups.group_id`, which the BPR request handlers treat as a `groups` id. Basis prod dump: `user_groups.group_id` references `access_groups(id)` (dump:3487), so the IIFE matches the FK and the handlers do not (see Flags).

### FE route /business-processes (src/pages/BusinessProcesses.jsx; route src/App.jsx:416)
- Route: `/business-processes` renders `BusinessProcesses` inside `ProtectedRoute` (App.jsx:416). `/business-processes/:processId` renders the `Jobs` page, not a business-process detail page (App.jsx:417).
- UI wording: the page title is "Workflows" (:218); buttons and messages say "workflow" (:103, :179, :191, :242).
- Load (:95-119): calls `getBusinessProcesses()`, then `getUserGroups()` (a GRP route, `/api/groups/user` per the verifier). If the processes response is not `success`, the error is `message || 'Failed to fetch workflows'` (:103). A failed groups response is only logged to the console (:111).
- Create button is `disabled` and styled not-allowed at opacity 0.5 when the user has no groups (:226, :233-234). The empty state shows "You need to create a group first before you can create a workflow" when there are no groups (:266-275).
- Create form sends the whole `formData`: `name`, `description`, `group_id` (:84-88, :172). It never sends `project_id` or `status`. The default `group_id` is the first user group's id (:135).
- Client validation on submit: `name.trim()` required, "Process name is required" (:154-157); `group_id` required, "Group is required" (:159-162). The inputs also have `required` (:404, :447).
- Edit: same modal, prefilled from the process (:121-128), calls `updateBusinessProcess(currentProcess.id, formData)` (:169). On success it refetches and closes (:175-178); the status field is not in the UI.
- Delete: a ConfirmModal with the message "Are you sure you want to delete this workflow? All associated jobs will also be deleted." (:191) before `deleteBusinessProcess` (:194). The message claims a job cascade that does not exist on the prod schema (see DELETE above).
- Cards show name, description, group name and `job_count || 0` (:310-325). The group name is looked up in the user's groups with strict `g.id === groupId`, and shows "Unknown Group" if absent (:209-213). Each card links to `/business-processes/${process.id}` (:336).
- Errors set the single page-level `error` string; it is never cleared by the page except by being overwritten (:246). No pagination.

### FE service calls with no matching backend route
- `GET /api/business-processes/:id/jobs` (src/api/jobsService.js:51), `GET /api/job-groups/:id/jobs` (src/api/jobGroupsService.js:63) and `GET /api/groups/:id/business-processes` (src/api/businessProcessesService.js:67). A repo-wide grep (verifier) of js/jsx/ts for `business-processes|job-groups|process-wizard` finds route definitions only in root `server.js` (12239-12524, 13293, 13570-13847), so these three have no server route; Express `:id` matches a single path segment, so the existing `/api/business-processes/:id` does not serve them.
- `/job-groups` is not routed in src/App.jsx (grep of App.jsx for `JobGroups|job-groups` found no route). `JobGroupDetail.jsx:190` navigates to it (per the verifier; not re-read).

### Job dependency tables (backend/migrations/createJobDependencyTables.js:3)
- Basis migration: creates `job_dependencies` (`dependency_type` default 'completion'; `wait_for_success` default TRUE; `job_id` and `depends_on_job_id` both `REFERENCES file_schedules(id)`, :14-15; `CONSTRAINT no_self_dependency CHECK (job_id != depends_on_job_id)` at :28), `job_group_schedules` and `job_group_dependencies`. Also creates `dbt_models` and `dbt_executions`.
- Basis prod dump: `job_dependencies` also references `file_schedules(id)` (dump:3297, :3299). The dump shows no `no_self_dependency` CHECK. Neither dump emits CHECK constraints at all (the 1767 dump has none, per the verifier), so the missing CHECK is a dump-format limit, not evidence that prod lacks it.
- `job_group_schedules`: `schedule_type` in ('cron','interval','manual'); `execution_order` default 'parallel', allowed 'parallel','sequential','dependency-based'; `max_concurrent_jobs` default 5; `retry_policy` default `{"maxRetries": 3, "retryDelay": 300}` (:43-66).
- `job_group_dependencies`: `dependency_type` in ('all_success','any_success','all_complete'), default 'all_success' (:79-97).
- Runs only via `require.main === module` (:257). A grep across *.js and *.json found `createJobDependencyTables` only in its own file (verifier). No API for `job_dependencies` exists anywhere in the repo.
- Other users of these tables outside this area: `backend/services/DBTService.js` reads and writes `dbt_models` and `dbt_executions` (:36, :122, :181); `backend/routes/adminCleanupRoutes.js` counts and deletes them (:150-151, :482-483) and deletes `job_group_schedules` (:296); `src/pages/SystemCleanup.jsx:64` lists the `dbt_*` tables; `backend/migrations/addProjectIdToConnections.js:116-179` ALTERs `job_group_schedules` to add `project_id` and the FK `fk_job_group_schedules_project` (:138-141), which `createJobDependencyTables` does not define. Basis prod dump: `job_group_schedules.project_id` is NOT NULL with that FK (1767 dump:3624, per the verifier). There is no `job_group_*` route other than those in server.js.

## Data touched
- `business_processes` (R/W), `groups` (R/W: Default Group insert), `user_groups` (R/W), `jobs` (R), `job_runs` (R), `projects` (R, join), `files` and `connections` (R, wizard), `access_groups` (R, startup IIFE).
- `job_groups`, `job_group_jobs`, `user_job_groups` (R/W, also DDL at runtime).
- Created by the migration, not by any route in this area: `job_dependencies`, `job_group_schedules`, `job_group_dependencies`, `dbt_models`, `dbt_executions`. Not migration-only: `dbt_*` are used by `backend/services/DBTService.js`, `backend/routes/adminCleanupRoutes.js` (:150-151, :482-483) and listed in `src/pages/SystemCleanup.jsx:64`; `job_group_schedules` is deleted by `adminCleanupRoutes.js:296` and altered by `backend/migrations/addProjectIdToConnections.js:116-179`.
- `user_groups` (prod dump): `user_id INTEGER`, PK (user_id, group_id), `group_id` FK to `access_groups(id)` (dump:2363, :3062, :3487), `user_id` FK to `users(id)` (dump:3489).
- Prod dump cross-area links to `business_processes(id)`: `workflow_executions.workflow_id` and `workflow_steps.workflow_id` (dump:3609, :3615), `jobs.business_process_id` (column only, no FK, dump:1499).

## Flags
- BUG (schema-dependent): `business_processes.project_id` is selected and joined (server.js:12308, :12312), but the init DDL has no `project_id` column (initBusinessProcessTables.js:38-47). Only the prod dump has it, as `INTEGER NOT NULL` (dump:734) with FK `fk_business_processes_project` (dump:3195). On a database built only from the init code, the list endpoint would fail. Evidence is indirect.
- BUG: POST /api/business-processes omits `project_id` (server.js:12446-12452) while the prod dump makes it NOT NULL (dump:734). By the prod schema every create fails; the FE does not send it either (BusinessProcesses.jsx:84-88). Basis: prod dump (inferred, not run).
- BUG: Schema conflict across three bases for `business_processes`. Init DDL has `status` default 'active', `created_by TEXT NOT NULL`, no `project_id`, FK `group_id ... ON DELETE SET NULL` (init:38-47). The prod dump has no `status`, `created_by INTEGER`, `project_id INTEGER NOT NULL`, and an FK to `groups` with no delete action (dump:727-735, :3193). The code relies on a different one in different places: `status` default (POST) relies on the init DDL; `project_id` (list) relies on the prod dump.
- BUG: Schema conflict for job groups. The init file defines `job_groups.id` as SERIAL and `job_group_jobs.job_id` as an INTEGER FK (init:86-105). The POST /api/job-groups DDL defines UUID ids (server.js:13687-13701). The migration references `job_groups(id)` as UUID (createJobDependencyTables.js:45). The prod dump has UUID `job_groups.id`, `job_groups.created_by` and `job_group_jobs.job_id` (dump:1432, :1452, :1455) next to INTEGER `jobs.id` (dump:1497). Which one applies depends on which ran first; with `IF NOT EXISTS` the later one is silently skipped.
- BUG: PUT /api/business-processes/:id `status` body field is read but never persisted (server.js:12465 vs :12502-12510). The prod dump has no `status` column at all (dump:727-735).
- BUG: DELETE /api/business-processes/:id: the FE and the code comment say jobs are deleted (BusinessProcesses.jsx:191; server.js:12544), but on the prod dump there is no FK so jobs are orphaned, and FKs from `workflow_executions`/`workflow_steps` can make the delete fail (dump:3609, :3615).
- BUG: GET /api/process-wizard/init-data selects `file_name` and `uploaded_at` from `files` (:13298); the prod `files` table has `file_id`/`filename` and no `file_name` (dump:1289-1291), so the endpoint fails in prod. Elsewhere in server.js, `files` is queried by `file_id` and `filename` (e.g. :715, :2274).
- BUG: Job-group tables on the prod schema: UUID `job_group_jobs.job_id` against INTEGER `jobs.id` breaks POST /:id/jobs and GET /:id (dump:1432 vs :1497); UUID `job_groups.created_by` against `u.id::text` breaks the text comparison in the list and detail queries (dump:1455). All inferred from DDL, not run.
- BUG: PUT /api/job-groups/:id does not validate `name`, so null/undefined can overwrite the name (:13761-13774). The `name` column is NOT NULL in both DDLs, so the request would 500.
- BUG: PUT /api/business-processes/:id compares `group_id` to the current group with strict `!==` (:12488). The FE sends an integer while the select is untouched (BusinessProcesses.jsx:127), so the check is skipped; after the user touches the select it sends a string, so the new-group membership check runs even for the same group (minor).
- BUG (prod dump): id-space conflict. Prod `user_groups.group_id` references `access_groups(id)`, not `groups(id)` (dump:3487; 1767 dump:3806); `user_id` is INTEGER (dump:2363). BPR treats `groups.id` as `user_groups.group_id` in the list's visible-groups query (:12289-12294), the Default Group auto-enrol (:12267-12279), and the membership joins (:12333-12340, :12474-12478). The enrol insert writes a `groups` id, so it violates the FK unless the ids coincide, and the error is swallowed (:12283-12286). Membership checks may also match a different group with the same number. The startup IIFE uses `access_groups` ids (:13537) and so agrees with the FK. Cross-reference GRP. Inferred from the DDL, not run.
- BUG (prod dump): `groups` has only a PK (dump:2920, :4172) and a non-unique index on `name` (dump:4174); the init DDL's UNIQUE on name is absent. The 23505 handling (initBusinessProcessTables.js:108-126) can never fire there, and duplicate 'Default Group' rows are possible.
- BUG (prod dump): POST /api/job-groups inserts `String(userId)` into UUID `job_groups.created_by` and fails on prod (see its entry point). The `jg.created_by = ANY($1)` comparison (:13610) has the same type mismatch.
- SECURITY: Job-group PUT, DELETE, add-job and remove-job have no ownership or admin check (:13758, :13784, :13810, :13847). Any authenticated user who knows an id can modify or delete another user's group.
- SECURITY: POST /api/business-processes allows creation in any existing group without membership (:12440-12443). Wizard init-data returns all groups, all files and all connections to any authenticated user (:13296-13308).
- SECURITY: GET /api/business-processes shows every business process in 'Default Group' to all users, and every read auto-enrols the caller into it (:12267-12279, :12293). GET /:id does not apply the same Default Group rule (:12333-12364), so a process listed may return 403 when opened (inconsistency; the 403 for a user with no groups, :12342, is the clearest case).
- SECURITY: No project scoping on any BPR route. None uses `requireProjectAccess`, and none filters or authorises by `project_id`, although prod `business_processes` has the column (dump:734). Any group member sees all processes regardless of project.
- DUPLICATE: The Default Group creation logic is repeated in the init file (:108-126), GET list (:12248-12258), POST (:12407-12421) and likely `/api/groups` (server.js:13326, not traced; also mounted earlier at :5393). The race handling differs: only the init file handles 23505. A fourth variant is the startup IIFE, which looks in `access_groups` instead of `groups` (:13537).
- DUPLICATE: `userHasAdminAccess` exists in server.js:380 and `backend/utils/permissionHelpers.js:80`. I did not compare them.
- DUPLICATE: There are two groups concepts, business-process `groups`/`user_groups` and `job_groups`/`user_job_groups`. Two `server.js` files exist (root, and a 53-line backend/src/server.js).
- UNCLEAR: `user_job_groups` is written on create and deleted on group delete, but never read for access control. Access uses `created_by` only (:13610, :13645).
- UNCLEAR: The sharing comment says "users with same role", but the code returns only the current user, or all users for admins (:13575-13594). `userRoles` is unused (:13573, :13628).
- UNCLEAR: GET /api/job-groups and GET /api/business-processes do not paginate.
- UNCLEAR: The `/api/groups` handler at server.js:13326 is also preceded by an earlier mount `app.use('/api/groups', authenticateToken, groupRoutes(dbPool))` at server.js:5393, so the :13326 handler may be shadowed. Not traced.
- UNCLEAR: Neither dump emits CHECK constraints (1767 dump count 0 per the verifier), so a missing CHECK in a dump (e.g. `no_self_dependency`) is a dump-format limit, not evidence about prod.
- DEAD: `job_dependencies` and `job_group_dependencies` have no route anywhere found in the repo, and the migration is not called at startup (only the CLI path, :257). `job_group_schedules` and `dbt_*` have no route in this area but are used by `adminCleanupRoutes.js` (:296, :150-151, :482-483), `DBTService.js`, `addProjectIdToConnections.js:116-179` and `src/pages/SystemCleanup.jsx:64`; I did not check whether those are reached.
- DEAD: Fallback `req.user ? req.user.id : 2` (:12394, :12467, :12528). The route requires `authenticateToken`, so it is unreachable.
- DEAD (per inventory/areas.md, partly verified): `ProcessManagementWizard` has no route (App.jsx:423 comment "ProcessManagementWizard route removed"). A grep of App.jsx for `JobGroups`, `BusinessProcessDetail`, `JobCreate`, `JobDetail` found no route. JobGroups.jsx, JobGroupDetail.jsx, BusinessProcessDetail.jsx, JobCreate.jsx and JobDetail.jsx were not read. ProcessManagementWizard.jsx calls init-data, `GET /api/business-processes?groupId=` (the server ignores the `groupId` param) and POST (:179, :312, :342, per the verifier; not re-read).

## Domain terms
- Business process (`business_processes`): has a group, a status (default 'active' in the init DDL only), and jobs. The UI calls it "Workflow" (BusinessProcesses.jsx:218) and also "Process" (:361, :376, :395).
- Group (`groups`) / Default Group: a membership scope for business processes. "Job group" (`job_groups`) is a different thing. `access_groups` is the table prod `user_groups` actually references (dump:3487).
- Job: `jobs` row (default status 'draft'), with run history in `job_runs`.
- Job group, "Group" (error messages in the job-group API say "group"/"Group not found" for job groups).
- Process wizard: the ProcessManagementWizard page.
- "same role" users: the comment wording for the job group sharing model.

## Open questions
1. Is `business_processes.project_id` created by anything other than the dump? Not found in code. The POST route does not set it.
2. Is `job_groups.id` UUID or SERIAL in production, and which DDL wins at runtime? The prod dump shows UUID (dump:1452).
3. (Closed) `files` in prod is `file_id`/`filename` (dump:1289-1291; 1767770486833:1401-1404), so init-data fails there.
4. Does the migration createJobDependencyTables ever run (no startup call found)? `job_dependencies` references `file_schedules(id)`, not `jobs` (migration:14-15; dump:3297, :3299).
5. (Closed) BusinessProcesses.jsx behaviour is traced above.
6. Is `jobs` managed by another area (`/api/jobs` is at server.js:12558)? Out of this area's scope.
7. (Route half closed) Routes for business-processes, job-groups and process-wizard exist only in root server.js (verifier repo-wide grep). Still open: are the unrouted UI pages unreachable beyond the App.jsx grep? Lazy imports were not checked and the files were not read.
8. Does `/api/groups` at server.js:13326 belong to GRP and mirror the Default Group logic? (It is also mounted at :5393.)
9. (Closed) `access_groups` exists and is the FK parent of prod `user_groups.group_id` (dump:3487; 1767 dump:3806). Whether its ids coincide with `groups` ids is not established.
10. Does the prod `business_processes` really lack a `status` column and the `jobs` FK, or does the dump omit them? The dump is the only evidence.
11. Is a CHECK `no_self_dependency` present in prod? Neither dump emits CHECK constraints, so this cannot be answered from them.
12. (Closed) The FE-only calls (`/api/business-processes/:id/jobs`, `/api/job-groups/:id/jobs`, `/api/groups/:id/business-processes`) have no routes: a repo-wide grep (verifier) finds routes for business-processes, job-groups and process-wizard only in root server.js.
