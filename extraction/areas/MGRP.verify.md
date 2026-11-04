# MGRP verification (round 3, final, after fix round 2)

Verdict: PASS

Counts: about 40 claims checked in this round (plus the round-2 items rechecked), 0 WRONG, 0 UNSUPPORTED, 0 missed. All 13 HTTP routes (mappingGroups.js:19, 74, 129, 175, 253, 292, 326, 376, 421, 483, 541, 562, 587) and both FE routes (App.jsx:425-427) have subsections.

## Round-2 changes: all confirmed
- "DELETE 500 on prod" BUG removed. The DELETE entry and Open question 3 now say it is untested against a live DB. Correct.
- Jan_05 dump FK actions. In both FileSence_prod_schema_Jan_05_1767780691950.sql and ..._1767956647766.sql, :7586 (executions.group_id), :7591 (members.group_id) and :7592 (members.mapping_id) are ON DELETE CASCADE. The status CHECK `mapping_group_executions_status_check` is at :5380 in both (running/completed/failed/cancelled). Correct.
- transformation_jobs.mapping_group_execution_id FK to mapping_group_executions(id) has no ON DELETE: DDL:3447 and Jan_05 :7771. Correct. The caveat is worded as a possibility, not a bug.
- DDL file has no ON DELETE or CHECK clauses (FKs at :3325/:3327 plain). Statement correct.
- Always-completed BUG. jobExecutionEngine.js:1471, :1659 and :1748 are `return { jobId, status:'failed', ... }`. Engine :104-124 ignores `jobResult.status`. :3899-3903 is updateJob 'failed', followed by `throw abortError` at :3919. The per-file catch at :2170 swallows it, and :2199-2207 sets 'completed' or 'completed_with_warnings'. The return at :2322-2329 carries finalStatus. All match the notes. `finalStatus` at engine :160 and the alert 'completed' at :186 are correct.
- Negative max_concurrency wording matches engine :83-84 (the first slice(0,-k) runs, then `i` decreases and never reaches the length). Correct.
- 403 "This project is not active": requireProjectAccess.js:138-148 (non-admin, `!targetProject.is_active`). Correct. The 404 "Project not found" at :124-133 is still described as unreachable, which is consistent with the membership check coming first.
- FE callers: src/components/AssetPalette.jsx:21 and src/pages/archived/WorkflowBuilder.jsx:772 both call GET /api/mapping-groups. Correct.

## Other spot checks (all CORRECT)
- Engine: signature :22, id format :24, concurrency :41, member query :44-51, zero-member throw :55-57 before the insert :68-73, batching :83-153, member catch :126-149, double count :110-117 vs :127, failure UPDATE :137, failed path :228-236, failed alert :241.
- DELETE route :253-289 (`mapping_group:write`, RETURNING *, 404 :267, 500 :279-288).
- Migration workflowOrchestration.js: :37 and :94 ON DELETE CASCADE, :38 mapping_id INTEGER (stale), :96 status CHECK.
- Route order: `/init-data` (:587) after `/:id` (:74). `/:id/executions*` routes have no middleware (:541, :562).
- Earlier-round items (cross-project bypass, POST missing project_id 500, created_by UUID, triggered_by INTEGER, caller list, parent_project_id drift) are unchanged and still present.

## Full-file rewrite: nothing lost
All round-1 and round-2 findings remain present. No new entry points, branches or side effects found that the notes ignore.

## Minor remarks (not defects)
- The negative max_concurrency loop awaits `Promise.all([])` on empty slices, so it spins on microtasks. This could starve the event loop. The notes say only "never terminates", which is accurate.
