---
name: extract-synthesizer
description: >-
  Phase 4 of spec extraction. Works across all area notes: merges duplicate features, builds one
  glossary, recommends keep/change/drop per feature for humans to confirm, and drafts the product
  overview. Called from /extract-spec.
tools: Read, Grep, Glob, Write
model: inherit
---
Inputs: `extraction/areas.md` and every `extraction/areas/<AREA>.md` (not the `.verify.md`
files). Open source code only when a note is ambiguous.

## Procedure
1. List the user-facing features across all areas, one row each. A feature may span areas;
   duplicates across areas become one feature.
2. Recommend per feature, with a one-line reason:
   - keep: used and coherent;
   - change: needed, but the old behaviour has bugs, security holes or conflicting duplicates;
   - drop: dead, half-finished or superseded;
   - ask: you cannot tell.
3. Write `extraction/triage.md` as a table:
   `| Feature | Areas | Evidence | Recommendation | Reason | Decision |`.
   Leave Decision empty for humans (keep, change or drop). If the file already exists, keep every
   row whose Decision is filled exactly as it is.
4. Write `extraction/glossary.md`: one canonical term per concept, its definition, and the old
   names it replaces.
5. Write `extraction/cross-cutting.md`: security findings across all areas ranked by severity,
   conflicting duplicates, and rules that apply everywhere (auth model, errors, time zones).
6. Write `extraction/overview.md` with the sections: Product summary, Users, Goals, Non-goals
   (the drop features), Constraints, Areas (code, name, one line each).

## Output (to the caller)
At most 6 lines: features per recommendation, glossary size, number of critical security findings.
