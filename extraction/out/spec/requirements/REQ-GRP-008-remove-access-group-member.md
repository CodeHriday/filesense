---
id: REQ-GRP-008
title: Remove a user from an access group
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-GRP-012]
contracts: []
priority: must
---
# REQ-GRP-008: Remove a user from an access group

## Context
Administrators remove users from an access group when the users should no longer have the group's roles or project access. Today any authenticated user can remove any member from any group. The rebuild restricts removal to administrators, and the user loses the group's rights at once.

## Requirements
1. When an administrator removes a user from an access group, the system shall delete that membership.
2. When the membership is deleted, the system shall respond 200 with the message "Member removed successfully".
3. When a membership is deleted, the system shall stop applying the group's roles and project access to that user from their next request (REQ-GRP-012).
4. If the group id or user id is not a positive integer, then the system shall reject the request with 400.
5. If the user is not a member of the group, then the system shall respond 404 with the message "Group member not found".
6. If the caller is not authenticated, then the system shall reject the request with 401.
7. If the caller is not an Administrator, then the system shall reject the request with 403 and remove nothing.

## Acceptance criteria
- **AC-1**: Given user 5 is a member of "Ops", When an administrator removes user 5 from "Ops", Then the response is 200 with "Member removed successfully" and user 5 is no longer listed as a member. <!-- source: areas/GRP.md#delete-apigroupsgroupidmembersuserid-grouproutesjs439 -->
- **AC-2**: Given user 5 has role "Analyst" only through "Ops", When an administrator removes user 5 from "Ops", Then user 5's next request is evaluated without "Analyst". <!-- source: areas/GRP.md#delete-apigroupsgroupidmembersuserid-grouproutesjs439 -->
- **AC-3**: Given user 5 has role "Analyst" both directly and through "Ops", When an administrator removes user 5 from "Ops", Then user 5 still has "Analyst". <!-- source: areas/GRP.md#domain-terms -->
- **AC-4**: Given user 5 is not a member of "Ops", When an administrator removes user 5 from "Ops", Then the response is 404 with "Group member not found". <!-- source: areas/GRP.md#delete-apigroupsgroupidmembersuserid-grouproutesjs439 -->
- **AC-5**: Given an authenticated user without the Admin role, When they remove user 5 from "Ops", Then the response is 403 and user 5 is still a member. <!-- source: areas/GRP.md#security -->

## Out of scope
- Removing several users in one request.

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: deletes one membership.

## Edge cases and errors
- Two concurrent removals of the same membership: one gets 200, the other 404.
- A non-existent group gives 404 "Group member not found".
- An administrator who removes themselves from a group loses only that group's rights; their Administrator status follows their effective roles.
- Database failure gives 500 with a safe message.

## Open questions
- Should any group refuse member removal? The dropped legacy handler refused removal from a group named "Default Group" (403 "Cannot remove users from the default group"). The current code has no such rule.
