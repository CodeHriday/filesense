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

// Default admin credentials - SECURITY WARNING: Change password immediately after first login
const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'Admin123!', // NOSONAR S2068 - Temporary default password for initial setup, must be changed on first login
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
    name: 'Data Steward',
    description: 'Manages data governance including tags, policies, and data quality rules'
  },
  {
    name: 'Data Engineer',
    description: 'Creates and manages transformations, workflows, and schedules'
  },
  {
    name: 'Analyst',
    description: 'Views insights, runs approved jobs, and reads files'
  },
  {
    name: 'Viewer',
    description: 'Read-only access to data'
  },
  {
    name: 'Vendor Manager',
    description: 'Manages vendor relationships, file drops, and vendor contracts',
    // Feature-level permission strings read by the auth middleware from roles.permissions
    permissions: [
      'dashboard:read',
      'vendor_agreements:read', 'vendor_agreements:write', 'vendor_agreements:approve',
      'connection:read', 'connection:write',
      'users:read', 'users:write',
      'sla_monitoring:read',
      'vendor_file_upload:read', 'vendor_file_upload:write',
      'vendor_file_quality:read',
      'vendor_details:read', 'vendor_details:write',
      'file_catalog:read',
      'file_drop:read', 'file_drop:write'
    ]
  },
  {
    name: 'Governance Manager',
    description: 'Responsible for final approval of vendor contracts and governance oversight',
    // Feature-level permission strings read by the auth middleware from roles.permissions
    permissions: [
      'dashboard:read',
      'vendor_agreements:read', 'vendor_agreements:approve',
      'connection:read',
      'sla_monitoring:read',
      'vendor_details:read',
      'vendor_file_quality:read'
    ]
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
  
  // Workflow management
  { name: 'workflow:create', resource: 'workflow', action: 'create', description: 'Create workflows' },
  { name: 'workflow:read', resource: 'workflow', action: 'read', description: 'View workflows' },
  { name: 'workflow:update', resource: 'workflow', action: 'update', description: 'Update workflows' },
  { name: 'workflow:delete', resource: 'workflow', action: 'delete', description: 'Delete workflows' },
  { name: 'workflow:execute', resource: 'workflow', action: 'execute', description: 'Execute workflows' },
  
  // Job management
  { name: 'job:create', resource: 'job', action: 'create', description: 'Create jobs' },
  { name: 'job:read', resource: 'job', action: 'read', description: 'View jobs' },
  { name: 'job:update', resource: 'job', action: 'update', description: 'Update jobs' },
  { name: 'job:delete', resource: 'job', action: 'delete', description: 'Delete jobs' },
  { name: 'job:execute', resource: 'job', action: 'execute', description: 'Execute jobs' },
  
  // Schedule management
  { name: 'schedule:create', resource: 'schedule', action: 'create', description: 'Create schedules' },
  { name: 'schedule:read', resource: 'schedule', action: 'read', description: 'View schedules' },
  { name: 'schedule:update', resource: 'schedule', action: 'update', description: 'Update schedules' },
  { name: 'schedule:delete', resource: 'schedule', action: 'delete', description: 'Delete schedules' },
  
  // Connection management
  { name: 'connection:create', resource: 'connection', action: 'create', description: 'Create connections' },
  { name: 'connection:read', resource: 'connection', action: 'read', description: 'View connections' },
  { name: 'connection:update', resource: 'connection', action: 'update', description: 'Update connections' },
  { name: 'connection:delete', resource: 'connection', action: 'delete', description: 'Delete connections' },
  
  // Tag management
  { name: 'tag:create', resource: 'tag', action: 'create', description: 'Create governance tags' },
  { name: 'tag:read', resource: 'tag', action: 'read', description: 'View governance tags' },
  { name: 'tag:update', resource: 'tag', action: 'update', description: 'Update governance tags' },
  { name: 'tag:delete', resource: 'tag', action: 'delete', description: 'Delete governance tags' },
  { name: 'tag:assign', resource: 'tag', action: 'assign', description: 'Assign tags to files/columns' },
  
  // Policy management
  { name: 'policy:create', resource: 'policy', action: 'create', description: 'Create governance policies' },
  { name: 'policy:read', resource: 'policy', action: 'read', description: 'View governance policies' },
  { name: 'policy:update', resource: 'policy', action: 'update', description: 'Update governance policies' },
  { name: 'policy:delete', resource: 'policy', action: 'delete', description: 'Delete governance policies' },
  { name: 'policy:assign', resource: 'policy', action: 'assign', description: 'Assign policies to files/columns' },
  
  // Tag-based data access permissions (for sensitive data)
  { name: 'tag:pii:read', resource: 'tag:pii', action: 'read', description: 'View PII tagged columns' },
  { name: 'tag:pii:edit', resource: 'tag:pii', action: 'edit', description: 'Edit PII tagged columns' },
  { name: 'tag:confidential:read', resource: 'tag:confidential', action: 'read', description: 'View confidential tagged columns' },
  { name: 'tag:confidential:edit', resource: 'tag:confidential', action: 'edit', description: 'Edit confidential tagged columns' },
  { name: 'tag:financial:read', resource: 'tag:financial', action: 'read', description: 'View financial tagged columns' },
  { name: 'tag:financial:edit', resource: 'tag:financial', action: 'edit', description: 'Edit financial tagged columns' },
  
  // Dashboard access
  { name: 'dashboard:read', resource: 'dashboard', action: 'read', description: 'View dashboards' },
  
  // Insights access
  { name: 'insights:read', resource: 'insights', action: 'read', description: 'View insights' },
  { name: 'recommendations:read', resource: 'recommendations', action: 'read', description: 'View recommendations' },
  { name: 'badges:read', resource: 'badges', action: 'read', description: 'View achievement badges' },
  { name: 'stories:read', resource: 'stories', action: 'read', description: 'View data stories' },
  
  // Monitoring
  { name: 'monitor:read', resource: 'monitor', action: 'read', description: 'View system monitoring' },
  
  // Audit logs
  { name: 'audit:read', resource: 'audit', action: 'read', description: 'View audit logs' },
  
  // DBT operations
  { name: 'dbt:read', resource: 'dbt', action: 'read', description: 'View DBT models' },
  { name: 'dbt:execute', resource: 'dbt', action: 'execute', description: 'Execute DBT commands' }
];

