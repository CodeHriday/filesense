# CONN verification, round 3 (final re-verify after fix round 2)

Written by the orchestrator from the verifier's reply. The verifier declined to write report files.

**Verdict: PASS.** 38 claims checked, 0 wrong, 0 unsupported, 0 missed.

## Round-2 changes (all correct)
- **Entry 16 callers:**
  - ConnectionService.js:1111 calls `getAssumedRoleCredentials` with `role_arn: authConfig.iam_role_arn`, 900 s and 'DataObservatory-Test'.
  - connectionRoutes.js:1538 calls it with 3600 s and 'DataObservatory-Browse'.
  - `getAwsCredentials` calls it at :58. `createS3Client` calls `getAwsCredentials` at :182 and `createSesClient` at :217.
  - BulkProfilingService.js:230 calls it with 3600 s and 'DataObservatory-Browse'.
  - All callers use the same `connectionService` method, so they share the module-level `assumedRoleCache` (:10). A grep of backend found no other callers. AwsSesAdapter.js has its own separate method with the same name, which does not use this cache.
- **BUG 16:** `getAwsCredentials` reads `authConfig.role_arn` (:57) and returns null (:60). Create stores `auth_config.iam_role_arn` (connectionRoutes.js:330). `createS3Client` and `createSesClient` set `credentials` only when it is non-null (:183-185, :218-220), so they fall back to the default credential chain. BulkProfilingService and browse pass `role_arn` explicitly and are not affected.
- **Entry 9:** src/api/connectionService.js:80 is `axios.get(.../connections/${id}/test)`. Correct.

## Rewrite check
Nothing was lost. All 14 inventory routes and the FE /connections route still have subsections (#1-15). The round-1 items are still present:
- the `has_archive_password` list bug
- GET /:id/test missing `auth_config`
- the GCP browse bug
- the `access_key` aliasing
- the FE callers
- BUG 13, the assumed-role cache key

## Spot checks (correct)
- server.js:5171 and :5175 mount both routers behind `authenticateToken`.
- ConnectionService.js:
  - Provider switch at :925-952; sharepoint and outlook always return success.
  - The IAM-role branch is taken at :1088-1089.
  - List query: `status='active'` at :573, soft-delete filter at :578, `ORDER BY` at :600, parseInt `LIMIT` at :603.
- connectionRoutes.js:
  - GET /:id/test: permission check at :1091, project check at :1103-1117, and only `config` is passed (:1123-1126).
  - POST create sets `storage_type` at :286-292.
  - The 'azure-blob' fall-through is at :1190 and :1393.
  - `s3ForcePathStyle` is set at :1561.
  - The vault DELETE is at :729-732.
- ConnectionModal.jsx call sites :394-395, :460 and :492, and Connections.jsx :1627, :1743 and :1595, are correct.

## Not verified
The Snowflake and Databricks tests. The notes already mark them as not read.
