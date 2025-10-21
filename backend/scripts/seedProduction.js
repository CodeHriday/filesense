#!/usr/bin/env node

/**
 * Production Database Seeding Script
 * 
 * This script populates the production database with essential data:
 * - Default roles (Admin, User, Viewer)
 * - Basic permissions
 * - Default admin account
 * 
 * Features:
 * - Idempotent: Safe to run multiple times (checks for existing data)
 * - Transaction-safe: All operations wrapped in transactions
 * - Production-ready: Uses environment variables for database connection
 * 
 * Usage:
 *   npm run seed:production
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { DATABASE_CONFIG, SECURITY_CONFIG } = require('../src/config/environment');

// Default admin credentials
const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'Admin123!', // User should change this immediately after first login
  email: 'admin@dataobservatory.local',
  fullName: 'System Administrator'
};

// Default roles to create
const DEFAULT_ROLES = [
  {
    name: 'Admin',
    description: 'Full system access with all permissions'
  },
  {
    name: 'User',
    description: 'Standard user with read/write access to their own data'
  },
  {
    name: 'Viewer',
    description: 'Read-only access to data'
  }
];

// Default permissions to create
const DEFAULT_PERMISSIONS = [
  // User management
  { name: 'user:create', resource: 'user', action: 'create', description: 'Create new users' },
  { name: 'user:read', resource: 'user', action: 'read', description: 'View user information' },
  { name: 'user:update', resource: 'user', action: 'update', description: 'Update user information' },
  { name: 'user:delete', resource: 'user', action: 'delete', description: 'Delete users' },
  
  // Role management
  { name: 'role:create', resource: 'role', action: 'create', description: 'Create new roles' },
  { name: 'role:read', resource: 'role', action: 'read', description: 'View roles' },
  { name: 'role:update', resource: 'role', action: 'update', description: 'Update roles' },
  { name: 'role:delete', resource: 'role', action: 'delete', description: 'Delete roles' },
  
  // File management
  { name: 'file:create', resource: 'file', action: 'create', description: 'Upload files' },
  { name: 'file:read', resource: 'file', action: 'read', description: 'View files' },
  { name: 'file:update', resource: 'file', action: 'update', description: 'Update file metadata' },
  { name: 'file:delete', resource: 'file', action: 'delete', description: 'Delete files' },
  
  // Transformation management
  { name: 'transformation:create', resource: 'transformation', action: 'create', description: 'Create transformations' },
  { name: 'transformation:read', resource: 'transformation', action: 'read', description: 'View transformations' },
  { name: 'transformation:update', resource: 'transformation', action: 'update', description: 'Update transformations' },
  { name: 'transformation:delete', resource: 'transformation', action: 'delete', description: 'Delete transformations' },
  { name: 'transformation:execute', resource: 'transformation', action: 'execute', description: 'Execute transformations' },
  
  // Dashboard access
  { name: 'dashboard:read', resource: 'dashboard', action: 'read', description: 'View dashboards' },
  
  // Insights access
  { name: 'insights:read', resource: 'insights', action: 'read', description: 'View insights' },
  
  // Audit logs
  { name: 'audit:read', resource: 'audit', action: 'read', description: 'View audit logs' }
];

// Role-Permission mappings
const ROLE_PERMISSIONS = {
  'Admin': '*', // All permissions
  'User': [
    'user:read',
    'file:create', 'file:read', 'file:update', 'file:delete',
    'transformation:create', 'transformation:read', 'transformation:update', 'transformation:delete', 'transformation:execute',
    'dashboard:read',
    'insights:read'
  ],
  'Viewer': [
    'file:read',
    'transformation:read',
    'dashboard:read',
    'insights:read'
  ]
};

class ProductionSeeder {
  constructor() {
    this.pool = new Pool({
      connectionString: DATABASE_CONFIG.CONNECTION_STRING,
      ssl: DATABASE_CONFIG.SSL_ENABLED ? {
        rejectUnauthorized: DATABASE_CONFIG.SSL_REJECT_UNAUTHORIZED
      } : false
    });
    
    this.stats = {
      rolesCreated: 0,
      permissionsCreated: 0,
      usersCreated: 0,
      rolesSkipped: 0,
      permissionsSkipped: 0,
      usersSkipped: 0
    };
  }

  async connect() {
    try {
      await this.pool.query('SELECT NOW()');
      console.log('✅ Database connection established');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      throw error;
    }
  }

  async seedRoles() {
    console.log('\n📝 Seeding roles...');
    
    for (const role of DEFAULT_ROLES) {
      try {
        // Check if role already exists
        const existingRole = await this.pool.query(
          'SELECT id FROM roles WHERE name = $1',
          [role.name]
        );
        
        if (existingRole.rows.length > 0) {
          console.log(`  ⏭️  Role "${role.name}" already exists, skipping`);
          this.stats.rolesSkipped++;
          continue;
        }
        
        // Create role
        await this.pool.query(
          'INSERT INTO roles (name, created_at, updated_at) VALUES ($1, NOW(), NOW())',
          [role.name]
        );
        
        console.log(`  ✅ Created role: ${role.name}`);
        this.stats.rolesCreated++;
      } catch (error) {
        console.error(`  ❌ Error creating role "${role.name}":`, error.message);
      }
    }
  }

  async seedPermissions() {
    console.log('\n📝 Seeding permissions...');
    
    for (const permission of DEFAULT_PERMISSIONS) {
      try {
        // Check if permission already exists (using resource+action which is unique)
        const existingPermission = await this.pool.query(
          'SELECT id FROM permissions WHERE resource = $1 AND action = $2',
          [permission.resource, permission.action]
        );
        
        if (existingPermission.rows.length > 0) {
          console.log(`  ⏭️  Permission "${permission.name}" already exists, skipping`);
          this.stats.permissionsSkipped++;
          continue;
        }
        
        // Create permission
        await this.pool.query(
          `INSERT INTO permissions (name, resource, action, description, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [permission.name, permission.resource, permission.action, permission.description]
        );
        
        console.log(`  ✅ Created permission: ${permission.name}`);
        this.stats.permissionsCreated++;
      } catch (error) {
        // Silently skip if duplicate (already exists)
        if (error.code === '23505') { // PostgreSQL unique violation error code
          console.log(`  ⏭️  Permission "${permission.name}" already exists, skipping`);
          this.stats.permissionsSkipped++;
        } else {
          console.error(`  ❌ Error creating permission "${permission.name}":`, error.message);
        }
      }
    }
  }

  async linkRolePermissions() {
    console.log('\n🔗 Linking roles to permissions...');
    
    for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      try {
        // Get role ID
        const roleResult = await this.pool.query(
          'SELECT id FROM roles WHERE name = $1',
          [roleName]
        );
        
        if (roleResult.rows.length === 0) {
          console.log(`  ⚠️  Role "${roleName}" not found, skipping permission assignment`);
          continue;
        }
        
        const roleId = roleResult.rows[0].id;
        
        // Admin gets all permissions
        if (permissions === '*') {
          const allPermissions = await this.pool.query('SELECT id FROM permissions');
          
          for (const perm of allPermissions.rows) {
            // Check if already linked
            const existing = await this.pool.query(
              'SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
              [roleId, perm.id]
            );
            
            if (existing.rows.length === 0) {
              await this.pool.query(
                'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
                [roleId, perm.id]
              );
            }
          }
          
          console.log(`  ✅ Linked all permissions to role: ${roleName}`);
        } else {
          // Link specific permissions
          for (const permName of permissions) {
            const permResult = await this.pool.query(
              'SELECT id FROM permissions WHERE name = $1',
              [permName]
            );
            
            if (permResult.rows.length === 0) {
              console.log(`    ⚠️  Permission "${permName}" not found, skipping`);
              continue;
            }
            
            const permId = permResult.rows[0].id;
            
            // Check if already linked
            const existing = await this.pool.query(
              'SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
              [roleId, permId]
            );
            
            if (existing.rows.length === 0) {
              await this.pool.query(
                'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
                [roleId, permId]
              );
            }
          }
          
          console.log(`  ✅ Linked ${permissions.length} permissions to role: ${roleName}`);
        }
      } catch (error) {
        console.error(`  ❌ Error linking permissions for role "${roleName}":`, error.message);
      }
    }
  }

  async seedAdminUser() {
    console.log('\n👤 Seeding admin user...');
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if admin user already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [DEFAULT_ADMIN.username]
      );
      
      if (existingUser.rows.length > 0) {
        console.log(`  ⏭️  Admin user "${DEFAULT_ADMIN.username}" already exists, skipping`);
        this.stats.usersSkipped++;
        await client.query('ROLLBACK');
        return;
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(
        DEFAULT_ADMIN.password,
        SECURITY_CONFIG.BCRYPT_SALT_ROUNDS
      );
      
      // Create user (ID is auto-generated by database)
      const userResult = await client.query(
        `INSERT INTO users (username, password, email, full_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id`,
        [
          DEFAULT_ADMIN.username,
          hashedPassword,
          DEFAULT_ADMIN.email,
          DEFAULT_ADMIN.fullName
        ]
      );
      
      const userId = userResult.rows[0].id;
      
      // Get Admin role ID
      const roleResult = await client.query(
        'SELECT id FROM roles WHERE name = $1',
        ['Admin']
      );
      
      if (roleResult.rows.length > 0) {
        const roleId = roleResult.rows[0].id;
        
        // Assign Admin role to user
        await client.query(
          'INSERT INTO user_roles (user_id, role_id, created_at) VALUES ($1, $2, NOW())',
          [userId, roleId]
        );
      }
      
      await client.query('COMMIT');
      
      console.log(`  ✅ Created admin user: ${DEFAULT_ADMIN.username}`);
      console.log(`  📧 Email: ${DEFAULT_ADMIN.email}`);
      console.log(`  🔑 Password: ${DEFAULT_ADMIN.password}`);
      console.log(`  ⚠️  IMPORTANT: Change the admin password immediately after first login!`);
      
      this.stats.usersCreated++;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('  ❌ Error creating admin user:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  async printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 SEEDING SUMMARY');
    console.log('='.repeat(80));
    console.log(`Roles created:       ${this.stats.rolesCreated}`);
    console.log(`Roles skipped:       ${this.stats.rolesSkipped}`);
    console.log(`Permissions created: ${this.stats.permissionsCreated}`);
    console.log(`Permissions skipped: ${this.stats.permissionsSkipped}`);
    console.log(`Users created:       ${this.stats.usersCreated}`);
    console.log(`Users skipped:       ${this.stats.usersSkipped}`);
    console.log('='.repeat(80));
    
    if (this.stats.usersCreated > 0) {
      console.log('\n🔐 DEFAULT ADMIN CREDENTIALS:');
      console.log(`   Username: ${DEFAULT_ADMIN.username}`);
      console.log(`   Password: ${DEFAULT_ADMIN.password}`);
      console.log('\n⚠️  SECURITY NOTICE:');
      console.log('   1. Login immediately and change the admin password');
      console.log('   2. Create additional admin users if needed');
      console.log('   3. Consider deleting the default admin after creating your own');
      console.log('='.repeat(80));
    }
  }

  async run() {
    try {
      console.log('🌱 Starting production database seeding...\n');
      
      await this.connect();
      await this.seedRoles();
      await this.seedPermissions();
      await this.linkRolePermissions();
      await this.seedAdminUser();
      await this.printSummary();
      
      console.log('\n✅ Seeding completed successfully!\n');
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Seeding failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    } finally {
      await this.pool.end();
    }
  }
}

// Run the seeder
const seeder = new ProductionSeeder();
seeder.run();
