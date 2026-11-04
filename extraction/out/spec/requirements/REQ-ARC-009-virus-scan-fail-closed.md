---
id: REQ-ARC-009
title: One fail-closed virus scanner for files and archive members
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-ARC-010]
contracts: []
priority: must
---
# REQ-ARC-009: One fail-closed virus scanner for files and archive members

## Context
Files come from external vendors and must be checked for malware before anyone opens them. Today scanning is effectively off: the production bootstrap disables it, the main scanner lets every file through when ClamAV is missing or errors, ETL archive extraction uses a mock scanner, and once scanner start-up fails it is skipped for the life of the process. Decision D9 makes scanning enabled in production and fail-closed, with one scanner used by every ingestion path including archive members and ETL sources (triage F33).

## Requirements
1. The system shall use one virus scanner for every ingestion path: interactive upload, drop, API upload, bulk validation and profiling jobs, ETL job sources, and every extracted archive member.
2. While the system runs in production, the virus scanner shall be enabled and no configuration shall disable it.
3. If production start-up finds scanning disabled by configuration, then the system shall not report ready.
4. The virus scanner shall give each scan one of three results: clean, infected (with the detected signature names) or not scanned (with the reason).
5. When a delivered file is clean, the system shall record virus scan status "clean" on the file and continue processing.
6. When a delivered file is infected, the system shall stop processing it, record virus scan status "infected" and failure reason `virus_detected`.
7. If a scan cannot complete (scanner missing, definitions missing, scanner error or scan timeout), then the system shall stop processing the file, record virus scan status "not scanned" and failure reason `clamav_unavailable`, and quarantine the file.
8. While a file is quarantined, the system shall not profile it, preview it or make its content available to users.
9. When an archive member is infected, the extraction service shall delete that member, leave it out of the member list, log the signature names, and continue with the other members.
10. If the scan of any archive member cannot complete, then the extraction service shall fail the whole archive with failure reason `clamav_unavailable` and remove all its members.
11. If scanner initialisation fails, then the virus scanner shall attempt initialisation again on the next scan request instead of staying unavailable for the life of the process.
12. The virus scanner shall not treat "not scanned" as clean on any path.

## Acceptance criteria
- **AC-1**: Given the EICAR test file uploaded as `test.csv`, When it is processed, Then processing stops, virus scan status is "infected" and failure reason is `virus_detected`. <!-- source: areas/ARC.md#internal-entry-archive-handling-in-the-file-processing-worker-proc-owned-arc-behaviour -->
- **AC-2**: Given the scanner binary is absent, When a clean CSV is uploaded, Then the file is not profiled, virus scan status is "not scanned", failure reason is `clamav_unavailable`, and its processing step is not `complete`. <!-- source: areas/ARC.md#security -->
- **AC-3**: Given the definitions are missing, When a file is processed, Then the result is the same as AC-2. <!-- source: areas/ARC.md#security -->
- **AC-4**: Given a production configuration that sets scanning off, When the service starts, Then readiness reports not ready. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-5**: Given a zip holding `clean.csv` and the EICAR file `bad.csv`, When it is extracted, Then `clean.csv` is returned, `bad.csv` is deleted and not returned, and the log names the detected signature. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-6**: Given a zip of 3 members where the scan of the second member times out, When it is extracted, Then the archive fails with `clamav_unavailable` and no members remain. <!-- source: areas/ARC.md#security -->
- **AC-7**: Given an ETL job whose source zip holds the EICAR file, When the job reads the source, Then the infected member is removed by the same scanner (no member passes as "skipped"). <!-- source: areas/ARC.md#security -->
- **AC-8**: Given the scanner failed to initialise at start-up and the definitions are installed afterwards, When the next file is scanned, Then the scan completes and returns clean or infected. <!-- source: areas/ARC.md#dead -->
- **AC-9**: Given an API upload of a clean file, When it is scanned, Then it is treated as clean (not rejected as infected). <!-- source: areas/ARC.md#security -->

## Out of scope
- Deleting infected uploads and the processing step sequence (PROC area).
- Downloading and validating definitions (REQ-ARC-010).
- How a quarantined file is retried (REQ-ARC-014).

## Non-functional requirements
- Scan timeout per file: to be set (see Open questions); a timeout counts as "not scanned".
- Scanner availability is part of readiness in production.

## Data volume and performance
- **Volume per run**: one scan per delivered file plus one per archive member.
- **Growth**: follows ingestion volume; unknown, see Open questions.
- **Largest tenant**: unknown.
- **Time window**: scans run inside the processing job.
- **Memory ceiling**: the scanner runs out of process; the worker streams the file to it.
- **Scale tests**: an archive at the member-count limit with every member scanned, measuring total scan time.

## Edge cases and errors
- Scanner returns an unexpected exit status: "not scanned".
- Zero-byte file: scanned like any other.
- Concurrent scans: bounded by the member concurrency of 5 per archive (REQ-ARC-002) and by worker concurrency (PROC).

## Open questions
- Per-file scan timeout value.
- Where quarantined files are kept, for how long, and who may release or delete them.
- Should an archive with an infected member be rejected as a whole instead of continuing with the clean members (old behaviour)?
- May non-production environments disable scanning, and how is "production" determined?
- Should the scanner run as a daemon (clamd) to avoid per-file start-up cost? Old code ran the command-line scanner per file.
