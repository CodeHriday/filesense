# ING - File upload & drop ingestion

## Summary

Three upload endpoints in `server.js` plus one admin router:

- `POST /api/files/check-duplicate` hashes one uploaded file (SHA-256) and looks for a `files` row with the same `checksum`.
- `POST /api/files/upload` is the main "Upload & Profile" endpoint. It takes up to 20 files and checks role and project access. It optionally validates each file against a vendor agreement ("contract validation"): filename glob plus a column schema. It requires a File Drop Location connection on the project or sub-project (ad-hoc uploads only), writes a placeholder `files` row and queues a `file-processing` job for each file. It can also "atomically replace" an existing file.
- `POST /api/files/drop` takes one file. It checks the `file_drop:write` permission and project access. Unlike `/upload`, it runs the virus scan and the "has data rows" check synchronously. It then pushes the file directly to S3/GCS/Azure: either through a vendor or admin storage connection (`?connectionId=`), or through the single global `drop_location_config` row. Vendor uploads are first profiled by the Python Profile API at `http://localhost:8000/api/vendor-profile`. The endpoint then inserts the `files` row and queues the same `file-processing` job.
- `/api/drop-location/*` (backend/routes/dropLocation.js) is admin CRUD and connection testing for the single global `drop_location_config`. One route returns the decrypted credentials.

Frontend: `/upload` and `/drop` both render `src/pages/FileUpload.jsx` (vendors are redirected to `/vendor-file-upload`). The page calls check-duplicate once per file, then `/api/files/upload`. It never calls `/api/files/drop`; only `src/pages/VendorFileUpload.jsx:161` (VND area) does.

Downstream processing (worker, virus scan for `/upload`, upload to drop location, profiling) belongs to PROC. Schema extraction and comparison (`schemaExtractor`, `fileDataValidator`) belong to SCH.

## Shared middleware and configuration

- **Rate limit** `uploadLimiter`: `windowMs: 60 * 60 * 1000`, `max: 20` per IP, 429 `{ error: 'Too many file uploads, please try again later' }` (server.js:685-698). One limiter instance is used by all three upload routes (server.js:2489, :2557, :3476), so check-duplicate calls and uploads count against the same 20 per hour.
- **Multer disk storage** goes to `<repo>/uploads`, which is created if missing. The filename is `Date.now() + '-' + file.originalname` (server.js:798-809).
- **Size limit** `MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || (25 * 1024 * 1024)` (server.js:812). The comment on the multer limit says "default 100MB" (server.js:889). Other limits: `fieldSize: 10 * 1024 * 1024`, `files: 20` (server.js:890-891).
- **Allowed extensions** (`path.extname`, lowercased): `.csv .json .parquet .xlsx .xml .txt .tar .zip .gz .gzip .7z .avro .dat .sas7bdat .xpt` (server.js:838-848).
- **Allowed MIME types** are listed at server.js:813-837. `application/octet-stream` is itself in the list (server.js:819), so any allowed extension sent with that MIME type passes. A MIME type not in the list is rejected (server.js:865, :873-879). The `binaryExtensions` exception at server.js:868-871 only accepts `application/octet-stream`, which already passes the check at :865, so that branch can never run (see DEAD 7).
- **Filter errors** are plain `Error` objects, not `MulterError` (server.js:861, :879).
- **Authentication** `authenticateToken` comes from backend/src/middleware/authenticate.js (server.js:406). It loads the user and puts effective roles (direct plus group-inherited) on `req.user.roles` (authenticate.js:50-67). It also builds `req.user.permissions`: three default strings `'dashboard:read','file_profile:read','quality_checks:read'`, plus `{name, resource, action}` objects from `role_permissions`, plus the raw entries of the `roles.permissions` JSON array (authenticate.js:217-301). The result is cached under the key `permissions:user:${user.id}` (authenticate.js:188) for 600 s (authenticate.js:295).
- **Admin bypass** `userHasAllProjectAccess(user)` is true if the user has role `Admin`/`admin`, or any of the permissions `project_management:write`, `all_projects:read`, `users:write`, `roles:write` (server.js:348-373).
- **Approved agreement statuses** `FINAL_APPROVED_AGREEMENT_STATUSES = ['governance_approved','fully_approved']` (backend/utils/vendorAgreementApprovalStatus.js:7-10).
- **Agreement quality rules** `getQualityRulesFromAgreement(agreementId, filename)` (server.js:972-1022) reads all `vendor_agreement_file_schemas` for the agreement. The query has no status filter and no ORDER BY. It returns `quality_rule_ids` of the first schema whose glob matches and whose rule list is non-empty. Matching uses backend/utils/filePatternMatcher.js `matchesPattern` (case-insensitive anchored glob, filePatternMatcher.js:24-27; regexValidator.js:199-215). Any error returns `[]`.
- **Multer errors without a route handler**: `/upload` and `/check-duplicate` have no route-specific handler, so these errors reach the global `errorHandler` (server.js:14040-14041). `LIMIT_FILE_SIZE` gives 400 `{error:{message:'File too large',code:'FILE_TOO_LARGE',details:{maxSize}}}`. Anything else (bad type, too many files) gives 500 `INTERNAL_ERROR`, with the message and stack included unless `NODE_ENV === 'production'` (backend/middleware/errorHandler.js:74-101).

## Entry points

### POST /api/files/check-duplicate (server.js:2489-2554)

- **Trigger:** `checkDuplicateFile(file, projectId)` (src/api/fileService.js:147-166). FileUpload.jsx calls it once for a single drop (FileUpload.jsx:967) and once per file in a batch (FileUpload.jsx:1039).
- **Who:** JWT (`authenticateToken`) and `uploadLimiter`. There is no permission check, no upload-role check and no project-membership check on the `project_id` supplied.
- **Inputs:** multipart field `file` (single), optional `project_id` (`parseInt`) (server.js:2497).
- **Logic:**
  - Streams the file through SHA-256 and produces hex output (server.js:2500-2507).
  - If `project_id` is given, it runs `SELECT ... FROM files WHERE checksum = $1 AND project_id = $2 LIMIT 1`. Otherwise it searches the same checksum across all projects ("backwards compatibility") (server.js:2511-2518).
- **Outputs:**
  - Duplicate: 200 `{ isDuplicate: true, existingFile: { fileId, filename, fileSize, uploadedAt, projectId }, fileHash }` (server.js:2525-2537).
  - Not a duplicate: 200 `{ isDuplicate: false, fileHash }` (server.js:2539-2542).
  - 400 `No file uploaded` (server.js:2491-2493).
  - 500 `{ error: 'Duplicate check failed', details: error.message }` (server.js:2549-2552).
- **Side effects:** the uploaded temp file stays in `uploads/` on every path. The comment says the later `/upload` request will use it (server.js:2522-2523, :2547).

### POST /api/files/upload (server.js:2557-3439)

