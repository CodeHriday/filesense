# ARC verification

Verdict: PASS (checked about 45 claims; 0 WRONG; 1 UNSUPPORTED; 0 missing entry points)

Note: server.js is at the repo root, not backend/. ARC.md cites it correctly as server.js.

## Coverage
All assigned entry points have subsections: POST /api/files/:fileId/password, POST /api/files/:fileId/retry, the six /api/dlq-jobs routes, /failed-jobs, scripts/init-clamav.sh. The two long inventory rows (lines 837 and areas.md:15) were truncated in the tool output and not compared.

## CORRECT (cite re-checked)
- server.js:4651-4720 and :4725-4874 handler flow, status codes and messages. `pool` is undeclared (only a commented line at :897), and :4678 and :4700 use it, so the password route returns 500.
- Queue name mismatch: server.js:4692 and :4846 use `process_file_<id>`. The worker listens only on `'file-processing'` (fileProcessingWorker.js:250, 272, 277). Other producers use `'file-processing'` (server.js:3227, 4496, 8912).
- dlqRoutes.js:9-340: validation order, messages, `parseInt`, the lowercase `password` test at :270, payload password set only in memory at :235. Mount at server.js:13961.
- dlqService.js: classification order and texts (:13-35), updateDLQJobStatus (:163-203), filters and pagination, `toDate` as `<=` (:105-107), `SELECT *`, statistics.
- archiveDetectionService.js: magic bytes, detection order (:35-67), SUPPORTED_FORMATS at :18, extension list at :19, 7z heuristic (:209-227), constructor `(logger)` at :22.
- archiveExtractionService.js: 25 MB limit (:11, :118-121), extraction record (:26-39, :257-285), temp dir never removed (:289-303), batch of 5 (:175), infected member deleted (:185-193), pyzipper script (:417-476), tar extractors, `bunzip2` exit code unchecked, 7z (:725-769), archive_members insert (:782-801), `unzipper` unused.
- fileProcessingWorker.js: `ARCHIVE_EXTENSIONS` (:31), password lookup (:609-685), success path with temp-dir cleanup (:694-846), failure branches (:847-921), `categorizeError` order (:110-222), virus scan (:468-511), detection service constructed with wrong arguments (:53).
- VirusScanService.js: fail-open, `reset`/`getVersion`/`isAvailable` have no callers, the :131 re-check is unreachable after a failed init, either-main-or-daily rule (:55-62).
- init-clamav.sh: all line claims (:7, 8, 16-34, 40-54, 60-71, 74, 84-88, 92-96).
- passwordVaultService.js: key validation, GCM/CBC fallback, upsert leaving `encryption_version` unchanged, audit only when `logAction` exists. `getPassword` is called at vendorAgreementFileSchemaRoutes.js:517 and not defined by the service.
- Frontend: FailedJobs.jsx (filters, columns, button conditions, toast text, pagination), DLQBadge labels, PasswordInputModal (untrimmed submit at :18-19, "automatically deleted" text at :94-95), src/App.jsx:413, `retryFileProcessing` has no importer, DataProfile callers at :1532 and :1571.
- profile_api.py: fail-closed scan (:486-505), 2 GB tar skip (:1070), `.tbz2` rejected (:1212 and :1215). `DISABLE_VIRUS_SCAN` defaults in productionBootstrap.js:38 and .replit:65.
- uploadCleanupWorker.js: regular files only, 1 h max age. server.js:55-60.
- Migrations: `unique_archive_member` at 002:36. The only `005_` hit in backend/src/migrations/index.js is an unrelated migration, so the claim that the SQL files are unreferenced holds.

## UNSUPPORTED
1. ARC.md says `trackArchiveMembers` is not reached because Python returns `member_manifest`/`profiled_member` (profile_api.py:1143-1148). The worker does call it at fileProcessingWorker.js:1077-1078 when `format_specific.archive_members` is set. I did not confirm whether Python ever emits that key. Treat "not reached" as unproven.

## Omissions (minor, not entry points)
- dlqRoutes.js outer catches are undocumented: `/retry` returns 500 `Failed to retry DLQ job` (:175-185) and `/provide-password` returns 500 `Failed to provide password for DLQ job` (:292-302).
- `createDLQJob` rewrites `errorMessage` for `ARCHIVE_PASSWORD_REQUIRED` and `INVALID_PASSWORD` (dlqService.js:15, :19). ARC.md mentions this only for the first.
- `archiveExtractionService` is also auto-registered in DI (the file name ends in Service.js; backend/di/services.js:22-60). It is built with `(dbPool, logger)`, so the logger lands in the `virusScanService` slot. ARC.md lists only three auto-registered services.
- archiveExtractionService.js:322-323 also maps an open-time `encrypted` or `wrong password` error to `ARCHIVE_PASSWORD_REQUIRED`.
