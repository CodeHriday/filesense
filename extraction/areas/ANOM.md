# ANOM - Anomaly detection & healing

## Summary
Anomalies live in one table, `anomalies`. Two separate producers write to it:
- A JS pipeline: `jobExecutionEngine` -> `anomalyRulesEngine.executeAnomalyDetection` -> `profilingService` / `anomalyService.log*` (backend/services/anomalyRulesEngine.js:120, backend/services/jobExecutionEngine.js:9).
- A Python ML pipeline (z-score, IQR, moving average, quality comparison, schema comparison) in backend/ml/anomaly_detector.py and anomaly_service.py. No JS or Python in backend/ calls `AnomalyService`, apart from the package `__init__` (backend/ml/__init__.py:14,38). PROF.md:75 says profiling uses it, but I found no caller in backend/ (see Open questions).

Five HTTP endpoints read, resolve and recommend. They are mounted at `/api/ml` (server.js:5406, 5410) and have no auth middleware. Other routes in server.js use `authenticateToken` (e.g. server.js:5171). The frontend page /anomalies (src/pages/Anomalies.jsx) uses all of them.

## Entry points

### 1. GET /api/ml/anomalies (backend/routes/anomalyRoutes.js:9)
- Caller: none. No auth middleware is applied at mount (server.js:5405-5406).
- Inputs (query): `severity`, `status`, `anomaly_type`, `limit` (default 100). There is no validation. `parseInt(limit)` is applied at :61 with no cap, so a NaN limit would reach SQL.
- Output: `{success:true, anomalies:[rows]}`, ordered by `detected_at DESC` (:60).
- Errors: 500 `{success:false, error:'Failed to fetch anomalies', details: err.message}` (:72-76). The raw DB error message is leaked.
- Side effects: none. Filters are parameterised.

### 2. GET /api/ml/anomalies/statistics (anomalyRoutes.js:84)
- Caller: none.
- Output: `by_status` (all statuses), `by_severity` (open only, :103), `by_type` (open only, top 10 by count, :117-120), `total_open` (`by_status.open || 0`), `total_resolved` (`by_status.resolved || 0`) (:129-136).
- Errors: 500 with `details`.

### 3. POST /api/ml/anomalies/:anomaly_id/resolve (anomalyRoutes.js:152)
- Caller: none.
- Input: body `resolution_notes`, required and non-blank, else 400 'Resolution notes are required' (:157-162).
- Resolver identity: `req.user?.userId || req.user?.id || 'system'` (:164). Because no auth middleware runs, `req.user` is normally unset, so `resolved_by` is always 'system' (see BUG-1).
- Effect: `UPDATE anomalies SET status='resolved', resolved_at=NOW(), resolved_by, resolution_notes WHERE anomaly_id=$3 RETURNING *` (:166-174).
- The update has no check of the current status. A resolved anomaly can be re-resolved, which overwrites the earlier resolver, notes and time.
- Output: 404 'Anomaly not found' if rowCount is 0 (:178); otherwise `{success:true, anomaly}`.
- Logs an `Anomaly resolved` info line (:185).

### 4. GET /api/ml/anomalies/file/:file_id (anomalyRoutes.js:209)
- Caller: none.
- Input: optional `status` query.
- Output: all anomalies for the file with no limit, `detected_at DESC` (:247). No ownership check.

### 5. GET /api/ml/recommendations/:anomaly_id (backend/routes/healingRoutes.js:10)
- Caller: none.
- Flow: loads the anomaly (404 if missing, :39), then `generateRecommendations` (:73) builds a hard-coded list by `anomaly_type`. Nothing is stored. The function sorts by priority with order critical 0, high 1, medium 2, low 3 (:373-376).
- Output: `{success, anomaly_id, recommendations}`.
- Priority rules (literal values):
  - `statistical_outlier`: add_validation_rule is 'high' if `z_score > 4`, else 'medium' (:86). investigate_source is 'high' if `z_score > 5` (:117).
  - `range_violation`: 3 fixed recommendations (:128-180).
  - `trend_deviation`: monitoring is 'high' if `deviation_pct > 100` (:189).
  - `quality_degradation`: detailed_profiling is 'critical' if `degradation_pct > 50`, else 'high' (:223). validation_rules uses `min_acceptable_score: parseFloat(expected_value || 80)` (:261).
  - `schema_mismatch`: branches on `details.mismatch_type` ('column_count' or 'data_types') (:271, :289), then always adds create_mapping and document_schema (:322-352).
  - default: one 'manual_review' item with `impact:'unknown'` (:355-369).
