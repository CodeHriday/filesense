---
id: REQ-FILE-007
title: Read a file's detail record and column list
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-FILE-001, REQ-FILE-004]
contracts: []
priority: must
---
# REQ-FILE-007: Read a file's detail record and column list

## Context
The quality checks view and the lineage impact view load one file's record and column list. Today this read checks no permission beyond project membership, returns the whole stored file record (including storage paths and raw metadata) and every stored column statistic without column access control, and lists a column several times when the file was profiled under several roles. The rebuild returns the catalog's file fields plus the column list; column statistics with column access control come from REQ-FILE-008.

## Requirements
1. When a user requests a file's detail, the file service shall require `file:read` and read access to that file.
2. The file service shall return the file fields defined for list entries in REQ-FILE-004.
3. The file service shall return the file's columns with name, type and position, ordered by position.
4. The file service shall return each column once.
5. The file service shall not return column statistics in the detail response.
6. The file service shall not return server storage paths or raw file metadata.

## Acceptance criteria
- **AC-1**: Given a file F with 3 profiled columns at positions 0, 1, 2, When a project member reads F's detail, Then 3 columns are returned in position order with name and type. <!-- source: areas/FILE.md#get-apifilesfileid -->
- **AC-2**: Given F was profiled under the roles source and target, Then each column appears once. <!-- source: areas/FILE.md#bug -->
- **AC-3**: Given the caller lacks `file:read`, Then the response is 403. <!-- source: areas/FILE.md#security -->
- **AC-4**: Given F does not exist, Then the response is 404. <!-- source: areas/FILE.md#get-apifilesfileid -->
- **AC-5**: Given any successful response, Then it contains no storage path, raw metadata, minimum, maximum or frequent value. <!-- source: areas/FILE.md#security -->

## Out of scope
- Profile statistics and governance data (REQ-FILE-008, REQ-FILE-009).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: one file record and its column list (column count per file unknown, see Open questions).

## Edge cases and errors
- A file with no profile returns an empty column list.
- A file that is still processing returns its current processing step.

## Open questions
- Do the quality checks and lineage impact views need any column statistic? If so they should read REQ-FILE-008 (FDV, LIN).
- Which role's column list applies when a file was profiled under several roles?
- What is the widest file (column count) in production?
