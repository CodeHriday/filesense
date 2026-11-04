---
id: REQ-ING-001
title: Upload requires the file upload permission, checked before any file content is accepted
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-ING-001: Upload requires the file upload permission, checked before any file content is accepted

## Context
Internal users upload data files into a project through the upload page and the onboarding wizard. Today the right to upload is decided by hard-coded role names (Admin, Data Engineer, Creator) or by either of two permission names. The check runs only after every file has been written to server disk. Under D3, permissions are `resource:action` strings and the check is a single server-side permission check. Under the global rules, authorisation happens before any expensive work.

## Requirements
1. The system shall require an authenticated user for every upload request.
2. If the caller does not hold the `file_upload:write` permission through their effective roles (direct roles plus group roles), then the system shall reject the upload with 403.
3. The system shall evaluate the upload permission before it stores, hashes or inspects any file content of the request.
4. If the permission lookup itself fails, then the system shall reject the upload with 403.
5. When an upload is rejected for lack of permission, the system shall return the message "You do not have permission to upload files. Contact your administrator."
6. The system shall not grant upload rights based on role names.

## Acceptance criteria
- **AC-1**: Given a user whose only role carries `file_upload:write`, When they upload one CSV file to a project they belong to, Then the upload is accepted. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-2**: Given a user who holds `file_upload:write` only through a group role, When they upload, Then the upload is accepted. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-3**: Given a user without `file_upload:write`, When they upload 3 files, Then the response is 403 with code `FORBIDDEN` and the message "You do not have permission to upload files. Contact your administrator.", and no file content from the request remains on the server. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-4**: Given a user without `file_upload:write`, When they send an upload request with no files, Then the response is 403, not 400. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-5**: Given the permission store is unavailable, When a user uploads, Then the response is 403 and no file record is created. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-6**: Given a user whose role is named "Data Engineer" but carries no `file_upload:write`, When they upload, Then the response is 403. <!-- source: areas/ING.md#duplicate; cross-cutting.md#7-resolved-decisions -->
- **AC-7**: Given a request without a valid access token, When it is sent, Then the response is 401 and no content is stored. <!-- source: areas/ING.md#shared-middleware-and-configuration -->

## Out of scope
- How effective roles and permissions are resolved (owned by the authentication and role areas).
- Project membership checks (REQ-ING-004).
- Drop permission (REQ-ING-023).

## Non-functional requirements
The permission decision adds at most 50 ms at p95 to an upload request, measured at the API with a warm permission cache.

## Data volume and performance
Not data-bearing: a single permission lookup per request.

## Edge cases and errors
- Permission revoked while the user is signed in: the next upload is rejected. The old permission cache lasted 600 s; how fast revocation takes effect is owned by the authentication area.
- Multipart requests where the file part arrives before other fields: the permission check depends only on the caller, so it can run before the body is read.

## Open questions
- Today the role names Admin, Data Engineer and Creator grant upload, and so does the legacy permission `file:write`. Does the data migration grant `file_upload:write` to every role that matches those today?
- Does the Admin role implicitly hold every permission, or must `file_upload:write` be assigned to it explicitly (global D3 rule owned by the role area)?
- Does the role "Creator" exist in any environment? Only Admin and Data Engineer appear in the seeds.
