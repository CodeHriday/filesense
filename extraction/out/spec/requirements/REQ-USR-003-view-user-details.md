---
id: REQ-USR-003
title: View one user's details as an administrator
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-USR-001]
contracts: []
priority: should
---
# REQ-USR-003: View one user's details as an administrator

## Context
Administrators need one user's full record to review or edit it. The old detail endpoint was already administrator-only. It passed a non-numeric id straight into the database query, so a bad id became a server error instead of a client error. The old UI edited from the list row, so whether a client still calls this endpoint is unconfirmed.

## Requirements
1. When an administrator requests a user by id, the system shall return that user's id, username, e-mail, first, middle, last and full name, phone number, address line 1, address line 2, city, state, postal code, country, auth provider, internal user flag, user type, vendor organisation id, created time, updated time, last login time, failed login attempts, lockout end time, forced password change flag, and the names of the user's directly assigned roles.
2. If the user has no roles, then the system shall return an empty role list.
3. If no user has the given id, then the system shall respond 404 with the message `User not found`.
4. If the id is not a positive integer, then the system shall respond 400.
5. The system shall never return the password hash, password history or Okta identifier.

## Acceptance criteria
- **AC-1**: Given user 7 with roles `User` and `Data Steward`, When an administrator requests user 7, Then the response is 200 and the roles are `User` and `Data Steward`. <!-- source: areas/USR.md#10-get-apiusersid -->
- **AC-2**: Given user 8 with no roles, When an administrator requests user 8, Then the roles value is an empty list. <!-- source: areas/USR.md#10-get-apiusersid -->
- **AC-3**: Given no user 9999, When an administrator requests user 9999, Then the response is 404 `User not found`. <!-- source: areas/USR.md#10-get-apiusersid -->
- **AC-4**: Given id `abc`, When an administrator requests it, Then the response is 400 and no database error text is returned. <!-- source: areas/USR.md#bug -->
- **AC-5**: Given a non-administrator, When they request user 7, Then the response is 403. <!-- source: areas/USR.md#10-get-apiusersid -->

## Out of scope
- Editing the user (REQ-USR-005, REQ-USR-006).
- A user viewing their own account (REQ-USR-020).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: single-record read.

## Edge cases and errors
- Id `0` and negative ids get 400.
- Very large numeric ids outside the integer range get 400, not 500.

## Open questions
- Does any client still use this view? The old UI built the edit form from the list row, and only coverage traces showed calls (USR open question 2).
