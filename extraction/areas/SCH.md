# SCH - Schema extraction, enforcement and history

Paths are relative to the repo root. `server.js` is the root file `server.js` (not `backend/src/server.js`).

## Summary

The area has six HTTP endpoints and one Python CLI. The rest is library code called by other areas.

- Schema read: GET `/api/files/:fileId/schema` (server.js:1822).
- Fixed-width schema config: GET, POST and DELETE `/api/files/:fileId/fixed-width-schema` (server.js:8672, :8693, :8728).
- Delimiter config with re-profile: POST `/api/files/:fileId/delimiter` (server.js:8749).
- Schema history: GET `/api/files/:fileId/schema-history` (backend/routes/schemaHistory.js:12, mounted at server.js:5282-5283).
- Header validation: `utils/header_validator.py`, spawned by the worker (backend/workers/fileProcessingWorker.js:1824) and imported by profile_api.py:35, :1262.

Libraries:

- `backend/services/schemaService.js`: hashing, comparison, snapshots, drift, cloud sampling.
- `backend/services/schemaRuleEnforcer.js`: column and file rules declared in contract schemas.
- `backend/utils/schemaExtractor.js`: infers schema from a file on disk, and compares an uploaded schema to a contract schema by column name.
- `backend/utils/schemaParser.js`: parses a schema-definition file (xlsx, csv, json) into column definitions.
- `backend/utils/schemaFingerprint.js`.
- `backend/utils/fileDataValidator.js`: checks that a file has data.

There are two different schema comparison functions and several type-normalisation functions (see Flags).

## Entry points

### 1. GET /api/files/:fileId/schema (server.js:1822-1873)
- **Auth:** `authenticateToken`, `cacheMiddleware(600)`, `requireProjectAccess({resourceType:'file'})` (:1823-1827). Project access is checked.
- **Inputs:** `fileId` path parameter. No other validation.
- **Reads (as written in the handler):** `files(file_id, file_name, file_type, schema_metadata)` (:1834); `file_columns(column_name, data_type, description, contains_pii, column_order)` ordered by `column_order ASC` (:1846-1849).
- **Against the DDL in attached_assets/database_ddl_1767770486833.sql:** `files` has `filename`, not `file_name`, and has no `schema_metadata` (DDL :1401-1437). `file_columns` has `column_type` and `column_index`, with no `data_type`, `description`, `contains_pii` or `column_order` (DDL :1148-1176). No migration adds them (the only occurrences of `schema_metadata` and `column_order` are server.js:1834-1866). Against this DDL the query at :1834 fails, so the handler returns the 500 below on every call (see BUG 11). Whether the live database differs from this DDL file was not established.
- **Intended output (if the columns existed):** 200 `{fileId, fileName, fileFormat, schema:[{name,type,description,contains_pii}], columnCount, schemaMetadata}` (:1860-1867). `contains_pii` defaults to false (:1857). `schemaMetadata` defaults to `{}` (:1866).
- **Errors:** 404 `File not found` (:1839); 500 `Failed to fetch file schema` (:1870).
- **Rules:** response cached 600 s (value passed to `cacheMiddleware`, :1824). The caching is at the middleware, which was not traced.

### 2. GET /api/files/:fileId/fixed-width-schema (server.js:8672-8690)
- **Auth:** JWT. `app.use('/api/files', authenticateToken, schemaHistoryRoutes)` at server.js:5283 is registered before this route, and `authenticateToken` (backend/src/middleware/authenticate.js:17-38) returns 401 without a token. The route itself carries only `cacheMiddleware(300)` (:8672). No project or ownership check.
- **Reads:** `SELECT * FROM fixed_width_schemas WHERE file_id=$1` (:8676).
- **Output:** 200 the row as stored; 404 `No schema found for this file` (:8682); 500 (:8688).
- **Cache:** the 300 s `cacheMiddleware` is not invalidated by POST or DELETE (see BUG 12).

### 3. POST /api/files/:fileId/fixed-width-schema (server.js:8693-8725)
- **Auth:** `authenticateToken` only. No project or ownership check.
- **Input:** `body.schema_definition` must be an object with `columns` array, else 400 `Invalid schema definition. Must include columns array.` (:8698-8700). Each column needs a truthy `name` and `typeof width === 'number' && width > 0`, else 400 (:8703-8709). No check for duplicate names, offsets or total width.
- **Write:** `INSERT INTO fixed_width_schemas (file_id, schema_definition, created_by) ... ON CONFLICT (file_id) DO UPDATE SET schema_definition=$2, updated_at=CURRENT_TIMESTAMP` (:8711-8718). `created_by = req.user?.id || null`. In the DDL `created_by` is an INTEGER FK to users(id) (DDL :3600).
- **Output:** 200 the row; 500 on error.
- **Not done:** no re-profile is triggered. No file existence check. `fixed_width_schemas` has a unique index on `file_id` (DDL :4335) and no FK to `files`, so a POST for a non-existent `fileId` inserts an orphan row.

### 4. DELETE /api/files/:fileId/fixed-width-schema (server.js:8728-8746)
- **Auth:** `authenticateToken` only; no ownership check.
- **Effect:** `DELETE ... WHERE file_id=$1 RETURNING *` (:8732). 404 `Schema not found` if no row (:8738); 200 `{message:'Schema deleted successfully'}`.

