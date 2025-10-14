const { Pool } = require('pg');

async function createJobDependencyTables(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('Creating job dependency and DBT tables...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS job_dependencies (
        dependency_id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL REFERENCES file_schedules(id) ON DELETE CASCADE,
        depends_on_job_id INTEGER NOT NULL REFERENCES file_schedules(id) ON DELETE CASCADE,
        
        dependency_type VARCHAR(50) DEFAULT 'completion',
        
        wait_for_success BOOLEAN DEFAULT TRUE,
        optional_dependency BOOLEAN DEFAULT FALSE,
        
        timeout_minutes INTEGER,
        
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        
        CONSTRAINT no_self_dependency CHECK (job_id != depends_on_job_id),
        CONSTRAINT unique_job_dependency UNIQUE (job_id, depends_on_job_id)
      );
    `);
    console.log('✓ Created job_dependencies table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_job_dependencies_job ON job_dependencies(job_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_job_dependencies_depends_on ON job_dependencies(depends_on_job_id);
    `);
    console.log('✓ Created job_dependencies indexes');

    await client.query(`
      CREATE TABLE IF NOT EXISTS job_group_schedules (
        group_schedule_id SERIAL PRIMARY KEY,
        group_id UUID NOT NULL REFERENCES job_groups(id) ON DELETE CASCADE,
        
        schedule_name VARCHAR(255) NOT NULL,
        schedule_type VARCHAR(50) NOT NULL,
        cron_expression VARCHAR(100),
        
        enabled BOOLEAN DEFAULT TRUE,
        
        execution_order VARCHAR(50) DEFAULT 'parallel',
        max_concurrent_jobs INTEGER DEFAULT 5,
        
        retry_policy JSONB DEFAULT '{"maxRetries": 3, "retryDelay": 300}',
        
        notification_settings JSONB,
        
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        
        CONSTRAINT valid_schedule_type CHECK (schedule_type IN ('cron', 'interval', 'manual')),
        CONSTRAINT valid_execution_order CHECK (execution_order IN ('parallel', 'sequential', 'dependency-based'))
      );
    `);
    console.log('✓ Created job_group_schedules table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_job_group_schedules_group ON job_group_schedules(group_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_job_group_schedules_enabled ON job_group_schedules(enabled) WHERE enabled = TRUE;
    `);
    console.log('✓ Created job_group_schedules indexes');

    await client.query(`
      CREATE TABLE IF NOT EXISTS job_group_dependencies (
        group_dependency_id SERIAL PRIMARY KEY,
        group_id UUID NOT NULL REFERENCES job_groups(id) ON DELETE CASCADE,
        depends_on_group_id UUID NOT NULL REFERENCES job_groups(id) ON DELETE CASCADE,
        
        dependency_type VARCHAR(50) DEFAULT 'all_success',
        
        wait_for_all_jobs BOOLEAN DEFAULT TRUE,
        
        timeout_minutes INTEGER,
        
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        
        CONSTRAINT no_self_group_dependency CHECK (group_id != depends_on_group_id),
        CONSTRAINT unique_group_dependency UNIQUE (group_id, depends_on_group_id),
        CONSTRAINT valid_dependency_type CHECK (dependency_type IN ('all_success', 'any_success', 'all_complete'))
      );
    `);
    console.log('✓ Created job_group_dependencies table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_job_group_dependencies_group ON job_group_dependencies(group_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_job_group_dependencies_depends_on ON job_group_dependencies(depends_on_group_id);
    `);
    console.log('✓ Created job_group_dependencies indexes');

    await client.query(`
      CREATE TABLE IF NOT EXISTS dbt_models (
        model_id SERIAL PRIMARY KEY,
        model_name VARCHAR(255) NOT NULL UNIQUE,
        model_path VARCHAR(500) NOT NULL,
        
        model_type VARCHAR(50),
        materialization VARCHAR(50),
        
        description TEXT,
        tags TEXT[],
        
        upstream_models TEXT[],
        downstream_models TEXT[],
        
        source_tables TEXT[],
        
        last_compiled_at TIMESTAMP,
        last_run_at TIMESTAMP,
        last_run_status VARCHAR(50),
        last_run_duration_ms BIGINT,
        
        row_count BIGINT,
        byte_size BIGINT,
        
        config JSONB,
        metadata JSONB,
        
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        
        CONSTRAINT valid_model_type CHECK (model_type IN ('staging', 'intermediate', 'mart', 'snapshot', 'seed')),
        CONSTRAINT valid_materialization CHECK (materialization IN ('table', 'view', 'incremental', 'ephemeral'))
      );
    `);
    console.log('✓ Created dbt_models table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dbt_models_name ON dbt_models(model_name);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dbt_models_type ON dbt_models(model_type);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dbt_models_status ON dbt_models(last_run_status);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dbt_models_updated ON dbt_models(updated_at DESC);
    `);
    console.log('✓ Created dbt_models indexes');

    await client.query(`
      CREATE TABLE IF NOT EXISTS dbt_executions (
        execution_id SERIAL PRIMARY KEY,
        execution_uuid VARCHAR(255) NOT NULL UNIQUE,
        
        command VARCHAR(255) NOT NULL,
        models_selector VARCHAR(255),
        
        triggered_by VARCHAR(255),
        trigger_type VARCHAR(50),
        
        status VARCHAR(50) DEFAULT 'pending',
        
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        duration_ms BIGINT,
        
        models_run INTEGER DEFAULT 0,
        models_success INTEGER DEFAULT 0,
        models_failed INTEGER DEFAULT 0,
        models_skipped INTEGER DEFAULT 0,
        
        tests_run INTEGER DEFAULT 0,
        tests_passed INTEGER DEFAULT 0,
        tests_failed INTEGER DEFAULT 0,
        
        results JSONB,
        logs TEXT,
        error_message TEXT,
        
        metadata JSONB,
        
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        
        CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'success', 'failed', 'cancelled')),
        CONSTRAINT valid_trigger_type CHECK (trigger_type IN ('manual', 'scheduled', 'api', 'dependency'))
      );
    `);
    console.log('✓ Created dbt_executions table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dbt_executions_uuid ON dbt_executions(execution_uuid);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dbt_executions_status ON dbt_executions(status);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dbt_executions_created ON dbt_executions(created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dbt_executions_triggered_by ON dbt_executions(triggered_by);
    `);
    console.log('✓ Created dbt_executions indexes');

    await client.query('COMMIT');
    console.log('✅ All job dependency and DBT tables created successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating job dependency tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function runMigration() {
  const pool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: process.env.PGHOST?.includes('neon.tech') ? { rejectUnauthorized: false } : false
  });

  try {
    await createJobDependencyTables(pool);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { createJobDependencyTables };
