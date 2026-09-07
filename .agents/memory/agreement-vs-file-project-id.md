---
name: Agreement project_id vs file project_id in governance
description: A file can be dropped into a different project than the vendor agreement it validates against; enforcer must use the agreement's project_id for rule lookup.
---

# Agreement project_id ≠ file project_id in schema enforcement

## The rule

When `applyAgreementGovernance` runs schema enforcement, pass the **agreement's** `project_id` to `enforceSchemaRules` — not the file's `project_id`. A file dropped via the vendor-agreement drop flow can land in a sub-project (e.g. 1454) while the agreement and its quality rules belong to the parent project (e.g. 1467). Using the file's project_id causes project-scoped rules to be silently skipped.

**Why:** `quality_rules` rows are scoped to the project that owns the vendor agreement, not the project where the dropped file is stored.

**How to apply:**
- In `applyAgreementGovernance` (fileProcessingWorker.js), the agreement query already selects `va.project_id AS agreement_project_id`.
- Pass `matchedSchema.agreement_project_id || projectId` as the `projectId` option to `enforceSchemaRules`.
- Do not change `applyVendorFileGovernance` — that path uses the file's own project, which is correct for non-agreement vendor governance.
