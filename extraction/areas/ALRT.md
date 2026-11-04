# ALRT - Alert policies & delivery

Schema reference used: `attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql` (prod snapshot, "PROD" below) at :4057-4201. The migration `backend/migrations/createEmailAlertingSystem.js` (MIG) defines a different schema for the same table names (see Flags).

## Summary
Two groups of code:
1. CRUD and read APIs for alert policies, recipients and run history (`backend/routes/alertPolicyRoutes.js`, `alertHistoryRoutes.js`, mounted with `authenticateToken` at server.js:13925-13926, :13945-13946), plus two legacy endpoints in server.js (/api/alerts, /api/alerts/history).
2. Delivery code: event-driven `AlertAggregationWorker` (+ `AlertAggregator`, Redis with DB fallback) and `NotificationService` (provider chain, retries, circuit breaker); and a separate direct path for jobs, `JobNotificationService.fireJobNotification`.
The delivery code reads and writes columns that do not exist in the PROD schema (see BUG flags), so much of it cannot work against PROD as snapshotted. The aggregation worker is never started.

## Entry points

### 1. GET /api/alert-policies/ (alertPolicyRoutes.js:14)
- Caller: any authenticated user (authenticateToken at server.js:13926); no permission check.
- Input: none. Scope: `userHasAdminAccess(req.user)` sees all; others get policies where `project_id = ANY(user's projects)` (:18-47); no projects -> `{success:true, policies:[]}` (:25-30).
- Output: `{success, policies}` rows `ap.*` + `project_name`, `recipient_count`, `alert_run_count` (:34-38), ordered `created_at DESC`. 500 `Failed to fetch alert policies`.
- Note: counts joined on two one-to-many tables with COUNT(DISTINCT) (:37-38).

### 2. GET /api/alert-policies/:id (:68)
- Auth: `authorizeProjectResource({resourceType:'alert_policy', requiredPermissions:['alert_policy:read']})`. Project looked up from `alert_policies` (requireProjectAccess.js:278-279); project roles allowed default `Owner, Admin, Member, Viewer` (authorizeProjectResource.js:43); admin bypass default true (:44); then global permission strings must include `alert_policy:read` unless admin bypass (:85-121).
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
- Auth: `alert_policy:delete`. Hard delete, `RETURNING *` returned as `deleted` (:357-376). 404 if none. Child rows: no FK in PROD DDL, so recipients/runs are not deleted by this code (UNCLEAR, see Open questions).

### 6. POST /api/alert-policies/:id/recipients (:391)
- Auth: `alert_policy:update`. Body `user_id` or `email` (one required, else 400, :402). `delivery_method || 'email'` (:436).
- Duplicate check by (policy_id, user_id) if user_id given, else (policy_id, email); duplicate -> 409 `Recipient already exists for this policy` (:410-422). Not atomic (no unique constraint in PROD DDL).
- No email format validation; user_id not verified to exist.
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

### 13. GET /api/alerts/history (server.js:5123)
- Auth: authenticateToken; project-scoped via file's project (`f.project_id = ANY($1)`), admin uses `userHasAllProjectAccess` (a different helper than the `userHasAdminAccess` used elsewhere in ALRT) (:5126-5154). Empty -> `[]`.
- Side effect: runs `CREATE TABLE IF NOT EXISTS alert_history (... alert_type, alert_severity, alert_message ...)` on every call (:5137-5146); PROD table has different columns (file_id, rule_id, triggered_at, alert_details, PROD:4125) and the query orders by `ah.triggered_at` (:5155), which exists only in PROD, not in the table this handler would create.
- Output: raw rows `ah.*`, `filename`, `project_name`. Who writes alert_history: not found in backend except admin cleanup reading/deleting it (adminCleanupRoutes.js:88, :407). Writer for this table: see Open questions.

### 14. GET /api/alerts (server.js:10182)
- Auth: authenticateToken + `userHasAdminAccess` else 403 `Only users with admin privileges can view alert rules` (:10185-10191).
- Reads `alert_rules`. If empty, a GET inserts two defaults (side effect on read, :10196-10221): "Missing Values Alert" (greater_than, '10', data_quality, warning, enabled) and "File Size Alert" (percentage_change, '20', file_metadata, critical, enabled). Returns raw rows. Race: concurrent first calls can insert duplicates.
- Nothing in ALRT evaluates alert_rules (UNCLEAR, Open questions).

