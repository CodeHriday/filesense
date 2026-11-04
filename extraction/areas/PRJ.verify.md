# PRJ verification (final, after fix round 2)

Verdict: PASS

Counts: checked 27, WRONG 0, UNSUPPORTED 0, missing entry points 0.

## Round-2 focus items

- UNCLEAR 5, authenticateToken runs three times: CORRECT.
  - server.js:5373 mounts `authenticateToken` before `projectRoutes`.
  - server.js:5384 mounts `authenticateToken` again before `subProjectRoutes`.
  - subProjects.js:3 imports it and each of the 10 routes uses it (:12, :78, :170, :287, :360, :429, :513, :583, :652, :736).
  - projectRoutes.js has no authenticate call and no `router.use`.
  - The projectRoutes router has no `/:projectId/sub-projects` route, so the request falls through to the second mount.
  - server.js:5382 overrides `.use`, and subProjects.js never calls `router.use`. The note is accurate.
- POST step 5 (projectRoutes.js:596): CORRECT.
  - The code is `subProject.is_active !== undefined ? subProject.is_active : true`.
  - So an explicit `null` is inserted as NULL.
  - The prod DDL at :5666 is `is_active bool DEFAULT true NULL`, which is nullable, so the insert succeeds.
  - Name guard :587, parent_id = newProject.id, owner = caller, project_type = `project_type || 'internal'` (:597), no duplicate check. All match.
- BUG 17 last sentence: CORRECT.
  - `parseInt(projectId)` is used at subProjects.js:22, :97, :181, :297, :370, :448, :523, :593, :671, :746 (and :62).
  - NaN never matches `p.id`, so a non-admin gets 403 before any SQL.
  - Admins skip the gate and reach SQL at :57, :110, :194.
  - "1abc" gives parseInt 1, passes the gate, then fails in SQL.
- Group CTE (requireProjectAccess.js:380-395): CORRECT.
  - `user_group_parent_projects` has no `parent_id` filter.
  - `user_sub_projects` takes `WHERE sp.parent_id IN (SELECT id FROM user_parent_projects)` (:413).
  - So a `project_access_groups` row on a sub-project also grants that sub-project's children.
  - The direct CTE (:365-379) behaves the same way.
  - Both CTEs filter `is_active = TRUE` (:378, :394), and the sub-project step does too (:414).
- Write-based save lost nothing: CONFIRMED.
  - All 22 HTTP entry points and the 2 FE pages have subsections: 12 projectRoutes routes (inventory.md:506-517), 10 subProjects routes (:518-527), /projects and /project-management (:821-822).
  - Summary, admin predicates, Data touched, Flags (SECURITY, BUG, DUPLICATE, DEAD, UNCLEAR), Domain terms and Open questions are all present, and the line numbering is intact.

## Sampled pass (all CORRECT)

- GET / (projectRoutes.js:157-258):
  - top-level filter :192 and :197
  - archived param :200-204
  - hardcoded counts :241-242
  - 500 message :256
  - direct-only member_count :168
- GET /init-data:
  - ID split :281-290
  - empty response :293-299
  - archived rule :332-336
  - users LIMIT 1000 :361
  - groups :362
  - boolean normalisation :385-392
  - owner_name = full_name :344
  - 500 message :401
- POST:
  - validation :464-470
  - BEGIN :472
  - duplicate check and 409 :474-538
  - release at :484 and in `finally` :803
  - 12-column insert :541-545
  - inlined member and group values :559, :574
  - COMMIT :603
  - spike check :651-662
  - `logSecurityEvent` fields :672-694
  - 23505 branch :720
  - catch ROLLBACK :709
  - 500 :801
- PUT (:944-1060):
  - deactivate rule :950-963
  - field list :970-1029
  - 400 'No fields to update' :1032
  - 404 :1046
  - 500 :1058
- DELETE (:1063-1117): five-table count :1068-1075, message :1093, 404 :1104.
- subProjects.js:
  - GET shape :33-63
  - POST validation, gate, 404, per-parent duplicate 400, insert with TRUE and no `project_type` (:87-140)
  - PUT parent lookup :192-202
  - PUT duplicate check :205
  - 500 responses carry `message: error.message` (:67-70)

## Missed or minor points (none change the verdict)

- subProjects.js POST validates the name (:87) before the access gate (:95). A non-admin with a blank name gets 400, not 403. The note's order of "validation, then gate" is already correct.
- subProjects.js POST: a non-admin asking for a non-existent parent gets 403 from the gate, never 404, because `getUserProjects` cannot contain it. The 404 is reachable only by admins. The note does not say this.
- A non-string `name` on sub-project POST throws at `name.trim()` (:87). The catch returns 500. This is not flagged, but it is the same class as BUG 13 and BUG 15.
