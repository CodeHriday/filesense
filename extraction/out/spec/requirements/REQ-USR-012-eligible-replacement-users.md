---
id: REQ-USR-012
title: List eligible replacement users for an ownership transfer
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-USR-001]
contracts: []
priority: must
---
# REQ-USR-012: List eligible replacement users for an ownership transfer

## Context
When a user who owns assets is to be deleted, the administrator picks a replacement user to receive the assets. In the old system two rules contradicted each other. The candidate list offered internal users for an internal source, but the transfer accepted only vendor contacts, so internal users with dependencies could never be deleted through the UI (USR BUG-1). The triage decision (F09) sets one eligibility rule per user type, used both here and by the transfer (REQ-USR-013).

## Requirements
1. The system shall decide eligibility with one rule:
   - If the source user belongs to a vendor organisation, then eligible users are the other users who belong to the same vendor organisation.
   - If the source user belongs to no vendor organisation and is not a vendor user, then eligible users are the other users who are not vendor users and belong to no vendor organisation.
   - If the source user belongs to no vendor organisation but is a vendor user, then no user is eligible.
2. When an administrator requests replacements for a user, the system shall return the source user's id, username, e-mail, internal user flag, user type and vendor organisation id, and the eligible users.
3. The system shall return, for each eligible user, id, username, e-mail, full name and role names.
4. The system shall never put a null entry in a role list. A user with no roles has an empty list.
5. If no user has the given id, then the system shall respond 404 `User not found`.
6. If the id is not a positive integer, then the system shall respond 400.

## Acceptance criteria
- **AC-1**: Given vendor users 20, 21 and 22 belong to vendor organisation 5 and vendor user 30 belongs to organisation 6, When replacements for user 20 are requested, Then exactly users 21 and 22 are returned. <!-- source: areas/USR.md#14-get-apiusersideligible-replacements -->
- **AC-2**: Given internal users 7 and 8, and vendor user 20 in organisation 5, When replacements for user 7 are requested, Then user 8 is returned and user 20 is not. <!-- source: areas/USR.md#14-get-apiusersideligible-replacements -->
- **AC-3**: Given vendor user 40 with no vendor organisation, When replacements for user 40 are requested, Then the list is empty. <!-- source: areas/USR.md#14-get-apiusersideligible-replacements -->
- **AC-4**: Given internal user 8 has no roles, When replacements for user 7 are requested, Then user 8's roles value is an empty list. <!-- source: areas/USR.md#bug -->
- **AC-5**: Given no user 9999, When replacements are requested, Then the response is 404. <!-- source: areas/USR.md#14-get-apiusersideligible-replacements -->

## Out of scope
- Performing the transfer (REQ-USR-013).

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: for an internal source, every internal user. The count is unknown, see Open questions.
- **Growth**: grows with the number of users.
- **Largest tenant**: unknown.
- **Time window**: interactive request.
- **Memory ceiling**: the candidate list in memory.
- **Scale tests**: an internal source when the production user count is at its known maximum.

## Edge cases and errors
- The source user never appears in their own candidate list.
- A user whose type is not `Vendor` but whose internal flag is false (the old create default) counts as "not a vendor user".

## Open questions
- What should happen to a vendor user who belongs to no vendor organisation and owns assets? The old rule gives no candidates, so such a user can never be deleted.
- Should locked users be offered as candidates?
- Should the internal-candidate list be paginated or searchable, given an unknown number of internal users?