### 15. FE route /alerts-config (src/App.jsx:450, src/pages/AlertsConfig.jsx) and /alert-history (App.jsx:451, src/pages/AlertHistory.jsx)
- AlertsConfig uses form field `enabled` (AlertsConfig.jsx:28, :189, :468) and `../api/alertService`. Policy API in routes uses `is_active`; mismatch (BUG 2). Frontend internals not traced further.

### 16. Delivery: AlertAggregationWorker event hooks (backend/services/AlertAggregationWorker.js)
Triggered (not HTTP) by: `onJobCompleted(jobId, status)` from jobExecutionEngine.js:2308, :2467; `onWorkflowCompleted(workflowId, executionId, status)` from workflowOrchestrationEngine.js:276, :350, :405; `onMappingGroupCompleted` from mappingGroupExecutionEngine.js:186, :241; `onScheduleExecuted` from cronSchedulerService.js:481, :514 (status 'completed' or 'failed').
Rules:
- Matching policies: `enabled = true AND entity_type = $1 AND (entity_id = $2 OR entity_id = '*')` (:284-292). Policies with `entity_id IS NULL` (what the API stores when entity_id omitted, routes:195) do not match.
- trigger_events on the policy is never read by the worker; every status (completed/failed) is queued.
- Each event is queued via `AlertAggregator.addEvent` (requires policyId, eventType, entityId, entityType; status default 'unknown').
- If `policy.consolidate_alerts === false`: flush immediately and send (:142-145, :196-199, :229-232, :262-265).
- Workflow only: if status === 'completed' and the policy has queued events, flush and send (:149-162). Failed workflows are not flushed here; they wait for TTL. (With consolidate_alerts false and status completed, the immediate flush already emptied the queue.)
- Flush on TTL: `processExpiredAggregations` every `FLUSH_INTERVAL_MS = 60 * 1000` (:24), but `start()` is never called (see DEAD).
- `sendConsolidatedAlert`: no events -> return; recipients from `alert_policy_recipients.recipient_email, recipient_name` (:323-326); none -> warn and return (silently drops flushed events); 1 event -> single-entity template via EmailComposer (entity loaded from etl_jobs / workflows / mapping_groups / workflow_schedules, :512-553); more -> consolidated template; then `notificationService.sendAlert({...})` (:356).
- All errors are caught and logged; callers never see them.

### 17. Delivery: AlertAggregator (backend/services/AlertAggregator.js)
- Redis (`REDIS_URL` or `redis://localhost:6379`, :44) list per policy `alert_aggregation:<policyId>`; TTL set when absent: `DEFAULT_TTL_SECONDS = 1800` (:29, :163-166). Fallback to DB table `alert_aggregation` when Redis is down (retries stop after 10, :49-54; but `this.redisAvailable` flips back on 'connect'/'ready').
- DB row expiry `NOW() + INTERVAL '1800 seconds'` (:187).
- Expired flush: Redis keys with `0 < ttl < 60` (:380); DB policies with `expires_at <= NOW() + 60 seconds` (:404). So a queue is flushed once it is about 29-30 minutes old, regardless of the policy's `consolidation_window_minutes` (never used; `DEFAULT_CONSOLIDATION_WINDOW_SECONDS = 300` at :26 is also never used).
- Uses `redis.keys(pattern)` (:374), a blocking full scan.
- Flush clears both Redis and DB; events are removed before sending, so a send failure loses them.

### 18. Delivery: NotificationService (backend/services/NotificationService.js)
- `sendAlert(policyId, emailData)` (:516) -> `sendEmail` -> `createAlertRun`.
- Provider chain: `alert_policies.provider_connection_id` then `failover_connection_id` (:75-95); throws if none.
- Per provider: circuit breaker check, rate limit `checkRateLimit(id, maxPerHour = 100)` (:122), up to `maxRetries = 2` retries (3 attempts), backoff `min(1000 * 2^retry, 10000)` ms (:421). Delay only applied on thrown errors, not on `result.success === false`.
- On success returns provider info; if all fail returns `success:false, error 'All email providers failed for policy <id>'`.
- `createAlertRun` inserts alert_runs with columns policy_id, provider_connection_id, status ('sent'/'failed'), message_id, recipients, subject, error_message, sent_at (always `new Date()`, even on failure), metadata (:469-497).

