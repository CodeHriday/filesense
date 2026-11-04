# GOV - Data governance

## Summary
All 29 HTTP handlers are in server.js (L8602-8667, L8962-9824). There is also a service, `persistGovernanceMetadata` (backend/services/governanceService.js:29), which PROC calls, and a permission helper `hasTagPermission` (backend/services/columnAccessControl.js:69). The FE route /tag-management (src/pages/TagManagement.jsx) calls only `/api/governance-tags`. `/api/governance-policies` is used by src/pages/PolicyManagement.jsx. DataProfile.jsx also calls GOV endpoints (not traced).

Authentication has three patterns:
- Routes with explicit `authenticateToken`.
- `GET /api/files/:fileId/...` routes with no middleware of their own. They are covered because `app.use('/api/files', authenticateToken, schemaHistoryRoutes)` is registered earlier (server.js:5283) and runs for every path under /api/files. This holds only if that registration succeeded; it sits inside a try/catch (server.js:5278-5285).
- `GET /api/governance-policies*` and `GET /api/governance-tags*`, which have no authentication at all.

Authorisation is inconsistent. It uses three different checks: a `file_governance:write` permission, a `policies:write` permission, and `requireAdmin`. Several write routes check nothing beyond a valid login.

GET responses are cached 300s per user (`cache:<userId|anonymous>:<url>`) (backend/middleware/cacheMiddleware.js:19-23, :31).

## Entry points
Common: `authenticateToken` = backend/src/middleware/authenticate.js:17 (not traced). `requireAdmin` = server.js:5417, which calls `userHasAdminAccess` (server.js:380). That function accepts role Admin/admin, or admin-equivalent permissions such as `users:write` and `roles:write` (server.js:397-399; full list not read). Errors are 500 with a generic message unless stated.

### File ownership
- GET /api/files/:fileId/ownership (server.js:8602). Auth: implicit (see Summary). Returns the `file_ownership` row. 404 `No ownership record found for this file` if there is none (:8611-8613).
- POST /api/files/:fileId/ownership (:8623). Auth: JWT only, no permission or ownership check. Body `owner_name, owner_email, owner_contact`, no validation. Upserts on `file_id` and sets `owner_user_id = req.user.id`, so every POST overwrites the owner with the caller (:8629-8634). Invalidates `cache:*:*ownership*`. Returns the row with 200.
- PUT /api/files/:fileId/ownership (:8645). Auth: JWT only. Updates name, email and contact. Does not change `owner_user_id`. 404 `Ownership record not found` (:8658).
- PUT /api/files/:fileId/sensitivity (:9417). Auth: JWT only, no permission check. Requires `sensitivity_level` (400), which must be one of `['Public','Internal','Confidential','Restricted']` (:9427). If no `file_ownership` row exists it inserts one with `owner_user_id = req.user.id` (:9440-9446). Otherwise it updates the existing row. The file's existence is not checked beyond the FK (an FK failure would return 500). The cache invalidation pattern is `cache:*:*files*`.

### Column sensitivity tags (table column_sensitivity_tags)
- GET /api/files/:fileId/columns/sensitivity-tags (:8962). Implicit auth. All rows for the file, ordered by `column_name`.
- GET /api/files/:fileId/columns/:columnName/sensitivity-tag (:8979). Implicit auth. 404 if absent. `columnName` is not URL-decoded here (Express decodes route params itself).
- POST same path (:9000). Requires `req.user.permissions` to include `file_governance:write`, else 403 (:9003). The level is `req.body.sensitivity_level || req.body.classification_level` (legacy alias) (:9012). It is required (400) and must be one of `['Public','Internal','Confidential','Restricted','PII']` (:9019). Upserts on `(file_id, column_name)` and records `tagged_by = req.user.username || 'user'` (:9030). Invalidates the file cache and `cache:*:*sensitivity*`.
- DELETE same path (:9046). JWT only, no permission check (inconsistent with POST). 404 if absent. Returns `{message, tag}`.

### Governance policies (table governance_policies)
- GET /api/governance-policies (:9074). No auth. All policies, `ORDER BY created_at DESC`.
- GET /api/governance-policies/:policyId (:9088). No auth. 404 `Policy not found`.
- POST /api/governance-policies (:9109). Requires `policies:write` (403, :9112). `policy_name` is required (400). `policy_id = uuidv4()` (:9126). `rules` is stored as JSON, default `{}` (:9132). Returns 201. A 23505 error returns 409 `Policy ID already exists`.
- PUT /api/governance-policies/:policyId (:9146). Requires `policies:write`. Overwrites name, description and rules unconditionally, so a missing `policy_name` is passed through as null (:9164). 404 if not found.
- DELETE /api/governance-policies/:policyId (:9179). Requires `policies:write`. 404 if not found. Returns `{message, policy}`. Dependent assignment rows depend on FK behaviour (not verified for the column policy table).
- Rule content (`retention_days`, `access_control`, `encryption_required`) is defined only by the FE (see GRP.md:189). The server stores it opaquely.

