# VMAP - Visual mapping canvas

## Summary
Users draw a node/edge graph (sourceConfig, expression, join, rdmLookup, rdmDataset, rdmCrosswalk, targetRules). The graph is stored as JSON in `visual_mapping_defs`. On execute, the backend compiles the graph into a temporary `transformation_mappings` row and runs it through `executeTransformationJob`. Progress is pushed over Socket.IO. All HTTP routes are mounted at `/api/visual-mappings` behind `authenticateToken` (server.js:5346). Only create, update, delete, clone and execute have an `authorize()` check. Most read, validate, log and preview routes have no role or project check.

## Entry points
Common: authenticated user is required for all routes (server.js:5346). "authorize" = `authorize('visual_mapping_orchestrator:<action>')`.

### GET /api/visual-mappings (visualMappings.js:30)
- Auth: login only. Query: `project_id`, `sub_project_id`, `is_active` (default `true`).
- Rules: non-admin (`userHasAdminAccess`) with at least one project is filtered to `vm.project_id = ANY(projectIds)` (:61-65). Non-admin with ZERO accessible projects gets no filter and sees every mapping (:61, BUG, see Flags). `is_active` is true only if the string is `'true'` (:81). Ordered by `updated_at DESC`. Parses string JSON `graph_data` and `canvas_state`.
- Output: array of mappings with `project_name`, `sub_project_name` and `created_by_username`. 500 `{error}` on failure.

### GET /api/visual-mappings/:id (:114)
- Auth: login only. Only `is_active = true` rows (:128), else 404.
- Access check only when `mapping.project_id` is set: the user must have the project or be admin, else 403 (:144-152). Mappings with no project are readable by anyone.
- Output: the full row (`vm.*`) plus names.

### POST /api/visual-mappings (:169)
- Auth: authorize write. Body: `name`, `description`, `graph_data` {nodes[], edges[]}, `canvas_state`, `project_id`, `sub_project_id`.
- Validation: `name` and `graph_data` are required, and `nodes` and `edges` must be arrays (400). No check that the user can access `project_id`.
- Rules: `emailNotification` nodes and the edges touching them are stripped (:10-24, :184). `description` defaults to `''`. `canvas_state` defaults to `{zoom:1, position:[0,0]}`. `notification_settings` is always `null`.
- Output: 201 with the row.

### PUT /api/visual-mappings/:id (:223)
- Auth: authorize write. Same validation and stripping as POST.
- Writes to an active row only (`is_active = true`, :245). 404 if not found. Sets `updated_at = CURRENT_TIMESTAMP` and resets `notification_settings` to `null`. No ownership or project check.

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
  8. Insert an executions row `running`, with `triggered_by` set to the user.
  9. Insert a `visual_mapping_execution_logs` row with `run_id = vmrun-<Date.now()>`.
  10. Update `last_executed_at` and `execution_count + 1` on the def.
  11. Project access check (:586-592), returning 403 'You do not have permission...'.
  12. Respond `{message, execution_id, run_id, mapping_id, mapping_name, status:'running', async:true}`.
- Background (`setImmediate`, :606): inserts a temporary `transformation_mappings` row (`mapping_id = vm-<id>-<ts>`, name `[VM] ...`, `is_visual_mapping`/`is_temporary` true).
  - Defaults: `source_file_pattern` `'*'`, `target_file_format` `'csv'`, `schema_drift_handling` `'warn'`, `violation_handling` `'continue'`.
  - A vendor agreement takes precedence: when `vendor_agreement_id` is set, `source_connection_id` is stored as null (:612-613).
  - `rdm_lookup_enabled` is true if there is any RDM config or any `rdmLookup` node.
  - DQ rules are upserted into `transformation_quality_rules`, with `error_action` defaulting to `'log_continue'` (:686).
  - Calls `executeTransformationJob(pool, tempId, userId, {visualMappingExecutionId, nodes, edges, nodeExecutionMap, executionOrder, skipInternalCleanup:true, audit context})`.
  - Final status is `jobResult.status || 'completed'`, and `failed` marks the error.
  - Updates the executions row (`job_id`, `rows_processed = rowsWritten || 0`) and the logs row (3 fixed entries), then deletes the temp mapping.
  - On an exception: status `failed` is set on both tables and the temp row is deleted.
- Errors: 500 `Failed to execute visual mapping`.

### GET /api/visual-mappings/:id/execution-status/:executionId (:805)
- Auth: login only, no project check. Reads `visual_mapping_execution_logs` first, then falls back to `visual_mapping_executions`. Returns `{executionId, runId, runName, startedAt, status, logs, isComplete: status !== 'running'}`, or the second shape. 404 if neither has it.

