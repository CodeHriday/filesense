const { Pool } = require('pg');
const crypto = require('crypto');

async function createImmutableAuditLedger(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('Creating immutable audit ledger tables...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_ledger (
        id BIGSERIAL PRIMARY KEY,
        entry_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        
        -- Tenant/Organization context
        tenant_id VARCHAR(255) DEFAULT 'default',
        
        -- Job/Correlation context
        job_id VARCHAR(255),
        correlation_id VARCHAR(255),
        parent_entry_id UUID,
        
        -- Actor information
        actor_id VARCHAR(255),
        actor_email VARCHAR(255),
        actor_role VARCHAR(100),
        actor_ip INET,
        
        -- Action details
        action_type VARCHAR(100) NOT NULL,
        action_category VARCHAR(50) NOT NULL DEFAULT 'EXECUTION',
        entity_type VARCHAR(100),
        entity_id VARCHAR(255),
        entity_name VARCHAR(500),
        
        -- Log level and content
        log_level VARCHAR(20) NOT NULL DEFAULT 'INFO',
        message TEXT NOT NULL,
        
        -- Detailed payload
        payload JSONB,
        
        -- Timestamps
        event_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        
        -- Hash chaining for immutability verification
        sequence_number BIGINT NOT NULL,
        prev_hash VARCHAR(64),
        record_hash VARCHAR(64) NOT NULL,
        
        -- Digital signature (optional, for external attestation)
        signature TEXT,
        signature_algorithm VARCHAR(50),
        
        -- Metadata
        source_system VARCHAR(100) DEFAULT 'data_observatory',
        version VARCHAR(20) DEFAULT '1.0'
      );
    `);
    console.log('✓ Created audit_ledger table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_ledger_job ON audit_ledger(job_id, sequence_number);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_ledger_correlation ON audit_ledger(correlation_id, sequence_number);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_ledger_actor ON audit_ledger(actor_id, event_timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_ledger_timestamp ON audit_ledger(event_timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_ledger_action ON audit_ledger(action_type, event_timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_ledger_entity ON audit_ledger(entity_type, entity_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_ledger_level ON audit_ledger(log_level, event_timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_ledger_tenant_seq ON audit_ledger(tenant_id, sequence_number DESC);
    `);
    console.log('✓ Created audit_ledger indexes');

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_ledger_sequence (
        tenant_id VARCHAR(255) PRIMARY KEY DEFAULT 'default',
        current_sequence BIGINT NOT NULL DEFAULT 0,
        last_hash VARCHAR(64),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created audit_ledger_sequence table');

    await client.query(`
      INSERT INTO audit_ledger_sequence (tenant_id, current_sequence, last_hash)
      VALUES ('default', 0, NULL)
      ON CONFLICT (tenant_id) DO NOTHING;
    `);
    console.log('✓ Initialized default tenant sequence');

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_ledger_verification (
        id SERIAL PRIMARY KEY,
        verification_id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL DEFAULT 'default',
        
        -- Verification window
        start_sequence BIGINT NOT NULL,
        end_sequence BIGINT NOT NULL,
        
        -- Verification result
        status VARCHAR(20) NOT NULL,
        entries_verified BIGINT NOT NULL DEFAULT 0,
        entries_failed BIGINT NOT NULL DEFAULT 0,
        
        -- Error details
        first_failed_sequence BIGINT,
        failure_reason TEXT,
        
        -- Timing
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP,
        duration_ms BIGINT,
        
        -- Who ran verification
        verified_by VARCHAR(255),
        
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✓ Created audit_ledger_verification table');

    await client.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_ledger_update()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Audit ledger entries are immutable and cannot be updated';
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS audit_ledger_immutable_update ON audit_ledger;
    `);
    
    await client.query(`
      CREATE TRIGGER audit_ledger_immutable_update
      BEFORE UPDATE ON audit_ledger
      FOR EACH ROW
      EXECUTE FUNCTION prevent_audit_ledger_update();
    `);
    console.log('✓ Created immutability trigger for UPDATE');

    await client.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_ledger_delete()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Audit ledger entries are immutable and cannot be deleted';
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS audit_ledger_immutable_delete ON audit_ledger;
    `);
    
    await client.query(`
      CREATE TRIGGER audit_ledger_immutable_delete
      BEFORE DELETE ON audit_ledger
      FOR EACH ROW
      EXECUTE FUNCTION prevent_audit_ledger_delete();
    `);
    console.log('✓ Created immutability trigger for DELETE');

    await client.query(`
      COMMENT ON TABLE audit_ledger IS 'Immutable audit ledger with cryptographic hash chaining for regulatory compliance. Records cannot be updated or deleted.';
    `);
    await client.query(`
      COMMENT ON COLUMN audit_ledger.prev_hash IS 'SHA-256 hash of the previous record in the chain, NULL for first record';
    `);
    await client.query(`
      COMMENT ON COLUMN audit_ledger.record_hash IS 'SHA-256 hash of this record including prev_hash for tamper detection';
    `);
    await client.query(`
      COMMENT ON COLUMN audit_ledger.sequence_number IS 'Monotonically increasing sequence number per tenant for ordering';
    `);
    console.log('✓ Added table comments');

    await client.query('COMMIT');
    console.log('✅ Immutable audit ledger created successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating immutable audit ledger:', error);
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
    await createImmutableAuditLedger(pool);
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

module.exports = { createImmutableAuditLedger };
