# ADM - Admin & system maintenance

## Summary
Covers 11 HTTP routes and 2 front-end pages.
- System cleanup: a preview of row counts per category, and a bulk purge of 13 categories.
- App settings: list settings and update one (only `profile_retention_count` exists).
- Profile retention: stats and cleanup. The logic lives in PROF.
- Cache: stats, flush, invalidate by pattern.
- Two unauthenticated debug routes in server.js.

Admin gating is applied at mount time, not inside the route files:
- `/api/admin/cleanup` and `/api/admin` are mounted with `authenticateToken, requireAdmin` (server.js:13871, 13876).
- `requireAdmin` returns 403 `Access denied. Admin privileges required.` when `userHasAdminAccess(req.user)` is false (server.js:5417-5425).
- The cache routes are mounted at server.js:5179 with only JWT authentication and no admin check.

## Entry points

### 1. GET /api/admin/cleanup/counts (adminCleanupRoutes.js:16)
- **Who:** JWT and admin (server.js:13871).
- **Inputs:** none.
- **Behaviour:** runs one `SELECT COUNT(*)` per table, sequentially (about 60 queries). Results are grouped into 13 categories.
- **Category contents:** the categories and their tables are listed in the purge below (entry point 2). `lineage` is `transformation_lineage`.
- **Exclusions:** `projects` counts `WHERE id != 1` (:102). `groups` counts `access_groups WHERE id != 1` (:120).
- **Output:** `{counts:{<category>:{<table>:int}}}`.
- **Errors:** 500 `{error, message}` (:188).
- **Side effects:** none.

### 2. POST /api/admin/cleanup (adminCleanupRoutes.js:199)
- **Who:** JWT and admin.
- **Inputs:**
  - `categories` is an array. It must be non-empty (400 "No categories selected", :212).
  - Every entry must be one of `files, transformations, workflows, governance, audits, projects, connections, groups, vendors, dbt, activity, violations, lineage` (:219). Otherwise 400 "Invalid categories".
  - `confirmationCode` must be exactly `'DELETE ALL DATA'` (:204). Otherwise 400.
- **Transaction:** one client, `BEGIN` (:233), `COMMIT` (:524), `ROLLBACK` on error (:538). Failure returns 500 `{error:'Cleanup failed', message}`.
- **Cross-category dependency deletes** run first, even when the dependent category is not selected:
  - `files` also deletes `user_badges` and `vendor_file_profiling_results` rows that reference files (:241-243).
  - `transformations` also deletes `file_audit_details` rows that reference jobs (:249).
  - `connections` also deletes vendor_file_profiling_results, vendor_agreement documents, changes and approvals, and vendor_agreements that reference storage connections (:255-260).
  - `vendors` also deletes `transformation_mappings` that reference vendor agreements (:266).
  - `projects` deletes everything that hangs off projects other than id 1 (:272-325): files and children, transformation jobs, mappings, workflows, schedules, bulk profiling jobs, business_processes, logical_file_groups, connections, vendor agreements and vendors, access_group_roles, project_access_groups and rbac_policies. It also sets `users.vendor_id = NULL` for the affected vendors (:319).
- **Main deletions** (:331-522) run per selected category.
  - `files`: file_preview_data, file_columns, file_schemas, files.
  - `transformations`: anomalies, profiling_metrics, transformation_logs, transformation_jobs, transformation_mappings.
  - `workflows`: schedules, n_step runs, steps and workflows, workflow_steps, mapping_group executions, members and groups.
  - `governance`: all rows in the five governance tables.
  - `audits`: file_pattern_metrics, alert_history, file_audit_details, execution_audit, security_audit_log.
  - `projects`: all `project_members` rows, and projects with `id != 1` (:423-424).
  - `connections`: all transform_connections and storage_connections.
  - `groups`: `access_group_roles WHERE group_id != 1`, `access_group_members WHERE group_id != 1`, `access_groups WHERE id != 1` (:445-447).
  - `vendors`: the whole vendor tree, and `UPDATE users SET vendor_id=NULL WHERE vendor_id IS NOT NULL` (:466).
  - `dbt`: dbt_executions, dbt_models.
  - `activity`: notifications, user_sessions, user_badges, user_dashboard_settings.
  - `violations`: quality_rule_violations.
  - `lineage`: transformation_lineage.
- **Audit:** after commit, `AuditService.logSystemCleanup(req.user.id, req.user.username, categories, deletedCounts)` (:527-529, defined AuditService.js:541). If this call throws after COMMIT, the catch block runs `ROLLBACK` on an already committed transaction and returns 500 although the data is deleted.
- **Output:** `{success:true, message, deletedCounts}`.
- **Preserved:** `users`, roles and permissions (header comment, :4-5), Default Project (id 1) and Default Group (id 1).
- **Front end:** src/pages/SystemCleanup.jsx checks the same code client-side (:147). It calls GET counts (:90) and POST (:156).

### 3. GET /api/admin/settings (adminSettingsRoutes.js:15)
- **Who:** JWT and admin.
- **Behaviour:** `getAllSettings` runs `SELECT setting_key, setting_value, description FROM app_settings ORDER BY setting_key` (appSettingsService.js:33).
- **Output:** `{settings:[...]}`. Errors give 500.

