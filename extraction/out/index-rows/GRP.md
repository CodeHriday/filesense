| REQ-GRP-001 | List access groups with type filter and search | backend | draft | - | [shard](requirements/REQ-GRP-001-list-access-groups.md) |
| REQ-GRP-002 | Provide users, roles and top-level projects for access group management | backend | draft | REQ-GRP-001 | [shard](requirements/REQ-GRP-002-group-management-reference-data.md) |
| REQ-GRP-003 | View one access group with its members and group roles | backend | draft | - | [shard](requirements/REQ-GRP-003-view-access-group-details.md) |
| REQ-GRP-004 | Create an access group with optional initial members and group roles | backend | draft | REQ-GRP-012 | [shard](requirements/REQ-GRP-004-create-access-group.md) |
| REQ-GRP-005 | Update an access group's details | backend | draft | - | [shard](requirements/REQ-GRP-005-update-access-group.md) |
| REQ-GRP-006 | Delete an access group and withdraw everything it granted | backend | draft | REQ-GRP-012 | [shard](requirements/REQ-GRP-006-delete-access-group.md) |
| REQ-GRP-007 | Add a user to an access group | backend | draft | REQ-GRP-012 | [shard](requirements/REQ-GRP-007-add-access-group-member.md) |
| REQ-GRP-008 | Remove a user from an access group | backend | draft | REQ-GRP-012 | [shard](requirements/REQ-GRP-008-remove-access-group-member.md) |
| REQ-GRP-009 | Assign a group role, globally or limited to one project | backend | draft | REQ-GRP-011, REQ-GRP-012 | [shard](requirements/REQ-GRP-009-assign-group-role.md) |
| REQ-GRP-010 | Remove a group role for a given scope | backend | draft | REQ-GRP-012 | [shard](requirements/REQ-GRP-010-remove-group-role.md) |
| REQ-GRP-011 | Apply group roles to members, with project-scoped roles only inside their project | cross-cutting | draft | - | [shard](requirements/REQ-GRP-011-apply-group-roles-with-project-scope.md) |
| REQ-GRP-012 | Access group changes take effect on the member's next request | cross-cutting | draft | REQ-GRP-011 | [shard](requirements/REQ-GRP-012-group-changes-take-effect-immediately.md) |
| REQ-GRP-013 | Access group management screen with list, search, create and delete | frontend | draft | REQ-GRP-001, REQ-GRP-002, REQ-GRP-004, REQ-GRP-006 | [shard](requirements/REQ-GRP-013-access-group-management-screen.md) |
| REQ-GRP-014 | Access group edit dialog for details, group roles and members | frontend | draft | REQ-GRP-003, REQ-GRP-005, REQ-GRP-007, REQ-GRP-008, REQ-GRP-009, REQ-GRP-010 | [shard](requirements/REQ-GRP-014-access-group-edit-dialog.md) |
