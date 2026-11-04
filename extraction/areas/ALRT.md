# ALRT - Alert policies & delivery

Schema reference used: `attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql` (prod snapshot, "PROD" below) at :4057-4201. The migration `backend/migrations/createEmailAlertingSystem.js` (MIG) defines a different schema for the same table names (see Flags).

## Summary
Two groups of code:
1. CRUD and read APIs for alert policies, recipients and run history (`backend/routes/alertPolicyRoutes.js`, `alertHistoryRoutes.js`, mounted with `authenticateToken` at server.js:13925-13926, :13945-13946), plus two legacy endpoints in server.js (/api/alerts, /api/alerts/history).
2. Delivery code: event-driven `AlertAggregationWorker` (+ `AlertAggregator`, Redis with DB fallback) and `NotificationService` (provider chain, retries, circuit breaker); and a separate direct path for jobs, `JobNotificationService.fireJobNotification`.
The delivery code reads and writes columns that do not exist in the PROD schema (see BUG flags), so much of it cannot work against PROD as snapshotted. The aggregation worker is never started.

Schema status (settled against PROD): PROD `alert_policies` uses `entity_type`, `enabled`, `trigger_events`, `consolidate_alerts` (PROD:4141-4158). `createEmailAlertingSystem.js` (scope / is_active / trigger_type) is not what PROD has. `addVendorSLAToAlertScope.js` (entity_type, enabled, :35) matches PROD. The worker's `enabled` matches PROD; `alertPolicyRoutes.js` create/update writing `is_active` fails on PROD; `createAlertRun` and `JobNotificationService` (trigger_type, provider_connection_id) match neither.

PROD `storage_connections` primary key is `connection_id varchar(255)` (PROD:6109, `CONSTRAINT storage_connections_pkey PRIMARY KEY (connection_id)` PROD:6128). It has no `id`, no `provider_type`, no `is_active`; it has `type` (PROD:6110) and `status` (PROD:6113). Column list PROD:6108-6125. FKs from alerts point at `storage_connections(connection_id)` (PROD:7322, :7334).

The PROD dump contains no `etl_jobs`, `workflows` or `workflow_schedules` tables (grep of the dump finds no occurrence of any of the three names); `mapping_groups` exists (PROD:5411).

## Entry points

### 1. GET /api/alert-policies/ (alertPolicyRoutes.js:14)
- Caller: any authenticated user (authenticateToken at server.js:13926); no permission check.
- Input: none. Scope: `userHasAdminAccess(req.user)` sees all; others get policies where `project_id = ANY(user's projects)` (:18-47); no projects -> `{success:true, policies:[]}` (:25-30).
- Output: `{success, policies}` rows `ap.*` + `project_name`, `recipient_count`, `alert_run_count` (:34-38), ordered `created_at DESC`. 500 `Failed to fetch alert policies`.
- Note: counts joined on two one-to-many tables with COUNT(DISTINCT) (:37-38).

### 2. GET /api/alert-policies/:id (:68)
- Auth: `authorizeProjectResource({resourceType:'alert_policy', requiredPermissions:['alert_policy:read']})`. Project looked up from `alert_policies` (requireProjectAccess.js:278-279); project roles allowed default `Owner, Admin, Member, Viewer` (authorizeProjectResource.js:43); admin bypass default true (:44); then global permission strings must include `alert_policy:read` unless admin bypass (:85-121).
- Admin bypass uses `userHasAllProjectAccess` (requireProjectAccess.js:66), which includes `all_projects:read`; a user holding only `all_projects:read` bypasses project membership and the permission-string check (authorizeProjectResource.js:90 "Admin bypass was already handled in Layer 1"), so can create, update and delete policies without holding `alert_policy:*`.
- Output: `{success, policy}` with `project_name` and `policy.recipients` (joined `users.email`, `full_name`) (:77-111). 404 `Alert policy not found`.

