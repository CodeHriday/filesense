---
id: REQ-FILE-001
title: Single-file access check resolves the project from the file
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-FILE-001: Single-file access check resolves the project from the file

## Context
Every operation on one file (detail, full data, preview, preview-data deletion, deletion, version lookup) must decide whether the caller may touch that file. The old check took a project id from the query or body before the file's own project and never cross-checked them, so a member of project A could read or delete files of project B (cross-cutting C5). It also accepted the internal numeric row id in some places and the file_id in others, answered "project context required" instead of "not found" for missing files, and let any holder of all-project access skip every permission check. This shard changes that per triage F18/F20/F21, decision D3 and the global authorisation rules: the project comes from the file, the file_id is the only external id, the administrator is the Admin role only, and `all_projects:read` gives read-only visibility. The operation-specific permission is declared by each operation's own shard.

## Requirements
1. When a single-file operation is requested, the file service shall identify the file by its file_id only.
2. The file service shall determine the file's project from the stored file record.
3. The file service shall ignore any project id supplied by the client on a single-file operation.
4. If no file has the requested file_id, then the file service shall respond 404 with an error code and a safe message.
5. If the caller is not authenticated, then the file service shall respond 401 before any file lookup.
6. When the operation is a read, the file service shall allow a caller who is an administrator, holds `all_projects:read`, or is a project member of the file's project or of that project's parent project.
7. When the operation is a delete, the file service shall allow a caller who is an administrator or a project member of the file's project or of that project's parent project.
8. The file service shall treat a project member as a user with direct membership or membership through an access group.
9. If a caller who is not an administrator requests an operation on a file whose project is not active, then the file service shall respond 403 with a "project not active" error code.
10. While the caller is a vendor user, the file service shall allow only files linked to a vendor agreement of the caller's vendor.
11. If the caller is not allowed, then the file service shall respond 403 and shall return no file data.
12. The file service shall end every denied request with a response.

## Acceptance criteria
- **AC-1**: Given user U is a direct project member of project A and file F belongs to A, When U reads F, Then the response is 200. <!-- source: areas/FILE.md#summary -->
- **AC-2**: Given user U reaches project A only through an access group and file F belongs to A, When U reads F, Then the response is 200. <!-- source: areas/FILE.md#bug -->
- **AC-3**: Given U is a project member of A only and file F belongs to project B, When U reads F and supplies project id A as a query or body parameter, Then the response is 403 and contains no data of F. <!-- source: areas/FILE.md#security -->
- **AC-4**: Given file F has file_id "a1b2" and internal row number 42, and no file has file_id "42", When any caller requests file "42", Then the response is 404. <!-- source: areas/FILE.md#bug -->
- **AC-5**: Given no file has file_id "missing-1", When a project member requests it without any project id, Then the response is 404, not 400. <!-- source: areas/FILE.md#bug -->
- **AC-6**: Given user U holds `all_projects:read`, is not a project member of B and file F belongs to B, When U reads F, Then the response is 200; When U deletes F, Then the response is 403 and F still exists. <!-- source: areas/FILE.md#security -->
- **AC-7**: Given user U holds `users:write`, `roles:write` and `project_management:write`, does not hold the Admin role and is not a project member of B, When U reads a file of B, Then the response is 403. <!-- source: areas/FILE.md#summary -->
- **AC-8**: Given file F belongs to sub-project S whose parent is A and U is a project member of A, When U reads F, Then the response is 200. <!-- source: areas/FILE.md#get-apifilesfileid -->
- **AC-9**: Given project A is not active and U is a project member of A, When U reads a file of A, Then the response is 403; Given the caller is an administrator, Then the response is 200. <!-- source: areas/FILE.md#get-apifilesfileid -->
- **AC-10**: Given vendor user V belongs to vendor X and is a project member of A, and file F in A is linked to an agreement of vendor Y, When V reads F, Then the response is 403; Given F is linked to an agreement of vendor X, Then the response is 200. <!-- source: areas/FILE.md#get-apifilesfileid -->
- **AC-11**: Given no access token, When any single-file operation is requested, Then the response is 401. <!-- source: areas/FILE.md#get-apifilesfileid -->

## Out of scope
- The general project-authorisation mechanism and the administrator predicate (SEC, AUTH).
- Operation-specific permissions (declared in REQ-FILE-006 to REQ-FILE-016).
- How a vendor user is linked to a vendor (VND).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: one file and one project lookup per request.

## Edge cases and errors
- A file deleted between the access check and the operation gives 404.
- A file_id containing URL-encoded characters is decoded once before lookup.
- The 403 body names no project or file attribute of the denied file.
- Archived projects: see Open questions.

## Open questions
- Should a caller without access to a file get 404 instead of 403, so that file_ids of other projects cannot be confirmed to exist? The old code answered 403 for non-members.
- The glossary defines an inactive project as one that "blocks new work but stays visible", while the old check blocked reads too. Should reads of files in inactive projects be allowed?
- Are files of archived projects readable or deletable through single-file operations? The old check did not look at the archived flag.
- Should vendor users need project membership in addition to the agreement link, or does the agreement link alone grant access (VND)?
- Does `files.project_id` hold the parent project or the sub-project for files in sub-projects (FILE open question)? The parent rule above covers both cases, but the answer affects data migration.
- Lineage graph nodes used the internal numeric id to open files. LIN must emit file_ids instead; confirm with LIN.
