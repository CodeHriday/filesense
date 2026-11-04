# ETL: ETL mapping definitions

Scope read: backend/routes/transformations.js (all 1333 lines), server.js:5958-6280 and the mount at server.js:5207-5208, middleware/authorizeProjectResource.js:55-135 (partial), and a grep of frontend call sites. Not read in full: the frontend pages/components, requireProjectAccess, and the service functions called (schemaService, schemaValidationService, filePatternMatcher, cloudStorageFileList, anomalyRulesEngine.validateRules). Their behaviour is noted only where the route depends on it.

## Summary
Two unrelated "mapping" systems share the name.
1. Transformation mappings (`transformation_mappings`), served by backend/routes/transformations.js and mounted at `/api/transformations` behind `authenticateToken` (server.js:5207-5208). Create/read/update/delete, run a mapping as a job, and validate file patterns or vendor schemas. Project-scoped and permission-checked on most routes.
2. Legacy `file_mappings` plus visual-mapping execution logs, inline in server.js:5959-6280 at `/api/mappings`. The CRUD part has no auth. The table is dropped and recreated on every server start (server.js:5988).

## Entry points

Mount: `app.use('/api/transformations', authenticateToken, transformationRoutes)` (server.js:5208). Every route below therefore requires a valid token. I did not verify that `authenticateToken` populates `req.user`.

### 1. GET /api/transformations (transformations.js:52)
- Auth: token only. No `authorizeProjectResource`. Non-admins are filtered to their projects (`getUserProjects(req.user.id)`, :62). Admin check is `userHasAdminAccess(req.user)` (:58).
- Inputs (query): `status`, `limit` default 100, `offset` default 0 (:54). No validation. They are passed straight to SQL parameters (:109).
- Rules: temporary mappings are excluded with `is_temporary IS NULL OR false` (:93). A non-admin with no projects gets `{mappings:[],total:0,limit,offset}` (:67-72). That is a different shape from the normal response. Ordered by `created_at DESC` (:108).
- Output: a bare array of rows (`res.json(result.rows)`, :136). Each row has `tm.*` plus `source_connection_name`, `target_connection_name`, `project_name`, `sub_project_name`. Connection names join only `transform_connections`, comparing as TEXT (:84-85). Vendor/storage connections (UUID) therefore get a NULL name.
- Errors: 500 `Failed to list transformations` (:140).
- Side effect: none. A count query is built (:114-131) but never executed (see BUG).

### 2. GET /api/transformations/:id (transformations.js:148)
- Auth: `authorizeProjectResource` with `resourceType 'transformation'` and permission `transformation:read` (:149-152).
- Output: the row plus `quality_rule_ids`, read from `transformation_quality_rules` (:169-174). 404 `Transformation mapping not found` (:163).
- Note: this route is declared before `/init-data` and so captures it (see entry 11).

### 3. POST /api/transformations (transformations.js:188)
- Auth: `authorizeProjectResource` with `transformation:write`. The project ID comes from `body.project_id`, which is required; otherwise an Error is thrown (:192-198). The thrown error is handled inside the middleware, and I did not trace the resulting status code.
- Inputs and defaults (:204-230): `source_type='files'`, `file_path=''`, `target_file_format='csv'`, `field_mappings=[]`, `variables=[]`, `pii_columns=[]`, `anomaly_rules=null`, `schema_drift_handling='none'`, `status='draft'`, `violation_handling='log_continue'`, `rdm_lookup_enabled=false`. `file_name_pattern` and `source_file_pattern` are synonyms; the first one set wins (:232).
- Validation, in order, each returning 400:
  - Both `source_connection_id` and `vendor_agreement_id` given: rejected (:248).
  - Neither given: rejected (:255).
  - `mapping_name` or the pattern missing (:263).
  - A vendor agreement must satisfy `approval_status IN ('fully_approved','governance_approved') AND is_locked = TRUE` (:276-278). Its `vendor_connection_id` becomes the source connection; a missing one is rejected (:288).
  - UUID-format source connection is checked in `storage_connections` with `status='active'` (:307-310). Otherwise it is checked in `transform_connections` with `is_active = TRUE` (:319-321).
  - Target connection, if present, gets the same two-table check (:332-361).
  - `variables` go through `validateVariables` (:18-46): must be an array; name must match `/^[A-Za-z_]\w*$/`; names must be unique. A missing `sequence` is set to the array index, which mutates the input.
  - `anomaly_rules` go through `validateRules` (:376).
