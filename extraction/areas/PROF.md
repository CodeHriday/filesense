# PROF - Data profiling engine

Paths are relative to the repo root (`server.js` means the root `server.js`, not `backend/src/server.js`). Lines refer to the files as read. The archive, fixed-width, DAT and Avro loaders (profile_api.py:511-1158) were read for this revision except `load_excel`, `load_json`, `load_parquet` and `load_sas` (:569-623), which were only seen through the dispatch.

## Summary
Profiling is split across five code paths that compute overlapping statistics in different ways:
1. Flask `profile_api.py` `profile_vendor_file` (vendor/drop profiling): loads the whole file into pandas, computes a quality score and issues, column profiles and a 10,000-row preview, stores one row in `profiling_metrics`, runs anomaly detection.
2. `utils/process_file.py` (spawned CLI): streaming read, row count, schema, 100-row preview.
3. `utils/profile_columns.py` (spawned CLI): per-column min/max/frequency/patterns on at most 10,000 rows.
4. `backend/services/transformationProfilingService.js`: ETL source/target profiling. It runs 2 and 3 and writes `files`, `file_columns`, `profiling_metrics`.
5. `backend/services/profilingService.js` / `etlProfilingService.js`: statistical anomaly checks against a 7-day history, plus file registration for ETL outputs.

Read side: `GET /api/files/:fileId/profile` and `/profile-history` in server.js (the second most likely returns 500 on every call, see B2). Retention: `profileRetentionService.js` (called only from an admin route). Header checks: `utils/header_validator.py`, imported by profile_api.py and spawned by fileProcessingWorker.js.

## Entry points

### 1. GET /api/files/:fileId/profile (server.js:6595)
- Trigger: UI profile screen.
- Auth: `authenticateToken` + `requireProjectAccess({resourceType:'file'})` (:6596-6599).
- Inputs: `fileId` path param, no validation beyond existence.
- Reads: `files` (:6606), `file_columns ORDER BY column_index` (:6613-6616). Not filtered by `file_role` or `profile_timestamp`, so a file with source and target rows or several snapshots returns all of them (see UNCLEAR).
- Column access control: `columnAccessControl.getColumnGovernance` / `filterColumns(req.user, governance, 'read')` (:6619-6622). Masked and denied columns return `min/max/most_frequent_value/least_frequent_value = '[REDACTED]'`; `mean/median/stdDev/histogram` null; `most_frequent_count`, `least_frequent_count`, `min_frequency`, `max_frequency`, `min_is_frequent`, `max_is_frequent` null; `top_values: null`; `patterns: []`; `_accessLevel` 'masked' or 'denied' (:6635-6659). `count`, `unique`, `missing` are NOT redacted. Masked and denied are treated identically apart from the label.
- Response: `{fileId, filename, fileType, fileSize, rowCount, columnCount, processedAt, columns[], summary{completeness, uniqueness}, accessSummary}`.
- Rules:
  - `completeness = (rows*cols - sum(null_count)) / (rows*cols) * 100`, `.toFixed(2)` (:6708).
  - `uniqueness = sum(unique_count) / (rows*cols) * 100`, `.toFixed(2)` (:6709). Summed per-column unique counts divided by total cells.
  - Type is passed through `normalizeDataType` (:6638, :6665).
  - `top_values`: the stored value is used when present. The fallback branch (:6684-6693) is gated on `col.type === 'string' || col.type === 'date'`, but `file_columns` rows have `column_type`, not `type`, so the condition is always false and the fallback yields `null` (see B3). If the condition were ever true it would return a `JSON.stringify`'d array `[{value: most_frequent or 'Unknown', frequency: 20}, {value:'Other Values', frequency:60}, {value: least_frequent or 'Unknown', frequency:20}]` (a string, using the key `frequency`). For files profiled through transformationProfilingService the stored value is never written either (see B23), so `top_values` is likely null for those files.
  - `histogram` is `JSON.parse`d from a stored string (:6674).
- Side effect: `auditService.logDataAccess` with accessType 'PROFILE', 'UI' method, column names and masked/denied lists (:6715-6731), only if `req.auditService` exists.
- Errors: 404 `File not found` (:6609); 500 `Failed to fetch file profile` (:6736).

### 2. GET /api/files/:fileId/profile-history (server.js:6741)
- Auth: same as above (:6742-6745).
- Query: `profiling_metrics pm WHERE file_id=$1 ORDER BY profile_timestamp DESC LIMIT 100`, with a scalar sub-select `json_agg` of `file_columns` joined on `fc.file_id = pm.file_id AND fc.profile_timestamp = pm.profile_timestamp` (:6758-6794). Returned columns: metric_id, profile_timestamp, file_role, row_count, column_count, the four scores, created_at (= `profiled_at`), and a `columns` array (type, counts, min/max/mean/median/std_dev).
- Likely always fails: the sub-select aggregates with `json_agg(...)` and also has `ORDER BY fc.column_index` (:6788) with no GROUP BY. `fc.column_index` is neither grouped nor aggregated, which Postgres normally rejects ("must appear in the GROUP BY clause or be used in an aggregate function"). The handler's catch would then return 500 on every call that gets past the 404 check. Not run (see B2).
- Response (if the query succeeded): `{fileId, filename, totalSnapshots, history[]}`. Errors: 404 for a missing file as in entry 1; 500 `Failed to fetch profile history` (server.js:6804), which differs from the entry 1 message.
- No column access control is applied here; the `columns` array would expose `min_value`, `max_value`, `mean_value`, `median_value` for every column, including masked or denied columns (SECURITY, latent while the query fails).

### 3. POST /api/vendor-profile (profile_api.py:1661)
- Callers (per inventory and other area docs): server.js:4294, :4812; fileProcessingWorker.js:1615. Not re-traced here.
- Auth: none. The Flask CORS config only restricts browsers (:55-63, default origins are https localhost and replit). `app.run(host='0.0.0.0')` (:2261).
- Inputs (JSON): `file_id`, `local_file_path`, `filename`, `password`, `delimiter`, `header_config` {hasHeader, columnNames}, `fixed_width_schema`, `job_id`, `mapping_id`, `vendor_agreement_file_schema_id` (:1685-1691, :1747-1753); legacy cloud mode: `storage_location`, `provider`, `storage_key`, `credentials` (:1795-1798). `data = request.get_json()` is not checked for None, so an empty body yields a 500, not a 400.
- Local mode (:1697-1791):
  - 404 `{error:'Local file not found', path}` if the path does not exist. Any server-readable path is accepted (SECURITY).
  - Filename defaults to the path basename.
  - For `.dat` files with no `fixed_width_schema`, loads `fixed_width_schemas.schema_definition WHERE file_id` (:1711-1731). Failures are only logged.
  - Calls `profile_vendor_file`.
  - If a DB connection exists: `store_profiling_metrics_and_detect_anomalies`, then, if `vendor_agreement_file_schema_id` is present, reads `vendor_agreement_file_schemas.column_metadata` and adds `metadata.column_pii_info[col] = {contains_pii, pii_type, data_type, description}` and `metadata.pii_summary {total_pii_columns, pii_column_names, contains_pii}` (:1752-1778).
  - If no DB: `anomaly_detection = {anomalies_detected:0, message:'Anomaly detection unavailable (no database connection)'}` (:1783-1786).
  - numpy types are converted; returns 200 with the profile JSON.
