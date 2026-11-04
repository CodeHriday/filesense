# AUD - Audit logging

## Summary
Global Express middleware logs every API request to `audit_log` (server.js:605-606, backend/middleware/auditMiddleware.js:124). 13 admin/JWT routes in server.js:5430-5807 plus a 14th frontend route cover queries, CSV export, retention settings, archive/delete, and frontend event capture. The inventory says 15 HTTP routes but lists 14 (inventory.md:83-96). The FE page /audit-trail (src/pages/AuditTrail.jsx) and src/utils/auditInterceptor.js consume them.

Admin check `requireAdmin` (server.js:5417-5427) uses `userHasAdminAccess` (server.js:380-403): role Admin/admin (string or object name/role_name), or permission `users:write` or `roles:write`. Returns 403 `{error:'Access denied. Admin privileges required.'}`.

## Entry points

### Global audit middleware (server.js:606; auditMiddleware.js:124-224)
- Trigger: every request except paths matching /health, /ping, /favicon, /static, /assets, /api/queue/metrics (auditMiddleware.js:111-121). Regexes are unanchored, so any path containing e.g. "/health" is skipped.
- Auth: none (runs for all). It is registered at server.js:606 after the session setup, before routes. `req.user` is read at request start (auditMiddleware.js:140-142). Per-route `authenticateToken` is applied on routes (e.g. server.js:5430), so it probably runs after this middleware (see BUG).
- Behaviour: on `res.on('finish')` writes one row through `auditService.logAction` (auditMiddleware.js:216, 197-209). Status is 'SUCCESS' if statusCode is >=200 and <400, else 'FAILURE' (:176). Action: POST gives UPLOAD (path has /upload), EXECUTE (/execute), else CREATE; PUT/PATCH gives UPDATE; DELETE gives DELETE; GET gives DOWNLOAD (/download), VIEW (/preview), else READ (:28-42). Entity type is the first matching of about 46 `/api/...` regexes, else 'system' (:44-100). Entity id is params.id, fileId, scheduleId, groupId or body.id (:102-109). Metadata holds duration_ms, statusCode, sanitized body, query params, userAgent, referrer; on status >=400 it adds the error from the response (:182-195). `new_values` is the sanitized body for POST/PUT only (:202-204), not PATCH.
- Sanitizing: top-level body keys only, replaced with '***REDACTED***': password, token, secret, apiKey, api_key, accessToken, refreshToken, privateKey (:8-23). Nested objects and query params are not redacted. Exact-case match only.
- Errors: logging errors are caught and console.error'd (:211-213, 217-219). The request is never failed.
- Insert: AuditService.logAction inserts into audit_log (AuditService.js:90-120), with old/new values and a computed diff (:85). Insert errors are rethrown (:123-126).

### GET /api/audit/logs (server.js:5430-5478)
- Auth: JWT + admin. Inputs (query): userId, entityType, entityId, actionType, startDate, endDate, limit, offset (default 0). No validation; `new Date(startDate)` and `parseInt` are unchecked.
- Rule: if startDate is missing, start = now minus `retention_days` from `audit_retention_settings LIMIT 1` (no ORDER BY), default 30; also 30 days if the query fails (:5448-5460).
- Filters (AuditService.js:403-432): userId is ILIKE `%x%` on user_email or user_id cast to text. Others are exact. timestamp >= start, <= end. ORDER BY timestamp DESC. LIMIT/OFFSET only if limit is given (:438-448); no limit means all rows.
- Output: JSON array of audit_log rows. 500 `{error:'Failed to fetch audit logs'}`.

### GET /api/audit/logs/:auditId (server.js:5480-5494)
Auth JWT + admin. `SELECT * FROM audit_log WHERE audit_id=$1`. 404 `{error:'Audit log not found'}`. No id validation.

### GET /api/audit/executions/:executionId (server.js:5496-5506)
Auth JWT + admin. Returns execution_audit rows for execution_id, ORDER BY timestamp ASC (AuditService.js:465-472).

### GET /api/audit/data-access (server.js:5508-5536)
Auth JWT + admin. Query: userId, fileId, containsPii ('true'/'false', else no filter), startDate, endDate, limit default 100, offset default 0. Exact userId/fileId match (AuditService.js:495-503). Returns data_access_log rows ORDER BY timestamp DESC. No default date range here.

