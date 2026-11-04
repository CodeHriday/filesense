---
id: REQ-USR-004
title: Administrator creates a local user
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-USR-001, REQ-USR-019]
contracts: []
priority: must
---
# REQ-USR-004: Administrator creates a local user

## Context
Administrators create accounts for people who sign in with a username and password. In the old system the "Create user" form called the unauthenticated self-registration endpoint, and that endpoint assigned any role named in the request body, Admin included (critical finding C2). The triage decision (F08) replaces this with an administrator-only create operation. The rules below are the old server and form rules, enforced on the server. Two corrections are made: unknown roles are rejected instead of silently skipped, and one password-hashing cost is used.

## Requirements
1. When an administrator submits a new user with valid input, the system shall create the user with auth provider `local` and failed login attempts 0, and assign the given roles, in one transaction.
2. The system shall require a username of 3 to 50 characters.
3. If another user already has the same username, compared without regard to case, then the system shall respond 409 and create nothing.
4. The system shall require an e-mail address that matches `^[^\s@]+@[^\s@]+\.[^\s@]+$`.
5. If another user already has the same e-mail, compared without regard to case, then the system shall respond 409 and create nothing.
6. The system shall require a password of at least 12 characters, with at least one uppercase letter, one lowercase letter, one digit, and one special character from `!@#$%^&*()_+-=[]{}|;:,.<>?`.
7. If the password fails any strength rule, then the system shall respond 400 listing every failed rule and create nothing.
8. If a phone number is given, then the system shall require it to contain only digits and to be at most 10 digits long.
9. The system shall accept first, middle and last names of at most 100 characters each.
10. The system shall accept user type `FTE`, `Consultant` or `Vendor`.
11. The system shall set the internal user flag to true for user types `FTE` and `Consultant` and to false for user type `Vendor`.
12. The system shall require at least one role, given as role ids.
13. If any given role id does not exist, then the system shall respond 400 listing the unknown ids and create nothing.
14. The system shall store the password only as a hash with the configured password-hashing cost (default 12) and record that hash as the first entry of the user's password history.
15. The system shall not write the password, or the request body that contains it, to any log or audit record.
16. When the user is created, the system shall respond 201 with the user's details as in REQ-USR-003, without the password hash.

## Acceptance criteria
- **AC-1**: Given an administrator, When they create `jdoe`, `jdoe@example.com`, password `Str0ng!Passw0rd`, type `FTE` and role `User`, Then the response is 201, the user has auth provider `local`, internal user true, failed login attempts 0, and role `User`. <!-- source: areas/USR.md#26-fe-users---usermanagement-page -->
- **AC-2**: Given an existing user `JDoe`, When an administrator creates `jdoe`, Then the response is 409 and no user is created. <!-- source: areas/USR.md#26-fe-users---usermanagement-page -->
- **AC-3**: Given an existing e-mail `Ann@Example.com`, When an administrator creates a user with `ann@example.com`, Then the response is 409. <!-- source: areas/USR.md#26-fe-users---usermanagement-page -->
- **AC-4**: Given username `ab` (2 characters), When submitted, Then the response is 400. Given a username of 50 characters, When submitted with otherwise valid input, Then the response is 201. Given 51 characters, Then the response is 400. <!-- source: areas/USR.md#26-fe-users---usermanagement-page -->
- **AC-5**: Given password `Short1!aA` (9 characters), When submitted, Then the response is 400 and lists the minimum-length rule. Given `abcdefghijk1!` (no uppercase), Then the response is 400 and lists the uppercase rule. <!-- source: areas/USR.md#11-put-apiusersid-admin-edit-user -->
- **AC-6**: Given phone `555-123-4567`, When submitted, Then the response is 400 for the phone number. Given phone `55512345678` (11 digits), Then the response is 400. Given phone `5551234567` (10 digits), Then it is accepted. <!-- source: areas/USR.md#9-put-apiusersprofile -->
- **AC-7**: Given e-mail `jdoe@example`, When submitted, Then the response is 400. <!-- source: areas/USR.md#26-fe-users---usermanagement-page -->
- **AC-8**: Given roles `[3, 9999]` where 9999 does not exist, When submitted, Then the response is 400 naming 9999 and no user is created. <!-- source: areas/USR.md#26-fe-users---usermanagement-page -->
- **AC-9**: Given an empty role list, When submitted, Then the response is 400. <!-- source: areas/USR.md#26-fe-users---usermanagement-page -->
- **AC-10**: Given user type `Vendor` and internal user flag true in the request, When submitted, Then the created user has internal user false. <!-- source: areas/USR.md#unclear -->
- **AC-11**: Given a successful create, When the application logs and audit records are inspected, Then neither contains the submitted password. <!-- source: areas/USR.md#security -->
- **AC-12**: Given a caller who is not signed in, When they submit the create request with role `Admin`, Then the response is 401 and no user is created. <!-- source: areas/USR.md#security -->

## Out of scope
- Self-registration (AUTH). The create path never goes through it.
- Okta users, who are created at SSO sign-in (AUTH, F02).
- Vendor contacts linked to a vendor organisation (VND, F58).
- Password policy constants beyond what is listed here (AUTH, F06).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: one user per request.

## Edge cases and errors
- Leading and trailing spaces in username and e-mail are trimmed before validation and uniqueness checks.
- Two concurrent creates with the same username: one succeeds, the other gets 409 (enforced by the unique index on lower-cased username).
- If the role assignment fails after the user insert, nothing is kept.
- Validation errors carry a code and a field name. Database error text is never returned.

## Open questions
- D10 removes temporary passwords and F58 invites vendor contacts by e-mail. Should admin-created local users also get a one-time set-password link instead of an administrator-chosen password?
- Should admin-created users have the forced password change flag set, so they choose their own password at first login? The old create path did not set it.
- Is user type required on create? The old server accepted none.
- Glossary defines internal users as FTE or Consultant, and requirement 11 derives the flag from that. The old UI let the administrator tick "Internal User" independently, and it defaulted to false. Confirm the derived rule.
- Should the `Viewer` role be assignable here? The old form hid it.
