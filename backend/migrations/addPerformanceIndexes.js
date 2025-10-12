/**
 * Database Performance Indexes Migration
 * 
 * Adds indexes to optimize common query patterns:
 * - Foreign key columns (JOIN operations)
 * - Frequently filtered columns (WHERE clauses)
 * - Frequently sorted columns (ORDER BY clauses)
 */

const { systemLogger } = require('../utils/logger');

async function addPerformanceIndexes(pool) {
  try {
    console.log('Starting database performance indexes migration...');
    systemLogger?.info?.('Starting database performance indexes migration');

    // Array of index definitions
    const indexes = [
      // Foreign Key Indexes (for JOIN performance)
      {
        name: 'idx_jobs_business_process_id',
        table: 'jobs',
        column: 'business_process_id',
        description: 'Optimize jobs JOIN with business_processes'
      },
      {
        name: 'idx_business_processes_group_id',
        table: 'business_processes',
        column: 'group_id',
        description: 'Optimize business_processes JOIN with groups'
      },
      {
        name: 'idx_user_groups_user_id',
        table: 'user_groups',
        column: 'user_id',
        description: 'Optimize user_groups JOIN with users'
      },
      {
        name: 'idx_user_groups_group_id',
        table: 'user_groups',
        column: 'group_id',
        description: 'Optimize user_groups JOIN with groups'
      },
      {
        name: 'idx_file_columns_file_id',
        table: 'file_columns',
        column: 'file_id',
        description: 'Optimize file_columns JOIN with files'
      },
      {
        name: 'idx_job_schedules_job_id',
        table: 'job_schedules',
        column: 'job_id',
        description: 'Optimize job_schedules JOIN with jobs'
      },
      {
        name: 'idx_job_group_jobs_group_id',
        table: 'job_group_jobs',
        column: 'group_id',
        description: 'Optimize job_group_jobs JOIN with job_groups'
      },
      {
        name: 'idx_job_group_jobs_job_id',
        table: 'job_group_jobs',
        column: 'job_id',
        description: 'Optimize job_group_jobs JOIN with jobs'
      },
      {
        name: 'idx_file_schedules_file_id',
        table: 'file_schedules',
        column: 'file_id',
        description: 'Optimize file_schedules JOIN with files'
      },
      
      // Frequently Filtered Columns (WHERE clause optimization)
      {
        name: 'idx_users_username',
        table: 'users',
        column: 'LOWER(username)',
        description: 'Optimize case-insensitive username lookups (login performance)',
        type: 'functional'
      },
      {
        name: 'idx_roles_name',
        table: 'roles',
        column: 'name',
        description: 'Optimize role name lookups'
      },
      {
        name: 'idx_permissions_name',
        table: 'permissions',
        column: 'name',
        description: 'Optimize permission name lookups'
      },
      {
        name: 'idx_permissions_resource',
        table: 'permissions',
        column: 'resource',
        description: 'Optimize permission resource lookups'
      },
      {
        name: 'idx_permissions_action',
        table: 'permissions',
        column: 'action',
        description: 'Optimize permission action lookups'
      },
      
      // Frequently Sorted Columns (ORDER BY optimization)
      {
        name: 'idx_files_created_at',
        table: 'files',
        column: 'created_at DESC',
        description: 'Optimize files sorted by created_at (most recent first)',
        type: 'ordered'
      },
      {
        name: 'idx_files_updated_at',
        table: 'files',
        column: 'updated_at DESC',
        description: 'Optimize files sorted by updated_at',
        type: 'ordered'
      },
      {
        name: 'idx_jobs_updated_at',
        table: 'jobs',
        column: 'updated_at DESC',
        description: 'Optimize jobs sorted by updated_at',
        type: 'ordered'
      },
      {
        name: 'idx_business_processes_updated_at',
        table: 'business_processes',
        column: 'updated_at DESC',
        description: 'Optimize business_processes sorted by updated_at',
        type: 'ordered'
      },
      {
        name: 'idx_groups_name',
        table: 'groups',
        column: 'name',
        description: 'Optimize groups sorted by name'
      }
    ];

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const index of indexes) {
      try {
        // Check if table exists
        const tableCheck = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = $1
          );
        `, [index.table]);

        if (!tableCheck.rows[0].exists) {
          console.log(`⏭️  Skipping index ${index.name} - table ${index.table} does not exist`);
          skipped++;
          continue;
        }

        // Check if index already exists
        const indexCheck = await pool.query(`
          SELECT EXISTS (
            SELECT FROM pg_indexes 
            WHERE indexname = $1
          );
        `, [index.name]);

        if (indexCheck.rows[0].exists) {
          console.log(`✓ Index ${index.name} already exists`);
          skipped++;
          continue;
        }

        // Create the index
        const createIndexSQL = `CREATE INDEX IF NOT EXISTS ${index.name} ON ${index.table} (${index.column});`;
        await pool.query(createIndexSQL);
        
        console.log(`✅ Created index: ${index.name} - ${index.description}`);
        systemLogger?.info?.(`Created index: ${index.name}`, { 
          table: index.table, 
          column: index.column, 
          description: index.description 
        });
        created++;

      } catch (error) {
        console.error(`❌ Error creating index ${index.name}:`, error.message);
        systemLogger?.error?.(`Error creating index ${index.name}`, { error: error.message });
        errors++;
      }
    }

    console.log(`\n📊 Index migration summary:`);
    console.log(`  - Created: ${created}`);
    console.log(`  - Skipped (already exist or table missing): ${skipped}`);
    console.log(`  - Errors: ${errors}`);

    systemLogger?.info?.('Database performance indexes migration completed', {
      created,
      skipped,
      errors
    });

    return { success: true, created, skipped, errors };

  } catch (error) {
    console.error('Error during performance indexes migration:', error);
    systemLogger?.error?.('Error during performance indexes migration', {
      error: error.message,
      stack: error.stack
    });
    return { success: false, error: error.message };
  }
}

module.exports = addPerformanceIndexes;
