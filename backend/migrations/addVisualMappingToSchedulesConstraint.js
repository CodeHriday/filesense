/**
 * Migration: Add 'visual_mapping' to schedules entity_type CHECK constraint
 *
 * The original constraint only allowed:
 *   'mapping', 'mapping_group', 'workflow', 'vendor_agreement_expiration'
 *
 * This migration adds 'visual_mapping' so that VM mapping schedules can be saved.
 */

const pool = require('../db');

async function up() {
  await pool.query(`
    ALTER TABLE schedules
      DROP CONSTRAINT IF EXISTS schedules_entity_type_check,
      ADD CONSTRAINT schedules_entity_type_check
        CHECK (entity_type = ANY (ARRAY[
          'mapping',
          'mapping_group',
          'workflow',
          'vendor_agreement_expiration',
          'visual_mapping'
        ]::text[]))
  `);
  console.log('Migration complete: added visual_mapping to schedules_entity_type_check constraint');
}

up().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
