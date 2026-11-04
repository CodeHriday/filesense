# DASH - Dashboards, insights & badges

## Summary
Read-only dashboard KPIs and trends (`backend/routes/dashboard.js`, mounted `app.use('/api/dashboard', authenticateToken, dashboardRoutes)` at server.js:5301), file-pattern insights (`backend/routes/fileInsights.js`, mounted server.js:5310 with `authenticateToken`), two unauthenticated stub endpoints in server.js (badges, dashboard settings), and two background workers. Admin-ness is `userHasAdminAccess` (permissionHelpers.js:80): admin role OR any of `users:write`, `roles:write`, `project_management:write`. Non-admins are scoped by project membership (`get_user_projects($n)`, rewritten in app code to a UNION of `project_members` and `access_group_members`+`project_access_groups`, dashboard.js:25-52). Files whose `file_audit_details.file_role = 'target'` are excluded in most file metrics.

Common to all `/api/dashboard/*`: router-level 503 `{error:'Dashboard is initializing...', retryable:true}` unless `app.locals.databasePrerequisites.ready` (dashboard.js:65-76); per-handler 401 if no `req.user.id`; response cache TTL 120 s keyed by user, roles, path, days, project_id, metric, granularity (dashboard.js:6-19), cached only on status 200; 500 responses include `details: error.message` (e.g. dashboard.js:230-233).

## Entry points

### 1. GET /api/dashboard/metrics (dashboard.js:82)
- Auth: JWT. Admin sees global counts; others scoped to accessible projects.
- Input: none. Output `{success, metrics:{projects, files, schedules, jobs, anomalies}}` (217-226).
- Rules: schedules counted only `is_active = true` (149); anomalies only `status = 'active'` (199); jobs = all `transformation_jobs` (not just failed, comment 166).
- Errors: 401, 500, 503.

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
  - API usage: active tokens (`is_active`, not revoked, not expired, 396) and count of files with `metadata->>'upload_method'='api'`; avg per token rounded (925).
  - SLA breaches (admin/no-project branch, 426-467): agreement `sla_enabled` and `active`; expected interval daily 1d, weekly 7d, monthly 30d, quarterly 90d, else 1d (429-435); 'late' if last source upload < NOW() - interval - `alert_threshold_minutes`; 'missing' if no upload; filename match via `LIKE REPLACE(file_name,'*','%')`.
  - Platform overview counts (276-291) are global, not scoped, for all callers; `internalConnections` hard-coded `SELECT 0` (290).
- Output: `{success, timeRange, metrics:{totalFiles, dataHealth, dataHealthIndex, fileThroughput, throughputTrend, jobSuccessRate, criticalAlerts, highRiskPII, vendorCompliance, governanceCoverage, apiUsage, slaBreaches, platformOverview}}` (865-949). Several keys duplicate each other (dataHealth/dataHealthIndex, fileThroughput/throughputTrend).
- Consumer: src/hooks/useDashboard.js:15.

### 3. GET /api/dashboard/project-health-scores (dashboard.js:966)
- Auth: JWT; admin all projects, others accessible. Per project: avg `quality_score` over non-target files, `excellent_files` (>=90), `poor_files` (<70), status >=90 excellent, >=75 good, >=60 fair, else poor (1005-1010); projects with 0 files omitted (1012); ordered by score desc, name. Output `{projects, totalProjects}`; score 1 decimal.

### 4. GET /api/dashboard/file-type-distribution (dashboard.js:1086)
- Query `project_id`. Group by `file_type` (null -> 'unknown', 1175), count, SUM(file_size), AVG quality; percentage 1 decimal. Output `{fileTypes, totalFiles, projectId}`. Non-target files only.

### 5. GET /api/dashboard/job-trend (dashboard.js:1201)
- Query `days` (default 30, clamped 1..365, 1216), `project_id`. Per `DATE(start_time)`: passed (status 'completed'), failed (status 'failed'). Output `{jobTrend:[{date,passed,failed}], projectId}`.

### 6. GET /api/dashboard/schema-drift-trend (dashboard.js:1307)
- Same params/clamp. Counts `anomalies` with `anomaly_type='schema_drift'` per `DATE(detected_at)`. Output `{driftTrend:[{date,count}], projectId}`.

### 7. GET /api/dashboard/quality-violations-trend (dashboard.js:1415)
- Same params/clamp. Counts `quality_rule_violations` per day and `quality_rules.rule_type` restricted to completeness, uniqueness, validity, consistency, accuracy (1446). Output `{violationsTrend:[{date,dimension,count}], projectId}`.