- Cloud mode (:1794-1847): 400 `Missing required parameters` unless file_id, storage_location, provider and storage_key are all present. `download_file_from_storage` supports provider 'aws' (credentials from the request body, region default 'us-east-1'), 'gcp' (default client credentials), 'azure' (default credentials, container defaults to 'default') (:388-437). Any other provider raises `Unsupported provider`. Temp file is deleted in `finally`. This path ignores `fixed_width_schema`, skips PII enrichment, and has no ClamAV scan outside archives.
- Errors: any exception returns 500 `{error:'Profiling failed', details: str(e)}` (:1849-1854). `details` leaks internal error text.
- Load failures do NOT produce an HTTP error. `profile_vendor_file` returns 200 with `quality_score.overall_score = 0`, `issues=[{type:'error',...}]`, `processing_error`, `metadata.row_count = 0` (:1230-1239). The same happens for empty files (:1241-1250). For messages containing 'schema definition' or 'binary', `processing_error` is rewritten to a canned "binary or fixed-width ... re-upload with a column schema definition" message (:1221-1228). Note that the check `'binary' in message` is broad.
- Side effect on load failure or empty file (local mode): the local-mode handler does not look at the result before storing it. `profile_vendor_file` is called at :1734 and then, whenever a DB connection exists, `store_profiling_metrics_and_detect_anomalies` is called on the same result (:1739-1750). For a failed or empty load the result has `quality_score = {'overall_score': 0, 'components': {}}` and `metadata.row_count = 0`, `column_count = 0` (:1231, :1238, :1243, :1249). The function therefore upserts a `profiling_metrics` row with `row_count` 0, `column_count` 0, `overall_quality_score` 0 and NULL component scores (the `.get('components', {}).get(...)` lookups return None, :317-320), commits it (:325), and then runs `AnomalyService.detect_and_store_anomalies` with those metrics (:333-342). The zero row replaces any earlier `(file_id, 'adhoc')` row, because of the upsert key, and can itself be flagged as an anomaly against history (see B24).

#### profile_vendor_file rules (profile_api.py:1171-1658)
- Extension dispatch (via `get_file_extension`, compound `.tar.gz .tar.bz2 .tgz .tbz2` first, :1159-1168): `.csv/.txt` CSV; `.xlsx/.xls` Excel; `.json`; `.parquet`; `.sas7bdat/.xpt` SAS; `.avro`; `.dat` fixed-width or delimited; `.zip/.tar/.tar.gz/.tar.bz2/.tgz` archive. Anything else raises `Unsupported file type`. `.tbz2` is recognised by `get_file_extension` but not dispatched, so it is unsupported. `.xml` is named in the docstring (:1174) but is not dispatched.
- CSV (`load_csv`, :511-567): header row by default; if `header_config.hasHeader` is false, uses `columnNames`. With a user delimiter: `re.escape` and python engine, with NO fallback if that read fails (the exception propagates). Without a delimiter: `sep=None` sniffing, then on failure falls back to default comma with `low_memory=False` (:557-565). Whole file is loaded into memory with no size limit and no memory guard.
- Quality: `quality_checks.run_basic_checks(df)`, `calculate_quality_score(results, {'created_at': now})` (:1255-1259). Rules live in quality_checks.py (DQ area, not traced here).
- Header validation: `header_validator.validate_headers(file_path, file_ext.lstrip('.'))` (:1262) and issues get `severity` default 'medium' (:1269-1277). `header_issues` is keyed by `issue_type`, so only the last issue of each type is retained (:1281). Because the validator only accepts csv/txt/json/parquet/xlsx/xls/xml, a `.dat`, `.avro`, `.sas7bdat`, `.xpt`, `.zip`, `.tar`, or `tar.gz` file gets `success:False` and no header issues at all (see entry 9). The `success` flag is checked at :1269 and nothing is reported on failure.
- NULL summary: columns with `missing_count > 0` go in `null_value_summary`. An issue is added when `missing_pct > 10`, severity 'high' if `> 50`, else 'medium' (:1287-1302).
- Date format inconsistency: for object columns, takes the first 100 non-null values; the column counts as date-like when the regex `\d{1,4}[-/]\d{1,2}[-/]\d{1,4}` matches more than 50% of the sample; flags if both slash-separated and dash-separated styles appear. Severity 'medium' (:1306-1334).
- Duplicates: `df.duplicated()`; severity 'high' if `dup_pct > 5` else 'medium'; sample of the first 10 indices (:1338-1351).
- Preview: first `min(10000, len(df))` rows. Numbers are converted to float, so integers become floats (:1363-1364). Strings have non-printable characters replaced with '?' and values over 1000 characters cut to 1000 plus `...[truncated]` (:1370-1373). Row access uses `df.iloc[idx][col]` in a double loop, so it is O(rows x cols) with per-row copies.
- Column profile: `type` via `normalize_pandas_dtype` (:87-169), `nullable` (any null), null and unique counts and percentages, top 10 values (strings cut to 200 characters, percentage of `len(df)`), most/least frequent taken from the first/last of the top-10 list. The "least frequent" is therefore the 10th most frequent, not the real least frequent (BUG, see Flags). Numeric: min/max/mean. Non-numeric: min/max/avg string length. Patterns per below.
- Pattern detection (sample size `min(1000, non-null)` = the first 1000 rows, not random):
  - Numeric all-integers: min>=0 and max<=100 gives 'Percentage (0-100)'; min>=0 'Positive Integer'; max<=0 'Negative Integer'; else 'Integer' (:1460-1467). A column of integers in 0..100, such as ages or counts, is labelled "Percentage".
  - Numeric decimals: average decimal places <=2 gives 'Decimal (2 places)' even when it is 0 or 1 (:1473-1476).
  - Plus a COBOL-style picture clause (`9(n)`, `A(n)`, `X(n)`, `.`, `-`, `/`) as the most common clause (:1390-1445).
  - Strings: the same picture clause, plus Email, 4 US phone formats, 4 date formats, SSN `xxx-xx-xxxx`, ZIP 5 and ZIP+4, Credit Card (16 digits), each reported only when matches `> 70%` of the sample (:1500-1549).
- Result shape: `{quality_score, issues, header_issues, null_value_summary, date_format_issues, duplicate_data, preview_data, column_profiles, metadata{row_count, column_count, file_size_mb, columns, format_specific}}` (:1640-1656).

#### Loaders (profile_api.py:511-1158)
- `load_avro` raises `ValueError("Avro file contains no records")` for an empty Avro file (:631-632); an empty Avro therefore surfaces as a load failure (200 with zero score), not as the "empty file" path.
- `load_archive` (:~990-1156):
  - ClamAV scan first (`scan_file_with_clamav`, :452-505); `Archive failed virus scan` is raised if not clean (:1000-1002).
  - ZIP (:1014-1047): uses `pyzipper.AESZipFile`; encrypted if any member has `flag_bits & 0x1`, and raises `Archive is password-protected but no password provided` when encrypted and no password (:1019-1022). Members are written with 64 KB chunked reads (:1036). Path traversal is handled by taking `os.path.basename` of each name (:1027). There is NO limit on member count, member size, total uncompressed size, or compression ratio, so a ZIP bomb is extracted in full to the temp dir (SECURITY S11). The comment at :1053 ("size limits, and symlink checks") is on the tar branch and does not cover ZIPs. Hidden names (leading '.') are not skipped for ZIP (they are for tar, :1076).
  - Tar (:1049-1106): only regular files (`member.isfile()`, :1056); skips names that are absolute or contain `'..'` (:1060), symlinks and hard links (:1065), members over `2 * 1024 * 1024 * 1024` bytes (2 GB, :1070), names whose basename is empty or starts with '.' (:1076); also checks `os.path.commonpath` against the temp dir (:1083). The `'..' in member.name` test is a substring check, so a legitimate name such as `a..b.csv` is dropped. Chunk size 8192. Note that `isfile()` already excludes symlinks and hard links in tarfile, so the :1065 check is redundant.
  - Members with the same basename overwrite each other in the temp dir (:1032, :1080), while both are added to `extracted_members`.
  - Members are loaded with default arguments only: `load_csv(member['path'])`, `load_dat(member['path'])`, etc. (:1115-1127). The caller's delimiter, `header_config`, `fixed_width_schema` and password are not forwarded, so a `.dat` member only loads if auto-detection or default fixed-width works.
  - Only the FIRST member that loads successfully is profiled; the loop `break`s (:1135). Other members are listed in `member_manifest` with `status` 'unsupported'/'failed'/'profiled' (the unvisited ones have no status).
  - Members with an unsupported extension are marked `unsupported` and skipped (:1128-1130). If nothing loads, `ValueError("No supported tabular files found in archive (extracted N members)")` (:1150-1151). All errors are re-raised as `Failed to process archive: ...` (:1155-1156).
