# FILE - File catalog & file management

## Summary

A file is a row in `files`. `file_id` is a unique varchar and `id` is a serial primary key (prod schema S:4984-4985, :5019-5020). S is `attached_assets/FileSence_prod_schema_Jan_05_1767956647766.sql`. Every file must have a `project_id` (S:5001). `sub_project_id` is optional (S:5007).

The area is nine inline HTTP routes in server.js and two frontend pages. The count of nine is the one that matches the code and inventory.md (see "Entry point count" below):
- list (`/api/files/init-data`, `/api/files`)
- detail (`/api/files/:fileId`, `/api/files/:fileId/full`)
- preview and preview-data delete (`/api/files/:fileId/preview`, `/api/files/:fileId/preview-data`)
- single delete, bulk delete and copies (`DELETE /api/files/:fileId`, `POST /api/files/bulk-delete`, `GET /api/files/:fileId/copies`)
- the pages `/file-catalog` (FileCatalog.jsx) and `/processed-catalog`, also routed as `/transformation-catalog` (ProcessedFileCatalog.jsx)

Entry point count: areas.md:13 says "11 HTTP". inventory.md lists exactly 9 routes tagged FILE: rows 60, 61, 65, 66, 67, 68, 69, 70 and 104. A search of inventory.md for the FILE tag finds no other HTTP route. The 9 is therefore right for HTTP routes. The 11 in areas.md is not supported by any listed route. The only way to reach 11 is to add the 2 FE pages (9 + 2), which areas.md already counts separately as "2 FE".

Reads go through `FileService` from the DI container (`diContainer.get('fileService')`, server.js:1479, :1569, :1887) or through direct `dbPool` queries.

The catalog shows one row per logical file. A logical file groups files that share a project and a canonical filename:
- The canonical name is the filename with trailing timestamps, GUIDs and sequence numbers removed, lowercased (filenameNormalizer.js:15-65).
- The `logical_file_id` format is `logical_<projectId>_<sanitized canonical>` (filenameNormalizer.js:73-77).
- `schemaService.saveSchemaSnapshot` assigns it when the schema is saved (schemaService.js:406-454, :534-540).

The frontend dedupes the list to the newest file per `logical_file_id`, or per `filename` when there is none (FileCatalog.jsx:321-340). The older files are called "copies" (server.js:2265-2331).

Three access mechanisms apply. The rules differ between them; see Flags.

1. **List scoping.** `userHasAllProjectAccess` is defined in server.js:348-373 and matches permissionHelpers.js:60-73. It returns true for:
   - the role `Admin` or `admin`;
   - or any of the permissions `project_management:write`, `all_projects:read`, `users:write`, `roles:write`.

   Callers with it see every project. Everyone else sees only the projects from `getUserProjects`: active projects where the user is a direct member or a member through a group, plus their active sub-projects (requireProjectAccess.js:362-433).
2. **`requireProjectAccess({resourceType:'file'})` (RPA).** It works out a project id (requireProjectAccess.js:181-199). When `allowAdminBypass` (default `true`, :33) is set and `userHasAllProjectAccess(req.user)` is true, it sets `req.projectRole = 'Admin'` and `req.isAdminBypass = true` and calls `next()` (requireProjectAccess.js:66-76). Otherwise it requires the user to be a member of that project or its parent, and the target project to be active (requireProjectAccess.js:64-148). It checks no roles or permissions. `projectRoles` is accepted but never read. A non-bypass pass sets `req.isAdminBypass = false` (:153).
3. **`authorizeProjectResource` (PRA).** It runs RPA, then requires **every** entry in `requiredPermissions`, **except** when `req.isAdminBypass` is true: the whole permission comparison sits inside `if (!req.isAdminBypass)` (authorizeProjectResource.js:91), so a bypassed caller is never checked against `requiredPermissions`. For other callers, object permissions are compared as `${resource}:${action}` (authorizeProjectResource.js:93-99). `allowAdminBypass` defaults to `true` (:44). The policy layer is off by default (`enforcePolicies = false`, :45).

`req.user.permissions` is a mix of strings and `{name, resource, action}` objects (backend/src/middleware/authenticate.js:218-246, :277-281).

## Entry points

### GET /api/files/init-data
- Handler: server.js:1406-1528. Trigger: FileCatalog.jsx:55 through `useFileCatalogInitData`. React Query settings: stale time 30 s, gc time 3 min, `refetchOnMount: false` (useFiles.js:21-30; react-query.js:9, :21).
- Auth: JWT (`authenticateToken`), then `attachVendorProfile`. That middleware sets `req.isVendor` and `req.vendorProfile` when the user has `internal_user === false && user_type === 'Vendor'` and an `active` row in `vendors` (vendorAccessControl.js:14-40; userHelpers.js:11-18).
- Permission check (inline, server.js:1409-1426): the user needs one of `file_view`, `file:read`, `file_upload:read`, `file_catalog:read`. The value is either a plain string or the `.name` of a permission object. Otherwise the response is 403 `{error:'Access denied', message:'You do not have permission to view files'}`.
- Scope:
  - **Admin** (`userHasAllProjectAccess`): all files, all non-archived top-level projects, all non-archived sub-projects (server.js:1449-1476).
  - **Non-admin:** project ids come from `getUserProjects`. If there are none, the response is 200 `{files:[], totalCount:0, projects:[], subProjects:[]}` (server.js:1433-1446). Projects are filtered by `parent_id IS NULL AND id = ANY(accessible)`. Sub-projects are filtered by `parent_id = ANY(accessible)`. Both exclude `is_archived = true` and are ordered by name.
- Files: `fileService.getAllFiles({sortBy:'created_at', sortOrder:'DESC', limit:null, projectIds})`. `limit:null` means no cap. The comment says "client-side pagination handles display" (server.js:1480-1485; FileService.js:394-400). See "FileService.getAllFiles" below for the query.
- Vendor filter: if `req.isVendor`, files are kept only when `(file.file_path || file.location || '').startsWith(vendor.drop_location_path)`. `totalCount` is then set to the filtered length (server.js:1488-1510). See the BUG flag: `files` has neither column.
- Response 200: `{files, totalCount, projects:[{id,name,description,parent_id,is_archived}], subProjects:[{id,name,description,parent_id}]}`. Any error returns 500 `{error:'Failed to fetch file catalog data'}`.
- Side effects: none, apart from an info log. There is no server-side response cache on this route.

