# ALRT verification (round 2, after fix round 1)

Verdict: PASS

Counts: 78 claims checked, 0 WRONG, 2 UNSUPPORTED, 0 missing entry points, 5 missed behaviours (minor, optional).

PROD = attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql.

## Coverage
All inventory rows for ALRT have a subsection: 13 HTTP rows (2 in server.js, 11 in the two route files), 2 FE routes, worker interval (entry 16), Redis (entry 17), tables (Data touched). No entry points missing. Nothing from round 1 was lost in the full-file rewrite: every round-1 finding is present and accurate (see below).

## Round-1 changes re-verified (all CORRECT)
- storage_connections: PK connection_id varchar(255) (:6109, :6128); columns :6109-6125 have no id, provider_type or is_active; has type (:6110) and status (:6113). CORRECT.
- Alert FKs reference storage_connections(connection_id): :7322 (alert_policies), :7334 (alert_runs). CORRECT.
- Cascades: :7299 (aggregation), :7304 (attachments), :7309 (events), :7323 (projects), :7328 (recipients), :7335 (runs). All ON DELETE CASCADE. CORRECT.
- Recipient FK to users(id) :7329 (cascade) and CHECK check_recipient :4178. CORRECT.
- delivery-details selects sc.provider_type (:210) and apr.recipient_type (:245); both absent in PROD. getEmailProvider uses `WHERE id = $1 AND is_active = true` (NotificationService.js:36-38). JobNotificationService joins `sc.id = ap.email_connection_id` (:249). All fail on PROD. CORRECT.
- getAggregationStatus is called at AlertAggregationWorker.js:150. CORRECT. QUEUE_PREFIX and DEFAULT_CONSOLIDATION_WINDOW_SECONDS are unused, shutdown() has no caller (grep). CORRECT.
- Redis retryStrategy returns null after 10 retries (AlertAggregator.js:49-54). redisAvailable starts false (:21), true only on connect/ready (:68, :74). CORRECT.
- etl_jobs, workflows and workflow_schedules are absent from the PROD dump (grep). mapping_groups is at :5411. CORRECT.
- SEC 9: userHasAllProjectAccess (permissionHelpers.js:60-73) includes all_projects:read. requireProjectAccess.js:17 imports it from permissionHelpers and uses it at :66. It sets req.isAdminBypass. authorizeProjectResource.js:91 skips the permission-string check when that flag is set. CORRECT.
- FE getAlertHistory calls /api/alert-policies/history (alertService.js:184). This matches /:id, the lookup throws on the non-integer, and the response is 400 'Project context required' (requireProjectAccess.js:55-61). CORRECT.
- JobNotificationService._send never reads the result (:167); logs "email sent" regardless. sendWithProvider returns success:false on domain rejection (NotificationService.js:260-276). CORRECT.
- Circuit breaker (NotificationService.js:154-216): opens at 3 failures (:190), 5 min cooldown (:163), half-open decrements by 1 (:166-171), success decrements and closes at 0 (:210-212), in-memory Map (:25). Domain rejection retried 3 times with no delay (delay only in catch, :420-423). CORRECT.
- dashboard.js status counts (:353, :520, :647, :779) all `ae.status IN ('OPEN','ACTIVE','TRIGGERED')`. The queries are at :349-354, :516-521, :643-649, :775-781. The SLA writer sets 'failure' (slaMonitorService.js:336). CORRECT.
- policyId string (Redis) vs number (DB) in dedupe (:381 vs :411). CORRECT.
- Non-numeric :id returns 400: requireProjectAccess.js:204-221 swallows the query error and returns null, then :55-61 sends 400. CORRECT, with the caveat below.
- DUP 5: authorizeProjectResource.js:93-95 uses `${p.resource}:${p.action}`; permissionHelpers.js:19-21 uses name/permission_name/permission_code. CORRECT.
- Lines the fixer took from the earlier report:
  - requireProjectAccess.js:186-195: query, then body, then resource lookup. CORRECT.
  - requireProjectAccess.js:214-219: error swallowed, null returned. CORRECT.
  - NotificationService.js:260-276: domain-validation early return. CORRECT.
  - permissionHelpers.js:60 and :80: CORRECT. :80 admin = Admin role + users:write, roles:write, project_management:write.
  - server.js:348 and :380: CORRECT. :380 admin = Admin role + users:write, roles:write only.
  - DUP 2 wording "adds all_projects:read" is accurate relative to userHasAdminAccess. Strictly, userHasAllProjectAccess = admin set + all_projects:read, with project_management:write already in both.
