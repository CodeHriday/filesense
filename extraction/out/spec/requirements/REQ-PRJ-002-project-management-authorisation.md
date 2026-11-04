---
id: REQ-PRJ-002
title: Require project management rights for project changes
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-PRJ-001]
contracts: []
priority: must
---
# REQ-PRJ-002: Require project management rights for project changes

## Context
In the old system any logged-in user could rename, deactivate, archive, reparent or delete any project and add themselves as a member, which defeated the tenancy boundary (C3, PRJ SECURITY 1 and 3). Triage F15 decides that project edits and membership changes need project-admin or admin rights. Decision D3 makes Administrator the only admin, says `project_management:write` grants only its own actions, and scopes group roles to their project and its sub-projects.

## Requirements
1. The system shall allow a project management action only to an Administrator or to a user whose effective permissions in that project include `project_management:write`.
2. The system shall treat these as project management actions: changing project details, activating or deactivating, archiving or unarchiving, deleting, adding or removing members, adding or removing access groups, setting or clearing the drop location, and creating, changing or deleting sub-projects.
3. The system shall compute a user's effective permissions in a project from the user's direct roles plus group roles that are unscoped or scoped to that project; a group role scoped to a project also applies to its sub-projects.
4. When a user creates a top-level project, the system shall require the Administrator role or `project_management:write` from a role that is not scoped to a single project.
5. The system shall not treat `all_projects:read`, `users:write` or `roles:write` as granting any project management action.
6. If the caller lacks the right, then the system shall respond 403 with error code `PROJECT_MANAGEMENT_DENIED` and make no change.
7. The system shall check the right on the server for every management action, whatever the UI shows.

## Acceptance criteria
- **AC-1**: Given U is a direct member of project 7 with no `project_management:write`, When U renames project 7, Then the response is 403 `PROJECT_MANAGEMENT_DENIED` and the name is unchanged. <!-- source: areas/PRJ.md#security -->
- **AC-2**: Given U is not a member of project 7, When U adds themselves as a member of project 7, Then the response is 403 and no membership is created. <!-- source: areas/PRJ.md#security -->
- **AC-3**: Given U's access group has a group role with `project_management:write` scoped to project 7, When U renames project 7 and creates a sub-project under it, Then both succeed; When U renames project 8, Then the response is 403. <!-- source: cross-cutting.md#7-resolved-decisions -->
- **AC-4**: Given U holds `users:write` and `roles:write` only, When U deletes project 7, Then the response is 403. <!-- source: cross-cutting.md#7-resolved-decisions -->
- **AC-5**: Given U holds only `all_projects:read`, When U archives project 7, Then the response is 403. <!-- source: cross-cutting.md#7-resolved-decisions -->
- **AC-6**: Given U has the Admin role, When U deletes an empty project 7, Then the delete succeeds. <!-- source: cross-cutting.md#7-resolved-decisions -->
- **AC-7**: Given U has no `project_management:write` outside a project scope and is not an Administrator, When U creates a project, Then the response is 403. <!-- source: areas/PRJ.md#security -->

## Out of scope
- Defining roles, group roles and their scope (USR, GRP).
- Read access (REQ-PRJ-001).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: a per-request authorisation decision.

## Edge cases and errors
- Role revoked between two requests: the next request is refused (permission changes take effect immediately, triage F08).
- Group role scoped to a sub-project: see Open questions.
- Denial must not reveal project details in the body.

## Open questions
- Should the project owner (creator) automatically hold management rights on their project? The old code recorded an owner but checked nothing.
- Today any logged-in user may create a project. Confirm that creation now requires the Administrator role or unscoped `project_management:write`.
- Can a group role be scoped to a sub-project (rather than a top-level project), and if so does it grant management of only that sub-project?
