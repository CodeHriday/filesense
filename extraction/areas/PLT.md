# PLT - Platform bootstrap and infrastructure

## Summary
Two processes in production on Replit: `productionBootstrap.js` owns the public port and proxies to `server.js` (the monolith API) once ready (.replit:9; productionBootstrap.js:14-17). `server.js` builds the Express app (middleware, ~14k lines of routes), binds the port first and initialises the DB afterwards (server.js:14053-14066). A Python service `profile_api.py` is spawned after readiness (productionBootstrap.js:147-148). A second deploy path exists: GitHub Action to EC2 with pm2 (prod-deployment.yml). A second, apparently unused app lives in `backend/src/` (app.js, server.js).

## Entry points

### 1. productionBootstrap.js (Replit deploy run command)
- Trigger: `.replit` `run = ["node","productionBootstrap.js"]` (.replit:9); build is `npm run build` = `vite build` (.replit:10; package.json:7).
- Auth: none. Listens on `PORT || 5000`, host `0.0.0.0` (productionBootstrap.js:14, :134).
- Behaviour: spawns `node --max-old-space-size=512 --expose-gc server.js` with `NODE_ENV=production`, `PORT=INTERNAL_API_PORT || PORT+1` (:15, :49-57). Polls every 500 ms `/api/health/live` then `/api/health/ready` on the internal port, 2000 ms timeout each (:67-89, :139-151). Ready only on HTTP 200.
- Before ready: `GET /` and `/api/health/live` return 200 text "Application is starting"; everything else 503 JSON with `Retry-After: 5` (:96-108). WebSocket upgrades are destroyed before ready (:123-127).
- After ready: starts `python profile_api.py` once with `PROFILE_API_PORT` (default 8000), `BACKEND_API_URL=http://127.0.0.1:<publicPort>`, `DISABLE_VIRUS_SCAN` defaulting to `'true'` (:33-39, :148). Proxies all HTTP/WS with `xfwd` (:18, :111).
- Errors: proxy error returns 502 `{error:'Application is temporarily unavailable.'}` (:115-120). If the API process exits while not shutting down, the bootstrap exits with its code or 1 (:59-62). Profile API exit is only logged, not restarted (:43-45).
- SIGTERM/SIGINT: kill both children, close server, exit 0 (:156-169).
- Note: once ready, the bootstrap never re-checks readiness (interval cleared :150).

### 2. server.js startup (`startServer`)
- Trigger: module load calls `startServer()` (server.js:14216); dev command `NODE_ENV=development node --max-old-space-size=512 --expose-gc server.js` (.replit:54), `npm run dev:backend` (package.json:9).
- Order: create `http.createServer(app)` and listen on `PORT || (production ? 5000 : 3000)`, `0.0.0.0` (server.js:107, :14053-14054); `initializeDatabase()` (:14066) which calls `database.initialize()` = `testConnection()` with 5 retries, 1000 ms initial delay, doubling (backend/config/database.js:171, :343-350; di/bootstrapper.js:137-141), then `initializeTables()` creating/altering the `transformations` table (database.js:286-325).
- Then `repairBootstrapAdminRoles` and `getDashboardPrerequisiteStatus` (server.js:14073-14074). Rule: if user `username='admin'` has no `user_roles` rows, insert roles `Admin`, `Vendor Manager`, `Governance Manager` (repairCleanPublishDashboardPrerequisites.js:3, :5-22). Readiness requires only tables `project_members`, `access_group_members`, `project_access_groups`; missing function `get_user_projects(integer)` is a warning only and the app uses a "built-in fallback" (:27-56; server.js:14094-14096). If not ready, `app.locals.databasePrerequisites.ready=false` and the API stays up but `/api/health/ready` returns 503 (server.js:14076-14086, :1180-1189).
- Then: `initBusinessProcessTables` (errors logged, continue, :14100-14106); start scheduler worker (:14111); log whether `ENCRYPTION_KEY` is 64 hex chars, warning only, never fails (:14117-14131); start BullMQ upload worker with concurrency 5, failure only warns (:14135-14144); Socket.IO with CORS from the same allowedOrigins, methods GET/POST (:14148-14169); visual mapping WebSocket init (:14172); materialized view worker every 60 s (:14178); orphaned-job recovery (:14187).
- Workers started at module load, before DB init: file worker `.start()` (:45), upload cleanup (max age 3600000 ms, orphaned uploads under `__dirname/uploads`; inventory says checks hourly, the file comment says every 15 minutes, interval is set inside the worker, not read) (:55-60), SLA monitor 900000 ms (:63-68), insights aggregation at `'02:00'` (:71-75), retention at `'01:00'` (:78-83). Time zone of these schedules: not specified in server.js (see Open questions).
- Failure: any exception in startServer logs troubleshooting text and `process.exit(1)` (:14196-14211).
- Shutdown: SIGTERM/SIGINT run `gracefulShutdown` stopping workers and closing DB, exit 0 or 1 (:14219-14269). It does not close the HTTP server or Socket.IO; `httpServer` is local to startServer.

