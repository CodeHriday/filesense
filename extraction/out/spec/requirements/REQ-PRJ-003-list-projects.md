---
id: REQ-PRJ-003
title: List the projects a user can access
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-PRJ-001, REQ-PRJ-022]
contracts: []
priority: must
---
# REQ-PRJ-003: List the projects a user can access

## Context
Users pick a project to work in from a list, and project managers maintain projects from the same list. The old system had two list endpoints that disagreed: one hid archived projects by default and omitted the group count, the other returned archived projects unless told otherwise, and the management page switched between them after every change (PRJ BUG 5, BUG 6, DUPLICATE 7). Sub-project file counts and sizes were hard-coded to zero (BUG 4). Triage F15/F16 ask for one list path.

## Requirements
1. When a user requests the project list, the system shall return the top-level projects the user can access under REQ-PRJ-001.
2. The system shall exclude archived projects unless the request asks for archived projects, in which case it shall return only archived projects.
3. Where a search text is given, the system shall return only projects whose name or description contains the text, ignoring case.
4. Where a project type is given, the system shall return only projects of that type.
5. The system shall order projects by creation time, newest first.
6. The system shall return each project with its id, name, description, project type, active flag, archived flag, default flag, owner, creation and update times, drop location (REQ-PRJ-023), direct member count, access-group count and sub-project count.
7. The system shall return each project's sub-projects that the user can access, in the item shape of REQ-PRJ-022, including real file counts and total sizes.
8. The system shall return active, archived and default flags as booleans.
9. The system shall page results and return the items, the total count and the page.
10. If a filter or paging value is invalid, then the system shall respond 400 with error code `INVALID_PARAMETER`.

## Acceptance criteria
- **AC-1**: Given project 7 is archived, When U lists projects without the archived filter, Then project 7 is not returned. <!-- source: areas/PRJ.md#get-apiprojectsinit-data -->
- **AC-2**: Given project 7 is archived and project 8 is not, When U lists projects with archived = true, Then only project 7 is returned. <!-- source: areas/PRJ.md#get-apiprojectsinit-data -->
- **AC-3**: Given projects "Finance" and "Ops" whose description contains "FINANCE feeds", When U searches "finance", Then both are returned. <!-- source: areas/PRJ.md#get-apiprojects -->
- **AC-4**: Given project type "external", When U filters by it, Then only external projects are returned; Given project type "partner", Then the response is 400 `INVALID_PARAMETER`. <!-- source: areas/PRJ.md#get-apiprojects -->
- **AC-5**: Given U has access to no project, When U lists projects, Then the response is 200 with no items and total 0. <!-- source: areas/PRJ.md#get-apiprojectsinit-data -->
- **AC-6**: Given project 7 has 2 direct members, 1 access group and 3 sub-projects, When U lists projects, Then project 7 shows member count 2, access-group count 1 and sub-project count 3. <!-- source: areas/PRJ.md#get-apiprojects -->
- **AC-7**: Given sub-project 71 holds 2 files of 100 and 250 bytes, When U lists projects, Then sub-project 71 shows file count 2 and total size 350. <!-- source: areas/PRJ.md#bug -->
- **AC-8**: Given 25 accessible projects and page size 10, When U requests page 3, Then 5 items are returned with total 25. <!-- source: areas/PRJ.md#fe-projects-srcpagesprojectsjsx-appjsx446-protectedroute -->
- **AC-9**: Given page size 101, When U lists projects, Then the response is 400 `INVALID_PARAMETER`. <!-- source: areas/PRJ.md#fe-projects-srcpagesprojectsjsx-appjsx446-protectedroute -->
- **AC-10**: Given project 7 is inactive and U is a member, When U lists projects, Then project 7 is returned with active = false. <!-- source: glossary.md#tenancy -->

## Out of scope
- Candidate users and groups for pickers (REQ-PRJ-017).
- The page layouts (REQ-PRJ-026, REQ-PRJ-027).

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: one page of at most 100 projects plus their accessible sub-projects.
- **Growth**: unknown.
- **Largest tenant**: unknown.
- **Time window**: interactive request.
- **Memory ceiling**: one page in memory.
- **Scale tests**: list for an Administrator over the largest project count; sub-project counts must not be one query per project.

## Edge cases and errors
- Empty search text: treated as no search.
- Search text with `%` or `_`: matched literally.
- Archived filter value other than true or false: 400.
- Page beyond the last: empty items with the correct total.
- Projects with no owner (Default Project, vendor-created projects): owner returned as empty.

## Open questions
- Default page size: the read-only list used 10 and the management page used 15. Which applies when the client sends none?
- Should member count include group-based members? Today it counts direct members only and the group count is shown separately.
- Expected number of projects and sub-projects in the largest deployment.
