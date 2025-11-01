/**
 * Governance Workflow Migration
 * Adds three-stage approval workflow with Governance Manager role,
 * document attachments, and notifications system
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting governance workflow migration...');

    // 1. Add Governance Manager role if it doesn't exist
    await client.query(`
      INSERT INTO roles (name, description)
      VALUES ('Governance Manager', 'Responsible for final approval of vendor contracts')
      ON CONFLICT (name) DO NOTHING;
    `);
    systemLogger.info('✓ Governance Manager role created');

    // 2. Add governance_manager_user_id to vendor_agreements
    await client.query(`
      ALTER TABLE vendor_agreements
      ADD COLUMN IF NOT EXISTS governance_manager_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS governance_approved_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS governance_approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
    `);
    systemLogger.info('✓ Added governance manager fields to vendor_agreements');

    // 3. Drop old approval_status CHECK constraint first
    await client.query(`
      ALTER TABLE vendor_agreements
      DROP CONSTRAINT IF EXISTS vendor_agreements_approval_status_check;
    `);
    systemLogger.info('✓ Dropped old approval_status constraint');
    
    // 4. Map existing approval statuses to new three-stage workflow statuses
    await client.query(`
      UPDATE vendor_agreements
      SET approval_status = 'vendor_accepted'
      WHERE approval_status = 'vendor_approved';
    `);
    
    await client.query(`
      UPDATE vendor_agreements
      SET approval_status = 'pending_vendor_acceptance'
      WHERE approval_status = 'pending_approval';
    `);
    
    await client.query(`
      UPDATE vendor_agreements
      SET approval_status = 'manager_approved'
      WHERE approval_status = 'owner_approved';
    `);
    systemLogger.info('✓ Migrated existing approval statuses to new workflow');
    
    // 5. Add new approval_status CHECK constraint with three-stage statuses
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
    systemLogger.info('✓ Added new approval_status constraint for three-stage workflow');

    // 6. Drop old approver_type CHECK constraint
    await client.query(`
      ALTER TABLE vendor_agreement_approvals
      DROP CONSTRAINT IF EXISTS vendor_agreement_approvals_approver_type_check;
    `);
    systemLogger.info('✓ Dropped old approver_type constraint');
    
    // 7. Map existing approver types to new three-stage workflow
    await client.query(`
      UPDATE vendor_agreement_approvals
      SET approver_type = 'manager'
      WHERE approver_type = 'owner';
    `);
    systemLogger.info('✓ Migrated existing approver types to new workflow');
    
    // 8. Add new approver_type CHECK constraint
    await client.query(`
      ALTER TABLE vendor_agreement_approvals
      ADD CONSTRAINT vendor_agreement_approvals_approver_type_check CHECK (
        approver_type IN ('vendor', 'manager', 'governance_manager')
      );
    `);
    
    // Add approval_stage field to track which stage of approval
    await client.query(`
      ALTER TABLE vendor_agreement_approvals
      ADD COLUMN IF NOT EXISTS approval_stage VARCHAR(50);
    `);
    systemLogger.info('✓ Updated vendor_agreement_approvals for three-stage workflow');

    // 9. Create vendor_agreement_documents table for attachments
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_agreement_documents (
        id SERIAL PRIMARY KEY,
        agreement_id INTEGER NOT NULL REFERENCES vendor_agreements(id) ON DELETE CASCADE,
        approval_id INTEGER REFERENCES vendor_agreement_approvals(id) ON DELETE SET NULL,
        
        -- Document details
        document_name VARCHAR(500) NOT NULL,
        document_type VARCHAR(100), -- e.g., 'supporting_evidence', 'rejection_rationale'
        file_path VARCHAR(1000) NOT NULL,
        file_size INTEGER,
        mime_type VARCHAR(100),
        
        -- Metadata
        uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        description TEXT,
        
        -- Approval stage this document relates to
        approval_stage VARCHAR(50) -- 'vendor_acceptance', 'manager_approval', 'governance_approval'
      );
    `);
    systemLogger.info('✓ vendor_agreement_documents table created');

    // 10. Create notifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        
        -- Notification details
        notification_type VARCHAR(100) NOT NULL, -- e.g., 'vendor_contract_pending', 'contract_rejected'
        title VARCHAR(500) NOT NULL,
        message TEXT NOT NULL,
        
        -- Related entity
        entity_type VARCHAR(100), -- e.g., 'vendor_agreement'
        entity_id INTEGER, -- e.g., agreement_id
        
        -- Navigation
        action_url VARCHAR(1000), -- URL to navigate when notification is clicked
        
        -- Status
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP,
        
        -- Metadata
        metadata JSONB, -- Additional context data
        
        -- Audit
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP -- Optional expiration for time-sensitive notifications
      );
    `);
    systemLogger.info('✓ notifications table created');

    // 11. Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_agreements_governance_manager 
        ON vendor_agreements(governance_manager_user_id);
      
      CREATE INDEX IF NOT EXISTS idx_vendor_agreement_documents_agreement 
        ON vendor_agreement_documents(agreement_id);
      
      CREATE INDEX IF NOT EXISTS idx_vendor_agreement_documents_approval 
        ON vendor_agreement_documents(approval_id);
      
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id 
        ON notifications(user_id);
      
      CREATE INDEX IF NOT EXISTS idx_notifications_is_read 
        ON notifications(user_id, is_read);
      
      CREATE INDEX IF NOT EXISTS idx_notifications_entity 
        ON notifications(entity_type, entity_id);
    `);
    systemLogger.info('✓ Performance indexes created');

    await client.query('COMMIT');
    systemLogger.info('✅ Governance workflow migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Governance workflow migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Rolling back governance workflow migration...');

    // Drop tables in reverse order
    await client.query('DROP TABLE IF EXISTS notifications CASCADE;');
    await client.query('DROP TABLE IF EXISTS vendor_agreement_documents CASCADE;');
    
    // Remove columns from vendor_agreements
    await client.query(`
      ALTER TABLE vendor_agreements
      DROP COLUMN IF EXISTS governance_manager_user_id,
      DROP COLUMN IF EXISTS governance_approved_at,
      DROP COLUMN IF EXISTS governance_approved_by;
    `);
    
    // Restore original approval_status constraint
    await client.query(`
      ALTER TABLE vendor_agreements
      DROP CONSTRAINT IF EXISTS vendor_agreements_approval_status_check;
    `);
    
    await client.query(`
      ALTER TABLE vendor_agreements
      ADD CONSTRAINT vendor_agreements_approval_status_check CHECK (
        approval_status IN ('draft', 'pending_approval', 'vendor_approved', 'owner_approved', 'fully_approved', 'rejected', 'changes_pending')
      );
    `);
    
    // Restore original approver_type constraint
    await client.query(`
      ALTER TABLE vendor_agreement_approvals
      DROP CONSTRAINT IF EXISTS vendor_agreement_approvals_approver_type_check,
      DROP COLUMN IF EXISTS approval_stage;
    `);
    
    await client.query(`
      ALTER TABLE vendor_agreement_approvals
      ADD CONSTRAINT vendor_agreement_approvals_approver_type_check CHECK (
        approver_type IN ('vendor', 'owner')
      );
    `);
    
    // Remove Governance Manager role
    await client.query(`
      DELETE FROM roles WHERE name = 'Governance Manager';
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ Governance workflow migration rolled back successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Governance workflow rollback failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };

// Run migration if called directly
if (require.main === module) {
  up()
    .then(() => {
      systemLogger.info('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      systemLogger.error('Migration failed:', error);
      process.exit(1);
    });
}
