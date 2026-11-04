# VND verification (final, after fix round 2)

Verdict: PASS

Counts: about 45 claims checked in this pass (the full set from the round-2 report was carried over), 0 wrong, 0 unsupported, 0 missed.

## Round-2 changes, each checked
- DEAD list is renumbered to 5 items. The old DEAD 3, which listed `requirePermission`, `checkPermission` and `hasAnyPermission`, is gone. CORRECT.
- DUPLICATE 2 now says "copied twice" and cites create (vendorService.js:286-339) and update (:891-943). I compared the two blocks. They are the same code: email lookup, bcrypt of a random 16-byte hex password, the `Vendor` role lookup, the `users` INSERT and the `user_roles` INSERT. The primary-user variant (:137-163) is mentioned as a third. CORRECT.
- BUG 13, three parts. All CORRECT.
  - database_ddl_2026-01-07.sql:3545 (`vendor_agreements_vendor_id_fkey`) has no ON DELETE action. createVendorManagement.js:56 says `ON DELETE CASCADE`.
  - DDL :3553 (`vendor_file_profiling_results_vendor_id_fkey`) has no ON DELETE action.
  - DDL :3565 (`vendors_project_id_fkey`) has no ON DELETE action. createVendorManagement.js:33 says `ON DELETE SET NULL`. `deleteVendor` runs `DELETE FROM projects` at vendorService.js:1244-1247 and `DELETE FROM vendors` at :1262-1265, so the project is deleted first. The condition at :1243 matches the "common case" the notes describe.
- The DELETE entry points to BUG 13, and OQ 1 points to BUG 13. Both are consistent with the BUG text.
- `vendor_details:read` gate: VendorManagement.jsx:63-65 defines `canAccessVendorDetails` from `hasPermission('vendor_details:read')`. CORRECT.

## Spot checks repeated
- Mounts at server.js:13881 and :13901. CORRECT.
- Route lines for server.js:1626, :1727, :2336 and :2442. CORRECT. The 1626 middleware chain is `authenticateToken, attachVendorProfile, cacheMiddleware(300)`.
- The dead `req.vendorProfile` branches at :2354 and :2477. CORRECT. Neither profiling route has `attachVendorProfile`.
- DELETE route (vendorRoutes.js:273-293). CORRECT: 400 for a non-numeric id, every `success:false` becomes 404, a thrown error becomes 500 `Failed to delete vendor`, and the comment says "deactivate".
- checkVendorDependencies (vendorService.js:1002-1067). CORRECT: the three lists, the `Math.max` totalCount, and it runs through `query()` outside the transaction client.
- Cross-area note: no `/api/files/*` route is claimed to be unauthenticated. No issue.

## Coverage
All assigned entry points have a subsection: 4 server.js routes, 3 vendor-access routes, 7 vendors routes, and the 3 frontend routes. The `vendor_users` and `vendor_file_profiling_results` tables are covered under Data touched.

## Full-file rewrite
Nothing was lost compared with the round-2 report. The sections, the delete steps, the agreement conditions and the frontend call sites are all still present.

## Minor note, not blocking
The ROLLBACK for the "Cannot delete vendor" path is issued before the 404, so no transaction is left open there. The notes do not claim otherwise.
