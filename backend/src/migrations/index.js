/**
 * Database migration system
 * 
 * This module provides a simple migration system for managing database schema changes.
 */
const db = require('../config/database');

// Migration functions
const migrations = [
  {
    name: '001_initial_schema',
    up: async (client) => {
      // Create users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(36) PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password VARCHAR(100) NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          first_name VARCHAR(50),
          last_name VARCHAR(50),
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL,
          last_login TIMESTAMP
        )
      `);

      // Create roles table
      await client.query(`
        CREATE TABLE IF NOT EXISTS roles (
          id SERIAL PRIMARY KEY,
          name VARCHAR(50) UNIQUE NOT NULL,
          permissions JSONB,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        )
      `);

      // Create permissions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS permissions (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) UNIQUE NOT NULL,
          resource VARCHAR(50) NOT NULL,
          action VARCHAR(50) NOT NULL,
          description TEXT,
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        )
      `);
      
      // Create user_roles junction table
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_roles (
          user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
          role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
          created_at TIMESTAMP NOT NULL,
          PRIMARY KEY (user_id, role_id)
        )
      `);
      
      // Create role_permissions junction table
      await client.query(`
        CREATE TABLE IF NOT EXISTS role_permissions (
          role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
          permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
          created_at TIMESTAMP NOT NULL,
          PRIMARY KEY (role_id, permission_id)
        )
      `);
      
      // Create refresh_tokens table
      await client.query(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
          token TEXT NOT NULL,
          user_agent TEXT,
          is_revoked BOOLEAN DEFAULT FALSE,
          revoked_at TIMESTAMP,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP NOT NULL
        )
      `);
      
      // Create transformations table
      await client.query(`
        CREATE TABLE IF NOT EXISTS transformations (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          source_file_id VARCHAR(255),
          target_file_id VARCHAR(255),
          transform_type VARCHAR(50) NOT NULL,
          transform_config JSONB,
          status VARCHAR(50) DEFAULT 'created',
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        )
      `);
      
      // Create file_lineage table
      await client.query(`
        CREATE TABLE IF NOT EXISTS file_lineage (
          id SERIAL PRIMARY KEY,
          source_file_id VARCHAR(255) NOT NULL,
          target_file_id VARCHAR(255) NOT NULL,
          transformation_id VARCHAR(36) REFERENCES transformations(id),
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(source_file_id, target_file_id)
        )
      `);
      
      // Create file_schedules table
      await client.query(`
        CREATE TABLE IF NOT EXISTS file_schedules (
          id VARCHAR(36) PRIMARY KEY,
          file_id VARCHAR(255) NOT NULL,
          schedule_type VARCHAR(50) NOT NULL,
          cron_expression VARCHAR(100),
          next_run TIMESTAMP,
          last_run TIMESTAMP,
          status VARCHAR(50) DEFAULT 'active',
          created_by VARCHAR(36) REFERENCES users(id),
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        )
      `);
      
      // Create migrations table to track applied migrations
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          applied_at TIMESTAMP NOT NULL
        )
      `);
      
      // Initialize with admin role with all permissions
      await client.query(`
        INSERT INTO roles (name, permissions, created_at, updated_at)
        VALUES ('Admin', '["dashboard:read","dashboard:write","file_upload:read","file_upload:write","file_profile:read","file_profile:write","quality_checks:read","quality_checks:write","alerts:read","alerts:write","onboarding_wizard:read","onboarding_wizard:write","connections:read","connections:write","mappings:read","mappings:write","lineage:read","lineage:write","monitor:read","monitor:write","scheduler:read","scheduler:write","badges:read","badges:write","insights:read","insights:write","recommendations:read","recommendations:write","stories:read","stories:write","settings:read","settings:write","users:read","users:write","roles:read","roles:write","transformations:read","transformations:write"]', NOW(), NOW())
        ON CONFLICT (name) DO NOTHING
      `);
      
      // Initialize with user role with limited permissions
      await client.query(`
        INSERT INTO roles (name, permissions, created_at, updated_at)
        VALUES ('User', '["dashboard:read","file_upload:read","file_profile:read","quality_checks:read","alerts:read","connections:read","mappings:read","lineage:read","monitor:read","scheduler:read","badges:read","insights:read","recommendations:read","stories:read","transformations:read"]', NOW(), NOW())
        ON CONFLICT (name) DO NOTHING
      `);
      
      console.log('Initial schema migration completed');
    },
    down: async (client) => {
      // Drop tables in reverse order to handle foreign key constraints
      await client.query('DROP TABLE IF EXISTS migrations');
      await client.query('DROP TABLE IF EXISTS file_schedules');
      await client.query('DROP TABLE IF EXISTS file_lineage');
      await client.query('DROP TABLE IF EXISTS transformations');
      await client.query('DROP TABLE IF EXISTS refresh_tokens');
      await client.query('DROP TABLE IF EXISTS role_permissions');
      await client.query('DROP TABLE IF EXISTS user_roles');
      await client.query('DROP TABLE IF EXISTS permissions');
      await client.query('DROP TABLE IF EXISTS roles');
      await client.query('DROP TABLE IF EXISTS users');
      
      console.log('Initial schema rolled back');
    }
  },
  {
    name: '002_add_storage_connections',
    up: async (client) => {
      // Create storage_connections table
      await client.query(`
        CREATE TABLE IF NOT EXISTS storage_connections (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          config JSONB NOT NULL,
          status VARCHAR(50) DEFAULT 'active',
          created_by VARCHAR(36) REFERENCES users(id),
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        )
      `);
      
      console.log('Storage connections migration completed');
    },
    down: async (client) => {
      await client.query('DROP TABLE IF EXISTS storage_connections');
      console.log('Storage connections migration rolled back');
    }
  },
  {
    name: '003_add_file_mappings',
    up: async (client) => {
      // Create file_mappings table
      await client.query(`
        CREATE TABLE IF NOT EXISTS file_mappings (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          source_file_id VARCHAR(255) NOT NULL,
          target_file_id VARCHAR(255) NOT NULL,
          mapping_config JSONB NOT NULL,
          created_by VARCHAR(36) REFERENCES users(id),
          created_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP NOT NULL
        )
      `);
      
      console.log('File mappings migration completed');
    },
    down: async (client) => {
      await client.query('DROP TABLE IF EXISTS file_mappings');
      console.log('File mappings migration rolled back');
    }
  }
];

/**
 * Get all applied migrations from database
 * @returns {Promise<Array>} Array of applied migration names
 */
const getAppliedMigrations = async () => {
  try {
    // Create migrations table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP NOT NULL
      )
    `);
    
    const result = await db.query('SELECT name FROM migrations ORDER BY id');
    return result.rows.map(row => row.name);
  } catch (error) {
    console.error('Error fetching applied migrations:', error);
    throw error;
  }
};

