# VWF verify (final, after fix round 2)

Verdict: PASS (checked ~48, wrong 0, unsupported 0, missing entry points 0).

## Coverage
All 11 HTTP routes in inventory (visualWorkflows.js:17,71,129,166,210,239,385,447,484,504,537) have subsections. The mount at server.js:5337 and the audit mapping at auditMiddleware.js:64 are correct. The scheduler entry (cronSchedulerService.js:416-443) now has its own subsection.

## Round-2 items, re-read from code
- Job engine failed returns: status lines at jobExecutionEngine.js:1473, 1661 and 1750, with the returns at :1471, :1659 and :1748. CORRECT. The :1473 return follows the "no files matched" audit block (:1425). CORRECT.
- Success return at :2322-2329 (`status: finalStatus` at :2324), and `finalStatus` at :2199 is only `completed` or `completed_with_warnings`. CORRECT. `jobId` is at :2323. CORRECT.
- Quality abort: `updateJob` sets `status 'failed'` at :3899-3900, DQ_ABORT is thrown at :3919, and `throw error` at :2482 rethrows it, so it becomes a node error. CORRECT.
- Concurrency check is a DB check on visual_workflow_executions (visualWorkflows.js:268-281). CORRECT. The execution_logs row is inserted at :290-297, before the executions row, which is created inside `execute()`. The non-atomic claim is CORRECT.
- successRate is `(successCount/totalNodes*100).toFixed(2)` at executor:877, and the number 0 when empty. CORRECT.
- nodeStatuses includes `jobId` and `executedMappings` (executor:857-858). CORRECT.
- Scheduler (cronSchedulerService.js:416-443):
  - The workflow branch checks `visual_workflows ... is_active = true` (:421-424), runs the executor with `execute()` (:428-429) and otherwise `executeNStepWorkflow` (:432). CORRECT.
  - The `visual_mapping` branch runs `new VisualWorkflowExecutor(null, userId).executeMapping(...)` (:442-443). CORRECT.
  - There is no permission, creator-only or 409 check in this path. CORRECT.
  - No execution_logs write: the table is written only in routes/visualWorkflows.js (:290, :331, :345, :557, :564). CORRECT.
- Nested workflow: `success: result.success` (executor:629-630). CORRECT. The nested executor is built at :626 with no depth guard. CORRECT. The `execute()` call creates its own executions row (:34-46) and the route's 409 check is not involved. CORRECT. The `workflows` fallback has no `is_active` filter (:639-642) and returns `success:true` (:656). CORRECT.
- Open question 3 is now properly narrowed.

## Other claims checked, all CORRECT
- Admin and non-admin scoping on GET / and GET /:id (:17-69, :71-127), including the duplicated inline subquery (:102-108).
- POST and PUT: the 400 checks, `validateGraph`, `description || ''`, and `created_by` in the PUT WHERE clause (:183). DELETE soft delete with a creator-only WHERE clause (:215).
- Execute route:
  - The 403 permission check (:242), the creator-only 404 (:253), the unused `async` param (:250), and `setImmediate` (:300).
  - The response body (:364-372), the unwrapped catch UPDATE (:343-360), and the 500 leaking `error.message` (:380).
- Execution-status, running-execution and execution-logs: the ISO conversion and the `completed` to `success` mapping (:522). The POST execution-logs isNaN check (:546-548), upsert (:557-561) and insert-only prune (:570-579).
- `validateGraph`: the key `${node.type}-${node.data?.assetId}` (:637), DFS cycle detection, and POST /validate returning 200 whether valid or not.
- Executor:
  - An empty workflow returns `completed` (:59-63), and the final status is set at :79.
  - `completed.add` runs after `executeNode` (:237-242). `topologicalSort` throws on a cycle (:192).
  - The node-type switch (:334-356), the missing-assetId error string (:306-317), and start/stop skipped (:289).
  - `executeMappingGroup(id, this.userId)` against the engine signature `(groupId, maxConcurrency, triggeredBy, options)` (mappingGroupExecutionEngine.js:22). The engine returns `success:true` with `completed`, `failed` and `totalMappings` (:202-213), so `executedMappings` is always 0.
  - `jobResult.job_id` (:582) against the engine's `jobId`.
  - The summary counts (:821-842), and `catch` calling `updateExecutionRecord` (:100) with `WHERE id = $7`.
  - `executeVisualWorkflow` is unused (executor:883 and the route import at :5).

## Minor gaps (not blocking, not WRONG)
- The route's background log builder (visualWorkflows.js:311-320) reads `status.reason` and `status.error`. nodeStatuses uses `skipReason` and has `error` only on thrown errors. Skipped nodes therefore always log "Decorative node", and failed-result nodes (Jira, email, mapping-group with `success:false`) log "Unknown error". The notes do not mention this.
- `err.code`-style details of the notification and Jira sections (executor:673-819) were not re-read line by line. The cited lines were spot-checked only through the summary logic.
- Non-numeric id 500s are inferred from the absence of a check, not from the column type.

## Full-file rewrite
Nothing from earlier rounds was lost. The flags, entry points, data touched and domain terms are all present.
