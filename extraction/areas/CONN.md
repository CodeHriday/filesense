# CONN: Storage and database connections

## Summary
Connections are rows in `storage_connections` (UUID `connection_id`). Both routers are mounted at `/api/connections` behind `authenticateToken` (server.js:5170-5175). `connectionRoutes.js` is mounted first, then `connectionBrowse.js`. The same table also holds email connections (smtp, ses, ...; emailConnectionRoutes.js:29), so the list, GET /:id and the duplicate-name check cover those rows too.
- Authorisation is only enforced in the handlers: project membership for non-admins, and `connection:execute` for test/browse (POST variants).
- No write-permission check exists on the backend. The frontend only hides buttons with `hasWritePermission('connections')` (src/pages/Connections.jsx:1627, :1743 and others).
- Credentials are encrypted with `encrypt()` on create and update. Reads return the whole `config` object, including the encrypted secrets.
- Providers with real test code: aws, gcp, azure, snowflake, databricks (ConnectionService.js:925-944). sharepoint and outlook always return success without testing (:946-952).
- Only aws/vendor, gcp and azure are browsable.
- IAM-role credentials come from `getAssumedRoleCredentials` (ConnectionService.js:79-148), documented below.
- Not verified: the Snowflake and Databricks test code and most frontend components (only grepped). Inventory lists 14 HTTP routes, and all 14 were read.

## Entry points

Common facts. Auth: every route requires a valid token via `authenticateToken` (server.js:5171, 5175). `isAdmin = userHasAdminAccess(req.user)`. "Project check" means: a non-admin must have `connection.project_id` in `getUserProjects(userId)`. Because `includes(null)` is false, a non-admin always fails this check on a global connection (`project_id` null) for PUT, DELETE, soft-delete, restore and test. Only GET /:id lets global connections through (connectionRoutes.js:106-108).

### 1. GET /api/connections (connectionRoutes.js:18)
- Query: `limit` (parseInt), `source` (accepted but a no-op, ConnectionService.js:594-597), `include_deleted === 'true'`.
- Rules (ConnectionService.js:536-612):
  - Only `sc.status = 'active'` rows are returned (:573).
  - Soft-deleted rows are excluded unless `include_deleted` is true (:577-579).
  - Non-admin sees `project_id = ANY(userProjects) OR project_id IS NULL`. With no projects they see only global rows (:585-591).
  - Ordered by `name ASC`. `LIMIT` is interpolated after `parseInt` (:602-604).
  - Includes email-connection rows, since they share the table.
- Response: an array. Each item has `connection_name`/`name`, `connection_type`/`type`, the full `config`, flattened provider fields (region, bucket_name, account_name, snowflake_*, databricks_*, sharepoint_*, outlook_*), and `has_*` booleans for secrets (:36-86).
- BUG: the SELECT (ConnectionService.js:552-570) does not select `has_archive_password`, so the route's `has_archive_password: conn.has_archive_password || false` (connectionRoutes.js:84) is always `false` in the list. GET /:id uses `SELECT *` and does report it.
- Errors: 500 `{error}`.
- BUG: because `status='active'` is hard-coded, a connection set to any other status via PUT never appears, even though `status` is accepted on PUT.

### 2. GET /api/connections/:id (connectionRoutes.js:100)
- Reads `SELECT * FROM storage_connections` (ConnectionService.js:620-637). Email rows are reachable here too.
- Admin or `project_id === null` skips the project check. Otherwise 403 `Access denied` (:104-121).
- Returns the same sanitized shape as the list, including the full `config` (:125-172), and `has_archive_password` (:171).
- Not found: the service throws "...not found", which the route maps to 404 (:176). Other errors give 500.
- Soft-deleted connections are still returned.

### 3. POST /api/connections (connectionRoutes.js:190)
- Body defaults: `connection_user='Internal'`, `authentication_method='key-based'`, `connection_direction='source'`, `use_ssl=true`, `path_prefix=''`.
- Permission:
  - Non-admin with zero projects gets 403 "You must be a member of at least one project" (:257-262).
  - A `project_id` outside their projects gets 403 (:265-271).
  - `project_id` may be null (a global connection), for admins and non-admins alike (:273-275).
