---
id: REQ-ING-008
title: Quality rules attached to a file at upload or drop
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-ING-004, REQ-ING-020]
contracts: []
priority: must
---
# REQ-ING-008: Quality rules attached to a file at upload or drop

## Context
The person delivering a file can choose quality rules to run on it, and a contract delivery also gets the rules declared in the matched agreement file schema (schema rules). Today any rule ids are accepted without checking that they exist or belong to the project. A malformed list silently becomes empty. Agreement rules come from a lookup that can pick a different file schema from the one used for validation.

## Requirements
1. The system shall accept an optional list of quality rule ids with an upload or drop request.
2. If the list is not a JSON array of ids, then the system shall reject the request with 400 and code `INVALID_OPTIONS`.
3. If any listed quality rule does not exist or is not usable in the target project, then the system shall reject the request with 400 and code `INVALID_QUALITY_RULE`, naming the ids.
4. Where a file has a matched agreement file schema, the system shall add that schema's rules to the file's rule list.
5. The system shall take schema rules only from the file's matched agreement file schema (REQ-ING-020), and from no other file schema of the agreement.
6. The system shall remove duplicate rule ids from the combined list.
7. The system shall pass the combined list to the file's processing job.

## Acceptance criteria
- **AC-1**: Given rules 11 and 12 usable in project 30, When a file is uploaded to project 30 with `[11,12]`, Then the job carries rules 11 and 12. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-2**: Given a contract upload whose matched file schema declares rules 12 and 40, When it is uploaded with `[11,12]`, Then the job carries exactly 11, 12 and 40. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-3**: Given an agreement with file schemas A (pattern `claims_*.csv`, no rules) and B (pattern `*.csv`, rules 50), When `claims_01.csv` is uploaded and A is its matched schema, Then the job carries no schema rules (not rule 50). <!-- source: areas/ING.md#duplicate -->
- **AC-4**: Given the rule list `"11,12"` (not a JSON array), When a file is uploaded, Then the response is 400 `INVALID_OPTIONS`. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-5**: Given rule 77 that belongs to a project the target project cannot use, When it is listed, Then the response is 400 `INVALID_QUALITY_RULE` naming 77 and no file is accepted. <!-- source: areas/ING.md#security -->
- **AC-6**: Given no rule list and no agreement, When a file is uploaded, Then the job carries an empty rule list. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->

## Out of scope
- Running rules and recording violations (data quality area).
- Defining which rules are usable in a project (data quality area).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: rule lists are short; see Open questions.

## Edge cases and errors
- If the agreement rule lookup fails, the request is rejected with 500 (generic message) rather than silently uploading without schema rules, as the old code did.
- A rule deleted after acceptance but before processing: handled by the rule engine.

## Open questions
- Which rules are "usable in a project": rules owned by the project, global rules, or both? The data quality area defines rule scope.
- Should vendors be allowed to attach their own rule ids on a drop? The old drop accepted them.
- Maximum number of rule ids per request?
