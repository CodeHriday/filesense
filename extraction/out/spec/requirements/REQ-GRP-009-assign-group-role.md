---
id: REQ-GRP-009
title: Assign a group role, globally or limited to one project
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-GRP-011, REQ-GRP-012]
contracts: []
priority: must
---
# REQ-GRP-009: Assign a group role, globally or limited to one project

## Context
Administrators give an access group a role that every member inherits, either for all projects or for one top-level project only. Today any authenticated user can assign any role, including Admin, to a group they belong to and so escalate their own rights (finding C3). The duplicate check also matches no uniqueness rule in the store, so every assignment fails with 500. The rebuild restricts assignment to administrators, fixes the duplicate rule so assignment works, records who assigned the role, and applies the role from the member's next request with its project scope (D3).

## Requirements
1. When an administrator assigns a role to an access group without a project, the system shall record a global group role.
2. When an administrator assigns a role to an access group with a project, the system shall record a group role limited to that project.
3. The system shall record the administrator who assigned the group role and the time of assignment.
4. When a group role is recorded, the system shall respond 201 with the group role, including its scope.
5. The system shall treat a group role as a duplicate only when the same group, the same role and the same scope are already recorded, with global counting as one scope.
6. When a group role is recorded, the system shall apply it to every current member of the group from their next request, within its scope (REQ-GRP-011, REQ-GRP-012).
7. If the role id is missing, then the system shall reject the request with 400.
8. If the group id, role id or project id is not a positive integer, then the system shall reject the request with 400.
9. If no access group has the group id, then the system shall respond 404 with the message "Group not found".
10. If no role has the role id, then the system shall respond 404 with the message "Role not found".
11. If the project id does not identify an existing top-level project, then the system shall reject the request with 400.
12. If the same group role is already recorded, then the system shall respond 409 with the message "Role already assigned to group".
13. If the caller is not authenticated, then the system shall reject the request with 401.
14. If the caller is not an Administrator, then the system shall reject the request with 403 and record nothing.

## Acceptance criteria
- **AC-1**: Given group "Ops" without role "Viewer", When an administrator assigns "Viewer" with no project, Then the response is 201 and "Ops" has a global group role "Viewer". <!-- source: areas/GRP.md#post-apigroupsgroupidroles-grouproutesjs469 -->
- **AC-2**: Given group "Ops", When an administrator assigns "Analyst" scoped to project "Claims", Then the response is 201 and the group role shows scope "Claims". <!-- source: areas/GRP.md#post-apigroupsgroupidroles-grouproutesjs469 -->
- **AC-3**: Given "Ops" already has global "Viewer", When an administrator assigns global "Viewer" again, Then the response is 409 with "Role already assigned to group". <!-- source: areas/GRP.md#post-apigroupsgroupidroles-grouproutesjs469 -->
- **AC-4**: Given "Ops" already has "Analyst" scoped to "Claims", When an administrator assigns "Analyst" scoped to "Billing", Then the response is 201 and "Ops" has both scoped assignments. <!-- source: areas/GRP.md#bug -->
- **AC-5**: Given "Ops" already has global "Analyst", When an administrator assigns "Analyst" scoped to "Claims", Then the response is 201 and both the global and the scoped assignment exist. <!-- source: areas/GRP.md#bug -->
- **AC-6**: Given group "Ops", When an administrator assigns a role without a role id, Then the response is 400. <!-- source: areas/GRP.md#post-apigroupsgroupidroles-grouproutesjs469 -->
- **AC-7**: Given no role 999, When an administrator assigns role 999 to "Ops", Then the response is 404 "Role not found". <!-- source: cross-cutting.md#5-rules-that-apply-everywhere-for-the-rebuild -->
- **AC-8**: Given "Claims-EU" is a sub-project, When an administrator assigns a role scoped to "Claims-EU", Then the response is 400. <!-- source: areas/GRP.md#get-apigroupsinit-data-grouproutesjs110 -->
- **AC-9**: Given user 5 is a member of "Ops", When an administrator assigns global "Viewer" to "Ops" and user 5 then makes a request, Then that request is evaluated with "Viewer" in both roles and permissions. <!-- source: areas/GRP.md#post-apigroupsgroupidroles-grouproutesjs469 -->
- **AC-10**: Given authenticated user 8 without the Admin role is a member of "Ops", When user 8 assigns role "Admin" to "Ops", Then the response is 403 and user 8 does not gain "Admin". <!-- source: areas/GRP.md#security -->
- **AC-11**: Given an administrator assigns "Viewer" to "Ops", Then the stored group role names that administrator as the one who assigned it. <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->

## Out of scope
- How a project-scoped group role is applied when a request is authorised (REQ-GRP-011).
- Assigning roles directly to users. User administration owns that.

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: records one group role. Refreshing the members' rights is covered by REQ-GRP-012.

## Edge cases and errors
- Two concurrent assignments of the same group, role and scope: one gets 201, the other 409.
- An archived top-level project as scope: see Open questions.
- Database failure gives 500 with a safe message.

## Open questions
- Can a group role be scoped to an archived or inactive top-level project?
- Should assigning the Admin role to a group be allowed, and if so only globally? See REQ-GRP-011 Open questions on project-scoped Admin.
