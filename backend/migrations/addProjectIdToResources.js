/**
 * Phase 1.2: Add project_id to resource tables
 * 
 * This migration adds project_id foreign keys to major resource tables:
 * - files
 * - workflow_steps (workflows)
 * - schedules
 * - transformation_mappings (transformations)
 * - storage_connections (connections)
 * 
 * Migration strategy:
 * 1. Create a "Default Project" if it doesn't exist
 * 2. Add project_id column to each table
 * 3. Backfill existing records with Default Project ID
 * 4. Make project_id NOT NULL
 * 5. Add foreign key constraints and indexes
 */

const { systemLogger } = require('../utils/logger');

async function addProjectIdToResources(client) {
  try {
    systemLogger.info('Starting project_id resource migration');
    await client.query('BEGIN');

    // ===========================
    // STEP 1: Ensure Default Project exists
    // ===========================
    const defaultProjectResult = await client.query(`
      INSERT INTO projects (name, description, is_default, is_active, created_at, updated_at)
      VALUES ('Default Project', 'Auto-created default workspace for existing resources', TRUE, TRUE, NOW(), NOW())
      ON CONFLICT DO NOTHING
      RETURNING id;
    `);
    
    let defaultProjectId;
    if (defaultProjectResult.rows.length > 0) {
      defaultProjectId = defaultProjectResult.rows[0].id;
      systemLogger.info('✓ Created Default Project', { projectId: defaultProjectId });
    } else {
      // Default project already exists, fetch its ID
      const existingProject = await client.query(`
        SELECT id FROM projects WHERE is_default = TRUE LIMIT 1;
      `);
      defaultProjectId = existingProject.rows[0].id;
      systemLogger.info('✓ Default Project already exists', { projectId: defaultProjectId });
    }

    // ===========================
    // STEP 2: Add project_id to files table
    // ===========================
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'files' AND column_name = 'project_id'
        ) THEN
          ALTER TABLE files ADD COLUMN project_id INTEGER;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added project_id column to files table');

    // Backfill existing files with default project
    await client.query(`
      UPDATE files SET project_id = $1 WHERE project_id IS NULL;
    `, [defaultProjectId]);
    systemLogger.info('✓ Backfilled files with Default Project');

    // Make NOT NULL and add foreign key
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE files ALTER COLUMN project_id SET NOT NULL;
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);
    
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE files 
        ADD CONSTRAINT fk_files_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);
    `);
    systemLogger.info('✓ Added foreign key and index for files.project_id');

    // ===========================
    // STEP 3: Add project_id to workflow_steps table
    // ===========================
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'workflow_steps' AND column_name = 'project_id'
        ) THEN
          ALTER TABLE workflow_steps ADD COLUMN project_id INTEGER;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added project_id column to workflow_steps table');

    await client.query(`
      UPDATE workflow_steps SET project_id = $1 WHERE project_id IS NULL;
    `, [defaultProjectId]);
    systemLogger.info('✓ Backfilled workflow_steps with Default Project');

    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE workflow_steps ALTER COLUMN project_id SET NOT NULL;
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);
    
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE workflow_steps 
        ADD CONSTRAINT fk_workflow_steps_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_project_id ON workflow_steps(project_id);
    `);
    systemLogger.info('✓ Added foreign key and index for workflow_steps.project_id');

    // ===========================
    // STEP 4: Add project_id to schedules table
    // ===========================
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'schedules' AND column_name = 'project_id'
        ) THEN
          ALTER TABLE schedules ADD COLUMN project_id INTEGER;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added project_id column to schedules table');

    await client.query(`
      UPDATE schedules SET project_id = $1 WHERE project_id IS NULL;
    `, [defaultProjectId]);
    systemLogger.info('✓ Backfilled schedules with Default Project');

    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE schedules ALTER COLUMN project_id SET NOT NULL;
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);
    
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE schedules 
        ADD CONSTRAINT fk_schedules_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_schedules_project_id ON schedules(project_id);
    `);
    systemLogger.info('✓ Added foreign key and index for schedules.project_id');

    // ===========================
    // STEP 5: Add project_id to transformation_mappings table
    // ===========================
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'transformation_mappings' AND column_name = 'project_id'
        ) THEN
          ALTER TABLE transformation_mappings ADD COLUMN project_id INTEGER;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added project_id column to transformation_mappings table');

    await client.query(`
      UPDATE transformation_mappings SET project_id = $1 WHERE project_id IS NULL;
    `, [defaultProjectId]);
    systemLogger.info('✓ Backfilled transformation_mappings with Default Project');

    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE transformation_mappings ALTER COLUMN project_id SET NOT NULL;
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);
    
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE transformation_mappings 
        ADD CONSTRAINT fk_transformation_mappings_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transformation_mappings_project_id ON transformation_mappings(project_id);
    `);
    systemLogger.info('✓ Added foreign key and index for transformation_mappings.project_id');

    // ===========================
    // STEP 6: Add project_id to storage_connections table
    // ===========================
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'storage_connections' AND column_name = 'project_id'
        ) THEN
          ALTER TABLE storage_connections ADD COLUMN project_id INTEGER;
        END IF;
      END $$;
    `);
    systemLogger.info('✓ Added project_id column to storage_connections table');

    await client.query(`
      UPDATE storage_connections SET project_id = $1 WHERE project_id IS NULL;
    `, [defaultProjectId]);
    systemLogger.info('✓ Backfilled storage_connections with Default Project');

    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE storage_connections ALTER COLUMN project_id SET NOT NULL;
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);
    
    await client.query(`
      DO $$ 
      BEGIN
        ALTER TABLE storage_connections 
        ADD CONSTRAINT fk_storage_connections_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_storage_connections_project_id ON storage_connections(project_id);
    `);
    systemLogger.info('✓ Added foreign key and index for storage_connections.project_id');

    await client.query('COMMIT');
    systemLogger.info('Project_id resource migration completed successfully');
    return { success: true, message: 'Migration completed successfully' };

  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error adding project_id to resource tables', error);
    throw error;
  }
}

module.exports = { addProjectIdToResources };