- **Trigger:** `uploadFile` (single file, fileService.js:238-310) and `uploadFilesBatch` (more than one file, fileService.js:315-377), both from FileUpload.jsx (lines 1186, 1077). It is also called by src/components/OnboardingWizard.jsx:362, and by the `useFiles` mutation `({ file, progressCallback }) => uploadFile(file, progressCallback)` (src/hooks/useFiles.js:118).
- **Middleware order:** `authenticateToken`, then `invalidateCache('cache:*:*files*')`, then `uploadLimiter`, then `upload.array('files', 20)` (server.js:2557). `invalidateCache` deletes the cache pattern before the handler runs, for every POST, whatever the outcome (backend/middleware/cacheMiddleware.js:99-115).
- **Who (upload right):** checked after multer has already written the files to disk.
  - One SQL query collects effective role names (`user_roles` UNION `access_group_roles` through `user_groups`) (server.js:2573-2586).
  - Allowed if any role name is in `['Admin', 'Data Engineer', 'Creator']` (server.js:2588-2590).
  - Otherwise allowed if `role_permissions` grants `file_upload:write` or `file:write` to any of those roles (server.js:2594-2603).
  - If the check itself errors, upload is denied (server.js:2605-2609).
  - Denied: temp files are deleted and the response is 403 `{ error: 'Access denied', message: 'You do not have permission to upload files. Contact your administrator.' }` (server.js:2612-2623).
  - The JSON `roles.permissions` array is not consulted here.
- **Inputs (form fields):**
  - `files[]`, up to 20.
  - `project_id` and `sub_project_id` (`parseInt`) (server.js:2633-2634).
  - `quality_rule_ids` (JSON array; invalid or not an array becomes `[]`) (server.js:2637-2648).
  - `delimiter` (free string, multi-character allowed) (server.js:2651).
  - `headerConfig` (JSON; invalid becomes null) (server.js:2657-2670).
  - `fixedWidthSchema` (JSON; handles double encoding; invalid becomes null) (server.js:2673-2701).
  - `archive_password` (server.js:2710).
  - `fileHashes` (JSON object `{originalname: sha256}`; trusted as-is) (server.js:2721-2733, :3095-3097).
  - `agreement_id` (`parseInt`) (server.js:2736).
  - `replace_file_id` (server.js:2947).
  - The frontend also sends `owner` and `vendor_agreement_file_schema_id` (fileService.js:242-244, :260-262). The server never reads either: no `req.body.owner` or `req.body.vendor_agreement_file_schema_id` exists in server.js.
- **400 if no files** (server.js:2626-2628). This runs after the permission check, so a user without rights gets 403 even with no files.
- **Contract validation (only when `agreement_id` is set)** (server.js:2750-2944):
  - Loads the agreement's file schemas only if the agreement has `status = 'active'`, `approval_status` in `FINAL_APPROVED_AGREEMENT_STATUSES` and `is_locked = true`, ordered by `file_name_pattern` (server.js:2754-2770). If no rows come back (wrong id, draft, unapproved, not locked), all contract validation is skipped silently and the upload continues with `agreementId` still set (server.js:2772).
  - Step 1, filename: for each file, the first schema whose `file_name_pattern` matches by `require('./src/utils/patternMatching').matchesPattern` wins (case-insensitive anchored glob; `*` means any characters, `?` means one character) (server.js:2751, :2779-2785; src/utils/patternMatching.js:75-119). If any file matches nothing, all temp files are deleted and the response is 400 `File pattern validation failed`, with `details.expectedPatterns` (`pattern (description)`) and a `hint` (server.js:2787-2816).
  - Step 2, schema: only if the matched schema has a non-empty array `schema`. The server calls `extractSchema(file.path, mimetype, {archivePassword, fixedWidthSchema, headerConfig})` and then `compareSchemas(uploaded, expected)` (server.js:2828-2856).
    - Invalid: all files deleted, 400 `Schema validation failed` with `errors/missingColumns/extraColumns/warnings` (server.js:2858-2887).
    - Extraction throws: all files deleted, 500 `Schema validation error` (server.js:2912-2933).
  - There is no check that the user may see the agreement, or that the agreement belongs to `project_id`.
  - Contract validation runs before the project-access check (server.js:2750 vs :2950).
- **Project resolution** (server.js:2950-2978):
  - If `project_id` is absent: `getUserProjects(userId)` is used. If it is empty and the user is not an admin, the response is 403 `No project access`. Otherwise `projectId` becomes the first project, or the literal `1` for an admin with no projects (server.js:2961).
  - `getUserProjects` returns active parent projects (direct membership or through groups) plus their active sub-projects, ordered by `name` (backend/middleware/requireProjectAccess.js:362-433). So "first" means alphabetically first, and it can be a sub-project.
  - If `project_id` is given, a non-admin must have it in `getUserProjects`; otherwise 403 `Project access denied`. Admins skip this check, including for inactive or nonexistent projects.
- **Drop-location requirement (only when no `agreement_id`)** (server.js:2986-3077):
  - If `sub_project_id` is given, the server loads it. Not found gives 404 `Sub-project not found` (server.js:3024-3032). If `parent_id !== projectId` the response is 400 `Invalid sub-project` (server.js:2998-3012). If the sub-project has `drop_location_connection_id`, that connection with its `drop_location_bucket` and `drop_location_prefix` is used (server.js:3014-3023).
  - Otherwise the parent project is loaded. Not found gives 404 `Project not found` (server.js:3043-3050). If it has no `drop_location_connection_id` the response is 400 `{ error:'Upload not configured', message: 'File uploads are not enabled for project "<name>". An administrator must configure a File Drop Location for this project.', code:'DROP_LOCATION_CONNECTION_MISSING' }` (server.js:3056-3070).
  - Contract uploads skip this block entirely, so `dropLocationConnectionId/Bucket/Prefix` stay null for them (server.js:2982-2986).
