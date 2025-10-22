const systemLogger = {
  info: (msg) => console.log(`INFO: ${msg}`),
  error: (msg, error) => console.error(`ERROR: ${msg}`, error)
};

async function addTagPermissionLevels(pool) {
  try {
    systemLogger.info('Starting tag permission levels migration');

    // Add permission_required column to governance_tags table
    // This defines what permission is needed to view/edit columns with this tag
    await pool.query(`
      ALTER TABLE governance_tags 
      ADD COLUMN IF NOT EXISTS permission_required VARCHAR(255) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS requires_view_permission BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS requires_edit_permission BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS sensitivity_level VARCHAR(50) DEFAULT 'public'
    `);
    systemLogger.info('✓ Added permission columns to governance_tags table');

    // Add comment explaining the columns
    await pool.query(`
      COMMENT ON COLUMN governance_tags.permission_required IS 'Base permission name (e.g., pii, confidential) - system will check tag:permission:read and tag:permission:edit'
    `);
    await pool.query(`
      COMMENT ON COLUMN governance_tags.sensitivity_level IS 'Sensitivity level: public (anyone), restricted (requires permission), private (admin only)'
    `);
    
    systemLogger.info('✓ Added column comments');

    // Create tag_permissions table to store which roles have access to which tags
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tag_permissions (
        id SERIAL PRIMARY KEY,
        tag_id VARCHAR(255) NOT NULL,
        role_id INTEGER NOT NULL,
        can_view BOOLEAN DEFAULT FALSE,
        can_edit BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_tag_permission_tag
          FOREIGN KEY (tag_id)
          REFERENCES governance_tags(tag_id)
          ON DELETE CASCADE,
        CONSTRAINT fk_tag_permission_role
          FOREIGN KEY (role_id)
          REFERENCES roles(id)
          ON DELETE CASCADE,
        CONSTRAINT unique_tag_role
          UNIQUE (tag_id, role_id)
      )
    `);
    systemLogger.info('✓ tag_permissions table created');

    // Create index for better query performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tag_permissions_tag_id 
      ON tag_permissions(tag_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tag_permissions_role_id 
      ON tag_permissions(role_id)
    `);
    systemLogger.info('✓ Created indexes for tag_permissions table');

    systemLogger.info('Tag permission levels migration completed successfully');
    console.log('✅ Tag permission levels migration completed');
    
    return { success: true, message: 'Tag permission levels migration completed' };
  } catch (error) {
    systemLogger.error('Error in tag permission levels migration:', error);
    console.error('❌ Tag permission levels migration failed:', error.message);
    throw error;
  }
}

module.exports = addTagPermissionLevels;
