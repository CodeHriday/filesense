/**
 * Phase 2: Policy-as-Data Engine
 * 
 * This migration creates tables for a flexible policy engine that supports:
 * - Resource-based policies (attached to files, projects, etc.)
 * - Identity-based policies (attached to users, groups)
 * - Fine-grained permissions with conditions
 * - Policy evaluation for access control decisions
 * 
 * Policy model inspired by AWS IAM and Cedar:
 * - Policies contain statements (allow/deny)
 * - Statements specify actions, resources, and optional conditions
 * - Policies can be scoped to projects or global
 */

const { systemLogger } = require('../utils/logger');

async function createPolicyEngine(client) {
  try {
    systemLogger.info('Starting policy engine tables migration');
    await client.query('BEGIN');

    // ===========================
    // POLICIES TABLE
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS rbac_policies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        
        -- Policy type: identity-based (user/group) or resource-based (file/project)
        policy_type VARCHAR(50) NOT NULL, -- IDENTITY, RESOURCE
        
        -- Policy scope
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        is_global BOOLEAN DEFAULT FALSE,
        
        -- Policy document (JSON)
        policy_document JSONB NOT NULL,
        
        -- Metadata
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_active BOOLEAN DEFAULT TRUE,
        version INTEGER DEFAULT 1,
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        
        -- Constraints
        CONSTRAINT unique_policy_name_per_project UNIQUE (name, project_id),
        CONSTRAINT valid_policy_type CHECK (policy_type IN ('IDENTITY', 'RESOURCE')),
        CONSTRAINT policy_document_not_empty CHECK (jsonb_typeof(policy_document) = 'object')
      );
    `);
    systemLogger.info('✓ rbac_policies table created');

    // Create indexes for policies
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_policies_type ON rbac_policies(policy_type);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_policies_project ON rbac_policies(project_id) WHERE project_id IS NOT NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_policies_active ON rbac_policies(is_active) WHERE is_active = TRUE;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_policies_global ON rbac_policies(is_global) WHERE is_global = TRUE;
    `);
    systemLogger.info('✓ Created indexes for rbac_policies table');

    // ===========================
    // USER POLICY ATTACHMENTS
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_policy_attachments (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        policy_id INTEGER REFERENCES rbac_policies(id) ON DELETE CASCADE,
        
        -- Metadata
        attached_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        attached_at TIMESTAMP DEFAULT NOW() NOT NULL,
        
        -- Constraints
        PRIMARY KEY (user_id, policy_id)
      );
    `);
    systemLogger.info('✓ user_policy_attachments table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_policy_attachments_user ON user_policy_attachments(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_policy_attachments_policy ON user_policy_attachments(policy_id);
    `);
    systemLogger.info('✓ Created indexes for user_policy_attachments table');

    // ===========================
    // GROUP POLICY ATTACHMENTS
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS group_policy_attachments (
        group_id INTEGER REFERENCES access_groups(id) ON DELETE CASCADE,
        policy_id INTEGER REFERENCES rbac_policies(id) ON DELETE CASCADE,
        
        -- Metadata
        attached_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        attached_at TIMESTAMP DEFAULT NOW() NOT NULL,
        
        -- Constraints
        PRIMARY KEY (group_id, policy_id)
      );
    `);
    systemLogger.info('✓ group_policy_attachments table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_group_policy_attachments_group ON group_policy_attachments(group_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_group_policy_attachments_policy ON group_policy_attachments(policy_id);
    `);
    systemLogger.info('✓ Created indexes for group_policy_attachments table');

    // ===========================
    // RESOURCE POLICY ATTACHMENTS
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS resource_policy_attachments (
        resource_type VARCHAR(50) NOT NULL, -- FILE, PROJECT, TRANSFORMATION, etc.
        resource_id VARCHAR(255) NOT NULL,
        policy_id INTEGER REFERENCES rbac_policies(id) ON DELETE CASCADE,
        
        -- Metadata
        attached_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        attached_at TIMESTAMP DEFAULT NOW() NOT NULL,
        
        -- Constraints
        PRIMARY KEY (resource_type, resource_id, policy_id)
      );
    `);
    systemLogger.info('✓ resource_policy_attachments table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_resource_policy_attachments_type ON resource_policy_attachments(resource_type);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_resource_policy_attachments_resource ON resource_policy_attachments(resource_type, resource_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_resource_policy_attachments_policy ON resource_policy_attachments(policy_id);
    `);
    systemLogger.info('✓ Created indexes for resource_policy_attachments table');

    // ===========================
    // POLICY EVALUATION CACHE
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS policy_evaluation_cache (
        cache_key VARCHAR(512) PRIMARY KEY,
        user_id INTEGER NOT NULL,
        action VARCHAR(255) NOT NULL,
        resource_type VARCHAR(50),
        resource_id VARCHAR(255),
        decision VARCHAR(20) NOT NULL, -- ALLOW, DENY, IMPLICIT_DENY
        evaluated_policies JSONB,
        
        -- Cache expiration
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        
        -- Constraints
        CONSTRAINT valid_decision CHECK (decision IN ('ALLOW', 'DENY', 'IMPLICIT_DENY'))
      );
    `);
    systemLogger.info('✓ policy_evaluation_cache table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_policy_cache_user ON policy_evaluation_cache(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_policy_cache_expires ON policy_evaluation_cache(expires_at);
    `);
    systemLogger.info('✓ Created indexes for policy_evaluation_cache table');

    // ===========================
    // UPDATE TRIGGERS
    // ===========================
    await client.query(`
      DROP TRIGGER IF EXISTS update_rbac_policies_updated_at ON rbac_policies;
      CREATE TRIGGER update_rbac_policies_updated_at
        BEFORE UPDATE ON rbac_policies
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
    systemLogger.info('✓ Created update triggers');

    // ===========================
    // CLEANUP TRIGGER FOR CACHE
    // ===========================
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_policy_cache()
      RETURNS void AS $$
      BEGIN
        DELETE FROM policy_evaluation_cache WHERE expires_at < NOW();
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_cleanup_policy_cache()
      RETURNS trigger AS $$
      BEGIN
        PERFORM cleanup_expired_policy_cache();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_cleanup_policy_cache_on_insert ON policy_evaluation_cache;
      CREATE TRIGGER trigger_cleanup_policy_cache_on_insert
        AFTER INSERT ON policy_evaluation_cache
        EXECUTE FUNCTION trigger_cleanup_policy_cache();
    `);
    systemLogger.info('✓ Created cache cleanup triggers');

    // ===========================
    // CREATE SAMPLE POLICIES
    // ===========================
    // Create a default admin policy for reference
    await client.query(`
      INSERT INTO rbac_policies (name, description, policy_type, is_global, policy_document)
      VALUES (
        'AdministratorAccess',
        'Full administrative access to all resources',
        'IDENTITY',
        TRUE,
        '{
          "Version": "2025-01-01",
          "Statement": [
            {
              "Effect": "Allow",
              "Action": "*",
              "Resource": "*"
            }
          ]
        }'::jsonb
      )
      ON CONFLICT (name, project_id) DO NOTHING;
    `);
    
    await client.query(`
      INSERT INTO rbac_policies (name, description, policy_type, is_global, policy_document)
      VALUES (
        'ReadOnlyAccess',
        'Read-only access to all resources',
        'IDENTITY',
        TRUE,
        '{
          "Version": "2025-01-01",
          "Statement": [
            {
              "Effect": "Allow",
              "Action": [
                "file:read",
                "file:list",
                "project:read",
                "project:list",
                "transformation:read",
                "workflow:read"
              ],
              "Resource": "*"
            }
          ]
        }'::jsonb
      )
      ON CONFLICT (name, project_id) DO NOTHING;
    `);
    
    systemLogger.info('✓ Created sample policies');

    await client.query('COMMIT');
    systemLogger.info('Policy engine tables migration completed successfully');
    return { success: true, message: 'Migration completed successfully' };

  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error creating policy engine tables', error);
    throw error;
  }
}

module.exports = { createPolicyEngine };