- `parse_binary_fixed_width` (:649-871), used by `load_dat` when the schema has any `type`:
  - Types: uint8/16/32/64, int8/16/32/64, float32/float64 map to struct codes; `string` uses `width` bytes and must have width > 0; unknown types are treated as strings with `width` (and need width > 0) and a warning (:677-722).
  - For numeric types the declared `width` is IGNORED and the struct size is used (:704-709).
  - Byte order is `schema.get('byte_order', '<')` (little-endian default) (:726). Text encoding default 'ascii' (:649, :670).
  - Newline stride between records is inferred by testing candidates 0, 1, 2 at up to `min(5, max(1, file_size // stride))` record boundaries (:760-793). If the best candidate matches fewer than 2 boundaries, it falls back to no newlines (stride = record size) (:805-810). Detection is skipped when `file_size <= record_size`.
  - Records for which `struct.unpack_from` raises are logged and silently dropped (:854-856). If no records parse, `ValueError("No valid records could be parsed from binary file")` (:858-859). A trailing partial record is ignored with a warning (:826-828).
  - String fields are cut at the first NUL, decoded with `errors='replace'`, and non-printable characters (other than newline and tab) are removed (:847-849).
- `load_dat` (:874-989) strategy order: (0) schema with any `type` -> binary struct parser, and if that raises, log and fall through (:894-903); (0b) `read_fwf` with the schema widths accumulated from position 0 (:905-925); (0.5) user delimiter (`re.escape`, python engine, honours `header_config`) accepted only if more than 1 column and at least 1 row (:927-950); (1) `sep=None` auto-detect, same acceptance test (:952-970); (2) default `read_fwf` (:972-980); (3) `ValueError` with the canned "Binary DAT files require a schema definition" message (:982-986). All errors are wrapped as `Failed to load DAT file: ...` (:988-989). The `schema definition`/`binary` wording is what triggers the rewrite in `profile_vendor_file` (:1221-1228).

#### store_profiling_metrics_and_detect_anomalies (profile_api.py:250-366)
- Writes `profiling_metrics` with `ON CONFLICT (file_id, file_role) DO UPDATE`, hard-coded `file_role = 'adhoc'`, `profiled_at = datetime.now()` (server local time, no time zone) (:283-323). The scores are taken from `quality_score.components.{completeness, consistency, validity}` and `overall_score`.
- The upsert is COMMITTED (`conn.commit()`, :325) before anomaly detection starts (:330). The `conn.rollback()` in the error handler (:365) therefore cannot undo the metrics row; only work done after the commit is rolled back.
- `profile_timestamp` is not set by this insert, and the upsert overwrites the single row per (file_id, 'adhoc'), so re-profiling does not add history rows.
- Then `AnomalyService(conn).detect_and_store_anomalies(file_id, file_name, current_metrics, job_id, mapping_id, sensitivity='medium')` and `get_file_anomalies(file_id, status='open')` (:331-352). `AnomalyService` is imported from `ml.anomaly_service` after adding `backend/` to `sys.path` (profile_api.py:38-39); the class is at backend/ml/anomaly_service.py:19. `current_metrics` = row_count, column_count, the three component scores and overall score (:333-340). Returns `{anomalies_detected, anomaly_ids, anomalies}`. Anomaly rules are in the ANOM area.
- On error: rollback, returns `{anomalies_detected:0, anomalies:[], error}` and the HTTP call still succeeds.

### 4. GET /health (profile_api.py:1857)
Auth none. Returns 200 `{status:'healthy'}`. No dependency checks.

### 5. POST /parquet-schema (profile_api.py:1863)
- Auth: none. Inputs: `bucket`, `key` (JSON). 400 `No data provided` / `bucket and key are required`.
- Downloads the object from S3 with `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` from env, region `AWS_REGION` default 'us-east-1' (:1883-1888), to a temp file. Reads the pyarrow schema. Returns `{success:true, columns[], column_count}`. Deletes the temp file in `finally`.
- Any caller can make the service read any bucket/key the server credentials can access (SECURITY). 500 `{error:'Parquet schema extraction failed', details}`.

### 6. /profile-api/* proxy (server.js:13983)
- Production only (`NODE_ENV === 'production'`, :13968). `app.use('/profile-api', createProxyMiddleware({target: http://localhost:${PROFILE_API_PORT||8000}, pathRewrite strip prefix, proxyTimeout 120000}))`. Request and response timeouts are set to 0 (:13978-13982).
- Auth: none on this mount (no `authenticateToken` in :13978-13983). This exposes all Flask routes, including `/api/vendor-profile` (local-path read), `/parquet-schema`, and the AI and settings routes assigned to the AI area, to unauthenticated callers.
- Error: 502 `{error:'Profile API unavailable'}`.

### 7. utils/process_file.py (CLI, spawned)
- `python process_file.py <file_path> <file_type>`; spawned through `run_python_with_venv.sh` with `PYTHONPATH` set to the workspace root by transformationProfilingService (:23-35).
- Rules:
  - `check_before_processing(size_mb)` (memory_monitor.py:135-156) refuses when (a) the circuit breaker is open (:139-140), (b) `size*2 > available_mb` ("Insufficient memory", :143-147), or (c) projected `(used + size*2) / total * 100` exceeds `MAX_MEMORY_PERCENT` (default 85, :149-154). Warning at 75, recovery at 70 (memory_monitor.py:22-24).
  - Encoding is detected for csv/json/txt, trying utf-8, latin-1, iso-8859-1, cp1252, ascii in that order (streaming_processors.py:480). Delimiter detected for csv only.
  - Reads in chunks of 10,000 rows. Schema (name, type, nullable, unique_count, null_count) is computed from the FIRST CHUNK only (:121-129). `row_count` sums all chunks. For files over 10,000 rows, null/unique counts describe only the first 10,000 rows.
  - Preview is the first 100 rows (:108).
- Output: JSON on stdout; errors are returned as `{error,...}`. Exit 1 on usage or missing file.

