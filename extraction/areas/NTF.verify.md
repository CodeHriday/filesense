# NTF verification (round 2, after fix round 1)

Verdict: PASS

Counts: 62 claims checked, 0 WRONG, 0 UNSUPPORTED, 0 entry points missing, 3 minor omissions (non-blocking, listed below).

## Coverage
All 15 HTTP rows in inventory.md (notifications 8: notifications.js:14, 54, 151, 174, 214, 254, 277, 315; digest 7: digestRoutes.js:73, 95, 115, 155, 214, 232, 257), the scheduler hook and the two FE routes (App.jsx:401, :405) have subsections (N1-N8, D1-D7, S1, F1). Mounts at server.js:13911 and :13915-13916 are CORRECT. No entry point is missing.

## Round-1 changes, each re-checked against code
- 16/18 INSERT sites: CORRECT. A repo-wide grep finds 16 in vendorAgreementService.js at exactly 407, 1647, 1663, 1868, 1885, 2140, 2174, 2288, 2322, 2486, 3456, 3482, 3710, 3815, 3840, 3915. Plus JobNotificationService.js:217 and notifications.js:335, giving 18. "All 17 non-route writers" is right. VendorAgreementNotificationService.js has no INSERT (it sends email).
- Three admin predicates: CORRECT. server.js:380-403 admits only `users:write` and `roles:write` (server.js is at the repo root, not backend/). digestRoutes.js:18-35 and permissionHelpers.js:80-92 both admit `project_management:write`. The comment at digestRoutes.js:16-17 is stale as claimed.
- sendWithProvider: CORRECT. NotificationService.js:254-314 has no rate limit or breaker. It runs `EmailDomainValidationService.validateEmails` at :258 and returns `success:false` with "Email domain not allowed" at :271-276. DigestService.js:394-395 throws on that, so a failed row is recorded. checkRateLimit (100/h) is at :122 and the breaker (3 failures, 5-min cooldown) at :154-198. `sendEmail` calls them at :330 and :348.
- data_contracts empty body: CORRECT. The object at DigestService.js:225-230 has `label, total, signed, pending`. renderCategory branches (:271, :276, :283) need `completed`, `open` or `count`, so none match. hasActivity (:240-244) can still be true.
- Schema sources: CORRECT. The Jan_05 dump (1767956647766) has `CREATE TABLE public.notifications` at :5536-5554 with `expires_at` at :5549. The FK `notifications_user_id_fkey ... ON DELETE CASCADE` is at :7631. No file in attached_assets mentions digest_subscriptions or email_digests, so createDigestTables.js (:13, :33; CHECKs at :17 and :38, FK SET NULL at :20, cascade at :35) is the only source. The migration is addGovernanceWorkflow.js:141, `expires_at` at :166. Run via server.js:5941.
- /count: CORRECT. src/App.jsx:298 calls it. src/hooks/useAPINotifications.js:10, :15, :20 call list, read and read-all. NotificationBell.jsx:52 and :57 poll every 30 s and count client-side.
- expires_at never filtered: CORRECT. No `expires_at` appears in notifications.js.
- No workflow_* producer: CORRECT. A grep of backend/ finds no workflow_* notification type. FE reads are at Notifications.jsx:23, :49, :136, :158.
- 500 with raw DB message: CORRECT (notifications.js:363-367). The FK type is as claimed.
- Missing .catch: CORRECT. files_processed (:114-134) and job_failures (:136-150) have none. The others have one (:170, :189, :207, :231). Promise.allSettled is at :237.
- Status defaults: CORRECT. quality_rule_violations table starts at dump :5750 and its default is 'new' at :5764. vendor_agreements starts at :6769, `status` default 'active' at :6791, `approval_status` default 'draft' at :6783. The digest counts 'open'/'resolved' at :157-158 and 'active' at :218.
- requireAdmin throwing: CORRECT. A non-array object `roles` has no `.includes`/`.some` (digestRoutes.js:23-24). A null permission entry hits `p.name` (:33), because `typeof null` is not 'string'.
- categories: null: CORRECT. The destructuring default fires only for undefined, validateBody skips falsy values (:55), JSON.stringify(null) is stored, and `|| ['all']` rescues it at DigestService.js:102.
- Q1, Q2 (server.js:50 is 60000), Q3, Q5, Q7, Q8: answers CORRECT. Q4 and Q6 are correctly left open.

## Other claims checked, all CORRECT
N1 no auth and header logging (:14-17), 503 body (:42-46). N2 filters, LIMIT 100, SELECT 1 and table check, 503s (:75-100, :115-133). N3 (:151-171). N4/N5/N7 parseInt, 400, 404. N6. N8 required fields, 200, `entity_id || null`, JSON.stringify metadata. D1-D7 as described, including ownership-less UPDATE (:201), next_send_at reset (:176-178, :193), recipients `[]` allowed on PUT but rejected on POST (:131), 201, `detail` on send-test, history LIMIT 50. computeWindow/computeNextSendAt (:57-83). processDigests 42P01 (:453), `processed` counting (:465-472), always-update (:418-428). schedulerWorker.js:46, :54-57. Footer text :342, `appUrl` never passed (:384), unescaped subscriptionName (:317). NotificationService class export :535 and `new NotificationService()` DigestService.js:18. `pool` unused in notifications.js. NotificationContext duration 4000 (:18).

## Did the full-file rewrite lose anything?
No. Every item from the first-pass report (M1-M7, WRONG 1-3, UNSUPPORTED 1-2) is present in the new NTF.md, and the earlier correct material (all 15 endpoints, the S1 detail, flags) is retained.

## Minor omissions (not blocking)
1. backend/routes/adminCleanupRoutes.js:493 does `DELETE FROM notifications` (all rows) for the 'activity' category, and :159 counts them. A deletion path outside the inbox routes; belongs to an admin/cleanup area but could be listed under Data touched.
2. N2 has two guards before the query that the notes skip: invalid-request 500 (:57-62) and 401 when no `req.user.id` (:65-69).
3. useMarkNotificationRead (useAPINotifications.js:43-45) invalidates the cache only after a 30 s timeout, and the hook's default polling is disabled (:31), so the bell's own 30 s refetch is the only refresh. Cosmetic.
