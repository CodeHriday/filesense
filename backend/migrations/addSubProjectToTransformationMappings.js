const { systemLogger } = require('../utils/logger');

/**
 * Add sub_project_id to transformation_mappings table
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Promise<void>}
 */
async function addSubProjectToTransformationMappings(pool) {
  try {
    systemLogger.info('Adding sub_project_id to transformation_mappings table');
    
    // Check if column already exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'transformation_mappings' 
      AND column_name = 'sub_project_id'
    `);
    
    if (columnCheck.rows.length > 0) {
      systemLogger.info('⏭️  sub_project_id column already exists in transformation_mappings');
      return;
    }
    
    // Add sub_project_id column (nullable, since it's optional)
    await pool.query(`
      ALTER TABLE transformation_mappings 
      ADD COLUMN sub_project_id INTEGER REFERENCES sub_projects(id) ON DELETE SET NULL
    `);
    
    systemLogger.info('✓ Added sub_project_id column to transformation_mappings table');
    
    // Add index for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transformation_mappings_sub_project_id 
      ON transformation_mappings(sub_project_id)
    `);
    
    systemLogger.info('✓ Created index for sub_project_id in transformation_mappings table');
    
  } catch (err) {
    systemLogger.error('Error adding sub_project_id to transformation_mappings:', err);
    throw err;
  }
}

module.exports = { addSubProjectToTransformationMappings };
