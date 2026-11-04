# AUD verification (round 2)

Verdict: PASS. Checked 42, WRONG 0, UNSUPPORTED 1, missed 2 (minor, listed below).

## Coverage
All 14 inventory routes (inventory.md:83-96), the global middleware and the /audit-trail page have subsections. Nothing is missing. Route count 11 admin + 3 JWT is right (server.js:5430-5807; the three frontend routes have only authenticateToken, :5671/:5720/:5765).

## Round-1 changes
- Archive/cleanup split by function: CORRECT. archiveOldRecords (auditRetentionService.js:221 UPDATE, :246 ROLLBACK) and deleteOldRecords (:373, :398) throw into the outer catch, so the route gets 500. deleteArchivedRecords (:291-299) goes catch to COMMIT with success:true.
- /frontend-error caller ErrorBoundary.jsx:38: CORRECT. /frontend-interaction has no caller in src/ (grep of `audit/`).
- Interceptor :36 downgrade: CORRECT. A string passes through parse(stringify(x)); the call sits in try/catch (:20/:42).
- entity_id: CORRECT, labelled inferred. Prod audit_log.entity_id is nullable (dump :3836), the archive is NOT NULL (:2793), and the middleware passes null (auditMiddleware.js:200). createAuditTables.js:24 is NOT NULL.
- Two userHasAdminAccess copies: CORRECT. server.js:380-403 accepts admin role, users:write or roles:write. permissionHelpers.js:80-92 also accepts project_management:write.
- Other audit writers: CORRECT. logDataAccess server.js:1986 and :6716; the worker calls at :443, :829, :885, :1411, :1468; logSecurityEvent projectRoutes.js:672. Also adminCleanupRoutes.js:529 calls logSystemCleanup. The notes say only "admin cleanup", which is fine but could cite it. logConfigChange has no caller.
- Null retention_days gives 500: CORRECT. Dump :2824 is NOT NULL; the error goes to ROLLBACK (:100) and then the route 500 (server.js:5601-5602). The booleans are nullable (:2825-2826).
- Non-numeric :auditId gives 500 (server.js:5483, 5490). limit=0 is falsy at server.js:5446, so effectiveLimit is null and there is no limit. CORRECT.
- Middleware logs the audit page: CORRECT. No exclusion pattern matches /api/audit (:111-121).
- Null user fields: CORRECT by code read. The middleware is registered at server.js:606, reads req.user at :140-142, and authenticateToken is per-route.
- 6-table hard delete: CORRECT (auditRetentionService.js:352-371, with frontend_audit_log at AUDIT_TABLES :39-44).

## The two items I was asked to re-check
1. res.send logging note (notes line 14). The code is fine; the note is misleading. res.json and res.send are wrapped (auditMiddleware.js:157-171) and the first call wins. Express's res.json calls this.send internally, but responseSent is already true by then, so no double capture. responseData is read only when status >= 400 (:191-195). So the CSV export success body is never logged, like every other success body. This is not specific to res.send. On export failure the 500 goes through res.json, so the error is captured. UNSUPPORTED only as wording: the claim implies a res.send-specific effect, but there is none. Open question 4 can be closed: no interplay problem.
2. Column order of the other four archive tables. All four match their source tables in column order, then archived_at last. execution_audit and its archive: dump :3085-3107 vs :3122-3145. data_access_log: :2934-2954 vs :2970-2991. config_change_history: :2842-2860 vs :2875-2894. security_audit_log: :3614-3630 vs :3646-3663. So `SELECT *, NOW()` lines up for all five. Open question 5 can be closed.

## Other claims spot-checked, all CORRECT
- Admin guard and 403 body (server.js:5417-5427).
- logs filters, ILIKE on userId, LIMIT/OFFSET only with limit (AuditService.js:403-448).
- Default start from `LIMIT 1` without ORDER BY (server.js:5452) vs the service ORDER BY id DESC (:53).
- Export CSV header, limit 10000, unescaped quotes (:5557-5563).
- data-access defaults (limit 100) and containsPii mapping (:5517-5524).
- summary SQL (:5618-5625).
- Archive INSERT ... SELECT *, NOW() with DELETE only if archived > 0 (:159-177).
- Cleanup branch on delete_archived, `|| 90` (server.js:5657-5660).
- Inserts of the three frontend routes, fixed categories, `req.sessionID || null`.
- Interceptor skip list at :14 and 500-char truncation at :36-37.
- Middleware sanitize, status rule, new_values for POST/PUT only.
- Retention defaults at :58-62.

## Missed (minor, optional)
1. data_access_log_archive.user_id is NOT NULL (dump :2972; addAuditRetentionAndArchive.js:131) while data_access_log.user_id is nullable in prod (:2936; the migration declares it NOT NULL). Archiving any NULL user_id row would abort the archive transaction, the same failure class as the entity_id flag. Inferred; needs a data check.
2. DELETE cleanup with delete_archived uses `archive_cutoff_days || 90`, but archive_cutoff_days has no validation. A negative or string value is passed straight to setDate. Trivial.

## Full-file rewrite
Nothing from round 1 was lost. Every first-pass finding is still present.
