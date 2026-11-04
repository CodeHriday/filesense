# DASH - Dashboards, insights & badges

## Summary
Read-only dashboard KPIs and trends (`backend/routes/dashboard.js`, mounted `app.use('/api/dashboard', authenticateToken, dashboardRoutes)` at server.js:5301), file-pattern insights (`backend/routes/fileInsights.js`, mounted server.js:5310 with `authenticateToken`), two unauthenticated stub endpoints in server.js (badges, dashboard settings), and two background workers. Admin-ness is `userHasAdminAccess` (permissionHelpers.js:80): admin role OR any of `users:write`, `roles:write`, `project_management:write`. Non-admins are scoped by project membership (`get_user_projects($n)`, rewritten in app code to a UNION of `project_members` and `access_group_members`+`project_access_groups`, dashboard.js:25-52). Files whose `file_audit_details.file_role = 'target'` are excluded in most file metrics.

Schema source for all DB claims below: the prod dump `attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql` (cited as "prod dump :line"). Server.js lines are the root `/server.js`.

Common to all `/api/dashboard/*`: router-level 503 `{error:'Dashboard is initializing...', retryable:true}` unless `app.locals.databasePrerequisites.ready` (dashboard.js:65-76); per-handler 401 if no `req.user.id`; response cache TTL 120 s keyed by user, roles, path, days, project_id, metric, granularity (dashboard.js:6-19), cached only on status 200; 500 responses include `details: error.message` (e.g. dashboard.js:230-233).

Response cache stack: the middleware (`createCacheMiddleware`, backend/src/middleware/cache.js:22) reads `cache` from config/redis first (cache.js:33) then an in-process NodeCache `memoryCache` (cache.js:8-12, 36); on a miss it writes to both with the TTL (cache.js:49-53); it sets header `X-Cache: HIT|MISS` (cache.js:40, 44). A cache hit returns before the handler runs, so the handler's 401 check is skipped on hits (cache.js:39-42). The key generator calls `req.user?.roles?.sort()` (dashboard.js:10), which sorts the user's roles array in place. The actual keys have the form `dashboard:<req.path>:user:...` where `req.path` includes the leading slash (dashboard.js:11, 16), e.g. `dashboard:/executive-metrics:user:...`. `invalidateDashboardCache` (cache.js:108-111) uses patterns `dashboard:metrics:user:<id>:*` / `dashboard:metrics:*`, which cannot match those keys; a grep of all *.js finds no caller (only its definition cache.js:108 and export cache.js:160). So dashboard data is stale for up to 120 s after any write.

## Entry points

### 1. GET /api/dashboard/metrics (dashboard.js:82)
- Auth: JWT. Admin sees global counts; others scoped to accessible projects.
- Input: none. Output `{success, metrics:{projects, files, schedules, jobs, anomalies}}` (217-226).
- Rules: schedules counted only `is_active = true` (149); anomalies only `status = 'active'` (199, 208); jobs = all `transformation_jobs` (not just failed, comment 166).
- Errors: 401, 500, 503.
- Consumer: none in the frontend (grep of src finds no `/api/dashboard/metrics` call; useDashboard.js has none).

