---
id: REQ-GRP-007
title: Add a user to an access group
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-GRP-012]
contracts: []
priority: must
---
# REQ-GRP-007: Add a user to an access group

## Context
Administrators add users to an access group so that the users inherit the group's roles and project access. Today any authenticated user can add anyone, including themselves, to any group, and so gain that group's roles (finding C3). A missing group or user gives 500. Re-adding an existing member returns 201 with an empty body. The rebuild restricts this to administrators, uses the single membership store (D4), and gives clear results for missing references and existing members.

## Requirements
1. When an administrator adds a user to an access group, the system shall record the membership in the single membership store.
2. When a new membership is recorded, the system shall respond 201 with the group id and user id.
3. If the user is already a member of the group, then the system shall leave the membership unchanged and respond 200 with the existing membership.
4. When a membership is added, the system shall apply the group's roles and project access to the user from their next request (REQ-GRP-012).
5. If the user id is missing, then the system shall reject the request with 400.
6. If the group id or user id is not a positive integer, then the system shall reject the request with 400.
7. If no access group has the given group id, then the system shall respond 404 with the message "Group not found".
8. If no user has the given user id, then the system shall respond 404 with the message "User not found".
9. If the caller is not authenticated, then the system shall reject the request with 401.
10. If the caller is not an Administrator, then the system shall reject the request with 403 and add no membership.

## Acceptance criteria
- **AC-1**: Given group "Ops" without user 5, When an administrator adds user 5, Then the response is 201 and user 5 is listed among the members of "Ops". <!-- source: areas/GRP.md#post-apigroupsgroupidmembers-grouproutesjs406 -->
- **AC-2**: Given user 5 is already a member of "Ops", When an administrator adds user 5 again, Then the response is 200 with the existing membership and "Ops" still has user 5 exactly once. <!-- source: areas/GRP.md#post-apigroupsgroupidmembers-grouproutesjs406 -->
- **AC-3**: Given "Ops" has global group role "Analyst", When an administrator adds user 5 and user 5 then makes a request, Then that request is evaluated with role "Analyst" in both roles and permissions. <!-- source: areas/GRP.md#post-apigroupsgroupidmembers-grouproutesjs406 -->
- **AC-4**: Given an administrator, When they add a member without a user id, Then the response is 400. <!-- source: areas/GRP.md#post-apigroupsgroupidmembers-grouproutesjs406 -->
- **AC-5**: Given no user 999, When an administrator adds user 999 to "Ops", Then the response is 404 "User not found", not 500. <!-- source: areas/GRP.md#post-apigroupsgroupidmembers-grouproutesjs406 -->
- **AC-6**: Given no group 9999, When an administrator adds user 5 to group 9999, Then the response is 404 "Group not found". <!-- source: areas/GRP.md#post-apigroupsgroupidmembers-grouproutesjs406 -->
- **AC-7**: Given an authenticated user 8 without the Admin role, When user 8 adds themselves to group "Admins", Then the response is 403, user 8 is not a member and user 8's roles are unchanged. <!-- source: areas/GRP.md#security -->
- **AC-8**: Given a vendor user, When an administrator adds the vendor user to "Ops", Then the response is 201. <!-- source: areas/GRP.md#frontend-group-management-srcpagesgroupmanagementjsx-appjsx448 -->

## Out of scope
- Adding several users in one request. The dropped legacy endpoint accepted a list; the current screen adds one user at a time.
- A membership source.
- Rule-based or attribute-based membership.

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: records one membership.

## Edge cases and errors
- Two concurrent adds of the same user to the same group leave one membership; one call gets 201 and the other 200.
- Adding a user while the group is being deleted ends with either 404 or a membership that the deletion then removes; there is never a membership of a deleted group.
- Unknown body fields (for example a source of MANUAL) are ignored.
- Database failure gives 500 with a safe message.

## Open questions
- Should new users join a default access group automatically? An old startup routine enrolled every user with no membership in an access group named "Default Group", but no code created that group (see dropped/GRP.md).
- Can locked or inactive users be added as members?