### 3. POST /api/alert-policies/ (:125)
- Auth: `alert_policy:create`; project taken from `req.body.project_id` (requireProjectAccess.js:189-191).
- Body: name, description, project_id, entity_type, entity_id, trigger_events, consolidate_alerts, consolidation_window_minutes, email_connection_id, is_active.
- Validation (400): name required; project_id required; entity_type required (message lists job, workflow, mapping_group, schedule - omits vendor_sla); trigger_events must be a non-empty array (:146-172). entity_type values, entity_id and event names are not validated in code (DB CHECK permits job, mapping_group, workflow, schedule, vendor_sla, PROD:4156).
- Defaults: description/entity_id/email_connection_id -> null; `consolidate_alerts !== false` (true); `consolidation_window_minutes || 60`; `is_active !== false`; created_by = req.user.id (:192-201).
- Side effect: INSERT into alert_policies with `trigger_events` as JSON string, and an `is_active` column (:175-189) (see BUG 1). Log only.
- Output 201 `{success, policy}`; 500 `Failed to create alert policy`.

### 4. PUT /api/alert-policies/:id (:224)
- Auth: `alert_policy:update`. Dynamic SET of provided fields only: name, description, entity_type, entity_id, trigger_events (JSON string), consolidate_alerts, consolidation_window_minutes, email_connection_id, is_active; sets `updated_at = CURRENT_TIMESTAMP` (:248-309). project_id cannot be changed.
- Errors: 400 `No fields to update` (:302); 404 if no row (:319); 500.
- No validation of values (an empty trigger_events or null name is accepted here, unlike create).

### 5. DELETE /api/alert-policies/:id (:348)
- Auth: `alert_policy:delete`. Hard delete, `RETURNING *` returned as `deleted` (:357-376). 404 if none.
- Child rows: PROD has ON DELETE CASCADE from `alert_policy_recipients.policy_id` (PROD:7328), `alert_runs.policy_id` (PROD:7335) and `alert_aggregation.policy_id` (PROD:7299) to `alert_policies`, and from `alert_runs` to `alert_events` (PROD:7309) and `alert_attachments` (PROD:7304). Deleting a policy therefore removes its recipients, runs, events, attachments and queued aggregation rows. Policies themselves cascade from `projects` (PROD:7323).
- Non-numeric `:id` (e.g. `abc`), on every `/:id` route (entries 2, 4-9): the project lookup query errors, the error is swallowed (requireProjectAccess.js:214-219), project is null, and the response is 400 `Project context required`, not 404.

### 6. POST /api/alert-policies/:id/recipients (:391)
- Auth: `alert_policy:update`. Body `user_id` or `email` (one required, else 400, :402). `delivery_method || 'email'` (:436).
- Duplicate check by (policy_id, user_id) if user_id given, else (policy_id, email); duplicate -> 409 `Recipient already exists for this policy` (:410-422). Not atomic (no unique constraint in PROD DDL).
- No email format validation in code. PROD has FK `alert_policy_recipients.user_id -> users(id)` (PROD:7329) and `CHECK check_recipient (user_id IS NOT NULL OR email IS NOT NULL)` (PROD:4178), so a non-existent `user_id` makes the INSERT fail and the route returns 500 (caught).
- Output 201 `{success, recipient}`.

### 7. GET /api/alert-policies/:id/recipients (:462)
- Auth: `alert_policy:read`. Returns recipients with `user_email`, `user_name`, ordered `created_at ASC`.

### 8. DELETE /api/alert-policies/:id/recipients/:recipientId (:499)
- Auth: `alert_policy:update`. Deletes where `id = recipientId AND policy_id = id`; 404 `Recipient not found`.

### 9. GET /api/alert-policies/:id/runs (:544)
- Auth: `alert_policy:read`. Query `limit` default 50, `offset` default 0, passed through `parseInt` with no cap or validation (:552, :564). Returns runs with `event_count` (join alert_events on `ae.run_id`), `created_at DESC`.

