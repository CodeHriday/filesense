# LEDG verify (final, after fix round 2)

Verdict: PASS. Checked 34, wrong 0, unsupported 1, missed 2 minor.

## Coverage
All 16 inventory entry points (8 ledger, 8 file-audit) have subsections. The inventory rows for `audit_ledger*` and `file_audit_details` are covered. None are missing.

## Round-2 items
1. Hash string `{"payload":{"payload":{}},"prev_hash":...}`: CORRECT. `computeHash` (ImmutableAuditLedgerService.js:11) uses the sorted top-level keys `["payload","prev_hash"]` as a replacer whitelist. That whitelist applies at every nesting level, so inside `hashPayload` only the `payload` key survives. The engine's payload is always an object (a spread, jobExecutionEngine.js:926-930), so the inner value is `{}`. Message, actor and job_id are not covered.
2. Insert hashes `timestamp.toISOString()` (:85) and verify hashes `entry.event_timestamp.toISOString()` (:472): CORRECT.
3. Dump `event_timestamp timestamp` (:2696) and `payload jsonb` (:2695): CORRECT. I read these in attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql. The file is under attached_assets/, not the repo root.
4. `audit_ledger_sequence_pkey PRIMARY KEY (tenant_id)` at dump :2747: CORRECT. The race hedge holds. The insert-after-empty-UPDATE at service :57-63 would fail on the PK for the loser. OQ 5 is resolved correctly.
5. Other callers: CORRECT. BulkProfilingService.js:922 is `captureFileSchema` and :934 is `captureFileAudit`. fileProcessingWorker.js:1181 is `captureFileSchema` and :1201 is `captureFileAudit`. Imports are at :15 and :18. No other `appendEntry` caller exists in backend (the only other hit is a test mock).
6. BUG `parent_audit_id` always null for engine writes: CORRECT.
   - `captureFileAudit` reads `parentAuditId` only from `options` (fileAuditService.js:69, :126).
   - The engine passes it inside `auditData` (jobExecutionEngine.js:4276).
   - `sourceAuditId` is the whole `{success, auditId, correlationId}` result object (:4207, fileAuditService.js:147-151).
   - The HTTP route passes it via options (fileAudit.js:27).
7. BUG verify NaN gives 500: CORRECT. `parseInt(start_sequence)` is at auditLedger.js:114 and `parseInt(end_sequence)` at :115. The catch at :119-125 returns 500. The loop checks only `prev_hash` linkage (service :436-457), so sequence gaps are not detected.

## Other claims checked (all CORRECT unless noted)
- `verified_by` literal 'SYSTEM' and `duration_ms` 0 (service :443, :498).
- The hash-mismatch path returns without writing a verification row (:478-486).
- The success row uses `endSequence || last row's sequence` (:501).
- Export hard cap of 10000 and the unescaped Content-Disposition (auditLedger.js:156, :161, :169, :190, :195, :203).
- Stats runs four queries (:221-253).
- `verification-history` orders by `created_at DESC` (service :520-528).
- Routes in fileAudit.js are registered in the stated order: `/:fileId` at :139 before `/unique-mappings` at :172, so the latter is shadowed.
- `captureFileAudit`: 3 retries, backoff `1000*2^(n-1)`, `retention_until` from `retentionMonths || 12`, `status || 'success'`, processing duration, 32 columns, failure gives 500 via the `result.success` check (fileAudit.js:30-37).
- Route overwrites userId, userEmail, ipAddress and sessionId (:20-23).
- `cleanupOldAudits` default of 90 days, with `RETURNING audit_id` at :648 and `schema_id`/`created_dt` at :654-661.
- Dump `file_schema_details` (:3279-3295) has `id`, `file_schema_id` and `created_ts`, with UNIQUE(file_id, file_schema_id) at :3293. The `file_audit_details` table at :4647 has `id`.
- Dump triggers at :2726-2733: update and delete only, no TRUNCATE.
- `logJobExecution` (jobExecutionEngine.js:896-939): the appendEntry call at :912 is wrapped in try/catch (:932-935), level is upper-cased (:924), and it runs once per log line.
- Engine `captureFileAudit` callers at :1427, :2378, :4207, :4258; `captureFileSchema` at :4194.

## UNSUPPORTED (1)
- The BUG text "(export.js :164-170 in the route; service :578-585)" has a garbled citation. "export.js" is not a file. The route code is auditLedger.js:164-170. Cosmetic, but the citation should be fixed.

## Missed (minor, not blocking)
- `captureFileAudit` never throws. After exhausting retries it returns `{success:false, error, correlationId}` (fileAuditService.js:171-177). Engine callers ignore the return value, so the engine drops audit failures silently. The notes describe only the HTTP 500 path.
- The hash shape `{"payload":{"payload":{}}}` assumes an object payload. With a null payload the inner value would be `{"payload":null}`. The engine always supplies an object, so this is moot for current writers, but the note could say so.

## Full-file rewrite
Nothing was lost compared with the prior content. The summary, entries 1-16, data table, flags, domain terms and open questions are all present.
