# LEDG - Immutable audit ledger & file audit

## Summary
Two separate audit subsystems.
1. Hash-chained ledger (`audit_ledger`), exposed at `/api/audit-ledger`, with a per-tenant sequence table and a verification log. It is written only by `jobExecutionEngine` (`appendEntry` at backend/services/jobExecutionEngine.js:912). The HTTP API only reads, verifies and exports.
2. Per-file audit (`file_audit_details`, `file_schema_details`), exposed at `/api/file-audit`.

Both routers are mounted behind `authenticateToken` only (server.js:5280, :5292). No role or permission check exists on the ledger routes. The file-audit routes check roles or projects only in the list handlers.

Frontend callers: src/api/auditLedgerService.js; src/pages/Monitor.jsx:91, :282 (file-audit) and the ledger tab at :212-213 (entries, stats), :231 (verify), :243 (export by job); src/pages/ProcessedFileCatalog.jsx:41, :194.
- The ledger tab calls `verifyAuditLedger()` with no arguments (Monitor.jsx:231). The client then sends `tenant_id:'default'`, `start_sequence:1`, `end_sequence:null` (auditLedgerService.js:56-60). So every click is a full scan of the 'default' tenant from sequence 1 with no end, and it writes a verification row.
- The export always passes `includeVerification=true` (Monitor.jsx:243), so the URL always carries `include_verification=true` (auditLedgerService.js:75) and an extra verify (with its row write) runs on every export.
- The entries filters sent by the tab are only `logLevel`, `actionType`, `jobId` plus limit and offset (Monitor.jsx:201-209). Stats are called with the default tenant (:213).
- No UI caller exists for `getAuditLedgerByJobId`, `getAuditLedgerByCorrelationId`, `getVerificationHistory` or `exportAuditLedgerByCorrelation` (auditLedgerService.js:33, :44, :66, :84; Monitor.jsx:6 imports only four functions). So `/job/:id`, `/correlation/:id`, `/verification-history` and `/export/correlation/:id` are reached from nowhere in src.
- Both routers sit behind `authenticateToken` imported at server.js:406 from `./backend/src/middleware/authenticate`. That middleware merges the DB user into `req.user`, sets `req.user.permissions`, and overwrites `req.user.roles` with `effectiveRoles` when present (backend/src/middleware/authenticate.js:53-67). Neither auditLedger.js nor fileAudit.js imports its own authenticate (grep found none).

## Entry points

### Ledger (backend/routes/auditLedger.js, `ImmutableAuditLedgerService`)
All handlers share these traits.
- Auth: JWT only (server.js:5292).
- Errors: 500 `{success:false, error, details: error.message}`.
- `tenant_id` comes from the client and defaults to `'default'` (:27, :106, :133, :218).
- There is no ownership or tenant check against the caller.

1. GET `/api/audit-ledger/` (:5)
   - Inputs: query `tenant_id`, `job_id`, `correlation_id`, `actor_id`, `action_type`, `action_category`, `entity_type`, `entity_id`, `log_level`, `start_date`, `end_date`, `limit` (default 100), `offset` (default 0).
   - Validation: none. `parseInt` is unchecked, so a non-numeric value gives NaN.
   - Rules (ImmutableAuditLedgerService.js:292-387):
     - `job_id` is matched as `job_id::text ILIKE %x%` (:313).
     - The other filters use exact match.
     - Date filters use `event_timestamp >=` and `<=`.
     - Order is `sequence_number DESC`.
     - A separate COUNT query runs for the total.
   - Output: `{success, entries, total, limit, offset}`.
   - There is no cap on `limit`.
2. GET `/job/:jobId` (:53)
   - Defaults: limit 1000, offset 0.
   - Queries `WHERE job_id = $1` (not scoped by tenant), `ORDER BY sequence_number ASC` (service :224-256).
   - No UI caller (see Summary).
3. GET `/correlation/:correlationId` (:77)
   - Same as above, filtered by `correlation_id` (service :258-290). Not scoped by tenant.
   - No UI caller (see Summary).
