# GRP - Access groups & RBAC/ABAC policies

## Summary

The area has three overlapping parts:

1. **Access groups.** `backend/routes/groupRoutes.js` is mounted at `/api/groups` behind `authenticateToken` (server.js:5392-5393). It stores groups in `access_groups` and stores membership in `user_groups`. A group can be given roles through `access_group_roles`. Group roles are the only part of the area that changes what users can do: `authenticateToken` merges a user's group roles into `req.user.roles` and `req.user.permissions` (backend/src/middleware/authenticate.js:162-202).
2. **Legacy "groups".** These are the server.js handlers at server.js:13326-13531, written against the old `groups` table. Four of them are shadowed by groupRoutes. Three are still reachable: `/api/user/groups`, `POST /api/groups/:id/users` and `DELETE /api/groups/:groupId/users/:userId`. A startup IIFE also runs here (server.js:13535-13565).
3. **IAM-style policy engine.** `backend/routes/policyRoutes.js` is mounted at `/api/policies` behind `authenticateToken` (server.js:5363-5364) and uses `backend/services/policyEngine.js`. A second engine, `backend/services/ProjectPolicyEngine.js`, exists but is effectively unreachable. Policies are stored but nothing outside `POST /api/policies/evaluate` evaluates them. ABAC attribute tables and SCIM tables are created by migrations, and no code writes to them.

No handler in the area checks role, permission or ownership. Any authenticated user can create, change or delete any group, policy or attachment.

The `/policy-management` page does not call `/api/policies`. It manages `/api/governance-policies` (GOV area) (src/pages/PolicyManagement.jsx:113, :128, :364, :371).

Two different tables are used for access-group membership, so membership written through the UI is not seen by the policy engine. Details are under Flags.

## Entry points

Authentication: every backend entry point below goes through `authenticateToken` from `backend/src/middleware/authenticate.js` (imported at server.js:406). It requires an `Authorization: Bearer <token>` header and answers 401 if the header is missing, the token is invalid, the token is a refresh token, or the user no longer exists. It answers 500 on other errors (authenticate.js:20-46, :75-89). No route below adds a further authorization check.

### GET /api/groups (groupRoutes.js:54)
- Input: optional query parameters `group_type` (exact match) and `search` (`ILIKE '%search%'` on name or description). Both are parameterised (groupRoutes.js:56-79).
- Output: 200 with a bare array of `access_groups.*`, plus `member_count` (the count of `user_groups` rows, parsed to an int, default 0) and `idp_sync_enabled`, a copy of `sync_enabled`. Ordered by `created_at DESC` (groupRoutes.js:58-97).
- Errors: 500 `{error:'Failed to list groups'}` (groupRoutes.js:98-101).
- Callers: GroupManagement.jsx:96 (after create, update and delete), SubProjectMemberManagement.jsx:67. Groups.jsx calls it through `getGroups` (groupsService.js:9), but see the BUG flag on the missing auth header.

### GET /api/groups/init-data (groupRoutes.js:110)
- Same group query and filters as `GET /` (groupRoutes.js:112-137), run in parallel with three more queries (groupRoutes.js:139-144):
  - users: `id, username, email, full_name, internal_user, user_type`, ordered by username, `LIMIT 1000`;
  - roles: `id, name, description`;
  - projects: `id, name` where `parent_id IS NULL`, so top-level projects only.
- Output: 200 `{groups, users, roles, projects}` (groupRoutes.js:157-162). Error: 500 `{error:'Failed to fetch group management data'}`.
- It is declared before `/:groupId` so that it is not taken for an id (comment at groupRoutes.js:108).
- Caller: GroupManagement.jsx:71, on mount and whenever the debounced search or the type filter changes. The search debounce is 2500 ms (GroupManagement.jsx:52-61).

### GET /api/groups/:groupId (groupRoutes.js:170)
- Reads the `access_groups` row, then the members (`user_groups` joined to `users`: `user_id, group_id, username, email, full_name`, ordered by username) and the role assignments (`access_group_roles.*` with `role_name`, `role_description`) (groupRoutes.js:174-206).
- Output: 200 with the group, plus `idp_sync_enabled`, `members[]` and `roles[]` (groupRoutes.js:208-215). 404 `{error:'Group not found'}`. 500 `{error:'Failed to fetch group'}`.
- `groupId` is not validated. A non-integer value reaches Postgres as an integer comparison (groupRoutes.js:174-176). See the BUG flag on `/api/groups/user`.

