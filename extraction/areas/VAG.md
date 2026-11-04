# VAG - Vendor agreements (CRUD, documents, archive passwords, stakeholders, disable/delete)

Files: `backend/routes/vendorAgreementRoutes.js` (R), `backend/services/vendorAgreementService.js` (S), `src/pages/VendorAgreements.jsx` (FE; only grepped for API calls, not read in full).

## Summary
- Router is mounted at `/api/vendor-agreements` behind `authenticateToken` (server.js:13885-13886). All routes below therefore require a logged-in user; further checks are per route.
- Two access layers: `requirePermission('vendor_agreements:write'|'read')` (permission) and `checkAgreementAccess` (R:105-177, relationship). Only admin-level access (`userHasAdminAccess`) bypasses the relationship check (R:138). Permissions do not grant access on their own (R:121-125, 140-142).
- Relationships that grant access (R:147-169): `vendor_user_id` equals user; `file_owner_user_id` equals user; primary/secondary contact email equals user email (exact, case-sensitive); user id in any `approval_chain_config.steps[].approver_user_ids`; `created_by` equals user.
- Agreement lifecycle fields: `status` (`draft`, `active`, `inactive`, `archived`) and `approval_status` (`pending_vendor_acceptance` etc.). Approval transitions belong to area VAP.
- Delete is a soft delete (`status='archived'`, S:3071-3080). Disable sets `status='inactive'` (S:3131). A cron job also disables expired agreements (S:3178; called from cronSchedulerService.js:454).
- Edits to an active agreement already in an approval workflow reset it to `pending_vendor_acceptance` and bump `version` (S:1138-1149).

## Entry points

### 1. POST /api/vendor-agreements/ (R:183)
- Caller: `vendor_agreements:write`. Non-admins must already be `file_owner_user_id` on at least one agreement of the target vendor, else 403 (R:193-209). Missing/NaN `vendor_id` for non-admin gives 400 (R:195).
- Input: multipart; `agreementData` JSON string; optional `schemaFile` (.xlsx/.xls/.csv/.json, 10MB, saved to `uploads/schemas/`, R:46-61). Non-draft requires `file_configurations_count` >= 1, else 400 (R:212-219). Field removed before service call (R:222).
- Service (S:86-453), one transaction: duplicate `file_name` check, case-insensitive, trimmed, across all agreements including archived (S:139-148); `vendor_id` required (S:154); non-draft requires `file_owner_user_id` and `vendor_connection_id` (S:160); vendor must exist; user_type `Vendor` may only create for own vendor (S:175-178); file owner must exist; `manager_contact` defaults to owner email (S:191); a Vendor-type creator's email fills `primary_contact_email` if blank (S:196); `vendor_connection_id` must be an `External` connection with direction in `source,target,drop` (S:206-210).
- Defaults: `status` `'active'` (S:290); `approval_status` `'draft'` for drafts, else `'pending_vendor_acceptance'` (S:293); `version` 1 (S:313); `sla_enabled` false, `frequency_pattern` `'daily'`, `arrival_time` `'09:00'`, `alert_threshold_minutes` 60 (S:324).
- Code format `AGR-<vendor_code or VND>-<first 3 letters of file_name upper, non-A-Z become X, or CFG>-<4 hex chars>`; regenerated until unique (S:19-28, 272-287).
- Schema: parsed from file, or from JSON string; rows with no `column_name/name/data_type/type` are dropped; invalid JSON is swallowed and schema becomes null (S:259-262).
- Optional `initial_approval_chain` validated and normalised (`require_all` becomes `Boolean(...)`), approver ids must exist (S:344-383).
- Side effects: INSERT `vendor_agreements`; INSERT `vendor_agreement_changes` ('created'); non-draft: INSERT `notifications` of type `vendor_contract_pending_vendor` for users matching primary/secondary contact email (S:387-430). Uploaded file deleted in `finally` (R:254-258).
- Output: 201 `{success, agreement}`. Any error, including validation, returns 400 `{error}` (R:253).

