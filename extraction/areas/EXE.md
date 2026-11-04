# EXE - Mapping job execution engine

Source: `backend/services/jobExecutionEngine.js` (5,905 lines). All line numbers refer to that file unless a path is given. Parts of the file were read in ranges. Not read in detail: parseAndTransform* for JSON/XLSX/Parquet/XML (5147-5549), convertTo* (5591-5799, except `convertToCSV` and the `convertToParquet` catch, read in fix round 1), the lineage/column-mapping block (4302-4640, read in fix round 1 only at the points cited in processFile), and the body of `convertFieldMappings`/`convertVariables` (4834-5030). `parseFileToRows` (79-352) was read in full in fix round 1.

Schema basis used for DB claims (fix round 1): "prod dump" = `database_ddl_2026-01-07.sql` (the `attached_assets/database_ddl_1767770486833.sql` dump matches on `transformation_jobs`); "migration" = `backend/migrations/createETLTransformationTables.js`. Where the sources disagree, the claim says so. Nothing in this file was run against a database; statements marked "inferred" are read from code or DDL only. Fix round 2: the `database_ddl_*` dumps contain no CHECK constraints at all and are a lossy export format; the `attached_assets/FileSence_prod_schema_Jan_05_*` dumps list CHECKs and `ON DELETE` clauses and the later one postdates `database_ddl_2026-01-07.sql`, so they are treated as the better prod evidence for constraints.

## Summary

The engine is a library with no HTTP entry points of its own. It is called by routes/transformations.js:993 (and createJob at :966), backend/services/cronSchedulerService.js:403, backend/routes/visualMappings.js:700, backend/services/TransformationService.js:443, backend/services/mappingGroupExecutionEngine.js:104, backend/services/nStepWorkflowExecutionEngine.js:110, backend/services/visualWorkflowExecutor.js:534 and :573, and backend/services/workflowOrchestrationEngine.js:75. backend/routes/jobs.js:398 and :480 call getJobStatus and cancelJob. backend/routes/visualMappings.js:1158 imports `downloadFileFromConnection`, `parseFileToRows` and `listAndFilterFiles` and calls `parseFileToRows` at :1210. It runs one mapping job in these steps:

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
- **Trigger:** manual run (routes/transformations.js:993, which creates the job first and passes it as `existingJob`), cron schedule (cronSchedulerService.js:403), visual mapping run (routes/visualMappings.js:700), TransformationService.js:443, mapping group run (mappingGroupExecutionEngine.js:104, passes `mappingGroupExecutionId`, `workflowExecutionId`, `scheduleId`), n-step workflow (nStepWorkflowExecutionEngine.js:110), visual workflow (visualWorkflowExecutor.js:534 with a temp mapping id, :573 with a mapping id), and workflow orchestration (workflowOrchestrationEngine.js:75). The areas.md row ("ETL execute, SCHD, MGRP, WFL") matches these callers.
- **Who may call:** no checks inside the engine. `userId` is only used for the `executed_by` column, audit and notifications.
- **Caller behaviours that touch the engine's contract:**
  - workflowOrchestrationEngine.js:75 calls `executeTransformationJob(parseInt(step.entity_id), triggeredBy)` with no `pool`. The engine's signature is `(pool, mappingId, userId, options)`, so `pool` receives the number and `mappingId` receives the user (inferred from the signature at :1137; not run). This looks broken.
  - mappingGroupExecutionEngine.js:104-124 counts a mapping as `completed` for any return that does not throw. The engine returns normally with `status:'failed'` on the no-files, drift-abort and cross-file paths (:1471, :1659, :1748), and after a DQ abort overwrite (BUG 1), so the group sees success (inferred from the return paths).
  - TransformationService.js:453 logs `result.job_id`. The engine returns `jobId` (:2322), so the logged value is undefined.
