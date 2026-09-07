---
name: Empty column_name in quality_rules
description: Rules stored with column_name='' (empty string) are invisible to enforcer IS NULL checks — treatment and prevention.
---

# Empty column_name in quality_rules silently skips rules

## The rule

Any SQL that filters `quality_rules` on `column_name IS NULL` will silently miss rows where `column_name = ''` (empty string). These rows are semantically global-scope (no column pinned) but fail `IS NULL`.

**Why:** PostgreSQL stores `''` and `NULL` as distinct values. Some creation paths (UI form submissions, imports) write an empty string instead of NULL when no column is selected.

**How to apply:**
- In every enforcer/helper query that accepts global scope via `column_name IS NULL`, write:
  ```sql
  (column_name = '<specific>' OR NULLIF(column_name, '') IS NULL)
  ```
  instead of `OR column_name IS NULL`.
- When adding a new rule via SQL or a route, always insert `NULL` (not `''`) when no column is intended.
- If you suspect a silent miss, run: `SELECT id, rule_name, rule_type, column_name FROM quality_rules WHERE column_name = ''` to find affected rows, then normalize with `UPDATE quality_rules SET column_name = NULL WHERE column_name = ''`.
