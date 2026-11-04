---
id: REQ-FILE-006
title: Look up the versions of a file
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-FILE-001]
contracts: []
priority: must
---
# REQ-FILE-006: Look up the versions of a file

## Context
Before deleting a file, the catalog asks how many versions its logical file has, so the user can choose to delete them all. Today this lookup checks no permission and skips the vendor restriction. This shard keeps the lookup and applies the single-file access check (REQ-FILE-001) and `file:read`.

## Requirements
1. When a user requests the versions of a file, the file service shall require `file:read` and read access to that file.
2. Where the file has a logical file id, the file service shall return the files of that logical file that are in the caller's scope.
3. Where the file has no logical file id, the file service shall return the files of the same project with exactly the same filename, compared case-sensitively, that are in the caller's scope.
4. The file service shall include the requested file itself in the result.
5. The file service shall return the version file_ids, the count, the logical file id or null, and the filename.

## Acceptance criteria
- **AC-1**: Given file F1 and two other files share its logical file in project A, When a project member of A requests the versions of F1, Then 3 file_ids including F1 are returned with count 3. <!-- source: areas/FILE.md#get-apifilesfileidcopies -->
- **AC-2**: Given file F has no other version, Then count is 1 and the list holds only F. <!-- source: areas/FILE.md#get-apifilesfileidcopies -->
- **AC-3**: Given F has no logical file id and "report.csv" exists twice in A and once in B, When the versions of the A file are requested, Then count is 2. <!-- source: areas/FILE.md#get-apifilesfileidcopies -->
- **AC-4**: Given the caller has no read access to F, Then the response is 403; Given F does not exist, Then the response is 404. <!-- source: areas/FILE.md#get-apifilesfileidcopies -->
- **AC-5**: Given the caller lacks `file:read`, Then the response is 403. <!-- source: areas/FILE.md#security -->
- **AC-6**: Given a vendor user may see 2 of 3 versions, Then count is 2. <!-- source: areas/FILE.md#security -->

## Out of scope
- Deleting versions (REQ-FILE-016).

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: all versions of one logical file; the largest version count is unknown.
- **Growth**: one version per delivery of the feed.
- **Largest tenant**: unknown.
- **Time window**: interactive request.
- **Memory ceiling**: file_ids only.
- **Scale tests**: the logical file with the highest production version count, once known.

## Edge cases and errors
- Versions deleted concurrently are not returned on the next request.
- Server faults give 500 with a safe message.

## Open questions
- Is there an upper bound on the returned versions, given a daily feed accumulates hundreds per year?
