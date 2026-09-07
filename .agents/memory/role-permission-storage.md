---
name: Role permission storage
description: How role permission lists must be persisted in this database.
---

Role permissions are stored in PostgreSQL as a `text[]` column. Although the Node PostgreSQL client exposes the value as a JavaScript array, write operations must receive a JavaScript array rather than a JSON-serialized string.

**Why:** JSON text passed to the column produces PostgreSQL array parsing errors during role-permission migrations.

**How to apply:** When adding or migrating role permissions, preserve the existing array values and bind the updated string array directly in the parameterized `UPDATE`.