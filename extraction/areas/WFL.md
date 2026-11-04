# WFL - Workflows (step and N-step)

## Summary
Two unrelated workflow features sit side by side.
- **N-step workflows** (`backend/routes/nStepWorkflows.js`, mounted `server.js:5261-5262` with `authenticateToken`). A workflow belongs to a project. It has numbered steps (`step_index`, one "active" at a time for editing). Each step holds "assets" (a mapping or a mapping group). Running a workflow runs the steps in index order. Assets inside a step run in parallel. Engine: `backend/services/nStepWorkflowExecutionEngine.js`.
- **Dependency workflows** (`backend/routes/workflowSteps.js`, mounted `server.js:5252-5253` with `authenticateToken`). Steps hang off a `business_processes` row (`workflowOrchestrationEngine.js:146-148`). Each step has an optional single `depends_on` parent, retry settings and an execution order. Engine: `backend/services/workflowOrchestrationEngine.js`.

The N-step routes do project-membership checks. The workflow-steps routes have no ownership or project check at all.

Not read: `NStepWorkflows.jsx`, `WorkflowManager.jsx`, `archived/WorkflowBuilder.jsx`. Frontend callers checked: `frontend/src/services/workflowService.ts`, `src/pages/Workflows.jsx` and `src/pages/WorkflowForm.jsx` (see Flags). Schema read for FK rules: `attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql` and `..._1767956647766.sql`, `backend/migrations/workflowOrchestration.js`, `backend/migrations/addProjectIdToResources.js`, `database_ddl_2026-01-07.sql` (see "FK and cascade rules").

## Entry points: N-step workflows (`/api/n-step-workflows`, all behind authenticateToken)

Common rules.
- Admin check: `userHasAdminAccess(user)` (`nStepWorkflows.js:31,55`). Admins bypass project checks.
- A non-admin must have the workflow's `project_id` in `getUserProjects(user.id)` (`:33-39`).
- Access errors from `validateWorkflowAccess` carry `status` 403 or 404 and are returned as `{success:false,error}`. This holds only for routes that use `validateWorkflowAccess`.
  - GET /:id (`:140-144`) and PUT /:id (`:272-276`) check inline and return 403 `{success:false,error:'Access denied',message:'You do not have access to this workflow'}`.
  - The `workflow:execute` 403 (`:880-883`) is `{error:'Access denied',message}` with no `success` field. The workflow-steps execute 403 (`workflowSteps.js:263-266`) has the same shape.
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
- Auth: `authorizeProjectResource({resourceType:'workflow', requiredPermissions:['workflow:write']})`. The `getProjectId` callback (`:195-201`) throws `Error('project_id is required')` when `req.body.project_id` is falsy, then returns `parseInt(project_id, 10)`. The middleware sets `req.projectId`.
- A missing `project_id` does not produce a 400 from the handler. The throw happens inside the middleware's try (`requireProjectAccess.js:47-49`), whose catch returns 500 `{error:'Project access check failed'}` (`:165-172`). A 400 `{error:'Project context required'}` happens only when the parsed id is falsy, for example NaN or 0 (`:55-62`).
- The middleware (`requireProjectAccess.js:78-102`) checks membership of the project or its parent project (sub-project), via `project_members` or group membership. It returns 403 `{error:'Access denied',message:'This project is not active'}` for an inactive project (`:138-147`). The list and detail routes use `getUserProjects` instead. `sub_project_id` is not validated against `project_id`.
- Admin bypass: `requireProjectAccess.js:66` skips the membership check when `allowAdminBypass && userHasAllProjectAccess(req.user)`. This helper (`:17`) differs from `userHasAdminAccess` used elsewhere in the route. Admins also skip the active-project check and the `workflow:write` check (`authorizeProjectResource.js:91`), so the inactive-project 403 above does not apply to admins.
- Other responses: 401 `{error:'Authentication required'}` with no user (`authorizeProjectResource.js:52`, `requireProjectAccess.js:40`); 404 `{error:'Not found',message:'Project not found'}` (`requireProjectAccess.js:124-133`); 403 `{error:'Permission denied',...,requiredPermissions}` for a missing `workflow:write` (`authorizeProjectResource.js:110-114`).
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
- `DELETE FROM n_step_workflows WHERE id=$1 RETURNING *` (`:339-342`). Child-row behaviour per the production schema dumps: steps and their assets are removed by ON DELETE CASCADE (`..._1767956647766.sql:7619`, `:7603`), but `n_step_workflow_runs.workflow_id` has no ON DELETE clause (`:7614`), so a workflow that has any run row cannot be deleted. The delete throws and the catch returns 500 `{success:false,error:'Failed to delete workflow'}` (`:362-366`). See "FK and cascade rules".
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
- If no row exists at `step_index-1` (for example after gaps), the current step is already deactivated (`:538-542`), the second UPDATE matches nothing (`:544-549`), and the response is `{success:true,activeStep:undefined}` (`:551-554`). The workflow is left with no active step.

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
- `n_step_workflow_assets.asset_id` is `varchar(255)` in the production dump (`FileSence_prod_schema_Jan_05_1767956647766.sql:5437`). The current-count query casts `a.asset_id::integer` inside a `CASE WHEN a.asset_type = 'mapping_group'` branch (`:654-660`). A stored `mapping_group` row with a non-numeric `asset_id` therefore makes this count query fail, so every later asset add to that step returns 500. For a new `mapping_group` asset, `asset_id` is passed as a query parameter to `group_id = $1` (`:643-647`), which also errors for a non-numeric value. A group that does not exist or is empty counts as 0 and is accepted.

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
- Returns `{success,expandedCount}` using the same count formula as the 10-limit, including the `a.asset_id::integer` cast (`:843`). The same non-numeric `mapping_group` `asset_id` problem applies: the route returns an error for that step.

