---
id: REQ-FILE-010
title: Read a file's preview rows
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-FILE-001, REQ-FILE-011]
contracts: []
priority: must
---
# REQ-FILE-010: Read a file's preview rows

## Context
Users check a file's content through stored sample rows (preview data) on the profile page and in the onboarding wizard. Today the preview is served from cache before any access check, holders of `all_projects:read` skip the `file_preview:read` permission, and users who reach a project through an access group pass the access check but then get empty rows. The row limit has no upper bound and a negative value causes a server error. Triage F20 decides: authorise before cache and keep the preview with column masking.

## Requirements
1. When a user requests a file's preview, the file service shall require `file_preview:read` and read access to that file.
2. The file service shall return at most the requested number of stored preview rows, in stored row order.
3. The file service shall use a row limit of 100 when none is given.
4. If the row limit is not an integer from 1 to 10,000, then the file service shall respond 400 with an error code naming the limit.
5. The file service shall return the file's columns with name and normalised type, each column once.
6. The file service shall return the file's row count as the total row count.
7. The file service shall apply column masking (REQ-FILE-011) to the returned rows.
8. The file service shall return the lists of full, masked and denied columns.
9. When a stored row cannot be parsed, the file service shall return it as an empty row.
10. When the file has no stored preview rows, the file service shall return an empty row list with status 200.

## Acceptance criteria
- **AC-1**: Given file F has 250 stored preview rows, When a reader with `file_preview:read` requests the preview without a limit, Then rows 1 to 100 are returned in order and the total row count equals F's row count. <!-- source: areas/FILE.md#get-apifilesfileidpreview -->
- **AC-2**: Given limit 10000, Then the request succeeds; Given limit 10001, 0, -5 or "abc", Then the response is 400. <!-- source: areas/FILE.md#bug -->
- **AC-3**: Given user U reaches F's project only through an access group and holds `file_preview:read`, Then the preview rows are returned, not an empty list. <!-- source: areas/FILE.md#bug -->
- **AC-4**: Given user U holds `all_projects:read` and `file_preview:read` and is not a project member, Then the preview rows are returned with masking applied. <!-- source: areas/FILE.md#get-apifilesfileidpreview -->
- **AC-5**: Given user U holds `all_projects:read` but not `file_preview:read`, Then the response is 403 and contains no column list or row count. <!-- source: areas/FILE.md#security -->
- **AC-6**: Given a non-member supplies a project id they belong to, Then the response is 403 and contains no column list or row count (REQ-FILE-001). <!-- source: areas/FILE.md#security -->
- **AC-7**: Given F's preview data was deleted, Then the response is 200 with an empty row list and F's columns. <!-- source: areas/FILE.md#delete-apifilesfileidpreview-data -->
- **AC-8**: Given a stored row that is not valid JSON, Then that row is returned as an empty row and the other rows are returned. <!-- source: areas/FILE.md#get-apifilesfileidpreview -->

## Out of scope
- How preview data is stored and how many rows are kept (ING, PROC).
- The preview panel (REQ-FILE-022).
- Data-access audit of previews (REQ-FILE-012).

## Non-functional requirements
- A 100-row preview returns within the 60-second client timeout the preview panel uses; a tighter target is to be set (see Open questions).

## Data volume and performance
- **Volume per run**: up to 10,000 rows per request (glossary: preview data holds up to 10,000 rows per file).
- **Growth**: per file, fixed at ingestion.
- **Largest tenant**: not applicable per request.
- **Time window**: interactive request.
- **Memory ceiling**: the requested rows of one file.
- **Scale tests**: 10,000 rows of the widest production file.

## Edge cases and errors
- Rows of a file with duplicated columns across roles are returned once per row.
- Preview data deleted between two requests gives an empty row list on the second.

## Open questions
- Is 10,000 the right maximum limit? It equals the stored preview size in the glossary; the old route had no maximum.
- How many preview rows does ingestion store per file today (ING, PROC)?
- What response-time target applies to a 100-row preview?
