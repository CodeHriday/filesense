# OPS - Observability & health

## Summary
Health/readiness/liveness HTTP probes (all unauthenticated), a queue metrics endpoint, a debug DI endpoint, winston loggers, a performance-logging middleware, a Node memory circuit breaker (never wired), and a Rust log service plus Node client (never used). Python memory guard is used by process_file.py (utils/process_file.py:24).

## Entry points
All routes below have no authentication (server.js:1027-1252; backend/routes/healthCheckRoutes.js:31,55).

### GET / (production only; server.js:573-589)
Registered only when `NODE_ENV === 'production'`, before session and audit middleware. Sends `dist/index.html` if it exists, else a 200 "Application is starting, please wait" shell (:575-587). The comment above it (:570-571) says the shell lets the deploy probe pass during warm-up. No auth.

### GET /health-check (server.js:1027)
Static `{status:'ok', timestamp}`, 200. No DB.

### GET /api/health (server.js:1033)
Static `{status:'ok', timestamp}`. Registered before the router mounted at :1039, so it shadows router GET / (healthCheckRoutes.js:31), which is therefore unreachable.

### GET /api/health/ (healthCheckRoutes.js:31) - DEAD (shadowed)
Calls `getUploadQueue().getJobCounts()` (:13-16). Returns always 200 with `status` healthy/degraded, `degradedMode`, and message "Upload queue unavailable - uploads processing synchronously without retry/durability" plus "Start Redis server..." (:44-47).

### GET /api/health/python (healthCheckRoutes.js:55)
Spawns `python3 -c` with a fixed script (:85) checking openpyxl, pandas, pyarrow, ijson, defusedxml. 200 if all installed; 503 `degraded` if not; 500 on throw. Spawn failure or non-zero exit resolve as `allInstalled:false` (:142,:162), so they return 503. A JSON-parse failure of the script output also resolves `allInstalled:false` (:152-156), so it also returns 503. Exposes stderr and python version. No timeout on the spawn.

### GET /api/health/db (server.js:1042)
`database.getHealthStatus()`; 200 `healthy`, 503 `unhealthy` when `healthy` is false or on throw (:1047-1062). Returns the full health object. BUG: `getHealthStatus` (backend/config/database.js:381-400) never queries the DB; it returns `healthy:true` with pool counters (`totalCount`, `idleCount`, `waitingCount`). It can only return `healthy:false` if reading `pool` throws, so the 503 branch is effectively dead and a real DB outage is never reported.

### GET /api/health/enterprise (server.js:1069)
Checks: database (:1075), cache (:1093; always healthy=true, falls back to `{type:'memory'}` if no getStats), queue `getMetrics('file-processing')` (:1111), materialized views (:1124), optional `?detailed=true` DB stats (:1134), memory in MB (:1144), uptime (:1154). Only the database check sets `overallHealthy=false` (:1086, :1089), and that check uses `getHealthStatus`, which always reports healthy (backend/config/database.js:381-400), so the 503 `degraded` branch is effectively dead. Queue, cache and view failures do not change the status code. The materialized views entry is reported `healthy:true` whatever their state; a missing view ("View does not exist", backend/workers/materializedViewWorker.js:57) never appears here (view status via `getViewStatus`, materializedViewWorker.js:148). `getViewStatus` is in-memory only: it reads `lastRefreshTimes` and VIEW_CONFIGS and makes no DB call (materializedViewWorker.js:148-168). 200 `healthy` or 503 `degraded`. Includes version (`APP_VERSION` or '1.0.0') and NODE_ENV (:1163-1164).

### GET /api/health/ready (server.js:1180)
503 `{ready:false, reason}` if `app.locals.databasePrerequisites.ready` is false (initially false, :102). That value is set at startup after the dashboard prerequisite check (:14076-14092). Otherwise checks DB health: 200 `{ready:true}` or 503 (:1192-1198). Because `getHealthStatus` always returns healthy (backend/config/database.js:381-400), the DB 503 here is effectively dead; the only real gate is `databasePrerequisites.ready`, set once at startup. Consumer: productionBootstrap.js:69 polls this path.

### GET /api/health/live (server.js:1203)
200 `{alive:true, timestamp: Date.now()}`. Consumer: productionBootstrap.js:81 polls this path; the public port also answers 200 for `/api/health/live` (productionBootstrap.js:97).

