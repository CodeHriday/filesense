---
id: REQ-AUTH-008
title: Access token issuance and signing secret
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-AUTH-008: Access token issuance and signing secret

## Context
Every signed-in request carries a short-lived access token. The old product read the token lifetime from configuration (default 30 minutes) but always reported 1800 seconds to the client. Okta tokens claimed internal user true regardless of the stored value. Production startup refused a missing or weak signing secret, and that rule is kept. Access, refresh and password-change tokens are told apart by an explicit type, so no token can be used in place of another (cross-cutting H2).

## Requirements
1. When a session starts or is refreshed, the system shall issue an access token signed with the server's signing secret, carrying the user id, username, e-mail, roles, internal user flag, user type and the token type "access".
2. The system shall take every claim in requirement 1 from the stored user at issue time.
3. The system shall set the access token lifetime from configuration, defaulting to 30 minutes.
4. The system shall report the access token lifetime in seconds to the client, equal to the configured lifetime.
5. The system shall mark refresh tokens and password-change tokens with their own token types, distinct from "access".
6. If the service starts in production and the signing secret is missing, shorter than 64 characters or contains a known weak word, then the system shall refuse to start and log the setting's name without its value.
7. Where the service runs outside production and no signing secret is configured, the system shall generate a random 64-byte secret at startup.
8. The system shall never return the signing secret in any response or write it to any log.

## Acceptance criteria
- **AC-1**: Given the lifetime is configured as 30 minutes, When a user signs in, Then the access token expires 1800 seconds after issue and the reported lifetime is 1800. <!-- source: areas/AUTH.md#summary -->
- **AC-2**: Given the lifetime is configured as 15 minutes, When a user signs in, Then the reported lifetime is 900 and the token expires 900 seconds after issue. <!-- source: areas/AUTH.md#summary -->
- **AC-3**: Given a stored user with internal user false and user type "Vendor", When an access token is issued, Then it carries internal user false and user type "Vendor". <!-- source: areas/AUTH.md#unclear -->
- **AC-4**: Given production mode and a 40-character signing secret, When the service starts, Then startup fails and the log names the setting but does not contain the secret. <!-- source: areas/AUTH.md#summary -->
- **AC-5**: Given production mode and no signing secret, When the service starts, Then startup fails. <!-- source: areas/AUTH.md#summary -->
- **AC-6**: Given a non-production mode and no signing secret, When the service starts, Then it starts and issues verifiable tokens. <!-- source: areas/AUTH.md#summary -->
- **AC-7**: Given any issued access token, When its type claim is read, Then it is "access"; a refresh token's type is "refresh". <!-- source: areas/AUTH.md#post-apiauthlogin-serverjs10417 -->

## Out of scope
- Checking tokens on requests (REQ-AUTH-009).
- Refresh tokens (REQ-AUTH-010).

## Non-functional requirements
Signing algorithm HMAC-SHA256 (as in the old product), unless Open questions decide otherwise.

## Data volume and performance
Not data-bearing: tokens are not stored.

## Edge cases and errors
- Outside production, a restart with a generated secret invalidates every outstanding token; users sign in again.
- Lifetime configuration that cannot be parsed: startup fails.

## Open questions
- Which words count as "weak" in the signing secret? The rule exists in the old configuration check, but the list is not recorded in the notes.
- Should password-change and reset tokens use a secret separate from access tokens?
- Should roles stay in the access token at all, given that REQ-AUTH-009 reads current roles from the store on every request?