- dashboard.js other lines: join `ae.run_id = ar.id`, `ar.policy_id = ap.id`, per-project filters. CORRECT.
- Settled open questions (schema live, alert_events writer, alert_history, alert_rules, worker never started): CORRECT. server.js has no reference to the worker; tests require the nonexistent backend/workers/AlertAggregationWorker (the directory listing has no such file).

## Other claims checked (all CORRECT)
- Mount lines server.js:13925-13926, :13945-13946.
- alertPolicyRoutes: list scope and counts (:14-65), POST validation, defaults and INSERT with is_active (:146-201), PUT dynamic fields and 400/404 (:248-324), DELETE RETURNING * (:357-376), recipients duplicate/409/delivery_method (:402-437), recipient DELETE (:508-518), runs limit/offset (:552-564).
- alertHistoryRoutes: filters (:44-75), connection_id join (:107), events 403/404/order (:141-180), delivery-details (:203-271).
- server.js /api/alerts/history (:5123-5167: CREATE TABLE on each call, ORDER BY triggered_at, userHasAllProjectAccess at :5129).
- server.js /api/alerts (:10182-10232): seed defaults, 403 message.
- No INSERT into alert_history; DELETEs at server.js:2095, :2215, :3342 and adminCleanupRoutes.js:407; read at :88.
- Worker: match query (:284-292), immediate-flush lines (:142, :196, :229, :262), workflow flush (:149-162), recipients columns (:323-326), sendAlert object call (:356) vs (policyId, emailData) (NotificationService.js:516), class export (:535), single-event DB lookups (:512-553).
- Hook callers: jobExecutionEngine.js:2308, :2467; workflowOrchestrationEngine.js:276, :350, :405; mappingGroupExecutionEngine.js:186, :241; cronSchedulerService.js:481, :514.
- fireJobNotification callers: jobExecutionEngine.js:2211, :2346, :5874.
- AlertAggregator: TTL 1800 and expire when ttl == -1 (:163-166), `keys()` (:374), ttl<60 (:380), DB `expires_at <= NOW()+60s` (:404), insert columns event_data/expires_at (:182-188) absent in PROD.
- NotificationService: backoff (:421), createAlertRun columns (:469-497) vs PROD alert_runs (run_type NOT NULL :4192), sent_at (:489).
- JobNotificationService: policyMatchesStatus (:134-142), recipients query (:261-275), HTML unescaped (:77, :94, :105), 200-char truncation (:94).
- slaMonitorService.js:304 insert omits run_id (PROD :4104 NOT NULL).
- FE: AlertsConfig `enabled` (:28, :189, :304, :468); AlertHistory calls only runs, delivery-details and events; getFileAlerts has no matching backend route.
- Inventory auth '-' for alert-history and alert-policies list (inventory.md:293-296).

## UNSUPPORTED (2, minor)
1. Entry 3 lists "project_id required" (400, handler :153) as a validation. It is unreachable: with no body project_id the middleware (extractProjectId then lookupResourceProject, which returns null as there is no p.id) answers 400 'Project context required' first. The handler check only fires if project_id is falsy after the middleware accepted it, which cannot happen.
2. Entry 5 says non-numeric :id gives 400 "on every /:id route". That holds only when the request carries no query/body project_id. With a project_id present (the SEC 1 path), the middleware passes and the handler's `WHERE id = $1` with 'abc' throws, giving the route's 500, not 400.

## Missed behaviours (optional, none change a verdict)
1. Redis path also breaks on PROD. `flushEvents`/`getEvents` call `getEventsFromRedis`, which always merges `getEventsFromDatabase` (AlertAggregator.js:235). That selects `expires_at`, absent in PROD, so it throws. The catch (:246-250) sets redisAvailable=false and retries the DB read, which throws again. So events queued in Redis can never be flushed on PROD, and the first flush flips Redis to "unavailable" until a reconnect event. BUG 6 only says the DB fallback is broken.
2. Circuit breaker `recordFailure` runs once per provider per `sendEmail` call, after all retries (NotificationService.js:429), so 3 failed sends are needed to open it. Domain-validation rejections count as failures and can open the breaker.
3. `processExpiredAggregations` skips a flushed policy whose row no longer exists (Worker :87-90), and a missing entity throws 'Entity not found' (:409-411), caught and logged. Both are silent drops.
4. entity_type 'vendor_sla' is allowed by the PROD CHECK (:4156) and by `idx_alert_policies_vendor_sla`, but no delivery code (worker, NotificationService, JobNotificationService) ever matches that type. Such policies never send.
5. Non-numeric `run_id`, `policy_id` and `limit` in alertHistoryRoutes pass NaN into SQL and return 500 (:46, :148, :180, :218). BUG 10 mentions only limit/offset.
