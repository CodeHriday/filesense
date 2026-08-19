const { systemLogger } = require('../utils/logger');

const BOOTSTRAP_ADMIN_ROLES = ['Admin', 'Vendor Manager', 'Governance Manager'];

async function assignBootstrapAdminRoles(client) {
  const result = await client.query(
    `
      INSERT INTO user_roles (user_id, role_id, created_at)
      SELECT bootstrap_admin.id, roles.id, NOW()
      FROM users bootstrap_admin
      CROSS JOIN roles
      WHERE bootstrap_admin.username = 'admin'
        AND roles.name = ANY($1::text[])
        AND NOT EXISTS (
          SELECT 1
          FROM user_roles existing_roles
          WHERE existing_roles.user_id = bootstrap_admin.id
        )
      ON CONFLICT (user_id, role_id) DO NOTHING
    `,
    [BOOTSTRAP_ADMIN_ROLES]
  );

  return result.rowCount;
}

async function getPrerequisiteStatus(dbPool) {
  const result = await dbPool.query(`
    SELECT
      to_regprocedure('public.get_user_projects(integer)') IS NOT NULL AS project_access_function_exists,
      EXISTS (
        SELECT 1
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE u.username = 'admin'
          AND r.name = 'Admin'
      ) AS bootstrap_admin_has_admin_role,
      EXISTS (
        SELECT 1
        FROM users
        WHERE username = 'admin'
      ) AS bootstrap_admin_exists
  `);

  const status = result.rows[0];
  return {
    ...status,
    ready: status.project_access_function_exists
      && (!status.bootstrap_admin_exists || status.bootstrap_admin_has_admin_role)
  };
}

async function repairBootstrapAdminRoles(dbPool) {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const bootstrapRoleAssignments = await assignBootstrapAdminRoles(client);
    await client.query('COMMIT');

    systemLogger.info('Bootstrap administrator role links repaired', {
      bootstrapRoleAssignments
    });
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Bootstrap administrator role repair failed', {
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  repairBootstrapAdminRoles,
  getPrerequisiteStatus
};