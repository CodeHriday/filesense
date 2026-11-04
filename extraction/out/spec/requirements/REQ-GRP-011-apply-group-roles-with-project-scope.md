---
id: REQ-GRP-011
title: Apply group roles to members, with project-scoped roles only inside their project
module: cross-cutting
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-GRP-011: Apply group roles to members, with project-scoped roles only inside their project

## Context
A user's effective roles are their direct roles plus the group roles of every access group they belong to. Administrators can limit a group role to one project. Today every check that resolves group roles ignores that limit, so a role meant for one project acts as a global role everywhere. Part of the old code also read membership from a second store that nothing wrote. Decision D3 says project-scoped group roles apply only inside their project and its sub-projects. Decision D4 says membership comes from one store only.

## Requirements
1. The system shall resolve a user's access group memberships only from the single membership store.
2. The system shall include every global group role of every access group the user belongs to in the user's effective roles for every request.
3. While a request acts on a resource that belongs to a project, the system shall include a project-scoped group role only if the role's project is that project or an ancestor of it.
4. While a request acts on no project, or on a project outside a role's scope, the system shall not include that project-scoped group role.
5. The system shall derive the project of a request from the resource it acts on, never from a project id supplied by the client, except for creates, where the supplied project must itself pass the membership check.
6. The system shall derive a user's permissions from the same effective roles used for the request, so that roles and permissions never disagree.
7. The system shall not treat a project-scoped group role as making the user an Administrator for any action outside that project.
8. Where a user holds the same role directly or globally through a group, the system shall apply that role everywhere, regardless of any project-scoped copy.

## Acceptance criteria
- **AC-1**: Given user 5 is a member of "Ops", which has global role "Viewer", When user 5 makes a request in any project or in none, Then "Viewer" is among user 5's effective roles. <!-- source: areas/GRP.md#domain-terms -->
- **AC-2**: Given "Ops" has "Analyst" scoped to top-level project "Claims" and user 5 is a member, When user 5 acts on a file in "Claims", Then "Analyst" applies. <!-- source: cross-cutting.md#7-resolved-decisions -->
- **AC-3**: Given the same setup, When user 5 acts on a file in "Claims-EU", a sub-project of "Claims", Then "Analyst" applies. <!-- source: cross-cutting.md#7-resolved-decisions -->
- **AC-4**: Given the same setup, When user 5 acts on a file in project "Billing", Then "Analyst" does not apply, and an action allowed only by "Analyst" is denied with 403. <!-- source: areas/GRP.md#bug -->
- **AC-5**: Given the same setup, When user 5 acts on a file in "Billing" and sends "Claims" as the project id in the query or body, Then "Analyst" still does not apply and the action is denied. <!-- source: cross-cutting.md#critical -->
- **AC-6**: Given the same setup, When user 5 makes a request that acts on no project (for example the user directory), Then "Analyst" does not apply. <!-- source: cross-cutting.md#7-resolved-decisions -->
- **AC-7**: Given "Ops" has role "Admin" scoped to "Claims" and user 5 has no other Admin role, When user 5 calls an Administrator-only action that acts on no project, Then the response is 403. <!-- source: cross-cutting.md#7-resolved-decisions -->
- **AC-8**: Given user 5 has "Analyst" directly and "Ops" has "Analyst" scoped to "Claims", When user 5 acts in "Billing", Then "Analyst" applies through the direct role. <!-- source: areas/GRP.md#domain-terms -->
- **AC-9**: Given a membership exists only in a store other than the single membership store, When the user makes a request, Then that group's roles do not apply. <!-- source: cross-cutting.md#7-resolved-decisions -->
- **AC-10**: Given user 5 has effective roles in a request, When the request's permission check runs, Then it uses exactly the permissions of those roles, with no role present without its permissions or permissions present without their role. <!-- source: areas/GRP.md#bug -->

## Out of scope
- Project membership itself (direct or through a group's project access). The project area owns which users may enter a project.
- The Administrator predicate and the permission format. These come from the shared authorisation rules (D3).
- The IAM-style policy engine, which is dropped (see dropped/GRP.md).

## Non-functional requirements
- The effective-role resolution adds no more than one database round trip per request, or uses a cache that REQ-GRP-012 keeps current. Measure in a load test at the expected request rate (see Open questions).

## Data volume and performance
- **Volume per run**: per request, the user's memberships and their group roles.
- **Growth**: grows with the number of groups per user and roles per group.
- **Largest tenant**: unknown; neither the maximum number of groups per user nor of group roles per group is known (see Open questions).
- **Time window**: on every authenticated request.
- **Memory ceiling**: per request, proportional to the user's group roles.
- **Scale tests**: a user in the largest known number of groups, each with several scoped roles, under the expected request rate.

## Edge cases and errors
- A user in no group has only direct roles.
- A group role scoped to a project that no longer exists applies nowhere.
- A resource whose project cannot be determined is treated as acting on no project, so project-scoped roles do not apply (fail closed).
- If role resolution fails, the request is denied (fail closed), not allowed.

## Open questions
- Does a project-scoped group role also give its members access to the project, or must the group also have project access (or the user be a direct project member)? D3 limits where the role applies, but does not say whether it grants entry.
- Inside its project, does a project-scoped Admin group role count as Administrator for project-level actions, or should project-scoped Admin be refused at assignment?
- What effective roles and permissions should the UI receive for navigation: global only, or per project?
- What request rate and per-request latency budget should the role-resolution test use?