### POST /:id/execute
`:871-940`
- Auth: (1) membership via `validateWorkflowAccess`, then (2) `req.user.permissions.includes('workflow:execute')`, else 403 'Access denied' (`:879-884`).
- Re-check: `SELECT name FROM n_step_workflows WHERE id = $1`; if no row, 404 `{success:false,error:'Workflow not found'}` (`:889-895`).
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
- Callers: the execute route (`nStepWorkflows.js:898`), the cron scheduler (`cronSchedulerService.js:432`) and the visual workflow executor (`visualWorkflowExecutor.js:653`, in its `executeWorkflow(workflowId)` method at `:609`).
- `runId = WFRUN-<Date.now()>-<uuid first 8 chars>` (`:16`).
- Loads the workflow (throws `Workflow N not found`) and its steps with assets. Throws `No steps found in workflow` if there are none (`:52-54`).
- Inserts `n_step_workflow_runs` with status `running`.
- Steps run **sequentially by `step_index`**. The `is_active` flag is ignored; every step runs.
- Per step it inserts `n_step_workflow_run_steps` (status `running`). A step with no assets is marked `completed` and skipped (`:90-99`).
- Assets in a step run in **parallel** with `Promise.all` (`:107-143`).
  - `mapping` calls `executeTransformationJob(pool, asset_id, triggeredBy, {workflowExecutionId: runRecordId, scheduleId: options.scheduleId||null})` and then returns `{success:true,...}` without looking at the result (`:110-119`).
  - `mapping_group` calls `executeMappingGroup(asset_id, 10, triggeredBy, {...})` and returns `{success:true,...}` (`:121-130`). The concurrency is the literal 10 ("default concurrency", `:123`). Because the value is truthy, it always wins over the group's own `max_concurrency` (`mappingGroupExecutionEngine.js:41`: `maxConcurrency || group.max_concurrency || 10`).
- A thrown asset error is caught and recorded as `{success:false}` (`:132-139`).
- Neither call's returned status is inspected. `executeTransformationJob` returns `{status:'failed'}` without throwing in its failure paths (`jobExecutionEngine.js:1471-1473`). `executeMappingGroup` counts a member whose job returned `status:'failed'` as completed (`mappingGroupExecutionEngine.js:104-124`), sets `finalStatus = failedCount > 0 ? 'completed' : 'completed'` (`:160`) and returns `success:true` (`:202-203`). So an asset counts as failed only when a call throws (group not found, no members, or an engine exception). A job that ends `failed` does not fail the step or the run, and the next step runs.
- Step status is `failed` if any asset call threw, else `completed` (`:151`). The counters `jobs_count`, `jobs_completed` and `jobs_failed` are stored, plus `duration_ms`.
- If any asset failed, the run is set to `failed` with `error_message = "Step N failed: X asset(s) failed"` and the loop stops. Later steps get no run-step rows. The error is re-thrown, and the catch overwrites the run row again (`:212-224`).
- If every step succeeds, the run is `completed`.
- No retries. No alert emitted (unlike the dependency engine).
- `triggeredBy` is the numeric `req.user.id` (or the fallback 1). `options.scheduleId` is used when a schedule calls this function. The cron caller passes `{scheduleId: schedule.id}` (`cronSchedulerService.js:432-436`), and only when no active `visual_workflows` row has that id (`:421-430`, `is_active = true`); otherwise `VisualWorkflowExecutor.execute()` runs instead (`:428-429`).

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
- Not validated: that `entity_id` exists, that `depends_on` points to a step in the same workflow, that there are no cycles, and that the retry values are non-negative. The workflow is not checked by the route. `workflow_steps.workflow_id` has a FK to `business_processes(id)` (`..._1767956647766.sql:7987`), so a non-existent workflow fails the insert and the catch returns 500 `{success:false,error:'Failed to create workflow step'}` (`:133-138`), not a validation error.
- The INSERT column list has no `project_id` (`:120-125`), while `workflow_steps.project_id` is `NOT NULL` in the production dumps (`..._1767956647766.sql:7268`) and the migration sets it NOT NULL (`addProjectIdToResources.js:121`). The only INSERT into `workflow_steps` is `workflowSteps.js:121`, the dumps have no trigger on that table, and the migration sets no default. So against the production schema this route fails on every call with the 500 above. See BUG 3.
- Output: 201 `{success,step}`.

