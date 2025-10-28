/**
 * Migration: Add case-insensitive unique constraint on storage_connections.name
 * Ensures no duplicate connection names regardless of case
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');

async function addConnectionNameUniqueConstraint() {
  const client = await pool.connect();
  
  try {
    systemLogger.info('Starting connection name unique constraint migration');
    
    // Check if the index already exists
    const indexCheck = await client.query(`
      SELECT 1 FROM pg_indexes 
      WHERE indexname = 'idx_connections_name_unique_lower'
    `);
    
    if (indexCheck.rows.length > 0) {
      systemLogger.info('✓ Unique constraint on connection names already exists');
      return;
    }
    
    // Find any duplicate names (case-insensitive) before adding constraint
    const duplicates = await client.query(`
      SELECT LOWER(name) as lower_name, COUNT(*) as count, array_agg(name) as names, array_agg(connection_id) as ids
      FROM storage_connections
      GROUP BY LOWER(name)
      HAVING COUNT(*) > 1
    `);
    
    if (duplicates.rows.length > 0) {
      systemLogger.warn('Found duplicate connection names (case-insensitive)', {
        duplicates: duplicates.rows
      });
      
      // Auto-resolve duplicates by appending a suffix
      for (const dup of duplicates.rows) {
        const ids = dup.ids;
        // Keep the first one as-is, rename the rest
        for (let i = 1; i < ids.length; i++) {
          const newName = `${dup.names[i]}_${i}`;
          await client.query(
            'UPDATE storage_connections SET name = $1 WHERE connection_id = $2',
            [newName, ids[i]]
          );
          systemLogger.info(`Renamed duplicate connection: ${dup.names[i]} -> ${newName}`);
        }
      }
    }
    
    // Create unique index on LOWER(name)
    await client.query(`
      CREATE UNIQUE INDEX idx_connections_name_unique_lower 
      ON storage_connections(LOWER(name))
    `);
    
    systemLogger.info('✓ Added case-insensitive unique constraint on connection names');
    
  } catch (error) {
    systemLogger.error('Error adding connection name unique constraint', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if executed directly
if (require.main === module) {
  addConnectionNameUniqueConstraint()
    .then(() => {
      systemLogger.info('✅ Connection name unique constraint migration completed');
      process.exit(0);
    })
    .catch((error) => {
      systemLogger.error('❌ Migration failed', { error: error.message });
      process.exit(1);
    });
}

module.exports = { addConnectionNameUniqueConstraint };