### 5. POST /api/files/:fileId/delimiter (server.js:8749-8957)
- **Auth:** `authenticateToken`, then an in-handler project check (:8772-8784). The check is a `project_members` or `project_access_groups`/`user_groups` match; otherwise 403 `Unauthorized to access this file` unless `userHasAllProjectAccess(req.user)`.
- **Input:** `body.delimiter` required, else 400 `Delimiter is required` (:8755). The value is not validated against any allowed set.
- **Steps:**
  1. Load file. 404 `File not found` if missing (:8765).
  2. Parse `metadata` (JSON string or object). Set `metadata.delimiter`. Preserve `metadata.header_config` (:8787-8795). UPDATE `files.metadata` (:8797-8800).
  3. `fileService.getFileById`. 404 `File details not found` if missing (:8806-8809). This 404 comes after the metadata UPDATE at :8797, so the new delimiter is already saved when this response is returned (see BUG 4).
  4. Locate the file.
     - If `metadata.s3_bucket` and `s3_key` are set, look up `storage_connections` by `config->>'bucket'`, `bucket_name` or `drop_location_bucket`, `LIMIT 1` (:8840-8846). Stream the object to `os.tmpdir()/reprofile/<fileId>_<filename>` (:8828-8866). No connection returns 500 (:8848-8853). A download failure deletes the partial file and returns 500 (:8870-8890).
     - Otherwise use `FILE_STORAGE_PATH || './file_storage'` + `created_at` date (first 10 chars) + filename (:8893). If missing, 500 (:8896-8901).
  5. `DELETE FROM profiling_metrics WHERE file_id=$1` (:8905).
  6. Enqueue `file-processing` with `qualityRuleIds: []`, `fixedWidthSchema: null`, `delimiter`, `headerConfig`, and options `attempts: 3`, backoff exponential 5000 ms, `timeout: 1800000` (:8912-8931).
  7. `UPDATE files SET processing_step='queued', failure_reason_code=NULL, processing_error=NULL` (:8936).
  8. Calls `invalidateFileCache(fileId)` and `invalidateFileCatalogCache` from `backend/src/middleware/cache` (:8942-8944). Whether this clears the cache entries written by `cacheMiddleware` is not established (see UNCLEAR 7).
- **Output:** 200 `{message:'Delimiter saved and file queued for re-profiling', delimiter}`. 500 `{error, details: err.message}` on error (:8952-8955).
- **Side effects of note:** the metadata is already updated (:8797) before the `File details not found` 404 (:8808), the file-location 500s (:8848-8901) and the enqueue. Profiling metrics are deleted before the enqueue. If the enqueue fails, the delimiter is saved but profiling data is gone (see BUG 4). `tempDir` files are never deleted by this handler; whether the worker cleans them was not traced.

### 6. GET /api/files/:fileId/schema-history (backend/routes/schemaHistory.js:12-340)
- **Mount:** `app.use('/api/files', authenticateToken, schemaHistoryRoutes)` (server.js:5282-5283). The route also has `authenticateToken` (:12). Authentication is applied twice. No project or ownership check anywhere.
- **Steps:**
  1. Load `files(logical_file_id, filename, project_id, vendor_agreement_id)`. 404 `File not found` (:18-29).
  2. If `vendor_agreement_id` is set, it is a "contract upload". Query `vendor_agreement_file_schemas` for that agreement. Rank by `$2 ~ vafs.file_name_pattern` (a Postgres regex match of the filename; 1 or 0), then `created_at DESC`, `LIMIT 1` (:45-70).
  3. If the pattern did not match, the latest schema is still used. `patternMatched` is returned as false and a warning is logged (:77-102).
  4. Snapshots from `file_schemas` where `logical_file_id=$1`, `ORDER BY captured_at DESC LIMIT 20` (:115-134). If none, 200 `{hasHistory:false, message:'No schema history found for this file', current:null, previous:null, comparison:null, logicalFileId}` (:136-145).
  5. Drift action: latest `transformation_jobs` joined to `transformation_mappings` where `tj.correlation_id` equals this file's `correlation_id`. Returns `schema_drift_handling` and `job_id` (:154-168).
  6. Group metadata from `logical_file_groups`. Fallback object if no row (:171-190).
  7. One snapshot: `hasPrevious:false`. Contract comparison is included if a contract schema was found (:194-243).
  8. Two or more snapshots: compare snapshots[1] (previous) to snapshots[0] (current) with `schemaService.compareSchemas`, plus the contract comparison if applicable. Return the `allSnapshots` list (:245-331).
- **Output fields:** `hasHistory, hasPrevious, current, previous, comparison{isIdentical, hasChanges, addedColumns, removedColumns, modifiedColumns, reorderedColumns, columnCountMismatch}, isContractUpload, contractSchema, contractComparison, driftAction, transformationJobId, totalSnapshots, logicalFileId, canonicalName, hasSchemaChanged, totalUploads, firstUploadAt, lastUploadAt, lastSchemaChangeAt, allSnapshots`.
- **Errors:** 500 `{error:'Failed to fetch schema history', message: error.message}` (:335-338). The raw error message is returned to the client.
- **Notes:** `contractSchema.schema` is `{columns: vafs.schema}`, so `vafs.schema` is assumed to be a column array (:82-84). If `logicalFileId` is null (file has no snapshot yet), the query `WHERE fs.logical_file_id = $1` matches nothing and the "no history" response is returned. `file_name_pattern` is glob style elsewhere in the code (see BUG 9).

