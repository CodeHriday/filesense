# ERR - Error review (violation triage)

## Summary
Router `backend/routes/errorReview.js` is mounted at `/api/error-review` behind `authenticateToken` only (server.js:5327-5328). It reads and updates `quality_rule_violations`, split into "file upload" violations (`job_id` NULL or '') and "mapping job" violations (`job_id` set) (errorReview.js:41, :184). The UI page `src/pages/ErrorReview.jsx` uses a two-tier layout: groups (file or job) and then the violations inside a group (ErrorReview.jsx:96, :125, INNER_PAGE_SIZE=25 at :12). Read endpoints filter by project membership unless the user is "admin" (via `userHasAdminAccess`). The status update and bulk-update endpoints have no project check. Only bulk-delete has a permission check. There are 9 HTTP endpoints, all confirmed, plus 1 FE route.

Admin test (`userHasAdminAccess`, permissionHelpers.js:80-92): role "Admin"/"admin" (:45), or any of the permissions `users:write`, `roles:write`, `project_management:write`.

Project-access subquery, repeated in every read endpoint: project_members for the user UNION project_access_groups joined to user_groups (errorReview.js:47-55).

## Entry points

### 1. GET /api/error-review/file-upload-violations (errorReview.js:23)
- Trigger: FE inner tier (ErrorReview.jsx:125-137).
- Auth: authenticateToken. Non-admins are restricted to their projects, matched on `p.id` where p = the file's project (:46-57).
- Inputs: project_id, file_id, rule_type, severity, status (default 'all'), page (1), limit (50), search ('') (:25-34). `project_id` is accepted only if it is an integer > 0, otherwise it is silently ignored (:11-17, :59). `rule_type`, `severity` and `status` are not validated against any list. 'all' disables a filter.
- Search: ILIKE `%search%` on rule_name, filename, project name and `violation_details::text` (:85-93).
- Output: `{violations: [...], pagination: {total, page, limit, totalPages}}`. Ordered by `created_at DESC`. Joins: INNER quality_rules, INNER files, LEFT projects (project and sub-project) (:97-138).
- Errors: 500 `{error, details: error.message}` (:158). `details` leaks internal error text.
- No `date_from`/`date_to` here, unlike the groups and download endpoints.

### 2. GET /api/error-review/mapping-job-violations (:166)
- Same shape as #1 but `job_id IS NOT NULL AND != ''` (:184). Project is `COALESCE(p.id, tj_p.id)`, meaning the file's project or the transformation job's project (:191).
- Extra joins: transformation_jobs, executing user, latest 'source' file_audit_details row, visual_mapping_executions/defs, and a sub-project taken from `violation_details->>'_sub_project_id'` (:245-264). Fallbacks: filename = COALESCE(f.filename, fad.file_name, violation_details->>'_file_name') (:291); sub-project = COALESCE(sp, vmd_sp, vd_sp) (:295).
- Extra output columns: mapping_name, transformation_job_id, job_start_time, executed_by_username, executed_by_fullname (:297-301).
- Same defaults (page 1, limit 50) and error handling.

### 3. PATCH /api/error-review/violations/:id/status (:335)
- Auth: authenticateToken only. No role, permission or project check (SECURITY).
- Inputs: `status` must be one of `new`, `reviewed`, `acknowledged`, `resolved`, else 400 `Invalid status value` (:341). `resolution_notes` is optional. `:id` is not validated.
- Effect: for `resolved`, sets status, resolution_notes (or NULL), resolved_by = req.user.id, resolved_at = CURRENT_TIMESTAMP and updated_at (:347-356). For any other status it sets only status and updated_at (:358-362). `resolved_by`, `resolved_at` and `resolution_notes` are not cleared when a violation moves out of `resolved` (:358-362).
- Output: `{violation: <full row via RETURNING *>}`. 404 `Violation not found` (:368). 500 on error.
- Status transitions are unrestricted: any status can go to any other.

### 4. POST /api/error-review/violations/bulk-update (:382)
- Auth: authenticateToken only. No permission or project check.
- Inputs: `violation_ids` must be a non-empty array, else 400 (:386). `status` uses the same 4-value list (:390). Array elements are not validated. Non-numeric ids reach the DB and cause a 500. There is no maximum length.
- Effect: `UPDATE ... SET status=$1, updated_at` where id is in the list (:396-402). For `resolved` it does NOT set resolved_by, resolved_at or resolution_notes, unlike #3 (BUG or inconsistency).
- Output: `{updated_count, updated_ids}`. 500 `Failed to bulk update violations`.
- The FE service exposes this (errorReviewService.js:45), but the page imports only `bulkDeleteViolations` (ErrorReview.jsx:7). The UI does not call it.