### 2. GET /api/dashboard/executive-metrics (dashboard.js:243)
- Auth: JWT. Query: `days` (default 30 via `parseInt(days)||30`, no upper bound, 256), `project_id` (optional int, 254).
- Windows: current = last `days`; comparison = the `days` before that (257-261); sparklines = last 7 days (262).
- Four branches: admin/no project (305), admin/project (472), non-admin/no project (594), non-admin/project (726).
- Rules (literal):
  - Health index = ROUND(AVG(COALESCE(quality_score,0)),1) over files created in range with non-null quality_score, excluding target files; null if no sample (313). Delta = current - previous, else 0 (859).
  - Health status: >=90 excellent, >=75 good, >=60 warning, else critical; null -> 'unknown' (874).
  - Throughput delta % = (cur-prev)/prev*100, 0 if prev=0 (860).
  - Job success rate = completed/total*100, 100 if no jobs (861); status >=95 excellent, >=80 good, >=60 warning, else critical (900).
  - Critical alerts = distinct `alert_events` with status IN ('OPEN','ACTIVE','TRIGGERED') (353); status 0 excellent, <=3 warning, else critical (904).
  - High-risk PII = files with `contains_pii = true` AND `data_classification IN ('Confidential','PHI','PII')` AND (`quality_score < 90` OR a violation with severity 'high'/'critical') (361-362); 0 excellent, <=5 warning, else critical (908).
  - Vendor compliance = vendors with an active agreement whose project received any non-target file in range / vendors with active agreements; 100 if none; capped at 100 (862); >=90 excellent, >=70 good, >=50 warning, else critical (914). Not tied to SLA or any real compliance check.
  - Governance coverage = files with at least one `column_governance_tag_assignments` row / files in range; 0 if none (863); >=80 excellent, >=60 good, >=40 warning, else critical (920).
  - API usage: active tokens (`is_active`, not revoked, not expired, 396) and count of files with `metadata->>'upload_method'='api'`; avg per token rounded (925). Tokens are counted globally in every branch (`FROM api_tokens at` with no user/project filter, 393-396, 561-564, 691-694, 823-826). Only the admin+project branch filters the API files by project (562: `f.project_id = $2`); the admin/no-project, non-admin and non-admin+project branches count API-uploaded files across all projects (394, 692, 824).
  - SLA breaches (admin/no-project branch only, 426-470): agreement `sla_enabled` and `active` (437); expected interval daily 1d, weekly 7d, monthly 30d, quarterly 90d, else 1d (429-435); 'late' if last source upload < NOW() - interval - `alert_threshold_minutes`; 'missing' if no upload; filename match via `LIKE REPLACE(file_name,'*','%')` (460). `slaBreaches`, `missingFiles`, `lateFiles` are initialised to 0 (274) and assigned only at 468 (grep of `slaBreaches =` finds only that assignment); the other three branches never query SLA, so the response there is always `slaBreaches {count:0, status:'excellent'}` (927-931) and `platformOverview.slaBreaches` 0 (947).
  - Platform overview counts (276-291) are global, not scoped, for all callers, except `platformOverview.vendors`, which is `totalVendors` (940), the scoped distinct-vendor count from active agreements (377, 545, 674, 806). The `vendors_count` column queried at 284 is not read into any variable. `internalConnections` hard-coded `SELECT 0` (290).
  - Non-admin with a `project_id` they cannot access: the non-admin/project branch (726-857) returns 200 with zeros/empty values, not 403.
- Output: `{success, timeRange, metrics:{totalFiles, dataHealth, dataHealthIndex, fileThroughput, throughputTrend, jobSuccessRate, criticalAlerts, highRiskPII, vendorCompliance, governanceCoverage, apiUsage, slaBreaches, platformOverview}}` (865-949). Several keys duplicate each other (dataHealth/dataHealthIndex, fileThroughput/throughputTrend).
- Consumer: src/hooks/useDashboard.js:15.

### 3. GET /api/dashboard/project-health-scores (dashboard.js:966)
- Auth: JWT; admin all projects, others accessible. Per project: avg `quality_score` over non-target files, `excellent_files` (>=90), `poor_files` (<70), status >=90 excellent, >=75 good, >=60 fair, else poor (1005-1010); projects with 0 files omitted (1012); ordered by score desc, name. Output `{projects, totalProjects}`; score 1 decimal.

### 4. GET /api/dashboard/file-type-distribution (dashboard.js:1086)
- Query `project_id`. Group by `file_type` (null -> 'unknown', 1175), count, SUM(file_size), AVG quality; percentage 1 decimal. Output `{fileTypes, totalFiles, projectId}`. Non-target files only.

