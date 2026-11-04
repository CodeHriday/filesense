---
id: REQ-AUTH-002
title: Failed sign-in counting and temporary lockout
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-AUTH-022]
contracts: []
priority: must
---
# REQ-AUTH-002: Failed sign-in counting and temporary lockout

## Context
Local accounts must resist password guessing. The old product counted failed sign-ins per user and locked the account for 15 minutes after 5 failures; this is kept. Two corrections: the reply at the moment of locking now also carries the remaining minutes (the old one omitted them), and the counter update is atomic so parallel attempts cannot lose increments. Lock times are compared in UTC from one clock (D11). Unlocking by an administrator belongs to user administration (USR).

## Requirements
1. While a user's lock time is in the future, the system shall refuse every sign-in for that user with a locked response carrying the remaining lock time in whole minutes rounded up, without checking the password and without changing the failed sign-in count.
2. When a sign-in is attempted for a user whose lock time has passed, the system shall reset the failed sign-in count to 0 and clear the lock time before checking the password.
3. If the password does not match, then the system shall increase the user's failed sign-in count by 1.
4. When the failed sign-in count reaches 5, the system shall set the lock time to 15 minutes after the current time and respond that the account is locked, with remaining time 15 minutes.
5. If the password does not match and the failed sign-in count is below 5 after the increase, then the system shall reject the sign-in with "Invalid username or password. N attempt(s) remaining before account lockout.", where N is 5 minus the count.
6. When the password matches, the system shall reset the failed sign-in count to 0 and clear the lock time.
7. The system shall apply each increase of the failed sign-in count atomically, so that concurrent failed attempts are all counted.
8. The system shall store and compare lock times in UTC using the database clock.

## Acceptance criteria
- **AC-1**: Given a local user with failed count 0, When a sign-in with a wrong password is attempted, Then the response is 401 with error "Invalid username or password. 4 attempt(s) remaining before account lockout." and the count is 1. <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->
- **AC-2**: Given failed count 3, When a wrong password is used, Then the response is 401 with "... 1 attempt(s) remaining before account lockout." and the count is 4. <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->
- **AC-3**: Given failed count 4, When a wrong password is used, Then the response is 403 with locked true, remainingTime 15, a message that the account is locked and to try again in 15 minutes, and the lock time is 15 minutes after now. <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->
- **AC-4**: Given the lock time is 7 minutes 30 seconds in the future, When the correct password is used, Then the response is 403 with locked true and remainingTime 8, and the failed count is unchanged. <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->
- **AC-5**: Given the lock time passed 1 second ago and the count is 5, When the correct password is used, Then the sign-in succeeds and the count is 0 with no lock time. <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->
- **AC-6**: Given the lock time passed 1 second ago, When a wrong password is used, Then the response is 401 with "... 4 attempt(s) remaining ..." and the count is 1. <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->
- **AC-7**: Given failed count 2, When the correct password is used, Then the sign-in succeeds and the count is 0. <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->
- **AC-8**: Given failed count 3, When two wrong-password attempts arrive at the same time, Then the final count is 5 and the account is locked. <!-- source: areas/AUTH.md#data-touched -->

## Out of scope
- Administrator unlock (USR).
- Clearing the lock through a password reset link (REQ-AUTH-019).
- Per-IP rate limiting (REQ-AUTH-003).

## Non-functional requirements
Threshold 5 failures and lock duration 15 minutes, as published by REQ-AUTH-014. Measured by the criteria above.

## Data volume and performance
Not data-bearing: one user row updated per failed attempt.

## Edge cases and errors
- Remaining time of exactly 15 minutes 0 seconds reports 15; 14 minutes 1 second reports 15; 1 second reports 1.
- SSO accounts are refused before the lockout logic runs (REQ-AUTH-001) and are never counted.
- Unknown identifiers change no counter.
- Clock: application server and database clocks may differ; only the database clock is used.

## Open questions
- Should a wrong current password on voluntary or forced password change (REQ-AUTH-016, REQ-AUTH-017) count toward lockout? The old handlers did not count it.
- Should an active session be ended when the account becomes locked? The global rule says tokens are checked against "not locked", which lets someone who knows a username end that user's sessions by guessing wrong 5 times (REQ-AUTH-009).
- Should the 5 and 15 values be configurable or fixed? They were constants in the old code.