### 2. GET /api/vendor-agreements/ (R:267)
- Caller: any authenticated user (no permission check).
- Input: `page` (default 1), `pageSize` (default 10, no maximum), `project_id`, `vendor_id`, `status`; `filterByMyVendor` only logs (R:283-288).
- Rules (S:2652-2863): always excludes `status='archived'` (S:2677). `isAdmin` is `userRoles.includes('Admin')` (S:2669), not `userHasAdminAccess`. Non-admins see only agreements where they are file owner, vendor user, governance manager, primary/secondary/manager contact (email), additional stakeholder user, member of a stakeholder group, creator, or chain approver (S:2726-2746). Read/approve permissions give no extra visibility (S:2708-2714), although R:290-292 comment says they do.
- Output: `{success, agreements[] (with file_schemas, *_at timestamps), pagination{page,pageSize,totalCount,totalPages}, hasApprovePermission}`. Ordered `created_at DESC`. 500 on error.
- Side effect: logs usernames, roles, permissions at info level (R:297-305).

### 3. GET /stakeholder-options (R:338)
- Caller: `vendor_agreements:read`. Returns all users with `internal_user=true` and all `access_groups` with member counts. Not scoped to any agreement. 500 includes `details: error.message`.

### 4. GET /init-data (R:403)
- Caller: any authenticated user. Batch for the page.
- Admin (`userHasAdminAccess`): all `storage_connections` with `status='active' AND is_deleted=false`, and all `vendors` with `status='active'` (R:414-452). Non-admin: only the first vendor where `vendor_user_id = user` (`rows[0]`, so multiple vendors are ignored, R:454-459), plus External connections for the vendor's project or the project's drop-location connection (R:487-500).
- `allConnections`: every non-deleted connection for every user, including config (R:515-523). See SECURITY.
- `agreements`: `getAllAgreements` with `pageSize: 10000` (R:528-536). Adds `current_step_approver_names` and `current_step_vote_progress {approved_count,total_count,require_all}` for `pending_approval` rows; `require_all` defaults true when not `=== false` (R:615). Counts only votes from configured approvers.
- `users`: only for admin or write permission; up to 1000 users with roles (R:625-635).
- Sub-query failures are caught and logged as warnings (empty lists returned).

### 5. GET /:id/full (R:659)
- Caller: `checkAgreementAccess`. Returns agreement (+`chain_submitted_at`), approvals with documents, last 100 changes, all step decisions, `chain_users` (approver names), and `userRole`.
- `userRole` is `admin`, `vendor`, else `owner` (R:809): chain approvers and creators are reported as `owner`.
- Step-decision to approval link is a timestamp match within 10 seconds (R:767).

### 6. GET /:id (R:822)
- Caller: `checkAgreementAccess`. Returns `{success, agreement, userRole}`. Same `userRole` mapping.

### 7. PUT /:id (R:841)
- Caller: `vendor_agreements:write` AND `checkAgreementAccess` (any relationship, so a vendor/contact with write permission can edit). Multipart `updateData` JSON, optional `schemaFile`.
- Service (S:458-1270): agreement locked and not admin gives error 'Agreement is locked...' (S:477). Duplicate file_name check excludes self (S:528). Draft to active requires vendor, owner, connection; sets `approval_status='pending_vendor_acceptance'`; generates code if absent (S:543-581, 1071). Setting `draft` clears approval_status and vendor/owner approval stamps (S:1055-1061, 1094-1106). Changed fields only are updated; none changed returns `{success:false,error:'No changes detected'}` with HTTP 200 (S:1108-1110, R:868/877).
- Reset rules: locked + admin: unlock, `approval_status='pending_vendor_acceptance'`, clear approvals, `version+1` (S:1117-1127). Else if `approval_status` set, not `'draft'`, `status='active'`, not locked: same reset and `version+1` (S:1138-1149). A change log row is written for each, plus an 'updated' row with previous/new data (S:1196-1211).
- Side effect: async email/notification to stakeholders via `VendorAgreementNotificationService.sendUpdateNotification` (S:1221-1256); base URL `REPLIT_DEV_DOMAIN` else `APP_URL`.
- Errors: all return 400 `{error}` (R:882), including not found.

### 8. GET /:id/files (R:1386)
- Caller: `checkAgreementAccess`. Lists `vendor_agreement_file_schemas` (ordered `created_at ASC`) with `has_archive_password`, which is computed only if env `VAULT_ENCRYPTION_KEY` is set, using key type `'vendor_agreement_file_schema'` (R:1402-1414). 500 on error.

### 9. GET /vendor/:vendorId (R:1438)
- Caller: authenticated. Allowed if admin or `vendor.vendor_user_id === user.id`, else 403; 404 if vendor missing; 400 for NaN. `pageSize` default 20. For non-admins the list is filtered to primary/secondary contact email equal to user email (S:2879-2883). No archived filter here (S:2874): archived agreements are returned.

