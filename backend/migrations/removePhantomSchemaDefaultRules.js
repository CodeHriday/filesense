/**
 * Migration: removePhantomSchemaDefaultRules (registered as V2 in server.js)
 *
 * Removes synthetic quality rule rows whose rule_name starts with the literal
 * prefix '__schema_default__'. These rows were created by old profiling runs
 * before the enforcer was updated to reuse existing enabled rules. They have
 * no executor backing and can never be run by the user.
 *
 * Deletion order (inside a single transaction):
 *  1. Collect the IDs of all phantom rows in quality_rules.
 *  2. Delete quality_rule_violations referencing those IDs.
 *     (FK is ON DELETE CASCADE in current schema; explicit delete ensures
 *      correctness on older deployments where the FK was NO ACTION.)
 *  3. Delete quality_rule_configurations referencing those IDs.
 *     (Same reasoning as violations.)
 *  4. Delete file_quality_rules associations (FK cascades, but explicit for clarity).
 *  5. Delete transformation_quality_rules associations (FK cascades, explicit for clarity).
 *  6. Delete the phantom quality_rules rows themselves.
 *
 * NOTE: uses starts_with() for a safe literal-prefix match.
 *       LIKE '__schema_default__%' is intentionally avoided — every '_' in a
 *       SQL LIKE pattern is a single-character wildcard.
 */

const { systemLogger } = require('../utils/logger');

/**
 * @param {import('pg').Pool} pool
 */
async function removePhantomSchemaDefaultRules(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Find all phantom rule IDs using a safe literal-prefix predicate
    const findResult = await client.query(`
      SELECT id, rule_name
      FROM quality_rules
      WHERE starts_with(rule_name, '__schema_default__')
    `);

    const phantomCount = findResult.rowCount;

    if (phantomCount === 0) {
      systemLogger.info('[removePhantomSchemaDefaultRules] No phantom __schema_default__ rules found — nothing to clean up.');
      await client.query('COMMIT');
      return { removedRules: 0, removedAssociations: 0, removedViolations: 0, removedConfigurations: 0 };
    }

    const phantomIds = findResult.rows.map(r => r.id);
    systemLogger.info(`[removePhantomSchemaDefaultRules] Found ${phantomCount} phantom rules to remove.`, {
      ids: phantomIds
    });

    // 2. Remove quality_rule_violations referencing phantom rules
    //    (FK is CASCADE in current schema; explicit for older NO ACTION deployments)
    const violationsResult = await client.query(`
      DELETE FROM quality_rule_violations
      WHERE rule_id = ANY($1::int[])
    `, [phantomIds]);

    systemLogger.info(`[removePhantomSchemaDefaultRules] Removed ${violationsResult.rowCount} quality_rule_violations.`);

    // 3. Remove quality_rule_configurations referencing phantom rules
    //    (FK is CASCADE in current schema; explicit for older NO ACTION deployments)
    const configurationsResult = await client.query(`
      DELETE FROM quality_rule_configurations
      WHERE rule_id = ANY($1::int[])
    `, [phantomIds]);

    systemLogger.info(`[removePhantomSchemaDefaultRules] Removed ${configurationsResult.rowCount} quality_rule_configurations.`);

    // 4. Remove file_quality_rules associations
    const fqrResult = await client.query(`
      DELETE FROM file_quality_rules
      WHERE quality_rule_id = ANY($1::int[])
    `, [phantomIds]);

    systemLogger.info(`[removePhantomSchemaDefaultRules] Removed ${fqrResult.rowCount} file_quality_rules associations.`);

    // 5. Remove transformation_quality_rules associations
    const tqrResult = await client.query(`
      DELETE FROM transformation_quality_rules
      WHERE quality_rule_id = ANY($1::int[])
    `, [phantomIds]);

    systemLogger.info(`[removePhantomSchemaDefaultRules] Removed ${tqrResult.rowCount} transformation_quality_rules associations.`);

    // 6. Remove the phantom quality_rules rows
    const qrResult = await client.query(`
      DELETE FROM quality_rules
      WHERE id = ANY($1::int[])
    `, [phantomIds]);

    systemLogger.info(`[removePhantomSchemaDefaultRules] Removed ${qrResult.rowCount} phantom quality_rules rows.`);

    await client.query('COMMIT');

    return {
      removedRules: qrResult.rowCount,
      removedAssociations: fqrResult.rowCount + tqrResult.rowCount,
      removedViolations: violationsResult.rowCount,
      removedConfigurations: configurationsResult.rowCount
    };
  } catch (err) {
    await client.query('ROLLBACK');
    systemLogger.error('[removePhantomSchemaDefaultRules] Migration failed — rolled back.', { error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

module.exports = removePhantomSchemaDefaultRules;