### GET /api/files
- Handler: server.js:1531-1623. Frontend callers:
  - `src/components/Transform/FileSelector.jsx:32`, used by TransformBuilder.jsx:70;
  - legacy `getFileCatalog` (fileService.js:40-60), which is reached only through `useFileCatalog`, and that hook has no callers.
- Auth: JWT, VEND, then `cacheMiddleware(300)`. The response is cached for 300 s under the key `cache:<userId>:<originalUrl>` (cacheMiddleware.js:19-24, :31-92).
- Permission check (inline, server.js:1534-1551): one of `file_view`, `file:read`, `file_upload:read`. **`file_catalog:read` is not accepted here**, unlike init-data. Otherwise 403.
- Scope:
  - Non-admin with no projects: 200 with a bare array `[]` (server.js:1563-1565).
  - Otherwise `projectIds` is the list of accessible projects.
  - `?project_id=N` narrows to `[N]` only if the caller is an admin or N is accessible. Otherwise it is silently ignored and every accessible project stays in scope (server.js:1579-1585). For an admin with a non-numeric `?project_id`, `parseInt` gives `NaN` and `projectIds` becomes `[NaN]` (server.js:1580-1583).
  - `?sub_project_id=N` is put into `filterOptions.subProjectId` (server.js:1587-1589). `getAllFiles` never reads it (see BUG).
- The call omits `limit`, so `getAllFiles` falls back to its default `limit = 50, offset = 0` (FileService.js:308-316). Only the newest 50 rows come back, while `totalCount` counts every matching row.
- The vendor filter is the same as init-data (server.js:1596-1616).
- Response 200: `{files, totalCount}`. Error: 500 `{error:'Failed to fetch files'}`.

### FileService.getAllFiles (shared by both list routes)
- FileService.js:307-412. Query: `SELECT DISTINCT files.*, projects.name AS project_name, sub_projects.name AS sub_project_name, lfg.has_schema_changes, lfg.canonical_name AS logical_file_name`, joined LEFT to `projects` (twice), `file_audit_details fad` on `file_id`, and `logical_file_groups lfg` on `logical_file_id` (FileService.js:329-341).
- Always excludes transformation targets: `(fad.file_role IS NULL OR fad.file_role != 'target')` (FileService.js:345-346). This uses `file_audit_details.file_role`, not `files.file_role` (S:5005).
- Optional filters: `projectIds` (`files.project_id = ANY`), `fileType`, and `search` (ILIKE on `filename` or `file_id`). No route passes `fileType` or `search` (FileService.js:349-365).
- The sort column is whitelisted to `id, filename, file_type, file_size, created_at, quality_score` and the order to ASC/DESC. Defaults are `created_at DESC` (FileService.js:322-327).
- A separate `COUNT(DISTINCT files.file_id)` gives `totalCount` (FileService.js:373-388).
- Returns `{files, totalCount}`.

### GET /api/files/:fileId
- Handler: server.js:1875-1917. Frontend callers: `getFileDetails` (fileService.js:65-80), used by QualityReport.jsx:43, QualityChecks.jsx:52 and LineageImpact.jsx:33. (DataProfile.jsx:11 only imports it.)
- Middleware order: JWT, VEND, `cacheMiddleware(120)`, then RPA (server.js:1876-1881). The cache runs **before** the project check (see Flags).
- RPA resolves the project in this order:
  1. `req.params.projectId`
  2. `req.query.project_id`
  3. `req.body.project_id`
  4. a lookup on the file: `SELECT project_id FROM files WHERE id=$1` when the fileId is all digits, or `WHERE file_id=$1` otherwise (requireProjectAccess.js:181-238; the numeric branch is at :231-232)

  If no project can be determined, the response is 400 `{error:'Project context required'}` (requireProjectAccess.js:55-62). A non-member gets 403 "You are not a member of this project" (:104-115). An inactive project gives 403 "This project is not active" (:138-148). A missing project gives 404 (:124-133).
- The handler calls `fileService.getFileById(fileId)` with the raw path parameter (server.js:1884, :1888): `SELECT * FROM files WHERE file_id=$1`, plus `file.columns = SELECT * FROM file_columns WHERE file_id=$1 ORDER BY column_index`, with no `file_role` filter (FileService.js:265-299). A null result gives 404 `{error:'File not found'}`.
- **Numeric id mismatch.** RPA treats an all-digit `:fileId` as `files.id` (requireProjectAccess.js:231-232), but the handler looks the same value up as `file_id` (server.js:1888; FileService.js:271). A numeric id therefore passes RPA (project resolved from `files.id`) and the handler then returns 404 `File not found`, unless some file's `file_id` string happens to equal that number. See BUG.
- Vendor check: if `req.isVendor` and `drop_location_path` is set and `file.file_path||file.location||''` does not start with it, the response is 403 `{error:'Access denied. You can only access files from your drop location.'}` (server.js:1894-1909).
- Response 200: the full `files` row plus a `columns` array. Error: 500 `{error:'Failed to fetch file details'}`.

### GET /api/files/:fileId/preview
- Handler: server.js:1921-2019. Trigger: `FilePreview.jsx:30`, which calls `?limit=${maxRows}` with a 60 s axios timeout. The component is used by DataProfile.jsx:2757 and OnboardingWizard.jsx:153.
- Middleware order: JWT, `cacheMiddleware(300)`, then PRA with `requiredPermissions:['file_preview:read']` (server.js:1922-1927). The cache runs before authorization.
- **Required permission, with the bypass.** `file_preview:read` is required only for callers where `req.isAdminBypass` is not set. A caller with `userHasAllProjectAccess` (role Admin/admin, `project_management:write`, `all_projects:read`, `users:write` or `roles:write`) skips the `file_preview:read` check (authorizeProjectResource.js:91; requireProjectAccess.js:66-76). That only gets the caller past the middleware. `filterDataset` layer 1 then uses `userHasAdminAccess`, which excludes `all_projects:read` (permissionHelpers.js:80-92; columnAccessControl.js:41, :54), and requires direct `project_members` membership (requireProjectAccess.js:326-337). A caller with only `all_projects:read` gets empty rows, but `columns` and `totalRows` are still returned (server.js:1976-2013). Full row preview needs role Admin, `users:write`, `roles:write` or `project_management:write`, or direct membership.
- Inputs: `limit` (default `100`). `rowLimit = parseInt(limit) || 100`, with no upper bound (server.js:1931, :1956).
- Reads:
  - `SELECT * FROM files WHERE file_id=$1`. If missing: 404 `{error:'File not found'}`. The lookup uses the raw `fileId` (server.js:1935), so a numeric id that passed RPA through `files.id` gets this 404.
  - `file_columns` ordered by `column_index`. The column type goes through `normalizeDataType` from schemaExtractor.
  - `SELECT row_number, row_data FROM file_preview_data WHERE file_id=$1 ORDER BY row_number LIMIT $2` (server.js:1935-1960).
  - A `row_data` that is a JSON string is parsed. If parsing fails the row becomes `{}` (server.js:1963-1973).
