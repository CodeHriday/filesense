---
id: REQ-FILE-005
title: Catalog project and sub-project filter options
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-FILE-002]
contracts: []
priority: should
---
# REQ-FILE-005: Catalog project and sub-project filter options

## Context
The catalog's project and sub-project drop-downs list the projects a user may browse. Today they come bundled with the full file list in one response. With a paginated list (REQ-FILE-004) the options are returned separately, with the same scope rules as the list.

## Requirements
1. When a user requests the catalog filter options, the file service shall require `file:read`.
2. Where the caller is an administrator or holds `all_projects:read`, the file service shall return every non-archived top-level project.
3. Where the caller is neither an administrator nor a holder of `all_projects:read`, the file service shall return the non-archived top-level projects in the caller's list scope.
4. The file service shall return the non-archived sub-projects whose parent is among the returned projects.
5. The file service shall return for each project its id, name, description and parent id.
6. The file service shall order projects and sub-projects by name.
7. If the caller has no project in scope, then the file service shall return empty project and sub-project lists with status 200.

## Acceptance criteria
- **AC-1**: Given user U is a project member of A and B, and A has sub-projects A1 and archived A2, When U requests filter options, Then projects A and B and sub-project A1 are returned, and A2 is not. <!-- source: areas/FILE.md#get-apifilesinit-data -->
- **AC-2**: Given an administrator and an archived top-level project Z, When the administrator requests filter options, Then Z is not returned. <!-- source: areas/FILE.md#get-apifilesinit-data -->
- **AC-3**: Given projects "beta" and "Alpha", When options are returned, Then "Alpha" precedes "beta". <!-- source: areas/FILE.md#get-apifilesinit-data -->
- **AC-4**: Given U has no project in scope, Then the response is 200 with two empty lists. <!-- source: areas/FILE.md#get-apifilesinit-data -->
- **AC-5**: Given U lacks `file:read`, Then the response is 403. <!-- source: areas/FILE.md#get-apifilesinit-data -->

## Out of scope
- Project administration and general project listings (PRJ).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: bounded by the number of projects, which is small relative to files (count unknown).

## Edge cases and errors
- A project archived after the page loaded disappears on the next request.

## Open questions
- Is name ordering case-insensitive? The old ordering used the database default collation.
- Should PRJ's project listing be reused instead of a catalog-specific one?
