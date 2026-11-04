# DQ - Data quality rules & checks

Paths are relative to the repo root. `S` = `server.js`, `QR` = `backend/routes/qualityRules.js`, `ENG` = `backend/services/qualityValidationEngine.js`.

## Summary

The area has two separate things that are both called "quality".

1. **Rule-based quality.** Rules are stored in `quality_rules`, assigned to files in `file_quality_rules` (with target columns), and run against the rows cached in `file_preview_data`. Violations are stored in `quality_rule_violations`.
   - Rule CRUD lives in `QR`.
   - Per-file assign, run, revalidate and violation views live in `S` (6811-8597).
   - A separate engine class (`ENG`) is used by the file-processing worker (`backend/workers/fileProcessingWorker.js:1285`, persist at :1338), by `backend/services/schemaRuleEnforcer.js` (:701, :1262; persist at :728, :1297), and for validation by the ETL job engine's mapping-rule step (`backend/services/jobExecutionEngine.js:3768`). It is not called by any DQ HTTP handler.
   - The ETL job engine has two DQ steps. The mapping-rule step (`jobExecutionEngine.js:3716-3938`) does not use `ENG.persistViolations`; it has its own local `persistViolations(pool, jobId, fileId, violations)` (`jobExecutionEngine.js:1001`, called at :3847). The second step, `enforceSchemaRulesForJob` (`jobExecutionEngine.js:3464`, imported at :19), goes through `schemaRuleEnforcer.js:1262`/`:1297` and does use `ENG.persistViolations` with context `'job_execution'`. See "Library" below.
2. **Profile-based score.** `quality_helper.js` computes a weighted 5-dimension score from `file_columns` stats. The result is stored in `files.quality_score` and `file_quality_checks`. Other score variants exist: a hardcoded "check" endpoint that also writes `file_quality_checks`, `quality_checks.py` (Python, two variants, used by `profile_api.py`), and the ETL job engine, which writes another one (see Library).

The same rule logic is implemented three times in the HTTP/engine code (`S` run, `S` revalidate, `ENG`), plus the ETL job path that reuses `ENG` with its own overrides. They do not agree (see Flags).

Users who are not admins see only rules for projects they can access, plus global rules (`project_id IS NULL`), on `/init-data` only (`QR:185-217`). No other rule endpoint checks project or file access.

Authentication: `server.js:5283` `app.use('/api/files', authenticateToken, schemaHistoryRoutes)` is registered before the file-level DQ routes and applies to every `/api/files/*` request. All file-level DQ routes are therefore authenticated, but none has an ownership or project check. `/api/quality-rules` is mounted with `authenticateToken` at S:5319.

## Entry points

### HTTP: `server.js`

#### GET /api/files/:fileId/quality-violations (S:6811)
- **Auth:** no route-level `authenticateToken`, but `authenticateToken` is applied to all `/api/files/*` by `S:5283`, so the caller must be logged in. No ownership or project check.
- **Input:** `fileId` path param only.
- **Reads:** `files` (404 `{error:'File not found'}` if absent, S:6816-6820); `quality_rule_violations` joined to `quality_rules` (S:6823-6846); `file_quality_rules` joined to `quality_rules` (S:6851-6859).
- **Order:** violations are ordered `qrv.severity DESC, qrv.created_at DESC` (S:6845). `severity` is a string, so DESC is alphabetical: warning, error, critical. This is not severity order.
- **Rule status per applied rule (S:6904-6915):**
  - violation count > 0 gives `'failed'`.
  - no violations and `last_run_at` is null gives `status = null` ("Not Run").
  - no violations and `last_run_at` set gives `'passed'`.
- **Response:** `{fileId, filename, summary, violations, applied_rules}`.
  - `summary` holds: `total_rules_applied`, `total_violations`, `violations_by_severity {critical,error,warning}`, `violations_by_rule_type`, `violations_by_column`, `rules_passed`, `rules_failed`.
  - A rule with 0 violations and no `last_run_at` is counted in neither passed nor failed.
- **Errors:** 500 `{error:'Failed to fetch quality violations'}`.
- **No pagination.** All violations are returned.

#### POST /api/files/:fileId/quality-rules/run (S:6937)
- **Auth:** `authenticateToken`. No role, permission or ownership check on the file.
- **Input:** `fileId` only. No body.
- **Steps:**
  1. Load `files(file_id, filename, row_count)`. 404 if absent (S:6943-6946).
  2. Load assigned rules where `qr.enabled = true` (S:6950-6957). If none: 200 `{success:true, message:'No quality rules assigned to this file', violations_found:0, rules_executed:0}` (S:6959-6965).
  3. Load ALL rows from `file_preview_data` ordered by `row_number` (S:6969-6974). There is no row cap in this endpoint.
  4. Resolve each target column to an actual header in 3 steps (S:7014-7031):
     - exact match;
     - normalised match (lower-case, strip `[\s_-]+`);
     - case-insensitive match.
     - Unresolved columns are logged and skipped.
  5. Run each rule (details below).
  6. In one transaction (S:7535-7586): delete violations for evaluated rule ids only; insert new violations in batches of 100; set `file_quality_rules.last_run_at = NOW()` for evaluated ids only.
- **Rule dispatch.**
  - A rule with no target columns is skipped, except `record_count` (S:7058).
  - `COLUMN_SWITCH_TYPES` (S:7045-7050) are: `null_check, column_completeness, email_validity, phone_validity, date_format, timestamp_format, isna_check, numeric_only_string, special_character_presence, validity`.
  - `duplicate_check`, `uniqueness` and `record_count` are handled after the column loop.
  - A rule counts as "evaluated" only if one of its target columns resolves (and, for `uniqueness`/`duplicate_check`, if at least one column resolves).
  - Other `rule_type` values (`completeness`, `consistency`, `freshness`, `validity_check`, `length_check`, `range_check`) match no case. They are never evaluated, never stamped, and stay "Not Run" (see Flags).
