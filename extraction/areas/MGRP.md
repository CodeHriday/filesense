# MGRP - Mapping groups

## Summary
A mapping group is a named set of transformation mappings with an `execution_order` and a `max_concurrency`. Executing a group runs its members in batches of `max_concurrency` through `executeTransformationJob`. All 13 HTTP routes are in backend/routes/mappingGroups.js, mounted at `/api/mapping-groups` behind `authenticateToken` (server.js:5244). The engine is backend/services/mappingGroupExecutionEngine.js. The engine is also called by the scheduler (cronSchedulerService.js:410) and n-step workflows (nStepWorkflowExecutionEngine.js:121); those callers belong to other areas.

Common auth for routes using `authorizeProjectResource({resourceType:'mapping_group', requiredPermissions})` (authorizeProjectResource.js:40-122):
1. Layer 1, project membership (requireProjectAccess.js:44-113). The project is looked up from `SELECT project_id FROM mapping_groups WHERE id = $1` (requireProjectAccess.js:252-254). It returns 400 "Project context required" if none is found (:55-62). Admin bypass applies when `userHasAllProjectAccess(req.user)` (:66). Otherwise the user must be in `project_members` or in a group linked through `project_access_groups`, for the project or its parent (:80-102). On failure it returns 403 "You are not a member of this project" (:111).
2. Layer 2, global permission. Skipped for admin bypass. Otherwise the user must hold every required permission string (`resource:action`) (authorizeProjectResource.js:91-115). On failure it returns 403.
3. Layer 3, the policy engine, runs only if `enforcePolicies` is set (:127). It is not set in this area, so it is not used.

## Entry points

### GET /api/mapping-groups/ (mappingGroups.js:19)
- Auth: authenticateToken only. There is no permission check, only project filtering.
- Input: no query parameters are read. The frontend sends `project_id` (useMappingGroups.js:13), but the server ignores it.
- Rule: `userHasAdminAccess(req.user)` returns all groups (:24, :51). Otherwise it uses the projects from `getUserProjects` and filters with `mg.project_id = ANY($1)` (:52). A user with no projects gets `{success:true, groups:[]}` (:31-37).
- Output: `{success, groups}`. Each row has `mg.*`, `mapping_count` (join count), `execution_count` (subquery) and `project_name`, ordered `created_at DESC` (:40-55).
- Error: 500 "Failed to fetch mapping groups".

### GET /api/mapping-groups/:id (:74)
- Auth: `mapping_group:read`.
- Output: the group row spread at the top level, plus `mapping_count`, the aliases `group_name` (= name) and `concurrency_limit` (= max_concurrency), and `members` (:108-115). Members are joined to `transformation_mappings` on `mapping_id` and ordered `execution_order ASC, id ASC` (:100-106).
- 404 "Mapping group not found" if absent (:92-97). Because the auth middleware looks up the project first, a missing id would normally return 400 "Project context required" before reaching this 404.
- Note: this route is declared before `/init-data` (see Flags).

### POST /api/mapping-groups/ (:129)
- Auth: `mapping_group:write`. The project comes from `body.project_id` and is required (throws if missing, :135). It is parsed with `parseInt(...,10)` (:138). A thrown error from this function is not clearly mapped to a status code. UNCLEAR, see Open questions.
- Input: `name` (required, else 400 "Name is required", :146), `description`, `max_concurrency` (default 10), `created_by` (taken from the body), `sub_project_id` (default null).
- Side effect: INSERT into `mapping_groups` (:153-157). The status default 'active' comes from the migration.
- Output: 201 `{success, group}`.
- Validation: none on `max_concurrency` type or range.

### PUT /api/mapping-groups/:id (:175)
- Auth: `mapping_group:write`.
- Input: any of `name`, `description`, `max_concurrency`, `status`, `sub_project_id`, applied as a partial update (:183-209). `project_id` cannot be changed (:205). No fields gives 400 "No fields to update". `updated_at = CURRENT_TIMESTAMP` is set. 404 if no row is updated. `status` has no validation.
- Output: `{success, group}`.

### DELETE /api/mapping-groups/:id (:253)
- Auth: `mapping_group:write` (not a separate delete permission).
- Hard `DELETE ... RETURNING *` (:262). Members and executions are removed through ON DELETE CASCADE (workflowOrchestration.js:37, :94). 404 if none.
- Output: `{success, message}`.

