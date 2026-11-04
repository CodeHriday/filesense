# VWF - Visual workflows

## Summary
Visual workflows are DAGs (`graph_data` = `{nodes, edges}`) stored in `visual_workflows`. Routes are mounted at `/api/visual-workflows` behind `authenticateToken` (server.js:5337). Execution is run by `VisualWorkflowExecutor` (backend/services/visualWorkflowExecutor.js). Frontend files (src/hooks/useVisualWorkflows.js, useVisualWorkflowExecution.js, workflow-nodes/*, WorkflowCanvasStandalone.jsx) were only checked for which endpoints they call, not read in full. The only caller of the builder page found is src/pages/archived/WorkflowBuilder.jsx.

## Entry points
All routes: auth = `authenticateToken` (server.js:5337); errors return 500 `{error}` from a catch block unless stated.

### 1. GET /api/visual-workflows/ (visualWorkflows.js:17)
- Admin (`userHasAdminAccess(req.user)`, :19): all `is_active = true` workflows, ordered `created_at DESC` (:34-35).
- Non-admin: workflows where `created_by = $1` OR `project_id` is in the user's projects. Projects come from `project_members` UNION `access_group_members` joined to `project_access_groups` (:9-15, :52-55).
- Returns a row array, including `graph_data`, `project_name` and `sub_project_name`.

### 2. GET /:id (:71)
- Same admin/non-admin scoping, using `vw.*` (:79-110). The subquery is duplicated inline instead of using the constant.
- 404 `Visual workflow not found` (:115).

### 3. POST / (:129)
- Body: `name, description, graph_data, project_id, sub_project_id`.
- 400 if `!name || !graph_data` (:133).
- `validateGraph` (:593) is run and returns 400 on failure.
- Insert: `description || ''`, project ids `|| null`, `created_by = req.user.id` (:142-147). 201 with the row.
- Does not check that the user belongs to the given project_id (no check in code).

### 4. PUT /:id (:166)
- Same validation as POST.
- `UPDATE ... WHERE id AND created_by = req.user.id AND is_active = true` (:183). Only the creator can edit, and admins get no bypass. 404 if no row matches.

### 5. DELETE /:id (:210)
- Soft delete: `is_active = false WHERE id AND created_by = user` (:215). Creator only. 404 if no row matches.
- Does not check for a running execution.

### 6. POST /:id/execute (:239)
- Permission: `req.user.permissions.includes('workflow:execute')`, else 403 (:242). Admin status is not considered here.
- Ownership: the workflow must have `created_by = req.user.id` and be active, else 404 (:252-255). Project members cannot execute workflows they can view.
- Concurrency: if any `visual_workflow_executions` row for the workflow has `status = 'running'`, return 409 with the existing `executionId` (:268-281).
- Creates the executor, which generates `executionId = VWFL-<Date.now()>-<8 chars of uuid>` (executor:17).
- Inserts a `visual_workflow_execution_logs` row with `run_id = wfrun-<Date.now()>`, status `running` and one INFO log (:289-297).
- Runs in the background via `setImmediate` (:300). Returns 200 `{message, workflowId, workflowName, executionId, runId, status:'running', async:true}` (:364-372).
- The `async` body param is read (:250) but never used. Execution is always async.
- Background completion updates the log row to `success` or `failed` with rebuilt logs (:331-336). On a thrown error the status is set to `failed` (:345).
- The 500 response returns `error.message` to the client (:380).

### 7. GET /:id/execution-status/:executionId (:385)
- Reads `visual_workflow_execution_logs` by `workflow_id, execution_id` and returns `{executionId, runId, runName, startedAt, status, logs, isComplete: status !== 'running'}`.
- Otherwise falls back to `visual_workflow_executions` (start_time, end_time, duration_ms, total_nodes, completed_nodes, failed_nodes, summary, error_message). Otherwise 404.
- The execution_logs row is created at start, so the fallback is only reached for runs without a log row.
- No ownership or project check (any authenticated user).

### 8. GET /:id/running-execution (:447)
- Returns the latest `execution_logs` row with `status = 'running'`, as `{hasRunningExecution:true, executionId, runId, runName, startedAt, logs}`. Otherwise `{hasRunningExecution:false}`.
- No ownership or project check.
- It checks the logs table, whereas execute's 409 check uses the executions table.

### 9. POST /validate (:484)
- 400 if `graph_data` is missing. Returns `validateGraph` output as 200 whether valid or not: `{valid, error?, duplicates?, cycle?}`.
- Business rules in `validateGraph` (:593-705):
  - `nodes` and `edges` must be arrays.
  - Every edge source and target must be an existing node id.
  - Duplicate assets: key `${node.type}-${node.data?.assetId}`; any repeat is invalid (:632-646).
  - Cycle detection by DFS (:648).
- Route ordering: POST `/validate` does not collide with other POST routes. No GET `/validate` exists, so a GET would match `/:id`.

### 10. GET /:id/execution-logs (:504)
- Latest 10 runs by `started_at DESC`.
- Returns `{runs:[{id: run_id, name, startedAt (ISO), status, logs}]}`. DB status `'completed'` is mapped to `'success'` (:522).
- No ownership or project check.

### 11. POST /:id/execution-logs (:537)
- Client-supplied log upsert. Body: `runId, runName, startedAt, status, logs`. 400 if `runId` or `runName` is missing, or if the id is not an integer.
- If a row with the same `workflow_id, run_id` exists, update `run_name, status (default 'completed'), logs` (:557-561).
- Otherwise insert (default status `'running'`, `startedAt` or now), then prune to the latest 10 per workflow by `started_at` (:570-579). Pruning only happens on insert.
- No ownership check: any authenticated user can write or overwrite logs for any workflow id.
- `logs` content is stored unvalidated.

### Executor behaviour (invoked by #6)
- Loads an active workflow (:145). 0 nodes: status `completed`, "No nodes to execute" (:59-63).
- Inserts a `visual_workflow_executions` row (`status 'running'`, total_nodes, triggered_by, project_id) (:34-46).
- `topologicalSort` throws on a cycle (:192). `executeSmartParallel` runs each level of ready nodes with `Promise.all` (:200-253). A dependency counts as "completed" even if the node failed (`completed.add` after `executeNode`, which swallows errors), so downstream nodes still run after an upstream failure (:237-242, :371-390).
- Node types (:255-356):
  - `email_notification` (:262)
  - `jira_ticket` and `jiraTicket` (:276)
  - `start` and `stop`, which are skipped (:289)
  - a node missing `assetId` is recorded as an error string (:306-317)
  - `transformation_mapping`, `mapping`, `job`, `mapping_job` run a mapping (:335-341)
  - `mapping_group`, `job_group` run a mapping group (:343-347)
  - `workflow` runs a nested workflow (:349)
  - anything else throws "Unknown node type" and is recorded as an error
- Mapping execution (:393-584):
  - Looks up `visual_mapping_defs` where `is_active`. If found, it compiles with `visualMappingCompiler`, inserts a temporary `transformation_mappings` row (`mapping_id = vm-<id>-<ts>`, `is_temporary = true`, name prefix `[VM] `), inserts `transformation_quality_rules` (default error_action `log_continue`), runs `executeTransformationJob`, and deletes the temp row in `finally`.
  - Defaults: `source_file_pattern '*'`, `target_file_format 'csv'`, `schema_drift_handling 'warn'`, `violation_handling 'continue'`.
  - A vendor agreement overrides the source connection (set to null) (:435-436).
  - Otherwise falls back to the legacy `transformation_mappings` where `mapping_id = $1`.
- Mapping group: reads `mapping_groups` where `id`, then calls `executeMappingGroup(id, userId)`. Always returns `success:true` (:600-606).
- Nested workflow: first tries `visual_workflows`, running a new executor recursively with no recursion or depth guard (:626). Then falls back to the `workflows` table and `executeNStepWorkflow`, which returns `success:true` always (:655-661). Otherwise throws.
- Email node (:673-770), non-throwing:
  - Needs `emailConnectionId`, else skipped with an error.
  - Recipients are split on `[,;\s]+` and filtered to entries containing `@`.
  - `allOk = executionErrors.size === 0`. `notifyOnSuccess === false` or `notifyOnFailure === false` skips the send.
  - Subject default `Workflow ${overallStatus}`; `{status}` and `{workflowId}` are replaced (first occurrence only, string `.replace`).
  - Connection must be `status 'active'`. Sensitive config fields are decrypted. Sent via `NotificationService.sendWithProvider`.
  - Statistics count executed nodes, files and rows from upstream results.
- Jira node (:777-819), non-throwing: defaults `issueType 'Task'`, `priority 'Medium'`, summary `Workflow execution — {status}`. Calls `JiraService.createIssueFromWorkflow`.
- Summary (:821-880):
  - Counts success, skipped and failed. `successRate` is a 2-decimal string of success / total, where total = results + errors (skipped nodes are in the denominator). It is the number `0` when there are no nodes.
  - Final status is `completed` if `failedCount === 0`, else `failed` (:79).
  - `durationMs = Date.now() - start`.
  - `completed_nodes` is set to `successCount` and `failed_nodes` to `failedCount`.

## Data touched
- `visual_workflows` (read and write): id, name, description, graph_data, project_id, sub_project_id, created_by, is_active, created_at, updated_at.
- `visual_workflow_executions` (write): workflow_id, execution_id, status, total_nodes, triggered_by, project_id, start_time, end_time, duration_ms, completed_nodes, failed_nodes, execution_summary, error_message.
- `visual_workflow_execution_logs` (write): workflow_id, run_id, run_name, started_at, status, logs, execution_id.
- Read: `projects`, `project_members`, `access_group_members`, `project_access_groups`, `visual_mapping_defs`, `transformation_mappings`, `mapping_groups`, `workflows`.
- Write: temporary `transformation_mappings` and `transformation_quality_rules` rows.
- External: email provider via NotificationService, Jira via JiraService.
- Audit: auditMiddleware.js:64 maps `/api/visual-workflows` to type `workflow`.
- Scheduler reads visual workflows in its own route (scheduler.js:366-466; belongs to the SCH area).

## Flags
- SECURITY: #7, #8, #10 and #11 have no ownership or project check, so any authenticated user can read logs or status for, or write logs to, any workflow id (visualWorkflows.js:385, 447, 504, 537).
- SECURITY: POST/PUT accept any `project_id` without a membership check (:129-186).
- SECURITY: the execute 500 response leaks `error.message` (:380).
- SECURITY: nested `workflow` nodes and `assetId` references are not authorised against the executing user. The executor loads any active visual workflow, mapping or group by id (executor:611, 396, 587).
- BUG: failed nodes are still marked completed in the scheduler (`completed.add` runs after `executeNode`, which swallows errors), so downstream nodes always run, and an email node may run before it sees later failures (executor:237-242).
- BUG: the in-memory concurrency check is not atomic. The `running` check and the insert are separate, and the executions row is only created later inside `execute()`, after the `setImmediate`. Two quick calls can both pass the 409 check (:268-300).
- BUG: the 409 check uses `visual_workflow_executions`, but a log row is written at the start. If the process dies, the rows remain `running` forever, and `running-execution` will report running indefinitely. There is no stale timeout (code not found).
- BUG: execution log status values are inconsistent. The route writes `success` and `failed`, the client route defaults to `completed`, and GET maps `completed` to `success` (:522).
- BUG: if `execute()` throws before the executions row exists (e.g. workflow not found), `updateExecutionRecord` runs with `executionDbId = null`, so the update affects no row (executor:100, 133).
- BUG: `successRate` is a string, or the number 0 when empty (executor:877).
- BUG: `executeMappingGroup` and `executeNStepWorkflow` results are reported `success:true` unconditionally (executor:601-606, 655-661).
- BUG: `{status}` and `{workflowId}` are replaced only once per string (executor:719-720, 794-799).
- BUG: `executeVisualWorkflow` is imported at the top of the route and never used (:5).
- DUPLICATE: the project-access subquery appears as the constant `PROJECT_ACCESS_SUBQUERY` and again inline in GET /:id (:9-15 vs :102-108).
- DUPLICATE: cycle detection exists in `detectCycle` (route :648) and in `topologicalSort` (executor:192). Both are checked.
- DUPLICATE: separate permission rules for view versus edit, delete and execute (creator-only), while view allows admin or project members.
- DUPLICATE: execution state is stored in two tables (executions and execution_logs), and status/running endpoints read different tables.
- DEAD: the `async` body option (:250) and `executeVisualWorkflow` (executor:883, used only by the unused import).
- UNCLEAR: duplicate-asset rule keys on `${type}-${assetId}`. Nodes without an `assetId` (start, stop, email, jira) become `type-undefined`, so two email nodes, or two start or stop nodes, are rejected (:637).
- UNCLEAR: the hook `useVisualWorkflows.js:50` calls execute with `{}`, but the 409 and async behaviour on the client was not checked.

## Domain terms
- Visual workflow = `visual_workflows` row. Also called "workflow" in `workflow` nodes, which can refer to a visual workflow or an n-step workflow (the `workflows` table).
- Visual mapping = `visual_mapping_defs`; legacy mapping = `transformation_mappings`; "job" and "mapping_job" are old names for a mapping node; "job_group" is the old name for `mapping_group`.
- Execution id (`VWFL-...`) versus run id (`wfrun-...`) versus `executionDbId` (the `visual_workflow_executions.id`).
- Decorative nodes: start and stop.
- Node `assetType` versus `type` (both accepted, `assetType` preferred).

## Open questions
1. Is `workflow:execute` granted to admins by default? Admin bypass is not in this route (permission source in the AUTH area).
2. Is the stale `running` state ever cleaned up elsewhere (a startup recovery job)? No code found in this area.
3. How is the creator-only execute rule meant to interact with scheduled runs (the scheduler executes with which user)? Not read.
4. What do the frontend files and `src/components/workflow-nodes/*` and `WorkflowCanvasStandalone.jsx` do? Not read; only endpoint calls were grepped.
5. Why does the 409 check read a different table than the running-execution endpoint?
6. `userHasAdminAccess` semantics (utils/permissionHelpers) were not read.
