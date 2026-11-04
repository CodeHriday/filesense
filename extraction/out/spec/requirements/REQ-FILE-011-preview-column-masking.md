---
id: REQ-FILE-011
title: Column masking rules for file reads
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-FILE-011: Column masking rules for file reads

## Context
Sensitive columns (for example PII) must not be shown in clear to users without the matching tag permission, while other users still need to see the shape of the data. The old preview applied these rules, but only for direct project members, and the full-data read did not apply them at all. Triage F89 decides masking is applied on every read path; this shard records the old masking rules, which the file preview (REQ-FILE-010) and full data (REQ-FILE-008) use.

## Requirements
1. The file service shall treat a column as sensitive when any governance tag on it has sensitivity level Restricted or requires a view permission.
2. The file service shall give a reader full access to a sensitive column only when the reader is an administrator or holds `tag:<name>:read` for every sensitive tag on the column, where name is the tag's required permission name or, if none, the tag name in lower case.
3. The file service shall give every other reader masked access to a sensitive column.
4. The file service shall give full access to columns that are not sensitive.
5. When a value is null or an empty string, the file service shall return it unchanged.
6. When a masked value is a number, the file service shall return "****".
7. When a masked value is a string of 4 characters or fewer, the file service shall return "****".
8. When a masked value is a string of 5 to 10 characters, the file service shall return its first character, "***" and its last character.
9. When a masked value is a longer string that is an e-mail address, the file service shall return its first character, "***@" and the domain.
10. When a masked value is a longer string in the form ###-##-####, the file service shall return "***-**-" and its last 4 digits.
11. When a masked value is any other longer string, the file service shall return its first 2 characters, "****" and its last 2 characters.
12. When a masked value is an object or list, the file service shall return "****".
13. If the tags of a column cannot be read, then the file service shall treat the column as masked.

## Acceptance criteria
- **AC-1**: Given masked value 1234, Then "****" is returned. <!-- source: areas/FILE.md#get-apifilesfileidpreview -->
- **AC-2**: Given masked value "abcd", Then "****"; Given "abcde", Then "a***e"; Given "abcdefghij", Then "a***j". <!-- source: areas/FILE.md#get-apifilesfileidpreview -->
- **AC-3**: Given masked value "lisa@example.com", Then "l***@example.com". <!-- source: areas/FILE.md#get-apifilesfileidpreview -->
- **AC-4**: Given masked value "123-45-6789", Then "***-**-6789". <!-- source: areas/FILE.md#get-apifilesfileidpreview -->
- **AC-5**: Given masked value "abcdefghijk", Then "ab****jk". <!-- source: areas/FILE.md#get-apifilesfileidpreview -->
- **AC-6**: Given masked value null or "", Then it is returned unchanged; Given {"a":1}, Then "****". <!-- source: areas/FILE.md#get-apifilesfileidpreview -->
- **AC-7**: Given column "ssn" carries tags PII (Restricted) and HR (requires view permission, required permission name "hr_data"), When a reader holds `tag:pii:read` only, Then "ssn" is masked; When the reader holds `tag:pii:read` and `tag:hr_data:read`, Then "ssn" is full. <!-- source: areas/FILE.md#get-apifilesfileidpreview -->
- **AC-8**: Given an administrator, Then every column is full. <!-- source: areas/FILE.md#get-apifilesfileidpreview -->
- **AC-9**: Given a column with only a tag of sensitivity Internal and no view requirement, Then the column is full for every reader. <!-- source: areas/FILE.md#get-apifilesfileidpreview -->

## Out of scope
- Tag definitions, sensitivity levels and tag permissions (GOV, F89).
- Column access for edit operations (GOV).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: applied per value of rows already bounded by REQ-FILE-010.

## Edge cases and errors
- Booleans and dates: see Open questions.
- Strings are measured in characters, not bytes.
- In read operations no column is denied; denied is reserved for edit checks.

## Open questions
- The old rule also treated sensitivity "private" as sensitive. Which canonical level does "private" map to, and should Confidential be sensitive too (GOV)?
- What makes a string an e-mail address for rule 9? The old pattern was not recorded in the FILE note.
- How are booleans and dates masked?
- GOV owns column access for every read path (F89). Confirm whether GOV or FILE owns this rule set, to avoid two copies.
