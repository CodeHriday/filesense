# PRJ - Dropped features and behaviours

| Feature / behaviour | Triage | Reason |
|---|---|---|
| Sub-project members (list, add with role viewer/editor/admin/member, remove) and sub-project access groups (list, add, remove), with the sub-project member management UI | F17 drop (decided on recommendation, user accepted) | Stored but grants nothing: no access check reads these assignments and the roles are never evaluated. Sub-project access is inherited from the parent project (REQ-PRJ-001). |
| Creating sub-projects inline in the project create request (list of sub-projects, and a parent on the project create) | F16 change (one create path) | Duplicate create path with different rules (no duplicate check, no parent access check). Sub-projects are created only through REQ-PRJ-019. |
| Editing or reparenting a sub-project through the project update | F16 change (no reparenting through the project update) | Bypassed the parent access gate and allowed parent cycles. Sub-projects are edited only through REQ-PRJ-020; reparenting is not offered. |
| Combined project-management "init data" loader (projects plus 1000 users plus every access group in one call) | F15/F16 change (one list path) | Second list implementation with different archived semantics and missing counts; exposed the user directory to any member. Replaced by REQ-PRJ-003 (list) and REQ-PRJ-017 (candidates for managers only). |
| Ad-hoc upload connection on a project | F15 change; D8 | Written by the old code but present in no schema (Jan_05 baseline, D1); D8 keeps one drop-location model (REQ-PRJ-023, REQ-PRJ-024). |
| Client-settable "default project" flag on create and update | F15 change | Only the seeded Default Project carries the flag; letting clients set it would bypass delete protection (REQ-PRJ-013). |
| Direct membership or access-group rows on a sub-project that grant access to that sub-project's own children | F16 change; PRJ UNCLEAR-1 | Side effect of an unfiltered query; membership is held only on top-level projects (REQ-PRJ-001, REQ-PRJ-025). |
| Two admin predicates (all-project access and admin access) used by the project routes | D3 | Replaced by the single Administrator definition and the `all_projects:read` read-only visibility rule (REQ-PRJ-001, REQ-PRJ-002). |
| Server helper that generates idempotency keys | PRJ DEAD-2 | Never called; clients supply the key (REQ-PRJ-007). |