### 10. GET /api/alert-history/runs (alertHistoryRoutes.js:13)
- Auth: JWT only (mount adds authenticateToken, server.js:13946); no permission strings. Non-admins restricted to own projects (:21-42); empty -> `{runs:[], total:0}`.
- Filters: `policy_id` (parseInt), `status`, `entity_type` (EXISTS on alert_events), `start_date`, `end_date` on `ar.created_at` (>= / <=, raw strings) (:44-75). limit default 50, offset 0, uncapped.
- Output `{success, runs, total, limit, offset}`; each run has policy_name, project, `email_connection_name` (joined `storage_connections.connection_id = ar.email_connection_id`), `event_count`, `events_summary` (json_agg of entity_type/entity_id/event_type/status) (:90-113).

### 11. GET /api/alert-history/runs/:run_id/events (:136)
- Auth: JWT; non-admin must have the run's policy project in their projects else 403 `Access denied to this alert run` (:157-170); 404 if run missing. limit default 100, offset 0. Events `ORDER BY occurred_at DESC`.

### 12. GET /api/alert-history/runs/:run_id/delivery-details (:199)
- Same access rule as 11 (:227-240). Returns `{run (with policy_name, project, email_connection_name, provider_type), recipients (of the run's policy), attachments}`. Recipients query selects `apr.recipient_type` (:245) and attachments `WHERE run_id` (:259-260).
- Note: recipients are the policy's current recipients, not who the run was actually sent to.
- On PROD this endpoint fails: it selects `sc.provider_type` (alertHistoryRoutes.js:210) and `apr.recipient_type` (:245); PROD `storage_connections` has no `provider_type` (columns PROD:6109-6125) and `alert_policy_recipients` has no `recipient_type` (PROD:4170-4179). The UI (AlertHistory.jsx) therefore gets a 500 here.

### 13. GET /api/alerts/history (server.js:5123)
- Auth: authenticateToken; project-scoped via file's project (`f.project_id = ANY($1)`), admin uses `userHasAllProjectAccess` (a different helper than the `userHasAdminAccess` used elsewhere in ALRT) (:5126-5154). Empty -> `[]`.
- Side effect: runs `CREATE TABLE IF NOT EXISTS alert_history (... alert_type, alert_severity, alert_message ...)` on every call (:5137-5146); PROD table has different columns (file_id, rule_id, triggered_at, alert_details, PROD:4125) and the query orders by `ah.triggered_at` (:5155), which exists only in PROD, not in the table this handler would create.
- Output: raw rows `ah.*`, `filename`, `project_name`. No INSERT into `alert_history` exists anywhere; the only references are DELETE (server.js:2095, :2215, :3342, adminCleanupRoutes.js:407) and a read (adminCleanupRoutes.js:88). The `CREATE TABLE IF NOT EXISTS` (server.js:5137) is a no-op on PROD, where the table exists (PROD:4125).

### 14. GET /api/alerts (server.js:10182)
- Auth: authenticateToken + `userHasAdminAccess` else 403 `Only users with admin privileges can view alert rules` (:10185-10191). This uses the server.js:380 copy of `userHasAdminAccess` (Admin role OR users:write / roles:write); the alert routes use the permissionHelpers.js:80 copy, which also accepts project_management:write (see DUPLICATE 2).
- Reads `alert_rules`. If empty, a GET inserts two defaults (side effect on read, :10196-10221): "Missing Values Alert" (greater_than, '10', data_quality, warning, enabled) and "File Size Alert" (percentage_change, '20', file_metadata, critical, enabled). Returns raw rows. Race: concurrent first calls can insert duplicates.
- Nothing evaluates alert_rules: the only references are this read and seed (server.js:10193-10223).

