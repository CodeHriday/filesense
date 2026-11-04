---
id: REQ-USR-002
title: List users for administration with search and pagination
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-USR-001]
contracts: []
priority: must
---
# REQ-USR-002: List users for administration with search and pagination

## Context
Administrators need to find users and see each user's lockout state and roles. The old system had three overlapping user lists: a live one, a shadowed duplicate, and a combined "init-data" variant. The live list was open to every signed-in user, did not validate `page` or `limit`, and had no upper bound on page size. This shard is the one administration list. Lookups for other screens are separate and return fewer fields (REQ-USR-016 to REQ-USR-018).

## Requirements
1. When an administrator requests the user list, the system shall return one page of users ordered by creation time, newest first, then by user id descending.
2. The system shall return, for each user: id, username, e-mail, first name, middle name, last name, full name, auth provider, phone number, user type, internal user flag, created time, updated time, last login time, failed login attempts, lockout end time, forced password change flag, and the names of the user's directly assigned roles.
3. The system shall build the full name from first, middle and last name, joined by single spaces, leaving out empty parts.
4. Where a search term is given, the system shall return only users whose username, e-mail, first name or last name contains the term, ignoring case.
5. The system shall treat wildcard characters in the search term as literal characters.
6. The system shall return the list in the standard list envelope: items, total count, page, page size and total pages.
7. If no page is given, then the system shall use page 1. If no page size is given, then the system shall use page size 10.
8. If the page or page size is not a positive integer, or the page size is above the maximum page size, then the system shall respond 400 and name the invalid parameter.
9. The system shall never return password hashes, password history or Okta identifiers in the list.

## Acceptance criteria
- **AC-1**: Given 25 users, When an administrator requests page 2 with page size 10, Then the response is 200 with users 11 to 20 in newest-first order, total count 25, and total pages 3. <!-- source: areas/USR.md#1-get-apiusers-usermanagement-router-this-is-the-live-handler -->
- **AC-2**: Given users `jsmith` (last name `Doe`) and `adoe` (last name `Smith`), When an administrator searches for `SMI`, Then both users are returned. <!-- source: areas/USR.md#1-get-apiusers-usermanagement-router-this-is-the-live-handler -->
- **AC-3**: Given a user with first name `Ana`, no middle name, and last name `Lee`, When the list is returned, Then that user's full name is `Ana Lee` with a single space. <!-- source: areas/USR.md#1-get-apiusers-usermanagement-router-this-is-the-live-handler -->
- **AC-4**: Given a user with no roles, When the list is returned, Then that user's roles value is an empty list, not a list containing null. <!-- source: areas/USR.md#1-get-apiusers-usermanagement-router-this-is-the-live-handler -->
- **AC-5**: Given a user locked until 10 minutes from now after 5 failed attempts, When the list is returned, Then that user shows failed login attempts 5 and the lockout end time. <!-- source: areas/USR.md#12-post-apiusersidunlock -->
- **AC-6**: Given page size `-5`, When an administrator requests the list, Then the response is 400 naming the page size. <!-- source: areas/USR.md#bug -->
- **AC-7**: Given page `abc`, When an administrator requests the list, Then the response is 400 naming the page. <!-- source: areas/USR.md#bug -->
- **AC-8**: Given no page or page size, When an administrator requests the list, Then page 1 with at most 10 users is returned. <!-- source: areas/USR.md#1-get-apiusers-usermanagement-router-this-is-the-live-handler -->
- **AC-9**: Given a search term `50%`, When an administrator searches, Then only users whose searched fields contain the literal text `50%` are returned. <!-- source: areas/USR.md#1-get-apiusers-usermanagement-router-this-is-the-live-handler -->

## Out of scope
- User pickers for other screens (REQ-USR-016 to REQ-USR-018).
- The role list for the role picker (REQ-USR-019).
- The page that shows the list (REQ-USR-031).

## Non-functional requirements
None.

## Data volume and performance
- **Volume per run**: one page per request, at most the maximum page size (value open).
- **Growth**: unknown, see Open questions.
- **Largest tenant**: unknown; users are not split by project.
- **Time window**: interactive request.
- **Memory ceiling**: one page of users in memory.
- **Scale tests**: list and search over the production user count once it is known.

## Edge cases and errors
- A page beyond the last page returns 200 with no items and the correct total count.
- An empty or whitespace-only search term is treated as no search.
- Users with equal creation times keep a stable order through the id tie-break.
- Creation times are returned in UTC (D11).

## Open questions
- What is the maximum page size? The old list had no upper bound, and one old caller asked for 1000.
- How many users does production hold, and how fast is the number growing?
- Should the list also show group-inherited roles, or only direct roles as before?
