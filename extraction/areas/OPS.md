# OPS - Observability & health

## Summary
Health/readiness/liveness HTTP probes (all unauthenticated), a queue metrics endpoint, a debug DI endpoint, winston loggers, a performance-logging middleware, a Node memory circuit breaker (never wired), and a Rust log service plus Node client (never used). Python memory guard is used by process_file.py (utils/process_file.py:24).

## Entry points
All routes below have no authentication (server.js:1027-1252; backend/routes/healthCheckRoutes.js:31,55).

### GET /health-check (server.js:1027)
Static `{status:'ok', timestamp}`, 200. No DB.

### GET /api/health (server.js:1033)
Static `{status:'ok', timestamp}`. Registered before the router mounted at :1039, so it shadows router GET / (healthCheckRoutes.js:31), which is therefore unreachable.

### GET /api/health/ (healthCheckRoutes.js:31) - DEAD (shadowed)
Calls `getUploadQueue().getJobCounts()` (:13-16). Returns always 200 with `status` healthy/degraded, `degradedMode`, and message "Upload queue unavailable - uploads processing synchronously without retry/durability" plus "Start Redis server..." (:44-47).

### GET /api/health/python (healthCheckRoutes.js:55)
Spawns `python3 -c` with a fixed script (:85) checking openpyxl, pandas, pyarrow, ijson, defusedxml. 200 if all installed; 503 `degraded` if not; 500 on throw. Spawn failure or non-zero exit resolve as `allInstalled:false` (:142,:162), so they return 503. Exposes stderr and python version. No timeout on the spawn.

### GET /api/health/db (server.js:1042)
`database.getHealthStatus()`; 200 `healthy`, 503 `unhealthy` when `healthy` is false or on throw (:1047-1062). Returns the full health object.

### GET /api/health/enterprise (server.js:1069)
Checks: database (:1075), cache (:1093; always healthy=true, falls back to `{type:'memory'}` if no getStats), queue `getMetrics('file-processing')` (:1111), materialized views (:1124), optional `?detailed=true` DB stats (:1134), memory in MB (:1144), uptime (:1154). Only the database check sets `overallHealthy=false` (:1086, :1089). Queue, cache and view failures do not change the status code. 200 `healthy` or 503 `degraded`. Includes version (`APP_VERSION` or '1.0.0') and NODE_ENV (:1163-1164).

### GET /api/health/ready (server.js:1180)
503 `{ready:false, reason}` if `app.locals.databasePrerequisites.ready` is false (initially false, :102). That value is set at startup after the dashboard prerequisite check (:14076-14092). Otherwise checks DB health: 200 `{ready:true}` or 503 (:1192-1198).

### GET /api/health/live (server.js:1203)
200 `{alive:true, timestamp: Date.now()}`.

### GET /api/queue/metrics (server.js:1208)
Query `queueName` (not validated), calls `queue.getMetrics(queueName)`. Returns `{timestamp, queueType: QUEUE_TYPE||'memory', metrics}`. On error, 500 with `error.message` in the body (:1220). `queueType` comes from the env var, not from the actual queue (the factory may fall back to memory, see PROC.md).

### GET /api/test-di (server.js:1228)
Debug endpoint (comment says "should be removed in production"). Returns method counts for transformationService and fileService. Not environment-gated.

### Performance logging middleware (backend/integration.js:22; logger.js:103)
Called at server.js:13965, after all routes are registered, so it only covers requests that reach it later (express runs middleware in registration order; routes registered earlier never pass through it). Sets `req.requestId` and logs at debug level; warns on duration > 1000 ms (logger.js:126). Skips static extensions. `setupEnhancedFeatures` also registers SIGTERM and SIGINT handlers that call `process.exit(0)` immediately without cleanup (integration.js:52-62).

### Loggers (backend/utils/logger.js)
- systemLogger and databaseLogger: level `LOG_LEVEL||'info'`, console and file. Files: logs/system.log and logs/database.log, 5 MB x 5 files (:47-51, :74-78).
- auditLogger: level fixed at 'info', logs/audit.log, 10 MB x 10 files (:84-99).
- Helpers `logUserAction`, `logSecurityEvent`, `logDatabaseOperation` (:144-170).
- server.js uses `diContainer.get('logger')` (server.js:114), so the logger source is the DI container. Not traced.

