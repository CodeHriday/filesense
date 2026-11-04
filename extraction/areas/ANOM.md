# ANOM - Anomaly detection & healing

## Summary
Anomalies live in one table, `anomalies`. Three code locations write to it:
- A JS pipeline: `jobExecutionEngine` -> `anomalyRulesEngine.executeAnomalyDetection` -> `profilingService` / `anomalyService.log*` (backend/services/anomalyRulesEngine.js:120, backend/services/jobExecutionEngine.js:9).
- A Python ML pipeline (z-score, IQR, moving average, quality comparison, schema comparison) in backend/ml/anomaly_detector.py and anomaly_service.py. It is called from the Python profiling API: profile_api.py imports `AnomalyService` (:39), builds `AnomalyService(conn)` (:331), calls `detect_and_store_anomalies(... sensitivity='medium')` (:342-349) and `get_file_anomalies(file_id, status='open')` (:352) inside `store_profiling_metrics_and_detect_anomalies` (:250), which `vendor_profile` calls at profile_api.py:1742-1749 (and :1822). `AnomalyAnalyzer` is reached through it and `HealingRecommender` is constructed in `AnomalyService.__init__` (anomaly_service.py:33). See the "Python caller" subsection.
- A third, inline writer in jobExecutionEngine.js:1598-1618 (schema drift, status `'active'`). It references undeclared `sourceFileId` and `sourceName`, so it throws a ReferenceError caught at :1621 and the row is not written (see BUG-10).

Five HTTP endpoints read, resolve and recommend. They are mounted at `/api/ml` (server.js:5406, 5410) and have no auth middleware at the mount. Other routes in server.js use `authenticateToken` (e.g. server.js:5171). The frontend page /anomalies (src/pages/Anomalies.jsx) uses three of them (anomalies, statistics, resolve); the HealingRecommendations component uses recommendations. `GET /anomalies/file/:file_id` has no caller in src/.

## Entry points

### 1. GET /api/ml/anomalies (backend/routes/anomalyRoutes.js:9)
- Caller: src/pages/Anomalies.jsx:42. No auth middleware is applied at mount (server.js:5405-5406).
- Inputs (query): `severity`, `status`, `anomaly_type`, `limit` (default 100). There is no validation. `parseInt(limit)` is applied at :61 with no cap, so a NaN limit would reach SQL.
- Output: `{success:true, anomalies:[rows]}`, ordered by `detected_at DESC` (:60).
- Errors: 500 `{success:false, error:'Failed to fetch anomalies', details: err.message}` (:72-76). The raw DB error message is leaked.
- Side effects: none. Filters are parameterised.

### 2. GET /api/ml/anomalies/statistics (anomalyRoutes.js:84)
- Caller: src/pages/Anomalies.jsx:54.
- Output: `by_status` (all statuses), `by_severity` (open only, :103), `by_type` (open only, top 10 by count, :117-120), `total_open` (`by_status.open || 0`), `total_resolved` (`by_status.resolved || 0`) (:129-136).
- Errors: 500 with `details`.

### 3. POST /api/ml/anomalies/:anomaly_id/resolve (anomalyRoutes.js:152)
- Caller: src/pages/Anomalies.jsx:79.
- Input: body `resolution_notes`, required and non-blank, else 400 'Resolution notes are required' (:157-162).
- Resolver identity: `req.user?.userId || req.user?.id || 'system'` (:164). No auth middleware covers `/api/ml` (server.js:5406, 5410; no `authenticateToken` there and no global `app.use` auth in server.js:556-640), so `req.user` is not set and `resolved_by` is 'system' in practice (see BUG-1).
- Effect: `UPDATE anomalies SET status='resolved', resolved_at=NOW(), resolved_by, resolution_notes WHERE anomaly_id=$3 RETURNING *` (:166-174).
- The update has no check of the current status. A resolved anomaly can be re-resolved, which overwrites the earlier resolver, notes and time.
- Output: 404 'Anomaly not found' if rowCount is 0 (:178); otherwise `{success:true, anomaly}`.
- Logs an `Anomaly resolved` info line (:185).

