---
id: REQ-AUTH-006
title: Complete Okta sign-in only from a verified Okta ID token
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-AUTH-005, REQ-AUTH-007, REQ-AUTH-008, REQ-AUTH-010]
contracts: []
priority: must
---
# REQ-AUTH-006: Complete Okta sign-in only from a verified Okta ID token

## Context
In the old product the backend issued access tokens and 7-day refresh tokens to anyone who posted an Okta user id. It verified no Okta token (cross-cutting C1, critical). Triage F02 and D10 require the server to accept an SSO identity only from an ID token it has verified, after checking the state and PKCE. Okta sessions must also get refresh tokens; the old client dropped them.

## Requirements
1. When the browser returns from Okta with an authorisation code and a state, the system shall accept the return only if the state equals the unexpired, unused state bound to that browser (REQ-AUTH-005), and shall mark the binding used.
2. When the state is accepted, the system shall exchange the code at the configured issuer's token endpoint using the bound PKCE verifier and the configured client credentials.
3. The system shall accept the returned ID token only if its signature verifies against the issuer's published signing keys, its issuer equals the configured issuer, its audience contains the configured client id, it has not expired, and its nonce equals the bound nonce.
4. The system shall take the user's Okta id from the verified token's subject, and e-mail, name and preferred username only from verified claims or from Okta's user information service called with the access token obtained in requirement 2.
5. When the identity is verified, the system shall find or create the user (REQ-AUTH-007), record the sign-in time, issue an access token and a refresh token (REQ-AUTH-008, REQ-AUTH-010) and return the browser to the application signed in.
6. If the state check, the code exchange or any ID token check fails, or Okta returns an error, then the system shall issue no tokens, create or change no user, and return the browser to the sign-in page with the message "Okta sign-in failed. Please try again."
7. The system shall not accept a user identity supplied by the browser in any other form.

## Acceptance criteria
- **AC-1**: Given a valid Okta return with matching state and a correctly signed ID token, When the callback is processed, Then the user is signed in and exactly one refresh token is stored for that user. <!-- source: areas/AUTH.md#bug -->
- **AC-2**: Given a return whose state differs from the bound state, When it is processed, Then no tokens are issued, no user is created, and the browser lands on the sign-in page with "Okta sign-in failed. Please try again." <!-- source: areas/AUTH.md#security -->
- **AC-3**: Given a return that was already processed once, When the same code and state are submitted again, Then the second attempt is refused. <!-- source: areas/AUTH.md#security -->
- **AC-4**: Given an ID token signed with a key not published by the issuer, When it is checked, Then sign-in is refused. <!-- source: cross-cutting.md#critical -->
- **AC-5**: Given an ID token whose audience is a different client id, or whose expiry has passed, or whose nonce differs, When it is checked, Then sign-in is refused. <!-- source: cross-cutting.md#5-rules-that-apply-everywhere-for-the-rebuild -->
- **AC-6**: Given an unauthenticated request that posts only an Okta user id, e-mail and username (the old request shape), When it is sent to any operation, Then no tokens are returned and no user is created or changed. <!-- source: areas/AUTH.md#post-apiauthoktauser-serverjs10237 -->
- **AC-7**: Given Okta's token endpoint is unreachable, When the callback is processed, Then the browser lands on the sign-in page with the failure message and no session exists. <!-- source: areas/AUTH.md#post-apiauthoktauser-serverjs10237 -->

## Out of scope
- User creation and linking rules (REQ-AUTH-007).
- Okta sign-out (REQ-AUTH-012).

## Non-functional requirements
Issuer signing keys are cached and re-fetched when an unknown key id is seen. Allowed clock skew: see Open questions.

## Data volume and performance
Not data-bearing: one user lookup per sign-in.

## Edge cases and errors
- Okta returns an error parameter instead of a code (user cancelled): treated as failure (requirement 6).
- Key rotation at Okta: an unknown key id triggers one key refresh before refusal.
- Failure details are logged without the code, verifier or tokens (REQ-AUTH-021).

## Open questions
- Allowed clock skew when checking the ID token's expiry and issue time.
- Should the Okta ID token be kept server-side so that sign-out can pass it as a hint to Okta's end-session endpoint (REQ-AUTH-012)?
- Wording of the failure message, and whether to show the Okta error description to the user.
