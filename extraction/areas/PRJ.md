# PRJ - Projects & sub-projects

## Summary

A project is a row in `projects`. A sub-project is also a row in `projects`, with `parent_id` set to the parent (projectRoutes.js:170, :230; subProjects.js:54, :135). Users reach a project in two ways: directly through `project_members`, or through an access group linked in `project_access_groups` whose members are in `user_groups` (projectRoutes.js:182-191; requireProjectAccess.js:84-102, :362-423). Access to a sub-project comes from access to its parent (requireProjectAccess.js:402-415). `getUserProjects` does not filter its "direct" CTE by `parent_id` (requireProjectAccess.js:365-379), so a direct `project_members` row on a sub-project also makes that sub-project count as a "parent" in the query, and its own children are returned too (:413). The group CTE is unfiltered in the same way (requireProjectAccess.js:380-395), so a `project_access_groups` row on a sub-project also grants access to that sub-project's children (:413). See Flags UNCLEAR 1. The separate `sub_project_members` and `sub_project_access_groups` tables are written and read only by the sub-project routes. No access-control code reads them (see Flags).

Two routers are mounted on `/api/projects`, each behind `authenticateToken`:
- `projectRoutes` (server.js:5373), with 12 routes.
- `subProjects` (server.js:5384), with 10 routes.

Both use the same JWT middleware, `backend/src/middleware/authenticate.js`. server.js:406 imports it, and subProjects.js:3 imports `../src/middleware/authenticate` again for each route. This contradicts the `JWT*` label in inventory.md:518-527.

Authorization differs between the two routers:
- `projectRoutes`: only the two list endpoints (`GET /` and `GET /init-data`) filter by access. No other route checks membership or permission.
- `subProjects`: every route checks that the caller has access to the parent project, unless the caller is an admin.

The frontend has two pages:
- `/projects` (Projects.jsx): a read-only list with "upload to project" links.
- `/project-management` (ProjectManagement.jsx): CRUD, members, groups and sub-projects. It also uses SubProjectManagement.jsx, SubProjectMemberManagement.jsx and EditSubProjectModal.jsx.

### Admin predicates used
- `userHasAllProjectAccess(user)` (permissionHelpers.js:60-73) returns true when either:
  - the user has the role `Admin` or `admin`, as a string or as an object `.name`/`.role_name` (permissionHelpers.js:42-51); or
  - the user has any of these permissions: `project_management:write`, `all_projects:read`, `users:write`, `roles:write`.

  Used by projectRoutes.js:163 and :272.
- `userHasAdminAccess(user)` (permissionHelpers.js:80-92) uses the same role check, with the permissions `users:write`, `roles:write`, `project_management:write`. It does not include `all_projects:read`. Used by every route in subProjects.js (e.g. :17).
- Permission matching compares a string permission, or `p.name`/`p.permission_name`/`p.permission_code` on object permissions (permissionHelpers.js:12-23). `req.user.permissions` is built by authenticate.js:186-301:
  - base permissions: `dashboard:read`, `file_profile:read`, `quality_checks:read`;
  - objects `{name, resource, action}` from `role_permissions`;
  - entries from the `roles.permissions` JSON.

  The result is cached in Redis for 600 s (authenticate.js:295).

## Entry points

### GET /api/projects/
- Handler: projectRoutes.js:157-258. Trigger: Projects.jsx:45. ProjectManagement.jsx:144 calls it after every create, update or delete (`fetchProjects`).
- Auth: JWT (server.js:5373). Scope:
  - If `userHasAllProjectAccess` is true, the caller sees every top-level project (`WHERE p.parent_id IS NULL`, :197).
  - Otherwise, only projects where the caller is a direct member or a member through a group, and only top-level ones (:180-195). There is no `is_active` filter, unlike `getUserProjects`.
- Query parameters:
  - `archived`: if present, filters `is_archived = (archived === 'true')` (:200-204). If absent, archived and non-archived projects are both returned.
  - `search`: ILIKE `%search%` on name or description (:206-210).
  - `project_type`: exact match (:212-216).
  - Order: `created_at DESC` (:218).
- Output: 200 with a JSON array. Each item is `projects.*` plus `member_count` (distinct direct members only), `group_count`, `sub_project_count` (parsed as int, :236-238) and `sub_projects[]`:
  - one query per project (:223-232), all children of that project, `owner_name = users.username`, ordered `created_at DESC`;
  - inactive sub-projects are included;
  - `total_size: 0` and `file_count: 0` are hardcoded (:241-242).
- Errors: 500 `{error:'Failed to list projects'}` (:256).
- Side effects: none, apart from logging.

