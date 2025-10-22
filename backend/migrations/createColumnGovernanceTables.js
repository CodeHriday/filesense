const systemLogger = {
  info: (msg) => console.log(`INFO: ${msg}`),
  error: (msg, error) => console.error(`ERROR: ${msg}`, error)
};

async function createColumnGovernanceTables(pool) {
  try {
    systemLogger.info('Starting column governance tables migration');

    // Create column_governance_tag_assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS column_governance_tag_assignments (
        assignment_id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        column_name VARCHAR(255) NOT NULL,
        tag_id VARCHAR(255) NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_column_tag_file 
          FOREIGN KEY (file_id) 
          REFERENCES files(file_id) 
          ON DELETE CASCADE,
        CONSTRAINT fk_column_tag_tag 
          FOREIGN KEY (tag_id) 
          REFERENCES governance_tags(tag_id) 
          ON DELETE CASCADE,
        CONSTRAINT unique_column_tag 
          UNIQUE (file_id, column_name, tag_id)
      )
    `);
    systemLogger.info('✓ column_governance_tag_assignments table created');

    // Create column_policy_assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS column_policy_assignments (
        assignment_id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        column_name VARCHAR(255) NOT NULL,
        policy_id VARCHAR(255) NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_column_policy_file 
          FOREIGN KEY (file_id) 
          REFERENCES files(file_id) 
          ON DELETE CASCADE,
        CONSTRAINT fk_column_policy_policy 
          FOREIGN KEY (policy_id) 
          REFERENCES governance_policies(policy_id) 
          ON DELETE CASCADE,
        CONSTRAINT unique_column_policy 
          UNIQUE (file_id, column_name, policy_id)
      )
    `);
    systemLogger.info('✓ column_policy_assignments table created');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_column_tag_file_id 
      ON column_governance_tag_assignments(file_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_column_tag_column 
      ON column_governance_tag_assignments(file_id, column_name)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_column_policy_file_id 
      ON column_policy_assignments(file_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_column_policy_column 
      ON column_policy_assignments(file_id, column_name)
    `);
    
    systemLogger.info('✓ Created indexes for column governance tables');
    systemLogger.info('Column governance tables initialized successfully');
    
    console.log('✅ Column governance tables migration completed');
  } catch (error) {
    console.error('Error creating column governance tables:', error);
    systemLogger.error('Failed to create column governance tables', error);
    throw error;
  }
}

module.exports = createColumnGovernanceTables;