- **Per-file processing loop** (server.js:3085-3405):
  - `fileId = file_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`. `fileType` is the extension without the dot, lowercased (server.js:3086-3087).
  - Hash: the client-supplied `fileHashes[originalname]` if present, otherwise SHA-256 computed on the server (server.js:3094-3118).
  - Placeholder insert: `INSERT INTO files (file_id, filename, file_type, file_size, project_id, processing_step='queued', checksum, metadata={file_path}, created_at=NOW()) ON CONFLICT (file_id) DO NOTHING`. A failure is logged and ignored (server.js:3130-3143). `sub_project_id` is not written.
  - If `archive_password` is set, `passwordVaultService.storePassword('file', fileId, password, userId)` writes to `encrypted_passwords` (server.js:3146-3154; backend/services/passwordVaultService.js:108-113).
  - Quality rules: the manual `quality_rule_ids`, plus (if `agreementId`) `getQualityRulesFromAgreement`, de-duplicated (server.js:3157-3172).
  - Fixed-width default: if the file matched an agreement schema, no `fixedWidthSchema` was sent, and the file is fixed-width, the agreement schema is converted to `{columns:[{name, width, type}]}`. Fixed-width means extension `dat`/`bdat`, or schema `file_type` in `dat`, `fixed_width`, `bdat`, `binary_fixed_width`. Defaults: name `col_<n>`, `width: field.width || field.length || 10`, `type: field.type || field.data_type || 'string'`. If no headerConfig was sent, `{hasHeader: has_header === true || 'true'}` is used (server.js:3175-3224).
  - Queues `queue.addJob('file-processing', {...})` with options `attempts: 3`, `backoff: exponential 5000 ms` and `timeout: 1800000` (30 min). The payload contains `fileId, filePath, originalName, fileSize, fileType, userId, fileHash, projectId, subProjectId, qualityRuleIds, agreementId, delimiter, headerConfig, fixedWidthSchema, archivePassword, dropLocationConnectionId, dropLocationBucket, dropLocationPrefix` (server.js:3227-3250).
  - Result entry: `{ success:true, fileId, jobId, status:'queued', filename, file:{file_id, filename, file_type, file_size} }` (server.js:3268-3280).
  - Per-file error: the temp file is unlinked and `{success:false, filename, error:'Processing failed', message}` is pushed (server.js:3389-3404).
- **Atomic replacement** (`replace_file_id`; only for the first successful file) (server.js:3283-3387):
  - Loads the old file. It must exist and must have `project_id === projectId`. For non-admins, project access is checked again (server.js:3293-3329).
  - In one transaction it deletes from `file_preview, file_columns, file_quality_checks, file_schedules, file_history, alert_history, quality_reports, user_badges, transformation_outputs`, then `files` (server.js:3332-3350).
  - On success the result entry gets `replaced: true, replacedFileId` (server.js:3360-3362).
  - Any error is only logged. The upload still succeeds (server.js:3378-3386).
  - The old file is deleted right after the new job is queued, before the new file has been processed (server.js:3227 vs :3332).
- **Response:** 200 `{ success: successCount > 0, message: 'Batch upload complete: N succeeded, M failed', totalFiles, successCount, failedCount, results }` (server.js:3408-3418). Outer error: all temp files are deleted and the response is 500 `{ error:'File upload failed', details: error.message }` (server.js:3420-3438).
- **Virus scan:** not done here. The comment says it moved to `uploadWorker.js` (server.js:3090-3091). The scan is actually in backend/workers/fileProcessingWorker.js:469-472 (PROC). The worker pushes the file to the drop location only if `dropLocationConnectionId && dropLocationBucket` (fileProcessingWorker.js:516-519).

### POST /api/files/drop (server.js:3476-4646)

- **Trigger:** `src/pages/VendorFileUpload.jsx:161`, with `?connectionId=<agreement.vendor_connection_id>&agreementId=<agreement.id>`. No caller in the ING frontend.
- **Who:**
  - JWT and `uploadLimiter`.
  - Then `req.user.permissions.includes('file_drop:write')`, a plain string match; otherwise 403 `{ error:'Access denied', message:'You do not have permission to drop files. Contact your administrator.' }` (server.js:3485-3490). There is no admin bypass. The temp file is not deleted on this 403.
  - Project access is checked the same way as in `/upload` (default to the first project or `1`; 403 `No project access` / `Project access denied`) (server.js:3517-3545).
  - Vendor or admin rules for `connectionId` are described below.
- **Inputs:** multipart `file` (single); body `project_id`, `sub_project_id`, `quality_rule_ids`; query `connectionId`, `agreementId`, `folder` (server.js:3500-3514, :3553-3554, :3831). `fileId = drop_${Date.now()}_${8 hex}` (server.js:3548).
- **Step 1, drop-location check (only when no `connectionId`)** (server.js:3558-3644): the same sub-project/parent logic and the same 404, 400 `Invalid sub-project` and 400 `DROP_LOCATION_CONNECTION_MISSING` responses as `/upload`. It only checks that a `drop_location_connection_id` exists; it does not use it (see Step 6).
- **Step 2, agreement pattern check (only when both `connectionId` and `agreementId`)** (server.js:3649-3722): the same active, approved and locked agreement query and the same `src/utils/patternMatching` glob as `/upload`. No match gives 400 `File pattern validation failed`. If the agreement returns no schema rows, the check is skipped. The matched schema is kept for fixed-width profiling.
- **Step 3, synchronous virus scan** with `VirusScanService.scanFile` (server.js:3725-3785).
  - Infected: the file is deleted and the response is 400 `{ error:'Virus detected', message:'The uploaded file contains malware: ...', viruses }` (server.js:3731-3747).
  - Clean or skipped: `{scanned:true, clean:true, skipped}` with message `'Scan skipped - virus definitions unavailable'` or `'No threats detected'` (server.js:3750-3755). The service returns `skipped:true, isInfected:false` when ClamAV is unavailable (backend/services/VirusScanService.js:229-240).
  - Scan throws: the upload continues with `{scanned:false, clean:false, skipped:true, message:'Scan failed - continuing with warning'}` (server.js:3763-3785).
