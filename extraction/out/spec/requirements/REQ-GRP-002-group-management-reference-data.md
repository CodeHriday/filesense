---
id: REQ-GRP-002
title: Provide users, roles and top-level projects for access group management
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-GRP-001]
contracts: []
priority: must
---
# REQ-GRP-002: Provide users, roles and top-level projects for access group management

## Context
To create or edit an access group, an administrator picks members from the users, group roles from the roles, and an optional project scope from the top-level projects. Today one call returns these choices, together with the group list, to any authenticated user, and it includes up to 1000 users with their e-mail addresses (security finding M6). The rebuild returns them to administrators only and limits the user fields to what the pickers need.

## Requirements
1. When an administrator opens access group management, the system shall return the selectable users, the roles and the top-level projects in one response.
2. The system shall return, for each user, only the id, username, full name, internal-user flag and user type.
3. The system shall order users by username.
4. The system shall return, for each role, its id, name and description.
5. The system shall return only projects that have no parent project, each with its id and name.
6. If the caller is not authenticated, then the system shall reject the request with 401.
7. If the caller is not an Administrator, then the system shall reject the request with 403.

## Acceptance criteria
- **AC-1**: Given users "zoe", "adam" and "mia", When an administrator requests the group management reference data, Then the users come back in the order adam, mia, zoe. <!-- source: areas/GRP.md#get-apigroupsinit-data-grouproutesjs110 -->
- **AC-2**: Given a top-level project "Claims" and its sub-project "Claims-EU", When an administrator requests the reference data, Then "Claims" is in the project choices and "Claims-EU" is not. <!-- source: areas/GRP.md#get-apigroupsinit-data-grouproutesjs110 -->
- **AC-3**: Given a vendor user with internal-user flag false and user type Vendor, When an administrator requests the reference data, Then that user is returned with internal-user false and user type Vendor. <!-- source: areas/GRP.md#frontend-group-management-srcpagesgroupmanagementjsx-appjsx448 -->
- **AC-4**: Given any user, When the reference data is returned, Then no user entry contains a password hash, password history, lockout state or e-mail address. <!-- source: cross-cutting.md#medium -->
- **AC-5**: Given an authenticated user without the Admin role, When the reference data is requested, Then the response is 403 and no user data is returned. <!-- source: areas/GRP.md#security -->
- **AC-6**: Given a request with no access token, When the reference data is requested, Then the response is 401. <!-- source: areas/GRP.md#entry-points -->

## Out of scope
- The access group list itself (REQ-GRP-001). The screen may request both at the same time.
- User administration and role administration.

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: every selectable user, every role and every top-level project. The old code capped users at 1000.
- **Growth**: grows with the user directory.
- **Largest tenant**: unknown (see Open questions).
- **Time window**: interactive request when the screen opens.
- **Memory ceiling**: bounded by the user cap or by a server-side search (see Open questions).
- **Scale tests**: reference data with the largest known user count.

## Edge cases and errors
- With no roles or no top-level projects, the matching list is empty and the request still succeeds.
- Database failure gives 500 with a safe message.

## Open questions
- The old code returned at most 1000 users, so any further users could not be picked. Should the member picker use a server-side user search instead of a capped list, and if a cap stays, what should it be?
- Does the member picker need e-mail addresses to tell users with the same full name apart? This spec leaves them out (M6).
- Should inactive or locked users be offered as members?
