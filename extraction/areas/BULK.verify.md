# BULK verification (round 3, final)

Verdict: PASS. Checked 52, wrong 0, unsupported 0, missing entry points 0.

## Coverage
All 10 routes in inventory.md:321-330 have a subsection (browse, discover, jobs POST/GET, jobs/:jobId GET/DELETE, start, schedules GET/PUT/DELETE). The scheduler trigger is present (cronSchedulerService.js:444-449). All flags, DUPLICATE/DEAD/UNCLEAR entries and the 4 open questions are still present; nothing was lost.

## Round-2 changes
- Mount paragraph: CORRECT. server.js:406 imports `{ authenticateToken }` from `./backend/src/middleware/authenticate`; server.js:5190 mounts it; bulkProfiling.js:9 imports `../middleware/authenticate`, a plain `jwt.verify` that sets `req.user = decoded` (:35) and returns 401 `{error}`. The src middleware sets `req.user` merged with the DB user at :53 and returns 401 `{error, message}`. The try/catch log is at server.js:5193. The DUPLICATE flag is accurate.
- Zero-files stale job: CORRECT. bulkProfiling.js:108-115 calls `updateJobStatus(job.id,'completed')` and returns the `job` from createJob (:98), which has status `pending` (Service:428, RETURNING *). The schedule row is not touched.
- Unawaited `updateJobStatus` in `.catch`: CORRECT. Service:734-737, with no await and no catch at :736. `updateJobStatus` rethrows on error (:635-638), so this is an unhandled rejection.
- NaN cron: CORRECT. Service:396-402 uses `new Date(jobData.scheduleStartDate)` and local getters. `createSchedule` (cronSchedulerService.js:107-108) calls `parseAndCalculateNextRun`, which wraps parser errors as `Invalid cron expression` (:36-41). The unknown scheduleType path leaves `schedule_type` undefined and hits `Invalid schedule type: undefined` (:111-113). The schedule is created before the job insert, so no job row exists. The claim that the parser rejects NaN fields was not executed, only read; it is plausible.
- PYTHONPATH wording (:1161): CORRECT for `_detectDuplicates`. The spawn at :1161 passes no `env`, and the script uses `sys.path.insert(0,'.')` (:1154). `quality_checks.py` is at the repo root. Optional clarification only: the other two spawns (:1065 and :1112) do set `PYTHONPATH` to the workspace root. The sentence "the code itself does not set PYTHONPATH" is true only for `_detectDuplicates`. The notes could say so.

## Sampled pass (all CORRECT)
- Routes: all handler line numbers, 400/404/500 bodies, and the running-job 400 (routes:18-345).
- browse: provider checks (:144-147, 171-192), IAM role (:220-247), MaxKeys and Delimiter (:258-263), extension list (:280-293), output shape (:317-322).
- discover: type check (:34-38), s3:// parse (:47-50), prefix (:56), single list call (:68-78), extension list and the `.tar.gz` problem (:82-102), pattern regex (:332-339).
- createJob: connection checks (:350-375), schedule built before insert (:378-408), insert defaults (:418-433), multi-row file insert and total_files (:451-478).
- getJob and getAllJobs: filters, interpolated LIMIT/OFFSET, `frequency` (:512-516, 581-598).
- start: status checks (:719-726), non-atomic update (:729), `_processFilesAsync` S3 client from static keys and `bucket_name` (:761-770), skip duplicate (:778-795, 1040-1046), virus scan branch (:809-829), uuid hash (:864), quality_score 85 (:1247), cleanup in the inner finally (:981-986), job `completed` (:999).
- Quality validation: `validateDataWithRules` is imported at :19 but the module exports only the class (qualityValidationEngine.js:1396); the call is at :1389 and the outer catch at :907-914. No `quality_violations` DDL exists. Only `alert-flow.test.js` references it.
- Writes: preview data limit (:1321), ownership (:1345), `process_file.py:107-108`.
- PUT schedule: cron_expression undefined throws (cronSchedulerService.js:239, 251-253); frontend sends both keys (BulkProfilingTab.jsx:221-225).
- DELETE schedule (:330-338) and GET schedules (:192) are correct.
- Scheduler: retry behaviour (:459-476, 503-514).
- Other: migration 004 `connection_id INTEGER` (:230), DDL columns (:704, 722-724), adminCleanupRoutes.js:297, VirusScanService.js:24/87/132/157/236-305, cloudStorageFileList function ranges and `globToRegex` at :276, importers, frontend callers.

## Minor omissions (not counted as missing)
- `_processFilesAsync` already marks the job `failed` and rethrows in its own catch (Service:1001-1004), so the `.catch` at :734-737 repeats the update.
- A non-UUID, non-integer `connectionId` makes the `transform_connections` query fail with a DB error (Service:367-370) rather than the friendly message.
- `_checkFileExists` swallows DB errors and returns null (:1047-1050), so a failing duplicate check silently disables skip.
