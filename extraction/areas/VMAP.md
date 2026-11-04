# VMAP - Visual mapping canvas

## Summary
Users draw a node/edge graph (sourceConfig, expression, join, rdmLookup, rdmDataset, rdmCrosswalk, targetRules). The graph is stored as JSON in `visual_mapping_defs`. On execute, the backend compiles the graph into a temporary `transformation_mappings` row and runs it through `executeTransformationJob`. Progress is pushed over Socket.IO. All HTTP routes in `backend/routes/visualMappings.js` are mounted at `/api/visual-mappings` behind `authenticateToken` (server.js:5346). Only create, update, delete, clone and execute have an `authorize()` check. Most read, validate, log and preview routes have no role or project check. Two further routes, GET and POST `/api/mappings/:mappingId/execution-logs`, are defined directly in server.js (:6194, :6225) and belong to this area. None of the VMAP routes use the `requireProjectAccess` middleware; they only call `getUserProjects` (visualMappings.js:586-587).

## Entry points
Common: authenticated user is required for all routes (server.js:5346). "authorize" = `authorize('visual_mapping_orchestrator:<action>')`. For every `:id` route, `visual_mapping_defs.id` is an integer column (database_ddl_2026-01-07.sql:2636) and `:id` is passed to Postgres without parsing, so a non-numeric id gives a 500 rather than a 404 on all 10 `:id` routes (GET/:id, PUT, DELETE, clone, execute, execution-status, running-execution, validate, executions, logs).

### GET /api/visual-mappings (visualMappings.js:30)
- Auth: login only. Query: `project_id`, `sub_project_id`, `is_active` (default `true`).
- Rules: non-admin (`userHasAdminAccess`) with at least one project is filtered to `vm.project_id = ANY(projectIds)` (:61-65). Non-admin with ZERO accessible projects gets no filter and sees every mapping (:61, BUG, see Flags). `is_active` is applied as `is_active === 'true' || is_active === true` (:81), so the boolean default `true` and the string `'true'` both give true; anything else gives false. Ordered by `updated_at DESC`. Parses string JSON `graph_data` and `canvas_state`.
- Output: array of mappings with `project_name`, `sub_project_name` and `created_by_username`. 500 `{error}` on failure.
- Other consumers: `AssetPalette.jsx:20` and `archived/WorkflowBuilder.jsx:768` (besides VisualMappingManager.jsx:92).

### GET /api/visual-mappings/:id (:114)
- Auth: login only. Only `is_active = true` rows (:128), else 404.
- Access check only when `mapping.project_id` is set: the user must have the project or be admin, else 403 (:144-152). Mappings with no project are readable by anyone. Execute is stricter for the same mapping: a non-admin gets 403 on execute for a mapping with null `project_id` (see execute step 11).
- Output: the full row (`vm.*`) plus names.

### POST /api/visual-mappings (:169)
- Auth: authorize write. Body: `name`, `description`, `graph_data` {nodes[], edges[]}, `canvas_state`, `project_id`, `sub_project_id`.
- Validation: `name` and `graph_data` are required, and `nodes` and `edges` must be arrays (400). No check that the user can access `project_id`.
- Rules: `emailNotification` nodes and the edges touching them are stripped (:10-24, :184). `description` defaults to `''`. `canvas_state` defaults to `{zoom:1, position:[0,0]}`. `notification_settings` is always `null`.
- Output: 201 with the row.
- Error: a non-existent `project_id` violates `visual_mapping_defs_project_id_fkey` (prod dump FileSence_prod_schema_Jan_05_*.sql:7932, ON DELETE CASCADE from projects), so POST returns 500 (inferred from the FK, not run). The same applies to PUT.

### PUT /api/visual-mappings/:id (:223)
- Auth: authorize write. Same validation and stripping as POST.
- Writes to an active row only (`is_active = true`, :245). 404 if not found. Sets `updated_at = CURRENT_TIMESTAMP` and resets `notification_settings` to `null`. No ownership or project check; any `project_id` in the body is accepted unchecked.

