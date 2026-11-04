# Filesense - Cross-cutting findings (Phase 4)

Scope: findings that span areas. Per-feature recommendations and decisions are in triage.md (feature ids F01-F123). Terms follow glossary.md. Decisions D1-D12 are resolved in section 7.

## 0. Evidence rules and corrections applied

Authority order used in this synthesis:
1. For the 12 done-with-issues areas (PROC, PROF, DQ, VAS, SLA, ETL, SCHD, EML, AI, SEC, WEB, MIGV), the last `<AREA>.verify.md` overrides the note wherever they disagree. The notes still contain the errors listed there.
2. Schema evidence: the `attached_assets/FileSence_prod_schema_Jan_05_*.sql` dumps are the best prod evidence (they print ON DELETE clauses, 43 CHECKs and triggers). The `database_ddl_*` dumps print no ON DELETE and no CHECK, so the absence of either there proves nothing. The Jan_05 dump predates the digest tables, `vendor_approval_step_decisions` and the 14-value approval CHECK. The in-repo migrations do not explain the prod schema (base tables with no creator; migrations never called). Baseline choice: see D1 in section 7.

Corrections over notes that passed verification:

| Note | Claim in the note | Correct position | Evidence |
|---|---|---|---|
| VND BUG 13 | Vendor delete fails because the FKs have no ON DELETE | Wrong for prod. Jan_05 has `vendor_agreements.vendor_id` CASCADE, `users.vendor_id` SET NULL, `vendor_users.vendor_id` CASCADE, `vendor_agreements.vendor_connection_id` SET NULL | Jan_05 dump :7851, :7891, :7892, :7912 |
| BULK, ETL, BPR, EXE, MGRP (and DQ OQ-1, USR OQ-3, PRJ UNCLEAR-2 where they rely on database_ddl) | "Delete fails / 500 because no ON DELETE" | Unsupported when it rests only on `database_ddl_*`. Re-check against Jan_05 before treating it as a bug. Claims that cite Jan_05 lines (RET BUG-14 :7718, EML :7897) stand | STATE.md cross-area notes (schema sources) |
| AUD, ADM | An audit failure after COMMIT causes ROLLBACK + 500 in system cleanup | Wrong. `AuditService.logSystemCleanup` catches its own errors, so the failure is silent and the purge reports success with no audit row. (This applies to logSystemCleanup only; `AuditService.logAction` does rethrow, so PRJ BUG-9 and RET BUG-23 stand.) | AuditService.js:541-564 |
| CONN | Credentials are encrypted on create and update | Wrong for create. `ConnectionService.createConnection` stores `config`, secrets and OAuth tokens included, as plaintext JSON; only update encrypts | ConnectionService.js:707 (create), :827-834 (update) |
| CONN, EML, BULK, RET, VAG, VAS, SCHV, ING, ALRT | Code and notes assume `storage_connections.id`, `provider_type`, `is_active` | Prod PK is `connection_id varchar(255)`; there is no `id`, `provider_type` or `is_active` column (`type` and `status` exist) | Jan_05 dump :6108-6128 |
| AI (round-2 text at AI.md :97-98, :123) | AI payload field names match the stored profile | Wrong. The frontend builds the payload from `/api/files/:fileId/full` columns, which lack every count field, so uniqueness is always critical for id-like columns and the completeness, duplicate and sample checks never fire. FDV BUG-17 is right | server.js:6454-6535; AI.verify.md |
| GRP, BPR | `user_groups.group_id` references `groups(id)` | Prod references `access_groups(id)` | GRP DUPLICATE; BPR prod-dump BUG |

## 1. Schema source (D1)

Four sources disagree (Jan_05 dumps x2, `database_ddl_2026-01-07.sql`, `attached_assets/database_ddl_1767770486833.sql`, migrations). They differ on ON DELETE actions, CHECK constraints, triggers and columns (for example `transformation_jobs.mapping_id`: none / none / SET NULL / CASCADE; alert tables; `storage_connections` key). Many bug verdicts depend on this: create paths that omit NOT NULL columns (BPR, JOB, WFL, SCHD), columns the code reads that prod lacks (RET, ALRT, EML, LEDG, JOB, SCH, PRJ), status CHECKs (X2) and delete cascades.

Resolution (section 7, D1): the Jan_05 dumps are the baseline. A fresh schema-only dump of production is still an open action (the Jan_05 dump is stale: no digest tables, no `vendor_approval_step_decisions`, 13-value approval CHECK). The rebuild's data model and migration baseline must be checked against that fresh dump before it is built; the in-repo migrations are not a source.

## 2. Security findings, ranked