### 8. GET /api/dashboard/metric-trends (dashboard.js:1534)
- Query `metric` (default 'all'; totalFiles, dataHealth, jobSuccess, criticalAlerts, governanceCoverage, vendorCompliance), `granularity` (default 'daily'; weekly, monthly), `project_id`.
- Windows: daily 15 days, weekly 16 weeks, monthly 16 months, weekly/monthly `LIMIT 16` (e.g. 1592-1595).
- dataHealth = ROUND(AVG(completeness_score + validity_score)/2,1) from `profiling_metrics` (1651), different source from executive health.
- jobSuccess value = round(completed/total*100), criticalAlerts = anomalies with severity IN ('critical','high') (1800), governanceCoverage value = count of tagged files (1921, not a percent), vendorCompliance = round(active/total agreements created per bucket*100), 100 if none (1966); vendor trend ignores user/project scoping (1925-1963).
- Output `{success, trends, granularity, metricType, projectId}`. Consumers: useDashboard.js:71, MetricTrendPopup.jsx:49.

### 9. GET /api/insights/file-patterns (fileInsights.js:22)
- Auth: JWT only (any user). `limit` default 100, `offset` default 0 (no max). Cache `insights:patterns:{limit}:{offset}` 5 min (CACHE_TTL = 5*60, line 16). Service groups `file_pattern_metrics` by pattern with days_tracked, last date, total files, avg quality, has_alerts, total alerts; order by has_alerts desc, last date desc (fileInsightsService.js:344-361). Output `{success, patterns, pagination}`.

### 10. GET /api/insights/file-patterns/:pattern/metrics (fileInsights.js:66)
- JWT only. `granularity` daily|weekly|monthly else 400 (73-78). `range` default 30; string forms `^(\d+)([dwmy])$`: d=1, w=7, m=30, y=365 days (80-95); capped 548 days (98). Reads `file_pattern_metrics`, `_weekly`, `_monthly` (service 366-402). Cache key includes pattern/granularity/range (100). Output `{success, pattern, granularity, range_days, metrics}`.

### 11. GET /api/insights/file-patterns/:pattern/alerts (fileInsights.js:138)
- JWT only. `limit` default 50. Selects `anomalies WHERE file_name ~ <pattern with * -> .*>` (service 407-429). Not cached; no project scoping.

### 12. POST /api/insights/aggregate (fileInsights.js:168)
- JWT + `userHasAdminAccess` else 403 (171-176). Body `date` optional (default now; `new Date(req.body.date)` unvalidated). Runs `aggregateDailyMetrics`; output `{success,date,patterns_processed,files_processed}`.

### 13. POST /api/insights/cleanup (fileInsights.js:196)
- JWT + admin else 403. Deletes rows with `retention_until < NOW()` from `file_pattern_metrics`, `profiling_metrics` (non-null), `file_columns` (non-null) in one transaction (service 434-481). Output counts.

### 14. GET /api/insights/stats (fileInsights.js:222)
- JWT only. Global aggregate over `file_pattern_metrics` (patterns, rows, files tracked, alerts, min/max date). Not cached.

### 15. GET /api/badges (server.js:5100)
- Auth: none (no `authenticateToken`). Runs `CREATE TABLE IF NOT EXISTS user_badges (id, badge_id, badge_name, badge_description, icon_url, earned_at)` on every call, then `SELECT * FROM user_badges` for everyone, no user filter. 500 `{error:'Failed to fetch badges'}`.
- Frontend (src/api/badgeService.js:149-190) also calls POST /api/badges/check, POST /api/badges, DELETE /api/badges/:id. No such server routes found (grep of `/api/badges` in js/jsx shows only server.js:5100); badge awarding rules exist only client-side as BADGE_DEFINITIONS (badgeService.js:4-141): quality >70/80/90/95, completeness >75/85/95, consistency >70/85/95, freshness 7/3/1 days, improvement 5/10/20 %, excellence 95.

### 16. GET /api/user/dashboard-settings (server.js:6283)
- Auth: none. Creates `user_dashboard_settings` if missing; always reads `WHERE user_id = 'default'` (not the caller). Default when no row: `{layout:'grid', widgets:[recent-files, data-quality, data-volume, alerts], theme:'light'}` (6300-6309). Else returns stored `settings` JSON.
- Frontend POST /api/user/dashboard-settings (DashboardSettings.jsx:91,116) has no server route found; frontend falls back to localStorage `dfo-dashboard-layout` / `dfo-dashboard-theme` (99-101, 121).

