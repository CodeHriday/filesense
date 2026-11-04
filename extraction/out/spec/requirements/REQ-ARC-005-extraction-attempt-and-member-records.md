---
id: REQ-ARC-005
title: Record each extraction attempt and its archive members
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-ARC-002, REQ-ARC-004]
contracts: []
priority: must
---
# REQ-ARC-005: Record each extraction attempt and its archive members

## Context
Operators and the processing pipeline need to know what was inside an archive, whether extraction worked and whether a password was involved. Today an extraction record and per-member records are written only by one of the four implementations; the pipeline's own member inserts target columns that do not exist; a retry of the same archive collides with the member records of the first attempt and silently drops members; and the "password required" flag for 7z comes from a byte heuristic that is almost always true. This requirement keeps the record-keeping and makes it reliable on every path.

## Requirements
1. When extraction of an archive that has a catalog file starts, the system shall create an extraction record for that file with status `in_progress` and the start time.
2. When that extraction succeeds, the system shall set the extraction record to `completed` with the number of members extracted and the completion time.
3. When that extraction fails, the system shall set the extraction record to `failed` with the completion time and a safe error message that contains no password and no server path.
4. The system shall record on the extraction record whether the archive was password-protected, set to true when a zip entry has the encryption flag (general-purpose bit 0x01) or when a 7z archive required a password, and false otherwise.
5. When a member is extracted, the system shall record it with its parent archive file, logical name (path inside the archive), original name (base name), format (extension), size in bytes, status `completed` and extraction time.
6. The system shall keep at most one member record per parent archive file and logical name.
7. When the same archive is extracted again, the system shall replace the member records of the earlier attempt with those of the new attempt, so that the member records match the latest successful extraction.
8. If extraction fails, then the system shall leave the member records of the last successful extraction unchanged.
9. The system shall store all times on these records in UTC.
10. Every ingestion path that uses the extraction service shall produce these records.

## Acceptance criteria
- **AC-1**: Given an uploaded zip with 2 members, When extraction succeeds, Then its extraction record has status `completed`, member count 2, and a completion time later than or equal to its start time. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-2**: Given an uploaded zip whose extraction fails as "corrupted archive", When the record is read, Then status is `failed` and the error message contains no directory path. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-3**: Given an unencrypted 7z archive, When it is extracted, Then the extraction record says not password-protected. <!-- source: areas/ARC.md#bug -->
- **AC-4**: Given a zip with one entry flagged 0x01, When it is extracted with the correct password, Then the extraction record says password-protected. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-5**: Given a zip containing `reports/q1.csv` of 1,024 bytes, When it is extracted, Then a member record exists with logical name `reports/q1.csv`, original name `q1.csv`, format `csv`, size 1,024 and status `completed`. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-6**: Given an archive extracted once with 3 members, When the same file is extracted again by a retry, Then the retry succeeds and exactly 3 member records exist for the file (no unique-constraint failure, no dropped members). <!-- source: areas/ARC.md#bug -->
- **AC-7**: Given an archive with 3 recorded members, When a later extraction attempt fails, Then the 3 member records remain. <!-- source: areas/ARC.md#bug -->
- **AC-8**: Given a zip extracted as an ETL job source, When the job finishes, Then an extraction record and member records exist for that source file. <!-- source: areas/ARC.md#duplicate -->

## Out of scope
- Creating catalog file entries for members, and choosing which member is profiled (PROC area).
- Showing member lists in the UI.

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: one extraction record and up to the member-count limit of member records (REQ-ARC-003).
- **Growth**: one extraction record per attempt; see Open questions.
- **Largest tenant**: unknown; see Open questions.
- **Time window**: written inside the processing job.
- **Memory ceiling**: member records are written in batches, not built in memory for the whole archive; batch size to be set with the member-count limit.
- **Scale tests**: an archive at the member-count limit, extracted twice.

## Edge cases and errors
- Archives with no catalog file (for example a bulk validation job reading cloud storage without cataloguing): see Open questions.
- Two members whose logical names differ only in case are different members.
- Infected members removed by the scan (REQ-ARC-009) get no member record.

## Open questions
- Should extraction records be kept for every attempt (history) or only the latest per file? Old code kept every attempt.
- For paths that extract without a catalog file (bulk validation jobs, ETL sources not catalogued), which entity should own the extraction and member records? Old code wrote them only when a catalog file id was supplied.
- Should infected members be recorded with an `infected` status for audit instead of being omitted?