### POST /api/groups (groupRoutes.js:223)
- Body fields: `name` (required, else 400 `'Group name is required'`), `description`, `group_type`, `external_id`, `idp_sync_enabled`, `metadata`, `member_ids[]`, `role_ids[]`, `role_id`, `role_project_id` (groupRoutes.js:226-231).
- `group_type` defaults to `'MANUAL'` and must be one of `['MANUAL','STANDARD','DYNAMIC']`, else 400 (groupRoutes.js:233-238).
- All writes run in one transaction (BEGIN at :240, COMMIT at :282, ROLLBACK at :300):
  - insert into `access_groups` with `external_group_id = external_id || null`, `sync_enabled = idp_sync_enabled || false`, `created_by = req.user.id`, `metadata = metadata || {}` (groupRoutes.js:242-246);
  - members: a multi-row `INSERT INTO user_groups` built by string interpolation of `parseInt(id,10)` values, `ON CONFLICT (user_id, group_id) DO NOTHING` (groupRoutes.js:251-261);
  - roles: if `role_ids` is a non-empty array, each id is inserted with `project_id NULL`, labelled "Legacy ... global scope only". Otherwise, if `role_id` is set, one row is inserted with `project_id = role_project_id` or NULL. Both use `ON CONFLICT DO NOTHING` (groupRoutes.js:264-280).
- Output: 201 with the new row plus `idp_sync_enabled` (groupRoutes.js:284-298). 500 `{error:'Failed to create group'}` on any error, including a duplicate name (`unique_group_name`, createProjectsAndGroups.js:133). There is no 409 for duplicates.
- `access_group_roles.assigned_by` is never filled in (groupRoutes.js:268, :276).
- The permission cache is not invalidated for the members added here. Compare groupRoutes.js:423.
- Caller: GroupManagement.jsx:126-137, which sends `role_id` and `role_project_id`, not `role_ids`. The name input has `maxLength={50}` (GroupManagement.jsx:404). The server has no length check, and the column is `VARCHAR(255)` (createProjectsAndGroups.js:108).

### PUT /api/groups/:groupId (groupRoutes.js:309)
- Partial update of `name`, `description`, `external_id` (stored as `external_group_id`), `idp_sync_enabled` (stored as `sync_enabled`) and `metadata` (JSON-stringified). Each field is written only if it is not `undefined`. `updated_at = NOW()` (groupRoutes.js:312-354).
- `group_type` cannot be changed. The edit modal sends it (GroupManagement.jsx:151, :571-581), and the server ignores it (groupRoutes.js:312).
- Output: 200 with the updated row plus `idp_sync_enabled`. 400 `'No fields to update'`. 404 `'Group not found'`. 500 `'Failed to update group'` (groupRoutes.js:344-376).

### DELETE /api/groups/:groupId (groupRoutes.js:380)
- `DELETE FROM access_groups WHERE id=$1`. Output: 200 `{message:'Group deleted successfully'}`. 404. 500 (groupRoutes.js:384-402).
- Cascades: in the production schema dump, `user_groups`, `access_group_roles` and `group_policy_attachments` have FKs to `access_groups` with `ON DELETE CASCADE` (attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql:7827, :7287, :7531).
- The "Default Group" is not protected. The legacy handler protected it (server.js:13441-13445).
- Member permission caches are not invalidated.
- The UI hides the delete button unless the user has `access_groups` write permission (GroupManagement.jsx:11, :368; useDeletePermission.js:31, :45-47). The server does not check this.

### POST /api/groups/:groupId/members (groupRoutes.js:406)
- Body: `user_id`, required, else 400 (groupRoutes.js:409-413). Inserts into `user_groups` with `ON CONFLICT DO NOTHING` (groupRoutes.js:415-420).
- Deletes the Redis key `permissions:user:<user_id>` (groupRoutes.js:15-23, :423).
- Output: 201 with the inserted row, or with no row when the user was already a member (`result.rows[0]` is undefined). 500 if the group or user does not exist, because nothing checks first and the FK fails.
- GroupManagement.jsx:191-195 also sends `source: 'MANUAL'`. The server ignores it.

### DELETE /api/groups/:groupId/members/:userId (groupRoutes.js:439)
- Deletes from `user_groups`. 404 `'Group member not found'` if no row was deleted. On success it invalidates the user's permission cache and returns 200 `{message:'Member removed successfully'}` (groupRoutes.js:443-461).

### POST /api/groups/:groupId/roles (groupRoutes.js:469)
- Body: `role_id` (required, else 400) and optional `project_id` (groupRoutes.js:472-476).
- Insert with `ON CONFLICT (group_id, role_id, COALESCE(project_id, -1)) DO NOTHING RETURNING *`. If no row comes back: 409 `'Role already assigned to group'` (groupRoutes.js:478-488).
- On success it invalidates the permission cache of every current member (groupRoutes.js:30-48, :491) and returns 201 with the row.
- See the BUG flag: no index matches the ON CONFLICT target.

### DELETE /api/groups/:groupId/roles/:roleId (groupRoutes.js:508)
- Optional query parameter `project_id`. If it is present, deletes `WHERE ... AND project_id=$3`. Otherwise deletes `AND project_id IS NULL`, the global assignment (groupRoutes.js:511-521).
- 404 `'Role assignment not found'`. On success it invalidates the members' caches and returns 200 (groupRoutes.js:527-540).