- Config build:
  - `provider = connection_type`.
  - `storage_type` is set to s3 / gcs / azure-blob for aws / gcp / azure (:287-293).
  - Remaining body fields are spread into `config` (`...otherConfigDetails`, :283).
  - Per-auth-method switch (:298-370): key-based, aws-iam-role, gcp-sa-oidc, azure-managed-identity, oauth2, kerberos, db-short-lived-token (sets `token_ttl = 3600`).
  - Encrypted fields: AWS access/secret key, GCP `service_account_json`, Azure `account_key`, IAM `source_access_key`/`source_secret_key`, `oauth_client_secret`.
- Service `createConnection` (ConnectionService.js:645-729):
  - Runs in a transaction.
  - Requires `name`, `type` and `config`, else "Missing required connection fields".
  - Duplicate name is checked case-insensitively over all rows, including soft-deleted ones and email rows (:671-678). This throws, so it returns 500.
  - Inserts with `status='active'` and a `uuidv4` id.
- Archive password (:391-435): stored via `passwordVault.storePassword('connection', id, pwd, req.user?.id || 1)`, then `has_archive_password = true`. On failure the connection row is deleted (compensating delete) and the request fails with 500.
- Success: 201 `{success, message, connection:{connection_id,name,type,connection_user,connection_direction,description,authentication_method,status,created_at,has_archive_password}}`.
- Errors: all 500, including the duplicate name and missing field cases.
- No validation of `connection_type`, `connection_direction` or `connection_user` values.
- DB types such as snowflake and databricks have no config-building branch here. Their fields land only through `...otherConfigDetails`, unencrypted. `encryptSensitiveFields` exists (ConnectionService.js:248) but is not called by POST.

### 4. PUT /api/connections/:id (connectionRoutes.js:465)
- Non-admin: 404 if the row is missing, then 403 if the project check fails (:523-544).
- Merge: the existing config and auth_config are loaded, and fields are overwritten only if provided. For secrets, only a truthy value overwrites, which preserves the saved secret.
- The auth-method switch has no `db-short-lived-token` case (:577-644).
- Dynamic UPDATE: always sets `config` and `updated_at`. Optionally sets name, type, status, connection_user, description, authentication_method, auth_config (only if non-empty), connection_direction and path (:646-702).
- `status` is writable by any permitted user with no value validation.
- Archive password: `undefined` leaves it alone. A truthy value stores it and sets the flag true. Falsy (empty string or null) deletes from `encrypted_passwords` and sets the flag false (:707-745).
- Returns `{success, message, connection}`. 404 if the message contains "not found", otherwise 500.
- Does not check `is_deleted`. Does not re-check name uniqueness, so a rename can collide with an existing name unless the DB unique index rejects it (index per inventory.md:930).
- The `connection_name` in `config` is updated, but `project_id` can never be changed.

### 5. GET /api/connections/:id/dependencies (connectionRoutes.js:767)
- Auth: authenticated only, with no project check (SECURITY).
- Checks four dependency sets:
  - `vendor_agreements.vendor_connection_id` where `status != 'archived'`.
  - `vendor_file_profiling_results.connection_id` (count of distinct `file_id`).
  - `transformation_mappings` source or target.
  - `mapping_groups`, via members and mappings.
- Response: `{canDelete, inUse, dependencies:[{type,count,items}]}`. `canDelete=false` and `inUse=true` if any dependency exists (:849-852). Errors give 500 `Failed to check connection dependencies`.
- DUPLICATE: the same four queries are repeated inside DELETE (:890-951). They differ only in that DELETE caps items at 5 and returns names as plain strings, while this route returns `{id,name}` objects.

### 6. DELETE /api/connections/:id (connectionRoutes.js:866)
- Hard delete.
- Non-admin project check (:871-885). For a missing id, `getConnectionById` throws and the route returns 404.
- If any dependency exists: 409 `{error:'Connection cannot be deleted', canDelete:false, inUse:true, dependencies}` (:954-962).
- Otherwise `DELETE FROM storage_connections` (ConnectionService.js:884-901) and returns `{success:true, message}`.
- The vault entry in `encrypted_passwords` for the connection is not removed (no code does so). UNCLEAR whether a cascade exists.
- Dependencies in tables other than the four checked (for example project `drop_location_connection_id`, archival or ingestion references) are not checked. See ING.md for `drop_location_connection_id`.

