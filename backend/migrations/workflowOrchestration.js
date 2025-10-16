const { systemLogger } = require('../utils/logger');

/**
 * Workflow Orchestration Enhancement Migration
 * - Creates mapping_groups and mapping_group_members tables
 * - Creates workflow_steps table for dependency management
 * - Enhances scheduler with cron support and multiple schedules
 */

async function initWorkflowOrchestrationTables(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    systemLogger.info('Starting workflow orchestration tables migration');
    
    // 1. Create mapping_groups table
    await client.query(`
      CREATE TABLE IF NOT EXISTS mapping_groups (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        max_concurrency INTEGER DEFAULT 10,
        created_by UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active'
      );
    `);
    systemLogger.info('✓ mapping_groups table created');
    
    // 2. Create mapping_group_members table (many-to-many relationship)
    await client.query(`
      CREATE TABLE IF NOT EXISTS mapping_group_members (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES mapping_groups(id) ON DELETE CASCADE,
        mapping_id INTEGER NOT NULL REFERENCES transformation_mappings(id) ON DELETE CASCADE,
        execution_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, mapping_id)
      );
    `);
    systemLogger.info('✓ mapping_group_members table created');
    
    // 3. Create workflow_steps table for dependency management
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_steps (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL REFERENCES business_processes(id) ON DELETE CASCADE,
        step_name TEXT NOT NULL,
        step_type TEXT NOT NULL CHECK (step_type IN ('mapping', 'mapping_group')),
        entity_id TEXT NOT NULL,
        depends_on INTEGER REFERENCES workflow_steps(id) ON DELETE SET NULL,
        retry_count INTEGER DEFAULT 3,
        retry_delay_seconds INTEGER DEFAULT 60,
        execution_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    systemLogger.info('✓ workflow_steps table created');
    
    // 4. Create enhanced schedules table (polymorphic for mappings, groups, workflows)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id SERIAL PRIMARY KEY,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('mapping', 'mapping_group', 'workflow')),
        entity_id TEXT NOT NULL,
        schedule_name TEXT,
        schedule_type TEXT NOT NULL CHECK (schedule_type IN ('cron', 'interval')),
        cron_expression TEXT,
        interval_value INTEGER,
        interval_unit TEXT CHECK (interval_unit IN ('minute', 'hour', 'day', 'week', 'month', 'year')),
        timezone TEXT DEFAULT 'UTC',
        is_active BOOLEAN DEFAULT true,
        last_run TIMESTAMP,
        next_run TIMESTAMP,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_cron CHECK (
          (schedule_type = 'cron' AND cron_expression IS NOT NULL) OR
          (schedule_type = 'interval' AND interval_value IS NOT NULL AND interval_unit IS NOT NULL)
        )
      );
    `);
    systemLogger.info('✓ schedules table created');
    
    // 5. Create mapping_group_executions table for tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS mapping_group_executions (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES mapping_groups(id) ON DELETE CASCADE,
        execution_id TEXT NOT NULL,
        status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
        total_mappings INTEGER DEFAULT 0,
        completed_mappings INTEGER DEFAULT 0,
        failed_mappings INTEGER DEFAULT 0,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        duration_ms INTEGER,
        triggered_by INTEGER,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    systemLogger.info('✓ mapping_group_executions table created');
    
    // 6. Create workflow_executions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_executions (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL REFERENCES business_processes(id) ON DELETE CASCADE,
        execution_id TEXT NOT NULL,
        status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
        current_step_id INTEGER REFERENCES workflow_steps(id),
        total_steps INTEGER DEFAULT 0,
        completed_steps INTEGER DEFAULT 0,
        failed_steps INTEGER DEFAULT 0,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        duration_ms INTEGER,
        triggered_by INTEGER,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    systemLogger.info('✓ workflow_executions table created');
    
    // 7. Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mapping_group_members_group_id ON mapping_group_members(group_id);
      CREATE INDEX IF NOT EXISTS idx_mapping_group_members_mapping_id ON mapping_group_members(mapping_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_depends_on ON workflow_steps(depends_on);
      CREATE INDEX IF NOT EXISTS idx_schedules_entity ON schedules(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_mapping_group_executions_group_id ON mapping_group_executions(group_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
    `);
    systemLogger.info('✓ Created indexes for all tables');
    
    await client.query('COMMIT');
    systemLogger.info('Workflow orchestration tables initialized successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error initializing workflow orchestration tables', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { initWorkflowOrchestrationTables };
