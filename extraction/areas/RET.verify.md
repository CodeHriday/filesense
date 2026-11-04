# RET verification (round 3, final, after fix round 2)

Verdict: PASS
Counts: checked 24 (round-2 items plus prod-dump spot checks; the other ~60 claims were verified in the previous round and are unchanged), WRONG 0, UNSUPPORTED 0, MISSING 0.

## Round-2 changes
1. Null storage_config TypeError: CORRECT. archivalStorageService.js:30 destructures `storageConfig` before the `try` at :32. The worker calls it inside the inner try (:231-235), the `archiveError` catch (:275) writes a FAILURE audit (:301), and the INSERT records 'failed'. The old "throws after upload" clause is gone.
2. Admin bypass cite: CORRECT. authorize.js:31 calls `userHasAdminAccess`. permissionHelpers.js:80-92 has the admin role check plus `users:write`, `roles:write` and `project_management:write`. SEC-5 uses the same cite.
3. BUG-2: CORRECT. Prod `archived_files` :4331 `archive_storage_type NOT NULL` and :4333 `archive_path NOT NULL`. The worker INSERT (:311-343) supplies neither `archive_storage_type` nor a non-null path on failure (`let archivePath = null` at :227, set only at :238). The cited migration lines (:59, :61) were not re-opened this round.
4. BUG-4 and history route: CORRECT. retentionRoutes.js:777 `af.filename as archived_filename`, :784 `fr.restored_by`, :793 `fr.restoration_status`. Prod `archived_files` has no `filename` (:4324-4351).
5. Open question 5 closed and consistent with BUG-21 and DUP-3.

## Prod dump spot-check (FileSence_prod_schema_Jan_05_1767956647766.sql)
All line numbers are correct.
- `archived_files` :4324-4351
- `file_restorations` :4883-4900 (`file_id` NOT NULL :4886)
- `retention_policies` :5937
- `retention_policy_runs` :5973-5989 (`total_bytes_archived` :5983, no `bytes_archived`)
- FK `archived_files.policy_id` :7366 and FK `retention_policy_runs.policy_id` :7718, neither with ON DELETE

## Coverage and rewrite loss
All 10 routes, the worker and the 2 FE routes have subsections. The rewrite lost nothing against the round-2 list.

## Remaining observations (not counted)
- The prod run INSERT at worker :174-184 also fails on `bytes_archived`. BUG-3 covers this.
- A failed `archived_files` INSERT is swallowed by the per-file catch (:350). The transaction is aborted, so the run UPDATE or COMMIT fails and the outer catch rolls back. The notes describe this correctly.
