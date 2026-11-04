---
id: REQ-ARC-003
title: Archive size, member-count and expansion-ratio limits
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-ARC-002]
contracts: []
priority: must
---
# REQ-ARC-003: Archive size, member-count and expansion-ratio limits

## Context
A small archive can expand into gigabytes or millions of files (a decompression bomb) and exhaust disk or memory on the processing workers. Today only the compressed size is limited (25 MB); member count and uncompressed size are unlimited, and the password path reads each member fully into memory. Triage F31 requires size, count and ratio limits on the single extraction service.

## Requirements
1. If the compressed archive is larger than 25 MB (26,214,400 bytes), then the extraction service shall refuse it before extracting anything, with the outcome "limit exceeded" and the message `Archive size <x.xx> MB exceeds maximum limit of 25 MB`, where `<x.xx>` is the size in MB with two decimals.
2. If the number of regular-file members extracted from one archive would exceed the configured member-count limit, then the extraction service shall stop with the outcome "limit exceeded".
3. If the total uncompressed bytes written for one archive would exceed the configured total-size limit, then the extraction service shall stop with the outcome "limit exceeded".
4. If the uncompressed bytes of a member exceed the configured expansion ratio multiplied by the compressed archive size, then the extraction service shall stop with the outcome "limit exceeded".
5. The extraction service shall enforce limits 2 to 4 on the bytes and entries actually written, not on sizes declared in archive headers.
6. When extraction stops because a limit is exceeded, the extraction service shall remove every member already written for that attempt and report no members.
7. The extraction service shall stream member content to storage and shall not hold a whole member in memory.
8. The message for limits 2 to 4 shall name the limit that was exceeded and its configured value.
9. The limits in requirements 2 to 4 shall be configuration values that apply to every ingestion path.

## Acceptance criteria
- **AC-1**: Given a zip archive of exactly 26,214,400 bytes, When extraction is requested, Then the size check passes. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-2**: Given a zip archive of 26,214,401 bytes, When extraction is requested, Then the outcome is "limit exceeded", the message is `Archive size 25.00 MB exceeds maximum limit of 25 MB`, and no member is written. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-3**: Given the member-count limit is set to 3 for the test, When a zip with 3 regular-file members is extracted, Then extraction succeeds with 3 members. <!-- source: areas/ARC.md#security -->
- **AC-4**: Given the member-count limit is set to 3 for the test, When a zip with 4 regular-file members is extracted, Then the outcome is "limit exceeded" and no members remain on storage. <!-- source: areas/ARC.md#security -->
- **AC-5**: Given the total-size limit is set to 10 MB for the test, When a 50 KB tar.gz expanding to 11 MB is extracted, Then extraction stops once 10 MB have been written, the outcome is "limit exceeded", and no members remain. <!-- source: areas/ARC.md#security -->
- **AC-6**: Given a zip whose central directory declares a member of 1 KB but whose stream inflates to more than the total-size limit, When it is extracted, Then extraction stops at the limit (the declared size is not trusted). <!-- source: areas/ARC.md#security -->
- **AC-7**: Given a password-protected zip with a 200 MB member and a configured limit that allows it, When it is extracted, Then the worker's resident memory grows by less than the memory ceiling (the member is streamed). <!-- source: areas/ARC.md#security -->
- **AC-8**: Given an ETL job source archive that exceeds the member-count limit, When the job reads it, Then the same "limit exceeded" outcome is reported. <!-- source: areas/ARC.md#duplicate -->

## Out of scope
- Upload request size limits on the HTTP layer (ING area).
- Failure reason mapping and messages shown to users (REQ-ARC-011).

## Non-functional requirements
Memory per extraction stays under the memory ceiling below regardless of member size; measured by a scale test that records peak resident memory of the worker process.

## Data volume and performance
- **Volume per run**: one archive, at most 25 MB compressed; uncompressed output bounded by the total-size limit.
- **Growth**: unknown; see Open questions.
- **Largest tenant**: unknown; see Open questions.
- **Time window**: none set today.
- **Memory ceiling**: to be set; see Open questions.
- **Scale tests**: (a) a 42 KB nested-deflate bomb; (b) a zip with 1,000,000 empty entries; (c) a tar.gz whose expansion ratio is just under and just over the configured ratio.

## Edge cases and errors
- Zero-byte members count toward the member-count limit.
- Skipped entries (directories, links, unsafe paths, metadata entries) do not count toward the member-count limit.
- A limit exceeded after some members were virus-scanned still removes all members.
- Disk full during extraction: outcome "corrupted archive" is wrong here; the attempt fails as a server fault and the file stays retryable (REQ-ARC-011).

## Open questions
- Production values for the member-count limit, the total uncompressed-size limit and the expansion ratio. The old code has none; the only related value is the profiling service skipping tar members larger than 2 GB.
- Memory ceiling per extraction on the worker.
- Should the 25 MB compressed limit stay the same for ETL job sources and bulk validation jobs, which read from cloud storage rather than browser uploads?