Severity: Critical = remote takeover, privilege escalation, code or SQL injection, or credential/secret disclosure without meaningful preconditions. High = serious exposure needing some precondition or affecting a security control. Medium and Low as usual. Each finding is stated once; the areas column lists where it appears.

### Critical

| Id | Finding | Areas | Evidence |
|---|---|---|---|
| C1 | Okta sign-in endpoint mints tokens for any `okta_id`. POST /api/auth/okta/user has no auth and verifies no Okta token; it issues access and 7-day refresh tokens for an existing user, or creates a new user with a default role. The Okta verifier packages are installed but never imported. | AUTH, WEB, SEC | server.js:10237-10247, :10368-10380; AUTH SEC-1 |
| C2 | Unauthenticated user registration accepts roles. POST /api/users/register has no auth and assigns any role id or name from the body (e.g. Admin), plus internal_user and user_type. It is the UI's "create user" path. | AUTH, USR | userManagement.js:53; enhancedAuthService.js:283-316; AUTH SEC-2, USR SEC-2 |
| C3 | Any authenticated user can grant themselves admin rights. Role create/update/delete checks are commented out (the Admin role's permissions are editable); any user can create access groups, add themselves and assign any role to the group; any user can add themselves to any project; any user can create and attach policies. The startup migration `bridgeVendorAdministrationPermissions` also grants `users:write`/`roles:write` to any role holding vendor_* permissions. | USR, GRP, PRJ, MIGV | server.js:11284, :11340, :11412; groupRoutes.js and policyRoutes.js (no checks); projectRoutes.js:944-1210; bridgeVendorAdministrationPermissions.js:28-62 |
| C4 | Unauthenticated surfaces (one finding). GET /api/db_url returns the full DATABASE_URL (server.js:10780-10795; CORS does not stop callers without an Origin); GET /api/secrets; /api/debug/recover-orphans (returns stacks) and /api/debug/hash-password/:password (password in the URL); all /api/ml/* anomaly routes including resolve; POST /api/auth/okta/user (C1); the Flask profiling service bound to 0.0.0.0:8000 and exposed by .replit (.replit:88-89), which reads caller-chosen local file paths, reads any S3 object with server credentials, switches the AI provider and writes settings via PUT /api/settings/<key>; the production /profile-api proxy (no auth, no rate limit, no timeout); GET /api/governance-policies* and /api/governance-tags*; DELETE /api/job-schedules/:id; /api/mappings CRUD; /api/files/:id/job-status; /api/badges; /api/user/dashboard-settings; /api/notifications/health; health, metrics and /api/test-di probes. | SEC, PROF, AI, ANOM, ADM, OPS, PLT, GOV, JOB, ETL, PROC, DASH, NTF | SEC S1/S2; PROF S1/S2/S4; AI SEC; ANOM SEC-1; ADM SEC-1/2; PLT SECURITY |
| C5 | Cross-project access through a client-supplied project id. `requireProjectAccess` takes `params.projectId`, `query.project_id` or `body.project_id` before it looks up the resource's own project and never cross-checks them (requireProjectAccess.js:186-191). A member of project A sends `?project_id=A` and reads, edits, deletes or executes resources of project B. Affects every route using requireProjectAccess or authorizeProjectResource: files, mappings, mapping groups, alert policies and more. | SEC, FILE, ETL, MGRP, ALRT | requireProjectAccess.js:181-199; FILE SEC; ETL S8; MGRP SECURITY; ALRT SEC-1 |
| C6 | Code injection. (a) Python source is built by string interpolation from the client-supplied filename in duplicate detection (only `'` escaped, backslash not), in the upload worker and in bulk profiling (S3 key). (b) The quality engine evaluates `consistency` expressions with `new Function` after substituting raw cell values unescaped; any user can create such rules. | PROC, BULK, DQ | fileProcessingWorker.js:1889-1897; BulkProfilingService.js:1157; qualityValidationEngine.js:621, :635 |
| C7 | SQL injection through request-body keys. PUT /api/schedules/:id passes every remaining body key to `updateSchedule`, which uses the keys as SQL column names (values are parameterised, names are not). The same call can set `created_by`, which decides the user a schedule runs as. | SCHD | cronSchedulerService.js updateSchedule (service :280-283, :397); scheduler.js:597-601 |
| C8 | Plaintext connection secrets and secret exposure. Connections created through POST (storage, e-mail, OAuth) store keys, passwords and tokens as plaintext JSON; GET /api/connections, GET /:id and the e-mail connection list return the whole config to any authenticated user; vendor-agreement init-data returns every connection with its config to every user; GET /api/drop-location/credentials returns decrypted cloud credentials; decrypt failures fall back to the stored value. | CONN, EML, VAG, ING, SEC, MIGV | ConnectionService.js:707; connectionRoutes.js:45, :132; vendorAgreementRoutes init-data (R:515-523); dropLocation.js:222-255 |
| C9 | Passwords captured in plaintext in audit storage and logs. The frontend audit interceptor posts the first 500 characters of every failed request body (password-change payloads included); the request audit middleware redacts only top-level exact keys, so `newPassword`, `currentPassword`, `passwordChangeToken` and nested secrets are stored for every /api/auth and /api/users call. Archive passwords are console-logged, put in queue payloads, stored in `dlq_jobs.original_payload` (returned to any user), sent over plain http to the profiling service and passed on `python3 -c` command lines; a vendor contact's temporary password is written to the application log. | AUD, WEB, AUTH, ING, ARC, PROC, VAS, VND | auditInterceptor.js:14, :36-37; auditMiddleware.js:8-23, :185, :202-204; server.js:2560, :2704-2708; fileProcessingWorker.js:911; archiveExtractionService.js:478-483; vendorService.js:165-169 |
| C10 | Hard-coded credentials in the repository (values deliberately not copied here). The production seed script hard-codes the bootstrap admin password (seedProduction.js:27, with a Sonar suppression); the CI workflow hard-codes a Sonar token that overrides the SONAR_TOKEN variable (sonar.yml:41) and is in git history. Both must be rotated; any prod admin created by the seed must have its password changed. | MIG, PLT | seedProduction.js:26-28; sonar.yml:34, :41 |

### High

| Id | Finding | Areas | Evidence |
|---|---|---|---|
| H1 | No security headers at all. Helmet (CSP, HSTS, frame-ancestors) is registered inside an async block after every route, the 404 handler and the error handler, so it never runs; if secret loading throws it is never installed. The configured CSP also allowed `'unsafe-inline'` scripts. | PLT, SEC, WEB | server.js:435-494, :14030-14041; PLT BUG, SEC S15 |
| H2 | Session token weaknesses. Legacy JWT middleware (`backend/middleware/authenticate.js`) accepts refresh tokens as bearer tokens and trusts token claims without a DB check; refresh tokens are bcrypt-hashed and bcrypt reads only 72 bytes, so rotation and revocation are probably ineffective (unverified); logout revokes nothing; tokens and the PKCE verifier live in localStorage; the OAuth `state` is the constant 'xyz' and is never checked. | AUTH, SEC, WEB, USR, API | AUTH SEC-4/5/6/10/11; SEC S5; API SEC-9 |
| H3 | Predictable temporary password on reset approval. Approval sets 'TempPass@' + current year, returns it in the response, and anyone can file a reset request for any local account; reset replies reveal whether an account exists. | AUTH | server.js:10830-10882, :11000, :11029 |
| H4 | Virus scanning is effectively off. DISABLE_VIRUS_SCAN defaults to true in the production bootstrap and .replit; the Node scanner fails open on any error; ETL and visual-mapping archive extraction use a mock scanner; the Python scanner covers archives only; the API upload path treats every file as infected (so if fixed naively it would delete everything). | ARC, PROC, PLT, EXE, PROF, API, BULK | productionBootstrap.js:38; .replit:65; VirusScanService.js:228-241, :279-307; jobExecutionEngine.js:284-286, :2921-2924 |
| H5 | Audit integrity. The request audit middleware runs before authentication, so actor columns are NULL; any authenticated user can write frontend audit rows and file-audit rows with arbitrary content; the ledger hash covers no record content (`JSON.stringify` with an array replacer keeps only `payload`/`prev_hash` keys), so the chain is forgeable without a secret; there is no TRUNCATE protection; ledger `tenant_id` is client-supplied; admins can delete audit data and user deletion removes `file_audit_details`. | AUD, LEDG, MIGV, USR | auditMiddleware.js:136-146; ImmutableAuditLedgerService.js:11, :15-21, :72-87; Jan_05 dump :2726-2733 |
| H6 | Permission model drift (one finding). `req.user.permissions` mixes strings and `{name, resource, action}` objects, and checks written as `permissions.includes('x:y')` miss the object form (file_governance:write is granted nowhere, so those writes fail even for Admin); three admin predicates disagree (server.js:380 accepts users:write/roles:write; permissionHelpers.js:80 adds project_management:write; digestRoutes.js:18 is a third copy) and `userHasAllProjectAccess` adds all_projects:read, which also skips every `requiredPermissions` check (admin bypass); two authenticate middlewares build `req.user` differently; three permission-resolution recipes (Okta, /me, middleware) give the UI a different list from what the server enforces. Over-granting and under-granting both result. | AUTH, USR, GRP, SEC, GOV, AUD, FILE, ALRT, NTF, PRJ, VAG | authenticate.js:218-290; permissionHelpers.js:12-92; server.js:380-403; digestRoutes.js:18-35; authorizeProjectResource.js:91 |
| H7 | Missing object-level authorisation (IDOR) on many routes beyond C5: DLQ jobs of all tenants; connection browse, test and infer-schema; vendor file profiling; bulk profiling and schema validation jobs and schedules; visual mapping logs, previews and Socket.IO rooms; workflow-steps router; N-step runs, assets and steps; lineage queries and saved graphs; governance writes; error-review status updates; quality rules and file-level DQ routes; fixed-width schemas; alert history; file audit and ledger; job stats; AI routes; RDM cache clear; notification POST for any user; e-mail connection CRUD; cache flush. | many | see triage Evidence per feature |
| H8 | Authorisation only in the browser. Route protection, sidebar filtering, vendor restriction, the forced-password-change overlay and many write buttons are client-side only. | WEB, FDV, USR, VAG, ADM | App.jsx:175-189, :222-245; AuthContext.jsx:774-776 |
| H9 | Server-side request forgery paths. Drop-location test calls admin-supplied endpoints; Jira URL validation likely misses IPv4-mapped IPv6 hex form; /parquet-schema reads any S3 bucket/key; `s3://other-bucket` paths in bulk profiling use the connection's credentials; RDM path parameters are interpolated unencoded into the upstream URL. | ING, JIRA, PROF, BULK, SCHV, RDM | dropLocation.js:332-367; JIRA SECURITY; profile_api.py:1874-1893 |
| H10 | Archive handling hazards: no decompression-bomb limits in Node or Flask extraction, no path-traversal filter for 7z, basename collisions. | ARC, PROF | archiveExtractionService.js:118-121, :730; profile_api.py:1025-1045 |
| H11 | Deployment and session hardening: deploy SSH with StrictHostKeyChecking=no; DB SSL rejectUnauthorized:false; in-memory session store and per-instance rate limits; session secret falls back to the JWT secret; default COOKIE_SECRET literal; 50 MB JSON bodies before auth. | PLT, SEC | prod-deployment.yml:23; database.js:85; server.js:556-557, :593-602, :643-698 |
| H12 | Bootstrap grants on every start. The repair step gives Admin, Vendor Manager and Governance Manager to the user named exactly 'admin' when it has no roles; ensureFileUploadPermissions re-grants revoked permissions on every restart. | MIG, MIGV | repairCleanPublishDashboardPrerequisites.js:3-25; ensureFileUploadPermissions.js:28-30 |
| H13 | Regular-expression injection and ReDoS. User-defined regexes run without the safety check on the HTTP rule path; policy patterns, glob-to-regex conversions and the Postgres `~` operator take unescaped user patterns in many places. | DQ, GRP, BULK, CONN, SCH, DASH, EXE, PROC | server.js:7324, :8128; policyEngine.js:244; schemaHistory.js:58 |

### Medium

| Id | Finding | Areas |
|---|---|---|
| M1 | Raw `error.message`, upstream bodies and stack traces returned to clients in most areas (execute returns `error.stack`; template upload returns `error.stack`; debug route returns stacks). | nearly all |
| M2 | CSV/Excel formula injection in exports (error review, audit CSV, ledger CSV). | ERR, AUD, LEDG |
| M3 | HTML injection into alert and digest e-mails (job names, error messages, subscription names unescaped). | ALRT, NTF |
| M4 | `Content-Disposition` built from user input (lineage export, ledger export, agreement documents). | LIN, LEDG, VAG |
| M5 | Unbounded `limit`, list sizes and request bodies; a python process spawned per health request; Redis KEYS on user patterns. | most list routes, OPS, ADM, LIN |
| M6 | Personal data over-exposed: user directory with lockout state to every user; vendor contact data; init-data endpoints returning up to 1000 users; `/api/auth/me` returns `password_history` hashes and internal fields. | USR, VND, PRJ, GRP, AUTH |
| M7 | Dormant injection and traversal: retention `custom_sql_filter` concatenated into SQL; restore path from the request body; internal dynamic column names in `updateJob`/`updateJobStatus`. Not reachable today; must not be carried over. | RET, EXE, SCHV |
| M8 | E-mail OAuth: unsigned base64 state, redirect_uri from the request body, no user binding. | EML |

### Low

| Id | Finding | Areas |
|---|---|---|
| L1 | Server filesystem paths returned to clients (DLQ payloads, retry responses, job-status). | ARC, PROC |
| L2 | Hugging Face token placed on a process-wide fetch override and in a global variable. | AI |
| L3 | Misleading security log text ("Unauthorized audit access attempt" for every admin route). | ADM |
| L4 | API token lookup by an unindexed, non-unique 11-character prefix. | API |

## 3. Cross-cutting defects (non-security)

| Id | Defect | Areas | Evidence |
|---|---|---|---|
| X1 | The job engine signals failure by returning a value, and callers ignore it. Non-throwing `failed` returns at jobExecutionEngine.js:1471, :1659, :1748 (no files, drift abort, cross-file mismatch) are counted as success by mapping groups, N-step workflows, the dependency engine, visual workflows and the scheduler. DQ_ABORT: :3900 sets the job failed and :3919 throws; the per-file catch at :2170 swallows it and :2199-2207 overwrites the job to completed (or completed_with_warnings), so the abort Jira ticket (:2358) never fires. A job where every file failed is "completed". Cancel does not stop the run. | EXE, MGRP, WFL, VWF, SCHD, JIRA, ALRT | EXE BUG-1/2/4; MGRP BUG; WFL BUG-14; VWF BUG; JIRA DEAD/BUG |
| X2 | `completed_with_warnings` is rejected by status CHECKs. Confirmed for `visual_mapping_executions` (Jan_05 :7109): the update fails, the catch marks the run failed after success was emitted. Not yet checked for `transformation_jobs`, mapping group, N-step and visual workflow execution tables (to be checked against the fresh dump, D1). | EXE, VMAP, MGRP, WFL, VWF, JOB | STATE.md cross-area note; VMAP BUG |
| X3 | `requireProjectAccess` / `authorizeProjectResource` behaviour (besides C5): 400 "Project context required" is returned before the admin bypass and before the resource's own 404, so missing resources look like bad requests and admins get 400; a nonexistent project gives 403 before the unreachable 404 (requireProjectAccess.js:124-133); on every denial the middleware answers without calling `next`, so the promise awaited at authorizeProjectResource.js:67-75 never settles (one leaked pending function per denied request); `projectRoles` is accepted but never evaluated. | SEC, FILE, ETL, MGRP, ALRT | requireProjectAccess.js:55-62, :111, :124-133, :186-191; authorizeProjectResource.js:67-80 |
| X4 | Two cache stores, so invalidation never hits. `config/redis` (keys `GET:...`, used by invalidateFileCache/invalidateCachePattern) and `cacheService` (keys `cache:<user>:<url>`, used by cacheMiddleware) are separate; the dashboard invalidator uses a third pattern and has no caller. Cached responses are also served before authorisation on some file routes, and the permission cache (600 s) is not invalidated by role or user changes. | GOV, SCH, DASH, FILE, USR, ADM | GOV B8; SCH UNCLEAR 7; DASH BUG; FILE SEC |
| X5 | Startup and shutdown. The migration block runs un-awaited at module load; the prerequisite check can run before tables exist, sets `ready:false` once and never re-checks, so the dashboard (503) and the readiness probe stay down until restart; one failing migration skips every later one and the server starts anyway; BEGIN/COMMIT are issued on a pool, so migrations are not transactional; a repair-step failure exits the process. SIGTERM/SIGINT exit immediately (integration.js:52-62), so `gracefulShutdown` never runs. Health checks never query the DB. | MIG, MIGV, PLT, OPS, DASH | server.js:5884-5956, :14066-14097, :14211, :14268; MIG BUG-1/3/5/6 |
| X6 | Prod `storage_connections` key mismatch: code that selects `id`, `is_active` or `provider_type` fails on prod (alert delivery, e-mail sends through NotificationService, job notification join, delivery details, retention archival reads the separate `connections` table). | CONN, EML, ALRT, RET, NTF | Jan_05 :6108-6128 |
| X7 | Schema drift between code and prod: create paths omit NOT NULL columns (business processes, job schedules, workflow steps, workflow executions, alert events run_id); code reads columns absent in prod (retention, alerts, file audit cleanup, job /full and /v2, GET /schema, project adhoc_upload_connection_id). | BPR, JOB, WFL, SCHD, SLA, RET, ALRT, LEDG, SCH, PRJ | per-area BUG flags; baseline per D1 |
| X8 | Error handling: client errors become 500 (non-numeric ids, NaN pagination, constraint violations, CORS rejection); some 404s are unreachable; response shapes differ between list variants (bare array vs object). | nearly all | per-area BUG flags |
| X9 | Vocabulary drift in stored values: anomaly status open vs active; enabled vs is_active; three severity scales; log level warn vs warning; job status sets per table; sensitivity lists (4, 5, lowercase); approval statuses old and new; file failure codes outside the DB enum. | ANOM, DASH, ALRT, SCHD, EXE, GOV, VAP, ARC | per-area flags; glossary.md |

## 4. Conflicting duplicates (45 clusters)

Each cluster is folded into one triage row; the rebuild keeps one implementation.

1. Authentication and authorisation plumbing: two JWT middlewares; three admin predicates plus all-project access and frontend hasRole/hasAdminLevelAccess; four permission matchers; three permission-resolution recipes (AUTH, USR, SEC, GOV, NTF).
2. Account credential handlers: two user-creation endpoints; two forced-change flags; three password-change handlers; two password-requirements endpoints; three password-strength validators; bcrypt cost 10 vs 12 (AUTH, USR).
3. User and role listing: GET /api/users twice; role listing four ways; two role-delete endpoints with different protections; user-delete cascade copied (USR).
4. Groups: two APIs on /api/groups; tables groups, access_groups, job_groups; membership in user_groups vs access_group_members; three user_groups definitions; group-role SQL copied three times (GRP, BPR, PRJ).
5. Two policy engines (policyEngine, ProjectPolicyEngine) (GRP).
6. "Projects a user can access": six implementations including the SQL function get_user_projects (PRJ, DASH, SEC, FILE).
7. Sub-project create (3), update (2) and list (3) paths (PRJ).
8. File list endpoints: init-data, /api/files, /api/vendor-files (FILE, VND).
9. File delete: single, bulk, vendor bulk, FileService.deleteFile (FILE, VND).
10. Filename pattern logic: about eight glob matchers with different escaping (upload, drop, worker x3, engine x3, SLA x2, bulk) and three logical-pattern extractors (ING, PROC, EXE, SLA, BULK, FILE, PROF, DASH).
11. Archive extraction: Node service, Flask load_archive, FastSchemaValidationService, engine reuse with mock scanner; three tar extractors; five extension lists (ARC, PROF, SCHV, EXE, PROC).
12. Archive password lookup: worker, engine, schema validation (ARC, EXE, SCHV).
13. Virus scanning: Node fail-open, Python fail-closed (disabled), mock scanner (ARC, PROF, EXE).
14. Failure classification: DLQ upper-case codes, worker snake_case codes, DB enum, route string test (ARC, PROC).
15. Queues and recovery: MemoryQueue vs asyncProcessor tasks; file-processing queue vs BullMQ file-upload queue; per-job cleanup vs hourly sweep; three orphan-recovery triggers (PROC, API, ADM, OPS).
16. Upload pipelines: /upload vs /drop (copied project, contract and fixed-width logic) vs API UploadProcessor vs uploadWorker (ING, API, PROC).
17. Profile engines (Flask, process_file.py, profile_columns.py, transformation profiling, ETL profiling) and two pattern notations (PROF, PROC).
18. Quality score: five formulas with different weights and defaults (DQ, PROF, FDV, EXE).
19. Rule execution: HTTP run, HTTP revalidate, engine, engine with job overrides; two violation-persistence functions; two violation-action vocabularies (DQ, EXE).
20. Quality notions in the UI: QualityChecks, QualityReport, DataProfile heuristics (FDV).
21. Schema logic: two compareSchemas, four type normalisers, three type inferrers, two fingerprints, two per-format extractors (SCH, EXE).
22. Schema validation services: FastSchemaValidationService vs schemaValidationService (SCHV, ETL, EXE).
23. Connection handling: browse x2, test x2, config building x3, decrypt variants x2, cloudStorageFileList copies x3 (CONN, BULK).
24. Vendor detection: isVendorUser, attachVendorProfile, inline lookups (VND, USR).
25. Agreement approval: legacy dual, three-stage, configurable chain (VAP).
26. Agreement templates: multi-sheet A vs single-agreement B (VAS).
27. Agreement document uploads: three multer paths with different limits and types (VAG, VAP).
28. SLA compliance: route status vs worker status, two filename matches, resolved vs resolved_at (SLA).
29. Mapping definitions: transformation_mappings vs legacy file_mappings; three transformation CRUD stacks over `transformations` (ETL, XFM).
30. Engine file parsing: parseFileToRows vs parseAndTransform family (txt treated differently) (EXE).
31. Workflow models: N-step, dependency (workflow steps), visual workflows, business processes (WFL, VWF, BPR).
32. Job systems: transformation_jobs vs legacy jobs; three job-list endpoints; two cancel models; two profile endpoints (JOB, BPR).
33. Schedule systems: schedules, file_schedules, job_schedules; schedule CRUD duplicated in schema validation (SCHD, JOB, SCHV, BULK).
34. Column sensitivity: column_sensitivity_tags vs governance tag assignments; sensitivity value lists (GOV, FILE).
35. Lineage stores: transformation_lineage, visual_lineage_graphs, file_lineage (LIN, XFM).
36. Audit stores: audit_log, audit_ledger, file_audit_details, transformation_logs; two execution-log stores in visual mappings and visual workflows (AUD, LEDG, EXE, VMAP, VWF).
37. Alerting: aggregation worker vs JobNotificationService; alert_rules vs alert_policies; alert schema in migrations vs prod (ALRT, MIGV).
38. Anomalies: JS and Python pipelines plus an inline writer; healing in JS and Python; statistics three ways (ANOM).
39. Cache: config/redis vs cacheService vs unmounted enterpriseCacheMiddleware (GOV, SCH, ADM, PLT).
40. RDM routes in rdm.js and server.js with different shapes (RDM).
41. E-mail: two OAuth flows; two domain validators; two provider loaders (NotificationService, VendorAgreementNotificationService) (EML).
42. In-app notifications: many direct INSERTs instead of one service; three frontend notification mechanisms; two context directories (NTF, WEB).
43. Dashboard health index computed three ways; admin and project query branches copied in every handler (DASH).
44. Health endpoints: /health-check, /api/health (twice), backend/src health, healthCheckRoutes (OPS, PLT).
45. Platform scaffolding: two Express apps; four DB pool setups; two migration systems; two deploy paths; three rate-limiter and three CORS configurations (PLT, MIG, SEC).

## 5. Rules that apply everywhere (for the rebuild)

- Authentication: one middleware. Access tokens only on API routes; refresh tokens accepted only by the refresh endpoint. Tokens verified against current DB state (user exists, not locked, roles current). SSO identity accepted only from a verified IdP token (OIDC with state and PKCE checked server-side).
- Authorisation: deny by default; every route declares its permission. One permission format (`resource:action` strings). One administrator definition (D3). Project scoping is resolved from the resource itself, never from client input; client-supplied project ids are only used for creates and must be membership-checked. UI gating is cosmetic only.
- Secrets: credentials encrypted at rest on every write path, never returned to clients (return `has_<field>` flags), never logged, never on command lines, never in queue payloads or audit records. No secrets in the repository.
- Audit: the audit record captures the authenticated actor; request bodies are not stored (or are stored through an allow-list); the ledger hash covers the full canonical record and chains with a keyed hash; audit deletion follows retention rules only.
- Errors: 4xx for client errors (validation, not found, conflict), 5xx only for server faults; error bodies carry a code and a safe message, never `error.message` from libraries or stacks. One response envelope for lists (items, total, page).
- Input validation: every id, pagination and enum parameter is validated (bounded limits, numeric ids, whitelisted keys); no dynamic SQL identifiers from input.
- Time zones (D11): store `timestamptz` in UTC; compute schedules, SLA windows, digests, retention and insights in UTC or in an explicit stored time zone; never mix Node local getters with DB `NOW()`. Today: auth timestamps are `TIMESTAMP WITHOUT TIME ZONE` written from JS Dates; bulk one-time crons use local time evaluated in UTC; schedule `timezone` is stored but ignored; digests and retention use local hours; transformation `date_format` uses server-local getters.
- Status and vocabulary: one enumerated set per concept (glossary.md), enforced by CHECK constraints that the code matches; job status semantics are explicit (D7).
- Failure signalling: engines throw or return a typed result that callers must check; no swallowed errors inside DB transactions (Postgres aborts the transaction).
- Identifiers: one external id per entity (`file_id`, `job_id`, `connection_id`, `mapping_id`); numeric surrogate keys stay internal.
- Background work: one queue implementation with a real consumer, bounded concurrency, idempotent jobs, cross-instance locks for schedulers, and recovery that preserves job context.
- Security controls fail closed: virus scanning, e-mail domain restriction and policy evaluation reject on error.
- Schema changes: one migration system, versioned, transactional, run before the app reports ready; baseline per D1.

## 6. Decisions raised

All twelve were raised for a human and are resolved in section 7.

| Id | Decision |
|---|---|
| D1 | Which schema file matches the live database (Jan_05 dumps, database_ddl_*, or migrations), and can a fresh prod schema dump be provided. |
| D2 | Rotate now: the Sonar token, the seed admin password, and the database credentials exposed through GET /api/db_url. Decide whether to block the unauthenticated endpoints (C4) and port 8000 on the current production before the rebuild. |
| D3 | Administrator and permission model: which permissions imply admin; whether all_projects:read may bypass permission checks; whether project-scoped group roles are meant to restrict access per project. |
| D4 | Group model: keep access_groups with a single membership table and retire groups, access_group_members, job groups and the IAM policy engine? |
| D5 | Agreement approval: three-stage (vendor, manager, governance) or the configurable chain; both are live in the UI. |
| D6 | Workflow model: N-step workflows, visual workflows, dependency workflows or business processes (one survives). |
| D7 | Job status semantics: should a DQ abort or any failed file fail the job; keep completed_with_warnings (and add it to every status CHECK) or drop it. |
| D8 | Drop location model: per-project connection, global configuration, or per-agreement connection and path. |
| D9 | Virus scanning policy in production: enabled and fail-closed? |
| D10 | Authentication scope: keep local accounts alongside Okta; keep admin-approved password reset or move to e-mail reset. |
| D11 | Time zone standard for stored timestamps and schedules. |
| D12 | The 9 "ask" features in triage.md (F10, F17, F41, F52, F53, F55, F79, F108, F119). |

## 7. Resolved decisions

Source: the user accepted every synthesizer recommendation, relayed by the coordinator on 2026-11-05. D3-D12 record the recommended choice, marked accepted by the user. D1 and D2 are recorded as instructed.

| Id | Resolution | Status |
|---|---|---|
| D1 | Baseline = FileSence_prod_schema_Jan_05_*.sql dumps, taken as the best available prod evidence. Confirm against a fresh prod dump before building the data model. | Accepted. Open action: obtain a fresh schema-only prod dump and diff it against the Jan_05 baseline (known gaps: digest tables, `vendor_approval_step_decisions`, 14-value approval CHECK) before the data model is built. |
| D2 | Rotate the Sonar token, the seed admin password and the database credentials exposed through GET /api/db_url; block the C4 unauthenticated endpoints and external port 8000 on the current production until the rebuild replaces it. | Accepted; action owner: user/ops; not done by the extraction. |
| D3 | Administrator = holder of the Admin role, checked by one server-side predicate. No other permission implies admin (users:write, roles:write and project_management:write grant only their own actions). `all_projects:read` becomes read-only visibility across projects and never bypasses write or execute checks. Permissions are only `resource:action` strings. Project-scoped group roles apply only inside their project (and its sub-projects). | Accepted by the user. |
| D4 | One group model: `access_groups` with `user_groups` as the single membership table and `access_group_roles` for group roles. Retire the legacy `groups` table, `access_group_members`, job groups and the IAM policy engine (F13, F14, F81 dropped). | Accepted by the user. |
| D5 | One approval mechanism: the configurable approval chain (ordered steps, named approvers, per-step quorum). Ship a default chain template of vendor acceptance, agreement-owner approval and governance approval to reproduce today's three-stage flow. Retire the hard-coded three-stage endpoints and the legacy dual approval (F62). Final state is one "approved" status; only named approvers vote; resubmission clears the lock. | Accepted by the user. |
| D6 | One workflow model: N-step workflows (F77), extended with e-mail notification and Jira ticket steps taken from visual workflows. Retire visual workflows (F79), dependency workflows (F78) and business processes (F80). | Accepted by the user. |
| D7 | A job is failed if a DQ abort occurs or any file fails; it is cancelled if cancelled (and the run stops); it is completed_with_warnings if rules raised warn-level violations; otherwise completed. Keep completed_with_warnings and add it to every status CHECK that stores job, group, workflow or visual-mapping run status. Engines return a typed result that every caller must check; mapping groups and workflows fail when any member fails. | Accepted by the user. |
| D8 | Drop location = a connection plus a path set on the project, with an optional sub-project override. A vendor agreement names a sub-path under its project's drop location. Retire the global `drop_location_config` and its credentials endpoint (F27). | Accepted by the user. |
| D9 | Virus scanning enabled in production and fail-closed: if a scan cannot complete, the file is quarantined and not processed. One scanner is used by every ingestion path, including archive members and ETL sources. | Accepted by the user. |
| D10 | Keep local accounts alongside Okta. Okta sign-in uses verified OIDC tokens. Replace the admin-approved reset queue with e-mail one-time reset links for local accounts (admins may trigger a link); no temporary passwords. | Accepted by the user. |
| D11 | Store all timestamps as `timestamptz` in UTC. Schedules, SLAs and digests carry an explicit IANA time zone (default UTC); the UI displays times in the user's local time zone. | Accepted by the user. |
| D12 | The 9 ask features: F10 change (My account page), F17 drop, F41 change (one violation action per rule assignment), F52 drop, F53 drop, F55 drop, F79 drop (steps move to N-step workflows), F108 drop, F119 change (one Help page; PerformanceOptimizations dropped). Recorded in triage.md as "decided on recommendation, user accepted". | Accepted by the user. |