- `axios` is imported (healingRoutes.js:3) and never used.
- Frontend: `HealingRecommendations.jsx:24` calls the endpoint. Its `handleActionClick` (:75) switches on `action_type`. Non-manual actions get an action button. For unhandled actions the default branch is an `alert()` that prints the JSON (:139). See Open questions for the rest of the switch.

### 6. FE route /anomalies (src/pages/Anomalies.jsx; route at src/App.jsx:442 per inventory.md:817)
- The page calls GET anomalies, GET statistics and POST resolve (:42, :54, :79).
- The default filter is `status:'open'` (:18).
- The severity stat cards include `critical` (:140). The JS-side producers never emit 'critical' (see BUG-2). Only the Python detector does.

## Detection logic (non-HTTP producers)

### Python detector (backend/ml/anomaly_detector.py)
Sensitivity table (:36-40):

| Sensitivity | z_score | iqr_multiplier | deviation_pct |
|---|---|---|---|
| low | 3.5 | 3.0 | 50 |
| medium | 3.0 | 2.5 | 30 |
| high | 2.5 | 1.5 | 20 |

An unknown sensitivity string raises KeyError. Callers pass 'medium' by default.

- **Z-score** (:44): needs at least 3 values (:61) and std not 0 (:68). It fires when `|z| > threshold`. Type is `statistical_outlier`. Severity is `ratio = z/threshold`: above 1.5 critical, above 1.2 high, above 1.0 medium (:323-332). The 'low' branch is unreachable.
- **IQR** (:94): needs at least 5 values and iqr not 0. Bounds are `q1 - m*iqr` and `q3 + m*iqr`. Type is `range_violation`. Severity by distance in IQRs: above 3 critical, above 2 high, above 1 medium (:347-353).
- **Trend** (:148): `window_size` 5, needs at least `window+2` rows. It compares each row to its rolling mean and fires when deviation_pct exceeds the threshold. Severity: above 100 critical, above 50 high, above 30 medium (:357-363). It is not wired into `analyze_file_profile`.
- **Quality degradation** (:198): needs at least 3 history rows. Dimensions are overall, completeness, consistency and validity scores. It fires when `degradation > 10` points AND `degradation_pct > 15` (:238). Severity: above 50 critical, above 30 high, above 15 medium (:367-373).
- **Schema** (:257): a column count mismatch is 'high' and a type mismatch is 'medium'. Not wired into `analyze_file_profile`. `abs(a-e)/expected_columns` divides by zero if `expected_columns` is 0 (:291).
- **Orchestration** (backend/ml/anomaly_detector.py:393): lookback is 30 days and history is capped at 100 rows (:495-511). With no history, no detection runs (:416-418). It checks `row_count` by z-score, `column_count` by IQR, and quality scores.
- **Storing** (backend/ml/anomaly_service.py:45): `anomaly_id` is `str(uuid.uuid4())`, status is 'open', and `detected_at` is `datetime.now()` in app-server local time (:89, :127-128). It commits once at the end and rolls back and re-raises on error.
- **`resolve_anomaly`** (backend/ml/anomaly_service.py:276) returns True even if no row matched.
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
- Severity configured in rules is ignored by the `log*` functions, which compute their own (see BUG-3).
- `validateRules` (:206): threshold must be 0-100, severity must be low, medium or high, and `enabled` must be boolean. The validators are invoked from backend/routes/transformations.js:7 (import only confirmed).
- `getAnomalyStatistics(mappingId, days=30)`, `suggestRuleAdjustments`: suggests a +5 threshold increase when a type has more than 20 anomalies and a resolution rate above 0.8 (:322). For types with no threshold, `suggestedThreshold` is null. Whether any route calls these is unconfirmed.

