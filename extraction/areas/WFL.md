# WFL - Workflows (step and N-step)

## Summary
Two unrelated workflow features sit side by side.
- **N-step workflows** (`backend/routes/nStepWorkflows.js`, mounted `server.js:5261-5262` with `authenticateToken`). A workflow belongs to a project. It has numbered steps (`step_index`, one "active" at a time for editing). Each step holds "assets" (a mapping or a mapping group). Running a workflow runs the steps in index order. Assets inside a step run in parallel. Engine: `backend/services/nStepWorkflowExecutionEngine.js`.
- **Dependency workflows** (`backend/routes/workflowSteps.js`, mounted `server.js:5252-5253` with `authenticateToken`). Steps hang off a `business_processes` row (`workflowOrchestrationEngine.js:146-148`). Each step has an optional single `depends_on` parent, retry settings and an execution order. Engine: `backend/services/workflowOrchestrationEngine.js`.

The N-step routes do project-membership checks. The workflow-steps routes have no ownership or project check at all.

Not read: frontend pages (`NStepWorkflows.jsx`, `WorkflowManager.jsx`, `archived/WorkflowBuilder.jsx`) and DDL (FK/cascade rules). Only one frontend caller was checked (`frontend/src/services/workflowService.ts`).

## Entry points: N-step workflows (`/api/n-step-workflows`, all behind authenticateToken)

Common rules.
- Admin check: `userHasAdminAccess(user)` (`nStepWorkflows.js:31,55`). Admins bypass project checks.
- A non-admin must have the workflow's `project_id` in `getUserProjects(user.id)` (`:33-39`).
- Access errors carry `status` 403 or 404 and are returned as `{success:false,error}`.
- Other failures return 500 `{success:false,error:'Failed to ...'}`.

### GET /
`nStepWorkflows.js:50-105`
- Auth: any logged-in user. Non-admin results are filtered to `w.project_id = ANY(projectIds)`. A user with no projects gets `{success:true,workflows:[]}` (`:62-68`). No named permission is required.
- Output: `{success,workflows:[w.*, step_count, project_name]}`, ordered `created_at DESC` (`:86-89`).

### GET /:id
`:111-185`
- A guard calls `next()` if `:id` is not `^\d+$` (`:113`).
- Errors: 404 if the workflow is not found, 403 if the user has no project access (`:140-145`).
- Output: `{success,workflow:{...w, steps:[{...s, assets:[{id,asset_type,asset_id}]}]}}`. Steps are ordered by `step_index`. `assets` is null when a step has none (`FILTER`, `:157`).

### POST /
`:191-240`
- Auth: `authorizeProjectResource({resourceType:'workflow', requiredPermissions:['workflow:write']})`. `project_id` is required in the body (`:197-199`), parsed base 10. The middleware sets `req.projectId`.
- Inputs: `name` (required, else 400 'Workflow name is required'), `description`, `sub_project_id` (falsy becomes null).
- Writes: `n_step_workflows` with `created_by = req.user?.id || 1` (`:206`). Then it also inserts step 1 (`step_index=1,is_active=true`) (`:224-227`).
- Output: 200 (not 201) `{success,workflow}`.
- The two inserts are not in a transaction.

### PUT /:id
`:246-326`
- Auth: project membership only. No `workflow:write` check.
- Inputs: `name`, `description`, `sub_project_id`. `project_id` cannot be changed ("for security", `:293`). Empty update gives 400 'No fields to update'.
- Writes `updated_at = CURRENT_TIMESTAMP`.
- Errors: 404 if not found. There is no 403/404 passthrough in the catch, which is fine because the checks are inline.

### DELETE /:id
`:332-368`
- Auth: `validateWorkflowAccess` (membership). No `workflow:delete` check.
- `DELETE FROM n_step_workflows WHERE id=$1`. Child rows depend on FK cascade, which was not verified (see Open questions).
- Output: `{success,message:'Workflow deleted successfully'}`.

### POST /:id/steps
`:374-429`
- Auth: membership.
- Rule: new `step_index = COALESCE(MAX(step_index),0)+1`. All steps of the workflow are set `is_active=false`, then the new one is inserted active (`:382-402`).
- Output: `{success,step}`. Not transactional.
- The catch also maps by error-message text ('do not have access', 'not found') to 403/404 (`:416-422`).

### POST /:id/steps/next
`:435-502`
- Auth: membership.
- Finds the active step. If none, 400 'No active step found'.
- Deactivates it. Then it activates the step at `step_index+1` if that exists. Otherwise it inserts a new empty step at that index, active (`:455-483`).
- Output: `{success,activeStep}`.
- There is no check that the current step has assets.

