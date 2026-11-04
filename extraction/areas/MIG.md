# MIG: Schema migrations, core (cross-cutting)

## Summary
Schema changes are applied by a fire-and-forget async block at server module load that runs 56 named migrations through `migrationTracker.runOnce` (server.js:5884-5945), then two untracked statements (server.js:5948, :5950). A separate repair step runs inside the startup sequence (server.js:14073). Besides that there are a manual seed script, raw SQL files with no runner, standalone `node <file>` migrations (MIGV area), and a second unused migration system under `backend/src` that appears to be dead. Migration file bodies were not read individually, except createPolicyEngine, ensureFileUploadPermissions and repairCleanPublishDashboardPrerequisites.

## Entry points

### 1. Startup tracked migrations
- Trigger: module load of server.js, an async IIFE (server.js:5884-5956). It is not awaited by the listen sequence (server.js:14061-14066).
- Caller: none (internal).
- Order: 56 `runOnce` calls (counted in server.js), from `createSharedConnectionsTable` (:5886) to `bridgeVendorAdministrationPermissions` (:5945). Names are unique strings.
- Tracker (backend/utils/migrationTracker.js):
  - Creates `schema_migrations(id, migration_name UNIQUE, executed_at, success default true, error_message)` (:21-28).
  - `hasRun` is true only when a row exists with `success = true` (:47).
  - If the check query fails it returns false (:51-54), so the migration re-runs.
  - On success it calls `markExecuted(name, true)` (:97). On failure it records `success=false` with the error message and rethrows (:102-103).
  - Upsert via `ON CONFLICT (migration_name)` (:70).
  - A failed migration is retried on the next restart because only `success=true` counts.
  - If `markExecuted` itself fails, the error is swallowed (:74-76) and the migration will re-run next boot.
- Failure behaviour: the whole IIFE has one try/catch that logs (:5953-5955). The first failure aborts all later migrations, including the untracked ones, and the server keeps running. Nothing exits or marks the app not-ready.
- Argument styles are mixed. Most receive `dbPool`. Others receive nothing (e.g. `addUserProfileAndAuthFields()` :5907, `createVendorUsersTable()` :5914, `addVendorIdToUsers()` :5915, `addConnectionNameUniqueConstraint()` :5916, `migrateVendorConnectionDirection()` :5917, `addSubProjectToVendorAgreements()` :5920, `createVendorAgreementFileSchemas()` :5921, `migrateVendorAgreementSchemasToFileSchemas()` :5922, `addSLAMonitoringToVendorAgreements()` :5931, `bridgeVendorAdministrationPermissions()` :5945). These presumably use the shared config pool.
- Omitted deliberately: `removePhantomSchemaDefaultRules` V1 is not called. Its comment says `LIKE '__schema_default__%'` is unsafe because `_` is a wildcard (:5926-5929). V2 is called under the name `removePhantomSchemaDefaultRulesV2` (:5930).

### 2. Untracked startup statements
- `ensureFileUploadPermissions(dbPool)` runs on every restart (server.js:5946-5948). It is non-fatal (backend/migrations/ensureFileUploadPermissions.js:149-152) and never throws, so a failure inside it does not stop the jira ALTER at server.js:5950.
  - Rules: `file_upload:write` and `file_upload:read` permissions upserted (:22-25, :53-60).
  - Admin, Data Engineer and Creator get write and read (:28, :122-128).
  - Executor, Viewer, User, Analyst and Reviewer get read only (:30, :131-136).
  - Roles that do not exist are skipped silently (:124).
  - If a permission cannot be located, linking aborts with a log line (:112-119).
  - ALTER TABLE permissions adds resource, action and description columns, and errors are ignored (:38-44).
- `ALTER TABLE transformation_jobs ADD COLUMN IF NOT EXISTS jira_issue_key VARCHAR(50)` (server.js:5950). Inline DDL.
- If a tracked migration throws earlier, neither of these runs (see entry 1).

### 3. Bootstrap admin repair and prerequisites check
- Trigger: server start, after `initializeDatabase()` (server.js:14066-14074).
- Code: backend/migrations/repairCleanPublishDashboardPrerequisites.js.
- Rule: for the user with `username = 'admin'`, if that user has no `user_roles` rows at all, it is given roles `['Admin','Vendor Manager','Governance Manager']` (:3, :6-21). It runs in its own client transaction with BEGIN, COMMIT and ROLLBACK (:60-77).
- A failure rethrows (:75). The catch first runs `await client.query('ROLLBACK')` (:71); if the connection itself failed, that ROLLBACK can throw and mask the original error, and the log line at :72-74 is not reached. `repairBootstrapAdminRoles` is awaited without try/catch (server.js:14073); the outer catch (server.js:14196-14211) logs "Failed to start server" and calls `process.exit(1)` (:14211), so a repair failure kills the process. See BUG 5.
- Prerequisite status (:27-57) checks that the function `public.get_user_projects(integer)` and the tables `project_members`, `access_group_members` and `project_access_groups` exist, and whether the `admin` user exists and has `Admin`.
  - `ready` requires only the three tables, not the function (:53-56).
  - A missing function sets `uses_project_access_fallback` (:52).