### DELETE /api/visual-mappings/:id (:285)
- Auth: authorize write. Soft delete: `is_active = false` (:290). There is no `is_active` filter, so deleting an already-deleted row returns 200. 404 if the id does not exist. No project check.

### POST /api/visual-mappings/:id/clone (:320)
- Auth: authorize write. Body `name` is optional; the default is `(Copy) <original name>` (:400).
- Rules: new node ids are `${type}-${Date.now()}-${index}` (:349). Old ids are replaced by regex over the whole serialized graph, longest id first (:354-367). Edge ids become `reactflow__edge-<ts>-<src>__<handle>--<tgt>__<handle>`, with handles defaulting to `output` and `input` (:387-390). `execution_count` is 0 and `is_active` is true. The project and sub-project are copied. Email nodes are stripped.
- Output: 201 `{success, mapping, message}`. No project access check on the source mapping.

### POST /api/visual-mappings/:id/execute (:454)
- Auth: authorize execute. Body `execution_id` is optional (client-supplied, else uuid v4, :553).
- Order of checks:
  1. Mapping must be active (404).
  2. 403 `PROJECT_INACTIVE` if the project is inactive (:479).
  3. 403 `SUBPROJECT_INACTIVE` (:488).
  4. 403 `PARENT_PROJECT_INACTIVE` (:497-509).
  5. Email nodes are stripped.
  6. Compile; failure returns 400 `{error:'Visual mapping validation failed', errors[]}`.
  7. 409 if a `visual_mapping_executions` row with status `running` exists for the mapping (:537-550). The check and the insert are not atomic.
  8. Insert an executions row `running`, with `triggered_by` set to the user. `visual_mapping_executions.execution_id` has a unique index (database_ddl_2026-01-07.sql:4876), so a client-supplied `execution_id` that was used before passes the 409 check (which looks only at `running` rows for this mapping) and then fails the insert with a 500.
  9. Insert a `visual_mapping_execution_logs` row with `run_id = vmrun-<Date.now()>`. This insert never prunes old rows.
  10. Update `last_executed_at` and `execution_count + 1` on the def.
  11. Project access check (:586-592), returning 403 'You do not have permission...'. The test is `userProjects.some(p => p.id === mapping.project_id) || userHasAdminAccess(req.user)` (:588). For a mapping whose `project_id` is null, no project id equals null, so a non-admin always gets 403 here.
  12. Respond `{message, execution_id, run_id, mapping_id, mapping_name, status:'running', async:true}`.
- Background (`setImmediate`, :606): inserts a temporary `transformation_mappings` row (`mapping_id = vm-<id>-<ts>`, name `[VM] ...`, `is_visual_mapping`/`is_temporary` true).
  - Defaults: `source_file_pattern` `'*'`, `target_file_format` `'csv'`. The route also has `|| {}` for variables (:660), `|| 'warn'` for `schema_drift_handling` (:665) and `|| 'continue'` for `violation_handling` (:666), but these never apply because the compiler always supplies truthy values (see Flags, DUPLICATE).
  - A vendor agreement takes precedence: when `vendor_agreement_id` is set, `source_connection_id` is stored as null (:612-613).
  - `rdm_lookup_enabled` is true if there is any RDM config or any `rdmLookup` node.
  - DQ rules are upserted into `transformation_quality_rules`, with `error_action` defaulting to `'log_continue'` (:686).
  - Calls `executeTransformationJob(pool, tempId, userId, {visualMappingExecutionId, nodes, edges, nodeExecutionMap, executionOrder, skipInternalCleanup:true, audit context})`.
  - Final status is `jobResult.status || 'completed'`, and `failed` marks the error (:716-717).
  - Updates the executions row (`job_id`, `status`, `transformation_id = transformationDbId`, `rows_processed = rowsWritten || 0`, :720-725) and the logs row (3 fixed entries, :728-740), then deletes the temp mapping (:743-746). The delete happens on every normal return, including a `failed` result.
  - FK on that delete, per schema source: `visual_mapping_executions.transformation_id` references `transformation_mappings(id)`. In both `attached_assets/FileSence_prod_schema_Jan_05_*.sql` dumps (:7948) it is `ON DELETE SET NULL`, so the delete succeeds and `transformation_id` becomes null. In `database_ddl_2026-01-07.sql:3585` and `attached_assets/database_ddl_1767770486833.sql:3902` the constraint has no `ON DELETE` clause printed. Those two files omit `ON DELETE` and are not evidence of the live behaviour. The prod dump is the best evidence available.
  - On an exception: status `failed` is set on both tables and the temp row is deleted.
