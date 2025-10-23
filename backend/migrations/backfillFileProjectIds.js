/**
 * Backfill project_id for existing files
 * Assigns all files with NULL project_id to the Default Project
 */

const pool = require('../db');
const { systemLogger } = require('../utils/logger');

async function backfillFileProjectIds() {
  const client = await pool.connect();
  
  try {
    systemLogger.info('Starting project_id backfill for files...');
    
    // Get or create Default Project
    let defaultProject = await client.query(
      `SELECT id FROM projects WHERE name = 'Default Project' LIMIT 1`
    );
    
    let defaultProjectId;
    
    if (defaultProject.rows.length === 0) {
      systemLogger.info('Creating Default Project...');
      const newProject = await client.query(
        `INSERT INTO projects (name, description, created_at, updated_at) 
         VALUES ('Default Project', 'Auto-created project for legacy data migration', NOW(), NOW())
         RETURNING id`
      );
      defaultProjectId = newProject.rows[0].id;
      systemLogger.info(`Created Default Project with id: ${defaultProjectId}`);
    } else {
      defaultProjectId = defaultProject.rows[0].id;
      systemLogger.info(`Found existing Default Project with id: ${defaultProjectId}`);
    }
    
    // Update all files with NULL project_id
    const result = await client.query(
      `UPDATE files 
       SET project_id = $1, updated_at = NOW()
       WHERE project_id IS NULL`,
      [defaultProjectId]
    );
    
    systemLogger.info(`Backfilled project_id for ${result.rowCount} files`);
    
    return {
      success: true,
      filesUpdated: result.rowCount,
      defaultProjectId
    };
    
  } catch (error) {
    systemLogger.error('Error backfilling file project_ids:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  backfillFileProjectIds()
    .then(result => {
      console.log('Backfill completed:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Backfill failed:', error);
      process.exit(1);
    });
}

module.exports = { backfillFileProjectIds };