- **Per-type rules (literal values):**
  - `null_check` / `column_completeness`: violation if value is `null`, `undefined` or `''` (S:7097-7111).
  - `email_validity`: only string values are checked. Regex `/^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{1,63}$/` (S:7116).
  - `phone_validity`: strings only. Violation if digits-only length < 10 (S:7127-7131).
  - `date_format`: uses the `validateDateFormat` helper (S:192). Year must be 1900-2100 (S:262). It validates month, day-in-month and leap years (S:271-289).
  - `timestamp_format`: takes the part before the first `T` or whitespace and validates it as a date. Then `new Date(value)` must not be NaN (S:7156-7175).
  - `isna_check`: violation for null/undefined, empty, whitespace-only, or case-insensitive match to the list `na, n/a, none, null, -, --, ., ..., empty, blank, unknown, undefined, nil, #n/a, #na, nan` (S:7188-7190).
  - `numeric_only_string`: violation if trimmed value matches `/^\d+$/` (S:7217). The comment says "optionally with decimal point", but the regex does not allow one.
  - `special_character_presence`: violation if value contains any character outside `[a-zA-Z0-9\s.,'\-]` (S:7234).
  - `validity` (S:7252-7353): the sub-type is read from `rule_config.validity_type`.
    - `datatype`: values `date`, `datetime`, `email`, `phone`, `integer`, `float`/`number`, `boolean`. Boolean accepts `true, false, 1, 0, yes, no` (S:7314). `string` always passes.
    - `pattern`: invalid regex is silently skipped (S:7328). There is no regex-safety check here (`ENG` has one).
    - `range`: `min`/`max` are checked in an if / else-if, so a value is flagged for one side only. Non-numeric values are skipped.
    - `enum`: case-insensitive match against `allowed_values`.
  - `duplicate_check` (S:7377-7417): checked per target column independently. Null/blank values are skipped. Comparison is case-insensitive (`toLowerCase`). Every occurrence after the first is a violation.
  - `uniqueness` (S:7497-7527): composite key is the resolved columns joined with `'||'`. Null becomes `''`, so rows with blank values collide. Comparison is case-sensitive. This is unlike `duplicate_check` and unlike `ENG`.
  - `record_count` (S:7420-7494): `operator` defaults to `'exactly'`, `tolerance_percent` to 0. `actualCount` is `files.row_count`, falling back to the preview row count.
    - `exactly`: tolerance is `ceil(expected * tol / 100)`; violation if `abs(actual - expected) > tolerance`.
    - `at_least`: threshold is `floor(expected * (1 - tol/100))`.
    - `at_most`: threshold is `ceil(expected * (1 + tol/100))`.
    - `between`: uses `min_count`/`max_count`, with no tolerance.
    - An unknown operator produces no violation but the rule is still stamped as evaluated.
- **Violation record:** `actual_value` is cut to 500 characters. Severity is `rule.severity || 'warning'`. Violations are stored without `primary_key_*`, `job_id` or `record_snapshot`.
- **Response:** `{success, message:'Quality rules executed successfully', rules_executed, violations_found, column_rules_skipped_no_preview, column_rules_column_not_found, violations_by_rule[]}`.
  - `rules_executed` is the number of enabled assigned rules, not the number evaluated.
- **Errors:** 500 `{error:'Failed to run quality rules', details: err.message}` (S:7618). The raw error message is returned to the caller.
- **Callers (UI):** `src/pages/DataProfile.jsx:1489` (run) and `:1617` (revalidate).

#### POST /api/files/:fileId/quality-rules/revalidate (S:7624)
- **Auth:** `authenticateToken` and multer `upload.single('file')`. No role, project or ownership check. Any authenticated user can replace the preview data and stored row count of any file.
- **Input:** multipart `file`.
  - Only `.csv` and `.json` are accepted (S:7667-7738). Other types give 400 `Unsupported file type`.
  - No file gives 400 `No file uploaded`.
  - Unknown fileId gives 404, and the uploaded file is deleted.
- **Virus scan:** `VirusScanService.scanFile`. If infected: 400 `Virus detected`. If the scanner throws, the scan is skipped with only a warning and processing continues (S:7659-7661). This fails open.
- **Parsing:**
  - CSV uses `csv-parser`. Headers are trimmed. Whitespace-only cell values become `null`. Other string values are trimmed (S:7696-7709).
  - JSON is read fully with `readFileSync`. A single object becomes a one-row array.
  - Only the first **10,000** rows are kept for column-level validation (S:7686, S:7728). `totalRowCount` counts all rows.
  - The uploaded temp file is deleted after parsing.
- **Replace preview data (transaction):** deletes all `file_preview_data` for the file and inserts the parsed rows in batches of 100. It then sets `files.row_count = totalRowCount, column_count = columnNames.length, updated_at = NOW()` (S:7744-7785).
  - The original stored file is not replaced. Only the preview rows and counts change.
  - The row data is committed before rules are run. A later failure leaves the new preview in place.
- **Rules:** same selection as run. If none are assigned: 200 `File uploaded but no quality rules assigned`.
  - If there are 0 parsed rows and no `record_count` rule: 400 `Empty file` (S:7810). Note this check comes after the preview and `files` rows were already overwritten.
- **Rule logic:** a copy of the run logic with differences:
  - `record_count` uses `totalRowCount`.
  - Cell values are whitespace-normalised to null on CSV (not so in run).
  - `isna_check` and `numeric_only_string` therefore behave differently from run on CSV input.
- **Persist:** deletes ALL violations for the file (`DELETE ... WHERE file_id = $1`, S:8330), including those of rules not evaluated. This differs from run, which scopes the delete to evaluated rules. It stamps `last_run_at` for evaluated rules only (S:8356-8364).
- **Response:** `{success, message, rows_processed: totalRowCount, rules_executed, violations_found, violations_by_rule[{rule_id, rule_name, rule_type, target_columns, violations, status:'failed'|'passed'}]}`.
  - `status` here is `'passed'` for any rule with 0 violations, even one that was not evaluated. This differs from `quality-violations`.
- **Errors:** 500 `{error:'Failed to revalidate file', details}`.

#### GET /api/files/:fileId/quality-rules (S:8415)
- **Auth:** `authenticateToken`. No ownership check.
- **Reads:** 404 if file is missing. Returns `assigned` (rule id/name/type/severity/description/enabled, `assigned_at`, `target_columns`, `is_schema_enforced`, S:8426-8433), and `available` = enabled rules with `project_id IS NULL OR project_id = file.project_id` (S:8436-8442). It also returns `assignment_version` from `file_assignment_versions` (default 0).
- **Errors:** 500.

#### POST /api/files/:fileId/quality-rules (S:8464)
- **Auth:** `authenticateToken`. No ownership check.
- **Input:** `{rule_ids: array (required, else 400), column_assignments: {ruleId: [cols]} (default {}), client_base_version?, write_nonce?, is_pagehide?}`.
- **Not found:** 404 `{error:'File not found'}` if the file does not exist (S:8474-8477).
- **Rule:** replace-all assignment. All `file_quality_rules` rows for the file are deleted and re-inserted with `target_columns = column_assignments[ruleId] || []` (S:8545-8557).
  - The delete removes every assignment, including rows with `is_schema_enforced` set by `schemaRuleEnforcer.js`.
  - `rule_ids` are not checked for existence or enabled state (a foreign-key failure would give 500).
  - The inserted rows have no `last_run_at`, so previous run status is lost.
- **Optimistic concurrency (only when `client_base_version !== undefined`, S:8490):** locks the `file_assignment_versions` row with `FOR UPDATE`.
  - If the client version equals the stored version, the new version is stored + 1.
  - If `is_pagehide === true`, client + 1 equals stored, and `write_nonce` equals the stored nonce, it is accepted (1-hop lookahead) (S:8509-8523).
  - Otherwise: ROLLBACK and 409 `{error:'Conflict: assignments were modified by a concurrent write', current_version, assigned}`.
  - Without `client_base_version`, there is no version check and the version is not advanced.
- **Response:** `{success, message:'N quality rule(s) assigned to file', assigned, new_version?}`. Errors: 500.

