# MIG verification (final, after fix round 2)

Verdict: PASS

Counts: 42 checked, 0 WRONG, 0 UNSUPPORTED, 0 missed (2 cosmetic nits below). Coverage: entries 1-7 present. The full-file rewrite lost nothing against the round-2 report. No credential value is quoted here.

## Round-2 changes, re-verified
- SECURITY 2: repairCleanPublishDashboardPrerequisites.js:12 is `bootstrap_admin.username = 'admin'`, an exact match. CORRECT.
- runOnce count: server.js:5886-5945 is 60 lines, minus 4 comment lines (:5926-5929) = 56 runOnce calls. The derived 53 (56 minus the 3 read) and "56-item" are CORRECT. My earlier "60" was wrong.
- BUG 6 and entry 3 (dashboard.js:65-76, which I read in full). The router.use middleware calls next() only if `prerequisites?.ready` is truthy. Otherwise it returns 503 `{error: 'Dashboard is initializing...', retryable: true}`. CORRECT.
  - `ready:false` is the initial value at server.js:102-105. A grep of databasePrerequisites shows assignments only at :102, :14078 and :14088, so nothing re-checks. CORRECT.
  - `/api/health/ready` (server.js:1180-1188) returns 503 while `ready` is false. CORRECT.
  - The error text at :14077 says "Dashboard requests will retry when access is repaired". The claim that this is false is CORRECT.
  - The notes say the outcome is timing-dependent. That is fair: the check at :14074 runs after `initializeDatabase()` while the IIFE runs concurrently.
- BUG 5: `await repairBootstrapAdminRoles(dbPool)` at :14073 has no try/catch. The outer catch at :14196-14211 ends in `process.exit(1)` at :14211. CORRECT, and open question 7 is closed correctly.
- The ROLLBACK at repair.js:71 sits before the log at :72-74 and the rethrow at :75, so it can mask the original error. CORRECT.
- Path backend/di/bootstrapper.js:29-46. The proxy exposes `query` and `connect`, both of which go through `database.initializePool()`. CORRECT. `dbPool` is `diContainer.get('dbPool')` (server.js:113).

## Other claims checked and CORRECT
- Tracker (migrationTracker.js): table DDL :21-28, hasRun :47 and :51-54, ON CONFLICT :70, markExecuted swallow :74-76, success :97, failure :102-103.
- IIFE :5884-5956. Untracked statements at :5948 and :5950. Catch at :5953-5955. V1 omitted comment :5926-5930. The no-argument calls (:5907, :5914-5917, :5920-5922, :5931, :5945) are correct.
- BUG 1: BEGIN, COMMIT and ROLLBACK lines match for createPolicyEngine (:21, :284, :289), createABACAttributes (:17, :176, :181), createSCIMProvisioning (:18, :170, :175) and addProjectIdToResources (:24, :284, :289). createProjectsAndGroups.js:17 uses `pool.connect()`.
- ensureFileUploadPermissions: role lists :28 and :30, ALTER swallowed :44, aborts :113-118, per-role skip, top-level catch :149.
- Repair: roles list :3, SQL :6-21, prerequisite SQL :27-57, ready :53-56, fallback :52, transaction :60-77. Note that `dbPool.connect()` is used there, so that transaction is real.
- seedProduction: package.json:10 `seed:production`. NOSONAR at :27, ROLLBACK at :474, bcrypt at :479, warnings at :536-537 and :565-566.
- backend/src: app.js:21 and :114 call `applyMigrations`. index.js has a `migrations` table at :133 and NOT NULL timestamps without defaults. `lineage:write` is at :143.
- Build is `vite build` (package.json:7).

## Cosmetic nits (no change required)
1. Entry 7 and DUPLICATE 1 cite `users.id VARCHAR(36)` at index.js:15. The column is at :16 (:15 is the CREATE TABLE line).
2. `hasRun` calls `this.initialize()` outside its try/catch (migrationTracker.js:43). If creating schema_migrations fails, it throws and aborts the IIFE. The notes say only that a failed check query returns false. This is a minor omission and is already covered by the one-failure-aborts-all behaviour in BUG 3.