- **Inputs, with defaults (:1138-1158):**
  - `runSchemaValidation=true`, `runProfilingChecks=true`, `dryRun=false`, `existingJob`.
  - Group, schedule and workflow IDs, `visualWorkflowExecutionId` (:1146), and `visualMappingExecutionId`.
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
  - Zero matched files: job `failed`, message "File not found" (single file) or "No files matched the pattern" (pattern). A file-audit row is written with `errorType:'no_files_matched'` (:1397-1476). This path does update `transformation_executions` (:1414) and returns without throwing.
  - RDM load failure is fatal. The inner handler first writes the job as `failed` with `error_message: "RDM context loading failed: <msg>"` (:1347-1351), updates `transformation_executions` (:1354) and then does `throw rdmError` (:1358). The outer catch then overwrites `error_message` with `error.message`, which is the raw `<msg>` without the prefix (:2335-2339). The outer catch's notification, file audit and alert also fire, and `updateJob` runs twice.
  - Schema validation runs only if `runSchemaValidation` and (`vendor_agreement_id` or non-empty `source_schema`) (:1497-1499).
    - Vendor agreement: delegates to `validateFileSchema` on the first matched file only (`cloudFiles[0]`, :1510).
    - `source_schema`: downloads at most 1 MiB (`maxBytes: 1024*1024`) of the first file, extracts the schema, and compares sorted field-name lists as strings (:1526-1534). Types are not compared.
  - Drift result is stored in `transformation_jobs.schema_validation` as `'Fail'` or `'Pass'`. If the check throws, the column is set to null and the job continues (:1571, :1679-1685).
  - On drift, `mapping.schema_drift_handling === 'abort'` fails the job, creates a Jira ticket with reason `schema_drift`, and returns. `'alert'` logs a warn and continues. Any other value (null, or `'none'`, the only other value the CHECK allows, `attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql:6339`) continues silently (:1625-1673).
  - Drift anomaly severity: `high` if any field is missing; else `medium` if more than 3 new fields; else `low`. When there are no differences it stays `medium` (:1586-1596).
  - Cross-file check runs only if `runSchemaValidation`, not single file, and more than 1 file (:1689). It compares every file's sorted field names to the first file's. Any mismatch fails the job with "All files matching a pattern must have identical schemas". Files whose schema can't be extracted are skipped with a warn (:1689-1762). It runs even without a schema defined.
  - Multi-source join is active only if `has_multi_source_join` and `source_catalog.length > 1` and `join_specs.length > 0` (:1791-1793).
    - Secondary sources are loaded one file each (the first match, "for now", :1844) into a map keyed `${joinNodeId}_left|right`.
    - Keys are `String(value || '').trim().toLowerCase()` joined by `|` (:1879). A numeric 0 or `false` becomes an empty key.
    - A failed secondary source load is logged and skipped. The job continues (:1917). Rows are not dropped because of the failed load: `applyJoinEnrichment` skips a join spec whose lookup table is missing or empty (`continue`, :383-393), so rows pass through unjoined even for an INNER join. An empty secondary file (no keys) behaves the same way (:378-380).
  - Files are processed sequentially. After each file `files_processed`, `rows_read`, `rows_written`, `rows_failed` are updated (:2119).
  - Final status is `completed_with_warnings` if any file had a `log_warn` violation, else `completed` (:2199). `files_processed` is set to `matchingFiles.length` regardless of failures (:2202).
  - A failed file adds `file.row_count || 0` to `totalRowsFailed`. Cloud files always have `row_count: 0` (:1492), so this adds 0 (:2171).
  - Profiling and anomaly detection (`executeAnomalyDetection`) run only if `runProfilingChecks && !dryRun && file.file_id` (:2150). `file_id` is always `null` for cloud files (:1490). See DEAD.
  - Early-return paths and `transformation_executions`: the drift-abort (:1659) and cross-file mismatch (:1748) returns do not call `updateTransformationExecution`, so the tracking row stays unfinished. The no-files path does update it (:1414).
  - Edge row counts for visual runs: `nodeOutputCounts` is cached and read first in `getNodeOutputCount` (:1977), so for multi-file visual runs the counts stay at the values from the first file (inferred from the cache-first read). Visual-only impact.