#### GET /api/files/:fileId/quality (S:9828)
- **Auth:** no route-level `authenticateToken`; covered by `authenticateToken` at S:5283 for all `/api/files/*`. No ownership check. Route-level `cacheMiddleware(600)` gives a 10-minute response cache. Cache keys are `cache:<userId|anonymous>:<originalUrl>` (`cacheMiddleware.js:19-24`), so the cache is per user.
- **Side effects in a GET:**
  - `CREATE TABLE IF NOT EXISTS file_quality_checks` (S:9840, S:9887).
  - `UPDATE files SET quality_score` (S:9881).
  - Inserts 5 `file_quality_checks` rows if none exist for the file (S:9907-9968).
- **Score:** `calculateQualityScore` from `quality_helper.js` (see below). Columns come from `file_columns`: `unique_count`, `null_count`, `min_value`, `max_value`.
- **Check status rule:** score >= 90 is `'passed'`; >= 70 is `'warning'`; else `'failed'` (S:9914 etc.).
- **Check names:** `Missing Values Check`, `Data Type Consistency`, `Value Range Check`, `Uniqueness Check`, `Data Freshness Check` (types: completeness, consistency, validity, uniqueness, timeliness).
- **Staleness:** once check rows exist, they are returned as stored. The returned `qualityScore` is freshly computed but `checks` are not. They only refresh via `/recalculate` or `/check`.
- **Response:** `{fileId, filename, qualityScore, scoringMethod:'weighted_average', checks[], summary{passed,warning,failed}}`. 404 if file missing. 500 on error.

#### POST /api/files/:fileId/quality/recalculate (S:10009)
- **Auth:** `authenticateToken`. No ownership check.
- **Rule:** 404 if file missing. 400 `No column data found for this file` if `file_columns` is empty (S:10028-10033). Otherwise it recomputes using `quality_helper.js`.
  - Sets `files.quality_score` and `updated_at`.
  - Deletes and recreates the 5 check rows. The delete and inserts are not in a transaction.
- **Response:** the quality object plus `components` and `weights`. 500 uses `sanitizeError`.

#### GET /api/files/:fileId/insights (S:11456)
- **Auth:** `authenticateToken`, plus a permission check `req.user.permissions.some(p => p.name === 'insight_view')` giving 403 `You do not have permission to view insights` (S:11461-11464). Response is cached 600s, per user (`cacheMiddleware.js:19-24`).
- **Reads:** `files`, `file_columns`, latest `file_profiles`, latest `file_quality_checks` row.
- **Response:** `{summary, columnInsights[] (recommendations always []), qualityInsights, recommendations[3]}`.
  - The three recommendations are fixed text ("Improve Data Quality" high, "Optimize Data Structure" medium, "Review Sensitive Data" high) with `Date.now()` based ids. They are not derived from data (S:11528-11553).
  - `qualityInsights` reads `quality.overall_score`, `completeness_score`, etc. and `JSON.parse(quality.issues)`. These columns do not exist in `file_quality_checks` as created (S:9841-9850: id, file_id, check_type, check_name, status, score, details, created_at). See BUG below.
  - `columnInsights` reads `col.null_percentage` and `col.unique_percentage` from `file_columns`. `null_percentage` exists in the DDL (`database_ddl_2026-01-07.sql:1096`); `unique_percentage` is not in the DDL, so `uniquePercentage` is always undefined.

#### POST /api/files/:fileId/quality/check (S:11564)
- **Auth:** `authenticateToken`. No ownership check.
- **Input:** `{rules=[], anomalyDetection=true, calculateReliabilityScore=true}`. The last two are not used. `rules` is only logged (`Would check rule ...`, S:11655).
- **Rule:**
  - Null check uses `column.null_percentage` from `file_columns`.
  - Dimension scores: `completeness = 100 - null%`; `validity = 95`; `consistency = 90`; `accuracy = 85`, all hard-coded placeholders (S:11634-11636).
  - Overall = `round(c*0.3 + validity*0.25 + consistency*0.25 + accuracy*0.2)` (S:11659-11664).
  - Deletes and recreates 4 `file_quality_checks` rows (completeness, consistency, validity, accuracy). Check statuses other than completeness are always `'passed'`.
  - Overwrites `files.quality_score` with this value (no `updated_at`).
- **Response:** `{file_id, overall_score, dimension_scores, checks, issues, created_at}`. 500 `{error, details: error.message}`.

### HTTP: `backend/routes/qualityRules.js` (mounted at `/api/quality-rules`, S:5319)
All routes use `authenticate` (passed in as `authenticateToken`). **None checks a role, permission, or project access except `/init-data`.** Cache: `cacheService`, TTL `5 * 60` s, prefix `quality_rules` (QR:13-14). All writes call `delPattern('quality_rules:*')` except `DELETE /configurations/:id` (see below).

#### GET /api/quality-rules/ (QR:26)
- **Query:** `project_id, sub_project_id, rule_type, enabled, limit=100, offset=0`.
- **Scope rules:**
  - both ids: `(project = P and sub IS NULL) OR sub = S OR project IS NULL`;
  - `project_id` only: `project = P OR project IS NULL`;
  - `sub_project_id` only: `sub = S OR project IS NULL`.
- **`enabled` filter:** `enabled === 'true'`, so any other value filters for false.
- **Sort and paging:** `ORDER BY created_at DESC`. `parseInt` on limit and offset has no cap or NaN guard.
- **Response:** `{success, rules, pagination{limit, offset, total, hasMore}}`. 500 on error.
- **Caching:** the response is cached for 5 minutes. Cache is shared across users, so one user's list is served to all callers with the same query. With no filter all rules are returned for any user.

#### GET /api/quality-rules/init-data (QR:167)
- **Rule:** batch of rules + projects + violation summary.
  - Admins (via `userHasAdminAccess`) see everything.
  - Non-admins see rules with `project_id = ANY(accessibleProjectIds) OR project_id IS NULL`. Projects are limited to their accessible ids. If they have no accessible projects, the response is empty (QR:189-196).
  - Summary: per rule, count of violations in the last `days` (default 30) days, top 50 by count (QR:273-303).
- **Response:** `{rules, pagination{total,limit,offset,pages}, projects, summary}`. It has no `success` field and no caching.
- **Errors:** 500 `{success:false, error}`.
- **Caller (UI):** `src/pages/QualityRules.jsx:104`.
- **Bug-like detail:** the count query is built by string-splitting the rules query on `'WHERE 1=1'` and `'ORDER BY'` (QR:307-309).
  - With `sub_project_id` and a non-admin, parameter numbering is shared and works. `countParams` slices off the last two params.
  - Rows where `enabled` is `''` are ignored, unlike `GET /`.
  - Sub-project scope for a non-admin is not intersected with accessible projects (a global rule list is included via `project_id IS NULL`).

#### GET /api/quality-rules/:id (QR:340)
- Returns `{success, rule}` with `created_by_username`. 404 `Quality rule not found`. Cached by id for 5 minutes. No access check.
- `/:id` matches a single path segment only. It does not capture the two-segment path `/violations/summary`. It does capture the single-segment path `/configurations` (see Flags).

#### POST /api/quality-rules/ (QR:391)
- **Body:** `rule_name, rule_type, rule_config` required (400 otherwise). `description, column_name, severity='warning', project_id, sub_project_id` optional.
- **Valid `rule_type`:** `completeness, validity, consistency, uniqueness, freshness, record_count, validity_check, length_check, range_check, date_format, timestamp_format` (QR:413). **Valid severity:** `critical, error, warning`.
- **Rule:** inserts with `created_by = req.user.id`, `rule_config` as `JSON.stringify`. There is no validation of `rule_config` contents, and no check that `project_id` exists or that the caller has access to it.
- **Response:** 201 `{success, rule}`. 500 on error.
- **UI:** `QualityRules.jsx` calls this through the service create/update/delete wrappers.