- Side effects: generates `mapping_id = MAP-${Date.now()}-${uuid.substring(0,8)}` (:386). Inserts into `transformation_mappings` (:392). When a vendor agreement is used, `source_connection_id` is stored as NULL (:390). The JSON fields are stringified. `source_owner` and `target_owner` default to null. Inserts `transformation_quality_rules` rows, with `ON CONFLICT DO NOTHING`. A failed insert is only logged and the request still succeeds (:414-428).
- Output: 201 with the inserted row. Errors: 500 `Failed to create transformation`.
- The request body is logged in full at info level (:202).

### 4. PUT /api/transformations/:id (transformations.js:449)
- Auth: `transformation:write` via `authorizeProjectResource`. No `getProjectId` is given. How the project is resolved for `:id` is not traced.
- Inputs: a partial update. Only the fields present are written (:620-789). The pattern is written to both `file_name_pattern` and `source_file_pattern` (:687-694).
- Rules:
  - Vendor and source exclusivity (:626-676):
    - If `vendor_agreement_id` is in the body, it is always written. If it is truthy, `source_connection_id` is set to NULL.
    - If only `source_connection_id` is in the body and it is truthy, `vendor_agreement_id` and `vendor_agreement_file_schema_id` are set to NULL.
  - The 400 for "both given" fires only when both are truthy (:490-496).
  - Vendor agreement approval check is the same as in create (:524-548).
  - Source and target connection existence checks match create, except that update checks them only when the value is truthy.
  - `variables` and `anomaly_rules` are validated as in create.
  - An empty update returns 400 `No fields to update` (:791).
  - `updated_at = CURRENT_TIMESTAMP`.
  - `quality_rule_ids` provided: delete all existing associations, then re-insert (:811-841). An insert failure is only logged. The delete and inserts are not in a transaction.
- Output: 200 with the updated row; 404 if no row matched (:806).
- `status` is a free value with no allowed-list check (:750).

### 5. DELETE /api/transformations/:id (transformations.js:857)
- Auth: `transformation:write` (:858-861). Hard delete: `DELETE FROM transformation_mappings WHERE mapping_id=$1` (:866). No check for running jobs or schedules. Whether child rows cascade is not shown here.
- Output: 200 `{message:'Transformation mapping deleted successfully'}`; 404 if not found.

### 6. POST /api/transformations/:id/execute (transformations.js:889)
- Auth: `transformation:execute`.
- Inputs (body): `runSchemaValidation=true`, `runProfilingChecks=true`, `dryRun=false` (:897-901). `userId = req.user?.id || 'system'` (:903).
- Rules:
  - 404 if the mapping is not found. The query uses an INNER JOIN to `projects`, so a mapping with a missing project also returns 404 (:906-918).
  - 403 `PROJECT_INACTIVE` if `projects.is_active === false` (:923).
  - 403 `SUBPROJECT_INACTIVE` if the sub-project exists and is inactive (:932).
  - 403 `PARENT_PROJECT_INACTIVE` if the parent project is inactive (:941-953).
  - Nothing here checks the mapping's own `status` (draft or otherwise), so a draft mapping can run.
- Side effects:
  - `createJob(pool, id, userId)` (:966). `logJobExecution` writes "Job queued for execution" with the ledger context: user email, role, IP, and `sessionID` or the `x-session-id` header (:956-986).
  - `executeTransformationJob` is called in `setImmediate` in the background (:990-1033). On failure the job is set to `status:'failed'` with `error_message` and `end_time`, and an error log is written.
- Output: 202 `{message:'Job execution started', jobId, mappingId, status:'running'}` (:1036).
- Errors: 500 `{error, details: error.stack}` (:1045-1048). This leaks the stack trace to the client (SECURITY).

