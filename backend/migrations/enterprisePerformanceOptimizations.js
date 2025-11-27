/**
 * Enterprise Performance Optimizations Migration
 * 
 * Adds enterprise-grade database optimizations for:
 * - Terabyte-scale data handling
 * - Sub-second query response times
 * - 100+ concurrent user support
 * 
 * Optimizations include:
 * - Composite indexes for common query patterns
 * - Partial indexes for filtered queries
 * - Covering indexes to avoid table lookups
 * - Materialized views for dashboard aggregations
 * - Table partitioning preparation
 */

const { systemLogger } = require('../utils/logger');

async function enterprisePerformanceOptimizations(pool) {
  const client = await pool.connect();
  
  try {
    console.log('Starting enterprise performance optimizations migration...');
    systemLogger?.info?.('Starting enterprise performance optimizations');

    await client.query('BEGIN');

    // ============================================
    // PHASE 1: COMPOSITE INDEXES FOR COMMON QUERIES
    // ============================================
    console.log('\n📊 Phase 1: Creating composite indexes...');

    const compositeIndexes = [
      // Transformation Jobs - Most queried table
      {
        name: 'idx_transformation_jobs_status_created',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transformation_jobs_status_created 
              ON transformation_jobs(status, created_at DESC)`,
        description: 'Optimize job listing by status with date sorting'
      },
      {
        name: 'idx_transformation_jobs_mapping_status',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transformation_jobs_mapping_status 
              ON transformation_jobs(mapping_id, status, created_at DESC)`,
        description: 'Optimize job lookup by mapping with status filter'
      },
      {
        name: 'idx_transformation_jobs_project_status',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transformation_jobs_project_status 
              ON transformation_jobs(project_id, status, created_at DESC) WHERE project_id IS NOT NULL`,
        description: 'Optimize project-scoped job queries'
      },

      // Files - High volume table
      {
        name: 'idx_files_project_created',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_files_project_created 
              ON files(project_id, created_at DESC) WHERE project_id IS NOT NULL`,
        description: 'Optimize file listing by project'
      },
      {
        name: 'idx_files_vendor_agreement_created',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_files_vendor_agreement_created 
              ON files(vendor_agreement_id, created_at DESC) WHERE vendor_agreement_id IS NOT NULL`,
        description: 'Optimize file listing by vendor agreement'
      },
      {
        name: 'idx_files_status_created',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_files_status_created 
              ON files(status, created_at DESC)`,
        description: 'Optimize file listing by status'
      },

      // Audit Log - Grows fastest, needs best optimization
      {
        name: 'idx_audit_log_user_entity_time',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_user_entity_time 
              ON audit_log(user_id, entity_type, timestamp DESC)`,
        description: 'Optimize user activity queries by entity type'
      },
      {
        name: 'idx_audit_log_entity_action_time',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_entity_action_time 
              ON audit_log(entity_type, action_type, timestamp DESC)`,
        description: 'Optimize audit queries by entity and action'
      },
      {
        name: 'idx_audit_log_project_time',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_project_time 
              ON audit_log(project_id, timestamp DESC) WHERE project_id IS NOT NULL`,
        description: 'Optimize project-scoped audit queries'
      },

      // Anomalies - High volume analytics table
      {
        name: 'idx_anomalies_job_detected',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_anomalies_job_detected 
              ON anomalies(job_id, detected_at DESC)`,
        description: 'Optimize anomaly lookup by job'
      },
      {
        name: 'idx_anomalies_severity_detected',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_anomalies_severity_detected 
              ON anomalies(severity, detected_at DESC)`,
        description: 'Optimize anomaly filtering by severity'
      },
      {
        name: 'idx_anomalies_type_detected',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_anomalies_type_detected 
              ON anomalies(anomaly_type, detected_at DESC)`,
        description: 'Optimize anomaly filtering by type'
      },

      // File Preview Data - Large data table
      {
        name: 'idx_file_preview_file_row',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_file_preview_file_row 
              ON file_preview_data(file_id, row_number)`,
        description: 'Optimize preview data pagination'
      },

      // Upload Staging - Bulk insert optimization
      {
        name: 'idx_upload_staging_batch_status',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_upload_staging_batch_status 
              ON upload_staging(batch_id, status, created_at DESC)`,
        description: 'Optimize batch processing queries'
      },
      {
        name: 'idx_upload_batches_status_created',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_upload_batches_status_created 
              ON upload_batches(status, created_at DESC)`,
        description: 'Optimize batch listing by status'
      },

      // Workflow Executions
      {
        name: 'idx_workflow_executions_workflow_status',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_executions_workflow_status 
              ON workflow_executions(workflow_id, status, started_at DESC)`,
        description: 'Optimize workflow execution history'
      },
      {
        name: 'idx_mapping_group_executions_group_status',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mapping_group_executions_group_status 
              ON mapping_group_executions(mapping_group_id, status, started_at DESC)`,
        description: 'Optimize mapping group execution history'
      },

      // Schedules - Frequently queried for due jobs
      {
        name: 'idx_schedules_enabled_next_run',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_schedules_enabled_next_run 
              ON schedules(enabled, next_run_at) WHERE enabled = true`,
        description: 'Optimize finding due schedules'
      },
      {
        name: 'idx_job_schedules_enabled_next_run',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_schedules_enabled_next_run 
              ON job_schedules(enabled, next_run_at) WHERE enabled = true`,
        description: 'Optimize finding due job schedules'
      }
    ];

    for (const index of compositeIndexes) {
      try {
        // Check if table exists first
        const tableMatch = index.sql.match(/ON\s+(\w+)/i);
        if (tableMatch) {
          const tableName = tableMatch[1];
          const tableCheck = await client.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_name = $1
            );
          `, [tableName]);

          if (!tableCheck.rows[0].exists) {
            console.log(`⏭️  Skipping ${index.name} - table ${tableName} does not exist`);
            continue;
          }
        }

        // Check if index already exists
        const indexCheck = await client.query(`
          SELECT EXISTS (
            SELECT FROM pg_indexes 
            WHERE indexname = $1
          );
        `, [index.name]);

        if (indexCheck.rows[0].exists) {
          console.log(`✓ Index ${index.name} already exists`);
          continue;
        }

        // Create index (without CONCURRENTLY inside transaction)
        const sqlWithoutConcurrently = index.sql.replace('CONCURRENTLY ', '');
        await client.query(sqlWithoutConcurrently);
        console.log(`✅ Created: ${index.name} - ${index.description}`);
      } catch (error) {
        console.error(`❌ Error creating ${index.name}: ${error.message}`);
      }
    }

    // ============================================
    // PHASE 2: COVERING INDEXES (INCLUDE columns)
    // ============================================
    console.log('\n📊 Phase 2: Creating covering indexes...');

    const coveringIndexes = [
      {
        name: 'idx_jobs_list_covering',
        sql: `CREATE INDEX IF NOT EXISTS idx_jobs_list_covering 
              ON jobs(status, updated_at DESC) 
              INCLUDE (name, business_process_id)`,
        description: 'Cover common job list columns to avoid table lookup'
      },
      {
        name: 'idx_files_list_covering',
        sql: `CREATE INDEX IF NOT EXISTS idx_files_list_covering 
              ON files(created_at DESC) 
              INCLUDE (filename, file_type, file_size, status)`,
        description: 'Cover common file list columns'
      },
      {
        name: 'idx_transformation_jobs_list_covering',
        sql: `CREATE INDEX IF NOT EXISTS idx_transformation_jobs_list_covering 
              ON transformation_jobs(status, created_at DESC) 
              INCLUDE (mapping_id, records_processed, records_failed)`,
        description: 'Cover job execution summary columns'
      }
    ];

    for (const index of coveringIndexes) {
      try {
        const tableMatch = index.sql.match(/ON\s+(\w+)/i);
        if (tableMatch) {
          const tableName = tableMatch[1];
          const tableCheck = await client.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_name = $1
            );
          `, [tableName]);

          if (!tableCheck.rows[0].exists) {
            console.log(`⏭️  Skipping ${index.name} - table ${tableName} does not exist`);
            continue;
          }
        }

        const indexCheck = await client.query(`
          SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = $1);
        `, [index.name]);

        if (indexCheck.rows[0].exists) {
          console.log(`✓ Covering index ${index.name} already exists`);
          continue;
        }

        await client.query(index.sql);
        console.log(`✅ Created: ${index.name} - ${index.description}`);
      } catch (error) {
        console.error(`❌ Error creating ${index.name}: ${error.message}`);
      }
    }

    // ============================================
    // PHASE 3: MATERIALIZED VIEWS FOR DASHBOARDS
    // ============================================
    console.log('\n📊 Phase 3: Creating materialized views...');

    // Dashboard Summary View - Pre-computed metrics
    try {
      await client.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dashboard_summary AS
        SELECT 
          COALESCE(p.id, 0) as project_id,
          COALESCE(p.name, 'All Projects') as project_name,
          COUNT(DISTINCT f.id) as total_files,
          COUNT(DISTINCT CASE WHEN f.created_at > NOW() - INTERVAL '24 hours' THEN f.id END) as files_last_24h,
          COUNT(DISTINCT tj.id) as total_jobs,
          COUNT(DISTINCT CASE WHEN tj.status = 'completed' THEN tj.id END) as completed_jobs,
          COUNT(DISTINCT CASE WHEN tj.status = 'failed' THEN tj.id END) as failed_jobs,
          COUNT(DISTINCT CASE WHEN tj.status = 'running' THEN tj.id END) as running_jobs,
          COALESCE(SUM(tj.records_processed), 0) as total_records_processed,
          COUNT(DISTINCT a.id) as total_anomalies,
          COUNT(DISTINCT CASE WHEN a.severity = 'critical' THEN a.id END) as critical_anomalies,
          NOW() as refreshed_at
        FROM projects p
        LEFT JOIN files f ON f.project_id = p.id
        LEFT JOIN transformation_jobs tj ON tj.project_id = p.id
        LEFT JOIN anomalies a ON a.job_id = tj.id
        GROUP BY GROUPING SETS ((p.id, p.name), ())
      `);
      console.log('✅ Created materialized view: mv_dashboard_summary');
    } catch (error) {
      if (error.code === '42P07') {
        console.log('✓ Materialized view mv_dashboard_summary already exists');
      } else {
        console.error(`❌ Error creating mv_dashboard_summary: ${error.message}`);
      }
    }

    // Create unique index for concurrent refresh
    try {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_summary_project 
        ON mv_dashboard_summary(project_id)
      `);
      console.log('✅ Created index on mv_dashboard_summary');
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error(`❌ Error creating mv_dashboard_summary index: ${error.message}`);
      }
    }

    // Job Execution Trends View - For charts
    try {
      await client.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_job_trends_hourly AS
        SELECT 
          date_trunc('hour', created_at) as hour,
          status,
          COUNT(*) as job_count,
          COALESCE(SUM(records_processed), 0) as records_processed,
          COALESCE(SUM(records_failed), 0) as records_failed,
          COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - created_at))), 0) as avg_duration_seconds
        FROM transformation_jobs
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY date_trunc('hour', created_at), status
        ORDER BY hour DESC
      `);
      console.log('✅ Created materialized view: mv_job_trends_hourly');
    } catch (error) {
      if (error.code === '42P07') {
        console.log('✓ Materialized view mv_job_trends_hourly already exists');
      } else {
        console.error(`❌ Error creating mv_job_trends_hourly: ${error.message}`);
      }
    }

    try {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_job_trends_hour_status 
        ON mv_job_trends_hourly(hour, status)
      `);
      console.log('✅ Created index on mv_job_trends_hourly');
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error(`❌ Error creating mv_job_trends_hourly index: ${error.message}`);
      }
    }

    // File Processing Summary View
    try {
      await client.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_file_processing_summary AS
        SELECT 
          date_trunc('day', f.created_at) as day,
          f.file_type,
          COUNT(*) as file_count,
          COALESCE(SUM(f.file_size), 0) as total_size_bytes,
          COALESCE(AVG(f.file_size), 0) as avg_size_bytes,
          COUNT(DISTINCT f.project_id) as projects_count
        FROM files f
        WHERE f.created_at > NOW() - INTERVAL '90 days'
        GROUP BY date_trunc('day', f.created_at), f.file_type
        ORDER BY day DESC
      `);
      console.log('✅ Created materialized view: mv_file_processing_summary');
    } catch (error) {
      if (error.code === '42P07') {
        console.log('✓ Materialized view mv_file_processing_summary already exists');
      } else {
        console.error(`❌ Error creating mv_file_processing_summary: ${error.message}`);
      }
    }

    try {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_file_processing_day_type 
        ON mv_file_processing_summary(day, file_type)
      `);
      console.log('✅ Created index on mv_file_processing_summary');
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error(`❌ Error creating mv_file_processing_summary index: ${error.message}`);
      }
    }

    // ============================================
    // PHASE 4: CURSOR PAGINATION SUPPORT
    // ============================================
    console.log('\n📊 Phase 4: Adding cursor pagination support columns...');

    // Add cursor columns to high-volume tables if not exist
    const cursorColumns = [
      { table: 'transformation_jobs', column: 'cursor_id', type: 'BIGSERIAL' },
      { table: 'files', column: 'cursor_id', type: 'BIGSERIAL' },
      { table: 'audit_log', column: 'cursor_id', type: 'BIGSERIAL' },
      { table: 'anomalies', column: 'cursor_id', type: 'BIGSERIAL' }
    ];

    for (const col of cursorColumns) {
      try {
        const tableCheck = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = $1
          );
        `, [col.table]);

        if (!tableCheck.rows[0].exists) {
          console.log(`⏭️  Skipping cursor column for ${col.table} - table does not exist`);
          continue;
        }

        const colCheck = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = $2
          );
        `, [col.table, col.column]);

        if (colCheck.rows[0].exists) {
          console.log(`✓ Cursor column ${col.table}.${col.column} already exists`);
          continue;
        }

        await client.query(`
          ALTER TABLE ${col.table} 
          ADD COLUMN ${col.column} BIGSERIAL
        `);
        
        // Create index on cursor column
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_${col.table}_cursor 
          ON ${col.table}(${col.column} DESC)
        `);

        console.log(`✅ Added cursor column: ${col.table}.${col.column}`);
      } catch (error) {
        console.error(`❌ Error adding cursor column to ${col.table}: ${error.message}`);
      }
    }

    // ============================================
    // PHASE 5: DATABASE CONFIGURATION FUNCTIONS
    // ============================================
    console.log('\n📊 Phase 5: Creating database helper functions...');

    // Function to refresh all materialized views
    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
        RETURNS TABLE(view_name TEXT, refresh_status TEXT, duration_ms BIGINT) AS $$
        DECLARE
          view_record RECORD;
          start_time TIMESTAMP;
          end_time TIMESTAMP;
        BEGIN
          FOR view_record IN 
            SELECT matviewname FROM pg_matviews WHERE schemaname = 'public'
          LOOP
            start_time := clock_timestamp();
            BEGIN
              EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', view_record.matviewname);
              end_time := clock_timestamp();
              view_name := view_record.matviewname;
              refresh_status := 'success';
              duration_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::BIGINT;
              RETURN NEXT;
            EXCEPTION WHEN OTHERS THEN
              end_time := clock_timestamp();
              view_name := view_record.matviewname;
              refresh_status := SQLERRM;
              duration_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time))::BIGINT;
              RETURN NEXT;
            END;
          END LOOP;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('✅ Created function: refresh_all_materialized_views()');
    } catch (error) {
      console.error(`❌ Error creating refresh function: ${error.message}`);
    }

    // Function to get table sizes for monitoring
    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION get_table_sizes()
        RETURNS TABLE(
          table_name TEXT,
          row_estimate BIGINT,
          total_size TEXT,
          index_size TEXT,
          table_size TEXT
        ) AS $$
        SELECT
          relname::TEXT as table_name,
          reltuples::BIGINT as row_estimate,
          pg_size_pretty(pg_total_relation_size(relid)) as total_size,
          pg_size_pretty(pg_indexes_size(relid)) as index_size,
          pg_size_pretty(pg_relation_size(relid)) as table_size
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC;
        $$ LANGUAGE SQL;
      `);
      console.log('✅ Created function: get_table_sizes()');
    } catch (error) {
      console.error(`❌ Error creating get_table_sizes function: ${error.message}`);
    }

    // Function to analyze query performance
    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION get_slow_queries(threshold_ms INTEGER DEFAULT 1000)
        RETURNS TABLE(
          query TEXT,
          calls BIGINT,
          mean_time_ms DOUBLE PRECISION,
          total_time_ms DOUBLE PRECISION,
          rows_per_call DOUBLE PRECISION
        ) AS $$
        SELECT
          query,
          calls,
          mean_exec_time as mean_time_ms,
          total_exec_time as total_time_ms,
          rows / NULLIF(calls, 0) as rows_per_call
        FROM pg_stat_statements
        WHERE mean_exec_time > threshold_ms
        ORDER BY total_exec_time DESC
        LIMIT 20;
        $$ LANGUAGE SQL;
      `);
      console.log('✅ Created function: get_slow_queries()');
    } catch (error) {
      // pg_stat_statements extension might not be available
      console.log('⏭️  Skipping get_slow_queries function (requires pg_stat_statements extension)');
    }

    await client.query('COMMIT');

    console.log('\n✅ Enterprise performance optimizations migration completed successfully');
    systemLogger?.info?.('Enterprise performance optimizations completed');

    return { success: true };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during enterprise performance optimizations:', error);
    systemLogger?.error?.('Error during enterprise performance optimizations', {
      error: error.message,
      stack: error.stack
    });
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

module.exports = enterprisePerformanceOptimizations;