### 7. header_validator.py CLI / `validate_headers` (utils/header_validator.py:495-645)
- **Trigger:** the worker spawns it (fileProcessingWorker.js:1824-1841, via `run_python_with_venv.sh`). profile_api.py also imports it (profile_api.py:35, :1262).
- **Inputs:** `argv[1]` file path, `argv[2]` file type. Fewer than 3 argv: prints JSON error and exits 1 (:632-637). `sample_rows` default `10000` (:495). `import json` is at module top (:20), so the usage branch at :633 works.
- **Supported types:** csv, txt, json, parquet, excel (xlsx and xls map to excel), xml. Anything else returns `{success:false, error:'Unsupported file type: ...'}` (:563-567).
- **CSV and TXT:** reads the first 8192 characters and runs `csv.Sniffer`. On sniffer failure the delimiter defaults to `,` (:521-530). Raw headers are stripped of whitespace. All exceptions are swallowed (`except: pass`, :536-537).
- **Checks, in order:** duplicate column names, multiple headers, no headers, orphan headers, missing headers (:572-595).
  - Multiple headers: checks the first `min(5, len(df))` rows (default `sample_size=5`) with `is_header_like(threshold=0.6)` (:216-233). Fewer than 2 rows means no issue. Severity "high" (:239).
  - No headers: a column name is auto-generated if it matches `^Unnamed: \d+$`, `^Column\d+$`, `^Field\d+$` or `^\d+$`. Flagged if the ratio is `>= 0.5`, severity "high" (:256-281). The ratio divides by `len(col_names)` (:272); on an empty frame this raises ZeroDivisionError, which is caught at :622 and returns `success:false`.
  - Orphan headers: a column is flagged if its null ratio is `>= 0.95` (`null_threshold` default, :286-295). Severity "medium" (:305). The ratio divides by `len(df)` (:293).
  - Missing headers: severity "medium" (:352).
  - Duplicate column names: severity "medium" (:484).
- **Scoring (:601-610):**
  - 0 issues: status `healthy`, score 100.
  - Any issue with severity `high`: status `critical`, score `max(0, 100 - issues*25)`.
  - Otherwise: status `warning`, score `max(0, 100 - issues*15)`.
- **Output:** `{success, status, health_score, total_columns, total_rows_sampled, issues_found, issues[]}`. Exceptions return `{success:false, error}` (:622-626).
- The worker's treatment of failures is in PROC (PROC.md:117, step 12: any failure resolves to the healthy default; code at fileProcessingWorker.js:1829, :1862).

## Library behaviour (called by other areas)

### schemaService.js
- **`generateSchemaHash(schema)`** (:90-102). SHA-256 of `name:normalizedType` joined with `|`, columns sorted by `col.index ?? arrayIndex`. Names are case-sensitive. Order matters.
- **`normalizeType`** (:110-148). Maps object, str, string, text and varchar to `string`; int64, int32, int16, int8, integer, int, bigint and smallint to `int`; float64, float32, float16, float, double, decimal, numeric and real to `float`; bool and boolean to `boolean`; datetime64[ns], datetime64, datetime, timestamp and timestamptz to `datetime`; date to `date`; time and timedelta variants to `time`. Anything else is lowercased and returned. Null becomes `string`.
- **`compareSchemas(s1, s2)`** (:166-260). Result fields are `isIdentical`, `columnCountMismatch`, `addedColumns`, `removedColumns`, `modifiedColumns`, `reorderedColumns`.
  - If either schema lacks `.columns`, it logs with `console.error` and returns the "identical" default (:177-183).
  - Names are compared case-sensitively.
  - A type change is reported only if the normalised types differ.
  - `reorderedColumns` is computed only when there is no count mismatch and no added or removed columns. The comparison is by array position. It is informational and does not affect `isIdentical` (:243-256).
- **`saveSchemaSnapshot(pool, fileId, filename, schema, filePattern, rowCount, projectId)`** (:467-559).
  - Resolves the logical file group.
  - Loads the latest previous snapshot in the group by `captured_at DESC`.
  - Schema change = hashes differ AND previous `columns.length > 0` (:495).
  - Inserts into `file_schemas` with `ON CONFLICT (file_id, schema_hash) DO UPDATE SET captured_at=CURRENT_TIMESTAMP, logical_file_id` (:511). The DDL has a unique index on `(file_id, schema_hash)` (DDL :4289).
  - If changed, sets `logical_file_groups.has_schema_changes=true` and `last_schema_change_at`.
  - Updates `files.schema_definition` and `logical_file_id`.
  - Returns the row plus `has_schema_change` and `schema_differences`.
  - Callers: fileProcessingWorker.js:1241 and jobExecutionEngine.js:7 (imports `saveSchemaSnapshot` and `inferDataType`).
