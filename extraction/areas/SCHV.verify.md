# SCHV verification (final, after fix round 2)

Verdict: PASS

Counts: checked 40, wrong 0, unsupported 0, missing 0.

## Coverage
- All 8 routes have subsections: schemaValidation.js:19, :83, :110, :141, :178, :213, :235, :263. processJob is present.
- The flag sections BUG, SECURITY, DUPLICATE, DEAD and UNCLEAR are present, and so are Open questions 1-6.

## Round-2 changes
- Record count stays 0: CORRECT.
  - Truncated json hits JSON.parse (:1663) and the catch returns null (:1700-1703).
  - null/sampleSize*fileSize gives 0 (:1562).
  - validateFileMetadata returns recordCount (:1514).
  - The stored result uses `recordCount: x || null, ...validationResult`, and the later spread overwrites the first key (:556-557).
  - Readers turn 0 into null or '-' (:256, :2304).
  - DQ uses a `!= null` check, so actual_row_count becomes 0 (:639-640).
- Hedged xlsx claim and OQ 6: CORRECT. xlsx.read is at :1677. The notes do not claim it throws on a truncated slice, and OQ 6 says that was not verified.
- Polling: CORRECT.
  - The 2000 ms interval is at SchemaValidationTab.jsx:74-76, gated on running/pending at :73.
  - The counter resets on success (:273) and increments on failure (:277).
  - The toast fires at >=5 consecutive failures (:281-288).
- DDL range :1955-1985: CORRECT. The table spans 1955-1985, with connection_id VARCHAR(255) at :1958, execution_type at :1963 and error_count at :1981. The job_files FK has no ON DELETE clause (:3415).
- :1285 cite: CORRECT. It throws 'Vendor agreement not found' in the legacy branch, and the legacy return has `qualityRules: []`.

## Sampled pass (all CORRECT)
- server.js:5198-5199 mounts the routes behind authenticateToken.
- Route validation (UUID regex, parseInt checks, 400 with `error`, 500 with `message`).
- createJob: status and total_files at :71-72, blank-file filtering at :85, correction at :99-103, and the all-blank case.
- setImmediate processJob (:52-63).
- The 404 'Report not found or expired' route, the filename sanitising, and the stream with no error handler (:197-198).
- getReportPath (:2357-2374).
- deleteSchedule status='scheduled' only, with no rowcount check (:2379-2384).
- updateSchedule (:2389-2414).
- getScheduledJobs status IN (:297).
- The file-row flattening and fallbacks (:248-267).
- ARCHIVE_EXTENSIONS (:27). extractArchiveContents supports no bz2 (:994-1006).
- BATCH_SIZE 10 (:451). The python3 argv password and '__NO_PASSWORD__' (:1055).
- getFileMetadata with 3 parameters and the local existsSync check (:1177-1212).
- Fixed-width always valid (:1456-1476). valid = missing columns only (:1496).
- getRecordCount thresholds and the parquet full download (:1545, :1575).
- DQ: skips disabled rules (:2441), the 10 and 50 caps (:2458, :2483), and the default case (:2531).
- report dir (:2271) and filename (:2277). Extraction tempDir (:900).

## Minor, not blocking
- `files` sent as a truthy non-array value would throw at `.filter` (:85) and return 500. The notes do not mention this.
- If `executionType` is omitted, the INSERT passes null explicitly (:74), so the DB default 'manual' does not apply. The notes say "manual (UI default, DB default)".
- fetchJobStatus (SchemaValidationTab.jsx:282) closes over a stale `pollingInterval` when it tries to clear the interval. Only the effect cleanup is reliable. Not in the notes.