#### PUT /api/quality-rules/:id (QR:466)
- **Body:** any of `rule_name, rule_type, description, column_name, rule_config, severity, enabled, project_id, sub_project_id`.
- **Rule:** 404 if not found. Validates `rule_type` and `severity` if supplied. 400 `No fields to update` if nothing supplied. Sets `updated_at = CURRENT_TIMESTAMP`.
  - `enabled` is not type-checked.
  - There is no ownership check: any authenticated user can edit or disable any rule, including global ones.
  - Editing a rule changes behaviour for all files that have it assigned.
- **Response:** `{success, rule}`.

#### DELETE /api/quality-rules/:id (QR:616)
- 404 if not found. Deletes the rule. The comments at QR:614 and QR:629 say violations go with it by CASCADE, but this is not supported by code. `database_ddl_2026-01-07.sql:3383` defines `quality_rule_violations_rule_id_fkey REFERENCES quality_rules(id)` and the dump has no `ON DELETE` on it, which is inconclusive. `backend/migrations/createQualityRuleAssociations.js` cascades only the association tables. Whether deleting a rule that has violations succeeds or returns 500 is unknown (see Open questions). No ownership check. Response `{success, message}`.

#### GET /api/quality-rules/violations/summary (QR:662)
- **Query:** `project_id, rule_id, severity, days=30`.
- **Reads:** counts `quality_rule_violations` joined to `quality_rules` since `NOW() - INTERVAL '${parseInt(days)} days'`, grouped by `qr.rule_type, qr.severity`. `affected_entities = COUNT(DISTINCT COALESCE(file_id, job_id))`.
- **Status:** reachable. `GET /:id` (QR:340) matches one segment only, so the two-segment path reaches QR:662. The frontend call at `src/api/qualityRulesService.js:70` works.
- No access scoping; cached.
- **Note:** the severity filter uses `qrv.severity` while the group uses `qr.severity`. These can differ because violations copy severity at run time.

#### GET /api/quality-rules/configurations (QR:741)
- **Query:** `file_id, rule_id, enabled`. Returns `{success, configurations, total}`.
- **Status:** shadowed by `GET /:id` (QR:340), which is registered first and matches the single segment `configurations`. The handler is not reachable.

