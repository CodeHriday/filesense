---
id: REQ-USR-008
title: Administrator unlocks a user account
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-USR-001]
contracts: []
priority: must
---
# REQ-USR-008: Administrator unlocks a user account

## Context
After 5 failed logins, a local account is locked for 15 minutes (lockout, owned by AUTH). Administrators need to end a lockout early when the person is known to be legitimate. The old unlock cleared the failed attempts and the lockout and always set the forced password change flag, so the person must choose a new password at the next login. This shard keeps that behaviour and adds input validation.

## Requirements
1. When an administrator unlocks a user, the system shall set the user's failed login attempts to 0, clear the lockout end time, set the forced password change flag, and set the updated time.
2. The system shall apply the unlock whether or not the user is currently locked.
3. When the unlock succeeds, the system shall respond 200 with the message `User account unlocked successfully` and the user's id, username, e-mail, failed login attempts, lockout end time and forced password change flag.
4. If no user has the given id, then the system shall respond 404 `User not found`.
5. If the id is not a positive integer, then the system shall respond 400.

## Acceptance criteria
- **AC-1**: Given user 7 locked until 12 minutes from now with 5 failed attempts, When an administrator unlocks user 7, Then the response is 200, failed login attempts is 0, lockout end time is empty, and forced password change is true. <!-- source: areas/USR.md#12-post-apiusersidunlock -->
- **AC-2**: Given user 7 was unlocked, When user 7 then signs in with the correct password, Then the sign-in is not refused for lockout and user 7 is required to change the password. <!-- source: areas/USR.md#12-post-apiusersidunlock -->
- **AC-3**: Given user 8 is not locked and has 2 failed attempts, When an administrator unlocks user 8, Then the response is 200 and failed attempts is 0. <!-- source: areas/USR.md#12-post-apiusersidunlock -->
- **AC-4**: Given no user 9999, When an administrator unlocks 9999, Then the response is 404 `User not found`. <!-- source: areas/USR.md#12-post-apiusersidunlock -->
- **AC-5**: Given a non-administrator, When they unlock user 7, Then the response is 403 and user 7 stays locked. <!-- source: areas/USR.md#12-post-apiusersidunlock -->

## Out of scope
- Lockout thresholds and the forced password change flow at sign-in (AUTH, F01 and F06).
- Ending the user's existing sessions. The old unlock did not revoke sessions or refresh tokens.

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: single-record update.

## Edge cases and errors
- An unlock that races with a new failed login: the stored result is either the unlocked state or the new failure count, never a mix of the two.
- The lockout end time is compared in UTC (D11).

## Open questions
- Should unlocking set the forced password change flag even when the account was not locked (USR UNCLEAR-3)?
- Should unlock apply to Okta users, who never set a local password? Setting the forced password change flag on them may block their next sign-in.
