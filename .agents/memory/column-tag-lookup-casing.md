---
name: Column governance tag lookup — case sensitivity
description: The /full API returns columnGovernance.tags with original-case column name keys; the frontend must NOT lowercase the column name before lookup.
---

# Column Governance Tag Lookup — Case Sensitivity

## The rule
`/api/files/:fileId/full` returns `columnGovernance.tags` keyed by the **original-case**
column name from `column_governance_tag_assignments` (e.g., `"Patient_ID"`). Any
frontend code that lowercases the column name before looking up in this object will
silently return `[]` even when a tag exists.

**Why:** `tagsByColumn` is built directly from `row.column_name` in server.js (line ~6103).
No normalization is applied server-side.

## How to apply
- When reading `columnGovernance.tags[columnName]`, use the column name exactly as it
  appears in `profile.columns[n].name` — do NOT call `.toLowerCase()` first.
- If adding new components that render column-level tags, follow the same rule.
- If the API ever needs case-insensitive lookup, normalize on the server side (lowercase
  all keys in the response) and update the frontend to match — never mix normalizations.

## Files fixed
- `src/pages/DataProfile.jsx` lines ~1652–1655 and ~1717–1720 — removed `.toLowerCase()`
  from the `normalizedName` variable used to index into `columnGovernance.tags`.

## Components still to verify
- `src/components/FilePreview.jsx`
- `src/components/NodeDetailDrawer.jsx`