### 4. PUT /api/admin/settings/:key (adminSettingsRoutes.js:33)
- **Who:** JWT and admin.
- **Inputs:**
  - `key` must be `profile_retention_count`. Otherwise 400 (:39).
  - `value` is parsed with `parseInt(value,10)`. It must not be NaN and must be between 1 and 100 inclusive (:50). Otherwise 400.
- **Behaviour:** `updateSetting` runs `UPDATE app_settings SET setting_value=$1, updated_at=CURRENT_TIMESTAMP WHERE setting_key=$2 RETURNING *` (appSettingsService.js:49). If no row is found it throws "Setting not found", which the route turns into 500, not 404.
- **Output:** `{success:true, setting}`.
- **Note:** the raw `value` is stored, not the parsed number. Input such as "5abc" or "5.7" passes validation and is stored as sent.

### 5. GET /api/admin/profile-stats (adminSettingsRoutes.js:76)
- **Who:** JWT and admin.
- **Behaviour:** calls `getProfileStats` (profileRetentionService, PROF). It returns `{stats}` when `result.success`, otherwise 500.

### 6. POST /api/admin/cleanup-profiles (adminSettingsRoutes.js:101)
- **Who:** JWT and admin.
- **Inputs:** body `retentionCount`, with no route-level validation. It is passed to `cleanupOldProfiles(pool, retentionCount)`.
- **Default:** if `retentionCount === null` the setting is used (profileRetentionService.js:17). If the field is omitted it is `undefined`, which is not `=== null`. Then `undefined` is bound as the query parameter (:48). The `=== null` check and the default parameter `= null` (:14) only substitute for an omitted argument, so the route's destructured `undefined` takes the default `null` and the setting is used. UNCLEAR whether the client can send a value below 1 (see Flags).
- **Output:** `{success, message, deletedCount, deletedByMapping}`. Failure gives 500.
- **Front end:** SystemSettings.jsx calls this after a confirm dialog (:107-120).

### 7. GET /api/cache/stats (cacheRoutes.js:21)
- **Who:** JWT only (`authenticateToken`, :21), no role check.
- **Output:** `{success, cache, timestamp}`. For the memory cache: `{type:'memory', keys, hits, misses, hitRate}` (cacheService.js:233-239). For Redis: `{type:'redis', keys, info}`.
- **Errors:** 500.

### 8. DELETE /api/cache/flush (cacheRoutes.js:44)
- **Who:** JWT only, so any authenticated user.
- **Behaviour:** `cacheService.flush()` runs `redisClient.flushDb()` or `memoryCache.flushAll()` (cacheService.js:257-259). With Redis this flushes the whole Redis DB, not only keys this app wrote.
- **Errors:** `flush()` swallows its own errors (:262), so the route returns success even when the flush fails.
- **Output:** `{success:true, message}`.

### 9. DELETE /api/cache/invalidate/:pattern (cacheRoutes.js:68)
- **Who:** JWT only.
- **Behaviour:** `delPattern(pattern)`.
  - Redis: `KEYS pattern`, then `DEL` (cacheService.js:162-165). `KEYS` blocks the server.
  - Memory: `globToRegex(pattern)` from utils/regexValidator (:170-172).
- **Errors:** errors are swallowed inside the service, so the route always reports success.
- **Output:** the message echoes the user-supplied pattern.

### 10. GET /api/debug/recover-orphans (server.js:11754)
- **Who:** none. There is no auth middleware on this route.
- **Behaviour:**
  1. Builds `queueStats` from `fileWorker.queue` internals.
  2. Selects up to 5 `files` rows with `processing_step='queued'`, `created_at < NOW() - 2 minutes` and `created_at > NOW() - 24 hours` (:11767-11774).
  3. Calls `fileWorker.recoverOrphanedJobs()` (:11776).
  4. Re-reads those files.
- **Output:** `{success, message, queueStats, orphanedFilesBefore, filesAfterRecovery}`.
- **Error:** 500 `{error, stack}` (:11793).

### 11. GET /api/debug/hash-password/:password (server.js:11798)
- **Who:** none. The comment says "REMOVE IN PRODUCTION" (:11797).
- **Behaviour:** `bcrypt.genSalt(10)` and `bcrypt.hash`.
- **Output:** `{hashedPassword}`. The plaintext password is carried in the URL path.

### 12. FE /system-cleanup (src/pages/SystemCleanup.jsx; route at src/App.jsx:449)
- Calls entry points 1 and 2. The user must type `DELETE ALL DATA` (:147, :417).
- The role gating of this route in the front end was not examined.

### 13. FE SystemSettings (src/components/SystemSettings.jsx)
- Calls entry points 3, 4, 5 and 6.
- Defaults retention to 10 (:12) and checks 1 to 100 client-side (:69).
- Sends `value: retentionCount.toString()` (:85).