- Errors: 500 `Failed to execute visual mapping`.

### GET /api/visual-mappings/:id/execution-status/:executionId (:805)
- Auth: login only, no project check. Reads `visual_mapping_execution_logs` first, then falls back to `visual_mapping_executions`. Returns `{executionId, runId, runName, startedAt, status, logs, isComplete: status !== 'running'}`, or the second shape. 404 if neither has it.

### GET /api/visual-mappings/:id/running-execution (:866)
- Auth: login only. Latest `running` row in the execution logs table. Returns `{hasRunningExecution:true, executionId, runId, runName, startedAt, logs}` or `{hasRunningExecution:false}`.

### POST /api/visual-mappings/:id/validate (:907)
- Auth: login only (no `authorize`). Compiles the active mapping. Always returns 200 `{valid:true, message, executionOrder}` or `{valid:false, errors}`. 404 if missing. Does NOT strip email nodes, unlike execute. `emailNotification` nodes are exempt from the orphan check (compiler :162). No caller exists in `src` (see Flags, DEAD).

### GET /api/visual-mappings/:id/executions (:957)
- Auth: login only. Query `limit` (default 10) and `offset` (default 0) are passed straight to SQL as parameters. Returns `visual_mapping_executions.*` plus `triggered_by_username`, ordered by `created_at DESC`.

### POST /api/visual-mappings/executions/:executionId/logs (:989)
- Auth: login only. Body `logs` must be an array (400). Overwrites `visual_mapping_executions.logs` for that `execution_id`. 404 if not found. No check of the mapping or the user. Returns `{success, logCount}`. No caller exists in `src` (see Flags, DEAD).

### GET /api/visual-mappings/:id/logs (:1030)
- Auth: login only. Last 10 rows of `visual_mapping_executions` (`LIMIT 10` hard coded) with `execution_id`, `status`, `created_at`, `completed_at`, `logs`, `rows_processed`, `error_message`. No caller exists in `src` (see Flags, DEAD).

### POST /api/visual-mappings/source-preview (:1133)
- Auth: login only. Body: `connectionId` (required), `filePattern` (required), `filePath`, `limit` (default 25), `vendorAgreementId`, `schema`.
- Flow:
  1. Loads `storage_connections` by `connection_id` (404 if missing). No project or ownership check.
  2. Builds the pattern as `filePath` (leading and trailing `/` stripped) plus `/` plus `filePattern`.
  3. `listAndFilterFiles` finds the files. If none match, returns 200 `{success:false, error:'No files found...', data:[], columns:[]}`.
  4. Takes the FIRST matching file and downloads it in full.
  5. For `.dat` / `.fixed_width` with a schema containing `width` or `column_width`, uses `parseFixedWidthWithSchema`: skips line 1 if it contains the first column name (case-insensitive), then trims each field.
  6. Otherwise uses `parseFileToRows`, passing `vendorAgreementId` for the archive password lookup.
  7. Slices the first `limit` rows. BigInt values become strings.
