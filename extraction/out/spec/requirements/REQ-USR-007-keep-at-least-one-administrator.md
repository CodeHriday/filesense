---
id: REQ-USR-007
title: At least one administrator always remains
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-USR-001]
contracts: []
priority: must
---
# REQ-USR-007: At least one administrator always remains

## Context
If the last administrator loses the Admin role, nobody can manage users or roles any more. The old system blocked only self-deletion: an administrator could strip their own roles, or every role, and so could remove the last administrator. The old startup repair step hid this by re-granting admin roles to the user named `admin`, and that step is itself a finding (H12). This shard replaces it with an explicit guard.

## Requirements
1. The system shall refuse any operation that would leave no user holding the Admin role as a direct role.
2. The system shall apply this guard to role replacement for a user, single user delete, and each user in a bulk user delete.
3. If an operation is refused by this guard, then the system shall respond 409 with the message `At least one administrator must remain` and change nothing for that user.
4. While two operations that each remove an administrator run at the same time, the system shall serialise the guard check so that at most one of them can remove the second-to-last administrator.

## Acceptance criteria
- **AC-1**: Given user 1 is the only direct holder of `Admin`, When user 1 replaces their own roles with `[User]`, Then the response is 409 `At least one administrator must remain` and user 1 still holds `Admin`. <!-- source: areas/USR.md#security -->
- **AC-2**: Given users 1 and 2 hold `Admin`, When user 1 replaces their own roles with `[User]`, Then the response is 200 and user 2 is the only administrator. <!-- source: areas/USR.md#security -->
- **AC-3**: Given only users 1 and 2 hold `Admin`, When both send, at the same moment, a request that removes `Admin` from the other, Then exactly one request succeeds, the other gets 409, and one administrator remains. <!-- source: areas/USR.md#security -->
- **AC-4**: Given user 2 is the only direct holder of `Admin` and user 1 holds `Admin` only through an access group, When user 1 deletes user 2, Then the response is 409 and user 2 remains. <!-- source: areas/USR.md#security -->
- **AC-5**: Given users 1 and 2 hold `Admin`, When user 1 bulk-deletes users 2 and 3 where 3 is not an administrator, Then users 2 and 3 are deleted and user 1 remains an administrator. <!-- source: areas/USR.md#18-post-apiusersbulk-delete -->

## Out of scope
- Seeding the bootstrap admin (MIG, F122).
- Deleting the Admin role itself, which is a protected system role (REQ-USR-022).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: one count per guarded operation.

## Edge cases and errors
- Self-deletion is refused separately (REQ-USR-014), even when other administrators exist.
- A locked administrator still counts as an administrator.

## Open questions
- Should administrators who hold `Admin` only through an access group count towards "at least one"? This shard counts direct holders only, so a group change can never remove the last administrator.
- Should a locked administrator count? This shard counts them.