### Legacy server.js group handlers
These are registered after the groupRoutes mount (server.js:5393), so groupRoutes takes the matching paths first.
- **GET /api/groups** (server.js:13326): SHADOWED by groupRoutes.js:54. If it ran, it would create `('Default Group','Default group for all users')` in the `groups` table when missing, then return `SELECT * FROM groups ORDER BY name` (server.js:13329-13346).
- **POST /api/groups** (server.js:13375): SHADOWED. It inserted into `groups`, then added the creator to `user_groups` without ON CONFLICT (server.js:13383-13396).
- **PUT /api/groups/:id** (server.js:13406): SHADOWED. `name` was required (400) (server.js:13411-13413).
- **DELETE /api/groups/:id** (server.js:13436): SHADOWED. It refused the Default Group with 403 `'Cannot delete the default group'` (server.js:13441-13445).
- **GET /api/user/groups** (server.js:13354). Reachable. Returns `groups g JOIN user_groups ug ON g.id = ug.group_id WHERE ug.user_id = req.user.id ORDER BY g.name` (server.js:13358-13367). No frontend code calls this path. `getUserGroups` calls `/api/groups/user` instead (groupsService.js:21).
- **POST /api/groups/:id/users** (server.js:13462). Reachable.
  - Body: `userIds`, a non-empty array, else 400 `'User IDs are required'` (server.js:13465-13469).
  - The group must exist in the legacy `groups` table, else 404 (server.js:13472-13476).
  - Inserts each id into `user_groups` with `ON CONFLICT DO NOTHING`. Per-user errors are only logged (server.js:13479-13490).
  - Returns 200 `{message, addedUsers}`. The permission cache is not invalidated.
  - `addUserToGroup` in groupsService.js:81-94 sends `{ userId }`, not `userIds`, so it would always get 400. No page imports it (see DEAD).
- **DELETE /api/groups/:groupId/users/:userId** (server.js:13500). Reachable.
  - The group must exist in `groups` (404).
  - If the group is named `'Default Group'`: 403 `'Cannot remove users from the default group'` (server.js:13511-13514).
  - Otherwise deletes from `user_groups`, with 404 `'User is not a member of this group'` if no row was deleted (server.js:13517-13524). No cache invalidation.

### Startup hook: default-group backfill (server.js:13535-13565)
This async IIFE runs at module load. It looks up `access_groups` where `name = 'Default Group'`. If that group exists, every user with no row in `user_groups` is inserted into it with `ON CONFLICT DO NOTHING`. Errors are only logged. No code in the repository creates a 'Default Group' row in `access_groups`; the creators write to `groups` (initBusinessProcessTables.js:108-113; server.js:12256, :13333). See UNCLEAR.

### GET /api/policies (policyRoutes.js:29)
- Optional query filters: `policy_type`, `is_global` (`=== 'true'`), `project_id`, `is_active` (`=== 'true'`). Returns 200 with `rbac_policies.*` ordered by `created_at DESC`, or 500 (policyRoutes.js:32-64).

### GET /api/policies/:id (policyRoutes.js:74)
- 200 with the row, 404 `'Policy not found'`, or 500 (policyRoutes.js:77-89).

### POST /api/policies (policyRoutes.js:99)
- Required: `name`, `policy_type`, `policy_document`, else 400 (policyRoutes.js:112-116).
- `policy_document.Statement` must be an array, else 400 (policyRoutes.js:119-123). Individual statements are not validated.
- Insert with `project_id || null`, `is_global || false`, `created_by = req.user.id` (policyRoutes.js:125-138). 201 with the row.
- 409 when the constraint `unique_policy_name_per_project` is violated (policyRoutes.js:148-152). Because the constraint is `UNIQUE (name, project_id)` (createPolicyEngine.js:52), two policies with the same name and NULL `project_id` are not blocked. This follows from Postgres treating NULLs as distinct.
- `policy_type` is checked only by the DB (`CHECK (policy_type IN ('IDENTITY','RESOURCE'))`, createPolicyEngine.js:53), so a bad value gives 500, not 400.

### PUT /api/policies/:id (policyRoutes.js:165)
- Updates `name`, `description`, `policy_document` and `is_active` with `COALESCE(new, old)`, so none of them can be set to NULL. Sets `version = version + 1` and `updated_at = NOW()` (policyRoutes.js:176-193).
- `policy_type`, `project_id` and `is_global` cannot be changed. `policy_document` is not re-validated.
- Empties the whole `policy_evaluation_cache` (policyRoutes.js:200-201). 404 or 500.

### DELETE /api/policies/:id (policyRoutes.js:221)
- Hard delete. Returns 200 `{message, policy}` and empties the whole evaluation cache (policyRoutes.js:224-239). Attachments cascade (createPolicyEngine.js:80, :106, :133).