4. POST `/verify` (:101)
   - Body: `tenant_id` (default 'default'), `start_sequence` (default 1), `end_sequence` (default null).
   - Rules (service :389-518):
     - Loads all rows with `sequence_number >= start` (and `<= end` if given) in ascending order.
     - If there are no rows, returns `verified:true, entriesVerified:0`.
     - For `start > 1`, the expected prev_hash is the record_hash of `start-1`. If that row is missing, expected stays null.
     - Per entry: if `prev_hash !== expectedPrevHash`, it inserts a `FAILED` row into `audit_ledger_verification` and returns `verified:false`, `failedAtSequence`, `error:'Chain integrity broken: prev_hash mismatch'`.
     - Then it recomputes the hash, and on mismatch returns `error:'Record hash mismatch: data may have been tampered with'`. This path writes NO verification row (:478-486).
     - On success it inserts a `PASSED` row.
     - `verified_by` is the literal 'SYSTEM' (:443, :498), not the caller. `duration_ms` is hard-coded 0.
     - The route does `parseInt(start_sequence)` and `parseInt(end_sequence)` with no check (auditLedger.js:114-115). A non-numeric value gives NaN, a pg error and a 500.
     - Only `prev_hash` linkage is checked, so gaps in the sequence (deleted rows) are not detected. The success row uses `endSequence || last row's sequence`.
   - Output: HTTP 200 even when `verified:false`.
   - Side effects: DB insert into `audit_ledger_verification`.
   - Any authenticated user can trigger a full-tenant scan, which has no row limit.
   - The only UI caller (Monitor.jsx:231) sends all defaults: tenant 'default', sequence 1, no end. Each click writes a verification row.
5. GET `/verification-history` (:129)
   - Params: `tenant_id`, `limit` (default 50).
   - Returns `{success, verifications}` from `SELECT * ... ORDER BY created_at DESC` (service :520-538).
   - No UI caller (see Summary).
6. GET `/export/job/:jobId` (:148) and 7. GET `/export/correlation/:correlationId` (:182)
   - Params: `format` (default 'json'; 'csv' switches), `include_verification` (the string 'true' enables it).
   - The UI always sends `include_verification=true` on the job export (Monitor.jsx:243). The correlation export has no UI caller.
   - Fetches at most 10000 entries (:156, :190). Hard cap, with no warning if truncated.
   - CSV (service :540-569):
     - Fixed 16 columns.
     - Only `message` is quoted/escaped. Other fields, such as entity_name or actor_email, are NOT escaped (commas break the CSV).
     - The CSV excludes payload, prev_hash and parent_entry_id.
   - JSON: `{exportedAt, totalEntries, entries[, verification]}`, pretty-printed with 2-space indent (service :571-588).
   - With `include_verification`, it calls `verifyChainIntegrity(entries[0].tenant_id, firstSeq, lastSeq)`. This also writes a verification row.
   - Headers: `Content-Disposition: attachment; filename="audit_ledger_<id>.csv|json"`. The path param is interpolated unescaped into the header.
   - Export entries come back in ascending sequence order, but filtering by job/correlation can span non-contiguous sequences, so verification over first..last would cover other jobs' entries too.
8. GET `/stats` (:216)
   - Param: `tenant_id`.
   - Makes four raw SQL queries on `audit_ledger` and `audit_ledger_sequence`.
   - Returns `{success, stats:{total_entries, first_entry, last_entry, unique_jobs, unique_correlations, unique_actors, sequence (or {current_sequence:0}), byLevel, byCategory}}`.

### File audit (backend/routes/fileAudit.js, backend/services/fileAuditService.js)
Auth is JWT (server.js:5280). The route-level checks are noted per entry.

