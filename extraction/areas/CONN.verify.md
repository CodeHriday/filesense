# CONN verification (round 2, after fix round 1)

Verdict: FIX (checked ~60, wrong 2, unsupported 1, missing 3)

## Coverage and nothing-lost check
- All 14 routes (entries 1-14) plus the page (entry 15) are present, plus entry 16 (getAssumedRoleCredentials). No missing entry point.
- Flags present: DUPLICATE 6, BUG 15, DEAD 3, SECURITY 12, UNCLEAR 5, OQ 10. Nothing visibly dropped by the Write rewrite.
- DEAD #4 is gone, as intended. Mounts confirmed at server.js:5170-5175.

## Round-1 changes: confirmed CORRECT
- Entry 11 access_key flow: connectionRoutes.js:1335-1385 (access_key and secret_key are not destructured, so they spread via otherConfigDetails), ConnectionService.js:1134-1135 and :998-1002 all match.
- FE callers: FileBrowserModal.jsx:36, SourceConfigModal.jsx:330, ConnectionModal.jsx:492 (and :460, :394-395) match. src/api/connectionService.js:92 matches. App.jsx:376 matches.
- Entry 16: :10-11 (TTL 45 min), :79-148, cache key :86, hit :89-91, source credential priority :96-115, params :119-127, store :137-140, error :144-147 all match. BUG 13 is correct: the 900 s session (:1117) is cached 45 min and keyed without duration.
- Removed BUG #4 and rewritten Date.parse text: inferDataType at connectionBrowse.js:619-637 is consistent with the notes.
- 4 new bugs:
  - List SELECT :552-570 has no has_archive_password, so connectionRoutes.js:84 is always false. Correct.
  - GET /:id/test :1123-1126 passes only config, while testAWS reads config.auth_config at :1088-1089. Correct.
  - GCP browse: :415-419 decrypts only private_key, then JSON.parse at connectionRoutes.js:1596. Correct.
  - Email rows: emailConnectionRoutes.js:29 reads storage_connections, and decryptSensitiveFields email branches are at :451-508. Correct.
- Azure test range :1256-1308 is correct.
- Other rules checked and correct: list filters (:573-591, :602-604), createConnection (:645-729), PUT (:523-745), dependencies and DELETE (:767-962), soft-delete and restore (:1004-1013, :1057-1066), GET and POST /:id/test, POST /test, POST browse (:1507-1510, :1561, :1596), connectionBrowse GET browse (:47-65, :82-132, :137-209, :245) and infer-schema.

## WRONG
1. Entry 9 (line 116) says "GCP and Azure saved connections store different keys than the tests read". Azure is not mismatched. Create stores account_name, container_name and account_key (connectionRoutes.js:318-322), and testAzureConnection reads exactly those (ConnectionService.js:1258). Only GCP mismatches (create stores service_account_json, project_id and gcp_bucket, while testGCP needs private_key, client_email and bucket_name, :1198). Also BUG 2 implies Azure and AWS browse mismatch. For Azure, connectionBrowse.js:215 reads the same keys create writes, so only AWS (bucket vs bucket_name) mismatches.
2. SECURITY 10 claims a non-numeric `limit` gives `LIMIT NaN` and a 500. The route (connectionRoutes.js:28) passes NaN, and the service guards with `if (limit)` (ConnectionService.js:602), where NaN is falsy. No LIMIT clause is added, so there is no error. A limit of 0 is also ignored.

## UNSUPPORTED
1. Entry 14 and BUG 14 say the 100 KB download is 102401 bytes. That is true for S3 `Range: bytes=0-102400` (:411) and GCS `end: 102400` (:465, inclusive). For Azure, `download(0, 102400)` (:502) takes a count, so it is 102400 bytes.

## MISSED
1. Restore (entry 8) says "404 if no row. Errors give 500", but for a non-admin with a missing id, getConnectionById throws at :1042 and the catch at :1077-1080 returns 500, never 404. BUG 9 only mentions soft-delete.
2. ConnectionService.getAwsCredentials (:57) reads `authConfig.role_arn`, but create and PUT write `auth_config.iam_role_arn` (connectionRoutes.js:330, :609). That path returns null (default chain) and never assumes the role. The notes only mention the naming difference under Domain terms and do not flag it as a bug.
3. The frontend calls `GET /api/connections/storage` (EditSubProjectModal.jsx:45) and `POST /api/connections/list-files` (SourceConfigModal.jsx:436). No handler exists in either router or anywhere in the backend. `/storage` falls into GET /:id (500 on an invalid id) and `/list-files` has no matching POST route.

## Minor, no action needed
- Summary line 9 says vendor is browsable. That is true only for GET browse (connectionBrowse.js:49). POST browse returns 400 for vendor (connectionRoutes.js:1660).
