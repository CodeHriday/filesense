# ANOM verify (final, after fix round 2)

Verdict: PASS

Counts: about 40 claims checked, 0 wrong, 1 minor imprecision (below), 0 unsupported, 0 missing entry points.

## Coverage
All 5 HTTP endpoints (inventory.md:310-314) and the FE route /anomalies (inventory.md:817) have subsections. The Python caller in profile_api.py is covered as entry 7. No missing entry points. The only Python importers of the ML modules are profile_api.py and backend/ml/__init__.py, so no uncovered Python callers exist.

## Round-2 changes (all CORRECT)
- profile_api.py cites, checked directly:
  - :2261 is `app.run(host='0.0.0.0', port=port, debug=False)`.
  - :1661 is the `/api/vendor-profile` route. A grep for before_request found none, so the route has no auth.
  - :1666-1671 is the docstring showing `local_file_path`, and :1686 reads it.
  - :362-366 is the except block. It logs, rolls back and returns `{anomalies_detected:0, anomalies:[], error:str(e)}`. The caller at :1750 attaches it and returns 200 (:1842).
  - :325 commit, :331 `AnomalyService(conn)`, :342-349 `sensitivity='medium'`, :352 `get_file_anomalies`, :1742 and :1822 calls: all CORRECT.
- Node reaches Flask at server.js:4294 (hard-coded localhost:8000) and :4812. The proxy at :13968-14004 exists only inside the `NODE_ENV === 'production'` block and has no auth. No global `app.use(authenticateToken)` was found. SEC-6 is CORRECT.
- BUG-14 is CORRECT.
  - etlProfilingService.js:122 and :355 pass an object as the second argument.
  - profilingService.js:372 has the positional signature `(pool, fileId, filename, filePattern, options)`.
  - The import at etlProfilingService.js:2 is that same function, and no other `profileFile` caller exists.
  - Each check swallows its own errors, and `saveProfilingMetrics` returns early when no file row is found (:461-464).
- Healing coverage gap: healingRoutes.js:355 default branch is `manual_review`, with `impact:'unknown'` at :368. CORRECT.
- History includes the current row: the commit at :325 comes before detection. The history query (anomaly_detector.py:507-511) filters `profiled_at >= cutoff`, so the current row is included. The no-history branch (:416-418) is effectively dead on this path. CORRECT.
- BUG-4 is CORRECT.
  - profilingService.js:261 has the `avg > 0` guard on the 1.5x arm only.
  - The `||` arm still fires when avg is 0, and anomalyService.js:250 then divides by 0, giving Infinity.
  - The column is numeric(10,2) (dump :2597), so the insert fails and the error is swallowed at :279-282.
  - The average query (:100-113) includes the current file when it matches the pattern, so "rare" is reasonable. The overflow route is plausible.
- `run_profiling` is CORRECT: HealingRecommendations.jsx:123-129 shows only an alert, and only when `anomaly?.file_id` is set.
- OQ 2 closed is CORRECT. `getOpenAnomalies`, `resolveAnomaly`, `getAnomalyStatistics` and `suggestRuleAdjustments` appear only in anomalyService.js and anomalyRulesEngine.js (JS and JSX grep). profile_api.py never references `get_recent_anomalies`, `get_anomaly_statistics` or `resolve_anomaly`.
- Also CORRECT:
  - anomalyRoutes.js:60-61, :72-76, :84-136, :152-185.
  - jobExecutionEngine.js:1583-1622 (sourceFileId and sourceName have no declaration anywhere in the file), :2150-2171.
  - anomalyRulesEngine.js:142-198.
  - healingRoutes.js:373-376.
  - The mount at server.js:5405-5410.

## Minor imprecision (not WRONG)
- Entry 7 says Node calls `http://localhost:8000` at server.js:4294 and :4812. :4812 actually uses `process.env.PROFILING_SERVICE_URL || 'http://localhost:8000'`, so it can be redirected by env. This does not change the conclusion.

## Rewrite loss check
Nothing was lost: all prior entries, flags (SEC-1..6, BUG-1..14, DUP, DEAD, UNCLEAR) and open questions are present. The old DEAD-1 is explicitly retracted. Open questions 1, 2 and 6 are closed with the right pointers.

## Missed items
None material. Not run-verified, and the notes say so: the BUG-4 DB failure and the file_id slash behaviour.
