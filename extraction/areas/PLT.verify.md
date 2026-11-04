# PLT verification, final (after fix round 2)

Verdict: PASS. About 62 claims checked, 0 WRONG, 0 UNSUPPORTED, 0 entry points missing. Three non-blocking remarks follow.

## Round-2 changes
- Dummy-pool flag: CORRECT. `testConnection` loops 5 times and throws (database.js:171-208). `initialize()` rethrows (:343-361). `initializeDatabase` rethrows (bootstrapper.js:137-149). `startServer` calls it at server.js:14066 and exits at :14211. The exit comes before the prerequisite query at :14073-14074.
- Entry 9: CORRECT. The comment has 7 CREATE TABLE statements: groups :7, user_groups :17, business_processes :26, jobs :38, job_runs :55, job_groups :68 (block :67-75) and job_group_jobs :78 (block :77-84). The file has no require and no exports; the comment runs :3-85.
- `/api/health/python` DEAD: CORRECT. `checkPythonEnvironment` resolves in the close, parse-failure and spawn-error paths (healthCheckRoutes.js:140-166). The 500 catch at :71-76 is unreachable.
- `/profile-api`: CORRECT. The `setTimeout(0)` middleware is at server.js:13978-13982. The proxy sits at :13983-14004 with `proxyTimeout` 120000 and a 502 handler. `generalLimiter` is mounted only on `/api/` (:767), so `/profile-api` is not covered. No `authenticateToken` precedes it. The SECURITY flag holds.
- Entry 9a: CORRECT. The package.json scripts at :6-12 match. The .replit workflows match: react-dev-server :32-42, api-server :44-54, profile-api-server :56-65. OQ 7 is reasonable.
- Pool timing BUG: CORRECT. `let pool` is at database.js:90. `initializePool()` is called fire-and-forget at :153 and assigns `pool` after `await validateDatabaseConfig()` (:98-101). `testConnection` uses `pool` directly (:176), and the catch retries.
- inventory.md:905 "cleaned hourly": confirmed stale. The cleanup runs at start and every 15 minutes (uploadCleanupWorker.js:20-25). The hourly figure is only the max file age (:5).

## Wording of the migration race
UNCLEAR and OQ 6 describe the mechanism accurately and say it is "unconfirmed". Given MIG's code-level confirmation, that wording is now too weak. I opened the code and it shows:
- The IIFE (server.js:5884) is un-awaited and starts at module load.
- `createProjectsAndGroups` is the 22nd tracked call (:5908).
- `startServer` runs the check once at :14074.
- `ready:false` is set once at :14076-14086, and nothing re-checks it.

The code therefore shows that nothing orders the two. What is left to timing is whether the tables exist by the time of the check on a fresh database. Suggested wording: "ordering race confirmed in code; outcome on a fresh DB is timing-dependent". This is a wording issue, not a WRONG claim, so it does not change the verdict.

An extension the notes do not state: on a fresh database the same race could hit `users`, `roles` or `user_roles`. Then `repairBootstrapAdminRoles` or `getPrerequisiteStatus` throws and `process.exit(1)` follows, not just `ready:false`. The notes mention the fatal path separately.

## Other checked claims, all CORRECT
- productionBootstrap.js: ports (:14-16), the child spawns (:33, :49), the 503/200 gating including the `req.url === '/'` exact match (:97), the 502 handler, exit propagation (:59-62), shutdown, readiness polling (:139-151) and the upgrade destroy (:123-127).
- startServer order and its try/catch (server.js:14046-14213), ENCRYPTION_KEY warning only, upload worker with concurrency 5, Socket.IO methods GET/POST, orphan recovery, and the graceful shutdown list (:14219-14269). The shutdown does not close the HTTP server.
- Module-level workers at server.js:45-83. Insights and retention mix local `getHours` with a UTC date. Retention keeps `lastRunDate` in memory only.
- Helmet inside the async IIFE (:435-494) is registered after the 404 handler and `errorHandler`, so it is never effective.
- CORS (:513-555): PATCH is not listed, a rejection is `new Error` (:547) and returns 500 via errorHandler.js:85-101.
- Limiters (:643-698), the status route before the limiter (:703), the 408 timeouts (:612-640), the session secret fallback (:594), and the production `GET /` (:573-589).
- Health routes (:1027-1219), including `/api/health` shadowing the router `GET /`, and the enterprise check where only a DB failure degrades the status.
- `getPrerequisiteStatus` readiness requires only the three tables (repairClean...js:53-55), and the admin role insert SQL.
- environment.js: validation throws in production, defaults, and RATE_LIMIT comment vs value.
- sonar.yml: token at :34, hardcoded `-Dsonar.token=` at :41 (value not copied). prod-deployment.yml: `StrictHostKeyChecking=no` at :23, no test step.
- .replit:88-89 maps port 8000 to 8000. The postMerge hook, redis.js options and fallback, and backend/src/server.js:20/:49 plus routes/index.js:17/:25.
- No `uncaughtException` or `unhandledRejection` handler in any JS file (grep). No ecosystem, Dockerfile or Procfile in the repo root.

## Minor remarks (not counted)
- The migration IIFE has 56 `runOnce` calls, not "about 60": lines :5886-5945 are 60 lines, and 4 of them are comments (:5926-5929). Cosmetic.
- Missed minor bug: concurrent `initializePool()` calls. `poolInitialized` is set only after the awaits (database.js:94, :101-102). A `query()` call made while the require-time init is still pending (`query` calls `initializePool` at :219) builds a second `Pool` and overwrites `pool`, leaking the first. The notes' pool timing BUG does not mention this.
- inventory.md:899 and :901 name `ServiceBase.js` and `cacheService.js`. The notes cover these as DUPLICATE or untraced. This is acceptable.

## Coverage
Every inventory row assigned to PLT maps to a subsection: rows 44, 218, 721, 723, 861, 866, 869-871, 877, 886-888, 899, 901 and 905. The env-var rows are summarised in entry 6. Nothing from the earlier rounds was lost in the rewrite.