### GET /api/projects/init-data
- Handler: projectRoutes.js:267-403. Declared before `/:projectId` (comment :265). Trigger: ProjectManagement.jsx:105 on page load and whenever the search or archived filter changes.
- Auth: JWT.
  - Non-admins (by `userHasAllProjectAccess`): calls `getUserProjects(req.user.id)` (requireProjectAccess.js:362-433). That returns active projects where the caller is a direct or group member, plus active sub-projects of those projects (including, via a direct row on a sub-project, that sub-project's own children; see Summary). The handler splits the result into parent IDs and sub-project IDs (:281-290).
  - If a non-admin has no accessible project, it returns `{projects:[],users:[],groups:[]}` (:293-299).
- Query parameters:
  - `search`: ILIKE on name or description (:326-330).
  - `archived === 'true'`: shows archived projects only. Any other value shows non-archived projects only (`is_archived IS NULL OR false`) (:332-336).
- Output: 200 `{projects, users, groups}` (:394-398).
  - `projects`: top-level projects with `member_count` and `sub_project_count`. There is no `group_count` (:305-313).
  - Booleans are normalised: `is_active` is true unless the value is `false`, `'false'` or `'f'`; `is_archived` is true only for `true`, `'true'` or `'t'` (:385-392).
  - `sub_projects` (:341-378):
    - sub-projects that are `ANY(accessibleSubprojectIds)` for non-admins, or all of them for admins;
    - `owner_name = users.full_name`;
    - ordered by name;
    - `total_size: 0` and `file_count: 0` hardcoded (:375-376).
  - `users`: `SELECT id, username, email, full_name FROM users ORDER BY username LIMIT 1000`. No filter (:361).
  - `groups`: every row of `access_groups` (id, name, description) (:362).
- Errors: 500 `{error:'Failed to fetch project management data'}` (:401).

### GET /api/projects/:projectId
- Handler: projectRoutes.js:406-455. Trigger: ProjectManagement.jsx:161 (opening the edit modal).
- Auth: JWT only. No membership or permission check.
- Input: `projectId` is read from `req.params` and passed straight to `WHERE id = $1` with no validation (:408-412). A non-numeric value is not checked in code; the only handling is the catch that returns the generic 500 (:453). The other `/:projectId` routes also use the param unvalidated (see Flags BUG 17).
- Output: 200 with `projects.*` plus:
  - `members[]`: `project_members.*`, username, email, full_name and `role_name`. The LEFT JOIN through `user_roles`/`roles` gives one row per role (:419-432). ProjectManagement.jsx:1245-1258 groups the rows back together.
  - `access_groups[]`: `project_access_groups.*`, `group_name`, `group_description`, `group_type` (:434-444).
- Errors: 404 `{error:'Project not found'}` (:416); 500 (:453).

### POST /api/projects/
- Handler: projectRoutes.js:458-805. Middleware order: `burstRateLimit`, `hourlyRateLimit`, `projectIdempotency` (:458). Trigger: ProjectManagement.jsx:216. The client sends an `Idempotency-Key` header of the form `${Date.now()}-<5 random bytes in base36>`, newly generated on each submit (:212-214).
- Auth: JWT only. Any authenticated user may create a project. No permission check.
- Rate limits (express-rate-limit ^7.5.0, package.json:70). Both use the default in-memory store and the key `project-create-{burst|hourly}:${req.user?.id || req.ip}`. Both skip when `!req.user`.
  - Burst: `max: 3` per `60*1000` ms (:90-99).
  - Hourly: `max: 10` per `60*60*1000` ms (:24-34).
  - When a limit is hit:
    - writes an `audit_log` row with `status:'RATE_LIMITED'`, `actionType:'project_create'`, a sha256 `payload_hash` of `{name, description, project_type}` and `rate_limit_type` (:35-76, :101-142);
    - returns 429 `{error:'Rate limit exceeded', message, retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)}` (:82-86, :148-152).
  - Messages: "You can only create 10 projects per hour. Please try again later." and "Too many project creations. Maximum 3 per minute. Please slow down."
- Idempotency (idempotency.js:15-104), `ttlHours: 24`, `resourceType:'project'` (projectRoutes.js:19-22):
  - No `idempotency-key` header: the request continues normally (:24-26).
  - Key longer than 255 characters: 400 `{error:'Invalid idempotency key'}` (:28-33).
  - Unexpired row found for `(key, user_id)`: replays the stored status and body, and sets the headers `X-Idempotency-Hit: true` and `X-Idempotency-Created-At` (:39-59).
  - Otherwise it wraps `res.json`. Only 2xx responses are stored, with an INSERT that does `ON CONFLICT (key) DO UPDATE` on status and body (:65-96). `resource_id = data.id || data.data.id` (:73).
  - Any middleware error is swallowed and the request continues (:99-102).
- Input body (:461): `name` (required), `description`, `parent_id`, `is_default`, `project_type`, `metadata`, `settings`, `member_ids[]`, `group_ids[]`, `sub_projects[]`, `drop_location_bucket`, `drop_location_prefix`, `drop_location_connection_id`, `adhoc_upload_connection_id`.
- Validation:
  - `!name`: 400 'Project name is required' (:464-466).
  - `!name.trim()`: 400 'Project name cannot be empty' (:468-470).
  - A truthy non-string `name` (number, object, `true`) passes `!name` and throws at `name.trim()` (:468). That is inside the `try` but before `BEGIN` (:472), so the catch runs `ROLLBACK` (:709) with no open transaction, writes a FAILED audit row (:765-794) and returns 500 'Failed to create project' (:801), not 400. See Flags BUG 15.
  - No server-side character validation. The client allows only `/^[a-zA-Z0-9\-_\s]+$/` and strips other characters as the user types (ProjectManagement.jsx:172-195).
- Duplicate rule: in a transaction, the handler selects a project with `owner_id = caller` and `LOWER(name) = LOWER(trimmed name)` (:474-477). If one exists it rolls back and releases the client (:483-484), writes a FAILED audit row later through `setImmediate` (:494-533), and returns 409 `{error:'Duplicate project name', message:'You already have a project named "<existing>". Please choose a different name.'}` (:535-538). The scope is per owner, not global. On this path the client is released at :484 and released again by the `finally` at :802-803 (see Flags BUG 16).
- Writes, in one transaction (BEGIN :472, COMMIT :603):
  1. `INSERT INTO projects (...12 cols...)` with these defaults (:541-545):
     - `parent_id || null`
     - `owner_id = caller`
     - `is_default || false`
     - `project_type || 'internal'`
     - `metadata || {}`
     - `settings || {}`
     - `null` for empty drop-location and adhoc fields.
  2. `INSERT project_members (project_id, user_id)` for the creator (:550-553).
  3. `member_ids`, excluding the creator. Values are inlined in the SQL as `(${newProject.id}, ${parseInt(id,10)})`, `ON CONFLICT (project_id,user_id) DO NOTHING` (:556-569).
  4. `group_ids`, inlined the same way into `project_access_groups`, `ON CONFLICT DO NOTHING` (:572-582). `added_by` is not set.
  5. Each `sub_projects[]` item with a non-blank name: `INSERT projects (name, description, parent_id=newId, owner_id=caller, is_active = item.is_active !== undefined ? item.is_active : true, project_type = parent project_type || 'internal')` (:585-601; the `is_active` expression is at :596). Only `undefined` falls back to `true`, so an explicit `null` is inserted as NULL. There is no duplicate check for these.
- After COMMIT:
  - SUCCESS `audit_log` row. Its `newValues` include `member_count = (member_ids.length||0)+1`, `group_count` and `sub_project_count` (:612-648).
  - Spike check: counts `audit_log` rows for this user with `action_type='project_create'`, `status IN ('SUCCESS','FAILED','RATE_LIMITED')` and `timestamp > NOW() - INTERVAL '5 minutes'` (:651-658). If the count is `> 5`, it calls `auditService.logSecurityEvent({eventType:'SUSPICIOUS_ACTIVITY', severity:'MEDIUM', ...})` (:662-695), which writes to `security_audit_log` (AuditService.js:358-366). The request is not blocked.
- Output: 201 with the new `projects` row (:707).
- Errors (catch :708-801):
  - ROLLBACK in all cases.
  - Postgres `23505` on constraint `idx_projects_owner_name_unique`: audit FAILED, then 409 'You already have a project with this name...' (:720-761).
  - Anything else: audit FAILED with `error.message`, then 500 `{error:'Failed to create project'}` (:765-801).
  - `finally` always calls `client.release()` (:802-803).

### GET /api/projects/:projectId/members
- Handler: projectRoutes.js:809-877. Triggers: FileUpload.jsx:492, MappingWizard.jsx:425, VisualMappingModals/TargetRulesModal.jsx:276 (`?role=data_steward`).
- Auth: JWT. Returns 401 if `!req.user.id` (:815-817). No membership check on `projectId`.
- Rule: the union of direct members and group-based members (`project_access_groups` joined to `user_groups`) (:835-844, :858-867).
  - `role=data_steward` also requires a role whose name matches `ILIKE '%data steward%'` (:821-834).
  - `full_name` is `COALESCE(full_name, TRIM(first_name||' '||last_name))`. Order: `full_name`, then `email`.
- Output: 200 `{members:[{id, username, email, first_name, last_name, full_name}]}` (:872). 500 on error (:875).

### GET /api/projects/:projectId/vendor-agreements-with-schemas
- Handler: projectRoutes.js:880-941. Trigger: FileUpload.jsx:403.
- Auth: JWT. 401 if no user id (:885-887). No membership check.
- Rules: agreements with `va.project_id = :projectId`, `approval_status IN ('manager_approved','governance_approved')` and `va.status = 'active'` (:918-920). File schemas come from `vendor_agreement_file_schemas` where `is_active = true`, ordered by `priority ASC` (:902-917). Order: `vendor_name`, then `file_name` (:922). A string `schema` is parsed with `JSON.parse` (:930-932).
- Output: 200 `{agreements:[{...va fields, vendor_name, vendor_code, file_schemas, fileSchemas}]}` (:936). 500 on error (:939).

### PUT /api/projects/:projectId
- Handler: projectRoutes.js:944-1060. Trigger: ProjectManagement.jsx:257. The edit form sends `name`, `description`, `parent_id`, `project_type`, `is_active` and the three drop-location fields (ProjectManagement.jsx:366-375).
- Auth: JWT only. No ownership, membership or permission check.
- Business rule: if `is_active === false`, the update is refused when any child has `is_active = true`. Response: 400 with error `Cannot deactivate project - it has active subprojects: <names>. Please deactivate all subprojects first.`, plus `code:'ACTIVE_SUBPROJECTS_EXIST'` and `activeSubprojects` (:950-963).
- Updatable fields, only when `!== undefined` (:970-1029): `name` (not trimmed, no duplicate pre-check), `description`, `parent_id`, `is_archived`, `is_active`, `project_type`, `metadata` and `settings` (JSON.stringify), and `drop_location_*` and `adhoc_upload_connection_id` (empty values become null). `updated_at = NOW()` is always set (:1038).
- Errors:
  - No fields: 400 'No fields to update' (:1031-1033).
  - 404 'Project not found' (:1045-1047).
  - 500 'Failed to update project' (:1058). This includes unique-index violations.
- Output: 200 with the updated row (:1055).
- The route accepts a sub-project ID and does not check the parent.

### DELETE /api/projects/:projectId
- Handler: projectRoutes.js:1063-1117. Trigger: ProjectManagement.jsx:281, after a ConfirmModal. The UI hides the delete button for `is_default` projects (ProjectManagement.jsx:695-704). The server does not check `is_default`.
- Auth: JWT only. No ownership, membership or permission check.
- Business rule: counts rows with `project_id = :projectId` in `files`, `workflow_steps`, `transformation_mappings`, `storage_connections` and `vendor_agreements` (:1068-1075). If the total is > 0, returns 400 `Cannot delete project - it has N file(s), N workflow(s), N transformation mapping(s), N storage connection(s), N vendor agreement(s). Please remove these dependencies first.` plus `resourceCounts` (:1084-1095).
- Writes: `DELETE FROM projects WHERE id=$1` (:1098-1101). Rows in other tables then cascade, are set to NULL, or block according to their FKs (see Data touched).
- Output: 200 `{message:'Project deleted successfully'}` (:1112). 404 'Project not found' (:1103-1105). 500 (:1115).

### POST /api/projects/:projectId/members
- Handler: projectRoutes.js:1120-1149. Trigger: ProjectManagement.jsx:302.
- Auth: JWT only. No check on who may add members.
- Input: `user_id`. 400 'user_id is required' if missing (:1125-1127). The handler does not check that the project or user exists. A missing one gives an FK error and a 500.
- Write: `INSERT project_members (project_id, user_id) ON CONFLICT ON CONSTRAINT project_members_project_user_unique DO UPDATE SET updated_at = NOW()` (:1130-1136). A comment says the global role defines permissions (:1129).
- Output: 201 with the row (:1144). 500 (:1147).

### DELETE /api/projects/:projectId/members/:userId
- Handler: projectRoutes.js:1152-1176. Trigger: ProjectManagement.jsx:319.
- Auth: JWT only. Removes only the direct membership. Group-based access stays.
- Output: 200 `{message:'Member removed successfully'}`. 404 'Project member not found' (:1161-1163). 500.

### POST /api/projects/:projectId/groups
- Handler: projectRoutes.js:1179-1207. Trigger: ProjectManagement.jsx:335.
- Auth: JWT only. 400 'group_id is required' (:1185-1187).
- Write: `INSERT project_access_groups (project_id, group_id, added_by=caller) ON CONFLICT (project_id, group_id) DO NOTHING` (:1189-1194).
- Output: 201 with the row, or `{project_id, group_id}` if it already existed (:1202). 500.

### DELETE /api/projects/:projectId/groups/:groupId
- Handler: projectRoutes.js:1210-1234. Trigger: ProjectManagement.jsx:352.
- Auth: JWT only. Output: 200 `{message:'Access group removed successfully'}`. 404 'Access group not found in project' (:1219-1221). 500.

### Common pattern for all sub-project routes (subProjects.js)
- Auth: JWT at the mount (server.js:5384) and again on each route (subProjects.js:3 and on each `router.*`). Database pool: `req.app.locals.pool`, set at server.js:5383.
- Parent access gate: if `!userHasAdminAccess(req.user)`, `getUserProjects(userId).some(p => p.id === parseInt(projectId))` must be true, otherwise 403 `{error:'Access denied', message:...}` (e.g. :20-30). `getUserProjects` returns only `is_active = TRUE` projects (requireProjectAccess.js:378, :394, :414), so non-admins are refused on inactive parents. Because of the unfiltered direct CTE, a non-admin with a direct `project_members` row on a sub-project also passes this gate for that sub-project's ID and for its children (requireProjectAccess.js:365-379, :413).
- Child check: `SELECT ... FROM projects WHERE id = :subProjectId AND parent_id = :projectId`, otherwise 404 'Sub-project not found' (e.g. :192-202).
- 500 responses include `message: error.message` (e.g. :67-70).

### GET /api/projects/:projectId/sub-projects
- Handler: subProjects.js:12-72. Trigger: SubProjectManagement.jsx:29 (inside the ProjectManagement edit modal, :1348-1351).
- Output: 200 `{success:true, subProjects:[...], parentProjectId}` (:59-63). Each item has id, name, description, owner_id, parent_id, is_active, metadata, settings, timestamps, the drop-location fields, `owner_name = username`, `file_count = COUNT(DISTINCT files.file_id)` and `total_size = COALESCE(SUM(files.file_size),0)`, where files are joined on `files.sub_project_id` (:33-57). Order: `created_at DESC`.

### POST /api/projects/:projectId/sub-projects
- Handler: subProjects.js:78-164. Trigger: SubProjectManagement.jsx:48. The client sends `{name, description, is_active}`.
- Validation: blank name gives 400 'Sub-project name is required' (:87-92). Parent access gate (:95-105). Parent must exist, otherwise 404 'Parent project not found' (:108-118). The handler does not check whether the parent is itself a sub-project.
- Duplicate rule: same `parent_id` and `LOWER(name)` gives 400 `{error:'Duplicate name'}` (:121-131).
- Write: `INSERT projects (name trimmed, description trimmed or null, parent_id, owner_id=caller, is_default FALSE, is_active TRUE, NOW(), NOW())` (:134-140). `is_active` from the body is ignored. `project_type` is not set, so the DB default `'internal'` applies (prod schema :5672).
- Output: 201 `{success:true, subProject, message:'Sub-project created successfully'}` (:151-155).

### PUT /api/projects/:projectId/sub-projects/:subProjectId
- Handler: subProjects.js:170-281. Triggers: SubProjectManagement.jsx:68 (`name`, `description`, `is_active`) and EditSubProjectModal.jsx:76-87 (adds the drop-location fields; empty values become null).
- Duplicate rule: if `name` is truthy and differs from the current name, the same check as create runs, excluding self, and gives 400 'Duplicate name' (:205-217).
- Fields, when `!== undefined`: `name` (trimmed), `description` (trimmed or null), `is_active`, `drop_location_connection_id`, `drop_location_bucket`, `drop_location_prefix` (empty values become null). `updated_at = NOW()` is always set (:224-249).
- Output: 200 `{success:true, subProject, message}` (:268-272).
- The parent-active and child-active rules (as in PUT project) are not applied here.

### DELETE /api/projects/:projectId/sub-projects/:subProjectId
- Handler: subProjects.js:287-354. Triggers: SubProjectManagement.jsx:86 and ProjectManagement.jsx:539 (both after `confirm()`).
- Rule: `COUNT(*) FROM files WHERE sub_project_id = :id` > 0 gives 400 `Cannot delete sub-project. It contains N file(s). Please move or delete the files first.` (:321-331).
- Write: `DELETE FROM projects WHERE id = :subProjectId` (:334).
- Output: 200 `{success:true, message:'Sub-project deleted successfully'}` (:342-345).

### GET /api/projects/:projectId/sub-projects/:subProjectId/members
- Handler: subProjects.js:360-423. Trigger: SubProjectMemberManagement.jsx:41.
- Output: `{success:true, members:[{id, sub_project_id, user_id, role, created_at, username, email, first_name, last_name}]}`, ordered by username (:394-414).

### POST /api/projects/:projectId/sub-projects/:subProjectId/members
- Handler: subProjects.js:429-507. Trigger: SubProjectMemberManagement.jsx:84. The UI offers roles `viewer`, `editor` and `admin`, default `viewer` (SubProjectMemberManagement.jsx:19, :387-389).
- Validation: `user_id` required, otherwise 400 (:438-443). The user must exist, otherwise 404 'User not found' (:472-478).
- Write: `INSERT sub_project_members (sub_project_id, user_id, role || 'member') ON CONFLICT (sub_project_id, user_id) DO UPDATE SET role = EXCLUDED.role` (:481-486). Free-text role with no validation.
- Output: 201 `{success:true, member, message}` (:494-498).

### DELETE /api/projects/:projectId/sub-projects/:subProjectId/members/:memberId
- Handler: subProjects.js:513-577. Trigger: SubProjectMemberManagement.jsx:106. `memberId` is the primary key `sub_project_members.id`, not a user ID (:547-550).
- Output: 200 `{success:true, message}`. 404 'Member not found' (:552-557).

### GET /api/projects/:projectId/sub-projects/:subProjectId/groups
- Handler: subProjects.js:583-646. Trigger: SubProjectMemberManagement.jsx:44.
- Output: `{success:true, groups:[{id, sub_project_id, group_id, created_at, group_name, group_description, member_count}]}`. `member_count = COUNT(DISTINCT user_groups.user_id)`. Order: group name (:617-637).

### POST /api/projects/:projectId/sub-projects/:subProjectId/groups
- Handler: subProjects.js:652-730. Trigger: SubProjectMemberManagement.jsx:123.
- Validation: `group_id` required, otherwise 400 (:661-666). The group must exist in `access_groups`, otherwise 404 (:695-701).
- Write: `INSERT sub_project_access_groups (sub_project_id, group_id) ON CONFLICT DO NOTHING` (:704-709).
- Output: 201 `{success:true, group: row || {sub_project_id, group_id}, message}` (:717-721).

### DELETE /api/projects/:projectId/sub-projects/:subProjectId/groups/:groupAssignmentId
- Handler: subProjects.js:736-800. Trigger: SubProjectMemberManagement.jsx:143. `groupAssignmentId` is `sub_project_access_groups.id` (:770-773).
- Output: 200. 404 'Group assignment not found' (:775-780).

### FE /projects (src/pages/Projects.jsx; App.jsx:446, ProtectedRoute)
- Calls `GET /api/projects?search=&archived=true`. `archived` is sent only when "Show Archived" is checked (Projects.jsx:42-43). Search is debounced by 2500 ms (:21-27).
- Client-side pagination with page sizes 10/25/50/100, default 10 (:18, :283-286).
- Sub-project rows expand under their parent (:226-267).
- Actions navigate to `/upload?project_id=<id>` or `/upload?project_id=<pid>&sub_project_id=<sid>` (:217, :258).
- Status badge: shows "Archived" when `is_archived`, otherwise "Active". It ignores `is_active` (:205-211).

### FE /project-management (src/pages/ProjectManagement.jsx; App.jsx:447, ProtectedRoute)
- Initial load (:104-122):
  - `GET /api/projects/init-data`.
  - `GET /api/connections`. On failure it falls back to `[]`. The result is filtered client-side to the types `aws, s3, azure, azure_blob, gcp, gcs, local, sftp`.
- Page size fixed at 15 (:72).
- Create modal:
  - fields: name, type (internal/external), description, multi-select members and groups;
  - drop location: connection, a read-only bucket filled from the browsed connection, and a prefix with a leading `/` stripped. Browsing uses `S3FolderBrowser` with `browseEndpoint="/api/bulk-profiling/browse"` (:436-445, :1396-1400);
  - an inline sub-project list.
- Error mapping on create: 429 shows the server message; 409 shows 'A project with this name already exists.' (:228-234).
- Edit modal: project details, a Members section (direct members only), Access Groups, and the `SubProjectManagement` component (:1066-1352). The UI text says "Inactive projects cannot receive new file uploads or run jobs. Existing data remains accessible." (:1137-1141). That claim was not traced in this area.
- Sub-project rows in the main table have "Add File", "Edit" (opens EditSubProjectModal) and "Delete" (:745-768).
- EditSubProjectModal loads storage connections from `GET /api/connections/storage` (EditSubProjectModal.jsx:45). It labels an empty connection "-- Use Parent Project Setting --" (:197) and says the setting overrides the parent's drop location (:186). The inheritance itself is not in PRJ code (see Open questions).
- SubProjectManagement, SubProjectMemberManagement and EditSubProjectModal call axios without explicit headers. The global interceptor adds `Authorization: Bearer <localStorage.token>` (AuthContext.jsx:335-346). SubProjectMemberManagement loads candidates from `GET /api/users?limit=1000` (:57) and `GET /api/groups` (:67).

## Data touched

| Table | Access | Where |
|---|---|---|
| projects | R/W (insert, update, delete) | projectRoutes.js:165-232, :305-356, :410, :474, :541, :588, :951, :1036, :1098; subProjects.js:33, :108, :121, :134, :192, :252, :334 |
| project_members | R/W | projectRoutes.js:172, :184, :419, :550, :563, :837, :1130, :1156; requireProjectAccess.js:376 |
| project_access_groups | R/W | projectRoutes.js:173, :187, :434, :577, :1189, :1214 |
| user_groups | R | projectRoutes.js:189, :842, :865; subProjects.js:628; requireProjectAccess.js:392 |
| sub_project_members | R/W | subProjects.js:405, :482, :548 |
| sub_project_access_groups | R/W | subProjects.js:626, :705, :771 |
| users, user_roles, roles | R | projectRoutes.js:229, :346, :361, :427-429, :831-834; subProjects.js:52, :472 |
| access_groups | R | projectRoutes.js:362, :441; subProjects.js:627, :695 |
| files, workflow_steps, transformation_mappings, storage_connections, vendor_agreements | R (dependency counts) | projectRoutes.js:1070-1074; subProjects.js:53, :322 |
| vendor_agreements, vendors, vendor_agreement_file_schemas | R | projectRoutes.js:890-923 |
| audit_log | W (logAction), R (spike count) | projectRoutes.js:46, :112, :496, :612, :651-658, :722, :765; AuditService.js:91 |
| security_audit_log | W | projectRoutes.js:672; AuditService.js:358-366 |
| idempotency_keys | R/W | idempotency.js:39-43, :75-81 |

Schema facts from the prod DDL dump (attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql):
- `projects` (:5659-5681):
  - `name varchar(255) NOT NULL`, `is_default` default false, `is_active` default true, `metadata` and `settings` jsonb default `{}`;
  - `is_archived bool NOT NULL default false` with the comment "Whether the project is archived (soft deleted)";
  - `project_type varchar(20)` default `'internal'`, `CHECK IN ('internal','external')`;
  - `CHECK (id <> parent_id)`;
  - unique index `idx_projects_owner_name_unique (owner_id, lower(name))`.
- Drop-location columns `drop_location_bucket varchar(255)`, `drop_location_prefix varchar(500)` and `drop_location_connection_id varchar(100)` appear in database_ddl_2026-01-07.sql:1755-1757. They are added by backend/migrations/addDropLocationToProjects.js:19-44 and migrations/schema_migration_2026-01-07.sql:73-93.
- `project_members`: `UNIQUE (project_id, user_id)` named `project_members_project_user_unique`, plus `can_invite`, `can_manage_members`, `invited_by`, `invitation_accepted_at` (:5630-5640).
- `project_access_groups`: PK `(project_id, group_id)`, `added_by` (:5614-5620).
- `sub_project_members`: `id serial`, `role varchar(50) default 'member'`, `UNIQUE (sub_project_id, user_id)` (:6158-6166).
- `sub_project_access_groups`: `id serial`, `UNIQUE (sub_project_id, group_id)` (:6142-6149).
- FK behaviour when a project row is deleted (:7288-7985):
  - `projects.parent_id` CASCADE (:7662), so sub-projects are deleted with their parent.
  - CASCADE: `files.project_id`, `project_members`, `project_access_groups`, `sub_project_*`, `access_group_roles`, `alert_policies`, `api_tokens`, `business_processes`, `dlq_jobs`, `file_schedules`, `job_schedules`, `job_group_schedules`, `logical_file_groups`, `mapping_groups`, `mapping_group_executions`, `n_step_workflows`, `quality_rules.sub_project_id`, `rbac_policies`, `schedules`, `transform_connections`, `transformation_jobs`, `transformation_mappings`, `visual_mapping_defs`, `workflow_executions`, `workflow_steps`.
  - SET NULL: `files.sub_project_id`, `vendor_agreements.project_id`/`sub_project_id`, `vendors.project_id`, `lineage_views`, and the `sub_project_id` columns of `mapping_groups`, `n_step_workflows`, `schedules`, `transformation_mappings`, `visual_workflows` and `file_schedules`.
  - No action (blocks the delete): `bulk_profiling_jobs.sub_project_id` (:7377), `schema_validation_jobs.project_id` (:7735), `storage_connections.project_id` (:7741), `upload_batches.project_id` (:7800), `visual_lineage_graphs.project_id` (:7926), `visual_workflow_executions.project_id` (:7964).
- Startup migrations that touch projects: `createProjectsAndGroups` (server.js:5908) and `addProjectIdToResources` (server.js:5909). The second inserts 'Default Project' with `is_default TRUE` and no owner (addProjectIdToResources.js:29-34).
- Other code that creates projects outside PRJ: vendorService.js:198-203 creates an `external` project with no owner when a vendor is created (area VND).

## Flags

### SECURITY
1. **No authorization on project mutation.** PUT `/:projectId` (projectRoutes.js:944), DELETE `/:projectId` (:1063), POST/DELETE members (:1120, :1152) and POST/DELETE groups (:1179, :1210) check only that the caller is logged in. Any authenticated user can rename, deactivate, archive, reparent or delete any project, and can add themselves (or anyone) as a member. Membership is what `requireProjectAccess` and the list filters use to grant access (requireProjectAccess.js:84-102), so this lets any user give themselves access to any project's resources.
2. **No membership check on reads.** GET `/:projectId` (:406) returns any project with member emails and groups. GET `/:projectId/members` (:809) and `/:projectId/vendor-agreements-with-schemas` (:880) return data for any project ID.
3. **POST /api/projects accepts `parent_id` from the body without checking access to that parent** (:461, :545). A caller can attach a new sub-project to any project. Project creation requires no permission at all (:458).
4. **PUT /api/projects/:projectId works on sub-project IDs** and lets `parent_id` change (:980-984). This bypasses the parent-access gate in subProjects.js. Only self-parenting is prevented (DDL `check_not_self_parent`). Cycles of length 2 or more are not prevented.
5. **init-data returns up to 1000 users** (id, username, email, full_name) and every access group to any caller with at least one accessible project (projectRoutes.js:361-362).
6. **Sub-project 500 responses return raw `error.message`** (subProjects.js:69, :161, :278, :351, :420, :504, :574, :643, :727, :797).

### BUG
1. **`adhoc_upload_connection_id` is used but never created.** POST inserts the column (projectRoutes.js:542) and PUT can set it (:1025-1028). No migration or DDL dump in the repo creates it: database_ddl_2026-01-07.sql:1742-1757 and prod schema :5659-5676 have no such column, and a grep finds it only in projectRoutes.js. Against those schemas every POST /api/projects would fail with 500.
2. **PUT /api/projects/:projectId has no duplicate-name pre-check and does not trim the name** (:970-973). A clash with `idx_projects_owner_name_unique` becomes a generic 500 (:1056-1058). The UI expects 409 for this case (ProjectManagement.jsx:266-267).
3. **Sub-project duplicate checks are per parent** (subProjects.js:121-124, :206-208), but the DB unique index is `(owner_id, lower(name))` across all projects (prod schema :5680). If the same owner uses one name under two parents, or reuses a top-level project name, the result is 23505 and a 500 'Failed to create sub-project' (:157-162).
4. **Sub-project `file_count` and `total_size` are hardcoded to 0** in GET / (:241-242) and init-data (:375-376). ProjectManagement.jsx:737-738 shows "0" and "0 B" for every sub-project in the main table.
5. **init-data returns no `group_count`** (:305-313), so ProjectManagement.jsx:659-663 shows "-" for access groups on first load. After any create, update or delete the page switches to GET /api/projects, which does return `group_count`.
6. **Inconsistent archived filtering.**
   - init-data hides archived projects unless `archived=true` (:332-336).
   - GET / returns archived and non-archived projects when `archived` is absent (:200).
   - Projects.jsx sends `archived` only when the box is checked (:43), so unchecked "Show Archived" still lists archived projects.
   - ProjectManagement.jsx refreshes with GET / after mutations (:224, :262, :286), so archived projects reappear after a create, update or delete.
7. **SubProjectMemberManagement shows fields the API does not return.**
   - It shows `member.added_at` and `group.added_at` (SubProjectMemberManagement.jsx:259, :321), but the API returns `created_at` (subProjects.js:400, :622). "Added Date" is always "-".
   - It shows `group.description` (:319), but the API returns `group_description` (subProjects.js:624).
8. **SubProjectManagement sends `is_active` on create** (SubProjectManagement.jsx:15, :48), but the server always inserts `TRUE` (subProjects.js:136).
9. **Audit write after COMMIT can turn a success into a 500.** On POST, the SUCCESS `logAction` runs after COMMIT and rethrows on failure (projectRoutes.js:603, :612-648; AuditService.js:123-126). The catch block then runs ROLLBACK on an already committed transaction, writes a FAILED audit row and returns 500 (:708-801), although the project exists. A retry with the same Idempotency-Key is not a cache hit, because only 2xx responses are stored (idempotency.js:69). The retry then fails as a duplicate (409).
10. **`logSecurityEvent` drops fields.** It is called with `userEmail`, `userRole`, `description` and `client` (projectRoutes.js:672-694), but its signature does not accept them (AuditService.js:343-355). The "User created N projects in 5 minutes" description is lost, and the insert does not use the transaction client.
11. **`retryAfter` is a timestamp, not a delay.** It is computed as `Math.ceil(req.rateLimit.resetTime / 1000)` (:85, :151). In express-rate-limit v7 `resetTime` is a Date, so the value is epoch seconds, not seconds to wait.
12. **Non-numeric `member_ids` or `group_ids` cause a 500.** `parseInt(id,10)` turns them into `NaN`, which is inlined into SQL as `(id, NaN)` (:559, :574) and fails.
13. **Sub-project PUT accepts an empty name.** With `name: ""` the duplicate check is skipped (`name && ...`, subProjects.js:205) and the update writes `name = ''` (:224-226). A non-string `name` throws on `.trim()`, giving a 500.
14. **Idempotency key collisions across users.** The lookup is scoped to `(key, user_id)` (idempotency.js:42), but the store uses `ON CONFLICT (key) DO UPDATE` and the DDL has `UNIQUE (key)` (prod schema :5149). If two users send the same key, the second user's response overwrites the stored body while `user_id` stays the first user's.
15. **Non-string `name` on POST gives a 500 and a ROLLBACK with no transaction.** `name.trim()` (projectRoutes.js:468) throws before `BEGIN` (:472); the catch calls `ROLLBACK` unconditionally (:709). Result: 500 'Failed to create project' (:801) instead of 400.
16. **Double `client.release()` on the duplicate-name path of POST.** The handler releases at projectRoutes.js:484 and returns 409 (:535-538); the `finally` then releases again (:802-803). What the pool does on a second release is library behaviour and was not traced here.
17. **Non-numeric `:projectId` gives a generic 500.** GET `/:projectId` passes the param straight to `WHERE id = $1` (projectRoutes.js:410-412) and the catch returns 500 (:453). PUT, DELETE, members and groups routes also use the param without validation (e.g. :1120-1149). The exact DB error for an integer column was not traced; the 500 comes from the catch blocks. Sub-project routes behave differently. For non-admins, a non-numeric id gives `parseInt` = NaN, the gate at subProjects.js:22-29 fails, and the response is 403 before any SQL (same pattern at :97, :181, :297, :370, :448, :523, :593, :671, :746). Only admins skip the gate and reach SQL (:57, :110, :194), where the response is a 500. `parseInt` is also used at :62. An id such as "1abc" passes the gate (parseInt gives 1) and then fails in SQL with a 500.

### DUPLICATE
1. **Two admin predicates.** `userHasAllProjectAccess` (projectRoutes) and `userHasAdminAccess` (subProjects) differ by `all_projects:read` (permissionHelpers.js:65-70 vs :85-89). A user with only `all_projects:read` sees every project in the lists, but gets 403 on the sub-project endpoints of projects they are not a member of. server.js:348-403 has separate copies, and its `userHasAdminAccess` lacks `project_management:write` (server.js:397-400).
2. **Several "projects a user can access" implementations:**
   - GET / inline SQL: no `is_active` filter, top-level only (projectRoutes.js:180-193).
   - `getUserProjects`: `is_active = TRUE`, includes sub-projects (requireProjectAccess.js:362-423).
   - `requireProjectAccess`: checks the project or its parent, then the target's `is_active` (requireProjectAccess.js:80-148).
   - `checkProjectMembership`: direct membership only, no groups (requireProjectAccess.js:321-356).
   - SQL function `get_user_projects`: uses `access_group_members` instead of `user_groups`, has no `is_active` filter, and is used by dashboard.js (createGetUserProjectsFunction.js:27-44).
   - server.js:727-736.
3. **Sub-project creation paths:**
   - POST /api/projects with `parent_id`: no access check, owner-scoped duplicate check.
   - POST /api/projects with `sub_projects[]`: inherits the parent's `project_type`, honours `is_active`, no duplicate check (projectRoutes.js:585-601).
   - POST `/:projectId/sub-projects`: parent-access gate, per-parent duplicate check returning 400, `is_active` forced TRUE, DB-default `project_type` (subProjects.js:78-164).
4. **Sub-project update paths.** PUT /api/projects/:id (any field, no checks) and PUT `/:projectId/sub-projects/:id` (gated, limited fields).
5. **Three sub-project listings with different shapes:**
   - GET /: `owner_name = username`, counts 0, `created_at DESC`.
   - init-data: `owner_name = full_name`, counts 0, ordered by name, access-filtered.
   - GET `/:projectId/sub-projects`: real counts, `owner_name = username`.
6. **Two storage-connection sources in the UI.** ProjectManagement uses `/api/connections` with a client-side type filter (ProjectManagement.jsx:108-121). EditSubProjectModal uses `/api/connections/storage` (EditSubProjectModal.jsx:45).
7. **Two ProjectManagement loaders.** `fetchInitData` (init-data) and `fetchProjects` (GET /) both fill the same table with different semantics (ProjectManagement.jsx:96-156).

### DEAD
1. `cleanupExpiredKeys` (idempotency.js:110-123) is never called. A grep finds only its definition, its export and coverage files. Expired `idempotency_keys` rows are never deleted.
2. `generateIdempotencyKey` (idempotency.js:129-131) is unused. The client builds its own key (ProjectManagement.jsx:212-214).
3. `project_members.can_invite`, `can_manage_members` and `invited_by` are written only by vendorService.js:265, :349, :728, :968 and are never read anywhere (grep).

### UNCLEAR
1. **Sub-project member and group assignments do not appear to grant anything.** `sub_project_members` and `sub_project_access_groups` are referenced only in subProjects.js (grep). No access check reads them. Sub-project access comes from the parent (requireProjectAccess.js:402-415). In addition, a direct `project_members` row on a sub-project makes `getUserProjects` return that sub-project and its own children, because the direct CTE has no `parent_id` filter (requireProjectAccess.js:365-379, :413). The group CTE is unfiltered in the same way (requireProjectAccess.js:380-395), so a `project_access_groups` row on a sub-project also grants access to that sub-project's children (:413). Whether that is intended is unclear. The `role` values (`viewer`, `editor`, `admin`, `member`) are never evaluated.
2. **The delete-project dependency check covers only 5 tables** (projectRoutes.js:1068-1075). Many child tables CASCADE silently, including `n_step_workflows`, `business_processes`, `mapping_groups`, `schedules`, `alert_policies`, `api_tokens` and `transformation_jobs`. Sub-projects also cascade, and the sub-project file check is not applied to them. FKs without an ON DELETE action (`schema_validation_jobs`, `upload_batches`, `visual_lineage_graphs`, `visual_workflow_executions`, `bulk_profiling_jobs.sub_project_id`) would cause an FK error and a generic 500. Whether this scope is intended is unclear.
3. **"Default" projects can be deleted.** `is_default` protection exists only in the UI (ProjectManagement.jsx:695). The 'Default Project' is created with no owner (addProjectIdToResources.js:29-34), so non-admins see it only if they are added as members.
4. **"Archived" and "inactive" are separate flags.** `is_archived` is described as a soft delete (DDL comment) and `is_active` is used by access checks (requireProjectAccess.js:138, :378). `is_archived` is not checked by any access code in PRJ.
5. **Odd override at server.js:5382.** It replaces `subProjectRoutes.use` with a call to `app.use`, but subProjects.js never calls `router.use`. Each sub-project request runs `authenticateToken` three times: at the `/api/projects` mount for `projectRoutes` (server.js:5373), at the `/api/projects` mount for `subProjectRoutes` (server.js:5384), and again on each route in subProjects.js (import at :3, used e.g. at :12).
6. **Idempotency runs after both rate limiters** (projectRoutes.js:458). A retried request with the same key counts against the 3/min and 10/hour limits and can get 429 instead of the cached reply. The client also generates a new key on each submit (ProjectManagement.jsx:212-214), so it never replays a key.
7. **The migration and the prod schema disagree on uniqueness.** `createProjectsAndGroups.js:46` creates `CONSTRAINT unique_project_name UNIQUE (name)` (global) and lacks `is_archived` and `project_type`. Prod has the per-owner index and no global constraint. On a fresh DB built from that migration, a cross-owner duplicate name fails with constraint `unique_project_name`, which the handler does not map to 409 (projectRoutes.js:720), so the result is a 500.

## Domain terms
- **Project**, also called "workspace" (projectRoutes.js:4, createProjectsAndGroups.js:7): a top-level `projects` row (`parent_id IS NULL`).
- **Sub-project**, also written "subproject" (projectRoutes.js:953, :959) or "child" project: a `projects` row with `parent_id`. In other tables it is referenced as `sub_project_id` (files, quality_rules, schedules, ...).
- **Member**: a `project_members` row (direct). A **group-based member** comes through `project_access_groups` and `user_groups`. A **sub-project member** is a `sub_project_members` row, with a role.
- **Access group**: an `access_groups` row. The UI says "Access Groups" and the API uses `group_id`, `groupAssignmentId`.
- **Owner**: `projects.owner_id`, the creator. Name uniqueness is per owner.
- **Project type**: `internal` or `external`, default `internal`. Vendor auto-created projects are `external` (vendorService.js:202).
- **Default project**: `is_default` ('Default Project').
- **Active / Inactive** (`is_active`) and **Archived** (`is_archived`, "soft deleted").
- **Drop location**: `drop_location_connection_id`, `drop_location_bucket`, `drop_location_prefix`. The UI calls it "File Drop Location (S3)". A sub-project's value "overrides the parent" according to the UI text.
- **Adhoc upload connection**: `adhoc_upload_connection_id` (see BUG 1).
- **Admin bypass / all-project access**: `userHasAllProjectAccess`, `isAdminBypass` (requireProjectAccess.js:66-75).
- **Data steward**: a role whose name matches `%data steward%`, used as a member filter.
- **Idempotency-Key**: request header, kept for 24 h.

## Open questions
1. Does the live DB have a `projects.adhoc_upload_connection_id` column? No code in the repo creates it, so whether project creation works in production cannot be told from code.
2. Where are `project_access_groups`, `sub_project_members`, `sub_project_access_groups`, `idempotency_keys` and `idx_projects_owner_name_unique` created? A grep of backend/migrations, migrations/*.sql and server.js found only the DDL dumps.
3. Which group-membership table is authoritative: `user_groups` (used here and in requireProjectAccess.js) or `access_group_members` (created by createProjectsAndGroups.js:158 and used by `get_user_projects`)? Both exist in the prod schema (:3977, :6520). Area GRP should answer this.
4. How are drop-location and adhoc fields used downstream (upload and ingestion), and does a sub-project fall back to its parent's drop location as the UI text says (EditSubProjectModal.jsx:186, :197)? This is not traced in PRJ. See area ING.
5. Do inactive or archived projects actually block uploads and jobs, as the UI text says (ProjectManagement.jsx:1139)? Only `requireProjectAccess`'s `is_active` check is visible here.
6. Who consumes `projects.metadata` and `projects.settings`? They are written by POST and PUT but not read in PRJ code.
7. Does any frontend gating (ProtectedRoute or sidebar features, authenticate.js:104 `projects` -> `/project-management`) limit who can open /project-management? ProtectedRoute itself was not read; see area WEB.
8. What does the pg pool do on the second `client.release()` in the duplicate-name path (BUG 16), and does Postgres raise an error or only a warning for the `ROLLBACK` with no open transaction (BUG 15)? Both depend on library and server behaviour, not on code in this repo.