### 19. Delivery: JobNotificationService.fireJobNotification (backend/services/JobNotificationService.js:196)
- Called from jobExecutionEngine.js:2211, :2346, :5874 at terminal job statuses (completed, completed_with_warnings, failed, cancelled). Skips everything if no userId (:205).
- Step 1: INSERT into `notifications` (in-app) for the triggering user, type `job_run_<status>`, action_url '/jobs' (:216-230).
- Step 2: policies `enabled = true AND entity_type = 'job' AND (entity_id = jobId OR '*' OR NULL) AND email_connection_id IS NOT NULL AND sc.status = 'active'` joined `storage_connections sc ON sc.id = ap.email_connection_id` (:241-256).
- Status match (`policyMatchesStatus`, :134-142): success = completed | completed_with_warnings; failure = failed | cancelled; trigger_type 'both' = all; unknown trigger_type = true.
- Recipients filtered by `notify_on_success` / `notify_on_failure` and `recipient_email` (:261-275). Email subject `<icon> Job <Label>: <name>`; HTML includes errorMessage truncated to 200 chars; up to 5 violated rules in HTML, 3 in text. No alert_runs row is written on this path.
- Sends directly via `_notificationService.sendWithProvider` with no retries, no failover, no rate limit; failure only logged.

## Data touched
- alert_policies (R/W), alert_policy_recipients (R/W), alert_runs (R; W by NotificationService), alert_events (R; no writer in ALRT), alert_attachments (R), alert_aggregation (R/W fallback queue), alert_history (R + CREATE IF NOT EXISTS), alert_rules (R, seeded on read), notifications (W), storage_connections (R), users, projects, files, etl_jobs, workflows, mapping_groups, workflow_schedules (R). Redis keys `alert_aggregation:<policyId>`.

## Flags

### BUG
1. PROD `alert_policies` has `enabled`, not `is_active` (PROD:4152), but POST/PUT write `is_active` (alertPolicyRoutes.js:186, :296-298). Create fails with a 500 against PROD; update with `is_active` fails likewise. The MIG schema does have `is_active`.
2. FE sends/reads `enabled` (AlertsConfig.jsx:189) while the API accepts `is_active`; toggling enabled from the UI is not applied by PUT (field is ignored).
3. PROD `alert_policy_recipients` has no `recipient_email`, `recipient_name`, `notify_on_*`, `recipient_type` (PROD:4170-4179), but the worker (AlertAggregationWorker.js:324), JobNotificationService (:262-266) and delivery-details (alertHistoryRoutes.js:245) select them. Worker and job email path then error out (caught, logged), delivery-details returns 500.
4. `alert_policies.trigger_type`, `provider_connection_id`, `failover_connection_id` are used in code (JobNotificationService.js:242, NotificationService.js:76-77) but absent in PROD. Also `alert_runs` insert columns (provider_connection_id, message_id, recipients) are absent in PROD (PROD:4189-4201: email_connection_id, recipients_count, run_type NOT NULL). `run_type` is NOT NULL and never supplied by createAlertRun.
5. `AlertAggregationWorker.sendConsolidatedAlert` calls `notificationService.sendAlert({policyId, recipients, ...})` (:356) but `sendAlert(policyId, emailData)` takes two args; also `require('./NotificationService')` exports the class (NotificationService.js:535) not an instance, so `notificationService.sendAlert` is not a function.
6. `AlertAggregator.addEventToDatabase` inserts `event_data`, `expires_at` (:182-188); PROD `alert_aggregation` has no such columns (has entity_type, entity_id, event_type, status, occurred_at, aggregation_ttl NOT NULL). The DB fallback cannot work against PROD, and MIG's version does not have them either.
7. server.js:5137-5155 creates `alert_history` with different columns than it queries (`triggered_at`), and CREATE TABLE runs on every request.
8. `JobNotificationService` joins `sc.id = ap.email_connection_id` but PROD `email_connection_id` is varchar(255) (a connection_id string, PROD:4151) while other code (alertHistoryRoutes.js:107) joins it to `storage_connections.connection_id`. Type/key mismatch.
9. Policies are queued with `consolidation_window_minutes` but the window is hardcoded 1800 s / flush at <60 s remaining; the per-policy value is ignored.
10. Malformed `limit`/`offset` (non-numeric) -> NaN passed to SQL -> 500 (alertPolicyRoutes.js:564, alertHistoryRoutes.js:115, :180).
11. `createAlertRun` sets `sent_at = new Date()` even when status is 'failed' (NotificationService.js:489).