### 5. GET /api/dashboard/job-trend (dashboard.js:1201)
- Query `days` (default 30 when absent; `parseInt(days,10)` then `Math.min(Math.max(days,1),365)`, 1215-1216), `project_id`. A non-numeric `days` (e.g. `abc`) gives NaN, which `Math.min/Math.max` leave as NaN, so the query errors and the route returns 500 (inferred, not run); the 1..365 clamp applies only to numeric input. Per `DATE(start_time)`: passed (status 'completed'), failed (status 'failed'). Output `{jobTrend:[{date,passed,failed}], projectId}`.

### 6. GET /api/dashboard/schema-drift-trend (dashboard.js:1307)
- Same params/clamp (1321-1322, same NaN to 500 behaviour). Counts `anomalies` with `anomaly_type='schema_drift'` per `DATE(detected_at)`. Output `{driftTrend:[{date,count}], projectId}`.

### 7. GET /api/dashboard/quality-violations-trend (dashboard.js:1415)
- Same params/clamp (1429-1430, same NaN to 500 behaviour). Counts `quality_rule_violations` per day and `quality_rules.rule_type` restricted to completeness, uniqueness, validity, consistency, accuracy (1446). Output `{violationsTrend:[{date,dimension,count}], projectId}`. Target files are not excluded.

### 8. GET /api/dashboard/metric-trends (dashboard.js:1534)
- Query `metric` (default 'all'; totalFiles, dataHealth, jobSuccess, criticalAlerts, governanceCoverage, vendorCompliance), `granularity` (default 'daily'; weekly, monthly), `project_id`.
- Windows: daily 15 days, weekly 16 weeks, monthly 16 months, weekly/monthly `LIMIT 16` (e.g. 1592-1595).
- dataHealth = ROUND(AVG(completeness_score + validity_score)/2,1) from `profiling_metrics` (1651), different source from executive health.
- jobSuccess value = round(completed/total*100), 0 for a bucket with no jobs (1783; executive-metrics returns 100 when there are no jobs, 861), criticalAlerts = anomalies with severity IN ('critical','high') (1800), governanceCoverage value = count of tagged files (1921, not a percent), vendorCompliance = round(active/total agreements created per bucket*100), 100 if none (1966); vendor trend ignores user/project scoping (1925-1963).
- `totalFiles` here does not exclude target files (1558-1633), unlike executive-metrics and project-health-scores. An unknown `metric` value returns 200 with `trends: {}`.
- Output `{success, trends, granularity, metricType, projectId}`. Consumers: useDashboard.js:71, MetricTrendPopup.jsx:49.

### 9. GET /api/insights/file-patterns (fileInsights.js:22)
- Auth: JWT only (any user; the permission `insights:read` exists at server.js:10340 but is not checked here). `limit` default 100, `offset` default 0 (no max). Cache `insights:patterns:{limit}:{offset}` 5 min (CACHE_TTL = 5*60, line 16). Service groups `file_pattern_metrics` by pattern with days_tracked, last date, total files, avg quality, has_alerts, total alerts; order by has_alerts desc, last date desc (fileInsightsService.js:344-361). Output `{success, patterns, pagination}`.
- Cache here is `services/cacheService` (`insights:*` keys), a different cache from the dashboard one. Neither the aggregation worker, `POST /aggregate` nor `POST /cleanup` invalidates it (no invalidate call found in fileInsights.js / the service), so results can be up to 5 min stale after aggregation.
- Consumer: none in the frontend (grep of src finds no `/api/insights` call).

### 10. GET /api/insights/file-patterns/:pattern/metrics (fileInsights.js:66)
- JWT only. `granularity` daily|weekly|monthly else 400 (73-78). `range` default 30; string forms `^(\d+)([dwmy])$`: d=1, w=7, m=30, y=365 days (80-95); capped 548 days (98). Reads `file_pattern_metrics`, `_weekly`, `_monthly` (service 366-402). Cache key includes pattern/granularity/range (100). Output `{success, pattern, granularity, range_days, metrics}`.
- `:pattern` is a single path segment already decoded by Express, and the handler calls `decodeURIComponent` again (fileInsights.js:68, 140); a pattern containing `%` throws and returns 500. Patterns containing `/` cannot be addressed as a single segment.

