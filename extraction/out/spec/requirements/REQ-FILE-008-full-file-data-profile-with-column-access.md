---
id: REQ-FILE-008
title: Full file data returns the profile with column access applied
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-FILE-001, REQ-FILE-004, REQ-FILE-011]
contracts: []
priority: must
---
# REQ-FILE-008: Full file data returns the profile with column access applied

## Context
The file profile page loads a file's profile in one call. Today that call never masks anything: the column-tag data it checks carries no sensitivity fields, so every column is "allowed" and minimum, maximum and frequent values of sensitive columns are returned. It also reads statistics that do not exist in production (they come back empty), turns zeros into nulls in the fallback path, exposes counts of masked columns, duplicates columns for multi-role files and returns the raw file record. Triage F19 (FILE part) and F89 decide: masking applied from tag sensitivity, statistics only from real profile fields, no invented values.

## Requirements
1. When a user requests a file's full data, the file service shall require `file:read` and read access to that file.
2. The file service shall return the file fields defined in REQ-FILE-004 and a profile with file_id, filename, file type, file size, row count, column count, quality score, processed time and columns.
3. The file service shall return the file_id as the profile's file identifier.
4. The file service shall return for each column: name, type, null count, null percentage, non-null count (row count minus null count), unique count, minimum, maximum, most frequent value and count, least frequent value and count, top values, patterns and column access.
5. The file service shall decide each column's access as full or masked from the governance tags on that column, using the column access rules in REQ-FILE-011.
6. When a column's access is masked or denied, the file service shall return its name, type and column access, set every value field to "[REDACTED]" and every count and statistic to null.
7. The file service shall return each column once.
8. The file service shall return a stored zero as zero.
9. The file service shall not return statistics that the profile does not store.
10. When the file has no profile, the file service shall build the column list from the file's schema and apply the same column access rules.
11. The file service shall report column access with the values full, masked and denied.

## Acceptance criteria
- **AC-1**: Given column "email" carries a governance tag with sensitivity Restricted, and user U lacks `tag:pii:read`, When U requests full data, Then "email" has access masked, minimum, maximum and frequent values "[REDACTED]", and null count, unique count and null percentage null. <!-- source: areas/FILE.md#security -->
- **AC-2**: Given the same column and user U holds `tag:pii:read`, Then "email" has access full and its stored statistics. <!-- source: areas/FILE.md#get-apifilesfileidpreview -->
- **AC-3**: Given an administrator, Then every column has access full. <!-- source: areas/FILE.md#get-apifilesfileidpreview -->
- **AC-4**: Given a column with stored unique count 0 and minimum "0", Then unique count is 0 and minimum is "0", not null. <!-- source: areas/FILE.md#bug -->
- **AC-5**: Given row count 1000 and null count 25, Then non-null count is 975. <!-- source: areas/FILE.md#get-apifilesfileidfull -->
- **AC-6**: Given the file was profiled under roles source and adhoc, Then each column appears once. <!-- source: areas/FILE.md#bug -->
- **AC-7**: Given the file has no profile and its schema lists 3 columns, one carrying a Restricted tag the caller lacks, Then 3 columns are returned and that one is masked. <!-- source: areas/FILE.md#security -->
- **AC-8**: Given any response, Then no column carries mean, median, standard deviation or histogram fields unless the profile stores them. <!-- source: areas/FILE.md#bug -->
- **AC-9**: Given the file is requested by its internal row number, Then the response is 404 (REQ-FILE-001). <!-- source: areas/FILE.md#get-apifilesfileidfull -->

## Out of scope
- Governance tags, policies and ownership in the same response (REQ-FILE-009).
- Defining which tags are sensitive and which tag permissions exist (GOV, F89).
- What the profile stores (PROF).
- The profile page itself (FDV).

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: one file's columns; widest production file unknown.
- **Growth**: none per request.
- **Largest tenant**: not applicable.
- **Time window**: interactive request.
- **Memory ceiling**: one file's profile.
- **Scale tests**: the widest production file once known.

## Edge cases and errors
- A column whose tags cannot be read makes the column masked, never full (fail closed).
- Top values and patterns of masked columns are "[REDACTED]".
- A profile with fewer columns than the schema returns the profiled columns only.

## Open questions
- Should masked columns keep their null and unique counts? The old code returned them; the FILE note flags this as a leak, so this shard withholds them.
- Should PROF store mean, median, standard deviation and a histogram? Until it does, they are not returned.
- Which role's profile applies when a file was profiled under several roles?
- The old sensitivity test also treated a level "private" as sensitive, which is not in the canonical list (Public, Internal, Confidential, Restricted). Which canonical level does it map to (GOV)?
- AI DQ suggestions build their input from this response (cross-cutting §0). Confirm the AI area reads the field names defined here.
