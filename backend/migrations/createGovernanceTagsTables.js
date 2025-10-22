const systemLogger = {
  info: (msg) => console.log(`INFO: ${msg}`),
  error: (msg, error) => console.error(`ERROR: ${msg}`, error)
};

async function createGovernanceTagsTables(pool) {
  try {
    systemLogger.info('Starting governance tags tables migration');

    // Create governance_tags table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS governance_tags (
        tag_id VARCHAR(255) PRIMARY KEY,
        tag_name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        color VARCHAR(50) DEFAULT '#3B82F6',
        badge_style VARCHAR(50) DEFAULT 'default',
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_tag_creator
          FOREIGN KEY (created_by)
          REFERENCES users(id)
          ON DELETE SET NULL
      )
    `);
    systemLogger.info('✓ governance_tags table created');

    // Create file_tag_assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_tag_assignments (
        assignment_id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        tag_id VARCHAR(255) NOT NULL,
        assigned_by INTEGER,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_tag_assignment_file 
          FOREIGN KEY (file_id) 
          REFERENCES files(file_id) 
          ON DELETE CASCADE,
        CONSTRAINT fk_tag_assignment_tag
          FOREIGN KEY (tag_id)
          REFERENCES governance_tags(tag_id)
          ON DELETE CASCADE,
        CONSTRAINT fk_tag_assignment_user
          FOREIGN KEY (assigned_by)
          REFERENCES users(id)
          ON DELETE SET NULL,
        CONSTRAINT unique_file_tag 
          UNIQUE (file_id, tag_id)
      )
    `);
    systemLogger.info('✓ file_tag_assignments table created');

    // Create indexes for better query performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tag_assignments_file_id 
      ON file_tag_assignments(file_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tag_assignments_tag_id 
      ON file_tag_assignments(tag_id)
    `);

    systemLogger.info('✓ Created indexes for governance tags tables');

    systemLogger.info('Governance tags tables initialized successfully');
    console.log('✅ Governance tags tables migration completed');
    
    return { success: true, message: 'Governance tags tables migration completed' };
  } catch (error) {
    systemLogger.error('Error creating governance tags tables:', error);
    console.error('❌ Governance tags tables migration failed:', error.message);
    throw error;
  }
}

module.exports = createGovernanceTagsTables;
