const { Pool } = require('pg');

async function createEmailAlertingSystem(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('Creating email alerting system tables...');

    // Alert Policies - defines when and how to send alerts
    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_policies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        
        -- Scope: what triggers this alert
        scope VARCHAR(50) NOT NULL CHECK (scope IN ('job', 'mapping_group', 'workflow', 'schedule')),
        entity_id VARCHAR(255), -- Optional: specific job/workflow ID, NULL = all entities of this scope
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        
        -- Trigger conditions
        trigger_type VARCHAR(50) NOT NULL CHECK (trigger_type IN ('success', 'failure', 'both')),
        
        -- Grouping strategy
        grouping VARCHAR(50) NOT NULL DEFAULT 'none' CHECK (grouping IN ('none', 'by_parent', 'digest')),
        grouping_window_minutes INTEGER DEFAULT 60, -- For digest grouping
        
        -- Email provider configuration
        email_connection_id INTEGER REFERENCES storage_connections(id) ON DELETE SET NULL,
        use_default_provider BOOLEAN DEFAULT true,
        
        -- Failover chain (array of connection IDs)
        failover_connection_ids INTEGER[],
        
        -- Features
        include_violations BOOLEAN DEFAULT true,
        max_attachment_size_mb INTEGER DEFAULT 10,
        
        -- Status
        is_active BOOLEAN DEFAULT true,
        
        -- Metadata
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created alert_policies table');

    // Alert Policy Recipients - who receives the alerts
    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_policy_recipients (
        id SERIAL PRIMARY KEY,
        policy_id INTEGER REFERENCES alert_policies(id) ON DELETE CASCADE,
        
        -- Recipient information
        recipient_type VARCHAR(50) NOT NULL CHECK (recipient_type IN ('user', 'distribution_list', 'external')),
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        
        -- Selective notifications
        notify_on_success BOOLEAN DEFAULT true,
        notify_on_failure BOOLEAN DEFAULT true,
        
        created_at TIMESTAMP DEFAULT NOW(),
        
        UNIQUE(policy_id, email)
      );
    `);
    console.log('✓ Created alert_policy_recipients table');

    // Alert Runs - tracks sent alert emails for auditing
    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_runs (
        id SERIAL PRIMARY KEY,
        run_id VARCHAR(255) UNIQUE NOT NULL, -- ALERT-timestamp-uuid
        policy_id INTEGER REFERENCES alert_policies(id) ON DELETE SET NULL,
        
        -- What was alerted
        related_entity_type VARCHAR(50), -- job, workflow, mapping_group, schedule
        related_entity_id VARCHAR(255), -- job_id, workflow run_id, etc.
        related_entity_name VARCHAR(255),
        
        -- Alert details
        alert_type VARCHAR(50), -- success, failure
        aggregated_count INTEGER DEFAULT 1, -- How many events in this alert
        
        -- Email delivery
        email_provider VARCHAR(100), -- smtp, sendgrid, ses, gmail_oauth2, outlook_oauth2
        sent_to TEXT[], -- Array of recipient emails
        subject VARCHAR(500),
        
        -- Status tracking
        status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        
        -- Payload
        email_payload JSONB, -- Complete email content for debugging
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW(),
        sent_at TIMESTAMP,
        failed_at TIMESTAMP
      );
    `);
    console.log('✓ Created alert_runs table');

    // Alert Events - individual events that may trigger alerts
    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_events (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(255) UNIQUE NOT NULL, -- EVENT-timestamp-uuid
        alert_run_id INTEGER REFERENCES alert_runs(id) ON DELETE SET NULL,
        
        -- Event source
        job_id VARCHAR(255),
        workflow_run_id INTEGER,
        mapping_group_execution_id INTEGER,
        schedule_id INTEGER,
        
        -- Event details
        event_type VARCHAR(50) NOT NULL, -- job_completed, job_failed, workflow_completed, etc.
        status VARCHAR(50) NOT NULL, -- success, failure
        message TEXT,
        
        -- Metrics
        duration_ms BIGINT,
        rows_processed BIGINT,
        rows_failed BIGINT,
        quality_score DECIMAL(5,2),
        violation_count INTEGER DEFAULT 0,
        
        -- Aggregation metadata
        aggregation_key VARCHAR(500), -- For grouping related events (e.g., workflow_run_id)
        aggregated BOOLEAN DEFAULT false, -- Has this been included in an alert?
        
        -- Metadata
        metadata JSONB,
        occurred_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created alert_events table');

    // Alert Aggregation - database-backed queue for environments without Redis
    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_aggregation (
        id SERIAL PRIMARY KEY,
        aggregation_key VARCHAR(500) NOT NULL, -- e.g., policy_123_workflow_run_456
        policy_id INTEGER REFERENCES alert_policies(id) ON DELETE CASCADE,
        
        -- Aggregation window
        window_start TIMESTAMP NOT NULL,
        window_end TIMESTAMP,
        flush_after TIMESTAMP, -- TTL for auto-flush
        
        -- Event collection
        event_ids INTEGER[], -- References alert_events.id
        event_count INTEGER DEFAULT 0,
        
        -- Status
        status VARCHAR(50) NOT NULL DEFAULT 'collecting' CHECK (status IN ('collecting', 'ready', 'processing', 'completed')),
        
        -- Metadata
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        
        UNIQUE(aggregation_key)
      );
    `);
    console.log('✓ Created alert_aggregation table');

    // Alert Attachments - tracks uploaded attachment files
    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_attachments (
        id SERIAL PRIMARY KEY,
        alert_run_id INTEGER REFERENCES alert_runs(id) ON DELETE CASCADE,
        
        -- File information
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50), -- csv, xlsx
        file_size_bytes BIGINT,
        
        -- Storage location
        storage_type VARCHAR(50), -- inline (attached directly), cloud (uploaded to S3/Azure/GCP)
        storage_path TEXT, -- Cloud storage path if applicable
        signed_url TEXT, -- Temporary download URL
        url_expires_at TIMESTAMP,
        
        -- Metadata
        row_count INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created alert_attachments table');

    // Create indexes for performance
    console.log('Creating indexes...');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_policies_scope ON alert_policies(scope, is_active);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_policies_project ON alert_policies(project_id) WHERE is_active = true;
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_policy_recipients_policy ON alert_policy_recipients(policy_id);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_runs_policy ON alert_runs(policy_id, created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_runs_entity ON alert_runs(related_entity_type, related_entity_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_runs_status ON alert_runs(status, created_at DESC);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_events_job ON alert_events(job_id) WHERE job_id IS NOT NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_events_workflow ON alert_events(workflow_run_id) WHERE workflow_run_id IS NOT NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_events_aggregation ON alert_events(aggregation_key, aggregated);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_events_occurred ON alert_events(occurred_at DESC);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_aggregation_key ON alert_aggregation(aggregation_key);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_aggregation_status ON alert_aggregation(status, flush_after);
    `);
    
    console.log('✓ Created all indexes');

    await client.query('COMMIT');
    console.log('✅ Email alerting system tables created successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating email alerting system tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { createEmailAlertingSystem };
