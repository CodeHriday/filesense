---
id: REQ-PROC-004
title: One enforced vocabulary for processing step, failure reason and virus scan status
module: database
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-PROC-004: One enforced vocabulary for processing step, failure reason and virus scan status

## Context
Today a file's processing step takes eleven values from several writers. The upload page understands only five of them, and the glossary names six. Failure reasons are derived by substring matching on error messages, so wrong codes come out (BUG-21). The worker writes four codes that the stored set does not allow (X9). Password-required files get no failure reason, so the catalog shows no password action. The virus scan status uses `completed`/`skipped`, while the glossary uses clean, infected, not scanned. The global rule is one enumerated set per concept, enforced by constraints that the code matches.

## Requirements
1. The system shall store a file's processing step only as one of: queued, scanning, profiling, complete, failed, password_required.
2. The processing pipeline shall use scanning while it runs the virus scan, the drop copy and archive extraction, and profiling while it runs every later step until the file is complete, failed or password_required.
3. The system shall store a file's failure reason only as one of: virus_detected, password_missing, clamav_unavailable, unsupported_encoding, extraction_failed, schema_validation_failed, empty_file, header_only_file, header_validation_failed, vendor_validation_failed, conversion_failed, malformed_file.
4. The processing pipeline shall set the failure reason from the typed result of the step that failed, never by matching text in an error message.
5. When a file enters password_required, the processing pipeline shall set its failure reason to password_missing.
6. While a file's processing step is not failed or password_required, the system shall keep its failure reason empty.
7. The system shall store a file's virus scan status only as one of: clean, infected, not scanned.
8. The system shall give each failure reason a fixed user-facing message that contains no library error text, stack trace or server path.
9. The system shall show these labels for failure reasons: virus_detected "Virus Detected", password_missing "Password Required", unsupported_encoding "Encoding Error", conversion_failed "Conversion Failed", extraction_failed "Extraction Failed", clamav_unavailable "Security Check Failed", malformed_file "Invalid Format", schema_validation_failed "Schema Mismatch".

## Acceptance criteria
- **AC-1**: Given a write of processing step "analyzing", When it is stored, Then the database rejects it. <!-- source: areas/PROC.md#get-apifilesfileidstatus -->
- **AC-2**: Given a write of failure reason "vendor_validation_failed", When it is stored, Then it is accepted (the old stored set rejects it). <!-- source: areas/PROC.md#business-rules-literal-values -->
- **AC-3**: Given the profiling step fails with the message "Archive requires password. Please provide a password and retry.", When the failure is recorded, Then the reason comes from the step's typed result and not from the words in the message. <!-- source: areas/PROC.md#bug -->
- **AC-4**: Given an archive that needs a password, When it enters password_required, Then its failure reason is password_missing and the catalog's password action is available. <!-- source: areas/ARC.md#internal-entry-archive-handling-in-the-file-processing-worker-proc-owned-arc-behaviour -->
- **AC-5**: Given a file that failed and is then re-processed successfully, When it reaches complete, Then its failure reason and failure message are empty. <!-- source: areas/PROC.md#producers-who-enqueues-file-processing-jobs -->
- **AC-6**: Given a write of virus scan status "skipped", When it is stored, Then the database rejects it. <!-- source: areas/PROC.md#queue-consumer-fileprocessingworkerprocessjob -->
- **AC-7**: Given a failure with reason conversion_failed, When the user-facing message is read, Then it is the fixed message for that reason and does not start with "Processing failed: " followed by the raw error. <!-- source: areas/PROC.md#business-rules-literal-values -->
- **AC-8**: Given a file with failure reason clamav_unavailable, When its badge is shown, Then the label is "Security Check Failed". <!-- source: areas/ARC.md#business-rules-with-literal-values -->

## Out of scope
- The failed-job (dead-letter) error codes, which ARC owns; ARC must map them to these failure reasons.
- The job status vocabulary for mapping jobs (D7, EXE).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: vocabulary and constraints.

## Edge cases and errors
- Existing rows with old step values need a data migration: analyzing, header_validation, duplicates, schema and quality_validation become profiling; processing becomes queued. NULL steps are an open question.
- Existing rows with virus scan status completed map to clean; skipped maps to not scanned.

## Open questions
- Should the step set be finer (for example separate extracting and validating steps) for the upload page? The old worker wrote analyzing, profiling, header_validation, duplicates, schema and quality_validation.
- Which failure reason applies to a quality rule abort and to an attempt time-out? No old code assigns one. Is a new code (for example quality_abort) wanted?
- Labels for empty_file, header_only_file, header_validation_failed and vendor_validation_failed, and the fixed message texts for all codes. Only one old actionable text was extracted, for clamav_unavailable: "File upload rejected as a security precaution".
- Should clamav_unavailable be renamed to a scanner-neutral code?
- Is there a separate step for a quarantined file, or is it failed with clamav_unavailable (REQ-PROC-006)?
- How should old rows with a NULL processing step be migrated?
- Baseline per D1: confirm the current stored failure reason set against a fresh prod dump.