### 11. GET /api/insights/file-patterns/:pattern/alerts (fileInsights.js:138)
- JWT only. `limit` default 50. Selects `anomalies WHERE file_name ~ <pattern with * -> .*>` (service 407-429). Not cached; no project scoping; no status filter. The regex is unanchored (substring match), so `orders*.csv` also matches `xorders_2.csv.bak`.

### 12. POST /api/insights/aggregate (fileInsights.js:168)
- JWT + `userHasAdminAccess` else 403 (171-176). Body `date` optional (default now; `new Date(req.body.date)` unvalidated; an invalid date throws RangeError at `toISOString()` and returns 500). Runs `aggregateDailyMetrics`; output `{success,date,patterns_processed,files_processed}`.

### 13. POST /api/insights/cleanup (fileInsights.js:196)
- JWT + admin else 403. Deletes rows with `retention_until < NOW()` from `file_pattern_metrics`, `profiling_metrics` (non-null), `file_columns` (non-null) in one transaction (service 434-481). Output counts.
- Retention defaults in prod: `file_pattern_metrics.retention_until` defaults to `now() + '1 year 6 mons'` (prod dump :3232, i.e. 18 months). `profiling_metrics.retention_until` (prod dump :3520) and `file_columns.retention_until` (prod dump :4723) have the same default `now() + '1 year 6 mons'`. So in prod the cleanup deletes rows of all three tables once they are 18 months old, not only rows with an explicitly set value. The worker triggers it on days 7, 14, 21 and 28 of each month (insightsAggregationWorker.js:115). The other `retention_until timestamp NULL` columns at prod dump :2806, :3849 and :4675 belong to `audit_log_archive`, `audit_log` and `file_audit_details`, which this cleanup does not touch.

### 14. GET /api/insights/stats (fileInsights.js:222)
- JWT only. Global aggregate over `file_pattern_metrics` (patterns, rows, files tracked, alerts, min/max date). Not cached.

### 15. GET /api/badges (server.js:5100)
- Auth: none (no `authenticateToken`; not under any router-level auth). Runs `CREATE TABLE IF NOT EXISTS user_badges (id, badge_id, badge_name, badge_description, icon_url, earned_at)` on every call (server.js:5104-5111), then `SELECT * FROM user_badges` for everyone, no user filter (5114). 500 `{error:'Failed to fetch badges'}`.
- In prod the table already exists with a different shape, so the lazy CREATE is a no-op: `user_badges(id serial, badge_id varchar(50) NOT NULL, score numeric, file_id varchar(50), earned_date timestamp NOT NULL, created_at timestamp DEFAULT now() NOT NULL)` with `UNIQUE (badge_id)` and PK `id` (prod dump :6502-6511) and an FK `file_id -> files(file_id)` (prod dump :7822). The response rows therefore have the prod columns (badge_id, score, file_id, earned_date, created_at), not badge_name/badge_description/icon_url/earned_at. `badge_id` UNIQUE means one row per badge id across all users. The lazy-CREATE shape applies only to a fresh database that lacks the table.
- Writers: no `INSERT INTO user_badges` exists in any js file (grep of `user_badges` finds only reads/deletes: server.js:5114, 2097, 2217, 3344 and adminCleanupRoutes.js:161, 241, 495), so nothing awards badges server-side. Deleters: `DELETE FROM user_badges WHERE file_id = $1` on file delete/replace (server.js:2097, 2217, 3344), which works against the prod shape; adminCleanupRoutes.js:241 (`WHERE file_id IN (SELECT file_id FROM files)`) and 495 (delete all), and SystemCleanup.jsx:69 (UI trigger).
- Frontend (src/api/badgeService.js:149-190) also calls POST /api/badges/check, POST /api/badges, DELETE /api/badges/:id. No such server routes exist (grep of `/api/badges` in js/jsx finds only badgeService.js:151,162,173,184 and server.js:5100), so those calls would 404. Badge awarding rules exist only client-side as BADGE_DEFINITIONS (badgeService.js:4-141): quality >70/80/90/95, completeness >75/85/95, consistency >70/85/95, freshness 7/3/1 days, improvement 5/10/20 %, excellence 95.

