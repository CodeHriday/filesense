---
id: REQ-ING-004
title: Target project and sub-project of an upload must be named and accessible
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-ING-001]
contracts: []
priority: must
---
# REQ-ING-004: Target project and sub-project of an upload must be named and accessible

## Context
Every file belongs to a project, which is the tenancy boundary. Today an upload with no project silently goes to the user's alphabetically first project (possibly a sub-project), or to project 1 for administrators. Administrators can upload to inactive or nonexistent projects. The global rules say a client-supplied project id is used only for creates and must be membership-checked. Glossary: an inactive project blocks new work. Sub-project access is inherited from the parent project (F17 dropped).

## Requirements
1. The system shall require a target project on every upload request.
2. If no target project is supplied, then the system shall reject the upload with 400 and code `PROJECT_REQUIRED`.
3. If the caller is not a project member of the target project and is not an administrator, then the system shall reject the upload with 403 and the message "Project access denied".
4. If the target project does not exist, then the system shall reject the upload with 404 for administrators and 403 for everyone else.
5. If the target project is archived or inactive, then the system shall reject the upload with 409 and code `PROJECT_INACTIVE`.
6. Where a sub-project is supplied, the system shall require it to exist, otherwise reject with 404 and the message "Sub-project not found".
7. Where a sub-project is supplied, if its parent is not the target project, then the system shall reject with 400 and the message "Invalid sub-project".
8. Where a sub-project is supplied, if it is archived or inactive, then the system shall reject with 409 and code `PROJECT_INACTIVE`.
9. The system shall record both the project and, when supplied, the sub-project on every file accepted from the request.
10. The system shall complete the project checks before it inspects any file content or checks any agreement.
11. The read-only cross-project visibility permission shall not allow uploads to projects the caller is not a member of.

## Acceptance criteria
- **AC-1**: Given a member of project "Claims", When they upload with that project, Then the upload is accepted and the file records project "Claims". <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-2**: Given a member of "Claims" and "Billing", When they upload with no project, Then the response is 400 `PROJECT_REQUIRED` and no file goes to either project. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-3**: Given a user who is not a member of project 7, When they upload to project 7, Then the response is 403 "Project access denied". <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-4**: Given a user with access to project 7 only through an access group, When they upload to project 7, Then the upload is accepted. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-5**: Given an administrator, When they upload to project 9999 which does not exist, Then the response is 404 and no file record is created. <!-- source: areas/ING.md#unclear -->
- **AC-6**: Given an administrator and an inactive project 12, When they upload to project 12, Then the response is 409 `PROJECT_INACTIVE`. <!-- source: areas/ING.md#unclear -->
- **AC-7**: Given sub-project 31 whose parent is project 30, When a member uploads with project 30 and sub-project 31, Then the file records project 30 and sub-project 31. <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-8**: Given sub-project 31 whose parent is project 30, When a member uploads with project 40 and sub-project 31, Then the response is 400 "Invalid sub-project". <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-9**: Given sub-project id 999 that does not exist, When a member of project 30 uploads with it, Then the response is 404 "Sub-project not found". <!-- source: areas/ING.md#post-apifilesupload-serverjs2557-3439 -->
- **AC-10**: Given a user holding only the read-only cross-project visibility permission, When they upload to a project they are not a member of, Then the response is 403. <!-- source: areas/ING.md#shared-middleware-and-configuration -->
- **AC-11**: Given a non-member of project 7 who names agreement 5 of project 7, When they upload, Then the response is 403 and nothing about agreement 5 is revealed. <!-- source: areas/ING.md#security -->

## Out of scope
- Project membership resolution (project area).
- Drop requests, whose project comes from the agreement (REQ-ING-023).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: one project lookup and one membership lookup per request.

## Edge cases and errors
- A non-numeric project or sub-project id gives 400, not 500.
- A project archived between page load and upload is rejected with 409.
- Naming a sub-project as the target project: behaviour undecided, see Open questions.

## Open questions
- May a sub-project be named directly as the target project? Today the implicit default could resolve to a sub-project, and files were then stored against it.
- Does the onboarding wizard send a project? It calls the same upload; if it relied on the implicit default, it must now send one.
