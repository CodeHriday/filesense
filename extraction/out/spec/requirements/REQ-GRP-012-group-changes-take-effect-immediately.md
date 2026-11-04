---
id: REQ-GRP-012
title: Access group changes take effect on the member's next request
module: cross-cutting
status: draft
owner: "@OWNER"
depends_on: [REQ-GRP-011]
contracts: []
priority: must
---
# REQ-GRP-012: Access group changes take effect on the member's next request

## Context
Access group changes grant or withdraw rights, so users must not keep a withdrawn right, or miss a newly granted one, after the change is saved. Today a user's roles are recomputed on every request, but their permissions come from a cache that lives for 600 seconds. Creating a group with members and deleting a group do not clear that cache at all. For up to 10 minutes, roles and permissions can disagree, and a removed member keeps the group's permissions.

## Requirements
1. When a membership is added or removed, the system shall apply the change to that user's effective roles and permissions from the user's next request after the change is committed.
2. When a group role is assigned or removed, the system shall apply the change to every current member's effective roles and permissions from each member's next request after the change is committed.
3. When an access group is created with members or group roles, the system shall apply the group's roles to those members from their next request after the creation is committed.
4. When an access group is deleted, the system shall withdraw the group's roles and project access from every former member from their next request after the deletion is committed.
5. If the system caches effective roles or permissions, then it shall invalidate the affected users' entries as part of every change listed above, across all server instances.
6. If cache invalidation fails, then the system shall not serve the stale cached entry for those users.

## Acceptance criteria
- **AC-1**: Given user 5's permissions were just read on a request, When an administrator removes user 5 from "Ops" and user 5 makes another request 1 second later, Then that request is evaluated without "Ops"'s roles or permissions. <!-- source: areas/GRP.md#bug -->
- **AC-2**: Given "Ops" has 3 members, When an administrator assigns global "Viewer" to "Ops", Then each member's next request is evaluated with "Viewer". <!-- source: areas/GRP.md#post-apigroupsgroupidroles-grouproutesjs469 -->
- **AC-3**: Given user 5 has a cached permission list, When an administrator creates group "New" with member 5 and global role "Viewer", Then user 5's next request is evaluated with "Viewer". <!-- source: areas/GRP.md#bug -->
- **AC-4**: Given user 5 has role "Analyst" only through "Ops" and a cached permission list, When an administrator deletes "Ops", Then user 5's next request is evaluated without "Analyst". <!-- source: areas/GRP.md#bug -->
- **AC-5**: Given two server instances and user 5's permissions cached on both, When an administrator removes user 5 from "Ops" through instance A, Then user 5's next request through instance B is evaluated without "Ops"'s roles. <!-- source: cross-cutting.md#3-cross-cutting-defects-non-security -->
- **AC-6**: Given the permission cache cannot be reached during a membership removal, When user 5 makes the next request, Then the request is evaluated from current data or denied, never from the stale entry. <!-- source: cross-cutting.md#5-rules-that-apply-everywhere-for-the-rebuild -->
- **AC-7**: Given any request, When it is evaluated, Then its roles and its permissions come from the same point in time. <!-- source: areas/GRP.md#bug -->

## Out of scope
- Ending sessions or revoking tokens because of a group change. The token stays valid; only its rights change.
- Changes to direct roles and to role definitions. User and role administration own those, and they must follow the same rule.

## Non-functional requirements
- Propagation delay: 0 requests. The first request that starts after the change commits sees it. Measure with an integration test that commits a change and immediately issues a request as the affected user on each instance.

## Data volume and performance
- **Volume per run**: the cache entries of every member of the changed group.
- **Growth**: grows with group size.
- **Largest tenant**: unknown (see REQ-GRP-003 Open questions on the largest group).
- **Time window**: within the transaction that commits the group change, or before it returns.
- **Memory ceiling**: no more than the member id list of one group.
- **Scale tests**: assign a role to the largest known group and check that every member's next request reflects it.

## Edge cases and errors
- A change that affects no one (for example a new group with no members) invalidates nothing.
- A change that is rolled back must not leave the new rights visible.
- Concurrent changes to the same group each invalidate their affected users; the final state matches the last committed change.

## Open questions
None.
