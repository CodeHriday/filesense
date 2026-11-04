---
id: REQ-PRJ-005
title: Create a top-level project with initial members and access groups
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-PRJ-002, REQ-PRJ-023, REQ-PRJ-025]
contracts: []
priority: must
---
# REQ-PRJ-005: Create a top-level project with initial members and access groups

## Context
Project managers create projects to hold a team's files, mappings and agreements. The old create accepted any caller, accepted a parent and an inline list of sub-projects (a second and third sub-project create path), wrote a column that exists in no schema, turned a non-string name or non-numeric member ids into a 500, and validated name characters only in the browser (PRJ BUG 1, 12, 15; SECURITY 3; DUPLICATE 3). This requirement keeps the creation rules that worked, moves validation to the server and leaves sub-project creation to REQ-PRJ-019.

## Requirements
1. When an authorised user (REQ-PRJ-002) submits a valid project, the system shall create a top-level project and respond 201 with the new project.
2. The system shall store the trimmed name, the description, the project type (default `internal`), metadata and settings (default empty objects), the caller as owner, active = true, archived = false and default = false.
3. The system shall add the creator as a direct member.
4. Where member ids are given, the system shall add each listed user as a direct member once, ignoring the creator and repeated ids.
5. Where access-group ids are given, the system shall assign each listed group once and record the caller as the user who added it.
6. Where a drop location is given, the system shall validate and store it as REQ-PRJ-023 defines.
7. The system shall create the project, memberships, group assignments and drop location in one transaction; if any part fails, nothing is stored.
8. If the name is missing or not a string, then the system shall respond 400 `Project name is required`.
9. If the trimmed name is empty, then the system shall respond 400 `Project name cannot be empty`.
10. If the trimmed name is longer than 255 characters or contains a character other than letters, digits, hyphen, underscore or whitespace, then the system shall respond 400 with code `INVALID_PROJECT_NAME`.
11. If the project type is not `internal` or `external`, then the system shall respond 400 `INVALID_PARAMETER`.
12. If any member id or access-group id is not a positive integer or does not exist, then the system shall respond 400 `INVALID_PARAMETER` listing the bad ids.
13. If the request names a parent project or sets the default flag, then the system shall respond 400 `INVALID_PARAMETER`.
14. If the owner already has a project or sub-project with the same name ignoring case, then the system shall respond 409 `{error: 'Duplicate project name', message: 'You already have a project named "<existing name>". Please choose a different name.'}`.

## Acceptance criteria
- **AC-1**: Given name "  Finance  ", When U creates the project, Then the response is 201 and the name is "Finance", type "internal", owner U, active true. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-2**: Given no name, When U creates, Then 400 `Project name is required`; Given name 123, Then 400 `Project name is required`; Given name "   ", Then 400 `Project name cannot be empty`. <!-- source: areas/PRJ.md#bug -->
- **AC-3**: Given a 255-character valid name, Then 201; Given a 256-character name, Then 400 `INVALID_PROJECT_NAME`. <!-- source: areas/PRJ.md#data-touched -->
- **AC-4**: Given name "Fin@nce", When U creates, Then 400 `INVALID_PROJECT_NAME`. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-5**: Given U owns "Finance", When U creates "finance", Then 409 `Duplicate project name` with message naming "Finance"; Given user V owns "Finance", When U creates "Finance", Then 201. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-6**: Given member ids [U, 5, 5], When U creates, Then the project has exactly two direct members, U and 5. <!-- source: areas/PRJ.md#post-apiprojects -->
- **AC-7**: Given member ids ["abc"] or access-group id 999 that does not exist, When U creates, Then 400 `INVALID_PARAMETER` and no project exists afterwards. <!-- source: areas/PRJ.md#bug -->
- **AC-8**: Given a parent id in the body, When U creates, Then 400 and no project is created. <!-- source: areas/PRJ.md#security -->
- **AC-9**: Given project type "partner", When U creates, Then 400 `INVALID_PARAMETER`. <!-- source: areas/PRJ.md#data-touched -->

## Out of scope
- Rate limits (REQ-PRJ-006), idempotency (REQ-PRJ-007), audit (REQ-PRJ-008), spike detection (REQ-PRJ-009).
- Sub-projects (REQ-PRJ-019). Projects created by the system for vendors (VND area).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: one project per request with at most the members and groups listed by the caller.

## Edge cases and errors
- Two concurrent creates of the same name by one owner: one 201, one 409; never a 500.
- A unique-name violation raised by the data store is answered as the 409 above.
- Member id of a deleted user: 400.
- Unknown body fields: 400 `INVALID_PARAMETER`.
- Server faults: 500 `Failed to create project` with no internal error text.

## Open questions
- Who reads project metadata and settings? Nothing in the old project code reads them (PRJ open question 6); should they be accepted at all?
- Is there a maximum number of member ids or group ids per create request?
- Should the description have a maximum length?