- Column access control: `columnAccessControl.filterDataset(req.user, fileId, rows, 'read')` (server.js:1976-1982).
  - **Layer 1:** if `userHasAdminAccess` is false, `checkProjectMembership` checks **direct `project_members` only**, plus `p.is_active = TRUE`, against the file's real project or its parent. If that fails, rows come back empty and `columnAccess` is empty (columnAccessControl.js:35-61, :296-326; requireProjectAccess.js:321-356).
  - **Layer 2:** a column is "sensitive" if any of its tags has `sensitivity_level` `restricted` or `private`, or `requires_view_permission` (for read). The user must hold `tag:<permission_required||tag_name lowercased>:read` for every sensitive tag; admin access counts. Otherwise the column is **masked** (columnAccessControl.js:154-228, :69-94). In read mode no column is ever "denied".
  - Masking (columnAccessControl.js:236-283):
    - null or empty values are kept;
    - numbers become `****`;
    - strings of 4 characters or fewer become `****`;
    - strings of 5-10 characters become `x***y`;
    - longer strings: emails become `l***@domain`, SSN `###-##-####` becomes `***-**-1234`, anything else becomes `ab****yz`;
    - objects become `****`.
- Audit: if `req.auditService` is set (the global audit middleware sets it, auditMiddleware.js:148-149), the route calls `logDataAccess({accessType:'PREVIEW', accessMethod:'UI', rowsAccessed, metadata:{totalRows, rowLimit, columnAccessSummary, maskedColumns, deniedColumns}})` (server.js:1985-2004).
- Response 200: `{fileId, columns:[{name,type}], rows, totalRows: files.row_count, preview:true, columnAccess:{allowed,masked,denied}, accessSummary}`. Error: 500 `{error:'Failed to generate file preview'}`.
- Frontend (FilePreview.jsx):
  - Masked and denied columns render as `****` (:189-193, :335-336).
  - Empty rows show "No preview data available. Preview data has been deleted for security." (:95-101).
  - Each column header shows a completeness badge: `(totalRows - missing)/totalRows`. Colour thresholds are 0.9, 0.7 and 0.5 (:104-129).

### DELETE /api/files/:fileId/preview-data
- Handler: server.js:2022-2063. Trigger: the "Delete Preview Data" button in FilePreview.jsx:48-73 and :257-263. The confirm text says "The file metadata and statistics will be retained."
- Middleware order: JWT, `invalidateCache('cache:*:*files*')`, then PRA with `requiredPermissions:['file:delete','file_delete']`. Cache invalidation runs before authorization.
- **Required permissions, with the bypass.** For callers where `req.isAdminBypass` is not set, **both** permissions are required (authorizeProjectResource.js:97-99). A caller with `userHasAllProjectAccess` (including `all_projects:read` alone) skips the check (authorizeProjectResource.js:91; requireProjectAccess.js:66-76) and can delete preview data with neither `file:delete` nor `file_delete`, provided the file's project can be resolved.
- Effect: `DELETE FROM file_preview_data WHERE file_id=$1`. Response 200 `{success:true, message:'Deleted N preview rows', rowsDeleted:N}`. A missing file gives 404. Errors give 500 `{error:'Failed to delete preview data'}`.
- Nothing regenerates the preview later. The data is gone for good, and the FE then shows the "deleted for security" empty state.

### DELETE /api/files/:fileId
- Handler: server.js:2066-2125. Trigger: FileCatalog.jsx:178-179 through `useFileDelete` and `deleteFile` (useFiles.js:147-157; fileService.js:191-200). The FE uses it when "delete all copies" is unticked or the file has at most one copy.
- Middleware order: JWT, `invalidateCache('cache:*:*files*')`, then PRA with `['file:delete','file_delete']`.
- **Required permissions, with the bypass.** For callers where `req.isAdminBypass` is not set, both permissions are required. A caller with `userHasAllProjectAccess` (including `all_projects:read` alone) skips the check (authorizeProjectResource.js:91) and can delete any file whose project RPA can resolve. See SECURITY.
- Effect: one transaction on a dedicated client that deletes, in order, from:
  1. `file_preview_data`
  2. `file_columns`
  3. `file_quality_checks`
  4. `file_schedules`
  5. `file_history`
  6. `alert_history`
  7. `quality_reports`
  8. `user_badges`
  9. `transformation_outputs`
  10. `files`

  It then commits (server.js:2086-2104). Any error rolls back and returns 500 `{error:'Failed to delete file'}`.
- Rows not deleted explicitly:
  - Removed by FK `ON DELETE CASCADE` on `files.file_id`: `file_ownership`, `file_tag_assignments`, `file_policy_assignments`, `column_governance_tag_assignments`, `column_policy_assignments`, `column_sensitivity_tags`, `file_lineage`, `file_quality_rules`, `dlq_jobs`, `archive_extractions`, `archive_members` (parent), `processing_events`, `file_processing_artifacts`, `vendor_file_profiling_results`, `column_mappings`. Child archive files go too, through `files.parent_archive_id` (S:7315-7898).
  - Have no FK and are not deleted, so they are orphaned: `file_audit_details` (S:4647-4649), `file_schemas` (S:4938-4948), `quality_rule_violations` (S:5750-5753), `file_errors` (S:3158). Also `logical_file_groups.upload_count` is never decremented.
  - No physical file or cloud object is removed.
- Response 200 `{success:true, message:'File deleted successfully', fileId}`. A missing file gives 404 (but see BUG: without `?project_id=` or a body `project_id`, RPA returns 400 first).

### POST /api/files/bulk-delete
- Handler: server.js:2128-2263. Frontend triggers: `bulkDeleteFiles` (fileService.js:209-218) from FileCatalog.jsx in two cases:
  - the multi-select "Delete (N)" button sends `{fileIds:[...]}` (:181-184, :218-222);
  - the "Also delete all N copies of this file" checkbox sends `{logicalFileId, projectId, filename}` (:168-177, :863-873).
