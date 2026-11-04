---
id: REQ-PROC-005
title: Pipeline step order, progress and typed outcome per processing job
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-PROC-001, REQ-PROC-004]
contracts: []
priority: must
---
# REQ-PROC-005: Pipeline step order, progress and typed outcome per processing job

## Context
The consumer runs a fixed sequence of steps for each file and reports a 0-100 progress number on the job. Today some steps swallow errors, some throw, and archives return early and skip most steps (BUG-12). An error raised outside the main error handler leaves the job neither failed nor completed (BUG-20). D7 says a DQ abort or a failed file fails the job, completed_with_warnings is allowed, and callers check typed results. This shard fixes the step order and defines the typed result that the other PROC shards produce.

## Requirements
1. The processing pipeline shall run the steps for a file in this order: virus scan, drop copy, archive extraction (archives only), profiling, header check, duplicate count, vendor validation (vendor deliveries only), store profile summary, link requested rules, ownership, store column profiles, store preview data, agreement file schema governance, schema capture, quality rule validation, completion.
2. The processing pipeline shall run the same steps after archive extraction as for any other file, using the primary archive member's results.
3. The processing pipeline shall set the job progress to 10 when the job starts, 15 after the virus scan, 20 after the drop copy, 30 when profiling starts, 50 after profiling, 70 after the header check, 75 before the profile summary is stored, 85 after ownership, 90 after governance and 100 at completion.
4. Each step shall return a typed result of succeeded, succeeded with warnings or failed, and a failed result shall carry a failure reason.
5. If a required step returns failed, then the processing pipeline shall stop running further steps and record the failure (REQ-PROC-026).
6. The processing pipeline shall treat as required: virus scan, archive extraction, profiling, vendor validation, store profile summary, store column profiles and quality rule validation.
7. If an optional step (drop copy, link requested rules, ownership, store preview data, governance other than a schema rule abort, schema snapshot, cache refresh) fails, then the processing pipeline shall record a step warning and continue.
8. When all steps finish, the processing pipeline shall end the job with a typed result whose outcome is completed, completed_with_warnings or failed.
9. The processing pipeline shall set the outcome to completed_with_warnings when quality rule validation raised warn-level violations and no step failed.
10. If an error escapes every step's handling, then the processing pipeline shall mark the file failed and the job failed, and shall not leave the job waiting or active.
11. The typed result shall include: outcome, file id, failure reason when failed, row count, column count, processing time in milliseconds, and the list of step warnings.

## Acceptance criteria
- **AC-1**: Given a CSV upload that passes every step, When the job ends, Then progress reads 100, the outcome is completed and the step warnings list is empty. <!-- source: areas/PROC.md#queue-consumer-fileprocessingworkerprocessjob -->
- **AC-2**: Given a file where the drop copy fails, When the job ends, Then the outcome is completed and the step warnings list names the drop copy. <!-- source: areas/PROC.md#queue-consumer-fileprocessingworkerprocessjob -->
- **AC-3**: Given a file where a warn-level rule raises 3 violations, When the job ends, Then the outcome is completed_with_warnings. <!-- source: areas/PROC.md#queue-consumer-fileprocessingworkerprocessjob -->
- **AC-4**: Given a file where a rule with violation action abort raises violations, When the job ends, Then the outcome is failed and no later step ran. <!-- source: areas/PROC.md#unclear -->
- **AC-5**: Given the first audit write throws before the steps start, When the job ends, Then the file is failed and the job is failed, not left waiting. <!-- source: areas/PROC.md#bug -->
- **AC-6**: Given a zip archive with one CSV member, When the job ends successfully, Then ownership, rule linking, governance, schema capture and quality validation all ran for the archive's file. <!-- source: areas/PROC.md#bug -->
- **AC-7**: Given a job that fails at profiling, When its typed result is read, Then the outcome is failed, the failure reason is set, and the last progress value is 30. <!-- source: areas/PROC.md#queue-consumer-fileprocessingworkerprocessjob -->

## Out of scope
- The behaviour of each step (REQ-PROC-006 to REQ-PROC-025).
- How producers read the typed result (ING, SCH, API, ARC must check it).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: control flow per job.

## Edge cases and errors
- A step that is not applicable (drop copy without a drop location, vendor validation for an upload, extraction for a non-archive) is recorded as skipped, not as a warning.
- Progress never decreases within one attempt; a new attempt restarts at 10.

## Open questions
- Should ownership, rule linking and governance failures fail the file instead of producing warnings? The old code continued after them.
- Should optional-step warnings also give completed_with_warnings? D7 defines that outcome only for warn-level violations.
- The old domain terms list a progress value of 92 that the extracted code does not place; is a step missing?