- **Step 4, has-data check:** `validateFileHasData(path, name)`. If invalid: the file is deleted and the response is 400 `Empty file rejected` with `details.errorCode` and hint `'Please ensure your file contains at least one data record, not just headers.'`. If the validator throws, the upload continues (server.js:3789-3828).
- **Step 5, connection branch (`connectionId` present)** (server.js:3840-4071):
  - Admin (`userHasAllProjectAccess`): any `storage_connections` row with `status='active'`; otherwise 404 `Connection not found` (server.js:3847-3864).
  - Non-admin: the user must have an `active` row in `vendors` with `vendor_user_id = user`; otherwise 403 `You are not registered as a vendor user` (server.js:3869-3881).
    - The connection must be some agreement's `vendor_connection_id`, where that agreement has `vendor_id` in the user's vendors, a final-approved status, `is_locked`, `status='active'`, and the user's email equal to `primary_contact_email` or `secondary_contact_email`. The query uses `LIMIT 1` with no ORDER BY (server.js:3902-3926).
    - On failure the 403 message names the agreement's vendor name and ID and the user's vendor IDs, or the user's email (server.js:3933-3965).
    - On success `projectId` is overwritten with the agreement's `project_id` (server.js:3971). `agreementSchema = va.schema` and `expectedFilePattern = va.file_name` (server.js:3974-3975).
  - `provider = connection.type` (server.js:3979). The bucket is `config.bucket || bucket_name || gcp_bucket || container_name` (server.js:3983).
  - Folder handling:
    - Strips leading and trailing `/`. Rejects `..` or `\` with 400 `Invalid folder path` (server.js:3986-4003).
    - If the folder string starts with the bucket name, that prefix is removed (server.js:4007-4015).
    - The folder (if given) is used as the full path; otherwise `connection.path` is used (server.js:4020-4041).
    - The key is `folder/originalname` with duplicate slashes collapsed (server.js:4043-4045).
  - `dropConfig` is built from `connection.config`: `access_key_id = config.access_key`, `secret_access_key = config.secret_key`, plus `service_account_json`, `account_name/key`, `region`, `endpoint`, `use_ssl` (server.js:4056-4070).
- **Step 5 alternative, global drop location (`connectionId` absent):** `SELECT * FROM drop_location_config WHERE is_active = true LIMIT 1`. None gives 400 `Drop location not configured`. `provider = dropConfig.provider || 'aws'`. Key: `${path_prefix}/${originalname}` or just `originalname` (server.js:4072-4093).
- **Step 6, vendor filename check** (only if `va.file_name` is non-empty, which only happens on the non-admin vendor path): `validateFilename(actual, expected)`. The extension must match case-insensitively, and the expected base name must be a case-insensitive substring of the actual base name (backend/utils/filenameValidator.js:21-86). A failure gives 400 `Filename pattern validation failed` with `expectedBase/actualBase/expectedExt/actualExt`. If the validator throws, the upload continues (server.js:4096-4156).
- **Step 7, vendor schema check** (only if `va.schema` is non-empty): `extractSchema` plus `compareSchemas`. Invalid gives 400 `Schema validation failed`. Any exception is logged as "Allowing upload despite schema validation error" (server.js:4159-4229). See the BUG flag on `archivePassword`.
- **Step 8, profiling** (`connectionId` only): POST `http://localhost:8000/api/vendor-profile` with `{file_id, local_file_path, filename}`, plus `fixed_width_schema` and `header_config {has_header}` when the matched agreement schema is fixed-width (same conversion and defaults as `/upload`). `timeout: 120000`. A failure sets `profileData = null` and the upload continues (server.js:4236-4316).
- **Step 9, push to cloud** (credentials go through `decrypt`, backend/utils/encryption.js:72-73):
  - `aws`: `AWS.S3({accessKeyId, secretAccessKey, region || 'us-east-1', endpoint?, sslEnabled?})` then `s3.upload` with `ContentType` and metadata `uploaded-by`, `original-filename`, `upload-timestamp` (ISO). The location is `uploadResult.Location` (server.js:4326-4362).
  - `gcp`: `new Storage({projectId, credentials: JSON.parse(decrypt(service_account_json))})`, non-resumable write stream, location `gs://<gcp_bucket>/<key>` (server.js:4363-4405).
  - `azure`: `require('@azure-sdk/storage-blob')` (see BUG), a connection string with `EndpointSuffix=core.windows.net`, `uploadFile`, location `blockBlobClient.url` (server.js:4406-4438).
  - Anything else: throws `Unsupported provider: <provider>`, which becomes 500 (server.js:4439-4441).
- **Step 10, persist:**
  - `INSERT INTO files (file_id, filename, file_type, file_size, metadata, project_id, is_vendor_file, vendor_agreement_id, created_at, updated_at)`. Metadata is `{storage_location, uploaded_by, provider, storage_key, drop_file:true, connection_id}`. `is_vendor_file = !!connectionId`, so admins using a connection also get `true`. `vendor_agreement_id` is the raw `agreementId` query value (server.js:4444-4474). No `checksum` and no `processing_step` are written.
  - Quality rules are merged as in `/upload` (server.js:4477-4492).
  - Queues `file-processing` with `{fileId, filePath, originalName, fileSize, fileType, userId, projectId, storageLocation, storageKey, provider, isVendorFile, qualityRuleIds, agreementId, fixedWidthSchema, headerConfig}`, same retry options (server.js:4496-4516).
  - If `connectionId` and profiling succeeded: `INSERT INTO vendor_file_profiling_results`. Scores come from `quality_score.overall_score` and `components.{completeness, consistency, validity, uniqueness, timeliness}`; JSON columns are `issues`, `header_issues`, `null_value_summary`, `date_format_issues`, `duplicate_data`, `profiling_metadata` (filled from `profileData.metadata`) (server.js:4544-4569). `vendor_id` is the first active vendor row for non-admins and null for admins. Errors are ignored (server.js:4529-4580).
  - If `connectionId`: invalidates the caches `cache:*:/api/vendor-files*` and `cache:*:/api/files*` plus `invalidateFileCache(fileId)` (server.js:4583-4598).
- **Response:** 200 `{ success:true, fileId, message:'File uploaded successfully to <PROVIDER> drop location', file:{file_id, filename, file_size, storage_location, provider, key}, virusScan, schemaWarnings?, hasWarnings }` (server.js:4616-4631). `schemaWarnings` are the profiler issues whose type is one of `missing_headers, orphan_headers, extra_columns, schema_drift, missing_columns`, mapped to `{type, severity (default 'medium'), message, recommendation}` (server.js:4601-4614).
- **Error:** the temp file is deleted and the response is 500 `{ error:'File drop failed', details: error.message }` (server.js:4633-4645). The catch unlinks the temp file unconditionally (server.js:4637-4639), including when the job was already queued. The comment at server.js:4526 says the worker cleans up the local file (see BUG 18).
- **Partial failure:** the cloud upload (server.js:4326-4441) runs before the `files` INSERT (server.js:4461) and `queue.addJob` (server.js:4496). See BUG 17.

### USE /api/files/drop error handler (server.js:4877-4911)

- Applies to errors raised by the drop route (multer). For `MulterError`:
  - `LIMIT_FILE_SIZE` gives 400 `{ error:'File too large', details:'File exceeds the maximum size limit of 25 MB. For larger files, please use ETL Mapping Jobs ...', code, maxSize:'25 MB' }` (server.js:4886-4893). The value is hard-coded and ignores `MAX_FILE_SIZE`.
  - Any other code gives 400 `File upload error` (server.js:4895-4899).
- Other errors, including the fileFilter type rejections, give 500 `{ error:'File upload failed', details: error.message }` (server.js:4900-4908).

### /api/drop-location router (mounted at server.js:5185 with `authenticateToken`)

All routes use local `requireAdmin` = `userHasAdminAccess(req.user)`: role `Admin`/`admin`, or `users:write`, `roles:write` or `project_management:write`. Otherwise 403 `Access denied. Admin role required.` (backend/routes/dropLocation.js:9-19; backend/utils/permissionHelpers.js:80-92). This permission list differs from `userHasAllProjectAccess`, which also accepts `all_projects:read`. The router holds exactly one active row of `drop_location_config`.

#### GET /api/drop-location/config (dropLocation.js:21-63)

- Returns the active row without the four credential columns. `hasCredentials` is `!!access_key_id` for aws (or a null provider), `!!service_account_json` for gcp, `!!account_key` for azure (dropLocation.js:39-58).
- No row: `{configured:false, config:null}`. Error: 500.
- Called by FileUpload.jsx:564 only when the frontend thinks the user is an admin. The result is stored in `dropLocationConfigured`, which is never read (see DEAD).