### 7. POST /api/transformations/validate-pattern (transformations.js:1056)
- Auth: token only. No project check on the connection used.
- Inputs: `source_file_pattern` and `source_connection_id`, both required (400 each).
- Calls `listAndFilterFiles(pool, connectionId, pattern)` (:1071).
- Output: `{valid:true, matchCount, message, samples}`. `samples` has the first 10 (:1095). `rowCount` is always null (:1076). `valid` is always true, even with 0 matches (:1083-1089). A listing failure returns 500 with the cloud error message.

### 8. POST /api/transformations/extract-schema (transformations.js:1114)
- Auth: token only. Inputs: `source_connection_id`, `file_path=''`, `file_name_pattern` or `file_pattern`; 400 if the connection or pattern is missing.
- It strips one leading and one trailing slash from `file_path` and joins `path/pattern` (:1131-1137). Calls `extractSchemaFromCloud` (:1139).
- Output: `{schema, message:'Extracted schema with N fields'}`. Errors: 500 with `error.message`, which echoes internal error text.

### 9. POST /api/transformations/validate-vendor-schema (transformations.js:1156)
- Auth: token only. Required inputs: `vendor_agreement_id`, `source_connection_id`, `file_name_pattern`; `file_path=''` and `vendor_agreement_file_schema_id` are optional.
- Calls `validateFileSchema(agreementId, connectionId, normalizedPath || '/', pattern, schemaId || null)` (:1176).
- Output: the service result. On error it returns 500 `{valid:false, schemaDrift:false, message, actualSchema:[], expectedSchema:[]}` (:1188-1194).
- No check that the caller can access the agreement (SECURITY).

### 10. POST /api/transformations/:id/validate-pattern (transformations.js:1202)
- Auth: token only. `:id` is read but never used.
- Inputs: `filePattern` (required) and `connectionId` (optional, not validated). Uses `findMatchingFiles(pool, pattern, {connectionId, limit:10})`. This looks up registered file records, not cloud listings, unlike entry 7.
- Output: with 0 matches, `{valid:true, matchCount:0, ...}`. Otherwise `valid = schemaValidation.isConsistent`, with the first 5 samples and `inconsistencies` (:1230-1241). 500 on error.

### 11. GET /api/transformations/init-data (transformations.js:1255)
- Auth: token only. Intended to return the mappings, groups and projects visible to the user, filtered by project membership for non-admins.
- BUG (shadowing): `GET /:id` is registered at :148 with no guard, so `/init-data` matches it first. Express runs the `authorizeProjectResource` middleware and the `/:id` handler with `id='init-data'`, which very likely returns 404 or a permission error. I did not run this. The frontend calls it at Mappings.jsx:55 and WorkflowForm.jsx:40.
- Response shape inconsistency in this handler: the empty case returns `mappingGroups` (:1271), the normal case returns `groups` (:1319).
- Mappings in init-data do not exclude `is_temporary` rows (:1279-1288), unlike the list endpoint.

### 12. GET /api/mappings (server.js:5959)
- Auth: none. Legacy.
- Runs `CREATE TABLE IF NOT EXISTS file_mappings` on each request (:5962). `SELECT * FROM file_mappings` returns every row, with no limit (:5976). 500 `Failed to fetch mappings`.

### 13. POST /api/mappings (server.js:6083)
- Auth: none. Required: `mapping_name`, `source_file_id` (400 otherwise). `target_file_type` defaults to `'csv'`. `mapping_config` defaults to `{}`. `mapping_rules` is always stored as `{}` (:6113). Returns 201 with the row.

### 14. PUT /api/mappings/:id (server.js:6126)
- Auth: none. Requires the same two fields. It overwrites `mapping_rules` with `{}` and rewrites all fields; omitted `target_file_type` is reset to `'csv'`. 404 if not found.

### 15. DELETE /api/mappings/:id (server.js:6176)
- Auth: none. Hard delete. 404 if not found. Returns `{message, id}`.