### JS loggers (backend/services/anomalyService.js)
- **IDs**: `DRIFT-<Date.now()>-<8 hex uuid>` (:21), or `<TYPE-UPPER>-<ms>-<uuid8>` (:104). The Python producer uses a plain uuid, so the two ID formats differ.
- **Schema drift severity** (:24-31): 'high' if `columnCountMismatch` or any modified column; 'medium' if more than 2 columns were added or removed; else 'low'. The type is 'schema_drift'. Python uses 'schema_mismatch' for the same concept.
- **Numeric deviation** (:153-161): default threshold 10. Severity is high above `3*threshold`, medium above `threshold`, else low.
- **Row count** (:201-209): default threshold 15. High above `2*threshold`, medium above `threshold`, else low.
- **Null spike** (:247-255): default threshold 20. Severity is 'high' if `nullPercentage > 50`, else 'medium'. The `threshold` argument is not used to decide severity.
- **`getOpenAnomalies` and `resolveAnomaly`** (:284, :338): the SQL is parameterised. `resolveAnomaly` uses `CURRENT_TIMESTAMP`. No callers were found for either function (see DEAD-2).

## Data touched
- Table `anomalies`, with the columns listed at anomalyRoutes.js:15-34. Statuses seen in code: 'open' and 'resolved'. Severities seen: critical, high, medium, low.
- Table `profiling_metrics` (read by Python, backend/ml/anomaly_detector.py:507).
- Table `transformation_mappings.anomaly_rules` (read and written, anomalyRulesEngine.js:66, 98).
- Table `files.schema_definition` (read, anomalyRulesEngine.js:170).
- Migration: createETLTransformationTables.js:147, per inventory.md:949.

## Flags

### SECURITY
- SEC-1: All 5 endpoints are unauthenticated (server.js:5405-5410, with no `authenticateToken`). Anyone can list every anomaly, across all files and mappings, and see file names.
- SEC-2: The write endpoint (resolve) is also unauthenticated (anomalyRoutes.js:152). There is no role check and no ownership check.
- SEC-3: Raw `err.message` is returned as `details` in 500 responses (anomalyRoutes.js:75, 143, 200, 261; healingRoutes.js:62).
- SEC-4: There is no ownership or tenant scoping on any query. `file_id` and `anomaly_id` are used directly.
- SEC-5: The `limit` parameter is unbounded (anomalyRoutes.js:61).

### BUG
- BUG-1: `resolved_by` is always 'system' in practice. The route reads `req.user`, but there is no auth middleware, so the resolver identity is never captured (anomalyRoutes.js:164).
- BUG-2: Severity vocabulary is inconsistent. The Python detector emits 'critical' (anomaly_detector.py:327). The JS loggers and `validateRules` allow only low, medium and high (anomalyRulesEngine.js:232). `getAnomalyStatistics.bySeverity` has no 'critical' key, so `stats.bySeverity['critical'] += n` yields NaN (anomalyRulesEngine.js:274-298).
- BUG-3: The per-rule `severity` setting in DEFAULT_RULES and saved `anomaly_rules` is never used when logging. The `log*` functions compute severity themselves.
- BUG-4: Null-spike deviation divides by `averageNullPercentage`, which gives Infinity or NaN if the average is 0 (anomalyService.js:250).
- BUG-5: Python `resolve_anomaly` returns True even when no row matched (anomaly_service.py:296-316).
- BUG-6: The `||` threshold fallback (anomalyRulesEngine.js:147-149) makes a configured 0 become the default.
- BUG-7: The `_calculate_severity` 'low' return is unreachable, since a value is only evaluated when `z > threshold`.
- BUG-8: The statistics route's `by_type` is capped at 10 and counts only open anomalies, but is not labelled as such in the response (anomalyRoutes.js:114-121).
- BUG-9: The `detect_schema_anomalies` divide by `expected_columns` is not guarded against 0 (anomaly_detector.py:291).