### 3. server.js global middleware chain (cross-cutting for all routes)
In order:
- `app.set('trust proxy', 1)` (:110).
- Helmet + CSP, registered inside an async IIFE after `await getAllSecretData()` (:435-494). CSP: `scriptSrc 'self' 'unsafe-inline'`, HSTS `maxAge 31536000` includeSubDomains preload, `frameAncestors 'none'`. In production the Okta domain comes from the secrets store (`secrets.OKTA_DOMAIN`), otherwise from `VITE_OKTA_DOMAIN || OKTA_DOMAIN` plus localhost connect-src (:444-451).
- compression level 6, threshold 1024, skipped if header `x-no-compression` is present (:499-510).
- CORS: origins from `ALLOWED_ORIGINS` (comma split) else default list `localhost:5000, localhost:3000, https://*.replit.dev, https://*.replit.app, https://filesense.blumetra.com` (:513-515). `*` entries converted by `globToRegex`. No Origin header is allowed. Methods `GET, POST, PUT, DELETE, OPTIONS` (PATCH not listed), headers `Content-Type, Authorization, X-Requested-With`, credentials true, preflight 204 (:517-555). Disallowed origin gives `Error('Not allowed by CORS')` passed to the error handler (:547). `.replit` sets `ALLOWED_ORIGINS` including filesense-qa.blumetra.com and filesense.blumetra.com (.replit:97).
- Body parsers JSON and urlencoded, limit `50mb` (:556-557).
- Production only: `GET /` serves `dist/index.html`, or a 200 "Application is starting" shell if the file is missing (:573-589).
- express-session: secret `SESSION_SECRET || JWT_SECRET`, `secure` in production, httpOnly, maxAge 24 h, in-memory default store (no store configured) (:593-602).
- Audit middleware for all requests (:606); `extractFileId` (:609).
- Timeouts: request 30000 ms returns 408 `{error:'Request timeout'}`; response 35000 ms returns 408 if headers not sent and destroys the socket (:612-640).
- Rate limits: `generalLimiter` mounted on `/api/` (:767): 15 min window, max 500, 429 JSON, skips `/health/ready` and `/health/live` (:643-664). `authLimiter`: 5 per 15 min, skipSuccessfulRequests, applied to login, register, request-password-reset (:667-682; :10417, :10513, :10830). `uploadLimiter`: 20 per hour per IP (:685-698), applied to check-duplicate, upload, drop (:2489, :2557, :3476). The file status endpoint is registered before the general limiter on purpose (:700-703).
- After all routes: production-only `/profile-api` proxy to `http://localhost:<PROFILE_API_PORT||8000>`, `proxyTimeout 120000`, path rewrite, body re-serialised for POST/PUT/PATCH, 502 `{error:'Profile API unavailable'}` on error (:13973-14004); no `authenticateToken` precedes it in this block (see SECURITY). Static `dist` and SPA fallback for non-`/api` paths (:14007-14023). 404 handler builds `NotFoundError('Route <url> not found')` (:14030-14037); then `errorHandler` (:14041).
- Error handler: JWT errors give 401 `AUTHENTICATION_FAILED`; Multer `LIMIT_FILE_SIZE` gives 400 `FILE_TOO_LARGE`; default 500 `INTERNAL_ERROR` with message hidden in production (errorHandler.js:62-101). Error shape `{error:{message,code,timestamp,details}}`. Error detail for other error types is in ERR/SEC areas.

