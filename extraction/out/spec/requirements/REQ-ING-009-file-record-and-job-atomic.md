---
id: REQ-ING-009
title: Create the file record and its processing job together
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-ING-004, REQ-ING-005, REQ-ING-007]
contracts: []
priority: must
---
# REQ-ING-009: Create the file record and its processing job together

## Context
Each accepted file gets a catalog row in processing step `queued` and a processing job. Today the row is written first and its failure is ignored; if storing the archive password or queueing fails, the row stays at `queued` forever. The row also omits the sub-project, the agreement and the uploader, so jobs recovered after a restart lose context. The F23 decision is that the placeholder and job are created atomically. The F28 and F30 decisions require that a job keep its context.

## Requirements
1. When a file passes all request checks, the system shall create its file record and its processing job so that either both exist or neither does.
2. The system shall assign each accepted file a new unique file id.
3. The system shall create the file record with processing step `queued`, the original filename, the lower-cased extension without the dot as file type, the size in bytes, the project, the sub-project when given, the agreement when given, the uploading user and the checksum.
4. The system shall give the processing job the file id, the received content location, the original filename, size, file type, user, checksum, project, sub-project, agreement, quality rule ids, delimiter, header setting, fixed-width layout, effective drop location, and, if an archive password was supplied, a reference to its vault entry.
5. The system shall not put any secret in the processing job.
6. If creating the record or the job fails for a file, then the system shall leave no record and no job for that file and report that file as failed.
7. When a file is accepted, the system shall make it visible in its project's file list with processing step `queued` on the next read.

## Acceptance criteria
- **AC-1**: Given a valid upload of `claims.csv` (1,024 bytes) to project 30, sub-project 31, When it is accepted, Then a file record exists with step `queued`, filename `claims.csv`, type `csv`, size 1024, project 30, sub-project 31, the uploader and a checksum, and exactly one processing job references it. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-2**: Given the queue is unavailable, When `claims.csv` is uploaded, Then no file record exists for it afterwards and its result entry has `success:false`. <!-- source: areas/ING.md#bug -->
- **AC-3**: Given an upload with archive password `S3cret!`, When the job is inspected, Then it contains a vault reference and does not contain `S3cret!`. <!-- source: areas/ING.md#security -->
- **AC-4**: Given a contract upload for agreement 5, When the file record is inspected, Then it names agreement 5. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-5**: Given two files with the same name uploaded in one request, When both are accepted, Then they get different file ids. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-6**: Given an accepted upload, When a project member lists the project's files, Then the file appears with step `queued`. <!-- source: areas/ING.md#data-touched -->

## Out of scope
- Consuming the job, retries and recovery (processing area).
- The drop-specific record fields (REQ-ING-025).

## Non-functional requirements
Creating the record and job takes at most 200 ms at p95 per file, excluding hashing, measured at the API.

## Data volume and performance
- **Volume per run**: up to 20 records and 20 jobs per request.
- **Growth**: unknown; see Open questions.
- **Largest tenant**: unknown.
- **Time window**: within the request.
- **Memory ceiling**: no file content held in memory.
- **Scale tests**: 20-file request creates 20 records and 20 jobs, with one injected queue failure leaving 19 of each.

## Edge cases and errors
- Partial batch: one file failing does not undo files already accepted in the same request (REQ-ING-010).
- Retried client request after a timeout creates new files; duplicate detection (REQ-ING-015) is the user's guard.

## Open questions
- Expected uploads per day and per project, and file-record growth per year, for capacity planning?
- Is the old file-id shape (`file_` + milliseconds + 8 hex characters) relied on by any integration, or may the new system choose its own id format?
