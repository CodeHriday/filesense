---
id: REQ-ARC-010
title: Virus definitions download and validation
module: cross-cutting
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-ARC-010: Virus definitions download and validation

## Context
The virus scanner is only as good as its definitions. Today they are downloaded to a hard-coded Replit path, with a fallback to plain HTTP, and "verified" only by printing the scanner version; the scanner counts definitions as present when either of the two main databases exists, while the download script requires both. With scanning fail-closed (D9), missing or broken definitions stop all ingestion, so the update must be reliable and authenticated.

## Requirements
1. The system shall read the definitions directory from configuration.
2. The system shall treat definitions as present only when both the `main` and `daily` databases exist in that directory.
3. When the `main`, `daily` or `bytecode` database is missing or older than 7 days, the system shall download it.
4. The system shall download definitions only over HTTPS, first from `https://packages.microsoft.com/clamav`, then from any configured HTTPS fallback mirror.
5. The system shall make up to 3 attempts per source and file, 2 seconds apart, each with a 30-second connect timeout and a 300-second total timeout.
6. The system shall bound one complete definitions update to 300 seconds.
7. When a download finishes, the system shall validate the databases by loading them with the scanner, and shall discard any file that fails to load.
8. The system shall replace an existing database only after its replacement has been validated.
9. If the update fails and validated `main` and `daily` databases are already present, then the system shall keep using them and log a warning.
10. If the update fails and validated `main` and `daily` databases are not present, then the system shall report definitions as unavailable, which makes scans "not scanned" (REQ-ARC-009).
11. The system shall log the outcome of every update attempt with the source used and the age of each database.

## Acceptance criteria
- **AC-1**: Given only `daily` is present, When the scanner checks definitions, Then definitions are treated as absent. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-2**: Given `main`, `daily` and `bytecode` are 3 days old, When the update runs, Then nothing is downloaded. <!-- source: areas/ARC.md#script-scriptsinit-clamavsh -->
- **AC-3**: Given `bytecode` is 8 days old, When the update runs, Then `bytecode` is downloaded. <!-- source: areas/ARC.md#script-scriptsinit-clamavsh -->
- **AC-4**: Given the primary source fails 3 times, When the update runs, Then the configured HTTPS fallback is tried and no plain-HTTP request is made. <!-- source: areas/ARC.md#security -->
- **AC-5**: Given a downloaded `daily` file that the scanner cannot load, When validation runs, Then the file is discarded and the previous valid `daily` stays in use. <!-- source: areas/ARC.md#security -->
- **AC-6**: Given no definitions at all and every source unreachable, When the update ends, Then definitions are reported unavailable and the next upload ends with failure reason `clamav_unavailable`. <!-- source: areas/ARC.md#script-scriptsinit-clamavsh -->
- **AC-7**: Given the definitions directory is configured as `/var/lib/clamav`, When the update runs, Then files are written there and nowhere else. <!-- source: areas/ARC.md#open-questions -->

## Out of scope
- Scanning itself (REQ-ARC-009).
- Container image build steps that bake definitions in (PLT area).

## Non-functional requirements
- One update completes or gives up within 300 seconds.
- Update frequency: at least once per 7 days per running scanner host.

## Data volume and performance
Not data-bearing: three database files of the scanner vendor's size.

## Edge cases and errors
- Two processes start an update at the same time on one host: only one downloads; the other waits for the result.
- Disk full during download: the partial file is discarded and the old database kept.
- Clock skew makes a file look older than 7 days: it is re-downloaded (harmless).

## Open questions
- Which HTTPS fallback mirror should be configured? The old fallback `database.clamav.net` was used over plain HTTP.
- Maximum acceptable definitions age before scans should be treated as "not scanned" (today stale definitions are used indefinitely if downloads keep failing).
- Should updates run on a schedule (for example daily) rather than only at scanner start-up as today?