- **`resolveLogicalFileGroup`** (:406-454). Canonical name from `normalizeFilename(filename, filePattern)`. The group is found by `(project_id, canonical_name)`. Existing group: `upload_count + 1`, `last_upload_at` updated. Otherwise it inserts with `upload_count = 1`. `projectId || 0` is used for the logical ID but raw `projectId` for the lookup (:410, :419). `has_schema_changes` is never reset to false in this code. With a null `projectId`, the logical ID is deterministic: `createLogicalFileId(0, canonicalName)` gives `logical_0_<sanitized name>` (backend/utils/filenameNormalizer.js:73-77; schemaService.js:410). The lookup `project_id = $1` never matches NULL (:416-419), so the INSERT runs with the same `logical_file_id` (:435-444). `ON CONFLICT (project_id, canonical_name)` does not catch it, and `logical_file_groups` has a unique index on `logical_file_id` (DDL :4400-4401), so the second and later null-project uploads of the same canonical name raise 23505. The catch rethrows (:450-452) and `saveSchemaSnapshot` fails (see BUG 13). `logical_file_groups` also has a unique index on `(project_id, canonical_name)` (DDL :4403).
- **`detectSchemaDrift`** (:568-612). Compares to the latest snapshot for the same `file_id` (not the logical group). Used by anomalyRulesEngine.js:175 (import at :3).
- **`validateSchemaConsistency(pool, fileIds)`** (:268-343). 0 or 1 files return `isConsistent:true`. Otherwise compares everything to the first file. Files with no schema are silently skipped (:287-294). Callers: transformations.js:9, jobExecutionEngine.js:7.
- **`getFileSchema`** (:351-396). Uses `files.schema_definition`, else builds from `file_columns` via `extractSchemaFromColumns` (`nullable = null_count > 0`, :77).
- **`extractSchemaFromCloud`** (:621-745). Takes the first file matching the pattern. Looks up the connection in `transform_connections`, then `storage_connections`. Downloads from S3, GCS or Azure. Parses by extension through `parseFileSchema` (csv, json, xlsx, xls, parquet, xml). Caller: transformations.js:1127.
- **`inferDataType`** (:995-1027). Numeric values and numeric strings map to `integer` or `float` (by presence of "."). `true` or `false` map to `boolean`. A string starting with `\d{4}-\d{2}-\d{2}` maps to `date`. Everything else maps to `string`.
- **`parseFileSchema` for CSV** (:757-788). Types come from the first data row only. In the `data` handler, `columns[index].type` is overwritten for every row while `columns[0].type === 'string'` (:775). So when column 0 is a string, every row re-infers every column, and the last non-empty value wins. When column 0 is not a string, no further rows are used.
- **`inferParquetType`** (:976-988). `parquetType.toString()` containing "int" gives `integer`.
- **`extractSchemaFromBuffer`** (:1049). Caller: jobExecutionEngine.js:1524, :1697.

### schemaExtractor.js
- **`inferType`** (:16-49). Order: boolean, integer, float, date (`\d{4}-\d{2}-\d{2}` or `\d{1,2}/\d{1,2}/\d{4}`), then timestamp, then string. The timestamp check is unreachable (see DEAD).
- **Type sampling.** Each column's type is the most common type among the first 10 non-empty values of the first 100 rows (:151, :163). Tie: the first key of the count object (`mostCommonType[a] > mostCommonType[b] ? a : b` keeps `b` on a tie, so the later key wins).
- **`extractSchema(filePath, fileType, options)`** (:534-595). `fileType` may be a MIME type (mapped by `mimeTypeToExtension`, :504-523; `application/octet-stream` deliberately unmapped), an extension, or empty (taken from the path). Compound extensions (.tar.gz, .tgz, .tar.bz2, .tbz2, .sas7bdat, .xpt) override (:552-560). Formats:
  - csv, xlsx, xls, json, xml, parquet: parsed in Node.
  - zip, tar, tar.gz, tgz, tar.bz2, tbz2, sas7bdat, xpt, avro, dat: `extractSchemaViaConversion`.
  - Other: throws `Unsupported file type`.
- **`extractSchemaViaConversion`** (:415-497). POST to the hard-coded `http://localhost:8000/api/vendor-profile` with a timeout of `120000` ms (:443-445). The file path is sent as `local_file_path`. Types come from `column_profiles`, default `string`.
- **`compareSchemas(uploaded, expected)`** (:626-682). Names are compared case-insensitively. Types are not compared (comment :670). A missing expected column gives `valid=false` and an error. An extra column is only a warning. Callers: server.js:2752 and :4161 (contract validation at upload).
- **`normalizeDataType`** (:59-125). Maps pandas types to `string`, `int`, `float`, `decimal`, `boolean`, `datetime`, `date`, `time`. Unknown types are returned unchanged. Callers: server.js:1932, :6332, :6603.

### schemaParser.js
Parses a schema-definition file (not a data file).
- csv, xlsx, xls and json only (:279-317).
- Required fields are `column_name` or `name`, and `data_type` or `type`.
- `nullable` defaults to true (:126, :189, :256).
- Type map `DATA_TYPE_MAPPING` (:15-53). Unknown types default to `VARCHAR` (:63).
- Precision and scale come from the explicit columns or from `TYPE(p,s)` (:72).
- `validateSchema` rejects an empty array, a missing name or type, and duplicate names (case-insensitive) (:323-356).
- Caller: vendorAgreementService.js:11.

### schemaFingerprint.js
- **`generateSchemaFingerprint`** (:14-32). Names are lowercased and trimmed. Columns are sorted by name, so order does not matter. Types are normalised by substring match: `int`, `serial` or `bigint` gives `integer`; `float`, `double`, `decimal` or `numeric` gives `numeric`; `bool` gives `boolean`; `date` or `time` gives `datetime`; `json` gives `json`; otherwise `string` (:39-64). An empty or non-array input returns null.
- Caller: jobExecutionEngine.js:4304.

