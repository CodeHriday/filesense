---
id: REQ-ING-002
title: File count, size and type limits for uploads and drops
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-ING-002: File count, size and type limits for uploads and drops

## Context
Uploads and drops both accept data files from people. The limits must be the same on both paths, must match what the upload page offers, and must produce clear client errors. Today the type and file-count rejections surface as 500 errors. The drop path's size message hard-codes "25 MB" even when the limit is configured differently. The page also offers archive extensions (`.tgz`, `.tbz2`, `.tar.bz2`) that the server rejects.

## Requirements
1. The system shall accept at most 20 files in one upload request and exactly one file in one drop request.
2. The system shall enforce a configurable maximum size per file, with a default of 25 MB (26,214,400 bytes).
3. The system shall accept a file whose size is equal to the maximum.
4. The system shall accept only files whose lower-cased extension is one of `.csv`, `.json`, `.parquet`, `.xlsx`, `.xml`, `.txt`, `.tar`, `.zip`, `.gz`, `.gzip`, `.7z`, `.avro`, `.dat`, `.sas7bdat`, `.xpt`.
5. If a file's declared content type is not in the allowed content-type list, then the system shall reject the request with 400.
6. If a file exceeds the maximum size, then the system shall reject the request with 400, code `FILE_TOO_LARGE`, and a message stating the configured maximum.
7. If an upload request contains more than 20 files, or a drop request contains more than one file, then the system shall reject it with 400 and code `TOO_MANY_FILES`.
8. If a file has an extension that is not allowed, then the system shall reject the request with 400 and code `UNSUPPORTED_FILE_TYPE`, naming the file.
9. If a request contains no file, then the system shall reject it with 400, code `NO_FILE`, and the message "No file uploaded".
10. The system shall publish the effective size limit, the file-count limit and the allowed extensions so that the upload page uses the same values.

## Acceptance criteria
- **AC-1**: Given the default limit, When a 26,214,400-byte CSV is uploaded, Then it is accepted. <!-- source: areas/ING.md#shared-middleware-and-configuration -->
- **AC-2**: Given the default limit, When a 26,214,401-byte CSV is uploaded, Then the response is 400 `FILE_TOO_LARGE` and the message states 25 MB. <!-- source: areas/ING.md#use-apifilesdrop-error-handler-serverjs4877-4911 -->
- **AC-3**: Given the maximum is configured to 50 MB, When a 30 MB file is dropped, Then it is accepted. When a 51 MB file is dropped, Then the message states 50 MB, not 25 MB. <!-- source: areas/ING.md#bug -->
- **AC-4**: Given 20 CSV files, When they are uploaded in one request, Then all 20 are accepted for processing. Given 21 files, Then the response is 400 `TOO_MANY_FILES`, not 500. <!-- source: areas/ING.md#shared-middleware-and-configuration -->
- **AC-5**: Given a file `data.exe`, When it is uploaded, Then the response is 400 `UNSUPPORTED_FILE_TYPE` naming `data.exe`, not 500. <!-- source: areas/ING.md#shared-middleware-and-configuration -->
- **AC-6**: Given a file `DATA.CSV`, When it is uploaded, Then the extension check passes (case-insensitive). <!-- source: areas/ING.md#shared-middleware-and-configuration -->
- **AC-7**: Given a `.csv` file sent with content type `application/octet-stream`, When it is uploaded, Then it is accepted. <!-- source: areas/ING.md#unclear -->
- **AC-8**: Given an upload request with no file part, When it is sent by a permitted user, Then the response is 400 `NO_FILE` "No file uploaded". <!-- source: areas/ING.md#post-apifilescheck-duplicate-serverjs2489-2554; areas/ING.verify.md#minor-omissions-error-branches-the-notes-do-not-list -->
- **AC-9**: Given any rejection in this requirement, When it happens, Then no file record is created and none of the request's content remains stored (REQ-ING-012). <!-- source: areas/ING.md#data-touched -->

## Out of scope
- Archive member limits (size, count, ratio), owned by archive extraction.
- Content-based type detection, which happens after the virus scan in processing.

## Non-functional requirements
Oversized files are rejected as soon as the limit is crossed while receiving, without buffering the rest of the file. Measured by uploading a 200 MB file against a 25 MB limit: the response arrives without the server storing more than the limit plus one buffer.

## Data volume and performance
- **Volume per run**: up to 20 files x 25 MB = 500 MB per upload request at the default limit.
- **Growth**: unknown, see Open questions.
- **Largest tenant**: unknown.
- **Time window**: request-bound; no batch window.
- **Memory ceiling**: file content is streamed to temporary storage, never fully buffered in memory.
- **Scale tests**: 20 x 25 MB upload completes without a memory spike above the configured ceiling.

## Edge cases and errors
- A file with no extension is rejected as `UNSUPPORTED_FILE_TYPE`.
- `archive.tar.gz` has extension `.gz` and is accepted.
- A zero-byte file passes the limits here; emptiness is judged after the scan (REQ-ING-026 for drops).
- In a batch, one disallowed file rejects the whole request, so no file of the request is accepted.

## Open questions
- Should `.tgz`, `.tbz2`, `.tar.bz2` and `.bz2` be accepted? The page offers them and the server rejects them; the answer depends on which formats archive extraction supports.
- What exactly is the allowed content-type list? The old list (server.js:813-837) is not enumerated in the notes, and a `.csv` sent as `application/vnd.ms-excel` is rejected today. Should the content-type check be dropped in favour of extension plus post-scan content detection?
- The old code comment says the default limit is 100 MB while the value is 25 MB. Confirm 25 MB.
