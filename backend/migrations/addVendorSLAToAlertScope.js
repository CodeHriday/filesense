/**
 * Migration: Add 'vendor_sla' to alert_policies entity_type
 * 
 * Extends the alert system to support vendor SLA violation monitoring
 */

const { Pool } = require('pg');

async function addVendorSLAToAlertScope(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('Adding vendor_sla to alert_policies entity_type...');

    // Alter the CHECK constraint to include 'vendor_sla'
    await client.query(`
      ALTER TABLE alert_policies 
      DROP CONSTRAINT IF EXISTS alert_policies_entity_type_check;
    `);

    await client.query(`
      ALTER TABLE alert_policies 
      ADD CONSTRAINT alert_policies_entity_type_check 
      CHECK (entity_type IN ('job', 'mapping_group', 'workflow', 'schedule', 'vendor_sla'));
    `);

    console.log('✓ Added vendor_sla to alert_policies entity_type');

    // Add index for vendor_sla alerts
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_policies_vendor_sla 
      ON alert_policies(entity_type, entity_id) 
      WHERE entity_type = 'vendor_sla' AND enabled = true;
    `);

    console.log('✓ Created index for vendor_sla alerts');

    // Add vendor_sla_violation_id to alert_events for linkage
    await client.query(`
      ALTER TABLE alert_events 
      ADD COLUMN IF NOT EXISTS vendor_sla_violation_id INTEGER 
      REFERENCES vendor_sla_violations(id) ON DELETE SET NULL;
    `);

    console.log('✓ Added vendor_sla_violation_id column to alert_events');

    // Create index on vendor_sla_violation_id for fast lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alert_events_vendor_sla 
      ON alert_events(vendor_sla_violation_id) 
      WHERE vendor_sla_violation_id IS NOT NULL;
    `);

    console.log('✓ Created index on vendor_sla_violation_id');

    await client.query('COMMIT');
    console.log('✅ Vendor SLA alert entity_type added successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding vendor SLA alert entity_type:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { addVendorSLAToAlertScope };
