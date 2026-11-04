---
id: REQ-USR-006
title: Administrator replaces a user's directly assigned roles
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-USR-001, REQ-USR-007, REQ-USR-009]
contracts: []
priority: must
---
# REQ-USR-006: Administrator replaces a user's directly assigned roles

## Context
Administrators grant and withdraw roles from users. The old edit removed every role and then re-added each entry, which it resolved either as an id or as a role name. Unknown entries were skipped silently, and an empty list stripped every role, including the last administrator's Admin role. The change did not take effect until the user's token or permission cache expired. This shard keeps the replace-all behaviour with strict input, the last-administrator guard and immediate effect.

## Requirements
1. When an administrator submits a role list for a user, the system shall replace the user's directly assigned roles with exactly that list, in one transaction.
2. The system shall accept roles only as role ids.
3. If any role id does not exist, then the system shall respond 400 listing the unknown ids and change nothing.
4. If the list is empty, then the system shall respond 400 and change nothing.
5. The system shall ignore duplicate ids in the list.
6. If the change would leave no administrator, then the system shall refuse it as in REQ-USR-007.
7. The system shall not change roles the user receives through access groups.
8. When the change commits, the system shall apply it to the user's next request (REQ-USR-009).
9. If no user has the given id, then the system shall respond 404 `User not found`.

## Acceptance criteria
- **AC-1**: Given user 7 with roles `User` (id 2) and `Data Steward` (id 5), When an administrator submits `[2, 6]`, Then user 7 has exactly roles 2 and 6. <!-- source: areas/USR.md#11-put-apiusersid-admin-edit-user -->
- **AC-2**: Given user 7 with role 2, When an administrator submits `[2, 9999]`, Then the response is 400 naming 9999 and user 7 still has only role 2. <!-- source: areas/USR.md#11-put-apiusersid-admin-edit-user -->
- **AC-3**: Given user 7 with role 2, When an administrator submits `[]`, Then the response is 400 and user 7 still has role 2. <!-- source: areas/USR.md#11-put-apiusersid-admin-edit-user -->
- **AC-4**: Given user 7, When an administrator submits `["Admin"]`, Then the response is 400 and user 7's roles are unchanged. <!-- source: areas/USR.md#11-put-apiusersid-admin-edit-user -->
- **AC-5**: Given user 7 who holds `Admin` only through an access group, When an administrator submits `[2]`, Then user 7 still receives `Admin` through the group. <!-- source: areas/USR.md#data-touched -->
- **AC-6**: Given user 7 has role `mappings:write` through role 6, When an administrator replaces 7's roles with `[2]`, Then user 7's next request to change a mapping is denied. <!-- source: areas/USR.md#security -->

## Out of scope
- Group roles and access group membership (GRP).
- Project membership (PRJ).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: one user's role set per request.

## Edge cases and errors
- Submitting the same set the user already has succeeds and changes nothing except the updated time.
- An administrator may change their own roles, subject to REQ-USR-007.
- Ids sent as numeric strings (`"2"`) are rejected with 400, so they are never treated as names.

## Open questions
- Should the `Viewer` role be assignable? The old UI hid it from the role picker but not from role management (USR UNCLEAR-6).
