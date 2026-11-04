---
name: extract-spec
description: Extract a rebuild-ready spec from this legacy codebase, end to end and resumable - inventory, per-area behaviour notes, verification, triage, requirement shards and a handover. Re-run to continue after an interruption; pass "redraft" after editing triage decisions.
argument-hint: "[redraft]"
---
# Extract the spec from this codebase $ARGUMENTS

You are the orchestrator. Subagents read the code; you track state. Keep your context small: never
open source files or the agents' notes. Act only on their short replies and on
`extraction/STATE.md`.

A guard hook allows writes only inside `extraction/` and no shell commands except
`node .claude/hooks/extraction-guard.js <snapshot|verify|clean-out>`. Copy files with Read and
Write, never with the shell. If the guard blocks something, do not try to work around it: log it
and continue.

## State
`extraction/STATE.md` is the single source of truth. Read it first on every run and continue from
where it says. If it is missing, first run `node .claude/hooks/extraction-guard.js snapshot`, then
create it:

```
# Extraction state
phase: inventory
## Areas
| Area | extract | verify | fix rounds | draft | notes |
|------|---------|--------|------------|-------|-------|
## Log
```

Cell values: pending, done, done-with-issues, failed. Update STATE after every subagent returns,
before starting the next, and append one log line with the agent's reply (short form).

If the argument is `redraft`: run `node .claude/hooks/extraction-guard.js clean-out`, set every
draft cell to pending, set `phase: synthesize`, and keep everything else. The synthesizer keeps
filled triage decisions.

## Phases (in order; skip what STATE marks done)
1. **inventory**: delegate to `extract-inventory`. Add one STATE row per area code it reports,
   all pending. Set `phase: extract`.
2. **extract**: `extract-area` with the area code, for each pending area. Run up to 4 at a time
   (several Agent calls in one message). When all are done, set `phase: verify`.
3. **verify**: `extract-verifier` per area, up to 4 at a time. On `FIX`: `extract-area` with
   `fix <AREA>`, then verify again. After 2 fix rounds, mark the area `done-with-issues`; what is
   left stays in its Open questions. When all are done, set `phase: synthesize`.
4. **synthesize**: `extract-synthesizer`. Set `phase: draft`.
5. **draft**: `spec-drafter` per area, up to 4 at a time. Set `phase: assemble`.
6. **assemble** (do this yourself with Read and Write):
   - `extraction/out/spec/INDEX.md`: the header below, then every line from
     `extraction/out/index-rows/*.md`, sorted by id:
     ```
     # Spec index

     | ID | Title | Module | Status | Depends on | Shard |
     |----|-------|--------|--------|------------|-------|
     ```
   - copy `extraction/glossary.md` to `extraction/out/spec/glossary.md` and
     `extraction/overview.md` to `extraction/out/spec/00-overview.md`;
   - copy `inventory.md`, `cross-cutting.md`, `triage.md` and `areas/*.md` (not `*.verify.md`)
     into `extraction/out/reference/`. These are inputs for the data model and the contract, not
     spec;
   - write `extraction/out/HANDOVER.md` from STATE: counts (areas, shards, dropped features, open
     questions per area, areas done-with-issues or failed), the critical security findings from the
     synthesizer's reply, anything the guard blocked, and the next steps listed below.
   Set `phase: check`.
7. **check**: run `node .claude/hooks/extraction-guard.js verify`. If it reports changes outside
   `extraction/`, stop, add the list to HANDOVER.md, and report it. Otherwise set `phase: done`.

## Failures
If a subagent errors or returns nothing usable, retry it once. Then mark the cell failed, log the
reason and continue with the other areas. Re-running the skill retries failed cells.

## Next steps (copy into HANDOVER.md)
1. Review `extraction/triage.md`: fill the Decision column, then run `/extract-spec redraft`.
2. Replace `@OWNER` in every shard with the real spec owner.
3. In the new template-generated project, on a `spec/initial-import` branch: copy
   `extraction/out/spec/*` into `spec/`, add the area codes to `00-overview.md`, run
   `make spec-check`.
4. Review the shards and clear their open questions, then set them to `approved`.
5. Run `/design-data-model` with `extraction/out/reference/` as reference material. Contracts
   follow from the approved requirements.

## When done
Reply `EXTRACTION COMPLETE`, then the counts and the path `extraction/out/HANDOVER.md`. If this is
running under /loop, stop the loop.