### POST /:id/steps/previous
`:508-568`
- Auth: membership.
- 400 'No active step found'. 400 'Already at first step' if `step_index === 1`.
- Deactivates the current step and activates `step_index-1`. Output: `{success,activeStep: rows[0]}`.

### PUT /:id/steps/:stepId/activate
`:574-620`
- Auth: membership.
- It deactivates ALL steps first (`:582-586`). Then it activates `id=$1 AND workflow_id=$2`. If no row matches, it returns 404 'Step not found' (`:596`). By then the deactivation has already happened and is not rolled back (BUG, see Flags).

### POST /:id/steps/:stepId/assets
`:626-700`
- Auth: membership of workflow `:id`.
- Input: `asset_type` must be in `['mapping','mapping_group']`, else 400 'Invalid asset type'. `asset_id` is not validated.
- Rule, the **10-mapping limit per step** (`:669`). A mapping counts as 1. A group counts as its `mapping_group_members` row count. Current total = count of mapping assets in the step + the sum of group member counts. If `newTotal > 10`, 400 `Adding this <type> would exceed the 10-mapping limit (current: X, would be: Y)`.
- Writes `n_step_workflow_assets(step_id,asset_type,asset_id)`.
- Output: `{success,asset,expandedCount:newTotal}`.
- No check that the `asset_id` exists. No check that `stepId` belongs to workflow `:id`. Duplicates are not prevented.

### DELETE /:id/steps/:stepId/assets/:assetId
`:706-742`
- Auth: membership of workflow `:id`.
- `DELETE FROM n_step_workflow_assets WHERE id=$1` uses only `assetId` (`:713-716`). It is not scoped to the step or the workflow. 404 'Asset not found'.

### DELETE /:id/steps/:stepId
`:748-827`
- Auth: membership.
- Order of operations: (1) delete all assets of `stepId` (`:756`), (2) look up the step in workflow `:id` and return 404 if not found (`:762-772`), (3) delete the step, (4) renumber later steps with `step_index = step_index-1` (`:783-787`), (5) if no active step remains, activate `step_index=1` (`:790-800`).
- There is no minimum-steps rule. The last step can be deleted, which leaves a workflow with zero steps.

### GET /:id/steps/:stepId/expanded-count
`:833-865`
- Only `authenticateToken`. There is no workflow access check and no membership check.
- Returns `{success,expandedCount}` using the same count formula as the 10-limit.

### POST /:id/execute
`:871-940`
- Auth: (1) membership via `validateWorkflowAccess`, then (2) `req.user.permissions.includes('workflow:execute')`, else 403 'Access denied' (`:879-884`).
- Fire-and-forget `executeNStepWorkflow(id, userId)` (`:898`). Returns 202 `{success,message,workflowId,workflowName}`.
- Execution is detailed under "Engine: N-step execution" below.

### GET /runs/:runId
`:946-963`
- Only `authenticateToken`. `runId` is the string `WFRUN-...`, not the numeric id.
- Output: `{success, run, steps, jobs}` (`nStepWorkflowExecutionEngine.js:234-267`). Jobs are `transformation_jobs WHERE workflow_execution_id = run.id`.
- Every error returns 500, including run-not-found.
- There is no project access check (SECURITY).

### GET /init-data
`:971-1056`
- Reachable because `/:id` calls `next()` for non-numeric ids.
- Permission-aware batch: workflows (with `step_count`, `project_name`), `visual_mappings` (`is_deleted=false`), `mapping_groups`, `projects`, in one `Promise.all`. Non-admin results are filtered by `ANY(projectIds)`; projects are filtered by `id = ANY`.
- A non-admin with no projects gets empty arrays for all four.

## Engine: N-step execution (`executeNStepWorkflow`, nStepWorkflowExecutionEngine.js:15-228)
- `runId = WFRUN-<Date.now()>-<uuid first 8 chars>` (`:16`).
- Loads the workflow (throws `Workflow N not found`) and its steps with assets. Throws `No steps found in workflow` if there are none (`:52-54`).
- Inserts `n_step_workflow_runs` with status `running`.
- Steps run **sequentially by `step_index`**. The `is_active` flag is ignored; every step runs.
- Per step it inserts `n_step_workflow_run_steps` (status `running`). A step with no assets is marked `completed` and skipped (`:90-99`).
- Assets in a step run in **parallel** with `Promise.all` (`:107-143`).
  - `mapping` calls `executeTransformationJob(pool, asset_id, triggeredBy, {workflowExecutionId: runRecordId, scheduleId: options.scheduleId||null})`.
  - `mapping_group` calls `executeMappingGroup(asset_id, 10, triggeredBy, {...})`. The concurrency is hardcoded at 10 ("default concurrency", `:123`).