### PUT /steps/:id
`:143-225`
- Dynamic update of any provided field. 400 'No fields to update' if none. 404 if not found.
- `step_type` is not re-validated on update (the POST check is missing here).

### DELETE /steps/:id
`:228-256`
- Hard delete. 404 if not found.
- Dependents' `depends_on` is set to NULL by the FK (`workflow_steps_depends_on_fkey ... ON DELETE SET NULL`, `..._1767956647766.sql:7986`; `workflowOrchestration.js:54`). The route does not touch them. A `workflow_executions.current_step_id` FK to `workflow_steps(id)` has no ON DELETE clause (`..._1767956647766.sql:7979`), so deleting a step that an execution row points to fails; the route's catch returns 500 `Failed to delete workflow step` (`workflowSteps.js:249-254`). The engine sets `current_step_id` at `workflowOrchestrationEngine.js:210-214`, so a step that has run is blocked. Under `database_ddl_2026-01-07.sql` there are no ON DELETE clauses at all, so that file gives a different outcome (see "FK and cascade rules").

### POST /workflow/:workflowId/execute
`:259-299`
- Auth: `req.user.permissions.includes('workflow:execute')`, else 403 `{error:'Access denied',message:...}` (`:262-266`). There is no project check.
- `triggered_by` is taken from the request body, not from `req.user` (`:270`).
- Fire-and-forget `executeWorkflow(parseInt(workflowId), triggered_by)`. Returns 202 `{success,message:'Workflow execution started',workflowId}`.
- The `.then` always logs 'Workflow execution completed' even when `result.success === false`.
- The 202 is returned before the engine runs, so engine failures (see BUG 20) are not visible to the caller.

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
- Callers: only `workflowSteps.js:273`. A repo-wide grep of `backend/` finds no other call of this `executeWorkflow` (`visualWorkflowExecutor.js:609` defines its own method of the same name, which calls the N-step engine).
- `executionId = WORKFLOW-<Date.now()>-<uuid8>`.
- The workflow is read from `business_processes`. Throws `Workflow N not found` or `No steps found`.
- Inserts `workflow_executions` (status `running`, `total_steps`, `triggered_by`) (`:178-183`). The column list is `workflow_id, execution_id, status, total_steps, triggered_by, start_time` and has no `project_id`; against the production schema this insert throws (see BUG 20), so nothing after it runs.
- Graph: roots are steps whose `depends_on` is falsy. A step with a `depends_on` is a dependent of that single parent (`:18-47`).
- Level-by-level:
  - All steps in the current level run in parallel (`:206`). `current_step_id` is overwritten for each, so it shows only the last writer.
  - Retry per step (`executeStep`, `:57-130`): `maxRetries = retry_count || 3`, `retryDelay = retry_delay_seconds || 60` seconds, a `setTimeout` wait between attempts. A value of 0 is replaced by the default.
  - Attempts run `1..maxRetries`. The value is "max attempts", not "retries after the first". `retry_count=3` means 3 attempts total.
  - A step succeeds when the call does not throw (`:71-95`). A returned `{status:'failed'}` from `executeTransformationJob` is not inspected, so it is neither retried nor treated as a step failure. `executeMappingGroup` returns `success:true` even when members failed (see N-step engine section).
  - A negative `retry_count` (the route does not validate it) is truthy, so `maxRetries` is negative, the loop `for (attempt=1; attempt<=maxRetries ...)` never runs, `lastError` stays null, and `lastError.message` (`:128`) throws a TypeError. That propagates through the level's Promise.all to the outer catch.
  - If any step in a level fails after the retries, the whole run is aborted. The status becomes `failed` with the message 'Workflow aborted due to step failures after retries'. The other steps in the same level still ran to completion. An alert is emitted via `alertAggregationWorker.onWorkflowCompleted(workflowId, executionId, 'failed')` through `setImmediate`.
  - The next level is the dependents of the finished steps whose parent is in `completedSteps` (`:307-318`).
