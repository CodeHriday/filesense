---
id: REQ-PRJ-001
title: Resolve which projects and sub-projects a user can access
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-PRJ-025]
contracts: []
priority: must
---
# REQ-PRJ-001: Resolve which projects and sub-projects a user can access

## Context
The project is the tenancy boundary for every resource, so every area needs one answer to "which projects can this user reach". The old system had six different implementations that disagreed on groups, inactive projects and sub-projects, and a direct membership on a sub-project silently granted access to that sub-project's own children. This requirement defines the single rule. Sub-project member and group assignments are dropped (F17); sub-project access is inherited from the parent (glossary: Sub-project). Administrator and `all_projects:read` follow decision D3.

## Requirements
1. The system shall treat a user as a project member of a top-level project when the user has a direct membership on that project.
2. The system shall treat a user as a project member of a top-level project when the user belongs to an access group that is assigned to that project.
3. The system shall read access-group membership from the single access-group membership store (decision D4).
4. The system shall grant a user access to a sub-project if and only if the user has access to its parent project.
5. Where the user is an Administrator, the system shall grant access to every project and sub-project.
6. Where the user holds `all_projects:read`, the system shall grant read-only visibility of every project and sub-project and shall not treat that permission as granting any write or execute action.
7. The system shall include inactive and archived projects in the access result; list visibility of archived projects is governed by REQ-PRJ-003 and blocking of new work by REQ-PRJ-011.
8. When a membership or access-group change is saved, the system shall apply it to the user's next request.
9. If a user without access requests a project or sub-project that exists, then the system shall respond 403 with error code `PROJECT_ACCESS_DENIED` and no project data.
10. The system shall expose this rule as one shared capability that every other area uses to check project access.

## Acceptance criteria
- **AC-1**: Given user U has a direct membership on project 7, When U lists projects, Then project 7 is included. <!-- source: areas/PRJ.md#summary -->
- **AC-2**: Given U is in access group G and G is assigned to project 8, When U opens project 8, Then the request succeeds. <!-- source: areas/PRJ.md#summary -->
- **AC-3**: Given U is removed from group G, When U next opens project 8, Then the response is 403 with code `PROJECT_ACCESS_DENIED`. <!-- source: areas/PRJ.md#summary -->
- **AC-4**: Given U has access to project 7 and project 7 has sub-projects 71 and 72, When U lists the sub-projects of 7, Then both 71 and 72 are returned. <!-- source: areas/PRJ.md#summary -->
- **AC-5**: Given U has no access to project 9, When U requests sub-project 91 of project 9, Then the response is 403. <!-- source: areas/PRJ.md#common-pattern-for-all-sub-project-routes-subprojectsjs -->
- **AC-6**: Given U holds only `all_projects:read` and is not a member of project 9, When U lists projects, Then project 9 is included; When U tries to rename project 9, Then the response is 403. <!-- source: cross-cutting.md#7-resolved-decisions -->
- **AC-7**: Given project 7 is inactive and U is a direct member, When U opens project 7, Then the request succeeds and the project is shown as inactive. <!-- source: glossary.md#tenancy -->
- **AC-8**: Given U holds `users:write`, `roles:write` and `project_management:write` but no Admin role and no membership on project 9, When U lists projects, Then project 9 is not included. <!-- source: cross-cutting.md#7-resolved-decisions -->

## Out of scope
- Resolving a resource's project from the resource itself in other areas (global rule; each area applies it).
- Group roles and their project scope (GRP area); this shard only decides project reachability.
- Who may change projects (REQ-PRJ-002).

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: one evaluation per request; the result for one user is the set of projects they reach.
- **Growth**: grows with projects, memberships and group assignments.
- **Largest tenant**: unknown (see Open questions).
- **Time window**: per request.
- **Memory ceiling**: unknown.
- **Scale tests**: a user in many groups that cover many projects; numbers to be set once volumes are known.

## Edge cases and errors
- User in two groups assigned to the same project, or both direct and group member: counted once.
- Access group with no members, or a project with no members: no one but Administrators and `all_projects:read` holders sees it.
- Deleted user or deleted group: no longer grants access.
- Non-numeric project id: 400 with code `INVALID_ID` before any lookup.
- Nonexistent project: 404 `Project not found` for callers allowed to see all projects; see Open questions for non-members.

## Open questions
- For a project that does not exist, should non-members get 404 or 403? The old sub-project routes returned 403 to non-admins and 404 only to admins; the old project routes returned 404 to everyone.
- How many projects, sub-projects, members and group assignments does the largest deployment have?
- Are any existing direct memberships or group assignments held on sub-projects in production, and should they be moved to the parent or discarded at migration? (See REQ-PRJ-025.)
