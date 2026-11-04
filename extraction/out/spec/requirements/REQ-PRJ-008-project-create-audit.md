---
id: REQ-PRJ-008
title: Audit every project create outcome without failing committed changes
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-PRJ-005, REQ-PRJ-006]
contracts: []
priority: must
---
# REQ-PRJ-008: Audit every project create outcome without failing committed changes

## Context
Security reviewers need to see who created projects, who was refused and who hit the limits. The old system wrote these audit entries, but a failed audit write after the commit turned a created project into a 500, so the client retried and got a duplicate-name 409 (PRJ BUG 9). Triage F15 decides that an audit write cannot fail a committed change. Audit entries capture the authenticated actor and never request bodies (cross-cutting rules).

## Requirements
1. When a project is created, the system shall record a success audit entry with the actor, the project id and name, the member count including the creator, the access-group count, and the time.
2. When a create is refused as a duplicate name, the system shall record a failed audit entry with the actor, the requested name and the reason.
3. When a create fails with a server fault, the system shall record a failed audit entry with the actor and a reason code, without internal error text.
4. When a create is refused by a rate limit, the system shall record a rate-limited audit entry with the actor, the limit type (per-minute or per-hour) and a SHA-256 hash of the requested name, description and project type.
5. The system shall use action type `project_create` and outcome `SUCCESS`, `FAILED` or `RATE_LIMITED` on these entries.
6. If writing the audit entry fails after the project is committed, then the system shall still return 201 and shall log the audit failure for operators.
7. The system shall not store the request body in audit entries.

## Acceptance criteria
- **AC-1**: Given U creates "Finance" with member ids [5, 6] and one group, When the create succeeds, Then a `SUCCESS` entry exists with actor U, member count 3 and access-group count 1. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-2**: Given U already owns "Finance", When U creates "finance", Then a `FAILED` entry exists with actor U and reason duplicate name. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-3**: Given U exceeds the per-minute limit, When refused, Then a `RATE_LIMITED` entry exists with limit type per-minute and a 64-hex-character payload hash. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-4**: Given the audit store rejects writes, When U creates a valid project, Then the response is 201, the project exists, and an operator log line records the audit failure. <!-- source: areas/PRJ.md#bug -->
- **AC-5**: Given any create attempt, When its audit entry is read, Then it holds no description text or member list from the request. <!-- source: cross-cutting.md#5-rules-that-apply-everywhere-for-the-rebuild -->
- **AC-6**: Given a create refused with 400 for an empty name, When audit entries are read, Then no `project_create` entry exists for it. <!-- source: areas/PRJ.md#post-apiprojects -->

## Out of scope
- The audit store, its retention and its UI (AUD area).
- Auditing other project changes (see Open questions).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: one audit entry per create attempt, at most 10 per user per hour plus refusals.

## Edge cases and errors
- Audit store slow: the create reply must not wait on it beyond the commit; see Open questions.
- The rate-limited entry is written even though no transaction ran.

## Open questions
- Should updates, deletes, archive changes and membership changes also write dedicated audit entries? The old code audited only creation; the global request audit (AUD) records requests.
- Should audit writes happen after the reply (asynchronously) or before it with a timeout?
