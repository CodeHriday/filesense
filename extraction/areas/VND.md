# VND - Vendors & vendor portal

## Summary
Vendor records are created by users with `vendor_management:write` or admin-equivalent access. Creating a vendor also creates or reuses user accounts for the primary and backup contacts, and creates or reuses an external project (backend/services/vendorService.js:46-438). A vendor user is a user with `internal_user === false` and `user_type === 'Vendor'` (backend/utils/userHelpers.js:17).
Vendor users see their own vendor profile (vendorRoutes.js:53), and the vendor-access routes expose the projects, connections and S3 browsing that their agreements allow (vendorAccessRoutes.js).
Two vendor-file endpoints and two profiling endpoints live in server.js. The profiling endpoints have a vendor scope check that never runs (see Flags).

Mounts: `/api/vendors` with `authenticateToken` (server.js:13880-13881) and `/api/vendor-access` with `authenticateToken` (server.js:13900-13901).

## Entry points

### GET /api/vendors (vendorRoutes.js:50)
- Auth: JWT, plus the local `isVendorUser` middleware. The middleware only sets `req.isVendor` and never blocks (:38-44).
- If the caller is a vendor user and cannot manage vendors, it returns `{success, vendors:[own], isOwnProfile:true}`. A 404 is returned if no vendor row has `vendor_user_id` = the caller (:53-65; vendorService.js:557-572). That lookup has no status filter.
- Otherwise it lists vendors. Defaults are page=1 and pageSize=20, with no upper cap (:68-69). Filters are `status`, `project_id` and `search` (:72-74).
  - Without a `status` filter, `status != 'deleted'` is applied (vendorService.js:452-458).
  - Search is ILIKE on vendor_name, vendor_code and contact_email (:466-470).
  - Order is `created_at DESC`, and totalPages is `ceil(total/pageSize)`.
- Any authenticated non-vendor user without manage rights also lands in the list branch. The route has no permission check, so any JWT holder can list all vendors (:53, :67-77).
- Errors: 500 `Failed to fetch vendors`.

### GET /api/vendors/init-data (vendorRoutes.js:93)
- Auth: JWT, plus the non-blocking `isVendorUser`.
- Defaults: page=1, pageSize=10 (:99-100).
- A vendor user without manage rights gets only their own vendor.
- Everyone else gets the vendor list, including non-vendor users without manage rights. Only `search` is applied; `status` and `project_id` are ignored (:116-125).
- If `canManage` is true, it also returns:
  - Top-level projects (`parent_id IS NULL`). Users without `userHasAllProjectAccess` see only projects reached through `project_members` or group membership (:127-151).
  - All users with `internal_user = false AND user_type = 'Vendor'` (:158-172), including email, phone and state.
- Failures in the projects or users queries are logged and swallowed (:153-155, :174-176).
- Response: `{success, vendors, pagination, isOwnProfile, projects, vendorUsers, canManageVendors}`.

### GET /api/vendors/:id (vendorRoutes.js:199)
- Auth: JWT.
- Non-numeric id returns 400. Unknown id returns 404 (:203-211).
- A vendor user without manage rights gets 403 unless `vendor.vendor_user_id === req.user.id` (:214-218).
- A non-vendor user without manage rights gets no ownership check, so any JWT holder can read any vendor by id (see SECURITY).
- A backup-contact user is not the `vendor_user_id`, so they get 403 here.

### POST /api/vendors (vendorRoutes.js:232)
- Auth: `requireVendorManagement`. It allows `vendor_management:write`, or `userHasAdminAccess`, which means the admin role or `users:write`, `roles:write` or `project_management:write` (vendorRoutes.js:15-22; permissionHelpers.js:80-92). Otherwise 403.
- Inputs (vendorService.js:52-64):
  - Required: `vendor_name`, `contact_name`, `contact_email`.
  - Optional: `description`, `contact_phone`, `address`, `backup_contact_*`, `project_id`, `vendor_type`.
- Validation:
  - Email regex `^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,}$` for the primary and backup contacts (:72-80).
  - The primary and backup emails must differ, compared case-insensitively (:83).
  - Vendor name must be unique, case-insensitive (:88-95).
