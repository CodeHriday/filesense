/**
 * Add Lineage Columns Migration
 * 
 * Adds missing columns to transformation_lineage table:
 * - mapping_id: Links lineage to specific transformation mapping
 * - schema_fingerprint: Hash for detecting schema changes
 * - lineage_type: Distinguishes 'file-specific' vs 'pattern-based' lineage
 * - source_schema: JSONB field storing input file schema
 * - target_schema: JSONB field storing output file schema
 */

const { systemLogger } = require('../utils/logger');

/**
 * Add missing columns to transformation_lineage table
 * 
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Promise<void>}
 */
async function addLineageColumns(pool) {
  try {
    systemLogger.info('Starting lineage columns migration');
    
    // Add mapping_id column
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'transformation_lineage' AND column_name = 'mapping_id'
        ) THEN
          ALTER TABLE transformation_lineage ADD COLUMN mapping_id TEXT;
          RAISE NOTICE 'Added mapping_id column';
        ELSE
          RAISE NOTICE 'mapping_id column already exists';
        END IF;
      END $$;
    `);
    
    // Add schema_fingerprint column
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'transformation_lineage' AND column_name = 'schema_fingerprint'
        ) THEN
          ALTER TABLE transformation_lineage ADD COLUMN schema_fingerprint TEXT;
          RAISE NOTICE 'Added schema_fingerprint column';
        ELSE
          RAISE NOTICE 'schema_fingerprint column already exists';
        END IF;
      END $$;
    `);
    
    // Add lineage_type column
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'transformation_lineage' AND column_name = 'lineage_type'
        ) THEN
          ALTER TABLE transformation_lineage ADD COLUMN lineage_type VARCHAR(20) DEFAULT 'file-specific';
          RAISE NOTICE 'Added lineage_type column';
        ELSE
          RAISE NOTICE 'lineage_type column already exists';
        END IF;
      END $$;
    `);
    
    // Add source_schema column
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'transformation_lineage' AND column_name = 'source_schema'
        ) THEN
          ALTER TABLE transformation_lineage ADD COLUMN source_schema JSONB;
          RAISE NOTICE 'Added source_schema column';
        ELSE
          RAISE NOTICE 'source_schema column already exists';
        END IF;
      END $$;
    `);
    
    // Add target_schema column
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'transformation_lineage' AND column_name = 'target_schema'
        ) THEN
          ALTER TABLE transformation_lineage ADD COLUMN target_schema JSONB;
          RAISE NOTICE 'Added target_schema column';
        ELSE
          RAISE NOTICE 'target_schema column already exists';
        END IF;
      END $$;
    `);
    
    systemLogger.info('✓ Lineage columns migration completed successfully');
  } catch (error) {
    systemLogger.error('Error adding lineage columns', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

module.exports = addLineageColumns;
