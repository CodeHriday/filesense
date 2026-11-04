---
id: REQ-ARC-006
title: Password vault for archive passwords
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-ARC-006: Password vault for archive passwords

## Context
Archive passwords arrive at upload time, after a failed extraction, and as part of vendor agreement file schemas. They must be stored so that processing can open archives later, without ever being readable outside the vault. Today the vault encrypts correctly, but passwords also leak in plain text into failed-job payloads, queue payloads, logs and command lines; audit of vault access silently never happens because the wrong object is injected; and one caller uses a retrieval method that does not exist, which wipes stored schema passwords. Triage F32 decided passwords live only in the vault and are referenced by owner, never copied.

## Requirements
1. The password vault shall be the only place where archive passwords are persisted.
2. The password vault shall encrypt each password with AES-256-GCM using a fresh random 12-byte IV per write and store the 16-byte authentication tag.
3. The password vault shall read its key from configuration as 64 hexadecimal characters (32 bytes).
4. If the vault key is missing or is not exactly 64 hexadecimal characters, then the system shall not report ready and shall not process archives.
5. The password vault shall hold at most one password per owner, where an owner is a pair of entity type and entity id.
6. The password vault shall accept the entity types `file`, `agreement_file_schema` and `vendor_agreement`.
7. When a password is stored for an owner that already has one, the password vault shall replace the ciphertext, IV, tag, encryption version, creating user and creation time.
8. When a password is retrieved, the password vault shall record the access time on that entry.
9. When an owner has no stored password, the password vault shall report "not found", distinct from an error.
10. If decryption fails (wrong key or tag mismatch), then the password vault shall report an error and return no plaintext.
11. The password vault shall write an audit log entry for every store, retrieve and delete, naming the acting user (or the system for pipeline access), the entity type, the entity id and the outcome, and never the password.
12. The system shall never return a stored password to an API client; APIs shall expose only whether a password is stored.
13. The password vault shall be the only component that reads or deletes vault entries; no other component shall query or delete them directly.

## Acceptance criteria
- **AC-1**: Given a vault key of 64 hex characters, When the password `Zip#2024` is stored for `file` / `f-123`, Then the stored entry holds a ciphertext different from `Zip#2024`, a 12-byte IV, a 16-byte tag and the current encryption version. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-2**: Given the same password stored twice for two owners, When the entries are compared, Then their IVs and ciphertexts differ. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-3**: Given a vault key of 63 hex characters, When the service starts, Then readiness reports not ready and no archive is processed. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-4**: Given a stored password for `file` / `f-123`, When a new password is stored for the same owner, Then exactly one entry exists and retrieval returns the new password. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-5**: Given an entry whose tag was altered, When it is retrieved, Then an error is reported and no plaintext is returned. <!-- source: areas/ARC.md#business-rules-with-literal-values -->
- **AC-6**: Given no entry for `agreement_file_schema` / `42`, When it is retrieved, Then the result is "not found" and no error is logged. <!-- source: areas/ARC.md#bug -->
- **AC-7**: Given a user stores, the pipeline retrieves and the user deletes a password, When the audit log is read, Then three entries exist with actions store, retrieve and delete, the actors, the entity type and id, and no password text. <!-- source: areas/ARC.md#dead -->
- **AC-8**: Given an agreement file schema with a stored password, When the schema is read through any API, Then the response shows that a password is stored and does not contain it. <!-- source: areas/ARC.md#security -->
- **AC-9**: Given a retrieval of `file` / `f-123`, When the entry is read afterwards, Then its last-accessed time is the time of the retrieval. <!-- source: areas/ARC.md#business-rules-with-literal-values -->

## Out of scope
- Which component stores schema and agreement passwords and when (VAS and VAG areas).
- Lookup order during processing (REQ-ARC-007).
- Deletion after use (REQ-ARC-008).
- Key rotation (see Open questions).

## Non-functional requirements
None beyond the cryptographic parameters above.

## Data volume and performance
Not data-bearing: one row per owner; volume follows the number of files and agreement file schemas with passwords.

## Edge cases and errors
- Empty password: rejected by the callers (REQ-ARC-015); the vault refuses to store an empty string.
- Passwords with leading or trailing spaces are stored exactly as given.
- Unicode passwords are stored as UTF-8 and returned byte-for-byte.
- Concurrent stores for the same owner: the last write wins and exactly one entry remains.

## Open questions
- Do legacy `v1` entries (AES-256-CBC, no tag) exist in production? If yes, should they be decrypted during migration and re-encrypted as GCM, and were their IVs 16 bytes or 12 bytes zero-padded?
- Is key rotation required? The old rotation-scheduling function had no caller.
- Maximum password length accepted by the vault.