- Rules:
  - Vendor code is the first 3 characters of the name, uppercased, with non-letters replaced by `X`, then `-` and 6 random hex characters (:16-20). It is re-rolled until unique (:101-112).
  - The primary contact's user is looked up by `email` (case-sensitive). If found it is reused. Otherwise a user is created with username = email, a random 16-byte hex password hashed with bcrypt cost 10, `auth_provider='local'`, `first_name=contact_name`, `last_name=''`, and the `Vendor` role. A missing `Vendor` role throws (:116-170).
  - A `user_roles` row is inserted only for newly created users. A reused user does not get the Vendor role.
  - Project: if `project_id` is absent, a project is auto-created with name `VEND-<10 alnum chars of name or "VENDOR">-<8 hex>`, description `Auto-created project for vendor: <name>` and type `external` (:26-38, :177-205). If `project_id` is given, the project must exist and have `project_type === 'external'` (:213-227).
  - The primary user is added to `project_members` with `can_invite=false` and `can_manage_members=false`. `invited_by` is NULL if the creator id is not in `users` (:231-279).
  - The backup contact gets the same treatment: user reuse or creation (default first name `Backup Contact`), then project membership (:282-358).
  - The vendor row is inserted with `status='active'` and `vendor_onboarding_date=CURRENT_TIMESTAMP` (:361-373). `users.vendor_id` is set for both contacts (:377-399).
  - The whole operation runs in one transaction with ROLLBACK on error (:50, :401, :425).
- Output: 201 `{success, vendor (with project_name), userId}`. Any error, including validation, returns 400 `{error: message}` (vendorRoutes.js:237-240).
- Side effect: no email is sent. The temp password is written to the system log (vendorService.js:165-169; see SECURITY).

### PUT /api/vendors/:id (vendorRoutes.js:247)
- Auth: `requireVendorManagement`.
- Non-numeric id returns 400. `{success:false}` from the service returns 400. Any thrown error returns 400.
- Dynamic update of only the fields present: name, description, contacts, address, backup contact fields, `project_id`, `status` and `vendor_type` (vendorService.js:658-747).
- `status` is not validated here. The table check constraint allows `active`, `inactive` and `suspended` (createVendorManagement.js:39).
- An empty update returns `{success:false, error:'No updates provided'}`, which the route turns into 400 (:749-751). The transaction is not rolled back on that path, but the client is released in `finally`.
- Changing `project_id` to a truthy value:
  - Deletes all `project_members` rows for the vendor's primary user across every project (:724).
  - Inserts a membership in the new project (:727-732).
  - Does not verify that the new project exists or is external, unlike create.
- Contact change rules:
  - A changed primary email clears `users.vendor_id` on the old primary user, unless that user is the backup contact or is a contact of another vendor (:778-816).
  - It sets `vendor_id` on the user matching the new email, if one exists (:819-836). No user is created for a new primary email.
  - `vendor_user_id` on the vendor row is never updated when the primary contact changes (see BUG).
  - A changed backup email clears `vendor_id` on the old backup user, with the same guards (:840-879).
  - A new backup email creates or reuses a user, sets `vendor_id`, and adds the user to the project (:882-978).
- Duplicate check: primary and backup emails, normalised by trim and lowercase, must differ (:641-651).
- Sets `updated_at` and `updated_by` (:754-757).
- If the vendor does not exist, the pre-read throws `Vendor with ID n not found`, which returns 400 (:617-619). The `result.rows.length === 0` branch at :770 is unreachable in practice.

### DELETE /api/vendors/:id (vendorRoutes.js:273)
- Auth: `requireVendorManagement`.
- The comment says "deactivate", but the service performs a hard delete (vendorService.js:1069-1071, :1262-1265).
- Blocked if any agreement for the vendor is `status='active'`, `is_locked=true` or `approval_status='fully_approved'` (:1002-1046, :1099). The result is `{success:false, error:'Cannot delete vendor - has N active agreement(s), ...', canDelete:false, dependencies}`.
- The route maps every `success:false` to 404, so a blocked delete returns 404 (vendorRoutes.js:283-285).
- Agreements in `draft`, `inactive` or `archived` do not block. Whether agreements cascade or block through a foreign key is not shown (see Open questions).
- Steps in one transaction:
  1. Delete `storage_connections` whose `config.vendor_id` equals the vendor id (:1142-1148).
  2. Clear `users.vendor_id` for the primary and backup contact users, if they are not tied to another vendor (:1157-1195).
  3. Remove the primary and backup users from the vendor's project (:1198-1224).
  4. Delete the project if no other vendor uses it and it has no remaining members (:1227-1259).
  5. Delete the vendor row.
