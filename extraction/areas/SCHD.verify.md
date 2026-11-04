# SCHD verification (round 3, after fix round 2)

Verdict: FIX (one minor WRONG; everything else in the round-2 list is confirmed)

Counts: about 40 claims checked, 1 WRONG, 0 UNSUPPORTED, 0 missed entry points (1 trivial missed detail).

## Coverage
All 10 router routes, 7 server.js SCHD rows (inventory :173-:176, :178, :179, :181), worker, startup hook and 3 FE pages have subsections. Inventory rows :177 and :180 belong to JOB. E24-E26 are extra. No entry point is missing.

## Round-2 changes
- Prod file_schedules FKs (Jan_05 :7487-:7489): CORRECT (SET NULL, fk_file CASCADE, fk_file_schedules_project CASCADE). project_id NOT NULL at :4925 is correct. The legacy POST INSERT at server.js:11930 omits project_id, so it fails on prod.
- E20: CORRECT. Route at server.js:12220 with no per-route auth. The prefix mount at :5283 (`app.use('/api/files', authenticateToken, schemaHistoryRoutes)`) covers it. The query has no project filter. SECURITY lists only E19 as unauthenticated, which is CORRECT (:12000 has no authenticateToken, and no /api/job-schedules mount exists).
- E19 and Open question 6: CORRECT. Inventory :177 and :180 are JOB.
- E23: CORRECT, re-read. Scheduler.jsx:59-60 uses file_id and frequency. :638 and :750 render `entity_name || schedule_name || file_id`. Import from schedulerService is at :9. schedulerService.js:11 returns `response.data.schedules || []`, :41 uses PATCH, and delete and run follow at :56 and :71.
- One-time bulk cron recurs yearly: CORRECT (BulkProfilingService.js:402 `${minute} ${hour} ${day} ${month} *`, :725 pending check).
- fk_schedules_project CASCADE (:7723) and sub_project SET NULL (:7724): CORRECT.
- Other citations re-checked and CORRECT: scheduler.js :70, :80 (`user?.roles?.includes('Admin')`), :147, :203, :42-45; service tz UTC :29, FOR UPDATE :227, Number :260, :289, setImmediate :479/:512, Unknown entity type :456; worker 60000, isProcessing :46, allSettled :54; server.js mounts :5271, :5283, DELETE copies :12000, :12198, :13055.

## WRONG
1. E25: the method/line pairing is swapped. schedulesService.js:19 is the GET `/api/schedules` (getSchedules, no method option) and :72 is the POST (method: 'POST' at :73). The notes say "POST (:19), GET (:72)". PUT (:115) and DELETE (:158) are right.

## Missed (trivial)
- schedulesService.js:46 also calls GET `/api/jobs/:id/schedules` (getJobSchedules). The file is unimported and the route is outside SCHD, so impact is nil.

## Rewrite loss check
Nothing from earlier reports was lost.