### 16. GET /api/user/dashboard-settings (server.js:6283)
- Auth: none. Creates `user_dashboard_settings` if missing; always reads `WHERE user_id = 'default'` (not the caller). Default when no row: `{layout:'grid', widgets:[recent-files, data-quality, data-volume, alerts], theme:'light'}` (6300-6309). Else returns stored `settings` JSON. The prod table matches the code (prod dump :3783-3790).
- Frontend POST /api/user/dashboard-settings (DashboardSettings.jsx:91,116) has no server route (no POST route in server.js or backend/); frontend falls back to localStorage `dfo-dashboard-layout` / `dfo-dashboard-theme` (99-101, 121). The POST call would 404. user_dashboard_settings is also deleted by the admin cleanup (adminCleanupRoutes.js:161, 495).

### 17. Worker: InsightsAggregationWorker (backend/workers/insightsAggregationWorker.js; started server.js:71-75)
- Checks every hour (`setInterval` 60*60*1000, 26-28) and once at startup (31). Runs only if local hour == the hour of `scheduleTime` (02), `getMinutes() >= targetMinute` and the last `MAX(metric_date)` in `file_pattern_metrics` != today (UTC date string) (56-66). Aggregates yesterday (102-106). If day-of-month % 7 == 0 runs cleanup (115). Errors logged, swallowed.
- Aggregation (service 50-194): files whose `DATE(COALESCE(pm.profiled_at, f.created_at)) = date`; pattern from filename regex replacements (17-32); one upsert per pattern on `(file_pattern, metric_date)`. Metrics: record_count sum of `row_count`; duplicate_percentage mean of per-file `duplicate_records_percentage` (service :233); column stats from the FIRST file only (235-254); ID-like columns (name ends in id/key/code/number/num, or unique/rows > 0.9) skipped (40-41, 266); completeness = 100 - avg null% where null% per column = first file's `file_columns.null_count` / `metrics.record_count` (the record count summed over ALL files of the pattern that day) (305-308); consistency = completeness (copy, comment "simplified", 311); validity = 100 - `duplicate_count / record_count * 100` (314-315), not the mean duplicate percentage; overall = mean of the three (308-322). All quality scores stay 0 when `record_count` is 0 or the first file has no `file_columns` rows (guard `totalColumns > 0 && metrics.record_count > 0`, service :302), but the pattern is still upserted with those 0 scores; alert_count = open anomalies matching pattern regex detected that date (327-336).
- A filename-derived regex that is invalid (e.g. unbalanced `[` or `(`) makes the `anomalies WHERE file_name ~ $1` query throw; the catch does ROLLBACK (service 188), so the whole day's transaction is rolled back and no pattern for that day is stored; the worker only logs it.
- Prod trigger: `trigger_refresh_file_pattern_metrics_views` AFTER INSERT OR UPDATE on `file_pattern_metrics` FOR EACH STATEMENT executes `refresh_file_pattern_metrics_views()` (prod dump :3246-3251); the function body (prod dump :8145-8154) runs `REFRESH MATERIALIZED VIEW CONCURRENTLY` on `file_pattern_metrics_weekly` then `_monthly`. Since the aggregation issues one upsert statement per pattern, the views refresh on every upsert.
- Root scripts: `backfill_metrics.js` selects `DISTINCT DATE(created_at)` of files (backfill_metrics.js:14) and calls `service.aggregateDailyMetrics(date)` for each (:29); `test_aggregation.js` calls `aggregateDailyMetrics(new Date('2025-10-20'))` once (test_aggregation.js:13). Manual scripts, not wired to any route or worker.