9. POST `/api/file-audit/` (:15)
   - Body: arbitrary audit object.
   - The server overwrites `userId`, `userEmail`, `ipAddress` and `sessionId` from the request (:20-23). `req.session` is probably never set, so `sessionId` is undefined (UNCLEAR).
   - `captureFileAudit` (service :65-178):
     - Generates `correlationId` (uuid v4) if absent.
     - Retries 3 times (`retryAttempts = 3`) with exponential backoff of `1000 * 2^(n-1)` ms (1s, then 2s, with no wait after the last attempt).
     - Per attempt it runs BEGIN, INSERT into `file_audit_details` (32 columns), COMMIT.
     - `retention_until = now + (retentionMonths || 12) months` (:88-90). `retentionMonths` is client-supplied.
     - `status` defaults to `'success'` (:134).
     - `processing_duration_ms` is `auditData.processingDurationMs || (Date.now() - startTime)` (:133).
     - `created_by` is `auditData.createdBy`, which the route never sets, so it is client-supplied or null.
   - Output: 200 `{success, auditId, correlationId}`. On failure, 500 `{error:'Failed to capture audit', details}`.
   - Validation: none (no required fields).
   - `captureFileAudit` also has internal callers in jobExecutionEngine.js at :1427, :2378, :4207, :4258 (import at :15), so the engine writes these rows directly, not only via HTTP. Other callers: backend/services/BulkProfilingService.js:934 (import :15) and backend/workers/fileProcessingWorker.js:1201 (import :18).
10. POST `/api/file-audit/schema` (:51)
    - Body: `fileId`, `fileName`, `fileSchema`, `correlationId`. `createdBy` is set from `req.user.id`.
    - Rules (service :185-296):
      - `schemaHash` is the sha256 of `JSON.stringify(fileSchema)`. This is key-order sensitive.
      - If a row with the same hash exists AND `active_flag` is true, it returns `{isNew:false, schemaId}`.
      - Otherwise it deactivates all active schemas for that file, computes the diff against the previously active one (added/removed by `name`, modified only when `type` differs), and inserts a new row with `active_flag` true.
      - `file_schema_id = schema_<fileId>_<Date.now()>`.
    - A hash match with `active_flag` false (a rollback to an old schema) creates a new row rather than reactivating.
    - Output: `{success, schemaId, isNew, hasChanges, diff}`. Errors give 500.
    - A missing `fileSchema` makes `JSON.stringify(undefined)` return undefined, and `crypto.update(undefined)` throws in `calculateSchemaHash` (service :12-14). That call is at :194, outside the `try` that starts at :197. The route's catch returns 500, with no 400.
    - Prod has `UNIQUE (file_id, file_schema_id)` on `file_schema_details` (prod dump :3293), and `file_schema_id` is built from `Date.now()` (:195).
    - `captureFileSchema` also has internal callers in jobExecutionEngine.js:4194, BulkProfilingService.js:922 and fileProcessingWorker.js:1181.
11. GET `/api/file-audit/:auditId/logs` (:82)
    - Param: `limit` (default 100).
    - Looks up `file_audit_details` by id, giving 404 `{error:'Audit record not found'}` if absent.
    - Then reads `transformation_logs WHERE job_id = <audit.correlation_id>`, ordered by `timestamp ASC` with the limit. If correlation_id is null it returns an empty list.
    - Output: `{auditId, jobId, logs[{timestamp, level, message, metadata}], total}`.
    - No project/ownership check (SECURITY).
12. GET `/api/file-audit/:fileId` (:139)
    - Params: `limit` (default 100), `offset` (default 0), `includeSchema` (anything other than the string 'false' includes the schema).
    - Service :301-345: filters `fad.file_id = $1`, orders by `created_dt DESC`.
    - `total` is `result.rowCount`, the page size, not the overall count (BUG).
    - No project/ownership check.
    - Declared before `/unique-mappings` and `/` order matters. See the flags.
    - Because it is a one-segment pattern registered at :139, it swallows any single-segment GET registered after it (for example `GET /unique-mappings` and a GET to `/cleanup`), treating the segment as a file id.