- User accounts are not deleted.
- Errors: 500 `Failed to delete vendor`.
- Dependency check: `checkVendorDependencies` runs through `query()`, outside the delete transaction's client (:1013 vs :1074).

### GET /api/vendors/project/:projectId (vendorRoutes.js:299)
- Auth: `requireVendorManagement`.
- Non-numeric id returns 400. Returns `{success, vendors}` for vendors with `project_id` = the id and `status='active'`, ordered by name (vendorService.js:1299-1311).
- Route-order note: this route is registered after `/:id`. Express matches the path `/project/5` against `/:id` only if the path has a single segment, so `/project/5` is reached correctly.

### GET /api/vendor-access/projects (vendorAccessRoutes.js:13)
- Auth: JWT from the mount. The handler repeats a 401 check (:15).
- There is no vendor-role check. The check is "has an active vendors row with `vendor_user_id` = the caller", otherwise 403 (:22-32). Because it uses `vendor_user_id`, a backup contact gets 403.
- Looks up the user's email, with a 404 if the user is missing (:37-46).
- Returns distinct projects from agreements where all of these hold (:49-66):
  - `vendor_id` = the vendor
  - `approval_status='fully_approved'`
  - `is_locked=true`
  - `status='active'`
  - `primary_contact_email` or `secondary_contact_email` equals the user's email (case-sensitive `=`)
- Response: `{success, projects:[{id,name,description,project_type}]}`. Errors return 500 with `error.message`.

### GET /api/vendor-access/connections (vendorAccessRoutes.js:87)
- Same auth and agreement conditions. `projectId` query parameter is required (400 otherwise, :96-98).
- Joins `vendor_agreements.vendor_connection_id` to `storage_connections.connection_id` where `sc.status='active'` (:128-153).
- Returns connection fields and `drop_location_path` and agreement info. `config` is reduced to `region`, `bucket` (or `bucket_name`), `container_name`, `account_name` and `gcp_bucket` (:156-176).
- `sc.path` is returned as is.
- `JSON.parse(conn.config)` is not guarded. A null config would throw on `config.region` and give 500.

### POST /api/vendor-access/browse (vendorAccessRoutes.js:197)
- Auth: JWT. Body: `agreementId` (required, else 400) and optional `s3Path`.
- Same vendor and email gates, 403 `Access denied to this agreement` if the agreement does not match (:244-266).
- If the agreement has no `vendor_connection_id`, returns 400.
- Calls `BulkProfilingService.browseS3Path(vendor_connection_id, s3Path || drop_location_path || '')` and returns `{success:true, ...contents}` (:278-286). Errors return 500 with `message`.
- The caller supplies `s3Path` without being checked against `drop_location_path` (see SECURITY).

### GET /api/vendor-files (server.js:1626)
- Auth: `authenticateToken`, `attachVendorProfile` and `cacheMiddleware(300)`. `attachVendorProfile` sets `req.vendorProfile` only for an active vendor row (vendorAccessControl.js:14-40).
- Requires one of `file_view`, `file:read`, `file_upload:read` or `vendor_file_quality:read` (server.js:1632). Otherwise 403.
- Pagination: page defaults to 1, pageSize defaults to 25 and is capped at 100 (:1649-1651).
- `userHasAllProjectAccess` (hasAdminRole, `project_management:write`, `all_projects:read`, `users:write`, `roles:write`) sees all vendor files. Others are limited to their projects. A user with zero projects gets an empty list (:1655-1666).
- Query: `files WHERE is_vendor_file = true` joined to `logical_file_groups` for `has_schema_changes`, ordered by `created_at DESC` (:1669-1701).
- Response: `{files, totalCount, page, pageSize, totalPages}`.
- The vendor's own `drop_location_path` or `vendor_id` is not used here, only project membership (see UNCLEAR).

