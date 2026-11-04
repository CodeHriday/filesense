---
id: REQ-ARC-008
title: Delete a file's own archive password after successful extraction
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-ARC-006]
contracts: []
priority: must
---
# REQ-ARC-008: Delete a file's own archive password after successful extraction

## Context
Users supply a password for one specific archive at upload or after a failure. The password prompt tells them such passwords "are automatically deleted after successful extraction", but no code deletes them, so one-off passwords accumulate in the vault indefinitely. Triage F32 decided that ad-hoc passwords are deleted after use. Passwords stored on agreement file schemas and vendor agreements are reusable configuration and are not affected.

## Requirements
1. When extraction of a file's archive succeeds using that file's own `file` password, the system shall delete that `file` password from the vault.
2. When a file is deleted, the system shall delete that file's `file` password from the vault if one exists.
3. The system shall not delete `agreement_file_schema` or `vendor_agreement` passwords as a result of any extraction.
4. If the deletion fails, then the system shall log the failure without the password, keep the extraction result, and retry the deletion on the file's next processing or deletion.

## Acceptance criteria
- **AC-1**: Given a file uploaded with an archive password that extracts successfully, When processing completes, Then the vault has no `file` entry for that file and a delete audit entry exists. <!-- source: areas/ARC.md#security -->
- **AC-2**: Given a file whose archive was opened with a matching agreement file schema password, When processing completes, Then the schema's vault entry still exists. <!-- source: areas/ARC.md#security -->
- **AC-3**: Given a file whose extraction failed with "password incorrect", When processing ends, Then its `file` entry still exists until it is replaced or the file is deleted. <!-- source: areas/ARC.md#security -->
- **AC-4**: Given a file with a stored `file` password that is deleted from the catalog, When the deletion completes, Then the vault has no entry for that file. <!-- source: areas/ARC.md#security -->

## Out of scope
- The file delete operation itself (FILE area, triage F21).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: one vault delete per successful password-protected extraction.

## Edge cases and errors
- A file that is re-processed after its password was deleted and still needs one: the lookup finds no `file` password, so processing ends "password missing" unless a schema or agreement password applies.
- Successful extraction of an archive that needed no password but has a stored `file` password: the entry is deleted (it was the file's own password and extraction succeeded).

## Open questions
- How long should a `file` password be kept when the file's processing fails for a reason other than the password (for example a scan outage), so that a later retry can still use it?
- A retry that re-processes a completed archive (REQ-ARC-014) will need the password again. Should users be prompted again, or should the `file` password be kept until the file is deleted?
