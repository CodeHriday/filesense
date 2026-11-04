# PROC final verification (after fix round 2)

Verdict: FIX (minor). Fix rounds exhausted, so the area is marked done-with-issues. The three items below are not reflected in PROC.md; carry them as open questions.

Written by the orchestrator from the verifier's reply; the verifier itself declined to write this file.

- 58 claims checked: 1 wrong (minor), 1 unsupported (minor), 1 missing (minor). No wrong business rules and no wrong flags.
- Nothing lost in the rewrite: all 7 entry points, MemoryQueue and QUEUE_TYPE, DUP 1-5, BUG 1-21 (incl. 4a), DEAD 1-5, SECURITY 1-7, UNCLEAR 1-8 and 13 open questions.
- All round-2 items are correct: the processed_at writer (FileService.js:178-188); the dump defaults (database_ddl_1767770486833.sql:1410, database_ddl_2026-01-07.sql:1297, prod dump :4992; the non-default lines belong to archive_members); BUG-9/BUG-19 (failed and password_required also report complete); BUG-21 (falls to conversion_failed at :218-220); BUG-4a (prod :4297-4311, no member_name in any SQL); the re-profile 'queued' after addJob (server.js:8912, :8936-8938; MemoryQueue.js:70-74); the getJobStatus fields (MemoryQueue.js:87-98).

## Remaining issues (carry as open questions)
1. Wrong (minor): "all three schema dumps" should say four. attached_assets/FileSence_prod_schema_Jan_05_1767780691950.sql:4992 also has `processed_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL`. The conclusion is unchanged.
2. Unsupported (minor): "FileService callers not traced" can be closed. FileService.js:133 defines saveFile, and a grep for `.saveFile(` across all JS finds no callers, so the processed_at writer is apparently dead code.
3. Missing (minor): the BullMQ `file-upload` queue (backend/queues/uploadQueue.js:56; inventory.md:903, listed as API/PROC) is never mentioned in PROC.md. The AWS_SQS_QUEUE_URL and GCP_PROJECT_ID rows (inventory.md:1056) are covered only indirectly, via DEAD-4's cite of queueFactory.js:64-82.