### 18. Worker: materializedViewWorker (backend/workers/materializedViewWorker.js; started server.js:14178 with 60 s check)
- Refresh intervals: `mv_dashboard_summary` 5 min, `mv_job_trends_hourly` 15 min, `mv_file_processing_summary` 30 min (14-30). All refreshed at startup (187); `REFRESH ... CONCURRENTLY`, falls back to non-concurrent if error contains 'cannot refresh' (85). Status/db stats exposed at server.js:1124,1136 (not traced further). Views created in backend/migrations/enterprisePerformanceOptimizations.js:277-372.
- In prod the dump defines `mv_file_processing_summary` (prod dump :8046) and `mv_job_trends_hourly` (:8066) but no `mv_dashboard_summary` (grep of the dump finds no such name). For a missing view the worker returns an error `'View does not exist'` (materializedViewWorker.js:57) and only sets `lastRefreshTimes[viewName]` on success (:70), so the missing view is retried on every 60 s tick (interval at :196; due check :113). No dashboard or insights route reads any of these views; only the status report at server.js:1124 touches them. One consumer outside DASH reads `mv_dashboard_summary`: GET /api/jobs/stats/summary (backend/routes/jobs.js:28-40) checks `pg_matviews` for it and uses it if present, otherwise falls back to live queries; since the view is absent in prod, it always takes the fallback (see JOB).

### Frontend routes
`/` DashboardOrRedirect, `/executive-dashboard`, `/badges`, `/dashboard-settings` (inventory App.jsx:340,341,398,400). ExecutiveDashboard.jsx has no direct API calls; data via src/hooks/useDashboard.js. Badges.jsx imports badgeService only. No frontend code calls `/api/insights/*` or `/api/dashboard/metrics`.

## Data touched
Reads: projects, files, file_audit_details, schedules, transformation_jobs, transformation_mappings, anomalies, alert_events, alert_runs, alert_policies, quality_rule_violations, quality_rules, vendors, vendor_agreements, users, roles, governance_tags, governance_policies, transformation_lineage, storage_connections, column_governance_tag_assignments, api_tokens, profiling_metrics, file_columns, project_members, access_group_members, project_access_groups, user_badges, user_dashboard_settings.
Writes: file_pattern_metrics (upsert/delete), profiling_metrics and file_columns (retention deletes), user_dashboard_settings (created lazily by GET), user_badges (CREATE IF NOT EXISTS is a no-op in prod; no inserts anywhere; deletes by file delete/replace and by admin cleanup), materialized views (refresh by worker and by the file_pattern_metrics trigger). Views read: file_pattern_metrics_weekly/_monthly.

