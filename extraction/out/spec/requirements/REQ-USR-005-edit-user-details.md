---
id: REQ-USR-005
title: Administrator edits a user's details and classification
module: backend
status: draft
owner: "@OWNER"
depends_on: [REQ-USR-001, REQ-USR-004]
contracts: []
priority: must
---
# REQ-USR-005: Administrator edits a user's details and classification

## Context
Administrators correct users' contact details, change their user type and can force a password change. The old edit also let an administrator type a new password for the user. Under D10 and F07 that is replaced by an e-mail reset link (AUTH), so it is not part of this shard. The old edit also accepted a username change, although the form made username read-only. It did not check e-mail uniqueness itself and relied on a database error, and it could not clear a field to empty. Role changes are in REQ-USR-006.

## Requirements
1. When an administrator submits changes to a user, the system shall update only the fields present in the request and set the updated time.
2. The system shall allow these fields to be changed: e-mail, first name, middle name, last name, phone number, address line 1, address line 2, city, state, postal code, country, user type, and the forced password change flag.
3. If a field is present with an empty value, then the system shall clear that field, except e-mail, which shall not be empty.
4. The system shall apply the validation rules of REQ-USR-004 to e-mail, phone number, names and user type.
5. The system shall limit address lines to 255 characters, city, state and country to 100 characters, and postal code to 20 characters.
6. When the user type changes, the system shall set the internal user flag as in REQ-USR-004 (true for `FTE` and `Consultant`, false for `Vendor`).
7. If the new e-mail belongs to another user, compared without regard to case, then the system shall respond 409 and change nothing.
8. If the request contains username, password, auth provider or vendor organisation, then the system shall respond 400 naming the field and change nothing.
9. If any field fails validation, then the system shall respond 400 and change nothing.
10. If no user has the given id, then the system shall respond 404 `User not found`.
11. When the update succeeds, the system shall respond 200 with the user's details as in REQ-USR-003.

## Acceptance criteria
- **AC-1**: Given user 7 with city `Austin`, When an administrator sends only `{city: "Dallas"}`, Then the response is 200, the city is `Dallas` and every other field is unchanged. <!-- source: areas/USR.md#11-put-apiusersid-admin-edit-user -->
- **AC-2**: Given user 7 with middle name `Q`, When an administrator sends `{middle_name: ""}`, Then user 7 has no middle name. <!-- source: areas/USR.md#11-put-apiusersid-admin-edit-user -->
- **AC-3**: Given user 8 has e-mail `a@example.com`, When an administrator sets user 7's e-mail to `A@Example.com`, Then the response is 409 and user 7's e-mail is unchanged. <!-- source: areas/USR.md#11-put-apiusersid-admin-edit-user -->
- **AC-4**: Given user 7, When an administrator sends `{username: "newname"}`, Then the response is 400 naming username and the username is unchanged. <!-- source: areas/USR.md#26-fe-users---usermanagement-page -->
- **AC-5**: Given user 7, When an administrator sends `{password: "Str0ng!Passw0rd1"}`, Then the response is 400 and the password is unchanged. <!-- source: areas/USR.md#11-put-apiusersid-admin-edit-user -->
- **AC-6**: Given user 7 of type `FTE`, When an administrator sets type `Vendor`, Then the internal user flag becomes false. <!-- source: areas/USR.md#unclear -->
- **AC-7**: Given phone `12345abc` together with city `Dallas`, When submitted, Then the response is 400 and the city is unchanged. <!-- source: areas/USR.md#11-put-apiusersid-admin-edit-user -->
- **AC-8**: Given no user 9999, When an administrator edits user 9999, Then the response is 404. <!-- source: areas/USR.md#11-put-apiusersid-admin-edit-user -->
- **AC-9**: Given user 7, When an administrator sets the forced password change flag to true, Then user 7's details show the flag as true. <!-- source: areas/USR.md#11-put-apiusersid-admin-edit-user -->

## Out of scope
- Role assignment (REQ-USR-006).
- Setting or resetting a user's password. Administrators trigger an e-mail reset link instead (AUTH, F07).
- Linking a user to a vendor organisation (VND, F58).

## Non-functional requirements
None.

## Data volume and performance
Not data-bearing: single-record update.

## Edge cases and errors
- A request with no editable fields returns 400.
- Two administrators editing the same user at once: the last write wins field by field. No partial record is ever stored.
- Changing a vendor user's type away from `Vendor` changes how eligible replacements are chosen for that user (REQ-USR-012).

## Open questions
- Should setting the forced password change flag be refused for Okta users, who cannot change a password in the product (USR UNCLEAR-7)?
- Should changing the user type be refused while the user is a vendor contact or belongs to a vendor organisation?