### 4. GET /api/ml/anomalies/file/:file_id (anomalyRoutes.js:209)
- Caller: none. No call in src/ (grep).
- Input: optional `status` query.
- Output: all anomalies for the file with no limit, `detected_at DESC` (:247). No ownership check.
- `:file_id` is a single path segment. File ids that contain slashes would not match unless URL-encoded (server.js:410-428 describes slashes in file ids under /api/files). Latent, not run-verified.

### 5. GET /api/ml/recommendations/:anomaly_id (backend/routes/healingRoutes.js:10)
- Caller: src/components/HealingRecommendations.jsx:24.
- Flow: loads the anomaly (404 if missing, :39), then `generateRecommendations` (:73) builds a hard-coded list by `anomaly_type`. Nothing is stored. The function sorts by priority with order critical 0, high 1, medium 2, low 3 (:373-376).
- Output: `{success, anomaly_id, recommendations}`.
- Priority rules (literal values):
  - `statistical_outlier`: add_validation_rule is 'high' if `z_score > 4`, else 'medium' (:86). investigate_source is 'high' if `z_score > 5` (:117).
  - `range_violation`: 3 fixed recommendations (:128-180).
  - `trend_deviation`: monitoring is 'high' if `deviation_pct > 100` (:189).
  - `quality_degradation`: detailed_profiling is 'critical' if `degradation_pct > 50`, else 'high' (:223). validation_rules uses `min_acceptable_score: parseFloat(expected_value || 80)` (:261). 'critical' priority is only produced here.
  - `schema_mismatch`: branches on `details.mismatch_type` ('column_count' or 'data_types') (:271, :289), then always adds create_mapping and document_schema (:322-352). Any other `mismatch_type` gets only those two.
  - default: one 'manual_review' item with `impact:'unknown'` (:355-369).
  - Coverage gap: the cases cover only the Python types (healingRoutes.js:79-270). All five JS types (schema_drift, numeric_deviation, row_count_anomaly, null_spike, type_mismatch) fall to the default `manual_review` (:355). The `trend_deviation` and `schema_mismatch` branches are never produced, since `detect_trend_anomalies` and `detect_schema_anomalies` are not wired into `analyze_file_profile`.
- `axios` is imported (healingRoutes.js:3) and never used.
- Frontend: `HealingRecommendations.jsx:24` calls the endpoint. Its `handleActionClick` (:75) switches on `action_type` (HealingRecommendations.jsx:79-139):
  - `create_etl_transformation`: `navigate('/transformations', ...)` (:79-81).
  - `create_validation_rule`: `navigate('/quality-rules', ...)` (:94-96).
  - `create_dashboard`, `create_alert_rule`: `navigate('/insights', ...)` (:105-108).
  - `update_schema`, `update_thresholds`, `update_constraints`: `alert()` with the params (:116-120).
  - `run_profiling`: `alert()` only, no API call, and only when `anomaly?.file_id` is set; otherwise it does nothing (:123-126).
  - `manual_investigation`, `manual_documentation`, `manual_communication`: `alert()` (:131-135).
  - default: `alert()` that prints the JSON (:138-139).

### 6. FE route /anomalies (src/pages/Anomalies.jsx; route at src/App.jsx:442 per inventory.md:817)
- The page calls GET anomalies, GET statistics and POST resolve (:42, :54, :79).
- The default filter is `status:'open'` (:18). Rows with status 'active' (the intended value at jobExecutionEngine.js:1617) would not match this default filter.
- The severity stat cards include `critical` (:140). The JS-side producers never emit 'critical' (see BUG-2). Only the Python detector does.