### File policy assignments (file_policy_assignments)
- GET /api/files/:fileId/policies (:9210). Implicit auth. Join with policy fields, `ORDER BY assigned_at DESC`.
- POST /api/files/:fileId/policies (:9231). Requires `file_governance:write`. `policy_id` is required (400). Upserts on `(file_id, policy_id)` and refreshes `assigned_at` (:9251). Returns 201. FK error 23503 returns 404 `Policy not found`; the same code is also raised for a non-existent file, so the message is misleading.
- DELETE /api/files/:fileId/policies/:policyId (:9268). Requires `file_governance:write`. 404 if the assignment is absent.

### Governance tags (governance_tags)
- GET /api/governance-tags (:9301) and GET /api/governance-tags/:tagId (:9315). No auth. 404 `Tag not found`.
- POST /api/governance-tags (:9336). `authenticateToken` + `requireAdmin`. `tag_name` is required (400). `tag_id = tag_<Date.now()>_<5 random bytes hex>` (:9344). Defaults are `color '#3B82F6'` and `badge_style 'default'` (:9350). Returns 201. 23505 returns 409 `Tag name already exists`. `permission_level` and `sensitivity_level`, which the FE sends, are not read (:9338).
- PUT /api/governance-tags/:tagId (:9364). Admin. Overwrites name, description, color and badge_style with whatever is in the body, so omitted fields become null. 404 or 409 as above.
- DELETE /api/governance-tags/:tagId (:9392). Admin. 404 if absent. Returns `{message, tag}`.

### File tags (file_tag_assignments)
- GET /api/files/:fileId/tags (:9748). Implicit auth.
- POST /api/files/:fileId/tags (:9769). Requires `file_governance:write`. `tag_id` is required. Upserts and returns 201. 23503 returns 404 `Tag not found`.
- DELETE /api/files/:fileId/tags/:tagId (:9806). JWT only, no permission check (the POST requires one). 404 if absent.

### Column governance tags and policies
- GET /api/files/:fileId/columns/governance (:9470). Implicit auth. Batch endpoint. Returns `{tags:{col:[...]}, policies:{col:[...]}}` (:9527). Not filtered by tag permissions.
- GET /api/files/:fileId/columns/:columnName/tags (:9538). Implicit auth. Applies `decodeURIComponent` to a param Express has already decoded.
- POST same path (:9559). JWT only. `tag_ids` must be an array (400). Replace semantics: it computes tags removed and tags added against the current set. For each tag removed or added the caller must satisfy `hasTagPermission(user, tag_name, 'edit')` (:9587, :9604), else 403. `hasTagPermission` returns true for admin; otherwise it needs the literal permission `tag:<lowercased name>:edit` (columnAccessControl.js:78). The 403 message says `:edit or :write`, but only `:edit` is checked. After the checks it deletes all assignments for the column and inserts the new ones in a single multi-row statement with no transaction (:9614-9629). Tag ids that do not exist are not checked in advance, so an FK failure would return 500 after the DELETE has already run (partial state, no transaction). Invalidates the cache via `invalidate` imported from backend/middleware/cacheMiddleware.
- GET /api/files/:fileId/columns/:columnName/policies (:9649). Implicit auth.
- POST same path (:9670). JWT only. `policy_ids` must be an array (400). Non-admin callers need `hasTagPermission(..., 'edit')` for every tag on the column (:9698). If the column has no tags, only admins may assign (403 `Required: Admin privileges.`, :9709). It then deletes all column policy assignments and re-inserts (:9718-9733), again with no transaction. An empty `policy_ids` removes all, and is subject to the same permission check.