#### POST /api/quality-rules/configurations (QR:806)
- **Body:** `file_id, rule_id` required; `error_action` must be `'log_continue'` or `'log_abort'`; `apply_to` in `file_upload | etl_job | both` (default `'both'`); `enabled` default `true`.
- **Rule:** 404 if rule not found. Upsert on `(file_id, rule_id)`; the conflict update keeps `created_by`. Returns 201. Invalidates cache.
- **Effect:** read by `ENG.persistViolations` (ENG:850-860). `log_abort` makes the caller throw `QUALITY_ABORT` (ENG:918-923). A configuration applies when `apply_to` is `'both'` or equals the context passed to `persistViolations` (ENG:850-860). Callers pass context `'file_upload'` (`fileProcessingWorker.js:1338`), `'schema_enforcement'` (`schemaRuleEnforcer.js:728`) and `'job_execution'` (`schemaRuleEnforcer.js:1297`). No caller passes `'etl_job'`, so a configuration with `apply_to = 'etl_job'` never matches. Effective scope by value:
  - `'file_upload'` matches only context `'file_upload'` (the file-processing worker).
  - `'both'` matches the worker, `'schema_enforcement'` (schema enforcement) and `'job_execution'` (the ETL job's `enforceSchemaRulesForJob` step, `jobExecutionEngine.js:3464` -> `schemaRuleEnforcer.js:1262`, `:1297`). So `apply_to = 'both'` does affect ETL jobs. In that step a `QUALITY_ABORT` is logged and the job continues (`schemaRuleEnforcer.js:1299-1303`).
  - The ETL job engine's separate mapping-rule step (`jobExecutionEngine.js:3716-3938`) ignores this table (see Library). It does not check that `file_id` exists or that the caller owns it.
- **Status:** reachable (POST is not shadowed by a GET route).

#### DELETE /api/quality-rules/configurations/:id (QR:890)
- Two path segments, so `DELETE /:id` (QR:616) does not match; reachable.
- 404 `Configuration not found`. It deletes the row, then calls `cacheService.invalidatePattern(...)` (QR:907). `backend/services/cacheService.js` defines only `delPattern` (:155); `invalidatePattern` appears nowhere else in the repo. The call throws a TypeError, so the request returns 500 after the row has been deleted (BUG).

### Library / non-HTTP code in this area

#### QualityValidationEngine (ENG)
- **Callers:**
  - `fileProcessingWorker.js:1285` (validate) and `:1338` (persist, context `'file_upload'`).
  - `jobExecutionEngine.js:3768` (validate only; the mapping-rule step persists with its own local function).
  - `schemaRuleEnforcer.js:701` and `:1262` (construct); `:728` (persist, `'schema_enforcement'`) and `:1297` (persist, `'job_execution'`).
  - `BulkProfilingService.js:19` imports `validateDataWithRules`; that name is not exported by this module (see Flags).
- **`validateData(rules, data, metadata)` (ENG:72):**
  - Empty data: only `record_count`/`record_count_match` rules run, and only if `metadata.actual_row_count !== undefined`.
  - Otherwise all rules with `enabled !== false` run. The first row's keys feed `detectPrimaryKeyColumn`.
  - Per-rule exceptions are collected into `errors`, not thrown.
- **`executeRule` (ENG:170):** `rule_type` is lower-cased, then dispatched: `completeness, validity, consistency, uniqueness, freshness, record_count, record_count_match, validity_check, length_check, range_check, date_format, timestamp_format`. Anything else throws `Unsupported rule type`. This includes `null_check`, `isna_check`, `duplicate_check` and the other run-only types; the worker writes those errors to `file_errors` with severity `error`.
- **Primary key detection (ENG:23-63):**
  - Order of patterns: `id`; `*_id`; `*_number`; `*_code`; one of `order|shipment|invoice|customer|product|transaction|record`.
  - Fallback: first column containing `id`, `number` or `code` (substring).
  - Last resort: the first column.
- **Completeness (ENG:208):** `threshold` default 1.0; a value > 1 is divided by 100. A missing value is `null`, `undefined` or a trim-empty string. Violation if `completeness < threshold`. One summary violation per column, not per row. Only `rule.column_name` or `rule_config.columns` are checked.
- **Validity (ENG:303):** needs `column_name` and `rule_config.type` (ENG:306) of `pattern|range|enum|datatype`. Null/empty values are skipped. The pattern goes through `validateRegexSafety` and unsafe patterns are skipped (valid). `enum` is a case-sensitive `includes`. Datatypes: `number, email, phone, date, string`. Email regex `/^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,}$/`. Phone must match `/^[\d\s\-\(\)\+]{7,20}$/` and have at least 10 digits.
- **Consistency (ENG:542):** `cross_field` evaluates `config.expression` with `new Function` (ENG:635) after substituting row values into the string. `format_consistency` compares each row to the format of the first of the first 100 non-empty values (ISO date, US date, or "mixed" which always passes).
- **Uniqueness (ENG:679):** `columns` defaults to `[rule.column_name]`. Rows with any null or `''` key part are skipped. Key is `JSON.stringify` of the values (case-sensitive).
- **Freshness (ENG:765):** `max_age_hours` default 24. Checks `metadata.upload_date`. If `timestamp_column` and `column_name` are set, it checks each row's value in `rule.column_name` (not the `timestamp_column`).
- **Record count (ENG:451):** same operator logic as the HTTP endpoints. `actualCount = metadata.actual_row_count` if defined, else `data.length`. An unknown operator logs a warning and returns no violation.
- **Length check (ENG:1065):** `exact_length` overrides `min_length`/`max_length`. Null is skipped, an empty string is checked. **Range check (ENG:1151):** non-numeric is a violation. `exclusive_min` and `exclusive_max` are supported.
- **Date/timestamp format (ENG:1261):** priority `formats[] > format > pattern > built-in`. A built-in date value must match `YYYY-MM-DD`, `MM/DD/YYYY` or `DD/MM/YYYY`; year 1000-9999, month 1-12, day 1-31, and no calendar rollover. Timestamp built-in is `/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/`. Timestamps are not semantically checked (`rawPattern`). A custom `pattern` is a raw regex.
- **`persistViolations(violations, data, context)` (ENG:836):**
  - One transaction. Looks up `quality_rule_configurations` per `(file_id, rule_id)` where `enabled = true`. It applies only if `apply_to` is `'both'` or equals `context` (default `'file_upload'`). Default action is `'log_continue'`.
  - Inserts each violation with `status = 'new'`, `processing_action`, and `record_snapshot` (from `data[row_number - 1]`).
  - It commits first and then throws `QUALITY_ABORT` if any violation's action is `log_abort`. The violations are persisted before the abort.
  - It does not insert `primary_key_column`/`primary_key_value`, although the engine computes them (ENG:739-740). The column exists (`migrations/addPrimaryKeyColumnsToQualityRuleViolations.js`). The persisted insert at ENG:879 omits it. UNCLEAR.
  - It does not delete earlier violations, so repeated file processing appends.
- **`persistErrors(errors, context, entityId)` (ENG:946):** writes to `file_errors` (context `'file'`) or `mapping_job_errors` (otherwise).

#### File-processing worker path (`fileProcessingWorker.js:1256-1390`)
- Loads rules from `quality_rules` (via `file_quality_rules`) only, with no `target_columns` matching, so only `quality_rules.column_name` is used.
- Validates preview rows only (about 100).
- Stamps `file_quality_rules.last_run_at` (:1306-1334).
- Appends violations without deleting old ones.
- Order after validation: `last_run_at` stamp (:1306-1334), then `persistViolations` (:1338), then `persistErrors` to `file_errors` (:1349-1362). A `QUALITY_ABORT` thrown by `persistViolations` therefore skips writing `file_errors`; the `last_run_at` stamp has already happened by then.
- `QUALITY_ABORT` sets the step to failed and rethrows (:1371-1378); other validation errors are logged and processing continues.
- Rule types that `ENG` does not support (`null_check`, `isna_check`, `duplicate_check`, etc.) throw `Unsupported rule type` and are written to `file_errors` with severity `error`.

#### ETL job engine path (`jobExecutionEngine.js`)
There are two DQ steps in a job run.

**Step A: `enforceSchemaRulesForJob` (`jobExecutionEngine.js:3464`, imported at :19).**
- Runs only if the governance schema has column-level `quality_rules` or file-level `file_quality_rules` (`hasQualityRules`, :3450-3457).
- Sample rows: first 100 of `parseResult.sourceRows`, else first 100 of `transformedRows` (:3460-3462).
- `enforceSchemaRulesForJob` creates `new QualityValidationEngine` (`schemaRuleEnforcer.js:1262`), validates, attaches `job_id` to each violation (:1291-1295) and calls `engine.persistViolations(..., 'job_execution')` (:1297). That reads `quality_rule_configurations`, so `apply_to = 'both'` configurations apply here. A `QUALITY_ABORT` is logged and the job continues (:1299-1303).

**Step B: mapping-rule step (`jobExecutionEngine.js:3716-3938`, "Step 3.3").**
- Rules come from `transformation_quality_rules` joined to `quality_rules` on `tqr.quality_rule_id = qr.id`, where `tqr.mapping_id = $1 AND qr.enabled = true` (:3716-3722). They do not come from `file_quality_rules`.
- Uses `ENG` to validate (:3768), but persists through its own local `persistViolations(pool, jobId, fileId, violations)` (:1001, called at :3847). That function writes `processing_action = 'logged'` and does not read `quality_rule_configurations`. This step ignores `quality_rule_configurations`.
- Overrides `column_name` from `mapping.quality_rule_columns` only when `rule.column_name` is falsy (:3787-3796).
- Validates source rows when `parseResult.sourceRows` is non-empty; otherwise falls back to `transformedRows` (:3734-3743).
- Abort/warn is decided by `per_rule_error_action` or `mapping.violation_handling` with values `log_abort`, `log_warn`, `log_continue` (:3853-3884).
- Computes `dqQualityScore = passed rules / total rules` and, via `INSERT ... ON CONFLICT (file_id) DO UPDATE SET quality_score` (:4130-4152), writes it to the synthetic target row in `files` with `file_id = transformed_<jobId>_<filename>` (:4130). It does not write the source file's row. This is a further quality-score implementation.

#### schemaRuleEnforcer.js (`backend/services/schemaRuleEnforcer.js`)
- Constructs `ENG` at :701 and :1262 and persists at :728 (context `'schema_enforcement'`) and :1297 (context `'job_execution'`; attaches `job_id` to violations at :1290). A `QUALITY_ABORT` from the job path is logged and processing continues (:1301).
- It is the source of the `is_schema_enforced` assignments on `file_quality_rules`.

#### quality_helper.js `calculateQualityScore(columns, fileMetadata)` (quality_helper.js:13)
Used by `GET /quality` and `/quality/recalculate`.
- **Weights:** completeness 0.3, consistency 0.25, validity 0.2, uniqueness 0.15, timeliness 0.1 (lines 18-24).
- **`totalRows`** = `fileMetadata.row_count || 100`. A row count of 0 or null falls back to 100.
- **Completeness:** `100 - avg(null_count / totalRows * 100)`, floored at 0. Default 100 with no columns.
- **Consistency:** columns are grouped as string (`string/text/object`), date (`date/datetime/timestamp`) or numeric (`integer, number, decimal, float, int64, int32, double`). Score = 100 if all columns are recognised, else `100 - (other/total * 30)`.
- **Validity:** `(completeness + consistency) / 2`. This is a derived proxy, not a rule check.
- **Uniqueness:** average of `min(100, unique/totalRows*100)` over columns with `unique > 0`. If none, 80. With no columns, 80.
- **Timeliness:** `max(0, 100 - 5 * floor(days since created_at))`. 90 if no timestamp or unparsable.
- **Rounding:** 2 decimal places (`Math.round(x*100)/100`).
- **Error fallback:** returns 80 for all scores and the overall score (lines 146-162).
- **Time zone:** days are computed from the server clock (`new Date()`); no explicit zone.

#### quality_checks.py
- `run_basic_checks(df)`, `calculate_quality_score`, `calculate_quality_from_columns`, `check_alert`, `detect_duplicate_rows`, `check_value_range`, `check_pattern_match`, `check_cross_column`.
- `run_basic_checks` and `calculate_quality_score` are called from `profile_api.py:33,1255,1259`. `detect_duplicate_rows` is called by `fileProcessingWorker.js:1893` and `BulkProfilingService.js:1155`.
- `calculate_quality_score` differs from `quality_helper.js`:
  - consistency is the share of columns with `is_valid`;
  - validity is `consistency * 0.7 + 30`;
  - uniqueness is `100 - avg duplicate %`;
  - timeliness default is 50 when missing or unparsable (vs 90 in JS).
- `calculate_quality_from_columns` (`quality_checks.py:309`): consistency is 90 when all types are recognised, validity is `consistency * 0.9`, timeliness default 90.
- `check_alert` handles `File Freshness`, `Row Count Change`, `Schema Change` and `Quality Score` alerts. The `Row Count Change` branch uses a fake previous count: `getattr(file_data, "prev_row_count", row_count * 1.5)` (line 454). `getattr` on a dict never finds the key, so it is always `row_count * 1.5`. No caller of `check_alert` was found in this pass. `check_value_range`, `check_pattern_match`, `check_cross_column` and `calculate_quality_from_columns` also have no caller found in this pass (searched `quality_checks` imports: only `profile_api.py`; the JS worker imports only `detect_duplicate_rows`).

#### BulkProfilingService.js
- `BulkProfilingService.js:1389` calls `validateDataWithRules`, which is undefined (not exported by ENG), and writes to `quality_violations`, not `quality_rule_violations`.

### Frontend routes
- `/quality-rules` renders `QualityRules` inside `ProtectedRoute` (`src/App.jsx:373`). It is the UI for the `/api/quality-rules/*` and `/api/files/:id/quality-rules*` calls above.
  - `src/pages/QualityRules.jsx:104` calls `/api/quality-rules/init-data`; create/update/delete go through the service.
  - The validity rule form (`QualityRules.jsx:247-259`, `:442-443`) emits `rule_config.validity_type`, with `pattern`, `range`, `enum`, `datatype` sub-fields. See BUG on the `type` mismatch.
- `src/pages/DataProfile.jsx:1489` calls `/quality-rules/run` and `:1617` calls `/quality-rules/revalidate`.
- `/alerts` redirects to `/quality-rules` with `<Navigate replace>` (`src/App.jsx:374`). The `GET /api/alerts` backend route (S:10182) is admin-only and is outside this area.
- `src/api/qualityRulesService.js` wraps these calls: list (`/quality-rules`), get/create/update/delete by id, `/violations/summary` (:70), `/projects`, and the file-level `GET`/`POST /files/:id/quality-rules` (with `client_base_version` and `write_nonce`). It does not call `/configurations`, `/run`, `/revalidate` or `/init-data`.

## Data touched
- `quality_rules`: rule_name, rule_type, description, column_name, rule_config (JSON), severity, enabled, project_id, sub_project_id, created_by, created_at, updated_at (QR:431, QR:579). R/W.
- `file_quality_rules`: file_id, quality_rule_id, target_columns (text[]), created_at, last_run_at, is_schema_enforced (S:8429, S:8553, S:7573). R/W. Created by `backend/migrations/createQualityRuleAssociations.js`, with `last_run_at` and `is_schema_enforced` added by later migrations. Also written by the worker (`last_run_at`) and `schemaRuleEnforcer.js` (`is_schema_enforced`).
- `transformation_quality_rules` (mapping_id, quality_rule_id, error_action): R by the ETL mapping-rule step (`jobExecutionEngine.js:3716-3722`).
- `file_assignment_versions` (file_id, version, write_nonce): created at startup in `server.js:937-950`. R/W.
- `quality_rule_violations`: rule_id, file_id, job_id, row_number, column_name, expected_value, actual_value, violation_details, severity, status, processing_action, record_snapshot, primary_key_column/value, created_at, plus `updated_at`, `resolved_by`, `resolved_at`, `resolution_notes` (DDL :1797-1800). R/W (run, revalidate, `ENG.persistViolations`, ETL local `persistViolations`).
- `quality_violations` (different table): written by `BulkProfilingService.js:1389`.
- `quality_rule_configurations`: file_id, rule_id, error_action, apply_to, enabled, created_by, updated_at. R/W. Read by `ENG.persistViolations` (including through the ETL job's `enforceSchemaRulesForJob` step, context `'job_execution'`); ignored by the ETL mapping-rule step's local `persistViolations`.
- `file_preview_data` (file_id, row_number, row_data): R by run; deleted and rewritten by revalidate.
- `files`: row_count, column_count, quality_score, updated_at. R/W (the ETL mapping-rule step also upserts `quality_score` into the synthetic target row `transformed_<jobId>_<filename>`, jobExecutionEngine.js:4130-4152).
- `file_columns`: R (unique_count, null_count, min/max values, null_percentage; `unique_percentage` is not in the DDL).
- `file_quality_checks`: created in the request path (S:9840, S:9887, S:10067). R/W.
- `file_profiles`: R by insights.
- `file_errors`, `mapping_job_errors`: W by `ENG.persistErrors` (and the worker for unsupported rule types).
- `users`, `projects`: joined for names (QR:47-55).
- Cache: `cacheService` keys `quality_rules:*`; `cacheMiddleware(600)` on `/quality` and `/insights`, keyed `cache:<userId|anonymous>:<originalUrl>`.

## Flags

### DUPLICATE
1. **Rule execution is implemented 3 times** (S:7096-7527, S:7907-8248, ENG:170-1393). They differ in rule-type names and behaviour:
   - HTTP run/revalidate support `null_check, column_completeness, email_validity, phone_validity, isna_check, numeric_only_string, special_character_presence, duplicate_check`. These are not accepted by `POST /api/quality-rules` (QR:413 whitelist) or by `ENG.executeRule`.
   - ENG supports `completeness, consistency, freshness, validity_check, length_check, range_check`. HTTP run/revalidate do not.
   - `validity`: in HTTP, config key is `validity_type` (S:7256). In ENG, it is `type` (ENG:306). The same stored rule behaves differently, or not at all, depending on the path (see BUG).
   - `uniqueness`: HTTP composite key `join('||')` with null as `''` (so blank rows collide); ENG skips rows with any null or empty key part.
   - Email regex differs (HTTP: `[^\s@]` classes; ENG: `[a-zA-Z0-9._%+-]` and TLD `[a-zA-Z]{2,}`).
   - Date: HTTP uses year 1900-2100 and `validateDateFormat` (S:192, S:262). ENG uses year 1000-9999 (ENG:1309).
   - Pattern safety: ENG calls `validateRegexSafety`; the HTTP `validity`/`pattern` path does not (S:7324).
2. **Run vs revalidate** are near copies, with the differences listed above (delete scope S:7541 vs S:8330; `record_count` source; whitespace normalisation; response `status`).
3. **Quality score has 5 implementations:** `quality_helper.js` (JS), `quality_checks.calculate_quality_score`, `quality_checks.calculate_quality_from_columns`, the hard-coded one in `POST /quality/check` (S:11633-11664), and the ETL `dqQualityScore = passed rules / total rules` (`jobExecutionEngine.js:4125-4156`). Weights differ: 0.3/0.25/0.2/0.15/0.1 in the first three; 0.3/0.25/0.25/0.2 over 4 dimensions in `/check`; the ETL one has no weights. Defaults for missing data differ (timeliness 90 vs 50). Several of them write the same `files.quality_score` column (the ETL one writes to the synthetic target row, not the source file's row).
4. **The `file_quality_checks` table** is created with the same DDL in three request handlers (S:9840, S:9887, S:10067). The same 5-check list is built twice (S:9910-9961, S:10085-10136).
5. **Record-count logic** appears 3 times (S:7420-7494, S:8251-8321, ENG:451-532).
6. **Column resolution** (`normalizeColumnName`/`resolveColumnName`) is copied in run and revalidate.
7. **Violation persistence is implemented twice:** `ENG.persistViolations` (ENG:836; reads `quality_rule_configurations`, `processing_action` from config) and the ETL local `persistViolations` (`jobExecutionEngine.js:1001`; `processing_action = 'logged'`, ignores configurations).

### BUG
1. **GET `/api/quality-rules/configurations` is unreachable.** `GET /:id` (QR:340) is registered before it and matches the single segment, so the request is answered by `/:id` (404 `Quality rule not found`, or a lookup with a non-numeric id, which may raise a DB error; not verified). `GET /violations/summary` is NOT affected (two segments) and works.
2. **`GET /insights` crashes when a quality check row exists.** `JSON.parse(quality.issues)` (S:11526) reads a column that `file_quality_checks` does not have (S:9841-9850), so `JSON.parse(undefined)` throws and the response is 500 `Failed to generate insights`. Once `/quality` has run for the file, a check row always exists. The `overall_score`, `completeness_score` etc. fields would be undefined too.
3. **Violations sort wrongly.** `ORDER BY qrv.severity DESC` on string severity (S:6845) gives warning, error, critical.
4. **Run and revalidate treat rule types unevenly.** `completeness`, `consistency`, `freshness`, `validity_check`, `length_check` and `range_check` rules assigned to a file match no case (S:7096 switch; `COLUMN_SWITCH_TYPES` S:7045) and stay "Not Run" forever. `uniqueness` is handled; `record_count` is handled. The create endpoint accepts all of them.
5. **`rules_executed` in the run response** counts enabled assigned rules (S:7599), including those skipped.
6. **Revalidate overwrites data before it can reject.** The `Empty file` 400 (S:7810) is returned after the preview rows and `files.row_count` were already replaced and committed (S:7744-7785).
7. **Revalidate deletes all violations** (S:8330), including those for rules that were not re-evaluated, which then show as "Not Run"/no failure. Run only deletes for evaluated rules (S:7541). Also, the response `status:'passed'` (S:8395) covers unevaluated rules.
8. **Revalidate truncates to 10,000 rows** for column rules (S:7686) but the preview table is also overwritten with only those 10,000 rows. Later `/run` calls therefore see only 10,000 rows, while `row_count` is the full count.
9. **`record_count` with an unknown operator** (HTTP) is stamped as evaluated and passes (S:7438-7472); ENG logs a warning and does not.
10. **`record_count` with missing `expected_count`** gives `NaN` comparisons, so `exactly` never violates (`Math.abs(NaN) > n` is false) and `at_least`/`at_most` never violate. Not guarded (S:7424-7441).
11. **Range validity in HTTP** uses `else if`: a value that is also over max is only checked for min, and vice versa (S:7334-7340). This is consistent with exclusive bounds, so it is low impact. `ENG` range validity (ENG:346-352) lets the later `max` message overwrite the `min` one.
12. **`ENG.persistViolations` drops primary key columns.** The INSERT (ENG:879-882) omits `primary_key_column`/`primary_key_value` that the validators compute, although the table has them (migration `addPrimaryKeyColumnsToQualityRuleViolations.js`) and the violations endpoint selects them (S:6835-6836).
13. **`ENG.validateFreshness`** reads the row timestamp from `rule.column_name` and only uses `config.timestamp_column` as an on/off flag (ENG:797-799).
14. **`BulkProfilingService.js:19` imports `{ validateDataWithRules }`** from `qualityValidationEngine`, which exports only the class (ENG:1396). The name is `undefined`, and `BulkProfilingService.js:1389` calls it (a TypeError if reached) and writes to `quality_violations` rather than `quality_rule_violations`.
15. **`numeric_only_string` comment vs code:** comment says "optionally with decimal point"; the regex `/^\d+$/` does not allow one (S:7216-7217).
16. **`DELETE /configurations/:id` always fails with 500 after deleting.** It calls `cacheService.invalidatePattern` (QR:907), which does not exist (`cacheService.js` defines only `delPattern`, :155). The row is deleted, then a TypeError gives a 500 response.
17. **`quality_checks.check_alert` `Row Count Change`:** `getattr(file_data, "prev_row_count", row_count * 1.5)` on a dict always yields `row_count * 1.5`, so "decrease_by" always evaluates a fixed 33.3% decrease (quality_checks.py:454). Division by zero if `prev_row_count` is 0.
18. **`quality_helper.js` `totalRows = row_count || 100`:** a file with 0 rows is scored as if it had 100 (line 27).
19. **`GET /quality` returns a fresh `qualityScore` next to stale stored `checks`** (S:9907, S:9979-9986).
20. **UI `validity_type` vs engine `type` mismatch.** The rule form in `src/pages/QualityRules.jsx:247-259` and `:442-443` writes `rule_config.validity_type`. HTTP run/revalidate read `validity_type` (S:7256), but `ENG` reads `config.type` (ENG:306). Validity rules created in the UI therefore do not produce violations in the file-processing worker or the ETL path (the engine finds no `type`).
21. **`apply_to = 'etl_job'` never matches.** No caller of `ENG.persistViolations` passes `'etl_job'` (callers pass `'file_upload'`, `'schema_enforcement'`, `'job_execution'`). The ETL mapping-rule step (`jobExecutionEngine.js:3716-3938`) does not read `quality_rule_configurations` at all. Of the three `apply_to` values, `'both'` is the only one that applies to ETL jobs (via `enforceSchemaRulesForJob`, context `'job_execution'`); `'file_upload'` applies only to the worker.
22. **`POST /files/:id/quality-rules` deletes all assignments** (S:8545), including `is_schema_enforced` rows created by `schemaRuleEnforcer.js`.
23. **`GET /insights` `uniquePercentage` is always undefined** because `file_columns.unique_percentage` is not in the DDL.

### DEAD
1. `quality_checks.py`: `check_value_range`, `check_pattern_match`, `check_cross_column`, `calculate_quality_from_columns`, `check_alert`. No callers found (only `profile_api.py` imports the module, and it calls `run_basic_checks` and `calculate_quality_score`, `profile_api.py:33,1255-1259`). Search was by module name; not exhaustive for dynamic use.
2. In `POST /quality/check`, `anomalyDetection`, `calculateReliabilityScore` are read but never used, and the `rules` loop only logs (S:11567, S:11652-11656).
3. `ENG.evaluateExpression`: `safeExpression` is computed and never used (ENG:621).
4. `ENG.executeRule` case `record_count_match` has no creation path in the `POST /api/quality-rules` whitelist (QR:413).
5. `duplicate_check` has a handler in run/revalidate but is not creatable through `POST /api/quality-rules`, so it can only exist via DB seeding or schema-enforcement code (not traced).
6. `GET /api/quality-rules/configurations` (QR:741) is unreachable (see BUG 1).

### SECURITY
1. **`GET /api/files/:fileId/quality-violations` has no ownership or project check** (S:6811). It is authenticated (S:5283), but any logged-in user can read `actual_value`, `violation_details` (which contain raw cell values), `rule_config`, `primary_key_value` for any file id.
2. **`GET /api/files/:fileId/quality` writes to the DB on a GET** (table DDL, score update, check rows; S:9828) and has no ownership check. It is authenticated via S:5283.
3. **No ownership or project-access check** on any file-level DQ route (run, revalidate, assign, recalculate, check, insights) or on rule update/delete (QR:466, QR:616). Any authenticated user can modify or delete any rule, including global rules, and can replace any file's preview data (revalidate).
4. **Fail-open virus scan** on revalidate (S:7659-7661).
5. **Expression injection (ENG:635):** `evaluateExpression` builds code with `new Function` from `rule_config.expression` after substituting raw row values into the string. A string value is wrapped in `"` without escaping, so a cell like `" + process.exit() + "` can alter the code. The "safe expression" sanitiser is computed but not used (ENG:621). Rule creation does not restrict who may set `consistency` expressions, since `POST /api/quality-rules` has no role check.
6. **User-supplied regexes** run via `new RegExp(rcCfg.pattern)` in HTTP run and revalidate (S:7324, S:8128) without `validateRegexSafety` (ReDoS). ENG does call it.
7. **SQL string interpolation:** `INTERVAL '${parseInt(days)} days'` (QR:687). `parseInt` makes it a number, so it is not injectable, but `parseInt('abc')` gives `NaN` and an SQL error (500).
8. **Internal error text returned** in `details: err.message` (S:7618, S:8410, S:11749).
9. **DDL at request time:** `CREATE TABLE IF NOT EXISTS` in three handlers.
10. **Response cache on `/quality-rules` list** is shared across users and not scoped by project access (QR:37-43); the project-aware filtering exists only in `/init-data`.

### UNCLEAR
1. Whether `quality_rules.severity` copied to `quality_rule_violations.severity` at run time is meant to follow later rule edits (it does not).
2. `target_columns` on a `uniqueness` rule means composite key (S:7497), but on a `duplicate_check` rule means independent columns (S:7377). Intent for users is not stated.
3. The `status` meaning of `quality_rule_violations.status = 'new'` (ENG:893): no code in this area changes it.
4. `ENG.validateData` is passed `metadata` which it mutates (`metadata.primaryKeyColumn`, ENG:127).
5. `GET /api/quality-rules/` `hasMore` calculation uses the page row count and total; with limit/offset NaN it is not defined.
6. `init-data` `pages` value is `Math.ceil(total / limit)`; with `limit=0` this is `Infinity`.

## Domain terms
- **Quality rule / DQ rule / validation rule:** a row in `quality_rules`. Also called "generic rule" in the available-rules query (S:8435).
- **Rule type:** `completeness`, `validity`, `consistency`, `uniqueness`, `freshness` (the "5 types" in QR:9, ENG:7), plus `record_count`, `record_count_match`, `validity_check`, `length_check`, `range_check`, `date_format`, `timestamp_format`. Also run-only: `null_check`, `column_completeness`, `email_validity`, `phone_validity`, `isna_check`, `numeric_only_string`, `special_character_presence`, `duplicate_check`. "engine-type alias" is the code's name for `validity` (S:7049).
- **Severity:** `critical`, `error`, `warning`. Default `warning`.
- **Assignment / assigned rule / applied rule:** a `file_quality_rules` row. **Target columns** = `target_columns`. **Available rules** = rules a file may be assigned.
- **Violation:** a `quality_rule_violations` row. Also called "error" in `ENG.persistErrors` (a different table: rule execution failures).
- **Rule status:** `passed`, `failed`, `null` ("Not Run"). **Check status** (score checks): `passed`, `warning`, `failed`.
- **Rule configuration** (`quality_rule_configurations`): per file+rule error handling. `error_action`: `log_continue`, `log_abort`. `apply_to`: `file_upload`, `etl_job`, `both`. Called "error handling strategies" at QR:735. The ETL engine uses a different vocabulary: `per_rule_error_action` / `violation_handling` with `log_abort`, `log_warn`, `log_continue`.
- **Schema-enforced rule** (`is_schema_enforced`): flag on assignment, set by `schemaRuleEnforcer.js`.
- **Quality score** (`files.quality_score`) vs **overall_score**. **Components / dimensions:** completeness, consistency, validity, uniqueness, timeliness (and accuracy in `/check`). "Freshness" (rule) and "timeliness" (score) both mean age. "Quality check" (`file_quality_checks`) is a score component, not a rule run. ETL `dqQualityScore` = passed rules / total rules.
- **Preview data** = `file_preview_data` rows (cached file content). **Revalidate** = re-upload and re-run. **Assignment version / write nonce** = optimistic concurrency fields.
- **Project / sub-project:** rule scope. A rule with `project_id IS NULL` is a **global rule**.
- **Primary key column** (auto-detected, not declared).
- **Persist context:** `'file_upload'`, `'schema_enforcement'`, `'job_execution'` (and the configuration value `'etl_job'`, which no caller passes).

## Open questions
1. Does deleting a rule that has rows in `quality_rule_violations` succeed or return 500? The FK `quality_rule_violations_rule_id_fkey` (DDL :3383) shows no `ON DELETE` clause and the code comments (QR:614, QR:629) claim CASCADE. Not determinable from the dump alone.
2. Who calls `/quality-rules/configurations` (POST/DELETE) in the UI, and is `apply_to` ever set to anything but `both`? (`QualityRules.jsx` and `qualityRulesService.js` were not found to call it; not confirmed.)
3. How are `duplicate_check`, `null_check`, `isna_check`, etc. rules created? The create endpoint rejects them (QR:413). Likely a seed or schema-enforcement path (not traced).
4. What does `validateRegexSafety` (`backend/utils/regexValidator`) reject? Not read.
5. Time zone: `quality_helper.js` and `NOW()` use server/DB time; no explicit time zone is set anywhere in this area.
6. Is `BulkProfilingService.js:1389` ever reached at runtime? It calls an undefined function; whether any caller triggers it is not traced.
7. Are `quality_rule_violations.status` values other than `'new'` or the resolution columns (`resolved_by`, `resolved_at`, `resolution_notes`) written by any code? None found in this area.