- Output: `{success, filename, totalRows, previewRowCount, columns, data}`. 500 error text includes `error.message`.
- Caller: SourceConfigModal.jsx:393.

### GET /api/mappings/:mappingId/execution-logs (server.js:6194)
- Auth: `authenticateToken` only. No `authorize`, no project check, no check that the mapping exists or is active.
- Input: `:mappingId` is passed unparsed as `$1` against an integer column (`mapping_id INTEGER NOT NULL`, database_ddl_2026-01-07.sql:2664), so a non-numeric id raises a Postgres error and the route returns 500 `{error:'Failed to fetch execution logs'}` (:6218-6221).
- Rules: selects from `visual_mapping_execution_logs` where `mapping_id = $1`, `ORDER BY started_at DESC LIMIT 10` (:6199-6205). Status `completed` is mapped to `success`, other statuses pass through (:6213). `startedAt` is an ISO string or `''`; `logs` defaults to `[]`.
- Output: `{runs:[{id: run_id, name: run_name, startedAt, status, logs}]}`.
- Caller: useVisualMappingExecution.js:317 (and :516 per verifier).

### POST /api/mappings/:mappingId/execution-logs (server.js:6225)
- Auth: `authenticateToken` only. No `authorize`, no project check, no check that the mapping exists in the route code. A non-existent mapping id violates the FK `visual_mapping_execution_logs_mapping_id_fkey` (prod dump FileSence_prod_schema_Jan_05_*.sql:7942, ON DELETE CASCADE), so the insert fails and the route returns 500 (inferred from the FK, not run).
- Body: `runId` and `runName` required, else 400 (:6230-6232). `startedAt`, `status`, `logs` optional. `parseInt(mappingId, 10)` NaN gives 400 `Invalid mapping ID` (:6235-6238).
- Rules: upsert by (`mapping_id`, `run_id`). If a row exists it updates `run_name`, `status` (default `'completed'`) and `logs`, but not `started_at` (:6246-6253). Otherwise it inserts with `status` default `'running'` and `started_at` default now (:6256-6260), then deletes all rows for that mapping that are not in the 10 most recent by `started_at` (:6263-6272). This pruning runs only on this insert path. The execute route's own insert of a `vmrun-` row (visualMappings.js, step 9) never prunes, so the table can exceed 10 rows per mapping until a client insert occurs.
- Output: `{success:true, message:'Execution log saved'}`; 500 `Failed to save execution log` on error.
- Caller: useVisualMappingExecution.js:347 (and :516 per verifier). Whether the FE-saved `runId` differs from the backend `vmrun-` id for the same execution (giving two rows per run) was not traced; see Open questions.

### Socket.IO events (visualMappingWebSocket.js, init at server.js:14172)
- `connection` (:11), `subscribe_execution(executionId)` (:16), `unsubscribe_execution` (:24), `disconnect` (:32). The room is `execution:<id>`.
- No socket authentication, no check that the user may view the execution. Any client can join any room.
- Server to client emits: `node_status`, `edge_row_count`, `execution_progress`, `execution_complete`, `execution_error` (includes `error.stack`, :113-116), `execution_log` (level upper-cased), `execution_start` (resets edges and emits `rowCount:0` per edge, :145-166).
- Emit sites in `jobExecutionEngine.js` (imported at visualMappingWebSocket consumer :22), all guarded by a `visualExecutionId`: `emitExecutionProgress(…, 0)` and the first `emitExecutionLog` at :1212-1213; `emitExecutionStart` at :1258; `emitNodeStatus` wrappers `pending` (:1264), `running` phases (:1312, :1364, :1823, :1935-1943), `completed` (:1484, :1906, :2076-2088) and `failed` (:1344, :1404, :1630, :1733, :1840, :1919, :2176-2185); `emitEdgeRowCount` at :1913, :2069, :2144, :2257; `emitExecutionProgress(…, 100)` then `emitExecutionComplete({filesProcessed, rowsRead, rowsWritten, rowsFailed})` at :2262-2268, on the normal-return path; in the catch block, `emitNodeStatus(... 'failed')` for each source/expression/join/rdmLookup/targetRules node (:2424-2433) then `emitExecutionError(visualExecutionId, error)` (:2435). The normal path can return `completed_with_warnings` (see Flags, BUG). Whether `execution_complete` is emitted on the early engine `failed` return (no files found, :1471) was not traced.
- The Socket.IO CORS origin function allows no-Origin requests (server.js:14151).