### POST /api/audit/export (server.js:5538-5574)
Auth JWT + admin. Body: userId, entityType, entityId, actionType, startDate, endDate. Fixed limit 10000 (:5557). No default date range. Returns CSV `audit-logs.csv`, header 'Timestamp,User ID,User Email,Action Type,Entity Type,Entity ID,Status,IP Address'. Fields are wrapped in double quotes with no escaping of embedded quotes (:5563). Timestamp is the Date's string form. Frontend page posts its filters to it (AuditTrail.jsx:350).

### GET /api/audit/retention-settings (server.js:5579-5587)
Auth JWT + admin. Latest row `ORDER BY id DESC LIMIT 1`, else defaults `{retention_days:30, auto_archive_enabled:true, auto_delete_enabled:false}` (auditRetentionService.js:50-62).

### PUT /api/audit/retention-settings (server.js:5589-5604)
Auth JWT + admin. Body retention_days, auto_archive_enabled, auto_delete_enabled. No validation; undefined values are passed to the UPDATE. Updates the latest row only in a transaction, sets updated_at=NOW() (auditRetentionService.js:72-106). If no row exists, `rows[0]` is undefined and `res.json(undefined)` is sent.

### GET /api/audit/statistics (server.js:5606-5614)
Auth JWT + admin. For each of 6 tables (audit_log, execution_audit, data_access_log, config_change_history, security_audit_log, frontend_audit_log) returns count/min/max timestamp; for the 5 with archive tables, count, oldest, last archived_at; plus retention_settings (auditRetentionService.js:111-142).

### GET /api/audit/summary (server.js:5616-5636)
Auth JWT + admin. Counts over all of audit_log: total, success (status='SUCCESS'), failure (status IN 'FAILURE','ERROR'), today (DATE(timestamp)=CURRENT_DATE, DB server timezone). Returns {total, successCount, failureCount, todayEvents}.

### POST /api/audit/archive (server.js:5638-5649)
Auth JWT + admin. Body retention_days (optional, falsy uses stored setting). Cutoff = now minus N days (setDate, server local time) (auditRetentionService.js:195-196). For each table with an archive: INSERT ... SELECT *, NOW() into the archive, then DELETE rows older than cutoff if any were archived (:153-180). frontend_audit_log has no archive and is skipped (:154-157). One transaction; per-table errors are caught and recorded in results (:213-218). Sets last_archive_run. Returns {success,totalArchived,cutoffDate,details}.

### DELETE /api/audit/cleanup (server.js:5651-5668)
Auth JWT + admin. Body retention_days, delete_archived, archive_cutoff_days. If delete_archived is truthy: delete from the 5 archive tables where archived_at < now minus (archive_cutoff_days || 90) days (auditRetentionService.js:260-327). Otherwise: permanently delete from ALL 6 tables, including the live ones and frontend_audit_log, where timestamp < cutoff, with no archiving; sets last_cleanup_run (:332-407). The body is sent with DELETE; the page does this (AuditTrail.jsx:238, 261).

### POST /api/audit/frontend-error, /frontend-interaction, /frontend-api-error (server.js:5671-5807)
- Auth: JWT only (any user). No validation or size limits on body.
- Each inserts one row into frontend_audit_log with user_id and email from req.user, session_id `req.sessionID || null`. Fixed event_type/category: ERROR/'frontend_error'; event_type default 'INTERACTION' / 'user_interaction'; 'API_ERROR'/'api_failure'. Returns `{success:true}`; 500 `{error:'Failed to log frontend ...'}`.
- Callers: /frontend-api-error from auditInterceptor.js:41. No caller found in my reads for the other two (see Open questions).

### FE: /audit-trail (src/pages/AuditTrail.jsx; route src/App.jsx:404)
Loads retention settings, sets date range to the last retention_days (default 30) (:111-127), fetches logs with no limit (:157-159), then statistics and summary. Filtering and pagination are client-side (:336 slice). Provides retention form, archive (confirm), permanent delete (confirm), export. Interceptor src/utils/auditInterceptor.js: axios response-error interceptor posts every failed request to /api/audit/frontend-api-error, except urls containing /api/audit/frontend-api-error, /api/auth/login, /api/auth/logout (:14); truncates request/response data to 500 chars (:36-37); initialized once (:3-8).

## Data touched
audit_log (read/write), execution_audit, data_access_log, config_change_history, security_audit_log, frontend_audit_log, the 5 *_archive tables, audit_retention_settings (fields retention_days, auto_archive_enabled, auto_delete_enabled, last_archive_run, last_cleanup_run, updated_at). Schemas in the migrations per inventory.md:975-976 (not read).