- Final state: `completed` with `completed_steps`, `duration_ms`. An alert 'completed' is emitted. An exception path sets `failed` with `error.message` and emits an alert.
- The exception path updates the row only `if (executionRecordId)` (`:388`). When the initial insert itself throws, `executionRecordId` is still null, so no failed row is written and no alert is emitted.
- The return value (the route ignores it) has `success, executionId, executionRecordId, totals, stepResults`.

## FK and cascade rules (outcome per source)
- **Production dumps** (`attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql` and `..._1767956647766.sql`; the FK lines at 7601-7626, 7774, 7976-7987 match in both):
  - `n_step_workflow_steps.workflow_id` -> `n_step_workflows(id)` ON DELETE CASCADE (`:7619`).
  - `n_step_workflow_assets.step_id` -> `n_step_workflow_steps(id)` ON DELETE CASCADE (`:7603`).
  - `n_step_workflow_run_steps.run_id` -> `n_step_workflow_runs(id)` ON DELETE CASCADE (`:7608`).
  - `n_step_workflow_runs.workflow_id` -> `n_step_workflows(id)` with NO ON DELETE clause (`:7614`). Deleting a workflow that has runs fails.
  - `transformation_jobs.workflow_execution_id` -> `n_step_workflow_runs(id)` ON DELETE SET NULL (`:7774`).
  - `n_step_workflows.project_id` -> `projects(id)` ON DELETE CASCADE (`:7624`); `sub_project_id` -> `projects(id)` ON DELETE SET NULL (`:7626`).
  - `workflow_steps.workflow_id` -> `business_processes(id)` ON DELETE CASCADE (`:7987`); `depends_on` -> `workflow_steps(id)` ON DELETE SET NULL (`:7986`); `project_id` -> `projects(id)` ON DELETE CASCADE (`:7985`).
  - `workflow_executions.workflow_id` -> `business_processes(id)` ON DELETE CASCADE (`:7980`); `current_step_id` -> `workflow_steps(id)` with no ON DELETE clause (`:7979`).
  - `workflow_steps.project_id` is `int4 NOT NULL` with no default (`:7268`). `workflow_executions.project_id` is `int4 NOT NULL` with no default (Jan_05 dump `:7242`; `addProjectIdToRemainingTables.js:197` sets NOT NULL).