### POST /api/policies/:id/attach-user (policyRoutes.js:252)
- Body: `user_id`, required (400). Inserts into `user_policy_attachments` with `attached_by = req.user.id` and `ON CONFLICT DO NOTHING`.
- Deletes the cache rows for that user and returns 200 `{message:'Policy attached to user successfully'}`, whether or not a row was inserted (policyRoutes.js:255-276).
- A missing policy or user gives 500 through the FK.

### DELETE /api/policies/:id/detach-user/:userId (policyRoutes.js:289)
- Deletes the attachment and the user's cache rows. Always returns 200, even when nothing was deleted (policyRoutes.js:292-306).

### POST /api/policies/:id/attach-group (policyRoutes.js:319)
- Body: `group_id`, required. Inserts into `group_policy_attachments` with `ON CONFLICT DO NOTHING`, then empties the whole cache. The code comment says "Simplified - invalidate all cache" (policyRoutes.js:322-343).
- There is no detach-group route.

### POST /api/policies/evaluate (policyRoutes.js:356)
- Body: `user_id` and `action` (both required, 400), plus optional `resource_type`, `resource_id` and `context` (policyRoutes.js:358-362).
- Returns 200 `{allowed, decision, reason}` from `PolicyEngine.evaluate` (policyRoutes.js:364-373). 500 if context enrichment throws, because enrichment runs outside the engine's fail-closed try (policyEngine.js:32 versus the try at :42).
- Side effect: writes a row to `policy_evaluation_cache` (policyEngine.js:64, :108).
- Any authenticated user can evaluate any `user_id`.

### GET /api/policies/user/:userId (policyRoutes.js:384)
- Returns active policies attached to the user directly (`attachment_type: 'direct'`) or "via groups" (`'group'`) (policyRoutes.js:387-400). The group path is broken (see BUG).

### Policy evaluation rules (policyEngine.js), reached only through /evaluate
- Context enrichment (policyEngine.js:135-172):
  - each `user_attributes` row becomes the key `user.<key>`;
  - each `resource_attributes` row becomes `resource.<key>`, but only when both resourceType and resourceId are given;
  - the engine also adds `user.id`, `resource.type`, `resource.id` and `request.time` (an ISO string).
  - Attribute values are converted by type: `NUMBER` uses `Number()`; `BOOLEAN` is true for `'true'` or `'1'`; `JSON` is parsed, falling back to the raw value on error (policyEngine.js:178-193).
- Cache: the key is `policy:<userId>:<action>:<resourceType|'none'>:<resourceId|'none'>` with a TTL of 300 s (policyEngine.js:18, :374-376). On a cache hit the reason is `'Cached decision'` (policyEngine.js:45-53).
- Policies that apply to the user (policyEngine.js:320-368) are the active ones (`is_active = TRUE`) that are:
  - attached to the user directly; or
  - attached to a group the user belongs to in `access_group_members`; or
  - attached to the resource (`resource_policy_attachments`), when both resourceType and resourceId are given.
- No applicable policy gives `IMPLICIT_DENY` with reason `'No policies found for user'`, and that result is cached (policyEngine.js:58-66).
- Statements are taken in order, and the first matching statement decides the outcome for that policy (policyEngine.js:199-228). A statement matches when all three of these hold:
  - its `Action` matches. A missing or falsy Action matches everything (policyEngine.js:235). `*` is turned into `.*` in a regex built without escaping other characters (:244).
  - its `Resource` matches the string `TYPE:id`, or `TYPE` alone when there is no id, or `*` (policyEngine.js:255-274).
  - every key under `Condition` matches. Supported operators: `StringEquals`, `StringLike`, `NumericEquals`, `NumericLessThan`, `NumericGreaterThan`, `Bool`. Any other operator logs a warning and the statement does not match (policyEngine.js:280-314).
- Across policies, any matched `Deny` gives `DENY`; otherwise any matched `Allow` gives `ALLOW`; otherwise `IMPLICIT_DENY` (policyEngine.js:91-99). The result is `allowed = decision === 'ALLOW'`. The reason strings are `'Explicitly denied by policy: <name>'`, `'Allowed by policy: <name>'` and `'No matching allow policy found'` (policyEngine.js:451-461).
- Any other error returns `IMPLICIT_DENY` with reason `'Error during policy evaluation'` (policyEngine.js:120-128).

### Frontend /groups (src/pages/Groups.jsx; App.jsx:415)
- Login-only route guard (App.jsx:175-213).
- The page describes itself as "Create and manage groups to organize your business processes" (Groups.jsx:230).
- It lists, creates, edits and deletes groups through `groupsService` with `fetch`, using `name` and `description` only (Groups.jsx:4, :122-223). Client check: name required (Groups.jsx:175-178).
- It shows `user_count` and `process_count` (Groups.jsx:351, :355). The live API (groupRoutes) returns `member_count` instead.
- It links to `/groups/:id/processes` (Groups.jsx:359). App.jsx declares no such route (only `/groups` at App.jsx:415).