### 8. utils/profile_columns.py (CLI, spawned)
- `python profile_columns.py <file_path> <file_type> [delimiter]`. File types are lower-cased and `xlsx`/`xls` mapped to `excel` (:29-31).
- Samples at most 10,000 rows: csv `nrows=10000` (:36-38), Excel `nrows=10000` (:62), json and xml read in full then `head(10000)` (:48-49, :66-68), parquet read in full then `head(10000)` (:57-59). JSON tries JSON-lines first. XML has a defusedxml fallback.
- Per column: type, null_count, unique_count. Dtypes `int64/float64/int32/float32` give min/max (`min_value`, `max_value`) and frequency of min/max (`*_is_frequent = count > 1`). Datetime dtype gives ISO min/max. Everything else (strings) gives most/least frequent value only when `unique_count < non_null_count` (:136), top 10 values with `round(pct, 2)`, and the SHORTEST and LONGEST string as `min_value` / `max_value` (:158-166).
- Patterns: `data_profiling.detect_column_patterns` (random sample of up to 1000 non-null values, top 5 patterns, `round(pct, 2)`). The pattern alphabet differs from the one in profile_api (see DUPLICATE).
- Output: `{columns:[...]}` or `{error}`. Exit code is 0 even for errors (only usage errors exit 1). Callers in transformationProfilingService swallow failures to `{columns: []}` (:113-131).

### 9. utils/header_validator.py (CLI and imported library)
- Trigger: imported by profile_api.py (`header_validator.validate_headers(file_path, ext)`, :1262) and spawned as `python header_validator.py <file_path> <file_type>` by `backend/workers/fileProcessingWorker.js` `callHeaderValidator` (:1822-1881) through `run_python_with_venv.sh` with `PYTHONPATH` = workspace root. Auth: none (no HTTP surface of its own). With fewer than 2 argv it prints `{success:false,error:'Usage...'}` and exits 1 (:632-637).
- Inputs: `file_path`, `file_type`, `sample_rows` default 10000 (:495). `file_type` is lower-cased; `xlsx`/`xls` become `excel` (:509-511). It does NOT accept `header_config`, delimiter or fixed-width schema.
- Loading (:513-567): csv/txt: reads the first row with the `csv` module after sniffing the delimiter from the first 8192 characters (`csv.Sniffer`, fallback `csv.excel`, ',') with `utf-8-sig` (:516-537); headers are `.strip()`'d; then `pd.read_csv(nrows=sample_rows, delimiter=sniffed)`. json: JSON-lines first, then standard JSON, then `head(sample_rows)`. parquet: read in full then `head`. excel: `nrows=sample_rows` (first sheet). xml: `pd.read_xml` then `head`. Any other type returns `{success:false, error:'Unsupported file type: <type>'}` (:563-567). The dispatch in profile_api.py therefore silently gets no header issues for `dat`, `avro`, `sas7bdat`, `xpt`, `zip`, `tar`, `tar.gz`, `tar.bz2`, `tgz` (and the `.` stripping gives `tar.gz`, which is not recognised).
- Five detectors, run in this order (:569-595), each returns `{has_issue, issue_type, severity, ...}`:
  1. `duplicate_column_names` (severity 'medium'): compares raw header names with pandas-renamed names (:362-490).
  2. `multiple_headers` (severity 'high'): needs at least 2 rows (`len(df) < 2` returns no issue, :221); checks the first `min(5, len(df))` rows with `is_header_like` and reports positions `i + 1` (:216-245). `is_header_like` (:80-213) returns False if more than 50% of values look like data patterns, or more than 30% of values are longer than 30 characters or more than 3 words; otherwise True when the similarity with the real header names is `>= 0.6` (exact match 1, near-contained match over 80% length counts 0.7), or, as a last resort, more than 60% of values match `id/code/key/ref` patterns (and are at most 25 characters).
  3. `no_headers` (severity 'high'): column names matching `^Unnamed: \d+$`, `^Column\d+$`, `^Field\d+$` or `^\d+$`; flagged when `>= 0.5` of columns match (:248-283). Divides by `len(columns)` with no zero guard.
  4. `orphan_headers` (severity 'medium'): column null ratio `>= 0.95` (:286-312). Divides by `len(df)` (:293). For an empty frame, `df[col].isna().sum() / len(df)` is 0/0, which pandas/numpy evaluate to `nan` with a runtime warning rather than raising; `nan >= 0.95` is False, so no column is flagged and the result is "no issue". For an empty frame with zero columns the loop does not run. In the profile_api.py path the validator is only called after the empty-DataFrame early return (profile_api.py:1241-1250, call at :1262), so profile_api.py does not reach this case.
  5. `missing_headers` (severity 'medium'): generic names (the four patterns above plus empty string) on columns with at least one non-null value (:315-359).
- Health score (:597-610): no issues -> `status 'healthy'`, 100; any 'high' issue -> `'critical'`, `max(0, 100 - 25 * issue_count)`; else `'warning'`, `max(0, 100 - 15 * issue_count)`. The count is of issues, not of high issues, so two medium issues give 70 while one high issue gives 75.
- Output: `{success, status, health_score, total_columns, total_rows_sampled, issues_found, issues[]}`; CLI prints it with `indent=2`.
- Failure paths: any exception returns `{success:false, error}` (:622-626) and the CLI still exits 0, because only the usage check calls `sys.exit(1)`. The worker wrapper resolves `{success:true, status:'healthy', health_score:100, issues:[]}` when the script is missing (:1827-1830), on any non-zero exit (:1855-1862), on unparseable stdout (:1872) and on spawn error (:1879). A load failure inside the script (exit 0, `success:false`) is passed through as-is. The wrapper treats a crash as "healthy".
- Duplicate handling: the same rules are applied from two call sites (profile_api.py, fileProcessingWorker.js:961 onwards builds a default healthy result); see DUPLICATE D10.

### 10. transformationProfilingService.profileFileBuffer / downloadAndProfileFile (backend/services/transformationProfilingService.js:157, :359)
- Callers: jobExecutionEngine.js:17 (EXE). Not an HTTP entry point.
- Steps: write the buffer to `os.tmpdir()/etl_profile_<Date.now()>_<basename>` (:175); run process_file.py, then profile_columns.py; merge by column name, with `type` from profile_columns dropped (:198); sha256 of the buffer; `fileId = providedFileId || fileHash` (:207).
- Quality score (:433-465): 100, minus 10 if `row_count` is truthy and `< 10`, minus 10 if `column_count` is truthy and `< 2`, minus 20 if no schema, minus `min(20, pct_columns_with_nulls / 2)`; rounded; floor 0. Because the row and column deductions require a truthy count (:438, :443), a `row_count` of 0 gets no row deduction.
- Writes: `files` upsert on `file_id` (:213-250), including `file_role`, `correlation_id = jobId`, `contains_pii`, default false. `file_columns` upsert on `(file_id, column_name, file_role)` with null_percentage, patterns JSON, frequencies (:548-605); `top_values` is not among the inserted columns (see B23). `profile_timestamp = NOW()` is overwritten on conflict, so there is no history in this path. Schema snapshot via `saveSchemaSnapshot` (errors are logged and do not fail the profile, :264-288). `profiling_metrics` value_distributions upsert on `(file_id, file_role)` (:636-659) sets only the distributions, not the scores.
- Failure (BUG B16): `const fileId` is declared inside the `try` (:207), but the `catch` block uses `fileId` in the log call and the return object (:329, :335) while the parameter is named `providedFileId` (:163). `fileId` is not in scope in the catch, so a ReferenceError is thrown from the catch and the promise REJECTS instead of returning `{success:false, error}`. The temp file is removed first (:321-325). `downloadAndProfileFile` has its own try/catch (:411-424) and returns `{success:false}` (its own `fileId` is in scope there), so only direct callers of `profileFileBuffer` (jobExecutionEngine) see the rejection.
- Values `0`, `''`, and `false` are stored as NULL because of `||` (`column.min_value || null`, `unique_count || null`, `most_frequent_count || null`, `min_is_frequent || null`) (:524-533, :589-593). A min of 0, or `min_is_frequent=false`, is lost.

