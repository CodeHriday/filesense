---
id: REQ-GRP-006
title: Delete an access group and withdraw everything it granted
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-GRP-012]
contracts: []
priority: must
---
# REQ-GRP-006: Delete an access group and withdraw everything it granted

## Context
Administrators delete access groups they no longer need. Deleting a group must withdraw every right it gave its members. Today any authenticated user can delete any group (the screen hides the button, but the server does not check). Former members also keep the group's permissions for up to 10 minutes because their cached permissions are not cleared. The rebuild restricts deletion to administrators and withdraws the group's rights at once.

## Requirements
1. When an administrator deletes an access group, the system shall remove the group, all of its memberships and all of its group roles in one all-or-nothing operation.
2. When an access group is deleted, the system shall end any project access that the group gave its members.
3. When an access group is deleted, the system shall stop applying the group's roles to every former member from their next request (REQ-GRP-012).
4. When the deletion succeeds, the system shall respond 200 with the message "Group deleted successfully".
5. If the id is not a positive integer, then the system shall reject the request with 400.
6. If no access group has that id, then the system shall respond 404 with the message "Group not found".
7. If the caller is not authenticated, then the system shall reject the request with 401.
8. If the caller is not an Administrator, then the system shall reject the request with 403 and delete nothing.

## Acceptance criteria
- **AC-1**: Given group "Ops" with 2 members and 1 group role, When an administrator deletes it, Then the response is 200 with "Group deleted successfully", and the group, both memberships and the group role no longer exist. <!-- source: areas/GRP.md#delete-apigroupsgroupid-grouproutesjs380 -->
- **AC-2**: Given user 5 holds role "Analyst" only through group "Ops", When an administrator deletes "Ops", Then user 5's next request is evaluated without "Analyst", in both roles and permissions. <!-- source: areas/GRP.md#bug -->
- **AC-3**: Given group "Ops" gives access to project "Claims", and user 5 reaches "Claims" only through "Ops", When an administrator deletes "Ops", Then user 5 can no longer access "Claims". <!-- source: areas/GRP.md#delete-apigroupsgroupid-grouproutesjs380 -->
- **AC-4**: Given no group with id 9999, When an administrator deletes group 9999, Then the response is 404 with "Group not found". <!-- source: areas/GRP.md#delete-apigroupsgroupid-grouproutesjs380 -->
- **AC-5**: Given an authenticated user without the Admin role, When they delete group "Ops", Then the response is 403 and "Ops" still exists with its members and roles. <!-- source: areas/GRP.md#security -->
- **AC-6**: Given an administrator, When they delete group "abc", Then the response is 400. <!-- source: cross-cutting.md#5-rules-that-apply-everywhere-for-the-rebuild -->

## Out of scope
- Soft delete or restoring a deleted group.
- Deleting the users who were members.

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: one group plus its memberships, group roles and project access links.
- **Growth**: grows with the member count of the group.
- **Largest tenant**: unknown (see REQ-GRP-003 Open questions).
- **Time window**: interactive request.
- **Memory ceiling**: no in-memory loading of members beyond the ids needed to refresh their permissions.
- **Scale tests**: delete a group with the largest known member count.

## Edge cases and errors
- Two concurrent deletes of the same group: one gets 200, the other 404.
- A delete concurrent with adding a member to the same group leaves no membership pointing at a deleted group.
- Database failure gives 500 with a safe message, and nothing is deleted.

## Open questions
- Should a "Default Group" access group exist, and should it be protected from deletion? The dropped legacy handler refused to delete a group named "Default Group" (403). The current code does not, and no code creates such an access group.
- Does deleting a group also delete its project access links, or must they be removed first? The Jan_05 dump shows cascades for memberships and group roles. The project access link cascade is in the project area's schema and must be confirmed against the fresh dump (D1).
