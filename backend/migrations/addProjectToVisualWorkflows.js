/**
 * Add project_id and sub_project_id to visual_workflows table
 * 
 * This migration adds project and subproject foreign keys to visual_workflows:
 * - project_id (references projects.id)
 * - sub_project_id (references projects.id, for subprojects)
 * 
 * Migration strategy:
 * 1. Add nullable project_id and sub_project_id columns
 * 2. Add foreign key constraints and indexes
 * 3. Existing workflows will have NULL project association until updated
 */

const { systemLogger } = require('../utils/logger');

async function addProjectToVisualWorkflows(client) {
  try {
    systemLogger.info('Starting visual workflows project migration');
    
    // Add project_id column if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'visual_workflows' AND column_name = 'project_id'
        ) THEN
          ALTER TABLE visual_workflows ADD COLUMN project_id INTEGER;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added project_id column to visual_workflows table');

    // Add sub_project_id column if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'visual_workflows' AND column_name = 'sub_project_id'
        ) THEN
          ALTER TABLE visual_workflows ADD COLUMN sub_project_id INTEGER;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added sub_project_id column to visual_workflows table');

    // Add foreign key constraint for project_id if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'visual_workflows_project_id_fkey'
        ) THEN
          ALTER TABLE visual_workflows 
          ADD CONSTRAINT visual_workflows_project_id_fkey 
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added foreign key constraint for project_id');

    // Add foreign key constraint for sub_project_id if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'visual_workflows_sub_project_id_fkey'
        ) THEN
          ALTER TABLE visual_workflows 
          ADD CONSTRAINT visual_workflows_sub_project_id_fkey 
          FOREIGN KEY (sub_project_id) REFERENCES projects(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added foreign key constraint for sub_project_id');

    // Create index on project_id if it doesn't exist
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_visual_workflows_project_id 
      ON visual_workflows(project_id);
    `);
    systemLogger.info('✓ Created index on project_id');

    // Create index on sub_project_id if it doesn't exist
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_visual_workflows_sub_project_id 
      ON visual_workflows(sub_project_id);
    `);
    systemLogger.info('✓ Created index on sub_project_id');

    systemLogger.info('✅ Visual workflows project migration completed successfully');
  } catch (error) {
    systemLogger.error('❌ Visual workflows project migration failed', { error: error.message });
    throw error;
  }
}

module.exports = { addProjectToVisualWorkflows };
