---
id: REQ-GRP-001
title: List access groups with type filter and search
module: backend
status: draft
owner: "@OWNER"
depends_on: []
contracts: []
priority: must
---
# REQ-GRP-001: List access groups with type filter and search

## Context
Administrators manage access groups from one list, so they need to find a group by name or description and narrow the list by group type. Each entry shows its member count. Today any authenticated user can read the list, and it comes back as an unbounded bare array. The rebuild limits the list to administrators (decision F12, D3), bounds it, and uses the common list envelope.

## Requirements
1. When an administrator requests the access group list, the system shall return the access groups ordered by creation time, newest first.
2. The system shall include, for each access group, its id, name, description, group type, external id, IdP sync flag, creation and update times, and member count.
3. The system shall count a group's members from the single membership store, with 0 for a group that has no members.
4. Where a group type filter is supplied, the system shall return only access groups whose group type equals the filter exactly.
5. Where a search term is supplied, the system shall return only access groups whose name or description contains the term, ignoring case.
6. The system shall treat the search term as literal text, so that pattern characters such as `%` and `_` match only themselves.
7. The system shall return the list in the common list envelope (items, total, page), with a bounded page size.
8. If the caller is not authenticated, then the system shall reject the request with 401.
9. If the caller is not an Administrator, then the system shall reject the request with 403.
10. If the group type filter is not one of the allowed group types, then the system shall reject the request with 400.

## Acceptance criteria
- **AC-1**: Given groups "Finance" (created 2026-01-02) and "Ops" (created 2026-01-03), When an administrator lists access groups with no filters, Then "Ops" is listed before "Finance". <!-- source: areas/GRP.md#get-apigroups-grouproutesjs54 -->
- **AC-2**: Given group "Ops" with 3 members and group "Empty" with none, When an administrator lists access groups, Then "Ops" shows member count 3 and "Empty" shows member count 0. <!-- source: areas/GRP.md#get-apigroups-grouproutesjs54 -->
- **AC-3**: Given groups of type MANUAL and DYNAMIC, When an administrator lists with group type MANUAL, Then only the MANUAL groups are returned. <!-- source: areas/GRP.md#get-apigroups-grouproutesjs54 -->
- **AC-4**: Given a group named "Finance Analysts" and a group with description "finance reviewers", When an administrator searches "FINANCE", Then both groups are returned. <!-- source: areas/GRP.md#get-apigroups-grouproutesjs54 -->
- **AC-5**: Given a group named "100% Ops" and a group named "1000 Ops", When an administrator searches "0%", Then only "100% Ops" is returned. <!-- source: cross-cutting.md#5-rules-that-apply-everywhere-for-the-rebuild -->
- **AC-6**: Given a request with no access token, When the access group list is requested, Then the response is 401 and no groups are returned. <!-- source: areas/GRP.md#entry-points -->
- **AC-7**: Given an authenticated user without the Admin role, When the access group list is requested, Then the response is 403. <!-- source: areas/GRP.md#security -->
- **AC-8**: Given an administrator, When the list is requested with group type "IDP_SYNCED", Then the response is 400. <!-- source: areas/GRP.md#post-apigroups-grouproutesjs223 -->
- **AC-9**: Given an administrator, When the list is requested, Then the response body has the fields items, total and page, and is not a bare array. <!-- source: cross-cutting.md#5-rules-that-apply-everywhere-for-the-rebuild -->

## Out of scope
- The access group picker used when granting project access to a group. The project area provides it.
- IdP synchronisation of groups. Only the stored flag is listed.

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: one page of access groups per request.
- **Growth**: grows with groups created by administrators; the rate is unknown (see Open questions).
- **Largest tenant**: unknown (see Open questions).
- **Time window**: interactive request.
- **Memory ceiling**: bounded by the maximum page size.
- **Scale tests**: list with the maximum page size against the largest known group count.

## Edge cases and errors
- An empty search term is treated as no search.
- A search with no matches returns an empty items list with total 0, not 404.
- A page number past the last page returns an empty items list.
- A non-numeric or negative page or page size gives 400.
- Database failure gives 500 with a safe message, never the library error text.

## Open questions
- What default and maximum page size should the list use? The old list was unpaginated.
- How many access groups and members does the largest production tenant have?