- **Error cases:**
  - Mapping not found throws (:2499).
  - Vendor agreement not found throws (:2519).
  - Any thrown error: job set to `failed` with `error_message`, notification, optional Jira ticket (only when `error.code === 'DQ_ABORT'`, which can't reach here, see BUG), file audit with `errorType:'execution_error'`, WS error event, temp mapping deleted, alert emitted, error rethrown (:2331-2482).
  - If `job` is still null when the error happens (createJob failed), nothing is recorded and the error is rethrown.

### 2. createJob(pool, mappingId, userId, options)  (:821)
- **Trigger:** routes/transformations.js:966 and executeTransformationJob.
- **Inputs:** `mappingId` (looked up in `transformation_mappings.mapping_id`). Options: `mappingGroupExecutionId`, `scheduleId`, `workflowExecutionId`, `visualWorkflowExecutionId`.
- **Output:** the inserted row (`RETURNING *`). The INSERT does not set `start_time`; the column has `DEFAULT CURRENT_TIMESTAMP` and type `TIMESTAMP WITHOUT TIME ZONE` in the prod dump (`database_ddl_2026-01-07.sql:2147`). The migration also has the default (`createETLTransformationTables.js:80`).
- **Side effects:** INSERT into `transformation_jobs` with `executed_by=userId`, `status='running'`, `project_id` copied from the mapping, `correlation_id=jobId` (:843-861). No `pending` state is ever written, although the column default is `'pending'` (prod dump :2146). `transformation_jobs.project_id` is `NOT NULL` in the prod dump (:2164), so a mapping with a null `project_id` would fail at this INSERT (inferred, not run).
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
- Levels used: `info`, `warn`, `error`, and also `warning` (:3475, :3485, :3501), which is inconsistent. `transformation_logs.log_level` is `VARCHAR(20) NOT NULL` in the prod dump (`database_ddl_2026-01-07.sql:2192`). The `database_ddl_*` dumps contain no CHECK constraints at all, so they cannot show whether one exists. The `FileSence_prod_schema_Jan_05_*` dumps list 43 CHECKs each, none on `transformation_logs`, whose definition is at `attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql:6272-6280`. On that evidence `'warning'` is accepted (inferred).

### 7. getMappingConfig(pool, mappingId)  (:2492)
- Returns the `transformation_mappings` row.
- With a `vendor_agreement_id`, it overwrites `source_connection_id` with `vendor_agreements.vendor_connection_id`. It also adds `vendor_agreement_metadata {owner, path, agreement_name}`, where owner is the contact name, else contact email, else null (:2505-2532).

### 8. processFile(pool, file, mapping, jobId, options)  (:2852)
Per-file pipeline. Returns `{rowsRead, rowsWritten, rowsFailed, hasWarnViolations}` (:4812). The archive branch returns a different shape (:3167).
- **Download:** `downloadFileFromConnection`.
- **Type by extension:** `file.filename.split('.').pop().toLowerCase()` (:2882).
- **Archives** (`zip, 7z, tar, gz, tgz, bz2, tar.gz, tar.bz2`, :33):
  - Require a `vendor_agreement_id`, otherwise an error "Unsupported file type" (:2892).
  - The password comes from the vault via `getArchivePasswordFromVault`: the file schema matched by pattern (or the first schema as fallback), then `encrypted_passwords` for entity type `vendor_agreement_file_schema`, then `vendor_agreement`. Errors give null (:521-607). If the agreement has no active file schemas the function returns null before the agreement-level lookup (:532-534), so the `vendor_agreement`-level password is only tried when schemas exist but none has a stored password. The pattern match here is against the full `filename` path, whereas `getFixedWidthSchemaFromAgreement` matches the basename (:549 vs :680-684).
  - The archive is written to `os.tmpdir()/archive_<ts>_<basename>` and extracted. Nested archives are skipped.
  - Only csv, json, xlsx, xls, xml and parquet are processed. Anything else is skipped with a warn.
  - A failing extracted file adds 1 to rowsFailed and processing continues.
  - Source rows are capped at 100 per extracted file for the returned sample.
  - RDM enrichment is applied if `rdm_lookup_enabled`. The upload to target happens in this branch.
  - Governance, contract DQ, quality-rule DQ, profiling, audit and lineage are all skipped in the archive branch. See Flags.
  - With a join configured, the archive branch passes empty mappings and variables to the parser (:2970-2972), but `applyJoinEnrichment` and the post-join re-mapping exist only in the normal path (:3513 onwards). Archive rows with a join are therefore neither joined nor mapped.
- **Fixed-width / headerless:**
  - `FIXED_WIDTH_EXTENSIONS=['dat','fixed_width','txt']` (:34).
  - For a vendor-agreement mapping and a fixed-width type or `csv`, `getFixedWidthSchemaFromAgreement` is consulted (:3198).
  - `getFixedWidthSchemaFromAgreement` (:616-744) matches the file basename against the agreement's active schemas by priority. If no pattern matches, it next looks for a schema whose `file_type` equals the file extension, or `fixed_width` with extension `dat` or `txt` (:659-677). Only if that also finds nothing does it fall back to the first active schema (`matchedSchema = result.rows[0]`, :679-687). `hasHeader` defaults to true when null (:732). `headerDefinition` is the schema's `header_definition` (JSON-parsed if a string); if that is empty it is taken from the `schema` column (bare array or `.columns`) when any column has `width` or `start_position` (:689-727). A plain CSV with no pattern match and no `file_type` match can therefore inherit another file's schema, including `has_header=false` and a `header_definition`, and be parsed as headerless CSV (:3262-3264).
  - The fixed-width branch runs only when the matched schema has `fileType` in `fixed_width|dat|binary` and a `headerDefinition` (:3256-3259, :3276). The test is on the schema's `fileType` only, not the file extension (:3256-3259), so a `.csv` that picked up a fixed-width schema is parsed as fixed width. It uses `parseFixedWidthBuffer` (:753-785): lines are split on `\r?\n`, blank lines are dropped, `hasHeader` skips the first non-blank line, `start_position` defaults to 0 and `width` to 10, values are trimmed, and columns are ordered by `start_position`.
  - A CSV with `hasHeader===false` uses the schema's column names (:3262-3264), and this headerless branch also requires `headerDefinition` (:3335); without it the file goes to the normal CSV parser.
  - Otherwise a `.txt`, `.dat` or `fixed_width` file hits the throw "Fixed-width file detected ... require a vendor agreement" (:3413), even when a vendor agreement exists but its matched schema is not of a fixed-width file type or has no `headerDefinition`. A vendor agreement is necessary but not sufficient.
  - Any other extension throws "Unsupported file type" (:3420).
  - Supported types: csv, json, xlsx/xls, parquet, xml (plus fixed-width via agreement).
- **Field mappings:**
  - If a join or a crosswalk is configured, the parser gets empty mappings and variables. Mappings are re-applied after enrichment: after the join (:3539-3621) and after RDM (:3657-3707). When both a join and a crosswalk exist, field mappings are therefore applied twice (post-join :3542-3621 and post-crosswalk :3662-3707). `hasCrosswalkEnrichment` is true only when `rdm_lookup_enabled` and a crosswalk config exists (:3270).
  - If a post-join or post-crosswalk row transform throws, the original row is kept (:3609, :3691).
  - A post-transform row with zero keys is dropped (:3601, :3684).
  - Join enrichment failure (:3626), and RDM enrichment failures (:3653, :3705) each throw and fail the file (the per-file loop swallows it, see BUG 2). Only contract DQ and quality-rule DQ errors are swallowed inside `processFile`.
- **Row-level errors:** a row whose transform throws increments `rowsFailed` and is skipped (CSV :5112). The CSV parser keeps empty transformed rows (it only warns, :5103), whereas the fixed-width path drops them (:3316).
- **Contract DQ** (:3443-3510):
  - Runs when there is a vendor agreement and the matched schema has column `quality_rules` or `file_quality_rules`.
  - It needs `mapping.project_id`: with a null project, governance is the empty object (:3218) and contract DQ is silently skipped (inferred from the governance path; `createJob` would already have failed on a null project, see Entry 2).
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
  - If `convertToParquet` fails, it falls back to JSON content (:5713-5717) while the file keeps the `.parquet` name (a second mislabel).
  - `convertToCSV` writes `row[header] || ''` (:5602), so numeric 0 and boolean false become empty strings. Headers come from the first row only (:5595), so extra columns in later rows are dropped. Quoting covers only `,` and `"` (:5604), not newlines.
  - Name: `target_file_name`, with `<current_date>` replaced by UTC `YYYYMMDD` and `<current_timestamp>` by Unix seconds (:792-802). The extension is forced to the output format. Without a target name, the source name with its extension swapped (`generateOutputFilename`, :5554, which ignores `mappingName`). `target_file_path` is prepended with slashes trimmed.
  - If there are rows but no target connection: archive branch logs a warn (:3154); the normal branch has no such warn and does not upload.
  - A dry run or zero rows skips upload, audit and target profiling (they sit inside the same `if` block).
  - `uploadFileToConnection` (:4098) is outside the audit try/catch, so an upload error fails the file (swallowed by the per-file loop) while the job still completes. Audit, lineage and target profiling errors are swallowed (:4803).
  - After upload: file audit for source and target, a `files` row `transformed_<jobId>_<filename>` (with `quality_score` if DQ ran), lineage, then target profiling (`fileRole:'target'`) with PII columns merged from the agreement and `mapping.pii_columns`.
  - Lineage rule (:4329-4441): the code looks up an existing `transformation_lineage` row with the same `mapping_id`, `lineage_type='file-specific'` and `schema_fingerprint` equal to the combined source/target fingerprint (:4329-4337). If none exists, a new row is inserted. If one exists, it is not skipped: an UPDATE sets `created_at=NOW()`, `execution_id`, `output_file_id` and `column_mappings` on that row (:4426-4441). Consequences: on every run with an unchanged schema the existing row is overwritten and its earlier `output_file_id` and `execution_id` are lost. The update path builds `column_mappings` without `mapping.pii_columns` (`contains_pii` at :4410 uses only the source metadata), while the insert path includes target PII tags (`isTargetPii`, :4530-4536), so target PII tags are dropped from `column_mappings` on update.
  - Audit capture failure is a warning only.
- **Errors:** any throw from this function is logged and rethrown (:4819-4826).

### 9. downloadFileFromConnection / listAndFilterFiles
These are re-exported from `../utils/cloudStorageFileList` (:10-14, :5902, :5904). The implementation is outside this file and not read here. Left unextracted for the area that owns that util. routes/visualMappings.js:1158 imports both, plus `parseFileToRows`.

### 10. parseFileToRows(buffer, filename, pool, vendorAgreementId)  (:79, exported :5903)
Generic parser used for secondary join sources (:1850), for archive contents inside itself (:315), and by routes/visualMappings.js:1210 (`parseFileToRows(fileBuffer, filename, pool, vendorAgreementId || null)`). Read in full in fix round 1. Extension is `filename.split('.').pop()?.toLowerCase()` (:81).
- **csv, txt, tsv** (:84-129): content split on `\n`, blank lines removed. Delimiter is tab if ext is `tsv` or the first line has a tab and no comma; `|` if the first line has a pipe and no comma and no tab; else `,` (:92-97). The first line is the header (quotes stripped at the ends, trimmed). Data lines are parsed by a hand-written quote toggler (a `"` flips the in-quotes state, so `""` escapes are dropped), values are trimmed, and a missing or empty value becomes `''` (:126). Quoted values containing newlines break rows because the split is on `\n`. A file with no non-blank lines returns `[]` (:88).
- **json, jsonl, ndjson** (:130-153): `jsonl`/`ndjson` parse line by line and invalid lines are skipped silently. `json` uses `JSON.parse` without a try/catch, so malformed JSON throws to the caller. A non-array JSON object yields the `data` array, else the `rows` array, else no rows.
- **xlsx, xls** (:154-160): first sheet only, via `sheet_to_json`. Not wrapped in try/catch.
- **parquet** (:161-175): `hyparquet`; errors are logged and the rows read so far are returned.
- **xml** (:176-206): `fast-xml-parser` with attribute prefix `@_` and text node `#text`; the first array found in a depth-first walk of the parsed object is used as rows; errors are logged and swallowed.
- **avro** (:207-218): `require('fastavro')`; failure is logged as a warn and returns no rows. No `package.json` in the repo mentions `fastavro` (Grep of `**/package.json`), so this probably always yields `[]` (inferred; not run).
- **dat and the `FIXED_WIDTH_EXTENSIONS` list** (:219-252): `txt` is consumed earlier by the csv branch (:84), so this branch is reached only by `dat` and `fixed_width`. It detects tab, `|` or `,` on the first line (in that order); if one is found the file is parsed as delimited with the first line as header (no quote handling); if none, each line becomes `{line_number, data}`. Errors are swallowed.
- **sas7bdat, xpt** (:253-255): warn and return `[]`.
- **Archives** (`ARCHIVE_EXTENSIONS`, :256-349): written to a `join-extract-` temp dir, password from `getArchivePasswordFromVault` when `pool` and `vendorAgreementId` are set, virus scanner is the same always-clean stub (:284-286), then the first extracted file with extension in csv/json/jsonl/xlsx/xls/parquet/xml/txt/tsv/avro/dat is parsed recursively and the loop stops (`break`, :321). Errors are logged and swallowed; temp dirs are removed.
- **Any other extension** returns `[]` silently (:351).
- Differences from processFile's parsers are listed under DUPLICATE 1.

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
  - `transformation_jobs` (columns used: job_id, mapping_id, mapping_name, executed_by, status, mapping_group_execution_id, schedule_id, workflow_execution_id, visual_workflow_execution_id, project_id, correlation_id, files_processed, rows_read, rows_written, rows_failed, schema_validation, error_message, start_time, end_time, duration_ms, updated_at). The prod dump (`database_ddl_2026-01-07.sql:2142-2169`) has `executed_by INTEGER` and no `user_id`, and also has `failure_reason_code` (enum), `execution_metadata`, `triggered_by` and `file_id`, which the engine never writes.
  - `transformation_logs`, `transformation_executions` (status, completed_at, result), `anomalies`, `quality_rule_violations`, `files` (target rows, quality_score), `transformation_lineage`.
  - Audit ledger, file audit and schema tables (via fileAuditService).
  - `DELETE transformation_mappings WHERE is_temporary = true`. The foreign key from `transformation_jobs.mapping_id` to `transformation_mappings(mapping_id)` is defined differently in the sources. Best prod evidence: `ON DELETE SET NULL` in `attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql:7772` and `..._1767956647766.sql:7772` (the later of the two postdates `database_ddl_2026-01-07.sql`, and the `database_ddl_*` export format is lossy: it lists no CHECK constraints at all). Noted disagreements: no ON DELETE clause in `database_ddl_2026-01-07.sql:3449` and `attached_assets/database_ddl_1767770486833.sql:3764`; `ON DELETE CASCADE` in the migration (`createETLTransformationTables.js:75`). With SET NULL the DELETE succeeds and the job's `mapping_id` is nulled. If the no-ON-DELETE form were live, the DELETE would raise an FK error (caught and logged as a warn, so temporary mappings would never be cleaned up); with CASCADE the job rows and their logs and results would be deleted. All outcomes are inferred from DDL; none was run.
- **External:** cloud storage connections (download/upload), the Python profilers (via transformationProfilingService), JiraService, Notification service, WebSocket.
- **Temp files:** `os.tmpdir()/archive_*`, `join-extract-*` (parseFileToRows).

## Flags

### BUG
1. **DQ abort does not fail the job.**
   - Abort sets the job to `failed` (:3899) and throws `DQ_ABORT`. The per-file `catch` in `executeTransformationJob` does not rethrow (:2170-2195).
   - After the loop, the job is set to `completed` or `completed_with_warnings` (:2199-2207), overwriting `failed`. The completion notification and alert fire as success.
   - The outer-catch handling of `DQ_ABORT` (Jira ticket, :2358, and the failure notification metadata, :2342) is unreachable from `processFile`.
   - The test backend/tests/jobExecutionEngine.qualityRuleNames.test.js:551-554 documents "Per engine design ... does NOT re-throw". That justifies later files still running. It does not explain the status overwrite.
2. **Any per-file failure is hidden in the job status.** Failed files (missing format, download error) still yield `completed` with `files_processed = matchingFiles.length` (:2202). A job where every file failed is `completed`.
3. **Schema-drift anomaly never saved.** The INSERT at :1598-1618 references `sourceFileId` and `sourceName`, which are not defined anywhere in that scope (Grep: only these uses plus unrelated `sourceName:` and `sourceFileId: file.file_id` object keys at :4386/:4498). That throws a ReferenceError, caught at :1621 and logged as a warn "Failed to create anomaly record".
4. **Cancel does not stop a running job.** `cancelJob` sets `cancelled`, but the engine has no check for `cancelled` (the string appears only in cancelJob). The running job continues and its final `updateJob` overwrites status with `completed` or `failed` (:2200).
5. **cancelJob reads a column that does not exist.** `_cancelledJob.user_id` (:5875), but createJob writes `executed_by` (:845) and `transformation_jobs` has `executed_by` and no `user_id` column in the prod dump (`database_ddl_2026-01-07.sql:2142-2169`; the `attached_assets` dump matches). So `user_id` is always undefined and the cancel notification has no user.
6. **Dead `file_id` makes profiling and anomaly detection never run.** See DEAD 1.
7. **RIGHT and FULL OUTER joins act as INNER.** Row counts shown on the visual edges use RIGHT/FULL logic (:2036-2041) while the data join treats them as INNER (:467).
8. **Join and key coercion.** `String(row[col] || '')` makes 0 and false match empty strings (:420, :1879).
9. **Early-return failures skip the notification, alert and temp-mapping cleanup.** No-files, drift-abort and cross-file-mismatch paths return without them (:1471, :1659, :1748). The no-files path also does not fire a notification. A temporary visual mapping stays in `transformation_mappings` in those cases (unless the caller cleans up).
10. **Fallback format is mislabeled.** Unsupported output format is written as CSV but the file is named with the requested extension (:5582, :4075). A failed parquet conversion is written as JSON under the `.parquet` name (:5713-5717).
11. **Fixed-width extension rule is stricter than a vendor agreement.** `txt` is listed as fixed-width (:34), and a `.txt` (or `.dat`, `fixed_width`) file only avoids the throw at :3413 if the matched agreement schema has a fixed-width `fileType` and a `headerDefinition` (:3256, :3276). `headerDefinition` can come from the schema's `header_definition` or, when that is empty, from the `schema` column if any column has `width` or `start_position` (:699-727). A plain `.txt` therefore fails even with a vendor agreement unless one of those holds, although `parseFileToRows` treats `txt` as CSV (:84).
12. **Mixed log levels.** `'warning'` vs `'warn'` (:3475-3501 vs elsewhere). If `transformation_logs.log_level` is filtered by level in the UI (routes/jobs.js:433-435 uses an exact match), these rows won't match `warn`.
13. **Suspicious error counting.** `rowsFailed` in the archive branch counts each failed extracted file as 1 (:3044), while normal files count rows.
14. **Lineage row overwritten on every unchanged-schema run.** The earlier `output_file_id` and `execution_id` are lost and target PII tags are dropped from `column_mappings` on the update path (:4426-4441 vs :4530-4536). See Entry 8, Upload.
15. **`convertToCSV` loses falsy values and later columns.** `row[header] || ''` (:5602) turns 0 and false into empty strings; headers come from the first row only (:5595).
16. **Wrong fallback schema.** When no pattern matches and no schema's `file_type` matches the extension (:659-677), `getFixedWidthSchemaFromAgreement` uses the first active schema (:679-687), so a CSV can inherit a headerless or fixed-width definition from another file's schema (:3262-3264).
17. **Archive plus join.** Archive rows are neither joined nor mapped when a join is configured (:2970-2972, :3513 onwards).
18. **Caller bugs on this contract.** workflowOrchestrationEngine.js:75 omits `pool` (see Entry 1); mappingGroupExecutionEngine.js:110-124 treats a non-throwing failed return as `completed`; TransformationService.js:453 reads `result.job_id` (engine returns `jobId`).

### SECURITY
1. `updateJob` builds `SET <key> = $n` from `Object.keys(updates)` (:969-973). Column names are not whitelisted. Only internal callers were seen (including routes/transformations.js:1017 with fixed keys), so nothing was exploitable that I could see.
2. The virus-scan service passed to archive extraction is a stub that always reports clean (`isInfected:false, skipped:true`, :2921-2924, and again :284-286 in `parseFileToRows`). Archives from vendors are extracted without scanning.
3. The engine itself has no authorization. Any caller can run any mapping id or cancel any job id. Checks exist only in the routes (cancel requires `jobs:write` + `validateJobAccess`). The manual-run route's permission check was not traced.
4. The archive password lookup builds a regex from the agreement's `file_name_pattern`, escaping only `.`, `*`, `?` (:543-546). A pattern with other regex characters changes the match or throws (caught, returns null).
5. `logJobExecution` stores stack traces in `transformation_logs` (e.g. :2192, :4823), which the log routes return to users (routes/jobs.js:441).
6. Extraction temp file name uses `path.basename(file.filename)` (:2910), which is safe for traversal. Extracted entries are read from `extractedFile.fullPath` returned by ArchiveExtractionService. Path safety of that service is not verified here.

### DUPLICATE
1. File parsing is implemented in two places: `parseFileToRows` (:79, supports tsv, jsonl, avro, delimiter detection, treats `txt` as CSV) vs the `parseAndTransform*` family in `processFile` (csv, json, xlsx/xls, parquet, xml, plus the fixed-width path, where `txt` is fixed-width). Supported extension sets differ.
2. The per-format parse call plus "delay field mappings when join/crosswalk" block is repeated 7 times in the normal branch of `processFile` (fixed-width, headerless CSV, csv, json, xlsx, parquet, xml; :3276-3412) and again in the archive branch (:2968-3022). The archive branch only delays for joins (:2970), not crosswalk enrichment, so archives with a crosswalk run expressions before crosswalk columns exist.
3. The target upload block (filename, convert, upload) appears twice, in the archive branch (:3104-3162) and the normal branch (:4058-4107). The archive copy strips archive extensions; the normal copy does not.
4. The "minimal files row for target" INSERT appears 4 times (:4168, :4741, :4777, plus the DQ-score variant :4133).
5. Schema comparison: three ways to detect drift: `validateFileSchema` (vendor agreement), a field-name list comparison (:1531-1534), and the cross-file check (:1713-1714). `validateSchemaConsistency` and `saveSchemaSnapshot` are imported but unused.
6. Pattern matching for vendor schema is done three ways: `matchesPattern` (:2611), an inline regex in `getArchivePasswordFromVault` (:543, full path), and another in `getFixedWidthSchemaFromAgreement` (:635-679, basename).
7. Output filename logic is duplicated by `generateOutputFilename` (:5554) and the `target_file_name` branch.
8. Field mappings are applied twice when both a join and a crosswalk exist (:3542-3621 and :3662-3707).

### DEAD
1. The profiling and anomaly step at :2150. `file.file_id` is always `null` (:1490), so `executeAnomalyDetection` never runs from the engine.
2. `calculateColumnStatistics` (:2742): defined, never called in this file.
3. Unused imports (Grep count 1 each): `validateSchemaConsistency`, `saveSchemaSnapshot`, `profileETLOutputFile`, `profileETLFile`, `downloadAndProfileFile`, `parseExpressionToTransformation` (used only inside convertFieldMappings).
4. `nodeExecutionMap` is destructured at :1151 and never read again (Grep: single hit).
5. `skipFirstRow ? 0 : 0` (:5059) is a no-op.
6. The `mappingName` parameter of `generateOutputFilename` is unused.
7. Dry-run mode never uploads or profiles the target, and the schema-drift anomaly never saves (BUG 3).
8. The chained-PII inheritance branches in the lineage block (`file.file_id` required, :4361 and :4473) never run because `file.file_id` is always null.

### UNCLEAR
1. Whether `completed` with all files failed is intentional (BUG 2). Tests document only the no-rethrow part.
2. `severity='medium'` default when `differences` is null. `newFields.length > 3` yields `medium` while 1-3 new fields yield `low` (:1591-1595).
3. Contract DQ looks at only 100 sample rows (:3461) while quality-rule DQ uses up to 1000 source rows (:5046). Intent not stated.
4. Whether cancelled jobs are meant to stop (comment says "Only cancel if job is in a cancellable state (pending, running)", :5861, but no `pending` status is ever written).
5. For vendor-agreement mappings, `source_connection_id` is overwritten from the agreement (:2525) and `file_path` is still used. Whether the drop-location path should replace `file_path` is not stated.
6. `quality_rule_columns` override keyed by rule id: shape unknown beyond :3787-3796.
7. `duration_ms` uses DB `start_time` vs `Date` in Node: time-zone behaviour not checked. `start_time` is `TIMESTAMP WITHOUT TIME ZONE` in the prod dump.
8. The lineage source schema is built from `fieldMapping.sourceFields` only (:4310) while `columnMappings` use `source_field`, so the fingerprint may ignore `source_field`-style mappings; the output schema uses `inferDataType` of the first row only. Reported by the verifier; the block was not read in full.

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
1. Should a DQ abort fail the job? Today the final `updateJob` overwrites `failed` (BUG 1). Need a product decision, since a test pins "does not rethrow".
2. What do `listAndFilterFiles` and `downloadFileFromConnection` do (wildcards, recursion, size limits, partial download)? Owned by `utils/cloudStorageFileList`, outside this file.
3. Which callers pass `executionOrder`? Partly answered: `nodeExecutionMap` is passed by `backend/services/visualWorkflowExecutor.js:538` and `backend/routes/visualMappings.js:704` (both `transformationMapping.node_execution_map`) and the engine never reads it (DEAD 4). `executionOrder` callers were not compared.
4. `validateFileSchema`, `enforceSchemaRulesForJob`, `executeAnomalyDetection`, `profileFileBuffer`, `loadRDMContext`, `applyRDMLookups`, `transformRow` are called here but not analysed (they belong to SCHV, DQ, PROF, RDM/transformation areas).
5. The lineage block (:4302-4640) and column PII mapping logic were read only at the points cited under Entry 8. Business rules there beyond the insert-or-update decision are not extracted.
6. Are secondary-source files expected to be multi-file? Comment says single file "for now" (:1844).
7. Which schema source is live for the `transformation_jobs_mapping_id_fkey` constraint? The `FileSence_prod_schema_Jan_05` dumps (`ON DELETE SET NULL`) are treated as the best evidence, but the `database_ddl` dumps and the migration differ (see Data touched), and nothing was run against a live database.
8. Answered: `workflowOrchestrationEngine` is required only by `backend/routes/workflowSteps.js:9` (Grep of `backend/**/*.js`). Whether that route is reachable in production was not traced, so whether the call at workflowOrchestrationEngine.js:75 (which omits `pool`) runs in production remains untraced.

## Inventory corrections
- areas.md row EXE says "0 direct" entry points. This is accurate for HTTP, but the module exports 11 functions, and routes/jobs.js (`GET /api/jobs/:id`, `POST /api/jobs/:id/cancel`) call `getJobStatus` and `cancelJob` from this module. Check that these two routes are in the JOBS/ETL area rows.
- inventory.md:954 lists `transformation_jobs, transformation_logs` with owner EXE. In this file `transformation_executions`, `quality_rule_violations`, `anomalies`, `files` and `transformation_lineage` are also written and are not in that row.
