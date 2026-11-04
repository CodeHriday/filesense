---
id: REQ-GRP-014
title: Access group edit dialog for details, group roles and members
module: frontend
status: draft
owner: "@OWNER"
depends_on: [REQ-GRP-003, REQ-GRP-005, REQ-GRP-007, REQ-GRP-008, REQ-GRP-009, REQ-GRP-010]
contracts: []
priority: must
---
# REQ-GRP-014: Access group edit dialog for details, group roles and members

## Context
Administrators change an existing access group from one dialog: its details, the group roles it grants, and its members. Today the dialog shows every group role as "Global" because the scope project name is never supplied. It shows an always-empty member source badge and offers a group type field that the server ignores. Assigning a role always fails with a server error. The rebuild shows each role's real scope and keeps the group type read-only.

## Requirements
1. When an administrator opens the edit dialog for a group, the system shall show the group's details, its group roles and its members.
2. The system shall let the administrator edit name, description, external id and the IdP sync flag, and show the group type as read-only.
3. The system shall show each group role with its role name and its scope, either "All Projects (Global)" or the project name.
4. The system shall show the hint "Roles assigned here are inherited by all group members" above the group roles.
5. When the administrator assigns a role, the system shall offer the roles and a project scope choice of "All Projects (Global)" or a top-level project, and add the new group role to the table on success.
6. When the administrator removes a group role, the system shall remove only that role-and-scope row on success.
7. The system shall show each member with username, full name and e-mail address.
8. When the administrator adds a member, the system shall offer the users who are not already members, and add the user to the table on success.
9. When the administrator removes a member, the system shall remove that member from the table on success.
10. When the server rejects an action, the system shall show the server's safe message and leave the tables unchanged.
11. When the dialog closes after any change, the system shall refresh the group list so that member counts are current.

## Acceptance criteria
- **AC-1**: Given "Ops" has "Analyst" scoped to "Claims" and global "Viewer", When an administrator opens its edit dialog, Then the role table shows "Analyst - Claims" and "Viewer - All Projects (Global)". <!-- source: areas/GRP.md#bug -->
- **AC-2**: Given the edit dialog for a MANUAL group, Then the group type is shown as MANUAL and cannot be changed. <!-- source: areas/GRP.md#put-apigroupsgroupid-grouproutesjs309 -->
- **AC-3**: Given "Ops" already has global "Viewer", When the administrator assigns global "Viewer" again, Then the message "Role already assigned to group" is shown and the table still has one global "Viewer" row. <!-- source: areas/GRP.md#post-apigroupsgroupidroles-grouproutesjs469 -->
- **AC-4**: Given "Ops" has "Analyst" globally and scoped to "Claims", When the administrator removes the "Claims" row, Then only the "Claims" row disappears. <!-- source: areas/GRP.md#delete-apigroupsgroupidrolesroleid-grouproutesjs508 -->
- **AC-5**: Given "Ops" has members adam and zoe, When the administrator opens the add-member choice, Then adam and zoe are not offered. <!-- source: areas/GRP.md#frontend-group-management-srcpagesgroupmanagementjsx-appjsx448 -->
- **AC-6**: Given the administrator removes zoe from "Ops", When the server responds 200, Then zoe is no longer in the member table, and after the dialog closes the list shows a member count one lower. <!-- source: areas/GRP.md#delete-apigroupsgroupidmembersuserid-grouproutesjs439 -->
- **AC-7**: Given the edit dialog, Then no membership source badge is shown. <!-- source: areas/GRP.md#bug -->
- **AC-8**: Given the administrator renames "Ops" to an existing group's name, When they save, Then the server's conflict message is shown and the field keeps the typed value. <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->

## Out of scope
- Managing which projects the group can access. The project screens own that.
- Bulk add or remove of members.

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: shows one group's members and roles from REQ-GRP-003.

## Edge cases and errors
- A group deleted by another administrator while the dialog is open: the next action shows "Group not found" and the dialog offers to close.
- A group with no roles or no members shows an empty-state row in that table.
- A group role whose scope project no longer exists: see REQ-GRP-003 Open questions.

## Open questions
- Should the add-member choice apply the same Internal and External filter as the create dialog? The old edit dialog listed all users unfiltered.
