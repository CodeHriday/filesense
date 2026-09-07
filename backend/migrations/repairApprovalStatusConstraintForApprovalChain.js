/**
 * Repair: Keep the vendor agreement status constraint compatible with
 * configurable approval chains.
 *
 * Some environments received the approval-chain tables and columns without
 * the corresponding CHECK constraint update. This migration is intentionally
 * separate from the original approval-chain migration so it also repairs
 * partially upgraded environments.
 */

const { systemLogger } = require('../utils/logger');

const APPROVAL_STATUSES = [
  'draft',
  'pending_vendor_acceptance',
  'vendor_accepted',
  'vendor_rejected',
  'pending_manager_approval',
  'manager_approved',
  'manager_rejected',
  'pending_governance_approval',
  'governance_approved',
  'governance_rejected',
  'fully_approved',
  'rejected',
  'changes_pending',
  'pending_approval'
];

const STATUS_LIST_SQL = APPROVAL_STATUSES.map(status => `'${status}'`).join(',\n            ');

async function up(dbPool) {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    systemLogger.info('Starting approval status constraint repair...');

    // Do not replace the constraint if existing rows contain a status that the
    // canonical workflow does not understand. Failing here preserves the
    // transaction and makes the data issue explicit instead of masking it.
    const invalidStatuses = await client.query(
      `SELECT DISTINCT approval_status
       FROM vendor_agreements
       WHERE approval_status IS NOT NULL
         AND NOT (approval_status = ANY($1::text[]))
       ORDER BY approval_status`,
      [APPROVAL_STATUSES]
    );

    if (invalidStatuses.rows.length > 0) {
      const values = invalidStatuses.rows.map(row => row.approval_status).join(', ');
      throw new Error(`Unsupported vendor agreement approval statuses found: ${values}`);
    }

    // CHECK constraints cannot be altered in place. Recreate the named
    // constraint with the complete legacy + configurable-chain status set.
    await client.query(`
      ALTER TABLE vendor_agreements
        DROP CONSTRAINT IF EXISTS vendor_agreements_approval_status_check;
    `);

    await client.query(`
      ALTER TABLE vendor_agreements
        ADD CONSTRAINT vendor_agreements_approval_status_check CHECK (
          approval_status IN (
            ${STATUS_LIST_SQL}
          )
        );
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Approval status constraint repaired for approval chains');
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Approval status constraint repair failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up };