#### POST /api/drop-location/config (dropLocation.js:65-207)

- Body defaults: `provider='aws'`, `storage_type='s3'`, `use_ssl=true`, `path_prefix=''` (dropLocation.js:67-88).
- Required fields:
  - aws needs `bucket`;
  - gcp needs `project_id` and `gcp_bucket`;
  - azure needs `account_name` and `container_name`.
  Missing fields give 400 (dropLocation.js:91-99).
- Only the selected provider's credentials are encrypted with `encrypt`. If a row exists, a blank credential keeps the stored value for the same provider. The other providers' credential columns are set to null (dropLocation.js:101-133). The row is updated (setting `updated_by`) or inserted with `is_active=true, created_by, updated_by` (dropLocation.js:134-167).
- `hasCredentials` here for aws needs both keys (dropLocation.js:188-189); GET checks only the access key (:42).
- Response: `{ message, config }`. Error: 500.

#### DELETE /api/drop-location/config (dropLocation.js:209-220)

`UPDATE drop_location_config SET is_active = false WHERE is_active = true`. This is a soft deactivate; credentials stay in the row.

#### GET /api/drop-location/credentials (dropLocation.js:222-255)

Returns the decrypted credentials of the active row for its provider: aws `access_key_id`, `secret_access_key`; gcp `service_account_json`; azure `account_key`. No row gives 404. There is no frontend caller in the ING files.

#### GET /api/drop-location/test (dropLocation.js:257-311)

Tests the saved row:

- aws: `headBucket`, with `s3ForcePathStyle=true` when an endpoint is set (dropLocation.js:406-488).
- gcp: `bucket.exists()` (dropLocation.js:491-546).
- azure: `containerClient.exists()` using `@azure/storage-blob` with the `core.windows.net` suffix; `azure_endpoint` is ignored (dropLocation.js:549-603).

Responses: 200 `{success, message}`; 404 when not configured; 500. AWS error codes are mapped to messages: `NoSuchBucket`, `InvalidAccessKeyId`, `SignatureDoesNotMatch`, `Forbidden`/`AccessDenied` (dropLocation.js:461-486).

#### POST /api/drop-location/test (dropLocation.js:313-390)

Tests the request body merged with the saved row. Saved encrypted credentials fill blank form credentials for the same provider (dropLocation.js:332-358). The test helpers apply `safeDecrypt`, which returns the input unchanged if decryption throws (dropLocation.js:394-403). So plaintext or encrypted values both work, and all other fields (bucket, endpoint, region, account name) come from the request.

### FE /upload and /drop (src/App.jsx:342-343)

- **Route:** `ProtectedRoute` around `FileUploadOrRedirect`. Vendor users (`isVendorUser`) are redirected to `/vendor-file-upload`; everyone else gets `FileUpload` (App.jsx:235-245).
- **Tabs:** Upload & Profile, Bulk Profiling (BULK), Schema Validation (SCHV) (FileUpload.jsx:1515-1533). On `/drop` the page sets `activeTab='drop-file'` (FileUpload.jsx:259-265), but no tab button or content exists for that value (FileUpload.jsx:2540-2593). See BUG.
- **Gating:**
  - Form and dropzone show only if `hasWritePermission('file')` (FileUpload.jsx:1558, :2541).
  - A project is required (FileUpload.jsx:2542, :2572-2576).
  - The project or sub-project must not have `is_active === false` (FileUpload.jsx:2544-2552).
  - The selected parent project must have `drop_location_connection_id`. Otherwise the message is "No File Drop Location configured for this project..." (FileUpload.jsx:2554-2560). The UI does not consider a sub-project's own drop location here.
- **Defaults:**
  - Project from `?project_id=`, else the project named `'Default Project'` or with `is_default` (FileUpload.jsx:289-311).
  - Sub-project from `?sub_project_id=` (FileUpload.jsx:343-354).
  - Owner defaults to the current user's email (FileUpload.jsx:267-271, :507-512).
  - Upload type `'adhoc'` or `'contract'` (FileUpload.jsx:89, :1625-1650).
- **Dropzone props:** `acceptedFileTypes ['.csv','.txt','.json','.parquet','.xlsx','.xml','.zip','.tar','.tar.gz','.tgz','.tar.bz2','.tbz2','.gz','.7z','.sas7bdat','.xpt','.avro','.dat']`, `maxSizeMB={25}`, `multiple` (FileUpload.jsx:2562-2570). FileDropzone maps `.tar.gz`/`.tgz` to `.tar.gz` and `.tar.bz2`/`.tbz2` to `.tar.bz2` before checking (src/components/FileDropzone.jsx:110-133). It uses the batch callback only when more than one file is dropped (FileDropzone.jsx:193, :362). Component defaults are `['.csv','.json','.parquet']` and `maxSizeMB = 500` (FileDropzone.jsx:7).
- **Single file flow** (FileUpload.jsx:950-997):
  - In contract mode, auto-matches the filename to an agreement pattern; a miss is only a warning (FileUpload.jsx:956-964).
  - Calls check-duplicate. On a duplicate it shows DuplicateFileModal with Replace / Keep Both / Cancel (FileUpload.jsx:972-985; DuplicateFileModal.jsx:60-70).
    - Replace calls upload with `replace_file_id = existing.fileId` (FileUpload.jsx:1288-1319).
    - Keep Both uploads normally (FileUpload.jsx:1321-1345).
    - Cancel resets the dropzone (FileUpload.jsx:1347-1354).
  - After upload it polls `GET /api/files/:fileId/status` (PROC): every 1 s for the first 10 s, every 3 s up to 30 s, then every 5 s, with no stop condition other than `isComplete` or the user resetting (FileUpload.jsx:819-896). On completion it navigates to `/profile/:fileId?t=<now>` after 1500 ms (FileUpload.jsx:845-847).
- **Batch flow** (FileUpload.jsx:999-1148): check-duplicate for each file; duplicates are skipped automatically and counted as failed (FileUpload.jsx:1041-1047); the rest go in one `/upload` call. There is no redirect; a summary is shown instead.
- **Contract-validation errors:** the 400/500 responses `File pattern validation failed`, `Schema validation failed` and `Schema validation error` are shown as a structured validation error (FileUpload.jsx:1247-1271).
- **Delimiter mapping:** `comma ','`, `pipe '|'`, `tab '\t'`, `semicolon ';'`. `custom` uses `customDelimiter || ','`. `none` and fixed-width types send no delimiter (FileUpload.jsx:578-595).
- **Header config:** sent only when "has header" is off and column names are given (FileUpload.jsx:598-622).
- **Fixed-width schema:** fixed-width types are `['dat','bin','bdat','fixed_width','binary']` (FileUpload.jsx:112). Schema files can be JSON or CSV with `name,width`; width must match `/^\d+$/` and be > 0 (FileUpload.jsx:649-781).

## Data touched

