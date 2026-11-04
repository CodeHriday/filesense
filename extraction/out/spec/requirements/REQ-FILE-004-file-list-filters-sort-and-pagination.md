---
id: REQ-FILE-004
title: File list filters, sort, pagination and entry fields
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-FILE-002, REQ-FILE-003]
contracts: []
priority: must
---
# REQ-FILE-004: File list filters, sort, pagination and entry fields

## Context
Catalog users narrow the list by project, sub-project, file type and name, and sort by date, name, size, rows or quality. Today all of this runs in the browser over the full file set, while the second list endpoint silently caps results at 50, ignores its sub-project filter and turns a non-numeric project id into an invalid query. Triage F18 asks for one paginated list endpoint; the global rules require validated parameters and one list envelope (items, total, page). The filter and sort values below are the ones the catalog offers today.

## Requirements
1. The file service shall accept the list parameters project, sub-project, file type, search, sort, order, page and page size.
2. The file service shall apply filters to the representative (newest) version of each logical file entry.
3. When a project filter is given, the file service shall return only entries of that project, intersected with the caller's scope.
4. When the sub-project filter is "none", the file service shall return only entries with no sub-project.
5. When the sub-project filter is a sub-project id, the file service shall return only entries of that sub-project.
6. When the file type filter is one of csv, json, parquet or zip, the file service shall return only entries of that type.
7. When a search text is given, the file service shall return entries whose filename, project name or sub-project name contains the text, ignoring case.
8. The file service shall treat wildcard characters in the search text as literal characters.
9. The file service shall sort by created time (default), filename, file size, row count or quality score, in descending (default) or ascending order.
10. The file service shall default to page 1 and a page size of 25.
11. If a parameter is not a valid value, then the file service shall respond 400 with an error code naming the parameter.
12. The file service shall return the envelope items, total, page and page size, where total counts all matching entries.
13. The file service shall return for each entry: file_id, filename, file type, file size, row count, column count, quality score, created time, processed time, project id and name, sub-project id and name, logical file id and name, schema drift flag, processing step, failure reason, processing error message, header check status and issue count, and version count.
14. The file service shall not return server storage paths or raw file metadata in list entries.

## Acceptance criteria
- **AC-1**: Given 60 entries in scope, When the caller requests page 3 with page size 25, Then 10 entries are returned and total is 60. <!-- source: areas/FILE.md#bug -->
- **AC-2**: Given a page size of 200, Then the request succeeds; Given 201, 0 or "abc", Then the response is 400. <!-- source: areas/FILE.md#frontend-file-catalog-filecatalogjsx -->
- **AC-3**: Given an administrator sends project "abc", Then the response is 400. <!-- source: areas/FILE.md#bug -->
- **AC-4**: Given project A has 4 entries without a sub-project and 3 in sub-project S, When the caller filters project A and sub-project "none", Then 4 entries are returned; When the caller filters sub-project S, Then 3 are returned. <!-- source: areas/FILE.md#bug -->
- **AC-5**: Given a caller who is not a project member of B, When the caller filters project B, Then the response is 200 with no entries. <!-- source: areas/FILE.md#get-apifiles -->
- **AC-6**: Given entries "Q1_SALES.csv" and "q2_costs.csv", When the caller searches "sales", Then only "Q1_SALES.csv" is returned. <!-- source: areas/FILE.md#frontend-file-catalog-filecatalogjsx -->
- **AC-7**: Given a search text of 100 characters, Then the request succeeds; Given 101 characters, Then the response is 400. <!-- source: areas/FILE.md#frontend-file-catalog-filecatalogjsx -->
- **AC-8**: Given entries "a_b.csv" and "axb.csv", When the caller searches "a_b", Then only "a_b.csv" is returned. <!-- source: areas/FILE.md#fileservicegetallfiles-shared-by-both-list-routes -->
- **AC-9**: Given file type "xlsx" is requested, Then the response is 400; Given "parquet", Then only parquet entries are returned. <!-- source: areas/FILE.md#frontend-file-catalog-filecatalogjsx -->
- **AC-10**: Given sort "rows" and order ascending, Then entries are ordered by row count from lowest to highest. <!-- source: areas/FILE.md#frontend-file-catalog-filecatalogjsx -->
- **AC-11**: Given sort "owner", Then the response is 400. <!-- source: areas/FILE.md#fileservicegetallfiles-shared-by-both-list-routes -->
- **AC-12**: Given any entry, Then it contains none of the server storage path or raw metadata. <!-- source: areas/FILE.md#security -->

## Out of scope
- Filter option lists (REQ-FILE-005).
- The catalog page controls (REQ-FILE-019).

## Non-functional requirements
- Page response time target to be set (see REQ-FILE-002 Open questions).

## Data volume and performance
- **Volume per run**: at most 200 entries per page.
- **Growth**: see REQ-FILE-002.
- **Largest tenant**: unknown.
- **Time window**: interactive request.
- **Memory ceiling**: one page of entries plus the total count per request.
- **Scale tests**: filtered and sorted pages over the largest production project once known.

## Edge cases and errors
- A page beyond the last returns no items with the correct total.
- An empty search text means no search filter.
- Search text with leading or trailing spaces: see Open questions.
- Entries with no quality score or row count when sorting: see Open questions.

## Open questions
- Is the file type list (csv, json, parquet, zip) still right, given the product also accepts xlsx, sas7bdat, xpt, avro, dat and archives?
- Where do entries without a quality score or row count sort, and what is the tie-breaker for equal sort values so pages stay stable?
- Is the 200 maximum page size right? It is the largest option the catalog offers today; the old server had no limit.
- Should the processing error message be returned as stored, or replaced by a safe message per failure reason (it may contain internal error text)?
- Is search text trimmed before matching?
