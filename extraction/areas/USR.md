# USR - Users, roles & permissions

## Summary

USR covers administration of user accounts (list, view, edit, unlock, check dependencies, transfer ownership, delete one or many), the logged-in user's own profile, user lookups for other screens (by role, data stewards), and role and permission management (list, create, update, delete one or many, list permissions).

There are two backend implementations:

- `backend/routes/userManagement.js`, mounted at `/api/users` with no router-level auth (server.js:5355). Each route has its own auth: the per-route **JWT\*** middleware `backend/middleware/authenticate.js`. That middleware only verifies the token signature and copies the decoded claims into `req.user` (backend/middleware/authenticate.js:32-35). It does not load the user from the database.
- Inline routes in `server.js` (L11087-11453) that use the full **JWT** middleware `backend/src/middleware/authenticate.js`. That middleware reloads the user and their roles and permissions on each request, with caching (backend/src/middleware/authenticate.js:50-70).

"Admin" checks in userManagement.js use `userHasAdminAccess` (backend/utils/permissionHelpers.js:80-92). Under JWT\* it can only pass on role names that were in the token at login. The role routes in server.js have **no** authorization check: the checks are commented out.

The UI is two pages, `/users` (src/pages/UserManagement.jsx) and `/roles` (src/pages/RoleManagement.jsx), registered at src/App.jsx:402-403. They are wrapped only in `ProtectedRoute`, which checks that someone is logged in (src/App.jsx:175-189). The admin "Create user" action calls the unauthenticated self-registration endpoint `POST /api/users/register` (src/api/authService.js:81-83). That endpoint belongs to AUTH but is described here where it affects USR.

Role permissions are stored in two places: as a `text[]` column `roles.permissions` (prod schema S:3545) and in a `role_permissions` junction table (S:3896). Both are read when permissions are computed (backend/src/middleware/authenticate.js:228-283). The USR endpoints write only `roles.permissions`.

## Entry points

### 1. GET /api/users (userManagement router; this is the live handler)
- **Trigger:** `getAllUsers` (src/api/authService.js:56-62); AlertsConfig (src/pages/AlertsConfig.jsx:74, no params); SubProjectMemberManagement (src/components/SubProjectMemberManagement.jsx:57, `?limit=1000`).
- **Handler:** backend/routes/userManagement.js:19-47.
- **Who:** any holder of a valid JWT\* token. There is no admin or ownership check (userManagement.js:19).
- **Inputs:** `page` (default 1), `limit` (default 10), `search` (default ''). These come from `parseInt(...) || default` (userManagement.js:20-23). There is no upper bound on `limit` and no check for negative values.
- **Logic:** `userRepository.findAll({limit, offset, search?})` (backend/src/repositories/userRepository.js:19-100) and `userRepository.count({search?})` (userRepository.js:528-585).
  - `search` is an ILIKE `%term%` match on username, email, first_name or last_name (userRepository.js:62-67).
  - Results are ordered by `u.created_at DESC` (userRepository.js:76).
  - `OFFSET` is added only when offset is truthy (userRepository.js:83), so page 1 has no OFFSET.
  - `full_name` is computed as `TRIM(CONCAT(first,' ',COALESCE(middle,''),' ',last))` (userRepository.js:25).
  - Null roles are filtered out of the `ARRAY_AGG` (userRepository.js:92-95).
- **Output 200:** `{ users:[{id, username, email, first_name, middle_name, last_name, auth_provider, phone_number, full_name, created_at, updated_at, last_login, internal_user, user_type, failed_login_attempts, locked_until, must_change_password, roles[]}], pagination:{currentPage, pageSize, totalCount, totalPages} }`. `totalPages = ceil(totalCount/limit)` (userManagement.js:36-46).
- **Errors:** 401 with `Authentication required`, `Token expired` (code `TOKEN_EXPIRED`) or `Invalid token`. 500 if JWT_SECRET is unset (backend/middleware/authenticate.js:19-46). A repository failure throws `Failed to fetch users` (userRepository.js:97-98), which goes to the global error handler (server.js:14040-14041).
- **Side effects:** none.

### 2. GET /api/users (server.js inline; shadowed)
- **Handler:** server.js:11087-11141. It is registered after the router mount at server.js:5355, whose `GET /` matches first (userManagement.js:19). Per inventory, the first registered handler is the real behaviour, so this one is never reached.
- **What it would do:** JWT auth. The permission check `user_view` is commented out (server.js:11089-11094). It takes `page` and `limit` with defaults 1 and 10, has no search, orders by `u.id ASC`, and returns `pagination:{page, limit, totalCount, totalPages}` without the lockout fields (server.js:11097-11135). Errors return 500 `Failed to fetch users` (server.js:11139).

### 3. GET /api/users/init-data
- **Trigger:** UserManagement page load, pagination and search (src/pages/UserManagement.jsx:135-152). Search is debounced by 2500 ms (UserManagement.jsx:111-116).
- **Handler:** userManagement.js:440-475. JWT\* auth, no admin check.
- **Inputs and logic:** same as entry point 1 (userManagement.js:441-453), plus roles from `SELECT id, name, description, created_at FROM roles ORDER BY name LIMIT 100` (userManagement.js:454-459).
- **Output 200:** `{ success:true, users, pagination:{currentPage, pageSize, totalCount, totalPages}, roles }` (userManagement.js:464-474).

