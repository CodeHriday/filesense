---
id: REQ-AUTH-007
title: Create or link the user on Okta sign-in
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-AUTH-022]
contracts: []
priority: must
---
# REQ-AUTH-007: Create or link the user on Okta sign-in

## Context
The first Okta sign-in of a person creates their user. Later sign-ins find that user by Okta id. The old product gave new users a random local password hash. Its default role query could return either "User" or "Executor" because it had no ordering (UNC-1). Its tokens claimed internal user true while the stored value was false (UNC-4). This shard keeps the find-or-create behaviour. The default role becomes deterministic, and SSO users get no usable local password. Runs only after REQ-AUTH-006 has verified the identity.

## Requirements
1. When a verified Okta identity arrives and a user with that Okta id exists, the system shall use that user.
2. The system shall not change an existing user's username, e-mail or name on Okta sign-in.
3. When no user has that Okta id, the system shall create a user with auth provider okta, the Okta id, username equal to the preferred username or, if absent, the e-mail, the e-mail and the full name from the verified identity.
4. The system shall store no usable local password for a user created through Okta.
5. When it creates a user through Okta, the system shall assign exactly one configured default role.
6. The system shall create the user and the default role assignment in one transaction.
7. If the new user's username or e-mail equals that of an existing user, then the system shall refuse the sign-in, create nothing, change nothing, and record the conflict in the audit log (REQ-AUTH-021).
8. The system shall take the internal user flag and user type placed in tokens from the stored user, never from a default.

## Acceptance criteria
- **AC-1**: Given no user has Okta id "00u1abc", When a verified identity with subject "00u1abc", preferred username "alice@corp.example" and e-mail "alice@corp.example" signs in, Then a user is created with auth provider "okta", username "alice@corp.example" and exactly one role, the configured default role. <!-- source: areas/AUTH.md#post-apiauthoktauser-serverjs10237 -->
- **AC-2**: Given a verified identity with no preferred username and e-mail "bob@corp.example", When a new user is created, Then its username is "bob@corp.example". <!-- source: areas/AUTH.md#post-apiauthoktauser-serverjs10237 -->
- **AC-3**: Given an existing user with Okta id "00u1abc" and e-mail "alice@corp.example", When the same subject signs in with e-mail "alice.new@corp.example", Then the same user id is used and the stored e-mail is still "alice@corp.example". <!-- source: areas/AUTH.md#post-apiauthoktauser-serverjs10237 -->
- **AC-4**: Given a user created through Okta, When a local sign-in is attempted with any password, Then it is refused as an SSO account (REQ-AUTH-001). <!-- source: areas/AUTH.md#post-apiauthoktauser-serverjs10237 -->
- **AC-5**: Given a local user with e-mail "carol@corp.example" and no Okta id, When a new Okta subject with e-mail "carol@corp.example" signs in, Then sign-in is refused, no user is created and the local user is unchanged. <!-- source: areas/AUTH.md#open-questions -->
- **AC-6**: Given a stored user created through Okta with internal user false, When an access token is issued, Then it carries internal user false. <!-- source: areas/AUTH.md#unclear -->
- **AC-7**: Given the default role assignment fails, When a new Okta user is being created, Then no user row remains. <!-- source: areas/AUTH.md#post-apiauthoktauser-serverjs10237 -->

## Out of scope
- Verifying the identity (REQ-AUTH-006).
- Role administration and group roles (USR, GRP).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: at most one user and one role assignment created per sign-in.

## Edge cases and errors
- Two first sign-ins of the same new subject at the same time: exactly one user is created; the other attempt uses it or fails cleanly (unique Okta id).
- Configured default role does not exist: see Open questions.

## Open questions
- Which role is the default for new Okta users: "User" or "Executor"? The old query could return either.
- What should happen if the configured default role does not exist? The old code created the user with no role.
- How should an Okta identity be linked to an existing local account with the same e-mail? Refusing is the safe default; an administrator-driven link may be needed.
- Should name and e-mail be updated from Okta on each sign-in? The old code never updated them.
- What internal user flag and user type should new Okta users get? The stored default is false; the old token claimed true.
