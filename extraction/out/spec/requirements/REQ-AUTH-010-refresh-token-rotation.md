---
id: REQ-AUTH-010
title: Refresh tokens stored as hashes and rotated on every use
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-AUTH-008, REQ-AUTH-022]
contracts: []
priority: must
---
# REQ-AUTH-010: Refresh tokens stored as hashes and rotated on every use

## Context
A refresh token lets the web client get a new access token without signing in again. The old product stored refresh tokens as bcrypt hashes. Bcrypt reads only the first 72 bytes, and those bytes are the same for every refresh token of a user, so rotated-out tokens probably kept working (SEC-5, unverified). It also kept tokens in script-readable browser storage. Triage F03 decided on SHA-256 hashes and rotation, and refresh tokens are accepted only by the refresh and sign-out operations. The 7-day default lifetime is kept.

## Requirements
1. When a session starts, the system shall create a refresh token, store only its SHA-256 hash with the user, the user agent, the issue time and an expiry 7 days later (configurable), and deliver it to the web client.
2. The system shall deliver the refresh token to the web client only in a cookie that page scripts cannot read, that is sent only over HTTPS and only to the refresh and sign-out operations.
3. When a refresh request presents a refresh token, the system shall find the stored token by its hash and accept it only if it is not revoked, not expired, of type "refresh", within the idle timeout (REQ-AUTH-011), and its user exists and is not locked.
4. If no refresh token is presented, then the system shall respond 400 with "Refresh token is required".
5. If the refresh token is not accepted, then the system shall respond 401 with "Refresh token expired or revoked" and issue nothing.
6. When a refresh token is accepted, the system shall in one transaction revoke it with the revocation time, store a new refresh token for the same user, and issue a new access token.
7. When a refresh succeeds, the system shall return the user summary (id, username, e-mail, roles, internal user flag, user type), the new access token and its lifetime in seconds, and set the new refresh token cookie.
8. If two refresh requests present the same token at the same time, then the system shall accept at most one of them.
9. The system shall periodically remove refresh tokens that have expired or been revoked.

## Acceptance criteria
- **AC-1**: Given a valid refresh token, When it is used, Then the response is 200 with a new access token and lifetime, a new refresh token cookie is set, and the used token is stored as revoked. <!-- source: areas/AUTH.md#post-apiauthrefresh-serverjs10802 -->
- **AC-2**: Given a refresh token that has been rotated, When it is used again, Then the response is 401 "Refresh token expired or revoked", even though a newer token of the same user is valid. <!-- source: areas/AUTH.md#security -->
- **AC-3**: Given two valid refresh tokens of one user (two devices), When one is revoked, Then the other still refreshes and the revoked one gets 401. <!-- source: areas/AUTH.md#security -->
- **AC-4**: Given a refresh token issued 7 days and 1 second ago with default lifetime, When it is used, Then the response is 401. <!-- source: areas/AUTH.md#summary -->
- **AC-5**: Given an access token presented as the refresh token, When refresh is called, Then the response is 401 and nothing is issued. <!-- source: areas/AUTH.md#post-apiauthrefresh-serverjs10802 -->
- **AC-6**: Given no refresh token, When refresh is called, Then the response is 400 "Refresh token is required". <!-- source: areas/AUTH.md#post-apiauthrefresh-serverjs10802 -->
- **AC-7**: Given one valid refresh token, When two refresh requests with it arrive at the same time, Then exactly one gets 200 and the other gets 401. <!-- source: areas/AUTH.md#post-apiauthrefresh-serverjs10802 -->
- **AC-8**: Given any stored refresh token record, When the store is inspected, Then it holds a 64-hex-character SHA-256 hash and not the token. <!-- source: triage.md#F03 -->
- **AC-9**: Given a successful sign-in, When the browser's script-readable storage is inspected, Then no refresh token is present. <!-- source: areas/AUTH.md#security -->

## Out of scope
- Idle timeout rule (REQ-AUTH-011).
- Revocation at sign-out (REQ-AUTH-012).

## Non-functional requirements
Lookup by hash is a single indexed read. Refresh tokens carry at least 256 bits of randomness or are signed tokens whose full value is hashed.

## Data volume and performance
- **Volume per run**: one row inserted per sign-in and per refresh; one row revoked per refresh.
- **Growth**: active users times refreshes per day (one per access token lifetime while active).
- **Largest tenant**: unknown; see Open questions.
- **Time window**: rows live up to the refresh lifetime (default 7 days) plus the cleanup delay.
- **Memory ceiling**: no in-memory state.
- **Scale tests**: cleanup over the expected row count; numbers unknown.

## Edge cases and errors
- Reuse of a revoked token may indicate theft; see Open questions on revoking the whole chain.
- User deleted between issue and refresh: 401.
- Existing bcrypt-hashed tokens cannot be converted; all old sessions end at cutover (REQ-AUTH-022).

## Open questions
- On reuse of a revoked refresh token, should all of that user's refresh tokens be revoked?
- Should there be an absolute session limit? The old rotation gave every new refresh token a fresh 7 days, so an active session never ended.
- Should the client IP address be recorded? The old store had the column but never wrote it.
- How long revoked and expired tokens are kept before removal, and how often cleanup runs (old: at every sign-in, in the background).
- Number of active users and sign-ins per day, to size the store.
- Cookie transport for the refresh token is the safe default here; please confirm, including the cross-site setting (strict) and CSRF protection for refresh and sign-out.