### DELETE /api/vendor-files/bulk (server.js:1727)
- Auth: `authenticateToken`.
- Requires one of `vendor_file_quality:write`, `file_upload:write` or `admin` as a permission name (:1733).
- Body `fileIds` must be a non-empty array (400) of at most 100 (400, :1751-1758).
- Verifies `file_id = ANY($1) AND is_vendor_file = true`. A project filter is applied only when the user's project list is non-empty (:1765-1780). For a non-admin with zero projects the filter is skipped, so files in any project are deletable (see SECURITY).
- Returns 404 if none are accessible.
- Deletes `file_columns`, then `vendor_file_profiling_results`, then `files` with no transaction (:1790-1797). Other tables referencing files are not touched here.
- Invalidates the cache pattern `cache:*:/api/vendor-files*`. Response: `{success, deletedCount, message}`. Errors return 500.
- No audit trail or physical file deletion in this handler.

### GET /api/vendor-file-profiling (server.js:2336)
- Auth: `authenticateToken` only. There is no permission check.
- Query: `vendor_id`, `connection_id` (cast `::uuid`), `min_quality_score`, `max_quality_score` (`parseFloat`), `has_issues='true'` (`jsonb_array_length(issues) > 0`), `limit` (default 100) and `offset` (default 0). Limit has no cap and no NaN handling (:2338-2387, :2399-2400).
- The vendor scope `if (req.vendorProfile)` at :2354 never fires, because `attachVendorProfile` is not on this route. The result is that vendor users see all vendors' profiling results, and can filter by any `vendor_id` (see SECURITY).
- Joins files, storage_connections, vendors and users, ordered by `profiled_at DESC`.
- Response: `{results, pagination:{total, limit, offset, returned}}`.
- `min_quality_score=0` is falsy as a string? The string `"0"` is truthy, so it works.
- An invalid UUID for `connection_id` causes a DB error and 500.

### GET /api/vendor-file-profiling/:fileId (server.js:2442)
- Auth: `authenticateToken` only.
- Returns the profiling row with file, connection, vendor and uploader joins, including `uploaded_by_email` and `file_metadata`. 404 if absent.
- The vendor ownership check `req.vendorProfile && profilingData.vendor_id !== req.vendorProfile.id` (:2477) is dead for the same reason. Any JWT holder can read any file's profiling result.

### Frontend routes
- `/vendor-management` and `/vendors` render VendorManagement.jsx, wrapped only in `ProtectedRoute` (src/App.jsx:406-407). It calls `GET /api/vendors/init-data` (:85), `POST /api/vendors` (:314), `PUT /api/vendors/:id` (:329) and `DELETE /api/vendors/:id` (:365). A delete-confirm modal is used (:51, :756).
- `/vendor-file-upload` renders VendorFileUpload.jsx (App.jsx:409).
  - Agreements come from `/api/vendor-agreements?pageSize=1000&filterByMyVendor=true` (VendorFileUpload.jsx:106).
  - Upload is `POST /api/files/drop?connectionId&agreementId&folder` (:161), with `folder` = the selected folder or the agreement `drop_location_path` (:162-166).
  - Folder browsing uses `/api/vendor-access/browse` (:720).
  - Upload UI is shown if the user has write on `vendor_file_quality` or `file_drop` (:572).
  - After upload it navigates to `/profile/:fileId` (:235, :257).
- `/vendor-file-quality` renders VendorFileQuality.jsx (App.jsx:410). It calls `GET /api/vendor-files?page&pageSize` (default pageSize 25, :23, :36), and `DELETE /api/vendor-files/bulk` (:196). The delete UI is gated by `hasWritePermission('vendor_file_quality')` (:31).
- Vendor users are redirected to `/vendor-file-upload` from the home route and from the regular upload route (App.jsx:221-243).

## Data touched
- `vendors`: read and written by vendorService. Columns used include vendor_code, vendor_name, contact_*, backup_contact_*, vendor_user_id, project_id, vendor_onboarding_date, vendor_type, status, created_by, updated_by. Migration status check is `'active','inactive','suspended'` (createVendorManagement.js:39). Code also references `'deleted'` (vendorService.js:457).
- `users` (insert; `vendor_id` update; reads of `internal_user`, `user_type`), `roles` (`Vendor`), `user_roles`.
- `projects` (insert with type external; delete on vendor delete), `project_members`, `project_access_groups`, `user_groups`.
- `vendor_agreements` (read-only here), `storage_connections` (read; delete by `config.vendor_id`).
- `files` (`is_vendor_file`), `file_columns`, `logical_file_groups`, `vendor_file_profiling_results`.
- `vendor_users` table exists (backend/migrations/createVendorUsers.js:18) and is referenced only by adminCleanupRoutes.js:136, :317 and :464. No vendor route in this area uses it.