## Flags
- BUG: middleware runs before per-route `authenticateToken` (server.js:606 vs 5430), but reads `req.user` at start (auditMiddleware.js:140-142), so userId/email/role are likely null for JWT routes. Only a fallback in AuditService.getCurrentUser(context) may fill them (AuditService.js:84; not read). Needs a runtime check.
- BUG: audit_retention_settings read with `LIMIT 1` and no ORDER BY at server.js:5452, but the service uses `ORDER BY id DESC` (auditRetentionService.js:53): can pick different rows.
- BUG: PUT retention-settings with no rows returns empty body; no validation lets null/undefined/negative retention_days be written (auditRetentionService.js:88-90). Negative or null days would give a future/NaN cutoff in archive/delete.
- BUG: CSV export does not escape quotes or neutralize formula injection (server.js:5563). SECURITY as well.
- BUG: `auto_archive_enabled` / `auto_delete_enabled` are stored but nothing in backend reads them to run a job (grep shows only the service/migration); the flags are inert.
- BUG: archiveOldRecords reads settings via `pool` (separate connection) while inside a transaction on `client` (auditRetentionService.js:191-193); and a per-table failure inside a transaction aborts the PG transaction, so later statements fail and COMMIT acts as ROLLBACK, yet the results report success=true.
- BUG: auditInterceptor.js:36 `JSON.parse(JSON.stringify(data)).substring` throws if request data is an object (not a string); caught at :42, so the API error is then not logged.
- BUG: NaN: `parseInt(limit)` / `parseInt(offset)` unvalidated (server.js:5470, 5527).
- SECURITY: the three frontend routes accept any authenticated user, unbounded body, unvalidated; any user can write arbitrary audit rows (forged events, log flooding). Stored raw error_stack/metadata.
- SECURITY: the audit trail is deletable: admin DELETE /api/audit/cleanup permanently removes audit data, and deleting in the same transaction removes evidence of itself only via later rows (cleanup is itself logged by middleware afterward, as entity 'audit').
- SECURITY: body redaction is top-level and case-sensitive (auditMiddleware.js:19-23); nested credentials, e.g. `{auth:{password}}`, are stored in plain text in metadata.requestBody and new_values. Query params are also logged unredacted (:185). Also logged: request bodies of every POST/PUT (including uploads' metadata).
- DUPLICATE: `userHasAdminAccess` defined in server.js:380 and backend/utils/permissionHelpers.js:80 (differences not compared). Retention default 30 appears in server.js:5454/5458, service :59, FE :14/:116.
- DUPLICATE: audit_retention_settings / retention logic partly overlaps `/api/retention-policies` (different feature; not compared).
- DEAD: backend/services/auditCleanupService.js has no require in backend/ (grep on backend/*.js found none); server.js has no match either. Status as "possibly dead" is confirmed for those two locations only; coverage files list it, which may mean tests load it.
- UNCLEAR: the 'ERROR' status is counted as failure in the summary (server.js:5622), but the middleware only writes SUCCESS/FAILURE; other callers may write ERROR.
- UNCLEAR: determineAction treats GET with path containing '/preview' as VIEW and any POST not upload/execute as CREATE (including login, search, etc.).

## Domain terms
Audit log / audit trail / audit_log; execution audit; data access log; config change history; security audit log; frontend audit log; retention (retention_days); archive vs cleanup (delete); archived_at; entity type / entity id; action type (CREATE/READ/UPDATE/DELETE/UPLOAD/EXECUTE/DOWNLOAD/VIEW); status SUCCESS/FAILURE/ERROR; PII (contains_pii).

## Open questions
1. Does `req.user` exist when the audit middleware reads it (server.js:606 vs per-route auth)? Check AuditService.getCurrentUser.
2. Who calls /frontend-error and /frontend-interaction? No caller found in files read.
3. Who writes security_audit_log, config_change_history, data_access_log, execution_audit (AuditService methods at lines ~190-390 not read)?
4. Is any scheduler honoring auto_archive_enabled / auto_delete_enabled?
5. Is auditCleanupService.js referenced by tests only, or from non-js places?
6. Do the two `userHasAdminAccess` copies differ?
7. Migration schemas (createAuditTables.js, addAuditRetentionAndArchive.js) not read, including whether archive tables have a compatible column order for `SELECT *, NOW()`.
8. Does `res.send`/`res.json` override interplay (CSV via res.send) affect logging: not tested.
