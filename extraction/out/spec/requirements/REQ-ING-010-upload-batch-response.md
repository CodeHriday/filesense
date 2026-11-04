---
id: REQ-ING-010
title: Upload response reports a result for every file
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-ING-009]
contracts: []
priority: must
---
# REQ-ING-010: Upload response reports a result for every file

## Context
An upload request may carry up to 20 files, and each can be accepted or fail on its own after the request-level checks pass. The page shows a summary for batches and follows the single file's progress. Today failures return raw library messages to the client.

## Requirements
1. When an upload request passes the request-level checks, the system shall respond with 200 and a summary containing the total number of files, the number accepted, the number failed, a message "Batch upload complete: N succeeded, M failed", and one result per file.
2. The system shall set the summary's success flag to true when at least one file was accepted and to false otherwise.
3. For each accepted file, the system shall return success true, the file id, the processing job id, status `queued`, the original filename, the file type and the size.
4. For each failed file, the system shall return success false, the original filename, the error "Processing failed" and a safe message that contains no library error text, stack, path or secret.
5. Where the request named a file to replace, the system shall include in the accepted file's result that a replacement is pending and the id of the file to be replaced.
6. If an unexpected error stops the whole request, then the system shall respond with 500, code `INTERNAL_ERROR`, the error "File upload failed" and no further details.

## Acceptance criteria
- **AC-1**: Given 3 valid files, When they are uploaded, Then the response is 200 with totalFiles 3, successCount 3, failedCount 0, message "Batch upload complete: 3 succeeded, 0 failed", and 3 results with status `queued`. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-2**: Given 3 files where creating the job for the second fails, When they are uploaded, Then the response is 200 with successCount 2, failedCount 1, success true, and the second result has success false and error "Processing failed". <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-3**: Given 2 files that both fail, When they are uploaded, Then the response is 200 with success false and message "Batch upload complete: 0 succeeded, 2 failed". <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-4**: Given a database driver error during a file, When the result is returned, Then its message contains no driver text, no stack trace and no server path. <!-- source: areas/ING.md#security -->
- **AC-5**: Given an unexpected failure before any file is processed, When the response is returned, Then it is 500 `INTERNAL_ERROR` "File upload failed" with no details, in every environment. <!-- source: areas/ING.md#security -->

## Out of scope
- The drop response (REQ-ING-025).
- Request-level rejections (REQ-ING-001 to REQ-ING-006, REQ-ING-014).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: the response holds at most 20 result entries.

## Edge cases and errors
- A single-file request uses the same shape with one result.

## Open questions
- Should a request where every file failed return a 4xx or 5xx status rather than 200 with success false? The old behaviour is 200.