### GET /api/queue/metrics (server.js:1208)
Query `queueName` (not validated), calls `queue.getMetrics(queueName)`. Returns `{timestamp, queueType: QUEUE_TYPE||'memory', metrics}`. On error, 500 with `error.message` in the body (:1220). `queueType` comes from the env var, not from the actual queue (the factory may fall back to memory, see PROC.md).
- Memory fallback (backend/queue/queueFactory.js:47-52): happens only if `require('./RedisQueue')` or the RedisQueue constructor throws, which is when REDIS_URL is unset (RedisQueue.js:22-23). An unreachable Redis does not trigger the fallback, so the metrics call may hang (inferred from RedisQueue.js:26-29, not tested).
- QUEUE_TYPE `aws`, `gcp` or an unknown value also yields MemoryQueue (queueFactory.js:64-87).
- After a fallback `queueType` still echoes the env value (server.js:1215).
- Metrics shape: MemoryQueue returns real counters (MemoryQueue.js:234-272); RedisQueue returns zeros (RedisQueue.js:180-213).

### GET /api/test-di (server.js:1228)
Debug endpoint (comment says "should be removed in production"). Returns method counts for transformationService and fileService. Not environment-gated.

### Rate limiting on health routes (server.js:643-653)
`generalLimiter` is `max: 500` per `windowMs: 15 * 60 * 1000` per IP, mounted at /api (:767). Its `skip` exempts only `/health/ready` and `/health/live` (:653). /api/health, /db, /enterprise, /python and /api/queue/metrics are limited. /health-check is outside /api and unlimited. The comment at :645 says 100 but the value is 500.

### Debug endpoints owned by ADM
`GET /api/debug/recover-orphans` (server.js:11754) and `GET /api/debug/hash-password/:password` (server.js:11798) are registered with no authentication middleware. The comment at :11797 says "REMOVE IN PRODUCTION". recover-orphans calls `fileWorker.recoverOrphanedJobs()` and returns `error.stack` in its 500 body (:11793). Details belong to ADM.md.

### Performance logging middleware (backend/integration.js:22; logger.js:103)
Called at server.js:13965, after all routes are registered, so it only covers requests that reach it later (express runs middleware in registration order; routes registered earlier never pass through it). Sets `req.requestId` and logs at debug level (logger.js:115) while LOG_LEVEL defaults to info, so by default only the slow-request warning is emitted; warns on duration > 1000 ms (logger.js:126). Skips static extensions. `setupEnhancedFeatures` also registers SIGTERM and SIGINT handlers that call `process.exit(0)` immediately without cleanup (integration.js:52-62). server.js:14268-14269 registers `gracefulShutdown` for the same signals, but the integration.js listener is registered earlier (server.js:13965) and exits first, so gracefulShutdown never runs.

### Loggers (backend/utils/logger.js)
- systemLogger and databaseLogger: level `LOG_LEVEL||'info'`, console and file. Files: logs/system.log and logs/database.log, 5 MB x 5 files (:47-51, :74-78).
- auditLogger: level fixed at 'info', logs/audit.log, 10 MB x 10 files (:84-99).
- Helpers `logUserAction`, `logSecurityEvent`, `logDatabaseOperation` (:144-170).
- server.js uses `diContainer.get('logger')` (server.js:114). The container registers `'logger'` as `systemLogger`, imported from ../utils/logger (backend/di/bootstrapper.js:8,:94), i.e. the winston systemLogger above.

### Node memory monitor (backend/utils/memoryMonitor.js) - DEAD
Defaults: MAX 85, WARNING 75, RECOVERY 70 percent, interval 5000 ms (:21-24). Breaker opens at >= 85 and closes at <= 70 (:80,:108). The middleware returns 503 with Retry-After 30 (:134). Alert cooldown 300000 ms (:18). Measures system-wide `os.freemem`, not process memory. No other file requires `memoryMonitor.js`; the grep found only its own definitions.

### Python memory guard (utils/memory_monitor.py)
MAX_MEMORY_PERCENT default 85 (:22). `check_before_processing` refuses if projected > threshold (:153). It has three refusal reasons: breaker open (:140), estimated need (file_size*2) above available memory (:146), projected percent above MAX (:153). Imported by utils/process_file.py:24,:28. `process_file` calls `check_before_processing(file_size_mb)` and, if it cannot proceed, returns an error result `"Cannot process file: {reason}"` with row_count 0 and column_count 0 (process_file.py:65-76). `MemoryGuard.__enter__` calls the same check and raises `MemoryError("Cannot proceed with operation: ...")` (memory_monitor.py:227-231). Other internals of memory_monitor.py were not read by me.

