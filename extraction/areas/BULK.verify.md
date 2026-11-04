# BULK verification (final re-verify after fix round 2)

Verdict: PASS. About 48 claims checked, 0 wrong, 2 unsupported or imprecise, 0 missing entry points.

## Coverage
All 10 routes in inventory.md:321-330 have a subsection, and the scheduler trigger is covered too. No entry point is missing.

## Round-2 changes (all CORRECT)
- Two auth middlewares in sequence. server.js:406 imports `{authenticateToken}` from `./backend/src/middleware/authenticate`, and server.js:5190 mounts it. That one is async, loads the user from the DB and builds `req.user = {...decoded, ...user}` (:53). bulkProfiling.js:9 imports `../middleware/authenticate`, which is a plain `jwt.verify` with `req.user = decoded` (:35) and 401 bodies of the form `{error}`. Both are as the notes say. The route-level one runs second and overwrites `req.user` with the bare token payload.
- Zero-files response: bulkProfiling.js:98 gets `job` from `createJob`, which returns `result.rows[0]` with status `pending` (Service:441). Route :109 updates the DB row to `completed`, and :110-114 returns the stale `job`. Correct.
- Unawaited `updateJobStatus` at Service:736. It has no `await` and no `.catch`, and `updateJobStatus` rethrows (:635-638). Correct.
- NaN cron. Service:396-402 builds the string from getters on `new Date(jobData.scheduleStartDate)`. `createSchedule` calls `parseAndCalculateNextRun`, which throws `Invalid cron expression` (cronSchedulerService.js:41), and `createSchedule` rethrows (:155). An unknown `scheduleType` gives `Invalid schedule type: undefined` (:112). Both happen before the job insert. Correct.
- PYTHONPATH wording. `_detectDuplicates` spawns without `env` (:1161) and uses `sys.path.insert(0,'.')` (:1154). `quality_checks.py` sits at the repo root, so this works only when cwd is the repo root. The wording is accurate for that function.

## Other claims checked (all CORRECT unless noted)
- Route validation, defaults and responses for browse (:18-47) and discover (:53-84).
- Service logic:
  - Browse type and provider checks, :144-147, 171-192.
  - IAM role path, :220-247.
  - `MaxKeys` 1000 with a single `listObjectsV2` call, :71 and :262.
  - Extension lists in browse (:280-293) and discover (:82-94), and the `.tar.gz` / `path.extname` issue.
  - `matchesPattern` (:332-339).
  - `createJob` UUID versus integer connection lookup (:350-375).
  - Schedule created before the job insert, no `sub_project_id` passed (:378-408).
  - Job insert defaults (:418-433).
  - Multi-row file insert and `total_files` (:451-478).
  - `getJob` and `getAllJobs`: LIMIT/OFFSET after `parseInt`, `frequency` (:512-516, 581-598).
- `startBulkProfiling` (:711-749):
  - Already-running returns 200 with a message, and other non-pending statuses throw.
  - The check and the update to `running` are not atomic.
  - The catch only marks the job `failed` if it is still `pending`.
- `_processFilesAsync`:
  - Static keys and `config.bucket_name` only (:761-770).
  - Duplicate skip (:778-795).
  - `/tmp` temp path (:799).
  - Infected file is deleted and marked `failed` (:809-829).
  - UUID used as checksum (:864).
  - Hard-coded `quality_score` 85 and `'complete'` (:1225, 1247).
  - Preview capped at 100 rows (:1321).
  - Ownership (:1345).
  - Job set to `completed` regardless of file failures (:999).
- Quality validation: `validateDataWithRules` is imported at :19, but qualityValidationEngine.js:1396 exports only the class. The TypeError is swallowed at :907-914. No `quality_violations` DDL exists, and the only code reference is in this service.
- `updateSchedule` with only `isActive`: `'cron_expression' in updates` with an undefined value counts as changed, so it throws at :251-253. Correct. Frontend sends both keys.
- `deleteSchedule` hard-deletes and throws if not found (:330-338). `getSchedulesByType` (:192).
- Scheduler trigger at :444-449. `last_run`/`next_run` are updated only after success (:459-476). The catch at :503 does not update `next_run`, so the schedule is retried each tick. Alert emitted at :514. `userId` is `schedule.created_by` (:397).
- VirusScan fail-open (:24, 227-242, 271-307), `init-clamav.sh` timeout of 300000 ms (:87), hard-coded `/home/runner/.clamav` (:132, 157).
- Migration 004 has `connection_id INTEGER` (:230) and none of the other columns. DDL:704, 722-724 are as stated.
- Frontend callers (all URLs appear at the cited files) and adminCleanupRoutes.js:297.
- Imports of cloudStorageFileList.js by other modules, all as listed.
- `browseS3Path` is also called from vendorAccessRoutes.js:278.

## UNSUPPORTED or imprecise (2)
1. "Deleting a job cascades to files". The route comment (:249) and migration (index.js:255, `ON DELETE CASCADE`) support it. The DDL dump has no `ON DELETE` clauses at all, e.g. line 3189 is a bare FK, so the live cascade is unproven.
2. Flag "temp file not deleted if virus scan throws". The same notes say `scanFile` never throws, so that branch is unreachable. The valid case is a failed or partial download, which goes to the outer catch with no cleanup. Reword the flag.

## Minor omissions (do not change the verdict)
- PYTHONPATH: `_callPythonProcessor` (:1065) and `_callProfilingScript` (:1112) do set `PYTHONPATH` to the workspace root. Only `_detectDuplicates` does not. Stating this would prevent a misreading of "the code itself does not set PYTHONPATH".
- On a fatal background error the job is set to `failed` twice (:1003, then :736).
- `scheduler.js:42` has an entity_type `bulk_profiling` mapped to null, which does not match the `bulk_profiling_job` used here.