### 10. GET /approved (R:1482) - unreachable, see DEAD.
- Intended: agreements with `approval_status` in (`fully_approved`,`governance_approved`) AND `is_locked=true` AND `status='active'`, optional `project_id` (S:3025-3027).

### 11. PATCH /:id/disable (R:1598)
- Caller: write permission + access. Service sets `status='inactive'` (error 'Agreement is already disabled' if already, S:3126), logs a change row. Any service failure returns 404 `{error}` (R:1609), including "already disabled". Does not touch `approval_status`.

### 12. GET /:id/check-dependencies (R:1626)
- Caller: `vendor_agreements:read` only (no relationship check). Counts `vendor_agreement_documents` rows and distinct `transformation_jobs` with status in `completed,running,pending` via mapping's `vendor_agreement_id` (R:1636-1649). `canDelete = total === 0`. Output `{success, canDelete, dependencies{documents, transformationJobs, total}}`.
- Note: `failed`/other job statuses and file schemas are not counted.

### 13. DELETE /:id (R:1676)
- Caller: write permission + access. Soft delete to `status='archived'` (S:3072-3080). Does NOT check dependencies on the server (the FE calls check-dependencies first, VendorAgreements.jsx:1545, 1563). No change-log row written (contrast disable). Not-found returns 404.

### 14. POST /:id/documents (R:1726)
- Caller: access only (no write permission). multer `dest: uploads/agreement_documents/`, 20MB, ext in `.pdf .doc .docx .xlsx .xls .txt .jpg .jpeg .png` (R:1708-1723). Fields `approval_id`, `document_type` (default `'supporting_evidence'`), `description`, `approval_stage`. Stores `req.file.path` (a disk path) in `file_path`. Output `{success, document}`. 500 on error. Errors from upload filter go to handleMulterError (400).

### 15. GET /:id/documents (R:1776)
- Caller: access. Lists all documents with uploader username/email, `uploaded_at DESC`. Returns `d.*` including `file_path`.

### 16. GET /:id/documents/:docId/download (R:1806)
- Caller: access. Looks up by id and agreement; 404 if absent or no `file_path`. Treats `file_path` as base64 content and sends it as attachment (R:1828-1833). See BUG.

### 17. DELETE /:id/documents/:docId (R:1846)
- Caller: access; additionally must be uploader, admin, or hold approve permission, else 403 (R:1865). Deletes file at `file_path` from disk then DB row.

### 18. POST /:id/archive-password (R:1899)
- Caller: write + access. Body `password` must be a non-empty string (trimmed length > 0), else 400. Stores via `PasswordVaultService.storePassword('vendor_agreement', id, password, userId)`. Output `{success, message, hasPassword:true}`. Always fails in current code: see BUG (`pool`).

### 19. GET /:id/archive-password (R:1950)
- Caller: `vendor_agreements:read` only, no relationship check. Returns `{success, hasPassword}`. Same `pool` BUG.

### 20. DELETE /:id/archive-password (R:1987)
- Caller: write + access. 404 'No archive password found...' if none. Same `pool` BUG.

### 21. GET /:id/stakeholders (R:2041)
- Caller: access. Returns `userIds`, `groupIds` (from JSONB columns `additional_stakeholder_user_ids/group_ids`) and resolved `users`, `groups`.

### 22. PUT /:id/stakeholders (R:2139)
- Caller: write + access. Body `{userIds, groupIds}` default `[]`, must be arrays (400). All user IDs must exist with `internal_user=true`; invalid ids return 400 with `invalidIds` (R:2165-2181); group IDs must exist in `access_groups`. Strict `includes` comparison, so string ids fail against numeric DB ids. Updates JSONB columns plus `updated_at/updated_by`; no change-log row and no version bump.

### 23. USE multer error handler (R:2244)
- `LIMIT_FILE_SIZE` returns 413 with message 'Maximum file size is 10 KB for approval documents' (R:25-27), which is wrong for these uploads (limits are 10MB, 5MB, 20MB). `LIMIT_FILE_COUNT` message says 5 documents. Other filter errors return 400.

### 24. Cron: autoDisableExpiredAgreements (S:3178; cronSchedulerService.js:454)
- Finds `status='active'` with `contract_end_date < CURRENT_DATE` (database date/timezone; S:3190), sets `status='inactive'`, `updated_by = 1` hardcoded, writes change row `auto_disabled` with `changed_by = 1` (S:3208, 3217). Schedule not traced here.

