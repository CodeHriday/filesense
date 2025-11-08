const { systemLogger } = require('../utils/logger');

async function addPrimaryKeyColumnsToQualityRuleViolations(pool) {
  try {
    systemLogger.info('Adding primary_key_value and primary_key_column columns to quality_rule_violations table');
    
    // Add primary_key_value column as TEXT
    await pool.query(`
      ALTER TABLE quality_rule_violations 
      ADD COLUMN IF NOT EXISTS primary_key_value TEXT DEFAULT NULL
    `);
    
    // Add primary_key_column column as TEXT
    await pool.query(`
      ALTER TABLE quality_rule_violations 
      ADD COLUMN IF NOT EXISTS primary_key_column TEXT DEFAULT NULL
    `);
    
    systemLogger.info('Successfully added primary key columns to quality_rule_violations');
    console.log('✅ Successfully added primary_key_value and primary_key_column columns');
    
    return { success: true, message: 'Primary key columns added successfully to quality_rule_violations' };
  } catch (error) {
    systemLogger.error('Error adding primary key columns', { error: error.message });
    console.error('Error adding primary key columns:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { addPrimaryKeyColumnsToQualityRuleViolations };
