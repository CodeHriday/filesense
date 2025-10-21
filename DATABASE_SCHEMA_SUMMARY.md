# Data File Observatory - Database Schema Summary

**Generated:** October 21, 2025  
**Database Version:** PostgreSQL 16.9  
**Total Objects:** 239 (tables, views, indexes, sequences, functions, triggers)

## Database Objects Overview

### Tables (65)
The database contains 65 tables organized into the following functional categories:

#### Core File Management
- `files` - Central file catalog with metadata, quality scores, checksums
- `file_columns` - Column-level profiling and statistics
- `file_schemas` - File schema definitions and validation
- `file_schema_details` - Detailed schema information
- `file_history` - File version history
- `file_lineage` - Manual file lineage tracking
- `file_quality_checks` - Quality assessment results
- `file_mappings` - File transformation mappings
- `file_schedules` - Scheduled file processing
- `file_audit_details` - Detailed file audit logs

#### ETL & Transformation System
- `transformation_mappings` - ETL transformation configurations
- `transformation_jobs` - Job execution tracking
- `transformation_logs` - Detailed job logs
- `transformation_executions` - Transformation execution history
- `transformation_outputs` - Output file tracking
- `transformation_lineage` - Automated lineage from transformations (11 columns including mapping_id, schema_fingerprint, lineage_type, source_schema, target_schema)
- `transformations` - Legacy transformation definitions
- `transform_connections` - Transform-specific connections

#### Workflow Orchestration
- `n_step_workflows` - Multi-step workflow definitions
- `n_step_workflow_steps` - Individual workflow step configurations
- `n_step_workflow_runs` - Workflow execution tracking
- `n_step_workflow_run_steps` - Step-level execution details
- `n_step_workflow_assets` - Workflow assets and dependencies
- `visual_workflows` - Visual workflow designer data
- `workflow_steps` - Workflow step definitions
- `workflow_executions` - Workflow execution history

#### Mapping Groups & Batch Processing
- `mapping_groups` - Batch transformation groups with concurrency control
- `mapping_group_members` - Mapping group membership (linked to transformation_mappings)
- `mapping_group_executions` - Group execution tracking

#### Job Management
- `jobs` - Job definitions
- `job_runs` - Job execution history
- `job_history` - Historical job data
- `job_schedules` - Cron-based scheduling
- `job_groups` - Job group organization
- `job_group_jobs` - Group membership
- `job_group_schedules` - Group scheduling
- `job_dependencies` - Job dependency management
- `job_group_dependencies` - Group-level dependencies
- `schedules` - Unified scheduler (cron + interval)

#### Data Quality & Profiling
- `profiling_metrics` - File profiling metrics
- `anomalies` - Detected data anomalies with severity tracking
- `quality_reports` - Quality assessment reports
- `alert_rules` - Configurable alert rules
- `alert_history` - Alert trigger history

#### File Insights & Metrics (18-month retention)
- `file_pattern_metrics` - Daily file pattern metrics aggregation
- `file_pattern_metrics_weekly` - Weekly rollup materialized view
- `file_pattern_metrics_monthly` - Monthly rollup materialized view

#### User Management & Security
- `users` - User accounts
- `user_uuid_mapping` - UUID to user mapping
- `roles` - Role definitions
- `permissions` - Permission catalog
- `user_roles` - User-role assignments
- `role_permissions` - Role-permission mappings
- `user_groups` - User group membership
- `groups` - Group definitions
- `user_job_groups` - Job group access control
- `user_sessions` - Active user sessions
- `refresh_tokens` - JWT refresh tokens
- `user_badges` - User achievement badges
- `user_dashboard_settings` - User preferences

#### Audit & Compliance (5 audit tables)
- `audit_log` - Comprehensive audit trail with retention policy
- `execution_audit` - Execution-specific audit logs
- `data_access_log` - Data access tracking for compliance
- `security_audit_log` - Security event logging
- `config_change_history` - Configuration change tracking with rollback

#### DBT Integration
- `dbt_models` - DBT model catalog
- `dbt_executions` - DBT run tracking

#### Storage & Connections
- `storage_connections` - Cloud storage connections (AWS S3, GCS, Azure Blob)
- `connections` - Database connections
- `column_mappings` - Column mapping configurations
- `drop_location_config` - File drop location settings

#### Business Processes
- `business_processes` - Business process definitions

### Materialized Views (2)
- `file_pattern_metrics_weekly` - Aggregated weekly metrics with auto-refresh
- `file_pattern_metrics_monthly` - Aggregated monthly metrics with auto-refresh

### Functions (1)
- `refresh_file_pattern_metrics_views()` - Trigger function for automatic materialized view refresh

### Extensions
- `uuid-ossp` - UUID generation support

### Key Features

#### Lineage System
The `transformation_lineage` table supports both:
- **Pattern-based lineage**: Created by scan-and-populate, uses file patterns
- **File-specific lineage**: Created during job execution, uses actual file IDs
- Schema fingerprinting for change detection
- Full source/target schema storage in JSONB

#### File Insights Dashboard
- 18-month metric retention with automatic aggregation
- Daily worker runs at 2 AM
- Materialized views for weekly/monthly rollups
- Auto-refresh triggers on data updates

#### Workflow Orchestration
- Cron-based and interval-based scheduling
- Dependency management with topological sorting
- Retry logic (3 attempts)
- Parallel and sequential execution modes
- Concurrency control (1-10 parallel jobs)

#### Security
- AES-256-CBC encryption for cloud credentials
- Comprehensive audit logging across 5 tables
- Role-based access control (RBAC)
- Data retention policies

## Schema Files

### Complete DDL Dump
The complete database schema with all CREATE statements, indexes, constraints, and triggers is available in:
- **File:** `database_schema_dump.sql`
- **Size:** 5,336 lines
- **Format:** PostgreSQL-compatible SQL

### Usage
To recreate the database schema:
```bash
psql -U username -d database_name -f database_schema_dump.sql
```

## Important Notes

1. **Non-Destructive Migrations**: All table creation uses `CREATE TABLE IF NOT EXISTS` to preserve data
2. **Column Additions**: New columns are added conditionally to avoid errors on restart
3. **Data Persistence**: Lineage and all other data survives server restarts
4. **Indexes**: 19 performance indexes for optimized queries
5. **Sequences**: All tables use SERIAL or BIGSERIAL for auto-incrementing IDs

## Recent Schema Changes

### October 21, 2025
- Fixed `transformation_lineage` table to be non-destructive
- Added 5 new columns to `transformation_lineage`:
  - `mapping_id` (TEXT)
  - `schema_fingerprint` (TEXT)
  - `lineage_type` (VARCHAR(20), default: 'file-specific')
  - `source_schema` (JSONB)
  - `target_schema` (JSONB)
- Created dedicated migration for lineage columns
- Added auto-refresh triggers for file insights materialized views