| Table / store | Operation | Where |
|---|---|---|
| uploads/ (local disk) | multer writes; unlink on most rejections; left behind by check-duplicate and the drop 403; unlinked by the drop catch even after queueing | server.js:798-809, :2522, :3485-3490, :4637-4639 |
| files | SELECT by checksum; INSERT placeholder (`processing_step='queued'`); INSERT drop row; DELETE on replace | server.js:2511-2520, :3132-3136, :4461-4474, :3348 |
| file_preview, file_columns, file_quality_checks, file_schedules, file_history, alert_history, quality_reports, user_badges, transformation_outputs | DELETE on replace | server.js:3337-3345 |
| roles, user_roles, access_group_roles, user_groups, permissions, role_permissions | SELECT (upload right) | server.js:2573-2602 |
| projects | SELECT drop_location_connection_id, drop_location_bucket, drop_location_prefix, parent_id, name | server.js:2989-2991, :3038-3041, :3564-3567, :3610-3613 |
| vendor_agreement_file_schemas, vendor_agreements | SELECT (patterns, schema, quality_rule_ids, agreement auth) | server.js:980-984, :2754-2770, :3653-3669, :3902-3942 |
| vendors, users | SELECT (vendor auth) | server.js:3869-3891, :4534-4537 |
| storage_connections | SELECT active connection (config with credentials) | server.js:3851-3854, :3902-3926 |
| drop_location_config | SELECT / INSERT / UPDATE / soft-deactivate | server.js:4074-4076; dropLocation.js:23-31, :116-167, :211 |
| encrypted_passwords | INSERT via passwordVaultService.storePassword | server.js:3148; passwordVaultService.js:108-113 |
| vendor_file_profiling_results | INSERT (last JSON column is `profiling_metadata`) | server.js:4544-4569 |
| Queue `file-processing` | addJob (memory or Redis, PROC) | server.js:3227-3250, :4496-4516 |
| Cache (Redis) | delPattern `cache:*:*files*`, `cache:*:/api/vendor-files*`, `cache:*:/api/files*`, per-file; read/write of `permissions:user:${id}` (600 s) | server.js:2557, :4587-4589; authenticate.js:188, :295 |
| S3 / GCS / Azure Blob | object upload (drop) and headBucket/exists (test) | server.js:4326-4438; dropLocation.js:406-603 |
| Python Profile API | POST localhost:8000/api/vendor-profile | server.js:4294-4296 |
| ClamAV | scanFile (drop only) | server.js:3725-3729 |

## Flags

### BUG

1. **Vendor schema validation in `/drop` never runs.** `archivePassword` is used at server.js:4167 and :4171 but is never declared in the drop handler. It is declared only inside the `/upload` handler (server.js:2710), and there is no module-level binding. The `ReferenceError` lands in the catch at server.js:4217-4228, which logs "Allowing upload despite schema validation error" and continues. Result: whenever `va.schema` is non-empty, the vendor schema check is skipped.
2. **Azure drops always fail.** server.js:4408 requires `@azure-sdk/storage-blob`. The rest of the code uses `@azure/storage-blob` (dropLocation.js:550). The `require` throws and the drop returns 500.
3. **Replace on duplicate always fails, silently.** The transaction deletes from `file_preview` (server.js:3337). No such table appears in the schema dumps or migrations; the table is `file_preview_data` (backend/migrations/createFilePreviewDataTable.js:7), which is also what the regular delete uses (server.js:2090). The error leads to ROLLBACK and is only logged (server.js:3373-3386). The new file is kept and the old one is not removed. The frontend then shows "New file uploaded. Note: Old file may not have been deleted." (FileUpload.jsx:1306-1307).
4. **Drop without `connectionId` checks one location and writes to another.** It requires the project or sub-project to have `drop_location_connection_id` (server.js:3558-3644), but the file is then written to the global `drop_location_config` row (server.js:4072-4093), not to that connection.
5. **Saving a GCP or Azure drop location likely fails.** The prod schema dump has `bucket varchar(255) NOT NULL` (attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql:4578). POST /config for gcp or azure does not require `bucket` and passes it through as undefined/null (dropLocation.js:91-99, :144, :161). This would violate the constraint and return 500 if the live table matches the dump.
6. **The drop permission check only sees string permissions.** server.js:3485 uses `permissions.includes('file_drop:write')`. Permissions from `role_permissions` are objects (authenticate.js:240-246), so only roles carrying the string in the JSON `roles.permissions` array pass. Seed roles do carry it (backend/scripts/seedProductionManual.sql:24, :71).
7. **A batch can exhaust the upload rate limit.** A batch of N files makes N check-duplicate requests plus one upload request on the same `uploadLimiter` (max 20 per IP per hour) (FileUpload.jsx:1026-1077; server.js:685-698, :2489, :2557). Any batch of 20 files exceeds the limit.
8. **check-duplicate leaks temp files.** It never deletes its temp file (server.js:2522-2523). The following `/upload` call sends the file again and multer writes a new copy, so the first copy is never reused.
9. **The "owner" chosen in the UI is discarded.** The UI sends `owner` (fileService.js:242-244, :324-326). The server never reads it, and it is not in the job payload (server.js:3227-3245).
10. **Placeholder rows can be orphaned.** The placeholder `files` row is inserted before `storePassword` and `addJob` (server.js:3132 vs :3148, :3227). If either fails, the per-file catch only unlinks the temp file (server.js:3389-3404), leaving a `files` row stuck at `processing_step='queued'`.
11. **Replace deletes the old file before the new one is processed.** The old record is deleted right after queueing (server.js:3283-3350). If the job later fails, both versions are lost (this matters once item 3 is fixed).
12. **Bucket-prefix stripping is not boundary-aware.** It uses `normalizedFolder.startsWith(bucketName)` (server.js:4007-4008). With bucket `data`, folder `database/x` becomes `base/x`.
13. **`/drop` renders an empty page.** `activeTab='drop-file'` (FileUpload.jsx:260-261) matches no rendered tab, so the page shows only the header and tab bar.
14. **Extension lists disagree between frontend and backend.** The frontend accepts `.tgz`, `.tbz2` and `.tar.bz2` (FileUpload.jsx:2566). The backend checks `path.extname`, which yields `.tgz` and `.bz2`/`.tbz2`; none of these is in `ALLOWED_EXTENSIONS` (server.js:838-848). The upload then fails with the generic 500 from errorHandler.js:86-101.
15. **The UI ignores sub-project drop locations.** The frontend blocks upload when the parent project has no drop location (FileUpload.jsx:2554), but the backend accepts a sub-project's own drop location (server.js:2988-3023).
16. **The 25 MB message is hard-coded.** The `/drop` size message says 25 MB (server.js:4889-4891) even when `MAX_FILE_SIZE` is overridden (server.js:812). The comment at server.js:889 says the default is 100MB.
17. **`/drop` can orphan a cloud object and a `files` row.** The cloud upload (server.js:4326-4441) happens before the `files` INSERT (server.js:4461) and `queue.addJob` (server.js:4496). If the INSERT throws, the object stays in the bucket with no `files` row. If `addJob` throws, the object and a `files` row with no job both remain. In both cases the catch unlinks the temp file and returns 500 (server.js:4633-4645). Nothing in the handler removes the cloud object. This is separate from BUG 10, which covers `/upload`.
18. **The `/drop` catch deletes the temp file even after the job was queued.** Any throw after `addJob` (server.js:4496) reaches the same catch (server.js:4633-4645), which unlinks `req.file.path` (server.js:4637-4639). The job is already queued, so the worker may find the file missing; the note at server.js:4526 says the worker does the local cleanup. The profiling-results INSERT has its own try/catch (server.js:4572-4579), so this applies to the later steps and any other throw after queueing.

