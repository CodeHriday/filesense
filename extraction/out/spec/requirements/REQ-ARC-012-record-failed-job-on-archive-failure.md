---
id: REQ-ARC-012
title: Record a failed job when archive handling fails
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-ARC-011]
contracts: []
priority: must
---
# REQ-ARC-012: Record a failed job when archive handling fails

## Context
Archives that cannot be opened need manual action, such as supplying a password or asking the vendor for a new copy. Today the pipeline parks these as failed jobs, but the record stores the plaintext password and the temporary server path, has no file or project link (so it cannot be scoped), is duplicated on every automatic retry, and leaves the catalog row without a failure reason, so the catalog never offers the password prompt. Triage F34 keeps failed jobs as the operator's queue, project-scoped and free of secrets.

## Requirements
1. When processing of a file ends with an archive failure reason from REQ-ARC-011, the system shall record a failed job for that file.
2. The failed job shall hold the file, the file's project, the job type `archive_extraction`, the failure reason, the message, the remediation text, status `pending`, retry count 0, and the creation time in UTC.
3. The failed job shall not hold any password, server file path, stack trace or raw library error text.
4. If the file already has a failed job with status `pending` or `failed`, then the system shall update that failed job instead of creating another one.
5. When the failure reason is `password_missing` or `password_incorrect`, the system shall set the file's processing step to `password_required` and its failure reason to that reason.
6. When the failure reason is any other archive failure reason, the system shall set the file's processing step to `failed` and its failure reason to that reason.
7. The system shall set the file's processing error to the failed job's message.
8. The system shall not retry an archive failure automatically.
9. The system shall write an audit log entry for the archive failure naming the file, the failure reason and the system as actor.

## Acceptance criteria
- **AC-1**: Given an encrypted zip uploaded to project 7 with no password, When processing ends, Then one failed job exists with the file, project 7, type `archive_extraction`, failure reason `password_missing`, status `pending` and retry count 0. <!-- source: areas/ARC.md#internal-entry-archive-handling-in-the-file-processing-worker-proc-owned-arc-behaviour -->
- **AC-2**: Given the same file, When the catalog row is read, Then its processing step is `password_required` and its failure reason is `password_missing`. <!-- source: areas/ARC.md#bug -->
- **AC-3**: Given a zip uploaded with password `Pw-123` that fails as "corrupted archive", When the failed job is read through any API or directly from storage, Then the string `Pw-123` and the upload directory path do not appear. <!-- source: areas/ARC.md#security -->
- **AC-4**: Given a password-protected archive that fails, When processing ends, Then exactly one failed job exists for the file (no second or third job from automatic retries). <!-- source: areas/ARC.md#internal-entry-archive-handling-in-the-file-processing-worker-proc-owned-arc-behaviour -->
- **AC-5**: Given a file with a `pending` failed job whose re-run fails again with `password_incorrect`, When processing ends, Then the same failed job now shows failure reason `password_incorrect` and no new failed job exists. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-6**: Given a file whose earlier failed job is `resolved` and which fails again later, When processing ends, Then a new failed job is created with status `pending`. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-7**: Given a 30 MB archive, When processing ends, Then the file's processing step is `failed`, its failure reason is `archive_limit_exceeded` and its processing error is the size message. <!-- source: areas/ARC.md#business-rules-with-literal-values -->

## Out of scope
- Status changes after retries (REQ-ARC-016).
- Failures that are not archive failures (see Open questions).

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: one failed job per failed archive file.
- **Growth**: unknown; see Open questions.
- **Largest tenant**: unknown.
- **Time window**: written at the end of the processing job.
- **Memory ceiling**: not applicable.
- **Scale tests**: none beyond the list in REQ-ARC-013.

## Edge cases and errors
- Writing the failed job fails: the file's processing step and failure reason are still set, and the error is logged; the processing job ends as failed.
- A file without a project (if allowed by the ingestion area): see Open questions.
- `virus_detected` on an archive member does not fail the archive (REQ-ARC-009), so no failed job is recorded for it.

## Open questions
- Should failed jobs cover every processing failure (glossary: "a file processing failure parked for manual action") or only archive failures, as today and as the page title "Failed Archive Extraction Jobs" says?
- Should a `virus_detected` archive or a `clamav_unavailable` quarantine create a failed job? Today a scan failure never reached the failed-job store.
- Expected number of failed jobs per month for the largest project, and how long resolved failed jobs are kept.
- Can a file exist without a project? If so, how is its failed job scoped?
