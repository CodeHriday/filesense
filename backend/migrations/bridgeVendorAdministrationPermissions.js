const db = require('../config/database');
const { systemLogger } = require('../utils/logger');

const RETIRED_PERMISSION_EQUIVALENTS = {
  vendor_users: 'users',
  vendor_roles: 'roles',
  vendor_connections: 'connection'
};

const ROLE_PERMISSION_ADDITIONS = {
  'Vendor Manager': [
    'connection:read',
    'connection:write',
    'users:read',
    'users:write',
    'sla_monitoring:read'
  ],
  'Governance Manager': [
    'connection:read',
    'sla_monitoring:read'
  ]
};

const permissionName = (permission) => (
  typeof permission === 'string' ? permission : permission?.name
);

const bridgeRetiredPermissions = (permissions) => {
  const additions = [];

  permissions.forEach((permission) => {
    const name = permissionName(permission);
    const [resource, action] = name?.split(':') || [];
    const replacement = RETIRED_PERMISSION_EQUIVALENTS[resource];

    if (replacement && action) {
      additions.push(`${replacement}:${action}`);
    }
  });

  return additions;
};

async function bridgeVendorAdministrationPermissions() {
  const result = await db.query('SELECT id, name, permissions FROM roles');
  let updatedRoles = 0;

  for (const role of result.rows) {
    const existingPermissions = Array.isArray(role.permissions) ? role.permissions : [];
    const existingNames = new Set(existingPermissions.map(permissionName).filter(Boolean));
    const additions = [
      ...bridgeRetiredPermissions(existingPermissions),
      ...(ROLE_PERMISSION_ADDITIONS[role.name] || [])
    ].filter((permission) => !existingNames.has(permission));

    if (additions.length === 0) {
      continue;
    }

    await db.query(
      'UPDATE roles SET permissions = $1 WHERE id = $2',
      [[...existingPermissions, ...additions], role.id]
    );
    updatedRoles += 1;
  }

  systemLogger.info('Vendor administration permissions bridged', { updatedRoles });
}

module.exports = { bridgeVendorAdministrationPermissions };