### 17. Worker: InsightsAggregationWorker (backend/workers/insightsAggregationWorker.js; started server.js:71-75)
- Checks every hour (28) and once at startup (31). Runs only if local hour == 2 and minutes >= 0 and the last `MAX(metric_date)` in `file_pattern_metrics` != today (UTC date string) (60-66). Aggregates yesterday (102-106). If day-of-month % 7 == 0 runs cleanup (115). Errors logged, swallowed.
- Aggregation (service 50-194): files whose `DATE(COALESCE(pm.profiled_at, f.created_at)) = date`; pattern from filename regex replacements (17-32); one upsert per pattern on `(file_pattern, metric_date)`. Metrics: record_count sum of `row_count`; duplicate_percentage mean; column stats from the FIRST file only (235-254); ID-like columns (name ends in id/key/code/number/num, or unique/rows > 0.9) skipped (40-41, 266); completeness = 100 - avg null%; consistency = completeness (copy, comment "simplified", 311); validity = 100 - duplicate%; overall = mean of the three (308-322); alert_count = open anomalies matching pattern regex detected that date (327-336).

### 18. Worker: materializedViewWorker (backend/workers/materializedViewWorker.js; started server.js:14178 with 60 s check)
- Refresh intervals: `mv_dashboard_summary` 5 min, `mv_job_trends_hourly` 15 min, `mv_file_processing_summary` 30 min (14-30). All refreshed at startup (187); `REFRESH ... CONCURRENTLY`, falls back to non-concurrent if error contains 'cannot refresh' (85). Status/db stats exposed at server.js:1124,1136 (not traced further). Views created in backend/migrations/enterprisePerformanceOptimizations.js:277-372.

### Frontend routes
`/` DashboardOrRedirect, `/executive-dashboard`, `/badges`, `/dashboard-settings` (inventory App.jsx:340,341,398,400). ExecutiveDashboard.jsx has no direct API calls; data via src/hooks/useDashboard.js. Badges.jsx imports badgeService only.

## Data touched
Reads: projects, files, file_audit_details, schedules, transformation_jobs, transformation_mappings, anomalies, alert_events, alert_runs, alert_policies, quality_rule_violations, quality_rules, vendors, vendor_agreements, users, roles, governance_tags, governance_policies, transformation_lineage, storage_connections, column_governance_tag_assignments, api_tokens, profiling_metrics, file_columns, project_members, access_group_members, project_access_groups.
Writes: file_pattern_metrics (upsert/delete), profiling_metrics and file_columns (retention deletes), user_badges and user_dashboard_settings (created lazily by GET), materialized views (refresh). Views read: file_pattern_metrics_weekly/_monthly.