### Frontend /group-management (src/pages/GroupManagement.jsx; App.jsx:448)
- Login-only route guard. The sidebar feature id is `access_groups` (src/config/appFeatures.js:250-256).
- It uses axios with `Authorization: Bearer <localStorage token>` against `/api/groups/*`. Calls are listed above per endpoint.
- Create modal:
  - type select offers MANUAL, STANDARD and DYNAMIC (GroupManagement.jsx:427-429);
  - checkbox "Enable IdP Sync";
  - multi-select of members, filtered by Internal and External checkboxes (internal is shown by default, external is hidden by default; `internal_user !== false` counts as internal) (GroupManagement.jsx:47-48, :473-477);
  - one optional role with an optional project scope, where "All Projects (Global)" means NULL (GroupManagement.jsx:489-521).
- Edit modal:
  - details form;
  - roles table with assign and remove buttons. The hint text reads "Roles assigned here are inherited by all group members" (GroupManagement.jsx:636-638);
  - members table with add and remove buttons. The add select lists all users, unfiltered (GroupManagement.jsx:692).
- Type help text: "Manual: add members manually. Standard: predefined rules. Dynamic: auto-membership based on attributes." (GroupManagement.jsx:582). No backend code implements STANDARD or DYNAMIC behaviour; `group_type` is only stored and filtered on (groupRoutes.js:69-73, :233-246).

### Frontend /policy-management (src/pages/PolicyManagement.jsx; App.jsx:439)
- Login-only route guard. Feature id `policies` (appFeatures.js:206-213).
- It calls `/api/governance-policies` (GET, POST, PUT, DELETE) with `{policy_name, description, rules: {retention_days, access_control, encryption_required}}` (PolicyManagement.jsx:113, :128, :357-375). It does not use `/api/policies`. The server behaviour belongs to the GOV area.

## Data touched

| Table | Read by | Written by |
|---|---|---|
| access_groups | groupRoutes.js:58-63, :174, server.js:13537 | groupRoutes.js:242 (insert), :349 (update), :385 (delete) |
| user_groups (membership actually used; FK to access_groups in prod: FileSence_prod_schema...:7827, database_ddl_2026-01-07.sql:3487) | groupRoutes.js:33, :63, :191; authenticate.js:166; server.js:13361 and many other areas | groupRoutes.js:257, :416, :444; server.js:13394, :13483, :13518, :13555 |
| access_group_members (membership read by the policy engines) | policyEngine.js:340; ProjectPolicyEngine.js:159; policyRoutes.js:395 | no INSERT anywhere in the code (only deletes: userManagement.js:1271, :1356; adminCleanupRoutes.js:446) |
| access_group_roles | groupRoutes.js:203; authenticate.js:167; server.js:2581, :10603 | groupRoutes.js:268, :276, :479, :513 |
| groups (legacy) | server.js:13329, :13345, :13361, :13441, :13472, :13505 | server.js:13333, :13384, :13416, :13448 (shadowed handlers) |
| roles, users, projects | groupRoutes.js:141-143 (init-data) | - |
| rbac_policies | policyRoutes.js:34, :78, :388; policyEngine.js:329 | policyRoutes.js:126, :177, :225; seeds at createPolicyEngine.js:233-280 |
| user_policy_attachments | policyEngine.js:335; policyRoutes.js:394 | policyRoutes.js:262, :293 |
| group_policy_attachments | policyEngine.js:341; policyRoutes.js:396 | policyRoutes.js:329 |
| resource_policy_attachments | policyEngine.js:352 | no writer in the code |
| policy_evaluation_cache | policyEngine.js:388 | policyEngine.js:410, :427, :440; trigger that deletes expired rows on every insert (createPolicyEngine.js:202-226) |
| user_attributes, resource_attributes | policyEngine.js:142, :153; ProjectPolicyEngine.js:197, :210 | no writer in the code (only delete in userManagement.js:1266, :1351) |
| attribute_definitions | no reader | seed only: createABACAttributes.js:159-173 (10 rows: department, clearance_level, location, job_title, cost_center, sensitivity [Public/Internal/Confidential/Restricted], classification [Unclassified/Confidential/Secret/Top Secret], data_owner, retention_period, compliance_tags) |
| scim_configurations, scim_sync_logs, scim_resource_mappings | no reader | no writer (created by createSCIMProvisioning.js:24, :69, :112) |
| Redis `permissions:user:<id>` | authenticate.js:207 (TTL 600 s, :295) | deleted by groupRoutes.js:18 |

Seed policies: `AdministratorAccess` (IDENTITY, global, Allow `*` on `*`) and `ReadOnlyAccess` (IDENTITY, global, Allow `file:read`, `file:list`, `project:read`, `project:list`, `transformation:read`, `workflow:read` on `*`) (createPolicyEngine.js:233-280). The migrations run once at startup (server.js:5908, :5911-5913).

## Flags