- A thrown asset error is caught and recorded as `{success:false}`.
- Step status is `failed` if any asset failed, else `completed` (`:151`). The counters `jobs_count`, `jobs_completed` and `jobs_failed` are stored, plus `duration_ms`.
- If any asset failed, the run is set to `failed` with `error_message = "Step N failed: X asset(s) failed"` and the loop stops. Later steps get no run-step rows. The error is re-thrown, and the catch overwrites the run row again (`:212-224`).
- If every step succeeds, the run is `completed`.
- No retries. No alert emitted (unlike the dependency engine).
- `triggeredBy` is the numeric `req.user.id` (or the fallback 1). `options.scheduleId` is used when a schedule calls this function (schedule caller not traced).

## Entry points: dependency workflows (`/api/workflow-steps`, authenticateToken only)

None of these has a project or ownership check, and none checks a role or permission except execute.

### GET /
`workflowSteps.js:17-37`
- Returns all steps of ALL workflows, joined with `projects` on `ws.project_id` (`:21`). Ordered by `workflow_id, execution_order, id`.
- `workflow_steps.project_id` is joined here, but the insert never sets it (see BUG).

### GET /workflow/:workflowId/steps
`:40-61`
- Returns the steps of one workflow, ordered by `execution_order, id`.

### GET /steps/:id
`:64-90`
- Returns one step, or 404 'Workflow step not found'.

### POST /workflow/:workflowId/steps
`:93-140`
- Inputs: `step_name`, `step_type`, `entity_id` (all required, 400 otherwise); `depends_on` (default null); `retry_count` (default 3); `retry_delay_seconds` (default 60); `execution_order` (default 0).
- Validation: `step_type` must be `'mapping'` or `'mapping_group'` (`:113`).
- `entity_id` is stored as `String(entity_id)`.
- Not validated: that the workflow exists, that `entity_id` exists, that `depends_on` points to a step in the same workflow, that there are no cycles, and that the retry values are non-negative.
- Output: 201 `{success,step}`.

### PUT /steps/:id
`:143-225`
- Dynamic update of any provided field. 400 'No fields to update' if none. 404 if not found.
- `step_type` is not re-validated on update (the POST check is missing here).

### DELETE /steps/:id
`:228-256`
- Hard delete. 404 if not found.
- Dependents' `depends_on` is not touched (cascade not verified).

### POST /workflow/:workflowId/execute
`:259-299`
- Auth: `req.user.permissions.includes('workflow:execute')`, else 403 `{error:'Access denied',message:...}` (`:262`). There is no project check.
- `triggered_by` is taken from the request body, not from `req.user` (`:270`).
- Fire-and-forget `executeWorkflow(parseInt(workflowId), triggered_by)`. Returns 202 `{success,message:'Workflow execution started',workflowId}`.
- The `.then` always logs 'Workflow execution completed' even when `result.success === false`.

### GET /workflow/:workflowId/executions
`:302-317`
- `limit = parseInt(req.query.limit) || 50`. There is no upper cap.
- Returns `{success,executions}` from `workflow_executions` joined to `business_processes`, ordered by `created_at DESC`.

### GET /executions/:executionId
`:320-334`
- Takes the numeric execution record id (not the `WORKFLOW-...` string).
- Returns `{success,execution}` with `workflow_name` and `current_step_name`.
- Any error, including not found, gives 500.

## Engine: dependency execution (`executeWorkflow`, workflowOrchestrationEngine.js:138-424)
- `executionId = WORKFLOW-<Date.now()>-<uuid8>`.
- The workflow is read from `business_processes`. Throws `Workflow N not found` or `No steps found`.
- Inserts `workflow_executions` (status `running`, `total_steps`, `triggered_by`).
- Graph: roots are steps whose `depends_on` is falsy. A step with a `depends_on` is a dependent of that single parent (`:18-47`).
- Level-by-level:
  - All steps in the current level run in parallel (`:206`). `current_step_id` is overwritten for each, so it shows only the last writer.
  - Retry per step (`executeStep`, `:57-130`): `maxRetries = retry_count || 3`, `retryDelay = retry_delay_seconds || 60` seconds, a `setTimeout` wait between attempts. A value of 0 is replaced by the default.
  - Attempts run `1..maxRetries`. The value is "max attempts", not "retries after the first". `retry_count=3` means 3 attempts total.
  - If any step in a level fails after the retries, the whole run is aborted. The status becomes `failed` with the message 'Workflow aborted due to step failures after retries'. The other steps in the same level still ran to completion. An alert is emitted via `alertAggregationWorker.onWorkflowCompleted(workflowId, executionId, 'failed')` through `setImmediate`.
  - The next level is the dependents of the finished steps whose parent is in `completedSteps` (`:307-318`).