### 4. Health endpoints (server.js)
- `GET /health-check` returns 200 `{status:'ok',timestamp}` (:1027). `GET /api/health` same (:1033). Also `app.use('/api/health', healthCheckRoutes)` Python environment checks (:1038-1039; routes content not traced).
- `GET /api/health/db`: 200 healthy or 503 unhealthy using `database.getHealthStatus()` (:1042-1064).
- `GET /api/health/enterprise`: checks db, cache, queue (`file-processing`), materialized views, memory (MB), uptime; `?detailed=true` adds DB stats; 200 `healthy` or 503 `degraded`; only a database failure sets degraded (cache/queue/view failures leave `overallHealthy` true) (:1069-1169). Version `APP_VERSION || '1.0.0'`.
- `GET /api/health/ready`: 503 if `databasePrerequisites.ready` false, else 200 `{ready:true}` if DB healthy (:1180-1200). `GET /api/health/live`: 200 `{alive:true,timestamp}` (:1203-1205).
- `GET /api/queue/metrics` (:1208): no auth middleware on the route; exposes queue metrics.
- All of the above have no auth; all under `/api/` pass the general limiter except ready/live.

### 5. CI/CD
- `.github/workflows/prod-deployment.yml`: on push to branch `prod`, SSH to `ubuntu@EC2_HOST` with `StrictHostKeyChecking=no`, runs `git pull origin prod`, `npm install`, `npm run build`, activates `venv`, `pip install -r requirements.txt`, `pm2 restart all` (:3-47). Secrets: `EC2_SSH_PRIVATE_KEY`, `EC2_HOST`, `EC2_PROJECT_PATH`. Pinned old actions `checkout@v2`, `ssh-agent@v0.5.3`.
- `.github/workflows/sonar.yml`: on push to `main`, scanner 5.0.1.3006, project key `filesense-main`, host `https://sonar.blumetra.com`, excludes `backend/tests/**,coverage/**` (:3-40). It passes both `SONAR_TOKEN` env and a hardcoded `-Dsonar.token=...` (:34, :41). See SECURITY.
- Replit `postMerge`: `scripts/post-merge.sh` runs `npm install --no-audit --no-fund`, timeout 120000 ms (.replit:99-101; post-merge.sh:7).

### 6. Config and database layers
- `backend/config/database.js` (used by DI `database`): `DATABASE_URL` from env, else AWS Secrets Manager via `initializeSecrets()`, else throws (:16-43). Pool config: production `max 10, min 2, connectionTimeout 30000, idleTimeout 60000`; non-production `max DB_POOL_SIZE || 20, min 0, 10000, 30000`; `statement_timeout 60000`; keepAlive; SSL `{rejectUnauthorized:false}` in production, off otherwise (:65-87). If pool creation fails, a dummy pool that throws on use replaces it (:135-149). Slow query warning at 1000 ms (:228).
- `backend/src/config/environment.js` (used for JWT config): `JWT_SECRET` required in production, minimum 64 chars and must not contain words such as `secret`, `test`, `password` or startup throws (:61-104); in development a random secret is generated (:80). `JWT_EXPIRATION` default `'30m'`, refresh `'7d'`, `BCRYPT_SALT_ROUNDS` 12 (:36-38). `COOKIE_SECRET` default `'cookie-secret-change-in-production'` (:39). `RATE_LIMIT_*` and `MAX_FILE_SIZE` (100 MB) defined here (:19-20, :53) but server.js hardcodes its own values.
- Other env vars are catalogued in inventory.md:1034-1080 and not re-traced here.

