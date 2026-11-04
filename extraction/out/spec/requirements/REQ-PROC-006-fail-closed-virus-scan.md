---
id: REQ-PROC-006
title: Fail-closed virus scan before any other processing
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-PROC-005, REQ-PROC-004]
contracts: []
priority: must
---
# REQ-PROC-006: Fail-closed virus scan before any other processing

## Context
Every staged file is scanned before anything else reads it. Today a scanner error or an unavailable scanner lets the file through with status `skipped` (SECURITY-5). The `clamav_unavailable` message says "File upload rejected as a security precaution", but no code path rejects the file. Scanning is also disabled by default in production (H4). An infected file stays on disk through two retries (BUG-4). Decision D9: scanning is enabled in production and fails closed. If a scan cannot complete, the file is quarantined and not processed. One scanner serves every ingestion path, archive members included.

## Requirements
1. When a processing job starts, the processing pipeline shall scan the staged file with the shared virus scanner before any other step reads the file.
2. When the scan reports no threat, the processing pipeline shall set the file's virus scan status to clean and continue.
3. If the scan reports one or more threats, then the processing pipeline shall set the virus scan status to infected, fail the file with failure reason virus_detected, record the detected threat names, and delete the staged file.
4. If the scan cannot complete (scanner unavailable, scanner error or scan time-out), then the processing pipeline shall set the virus scan status to not scanned, move the staged file to quarantine, and fail the file with failure reason clamav_unavailable.
5. If the scan cannot complete, then the processing pipeline shall not profile, copy, extract or store any content of the file.
6. While the service runs in production, the processing pipeline shall not offer a setting that disables the virus scan.
7. The processing pipeline shall not retry a job that failed with virus_detected or clamav_unavailable (REQ-PROC-003).
8. The processing pipeline shall show the user-facing message "File upload rejected as a security precaution" for clamav_unavailable.

## Acceptance criteria
- **AC-1**: Given a clean CSV, When the job runs, Then the virus scan status is clean and processing continues to the drop copy with progress 15. <!-- source: areas/PROC.md#queue-consumer-fileprocessingworkerprocessjob -->
- **AC-2**: Given the EICAR test file, When the job runs, Then the file fails with virus_detected, the threat name is recorded, the staged file no longer exists, and only one attempt ran. <!-- source: areas/PROC.md#bug -->
- **AC-3**: Given the scanner daemon is stopped, When the job runs, Then the virus scan status is not scanned, the file is failed with clamav_unavailable, the staged file is in quarantine, and the profiling service received no request for it. <!-- source: areas/PROC.md#security -->
- **AC-4**: Given the scanner returns an error, When the job runs, Then the outcome matches AC-3 and the file is not reported as skipped. <!-- source: areas/PROC.md#security -->
- **AC-5**: Given a production deployment with the scan-disable setting set to true, When the service starts, Then it refuses to start or ignores the setting, and files are still scanned. <!-- source: areas/PROC.md#security -->
- **AC-6**: Given a file failed with clamav_unavailable, When its status is read, Then the message is "File upload rejected as a security precaution". <!-- source: areas/PROC.md#security -->

## Out of scope
- The scanner service, its signatures and archive member scanning (ARC, F33).
- Releasing or deleting quarantined files (open question).

## Non-functional requirements
- Scan time-out value is an open question; a scan that exceeds it counts as "cannot complete".

## Data volume and performance
- **Volume per run**: one scan per staged file.
- **Growth**: unknown (open question).
- **Largest tenant**: unknown (open question).
- **Time window**: inline, before all other steps.
- **Memory ceiling**: the scanner streams the file; it is not loaded into the worker's memory.
- **Scale tests**: 20-file batch with the scanner available; same batch with the scanner stopped.

## Edge cases and errors
- Zero-byte file: scanned; a clean result continues to profiling, which handles the empty file.
- The scanner becomes available again later: quarantined files are not processed automatically (see open questions).

## Open questions
- Where is quarantine kept, who may release a quarantined file for re-processing, and how long is it kept?
- Should infected files be deleted at once (old behaviour on the last attempt) or kept in quarantine for review?
- Scan time-out value.
- Does a clamav_unavailable file get a failed-job entry so that it can be retried from the failed-job page?