- Auth: JWT and `invalidateCache('cache:*:*files*')` only. **No permission check** (no PRA, no `file:delete`).
- Input modes:
  - `fileIds` (array) takes priority.
  - Otherwise, when `logicalFileId` is set and not the string `'null'`, the ids are resolved with `SELECT file_id FROM files WHERE logical_file_id=$1`. For non-admins this adds `AND project_id = ANY(accessible)` (server.js:2142-2157).
  - Otherwise, when `projectId && filename` are given, the ids are resolved with `WHERE filename=$1 AND project_id=$2`, plus the accessible-projects filter for non-admins (server.js:2158-2175).
  - A failed resolution gives 500 `{error:'Failed to resolve file group'}`. An empty or missing list gives 400 `{error:'No file IDs provided'}`.
- Access: `validateBulkFileAccess(fileIds, user)` (fileAccessHelpers.js:56-92):
  - If the number of rows found differs from `fileIds.length`, it returns 404 'One or more files not found'. This also fires when the list contains duplicate ids.
  - Non-admins get 403 `You do not have access to N file(s)` if any file's `project_id` is outside `getUserProjects`.
  - "Admin" here means `userHasAdminAccess` (role Admin, or `users:write`, `roles:write`, `project_management:write`), **not** `userHasAllProjectAccess` (permissionHelpers.js:80-92).
- Effect: BEGIN, then per file: check it exists; delete `file_columns`, `file_quality_checks`, `file_schedules`, `file_history`, `alert_history`, `quality_reports`, `user_badges`, `transformation_outputs`, `files`. Then COMMIT (server.js:2195-2230).
  - Per-file errors are caught and collected into `errors[]` while the loop continues (server.js:2224-2226).
  - `file_preview_data` is not deleted explicitly. The FK cascade removes it (S:7464).
  - There is no maximum batch size.
- Response 200 `{success:true, message:'Successfully deleted N file(s)', deletedCount, totalRequested, errors?}`. 403 and 404 from the access helper become `{success:false, error}`. Anything else gives 500 `{error:'Failed to bulk delete files'}`.

### GET /api/files/:fileId/copies
- Handler: server.js:2266-2331. Trigger: FileCatalog.jsx:150-166 (`handleDelete`), which fetches the copy count before opening the delete modal. Any error is treated as count 0.
- Auth: JWT only. There is no permission check. Access is checked inline:
  - The reference file is read with `SELECT file_id, filename, project_id, logical_file_id FROM files WHERE file_id=$1`. If missing: 404.
  - Non-admins (`userHasAllProjectAccess` false) whose accessible projects do not include `ref.project_id` get 403 `{error:'Access denied'}` (server.js:2283-2288).
- Siblings:
  - When `logical_file_id` is set: `WHERE logical_file_id=$1`. Non-admins also get `AND project_id = ANY(accessible)`.
  - Otherwise: `WHERE filename=$1 AND project_id=$2`, an exact, case-sensitive filename match within the same project (server.js:2291-2323).
- Errors: any other error gives 500 `{error:'Failed to fetch file copies'}` (server.js:2327-2330).
- Response 200 `{copies:[file_id...], count, logicalFileId|null, filename}`. The count includes the reference file itself. The FE shows the checkbox only when `count > 1` (FileCatalog.jsx:863).

### GET /api/files/:fileId/full
- Handler: server.js:6324-6592. Frontend trigger: `getFileFullData` (fileService.js:107-122) from DataProfile.jsx:1915 and :1982.
- Auth: JWT, then RPA. The project comes from `?project_id` or the body when present, else from the numeric-id or `file_id` lookup.
- Id resolution: a fileId of all digits is treated as `files.id` and mapped to `file_id`. If no row matches: 404. The code comment says lineage graph nodes use numeric ids and catalog links use the UUID (server.js:6334-6348). Unlike GET `/:fileId` and preview, this handler handles numeric ids correctly.
- Nine parallel reads (server.js:6351-6399):
  - `files`
  - `file_columns` ordered by `column_index`
  - `file_ownership`
  - `file_tag_assignments` joined to `governance_tags`
  - `file_policy_assignments` joined to `governance_policies`
  - `column_governance_tag_assignments` joined to `governance_tags`, selecting `column_name, tag_id, tag_name, description, color, badge_style, assigned_at`
  - `column_policy_assignments` joined to `governance_policies`
  - **all** `governance_tags`
  - **all** `governance_policies`

  A missing file row gives 404.
- Column access: `columnAccessControl.filterColumns(req.user, columnGovernance, 'read')` runs on the tag rows built above (server.js:6437-6447). See the SECURITY flag: those rows carry no sensitivity fields.
- Profile columns:
  - From `file_columns` (server.js:6453-6505), mapped to `{name, type, count: non_null_count, unique: unique_count, missing: null_count, min, max, mean: mean_value, median: median_value, stdDev: std_dev, histogram (JSON-parsed), patterns, most/least_frequent_value/count, _accessLevel}`.
  - Masked or denied columns get `min/max/most/least_frequent_value = '[REDACTED]'` and null statistics, but keep `count/unique/missing` (server.js:6458-6478).
  - If `file_columns` is empty, the columns come from `files.schema_definition` instead (the code says "archive files profiled via Flask API"). Every such column gets `_accessLevel:'full'` and `_source:'schema_definition'`, and `count = row_count - (null_count||0)` (server.js:6506-6537).
- Column governance in the response keeps only allowed or masked columns (server.js:6552-6569).
- Response 200: `{file (full row), profile:{fileId (raw param), fileName, fileType, fileSize, rowCount, columnCount, qualityScore, columns, accessSummary, processedAt}, ownership|null, fileTags, filePolicies, columnGovernance:{tags, policies}, allGovernanceTags, allGovernancePolicies}`. Error: 500 `{error:'Failed to fetch file data'}`.

### Frontend /file-catalog (FileCatalog.jsx)
- Route: src/App.jsx:344, wrapped in `ProtectedRoute`, which checks authentication only (App.jsx:175-189).
- Data comes from init-data. Projects and sub-projects for the dropdowns come from the same response (FileCatalog.jsx:106-119).
- URL parameter `?project=<id>` preselects the project (:58-65).
- **Dedupe:** files are sorted by `created_at` descending and the first one per `logical_file_id || filename` is kept (:321-340).
- Filters, all applied client-side (:343-368):
  - search (case-insensitive substring on filename, project name, sub-project name; input maxLength 100);
  - type (`all`, `csv`, `json`, `parquet`, `zip`; :719-723);
  - project;
  - sub-project (`all`, `none` meaning files with no sub-project, or an id).
