---
id: REQ-USR-009
title: Account and role changes take effect on the next request
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-USR-009: Account and role changes take effect on the next request

## Context
When an administrator removes a role, changes a role's permissions or deletes a user, the change has to apply at once. In the old system it did not. One middleware trusted the role names copied into the token at login, so a change took effect only when the token expired (default 30 minutes). The other cached users for 300 seconds and permissions for 600 seconds, and no user or role change cleared those caches. A deleted user could keep working until the cache expired. The triage decision (F08) says role changes take effect immediately.

## Requirements
1. When a user's direct roles are replaced, the system shall use the new roles for that user's next request.
2. When a role's permissions are changed, the system shall use the new permissions for the next request of every user who holds the role.
3. When a role is deleted, the system shall stop granting its permissions from the next request.
4. When a user's user type or internal user flag changes, the system shall use the new values for that user's next request.
5. When a user is deleted, the system shall reject every later request carrying that user's access token with 401.
6. When a user is deleted, the system shall revoke all of that user's refresh tokens, so that they cannot be exchanged for new access tokens.
7. If roles, permissions or user records are cached, then the system shall invalidate the affected entries in the same operation that commits the change.

## Acceptance criteria
- **AC-1**: Given user 7 holds `Admin` and has an access token issued 1 minute ago, When an administrator removes `Admin` from user 7 and user 7 then requests the user list, Then the response is 403. <!-- source: areas/USR.md#security -->
- **AC-2**: Given role `Analyst` grants `mappings:write` and user 7 holds `Analyst`, When an administrator removes `mappings:write` from `Analyst` and user 7 then changes a mapping, Then the change is denied. <!-- source: areas/USR.md#security -->
- **AC-3**: Given user 7 is deleted while holding an unexpired access token, When user 7 sends any request with that token, Then the response is 401. <!-- source: areas/USR.md#security -->
- **AC-4**: Given user 7 is deleted while holding an unexpired refresh token, When the refresh token is exchanged, Then the exchange is refused. <!-- source: areas/USR.md#security -->
- **AC-5**: Given user 7 is granted role `Data Steward`, When user 7's next request lists data stewards, Then user 7 is in the list. <!-- source: areas/USR.md#data-touched -->

## Out of scope
- The single authentication middleware, token verification and the refresh flow (AUTH, F03).
- Effective role computation through access groups (GRP, D4).

## Non-functional requirements
- Propagation delay: 0 seconds after the change commits. This is measured by an integration test that changes roles and then immediately sends a request with the affected user's existing token.

## Data volume and performance
Not data-bearing: this is an invalidation rule. The cost is one lookup of current roles per request, or one cache invalidation per change.

## Edge cases and errors
- With several application instances, invalidation must reach every instance before the change is reported as successful, or the system must not cache at all.
- A request that is already running when the change commits may finish with the old roles. Only later requests are guaranteed to see the change.

## Open questions
- Should the system keep a per-request cache of roles and permissions at all, given D3 and the rule that tokens are verified against current database state?
