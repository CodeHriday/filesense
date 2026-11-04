# DASH verification (round 3, final re-verify after fix round 2)

Written by the orchestrator from the verifier's reply. The verifier declined to write report files.

**Verdict: PASS.** 34 claims checked, 0 wrong, 0 unsupported, 0 missed.

## Round-2 changes

All are correct.

### Entry 13, retention
- In the prod dump, :3232, :3520 and :4723 all default to `now() + '1 year 6 mons'`.
- :2806, :3849 and :4675 are plain NULL columns, so the reattribution to audit_log_archive, audit_log and file_audit_details is consistent.
- The worker runs cleanup when `dayOfMonth % 7 === 0` (insightsAggregationWorker.js:115), that is on days 7, 14, 21 and 28.
- cleanupOldRecords (fileInsightsService.js:434-481) deletes from the three tables in one transaction.
- Open question 4 is closed and the remaining questions are renumbered.

### Entry 18, materialized views
- jobs.js:28-40 checks pg_matviews for mv_dashboard_summary before reading it.
- The prod dump has only mv_file_processing_summary (:8046) and mv_job_trends_hourly (:8066).
- materializedViewWorker.js returns 'View does not exist' at :57 and sets lastRefreshTimes only at :70, so the missing view is retried on every tick.
- The DEAD flag is correctly narrowed to the two views that exist.

### Entry 17, the 0-score BUG
The guard is `totalColumns > 0 && metrics.record_count > 0` at service :302. The scores are computed at :308-322.

### Entry 8, the jobSuccess BUG
dashboard.js:1783 returns 0 for an empty bucket, while :861 returns 100.

### Entry 15, badges
- /api/badges appears only at badgeService.js:151, :162, :173 and :184, and at server.js:5100.
- The lazy CREATE is at server.js:5104-5111 and the read at :5114.
- There is no INSERT into user_badges anywhere. Deletes are at server.js:2097, :2217 and :3344, and at adminCleanupRoutes.js:241 and :495.
- The prod table is at dump :6502.

### Markers
- No "per verifier" markers remain.
- "Inferred" is kept only on the NaN days → 500 claim. That claim is sound for the trend endpoints, which use `parseInt(..., 10)` followed by Math.min/Math.max (dashboard.js:1215-1216, :1321-1322, :1429-1430).
- Executive-metrics uses `parseInt(...)||30` (:256). It cannot produce NaN and accepts negative values, which matches the notes.

## Other spot checks

All are correct.
- Worker start is at server.js:71-75, the materialized view worker start at :14178, and getViewStatus at :1124.
- /api/user/dashboard-settings is at server.js:6283, with the 'default' read at :6296 and the default payload at :6300-6309.
- In fileInsights, CACHE_TTL is at :16 and decodeURIComponent at :68 and :140. The admin 403 checks for /aggregate and /cleanup are at :171-176 and :199.
- In executive-metrics:
  - slaBreaches is initialised at :274 and assigned only at :468.
  - vendors_count is at :284 and `(SELECT 0)` at :290.
  - The ratio formulas and thresholds are at :859-904.
- invalidateDashboardCache appears only at cache.js:108 and in the export at :160. The worker gate is at :56-66.

## Coverage
- All 8 dashboard routes, 6 insights routes, 2 server.js stubs, 4 FE routes and 2 workers have subsections.
- Root scripts (inventory:885): backfill_metrics.js and test_aggregation.js are under entry 17. reprofile_files.js and test_column_stats.js are flagged UNCLEAR.
- The full-file rewrite lost nothing.