- Choosing a project sets the sub-project filter to `'none'` (:122-128), so only files without a sub-project show by default.
- Sort keys: `date` (default, descending), `name`, `size`, `rows`, `quality` (:369-395).
- Pagination: default 25 per page; options 10/25/50/100/200; at most 7 page buttons (:34, :570-597, :768-772). Page resets to 1 when search, type, sort, order or project change. A sub-project change does **not** reset it (:410-412).
- Row display:
  - "Schema Changed" badge when `has_schema_changes` (:444-448);
  - "Error" badge, and DLQBadge in place of rows/columns, when `processing_error` is set (:449-485);
  - "Created" and "Uploaded" both show `created_at`, as a date and as a relative time (:486-491; time-since logic :279-297).
- Quality colour: at least 90 green `#16a34a`, at least 70 amber `#d97706`, otherwise red (:510). The `QualityTooltip` component gets the defaults completeness 95, consistency 85, validity 80, uniqueness 75 and timeliness 90 when `quality_components` is missing (:497-503). The API never returns `quality_components` (see BUG).
- A header-validation badge shows when `metadata.header_validation.issues_found > 0` or `status !== 'healthy'` (:305-317, :518-526).
- Actions:
  - the lock button ("Provide Password") shows only when `failure_reason_code === 'password_missing'` and posts to `/api/files/:id/password`, which is ARC (:531-542, :237-260);
  - the view button navigates to `/profile/<encoded file_id>` (:130-132);
  - delete (see the delete entry points above).

### Frontend /processed-catalog and /transformation-catalog (ProcessedFileCatalog.jsx)
- Routes: src/App.jsx:421-422, with `ProtectedRoute` (authentication only).
- Data: `GET /api/file-audit?load_type=etl_transformation&file_role=target&limit=10000` (ProcessedFileCatalog.jsx:35-41). The handler is fileAudit.js:272-331, mounted with JWT at server.js:5280 (LEDG area). There is no server-side cap on `limit` (fileAudit.js:309).
- The page reloads when a window `vendorFileUploaded` event fires (:71-81).
- Sub-projects come from `GET /api/projects/:id/sub-projects` when a project is selected (:84-109).
- Filters, all client-side:
  - search over `file_name`, `source_path`, `mapping_name`;
  - mapping;
  - project;
  - sub-project;
  - date range `today`, `last7days`, `last30days`, `last90days`. These count from local midnight minus 7, 30 or 90 days, in browser local time (:115-140).
- Sort: always `created_dt` descending (:172). Pagination: default 25; options 10/25/50/100; at most 5 page buttons (:25, :210-234).
- Columns:
  - rows: `load_step_1_rec_cnt`, falling back to `row_count`;
  - columns: `number_of_columns`;
  - quality: `quality_score` to 1 decimal;
  - project: `project_name`, falling back to `'Default Project'` (:404-421).
- Actions:
  - "Source File Profile" opens TransformationProfilingModal with `job_id`;
  - "Target File Profile" navigates to `/profile/<file_id>`;
  - "Delete profiling results" calls `DELETE /api/file-audit/correlation/:correlationId`, which removes every `file_audit_details` row with that `correlation_id` (fileAudit.js:337-361). On failure the page shows `alert(...)` (:187-202).

## Data touched

| Table / store | Access | Where |
|---|---|---|
| files | R (list, detail, preview, full, copies); D (delete, bulk) | FileService.js:329-341, :271; server.js:1935, :2079-2101, :2203-2221, :2274, :6339, :6362 |
| file_columns | R; D | FileService.js:284; server.js:1944, :2091, :2211, :6363 |
| file_preview_data (preview_id, file_id, row_number, row_data jsonb; uniq file_id+row_number, S:4822-4830) | R; D | server.js:1957-1960, :2041-2044, :2090 |
| file_quality_checks, file_schedules, file_history, alert_history, quality_reports, user_badges, transformation_outputs | D | server.js:2092-2098, :2212-2218 |
| projects | R | server.js:1449-1476; FileService.js:337-338; requireProjectAccess.js:84-122, :296-300, :364-423 |
| project_members, user_groups, project_access_groups | R (membership) | requireProjectAccess.js:84-102, :326-337, :364-415 |
| file_audit_details | R (target exclusion); D by correlation (processed catalog, via LEDG) | FileService.js:339, :346; fileAudit.js:343-345 |
| logical_file_groups | R (has_schema_changes, canonical_name) | FileService.js:334-340 |
| file_ownership, file_tag_assignments, file_policy_assignments, column_governance_tag_assignments, column_policy_assignments, governance_tags, governance_policies | R | server.js:6364-6398; columnAccessControl.js:103-137 |
| vendors | R (vendor profile) | vendorAccessControl.js:22-25 |
| Cache (Redis or in-memory NodeCache) | R/W keys `cache:<userId>:<url>`; pattern delete `cache:*:*files*` | cacheMiddleware.js:19-24, :99-115; cacheService.js:155-184 |
| Audit service | data-access log for preview | server.js:1985-2004 |
| Local disk `uploads/`, `uploads/temp` | created when FileService is constructed | FileService.js:33-35, :109-124 |

The `files` columns this area uses: `id, file_id, filename, file_type, file_size, row_count, column_count, quality_score, processed_at, created_at, metadata (header_validation, path), schema_definition, project_id, sub_project_id, processing_error, failure_reason_code, logical_file_id` (S:4983-5021).

## Flags

### SECURITY
- **PRA admin bypass skips the permission layer.** RPA sets `req.isAdminBypass = true` for any caller where `userHasAllProjectAccess` is true (requireProjectAccess.js:66-76), and PRA runs the `requiredPermissions` comparison only when `!req.isAdminBypass` (authorizeProjectResource.js:91). `userHasAllProjectAccess` is true for the role `Admin`/`admin` and for `project_management:write`, `all_projects:read`, `users:write` or `roles:write` (permissionHelpers.js:60-73). A user holding only `all_projects:read` can therefore:
  - delete any file (`DELETE /api/files/:fileId`, server.js:2066) without `file:delete` or `file_delete`;
  - delete any file's preview data (server.js:2022) without those permissions;
  - pass the `file_preview:read` check on preview (server.js:1921). The row data is still blanked for this user by `filterDataset` layer 1 (see the BUG "Preview blanked for some users"), so only `columns` and `totalRows` leak (server.js:1976-2013).

  This is limited to files whose project RPA can resolve (see the BUG on the numeric id and missing files).
