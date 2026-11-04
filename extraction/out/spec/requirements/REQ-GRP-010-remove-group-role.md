---
id: REQ-GRP-010
title: Remove a group role for a given scope
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-GRP-012]
contracts: []
priority: must
---
# REQ-GRP-010: Remove a group role for a given scope

## Context
Administrators withdraw a role from an access group, either the global assignment or the assignment for one project. The same role can be assigned to a group globally and for several projects, so a removal must name the scope it targets. Today any authenticated user can remove any group role. The rebuild restricts removal to administrators, and members lose the role at once.

## Requirements
1. When an administrator removes a role from an access group and names a project, the system shall delete only the group role limited to that project.
2. When an administrator removes a role from an access group without naming a project, the system shall delete only the global group role.
3. When the group role is deleted, the system shall respond 200.
4. When a group role is deleted, the system shall stop applying it to every member of the group from their next request (REQ-GRP-012).
5. If the group id, role id or project id is not a positive integer, then the system shall reject the request with 400.
6. If no group role matches the group, role and scope, then the system shall respond 404 with the message "Role assignment not found".
7. If the caller is not authenticated, then the system shall reject the request with 401.
8. If the caller is not an Administrator, then the system shall reject the request with 403 and delete nothing.

## Acceptance criteria
- **AC-1**: Given "Ops" has "Analyst" globally and scoped to "Claims", When an administrator removes "Analyst" without a project, Then the global assignment is gone and the "Claims" assignment remains. <!-- source: areas/GRP.md#delete-apigroupsgroupidrolesroleid-grouproutesjs508 -->
- **AC-2**: Given "Ops" has "Analyst" globally and scoped to "Claims", When an administrator removes "Analyst" for project "Claims", Then the "Claims" assignment is gone and the global assignment remains. <!-- source: areas/GRP.md#delete-apigroupsgroupidrolesroleid-grouproutesjs508 -->
- **AC-3**: Given "Ops" has "Analyst" only scoped to "Claims", When an administrator removes "Analyst" without a project, Then the response is 404 with "Role assignment not found". <!-- source: areas/GRP.md#delete-apigroupsgroupidrolesroleid-grouproutesjs508 -->
- **AC-4**: Given user 5 has "Viewer" only through "Ops", When an administrator removes global "Viewer" from "Ops", Then user 5's next request is evaluated without "Viewer". <!-- source: areas/GRP.md#delete-apigroupsgroupidrolesroleid-grouproutesjs508 -->
- **AC-5**: Given an authenticated user without the Admin role, When they remove "Viewer" from "Ops", Then the response is 403 and the group role remains. <!-- source: areas/GRP.md#security -->
- **AC-6**: Given an administrator, When they remove a group role with project id "x", Then the response is 400. <!-- source: cross-cutting.md#5-rules-that-apply-everywhere-for-the-rebuild -->

## Out of scope
- Removing all scopes of a role in one request.

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: deletes one group role.

## Edge cases and errors
- Two concurrent removals of the same group role: one gets 200, the other 404.
- A non-existent group or role gives 404 "Role assignment not found".
- Database failure gives 500 with a safe message.

## Open questions
None.