### 25. FE /vendor-agreements (src/pages/VendorAgreements.jsx, route at App.jsx:408)
- Calls (grep only): init-data (:243), `/:id/full` (:261), stakeholder-options (:300), POST/PUT agreements (:1235-1394), file-schemas PUT (:1287, area VAS), approve/reject (:1498, :1524, area VAP), check-dependencies (:1545), DELETE (:1563), PATCH disable (:1579), document download via fetch (:3212, :3291). Not otherwise analysed (3,510 lines).

## Data touched
Tables: `vendor_agreements`, `vendor_agreement_changes`, `vendor_agreement_approvals`, `vendor_agreement_documents`, `vendor_agreement_file_schemas`, `vendor_approval_step_decisions`, `vendors`, `users`, `user_roles`, `roles`, `access_groups`, `user_groups`, `access_group_members`, `storage_connections`, `projects`, `notifications`, `transformation_jobs`, `transformation_mappings`; password vault (via `PasswordVaultService`, table not inspected). Files: `uploads/schemas/` (temp, deleted), `uploads/agreement_documents/` (kept).

## Flags

### SECURITY
- S1. GET /:id/archive-password and GET /:id/check-dependencies check permission `read` only, no agreement relationship; any reader can probe any agreement id (R:1950, R:1626).
- S2. GET /init-data returns `allConnections` (all non-deleted storage connections including `config` JSON) to every authenticated user, admin or not (R:515-523, 641). Whether `config` contains secrets was not checked.
- S3. POST /:id/documents has no write-permission check; any related user (including vendor contact) can upload (R:1726). Extension-only filter, no content check; original filename used in `Content-Disposition` without escaping (R:1832).
- S4. Document delete allows anyone holding `vendor_agreements:approve` (any hold, not tied to agreement) once they have access (R:1865).
- S5. PUT /:id allows any related user with write permission (vendor contacts, chain approvers) to edit; reset of approvals follows (R:841).
- S6. GET / logs usernames, roles and full permission list at info level (R:297-305).
- S7. Error responses expose `error.message` as `details` (R:392, 1941, etc.).
- S8. GET /vendor/:vendorId does not exclude archived agreements while list does (S:2874).

### BUG
- B1. `pool` is not defined at module scope in R. It is only declared locally inside GET /:id/files (R:1390). The three archive-password handlers use `pool` (R:1912, 1958, 1995), which would throw `ReferenceError` (caught, returns 500). Archive passwords for agreements cannot be stored/checked/deleted via these routes. Verify at runtime.
- B2. Document upload stores disk path (R:1739-1744) but download base64-decodes `file_path` (R:1828); downloads return garbage of the path string, and delete treats it as a path (R:1870). Inconsistent; may work only if another code path stores base64 (not found in this area).
- B3. Multer error message says 10 KB limit (R:26, 82 comment) while limits are 10MB/5MB/20MB.
- B4. `userHasAdminAccess` (route) vs `userRoles.includes('Admin')` (service list, S:2669) are different admin definitions; an admin-access user without role 'Admin' sees only the scoped list but can open any agreement by id.
- B5. PUT with no detected changes returns HTTP 200 `{success:false}`; also, service errors incl. "not found" become 400.
- B6. Disable returns 404 for any failure including "already disabled" (R:1609).
- B7. Unused/ineffective: `filterByMyVendor` and the `vendorIds` variable do nothing (R:275-288); route comments say read/approve see all agreements, code says they do not (R:290-292 vs S:2708-2714).
- B8. Delete (archive) does not check dependencies server side and writes no change row; `check-dependencies` ignores file schemas and failed jobs.
- B9. Duplicate file_name check includes archived agreements, so a deleted agreement still blocks reuse of its file name (S:141).
- B10. `createAgreement` approval chain `require_all: Boolean(s.require_all)` makes an omitted value false, while the badge computation defaults to true when undefined (R:615 vs S:354); different defaults.
- B11. Schema parse failures on create/update are swallowed and set schema to null (S:259-262, 638-641); a bad schema silently erases the stored schema on update.
- B12. `updated_by = 1` / `changed_by = 1` hardcoded for auto-disable (S:3208, 3217).

