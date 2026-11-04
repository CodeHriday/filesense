# BPR verify (final, after fix round 2)

Verdict: PASS. Checked 40, wrong 0, unsupported 1 (minor), missed 0.

## Coverage
All 13 BPR routes in inventory.md (12239-13847 range), the `/business-processes` FE route (App.jsx:416) and the startup hook (server.js:14102) have subsections. The startup IIFE is also covered.

## Round-2 items re-checked
- W1 (PUT strict `!==`): CORRECT. server.js:12488 uses `group_id && group_id !== rows[0].group_id`. BusinessProcesses.jsx:127 prefills the integer `process.group_id`. `handleInputChange` (:146-148) stores `e.target.value`, which is a string.
- W2 relabel: CORRECT.
  - DBTService.js reads and writes `dbt_models` and `dbt_executions` at :36, :122, :181.
  - adminCleanupRoutes.js counts them at :150-151, deletes them at :482-483, and deletes `job_group_schedules` at :296.
  - SystemCleanup.jsx:64 lists `dbt_models` and `dbt_executions`.
  - `job_group_schedules.project_id` is `INTEGER NOT NULL` (dump:1449). The FK `fk_job_group_schedules_project` is at 1767 dump:3624.
- M1: CORRECT. dump:3487 and 1767 dump:3806 both make `user_groups.group_id` reference `access_groups(id)`. The enrol insert (server.js:12275-12278) and the membership joins (:12292, :12476-12478) treat the value as a `groups` id.
- M2: CORRECT. `groups` has `groups_pkey` (dump:2920, :4172) and a non-unique `idx_groups_name` (:4174).
- M3: CORRECT. `users.id` is INTEGER (dump:2394) and `job_groups.created_by` is UUID NOT NULL (dump:1455). The insert uses `String(userId)` (server.js:13726-13733).
- M4: CORRECT. auditMiddleware.js:48 maps `/api/job-groups` to `job_group`. A grep of that file finds no `business-process` entry. server.js:606 applies the middleware globally.
- M5: CORRECT. The cross-area users of the migration tables are listed accurately.
- M6: CORRECT. `app.use('/api/groups', ...)` is at server.js:5393. `app.get('/api/groups')` is at :13326 and `app.post` at :13375.
- Open questions 12 and 7 (route half): closed claims are consistent with the earlier repo-wide grep.
- CHECK-absence wording: acceptable. It is stated as a dump-format limit and not as evidence about prod.

## Other claims spot-checked, all CORRECT
- Default Group enrol and swallow (server.js:12267-12286).
- Visible-groups query (:12289-12294).
- PUT membership query and `status` not written (:12474-12510).
- Job-group queries `u.id::text = jg.created_by` (:13609, :13634) and `jg.created_by = ANY($1)` (:13610).
- `workflow_executions` and `workflow_steps` FKs to `business_processes` (dump:3609, :3615).
- `jobs.business_process_id` is a plain INTEGER with an index only (dump:1499, :4224).
- `job_group_jobs` columns and UUID `job_id` (dump:1431-1433).
- `job_group_schedules` defaults (dump:1442-1444).

## Unsupported (1, minor)
- The "per the verifier" claims, namely the 1767 dump having no CHECK constraints, the App.jsx and JobGroupDetail.jsx:190 greps, and the ProcessManagementWizard call sites, are hearsay. I did not re-run them. They are flagged as such in the notes.

## Missed
None found. The full-file rewrite lost nothing material.