### 5. GET /api/error-review/file-upload-violations/groups (:418)
- Inputs: as #1 but no file_id; default limit 10; adds `date_from` and `date_to` (:420-430). The date filter is `DATE(f.created_at) >= / <=` on the file upload date (:485, :490).
- Output: `{groups: [{file_id, filename, file_uploaded_at, upload_date, project_id/name, sub_project_id/name, violation_count, latest_violation_at}], pagination}`. Grouped by file, total = `COUNT(DISTINCT file_id)`. Ordered by `DATE(f.created_at) DESC, f.created_at DESC` (:509-527).
- Search is the same as #1 and is applied before grouping.

### 6. GET /api/error-review/mapping-job-violations/groups (:555)
- Inputs as #5 (no job_id). The date filter is on `DATE(tj.start_time)` (:623-630). The search does not include filename, unlike #2 (:612-618).
- Output: groups by job_id, with mapping_name, job_start_time, job_date, project, `MIN(sp.id)`/`MIN(sp.name)` for sub-project, violation_count and latest_violation_at (:649-667). Ordered by `DATE(tj.start_time) DESC NULLS LAST`.
- The sub-project here uses only `sp` (the file's sub-project), without the vmd/vd fallbacks that #2 uses. So the group and the detail can show different sub-projects (UNCLEAR/DUPLICATE).

### 7. GET /api/error-review/file-upload-violations/download (:695)
- Inputs: the #5 filters plus file_id, label, format ('csv' default; the value 'excel' gives xlsx; any other value gives csv) (:697-708).
- Behaviour: no pagination, so it returns ALL matching rows. The query is in :779-805. Columns are Project, Sub-Project, File Name, Rule Type, Rule Name, Row Number, Column Name, Expected Value, Actual Value, Severity, Status, Record Snapshot (JSON string), Created Date (ISO), Created By, File Owner, Source Path, Target Path. In this endpoint the last four are literal NULL (:794-797), so they are always empty.
- Filename: `label` is reduced to its last path segment after splitting on '/', non-`[\w.-]` characters become '_', then `-violations.csv|xlsx` is appended; the default base name is `file-upload-violations` (:811-855). Excel sheet name is 'File Upload Violations'. CSV is hand-built with every cell quoted and `"` doubled (:853). There is no neutralisation of cells starting with `=`, `+`, `-` or `@` (SECURITY: CSV/Excel formula injection).
- `row_number || ''` prints an empty cell when the row number is 0 (BUG, minor).
- Errors: 500 `Failed to download violations`.

### 8. GET /api/error-review/mapping-job-violations/download (:868)
- Like #7 but joins transformation_mappings (source_owner as File Owner, file_path as Source Path, target_file_path as Target Path) and users (username as Created By) (:954-985). file_name = COALESCE(f.filename, tj.mapping_name).
- The search joins `f.filename` and `tj.mapping_name`. The date filter is `tj.start_time`.
- `label` is sanitised without taking the last path segment (:991-993). Default base name is `mapping-job-violations`.
- The sub-project comes only from `sp` (no vmd/vd fallbacks, unlike #2).
- The `job_id` filter is applied in this endpoint (:925).

### 9. POST /api/error-review/bulk-delete (:1050)
- Auth: authenticateToken plus an inline check: admin (`userHasAdminAccess`), or `permissions` containing the literal string `quality:write` or `violations:delete` (:1053-1059). Otherwise 403 `{success:false, error:'Insufficient permissions...'}`.
- The permission check uses `Array.includes` on raw strings (:1058-1059), whereas the shared helper also accepts permission objects (permissionHelpers.js:12-23). If a user's permissions are objects, the check fails for non-admins (BUG candidate, UNCLEAR).
- Input: body `{violationIds: [...]}`. Missing or empty gives 400. Each id must be a positive integer, else an Error is thrown (:1079-1085), which falls into the catch and returns 500 rather than 400 (BUG).
- Effect: `DELETE FROM quality_rule_violations WHERE id = ANY($1)` (:1088). A hard delete with no soft-delete. Logs via systemLogger.info with user id, username, counts and the ids (:1096).
- Output: `{success, message, deleted, notFound, total}`. `notFound = violationIds.length - rowCount` (:1094). If the input contains duplicates, `notFound` is overstated.
- No project-scope check: a user with `quality:write` can delete violations in any project (SECURITY).

### 10. FE route /error-review (src/App.jsx:375, src/pages/ErrorReview.jsx)
- Uses fetch with `authHeaders()` for groups, violations and downloads, and the service function for bulk delete (ErrorReview.jsx:104, :137, :183, :202, :263).
- Defaults: group limit 10 (:70); inner page size 25 (:12).
- Downloads: the page-level download excludes `page` and `limit` and drops 'all' and empty values (:181). The per-group download is Excel (:189-202).
- I did not trace the FE permission gating of the delete button, or the project dropdown (it uses `getProjects` from qualityRulesService, :6).

## Data touched
- `quality_rule_violations`: R (all reads), U (status, resolution_notes, resolved_by, resolved_at, updated_at), D (bulk-delete).
- Read-only joins: quality_rules, files, projects, project_members, project_access_groups, user_groups, transformation_jobs, transformation_mappings, users, file_audit_details, visual_mapping_executions, visual_mapping_defs.
- Audit: auditMiddleware maps `/api/error-review` to type `error_review` (auditMiddleware.js:86). I did not verify what it records.
- `mapping_job_errors`: the inventory lists it under ERR, but no ERR code references it (see inventory corrections).

## Flags
- SECURITY: PATCH status (#3) and bulk-update (#4) have no permission or project-ownership check. Any authenticated user can change any violation (errorReview.js:335, :382).
- SECURITY: bulk-delete is not project-scoped (:1088). Also, any user holding `quality:write` can delete.
- SECURITY: CSV and Excel exports do not neutralise formula-prefixed cells (:853, :1033, :817).
- SECURITY (minor): 500 responses return `error.message` in `details` (:158, :327, :547, :687, :1122).
- SECURITY (minor): no cap on `limit`, no cap on the download size, and no cap on the bulk id list. `limit` is not validated, and a negative or NaN limit or page reaches SQL.
- BUG: bulk-update to `resolved` does not set resolved_by, resolved_at or resolution_notes, but single update does (:347-356 vs :396-402).
- BUG: leaving `resolved` does not clear resolved_* fields (:358-362).
- BUG: bulk-delete invalid-ID error returns 500, not 400 (:1082, :1113-1123).
- BUG: `row_number || ''` hides row 0 (:824, :1003).
- BUG candidate: bulk-delete permission check uses string `includes` only (:1058-1059).
- DUPLICATE: the access-control, filter and search blocks are copy-pasted across 6 read/download endpoints, with differences:
  - file_id is filtered in #1 and #7 only; job_id in #2 and #8 only;
  - date filters exist in #5-#8 but not in #1-#2;
  - mapping-job search includes filename in #2 and #8 but not in #6 (:228-236, :611-618, :930-938);
  - sub-project fallback logic exists only in #2 (:262-296).
- DUPLICATE: the CSV/Excel building code is duplicated verbatim in #7 and #8. `label` sanitising differs (:811 vs :991).
- DUPLICATE: the single and bulk status updates implement the same transition differently (see BUG).
- DEAD: errorReviewService.js `getViolations` (`/violations`), `getFileErrors` (`/file-errors`), `getMappingErrors` (`/mapping-errors`) and `getErrorStatistics` (`/statistics`) (errorReviewService.js:16-35) call routes that do not exist in errorReview.js (I found no handler for them). Whether anything calls them, I did not check.
- DEAD (FE): `updateViolationStatus` and `bulkUpdateViolationStatus` are not imported by ErrorReview.jsx (only `bulkDeleteViolations` is, :7). I did not search other files. The status endpoints (#3 and #4) may therefore be unused by the UI.
- DEAD: unused variable `userRoles` in #1, #2, #7, #8, #9 (:38, :181, :711, :884, :1054).
- UNCLEAR: for non-admins, a violation with no project (p.id NULL, or no file in #2) can never match the membership test, so it is hidden from non-admins. Whether this is intended is not known (:49, :191).
- UNCLEAR: the `status` filter values are free text. The status set (`new`, `reviewed`, `acknowledged`, `resolved`) is enforced only on update.

## Domain terms
- Violation = row in `quality_rule_violations` (qrv); rule = `quality_rules` (qr). Severity values are not defined in this area.
- "File upload violations" = job_id NULL or '' ("direct file uploads", :21). "Mapping job violations" = job_id set ("ETL mapping jobs", :164). The mapping-job tier is also called "transformation job" (tj) and "visual mapping" (vm); the code also says "VM jobs" (:243).
- Group = outer tier (file or job). Violation = inner tier.
- Statuses: new, reviewed, acknowledged, resolved.
- "Admin" for this area = `userHasAdminAccess` (role or any of three write permissions).
- Different names for the same thing: filename (`f.filename`, `fad.file_name`, `_file_name`); file_name in download; project `p` and `tj_p`.

## Open questions
1. Does anything other than ErrorReview.jsx call `/violations/:id/status` and `/violations/bulk-update`? Status changes may have no UI.
2. Which routes do the dead service functions (`/violations`, `/file-errors`, `/mapping-errors`, `/statistics`) correspond to, and are they used anywhere?
3. Is it intended that any authenticated user can change status, and that bulk-delete is not project-scoped?
4. Are permissions stored as strings or objects on `req.user`? This decides whether the bulk-delete check works for non-admins (authenticateToken was not traced).
5. What does auditMiddleware actually record for `error_review` routes?
6. Which FE conditions show the delete button, and does the FE restrict who can see it?
7. What are the valid `severity` and `rule_type` values, and where are they set?
8. Is hiding of project-less violations from non-admins intended?
9. What does `mapping_job_errors` have to do with this area? No code here uses it.
10. The FE bulk delete sends `selectedIds` (ErrorReview.jsx:263). I did not check whether it enforces any size limit.
