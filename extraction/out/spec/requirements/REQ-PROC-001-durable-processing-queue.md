---
id: REQ-PROC-001
title: Durable processing queue with a real consumer and bounded concurrency
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-PROC-001: Durable processing queue with a real consumer and bounded concurrency

## Context
Uploads, drops, re-profiles, API uploads and retries all hand a file to the processing pipeline through a queue. Today the default queue lives only in process memory, so jobs are lost on restart. The Redis mode has no consumer, so nothing gets processed (BUG-2). Every waiting job starts at once with no limit (UNCLEAR-1). The `aws` and `gcp` modes are placeholders (DEAD-4). Triage F28 (change) asks for one durable queue with a real consumer and bounded concurrency. F30 asks for a queue that keeps job context. F123 asks for graceful shutdown.

## Requirements
1. The processing pipeline shall use exactly one queue implementation for processing jobs, and that queue shall be durable across process restarts.
2. The processing pipeline shall run a consumer for the processing queue in every deployment that accepts processing jobs.
3. While the number of processing jobs running in one worker instance equals the configured concurrency limit, the consumer shall leave further processing jobs waiting.
4. Where more than one worker instance runs, the processing queue shall deliver each processing job to at most one consumer at a time.
5. If a worker instance stops while it holds a processing job, then the processing queue shall make that job available to another consumer once the job's lease expires.
6. When a graceful shutdown starts, the consumer shall stop taking new processing jobs and shall let running jobs finish within the shutdown grace period.
7. If a running processing job has not finished when the shutdown grace period ends, then the consumer shall return the job to the queue without counting it as a failed attempt.
8. If the queue backend cannot be reached at startup, then the service shall report itself not ready and shall not fall back to an in-process queue.
9. The processing queue shall keep the record of a completed processing job for 24 hours, and at most the 100 most recent ones.
10. The processing queue shall keep the record of a finally failed processing job for 7 days, and at most the 500 most recent ones.
11. The processing queue shall provide the number of processing jobs in each state (waiting, active, delayed, completed, failed) for operator metrics.

## Acceptance criteria
- **AC-1**: Given a processing job is waiting, When the worker process restarts, Then the job is still queued after the restart and is processed once. <!-- source: areas/PROC.md#queue-abstraction-backendqueue -->
- **AC-2**: Given the queue is configured for the shared backend, When a file is uploaded, Then a consumer picks up its processing job and the file leaves the queued step (no job stays unconsumed). <!-- source: areas/PROC.md#bug -->
- **AC-3**: Given a concurrency limit of 5 and an upload batch of 20 files, When all 20 jobs are queued, Then at no moment are more than 5 of them running in that worker instance, and all 20 eventually finish. <!-- source: areas/PROC.md#unclear -->
- **AC-4**: Given two worker instances and one waiting job, When both consumers poll, Then exactly one of them runs the job. <!-- source: areas/PROC.md#bug -->
- **AC-5**: Given a worker instance is killed while it runs a job, When the lease expires, Then another consumer runs the job and the job's attempt count reflects one interrupted attempt at most. <!-- source: areas/PROC.md#queue-abstraction-backendqueue -->
- **AC-6**: Given the queue backend is unreachable at startup, When the readiness probe is called, Then it reports not ready and no job is accepted into process memory. <!-- source: areas/PROC.md#queue-abstraction-backendqueue -->
- **AC-7**: Given a job completed 23 hours ago and fewer than 100 newer completed jobs exist, When its record is requested, Then it is returned; Given it completed 25 hours ago, Then it is no longer returned. <!-- source: areas/PROC.md#queue-abstraction-backendqueue -->
- **AC-8**: Given a job finally failed 6 days ago and fewer than 500 newer failed jobs exist, When its record is requested, Then it is returned; Given it failed 8 days ago, Then it is no longer returned. <!-- source: areas/PROC.md#queue-abstraction-backendqueue -->
- **AC-9**: Given a graceful shutdown with one running job that finishes inside the grace period, When shutdown completes, Then that job is completed and no new job was started after shutdown began. <!-- source: areas/PROC.md#uploadcleanupworker-interval -->

## Out of scope
- The operator metrics endpoint that reads these counts (OPS, F117).
- Validation done by producers before they submit a file (ING, SCH, API, ARC).
- The job's payload (REQ-PROC-002) and retry policy (REQ-PROC-003).

## Non-functional requirements
- Concurrency limit per worker instance is configuration; default value is an open question.
- Retention: completed job records 24 h / 100 most recent; failed job records 7 days / 500 most recent, checked by querying the job record at those ages.

## Data volume and performance
- **Volume per run**: up to 20 processing jobs per interactive upload batch.
- **Growth**: unknown (open question).
- **Largest tenant**: unknown (open question).
- **Time window**: jobs are processed as they arrive; no batch window.
- **Memory ceiling**: unknown per job; see REQ-PROC-011 for the per-file profiling limit (open question).
- **Scale tests**: 20-file batch with the concurrency limit set below 20; two worker instances sharing one queue.

## Edge cases and errors
- Duplicate delivery after a lease expiry while the original consumer is still alive: the job must be idempotent (see REQ-PROC-002 and REQ-PROC-024).
- Queue backend outage during processing: running jobs finish their in-process work; acknowledging the result is retried until the backend returns or the lease expires.
- Restart while jobs are delayed for a retry: the delay is kept and the retry still runs.

## Open questions
- Which queue technology is used (for example a Redis-backed queue, a managed queue, or a database-backed queue)?
- Default concurrency limit per worker instance, and whether it differs per file type.
- Lease length for a running job (old job time limit was 30 minutes; see REQ-PROC-003).
- Whether any current deployment sets the queue type to Redis, and whether jobs in flight at cut-over must be migrated.
- PROC.verify item 3: a second BullMQ upload queue exists outside this note; confirm it carries no live work before it is retired.
- Expected daily file volume, peak batch rate and largest project's volume.
