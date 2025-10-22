const systemLogger = {
  info: (msg) => console.log(`INFO: ${msg}`),
  error: (msg, error) => console.error(`ERROR: ${msg}`, error)
};

async function createDataGovernanceTables(pool) {
  try {
    systemLogger.info('Starting data governance tables migration');

    // Create file_ownership table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_ownership (
        ownership_id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL UNIQUE,
        owner_user_id INTEGER,
        owner_name VARCHAR(255),
        owner_email VARCHAR(255),
        owner_contact VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_file_ownership_file 
          FOREIGN KEY (file_id) 
          REFERENCES files(file_id) 
          ON DELETE CASCADE,
        CONSTRAINT fk_file_ownership_user
          FOREIGN KEY (owner_user_id)
          REFERENCES users(id)
          ON DELETE SET NULL
      )
    `);
    systemLogger.info('✓ file_ownership table created');

    // Create column_sensitivity_tags table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS column_sensitivity_tags (
        tag_id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        column_name VARCHAR(255) NOT NULL,
        classification_level VARCHAR(50) NOT NULL,
        data_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_column_tags_file 
          FOREIGN KEY (file_id) 
          REFERENCES files(file_id) 
          ON DELETE CASCADE,
        CONSTRAINT unique_file_column_tag 
          UNIQUE (file_id, column_name)
      )
    `);
    systemLogger.info('✓ column_sensitivity_tags table created');

    // Create governance_policies table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS governance_policies (
        policy_id VARCHAR(255) PRIMARY KEY,
        policy_name VARCHAR(255) NOT NULL,
        description TEXT,
        rules JSONB NOT NULL DEFAULT '{}',
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_policy_creator
          FOREIGN KEY (created_by)
          REFERENCES users(id)
          ON DELETE SET NULL
      )
    `);
    systemLogger.info('✓ governance_policies table created');

    // Create file_policy_assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_policy_assignments (
        assignment_id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        policy_id VARCHAR(255) NOT NULL,
        assigned_by INTEGER,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_policy_assignment_file 
          FOREIGN KEY (file_id) 
          REFERENCES files(file_id) 
          ON DELETE CASCADE,
        CONSTRAINT fk_policy_assignment_policy
          FOREIGN KEY (policy_id)
          REFERENCES governance_policies(policy_id)
          ON DELETE CASCADE,
        CONSTRAINT fk_policy_assignment_user
          FOREIGN KEY (assigned_by)
          REFERENCES users(id)
          ON DELETE SET NULL,
        CONSTRAINT unique_file_policy 
          UNIQUE (file_id, policy_id)
      )
    `);
    systemLogger.info('✓ file_policy_assignments table created');

    // Create indexes for better query performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_file_ownership_file_id 
      ON file_ownership(file_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_file_ownership_user_id 
      ON file_ownership(owner_user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_column_tags_file_id 
      ON column_sensitivity_tags(file_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_column_tags_classification 
      ON column_sensitivity_tags(classification_level)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_policy_assignments_file_id 
      ON file_policy_assignments(file_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_policy_assignments_policy_id 
      ON file_policy_assignments(policy_id)
    `);

    systemLogger.info('✓ Created indexes for all data governance tables');

    systemLogger.info('Data governance tables initialized successfully');
    console.log('✅ Data governance tables migration completed');
    
    return { success: true, message: 'Data governance tables migration completed' };
  } catch (error) {
    systemLogger.error('Error creating data governance tables:', error);
    console.error('❌ Data governance tables migration failed:', error.message);
    throw error;
  }
}

module.exports = createDataGovernanceTables;
