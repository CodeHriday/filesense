const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function addProjectIdToConnections() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Starting migration: Add project_id to connection and scheduler tables...');
    
    // Note: storage_connections and schedules already have project_id
    
    // 1. Add project_id to transform_connections
    console.log('Adding project_id to transform_connections...');
    await client.query(`
      ALTER TABLE transform_connections 
      ADD COLUMN IF NOT EXISTS project_id INTEGER;
    `);
    
    await client.query(`
      UPDATE transform_connections 
      SET project_id = 1 
      WHERE project_id IS NULL;
    `);
    
    await client.query(`
      ALTER TABLE transform_connections 
      ALTER COLUMN project_id SET NOT NULL;
    `);
    
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_transform_connections_project'
        ) THEN
          ALTER TABLE transform_connections 
          ADD CONSTRAINT fk_transform_connections_project 
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    
    console.log('✓ transform_connections updated');
    
    // 2. Add project_id to file_schedules
    console.log('Adding project_id to file_schedules...');
    await client.query(`
      ALTER TABLE file_schedules 
      ADD COLUMN IF NOT EXISTS project_id INTEGER;
    `);
    
    await client.query(`
      UPDATE file_schedules 
      SET project_id = 1 
      WHERE project_id IS NULL;
    `);
    
    await client.query(`
      ALTER TABLE file_schedules 
      ALTER COLUMN project_id SET NOT NULL;
    `);
    
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_file_schedules_project'
        ) THEN
          ALTER TABLE file_schedules 
          ADD CONSTRAINT fk_file_schedules_project 
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    
    console.log('✓ file_schedules updated');
    
    // 3. Add project_id to job_schedules (legacy)
    console.log('Adding project_id to job_schedules...');
    await client.query(`
      ALTER TABLE job_schedules 
      ADD COLUMN IF NOT EXISTS project_id INTEGER;
    `);
    
    await client.query(`
      UPDATE job_schedules 
      SET project_id = 1 
      WHERE project_id IS NULL;
    `);
    
    await client.query(`
      ALTER TABLE job_schedules 
      ALTER COLUMN project_id SET NOT NULL;
    `);
    
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_job_schedules_project'
        ) THEN
          ALTER TABLE job_schedules 
          ADD CONSTRAINT fk_job_schedules_project 
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    
    console.log('✓ job_schedules updated');
    
    // 4. Add project_id to job_group_schedules (legacy)
    console.log('Adding project_id to job_group_schedules...');
    await client.query(`
      ALTER TABLE job_group_schedules 
      ADD COLUMN IF NOT EXISTS project_id INTEGER;
    `);
    
    await client.query(`
      UPDATE job_group_schedules 
      SET project_id = 1 
      WHERE project_id IS NULL;
    `);
    
    await client.query(`
      ALTER TABLE job_group_schedules 
      ALTER COLUMN project_id SET NOT NULL;
    `);
    
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_job_group_schedules_project'
        ) THEN
          ALTER TABLE job_group_schedules 
          ADD CONSTRAINT fk_job_group_schedules_project 
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    
    console.log('✓ job_group_schedules updated');
    
    await client.query('COMMIT');
    
    console.log('\n✅ Migration completed successfully!');
    console.log('All connection and scheduler tables now have project_id column');
    console.log('All existing records assigned to Default Project (id = 1)');
    
    // Display summary
    const summary = await client.query(`
      SELECT 
        'transform_connections' as table_name,
        COUNT(*) as total_records,
        COUNT(CASE WHEN project_id = 1 THEN 1 END) as default_project_records
      FROM transform_connections
      UNION ALL
      SELECT 
        'file_schedules',
        COUNT(*),
        COUNT(CASE WHEN project_id = 1 THEN 1 END)
      FROM file_schedules
      UNION ALL
      SELECT 
        'job_schedules',
        COUNT(*),
        COUNT(CASE WHEN project_id = 1 THEN 1 END)
      FROM job_schedules
      UNION ALL
      SELECT 
        'job_group_schedules',
        COUNT(*),
        COUNT(CASE WHEN project_id = 1 THEN 1 END)
      FROM job_group_schedules;
    `);
    
    console.log('\nMigration Summary:');
    console.table(summary.rows);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
if (require.main === module) {
  addProjectIdToConnections()
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { addProjectIdToConnections };