### GET /api/mapping-groups/:id/members (:292)
- Auth: `mapping_group:read`. Returns `{success, members}` with the same join and order as the GET by id (:301-307).

### POST /api/mapping-groups/:id/members (:326)
- Auth: `mapping_group:write`.
- Input: `mapping_id` (required, else 400), `execution_order` (default 0).
- INSERT into `mapping_group_members` (:343). A unique violation (23505) returns 409 "Mapping already exists in this group" (:361). The UNIQUE is (group_id, mapping_id) (workflowOrchestration.js:41). The response is 201 `{success, member}`.
- No check that the mapping belongs to the same project as the group. SECURITY, see Flags.

### DELETE /api/mapping-groups/:id/members/:memberId (:376)
- Auth: `mapping_group:write`.
- Deletes by `id = memberId AND group_id = id` (:385-389). 404 "Group member not found". Output: `{success, message}`.

### PUT /api/mapping-groups/:id/members (:421)
- Auth: `mapping_group:write`.
- Input: `members` must be an array, else 400 (:433). Each item is `{mapping_id, execution_order}`.
- Transaction: BEGIN, delete all members of the group, insert each, COMMIT (:441-455). On error ROLLBACK and 500 "Failed to update members". Output: `{success, message, count}`.
- No validation of items. A missing `execution_order` inserts NULL (it does not use the column default). Duplicate `mapping_id` values hit the unique constraint, which rolls back and returns 500, not 409.
- `await client.query('ROLLBACK')` in the catch (:468) is also reached if `pool.connect()` succeeded but BEGIN was never run. This is harmless. If `pool.connect()` itself fails (:427, outside the try), the error is unhandled.

### POST /api/mapping-groups/:id/execute (:483)
- Auth: `mapping_group:execute`.
- Flow: read `max_concurrency` from the group (404 if absent, :493-503). `triggered_by = req.user?.id || req.body?.triggered_by` (:506). It calls `executeMappingGroup(parseInt(id), max_concurrency, triggered_by)` without awaiting (fire-and-forget, :509). It responds 202 `{success, message:'Mapping group execution started', groupId}` (:523). The caller gets no executionId. Failures are only logged (:516-521).
- Engine rules (mappingGroupExecutionEngine.js):
  - `executionId = GROUP-<Date.now()>-<uuid first 8 chars>` (:24).
  - `concurrency = maxConcurrency || group.max_concurrency || 10` (:41).
  - Members are joined to `transformation_mappings` and ordered by `execution_order, id` (:44-51). Zero members throws "No mappings found" (:55-57).
  - It inserts an execution row with status 'running', `total_mappings`, `triggered_by`, `start_time` and `project_id` from the group (:68-73).
  - Batches are `mappings.slice(i, i+concurrency)` run with `Promise.all` (:83-153). The next batch starts only after the whole batch finishes. `execution_order` therefore only sets batch composition; members in the same batch run in parallel regardless of order.
  - Each member calls `executeTransformationJob(pool, mapping.mapping_id, triggeredBy, {mappingGroupExecutionId, workflowExecutionId, scheduleId})` (:104-108). A failing member is caught, counted in `failedCount`, and does not stop the others (:126-149). Progress counters are updated after each member (:113-117, :137-141).
  - The final status is always 'completed' if the loop finishes, even when members failed (:160). A 'failed' status is set only if the engine itself throws, with `error_message` (:228-236).
  - After the run it fires `alertAggregationWorker.onMappingGroupCompleted(groupId, 'completed'|'failed')` via `setImmediate`, ignoring errors (:184-200, :239-255).
- Triggered the same way by the scheduler (cronSchedulerService.js:410) and n-step workflows (nStepWorkflowExecutionEngine.js:121). Their handling is out of scope.

### GET /api/mapping-groups/:id/executions (:541)
- Auth: authenticateToken only. There is no project membership or permission check. SECURITY.
- Input: `limit` query parameter, `parseInt(limit) || 50` (:544). No upper bound.
- Output: `{success, executions}`, which are `mge.*` plus `group_name`, ordered `created_at DESC LIMIT $2` (engine :299-308). A non-numeric id: `parseInt` gives NaN, which fails in the query and returns 500.

