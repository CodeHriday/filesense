---
id: REQ-USR-011
title: Dependency counts for several users before a bulk delete
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-USR-001, REQ-USR-010]
contracts: []
priority: should
---
# REQ-USR-011: Dependency counts for several users before a bulk delete

## Context
Before a bulk delete, the administrator needs to know which of the selected users still own assets, because those users have to be handled one at a time with a transfer. The old check ran five count queries per user, one after another, using the same definition as the single-user list. It returned only users with a non-zero total. Ids that did not exist were silently treated as having no dependencies.

## Requirements
1. When an administrator submits a list of user ids, the system shall return, for each user with at least one dependency under REQ-USR-010, the user's id, username, e-mail and total dependency count.
2. The system shall return a flag that is true when none of the submitted users has a dependency.
3. The system shall return the ids that match no user in a separate not-found list.
4. If the list is missing, empty, not a list, or contains a value that is not a positive integer, then the system shall respond 400 with the message `userIds must be a non-empty array` and check nothing.
5. If the list holds more ids than the bulk limit, then the system shall respond 400.
6. The system shall ignore duplicate ids.

## Acceptance criteria
- **AC-1**: Given user 7 owns 2 mappings and 1 project, and user 8 owns nothing, When an administrator submits `[7, 8]`, Then the response lists user 7 with count 3, does not list user 8, and the flag is false. <!-- source: areas/USR.md#15-post-apiusersbulk-dependencies -->
- **AC-2**: Given users 8 and 9 own nothing, When an administrator submits `[8, 9]`, Then the list is empty and the flag is true. <!-- source: areas/USR.md#15-post-apiusersbulk-dependencies -->
- **AC-3**: Given an empty list, When submitted, Then the response is 400 `userIds must be a non-empty array`. <!-- source: areas/USR.md#15-post-apiusersbulk-dependencies -->
- **AC-4**: Given `[7, "x"]`, When submitted, Then the response is 400. <!-- source: areas/USR.md#bug -->
- **AC-5**: Given `[7, 9999]` where 9999 does not exist, When submitted, Then 9999 is in the not-found list. <!-- source: areas/USR.md#bug -->

## Out of scope
- The per-kind lists for one user (REQ-USR-010).
- The bulk delete itself (REQ-USR-015).

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: up to the bulk limit of user ids (value open).
- **Growth**: not applicable.
- **Largest tenant**: unknown.
- **Time window**: interactive request.
- **Memory ceiling**: one count row per submitted user.
- **Scale tests**: a request at the bulk limit must not issue a separate query per user per dependency kind.

## Edge cases and errors
- Counts use the same rules as REQ-USR-010, so an agreement that matches two rules counts once.

## Open questions
- What is the bulk limit for the number of ids in one request? The old system had none.
