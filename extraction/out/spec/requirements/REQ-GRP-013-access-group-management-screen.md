---
id: REQ-GRP-013
title: Access group management screen with list, search, create and delete
module: frontend
status: draft
owner: "@OWNER"
depends_on: [REQ-GRP-001, REQ-GRP-002, REQ-GRP-004, REQ-GRP-006]
contracts: []
priority: must
---
# REQ-GRP-013: Access group management screen with list, search, create and delete

## Context
Administrators need one screen to see access groups, find one, create a new one with its first members and role, and delete groups they no longer need. The old app had two screens for this. One of them, presented as a container for business processes, sent no credentials and always failed; it is dropped. The surviving screen hid delete only in the browser. In the rebuild the screen is shown to administrators, and the server enforces every action regardless of what the screen shows.

## Requirements
1. The system shall show the access group management screen, labelled "Access Groups" in navigation, only to administrators.
2. When the screen opens, the system shall show the access groups with name, description, group type, IdP sync flag and member count.
3. When the administrator types in the search box, the system shall refresh the list with the search term after typing pauses.
4. When the administrator picks a group type filter, the system shall refresh the list with only that group type.
5. When the administrator opens the create dialog, the system shall offer name, description, group type (MANUAL, STANDARD, DYNAMIC; default MANUAL), an "Enable IdP Sync" checkbox, a member multi-select and one optional role with an optional project scope.
6. The system shall filter the member multi-select with "Internal" and "External" checkboxes, with internal users shown and external users hidden by default.
7. The system shall offer "All Projects (Global)" as the default project scope, plus the top-level projects.
8. If the create dialog is submitted without a name, then the system shall show "Group name is required" and not submit.
9. When the server rejects a create, update or delete, the system shall show the server's safe message and keep the dialog's input.
10. When the administrator asks to delete a group, the system shall ask for confirmation naming the group before deleting it.
11. When a create or delete succeeds, the system shall refresh the list.
12. The system shall not describe STANDARD or DYNAMIC as having behaviour the server does not provide.

## Acceptance criteria
- **AC-1**: Given a user without the Admin role, When they sign in, Then "Access Groups" is not in navigation, and opening the screen's address shows a not-authorised message without loading group data. <!-- source: areas/GRP.md#frontend-group-management-srcpagesgroupmanagementjsx-appjsx448 -->
- **AC-2**: Given an administrator, When they type "fin" in the search box and stop typing, Then exactly one list request is sent, after the 2500 ms pause, and it carries search "fin". <!-- source: areas/GRP.md#get-apigroupsinit-data-grouproutesjs110 -->
- **AC-3**: Given an administrator opens the create dialog, Then group type is MANUAL, project scope is "All Projects (Global)", "Internal" is checked and "External" is unchecked. <!-- source: areas/GRP.md#frontend-group-management-srcpagesgroupmanagementjsx-appjsx448 -->
- **AC-4**: Given the create dialog with "External" checked, Then vendor users appear in the member multi-select; with it unchecked, they do not. <!-- source: areas/GRP.md#frontend-group-management-srcpagesgroupmanagementjsx-appjsx448 -->
- **AC-5**: Given the create dialog with an empty name, When the administrator submits, Then "Group name is required" is shown and no request is sent. <!-- source: areas/GRP.md#frontend-groups-srcpagesgroupsjsx-appjsx415 -->
- **AC-6**: Given group "Ops" exists, When the administrator creates another "Ops", Then the server's conflict message is shown and the dialog keeps the entered values. <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->
- **AC-7**: Given an administrator clicks delete on "Ops" and then cancels the confirmation, Then no delete request is sent. <!-- source: areas/GRP.md#delete-apigroupsgroupid-grouproutesjs380 -->
- **AC-8**: Given an administrator confirms deleting "Ops", When the server responds 200, Then "Ops" is no longer listed. <!-- source: areas/GRP.md#delete-apigroupsgroupid-grouproutesjs380 -->
- **AC-9**: Given the list returns a group with member count 3, Then the row shows 3 members. <!-- source: areas/GRP.md#frontend-groups-srcpagesgroupsjsx-appjsx415 -->
- **AC-10**: Given the type help text is shown, Then it does not say that STANDARD uses predefined rules or that DYNAMIC adds members automatically. <!-- source: areas/GRP.md#frontend-group-management-srcpagesgroupmanagementjsx-appjsx448 -->

## Out of scope
- The edit dialog (REQ-GRP-014).
- A screen presenting groups as containers for business processes (dropped with business processes).
- The governance policy screen, which belongs to the governance area.

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: shows one page of groups and the reference data from REQ-GRP-002.

## Edge cases and errors
- With no groups, the screen shows an empty state with the create button.
- With no matches for the search, the screen shows "no groups match" and keeps the search text.
- An expired session during any action follows the shared sign-in renewal flow and does not lose dialog input.
- Network failure shows a retry message and leaves the list as it was.

## Open questions
- Is the 2500 ms search pause intended? It is the old value and is long for a search box.
- The old name field allowed 50 characters while the server allows 255; which limit should the field enforce? (Same question as REQ-GRP-004.)
