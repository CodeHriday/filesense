# EXE - Mapping job execution engine

Source: `backend/services/jobExecutionEngine.js` (5,905 lines). All line numbers refer to that file unless a path is given. Parts of the file were read in ranges. Not read in detail: parseFileToRows (79-352), parseAndTransform* for JSON/XLSX/Parquet/XML (5147-5549), convertTo* (5591-5799), the lineage/column-mapping block (4302-4640), and the body of `convertFieldMappings`/`convertVariables` (4834-5030).

## Summary

The engine is a library with no HTTP entry points of its own. It is called by routes/transformations.js:966 and :993, backend/services/cronSchedulerService.js:403, backend/routes/visualMappings.js:700, and backend/routes/jobs.js:398 and :480 (the last two call getJobStatus and cancelJob). It runs one mapping job in these steps:

1. Create or reuse a `transformation_jobs` row. Status is `'running'` from the start (:854).
2. Load the mapping and, if it has a vendor agreement, the agreement's connection (:2492).
3. Load the RDM context (:1316).
4. List files in the source connection (`listAndFilterFiles`, :1391).
5. Check schema drift (:1495) and cross-file schema consistency (:1689).
6. Load secondary sources into in-memory lookup tables for multi-source joins (:1795).
7. For each file, run `processFile` (:2852): download, parse and transform, contract DQ, join, RDM, quality-rule DQ, source profiling, upload to target, audit and lineage, target profiling.
8. Write the final job status, send a notification, emit an alert event, and delete the temporary visual mapping.

Statuses written by the engine: `running`, `completed`, `completed_with_warnings`, `failed`, `cancelled` (:854, :2199, :5863). Per-file failures never fail the job (see Flags).

## Entry points

The module exports 11 functions (:5893-5905). None is an HTTP handler. Auth and ownership checks live in the callers.

### 1. executeTransformationJob(pool, mappingId, userId, options)  (:1137)
- **Trigger:** manual run (routes/transformations.js:993, which creates the job first and passes it as `existingJob`), cron schedule (cronSchedulerService.js:403), visual mapping run (routes/visualMappings.js:700). The areas.md row also lists mapping groups and workflows as callers. I did not trace those here.
- **Who may call:** no checks inside the engine. `userId` is only used for the `executed_by` column, audit and notifications.
- **Inputs, with defaults (:1138-1158):**
  - `runSchemaValidation=true`, `runProfilingChecks=true`, `dryRun=false`, `existingJob`.
  - Group, schedule and workflow IDs, and `visualMappingExecutionId`.
  - `transformationExecutionId`, `visualMappingNodes/Edges`, `nodeExecutionMap`, `executionOrder`.
  - `userEmail/userRole/userIp/sessionId` (for the audit ledger).
  - `skipInternalCleanup` (:2278).
- **Validation:** none on the options. `fileNamePattern` is `mapping.file_name_pattern || mapping.source_file_pattern` (:1368). If both are empty, `.includes` at :1381 throws a TypeError.
- **Outputs:**
  - Success: `{jobId, status, filesProcessed, rowsRead, rowsWritten, rowsFailed}` (:2322).
  - Early failed returns: `{jobId, status:'failed', filesProcessed:0, message[, schemaDrift|details]}` (:1471, :1659, :1748). These do not throw.
  - Other errors are rethrown after the job is marked failed (:2482).
- **Side effects:**
  - DB writes to `transformation_jobs`, `transformation_logs`, `transformation_executions` (:1102), `anomalies` (:1598), `quality_rule_violations` (:1066), `files` (:4133, :4168), the audit ledger, file audit and schema tables, `transformation_lineage`, and a DELETE on `transformation_mappings` (:2281, :2447).
  - Reads and writes cloud storage (download, upload).
  - WebSocket events through visualMappingWS.
  - Fire-and-forget calls: `fireJobNotification` (:2211, :2346), `JiraService.createIssueForAbortedJob` (:1649, :2360), `alertAggregationWorker.onJobCompleted` (:2308, :2467).