### 11. etlProfilingService.profileETLOutputFile / profileETLFile (backend/services/etlProfilingService.js:29, :235)
- Called from jobExecutionEngine.js:16 (EXE). Not HTTP.
- File header comment says it populates files, file_columns and profiling_metrics (:7), but only `profileETLFile` writes `profiling_metrics` (:326).
- `profileETLOutputFile` (:29-169): registers the file (`quality_score` hard-coded 100, comment says "Will be updated"; it never is in this module) and writes `files` and `file_columns` only, with `file_columns` upsert on `(file_id, column_name)` (:87). It then runs `profileFile` for anomaly checks (:122). It writes NO `profiling_metrics` row itself; the only possible write is inside `profileFile`, which is inert because of B1.
- `profileETLFile` (:235-): inserts `file_columns` with `file_role` and `profile_timestamp = executionTimestamp` (default `new Date()`), with no ON CONFLICT, so there is history; inserts a `profiling_metrics` row without scores (:325-). Anomaly checks run only for `fileRole === 'target'` (:352), calling `profileFile` at :355.
- Success is returned inside the transaction; the transaction is rolled back and `{success:false}` returned on any error.
- `extractFilePattern` (:178-210): replaces `\d{4}-\d{2}-\d{2}`, `\d{8}`, `\d{10,20}`, trailing `_\d{1,10}` and `\d{1,10}` with `*`; if no `*` and digits exist, replaces digit runs with `*`; otherwise appends `*` to the base name.

### 12. profilingService.profileFile and checks (backend/services/profilingService.js:372)
- Signature `profileFile(pool, fileId, filename, filePattern, options)`. Thresholds (defaults): numeric deviation 10%, row count 15%, null spike 20 (percent) (:373-379).
- Window: 7 days (`getWeeklyAverage*`, default `days = 7`), pattern from `patternToSQLLike` (`*` to `%`, `?` to `_`).
- Numeric: "sum" is approximated as `(min_value_decimal + max_value_decimal)/2 * row_count`; flags if `abs((cur - avg)/avg)*100 > threshold` and `avg > 0`. Column types considered: `'integer','float','decimal','number'` (:143). Elsewhere, types are named `int`, `float` (see UNCLEAR).
- Row count: same deviation formula against the 7-day mean `row_count`.
- Null spike: flags if `nullPct > threshold` OR (`avgNullPct > 0` and `nullPct > avgNullPct * 1.5`) (:261).
- Type mismatch: the most common column type among OTHER files with the same pattern created in the last 7 days; severity 'high' (:309-349). No requirement for the same project, so files in different projects may match the same pattern.
- Persist: `profiling_metrics` INSERT with `completeness_score = consistency_score = validity_score = overall = calculateQualityScore(anomalies)` where the score is 100 minus 15 (high) / 10 (medium) / 5 (low), floor 0 (:447-519). The scores in this path are the same number repeated three times.
- All errors in the check functions are logged and swallowed (return empty arrays or 0).

### 13. profileRetentionService.cleanupOldProfiles / getProfileStats (backend/services/profileRetentionService.js:14, :123)
- Called only from `POST /api/admin/cleanup-profiles` and `GET /api/admin/profile-stats` (backend/routes/adminSettingsRoutes.js:101, :76), mounted at server.js:13876 with `authenticateToken, requireAdmin`. These routes themselves are inventoried under ADM. The retention rule is the PROF-owned part.
- Rule: files joined to `file_audit_details` with `load_type='etl_transformation'` and `file_role='target'`; partitioned by `mapping_name`, ordered by `f.created_at DESC`; rows with `row_num > retentionCount` are deleted (:25-46).
- `retentionCount`: argument, else `app_settings.profile_retention_count`, else 10 (appSettingsService.js:70-77). The setting route validates integer 1-100 (adminSettingsRoutes.js:50). The `POST /cleanup-profiles` body `retentionCount` is NOT validated and is passed straight to the query (:103-106).
- Delete per file in its own transaction: `file_columns`, `file_audit_details`, `files` (:74-80). `profiling_metrics`, schema snapshots, anomalies, and governance tags for the deleted file are not deleted here. Failures are logged and skipped.
- There is no scheduler: cleanup runs only when an admin calls it.

### 14. reprofile_files.js (CLI, manual)
- `node reprofile_files.js` (needs `DATABASE_URL`). Selects `files` rows `WHERE file_type IN ('csv','json','xlsx','xml','parquet')` ORDER BY created_at DESC (:166-171). For each, finds the path from `metadata.path` or `uploads/<filename>` (:107-117), skips with `file_not_found` if absent, runs profile_columns.py through `run_python_with_venv.sh` with `[script, filePath, fileType]` (:22-54) and UPDATEs `file_columns` by `(file_id, column_name)` (min/max/min_value_decimal/max_value_decimal/null_count/unique_count) (:59-96). No delimiter is passed. `file_type` is passed RAW (:131); there is no xlsx-to-excel mapping in this script (the mapping is inside profile_columns.py:29-31).
- BUG B9: after the run it checks `profilingResult.success` and uses `profilingResult.column_stats` (:133, :144), and `updateFileColumns` reads `col.column_name` (:87) and `min_value_decimal`. profile_columns.py returns `{columns:[{name, ...}]}` with no `success` key (profile_columns.py:175). Every file therefore takes the "Profiling failed" branch (:133-135) and nothing is updated. Even if `success` were present, the `column_stats` and `column_name` keys do not exist in the output, so no column would match.
- Other: `col.min_value || null` and `col.null_count || 0` have the same `||` coercion as B7 (:80-85).

### 15. profile_api.py startup: `__main__`, `initialize_app`, `initialize_settings` (profile_api.py:2199-2261)
- Trigger: running `python profile_api.py`. Nothing here is an HTTP route. (If the module is imported by a WSGI server instead, `initialize_app()` is not called, since it is under `if __name__ == '__main__'`.)
- `__main__` (:2256-2261): calls `initialize_app()`; port from `PROFILE_API_PORT`, default 8000; `app.run(host='0.0.0.0', port=port, debug=False)`.
- `initialize_app` (:2231-2254): `fetch_database_url()` (HTTP to the Node backend, env fallback, see S7); if a URL is found, opens and closes a test connection, logging success or failure and never raising; if none, logs `No DATABASE_URL available - some features may not work` and continues to start. Then `initialize_settings()`.
- `initialize_settings` (:2199-2227): for `ai_dq_suggestions_enabled = 'true'` ("Enable AI-powered DQ suggestions feature") and `ai_provider = 'rule-based'`, runs `INSERT INTO app_settings (setting_key, setting_value, description, updated_at) VALUES (...) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()` and commits (:2215-2221). If no DB, it logs a warning and returns. Errors are logged and swallowed.
- BUG B17: the comment at :2253 says "INSERT ... ON CONFLICT DO NOTHING" and the docstring says "Seed default ... rows so they always exist", but the SQL is `DO UPDATE SET setting_value = EXCLUDED.setting_value`. Every restart of the Flask service resets `ai_dq_suggestions_enabled` to 'true' and `ai_provider` to 'rule-based', overwriting whatever an admin set through the settings route.
- Side effect on the route set: the table `app_settings` is also read by retention (entry 13) and written by the AI-area settings routes.

