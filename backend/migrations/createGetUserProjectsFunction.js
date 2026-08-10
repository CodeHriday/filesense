/**
 * Migration: Create get_user_projects PostgreSQL function
 *
 * Creates a set-returning function used by dashboard and other endpoints
 * to scope queries to projects accessible by a given user.
 * A user can access a project via:
 *   1. Direct membership in project_members
 *   2. Membership in an access group linked to the project via project_access_groups
 *
 * Uses CREATE OR REPLACE so it is safe to re-run.
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function createGetUserProjectsFunction(dbPool) {
  const client = await (dbPool || pool).connect();

  try {
    await client.query('BEGIN');
    systemLogger.info('Creating get_user_projects function...');

    // DROP first to allow parameter rename — CREATE OR REPLACE cannot rename params
    await client.query(`DROP FUNCTION IF EXISTS get_user_projects(INTEGER);`);

    await client.query(`
      CREATE FUNCTION get_user_projects(p_user_id INTEGER)
      RETURNS TABLE(project_id INTEGER)
      LANGUAGE sql
      STABLE
      AS $$
        -- Direct project membership
        SELECT pm.project_id
        FROM project_members pm
        WHERE pm.user_id = p_user_id

        UNION

        -- Access-group membership linked to a project
        SELECT pag.project_id
        FROM access_group_members agm
        JOIN project_access_groups pag ON agm.group_id = pag.group_id
        WHERE agm.user_id = p_user_id
      $$;
    `);

    systemLogger.info('✓ get_user_projects function created');
    await client.query('COMMIT');
    systemLogger.info('✅ createGetUserProjectsFunction migration completed');

  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ createGetUserProjectsFunction migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = createGetUserProjectsFunction;

if (require.main === module) {
  createGetUserProjectsFunction()
    .then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((error) => { console.error('Migration failed:', error); process.exit(1); });
}