### SECURITY
1. `extractProjectId` prefers `req.query.project_id` / `req.body.project_id` over the resource lookup (requireProjectAccess.js:186-191). On PUT/DELETE/GET `/:id` routes a caller can add `project_id` of a project they belong to and be authorized against that project while acting on a policy of another project (`alert_policy` id-based lookup is skipped). Not verified at runtime.
2. POST create: `project_id` from the body is authorized, but `email_connection_id` is not checked to belong to that project/user (can reference any connection).
3. alertHistoryRoutes.js endpoints have no permission-string check (only project membership); any project member (including Viewer role) can read runs/recipients.
4. GET /api/alert-policies/ has no permission check (project-scoped only). Policy lists for non-admins with no project membership return empty.
5. Recipient add: arbitrary external emails can be added without verification or domain restriction (alertPolicyRoutes.js:399-437), so alerts containing job details go to any address.
6. `buildHtmlEmail` interpolates `jobName`, `errorMessage`, rule names into HTML without escaping (JobNotificationService.js:77, :94, :105) (HTML injection into email).
7. `INTERVAL '${this.DEFAULT_TTL_SECONDS} seconds'` is string interpolation of a constant (AlertAggregator.js:187); not exploitable as is.
8. GET /api/alerts mutates data on a read (seeds defaults).

### DUPLICATE
1. Two delivery paths for jobs: AlertAggregationWorker.onJobCompleted (jobExecutionEngine.js:2308) and JobNotificationService (jobExecutionEngine.js:2346). They differ: worker matches `entity_id` = id or '*' only, queues, honours consolidate_alerts, uses NotificationService with retry/failover and writes alert_runs; JobNotificationService also matches NULL entity_id, filters by trigger_type and per-recipient notify flags, sends once directly with no retry/failover and no alert_runs. The same job completion can produce two emails if both worked.
2. Two admin predicates: `userHasAdminAccess` (policy routes, history routes, /api/alerts) vs `userHasAllProjectAccess` (/api/alerts/history, server.js:5129). Definitions not compared here.
3. Two "alert history" concepts: /api/alerts/history (alert_history, file-based DQ alerts) and /api/alert-history/runs (alert_runs, email deliveries). Plus two alert-configuration concepts: alert_rules (/api/alerts) and alert_policies.
4. Two schema definitions for the same tables: MIG vs PROD (names scope/trigger_type/grouping/is_active/recipient_email vs entity_type/trigger_events/consolidate_alerts/enabled/email).

### DEAD
1. `AlertAggregationWorker.start()` is never called outside tests (inventory.md:855, confirmed by grep of `\.start` for this worker in backend, none in non-test code). Without it, TTL-expired aggregations are never flushed; flushing only occurs via immediate delivery or workflow completion.
2. `AlertAggregator.DEFAULT_CONSOLIDATION_WINDOW_SECONDS`, `QUEUE_PREFIX`, `getAggregationStatus` ttl output beyond use in worker; `shutdown()` has no caller found (not searched exhaustively).
3. `trigger_events` is stored and validated on create but never read by any delivery code.
4. MIG table `createEmailAlertingSystem.js` fields (grouping, include_violations, max_attachment_size_mb, failover_connection_ids, use_default_provider) have no reader in ALRT code.
5. alert_attachments is read by delivery-details; no writer found in ALRT (grep `alert_attachments` outside migrations/routes not run exhaustively).

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
- email_connection: a storage_connections entry of email type (SMTP, SendGrid, SES, gmail_oauth2, outlook_oauth2 per MIG comment); "provider".
- Alert rule (alert_rules): system-wide DQ/file metadata rule, separate from policies.

## Open questions
1. Which schema is live: PROD snapshot (Jan 2026) or MIG? Code is split between them; many flags depend on this.
2. Is AlertAggregationWorker started anywhere (e.g., server bootstrap, PM2 script)? Grep found none in backend non-test code.
3. Who writes `alert_events` for policy runs and `alert_attachments`? Only slaMonitorService.js:304 inserts alert_events (outside this area's trace).
4. Who writes `alert_history`, and who evaluates `alert_rules`? No writer or evaluator was found in ALRT files.
5. Does deleting a policy cascade? PROD DDL shows no FKs for alert_policy_recipients/alert_runs; whether FKs exist elsewhere is unknown.
6. Definition of `userHasAdminAccess` vs `userHasAllProjectAccess` and the exact semantics of 'alert_policy:*' permission grants (where assigned) not traced.
7. Whether the `alert_policy` id-based project lookup is skipped when the client sends `project_id` (SECURITY 1) was read from code only.
8. alertService.js (frontend API) and AlertHistory.jsx behaviour not traced.
9. Inventory.md lists GET /api/alert-history/* and /api/alert-policies/ auth as "-" (no auth), but server.js mounts both with `authenticateToken`; inventory should read JWT. `/api/alert-policies/` list and alert-history have no permission check, which is what "-" likely meant.