- Final state: `completed` with `completed_steps`, `duration_ms`. An alert 'completed' is emitted. An exception path sets `failed` with `error.message` and emits an alert.
- The return value (the route ignores it) has `success, executionId, executionRecordId, totals, stepResults`.

## Data touched
- Tables:
  - N-step: `n_step_workflows`, `n_step_workflow_steps`, `n_step_workflow_assets`, `n_step_workflow_runs`, `n_step_workflow_run_steps`.
  - Dependency: `workflow_steps`, `workflow_executions`, `business_processes`.
  - Cross-area reads: `mapping_group_members`, `mapping_groups`, `visual_mappings`, `projects`, `transformation_jobs` (`workflow_execution_id`).
- Statuses:
  - Run, run-step and workflow execution: `running`, `completed`, `failed`.
  - Step graph node: `pending` (in memory only).
- Admin cleanup deletes all rows of both step tables (`adminCleanupRoutes.js:367-368`). This belongs to another area.
- `auditMiddleware.js:63-65` labels these routes as types `workflow` and `workflow_step`.

## Flags

### BUG
1. `workflowOrchestrationEngine.js:75` calls `executeTransformationJob(parseInt(step.entity_id), triggeredBy)`. The real signature is `(pool, mappingId, userId, options)` (`jobExecutionEngine.js:1137`). So `pool` receives the mapping id and `mappingId` receives `triggeredBy`. Mapping steps in the dependency engine cannot work as written. Compare with the N-step engine's correct call at `nStepWorkflowExecutionEngine.js:110`.
2. `workflowOrchestrationEngine.js:78` calls `executeMappingGroup(id, null, triggeredBy)`. `null` is passed as `maxConcurrency` (the default of 10 applies only for `undefined`, `mappingGroupExecutionEngine.js:22`). Effect not traced.
3. `workflowSteps.js:21` joins `projects p ON ws.project_id`, but the POST insert (`:121-125`) never writes `project_id`. Whether the column is set elsewhere was not checked.
4. `nStepWorkflows.js:582-601`: activate deactivates all steps before checking that the target exists. A bad `stepId` leaves the workflow with no active step and returns 404.
5. `nStepWorkflows.js:756-780`: DELETE step removes the assets of `stepId` BEFORE verifying that the step belongs to workflow `:id`. A user with access to workflow A can delete all assets of a step in workflow B (it then returns 404).
6. The 10-mapping limit is only checked on insert. Group membership changes later are not rechecked, so a step can exceed 10 (`:669`).
7. Dependency engine: a step with `depends_on` pointing at a missing step, a step in a cycle, or a step in another workflow never runs, and no error is raised. The run is still marked `completed` with `completed_steps < total_steps` (`:307-336`).
8. Dependency engine: `retry_count || 3` and `retry_delay_seconds || 60` turn an explicit 0 into the default (`:219-220`).
9. `workflowSteps.js:273-285`: the success log fires even when the returned `result.success` is false.
10. `workflowSteps.js:320-334` and `nStepWorkflows.js:946-962`: not-found errors are reported as 500.
11. `nStepWorkflows.js:206`: `created_by = req.user?.id || 1` falls back to user 1.
12. `nStepWorkflowExecutionEngine.js:107-141`: an asset whose type is neither `mapping` nor `mapping_group` makes the map callback return `undefined`, so `r.success` throws a TypeError. Inserts are validated, so this is only reachable via direct DB edits.
13. Several multi-statement writes (create workflow plus step 1, add step, next, delete step, activate) are not in transactions.