### 7. Python caller: profile_api.py `store_profiling_metrics_and_detect_anomalies` (profile_api.py:250)
- Trigger: `vendor_profile` at profile_api.py:1742-1749 and a second call at :1822.
- It writes the `profiling_metrics` row and commits at :325, then runs `AnomalyService(conn)` (:331), `detect_and_store_anomalies(... sensitivity='medium')` (:342-349) and `get_file_anomalies(file_id, status='open')` (:352).
- The current metrics row is committed before detection, so the current value is part of its own history baseline (history is read from `profiling_metrics`, anomaly_detector.py:507-511).
- History therefore always contains the current row on this path, so the "no history, no detection" branch (anomaly_detector.py:416-418) effectively never fires. Detection still needs at least 3 rows (z-score), 5 (IQR) and 3 (quality).
- Auth: none. Flask `/api/vendor-profile` (profile_api.py:1661) has no before_request, token check or auth decorator, and binds `host='0.0.0.0'` port 8000 (profile_api.py:2261). Node calls it directly at `http://localhost:8000` (server.js:4294, :4812). The `/profile-api` proxy (server.js:13968-14004) exists only when `NODE_ENV === 'production'` and has no `authenticateToken`, so in production anyone can trigger profiling and read the `anomaly_detection` payload (see SEC-6). The request body accepts `local_file_path` (docstring profile_api.py:1666-1671); cross-reference SEC and PROF.
- Error path: failures in anomaly detection are swallowed and the function returns `{anomalies_detected:0, anomalies:[], error:str(e)}` (profile_api.py:362-366), so `vendor_profile` still answers 200 with an `error` key.
- Not called from profile_api.py (grep): `get_recent_anomalies`, `get_anomaly_statistics`, `resolve_anomaly`.

## Detection logic (non-HTTP producers)

### Python detector (backend/ml/anomaly_detector.py)
Sensitivity table (:36-40):

| Sensitivity | z_score | iqr_multiplier | deviation_pct |
|---|---|---|---|
| low | 3.5 | 3.0 | 50 |
| medium | 3.0 | 2.5 | 30 |
| high | 2.5 | 1.5 | 20 |

An unknown sensitivity string raises KeyError. profile_api.py passes 'medium' (:342-349).

- **Z-score** (:44): needs at least 3 values (:61) and std not 0 (:68). It fires when `|z| > threshold`. Type is `statistical_outlier`. Severity is `ratio = z/threshold`: above 1.5 critical, above 1.2 high, above 1.0 medium (:323-332). The 'low' branch is unreachable.
- **IQR** (:94): needs at least 5 values and iqr not 0. Bounds are `q1 - m*iqr` and `q3 + m*iqr`. Type is `range_violation`. Severity by distance in IQRs: above 3 critical, above 2 high, above 1 medium (:347-353).
- **Trend** (:148): `window_size` 5, needs at least `window+2` rows. It compares each row to its rolling mean and fires when deviation_pct exceeds the threshold. Severity: above 100 critical, above 50 high, above 30 medium (:357-363). It is not wired into `analyze_file_profile`.
- **Quality degradation** (:198): needs at least 3 history rows. Dimensions are overall, completeness, consistency and validity scores. It fires when `degradation > 10` points AND `degradation_pct > 15` (:238). Severity: above 50 critical, above 30 high, above 15 medium (:367-373).
- **Schema** (:257): a column count mismatch is 'high' and a type mismatch is 'medium'. Not wired into `analyze_file_profile`. `abs(a-e)/expected_columns` divides by zero if `expected_columns` is 0 (:291).
- **Orchestration** (backend/ml/anomaly_detector.py:393): lookback is 30 days and history is capped at 100 rows (:495-511). History is read for the same file_id only (:507-511). With no history, no detection runs (:416-418). It checks `row_count` by z-score (falsy values skipped), `column_count` by IQR, and quality scores.
- **Storing** (backend/ml/anomaly_service.py:45): `anomaly_id` is `str(uuid.uuid4())`, status is 'open', and `detected_at` is `datetime.now()` in app-server local time (:89, :127-128). It commits once at the end and rolls back and re-raises on error (:139-141). The stored severity can be 'critical'.
- **`resolve_anomaly`** (backend/ml/anomaly_service.py:276) returns True even if no row matched (:316). On exception it rolls back and returns False (:319-321).
- **Healing recommendations in Python** (backend/ml/healing_recommender.py) repeat the JS thresholds (z 4 and 5, 100, 50, 30).

### JS rules engine (backend/services/anomalyRulesEngine.js)
DEFAULT_RULES (:14-55):

| Rule | Enabled | Threshold | Severity |
|---|---|---|---|
| numeric_deviation | true | 10 | medium |
| row_count_anomaly | true | 15 | medium |
| null_spike | true | 20 | medium |
| type_mismatch | true | - | high |
| schema_drift | true | - | high |
| duplicate_detection | false | 5 | low |
| completeness_check | false | 80 | medium |

