---
id: REQ-FILE-003
title: File list shows one entry per logical file within a project
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-FILE-002]
contracts: []
priority: must
---
# REQ-FILE-003: File list shows one entry per logical file within a project

## Context
Vendors deliver the same feed repeatedly, so the catalog shows one row per logical file, represented by its newest version, and treats the older files as versions. Today the browser does this grouping after loading every file, and files without a logical file id are grouped by filename across all projects, so same-named files from different projects collapse into one row. Triage F18 moves the grouping to the server and keeps it within a project.

## Requirements
1. The file service shall return one list entry per logical file within a project.
2. The file service shall represent each entry by the version with the latest created time.
3. When a file has no logical file id, the file service shall group it with files of the same project that have exactly the same filename, compared case-sensitively.
4. The file service shall keep files of different projects in separate entries.
5. The file service shall include in each entry the number of versions in scope for the caller.
6. The file service shall include in each entry the logical file name and the schema drift flag of the logical file.
7. The file service shall count list totals in entries, not in files.
8. The file service shall group only files in the caller's scope.

## Acceptance criteria
- **AC-1**: Given files F1, F2, F3 in project A share one logical file and were created at 09:00, 10:00 and 11:00 UTC on 2026-03-01, When a project member of A lists files, Then one entry is returned, represented by F3, with a version count of 3. <!-- source: areas/FILE.md#frontend-file-catalog-filecatalogjsx -->
- **AC-2**: Given "sales.csv" exists without a logical file id in project A and in project B, When an administrator lists files, Then two entries are returned, one per project. <!-- source: areas/FILE.md#bug -->
- **AC-3**: Given "Sales.csv" and "sales.csv" exist in project A without a logical file id, When a project member lists files, Then two entries are returned. <!-- source: areas/FILE.md#get-apifilesfileidcopies -->
- **AC-4**: Given 10 files form 4 logical files in scope, When the caller lists files, Then the total is 4. <!-- source: areas/FILE.md#frontend-file-catalog-filecatalogjsx -->
- **AC-5**: Given a logical file has 3 versions and the vendor user may see only 2 of them, When the vendor user lists files, Then the entry shows a version count of 2 and is represented by the newer of those 2. <!-- source: areas/FILE.md#get-apifilesfileidcopies -->
- **AC-6**: Given a logical file whose schema drift flag is set, When it is listed, Then its entry carries the drift flag set and the logical file name. <!-- source: areas/FILE.md#fileservicegetallfiles-shared-by-both-list-routes -->

## Out of scope
- Assigning logical file ids and the canonical-name rules (SCH, F46).
- Schema drift detection (SCH).

## Non-functional requirements
None beyond REQ-FILE-002.

## Data volume and performance
- **Volume per run**: grouping covers every in-scope file per request; counts unknown (see REQ-FILE-002).
- **Growth**: versions per logical file grow with each delivery; unknown rate.
- **Largest tenant**: unknown.
- **Time window**: interactive request.
- **Memory ceiling**: grouping shall run in the database or in bounded batches, not by loading all files.
- **Scale tests**: a logical file with the highest production version count, once known.

## Edge cases and errors
- Two versions with the same created time: see Open questions.
- A logical file whose newest version is outside the caller's scope is represented by the newest version in scope.
- Deleting versions lowers the version count on the next request; no stored counter is used.

## Open questions
- Which version represents the entry when two versions have the same created time?
- Should versions in different sub-projects of one project form one entry, as the logical file id (project-based) does today?