### GET /api/mapping-groups/:id/executions/:executionId (:562)
- Auth: authenticateToken only. SECURITY: no check at all, and `:id` is ignored (:564). Looks up `mge.id = executionId`, so any execution can be read through any group id.
- Output: `{success, execution}` (engine :267-282). If not found, the engine throws and the route returns 500 "Failed to fetch execution status", not 404.

### GET /api/mapping-groups/init-data (:587)
- Auth: authenticateToken only, with an inline project check.
- Intended behaviour: `?groupId=` is optional. It returns `{success, projects (top-level parent projects only), transformations (non-temporary: is_temporary IS NULL OR false), group, members}`. Non-admin users are filtered to their accessible projects. A user with no projects gets empty data. In edit mode a non-admin whose project is not accessible gets 403 (:677-682). The group-access check is skipped if `group.project_id` is falsy.
- Called by src/pages/MappingGroupForm.jsx:38.
- Reachability: see Flags (shadowed by `/:id`).

### FE: /mapping-groups (src/pages/MappingGroups.jsx; App.jsx:425 per inventory)
- Lists groups with `useMappingGroups`. Shows `group.max_concurrency || group.concurrency_limit` (:237). Execute uses `useExecuteMappingGroup`, and the result is shown in `ExecuteModal` (:43-62). Delete shows a confirm modal. The delete button is gated by `useDeletePermission('mapping_groups')` (:13). The edit link is `/mapping-groups/<id|group_id>/edit` (:255). Hooks are in src/hooks/useMappingGroups.js. The execute mutation invalidates `QueryKeys.jobs.all`, not the group queries (useMappingGroups.js:122).

### FE: /mapping-groups/create and /:groupId/edit (src/pages/MappingGroupForm.jsx; App.jsx:426-427 per inventory)
- Default `concurrency_limit: 5` (:20). The slider has min 1 and max 10 (:246-247), while the API default is 10 and has no limit.
- Edit: PUT the group (:104-108), then PUT `/members` (:118). Create: POST the group (:123), then POST each member one by one (:135). It is not atomic: a failed member insert leaves a group without members.
- Navigates to `/mapping-groups` afterwards (:142).

## Data touched
- `mapping_groups`: id, name, description, max_concurrency (default 10), created_by (UUID per the migration), status (default 'active'), timestamps (workflowOrchestration.js:20-29). `project_id` is NOT NULL, added with a backfill (addProjectIdToRemainingTables.js:43-77). `sub_project_id` is written at mappingGroups.js:154, and its column definition was not found in the files read.
- `mapping_group_members`: group_id, mapping_id, execution_order, UNIQUE(group_id, mapping_id). `mapping_id` was later changed to VARCHAR(255) and re-pointed at `transformation_mappings(mapping_id)` (fixMappingGroupMembersSchema.js:3-6, :30-40).
- `mapping_group_executions`: status CHECK in running/completed/failed/cancelled, counters, times, `triggered_by INTEGER`, `error_message`, `project_id` (workflowOrchestration.js:92-107; addProjectIdToRemainingTables.js:137-160).
- Read: `transformation_mappings`, `projects`, `project_members`, `user_groups`, `project_access_groups`.
- Other code touching these tables: adminCleanupRoutes.js:55, :291-292, :373; connectionRoutes.js:829, :937 (connection dependency checks).