- **Business rules:**
  - Job ID is `JOB-${Date.now()}-${uuid[0:8]}`. `correlation_id` equals `job_id` (:838-839).
  - Full source pattern is `file_path` with leading and trailing `/` stripped, then `/`, then the pattern. It is a single file if the pattern has no `*` or `?` (:1374-1381).
  - Zero matched files: job `failed`, message "File not found" (single file) or "No files matched the pattern" (pattern). A file-audit row is written with `errorType:'no_files_matched'` (:1397-1476).
  - RDM load failure is fatal: job `failed` with "RDM context loading failed" (:1336-1358).
  - Schema validation runs only if `runSchemaValidation` and (`vendor_agreement_id` or non-empty `source_schema`) (:1497-1499).
    - Vendor agreement: delegates to `validateFileSchema` on the first matched file only (`cloudFiles[0]`, :1510).
    - `source_schema`: downloads at most 1 MiB (`maxBytes: 1024*1024`) of the first file, extracts the schema, and compares sorted field-name lists as strings (:1526-1534). Types are not compared.
  - Drift result is stored in `transformation_jobs.schema_validation` as `'Fail'` or `'Pass'`. If the check throws, the column is set to null and the job continues (:1571, :1679-1685).
  - On drift, `mapping.schema_drift_handling === 'abort'` fails the job, creates a Jira ticket with reason `schema_drift`, and returns. `'alert'` logs a warn and continues. Any other value (null, 'ignore', etc.) continues silently (:1625-1673).
  - Drift anomaly severity: `high` if any field is missing; else `medium` if more than 3 new fields; else `low`. When there are no differences it stays `medium` (:1586-1596).
  - Cross-file check runs only if not single file and more than 1 file. It compares every file's sorted field names to the first file's. Any mismatch fails the job with "All files matching a pattern must have identical schemas". Files whose schema can't be extracted are skipped with a warn (:1689-1762). It runs even without a schema defined.
  - Multi-source join is active only if `has_multi_source_join` and `source_catalog.length > 1` and `join_specs.length > 0` (:1791-1793).
    - Secondary sources are loaded one file each (the first match, "for now", :1844) into a map keyed `${joinNodeId}_left|right`.
    - Keys are `String(value || '').trim().toLowerCase()` joined by `|` (:1879). A numeric 0 or `false` becomes an empty key.
    - A failed secondary source load is logged and skipped. The job continues and the join then drops or ignores rows (:1917).
  - Files are processed sequentially. After each file `files_processed`, `rows_read`, `rows_written`, `rows_failed` are updated (:2119).
  - Final status is `completed_with_warnings` if any file had a `log_warn` violation, else `completed` (:2199). `files_processed` is set to `matchingFiles.length` regardless of failures (:2202).
  - A failed file adds `file.row_count || 0` to `totalRowsFailed`. Cloud files always have `row_count: 0` (:1492), so this adds 0 (:2171).
  - Profiling and anomaly detection (`executeAnomalyDetection`) run only if `runProfilingChecks && !dryRun && file.file_id` (:2150). `file_id` is always `null` for cloud files (:1490). See DEAD.
