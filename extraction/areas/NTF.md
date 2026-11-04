# NTF - In-app notifications & digests

## Summary
Two features. (1) A per-user notification inbox: rows in `notifications`, listed/counted/read/unread/deleted by the owner (backend/routes/notifications.js). Rows are written by other areas via direct SQL (JobNotificationService.js:217, vendorAgreementService.js many sites e.g. :407, :1647) and by a POST endpoint. (2) Digest subscriptions: an admin-only CRUD for scheduled HTML summary emails, sent by `processDigests()` on each SchedulerWorker tick (backend/workers/schedulerWorker.js:54-57). Routes mounted at server.js:13910-13916.

## Entry points

### N1 GET /api/notifications/health (notifications.js:14)
- Auth: none (comment "no auth required for debugging", :13). Mounted before `router.use(authenticateToken)` (:51).
- Runs `SELECT NOW()` and an information_schema check for table `notifications`.
- 200 `{healthy, database_connected, notifications_table_exists, timestamp}`; 503 `{healthy:false, error: error.message}` (:42-46). Logs full request headers to console (:17).

### N2 GET /api/notifications (notifications.js:54)
- Auth: JWT; own rows only (`WHERE user_id = $1`, :105).
- Query params: `unread_only` ('true' adds `is_read = FALSE`, :110), `category` (:115-131): `job_runs` -> `notification_type LIKE 'job_run_%'`; `governance` -> `LIKE 'vendor_contract_%'`; `workflow` -> `LIKE 'workflow_%'`; `unread` -> unread; anything else (incl. 'all') no filter.
- Order `created_at DESC`, hard `LIMIT 100`, no pagination (:133).
- Every call first runs `SELECT 1` and an information_schema table check (:75-92); 503 if table missing or DB error (message returned to client).
- 200 `{success:true, notifications:[rows SELECT *]}`; 500 `{error: message}`.

### N3 GET /api/notifications/count (:151)
- JWT, own rows. Returns `{success, unread_count: parseInt(...)}`; 500 on error.

### N4 PUT /api/notifications/:id/read (:174)
- JWT. `parseInt(id)`; NaN -> 400 'Invalid notification ID'. Ownership SELECT (`id AND user_id`) -> 404 if absent. Sets `is_read = TRUE, read_at = CURRENT_TIMESTAMP`. 200 `{success, message}`.

### N5 PUT /api/notifications/:id/unread (:214)
- Same checks; sets `is_read = FALSE, read_at = NULL`.

### N6 PUT /api/notifications/read-all (:254)
- JWT. Marks all of the caller's unread rows read. Always 200 (no count returned).

### N7 DELETE /api/notifications/:id (:277)
- JWT, ownership check -> 404; hard `DELETE`. 400 on non-numeric id.