### Frontend (not traced in depth)
- Other consumers of GET `/api/visual-mappings`: `AssetPalette.jsx:20` and `archived/WorkflowBuilder.jsx:768` (besides VisualMappingManager.jsx:92).
- `/visual-mappings/new` and `/:mappingId` -> `VisualMappingCanvas.jsx`. Uses GET/PUT/POST/execute (:616, :1210, :1214, :1253). Routes at App.jsx:432-434.
- `/visual-mappings/manage` -> `VisualMappingManager.jsx`. List, delete (single and bulk), clone, execute (single and bulk), executions (:92-229).
- Hook `useVisualMappingExecution.js`:
  - `io(window.location.origin, {path:'/socket.io', reconnectionDelay:1000, reconnectionAttempts:5})` (:20-26).
  - A `setTimeout` of 5000 ms in the subscribe flow (:184-187) is a connection timeout, not polling.
  - Also calls `running-execution` (:402) and `execution-status` (:448). The conditions and intervals for these calls were not traced.
- Compiler rules (visualMappingCompiler.js):
  - Needs at least one `sourceConfig` (:144) and one `targetRules` (:149).
  - Exactly 1 input for expression, rdmLookup, rdmDataset, rdmCrosswalk and targetRules (:182-188).
  - Join needs exactly 2 inputs (:191-199). Source nodes must have 0 inputs (:202).
  - Orphan check exempts sourceConfig, emailNotification and jiraTicket (:162).
  - Required config: source `connectionId`, `filePath`, `filePattern`; target `connectionId`, `filePath`, `fileName`; join `joinType`, `joinKeys`; RDM-specific fields (:243-302).
  - Cycle detection via Kahn's algorithm (:518).
  - Compiler defaults: `schema_drift_handling` `'none'`, `violation_handling` `'log_continue'` (:88-89), `target_file_format` `'csv'`, `variables` `[]` (:81).

## Data touched
- `visual_mapping_defs` (R/W), `visual_mapping_executions` (R/W), `visual_mapping_execution_logs` (R/W). Definitions: database_ddl_2026-01-07.sql:2636-2690 (`execution_id` unique index on executions at :4876). Prod FKs (FileSence_prod_schema_Jan_05_*.sql): defs.project_id to projects ON DELETE CASCADE (:7932); execution_logs.mapping_id (:7942) and executions.mapping_id (:7947) to defs ON DELETE CASCADE.
- `transformation_mappings` (temp insert and delete), `transformation_quality_rules` (upsert).
- `projects`, `users`, `storage_connections` (read). Storage files (read, via the engine).
- `visual_mapping_nodes` and `visual_mapping_edges` are listed in the inventory. No code in this area reads or writes them.

