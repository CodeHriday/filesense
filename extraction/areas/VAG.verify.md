# VAG verification (round 3, final, after fix round 2)

Verdict: PASS

Counts: about 60 claims checked, 0 WRONG, 0 UNSUPPORTED, 0 missing entry points, 1 minor omission (inside B17, conclusion unaffected).
Coverage: complete. All 22 HTTP rows in inventory (VAG) plus the multer USE handler (R:2244), the FE route (App.jsx:408) and the cron entry have subsections. Template routes at R:1499 and R:1542 are VAS in the inventory.
Full-file rewrite: nothing from the round-2 report was lost; every round-1 and round-2 item is present.

R = backend/routes/vendorAgreementRoutes.js, S = backend/services/vendorAgreementService.js, FE = src/pages/VendorAgreements.jsx.

## Round-2 changes, each checked
- B17 / Entry 7 / Draft term: CORRECT, correctly labelled inferred. S:1048-1061 pushes `approval_status = NULL` plus four stamp NULLs on status change to draft. S:1093-1106 pushes the same five again when effective status is draft and `current.approval_status !== null`. `current` is the pre-update row, so both blocks run. The UPDATE at S:1185-1191 joins `updates`, so the SET list has duplicate columns. The catch at S:1267-1270 rolls back and rethrows, and R:880-882 returns 400. For an already-draft row only the second block runs (the notes say this, which is right).
- Entry 7 "No changes detected" text: CORRECT. S:1108-1110 returns inside the try after BEGIN with no COMMIT or ROLLBACK, `finally` releases (S:1271-1273), and R:868/877 sends HTTP 200.
- OQ 10 / Entry 25: CORRECT. vendorAgreementTemplateRoutes.js:38 is `GET /vendor-agreement-template/download` with `authenticateToken`. The upload route is at :64. FE:1595 and FE:1634 are the matching axios calls.
- B4 extension: CORRECT. permissionHelpers.js:42-51 accepts 'Admin' and 'admin' strings and objects with `name` or `role_name` equal to either. S:2669 is `userRoles.includes('Admin')`. The route passes `req.user.roles` (R:315, 532).

## Other claims checked (all CORRECT)
- Mount at server.js:13886 behind authenticateToken (the notes cite 13885-13886).
- R:105-177 access middleware: admin bypass R:138, relationships R:147-169, 404 at R:115-117.
- POST R:183-259: non-admin linked check, 400/403, the non-draft file-config count, `delete` at R:222, finally cleanup, catch returns 400.
- GET / R:267-331 and its debug log R:297-305. The comment at R:290-292 contradicts S:2708-2715 (B7). Visibility SQL at S:2726-2746 and `access_group_members` at S:2735.
- stakeholder-options: `user_groups` count at R:361, 500 with `details`.
- init-data: admin and non-admin branches, `rows[0]`, `allConnections` with `config` (R:515-523), `pageSize` 10000, vote-progress `require_all !== false` (R:615), version filter (R:609-611), users query (R:625-635), catch list and the uncaught items.
- PUT route R:841-889: write permission, then access, then multer.
- Disable S:3126-3147 (rejects only 'inactive', writes a change row) and route 404 (R:1609). Delete S:3055-3105 has no status guard or change row. Cron S:3178-3217 (`updated_by` 1 and `changed_by` 1) and cronSchedulerService.js:450-454.
- check-dependencies R:1626-1673; documents R:1708-1893 (disk path stored, base64 download, unescaped filename, delete authorisation at R:1865, no cleanup on INSERT failure).
- Archive-password handlers use an undefined module-scope `pool` (R:1912, 1958, 1995). `pool` is declared only locally at R:1390.
- Stakeholders PUT R:2139-2241: strict `includes`, 404 and 400 paths, no change row.
- Multer handler R:22-43 (10 KB message, 413).
- Vendor route R:1438-1476 and S:2869-2883 (contact filter only if email; no archived filter).
- FE: isAdmin FE:162, canCreate FE:191-192, edit FE:2050, disable FE:2059 (`!== 'disabled'`), delete FE:2069, GET /:id FE:218 and 2719, files call only at SourceConfigModal.jsx:126, no stakeholders, archive-password or /vendor callers in src (grep), download fetch FE:3212 and 3291.

## Minor omission (does not change any verdict)
- B17 describes two pushes. For the usual case (active row moved to draft) the else-if at S:1138-1142 also fires, because `current.status === 'active'`, `current.approval_status` is neither null nor 'draft', and the row is not locked. It pushes `approval_status = 'pending_vendor_acceptance'` a third time and `version = version + 1`. The locked+admin branch (S:1117-1125) would add it too. The duplicate-column conclusion still holds. Optional wording fix: "at least twice".

## Observations, no action
- FE:854 also calls `GET /:id/file-schemas` (VAS). Not a VAG route.
- The cross-area note about /api/files (server.js:5283) does not apply: no VAG route is under /api/files.