### DUPLICATE

1. **Three filename matchers.**
   - `src/utils/patternMatching.matchesPattern` (a frontend ES module `require`d by the backend) validates contract patterns in `/upload` and `/drop` (server.js:2751, :3651).
   - `backend/utils/filePatternMatcher.matchesPattern` picks agreement quality rules (server.js:978). The glob semantics are the same, but the rules query has no status filter and no ORDER BY, and it skips matching schemas whose rule list is empty (server.js:980-1005). The validation query is ordered by `file_name_pattern` and stops at the first match (server.js:2769, :2779-2784). The schema used for validation and the one used for rules can therefore differ.
   - `backend/utils/filenameValidator.validateFilename` does extension equality plus a base-name substring check against `va.file_name`, only for the `/drop` vendor path (server.js:4096-4108).
2. **Two upload-permission models.** `/upload` uses role names `Admin`, `Data Engineer`, `Creator`, or `role_permissions` granting `file_upload:write`/`file:write` (server.js:2588-2603). `/drop` uses the string `file_drop:write` from `req.user.permissions` (server.js:3485). The frontend uses `hasWritePermission('file')` (FileUpload.jsx:1558).
3. **Admin checks.** `userHasAllProjectAccess` exists twice: server.js:348-373 and backend/utils/permissionHelpers.js:60-73. dropLocation.js uses a third variant, `userHasAdminAccess`, without `all_projects:read` (permissionHelpers.js:80-92). The frontend `isAdmin` is `users:write || project_management:write || Admin` (FileUpload.jsx:81).
4. **Replace delete list vs regular delete.** The replacement cascade (server.js:3337-3348) copies the regular delete endpoint (server.js:2090-2101) but uses `file_preview` instead of `file_preview_data`.
5. **Project resolution, sub-project checks and drop-location checks** are copy-pasted between `/upload` (server.js:2950-3077) and `/drop` (server.js:3517-3644). `/drop` does not read the bucket or prefix.
6. **Fixed-width conversion from the agreement schema** is duplicated (server.js:3179-3224 and :4247-4291). It also exists in the frontend with different defaults: no `width || length || 10` fallback (FileUpload.jsx:207-222).
7. **The virus scan runs twice for drops:** synchronously in `/drop` (server.js:3725-3785) and again in the worker on the queued job (fileProcessingWorker.js:469-472). Profiling also runs twice for vendor drops: inline (server.js:4294) and through the queued job (server.js:4496). The comment calls the inline storage "legacy, now handled by worker" (server.js:4528).
8. **S3 client options differ.** The drop-location test sets `s3ForcePathStyle: true` when an endpoint is set (dropLocation.js:440-443). The actual `/drop` S3 client does not (server.js:4329-4335).

### DEAD

1. FileUpload.jsx `handleTestConnection` and `handleDirectUpload` (FileUpload.jsx:898-948) are never referenced.
2. FileUpload.jsx `showDropLocationModal` is never set to `true`, only to `false` (FileUpload.jsx:58, :1481, :1504), so the modal never opens. `dropLocationConfigured` is set (FileUpload.jsx:568) but never read.
3. FileUpload.jsx `selectedConnection` is never set (FileUpload.jsx:142; no `setSelectedConnection(` call). The vendor branch of the owner lookup (FileUpload.jsx:456-475) is unreachable. Vendors are also redirected away from this page (App.jsx:239-241).
4. `deleteFile` is imported but unused in FileUpload.jsx (FileUpload.jsx:10).
5. The three folder-path branches in `/drop` all assign `folderPath = normalizedFolder` (server.js:4027-4037).
6. `vendor_agreement_file_schema_id` is sent by the frontend (fileService.js:260-262) and never read by the server.
7. The `binaryExtensions` MIME exception in `fileFilter` (server.js:868-871) is unreachable. It only accepts `application/octet-stream`, which is already in `ALLOWED_FILE_TYPES` (server.js:819) and passes the check at server.js:865.

### SECURITY

1. **The archive password is logged in plaintext:** `console.log('req.body.archive_password:', ...)` (server.js:2560) and `logger.info('[DIAGNOSTIC] ...', { fieldValue: req.body.archive_password })` (server.js:2704-2708). It is also put in the queue job payload (server.js:3242), which is persisted if the Redis queue is used (PROC). The frontend comment says "one-time use, not stored" (fileService.js:281, :355), but the server stores it in the vault (server.js:3146-3148).
2. **GET /api/drop-location/credentials returns decrypted cloud credentials** to any admin-equivalent user (dropLocation.js:222-255).
3. **check-duplicate leaks file metadata across projects.**
   - With no `project_id` it searches every project's checksums (server.js:2514-2518).
   - With a `project_id` it does not check membership (server.js:2511-2513).
   - Either way it returns the matching file's `fileId`, `filename`, `fileSize`, `uploadedAt` and `projectId` (server.js:2527-2535).