### Service-level behaviour: persistGovernanceMetadata (governanceService.js:29)
Called after profiling (see PROC.md:395). One DB transaction (BEGIN at :50, COMMIT at :234, ROLLBACK at :249).
1. Updates `files.contains_pii` and `files.data_classification` only when provided (:58-66).
2. Deletes ALL `file_tag_assignments` for the file, including ones assigned manually via the API (:90). It then upserts a `governance_tags` row per tag name, with id `tag_<lowercased name with non [a-z0-9_] replaced by _>`, colour `#3B82F6`, and description "Auto-generated tag for X" (:100-110). Existing tag descriptions are overwritten on conflict (:108).
3. Deletes all `column_sensitivity_tags` for the file (:141). Each PII column is inserted with `sensitivity_level 'PII'` and `data_type 'string'` (:164). A per-column failure is caught and ignored (:170-177).
4. Deletes all `column_governance_tag_assignments` for the file, including manual ones (:194). It creates or reuses the PII tag (`tag_pii`, `#EF4444`, `destructive`) and assigns it to each PII column (:204-217).
5. Returns `{success:false, error}` on failure and does not throw (:257-261).
`normalizePiiColumns` (:279) accepts strings or objects with `column_name` or `name`. When a profiled schema is given, names not found in it (case-insensitive) are skipped (:301-309). It throws if a profiled schema entry has no `name`.

## Data touched
- `file_ownership`: columns `ownership_id, file_id UNIQUE, owner_user_id, owner_name, owner_email, owner_contact` (backend/migrations/createDataGovernanceTables.js:12-29). `sensitivity_level` default `'Public'` is added by backend/migrations/addSensitivityToFileOwnership.js:13.
- `column_sensitivity_tags`: UNIQUE `(file_id, column_name)` (createDataGovernanceTables.js:47). See the schema BUG in Flags.
- `governance_policies`: `rules JSONB` default `{}` (createDataGovernanceTables.js:59).
- `file_policy_assignments`: UNIQUE `(file_id, policy_id)` (createDataGovernanceTables.js:92).
- `governance_tags`, `file_tag_assignments`: backend/migrations/createGovernanceTagsTables.js (not read).
- `column_governance_tag_assignments`, `column_policy_assignments`: backend/migrations/createColumnGovernanceTables.js (not read).
- `tag_permissions` (tag_id, role_id, can_view, can_edit, UNIQUE per tag and role): backend/migrations/addTagPermissionLevels.js:33-51.
- `governance_tags` extra columns `permission_required`, `requires_view_permission`, `requires_edit_permission`, `sensitivity_level` default `'public'` (addTagPermissionLevels.js:12-18).
- `files.contains_pii`, `files.data_classification` (written by the service).
- Cache entries in Redis and memory.

## Flags
SECURITY
- S1. GET /api/governance-policies, GET /api/governance-policies/:id, GET /api/governance-tags, GET /api/governance-tags/:id have no authentication (server.js:9074, :9088, :9301, :9315). The cache key for these is `anonymous` when `req.user` is unset (cacheMiddleware.js:22).
- S2. Any logged-in user can POST or PUT file ownership (:8623, :8645) and PUT file sensitivity (:9417), DELETE a column sensitivity tag (:9046), and DELETE a file tag (:9806). Compare the permission checks on the sibling POST routes. The ownership POST also reassigns `owner_user_id` to the caller.
- S3. Column tag and column policy POSTs (:9559, :9670) rely on `hasTagPermission` only. Column policy assignment by a non-admin also needs edit rights on all the column's tags. There is no `file_governance:write` check and no check of project or file access (`checkFileProjectAccess` in columnAccessControl.js:35 is not called by these handlers).
- S4. The GET batch and column tag endpoints return tag and policy data without applying `tag:*:read` filtering (:9470). Whether the read-level tag permission is enforced elsewhere (data preview) is not traced here.
- S5. The 'implicit-JWT' routes depend on the registration at server.js:5283 inside a try/catch. If it fails to load, they would be unauthenticated.

BUG
- B1. `column_sensitivity_tags` schema mismatch. The migration creates `classification_level VARCHAR(50) NOT NULL` with no `sensitivity_level`, `tagged_by` or `tagged_at` (createDataGovernanceTables.js:39). The handlers (server.js:9025) and the service (governanceService.js:159) write `sensitivity_level`, `tagged_by` and `tagged_at`. I found no migration in backend/migrations that adds them. They could be added somewhere I did not search, so this is unconfirmed (see Open questions).
- B2. The 403 text for column tags says `tag:x:edit or tag:x:write` (:9589), but only `:edit` is checked (columnAccessControl.js:78).
- B3. Column tag and policy POSTs delete and then insert without a transaction (:9614-9629, :9718-9733). A failing insert leaves the column with no assignments.
- B4. `persistGovernanceMetadata` wipes manually assigned file tags and column PII assignments on every run (:90, :194). Manual tags via the API are lost on the next profiling run.
- B5. In the service, a per-column insert failure is swallowed (:170) inside a Postgres transaction. After an error Postgres aborts the transaction, so later statements and the COMMIT would fail and the whole result would be a rollback. The catch therefore cannot achieve its stated intent ("Don't fail entire governance persistence").
- B6. Tag `permission_level` and `sensitivity_level` from TagManagement.jsx (:55-56, :87-88, :330-339) are never persisted by POST or PUT (server.js:9338, :9367). The displayed badge always falls back to `Public`.
- B7. PUT on tags and policies overwrites all fields with the request body, so a partial body nulls fields (:9157-9164, :9367-9374).
- B8. Cache invalidation after a column sensitivity tag change uses `invalidateFileCache` (pattern `GET:/api/files/<id>*`, backend/src/middleware/cache.js:153) while the GET cache keys are `cache:<user>:<url>` (cacheMiddleware.js:23). The file-specific invalidation therefore likely does not match. The extra `cache:*:*sensitivity*` pattern does match URLs containing "sensitivity".
- B9. The 23503 handler on file policy and file tag assignment says "Policy/Tag not found" for any FK failure, including a missing file (:9260, :9798).