### 7. Alternate app `backend/src/app.js` / `backend/src/server.js`
- Only starts when run directly (`require.main === module`, backend/src/server.js:49), listens at :20. Contents of the app not traced beyond `backend/src/routes/index.js:17`, `GET /` returns `{status:'ok',timestamp}` and mounts only `/auth` (index.js:25). Not referenced by any npm script or `.replit` (package.json:6-12; .replit:54). Treated as DEAD.

## Data touched
- Tables: `users`, `roles`, `user_roles` (insert), `project_members`, `access_group_members`, `project_access_groups` (existence checks), `transformations` (create/alter) (repairCleanPublishDashboardPrerequisites.js:8-47; database.js:291-317). Function `get_user_projects(integer)` existence check.
- Filesystem: `uploads/` (cleanup worker), `dist/` (static).
- External: Redis (queue/cache), AWS Secrets Manager, Okta domain (CSP only), Sonar server, EC2 over SSH.

## Flags
- BUG: `getHealthStatus()` never queries the database; it always returns `healthy:true` unless reading `pool.totalCount` throws, and `responseTime` is computed as `Date.now()-start` immediately (~0) (backend/config/database.js:381-392). `/api/health/ready`, `/db`, `/enterprise` therefore do not detect a DB outage.
- BUG: Helmet is registered inside an async IIFE after awaiting secrets (server.js:435-494), so it is added to the middleware stack later than the routes registered synchronously; responses from routes registered earlier will not get Helmet headers. If `getAllSecretData()` throws, Helmet is never installed (:490-492). Behaviour depends on timing; confirm at runtime.
- BUG: comments contradict values: `max: 500 // Limit each IP to 100 requests` (server.js:645); `RATE_LIMIT_MAX ... // 100 requests per window` default 500 (environment.js:20).
- BUG: CORS allowed methods omit `PATCH` (:550) while the profile-api proxy handles PATCH bodies (:13992).
- BUG: `module.exports = { pool, ... }` in database.js exports `pool` at module load, when it is still `undefined` (:90, :410-420); consumers using `database.pool` get undefined. Other uses go through functions. Needs consumer check.
- BUG: `transaction()` uses `pool.connect()` without `initializePool()` awaited (:264-265), unlike `query` (:219).
- BUG: productionBootstrap.js indentation shows the `if (!isApiReady())` block closing early (:96-109); behaviour is correct but formatting is broken (cosmetic).
- BUG: `/api/health/live` through the bootstrap before ready returns text, after ready returns JSON, so the probe body changes (productionBootstrap.js:97-100 vs server.js:1203).
- SECURITY: hardcoded Sonar token literal in workflow (sonar.yml:41; value not copied). The token is in git history; also `SONAR_TOKEN` secret is set but unused.
- SECURITY: `StrictHostKeyChecking=no` in the deploy SSH (prod-deployment.yml:23).
- SECURITY: `/profile-api` proxy mounted without `authenticateToken` in the production block (server.js:13978-14004). Whether `profile_api.py` authenticates is covered in PROF; the unauthenticated forwarding itself is shown here. In development, Vite proxies per comment (:13973), not traced.
- SECURITY: `/api/queue/metrics`, `/api/health/enterprise`, `/api/health/db` have no auth and expose queue metrics, memory, pool sizes, and error messages (`err.message`) (server.js:1042-1064, :1069, :1208-1219).
- SECURITY: production DB SSL `rejectUnauthorized:false` (database.js:85); `backend/src/config/database.js` also sets this for AWS RDS (:27, :56).
- SECURITY: session secret falls back to JWT secret (:594); default `COOKIE_SECRET` literal (environment.js:39); sessions use the in-memory store (:593), lost on restart and not shared across pm2 instances.
- SECURITY: `DISABLE_VIRUS_SCAN` defaults to `'true'` in production bootstrap (productionBootstrap.js:38) and `.replit:65`, so virus scanning is off unless overridden.
- SECURITY: CSP allows `'unsafe-inline'` scripts (server.js:471); CORS permits no-Origin requests (:520).
- SECURITY: SSL `connect-src` etc. no issue; JSON body limit 50 MB (:556) allows large unauthenticated payloads on routes that precede auth (e.g. login).
- DUPLICATE: two health/readiness-style roots: `/health-check` and `/api/health` (:1027, :1033) return the same shape; `backend/src/routes/index.js:17` is a third.
- DUPLICATE: two Express apps (server.js and backend/src/app.js) and four DB pool setups (backend/config/database.js, backend/db.js, backend/src/config/database.js, ServiceBase.js:10 per inventory.md:899) with different SSL and pool rules (config/database.js:72,85 vs environment.js:28-30, default pool 20 and timeout 5000).
- DUPLICATE: two deploy mechanisms: Replit GCE with productionBootstrap and EC2 with pm2 (`pm2 restart all`, which does not use productionBootstrap; the deploy as written leaves the profile API to a pm2 definition that is not in the repo scope examined).
- DUPLICATE: rate limit config in two places: hardcoded in server.js:643-698 and `RATE_LIMIT_*` env in environment.js:19-20 (the env values are not used by server.js).
- DEAD: `backend/src/server.js` and `backend/src/app.js` (see entry 7); `STORAGE_CONFIG` providers other than local per inventory.md:1059 (not re-verified).
- DEAD: `getPrerequisiteStatus` is exported from the migration module (:83) but server.js imports it as `getDashboardPrerequisiteStatus` (:14074); import line not traced (see Open questions).
- UNCLEAR: the comment on database prerequisite error says "Dashboard requests will retry when access is repaired" but nothing retries; `databasePrerequisites` is set only once at startup (server.js:14076-14097), so a not-ready state never recovers without restart, and the bootstrap proxy then never leaves the "starting" state (productionBootstrap.js:145).
- UNCLEAR: bootstrap admin repair runs on every startup and matches by the literal username `'admin'` (repair...js:12).