4. **`/upload` contract validation does not check the agreement.** There is no check that the agreement belongs to `project_id` or that the user may use it (server.js:2754-2770). Supplying any `agreement_id` also skips the drop-location requirement (server.js:2986) and merges that agreement's quality rules (server.js:3158-3162).
5. **Client-supplied `fileHashes` become the stored `checksum` with no verification** (server.js:3095-3097, :3136). That checksum is what duplicate detection relies on.
6. **`/drop` does not bind `agreementId` to `connectionId`.** The query `agreementId` used for pattern checks and stored as `vendor_agreement_id` is never compared with the agreement that authorised the connection (server.js:3554, :3653-3669, :4472 vs :3902-3926). A vendor could pass another agreement's ID to get looser patterns, or to tag the file under another agreement.
7. **Vendor folder is not confined.** `?folder=` is only checked for `..` and `\` (server.js:3991). It is not confined to the agreement's `drop_location_path` (selected at server.js:3908 but never used), so a vendor can write anywhere in the connection's bucket.
8. **The vendor 403 message discloses details:** other vendors' names and IDs, and contact-email mismatch (server.js:3944-3952).
9. **Raw `error.message` is returned to clients** in 500 responses (server.js:2551, :3436, :4643, :4906), as are the extraction errors in the schema-validation 500 (server.js:2927-2931).
10. **POST /api/drop-location/test can reach arbitrary hosts.** It combines saved credentials with a request-supplied `endpoint`/`bucket`/`account_name` and makes outbound calls, so an admin can trigger requests to arbitrary endpoints (dropLocation.js:332-367, :440-443).
11. **Expensive work before access checks.** Multer accepts and stores files before the upload-right check (server.js:2557 vs :2569-2623). In `/upload`, schema extraction runs before the project-access check (server.js:2849 vs :2950). On the drop 403 the temp file is not removed (server.js:3485-3490).

### UNCLEAR

1. **`require('./src/utils/patternMatching')` may not load.** The file uses ES `export` syntax (src/utils/patternMatching.js:75, :107) and package.json has no `"type"`. Whether Node can `require` it depends on the Node version's require(esm) / syntax-detection support. `.replit` pins `nodejs-20` (.replit:1). If it throws, every contract-validated upload returns 500.
2. **Vendor-type connections may not work in `/drop`.** It uses `provider = connection.type` (server.js:3979) and only accepts `aws`, `gcp` and `azure` (server.js:4326, :4363, :4406). Storage connections also have type `'vendor'`, with credentials in `access_key_id`/`secret_access_key` (backend/services/ConnectionService.js:261-277; backend/migrations/vendorConnectionsMigration.js:27-41, :60). `dropConfig` reads `config.access_key`/`config.secret_key` (server.js:4062-4063). Whether vendor agreements point at `'vendor'`-type connections (which would give `Unsupported provider`) is not settled here. For `gcp`-type connections, ConnectionService encrypts `private_key` (ConnectionService.js:279-283), while `/drop` reads `config.service_account_json`.
3. **A skipped scan is reported as clean:** `clean: true` together with `skipped: true` when ClamAV is unavailable (server.js:3750-3755).
4. **Vendor auth picks an arbitrary agreement.** The query uses `LIMIT 1` without ORDER BY (server.js:3925). With several agreements on one connection, the `projectId` override and the `va.file_name`/`va.schema` checks come from an arbitrary agreement.
5. **Non-admin vendors need a project before connection logic.** They must pass the generic project-access step (server.js:3517-3545) before `projectId` is overwritten with the agreement's project (server.js:3971). A vendor with no project membership gets 403 `No project access`.
6. **Allowed MIME list may reject some CSVs.** `ALLOWED_FILE_TYPES` has no `application/vnd.ms-excel` (server.js:813-837). A `.csv` sent as `application/octet-stream` is accepted, because that type is in the list (server.js:819). A `.csv` sent with any other unlisted type, such as `application/vnd.ms-excel`, is rejected (server.js:865, :873-879); the exception at server.js:868-871 does not help since it is unreachable (DEAD 7). Which MIME types real clients send for `.csv` cannot be determined from the code.
7. **Admins can upload to any project ID,** including inactive or nonexistent ones, and default to project `1` (server.js:2961, :3528). For contract uploads the project's existence is never checked; the placeholder insert failure is swallowed (server.js:3138-3143).

## Domain terms

- **File Drop Location**: the term has three meanings.
  1. The per-project or per-sub-project storage connection: `projects.drop_location_connection_id`, plus `drop_location_bucket` and `drop_location_prefix` (server.js:2990, :3067).
  2. The single global `drop_location_config` row managed under `/api/drop-location` (dropLocation.js).
  3. A vendor agreement's `vendor_connection_id` / `drop_location_path` (server.js:3908, :3913).
- **Upload vs Drop**: "Upload & Profile" (`/api/files/upload`, queued; the file reaches cloud storage through the worker) versus "Drop File" (`/api/files/drop`, pushed synchronously to cloud storage; the comment at server.js:3475 says "without profiling", although it profiles vendor files and queues a job).
- **Ad-hoc upload vs Contract Validation**: `uploadType` `'adhoc'` / `'contract'` (FileUpload.jsx:89). "Contract" is the same thing as vendor agreement (`agreement_id`, `agreement_code`).
- **File pattern / file schema**: `vendor_agreement_file_schemas.file_name_pattern` (glob) and `.schema` (column list). This is different from `vendor_agreements.file_name` (called `expected_file_pattern`, substring rule) and `vendor_agreements.schema` (`agreement_schema`) (server.js:3909-3910).
- **checksum = fileHash = SHA-256 hex** (server.js:2500-2507, :3136).
- **Duplicate actions**: Replace (`replace_file_id`, "atomic replacement"), Keep Both, Cancel (DuplicateFileModal.jsx:60-70).
- **Placeholder record**: the `files` row with `processing_step='queued'` (server.js:3129-3136).
- **Vendor file**: `files.is_vendor_file`. It is true for any drop with `connectionId`, admins included (server.js:4471).
- **Provider vs storage_type**: `aws`/`gcp`/`azure` versus `s3`/`gcs`/`azure` (dropLocation.js:68-69; schema comment at the attached_assets dump line 4576). For connections, `provider` comes from `storage_connections.type` (server.js:3979).
- **Fixed-width**: file or pattern types `dat`, `bdat`, `fixed_width`, `binary_fixed_width` on the backend (server.js:3180-3182). The frontend uses `dat`, `bin`, `bdat`, `fixed_width`, `binary` (FileUpload.jsx:112).
- **Header config**: `headerConfig {hasHeader, columnNames}` in `/upload` versus `header_config {has_header}` sent to the Profile API (server.js:4272-4274).
- **Archive password**: `archive_password` field, stored through the password vault as entity type `'file'` (server.js:3148).
- **Final-approved agreement**: `approval_status` in `governance_approved` or `fully_approved`, with `status='active'` and `is_locked=true`.

## Open questions

- Whether the live `drop_location_config` table matches the attached schema dump (`bucket NOT NULL`). No migration in the repo creates the table; only the dumps (attached_assets/*.sql, database_ddl_2026-01-07.sql) and vendorConnectionsMigration.js reference it.
- Which Node version runs in production, which decides whether `require('./src/utils/patternMatching')` works (see UNCLEAR 1).
- Which `storage_connections.type` values vendor agreements' `vendor_connection_id` actually point at (see UNCLEAR 2).
- Whether the `'Creator'` role exists in any seed. Only `Admin` and `Data Engineer` were seen (backend/scripts/seedProductionManual.sql:19, :68); not checked further.
- What `/api/vendor-profile` returns and how the worker treats `isVendorFile` drop jobs and the `dropLocation*` fields. These belong to PROF and PROC and were not traced here.
- The behaviour of `extractSchema`, `compareSchemas` and `validateFileHasData` (SCH) was not traced. Only their call sites and how their results are used are recorded.
- Whether any client calls `GET /api/drop-location/credentials` or the two test routes. No caller was found in the ING frontend files; other pages (for example the admin settings UI) were not searched.