### 7. PATCH /api/connections/:id/soft-delete (connectionRoutes.js:982)
- Non-admin project check.
- `UPDATE ... SET is_deleted=TRUE, deleted_at=NOW(), deleted_by=$userId, status='inactive'` (:1004-1013).
- 404 if no row, otherwise returns `{success, message, connection:{connection_id,name,is_deleted,deleted_at}}`. Errors give 500.
- No dependency check (unlike hard delete). No check for already-deleted.
- A non-admin with a missing id gets 500, not 404 (the not-found error is not mapped here).

### 8. PATCH /api/connections/:id/restore (connectionRoutes.js:1035)
- Non-admin project check. Sets `is_deleted=FALSE`, `deleted_at/by=NULL`, `status='active'` (:1057-1066).
- 404 if no row. Errors give 500.
- Restores to `active` regardless of the prior status.

### 9. GET /api/connections/:id/test (connectionRoutes.js:1088)
- Requires `req.user.permissions` to include `'connection:execute'`, else 403 (:1091). Admins are NOT exempt from this permission check.
- Project check for non-admins (:1103-1117).
- Calls `connectionService.testConnection({type: connection.type, config: connection.config})` (:1123-1126). `auth_config` is never passed.
  - `providerType = config.provider || type` (ConnectionService.js:914).
  - Secrets are decrypted only if they contain a ':' and split into 2 or 3 parts (:983-989).
  - Result is `{success, message}`.
- AWS test (:1084-1191):
  - Bucket from `bucket_name || bucket`, region default `us-east-1`.
  - The auth method is derived from `config.auth_config.iam_role_arn` (:1088-1089). If set, the IAM role is used with a 900 s session named `DataObservatory-Test` (:1117-1118). Otherwise it needs access and secret keys (:1134-1135).
  - Uses `s3.headBucket`.
  - Maps error codes NoSuchBucket, InvalidAccessKeyId, SignatureDoesNotMatch, Forbidden/AccessDenied.
- BUG: this route passes only `connection.config`, and `auth_config` lives in a separate column, so `config.auth_config` is undefined here. Saved IAM-role connections therefore always take the key-based path and fail with "Missing required AWS credentials" (unless the config itself carries `auth_config`, which nothing in the create route writes).
- GCP test (:1196-1251): requires `project_id`, `private_key`, `client_email` and `bucket_name`, then `bucket.exists()`.
- Azure test (:1256-1308): requires account name, key and container, then `containerClient.exists()`.
- BUG: GCP and Azure saved connections store different keys than the tests read. This is a likely cause of GCP tests failing. See Flags.
- Errors give 500 `{success:false, message}`. The test itself catches errors and returns 200 `{success:false}`.
- Logs the connection id and whether credentials exist (:1098, :1120).
- Called from the frontend at src/api/connectionService.js:80 (`axios.get(.../connections/${id}/test)`).

### 10. POST /api/connections/:id/test (connectionRoutes.js:1145)
- Same `connection:execute` check, but NO project check (SECURITY). Any user with the permission can test any connection by id, and can send form credentials.
- Merges the form body over the saved record (:1181-1291).
  - Effective type is `formData.connection_type || connection.type || savedConfig.provider`. Effective auth method defaults to `'key-based'`.
  - `storage_type` falls through to `'azure-blob'` for any type that is not aws or gcp (:1190).
  - Form secrets are used as plaintext. Saved ones are decrypted, and on decrypt failure the stored value is used as-is (silent fallback, e.g. :1219-1224).
  - Handles aws-iam-role and key-based only. Other auth methods (gcp-sa-oidc, azure-managed-identity, oauth2, kerberos) leave the test config with no credentials.
- The test config carries `access_key_id`/`secret_access_key` (:1242), while the AWS test falls back to those names (ConnectionService.js:1134-1135), so it works.
- Does not read the saved row's `status`/`is_deleted`.
- Logs the keys of the form body (:1159).
- Errors give 500 `{success:false, message}`.
- Also called from the frontend: ConnectionModal.jsx:492 (`POST /api/connections/${connectionId}/test`), and src/api/connectionService.js:92.