### 4. GET /api/users/roles
- **Trigger:** VendorRoleManagement page (coverage report shows `axios.get('/api/users/roles')`; that page's src file was not checked, see Open questions).
- **Handler:** userManagement.js:165-171. JWT\* auth, no admin check.
- **Output 200:** a bare array of `{id, name, description}` for all roles, ordered by name, with no pagination (userManagement.js:166-170).

### 5. GET /api/users/roles/:id
- **Handler:** userManagement.js:177-210. JWT\* auth, plus `userHasAdminAccess(req.user)` or 403 `Only administrators can view role details` (userManagement.js:182-187).
- **Inputs:** `id` goes through `parseInt` and is not validated. `NaN` is passed to the query (userManagement.js:178, :199).
- **Output 200:** `{id, name, description, permissions, created_at, updated_at}`. 404 `Role not found` (userManagement.js:189-209).
- **Trigger:** the coverage report shows RoleManagement calling `/api/users/roles/${roleId}`, but current src/pages/RoleManagement.jsx has no such call. See Open questions.

### 6. GET /api/users/by-role/:roleName
- **Trigger:** VendorUserSelect (src/components/VendorUserSelect.jsx:49) with `vendor`.
- **Handler:** userManagement.js:217-273. JWT\* auth, no admin check.
- **Rules:**
  - If `roleName.toLowerCase() === 'vendor'`, users are selected by attribute: `internal_user = false AND user_type = 'Vendor'`. The `user_roles` table is not used, and `vendor_id` is included in the result (userManagement.js:221-244).
  - Any other name joins `user_roles`/`roles` with `LOWER(r.name) = LOWER($1)` (userManagement.js:248-270).
  - Both branches order by `full_name, username`.
- **Output 200:** a bare array of `{id, username, email, first/middle/last/full_name, phone_number, address_line1/2, city, state, postal_code, country[, vendor_id]}`.

### 7. GET /api/users/data-stewards
- **Trigger:** SourceConfigModal (src/components/VisualMappingModals/SourceConfigModal.jsx:375), TargetRulesModal (TargetRulesModal.jsx:282), MappingWizard (src/pages/MappingWizard.jsx:447).
- **Handler:** userManagement.js:279-297. JWT\* auth, no admin check.
- **Rule:** users holding a role named exactly `'Data Steward'` (case-sensitive) (userManagement.js:292).
- **Output 200:** `{ dataStewards:[{id, username, email, first/middle/last/full_name}] }`.

### 8. GET /api/users/profile
- **Handler:** userManagement.js:330-351. JWT\* auth. Scoped to `req.user.id` taken from the token.
- **Output 200:** `{id, username, email, first/middle/last/full_name, phone_number, address_line1/2, city, state, postal_code, country, auth_provider, created_at, updated_at, last_login}`. Roles, user_type and internal_user are not included. 404 `User not found` (userManagement.js:333-350).
- **Trigger:** no caller found in src (grep of `/api/users` in src). See Open questions.

### 9. PUT /api/users/profile
- **Handler:** userManagement.js:357-432. JWT\* auth. Updates only `req.user.id`.
- **Inputs:** first_name, middle_name, last_name, phone_number, address_line1, address_line2, city, state, postal_code, country (userManagement.js:359-370). Username, email and roles cannot be changed here.
- **Validation:** if phone_number is non-empty it must match `/^\d*$/` (400 `Phone number can only contain numeric digits`, `field:'phone_number'`) and must have length 10 or less (400 `Phone number cannot exceed 10 digits`) (userManagement.js:373-388).
- **Logic:** each field is updated as `COALESCE($n, column)`, so omitting a field or sending null keeps the old value and a field cannot be cleared to NULL. `updated_at = CURRENT_TIMESTAMP` (userManagement.js:390-426).
- **Output 200:** `{ message:'Profile updated successfully', user }`. If the user row does not exist, `user` is `undefined` with status 200; there is no 404 branch (userManagement.js:428-431).
- **Trigger:** no caller found in src. See Open questions.

### 10. GET /api/users/:id
- **Trigger:** the coverage report shows UserManagement calling `/api/users/${userId}`; the current UserManagement.jsx has no such call (the edit modal uses the list row, UserManagement.jsx:266-285).
- **Handler:** userManagement.js:481-521. JWT\* auth, plus `userHasAdminAccess` or 403 `Only administrators can view user details`.
- **Output 200:** user columns including `auth_provider, internal_user, user_type, created_at, updated_at, last_login` and `roles` as a JSON array of names (`json_agg ... FILTER`, `'[]'` default). 404 `User not found`.

### 11. PUT /api/users/:id (admin edit user)
- **Trigger:** the UserManagement edit modal calls `updateUser(selectedUser.id, formData)`. Password is left out when blank (UserManagement.jsx:413-420; src/api/authService.js:97-99).
- **Handler:** userManagement.js:527-762. JWT\* auth, plus `userHasAdminAccess` or 403 `Only administrators can update user information` (userManagement.js:551-556).
- **Inputs:** username, email, first/middle/last_name, phone_number, address fields, internal_user, user_type, roles, password, must_change_password (userManagement.js:529-547). `vendor_id` and `auth_provider` cannot be changed.
- **Validation:** phone rules as in entry point 9 (userManagement.js:559-574). If a password is given, `passwordSecurity.validatePasswordStrength` applies (backend/utils/passwordSecurity.js:27-83):
  - minLength `12`;
  - at least one uppercase letter, one lowercase letter and one digit;
  - at least one special character from `!@#$%^&*()_+-=[]{}|;:,.<>?` (passwordSecurity.js:10-16).
  - On failure: 400 `{error:'Weak password', message, errors}` (userManagement.js:640-650, :751-753).
- **Logic (one transaction, `db.transaction`):**
  1. `UPDATE users SET col = COALESCE($n, col)` for the 14 profile and classification fields (userManagement.js:581-625). 404 if no row (userManagement.js:627-631, :744-749).
  2. If a password is given: bcrypt with `SECURITY_CONFIG.BCRYPT_SALT_ROUNDS` (default `12`, backend/src/config/environment.js:38). The new hash is put at the front of `password_history`, which is cut to the last `5` (passwordSecurity.js:17, :112-118). `must_change_password = COALESCE($3, must_change_password)` (userManagement.js:634-674). The new password is **not** checked against history; `isPasswordInHistory` (passwordSecurity.js:91-104) is not called.
  3. If `roles` is an array: **all** `user_roles` rows for the user are deleted. Each entry is then resolved as a role id if `!isNaN(entry)`, otherwise as an exact role name. Unknown entries are skipped silently (userManagement.js:677-717). An empty array removes every role.
  4. Re-select the user with roles (userManagement.js:720-740).
- **Output 200:** `{ message:'User updated successfully', user }` (userManagement.js:758-761). Other errors, such as a duplicate email (`users_email_unique`, S:6615), are re-thrown to the global error handler (userManagement.js:754-755).
- **Side effects:** writes `users` and `user_roles`. No cache invalidation (see Flags).

### 12. POST /api/users/:id/unlock
- **Trigger:** the "Unlock" button. It is shown only when `locked_until > now` and `hasRole('Admin')` on the client (UserManagement.jsx:763, :815-823, :233-243).
- **Handler:** userManagement.js:768-803. JWT\* auth, plus `userHasAdminAccess` or 403 `Only administrators can unlock user accounts`.
- **Logic:** `failed_login_attempts = 0, locked_until = NULL, must_change_password = TRUE, updated_at = now`. This runs whether or not the account was locked (userManagement.js:781-790). Sessions and refresh tokens are not revoked.
- **Output 200:** `{ message:'User account unlocked successfully', user:{id, username, email, failed_login_attempts, locked_until, must_change_password} }`. 404 `User not found`.
- **Related constants (AUTH):** lockout after `maxFailedAttempts: 5` for `lockoutDurationMinutes: 15` (passwordSecurity.js:18-19).

### 13. GET /api/users/:id/dependencies
- **Trigger:** called before a single delete (UserManagement.jsx:483-515).
- **Handler:** userManagement.js:809-888. JWT\* auth, plus `userHasAdminAccess` or 403.
- **Rules (what counts as a dependency):**
  - `vendors` where `vendor_user_id = id AND status != 'deleted'` (userManagement.js:831-837).
  - `vendor_agreements` where `manager_contact = <user's email>` or `vendor_approved_by`, `owner_approved_by` or `governance_approved_by = id`, and `status != 'deleted'` (userManagement.js:840-850).
  - `transformation_mappings.created_by = id` (userManagement.js:853-859).
  - `vendor_file_profiling_results.uploaded_by_user_id = id` (userManagement.js:862-868).
  - `projects.owner_id = id AND is_archived = false` (userManagement.js:871-877).
- **Output 200:** `{ hasDependencies, vendors[], agreements[], mappings[], catalogs[], projects[] }`. `hasDependencies` is true if any list is non-empty (userManagement.js:880-887). A user that does not exist gets an empty result with 200, not 404.
- **UI rule:** if `hasDependencies`, the UI opens TransferOwnershipModal instead of the delete confirmation (UserManagement.jsx:498-510).

### 14. GET /api/users/:id/eligible-replacements
- **Trigger:** UserManagement.jsx:470-480, called when dependencies exist.
- **Handler:** userManagement.js:896-975. JWT\* auth, plus `userHasAdminAccess` or 403. 404 if the source user is missing.
- **Rules:**
  - Source has a `vendor_id`: candidates are users with the same `vendor_id` and a different id. There is no filter on `user_type` or `internal_user` (userManagement.js:927-943).
  - Otherwise, if `internal_user` is true, or `user_type` is null, or `user_type != 'Vendor'`: candidates are users where `(internal_user = true OR user_type IS NULL OR user_type != 'Vendor') AND vendor_id IS NULL AND id != source` (userManagement.js:944-961).
  - Otherwise (no vendor_id, internal_user false, user_type 'Vendor'): an empty list (userManagement.js:924, no else branch).
  - Each candidate includes `roles` from `ARRAY_AGG(r.name)`. Nulls are not filtered, so a user with no roles has `[null]` (userManagement.js:932, :949).
- **Output 200:** `{ userToDelete:{id, username, email, internal_user, user_type, vendor_id}, eligibleReplacements[] }`.

### 15. POST /api/users/bulk-dependencies
- **Trigger:** "Delete Selected" (UserManagement.jsx:594-624).
- **Handler:** userManagement.js:981-1060. JWT\* auth, plus `userHasAdminAccess` or 403. 400 `userIds must be a non-empty array`.
- **Logic:** for each id (`parseInt`), runs 5 COUNT queries one after another, with the same criteria as entry point 13 (userManagement.js:1003-1042). Users with a total above 0 are returned.
- **Output 200:** `{ usersWithDependencies:[{id, username, email, dependencyCount}], canDelete }`.
- **UI rule:** if any user has dependencies, the bulk delete is refused with the message "Please delete each user individually to transfer ownership." (UserManagement.jsx:606-616).

### 16. POST /api/users/:id/transfer-ownership
- **Trigger:** "Transfer & Delete User" in TransferOwnershipModal (src/components/TransferOwnershipModal.jsx:27-55, :212-219). It calls `handleTransferAndDelete`, which POSTs the transfer and then calls `DELETE /api/users/:fromUserId` (UserManagement.jsx:551-569).
- **Handler:** userManagement.js:1066-1211. JWT\* auth, plus `userHasAdminAccess` or 403.
- **Validation:**
  - `toUserId` is required (400) and must differ from the source (400 `Cannot transfer ownership to the same user`) (userManagement.js:1080-1095).
  - The target must exist (404 `Target user not found`) and must be a **vendor contact**: `internal_user === false && user_type === 'Vendor'`, otherwise 400 `Target user must be a vendor contact` (userManagement.js:1098-1118).
  - The source must exist (404) (userManagement.js:1121-1133).
  - If the source has a `vendor_id`, the target must have the same `vendor_id` (400 `Target user must belong to the same vendor organization`) (userManagement.js:1138-1143).
- **Logic (one transaction):**
  - `vendors.vendor_user_id` moves from source to target where `status != 'deleted'`.
  - On `vendor_agreements` rows that match the dependency criteria: `manager_contact` is set to the target's email, and each `*_approved_by` column that equals the source is set to the target.
  - `transformation_mappings.created_by`, `vendor_file_profiling_results.uploaded_by_user_id` and `projects.owner_id` (non-archived) move to the target (userManagement.js:1157-1205).
- **Output 200:** `{ message:'Ownership transferred successfully', results:{vendors, agreements, mappings, catalogs, projects} }`. These are row counts.

### 17. DELETE /api/users/:id
- **Trigger:** single delete confirmation (UserManagement.jsx:522-542), and after a transfer (UserManagement.jsx:559).
- **Handler:** userManagement.js:1217-1292. JWT\* auth, plus `userHasAdminAccess` or 403 `Only administrators can delete users`.
- **Rules:** cannot delete self: `userId === req.user.id` returns 400 `Cannot delete self` (userManagement.js:1230-1235). There is **no** server-side dependency check; that check happens only in the UI.
- **Logic (one transaction):**
  - 404 if the user is missing (userManagement.js:1241-1250).
  - Delete from `user_roles`, `user_policy_attachments`, `user_groups`, `user_attributes`, `user_sessions`, `refresh_tokens`, `user_uuid_mapping`, `project_members`, `access_group_members`, `file_audit_details`, `password_reset_requests` and `policy_evaluation_cache`, then `users` (userManagement.js:1257-1277).
  - Per the comments, `user_job_groups` (UUID user_id) is skipped, as are `audit_log`, `data_access_log`, `security_audit_log` and `user_dashboard_settings` (VARCHAR user_id) (userManagement.js:1253-1254).
- **Output 200:** `{ message:'User deleted successfully' }`.

### 18. POST /api/users/bulk-delete
- **Trigger:** bulk delete confirmation (UserManagement.jsx:630-661).
- **Handler:** userManagement.js:1298-1375. JWT\* auth, plus `userHasAdminAccess` or 403. 400 for an empty or non-array `userIds`.
- **Rules:** self-delete is blocked by `userIds.includes(req.user.id)`. This is a strict-equality check with no `parseInt` (userManagement.js:1319-1325). There is no server-side dependency check.
- **Logic:** one transaction **per user**, deleting from the same tables as entry point 17 (userManagement.js:1333-1369). A missing user is recorded as `{id, error:'User not found'}`. Any exception is recorded as `{id, error: error.message}`, and the loop continues.
- **Output 200 (always, even if every delete fails):** `{ message:'Deleted N user(s) successfully', results:{successful:[{id, username}], failed:[{id, error}]} }`.

### 19. POST /api/users/roles/bulk-delete
- **Trigger:** RoleManagement "Delete Selected" (src/pages/RoleManagement.jsx:542-584). The UI excludes roles named `admin` (any case) from select-all (RoleManagement.jsx:511-513).
- **Handler:** userManagement.js:1381-1453. JWT\* auth, plus `userHasAdminAccess` or 403 `Only administrators can delete roles`. 400 for an empty `roleIds`.
- **Rules:** protected role names are `['Admin', 'User', 'Vendor', 'Governance Manager', 'Data Steward']`, matched exactly and case-sensitively. They are recorded as failed with `Cannot delete system role: <name>` (userManagement.js:1407, :1427-1433). Roles that are **assigned to users are deleted anyway**: the code first deletes `user_roles` and `role_policy_attachments` for the role, then the role (userManagement.js:1436-1440).
- **Logic:** one transaction per role. A missing role is recorded as `Role not found`.
- **Output 200:** `{ message:'Deleted N role(s) successfully', results:{successful:[{id, name}], failed:[{id, error}]} }`.

### 20. GET /api/roles/init-data
- **Trigger:** RoleManagement load, pagination and search, with a 2500 ms debounce (RoleManagement.jsx:68-73, :92-117).
- **Handler:** server.js:11148-11200. JWT auth, no authorization check.
- **Inputs:** `page` (default 1), **`pageSize`** (default 10), `search`. Search is a parameterised ILIKE on `name`/`description` (server.js:11150-11164).
- **Logic:** four queries in parallel:
  - role count;
  - `roles r.*` plus a `user_count` subquery from `user_roles`, ordered by `r.id ASC`, with LIMIT/OFFSET;
  - `SELECT * FROM permissions ORDER BY resource, action`;
  - `SELECT tag_id as id, tag_name as name, description, sensitivity_level, created_at, updated_at FROM governance_tags ORDER BY tag_name` (server.js:11166-11181).
- **Output 200:** `{ roles, pagination:{page, pageSize, totalCount, totalPages}, permissions, governanceTags }`. Errors return 500 `Failed to fetch role management data`.

### 21. GET /api/roles
- **Trigger:** `getRoles` (src/api/authService.js:128-134). It is imported in UserManagement.jsx:12 but never called. No other src caller was found (grep `getRoles(`).
- **Handler:** server.js:11203-11259. JWT auth. The `role_view` check is commented out (server.js:11205-11210).
- **Inputs:** `page`, **`limit`** (default 10), `search`. Uses the same query as entry point 20.
- **Output 200:** `{ roles, pagination:{page, limit, totalCount, totalPages} }`. Errors return 500 `Failed to fetch roles`.

### 22. GET /api/permissions
- **Trigger:** `getPermissions` (src/api/authService.js:199-201). It is imported in RoleManagement.jsx:6 but never called (grep `getPermissions(`).
- **Handler:** server.js:11262-11279. JWT auth. The checks are commented out (server.js:11264-11271).
- **Output 200:** a bare array from `SELECT * FROM permissions ORDER BY resource, action`. Errors return 500 `Failed to fetch permissions`.

### 23. POST /api/roles (create role)
- **Trigger:** RoleManagement create modal, through `createRole` (RoleManagement.jsx:404-429; src/api/authService.js:150-152).
- **Handler:** server.js:11282-11331. JWT auth. The `role_create` check is commented out (server.js:11284-11289): **any authenticated user** can create a role.
- **Inputs:** `name` (required, 400 `Role name is required`), `description`, and `permissions` (array).
- **Validation:** an existing role with the exact same `name` returns 400 `A role with this name already exists` (server.js:11300-11305). The check is case-sensitive, matching `roles_name_key UNIQUE (name)` (S:3547).
- **Logic:** INSERT the role. If `permissions` is a non-empty array, `UPDATE roles SET permissions = $1` follows as a separate statement with no transaction (server.js:11308-11322). The request body is logged in full (server.js:11291).
- **Permission string format (built by the UI):** `<featureId>:read|write|execute|approve` for each feature in `APP_FEATURES`, and `tag:<lower-cased tag name>:read|edit` for each governance tag (RoleManagement.jsx:372-402).
  - UI coupling rules: checking `write` or `execute` also checks `read`; unchecking `read` clears `write` and `execute` (RoleManagement.jsx:224-248).
  - For tags, `edit` also checks `read`, and unchecking `read` clears `edit` (RoleManagement.jsx:268-275).
- **Output 201:** the full role row. Errors return 500 `Failed to create role`.

### 24. PUT /api/roles/:id (update role)
- **Trigger:** RoleManagement edit modal. If `updateRole` fails, the UI sends the same PUT again with `Authorization: Bearer <localStorage token>` (RoleManagement.jsx:439-459).
- **Handler:** server.js:11334-11407. JWT auth. The `role_edit` check is commented out (server.js:11340-11345).
- **Rules:**
  - `name` is required (400).
  - 404 if the role is missing.
  - A role whose current name is `admin` (case-insensitive) cannot be renamed to anything other than `admin` (case-insensitive): 400 `The Admin role name cannot be changed` (server.js:11367-11371).
  - Another role with the exact same name returns 400 `Another role with this name already exists` (server.js:11374-11381).
  - The **permissions of the Admin role can be changed**; only its name is protected. Other system roles (`Vendor`, `Data Steward`, ...) can be renamed.
- **Logic:** UPDATE `name`, `description` and `updated_at`. If `permissions` is an array, a separate UPDATE replaces `roles.permissions`, again with no transaction (server.js:11384-11397). Params and body are logged to the console (server.js:11336-11351).
- **Output 200:** the full updated role row. Errors return 500 `Failed to update role`.

### 25. DELETE /api/roles/:id
- **Trigger:** RoleManagement single delete, through `deleteRole`. The UI blocks `admin` (any case) before calling (RoleManagement.jsx:472-505).
- **Handler:** server.js:11410-11453. JWT auth. The `role_delete` check is commented out (server.js:11412-11417).
- **Rules:**
  - 404 if the role is missing.
  - A role named `admin` (case-insensitive) returns 400 `The Admin role cannot be deleted` (server.js:11428-11430).
  - If any `user_roles` row exists for the role, 400 `Cannot delete role because it is assigned to users. Reassign users to other roles first.` (server.js:11433-11443).
- **Logic:** `DELETE FROM roles WHERE id = $1`. Group links (`access_group_roles`) and policy links (`role_policy_attachments`) are not cleaned up here (server.js:11446).
- **Output 200:** `{ message:'Role deleted successfully' }`. Errors return 500 `Failed to delete role`.

### 26. FE /users - UserManagement page
- **Route:** src/App.jsx:402, inside `ProtectedRoute`, which checks only that the user is logged in (App.jsx:175-189). The page does no permission check of its own; the check is commented out (UserManagement.jsx:125-130).
- **Calls:** entry points 3, 12, 13, 14, 15, 16, 17 and 18, plus `PUT /api/users/:id`.
  - **Create** calls `POST /api/users/register` (AUTH), sending `{username, password, email, first_name, middle_name, last_name, phone_number, auth_provider:'local', internal_user, user_type, roles:[role names]}` (UserManagement.jsx:45-57, :411-412; src/api/authService.js:81-83).
  - **Password reset requests** are shown to `hasRole('Admin')` and call `/api/password-reset-requests*` (AUTH) (UserManagement.jsx:155-231, :681-691).
- **What the register handler does with the create payload (backend/services/enhancedAuthService.js:165-334):**
  - Requires username, email and password.
  - Applies the same phone rules as entry point 9, and password strength is checked.
  - Username or email already present, compared case-insensitively, returns `Username or email already exists`.
  - bcrypt cost `10` (enhancedAuthService.js:241).
  - `auth_provider = 'local'`, `failed_login_attempts = 0`, and `internal_user` defaults to `false`.
  - Each role is resolved by id or name; unknown roles are skipped with a warning (enhancedAuthService.js:283-316).
  - Returns 201 `{message, user}` or 400 `{error:'Registration failed', message, errors}` (userManagement.js:53-68).
- **Client-side rules:**
  - Username: required, 3 to 50 characters, create only, read-only on edit (UserManagement.jsx:304-315, :897-899).
  - Email: required, must contain `@`, plus a domain check and the regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` (UserManagement.jsx:317-337).
  - Phone: digits only, at most 10 (UserManagement.jsx:293-302, :344-346).
  - At least one role is required (UserManagement.jsx:405-408).
  - The password field appears only when `auth_provider === 'local'` (UserManagement.jsx:906).
  - User type options are `FTE`, `Consultant` and `Vendor`. The "Internal User" checkbox is disabled when the type is `Vendor` (UserManagement.jsx:1015-1030).
  - The role named `Viewer` is hidden from the role checkboxes (UserManagement.jsx:1050).
  - The default for `internal_user` on create is `false` (UserManagement.jsx:255).
- **Status badge:** `Locked` when `locked_until > now`, `N Failed` when `failed_login_attempts > 0`, otherwise `Active`. Auth provider is shown as `Okta SSO` when `auth_provider === 'okta'`, else `Local` (UserManagement.jsx:763-810).
- **Delete controls:** shown when `useDeletePermission('users').canDelete`, which is `hasWritePermission('users')` (src/hooks/useDeletePermission.js:6, :40-47). The current user's row cannot be selected or deleted (UserManagement.jsx:572-582, :775, :832).

### 27. FE /roles - RoleManagement page
- **Route:** src/App.jsx:403, inside `ProtectedRoute`. The page permission check is commented out (RoleManagement.jsx:82-87).
- **Calls:** entry points 20, 23, 24, 25 and 19.
- **Permission matrix:** built from the frontend config `APP_FEATURES`/`FEATURE_CATEGORIES` (src/config/appFeatures.js), not from the `permissions` table. The `permissions` rows returned by init-data are stored in `availablePermissions` but never read (RoleManagement.jsx:17, :109; grep shows no other use).
  - Features marked `isParentOnly` are skipped.
  - `execute` exists only when `supportsExecute` is set, and `approve` only when `supportsApprove` is set (RoleManagement.jsx:120-135).
  - Tag permissions come from `governanceTags`, keyed by the lower-cased tag name (RoleManagement.jsx:138-147).
  - "Select all" is available globally, per category and for tags (RoleManagement.jsx:285-345).
- **Delete controls:** gated by `useDeletePermission('roles')`, which is `hasWritePermission('roles')` (useDeletePermission.js:5). The table shows `user_count` per role (RoleManagement.jsx:749).

## Data touched

| Table | Access | Where |
|---|---|---|
| users | R (list/detail/profile/lookups); W (profile, admin edit, password, unlock, delete) | userManagement.js:333, :390, :581, :665, :781, :1277; userRepository.js:22-89 |
| user_roles | R; W (replace on edit, delete on user delete/role bulk delete) | userManagement.js:679-714, :1257, :1436; server.js:11169, :11433 |
| roles | R; W (create/update/delete; `permissions` text[] column, S:3545) | server.js:11308-11322, :11384-11397, :11446; userManagement.js:1440 |
| permissions | R only (S:3450: name unique, resource+action unique) | server.js:11179, :11273 |
| role_permissions | not written by USR; read at auth time | backend/src/middleware/authenticate.js:228-234 |
| governance_tags | R (role tag matrix) | server.js:11180 |
| user_policy_attachments, user_groups, user_attributes, user_sessions, refresh_tokens, user_uuid_mapping, project_members, access_group_members, file_audit_details, password_reset_requests, policy_evaluation_cache | D on user delete | userManagement.js:1260-1274, :1348-1359 |
| role_policy_attachments | D on role bulk delete | userManagement.js:1437 |
| vendors, vendor_agreements, transformation_mappings, vendor_file_profiling_results, projects | R (dependencies); W (transfer) | userManagement.js:831-877, :1159-1204 |
| Cache keys `user:<id>` (TTL 300 s) and `permissions:user:<id>` (TTL 600 s) | Read by the JWT middleware; not invalidated by any USR write | userRepository.js:12, :108-150; backend/src/middleware/authenticate.js:188, :295 |

Related startup behaviour (PLT): at boot, if the user with username `admin` has **no** `user_roles` rows, it is given the roles `Admin`, `Vendor Manager` and `Governance Manager` (backend/migrations/repairCleanPublishDashboardPrerequisites.js:3-25; server.js:14073).

How permissions are computed (JWT middleware, used by the server.js role routes and by other areas):
- Effective roles are the direct roles plus roles inherited from access groups through `user_groups` and `access_group_roles` (backend/src/middleware/authenticate.js:162-201).
- The base permissions are `dashboard:read`, `file_profile:read` and `quality_checks:read` (authenticate.js:218-222).
- To these are added `role_permissions` objects `{name, resource, action}` and the `roles.permissions` strings (authenticate.js:228-283).

The JWT access token carries `{id, username, email, roles, internal_user, user_type}` and no permissions (backend/src/services/authService.js:22-29). Expiry is `JWT_EXPIRATION` with default `30m`, and the refresh token's is `7d` (backend/src/config/environment.js:36-37).

## Flags

### SECURITY
1. **Any authenticated user can create, edit and delete roles and set their permissions.** The authorization checks on POST, PUT and DELETE `/api/roles` are commented out (server.js:11284-11289, :11340-11345, :11412-11417). The permission strings written here, for example `users:write`, give admin-level access wherever `userHasAdminAccess` runs with JWT-loaded permissions (permissionHelpers.js:85-91). Example: `requireAdmin` (server.js:5417-5427). The Admin role's permissions can be edited (server.js:11367-11397).
2. **Admin user creation goes through unauthenticated self-registration that accepts `roles`.** `POST /api/users/register` has no auth (userManagement.js:53) and assigns any role id or name that is supplied (enhancedAuthService.js:283-316). Anyone can register as `Admin`. The endpoint is owned by AUTH; it is recorded here because it is the USR create-user path (src/api/authService.js:81-83).
3. **User directory and PII are open to every authenticated user.**
   - `GET /api/users` and `/init-data` return all users with lockout state (userManagement.js:19, :440).
   - `/by-role/:roleName` returns phone and address fields (userManagement.js:217-270).
   - `/roles` lists every role (userManagement.js:165).
   - `/api/roles/init-data` and `/api/roles` return `r.*`, including each role's `permissions` (server.js:11168, :11237). In contrast, `GET /api/users/roles/:id` is admin-only (userManagement.js:182).
4. **JWT\* accepts refresh tokens.** `backend/middleware/authenticate.js` has no `type === 'refresh'` check, whereas the JWT middleware has one (backend/src/middleware/authenticate.js:41-46). A 7-day refresh token (environment.js:37) can therefore call every non-admin `/api/users/*` route, including `GET/PUT /profile`, which use only `req.user.id`.
5. **Revocation is stale.**
   - Under JWT\*, roles come from the token issued at login, so removing a user's Admin role or deleting the user takes effect only when the token expires (default 30 min) (backend/middleware/authenticate.js:32-35).
   - Under JWT, `user:<id>` (300 s) and `permissions:user:<id>` (600 s) are never invalidated by PUT `/api/users/:id`, the role routes or user delete. A deleted user keeps authenticating until the cache entry expires (userRepository.js:108-150; authenticate.js:206-211, :295). The only invalidation of `permissions:user:*` found is in groupRoutes (backend/routes/groupRoutes.js:15-38). The helpers `invalidateRolePermissions` and `invalidateAllPermissions` use a different key pattern (`permissions:roles:*`) and are unused (backend/config/redis.js:235-245).
6. **Audit data is destroyed on user delete.** `file_audit_details` rows for the user are deleted (userManagement.js:1272, :1357).
7. **No guard against removing the last admin.** An admin can strip their own roles, or every role, through `roles: []` (userManagement.js:677-679). Only self-delete is blocked.

### BUG
1. **Internal users with dependencies cannot be deleted through the UI.** For a non-vendor user, eligible-replacements returns internal users only (userManagement.js:944-961). Transfer-ownership then rejects any target that is not `internal_user === false && user_type === 'Vendor'` (userManagement.js:1113-1118). The two rules contradict each other, so the transfer-and-delete flow always fails with 400 for internal users.
2. **Transfer overwrites agreement `manager_contact` too broadly.** `manager_contact = targetEmail` is set on every matched agreement, including rows matched only because the source was an approver (userManagement.js:1166-1178).
3. **Bulk-delete self-check depends on the id type.** `userIds.includes(req.user.id)` uses strict equality on raw body values (userManagement.js:1320). String ids skip the guard; ids are also not parsed for the queries (userManagement.js:1339).
4. **Two role-delete endpoints with different rules.**
   - Single delete: refuses roles with users; protects only `admin`, case-insensitive (server.js:11428-11443).
   - Bulk delete: silently unassigns users and deletes; protects 5 names, case-sensitive, and the list leaves out `Vendor Manager`, which is a bootstrap admin role (userManagement.js:1407, :1436-1440; repairCleanPublishDashboardPrerequisites.js:3).
   - So a role in use, or a role spelled `admin`, can still be removed through the bulk path.
5. **Role create and update are not atomic.** The INSERT/UPDATE and the separate `permissions` UPDATE run without a transaction (server.js:11308-11322, :11384-11397).
6. **Validation gaps return 200 with empty data or 500 instead of 4xx.**
   - `PUT /profile` returns 200 with `user: undefined` when the row is missing (userManagement.js:428-431).
   - `GET /:id/dependencies` returns 200 for a nonexistent user (userManagement.js:809-887).
   - Non-numeric `:id` passes `NaN` into queries (userManagement.js:178, :482). A negative `limit` or `page` produces a negative LIMIT/OFFSET (userManagement.js:20-22; userRepository.js:79-86). These become database errors.
7. **AlertsConfig recipient picker sees only 10 users.** It calls `GET /api/users` without `limit`, so the default of 10 applies (src/pages/AlertsConfig.jsx:74; userManagement.js:21).
8. **eligible-replacements shows `[null]` roles.** `roles` is `ARRAY_AGG` without null filtering, so users without roles get `[null]` (userManagement.js:932, :949).
9. **Admin password reset bypasses history.** PUT `/api/users/:id` with a password does not check reuse against `password_history` (userManagement.js:640-673 vs passwordSecurity.js:91-104).
10. **Protected roles can be renamed.** The `Data Steward` lookup uses the exact name `'Data Steward'` (userManagement.js:292), and the Vendor rules use `user_type 'Vendor'`. Renaming system roles through PUT `/api/roles/:id` is allowed for every role except Admin (server.js:11367-11371).

### DUPLICATE
1. **GET /api/users is implemented twice.**
   - server.js:11087 (shadowed): ordered by id ASC, no search, pagination keys `page`/`limit`, no lockout fields.
   - userManagement.js:19 (live): ordered by created_at DESC, has search, keys `currentPage`/`pageSize`, includes lockout fields.
2. **The user list is repeated in `/api/users` and `/api/users/init-data`**, which adds roles (LIMIT 100) (userManagement.js:19-47 vs :440-475).
3. **Role listing exists four times:**
   - `GET /api/roles` (param `limit`);
   - `GET /api/roles/init-data` (param `pageSize`, plus permissions and tags), with an identical role query (server.js:11167-11174 vs :11236-11243);
   - `GET /api/users/roles` (all roles, 3 columns);
   - the roles inside `GET /api/users/init-data` (LIMIT 100).
4. **Role delete:** DELETE `/api/roles/:id` vs POST `/api/users/roles/bulk-delete` (see BUG 4).
5. **User delete:** the cascade over 13 tables is copied in DELETE `/:id` and in bulk-delete (userManagement.js:1257-1277 vs :1348-1362).
6. **Dependency queries** are copied between `/:id/dependencies` (lists) and `/bulk-dependencies` (counts) (userManagement.js:831-877 vs :1007-1035).
7. **User create and hashing:**
   - `registerLocalUser` uses bcrypt cost `10` (enhancedAuthService.js:241).
   - PUT `/api/users/:id` and change-password-required use `SECURITY_CONFIG.BCRYPT_SALT_ROUNDS`, default `12` (userManagement.js:652, :134).
   - `userRepository.create/update/remove` also exist: they use uuid ids, auto-create missing roles and use constraint names that do not match prod. They are unused (see DEAD).
8. **Phone validation** is written four times: userManagement.js:373-388, :559-574; enhancedAuthService.js:200-215; UserManagement.jsx:293-302.
9. **Admin determination is implemented several ways:**
   - `userHasAdminAccess`: an `Admin`/`admin` role, or the permission `users:write`, `roles:write` or `project_management:write` (permissionHelpers.js:42-92).
   - `userHasAllProjectAccess`, which also accepts `all_projects:read` (permissionHelpers.js:60-73).
   - Frontend `hasRole('Admin')`, which also has a legacy `role_id` map `1:Admin, 2:Creator, 3:Executor` (src/context/AuthContext.jsx:544-590).
   - Frontend `hasWritePermission('users'|'roles')` for delete controls (useDeletePermission.js:40-47).
   - Under JWT\*, only the role-name branch can ever pass, because the token has no `permissions` (authService.js:22-29).
10. **Vendor-user identification:**
    - Attribute rule `internal_user === false && user_type === 'Vendor'`: by-role, transfer-ownership and `isVendorUser` (userManagement.js:221-240, :1113; backend/utils/userHelpers.js:11-18).
    - `vendor_id` rule: eligible-replacements and the transfer same-vendor check (userManagement.js:927, :1138).
11. **Role-permission storage** has two places, the `roles.permissions` text[] column and the `role_permissions` junction. USR writes only the column (server.js:11318-11321); both are read (authenticate.js:228-283).

### DEAD
1. The `GET /api/users` handler in server.js (server.js:11087-11141) is shadowed by the router mounted at server.js:5355.
2. `userRepository.create`, `update` and `remove` have no callers (grep of `userRepository.(create|update|remove)` finds only their own log strings; backend/src/repositories/userRepository.js:203-498).
3. `invalidateRolePermissions` and `invalidateAllPermissions` (backend/config/redis.js:235-245) have no callers.
4. Frontend `getRoles`, `getPermissions` and `getAllUsers` (src/api/authService.js:56, :128, :199) have no calls in src. `getAllUsers`/`getRoles` are imported unused in UserManagement.jsx:12, and `getPermissions` in RoleManagement.jsx:6. `availablePermissions` is set but never read (RoleManagement.jsx:17, :109).
5. In the userManagement.js handlers, `userRoles` is computed and never used (userManagement.js:181, :485, :550, :772, :813, :900, :985, :1071, :1221, :1302, :1385).
6. `isInternalUser` and `getUserTypeDescription` (backend/utils/userHelpers.js:25-49) are not imported anywhere. Only `isVendorUser` is imported (grep `userHelpers`).

### UNCLEAR
1. **`internal_user` defaults to `false`** for users created through the UI and register (UserManagement.jsx:255; enhancedAuthService.js:174), while `isInternalUser` treats only an explicit `false` as external (userHelpers.js:28-29). So a newly created FTE is "external" unless the checkbox is ticked.
2. **The UI disables, but does not clear, `internal_user` when type is `Vendor`** (UserManagement.jsx:1030). A Vendor-typed user can therefore keep `internal_user = true` and then fails the `isVendorUser` rule.
3. **Unlock always sets `must_change_password = TRUE`**, even for users who were not locked (userManagement.js:785).
4. **JWT\* verifies with `process.env.JWT_SECRET`** (backend/middleware/authenticate.js:26-32), but tokens are signed with `SECURITY_CONFIG.JWT_SECRET`. Outside production, that value is replaced by a random secret when the env var is missing (backend/src/config/environment.js:72-80). In that case JWT\* returns 500 `Authentication service configuration error`.
5. **Role-edit fallback.** When `updateRole` fails, the UI sends a second PUT with an explicit bearer token (RoleManagement.jsx:439-459). The reason is not visible.
6. **The `Viewer` role is hidden** from the user role picker but not from role management (UserManagement.jsx:1050).
7. **PUT `/api/users/:id` can set a password on an `okta` user**, because `auth_provider` is not checked (userManagement.js:634-674). The UI hides the field only for non-local users (UserManagement.jsx:906).

## Domain terms

- **User / account.** A row in `users`. `auth_provider` is `local` or `okta` (S:6605; UserManagement.jsx:783-784).
- **Internal user / external user.** The `internal_user` boolean (S:6611).
- **User type.** `user_type`: `FTE`, `Consultant` or `Vendor` in the UI (UserManagement.jsx:1015-1018).
- **Vendor user, vendor contact and vendor organisation.**
  - "Vendor user" and "vendor contact" are the same thing: `internal_user=false AND user_type='Vendor'` (userHelpers.js:17; userManagement.js:1113).
  - "Vendor organisation" is `users.vendor_id`. `vendors.vendor_user_id` is the vendor's assigned user.
- **Role.** A named bundle of permission strings (`roles`). In the UI the strings map to "features" (`APP_FEATURES` ids).
- **System role / protected role.** `Admin, User, Vendor, Governance Manager, Data Steward` (bulk delete) or only `Admin` (single delete and rename).
- **Bootstrap admin roles.** `Admin, Vendor Manager, Governance Manager`.
- **Permission.** Takes several forms:
  - `resource:action` strings, for example `users:write` or `tag:<tag>:read`;
  - `permissions` table rows `{name, resource, action}`;
  - legacy names such as `user_view`, `role_create`, `role_edit`, `role_delete` in commented-out code (server.js:11091, :11286, :11342, :11414).
  - Actions are `read`, `write`, `execute` and `approve` for features, and `read` and `edit` for tags.
- **Feature.** The UI/menu unit derived from a permission prefix (`mapPermissionsToFeatures`, backend/src/middleware/authenticate.js:97-155). It is the same concept as the "featureId" in role permissions.
- **Group-inherited roles / effective roles.** Roles that come from access-group membership (authenticate.js:162-201).
- **Admin access / admin-level access / all-project access.** Overlapping helper concepts (permissionHelpers.js:60-92).
- **Dependencies / associated assets / ownership.** Vendors, agreements, mappings, "catalogs" and projects tied to a user. "Catalogs" means `vendor_file_profiling_results`, shown in the UI as "Uploaded Files" (TransferOwnershipModal.jsx:144).
- **Eligible replacement / replacement user / vendor contact.** The target of an ownership transfer.
- **Data Steward.** A role name used for steward pickers.
- **Locked / unlock / failed attempts / must_change_password / force_password_change.** Lockout and forced-change state. `force_password_change` and `must_change_password` are two separate columns (S:6610, :6613).

## Open questions

1. Which src files call `GET /api/users/roles` (VendorRoleManagement.jsx) and `GET /api/users/by-role/vendor` (VendorUserManagement.jsx)? They appear only in coverage reports, and those pages were not checked in src or App.jsx.
2. Nothing in src calls `GET/PUT /api/users/profile` or `GET /api/users/:id`. Grep found only coverage traces for `/:id`. Are they used by any client, or are they dead?
3. Do foreign keys on `vendors.vendor_user_id`, `projects.owner_id`, `access_group_roles.role_id`, `role_policy_attachments.role_id`, `vendor_users` and the other user-referencing tables exist in prod? This decides whether user and role deletes fail with a database error or leave orphaned references. Only the DDL of `users`, `roles`, `permissions`, `user_roles` and `role_permissions` was read (S:6585, :3540, :3450, :6553, :3896).
4. What does the global error handler `backend/middleware/errorHandler.js` (server.js:14040-14041) return for errors re-thrown from the userManagement routes, such as unique violations on `users_email_unique`? It was not read. The `backend/src/middleware/error-handler.js` mapping (409 on `23505`) is not the one mounted.
5. Which roles and permissions are seeded (backend/scripts/seedProduction.js, backend/migrations/ensureFileUploadPermissions.js)? The `permissions` table content and whether `role_permissions` is populated were not traced.
6. Is the 10-user default in AlertsConfig intended? Is the `Viewer` role still meaningful?