### Rust log service (rust-log-service/src/main.rs:63-72) - DEAD (not started by any entry point I traced; the inventory marks it possibly-dead)
Routes: GET /health, POST /api/logs, /api/logs/batch, /api/logs/query, /api/logs/search, GET /api/logs/tail, /api/segments, /api/segments/:id, /api/stats. No auth. CORS allow any origin, method and header (:74-79). /health returns `status:"healthy"`, version, uptime, buffer_count, segment_count (api.rs:25-40). Uptime comes from `START_TIME`, a lazily initialised `OnceLock` (api.rs:23) set by whichever of /health (:28) or /api/stats (`get_stats`, :207) is hit first, so it counts from that first call, not process start. Default log filter "log_service=info,tower_http=debug" (main.rs:39). Other handlers in api.rs: ingest has no auth, size or rate limit (api.rs:43-71); `query_logs` without both start_time and end_time reads only the first 10 segments (:81-95, `take(10)` at :90); `search_logs` returns ids and a count only (:146-161); `tail_logs` only sends a Ping every second and streams no logs (:163-185).

### logClient (backend/services/logClient.js) - DEAD
Defaults: url `LOG_SERVICE_URL||http://localhost:9000`, batch 100, flush 5000 ms, 3 retries (:13-17). The class is exported (:396) with a default-client factory (:390), but no importer was found.

## Data touched
Files: logs/system.log, database.log, audit.log. Reads: DB health (`getHealthStatus`), queue metrics, materializedViewWorker view status and DB stats, cache stats. Writes: none to the DB. Spawns python3. Env: LOG_LEVEL, APP_VERSION, QUEUE_TYPE, NODE_ENV, MAX_MEMORY_PERCENT, WARNING_MEMORY_PERCENT, CIRCUIT_BREAKER_RECOVERY_PERCENT, MEMORY_CHECK_INTERVAL, LOG_SERVICE_URL.

## Flags
- DUPLICATE: GET /api/health defined twice (server.js:1033 vs healthCheckRoutes.js:31); the second is unreachable. Two memory monitors, Node (memoryMonitor.js) and Python (memory_monitor.py), with the same env names and defaults. Two upload-queue notions: `getQueue()` (server.js:38) vs `getUploadQueue()` (healthCheckRoutes.js:15).
- DEAD: healthCheckRoutes GET / (shadowed); memoryMonitor.js (not required by any file); logClient.js; the Rust service (unless deployed separately); `startMonitoring` interval. Effectively dead: the 503 branches of /api/health/db, /ready and /enterprise (see BUG). Also dead: server.js `gracefulShutdown` on SIGTERM/SIGINT (pre-empted by integration.js:52-62).
- BUG: `/api/health/enterprise` reports queue/cache/view failures yet returns healthy 200; cache check is always `healthy:true` (:1098). `queueType` is derived from env, not from the real queue. Performance middleware is registered after all routes (server.js:13965), so most requests are never logged. The health-check router reports the Redis upload queue while the app's main queue is a separate `getQueue()`. SIGTERM/SIGINT exit immediately with no cleanup (integration.js:52-62), and the real `gracefulShutdown` (server.js:14268-14269) never runs. `getHealthStatus` never queries the DB and always returns healthy (backend/config/database.js:381-400), so /api/health/db, /ready and /enterprise cannot report a real DB outage. /enterprise reports materialized views healthy:true regardless of state (a missing view is invisible there). The generalLimiter comment says 100 but the value is 500 (server.js:645).
- SECURITY: all health/metrics/debug endpoints are unauthenticated. /api/health/db, /enterprise and /python expose DB pool stats, versions, environment, stderr and error messages. /api/test-di is not production-gated. /api/queue/metrics returns raw error messages. Rust service CORS is open to any origin and it has no auth. The python spawn has no timeout, so repeated calls can pile up processes. /api/debug/recover-orphans and /api/debug/hash-password/:password (server.js:11754,:11798) have no auth middleware, and recover-orphans returns `error.stack` in its 500 body (:11793); see ADM.
- UNCLEAR: whether the Rust service is deployed.

## Domain terms
Health check / liveness (live) / readiness (ready) / enterprise health; circuit breaker; degraded mode; materialized view; upload queue vs file-processing queue; systemLogger / auditLogger / databaseLogger; log segment.

## Open questions
1. (Resolved: the DI logger is systemLogger, backend/di/bootstrapper.js:94.)
2. Is the Rust log service deployed anywhere? No Dockerfile, yml or .replit references it (per verifier search) and no start command was found; external deployment is unknown.
3. (Answered: productionBootstrap.js:69 polls /api/health/ready and :81 polls /api/health/live.)
4. Should `getQueue()` (server.js:38) metrics and `getUploadQueue()` health be the same queue? Not traced.
5. (Answered: `getViewStatus` is in-memory only, materializedViewWorker.js:148-168.)
6. (Answered: see the /api/queue/metrics fallback notes.) The PROC.md reference was not verified here.
7. Rust: the segments and stats handlers beyond the notes above remain only partly described.
