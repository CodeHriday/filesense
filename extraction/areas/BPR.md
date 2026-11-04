# BPR - Business processes & job groups

Paths are relative to the repo root. `server.js` is the ROOT `server.js` (not `backend/src/server.js`, which is 53 lines).

## Summary
Business processes are group-scoped containers of jobs (`business_processes` -> `jobs`). Job groups are a separate, user-scoped bundling of jobs. Both are served from root `server.js`. Business-process access is by membership of `groups` (via `user_groups`). Job-group access is by creator or admin. The UI page `src/pages/BusinessProcesses.jsx` calls `src/api/businessProcessesService.js` and `groupsService.getUserGroups` (:10-11). I did not trace the page logic or the unrouted UI files (see Open questions).

## Entry points
All use `authenticateToken` (route lines below). No role check except where noted.

### GET /api/business-processes (server.js:12239)
- Side effect on every read: if no group named 'Default Group' exists it is inserted (:12248-12258). The caller is inserted into `user_groups` for it (:12267-12279). Errors there are swallowed (:12283-12286).
- Visible groups: groups the user belongs to, OR any group named 'Default Group' (:12293).
- Returns `[]` if no groups (:12300). Otherwise returns `bp.*`, `group_name`, `job_count`, `project_name`, filtered by `bp.group_id = ANY(groups)`, ordered by `updated_at DESC` (:12305-12319). 500 `Failed to fetch business processes`.

### GET /api/business-processes/:id (server.js:12327)
- Groups taken from `user_groups` only; there is no Default Group fallback here (:12333-12340). 403 if the user has no groups (:12342), 404 if the process is missing (:12355), 403 if `process.group_id` is not in the user's groups (:12362).
- Returns the process plus `jobs[]` with `run_count` and `last_run_time` from `job_runs` (:12367-12380).

### POST /api/business-processes (server.js:12390)
- Input: `name` (required, else 400, :12398), `description`, `group_id`. `created_by` = `req.user.id`.
- No `group_id`: use or create 'Default Group' (:12403-12426). Given `group_id`: it must exist, else 400 (:12430-12435).
- Membership in the target group is NOT checked: `skipGroupVerification = true` (:12440-12443, variable unused). Any user can create in any group.
- Inserts name, description, group_id, created_by. `status` takes the DB default 'active' (init DDL :44). Returns 201 with the row. Other errors: 500.

### PUT /api/business-processes/:id (server.js:12462)
- `name` required (400, :12469). The caller must be in the process's group, else 404 (:12474-12485).
- If `group_id` changes, the caller must be a member of the new group, else 403 (:12488-12498). `finalGroupId = group_id || current` (:12512).
- `status` is read from the body (:12465) but is not written (:12502-12510). Updates name, description, group_id, `updated_at`.

### DELETE /api/business-processes/:id (server.js:12524)
- The caller must be in the process's group, else 404 (:12531-12542). Hard delete (:12545). Jobs are removed by the FK cascade (init DDL :55; comment :12544). Returns `{message:'Business process deleted successfully'}`.

### GET /api/process-wizard/init-data (server.js:13293)
- Returns `{success, groups, files, connections}`.
- groups: all rows of `groups`, by name (:13296).
- files: `id, file_name, file_type, file_size, uploaded_at, project_id, status` where `status != 'deleted'`, newest first (:13297-13302).
- connections: `id, name, connection_type, storage_type, status, created_at` where `status='active'` (:13303-13308).
- No per-user or project filtering. 500 on error.

### GET /api/job-groups (server.js:13570)
- Visibility: the caller's own groups. If `userHasAdminAccess(req.user)` (:380), all users' groups (:13585-13593).
- Match is `jg.created_by = ANY(ids)` (:13610). Returns `jg.*`, `job_count`, `created_by_name` (default 'Unknown'), newest first.

### GET /api/job-groups/:id (server.js:13624)
- 404 `Group not found` (:13640). 403 unless the caller is `created_by` or an admin (:13645-13650). Returns the group plus `jobs[]` (:13654-13665).

