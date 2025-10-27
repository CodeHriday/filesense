/**
 * Vendor Connections Migration
 * - Migrates existing drop_location_config to storage_connections as vendor type
 * - Adds support for multiple vendor connections
 */

const { pool } = require('../config/database');
const { systemLogger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

async function up() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting vendor connections migration...');

    // Check if there's an active drop location to migrate
    const dropLocationResult = await client.query(`
      SELECT * FROM drop_location_config WHERE is_active = true LIMIT 1
    `);

    if (dropLocationResult.rows.length > 0) {
      const dropLocation = dropLocationResult.rows[0];
      
      // Build config object based on provider
      const config = {
        provider: dropLocation.provider || 'aws',
        storage_type: dropLocation.storage_type || 's3'
      };

      // Add provider-specific fields
      if (config.provider === 'aws') {
        config.region = dropLocation.region;
        config.bucket = dropLocation.bucket;
        config.endpoint = dropLocation.endpoint;
        config.use_ssl = dropLocation.use_ssl;
        config.path_prefix = dropLocation.path_prefix;
        // Keep encrypted credentials
        config.access_key_id = dropLocation.access_key_id;
        config.secret_access_key = dropLocation.secret_access_key;
      } else if (config.provider === 'gcp') {
        config.project_id = dropLocation.project_id;
        config.gcp_bucket = dropLocation.gcp_bucket;
        config.path_prefix = dropLocation.path_prefix;
        // Keep encrypted credentials
        config.service_account_json = dropLocation.service_account_json;
      } else if (config.provider === 'azure') {
        config.account_name = dropLocation.account_name;
        config.container_name = dropLocation.container_name;
        config.azure_endpoint = dropLocation.azure_endpoint;
        config.path_prefix = dropLocation.path_prefix;
        // Keep encrypted credentials
        config.account_key = dropLocation.account_key;
      }

      // Check if this connection already exists in storage_connections
      const existingCheck = await client.query(`
        SELECT connection_id FROM storage_connections 
        WHERE type = 'vendor' 
        AND connection_direction = 'drop' 
        AND name = 'Default Vendor Drop Location'
      `);

      if (existingCheck.rows.length === 0) {
        // Ensure we have a valid project_id (required field)
        let projectId = dropLocation.project_id;
        
        if (!projectId) {
          // Get the default project or create one
          const defaultProject = await client.query(`
            SELECT id FROM projects WHERE name = 'Default Project' LIMIT 1
          `);
          
          if (defaultProject.rows.length > 0) {
            projectId = defaultProject.rows[0].id;
          } else {
            // Create a default project if it doesn't exist
            const newProject = await client.query(`
              INSERT INTO projects (name, description, created_at, updated_at)
              VALUES ('Default Project', 'Default project for vendor connections', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              RETURNING id
            `);
            projectId = newProject.rows[0].id;
            systemLogger.info('✓ Created default project for vendor connection');
          }
        }
        
        // Insert into storage_connections
        const connectionId = uuidv4();
        await client.query(`
          INSERT INTO storage_connections (
            connection_id, type, name, config, status, 
            connection_direction, project_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
          connectionId,
          'vendor',
          'Default Vendor Drop Location',
          JSON.stringify(config),
          'active',
          'drop',
          projectId
        ]);

        systemLogger.info('✓ Migrated drop location to vendor connection', { connectionId });
      } else {
        systemLogger.info('✓ Vendor connection already exists, skipping migration');
      }
    } else {
      systemLogger.info('✓ No active drop location found, skipping migration');
    }

    // Add index for faster vendor connection queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_storage_connections_vendor_type 
      ON storage_connections(type, connection_direction) 
      WHERE type = 'vendor' AND connection_direction = 'drop'
    `);
    systemLogger.info('✓ Created index for vendor connections');

    await client.query('COMMIT');
    systemLogger.info('Vendor connections migration completed successfully');
    
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Vendor connections migration failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    systemLogger.info('Rolling back vendor connections migration...');

    // Remove the index
    await client.query('DROP INDEX IF EXISTS idx_storage_connections_vendor_type');
    
    // Optionally remove migrated vendor connections
    // (commented out to prevent data loss)
    // await client.query(`
    //   DELETE FROM storage_connections 
    //   WHERE type = 'vendor' AND connection_direction = 'drop'
    // `);

    await client.query('COMMIT');
    systemLogger.info('Vendor connections migration rollback completed');
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Vendor connections migration rollback failed', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
