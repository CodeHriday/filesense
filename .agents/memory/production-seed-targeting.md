---
name: Production seed targeting
description: Guardrails for manually seeding access-control data into production.
---

Any manual or scripted production seed must confirm its database target before issuing writes; do not treat a successful seed summary as evidence that production was populated.

**Why:** The Node seed script follows the shell's `DATABASE_URL`. A run can find development rows and report them as skipped even though the production database has no records.

**How to apply:** Before seeding, inspect a safe database identity such as `current_database()` through the intended production connection. Prefer a direct, transactional SQL seed when executing from a known production SQL client, and add an explicit confirmation guard to application-managed production seed commands.