## Flags
- SECURITY: no role check on GET list, GET by id, validate, executions, logs, `execution-status`, `running-execution`, POST execution logs and `source-preview` (visualMappings.js:30, :114, :805, :866, :907, :957, :989, :1030, :1133). Execution-scoped routes have no project check.
- SECURITY: GET and POST `/api/mappings/:mappingId/execution-logs` have only `authenticateToken`: any logged-in user can read or write the run logs of any mapping id (server.js:6194, :6225).
- SECURITY: `source-preview` downloads from any `connectionId` for any logged-in user (:1146-1193). It also logs `req.body`, including `schema` (:1236).
- SECURITY: POST `/executions/:executionId/logs` lets any user overwrite the logs of any execution (:999).
- SECURITY: PUT, DELETE and clone have no project or ownership check. POST and PUT accept an arbitrary `project_id` with no check at all (VMAP does not use `requireProjectAccess`).
- SECURITY: socket rooms are joinable by anyone without authentication (visualMappingWebSocket.js:16), so anyone who knows an execution id can receive its events. `execution_error` sends stack traces (:113-116).
- SECURITY: `limit` and `offset` on `/executions` are unvalidated (:960). They are parameterized, so there is no injection, but non-numeric values give a 500.
- BUG: the list route's admin-bypass condition `!isAdmin && projectIds.length > 0` means a non-admin user with no projects sees ALL mappings (:61).
- BUG: execute creates the executions row, log row and counter increment (:554-577) BEFORE the project permission check (:586-592). A 403 leaves a `running` execution that blocks later runs with 409, because nothing ever completes it. It also bumps `execution_count`.
- BUG: a non-admin gets 403 on execute for a mapping with null `project_id` (:588), yet can read it through GET `/:id` (:144). The 403 also happens after the DB writes above, so it leaves a stuck `running` row.
- BUG: a reused client-supplied `execution_id` gives a 500 at the executions insert (unique index, database_ddl_2026-01-07.sql:4876) after the 409 check passed.
- BUG: the "already running" check and the insert are not atomic (:537-558). There is also no timeout or stale-run recovery for a `running` row (a crash during background execution leaves it forever, apart from the catch block).
- BUG: the catch block (:754-787) runs queries without its own try/catch. A failure there is an unhandled rejection inside `setImmediate`. Only the final temp-row delete has `.catch` (:785).
- BUG: the success path writes fixed, hard-coded final logs and overwrites the initial log (:728-740). Logs saved through the POST logs route go to a different table (`visual_mapping_executions.logs`), while `execution-status` reads `visual_mapping_execution_logs`.
- BUG (inferred from the CHECK, not run): the engine returns `status: 'completed_with_warnings'` when `hasWarnViolations` (jobExecutionEngine.js:2199, in the success return at :2322-2329). Execute writes `jobResult.status` to `visual_mapping_executions.status` (visualMappings.js:716-724). The prod CHECK `visual_mapping_executions_status_check` allows only pending, running, completed, failed, cancelled (FileSence_prod_schema_Jan_05_*.sql:7109). The UPDATE should therefore violate the check; the catch block then marks the run `failed` and deletes the temp row, while `execution_complete` was already emitted (jobExecutionEngine.js:2263). The UI shows success but the DB says `failed`. The database_ddl dumps print no CHECK clauses, so this rests on the prod dump.
- UNCLEAR (schema-dependent): the temp `transformation_mappings` delete (:743-746) follows storing `transformation_id` in `visual_mapping_executions` (:722-724). With `ON DELETE SET NULL` (prod dumps, :7948) the delete is harmless and the column ends up null. If the live FK were the plain constraint printed in database_ddl_2026-01-07.sql:3585 (no ON DELETE shown, and that dump omits ON DELETE clauses), the delete would raise an error, the catch block would mark the finished run `failed`, and its own delete is swallowed (:785), leaving the temp row. Which schema is live was not established; the prod dump is the best evidence.
- BUG: delete returns 200 for already-inactive rows (:289-298). The clone's regex id replacement can corrupt label or text values that contain an old node id (:354-367).
- BUG: every `:id` route gives 500 for a non-numeric id (integer column, Postgres cast fails) instead of 404/400. The POST `/api/mappings/:mappingId/execution-logs` route is the exception and returns 400 (server.js:6235-6238).
- DUPLICATE: two execution-log stores (`visual_mapping_execution_logs` and `visual_mapping_executions.logs`) with different readers. `/logs` and `/executions` both list `visual_mapping_executions`. Email-node stripping is implemented in the route only, not in the compiler. The compiler also carries `emailNotification` and `jiraTicket` exemptions (:162).
- DUPLICATE: execution-run logging exists in two writers for `visual_mapping_execution_logs`: the backend execute route (`vmrun-` rows, visualMappings.js:562) and the FE-driven POST `/api/mappings/:mappingId/execution-logs`. Whether they produce two rows per run was not traced.
- DEAD: the route's fallback defaults for the temp mapping are never used. The compiler always emits `schema_drift_handling` `'none'` (:88), `violation_handling` `'log_continue'` (:89) and `variables` `[]` (:81), all truthy, so the route's `|| 'warn'` (:665), `|| 'continue'` (:666) and `|| {}` (:660) never fire. The stored values are the compiler's.
- DEAD: `visual_mapping_nodes` and `visual_mapping_edges` have no code in this area. `notification_settings` is always written as `null`. The compiler's `emailNotification` and `jiraTicket` branches are unreachable on the execute path because email nodes are stripped (jiraTicket nodes are not stripped anywhere in the route).
- DEAD (from the FE): no caller in `src` for POST `/:id/validate`, GET `/:id/logs` or POST `/executions/:executionId/logs`. Only source-preview (SourceConfigModal.jsx:393), execute, executions, running-execution, execution-status and the `/api/mappings/:mappingId/execution-logs` pair are called. Other clients were not searched.

