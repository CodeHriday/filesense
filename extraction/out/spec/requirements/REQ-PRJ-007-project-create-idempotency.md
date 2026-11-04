---
id: REQ-PRJ-007
title: Replay project creation for a repeated idempotency key
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-PRJ-005]
contracts: []
priority: should
---
# REQ-PRJ-007: Replay project creation for a repeated idempotency key

## Context
A client that loses the reply to a project create must be able to resend it without creating a second project or getting a duplicate-name error. The old system kept replies for 24 hours per key, but stored them under the key alone, so two users sending the same key overwrote each other's stored reply (PRJ BUG 14), and expired entries were never removed (DEAD 1).

## Requirements
1. Where a create request carries an `Idempotency-Key` header, the system shall look up a stored reply for that key and the calling user.
2. When an unexpired stored reply exists, the system shall return its status and body with headers `X-Idempotency-Hit: true` and `X-Idempotency-Created-At` set to when the reply was stored, without creating anything.
3. When no stored reply exists and the create succeeds with a 2xx status, the system shall store the status, the body and the created project id for that key and user for 24 hours.
4. The system shall not store non-2xx replies.
5. The system shall keep stored replies of different users separate even when the keys are equal.
6. If the key is longer than 255 characters, then the system shall respond 400 `{error: 'Invalid idempotency key'}`.
7. When a request has no key or an empty key, the system shall process it normally.
8. The system shall remove stored replies after they expire.
9. If the idempotency store fails, then the system shall process the request normally and log the failure.

## Acceptance criteria
- **AC-1**: Given U created project 12 with key K 10 minutes ago, When U resends with key K, Then the response is 201 with project 12, header `X-Idempotency-Hit: true`, and no new project exists. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-2**: Given U's reply for key K was stored 25 hours ago, When U resends with key K, Then the request is processed as new. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-3**: Given U's create with key K got 409, When U resends with key K, Then the request is processed again (no stored reply). <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-4**: Given U stored a reply for key K, When V sends key K, Then V's request is processed as new and U's stored reply is unchanged. <!-- source: areas/PRJ.md#bug -->
- **AC-5**: Given a key of 256 characters, When U creates, Then 400 `Invalid idempotency key`; Given 255 characters, Then the request proceeds. <!-- source: areas/PRJ.md#post-apiprojects -->

## Out of scope
- Idempotency for other endpoints.

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: one stored reply per successful keyed create.
- **Growth**: bounded by creates in 24 hours (at most 10 per user per hour, REQ-PRJ-006).
- **Largest tenant**: unknown.
- **Time window**: 24 hours retention.
- **Memory ceiling**: not relevant; stored in the data store.
- **Scale tests**: none needed beyond expiry removal.

## Edge cases and errors
- Two concurrent requests with the same key and user: see Open questions.
- Same key reused with a different body: see Open questions.

## Open questions
- Two concurrent requests with the same key: should the second wait, get 409, or run (old behaviour: both ran, the second usually hit the duplicate-name 409)?
- Should a reused key with a different request body be rejected (for example 422)?
- How often should expired entries be removed?
