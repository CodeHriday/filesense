---
id: REQ-PRJ-006
title: Rate-limit project creation per user
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-PRJ-005, REQ-PRJ-007]
contracts: []
priority: should
---
# REQ-PRJ-006: Rate-limit project creation per user

## Context
Project creation was limited to 3 per minute and 10 per hour per user to stop runaway or scripted creation. The old limits were kept in each server's memory, so several instances multiplied them; the `retryAfter` value was an epoch timestamp instead of a wait time (PRJ BUG 11); and a retried request with the same idempotency key counted against the limits and could get 429 instead of its stored reply (UNCLEAR 6).

## Requirements
1. The system shall allow each user at most 3 project create attempts per 60 seconds.
2. The system shall allow each user at most 10 project create attempts per 3,600 seconds.
3. The system shall count attempts across all server instances.
4. When the per-minute limit is exceeded, the system shall respond 429 `{error: 'Rate limit exceeded', message: 'Too many project creations. Maximum 3 per minute. Please slow down.', retryAfter}`.
5. When the per-hour limit is exceeded, the system shall respond 429 `{error: 'Rate limit exceeded', message: 'You can only create 10 projects per hour. Please try again later.', retryAfter}`.
6. The system shall set `retryAfter` to the whole number of seconds until the window resets, at least 1.
7. When a request is answered from the idempotency store (REQ-PRJ-007), the system shall not count it against either limit.
8. When a request is refused by a limit, the system shall record a rate-limited audit entry (REQ-PRJ-008).

## Acceptance criteria
- **AC-1**: Given U made 3 create attempts in the last 60 seconds, When U makes a 4th, Then the response is 429 with the per-minute message. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-2**: Given U made 10 create attempts in the current hour, spaced so the per-minute limit is not hit, When U makes an 11th, Then the response is 429 with the per-hour message. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-3**: Given the per-minute window resets in 42 seconds, When U is refused, Then `retryAfter` is 42. <!-- source: areas/PRJ.md#bug -->
- **AC-4**: Given U made 2 attempts on instance A and 1 on instance B within 60 seconds, When U makes another on either instance, Then the response is 429. <!-- source: cross-cutting.md#2-security-findings-ranked -->
- **AC-5**: Given U is at the per-minute limit, When user V creates a project, Then V is not refused. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-6**: Given U is at the per-minute limit and resends a create with an idempotency key whose 201 reply is stored, When the request arrives, Then the stored 201 is returned, not 429. <!-- source: areas/PRJ.md#unclear -->

## Out of scope
- Global request rate limiting (SEC/PLT areas).

## Non-functional requirements
- Limit counters must survive the restart of one instance (shared store).

## Data volume and performance
Not data-bearing: one counter pair per user.

## Edge cases and errors
- Attempts rejected with 400 or 409 still count as attempts (old behaviour counted every request that reached the limiter).
- Shared counter store unavailable: see Open questions.

## Open questions
- If the shared counter store is unavailable, should creation be refused (fail closed) or allowed?
- Fixed windows (old behaviour) or sliding windows?
- Should the response also carry a standard `Retry-After` header?
