---
id: REQ-PROC-003
title: Retry only transient processing failures, with an enforced time limit
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-PROC-001, REQ-PROC-004]
contracts: []
priority: must
---
# REQ-PROC-003: Retry only transient processing failures, with an enforced time limit

## Context
Every producer queues processing jobs with 3 attempts, exponential backoff from 5000 ms and a 1800000 ms time limit. Today every exception is retried, including virus findings, vendor validation failures, quality aborts and missing passwords (BUG-4). Each retry writes failure records, audit entries, failed jobs and violations again. The in-memory queue never enforces the time limit (DEAD-5). The last-attempt check reads the wrong option name, so it always assumes 3 (BUG-5). Triage F28 (change) says deterministic failures are not retried.

## Requirements
1. The processing pipeline shall give each processing job at most 3 attempts.
2. When an attempt fails with a transient failure and attempts remain, the processing pipeline shall schedule the next attempt with exponential backoff starting at 5000 ms.
3. If an attempt fails with a deterministic failure, then the processing pipeline shall finish the job as failed without another attempt.
4. The processing pipeline shall treat these failure reasons as deterministic: virus_detected, clamav_unavailable, password_missing, extraction_failed, unsupported_encoding, malformed_file, empty_file, header_only_file, header_validation_failed, vendor_validation_failed, schema_validation_failed, and a quality rule abort.
5. The processing pipeline shall treat as transient: profiling service unreachable or timed out, database connection loss, storage read or write errors, and queue backend errors.
6. If an attempt runs longer than 1800000 ms, then the processing pipeline shall stop the attempt and count it as a failed attempt.
7. While a retry is pending, the processing pipeline shall keep the file's processing step at queued and shall not record the file as failed.
8. The processing pipeline shall decide whether an attempt is the last one from the job's own configured attempt count.
9. The processing pipeline shall write failure records, failed-job entries, violations and audit entries for a failure once per job, not once per attempt.

## Acceptance criteria
- **AC-1**: Given the profiling service is unreachable on attempts 1 and 2 and reachable on attempt 3, When the job runs, Then attempt 2 starts about 5 s after attempt 1, attempt 3 about 10 s after attempt 2, and the file ends complete. <!-- source: areas/PROC.md#business-rules-literal-values -->
- **AC-2**: Given the profiling service is unreachable on all attempts, When attempt 3 fails, Then the file ends in the failed step and no fourth attempt is scheduled. <!-- source: areas/PROC.md#business-rules-literal-values -->
- **AC-3**: Given a file whose scan reports a virus, When attempt 1 fails, Then the job is finally failed with failure reason virus_detected and no further attempt is scheduled. <!-- source: areas/PROC.md#bug -->
- **AC-4**: Given a vendor delivery that fails vendor validation, When attempt 1 fails, Then exactly one failure record and one failed audit entry exist for the job. <!-- source: areas/PROC.md#bug -->
- **AC-5**: Given an archive without a password, When attempt 1 fails with password_missing, Then exactly one failed job exists for the file and no retry is scheduled. <!-- source: areas/PROC.md#bug -->
- **AC-6**: Given an attempt still running at 1800001 ms, When the time limit passes, Then the attempt is stopped and counted as failed. <!-- source: areas/PROC.md#dead -->
- **AC-7**: Given a job configured with 2 attempts, When attempt 2 fails transiently, Then it is treated as the last attempt. <!-- source: areas/PROC.md#bug -->
- **AC-8**: Given attempt 1 failed transiently and attempt 2 is pending, When the file's status is read, Then its processing step is queued. <!-- source: areas/PROC.md#bug -->

## Out of scope
- Re-processing a finally failed file on user request (REQ-PROC-032).
- Failure reason vocabulary (REQ-PROC-004).

## Non-functional requirements
- Backoff: 5 s before attempt 2 and 10 s before attempt 3, tolerance ±1 s, measured from attempt end to next attempt start.
- Time limit per attempt: 1800000 ms (30 min).

## Data volume and performance
Not data-bearing: policy over existing jobs.

## Edge cases and errors
- An error that has no typed failure reason is treated as transient, and is classified as conversion_failed if it is still failing after the last attempt.
- A worker restart during the backoff delay: the delayed attempt still runs (REQ-PROC-001).

## Open questions
- Should a timed-out attempt be retried, given three attempts can take 90 minutes?
- Should clamav_unavailable be retried automatically after a delay, or only by a user request, given D9 says quarantine and do not process?
- Which failure reason applies to a quality rule abort (REQ-PROC-004)?
