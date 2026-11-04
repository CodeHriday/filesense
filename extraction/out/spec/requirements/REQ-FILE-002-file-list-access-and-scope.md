---
id: REQ-FILE-002
title: File list access and project scope
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-FILE-002: File list access and project scope

## Context
The file catalog is the main screen for finding files. Today two list endpoints do the same job with different permission lists, limits, caches and response shapes, and a third vendor variant exists (triage F18). The vendor filter compares against columns that do not exist, so vendor users see nothing, and holders of `all_projects:read` are treated as administrators. The rebuild keeps one list, scoped by each file's own project (F18 decision, D3). This shard covers who may list and which files are in scope; grouping, filters and paging are REQ-FILE-003 and REQ-FILE-004.

## Requirements
1. When a user requests the file list, the file service shall require the permission `file:read`.
2. If the caller lacks `file:read`, then the file service shall respond 403 with the safe message "You do not have permission to view files".
3. Where the caller is an administrator or holds `all_projects:read`, the file service shall include files of every project.
4. Where the caller is neither an administrator nor a holder of `all_projects:read`, the file service shall include only files of active projects where the caller is a project member, and of the active sub-projects of those projects.
5. The file service shall treat a project member as a user with direct membership or membership through an access group.
6. While the caller is a vendor user, the file service shall include only files linked to a vendor agreement of the caller's vendor.
7. The file service shall exclude job output (target) files from the list.
8. If the caller has no project in scope, then the file service shall respond 200 with an empty list in the standard list envelope.
9. The file service shall return the same response shape for empty and non-empty results.
10. The file service shall let client filters narrow the scope only, never widen it.

## Acceptance criteria
- **AC-1**: Given user U holds `file:read` and is a project member of A and B, and project C has files, When U lists files, Then only files of A, B and their active sub-projects are returned. <!-- source: areas/FILE.md#get-apifilesinit-data -->
- **AC-2**: Given user U holds only `file_catalog:read`, `file_upload:read` or `file_view` and not `file:read`, When U lists files, Then the response is 403 with "You do not have permission to view files" (legacy permissions are mapped at migration, see Open questions). <!-- source: areas/FILE.md#get-apifilesinit-data -->
- **AC-3**: Given user U holds `file:read` and `all_projects:read` and no project membership, When U lists files, Then files of every project are returned. <!-- source: areas/FILE.md#summary -->
- **AC-4**: Given user U holds `file:read` and no project membership, When U lists files, Then the response is 200 with no items and a total of 0, in the same envelope as a non-empty list. <!-- source: areas/FILE.md#bug -->
- **AC-5**: Given vendor user V of vendor X holds `file:read`, is a project member of A, and A holds 5 files linked to agreements of X and 3 files not linked to X, When V lists files, Then exactly the 5 files linked to X are in scope. <!-- source: areas/FILE.md#bug -->
- **AC-6**: Given project A is inactive and U is a project member of A, When U lists files, Then no file of A is returned. <!-- source: areas/FILE.md#summary -->
- **AC-7**: Given file T is the output file of a job in project A, When a project member of A lists files, Then T is not returned. <!-- source: areas/FILE.md#fileservicegetallfiles-shared-by-both-list-routes -->
- **AC-8**: Given U reaches A only through an access group, When U lists files, Then files of A are returned. <!-- source: areas/FILE.md#summary -->

## Out of scope
- Grouping by logical file (REQ-FILE-003), filters and paging (REQ-FILE-004), filter options (REQ-FILE-005).
- The vendor portal's own file views (VND, F59).
- Mapping legacy permission names to `file:read` (USR or MIG).

## Non-functional requirements
- The list request for the largest tenant returns its first page within a target to be set (see Open questions), measured at the API under production-like data.

## Data volume and performance
- **Volume per run**: one list request covers every in-scope file; the count per project is unknown (see Open questions).
- **Growth**: one file per delivery; growth rate unknown.
- **Largest tenant**: unknown.
- **Time window**: interactive request.
- **Memory ceiling**: the server shall not load the whole in-scope set into memory to build one page (old code loaded all files with no cap).
- **Scale tests**: list with the largest production project's file count once known.

## Edge cases and errors
- A user whose last project membership is removed gets an empty list on the next request.
- A sub-project whose parent is inactive: see Open questions.
- Any server fault gives 500 with a safe message, never the library error text.

## Open questions
- Which legacy permissions (`file_view`, `file_upload:read`, `file_catalog:read`) map to `file:read` at migration, and which production roles hold them today?
- Should files of archived projects appear for administrators? The old admin list included every file, while the project filter options excluded archived projects.
- Which value marks a job output file: the file's own role or its file audit role? The old list used the file audit role, and a file with any non-target audit row was shown.
- Is an active sub-project of an inactive parent in scope?
- How many files does the largest project hold, and what response-time target applies?
