const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Migration script to consolidate transform_connections into storage_connections
 * All migrated connections will have connection_user = 'Internal'
 */
async function migrateTransformToStorageConnections() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Starting migration of transform_connections to storage_connections...');
    
    // Get all active connections from transform_connections
    const result = await client.query(`
      SELECT 
        id,
        name,
        type,
        config,
        is_active,
        created_at,
        updated_at,
        created_by,
        last_used_at,
        description,
        project_id
      FROM transform_connections
      WHERE is_active = true
      ORDER BY id
    `);
    
    const transformConnections = result.rows;
    console.log(`Found ${transformConnections.length} transform connections to migrate`);
    
    if (transformConnections.length === 0) {
      console.log('No connections to migrate');
      await client.query('COMMIT');
      return { success: true, migrated: 0 };
    }
    
    let migratedCount = 0;
    
    for (const conn of transformConnections) {
      const connectionId = uuidv4();
      const config = conn.config || {};
      
      // Extract connection_direction from config, default to 'source'
      const connectionDirection = config.connection_direction || 'source';
      
      // Determine authentication method (all existing connections use key-based)
      const authenticationMethod = 'key-based';
      
      // Map is_active to status
      const status = conn.is_active ? 'active' : 'inactive';
      
      // Insert into storage_connections
      await client.query(`
        INSERT INTO storage_connections (
          connection_id,
          type,
          name,
          config,
          status,
          created_at,
          updated_at,
          connection_direction,
          project_id,
          connection_user,
          description,
          authentication_method,
          auth_config
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        connectionId,
        conn.type,
        conn.name,
        config,
        status,
        conn.created_at,
        conn.updated_at,
        connectionDirection,
        conn.project_id,
        'Internal', // All migrated connections are Internal
        conn.description || null,
        authenticationMethod,
        {} // Empty auth_config for now
      ]);
      
      migratedCount++;
      console.log(`Migrated: ${conn.name} (ID: ${conn.id} → ${connectionId})`);
    }
    
    await client.query('COMMIT');
    console.log(`\nMigration complete! Migrated ${migratedCount} connections`);
    console.log('All transform_connections are now in storage_connections with connection_user="Internal"');
    
    return { success: true, migrated: migratedCount };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateTransformToStorageConnections()
    .then(result => {
      console.log('\n✓ Migration completed successfully');
      console.log(`Migrated ${result.migrated} connections`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ Migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = { migrateTransformToStorageConnections };
