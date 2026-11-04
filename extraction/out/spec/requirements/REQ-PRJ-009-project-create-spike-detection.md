---
id: REQ-PRJ-009
title: Raise a security event on a burst of project creation
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-PRJ-008]
contracts: []
priority: should
---
# REQ-PRJ-009: Raise a security event on a burst of project creation

## Context
Security staff want a signal when one user creates projects unusually fast, even within the rate limits. The old system counted the user's create attempts over five minutes and logged a suspicious-activity event, but the descriptive text and user details were silently dropped (PRJ BUG 10). The request itself was never blocked.

## Requirements
1. When a project is created, the system shall count the creating user's project create audit entries with outcome `SUCCESS`, `FAILED` or `RATE_LIMITED` in the last 5 minutes, including the current one.
2. When that count is greater than 5, the system shall record a security event of type `SUSPICIOUS_ACTIVITY` with severity medium, the user id, the count and the description "User created <count> projects in 5 minutes".
3. The system shall not block or delay the create because of this check.
4. If recording the security event fails, then the system shall still return the create result and log the failure.

## Acceptance criteria
- **AC-1**: Given U has 5 create audit entries in the last 5 minutes, When U creates a 6th project, Then a `SUSPICIOUS_ACTIVITY` event with severity medium, count 6 and the description "User created 6 projects in 5 minutes" is recorded and the create returns 201. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-2**: Given U has 4 create audit entries in the last 5 minutes, When U creates a 5th, Then no event is recorded. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-3**: Given U has 6 entries but 2 are older than 5 minutes, When U creates another, Then the count is 5 and no event is recorded. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-4**: Given 3 of U's recent entries are `RATE_LIMITED`, When U creates successfully, Then those 3 are included in the count. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-5**: Given the security event store rejects writes, When U creates a 6th project, Then the response is 201. <!-- source: areas/PRJ.md#bug -->

## Out of scope
- Alerting on security events (ALRT/AUD).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: one count over at most a few audit entries per user.

## Edge cases and errors
- The 5-minute window is measured against the data store's UTC clock (D11).
- The check runs only after a successful create (old behaviour); refused attempts do not trigger it.

## Open questions
- Should refused attempts (duplicate name or rate limit) also trigger the check? Today only a successful create does.