### GET /api/visual-mappings/:id/running-execution (:866)
- Auth: login only. Latest `running` row in the execution logs table. Returns `{hasRunningExecution:true, executionId, runId, runName, startedAt, logs}` or `{hasRunningExecution:false}`.

### POST /api/visual-mappings/:id/validate (:907)
- Auth: login only (no `authorize`). Compiles the active mapping. Always returns 200 `{valid:true, message, executionOrder}` or `{valid:false, errors}`. 404 if missing. Does NOT strip email nodes, unlike execute. `emailNotification` nodes are exempt from the orphan check (compiler :162).

### GET /api/visual-mappings/:id/executions (:957)
- Auth: login only. Query `limit` (default 10) and `offset` (default 0) are passed straight to SQL as parameters. Returns `visual_mapping_executions.*` plus `triggered_by_username`, ordered by `created_at DESC`.

### POST /api/visual-mappings/executions/:executionId/logs (:989)
- Auth: login only. Body `logs` must be an array (400). Overwrites `visual_mapping_executions.logs` for that `execution_id`. 404 if not found. No check of the mapping or the user. Returns `{success, logCount}`.

### GET /api/visual-mappings/:id/logs (:1030)
- Auth: login only. Last 10 rows of `visual_mapping_executions` (`LIMIT 10` hard coded) with `execution_id`, `status`, `created_at`, `completed_at`, `logs`, `rows_processed`, `error_message`.

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

### Socket.IO events (visualMappingWebSocket.js, init at server.js:14172)
- `connection` (:11), `subscribe_execution(executionId)` (:16), `unsubscribe_execution` (:24), `disconnect` (:32). The room is `execution:<id>`.
- No socket authentication, no check that the user may view the execution. Any client can join any room.
- Server to client emits: `node_status`, `edge_row_count`, `execution_progress`, `execution_complete`, `execution_error` (includes `error.stack`, :113-116), `execution_log` (level upper-cased), `execution_start` (resets edges and emits `rowCount:0` per edge, :145-166). The emitters are called from `jobExecutionEngine.js` (imported at :22; call sites not traced).
- The Socket.IO CORS origin function allows no-Origin requests (server.js:14151).

### Frontend (not traced in depth)
- `/visual-mappings/new` and `/:mappingId` -> `VisualMappingCanvas.jsx`. Uses GET/PUT/POST/execute (:616, :1210, :1214, :1253).
- `/visual-mappings/manage` -> `VisualMappingManager.jsx`. List, delete (single and bulk), clone, execute (single and bulk), executions (:92-229).
- Hook `useVisualMappingExecution.js`:
  - `io(window.location.origin, {path:'/socket.io', reconnectionDelay:1000, reconnectionAttempts:5})` (:20-26).
  - Subscribe waits at most 5000 ms for connect (:184).
  - Also polls `running-execution` (:402) and `execution-status` (:448).
- Compiler rules (visualMappingCompiler.js):
  - Needs at least one `sourceConfig` (:144) and one `targetRules` (:149).
  - Exactly 1 input for expression, rdmLookup, rdmDataset, rdmCrosswalk and targetRules (:182-188).
  - Join needs exactly 2 inputs (:191-199). Source nodes must have 0 inputs (:202).
  - Orphan check exempts sourceConfig, emailNotification and jiraTicket (:162).
  - Required config: source `connectionId`, `filePath`, `filePattern`; target `connectionId`, `filePath`, `fileName`; join `joinType`, `joinKeys`; RDM-specific fields (:243-302).
  - Cycle detection via Kahn's algorithm (:518).
  - Compiler defaults: `schema_drift_handling` `'none'`, `violation_handling` `'log_continue'` (:88-89), `target_file_format` `'csv'`.

## Data touched
- `visual_mapping_defs` (R/W), `visual_mapping_executions` (R/W), `visual_mapping_execution_logs` (R/W).
- `transformation_mappings` (temp insert and delete), `transformation_quality_rules` (upsert).
- `projects`, `users`, `storage_connections` (read). Storage files (read, via the engine).
- `visual_mapping_nodes` and `visual_mapping_edges` are listed in the inventory. No code in this area reads or writes them.