## Domain terms
- Bootstrap proxy / production bootstrap: productionBootstrap.js public-port process.
- Readiness / liveness / health probe: `/api/health/ready`, `/api/health/live`, `GET /` (also `/health-check`, "enterprise health").
- Bootstrap admin: user `username='admin'`; "Publish": process that applies schema changes (comment, server.js:14069).
- Profile API / `profile-api`: Python Flask service `profile_api.py`, port 8000 (also "Flask").
- Internal API port vs public port; DLQ (dead letter queue) jobs; materialized view worker; orphan recovery.
- Replit "GCE deployment" (.replit:8) vs "PROD environment" EC2 deploy.

## Open questions
1. Do consumers of `database.js` read `database.pool` (undefined at export) or only functions? Not traced.
2. Where `getDashboardPrerequisiteStatus` is imported in server.js; the exported name is `getPrerequisiteStatus`. Import line not read.
3. Time zone for the 01:00 retention and 02:00 insights workers: not visible in server.js; worker files not read here.
4. Whether the EC2/pm2 deployment runs `productionBootstrap.js`, `server.js` or an ecosystem file (none inspected), and who runs `profile_api.py` there.
5. Whether `profile_api.py` enforces auth, given the `/profile-api` proxy adds none.
6. Whether Helmet is effective in practice (timing of the async registration).
7. Contents of `healthCheckRoutes` and `backend/src/app.js` middleware (not read).
8. Hourly vs 15-minute cadence of the upload cleanup worker (comment says 15 minutes, inventory says hourly).
9. Whether `/api/queue/metrics` is intentionally public.
