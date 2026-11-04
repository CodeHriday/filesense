# WFL verification (round 3, final, after fix round 2)

Verdict: PASS

Counts: about 45 claims checked, 0 WRONG, 0 UNSUPPORTED, 0 missed behaviours, 0 missing entry points.

## Coverage
All 16 N-step routes and 9 workflow-steps routes in `inventory.md` (lines 480-495, 705-713) have a subsection. The UI routes (`inventory.md:807-809`) are acknowledged as not read. The notes say so openly.

## Round-2 changes
- BUG 20: CORRECT.
  - `workflow_executions.project_id int4 NOT NULL` with no default is at Jan_05 `_1767956647766.sql:7242`. `addProjectIdToRemainingTables.js:197` sets NOT NULL.
  - The INSERT at `workflowOrchestrationEngine.js:178-183` omits `project_id`.
  - The prod dumps have no trigger on the table. Only indexes match the grep. `INSERT INTO workflow_executions` appears once in `backend/`.
  - `executionRecordId` is null at the insert, because it is assigned at `:185`. The catch only updates and alerts under `if (executionRecordId)` (`:388`). Nothing is written and no alert is sent.
  - The route returns 202 before the engine finishes (`workflowSteps.js:273-291`).
- POST / authorizeProjectResource details: all CORRECT.
  - 401 at `authorizeProjectResource.js:52` and `requireProjectAccess.js:40`.
  - Admin bypass at `requireProjectAccess.js:66` uses `userHasAllProjectAccess`.
  - Active-project 403 at `:138-147`, 404 at `:124-133`, 500 catch at `:165-172`, 400 at `:55-62`.
  - `workflow:write` 403 at `authorizeProjectResource.js:110-114`. Admin skip of the permission check at `:91`.
- BUG 3 and POST step failure as fact: CORRECT. The INSERT at `workflowSteps.js:120-125` has no `project_id`. The column is NOT NULL at `:7268`. The catch at `:133-138` returns 500. Open question 1 is closed correctly.
- Cron args: CORRECT. `cronSchedulerService.js:421-437` checks `visual_workflows` with `is_active = true`, then runs the visual executor or `executeNStepWorkflow(workflowIdInt, userId, {scheduleId: schedule.id})`.
- DELETE /steps/:id: CORRECT. The catch at `workflowSteps.js:249-254` returns 500. `current_step_id` is set at `workflowOrchestrationEngine.js:210-214`. The FK has no ON DELETE (`:7979`). `depends_on` is SET NULL (`:7986`).
- Delete citations: CORRECT.
  - `:7619` steps CASCADE.
  - `:7603` assets CASCADE.
  - `:7614` runs.workflow_id has no ON DELETE.
  - `:7986` SET NULL.
  - `:7979` no ON DELETE.
  - The catch at `nStepWorkflows.js:362-366` returns 500.
- Execute 404 restored: CORRECT (`nStepWorkflows.js:889-895`).

## Other spot checks (all CORRECT)
- PUT /:id: inline 403 at `:272-276`, `_` destructured at `:249`, catch with no passthrough at `:319-325`.
- POST /:
  - Step 1 insert at `:224-227`.
  - Returns 200.
  - `created_by` fallback to 1 at `:206`.
- Activate: deactivates all first (`:582-586`), then 404 (`:596`).
- DELETE step: assets are deleted before the workflow check (`:756` vs `:762-772`), then renumber and re-activate.
- Asset POST: the cast is at `:657` inside the CASE. The limit check is at `:669`.
- Engine:
  - Literal 10 at `:123`.
  - `{success:true}` returned without inspecting the result.
  - Step status at `:151`.
  - Callers (grep): `cronSchedulerService.js:432`, `visualWorkflowExecutor.js:653`, `nStepWorkflows.js:898`, `workflowSteps.js:273`.
- Execute 403 shapes (`:880-883`; `workflowSteps.js:263-266`) have no `success` field.
- `triggered_by` comes from the request body (`workflowSteps.js:270`).

## Rewrite loss check
Nothing material was lost. The execute 404 re-check is restored. The negative `retry_count` TypeError, returned-failure-as-success, the cast and the frontend mismatch (BUG 19) are all retained.

## Residual (not defects)
Open questions 2-8 (frontend mapping, AUTH permissions population, which schema dump matches live) are stated honestly as unresolved.
