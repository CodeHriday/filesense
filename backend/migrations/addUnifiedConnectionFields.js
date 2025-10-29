const { systemLogger } = require('../utils/logger');

/**
 * Migration: Add Unified Connection Management Fields
 * 
 * Adds fields to support unified connection management:
 * - connection_user: Internal vs External connections
 * - description: Human-readable description
 * - authentication_method: Type of auth (key-based, IAM, OAuth, etc.)
 * - auth_config: Method-specific configuration (JSONB)
 */

async function up(client) {
  try {
    await client.query('BEGIN');
    systemLogger.info('Starting unified connection fields migration');

    // Add connection_user column (Internal/External)
    const userColumnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'storage_connections' 
      AND column_name = 'connection_user'
    `);

    if (userColumnCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE storage_connections 
        ADD COLUMN connection_user VARCHAR(20) DEFAULT 'Internal'
        CHECK (connection_user IN ('Internal', 'External'))
      `);
      systemLogger.info('✓ Added connection_user column');
    } else {
      systemLogger.info('✓ connection_user column already exists');
    }

    // Add description column
    const descColumnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'storage_connections' 
      AND column_name = 'description'
    `);

    if (descColumnCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE storage_connections 
        ADD COLUMN description TEXT
      `);
      systemLogger.info('✓ Added description column');
    } else {
      systemLogger.info('✓ description column already exists');
    }

    // Add authentication_method column
    const authMethodCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'storage_connections' 
      AND column_name = 'authentication_method'
    `);

    if (authMethodCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE storage_connections 
        ADD COLUMN authentication_method VARCHAR(50) DEFAULT 'key-based'
        CHECK (authentication_method IN (
          'key-based',
          'aws-iam-role',
          'gcp-sa-oidc',
          'azure-managed-identity',
          'db-short-lived-token',
          'oauth2',
          'kerberos'
        ))
      `);
      systemLogger.info('✓ Added authentication_method column');
    } else {
      systemLogger.info('✓ authentication_method column already exists');
    }

    // Add auth_config column for method-specific configuration
    const authConfigCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'storage_connections' 
      AND column_name = 'auth_config'
    `);

    if (authConfigCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE storage_connections 
        ADD COLUMN auth_config JSONB DEFAULT '{}'::jsonb
      `);
      systemLogger.info('✓ Added auth_config column');
    } else {
      systemLogger.info('✓ auth_config column already exists');
    }

    // Create index on connection_user for efficient filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_storage_connections_user 
      ON storage_connections(connection_user)
    `);
    systemLogger.info('✓ Created index on connection_user');

    // Create index on authentication_method
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_storage_connections_auth_method 
      ON storage_connections(authentication_method)
    `);
    systemLogger.info('✓ Created index on authentication_method');

    // Migrate existing vendor connections to connection_user='External'
    const updateResult = await client.query(`
      UPDATE storage_connections 
      SET connection_user = 'External'
      WHERE type = 'vendor'
    `);
    systemLogger.info(`✓ Migrated ${updateResult.rowCount} vendor connections to connection_user='External'`);

    await client.query('COMMIT');
    systemLogger.info('Unified connection fields migration completed successfully');
    
    return { 
      success: true, 
      message: 'Migration completed successfully',
      migratedCount: updateResult.rowCount
    };
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error in unified connection fields migration:', error);
    throw error;
  }
}

async function down(client) {
  try {
    await client.query('BEGIN');
    
    // Note: This rollback does NOT restore the connection_user='Internal' value
    // for previously migrated vendor connections, as we don't track the original state
    
    await client.query('DROP INDEX IF EXISTS idx_storage_connections_auth_method');
    await client.query('DROP INDEX IF EXISTS idx_storage_connections_user');
    await client.query('ALTER TABLE storage_connections DROP COLUMN IF EXISTS auth_config');
    await client.query('ALTER TABLE storage_connections DROP COLUMN IF EXISTS authentication_method');
    await client.query('ALTER TABLE storage_connections DROP COLUMN IF EXISTS description');
    await client.query('ALTER TABLE storage_connections DROP COLUMN IF EXISTS connection_user');
    
    await client.query('COMMIT');
    systemLogger.info('✓ Rolled back unified connection fields migration');
  } catch (error) {
    await client.query('ROLLBACK');
    systemLogger.error('Error rolling back unified connection fields migration:', error);
    throw error;
  }
}

module.exports = { up, down };