## Flags

SECURITY
1. `GET /api/vendor-file-profiling` and `/:fileId` (server.js:2336, :2442) have no permission check and no working vendor scope. `req.vendorProfile` is never set because the route lacks `attachVendorProfile`, so the checks at :2354 and :2477 never fire. Any logged-in user can read every vendor's profiling results, including `uploaded_by_email`.
2. `DELETE /api/vendor-files/bulk` (server.js:1777-1780): a non-admin with zero accessible projects skips the project filter and can delete any `is_vendor_file` rows, provided they hold one of the write permissions.
3. `GET /api/vendors` and `GET /api/vendors/:id` (vendorRoutes.js:50, :199) have no permission requirement for non-vendor users. Any JWT holder without manage rights falls into the list branch or the id lookup, so all vendor contact data is exposed.
4. `POST /api/vendor-access/browse` (vendorAccessRoutes.js:204, :278-281): the caller's `s3Path` is passed to the connection browser with no check that it lies under the agreement's `drop_location_path`. A vendor can browse the whole bucket of the vendor connection.
5. A temporary password for new vendor users is written to the application log (vendorService.js:165-169). Comment: "In production, this should be sent via email". No email is sent anywhere in the flow, so new vendor accounts have an unknown random password.
6. The vendor-access routes do not check roles or user attributes, only an active `vendors` row linked by `vendor_user_id` (vendorAccessRoutes.js:22-32).
7. `/api/vendor-files` caches for 300 seconds. The cache key includes the user id (cacheMiddleware.js:22 shows `userId` used), but this was not fully traced. See Open questions.

BUG
1. A blocked vendor delete returns HTTP 404 instead of a conflict code (vendorRoutes.js:283-285), because every `success:false` is mapped to 404.
2. The DELETE route comment says "Delete (deactivate)" (vendorRoutes.js:270), but the service hard-deletes (vendorService.js:1262).
3. `updateVendor` never updates `vendors.vendor_user_id` when the primary contact email changes (vendorService.js:778-837). After a change, `vendor_user_id` still points to the old user, so the vendor-access routes (which match `vendor_user_id`) keep authorising the old user and reject the new one.
4. The unique-vendor-name check is run only on create. Update accepts any `vendor_name` (vendorService.js:658-662).
5. On update, changing `project_id` deletes the vendor user's membership in every project, not just the vendor's previous project (vendorService.js:724).
6. `createVendor` reuses an existing user without assigning the `Vendor` role (vendorService.js:123-126). The email lookup is case-sensitive, while the contact-equality checks are case-insensitive (:83 vs :116-119).
7. `checkVendorDependencies` uses `totalCount = Math.max(...)` of the three lists, not a distinct count (vendorService.js:1047-1051).
8. `updateVendor` no-updates path returns without ROLLBACK or COMMIT (vendorService.js:749-751). The client is released in `finally`, so the transaction is left open until the connection is reused or the session ends.
9. `/api/vendor-access/connections` crashes with 500 if `sc.config` is null (vendorAccessRoutes.js:157-171).
10. `getAllVendors` filters out `status != 'deleted'` while the migration CHECK permits only `active`, `inactive` and `suspended`. The `'deleted'` value can never be stored unless a later migration changes the check (not verified).