// Role-Permission mappings
const ROLE_PERMISSIONS = {
  'Admin': '*', // All permissions
  
  'Data Steward': [
    // Data governance
    'tag:create', 'tag:read', 'tag:update', 'tag:delete', 'tag:assign',
    'policy:create', 'policy:read', 'policy:update', 'policy:delete', 'policy:assign',
    // Tag-based data access (can view and edit all sensitive data)
    'tag:pii:read', 'tag:pii:edit',
    'tag:confidential:read', 'tag:confidential:edit',
    'tag:financial:read', 'tag:financial:edit',
    // File management
    'file:create', 'file:read', 'file:update', 'file:delete',
    // Read-only access to transformations and workflows
    'transformation:read', 'workflow:read', 'job:read', 'schedule:read',
    // Monitoring
    'monitor:read', 'audit:read',
    // Dashboard and insights
    'dashboard:read', 'insights:read', 'recommendations:read', 'badges:read', 'stories:read'
  ],
  
  'Data Engineer': [
    // Transformation and workflow management
    'transformation:create', 'transformation:read', 'transformation:update', 'transformation:delete', 'transformation:execute',
    'workflow:create', 'workflow:read', 'workflow:update', 'workflow:delete', 'workflow:execute',
    'job:create', 'job:read', 'job:update', 'job:delete', 'job:execute',
    'schedule:create', 'schedule:read', 'schedule:update', 'schedule:delete',
    // Connection management
    'connection:create', 'connection:read', 'connection:update', 'connection:delete',
    // File management
    'file:create', 'file:read', 'file:update', 'file:delete',
    // Vendor contract read access (needed for visual mapping source configuration)
    'vendor_agreements:read',
    // Can apply existing tags (not create new ones)
    'tag:read', 'tag:assign',
    'policy:read', 'policy:assign',
    // Limited sensitive data access (read only, no edit)
    'tag:pii:read',
    'tag:confidential:read',
    'tag:financial:read',
    // DBT operations
    'dbt:read', 'dbt:execute',
    // Monitoring
    'monitor:read',
    // Dashboard and insights
    'dashboard:read', 'insights:read', 'recommendations:read', 'badges:read', 'stories:read'
  ],
  
  'Analyst': [
    // Read-only file access
    'file:read',
    // Can execute approved jobs and transformations
    'job:read', 'job:execute',
    'transformation:read',
    'workflow:read',
    // View tags and policies
    'tag:read',
    'policy:read',
    // NO sensitive data access by default (must be explicitly granted per tag)
    // Dashboard and insights (primary use case)
    'dashboard:read', 'insights:read', 'recommendations:read', 'badges:read', 'stories:read',
    // View schedules
    'schedule:read',
    // DBT read-only
    'dbt:read'
  ],
  
  'Viewer': [
    // Read-only access to basic features
    'file:read',
    'transformation:read',
    'workflow:read',
    'job:read',
    'schedule:read',
    'tag:read',
    'policy:read',
    // Dashboard and insights
    'dashboard:read', 'insights:read', 'recommendations:read', 'badges:read', 'stories:read'
  ],

  'Vendor Manager': [
    // Dashboard
    'dashboard:read',
    // File access
    'file:read'
  ],

  'Governance Manager': [
    // Dashboard
    'dashboard:read',
    // File access (read-only)
    'file:read'
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
        
        // Create role — include feature-level permissions JSON when defined
        if (role.permissions && role.permissions.length > 0) {
          await this.pool.query(
            'INSERT INTO roles (name, permissions, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
            [role.name, JSON.stringify(role.permissions)]
          );
        } else {
          await this.pool.query(
            'INSERT INTO roles (name, created_at, updated_at) VALUES ($1, NOW(), NOW())',
            [role.name]
          );
        }
        
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

      // Assign Vendor Manager and Governance Manager roles so the vendor
      // contract dropdowns are usable immediately on a fresh database.
      for (const roleName of ['Vendor Manager', 'Governance Manager']) {
        const vmResult = await client.query(
          'SELECT id FROM roles WHERE name = $1',
          [roleName]
        );
        if (vmResult.rows.length > 0) {
          await client.query(
            `INSERT INTO user_roles (user_id, role_id, created_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT DO NOTHING`,
            [userId, vmResult.rows[0].id]
          );
        }
      }
      
      await client.query('COMMIT');
      
      console.log(`  ✅ Created admin user: ${DEFAULT_ADMIN.username}`);
      console.log(`  📧 Email: ${DEFAULT_ADMIN.email}`);
      console.log(`  🚨 CRITICAL SECURITY: Change the admin password immediately after first login!`);
      console.log(`  🔒 Default password is temporary and must be changed for security!`);
      
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
      console.log('\n🚨 CRITICAL SECURITY NOTICE:');
      console.log('   1. LOGIN IMMEDIATELY and change the admin password');
      console.log('   2. The default password is a SECURITY RISK if not changed');
      console.log('   3. Create additional admin users if needed');
      console.log('   4. Consider deleting the default admin after creating your own');
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