### 15. FE route /alerts-config (src/App.jsx:450, src/pages/AlertsConfig.jsx) and /alert-history (App.jsx:451, src/pages/AlertHistory.jsx)
- AlertsConfig uses form field `enabled` (AlertsConfig.jsx:28, :189, :304, :468), which matches the PROD column `enabled` (PROD:4152), and `../api/alertService`. The routes read/write `is_active` (BUG 1, BUG 2), so on PROD the form cannot be saved (POST INSERT names `is_active`, alertPolicyRoutes.js:186) and `enabled` sent on PUT is ignored.
- `src/api/alertService.js` wraps all policy, recipient and email-connection APIs. `getAlertHistory` calls `/api/alert-policies/history` (alertService.js:182-184); this matches `/:id` with id `history`, the lookup errors, and the response is 400 `Project context required` (broken client call). `getFileAlerts` calls `/api/files/:id/alerts`; no matching route found in server.js or routes (grep).
- AlertHistory.jsx calls only `/api/alert-history/runs`, `/delivery-details` and `/events`; delivery-details fails on PROD (entry 12).

### 16. Delivery: AlertAggregationWorker event hooks (backend/services/AlertAggregationWorker.js)
Triggered (not HTTP) by: `onJobCompleted(jobId, status)` from jobExecutionEngine.js:2308, :2467; `onWorkflowCompleted(workflowId, executionId, status)` from workflowOrchestrationEngine.js:276, :350, :405; `onMappingGroupCompleted` from mappingGroupExecutionEngine.js:186, :241; `onScheduleExecuted` from cronSchedulerService.js:481, :514 (status 'completed' or 'failed').
Rules:
- Matching policies: `enabled = true AND entity_type = $1 AND (entity_id = $2 OR entity_id = '*')` (:284-292). Policies with `entity_id IS NULL` (what the API stores when entity_id omitted, routes:195) do not match.
- trigger_events on the policy is never read by the worker; every status (completed/failed) is queued.
- Each event is queued via `AlertAggregator.addEvent` (requires policyId, eventType, entityId, entityType; status default 'unknown').
- If `policy.consolidate_alerts === false`: flush immediately and send (:142-145, :196-199, :229-232, :262-265).
- Workflow only: if status === 'completed' and the policy has queued events, flush and send (:149-162). Failed workflows are not flushed here; they wait for TTL. (With consolidate_alerts false and status completed, the immediate flush already emptied the queue.)
- Flush on TTL: `processExpiredAggregations` every `FLUSH_INTERVAL_MS = 60 * 1000` (:24), but `start()` is never called (see DEAD).
- `sendConsolidatedAlert`: no events -> return; recipients from `alert_policy_recipients.recipient_email, recipient_name` (:323-326); none -> warn and return (silently drops flushed events); 1 event -> single-entity template via EmailComposer (entity loaded from etl_jobs / workflows / mapping_groups / workflow_schedules, :512-553; etl_jobs, workflows and workflow_schedules do not exist in the PROD dump, so composition would throw there even if sending worked); more -> consolidated template; then `notificationService.sendAlert({...})` (:356).
- All errors are caught and logged; callers never see them.
- The worker is never started: non-test code only requires it and calls its `on*` hooks (cronSchedulerService, workflowOrchestrationEngine, mappingGroupExecutionEngine, jobExecutionEngine). The tests require `../workers/AlertAggregationWorker`, a path that does not exist (backend/workers has no such file).

