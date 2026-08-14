/**
 * ensureFileUploadPermissions.js
 *
 * Idempotent migration that guarantees the permissions and role_permissions
 * rows required for file upload exist in production, regardless of whether
 * seedProduction.js was ever executed.
 *
 * Grants:
 *   Admin, Data Engineer, Creator → file_upload:write, file_upload:read
 *   Executor, Viewer, User, Analyst, Reviewer → file_upload:read only
 *
 * Safe to run multiple times — uses INSERT … ON CONFLICT DO NOTHING throughout.
 * role_permissions.created_at is NOT NULL with no default; every insert supplies NOW().
 */

const { getPool } = require('../config/database');

async function ensureFileUploadPermissions(pool) {
  const db = pool || getPool();

  // Only the permissions this migration is authorised to seed
  const UPLOAD_PERMISSIONS = [
    { name: 'file_upload:write', resource: 'file_upload', action: 'write', description: 'Upload files' },
    { name: 'file_upload:read',  resource: 'file_upload', action: 'read',  description: 'View uploaded files' },
  ];

  // Roles that get both write and read upload access
  const UPLOAD_WRITE_ROLES = ['Admin', 'Data Engineer', 'Creator'];
  // Roles that get read-only upload access
  const UPLOAD_READ_ROLES  = ['Executor', 'Viewer', 'User', 'Analyst', 'Reviewer'];

  let linkSuccesses = 0;
  let linkFailures  = 0;

  try {
    // 1. Ensure permissions table has resource/action/description columns
    try {
      await db.query(`
        ALTER TABLE permissions
          ADD COLUMN IF NOT EXISTS resource    VARCHAR(100),
          ADD COLUMN IF NOT EXISTS action      VARCHAR(100),
          ADD COLUMN IF NOT EXISTS description TEXT
      `);
    } catch (_) { /* columns already exist — safe to ignore */ }

    // 2. Upsert the two upload permissions into the permissions table.
    //    ON CONFLICT (name): update metadata in case it drifted.
    //    If a (resource, action) unique constraint fires, the row already exists
    //    under a different name — we log a warning and continue; findPermId will
    //    locate it by resource+action for the linking step below.
    for (const perm of UPLOAD_PERMISSIONS) {
      try {
        await db.query(`
          INSERT INTO permissions (name, resource, action, description, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (name) DO UPDATE
            SET resource    = EXCLUDED.resource,
                action      = EXCLUDED.action,
                description = EXCLUDED.description
        `, [perm.name, perm.resource, perm.action, perm.description]);
      } catch (insertErr) {
        if (insertErr.code === '23505') {
          // Duplicate (resource, action) under a different name — already exists; OK.
          console.warn(
            `[ensureFileUploadPermissions] Permission ${perm.name} (${perm.resource}:${perm.action})` +
            ' already exists under another name — skipping insert, will link by resource+action.'
          );
        } else {
          // Unexpected error — surface it so it is not invisible in logs.
          console.error(
            `[ensureFileUploadPermissions] Failed to upsert permission ${perm.name}:`, insertErr.message
          );
        }
      }
    }
    console.log('[ensureFileUploadPermissions] ✓ Permissions upsert step completed');

    // 3. Helper: find a permission's id by name, falling back to resource+action lookup.
    const findPermId = async (name, resource, action) => {
      let r = await db.query('SELECT id FROM permissions WHERE name = $1', [name]);
      if (r.rows.length > 0) return r.rows[0].id;
      r = await db.query(
        'SELECT id FROM permissions WHERE resource = $1 AND action = $2 LIMIT 1',
        [resource, action]
      );
      return r.rows.length > 0 ? r.rows[0].id : null;
    };

    // 4. Helper: link a role to a permission, surfacing unexpected failures.
    const linkRolePerm = async (roleId, roleName, permId, permName) => {
      try {
        const result = await db.query(`
          INSERT INTO role_permissions (role_id, permission_id, created_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT DO NOTHING
        `, [roleId, permId]);
        // rowCount 0 means the link already existed — that is fine.
        linkSuccesses++;
      } catch (linkErr) {
        linkFailures++;
        // Surface the error; do NOT silently swallow it.
        console.error(
          `[ensureFileUploadPermissions] Failed to link ${roleName} → ${permName}:`, linkErr.message
        );
      }
    };

    // 5. Look up permission IDs once
    const writePermId = await findPermId('file_upload:write', 'file_upload', 'write');
    const readPermId  = await findPermId('file_upload:read',  'file_upload', 'read');

    if (!writePermId) {
      console.error('[ensureFileUploadPermissions] Could not locate file_upload:write permission row — aborting link step');
      return;
    }
    if (!readPermId) {
      console.error('[ensureFileUploadPermissions] Could not locate file_upload:read permission row — aborting link step');
      return;
    }

    // 6. Grant write + read to upload-capable roles
    for (const roleName of UPLOAD_WRITE_ROLES) {
      const r = await db.query('SELECT id FROM roles WHERE name = $1', [roleName]);
      if (r.rows.length === 0) continue;
      const roleId = r.rows[0].id;
      await linkRolePerm(roleId, roleName, writePermId, 'file_upload:write');
      await linkRolePerm(roleId, roleName, readPermId,  'file_upload:read');
    }

    // 7. Grant read-only to read-only roles
    for (const roleName of UPLOAD_READ_ROLES) {
      const r = await db.query('SELECT id FROM roles WHERE name = $1', [roleName]);
      if (r.rows.length === 0) continue;
      const roleId = r.rows[0].id;
      await linkRolePerm(roleId, roleName, readPermId, 'file_upload:read');
    }

    if (linkFailures > 0) {
      console.error(
        `[ensureFileUploadPermissions] ⚠ ${linkFailures} role-permission link(s) failed (see errors above).` +
        ` ${linkSuccesses} succeeded.`
      );
    } else {
      console.log(
        `[ensureFileUploadPermissions] ✓ role_permissions links complete (${linkSuccesses} rows inserted or already present)`
      );
    }

  } catch (err) {
    // Top-level guard: log but do not crash the server startup sequence.
    console.error('[ensureFileUploadPermissions] Unexpected error (non-fatal):', err.message);
  }
}

module.exports = ensureFileUploadPermissions;