13. GET `/api/file-audit/unique-mappings` (:172)
    - UNREACHABLE: `/:fileId` (:139) is registered first and matches it, so this handler never runs (DEAD, per the inventory note).
    - If it were reached: it sets no-cache headers, returns 401 without `req.user.id`, and takes `load_type` and `file_role`.
    - The handler destructures `{ getUserProjects, userHasAllProjectAccess }` from `../middleware/requireProjectAccess` (:192). That module exports only `requireProjectAccess, checkProjectMembership, getUserProjects` (requireProjectAccess.js:435-439). `userHasAllProjectAccess` lives in backend/utils/permissionHelpers.js:60. In the route it is `undefined`, so calling it (:193) would throw a TypeError and the handler would return 500.
    - Intended logic: non-admin access limited via `getUserProjects`; a user with no projects gets `{success:true, mappings:[], projects:[]}`.
    - It joins `tj.mapping_id = CAST(tm.id AS VARCHAR)` (:232), whereas getAuditRecords joins `tj.mapping_id = tm.mapping_id` (service :486).
    - Logs the query and results with console.log.
14. GET `/api/file-audit/` (:272)
    - Returns 401 `{error:'Authentication required'}` if there is no `req.user.id`.
    - Query: `startDate`, `endDate`, `status`, `source`, `fileType`, `correlationId`, `mappingName`, `load_type`, `file_role`, `search`, `limit` (default 100), `offset` (default 0).
    - The route passes `userId`, `userRoles` (default []) and `userPermissions` (default []) (:312-313).
    - Service `getAuditRecords` (:350-630):
      - Admin is `userRoles.includes('Admin')` OR any permission in `['users:write','roles:write','project_management:write']` (:372-377).
      - Non-admins are filtered to projects from `getUserProjects`. Zero projects returns an empty result.
      - Project predicate: `f.project_id` OR `tm.project_id` OR `vm.project_id` `= ANY(...)`.
      - Filters: `status`, `source`, `fileType`, `loadType` and `fileRole` are exact. `correlationId` is a `::text ILIKE %x%` partial match. `mappingName` is ILIKE on `COALESCE(fad.mapping_name, tm.mapping_name)`. `search` is ILIKE on mapping_name or file_name.
      - Date filters are `fad.created_dt` `>=` and `<=`.
      - The query uses `DISTINCT ON (fad.id)` then `ORDER BY created_dt DESC`.
      - It joins files, projects, schedules, mapping groups, n-step workflows and visual mapping tables.
      - `quality_score` is `f.quality_score`, else computed as `(distinct rules - distinct violated rules) / distinct rules * 100`, rounded to 1 decimal, null if there are no rules (:514-534).
      - `column_stats` comes from `file_columns` (matched on `file_role`), falling back to `file_schema_details.file_schema->'columns'`.
    - Output: `{success, audits, total}`. `total` is a separate COUNT query.
    - Errors give 500.
    - There is no cap on `limit` (FILE.md also notes this).
    - The count query joins vme/vm, so the row multiplication could make `total` differ from the DISTINCT row count (UNCLEAR).
15. DELETE `/api/file-audit/correlation/:correlationId` (:337)
    - Runs `DELETE FROM file_audit_details WHERE correlation_id = $1 RETURNING id`.
    - Output: `{success, message:'Profiling results deleted successfully', deletedCount}`.
    - No role, project or ownership check (SECURITY). Any authenticated user can delete any audit rows.
    - The ledger is not touched.
    - Used by ProcessedFileCatalog.jsx:194.
16. DELETE `/api/file-audit/cleanup` (:367)
    - Calls `cleanupOldAudits(pool)` with the default `retentionDays = 90` (service :635).
    - Intended: delete `file_audit_details WHERE created_dt < now - 90 days`, ignoring each row's own `retention_until` (12 months by default) (DUPLICATE/UNCLEAR), and delete inactive, unreferenced `file_schema_details` older than the cutoff.
    - BUG, confirmed against the prod dump: the first statement uses `RETURNING audit_id` (service :645-649), but prod `file_audit_details` (dump :4647-4684) has `id` and no `audit_id`. The statement errors, the catch rolls back and the route returns 500. The second statement (:652-662) uses `schema_id`, `created_dt` and `RETURNING schema_id`, but prod `file_schema_details` (dump :3279-3295) has `id`, `file_schema_id` and `created_ts` only. So the endpoint always returns 500 and the 90-day purge never runs.
    - Intended output: `{message:'Cleanup completed successfully', deletedCount}`.
    - No role check (SECURITY): any authenticated user can call it, though it currently deletes nothing.
    - No caller was found in src (see Open questions).

