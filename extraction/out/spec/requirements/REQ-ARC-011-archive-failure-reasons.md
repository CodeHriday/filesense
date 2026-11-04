---
id: REQ-ARC-011
title: Archive failure reasons, messages and remediation texts
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-ARC-002, REQ-ARC-003, REQ-ARC-009]
contracts: []
priority: must
---
# REQ-ARC-011: Archive failure reasons, messages and remediation texts

## Context
When an archive cannot be processed, users need to know why and what to do. Today three classifiers disagree: the failed-job store uses upper-case codes derived by case-sensitive substring tests on error text, the pipeline uses lower-case failure codes some of which the database rejects, and a route uses yet another substring test. The glossary makes failure reason one enumerated set. This requirement maps each archive outcome to one failure reason from that set, from the typed outcome of the extraction service rather than from message text, and keeps the old user-facing messages and remediation texts.

## Requirements
1. The system shall derive the failure reason of an archive failure from the typed outcome reported by the extraction service and the virus scanner, not from error-message text.
2. When the outcome is "password missing", the system shall set failure reason `password_missing`, message `Archive is password-protected but no password was provided`, and remediation `Provide the archive password from the file catalog, the Failed jobs page or the vendor agreement settings`.
3. When the outcome is "password incorrect", the system shall set failure reason `password_incorrect`, message `Archive password is incorrect or encryption method is not supported`, and remediation `Verify the password is correct or contact the vendor for the correct password`.
4. When the outcome is "limit exceeded" for the compressed size, the system shall set failure reason `archive_limit_exceeded`, the size message from REQ-ARC-003, and remediation `Archive exceeds the 25 MB size limit. Please request a smaller archive from the vendor`.
5. When the outcome is "limit exceeded" for member count, total size or expansion ratio, the system shall set failure reason `archive_limit_exceeded` and the message naming the limit from REQ-ARC-003.
6. When the outcome is "unsupported format", the system shall set failure reason `unsupported_format`, message `Archive format <type> is not supported`, and remediation `Archive format is not supported. Supported formats: ZIP, 7z, TAR, TAR.GZ, TAR.BZ2`.
7. When the outcome is "corrupted archive", the system shall set failure reason `extraction_failed`, and remediation `Archive file appears to be corrupted. Please request a new copy from the vendor`.
8. When the archive file itself is infected, the system shall set failure reason `virus_detected` and remediation `Virus or malware detected in extracted file. Contact vendor immediately`.
9. When a scan could not complete, the system shall set failure reason `clamav_unavailable`.
10. If extraction fails for a server fault (storage unavailable, vault unreachable, disk full), then the system shall not assign a content failure reason; the processing job shall fail as a server fault that can be retried, with remediation `Review error message and contact support if issue persists`.
11. The system shall not continue processing an archive after any failure in requirements 2 to 9; the profiling service shall not be called with the archive.
12. The system shall not put passwords, server paths, stack traces or library error text in failure messages or remediation texts.

## Acceptance criteria
- **AC-1**: Given an encrypted zip and no password available, When it is processed, Then the file's failure reason is `password_missing` with the message and remediation in requirement 2. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-2**: Given an encrypted zip and a wrong password, When it is processed, Then the failure reason is `password_incorrect` (not `password_missing`, not `extraction_failed`). <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-3**: Given a 30 MB zip, When it is processed, Then the failure reason is `archive_limit_exceeded` and the remediation mentions the 25 MB limit. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-4**: Given a `.rar` archive, When it is processed, Then the failure reason is `unsupported_format` and the message is `Archive format rar is not supported`. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-5**: Given a truncated tar.gz, When it is processed, Then the failure reason is `extraction_failed` and the profiling service receives no request for that file. <!-- source: areas/ARC.md#internal-entry-archive-handling-in-the-file-processing-worker-proc-owned-arc-behaviour -->
- **AC-6**: Given an extraction error whose library text contains the word "invalid password" but whose typed outcome is "corrupted archive", When it is classified, Then the reason is `extraction_failed` (text is not inspected). <!-- source: areas/ARC.md#duplicate -->
- **AC-7**: Given the stored archive cannot be read because storage is down, When processing runs, Then no content failure reason is set and the job is reported as a retryable server fault. <!-- source: areas/ARC.md#bug -->
- **AC-8**: Given any archive failure, When the file's failure message is read, Then it contains no directory path and no password. <!-- source: areas/ARC.md#security -->

## Out of scope
- The complete failure-reason set for non-archive failures (PROC area).
- Display labels (REQ-ARC-019).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing.

## Edge cases and errors
- An archive that is both too large and encrypted: the size check runs first, so `archive_limit_exceeded`.
- A 7z archive with an unsupported encryption method and a supplied password: `password_incorrect`, matching the old message.

## Open questions
- `password_incorrect`, `archive_limit_exceeded` and `unsupported_format` are not in the old failure-reason enum. The PROC owner of the failure-reason set must confirm these names (old upper-case equivalents: `INVALID_PASSWORD`, `FILE_SIZE_EXCEEDED`, `UNSUPPORTED_FORMAT`).
- Remediation text for `clamav_unavailable`. The old pipeline message was "File upload rejected as a security precaution"; no remediation existed.
- Remediation for limits other than the 25 MB size (member count, total size, ratio).
- The remediation for `virus_detected` says "extracted file" even when the archive itself is infected. Should the wording change?