### DUPLICATE
- **Two group APIs on one path.** groupRoutes (access_groups) and the legacy server.js handlers (groups) are both registered at `/api/groups`. The differences:
  - The legacy API protected 'Default Group' from deletion and from member removal (server.js:13443, :13512). groupRoutes does not.
  - The legacy create added the creator as a member (server.js:13393-13396). groupRoutes does not.
  - The legacy API used the body `userIds[]` at `/:id/users`. groupRoutes uses `user_id` at `/:groupId/members`.
  - The legacy API does no cache invalidation.
  - The reachable legacy handlers validate the group against `groups` and then write `user_groups`, whose FK points to `access_groups` in the production schema (FileSence_prod_schema...:7827). They therefore work only for ids that exist in both tables.
- **Two `user_groups` definitions.** initBusinessProcessTables.js:27-33 creates `user_groups(id SERIAL, user_id TEXT, group_id → groups(id))`. The DDL dumps show `user_groups(user_id INTEGER, group_id INTEGER)` with the FK to `access_groups` (database_ddl_2026-01-07.sql:2363-2365, :3487). database_schema.js:17-23 documents a third UUID-based version.
- **Two membership tables.** `user_groups` is written by the UI and read by authentication and project access. `access_group_members` is read by the policy engines (see BUG).
- **Two policy engines.** policyEngine.js (class instantiated by policyRoutes) and ProjectPolicyEngine.js (a singleton used by authorizeProjectResource.js:131). The differences:
  - Action and resource strings: raw `action` and `TYPE:id` (policyEngine.js:244, :265-267) versus `project:<pid>:<type>:<action>` and `project:<pid>:<type>:<rid|*>` (ProjectPolicyEngine.js:110-121).
  - Wildcards: unescaped regex (policyEngine.js:244) versus escaped, with `?` support (ProjectPolicyEngine.js:374-383).
  - Context shape: flat keys like `user.dept` (policyEngine.js:147) versus nested objects with the prefix before `:` stripped (ProjectPolicyEngine.js:203-205, :411-424).
  - Extra operators in ProjectPolicyEngine: `StringNotEquals`, `NumericLessThanEquals`, `NumericGreaterThanEquals` (ProjectPolicyEngine.js:434-453).
  - All statements versus first match: ProjectPolicyEngine evaluates every statement (:279-299). policyEngine stops at the first matching statement per policy (:202-222).
  - Missing Action: matches all in policyEngine (:235). In ProjectPolicyEngine `undefined.replace` throws, which ends in a deny (:376, :89-103).
  - ProjectPolicyEngine has no cache and no resource-attached policies. Its code comment says "TODO" (:168-169).
- **Group-inherited role SQL copied in three places**, all ignoring project scope: authenticate.js:164-170, server.js:2573-2584, server.js:10595-10606.