- If not ready, `app.locals.databasePrerequisites = {ready:false, error, verifiedAt}` and the API stays online (server.js:14076-14084). The check runs once at :14074; see BUG 6. The error text says "Dashboard requests will retry when access is repaired" (server.js:14077), but nothing re-checks (BUG 6).
- The comment says "Schema changes are applied by Publish" (server.js:14069). Startup nevertheless also runs the migrations in entry 1. See UNCLEAR 1 for what "Publish" is.

### 4. seedProduction (`npm run seed:production`)
- Trigger: manual, `package.json:10` -> backend/scripts/seedProduction.js (path per inventory.md:878).
- Creates default roles and permissions and role_permissions (seedProduction.js:326-443). Admin gets all permissions (:183, :400).
- Creates the user `admin`, email `admin@dataobservatory.local`, password `'Admin123!'` (:25-30). It is bcrypt-hashed (:479), skipped if the user exists (:472), and assigned the Admin role (:499-510).
- If the admin user already exists it does ROLLBACK and returns (:471-476), so it never repairs an existing admin's roles.
- It prints a warning to change the password (:536-537, :565-566).
- ensureFileUploadPermissions' header states that prod may never have run this seed (ensureFileUploadPermissions.js:4-6).

### 5. Raw SQL migrations (manual)
- Files: migrations/001_retention_archival_system.sql, 002_archive_processing_extensions.sql, 003_dlq_system.sql, 004_archive_extractions_table.sql, 005_add_auth_tag_to_encrypted_passwords.sql, schema_migration_2026-01-07.sql (directory listing).
- No code runs them. A Grep for the string "migrations" under backend/src found only `src/migrations`. The SQL files were not opened, so their content is not described.

### 6. Standalone `node <file>` migrations
- About 40 files under backend/migrations with `require.main === module` guards, e.g. createVendorManagement.js:224 and createAuditTables.js:288, per inventory.md:880. Their content is covered by MIGV. They read PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE (inventory.md:1047).
- Not reached from the startup block unless the file is also in the list in entry 1.

### 7. backend/src/migrations/index.js (second system)
- `applyMigrations` is called from backend/src/app.js:114 (required at :21). The first migration is `001_initial_schema`.
- It keeps its own `migrations` table (index.js:133, :331, :372), distinct from `schema_migrations`.
- Its `users.id` is `VARCHAR(36)` (index.js:15), and `user_roles.user_id` is also `VARCHAR(36)` (:55). Its `roles` and `permissions` tables have NOT NULL timestamps without defaults (:34-35, :47-48).
- backend/src/app.js is entered only through backend/src/server.js (inventory.md:723, AUTH.md:374), and nothing launches that; it is not reached in production (see DEAD 1).
- The rest of the file (:60-440) was not read.

## Data touched
- `schema_migrations` (tracker; migrationTracker.js:21).
- `migrations` (backend/src, index.js:133).
- `permissions`, `role_permissions`, `roles`, `user_roles`, `users` (entries 2, 3, 4).
- `rbac_policies` and related policy tables (createPolicyEngine.js:27).
- `transformation_jobs.jira_issue_key` (server.js:5950).
- Everything else is defined by the 56 migrations and was not read.

## Flags

### BUG
1. Transactions in the startup migrations do not hold. `createPolicyEngine(dbPool)` is passed a Pool (server.js:5911) but calls `client.query('BEGIN')` (createPolicyEngine.js:21), then COMMIT (:284) and ROLLBACK (:289). The same pattern is in `createABACAttributes` (createABACAttributes.js:17), `createSCIMProvisioning` (createSCIMProvisioning.js:18) and `addProjectIdToResources` (addProjectIdToResources.js:24, passed `dbPool` at server.js:5909). The `dbPool` proxy (backend/di/bootstrapper.js:29-46) forwards to `pool.query`, so BEGIN and COMMIT do not form a transaction: each statement may take a different pooled connection, and a ROLLBACK may not undo anything. Settled; this resolves the GRP.md:247 / MIG dispute. `createProjectsAndGroups.js:17` correctly calls `pool.connect()` first.
2. `hasRun` returns false on a DB error (migrationTracker.js:51-54), and `markExecuted` swallows errors (:74-76). Either failure can make a migration re-run on the next boot even if it succeeded.
3. One failing migration aborts all later ones and the two untracked statements (server.js:5884-5955). The server continues without any readiness signal for this block.
4. `ensureFileUploadPermissions` swallows only the ALTER TABLE errors (:37-44). Insert errors are logged (:62-73) and link errors are counted and logged (:99-105). A permission-lookup failure returns after a log (:112-119). The function never throws (:149-152), so its failure does not stop the jira ALTER at server.js:5950.
5. `repairBootstrapAdminRoles` is awaited with no try/catch (server.js:14073). A failure (for example `users` or `user_roles` missing on a fresh DB, since the IIFE runs concurrently) throws into startServer's outer catch (server.js:14196-14211), which logs "Failed to start server" and calls `process.exit(1)` (:14211). The process dies, unlike the IIFE, which never exits. In the repair's own catch, the `ROLLBACK` (repairCleanPublishDashboardPrerequisites.js:71) can itself throw and replace the original error, and the log at :72-74 is then skipped.
6. Race with the IIFE: it starts at module load (the IIFE at :5884 is not awaited), concurrently with `initializeDatabase()` (server.js:14066). The prerequisite check at :14074 runs once and can run while `createProjectsAndGroups` (:5908) is still creating `project_members`, `access_group_members` and `project_access_groups`. The race is confirmed in code; whether `ready` ends up false depends on timing. `ready` starts as false (server.js:102-105) and is assigned only at :102, :14078 and :14088, so a boot-time `ready:false` stays until the process restarts. The error text says "Dashboard requests will retry when access is repaired" (:14077), but that is false: dashboard.js:65-76 returns 503 until `ready` is true, and `/api/health/ready` (server.js:1180-1188) also returns 503 while `ready` is false, so both the dashboard and the load-balancer readiness probe stay down with no recovery.
7. `createGetUserProjectsFunction.js` is not in the startup list and is not called anywhere (grep found only its own file). `get_user_projects(integer)` is never created at startup, so `uses_project_access_fallback` can stay true permanently.