- **Error cases:**
  - Mapping not found throws (:2499).
  - Vendor agreement not found throws (:2519).
  - Any thrown error: job set to `failed` with `error_message`, notification, optional Jira ticket (only when `error.code === 'DQ_ABORT'`, which can't reach here, see BUG), file audit with `errorType:'execution_error'`, WS error event, temp mapping deleted, alert emitted, error rethrown (:2331-2482).
  - If `job` is still null when the error happens (createJob failed), nothing is recorded and the error is rethrown.

### 2. createJob(pool, mappingId, userId, options)  (:821)
- **Trigger:** routes/transformations.js:966 and executeTransformationJob.
- **Inputs:** `mappingId` (looked up in `transformation_mappings.mapping_id`). Options: `mappingGroupExecutionId`, `scheduleId`, `workflowExecutionId`, `visualWorkflowExecutionId`.
- **Output:** the inserted row (`RETURNING *`). `start_time` presumably comes from a DB default (the INSERT does not set it; I did not check the table definition).
- **Side effects:** INSERT into `transformation_jobs` with `executed_by=userId`, `status='running'`, `project_id` copied from the mapping, `correlation_id=jobId` (:843-861). No `pending` state is ever written.
- **Errors:** "Mapping not found: <id>" thrown (:834).

### 3. getJobStatus(pool, jobId)  (:5807)
- **Trigger:** routes/jobs.js:398. That route calls `validateJobAccess(id, req.user)` first (:396). The ownership logic is in utils/jobAccessHelpers and not read here.
- **Output:** `{job, logs}`. Logs come from `transformation_logs` ordered by `timestamp ASC`, with no limit (:5818). The route returns only `jobData.job`.
- **Errors:** "Job not found: <id>" thrown. The route maps messages containing "not found" to 404.

### 4. updateJob(pool, jobId, updates)  (:949)
- **Trigger:** engine internals, routes/transformations.js:1017.
- **Rules:** if `updates.end_time` is set, it reads `start_time` and adds `duration_ms = end - start` (:952-962). The UPDATE is built from the keys of `updates` and always sets `updated_at = CURRENT_TIMESTAMP`. It returns the updated row, or undefined if no row matched.
- **Security:** column names are interpolated into SQL from object keys (:970). Safe only while callers pass fixed keys. See SECURITY.

### 5. cancelJob(pool, jobId)  (:5840)
- **Trigger:** routes/jobs.js:480. The route requires the `jobs:write` permission (:467) and `validateJobAccess` (:478).
- **Rules:** a job in `completed`, `failed` or `cancelled` gives an error with `statusCode=409` (:5855-5859). Any other status is set to `cancelled` with `end_time=now`, a log line "Job cancelled by user" is written, and a cancellation notification is sent (:5862-5883).
- **Limitation:** cancellation only changes the DB row. See BUG.

### 6. logJobExecution(pool, jobId, level, message, details, visualExecutionId, ledgerContext)  (:896)
- Inserts a row into `transformation_logs` (`log_level`, `message`, `log_details` as JSON).
- If `visualExecutionId` is given, emits a WS log.
- Also appends an entry to the immutable audit ledger (`actionType:'JOB_EXECUTION'`, `entityType:'TRANSFORMATION_JOB'`, level upper-cased). Ledger failure is swallowed.
- The whole function swallows errors. A failed log write never fails a job.
- Levels used: `info`, `warn`, `error`, and also `warning` (:3475, :3485, :3501), which is inconsistent.

### 7. getMappingConfig(pool, mappingId)  (:2492)
- Returns the `transformation_mappings` row.
- With a `vendor_agreement_id`, it overwrites `source_connection_id` with `vendor_agreements.vendor_connection_id`. It also adds `vendor_agreement_metadata {owner, path, agreement_name}`, where owner is the contact name, else contact email, else null (:2505-2532).

### 8. processFile(pool, file, mapping, jobId, options)  (:2852)
Per-file pipeline. Returns `{rowsRead, rowsWritten, rowsFailed, hasWarnViolations}` (:4812). The archive branch returns a different shape (:3167).
- **Download:** `downloadFileFromConnection`.
- **Type by extension:** `file.filename.split('.').pop().toLowerCase()` (:2882).
- **Archives** (`zip, 7z, tar, gz, tgz, bz2, tar.gz, tar.bz2`, :33):
  - Require a `vendor_agreement_id`, otherwise an error "Unsupported file type" (:2892).
  - The password comes from the vault via `getArchivePasswordFromVault`: the file schema matched by pattern (or the first schema as fallback), then `encrypted_passwords` for entity type `vendor_agreement_file_schema`, then `vendor_agreement`. Errors give null (:521-607).
  - The archive is written to `os.tmpdir()/archive_<ts>_<basename>` and extracted. Nested archives are skipped.
  - Only csv, json, xlsx, xls, xml and parquet are processed. Anything else is skipped with a warn.
  - A failing extracted file adds 1 to rowsFailed and processing continues.
  - Source rows are capped at 100 per extracted file for the returned sample.
  - RDM enrichment is applied if `rdm_lookup_enabled`. The upload to target happens in this branch.
  - Governance, contract DQ, quality-rule DQ, profiling, audit and lineage are all skipped in the archive branch. See Flags.
- **Fixed-width / headerless:**
  - `FIXED_WIDTH_EXTENSIONS=['dat','fixed_width','txt']` (:34).
  - For a vendor-agreement mapping and a fixed-width type or `csv`, `getFixedWidthSchemaFromAgreement` is consulted.
  - File types `fixed_width`, `dat` or `binary` use `parseFixedWidthBuffer`. A CSV with `hasHeader===false` uses the schema's column names. The agreement schema is read at :616-745 (only skimmed).
  - A fixed-width extension without a vendor-agreement schema throws "Fixed-width file detected ... require a vendor agreement" (:3413). Note `txt` is in this list, so every `.txt` file needs a vendor agreement.
  - Any other extension throws "Unsupported file type" (:3420).
  - Supported types: csv, json, xlsx/xls, parquet, xml (plus fixed-width via agreement).
- **Field mappings:**
  - If a join or a crosswalk is configured, the parser gets empty mappings and variables. Mappings are re-applied after enrichment: after the join (:3539-3621) and after RDM (:3657-3707). `hasCrosswalkEnrichment` is true only when `rdm_lookup_enabled` and a crosswalk config exists (:3270).
  - If a post-join or post-crosswalk row transform throws, the original row is kept (:3609, :3691).
  - A post-transform row with zero keys is dropped (:3601, :3684).
- **Row-level errors:** a row whose transform throws increments `rowsFailed` and is skipped (CSV :5112). The CSV parser keeps empty transformed rows (it only warns, :5103), whereas the fixed-width path drops them (:3316).
- **Contract DQ** (:3443-3510):
  - Runs when there is a vendor agreement and the matched schema has column `quality_rules` or `file_quality_rules`.
  - It checks at most the first 100 source rows (`slice(0,100)`) via `enforceSchemaRulesForJob`.
  - It never fails the job (all errors are caught and logged).
- **Join enrichment** (`applyJoinEnrichment`, :363):
  - Joins run in sequence, one pass per spec.
  - Output rows: all matched secondary rows (one-to-many). Unmatched rows are kept only for `LEFT` or `LEFT OUTER`. Every other join type, including `RIGHT` and `FULL OUTER`, behaves as INNER (:467-470).
  - With no `columnMappings`, all secondary columns are added with prefix `src2_` (or `src1_` for a left lookup), and also unprefixed if the name is free (:447-458).
  - `rowsWritten` is reset to the joined row count (:3532). `rowsFailed` is unchanged.
- **Quality-rule DQ** (:3714-3952):
  - Rules come from `transformation_quality_rules` joined to `quality_rules` where `qr.enabled = true`.
  - Rows validated are `parseResult.sourceRows` (first 1000 captured by the CSV parser, :5046) if any, else the transformed rows.
  - It runs only if there are rules and (rows exist or a `record_count`/`record_count_match` rule exists).
  - `actual_row_count` is `rowsRead` if above 0.
  - `mapping.quality_rule_columns[ruleId]` fills a missing `column_name`.
  - The quality score is `round(passedRules/totalRules*1000)/10` (one decimal, 0.0-100.0). A rule counts as failed if it has any violation (:3829).
  - Violations are persisted with status `'new'`, processing_action `'logged'` and default severity `'warning'` (:1049-1057).
  - Each rule's action is `tqr.error_action`, else `mapping.violation_handling`, else `'log_continue'` (:3856, :3860). Ranking: `log_abort`=2 > `log_warn`=1 > `log_continue`=0.
  - The worst action across fired violations decides the outcome. `log_abort` marks the job `failed` and throws an error with code `DQ_ABORT`. `log_warn` sets `hasWarnViolations`. `log_continue` only logs.
  - Any non-abort error in this step is logged as an error and the job continues (:3943-3952).
- **Progress callback:** `onTransformComplete` is awaited after DQ and before profiling, then the event loop is yielded (:3959-3969).
- **Source profiling** (:3974): if `!dryRun` and the buffer is non-empty, `profileFileBuffer` runs with the file role `'source'`. Governance metadata is persisted after it. Failures are warnings only.
- **Upload** (:4058): only if `!dryRun && transformedRows.length > 0 && mapping.target_connection_id`.
  - Format: `(target_file_format || output_format || 'csv').toLowerCase().trim()`. Formats csv, json, xlsx, parquet and xml are supported. Anything else logs a warn and falls back to CSV (:5582). The file extension still carries the requested format name.
  - Name: `target_file_name`, with `<current_date>` replaced by UTC `YYYYMMDD` and `<current_timestamp>` by Unix seconds (:792-802). The extension is forced to the output format. Without a target name, the source name with its extension swapped (`generateOutputFilename`, :5554, which ignores `mappingName`). `target_file_path` is prepended with slashes trimmed.
  - If there are rows but no target connection: archive branch logs a warn (:3154); the normal branch has no such warn and does not upload.
  - A dry run or zero rows skips upload, audit and target profiling (they sit inside the same `if` block).
  - After upload: file audit for source and target, a `files` row `transformed_<jobId>_<filename>` (with `quality_score` if DQ ran), lineage (recorded only when the schema fingerprint changes, :4329), then target profiling (`fileRole:'target'`) with PII columns merged from the agreement and `mapping.pii_columns`.
  - Audit capture failure is a warning only.
- **Errors:** any throw from this function is logged and rethrown (:4819-4826).

### 9. downloadFileFromConnection / listAndFilterFiles
These are re-exported from `../utils/cloudStorageFileList` (:10-14, :5902, :5904). The implementation is outside this file and not read here. Left unextracted for the area that owns that util.

### 10. parseFileToRows(buffer, filename, pool, vendorAgreementId)  (:79, exported :5903)
Generic parser used for secondary join sources (:1850).
- Handles csv, txt, tsv, jsonl, ndjson, json, parquet, xml, avro and delimited files, plus archives (using the vault password).
- Only skimmed. Its behaviour differs from processFile, see DUPLICATE.

### 11. Non-exported helpers that carry rules
- `replacePlaceholders` (:792), `isArchiveFile` (:508), `convertFieldMappings` (:4834).
- `fetchGovernanceForMapping` (:2554):
  - Only used when a vendor agreement exists, and scoped by `va.project_id = $2` using `mapping.project_id`. A project mismatch returns empty governance.
  - The schema is matched by file pattern (`filePatternMatcher.matchesPattern`), else the first row if it has a schema.
  - `is_pii === true || 'true'` columns become PII columns. `quality_rule_ids` become file tags (rule names).
  - Errors return empty governance.

## Data touched

- **Reads:** `transformation_mappings`, `vendor_agreements`, `vendor_agreement_file_schemas`, `encrypted_passwords`, `transformation_quality_rules`, `quality_rules`, `transformation_lineage`, `transformation_jobs`, `transformation_logs`, `projects` (by the route).
- **Writes:**
  - `transformation_jobs` (columns used: job_id, mapping_id, mapping_name, executed_by, status, mapping_group_execution_id, schedule_id, workflow_execution_id, visual_workflow_execution_id, project_id, correlation_id, files_processed, rows_read, rows_written, rows_failed, schema_validation, error_message, start_time, end_time, duration_ms, updated_at).
  - `transformation_logs`, `transformation_executions` (status, completed_at, result), `anomalies`, `quality_rule_violations`, `files` (target rows, quality_score), `transformation_lineage`.
  - Audit ledger, file audit and schema tables (via fileAuditService).
  - `DELETE transformation_mappings WHERE is_temporary = true`.
- **External:** cloud storage connections (download/upload), the Python profilers (via transformationProfilingService), JiraService, Notification service, WebSocket.
- **Temp files:** `os.tmpdir()/archive_*`.

## Flags

### BUG
1. **DQ abort does not fail the job.**
   - Abort sets the job to `failed` (:3899) and throws `DQ_ABORT`. The per-file `catch` in `executeTransformationJob` does not rethrow (:2170-2195).
   - After the loop, the job is set to `completed` or `completed_with_warnings` (:2199-2207), overwriting `failed`. The completion notification and alert fire as success.
   - The outer-catch handling of `DQ_ABORT` (Jira ticket, :2358, and the failure notification metadata, :2342) is unreachable from `processFile`.
   - The test backend/tests/jobExecutionEngine.qualityRuleNames.test.js:551-554 documents "Per engine design ... does NOT re-throw". That justifies later files still running. It does not explain the status overwrite.
2. **Any per-file failure is hidden in the job status.** Failed files (missing format, download error) still yield `completed` with `files_processed = matchingFiles.length` (:2202). A job where every file failed is `completed`.
3. **Schema-drift anomaly never saved.** The INSERT at :1598-1618 references `sourceFileId` and `sourceName`, which are not defined anywhere in that scope (Grep: only these uses plus unrelated `source.nodeName`). That throws a ReferenceError, caught at :1621 and logged as a warn "Failed to create anomaly record".
4. **Cancel does not stop a running job.** `cancelJob` sets `cancelled`, but the engine has no check for `cancelled` (the string appears only in cancelJob). The running job continues and its final `updateJob` overwrites status with `completed` or `failed` (:2200).
5. **cancelJob reads columns that may not exist.** `_cancelledJob.user_id` (:5875), but createJob writes `executed_by` (:845). The notification likely goes with `userId` undefined. Cannot confirm from the schema, see Open questions.
6. **Dead `file_id` makes profiling and anomaly detection never run.** See DEAD 1.
7. **RIGHT and FULL OUTER joins act as INNER.** Row counts shown on the visual edges use RIGHT/FULL logic (:2036-2041) while the data join treats them as INNER (:467).
8. **Join and key coercion.** `String(row[col] || '')` makes 0 and false match empty strings (:420, :1879).
9. **Early-return failures skip the notification, alert and temp-mapping cleanup.** No-files, drift-abort and cross-file-mismatch paths return without them (:1471, :1659, :1748). The no-files path also does not fire a notification. A temporary visual mapping stays in `transformation_mappings` in those cases (unless the caller cleans up).
10. **Fallback format is mislabeled.** Unsupported output format is written as CSV but the file is named with the requested extension (:5582, :4075).
11. **`.txt` files cannot be processed without a vendor agreement.** `txt` is listed as fixed-width (:34, :3413), although `parseFileToRows` treats `txt` as CSV (:84).
12. **Mixed log levels.** `'warning'` vs `'warn'` (:3475-3501 vs elsewhere). If `transformation_logs.log_level` is filtered by level in the UI (routes/jobs.js:433), these rows won't match `warn`.
13. **Suspicious error counting.** `rowsFailed` in the archive branch counts each failed extracted file as 1 (:3044), while normal files count rows.

### SECURITY
1. `updateJob` builds `SET <key> = $n` from `Object.keys(updates)` (:969-973). Column names are not whitelisted. Only internal callers were seen (including routes/transformations.js:1017 with fixed keys), so nothing was exploitable that I could see.
2. The virus-scan service passed to archive extraction is a stub that always reports clean (`isInfected:false, skipped:true`, :2921-2924). Archives from vendors are extracted without scanning.
3. The engine itself has no authorization. Any caller can run any mapping id or cancel any job id. Checks exist only in the routes (cancel requires `jobs:write` + `validateJobAccess`). The manual-run route's permission check was not traced.
4. The archive password lookup builds a regex from the agreement's `file_name_pattern`, escaping only `.`, `*`, `?` (:543-546). A pattern with other regex characters changes the match or throws (caught, returns null).
5. `logJobExecution` stores stack traces in `transformation_logs` (e.g. :2192, :4823), which the log routes return to users (routes/jobs.js:441).
6. Extraction temp file name uses `path.basename(file.filename)` (:2910), which is safe for traversal. Extracted entries are read from `extractedFile.fullPath` returned by ArchiveExtractionService. Path safety of that service is not verified here.

### DUPLICATE
1. File parsing is implemented in two places: `parseFileToRows` (:79, supports tsv, jsonl, avro, delimiter detection) vs the `parseAndTransform*` family in `processFile` (csv, json, xlsx/xls, parquet, xml, plus the fixed-width path). Supported extension sets differ.
2. The per-format parse call plus "delay field mappings when join/crosswalk" block is repeated 6 times in `processFile` (:3347-3412) and again in the archive branch (:2968-3022). The archive branch only delays for joins (:2970), not crosswalk enrichment, so archives with a crosswalk run expressions before crosswalk columns exist.
3. The target upload block (filename, convert, upload) appears twice, in the archive branch (:3104-3162) and the normal branch (:4058-4107). The archive copy strips archive extensions; the normal copy does not.
4. The "minimal files row for target" INSERT appears 4 times (:4168, :4741, :4777, plus the DQ-score variant :4133).
5. Schema comparison: three ways to detect drift: `validateFileSchema` (vendor agreement), a field-name list comparison (:1531-1534), and the cross-file check (:1713-1714). `validateSchemaConsistency` and `saveSchemaSnapshot` are imported but unused.
6. Pattern matching for vendor schema is done three ways: `matchesPattern` (:2611), an inline regex in `getArchivePasswordFromVault` (:543), and another in `getFixedWidthSchemaFromAgreement` (:635-679, not read in detail).
7. Output filename logic is duplicated by `generateOutputFilename` (:5554) and the `target_file_name` branch.

### DEAD
1. The profiling and anomaly step at :2150. `file.file_id` is always `null` (:1490), so `executeAnomalyDetection` never runs from the engine.
2. `calculateColumnStatistics` (:2742): defined, never called in this file.
3. Unused imports (Grep count 1 each): `validateSchemaConsistency`, `saveSchemaSnapshot`, `profileETLOutputFile`, `profileETLFile`, `downloadAndProfileFile`, `parseExpressionToTransformation` (used only inside convertFieldMappings).
4. `transformationJobDbId` variable at :1190 is used; `nodeExecutionMap` option is destructured (:1151) but never read in the ranges read (UNCLEAR if used elsewhere).
5. `skipFirstRow ? 0 : 0` (:5059) is a no-op.
6. The `mappingName` parameter of `generateOutputFilename` is unused.
7. Dry-run mode never uploads or profiles the target, and the schema-drift anomaly never saves (BUG 3).

### UNCLEAR
1. Whether `completed` with all files failed is intentional (BUG 2). Tests document only the no-rethrow part.
2. `severity='medium'` default when `differences` is null. `newFields.length > 3` yields `medium` while 1-3 new fields yield `low` (:1591-1595).
3. Contract DQ looks at only 100 sample rows (:3461) while quality-rule DQ uses up to 1000 source rows (:5046). Intent not stated.
4. Whether cancelled jobs are meant to stop (comment says "Only cancel if job is in a cancellable state (pending, running)", :5861, but no `pending` status is ever written).
5. For vendor-agreement mappings, `source_connection_id` is overwritten from the agreement (:2525) and `file_path` is still used. Whether the drop-location path should replace `file_path` is not stated.
6. `quality_rule_columns` override keyed by rule id: shape unknown beyond :3787-3796.
7. `duration_ms` uses DB `start_time` vs `Date` in Node: time-zone behaviour not checked.

## Domain terms
- **Mapping / transformation mapping / visual mapping** (`transformation_mappings`; `is_visual_mapping`, `is_temporary` marks a throwaway row for a visual run).
- **Job / transformation job** (`transformation_jobs`, `job_id` like `JOB-...`). **Execution** is used for `transformation_executions` (tracking row), `visual_mapping_executions` and group/workflow executions.
- **Correlation ID**: links source and target files. Equals `job_id`.
- **Source / target**: the target is also called "output" (`output_format`, `outputFilename`, `drop_location_path` is the vendor's source path).
- **Vendor agreement / contract**: "Contract DQ" refers to quality rules in the vendor agreement file schema. `agreement_code` is the "agreement name".
- **Schema drift** (`schema_drift_handling`: abort / alert) = "schema validation" (`schema_validation` column: Pass / Fail).
- **RDM**: reference data management. Dataset join and crosswalk lookup. `rdm_lookup_enabled`.
- **Quality rule violation**: `severity` and `error_action` (`log_abort`, `log_warn`, `log_continue`), mapping-level `violation_handling`. Same concept as "Abort / Warn / Continue" in the UI strings.
- **Anomaly**: records of unexpected data or schema behaviour (`anomalies` table).
- **Profiling**: Python profilers run on source or target (`fileRole`).
- **Governance**: `containsPii`, `dataClassification`, `piiColumns`, `fileTags`.
- **Join specs / source catalog / primary source node / lookup table**: multi-source join structures.
- **Ledger**: immutable audit ledger. **File audit**: separate audit table.
- **Lineage**: `transformation_lineage`.
- **Temporary mapping**: `is_temporary`.

## Open questions
1. Is `transformation_jobs.user_id` a column? createJob writes `executed_by` (:845) but cancelJob reads `user_id` (:5875). Need the schema (createETLTransformationTables.js:72).
2. Should a DQ abort fail the job? Today the final `updateJob` overwrites `failed` (BUG 1). Need a product decision, since a test pins "does not rethrow".
3. What do `listAndFilterFiles` and `downloadFileFromConnection` do (wildcards, recursion, size limits, partial download)? Owned by `utils/cloudStorageFileList`, outside this file.
4. Which callers pass `nodeExecutionMap` and `executionOrder`, and is `nodeExecutionMap` used at all? Not read in this file.
5. How do mapping groups (MGRP) and workflows (WFL) invoke the engine? areas.md says they do, but callers found by Grep: transformations.js, cronSchedulerService.js, visualMappings.js only. Needs a trace in those areas.
6. `validateFileSchema`, `enforceSchemaRulesForJob`, `executeAnomalyDetection`, `profileFileBuffer`, `loadRDMContext`, `applyRDMLookups`, `transformRow` are called here but not analysed (they belong to SCHV, DQ, PROF, RDM/transformation areas).
7. What does `getFixedWidthSchemaFromAgreement` (:616-745) do in detail? Only skimmed.
8. How is `start_time` populated, and in which time zone? The INSERT does not set it (:843-861).
9. The lineage block (:4302-4640) and column PII mapping logic were not read in full. Business rules there (when a lineage row is created or updated) are not extracted.
10. Does the `transformation_logs.log_level` column have a CHECK constraint that would reject `'warning'`? Not known (logJobExecution swallows errors).
11. Are secondary-source files expected to be multi-file? Comment says single file "for now" (:1844).

## Inventory corrections
- areas.md row EXE says "0 direct" entry points. This is accurate for HTTP, but the module exports 11 functions, and routes/jobs.js (`GET /api/jobs/:id`, `POST /api/jobs/:id/cancel`) call `getJobStatus` and `cancelJob` from this module. Check that these two routes are in the JOBS/ETL area rows.
- Callers named in areas.md (MGRP, WFL) were not found by Grep as direct callers of `executeTransformationJob`. They may go through routes/transformations.js or cronSchedulerService.
- inventory.md:954 lists `transformation_jobs, transformation_logs` with owner EXE. In this file `transformation_executions`, `quality_rule_violations`, `anomalies`, `files` and `transformation_lineage` are also written and are not in that row.