/**
 * Apply all pending migrations
 * @returns {Promise<number>} Number of migrations applied
 */
const applyMigrations = async () => {
  const client = await db.getClient();
  try {
    // Start transaction
    await client.query('BEGIN');
    
    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations();
    
    // Find pending migrations
    const pendingMigrations = migrations.filter(
      migration => !appliedMigrations.includes(migration.name)
    );
    
    // Apply each pending migration
    for (const migration of pendingMigrations) {
      console.log(`Applying migration: ${migration.name}`);
      
      await migration.up(client);
      
      // Record the migration
      await client.query(
        'INSERT INTO migrations (name, applied_at) VALUES ($1, NOW())',
        [migration.name]
      );
      
      console.log(`Migration applied: ${migration.name}`);
    }
    
    await client.query('COMMIT');
    return pendingMigrations.length;
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Rollback the last applied migration
 * @returns {Promise<string|null>} Name of the rolled back migration or null if none
 */
const rollbackLastMigration = async () => {
  const client = await db.getClient();
  try {
    // Start transaction
    await client.query('BEGIN');
    
    // Get the last applied migration
    const result = await client.query(
      'SELECT name FROM migrations ORDER BY id DESC LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      console.log('No migrations to rollback');
      await client.query('COMMIT');
      return null;
    }
    
    const lastMigrationName = result.rows[0].name;
    const migration = migrations.find(m => m.name === lastMigrationName);
    
    if (!migration) {
      throw new Error(`Migration ${lastMigrationName} not found in code`);
    }
    
    console.log(`Rolling back migration: ${lastMigrationName}`);
    
    await migration.down(client);
    
    // Remove the migration record
    await client.query('DELETE FROM migrations WHERE name = $1', [lastMigrationName]);
    
    await client.query('COMMIT');
    console.log(`Migration rolled back: ${lastMigrationName}`);
    return lastMigrationName;
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('Rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  applyMigrations,
  rollbackLastMigration,
  migrations
};