DUPLICATE
1. Three overlapping vendor-detection mechanisms: `isVendorUser(user)` on user attributes (userHelpers.js:11), `attachVendorProfile` on an active `vendors` row (vendorAccessControl.js:14), and the inline vendor lookups in vendorAccessRoutes.js (lines 22, 101, 214). They differ in what counts as a vendor. `getVendorByUserId` has no status filter (vendorService.js:568), the others require `status='active'`.
2. Backup-contact user creation is copied three times: create (vendorService.js:286-339), and update (:891-943). Primary-user creation (:137-163) is a fourth variant.
3. The vendor-files list at server.js:1626 duplicates `/api/files` with `is_vendor_file = true` (see FILE.md:312). Admin checks vary: `userHasAllProjectAccess` in server.js versus `userHasAdminAccess` in vendorRoutes.js versus `roles.includes('Admin')` in vendorAccessControl.js:86, :115.
4. Permission name checks are hand-rolled inline in server.js:1630-1635 and :1731-1736, while `hasPermission` exists in vendorPermissions.js:14.

DEAD
1. `filterVendorFiles`, `requireOwnVendorAccess` and `requireOwnAgreementAccess` (vendorAccessControl.js:46, :83, :112) are not used in server.js. Only `attachVendorProfile` and `filterVendorFiles` are imported (server.js:91), and `filterVendorFiles` is never applied there. Whether other files use `requireOwnVendorAccess` or `requireOwnAgreementAccess` was not checked.
2. `isUserVendor` and `getVendorIdForUser` (vendorAccessControl.js:172-199) were not shown to be used.
3. `requirePermission`, `checkPermission` and `hasAnyPermission` (vendorPermissions.js:36-96) were not shown to be used in this area. Only `hasPermission` is imported in vendorRoutes.js.
4. The `vendor_users` table has no code path in this area.
5. The vendor-scoping branches inside `/api/vendor-file-profiling` (server.js:2354-2357, :2477-2479) can never run.
6. The `result.rows.length === 0` branch in `updateVendor` (vendorService.js:770-773) is unreachable after the pre-read.

UNCLEAR
1. `/api/vendor-files` does not filter on the vendor's `vendor_id` or drop path, only on project membership. Vendor users are added to an external project on creation, so project scoping may be the intended vendor boundary.
2. `isVendorUser` middleware in vendorRoutes.js gives the vendor branch to users with `internal_user=false` and `user_type='Vendor'` only. A user with the `Vendor` role but different attributes is not treated as a vendor.
3. In `updateVendor`, a vendor with a changed contact leaves the old user as a project member.

## Domain terms
- Vendor / vendor user / vendor contact: the `vendors` row, the user with `vendor_user_id`, and the contact emails. Users are flagged by `internal_user=false` plus `user_type='Vendor'`, and `users.vendor_id`.
- Primary contact (`contact_*`) and backup contact (`backup_contact_*`). In agreements the same people are `primary_contact_email` and `secondary_contact_email`, and the code also calls the backup contact "secondary contact".
- Vendor project: an `external` project auto-created per vendor, named `VEND-...`.
- Vendor connection: a `storage_connections` row linked through `vendor_agreements.vendor_connection_id`, or by `config.vendor_id`.
- Drop location / `drop_location_path`: the path where the vendor uploads (also "drop").
- Vendor file: `files.is_vendor_file = true`. Vendor file quality is the UI and permission name `vendor_file_quality` for the same data (also "vendor file profiling results").
- Vendor management permission: `vendor_management:write`.
- Fully approved and locked agreement: `approval_status='fully_approved'`, `is_locked=true`, `status='active'`.

## Open questions
1. Which migration allows `vendors.status = 'deleted'`, if any (enhanceVendorManagement.js and others were not read)?
2. Are `requireOwnVendorAccess` and `requireOwnAgreementAccess` used outside server.js, for example in vendorAgreementRoutes.js (VAG area)?
3. Does the foreign key from `vendor_agreements.vendor_id` to `vendors` cascade? A delete of a vendor with only draft, inactive or archived agreements depends on it.
4. Does the cache key in `cacheMiddleware` (backend/middleware/cacheMiddleware.js:22) separate users for `/api/vendor-files`? Only a `userId` read was seen, not the full key.
5. Why can the `Vendor` role not be assigned on the create path when the primary user already exists? It could be intended, with the user holding another role.
6. Do the route-level permissions `vendor_management:write`, `vendor_file_quality:read`, `file_drop` and `file_upload:write` map to seeded roles? bridgeVendorAdministrationPermissions.js was not read.
7. What `/api/files/drop` does for vendor uploads (checked by ING area, not here).
8. Is there an email or onboarding flow for the temporary password? None was found in this area.