### DUPLICATE
- DUP-1: Two anomaly pipelines write to the same table with different `anomaly_type` vocabularies and ID formats. JS uses 'schema_drift', 'numeric_deviation', 'row_count_anomaly', 'null_spike', 'type_mismatch'. Python uses 'statistical_outlier', 'range_violation', 'trend_deviation', 'quality_degradation', 'schema_mismatch'.
- DUP-2: `resolveAnomaly` is implemented three times, in anomalyRoutes.js:152, anomalyService.js:338 and anomaly_service.py:276. The route rejects blank notes, but the others do not check.
- DUP-3: Healing recommendation generation exists in both JS (healingRoutes.js:73) and Python (healing_recommender.py:12), with the same thresholds and ids. The Python class is not called.
- DUP-4: Statistics exist three times: the route (anomalyRoutes.js:84), `getAnomalyStatistics` (anomalyRulesEngine.js:250) and Python `get_anomaly_statistics` (anomaly_service.py:323). They have different shapes.
- DUP-5: The anomaly list exists in the route (anomalyRoutes.js:9), `getOpenAnomalies` (anomalyService.js:284) and Python `get_recent_anomalies`.

### DEAD
- DEAD-1: Python `AnomalyService`, `AnomalyAnalyzer` and `HealingRecommender`. No call sites were found in backend/ outside of `__init__`. See Open questions on whether a caller exists elsewhere.
- DEAD-2: `getOpenAnomalies` and `resolveAnomaly` in anomalyService.js. Not verified as exported-but-unused beyond the exports list (:362-370).
- DEAD-3: `detect_trend_anomalies` and `detect_schema_anomalies` are not called by `analyze_file_profile`.
- DEAD-4: `axios` is imported but unused in healingRoutes.js:3.
- DEAD-5: DEFAULT_RULES `duplicate_detection` and `completeness_check` are disabled by default and `executeAnomalyDetection` has no code path for them (anomalyRulesEngine.js:142, 168).

### UNCLEAR
- UNCLEAR-1: The anomaly routes are registered inside the `try` block of retention-policies. A failure in the retention routes require would prevent the ML routes from being registered (server.js:5400-5414). The success log mentions only retention.
- UNCLEAR-2: `suggestRuleAdjustments` only ever suggests increasing a threshold, though the code comment says "Suggest disabling rules" (anomalyRulesEngine.js:320).

## Domain terms
- anomaly / anomaly_id (string key, vs numeric `id`).
- severity: low, medium, high, critical.
- status: open, resolved.
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
1. Who calls the Python `AnomalyService` (PROF.md:75 says profiling does)? No JS or Python call sites were found in backend/ via grep, apart from the package `__init__`. A call from outside backend/, a subprocess, or a shell script is not ruled out.
2. How do `profilingService.profileFile` (imported at backend/services/profilingService.js:7) and `detectSchemaDrift` work, and where is `getAnomalyStatistics` or `suggestRuleAdjustments` called? Not traced here.
3. Is a global auth middleware applied to `/api/ml` elsewhere in server.js? A grep found `authenticateToken` only on other mount lines. I did not read all of server.js.
4. What does `handleActionClick` in HealingRecommendations.jsx do for each `action_type` (:75-139)? Only the default `alert` branch was seen.
5. Where does the intended resolver identity come from (see BUG-1)?
6. Is the `critical` severity meant to exist in the product? The Python code and the frontend use it, while the JS code does not.
7. The `anomalies` table schema, constraints and indexes (migration at createETLTransformationTables.js:147) were not read.
8. Does `jobExecutionEngine` run anomaly detection on every job, or only under certain conditions?
