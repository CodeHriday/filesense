/**
 * Vendor Management Tables Migration
 * Creates tables for vendor onboarding, agreements, and approval workflow
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting vendor management tables migration...');

    // Create vendors table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id SERIAL PRIMARY KEY,
        vendor_code VARCHAR(50) UNIQUE NOT NULL,
        vendor_name VARCHAR(255) NOT NULL,
        description TEXT,
        
        -- Contact information
        contact_name VARCHAR(255) NOT NULL,
        contact_email VARCHAR(255) NOT NULL,
        contact_phone VARCHAR(50),
        
        -- User account for vendor
        vendor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        
        -- Project association
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        
        -- File drop location (folder path within configured drop location)
        drop_location_path VARCHAR(500),
        
        -- Status
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
        
        -- Audit fields
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        
        CONSTRAINT unique_vendor_code UNIQUE(vendor_code)
      );
    `);
    systemLogger.info('✓ vendors table created');

    // Create vendor agreements table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_agreements (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        agreement_code VARCHAR(100) UNIQUE NOT NULL,
        
        -- File details
        file_name VARCHAR(500) NOT NULL,
        file_description TEXT,
        
        -- Schema (stored as JSONB - array of column definitions)
        -- Format: [{"column_name": "id", "data_type": "INTEGER", "precision": null, "scale": null, "nullable": false}, ...]
        schema JSONB NOT NULL,
        
        -- Frequency and schedule
        frequency VARCHAR(50), -- Daily, Weekly, Monthly, etc.
        frequency_description TEXT,
        
        -- Ownership
        file_creator VARCHAR(255),
        file_owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Internal owner
        vendor_contact VARCHAR(255),
        owner_contact VARCHAR(255),
        
        -- Additional metadata
        metadata JSONB, -- For any industry-specific fields
        
        -- Approval status
        approval_status VARCHAR(50) DEFAULT 'draft' CHECK (
          approval_status IN ('draft', 'pending_approval', 'vendor_approved', 'owner_approved', 'fully_approved', 'rejected', 'changes_pending')
        ),
        vendor_approved_at TIMESTAMP,
        vendor_approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        owner_approved_at TIMESTAMP,
        owner_approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        
        -- Lock status (locked after dual approval)
        is_locked BOOLEAN DEFAULT FALSE,
        locked_at TIMESTAMP,
        
        -- Version tracking
        version INTEGER DEFAULT 1,
        
        -- Status
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
        
        -- Audit fields
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        
        CONSTRAINT unique_agreement_code UNIQUE(agreement_code)
      );
    `);
    systemLogger.info('✓ vendor_agreements table created');

    // Create vendor agreement approvals history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_agreement_approvals (
        id SERIAL PRIMARY KEY,
        agreement_id INTEGER NOT NULL REFERENCES vendor_agreements(id) ON DELETE CASCADE,
        
        -- Approval details
        approver_type VARCHAR(50) NOT NULL CHECK (approver_type IN ('vendor', 'owner')),
        approver_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        
        -- Action
        action VARCHAR(50) NOT NULL CHECK (action IN ('approved', 'rejected', 'revoked')),
        comments TEXT,
        
        -- Metadata
        agreement_version INTEGER NOT NULL,
        approval_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- IP and audit trail
        ip_address VARCHAR(50),
        user_agent TEXT
      );
    `);
    systemLogger.info('✓ vendor_agreement_approvals table created');

    // Create vendor agreement change history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_agreement_changes (
        id SERIAL PRIMARY KEY,
        agreement_id INTEGER NOT NULL REFERENCES vendor_agreements(id) ON DELETE CASCADE,
        
        -- Change tracking
        change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('created', 'updated', 'schema_changed', 'reopened', 'locked', 'unlocked')),
        
        -- Before and after snapshots
        previous_data JSONB,
        new_data JSONB,
        changes_summary TEXT,
        
        -- Version
        from_version INTEGER,
        to_version INTEGER,
        
        -- Audit
        changed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reason TEXT,
        
        -- IP and audit trail
        ip_address VARCHAR(50),
        user_agent TEXT
      );
    `);
    systemLogger.info('✓ vendor_agreement_changes table created');

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendors_vendor_code ON vendors(vendor_code);
      CREATE INDEX IF NOT EXISTS idx_vendors_project_id ON vendors(project_id);
      CREATE INDEX IF NOT EXISTS idx_vendors_vendor_user_id ON vendors(vendor_user_id);
      CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
      
      CREATE INDEX IF NOT EXISTS idx_vendor_agreements_vendor_id ON vendor_agreements(vendor_id);
      CREATE INDEX IF NOT EXISTS idx_vendor_agreements_agreement_code ON vendor_agreements(agreement_code);
      CREATE INDEX IF NOT EXISTS idx_vendor_agreements_approval_status ON vendor_agreements(approval_status);
      CREATE INDEX IF NOT EXISTS idx_vendor_agreements_file_owner ON vendor_agreements(file_owner_user_id);
      
      CREATE INDEX IF NOT EXISTS idx_vendor_agreement_approvals_agreement_id ON vendor_agreement_approvals(agreement_id);
      CREATE INDEX IF NOT EXISTS idx_vendor_agreement_approvals_approver ON vendor_agreement_approvals(approver_user_id);
      
      CREATE INDEX IF NOT EXISTS idx_vendor_agreement_changes_agreement_id ON vendor_agreement_changes(agreement_id);
      CREATE INDEX IF NOT EXISTS idx_vendor_agreement_changes_changed_by ON vendor_agreement_changes(changed_by);
    `);
    systemLogger.info('✓ Indexes created');

    await client.query('COMMIT');
    systemLogger.info('✅ Vendor management tables migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Vendor management tables migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting vendor management tables migration...');

    await client.query('DROP TABLE IF EXISTS vendor_agreement_changes CASCADE');
    await client.query('DROP TABLE IF EXISTS vendor_agreement_approvals CASCADE');
    await client.query('DROP TABLE IF EXISTS vendor_agreements CASCADE');
    await client.query('DROP TABLE IF EXISTS vendors CASCADE');

    await client.query('COMMIT');
    systemLogger.info('✅ Vendor management tables migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ Vendor management tables migration revert failed', { error: error.message });
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
