/**
 * Migration script to import existing Transform connections into shared connections table
 * This script should be run once to populate the transform_connections table
 * with connections from the Transform application.
 */

const db = require('../config/database');

async function migrateTransformConnections(dbPool) {
  const pool = dbPool || db.pool;
  const client = await pool.connect();
  try {
    console.log('Starting migration of Transform connections...');
    await client.query('BEGIN');

    // Verify if transform_connections table exists, create it if not
    await client.query(`
      CREATE TABLE IF NOT EXISTS transform_connections (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        config JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        last_used_at TIMESTAMP,
        description TEXT,
        source_application VARCHAR(50),
        shared BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE
      )
    `);

    // Check if Transform application has a storage_connections table
    const tableCheckResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'storage_connections'
      )
    `);

    const transformTableExists = tableCheckResult.rows[0].exists;

    if (!transformTableExists) {
      console.log('Transform storage_connections table not found, skipping migration');
      await client.query('COMMIT');
      return 0;
    }
    
    // Check the structure of the storage_connections table
    const columnCheckResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'storage_connections'
    `);
    
    const columns = columnCheckResult.rows.map(row => row.column_name);
    const hasIsActiveColumn = columns.includes('is_active');
    
    console.log('Available columns in storage_connections:', columns.join(', '));
    
    // Get list of connections from transform storage_connections table
    let transformConnections = [];
    // Check if status column exists
    const hasStatusColumn = columns.includes('status');
    
    if (hasStatusColumn) {
      // If status column exists, only fetch active connections (exclude vendor connections)
      const result = await client.query(`
        SELECT * FROM storage_connections 
        WHERE status = 'active' 
        AND (type != 'vendor' OR type IS NULL)
      `);
      transformConnections = result.rows;
      console.log(`Found ${transformConnections.length} active connections in Transform`);
    } else {
      // Otherwise, fetch all connections (exclude vendor connections)
      const result = await client.query(`
        SELECT * FROM storage_connections 
        WHERE (type != 'vendor' OR type IS NULL)
      `);
      transformConnections = result.rows;
      console.log(`Found ${transformConnections.length} connections in Transform (status unknown)`);
    }

    if (transformConnections.length === 0) {
      console.log('No active connections found in Transform storage_connections table');
      await client.query('COMMIT');
      return 0;
    }

    console.log(`Found ${transformConnections.length} connections to migrate`);

    // Check which connections are already migrated
    const existingConnections = await client.query(`
      SELECT name FROM transform_connections 
      WHERE source_application = 'transform'
    `);

    const existingNames = existingConnections.rows.map(c => c.name.toLowerCase());
    let migratedCount = 0;

    // Migrate each connection
    for (const connection of transformConnections) {
      // Skip if connection with same name already exists
      const connectionName = connection.name || connection.connection_name;
      if (!connectionName) {
        console.log('Connection without name found, skipping');
        continue;
      }
      
      if (existingNames.includes(connectionName.toLowerCase())) {
        console.log(`Connection '${connectionName}' already exists, skipping`);
        continue;
      }

      // Prepare config object
      let config = {};
      
      const connectionType = connection.type || connection.connection_type;
      
      if (!connectionType) {
        console.log('Connection without type found, skipping');
        continue;
      }
      
      // Check if there's a config field and try to use it directly
      if (connection.config) {
        if (typeof connection.config === 'string') {
          try {
            config = JSON.parse(connection.config);
          } catch (e) {
            console.log(`Error parsing config JSON for ${connectionName}: ${e.message}`);
            // Continue with empty config
          }
        } else {
          // If it's already an object, use it directly
          config = connection.config;
        }
      }
      
      // If the config is still empty or doesn't have crucial fields, fall back to individual fields
      if (Object.keys(config).length === 0) {
        if (connectionType === 'aws') {
          config.region = connection.region || 'us-east-1';
          config.bucket_name = connection.bucket_name || 'unknown-bucket';
          config.access_key = connection.access_key;
          // Don't copy secret keys for security reasons
        } else if (connectionType === 'gcp') {
          config.project_id = connection.project_id;
          config.bucket_name = connection.bucket_name;
          config.client_email = connection.client_email;
          // Don't copy private keys for security reasons
        } else if (connectionType === 'azure') {
          config.account_name = connection.account_name;
          config.container_name = connection.container_name;
          // Don't copy account keys for security reasons
        } else if (connectionType === 'snowflake') {
          config.snowflake_account = connection.snowflake_account;
          config.snowflake_username = connection.snowflake_username;
          config.snowflake_warehouse = connection.snowflake_warehouse;
          config.snowflake_database = connection.snowflake_database;
          config.snowflake_schema = connection.snowflake_schema;
          config.snowflake_role = connection.snowflake_role;
          // Don't copy passwords for security reasons
        }
      }
      
      console.log(`Prepared config for ${connectionName} with properties: ${Object.keys(config).join(', ')}`)

      // Insert into transform_connections table with source='transform'
      await client.query(`
        INSERT INTO transform_connections (
          name, 
          type, 
          config, 
          created_at,
          updated_at,
          created_by,
          last_used_at,
          description,
          source_application,
          shared,
          is_active,
          project_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        connectionName,
        connectionType,
        config,
        connection.created_at || new Date(),
        connection.updated_at || new Date(),
        connection.created_by,
        connection.last_used_at,
        connection.description,
        'transform',  // Mark as from Transform app
        true,         // Mark as shared
        true,         // Mark as active
        1             // Default project ID
      ]);

      console.log(`Migrated connection: ${connectionName}`);
      migratedCount++;
    }

    await client.query('COMMIT');
    console.log(`Migration complete. Migrated ${migratedCount} connections.`);
    return migratedCount;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error migrating Transform connections:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { migrateTransformConnections };

// Execute migration if this script is run directly
if (require.main === module) {
  migrateTransformConnections()
    .then(count => {
      console.log(`Migration completed successfully. Migrated ${count} connections.`);
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