DUPLICATE
- D1. Two sensitivity-tag models for columns: `column_sensitivity_tags` (level text, including `PII`) versus `column_governance_tag_assignments` plus `governance_tags`. The service writes PII to both (governanceService.js:164, :214). The migration backend/migrations/migrateColumnSensitivityToGovernance.js:40 migrates from the first to the second.
- D2. Sensitivity level lists differ by endpoint. File-level has 4 values (:9427) and column-level has 5, including `PII` (:9019). `governance_tags.sensitivity_level` uses lowercase `public/restricted/private` (addTagPermissionLevels.js:26). The FE uses `Low` (TagManagement.jsx:56).
- D3. Three admin checks: `requireAdmin` (server.js:5417), `userHasAdminAccess` (:380), and FE `hasPermission('governance_tags:write') || hasPermission('users:write') || roles.includes('Admin')` (TagManagement.jsx:60). The FE accepts `governance_tags:write` but the server never checks that permission.
- D4. Two cache module imports: `./backend/middleware/cacheMiddleware` and `./backend/src/middleware/cache` (server.js:87, :9034).
- D5. Ownership exists as `file_ownership.owner_*` here. Where it is also read elsewhere was not traced.

DEAD
- X1. `tag_permissions` table: no code reads or writes it (grep found only addTagPermissionLevels.js). `governance_tags.permission_required`, `requires_view_permission` and `requires_edit_permission` are likewise not referenced by the handlers read.

UNCLEAR
- U1. `hasTagPermission` takes the permission literally as `tag:<name lowercase>:<level>`, with no link to `tag_permissions` or `permission_required`.
- U2. `classification_level` legacy alias (:9012): which clients still send it is unknown.
- U3. The service header says it uses a `classification_level` column (governanceService.js:13) while the code uses `sensitivity_level`.

## Domain terms
- Sensitivity level, classification level, data classification: the same concept under different names (`sensitivity_level`, `classification_level`, `files.data_classification`).
- Governance tag versus sensitivity tag versus PII tag.
- Governance policy (rules: retention_days, access_control, encryption_required) versus quality rules (a different area) versus `/api/policies` (GRP).
- Ownership: file_ownership with owner_user_id, name, email, contact.
- Permission level (Public/Private/Restricted in the FE, TagManagement.jsx:229-231) versus tag permission (`tag:<name>:read|edit`).
- Admin access: Admin role or admin-equivalent permissions.
- Column governance versus file tag.

## Open questions
1. Which migration or startup code adds `sensitivity_level`, `tagged_by` and `tagged_at` to `column_sensitivity_tags`? The inventory points to server.js:4508, but I found no CREATE statement there, and the column list in createDataGovernanceTables.js differs.
2. Schema and FK behaviour for `governance_tags` (columns including `created_by`, `created_at`), `file_tag_assignments`, `column_governance_tag_assignments` and `column_policy_assignments` (createGovernanceTagsTables.js, createColumnGovernanceTables.js) were not read, including ON DELETE behaviour when a tag or policy is deleted.
3. The permission names `file_governance:write` and `policies:write`: which roles receive them? (Seed data is not traced.)
4. What the DataProfile.jsx calls to these endpoints actually send. The FE usage was only partly checked (the file was listed as a caller by grep, not read).
5. The full list of admin-equivalent permissions in `userHasAdminAccess` (server.js:397-399 only partly read).
6. Whether the cache invalidation in B8 works, since cacheService key format and the `cache.js` store were not fully traced.
7. How the `governance_tags.sensitivity_level` value and `permission_required` are meant to be set, given that no endpoint writes them.
8. Whether anything enforces `file_ownership.sensitivity_level` (no consumer was traced in this area).