### 16. Other CLI scripts named in the inventory
- `backfill_metrics.js` (repo root; belongs to DASH, not PROF): `node backfill_metrics.js` with `DATABASE_URL`. `SELECT DISTINCT DATE(created_at) FROM files ORDER BY file_date DESC` (:13-17), then for each date calls `new FileInsightsService(pool).aggregateDailyMetrics(new Date(row.file_date))` (:21-29), totals `patterns_processed` and `files_processed`, and prints a `file_pattern_metrics` summary (`GROUP BY file_pattern`, `AVG(overall_quality_score)::numeric(5,2)`, :42-54). It writes only `file_pattern_metrics` (through the service). Errors are caught and logged; the process does not set a non-zero exit code (:56-58).
- `test_aggregation.js` (repo root): same service; hard-coded date `2025-10-20` (:11-13); calls `aggregateDailyMetrics` and prints the `file_pattern_metrics` rows for `metric_date = '2025-10-20'` (:17-24). Manual test only.
- `test_column_stats.js`: requires `backend/services/jobExecutionEngine.js` (:5), builds sample rows and schema, then prints "Cannot test private function directly" and `process.exit(0)` (:32-39). It tests nothing.
- `test_venv.py`: tries `__import__` for numpy, pandas, flask, psycopg2, boto3, openpyxl, pyarrow and prints JSON with python version, path and SUCCESS/FAILED per module (:17-41). Always exits 0.