## Domain terms
Visual mapping (visual_mapping_defs), graph_data, canvas_state, node types (sourceConfig = "Source Config", targetRules = "Target Rules", expression, join, rdmLookup/rdmDataset/rdmCrosswalk), execution (`execution_id`) vs run (`run_id` `vmrun-...`) vs job (`job_id`), temporary transformation mapping (`is_visual_mapping`, `is_temporary`, `[VM]` prefix), vendor agreement vs source connection (mutually exclusive), DQ / quality rules (`log_continue` / `log_warn` / `log_abort`), RDM (reference data management), Visual Workflows (owner of email nodes), source preview, execution logs (run history, `visual_mapping_execution_logs`).

## Answered from code
- `userHasAdminAccess` (permissionHelpers.js:80-92): true for an admin role (`hasAdminRole`), OR any user holding `users:write`, `roles:write` or `project_management:write`. It is broader than "admin role".
- `authorize` (authorize.js:17-53): 401 if no `req.user`; if `userHasAdminAccess` it calls `next()` without checking the listed permissions (:31-34); otherwise every listed permission string (`resource:action`, objects converted at :40-42) must be in `req.user.permissions` (`every`, :44-46), else it falls through to the failure branch (:55+).
- Engine emit sites: see the Socket.IO section.

## Open questions
1. (Closed: the engine returns `completed` or `completed_with_warnings` (jobExecutionEngine.js:2199), or `failed`; the prod CHECK rejects `completed_with_warnings`, see Flags, BUG.) Still not traced: whether `execution_complete` is emitted when the result is `failed` without an exception.
2. Is `visual_mapping_orchestrator:*` granted to the roles that should use the write routes? Role-to-permission data was not read.
3. Why does execute check project access last? It may be intended or accidental.
4. Do the FE-saved `runId` rows (POST `/api/mappings/:mappingId/execution-logs`, useVisualMappingExecution.js:347/:516) and the backend `vmrun-` row (visualMappings.js:562) make two rows for the same execution? Not traced.
5. Which schema is live for the `visual_mapping_executions.transformation_id` FK (see Flags, UNCLEAR)?
6. What does `propagateSchemas` and `compileNodes` (compiler :311-900) do per node type (schema rules, PII, anomaly, quality columns)? Not read.
7. Is `jiraTicket` a node type that exists anywhere in the UI?
8. What are the polling conditions for `running-execution` (useVisualMappingExecution.js:402) and `execution-status` (:448)? Not traced.