### N8 POST /api/notifications (:315)
- JWT only; no role check. Comment says "internal use or admin" (:314).
- Body: `user_id, notification_type, title, message` required (400 otherwise, :328); optional `entity_type, entity_id, action_url, metadata` (metadata JSON.stringify'd, :348).
- Inserts for ANY `user_id`, returns 200 (not 201) `{success, notification}`. No validation of user_id existence or notification_type values.

### D1 GET /api/digest-subscriptions (digestRoutes.js:73)
- All digest routes: `authenticateToken` then `requireAdmin` (:44-45). Admin = roles include 'Admin'/'admin' (string or object `name`/`role_name`) OR any permission among `users:write`, `roles:write`, `project_management:write` (:18-35). Else 403.
- Lists caller's own subscriptions with `connection_name` (join storage_connections on `connection_id`) and latest `email_digests` row as `last_digest`. Order `created_at DESC`. Response `{subscriptions}`.

### D2 GET /api/digest-subscriptions/:id (:95)
- Own subscription only (`id AND user_id`), 404 otherwise. `:id` is not validated as an integer (non-numeric would produce a DB error -> 500).

### D3 POST /api/digest-subscriptions (:115)
- Defaults: name 'My Digest', frequency 'daily', categories ['all'], recipients [], email_connection_id null, send_if_empty false, is_active true (:119-125).
- Validation (:50-70): frequency in hourly/daily/weekly/monthly; categories non-empty array from `all, files_processed, job_failures, dq_violations, schema_drift, profiling_failures, data_contracts`; recipients array of strings each containing '@'. At least one recipient (400, :131).
- `next_send_at = computeNextSendAt(frequency)` = now + 1 hour/1 day/7 days/1 month (DigestService.js:73-83).
- 201 `{subscription}`. email_connection_id not checked for existence/type/ownership (only DB FK, createDigestTables.js:20).

### D4 PUT /api/digest-subscriptions/:id (:155)
- Ownership check (404). Partial update of name, frequency, categories, recipients, email_connection_id, send_if_empty, is_active. Same validation. If `frequency` is supplied (even unchanged) `next_send_at` is reset to now + period (:176-178, :193). Empty update -> 400 'No fields to update'. Setting `recipients: []` is allowed on update (validation accepts empty array, :62-68) though create rejects it.
- Update itself is `WHERE id = $n` without `user_id` (:201); ownership relied on prior check.

### D5 DELETE /api/digest-subscriptions/:id (:214)
- Delete with `id AND user_id`; 404 if none; 200 `{success, id}`. email_digests cascade (createDigestTables.js:35).

### D6 POST /api/digest-subscriptions/:id/send-test (:232)
- Ownership check; calls `sendDigest({...sub, send_if_empty:true})` (:246). Returns `{success: status==='sent', status, error}`. Side effects: really sends email, writes email_digests row and advances `next_send_at`/`last_sent_at` (DigestService.js:407-428), so a test send postpones the next scheduled send. 500 includes `detail: err.message`.

### D7 GET /api/digest-subscriptions/:id/history (:257)
- Ownership check; last 50 `email_digests` rows (`id, sent_at, recipient_count, status, error_message, created_at`) ordered `sent_at DESC`. `{history}`.

### S1 Scheduler hook processDigests (DigestService.js:439)
- Trigger: SchedulerWorker tick, run in parallel with processDueSchedules via `Promise.allSettled` (schedulerWorker.js:54). Tick interval 60 s per inventory (not re-verified here; see Open questions). Skipped if previous tick still processing (:46).
- Selects `is_active = true AND next_send_at <= now` ordered by `next_send_at` (:445-447). Postgres 42P01 (missing table) silently returns `{processed:0}` (:453). Subscriptions are sent sequentially; `processed` counts those that did not throw (sendDigest swallows its own errors, so failures are counted too).
- `sendDigest` (:355): window = now minus period (hour/day/7 days/1 month, :57-68; unknown frequency -> 1 day). Gathers counts per category (see below). If no activity and not `send_if_empty` -> status 'skipped' (no email). Otherwise needs recipients (array) and `email_connection_id`, else error. Loads provider (connection must exist, `status === 'active'`, config decrypted; :25-49), sends via `NotificationService.sendWithProvider`. Subject `[<Frequency> Digest] Platform Activity Summary`. Writes audit row to `email_digests` (status sent/failed/skipped) and ALWAYS updates `next_send_at` (now + period) and `last_sent_at` even on failure/skip (:418-425); no retry until next period.
- Category queries (all platform-wide, not per user): files_processed = `transformation_jobs` by status completed/failed (:117-122); job_failures = status IN ('failed','error') (:141); dq_violations = `quality_rule_violations` open/resolved (:155-160); schema_drift = `anomalies` where `anomaly_type ILIKE '%schema%'` (:182); profiling_failures = `files` where `processing_step='failed'` by `updated_at` (:200); data_contracts = `vendor_agreements` active="signed", pending (:216-221). `hasActivity` = any numeric field > 0 (:240-244). Unknown/other category names are ignored.

### F1 Frontend (listed for completeness)
- src/pages/Notifications.jsx calls GET /api/notifications, PUT read/unread/read-all, DELETE (:231-283). src/components/NotificationBell.jsx polls via `useAPINotifications({refetchInterval: 30*1000})` (:52) and computes unread count client-side from the returned list (:57) rather than calling /count (so capped at 100 rows). src/pages/DigestSubscriptions.jsx uses `/api/digest-subscriptions` (:8). NotificationContext.jsx is a separate toast helper (`duration = 4000`, :18), unrelated to the inbox.

## Data touched
- `notifications` (created in backend/migrations/addGovernanceWorkflow.js:141 per inventory): columns used user_id, notification_type, title, message, entity_type, entity_id, action_url, metadata, is_read, read_at, created_at.
- `digest_subscriptions`, `email_digests` (createDigestTables.js:13, :33). Constraints: frequency CHECK, status CHECK ('sent','failed','skipped'), email_connection_id FK ON DELETE SET NULL, user FK ON DELETE CASCADE.
- Read-only: `transformation_jobs`, `quality_rule_violations`, `anomalies`, `files`, `vendor_agreements`, `storage_connections`.
- Writers of `notifications` outside this area: JobNotificationService.js:217, vendorAgreementService.js (14 sites, e.g. :407, :1647, :3710).

## Flags
- SECURITY: POST /api/notifications lets any authenticated user create a notification for any `user_id` with arbitrary title/message/action_url (notifications.js:315-350); comment claims internal/admin use but there is no check.
- SECURITY: /api/notifications/health unauthenticated; logs request headers (:17) and returns raw DB error text (:44).
- SECURITY: Notification list/error responses return raw `error.message` / DB message to client (:98, :145).
- SECURITY: Digest HTML interpolates `subscriptionName` unescaped (DigestService.js:317); recipients are only checked for containing '@'. Send-test and scheduler send arbitrary recipient lists via the chosen connection.
- SECURITY: `email_connection_id` is not checked for ownership or type; any storage connection id can be used (D3/D4).
- BUG: NotificationBell counts unread from the max-100 list, so count can be wrong; the /count endpoint is unused there (NotificationBell.jsx:57).
- BUG: PUT digest allows `recipients: []` / disabling recipients after creation, which later fails at send with 'No recipients configured' (digestRoutes.js:62-68 vs :131; DigestService.js:374).
- BUG: Failed or skipped digest still advances `next_send_at` (DigestService.js:418), so a transient email failure loses that period's digest. Test send also advances the schedule.
- BUG: `trend()` shows "↑ n" in green for good metrics and the template checks `cat.open !== undefined` inside a branch already requiring it (renderCategory :276-282); data_contracts block has `total` and `signed` but no `open`, so it matches no branch except the count branch is also not met: data_contracts renders an empty table (inferred from :271-287; summary shape :225-230). Mark as likely bug.
- BUG: schema_drift filtered by `anomaly_type ILIKE '%schema%'` and `files_processed` counts `transformation_jobs`, not files (DigestService.js:121, :182); label/query mismatch.
- BUG: next-send computed with local-time setHours/setDate/setMonth (server time zone), monthly uses `setMonth` overflow (e.g. Jan 31 -> Mar 3) (DigestService.js:57-83). Digest date formatting uses locale 'en-US' server tz (:255-260).
- DUPLICATE: Digest "admin" test mirrors `userHasAdminAccess` in server.js (comment digestRoutes.js:17); second implementation of the admin rule. Notifications are also written by many direct INSERTs instead of one service (see Data touched); `NotificationService` (email provider chain) is unrelated to the inbox despite its name.
- DUPLICATE: Table-existence checks run on every GET /api/notifications and the health endpoint (:75-92, :25-31).
- UNCLEAR: Admin permission list includes `project_management:write` as admin-equivalent (digestRoutes.js:34); intent of this broad rule unclear.
- UNCLEAR: Digests are admin-only and per-owner, so non-admins cannot subscribe, while the footer says "To unsubscribe, visit your Digest Subscriptions settings" (:342); `appUrl` is never passed (:384), so the "View in App" button never renders.
- DEAD: `pool` imported in notifications.js:8 unused; `computeWindow`, `gatherSummary`, `buildHtmlEmail` exported but used only internally (:479-486). `NotificationService.checkRateLimit` (100/hour) and circuit breaker (3 failures, 5-min cooldown, :122-198) are in provider-send path, outside this area's routes.

## Domain terms
notification / alert (inbox row) ; `notification_type` prefixes `job_run_`, `vendor_contract_`, `workflow_`; category (UI filter) vs digest categories (metric groups); digest subscription / digest / email_digests (send audit); frequency; `send_if_empty`; email connection = `storage_connections` row used as provider; "signed" = vendor_agreement status 'active'; "Files Processed" = transformation_jobs.

## Open questions
1. Which code paths create notification types `workflow_*` and `job_run_*` (only vendorAgreementService and JobNotificationService writers were located, not their type values)?
2. Is the scheduler interval really 60 s (inventory says schedulerWorker every 60 s; `intervalMs` not read here)?
3. Is `notifications` table schema (columns, defaults, is_read default) as in addGovernanceWorkflow.js:141? Not read.
4. Why are digests admin-only while the UI and footer imply per-user subscribing?
5. Does the frontend show DigestSubscriptions only to admins (src/App.jsx:401 route guard not read)?
6. Who calls POST /api/notifications, if anyone (no frontend caller found in the files checked)?
7. Whether `NotificationService.sendWithProvider` (:254) applies the rate limit/circuit breaker to digest sends was not traced.
8. Is the data_contracts block really rendered empty (renderCategory branches)? Reasoned from code, not executed.
