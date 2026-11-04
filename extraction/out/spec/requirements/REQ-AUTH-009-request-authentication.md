---
id: REQ-AUTH-009
title: One authentication check for API requests
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-AUTH-008]
contracts: []
priority: must
---
# REQ-AUTH-009: One authentication check for API requests

## Context
Every protected operation must know who is calling, using current account state. The old product had two token checks. One accepted 7-day refresh tokens as bearer tokens and trusted token claims without looking at the user. The other cached permissions for 10 minutes, and nothing cleared that cache when roles changed (cross-cutting H2, H6, X4). Triage F03 decided on one check that accepts access tokens only. The global rules require tokens to be checked against current state. Permission checks themselves belong to the permission model (GRP, USR); this shard only provides the authenticated user.

## Requirements
1. The system shall apply one authentication check to every API operation except the public ones: sign-in, Okta sign-in start and return, refresh, sign-out, forgot-password request, reset-link completion, forced password change completion, published password requirements, liveness and readiness.
2. The system shall accept only an access token presented as a bearer token in the authorisation header.
3. If the token is missing, malformed, wrongly signed or of a type other than "access", then the system shall reject the request with 401.
4. If the access token has expired, then the system shall reject the request with 401 and the error code TOKEN_EXPIRED.
5. When the token is valid, the system shall load the user by id from current stored state and shall reject the request with 401 if the user no longer exists or is locked.
6. The system shall give the operation the user's current roles and permissions from stored state, not from token claims.
7. When a user's roles, group membership or role permissions change, the system shall apply the change from that user's next request.
8. The system shall use 401 only for authentication failures and 403 only for permission denials.

## Acceptance criteria
- **AC-1**: Given a valid refresh token, When it is sent as the bearer token to any protected operation, Then the response is 401. <!-- source: areas/AUTH.md#security -->
- **AC-2**: Given a valid password-change token, When it is sent as the bearer token, Then the response is 401. <!-- source: areas/AUTH.md#post-apiuserschange-password-required-usermanagementjs84 -->
- **AC-3**: Given an access token that expired 1 second ago, When it is used, Then the response is 401 with code TOKEN_EXPIRED. <!-- source: areas/AUTH.md#duplicate -->
- **AC-4**: Given a valid access token whose user has been deleted, When it is used, Then the response is 401. <!-- source: cross-cutting.md#5-rules-that-apply-everywhere-for-the-rebuild -->
- **AC-5**: Given a user whose role granting "users:read" is removed, When their next request needs "users:read", Then the response is 403, without waiting for token expiry or a cache lifetime. <!-- source: cross-cutting.md#3-cross-cutting-defects-non-security -->
- **AC-6**: Given no authorisation header, When a protected operation is called, Then the response is 401; When the published password requirements are read, Then the response is 200. <!-- source: areas/AUTH.md#get-apiauthpassword-requirements-serverjs10502 -->
- **AC-7**: Given a token signed with a different secret, When it is used, Then the response is 401. <!-- source: areas/AUTH.md#duplicate -->

## Out of scope
- Which permission each operation requires, and the administrator definition (D3; GRP, USR).
- API tokens for machine clients (API area).

## Non-functional requirements
The per-request user and permission lookup must fit the API latency budget; the budget is an open question.

## Data volume and performance
- **Volume per run**: one user and permission lookup per API request.
- **Growth**: proportional to request rate.
- **Largest tenant**: unknown; see Open questions.
- **Time window**: every request.
- **Memory ceiling**: any cache must be bounded; size unknown.
- **Scale tests**: request rate at peak; unknown.

## Edge cases and errors
- Token with a future issue time beyond allowed skew: rejected.
- Store unavailable during the check: 503, not 401, so the client does not try to refresh.
- A cached lookup must be dropped when roles, groups or the lock state change.

## Open questions
- Peak request rate and latency budget for the per-request lookup; whether a cache is needed and how it is invalidated.
- Should a locked user (REQ-AUTH-002) lose active sessions immediately? That is what the global rule implies, but it lets an attacker end a user's session by failing sign-in 5 times.
- Is a status of 503 acceptable when the store is unavailable during the check?