### Node memory monitor (backend/utils/memoryMonitor.js) - DEAD
Defaults: MAX 85, WARNING 75, RECOVERY 70 percent, interval 5000 ms (:21-24). Breaker opens at >= 85 and closes at <= 70 (:80,:108). The middleware returns 503 with Retry-After 30 (:134). Alert cooldown 300000 ms (:18). Measures system-wide `os.freemem`, not process memory. No other file requires `memoryMonitor.js`; the grep found only its own definitions.

### Python memory guard (utils/memory_monitor.py)
MAX_MEMORY_PERCENT default 85 (:22). `check_before_processing` refuses if projected > threshold (:153). Imported by utils/process_file.py:24,:28. Not traced beyond this.

### Rust log service (rust-log-service/src/main.rs:63-72) - DEAD (not started by any entry point I traced; the inventory marks it possibly-dead)
Routes: GET /health, POST /api/logs, /api/logs/batch, /api/logs/query, /api/logs/search, GET /api/logs/tail, /api/segments, /api/segments/:id, /api/stats. No auth. CORS allow any origin, method and header (:74-79). /health returns `status:"healthy"`, version, uptime, buffer_count, segment_count (api.rs:25-40). Default log filter "log_service=info,tower_http=debug" (main.rs:38).

### logClient (backend/services/logClient.js) - DEAD
Defaults: url `LOG_SERVICE_URL||http://localhost:9000`, batch 100, flush 5000 ms, 3 retries (:13-17). The class is exported (:396) with a default-client factory (:390), but no importer was found.

## Data touched
Files: logs/system.log, database.log, audit.log. Reads: DB health (`getHealthStatus`), queue metrics, materializedViewWorker view status and DB stats, cache stats. Writes: none to the DB. Spawns python3. Env: LOG_LEVEL, APP_VERSION, QUEUE_TYPE, NODE_ENV, MAX_MEMORY_PERCENT, WARNING_MEMORY_PERCENT, CIRCUIT_BREAKER_RECOVERY_PERCENT, MEMORY_CHECK_INTERVAL, LOG_SERVICE_URL.

## Flags
- DUPLICATE: GET /api/health defined twice (server.js:1033 vs healthCheckRoutes.js:31); the second is unreachable. Two memory monitors, Node (memoryMonitor.js) and Python (memory_monitor.py), with the same env names and defaults. Two upload-queue notions: `getQueue()` (server.js:38) vs `getUploadQueue()` (healthCheckRoutes.js:15).
- DEAD: healthCheckRoutes GET / (shadowed); memoryMonitor.js (not required by any file); logClient.js; the Rust service (unless deployed separately); `startMonitoring` interval.
- BUG: `/api/health/enterprise` reports queue/cache/view failures yet returns healthy 200; cache check is always `healthy:true` (:1098). `queueType` is derived from env, not from the real queue. Performance middleware is registered after all routes (server.js:13965), so most requests are never logged. The health-check router reports the Redis upload queue while the app's main queue is a separate `getQueue()`. SIGTERM/SIGINT exit immediately with no cleanup (integration.js:52-62).
- SECURITY: all health/metrics/debug endpoints are unauthenticated. /api/health/db, /enterprise and /python expose DB pool stats, versions, environment, stderr and error messages. /api/test-di is not production-gated. /api/queue/metrics returns raw error messages. Rust service CORS is open to any origin and it has no auth. The python spawn has no timeout, so repeated calls can pile up processes.
- UNCLEAR: whether the Rust service is deployed. Whether the DI logger is the winston logger.

## Domain terms
Health check / liveness (live) / readiness (ready) / enterprise health; circuit breaker; degraded mode; materialized view; upload queue vs file-processing queue; systemLogger / auditLogger / databaseLogger; log segment.

## Open questions
1. What does `diContainer.get('logger')` return, and does it use logger.js?
2. Is the Rust log service deployed anywhere (Dockerfile, workflow files)?
3. Does anything call `/api/health/*` (deploy config, load balancer)? Not traced.
4. Should `getQueue()` (server.js:38) metrics and `getUploadQueue()` health be the same queue? Not traced.
5. What do `database.getHealthStatus` and `materializedViewWorker.getViewStatus` compute? Not traced.
