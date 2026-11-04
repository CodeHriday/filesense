# FILE verification (final, after fix round 2)

Verdict: PASS. Checked 40, wrong 0, unsupported 0, missing 0.

Completeness: all 9 HTTP routes (init-data, list, detail, preview, preview-data delete, single delete, bulk-delete, copies, full) and both FE pages have full subsections. Flags, Domain terms and Open questions are present.

Round-2 items, all CORRECT:
- Preview bypass leaks only columns/totalRows: userHasAdminAccess (permissionHelpers.js:80-92) excludes all_projects:read. columnAccessControl.js:41 and :54 then deny, and filterDataset returns empty data (:298-326). server.js:2006-2013 still returns columns and totalRows.
- The 404 is reachable via ?project_id=: requireProjectAccess.js:186-191 takes the id before the file lookup. The bypass at :66-76 passes, and the handler 404s (server.js:1891).
- getFileDetails callers: QualityReport.jsx:43, QualityChecks.jsx:52 and LineageImpact.jsx:33 call it. DataProfile.jsx:11 only imports it.
- extractFileId: registered at server.js:609, list at :412, defined at :410-430. The Express params remark is flagged as an inference.
- Stats-column grep: server.js hits are at 6462-6490, 6639-6673, 6775-6782 and 12774-12781. The only other hits are fileProcessingWorker.js and header_validator.py, which the notes do not claim to cover.
- Copies 500 branch: server.js:2327-2330.
- [NaN] BUG: server.js:1580-1583.

Sampled pass, all CORRECT:
- init-data permission check, scope and vendor filter (server.js:1406-1528).
- /api/files permission list without file_catalog:read (:1531-1551), bare [] at :1564, and the default limit 50.
- getAllFiles query, target exclusion and sort whitelist (FileService.js:307-412).
- Single delete order and transaction (server.js:2086-2104).
- Bulk delete: no PRA, the resolution modes, the per-file catch loop with COMMIT, and the 403/404 mapping (server.js:2128-2262).
- validateBulkFileAccess (fileAccessHelpers.js:56-92).
- Copies access check and siblings (server.js:2266-2331).
- /full: numeric id resolution (:6334-6348), tag rows without sensitivity fields (:6412-6421).
- Detail handler and vendor check (:1875-1917).
- FileCatalog dedupe (:321-340) and the page-reset effect omitting selectedSubProject (:410-412).
- RPA admin bypass (:66-76), 400 (:55-62) and project-id extraction.
- PRA isAdminBypass guard (authorizeProjectResource.js:91).

Remaining problems: none.