- **Project override through `?project_id` or the body.** RPA uses `req.query.project_id` or `req.body.project_id` *before* it looks up the file's own project (requireProjectAccess.js:186-191). It never checks that the file belongs to that project. The handlers then load the file by `fileId` alone:
  - GET `/:fileId` (server.js:1888)
  - `/full` (:6362)
  - preview (:1935)
  - preview-data delete (:2034, :2042)
  - delete (:2079-2101)

  So a member of project A can read, or with the delete permissions delete, a file in project B by adding `?project_id=A`. The preview rows are still blanked by `filterDataset`'s own project check (columnAccessControl.js:296-326), but the column list and `totalRows` are still returned.
- **`/full` column masking never triggers.** The governance rows passed to `filterColumns` contain only `tag_id, tag_name, description, color, badge_style, assigned_at` (server.js:6412-6421). `filterColumns` decides sensitivity from `sensitivity_level`, `requires_view_permission` and `permission_required` (columnAccessControl.js:166-171, :185). Every column is therefore "allowed", and the full `min`, `max` and frequent values are returned. The `schema_definition` fallback marks every column `full` without any check (server.js:6533). The raw `file` row, including `schema_definition` and `metadata`, is also returned (server.js:6579).
- **No permission check on bulk delete.** Any authenticated user in a file's project can delete it through `POST /api/files/bulk-delete` (server.js:2128-2131). The single delete requires `file:delete` and `file_delete` unless the caller gets the admin bypass (server.js:2025-2028, :2069-2072; authorizeProjectResource.js:91).
- **Cache before authorization.** `cacheMiddleware` comes before RPA/PRA on GET `/:fileId` (server.js:1878-1881) and preview (:1923-1927). A cache hit returns at cacheMiddleware.js:44-53 without re-running the access check or the preview data-access audit log. The key is per user, so a user who loses access keeps their cached data for up to 120 s or 300 s.
- **Authenticated-but-unauthorized cache flush.** `invalidateCache('cache:*:*files*')` runs after `authenticateToken` but before PRA on both DELETE routes (server.js:2024, :2068). It also runs on bulk delete before any access check. Any authenticated user can flush every user's `*files*` cache entries, even if the request is then rejected for lack of permission or project access.
- **Vendor restriction only on some routes.** The drop-location check exists on GET `/:fileId` and on the list routes. It is missing on `/full`, preview, copies and delete (server.js:6324-6329, :1921-1927, :2266).
- **Processed-catalog delete has no checks.** `DELETE /api/file-audit/correlation/:id` has no project or ownership check (fileAudit.js:337-361). It is owned by LEDG and only consumed by this page.
- **Global tag and policy lists.** `/full` returns every governance tag and policy, with no project scoping (server.js:6397-6398).

### BUG
- **Numeric `:fileId` passes RPA but fails in the handlers.** RPA looks up `files.id` for an all-digit `:fileId` (requireProjectAccess.js:231-232). GET `/:fileId` then calls `getFileById(fileId)` (server.js:1888), which queries `WHERE file_id=$1` (FileService.js:271), and preview queries `WHERE file_id = $1` (server.js:1935). Both return 404 `File not found` for a numeric id, unless a `file_id` string equals that number. Preview-data delete and single delete use `file_id=$1` too (server.js:2034, :2079-2101), so they also 404 or, with the bypass, hit the wrong row only if a `file_id` equals the number. Only `/full` maps the numeric id to `file_id` (server.js:6334-6348).
- **Bulk delete reports deletions that never happened.** All files are deleted inside one transaction, and per-file errors are caught and the loop continues (server.js:2195-2230). In PostgreSQL, once any statement fails, every later statement in the transaction fails and COMMIT rolls back. The handler still returns `success:true` with a `deletedCount` covering the files processed before the failure, although nothing was deleted.
- **Vendor filtering refers to columns that do not exist.** `files` has no `file_path` or `location` column (S:4983-5021; database_ddl_2026-01-07.sql:1289-1324). The vendor filters compare `''.startsWith(drop_location_path)` (server.js:1506, :1603, :1897). As a result:
  - a vendor with a non-empty drop location sees no files in either list;
  - that vendor gets 403 on GET `/:fileId` for every file.