## Flags
- BUG: `GET /init-data` is registered after `GET /:id` (mappingGroups.js:74 vs :587). Express matches `/:id` first with id='init-data'. `authorizeProjectResource` then runs `SELECT project_id FROM mapping_groups WHERE id = $1` with a non-numeric string (requireProjectAccess.js:254). This most likely errors (500 "Authorization failed", or an error inside the lookup). The form's edit and create loading therefore likely fails. Not run, so inferred from the code.
- BUG: `finalStatus = failedCount > 0 ? 'completed' : 'completed'` (engine :160). A group where every member failed is still 'completed'. The 'failed' and 'cancelled' statuses are never set for member failures, and 'cancelled' is never set anywhere in this area.
- BUG: Race in counters. `completedCount++` and `failedCount++` are shared across parallel members. Each member does a separate UPDATE, and the failure UPDATE writes only `failed_mappings` (engine :113-141). This is a minor issue in a single-threaded runtime, but an UPDATE can land out of order.
- BUG: `GET .../executions/:executionId` returns 500 instead of 404 when the execution is missing (engine :276-278 throws, route :574).
- BUG: The migration declares `mapping_group_members.mapping_id` as INTEGER referencing `transformation_mappings(id)` (workflowOrchestration.js:38). A later migration changes it to VARCHAR referencing `mapping_id`. The code only works if both migrations run in that order.
- BUG: `PUT /:id/members` writes `member.execution_order` without a default. A missing value gives NULL, not 0 (:451). It also returns 500 on duplicates, while POST members returns 409.
- BUG: In the engine, `triggered_by` is stored in an INTEGER column (workflowOrchestration.js:103), but `created_by` on the group is UUID (:25). If user ids are UUIDs (the `created_by` UUID suggests so), the insert would fail. UNCLEAR which type `req.user.id` is.
- SECURITY: `GET /:id/executions` and `GET /:id/executions/:executionId` have no project or permission check (mappingGroups.js:541, :562). Any authenticated user can read any group's execution history, and any execution by id.
- SECURITY: `GET /` requires no permission, only project filtering (:19). Note `GET /` and `/init-data` use `userHasAdminAccess`, while the middleware uses `userHasAllProjectAccess`. These are two different admin tests (:24, :592 vs requireProjectAccess.js:66).
- SECURITY: `POST /:id/members` and `PUT /:id/members` accept any `mapping_id`. They do not check that the mapping belongs to a project the user can access, or to the same project as the group (:334-347, :447-452). Executing the group then runs that mapping.
- SECURITY: `POST /` takes `created_by` from the body (:143). It can be spoofed. `execute` accepts `triggered_by` from the body as a fallback (:506), but `req.user.id` takes precedence.
- SECURITY: The `sub_project_id` on POST and PUT is not verified to be a child of the project. The `status` on PUT is unvalidated.
- DUPLICATE: Group and member fetch queries are copy-pasted three times: GET /:id (:83-106), GET /:id/members (:301-307) and init-data (:657-670). Admin check differs between the list endpoint (`userHasAdminAccess`) and the middleware (`userHasAllProjectAccess`).
- DUPLICATE: Field aliases `name`/`group_name` and `max_concurrency`/`concurrency_limit`, returned together (:112-113, :685-687). The frontend mixes them (MappingGroups.jsx:237).
- UNCLEAR: The `getProjectId` function throws `Error('project_id is required')` on POST (:135). Whether that returns 400 or 500 depends on requireProjectAccess's catch block, which was not read.
- UNCLEAR: The execute endpoint does not stop a second execution of the same group from starting while one is running. No lock or status check was found (:483-538).
- DEAD (partial): The `req.body?.triggered_by` fallback is unreachable when authenticateToken always sets `req.user`.

## Domain terms
- Mapping group (table `mapping_groups`, FE "mapping group"; workflow `step_type = 'mapping_group'`, workflowOrchestration.js:52). Distinct from access group (GRP.md).
- Member (`mapping_group_members`), mapping (`transformation_mappings`, `mapping_id`), also called transformation (init-data's `transformations`, :604).
- `max_concurrency` = `concurrency_limit` = "Concurrency Limit" in the UI.
- `execution_order`: the order in which members are sorted, and so which batch they land in.
- Group execution record: `mapping_group_executions` (`id`), with a text `execution_id` of the form `GROUP-...`. The REST `:executionId` is the numeric `id`, not the text `execution_id`.
- `sub_project_id` / parent project.

## Open questions
1. What does `requireProjectAccess` do when the custom `getProjectId` throws on POST (400, or 500 through the outer catch)? Not read past line 113.
2. Where is the `sub_project_id` column defined on `mapping_groups`? Not found in the files read.
3. What is the type of `req.user.id` (integer or UUID), and does `triggered_by INTEGER` match it? A later migration may have altered the column.
4. Does `/init-data` really fail at runtime because of the route order? It needs a live test. The inventory also marks it as likely shadowed.
5. The semantics of `execution_order` for users: in-batch parallelism means the order is not strictly sequential. Is that intended? The UI says "1 (Sequential)" for a limit of 1.
6. Which permissions (`mapping_group:read`, `:write`, `:execute`) exist in the seed data, and which roles hold them? Not traced (see AUTH/USR).
7. Whether `useDeletePermission('mapping_groups')` matches a backend permission (the backend uses `mapping_group:write` for delete).
