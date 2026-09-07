/**
 * Migration: Add Configurable N-Step Approval Chain to Vendor Agreements
 *
 * Adds:
 *   - approval_chain_config JSONB  — the configured step definitions
 *   - current_approval_step INTEGER — which step is currently active (1-based)
 *   - vendor_approval_step_decisions table — per-user votes per step
 *   - Expands the approval_status CHECK constraint to include 'pending_approval'
 *
 * Backward-compatible: all existing columns and legacy routes are untouched.
 */

const { systemLogger } = require('../utils/logger');

async function up(dbPool) {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    systemLogger.info('Starting approval chain migration...');

    // 1. Add chain-config and step-tracking columns to vendor_agreements
    await client.query(`
      ALTER TABLE vendor_agreements
        ADD COLUMN IF NOT EXISTS approval_chain_config JSONB DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS current_approval_step INTEGER DEFAULT NULL;
    `);
    systemLogger.info('✓ Added approval_chain_config and current_approval_step columns');

    // 2. Expand the approval_status CHECK constraint to include 'pending_approval'
    //    We must drop and recreate it because ALTER TABLE … ALTER CONSTRAINT is not supported for CHECKs.
    await client.query(`
      ALTER TABLE vendor_agreements
        DROP CONSTRAINT IF EXISTS vendor_agreements_approval_status_check;
    `);

    await client.query(`
      ALTER TABLE vendor_agreements
        ADD CONSTRAINT vendor_agreements_approval_status_check CHECK (
          approval_status IN (
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
          )
        );
    `);
    systemLogger.info('✓ Expanded approval_status constraint to include pending_approval');

    // 3. Create vendor_approval_step_decisions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_approval_step_decisions (
        id                 SERIAL PRIMARY KEY,
        agreement_id       INTEGER NOT NULL REFERENCES vendor_agreements(id) ON DELETE CASCADE,
        step_number        INTEGER NOT NULL,
        approver_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action             VARCHAR(20) NOT NULL CHECK (action IN ('approve', 'reject')),
        comments           TEXT,
        decided_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        agreement_version  INTEGER NOT NULL,

        -- Prevent a user from voting twice on the same step in the same version
        UNIQUE (agreement_id, step_number, approver_user_id, agreement_version)
      );
    `);
    systemLogger.info('✓ Created vendor_approval_step_decisions table');

    // 4. Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vasd_agreement_step
        ON vendor_approval_step_decisions (agreement_id, step_number);

      CREATE INDEX IF NOT EXISTS idx_vasd_approver
        ON vendor_approval_step_decisions (approver_user_id);

      CREATE INDEX IF NOT EXISTS idx_va_approval_chain_config
        ON vendor_agreements USING GIN (approval_chain_config)
        WHERE approval_chain_config IS NOT NULL;
    `);
    systemLogger.info('✓ Created indexes');

    await client.query('COMMIT');
    systemLogger.info('✅ Approval chain migration completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Approval chain migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down(dbPool) {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    systemLogger.info('Rolling back approval chain migration...');

    await client.query('DROP TABLE IF EXISTS vendor_approval_step_decisions CASCADE;');

    await client.query(`
      ALTER TABLE vendor_agreements
        DROP COLUMN IF EXISTS approval_chain_config,
        DROP COLUMN IF EXISTS current_approval_step;
    `);

    // Restore the constraint without 'pending_approval'
    await client.query(`
      ALTER TABLE vendor_agreements
        DROP CONSTRAINT IF EXISTS vendor_agreements_approval_status_check;
    `);
    await client.query(`
      ALTER TABLE vendor_agreements
        ADD CONSTRAINT vendor_agreements_approval_status_check CHECK (
          approval_status IN (
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
            'changes_pending'
          )
        );
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Approval chain migration rolled back successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Approval chain migration rollback failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };

if (require.main === module) {
  up()
    .then(() => { systemLogger.info('Migration completed'); process.exit(0); })
    .catch((error) => { systemLogger.error('Migration failed:', error); process.exit(1); });
}