- **`/api/files` is capped at 50 rows.** The route does not pass `limit`, so the default `limit = 50` applies (FileService.js:311; server.js:1572-1576), while `totalCount` counts all rows. The vendor filter then runs on those 50 rows.
- **`sub_project_id` is ignored on `/api/files`.** The route sets `filterOptions.subProjectId` (server.js:1588), but `getAllFiles` never reads it (FileService.js:308-316).
- **Inconsistent response shape on `/api/files`.** It returns a bare array `[]` when the caller has no projects (server.js:1564) and `{files,totalCount}` otherwise (:1618). FileSelector.jsx:37 calls `response.data.filter(...)`, which throws on the object shape.
- **Admin with a non-numeric `?project_id` on `/api/files`.** `parseInt` returns `NaN` and the admin branch sets `filterOptions.projectIds = [NaN]` (server.js:1580-1583).
- **Delete needs two permissions at once (non-bypass callers).** PRA requires both `file:delete` and `file_delete` (authorizeProjectResource.js:97-99). Object permissions only produce the `resource:action` form, `file:delete` (:93-95). A caller without the admin bypass can delete only if a role's `roles.permissions` JSON also holds the literal string `file_delete` (authenticate.js:277-281).
- **A missing file usually gets 400, not the handler's 404.** When the request has no `?project_id=` and no body `project_id`, RPA's lookup returns null for a non-existent file, so RPA answers 400 `Project context required` before the handler runs (requireProjectAccess.js:55-62, :210-212). This affects GET `/:fileId`, `/full`, preview, preview-data and delete. If `?project_id=` or a body `project_id` is supplied, RPA takes it before the file lookup (requireProjectAccess.js:186-191). A bypass caller then passes with any id, and a non-bypass caller passes if a member of that project. The handler 404s are reachable in that case (server.js:1891, :1938, :2037, :2082, :6402).
- **Statistics missing from `/full`.** `/full` reads `non_null_count, mean_value, median_value, std_dev, histogram` from `file_columns` (server.js:6462-6497). These columns are not in the prod DDL (S:4699-4730). A repo-wide search of `*.js`, `*.sql` and `*.sh` files for `non_null_count|median_value|std_dev` finds hits only in server.js (6462-6490, 6639-6673, 6775-6782, 12774-12781), so no `.sql` file adds them. (`mean_value` was not part of that search; fileProcessingWorker.js:1681 writes it into a JSON object, not a column.) `count`, `mean`, `median` and `stdDev` are therefore undefined, and `histogram` is null.
- **Duplicate columns for multi-role files.** `file_columns` is unique on `(file_id, column_name, file_role)` with roles `source`, `target`, `adhoc` (S:4725-4728). The detail, preview and `/full` reads do not filter on `file_role` (FileService.js:284; server.js:1945, :6363). A file profiled under several roles returns each column several times.
- **Zero becomes null in the `/full` fallback.** The `schema_definition` fallback uses `||` (server.js:6516-6531), so a `0` for `unique_count`, `min`, `max` or `mean` becomes `null`.
- **Masked/denied counts leak.** Masked or denied columns in `/full` still expose `count`, `unique` and `missing` (server.js:6462-6464).
- **Preview limit errors.** Preview `limit` has no upper bound, and a negative value is passed straight to SQL `LIMIT` (server.js:1956-1960), which PostgreSQL rejects, so the route returns 500.
- **Preview blanked for some users who passed the middleware.** Users who reach a project only through a group, or who are "admins" only through `all_projects:read`, pass RPA/PRA (requireProjectAccess.js:84-102; permissionHelpers.js:65-70). They then fail `filterDataset` layer 1, which checks direct `project_members` and `userHasAdminAccess` (columnAccessControl.js:41, :54; requireProjectAccess.js:326-337). Their preview comes back empty, and the FE says the data "has been deleted for security" (FilePreview.jsx:98).
- **Catalog dedupe merges files across projects.** Files without a `logical_file_id` are grouped by `filename` across all projects (FileCatalog.jsx:331). Same-named files in different projects collapse into one row. Copies are counted per project (server.js:2300-2301, :2319-2320).
- **Made-up quality components.** The catalog tooltip shows completeness 95, consistency 85, validity 80, uniqueness 75 and timeliness 90 whenever `quality_components` is missing (FileCatalog.jsx:497-503). No FILE route returns that field.
- **Hanging middleware promise on deny.** When RPA denies inside PRA, it sends the response and never calls `next` (requireProjectAccess.js:61, :111, :129, :144, :172). PRA's `await new Promise(...)` (authorizeProjectResource.js:67-75) then never settles, and the `res.headersSent` branch at :78 is never reached on that path.
- **Archive deletes can fail on badges.** `user_badges.file_id` has an FK with no cascade (S:7822). Deleting an archive cascades to its child files through `files_parent_archive_id_fkey` (S:7507). Only the archive's own `user_badges` rows are deleted first (server.js:2097), so a child file with badges makes the delete fail with an FK error (500).
- **Access-state mismatch in FilePreview.** FilePreview treats `_accessLevel === 'none'` as denied (FilePreview.jsx:175), but `/full` emits `'denied'` (server.js:6476).
- **Empty tooltip in FilePreview.** The preview tooltip reads `tags` and `requiresPermission` (FilePreview.jsx:148-149), but the API sends `restrictedBy` (columnAccessControl.js:359-360), so the tooltip is empty.
- **Wrong log value.** The `/api/files` vendor log records `originalCount: files.length` after filtering (server.js:1613).
- **Sub-project change does not reset the page.** In FileCatalog the page-reset effect omits `selectedSubProject` (FileCatalog.jsx:410-412).

### DUPLICATE
- **List endpoints.** `/api/files/init-data` (server.js:1406) and `/api/files` (:1531) do the same job with these differences:
  - accepted permissions (init-data also accepts `file_catalog:read`);
  - limit (none vs 50);
  - server cache (none vs 300 s);
  - empty response (an object vs `[]`);
  - `project_id`/`sub_project_id` filters (only `/api/files`).

  `/api/vendor-files` (server.js:1626-1724, VND) is a third variant. It filters `is_vendor_file = true`, uses its own SQL instead of FileService, paginates with `pageSize` up to 100, and does not join `file_audit_details`.
- **Delete implementations.**
  - single delete (server.js:2066-2125): deletes `file_preview_data` explicitly; requires `file:delete` and `file_delete` (unless admin bypass);
  - bulk delete (:2128-2263): no explicit `file_preview_data` delete; no permission check; no size cap;
  - vendor bulk delete (server.js:1727-1820, VND): requires `vendor_file_quality:write`, `file_upload:write` or `admin`; at most 100 ids; deletes only `file_columns`, `vendor_file_profiling_results` and `files`; no transaction; invalidates only `/api/vendor-files*`. For a non-admin with zero projects it skips the project filter (:1777-1780);
  - `FileService.deleteFile` (FileService.js:420-471): `file_columns` and `files` only, and unlinks `metadata.path` from disk. It is never called.
- **Admin predicates.**
  - `userHasAllProjectAccess` (server.js:348; permissionHelpers.js:60) includes `all_projects:read`. It is used by the list routes, copies and RPA (and so drives the PRA bypass).
  - `userHasAdminAccess` in permissionHelpers.js:80-92 includes `project_management:write`. It is used by `validateBulkFileAccess` and `columnAccessControl`.
  - The server.js copy of `userHasAdminAccess` (server.js:380-403) omits `project_management:write`.
  - The file-view permission check is written inline three times with different lists (server.js:1410-1415, :1535-1540, :1630-1635), and checks only `p.name` on objects (permissionHelpers.js:19-21 also checks `permission_name` and `permission_code`).
- **Project membership checks.** `requireProjectAccess` checks direct and group membership (requireProjectAccess.js:84-102). `checkProjectMembership` checks direct membership only (:326-337). `getUserProjects` checks direct and group membership and active projects only (:362-423).
- **Filename-pattern extraction.**
  - `filenameNormalizer.extractFilePattern` (filenameNormalizer.js:84-97) returns `<canonical base>_*<ext>`;
  - `etlProfilingService.extractFilePattern` (etlProfilingService.js:178-199) replaces dates and numbers anywhere with `*`;
  - `fileInsightsService.extractFilePattern` (fileInsightsService.js:17-32) also handles `_v1.0`, `_A`, `_sample_X`, `_trans_N` and `_fallback`.

  The three give different patterns for the same filename.

### DEAD
- These FileService methods have no callers: `saveFile`, `deleteFile`, `updateFile`, and the `validate*`, `extractMetadata`, `mimeTypeMappings` and `fileSizeLimits` helpers (FileService.js:133-257, :420-540, :550-867). The grep found no callers outside FileService.js itself. `saveFile` would insert a `stats` column into `file_columns`, which the DDL does not have (FileService.js:222; S:4699-4730). Its id format is `file_${Date.now()}` (FileService.js:143). The size limits are recorded for reference:
  - csv and json: 500 MB;
  - parquet, sas7bdat, xpt and avro: 1 GB;
  - xlsx and xml: 100 MB;
  - zip, tar, gz, tgz and bz2: 2 GB;
  - dat: 500 MB;
  - default: 100 MB (FileService.js:82-101, :153).
