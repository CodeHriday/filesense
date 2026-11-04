---
id: REQ-USR-010
title: List the assets a user owns before deletion
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-USR-001]
contracts: []
priority: must
---
# REQ-USR-010: List the assets a user owns before deletion

## Context
Before deleting a user, an administrator needs to see what that user still owns, so that ownership can be moved first (F09). The old system defined five kinds of dependency and listed them. The check ran only in the UI, and the server returned 200 with empty lists for a user that does not exist. The same definition now drives the server-side delete check (REQ-USR-014), the counts for many users (REQ-USR-011) and the transfer (REQ-USR-013).

## Requirements
1. The system shall count as a user's dependencies:
   - vendors (not deleted) for which the user is the vendor contact;
   - vendor agreements (not archived) for which the user is the agreement owner, matched by the agreement owner's e-mail being equal to the user's e-mail;
   - vendor agreements (not archived) on which the user is recorded as vendor approver, owner approver or governance approver;
   - mappings created by the user;
   - files uploaded by the user through the vendor portal, shown as "Uploaded Files";
   - projects (not archived) owned by the user.
2. When an administrator requests a user's dependencies, the system shall return one list per kind (vendors, agreements, mappings, uploaded files, projects), each item with its id and display name, and a flag that is true when any list is non-empty.
3. The system shall list an agreement once even if it matches more than one rule.
4. If no user has the given id, then the system shall respond 404 `User not found`.
5. If the id is not a positive integer, then the system shall respond 400.

## Acceptance criteria
- **AC-1**: Given user 7 is the vendor contact of active vendor `Acme`, When an administrator requests 7's dependencies, Then the vendors list contains `Acme` and the flag is true. <!-- source: areas/USR.md#13-get-apiusersiddependencies -->
- **AC-2**: Given user 7 has e-mail `u7@example.com` and agreement 12 has agreement owner e-mail `u7@example.com`, When dependencies are requested, Then agreement 12 is listed. <!-- source: areas/USR.md#13-get-apiusersiddependencies -->
- **AC-3**: Given agreement 12 has user 7 as both agreement owner and owner approver, When dependencies are requested, Then agreement 12 appears once. <!-- source: areas/USR.md#13-get-apiusersiddependencies -->
- **AC-4**: Given user 7 owns project 3, which is archived, and project 4, which is not, When dependencies are requested, Then only project 4 is listed. <!-- source: areas/USR.md#13-get-apiusersiddependencies -->
- **AC-5**: Given user 8 owns nothing, When dependencies are requested, Then all five lists are empty and the flag is false. <!-- source: areas/USR.md#13-get-apiusersiddependencies -->
- **AC-6**: Given no user 9999, When dependencies are requested, Then the response is 404, not 200 with empty lists. <!-- source: areas/USR.md#bug -->

## Out of scope
- Moving the dependencies (REQ-USR-013).
- Other records that name the user as creator, such as quality rules, workflows, schedules and API tokens (see Open questions).

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: the assets of one user. The upper bound is unknown, see Open questions.
- **Growth**: grows with the user's mappings and vendor uploads.
- **Largest tenant**: unknown.
- **Time window**: interactive request before a delete.
- **Memory ceiling**: one user's lists in memory.
- **Scale tests**: a user with the largest known number of uploaded files.

## Edge cases and errors
- A user with no e-mail matches no agreement through the agreement owner rule.
- E-mail matching uses exact equality, as in the old rule.

## Open questions
- The Jan_05 baseline has many other references to users with no delete action, for example the creator of quality rules, N-step workflows, schedules, API tokens and retention policies. Those references block deletion. Should they count as dependencies and be transferable, or be cleared on delete?
- The old rules excluded vendor agreements with status `deleted`. The glossary maps that to `archived`. Confirm that archived agreements are excluded.
- What is the largest number of uploaded files or mappings one user owns in production?
- Under D5, approvals are recorded per approval-chain step. Should step decisions count as dependencies, or only the agreement-level approver fields?