- **Migrations**: `workflowOrchestration.js:50,54,115,118` creates `workflow_steps.workflow_id` ... ON DELETE CASCADE, `depends_on` ... ON DELETE SET NULL, `workflow_executions.workflow_id` ... ON DELETE CASCADE and `current_step_id` with no ON DELETE. This agrees with the dumps. `addProjectIdToResources.js:98-141` adds `workflow_steps.project_id`, backfills it, sets NOT NULL and adds `fk_workflow_steps_project`. The `n_step_*` tables are not created by any file in `backend/migrations/` (grep found none), so no migration evidence exists for them.
- **`database_ddl_2026-01-07.sql`**: the FKs (for example `:3335-3349`, `:3611-3615`) have no ON DELETE clauses, so this file does not show the cascades above. It is not consistent with the production dumps and is not used as evidence for cascade outcomes here.

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
2. `workflowOrchestrationEngine.js:78` calls `executeMappingGroup(id, null, triggeredBy)`. `null` is passed as `maxConcurrency`. The signature default of 10 applies only for `undefined` (`mappingGroupExecutionEngine.js:22`), but the engine then computes `maxConcurrency || group.max_concurrency || 10` (`:41`), so `null` falls through to the group's own `max_concurrency`, else 10. The `null` itself is harmless.
3. `workflowSteps.js:21` joins `projects p ON ws.project_id`, but the POST insert (`:120-125`) never writes `project_id`. In the production dumps `workflow_steps.project_id` is `NOT NULL` with no default (`..._1767956647766.sql:7268`), and the migration sets NOT NULL (`addProjectIdToResources.js:121`) with no default. No trigger on `workflow_steps` exists in the dumps and the only INSERT into the table is `workflowSteps.js:121`. So POST /workflow/:workflowId/steps fails on every call against the production schema with a NOT NULL violation, and the route returns 500 `Failed to create workflow step`.
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
14. Failed jobs do not fail the workflow. `nStepWorkflowExecutionEngine.js:110-119` returns `success:true` for any `executeTransformationJob` call that does not throw, but that function returns `{status:'failed'}` without throwing (`jobExecutionEngine.js:1471-1473`). `mappingGroupExecutionEngine.js:104-124` counts such a job as completed, `:160` is `failedCount > 0 ? 'completed' : 'completed'`, and `:202-203` returns `success:true`. The dependency engine has the same gap (`workflowOrchestrationEngine.js:71-95`): no retry and no abort on a returned failure.
15. `workflowOrchestrationEngine.js:60,128`: a negative `retry_count` makes `lastError` null and `lastError.message` throws a TypeError (see the dependency engine section). The route does not validate retry values.
16. `nStepWorkflows.js:657` and `:843`: `a.asset_id::integer` is applied to a `varchar(255)` column. A stored `mapping_group` asset with a non-numeric `asset_id` breaks the count query for its step (asset add and expanded-count return 500), since `asset_id` is not validated on insert.
17. `nStepWorkflowExecutionEngine.js:123`: the literal 10 overrides each group's own `max_concurrency`.
18. `nStepWorkflows.js:536-554`: `previous` deactivates the current step before looking up `step_index-1`. If that row is missing, the response is `success:true` with `activeStep` undefined and no step is active.
19. `src/pages/Workflows.jsx:46,88,108` calls `/api/workflow-steps/workflow/${workflow.id}/steps`, `/api/workflow-steps/workflow/${workflowId}/execute` and `/api/workflow-steps/steps/${step.id}` with workflow ids loaded from `/api/n-step-workflows` (`:33`). The workflow-steps API takes `business_processes` ids (FK `workflow_steps_workflow_id_fkey`, `..._1767956647766.sql:7987`), so the ids belong to a different table. `src/pages/WorkflowForm.jsx:65,123,153` calls `GET /api/workflow-steps?workflow_name=...`, `POST /api/workflow-steps` and `DELETE /api/workflow-steps/:id`. The router has no `POST /` and no `DELETE /:id`, and `GET /` ignores the query (`workflowSteps.js:17-37`). `NStepWorkflows.jsx` (not read) is presumably the real N-step client.
20. `workflowOrchestrationEngine.js:178-183`: the `INSERT INTO workflow_executions` lists `workflow_id, execution_id, status, total_steps, triggered_by, start_time` and omits `project_id`. `workflow_executions.project_id` is `int4 NOT NULL` with no default (Jan_05 dump `:7242`; `addProjectIdToRemainingTables.js:197`). So every dependency-workflow execution throws a NOT NULL violation at the insert. `executionRecordId` is still null, so the catch (`:388`) writes no failed row and emits no alert. The route has already returned 202 (`workflowSteps.js`, execute), so the user sees success and only a log line shows the failure. Together with BUG 1, the dependency engine is broken at two points.

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
1. The frontend `workflowService.ts` calls `/workflow-steps` with POST (`:84`), but the router has no `POST /` route. The only backend route is `POST /workflow/:workflowId/steps`. Whether the call is reachable was not checked. See Open questions. (`WorkflowForm.jsx:123` makes the same call, see BUG 19.)

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
1. (Closed) No trigger or other writer fills `workflow_steps.project_id`; see BUG 3.
2. Which frontend page calls `/workflow-steps` through `workflowService.ts:46-84`? The page-to-API mapping for `WorkflowManager.jsx`, `NStepWorkflows.jsx` and `archived/WorkflowBuilder.jsx` was not traced.
3. What does `visualWorkflowExecutor.js:653` pass to `executeNStepWorkflow`? It passes `this.userId`; its options were not read. (The cron call is answered above.)
4. How `req.user.permissions` is populated and which roles hold `workflow:execute` / `workflow:write` (AUTH area).
5. How `authorizeProjectResource` resolves `workflow:write` for non-admins (middleware not read beyond the `requireProjectAccess` call and the lines cited in POST /).
6. Intended semantics of `retry_count`: attempts or retries after the first? Code treats it as total attempts (`workflowOrchestrationEngine.js:60`).
7. Whether the step 1 insert in POST / and the "first step cannot be deleted" rule are intended (no rule exists in DELETE step).
8. Which of the production dumps and `database_ddl_2026-01-07.sql` matches the live database? They disagree on ON DELETE clauses.
