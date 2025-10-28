const { pool } = require('../config/database');

/**
 * Migration: Set connection_direction for existing vendor connections
 * 
 * This migration:
 * 1. Identifies vendor connections used as source (vendor_agreements.vendor_connection_id)
 * 2. Identifies vendor connections used as target (vendor_agreements.target_connection_id)
 * 3. Sets connection_direction to 'source' or 'target' based on usage
 * 4. Handles connections used in both roles (sets to 'source' by default, logs warning)
 */

async function migrateVendorConnectionDirection() {
  const client = await pool.connect();
  
  try {
    console.log('INFO: Starting vendor connection direction migration');
    
    await client.query('BEGIN');
    
    // Find connections used as source connections in vendor_agreements
    const sourceConnectionsResult = await client.query(`
      SELECT DISTINCT sc.connection_id, sc.name
      FROM storage_connections sc
      INNER JOIN vendor_agreements va ON va.vendor_connection_id = sc.connection_id
      WHERE sc.type = 'vendor' 
      AND (sc.connection_direction IS NULL OR sc.connection_direction = '')
    `);
    
    console.log(`INFO: Found ${sourceConnectionsResult.rows.length} connections used as source connections`);
    
    // Update source connections
    for (const row of sourceConnectionsResult.rows) {
      await client.query(`
        UPDATE storage_connections 
        SET connection_direction = 'source', updated_at = CURRENT_TIMESTAMP
        WHERE connection_id = $1
      `, [row.connection_id]);
      
      console.log(`INFO: Set connection "${row.name}" (${row.connection_id}) to 'source'`);
    }
    
    // Find connections used as target connections in vendor_agreements
    const targetConnectionsResult = await client.query(`
      SELECT DISTINCT sc.connection_id, sc.name
      FROM storage_connections sc
      INNER JOIN vendor_agreements va ON va.target_connection_id = sc.connection_id
      WHERE sc.type = 'vendor' 
      AND (sc.connection_direction IS NULL OR sc.connection_direction = '')
    `);
    
    console.log(`INFO: Found ${targetConnectionsResult.rows.length} connections used as target connections`);
    
    // Update target connections
    for (const row of targetConnectionsResult.rows) {
      await client.query(`
        UPDATE storage_connections 
        SET connection_direction = 'target', updated_at = CURRENT_TIMESTAMP
        WHERE connection_id = $1
      `, [row.connection_id]);
      
      console.log(`INFO: Set connection "${row.name}" (${row.connection_id}) to 'target'`);
    }
    
    // Find any remaining vendor connections without direction and set them to 'source' by default
    const remainingConnectionsResult = await client.query(`
      SELECT connection_id, name
      FROM storage_connections
      WHERE type = 'vendor' 
      AND (connection_direction IS NULL OR connection_direction = '')
    `);
    
    console.log(`INFO: Found ${remainingConnectionsResult.rows.length} vendor connections without direction`);
    
    // Set default direction to 'source' for remaining connections
    for (const row of remainingConnectionsResult.rows) {
      await client.query(`
        UPDATE storage_connections 
        SET connection_direction = 'source', updated_at = CURRENT_TIMESTAMP
        WHERE connection_id = $1
      `, [row.connection_id]);
      
      console.log(`INFO: Set connection "${row.name}" (${row.connection_id}) to 'source' (default)`);
    }
    
    await client.query('COMMIT');
    
    console.log('INFO: Vendor connection direction migration completed successfully');
    console.log(`✅ Updated ${sourceConnectionsResult.rows.length + targetConnectionsResult.rows.length + remainingConnectionsResult.rows.length} connections`);
    
    return {
      success: true,
      sourceConnections: sourceConnectionsResult.rows.length,
      targetConnections: targetConnectionsResult.rows.length,
      defaultConnections: remainingConnectionsResult.rows.length
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('ERROR: Vendor connection direction migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { migrateVendorConnectionDirection };