### 17. Delivery: AlertAggregator (backend/services/AlertAggregator.js)
- Redis (`REDIS_URL` or `redis://localhost:6379`, :44) list per policy `alert_aggregation:<policyId>`; TTL set when absent: `DEFAULT_TTL_SECONDS = 1800` (:29, :163-166). Fallback to DB table `alert_aggregation` when Redis is down. `redisAvailable` starts `false` (:21) and becomes true only on 'connect'/'ready' (:68, :74), so events arriving before connect go to the DB path. The retry strategy returns `null` after 10 attempts (:49-54, `return null; // Stop retrying`), which stops reconnection; no later connect event occurs, so availability does not recover after that point.
- DB row expiry `NOW() + INTERVAL '1800 seconds'` (:187).
- Expired flush: Redis keys with `0 < ttl < 60` (:380); DB policies with `expires_at <= NOW() + 60 seconds` (:404). So a queue is flushed once it is about 29-30 minutes old, regardless of the policy's `consolidation_window_minutes` (never used; `DEFAULT_CONSOLIDATION_WINDOW_SECONDS = 300` at :26 is also never used).
- Uses `redis.keys(pattern)` (:374), a blocking full scan.
- Dedupe in `flushExpiredAggregations`: Redis keys yield a string policyId, DB rows a number, so `flushedPolicies.has(row.policy_id)` (:411) never matches across the two sources; a policy can be flushed twice (the second flush finds nothing).
- Flush clears both Redis and DB; events are removed before sending, so a send failure loses them.
- `getAggregationStatus` (:449) is called by the worker (AlertAggregationWorker.js:150).

### 18. Delivery: NotificationService (backend/services/NotificationService.js)
- `sendAlert(policyId, emailData)` (:516) -> `sendEmail` -> `createAlertRun`.
- Provider chain: `alert_policies.provider_connection_id` then `failover_connection_id` (:75-95); throws if none. `getEmailProvider` queries `WHERE id = $1 AND is_active = true` (:36-38); PROD `storage_connections` has neither `id` nor `is_active` (PROD:6109-6125, PK `connection_id`), so this lookup fails on PROD.
- Per provider: circuit breaker check, rate limit `checkRateLimit(id, maxPerHour = 100)` (:122), up to `maxRetries = 2` retries (3 attempts), backoff `min(1000 * 2^retry, 10000)` ms (:421). Delay only applied on thrown errors, not on `result.success === false`.
- Circuit breaker: in-memory `Map` per process (:25), lost on restart. Opens at 3 failures (:190); cooldown `5 * 60 * 1000` ms (:163), after which it goes half-open and decrements failures by 1 (:166-171); a success also decrements failures and closes at 0 (:210-212). The rate-limit counter is also in-memory. Domain-validation rejections (:260-276) return `success:false` without throwing and are retried 3 times with no delay.
- On success returns provider info; if all fail returns `success:false, error 'All email providers failed for policy <id>'`.
- `createAlertRun` inserts alert_runs with columns policy_id, provider_connection_id, status ('sent'/'failed'), message_id, recipients, subject, error_message, sent_at (always `new Date()`, even on failure), metadata (:469-497).

### 19. Delivery: JobNotificationService.fireJobNotification (backend/services/JobNotificationService.js:196)
- Called from jobExecutionEngine.js:2211, :2346, :5874 at terminal job statuses (completed, completed_with_warnings, failed, cancelled). Skips everything if no userId (:205).
- Step 1: INSERT into `notifications` (in-app) for the triggering user, type `job_run_<status>`, action_url '/jobs' (:216-230).
- Step 2: policies `enabled = true AND entity_type = 'job' AND (entity_id = jobId OR '*' OR NULL) AND email_connection_id IS NOT NULL AND sc.status = 'active'` joined `storage_connections sc ON sc.id = ap.email_connection_id` (:241-256). PROD `storage_connections` has no `id` (PK is `connection_id`, PROD:6109, :6128), and `email_connection_id` is varchar(255) (PROD:4151), so this join fails on PROD and the job email path cannot work there.
- Status match (`policyMatchesStatus`, :134-142): success = completed | completed_with_warnings; failure = failed | cancelled; trigger_type 'both' = all; unknown trigger_type = true.
- Recipients filtered by `notify_on_success` / `notify_on_failure` and `recipient_email` (:261-275). Email subject `<icon> Job <Label>: <name>`; HTML includes errorMessage truncated to 200 chars; up to 5 violated rules in HTML, 3 in text. No alert_runs row is written on this path.
- Sends directly via `_notificationService.sendWithProvider` (:167) with no retries, no failover, no rate limit; failure only logged. The return value is not examined (`result.success` is never read in this file), so a domain-validation rejection (NotificationService.js:260-276, `success:false` without throwing) is logged as sent. Domain validation therefore applies on this path.

