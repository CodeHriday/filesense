---
id: REQ-ARC-002
title: One archive extraction service for every ingestion path
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-ARC-001]
contracts: []
priority: must
---
# REQ-ARC-002: One archive extraction service for every ingestion path

## Context
Vendors deliver data files inside zip, tar and 7z archives, sometimes password-protected. Today four separate implementations extract archives (the upload pipeline, the profiling service, bulk schema validation and the ETL job engine), each with its own format list and its own safety gaps; the profiling service even re-extracts archives the upload pipeline failed to open. Triage F31 decided on one extraction service with size, count and ratio limits and traversal checks, used by every path. The profiling service no longer extracts archives; it receives already-extracted archive members.

## Requirements
1. The system shall provide one archive extraction service, and every path that opens archives (interactive upload, drop, API upload, bulk validation jobs, ETL job sources, and retries of failed files) shall use it.
2. The profiling service shall not extract archives; it shall only receive archive members produced by the extraction service.
3. The extraction service shall extract archives of type zip, 7z, tar, tar.gz and tar.bz2, including files named `.tgz` and `.tbz2`.
4. If the detected archive type is rar, gzip or bzip2, then the extraction service shall refuse the archive with the outcome "unsupported format" and the message `Archive format <type> is not supported`.
5. The extraction service shall accept an optional archive password for zip and 7z archives.
6. The extraction service shall treat tar, tar.gz and tar.bz2 archives as never password-protected.
7. The extraction service shall extract only regular file entries; directory entries, symbolic links, hard links and device entries shall be skipped.
8. If a zip archive contains an encrypted entry and no password was supplied, then the extraction service shall stop with the outcome "password missing".
9. If a password was supplied and the archive cannot be opened with it, then the extraction service shall stop with the outcome "password incorrect".
10. If a 7z archive reports that a password is needed and none was supplied, then the extraction service shall stop with the outcome "password missing".
11. If any decompression layer fails, including a non-zero result from bzip2 or gzip decompression or a truncated stream, then the extraction service shall stop with the outcome "corrupted archive" and report no members.
12. The extraction service shall pass archive passwords to any helper process only through a channel not visible to other local users (never as a command-line argument or environment variable visible in the process list).
13. The extraction service shall not write archive passwords to logs, error messages, audit records, queue payloads or failed-job records.
14. When extraction succeeds, the extraction service shall return, for each archive member, its path inside the archive, its stored member name, its format (extension), its size in bytes and its SHA-256 checksum.
15. The extraction service shall not return server file system paths to any API client.
16. The extraction service shall virus-scan, checksum and measure archive members with at most 5 members in progress at a time.

## Acceptance criteria
- **AC-1**: Given a zip archive holding `a.csv`, `b.csv` and `c.csv`, When it is extracted without a password, Then three members are returned with paths `a.csv`, `b.csv`, `c.csv`, their byte sizes and SHA-256 checksums. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-2**: Given a `.7z` archive uploaded interactively, When the file is processed, Then the archive is extracted by the extraction service (it is not passed to profiling as a single file). <!-- source: areas/ARC.md#summary -->
- **AC-3**: Given a `feed.tbz2` archive holding `orders.csv`, When it is processed on the upload path, Then `orders.csv` is extracted and profiled (no "Unsupported file type: .tbz2" failure). <!-- source: areas/ARC.md#bug -->
- **AC-4**: Given a `.rar` archive, When extraction is requested, Then the outcome is "unsupported format" with message `Archive format rar is not supported`. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-5**: Given a zip archive with an encrypted entry and no password, When extraction runs, Then the outcome is "password missing" and no members are returned. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-6**: Given the same archive and the password `wrong-pass`, When extraction runs, Then the outcome is "password incorrect". <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-7**: Given the same archive and the correct password, When extraction runs, Then all regular-file members are returned. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-8**: Given a password-protected 7z archive and no password, When extraction runs, Then the outcome is "password missing". <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-9**: Given a tar archive holding `data.csv` and a symbolic link `link.csv`, When extraction runs, Then only `data.csv` is returned. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-10**: Given a `.tar.bz2` archive truncated halfway through, When extraction runs, Then the outcome is "corrupted archive" and no members are returned. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-11**: Given extraction of a zip with the password `s3cr3t-Pa55`, When the process list, application logs and failed-job records are inspected during and after extraction, Then the string `s3cr3t-Pa55` appears in none of them. <!-- source: areas/ARC.md#security -->
- **AC-12**: Given an ETL job whose source is a zip archive, When the job reads the source, Then the archive is extracted by the same service and each member is virus-scanned by the shared scanner. <!-- source: areas/ARC.md#duplicate -->
- **AC-13**: Given an extraction result returned to an API client, When the response is inspected, Then it contains no absolute or relative server directory path. <!-- source: areas/ARC.md#security -->

## Out of scope
- Size, count and ratio limits (REQ-ARC-003).
- Path safety and member naming (REQ-ARC-004).
- Recording extraction attempts and members (REQ-ARC-005).
- Choosing which members are profiled and creating catalog entries for them (PROC area).
- Archive password lookup (REQ-ARC-007).

## Non-functional requirements
- At most 5 members are scanned and checksummed concurrently per archive; verified by a test that counts concurrent scanner calls on a 12-member archive.
- Members are streamed to storage; no member is held fully in memory. Verified with a member larger than the memory ceiling in REQ-ARC-003.

## Data volume and performance
- **Volume per run**: one archive of at most 25 MB compressed (REQ-ARC-003); member count and uncompressed size bounded by REQ-ARC-003.
- **Growth**: see Open questions.
- **Largest tenant**: see Open questions.
- **Time window**: extraction runs inside a processing job; no separate deadline exists today.
- **Memory ceiling**: see REQ-ARC-003.
- **Scale tests**: a 25 MB zip with the maximum allowed member count, extracted on every path listed in requirement 1.

## Edge cases and errors
- An archive with zero regular-file members extracts successfully with an empty member list; the processing pipeline decides how to report it.
- A zip that mixes encrypted and unencrypted entries, without a password: "password missing".
- A tar file named `.tar.gz` that is not actually gzip-compressed: detection classifies it from its bytes (REQ-ARC-001); if decompression then fails the outcome is "corrupted archive".
- Concurrent extraction of the same archive by a retry and an original job is prevented by the processing pipeline (REQ-ARC-014).

## Open questions
- How many archives per day, and of what size, does the largest project receive? Needed for the scale test and worker sizing.
- Should 7z archives with encrypted headers (file names hidden) be reported as "password missing" in the same way as encrypted content? The old behaviour relied on the error text containing "password" or "encrypted".
- Should nested archives (an archive inside an archive) be extracted recursively, or delivered as an archive member as they are today?