### fileDataValidator.js `validateFileHasData` (server.js:3790)
- **By extension.** csv, json, xlsx, xls and xml are checked. parquet, archives (.zip, .tar, .gz, .tgz, .7z) and everything else return `valid:true` (:10-30).
- **CSV** (:40-107). Reads up to 3 non-blank lines. 0 lines gives `empty_file`. 1 line gives `header_only_file`. Otherwise `checkForDuplicateHeaders` runs.
  - It splits on a literal `,` only (:124).
  - It flags `multiple_headers` when at least 60% (`>= 0.6`) of the first-data-row values equal the header names, case-insensitive (:153-156).
- **JSON** (:162-226). Error codes: `empty_file`, `empty_array`, `empty_object`, `invalid_json_structure`, `invalid_json`.
- **Excel** (:228-274). Reads 5 rows (`sheetRows: 5`). Error codes: `no_sheets`, `empty_file`, `header_only_file`, `read_error`.
- **XML** (:276-319). Valid if the pattern `<[^?!/][^>]{0,200}>` matches at least 2 tags. Error codes: `empty_file`, `invalid_xml`, `empty_xml`.
- **Failure.** Any thrown error returns `valid:false` with message `Failed to validate file: ...` (:31-37).

### schemaRuleEnforcer.js
- **`RULE_TYPE_MAP`** (:26-60) maps UI rule names to engine type and default config.
  - `null_check`, `column_completeness`, `isna_check` map to `completeness` with `{threshold:1.0}`.
  - `duplicate_check`, `uniqueness` map to `uniqueness`.
  - `email_validity`, `phone_validity`, `date_format`, `timestamp_format`, `numeric_only_string` map to `validity` with datatype email, phone, date, date, number.
  - `length_check` maps to `{min_length:0, max_length:255}`. `range_check` maps to `{min:0, max:999999}`.
  - `special_character_presence` maps to `validity_check` with `pattern '^[a-zA-Z0-9\\s]+$'`.
  - `validity_check` maps to `validity_check` with `{}`.
  - `record_count` maps to `record_count` with `{}`.
- **Severity.**
  - The literal `'warning'` is the severity argument passed to `findOrCreateSchemaRule` at :607, :666, :1209 and :1242, and its default (:94). It is used as the severity of a newly created `__schema_default__` rule.
  - Name-first, candidate-ID and broad lookups (:111-348) return existing rules with their own stored `severity`, and violations carry `rule.severity` (:897-1116).
  - Only the inline path hard-codes `'warning'` on its violations (:800, :822).
- **`findOrCreateSchemaRule`** (:94-439). Resolution order:
  1. Name-first lookup by `rule_name`. The rule must be enabled and global (`project_id IS NULL`) or in the given project (:109-136).
  2. Candidate IDs (`quality_rule_ids`), non-synthetic only (:173-252).
  3. "Broad" lookup of global rules by engine type. Excluded: record_count, length_check, range_check, validity_check, and any call with a config override (:269-348).
  4. For `record_count` on `__file__`: reuse any real enabled record_count rule. If none exists, return null and skip (no phantom row is created) (:362-396).
  5. Look up the synthetic rule `__schema_default__<type>` by name and column (:399-406).
  6. Create it: `INSERT INTO quality_rules ... enabled TRUE, project_id NULL, created_by NULL` (:410-423). On unique violation `23505`, re-select (:427-435).
- **`enforceSchemaRules`** (:544-744), the upload flow.
  - Returns `executed:false` if there are no rules, or if there is no preview data and column rules exist (:559-572). A file-level-only schema may proceed with empty rows.
  - For each column rule: finds or creates the rule row, then upserts `file_quality_rules(file_id, quality_rule_id, is_schema_enforced=true, target_columns)`. `target_columns` is merged, deduplicated and sorted (:626-640).
  - Runs `QualityValidationEngine.validateData` on `previewData`. The code comment says up to 100 rows (:535). Persists violations with source `'schema_enforcement'`.
  - A `QUALITY_ABORT` from persist is re-thrown (:730). Other persist errors are logged and ignored.
  - A `validateData` failure returns `executed:false` with the reason.
- **`enforceSchemaRulesForJob`** (:1155-1348), the job flow.
  - Does not write `file_quality_rules`.
  - Passes no `candidateRuleIds` and no `projectId` (:1209, :1242).
  - Persists violations with `job_id` and source `'job_execution'`. `QUALITY_ABORT` is swallowed (:1299-1303).
  - Returns per-rule results.
- **`validateSchemaRulesInline`** (:759-868), used by FastSchemaValidationService.js:24. Pure in-memory evaluation with no DB access. Each rule is capped at 10 violations, and the total at 50 (:840, :864). Status is `failed` or `passed`.
- **`executeRuleInline`** (:875-1136). Its own re-implementation of rule logic:
  - completeness: ratio of non-empty values against `threshold` (default 1.0).
  - uniqueness: ignores null and empty values.
  - validity email regex `^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,}$`.
  - validity phone: regex `^[\d\s\-\(\)\+]{7,20}$` AND at least 10 digits.
  - validity number: `^-?\d+(\.\d+)?$`.
  - validity date: `!isNaN(new Date(str))`.
  - range_check skips non-numeric values.
  - record_count operators: exactly and equals (tolerance `Math.ceil(expected*pct/100)`); at_least and greater_than_or_equal (threshold `Math.floor(expected*(1-pct/100))`); at_most and less_than_or_equal (threshold `Math.ceil(expected*(1+pct/100))`); between (`minCount`, `maxCount` inclusive); greater_than and less_than (strict, no tolerance). An unknown operator or missing count never violates.
  - record_count is skipped if `metadata.actual_row_count` is null (:1035).
