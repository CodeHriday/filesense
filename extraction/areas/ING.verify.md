# ING verification (round 2, after fix round 1)

Verdict: PASS

- About 95 claims checked against code: 0 wrong, 1 unsupported (partly inferred), 0 missed entry points.
- Two minor omitted error branches and one imprecise citation are listed below. None changes a claim in the notes.

## Coverage
Every ING row in areas.md and inventory.md has a subsection.
- check-duplicate, upload, drop and the /api/files/drop error handler.
- All 6 /api/drop-location routes.
- The FE /upload and /drop route (App.jsx:342-343).
- Also present: filePatternMatcher, FileDropzone, DuplicateFileModal.

## Nothing lost in the rewrite
The flag counts match the round-1 extraction (STATE.md:68) plus the two additions.
- SECURITY 11, DUP 8, UNCLEAR 7, open questions 7.
- BUG 16 plus the new 17 and 18 gives 18.
- DEAD 6 plus the new 7 gives 7.
- Every flag and entry-point section is still present. The vendor-profiling, replace-cascade, folder-handling and drop-location sections are intact.

## The new items
- **profiling_metadata:** CORRECT. server.js:4550 and :4568 name the column and fill it from `profileData.metadata`. The column exists in the schema dumps (attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql:6873).
- **DEAD 7 and UNCLEAR 6:** CORRECT. `application/octet-stream` is in ALLOWED_FILE_TYPES (server.js:819). The check at :865 therefore passes, and the `binaryExtensions` branch at :868-871 can never run. Extensions are checked first at :855. A `.csv` sent as octet-stream is accepted.
- **Cache key `permissions:user:${user.id}`:** CORRECT. authenticate.js:188 sets the key, and :207 reads it. :295 sets it with a 600 s TTL. :218-222 holds the three default strings. :240-246 builds the `{name, resource, action}` objects. :277-281 pushes the raw `roles.permissions` entries.
- **useFiles.js:118:** CORRECT. The line is `mutationFn: ({ file, progressCallback }) => uploadFile(file, progressCallback)`.
- **BUG 17:** CORRECT.
  - The cloud upload runs at server.js:4326-4441.
  - The files INSERT runs at :4461, and queue.addJob at :4496.
  - Nothing in the handler deletes the cloud object.
  - The catch at :4633-4645 unlinks the temp file and returns 500.
- **BUG 18:** the mechanics are CORRECT. The catch unlinks `req.file.path` unconditionally (:4637-4639). The profiling INSERT has its own try/catch (:4529-4580), and so does cache invalidation (:4583-4598). The comment at :4526 says the worker cleans up.
  - UNSUPPORTED part: the claim "any other throw after queueing" never says what could throw. The only unguarded code after addJob is the `profileData.issues.filter(...)` call (:4604) and `res.json` (:4616). `.filter` only throws if `issues` is truthy and not an array. So the scenario is real but very unlikely.
  - The note "the worker may find the file missing" is an inference. The worker does read `filePath` (fileProcessingWorker.js:472 and later).
  - The fixer's statement that the note is partly inferred is accurate. The cited lines :4583-4631 are now in the notes and match the code.

## Claims opened and checked (all CORRECT unless noted)
- Rate limiter (server.js:685-698) and its use on all three routes (:2489, :2557, :3476).
- Multer storage, MAX_FILE_SIZE, the "100MB" comment, and the field and file limits (:798-812, :886-894).
- Extension and MIME lists, and the plain `Error` from the filter (:813-883).
- Global errorHandler (server.js:14040-14041; errorHandler.js:74-101), and the fact that no other MulterError handler exists.
- check-duplicate: the whole handler (:2489-2554).
- /upload:
  - invalidateCache middleware (cacheMiddleware.js:99-115).
  - Permission-check SQL, role list and fail-closed behaviour (:2573-2623).
  - Input parsing (:2633-2736).
  - Contract validation (:2750-2944).
  - Project resolution (:2950-2978).
  - Drop-location block (:2986-3077).
  - Per-file loop, placeholder insert, vault call and job payload (:3085-3250).
  - Fixed-width conversion (:3175-3224).
  - Replace cascade, with `file_preview` at :3337 versus `file_preview_data` at :2090.
  - Response and outer catch (:3408-3438).
- Quality rules helper (:972-1022). Admin helpers (:348-403 and permissionHelpers.js:60-92).
- /drop:
  - Permission check, project resolution, Steps 1 to 4 (:3485-3828).
  - Connection and vendor branches (:3840-3976).
  - Folder handling (:3985-4045).
  - dropConfig (:4056-4070), global config (:4072-4093).
  - Steps 6 and 7, including the `archivePassword` ReferenceError. `archivePassword` is declared only at :2710 and used at :4167 and :4171.
  - Profiling (:4236-4316).
  - Cloud upload, including the `@azure-sdk/storage-blob` require at :4408 (:4326-4441).
  - Persist and response (:4444-4631). Error handler (:4877-4911).
- VirusScanService skip (:229-241), filenameValidator (:21-86), `getUserProjects` (:362-433), passwordVaultService.storePassword (:108-113).
- All 6 dropLocation routes, `requireAdmin` and `safeDecrypt`. This includes the AWS and GCP test mapping and `s3ForcePathStyle` at :440-443.
- Schema dump drop_location_config `bucket NOT NULL` (:4578), seeds (seedProductionManual.sql:24, :71), ConnectionService 'vendor' case (:261-277), `.replit:1` is nodejs-20.
- Frontend:
  - Polling (FileUpload.jsx:819-896), handlers (:950-1147, :1288-1354), error display (:1247-1271).
  - Dropzone props (:2562-2570) and gating (:2540-2583). Tabs (:1515-1533).
  - Delimiter and header helpers (:578-622). The `/drop` tab effect (:259-265).
  - fileService callers and unused fields (:147-166, :238-377). FileDropzone (:7, :110-133, :193, :362).
  - Dead code: DEAD 1 to 4.

## Minor omissions (error branches the notes do not list)
1. /drop returns 400 `No file uploaded` when `req.file` is missing (server.js:3493-3495). This runs after the permission check, like the `/upload` equivalent.
2. /drop for a non-admin vendor returns 404 `User not found` when the users lookup is empty (server.js:3893-3896), after the vendor-row check.
3. The tab effect at FileUpload.jsx:262-263 also sets `activeTab='drop-file'` for vendor users, not only for `/drop`. The notes cover only `/drop`. This is harmless, because vendors are redirected away.

## Imprecise citation (not wrong)
- DEAD 2 cites `FileUpload.jsx:58, :1481, :1504` for `setShowDropLocationModal(false)`. The setter calls are at :1495 and :1504. :1481 is the `{showDropLocationModal && ...}` read. The conclusion is unchanged: the setter is never called with `true`.
