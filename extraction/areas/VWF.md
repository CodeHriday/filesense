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
- A non-numeric id (e.g. `validate`) is passed to the integer id query with no integer check, so it returns 500 (verifier report; the only integer check is in POST execution-logs).

### 3. POST / (:129)
- Body: `name, description, graph_data, project_id, sub_project_id`.
- 400 if `!name || !graph_data` (:133).
- `validateGraph` (:593) is run and returns 400 on failure.
- Insert: `description || ''`, project ids `|| null`, `created_by = req.user.id` (:142-147). 201 with the row.
- Does not check that the user belongs to the given project_id (no check in code).

### 4. PUT /:id (:166)
- Same validation as POST.
- `UPDATE ... WHERE id AND created_by = req.user.id AND is_active = true` (:183). Only the creator can edit, and this route has no admin bypass. 404 if no row matches.

### 5. DELETE /:id (:210)
- Soft delete: `is_active = false WHERE id AND created_by = user` (:215). Creator only. 404 if no row matches.
- Does not check for a running execution.

### 6. POST /:id/execute (:239)
- Permission: `req.user.permissions.includes('workflow:execute')`, else 403 (:242). This route does not check admin status itself; whether admins hold that permission is an open question.
- Ownership: the workflow must have `created_by = req.user.id` and be active, else 404 (:252-255). Project members cannot execute workflows they can view.
- Concurrency: if any `visual_workflow_executions` row for the workflow has `status = 'running'`, return 409 with the existing `executionId` (:268-281). This is a database check that reads only that table. A stale `running` row therefore blocks every later execute with 409 (see Flags).
- Creates the executor, which generates `executionId = VWFL-<Date.now()>-<8 chars of uuid>` (executor:17).
- Inserts a `visual_workflow_execution_logs` row with `run_id = wfrun-<Date.now()>`, status `running` and one INFO log (:289-297). This insert does not prune old rows to 10; only the client POST (#11) prunes.
- Runs in the background via `setImmediate` (:300). Returns 200 `{message, workflowId, workflowName, executionId, runId, status:'running', async:true}` (:364-372).
- The `async` body param is read (:250) but never used. Execution is always async.
- Background completion updates the log row to `success` or `failed` with rebuilt logs (:331-336). On a thrown error the status is set to `failed` (:345). That UPDATE in the catch is not wrapped in its own try/catch (:343-360), so if it throws it is an unhandled rejection inside the `setImmediate` async callback.
- The 500 response returns `error.message` to the client (:380).

### 7. GET /:id/execution-status/:executionId (:385)
- Reads `visual_workflow_execution_logs` by `workflow_id, execution_id` and returns `{executionId, runId, runName, startedAt, status, logs, isComplete: status !== 'running'}`.
- Otherwise falls back to `visual_workflow_executions` (start_time, end_time, duration_ms, total_nodes, completed_nodes, failed_nodes, summary, error_message). Otherwise 404.
- The execution_logs row is created at start, so the fallback is only reached for runs without a log row.
- No ownership or project check (any authenticated user).
- A non-numeric workflow id gives 500 (no integer check).

### 8. GET /:id/running-execution (:447)
- Returns the latest `execution_logs` row with `status = 'running'`, as `{hasRunningExecution:true, executionId, runId, runName, startedAt, logs}`. Otherwise `{hasRunningExecution:false}`.
- No ownership or project check.
- It checks the logs table, whereas execute's 409 check uses the executions table.
- A non-numeric workflow id gives 500 (no integer check).

### 9. POST /validate (:484)
- 400 if `graph_data` is missing. Returns `validateGraph` output as 200 whether valid or not: `{valid, error?, duplicates?, cycle?}`.
- Business rules in `validateGraph` (:593-705):
  - `nodes` and `edges` must be arrays.
  - Every edge source and target must be an existing node id.
  - Duplicate assets: key `${node.type}-${node.data?.assetId}`; any repeat is invalid (:632-646).
  - Cycle detection by DFS (:648).
- Route ordering: POST `/validate` does not collide with other POST routes. No GET `/validate` exists, so a GET falls through to `GET /:id` with the string `validate`, which hits the integer id query and returns 500.

### 10. GET /:id/execution-logs (:504)
- Latest 10 runs by `started_at DESC`.
- Returns `{runs:[{id: run_id, name, startedAt (ISO), status, logs}]}`. DB status `'completed'` is mapped to `'success'` (:522).
- No ownership or project check.
- A non-numeric workflow id gives 500 (no integer check).

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
  - Both branches return `success: true` unconditionally (:550-557, :577-583) and never read `jobResult.status`. The job engine returns `status: 'failed'` without throwing in several paths (jobExecutionEngine.js:1473 no files matched, :1661 and :1750 schema aborts; these are the `status` lines of the return statements at :1471, :1659 and :1748). Those failed jobs are recorded as node success. The final return at :2322-2329 (`status: finalStatus`, :2324) is a success return: `finalStatus` is only `completed` or `completed_with_warnings` (:2199). The quality abort (:3900) sets the job failed but then throws `DQ_ABORT` (:3919), rethrown at :2482, so it becomes a node error.
  - The legacy branch returns `jobId: jobResult.job_id` (:582), but the job engine returns `jobId` (jobExecutionEngine.js:2323), so this is always undefined.
- Mapping group: reads `mapping_groups` where `id`, then calls `executeMappingGroup(id, this.userId)` (:598). The group engine signature is `executeMappingGroup(groupId, maxConcurrency = 10, triggeredBy = null, options = {})` (mappingGroupExecutionEngine.js:22), so the user id is passed as `maxConcurrency` and `triggeredBy` is not passed. The engine returns `success: true` even when `failed > 0` (mappingGroupExecutionEngine.js:202-213), with fields `completed`, `failed`, `totalMappings` and no `executedMappings`. The executor always returns `success:true` with `executedMappings: result.executedMappings || 0` (:600-606), which is therefore always 0; failed member counts are dropped.
- Nested workflow: first tries `visual_workflows` (active only), running a new executor recursively with no recursion or depth guard (:626). Unlike mapping and group nodes, it returns `success: result.success` (:629-630). Each nested run creates its own `visual_workflow_executions` row (via `execute()`) and does not go through the route's 409 check. Then falls back to the `workflows` table (`SELECT * FROM workflows WHERE id = $1`, no `is_active` filter, :639-642) and `executeNStepWorkflow`, which the executor reports as `success:true` (:655-661). A missing or inactive visual id can therefore run an n-step workflow with the same id. Otherwise throws.
  - `executeNStepWorkflow` throws when any step has a failed asset (nStepWorkflowExecutionEngine.js:164-176, rethrown :204-226), so a failed n-step run becomes a node error, not success. A run that ends normally is reported success.
- Email node (:673-770), non-throwing:
  - Needs `emailConnectionId`, else skipped with an error.
  - Recipients are split on `[,;\s]+` and filtered to entries containing `@`.
  - `allOk = executionErrors.size === 0` (:702, :705). Only thrown node errors count; results with `success:false` (failed mapping group, Jira, earlier email) are not counted, so the email says "Completed". `notifyOnSuccess === false` or `notifyOnFailure === false` skips the send.
  - Subject default `Workflow ${overallStatus}`; `{status}` and `{workflowId}` are replaced (first occurrence only, string `.replace`).
  - Connection must be `status 'active'`. Sensitive config fields are decrypted. Sent via `NotificationService.sendWithProvider`.
  - Statistics count executed nodes, files and rows from upstream results.
- Jira node (:777-819), non-throwing: defaults `issueType 'Task'`, `priority 'Medium'`, summary `Workflow execution — {status}`. Calls `JiraService.createIssueFromWorkflow`. `allOk` comes only from `executionErrors.size` (:786-790), with no gating on upstream failure (the ticket is always created) and `success:false` results are not counted.
- Summary (:821-880):
  - Counts success, skipped and failed. A result with `success:false` that is not skipped counts as failed (:835-839), so a failed Jira or email send makes the whole workflow `failed`. A skipped email (no connection configured) counts as skipped (:833).
  - `successRate` is `(successCount / totalNodes * 100).toFixed(2)`, a percentage string (executor:877), where total = results + errors (skipped nodes are in the denominator). It is the number `0` when there are no nodes.
  - Final status is `completed` if `failedCount === 0`, else `failed` (:79).
  - `durationMs = Date.now() - start`.
  - `completed_nodes` is set to `successCount` and `failed_nodes` to `failedCount`.
  - `nodeStatuses` includes `jobId` and `executedMappings` (executor:857-858).

### Scheduled execution (cronSchedulerService.js:416-443)
- Entity type `workflow`: checks `visual_workflows WHERE id AND is_active = true` (:421-424). If found, runs `new VisualWorkflowExecutor(workflowIdInt, userId).execute()` (:428-429). Otherwise runs `executeNStepWorkflow` (:432).
- Entity type `visual_mapping`: `new VisualWorkflowExecutor(null, userId).executeMapping(parseInt(schedule.entity_id))` (:442-443). The executor then has `workflowId` null.
- Neither call goes through the route's `workflow:execute` permission, creator-only or 409 checks (all in visualWorkflows.js:242-281), and no `visual_workflow_execution_logs` row is written (no reference to that table anywhere in backend/services). `userId` comes from the schedule (not read).

## Data touched
- `visual_workflows` (read and write): id, name, description, graph_data, project_id, sub_project_id, created_by, is_active, created_at, updated_at.
- `visual_workflow_executions` (write): workflow_id, execution_id, status, total_nodes, triggered_by, project_id, start_time, end_time, duration_ms, completed_nodes, failed_nodes, execution_summary, error_message.
- `visual_workflow_execution_logs` (write): workflow_id, run_id, run_name, started_at, status, logs, execution_id.
- Read: `projects`, `project_members`, `access_group_members`, `project_access_groups`, `visual_mapping_defs`, `transformation_mappings`, `mapping_groups`, `workflows`.
- Write: temporary `transformation_mappings` and `transformation_quality_rules` rows.
- External: email provider via NotificationService, Jira via JiraService.
- Audit: auditMiddleware.js:64 maps `/api/visual-workflows` to type `workflow`.
- Scheduled execution of visual workflows is in cronSchedulerService.js:416-443 (see the Scheduled execution section above).

## Flags
- SECURITY: #7, #8, #10 and #11 have no ownership or project check, so any authenticated user can read logs or status for, or write logs to, any workflow id (visualWorkflows.js:385, 447, 504, 537).
- SECURITY: POST/PUT accept any `project_id` without a membership check (:129-186).
- SECURITY: the execute 500 response leaks `error.message` (:380).
- SECURITY: nested `workflow` nodes and `assetId` references are not authorised against the executing user. The executor loads any active visual workflow, mapping or group by id (executor:611, 396, 587).
- SECURITY: cronSchedulerService.js:416-443 runs visual workflows (and `visual_mapping` entities via `executeMapping`, with `workflowId` null) through the executor directly. That bypasses the `workflow:execute` permission, the creator-only check and the 409 concurrency check of the route, and writes no `visual_workflow_execution_logs` row. Nested workflow nodes (executor:626) likewise create their own executions row and skip the 409 check.
- BUG: failed nodes are still marked completed in the scheduler (`completed.add` runs after `executeNode`, which swallows errors), so downstream nodes always run, and an email node may run before it sees later failures (executor:237-242).
- BUG: the concurrency check is a database check and is not atomic. The `running` check and the insert are separate, and the executions row is only created later inside `execute()`, after the `setImmediate`. Two quick calls can both pass the 409 check (:268-300).
- BUG: the 409 check uses `visual_workflow_executions`, but a log row is written at the start. If the process dies, the rows remain `running`, `running-execution` will report running indefinitely, and a stale `running` row in `visual_workflow_executions` blocks all later executes with 409. No stale timeout or cleanup was found: a search of backend/*.js for `visual_workflow_execution(s|_logs)` matched only visualWorkflowExecutor.js, routes/visualWorkflows.js and routes/jobs.js (jobs.js:179, 301 only LEFT JOIN the table), and `status = 'running'` filters in files named `*isual*` appear only at visualWorkflows.js:270, 455 and visualMappings.js:539, 874 (other tables). Not searched: SQL/migration files and non-backend directories.
- BUG: execution log status values are inconsistent. The route writes `success` and `failed`, the client route defaults to `completed`, and GET maps `completed` to `success` (:522).
- BUG: if `execute()` throws before the executions row exists (e.g. workflow not found), `updateExecutionRecord` runs with `executionDbId = null`, so the update affects no row (executor:100, 133).
- BUG: `successRate` is a string, or the number 0 when empty (executor:877).
- BUG: `executeMapping` returns `success:true` regardless of `jobResult.status` (executor:550-557, :577-583). Job engine failures returned without throwing (jobExecutionEngine.js:1473, 1661, 1750) show as node success and the workflow ends `completed`. Applies to plain mapping nodes.
- BUG: `executeMappingGroup` is reported `success:true` unconditionally (executor:600-606) and the engine itself returns `success:true` with `failed > 0` (mappingGroupExecutionEngine.js:202-213). `executedMappings` is always 0 because the engine has no such field. `executeNStepWorkflow` failures do throw (nStepWorkflowExecutionEngine.js:164-176) and are recorded as node errors; only a normally ended run is reported success (executor:655-661).
- BUG: executor passes `this.userId` as the 2nd argument of `executeMappingGroup`, which is `maxConcurrency`; `triggeredBy` is dropped (executor:598 vs mappingGroupExecutionEngine.js:22).
- BUG: legacy mapping branch reads `jobResult.job_id` (executor:582) but the engine returns `jobId`, so `jobId` is always undefined.
- BUG: Jira and email `allOk` use only `executionErrors.size` (executor:702, 786-790), ignoring `success:false` results and not gating on upstream failure.
- BUG: a `success:false` Jira or email result is counted as failed in the summary (executor:835-839), failing the whole workflow, although these nodes are documented as non-fatal.
- BUG: the execute route's initial log insert never prunes to 10 rows (visualWorkflows.js:290); only the client POST prunes (:570-579).
- BUG: the failure-log UPDATE in the `setImmediate` catch is unwrapped (visualWorkflows.js:343-360), so a throw gives an unhandled rejection.
- BUG: GET `/validate` (no such route) and non-numeric ids on GET /:id, execution-status, running-execution and execution-logs return 500 instead of 400/404 (no integer check; only POST execution-logs checks).
- BUG: the nested workflow fallback to `workflows` has no `is_active` filter (executor:639-642), unlike the visual branch (:611-614).
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
2. Is the stale `running` state ever cleaned up elsewhere (a startup recovery job)? None found in backend/*.js by the search described in Flags; SQL, migrations and non-backend code were not searched.
3. Which user does a scheduled run execute as? `userId` in cronSchedulerService.js comes from the schedule, which was not read.
4. What do the frontend files and `src/components/workflow-nodes/*` and `WorkflowCanvasStandalone.jsx` do? Not read; only endpoint calls were grepped.
5. Why does the 409 check read a different table than the running-execution endpoint?
6. `userHasAdminAccess` semantics (utils/permissionHelpers) were not read.
