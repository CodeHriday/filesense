/**
 * Migration: Create Projects and User Groups Tables
 * 
 * Phase 1 of RBAC revamp - Implements workspace containment and group-based permissions
 * 
 * Tables:
 * - projects: Top-level workspace containers for all resources
 * - project_members: User membership in projects with roles
 * - groups: User groups with IdP sync support
 * - group_members: Users in groups
 * - group_roles: Role assignments to groups
 */

const systemLogger = require('../utils/logger').systemLogger;

async function createProjectsAndGroups(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    systemLogger.info('Starting projects and groups schema migration');

    // ===========================
    // PROJECTS TABLE
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        parent_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        is_default BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        
        -- Metadata
        metadata JSONB DEFAULT '{}'::jsonb,
        settings JSONB DEFAULT '{}'::jsonb,
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        
        -- Constraints
        CONSTRAINT unique_project_name UNIQUE (name),
        CONSTRAINT check_not_self_parent CHECK (id != parent_id)
      );
    `);
    systemLogger.info('✓ projects table created');

    // Create indexes for projects
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_parent ON projects(parent_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_is_default ON projects(is_default) WHERE is_default = TRUE;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_active) WHERE is_active = TRUE;
    `);
    systemLogger.info('✓ Created indexes for projects table');

    // ===========================
    // PROJECT MEMBERS TABLE
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_members (
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
        
        -- Access control
        can_invite BOOLEAN DEFAULT FALSE,
        can_manage_members BOOLEAN DEFAULT FALSE,
        
        -- Metadata
        invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        invitation_accepted_at TIMESTAMP,
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        
        -- Constraints
        PRIMARY KEY (project_id, user_id, role_id)
      );
    `);
    systemLogger.info('✓ project_members table created');

    // Create indexes for project members
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_project_members_role ON project_members(role_id);
    `);
    systemLogger.info('✓ Created indexes for project_members table');

    // ===========================
    // ACCESS GROUPS TABLE (renamed from 'groups' to avoid conflict with business process groups)
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS access_groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        
        -- Group type and source
        group_type VARCHAR(50) DEFAULT 'MANUAL', -- MANUAL, IDP_SYNCED, SYSTEM
        idp_source VARCHAR(100), -- okta, azure_ad, google, etc.
        external_group_id VARCHAR(255), -- External IdP group identifier
        
        -- Sync configuration
        sync_enabled BOOLEAN DEFAULT FALSE,
        last_synced_at TIMESTAMP,
        sync_status VARCHAR(50), -- SUCCESS, FAILED, IN_PROGRESS
        sync_error TEXT,
        
        -- Ownership
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        
        -- Metadata
        metadata JSONB DEFAULT '{}'::jsonb,
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        
        -- Constraints
        CONSTRAINT unique_group_name UNIQUE (name),
        CONSTRAINT unique_external_group UNIQUE (idp_source, external_group_id)
      );
    `);
    systemLogger.info('✓ access_groups table created');

    // Create indexes for access_groups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_groups_type ON access_groups(group_type);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_groups_idp_source ON access_groups(idp_source) WHERE idp_source IS NOT NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_groups_external_id ON access_groups(external_group_id) WHERE external_group_id IS NOT NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_groups_sync_enabled ON access_groups(sync_enabled) WHERE sync_enabled = TRUE;
    `);
    systemLogger.info('✓ Created indexes for access_groups table');

    // ===========================
    // ACCESS GROUP MEMBERS TABLE
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS access_group_members (
        group_id INTEGER REFERENCES access_groups(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        
        -- Membership source
        source VARCHAR(50) DEFAULT 'MANUAL', -- MANUAL, IDP_SYNCED, INHERITED
        
        -- Metadata
        added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        added_at TIMESTAMP DEFAULT NOW() NOT NULL,
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        
        -- Constraints
        PRIMARY KEY (group_id, user_id)
      );
    `);
    systemLogger.info('✓ access_group_members table created');

    // Create indexes for access group members
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_group_members_user ON access_group_members(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_group_members_group ON access_group_members(group_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_group_members_source ON access_group_members(source);
    `);
    systemLogger.info('✓ Created indexes for access_group_members table');

    // ===========================
    // ACCESS GROUP ROLES TABLE
    // ===========================
    await client.query(`
      CREATE TABLE IF NOT EXISTS access_group_roles (
        group_id INTEGER REFERENCES access_groups(id) ON DELETE CASCADE,
        role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
        
        -- Scope - can be global or project-specific
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        
        -- Metadata
        assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        
        -- Constraints
        -- Use a serial id as primary key for simplicity
        id SERIAL PRIMARY KEY
      );
    `);
    systemLogger.info('✓ access_group_roles table created');
    
    // Create unique constraints for group_roles
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_access_group_roles_global_unique 
      ON access_group_roles(group_id, role_id) 
      WHERE project_id IS NULL;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_access_group_roles_project_unique 
      ON access_group_roles(group_id, role_id, project_id) 
      WHERE project_id IS NOT NULL;
    `);
    systemLogger.info('✓ Created unique constraints for access_group_roles');

    // Create indexes for access group roles
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_group_roles_group ON access_group_roles(group_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_group_roles_role ON access_group_roles(role_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_access_group_roles_project ON access_group_roles(project_id) WHERE project_id IS NOT NULL;
    `);
    systemLogger.info('✓ Created indexes for access_group_roles table');

    // ===========================
    // UPDATE TRIGGERS
    // ===========================
    
    // Trigger function for updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create triggers for updated_at
    await client.query(`
      DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
      CREATE TRIGGER update_projects_updated_at
        BEFORE UPDATE ON projects
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_project_members_updated_at ON project_members;
      CREATE TRIGGER update_project_members_updated_at
        BEFORE UPDATE ON project_members
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_access_groups_updated_at ON access_groups;
      CREATE TRIGGER update_access_groups_updated_at
        BEFORE UPDATE ON access_groups
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    systemLogger.info('✓ Created update triggers');

    await client.query('COMMIT');
    systemLogger.info('Projects and groups schema migration completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error creating projects and groups tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = createProjectsAndGroups;