### POST /api/job-groups (server.js:13675)
- `name` is required (400, :13680). `description` is optional.
- Runs `CREATE TABLE IF NOT EXISTS` on every call for `job_groups`, `job_group_jobs` and `user_job_groups` with UUID ids (:13685-13711).
- Inserts with `created_by = String(userId)` (:13730-13733). Adds the creator to `user_job_groups` (:13739). Returns 201 with `created_by_name`.

### PUT /api/job-groups/:id (server.js:13758)
- 404 if the group is missing (:13766). No ownership check. No name validation (`name` may be undefined). Updates name, description, `updated_at = NOW()`.

### DELETE /api/job-groups/:id (server.js:13784)
- 404 if the group is missing. No ownership check. Deletes `job_group_jobs` and `user_job_groups` rows, then the group, with no transaction (:13796-13800).

### POST /api/job-groups/:id/jobs (server.js:13810)
- Body `job_id` is required (400, :13815). 404 if the group is missing (:13822), 404 if the job is missing (:13829). Inserts `ON CONFLICT DO NOTHING` (:13835). No ownership check.

### DELETE /api/job-groups/:id/jobs/:jobId (server.js:13847)
- Deletes the membership row. Returns success even when no row exists. No existence or ownership check.

### Startup hook initBusinessProcessTables (initBusinessProcessTables.js:7; called server.js:14102)
- Creates the `uuid-ossp` extension and the tables `groups`, `user_groups`, `business_processes`, `jobs`, `job_runs`, `job_groups`, `job_group_jobs` (:10-105).
- Inserts 'Default Group' if missing, and tolerates a 23505 race (:108-126).
- Then calls the transformation, ETL transformation and logical file groups migrations (:131-137). Errors are caught and logged only (:138-140). The call site also catches errors (server.js:14104-14105).

### FE route /business-processes (src/pages/BusinessProcesses.jsx; route src/App.jsx:416 per inventory)
- Not traced.

### Job dependency tables (backend/migrations/createJobDependencyTables.js:3)
- Creates `job_dependencies` (`dependency_type` default 'completion'; `wait_for_success` default TRUE; no self-dependency CHECK, :28), `job_group_schedules` and `job_group_dependencies`. Also creates `dbt_models` and `dbt_executions`.
- `job_group_schedules`: `schedule_type` in ('cron','interval','manual'); `execution_order` default 'parallel', allowed 'parallel','sequential','dependency-based'; `max_concurrent_jobs` default 5; `retry_policy` default `{"maxRetries": 3, "retryDelay": 300}` (:43-66).
- `job_group_dependencies`: `dependency_type` in ('all_success','any_success','all_complete'), default 'all_success' (:79-97).
- Runs only via `require.main === module` (:257). I found no call from server.js. No API for these tables exists in this area.

## Data touched
- `business_processes` (R/W), `groups` (R/W: Default Group insert), `user_groups` (R/W), `jobs` (R), `job_runs` (R), `projects` (R, join), `files` and `connections` (R, wizard).
- `job_groups`, `job_group_jobs`, `user_job_groups` (R/W, also DDL at runtime).
- Migration-only tables: `job_dependencies`, `job_group_schedules`, `job_group_dependencies`, `dbt_models`, `dbt_executions`.