## Data touched
- `app_settings` (setting_key, setting_value, description, updated_at): read and written.
- About 60 tables are counted or deleted by cleanup; see entry points 1 and 2.
- `users.vendor_id` is set to NULL.
- `files` is read by the debug route.
- Audit: `AuditService.logSystemCleanup` (the table it writes was not traced).
- Cache backend: Redis if `REDIS_URL` is set, otherwise NodeCache with `stdTTL: 300` and `checkperiod: 120` (cacheService.js:25, 75-79). The Redis reconnect strategy gives up after 3 retries (:53).

## Flags
- **SECURITY-1:** `/api/debug/recover-orphans` is unauthenticated, triggers recovery, and returns `error.stack` (server.js:11754, 11793).
- **SECURITY-2:** `/api/debug/hash-password/:password` is unauthenticated and puts the password in the URL, so it ends up in logs (server.js:11798).
- **SECURITY-3:** cache flush, invalidate and stats need only a valid JWT, with no admin check (cacheRoutes.js:21, 44, 68). Any user can flush the global cache, including the whole Redis DB.
- **SECURITY-4:** the cache `:pattern` is passed to Redis `KEYS` with no validation (cacheService.js:162).
- **SECURITY-5:** the cleanup endpoint is a destructive bulk delete. Its only guard is a fixed string that is also in the front-end source (adminCleanupRoutes.js:204). It does not re-check the password or MFA.
- **SECURITY-6:** the `requireAdmin` log message says "Unauthorized audit access attempt" for every admin route (server.js:5419).
- **BUG-1:** the audit log call runs after COMMIT inside the same try block. If it fails, `ROLLBACK` runs on a closed transaction and the response is 500 although the data is deleted (adminCleanupRoutes.js:524-538).
- **BUG-2:** the `groups` category deletes `access_group_roles WHERE group_id != 1`, but the `projects` category deletes `access_group_roles` by `project_id` (:323). The two definitions of the roles scope differ.
- **BUG-3:** the `counts` figure for `access_group_roles` has no `!= 1` filter (:122), but the purge has one (:445). The preview over-counts what will be deleted.
- **BUG-4:** the `projects` purge deletes ALL `project_members` rows, including those of the Default Project (:423). The preview counts all rows too, so they agree.
- **BUG-5:** cache `flush`, `delPattern` and `delPattern` errors are swallowed in the service, so the API reports success on failure (cacheService.js:181, 262).
- **BUG-6:** PUT settings stores the raw `value`, not the validated integer (adminSettingsRoutes.js:59). "5abc" or "5.7" passes validation.
- **BUG-7:** `/api/admin/cleanup-profiles` has no range validation on `retentionCount`, unlike settings (adminSettingsRoutes.js:103-106). A client can send 0 or a negative value.
- **BUG-8:** `hitRate` for the memory cache is `hits / (hits + misses) || 0` (cacheService.js:238). That works, but `cacheService.get()` returns `|| null`, so falsy cached values such as 0 or "" read as misses (:101).
- **DUPLICATE-1:** orphan recovery has its own candidate window, 2 min to 24 h (server.js:11767-11774), different from the worker's own recovery (PROC).
- **DUPLICATE-2:** the profile retention logic is in PROF but the routes are in ADM.
- **DUPLICATE-3:** project, group and vendor deletion exist both here and in the project, group and vendor areas. Their cascade rules were not compared.
- **DEAD:** none of src/ calls `/api/cache/*` (grep of src for `api/cache` found no match). The three cache routes are unused by the front end.
- **UNCLEAR-1:** categories `files` and `audits` both delete `file_audit_details`, and `files` and `projects` both delete the file tables. Overlap is intended or not is not stated.
- **UNCLEAR-2:** `cleanup-profiles` default behaviour when `retentionCount` is omitted (see entry point 6).

## Domain terms
- Cleanup category: one of the 13 group names above.
- Default Project and Default Group: both have id 1 and are protected from deletion.
- Confirmation code: the string `DELETE ALL DATA`.
- Profile retention count: `profile_retention_count`, the number of profiles kept per mapping. The service falls back to 10 when the setting is missing or on error (appSettingsService.js:73-76).
- Profile, profiling metrics and profiling results: related terms used across tables.
- Orphaned job or file: a file stuck in `processing_step='queued'`.
- "Insights": the label in a code comment for `file_pattern_metrics` (adminCleanupRoutes.js:89).

## Open questions
1. What does `userHasAdminAccess` consider admin? It was not traced here (server.js:5418).
2. Which table does `AuditService.logSystemCleanup` write to, and does it persist after the `audits` category purge deletes the audit tables?
3. Where is `/system-cleanup` role-gated in the front end (App.jsx:449)? It was not read.
4. What does `cleanupOldProfiles` do with 0, negative or non-numeric `retentionCount`? It was only partly read (profileRetentionService.js:14-48).
5. Are the tables counted and deleted here all present in the schema? Not verified. A missing table would fail the whole transaction.
6. Is anything other than the cache routes the intended user of the cache `stats`, `flush` and `invalidate` routes? No caller was found in src/.
7. Is the intent of `users` being preserved to include `users.vendor_id` cleanup only? That is what the code does, and the product reason is not stated.
