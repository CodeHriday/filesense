---
id: REQ-USR-001
title: User and role administration is restricted to administrators
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-USR-001: User and role administration is restricted to administrators

## Context
User and role administration decides who can do what in the product, so only administrators may use it. In the old system the role create, update and delete checks were commented out, so any signed-in user could edit the Admin role's permissions. The user routes trusted role names copied into the token at login, and the "create user" form used an unauthenticated self-registration path. The triage decisions (F08, F11) make these actions administrator-only. Decision D3 defines an administrator as a holder of the Admin role, checked by one server-side predicate.

## Requirements
1. The system shall allow only administrators to list users for administration, view a user's details, create users, edit users, assign roles to users, unlock users, list a user's dependencies, list eligible replacement users, transfer ownership, and delete users one at a time or in bulk.
2. The system shall allow only administrators to list roles for administration, view a role, read the permission catalog, create roles, update roles, and delete roles one at a time or in bulk.
3. The system shall decide whether a caller is an administrator with the single administrator check: the caller holds the Admin role.
4. The system shall evaluate the administrator check against the caller's roles as stored at the time of the request, not against roles copied into the access token.
5. The system shall not treat any permission string (including `users:write`, `roles:write`, `project_management:write` or `all_projects:read`) as making a caller an administrator.
6. If a request to an administration operation carries no valid access token, then the system shall respond 401 and perform no action.
7. If a request to an administration operation carries a refresh token instead of an access token, then the system shall respond 401 and perform no action.
8. If an authenticated caller who is not an administrator calls an administration operation, then the system shall respond 403, return no user or role data, and change nothing.

## Acceptance criteria
- **AC-1**: Given a signed-in user whose only role is `User`, When they create a role named `Escalate` with permission `users:write`, Then the response is 403 and no role named `Escalate` exists. <!-- source: areas/USR.md#security -->
- **AC-2**: Given a signed-in user whose role grants `users:write` and `roles:write` but who does not hold the Admin role, When they request the user list for administration, Then the response is 403. <!-- source: areas/USR.md#duplicate -->
- **AC-3**: Given an administrator whose Admin role was removed by another administrator, When they request the user list one second later with the same unexpired access token, Then the response is 403. <!-- source: areas/USR.md#security -->
- **AC-4**: Given a request with no Authorization header, When it calls delete user 42, Then the response is 401 and user 42 still exists. <!-- source: areas/USR.md#17-delete-apiusersid -->
- **AC-5**: Given a valid, unexpired refresh token sent as the bearer token, When it calls the user list, Then the response is 401. <!-- source: areas/USR.md#security -->
- **AC-6**: Given a signed-in holder of the Admin role, When they request the user list, Then the response is 200. <!-- source: areas/USR.md#1-get-apiusers-usermanagement-router-this-is-the-live-handler -->
- **AC-7**: Given a signed-in user without the Admin role, When they update the Admin role's permissions, Then the response is 403 and the Admin role's permissions are unchanged. <!-- source: areas/USR.md#24-put-apirolesid-update-role -->

## Out of scope
- How access tokens are issued, verified and refreshed (AUTH, F03).
- How effective roles and permissions are computed from direct and group roles (AUTH and GRP).
- Project-level permissions and project membership (PRJ).
- Lookups that any signed-in user may call (REQ-USR-016 to REQ-USR-018).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: this is an authorization rule applied per request.

## Edge cases and errors
- An expired access token gets 401, not 403.
- A user deleted while holding a valid access token gets 401 on the next request (see REQ-USR-009).
- 401 and 403 bodies carry a code and a safe message only. They never say which role or permission was missing.

## Open questions
- D3 says `users:write` and `roles:write` "grant only their own actions", while triage F08 and F11 say "admin-only". This shard follows the triage decision. Should holders of `users:write` or `roles:write` also be allowed to perform user or role administration?
- Does the Admin role count when it comes from an access group's group role rather than a direct assignment? D3 says "holder of the Admin role" without saying whether direct or effective.