### 16. GET /api/mappings/:mappingId/execution-logs (server.js:6194)
- Auth: `authenticateToken` only, with no ownership or project check. Any logged-in user can read any mapping's logs.
- Returns the last 10 runs by `started_at DESC` from `visual_mapping_execution_logs`. Shape is `{runs:[{id:run_id, name, startedAt ISO, status, logs}]}`. DB status `'completed'` is mapped to `'success'` (:6213).
- The query uses `mappingId` as a raw string, while the POST parses it as an integer.

### 17. POST /api/mappings/:mappingId/execution-logs (server.js:6225)
- Auth: `authenticateToken` only. Required: `runId`, `runName`. `mappingId` must parse as an integer (400 `Invalid mapping ID`, :6236).
- Upsert by `(mapping_id, run_id)`, using select then insert or update (not atomic).
  - Update: sets `run_name`, `status` (default `'completed'`) and `logs`. It does not update `started_at`.
  - Insert: `started_at` is `startedAt` or now, and status defaults to `'running'` (:6259).
  - After an insert, it deletes all but the 10 newest runs for that mapping (:6263-6272).
- Output: `{success:true, message:'Execution log saved'}`.
- These endpoints are called from src/hooks/useVisualMappingExecution.js:317, :347, :516.

### Frontend (listed in inventory; only call sites checked)
- /mappings (Mappings.jsx): calls init-data (:55), list (:73), delete (:104), execute (:125).
- /mappings/create and /mappings/edit/:mappingId (MappingWizard.jsx): get (:478), extract-schema (:613), validate-vendor-schema (:650), PUT or POST (:842, :851), execute (:896).
- /transformations, /transformations/:id, /transform (Transform.jsx, Transformations.jsx:699, :744, :751). The page files were not read.

## Data touched
- `transformation_mappings`: read, insert, update, delete (columns as in the insert at transformations.js:392-399).
- `transformation_quality_rules` (mapping_id, quality_rule_id): insert, delete.
- `transform_connections`, `storage_connections`, `vendor_agreements`, `projects`, `mapping_groups`: read.
- `file_mappings`: dropped and recreated at startup (server.js:5988); CRUD.
- `visual_mapping_execution_logs`: read, insert, update, delete.
- Via the execute route: job tables, through createJob, updateJob and logJobExecution (not traced).

## Flags

### BUG
- B1. GET `/init-data` is shadowed by GET `/:id` (:148 vs :1255). The route is unreachable as intended (inventory already notes this).
- B2. `initFileMappingsTable()` runs `DROP TABLE IF EXISTS file_mappings` on every server start (server.js:5988, called at :6076). All legacy mappings are lost on each restart.
- B3. The list handler builds `countQuery` and `countParams` but never runs them, so `total` is not returned (:114-131). The comment at :134 describes the choice. Dead code.
- B4. PUT /api/mappings always writes `mapping_rules = {}` (server.js:6158), and POST does the same (:6113), so the column is never populated.
- B5. init-data returns `mappingGroups` in the empty case and `groups` otherwise (:1271 vs :1319).
- B6. The update path skips source and target connection checks when the value is falsy. Sending `source_connection_id: ''` or null on a mapping with no vendor agreement can leave neither source nor vendor set. Only the create path enforces "exactly one" (:255).
- B7. Two different table-existence handling styles: GET /api/mappings creates the table with a different schema from the init function (VARCHAR(100) vs 255, NOT NULL `mapping_rules`, :5963-5973 vs :5992-6002). Whichever runs first wins; after the drop, the init version wins.

### SECURITY
- S1. `/api/mappings` GET, POST, PUT and DELETE have no authentication (server.js:5959, :6083, :6126, :6176). Unless some earlier global middleware applies, which I did not find in the greps, anyone can read, change or delete them. GET also creates a table.
- S2. GET list `/api/transformations` has no `authorizeProjectResource` and no permission check (:52); only the project filter applies. Any authenticated user with project membership can list.
- S3. validate-pattern, extract-schema, validate-vendor-schema and `/:id/validate-pattern` have no project, permission or connection-ownership check (:1056, :1114, :1156, :1202). Any authenticated user can list a cloud connection's files, extract schemas, or probe vendor agreements by ID.
- S4. execute returns `error.stack` in the 500 body (:1047).
- S5. execution-logs GET and POST have no ownership or project check (server.js:6194, :6225).
- S6. POST create logs the whole request body (:202), which may contain config such as rdm config or schemas.
- S7. extract-schema and validate-vendor-schema return raw `error.message` (:1148, :1191).

