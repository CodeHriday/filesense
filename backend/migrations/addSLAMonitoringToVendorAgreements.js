/**
 * Add SLA Monitoring to Vendor Agreements Migration
 * Adds SLA monitoring fields to vendor_agreements table and creates vendor_sla_violations tracking table
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting SLA monitoring migration...');

    // Check if SLA columns already exist
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vendor_agreements' 
      AND column_name IN ('sla_enabled', 'frequency_pattern', 'arrival_time', 'arrival_days', 'alert_threshold_minutes')
    `);
    
    const existingColumns = columnCheck.rows.map(r => r.column_name);

    // Add sla_enabled column if not exists
    if (!existingColumns.includes('sla_enabled')) {
      await client.query(`
        ALTER TABLE vendor_agreements
        ADD COLUMN sla_enabled BOOLEAN DEFAULT false;
      `);
      systemLogger.info('✓ Added sla_enabled column to vendor_agreements');
    } else {
      systemLogger.info('⏭️  sla_enabled column already exists');
    }

    // Add frequency_pattern column if not exists
    if (!existingColumns.includes('frequency_pattern')) {
      await client.query(`
        ALTER TABLE vendor_agreements
        ADD COLUMN frequency_pattern VARCHAR(50);
      `);
      systemLogger.info('✓ Added frequency_pattern column to vendor_agreements');
    } else {
      systemLogger.info('⏭️  frequency_pattern column already exists');
    }

    // Add arrival_time column if not exists (stores time like "09:00")
    if (!existingColumns.includes('arrival_time')) {
      await client.query(`
        ALTER TABLE vendor_agreements
        ADD COLUMN arrival_time VARCHAR(10);
      `);
      systemLogger.info('✓ Added arrival_time column to vendor_agreements');
    } else {
      systemLogger.info('⏭️  arrival_time column already exists');
    }

    // Add arrival_days column if not exists (stores JSON array like ["Monday", "Wednesday"] or [1, 15])
    if (!existingColumns.includes('arrival_days')) {
      await client.query(`
        ALTER TABLE vendor_agreements
        ADD COLUMN arrival_days TEXT;
      `);
      systemLogger.info('✓ Added arrival_days column to vendor_agreements');
    } else {
      systemLogger.info('⏭️  arrival_days column already exists');
    }

    // Add alert_threshold_minutes column if not exists
    if (!existingColumns.includes('alert_threshold_minutes')) {
      await client.query(`
        ALTER TABLE vendor_agreements
        ADD COLUMN alert_threshold_minutes INTEGER DEFAULT 60;
      `);
      systemLogger.info('✓ Added alert_threshold_minutes column to vendor_agreements');
    } else {
      systemLogger.info('⏭️  alert_threshold_minutes column already exists');
    }

    // Create vendor_sla_violations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_sla_violations (
        id SERIAL PRIMARY KEY,
        agreement_id INTEGER NOT NULL REFERENCES vendor_agreements(id) ON DELETE CASCADE,
        expected_arrival_time TIMESTAMP NOT NULL,
        violation_detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
        alert_sent BOOLEAN DEFAULT false,
        alert_sent_at TIMESTAMP,
        resolved BOOLEAN DEFAULT false,
        resolved_at TIMESTAMP,
        file_id VARCHAR(255),
        actual_arrival_time TIMESTAMP,
        delay_minutes INTEGER,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    systemLogger.info('✓ Created vendor_sla_violations table');

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_agreements_sla_enabled 
      ON vendor_agreements(sla_enabled) WHERE sla_enabled = true;
    `);
    systemLogger.info('✓ Created index on sla_enabled');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_sla_violations_agreement_id 
      ON vendor_sla_violations(agreement_id);
    `);
    systemLogger.info('✓ Created index on vendor_sla_violations.agreement_id');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_sla_violations_resolved 
      ON vendor_sla_violations(resolved) WHERE resolved = false;
    `);
    systemLogger.info('✓ Created index on vendor_sla_violations.resolved');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_sla_violations_alert_sent 
      ON vendor_sla_violations(alert_sent) WHERE alert_sent = false;
    `);
    systemLogger.info('✓ Created index on vendor_sla_violations.alert_sent');

    await client.query('COMMIT');
    systemLogger.info('✅ SLA monitoring migration completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ SLA monitoring migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Reverting SLA monitoring migration...');

    // Drop indexes
    await client.query(`
      DROP INDEX IF EXISTS idx_vendor_sla_violations_alert_sent;
    `);
    await client.query(`
      DROP INDEX IF EXISTS idx_vendor_sla_violations_resolved;
    `);
    await client.query(`
      DROP INDEX IF EXISTS idx_vendor_sla_violations_agreement_id;
    `);
    await client.query(`
      DROP INDEX IF EXISTS idx_vendor_agreements_sla_enabled;
    `);

    // Drop vendor_sla_violations table
    await client.query(`
      DROP TABLE IF EXISTS vendor_sla_violations;
    `);

    // Remove SLA columns from vendor_agreements
    await client.query(`
      ALTER TABLE vendor_agreements
      DROP COLUMN IF EXISTS alert_threshold_minutes,
      DROP COLUMN IF EXISTS arrival_days,
      DROP COLUMN IF EXISTS frequency_pattern,
      DROP COLUMN IF EXISTS sla_enabled;
    `);

    await client.query('COMMIT');
    systemLogger.info('✅ SLA monitoring migration reverted successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('❌ SLA monitoring migration revert failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };

// Run migration if called directly
if (require.main === module) {
  up()
    .then(() => {
      systemLogger.info('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      systemLogger.error('Migration failed', { error: error.message });
      process.exit(1);
    });
}