## Data touched
- `files`: read by the profile GET routes. Written by transformationProfilingService (:213), etlProfilingService (:44, :255) and the retention delete (:80).
- `file_columns`: read by the profile routes and profilingService. Written by transformationProfilingService (upsert key `(file_id, column_name, file_role)`, :561), etlProfilingService (upsert key `(file_id, column_name)` in the output variant, :87; plain insert in the history variant, :291), the retention delete, and reprofile_files.js (UPDATE, never effective, see B9). The table has a `top_values` JSON column (database_ddl_2026-01-07.sql:1085).
- `profiling_metrics`: written by profile_api.py (:283, upsert key `(file_id, file_role)`, committed at :325), profilingService (:466, plain insert), etlProfilingService `profileETLFile` only (:325, plain insert), transformationProfilingService (:637, upsert key `(file_id, file_role)`). Read by the profile-history route (:6790). Created in backend/migrations/createETLTransformationTables.js:118 per inventory. The unique constraint itself was not verified.
- `fixed_width_schemas` (read, profile_api.py:1717); `vendor_agreement_file_schemas.column_metadata` (read, :233); `file_audit_details` (read and deleted by retention); `app_settings` key `profile_retention_count` (read) and keys `ai_dq_suggestions_enabled`, `ai_provider` (written on every Flask startup, :2215-2221); `column_sensitivity_tags` (written only by the unexported `savePIIColumnTags`, DEAD); `file_pattern_metrics` (written via backfill_metrics.js and test_aggregation.js, DASH).
- Anomaly tables via `AnomalyService` (ANOM).
- Env: `BACKEND_API_URL` (default http://localhost:5000, profile_api.py:182), `DATABASE_URL` (fetched from `GET {BACKEND_API_URL}/api/db_url` first, env fallback, :174-201), `ALLOWED_ORIGINS`, `PROFILE_API_PORT` (8000), `AWS_*`, `DISABLE_VIRUS_SCAN`, `MAX_MEMORY_PERCENT` (85), `WARNING_MEMORY_PERCENT` (75), `CIRCUIT_BREAKER_RECOVERY_PERCENT` (70).
- Files: temp files in the OS temp dir (profile_api.py temp, `etl_profile_*`, archive extraction dirs via `tempfile.TemporaryDirectory`), deleted afterwards.

## Flags

DUPLICATE
- D1. Three profile engines compute overlapping stats with different rules. profile_api.py `column_profiles` (full DataFrame, first-1000-row patterns, "least frequent" from the top-10) vs `profile_columns.py` (10,000-row sample, `unique_count < non_null` gate, random-sample patterns) vs `process_file.py` (first chunk only).
- D2. Two pattern notations. profile_api.py `get_picture_clause` yields `9(8)`, `A(3)`, `X(2)` with '.', '-', '/' kept literal (:1390-1445). data_profiling.py `detect_value_pattern` yields `9`, `A`, `a`, `X`, `$`, space with counts shown only above 3 (e.g. `999`, `9(8)`) (data_profiling.py:7-100). The same column gets different pattern strings depending on the path.
- D3. Quality scores computed three ways: `quality_checks.calculate_quality_score` (profile_api), `calculateQualityScore(fileInfo)` in transformationProfilingService (deductions 10/10/20/up to 20) and `calculateQualityScore(anomalies)` in profilingService (15/10/5 per anomaly). Both JS functions are named identically.
- D4. Type normalisation exists in profile_api.py `normalize_pandas_dtype` (:87), utils `get_user_friendly_type` (dtype_converter.py, not read), and Node `normalizeDataType` (server.js:6603). The Python comment says it is "aligned with" the Node one (:103) but equivalence was not checked.
- D5. Data-type name sets differ: the numeric check in profilingService queries `('integer','float','decimal','number')` while `normalize_pandas_dtype` emits `int`, `float`, `decimal`.
- D6. `data_profiling.profile_dataframe`, `compare_schemas`, `calculate_freshness`, `analyze_distribution` overlap SCH / DQ logic (see DEAD).
- D7. Two cleanup/retention styles: ETL history rows kept by `profile_timestamp` (never pruned here) vs file-level retention per `mapping_name`.
- D8. `saveColumnInfo` (legacy simple insert) vs `saveColumnInfoComprehensive` in the same file (transformationProfilingService.js:475, :513).
- D9. Two registration functions in etlProfilingService (`profileETLOutputFile` vs `profileETLFile`) with different conflict handling, differing mainly in history, and only the second writes `profiling_metrics`.
- D10. Header validation is invoked from two places: in-process from profile_api.py:1262 (swallows `success:false`, no issues) and via a spawned CLI from fileProcessingWorker.js:1822-1881 (treats crashes and non-zero exits as "healthy"). Same script, different failure handling.

BUG
- B1. etlProfilingService calls `profileFile(pool, { fileId, filename, filePattern, ... })` (etlProfilingService.js:122, :355) but `profileFile` takes `(pool, fileId, filename, filePattern, options)` (profilingService.js:372). The whole object arrives as `fileId`, `filename`/`filePattern`/`options` are undefined, so all four checks query with an object as `$1`. In pg an object parameter is serialised as JSON text, so lookups match no row and the checks return empty arrays silently (errors are swallowed). ETL anomaly detection via this path is effectively inert. The anomaly counts therefore show 0. The `run*Check` flags passed in the object are also not read by `profileFile`.
- B2. `/profile-history` most likely fails on every call: the scalar sub-select uses `json_agg(...)` with `ORDER BY fc.column_index` and no GROUP BY (server.js:6770-6789), which Postgres normally rejects because `column_index` is not grouped or aggregated. The route would return the 500 `Failed to fetch profile history` (server.js:6804). Not run against a database; same class as B14. (The earlier reasoning about the `profile_timestamp` join returning NULL columns is moot while the query fails; the join itself is at :6786-6787.)
- B3. server.js:6687 reads `col.type`, a column that does not exist in `file_columns` (the column is `column_type`), so the simulated `top_values` fallback is always `null`. The fabricated distribution is never produced (see entry 1 for what it would have returned). Independently, the intent is to invent data. Combined with B23, `top_values` in the `/profile` response is likely null for files profiled through transformationProfilingService.
- B4. `summary.completeness`/`uniqueness` divide by `row_count * column_count` with no zero guard (server.js:6708-6709), which gives `NaN` for empty files. `uniqueness` adds per-column distinct counts, so it is not a meaningful percentage.
- B5. "Least frequent value" is the last of the top-10 values (profile_api.py:1608-1611; data_profiling.py takes the real last of the full `value_counts`, so the two disagree).
- B6. Numeric pattern 'Percentage (0-100)' applies to any integer column in 0..100 (profile_api.py:1460); 'Decimal (2 places)' applies to columns averaging 0-2 decimals.
- B7. `||` null coercion drops 0/false values in `saveColumnInfoComprehensive` (transformationProfilingService.js:524-533, :589-593) and in reprofile_files.js (:80-85).
- B8. `process_file.py` computes per-column stats from only the first 10,000-row chunk but reports a full `row_count`; null/unique counts and `nullPercentage` (= null_count / total rows, transformationProfilingService.js:539) are therefore understated for larger files.
- B9. reprofile_files.js never succeeds (see entry 14).
- B10. `header_issues[issue_type] = issue` overwrites repeated issue types (profile_api.py:1281) while `issues[]` keeps all.
- B11. Load failures and empty files return HTTP 200 with a zero score instead of an error (profile_api.py:1230, :1242); callers must inspect `processing_error`. May be intentional (UNCLEAR).
- B12. `/api/vendor-profile` does not guard a missing or non-JSON body (`data.get` on None gives a 500).
- B13. `profileETLOutputFile` upsert on `file_columns (file_id, column_name)` conflicts with the 3-column key used elsewhere (`file_id, column_name, file_role`, transformationProfilingService.js:561). Which unique indexes exist was not verified, so one of the two statements may error on a real database.
- B14. `getWeeklyAverageSum` uses `ORDER BY` with an aggregate that has no GROUP BY (profilingService.js:48). Postgres accepts the query only if the ORDER BY column is grouped or aggregated; `f.created_at` is neither, so this query likely errors, is caught, and returns 0 (no numeric deviation check ever fires). Not confirmed by running it.
- B15. `profile_columns.py` header comment says "(including datetime)" for the numeric branch, but `df[col].dtype in ['int64', ...]` compares only four dtypes; `int8/16`, `uint*`, `float16`, nullable `Int64` fall into the string branch and report shortest/longest as strings.
- B16. `transformationProfilingService.profileFileBuffer` catch block references `fileId`, which is declared with `const` inside the `try` (:207) and is out of scope in the catch (:329, :335; the parameter is `providedFileId`, :163). The catch throws ReferenceError and the promise rejects instead of returning `{success:false}`. Only `downloadAndProfileFile` masks it.
- B17. `initialize_settings` is documented as seeding defaults but uses `ON CONFLICT ... DO UPDATE SET setting_value = EXCLUDED.setting_value`, so each Flask restart overwrites admin-changed values of `ai_dq_suggestions_enabled` and `ai_provider` (profile_api.py:2215-2221, comment at :2253 says DO NOTHING).
- B18. Tar member filter `'..' in member.name` is a substring test, so legitimate names like `a..b.csv` are skipped (profile_api.py:1060). Duplicate basenames across archive members overwrite each other on disk (:1032, :1080).
- B19. `header_validator.validate_headers` returns `success:False` for dat/avro/sas/zip/tar types (:563-567), and profile_api.py ignores it, so those files get no header checks without any message. In addition both failure modes exit 0 (:622-626), and the worker wrapper reports "healthy" on crashes (fileProcessingWorker.js:1862).
- B20. `parse_binary_fixed_width` silently drops records that fail `struct.unpack_from` (:854-856) and ignores declared `width` for numeric types (:704-709), so a schema whose widths disagree with the struct sizes yields shifted columns or fewer rows without an error.
- B21. `load_archive` forwards no delimiter, `header_config` or `fixed_width_schema` to members (:1115-1127), so a delimited or schema-defined `.dat` inside an archive depends on auto-detection.
- B22. `load_csv` with a user-supplied delimiter has no fallback (:534-544); a wrong delimiter that makes pandas error aborts the load.
- B23. `top_values` is never persisted by transformationProfilingService. `saveColumnInfoComprehensive` builds `topValuesJson` from `column.top_values` (transformationProfilingService.js:543-546) but the INSERT column list and the parameter array (:548-605) do not include `top_values` and `topValuesJson` is not referenced afterwards. `file_columns` has a `top_values` JSON column (database_ddl_2026-01-07.sql:1085). Files profiled through this path therefore likely have `top_values` NULL, so `GET /api/files/:fileId/profile` returns null for them (and the broken fallback in B3 cannot fill it). Whether another writer populates the column was not checked (not run against a database).
- B24. `/api/vendor-profile` (local mode) stores metrics and runs anomaly detection even when the load failed or the file was empty (profile_api.py:1734-1750). The upserted `(file_id, 'adhoc')` row gets row_count 0, column_count 0, overall score 0 and NULL component scores, replacing the previous row, and the anomaly service is run on those values. The handler does not check `processing_error`. Whether the anomaly service treats a zero row count as an anomaly was not read (ANOM area).

DEAD
- DEAD1. `savePIIColumnTags` (transformationProfilingService.js:668) is not exported or called. The file comments say governance is now persisted elsewhere (:301-303). `saveColumnInfo` (:475) is also unreferenced in the file.
- DEAD2. Parameters `userId` (:167) and `piiColumns` (:172) of `profileFileBuffer` are destructured but not used. `dataClassification` (:171) is used and is not part of this flag.
- DEAD3. `data_profiling.py`: `profile_dataframe`, `calculate_freshness`, `compare_schemas`, `analyze_distribution` are not called from the files read. Only `detect_column_patterns` is used (profile_columns.py:15). profile_api.py does `import data_profiling` (:34) but never calls it in the sections read (grep found no `data_profiling.` usage in the repo).
- DEAD4. `.tbz2` is recognised by `get_file_extension` but never dispatched; `.xml` appears in the docstring (:1174) only. The tar `member.issym() or member.islnk()` check (:1065) is unreachable in practice because `isfile()` (:1056) already excluded those member types.
- DEAD5. `getProfileStats`/`cleanupOldProfiles` are reachable only through the admin routes (live, but manual).
- DEAD6. Unused `pyzipper`/`struct`/`io` etc. were not checked.
- DEAD7. `test_column_stats.js` does nothing, and the `effective_size` variable at profile_api.py:816 is assigned and unused.

SECURITY
- S1. `/profile-api/*` proxy has no authentication (server.js:13978-13983). It exposes `/api/vendor-profile`, `/parquet-schema`, and the AI and settings routes. A caller can pass an arbitrary `local_file_path` and get its parsed content back (preview of up to 10,000 rows), limited by the parsers' supported formats. Production only.
- S2. Flask service has no auth of its own and binds `0.0.0.0` (profile_api.py:2261). `/api/vendor-profile` and `/parquet-schema` can be called from anywhere on the network.
- S3. `/api/vendor-profile` accepts caller-supplied `credentials` (access key, secret) in the body and logs the request config at INFO (`header_config`, `fixed_width_schema`; credentials are not logged directly, :1694).
- S4. `/parquet-schema` lets callers read any S3 object that the server's env credentials can reach, with `bucket` and `key` unvalidated (:1874-1893).
- S5. 500 responses return `str(e)` (`details`), leaking internals (:1853, :1922).
- S6. `/profile-history` returns raw min/max/mean/median per column without applying column access control, while `/profile` redacts the same fields (server.js:6770-6783 vs :6635-6659). Latent while the query fails (B2).
- S7. Flask fetches `DATABASE_URL` over HTTP from the Node `/api/db_url` endpoint (profile_api.py:182-188), which is an exposure endpoint listed in SEC. Fallback to the env var.
- S8. ClamAV scan is applied only to archives (:1000). Direct CSV/Excel/Parquet/etc. files are parsed without a scan in this service. With `DISABLE_VIRUS_SCAN=true` scanning is skipped; `scan_file_with_clamav` (:452-505) uses `which clamscan` with a 300 s timeout and re-raises internal exceptions as "Virus scanning failed", so if ClamAV is missing the archive load fails and the profile ends in a 200 with an error payload. May be scanned upstream (ARC area).
- S9. The retention endpoint `cleanup-profiles` accepts an unvalidated `retentionCount`. A value of `0` (or negative) deletes ALL transformation target files for every mapping. `0` is not falsy under the `=== null` check (profileRetentionService.js:17). Admin-only.
- S10. `pd.read_excel`, `pd.read_json` on arbitrary uploads without size limits in profile_api.py (memory-based denial of service); the memory guard exists only in process_file.py.
- S11. ZIP extraction in `load_archive` has no member-count, per-member, total-size or compression-ratio cap (profile_api.py:1025-1045), so a zip bomb is written to disk in full. The `NOSONAR` comment at :1053 describes protections that exist only on the tar branch (path check, 2 GB per member, symlink check). The password for encrypted ZIPs is also taken from the request body.

UNCLEAR
- U1. Whether `file_columns` rows are one per column per file, or one per column per file per role/timestamp. `/profile` selects all rows by `file_id` with no filter, so the response may duplicate columns when source and target profiles share a file_id (intent unknown).
- U2. Which profile engine's output ends up in `file_columns` for uploaded files. The upload path in fileProcessingWorker.js:1538-1900 (PROC) spawns process_file.py and profile_columns.py and also calls `/api/vendor-profile`. How the three outputs are merged is outside this area.
- U3. Why `quality_score` in `files` is hard-coded to 100 in etlProfilingService with a "Will be updated" comment; nothing in that file updates it.
- U4. Whether `file_role = 'adhoc'` (profile_api.py:322) is meant to coexist with `source`/`target` rows (the unique key suggests so) and which the UI reads.
- U5. Whether returning 200 with a zero score for unreadable files is relied upon by callers (PROC).
- U6. `profile_columns.py` imports `data_profiling` from the repo root and `dtype_converter` from `utils/`; this works only because callers set `PYTHONPATH` to the root (transformationProfilingService.js:28-31, fileProcessingWorker.js:1832-1836 for header_validator). Callers that do not set it (reprofile_files.js:28, BulkProfilingService.js:1104, fileProcessingWorker.js:1759) were not checked.
- U7. Whether `profileFile`'s "weekly average" (7 days) is meant to compare against files of the same pattern in other projects.
- U8. The quality 'consistency' and 'validity' components come from `quality_checks.py` (DQ); their definition was not read.
- U9. Whether the `health_score` rule in header_validator (penalty per issue count, not per severity) is intended, and how the UI uses `status` 'critical'/'warning'/'healthy'.

## Domain terms
- Profile / profiling: column-level statistics and quality assessment of a file (also "profiling metrics", `profiling_metrics`, "profile snapshot", "profile history").
- Vendor file / vendor profile: a file uploaded by or fetched for a vendor; same endpoint also used for drop-location and ETL files.
- File role: `source`, `target`, `adhoc` (profile_api).
- Column statistics: `file_columns` fields (null_count, unique_count, min/max, most/least frequent, patterns, histogram, top_values).
- Pattern / picture clause: COBOL-style (`9(8)`, `X(10)`) in profile_api; `9 / A / a / X` notation in data_profiling.
- Quality score, with components completeness, consistency, validity; also "overall_quality_score".
- Header health: `status` healthy/warning/critical and `health_score` from header_validator; header issue types duplicate_column_names, multiple_headers, no_headers, orphan_headers, missing_headers.
- Anomaly: row-count / numeric-sum / null-spike / type-mismatch deviation against a 7-day pattern average ("weekly average").
- File pattern: filename with date/number runs replaced by `*` (also called "logical file" elsewhere, see SCH).
- Masked / denied / allowed columns (column access control; `_accessLevel` full / masked / denied).
- Header config: `{hasHeader, columnNames}`, same concept as "delimiter config" and "fixed-width schema" for headerless/binary files.
- Archive member / member manifest: file inside a zip/tar; `archive_metadata.member_manifest`.
- Retention count: number of transformation profiles kept per mapping (`profile_retention_count`); "profile" is used for the file row of an ETL output.
- Different names for the same thing: "profiling service" (Flask), "Profile API", "profile_api", "PROFILING_SERVICE_URL", "PROFILE_API_URL" env vars (inventory.md:1061).

## Open questions
1. Is the ETL anomaly path (profileETLFile / profileETLOutputFile to profileFile) meant to work, and is anyone relying on its zero results? (B1)
2. How should profile history work: one row per profiling run or one per file and role? The code supports both (B2, U4). Does `/profile-history` really 500 on a live database (not run)?
3. Should `/profile-history` apply column access control like `/profile`? (S6)
4. Is the fake `top_values` fallback (20/60/20) intended behaviour? It never fires today (B3).
5. Which unique indexes exist on `file_columns` and `profiling_metrics`? Needed to judge B13 and the ON CONFLICT clauses; the migrations were not read.
6. Is the pattern notation to be unified (D2), and which one does the UI expect?
7. What do `quality_checks.run_basic_checks` and `calculate_quality_score` compute (DQ area, thresholds and weights)?
8. Is virus scanning intended only for archives in this service (S8)?
9. Was the `/profile-api` proxy meant to be public in production (S1)?
10. Contents of `load_excel`, `load_json`, `load_parquet`, `load_sas` (profile_api.py:569-623), `dtype_converter.py`, `logger.py`, `fileInsightsService.aggregateDailyMetrics` (DASH) and `jobExecutionEngine.js` were not read.
11. Time zone: `profiled_at = datetime.now()` in Python (server local time, :321) vs `NOW()` in SQL elsewhere; the column type and the time zone were not verified.
12. Is overwriting `ai_provider` and `ai_dq_suggestions_enabled` on every Flask restart intended (B17)?
13. Is the first-loadable-member-only behaviour for archives intended (:1135), and should members inherit the caller's delimiter and schema (B21)?
14. Should the header validator's unsupported types (dat, avro, sas, archives) report "not checked" rather than silently pass (B19)?
15. Is storing a zero-score metrics row and running anomaly detection for failed or empty loads intended (B24)? Does another writer populate `file_columns.top_values` (B23)?

## Inventory corrections
- inventory.md:105-106 list both server.js routes as "JWT, RPA". The code shows `authenticateToken` and `requireProjectAccess({resourceType:'file'})` only; "RPA" is read as that project access check.
- inventory.md:729-731: all three Flask routes confirmed with no auth. `/parquet-schema` uses env credentials (`:1883-1888`, the inventory says :1885).
- inventory.md:216 confirmed: the proxy mount has no auth middleware.
- The profile-retention admin routes (`/api/admin/cleanup-profiles`, `/profile-stats`, `/settings/:key`) are mounted with `authenticateToken, requireAdmin` (server.js:13876); they are listed under ADM in areas.md but their retention logic lives in PROF.
- `backfill_metrics.js` and `test_aggregation.js` are listed under PROF/DASH (inventory.md:885); by what they write (`file_pattern_metrics`) they belong to DASH.
