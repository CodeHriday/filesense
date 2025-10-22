/**
 * Phase 4: SCIM 2.0 Provisioning
 * 
 * This migration creates tables for SCIM (System for Cross-domain Identity Management)
 * provisioning to support automated user and group synchronization from identity providers.
 * 
 * SCIM 2.0 endpoints will allow:
 * - Automated user provisioning/deprovisioning
 * - Group membership sync
 * - Attribute mapping from IdP to platform
 */

const { systemLogger } = require('../utils/logger');

async function createSCIMProvisioning(client) {
  try {
    systemLogger.info('Starting SCIM provisioning tables migration');
    await client.query('BEGIN');

    // ===========================
    // SCIM CONFIGURATIONS TABLE
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS scim_configurations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        
        -- SCIM endpoint configuration
        base_url VARCHAR(255), -- Our SCIM endpoint
        bearer_token VARCHAR(512), -- Token for IdP to authenticate
        
        -- IdP configuration
        idp_type VARCHAR(50) NOT NULL, -- OKTA, AZURE_AD, ONELOGIN, CUSTOM
        idp_scim_url VARCHAR(255), -- IdP's SCIM endpoint (for bidirectional sync)
        
        -- Sync settings
        sync_users BOOLEAN DEFAULT TRUE,
        sync_groups BOOLEAN DEFAULT TRUE,
        sync_interval_minutes INTEGER DEFAULT 60,
        last_sync_at TIMESTAMP,
        
        -- Attribute mappings (JSON)
        user_attribute_mapping JSONB DEFAULT '{}'::jsonb,
        group_attribute_mapping JSONB DEFAULT '{}'::jsonb,
        
        -- Status
        is_active BOOLEAN DEFAULT TRUE,
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    systemLogger.info('✓ scim_configurations table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scim_configurations_active ON scim_configurations(is_active) WHERE is_active = TRUE;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scim_configurations_idp_type ON scim_configurations(idp_type);
    `);
    systemLogger.info('✓ Created indexes for scim_configurations table');

    // ===========================
    // SCIM SYNC LOG TABLE
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS scim_sync_logs (
        id SERIAL PRIMARY KEY,
        config_id INTEGER REFERENCES scim_configurations(id) ON DELETE CASCADE,
        
        -- Sync details
        sync_type VARCHAR(50) NOT NULL, -- USER, GROUP, FULL
        sync_direction VARCHAR(20) DEFAULT 'INBOUND', -- INBOUND, OUTBOUND, BIDIRECTIONAL
        
        -- Results
        status VARCHAR(50) NOT NULL, -- SUCCESS, PARTIAL, FAILED
        items_processed INTEGER DEFAULT 0,
        items_created INTEGER DEFAULT 0,
        items_updated INTEGER DEFAULT 0,
        items_deleted INTEGER DEFAULT 0,
        items_failed INTEGER DEFAULT 0,
        
        -- Error details
        error_message TEXT,
        error_details JSONB,
        
        -- Timestamps
        started_at TIMESTAMP DEFAULT NOW() NOT NULL,
        completed_at TIMESTAMP,
        duration_ms INTEGER
      );
    `);
    systemLogger.info('✓ scim_sync_logs table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scim_sync_logs_config ON scim_sync_logs(config_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scim_sync_logs_status ON scim_sync_logs(status);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scim_sync_logs_started ON scim_sync_logs(started_at DESC);
    `);
    systemLogger.info('✓ Created indexes for scim_sync_logs table');

    // ===========================
    // SCIM RESOURCE MAPPING TABLE
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS scim_resource_mappings (
        id SERIAL PRIMARY KEY,
        config_id INTEGER REFERENCES scim_configurations(id) ON DELETE CASCADE,
        
        -- SCIM resource info
        scim_id VARCHAR(255) NOT NULL, -- SCIM resource ID from IdP
        scim_resource_type VARCHAR(50) NOT NULL, -- User, Group
        
        -- Platform resource info
        platform_resource_type VARCHAR(50) NOT NULL, -- USER, ACCESS_GROUP
        platform_resource_id INTEGER NOT NULL,
        
        -- Sync metadata
        last_synced_at TIMESTAMP,
        sync_hash VARCHAR(64), -- Hash of resource state for change detection
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        
        -- Constraints
        CONSTRAINT unique_scim_resource UNIQUE (config_id, scim_id),
        CONSTRAINT unique_platform_resource UNIQUE (config_id, platform_resource_type, platform_resource_id)
      );
    `);
    systemLogger.info('✓ scim_resource_mappings table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scim_mappings_config ON scim_resource_mappings(config_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scim_mappings_scim_id ON scim_resource_mappings(scim_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scim_mappings_platform ON scim_resource_mappings(platform_resource_type, platform_resource_id);
    `);
    systemLogger.info('✓ Created indexes for scim_resource_mappings table');

    // ===========================
    // UPDATE TRIGGERS
    // ===========================
    await client.query(`
      DROP TRIGGER IF EXISTS update_scim_configurations_updated_at ON scim_configurations;
      CREATE TRIGGER update_scim_configurations_updated_at
        BEFORE UPDATE ON scim_configurations
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_scim_resource_mappings_updated_at ON scim_resource_mappings;
      CREATE TRIGGER update_scim_resource_mappings_updated_at
        BEFORE UPDATE ON scim_resource_mappings
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
    systemLogger.info('✓ Created update triggers');

    await client.query('COMMIT');
    systemLogger.info('SCIM provisioning tables migration completed successfully');
    return { success: true, message: 'Migration completed successfully' };

  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error creating SCIM provisioning tables', error);
    throw error;
  }
}

module.exports = { createSCIMProvisioning };
