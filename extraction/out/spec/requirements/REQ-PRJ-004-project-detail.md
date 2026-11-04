---
id: REQ-PRJ-004
title: Show a project's details, members and access groups
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-PRJ-001]
contracts: []
priority: must
---
# REQ-PRJ-004: Show a project's details, members and access groups

## Context
Project managers open a project to see its settings, its direct members and the access groups assigned to it. The old endpoint returned any project, with member e-mail addresses, to any logged-in user (PRJ SECURITY 2), returned one member row per role so the UI had to regroup them, and gave a 500 for a non-numeric id (BUG 17).

## Requirements
1. When a user with access to a top-level project requests its details, the system shall return the project fields listed in REQ-PRJ-003.
2. The system shall return the project's direct members, one entry per user, with user id, username, full name, e-mail and the list of the user's role names.
3. The system shall return the project's access groups with group id, name, description, type, who added the group and when.
4. If the caller has no access to the project, then the system shall respond 403 `PROJECT_ACCESS_DENIED`.
5. If the id is not a positive integer, then the system shall respond 400 `INVALID_ID`.
6. If no top-level project has the id, then the system shall respond 404 `Project not found`.
7. If the id belongs to a sub-project, then the system shall respond 404 `Project not found`; sub-project details are served by REQ-PRJ-022.

## Acceptance criteria
- **AC-1**: Given U is a member of project 7 and member M holds roles "Analyst" and "Data Steward", When U opens project 7, Then M appears once with roles ["Analyst", "Data Steward"]. <!-- source: areas/PRJ.md#get-apiprojectsprojectid -->
- **AC-2**: Given access group G is assigned to project 7, When U opens project 7, Then G appears with its name, description and type. <!-- source: areas/PRJ.md#get-apiprojectsprojectid -->
- **AC-3**: Given U is not a member of project 9 and holds no `all_projects:read`, When U opens project 9, Then the response is 403 and contains no member data. <!-- source: areas/PRJ.md#security -->
- **AC-4**: Given id "abc", When U opens it, Then the response is 400 `INVALID_ID`. <!-- source: areas/PRJ.md#bug -->
- **AC-5**: Given U is an Administrator and id 99999 does not exist, When U opens it, Then the response is 404 `Project not found`. <!-- source: areas/PRJ.md#get-apiprojectsprojectid -->
- **AC-6**: Given 71 is a sub-project, When U opens it as a project, Then the response is 404 `Project not found`. <!-- source: areas/PRJ.md#security -->

## Out of scope
- Members reached through groups are not listed individually here (REQ-PRJ-016 lists all users with access).

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: one project with its direct members and access groups.
- **Growth**: grows with members per project; unknown.
- **Largest tenant**: unknown.
- **Time window**: interactive request.
- **Memory ceiling**: unknown.
- **Scale tests**: a project with the largest known member count.

## Edge cases and errors
- Member with no roles: listed with an empty role list.
- Member whose user was deleted: not listed.
- Server errors return a generic message and code, never database error text.

## Open questions
- Should member e-mail addresses be shown to every project member, or only to users with management rights?