- **`normaliseSchema`** (:456-515). Accepts a bare column array, or `{columns, file_quality_rules}`. Entries may be strings or `{rule_type, rule_name, config}`.

### Callers (where SCH logic is invoked)
fileProcessingWorker.js:19, :21, :1241 (`saveSchemaSnapshot`, `enforceSchemaRules`); transformationProfilingService.js:9; jobExecutionEngine.js:7 (`saveSchemaSnapshot`, `inferDataType`), :19, :1524, :1697, :4304; anomalyRulesEngine.js:3, :175 (`detectSchemaDrift`); transformations.js:9, :1127; vendorAgreementTemplateService.js:4 (`resolveRuleType`); vendorAgreementService.js:11; FastSchemaValidationService.js:24; server.js:1932, :2752, :3790, :4161, :6332, :6603. Their behaviour is documented in their own areas.

## Data touched
- **Reads and writes:**
  - `file_schemas`: insert, upsert on `(file_id, schema_hash)`.
  - `logical_file_groups`: insert and update.
  - `files`: update `schema_definition`, `logical_file_id`, `updated_at`, `metadata`, `processing_step`, `failure_reason_code`, `processing_error`.
  - `fixed_width_schemas`: upsert and delete.
  - `quality_rules`: insert of `__schema_default__*` rows.
  - `file_quality_rules`: upsert.
  - `quality_rule_violations`: written via the engine.
  - `profiling_metrics`: delete.
- **Reads only:** `file_columns`, `vendor_agreement_file_schemas`, `vendor_agreements`, `vendors`, `transformation_jobs`, `transformation_mappings`, `storage_connections`, `transform_connections`, `project_members`, `project_access_groups`, `user_groups`.
- **Files and external calls:**
  - `os.tmpdir()/reprofile/` temp files.
  - Local `FILE_STORAGE_PATH`.
  - S3, GCS and Azure downloads (schemaService.js:695-730).
  - HTTP POST to `localhost:8000/api/vendor-profile` (schemaExtractor.js:443).
  - Python subprocess.
  - Queue `file-processing`.

## Flags

### DUPLICATE
1. Two `compareSchemas` functions:
   - schemaService.js:166 compares name (case-sensitive), normalised type, count and order. It returns added, removed and modified lists.
   - schemaExtractor.js:626 compares name only (case-insensitive) and never compares types.
   - They are used in different flows (history and drift, versus upload-time contract validation).
2. Four type-normalisation functions with different outputs for the same input:
   - schemaService `normalizeType`: int, float, string.
   - schemaExtractor `normalizeDataType`: int, float, decimal; unknown types returned unchanged.
   - schemaFingerprint `normalizeType`: integer, numeric, datetime, json.
   - schemaParser `normalizeDataType`: SQL types such as `VARCHAR` and `INTEGER`.
   - Examples: `decimal` is `float` in schemaService, `decimal` in schemaExtractor, and `numeric` in schemaFingerprint. `integer` is `int` in schemaService and `integer` in schemaFingerprint.
3. Three type-inference functions: schemaService `inferDataType` (:995), schemaExtractor `inferType` (:16), schemaService `inferParquetType` (:976). Differences:
   - `inferDataType` maps date-like strings to `date` only. `inferType` also has a `timestamp` branch that cannot be reached.
   - `inferType` recognises `MM/DD/YYYY` as a date. `inferDataType` does not.
   - `inferDataType` types a CSV column from one value. `inferType` uses a vote over up to 10 values.
4. Two schema fingerprints: `generateSchemaHash` (order-sensitive, case-sensitive) and `generateSchemaFingerprint` (order-insensitive, lowercase). Used for different purposes (snapshots versus jobExecutionEngine.js:4304).
5. Four rule-evaluation implementations. The inline one (`executeRuleInline`) re-implements QualityValidationEngine rules (the comment at :875 says so). Whether they agree with the engine was not verified.
6. Schema extraction per format is done separately in schemaService.parseFileSchema (buffer-based) and schemaExtractor (path-based). Differences:
   - XML: schemaService flattens nested objects to dot-notation and picks the largest array. schemaExtractor takes the first object array found and uses only its top-level keys.
   - Parquet: schemaService uses metadata types. schemaExtractor infers types from data.
   - CSV: see above.
7. `files` columns are named `file_name` in server.js:1834, but `filename` in schemaHistory.js:19, schemaService.js:355 and server.js:8761. The DDL has `filename` (DDL :1401-1437).

