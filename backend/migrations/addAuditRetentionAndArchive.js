const { Pool } = require('pg');

async function addAuditRetentionAndArchive(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('Creating audit retention settings table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_retention_settings (
        id SERIAL PRIMARY KEY,
        retention_days INTEGER NOT NULL DEFAULT 30,
        auto_archive_enabled BOOLEAN DEFAULT TRUE,
        auto_delete_enabled BOOLEAN DEFAULT FALSE,
        last_archive_run TIMESTAMP,
        last_cleanup_run TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created audit_retention_settings table');

    await client.query(`
      INSERT INTO audit_retention_settings (retention_days, auto_archive_enabled, auto_delete_enabled)
      VALUES (30, TRUE, FALSE)
      ON CONFLICT DO NOTHING;
    `);
    console.log('✓ Inserted default retention settings');

    console.log('Creating archive tables...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log_archive (
        audit_id BIGINT PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL,
        
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
        
        parent_audit_id BIGINT,
        request_id VARCHAR(255),
        api_endpoint VARCHAR(255),
        http_method VARCHAR(10),
        
        status VARCHAR(50),
        error_message TEXT,
        
        metadata JSONB,
        retention_until TIMESTAMP,
        
        created_at TIMESTAMP,
        archived_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created audit_log_archive table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_archive_timestamp ON audit_log_archive(timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_archive_user ON audit_log_archive(user_id, timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_archive_archived ON audit_log_archive(archived_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS execution_audit_archive (
        audit_id BIGINT PRIMARY KEY,
        execution_id VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        
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
        created_at TIMESTAMP,
        archived_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created execution_audit_archive table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_execution_audit_archive_timestamp ON execution_audit_archive(timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_execution_audit_archive_archived ON execution_audit_archive(archived_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS data_access_log_archive (
        access_id BIGINT PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL,
        
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
        created_at TIMESTAMP,
        archived_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created data_access_log_archive table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_log_archive_timestamp ON data_access_log_archive(timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_log_archive_user ON data_access_log_archive(user_id, timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_data_access_log_archive_archived ON data_access_log_archive(archived_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS config_change_history_archive (
        change_id BIGINT PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL,
        
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
        created_at TIMESTAMP,
        archived_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created config_change_history_archive table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_config_change_history_archive_timestamp ON config_change_history_archive(timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_config_change_history_archive_archived ON config_change_history_archive(archived_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS security_audit_log_archive (
        security_audit_id BIGINT PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL,
        
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
        created_at TIMESTAMP,
        archived_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created security_audit_log_archive table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_security_audit_log_archive_timestamp ON security_audit_log_archive(timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_security_audit_log_archive_user ON security_audit_log_archive(user_id, timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_security_audit_log_archive_archived ON security_audit_log_archive(archived_at DESC);
    `);

    console.log('Creating frontend audit log table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS frontend_audit_log (
        audit_id BIGSERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
        
        user_id VARCHAR(255),
        user_email VARCHAR(255),
        session_id VARCHAR(255),
        
        event_type VARCHAR(100) NOT NULL,
        event_category VARCHAR(50),
        
        page_url VARCHAR(500),
        page_title VARCHAR(255),
        component_name VARCHAR(255),
        
        action_type VARCHAR(100),
        target_element VARCHAR(255),
        element_text TEXT,
        
        error_message TEXT,
        error_stack TEXT,
        error_component VARCHAR(255),
        
        api_endpoint VARCHAR(255),
        api_method VARCHAR(10),
        api_status_code INTEGER,
        api_error_message TEXT,
        
        browser_info JSONB,
        screen_resolution VARCHAR(50),
        viewport_size VARCHAR(50),
        
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created frontend_audit_log table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_frontend_audit_log_timestamp ON frontend_audit_log(timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_frontend_audit_log_user ON frontend_audit_log(user_id, timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_frontend_audit_log_event ON frontend_audit_log(event_type, timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_frontend_audit_log_error ON frontend_audit_log(timestamp DESC) WHERE error_message IS NOT NULL;
    `);
    console.log('✓ Created frontend_audit_log indexes');

    await client.query('COMMIT');
    console.log('✅ Audit retention and archive tables created successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating audit retention tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function runMigration() {
  let sslConfig = false;
  if (process.env.PGHOST?.includes('neon.tech')) {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      console.warn('⚠️  WARNING: TLS verification disabled for development/test environment');
      sslConfig = { rejectUnauthorized: false };
    } else {
      sslConfig = { rejectUnauthorized: true };
    }
  }
  
  const pool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: sslConfig
  });

  try {
    await addAuditRetentionAndArchive(pool);
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

module.exports = { addAuditRetentionAndArchive };
