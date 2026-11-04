# ETL verification (round 3, final, after fix round 2)

Verdict: FIX (minor)
Counts: checked 40 (round-2 changes plus spot checks), WRONG 0, imprecise 2, UNSUPPORTED 0, missing entry points 0, missed behaviours 1.

DDL source: prod dump = attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql (CHECK at :6340).

## Coverage
All 17 HTTP entry points have subsections (11 router routes confirmed by grep at transformations.js:52,148,188,449,857,889,1056,1114,1156,1202,1255; 6 in server.js per inventory). The 3 FE route groups are covered. The full-file rewrite lost nothing from the round-2 CORRECT list.

## Round-2 changes
- B6 null source: CORRECT. Source null with no vendor in the DB writes NULL (:660-664). The CHECK at dump :6340 needs exactly one of the two columns non-null, so it fails and the catch returns 500.
- B6 '' source: CORRECT for a mapping whose vendor_agreement_id is already NULL (writes '' at :662-663, `if (source_connection_id)` false at :667, check skipped at :552, CHECK passes). IMPRECISE: the note does not say this holds only when the vendor is already NULL. If the row has a vendor agreement, `''` is NOT NULL and vendor stays set, so the CHECK fails and the result is a 500. The null case is qualified ("with no vendor agreement set"); the '' case is not.
- Vendor-falsy branch (:653-657): CORRECT, entry 4 matches the code.
- B9 generalised: CORRECT. Every denial that requireProjectAccess answers (400 :61, 403 :111, 404 :129, 403 :144, 500 :172) skips `next`. The promise at authorizeProjectResource.js:67-71 stays pending. The `.catch` at :72-75 does not run.
- 404 "Project not found" (:124-133): citation CORRECT, but IMPRECISE as a reachable path. The membership query (:84-102) selects from `projects`, so a nonexistent project returns 403 at :111 first, because `resolveToParentProject` returns the original id when the row is missing (:302-303). The 404 is reachable only if the project row is deleted between the two queries. The note lists it as an ordinary denial, and the entry-4 text implies it is a normal outcome.
- DEAD4: CORRECT. A grep for `enterpriseCache` in js/mjs/cjs/ts/jsx finds nothing. inventory.md:1089 lists it as unreferenced. enterpriseCacheMiddleware.js:43 has `'/api/mappings': { ttl: 60, scope: 'user' }`. Entry 12's caching line is accurate. Open question 7 is removed and nothing else refers to it.

## Other spot checks (all CORRECT)
- Mount and auth: entry 3 (POST getProjectId throw :192-198 gives 500 `Project access check failed`, :172), S8 (extractProjectId order :181-195), B10 (:244-248), B1 and entry 11 (400 at :55-61 before the admin bypass at :66).
- Entry 4: mutual-exclusivity 400 only when both are truthy (:490-496), vendor approval SQL (:524-528), checks only for truthy values (:552, :584), and the vendor-truthy branch sets source to NULL (:648-652).
- Constraint text at dump :6340 matches the notes. The B11 `schema_drift_handling` CHECK at :6339 was confirmed earlier.
- Cascade and DDL-file citations from round 2 were not re-opened this round.

## MISSED (minor)
1. Entry 4 and B6 do not state the vendor-set interaction for `source_connection_id: ''` (500 instead of 200). For the null case, a body of only `source_connection_id: null` on a vendor-based mapping is a 200 no-op, because vendor stays set and source becomes NULL. The notes cover only the "no vendor" case.

## UNSUPPORTED
None.

## Requested fixes
- Qualify the B6 '' case: the 200 outcome applies only when the mapping has no vendor agreement. With a vendor set, the result is the generic 500.
- Mark the 404 "Project not found" path as effectively unreachable (a race only), or note that a nonexistent project yields 403 first.