- The live FileService methods are `getAllFiles` and `getFileById` (server.js), plus `getFileProfile`, which AI uses (aiRoutes.js:76; AIService.js:296).
- `fileAccessHelpers.validateFileAccess` (fileAccessHelpers.js:16-47) has no callers.
- `filenameNormalizer.isSameLogicalFile` (filenameNormalizer.js:105-109) has no callers.
- Frontend code with no callers: `useFileCatalog`, `useFileDetails` and `useFileFullData` (useFiles.js:37-46, :51-61, :83-93), `getFilePreview` (fileService.js:396-411), and the `FileCatalog` prop `onFileSelect` (FileCatalog.jsx:19). `getFileCatalog` is only reachable from the uncalled `useFileCatalog`.
- `validateArchive` computes `isTar` but the return is commented out, so every archive passes (FileService.js:818-827). It is also part of the dead `saveFile` path.

### UNCLEAR
- After a project is selected, the catalog's sub-project filter defaults to `'none'`, i.e. only files with no sub-project (FileCatalog.jsx:122-128). The option is labelled "Select a subproject" (:706). It is not clear whether hiding sub-project files by default is intended.
- Catalog exclusion of targets uses `file_audit_details.file_role` (FileService.js:346), not `files.file_role` (S:5005). A file with several audit rows appears if any row is not `target`, because of `DISTINCT`. Which column is authoritative is unclear.
- `extractFileId` (server.js:410-430) is registered with `app.use(extractFileId)` (server.js:609). For paths starting `/api/files/` it scans the fixed list `preview, profile, profile-history, quality, ownership, policies, tags, schedules, insights, columns, job-status, preview-data` (server.js:412) and sets `req.params.fileId` to the text before the first match. `/preview` and `/preview-data` are in the list; `/full`, `/copies` and bulk-delete are not, nor is plain `/api/files/:fileId`. The routes here declare `:fileId` themselves, and Express (framework behaviour, not code in this repo) rebuilds `req.params` for each matched route, so its effect on these handlers is probably nil. This is an inference; the repo code does not show it either way.
- `FileService` constructor runs `ensureDirectoriesExist()` without `await` and rethrows errors (FileService.js:35, :120-123), which could be an unhandled rejection at DI registration.
- `/full` returns `profile.fileId` as the raw path parameter, which may be the numeric id (server.js:6540), while `file.file_id` is the UUID.

## Domain terms
- **file / dataset / uploaded file**: a row in `files`. The catalog subtitle reads "All uploaded files with quality metrics and metadata" (FileCatalog.jsx:605).
- **file_id vs id**: `file_id` is the string key, called "UUID" in comments (server.js:6334-6335). `id` is the numeric row id used by lineage graph nodes. Both are accepted as `:fileId` by RPA and `/full`; the other handlers accept only `file_id` (see BUG).
- **logical file / logical file group / canonical name / logical_file_id / logical_file_name**: grouping across uploads by normalized filename per project (filenameNormalizer.js:15-77; logical_file_groups S:5333-5350).
- **copies / versions / "latest version"**: other files in the same logical group, or with the same filename and project when there is no group (server.js:2265; FileCatalog.jsx:319-320).
- **project / sub-project / parent project**: a `projects` row with `parent_id` (server.js:1448-1476).
- **admin / all-project access / admin bypass**: `userHasAllProjectAccess` and `userHasAdminAccess` (see DUPLICATE). "Admin bypass" is the RPA path that sets `req.isAdminBypass` (requireProjectAccess.js:66-76), which PRA honours by skipping `requiredPermissions` (authorizeProjectResource.js:91).
- **vendor / drop location (`drop_location_path`)**: an external vendor user and their storage prefix (vendorAccessControl.js:14-40; S:6797).
- **preview data**: up to N stored sample rows in `file_preview_data`. Deleting it is presented as a security measure (FilePreview.jsx:98, :260).
- **profile**: the per-column statistics in `file_columns` (server.js:6539-6550).
- **masked / denied / allowed column, `_accessLevel` (`full`/`masked`/`denied`), `[REDACTED]`**: column-level access control results (server.js:6458-6503; columnAccessControl.js:154-228).
- **file_role: adhoc / source / target**: the role of a file in ETL (S:4725-4728). **Processed file / transformation file / target file** are files produced by ETL mappings and shown in the processed catalog (ProcessedFileCatalog.jsx:240, :272).
- **correlation_id**: links source and target audit rows of one transformation run (fileAudit.js:334-345).
- **failure_reason_code**: an enum with the values `virus_detected`, `password_missing`, `unsupported_encoding`, `conversion_failed`, `extraction_failed`, `clamav_unavailable`, `malformed_file`, `schema_validation_failed` (database_ddl_2026-01-07.sql:24). **processing_error** holds the human-readable message (S:5047).
- **has_schema_changes / "Schema Changed"**: a flag on the logical group (FileService.js:334; FileCatalog.jsx:444-448).
- **header_validation**: `files.metadata.header_validation.{status, issues_found, issues}` (FileCatalog.jsx:305-317).

## Open questions
- Which permission strings production roles actually hold (`file_view`, `file:read`, `file_catalog:read`, `file_preview:read`, `file:delete`, `file_delete`). This decides who can list, preview or delete without the admin bypass. The code shows only the checks.
- Whether `files.project_id` holds the parent project or the sub-project for files in sub-projects. The list filter uses `files.project_id = ANY(accessible)` (FileService.js:350) and the sub-project filter uses `sub_project_id`. S:5007 only says it "Links file to a sub-project".
- Whether any deployment adds `file_path`/`location` to `files`, or `non_null_count`/`mean_value`/`median_value`/`std_dev`/`histogram` to `file_columns`, outside the repo. No `.sql` file hit for the stats column names (see the BUG "Statistics missing from /full").
- How `file_preview_data` is populated and how many rows are stored per file. That code is in ING/PROC and was not traced here.
- What `normalizeDataType` (backend/utils/schemaExtractor.js) maps types to (SCH area).
- Whether `getAuditRecords` (fileAuditService.js) scopes `/api/file-audit` to the caller's projects. The route passes `userId`, `userRoles` and `userPermissions` (fileAudit.js:311-313), but the filtering logic was not traced (LEDG).
- Whether `extractFileId` has any runtime effect on these routes. It is registered (server.js:609); the remaining doubt is only Express's per-route `req.params` behaviour (see UNCLEAR).
