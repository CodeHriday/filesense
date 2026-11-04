---
id: REQ-AUTH-003
title: Rate limit on sign-in and forgot-password requests
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-AUTH-003: Rate limit on sign-in and forgot-password requests

## Context
Per-IP limits slow down password guessing and reset-link flooding across many accounts. The old product allowed 5 counted requests per IP per 15 minutes on sign-in and reset requests, skipping successful ones. Because the reset request now always returns the same success reply (REQ-AUTH-018), skipping successes would mean it is never limited, so every reset request is counted. The old limits were kept in process memory per instance (cross-cutting H11); they are now shared across instances.

## Requirements
1. The system shall allow at most 5 counted sign-in requests per client IP address in a 15-minute window.
2. The system shall not count a sign-in request that succeeds, including one that returns a password-change token.
3. The system shall count every forgot-password request (REQ-AUTH-018), whatever its outcome, against a separate limit of 5 per client IP address in a 15-minute window.
4. If a client exceeds a limit, then the system shall reject the request with status 429 and the error "Too many authentication attempts, please try again later" without processing it.
5. The system shall take the client IP address from the first trusted proxy hop.
6. The system shall share the counters across all running instances.

## Acceptance criteria
- **AC-1**: Given 5 failed sign-ins from 203.0.113.7 within 15 minutes, When a 6th sign-in arrives from that address, Then the response is 429 with error "Too many authentication attempts, please try again later" and no password is checked. <!-- source: areas/AUTH.md#summary -->
- **AC-2**: Given 4 failed and 3 successful sign-ins from one address within 15 minutes, When a 5th failed sign-in arrives, Then it is processed normally (401), and the next sign-in is rejected with 429. <!-- source: areas/AUTH.md#summary -->
- **AC-3**: Given 5 failed sign-ins from 203.0.113.7, When a sign-in arrives from 198.51.100.4, Then it is processed normally. <!-- source: areas/AUTH.md#summary -->
- **AC-4**: Given 5 forgot-password requests from one address, all answered 200, When a 6th arrives within 15 minutes, Then the response is 429. <!-- source: areas/AUTH.md#security -->
- **AC-5**: Given 5 failed sign-ins spread over two instances behind the same load balancer, When a 6th arrives at either instance, Then the response is 429. <!-- source: cross-cutting.md#high -->
- **AC-6**: Given the 15-minute window that held 5 failed sign-ins has ended, When a new sign-in arrives, Then it is processed normally. <!-- source: areas/AUTH.md#summary -->

## Out of scope
- The general per-IP API limit (platform area).
- Per-account lockout (REQ-AUTH-002).

## Non-functional requirements
Limit 5 per 15 minutes per IP per operation; counter store shared across instances. Verified by a two-instance test (AC-5).

## Data volume and performance
Not data-bearing: one short-lived counter per client address and operation.

## Edge cases and errors
- Counter store unavailable: see Open questions.
- Many users behind one corporate proxy share one address and one limit.
- A forged X-Forwarded-For header beyond the first trusted hop is ignored.

## Open questions
- If the shared counter store is unavailable, should the limit fail closed (reject) or fail open?
- Should reset-link completion (REQ-AUTH-019), forced password change (REQ-AUTH-017) and voluntary password change (REQ-AUTH-016) also be rate limited? The old code limited none of them.
- Is a fixed or sliding 15-minute window intended? The old limiter used a fixed window.