## Flags
- BUG: `business_processes.project_id` is selected and joined (server.js:12308, :12312), but the init DDL has no `project_id` column (initBusinessProcessTables.js:38-47). Only the DDL dump files add it (`database_ddl_2026-01-07.sql:3195`). On a database built only from the init code, the list endpoint would fail. Evidence is indirect.
- BUG: Schema conflict. The init file defines `job_groups.id` as SERIAL and `job_group_jobs.job_id` as an INTEGER FK (init:86-105). The POST /api/job-groups DDL defines UUID ids (server.js:13687-13701). The migration references `job_groups(id)` as UUID (createJobDependencyTables.js:45). Which one applies depends on which ran first; with `IF NOT EXISTS` the later one is silently skipped.
- BUG: The PUT /api/business-processes/:id `status` body field is read but never persisted (server.js:12465 vs :12502-12510).
- BUG: GET /api/process-wizard/init-data selects `id`, `file_name`, `uploaded_at` from `files` (:13298). Elsewhere in server.js, `files` is queried by `file_id` and `filename` (e.g. :715, :2274). It may fail or return wrong shapes (UNCLEAR which schema is live).
- BUG: PUT /api/job-groups/:id does not validate `name`, so null/undefined can overwrite the name (:13761-13774). The `name` column is NOT NULL in both DDLs, so the request would 500.
- SECURITY: Job-group PUT, DELETE, add-job and remove-job have no ownership or admin check (:13758, :13784, :13810, :13847). Any authenticated user who knows an id can modify or delete another user's group.
- SECURITY: POST /api/business-processes allows creation in any existing group without membership (:12440-12443). Wizard init-data returns all groups, all files and all connections to any authenticated user (:13296-13308).
- SECURITY: GET /api/business-processes shows every business process in 'Default Group' to all users, and every read auto-enrols the caller into it (:12267-12279, :12293). GET /:id does not apply the same Default Group rule (:12333-12364), so a process listed may return 403 when opened (inconsistency; the 403 for a user with no groups, :12342, is the clearest case).
- DUPLICATE: The Default Group creation logic is repeated in the init file (:108-126), GET list (:12248-12258), POST (:12407-12421) and likely `/api/groups` (server.js:13329, not traced). The race handling differs: only the init file handles 23505.
- DUPLICATE: `userHasAdminAccess` exists in server.js:380 and `backend/utils/permissionHelpers.js:80`. I did not compare them.
- DUPLICATE: There are two groups concepts, business-process `groups`/`user_groups` and `job_groups`/`user_job_groups`. Two `server.js` files exist (root, and a 53-line backend/src/server.js).
- UNCLEAR: `user_job_groups` is written on create and deleted on group delete, but never read for access control. Access uses `created_by` only (:13610, :13645).
- UNCLEAR: The sharing comment says "users with same role", but the code returns only the current user, or all users for admins (:13575-13594). `userRoles` is unused (:13573, :13628).
- UNCLEAR: GET /api/job-groups and GET /api/business-processes do not paginate.
- DEAD: `job_dependencies`, `job_group_schedules`, `job_group_dependencies`, `dbt_*` tables have no route in this area, and the migration is not called at startup (only the CLI path, :257).
- DEAD: Fallback `req.user ? req.user.id : 2` (:12394, :12467, :12528). The route requires `authenticateToken`, so it is unreachable.
- DEAD (per inventory/areas.md, not verified): Unrouted UI files ProcessManagementWizard.jsx, BusinessProcessDetail.jsx, JobGroups.jsx, JobGroupDetail.jsx, JobCreate.jsx, JobDetail.jsx.

## Domain terms
- Business process (`business_processes`): has a group, a status (default 'active'), and jobs.
- Group (`groups`) / Default Group: a membership scope for business processes. "Job group" (`job_groups`) is a different thing.
- Job: `jobs` row (default status 'draft'), with run history in `job_runs`.
- Job group, "Group" (error messages in the job-group API say "group"/"Group not found" for job groups).
- Process wizard: the ProcessManagementWizard page.
- "same role" users: the comment wording for the job group sharing model.

## Open questions
1. Where is `business_processes.project_id` created in the live schema? Not found in code, only in DDL dumps.
2. Is `job_groups.id` UUID or SERIAL in production, and which DDL wins at runtime?
3. Is `files` keyed `id`/`file_name` or `file_id`/`filename`? This decides whether process-wizard init-data works.
4. Does the migration createJobDependencyTables ever run (no startup call found), and does `file_schedules` back `job_dependencies`? That table references `file_schedules(id)`, not `jobs`.
5. What does BusinessProcesses.jsx do (create, edit, delete, status handling)? Not traced.
6. Is `jobs` managed by another area (`/api/jobs` is at server.js:12558)? Out of this area's scope.
7. Are the unrouted UI pages truly unreachable (inventory says so; I did not verify)?
8. Does `/api/groups` at server.js:13326 belong to GRP and mirror the Default Group logic?
