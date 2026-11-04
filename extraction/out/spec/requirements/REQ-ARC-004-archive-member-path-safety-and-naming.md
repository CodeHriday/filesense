---
id: REQ-ARC-004
title: Archive member path safety and collision-free member names
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-ARC-002]
contracts: []
priority: must
---
# REQ-ARC-004: Archive member path safety and collision-free member names

## Context
Archive entries carry their own paths, which an attacker can set to escape the extraction area (`../../etc/...` or absolute paths). Zip and tar extraction filter such entries today but 7z does not. Most extractors also flatten every entry to its base name, so `a/data.csv` and `b/data.csv` overwrite each other while both are reported; only the password-zip path de-duplicates names. macOS resource-fork entries (`__MACOSX`, `._*`) are skipped on one path and extracted on others. The single extraction service applies one rule set to every format.

## Requirements
1. The extraction service shall skip any entry whose path inside the archive is absolute.
2. The extraction service shall skip any entry whose path inside the archive contains `..`.
3. The extraction service shall apply requirements 1 and 2 to every supported format, 7z included.
4. The extraction service shall skip any entry whose path contains a `__MACOSX` segment or whose base name starts with `._`.
5. The extraction service shall write members only inside the working area created for that extraction attempt.
6. The extraction service shall name each extracted member by the base name of its path inside the archive.
7. When an archive contains more than one member with the same base name, the extraction service shall keep the first one's base name and give each later one a prefix `<n>_`, where `<n>` counts 1, 2, 3 in archive order.
8. The extraction service shall never overwrite one extracted member with another.
9. The extraction service shall keep each member's full path inside the archive as its logical name, separately from its stored member name.
10. Skipped entries shall not appear in the member list.

## Acceptance criteria
- **AC-1**: Given a zip with entry `../../outside.csv`, When it is extracted, Then that entry is skipped and nothing is written outside the attempt's working area. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-2**: Given a tar with entry `/etc/passwd`, When it is extracted, Then that entry is skipped. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-3**: Given a 7z archive with entry `../evil.sh`, When it is extracted, Then that entry is skipped and nothing is written outside the working area. <!-- source: areas/ARC.md#security -->
- **AC-4**: Given a zip with entries `data.csv`, `__MACOSX/._data.csv` and `._notes.txt`, When it is extracted, Then only `data.csv` is returned. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-5**: Given a tar with entries `a/data.csv`, `b/data.csv` and `c/data.csv` with different content, When it is extracted, Then three members are returned with member names `data.csv`, `1_data.csv`, `2_data.csv`, logical names `a/data.csv`, `b/data.csv`, `c/data.csv`, and each member's checksum matches its own entry's content. <!-- source: areas/ARC.md#bug -->
- **AC-6**: Given a zip with entries `x/data.csv`, `y/data.csv` and `1_data.csv`, When it is extracted, Then three distinct members exist and none has overwritten another. <!-- source: areas/ARC.md#bug -->
- **AC-7**: Given a zip with entry `reports/q1.csv`, When it is extracted, Then the member's logical name is `reports/q1.csv` and its member name is `q1.csv`. <!-- source: areas/ARC.md#business-rules-with-literal-values -->

## Out of scope
- Size and count limits (REQ-ARC-003).
- How skipped entries are surfaced to users (see Open questions).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: per-entry name checks.

## Edge cases and errors
- An archive in which every entry is skipped extracts successfully with an empty member list.
- Entry names with backslashes (`..\\evil.csv` written by Windows tools) are treated as path separators for the `..` and absolute-path checks.
- Entry names in non-UTF-8 encodings are decoded before the checks; undecodable names are skipped.
- AC-6: the generated name `1_data.csv` would clash with the real entry `1_data.csv`; requirement 8 takes precedence and the naming scheme must pick a free name.

## Open questions
- Entries whose names merely contain `..` inside a segment (for example `report..final.csv`) are skipped today. Should only `..` path segments be rejected instead?
- Which name should a generated prefix take when `<n>_<name>` is already used by another entry (AC-6)?
- Should skipped entries be reported to the user (for example a count on the extraction record), or only logged?
