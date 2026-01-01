const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function addDropLocationToProjects() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const checkColumnExists = async (columnName) => {
      const result = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = $1
      `, [columnName]);
      return result.rows.length > 0;
    };
    
    const bucketExists = await checkColumnExists('drop_location_bucket');
    if (!bucketExists) {
      await client.query(`
        ALTER TABLE projects 
        ADD COLUMN drop_location_bucket VARCHAR(255) NULL
      `);
      systemLogger.info('Added drop_location_bucket column to projects table');
    }
    
    const prefixExists = await checkColumnExists('drop_location_prefix');
    if (!prefixExists) {
      await client.query(`
        ALTER TABLE projects 
        ADD COLUMN drop_location_prefix VARCHAR(500) NULL
      `);
      systemLogger.info('Added drop_location_prefix column to projects table');
    }
    
    const connectionIdExists = await checkColumnExists('drop_location_connection_id');
    if (!connectionIdExists) {
      await client.query(`
        ALTER TABLE projects 
        ADD COLUMN drop_location_connection_id VARCHAR(100) NULL
      `);
      systemLogger.info('Added drop_location_connection_id column to projects table');
    }
    
    await client.query('COMMIT');
    systemLogger.info('Drop location migration completed successfully');
    
    return { success: true, message: 'Drop location columns added to projects table' };
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error in drop location migration', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { addDropLocationToProjects };

if (require.main === module) {
  addDropLocationToProjects()
    .then(result => {
      console.log('Migration result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