## Data touched
- alert_policies (R/W), alert_policy_recipients (R/W), alert_runs (R; W by NotificationService), alert_events (R; only writer slaMonitorService.js:304, which omits the NOT NULL `run_id` (PROD:4104) so the INSERT fails), alert_attachments (R; no writer anywhere), alert_aggregation (R/W fallback queue), alert_history (R + CREATE IF NOT EXISTS; no INSERT anywhere), alert_rules (R, seeded on read; nothing evaluates it), notifications (W), storage_connections (R), users, projects, files, etl_jobs, workflows, mapping_groups, workflow_schedules (R; etl_jobs, workflows, workflow_schedules absent in PROD dump). Redis keys `alert_aggregation:<policyId>`.
- dashboard.js reads alert_events / alert_runs / alert_policies for "critical alerts" counts filtering `ae.status IN ('OPEN', 'ACTIVE', 'TRIGGERED')` (dashboard.js:353, :520, :647, :779); nothing in ALRT writes those status values (the SLA writer sets 'failure').

## Flags

### BUG
1. PROD `alert_policies` has `enabled`, not `is_active` (PROD:4152), but POST/PUT write `is_active` (alertPolicyRoutes.js:186, :296-298). Create fails with a 500 against PROD; update with `is_active` fails likewise. The MIG schema does have `is_active`.
2. FE sends/reads `enabled` (AlertsConfig.jsx:189), which matches PROD, while the API accepts `is_active`; toggling enabled from the UI is not applied by PUT (field is ignored), and create from the UI fails on PROD (BUG 1).
3. PROD `alert_policy_recipients` has no `recipient_email`, `recipient_name`, `notify_on_*`, `recipient_type` (PROD:4170-4179), but the worker (AlertAggregationWorker.js:324), JobNotificationService (:262-266) and delivery-details (alertHistoryRoutes.js:245) select them. Worker and job email path then error out (caught, logged), delivery-details returns 500.
4. `alert_policies.trigger_type`, `provider_connection_id`, `failover_connection_id` are used in code (JobNotificationService.js:242, NotificationService.js:76-77) but absent in PROD. Also `alert_runs` insert columns (provider_connection_id, message_id, recipients) are absent in PROD (PROD:4189-4201: email_connection_id, recipients_count, run_type NOT NULL). `run_type` is NOT NULL and never supplied by createAlertRun.
5. `AlertAggregationWorker.sendConsolidatedAlert` calls `notificationService.sendAlert({policyId, recipients, ...})` (:356) but `sendAlert(policyId, emailData)` takes two args; also `require('./NotificationService')` exports the class (NotificationService.js:535) not an instance, so `notificationService.sendAlert` is not a function.
6. `AlertAggregator.addEventToDatabase` inserts `event_data`, `expires_at` (:182-188); PROD `alert_aggregation` has no such columns (has entity_type, entity_id, event_type, status, occurred_at, aggregation_ttl NOT NULL). The DB fallback cannot work against PROD, and MIG's version does not have them either.
7. server.js:5137-5155 creates `alert_history` with different columns than it queries (`triggered_at`), and CREATE TABLE runs on every request.
8. `JobNotificationService` joins `sc.id = ap.email_connection_id` (:249), but PROD `storage_connections` has no `id` column (PK `connection_id` varchar(255), PROD:6109, :6128) and PROD `email_connection_id` is varchar(255) (PROD:4151); alertHistoryRoutes.js:107 joins correctly on `connection_id`. The same missing `id` breaks `NotificationService.getEmailProvider` (`WHERE id = $1 AND is_active = true`, :36-38; `is_active` also absent) and delivery-details (`sc.provider_type`, alertHistoryRoutes.js:210; absent). The job email path cannot work on PROD.
9. Policies are queued with `consolidation_window_minutes` but the window is hardcoded 1800 s / flush at <60 s remaining; the per-policy value is ignored.
10. Malformed `limit`/`offset` (non-numeric) -> NaN passed to SQL -> 500 (alertPolicyRoutes.js:564, alertHistoryRoutes.js:115, :180).
11. `createAlertRun` sets `sent_at = new Date()` even when status is 'failed' (NotificationService.js:489).
12. delivery-details selects `sc.provider_type` and `apr.recipient_type`, neither in PROD (see entry 12); the UI call 500s.
13. `slaMonitorService.js:304` INSERT into `alert_events` omits `run_id`, which is `int4 NOT NULL` with FK to `alert_runs` (PROD:4104, :7309); the INSERT fails. It is the only writer of `alert_events`.
14. `JobNotificationService` ignores `result.success` from `sendWithProvider` (:167); a domain-validation rejection is logged as sent.
15. FE `getAlertHistory` calls `/api/alert-policies/history` (alertService.js:184), which matches `/:id` and returns 400 (entry 15).
16. `AlertAggregator.flushExpiredAggregations` dedupe compares string (Redis) and number (DB) policy ids (:411) and never matches (entry 17).
17. A non-numeric `:id` on `/api/alert-policies/:id...` returns 400 instead of 404 (entry 5).
18. dashboard.js counts alert statuses (`OPEN`, `ACTIVE`, `TRIGGERED`) that nothing writes (dashboard.js:353, :520, :647, :779).