## Flags
- SECURITY: GET /api/badges has no auth and returns all users' badges (server.js:5100-5120).
- SECURITY: GET /api/user/dashboard-settings has no auth and is not user-scoped (hard-coded `'default'`, server.js:6296).
- SECURITY: /api/insights/* only require a valid JWT; no project scoping, so any user reads pattern names, metrics and alert details (anomaly file names, descriptions) across all projects (fileInsights.js:22,66,138,222). `insights:read` exists (server.js:10340) but is not checked.
- SECURITY: `platformOverview` counts other than `vendors` (users, roles, connections, tags, policies) are unscoped and returned to non-admins (dashboard.js:276-291). Also metric-trends vendorCompliance unscoped (1925-1963).
- SECURITY: dashboard 500 responses leak `error.message` (e.g. dashboard.js:954-957).
- SECURITY: `rangeInDays` interpolated into SQL (`INTERVAL '${rangeInDays} days'`, fileInsightsService.js:374,383,392); the value is numeric from parseInt/regex but a non-numeric `range` yields NaN -> `parseInt(...)||30` guards the default; low risk, noted.
- SECURITY: API usage in executive-metrics counts all active API tokens and, in three of four branches, API-uploaded files across all projects, regardless of the caller's project scope (dashboard.js:393-396, 691-694, 823-826).
- BUG: `slaBreaches` is computed only in the admin/no-project branch (dashboard.js:426-470, assigned at 468); the admin+project, non-admin and non-admin+project branches never set it, so they always report 0 / 'excellent' (dashboard.js:274, 927-931).
- BUG: executive `days` has no clamp (256) unlike trend endpoints (1..365); a negative value (e.g. -5) is truthy (`parseInt('-5')||30` stays -5) and accepted, producing a future window.
- BUG: trend endpoints' clamp `Math.min(Math.max(days,1),365)` (1216, 1322, 1430) does not protect non-numeric input: `days=abc` -> NaN -> query error -> 500 (inferred, not run).
- BUG: a non-admin requesting a `project_id` they cannot access gets 200 with zeros/empty arrays rather than 403 (executive-metrics 726-857; trend endpoints return empty results).
- BUG: weekly/monthly metric-trends order ASC with `LIMIT 16` over a 16-week window that can span 17 buckets, dropping the newest bucket (e.g. 1592-1595).
- BUG: invalid `granularity` (not daily/weekly/monthly) leaves the query variable undefined, pool.query errors, returns 500 (1556-1633).
- BUG: anomaly status vocabulary mismatch. `anomalies.status` defaults to 'open' (prod dump :2598); anomalyService.js writes 'open' (anomalyService.js:63, 118, 287); jobExecutionEngine.js:1617 writes 'active'. `/api/dashboard/metrics` counts only `status = 'active'` (dashboard.js:199, 208), while the insights aggregation `alert_count` counts only `status = 'open'` (fileInsightsService.js:331). Each misses the other's anomalies.
- BUG: dashboard cache invalidation is dead and wrong: `invalidateDashboardCache` (cache.js:108-111) uses `dashboard:metrics:...` patterns while real keys are `dashboard:/metrics:...` / `dashboard:/executive-metrics:...` (dashboard.js:16), and it has no caller. The insights cache (`insights:*`) is never invalidated by aggregation or cleanup.
- BUG: dashboard-settings response `layout` default is the string `'grid'`, while DashboardSettings.jsx:31 requires an array and otherwise sets an empty layout; widget list is ignored by the page. POST route missing.
- BUG: consistency_score copies completeness_score (fileInsightsService.js:311); string `avg_length` is (min+max)/2 of lengths of min/max values (293); column stats taken from first file only (235).
- BUG: completeness divides the first file's `null_count` by the record count of all files in the pattern (fileInsightsService.js:305), so it is inflated whenever a pattern has more than one file that day.
- BUG: pattern quality scores stay 0 when `record_count` is 0 or the first file has no `file_columns` rows (fileInsightsService.js:302), yet the pattern is still upserted, so a 0 score is stored as if measured.
- BUG: empty-bucket job success is inconsistent: metric-trends `jobSuccess` returns 0 for a bucket with no jobs (dashboard.js:1783), while executive-metrics returns 100 when there are no jobs (dashboard.js:861).
- BUG: worker run gate: `now.getHours()` local time but `today` from UTC ISO (insightsAggregationWorker.js:56-63); it aggregates yesterday but marks "ran today" via MAX(metric_date), which equals yesterday's date, so `lastRun !== today` is always true until a row with today's date exists. The interval is a fixed 60 min (26-28), so at most one scheduled tick falls in hour 02 per day; a second run in hour 02 happens only if the process is restarted during 02:xx (startup check at 31). UNCLEAR whether intended; re-run is idempotent via upsert.
- BUG: `isIdField` divides by `rowCount`; if `row_count` is 0/null result is NaN/Infinity (service 41).
- BUG: `pattern.replace(/\*/g,'.*')` used as a POSIX regex (`file_name ~`) without escaping other regex characters like `.` or `(` in filenames (service 330, 423-426); an invalid regex rolls back the whole day's aggregation (service 188).
- BUG: `highRiskPII` and `criticalAlerts` ignore the date range; `vendorCompliance` "compliant" means only that a file arrived in the project (dashboard.js:367-378).
- BUG: criticalAlerts in executive metrics come from `alert_events` statuses while metric-trends criticalAlerts come from `anomalies` severity critical/high.
- BUG: materializedViewWorker logs/returns 'View does not exist' for `mv_dashboard_summary` every 60 s because prod has no such view (materializedViewWorker.js:57, 70, 196; prod dump :8046, :8066 only).
- DUPLICATE: dashboard health index computed three ways: files.quality_score average (executive, project-health), profiling_metrics (completeness+validity)/2 (metric-trends), file pattern overall score (insights).
- DUPLICATE: four near-identical admin/project query branches repeated in every dashboard handler; `dataHealth`/`dataHealthIndex` and `fileThroughput`/`throughputTrend` duplicate keys in the same response (dashboard.js:870-894).
- DUPLICATE: `get_user_projects` access logic reimplemented in dashboard.js:25-52 versus `getUserProjects` in requireProjectAccess (used server.js:5126).
- DUPLICATE: admin check via `userHasAdminAccess` here vs `userHasAllProjectAccess` in alert history (server.js:5129); differences not compared.
- DUPLICATE: weekly/monthly pattern metrics are refreshed both by the file_pattern_metrics statement trigger (prod dump :3246-3251) and nothing in materializedViewWorker covers those views (the worker lists only the three mv_* views), so the trigger is the only refresher; each per-pattern upsert statement fires it.
- DEAD: `userRoles` assigned and unused in every dashboard handler (e.g. 93, 252). `internal_connections_count` is a constant 0 (290); `vendors_count` (284) is selected and never read. `triggerNow` in worker (138) and `getViewStatus`/`refreshView` exports: getViewStatus used server.js:1124. `invalidateDashboardCache` (cache.js:108) has no caller.
- DEAD: frontend badgeService calls `/api/badges/check`, POST `/api/badges`, DELETE `/api/badges/:id`, and POST `/api/user/dashboard-settings` have no server routes. The six `/api/insights/*` endpoints and `/api/dashboard/metrics` have no frontend consumer.
- DEAD: materialized views `mv_job_trends_hourly` and `mv_file_processing_summary` are refreshed but no route queries them. `mv_dashboard_summary` does not exist in prod; its only reader, GET /api/jobs/stats/summary (jobs.js:28-40), falls back to live queries, so the view branch is unreached in prod.
- UNCLEAR: ad-hoc root scripts reprofile_files.js and test_column_stats.js (inventory:885) were not read. backfill_metrics.js and test_aggregation.js are described under entry 17.
- Note (not a DASH flag): the data-quality 500 at server.js:11526 belongs to `/api/files/:fileId/insights` (server.js:11456), a different route from `/api/insights/*`; it is outside DASH.

## Domain terms
- Executive dashboard / headline metrics / KPIs; "pillars": Data Health, Pipeline Reliability, Governance & Compliance, Adoption & Automation (dashboard.js:240-241).
- Data health index = quality score average; also "health score" (project), "dataHealth".
- Throughput = files created in period. Job success = completed transformation jobs. "Critical alerts" = open alert_events (executive) or critical/high anomalies (trends). Anomaly = alert source.
- File pattern = filename with date/version suffixes replaced by `*`. Insights = file_pattern_metrics.
- Target file vs source file (`file_audit_details.file_role`).
- Badge (user_badges, badge definitions, levels bronze/silver/gold/platinum). Dashboard settings = layout/widgets/theme.
- Admin = `userHasAdminAccess`; "accessible projects" = `get_user_projects`.
- Anomaly status: 'open' (default, anomalyService) vs 'active' (jobExecutionEngine, dashboard /metrics).

## Open questions
1. Is the non-admin `project_id` path guaranteed to restrict to accessible projects in all trend endpoints (checked via SQL in the job/drift/violations/file-type queries, not exhaustively for 1466-1504)?
2. Intended semantics of "vendor compliance".
3. How `ExecutiveDashboard.jsx` renders thresholds client-side; file not read beyond imports (src/hooks/useDashboard.js:15-71 only seen by grep).
4. Whether anything beyond the cited places writes to `user_badges` outside js (e.g. SQL migrations or external tools); no js insert exists.
