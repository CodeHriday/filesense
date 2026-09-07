# Data Quality Module — Comprehensive Scenario-Based Test Cases

> **Scope:** Manual QA scenarios covering all layers of the DQ module: file profiling, quality rule management, rule evaluation, Schema Builder, visual mappings, jobs dashboard, lineage, and notifications/error review.  
> **Format:** Each test case includes an ID, title, preconditions, numbered steps, and expected result.  
> **Out of scope:** Automated test scripts, performance/load testing, authentication/RBAC scenarios unrelated to DQ behaviour.

---

## Table of Contents

1. [Area 1 — File Profiling](#area-1--file-profiling)
2. [Area 2 — Quality Rule CRUD](#area-2--quality-rule-crud)
3. [Area 3 — Rule Evaluation Engine](#area-3--rule-evaluation-engine)
4. [Area 4 — Schema Builder Rule Assignments](#area-4--schema-builder-rule-assignments)
5. [Area 5 — Visual Mappings & DQ](#area-5--visual-mappings--dq)
6. [Area 6 — Jobs Dashboard & Status](#area-6--jobs-dashboard--status)
7. [Area 7 — Lineage & DQ](#area-7--lineage--dq)
8. [Area 8 — Notifications & Error Review](#area-8--notifications--error-review)
9. [Area 9 — Cross-Cutting & Edge Cases](#area-9--cross-cutting--edge-cases)

---

## Area 1 — File Profiling

### TC-001 — CSV profiling: standard comma delimiter

**Preconditions:**
- A valid CSV file with a header row, comma-delimited, containing at least 5 columns and 100 rows.
- User is logged in with file upload permission.

**Steps:**
1. Navigate to the vendor file upload page.
2. Upload the CSV file.
3. Wait for profiling to complete.
4. Open the DataProfile or VendorFileQuality page for the file.

**Expected Result:**
- Profile completes without error.
- Row count matches the actual number of data rows (excluding header).
- Column count matches the actual number of columns in the file.
- Quality score is a numeric value between 0 and 100.
- Each column shows: null %, completeness %, and top/least frequent values.

---

### TC-002 — CSV profiling: custom single-character delimiter (pipe)

**Preconditions:**
- A pipe-delimited (`|`) file saved with `.csv` or `.txt` extension.

**Steps:**
1. Upload the file, specifying `|` as the delimiter in the upload dialog.
2. Wait for profiling to complete.
3. Open the DataProfile page.

**Expected Result:**
- Columns are correctly split on the `|` delimiter; no values contain stray pipe characters.
- Row count and column count are accurate.
- Quality score is present.

---

### TC-003 — CSV profiling: multi-character delimiter (e.g. `~^`)

**Preconditions:**
- A file delimited by the two-character sequence `~^`.

**Steps:**
1. Upload the file, specifying `~^` as the delimiter.
2. Wait for profiling to complete.
3. Inspect column values.

**Expected Result:**
- Columns are correctly split on `~^`; no values contain partial delimiter characters.
- Column count matches the expected schema.

---

### TC-004 — TXT file profiling

**Preconditions:**
- A `.txt` file with tab-separated values.

**Steps:**
1. Upload the TXT file.
2. Wait for profiling to complete.
3. Open the DataProfile page.

**Expected Result:**
- File is profiled as a delimited text file.
- Row count, column count, and quality score present.

---

### TC-005 — XLS file profiling

**Preconditions:**
- A `.xls` (Excel 97–2003) file with data in the first sheet.

**Steps:**
1. Upload the XLS file.
2. Wait for profiling to complete.
3. Open the DataProfile page.

**Expected Result:**
- Profile completes without error.
- Row and column counts match the spreadsheet content.
- Quality score present.

---

### TC-006 — XLSX file profiling

**Preconditions:**
- A `.xlsx` (Excel 2007+) file with data in the first sheet, at least 3 columns.

**Steps:**
1. Upload the XLSX file.
2. Wait for profiling.
3. Open the DataProfile page.

**Expected Result:**
- Profile completes without error.
- Row and column counts accurate.
- Quality score present.

---

### TC-007 — JSON (array format) profiling

**Preconditions:**
- A `.json` file containing a top-level JSON array of objects.

**Steps:**
1. Upload the JSON file.
2. Wait for profiling.
3. Open the DataProfile page.

**Expected Result:**
- Each JSON key becomes a column.
- Row count equals the number of array elements.
- Quality score present.

---

### TC-008 — JSON (newline-delimited / JSONL) profiling

**Preconditions:**
- A `.json` or `.jsonl` file where each line is a separate JSON object.

**Steps:**
1. Upload the JSONL file.
2. Wait for profiling.
3. Open the DataProfile page.

**Expected Result:**
- Each line is treated as one record.
- Row count equals the number of non-empty lines.
- Quality score present; no parsing error.

---

### TC-009 — Parquet file profiling

**Preconditions:**
- A valid `.parquet` file with at least 3 columns.

**Steps:**
1. Upload the Parquet file.
2. Wait for profiling.
3. Open the DataProfile page.

**Expected Result:**
- Schema (column names and types) is read from Parquet metadata.
- Row count matches the Parquet row group count.
- Quality score present.

---

### TC-010 — SAS7BDAT file profiling

**Preconditions:**
- A valid `.sas7bdat` file with labelled columns.

**Steps:**
1. Upload the SAS file.
2. Wait for profiling.
3. Open the DataProfile page.

**Expected Result:**
- Profile completes; SAS column labels visible.
- Row count and quality score present.

---

### TC-011 — XPORT (XPT) file profiling

**Preconditions:**
- A valid `.xpt` SAS transport file.

**Steps:**
1. Upload the XPT file.
2. Wait for profiling.
3. Open the DataProfile page.

**Expected Result:**
- Profile completes without error.
- Row count and column count accurate.

---

### TC-012 — Avro file profiling

**Preconditions:**
- A valid `.avro` file with an embedded Avro schema.

**Steps:**
1. Upload the Avro file.
2. Wait for profiling.
3. Open the DataProfile page.

**Expected Result:**
- Column names and types are derived from the Avro schema.
- Row count accurate; quality score present.

---

### TC-013 — DAT fixed-width file profiling

**Preconditions:**
- A `.dat` file with fixed-width column layout.
- Column positions defined in the upload dialog.

**Steps:**
1. Upload the DAT file with column position definitions.
2. Wait for profiling.
3. Open the DataProfile page.

**Expected Result:**
- Columns extracted correctly at the defined byte offsets.
- Row count and quality score present.

---

### TC-014 — ZIP archive profiling

**Preconditions:**
- A `.zip` archive containing a single CSV file.

**Steps:**
1. Upload the ZIP file.
2. Wait for profiling.
3. Open the DataProfile page.

**Expected Result:**
- Archive is extracted transparently; the inner CSV is profiled.
- Row count, column count, and quality score match the inner file.

---

### TC-015 — TAR.GZ archive profiling

**Preconditions:**
- A `.tar.gz` archive containing a single CSV file.

**Steps:**
1. Upload the TAR.GZ file.
2. Wait for profiling.
3. Open the DataProfile page.

**Expected Result:**
- Archive extracted; inner CSV profiled correctly.
- Quality score present; no error shown.

---

### TC-016 — Header detection: auto-detected header row

**Preconditions:**
- A CSV file where the first row contains column names (e.g. `id,name,email`).

**Steps:**
1. Upload the file without specifying a header override.
2. Wait for profiling.
3. Inspect column names on the DataProfile page.

**Expected Result:**
- Column names match the first row of the file.
- Data rows do not include the header row in the row count.

---

### TC-017 — Header detection: file without header row

**Preconditions:**
- A CSV file where the first row is data, not column names.

**Steps:**
1. Upload the file and indicate "no header" in the upload options.
2. Wait for profiling.
3. Inspect column names.

**Expected Result:**
- Columns are assigned positional names (e.g. `col_1`, `col_2`, or `column_0`, `column_1`).
- Row count includes all rows (the first row is treated as data).

---

### TC-018 — Header detection: XLS with merged header cells

**Preconditions:**
- An XLS file where the first row has merged cells spanning multiple columns.

**Steps:**
1. Upload the XLS file.
2. Wait for profiling.
3. Inspect column names.

**Expected Result:**
- Merged header cells produce a single named column; subsequent columns under the merge are assigned positional sub-names or left blank.
- Profiling completes without error; no crash.

---

### TC-019 — Header detection: CSV with blank first row

**Preconditions:**
- A CSV file where the first row is entirely blank (no data, no column names).

**Steps:**
1. Upload the file.
2. Wait for profiling.
3. Inspect column names and row count.

**Expected Result:**
- Profiling handles the blank row gracefully — either skips it and uses the second row as the header, or assigns positional names.
- No unhandled error; quality score present.

---

### TC-020 — Quality score band: critical (score < 50)

**Preconditions:**
- A file with > 50 % null values across most columns so the overall quality score falls below 50.

**Steps:**
1. Upload and profile the file.
2. Open VendorFileQuality and DataProfile.

**Expected Result:**
- Quality score is displayed as < 50.
- The score badge / indicator shows a red or "critical" colour band.

---

### TC-021 — Quality score band: warning (50–79)

**Preconditions:**
- A file engineered to produce a quality score between 50 and 79 (e.g. moderate null rate).

**Steps:**
1. Upload and profile the file.
2. Open VendorFileQuality and DataProfile.

**Expected Result:**
- Quality score displayed between 50 and 79.
- Score badge shows an amber or "warning" colour band.

---

### TC-022 — Quality score band: good (≥ 80)

**Preconditions:**
- A clean file with < 5 % nulls and consistent types, expected to score ≥ 80.

**Steps:**
1. Upload and profile the file.
2. Open VendorFileQuality and DataProfile.

**Expected Result:**
- Quality score is ≥ 80.
- Score badge shows a green or "good" colour band.

---

### TC-023 — Anomaly detection: sudden null spike

**Preconditions:**
- The same vendor file has been profiled at least once previously with < 5 % nulls in a key column.
- A new version of the file is prepared where that column has > 50 % nulls.

**Steps:**
1. Upload the new version of the file.
2. Wait for profiling and anomaly detection.
3. Open the DataProfile or anomaly panel.

**Expected Result:**
- An anomaly is flagged indicating a significant null increase in that column.
- The anomaly appears in the anomaly list with a status of `open`.

---

### TC-024 — Anomaly detection: new column appears

**Preconditions:**
- A file previously profiled with 5 columns.
- A new version of the file prepared with an extra 6th column.

**Steps:**
1. Upload the new version.
2. Wait for profiling.
3. Check the anomaly list.

**Expected Result:**
- An anomaly or schema-change alert is flagged indicating a new column was detected.

---

### TC-025 — Anomaly detection: data type changes between profiles

**Preconditions:**
- A file previously profiled where a column contained integers.
- A new version where that column contains strings.

**Steps:**
1. Upload the new version.
2. Wait for profiling.
3. Check the anomaly list.

**Expected Result:**
- An anomaly is flagged for the type change on that column.

---

### TC-026 — Anomaly detection: duplicate key column

**Preconditions:**
- A file with a column intended to be unique (e.g. `customer_id`) but containing duplicate values.

**Steps:**
1. Upload and profile the file.
2. Check the quality checks or anomaly panel.

**Expected Result:**
- The duplicate condition is reported in the quality checks results for that column.

---

### TC-027 — Profiling error: unsupported file extension

**Preconditions:**
- A file with an unsupported extension (e.g. `.docx`, `.pptx`).

**Steps:**
1. Attempt to upload the file.
2. Observe the response.

**Expected Result:**
- A clear error message is returned indicating the file type is not supported.
- No crash or unhandled exception.
- The file is not stored or profiled.

---

### TC-028 — Profiling error: corrupted file

**Preconditions:**
- A CSV file with random binary data injected mid-file, rendering it unreadable.

**Steps:**
1. Upload the corrupted file.
2. Observe the profiling result.

**Expected Result:**
- A meaningful error message is shown (e.g. "Could not parse file: encoding error").
- No crash; the file record is not left in a broken state without a status.

---

### TC-029 — Profiling error: empty file

**Preconditions:**
- A zero-byte file with a `.csv` extension.

**Steps:**
1. Upload the empty file.
2. Observe the profiling result.

**Expected Result:**
- A clear error message is shown (e.g. "File is empty").
- No quality score calculated; no crash.

---

### TC-030 — Column profile: top-10 most frequent values

**Preconditions:**
- A CSV file with a categorical column (e.g. `status`) containing repeated values.

**Steps:**
1. Upload and profile the file.
2. Open the DataProfile page and expand the column detail for `status`.

**Expected Result:**
- Up to 10 most frequent values are listed, each with a count and percentage.
- Values are sorted descending by frequency.

---

### TC-031 — Column profile: least frequent values

**Preconditions:**
- Same file as TC-030.

**Steps:**
1. Open the DataProfile page and expand the column detail for `status`.

**Expected Result:**
- At least one least-frequent value is shown with its count.
- Least-frequent entry has a lower count than the most-frequent entry.

---

### TC-032 — Column profile: numeric min/max/mean

**Preconditions:**
- A CSV file with a numeric column (e.g. `amount`).

**Steps:**
1. Upload and profile the file.
2. Open the DataProfile page and expand the `amount` column.

**Expected Result:**
- Minimum, maximum, and mean values are displayed for the numeric column.
- Values match what you would compute manually on the data.

---

### TC-033 — Column profile: date column earliest/latest

**Preconditions:**
- A CSV file with a date column (e.g. `transaction_date` in YYYY-MM-DD format).

**Steps:**
1. Upload and profile the file.
2. Open the DataProfile page and expand the `transaction_date` column.

**Expected Result:**
- Earliest and latest date values are displayed.
- Dates are displayed in a human-readable format.

---

### TC-034 — Re-profiling: profile refreshes on new upload

**Preconditions:**
- A CSV file previously uploaded and profiled with row count = 100, quality score = 85.
- A new version of the same vendor file prepared with row count = 200, lower quality.

**Steps:**
1. Upload the new version under the same vendor agreement.
2. Wait for profiling to complete.
3. Open the DataProfile page.

**Expected Result:**
- Row count shown is 200 (new value), not 100 (old value).
- Quality score reflects the new file's quality.
- The previous profile is not served from cache.

---

### TC-035 — Re-profiling: quality score delta is visible

**Preconditions:**
- Same scenario as TC-034 where the quality score has changed.

**Steps:**
1. Open the ETL job detail or DataProfile page after re-profiling.

**Expected Result:**
- A before/after quality score comparison is shown (e.g. "Was 85 → Now 72").
- The delta direction (improvement or degradation) is visually indicated.

---

## Area 2 — Quality Rule CRUD

### TC-036 — Create a completeness rule

**Preconditions:**
- User is logged in with quality rule management permission.
- Navigate to the Quality Rules page.

**Steps:**
1. Click "New Rule" (or equivalent).
2. Enter rule name: `Email completeness check`.
3. Select rule type: `Completeness`.
4. Set threshold to `95` (%).
5. Assign to a project.
6. Set severity to `warning`.
7. Save.

**Expected Result:**
- Rule is created and appears in the rules list.
- `rule_type = 'completeness'`, `rule_config.threshold = 0.95` (normalized from 95).
- Severity = `warning`.

---

### TC-037 — Create a validity rule: datatype → date

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Click "New Rule".
2. Enter name: `Birth date format check`.
3. Select rule type: `Validity` → sub-type: `Data Type` → `Date`.
4. Leave date format blank (auto-detect mode).
5. Save.

**Expected Result:**
- Rule created with `rule_type = 'validity'`, `rule_config = { type: 'datatype', datatype: 'date' }`.
- `rule_config.date_format` is absent or null.

---

### TC-038 — Create a validity rule: datatype → datetime

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Create a new Validity → Data Type → `Datetime` rule named `Event timestamp check`.
2. Save.

**Expected Result:**
- `rule_config = { type: 'datatype', datatype: 'datetime' }`.

---

### TC-039 — Create a validity rule: datatype → email

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Create Validity → Data Type → `Email` rule named `Contact email check`.
2. Save.

**Expected Result:**
- `rule_config = { type: 'datatype', datatype: 'email' }`.

---

### TC-040 — Create a validity rule: datatype → phone

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Create Validity → Data Type → `Phone` rule named `Customer phone check`.
2. Save.

**Expected Result:**
- `rule_config = { type: 'datatype', datatype: 'phone' }`.

---

### TC-041 — Create a validity rule: datatype → integer

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Create Validity → Data Type → `Integer` rule named `Order ID integer check`.
2. Save.

**Expected Result:**
- `rule_config = { type: 'datatype', datatype: 'number' }` (or `integer` depending on UI mapping).

---

### TC-042 — Create a validity rule: datatype → float

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Create Validity → Data Type → `Float` rule named `Amount decimal check`.
2. Save.

**Expected Result:**
- Rule created; datatype stored as `float` or `number` per schema.

---

### TC-043 — Create a validity rule: datatype → boolean

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Create Validity → Data Type → `Boolean` rule named `Active flag check`.
2. Save.

**Expected Result:**
- `rule_config = { type: 'datatype', datatype: 'boolean' }`.

---

### TC-044 — Create a validity rule: pattern (regex)

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Create Validity → Pattern rule named `US ZIP code check`.
2. Enter regex pattern: `^\d{5}(-\d{4})?$`.
3. Save.

**Expected Result:**
- `rule_config = { type: 'pattern', pattern: '^\\d{5}(-\\d{4})?$' }`.

---

### TC-045 — Create a validity rule: range (min/max)

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Create Validity → Range rule named `Age range check`.
2. Enter min = `0`, max = `120`.
3. Save.

**Expected Result:**
- `rule_config = { type: 'range', min: 0, max: 120 }`.

---

### TC-046 — Create a validity rule: enum (allowed values)

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Create Validity → Enum rule named `Status values check`.
2. Enter allowed values: `active`, `inactive`, `pending`.
3. Save.

**Expected Result:**
- `rule_config = { type: 'enum', allowed_values: ['active', 'inactive', 'pending'] }`.

---

### TC-047 — Create a consistency rule: cross-field expression

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Create Consistency rule named `End date after start date`.
2. Enter expression: `end_date >= start_date`.
3. Save.

**Expected Result:**
- `rule_type = 'consistency'`, `rule_config.expression = 'end_date >= start_date'` (or similar cross_field structure).

---

### TC-048 — Create a uniqueness rule

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Create Uniqueness rule named `Customer ID uniqueness`.
2. Optionally assign to `customer_id` column.
3. Save.

**Expected Result:**
- `rule_type = 'uniqueness'`.

---

### TC-049 — Create a freshness rule

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Create Freshness rule named `File freshness check`.
2. Set `max_age_hours = 48`.
3. Save.

**Expected Result:**
- `rule_type = 'freshness'`, `rule_config.max_age_hours = 48`.

---

### TC-050 — Create a record count rule: exactly

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Create Record Count rule named `Expected row count`.
2. Set operator = `exactly`, expected_count = `500`.
3. Save.

**Expected Result:**
- `rule_type = 'record_count'`, `rule_config = { operator: 'exactly', expected_count: 500 }`.

---

### TC-051 — Create a record count rule: at_least / at_most / between

**Preconditions:**
- Navigate to the Quality Rules page.

**Steps:**
1. Create Record Count → `at_least` rule with expected_count = `100`.
2. Create Record Count → `at_most` rule with expected_count = `10000`.
3. Create Record Count → `between` rule with min_count = `50`, max_count = `200`.
4. Save each.

**Expected Result:**
- Each rule stored with the correct operator and bounds in `rule_config`.

---

### TC-052 — Date format picker: select named format MM/DD/YYYY

**Preconditions:**
- Navigate to Quality Rules → Create → Validity → Data Type → Date.

**Steps:**
1. From the "Date Format" dropdown, select `MM/DD/YYYY`.
2. Save the rule.

**Expected Result:**
- `rule_config.date_format = 'MM/DD/YYYY'`.
- No custom text input appears (dropdown selection is sufficient).

---

### TC-053 — Date format picker: select named format DD/MM/YYYY

**Preconditions:**
- Navigate to Quality Rules → Create → Validity → Data Type → Date.

**Steps:**
1. From the "Date Format" dropdown, select `DD/MM/YYYY`.
2. Save.

**Expected Result:**
- `rule_config.date_format = 'DD/MM/YYYY'`.

---

### TC-054 — Date format picker: select YYYY-MM-DD, MM-DD-YYYY, DD-MM-YYYY, YYYY/MM/DD, YYYYMMDD

**Preconditions:**
- Navigate to Quality Rules → Create → Validity → Data Type → Date.

**Steps:**
1. For each format in the list (`YYYY-MM-DD`, `MM-DD-YYYY`, `DD-MM-YYYY`, `YYYY/MM/DD`, `YYYYMMDD`), create a separate rule and save.

**Expected Result:**
- Each rule stores the exact format string in `rule_config.date_format`.

---

### TC-055 — Date format picker: custom token string

**Preconditions:**
- Navigate to Quality Rules → Create → Validity → Data Type → Date.

**Steps:**
1. Select "Custom" from the date format dropdown (or leave dropdown at default and use the text input).
2. Type `YYYY/DD/MM` in the custom format text input.
3. Save the rule.

**Expected Result:**
- `rule_config.date_format = 'YYYY/DD/MM'`.

---

### TC-056 — Date format picker: blank (auto-detect)

**Preconditions:**
- Navigate to Quality Rules → Create → Validity → Data Type → Date.

**Steps:**
1. Leave the date format dropdown/input completely blank.
2. Save.

**Expected Result:**
- `rule_config.date_format` is absent or null.
- Rule evaluates in auto-detect mode (any recognised format accepted).

---

### TC-057 — Edit a rule: change severity

**Preconditions:**
- An existing completeness rule with severity = `warning`.

**Steps:**
1. Open the rule for editing.
2. Change severity from `warning` to `error`.
3. Save.

**Expected Result:**
- The rule's severity is updated to `error`.
- Existing unresolved violations for this rule retain their original severity (not retroactively changed unless re-evaluation is triggered).

---

### TC-058 — Edit a rule: change threshold

**Preconditions:**
- An existing completeness rule with threshold = `0.90`.

**Steps:**
1. Open the rule for editing.
2. Change threshold to `0.80`.
3. Save.

**Expected Result:**
- `rule_config.threshold` updated to `0.80`.
- Violation counts are not automatically wiped; re-evaluation must be triggered separately.

---

### TC-059 — Delete a rule

**Preconditions:**
- An existing quality rule with at least one associated violation.

**Steps:**
1. On the Quality Rules page, click delete for the rule.
2. Observe the confirmation dialog.
3. Confirm deletion.

**Expected Result:**
- Confirmation dialog warns that associated violations will also be deleted.
- After confirmation, the rule is removed from `quality_rules`.
- Associated rows are removed from `quality_rule_violations`.
- The rule no longer appears in the rules list or any rule picker.

---

### TC-060 — Enable / disable a rule

**Preconditions:**
- An existing quality rule with `enabled = true`.

**Steps:**
1. Toggle the rule to disabled.
2. Trigger a rule evaluation run on a file associated with this rule.
3. Check the violations table.

**Expected Result:**
- The disabled rule is not evaluated; no new violations are created for it.
- Re-enable the rule and trigger evaluation again.
- The rule now runs and may produce violations.

---

### TC-061 — Project scoping: rule appears only in its project

**Preconditions:**
- Two projects: Project A and Project B.
- A quality rule created and scoped to Project A only.

**Steps:**
1. Open the rule picker or quality rules list in Project A context.
2. Open the rule picker or quality rules list in Project B context.

**Expected Result:**
- The rule appears in Project A's list.
- The rule does NOT appear in Project B's list.

---

### TC-062 — Project scoping: global rule appears in all projects

**Preconditions:**
- A quality rule created with `project_id = NULL` (global scope).

**Steps:**
1. Open the rules list in Project A.
2. Open the rules list in Project B.

**Expected Result:**
- The global rule appears in both projects' rule lists.

---

### TC-063 — Validation on save: missing required fields

**Preconditions:**
- Navigate to Quality Rules → New Rule.

**Steps:**
1. Leave rule name blank.
2. Leave rule type unselected.
3. Click Save.

**Expected Result:**
- Inline validation errors appear next to the required fields (rule name, rule type).
- The rule is not saved.

---

### TC-064 — Validation on save: invalid regex pattern

**Preconditions:**
- Navigate to Quality Rules → New Rule → Validity → Pattern.

**Steps:**
1. Enter an invalid regex pattern such as `[unclosed`.
2. Click Save.

**Expected Result:**
- An inline error is shown indicating the regex pattern is invalid.
- The rule is not saved.

---

### TC-065 — Validation on save: range min > max

**Preconditions:**
- Navigate to Quality Rules → New Rule → Validity → Range.

**Steps:**
1. Enter min = `200`, max = `100` (min greater than max).
2. Click Save.

**Expected Result:**
- An inline validation error is shown (e.g. "Min must be less than or equal to Max").
- The rule is not saved.

---

## Area 3 — Rule Evaluation Engine

### TC-066 — Completeness rule: violation generated

**Preconditions:**
- A CSV file where the `email` column has 80 % of rows populated (20 % null).
- A completeness rule assigned to `email` with threshold = `90 %`.

**Steps:**
1. Trigger a DQ evaluation run on the file.
2. Check `quality_rule_violations` or the violation summary UI.

**Expected Result:**
- A violation is recorded for the completeness rule.
- `actual_value` shows approximately `80 % completeness (20 nulls out of 100)`.
- `expected_value` shows `90.0% completeness`.

---

### TC-067 — Completeness rule: passes when threshold is lower

**Preconditions:**
- Same file as TC-066 (80 % populated).
- A completeness rule with threshold = `70 %`.

**Steps:**
1. Trigger evaluation.
2. Check violations.

**Expected Result:**
- No violation created for this rule (80 % ≥ 70 %).

---

### TC-068 — Null check: violations per null row

**Preconditions:**
- A CSV file where the `customer_id` column has 3 explicit NULL values.
- A `null_check` (or completeness threshold = 100 %) rule assigned to `customer_id`.

**Steps:**
1. Trigger evaluation.
2. Check violations.

**Expected Result:**
- Violations are recorded for the null rows.
- A row with no NULLs in `customer_id` produces zero violations.

---

### TC-069 — Email validity: valid emails pass

**Preconditions:**
- A CSV file with an `email` column containing valid RFC-5321 addresses (e.g. `user@example.com`).
- An email validity rule assigned to `email`.

**Steps:**
1. Trigger evaluation.
2. Check violations.

**Expected Result:**
- No violations for rows with valid email addresses.

---

### TC-070 — Email validity: invalid emails fail

**Preconditions:**
- Same setup as TC-069 but some rows contain invalid addresses:
  - `notanemail` (missing @)
  - `user @example.com` (space in address)
  - `@example.com` (missing local part)

**Steps:**
1. Trigger evaluation.
2. Check violations.

**Expected Result:**
- Violations are recorded for each invalid email row.
- Valid email rows produce no violations.

---

### TC-071 — Email validity: blank values handled by completeness separately

**Preconditions:**
- A CSV file with an `email` column where some rows are blank/null.
- Both an email validity rule AND a completeness rule assigned to `email`.

**Steps:**
1. Trigger evaluation.
2. Check violations.

**Expected Result:**
- Blank/null rows are skipped by the email validity rule (null handling in `validateValidity`).
- Blank/null rows are counted by the completeness rule.
- The two rules produce separate, independent violations; no double-counting.

---

### TC-072 — Phone validity: E.164 format passes

**Preconditions:**
- A CSV file with a `phone` column containing values like `+12025551234` and `12025551234`.
- A phone validity rule assigned to `phone`.

**Steps:**
1. Trigger evaluation.
2. Check violations.

**Expected Result:**
- Phone numbers with ≥ 10 digits (after stripping non-digits) pass.
- No violations for valid phone numbers.

---

### TC-073 — Phone validity: free-text strings fail

**Preconditions:**
- Same setup as TC-072, but some rows contain `call me maybe` or `555-CALL`.

**Steps:**
1. Trigger evaluation.
2. Check violations.

**Expected Result:**
- Rows with non-numeric strings that have fewer than 10 digits after stripping produce violations.

---

### TC-074 — Date format: named format DD/MM/YYYY — pass

**Preconditions:**
- A CSV with a `birth_date` column.
- A date validity rule with `date_format = 'DD/MM/YYYY'` assigned to `birth_date`.
- Rows contain: `31/12/2024`, `01/01/2000`, `15/06/1990`.

**Steps:**
1. Trigger evaluation.
2. Check violations.

**Expected Result:**
- All three rows pass; zero violations.

---

### TC-075 — Date format: named format DD/MM/YYYY — fail on wrong format

**Preconditions:**
- Same rule as TC-074.
- Rows contain: `12/31/2024` (MM/DD/YYYY), `2024-12-31` (YYYY-MM-DD).

**Steps:**
1. Trigger evaluation.
2. Check violations.

**Expected Result:**
- Both rows produce violations.
- `expected_value` indicates `DD/MM/YYYY`.
- `actual_value` shows the offending string.

---

### TC-076 — Date format: named format YYYY-MM-DD — pass and fail

**Preconditions:**
- A date validity rule with `date_format = 'YYYY-MM-DD'`.
- Test data includes: `2024-12-31` (pass), `12/31/2024` (fail), `31/12/2024` (fail).

**Steps:**
1. Trigger evaluation.
2. Check violations.

**Expected Result:**
- `2024-12-31` passes; the other two produce violations.

---

### TC-077 — Date format: custom token YYYY/DD/MM — pass

**Preconditions:**
- A date rule with `date_format = 'YYYY/DD/MM'`.
- Test data: `2024/31/12`.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- `2024/31/12` passes; zero violations.

---

### TC-078 — Date format: custom token YYYY/DD/MM — fail

**Preconditions:**
- Same rule as TC-077.
- Test data: `31/12/2024`, `2024-31-12`, `12/31/2024`.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- All three rows fail and produce violations.

---

### TC-079 — Date format: auto-detect mode — recognised format passes

**Preconditions:**
- A date rule with no `date_format` (auto-detect).
- Test data includes dates in multiple recognised formats: `2024-01-15`, `01/15/2024`, `15.01.2024`.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- All rows with valid recognisable dates pass; zero violations.

---

### TC-080 — Date format: auto-detect mode — non-date string fails

**Preconditions:**
- Same rule as TC-079.
- Test data: `not-a-date`, `hello`, `99/99/9999`.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- Rows with non-date strings produce violations.
- Row with `99/99/9999` (invalid month/day) also produces a violation.

---

### TC-081 — Datetime format: ISO 8601 with time component passes

**Preconditions:**
- A validity rule with `datatype = 'datetime'` assigned to a `created_at` column.
- Test data: `2024-01-15T14:30:00Z`, `2024-01-15T14:30:00`.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- Both rows pass; zero violations.

---

### TC-082 — Datetime format: date-only string fails for datetime rule

**Preconditions:**
- Same rule as TC-081.
- Test data: `2024-01-15` (no time component).

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- The date-only value fails the datetime check and produces a violation.

---

### TC-083 — Pattern rule: matching values pass

**Preconditions:**
- A pattern rule with regex `^\d{5}(-\d{4})?$` assigned to a `zip_code` column.
- Test data: `12345`, `12345-6789`.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- Both rows pass; zero violations.

---

### TC-084 — Pattern rule: non-matching values fail

**Preconditions:**
- Same rule as TC-083.
- Test data: `ABCDE`, `1234`, `12345-67` (malformed extension).

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- All three rows produce violations.

---

### TC-085 — Pattern rule: invalid regex stored — clear error status

**Preconditions:**
- A pattern rule with an invalid regex (e.g. `[unclosed`) that was somehow saved to the database.

**Steps:**
1. Trigger evaluation against a file with this rule assigned.
2. Check the violation log or rule status.

**Expected Result:**
- The rule is not silently applied.
- An error is logged in the evaluation engine indicating the pattern is invalid.
- No false violations are produced.

---

### TC-086 — Range rule: value within bounds passes

**Preconditions:**
- A range rule with min = `0`, max = `100` assigned to an `age` column.
- Test data: `0`, `50`, `100`.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- All three values pass (boundary values included); zero violations.

---

### TC-087 — Range rule: value below minimum fails

**Preconditions:**
- Same rule as TC-086.
- Test data: `-1`.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- Violation produced; `actual_value = '-1'`, message indicates below minimum.

---

### TC-088 — Range rule: value above maximum fails

**Preconditions:**
- Same rule as TC-086.
- Test data: `101`.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- Violation produced; `actual_value = '101'`, message indicates above maximum.

---

### TC-089 — Enum rule: value in allowed list passes

**Preconditions:**
- An enum rule with `allowed_values = ['active', 'inactive', 'pending']` on a `status` column.
- Test data: `active`, `pending`.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- Both rows pass; zero violations.

---

### TC-090 — Enum rule: value not in allowed list fails

**Preconditions:**
- Same rule as TC-089.
- Test data: `suspended`, `ACTIVE` (case mismatch, if rule is case-sensitive), ``.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- `suspended` produces a violation.
- `ACTIVE` produces a violation if the enum is case-sensitive (compare to stored `active`).

---

### TC-091 — Uniqueness rule: duplicate values produce violations

**Preconditions:**
- A uniqueness rule assigned to a `customer_id` column.
- Test data: 3 rows where `customer_id = 'C001'` (duplicate).

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- Violations recorded for the duplicate rows (or one violation per duplicate group, as per implementation).
- A fully unique column produces zero violations.

---

### TC-092 — Freshness rule: within max_age_hours — passes

**Preconditions:**
- A freshness rule with `max_age_hours = 48` assigned to a `last_updated` timestamp column.
- Test data: a timestamp within the last 48 hours.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- Zero violations; the data is fresh.

---

### TC-093 — Freshness rule: older than max_age_hours — violation

**Preconditions:**
- Same rule as TC-092.
- Test data: a timestamp > 48 hours ago.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- A violation is recorded indicating the data is stale.

---

### TC-094 — Record count: exactly — passes

**Preconditions:**
- A record count rule: operator = `exactly`, expected_count = `100`.
- A file with exactly 100 data rows.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- Zero violations.

---

### TC-095 — Record count: exactly — fails on N±1

**Preconditions:**
- Same rule as TC-094.
- Test files: one with 99 rows, one with 101 rows.

**Steps:**
1. Trigger evaluation for each file.

**Expected Result:**
- Both evaluations produce violations.
- `actual_value = '99 records'` and `'101 records'` respectively.

---

### TC-096 — Record count: at_least — boundary values

**Preconditions:**
- A record count rule: operator = `at_least`, expected_count = `50`.
- Test files: 49 rows (fail), 50 rows (pass), 100 rows (pass).

**Steps:**
1. Trigger evaluation for each file.

**Expected Result:**
- 49-row file produces a violation.
- 50-row and 100-row files produce no violations.

---

### TC-097 — Record count: at_most — boundary values

**Preconditions:**
- A record count rule: operator = `at_most`, expected_count = `200`.
- Test files: 200 rows (pass), 201 rows (fail).

**Steps:**
1. Trigger evaluation for each file.

**Expected Result:**
- 200-row file passes; 201-row file fails.

---

### TC-098 — Record count: between — boundary values

**Preconditions:**
- A record count rule: operator = `between`, min_count = `10`, max_count = `50`.
- Test files: 9 rows (fail), 10 rows (pass), 50 rows (pass), 51 rows (fail).

**Steps:**
1. Trigger evaluation for each file.

**Expected Result:**
- 9 and 51 produce violations; 10 and 50 pass.

---

### TC-099 — Consistency: cross-field expression — valid rows pass

**Preconditions:**
- A consistency rule: `end_date >= start_date` assigned to a file with `start_date` and `end_date` columns.
- Test rows: `start_date = 2024-01-01`, `end_date = 2024-12-31`.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- Valid rows produce no violations.

---

### TC-100 — Consistency: cross-field expression — invalid rows fail

**Preconditions:**
- Same rule as TC-099.
- Test rows: `start_date = 2024-12-31`, `end_date = 2024-01-01` (end before start).

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- A violation is recorded for the row where end < start.

---

### TC-101 — Consistency: expression referencing non-existent column

**Preconditions:**
- A consistency rule: `missing_col >= start_date` where `missing_col` does not exist in the file.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- The rule is marked as error or not-run with a clear message.
- No false violations are produced.

---

### TC-102 — Multiple rules on the same column: independent evaluation

**Preconditions:**
- A `name` column with a completeness rule (threshold 95 %) AND a validity/pattern rule.
- Some rows are null (trigger completeness), some rows have invalid patterns (trigger validity).

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- Two sets of violations: one for completeness, one for pattern mismatch.
- Each rule's violations are stored separately in `quality_rule_violations` (distinguishable by `rule_id`).

---

### TC-103 — Unresolved target column: rule shows Not Run

**Preconditions:**
- A quality rule assigned to column `nonexistent_col` that does not appear in the file schema.

**Steps:**
1. Trigger evaluation.

**Expected Result:**
- The rule shows a status of "Not Run" in the UI.
- No violations are created for this rule.

---

### TC-104 — Integer/float rule IDs stored as strings: no silent drop

**Preconditions:**
- A scenario where rule IDs are returned as integers from the DB but stored as strings in `quality_rule_violations` (or vice versa).
- Quality rule violations exist for this rule.

**Steps:**
1. Open the violation list or the lineage node detail drawer for the associated file.

**Expected Result:**
- Violations appear correctly in the UI.
- No "NOT RUN" false positive; violations are not silently dropped due to type mismatch.

---

### TC-105 — Re-evaluation: previously violated rule now passes

**Preconditions:**
- A file with a completeness violation on `email` (threshold 90 %, actual 80 %).
- The data is corrected so `email` is now 95 % complete.

**Steps:**
1. Trigger re-evaluation (via the re-evaluate endpoint or re-upload).
2. Check violations.

**Expected Result:**
- The previous violation is cleared (no longer active).
- No new violation for the completeness rule.

---

### TC-106 — Re-evaluation: rules that still fail retain violations

**Preconditions:**
- Same scenario as TC-105 but a second rule (pattern) is still failing.

**Steps:**
1. Trigger re-evaluation.

**Expected Result:**
- The completeness violation is cleared.
- The pattern rule violations remain (or are refreshed with new violations).

---

### TC-107 — log_continue violation: job does not abort

**Preconditions:**
- A quality rule with `error_action = 'log_continue'` (warning severity).
- A file/job where this rule fires.

**Steps:**
1. Trigger the evaluation/job run.
2. Observe job status.
3. Check `quality_rule_violations`.

**Expected Result:**
- The job completes (does not abort).
- The violation is recorded in `quality_rule_violations`.
- The rule name is visible in the console/log panel output (not just the rule ID).

---

### TC-108 — abort violation: job stops on first violation

**Preconditions:**
- A quality rule with `error_action = 'abort'` (error or critical severity).
- A file/job where this rule fires on the first data row.

**Steps:**
1. Trigger the evaluation/job run.
2. Observe job status.

**Expected Result:**
- The job is aborted after the first violation.
- Downstream steps/mappings are not executed.
- Job status shows "Failed" or "Aborted".
- Violation is recorded in `quality_rule_violations`.

---

## Area 4 — Schema Builder Rule Assignments

### TC-109 — Assign column-level rule: persists after navigation

**Preconditions:**
- A file with a known schema (at least 3 columns) opened in the Schema Builder.
- At least one quality rule exists in the system.

**Steps:**
1. Open the Schema Builder for the file.
2. Click on a column (e.g. `email`).
3. Select a quality rule from the rule picker.
4. Save (or wait for auto-save indicator to resolve).
5. Navigate away from the Schema Builder page.
6. Return to the Schema Builder for the same file.

**Expected Result:**
- The rule assignment is still visible on the `email` column.
- The assignment is stored in `file_quality_rules` with the correct `file_id`, `rule_id`, and `target_columns`.

---

### TC-110 — Assign file-level rule: does not trigger column picker on re-click

**Preconditions:**
- Schema Builder open for a file.
- A file-level rule (e.g. record count) available in the rule picker.

**Steps:**
1. Assign the file-level rule to the file (not to a specific column).
2. Click the assigned rule pill again.

**Expected Result:**
- No column picker dialog opens on re-click.
- The rule is stored in `file_quality_rules` with `target_columns = NULL` (file-level scope).

---

### TC-111 — Assign multiple rules to one column

**Preconditions:**
- Schema Builder open.
- Two rules available: a completeness rule and a validity/pattern rule.

**Steps:**
1. Assign both rules to the same column (e.g. `email`).
2. Save.

**Expected Result:**
- Both rule IDs are stored in `file_quality_rules` for the `email` column.
- Both rules are evaluated independently on the next run.

---

### TC-112 — Remove a rule assignment

**Preconditions:**
- A column with an assigned rule (from TC-109 or TC-111).

**Steps:**
1. In Schema Builder, deselect/remove the rule from the column.
2. Save or wait for auto-save.
3. Trigger a new evaluation run.

**Expected Result:**
- The rule assignment is removed from `file_quality_rules`.
- The removed rule does not fire on the next evaluation run.

---

### TC-113 — Auto-save indicator appears and resolves

**Preconditions:**
- Schema Builder open for a file.

**Steps:**
1. Make a rule assignment change.
2. Observe the UI immediately after the change.

**Expected Result:**
- A visible "Saving…" indicator appears.
- After a short delay (debounce), the indicator changes to "Saved" or equivalent.
- No JavaScript console errors.

---

### TC-114 — Navigation immediately after assignment does not lose data

**Preconditions:**
- Schema Builder open with a debounced auto-save.

**Steps:**
1. Assign a new rule to a column.
2. Immediately navigate away from the page (before the auto-save debounce fires).
3. Return to the Schema Builder.

**Expected Result:**
- The rule assignment is present (auto-save completed before navigation, or a prompt prevented navigation until save).
- Assignment is not silently lost.

---

### TC-115 — Schema Builder with no rules configured: empty state

**Preconditions:**
- A system with no quality rules defined (or all rules deleted).
- Schema Builder open for a file.

**Steps:**
1. Open the rule picker in the Schema Builder.

**Expected Result:**
- A helpful empty state message is shown (e.g. "No quality rules defined. Create one in Quality Rules.").
- No JavaScript console errors or uncaught exceptions.

---

### TC-116 — Rule assignment survives file re-upload

**Preconditions:**
- A file with rule assignments stored in `file_quality_rules`.
- A new version of the same file ready for upload (same vendor agreement).

**Steps:**
1. Upload the new version of the file under the same vendor agreement.
2. Open the Schema Builder for the new file version.

**Expected Result:**
- Rule assignments from the previous version are carried forward (via vendor agreement schema merge).
- The assignments are visible in Schema Builder without manual re-assignment.

---

### TC-117 — Fixed-width file: rule assignment uses correct byte offsets

**Preconditions:**
- A DAT fixed-width file with column positions defined (e.g. `customer_id` at positions 0–9).
- A null check rule assigned to `customer_id` in the Schema Builder.

**Steps:**
1. Trigger evaluation.
2. Check violations.

**Expected Result:**
- The rule evaluates values extracted from the correct byte range for `customer_id`.
- No values from other columns bleed into the evaluation.

---

## Area 5 — Visual Mappings & DQ

### TC-118 — Assign DQ rules to a VM mapping: stored correctly

**Preconditions:**
- A visual mapping exists with a Target Rules node.
- At least two quality rules exist in the system.

**Steps:**
1. Open the visual mapping editor.
2. Click the Target Rules node (or Expression node with DQ rule assignment UI).
3. Assign two quality rules.
4. Save the mapping.

**Expected Result:**
- Rule IDs are stored in `transformation_quality_rules` for this mapping.
- Compilation succeeds (no "no quality rule IDs" warning when IDs are present).

---

### TC-119 — VM execution: all DQ rules pass

**Preconditions:**
- A VM mapping with assigned DQ rules.
- Source data that satisfies all assigned rules.

**Steps:**
1. Execute the VM mapping directly.
2. Wait for job completion.
3. Check job status and `quality_rule_violations`.

**Expected Result:**
- Job status = "Completed".
- Zero violations in `quality_rule_violations` for this `job_id`.

---

### TC-120 — VM execution: warning-severity violation → Completed with warnings

**Preconditions:**
- A VM mapping with a warning-severity DQ rule.
- Source data that triggers the rule.

**Steps:**
1. Execute the mapping.
2. Wait for completion.
3. Check job status in the Jobs dashboard.

**Expected Result:**
- Job status = "Completed with warnings".
- Violations recorded in `quality_rule_violations`.
- Warning badge visible on the job entry in the Jobs dashboard.

---

### TC-121 — VM execution: abort-severity violation → Failed

**Preconditions:**
- A VM mapping with an abort/error-severity DQ rule.
- Source data that triggers the rule on the first row.

**Steps:**
1. Execute the mapping.
2. Observe job status.

**Expected Result:**
- Job halted after the first violation.
- Job status = "Failed".
- Violations recorded with `severity = 'error'` or `'critical'`.
- Downstream mapping steps are not executed.

---

### TC-122 — DQ violations visible in Jobs detail view

**Preconditions:**
- A completed VM job with at least one DQ violation.

**Steps:**
1. Open the ETL Job Details page for the job.
2. Scroll to the DQ log / violations section.

**Expected Result:**
- The DQ log section shows counts: found / critical / error / warning.
- Individual violation rows are expandable to show column, expected value, actual value, and row number.

---

### TC-123 — Workflow-triggered VM run: DQ violations appear

**Preconditions:**
- A VM mapping triggered via a workflow (not direct execute).
- The mapping has DQ rules assigned.
- Source data triggers at least one rule.

**Steps:**
1. Trigger the workflow.
2. Wait for the VM run to complete.
3. Check `quality_rule_violations`.

**Expected Result:**
- Violations appear in `quality_rule_violations` with the correct `job_id`.
- The job's DQ violations are visible in the Jobs detail view.

---

### TC-124 — VM reconnect mid-execution: violations not lost or duplicated

**Preconditions:**
- A VM mapping with DQ rules that runs long enough to be interrupted.
- A mechanism to simulate a WebSocket reconnect (e.g. network interruption during a long file run).

**Steps:**
1. Start the VM execution.
2. Disconnect and reconnect mid-execution.
3. Allow the run to complete.
4. Count violations in `quality_rule_violations`.

**Expected Result:**
- All violations sent before the reconnect are persisted.
- Violations are not duplicated due to the reconnect.

---

### TC-125 — Quality score on VM output file

**Preconditions:**
- A VM mapping that produces an output file.

**Steps:**
1. Execute the mapping.
2. Open DataProfile for the output file.

**Expected Result:**
- A `quality_score` is computed and stored in `files` table for the output file.
- The score is visible in DataProfile.

---

### TC-126 — Multiple source files: violations attributed per source

**Preconditions:**
- A VM mapping with two source files joined together.
- Both sources have DQ rules assigned.
- Source A has violations; Source B is clean.

**Steps:**
1. Execute the mapping.
2. Check `quality_rule_violations`.

**Expected Result:**
- Violations are attributed to Source A's rules (correct `rule_id` and column context).
- No violations created for Source B.
- Lineage stats reflect the correct per-source attribution.

---

### TC-127 — VM mapping with no DQ rules: compiler warning emitted

**Preconditions:**
- A VM mapping with no DQ rules assigned (empty `qualityRuleIds`).

**Steps:**
1. Save or compile the mapping.
2. Check the server logs or compilation output.

**Expected Result:**
- A warning log entry is emitted (e.g. "Visual mapping compiled with no quality rule IDs — DQ validation will be skipped").
- The compilation succeeds (no error).
- Execution proceeds without DQ validation.

---

## Area 6 — Jobs Dashboard & Status

### TC-128 — "Completed with warnings" appears in summary counts

**Preconditions:**
- At least one job exists with status `completed_with_warnings`.

**Steps:**
1. Navigate to the Jobs dashboard.
2. Observe the summary counts section.

**Expected Result:**
- "Completed with warnings" is shown as a distinct count alongside "Completed", "Failed", and "Running".
- The count matches the number of actual jobs with this status.

---

### TC-129 — Status filter: filter by "Completed with warnings"

**Preconditions:**
- Multiple jobs exist with different statuses.

**Steps:**
1. On the Jobs list, apply the "Completed with warnings" status filter.

**Expected Result:**
- Only jobs with `completed_with_warnings` status are shown.
- The count in the filter badge matches the number of displayed jobs.

---

### TC-130 — Scheduled mapping run: status propagated correctly

**Preconditions:**
- A mapping run triggered by a cron schedule.
- The run completes with DQ warnings.

**Steps:**
1. Wait for the scheduled run to execute.
2. Check the Jobs list.

**Expected Result:**
- The job shows "Completed with warnings" (not just "Completed").
- DQ violations are attached to the job in the detail view.

---

### TC-131 — Workflow-triggered mapping: status propagated correctly

**Preconditions:**
- A mapping triggered via a workflow dependency (not a cron schedule, not direct execute).
- The run completes with DQ warnings.

**Steps:**
1. Trigger the workflow.
2. Check the Jobs list after the run.

**Expected Result:**
- Job shows "Completed with warnings".
- Violation counts in the Jobs detail view are accurate.

---

### TC-132 — Job history pagination: DQ counts accurate per page

**Preconditions:**
- More than one page of job history (e.g. > 20 or > 50 jobs depending on page size).
- Multiple jobs have DQ violations.

**Steps:**
1. Navigate to the job history.
2. Navigate between pages.

**Expected Result:**
- Each page loads correctly without errors.
- DQ violation counts shown for each job are accurate (not summed across pages).

---

### TC-133 — Job detail: quality score comparison

**Preconditions:**
- A job that processed a file and produced a quality score change (e.g. input file quality = 85, output file quality = 72).

**Steps:**
1. Open the ETL Job Details page.
2. Scroll to the quality score comparison section.

**Expected Result:**
- Before quality score (input) and after quality score (output) are both shown.
- A visual indicator (arrow, colour, or delta label) shows whether quality improved or degraded.

---

## Area 7 — Lineage & DQ

### TC-134 — File node: quality rules displayed in NodeDetailDrawer

**Preconditions:**
- A file with at least 2 DQ rules assigned and at least 1 violation.
- Lineage graph loaded with this file as a node.

**Steps:**
1. Open the lineage graph for the vendor agreement or file.
2. Click the file node.

**Expected Result:**
- The NodeDetailDrawer opens.
- Assigned quality rules are listed with rule name, type, severity, and violation count.

---

### TC-135 — File node: violation count accuracy

**Preconditions:**
- A file with exactly 5 rows violating a quality rule.

**Steps:**
1. Open the lineage graph and click the file node.

**Expected Result:**
- The drawer shows a count of 5 for the violated rule.
- A file with zero violations shows "Clean" (or equivalent zero-violation indicator).

---

### TC-136 — Transformation node: DQ rules displayed

**Preconditions:**
- A transformation (non-VM) mapping with quality rules assigned via `transformation_quality_rules`.

**Steps:**
1. Open the lineage graph.
2. Click the transformation/mapping node.

**Expected Result:**
- NodeDetailDrawer shows the assigned DQ rules for this mapping.
- Violation counts are shown per rule.

---

### TC-137 — VM mapping node: rules from graph_data.nodes (not deleted DB rows)

**Preconditions:**
- A VM mapping job that has completed. (VM jobs delete their `transformation_mappings` row after execution.)
- Quality violations exist for this VM job.

**Steps:**
1. Open the lineage graph.
2. Click the VM mapping node.

**Expected Result:**
- NodeDetailDrawer shows violation count correctly.
- Violations are discovered from `graph_data.nodes` and `visual_mapping_defs`, not from the deleted `transformation_mappings` row.

---

### TC-138 — Job node: aggregated violations across the job

**Preconditions:**
- A job that ran multiple mappings, each producing DQ violations.

**Steps:**
1. Open the lineage graph.
2. Click the job node.

**Expected Result:**
- The drawer shows total DQ violations aggregated across all files/mappings in the job run.

---

### TC-139 — Lineage built from job root: VM stats and violations appear

**Preconditions:**
- A job (not a file or vendor agreement) exists as the lineage root.
- The job includes a VM mapping run.

**Steps:**
1. Build the lineage graph with the job as the root node.
2. Inspect VM mapping node and file nodes.

**Expected Result:**
- VM execution stats (row count, quality score) are visible on the VM node.
- DQ violations appear on the relevant nodes.

---

### TC-140 — Same output file from multiple mappings: violations attributed separately

**Preconditions:**
- Two different mappings (Mapping A and Mapping B) that produce the same output file.
- Mapping A produces violations; Mapping B does not.

**Steps:**
1. Open the lineage graph.
2. Click the output file node.

**Expected Result:**
- NodeDetailDrawer shows PII/DQ violations attributed to Mapping A.
- Mapping B shows zero violations.
- Violations are not collapsed or merged across the two mappings.

---

### TC-141 — Incidents toggle: on vs off

**Preconditions:**
- Lineage graph with files that have DQ violations.

**Steps:**
1. Load the lineage graph with `includeIncidents = true`.
2. Observe violation overlays on nodes.
3. Reload with `includeIncidents = false`.

**Expected Result:**
- With `true`: nodes show violation count badges/overlays.
- With `false`: nodes are clean (no violation overlay shown).

---

### TC-142 — Stale lineage cache: updated counts appear after refresh

**Preconditions:**
- A lineage graph cached with violation count = 5 for a file node.
- A new DQ run resolves 3 violations so the count should now be 2.

**Steps:**
1. Trigger the new DQ run and resolution.
2. Refresh the lineage graph.

**Expected Result:**
- The file node now shows violation count = 2.
- Stale cached counts (5) are not served.

---

## Area 8 — Notifications & Error Review

### TC-143 — Violation lifecycle: open → resolved

**Preconditions:**
- At least one open violation in `quality_rule_violations`.

**Steps:**
1. Navigate to Error Review.
2. Find the open violation.
3. Mark it as resolved.
4. Check the violation status in the DB and in the lineage view.

**Expected Result:**
- `status` in `quality_rule_violations` updated to `resolved`.
- The resolved violation is excluded from active violation counts in the lineage NodeDetailDrawer.
- The violation still exists in history (not deleted).

---

### TC-144 — Violation lifecycle: suppressed

**Preconditions:**
- A recurring violation that fires on every evaluation run.

**Steps:**
1. In Error Review, suppress the violation.
2. Trigger another evaluation run.
3. Check active violation counts.

**Expected Result:**
- The suppressed violation no longer appears in active counts.
- The violation record still exists in `quality_rule_violations` history.

---

### TC-145 — Dashboard violation summary: counts match actual violations

**Preconditions:**
- The main dashboard shows a DQ violation summary section.
- A known number of unresolved violations exist.

**Steps:**
1. Navigate to the main dashboard.
2. Read the DQ violation count shown in the summary.
3. Query `quality_rule_violations` for unresolved violations.

**Expected Result:**
- The dashboard count matches the actual count of unresolved violations in the database.

---

### TC-146 — Error review: filter by rule type = validity

**Preconditions:**
- Violations of multiple types exist: completeness, validity, uniqueness.

**Steps:**
1. Open Error Review.
2. Apply filter: Rule Type = `validity`.

**Expected Result:**
- Only validity-type violations are shown.
- Completeness and uniqueness violations are hidden.

---

### TC-147 — Error review: filter by severity = error

**Preconditions:**
- Violations with mixed severities: warning, error, critical.

**Steps:**
1. Open Error Review.
2. Apply filter: Severity = `error`.

**Expected Result:**
- Only error-severity violations shown.
- Warning and critical violations are hidden.

---

### TC-148 — VM email notification sent after run

**Preconditions:**
- A VM mapping with email notification recipients configured.

**Steps:**
1. Execute the mapping.
2. Wait for completion.
3. Check the configured email recipient's inbox.

**Expected Result:**
- An email notification is received indicating the run completed (with or without violations, per notification configuration).

---

### TC-149 — log_continue rule name visible in console panel

**Preconditions:**
- A VM run with a `log_continue` violation.

**Steps:**
1. Execute the VM mapping.
2. Open the console/log panel for the run.

**Expected Result:**
- The rule name (e.g. "Email format check") appears in the log output, not just the rule ID (e.g. `42`).

---

## Area 9 — Cross-Cutting & Edge Cases

### TC-150 — Template upload: no duplicate system rules created

**Preconditions:**
- A vendor template containing a config-sensitive rule type (e.g. `record_count` with a specific expected count).
- The same template uploaded twice.

**Steps:**
1. Upload the template for the first time.
2. Upload the same template again.
3. Query `quality_rules` for rows with `rule_name LIKE '__schema_default__record_count__%'`.

**Expected Result:**
- Identical config fingerprints produce exactly one `__schema_default__` row (idempotent upsert).
- No duplicate rows with the same config fingerprint.

---

### TC-151 — Broken import pattern: no 500 errors on cold start

**Preconditions:**
- The api-server is stopped.

**Steps:**
1. Start the api-server fresh (cold start).
2. Make requests to any vendor, notification, and quality rules route.

**Expected Result:**
- All routes respond without HTTP 500 errors.
- No "Cannot read property of undefined" or "module not found" errors in the logs.

---

### TC-152 — app_settings: missing DB row — graceful fallback

**Preconditions:**
- The `app_settings` table has no row for a particular feature setting.

**Steps:**
1. Navigate to the feature that depends on that setting (e.g. a configurable threshold or notification default).

**Expected Result:**
- The feature falls back to a default value or displays a "not configured" state.
- No crash, no 500 error, no silent null-reference exception.

---

### TC-153 — Rule with integer ID stored as string: no NOT RUN false positive

**Preconditions:**
- Quality rule IDs that are integers in the DB but have been compared as strings in some path.

**Steps:**
1. Assign a quality rule to a file (rule ID is an integer, e.g. `42`).
2. Trigger evaluation.
3. Check the rule status in the UI.

**Expected Result:**
- Rule is evaluated correctly; does not show "Not Run".
- Violations are matched and displayed correctly regardless of ID type coercion.

---

### TC-154 — Cron scheduler: all schedule types trigger DQ evaluation

**Preconditions:**
- Four separate scheduled jobs configured with: daily, hourly, weekly, and a custom cron expression.
- Each job includes DQ rule evaluation.

**Steps:**
1. Allow or simulate each schedule type to fire.
2. Check that DQ evaluation ran for each.

**Expected Result:**
- All four schedule types trigger DQ evaluation successfully.
- The lazy-load pattern in `cronSchedulerService` correctly resolves the evaluation service for each schedule type.
- No "service not initialised" or "undefined is not a function" errors.

---

### TC-155 — Large violation set: batched insert, accurate count

**Preconditions:**
- A file with 50,000+ rows where approximately 30 % fail a completeness rule (≈ 15,000 violations).

**Steps:**
1. Trigger evaluation.
2. Wait for completion.
3. Check violation count in the UI and in `quality_rule_violations`.

**Expected Result:**
- Evaluation completes without the api-server running out of memory.
- Violation inserts are batched (not one INSERT per row causing timeouts).
- The count shown in the UI matches the actual count in the database.

---

### TC-156 — DQ heatmap: all columns clean

**Preconditions:**
- A file where all quality rules pass (zero violations).

**Steps:**
1. Open the DataQualityHeatmap component for this file.

**Expected Result:**
- Heatmap renders without JavaScript errors.
- All columns show a "clean" visual state (e.g. green cells or equivalent).

---

### TC-157 — DQ heatmap: mixed clean and violated columns

**Preconditions:**
- A file where some columns have violations and others do not.

**Steps:**
1. Open the DataQualityHeatmap.

**Expected Result:**
- Violated columns are visually distinct from clean columns.
- No render errors in the browser console.

---

### TC-158 — DQ heatmap: all columns violated

**Preconditions:**
- A file where every column has at least one violation.

**Steps:**
1. Open the DataQualityHeatmap.

**Expected Result:**
- Heatmap renders all columns in the "violated" visual state.
- No crash or empty-state error.

---

### TC-159 — Schema validation jobs: correct pass/fail per rule and file version

**Preconditions:**
- A file with a schema validation job recorded in `schema_validation_jobs`.
- The file is updated (new version) with a schema change that causes a previously passing rule to fail.

**Steps:**
1. Run schema validation on the new file version.
2. Query `schema_validation_jobs` for this file.

**Expected Result:**
- The new validation job shows the updated pass/fail status.
- The old job record is not overwritten; history is preserved.

---

### TC-160 — Schema validation jobs: re-running after schema change updates results

**Preconditions:**
- A file that previously had a schema validation failure.
- The file schema is corrected.

**Steps:**
1. Re-run schema validation.
2. Check `schema_validation_jobs`.

**Expected Result:**
- The new job shows a passing status for the corrected rules.
- Previous failure records are not retroactively changed.

---

*End of test case document. Total: 160 scenarios across 9 areas.*
