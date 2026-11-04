# GOV verification (round 3, final, after fix round 2)

Verdict: PASS

Counts: checked 24 (round-2 changes plus spot checks), WRONG 0, UNSUPPORTED 0, missed 0.
Coverage: all 29 HTTP entry points (inventory rows 112-114 and 119-144) and the FE route /tag-management have subsections. The service and `hasTagPermission` are covered. Nothing was lost in the rewrite: every item the round-2 report marked CORRECT is still present.

## Round-2 changes
- B7 and PUT policy/tag (L38, L50): CORRECT. `policy_name` NOT NULL (createDataGovernanceTables.js:57) and `tag_name` NOT NULL UNIQUE (createGovernanceTagsTables.js:14). The UPDATEs at server.js:9159-9165 and :9369-9375 pass the raw body value. The tag handler maps only 23505 to 409 (:9384), and the policy handler has no code mapping at all, so both give a generic 500.
- B12: CORRECT. `file_governance` occurs only in server.js (8 hits: 4 checks at :9003, :9234, :9271, :9772 plus 4 comments), nowhere in migrations, seeds, FE or the dump. There is no admin bypass in those checks.
- Open question 3, `policies:write`: CORRECT. seedProductionManual.sql:32 is in the Admin role array and :60 is in Data Steward. The checks are at server.js:9112, :9149, :9182.
- B13 line numbers: CORRECT. Tag PUT is :9364 and DELETE :9392, both with `invalidateCache('cache:*:*tags*')`. Policy PUT :9146 and DELETE :9179 use `cache:*:*policies*`. Column policy POST :9670 uses `policies` only. The batch URL `/columns/governance` matches none of these patterns. The statement that service writes invalidate no cache is consistent with governanceService.js (no cache calls found earlier).
- B6 seed list: CORRECT. seedGovernanceTags.js:20-72 matches every value listed (sensitivity, permission_required, view/edit flags). The insert is at :93-108. The skip-if-exists check is at :81-90. The wiring is at server.js:5924.
- Open question 2 closure and unique constraints: CORRECT. `unique_column_tag` is at createColumnGovernanceTables.js:26 and `unique_column_policy` at :48. `tag_name` is UNIQUE at createGovernanceTagsTables.js:14. `unique_file_column_tag` is at createDataGovernanceTables.js:47. FK CASCADE and SET NULL match the claims.
- Open question 4: CORRECT.

## Other spot checks
Column policy POST (server.js:9692 `isAdmin`, :9699 `hasTagPermission`, :9709 no-tags admin-only, :9718-9733 delete then insert, :9738 generic 500): CORRECT. The ownership, sensitivity and tag routes were verified in earlier rounds, and the lines are unchanged.

## Remaining caveats (not defects)
- Whether production role data differs from the repo seed is stated as open (open question 3), which is correct.
- `authenticateToken` internals are marked not traced.
- The unread dump line numbers (:7389 etc.) were verified in round 2 and not rechecked.
