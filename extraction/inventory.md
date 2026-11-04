# Filesense (Data File Observatory) - Phase 1 Inventory

All paths are relative to the repo root `C:\Users\Hriday.Ganga\Desktop\Projects\Analysis\Filesense`.
I collected this by searching (grep/glob) only. I did not read files end to end. Configuration values were not read; only variable names are recorded.

## 0. Stack

| Item | Detail | Location |
|---|---|---|
| Backend (main) | Node 20, Express 5 monolith (`server.js`, ~14.3k lines) plus routers in `backend/routes/*` and `server/routes/*`, Socket.IO | package.json:1, server.js:1, server.js:14053 |
| Backend (profiling) | Python 3.11 Flask app `profile_api.py` (port 8000), pandas/pyarrow/pyreadstat/fastavro; AI providers in `backend/ai_providers/*`; ML in `backend/ml/*` | profile_api.py:7, profile_api.py:2256, pyproject.toml:1 |
| Python helpers (spawned) | `utils/process_file.py`, `utils/profile_columns.py`, `utils/header_validator.py` run through `run_python_with_venv.sh` | backend/workers/fileProcessingWorker.js:1517, :1759, :1824 |
| Log service | Rust (axum) `rust-log-service` (possibly-dead: nothing starts or calls it) | rust-log-service/src/main.rs:63, rust-log-service/Cargo.toml |
| Frontend | React 18 + Vite 6 + react-router-dom 7, Redux Toolkit, React Query, reactflow, chart.js, Tailwind 4 | src/main.jsx, src/App.jsx:340, vite.config.js:5 |
| Datastore | PostgreSQL 16 (pg, psycopg2); Redis (ioredis/redis/BullMQ), optional | backend/config/database.js:8, backend/config/redis.js:5 |
| Queue | `QUEUE_TYPE` = memory (default) / redis; aws/gcp are stubs that fall back to memory | backend/queue/queueFactory.js:42-88 |
| DI | Container that auto-registers every file in `backend/services` | backend/di/services.js:33, backend/di/bootstrapper.js |
| Build/run | `npm run dev` (server.js + vite), `npm run build` (vite build), `seed:production` | package.json:5-12 |
| Replit | Workflows: react-dev-server (vite :5000), api-server (`node server.js`), profile-api-server (`python profile_api.py`); deploy runs `node productionBootstrap.js` on GCE | .replit:9, .replit:15-65 |
| Prod bootstrap | Spawns `python profile_api.py` and `node server.js`, proxies the public port, runs a readiness poll | productionBootstrap.js:33, :49, :95, :139 |
| CI/CD | GitHub Actions: SSH deploy to EC2 + pm2 on push to `prod`; Sonar workflow | .github/workflows/prod-deployment.yml:3, .github/workflows/sonar.yml |
| Tests | Jest (backend), Vitest (frontend), pytest (python) via Makefile | Makefile:10-34 |
| Schema snapshots | Prod DDL dumps (the authoritative table list) | attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql, database_ddl_2026-01-07.sql, attached_assets/database_ddl_1767770486833.sql |

### Auth legend (used in the route tables)
- **JWT**: `authenticateToken` from backend/src/middleware/authenticate.js:17 (the one server.js uses, server.js:406).
- **JWT\***: the separate `backend/middleware/authenticate.js` (50 lines). Some routers use it instead. These are two different implementations.
- **ADMIN**: `requireAdmin` at server.js:5417. dropLocation.js:9, digestRoutes.js:18 and jiraRoutes.js:102 each define their own local copy.
- **APITOKEN**: `authenticateAPIToken` at backend/middleware/apiTokenAuth.js:19.
- **PRA**: `authorizeProjectResource` (backend/middleware/authorizeProjectResource.js). **RPA**: `requireProjectAccess` (backend/middleware/requireProjectAccess.js).
- **PERM(x)**: `requirePermission`/`authorize(x)` (backend/middleware/vendorPermissions.js:36, backend/middleware/authorize.js:17).
- **VEND**: `attachVendorProfile` (backend/middleware/vendorAccessControl.js:14).
- **implicit-JWT**: inline `/api/files/*` routes registered after server.js:5283 (`app.use('/api/files', authenticateToken, schemaHistoryRoutes)`). That mount runs JWT for every `/api/files/*` request, so these routes are authenticated even though they declare no auth themselves.
- Global middleware: helmet (server.js:467), compression (:499), CORS from `ALLOWED_ORIGINS` (:517), bodyParser 50mb (:556), session (:593), audit middleware (:606), extractFileId (:609), request timeouts (:612), general rate limit on `/api/` (:767). There is **no global auth**.

---

## 1. HTTP routes

### 1a. Inline routes in server.js