### SECURITY
1. `extractProjectId` prefers `req.query.project_id` / `req.body.project_id` over the resource lookup (requireProjectAccess.js:186-191), and the lookup at :193-195 comes after. On PUT/DELETE/GET `/:id`, recipients and runs routes a caller can add `project_id` of a project they belong to and be authorized against that project while acting on a policy of another project. Code path confirmed; the exploit has not been run.
2. POST create: `project_id` from the body is authorized, but `email_connection_id` is not checked to belong to that project/user (can reference any connection).
3. alertHistoryRoutes.js endpoints have no permission-string check (only project membership); any project member (including Viewer role) can read runs/recipients.
4. GET /api/alert-policies/ has no permission check (project-scoped only). Policy lists for non-admins with no project membership return empty.
5. Recipient add: arbitrary external emails can be added without verification or domain restriction (alertPolicyRoutes.js:399-437), so alerts containing job details go to any address.
6. `buildHtmlEmail` interpolates `jobName`, `errorMessage`, rule names into HTML without escaping (JobNotificationService.js:77, :94, :105) (HTML injection into email).
7. `INTERVAL '${this.DEFAULT_TTL_SECONDS} seconds'` is string interpolation of a constant (AlertAggregator.js:187); not exploitable as is.
8. GET /api/alerts mutates data on a read (seeds defaults).
9. Admin bypass via `userHasAllProjectAccess` (requireProjectAccess.js:66) includes `all_projects:read`; a read-only holder bypasses membership and the permission-string check (authorizeProjectResource.js:90) and can create, update and delete alert policies.