## Flags
- SECURITY: GET /api/badges has no auth and returns all users' badges (server.js:5100-5120).
- SECURITY: GET /api/user/dashboard-settings has no auth and is not user-scoped (hard-coded `'default'`, server.js:6296).
- SECURITY: /api/insights/* only require a valid JWT; no project scoping, so any user reads pattern names, metrics and alert details (anomaly file names, descriptions) across all projects (fileInsights.js:22,66,138,222).
- SECURITY: `platformOverview` counts (users, roles, vendors, connections, tags, policies) are unscoped and returned to non-admins (dashboard.js:276-291). Also metric-trends vendorCompliance unscoped (1925-1963).
- SECURITY: dashboard 500 responses leak `error.message` (e.g. dashboard.js:954-957).
- SECURITY: `rangeInDays` interpolated into SQL (`INTERVAL '${rangeInDays} days'`, fileInsightsService.js:374,383,392); the value is numeric from parseInt/regex but a non-numeric `range` yields NaN -> `parseInt(...)||30` guards the default; low risk, noted.
- BUG: executive-metrics non-admin and project branches and the admin/project branch compute SLA breaches only in the admin/no-project branch as seen (426-470); whether the other three branches set `slaBreaches` was not verified (lines 579-857 only partly read).
- BUG: executive `days` has no clamp (256) unlike trend endpoints (1..365).
- BUG: weekly/monthly metric-trends order ASC with `LIMIT 16` over a 16-week window that can span 17 buckets, dropping the newest bucket (e.g. 1592-1595).
- BUG: invalid `granularity` (not daily/weekly/monthly) leaves the query variable undefined, pool.query errors, returns 500 (1556-1633).
- BUG: server.js:2097, 2217, 3344 run `DELETE FROM user_badges WHERE file_id = $1`, but the only table definition (server.js:5104-5111) has no `file_id` column.
- BUG: dashboard-settings response `layout` default is the string `'grid'`, while DashboardSettings.jsx:31 requires an array and otherwise sets an empty layout; widget list is ignored by the page. POST route missing.
- BUG: consistency_score copies completeness_score (fileInsightsService.js:311); string `avg_length` is (min+max)/2 of lengths of min/max values (293); column stats taken from first file only (235).
- BUG: worker run gate: `now.getHours()` local time but `today` from UTC ISO (insightsAggregationWorker.js:57-63); it aggregates yesterday but marks "ran today" via MAX(metric_date), which equals yesterday's date, so `lastRun !== today` is always true until a row with today's date exists; the hourly check can re-run the aggregation each hour during hour 02 (60-66). UNCLEAR whether intended; re-run is idempotent via upsert.
- BUG: `isIdField` divides by `rowCount`; if `row_count` is 0/null result is NaN/Infinity (service 41).
- BUG: `pattern.replace(/\*/g,'.*')` used as a POSIX regex (`file_name ~`) without escaping other regex characters like `.` or `(` in filenames (service 330, 423-426).
- BUG: `highRiskPII` and `criticalAlerts` ignore the date range; `vendorCompliance` "compliant" means only that a file arrived in the project (dashboard.js:367-378).
- BUG: criticalAlerts in executive metrics come from `alert_events` statuses while metric-trends criticalAlerts come from `anomalies` severity critical/high.
- DUPLICATE: dashboard health index computed three ways: files.quality_score average (executive, project-health), profiling_metrics (completeness+validity)/2 (metric-trends), file_pattern overall score (insights).
- DUPLICATE: four near-identical admin/project query branches repeated in every dashboard handler; `dataHealth`/`dataHealthIndex` and `fileThroughput`/`throughputTrend` duplicate keys in the same response (dashboard.js:870-894).
- DUPLICATE: `get_user_projects` access logic reimplemented in dashboard.js:25-52 versus `getUserProjects` in requireProjectAccess (used server.js:5126).
- DUPLICATE: admin check via `userHasAdminAccess` here vs `userHasAllProjectAccess` in alert history (server.js:5129); differences not compared.
- DEAD: `userRoles` assigned and unused in every dashboard handler (e.g. 93, 252). `internal_connections_count` is a constant 0 (290). `triggerNow` in worker (138) and `getViewStatus`/`refreshView` exports: getViewStatus used server.js:1124.
- DEAD/UNCLEAR: frontend badgeService calls `/api/badges/check`, POST `/api/badges`, DELETE `/api/badges/:id` with no server routes found.
- UNCLEAR: the materialized views (`mv_dashboard_summary` etc.) are refreshed but no dashboard route queries them (grep found only the worker and migration).
- UNCLEAR: ad-hoc root scripts (reprofile_files.js, backfill_metrics.js, test_aggregation.js) listed in inventory:885 were not read.

## Domain terms
- Executive dashboard / headline metrics / KPIs; "pillars": Data Health, Pipeline Reliability, Governance & Compliance, Adoption & Automation (dashboard.js:240-241).
- Data health index = quality score average; also "health score" (project), "dataHealth".
- Throughput = files created in period. Job success = completed transformation jobs. "Critical alerts" = open alert_events (executive) or critical/high anomalies (trends). Anomaly = alert source.
- File pattern = filename with date/version suffixes replaced by `*`. Insights = file_pattern_metrics.
- Target file vs source file (`file_audit_details.file_role`).
- Badge (user_badges, badge definitions, levels bronze/silver/gold/platinum). Dashboard settings = layout/widgets/theme.
- Admin = `userHasAdminAccess`; "accessible projects" = `get_user_projects`.

## Open questions
1. Do POST/DELETE badge routes and POST dashboard-settings exist elsewhere (e.g. mounted routers)? Only server.js and src were grepped for `/api/badges` and `dashboard-settings`; backend/routes not exhaustively searched.
2. Does `slaBreaches` get computed in the non-admin and admin/project branches of executive-metrics (dashboard.js:472-857 only partly read)?
3. What reads the materialized views, if anything?
4. Is the non-admin `project_id` path guaranteed to restrict to accessible projects in all trend endpoints (checked via SQL in the job/drift/violations/file-type queries, not exhaustively for 1466-1504)?
5. Intended semantics of "vendor compliance" and of `retention_until` setting (18 months per comments; column set in migration backend/migrations/createFileInsightsTable.js not read).
6. How `ExecutiveDashboard.jsx` renders thresholds client-side; file not read beyond imports (src/hooks/useDashboard.js:15-71 only seen by grep).
7. Cache middleware behaviour (`backend/src/middleware/cache`) and `cacheService` backing store not read.
8. Badge awarding: where (if anywhere) are badges inserted into `user_badges`?
