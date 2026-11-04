---
id: REQ-AUTH-001
title: Local sign-in with username or e-mail and password
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-004, REQ-AUTH-008, REQ-AUTH-010, REQ-AUTH-015, REQ-AUTH-022]
contracts: []
priority: must
---
# REQ-AUTH-001: Local sign-in with username or e-mail and password

## Context
Users whose auth provider is local start a session by entering a username or e-mail and a password. In the old product, sign-in by e-mail passed the password and lockout checks and then failed at the last step, the sign-in page posted every sign-in twice, and unexpected errors returned library text outside production. Triage F01 decided: one sign-in call, username or e-mail both work end to end, and users with a forced password change get a password-change token instead of an error (REQ-AUTH-004). Lockout is in REQ-AUTH-002 and rate limiting in REQ-AUTH-003.

## Requirements
1. When a sign-in request arrives with an identifier and a password, the system shall look up the single user whose username or e-mail equals the identifier.
2. If the identifier or the password is missing, empty or not a string, then the system shall reject the request with a validation error naming each invalid field, without looking up any user.
3. If no user matches the identifier, then the system shall reject the sign-in with the message "Invalid username or password".
4. If the matched user's auth provider is not local, then the system shall reject the sign-in without checking the password, stating that the account uses SSO, and shall return a flag that SSO sign-in is required and the provider name.
5. The system shall use the same matched user for the lockout check, the password check and token issue within one sign-in request.
6. When the password matches and the user has no forced password change, the system shall record the sign-in time once, issue an access token (REQ-AUTH-008) and a refresh token (REQ-AUTH-010), and return a user summary of id, username, e-mail, roles, internal user flag, user type and a forced-password-change flag set to false, together with the access token and its lifetime in seconds.
7. The system shall create exactly one refresh token per successful sign-in request.
8. The system shall never include the password hash, password history, failed sign-in count, lock time or Okta id in a sign-in response.
9. If an unexpected fault occurs, then the system shall respond with a server error carrying a generic message and an error code, and no exception text.

## Acceptance criteria
- **AC-1**: Given a local user with username "jdoe", e-mail "jdoe@example.com" and a correct password, When they sign in with identifier "jdoe@example.com", Then the response is 200 with user.username "jdoe", an access token and an access token lifetime in seconds. <!-- source: areas/AUTH.md#bug -->
- **AC-2**: Given the same user, When they sign in with identifier "jdoe", Then the response is 200 and the user's last sign-in time is updated exactly once. <!-- source: areas/AUTH.md#bug -->
- **AC-3**: Given no user has username or e-mail "nobody", When a sign-in is attempted with "nobody", Then the response is 401 with error "Invalid username or password" and no user's failed sign-in count changes. <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->
- **AC-4**: Given a user with auth provider "okta", When a sign-in is attempted with that username and any password, Then the response is 401 with error "This account uses OKTA SSO. Please use the SSO login button.", useSso true, ssoProvider "okta", and the failed sign-in count is unchanged. <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->
- **AC-5**: Given a request with username "jdoe" and no password, When it is submitted, Then the response is 400 with error "Validation Error" and an errors entry for field "password". <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->
- **AC-6**: Given a successful sign-in, When the stored refresh tokens for that user are counted, Then exactly one new refresh token exists for that sign-in. <!-- source: areas/AUTH.md#bug -->
- **AC-7**: Given a successful sign-in, When the response body is inspected, Then it contains none of the keys password, password_history, failed_login_attempts, locked_until or okta_id. <!-- source: areas/AUTH.md#security -->
- **AC-8**: Given the user store is unreachable, When a sign-in is attempted, Then the response is 500 with a generic message and an error code, and the body contains no exception text or stack. <!-- source: cross-cutting.md#5-rules-that-apply-everywhere-for-the-rebuild -->

## Out of scope
- Lockout counting and lock messages (REQ-AUTH-002).
- Rate limiting (REQ-AUTH-003).
- Forced password change at sign-in (REQ-AUTH-004).
- Okta sign-in (REQ-AUTH-005 to REQ-AUTH-007).

## Non-functional requirements
- Password comparison uses the hashing scheme of REQ-AUTH-015; no other credential comparison is performed per request.
- Response time budget: not stated in the old code; see Open questions.

## Data volume and performance
Not data-bearing: one user row read and updated per request.

## Edge cases and errors
- Identifier with leading or trailing spaces: matched as given (old behaviour); see Open questions.
- Identifier equal to one user's username and another user's e-mail: see Open questions.
- Unknown extra fields in the body are ignored.
- Two parallel sign-ins for the same user each succeed and each create one refresh token.

## Open questions
- Should the identifier be matched case-insensitively? The old sign-in matched exactly, while account creation rejects duplicates case-insensitively.
- Which user wins when the identifier is one user's username and another user's e-mail? The old code took whichever row the database returned first.
- The SSO message and the "N attempt(s) remaining" message (REQ-AUTH-002) reveal that an account exists and which provider it uses. Keep them, or return one uniform failure message?
- Maximum accepted length of identifier and password fields.
- Target response time for sign-in.
