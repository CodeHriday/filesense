---
name: Approval-status constraint compatibility
description: Keep legacy and configurable agreement approval states compatible whenever the database constraint is rebuilt.
---

When rebuilding the `vendor_agreements` approval-status CHECK constraint, include `pending_approval` in addition to all legacy three-stage workflow values.

**Why:** Configurable approval chains transition agreements to `pending_approval` before Step 1. A legacy-compatible constraint that omits this value prevents submission even when the chain configuration, columns, and approvers are valid.

**How to apply:** Treat approval-status constraint changes as a shared contract between legacy and configurable workflows. Use an idempotent, tracked repair migration for environments that may have partially applied earlier approval migrations, and verify the complete allowed-state set after deployment.

Final-approved contract access must treat both `governance_approved` and `fully_approved` as terminal approved states.

**Why:** The legacy governance workflow produces `governance_approved`, while the configurable approval-chain workflow produces `fully_approved`; either state can represent an active, locked contract ready for downstream use.

**How to apply:** Reuse one shared final-status definition in upload authorization, schema validation, processing, and other contract-access queries instead of comparing against only one workflow's status.