### 11. POST /api/connections/test (connectionRoutes.js:1325)
- `connection:execute` required. Tests an unsaved config from the form body.
- Builds the config the same way as POST create, but without encryption (:1379-1469). Default `authentication_method='key-based'`, `use_ssl=true`, `path_prefix=''`. `token_ttl=3600` for db-short-lived-token.
- DUPLICATE: the third copy of the per-auth-method config build, after POST create (:298-370) and POST /:id/test (:1186-1291). See Flags.
- AWS here sets `access_key_id`/`secret_access_key` from the destructured body fields (:1341-1342). A body sending `access_key`/`secret_key` is not destructured, so it falls into `...otherConfigDetails` and is spread into `config` (:1335-1385). `testAWSConnection` reads `config.access_key || config.access_key_id` (ConnectionService.js:1134-1135) and `decryptSensitiveFieldsIfNeeded` keeps `access_key` (:998-1002), so either name works for the test.
- Returns the test result `{success,message}`. Errors give 500.
- DB connection types (snowflake, databricks) in the body only work via spread `otherConfigDetails`. Not traced further.

### 12. POST /api/connections/:id/browse (connectionRoutes.js:1493)
- `connection:execute` required. NO project check (SECURITY). Body: `prefix=''`.
- Only reads connections with `status = 'active'` (:1507-1510). It does not filter `is_deleted`, but soft-delete also sets status to inactive.
- 404 `Connection not found or inactive`.
- Decrypts with `decryptSensitiveFields` (the non-"IfNeeded" variant, ConnectionService.js:384-523, which decrypts unconditionally). It also has branches for email types (:451-508).
- AWS:
  - IAM role session of 3600 s, `session_name 'DataObservatory-Browse'`.
  - Key-based forces `s3ForcePathStyle: true` always (:1561). Region default `us-east-1`.
  - `listObjectsV2` with `Delimiter '/'`, no `MaxKeys` set (AWS default 1000), no pagination. There is no continuation handling, so results beyond 1000 are silently truncated.
- GCP: `JSON.parse(decryptedConfig.service_account_json)` (:1596), bucket `gcp_bucket`. Calls `getFiles` twice.
  - BUG: `decryptSensitiveFields` for `gcp` decrypts only `private_key` (ConnectionService.js:415-419), not `service_account_json`. The create route stores `service_account_json` encrypted, so `JSON.parse` receives the encrypted string and throws. GCP browse cannot work for route-created connections.
- Azure: `listBlobsByHierarchy('/')`.
- Other types: 400 `Unsupported connection type for browsing`.
- Response `{success:true, prefix, items:[{name,path,type,size?,lastModified?}]}`. Folders and files are merged in one array.
- Errors give 500 `{success:false,message}`.
- Folder names are computed with `item.Prefix.replace(prefix,'').replace('/','')` (:1575, :1612, :1646). The name left after removing the prefix is of the form `name/`, so the slash removed is the trailing one. No defect shown for normal use.
- Does not apply `config.path_prefix` or the connection `path`.

### 13. GET /api/connections/:id/browse (connectionBrowse.js:21)
- Auth: token only. No `connection:execute` check and no project check (SECURITY).
- Called by the frontend: src/components/VisualMappingModals/FileBrowserModal.jsx:36.
- Query: `path=''`, `delimiter='/'`.
- Loads the connection (any status, including soft-deleted). Decrypts with `decryptSensitiveFieldsIfNeeded`. Supports `aws`, `vendor` (treated as S3), `gcp` and `azure`. Others get 400 `Browsing not supported for connection type: X` (:47-65).
- S3 (:82-132):
  - Reads `bucket_name`, `region`, `access_key`, `secret_key`. Throws `S3 bucket name not configured` if no `bucket_name`.
  - `MaxKeys: 1000`, no pagination, no IAM role support, no `endpoint` support.
- GCP (:137-209): reads `service_account_key`, `bucket_name` and `project_id`. `maxResults: 1000`.
- Azure (:214-279): `listBlobsFlat`. The delimiter test is `delimiterIndex > 0`, which ignores a delimiter at index 0 (:245). The whole container under the prefix is enumerated with no cap.
- Response `{success, path, folders[], files[], totalCount}`. Errors give 500 `Failed to browse connection: ...`. A missing id also gives 500 (the service throws, so the 404 at :30 is unreachable).
- DUPLICATE: a second browse implementation differing from #12 in response shape (separate `folders`/`files` vs merged `items`), param name (`path` vs `prefix`), config keys (`bucket_name` vs `bucket`, `service_account_key` vs `service_account_json`, `gcp_bucket`), auth, and 1000-key cap.
- BUG: it reads config keys that the create route does not write. Create stores `bucket` (aws), `gcp_bucket` and `service_account_json` (gcp). So for connections created via the standard route this fails with "S3 bucket name not configured" (unless the config also contains `bucket_name` through `...otherConfigDetails`, which depends on what the frontend sends).