### BUG
1. schemaService.js:775 (CSV type inference) is guarded by `columns[0].type === 'string'`. Once column 0 is typed as a non-string, no more rows contribute. While it is a string, later rows overwrite earlier ones. The first-row intent in the comment (":774 Infer types from first row") is not what the code does.
2. `has_schema_changes` is never reset (schemaService.js:518-524, no other write seen). The `hasSchemaChanged` returned by the history endpoint is therefore "ever changed".
3. (Removed in fix: the claimed `import json` NameError at header_validator.py:633 is not a bug, because `import json` is at module top, :20. The second `import json` at :644 is redundant.)
4. delimiter handler (server.js:8797-8931): `files.metadata` is updated at :8797 before the `File details not found` 404 (:8808), the file-location 500s (:8848-8901) and the enqueue. `profiling_metrics` is deleted at :8905, also before the enqueue. Any failure after :8797 (a 404 at :8808, a missing file, or a missing queue) leaves the file with the changed delimiter and `processing_step` unchanged, and no re-profile queued. Failures after :8905 also leave the file with no profiling metrics.
5. delimiter handler `fixedWidthSchema: null` (:8926). For a fixed-width `.dat` file, re-profile with a delimiter drops the saved fixed-width schema (the comment at :8926 says "Not supported in re-profile flow yet").
6. schemaExtractor.js:38-46: the date regexp `^\d{4}-\d{2}-\d{2}` matches before the timestamp check, so `timestamp` is never returned.
7. schemaExtractor.js:169-171 and :208-210: tie-breaking in "most common type" picks the later key on a tie, which is arbitrary.
8. schemaService.compareSchemas on a malformed schema returns `isIdentical:true` (:177-183), so an invalid schema looks identical.
9. schemaHistory.js:58 matches the filename with Postgres `$2 ~ vafs.file_name_pattern` (regex). `file_name_pattern` is glob style (src/utils/patternMatching.js:103-107 documents `orders_*.csv`; backend/utils/filePatternMatcher.js:24). A glob such as `*.csv` is an invalid regex, so Postgres raises an error and the whole request returns 500 (:335-338). A pattern such as `orders_*.csv` is a valid regex that does not match as the glob would.
10. (Moved to UNCLEAR 3 and Open question 7: the "up to 100" preview-row cap (comment at schemaRuleEnforcer.js:535) is not shown to be enforced or unenforced by the lines cited, so it is not recorded as a bug.)
11. GET `/schema` (server.js:1834-1866) references `files.file_name`, `files.schema_metadata`, and `file_columns.data_type`, `description`, `contains_pii`, `column_order`. None exist in the DDL (attached_assets/database_ddl_1767770486833.sql:1401-1437, :1148-1176), so against that DDL the handler returns 500 on every call.
12. fixed-width POST and DELETE (server.js:8693, :8728) do not invalidate the `cacheMiddleware(300)` on the GET (server.js:8672). Reads can be stale for up to 5 minutes.
13. `resolveLogicalFileGroup` with a null `projectId` does not create a new group per upload. The logical ID is deterministic (`logical_0_<name>`, backend/utils/filenameNormalizer.js:73-77; schemaService.js:410). The first upload inserts one group. For later uploads, `project_id = $1` matches nothing (schemaService.js:416-419), the INSERT reuses the same `logical_file_id` (:435-444), and `ON CONFLICT (project_id, canonical_name)` does not fire for NULL. The unique index on `logical_file_id` (DDL :4400-4401) raises 23505, the catch rethrows (:450-452), and `saveSchemaSnapshot` fails. So every null-project upload of the same canonical name after the first fails.

### DEAD
1. `schemaExtractor.inferType` timestamp branch (:44) is unreachable (see BUG 6).
2. `generateSchemaHash` is imported by `schemaHistory.js:4` but never used there. `getFileSchema` is exported (callers not separately traced). `detectSchemaDrift` is used by anomalyRulesEngine.js:175.
3. `schemaFingerprint.schemasMatch` and `extractSchemaFromStats`: no callers found in the greps above (only `generateSchemaFingerprint` is imported, jobExecutionEngine.js:4304).
4. `schemaParser.parseExcelSchema` and the others are exported but only `parseSchemaFile` and `validateSchema` are imported (vendorAgreementService.js:11).
5. `FILE_LEVEL_RULE_TYPES` (schemaRuleEnforcer.js:444) is declared and not used in that file.
6. `SUPPORTED_RULE_TYPES` is exported. No consumer was seen in the greps above.
7. `csv_delimiter` fallback `pd.read_csv(file_path, nrows=sample_rows)` (header_validator.py:543) is reachable when opening the file fails (outer `except: pass`, :536). The sniffer failure branch sets `,` (:528-530) instead.
8. `fileDataValidator` exports `validateCSVHasData` and others; only `validateFileHasData` is imported (server.js:3790).

### SECURITY
1. GET `/api/files/:fileId/fixed-width-schema` has no project/ownership check (server.js:8672). It is JWT-authenticated through the mount at server.js:5283. Any authenticated user can read any file's fixed-width schema.
2. POST and DELETE `/api/files/:fileId/fixed-width-schema` check the JWT only (server.js:8693, :8728). Any authenticated user can create, overwrite or delete the fixed-width schema of any file. POST also accepts any `fileId` with no FK, so orphan rows can be created.
3. GET `/api/files/:fileId/schema-history` has no project or ownership check (schemaHistory.js:12-18). Any authenticated user can read the schema, contract schema and agreement name of any file by ID.
4. The schema-history 500 response and the delimiter 500 response return `error.message` or `details` to the client (schemaHistory.js:337, server.js:8954).
5. schemaHistory.js:58 passes a stored column (`file_name_pattern`) to the Postgres `~` operator as a regex. A stored pattern could be a catastrophic regex. This is low risk since patterns are set by agreement admins.
6. schemaExtractor.js:443 posts to a hard-coded `http://localhost:8000`, sending `local_file_path` and archive passwords (:430) in clear over loopback.
7. S3 download for re-profile (server.js:8840) selects a connection by bucket name only, not by project. The first matching `storage_connections` row is used. Another project's connection could be used.
8. schemaService.js:723 builds an Azure connection string with an account key via string interpolation.
9. The delimiter value is saved and passed to the worker unvalidated (server.js:8755-8795).