## Data touched
| Table | Op | Where |
|---|---|---|
| audit_ledger | W (insert via appendEntry/appendBatch), R | ImmutableAuditLedgerService.js:91, :173, :226-368, :221 |
| audit_ledger_sequence | R/W (per tenant: current_sequence, last_hash) | ImmutableAuditLedgerService.js:47-114, :139, :198; auditLedger.js:233 |
| audit_ledger_verification | W, R | ImmutableAuditLedgerService.js:438, :493, :522 |
| file_audit_details | W, R, D | fileAuditService.js:93, :309, :479-:582, :645; fileAudit.js:89, :343 |
| file_schema_details | W, R, U (active_flag), D | fileAuditService.js:203-270, :652 |
| transformation_logs | R | fileAudit.js:104 |
| files, projects, transformation_jobs, transformation_mappings, schedules, mapping_groups, mapping_group_executions, n_step_workflows, n_step_workflow_runs, visual_mapping_executions, visual_mapping_defs, logical_file_groups, file_columns, file_quality_rules, quality_rule_violations | R (joins) | fileAuditService.js:479-607 |

The migration (backend/migrations/createImmutableAuditLedger.js:140-180) adds BEFORE UPDATE and BEFORE DELETE row triggers on `audit_ledger` that raise exceptions. TRUNCATE and DROP are not blocked by these. The prod dump has the two row triggers and no TRUNCATE trigger (dump :2726-2733). The migration function is invoked only from its own `require.main` block (createImmutableAuditLedger.js:229, :235). The service does not itself UPDATE/DELETE `audit_ledger`.

Ledger writers: appendEntry is called only from jobExecutionEngine.js:912 (action_type 'JOB_EXECUTION', category 'EXECUTION', entity_type 'TRANSFORMATION_JOB', actor from `ledgerContext`). It is wrapped in try/catch, so failure is logged and never fails the job (:932-935). It is invoked once per job log line. `appendBatch` is never called (DEAD).

Writers of `file_audit_details` and `file_schema_details` via `captureFileAudit` / `captureFileSchema` are the HTTP routes, jobExecutionEngine.js, BulkProfilingService.js:922/:934 and fileProcessingWorker.js:1181/:1201.

## Flags