### BUG
- **Membership written by the UI is invisible to the policy engine.** Every membership write goes to `user_groups` (groupRoutes.js:257, :416; server.js:13483). The policy engines and the user-policy list read `access_group_members` (policyEngine.js:340; ProjectPolicyEngine.js:159; policyRoutes.js:395), and no code inserts into it. As a result, group policy attachments (policyRoutes.js:329) never apply to anyone. The same table is also read by dashboard.js:37, visualWorkflows.js:12, :105, vendorAgreementService.js:2735, :2757 and createGetUserProjectsFunction.js:41.
- **Project scope on group roles is ignored.** `access_group_roles.project_id` is stored from "Select a project to scope the role" (GroupManagement.jsx:513, :626; groupRoutes.js:276-279, :479-484). Every query that turns group roles into roles or permissions ignores `project_id` (authenticate.js:164-170; server.js:2579-2583, :10601-10605), so a project-scoped grant acts as a global role. No code reads `agr.project_id` for authorization (grep: only adminCleanupRoutes.js:323 and groupRoutes.js).
- **POST /api/groups/:groupId/roles: no index matches the ON CONFLICT target.** The target is `ON CONFLICT (group_id, role_id, COALESCE(project_id, -1))` (groupRoutes.js:481). The only unique indexes are the partial indexes `(group_id, role_id) WHERE project_id IS NULL` and `(group_id, role_id, project_id) WHERE project_id IS NOT NULL` (createProjectsAndGroups.js:215-224; database_ddl_2026-01-07.sql:3632, :3638; FileSence_prod_schema...:4006, :4009). Postgres rejects an ON CONFLICT target that matches no unique index, so this endpoint almost certainly always returns 500 `'Failed to assign role to group'`. Role assignment at create time works because it uses `ON CONFLICT DO NOTHING` without a target (groupRoutes.js:270, :278).
- **GET /api/policies/user/:userId returns too much.** It joins `access_group_members` on `agm.user_id = $1` only (policyRoutes.js:395) and keeps rows where `agm.user_id = $1` (:397). Any user who is in any group therefore gets every active policy, labelled `'group'`, whether or not it is attached.
- **Cache key leaves out context.** `_generateCacheKey` excludes `context` (policyEngine.js:374-376). A decision that depended on `Condition` values is reused for 300 s for any context, including the `IMPLICIT_DENY` for a user with no policies (policyEngine.js:64).
- **First matching statement wins inside a policy.** If one policy has a matching `Allow` statement before a matching `Deny` statement, the Deny is never seen (policyEngine.js:202-222). Deny-override applies only across policies (:91-99).
- **ProjectPolicyEngine selects a column that does not exist.** It selects `p.policy_name` from `rbac_policies` (ProjectPolicyEngine.js:135, :152). The column is `name` (createPolicyEngine.js:29; database_ddl_2026-01-07.sql:1820). The error is caught and an empty list returned (:179-186), so every evaluation would deny with `'No policies grant access'`.
- **Group detail never shows scope or source.** The UI shows the role scope from `role.project_name` (GroupManagement.jsx:654) and the member `member.source` (:715). GET /api/groups/:groupId returns neither: it does not join projects (groupRoutes.js:198-206), and `user_groups` has no `source` column (groupRoutes.js:184-195). Every role therefore shows as "Global" and every source badge is empty.
- **Groups page sends no auth header.** The `/groups` page's `groupsService` uses bare `fetch` with no Authorization header (groupsService.js:9, :33, :51, :69). `authenticateToken` accepts only the header (authenticate.js:20-28), and no global fetch wrapper exists in `src` (no `window.fetch =`). So every call from Groups.jsx gets 401, and the page shows `'Failed to fetch groups'` (Groups.jsx:126-129).
- **`getUserGroups` calls a path that does not exist.** It calls `/api/groups/user` (groupsService.js:21), which matches groupRoutes `GET /:groupId` with `groupId='user'` and an integer comparison (groupRoutes.js:174-176), giving 500. (It also has no auth header, so in practice it gets 401 first.) The real endpoint is `/api/user/groups` (server.js:13354). Callers: BusinessProcesses.jsx:11, BusinessProcessDetail.jsx:8.
- **Permission cache not invalidated on create or delete.** Group creation with members or roles (groupRoutes.js:223-306) and group deletion (:380-403) do not invalidate member permission caches. `req.user.permissions` comes from the Redis cache (TTL 600 s, authenticate.js:207-211, :295) while `req.user.roles` is recomputed on every request (authenticate.js:192-201). For up to 10 minutes the two can disagree.
- **`evaluateAccess` does not exist.** policyAuthorization.js:38, :96, :152, :198 and hybridAuthorization.js:102, :196 call `this.policyEngine.evaluateAccess(...)`. PolicyEngine defines only `evaluate` (policyEngine.js:30). Both files are unused (see DEAD).
- **Startup migration transactions do not hold.** The policy, ABAC and SCIM migrations are written against a single client (`client.query('BEGIN')`) but receive the pool (server.js:5911-5913; createPolicyEngine.js:18-21). BEGIN, the statements and COMMIT can therefore run on different pooled connections, and the transaction does not hold. This is cross-referenced to the MIG area.

### DEAD
- Shadowed legacy handlers: GET, POST, PUT and DELETE `/api/groups` in server.js:13326, :13375, :13406, :13436.
- `GET /api/user/groups` (server.js:13354) has no frontend caller (grep of `src` for `user/groups` finds only groupsService.js:21, which calls `/api/groups/user`).
- groupsService `addUserToGroup`, `removeUserFromGroup` and `getGroupUsers` (groupsService.js:81-120) are never imported. `getGroupUsers` calls `GET /api/groups/:id/users`, which has no handler.
- ProjectPolicyEngine.evaluate is reached only when `authorizeProjectResource` gets `enforcePolicies: true` (authorizeProjectResource.js:45, :127). No caller passes that option (grep of `enforcePolicies`).
- backend/middleware/policyAuthorization.js and hybridAuthorization.js are never required (grep).
- PolicyEngine's resource-policy branch (policyEngine.js:349-359): nothing writes `resource_policy_attachments`.
- ABAC enrichment reads `user_attributes` and `resource_attributes`, which nothing writes. `attribute_definitions` is never read.
- The SCIM tables have no reader and no writer.
- `access_groups.idp_source`, `last_synced_at`, `sync_status` and `sync_error` are never written. `sync_enabled` and `external_group_id` are stored but no sync process reads them (grep).
- `router.getPolicyEngine` (policyRoutes.js:23) is never called.

### SECURITY
- **No authorization on any GRP route.** Any authenticated user can:
  - create or modify groups;
  - add themselves to any group;
  - assign any role, including admin-type roles, to a group they belong to, gaining those roles through authenticate.js:162-202;
  - create, edit or delete policies;
  - attach policies to anyone.
  - This applies to all of groupRoutes.js and policyRoutes.js and to server.js:13462 and :13500. The UI delete gate (GroupManagement.jsx:368) is client-side only.