### UNCLEAR
1. Hash and fingerprint separation (DUPLICATE 4). Which is meant to be authoritative is not stated.
2. `schemaRuleEnforcer` deliberately does not create `record_count` rules (:391-395) but does create other `__schema_default__*` rules. The comment says this follows a "user requirement".
3. `enforceSchemaRules` comment says "up to 100" preview rows (schemaRuleEnforcer.js:535). No code in this file enforces it, and whether a caller does was not traced. `rowCount` is used only by record_count.
4. `contractSchema` is still returned, with `patternMatched:false`, when no pattern matched (schemaHistory.js:75-92). The comment at :75 says "Only set contract schema if pattern matched ... or if it's the only schema", but the code always sets it. The contract comparison is then made against the latest unrelated schema.
5. `compareSchemas` in schemaService treats reorder as informational only (:253).
6. `saveSchemaSnapshot` is keyed by `(file_id, schema_hash)` for conflict (schemaService.js:511) but history is queried by `logical_file_id`. The conflict updates `captured_at` only when the same `(file_id, schema_hash)` repeats; each upload normally gets a new `file_id`, so whether this reorders history in practice was not shown.
7. Cache-key pattern mismatch (not established). The delimiter handler calls `invalidateFileCache(fileId)` from `backend/src/middleware/cache` (server.js:8942-8943), which invalidates the pattern `GET:/api/files/${fileId}*` (backend/src/middleware/cache.js:152-153). The `cacheMiddleware` used by the routes comes from `./backend/middleware/cacheMiddleware` (server.js:87), and builds keys as `cache:${userId}:${baseKey}` (backend/middleware/cacheMiddleware.js:19-23). The two patterns do not obviously match. Whether the invalidation clears the `/schema` (600 s) and `/fixed-width-schema` (300 s) entries was not established, because the store behind each module and the matching in `invalidateCachePattern` were not traced.

## Domain terms
- **Schema snapshot**: a row in `file_schemas` (`schema_definition`, `schema_hash`, `captured_at`).
- **Schema drift** / schema change: hash differs from the previous snapshot in the same logical file group. `schema_drift_handling` is the drift action on a transformation mapping.
- **Logical file group / logical_file_id / canonical name**: a set of uploads treated as the same file (project + normalised filename).
- **Contract upload / contract schema / vendor agreement file schema**: an upload with `vendor_agreement_id` set, validated against `vendor_agreement_file_schemas.schema`. The `agreement_code` is returned as `agreementName`.
- **File pattern / file_name_pattern**: the filename pattern in a contract schema (glob style).
- **Schema rule / schema-enforced rule / `__schema_default__` rule**: a quality rule declared in the schema column's `quality_rules`. `is_schema_enforced` on `file_quality_rules`.
- **UI rule type vs engine type**: e.g. `null_check` versus `completeness`.
- **File-level rule**: `record_count`, with column `'__file__'`.
- **Fixed-width schema / schema_definition**: columns with `name` and `width`.
- **Header config / hasHeader**: `metadata.header_config`.
- **Header health score**: 0-100 from header_validator (called `health_score`). Statuses `healthy`, `warning`, `critical`.
- **Orphan header**: a column with a header but 95% or more nulls.
- **Same thing, different names:** `file_name` / `filename`; `type` / `data_type` / `column_type`; `name` / `column_name`; `index` / `column_index` / `column_order`; `fileFormat` / `file_type`; `contract` / `agreement`.

## Open questions
1. Whether the live database differs from attached_assets/database_ddl_1767770486833.sql, such that the GET `/schema` query (server.js:1834) could succeed. Against the DDL it cannot (BUG 11).
2. Is anything beyond the mount at server.js:5283 (project/ownership check) meant to restrict GET `/fixed-width-schema`? None found.
3. Are `jobExecutionEngine.js:4304` (`generateSchemaFingerprint`) and the other callers' uses of SCH functions as described? Only the import and call lines were seen.
4. `is_header_like`, `is_data_pattern` (header_validator.py:23-214) were not read in detail.
5. Does the worker or anything else clean up `os.tmpdir()/reprofile/` files?
6. What invalidates the 600 s cache on `/schema` and the 300 s cache on `/fixed-width-schema`? POST and DELETE on fixed-width do not (BUG 12). Whether the delimiter handler's `invalidateFileCache` does is UNCLEAR 7.
7. Which caller applies the 100-row preview limit passed to `enforceSchemaRules` (fileProcessingWorker.js)? Is it applied at all (UNCLEAR 3)?
8. How the `validateFileHasData` result at server.js:3790 and the `compareSchemas` results at :2752 and :4161 are used (ING area).

## Inventory corrections
- Inventory line 570 for `schemaHistory.js:12` says "JWT*". It is authenticated both at the mount (server.js:5283) and on the route (schemaHistory.js:12).
- areas.md says server.js L8672-8962 for SCH. The delimiter handler ends at :8957. Lines 8959 onward are column sensitivity tags (a different area).
