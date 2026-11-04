---
id: REQ-ING-003
title: Upload rate limit counts each upload or drop request once
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: should
---
# REQ-ING-003: Upload rate limit counts each upload or drop request once

## Context
Uploads are rate-limited to protect storage and processing. Today one limiter of 20 requests per hour per IP is shared by the duplicate check, upload and drop. The page sends one duplicate check per file plus one upload request, so a single 20-file batch uses 21 slots and fails. The triage decision for F23 is that the rate limit applies per batch.

## Requirements
1. The system shall allow at most 20 upload or drop requests per client per rolling hour.
2. The system shall count one upload request as one unit, whatever its number of files.
3. The system shall not count duplicate-check requests against the upload limit.
4. If a client exceeds the limit, then the system shall reject the request with 429, code `RATE_LIMITED`, and the message "Too many file uploads, please try again later".
5. When a request is rejected for rate limiting, the system shall not store any of its content.
6. The system shall enforce the limit consistently across all server instances.

## Acceptance criteria
- **AC-1**: Given a client with no requests in the last hour, When it sends 20 duplicate checks and then one upload of 20 files, Then the upload is accepted. <!-- source: areas/ING.md#bug -->
- **AC-2**: Given a client that has sent 20 upload requests in the last 60 minutes, When it sends a 21st upload, Then the response is 429 `RATE_LIMITED` with "Too many file uploads, please try again later". <!-- source: areas/ING.md#shared-middleware-and-configuration -->
- **AC-3**: Given 19 uploads and 1 drop from one client within an hour, When a further drop is sent, Then the response is 429. <!-- source: areas/ING.md#shared-middleware-and-configuration -->
- **AC-4**: Given a client's 20th upload was 61 minutes ago and none since, When it uploads, Then the request is accepted. <!-- source: areas/ING.md#shared-middleware-and-configuration -->
- **AC-5**: Given two server instances, When a client sends 11 uploads to each within an hour, Then 2 of the 22 are rejected with 429. <!-- source: cross-cutting.md#high -->

## Out of scope
- API-token uploads, which have their own per-token rate limits (API area).
- Request-size limits (REQ-ING-002).

## Non-functional requirements
The limit check adds at most 10 ms at p95.

## Data volume and performance
Not data-bearing: one counter per client.

## Edge cases and errors
- Clients behind one shared proxy IP share the limit if the limit is per IP (see Open questions).
- Rejected requests (403, 400) still count as requests unless decided otherwise; they arrive before content is stored.

## Open questions
- Is "client" the client IP (today) or the authenticated user? A per-user limit avoids penalising users behind one corporate proxy.
- Should duplicate checks have their own limit? Each check carries a full file of up to 25 MB.
- Should rejected requests (403, 400) count towards the limit?
