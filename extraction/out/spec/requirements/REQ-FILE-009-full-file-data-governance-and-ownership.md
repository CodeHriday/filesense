---
id: REQ-FILE-009
title: Full file data returns the file's governance tags, policies and data owner
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-FILE-008]
contracts: []
priority: should
---
# REQ-FILE-009: Full file data returns the file's governance tags, policies and data owner

## Context
The file profile page shows who owns the data and which governance tags and policies apply to the file and its columns. Today the same response also carries every governance tag and policy in the system, unscoped, to anyone who can read the file. The rebuild keeps the file's own governance data and leaves the tag and policy catalogs to the governance endpoints, which carry their own permissions (F19, F89).

## Requirements
1. When the file service returns full file data, it shall include the file's data owner, or null when none is set.
2. The file service shall include the governance tags assigned to the file.
3. The file service shall include the governance policies assigned to the file.
4. The file service shall include the governance tags and policies assigned to each column whose column access is full or masked.
5. The file service shall return for each column tag: column name, tag id, tag name, description, colour, badge style and assigned time.
6. The file service shall not include governance tags or policies that are not assigned to the file or its columns.

## Acceptance criteria
- **AC-1**: Given file F has data owner O, tag PII and policy P, When a reader requests full data, Then O, PII and P are returned. <!-- source: areas/FILE.md#get-apifilesfileidfull -->
- **AC-2**: Given F has no data owner, Then the owner is null. <!-- source: areas/FILE.md#get-apifilesfileidfull -->
- **AC-3**: Given 40 governance tags exist and 2 are assigned to F's columns, Then exactly those 2 column tag assignments are returned and no tag catalog is included. <!-- source: areas/FILE.md#security -->
- **AC-4**: Given column "ssn" carries tag PII and its access for the caller is masked, Then the PII assignment on "ssn" is returned. <!-- source: areas/FILE.md#get-apifilesfileidfull -->

## Out of scope
- Assigning tags, policies and owners, and the tag and policy catalogs (GOV).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: assignments of one file.

## Edge cases and errors
- A tag deleted while assigned is not returned.

## Open questions
- Should column tags and policies of denied columns also be hidden in read operations? The old code kept only full and masked columns; reads never produce denied today.
- Does the profile page need the tag and policy catalogs for its pickers, and under which GOV permission?