### BUG
- **Hash does not cover record content (high severity).** `computeHash` is `JSON.stringify(data, Object.keys(data).sort())` (ImmutableAuditLedgerService.js:11). An array replacer is a property-name whitelist applied at every nesting level. `computeRecordHash` (:15-21) passes `{prev_hash, payload}`, so the whitelist is `["payload","prev_hash"]`. `hashPayload` (:72-87) itself has a key named `payload` (:84), which is on the whitelist, so it survives; every other key inside `hashPayload` (entry_id, message, actor_id, ...) is dropped. The hash is effectively `sha256({"payload":{"payload":{}},"prev_hash":<prev or GENESIS>})`, where the inner `{}` is the job payload with its keys stripped (a job payload key literally named `payload` or `prev_hash` would be hashed). Message, actor and job_id are not covered. The same function is used at append (:89) and verify (:476). Consequences (from reading the code, not run): tampering with message/actor/etc. is not detectable by verify's hash check (:476-486); only prev_hash linkage is checked. The hash is deterministic by chain position alone and needs no secret, so anyone with DB write access can rewrite rows or forge a whole consistent chain and verify will pass (SECURITY). The only protection is the UPDATE/DELETE triggers; there is no TRUNCATE trigger (prod dump :2726-2733).
- Verify does not log hash-mismatch failures to `audit_ledger_verification`, while chain-link failures are logged (:478-486 vs :437-448).
- `getFileAuditHistory` `total` = `rowCount` of the page, not the total (fileAuditService.js:335).
- `cleanupOldAudits` uses columns that do not exist in prod: `RETURNING audit_id`, `schema_id` and `file_schema_details.created_dt` (service :648, :654-661). Prod has `file_audit_details.id` and `file_schema_details.id, file_schema_id, created_ts` (dump :4647-4684, :3279-3295). `DELETE /api/file-audit/cleanup` therefore always returns 500 and the purge never runs (see entry 16).
- Hash recomputation in verify uses `entry.event_timestamp.toISOString()` from the stored timestamp (:472), and insert hashes `timestamp.toISOString()` (:85), so both sides use the same form. `event_timestamp` is a plain `timestamp` without tz and `payload` is jsonb (dump :2695-2696). This is moot while these fields are not hashed in effect.
- Verify does `parseInt(start_sequence)` and `parseInt(end_sequence)` unchecked (auditLedger.js:114-115); NaN gives a pg error and a 500. Verify only checks `prev_hash` linkage, so gaps in the sequence (deleted rows) are not detected.
- `parent_audit_id` is always null for engine writes. `captureFileAudit` reads `parentAuditId` only from its third `options` argument (fileAuditService.js:69, :126); only the HTTP route passes it that way (fileAudit.js:27). The engine passes `parentAuditId: sourceAuditId` inside `auditData` (jobExecutionEngine.js:4276), and `sourceAuditId` is the whole `captureFileAudit` result object (:4207), not an id.
- `include_verification` on a job/correlation export verifies the range first..last by sequence, which can contain other jobs' entries (export.js :164-170 in the route; service :578-585). The result is not specific to the exported entries.
- CSV export does not escape fields other than `message` (service :549-566).
- First-entry race in `appendEntry`: if two concurrent first writes for a new tenant both see no sequence row, both INSERT and one fails on the primary key (`audit_ledger_sequence` has PRIMARY KEY (tenant_id), dump :2747). The error is swallowed by the engine (service :57-63).
- `parseInt(limit)` is never validated (NaN, negative).

### DEAD
- GET `/api/file-audit/unique-mappings` (fileAudit.js:172) shadowed by `/:fileId` (:139). Any client call goes to `getFileAuditHistory` with fileId='unique-mappings'. It would also fail with a TypeError if reached (entry 13).
- `appendBatch` (service :132-222) has no callers (grep found none outside the class).
- Hash is also computed without `parent_entry_id`/`entity_name`/`actor_email` etc. (by design or not; see UNCLEAR).
- No UI caller in src: `/job/:id`, `/correlation/:id`, `/verification-history`, `/export/correlation/:id` (see Summary). The backend routes exist and are reachable by direct HTTP.

### DUPLICATE
- Admin determination in two forms: `userRoles.includes('Admin')` or permissions `users:write`/`roles:write`/`project_management:write` (fileAuditService.js:372-377), versus `userHasAllProjectAccess(req.user)` (fileAudit.js:193). The latter is in dead code and is also not exported by the module the route imports it from (see entry 13).
- Mapping join differs: `tm.mapping_id` (service :486, :594) versus `CAST(tm.id AS VARCHAR)` (route :232).
- Two entry-fetch paths for the ledger: `getEntriesByJobId` / `getEntriesByCorrelationId` / `getEntries` duplicate the same SELECT. `getEntries` filters `job_id` by ILIKE but `getEntriesByJobId` by equality.
- Two retention notions in file audit: `retention_until` (12 months, per row) versus the cleanup's fixed 90 days.
- Two parallel audit stores for job execution: `transformation_logs` and the ledger are both written at jobExecutionEngine.js:~900-935.

