---
id: REQ-ING-007
title: Server computes the checksum of every received file
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-ING-007: Server computes the checksum of every received file

## Context
Duplicate detection relies on each file's checksum (SHA-256). Today the upload stores whatever checksum the browser sends for each file name, without verification, and drops store no checksum at all. A client can therefore hide a duplicate or make one file look like another. The F23 decision is that the server computes the checksum.

## Requirements
1. When the system accepts a file by upload or drop, it shall compute the SHA-256 checksum of the received bytes and store it as lower-case hexadecimal with the file.
2. The system shall ignore any checksum supplied by the client.
3. The system shall compute the checksum from the complete received content, before the file is handed to processing.
4. The system shall pass the computed checksum to the file's processing job.

## Acceptance criteria
- **AC-1**: Given a file whose content is the ASCII text `abc`, When it is uploaded, Then the stored checksum is `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`. <!-- source: areas/ING.md#domain-terms -->
- **AC-2**: Given a client that sends checksum `0000` for `data.csv`, When `data.csv` is uploaded, Then the stored checksum is the SHA-256 of the received bytes, not `0000`. <!-- source: areas/ING.md#security -->
- **AC-3**: Given a file delivered by drop, When it is accepted, Then its record has a checksum. <!-- source: areas/ING.md#post-apifilesdrop-serverjs3476-4646 -->
- **AC-4**: Given a zero-byte file, When it is accepted, Then the stored checksum is `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. <!-- source: areas/ING.md#domain-terms -->

## Out of scope
- Duplicate lookup (REQ-ING-015).
- Checksums of archive members (archive area).

## Non-functional requirements
Hashing streams the content: memory use per file does not grow with file size, measured by hashing a 25 MB file and a 1 KB file and comparing peak memory.

## Data volume and performance
- **Volume per run**: up to 20 files x 25 MB per request.
- **Growth**: unknown, see REQ-ING-009.
- **Largest tenant**: unknown.
- **Time window**: within the request.
- **Memory ceiling**: one read buffer per file.
- **Scale tests**: hash 20 x 25 MB in one request within the request timeout.

## Edge cases and errors
- If reading the received content fails, the file is not accepted and the per-file result reports a failure (REQ-ING-010).

## Open questions
None.
