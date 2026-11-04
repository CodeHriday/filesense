---
id: REQ-ARC-001
title: Archive type detection from content and filename
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-ARC-001: Archive type detection from content and filename

## Context
Every ingestion path has to decide whether a delivered file is an archive and, if so, which kind, before it can be extracted. Today five different extension lists decide this, so the same file is an archive on one path and a plain file on another (for example `.7z` and `.tbz2`). The old detection service already recognises archives by their leading bytes first and by extension second; that rule is kept and becomes the only detection rule, used by every path.

## Requirements
1. When a file reaches archive handling on any ingestion path, the system shall determine its archive type by reading the first 16 bytes of the file content.
2. The system shall apply the detection rules in this order and stop at the first match: ZIP signature, 7z signature, RAR signature, GZIP signature, BZIP2 signature, `.tar` extension, other archive extension.
3. When the first bytes are `50 4B 03 04`, `50 4B 05 06` or `50 4B 07 08`, the system shall classify the file as zip, whatever its extension.
4. When the first bytes are `37 7A BC AF 27 1C`, the system shall classify the file as 7z.
5. When the first bytes are a RAR v4 or v5 signature, the system shall classify the file as rar.
6. When the first bytes are `1F 8B`, the system shall classify the file as tar.gz if the filename ends in `.tar.gz` or `.tgz`, and as gzip otherwise.
7. When the first bytes are `42 5A`, the system shall classify the file as tar.bz2 if the filename ends in `.tar.bz2` or `.tbz2`, and as bzip2 otherwise.
8. When no signature matches and the filename ends in `.tar`, the system shall classify the file as tar.
9. When no earlier rule matches and the filename ends in one of `.zip`, `.7z`, `.gz`, `.bz2`, `.tgz`, `.tbz2`, `.rar`, the system shall classify the file by that extension without the dot.
10. When no rule matches, the system shall treat the file as not an archive.
11. The system shall compare filename extensions case-insensitively.
12. The system shall treat `.tgz` as tar.gz and `.tbz2` as tar.bz2 for all later handling.
13. If the file content cannot be read, then the system shall report a detection failure whose message contains no server file path.

## Acceptance criteria
- **AC-1**: Given a file named `data.bin` whose first bytes are `50 4B 03 04`, When detection runs, Then the type is zip. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-2**: Given a file named `export.tar` whose first bytes are `50 4B 05 06`, When detection runs, Then the type is zip (signature wins over extension). <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-3**: Given a file named `bundle.7z` starting `37 7A BC AF 27 1C`, When detection runs, Then the type is 7z. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-4**: Given a file named `feed.TGZ` starting `1F 8B`, When detection runs, Then the type is tar.gz. <!-- source: areas/ARC.md#internal-entry-archive-handling-in-the-file-processing-worker-proc-owned-arc-behaviour -->
- **AC-5**: Given a file named `feed.gz` starting `1F 8B`, When detection runs, Then the type is gzip. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-6**: Given a file named `feed.tbz2` starting `42 5A`, When detection runs, Then the type is tar.bz2. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-7**: Given a file named `feed.bz2` starting `42 5A`, When detection runs, Then the type is bzip2. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-8**: Given a file named `feed.tar` whose first bytes match no signature, When detection runs, Then the type is tar. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-9**: Given a file named `scan.rar` with a RAR v5 signature, When detection runs, Then the type is rar. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-10**: Given a file named `report.csv` whose first bytes match no signature, When detection runs, Then the file is not an archive. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-11**: Given a stored file that cannot be read, When detection runs, Then a detection failure is reported and its message contains no directory path. <!-- source: areas/ARC.md#bug -->

## Out of scope
- Deciding which detected types can be extracted (REQ-ARC-002).
- Whether the archive is password-protected (REQ-ARC-005).

## Non-functional requirements
Detection reads at most the first 16 bytes of the file; it does not load the whole file into memory. Measured by a unit test on a 25 MB file with a memory probe.

## Data volume and performance
Not data-bearing: reads 16 bytes per file.

## Edge cases and errors
- Files shorter than 16 bytes: detection uses the bytes available and falls back to the extension rules.
- Empty file: no signature matches; extension rules decide.
- A file whose name has no extension and no signature: not an archive.

## Open questions
- BZIP2 is detected from the 2-byte prefix `BZ` only. A non-archive file starting with `BZ` and named `.bz2` or `.tbz2` would be classified as an archive. Should detection require the full BZIP2 header (`BZh` plus a block-size digit)?
- How should plain `.gz` and `.bz2` single files (not tar) be handled? Today they are classified as gzip or bzip2 and refused as unsupported, while upload accepts them (PROC UNCLEAR-2).
