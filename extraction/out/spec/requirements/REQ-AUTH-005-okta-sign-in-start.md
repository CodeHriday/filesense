---
id: REQ-AUTH-005
title: Start Okta sign-in with random state, nonce and PKCE
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-AUTH-005: Start Okta sign-in with random state, nonce and PKCE

## Context
Users whose auth provider is okta sign in through Okta using OpenID Connect. In the old product the browser ran the authorisation-code flow alone. The OAuth state was the constant "xyz" and was never checked. The PKCE verifier was kept in script-readable storage, and the backend trusted whatever identity the browser sent (cross-cutting C1, H2). Triage F02 and decision D10 require the server to run the flow, with a random state and with PKCE checked server-side. This shard covers starting the flow; REQ-AUTH-006 covers the return.

## Requirements
1. When a browser asks to start Okta sign-in, the system shall generate a new random state, a new random nonce and a new PKCE verifier made from 64 random bytes.
2. The system shall bind the state, nonce and verifier to the requesting browser in a form that page scripts cannot read, valid for a limited time and for one use.
3. When the values are created, the system shall redirect the browser to the authorisation endpoint of the configured Okta issuer with response type code, the configured client id, the configured redirect address, scope "openid profile email", the state, the nonce and the S256 challenge of the verifier.
4. The system shall never send the PKCE verifier to the browser.
5. When the application is opened from an Okta-initiated sign-in (the issuer is given on the address), the system shall start the same flow as requirement 1, using only the configured issuer.
6. If Okta sign-in is not configured, then the system shall return the browser to the sign-in page with the message that SSO sign-in is unavailable, without redirecting to Okta.

## Acceptance criteria
- **AC-1**: Given Okta is configured, When Okta sign-in is started twice from the same browser, Then the two redirects carry different state and nonce values. <!-- source: areas/AUTH.md#security -->
- **AC-2**: Given a start request, When the redirect address is inspected, Then it targets the configured issuer's authorisation endpoint with scope "openid profile email", response_type "code" and code_challenge_method "S256". <!-- source: areas/AUTH.md#frontend-routes-and-hooks -->
- **AC-3**: Given a start request, When every response body, header and script-readable browser store is inspected, Then the PKCE verifier appears in none of them. <!-- source: areas/AUTH.md#security -->
- **AC-4**: Given the application is opened with an issuer parameter naming a different issuer than the configured one, When the flow starts, Then the redirect targets the configured issuer only. <!-- source: areas/AUTH.md#unclear -->
- **AC-5**: Given no Okta issuer or client id is configured, When Okta sign-in is started, Then the browser returns to the sign-in page with an "SSO sign-in is unavailable" message and no request is sent to Okta. <!-- source: areas/AUTH.md#frontend-routes-and-hooks -->

## Out of scope
- Handling the return from Okta (REQ-AUTH-006).
- The sign-in button and page (REQ-AUTH-024).

## Non-functional requirements
State, nonce and verifier come from a cryptographically secure random source.

## Data volume and performance
Not data-bearing: one short-lived binding per sign-in attempt.

## Edge cases and errors
- Several tabs start Okta sign-in at once: each attempt has its own binding; see Open questions.
- The binding expires before the user returns: the return is refused (REQ-AUTH-006).

## Open questions
- How long may the state binding live before the return is refused? The old code had no limit.
- Should parallel sign-in attempts from several tabs each be valid, or only the latest?
- Wording of the "SSO sign-in is unavailable" message.
- Is Okta-initiated sign-in (from the Okta dashboard tile) still required? It was the only way the old flow actually reached the PKCE redirect.