### 14. POST /api/connections/infer-schema (connectionBrowse.js:289)
- Auth: token only (SECURITY: no permission check, no project check; any user can read file samples from any connection by id).
- Called by the frontend: src/components/VisualMappingModals/SourceConfigModal.jsx:330.
- Body: `connection_id`, `path`, `pattern` are all required, else 400 `connection_id, path, and pattern are required`.
- Missing connection: unreachable 404 (:302), because the service throws, so it returns 500 instead.
- Types: aws/vendor, gcp, azure. Others get 400 `Schema inference not supported for connection type: X`.
- Method:
  - Lists up to 100 objects under the prefix (S3 and GCP) and takes the first whose file name matches the wildcard pattern. Azure scans until the first match.
  - Downloads the first 100 KB (`bytes=0-102400`, which is actually 102401 bytes) and decodes it as UTF-8.
  - `matchFilePattern`: `.`, `*` and `?` are converted to regex, case-insensitive. Other regex metacharacters in the pattern are not escaped, so a pattern containing `(` or `[` can throw or behave as a regex (ReDoS risk).
- `detectFileType` uses the pattern's last extension. Map: csv, json, xml, xlsx (xls maps to xlsx too), parquet, txt, otherwise `'unknown'`.
- `inferSchemaFromContent` (:541-562):
  - Splits on `\n` and drops blank lines. Empty gives `File is empty or unreadable`.
  - csv: needs at least 2 lines, else error `CSV file must have at least a header row`. Header is a naive `split(',')` with quote stripping, no quoted-comma handling. Types come from up to 10 sample rows (`slice(1, min(11, n))`).
  - json: first element of an array, or the object, with `data_type` from one value.
  - xml, xlsx, parquet, txt, unknown: returns a single column `{column_name:'data', data_type:'string'}`.
- `inferDataType` order (:619-637): empty gives `string`. All values numeric (`!isNaN(v)`, check at :622) gives `float` if any value includes `.`, else `integer`. All `true`/`false` gives `boolean`. All parseable by `Date.parse` gives `date` (this check runs after the numeric check, so numeric strings never reach it). Otherwise `string`.
- BUG: for JSON, `inferDataType([sample[key]])` calls `v.includes` / `v.toLowerCase` on non-strings (numbers, booleans, null). This throws a TypeError for numeric and boolean values, so JSON files with number fields fail with "Failed to parse JSON: ..." (connectionBrowse.js:609, :624, :629).
- Response `{success:true, schema:[{column_name,data_type}], file_type}`. Errors give 500 `Failed to infer schema: ...`.
- Uses the same config keys as the browse route (`bucket_name`, `service_account_key`), so the same mismatch with create applies.
- Truncating at 100 KB can cut a JSON document mid-way, which makes `JSON.parse` fail for any JSON larger than 100 KB.

### 15. Frontend /connections (src/pages/Connections.jsx, route src/App.jsx:376)
- Page lists, searches (`searchedConnections`, :1595) and manages connections. Create, edit and delete controls are shown only when `hasWritePermission('connections')` (:1627, :1743 and others). This is client-side only.
- Uses `ConnectionModal.jsx`, which calls `POST /api/connections/test` (:460), `POST /api/connections/${connectionId}/test` (:492), and posts or puts to `/api/connections` or `/api/connections/:id` (:394-395).
- Notes at :70 and :1649: direction is no longer required, and connections can be used as source or target.
- Not traced in detail: delete flow (`ConnectionDeleteModal`), how soft-delete and restore are triggered. Not read.