### DUPLICATE
- D1. Two mapping systems: `transformation_mappings` (`/api/transformations`) and `file_mappings` (`/api/mappings`). Different columns and different auth. ProcessManagementWizard.jsx:200-204 reads both.
- D2. Three pattern-validation implementations. Entry 7 lists cloud storage (`listAndFilterFiles`, `valid` always true). Entry 10 queries registered file records and checks schema consistency (`valid` = consistency). Entry 9 validates against the vendor schema.
- D3. The connection existence check (UUID regex vs integer) is copy-pasted four times, and in create the regex constant is declared twice (:302 and :334, :553, :586). Update differs from create by skipping falsy values.
- D4. Two pattern columns, `file_name_pattern` and `source_file_pattern`, are always written with the same value (:403, :687-693).
- D5. The legacy mapping-group and other list endpoints in other areas also return mappings; not checked.

### DEAD
- DEAD1. `getMappingRules`, `saveMappingRules`, `getJobStatus`, `cancelJob`, `countMatchingFiles` are imported (:6-8) but are not used in the file (grep not run for each; I read the full file and saw no uses).
- DEAD2. The count query in the list handler (see B3).
- DEAD3. `initSchedulesTable` creates `job_schedules` (server.js:6011); that belongs to the JOB/SCHD areas, not ETL.

### UNCLEAR
- U1. `is_temporary` mappings, "created by visual mapping executions" (:92). The code that creates them is not in this area.
- U2. In POST create, `req.body.project_id` is required. Whether the sub-project must belong to the project is not checked.
- U3. Which of `status` values are valid ('draft' is the default). Nothing validates the value, and execute does not check it.
- U4. The `/:id/validate-pattern` route ignores `:id`.

## Domain terms
- Transformation mapping = mapping = ETL mapping = `transformation_mappings`. Identifier `mapping_id` of the form `MAP-<ms>-<8 hex>`, exposed as `id` in init-data.
- Visual mapping = the UI-driven mapping, with execution logs by "run". Temporary mapping = a mapping with `is_temporary`.
- file_name_pattern = source_file_pattern = `file_pattern` = `filePattern`.
- Source connection (`transform_connections`, integer ID) vs vendor/storage connection (`storage_connections`, UUID, status 'active'); vendor agreement (approved and locked) as the alternative source.
- Variables, PII columns, anomaly rules, schema drift handling (default 'none'), violation handling (default 'log_continue'), RDM lookup, dataset config and crosswalk config.
- Job = a run of a mapping (`createJob`). Run = visual-mapping execution log entry; DB status 'completed' is shown as 'success'.

## Open questions
1. Does GET /api/transformations/init-data really fall into `/:id`? What status does it return in production? (Not run.)
2. What does `authenticateToken` do, and is there any global middleware protecting `/api/mappings` CRUD (S1)?
3. How does `requireProjectAccess` resolve the project for `transformation` and `:id` (PUT, DELETE, execute, GET)? And which status results when POST has no `project_id`?
4. Does deleting a mapping cascade to jobs, schedules, groups and quality-rule rows?
5. Are the `/api/mappings` (file_mappings) endpoints used by anything besides ProcessManagementWizard.jsx:200? Is losing data at each restart (B2) known?
6. Is draft or inactive mapping `status` meant to block execution?
7. Which permission strings do roles actually receive (`transformation:read`, `:write`, `:execute`)? Not traced.
8. What do `validateRules`, `findMatchingFiles` and `validateSchemaConsistency` enforce? Not read.
9. Frontend wizard and Transform page behaviour (validation, wizard steps, ColumnMapper, TableBasedMapper) was not read.
