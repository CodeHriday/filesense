/**
 * Phase 3: ABAC (Attribute-Based Access Control)
 * 
 * This migration creates tables for storing user and resource attributes
 * that can be used in policy conditions for context-aware access control.
 * 
 * Examples:
 * - User attributes: department, clearance_level, location, job_title
 * - Resource attributes: sensitivity, classification, data_owner, tags
 */

const { systemLogger } = require('../utils/logger');

async function createABACAttributes(client) {
  try {
    systemLogger.info('Starting ABAC attributes tables migration');
    await client.query('BEGIN');

    // ===========================
    // USER ATTRIBUTES TABLE
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_attributes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        attribute_key VARCHAR(100) NOT NULL,
        attribute_value TEXT NOT NULL,
        attribute_type VARCHAR(50) DEFAULT 'STRING', -- STRING, NUMBER, BOOLEAN, JSON
        
        -- Metadata
        source VARCHAR(50) DEFAULT 'MANUAL', -- MANUAL, IDP_SYNCED, COMPUTED
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        
        -- Constraints
        CONSTRAINT unique_user_attribute UNIQUE (user_id, attribute_key)
      );
    `);
    systemLogger.info('✓ user_attributes table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_attributes_user ON user_attributes(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_attributes_key ON user_attributes(attribute_key);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_attributes_source ON user_attributes(source);
    `);
    systemLogger.info('✓ Created indexes for user_attributes table');

    // ===========================
    // RESOURCE ATTRIBUTES TABLE
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS resource_attributes (
        id SERIAL PRIMARY KEY,
        resource_type VARCHAR(50) NOT NULL, -- FILE, PROJECT, TRANSFORMATION, etc.
        resource_id VARCHAR(255) NOT NULL,
        attribute_key VARCHAR(100) NOT NULL,
        attribute_value TEXT NOT NULL,
        attribute_type VARCHAR(50) DEFAULT 'STRING', -- STRING, NUMBER, BOOLEAN, JSON
        
        -- Metadata
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        
        -- Constraints
        CONSTRAINT unique_resource_attribute UNIQUE (resource_type, resource_id, attribute_key)
      );
    `);
    systemLogger.info('✓ resource_attributes table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_resource_attributes_type ON resource_attributes(resource_type);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_resource_attributes_resource ON resource_attributes(resource_type, resource_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_resource_attributes_key ON resource_attributes(attribute_key);
    `);
    systemLogger.info('✓ Created indexes for resource_attributes table');

    // ===========================
    // ATTRIBUTE DEFINITIONS TABLE (Schema/Metadata)
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS attribute_definitions (
        id SERIAL PRIMARY KEY,
        attribute_key VARCHAR(100) NOT NULL UNIQUE,
        display_name VARCHAR(255) NOT NULL,
        description TEXT,
        attribute_type VARCHAR(50) NOT NULL, -- STRING, NUMBER, BOOLEAN, JSON
        scope VARCHAR(50) NOT NULL, -- USER, RESOURCE, BOTH
        
        -- Validation
        allowed_values JSONB, -- For enum types: ["Admin", "User", "Guest"]
        validation_regex VARCHAR(255), -- For string validation
        min_value NUMERIC, -- For number validation
        max_value NUMERIC, -- For number validation
        
        -- Metadata
        is_required BOOLEAN DEFAULT FALSE,
        is_system BOOLEAN DEFAULT FALSE, -- System-defined vs user-defined
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    systemLogger.info('✓ attribute_definitions table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_attribute_definitions_scope ON attribute_definitions(scope);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_attribute_definitions_system ON attribute_definitions(is_system);
    `);
    systemLogger.info('✓ Created indexes for attribute_definitions table');

    // ===========================
    // UPDATE TRIGGERS
    // ===========================
    await client.query(`
      DROP TRIGGER IF EXISTS update_user_attributes_updated_at ON user_attributes;
      CREATE TRIGGER update_user_attributes_updated_at
        BEFORE UPDATE ON user_attributes
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_resource_attributes_updated_at ON resource_attributes;
      CREATE TRIGGER update_resource_attributes_updated_at
        BEFORE UPDATE ON resource_attributes
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_attribute_definitions_updated_at ON attribute_definitions;
      CREATE TRIGGER update_attribute_definitions_updated_at
        BEFORE UPDATE ON attribute_definitions
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
    systemLogger.info('✓ Created update triggers');

    // ===========================
    // SEED COMMON ATTRIBUTE DEFINITIONS
    // ===========================
    await client.query(`
      INSERT INTO attribute_definitions (attribute_key, display_name, description, attribute_type, scope, is_system, allowed_values)
      VALUES 
        ('department', 'Department', 'User department or organizational unit', 'STRING', 'USER', TRUE, NULL),
        ('clearance_level', 'Clearance Level', 'Security clearance level', 'NUMBER', 'USER', TRUE, NULL),
        ('location', 'Location', 'Physical location or region', 'STRING', 'USER', TRUE, NULL),
        ('job_title', 'Job Title', 'Employee job title', 'STRING', 'USER', TRUE, NULL),
        ('cost_center', 'Cost Center', 'Financial cost center', 'STRING', 'USER', TRUE, NULL),
        ('sensitivity', 'Data Sensitivity', 'Data sensitivity classification', 'STRING', 'RESOURCE', TRUE, '["Public", "Internal", "Confidential", "Restricted"]'::jsonb),
        ('classification', 'Security Classification', 'Security classification level', 'STRING', 'RESOURCE', TRUE, '["Unclassified", "Confidential", "Secret", "Top Secret"]'::jsonb),
        ('data_owner', 'Data Owner', 'Owner of the data resource', 'STRING', 'RESOURCE', TRUE, NULL),
        ('retention_period', 'Retention Period', 'Data retention period in days', 'NUMBER', 'RESOURCE', TRUE, NULL),
        ('compliance_tags', 'Compliance Tags', 'Compliance framework tags (GDPR, HIPAA, etc.)', 'JSON', 'RESOURCE', TRUE, NULL)
      ON CONFLICT (attribute_key) DO NOTHING;
    `);
    systemLogger.info('✓ Seeded common attribute definitions');

    await client.query('COMMIT');
    systemLogger.info('ABAC attributes tables migration completed successfully');
    return { success: true, message: 'Migration completed successfully' };

  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error creating ABAC attributes tables', error);
    throw error;
  }
}

module.exports = { createABACAttributes };