- `getMappingRules` shallow-merges `transformation_mappings.anomaly_rules` over the defaults (:63-85). On a DB error it silently returns the defaults. The default is also returned when the mapping is missing.
- `executeAnomalyDetection` (:120):
  - Profiling-based rules are `numeric_deviation`, `row_count_anomaly`, `null_spike` and `type_mismatch`. Any one of them being enabled triggers `profileFile` with thresholds `|| 10`, `|| 15`, `|| 20` (:142-154). Because it is `||`, a threshold of 0 is replaced by the default.
  - Schema drift runs only if the rule is enabled, `runSchemaValidation` is true, and `files.schema_definition` is present (:168-185).
  - It rethrows errors (:195-198); see "Failure coupling" below.
- Severity configured in rules is ignored by the `log*` functions, which compute their own (see BUG-3).
- `validateRules` (:206): threshold must be 0-100, severity must be low, medium or high, and `enabled` must be boolean. It is called from backend/routes/transformations.js:377 and :511 (imported at :7 together with `getMappingRules` and `saveMappingRules`).
- `getAnomalyStatistics(mappingId, days=30)`, `suggestRuleAdjustments`: suggests a +5 threshold increase when a type has more than 20 anomalies and a resolution rate above 0.8 (:322). For types with no threshold, `suggestedThreshold` is null. Neither has a caller anywhere in JS or JSX (grep).

### When the JS pipeline runs (backend/services/jobExecutionEngine.js)
- `executeAnomalyDetection` is called per file at :2153 only when `runProfilingChecks && !dryRun && file.file_id` (:2150). `runProfilingChecks` defaults to true (:1140). Cloud files without a DB record are skipped (:2149-2150).
- Failure coupling: the call at :2153 is inside the per-file try whose catch is :2170. A throw from `detectSchemaDrift`, `logSchemaDriftAnomaly` or `profileFile` is rethrown by `executeAnomalyDetection` (anomalyRulesEngine.js:195-198), so the already-processed file gets `totalRowsFailed += file.row_count` (:2171) and failed node statuses.

### profilingService.profileFile (backend/services/profilingService.js:372-437)
- Once called, it runs all four checks (numeric, row count, null spike, type mismatch), even if only one rule is enabled. The rule flags only decide whether `profileFile` is called (anomalyRulesEngine.js:142-145). `executedRules` lists only enabled rules, but disabled checks still log anomalies, and `anomaliesByType` is overwritten with all four counts.
- Each check swallows its own errors and returns what it has (:175-178, :229-232, :279-282, :357-360).
- Numeric deviation (:132-179): compares `(min+max)/2*row_count` to the 7-day average of the same estimate (`getWeeklyAverageSum` :34-57); skipped when the weekly average is 0. The weekly query has no `file_id !=` filter, so the current file is in its own baseline.
- Row count (:190-233): 7-day average by `filename LIKE patternToSQLLike(filePattern)`; includes the current file.
- Null spike (:244-283): fires when `nullPercentage > threshold` OR `(avg > 0 && nullPercentage > 1.5 * avg)` (:261); the 1.5x arm has an `avg > 0` guard. If the average is 0 and the percentage exceeds the threshold, the deviation is Infinity (see BUG-4); the INSERT into a numeric(10,2) column likely fails and the error is swallowed at :279-282, so the spike is lost. Not run-verified.
- Type mismatch (:294-361): most common type per column among other files with the same pattern in the last 7 days; severity is fixed 'high' (:339).
- `saveProfilingMetrics` (:447-489): inserts a `profiling_metrics` row with all four scores set to the same `calculateQualityScore` value (100 minus 15/10/5 per high/medium/low, floor 0, :496-519), swallows errors, and returns early if the file row is missing. `severityCounts` is computed but unused (:449-453).
- Callers: anomalyRulesEngine.js:154 passes the positional arguments correctly. etlProfilingService.js:122 and :355 do not (see BUG-14).

