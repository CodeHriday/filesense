---
id: REQ-ARC-007
title: One archive password lookup for every ingestion path
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-ARC-006]
contracts: []
priority: must
---
# REQ-ARC-007: One archive password lookup for every ingestion path

## Context
When processing meets an archive it must find the right password without a user present. Three lookups exist today with different orders and fallbacks: the upload pipeline tries the matching agreement file schema before the file's own password, so a password a user just supplied for one file is ignored when a stale schema password exists; the ETL engine falls back to the first schema whatever its pattern and decrypts outside the vault; bulk validation loads every password. The glob conversion escapes only `.`, so pattern characters such as `(` or `[` act as regex or throw. Triage F32 decided on one lookup.

## Requirements
1. The system shall use one password lookup for every path that extracts archives.
2. When the file has a stored `file` password, the lookup shall return it.
3. When the file has no stored `file` password and is linked to a vendor agreement, the lookup shall consider the agreement's enabled agreement file schemas in ascending priority, schemas without a priority last, and return the stored password of the first schema whose filename pattern matches the file's original name.
4. When no earlier step yields a password and the file is linked to a vendor agreement with a stored `vendor_agreement` password, the lookup shall return that password.
5. When no step yields a password, the lookup shall return "no password" and extraction shall run without one.
6. The lookup shall match filename patterns as globs over the whole name, case-insensitively, where `*` matches any run of characters, `?` matches one character, and every other character matches itself literally.
7. The lookup shall stop at the first schema whose pattern matches, even if that schema has no stored password, and then continue with requirement 4.
8. The lookup shall read passwords only through the password vault.
9. If the vault reports an error, then the lookup shall log the error without the password and continue as if that step yielded no password.

## Acceptance criteria
- **AC-1**: Given a file `sales_2024.zip` with a stored `file` password `A1` and a matching schema password `B2`, When the lookup runs, Then it returns `A1`. <!-- source: areas/ARC.md#internal-entry-archive-handling-in-the-file-processing-worker-proc-owned-arc-behaviour -->
- **AC-2**: Given no `file` password and two enabled schemas with patterns `sales_*.zip` (priority 2, password `B2`) and `*.ZIP` (priority 1, password `C3`), When the lookup runs for `sales_2024.zip`, Then it returns `C3`. <!-- source: areas/ARC.md#internal-entry-archive-handling-in-the-file-processing-worker-proc-owned-arc-behaviour -->
- **AC-3**: Given a schema with no priority and pattern `*.zip` (password `D4`) and a schema with priority 5 and pattern `*.zip` (password `E5`), When the lookup runs for `x.zip`, Then it returns `E5`. <!-- source: areas/ARC.md#duplicate -->
- **AC-4**: Given a schema pattern `data(1).zip`, When the lookup runs for `data(1).zip`, Then the pattern matches; for `data1.zip` it does not. <!-- source: areas/ARC.md#unclear -->
- **AC-5**: Given a schema pattern `feed_?.zip`, When the lookup runs for `feed_7.zip`, Then it matches; for `feed_17.zip` it does not. <!-- source: areas/ARC.md#internal-entry-archive-handling-in-the-file-processing-worker-proc-owned-arc-behaviour -->
- **AC-6**: Given a disabled schema whose pattern matches, When the lookup runs, Then that schema is ignored. <!-- source: areas/ARC.md#internal-entry-archive-handling-in-the-file-processing-worker-proc-owned-arc-behaviour -->
- **AC-7**: Given no `file` password, no matching schema, and a `vendor_agreement` password `F6`, When the lookup runs, Then it returns `F6`. <!-- source: areas/ARC.md#duplicate -->
- **AC-8**: Given no `file` password, schemas that do not match the name, and no agreement password, When the lookup runs, Then it returns "no password" (it does not fall back to the first schema). <!-- source: areas/ARC.md#duplicate -->
- **AC-9**: Given the vault errors on the `file` step, When the lookup runs, Then the error is logged without any password and the lookup continues with the schema step. <!-- source: areas/ARC.md#internal-entry-archive-handling-in-the-file-processing-worker-proc-owned-arc-behaviour -->
- **AC-10**: Given an ETL job source archive and a bulk validation file, When each is extracted, Then both use this lookup and both produce a vault retrieve audit entry. <!-- source: areas/ARC.md#duplicate -->

## Out of scope
- Storing schema and agreement passwords (VAS and VAG areas).
- The shared glob matcher used for agreement matching at upload (ING area, triage F25); this lookup must use the same matcher.

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: at most one vault read per step and one schema list per agreement.

## Edge cases and errors
- A file whose original name is empty or missing: the schema step is skipped.
- A pattern with no wildcard matches only the exact name (case-insensitive).
- If a returned password turns out wrong, extraction reports "password incorrect" (REQ-ARC-002); the lookup does not try the next candidate.

## Open questions
- Should the lookup try the next candidate password when the first one is wrong (for example the schema password after a wrong file password)? Old code never did.
- Should a vault error stop processing as a server fault instead of continuing without a password? Today it continues, which leads to a "password missing" result that hides the real cause.
- Requirement 4 (agreement-level password) exists today only in the ETL engine. Confirm that agreement-level passwords should also apply to uploads and drops.