### SECURITY
1. The whole `/api/workflow-steps` router has no project, ownership or role check apart from the `workflow:execute` check on execute. Any logged-in user can read all steps of all workflows (`:17-37`), create steps (`:93`), edit steps (`:143`) and delete steps (`:228`). No `workflow:write`.
2. `workflowSteps.js:270`: `triggered_by` comes from the request body, so the audit field can be spoofed.
3. `nStepWorkflows.js:833` (expanded-count) and `:946` (runs/:runId) have no project access check. Run details and its jobs are readable by any logged-in user who knows or guesses a run id.
4. `nStepWorkflows.js:706-716`: the asset delete is not scoped to the step or workflow (IDOR). Any asset id can be deleted by a user with access to any workflow.
5. `nStepWorkflows.js:626-680`: a step id from another workflow can be passed, and assets are added to it. `stepId` is not checked against `:id`.
6. Only POST / (create) and execute enforce a named permission. PUT, DELETE and step/asset edits rely on project membership only. Also the asset's `asset_id` target is not checked for being in the same project.
7. `nStepWorkflows.js:937`: execute 500 responses echo `error.message` to the client.

### DUPLICATE
1. Two workflow systems: N-step (`n_step_*` tables) vs dependency (`workflow_steps` + `business_processes`). Both execute mappings and mapping groups. They differ in: ordering (index vs `depends_on` graph), parallelism (assets in a step vs steps in a level), retry (none vs `retry_count` attempts with delay), alerts (none vs `onWorkflowCompleted`), access control (membership vs none), and the run id format (`WFRUN-` vs `WORKFLOW-`).
2. The project-access block is copy-pasted instead of using `validateWorkflowAccess`: GET /:id (`:133-146`), PUT /:id (`:265-278`) and list/init-data.
3. The expanded-count SQL is repeated in the asset POST (`:651-663`) and the expanded-count GET (`:837-849`).
4. The message-text error mapping (`:416`, `:814`, `:927`) duplicates the `error.status` branch.

### DEAD
1. `workflowSteps.js` helper `getWorkflowExecutionStatus`/`History` are used. `buildExecutionGraph` is internal only. No dead exports were found.
2. The frontend `workflowService.ts` calls `/workflow-steps` with POST (`:84`), but the router has no `POST /` route. The only backend route is `POST /workflow/:workflowId/steps`. Whether the call is reachable was not checked. See Open questions.

### UNCLEAR
1. `is_active` on N-step steps: it is only an editing cursor and has no effect on execution (`nStepWorkflowExecutionEngine.js:72`: all steps run).
2. `PUT /:id` destructures `{name, description, _, sub_project_id}` (`:249`). The `_` field is unexplained.
3. Whether non-admin users with no `workflow:write` can still edit via PUT and step routes (only membership is checked).
4. `workflow_steps.execution_order` is used for sorting only. It does not affect run order, since the graph decides.

## Domain terms
- Workflow: N-step workflow (`n_step_workflows`) vs `business_processes` row used as the workflow in the dependency engine (`workflowOrchestrationEngine.js:132-135` calls it "(business_process) ID").
- Step: N-step "step" (`step_index`, active flag) vs dependency "workflow step" (`step_name`, `step_type`, `entity_id`).
- Asset (`asset_type`, `asset_id`) vs entity (`entity_id`): both mean a mapping or mapping group.
- Mapping = `visual_mappings` row. Mapping group = `mapping_groups`.
- Expanded count: mapping count after expanding groups to members.
- Active step / freeze (comments "freeze current").
- Run (`n_step_workflow_runs`, `run_id` `WFRUN-`) vs execution (`workflow_executions`, `execution_id` `WORKFLOW-`).
- `triggered_by`, `workflowExecutionId`, `scheduleId`.
- Level (topological level), roots, dependents.

## Open questions
1. FK/cascade rules for the `n_step_*` and `workflow_steps` tables (DDL not read). What happens to steps, assets and runs when a workflow is deleted? Does `workflow_steps.project_id` exist and who sets it?
2. Which frontend page calls `/workflow-steps` (`workflowService.ts:46-84`), and does POST `/workflow-steps` (no matching route) work at all? The page-to-API mapping for `WorkflowManager.jsx` and `archived/WorkflowBuilder.jsx` was not traced.
3. Who calls `executeNStepWorkflow` besides the route (scheduler)? `scheduler.js:387,465` lists nStepWorkflows. The caller was not traced.
4. Does anything call `executeWorkflow` besides `workflowSteps.js` (e.g. a scheduler or business process route)? Not grepped.
5. What does `executeMappingGroup` do when `maxConcurrency` is `null`?
6. How `req.user.permissions` is populated and which roles hold `workflow:execute` / `workflow:write` (AUTH area).
7. How `authorizeProjectResource` resolves `workflow:write` for non-admins (middleware not read).
8. Intended semantics of `retry_count`: attempts or retries after the first? Code treats it as total attempts (`workflowOrchestrationEngine.js:60`).
9. Whether the step 1 insert in POST / and the "first step cannot be deleted" rule are intended (no rule exists in DELETE step).
