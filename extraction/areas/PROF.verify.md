# PROF final verification (after fix round 2)

Verdict: FIX (marginal). Fix rounds are exhausted, so the area is marked done-with-issues. Carry the items below as open questions.

Written by the orchestrator from the verifier's reply; the verifier itself declined to write this file.

- About 80 claims checked: 2 wrong (minor), 0 unsupported, 1 substantive missing item and 2 minor omissions.
- Nothing lost in the rewrite: entries 1-16, D1-D10, B1-B24, DEAD1-7, S1-S11, U1-U9 and OQ 1-15 are all present, and every PROF inventory entry point has a subsection.
- All round-2 changes are correct: the /profile-history 500 message (server.js:6804; the json_agg ORDER BY without GROUP BY at :6770-6789); entry 9's orphan_headers nan (header_validator.py:293, :295, :221; profile_api.py:1241-1250 before :1262); the DEAD2 cites (:167, :172, :171 used at :249); B23 (:543-546 vs :548-605; DDL :1085; value_distributions at :618-619, :656); B24 (:1734, :1739-1750, :1231-1249, :317-320, :325, :342); B16 (const fileId inside the try at :207).

## Wrong (minor)
1. Entry 11 extractFilePattern: a trailing `_\d{1,10}` is replaced with `_*`, keeping the underscore (etlProfilingService.js:195). Only the bare `\d{1,10}$` at :196 becomes `*`.
2. The B16 and entry 10 line cites: the catch-block fileId uses are at transformationProfilingService.js:328 and :336, not :329 and :335. The behaviour is described correctly.

## Missing
1. Substantive: the cloud mode of /api/vendor-profile (profile_api.py:1818-1837) also calls store_profiling_metrics_and_detect_anomalies after profile_vendor_file, including on failed or empty loads, writing the same (file_id, 'adhoc') upsert and running anomaly detection. Entry 3's cloud paragraph omits this, and B24 says "local mode" only, so B24 understates its scope.
2. Minor, process_file.py exit paths: it also exits 1 on import failure (:42) and on unexpected exceptions (:170-182). A memory refusal from check_before_processing returns an error payload with exit 0 (:68-76); callPythonProcessor then rejects on result.error (transformationProfilingService.js:61-62), which feeds the B16 catch problem.
3. Minor, entry 9: detect_no_headers (:272) runs before the orphan detector (:583 vs :588). A zero-column frame raises ZeroDivisionError there, and validate_headers returns success:false (:622-626), so the "zero columns, loop does not run" remark in the orphan bullet is unreachable.

## Sampled passes, all correct
server.js entries 1 and 6 and the mount at :13876. profile_api.py CORS and the bind; the metrics/anomaly function (:283-366); cloud 400 and 500 (:1800-1804, :1849-1854); /parquet-schema; the date/duplicate/preview rules; the pattern rules; least-frequent; the loaders (load_csv, load_avro, load_dat, parse_binary_fixed_width, load_archive ZIP/tar); ClamAV; initialize_settings and B17. profile_columns.py and B15; data_profiling.py (D2); memory_monitor.py; streaming_processors.py; profileRetentionService.js and S9; adminSettingsRoutes.js; reprofile_files.js B9; profilingService.js B1, B14 and :261; etlProfilingService.js; fileProcessingWorker.js:961 and :1822-1881; backfill_metrics.js and the test scripts.