## Flags
- SECURITY: no role check on GET list, GET by id, validate, executions, logs, `execution-status`, `running-execution`, POST execution logs and `source-preview` (visualMappings.js:30, :114, :805, :866, :907, :957, :989, :1030, :1133). Execution-scoped routes have no project check.
- SECURITY: `source-preview` downloads from any `connectionId` for any logged-in user (:1146-1193). It also logs `req.body`, including `schema` (:1236).
- SECURITY: POST `/executions/:executionId/logs` lets any user overwrite the logs of any execution (:999).
- SECURITY: PUT, DELETE and clone have no project or ownership check. POST and PUT accept an arbitrary `project_id`.
- SECURITY: socket rooms are joinable by anyone without authentication (visualMappingWebSocket.js:16). `execution_error` sends stack traces (:113-116).
- SECURITY: `limit` and `offset` on `/executions` are unvalidated (:960). They are parameterized, so there is no injection, but non-numeric values give a 500.
- BUG: the list route's admin-bypass condition `!isAdmin && projectIds.length > 0` means a non-admin user with no projects sees ALL mappings (:61).
- BUG: execute creates the executions row, log row and counter increment (:554-577) BEFORE the project permission check (:586-592). A 403 leaves a `running` execution that blocks later runs with 409, because nothing ever completes it. It also bumps `execution_count`.
- BUG: the "already running" check and the insert are not atomic (:537-558). There is also no timeout or stale-run recovery for a `running` row (a crash during background execution leaves it forever, apart from the catch block).
- BUG: the catch block (:754-787) runs queries without its own try/catch. A failure there is an unhandled rejection inside `setImmediate`.
- BUG: the success path writes fixed, hard-coded final logs and overwrites the initial log (:728-740). Logs saved through the POST logs route go to a different table (`visual_mapping_executions.logs`), while `execution-status` reads `visual_mapping_execution_logs`.
- BUG: the temp transformation mapping is deleted only after a normal return, or in the catch block. If the engine returns normally with `failed`, the delete still happens (:743).
- BUG: delete returns 200 for already-inactive rows (:289-298). The clone's regex id replacement can corrupt label or text values that contain an old node id (:354-367).
- DUPLICATE: two execution-log stores (`visual_mapping_execution_logs` and `visual_mapping_executions.logs`) with different readers. `/logs` and `/executions` both list `visual_mapping_executions`. Email-node stripping is implemented in the route only, not in the compiler. The compiler also carries `emailNotification` and `jiraTicket` exemptions (:162).
- DUPLICATE: default values differ between compiler and route for the same fields. `schema_drift_handling` is `'none'` in the compiler (:88) but `'warn'` in the route (:665). `violation_handling` is `'log_continue'` in the compiler (:89) but `'continue'` in the route (:666). `variables` is `[]` in the compiler (:81) but `{}` in the route (:660).
- DEAD: `visual_mapping_nodes` and `visual_mapping_edges` have no code in this area. `notification_settings` is always written as `null`. The compiler's `emailNotification` and `jiraTicket` branches are unreachable on the execute path because email nodes are stripped (jiraTicket nodes are not stripped anywhere in the route).
- UNCLEAR: execute returns 409 only for `running` rows, yet `visual_mapping_executions.status` can also be other engine statuses (:716), and the list-vs-detail inconsistency on `is_active` default.

## Domain terms
Visual mapping (visual_mapping_defs), graph_data, canvas_state, node types (sourceConfig = "Source Config", targetRules = "Target Rules", expression, join, rdmLookup/rdmDataset/rdmCrosswalk), execution (`execution_id`) vs run (`run_id` `vmrun-...`) vs job (`job_id`), temporary transformation mapping (`is_visual_mapping`, `is_temporary`, `[VM]` prefix), vendor agreement vs source connection (mutually exclusive), DQ / quality rules (`log_continue` / `log_warn` / `log_abort`), RDM (reference data management), Visual Workflows (owner of email nodes), source preview.

## Open questions
1. Which engine code and events call each `visualMappingWS.emit*` method? `jobExecutionEngine.js` was not traced.
2. What are the semantics and values of `jobResult.status` (the set of statuses other than `failed`)?
3. Is `visual_mapping_orchestrator:*` granted to the roles that should use the read routes? `authorize` internals were not read.
4. Why does execute check project access last? It may be intended or accidental.
5. Which components call `source-preview` and `/executions/:id/logs`? The modals and the hook were not fully traced.
6. What does `propagateSchemas` and `compileNodes` (compiler :311-900) do per node type (schema rules, PII, anomaly, quality columns)? Not read.
7. Is `jiraTicket` a node type that exists anywhere in the UI?
8. Does `userHasAdminAccess` treat any role other than admin as admin? Not read.