### SECURITY
- Ledger routes: no role or permission check. Any authenticated user can read all entries, export them, and trigger verify (which writes DB rows and scans the full tenant).
- Ledger `tenant_id` is a client-supplied query/body parameter, so any user can read any tenant. `/job/:id` and `/correlation/:id` and the exports have no tenant filter at all.
- Ledger entries contain actor emails/IPs and arbitrary job payloads (the export CSV excludes the payload but the JSON export includes it).
- Ledger hash is forgeable without any secret (see BUG, first item).
- File audit: `GET /:fileId`, `GET /:auditId/logs`, `DELETE /correlation/:id` and `DELETE /cleanup` have no project/role checks. Only `GET /` is project-scoped.
- POST `/api/file-audit/` accepts client-supplied `retentionMonths`, `createdBy`, `status`, `fileId`, etc., so audit content is forgeable by any user.
- Export filename built from raw path parameters in `Content-Disposition` (auditLedger.js:161, :169, :195, :203).
- `error.message` returned to clients in all error responses.
- Verbose `console.log` of query params and results in unique-mappings (dead code).

### UNCLEAR
- Which user roles are intended to use `/api/audit-ledger` (no check exists).
- Whether `req.session?.id` is ever populated (fileAudit.js:23).
- Why the hashed payload excludes `parent_entry_id`, `entity_name`, `actor_email`, `actor_role`, `actor_ip` (service :72-87). Those fields are never hashed.
- Whether `cleanup` is scheduled anywhere (see Open questions).
- `DISTINCT ON (fad.id)` with multi-join (vme/vm) in `getAuditRecords`, while the count query is not distinct.

## Domain terms
- Ledger / audit ledger / immutable audit ledger = `audit_ledger`; entry = row; `entry_id` (uuid) vs `id` (db key); `sequence_number`; `prev_hash` / `record_hash`; GENESIS (the literal used when prev_hash is null, service :17); tenant (`tenant_id`, default 'default').
- Verification = chain integrity check (`audit_ledger_verification`, statuses PASSED / FAILED, `verified_by` 'SYSTEM').
- `correlation_id` vs `job_id`: in file audit, `file_audit_details.correlation_id` is used as the `transformation_logs.job_id` (fileAudit.js:101); in the ledger they are separate columns.
- File audit = `file_audit_details`; "profiling results" (the delete message) = the same rows; `file_role` (source/target); `load_type` (e.g. etl_transformation per FILE.md); `load_step_1*`.
- Schema versioning = `file_schema_details`, `schema_hash`, `schema_diff`, `active_flag`, `previous_schema_id`.
- Log levels stored upper-cased in the ledger (`level.toUpperCase()`, jobExecutionEngine.js:924). `action_category` default 'EXECUTION'; `log_level` default 'INFO'.
- Retention: `retention_until`, `retentionMonths` (default 12), cleanup `retentionDays` (default 90).

## Open questions
1. (Resolved) The prod schema has no `audit_id` on `file_audit_details` and no `schema_id` or `created_dt` on `file_schema_details`; see entry 16.
2. Is `DELETE /api/file-audit/cleanup` called by any scheduler or UI? None was found in src grep for 'file-audit' (only Monitor.jsx:91, :282 and ProcessedFileCatalog.jsx:41, :194). Non-JS schedulers were not searched. Moot while it always fails.
3. (Resolved in part) `userHasAllProjectAccess` is not exported by requireProjectAccess (entry 13). Consistency of `getUserProjects` with the service's admin test was not traced.
4. Do other writers append to `audit_ledger` (e.g. via raw SQL, outside the service)? Only the one `appendEntry` caller was found, in JS files.
5. (Resolved) `event_timestamp` is a plain `timestamp` (dump :2696); insert and verify both hash `toISOString()`.
6. (Answered) Both routers use `authenticateToken` from backend/src/middleware/authenticate (server.js:406, :5280, :5292), which sets `req.user.permissions` and, when `effectiveRoles` exists, `req.user.roles` (authenticate.js:53-67). backend/middleware/authenticate.js (`req.user = decoded`) is not used by these mounts. Still unconfirmed: that `roles` are strings, as `userRoles.includes('Admin')` assumes, and what `getUserPermissions` returns for the permissions test.
7. Whether ProcessedFileCatalog's delete is meant to be permission-gated.
8. What the UI renders from the `/verify` result (`setVerificationResult`, Monitor.jsx:232). The calls were traced (see Summary); the rendering was not.
