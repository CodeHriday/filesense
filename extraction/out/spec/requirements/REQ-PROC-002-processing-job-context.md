---
id: REQ-PROC-002
title: Processing job captures the full file context, without secrets, atomically with the queued step
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-PROC-001]
contracts: []
priority: must
---
# REQ-PROC-002: Processing job captures the full file context, without secrets, atomically with the queued step

## Context
Every producer (upload, drop, re-profile, API upload, retry) gives the pipeline a file plus the settings needed to process it. Today the job carries the archive password in plaintext (SECURITY-3, C9). Recovered jobs lose the user, checksum and requested rules (BUG-6). The re-profile producer marks the file queued after adding the job, which can overwrite progress the worker already wrote. The upload placeholder is created separately from the job, which leaves orphaned rows (ING BUG-10). The decisions are F23 (placeholder and job created atomically), F32 (passwords only in the password vault, referenced by id) and F30 (the durable queue keeps context).

## Requirements
1. When a producer submits a file for processing, the processing pipeline shall record a processing job holding: file id, staged file reference, original filename, file size, file type, submitting user, checksum, project, sub-project, requested rule assignment ids, vendor agreement, delimiter, header configuration, fixed-width layout, archive password reference, drop location reference, delivery source and vendor delivery flag.
2. The processing pipeline shall accept only these delivery sources: upload, drop, re-profile, API upload, retry.
3. The processing pipeline shall not store an archive password, connection credential or other secret in a processing job; an archive password shall be referenced only by its password vault entry.
4. When a file is submitted, the processing pipeline shall set the file's processing step to queued and create the processing job in one atomic action.
5. If creating the processing job fails, then the processing pipeline shall leave no file in the queued step for that submission.
6. If a processing job that is not final already exists for the file, then the processing pipeline shall reject the new submission with a conflict outcome and leave the existing job unchanged.
7. If the file does not exist, the project in the submission differs from the file's project, or the staged file reference points outside the staging area, then the processing pipeline shall reject the submission with a validation outcome.
8. After the processing job is accepted, only the consumer shall change the file's processing step until the job is final.
9. The processing pipeline shall keep the processing job's context unchanged across retries and recovery, so that every attempt runs with the same user, checksum, requested rules, agreement and settings.

## Acceptance criteria
- **AC-1**: Given an upload that includes an archive password, When the processing job is recorded, Then the job holds a password vault reference and no field of the job, its logs or its stored error contains the password. <!-- source: areas/PROC.md#security -->
- **AC-2**: Given an upload whose job creation fails, When the file is looked up, Then it is not in the queued step and no file row is left behind for that submission. <!-- source: areas/PROC.md#producers-who-enqueues-file-processing-jobs -->
- **AC-3**: Given a file with a running processing job, When a re-profile is submitted for it, Then the submission is rejected as a conflict and the running job continues unaffected. <!-- source: areas/PROC.md#bug -->
- **AC-4**: Given a re-profile submission is accepted, When the consumer has already set the step to profiling, Then the step is not reset to queued by the producer. <!-- source: areas/PROC.md#producers-who-enqueues-file-processing-jobs -->
- **AC-5**: Given a drop delivered through a connection, When the job is recorded, Then its delivery source is drop and its vendor delivery flag is true. <!-- source: areas/PROC.md#producers-who-enqueues-file-processing-jobs -->
- **AC-6**: Given a submission whose staged file reference resolves outside the staging area, When it is submitted, Then it is rejected with a validation outcome and no job is created. <!-- source: areas/PROC.md#security -->
- **AC-7**: Given a job for user U with checksum C and requested rules [R1, R2], When the job is retried or recovered, Then the attempt runs with user U, checksum C and rules [R1, R2]. <!-- source: areas/PROC.md#bug -->
- **AC-8**: Given a submission with delivery source "import", When it is submitted, Then it is rejected with a validation outcome. <!-- source: areas/PROC.md#producers-who-enqueues-file-processing-jobs -->

## Out of scope
- How producers authenticate and authorise the caller and compute the checksum (ING F23, API F111, SCH F47, ARC F29).
- Storing the password in the password vault (ARC).
- Queue durability (REQ-PROC-001).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: one small record per submitted file.

## Edge cases and errors
- Two producers submit the same file at the same moment: exactly one succeeds; the other gets the conflict outcome.
- A submission with no submitting user (system drop): accepted; ownership falls back as in REQ-PROC-019.
- A drop submission without sub-project, checksum or delimiter: accepted with those fields empty (old drop producer sent none of them).

## Open questions
- Should the checksum always be supplied by the producer (ING F23 says the server computes it), or may the pipeline compute it when it is missing?
- Is a conflict the right outcome for a re-profile requested while processing runs, or should it be queued behind the running job?
- Which delivery source applies to a file re-processed through the failed-job page: retry, or the original source?
