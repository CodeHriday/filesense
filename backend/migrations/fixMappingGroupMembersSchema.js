const { systemLogger } = require('../utils/logger');

/**
 * Fix mapping_group_members table schema
 * - Changes mapping_id from INTEGER to VARCHAR(255)
 * - Updates foreign key to reference transformation_mappings(mapping_id) instead of (id)
 */

async function fixMappingGroupMembersSchema(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    systemLogger.info('Starting mapping_group_members schema fix');
    
    // 1. Drop existing foreign key constraint if it exists
    await client.query(`
      ALTER TABLE mapping_group_members 
      DROP CONSTRAINT IF EXISTS mapping_group_members_mapping_id_fkey;
    `);
    systemLogger.info('✓ Dropped old foreign key constraint');
    
    // 2. Drop the index on mapping_id if it exists
    await client.query(`
      DROP INDEX IF EXISTS idx_mapping_group_members_mapping_id;
    `);
    
    // 3. Change mapping_id column type from INTEGER to VARCHAR(255)
    await client.query(`
      ALTER TABLE mapping_group_members 
      ALTER COLUMN mapping_id TYPE VARCHAR(255);
    `);
    systemLogger.info('✓ Changed mapping_id column type to VARCHAR(255)');
    
    // 4. Add new foreign key constraint referencing transformation_mappings(mapping_id)
    await client.query(`
      ALTER TABLE mapping_group_members 
      ADD CONSTRAINT mapping_group_members_mapping_id_fkey 
      FOREIGN KEY (mapping_id) REFERENCES transformation_mappings(mapping_id) ON DELETE CASCADE;
    `);
    systemLogger.info('✓ Added foreign key constraint to transformation_mappings(mapping_id)');
    
    // 5. Recreate the index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mapping_group_members_mapping_id 
      ON mapping_group_members(mapping_id);
    `);
    systemLogger.info('✓ Recreated index on mapping_id');
    
    await client.query('COMMIT');
    systemLogger.info('✓ Mapping group members schema fix completed successfully');
    
    return { success: true, message: 'Schema fix completed successfully' };
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error fixing mapping_group_members schema', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { fixMappingGroupMembersSchema };
