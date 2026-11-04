# ADM verification (round 2, after fix round 1)

Verdict: PASS

Counts: 42 checked, 0 WRONG, 1 UNSUPPORTED, 3 minor missed behaviours. Coverage: all 11 HTTP routes (adminCleanup 2, adminSettings 4, cache 3, debug 2) and both FE items (/system-cleanup, SystemSettings) have subsections. Nothing is missing. The full-file rewrite lost nothing from the round-1 report: every round-1 finding is present in the notes.

## Round-1 changes

| Change | Result |
|---|---|
| BUG-1 and Audit bullet: audit failure silent (AuditService.js:541-564) | CORRECT. `logSystemCleanup` try/catch only does `console.error` (:561-563). The route continues to `res.json`. ROLLBACK after COMMIT is reachable only if the require or constructor throws. |
| Counts route runs 49 queries | CORRECT (4+5+8+5+5+2+2+3+7+2+4+1+1 = 49, adminCleanupRoutes.js:16-183). |
| cleanup-profiles paragraph (profileRetentionService.js:44) and BUG-7 | CORRECT. Default `= null` at :14; the setting is used at :17-19; JSON `null` also uses it; `row_num > $1` at :44; 0 or a negative value selects every ETL target; a string or float throws and is caught at :111-116, giving 500. |
| userHasAdminAccess statement (server.js:380-403) | CORRECT. Admin or admin role, string or object form with `name` or `role_name` (:384-391), or permission `users:write` or `roles:write` (:397-402). |
| SECURITY-7: /system-cleanup is a bare ProtectedRoute (App.jsx:449) | CORRECT. |
| BUG-9: dbt RETURNING id | CORRECT. adminCleanupRoutes.js:482-483. In the dump, dbt_executions has `execution_id` as PK (:3006) and dbt_models has `model_id` (:3047). Neither has an `id` column, so the statement errors, the transaction rolls back and the response is 500. |
| BUG-3: access_group_members overcount (:121 vs :446) | CORRECT. Counts have no filter on :121 and :122, while the purge has `group_id != 1` at :445 and :446. The notes cite :122 vs :445 for roles and :121 for members. |
| BUG-10 and entry 6 (per-file commit, partial child deletes, success:true with a smaller count) | CORRECT (profileRetentionService.js:66-109). Only file_columns, file_audit_details and files are deleted. |
| Entry 2: audit_log write, hard-coded 'Admin', audit_log survives the purge | CORRECT. `userRole: 'Admin'` at AuditService.js:546, the INSERT into audit_log at :90-98, and no context is passed. audit_log is in no purge list. |
| Entries 7, 8, 9 and BUG-5: cache scope, stats errors returning 200 | CORRECT. `getStats` returns `{type, error}` at cacheService.js:241-243. `flush` swallows errors at :262, and `delPattern` swallows them at :181-183. The routes' own catch blocks are therefore unreachable in practice. |

## Other claims checked, all CORRECT

- Mounts at server.js:13871 and :13876. requireAdmin at :5417-5425, with the log text "Unauthorized audit access attempt" at :5419.
- Cache mount at :5179, with `authenticateToken` as the only middleware.
- Confirmation code check at :204 (checked before the categories), 400 "No categories selected" at :212, and the valid list at :219.
- BEGIN :233, COMMIT :524, ROLLBACK :538.
- Dependency deletes :241-266 and the projects tree :272-325, including the `users.vendor_id` NULL update at :319 and `access_group_roles` by project_id at :323.
- Main deletions per category, including projects deleting all project_members (:423), groups `!= 1` (:445-447) and vendors `UPDATE users` (:466).
- Settings routes: key check :39, range :50, raw `value` stored at :59 (BUG-6), and `updateSetting` SQL at appSettingsService.js:49 with "not found" giving 500.
- profile-stats route :76-96. cleanup-profiles has no route validation (:103-106).
- Retention fallback of 10 at appSettingsService.js:73-76.
- Debug routes: recover-orphans at server.js:11754-11795 with its query window and `error.stack`; hash-password at :11798, with the "REMOVE IN PRODUCTION" comment at :11797.
- cacheRoutes.js is JWT only on :21, :44 and :68. `delPattern` uses KEYS then DEL (:162-165), and the memory path uses globToRegex (:170-172).
- FE: SystemCleanup.jsx :90, :147, :156 and :417; SystemSettings.jsx :12, :69, :85, :107-120.
- DEAD: grep of src/ for `api/cache` returns 0 matches.

## UNSUPPORTED

1. Entries 8 and 9 and the Scope bullet: "includes the config/redis `GET:` keys if they share that DB". The `GET:` keys exist (backend/src/middleware/cache.js:120, 130, 131). No cited line shows that they use the same Redis DB as `cacheService`. It is hedged with "if", so the effect is minor.

## Missed (minor)

1. Redis flush blast radius is wider than the cache. With `REDIS_URL` set, `cacheService` calls `flushDb()` on that URL's DB. backend/queue/RedisQueue.js:19-23, backend/services/AlertAggregator.js:44 and backend/config/redis.js use the same env var (`REDIS_URL`), with ioredis. If they share a DB, any logged-in user's `DELETE /api/cache/flush` could also wipe queue and alert state. The notes only mention the `GET:` keys.
2. BUG-2 detail: `access_group_roles.group_id` is nullable (dump :3998). `DELETE ... WHERE group_id != 1` never deletes rows with a NULL group_id, because NULL != 1 is NULL. So the groups purge leaves those rows.
3. The `activity` category deletes `user_sessions`. Whether that logs everyone out, including the admin, depends on the auth middleware and was not checked in the notes.

## Answer to OQ 1

Question: for every `DELETE ... RETURNING id` in adminCleanupRoutes.js, does the target table have an `id` column in the prod dump?

Yes for all of them except two. Checked against FileSence_prod_schema_Jan_05_1767956647766.sql:
- Tables with `id`: file_columns, file_schemas, files, anomalies, profiling_metrics, transformation_logs, transformation_jobs, schedules, n_step_workflow_runs, n_step_workflow_steps, workflow_steps, n_step_workflows, mapping_group_executions, mapping_group_members, mapping_groups, file_pattern_metrics, alert_history, file_audit_details, projects, access_group_roles (:4003), access_groups, vendor_agreement_documents, vendor_agreement_changes, vendor_agreement_approvals, vendor_file_profiling_results, vendor_agreements, vendor_users, vendors, notifications, user_sessions, user_badges, user_dashboard_settings, quality_rule_violations and transformation_lineage.
- Tables without `id`: **dbt_executions** (PK `execution_id`) and **dbt_models** (PK `model_id`). This is BUG-9.
- The two other non-id keys are already handled correctly in the code. `file_preview_data` uses `RETURNING preview_id` (:332) and `transformation_mappings` uses `RETURNING mapping_id` (:351).

Every other table named in the counts and purge SQL also exists in the dump, so the earlier "missing table" worry in the open question 1 text is mostly settled. Not checked: column-level references such as `user_badges.file_id`.