### schemaService.detectSchemaDrift (backend/services/schemaService.js:568-612)
- Reads the latest `file_schemas` row for the same `file_id` (`ORDER BY captured_at DESC LIMIT 1`). No row returns `{hasDrift:false}`; equal hash means no drift; otherwise `compareSchemas` and it returns previous, current and differences. It throws on DB error.
- A first-seen file_id never drifts; the JS schema_drift rule fires only when the same file_id is re-processed with a changed schema.
- `logSchemaDriftAnomaly` reads `diff.columnCountMismatch`, `modifiedColumns`, `addedColumns`, `removedColumns`, `reorderedColumns` without defaulting; another shape would throw a TypeError that propagates.

### JS loggers (backend/services/anomalyService.js)
- **IDs**: `DRIFT-<Date.now()>-<8 hex uuid>` (:21), or `<TYPE-UPPER>-<ms>-<uuid8>` (:104). The Python producer uses a plain uuid, so the two ID formats differ. The inline writer builds its own `DRIFT-...` ID at jobExecutionEngine.js:1583.
- **Schema drift severity** (:24-31): 'high' if `columnCountMismatch` or any modified column; 'medium' if more than 2 columns were added or removed; else 'low'. The type is 'schema_drift'. Python uses 'schema_mismatch' for the same concept.
- **Numeric deviation** (:153-161): default threshold 10. Severity is high above `3*threshold`, medium above `threshold`, else low.
- **Row count** (:201-209): default threshold 15. High above `2*threshold`, medium above `threshold`, else low.
- **Null spike** (:247-255): default threshold 20. Severity is 'high' if `nullPercentage > 50`, else 'medium'. The `threshold` argument is not used to decide severity.
- **`getOpenAnomalies` and `resolveAnomaly`** (:284, :338): the SQL is parameterised. `resolveAnomaly` uses `CURRENT_TIMESTAMP`. No callers anywhere in JS or JSX (grep: definitions and exports only; see DEAD-2).
- No de-duplication: re-running a job or re-profiling a file inserts new rows with fresh IDs (both JS and Python paths).

### Inline schema drift writer (jobExecutionEngine.js:1598-1618)
- Intended severity: missing fields > 0 'high', new fields > 3 'medium', else 'low' (up to :1596; the 'high' condition is just above the quoted range).
- Inserts type 'schema_drift', title 'Schema Drift Detected', status `'active'` (:1617).
- Uses `sourceFileId` (:1606) and `sourceName` (:1607), which have no declaration in the file (grep; other hits are object keys at :1893, :1922, :4386, :4498). The ReferenceError is caught at :1621 and only logs a warn "Failed to create anomaly record" (:1622).

## Data touched
- Table `anomalies`, with the columns listed at anomalyRoutes.js:15-34. Definition in the prod dump attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql:2583-2614: `id` serial PK, `anomaly_id` varchar(255) NOT NULL UNIQUE, `severity` varchar(20) NOT NULL, `status` varchar(50) DEFAULT 'open', `deviation_percentage` numeric(10,2), `anomaly_details` jsonb, expected/actual text. No CHECK constraint on severity or status and no foreign keys. `file_id` is therefore not a FK, so anomalies survive file deletion.
- Indexes (same dump): detected, file_id, job_id, mapping_id, (severity, detected_at DESC), status, anomaly_type, (anomaly_type, detected_at DESC). The migration backend/migrations/createETLTransformationTables.js:147-209 creates the columns and six of them; the severity composite is in backend/migrations/enterprisePerformanceOptimizations.js:102.
- Statuses seen in code: 'open' (route default, Python :127, table default), 'resolved' (resolve), and 'active' (jobExecutionEngine.js:1617, never successfully written). Severities seen: critical, high, medium, low.
- Table `profiling_metrics` (read by Python, backend/ml/anomaly_detector.py:507; written by profile_api.py and by profilingService.saveProfilingMetrics).
- Table `transformation_mappings.anomaly_rules` (read and written, anomalyRulesEngine.js:66, 98).
- Table `files.schema_definition` (read, anomalyRulesEngine.js:170).
- Table `file_schemas` (read, schemaService.js:568-612).

## Flags