### DUPLICATE
1. Two delivery paths for jobs: AlertAggregationWorker.onJobCompleted (jobExecutionEngine.js:2308) and JobNotificationService (jobExecutionEngine.js:2346). They differ: worker matches `entity_id` = id or '*' only, queues, honours consolidate_alerts, uses NotificationService with retry/failover and writes alert_runs; JobNotificationService also matches NULL entity_id, filters by trigger_type and per-recipient notify flags, sends once directly with no retry/failover and no alert_runs. The same job completion can produce two emails if both worked.
2. Two copies of `userHasAdminAccess`: server.js:380 = Admin role OR users:write / roles:write; permissionHelpers.js:80 = the same plus project_management:write. alertPolicyRoutes/alertHistoryRoutes use the permissionHelpers copy; GET /api/alerts (server.js:10185) uses the server.js copy, so a user with only project_management:write sees all policies but gets 403 on /api/alerts. A third predicate `userHasAllProjectAccess` (server.js:348 / permissionHelpers.js:60) adds all_projects:read; it is used by /api/alerts/history (server.js:5129) and by requireProjectAccess.js:66 for admin bypass.
3. Two "alert history" concepts: /api/alerts/history (alert_history, file-based DQ alerts) and /api/alert-history/runs (alert_runs, email deliveries). Plus two alert-configuration concepts: alert_rules (/api/alerts) and alert_policies.
4. Two schema definitions for the same tables: MIG vs PROD (names scope/trigger_type/grouping/is_active/recipient_email vs entity_type/trigger_events/consolidate_alerts/enabled/email).
5. Two object-permission matchers: `authorizeProjectResource` matches object-shaped permissions on `${p.resource}:${p.action}` (authorizeProjectResource.js:93-95), while permissionHelpers matches on name / permission_name / permission_code; the same user can pass one check and fail the other.

### DEAD
1. `AlertAggregationWorker.start()` is never called (non-test code only requires the worker and calls `on*` hooks; the tests require the nonexistent `../workers/AlertAggregationWorker`). Without it, TTL-expired aggregations are never flushed; flushing only occurs via immediate delivery or workflow completion.
2. `AlertAggregator.DEFAULT_CONSOLIDATION_WINDOW_SECONDS` and `QUEUE_PREFIX` are unused; `shutdown()` has no caller found (not searched exhaustively). `getAggregationStatus` is not dead (AlertAggregationWorker.js:150).
3. `trigger_events` is stored and validated on create but never read by any delivery code.
4. MIG table `createEmailAlertingSystem.js` fields (grouping, include_violations, max_attachment_size_mb, failover_connection_ids, use_default_provider) have no reader in ALRT code.
5. `alert_attachments` is read by delivery-details; nothing writes it. `alert_history` has no INSERT anywhere. `alert_rules` is only read and seeded (server.js:10193-10223); nothing evaluates it.

### UNCLEAR
1. Both entity_id NULL and '*' mean "all" depending on code path (see DUPLICATE 1); intended canonical value unknown.
2. Events with status 'failed' for workflows are queued but not flushed on failure (worker :149 only 'completed').
3. For job notifications, `cancelled` counts as failure and `completed_with_warnings` as success (JobNotificationService.js:135-136); not mirrored in the worker, which passes `finalStatus` raw.

## Domain terms
- Alert policy (alert_policies): rule "when entity X reaches event Y, email recipients"; also called "alert config" in UI (AlertsConfig).
- entity_type (PROD/routes) = scope (MIG); values job, workflow, mapping_group, schedule, vendor_sla.
- trigger_events (PROD, array of event names) = trigger_type success/failure/both (MIG/JobNotificationService).
- consolidate_alerts + consolidation_window_minutes (PROD) = grouping + grouping_window_minutes (MIG); "aggregation", "consolidation", "digest".
- enabled (PROD, worker) = is_active (routes, MIG).
- Recipient: user_id or email (PROD) = recipient_email/recipient_name/recipient_type (code).
- Alert run (alert_runs): one email delivery attempt record. Alert event (alert_events): an item inside a run. Alert history: either alert_runs list (/api/alert-history) or alert_history table.
- email_connection: a storage_connections entry of email type (SMTP, SendGrid, SES, gmail_oauth2, outlook_oauth2 per MIG comment); "provider". Keyed by `connection_id` in PROD (PROD:6109), `id` in code.
- Alert rule (alert_rules): system-wide DQ/file metadata rule, separate from policies.

## Open questions
1. Inventory.md lists GET /api/alert-history/* and /api/alert-policies/ auth as "-" (no auth), but server.js mounts both with `authenticateToken`; inventory should read JWT. `/api/alert-policies/` list and alert-history have no permission check, which is what "-" likely meant.
