const { systemLogger } = require('../utils/logger');

/**
 * Migration: Create quality rule association tables
 * Creates junction tables to associate quality rules with files and transformations
 */

async function up(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    systemLogger.info('Creating file_quality_rules junction table');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS file_quality_rules (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) NOT NULL,
        quality_rule_id INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_file_quality_rules_file
          FOREIGN KEY (file_id)
          REFERENCES files(file_id)
          ON DELETE CASCADE,
        CONSTRAINT fk_file_quality_rules_rule
          FOREIGN KEY (quality_rule_id)
          REFERENCES quality_rules(id)
          ON DELETE CASCADE,
        CONSTRAINT unique_file_quality_rule
          UNIQUE (file_id, quality_rule_id)
      )
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_file_quality_rules_file_id 
      ON file_quality_rules(file_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_file_quality_rules_rule_id 
      ON file_quality_rules(quality_rule_id)
    `);
    
    systemLogger.info('Creating transformation_quality_rules junction table');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS transformation_quality_rules (
        id SERIAL PRIMARY KEY,
        mapping_id VARCHAR(255) NOT NULL,
        quality_rule_id INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_transformation_quality_rules_mapping
          FOREIGN KEY (mapping_id)
          REFERENCES transformation_mappings(mapping_id)
          ON DELETE CASCADE,
        CONSTRAINT fk_transformation_quality_rules_rule
          FOREIGN KEY (quality_rule_id)
          REFERENCES quality_rules(id)
          ON DELETE CASCADE,
        CONSTRAINT unique_transformation_quality_rule
          UNIQUE (mapping_id, quality_rule_id)
      )
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transformation_quality_rules_mapping_id 
      ON transformation_quality_rules(mapping_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transformation_quality_rules_rule_id 
      ON transformation_quality_rules(quality_rule_id)
    `);
    
    await client.query('COMMIT');
    systemLogger.info('Quality rule association tables created successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error creating quality rule association tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function down(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    systemLogger.info('Dropping quality rule association tables');
    
    await client.query('DROP TABLE IF EXISTS transformation_quality_rules CASCADE');
    await client.query('DROP TABLE IF EXISTS file_quality_rules CASCADE');
    
    await client.query('COMMIT');
    systemLogger.info('Quality rule association tables dropped successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error dropping quality rule association tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