### SECURITY
- SEC-1: All 5 endpoints are unauthenticated (server.js:5405-5410, with no `authenticateToken`; no global auth in server.js:556-640). Anyone can list every anomaly, across all files and mappings, and see file names. The comment at server.js:5399 says "requires authentication" but none is applied to the ML mounts.
- SEC-2: The write endpoint (resolve) is also unauthenticated (anomalyRoutes.js:152). There is no role check and no ownership check.
- SEC-3: Raw `err.message` is returned as `details` in 500 responses (anomalyRoutes.js:75, 143, 200, 261; healingRoutes.js:62).
- SEC-4: There is no ownership or tenant scoping on any query. `file_id` and `anomaly_id` are used directly.
- SEC-5: The `limit` parameter is unbounded (anomalyRoutes.js:61).
- SEC-6: The vendor_profile response carries the anomaly data (`anomaly_detection`, profile_api.py:356-360). Flask has no auth and binds 0.0.0.0:8000 (profile_api.py:2261). The production-only `/profile-api` proxy has no `authenticateToken` (server.js:13968-14004), so anyone can trigger profiling and read the anomaly payload. The body also accepts `local_file_path` (profile_api.py:1666-1671); see SEC/PROF.

### BUG
- BUG-1: `resolved_by` is 'system' in practice. The route reads `req.user`, but no auth middleware covers `/api/ml` (server.js:5406, 5410), so the resolver identity is never captured (anomalyRoutes.js:164).
- BUG-2: Severity vocabulary is inconsistent in code. The Python detector emits 'critical' (anomaly_detector.py:327). The JS loggers and `validateRules` allow only low, medium and high (anomalyRulesEngine.js:232). `getAnomalyStatistics.bySeverity` has no 'critical' key, so `stats.bySeverity['critical'] += n` yields NaN (anomalyRulesEngine.js:274-298). The DB does not enforce this (no CHECK on severity or status in the prod dump, :2583-2614), so the mismatch is code-level only.
- BUG-3: The per-rule `severity` setting in DEFAULT_RULES and saved `anomaly_rules` is never used when logging. The `log*` functions compute severity themselves; type_mismatch is hardcoded 'high' (profilingService.js:339).
- BUG-4: Null-spike deviation divides by `averageNullPercentage`, which gives Infinity or NaN if the average is 0 (anomalyService.js:250). The numeric insert failure is swallowed (profilingService.js:279-282). Not run-verified. This is rare: the baseline includes the current file, so the average is 0 only when the file does not match its pattern or is older than 7 days. Numeric overflow above 99,999,999.99 (e.g. a tiny non-zero average) is a second route to the same swallowed failure (profilingService.js:279).
- BUG-5: Python `resolve_anomaly` returns True even when no row matched (anomaly_service.py:296-316).
- BUG-6: The `||` threshold fallback (anomalyRulesEngine.js:147-149) makes a configured 0 become the default.
- BUG-7: The `_calculate_severity` 'low' return is unreachable, since a value is only evaluated when `z > threshold`.
- BUG-8: The statistics route's `by_type` is capped at 10 and counts only open anomalies, but is not labelled as such in the response (anomalyRoutes.js:114-121).
- BUG-9: The `detect_schema_anomalies` divide by `expected_columns` is not guarded against 0 (anomaly_detector.py:291).
- BUG-10: The inline schema drift writer uses undeclared `sourceFileId` and `sourceName` (jobExecutionEngine.js:1606-1607), so it throws a ReferenceError caught at :1621 and the row is never written. It also uses status 'active' (:1617), which no reader filters on.
- BUG-11: Failure coupling. An exception in anomaly detection marks an already-processed file as failed (jobExecutionEngine.js:2153, :2170-2171; anomalyRulesEngine.js:195-198).
- BUG-12: profileFile runs all four checks regardless of which rules are enabled (anomalyRulesEngine.js:142-145; profilingService.js:372-437).
- BUG-13: The Python baseline includes the current row because profile_api.py commits the metrics at :325 before detecting at :331-349. The JS numeric and row-count baselines also include the current file (profilingService.js:34-57).
- BUG-14 (high): etlProfilingService.js:122 and :355 call `profileFile(pool, {fileId, filename, ...})` with a single object, but the signature is positional `(pool, fileId, filename, filePattern, options)` (profilingService.js:372). `fileId` becomes the object, `filename` and `filePattern` are undefined, and `options` is `{}`. Every check returns [] (per-check errors are swallowed), and `saveProfilingMetrics` finds no file row and returns early. The ETL-path anomaly checks are therefore inert. Only the call at anomalyRulesEngine.js:154 passes the arguments correctly.

