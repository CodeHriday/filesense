/**
 * Add project_id to remaining resource tables
 * 
 * This migration extends project isolation to:
 * - mapping_groups
 * - transformation_jobs
 * - mapping_group_executions
 * - workflow_executions
 * 
 * Strategy:
 * 1. Add project_id column
 * 2. Backfill with Default Project (id=1)
 * 3. Add foreign key constraints and indexes
 */

const { systemLogger } = require('../utils/logger');

async function addProjectIdToRemainingTables(client) {
  try {
    systemLogger.info('Starting project_id migration for remaining tables');
    await client.query('BEGIN');

    // Get Default Project ID
    const defaultProjectResult = await client.query(`
      SELECT id FROM projects WHERE is_default = TRUE LIMIT 1;
    `);
    
    if (defaultProjectResult.rows.length === 0) {
      throw new Error('Default Project not found. Run addProjectIdToResources migration first.');
    }
    
    const defaultProjectId = defaultProjectResult.rows[0].id;
    systemLogger.info('✓ Found Default Project', { projectId: defaultProjectId });

    // ===========================
    // mapping_groups table
    // ===========================
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'mapping_groups' AND column_name = 'project_id'
        ) THEN
          ALTER TABLE mapping_groups ADD COLUMN project_id INTEGER;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added project_id column to mapping_groups table');

    await client.query(`
      UPDATE mapping_groups SET project_id = $1 WHERE project_id IS NULL;
    `, [defaultProjectId]);
    systemLogger.info('✓ Backfilled mapping_groups with Default Project');

    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE mapping_groups ALTER COLUMN project_id SET NOT NULL;
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);
    
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE mapping_groups 
        ADD CONSTRAINT fk_mapping_groups_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mapping_groups_project_id ON mapping_groups(project_id);
    `);
    systemLogger.info('✓ Added foreign key and index for mapping_groups.project_id');

    // ===========================
    // transformation_jobs table
    // ===========================
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'transformation_jobs' AND column_name = 'project_id'
        ) THEN
          ALTER TABLE transformation_jobs ADD COLUMN project_id INTEGER;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added project_id column to transformation_jobs table');

    await client.query(`
      UPDATE transformation_jobs SET project_id = $1 WHERE project_id IS NULL;
    `, [defaultProjectId]);
    systemLogger.info('✓ Backfilled transformation_jobs with Default Project');

    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE transformation_jobs ALTER COLUMN project_id SET NOT NULL;
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);
    
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE transformation_jobs 
        ADD CONSTRAINT fk_transformation_jobs_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transformation_jobs_project_id ON transformation_jobs(project_id);
    `);
    systemLogger.info('✓ Added foreign key and index for transformation_jobs.project_id');

    // ===========================
    // mapping_group_executions table
    // ===========================
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'mapping_group_executions' AND column_name = 'project_id'
        ) THEN
          ALTER TABLE mapping_group_executions ADD COLUMN project_id INTEGER;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added project_id column to mapping_group_executions table');

    await client.query(`
      UPDATE mapping_group_executions SET project_id = $1 WHERE project_id IS NULL;
    `, [defaultProjectId]);
    systemLogger.info('✓ Backfilled mapping_group_executions with Default Project');

    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE mapping_group_executions ALTER COLUMN project_id SET NOT NULL;
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);
    
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE mapping_group_executions 
        ADD CONSTRAINT fk_mapping_group_executions_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mapping_group_executions_project_id ON mapping_group_executions(project_id);
    `);
    systemLogger.info('✓ Added foreign key and index for mapping_group_executions.project_id');

    // ===========================
    // workflow_executions table
    // ===========================
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'workflow_executions' AND column_name = 'project_id'
        ) THEN
          ALTER TABLE workflow_executions ADD COLUMN project_id INTEGER;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added project_id column to workflow_executions table');

    await client.query(`
      UPDATE workflow_executions SET project_id = $1 WHERE project_id IS NULL;
    `, [defaultProjectId]);
    systemLogger.info('✓ Backfilled workflow_executions with Default Project');

    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE workflow_executions ALTER COLUMN project_id SET NOT NULL;
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);
    
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE workflow_executions 
        ADD CONSTRAINT fk_workflow_executions_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_project_id ON workflow_executions(project_id);
    `);
    systemLogger.info('✓ Added foreign key and index for workflow_executions.project_id');

    await client.query('COMMIT');
    systemLogger.info('Project_id migration for remaining tables completed successfully');
    return { success: true, message: 'Migration completed successfully' };

  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error adding project_id to remaining tables', error);
    throw error;
  }
}

module.exports = { addProjectIdToRemainingTables };
