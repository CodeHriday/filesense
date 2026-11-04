---
id: REQ-GRP-005
title: Update an access group's details
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-GRP-005: Update an access group's details

## Context
Administrators rename access groups and change their description, external id, IdP sync flag and metadata. Today any authenticated user can do this, and a duplicate name gives 500. The group type is silently ignored even though the edit screen sends it. The rebuild restricts updates to administrators, keeps the group type fixed after creation, and returns 409 for a duplicate name.

## Requirements
1. When an administrator updates an access group, the system shall change only the fields present in the request, out of name, description, external id, IdP sync flag and metadata.
2. When an access group is updated, the system shall set its update time to the current time and respond 200 with the updated group.
3. The system shall keep the group type unchanged after creation.
4. If the request contains none of the updatable fields, then the system shall reject it with 400 and the message "No fields to update".
5. If a name is given that is empty after trimming or longer than 255 characters, then the system shall reject the request with 400.
6. If the new name equals the name of another access group, then the system shall reject the request with 409.
7. If the id is not a positive integer, then the system shall reject the request with 400.
8. If no access group has that id, then the system shall respond 404 with the message "Group not found".
9. If the caller is not authenticated, then the system shall reject the request with 401.
10. If the caller is not an Administrator, then the system shall reject the request with 403 and change nothing.

## Acceptance criteria
- **AC-1**: Given group "Ops" with description "old", When an administrator updates only the description to "new", Then the description is "new", the name is still "Ops" and the update time is later than before. <!-- source: areas/GRP.md#put-apigroupsgroupid-grouproutesjs309 -->
- **AC-2**: Given group "Ops" of type MANUAL, When an administrator sends group type DYNAMIC along with a new description, Then the description changes and the group type stays MANUAL. <!-- source: areas/GRP.md#put-apigroupsgroupid-grouproutesjs309 -->
- **AC-3**: Given group "Ops", When an administrator sends an update with no updatable fields, Then the response is 400 with "No fields to update". <!-- source: areas/GRP.md#put-apigroupsgroupid-grouproutesjs309 -->
- **AC-4**: Given groups "Ops" and "Finance", When an administrator renames "Finance" to "Ops", Then the response is 409 and both groups are unchanged. <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->
- **AC-5**: Given no group with id 9999, When an administrator updates group 9999, Then the response is 404 with "Group not found". <!-- source: areas/GRP.md#put-apigroupsgroupid-grouproutesjs309 -->
- **AC-6**: Given group "Ops", When an administrator sets the name to "", Then the response is 400 and the name stays "Ops". <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->
- **AC-7**: Given an authenticated user without the Admin role, When they rename any group, Then the response is 403 and the group is unchanged. <!-- source: areas/GRP.md#security -->
- **AC-8**: Given group "Ops" with IdP sync true, When an administrator sets IdP sync to false, Then the stored flag is false. <!-- source: areas/GRP.md#put-apigroupsgroupid-grouproutesjs309 -->

## Out of scope
- Changing members or group roles (REQ-GRP-007 to REQ-GRP-010).
- Changing the group type.

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: updates one group row.

## Edge cases and errors
- An update that sets the name to the group's own current name succeeds.
- Two concurrent renames to the same new name: one succeeds, the other gets 409.
- Metadata that is not a JSON object gives 400.
- Database failure gives 500 with a safe message.

## Open questions
- If a request tries to change the group type, should the server reject it with 400 instead of ignoring it? The old server ignored it silently.
- Can a description, external id or metadata be cleared (set to empty)? The old code wrote any value that was present, including null, but did not say this was intended.
