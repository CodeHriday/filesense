---
id: REQ-AUTH-004
title: Users with a forced password change receive a password-change token at sign-in
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-AUTH-001, REQ-AUTH-008, REQ-AUTH-022]
contracts: []
priority: must
---
# REQ-AUTH-004: Users with a forced password change receive a password-change token at sign-in

## Context
An administrator can require a user to set a new password at next sign-in (for example after an unlock, see USR). The old product had two flags for this. One crashed sign-in with a 500. The other was never reported at sign-in and only showed up after a page reload. Triage F01 and F06 decided on one forced-password-change flag: a flagged user who signs in correctly receives a short-lived password-change token and no session. They complete the change through REQ-AUTH-017.

## Requirements
1. When the password matches and the user's forced-password-change flag is set, the system shall reset the failed sign-in count, record the sign-in time, and respond with a password-change-required indicator, the user id, the username and a password-change token.
2. While the forced-password-change flag is set, the system shall not issue an access token or a refresh token at sign-in.
3. The system shall make the password-change token valid for 10 minutes from issue.
4. The system shall bind the password-change token to the one user and to the single purpose of completing a forced password change.
5. If the password does not match for a flagged user, then the system shall apply the normal failed sign-in handling (REQ-AUTH-002).

## Acceptance criteria
- **AC-1**: Given a local user with the forced-password-change flag set and a correct password, When they sign in, Then the response is 200 with requiresPasswordChange true, userId, username and passwordChangeToken, and no access token. <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->
- **AC-2**: Given the same sign-in, When the stored refresh tokens are counted, Then no refresh token was created. <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->
- **AC-3**: Given a password-change token issued at 10:00:00, When it is used at 10:10:01, Then it is rejected as expired. <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->
- **AC-4**: Given a password-change token, When it is sent as the bearer token to the current-user operation (REQ-AUTH-013), Then the response is 401. <!-- source: areas/AUTH.md#post-apiuserschange-password-required-usermanagementjs84 -->
- **AC-5**: Given a flagged user with failed count 3, When they sign in with the correct password, Then the failed count is 0 and the response is the password-change-required response, not 500. <!-- source: areas/AUTH.md#bug -->
- **AC-6**: Given a flagged user with failed count 4, When they use a wrong password, Then the response is 403 locked with remainingTime 15 and no password-change token. <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->

## Out of scope
- Setting the flag (administrator unlock and user administration in USR).
- Completing the change (REQ-AUTH-017).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: no stored row per token.

## Edge cases and errors
- The flag is cleared by another path (reset link) while a password-change token is outstanding: the token can still be used until it expires or is used; see REQ-AUTH-017.
- The flag is set on an SSO user: SSO users are refused at local sign-in before this check (REQ-AUTH-001).

## Open questions
- If an administrator sets the flag while the user has an active session, should the next refresh be refused so the user must change the password now? The old flag only took effect at next sign-in or page load.