| Method | Path | Handler | Auth | Area | Notes |
|---|---|---|---|---|---|
| GET | / (production only) | server.js:575 | none | PLT | Deploy health probe / SPA index |
| GET | /api/files/:fileId/status | server.js:703 | JWT | PROC | Placed before the rate limiter for polling |
| USE | /api/ (generalLimiter) | server.js:767 | - | SEC | Skips /health/ready and /health/live |
| GET | /health-check | server.js:1027 | none | OPS | |
| GET | /api/health | server.js:1033 | none | OPS | Shadows healthCheckRoutes GET / |
| USE | /api/health -> healthCheckRoutes | server.js:1039 | none | OPS | |
| GET | /api/health/db | server.js:1042 | none | OPS | |
| GET | /api/health/enterprise | server.js:1069 | none | OPS | Shows queue type, view status, DB stats |
| GET | /api/health/ready | server.js:1180 | none | OPS | |
| GET | /api/health/live | server.js:1203 | none | OPS | |
| GET | /api/queue/metrics | server.js:1208 | none | OPS | |
| GET | /api/test-di | server.js:1228 | none | OPS | Debug endpoint |
| GET | /api/rdm/datasets | server.js:1258 | JWT | RDM | Shadows backend/routes/rdm.js:22 |
| GET | /api/rdm/datasets/:datasetId/schema | server.js:1293 | JWT | RDM | Shadows rdm.js:60 |
| GET | /api/rdm/crosswalks | server.js:1330 | JWT | RDM | Shadows rdm.js:126 |
| GET | /api/rdm/crosswalks/:crosswalkId/schema | server.js:1365 | JWT | RDM | Shadows rdm.js:164 |
| GET | /api/files/init-data | server.js:1406 | JWT, VEND | FILE | |
| GET | /api/files | server.js:1531 | JWT, VEND, cache300 | FILE | |
| GET | /api/vendor-files | server.js:1626 | JWT, VEND, cache300 | VND | |
| DELETE | /api/vendor-files/bulk | server.js:1727 | JWT | VND | |
| GET | /api/files/:fileId/schema | server.js:1822 | JWT, cache600, RPA | SCH | |
| GET | /api/files/:fileId | server.js:1875 | JWT, VEND, cache120 | FILE | |
| GET | /api/files/:fileId/preview | server.js:1921 | JWT, cache300, PRA | FILE | Applies column access control |
| DELETE | /api/files/:fileId/preview-data | server.js:2022 | JWT, PRA | FILE | |
| DELETE | /api/files/:fileId | server.js:2066 | JWT, PRA | FILE | |
| POST | /api/files/bulk-delete | server.js:2128 | JWT | FILE | |
| GET | /api/files/:fileId/copies | server.js:2266 | JWT | FILE | |
| GET | /api/vendor-file-profiling | server.js:2336 | JWT | VND | |
| GET | /api/vendor-file-profiling/:fileId | server.js:2442 | JWT | VND | |
| POST | /api/files/check-duplicate | server.js:2489 | JWT, uploadLimiter | ING | multer single |
| POST | /api/files/upload | server.js:2557 | JWT, uploadLimiter | ING | multer array(20); ~900-line handler |
| GET | /api/files/:fileId/job-status | server.js:3442 | **none** | PROC | Registered before the implicit-JWT mount |
| POST | /api/files/drop | server.js:3476 | JWT, uploadLimiter | ING | ~1170-line handler; calls Profile API (server.js:4294, :4812) |
| POST | /api/files/:fileId/password | server.js:4651 | JWT | ARC | Password-protected archives |
| POST | /api/files/:fileId/retry | server.js:4725 | JWT | ARC | |
| USE | /api/files/drop (error handler) | server.js:4877 | - | ING | |
| POST | /api/lineage/scan-and-populate | server.js:4927 | JWT | LIN | |
| GET | /api/badges | server.js:5100 | **none** | DASH | |
| GET | /api/alerts/history | server.js:5123 | JWT | ALRT | |
| GET | /api/audit/logs | server.js:5430 | JWT, ADMIN | AUD | |
| GET | /api/audit/logs/:auditId | server.js:5480 | JWT, ADMIN | AUD | |
| GET | /api/audit/executions/:executionId | server.js:5496 | JWT, ADMIN | AUD | |
| GET | /api/audit/data-access | server.js:5508 | JWT, ADMIN | AUD | |
| POST | /api/audit/export | server.js:5538 | JWT, ADMIN | AUD | |
| GET | /api/audit/retention-settings | server.js:5579 | JWT, ADMIN | AUD | |
| PUT | /api/audit/retention-settings | server.js:5589 | JWT, ADMIN | AUD | |
| GET | /api/audit/statistics | server.js:5606 | JWT, ADMIN | AUD | |
| GET | /api/audit/summary | server.js:5616 | JWT, ADMIN | AUD | |
| POST | /api/audit/archive | server.js:5638 | JWT, ADMIN | AUD | |
| DELETE | /api/audit/cleanup | server.js:5651 | JWT, ADMIN | AUD | |
| POST | /api/audit/frontend-error | server.js:5671 | JWT | AUD | |
| POST | /api/audit/frontend-interaction | server.js:5720 | JWT | AUD | |
| POST | /api/audit/frontend-api-error | server.js:5765 | JWT | AUD | |
| GET | /api/mappings | server.js:5959 | **none** | ETL | Legacy file_mappings; creates its table on request |
| POST | /api/mappings | server.js:6083 | **none** | ETL | |
| PUT | /api/mappings/:id | server.js:6126 | **none** | ETL | |
| DELETE | /api/mappings/:id | server.js:6176 | **none** | ETL | |
| GET | /api/mappings/:mappingId/execution-logs | server.js:6194 | JWT | ETL | |
| POST | /api/mappings/:mappingId/execution-logs | server.js:6225 | JWT | ETL | |
| GET | /api/user/dashboard-settings | server.js:6283 | **none** | DASH | |
| GET | /api/files/:fileId/full | server.js:6324 | JWT, RPA | FILE | Aggregate payload for the file detail page |
| GET | /api/files/:fileId/profile | server.js:6595 | JWT, RPA | PROF | |
| GET | /api/files/:fileId/profile-history | server.js:6741 | JWT, RPA | PROF | |
| GET | /api/files/:fileId/quality-violations | server.js:6811 | implicit-JWT | DQ | |
| POST | /api/files/:fileId/quality-rules/run | server.js:6937 | JWT | DQ | ~690 lines |
| POST | /api/files/:fileId/quality-rules/revalidate | server.js:7624 | JWT | DQ | ~790 lines; multer single |
| GET | /api/files/:fileId/quality-rules | server.js:8415 | JWT | DQ | |
| POST | /api/files/:fileId/quality-rules | server.js:8464 | JWT | DQ | |
| GET | /api/files/:fileId/ownership | server.js:8602 | implicit-JWT, cache | GOV | |
| POST | /api/files/:fileId/ownership | server.js:8623 | JWT | GOV | |
| PUT | /api/files/:fileId/ownership | server.js:8645 | JWT | GOV | |
| GET | /api/files/:fileId/fixed-width-schema | server.js:8672 | implicit-JWT | SCH | |
| POST | /api/files/:fileId/fixed-width-schema | server.js:8693 | JWT | SCH | |
| DELETE | /api/files/:fileId/fixed-width-schema | server.js:8728 | JWT | SCH | |
| POST | /api/files/:fileId/delimiter | server.js:8749 | JWT | SCH | Reprocesses with a new delimiter |
| GET | /api/files/:fileId/columns/sensitivity-tags | server.js:8962 | implicit-JWT | GOV | |
| GET | /api/files/:fileId/columns/:columnName/sensitivity-tag | server.js:8979 | implicit-JWT | GOV | |
| POST | /api/files/:fileId/columns/:columnName/sensitivity-tag | server.js:9000 | JWT | GOV | |
| DELETE | /api/files/:fileId/columns/:columnName/sensitivity-tag | server.js:9046 | JWT | GOV | |
| GET | /api/governance-policies | server.js:9074 | **none** | GOV | |
| GET | /api/governance-policies/:policyId | server.js:9088 | **none** | GOV | |
| POST | /api/governance-policies | server.js:9109 | JWT | GOV | |
| PUT | /api/governance-policies/:policyId | server.js:9146 | JWT | GOV | |
| DELETE | /api/governance-policies/:policyId | server.js:9179 | JWT | GOV | |
| GET | /api/files/:fileId/policies | server.js:9210 | implicit-JWT | GOV | |
| POST | /api/files/:fileId/policies | server.js:9231 | JWT | GOV | |
| DELETE | /api/files/:fileId/policies/:policyId | server.js:9268 | JWT | GOV | |
| GET | /api/governance-tags | server.js:9301 | **none** | GOV | |
| GET | /api/governance-tags/:tagId | server.js:9315 | **none** | GOV | |
| POST | /api/governance-tags | server.js:9336 | JWT, ADMIN | GOV | |
| PUT | /api/governance-tags/:tagId | server.js:9364 | JWT, ADMIN | GOV | |
| DELETE | /api/governance-tags/:tagId | server.js:9392 | JWT, ADMIN | GOV | |
| PUT | /api/files/:fileId/sensitivity | server.js:9417 | JWT | GOV | |
| GET | /api/files/:fileId/columns/governance | server.js:9470 | implicit-JWT | GOV | |
| GET | /api/files/:fileId/columns/:columnName/tags | server.js:9538 | implicit-JWT | GOV | |
| POST | /api/files/:fileId/columns/:columnName/tags | server.js:9559 | JWT | GOV | |
| GET | /api/files/:fileId/columns/:columnName/policies | server.js:9649 | implicit-JWT | GOV | |
| POST | /api/files/:fileId/columns/:columnName/policies | server.js:9670 | JWT | GOV | |
| GET | /api/files/:fileId/tags | server.js:9748 | implicit-JWT | GOV | |
| POST | /api/files/:fileId/tags | server.js:9769 | JWT | GOV | |
| DELETE | /api/files/:fileId/tags/:tagId | server.js:9806 | JWT | GOV | |
| GET | /api/files/:fileId/quality | server.js:9828 | implicit-JWT, cache600 | DQ | Runs CREATE TABLE in the request path (:9841, :9888) |
| POST | /api/files/:fileId/quality/recalculate | server.js:10009 | JWT | DQ | |
| GET | /api/alerts | server.js:10182 | JWT | ALRT | |
| POST | /api/auth/okta/user | server.js:10237 | none | AUTH | Okta SSO user sync / login |
| POST | /api/auth/login | server.js:10417 | authLimiter, validate | AUTH | |
| GET | /api/auth/password-requirements | server.js:10502 | none | AUTH | |
| POST | /api/auth/register | server.js:10513 | authLimiter, JWT | AUTH | |
| GET | /api/auth/me | server.js:10573 | JWT | AUTH | |
| POST | /api/auth/logout | server.js:10744 | JWT | AUTH | |
| GET | /api/secrets | server.js:10758 | **none** | SEC | Returns Okta client config and backend URL |
| GET | /api/db_url | server.js:10780 | **none** | SEC | **Returns the full DATABASE_URL to anyone.** Used by profile_api.py:182 |
| POST | /api/auth/refresh | server.js:10802 | none | AUTH | |
| POST | /api/auth/request-password-reset | server.js:10830 | authLimiter | AUTH | |
| POST | /api/auth/force-change-password | server.js:10890 | JWT | AUTH | |
| GET | /api/password-reset-requests | server.js:10934 | JWT | AUTH | |
| POST | /api/password-reset-requests/:id/approve | server.js:10972 | JWT | AUTH | |
| POST | /api/password-reset-requests/:id/deny | server.js:11038 | JWT | AUTH | |
| GET | /api/users | server.js:11087 | JWT | USR | **Shadowed** by userManagement GET / (mounted at server.js:5355) |
| GET | /api/roles/init-data | server.js:11148 | JWT | USR | |
| GET | /api/roles | server.js:11203 | JWT | USR | |
| GET | /api/permissions | server.js:11262 | JWT | USR | |
| POST | /api/roles | server.js:11282 | JWT | USR | |
| PUT | /api/roles/:id | server.js:11334 | JWT | USR | |
| DELETE | /api/roles/:id | server.js:11410 | JWT | USR | |
| GET | /api/files/:fileId/insights | server.js:11456 | JWT, cache600 | DQ | |
| POST | /api/files/:fileId/quality/check | server.js:11564 | JWT | DQ | |
| GET | /api/debug/recover-orphans | server.js:11754 | **none** | ADM | Triggers recovery and returns stack traces |
| GET | /api/debug/hash-password/:password | server.js:11798 | **none** | ADM | Marked "REMOVE IN PRODUCTION" |
| GET | /api/schedules | server.js:11862 | JWT (mount) | SCHD | **Shadowed** by scheduler.js:229 |
| GET | /api/schedules/:id | server.js:11873 | JWT (mount) | SCHD | **Shadowed** by scheduler.js:504 |
| POST | /api/schedules | server.js:11890 | JWT (mount) | SCHD | **Shadowed** by scheduler.js:123 |
| PATCH | /api/schedules/:id | server.js:11945 | JWT (mount) | SCHD | Reachable |
| DELETE | /api/job-schedules/:id | server.js:12000 | **none** | JOB | Wins over :12198 and :13055 (which has auth) |
| POST | /api/schedules/:id/run | server.js:12018 | JWT (mount) | SCHD | |
| PATCH | /api/schedules/:id | server.js:12075 | JWT (mount) | SCHD | **Dead duplicate** of :11945 |
| DELETE | /api/job-schedules/:id | server.js:12198 | none | JOB | **Dead duplicate** |
| GET | /api/files/:fileId/schedules | server.js:12220 | implicit-JWT | SCHD | |
| GET | /api/business-processes | server.js:12239 | JWT | BPR | |
| GET | /api/business-processes/:id | server.js:12327 | JWT | BPR | |
| POST | /api/business-processes | server.js:12390 | JWT | BPR | |
| PUT | /api/business-processes/:id | server.js:12462 | JWT | BPR | |
| DELETE | /api/business-processes/:id | server.js:12524 | JWT | BPR | |
| GET | /api/jobs | server.js:12558 | JWT | JOB | **Shadowed** by jobs.js:252 |
| GET | /api/jobs/:id | server.js:12653 | JWT | JOB | **Shadowed** by jobs.js:390 |
| GET | /api/jobs/:jobId/profiles | server.js:12745 | JWT | JOB | |
| POST | /api/jobs | server.js:12819 | JWT | JOB | |
| GET | /api/job-schedules | server.js:12916 | JWT | JOB | |
| GET | /api/jobs/:jobId/job-schedules | server.js:12931 | JWT | JOB | |
| POST | /api/job-schedules | server.js:12942 | JWT | JOB | |
| PUT | /api/job-schedules/:id | server.js:13003 | JWT | JOB | |
| DELETE | /api/job-schedules/:id | server.js:13055 | JWT | JOB | **Dead**: :12000 matches first |
| POST | /api/job-schedules/:id/enable | server.js:13072 | JWT | JOB | |
| POST | /api/job-schedules/:id/disable | server.js:13092 | JWT | JOB | |
| PUT | /api/jobs/:id | server.js:13113 | JWT | JOB | |
| DELETE | /api/jobs/:id | server.js:13211 | JWT | JOB | |
| POST | /api/jobs/:id/run | server.js:13242 | JWT | JOB | |
| GET | /api/process-wizard/init-data | server.js:13293 | JWT | BPR | |
| GET | /api/groups | server.js:13326 | JWT | GRP | **Shadowed** by groupRoutes GET / |
| GET | /api/user/groups | server.js:13354 | JWT | GRP | |
| POST | /api/groups | server.js:13375 | JWT | GRP | **Shadowed** by groupRoutes POST / |
| PUT | /api/groups/:id | server.js:13406 | JWT | GRP | **Shadowed** |
| DELETE | /api/groups/:id | server.js:13436 | JWT | GRP | **Shadowed** |
| POST | /api/groups/:id/users | server.js:13462 | JWT | GRP | Reachable |
| DELETE | /api/groups/:groupId/users/:userId | server.js:13500 | JWT | GRP | Reachable |
| GET | /api/job-groups | server.js:13570 | JWT | BPR | |
| GET | /api/job-groups/:id | server.js:13624 | JWT | BPR | |
| POST | /api/job-groups | server.js:13675 | JWT | BPR | Creates tables on request (:13686-13706) |
| PUT | /api/job-groups/:id | server.js:13758 | JWT | BPR | |
| DELETE | /api/job-groups/:id | server.js:13784 | JWT | BPR | |
| POST | /api/job-groups/:id/jobs | server.js:13810 | JWT | BPR | |
| DELETE | /api/job-groups/:id/jobs/:jobId | server.js:13847 | JWT | BPR | |
| USE | /profile-api/* -> Flask :8000 (production only) | server.js:13983 | **none** | PROF/AI | Public proxy to every Flask route |
| USE | static dist + SPA fallback (production only) | server.js:14007, :14011 | none | WEB | |
| USE | 404 + errorHandler | server.js:14030, :14041 | - | PLT | |

### 1b. Router mounts (server.js)

| Prefix | Router file | Mount line | Mount auth |
|---|---|---|---|
| /api/health | backend/routes/healthCheckRoutes.js | server.js:1039 | none |
| /api/connections | backend/routes/connectionRoutes.js | server.js:5171 | JWT |
| /api/connections | backend/routes/connectionBrowse.js | server.js:5175 | JWT |
| /api/cache | backend/routes/cacheRoutes.js | server.js:5179 | none (JWT\* per route) |
| /api/drop-location | backend/routes/dropLocation.js | server.js:5185 | JWT (+ local ADMIN) |
| /api/bulk-profiling | backend/routes/bulkProfiling.js | server.js:5190 | JWT (+JWT\*) |
| /api/schema-validation | backend/routes/schemaValidation.js | server.js:5199 | JWT (+JWT\*) |
| /api/transformations | backend/routes/transformations.js | server.js:5208 | JWT |
| /api/lineage | backend/routes/lineageRoutes.js | server.js:5217 | JWT |
| /api/lineage-graph | server/routes/lineageGraph.js | server.js:5226 | none (JWT per route) |
| /api/jobs | backend/routes/jobs.js | server.js:5235 | JWT |
| /api/mapping-groups | backend/routes/mappingGroups.js | server.js:5244 | JWT |
| /api/workflow-steps | backend/routes/workflowSteps.js | server.js:5253 | JWT |
| /api/n-step-workflows | backend/routes/nStepWorkflows.js | server.js:5262 | JWT |
| /api/schedules | backend/routes/scheduler.js | server.js:5271 | JWT |
| /api/file-audit | backend/routes/fileAudit.js | server.js:5280 | JWT |
| /api/files | backend/routes/schemaHistory.js | server.js:5283 | JWT (applies to **every** later /api/files/* request) |
| /api/audit-ledger | backend/routes/auditLedger.js | server.js:5292 | JWT |
| /api/dashboard | backend/routes/dashboard.js | server.js:5301 | JWT (+ prerequisite gate dashboard.js:65) |
| /api/insights | backend/routes/fileInsights.js | server.js:5310 | per route (JWT injected) |
| /api/quality-rules | backend/routes/qualityRules.js | server.js:5319 | per route (JWT injected) |
| /api/error-review | backend/routes/errorReview.js | server.js:5328 | JWT |
| /api/visual-workflows | backend/routes/visualWorkflows.js | server.js:5337 | JWT |
| /api/visual-mappings | backend/routes/visualMappings.js | server.js:5346 | JWT |
| /api/users | backend/routes/userManagement.js | server.js:5355 | none (JWT\* per route; 3 routes open) |
| /api/policies | backend/routes/policyRoutes.js | server.js:5364 | JWT |
| /api/projects | backend/routes/projectRoutes.js | server.js:5373 | JWT |
| /api/projects | backend/routes/subProjects.js | server.js:5384 | JWT |
| /api/groups | backend/routes/groupRoutes.js | server.js:5393 | JWT |
| /api/retention-policies | backend/routes/retentionRoutes.js | server.js:5402 | per route JWT + PERM(settings:*) |
| /api/ml | backend/routes/anomalyRoutes.js | server.js:5406 | **none** |
| /api/ml | backend/routes/healingRoutes.js | server.js:5410 | **none** |
| /api/ai | backend/routes/aiRoutes.js | server.js:13866 | JWT |
| /api/admin/cleanup | backend/routes/adminCleanupRoutes.js | server.js:13871 | JWT, ADMIN |
| /api/admin | backend/routes/adminSettingsRoutes.js | server.js:13876 | JWT, ADMIN |
| /api/vendors | backend/routes/vendorRoutes.js | server.js:13881 | JWT |
| /api/vendor-agreements | backend/routes/vendorAgreementRoutes.js | server.js:13886 | JWT |
| /api/vendor-sla | backend/routes/vendorSLARoutes.js | server.js:13891 | JWT |
| /api/vendor-agreements | backend/routes/vendorAgreementFileSchemaRoutes.js | server.js:13896 | JWT |
| /api/vendor-access | backend/routes/vendorAccessRoutes.js | server.js:13901 | JWT |
| /api | backend/routes/vendorAgreementTemplateRoutes.js | server.js:13906 | per route JWT\* |
| /api/notifications | backend/routes/notifications.js | server.js:13911 | router.use JWT after /health (notifications.js:51) |
| /api/digest-subscriptions | backend/routes/digestRoutes.js | server.js:13916 | router JWT + ADMIN (digestRoutes.js:44-45) |
| /api/rdm | backend/routes/rdm.js | server.js:13921 | JWT |
| /api/alert-policies | backend/routes/alertPolicyRoutes.js | server.js:13926 | JWT |
| /api/email-connections | backend/routes/emailConnectionRoutes.js | server.js:13931 | JWT |
| /api/jira | backend/routes/jiraRoutes.js | server.js:13936 | JWT |
| /api/allowed-email-domains | backend/routes/allowedEmailDomainsRoutes.js | server.js:13941 | JWT, ADMIN |
| /api/alert-history | backend/routes/alertHistoryRoutes.js | server.js:13946 | JWT |
| /api/uploads | backend/routes/uploadRoutes.js | server.js:13951 | none (APITOKEN per route) |
| /api/tokens | backend/routes/apiTokenRoutes.js | server.js:13956 | none (JWT\* per route) |
| /api/dlq-jobs | backend/routes/dlqRoutes.js | server.js:13961 | JWT |

### 1c. Router routes (full path = mount prefix + router path; mount auth applies unless "Auth" adds more)

| Method | Full path | Handler | Extra auth | Area | Notes |
|---|---|---|---|---|---|
| GET | /api/health/ | backend/routes/healthCheckRoutes.js:31 | none | OPS | Shadowed by server.js:1033 |
| GET | /api/health/python | backend/routes/healthCheckRoutes.js:55 | none | OPS | Spawns python3 (:85) |
| GET | /api/admin/cleanup/counts | backend/routes/adminCleanupRoutes.js:16 | - | ADM | |
| POST | /api/admin/cleanup/ | backend/routes/adminCleanupRoutes.js:199 | - | ADM | |
| GET | /api/admin/settings | backend/routes/adminSettingsRoutes.js:15 | - | ADM | |
| PUT | /api/admin/settings/:key | backend/routes/adminSettingsRoutes.js:33 | - | ADM | |
| GET | /api/admin/profile-stats | backend/routes/adminSettingsRoutes.js:76 | - | ADM | |
| POST | /api/admin/cleanup-profiles | backend/routes/adminSettingsRoutes.js:101 | - | ADM | |
| GET | /api/ai/related-datasets/:fileId | backend/routes/aiRoutes.js:24 | - | AI | |
| GET | /api/ai/relationship-explanation | backend/routes/aiRoutes.js:47 | - | AI | |
| GET | /api/ai/file-embedding/:fileId | backend/routes/aiRoutes.js:69 | - | AI | |
| POST | /api/ai/chat | backend/routes/aiRoutes.js:99 | - | AI | |
| GET | /api/alert-history/runs | backend/routes/alertHistoryRoutes.js:13 | - | ALRT | |
| GET | /api/alert-history/runs/:run_id/events | backend/routes/alertHistoryRoutes.js:136 | - | ALRT | |
| GET | /api/alert-history/runs/:run_id/delivery-details | backend/routes/alertHistoryRoutes.js:199 | - | ALRT | |
| GET | /api/alert-policies/ | backend/routes/alertPolicyRoutes.js:14 | - | ALRT | |
| GET | /api/alert-policies/:id | backend/routes/alertPolicyRoutes.js:68 | PRA | ALRT | |
| POST | /api/alert-policies/ | backend/routes/alertPolicyRoutes.js:125 | PRA | ALRT | |
| PUT | /api/alert-policies/:id | backend/routes/alertPolicyRoutes.js:224 | PRA | ALRT | |
| DELETE | /api/alert-policies/:id | backend/routes/alertPolicyRoutes.js:348 | PRA | ALRT | |
| POST | /api/alert-policies/:id/recipients | backend/routes/alertPolicyRoutes.js:391 | PRA | ALRT | |
| GET | /api/alert-policies/:id/recipients | backend/routes/alertPolicyRoutes.js:462 | PRA | ALRT | |
| DELETE | /api/alert-policies/:id/recipients/:recipientId | backend/routes/alertPolicyRoutes.js:499 | PRA | ALRT | |
| GET | /api/alert-policies/:id/runs | backend/routes/alertPolicyRoutes.js:544 | PRA | ALRT | |
| GET | /api/allowed-email-domains/ | backend/routes/allowedEmailDomainsRoutes.js:6 | - | EML | |
| POST | /api/allowed-email-domains/ | backend/routes/allowedEmailDomainsRoutes.js:27 | - | EML | |
| PUT | /api/allowed-email-domains/:id | backend/routes/allowedEmailDomainsRoutes.js:79 | - | EML | |
| DELETE | /api/allowed-email-domains/:id | backend/routes/allowedEmailDomainsRoutes.js:163 | - | EML | |
| POST | /api/allowed-email-domains/validate | backend/routes/allowedEmailDomainsRoutes.js:199 | - | EML | |
| GET | /api/ml/anomalies | backend/routes/anomalyRoutes.js:9 | **none** | ANOM | Unauthenticated |
| GET | /api/ml/anomalies/statistics | backend/routes/anomalyRoutes.js:84 | **none** | ANOM | |
| POST | /api/ml/anomalies/:anomaly_id/resolve | backend/routes/anomalyRoutes.js:152 | **none** | ANOM | Unauthenticated write |
| GET | /api/ml/anomalies/file/:file_id | backend/routes/anomalyRoutes.js:209 | **none** | ANOM | |
| GET | /api/ml/recommendations/:anomaly_id | backend/routes/healingRoutes.js:10 | **none** | ANOM | |
| POST | /api/tokens/ | backend/routes/apiTokenRoutes.js:9 | JWT\* | API | |
| GET | /api/tokens/ | backend/routes/apiTokenRoutes.js:50 | JWT\* | API | |
| GET | /api/tokens/:tokenId/usage | backend/routes/apiTokenRoutes.js:76 | JWT\* | API | |
| DELETE | /api/tokens/:tokenId | backend/routes/apiTokenRoutes.js:97 | JWT\* | API | |
| DELETE | /api/tokens/:tokenId/permanent | backend/routes/apiTokenRoutes.js:119 | JWT\* | API | |
| POST | /api/tokens/bulk-delete | backend/routes/apiTokenRoutes.js:141 | JWT\* | API | |
| POST | /api/bulk-profiling/browse | backend/routes/bulkProfiling.js:18 | JWT\* | BULK | |
| POST | /api/bulk-profiling/discover | backend/routes/bulkProfiling.js:53 | JWT\* | BULK | |
| POST | /api/bulk-profiling/jobs | backend/routes/bulkProfiling.js:90 | JWT\* | BULK | |
| GET | /api/bulk-profiling/jobs | backend/routes/bulkProfiling.js:141 | JWT\* | BULK | |
| GET | /api/bulk-profiling/jobs/:jobId | backend/routes/bulkProfiling.js:173 | JWT\* | BULK | |
| POST | /api/bulk-profiling/jobs/:jobId/start | backend/routes/bulkProfiling.js:204 | JWT\* | BULK | |
| DELETE | /api/bulk-profiling/jobs/:jobId | backend/routes/bulkProfiling.js:229 | JWT\* | BULK | |
| GET | /api/bulk-profiling/schedules | backend/routes/bulkProfiling.js:270 | JWT\* | BULK | |
| PUT | /api/bulk-profiling/schedules/:scheduleId | backend/routes/bulkProfiling.js:305 | JWT\* | BULK | |
| DELETE | /api/bulk-profiling/schedules/:scheduleId | backend/routes/bulkProfiling.js:330 | JWT\* | BULK | |
| GET | /api/audit-ledger/ | backend/routes/auditLedger.js:5 | - | LEDG | |
| GET | /api/audit-ledger/job/:jobId | backend/routes/auditLedger.js:53 | - | LEDG | |
| GET | /api/audit-ledger/correlation/:correlationId | backend/routes/auditLedger.js:77 | - | LEDG | |
| POST | /api/audit-ledger/verify | backend/routes/auditLedger.js:101 | - | LEDG | |
| GET | /api/audit-ledger/verification-history | backend/routes/auditLedger.js:129 | - | LEDG | |
| GET | /api/audit-ledger/export/job/:jobId | backend/routes/auditLedger.js:148 | - | LEDG | |
| GET | /api/audit-ledger/export/correlation/:correlationId | backend/routes/auditLedger.js:182 | - | LEDG | |
| GET | /api/audit-ledger/stats | backend/routes/auditLedger.js:216 | - | LEDG | |
| GET | /api/cache/stats | backend/routes/cacheRoutes.js:21 | JWT\* | ADM | |
| DELETE | /api/cache/flush | backend/routes/cacheRoutes.js:44 | JWT\* | ADM | Any authenticated user can flush (no admin check seen) |
| DELETE | /api/cache/invalidate/:pattern | backend/routes/cacheRoutes.js:68 | JWT\* | ADM | |
| GET | /api/connections/:id/browse | backend/routes/connectionBrowse.js:21 | - | CONN | |
| POST | /api/connections/infer-schema | backend/routes/connectionBrowse.js:289 | - | CONN | |
| GET | /api/connections/ | backend/routes/connectionRoutes.js:18 | - | CONN | |
| GET | /api/connections/:id | backend/routes/connectionRoutes.js:100 | - | CONN | |
| POST | /api/connections/ | backend/routes/connectionRoutes.js:190 | - | CONN | |
| PUT | /api/connections/:id | backend/routes/connectionRoutes.js:465 | - | CONN | |
| GET | /api/connections/:id/dependencies | backend/routes/connectionRoutes.js:767 | - | CONN | |
| DELETE | /api/connections/:id | backend/routes/connectionRoutes.js:866 | - | CONN | |
| PATCH | /api/connections/:id/soft-delete | backend/routes/connectionRoutes.js:982 | - | CONN | |
| PATCH | /api/connections/:id/restore | backend/routes/connectionRoutes.js:1035 | - | CONN | |
| GET | /api/connections/:id/test | backend/routes/connectionRoutes.js:1088 | - | CONN | |
| POST | /api/connections/:id/test | backend/routes/connectionRoutes.js:1145 | - | CONN | |
| POST | /api/connections/test | backend/routes/connectionRoutes.js:1325 | - | CONN | |
| POST | /api/connections/:id/browse | backend/routes/connectionRoutes.js:1493 | - | CONN | |
| GET | /api/dashboard/metrics | backend/routes/dashboard.js:82 | cache | DASH | |
| GET | /api/dashboard/executive-metrics | backend/routes/dashboard.js:243 | cache | DASH | ~720 lines |
| GET | /api/dashboard/project-health-scores | backend/routes/dashboard.js:966 | cache | DASH | |
| GET | /api/dashboard/file-type-distribution | backend/routes/dashboard.js:1086 | cache | DASH | |
| GET | /api/dashboard/job-trend | backend/routes/dashboard.js:1201 | cache | DASH | |
| GET | /api/dashboard/schema-drift-trend | backend/routes/dashboard.js:1307 | cache | DASH | |
| GET | /api/dashboard/quality-violations-trend | backend/routes/dashboard.js:1415 | cache | DASH | |
| GET | /api/dashboard/metric-trends | backend/routes/dashboard.js:1534 | cache | DASH | |
| GET | /api/digest-subscriptions/ | backend/routes/digestRoutes.js:73 | ADMIN | NTF | |
| GET | /api/digest-subscriptions/:id | backend/routes/digestRoutes.js:95 | ADMIN | NTF | |
| POST | /api/digest-subscriptions/ | backend/routes/digestRoutes.js:115 | ADMIN | NTF | |
| PUT | /api/digest-subscriptions/:id | backend/routes/digestRoutes.js:155 | ADMIN | NTF | |
| DELETE | /api/digest-subscriptions/:id | backend/routes/digestRoutes.js:214 | ADMIN | NTF | |
| POST | /api/digest-subscriptions/:id/send-test | backend/routes/digestRoutes.js:232 | ADMIN | NTF | |
| GET | /api/digest-subscriptions/:id/history | backend/routes/digestRoutes.js:257 | ADMIN | NTF | |
| GET | /api/dlq-jobs/ | backend/routes/dlqRoutes.js:9 | - | ARC | |
| GET | /api/dlq-jobs/statistics | backend/routes/dlqRoutes.js:43 | - | ARC | |
| GET | /api/dlq-jobs/:id | backend/routes/dlqRoutes.js:64 | - | ARC | |
| POST | /api/dlq-jobs/:id/retry | backend/routes/dlqRoutes.js:96 | - | ARC | |
| POST | /api/dlq-jobs/:id/provide-password | backend/routes/dlqRoutes.js:188 | - | ARC | |
| DELETE | /api/dlq-jobs/:id | backend/routes/dlqRoutes.js:305 | - | ARC | |
| GET | /api/drop-location/config | backend/routes/dropLocation.js:21 | ADMIN(local) | ING | |
| POST | /api/drop-location/config | backend/routes/dropLocation.js:65 | ADMIN(local) | ING | |
| DELETE | /api/drop-location/config | backend/routes/dropLocation.js:209 | ADMIN(local) | ING | |
| GET | /api/drop-location/credentials | backend/routes/dropLocation.js:222 | ADMIN(local) | ING | Returns credentials |
| GET | /api/drop-location/test | backend/routes/dropLocation.js:257 | ADMIN(local) | ING | |
| POST | /api/drop-location/test | backend/routes/dropLocation.js:313 | ADMIN(local) | ING | S3/GCS/Azure (:407, :492, :550) |
| GET | /api/email-connections/ | backend/routes/emailConnectionRoutes.js:14 | - | EML | |
| GET | /api/email-connections/:connectionId | backend/routes/emailConnectionRoutes.js:51 | - | EML | |
| POST | /api/email-connections/ | backend/routes/emailConnectionRoutes.js:91 | - | EML | |
| PUT | /api/email-connections/:connectionId | backend/routes/emailConnectionRoutes.js:168 | - | EML | |
| DELETE | /api/email-connections/:connectionId | backend/routes/emailConnectionRoutes.js:225 | - | EML | |
| POST | /api/email-connections/:connectionId/test | backend/routes/emailConnectionRoutes.js:261 | - | EML | |
| POST | /api/email-connections/oauth2/authorize-url | backend/routes/emailConnectionRoutes.js:382 | - | EML | |
| POST | /api/email-connections/oauth2/gmail/auth | backend/routes/emailConnectionRoutes.js:477 | PRA | EML | |
| POST | /api/email-connections/oauth2/outlook/auth | backend/routes/emailConnectionRoutes.js:557 | PRA | EML | |
| GET | /api/email-connections/oauth2/gmail/callback | backend/routes/emailConnectionRoutes.js:636 | - | EML | OAuth redirect target, but sits behind JWT at the mount (may never receive a token) |
| GET | /api/email-connections/oauth2/outlook/callback | backend/routes/emailConnectionRoutes.js:741 | - | EML | Same concern |
| POST | /api/email-connections/oauth2/callback | backend/routes/emailConnectionRoutes.js:844 | PRA | EML | Used by the SPA /oauth2-callback |
| GET | /api/error-review/file-upload-violations | backend/routes/errorReview.js:23 | - | ERR | |
| GET | /api/error-review/mapping-job-violations | backend/routes/errorReview.js:166 | - | ERR | |
| PATCH | /api/error-review/violations/:id/status | backend/routes/errorReview.js:335 | - | ERR | |
| POST | /api/error-review/violations/bulk-update | backend/routes/errorReview.js:382 | - | ERR | |
| GET | /api/error-review/file-upload-violations/groups | backend/routes/errorReview.js:418 | - | ERR | |
| GET | /api/error-review/mapping-job-violations/groups | backend/routes/errorReview.js:555 | - | ERR | |
| GET | /api/error-review/file-upload-violations/download | backend/routes/errorReview.js:695 | - | ERR | |
| GET | /api/error-review/mapping-job-violations/download | backend/routes/errorReview.js:868 | - | ERR | |
| POST | /api/error-review/bulk-delete | backend/routes/errorReview.js:1050 | - | ERR | |
| POST | /api/file-audit/ | backend/routes/fileAudit.js:15 | - | LEDG | |
| POST | /api/file-audit/schema | backend/routes/fileAudit.js:51 | - | LEDG | |
| GET | /api/file-audit/:auditId/logs | backend/routes/fileAudit.js:82 | - | LEDG | |
| GET | /api/file-audit/:fileId | backend/routes/fileAudit.js:139 | - | LEDG | |
| GET | /api/file-audit/unique-mappings | backend/routes/fileAudit.js:172 | - | LEDG | **Shadowed** by /:fileId (:139) |
| GET | /api/file-audit/ | backend/routes/fileAudit.js:272 | - | LEDG | |
| DELETE | /api/file-audit/correlation/:correlationId | backend/routes/fileAudit.js:337 | - | LEDG | |
| DELETE | /api/file-audit/cleanup | backend/routes/fileAudit.js:367 | - | LEDG | |
| GET | /api/insights/file-patterns | backend/routes/fileInsights.js:22 | JWT | DASH | |
| GET | /api/insights/file-patterns/:pattern/metrics | backend/routes/fileInsights.js:66 | JWT | DASH | |
| GET | /api/insights/file-patterns/:pattern/alerts | backend/routes/fileInsights.js:138 | JWT | DASH | |
| POST | /api/insights/aggregate | backend/routes/fileInsights.js:168 | JWT | DASH | |
| POST | /api/insights/cleanup | backend/routes/fileInsights.js:196 | JWT | DASH | |
| GET | /api/insights/stats | backend/routes/fileInsights.js:222 | JWT | DASH | |
| GET | /api/groups/ | backend/routes/groupRoutes.js:54 | - | GRP | |
| GET | /api/groups/init-data | backend/routes/groupRoutes.js:110 | - | GRP | |
| GET | /api/groups/:groupId | backend/routes/groupRoutes.js:170 | - | GRP | |
| POST | /api/groups/ | backend/routes/groupRoutes.js:223 | - | GRP | |
| PUT | /api/groups/:groupId | backend/routes/groupRoutes.js:309 | - | GRP | |
| DELETE | /api/groups/:groupId | backend/routes/groupRoutes.js:380 | - | GRP | |
| POST | /api/groups/:groupId/members | backend/routes/groupRoutes.js:406 | - | GRP | |
| DELETE | /api/groups/:groupId/members/:userId | backend/routes/groupRoutes.js:439 | - | GRP | |
| POST | /api/groups/:groupId/roles | backend/routes/groupRoutes.js:469 | - | GRP | |
| DELETE | /api/groups/:groupId/roles/:roleId | backend/routes/groupRoutes.js:508 | - | GRP | |
| GET | /api/jira/connections | backend/routes/jiraRoutes.js:112 | - | JIRA | |
| POST | /api/jira/connections/test | backend/routes/jiraRoutes.js:149 | ADMIN(local) | JIRA | |
| POST | /api/jira/connections | backend/routes/jiraRoutes.js:210 | ADMIN(local) | JIRA | |
| PUT | /api/jira/connections/:id | backend/routes/jiraRoutes.js:260 | ADMIN(local) | JIRA | |
| DELETE | /api/jira/connections/:id | backend/routes/jiraRoutes.js:318 | ADMIN(local) | JIRA | |
| GET | /api/jobs/stats/summary | backend/routes/jobs.js:18 | - | JOB | |
| GET | /api/jobs/v2 | backend/routes/jobs.js:125 | - | JOB | |
| GET | /api/jobs/ | backend/routes/jobs.js:252 | - | JOB | |
| GET | /api/jobs/:id | backend/routes/jobs.js:390 | - | JOB | |
| GET | /api/jobs/:id/logs | backend/routes/jobs.js:421 | - | JOB | |
| POST | /api/jobs/:id/cancel | backend/routes/jobs.js:464 | - | JOB | |
| GET | /api/jobs/:id/anomalies | backend/routes/jobs.js:511 | - | JOB | |
| GET | /api/jobs/:id/metrics | backend/routes/jobs.js:560 | - | JOB | |
| GET | /api/jobs/:id/profiling | backend/routes/jobs.js:594 | - | JOB | |
| GET | /api/jobs/:id/full | backend/routes/jobs.js:685 | - | JOB | |
| GET | /api/lineage/:fileId/pii-columns | backend/routes/lineageRoutes.js:36 | - | LIN | |
| GET | /api/lineage/:fileId/pii-impact | backend/routes/lineageRoutes.js:150 | - | LIN | |
| GET | /api/lineage/ | backend/routes/lineageRoutes.js:280 | - | LIN | |
| POST | /api/lineage/bulk-delete | backend/routes/lineageRoutes.js:463 | JWT\* | LIN | |
| GET | /api/lineage-graph/graph | server/routes/lineageGraph.js:23 | JWT | LIN | |
| GET | /api/lineage-graph/node-detail | server/routes/lineageGraph.js:111 | JWT | LIN | |
| GET | /api/lineage-graph/node/:nodeId | server/routes/lineageGraph.js:155 | JWT | LIN | |
| POST | /api/lineage-graph/export | server/routes/lineageGraph.js:230 | JWT | LIN | |
| GET | /api/lineage-graph/filters | server/routes/lineageGraph.js:282 | JWT | LIN | |
| DELETE | /api/lineage-graph/cache | server/routes/lineageGraph.js:354 | JWT | LIN | |
| GET | /api/lineage-graph/saved | server/routes/lineageGraph.js:406 | JWT | LIN | |
| GET | /api/lineage-graph/saved/:id | server/routes/lineageGraph.js:482 | JWT | LIN | |
| POST | /api/lineage-graph/saved | server/routes/lineageGraph.js:523 | JWT | LIN | |
| PUT | /api/lineage-graph/saved/:id | server/routes/lineageGraph.js:572 | JWT | LIN | |
| DELETE | /api/lineage-graph/saved/:id | server/routes/lineageGraph.js:642 | JWT | LIN | |
| POST | /api/lineage-graph/saved/:id/refresh | server/routes/lineageGraph.js:681 | JWT | LIN | |
| GET | /api/mapping-groups/ | backend/routes/mappingGroups.js:19 | - | MGRP | |
| GET | /api/mapping-groups/:id | backend/routes/mappingGroups.js:74 | PRA | MGRP | |
| POST | /api/mapping-groups/ | backend/routes/mappingGroups.js:129 | PRA | MGRP | |
| PUT | /api/mapping-groups/:id | backend/routes/mappingGroups.js:175 | PRA | MGRP | |
| DELETE | /api/mapping-groups/:id | backend/routes/mappingGroups.js:253 | PRA | MGRP | |
| GET | /api/mapping-groups/:id/members | backend/routes/mappingGroups.js:292 | PRA | MGRP | |
| POST | /api/mapping-groups/:id/members | backend/routes/mappingGroups.js:326 | PRA | MGRP | |
| DELETE | /api/mapping-groups/:id/members/:memberId | backend/routes/mappingGroups.js:376 | PRA | MGRP | |
| PUT | /api/mapping-groups/:id/members | backend/routes/mappingGroups.js:421 | PRA | MGRP | |
| POST | /api/mapping-groups/:id/execute | backend/routes/mappingGroups.js:483 | PRA | MGRP | |
| GET | /api/mapping-groups/:id/executions | backend/routes/mappingGroups.js:541 | - | MGRP | |
| GET | /api/mapping-groups/:id/executions/:executionId | backend/routes/mappingGroups.js:562 | - | MGRP | |
| GET | /api/mapping-groups/init-data | backend/routes/mappingGroups.js:587 | - | MGRP | **Likely shadowed** by /:id (:74) and has no numeric guard; called by src/pages/MappingGroupForm.jsx:38 |
| GET | /api/notifications/health | backend/routes/notifications.js:14 | none | NTF | |
| GET | /api/notifications/ | backend/routes/notifications.js:54 | JWT | NTF | |
| GET | /api/notifications/count | backend/routes/notifications.js:151 | JWT | NTF | |
| PUT | /api/notifications/:id/read | backend/routes/notifications.js:174 | JWT | NTF | |
| PUT | /api/notifications/:id/unread | backend/routes/notifications.js:214 | JWT | NTF | |
| PUT | /api/notifications/read-all | backend/routes/notifications.js:254 | JWT | NTF | |
| DELETE | /api/notifications/:id | backend/routes/notifications.js:277 | JWT | NTF | |
| POST | /api/notifications/ | backend/routes/notifications.js:315 | JWT | NTF | |
| GET | /api/n-step-workflows/ | backend/routes/nStepWorkflows.js:50 | - | WFL | |
| GET | /api/n-step-workflows/:id | backend/routes/nStepWorkflows.js:111 | - | WFL | Has a numeric guard that calls next() |
| POST | /api/n-step-workflows/ | backend/routes/nStepWorkflows.js:191 | PRA | WFL | |
| PUT | /api/n-step-workflows/:id | backend/routes/nStepWorkflows.js:246 | - | WFL | |
| DELETE | /api/n-step-workflows/:id | backend/routes/nStepWorkflows.js:332 | - | WFL | |
| POST | /api/n-step-workflows/:id/steps | backend/routes/nStepWorkflows.js:374 | - | WFL | |
| POST | /api/n-step-workflows/:id/steps/next | backend/routes/nStepWorkflows.js:435 | - | WFL | |
| POST | /api/n-step-workflows/:id/steps/previous | backend/routes/nStepWorkflows.js:508 | - | WFL | |
| PUT | /api/n-step-workflows/:id/steps/:stepId/activate | backend/routes/nStepWorkflows.js:574 | - | WFL | |
| POST | /api/n-step-workflows/:id/steps/:stepId/assets | backend/routes/nStepWorkflows.js:626 | - | WFL | |
| DELETE | /api/n-step-workflows/:id/steps/:stepId/assets/:assetId | backend/routes/nStepWorkflows.js:706 | - | WFL | |
| DELETE | /api/n-step-workflows/:id/steps/:stepId | backend/routes/nStepWorkflows.js:748 | - | WFL | |
| GET | /api/n-step-workflows/:id/steps/:stepId/expanded-count | backend/routes/nStepWorkflows.js:833 | - | WFL | |
| POST | /api/n-step-workflows/:id/execute | backend/routes/nStepWorkflows.js:871 | - | WFL | |
| GET | /api/n-step-workflows/runs/:runId | backend/routes/nStepWorkflows.js:946 | - | WFL | |
| GET | /api/n-step-workflows/init-data | backend/routes/nStepWorkflows.js:971 | - | WFL | Reachable through the guard |
| GET | /api/policies/ | backend/routes/policyRoutes.js:29 | - | GRP | |
| GET | /api/policies/:id | backend/routes/policyRoutes.js:74 | - | GRP | |
| POST | /api/policies/ | backend/routes/policyRoutes.js:99 | - | GRP | |
| PUT | /api/policies/:id | backend/routes/policyRoutes.js:165 | - | GRP | |
| DELETE | /api/policies/:id | backend/routes/policyRoutes.js:221 | - | GRP | |
| POST | /api/policies/:id/attach-user | backend/routes/policyRoutes.js:252 | - | GRP | |
| DELETE | /api/policies/:id/detach-user/:userId | backend/routes/policyRoutes.js:289 | - | GRP | |
| POST | /api/policies/:id/attach-group | backend/routes/policyRoutes.js:319 | - | GRP | |
| POST | /api/policies/evaluate | backend/routes/policyRoutes.js:356 | - | GRP | |
| GET | /api/policies/user/:userId | backend/routes/policyRoutes.js:384 | - | GRP | |
| GET | /api/projects/ | backend/routes/projectRoutes.js:157 | - | PRJ | |
| GET | /api/projects/init-data | backend/routes/projectRoutes.js:267 | - | PRJ | |
| GET | /api/projects/:projectId | backend/routes/projectRoutes.js:406 | - | PRJ | |
| POST | /api/projects/ | backend/routes/projectRoutes.js:458 | burst+hourly limit, idempotency | PRJ | |
| GET | /api/projects/:projectId/members | backend/routes/projectRoutes.js:809 | - | PRJ | |
| GET | /api/projects/:projectId/vendor-agreements-with-schemas | backend/routes/projectRoutes.js:880 | - | PRJ | |
| PUT | /api/projects/:projectId | backend/routes/projectRoutes.js:944 | - | PRJ | |
| DELETE | /api/projects/:projectId | backend/routes/projectRoutes.js:1063 | - | PRJ | |
| POST | /api/projects/:projectId/members | backend/routes/projectRoutes.js:1120 | - | PRJ | |
| DELETE | /api/projects/:projectId/members/:userId | backend/routes/projectRoutes.js:1152 | - | PRJ | |
| POST | /api/projects/:projectId/groups | backend/routes/projectRoutes.js:1179 | - | PRJ | |
| DELETE | /api/projects/:projectId/groups/:groupId | backend/routes/projectRoutes.js:1210 | - | PRJ | |
| GET | /api/projects/:projectId/sub-projects | backend/routes/subProjects.js:12 | JWT\* | PRJ | |
| POST | /api/projects/:projectId/sub-projects | backend/routes/subProjects.js:78 | JWT\* | PRJ | |
| PUT | /api/projects/:projectId/sub-projects/:subProjectId | backend/routes/subProjects.js:170 | JWT\* | PRJ | |
| DELETE | /api/projects/:projectId/sub-projects/:subProjectId | backend/routes/subProjects.js:287 | JWT\* | PRJ | |
| GET | /api/projects/:projectId/sub-projects/:subProjectId/members | backend/routes/subProjects.js:360 | JWT\* | PRJ | |
| POST | /api/projects/:projectId/sub-projects/:subProjectId/members | backend/routes/subProjects.js:429 | JWT\* | PRJ | |
| DELETE | /api/projects/:projectId/sub-projects/:subProjectId/members/:memberId | backend/routes/subProjects.js:513 | JWT\* | PRJ | |
| GET | /api/projects/:projectId/sub-projects/:subProjectId/groups | backend/routes/subProjects.js:583 | JWT\* | PRJ | |
| POST | /api/projects/:projectId/sub-projects/:subProjectId/groups | backend/routes/subProjects.js:652 | JWT\* | PRJ | |
| DELETE | /api/projects/:projectId/sub-projects/:subProjectId/groups/:groupAssignmentId | backend/routes/subProjects.js:736 | JWT\* | PRJ | |
| GET | /api/quality-rules/ | backend/routes/qualityRules.js:26 | JWT | DQ | |
| GET | /api/quality-rules/init-data | backend/routes/qualityRules.js:167 | JWT | DQ | |
| GET | /api/quality-rules/:id | backend/routes/qualityRules.js:340 | JWT | DQ | |
| POST | /api/quality-rules/ | backend/routes/qualityRules.js:391 | JWT | DQ | |
| PUT | /api/quality-rules/:id | backend/routes/qualityRules.js:466 | JWT | DQ | |
| DELETE | /api/quality-rules/:id | backend/routes/qualityRules.js:616 | JWT | DQ | |
| GET | /api/quality-rules/violations/summary | backend/routes/qualityRules.js:662 | JWT | DQ | |
| GET | /api/quality-rules/configurations | backend/routes/qualityRules.js:741 | JWT | DQ | **Shadowed** by /:id (:340) |
| POST | /api/quality-rules/configurations | backend/routes/qualityRules.js:806 | JWT | DQ | |
| DELETE | /api/quality-rules/configurations/:id | backend/routes/qualityRules.js:890 | JWT | DQ | |
| GET | /api/rdm/health | backend/routes/rdm.js:7 | JWT | RDM | |
| GET | /api/rdm/datasets | backend/routes/rdm.js:22 | JWT | RDM | Shadowed by server.js:1258 |
| GET | /api/rdm/datasets/:id | backend/routes/rdm.js:46 | JWT | RDM | |
| GET | /api/rdm/datasets/:id/schema | backend/routes/rdm.js:60 | JWT | RDM | Shadowed by server.js:1293 |
| GET | /api/rdm/datasets/:id/data | backend/routes/rdm.js:85 | JWT | RDM | |
| GET | /api/rdm/crosswalks | backend/routes/rdm.js:126 | JWT | RDM | Shadowed by server.js:1330 |
| GET | /api/rdm/crosswalks/:id | backend/routes/rdm.js:150 | JWT | RDM | |
| GET | /api/rdm/crosswalks/:id/schema | backend/routes/rdm.js:164 | JWT | RDM | Shadowed by server.js:1365 |
| GET | /api/rdm/crosswalks/:id/data | backend/routes/rdm.js:189 | JWT | RDM | |
| POST | /api/rdm/crosswalks/:id/lookup | backend/routes/rdm.js:209 | JWT | RDM | |
| GET | /api/rdm/relationships | backend/routes/rdm.js:237 | JWT | RDM | |
| POST | /api/rdm/cache/clear | backend/routes/rdm.js:250 | JWT | RDM | |
| GET | /api/retention-policies/ | backend/routes/retentionRoutes.js:15 | JWT, PERM(settings:read) | RET | |
| GET | /api/retention-policies/:id | backend/routes/retentionRoutes.js:72 | JWT, PERM(settings:read) | RET | |
| POST | /api/retention-policies/ | backend/routes/retentionRoutes.js:131 | JWT, PERM(settings:write) | RET | |
| PUT | /api/retention-policies/:id | backend/routes/retentionRoutes.js:213 | JWT, PERM(settings:write) | RET | |
| DELETE | /api/retention-policies/:id | backend/routes/retentionRoutes.js:297 | JWT, PERM(settings:write) | RET | |
| POST | /api/retention-policies/:id/execute | backend/routes/retentionRoutes.js:355 | JWT, PERM(settings:write) | RET | |
| GET | /api/retention-policies/:id/runs | backend/routes/retentionRoutes.js:420 | JWT, PERM(settings:read) | RET | |
| GET | /api/retention-policies/archives/list | backend/routes/retentionRoutes.js:466 | JWT, PERM(settings:read) | RET | |
| POST | /api/retention-policies/archives/:id/restore | backend/routes/retentionRoutes.js:583 | JWT, PERM(settings:write) | RET | |
| GET | /api/retention-policies/restorations/history | backend/routes/retentionRoutes.js:767 | JWT, PERM(settings:read) | RET | |
| POST | /api/schedules/ | backend/routes/scheduler.js:123 | - | SCHD | |
| GET | /api/schedules/ | backend/routes/scheduler.js:229 | - | SCHD | |
| GET | /api/schedules/active | backend/routes/scheduler.js:301 | - | SCHD | |
| GET | /api/schedules/init-data | backend/routes/scheduler.js:370 | - | SCHD | |
| GET | /api/schedules/:entityType/:entityId | backend/routes/scheduler.js:480 | - | SCHD | |
| GET | /api/schedules/:id | backend/routes/scheduler.js:504 | - | SCHD | |
| PUT | /api/schedules/:id | backend/routes/scheduler.js:566 | - | SCHD | |
| PATCH | /api/schedules/:id/toggle | backend/routes/scheduler.js:635 | - | SCHD | |
| DELETE | /api/schedules/:id | backend/routes/scheduler.js:681 | - | SCHD | |
| POST | /api/schedules/process-due | backend/routes/scheduler.js:707 | - | SCHD | Manual trigger of the scheduler |
| GET | /api/files/:fileId/schema-history | backend/routes/schemaHistory.js:12 | JWT\* | SCH | |
| POST | /api/schema-validation/jobs | backend/routes/schemaValidation.js:19 | JWT\* | SCHV | |
| GET | /api/schema-validation/jobs | backend/routes/schemaValidation.js:83 | JWT\* | SCHV | |
| GET | /api/schema-validation/jobs/:jobId | backend/routes/schemaValidation.js:110 | JWT\* | SCHV | |
| GET | /api/schema-validation/jobs/:jobId/files | backend/routes/schemaValidation.js:141 | JWT\* | SCHV | |
| GET | /api/schema-validation/jobs/:jobId/report | backend/routes/schemaValidation.js:178 | JWT\* | SCHV | |
| GET | /api/schema-validation/schedules | backend/routes/schemaValidation.js:213 | JWT\* | SCHV | |
| PUT | /api/schema-validation/schedules/:scheduleId | backend/routes/schemaValidation.js:235 | JWT\* | SCHV | |
| DELETE | /api/schema-validation/schedules/:scheduleId | backend/routes/schemaValidation.js:263 | JWT\* | SCHV | |
| GET | /api/transformations/ | backend/routes/transformations.js:52 | - | ETL | |
| GET | /api/transformations/:id | backend/routes/transformations.js:148 | PRA | ETL | |
| POST | /api/transformations/ | backend/routes/transformations.js:188 | PRA | ETL | |
| PUT | /api/transformations/:id | backend/routes/transformations.js:449 | PRA | ETL | |
| DELETE | /api/transformations/:id | backend/routes/transformations.js:857 | PRA | ETL | |
| POST | /api/transformations/:id/execute | backend/routes/transformations.js:889 | PRA | ETL | Calls jobExecutionEngine |
| POST | /api/transformations/validate-pattern | backend/routes/transformations.js:1056 | - | ETL | |
| POST | /api/transformations/extract-schema | backend/routes/transformations.js:1114 | - | ETL | |
| POST | /api/transformations/validate-vendor-schema | backend/routes/transformations.js:1156 | - | ETL | |
| POST | /api/transformations/:id/validate-pattern | backend/routes/transformations.js:1202 | - | ETL | |
| GET | /api/transformations/init-data | backend/routes/transformations.js:1255 | - | ETL | **Shadowed** by /:id (:148, no guard); called by src/pages/Mappings.jsx:55 and src/pages/WorkflowForm.jsx:40 |
| POST | /api/uploads/vendor/:agreementId | backend/routes/uploadRoutes.js:58 | APITOKEN | API | |
| POST | /api/uploads/internal/:projectId | backend/routes/uploadRoutes.js:187 | APITOKEN | API | |
| POST | /api/uploads/bulk | backend/routes/uploadRoutes.js:329 | APITOKEN | API | |
| GET | /api/uploads/batch/:batchId | backend/routes/uploadRoutes.js:506 | APITOKEN | API | |
| GET | /api/uploads/:fileId/status | backend/routes/uploadRoutes.js:527 | APITOKEN | API | |
| GET | /api/users/ | backend/routes/userManagement.js:19 | JWT\* | USR | |
| POST | /api/users/register | backend/routes/userManagement.js:53 | **none** | AUTH | **Open self-registration** (enhancedAuthService.registerLocalUser) |
| GET | /api/users/password-requirements | backend/routes/userManagement.js:74 | none | AUTH | |
| POST | /api/users/change-password-required | backend/routes/userManagement.js:84 | none (passwordChangeToken in body) | AUTH | |
| GET | /api/users/roles | backend/routes/userManagement.js:165 | JWT\* | USR | |
| GET | /api/users/roles/:id | backend/routes/userManagement.js:177 | JWT\* | USR | |
| GET | /api/users/by-role/:roleName | backend/routes/userManagement.js:217 | JWT\* | USR | |
| GET | /api/users/data-stewards | backend/routes/userManagement.js:279 | JWT\* | USR | |
| PUT | /api/users/change-password | backend/routes/userManagement.js:303 | JWT\* | AUTH | |
| GET | /api/users/profile | backend/routes/userManagement.js:330 | JWT\* | USR | |
| PUT | /api/users/profile | backend/routes/userManagement.js:357 | JWT\* | USR | |
| GET | /api/users/init-data | backend/routes/userManagement.js:440 | JWT\* | USR | |
| GET | /api/users/:id | backend/routes/userManagement.js:481 | JWT\* | USR | |
| PUT | /api/users/:id | backend/routes/userManagement.js:527 | JWT\* | USR | |
| POST | /api/users/:id/unlock | backend/routes/userManagement.js:768 | JWT\* | USR | |
| GET | /api/users/:id/dependencies | backend/routes/userManagement.js:809 | JWT\* | USR | |
| GET | /api/users/:id/eligible-replacements | backend/routes/userManagement.js:896 | JWT\* | USR | |
| POST | /api/users/bulk-dependencies | backend/routes/userManagement.js:981 | JWT\* | USR | |
| POST | /api/users/:id/transfer-ownership | backend/routes/userManagement.js:1066 | JWT\* | USR | |
| DELETE | /api/users/:id | backend/routes/userManagement.js:1217 | JWT\* | USR | |
| POST | /api/users/bulk-delete | backend/routes/userManagement.js:1298 | JWT\* | USR | |
| POST | /api/users/roles/bulk-delete | backend/routes/userManagement.js:1381 | JWT\* | USR | |
| GET | /api/vendor-access/projects | backend/routes/vendorAccessRoutes.js:13 | - | VND | |
| GET | /api/vendor-access/connections | backend/routes/vendorAccessRoutes.js:87 | - | VND | |
| POST | /api/vendor-access/browse | backend/routes/vendorAccessRoutes.js:197 | - | VND | |
| GET | /api/vendor-agreements/:agreementId/file-schemas | backend/routes/vendorAgreementFileSchemaRoutes.js:151 | PERM(vendor_agreements:read) | VAS | |
| GET | /api/vendor-agreements/:agreementId/file-schemas/:schemaId | backend/routes/vendorAgreementFileSchemaRoutes.js:214 | PERM(read) | VAS | |
| POST | /api/vendor-agreements/:agreementId/file-schemas | backend/routes/vendorAgreementFileSchemaRoutes.js:256 | PERM(write) | VAS | |
| PUT | /api/vendor-agreements/:agreementId/file-schemas | backend/routes/vendorAgreementFileSchemaRoutes.js:448 | PERM(write) | VAS | |
| PUT | /api/vendor-agreements/:agreementId/file-schemas/:schemaId | backend/routes/vendorAgreementFileSchemaRoutes.js:725 | PERM(write) | VAS | |
| DELETE | /api/vendor-agreements/:agreementId/file-schemas/:schemaId | backend/routes/vendorAgreementFileSchemaRoutes.js:981 | PERM(write) | VAS | |
| POST | /api/vendor-agreements/:agreementId/file-schemas/test-pattern | backend/routes/vendorAgreementFileSchemaRoutes.js:1049 | PERM(read) | VAS | Check precedence against PUT/GET /:schemaId |
| POST | /api/vendor-agreements/ | backend/routes/vendorAgreementRoutes.js:183 | PERM(write), multer | VAG | |
| GET | /api/vendor-agreements/ | backend/routes/vendorAgreementRoutes.js:267 | - | VAG | |
| GET | /api/vendor-agreements/stakeholder-options | backend/routes/vendorAgreementRoutes.js:338 | PERM(read) | VAG | |
| GET | /api/vendor-agreements/init-data | backend/routes/vendorAgreementRoutes.js:403 | - | VAG | |
| GET | /api/vendor-agreements/:id/full | backend/routes/vendorAgreementRoutes.js:659 | checkAgreementAccess | VAG | |
| GET | /api/vendor-agreements/:id | backend/routes/vendorAgreementRoutes.js:822 | checkAgreementAccess | VAG | |
| PUT | /api/vendor-agreements/:id | backend/routes/vendorAgreementRoutes.js:841 | PERM(write), access, multer | VAG | |
| POST | /api/vendor-agreements/:id/approve | backend/routes/vendorAgreementRoutes.js:895 | access | VAP | |
| POST | /api/vendor-agreements/:id/reject | backend/routes/vendorAgreementRoutes.js:944 | access | VAP | |
| GET | /api/vendor-agreements/:id/approval-chain | backend/routes/vendorAgreementRoutes.js:1004 | access | VAP | |
| PUT | /api/vendor-agreements/:id/approval-chain | backend/routes/vendorAgreementRoutes.js:1022 | access | VAP | |
| POST | /api/vendor-agreements/:id/submit-for-approval | backend/routes/vendorAgreementRoutes.js:1053 | access | VAP | |
| POST | /api/vendor-agreements/:id/step-decision | backend/routes/vendorAgreementRoutes.js:1086 | access, multer | VAP | |
| GET | /api/vendor-agreements/:id/step-decisions | backend/routes/vendorAgreementRoutes.js:1114 | access | VAP | |
| POST | /api/vendor-agreements/:id/vendor-action | backend/routes/vendorAgreementRoutes.js:1133 | access, multer | VAP | |
| POST | /api/vendor-agreements/:id/manager-action | backend/routes/vendorAgreementRoutes.js:1176 | access, multer | VAP | |
| POST | /api/vendor-agreements/:id/manager-handle-rejection | backend/routes/vendorAgreementRoutes.js:1220 | access, multer | VAP | |
| POST | /api/vendor-agreements/:id/manager-handle-governance-rejection | backend/routes/vendorAgreementRoutes.js:1264 | access, multer | VAP | |
| POST | /api/vendor-agreements/:id/governance-action | backend/routes/vendorAgreementRoutes.js:1306 | access, multer | VAP | |
| GET | /api/vendor-agreements/:id/approvals | backend/routes/vendorAgreementRoutes.js:1352 | access | VAP | |
| GET | /api/vendor-agreements/:id/changes | backend/routes/vendorAgreementRoutes.js:1369 | access | VAP | |
| GET | /api/vendor-agreements/:id/files | backend/routes/vendorAgreementRoutes.js:1386 | access | VAG | |
| GET | /api/vendor-agreements/vendor/:vendorId | backend/routes/vendorAgreementRoutes.js:1438 | - | VAG | |
| GET | /api/vendor-agreements/approved | backend/routes/vendorAgreementRoutes.js:1482 | - | VAG | **Shadowed** by /:id (:822) |
| GET | /api/vendor-agreements/template/:format | backend/routes/vendorAgreementRoutes.js:1499 | - | VAS | |
| POST | /api/vendor-agreements/parse-template | backend/routes/vendorAgreementRoutes.js:1542 | multer | VAS | |
| PATCH | /api/vendor-agreements/:id/disable | backend/routes/vendorAgreementRoutes.js:1598 | PERM(write), access | VAG | |
| GET | /api/vendor-agreements/:id/check-dependencies | backend/routes/vendorAgreementRoutes.js:1626 | PERM(read) | VAG | |
| DELETE | /api/vendor-agreements/:id | backend/routes/vendorAgreementRoutes.js:1676 | PERM(write), access | VAG | |
| POST | /api/vendor-agreements/:id/documents | backend/routes/vendorAgreementRoutes.js:1726 | access, multer | VAG | |
| GET | /api/vendor-agreements/:id/documents | backend/routes/vendorAgreementRoutes.js:1776 | access | VAG | |
| GET | /api/vendor-agreements/:id/documents/:docId/download | backend/routes/vendorAgreementRoutes.js:1806 | access | VAG | |
| DELETE | /api/vendor-agreements/:id/documents/:docId | backend/routes/vendorAgreementRoutes.js:1846 | access | VAG | |
| POST | /api/vendor-agreements/:id/archive-password | backend/routes/vendorAgreementRoutes.js:1899 | PERM(write), access | VAG | |
| GET | /api/vendor-agreements/:id/archive-password | backend/routes/vendorAgreementRoutes.js:1950 | PERM(read) (no agreement access check) | VAG | |
| DELETE | /api/vendor-agreements/:id/archive-password | backend/routes/vendorAgreementRoutes.js:1987 | PERM(write), access | VAG | |
| GET | /api/vendor-agreements/:id/stakeholders | backend/routes/vendorAgreementRoutes.js:2041 | access | VAG | |
| PUT | /api/vendor-agreements/:id/stakeholders | backend/routes/vendorAgreementRoutes.js:2139 | PERM(write), access | VAG | |
| USE | multer error handler | backend/routes/vendorAgreementRoutes.js:2244 | - | VAG | |
| GET | /api/vendor-agreement-template/download | backend/routes/vendorAgreementTemplateRoutes.js:38 | JWT\* | VAS | |
| POST | /api/vendor-agreement-template/upload | backend/routes/vendorAgreementTemplateRoutes.js:64 | JWT\* | VAS | |
| POST | /api/vendor-agreement-template/upload-schema | backend/routes/vendorAgreementTemplateRoutes.js:120 | JWT\* | VAS | |
| GET | /api/vendors/ | backend/routes/vendorRoutes.js:50 | isVendorUser(local :38) | VND | |
| GET | /api/vendors/init-data | backend/routes/vendorRoutes.js:93 | isVendorUser | VND | |
| GET | /api/vendors/:id | backend/routes/vendorRoutes.js:199 | isVendorUser | VND | |
| POST | /api/vendors/ | backend/routes/vendorRoutes.js:232 | requireVendorManagement(:25) | VND | |
| PUT | /api/vendors/:id | backend/routes/vendorRoutes.js:247 | requireVendorManagement | VND | |
| DELETE | /api/vendors/:id | backend/routes/vendorRoutes.js:273 | requireVendorManagement | VND | |
| GET | /api/vendors/project/:projectId | backend/routes/vendorRoutes.js:299 | requireVendorManagement | VND | |
| GET | /api/vendor-sla/status | backend/routes/vendorSLARoutes.js:9 | - | SLA | |
| GET | /api/vendor-sla/violations | backend/routes/vendorSLARoutes.js:141 | - | SLA | |
| POST | /api/vendor-sla/test-check | backend/routes/vendorSLARoutes.js:222 | - | SLA | |
| GET | /api/vendor-sla/summary | backend/routes/vendorSLARoutes.js:280 | - | SLA | |
| GET | /api/visual-mappings/ | backend/routes/visualMappings.js:30 | - | VMAP | |
| GET | /api/visual-mappings/:id | backend/routes/visualMappings.js:114 | - | VMAP | |
| POST | /api/visual-mappings/ | backend/routes/visualMappings.js:169 | authorize(write) | VMAP | |
| PUT | /api/visual-mappings/:id | backend/routes/visualMappings.js:223 | authorize(write) | VMAP | |
| DELETE | /api/visual-mappings/:id | backend/routes/visualMappings.js:285 | authorize(write) | VMAP | |
| POST | /api/visual-mappings/:id/clone | backend/routes/visualMappings.js:320 | authorize(write) | VMAP | |
| POST | /api/visual-mappings/:id/execute | backend/routes/visualMappings.js:454 | authorize(execute) | VMAP | |
| GET | /api/visual-mappings/:id/execution-status/:executionId | backend/routes/visualMappings.js:805 | - | VMAP | |
| GET | /api/visual-mappings/:id/running-execution | backend/routes/visualMappings.js:866 | - | VMAP | |
| POST | /api/visual-mappings/:id/validate | backend/routes/visualMappings.js:907 | - | VMAP | |
| GET | /api/visual-mappings/:id/executions | backend/routes/visualMappings.js:957 | - | VMAP | |
| POST | /api/visual-mappings/executions/:executionId/logs | backend/routes/visualMappings.js:989 | - | VMAP | |
| GET | /api/visual-mappings/:id/logs | backend/routes/visualMappings.js:1030 | - | VMAP | |
| POST | /api/visual-mappings/source-preview | backend/routes/visualMappings.js:1133 | - | VMAP | |
| GET | /api/visual-workflows/ | backend/routes/visualWorkflows.js:17 | - | VWF | |
| GET | /api/visual-workflows/:id | backend/routes/visualWorkflows.js:71 | - | VWF | |
| POST | /api/visual-workflows/ | backend/routes/visualWorkflows.js:129 | - | VWF | |
| PUT | /api/visual-workflows/:id | backend/routes/visualWorkflows.js:166 | - | VWF | |
| DELETE | /api/visual-workflows/:id | backend/routes/visualWorkflows.js:210 | - | VWF | |
| POST | /api/visual-workflows/:id/execute | backend/routes/visualWorkflows.js:239 | - | VWF | |
| GET | /api/visual-workflows/:id/execution-status/:executionId | backend/routes/visualWorkflows.js:385 | - | VWF | |
| GET | /api/visual-workflows/:id/running-execution | backend/routes/visualWorkflows.js:447 | - | VWF | |
| POST | /api/visual-workflows/validate | backend/routes/visualWorkflows.js:484 | - | VWF | |
| GET | /api/visual-workflows/:id/execution-logs | backend/routes/visualWorkflows.js:504 | - | VWF | |
| POST | /api/visual-workflows/:id/execution-logs | backend/routes/visualWorkflows.js:537 | - | VWF | |
| GET | /api/workflow-steps/ | backend/routes/workflowSteps.js:17 | - | WFL | |
| GET | /api/workflow-steps/workflow/:workflowId/steps | backend/routes/workflowSteps.js:40 | - | WFL | |
| GET | /api/workflow-steps/steps/:id | backend/routes/workflowSteps.js:64 | - | WFL | |
| POST | /api/workflow-steps/workflow/:workflowId/steps | backend/routes/workflowSteps.js:93 | - | WFL | |
| PUT | /api/workflow-steps/steps/:id | backend/routes/workflowSteps.js:143 | - | WFL | |
| DELETE | /api/workflow-steps/steps/:id | backend/routes/workflowSteps.js:228 | - | WFL | |
| POST | /api/workflow-steps/workflow/:workflowId/execute | backend/routes/workflowSteps.js:259 | - | WFL | |
| GET | /api/workflow-steps/workflow/:workflowId/executions | backend/routes/workflowSteps.js:302 | - | WFL | |
| GET | /api/workflow-steps/executions/:executionId | backend/routes/workflowSteps.js:320 | - | WFL | |

### 1d. Unmounted / possibly-dead routers

| Method | Path | Handler | Area | Status |
|---|---|---|---|---|
| POST/GET/GET/PUT/DELETE/POST/GET/GET | /, /, /:id, /:id, /:id, /:id/execute, /:id/executions, /:id/executions/:executionId | backend/routes/transformationRoutes.js:49-58 (-> backend/controllers/transformationController.js) | XFM | possibly-dead: mounting is commented out in backend/integration.js:33 |
| POST | /login, /refresh, /logout; POST /logout-all; GET /me | backend/src/routes/auth.js:12-18 | AUTH | possibly-dead: only backend/src/app.js uses it, and nothing requires that file |
| GET | / | backend/src/routes/index.js:17 | PLT | possibly-dead |
| GET/GET/POST/PUT/DELETE/POST | transformations CRUD | backend/src/routes/transformations.js:15-50 | XFM | possibly-dead (also commented out in index.js:29) |
| app | Express app bootstrap | backend/src/app.js:46-104, backend/src/server.js:20 | PLT | possibly-dead (`require.main` entry only, backend/src/server.js:49) |

### 1e. Python Flask (profile_api.py, port 8000; no auth decorators found, CORS only at profile_api.py:55-61)

| Method | Path | Handler | Auth | Area | Notes |
|---|---|---|---|---|---|
| POST | /api/vendor-profile | profile_api.py:1661 | none | PROF | Called by server.js:4294, :4812 and fileProcessingWorker.js:1615 |
| GET | /health | profile_api.py:1857 | none | PROF | |
| POST | /parquet-schema | profile_api.py:1863 | none | PROF | Uses AWS creds from env (:1885) |
| POST | /api/dq-suggestions | profile_api.py:1926 | none | AI | |
| GET | /api/ai-providers | profile_api.py:2008 | none | AI | |
| PUT | /api/ai-providers/current | profile_api.py:2049 | none | AI | Writes app_settings; publicly reachable via /profile-api proxy |
| GET | /api/settings/<setting_key> | profile_api.py:2115 | none | AI | |
| PUT | /api/settings/<setting_key> | profile_api.py:2159 | none | AI | Unauthenticated settings write |

### 1f. Rust log service (rust-log-service, possibly-dead: not started by .replit or productionBootstrap; only backend/services/logClient.js would call it, and nothing requires logClient)

| Method | Path | Handler | Area |
|---|---|---|---|
| GET | /health | rust-log-service/src/main.rs:64 | OPS |
| POST | /api/logs | rust-log-service/src/main.rs:65 | OPS |
| POST | /api/logs/batch | rust-log-service/src/main.rs:66 | OPS |
| POST | /api/logs/query | rust-log-service/src/main.rs:67 | OPS |
| POST | /api/logs/search | rust-log-service/src/main.rs:68 | OPS |
| GET | /api/logs/tail | rust-log-service/src/main.rs:69 | OPS |
| GET | /api/segments | rust-log-service/src/main.rs:70 | OPS |
| GET | /api/segments/:id | rust-log-service/src/main.rs:71 | OPS |
| GET | /api/stats | rust-log-service/src/main.rs:72 | OPS |

### 1g. WebSocket (Socket.IO on the main HTTP server; created at server.js:14148, CORS from allowedOrigins, no auth seen)

| Event | Handler | Area |
|---|---|---|
| connection | backend/services/visualMappingWebSocket.js:11 | VMAP |
| subscribe_execution | backend/services/visualMappingWebSocket.js:16 | VMAP |
| unsubscribe_execution | backend/services/visualMappingWebSocket.js:24 | VMAP |
| disconnect | backend/services/visualMappingWebSocket.js:32 | VMAP |

---

## 2. Frontend pages (src/App.jsx; every page is wrapped in ProtectedRoute unless noted)

| Route | Component | Route line | Area |
|---|---|---|---|
| / | DashboardOrRedirect | src/App.jsx:340 | DASH |
| /executive-dashboard | src/pages/ExecutiveDashboard.jsx | src/App.jsx:341 | DASH |
| /upload, /drop | FileUploadOrRedirect -> src/pages/FileUpload.jsx | src/App.jsx:342-343 | ING |
| /file-catalog | src/pages/FileCatalog.jsx | src/App.jsx:344 | FILE |
| /profile/:fileId | src/pages/DataProfile.jsx | src/App.jsx:345 | FDV |
| /quality/:fileId | src/pages/QualityChecks.jsx | src/App.jsx:355 | FDV |
| /report/:fileId | src/pages/QualityReport.jsx | src/App.jsx:364 | FDV |
| /quality-rules | src/pages/QualityRules.jsx | src/App.jsx:373 | DQ |
| /alerts | redirect to /quality-rules | src/App.jsx:374 | DQ |
| /error-review | src/pages/ErrorReview.jsx | src/App.jsx:375 | ERR |
| /connections | src/pages/Connections.jsx | src/App.jsx:376 | CONN |
| /mappings | src/pages/Mappings.jsx | src/App.jsx:377 | ETL |
| /mappings/create, /mappings/edit/:mappingId | src/pages/MappingWizard.jsx | src/App.jsx:378-379 | ETL |
| /transformations, /transformations/:id, /transform | src/pages/Transform.jsx | src/App.jsx:380-382 | ETL |
| /lineage | src/pages/FileLineage.jsx | src/App.jsx:383 | LIN |
| /visual-lineage | src/pages/LineageListPage.jsx | src/App.jsx:384 | LIN |
| /visual-lineage/new, /visual-lineage/:graphId | src/pages/LineagePage.jsx | src/App.jsx:385-386 | LIN |
| /lineage/impact/:fileId | src/pages/LineageImpact.jsx | src/App.jsx:387 | LIN |
| /monitor | src/pages/Monitor.jsx | src/App.jsx:396 | JOB |
| /scheduler | src/pages/Scheduler.jsx | src/App.jsx:397 | SCHD |
| /badges | src/pages/Badges.jsx | src/App.jsx:398 | DASH |
| /dashboard-settings | src/pages/DashboardSettings.jsx | src/App.jsx:400 | DASH |
| /digest-subscriptions | src/pages/DigestSubscriptions.jsx | src/App.jsx:401 | NTF |
| /users | src/pages/UserManagement.jsx | src/App.jsx:402 | USR |
| /roles | src/pages/RoleManagement.jsx | src/App.jsx:403 | USR |
| /audit-trail | src/pages/AuditTrail.jsx | src/App.jsx:404 | AUD |
| /notifications | src/pages/Notifications.jsx | src/App.jsx:405 | NTF |
| /vendor-management, /vendors | src/pages/VendorManagement.jsx | src/App.jsx:406-407 | VND |
| /vendor-agreements | src/pages/VendorAgreements.jsx | src/App.jsx:408 | VAG |
| /vendor-file-upload | src/pages/VendorFileUpload.jsx | src/App.jsx:409 | VND |
| /vendor-file-quality | src/pages/VendorFileQuality.jsx | src/App.jsx:410 | VND |
| /sla-monitoring | src/pages/SLAMonitoring.jsx | src/App.jsx:411 | SLA |
| /failed-jobs | src/pages/FailedJobs.jsx | src/App.jsx:413 | ARC |
| /groups | src/pages/Groups.jsx | src/App.jsx:415 | GRP |
| /business-processes | src/pages/BusinessProcesses.jsx | src/App.jsx:416 | BPR |
| /business-processes/:processId, /jobs, /jobs/:jobId | src/pages/Jobs.jsx | src/App.jsx:417-419 | JOB |
| /etl-jobs/:jobId | src/pages/ETLJobDetails.jsx | src/App.jsx:420 | JOB |
| /transformation-catalog, /processed-catalog | src/pages/ProcessedFileCatalog.jsx | src/App.jsx:421-422 | FILE |
| /mapping-groups | src/pages/MappingGroups.jsx | src/App.jsx:425 | MGRP |
| /mapping-groups/create, /mapping-groups/:groupId/edit | src/pages/MappingGroupForm.jsx | src/App.jsx:426-427 | MGRP |
| /workflows, /workflows/:id | src/pages/NStepWorkflows.jsx | src/App.jsx:428-429 | WFL |
| /workflow-builder | src/pages/archived/WorkflowBuilder.jsx (still routed although it sits in archived/) | src/App.jsx:430 | WFL |
| /workflow-manager | src/pages/WorkflowManager.jsx | src/App.jsx:431 | WFL |
| /visual-mappings/new, /visual-mappings/:mappingId | src/pages/VisualMappingCanvas.jsx | src/App.jsx:432-433 | VMAP |
| /visual-mappings/manage | src/pages/VisualMappingManager.jsx | src/App.jsx:434 | VMAP |
| /etl-scheduler | src/pages/ETLScheduler.jsx | src/App.jsx:435 | SCHD |
| /etl-scheduler/create, /etl-scheduler/:scheduleId/edit | src/pages/SchedulerForm.jsx | src/App.jsx:436-437 | SCHD |
| /policy-management | src/pages/PolicyManagement.jsx | src/App.jsx:439 | GRP |
| /retention-policies | src/pages/RetentionPolicies.jsx | src/App.jsx:440 | RET |
| /archived-files | src/pages/ArchivedFiles.jsx | src/App.jsx:441 | RET |
| /anomalies | src/pages/Anomalies.jsx | src/App.jsx:442 | ANOM |
| /tag-management | src/pages/TagManagement.jsx | src/App.jsx:443 | GOV |
| /api-tokens | src/pages/APITokens.jsx | src/App.jsx:444 | API |
| /api-documentation | src/pages/APIDocumentation.jsx | src/App.jsx:445 | API |
| /projects | src/pages/Projects.jsx | src/App.jsx:446 | PRJ |
| /project-management | src/pages/ProjectManagement.jsx | src/App.jsx:447 | PRJ |
| /group-management | src/pages/GroupManagement.jsx | src/App.jsx:448 | GRP |
| /system-cleanup | src/pages/SystemCleanup.jsx | src/App.jsx:449 | ADM |
| /alerts-config | src/pages/AlertsConfig.jsx | src/App.jsx:450 | ALRT |
| /alert-history | src/pages/AlertHistory.jsx | src/App.jsx:451 | ALRT |
| /email-providers | src/pages/EmailProvidersConfig.jsx | src/App.jsx:452 | EML |
| /oauth2-callback | src/pages/OAuth2Callback.jsx (not protected) | src/App.jsx:453 | EML |
| /documentation, /help | src/pages/Documentation.jsx | src/App.jsx:456-457 | WEB |
| /performance-optimizations | src/pages/PerformanceOptimizations.jsx | src/App.jsx:460 | WEB |
| /login (authenticated tree) | src/pages/Login.jsx | src/App.jsx:461 | AUTH |
| * | redirect to / | src/App.jsx:462 | WEB |
| /login (unauthenticated tree) | src/pages/Login.jsx (uses PasswordChangeRequired, src/pages/Login.jsx:8) | src/App.jsx:484 | AUTH |
| /auth/callback | src/pages/OktaCallback.jsx | src/App.jsx:485 | AUTH |
| * (unauthenticated) | redirect to /login | src/App.jsx:486 | AUTH |

**Unrouted pages (possibly-dead; nothing imports them):** src/pages/BusinessProcessDetail.jsx, src/pages/JobCreate.jsx, src/pages/JobDetail.jsx, src/pages/JobGroupDetail.jsx, src/pages/JobGroups.jsx, src/pages/ProcessManagementWizard.jsx (3,071 lines), src/pages/Transformations.jsx (2,326 lines), src/pages/WorkflowForm.jsx, src/pages/Workflows.jsx. The following routes are commented out as ARCHIVED (src/App.jsx:399, :412, :454, :455, :459): src/pages/DataStories.jsx, src/pages/DBTTransformations.jsx, src/pages/WorkflowCanvasStandalone.jsx, src/pages/WorkflowTest.jsx, src/pages/HooksDemo.jsx.

---

## 3. Scheduled jobs, workers, queue consumers, webhooks, startup hooks

| Kind | Name / cadence | Started at | Implementation | Area | Status |
|---|---|---|---|---|---|
| Queue consumer | FileProcessingWorker on queue `file-processing` (memory or Redis) | server.js:45 | backend/workers/fileProcessingWorker.js:250 | PROC | live |
| Startup hook | Orphaned queued-file recovery | server.js:14187 | fileProcessingWorker.recoverOrphanedJobs | PROC | live; also reachable via /api/debug/recover-orphans |
| Interval | SchedulerWorker every 60 s: processDueSchedules + processDigests | server.js:48, started :14111 | backend/workers/schedulerWorker.js:35; backend/services/cronSchedulerService.js; backend/services/DigestService.js | SCHD, NTF | live |
| Interval | UploadCleanupWorker (removes uploads older than 1 h) | server.js:60 | backend/workers/uploadCleanupWorker.js:22 | PROC | live |
| Interval | SLAMonitorWorker every 15 min | server.js:68 | backend/workers/slaMonitorWorker.js:34 -> slaMonitorService | SLA | live |
| Daily | InsightsAggregationWorker at 02:00 | server.js:75 | backend/workers/insightsAggregationWorker.js:26 | DASH | live |
| Daily | RetentionPolicyWorker at 01:00 | server.js:83 | backend/workers/retentionPolicyWorker.js:39 | RET | live |
| Queue consumer | UploadWorker (BullMQ `file-upload`, concurrency 5, needs Redis) | server.js:14135-14137 | backend/workers/uploadWorker.js:20; producer backend/queues/uploadQueue.js:56 (used by uploadRoutes.js:19) | API | live if Redis is available |
| Queue | RedisQueue (BullMQ) when QUEUE_TYPE=redis | backend/queue/queueFactory.js:47 | backend/queue/RedisQueue.js:39 | PROC | optional |
| Interval | Materialized view refresh every 60 s | server.js:14178 | backend/workers/materializedViewWorker.js:196 | DASH | live |
| Interval | AlertAggregationWorker flush every 60 s | **never started** (no `.start()` call outside tests) | backend/services/AlertAggregationWorker.js:30, :43 | ALRT | **possibly-dead**: aggregation windows may never flush |
| Interval | memoryMonitor.startMonitoring | never called | backend/utils/memoryMonitor.js:200 | OPS | possibly-dead |
| Interval | logClient flush | never instantiated | backend/services/logClient.js:48 | OPS | possibly-dead |
| Worker thread | asyncProcessor -> processorWorker.js | on demand | backend/utils/asyncProcessor.js:52, :158 | PROC/XFM | used by TransformationService.js:14 and asyncTransformationService.js:8 |
| Startup hook | Tracked schema migrations (about 60, runOnce) plus ensureFileUploadPermissions plus ALTER transformation_jobs | server.js:5884-5956 | backend/utils/migrationTracker.js; backend/migrations/* | MIG | live |
| Startup hook | Schedules/transformations table creation IIFE | server.js:11811 | inline DDL (:11814, :11839) | SCHD | live |
| Startup hook | DB init, repairBootstrapAdminRoles, dashboard prerequisite check | server.js:14066, :14073, :14074 | backend/di/bootstrapper.js; backend/migrations/repairCleanPublishDashboardPrerequisites.js | PLT | live |
| Startup hook | initBusinessProcessTables | server.js:14102 | initBusinessProcessTables.js:38, :52 | BPR | live |
| Startup hook | ENCRYPTION_KEY validation log | server.js:14118 | - | SEC | live (logs key length only) |
| Startup hook | Socket.IO + visual mapping WS | server.js:14148, :14173 | backend/services/visualMappingWebSocket.js | VMAP | live |
| Startup hook | setupEnhancedFeatures (performance logger) | server.js:13965 | backend/integration.js:17 | OPS | live, but registered after all routes |
| Startup hook | Prod bootstrap: spawn profile API + API, proxy, readiness poll | .replit:9 | productionBootstrap.js:33, :49, :95, :139 | PLT | live (deploy) |
| Webhook-like | Gmail / Outlook OAuth2 redirect callbacks | - | backend/routes/emailConnectionRoutes.js:636, :741 | EML | behind JWT at the mount |
| Machine API | Programmatic upload API (API tokens) | - | backend/routes/uploadRoutes.js:58, :187, :329 | API | live |
| CI | Deploy on push to `prod` (EC2, pm2 restart) | .github/workflows/prod-deployment.yml:3 | - | PLT | live |
| CI | Sonar scan | .github/workflows/sonar.yml | - | PLT | live |
| Replit hook | postMerge: npm install | .replit:99-101 | scripts/post-merge.sh | PLT | live |

### CLI scripts

| Script | Entry | Area | Status |
|---|---|---|---|
| npm run dev / dev:backend / dev:frontend / build / start | package.json:7-12 | PLT | live |
| npm run seed:production | package.json:10 -> backend/scripts/seedProduction.js | MIG | live (manual) |
| backend/scripts/seedProductionManual.sql | manual SQL | MIG | manual |
| About 40 standalone migrations (`require.main === module`), e.g. backend/migrations/createVendorManagement.js:224, createAuditTables.js:288, createImmutableAuditLedger.js:235, createJobDependencyTables.js:257, addGovernanceWorkflow.js:271 | node <file> | MIG/MIGV | manual |
| migrations/001-005 *.sql, migrations/schema_migration_2026-01-07.sql | psql (manual) | MIG | manual; no runner found |
| utils/process_file.py:153, utils/profile_columns.py:180, utils/header_validator.py:629 | spawned via run_python_with_venv.sh (fileProcessingWorker.js:1538, :1775, :1840, :1900; transformationProfilingService.js:34, :99; reprofile_files.js:28) | PROF/SCH | live |
| profile_api.py:2256 | python profile_api.py | PROF | live |
| scripts/init-clamav.sh | exec'd by backend/services/VirusScanService.js:87 | ARC | live unless DISABLE_VIRUS_SCAN |
| reprofile_files.js, backfill_metrics.js, test_aggregation.js, test_column_stats.js, test_venv.py:36 | ad-hoc root scripts | PROF/DASH | manual |
| database_schema.js | not referenced anywhere | PLT | possibly-dead |
| Makefile targets test/coverage | Makefile:7-50 | PLT | dev |
| backend/src/server.js:49 | node backend/src/server.js | PLT | possibly-dead alternate app |
| rust-log-service | cargo run (rust-log-service/src/main.rs) | OPS | possibly-dead |

---

## 4. Datastores

### 4a. Stores

| Store | Access | Location | Area |
|---|---|---|---|
| PostgreSQL (primary) | pg Pool | backend/config/database.js:8; backend/db.js (used by most routers); backend/src/config/database.js:7; backend/services/ServiceBase.js:10 | PLT |
| PostgreSQL from Python | psycopg2; gets DATABASE_URL from env or from backend `/api/db_url` | profile_api.py:19, :182, :198 | PROF |
| Redis (cache) | redis client | backend/services/cacheService.js:47; backend/middleware/cacheMiddleware.js | PLT |
| Redis (ioredis) | config + alert aggregation | backend/config/redis.js:5; backend/services/AlertAggregator.js:14, :44 | ALRT |
| Redis (BullMQ) | queues `file-upload`, `file-processing` | backend/queues/uploadQueue.js:56; backend/queue/RedisQueue.js:39 | API/PROC |
| In-memory queue | default queue | backend/queue/MemoryQueue.js | PROC |
| Local filesystem | uploads/ (cleaned hourly), dist/ | server.js:57, :13969 | ING/PLT |
| Rust log segments on disk | LOG_SERVICE_DATA_DIR | rust-log-service/src/config.rs:74; rust-log-service/src/storage.rs | OPS (dead) |
| Customer cloud storage (S3/GCS/Azure/Snowflake) as sources and targets | see section 5 | backend/services/ConnectionService.js:3-6 | CONN |

### 4b. Tables
Prod DDL line numbers refer to `attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql` (S). "Code DDL" is where a migration or code creates the table. Many core tables (files, users, connections, jobs, n_step_*, visual_*) have **no in-repo migration**; they exist only in the dumps (S, database_ddl_2026-01-07.sql, attached_assets/database_ddl_1767770486833.sql). Key fields are listed only where I read the DDL.

| Table | Prod DDL | Code DDL | Key fields (where read) | Area |
|---|---|---|---|---|
| files | S:4983 | database_ddl_2026-01-07.sql:1289 only | file_id (uniq), filename, file_type, file_size, row_count, column_count, quality_score, checksum, metadata jsonb, schema_definition jsonb, processing_step, processing_error, project_id NOT NULL, sub_project_id, is_vendor_file, vendor_agreement_id, correlation_id, file_role, logical_file_id, contains_pii, data_classification, source_format, format_metadata, is_archive, archive_format, is_password_protected, member_count, parent_archive_id, failure_reason_code (enum), duplicate_records_count/percentage | FILE |
| users | S:6585 | backend/src/migrations/index.js:15 (dead path); addUserProfileAndAuthFields.js; addVendorIdToUsers.js | username (lower uniq), password, email (uniq), full_name (trigger), okta_id (uniq), first/middle/last_name, phone, address fields, auth_provider, external_id, failed_login_attempts, locked_until, password_history jsonb, force_password_change, must_change_password, internal_user, user_type, vendor_id, last_login | USR/AUTH |
| roles, permissions, user_roles, role_permissions | S:3540, :3450, :6553, :3896 | backend/src/migrations/index.js:30, :41, :54, :64 | - | USR |
| refresh_tokens | S:5863 | backend/src/migrations/index.js:74 | - | AUTH |
| user_sessions | S:6568 | - | - | AUTH |
| password_reset_requests | S:5563 | database_ddl_2026-01-07.sql:1663 | - | AUTH |
| user_uuid_mapping | S:3812 | - | - | USR |
| groups, user_groups | S:3349, :6520 | migrations/schema_migration_2026-01-07.sql:28 | - | GRP |
| access_groups, access_group_members, access_group_roles | S:4019, :3977, :3997 | backend/migrations/createProjectsAndGroups.js:106, :158, :194 | - | GRP |
| rbac_policies, user_policy_attachments, group_policy_attachments, resource_policy_attachments, policy_evaluation_cache | S:5826, :6536, :5122, :5918, :3473 | backend/migrations/createPolicyEngine.js:27, :78, :104, :130, :160 | - | GRP |
| user_attributes, resource_attributes, attribute_definitions | S:6471, :5887, :2642 | backend/migrations/createABACAttributes.js:23, :59, :95 | - | GRP |
| scim_configurations, scim_sync_logs, scim_resource_mappings | S:3576, :3947, :3913 | backend/migrations/createSCIMProvisioning.js:24, :69, :112 | - (no SCIM routes found) | GRP |
| projects | S:5659 | backend/migrations/createProjectsAndGroups.js:28 | name, description, owner_id, parent_id, is_default, is_active, is_archived, metadata, settings, project_type (internal/external); uniq (owner_id, lower(name)) | PRJ |
| project_members, project_access_groups, sub_project_members, sub_project_access_groups | S:5630, :5614, :6158, :6142 | createProjectsAndGroups.js:71 | - | PRJ |
| idempotency_keys | S:5139 | - | - | PRJ/SEC |
| connections (legacy) | S:2907 | - | connection_name (uniq), connection_type, host, port, username, password_encrypted, database_name, connection_string, parameters, has_archive_password | CONN |
| storage_connections | S:6108 | backend/src/migrations/index.js:177 | connection_id PK, type, name (lower uniq), config jsonb, status, connection_direction, project_id, connection_user (Internal/External), authentication_method (key-based/aws-iam-role/gcp-sa-oidc/azure-managed-identity/db-short-lived-token/oauth2/kerberos), auth_config, path, is_deleted/deleted_at/deleted_by | CONN |
| transform_connections | S:6196 | backend/migrations/createSharedConnectionsTable.js:12; migrateTransformConnections.js:18 | - | CONN |
| drop_location_config | S:4574 | - | - | ING |
| file_columns, file_schema_details, file_schemas, fixed_width_schemas | S:4699, :3279, :4938, :5056 | file_schemas: backend/migrations/createETLTransformationTables.js:50 | - | SCH |
| file_preview_data | S:4822 | backend/migrations/createFilePreviewDataTable.js:7 | - | FILE |
| file_history, file_lineage, file_errors | S:4741, :4759, :3158 | file_lineage: backend/src/migrations/index.js:104 | - | FILE/LIN |
| file_mappings | S:3192 | server.js:5963, :5992 | - | ETL |
| file_schedules | S:4913 | server.js:914, :11814 | - | SCHD |
| file_assignment_versions | - (newer than S) | server.js:940 | - | FILE |
| logical_file_groups | S:5333 | backend/migrations/createLogicalFileGroupsTables.js:15 | - | FILE |
| file_processing_artifacts, archive_members, encrypted_passwords, processing_events | S:4841, :4297, :4615, :5587 | migrations/002_archive_processing_extensions.sql:7, :24, :45, :64 | - | ARC |
| archive_extractions | S:4263 | migrations/004_archive_extractions_table.sql:5 | - | ARC |
| dlq_jobs | S:4532 | migrations/003_dlq_system.sql:7 | - | ARC |
| upload_staging | - | backend/services/BatchRecordProcessor.js:392 (runtime) | - | API |
| api_tokens, upload_batches, upload_files, upload_file_records | S:4231, :6374, :6428, :6408 | backend/migrations/createProgrammaticUploadTables.js:19, :59, :101, :156 | - | API |
| quality_rules | S:5793 | - | rule_name, rule_type (completeness/validity/consistency/uniqueness/freshness), column_name, rule_config jsonb, severity, enabled, project_id, sub_project_id | DQ |
| file_quality_rules, transformation_quality_rules | S:4864, :6356 | backend/migrations/createQualityRuleAssociations.js:17, :48 | - | DQ |
| quality_rule_configurations, quality_rule_violations, quality_reports, file_quality_checks | S:5721, :5750, :5701, :3260 | file_quality_checks: server.js:9841, :9888, :10068 (in request path) | - | DQ/ERR |
| mapping_job_errors | S:3399 | - | - | ERR |
| profiling_metrics, anomalies | S:3503, :2583 | backend/migrations/createETLTransformationTables.js:118, :147 | - | PROF/ANOM |
| vendor_file_profiling_results | S:6856 | backend/migrations/create_vendor_file_profiling_table.sql:4 | - | VND |
| bulk_profiling_jobs, bulk_profiling_files | S:4392, :4366 | backend/src/migrations/index.js:226, :253 | - | BULK |
| schema_validation_jobs, schema_validation_job_files | S:6064, :6036 | backend/migrations/createSchemaValidationJobs.js:16, :57 | - | SCHV |
| transformation_mappings | S:6292 | backend/migrations/createETLTransformationTables.js:15 | mapping_id, mapping_name, source_connection_id, source_file_pattern, source_schema, field_mappings jsonb, target_connection_id, target_table_name, target_schema, status, enabled, anomaly_rules, variables, project_id NOT NULL, sub_project_id, vendor_agreement_id, vendor_agreement_file_schema_id, schema_drift_handling, pii_columns, violation_handling, rdm_* config, is_visual_mapping, visual_mapping_id | ETL |
| transformation_jobs, transformation_logs | S:6220, :6272 | createETLTransformationTables.js:72, :103; ALTER jira_issue_key server.js:5950 | - | EXE |
| transformations, transformation_executions, transformation_outputs, transformation_lineage | S:3755, :3677, :3737, :3699 | backend/migrations/createTransformationTables.js:23, :42, :59, :73; also server.js:11839, backend/config/database.js:292, backend/services/TransformationService.js:107, :555 | - | XFM |
| column_mappings | S:4470 | - | - | ETL |
| jobs | S:5282 | initBusinessProcessTables.js:52; database_schema.js:38 | name, business_process_id, status, source/target_connection_id, validation/error_handling/notification/schedule_settings jsonb, created_by | JOB |
| job_history, job_runs, job_schedules | S:5217, :5237, :5259 | job_schedules: server.js:6014 | - | JOB |
| business_processes | S:4429 | initBusinessProcessTables.js:38 | - | BPR |
| job_groups, job_group_jobs, user_job_groups | S:3382, :3366, :3799 | server.js:13686, :13697, :13706 | - | BPR |
| job_dependencies, job_group_schedules, job_group_dependencies | S:5163, :5188, :3869 | backend/migrations/createJobDependencyTables.js:12, :43, :79 | - | BPR |
| dbt_models, dbt_executions | S:3046, :3005 | createJobDependencyTables.js:110, :161 | - | XFM (DBT page archived) |
| mapping_groups, mapping_group_members, mapping_group_executions | S:5411, :5392, :5363 | backend/migrations/workflowOrchestration.js:20, :35, :92 | - | MGRP |
| workflow_steps, workflow_executions | S:7256, :7226 | workflowOrchestration.js:48, :113 | - | WFL |
| n_step_workflows, n_step_workflow_steps, n_step_workflow_assets, n_step_workflow_runs, n_step_workflow_run_steps | S:5516, :5498, :5433, :5475, :5451 | database_ddl_2026-01-07.sql:1638 only | - | WFL |
| schedules | S:6001 | workflowOrchestration.js:66 | entity_type (mapping/mapping_group/workflow/vendor_agreement_expiration), entity_id, schedule_type (cron/interval), cron_expression, interval_value/unit, timezone, is_active, last_run, next_run, project_id, sub_project_id | SCHD |
| visual_mapping_defs, visual_mapping_nodes, visual_mapping_edges, visual_mapping_executions, visual_mapping_execution_logs | S:7018, :7121, :7045, :7090, :7067 | database_ddl_2026-01-07.sql:2636 only | - | VMAP |
| visual_workflows, visual_workflow_executions, visual_workflow_execution_logs | S:7200, :7168, :7145 | - | - | VWF |
| visual_lineage_graphs, lineage_views | S:6992, :5308 | lineage_views: database_ddl_2026-01-07.sql:1512 | - | LIN |
| file_ownership, column_sensitivity_tags, governance_policies, file_policy_assignments | S:4777, :4508, :5075, :4803 | backend/migrations/createDataGovernanceTables.js:12, :35, :55, :73 | - | GOV |
| governance_tags, file_tag_assignments | S:5093, :4964 | backend/migrations/createGovernanceTagsTables.js:12, :31 | - | GOV |
| column_governance_tag_assignments, column_policy_assignments | S:4451, :4489 | backend/migrations/createColumnGovernanceTables.js:12, :34 | - | GOV |
| tag_permissions | S:6175 | backend/migrations/addTagPermissionLevels.js:33 | - | GOV |
| retention_policies, archived_files, file_restorations, retention_policy_runs | S:5937, :4324, :4883, :5973 | migrations/001_retention_archival_system.sql:8, :50, :100, :133 | - | RET |
| audit_log, execution_audit, data_access_log, config_change_history, security_audit_log | S:3826, :3084, :2933, :2841, :3613 | backend/migrations/createAuditTables.js:12, :66, :113, :161, :204 | - | AUD |
| audit_retention_settings, *_archive (5 tables), frontend_audit_log | S:2822, :2783, :3121, :2969, :2874, :3645, :3309 | backend/migrations/addAuditRetentionAndArchive.js:12, :35, :83, :127, :172, :212, :253 | - | AUD |
| audit_ledger, audit_ledger_sequence, audit_ledger_verification | S:2677, :2742, :2757 | backend/migrations/createImmutableAuditLedger.js:13, :92, :109 | - | LEDG |
| file_audit_details | S:4647 | - | - | LEDG |
| vendors, vendor_agreements, vendor_agreement_approvals, vendor_agreement_changes | S:6955, :6769, :6643, :6669 | backend/migrations/createVendorManagement.js:18, :54, :112, :137 | vendor_agreements: vendor_id, agreement_code (uniq), file_name, schema jsonb, frequency, approval_status (13-value CHECK: draft ... fully_approved/rejected/changes_pending), status, is_locked, version, project_id, sub_project_id, vendor_connection_id, drop_location_path, contacts, contains_pii, data_classification (Public/Private/Confidential), retention_days, governance_manager_user_id, contract_start/end_date, sla_enabled, frequency_pattern, arrival_days, arrival_time, alert_threshold_minutes, additional_stakeholder_user_ids/group_ids | VAG/VAP |
| vendor_approval_step_decisions | - (newer than S) | backend/migrations/addApprovalChainToVendorAgreements.js:62 | - | VAP |
| vendor_agreement_documents | S:6696 | backend/migrations/addGovernanceWorkflow.js:116 | - | VAG |
| vendor_agreement_file_schemas | S:6721 | backend/migrations/createVendorAgreementFileSchemas.js:18 | - | VAS |
| vendor_users | S:6923 | backend/migrations/createVendorUsers.js:18 | - | VND |
| vendor_sla_violations | S:6895 | backend/migrations/addSLAMonitoringToVendorAgreements.js:83 | - | SLA |
| alert_policies, alert_policy_recipients, alert_runs, alert_events, alert_aggregation, alert_attachments | S:4141, :4170, :4189, :4102, :4057, :4080 | backend/migrations/createEmailAlertingSystem.js:13, :54, :76, :113, :150, :179 | - | ALRT |
| alert_history, alert_rules | S:4125, :2563 | alert_history: server.js:5138 | - | ALRT |
| notifications | S:5536 | backend/migrations/addGovernanceWorkflow.js:141 | - | NTF |
| digest_subscriptions, email_digests | - (newer than S) | backend/migrations/createDigestTables.js:13, :33 | - | NTF |
| allowed_email_domains | S:4211 | backend/migrations/createAllowedEmailDomains.js:12 | - | EML |
| file_pattern_metrics | S:3212 | backend/migrations/createFileInsightsTable.js:44 | - | DASH |
| user_badges, user_dashboard_settings | S:6502, :3783 | server.js:5104, :6287 | - | DASH |
| app_settings | S:2623 | - | read/written by profile_api.py:2075, :2205 and appSettingsService | AI/ADM |
| migrations, schema_migrations | S:3435, :3559 | backend/src/migrations/index.js:133; backend/utils/migrationTracker.js:21 | - | MIG |
| Email connection and Jira connection tables | **gap**: table names not located | backend/routes/emailConnectionRoutes.js, backend/routes/jiraRoutes.js | - | EML/JIRA |

---

## 5. External services

| Service | SDK / host | Call sites | Area |
|---|---|---|---|
| AWS Secrets Manager | @aws-sdk/client-secrets-manager | backend/config/config-secrets.js:14 | SEC |
| AWS S3 | aws-sdk v2, boto3 | backend/services/ConnectionService.js:3; archivalStorageService.js:9; BulkProfilingService.js:7; FastSchemaValidationService.js:10; schemaService.js:7; schemaValidationService.js:3; LargeAttachmentService.js:8; backend/utils/cloudStorageFileList.js:7; backend/routes/dropLocation.js:407; connectionRoutes.js:1534; connectionBrowse.js:10; server.js:4328; profile_api.py:399, :1883 | CONN/ING/RET/... |
| Google Cloud Storage | @google-cloud/storage, google.cloud.storage | ConnectionService.js:4; archivalStorageService.js:10; schemaService.js:8; schemaValidationService.js:4; LargeAttachmentService.js:9; cloudStorageFileList.js:8; dropLocation.js:492; connectionRoutes.js:1594; connectionBrowse.js:11; server.js:4365; profile_api.py:414 | CONN |
| Azure Blob Storage | @azure/storage-blob, azure.storage.blob | ConnectionService.js:5, :1271; archivalStorageService.js:11; schemaService.js:9; schemaValidationService.js:5; LargeAttachmentService.js:10; cloudStorageFileList.js:9; dropLocation.js:550; connectionRoutes.js:1630; connectionBrowse.js:12; profile_api.py:429; **server.js:4408 requires `@azure-sdk/storage-blob` (wrong package name; that drop path will throw)** | CONN/ING |
| Snowflake | snowflake-sdk | backend/services/ConnectionService.js:6 | CONN |
| AWS SES | aws-sdk | backend/services/email/AwsSesAdapter.js:10 | EML |
| Azure Communication Email | adapter | backend/services/email/AzureEmailAdapter.js | EML |
| SendGrid | @sendgrid/mail, api.sendgrid.com/v3 | backend/services/email/SendGridAdapter.js:17, :28 | EML |
| SMTP | nodemailer | backend/services/email/SmtpAdapter.js:9; GcpEmailAdapter.js:9 | EML |
| Gmail OAuth2 / send | accounts.google.com, oauth2.googleapis.com, gmail.send scope | backend/routes/emailConnectionRoutes.js:428, :695, :921; backend/services/email/GmailOAuth2Adapter.js:26, :43-44 | EML |
| Microsoft identity / Outlook | login.microsoftonline.com, graph.microsoft.com, outlook.office365.com SMTP | emailConnectionRoutes.js:446, :800, :933; backend/services/email/OutlookOAuth2Adapter.js:17, :35, :49 | EML |
| Jira Cloud REST v3 | axios to `<instance>/rest/api/3/...` | backend/services/JiraService.js:169, :269, :388 | JIRA |
| Okta OIDC | browser redirect; backend user sync | src/pages/OktaCallback.jsx; src/config/secrets.js:7-10; server.js:449 (CSP), :10237; backend/config/config-secrets.js:27-30. The @okta/* npm packages are listed in package.json but never imported | AUTH |
| RDM (reference data API) | axios, RDM_BASE_URL | backend/services/rdmService.js:11-43; server.js:1261-1370 | RDM |
| Hugging Face model hub | @xenova/transformers (Xenova/all-MiniLM-L6-v2), HF token header | backend/services/AIService.js:20-33, :106 | AI |
| OpenAI (or Replit AI integrations proxy) | openai python | backend/ai_providers/openai_provider.py:28-39 | AI |
| AWS Bedrock | boto3 bedrock-runtime (default Claude 3 Sonnet model id) | backend/ai_providers/bedrock_provider.py:18, :32 | AI |
| Azure OpenAI | AzureOpenAI | backend/ai_providers/azure_provider.py:32 | AI |
| Google Gemini | google.generativeai | backend/ai_providers/gemini_provider.py:36-40 | AI |
| ClamAV | clamscan + scripts/init-clamav.sh | backend/services/VirusScanService.js:12, :87 | ARC |
| dbt CLI | spawn('dbt') | backend/services/DBTService.js:312 | XFM |
| Internal: Python Profile API | http://localhost:8000 | server.js:4294, :4812, :13983; backend/workers/fileProcessingWorker.js:1615; vite.config.js:56 | PROF |
| Internal: Node API from Python | BACKEND_API_URL -> /api/db_url | profile_api.py:182 | SEC |
| Internal: Rust log service | LOG_SERVICE_URL (default localhost:9000) | backend/services/logClient.js:13 | OPS (dead) |
| Google Fonts | CSP allow-list | server.js:463-465 | WEB |

---

## 6. Environment variables (names only)

| Variable | Read at | Area |
|---|---|---|
| PORT | server.js:107; productionBootstrap.js:14; backend/src/config/environment.js:12 | PLT |
| NODE_ENV | server.js:107, :573, :598, :13968; backend/config/database.js:66; backend/middleware/errorHandler.js:86 | PLT |
| INTERNAL_API_PORT, PROFILE_API_PORT | productionBootstrap.js:15-16; server.js:13977; profile_api.py:2260 | PLT |
| HOST, API_PREFIX, UPLOADS_DIR, CORS_ORIGINS, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX | backend/src/config/environment.js:13-20 | PLT/SEC |
| ALLOWED_ORIGINS | server.js:513-514; profile_api.py:55; .replit:97 | SEC |
| SESSION_SECRET | server.js:594 | SEC |
| JWT_SECRET, JWT_EXPIRATION, JWT_REFRESH_EXPIRATION, BCRYPT_SALT_ROUNDS, COOKIE_SECRET, ENABLE_CSRF | backend/src/config/environment.js:35-40; backend/middleware/authenticate.js:26, :32 | SEC |
| JWT_EXPIRES_IN | backend/tests/setup.js:10 (tests only) | SEC |
| ENCRYPTION_KEY | server.js:14118; backend/utils/encryption.js:13 | SEC |
| VAULT_ENCRYPTION_KEY | backend/services/passwordVaultService.js:14, :22; backend/routes/vendorAgreementRoutes.js:1402 | ARC |
| DATABASE_URL | backend/config/database.js:18-69; backend/config/config-secrets.js:7-119; server.js:10782; profile_api.py:198; backend/services/ServiceBase.js:32; several migrations | PLT |
| DB_POOL_SIZE | backend/config/database.js:72 | PLT |
| DATABASE_SSL, DATABASE_SSL_REJECT_UNAUTHORIZED, DATABASE_POOL_MAX, DATABASE_POOL_IDLE_TIMEOUT, DATABASE_CONNECTION_TIMEOUT | backend/src/config/environment.js:26-30 | PLT |
| PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE | backend/migrations/createAuditTables.js:261-277; addAuditRetentionAndArchive.js:319-333; createImmutableAuditLedger.js:210-224; createJobDependencyTables.js:230-246 | MIG |
| AWS_REGION, AWS_SECRET_ID | backend/config/config-secrets.js:18, :126; profile_api.py:1887; bedrock_provider.py:19 | SEC |
| AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY | backend/services/ConnectionService.js:105-109; backend/src/config/environment.js:115; profile_api.py:1885-1886; bedrock_provider.py:35-36 | CONN |
| OKTA_CLIENT_ID, OKTA_DOMAIN, OKTA_ISSUER, OKTA_REDIRECT_URI, BACKEND_URL (+ VITE_ variants) | backend/config/config-secrets.js:27-31; server.js:449 | AUTH |
| VITE_ENV, VITE_OKTA_CLIENT_ID, VITE_OKTA_DOMAIN, VITE_OKTA_REDIRECT_URI, VITE_BACKEND_URL | src/config/secrets.js:5-10 | AUTH/WEB |
| VITE_API_BASE_URL | src/pages/Anomalies.jsx:7; src/components/BulkProfilingTab.jsx:8; src/components/HealingRecommendations.jsx:6; src/components/SchemaValidationTab.jsx:11 | WEB |
| REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB | backend/config/redis.js:17-20; backend/queues/uploadQueue.js:14-31 | PLT |
| REDIS_URL | backend/queue/RedisQueue.js:19; queueFactory.js:50; backend/services/cacheService.js:25, :50; AlertAggregator.js:44 | PLT |
| QUEUE_TYPE | backend/queue/queueFactory.js:42; server.js:1115, :1215 | PROC |
| AWS_SQS_QUEUE_URL, GCP_PROJECT_ID | backend/queue/queueFactory.js:70, :80 (in commented-out stubs) | PROC |
| MAX_FILE_SIZE | server.js:812; backend/src/config/environment.js:53 | ING |
| FILE_STORAGE_PATH | server.js:8893 | SCH |
| STORAGE_PROVIDER, LOCAL_STORAGE_PATH, S3_BUCKET, S3_REGION, AZURE_CONTAINER, AZURE_CONNECTION_STRING, GCS_BUCKET, GCS_PROJECT_ID | backend/src/config/environment.js:45-52 | PLT (dead path) |
| GOOGLE_APPLICATION_CREDENTIALS | backend/src/config/environment.js:123; gemini_provider.py:27 | CONN/AI |
| PROFILING_SERVICE_URL, PROFILE_API_URL | server.js:4812; backend/workers/fileProcessingWorker.js:1615 | PROF |
| BACKEND_API_URL | profile_api.py:182 | PROF |
| DISABLE_VIRUS_SCAN | backend/services/VirusScanService.js:24; productionBootstrap.js:38; profile_api.py:461; .replit:65 | ARC |
| APP_VERSION | server.js:1163 | OPS |
| LOG_LEVEL | backend/utils/logger.js:31, :58 | OPS |
| LOG_SERVICE_URL | backend/services/logClient.js:13 | OPS |
| LOG_SERVICE_PORT, LOG_SERVICE_DATA_DIR | rust-log-service/src/config.rs:70, :74 | OPS |
| MAX_MEMORY_PERCENT, WARNING_MEMORY_PERCENT, CIRCUIT_BREAKER_RECOVERY_PERCENT, MEMORY_CHECK_INTERVAL | backend/utils/memoryMonitor.js:21-24; utils/memory_monitor.py:22-24 | OPS |
| SKIP_RATE_LIMIT | backend/middleware/enterpriseRateLimiter.js:209 | SEC |
| RDM_BASE_URL, RDM_API_KEY | backend/services/rdmService.js:11-43; server.js:1261-1370 | RDM |
| HUGGING_FACE_TOKEN | backend/services/AIService.js:20-21 | AI |
| AI_PROVIDER | profile_api.py:1974, :2020; backend/ai_providers/base.py:95 | AI |
| AI_INTEGRATIONS_OPENAI_API_KEY, OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL | backend/ai_providers/openai_provider.py:28-29 | AI |
| GEMINI_MODEL, GOOGLE_API_KEY | backend/ai_providers/gemini_provider.py:18, :26 | AI |
| BEDROCK_MODEL_ID | backend/ai_providers/bedrock_provider.py:18 | AI |
| AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_API_VERSION, AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT | backend/ai_providers/azure_provider.py:18-35 | AI |
| SENDGRID_API_KEY | backend/services/email/SendGridAdapter.js:26 | EML |
| GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, API_BASE_URL | backend/routes/emailConnectionRoutes.js:420-931 | EML |
| APP_URL, REPLIT_DEV_DOMAIN | backend/services/VendorAgreementNotificationService.js:480+; backend/services/vendorAgreementService.js:1248+ | VAP |
| CI secrets: EC2_SSH_PRIVATE_KEY, EC2_HOST, EC2_PROJECT_PATH | .github/workflows/prod-deployment.yml:19-36 | PLT |

---

## 7. Possibly-dead summary

- **Routers and apps that are never mounted or required:** backend/routes/transformationRoutes.js + backend/controllers/transformationController.js; the whole backend/src app (app.js, server.js, routes/*, controllers/*, migrations/index.js, repositories/transformationRepository.js, services/transformations.js). server.js still uses backend/src/middleware/{authenticate,validation,cache}.js, backend/src/config/environment.js and backend/src/services/authService.js.
- **Shadowed routes:** server.js:11087, :11862, :11873, :11890, :12075, :12198, :13055, :12558, :12653, :13326, :13375, :13406, :13436; rdm.js:22, :60, :126, :164; healthCheckRoutes.js:31; fileAudit.js:172; qualityRules.js:741; vendorAgreementRoutes.js:1482; transformations.js:1255 and mappingGroups.js:587 (the frontend calls both, so these are probably bugs).
- **Never-started workers:** AlertAggregationWorker.start (backend/services/AlertAggregationWorker.js:30), memoryMonitor.startMonitoring, logClient, rust-log-service.
- **Unreferenced modules:** backend/middleware/hybridAuthorization.js, policyAuthorization.js, enterpriseCacheMiddleware.js, enterpriseRateLimiter.js. Services reached only through DI auto-registration: streamingFileProcessor.js, auditCleanupService.js, LargeAttachmentService.js, DBTService.js. Also asyncTransformationService.js (only chain via asyncProcessor), backend/services/AIService.js.backup, database_schema.js.
- **Unrouted frontend pages:** listed in section 2.
- **Broken test:** backend/tests/alert-flow.test.js:16 requires `../workers/AlertAggregationWorker`, which does not exist.

## 8. Gaps (not covered in this pass)

- Field-level columns were read only for files, users, projects, vendor_agreements, connections, storage_connections, jobs, transformation_mappings (partial), quality_rules and schedules. All other tables give only the DDL line.
- `src/components/*` (about 180 files), `src/hooks`, `src/api` were not mapped one by one. They are assigned to areas by name only (see areas.md).
- No per-file line counts for src/components, backend/errors, backend/di, backend/config. Area line totals are estimates.
- I did not trace which tables each route queries.
- Not checked: whether the Socket.IO connection is authenticated; table names for email-connection and Jira-connection tables; whether the `/api/ml` and `/profile-api` exposures are reachable in production behind any upstream proxy.
- Python: backend/ml and ai_providers internals and profile_api.py helper functions (lines 1-1660) were not enumerated. Only routes and imports were.
- Many `backend/migrations/*` files (99 files, about 12.4k lines) were listed by CREATE TABLE only. ALTER-only migrations were not catalogued.