### DUPLICATE
1. Two migration systems with different bookkeeping tables: `schema_migrations` vs `migrations` (migrationTracker.js:21 vs index.js:133). Their `users` and `user_roles` ID types differ (index.js:15, :55). Compare the integer `user_id` in the repair SQL, which joins `users.id` to `user_roles.user_id` (repairCleanPublishDashboardPrerequisites.js:8-12).
2. Role and permission seeding is in three places: `seedProduction` (:326-443), `ensureFileUploadPermissions` (for file_upload only), and `bridgeVendorAdministrationPermissions` (not read). The admin role links are also repaired at boot (entry 3).
3. Raw SQL files under migrations/ and the JS migrations under backend/migrations are parallel mechanisms with no shared record of what ran.
4. Two V1/V2 phantom-rule removals; V1 is the omitted one (server.js:5926-5930).

### DEAD
1. `backend/src/migrations/index.js` and `applyMigrations`: dead in production. `.replit:9` runs productionBootstrap.js, which spawns server.js (productionBootstrap.js:49). Only backend/src/server.js:6 requires backend/src/app.js, and nothing launches it. The `lineage:write` grant at index.js:143 never runs.
2. Standalone `require.main === module` migrations that are not in the startup list: not enumerated per file. Not verified.

### SECURITY
1. A default admin password is hard-coded: `Admin123!` (seedProduction.js:27), with a Sonar suppression (`NOSONAR S2068`). The username and email are also fixed (:26, :28).
2. The bootstrap repair step targets the literal username `admin` and grants it `Admin`, `Vendor Manager` and `Governance Manager` on every start, if the user has no roles (repairCleanPublishDashboardPrerequisites.js:3, :12). In the prod dump usernames are unique on lower(username) (FileSence_prod_schema_Jan_05_1767956647766.sql:6623), so the risk applies only if the admin row is deleted or loses all its roles; then anyone who can register the exact lowercase username `admin` would receive the three roles at the next boot. The repair SQL matches the literal `bootstrap_admin.username = 'admin'` (repairCleanPublishDashboardPrerequisites.js:12), so a user named `Admin` would not match; the lower() index only prevents both existing at once. Registration controls were not checked.
3. `ensureFileUploadPermissions` re-grants permissions to named roles on every restart (:28, :30), so a manual revocation of file_upload permissions from those roles is undone on each restart.

### UNCLEAR
1. server.js:14069 says schema changes are applied by Publish, yet the IIFE at :5884 still runs on every start. "Publish" refers to an external Replit deploy step. The repo build is vite only (`npm run build`, .replit:10) and productionBootstrap.js runs no migrations, so the startup IIFE is the only in-repo mechanism that changes the prod schema.
2. Whether any other mechanism applies migrations/*.sql or the standalone files.
3. `ready` ignores the missing `get_user_projects` function (:53-56).
4. Schema coverage: the migrations do not explain the prod schema. The base tables (users, roles, permissions) have no creator in the 56-item startup list, and `createProgrammaticUploadTables` is not in that list. The prod schema therefore comes from manual runs or an out-of-repo base schema. This was not checked table by table.

## Domain terms
- Migration, tracked migration (`runOnce`), `schema_migrations` vs `migrations`, "Publish", bootstrap admin (`username = 'admin'`), seed, "prerequisites", "project access fallback", "phantom schema default rules".

## Open questions
1. How is the base schema (users, roles, permissions) created on a fresh DB? (The earlier question on Publish is answered in UNCLEAR 1.)
2. (Answered: see BUG 1.)
3. What do migrations/*.sql contain, and how are they run? Were they applied to prod?
4. (Answered: see DEAD 1.)
5. Do the other 53 tracked migrations have destructive or non-idempotent SQL? They were not read.
6. How `createAllowedEmailDomains` and `bridgeVendorAdministrationPermissions` seed data, and whether `admin` can be created by users.
7. (Answered: a repair failure exits the process, see BUG 5.)
