---
id: REQ-GRP-003
title: View one access group with its members and group roles
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-GRP-003: View one access group with its members and group roles

## Context
When an administrator edits an access group, they need to see who is in it and which group roles it grants, including the project each role is limited to. Today the detail returns no project name for a group role's scope, so the screen shows every role as global even when it is limited to a project. It also returns no membership source, so the source badge is always empty. A non-numeric id also produces a server error. The rebuild returns the scope project, restricts the detail to administrators and validates the id.

## Requirements
1. When an administrator requests an access group by id, the system shall return the group's id, name, description, group type, external id, IdP sync flag, metadata, and creation and update times.
2. The system shall include the group's members, each with user id, username, full name and e-mail address, ordered by username.
3. The system shall include the group's group roles, each with the role id, role name, role description and scope.
4. The system shall express a group role's scope as either global or one project, giving that project's id and name.
5. If the id is not a positive integer, then the system shall reject the request with 400.
6. If no access group has that id, then the system shall respond 404 with the message "Group not found".
7. If the caller is not authenticated, then the system shall reject the request with 401.
8. If the caller is not an Administrator, then the system shall reject the request with 403.

## Acceptance criteria
- **AC-1**: Given group "Ops" with members "zoe" and "adam", When an administrator views it, Then the members are listed as adam, then zoe. <!-- source: areas/GRP.md#get-apigroupsgroupid-grouproutesjs170 -->
- **AC-2**: Given group "Ops" with role "Analyst" limited to project "Claims", When an administrator views it, Then the group role shows role "Analyst" with scope project "Claims" and that project's id. <!-- source: areas/GRP.md#bug -->
- **AC-3**: Given group "Ops" with role "Viewer" and no project scope, When an administrator views it, Then the group role shows scope global. <!-- source: areas/GRP.md#domain-terms -->
- **AC-4**: Given no group with id 9999, When an administrator views group 9999, Then the response is 404 with the message "Group not found". <!-- source: areas/GRP.md#get-apigroupsgroupid-grouproutesjs170 -->
- **AC-5**: Given an administrator, When they view group "user" or group "-3", Then the response is 400, not 500. <!-- source: areas/GRP.md#bug -->
- **AC-6**: Given an authenticated user without the Admin role, When they view any group, Then the response is 403. <!-- source: areas/GRP.md#security -->
- **AC-7**: Given a group with no members and no group roles, When an administrator views it, Then members and group roles are both empty lists. <!-- source: areas/GRP.md#get-apigroupsgroupid-grouproutesjs170 -->

## Out of scope
- A membership source (for example manual or IdP-synced). The single membership store has no source, and nothing populates one.
- Listing the projects that the group can access. The project area owns project access for groups.
- Listing the groups the current user belongs to. That legacy endpoint is dropped (see dropped/GRP.md).

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: one group, its members and its group roles.
- **Growth**: members grow with the user directory.
- **Largest tenant**: unknown; the largest group's member count is not known (see Open questions).
- **Time window**: interactive request.
- **Memory ceiling**: proportional to one group's member count.
- **Scale tests**: view a group with the largest known member count.

## Edge cases and errors
- A group role whose scope project was deleted or archived still needs a defined display (see Open questions).
- Database failure gives 500 with a safe message.

## Open questions
- How many members does the largest access group have in production, and should members be paginated in the detail view?
- What should happen to a project-scoped group role when its project is archived or deleted: keep it, show it as orphaned, or remove it?
- Is a membership source (manual or IdP-synced) needed? Today the screen shows a badge that is never filled in.
