# MGRP - Mapping groups

## Summary
A mapping group is a named set of transformation mappings with an `execution_order` and a `max_concurrency`. Executing a group runs its members in batches of `max_concurrency` through `executeTransformationJob`. All 13 HTTP routes are in backend/routes/mappingGroups.js, mounted at `/api/mapping-groups` behind `authenticateToken` (server.js:5244). The engine is backend/services/mappingGroupExecutionEngine.js. The engine is also called by other areas (see "Callers of executeMappingGroup" under the execute entry point).

Schema source: where this file cites a table definition it names the source. "Migration" means backend/migrations/*.js. "Prod DDL" means database_ddl_2026-01-07.sql. They disagree in places (see Data touched).

Common auth for routes using `authorizeProjectResource({resourceType:'mapping_group', requiredPermissions})` (authorizeProjectResource.js:40-122):
1. Layer 1, project membership (requireProjectAccess.js:44-113). `extractProjectId` first reads `req.params.projectId`, then `req.query.project_id`, then `req.body.project_id` (requireProjectAccess.js:183-191). Only if none is present does it fall back to `SELECT project_id FROM mapping_groups WHERE id = $1` (requireProjectAccess.js:252-254). A lookup error is caught and returns null (:213-219). It returns 400 "Project context required" if no project is found (:55-62); this comes before the admin bypass, so admins get it too. Admin bypass applies when `userHasAllProjectAccess(req.user)` (:66). Otherwise the user must be in `project_members` or in a group linked through `project_access_groups`, for the project or its parent (:80-102). On failure it returns 403 "You are not a member of this project" (:111). A nonexistent project id also gets this 403 from the membership query (:84-115), so the middleware's own 404 "Project not found" (:124-133) is not reachable. A non-admin also gets 403 "This project is not active" if the target project is inactive (:138-148). Any exception in the middleware gives 500 `{error:'Project access check failed'}` (:165-172).
2. Layer 2, global permission. Skipped for admin bypass. Otherwise the user must hold every required permission string (`resource:action`) (authorizeProjectResource.js:91-115). On failure it returns 403.
3. Layer 3, the policy engine, runs only if `enforcePolicies` is set (:127). It is not set in this area, so it is not used.

Consequence of the order in Layer 1: for every `:id` route, a missing group id gives a null `project_id` and a 400 "Project context required" before the handler runs (admins included). The handler-level 404s for a missing group (GET /:id :92-97, PUT /:id :228, DELETE /:id :267, execute :498) are therefore unreachable unless a `project_id` is supplied in query or body (see the cross-project flag).

## Entry points

### GET /api/mapping-groups/ (mappingGroups.js:19)
- Auth: authenticateToken only. There is no permission check, only project filtering.
- Input: no query parameters are read. The frontend sends `project_id` (useMappingGroups.js:13), but the server ignores it.
- Rule: `userHasAdminAccess(req.user)` returns all groups (:24, :51). Otherwise it uses the projects from `getUserProjects` and filters with `mg.project_id = ANY($1)` (:52). A user with no projects gets `{success:true, groups:[]}` (:31-37). `userHasAdminAccess` is narrower than `userHasAllProjectAccess`, which also includes `all_projects:read` (permissionHelpers.js:60-92).
- Output: `{success, groups}`. Each row has `mg.*`, `mapping_count` (join count), `execution_count` (subquery) and `project_name`, ordered `created_at DESC` (:40-55).
- Error: 500 "Failed to fetch mapping groups".
- Other FE callers of this route: src/components/AssetPalette.jsx:21 and archived/WorkflowBuilder.jsx:772.

### GET /api/mapping-groups/:id (:74)
- Auth: `mapping_group:read`.
- Output: the group row spread at the top level, plus `mapping_count`, the aliases `group_name` (= name) and `concurrency_limit` (= max_concurrency), and `members` (:108-115). Members are joined to `transformation_mappings` on `mapping_id` and ordered `execution_order ASC, id ASC` (:100-106).
- The 404 "Mapping group not found" (:92-97) is unreachable without a `project_id` in query/body: a missing id returns 400 "Project context required" from the middleware first (requireProjectAccess.js:55-61). With `?project_id=<member project>` the handler is reached.
- Note: this route is declared before `/init-data` (see Flags).

### POST /api/mapping-groups/ (:129)
- Auth: `mapping_group:write`. The project comes from `body.project_id` via a custom `getProjectId` and is required (throws if missing, :135). It is parsed with `parseInt(...,10)` (:138). The throw is caught by the outer catch in requireProjectAccess.js:165-172 and returns 500 `{error:'Project access check failed'}`, so a missing `project_id` is a 500, not a 400. `authorizeProjectResource` never settles its inner promise in this case; the response has already been sent, so it only leaks (authorizeProjectResource.js:67-75).
- Input: `name` (required, else 400 "Name is required", :146), `description`, `max_concurrency` (default 10), `created_by` (taken from the body), `sub_project_id` (default null).
- Side effect: INSERT into `mapping_groups` (:153-157). The status default 'active' comes from the migration. `created_by` is a UUID column in the prod DDL (DDL:1569); the FE never sends it (MappingGroupForm.jsx:123-129), so it is stored as NULL. A client that sends a non-UUID `created_by` gets a 500.
- Output: 201 `{success, group}`.
- Validation: none on `max_concurrency` type or range.

### PUT /api/mapping-groups/:id (:175)
- Auth: `mapping_group:write`.
- Input: any of `name`, `description`, `max_concurrency`, `status`, `sub_project_id`, applied as a partial update (:183-209). `project_id` cannot be changed (:205). No fields gives 400 "No fields to update" (:211). `updated_at = CURRENT_TIMESTAMP` is set. 404 if no row is updated (:228; reachable only in the same conditions as above). `status` has no validation.
- Output: `{success, group}`.

### DELETE /api/mapping-groups/:id (:253)
- Auth: `mapping_group:write` (not a separate delete permission).
- Hard `DELETE ... RETURNING *` (:262). The migrations say ON DELETE CASCADE for members and executions (workflowOrchestration.js:37, :94; fixMappingGroupMembersSchema.js:40 for `mapping_id`). database_ddl_2026-01-07.sql emits no `ON DELETE` or `CHECK` clauses anywhere, so it is no evidence either way (FKs at DDL:3325, :3327). The dumps attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql and attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql show `ON DELETE CASCADE` for `mapping_group_executions_group_id_fkey` (line 7586), `mapping_group_members_group_id_fkey` (line 7591) and `mapping_group_members_mapping_id_fkey` (line 7592). Caveat: `transformation_jobs.mapping_group_execution_id` has an FK to `mapping_group_executions(id)` with no ON DELETE action (DDL:3447; Jan_05 dumps line 7771), so deleting a group whose executions have jobs may fail with an FK violation and return 500 "Failed to delete mapping group" (mappingGroups.js:279-288). Not tested against a live DB (see Open questions). 404 if none (:267; same reachability caveat).
- Output: `{success, message}`.

### GET /api/mapping-groups/:id/members (:292)
- Auth: `mapping_group:read`. Returns `{success, members}` with the same join and order as the GET by id (:301-307).

### POST /api/mapping-groups/:id/members (:326)
- Auth: `mapping_group:write`.
- Input: `mapping_id` (required, else 400), `execution_order` (default 0).
- INSERT into `mapping_group_members` (:343). A unique violation (23505) returns 409 "Mapping already exists in this group" (:361). The unique index on (group_id, mapping_id) is in the prod DDL (DDL:4260) and the migration (workflowOrchestration.js:41). The response is 201 `{success, member}`.
- No check that the mapping belongs to the same project as the group. SECURITY, see Flags.

### DELETE /api/mapping-groups/:id/members/:memberId (:376)
- Auth: `mapping_group:write`.
- Deletes by `id = memberId AND group_id = id` (:385-389), arguments `[memberId, id]`. 404 "Group member not found". Output: `{success, message}`.

### PUT /api/mapping-groups/:id/members (:421)
- Auth: `mapping_group:write`.
- Input: `members` must be an array, else 400 (:433). Each item is `{mapping_id, execution_order}`.
- Transaction: BEGIN, delete all members of the group, insert each, COMMIT (:441-455). On error ROLLBACK and 500 "Failed to update members". Output: `{success, message, count}`.
- No validation of items. A missing `execution_order` inserts NULL (it does not use the column default). Duplicate `mapping_id` values hit the unique constraint, which rolls back and returns 500, not 409.
- `await client.query('ROLLBACK')` in the catch (:468) is also reached if `pool.connect()` succeeded but BEGIN was never run. This is harmless. The ROLLBACK itself can throw if the connection is broken. If `pool.connect()` itself fails (:427, outside the try), the error is unhandled.

### POST /api/mapping-groups/:id/execute (:483)
- Auth: `mapping_group:execute`.
- Flow: read `max_concurrency` from the group (404 if absent, :493-503; same reachability caveat). `triggered_by = req.user?.id || req.body?.triggered_by` (:506). It calls `executeMappingGroup(parseInt(id), max_concurrency, triggered_by)` without awaiting (fire-and-forget, :509). It responds 202 `{success, message:'Mapping group execution started', groupId}` (:523). The caller gets no executionId. Failures are only logged (:516-521). The route does not check the group `status`: an inactive group still executes.
- Engine rules (mappingGroupExecutionEngine.js), signature `executeMappingGroup(groupId, maxConcurrency = 10, triggeredBy = null, options = {})` (:22):
  - `executionId = GROUP-<Date.now()>-<uuid first 8 chars>` (:24).
  - `concurrency = maxConcurrency || group.max_concurrency || 10` (:41). Zero falls back to the default. A negative value makes the `for (i += concurrency)` loop (:83) never terminate: the first `slice(0, -k)` is non-empty when there are more than k members, so those members run once; after that `i` decreases and stays below the length, so the loop never ends (each iteration awaits `Promise.all`). A non-numeric string gives a DB error and a 500. Routes pass `max_concurrency` through unvalidated (mappingGroups.js:143, :183).
  - Members are joined to `transformation_mappings` and ordered by `execution_order, id` (:44-51). Zero members throws "No mappings found" (:55-57). This happens before the execution row is inserted, so an empty group leaves no execution record.
  - It inserts an execution row with status 'running', `total_mappings`, `triggered_by`, `start_time` and `project_id` from the group (:68-73).
  - Batches are `mappings.slice(i, i+concurrency)` run with `Promise.all` (:83-153). The next batch starts only after the whole batch finishes. `execution_order` therefore only sets batch composition; members in the same batch run in parallel regardless of order.
  - Each member calls `executeTransformationJob(pool, mapping.mapping_id, triggeredBy, {mappingGroupExecutionId, workflowExecutionId, scheduleId})` (:104-108). A member that throws is caught, counted in `failedCount`, and does not stop the others (:126-149). Progress counters are updated after each member (:113-117, :137-141).
  - The final status is always 'completed' if the loop finishes, even when members failed (:160). A 'failed' status is set only if the engine itself throws, with `error_message` (:228-236). If the progress UPDATE after a successful job throws (:113-117), the catch also increments `failedCount` (:127), so the member is counted both completed and failed. If the UPDATE in the catch (:137) throws, `Promise.all` rejects and the whole group aborts.
  - After the run it fires `alertAggregationWorker.onMappingGroupCompleted(groupId, status)` via `setImmediate`, ignoring errors (:184-200, :239-255). The success path always passes `'completed'` (:186).
- Callers of `executeMappingGroup`: the execute route (mappingGroups.js:509); workflowOrchestrationEngine.js:78 `(id, null, triggeredBy)`; cronSchedulerService.js:410 (passes `null` for concurrency); nStepWorkflowExecutionEngine.js:121 (passes a fixed 10); visualWorkflowExecutor.js:598 `executeMappingGroup(mappingGroupId, this.userId)`. The visual-workflow caller passes `userId` in the `maxConcurrency` position and leaves `triggeredBy` null (see Flags). Their handling is out of scope.

### GET /api/mapping-groups/:id/executions (:541)
- Auth: authenticateToken only. There is no project membership or permission check. SECURITY.
- Input: `limit` query parameter, `parseInt(limit) || 50` (:544). No upper bound.
- Output: `{success, executions}`, which are `mge.*` plus `group_name`, ordered `created_at DESC LIMIT $2` (engine :299-308). A non-numeric id: `parseInt` gives NaN, which fails in the query and returns 500.

### GET /api/mapping-groups/:id/executions/:executionId (:562)
- Auth: authenticateToken only. SECURITY: no check at all, and `:id` is ignored (:564). Looks up `mge.id = executionId`, so any execution can be read through any group id.
- Output: `{success, execution}` (engine :267-282). If not found, the engine throws and the route returns 500 "Failed to fetch execution status", not 404.

### GET /api/mapping-groups/init-data (:587)
- Auth: authenticateToken only, with an inline project check.
- Intended behaviour (never reached, see below): `?groupId=` is optional. It returns `{success, projects (top-level parent projects only), transformations (non-temporary: is_temporary IS NULL OR false), group, members}`. Non-admin users are filtered to their accessible projects. A user with no projects gets empty data. In edit mode a non-admin whose project is not accessible gets 403 (:677-682). The group-access check is skipped if `group.project_id` is falsy.
- Called by src/pages/MappingGroupForm.jsx:38.
- Reachability: the handler at :587 is unreachable. `GET /init-data` matches `/:id` (:74) first with `id='init-data'`; no `project_id` is available, so the lookup `SELECT project_id FROM mapping_groups WHERE id = 'init-data'` (requireProjectAccess.js:254) throws an integer syntax error, which `lookupResourceProject` catches and turns into null (:213-219). The result is 400 `{error:'Project context required'}` (:55-61), before the admin bypass (:66), so admins get it too. If the caller adds `?project_id=N` and is a member, the `/:id` handler runs and fails with 500 "Failed to fetch mapping group".
- Even if reached, the query selects `parent_project_id` (:613, :615), but the prod `projects` table has only `parent_id` (DDL:1746) and no migration adds `parent_project_id`, so it would 500.

### FE: /mapping-groups (src/pages/MappingGroups.jsx; App.jsx:425-427)
- Lists groups with `useMappingGroups`. Shows `group.max_concurrency || group.concurrency_limit` (:237). Execute uses `useExecuteMappingGroup`, and the result is shown in `ExecuteModal` (:43-62). Delete shows a confirm modal. The delete button is gated by `useDeletePermission('mapping_groups')` (:13). The edit link is `/mapping-groups/<id|group_id>/edit` (:255). Hooks are in src/hooks/useMappingGroups.js. The execute mutation invalidates `QueryKeys.jobs.all`, not the group queries (useMappingGroups.js:122).

### FE: /mapping-groups/create and /:groupId/edit (src/pages/MappingGroupForm.jsx; App.jsx:426-427)
- Default `concurrency_limit: 5` (:20). The slider has min 1 and max 10 (:246-247), while the API default is 10 and has no limit.
- The form loads data from `/init-data` (:38), which always fails (see that entry point). It shows "Failed to load form data" (:63) and the project dropdown stays empty, on both create and edit. The sub-project filter `p.parent_project_id === ...` (:78) probably never matches.
- Edit: PUT the group (:104-108), then PUT `/members` (:118). Create: POST the group (:123), then POST each member one by one (:135). It is not atomic: a failed member insert leaves a group without members.
- Navigates to `/mapping-groups` afterwards (:142).

## Data touched
- `mapping_groups`: id, name, description, max_concurrency (default 10), created_by (UUID in the prod DDL, DDL:1569), status (default 'active'), timestamps (workflowOrchestration.js:20-29). `project_id` is NOT NULL, added with a backfill (addProjectIdToRemainingTables.js:43-77). `sub_project_id INTEGER` exists in the prod DDL (DDL:1574) with FK `mapping_groups_sub_project_id_fkey` (DDL:3333); no migration under backend/migrations adds it to `mapping_groups`, so it was added out of band. It is written at mappingGroups.js:154.
- `mapping_group_members`: group_id, mapping_id, execution_order, UNIQUE(group_id, mapping_id) (DDL:4260). `mapping_id` is VARCHAR in the prod DDL (DDL:1560) with FK to `transformation_mappings(mapping_id)` (DDL:3329). The migration's INTEGER definition (workflowOrchestration.js:38) is stale; a later migration changed it (fixMappingGroupMembersSchema.js:3-6, :30-40).
- `mapping_group_executions`: counters, times, `triggered_by INTEGER` (DDL:1551; matches `users.id` INTEGER, DDL:2394), `error_message`, `project_id` (workflowOrchestration.js:92-107; addProjectIdToRemainingTables.js:137-160). The migration has a status CHECK in running/completed/failed/cancelled (workflowOrchestration.js:96). The Jan_05 prod schema dump has the same CHECK (`mapping_group_executions_status_check`, attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql:5380). database_ddl_2026-01-07.sql emits no CHECK clauses at all, so it shows nothing about it. FK cascade: see DELETE.
- Read: `transformation_mappings`, `projects`, `project_members`, `user_groups`, `project_access_groups`.
- Other code touching these tables: adminCleanupRoutes.js:55, :291-292, :373; connectionRoutes.js:829, :937 (connection dependency checks).
- Permissions `mapping_group:read`, `:write`, `:execute` are seeded for the Admin and Data Engineer roles (backend/scripts/seedProductionManual.sql:28, :75).

## Flags
- BUG: `GET /init-data` is registered after `GET /:id` (mappingGroups.js:74 vs :587) and is unreachable; it returns 400 "Project context required" for every user including admins (details under the entry point). The FE form (MappingGroupForm.jsx:38) therefore always fails to load. The handler would also fail on the `parent_project_id` column (:613).
- BUG (schema drift): `/init-data` selects `projects.parent_project_id` (mappingGroups.js:613) but the prod `projects` table has `parent_id` (DDL:1746).
- BUG: `finalStatus = failedCount > 0 ? 'completed' : 'completed'` (engine :160). The group run is marked 'completed' even if every member failed. This has two layers. (a) Members that throw are counted in `failedCount` but do not change the status. (b) The engine treats any non-throwing return of `executeTransformationJob` as success: it increments `completedCount` and records `status:'completed'` (engine :104-124) without reading `jobResult.status`. `executeTransformationJob` returns normally with `status:'failed'` on the no-files path (jobExecutionEngine.js:1471-1476), the schema-drift abort (:1659-1665) and the cross-file schema mismatch (:1748-1754), so those members are counted as completed. A DQ abort is masked differently: :3900 is an `updateJob(... 'failed')` followed by `throw abortError` (:3919); the per-file catch (:2170) swallows it and :2199-2207 overwrites the job to 'completed' (or 'completed_with_warnings'), so that member also returns 'completed' (return at :2322-2329). 'completed_with_warnings' is likewise counted as completed. Consequently `completed_mappings` also over-counts, and the alert event always reports `'completed'` (engine :186). The 'failed' and 'cancelled' statuses are never set for member failures, and 'cancelled' is never set anywhere in this area.
- BUG: Counter double-count: if the progress UPDATE after a successful job throws (engine :113-117), the catch also increments `failedCount` (:127); a failure of the catch UPDATE (:137) rejects `Promise.all` and aborts the whole group.
- BUG: Race in counters. `completedCount++` and `failedCount++` are shared across parallel members. Each member does a separate UPDATE, and the failure UPDATE writes only `failed_mappings` (engine :113-141). This is a minor issue in a single-threaded runtime, but an UPDATE can land out of order.
- BUG: `max_concurrency` has no validation (mappingGroups.js:143, :183). A negative value makes the batch loop never terminate after some members have run once (engine :83); a non-numeric string gives a 500; zero falls back to the default (engine :41).
- BUG: visualWorkflowExecutor.js:598 calls `executeMappingGroup(mappingGroupId, this.userId)`. The user id lands in the `maxConcurrency` parameter (batch size) and `triggeredBy` stays null, so `triggered_by` is lost.
- BUG: `GET .../executions/:executionId` returns 500 instead of 404 when the execution is missing (engine :276-278 throws, route :574).
- BUG: The migration declares `mapping_group_members.mapping_id` as INTEGER referencing `transformation_mappings(id)` (workflowOrchestration.js:38). The prod DDL has VARCHAR referencing `mapping_id` (DDL:1560, :3329). The code only works with the later shape.
- BUG: `PUT /:id/members` writes `member.execution_order` without a default. A missing value gives NULL, not 0 (:451). It also returns 500 on duplicates, while POST members returns 409.
- BUG: `POST /` with a missing `project_id` returns 500 `Project access check failed`, not 400 (mappingGroups.js:135, requireProjectAccess.js:165-172).
- BUG (partial dead code): handler 404s for a missing group (mappingGroups.js:92, :228, :267, :498) and the middleware's "Project not found" 404 (requireProjectAccess.js:124-133) are unreachable in normal use (see Summary).
- SECURITY (cross-project bypass): every `:id` route using `authorizeProjectResource` takes the project from `?project_id=` or `body.project_id` before looking up the real group (requireProjectAccess.js:186-191). A user with `mapping_group:*` permissions and membership in project A can send `project_id=A` for a group in project B and read, edit, delete, change members of, or execute it (routes at mappingGroups.js:74, :175, :253, :326, :376, :421, :483). The Layer 2 permission check is global (authorizeProjectResource.js:91-115). This works for GET, DELETE and execute (query) and for PUT and POST (body).
- SECURITY: `GET /:id/executions` and `GET /:id/executions/:executionId` have no project or permission check (mappingGroups.js:541, :562). Any authenticated user can read any group's execution history, and any execution by id.
- SECURITY: `GET /` requires no permission, only project filtering (:19). `GET /` and `/init-data` use `userHasAdminAccess`, while the middleware uses `userHasAllProjectAccess` (permissionHelpers.js:60-92); these are two different admin tests (:24, :592 vs requireProjectAccess.js:66).
- SECURITY: `POST /:id/members` and `PUT /:id/members` accept any `mapping_id`. They do not check that the mapping belongs to a project the user can access, or to the same project as the group (:334-347, :447-452). Executing the group then runs that mapping.
- SECURITY: `POST /` takes `created_by` from the body (:143). It can be spoofed (and a non-UUID value gives a 500). `execute` accepts `triggered_by` from the body as a fallback (:506), but `req.user.id` takes precedence.
- SECURITY: The `sub_project_id` on POST and PUT is not verified to be a child of the project. The `status` on PUT is unvalidated.
- DUPLICATE: Group and member fetch queries are copy-pasted three times: GET /:id (:83-106), GET /:id/members (:301-307) and init-data (:657-670). Admin check differs between the list endpoint (`userHasAdminAccess`) and the middleware (`userHasAllProjectAccess`).
- DUPLICATE: Field aliases `name`/`group_name` and `max_concurrency`/`concurrency_limit`, returned together (:112-113, :685-687). The frontend mixes them (MappingGroups.jsx:237).
- UNCLEAR: The execute endpoint does not stop a second execution of the same group from starting while one is running. No lock or status check was found (:483-538).
- DEAD (partial): The `req.body?.triggered_by` fallback is unreachable when authenticateToken always sets `req.user`.

## Domain terms
- Mapping group (table `mapping_groups`, FE "mapping group"; workflow `step_type = 'mapping_group'`, workflowOrchestration.js:52). Distinct from access group (GRP.md).
- Member (`mapping_group_members`), mapping (`transformation_mappings`, `mapping_id`), also called transformation (init-data's `transformations`, :604).
- `max_concurrency` = `concurrency_limit` = "Concurrency Limit" in the UI.
- `execution_order`: the order in which members are sorted, and so which batch they land in.
- Group execution record: `mapping_group_executions` (`id`), with a text `execution_id` of the form `GROUP-...`. The REST `:executionId` is the numeric `id`, not the text `execution_id`.
- `sub_project_id` / parent project (`projects.parent_id` in the prod DDL; the code uses `parent_project_id`).

## Open questions
1. The semantics of `execution_order` for users: in-batch parallelism means the order is not strictly sequential. Is that intended? The UI says "1 (Sequential)" for a limit of 1.
2. Whether `useDeletePermission('mapping_groups')` matches a backend permission (the backend uses `mapping_group:write` for delete).
3. Whether `DELETE /:id` fails on a live DB. The migrations and the Jan_05 dumps say CASCADE for members and executions, but `transformation_jobs.mapping_group_execution_id` references `mapping_group_executions(id)` with no ON DELETE action (DDL:3447), so a group whose executions have jobs may fail with a 500. Not run against a live DB.