### 16. getAssumedRoleCredentials (ConnectionService.js:79-148)
Internal service method, not a route. Callers: the AWS test (ConnectionService.js:1111), the IAM-role browse path (connectionRoutes.js:1538), `getAwsCredentials` (ConnectionService.js:58, which is used by `createS3Client` :182 and `createSesClient` :217), and BulkProfilingService.js:230. BulkProfilingService shares the same `assumedRoleCache` through this method.
- Input: `authConfig {role_arn, external_id, session_duration=3600, session_name, source_access_key, source_secret_key}`, `region='us-east-1'` (:79-80).
- Missing `role_arn` throws `role_arn is required for AssumeRole authentication` (:82-84).
- Cache: in-memory `Map` (`assumedRoleCache`, :10), keyed `${role_arn}:${external_id || 'none'}` (:86). A hit returns when `cached.expiration > Date.now()` (:89-91). On success the entry is stored with `expiration = Date.now() + ASSUMED_ROLE_CACHE_TTL`, where the TTL is `45 * 60 * 1000` ms (:11, :137-140).
- Source credentials for the STS call, in priority order (:96-115):
  1. `source_access_key` and `source_secret_key`, each passed through `this.safeDecrypt` (:97-102).
  2. `process.env.AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (:105-110).
  3. The default credential chain (:112-115).
- AssumeRole params: `RoleSessionName = session_name || DataObservatory-<Date.now()>`, `DurationSeconds = Math.min(session_duration, 43200)` (:119-123), `ExternalId` only if `external_id` is set (:125-127).
- Returns `AWS.Credentials` built from the response (:131-135). On failure it logs and throws `AssumeRole failed: <message>` (:144-147).
- Observations: the cache key omits region, session name, duration and source credentials, so a credential obtained with the 900 s test session (:1117) can be returned later to a caller asking for 3600 s. The cache TTL (45 min) is fixed and independent of the real session length. When `session_duration` is 900, the credentials expire after 15 min but stay cached for 45 min. See BUG 13.
- Console logs which credential source was used (:98, :106, :114); no secret values are logged.

## Data touched
- `storage_connections`: read and written (all routes). Columns used: connection_id, name, type, config (jsonb), status, description, project_id, connection_user, connection_direction, authentication_method, auth_config, path, has_archive_password, is_deleted, deleted_at, deleted_by, created_at, updated_at. Holds email connections as well (emailConnectionRoutes.js:29).
- `encrypted_passwords` (entity_type='connection'): via `PasswordVaultService.storePassword` and a direct DELETE (connectionRoutes.js:729-732).
- Read only for dependency checks: `vendor_agreements`, `vendors`, `vendor_file_profiling_results`, `transformation_mappings`, `mapping_groups`, `mapping_group_members`.
- `projects` (LEFT JOIN for project_name), plus `getUserProjects` (middleware/requireProjectAccess).
- External calls: AWS S3 (headBucket, listObjectsV2, getObject), AWS STS AssumeRole (via `getAssumedRoleCredentials`), GCS, Azure Blob, and Snowflake / Databricks tests (not read).
- Process memory: `assumedRoleCache` (ConnectionService.js:10).
- Environment variables read: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (:105). Values not recorded.
- Legacy `connections` and `transform_connections` tables: not touched by this area's routes (inventory.md:929-931).

## Flags

### DUPLICATE
1. Browse is implemented twice (`connectionRoutes.js:1493` and `connectionBrowse.js:21`) with different config keys, auth handling, params and response shape. See #12 and #13.
2. Dependency query block exists twice (GET /:id/dependencies vs DELETE).
3. Per-auth-method config building exists three times (POST create, POST /:id/test, POST /test), with different handling of `access_key` aliases.
4. Two decrypt variants: `decryptSensitiveFields` (unconditional, covers more types) and `decryptSensitiveFieldsIfNeeded` (heuristic ':' check). Different coverage.
5. Two test endpoints for a saved connection (GET and POST `/:id/test`) with different logic. GET uses saved config as is and checks the project. POST merges form data and does not check the project.
6. `ConnectionService.updateConnection` (:738) and the PUT route's own SQL both update connections. Only the route's is used by PUT.

### BUG
1. GCP: create stores `service_account_json`, `project_id` and `gcp_bucket`, but `testGCPConnection` requires `private_key`, `client_email` and `bucket_name`, and `connectionBrowse` needs `service_account_key` and `bucket_name`. A saved GCP connection cannot pass GET `/:id/test` unless the config carries those other keys. (Inference from key names. Not confirmed with a real record.)
2. Azure and AWS browse (connectionBrowse) read `bucket_name` and `container_name` and `account_key`. The create route writes `bucket` for AWS (connectionRoutes.js:303).
3. `infer-schema` JSON type inference throws on non-string values (connectionBrowse.js:609, :624, :629).
4. GET /api/connections always returns `has_archive_password: false` because the SELECT omits the column (ConnectionService.js:552-570; connectionRoutes.js:84).
5. GET `/:id/test` omits `auth_config`, so saved IAM-role connections always fail the AWS test with "Missing required AWS credentials" (connectionRoutes.js:1123-1126; ConnectionService.js:1088-1089).
6. POST `/:id/browse` on GCP cannot work for route-created connections: `service_account_json` is not decrypted (ConnectionService.js:415-419) and is then `JSON.parse`d (connectionRoutes.js:1596).
7. `connectionBrowse.js:30` and `:302` null checks are unreachable, since the service throws on missing rows. A missing id gives 500 instead of 404.
8. POST create returns 500 for client errors (duplicate name, missing fields). PUT does not re-check the duplicate name.
9. `soft-delete` for a non-admin with a missing id returns 500, not 404. GET list hides rows whose status is anything other than 'active', so a PUT with `status` makes a row vanish.
10. Hard delete leaves any archive password in `encrypted_passwords` (no code removes it).
11. Soft-deleted connections can still be fetched, tested and browsed (GET /:id, POST /:id/test, GET browse). Only POST browse requires `status='active'`.
12. Path-style inconsistency: key-based AWS browse always forces `s3ForcePathStyle: true` (connectionRoutes.js:1561), even with no custom endpoint. This breaks virtual-host bucket names with dots over HTTPS. Needs verification.
13. Assumed-role cache is keyed only by role and external id and has a fixed 45 min TTL, regardless of the requested session duration (ConnectionService.js:86, :137-140). A 900 s credential can be served from cache for up to 45 min.
14. `Range: 'bytes=0-102400'` is 100 KB + 1 byte (minor).
15. Non-admin cannot update, delete or restore global connections they could create (create allows `project_id` null, but the project check fails for null). Intent unclear.
16. `getAwsCredentials` reads `authConfig.role_arn` (ConnectionService.js:57), but the create route stores `auth_config.iam_role_arn` (connectionRoutes.js:330). For a saved `aws-iam-role` connection `role_arn` is therefore undefined, so `getAwsCredentials` returns `null` (:60). `createS3Client` and `createSesClient` then set no `credentials` (:183-185, :218-220), so the client silently uses the default AWS credential chain instead of the role.

### DEAD
1. `backend/utils/credentialSanitizer.js` is not used by any CONN route (only by email adapters and NotificationService). The routes do their own sanitizing inline.
2. `ConnectionService.updateConnection` (:738) is not called by connectionRoutes (PUT uses direct SQL). Other callers were not searched.
3. The `source` filter in `getAllConnections` (:594-597) is a no-op. The `is_active` column is referenced at ConnectionService.js:841 (the legacy path of `updateConnection`), but the SELECT hard-codes `TRUE as is_active`.

### SECURITY
1. GET /api/connections and GET /:id return the full `config` object, including encrypted secrets (`access_key`, `secret_key`, `account_key`, `service_account_json`), on top of the `has_*` flags (connectionRoutes.js:45, :132). The comment says credentials are not sent. `auth_config`, with the IAM `source_access_key`/`source_secret_key`, is also in `...rest` (service SELECT includes `sc.auth_config`).
2. Missing authorization:
   - GET `/:id/dependencies` has no project check.
   - GET `/:id/browse` and `/infer-schema` have no permission or project check, and both are reachable from the frontend.
   - POST `/:id/test` and POST `/:id/browse` have no project check.
   - Any authenticated user can read files in any connection's bucket through them.
3. No backend write-permission check on create, update, delete, soft-delete or restore, only the project membership check and, for creates, "member of at least one project". Frontend gating only.
4. `connection:execute` check is not bypassed for admins. If admin users lack it, they cannot test or browse via POST (UNCLEAR whether admin tokens carry all permissions).
5. Decrypt failures silently fall back to using the stored value (connectionRoutes.js:1219-1224, 1249-1258).
6. Operational logging of connection ids, form body key names and config properties (`console.log`, e.g. :1159, :1296-1302; ConnectionService.js:991-992). No secret values were seen logged.
7. `...otherConfigDetails` from the request body is spread into saved `config` unfiltered (create, :283). This allows arbitrary keys, including plaintext secrets for providers without an encryption branch (snowflake, databricks, sharepoint, outlook).
8. Azure connection string is built by string interpolation of `account_name`/`account_key` (several places), so a value with `;` could inject connection-string fields.
9. `infer-schema` `matchFilePattern` builds a RegExp from user input without escaping all metacharacters.
10. `limit` is parsed with `parseInt` before use in SQL. `NaN` gives `LIMIT NaN`, which is a SQL error (500). Not an injection.
11. Archive password stored as `req.user?.id || 1` when there is no user (:398, :714), a fallback attribution to user 1.
12. Email connection rows are returned by the generic list and GET /:id with their full `config`, and can be modified or deleted through these routes.

### UNCLEAR
1. Whether `vendor` is still a live connection type (browse and test code treat `vendor` as AWS, and ConnectionService comments say "vendor connections"). The create route sets `provider = connection_type`, so `type='vendor'` would take no storage branch.
2. Whether `path` (connection column) and `config.path_prefix` are both used downstream.
3. `connection_user` ('Internal'/'External') semantics: stored only, no logic in this area.
4. `authentication_method` `db-short-lived-token`, `oauth2` and `kerberos` have no test or browse logic here, and the comment "Config will be populated when token is requested" (:367) has no implementing code in this area.
5. The `/api/connections/test` unsaved test for snowflake/databricks passes whatever is in the body (not traced).

## Domain terms
- Connection / storage connection (`storage_connections`); "unified connection management" (comments); legacy `connections` and `transform_connections` tables. Email connections (smtp, ses, ...) share the same table.
- `connection_type` = `type` = `provider` (aws, gcp, azure, snowflake, databricks, sharepoint, outlook, vendor). `storage_type` s3 / gcs / azure-blob.
- `connection_user` Internal / External. `connection_direction` source / target. `authentication_method`: key-based, aws-iam-role, gcp-sa-oidc, azure-managed-identity, oauth2, kerberos, db-short-lived-token.
- Same thing under different names:
  - AWS keys: `access_key_id`/`access_key`, `secret_access_key`/`secret_key`.
  - Bucket: `bucket` / `bucket_name` / `gcp_bucket`.
  - GCP credential: `service_account_json` / `service_account_key` / `private_key`+`client_email`.
  - Browse path: `prefix` (POST) / `path` (GET).
  - Connection name: `name` / `connection_name`. Connection type: `type` / `connection_type`.
  - IAM role: `iam_role_arn` (auth_config, create form) / `role_arn` (getAssumedRoleCredentials argument).
- Global connection: `project_id IS NULL`. Soft delete: `is_deleted`, `deleted_at`, `deleted_by`, `status='inactive'`. Archive password: `has_archive_password`, `encrypted_passwords`, password vault.
- Dependencies: vendor agreements, vendor file profiling results, transformation mappings, mapping groups.
- `connection:execute` permission. Test connection (headBucket / exists). Browse. Infer schema. AssumeRole / assumed-role cache.
- "DataObservatory" (STS session name prefix, connectionRoutes.js:1545, ConnectionService.js:121, :1118): product's earlier name.

## Open questions
1. Which config keys does the frontend send on create (`bucket` vs `bucket_name`, GCP keys)? This decides whether bugs 1-2 hit real data. Not read: `ConnectionModal.jsx` payload.
2. Do admin users carry the `connection:execute` permission (where is `req.user.permissions` populated)?
3. Does `encrypted_passwords` or other FK tables cascade on hard delete of `storage_connections`?
4. Which other tables reference `connection_id` (drop location, archival, ingestion, monitoring), and why are they not in the dependency check?
5. Is the intended behaviour for non-admins on global connections (create allowed, modify denied) deliberate?
6. Snowflake and Databricks tests (ConnectionService.js after :1289) were not read, so their rules (timeouts) are not documented.
7. Is `status` meant to be user-settable on PUT, and what values are valid (only `active` and `inactive` appear in code)?
8. How `ConnectionDeleteModal` chooses between hard delete, soft delete and the dependencies call.
9. Where `userHasAdminAccess` derives admin status (utils/permissionHelpers), and how `getUserProjects` defines membership.
10. Whether `S3FolderBrowser.jsx` is used with these routes: it defaults to `/api/bulk-profiling/browse` (S3FolderBrowser.jsx:7), which is outside this area.