### DUPLICATE
- D1. Admin check duplicated in three forms: `userHasAdminAccess` (R), `userRoles.includes('Admin')` (S:2669), and `isAdmin` flag passed to the service.
- D2. Two document paths: `POST /:id/documents` (R:1726, disk, 20MB) vs `approvalDocUpload` memory storage (R:82-98, 10MB, used by VAP step/action routes) vs `templateUpload` (R:64). Different allowed types (jpg/png only on the first; zip/gz/7z only on the second).
- D3. Duplicate of access logic in `vendorAgreementFileSchemaRoutes.js:95` ("Mirrors the logic").
- D4. Schema-parsing block copy-pasted in create (S:217-270) and update (S:596-649); visibility SQL duplicated for email/no-email (S:2726, 2751).
- D5. Archive password stored under type `vendor_agreement` (R:1916) while file-schema passwords use `vendor_agreement_file_schema` (R:1414); `/files` check reports per file schema only.
- D6. Agreement list data exists in both GET / and GET /init-data (init-data repeats `getAllAgreements`, pageSize 10000).

### DEAD
- X1. GET /approved (R:1482) is shadowed by GET /:id (R:822); `/approved` is parsed as id, NaN gives 400 'Invalid agreement ID' (R:109). `getApprovedAgreements` (S:3015) is therefore not reachable from this route (other callers not searched).
- X2. `upload.single` multer on PUT/POST also accepts `schemaFile`; FE sends JSON schema in body (not verified).

### UNCLEAR
- U1. `req.isChainApprover` / `isCreator` are set but `userRole` reports them as `owner` (R:809, 827).
- U2. Vendor users whose email matches contact are given `isVendor` even if they are not a user of the vendor (R:154-155).
- U3. Why `status` and `approval_status` both exist with overlapping 'draft' value; approval_status string set not enumerated here (VAP).

## Domain terms
- Vendor agreement = "contract" = "data contract" (error messages say "vendor contract", FE route `/vendor-agreements`, areas.md "data contracts").
- File owner = vendor manager = "owner" (`file_owner_user_id`; `manager_contact`; userRole 'owner').
- Vendor user / vendor contact (`vendor_user_id`, primary/secondary contact email).
- Governance manager (`governance_manager_user_id`).
- Additional stakeholders (users and access groups), internal users only.
- Archive password = vault-stored password for archives, per agreement or per file schema.
- Disable = `status 'inactive'`; Delete = `status 'archived'`; Draft = `status 'draft'` with `approval_status` null.
- Locked (`is_locked`): set after full approval; only admin can edit (VAP sets it).
- File configuration / file schema (`vendor_agreement_file_schemas`, `file_name_pattern` aliased `file_name`).
- Approval chain (`approval_chain_config.steps[]`, `require_all`), step decisions.

## Open questions
1. Is `pool` defined globally or hoisted elsewhere in vendorAgreementRoutes.js (grep shows only line 1390, function-local)? Do archive-password endpoints work in production?
2. Which code path writes base64 into `vendor_agreement_documents.file_path` (download assumes it)? Are VAP routes the writer?
3. Do `storage_connections.config` values contain credentials (affects S2)?
4. Which call sites use `getApprovedAgreements` and where does the frontend fetch fully approved agreements (route is shadowed)?
5. Is the intended vendor-user rule "must be the vendor's user" (create check uses `user_type === 'Vendor'`) consistent with the non-admin create check (file owner of an existing agreement)? Non-admin first-time agreements for a vendor appear impossible except for admins.
6. Cron schedule and timezone for `autoDisableExpiredAgreements` (cronSchedulerService.js:454 not traced); `CURRENT_DATE` uses the DB timezone.
7. What `requirePermission`/`hasPermission` do with admin role (vendorPermissions.js not read).
8. Full behaviour of VendorAgreements.jsx (3,510 lines) beyond its API calls was not extracted.
9. Valid `approval_status` values and `vendor_agreement_changes.change_type` constraint (comment at S:1157 says a constraint exists).

## Inventory corrections
- Inventory row `/api/vendor-agreements/:id/check-dependencies` lists PERM(read): correct. Rows for `/vendor/:vendorId` and `/` list auth as "-": they have no permission middleware but have JWT from the mount (server.js:13886) and `/vendor/:vendorId` has an inline ownership check.
- `/approved` (shadowed) confirmed. Also `GET /init-data` is "-" but has inline admin/vendor scoping.
- Inventory lists the multer handler as USE at R:2244: confirmed.