- `GET /api/groups/init-data` returns up to 1000 users with email, internal/external flag and type to any authenticated user (groupRoutes.js:141).
- `POST /api/policies/evaluate` lets any authenticated user probe any other user's decisions and fill the shared cache (policyRoutes.js:356-373).
- User-authored policy patterns are compiled into regexes without escaping (policyEngine.js:244, :269, :291). Policy authors, which means any authenticated user, can supply arbitrary regex syntax, which may allow catastrophic backtracking.
- `scim_configurations.bearer_token` is defined as a plain `VARCHAR(512)` (createSCIMProvisioning.js:31). The table is unused today.

### UNCLEAR
- The startup backfill (server.js:13535-13565) looks for 'Default Group' in `access_groups`, but code creates 'Default Group' only in `groups`. adminCleanupRoutes.js:120 and :443-446 assume access group id 1 is the Default Group. Whether such a row exists in production is not visible in the code.
- `group_type` values: the migration comment lists `MANUAL, IDP_SYNCED, SYSTEM` (createProjectsAndGroups.js:112), while the API accepts `MANUAL, STANDARD, DYNAMIC` (groupRoutes.js:233). STANDARD and DYNAMIC have no behaviour.
- `rbac_policies.is_global` is stored and filterable but has no effect in either engine. Policy scope in ProjectPolicyEngine uses only `project_id = $2 OR project_id IS NULL` (ProjectPolicyEngine.js:143, :163). policyEngine ignores both.
- `policy_evaluation_cache.expires_at` is `TIMESTAMP` without time zone (createPolicyEngine.js:170). It is written from a JS `Date` (policyEngine.js:407) and compared with `NOW()` (:388). Whether the 300 s TTL holds depends on the Node and DB session time zones, which the code does not show.
- Groups.jsx presents groups as containers for business processes (Groups.jsx:230, :273). Business processes reference the legacy `groups` table (initBusinessProcessTables.js:42; database_ddl_2026-01-07.sql:3193), while the page now hits access groups.

## Domain terms
- **Access group**, also called group, user group or "Access Groups" in the sidebar (appFeatures.js:251). Table `access_groups`. Different from the legacy **group** (table `groups`, used by business processes), **job group** (`job_groups`, `user_job_groups`), **mapping group** (MGRP) and **logical file group**.
- **Member / membership**: rows in `user_groups`. The policy engines use `access_group_members`. The UI shows a membership "source" (MANUAL), which the API does not supply.
- **Group role / group-inherited role**: a role in `access_group_roles` that every member inherits. **Effective roles** = direct roles plus group-inherited roles (authenticate.js:197-201).
- **Scope**: on a group role, "All Projects (Global)" is `project_id NULL`; otherwise the role is scoped to a top-level project.
- **Group type**: MANUAL, STANDARD or DYNAMIC (API); IDP_SYNCED or SYSTEM (migration comment).
- **IdP sync**: `idp_sync_enabled` in the API and `sync_enabled` in the DB. **External ID**: `external_id` in the API and `external_group_id` in the DB. **IdP source**: `idp_source`.
- **Default Group**: the special group name; protected only in the legacy handlers.
- **Policy / RBAC policy**: table `rbac_policies`. Not the same thing as **governance policy** (`governance_policies`, used by the /policy-management page) or alert and retention policies.
- **Policy type**: IDENTITY or RESOURCE. **Global policy**: `is_global`. **Version**: incremented on every PUT.
- **Policy document**: `{Version, Statement[]}`. Each **statement** has `Effect` (Allow/Deny), `Action`, `Resource` and `Condition` (an operator mapping keys to values).
- **Attachment**: links a policy to a user, a group or a resource.
- **Decision**: ALLOW, DENY or IMPLICIT_DENY. **Evaluation cache**: `policy_evaluation_cache`.
- **ARN**: the resource and action strings in ProjectPolicyEngine, `project:<pid>:<type>:<id|action>`.
- **ABAC attributes**: user or resource attributes with type STRING, NUMBER, BOOLEAN or JSON, and source MANUAL, IDP_SYNCED or COMPUTED. **Attribute definition**: the schema for an attribute key.
- **SCIM configuration / sync log / resource mapping**: IdP provisioning tables. `platform_resource_type` is USER or ACCESS_GROUP.

## Open questions
- Does production data populate `access_group_members` by some process outside this repository, such as a manual script or a DB job? Nothing in the code does, and no trigger syncs it from `user_groups` (grep of the DDL finds only `update_access_groups_updated_at`, database_ddl_2026-01-07.sql:5197-5198).
- Does production have a unique index matching `(group_id, role_id, COALESCE(project_id,-1))` that the schema dumps omit? Neither dump nor any migration has one.
- Is there an 'Default Group' row in `access_groups` (id 1), and how was it created?
- Which `user_groups` definition is live? The dumps say INTEGER with an FK to access_groups. initBusinessProcessTables.js says TEXT with an FK to groups. `CREATE TABLE IF NOT EXISTS` means whichever ran first wins.
- Were project-scoped group roles meant to restrict access per project? No code applies them, so the intended semantics cannot be read from the code.
- Is `/api/policies` used by any external client? No frontend code calls it.
