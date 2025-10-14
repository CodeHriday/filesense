const { Pool } = require('pg');

async function createAuditTables(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('Creating audit tables...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        audit_id BIGSERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
        
        user_id VARCHAR(255),
        user_email VARCHAR(255),
        user_role VARCHAR(100),
        ip_address INET,
        session_id VARCHAR(255),
        
        action_type VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(255) NOT NULL,
        entity_name VARCHAR(255),
        
        operation VARCHAR(50),
        old_values JSONB,
        new_values JSONB,
        changes JSONB,
        
        parent_audit_id BIGINT REFERENCES audit_log(audit_id),
        request_id VARCHAR(255),
        api_endpoint VARCHAR(255),
        http_method VARCHAR(10),
        
        status VARCHAR(50),
        error_message TEXT,
        
        metadata JSONB,
        retention_until TIMESTAMP,
        
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created audit_log table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action_type, timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_request ON audit_log(request_id);
    `);
    console.log('✓ Created audit_log indexes');

    await client.query(`
      CREATE TABLE IF NOT EXISTS execution_audit (
        audit_id BIGSERIAL PRIMARY KEY,
        execution_id VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
        
        execution_type VARCHAR(50),
        entity_id VARCHAR(255),
        entity_name VARCHAR(255),
        
        previous_status VARCHAR(50),
        new_status VARCHAR(50),
        status_reason TEXT,
        
        cpu_usage_percent DECIMAL(5,2),
        memory_usage_mb INTEGER,
        rows_processed BIGINT,
        records_affected BIGINT,
        
        quality_score DECIMAL(5,2),
        validation_errors JSONB,
        
        triggered_by_user VARCHAR(255),
        trigger_type VARCHAR(50),
        parent_execution_id VARCHAR(255),
        
        execution_duration_ms BIGINT,
        database_queries_count INTEGER,
        network_requests_count INTEGER,
        
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created execution_audit table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_execution_audit_execution ON execution_audit(execution_id, timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_execution_audit_entity ON execution_audit(execution_type, entity_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_execution_audit_status ON execution_audit(new_status, timestamp DESC);
    `);
    console.log('✓ Created execution_audit indexes');

    await client.query(`
      CREATE TABLE IF NOT EXISTS data_access_log (
        access_id BIGSERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
        
        user_id VARCHAR(255) NOT NULL,
        user_role VARCHAR(100),
        ip_address INET,
        
        access_type VARCHAR(50),
        file_id VARCHAR(255),
        file_name VARCHAR(255),
        table_name VARCHAR(255),
        column_names TEXT[],
        
        access_method VARCHAR(100),
        query_text TEXT,
        filters_applied JSONB,
        
        rows_accessed BIGINT,
        bytes_accessed BIGINT,
        
        access_purpose TEXT,
        project_name VARCHAR(255),
        
        contains_pii BOOLEAN DEFAULT FALSE,
        data_classification VARCHAR(50),
        
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created data_access_log table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_user ON data_access_log(user_id, timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_file ON data_access_log(file_id, timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_pii ON data_access_log(contains_pii, timestamp DESC) WHERE contains_pii = TRUE;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_timestamp ON data_access_log(timestamp DESC);
    `);
    console.log('✓ Created data_access_log indexes');

    await client.query(`
      CREATE TABLE IF NOT EXISTS config_change_history (
        change_id BIGSERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
        
        changed_by_user VARCHAR(255) NOT NULL,
        changed_by_role VARCHAR(100),
        
        config_type VARCHAR(100),
        entity_type VARCHAR(100),
        entity_id VARCHAR(255),
        
        field_name VARCHAR(255),
        old_value TEXT,
        new_value TEXT,
        
        change_reason TEXT,
        ticket_reference VARCHAR(100),
        
        requires_approval BOOLEAN DEFAULT FALSE,
        approved_by VARCHAR(255),
        approved_at TIMESTAMP,
        
        can_rollback BOOLEAN DEFAULT TRUE,
        rollback_script TEXT,
        
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created config_change_history table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_config_change_entity ON config_change_history(entity_type, entity_id, timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_config_change_user ON config_change_history(changed_by_user, timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_config_change_timestamp ON config_change_history(timestamp DESC);
    `);
    console.log('✓ Created config_change_history indexes');

    await client.query(`
      CREATE TABLE IF NOT EXISTS security_audit_log (
        security_audit_id BIGSERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
        
        event_type VARCHAR(100),
        severity VARCHAR(20),
        
        user_id VARCHAR(255),
        username VARCHAR(255),
        ip_address INET,
        user_agent TEXT,
        location JSONB,
        
        authentication_method VARCHAR(50),
        permission_required VARCHAR(100),
        permission_granted BOOLEAN,
        denial_reason TEXT,
        
        risk_score INTEGER,
        flags JSONB,
        
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created security_audit_log table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_security_audit_timestamp ON security_audit_log(timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_security_audit_user ON security_audit_log(user_id, timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_security_audit_severity ON security_audit_log(severity, timestamp DESC) 
        WHERE severity IN ('WARNING', 'CRITICAL');
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_security_audit_event ON security_audit_log(event_type, timestamp DESC);
    `);
    console.log('✓ Created security_audit_log indexes');

    await client.query('COMMIT');
    console.log('✅ All audit tables created successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating audit tables:', error);
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
    await createAuditTables(pool);
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

module.exports = { createAuditTables };