### DUPLICATE
- DUP-1: Two anomaly pipelines write to the same table with different `anomaly_type` vocabularies and ID formats. JS uses 'schema_drift', 'numeric_deviation', 'row_count_anomaly', 'null_spike', 'type_mismatch'. Python uses 'statistical_outlier', 'range_violation', 'trend_deviation', 'quality_degradation', 'schema_mismatch'. A third inline writer (jobExecutionEngine.js:1598) duplicates the schema_drift insert with a different severity rule and status.
- DUP-2: `resolveAnomaly` is implemented three times, in anomalyRoutes.js:152, anomalyService.js:338 and anomaly_service.py:276. The route rejects blank notes, but the others do not check.
- DUP-3: Healing recommendation generation exists in both JS (healingRoutes.js:73) and Python (healing_recommender.py:12), with the same thresholds and ids. The Python class is constructed in `AnomalyService.__init__` (anomaly_service.py:33); no HTTP route calls it.
- DUP-4: Statistics exist three times: the route (anomalyRoutes.js:84), `getAnomalyStatistics` (anomalyRulesEngine.js:250) and Python `get_anomaly_statistics` (anomaly_service.py:323). They have different shapes.
- DUP-5: The anomaly list exists in the route (anomalyRoutes.js:9), `getOpenAnomalies` (anomalyService.js:284) and Python `get_recent_anomalies`.
- DUP-6: Schema drift IDs and severity rules exist in anomalyService.js:21-31 and jobExecutionEngine.js:1583-1595.

### DEAD
- DEAD-2: `getOpenAnomalies` and `resolveAnomaly` in anomalyService.js have no callers in repo JS (grep: definitions and exports :362-370 only).
- DEAD-3: `detect_trend_anomalies` and `detect_schema_anomalies` are not called by `analyze_file_profile`.
- DEAD-4: `axios` is imported but unused in healingRoutes.js:3.
- DEAD-5: DEFAULT_RULES `duplicate_detection` and `completeness_check` are disabled by default and `executeAnomalyDetection` has no code path for them (anomalyRulesEngine.js:142, 168).
- DEAD-6: Python `get_recent_anomalies`, `get_anomaly_statistics` and `resolve_anomaly` have no caller in profile_api.py (grep of that file only). The `severityCounts` variable in `saveProfilingMetrics` is unused (profilingService.js:449-453).
- Retracted: the earlier DEAD-1 (Python AnomalyService, AnomalyAnalyzer, HealingRecommender have no callers) was wrong; they are live via profile_api.py:331-352.

### UNCLEAR
- UNCLEAR-1: The anomaly routes are registered inside the `try` block of retention-policies. A failure in the retention routes require would prevent the ML routes from being registered (server.js:5400-5414). The success log mentions only retention.
- UNCLEAR-2: `suggestRuleAdjustments` only ever suggests increasing a threshold, though the code comment says "Suggest disabling rules" (anomalyRulesEngine.js:320).

## Domain terms
- anomaly / anomaly_id (string key, vs numeric `id`).
- severity: low, medium, high, critical.
- status: open, resolved, active (intended by the inline writer, jobExecutionEngine.js:1617).
- anomaly types: see DUP-1.
- sensitivity (low, medium, high).
- mapping rules / anomaly_rules.
- schema drift (JS) vs schema mismatch (Python).
- healing recommendation / "action_type" / "action_params".
- statistical outlier vs numeric_deviation vs trend_deviation (overlapping meaning).
- null spike.
- quality degradation.
- resolution notes.

## Open questions
1. (Closed: vendor_profile is unauthenticated at Flask and via the production proxy; see entry 7 and SEC-6.)
2. (Closed: `getAnomalyStatistics`, `suggestRuleAdjustments`, `getOpenAnomalies` and `resolveAnomaly` have no callers in JS or JSX.)
3. Where does the intended resolver identity come from (see BUG-1)?
4. Is the `critical` severity meant to exist in the product? The Python code and the frontend use it, while the JS code does not.
5. Is status 'active' (jobExecutionEngine.js:1617) meant to be a distinct state from 'open'?
6. (Closed: etlProfilingService passes an object to a positional signature; see BUG-14.)
