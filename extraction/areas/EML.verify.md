# EML verification (final re-verify after fix round 2)

Verdict: FIX (minor). Checked 38, wrong 2, unsupported 1, missed entry points 0.

## Coverage
All 17 HTTP entry points (emailConnection 12, allowedDomains 5) and both FE routes have subsections. Nothing missing. The full-file rewrite lost nothing I could find.

## Round-2 changes
- Prod storage_connections columns (dump 1767956647766 :6108-6128 and :6123-6125 soft-delete): CORRECT. There is no `id` and no `is_active`. The older dump 1767780691950 has the same lines and is the one the notes cite; both files exist.
- getEmailProvider query at NotificationService.js:35-40 and decrypt at :49-52: CORRECT. The catch at :58-64 logs and rethrows. Open question 5 is reasonable (the migration createEmailAlertingSystem.js:31 references storage_connections(id), so a dev DB may differ).
- Test route (emailConnectionRoutes.js:261-364): CORRECT. The provider id is `connection.connection_id` (:300), decrypt is at :293, and it bypasses getEmailProvider. Plaintext values throw in encryption.js:72-120, and the catch at :342 maps the message to a 500.
- updateConnection `is_active` at ConnectionService.js:840-843: CORRECT. Routes pass `status`, which is dropped (:758). persistCredentials passes only `config` (NotificationService.js:224-228); the note says :226-228, which is fine.
- Soft-delete BUG: CORRECT. Hard DELETE at ConnectionService.js:886-889. FK lines in dump 1767956647766: alert_policies :7322 SET NULL, alert_runs :7334 SET NULL, vendor_agreements :7891 SET NULL (re-read, confirmed), vendor_file_profiling_results :7897 has no ON DELETE action (so the delete gives a 500). I grepped every REFERENCES storage_connections and found only these four, so nothing is missing. The note still says ":7891 not re-read here"; it can be updated to "confirmed".
- UNCLEAR on provider_connection_id: the line numbers are WRONG (see below), and the question can now be answered (see UNSUPPORTED).

## WRONG
1. Flags and Data touched cite `NotificationService.js:78` and `:79` for `ap.provider_connection_id` / `ap.failover_connection_id`. The code has them at :76 and :77 (the SELECT starts at :75). The two-line shift also appears in the task description.
2. Flag "Real sends cannot load a provider on prod" says getEmailProvider is "the only provider loader for real sends". That is true only inside NotificationService.js. VendorAgreementNotificationService.js:339-384 has its own `getEmailProvider()`. It uses `connection_id`, `status = 'active'` and `is_deleted` (prod-valid names), then decrypts at :363 (it would throw for plaintext secrets). It is used by about 10 send sites (:447 onward). So vendor-agreement notification sends do not hit the id/is_active failure. The flag must be scoped to the alert-policy path (NotificationService.sendEmail :323 -> getProviderChain :325).

## UNSUPPORTED
1. The UNCLEAR about `provider_connection_id` is resolvable from the cited dump. alert_policies (dump :4141-4158) has only `email_connection_id`. It has no `provider_connection_id` and no `failover_connection_id`. So on prod the getProviderChain SELECT (NotificationService.js:74-81) fails with "column does not exist" before getEmailProvider is ever called. This means the "query fails first" ordering in the BUG flag is off. The first failure for alert sends is getProviderChain, not :35-40. The migration (createEmailAlertingSystem.js:31, :35) uses `email_connection_id INTEGER REFERENCES storage_connections(id)` and `failover_connection_ids INTEGER[]`, so the code names match neither prod nor the migration.

## Other claims checked (CORRECT)
Mounts at server.js:13930-13941. cache module missing (the Glob for backend/utils/cache* and backend/utils/cache/** found nothing; requires at :515, :595, :651, :756). GET / columns and type filter (:18-32). GET /:id 404 unreachable (ConnectionService.js:628-635) and type check (:66). POST / validation (:105-133), `type` log at :149, hardcoded 'active' (ConnectionService.js:708), plaintext config at :707, duplicate-name check at :671-678, RETURNING column list at :701-702. PUT: early return without COMMIT at :854-856, finally release at :873-875, sensitive-field list at :787-804. DELETE returns true (:896) and the route emits `deleted: true`. Test route error mapping (:353-361). 500 on send failure (:336).

## Missed
No missed entry points. One cross-area fact to record: VendorAgreementNotificationService has a second email provider loader (see WRONG 2).
