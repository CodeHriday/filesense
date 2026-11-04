---
id: REQ-GRP-004
title: Create an access group with optional initial members and group roles
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-GRP-012]
contracts: []
priority: must
---
# REQ-GRP-004: Create an access group with optional initial members and group roles

## Context
Administrators create access groups so that a set of users can share group roles and project access. One action creates the group together with its first members and an optional group role. Today any authenticated user can do this. That lets any user create a group, put themselves in it and grant it an admin role (finding C3). A duplicate name also gives 500 instead of a conflict, and new members' permissions are not refreshed. The rebuild restricts creation to administrators, validates every reference, returns 409 for a duplicate name, and applies the new rights at once.

## Requirements
1. When an administrator submits a new access group, the system shall create it with the given name, description, group type, external id, IdP sync flag and metadata, and record the administrator as its creator.
2. Where no group type is given, the system shall set the group type to MANUAL.
3. Where no IdP sync flag is given, the system shall set it to false; where no metadata is given, the system shall store an empty object.
4. Where initial member user ids are given, the system shall make each of those users a member of the new group, adding each user once even if listed twice.
5. Where initial group roles are given, the system shall grant each role to the group, either globally or limited to the given top-level project.
6. The system shall create the group, its members and its group roles all-or-nothing: if any part fails, nothing is created.
7. When the group is created, the system shall respond 201 with the created group.
8. When the group is created with members, the system shall apply the group's roles to those members from their next request (REQ-GRP-012).
9. If the name is missing or empty after trimming, then the system shall reject the request with 400 and the message "Group name is required".
10. If the name is longer than 255 characters, then the system shall reject the request with 400.
11. If the group type is not one of MANUAL, STANDARD or DYNAMIC, then the system shall reject the request with 400.
12. If an access group with the same name already exists, then the system shall reject the request with 409.
13. If any initial member id, role id or scope project id does not identify an existing user, role or top-level project, then the system shall reject the request with 400 and name the invalid ids.
14. If the caller is not authenticated, then the system shall reject the request with 401.
15. If the caller is not an Administrator, then the system shall reject the request with 403 and create nothing.

## Acceptance criteria
- **AC-1**: Given an administrator, When they create group "Ops" with no group type, Then the response is 201, the group type is MANUAL, the IdP sync flag is false, metadata is {} and the creator is that administrator. <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->
- **AC-2**: Given an administrator, When they create group "Ops" with members [5, 7, 5], Then the group has exactly two members, users 5 and 7. <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->
- **AC-3**: Given an administrator, When they create group "Ops" with role "Analyst" limited to top-level project "Claims", Then the group has one group role "Analyst" scoped to "Claims". <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->
- **AC-4**: Given an administrator, When they create group "Ops" with role "Viewer" and no project, Then the group role "Viewer" is global. <!-- source: areas/GRP.md#frontend-group-management-srcpagesgroupmanagementjsx-appjsx448 -->
- **AC-5**: Given an administrator, When they create a group with name "   ", Then the response is 400 with "Group name is required" and no group exists. <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->
- **AC-6**: Given an administrator, When they create a group with a 255-character name, Then it is created; When the name has 256 characters, Then the response is 400. <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->
- **AC-7**: Given an administrator, When they create a group with group type "SYSTEM", Then the response is 400. <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->
- **AC-8**: Given group "Ops" exists, When an administrator creates another group named "Ops", Then the response is 409 and the existing group is unchanged. <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->
- **AC-9**: Given user 999 does not exist, When an administrator creates group "Ops" with members [5, 999], Then the response is 400 naming 999, and neither the group nor any membership is created. <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->
- **AC-10**: Given "Claims-EU" is a sub-project, When an administrator creates a group with a role scoped to "Claims-EU", Then the response is 400 and nothing is created. <!-- source: areas/GRP.md#get-apigroupsinit-data-grouproutesjs110 -->
- **AC-11**: Given an authenticated user without the Admin role, When they create group "Mine" with themselves as member and role "Admin", Then the response is 403, no group exists and the user's roles are unchanged. <!-- source: areas/GRP.md#security -->
- **AC-12**: Given user 5 has no roles, When an administrator creates a group with member 5 and global role "Viewer", Then user 5's next request is evaluated with role "Viewer". <!-- source: areas/GRP.md#bug -->
- **AC-13**: Given an administrator, When they create a group with role "Analyst", Then the group role records that administrator as the one who assigned it. <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->

## Out of scope
- Behaviour for the STANDARD and DYNAMIC group types (rule-based or attribute-based membership). The old code only stored the label.
- IdP synchronisation driven by the external id or IdP sync flag. Both are stored only.
- Adding the creator as a member automatically. Only the dropped legacy handler did that.

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: one group plus the members and roles given in a single request. The number of initial members is bounded by the request size limit.

## Edge cases and errors
- An empty member list or role list creates a group with no members or roles.
- Two concurrent creates with the same name: one succeeds, the other gets 409.
- Metadata that is not a JSON object gives 400.
- Unknown body fields (for example a membership source) are ignored.
- Database failure gives 500 with a safe message, and nothing is created.

## Open questions
- Is the duplicate-name rule case-sensitive ("Ops" vs "ops")? The old uniqueness constraint's collation is not shown.
- The old screen limited the name to 50 characters while the store allows 255. Which limit applies?
- Should STANDARD and DYNAMIC stay as group types although nothing implements them? The old migration comment lists MANUAL, IDP_SYNCED and SYSTEM instead.
- Should the external id and IdP sync flag be kept at all, given that no sync process uses them?
- Should the create screen allow more than one initial group role? The old screen sent one role, and the old API also accepted a list of global-only roles.
- Should creating, changing or deleting a group, its members or its group roles write an audit record? The old code wrote none, though these actions grant rights.
