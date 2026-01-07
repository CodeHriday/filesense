-- =====================================================
-- DATA FILE OBSERVATORY - Database DDL Script
-- Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')
-- PostgreSQL Version: 16
-- Total Tables: 161
-- =====================================================

-- This script contains the complete database schema including:
-- 1. Sequences
-- 2. Table definitions
-- 3. Primary key constraints
-- 4. Foreign key constraints  
-- 5. Indexes

-- =====================================================
-- SECTION 1: SEQUENCES
-- =====================================================

-- SEQUENCE: access_group_roles_id_seq
CREATE SEQUENCE IF NOT EXISTS access_group_roles_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: access_groups_id_seq
CREATE SEQUENCE IF NOT EXISTS access_groups_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: alert_aggregation_id_seq
CREATE SEQUENCE IF NOT EXISTS alert_aggregation_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: alert_attachments_id_seq
CREATE SEQUENCE IF NOT EXISTS alert_attachments_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: alert_events_id_seq
CREATE SEQUENCE IF NOT EXISTS alert_events_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: alert_history_id_seq
CREATE SEQUENCE IF NOT EXISTS alert_history_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: alert_policies_id_seq
CREATE SEQUENCE IF NOT EXISTS alert_policies_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: alert_policy_recipients_id_seq
CREATE SEQUENCE IF NOT EXISTS alert_policy_recipients_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: alert_rules_id_seq
CREATE SEQUENCE IF NOT EXISTS alert_rules_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: alert_runs_id_seq
CREATE SEQUENCE IF NOT EXISTS alert_runs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: allowed_email_domains_id_seq
CREATE SEQUENCE IF NOT EXISTS allowed_email_domains_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: anomalies_id_seq
CREATE SEQUENCE IF NOT EXISTS anomalies_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: api_tokens_id_seq
CREATE SEQUENCE IF NOT EXISTS api_tokens_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: app_settings_id_seq
CREATE SEQUENCE IF NOT EXISTS app_settings_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: archive_extractions_id_seq
CREATE SEQUENCE IF NOT EXISTS archive_extractions_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: archive_members_id_seq
CREATE SEQUENCE IF NOT EXISTS archive_members_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: archived_files_id_seq
CREATE SEQUENCE IF NOT EXISTS archived_files_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: attribute_definitions_id_seq
CREATE SEQUENCE IF NOT EXISTS attribute_definitions_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: audit_ledger_id_seq
CREATE SEQUENCE IF NOT EXISTS audit_ledger_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: audit_ledger_verification_id_seq
CREATE SEQUENCE IF NOT EXISTS audit_ledger_verification_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: audit_log_audit_id_seq
CREATE SEQUENCE IF NOT EXISTS audit_log_audit_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: audit_retention_settings_id_seq
CREATE SEQUENCE IF NOT EXISTS audit_retention_settings_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: bulk_profiling_files_id_seq
CREATE SEQUENCE IF NOT EXISTS bulk_profiling_files_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: business_processes_id_seq
CREATE SEQUENCE IF NOT EXISTS business_processes_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: column_governance_tag_assignments_assignment_id_seq
CREATE SEQUENCE IF NOT EXISTS column_governance_tag_assignments_assignment_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: column_mappings_id_seq
CREATE SEQUENCE IF NOT EXISTS column_mappings_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: column_policy_assignments_assignment_id_seq
CREATE SEQUENCE IF NOT EXISTS column_policy_assignments_assignment_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: column_sensitivity_tags_tag_id_seq
CREATE SEQUENCE IF NOT EXISTS column_sensitivity_tags_tag_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: config_change_history_change_id_seq
CREATE SEQUENCE IF NOT EXISTS config_change_history_change_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: connections_id_seq
CREATE SEQUENCE IF NOT EXISTS connections_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: data_access_log_access_id_seq
CREATE SEQUENCE IF NOT EXISTS data_access_log_access_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: dbt_executions_execution_id_seq
CREATE SEQUENCE IF NOT EXISTS dbt_executions_execution_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: dbt_models_model_id_seq
CREATE SEQUENCE IF NOT EXISTS dbt_models_model_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: dlq_jobs_id_seq
CREATE SEQUENCE IF NOT EXISTS dlq_jobs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: drop_location_config_id_seq
CREATE SEQUENCE IF NOT EXISTS drop_location_config_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: encrypted_passwords_id_seq
CREATE SEQUENCE IF NOT EXISTS encrypted_passwords_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: execution_audit_audit_id_seq
CREATE SEQUENCE IF NOT EXISTS execution_audit_audit_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_audit_details_id_seq
CREATE SEQUENCE IF NOT EXISTS file_audit_details_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_columns_id_seq
CREATE SEQUENCE IF NOT EXISTS file_columns_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_errors_id_seq
CREATE SEQUENCE IF NOT EXISTS file_errors_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_history_id_seq
CREATE SEQUENCE IF NOT EXISTS file_history_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_lineage_id_seq
CREATE SEQUENCE IF NOT EXISTS file_lineage_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_mappings_id_seq
CREATE SEQUENCE IF NOT EXISTS file_mappings_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_ownership_ownership_id_seq
CREATE SEQUENCE IF NOT EXISTS file_ownership_ownership_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_pattern_metrics_id_seq
CREATE SEQUENCE IF NOT EXISTS file_pattern_metrics_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_policy_assignments_assignment_id_seq
CREATE SEQUENCE IF NOT EXISTS file_policy_assignments_assignment_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_preview_data_preview_id_seq
CREATE SEQUENCE IF NOT EXISTS file_preview_data_preview_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_processing_artifacts_id_seq
CREATE SEQUENCE IF NOT EXISTS file_processing_artifacts_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_quality_checks_id_seq
CREATE SEQUENCE IF NOT EXISTS file_quality_checks_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_quality_rules_id_seq
CREATE SEQUENCE IF NOT EXISTS file_quality_rules_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_restorations_id_seq
CREATE SEQUENCE IF NOT EXISTS file_restorations_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_schedules_id_seq
CREATE SEQUENCE IF NOT EXISTS file_schedules_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_schema_details_id_seq
CREATE SEQUENCE IF NOT EXISTS file_schema_details_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_schemas_id_seq
CREATE SEQUENCE IF NOT EXISTS file_schemas_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: file_tag_assignments_assignment_id_seq
CREATE SEQUENCE IF NOT EXISTS file_tag_assignments_assignment_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: files_id_seq
CREATE SEQUENCE IF NOT EXISTS files_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: fixed_width_schemas_id_seq
CREATE SEQUENCE IF NOT EXISTS fixed_width_schemas_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: frontend_audit_log_audit_id_seq
CREATE SEQUENCE IF NOT EXISTS frontend_audit_log_audit_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: groups_id_seq
CREATE SEQUENCE IF NOT EXISTS groups_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: idempotency_keys_id_seq
CREATE SEQUENCE IF NOT EXISTS idempotency_keys_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: job_dependencies_dependency_id_seq
CREATE SEQUENCE IF NOT EXISTS job_dependencies_dependency_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: job_group_dependencies_group_dependency_id_seq
CREATE SEQUENCE IF NOT EXISTS job_group_dependencies_group_dependency_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: job_group_schedules_group_schedule_id_seq
CREATE SEQUENCE IF NOT EXISTS job_group_schedules_group_schedule_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: job_history_id_seq
CREATE SEQUENCE IF NOT EXISTS job_history_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: job_runs_id_seq
CREATE SEQUENCE IF NOT EXISTS job_runs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: job_schedules_id_seq
CREATE SEQUENCE IF NOT EXISTS job_schedules_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: jobs_id_seq
CREATE SEQUENCE IF NOT EXISTS jobs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: lineage_views_id_seq
CREATE SEQUENCE IF NOT EXISTS lineage_views_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: logical_file_groups_id_seq
CREATE SEQUENCE IF NOT EXISTS logical_file_groups_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: mapping_group_executions_id_seq
CREATE SEQUENCE IF NOT EXISTS mapping_group_executions_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: mapping_group_members_id_seq
CREATE SEQUENCE IF NOT EXISTS mapping_group_members_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: mapping_groups_id_seq
CREATE SEQUENCE IF NOT EXISTS mapping_groups_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: mapping_job_errors_id_seq
CREATE SEQUENCE IF NOT EXISTS mapping_job_errors_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: migrations_id_seq
CREATE SEQUENCE IF NOT EXISTS migrations_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: n_step_workflow_assets_id_seq
CREATE SEQUENCE IF NOT EXISTS n_step_workflow_assets_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: n_step_workflow_run_steps_id_seq
CREATE SEQUENCE IF NOT EXISTS n_step_workflow_run_steps_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: n_step_workflow_runs_id_seq
CREATE SEQUENCE IF NOT EXISTS n_step_workflow_runs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: n_step_workflow_steps_id_seq
CREATE SEQUENCE IF NOT EXISTS n_step_workflow_steps_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: n_step_workflows_id_seq
CREATE SEQUENCE IF NOT EXISTS n_step_workflows_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: notifications_id_seq
CREATE SEQUENCE IF NOT EXISTS notifications_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: password_reset_requests_id_seq
CREATE SEQUENCE IF NOT EXISTS password_reset_requests_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: permissions_id_seq
CREATE SEQUENCE IF NOT EXISTS permissions_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: processing_events_id_seq
CREATE SEQUENCE IF NOT EXISTS processing_events_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: profiling_metrics_id_seq
CREATE SEQUENCE IF NOT EXISTS profiling_metrics_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: projects_id_seq
CREATE SEQUENCE IF NOT EXISTS projects_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: quality_rule_configurations_id_seq
CREATE SEQUENCE IF NOT EXISTS quality_rule_configurations_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: quality_rule_violations_id_seq
CREATE SEQUENCE IF NOT EXISTS quality_rule_violations_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: quality_rules_id_seq
CREATE SEQUENCE IF NOT EXISTS quality_rules_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: rbac_policies_id_seq
CREATE SEQUENCE IF NOT EXISTS rbac_policies_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: resource_attributes_id_seq
CREATE SEQUENCE IF NOT EXISTS resource_attributes_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: retention_policies_id_seq
CREATE SEQUENCE IF NOT EXISTS retention_policies_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: retention_policy_runs_id_seq
CREATE SEQUENCE IF NOT EXISTS retention_policy_runs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: roles_id_seq
CREATE SEQUENCE IF NOT EXISTS roles_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: schedules_id_seq
CREATE SEQUENCE IF NOT EXISTS schedules_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: schema_migrations_id_seq
CREATE SEQUENCE IF NOT EXISTS schema_migrations_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: schema_validation_job_files_id_seq
CREATE SEQUENCE IF NOT EXISTS schema_validation_job_files_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: schema_validation_jobs_id_seq
CREATE SEQUENCE IF NOT EXISTS schema_validation_jobs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: scim_configurations_id_seq
CREATE SEQUENCE IF NOT EXISTS scim_configurations_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: scim_resource_mappings_id_seq
CREATE SEQUENCE IF NOT EXISTS scim_resource_mappings_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: scim_sync_logs_id_seq
CREATE SEQUENCE IF NOT EXISTS scim_sync_logs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: security_audit_log_security_audit_id_seq
CREATE SEQUENCE IF NOT EXISTS security_audit_log_security_audit_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: sub_project_access_groups_id_seq
CREATE SEQUENCE IF NOT EXISTS sub_project_access_groups_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: sub_project_members_id_seq
CREATE SEQUENCE IF NOT EXISTS sub_project_members_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: tag_permissions_id_seq
CREATE SEQUENCE IF NOT EXISTS tag_permissions_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: transform_connections_id_seq
CREATE SEQUENCE IF NOT EXISTS transform_connections_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: transformation_executions_id_seq
CREATE SEQUENCE IF NOT EXISTS transformation_executions_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: transformation_jobs_id_seq
CREATE SEQUENCE IF NOT EXISTS transformation_jobs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: transformation_lineage_id_seq
CREATE SEQUENCE IF NOT EXISTS transformation_lineage_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: transformation_logs_id_seq
CREATE SEQUENCE IF NOT EXISTS transformation_logs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: transformation_mappings_id_seq
CREATE SEQUENCE IF NOT EXISTS transformation_mappings_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: transformation_outputs_id_seq
CREATE SEQUENCE IF NOT EXISTS transformation_outputs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: transformation_quality_rules_id_seq
CREATE SEQUENCE IF NOT EXISTS transformation_quality_rules_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: transformations_id_seq
CREATE SEQUENCE IF NOT EXISTS transformations_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: upload_batches_id_seq
CREATE SEQUENCE IF NOT EXISTS upload_batches_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: upload_file_records_id_seq
CREATE SEQUENCE IF NOT EXISTS upload_file_records_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: upload_files_id_seq
CREATE SEQUENCE IF NOT EXISTS upload_files_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: user_attributes_id_seq
CREATE SEQUENCE IF NOT EXISTS user_attributes_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: user_badges_id_seq
CREATE SEQUENCE IF NOT EXISTS user_badges_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: user_dashboard_settings_id_seq
CREATE SEQUENCE IF NOT EXISTS user_dashboard_settings_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: user_sessions_id_seq
CREATE SEQUENCE IF NOT EXISTS user_sessions_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: users_id_seq
CREATE SEQUENCE IF NOT EXISTS users_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: vendor_agreement_approvals_id_seq
CREATE SEQUENCE IF NOT EXISTS vendor_agreement_approvals_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: vendor_agreement_changes_id_seq
CREATE SEQUENCE IF NOT EXISTS vendor_agreement_changes_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: vendor_agreement_documents_id_seq
CREATE SEQUENCE IF NOT EXISTS vendor_agreement_documents_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: vendor_agreement_file_schemas_id_seq
CREATE SEQUENCE IF NOT EXISTS vendor_agreement_file_schemas_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: vendor_agreements_id_seq
CREATE SEQUENCE IF NOT EXISTS vendor_agreements_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: vendor_file_profiling_results_id_seq
CREATE SEQUENCE IF NOT EXISTS vendor_file_profiling_results_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: vendor_sla_violations_id_seq
CREATE SEQUENCE IF NOT EXISTS vendor_sla_violations_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: vendor_users_id_seq
CREATE SEQUENCE IF NOT EXISTS vendor_users_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: vendors_id_seq
CREATE SEQUENCE IF NOT EXISTS vendors_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: visual_lineage_graphs_id_seq
CREATE SEQUENCE IF NOT EXISTS visual_lineage_graphs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: visual_mapping_defs_id_seq
CREATE SEQUENCE IF NOT EXISTS visual_mapping_defs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: visual_mapping_edges_id_seq
CREATE SEQUENCE IF NOT EXISTS visual_mapping_edges_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: visual_mapping_execution_logs_id_seq
CREATE SEQUENCE IF NOT EXISTS visual_mapping_execution_logs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: visual_mapping_executions_id_seq
CREATE SEQUENCE IF NOT EXISTS visual_mapping_executions_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: visual_mapping_nodes_id_seq
CREATE SEQUENCE IF NOT EXISTS visual_mapping_nodes_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: visual_workflow_execution_logs_id_seq
CREATE SEQUENCE IF NOT EXISTS visual_workflow_execution_logs_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: visual_workflow_executions_id_seq
CREATE SEQUENCE IF NOT EXISTS visual_workflow_executions_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: visual_workflows_id_seq
CREATE SEQUENCE IF NOT EXISTS visual_workflows_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: workflow_executions_id_seq
CREATE SEQUENCE IF NOT EXISTS workflow_executions_id_seq START WITH 1 INCREMENT BY 1;
-- SEQUENCE: workflow_steps_id_seq
CREATE SEQUENCE IF NOT EXISTS workflow_steps_id_seq START WITH 1 INCREMENT BY 1;

-- =====================================================
-- SECTION 2: TABLE DEFINITIONS
-- =====================================================


-- TABLE: access_group_members
CREATE TABLE access_group_members (
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  source VARCHAR(50) DEFAULT 'MANUAL'::character varying,
  added_by INTEGER,
  added_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: access_group_roles
CREATE TABLE access_group_roles (
  group_id INTEGER,
  role_id INTEGER,
  project_id INTEGER,
  assigned_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  id INTEGER DEFAULT nextval('access_group_roles_id_seq'::regclass) NOT NULL
);

-- TABLE: access_groups
CREATE TABLE access_groups (
  id INTEGER DEFAULT nextval('access_groups_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  group_type VARCHAR(50) DEFAULT 'MANUAL'::character varying,
  idp_source VARCHAR(100),
  external_group_id VARCHAR(255),
  sync_enabled BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMP WITHOUT TIME ZONE,
  sync_status VARCHAR(50),
  sync_error TEXT,
  created_by INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: alert_aggregation
CREATE TABLE alert_aggregation (
  id INTEGER DEFAULT nextval('alert_aggregation_id_seq'::regclass) NOT NULL,
  policy_id INTEGER NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  occurred_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  metadata JSONB,
  aggregation_ttl TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: alert_attachments
CREATE TABLE alert_attachments (
  id INTEGER DEFAULT nextval('alert_attachments_id_seq'::regclass) NOT NULL,
  run_id INTEGER NOT NULL,
  attachment_type VARCHAR(50) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  storage_type VARCHAR(50) NOT NULL,
  storage_path TEXT,
  cloud_url TEXT,
  expires_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: alert_events
CREATE TABLE alert_events (
  id INTEGER DEFAULT nextval('alert_events_id_seq'::regclass) NOT NULL,
  run_id INTEGER NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  occurred_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  vendor_sla_violation_id INTEGER
);

-- TABLE: alert_history
CREATE TABLE alert_history (
  id INTEGER DEFAULT nextval('alert_history_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255),
  rule_id INTEGER,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  alert_details JSONB
);

-- TABLE: alert_policies
CREATE TABLE alert_policies (
  id INTEGER DEFAULT nextval('alert_policies_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  project_id INTEGER NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255),
  trigger_events JSONB DEFAULT '[]'::jsonb NOT NULL,
  consolidate_alerts BOOLEAN DEFAULT true NOT NULL,
  consolidation_window_minutes INTEGER DEFAULT 60 NOT NULL,
  email_connection_id VARCHAR(255),
  enabled BOOLEAN DEFAULT true NOT NULL,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: alert_policy_recipients
CREATE TABLE alert_policy_recipients (
  id INTEGER DEFAULT nextval('alert_policy_recipients_id_seq'::regclass) NOT NULL,
  policy_id INTEGER NOT NULL,
  user_id INTEGER,
  email VARCHAR(255),
  delivery_method VARCHAR(50) DEFAULT 'email'::character varying NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: alert_rules
CREATE TABLE alert_rules (
  id INTEGER DEFAULT nextval('alert_rules_id_seq'::regclass) NOT NULL,
  rule_name VARCHAR(255) NOT NULL,
  rule_type VARCHAR(50) NOT NULL,
  rule_condition VARCHAR(50) NOT NULL,
  rule_value TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: alert_runs
CREATE TABLE alert_runs (
  id INTEGER DEFAULT nextval('alert_runs_id_seq'::regclass) NOT NULL,
  policy_id INTEGER NOT NULL,
  run_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  email_connection_id VARCHAR(255),
  recipients_count INTEGER DEFAULT 0 NOT NULL,
  sent_at TIMESTAMP WITHOUT TIME ZONE,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: allowed_email_domains
CREATE TABLE allowed_email_domains (
  id INTEGER DEFAULT nextval('allowed_email_domains_id_seq'::regclass) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: anomalies
CREATE TABLE anomalies (
  id INTEGER DEFAULT nextval('anomalies_id_seq'::regclass) NOT NULL,
  anomaly_id VARCHAR(255) NOT NULL,
  file_id VARCHAR(255),
  file_name VARCHAR(500),
  mapping_id VARCHAR(255),
  job_id VARCHAR(255),
  anomaly_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  anomaly_details JSONB,
  expected_value TEXT,
  actual_value TEXT,
  deviation_percentage NUMERIC(10,2),
  status VARCHAR(50) DEFAULT 'open'::character varying,
  resolved_at TIMESTAMP WITHOUT TIME ZONE,
  resolved_by VARCHAR(255),
  resolution_notes TEXT,
  detected_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: api_tokens
CREATE TABLE api_tokens (
  id INTEGER DEFAULT nextval('api_tokens_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  token_prefix VARCHAR(20) NOT NULL,
  user_id INTEGER,
  project_id INTEGER,
  scopes JSONB DEFAULT '[]'::jsonb NOT NULL,
  rate_limit INTEGER DEFAULT 100,
  rate_window_hours INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITHOUT TIME ZONE,
  last_used_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  created_by INTEGER,
  revoked_at TIMESTAMP WITHOUT TIME ZONE,
  revoked_by INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- TABLE: app_settings
CREATE TABLE app_settings (
  id INTEGER DEFAULT nextval('app_settings_id_seq'::regclass) NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: archive_extractions
CREATE TABLE archive_extractions (
  id INTEGER DEFAULT nextval('archive_extractions_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  archive_type VARCHAR(50) NOT NULL,
  is_encrypted BOOLEAN DEFAULT false,
  password_required BOOLEAN DEFAULT false,
  extraction_status VARCHAR(50) DEFAULT 'pending'::character varying,
  error_message TEXT,
  extracted_count INTEGER DEFAULT 0,
  started_at TIMESTAMP WITHOUT TIME ZONE,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: archive_members
CREATE TABLE archive_members (
  id INTEGER DEFAULT nextval('archive_members_id_seq'::regclass) NOT NULL,
  parent_file_id VARCHAR(255) NOT NULL,
  extracted_file_id VARCHAR(255),
  logical_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_format VARCHAR(20),
  file_size_bytes BIGINT,
  extraction_status VARCHAR(50) DEFAULT 'pending'::character varying,
  error_message TEXT,
  extracted_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE
);

-- TABLE: archived_files
CREATE TABLE archived_files (
  id INTEGER DEFAULT nextval('archived_files_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  original_filename VARCHAR(500),
  original_path VARCHAR(1000),
  original_size_bytes BIGINT,
  policy_id INTEGER,
  archive_storage_type VARCHAR(50) NOT NULL,
  archive_connection_id UUID,
  archive_path VARCHAR(1000) NOT NULL,
  archive_checksum VARCHAR(64),
  archived_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  archived_by INTEGER,
  archive_reason TEXT,
  original_metadata JSONB,
  quality_score NUMERIC(5,2),
  row_count INTEGER,
  column_count INTEGER,
  file_type VARCHAR(50),
  is_restored BOOLEAN DEFAULT false,
  restored_at TIMESTAMP WITHOUT TIME ZONE,
  restored_by INTEGER,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP WITHOUT TIME ZONE,
  deleted_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: attribute_definitions
CREATE TABLE attribute_definitions (
  id INTEGER DEFAULT nextval('attribute_definitions_id_seq'::regclass) NOT NULL,
  attribute_key VARCHAR(100) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  attribute_type VARCHAR(50) NOT NULL,
  scope VARCHAR(50) NOT NULL,
  allowed_values JSONB,
  validation_regex VARCHAR(255),
  min_value NUMERIC,
  max_value NUMERIC,
  is_required BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: audit_ledger
CREATE TABLE audit_ledger (
  id BIGINT DEFAULT nextval('audit_ledger_id_seq'::regclass) NOT NULL,
  entry_id UUID DEFAULT gen_random_uuid() NOT NULL,
  tenant_id VARCHAR(255) DEFAULT 'default'::character varying,
  job_id VARCHAR(255),
  correlation_id VARCHAR(255),
  parent_entry_id UUID,
  actor_id VARCHAR(255),
  actor_email VARCHAR(255),
  actor_role VARCHAR(100),
  actor_ip INET,
  action_type VARCHAR(100) NOT NULL,
  action_category VARCHAR(50) DEFAULT 'EXECUTION'::character varying NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  entity_name VARCHAR(500),
  log_level VARCHAR(20) DEFAULT 'INFO'::character varying NOT NULL,
  message TEXT NOT NULL,
  payload JSONB,
  event_timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  sequence_number BIGINT NOT NULL,
  prev_hash VARCHAR(64),
  record_hash VARCHAR(64) NOT NULL,
  signature TEXT,
  signature_algorithm VARCHAR(50),
  source_system VARCHAR(100) DEFAULT 'data_observatory'::character varying,
  version VARCHAR(20) DEFAULT '1.0'::character varying
);

-- TABLE: audit_ledger_sequence
CREATE TABLE audit_ledger_sequence (
  tenant_id VARCHAR(255) DEFAULT 'default'::character varying NOT NULL,
  current_sequence BIGINT DEFAULT 0 NOT NULL,
  last_hash VARCHAR(64),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: audit_ledger_verification
CREATE TABLE audit_ledger_verification (
  id INTEGER DEFAULT nextval('audit_ledger_verification_id_seq'::regclass) NOT NULL,
  verification_id UUID DEFAULT gen_random_uuid() NOT NULL,
  tenant_id VARCHAR(255) DEFAULT 'default'::character varying NOT NULL,
  start_sequence BIGINT NOT NULL,
  end_sequence BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  entries_verified BIGINT DEFAULT 0 NOT NULL,
  entries_failed BIGINT DEFAULT 0 NOT NULL,
  first_failed_sequence BIGINT,
  failure_reason TEXT,
  started_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  duration_ms BIGINT,
  verified_by VARCHAR(255),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: audit_log
CREATE TABLE audit_log (
  audit_id BIGINT DEFAULT nextval('audit_log_audit_id_seq'::regclass) NOT NULL,
  "timestamp" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  user_id VARCHAR(255),
  user_email VARCHAR(255),
  user_role VARCHAR(100),
  ip_address INET,
  session_id VARCHAR(255),
  action_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(255),
  entity_name VARCHAR(255),
  operation VARCHAR(50),
  old_values JSONB,
  new_values JSONB,
  changes JSONB,
  parent_audit_id BIGINT,
  request_id VARCHAR(255),
  api_endpoint VARCHAR(255),
  http_method VARCHAR(10),
  status VARCHAR(50),
  error_message TEXT,
  metadata JSONB,
  retention_until TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: audit_log_archive
CREATE TABLE audit_log_archive (
  audit_id BIGINT NOT NULL,
  "timestamp" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  user_id VARCHAR(255),
  user_email VARCHAR(255),
  user_role VARCHAR(100),
  ip_address INET,
  session_id VARCHAR(255),
  action_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  entity_name VARCHAR(255),
  operation VARCHAR(50),
  old_values JSONB,
  new_values JSONB,
  changes JSONB,
  parent_audit_id BIGINT,
  request_id VARCHAR(255),
  api_endpoint VARCHAR(255),
  http_method VARCHAR(10),
  status VARCHAR(50),
  error_message TEXT,
  metadata JSONB,
  retention_until TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE,
  archived_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: audit_retention_settings
CREATE TABLE audit_retention_settings (
  id INTEGER DEFAULT nextval('audit_retention_settings_id_seq'::regclass) NOT NULL,
  retention_days INTEGER DEFAULT 30 NOT NULL,
  auto_archive_enabled BOOLEAN DEFAULT true,
  auto_delete_enabled BOOLEAN DEFAULT false,
  last_archive_run TIMESTAMP WITHOUT TIME ZONE,
  last_cleanup_run TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: bulk_profiling_files
CREATE TABLE bulk_profiling_files (
  id INTEGER DEFAULT nextval('bulk_profiling_files_id_seq'::regclass) NOT NULL,
  job_id VARCHAR(36) NOT NULL,
  file_path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT,
  file_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  file_id VARCHAR(255),
  error_message TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITHOUT TIME ZONE,
  completed_at TIMESTAMP WITHOUT TIME ZONE
);

-- TABLE: bulk_profiling_jobs
CREATE TABLE bulk_profiling_jobs (
  id VARCHAR(36) NOT NULL,
  job_name VARCHAR(255) NOT NULL,
  project_id INTEGER,
  connection_id VARCHAR(255) NOT NULL,
  s3_path TEXT NOT NULL,
  file_pattern VARCHAR(255) DEFAULT '*'::character varying,
  duplicate_handling VARCHAR(50) DEFAULT 'skip'::character varying,
  recursive BOOLEAN DEFAULT false,
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  total_files INTEGER DEFAULT 0,
  processed_files INTEGER DEFAULT 0,
  successful_files INTEGER DEFAULT 0,
  failed_files INTEGER DEFAULT 0,
  execution_type VARCHAR(50) DEFAULT 'manual'::character varying,
  error_message TEXT,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITHOUT TIME ZONE,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  schedule_id VARCHAR(36),
  skipped_files INTEGER DEFAULT 0,
  sub_project_id INTEGER,
  quality_rule_ids _int4
);

-- TABLE: business_processes
CREATE TABLE business_processes (
  id INTEGER DEFAULT nextval('business_processes_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  group_id INTEGER,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  project_id INTEGER NOT NULL
);

-- TABLE: column_governance_tag_assignments
CREATE TABLE column_governance_tag_assignments (
  assignment_id INTEGER DEFAULT nextval('column_governance_tag_assignments_assignment_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  column_name VARCHAR(255) NOT NULL,
  tag_id VARCHAR(255) NOT NULL,
  assigned_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: column_mappings
CREATE TABLE column_mappings (
  id INTEGER DEFAULT nextval('column_mappings_id_seq'::regclass) NOT NULL,
  mapping_name VARCHAR(255) NOT NULL,
  source_file_id VARCHAR(255),
  target_file_type VARCHAR(50) NOT NULL,
  mapping_config JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP WITH TIME ZONE
);

-- TABLE: column_policy_assignments
CREATE TABLE column_policy_assignments (
  assignment_id INTEGER DEFAULT nextval('column_policy_assignments_assignment_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  column_name VARCHAR(255) NOT NULL,
  policy_id VARCHAR(255) NOT NULL,
  assigned_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: column_sensitivity_tags
CREATE TABLE column_sensitivity_tags (
  tag_id INTEGER DEFAULT nextval('column_sensitivity_tags_tag_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  column_name VARCHAR(255) NOT NULL,
  sensitivity_level VARCHAR(50) NOT NULL,
  data_type VARCHAR(100),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  tagged_by VARCHAR(255),
  tagged_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: config_change_history
CREATE TABLE config_change_history (
  change_id BIGINT DEFAULT nextval('config_change_history_change_id_seq'::regclass) NOT NULL,
  "timestamp" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  changed_by_user VARCHAR(255) NOT NULL,
  changed_by_role VARCHAR(100),
  config_type VARCHAR(100),
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  field_name VARCHAR(255),
  old_value TEXT,
  new_value TEXT,
  change_reason TEXT,
  ticket_reference VARCHAR(100),
  requires_approval BOOLEAN DEFAULT false,
  approved_by VARCHAR(255),
  approved_at TIMESTAMP WITHOUT TIME ZONE,
  can_rollback BOOLEAN DEFAULT true,
  rollback_script TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: config_change_history_archive
CREATE TABLE config_change_history_archive (
  change_id BIGINT NOT NULL,
  "timestamp" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  changed_by_user VARCHAR(255) NOT NULL,
  changed_by_role VARCHAR(100),
  config_type VARCHAR(100),
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  field_name VARCHAR(255),
  old_value TEXT,
  new_value TEXT,
  change_reason TEXT,
  ticket_reference VARCHAR(100),
  requires_approval BOOLEAN DEFAULT false,
  approved_by VARCHAR(255),
  approved_at TIMESTAMP WITHOUT TIME ZONE,
  can_rollback BOOLEAN DEFAULT true,
  rollback_script TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE,
  archived_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: connections
CREATE TABLE connections (
  id INTEGER DEFAULT nextval('connections_id_seq'::regclass) NOT NULL,
  connection_name VARCHAR(255) NOT NULL,
  connection_type VARCHAR(50) NOT NULL,
  host VARCHAR(255),
  port INTEGER,
  username VARCHAR(255),
  password_encrypted VARCHAR(512),
  database_name VARCHAR(255),
  connection_string TEXT,
  parameters JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP WITH TIME ZONE,
  has_archive_password BOOLEAN DEFAULT false
);

-- TABLE: data_access_log
CREATE TABLE data_access_log (
  access_id BIGINT DEFAULT nextval('data_access_log_access_id_seq'::regclass) NOT NULL,
  "timestamp" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  user_id VARCHAR(255),
  user_role VARCHAR(100),
  ip_address INET,
  access_type VARCHAR(50),
  file_id VARCHAR(255),
  file_name VARCHAR(255),
  table_name VARCHAR(255),
  column_names _text,
  access_method VARCHAR(100),
  query_text TEXT,
  filters_applied JSONB,
  rows_accessed BIGINT,
  bytes_accessed BIGINT,
  access_purpose TEXT,
  project_name VARCHAR(255),
  contains_pii BOOLEAN DEFAULT false,
  data_classification VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: data_access_log_archive
CREATE TABLE data_access_log_archive (
  access_id BIGINT NOT NULL,
  "timestamp" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  user_role VARCHAR(100),
  ip_address INET,
  access_type VARCHAR(50),
  file_id VARCHAR(255),
  file_name VARCHAR(255),
  table_name VARCHAR(255),
  column_names _text,
  access_method VARCHAR(100),
  query_text TEXT,
  filters_applied JSONB,
  rows_accessed BIGINT,
  bytes_accessed BIGINT,
  access_purpose TEXT,
  project_name VARCHAR(255),
  contains_pii BOOLEAN DEFAULT false,
  data_classification VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE,
  archived_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: dbt_executions
CREATE TABLE dbt_executions (
  execution_id INTEGER DEFAULT nextval('dbt_executions_execution_id_seq'::regclass) NOT NULL,
  execution_uuid VARCHAR(255) NOT NULL,
  command VARCHAR(255) NOT NULL,
  models_selector VARCHAR(255),
  triggered_by VARCHAR(255),
  trigger_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  started_at TIMESTAMP WITHOUT TIME ZONE,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  duration_ms BIGINT,
  models_run INTEGER DEFAULT 0,
  models_success INTEGER DEFAULT 0,
  models_failed INTEGER DEFAULT 0,
  models_skipped INTEGER DEFAULT 0,
  tests_run INTEGER DEFAULT 0,
  tests_passed INTEGER DEFAULT 0,
  tests_failed INTEGER DEFAULT 0,
  results JSONB,
  logs TEXT,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: dbt_models
CREATE TABLE dbt_models (
  model_id INTEGER DEFAULT nextval('dbt_models_model_id_seq'::regclass) NOT NULL,
  model_name VARCHAR(255) NOT NULL,
  model_path VARCHAR(500) NOT NULL,
  model_type VARCHAR(50),
  materialization VARCHAR(50),
  description TEXT,
  tags _text,
  upstream_models _text,
  downstream_models _text,
  source_tables _text,
  last_compiled_at TIMESTAMP WITHOUT TIME ZONE,
  last_run_at TIMESTAMP WITHOUT TIME ZONE,
  last_run_status VARCHAR(50),
  last_run_duration_ms BIGINT,
  row_count BIGINT,
  byte_size BIGINT,
  config JSONB,
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: dlq_jobs
CREATE TABLE dlq_jobs (
  id INTEGER DEFAULT nextval('dlq_jobs_id_seq'::regclass) NOT NULL,
  job_type VARCHAR(50) NOT NULL,
  file_id VARCHAR(255),
  project_id INTEGER,
  vendor_agreement_id INTEGER,
  original_payload JSONB,
  error_code VARCHAR(100) NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  remediation_instructions TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by INTEGER,
  resolution_notes TEXT
);

-- TABLE: drop_location_config
CREATE TABLE drop_location_config (
  id INTEGER DEFAULT nextval('drop_location_config_id_seq'::regclass) NOT NULL,
  storage_type VARCHAR(50) DEFAULT 's3'::character varying NOT NULL,
  region VARCHAR(100),
  bucket VARCHAR(255) NOT NULL,
  path_prefix VARCHAR(500),
  access_key_id TEXT,
  secret_access_key TEXT,
  endpoint VARCHAR(500),
  use_ssl BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_by INTEGER,
  provider VARCHAR(50) DEFAULT 'aws'::character varying,
  project_id VARCHAR(255),
  service_account_json TEXT,
  gcp_bucket VARCHAR(255),
  account_name VARCHAR(255),
  account_key TEXT,
  container_name VARCHAR(255),
  azure_endpoint VARCHAR(500)
);

-- TABLE: encrypted_passwords
CREATE TABLE encrypted_passwords (
  id INTEGER DEFAULT nextval('encrypted_passwords_id_seq'::regclass) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id TEXT NOT NULL,
  secret_ciphertext TEXT NOT NULL,
  encryption_version VARCHAR(20) DEFAULT 'v1'::character varying NOT NULL,
  iv TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  rotation_scheduled_at TIMESTAMP WITH TIME ZONE,
  auth_tag TEXT
);

-- TABLE: execution_audit
CREATE TABLE execution_audit (
  audit_id BIGINT DEFAULT nextval('execution_audit_audit_id_seq'::regclass) NOT NULL,
  execution_id VARCHAR(255) NOT NULL,
  "timestamp" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  execution_type VARCHAR(50),
  entity_id VARCHAR(255),
  entity_name VARCHAR(255),
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  status_reason TEXT,
  cpu_usage_percent NUMERIC(5,2),
  memory_usage_mb INTEGER,
  rows_processed BIGINT,
  records_affected BIGINT,
  quality_score NUMERIC(5,2),
  validation_errors JSONB,
  triggered_by_user VARCHAR(255),
  trigger_type VARCHAR(50),
  parent_execution_id VARCHAR(255),
  execution_duration_ms BIGINT,
  database_queries_count INTEGER,
  network_requests_count INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: execution_audit_archive
CREATE TABLE execution_audit_archive (
  audit_id BIGINT NOT NULL,
  execution_id VARCHAR(255) NOT NULL,
  "timestamp" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  execution_type VARCHAR(50),
  entity_id VARCHAR(255),
  entity_name VARCHAR(255),
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  status_reason TEXT,
  cpu_usage_percent NUMERIC(5,2),
  memory_usage_mb INTEGER,
  rows_processed BIGINT,
  records_affected BIGINT,
  quality_score NUMERIC(5,2),
  validation_errors JSONB,
  triggered_by_user VARCHAR(255),
  trigger_type VARCHAR(50),
  parent_execution_id VARCHAR(255),
  execution_duration_ms BIGINT,
  database_queries_count INTEGER,
  network_requests_count INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE,
  archived_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: file_audit_details
CREATE TABLE file_audit_details (
  id INTEGER DEFAULT nextval('file_audit_details_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(500),
  file_schema_id VARCHAR(255),
  file_hash VARCHAR(255),
  file_pattern VARCHAR(500),
  file_type VARCHAR(100),
  file_delimiter VARCHAR(10),
  encoding VARCHAR(50),
  number_of_columns INTEGER,
  source VARCHAR(255),
  source_path TEXT,
  no_of_records_in_source BIGINT,
  load_step_1 VARCHAR(255),
  load_step_1_path TEXT,
  load_step_1_rec_cnt BIGINT,
  load_type VARCHAR(100),
  correlation_id VARCHAR(255),
  parent_audit_id INTEGER,
  user_id INTEGER,
  user_email VARCHAR(255),
  ip_address INET,
  session_id VARCHAR(255),
  processing_duration_ms INTEGER,
  status VARCHAR(50) DEFAULT 'success'::character varying,
  error_message TEXT,
  error_type VARCHAR(100),
  retention_until TIMESTAMP WITHOUT TIME ZONE,
  created_dt TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  transformation_job_id INTEGER,
  file_size_bytes BIGINT,
  mapping_name VARCHAR(500),
  file_role VARCHAR(20) DEFAULT NULL::character varying
);

-- TABLE: file_columns
CREATE TABLE file_columns (
  id INTEGER DEFAULT nextval('file_columns_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255),
  column_name VARCHAR(255) NOT NULL,
  column_type VARCHAR(50) NOT NULL,
  column_index INTEGER NOT NULL,
  null_count INTEGER,
  unique_count INTEGER,
  min_value TEXT,
  max_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  file_name VARCHAR(255),
  most_frequent_value TEXT,
  least_frequent_value TEXT,
  min_value_decimal NUMERIC(30,6),
  max_value_decimal NUMERIC(30,6),
  top_values JSON,
  most_frequent_count INTEGER,
  least_frequent_count INTEGER,
  min_frequency INTEGER,
  max_frequency INTEGER,
  min_is_frequent BOOLEAN,
  max_is_frequent BOOLEAN,
  patterns JSONB,
  retention_until TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() + '1 year 6 mons'::interval),
  profile_timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  file_role VARCHAR(20) DEFAULT 'adhoc'::character varying,
  null_percentage NUMERIC(5,2)
);

-- TABLE: file_errors
CREATE TABLE file_errors (
  id INTEGER DEFAULT nextval('file_errors_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  error_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) DEFAULT 'error'::character varying NOT NULL,
  row_number INTEGER,
  column_name VARCHAR(255),
  error_message TEXT NOT NULL,
  error_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'new'::character varying,
  processing_action VARCHAR(20),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  record_snapshot JSONB
);

-- TABLE: file_history
CREATE TABLE file_history (
  id INTEGER DEFAULT nextval('file_history_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255),
  row_count INTEGER,
  column_count INTEGER,
  quality_score NUMERIC(5,2),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  changes_detected JSONB
);

-- TABLE: file_lineage
CREATE TABLE file_lineage (
  id INTEGER DEFAULT nextval('file_lineage_id_seq'::regclass) NOT NULL,
  source_file_id VARCHAR(255) NOT NULL,
  target_file_id VARCHAR(255) NOT NULL,
  relationship_type VARCHAR(50) NOT NULL,
  transformation_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: file_mappings
CREATE TABLE file_mappings (
  id INTEGER DEFAULT nextval('file_mappings_id_seq'::regclass) NOT NULL,
  mapping_name VARCHAR(255) NOT NULL,
  source_file_id VARCHAR(255) NOT NULL,
  source_filename VARCHAR(255),
  target_file_type VARCHAR(50) DEFAULT 'csv'::character varying,
  mapping_rules JSON DEFAULT '{}'::json,
  mapping_config JSON DEFAULT '{}'::json,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: file_ownership
CREATE TABLE file_ownership (
  ownership_id INTEGER DEFAULT nextval('file_ownership_ownership_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  owner_user_id INTEGER,
  owner_name VARCHAR(255),
  owner_email VARCHAR(255),
  owner_contact VARCHAR(100),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  sensitivity_level VARCHAR(50) DEFAULT 'Public'::character varying,
  creator_user_id INTEGER,
  creator_name VARCHAR(255),
  creator_email VARCHAR(255)
);

-- TABLE: file_pattern_metrics
CREATE TABLE file_pattern_metrics (
  id INTEGER DEFAULT nextval('file_pattern_metrics_id_seq'::regclass) NOT NULL,
  file_pattern VARCHAR(500) NOT NULL,
  metric_date DATE NOT NULL,
  record_count BIGINT DEFAULT 0,
  file_count INTEGER DEFAULT 1,
  duplicate_count BIGINT DEFAULT 0,
  duplicate_percentage NUMERIC(5,2) DEFAULT 0,
  null_counts JSONB DEFAULT '{}'::jsonb,
  null_percentages JSONB DEFAULT '{}'::jsonb,
  numeric_stats JSONB DEFAULT '{}'::jsonb,
  string_stats JSONB DEFAULT '{}'::jsonb,
  completeness_score NUMERIC(5,2),
  consistency_score NUMERIC(5,2),
  validity_score NUMERIC(5,2),
  overall_quality_score NUMERIC(5,2),
  has_alerts BOOLEAN DEFAULT false,
  alert_count INTEGER DEFAULT 0,
  column_count INTEGER,
  data_types JSONB DEFAULT '{}'::jsonb,
  retention_until TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() + '1 year 6 mons'::interval),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: file_policy_assignments
CREATE TABLE file_policy_assignments (
  assignment_id INTEGER DEFAULT nextval('file_policy_assignments_assignment_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  policy_id VARCHAR(255) NOT NULL,
  assigned_by INTEGER,
  assigned_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: file_preview_data
CREATE TABLE file_preview_data (
  preview_id INTEGER DEFAULT nextval('file_preview_data_preview_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  row_number INTEGER NOT NULL,
  row_data JSONB NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: file_processing_artifacts
CREATE TABLE file_processing_artifacts (
  id INTEGER DEFAULT nextval('file_processing_artifacts_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  artifact_type VARCHAR(50) NOT NULL,
  storage_uri TEXT NOT NULL,
  file_size_bytes BIGINT,
  checksum_sha256 VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER
);

-- TABLE: file_quality_checks
CREATE TABLE file_quality_checks (
  id INTEGER DEFAULT nextval('file_quality_checks_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  check_type VARCHAR(50) NOT NULL,
  check_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL,
  score NUMERIC(5,2),
  details JSON,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: file_quality_rules
CREATE TABLE file_quality_rules (
  id INTEGER DEFAULT nextval('file_quality_rules_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  quality_rule_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  target_columns _text DEFAULT ARRAY[]::text[]
);

-- TABLE: file_restorations
CREATE TABLE file_restorations (
  id INTEGER DEFAULT nextval('file_restorations_id_seq'::regclass) NOT NULL,
  archived_file_id INTEGER,
  file_id VARCHAR(255) NOT NULL,
  restored_to_path VARCHAR(1000),
  restoration_method VARCHAR(50) DEFAULT 'full'::character varying,
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  error_message TEXT,
  requested_by INTEGER,
  requested_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITHOUT TIME ZONE,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  restoration_reason TEXT,
  restored_size_bytes BIGINT,
  verification_status VARCHAR(50),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: file_schedules
CREATE TABLE file_schedules (
  id INTEGER DEFAULT nextval('file_schedules_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  frequency VARCHAR(50) NOT NULL,
  "time" VARCHAR(10),
  day INTEGER,
  is_active BOOLEAN DEFAULT true,
  last_run TIMESTAMP WITHOUT TIME ZONE,
  next_run TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  project_id INTEGER NOT NULL,
  sub_project_id INTEGER
);

-- TABLE: file_schema_details
CREATE TABLE file_schema_details (
  id INTEGER DEFAULT nextval('file_schema_details_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(500),
  file_schema_id VARCHAR(255) NOT NULL,
  file_schema JSONB NOT NULL,
  schema_hash VARCHAR(255) NOT NULL,
  schema_diff JSONB,
  schema_update_ts TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  active_flag BOOLEAN DEFAULT true,
  correlation_id VARCHAR(255),
  previous_schema_id VARCHAR(255),
  created_ts TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER
);

-- TABLE: file_schemas
CREATE TABLE file_schemas (
  id INTEGER DEFAULT nextval('file_schemas_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_pattern VARCHAR(500),
  schema_definition JSONB NOT NULL,
  schema_hash VARCHAR(64) NOT NULL,
  row_count BIGINT,
  column_count INTEGER,
  captured_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  logical_file_id VARCHAR(255)
);

-- TABLE: file_tag_assignments
CREATE TABLE file_tag_assignments (
  assignment_id INTEGER DEFAULT nextval('file_tag_assignments_assignment_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  tag_id VARCHAR(255) NOT NULL,
  assigned_by INTEGER,
  assigned_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: files
CREATE TABLE files (
  id INTEGER DEFAULT nextval('files_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  file_size BIGINT NOT NULL,
  row_count INTEGER,
  column_count INTEGER,
  quality_score NUMERIC(5,2),
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  checksum VARCHAR(255),
  metadata JSONB,
  duplicate_records_count INTEGER DEFAULT 0,
  duplicate_records_percentage NUMERIC(5,2) DEFAULT 0.00,
  schema_definition JSONB,
  processing_step VARCHAR(50) DEFAULT 'pending'::character varying,
  project_id INTEGER NOT NULL,
  processing_error TEXT,
  is_vendor_file BOOLEAN DEFAULT false,
  correlation_id VARCHAR(255),
  file_role VARCHAR(50),
  logical_file_id VARCHAR(255),
  sub_project_id INTEGER,
  contains_pii BOOLEAN DEFAULT false,
  data_classification VARCHAR(50),
  vendor_agreement_id INTEGER,
  source_format VARCHAR(50),
  format_metadata JSONB,
  is_archive BOOLEAN DEFAULT false,
  archive_format VARCHAR(20),
  is_password_protected BOOLEAN DEFAULT false,
  member_count INTEGER,
  parent_archive_id VARCHAR(255),
  failure_reason_code file_failure_reason
);

-- TABLE: fixed_width_schemas
CREATE TABLE fixed_width_schemas (
  id INTEGER DEFAULT nextval('fixed_width_schemas_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  schema_definition JSONB NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER
);

-- TABLE: frontend_audit_log
CREATE TABLE frontend_audit_log (
  audit_id BIGINT DEFAULT nextval('frontend_audit_log_audit_id_seq'::regclass) NOT NULL,
  "timestamp" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  user_id VARCHAR(255),
  user_email VARCHAR(255),
  session_id VARCHAR(255),
  event_type VARCHAR(100) NOT NULL,
  event_category VARCHAR(50),
  page_url VARCHAR(500),
  page_title VARCHAR(255),
  component_name VARCHAR(255),
  action_type VARCHAR(100),
  target_element VARCHAR(255),
  element_text TEXT,
  error_message TEXT,
  error_stack TEXT,
  error_component VARCHAR(255),
  api_endpoint VARCHAR(255),
  api_method VARCHAR(10),
  api_status_code INTEGER,
  api_error_message TEXT,
  browser_info JSONB,
  screen_resolution VARCHAR(50),
  viewport_size VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: governance_policies
CREATE TABLE governance_policies (
  policy_id VARCHAR(255) NOT NULL,
  policy_name VARCHAR(255) NOT NULL,
  description TEXT,
  rules JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: governance_tags
CREATE TABLE governance_tags (
  tag_id VARCHAR(255) NOT NULL,
  tag_name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(50) DEFAULT '#3B82F6'::character varying,
  badge_style VARCHAR(50) DEFAULT 'default'::character varying,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  permission_required VARCHAR(255) DEFAULT NULL::character varying,
  requires_view_permission BOOLEAN DEFAULT false,
  requires_edit_permission BOOLEAN DEFAULT false,
  sensitivity_level VARCHAR(50) DEFAULT 'public'::character varying
);

-- TABLE: group_policy_attachments
CREATE TABLE group_policy_attachments (
  group_id INTEGER NOT NULL,
  policy_id INTEGER NOT NULL,
  attached_by INTEGER,
  attached_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: groups
CREATE TABLE groups (
  id INTEGER DEFAULT nextval('groups_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: idempotency_keys
CREATE TABLE idempotency_keys (
  id INTEGER DEFAULT nextval('idempotency_keys_id_seq'::regclass) NOT NULL,
  key VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id INTEGER,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  user_id INTEGER
);

-- TABLE: job_dependencies
CREATE TABLE job_dependencies (
  dependency_id INTEGER DEFAULT nextval('job_dependencies_dependency_id_seq'::regclass) NOT NULL,
  job_id INTEGER NOT NULL,
  depends_on_job_id INTEGER NOT NULL,
  dependency_type VARCHAR(50) DEFAULT 'completion'::character varying,
  wait_for_success BOOLEAN DEFAULT true,
  optional_dependency BOOLEAN DEFAULT false,
  timeout_minutes INTEGER,
  created_by VARCHAR(255),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: job_group_dependencies
CREATE TABLE job_group_dependencies (
  group_dependency_id INTEGER DEFAULT nextval('job_group_dependencies_group_dependency_id_seq'::regclass) NOT NULL,
  group_id UUID NOT NULL,
  depends_on_group_id UUID NOT NULL,
  dependency_type VARCHAR(50) DEFAULT 'all_success'::character varying,
  wait_for_all_jobs BOOLEAN DEFAULT true,
  timeout_minutes INTEGER,
  created_by VARCHAR(255),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: job_group_jobs
CREATE TABLE job_group_jobs (
  group_id UUID NOT NULL,
  job_id UUID NOT NULL,
  added_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: job_group_schedules
CREATE TABLE job_group_schedules (
  group_schedule_id INTEGER DEFAULT nextval('job_group_schedules_group_schedule_id_seq'::regclass) NOT NULL,
  group_id UUID NOT NULL,
  schedule_name VARCHAR(255) NOT NULL,
  schedule_type VARCHAR(50) NOT NULL,
  cron_expression VARCHAR(100),
  enabled BOOLEAN DEFAULT true,
  execution_order VARCHAR(50) DEFAULT 'parallel'::character varying,
  max_concurrent_jobs INTEGER DEFAULT 5,
  retry_policy JSONB DEFAULT '{"maxRetries": 3, "retryDelay": 300}'::jsonb,
  notification_settings JSONB,
  created_by VARCHAR(255),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  project_id INTEGER NOT NULL
);

-- TABLE: job_groups
CREATE TABLE job_groups (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: job_history
CREATE TABLE job_history (
  id INTEGER DEFAULT nextval('job_history_id_seq'::regclass) NOT NULL,
  job_id INTEGER,
  status VARCHAR(50) NOT NULL,
  start_time TIMESTAMP WITHOUT TIME ZONE,
  end_time TIMESTAMP WITHOUT TIME ZONE,
  records_processed INTEGER,
  errors_count INTEGER,
  logs TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: job_runs
CREATE TABLE job_runs (
  id INTEGER DEFAULT nextval('job_runs_id_seq'::regclass) NOT NULL,
  job_id INTEGER,
  status VARCHAR(50) NOT NULL,
  start_time TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP WITHOUT TIME ZONE,
  records_processed INTEGER,
  records_succeeded INTEGER,
  records_failed INTEGER,
  error_details JSONB,
  triggered_by INTEGER,
  run_details JSONB
);

-- TABLE: job_schedules
CREATE TABLE job_schedules (
  id INTEGER DEFAULT nextval('job_schedules_id_seq'::regclass) NOT NULL,
  job_id INTEGER NOT NULL,
  type VARCHAR(50) DEFAULT 'one-time'::character varying NOT NULL,
  one_time_date TIMESTAMP WITHOUT TIME ZONE,
  cron_expression VARCHAR(100),
  enabled BOOLEAN DEFAULT true,
  next_run_time TIMESTAMP WITHOUT TIME ZONE,
  last_run_time TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  project_id INTEGER NOT NULL
);

-- TABLE: jobs
CREATE TABLE jobs (
  id INTEGER DEFAULT nextval('jobs_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  business_process_id INTEGER,
  status VARCHAR(50) DEFAULT 'draft'::character varying,
  source_connection_id VARCHAR(255),
  target_connection_id VARCHAR(255),
  validation_settings JSONB,
  error_handling_settings JSONB,
  notification_settings JSONB,
  schedule_settings JSONB,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: lineage_views
CREATE TABLE lineage_views (
  id INTEGER DEFAULT nextval('lineage_views_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  root_type VARCHAR(50) NOT NULL,
  root_id INTEGER NOT NULL,
  project_id INTEGER,
  depth INTEGER DEFAULT 3,
  include_incidents BOOLEAN DEFAULT true,
  layout_state JSONB,
  cached_graph JSONB,
  user_id INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- TABLE: logical_file_groups
CREATE TABLE logical_file_groups (
  id INTEGER DEFAULT nextval('logical_file_groups_id_seq'::regclass) NOT NULL,
  logical_file_id VARCHAR(255) NOT NULL,
  project_id INTEGER,
  canonical_name VARCHAR(500) NOT NULL,
  file_pattern VARCHAR(500),
  pattern_metadata JSONB,
  first_upload_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_upload_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  upload_count INTEGER DEFAULT 0,
  has_schema_changes BOOLEAN DEFAULT false,
  last_schema_change_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: mapping_group_executions
CREATE TABLE mapping_group_executions (
  id INTEGER DEFAULT nextval('mapping_group_executions_id_seq'::regclass) NOT NULL,
  group_id INTEGER NOT NULL,
  execution_id TEXT NOT NULL,
  status TEXT DEFAULT 'running'::text,
  total_mappings INTEGER DEFAULT 0,
  completed_mappings INTEGER DEFAULT 0,
  failed_mappings INTEGER DEFAULT 0,
  start_time TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP WITHOUT TIME ZONE,
  duration_ms INTEGER,
  triggered_by INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  project_id INTEGER NOT NULL
);

-- TABLE: mapping_group_members
CREATE TABLE mapping_group_members (
  id INTEGER DEFAULT nextval('mapping_group_members_id_seq'::regclass) NOT NULL,
  group_id INTEGER NOT NULL,
  mapping_id VARCHAR(255) NOT NULL,
  execution_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: mapping_groups
CREATE TABLE mapping_groups (
  id INTEGER DEFAULT nextval('mapping_groups_id_seq'::regclass) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  max_concurrency INTEGER DEFAULT 10,
  created_by UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active'::text,
  project_id INTEGER NOT NULL,
  sub_project_id INTEGER
);

-- TABLE: mapping_job_errors
CREATE TABLE mapping_job_errors (
  id INTEGER DEFAULT nextval('mapping_job_errors_id_seq'::regclass) NOT NULL,
  job_id VARCHAR(255) NOT NULL,
  mapping_id VARCHAR(255) NOT NULL,
  error_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) DEFAULT 'error'::character varying NOT NULL,
  row_number INTEGER,
  column_name VARCHAR(255),
  error_message TEXT NOT NULL,
  error_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'new'::character varying,
  processing_action VARCHAR(20),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  record_snapshot JSONB
);

-- TABLE: migrations
CREATE TABLE migrations (
  id INTEGER DEFAULT nextval('migrations_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

-- TABLE: n_step_workflow_assets
CREATE TABLE n_step_workflow_assets (
  id INTEGER DEFAULT nextval('n_step_workflow_assets_id_seq'::regclass) NOT NULL,
  step_id INTEGER,
  asset_type VARCHAR(20) NOT NULL,
  asset_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: n_step_workflow_run_steps
CREATE TABLE n_step_workflow_run_steps (
  id INTEGER DEFAULT nextval('n_step_workflow_run_steps_id_seq'::regclass) NOT NULL,
  run_id INTEGER,
  step_index INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  start_time TIMESTAMP WITHOUT TIME ZONE,
  end_time TIMESTAMP WITHOUT TIME ZONE,
  duration_ms BIGINT,
  jobs_count INTEGER DEFAULT 0,
  jobs_completed INTEGER DEFAULT 0,
  jobs_failed INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: n_step_workflow_runs
CREATE TABLE n_step_workflow_runs (
  id INTEGER DEFAULT nextval('n_step_workflow_runs_id_seq'::regclass) NOT NULL,
  workflow_id INTEGER,
  run_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'running'::character varying,
  triggered_by INTEGER,
  start_time TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP WITHOUT TIME ZONE,
  duration_ms BIGINT,
  error_message TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: n_step_workflow_steps
CREATE TABLE n_step_workflow_steps (
  id INTEGER DEFAULT nextval('n_step_workflow_steps_id_seq'::regclass) NOT NULL,
  workflow_id INTEGER,
  step_index INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: n_step_workflows
CREATE TABLE n_step_workflows (
  id INTEGER DEFAULT nextval('n_step_workflows_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  project_id INTEGER,
  sub_project_id INTEGER
);

-- TABLE: notifications
CREATE TABLE notifications (
  id INTEGER DEFAULT nextval('notifications_id_seq'::regclass) NOT NULL,
  user_id INTEGER NOT NULL,
  notification_type VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  entity_type VARCHAR(100),
  entity_id INTEGER,
  action_url VARCHAR(1000),
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITHOUT TIME ZONE,
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITHOUT TIME ZONE
);

-- TABLE: password_reset_requests
CREATE TABLE password_reset_requests (
  id INTEGER DEFAULT nextval('password_reset_requests_id_seq'::regclass) NOT NULL,
  user_id INTEGER,
  requested_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  status VARCHAR(20) DEFAULT 'pending'::character varying,
  approved_by INTEGER,
  approved_at TIMESTAMP WITHOUT TIME ZONE,
  denied_at TIMESTAMP WITHOUT TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: permissions
CREATE TABLE permissions (
  id INTEGER DEFAULT nextval('permissions_id_seq'::regclass) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  resource VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: policy_evaluation_cache
CREATE TABLE policy_evaluation_cache (
  cache_key VARCHAR(512) NOT NULL,
  user_id INTEGER NOT NULL,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  decision VARCHAR(20) NOT NULL,
  evaluated_policies JSONB,
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: processing_events
CREATE TABLE processing_events (
  id INTEGER DEFAULT nextval('processing_events_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  job_id VARCHAR(100),
  event_type VARCHAR(50) NOT NULL,
  event_stage VARCHAR(50),
  event_message TEXT NOT NULL,
  progress_percentage INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: profiling_metrics
CREATE TABLE profiling_metrics (
  id INTEGER DEFAULT nextval('profiling_metrics_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  mapping_id VARCHAR(255),
  row_count BIGINT,
  column_count INTEGER,
  numeric_sum JSONB,
  null_counts JSONB,
  data_types JSONB,
  value_distributions JSONB,
  completeness_score NUMERIC(5,2),
  consistency_score NUMERIC(5,2),
  validity_score NUMERIC(5,2),
  overall_quality_score NUMERIC(5,2),
  profiled_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  job_id VARCHAR(255),
  retention_until TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() + '1 year 6 mons'::interval),
  profile_timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  file_role VARCHAR(20) DEFAULT 'adhoc'::character varying
);

-- TABLE: project_access_groups
CREATE TABLE project_access_groups (
  project_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  added_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: project_members
CREATE TABLE project_members (
  project_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  can_invite BOOLEAN DEFAULT false,
  can_manage_members BOOLEAN DEFAULT false,
  invited_by INTEGER,
  invitation_accepted_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: projects
CREATE TABLE projects (
  id INTEGER DEFAULT nextval('projects_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id INTEGER,
  parent_id INTEGER,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  is_archived BOOLEAN DEFAULT false NOT NULL,
  project_type VARCHAR(20) DEFAULT 'internal'::character varying
);

-- TABLE: quality_reports
CREATE TABLE quality_reports (
  report_id VARCHAR(255) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  quality_score NUMERIC(5,2),
  rules_evaluated INTEGER DEFAULT 0,
  rules_passed INTEGER DEFAULT 0,
  anomalies_detected INTEGER DEFAULT 0,
  report_data JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: quality_rule_configurations
CREATE TABLE quality_rule_configurations (
  id INTEGER DEFAULT nextval('quality_rule_configurations_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255),
  rule_id INTEGER,
  error_action VARCHAR(20) DEFAULT 'log_continue'::character varying NOT NULL,
  apply_to VARCHAR(20) DEFAULT 'both'::character varying NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_by INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: quality_rule_violations
CREATE TABLE quality_rule_violations (
  id INTEGER DEFAULT nextval('quality_rule_violations_id_seq'::regclass) NOT NULL,
  rule_id INTEGER NOT NULL,
  file_id VARCHAR(255),
  job_id VARCHAR(255),
  row_number INTEGER,
  column_name VARCHAR(255),
  expected_value TEXT,
  actual_value TEXT,
  violation_details JSONB,
  severity VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  primary_key_value TEXT,
  primary_key_column TEXT,
  status VARCHAR(20) DEFAULT 'new'::character varying,
  processing_action VARCHAR(20),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_by INTEGER,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  record_snapshot JSONB
);

-- TABLE: quality_rules
CREATE TABLE quality_rules (
  id INTEGER DEFAULT nextval('quality_rules_id_seq'::regclass) NOT NULL,
  rule_name VARCHAR(255) NOT NULL,
  rule_type VARCHAR(50) NOT NULL,
  description TEXT,
  column_name VARCHAR(255),
  rule_config JSONB NOT NULL,
  severity VARCHAR(20) DEFAULT 'warning'::character varying NOT NULL,
  enabled BOOLEAN DEFAULT true,
  project_id INTEGER,
  created_by INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  sub_project_id INTEGER
);

-- TABLE: rbac_policies
CREATE TABLE rbac_policies (
  id INTEGER DEFAULT nextval('rbac_policies_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  policy_type VARCHAR(50) NOT NULL,
  project_id INTEGER,
  is_global BOOLEAN DEFAULT false,
  policy_document JSONB NOT NULL,
  created_by INTEGER,
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: refresh_tokens
CREATE TABLE refresh_tokens (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id INTEGER NOT NULL,
  token VARCHAR(255) NOT NULL,
  user_agent TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  is_revoked BOOLEAN DEFAULT false,
  revoked_at TIMESTAMP WITHOUT TIME ZONE
);

-- TABLE: resource_attributes
CREATE TABLE resource_attributes (
  id INTEGER DEFAULT nextval('resource_attributes_id_seq'::regclass) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  attribute_key VARCHAR(100) NOT NULL,
  attribute_value TEXT NOT NULL,
  attribute_type VARCHAR(50) DEFAULT 'STRING'::character varying,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: resource_policy_attachments
CREATE TABLE resource_policy_attachments (
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  policy_id INTEGER NOT NULL,
  attached_by INTEGER,
  attached_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: retention_policies
CREATE TABLE retention_policies (
  id INTEGER DEFAULT nextval('retention_policies_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  retention_days INTEGER,
  min_quality_score NUMERIC(5,2),
  max_file_size_mb INTEGER,
  file_types _varchar,
  tags _varchar,
  access_pattern VARCHAR(50),
  custom_condition TEXT,
  archive_storage_type VARCHAR(50) NOT NULL,
  archive_connection_id UUID,
  archive_path_prefix VARCHAR(500),
  priority INTEGER DEFAULT 50,
  last_run_at TIMESTAMP WITHOUT TIME ZONE,
  next_run_at TIMESTAMP WITHOUT TIME ZONE,
  run_frequency VARCHAR(50) DEFAULT 'daily'::character varying,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_by INTEGER,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: retention_policy_runs
CREATE TABLE retention_policy_runs (
  id INTEGER DEFAULT nextval('retention_policy_runs_id_seq'::regclass) NOT NULL,
  policy_id INTEGER,
  started_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  status VARCHAR(50) DEFAULT 'running'::character varying,
  error_message TEXT,
  files_evaluated INTEGER DEFAULT 0,
  files_archived INTEGER DEFAULT 0,
  files_skipped INTEGER DEFAULT 0,
  total_bytes_archived BIGINT DEFAULT 0,
  triggered_by VARCHAR(50) DEFAULT 'scheduler'::character varying,
  executed_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: role_permissions
CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: roles
CREATE TABLE roles (
  id INTEGER DEFAULT nextval('roles_id_seq'::regclass) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  permissions _text DEFAULT '{}'::text[],
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: schedules
CREATE TABLE schedules (
  id INTEGER DEFAULT nextval('schedules_id_seq'::regclass) NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  schedule_name TEXT,
  schedule_type TEXT NOT NULL,
  cron_expression TEXT,
  interval_value INTEGER,
  interval_unit TEXT,
  timezone TEXT DEFAULT 'UTC'::text,
  is_active BOOLEAN DEFAULT true,
  last_run TIMESTAMP WITHOUT TIME ZONE,
  next_run TIMESTAMP WITHOUT TIME ZONE,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  project_id INTEGER,
  sub_project_id INTEGER
);

-- TABLE: schema_migrations
CREATE TABLE schema_migrations (
  id INTEGER DEFAULT nextval('schema_migrations_id_seq'::regclass) NOT NULL,
  migration_name VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- TABLE: schema_validation_job_files
CREATE TABLE schema_validation_job_files (
  id INTEGER DEFAULT nextval('schema_validation_job_files_id_seq'::regclass) NOT NULL,
  job_id INTEGER,
  file_path TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  validation_result JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  dq_violation_count INTEGER DEFAULT 0,
  dq_rules_executed INTEGER DEFAULT 0,
  dq_rules_passed INTEGER DEFAULT 0,
  dq_status VARCHAR(20) DEFAULT NULL::character varying
);

-- TABLE: schema_validation_jobs
CREATE TABLE schema_validation_jobs (
  id INTEGER DEFAULT nextval('schema_validation_jobs_id_seq'::regclass) NOT NULL,
  job_name VARCHAR(255) NOT NULL,
  project_id INTEGER,
  connection_id VARCHAR(255),
  vendor_agreement_id INTEGER,
  s3_path TEXT,
  file_pattern VARCHAR(255) DEFAULT '*'::character varying,
  recursive BOOLEAN DEFAULT false,
  execution_type VARCHAR(50) DEFAULT 'manual'::character varying,
  schedule_type VARCHAR(50),
  cron_expression VARCHAR(100),
  schedule_start_date TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  total_files INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  valid_count INTEGER DEFAULT 0,
  invalid_count INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  report_path TEXT,
  error_message TEXT,
  created_by INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  error_count INTEGER DEFAULT 0,
  dq_violation_count INTEGER DEFAULT 0,
  dq_rules_executed INTEGER DEFAULT 0,
  dq_rules_passed INTEGER DEFAULT 0,
  dq_enabled BOOLEAN DEFAULT true
);

-- TABLE: scim_configurations
CREATE TABLE scim_configurations (
  id INTEGER DEFAULT nextval('scim_configurations_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  base_url VARCHAR(255),
  bearer_token VARCHAR(512),
  idp_type VARCHAR(50) NOT NULL,
  idp_scim_url VARCHAR(255),
  sync_users BOOLEAN DEFAULT true,
  sync_groups BOOLEAN DEFAULT true,
  sync_interval_minutes INTEGER DEFAULT 60,
  last_sync_at TIMESTAMP WITHOUT TIME ZONE,
  user_attribute_mapping JSONB DEFAULT '{}'::jsonb,
  group_attribute_mapping JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: scim_resource_mappings
CREATE TABLE scim_resource_mappings (
  id INTEGER DEFAULT nextval('scim_resource_mappings_id_seq'::regclass) NOT NULL,
  config_id INTEGER,
  scim_id VARCHAR(255) NOT NULL,
  scim_resource_type VARCHAR(50) NOT NULL,
  platform_resource_type VARCHAR(50) NOT NULL,
  platform_resource_id INTEGER NOT NULL,
  last_synced_at TIMESTAMP WITHOUT TIME ZONE,
  sync_hash VARCHAR(64),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: scim_sync_logs
CREATE TABLE scim_sync_logs (
  id INTEGER DEFAULT nextval('scim_sync_logs_id_seq'::regclass) NOT NULL,
  config_id INTEGER,
  sync_type VARCHAR(50) NOT NULL,
  sync_direction VARCHAR(20) DEFAULT 'INBOUND'::character varying,
  status VARCHAR(50) NOT NULL,
  items_processed INTEGER DEFAULT 0,
  items_created INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_deleted INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  error_message TEXT,
  error_details JSONB,
  started_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  duration_ms INTEGER
);

-- TABLE: security_audit_log
CREATE TABLE security_audit_log (
  security_audit_id BIGINT DEFAULT nextval('security_audit_log_security_audit_id_seq'::regclass) NOT NULL,
  "timestamp" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  event_type VARCHAR(100),
  severity VARCHAR(20),
  user_id VARCHAR(255),
  username VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  location JSONB,
  authentication_method VARCHAR(50),
  permission_required VARCHAR(100),
  permission_granted BOOLEAN,
  denial_reason TEXT,
  risk_score INTEGER,
  flags JSONB,
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: security_audit_log_archive
CREATE TABLE security_audit_log_archive (
  security_audit_id BIGINT NOT NULL,
  "timestamp" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  event_type VARCHAR(100),
  severity VARCHAR(20),
  user_id VARCHAR(255),
  username VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  location JSONB,
  authentication_method VARCHAR(50),
  permission_required VARCHAR(100),
  permission_granted BOOLEAN,
  denial_reason TEXT,
  risk_score INTEGER,
  flags JSONB,
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE,
  archived_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: storage_connections
CREATE TABLE storage_connections (
  connection_id VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  config JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'active'::character varying NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  connection_direction VARCHAR(20) DEFAULT 'source'::character varying,
  project_id INTEGER,
  connection_user VARCHAR(20) DEFAULT 'Internal'::character varying,
  description TEXT,
  authentication_method VARCHAR(50) DEFAULT 'key-based'::character varying,
  auth_config JSONB DEFAULT '{}'::jsonb,
  path TEXT,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP WITHOUT TIME ZONE,
  deleted_by INTEGER
);

-- TABLE: sub_project_access_groups
CREATE TABLE sub_project_access_groups (
  id INTEGER DEFAULT nextval('sub_project_access_groups_id_seq'::regclass) NOT NULL,
  sub_project_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: sub_project_members
CREATE TABLE sub_project_members (
  id INTEGER DEFAULT nextval('sub_project_members_id_seq'::regclass) NOT NULL,
  sub_project_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role VARCHAR(50) DEFAULT 'member'::character varying,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: tag_permissions
CREATE TABLE tag_permissions (
  id INTEGER DEFAULT nextval('tag_permissions_id_seq'::regclass) NOT NULL,
  tag_id VARCHAR(255) NOT NULL,
  role_id INTEGER NOT NULL,
  can_view BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: transform_connections
CREATE TABLE transform_connections (
  id INTEGER DEFAULT nextval('transform_connections_id_seq'::regclass) NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  last_used_at TIMESTAMP WITHOUT TIME ZONE,
  description TEXT,
  shared BOOLEAN DEFAULT true,
  source_application VARCHAR(50) DEFAULT 'data_observatory'::character varying,
  project_id INTEGER NOT NULL
);

-- TABLE: transformation_executions
CREATE TABLE transformation_executions (
  id INTEGER DEFAULT nextval('transformation_executions_id_seq'::regclass) NOT NULL,
  execution_id TEXT NOT NULL,
  transformation_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  parameters JSONB DEFAULT '{}'::jsonb,
  result JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: transformation_jobs
CREATE TABLE transformation_jobs (
  id INTEGER DEFAULT nextval('transformation_jobs_id_seq'::regclass) NOT NULL,
  job_id VARCHAR(255) NOT NULL,
  mapping_id VARCHAR(255),
  mapping_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending'::character varying NOT NULL,
  start_time TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP WITHOUT TIME ZONE,
  duration_ms BIGINT,
  files_processed INTEGER DEFAULT 0,
  rows_read BIGINT DEFAULT 0,
  rows_written BIGINT DEFAULT 0,
  rows_failed BIGINT DEFAULT 0,
  error_message TEXT,
  execution_metadata JSONB,
  triggered_by VARCHAR(255),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  executed_by INTEGER,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  mapping_group_execution_id INTEGER,
  schedule_id INTEGER,
  workflow_execution_id INTEGER,
  file_id VARCHAR(255),
  project_id INTEGER NOT NULL,
  correlation_id VARCHAR(255),
  schema_validation VARCHAR(10),
  failure_reason_code job_failure_reason,
  visual_workflow_execution_id INTEGER
);

-- TABLE: transformation_lineage
CREATE TABLE transformation_lineage (
  id INTEGER DEFAULT nextval('transformation_lineage_id_seq'::regclass) NOT NULL,
  transformation_id TEXT NOT NULL,
  input_file_id TEXT NOT NULL,
  output_file_id TEXT NOT NULL,
  execution_id TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  mapping_id TEXT,
  schema_fingerprint TEXT,
  lineage_type VARCHAR(20) DEFAULT 'file-specific'::character varying,
  source_schema JSONB,
  target_schema JSONB,
  column_mappings JSONB DEFAULT '[]'::jsonb,
  source_owner TEXT,
  target_owner TEXT,
  source_path TEXT,
  target_path TEXT,
  source_agreement_name TEXT
);

-- TABLE: transformation_logs
CREATE TABLE transformation_logs (
  id INTEGER DEFAULT nextval('transformation_logs_id_seq'::regclass) NOT NULL,
  job_id VARCHAR(255) NOT NULL,
  log_level VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  log_details JSONB,
  "timestamp" TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: transformation_mappings
CREATE TABLE transformation_mappings (
  id INTEGER DEFAULT nextval('transformation_mappings_id_seq'::regclass) NOT NULL,
  mapping_id VARCHAR(255) NOT NULL,
  mapping_name VARCHAR(255) NOT NULL,
  description TEXT,
  source_connection_id VARCHAR(255),
  source_file_pattern VARCHAR(500) NOT NULL,
  source_schema JSONB,
  field_mappings JSONB DEFAULT '[]'::jsonb NOT NULL,
  target_connection_id VARCHAR(255),
  target_table_name VARCHAR(255),
  target_schema JSONB,
  created_by INTEGER,
  status VARCHAR(50) DEFAULT 'draft'::character varying,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_executed_at TIMESTAMP WITHOUT TIME ZONE,
  anomaly_rules JSONB,
  source_type VARCHAR(50) DEFAULT 'files'::character varying,
  file_path TEXT DEFAULT ''::text,
  file_name_pattern TEXT,
  target_file_name VARCHAR(500),
  target_file_format VARCHAR(50) DEFAULT 'csv'::character varying,
  variables JSONB DEFAULT '[]'::jsonb,
  project_id INTEGER NOT NULL,
  target_file_path VARCHAR(1000),
  vendor_agreement_id INTEGER,
  schema_drift_handling VARCHAR(20) DEFAULT 'none'::character varying,
  sub_project_id INTEGER,
  source_owner VARCHAR(255),
  target_owner VARCHAR(255),
  vendor_agreement_file_schema_id INTEGER,
  pii_columns JSONB DEFAULT '[]'::jsonb,
  violation_handling VARCHAR(50) DEFAULT 'log_continue'::character varying,
  rdm_lookup_enabled BOOLEAN DEFAULT false,
  rdm_dataset_config JSONB,
  rdm_crosswalk_config JSONB,
  is_visual_mapping BOOLEAN DEFAULT false,
  visual_mapping_id INTEGER,
  is_temporary BOOLEAN DEFAULT false,
  source_catalog JSONB DEFAULT '[]'::jsonb,
  join_specs JSONB DEFAULT '[]'::jsonb,
  has_multi_source_join BOOLEAN DEFAULT false,
  primary_source_node_id VARCHAR(255)
);

-- TABLE: transformation_outputs
CREATE TABLE transformation_outputs (
  id INTEGER DEFAULT nextval('transformation_outputs_id_seq'::regclass) NOT NULL,
  execution_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  row_count INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: transformation_quality_rules
CREATE TABLE transformation_quality_rules (
  id INTEGER DEFAULT nextval('transformation_quality_rules_id_seq'::regclass) NOT NULL,
  mapping_id VARCHAR(255) NOT NULL,
  quality_rule_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: transformations
CREATE TABLE transformations (
  id INTEGER DEFAULT nextval('transformations_id_seq'::regclass) NOT NULL,
  transformation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  input_files JSONB DEFAULT '[]'::jsonb,
  output_format TEXT DEFAULT 'csv'::text,
  enabled BOOLEAN DEFAULT true,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  task_id VARCHAR(255),
  progress INTEGER DEFAULT 0,
  error TEXT,
  result JSONB
);

-- TABLE: upload_batches
CREATE TABLE upload_batches (
  id INTEGER DEFAULT nextval('upload_batches_id_seq'::regclass) NOT NULL,
  batch_id VARCHAR(100) NOT NULL,
  user_id INTEGER,
  api_token_id INTEGER,
  project_id INTEGER,
  target_type VARCHAR(50) NOT NULL,
  target_id INTEGER,
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  total_files INTEGER DEFAULT 0,
  completed_files INTEGER DEFAULT 0,
  failed_files INTEGER DEFAULT 0,
  total_records BIGINT DEFAULT 0,
  processed_records BIGINT DEFAULT 0,
  failed_records BIGINT DEFAULT 0,
  total_size_bytes BIGINT DEFAULT 0,
  started_at TIMESTAMP WITHOUT TIME ZONE,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- TABLE: upload_file_records
CREATE TABLE upload_file_records (
  id INTEGER DEFAULT nextval('upload_file_records_id_seq'::regclass) NOT NULL,
  upload_file_id INTEGER,
  record_number BIGINT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  error_message TEXT,
  error_code VARCHAR(100),
  row_data JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: upload_files
CREATE TABLE upload_files (
  id INTEGER DEFAULT nextval('upload_files_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(100) NOT NULL,
  batch_id INTEGER,
  original_filename VARCHAR(500) NOT NULL,
  normalized_filename VARCHAR(500),
  file_type VARCHAR(50),
  file_size_bytes BIGINT,
  mime_type VARCHAR(100),
  target_type VARCHAR(50),
  target_id INTEGER,
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  phase VARCHAR(100) DEFAULT 'uploaded'::character varying,
  total_records BIGINT DEFAULT 0,
  processed_records BIGINT DEFAULT 0,
  failed_records BIGINT DEFAULT 0,
  virus_scan_status VARCHAR(50),
  virus_scan_result VARCHAR(255),
  cloud_storage_path VARCHAR(1000),
  cloud_storage_url TEXT,
  catalog_file_id VARCHAR(255),
  etl_job_id VARCHAR(100),
  error_message TEXT,
  error_details JSONB,
  started_at TIMESTAMP WITHOUT TIME ZONE,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  uploaded_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- TABLE: user_attributes
CREATE TABLE user_attributes (
  id INTEGER DEFAULT nextval('user_attributes_id_seq'::regclass) NOT NULL,
  user_id INTEGER,
  attribute_key VARCHAR(100) NOT NULL,
  attribute_value TEXT NOT NULL,
  attribute_type VARCHAR(50) DEFAULT 'STRING'::character varying,
  source VARCHAR(50) DEFAULT 'MANUAL'::character varying,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: user_badges
CREATE TABLE user_badges (
  id INTEGER DEFAULT nextval('user_badges_id_seq'::regclass) NOT NULL,
  badge_id VARCHAR(50) NOT NULL,
  score NUMERIC,
  file_id VARCHAR(50),
  earned_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: user_dashboard_settings
CREATE TABLE user_dashboard_settings (
  id INTEGER DEFAULT nextval('user_dashboard_settings_id_seq'::regclass) NOT NULL,
  user_id VARCHAR(50) DEFAULT 'default'::character varying,
  settings JSON NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: user_groups
CREATE TABLE user_groups (
  user_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL
);

-- TABLE: user_job_groups
CREATE TABLE user_job_groups (
  user_id UUID NOT NULL,
  group_id UUID NOT NULL
);

-- TABLE: user_policy_attachments
CREATE TABLE user_policy_attachments (
  user_id INTEGER NOT NULL,
  policy_id INTEGER NOT NULL,
  attached_by INTEGER,
  attached_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- TABLE: user_roles
CREATE TABLE user_roles (
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: user_sessions
CREATE TABLE user_sessions (
  id INTEGER DEFAULT nextval('user_sessions_id_seq'::regclass) NOT NULL,
  user_id INTEGER NOT NULL,
  token VARCHAR(1000) NOT NULL,
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: user_uuid_mapping
CREATE TABLE user_uuid_mapping (
  user_id INTEGER NOT NULL,
  uuid UUID NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: users
CREATE TABLE users (
  id INTEGER DEFAULT nextval('users_id_seq'::regclass) NOT NULL,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(500),
  email VARCHAR(255),
  full_name VARCHAR(255),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP WITHOUT TIME ZONE,
  okta_id VARCHAR(255),
  first_name VARCHAR(100),
  middle_name VARCHAR(100),
  last_name VARCHAR(100),
  phone_number VARCHAR(20),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100),
  auth_provider VARCHAR(20) DEFAULT 'local'::character varying,
  external_id VARCHAR(255),
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP WITHOUT TIME ZONE,
  password_history JSONB DEFAULT '[]'::jsonb,
  force_password_change BOOLEAN DEFAULT false,
  internal_user BOOLEAN DEFAULT false,
  user_type VARCHAR(50),
  must_change_password BOOLEAN DEFAULT false,
  vendor_id INTEGER
);

-- TABLE: vendor_agreement_approvals
CREATE TABLE vendor_agreement_approvals (
  id INTEGER DEFAULT nextval('vendor_agreement_approvals_id_seq'::regclass) NOT NULL,
  agreement_id INTEGER NOT NULL,
  approver_type VARCHAR(50) NOT NULL,
  approver_user_id INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL,
  comments TEXT,
  agreement_version INTEGER NOT NULL,
  approval_timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(50),
  user_agent TEXT,
  approval_stage VARCHAR(50)
);

-- TABLE: vendor_agreement_changes
CREATE TABLE vendor_agreement_changes (
  id INTEGER DEFAULT nextval('vendor_agreement_changes_id_seq'::regclass) NOT NULL,
  agreement_id INTEGER NOT NULL,
  change_type VARCHAR(50) NOT NULL,
  previous_data JSONB,
  new_data JSONB,
  changes_summary TEXT,
  from_version INTEGER,
  to_version INTEGER,
  changed_by INTEGER NOT NULL,
  changed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,
  ip_address VARCHAR(50),
  user_agent TEXT
);

-- TABLE: vendor_agreement_documents
CREATE TABLE vendor_agreement_documents (
  id INTEGER DEFAULT nextval('vendor_agreement_documents_id_seq'::regclass) NOT NULL,
  agreement_id INTEGER NOT NULL,
  approval_id INTEGER,
  document_name VARCHAR(500) NOT NULL,
  document_type VARCHAR(100),
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  uploaded_by INTEGER NOT NULL,
  uploaded_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  approval_stage VARCHAR(50)
);

-- TABLE: vendor_agreement_file_schemas
CREATE TABLE vendor_agreement_file_schemas (
  id INTEGER DEFAULT nextval('vendor_agreement_file_schemas_id_seq'::regclass) NOT NULL,
  vendor_agreement_id INTEGER NOT NULL,
  file_name_pattern VARCHAR(500) NOT NULL,
  file_description TEXT,
  schema JSONB NOT NULL,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_by INTEGER,
  contains_pii BOOLEAN DEFAULT false,
  data_classification VARCHAR(50),
  file_type VARCHAR(50),
  quality_rule_ids JSONB DEFAULT '[]'::jsonb,
  column_metadata JSONB DEFAULT '{}'::jsonb,
  has_header BOOLEAN DEFAULT true,
  header_definition JSONB
);

-- TABLE: vendor_agreements
CREATE TABLE vendor_agreements (
  id INTEGER DEFAULT nextval('vendor_agreements_id_seq'::regclass) NOT NULL,
  vendor_id INTEGER,
  agreement_code VARCHAR(100),
  file_name VARCHAR(500),
  file_description TEXT,
  schema JSONB,
  frequency VARCHAR(50),
  frequency_description TEXT,
  vendor_department_team VARCHAR(255),
  file_owner_user_id INTEGER,
  primary_contact_name VARCHAR(255),
  owner_contact VARCHAR(255),
  metadata JSONB,
  approval_status VARCHAR(50) DEFAULT 'draft'::character varying,
  vendor_approved_at TIMESTAMP WITHOUT TIME ZONE,
  vendor_approved_by INTEGER,
  owner_approved_at TIMESTAMP WITHOUT TIME ZONE,
  owner_approved_by INTEGER,
  is_locked BOOLEAN DEFAULT false,
  locked_at TIMESTAMP WITHOUT TIME ZONE,
  version INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'active'::character varying,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  vendor_connection_id VARCHAR(255),
  drop_location_path VARCHAR(500),
  project_id INTEGER,
  manager_contact TEXT,
  primary_contact_phone VARCHAR(50),
  primary_contact_email VARCHAR(255),
  primary_contact_designation VARCHAR(255),
  secondary_contact_name VARCHAR(255),
  secondary_contact_phone VARCHAR(50),
  secondary_contact_email VARCHAR(255),
  secondary_contact_designation VARCHAR(255),
  contains_pii BOOLEAN DEFAULT false,
  file_type VARCHAR(50),
  data_classification VARCHAR(50),
  domain VARCHAR(255),
  retention_days INTEGER,
  expected_arrival_time VARCHAR(50),
  delivery_method VARCHAR(100),
  vendor_type VARCHAR(100),
  vendor_department_email VARCHAR(255),
  vendor_onboarding_date DATE,
  governance_manager_user_id INTEGER,
  governance_approved_at TIMESTAMP WITHOUT TIME ZONE,
  governance_approved_by INTEGER,
  contract_start_date TIMESTAMP WITH TIME ZONE,
  contract_end_date TIMESTAMP WITH TIME ZONE,
  sub_project_id INTEGER,
  description TEXT,
  sla_enabled BOOLEAN DEFAULT false,
  frequency_pattern VARCHAR(50),
  arrival_days TEXT,
  alert_threshold_minutes INTEGER DEFAULT 60,
  arrival_time VARCHAR(10),
  additional_stakeholder_user_ids JSONB DEFAULT '[]'::jsonb,
  additional_stakeholder_group_ids JSONB DEFAULT '[]'::jsonb
);

-- TABLE: vendor_file_profiling_results
CREATE TABLE vendor_file_profiling_results (
  id INTEGER DEFAULT nextval('vendor_file_profiling_results_id_seq'::regclass) NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  uploaded_by_user_id INTEGER,
  vendor_id INTEGER,
  connection_id VARCHAR(255),
  quality_score NUMERIC(5,2),
  completeness_score NUMERIC(5,2),
  consistency_score NUMERIC(5,2),
  validity_score NUMERIC(5,2),
  uniqueness_score NUMERIC(5,2),
  timeliness_score NUMERIC(5,2),
  issues JSONB DEFAULT '[]'::jsonb,
  header_issues JSONB,
  null_value_summary JSONB,
  date_format_issues JSONB,
  duplicate_data JSONB,
  profiling_metadata JSONB,
  profiled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: vendor_sla_violations
CREATE TABLE vendor_sla_violations (
  id INTEGER DEFAULT nextval('vendor_sla_violations_id_seq'::regclass) NOT NULL,
  agreement_id INTEGER NOT NULL,
  expected_arrival_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  violation_detected_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  alert_sent BOOLEAN DEFAULT false,
  alert_sent_at TIMESTAMP WITHOUT TIME ZONE,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITHOUT TIME ZONE,
  file_id VARCHAR(255),
  actual_arrival_time TIMESTAMP WITHOUT TIME ZONE,
  delay_minutes INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- TABLE: vendor_users
CREATE TABLE vendor_users (
  id INTEGER DEFAULT nextval('vendor_users_id_seq'::regclass) NOT NULL,
  vendor_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  designation VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_by INTEGER
);

-- TABLE: vendors
CREATE TABLE vendors (
  id INTEGER DEFAULT nextval('vendors_id_seq'::regclass) NOT NULL,
  vendor_code VARCHAR(50) NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  description TEXT,
  contact_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(50),
  vendor_user_id INTEGER,
  project_id INTEGER,
  status VARCHAR(50) DEFAULT 'active'::character varying,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  address TEXT,
  backup_contact_name VARCHAR(255),
  backup_contact_phone VARCHAR(50),
  backup_contact_email VARCHAR(255),
  vendor_onboarding_date TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  vendor_type VARCHAR(100)
);

-- TABLE: visual_lineage_graphs
CREATE TABLE visual_lineage_graphs (
  id INTEGER DEFAULT nextval('visual_lineage_graphs_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  root_type VARCHAR(50) NOT NULL,
  root_id INTEGER NOT NULL,
  graph_config JSONB DEFAULT '{"depth": 3, "includeIncidents": true}'::jsonb,
  graph_data JSONB DEFAULT '{"edges": [], "nodes": []}'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  project_id INTEGER
);

-- TABLE: visual_mapping_defs
CREATE TABLE visual_mapping_defs (
  id INTEGER DEFAULT nextval('visual_mapping_defs_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  project_id INTEGER,
  sub_project_id INTEGER,
  graph_data JSONB DEFAULT '{"edges": [], "nodes": []}'::jsonb NOT NULL,
  canvas_state JSONB DEFAULT '{"zoom": 1, "position": [0, 0]}'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  last_executed_at TIMESTAMP WITHOUT TIME ZONE,
  execution_count INTEGER DEFAULT 0,
  notification_settings JSONB
);

-- TABLE: visual_mapping_edges
CREATE TABLE visual_mapping_edges (
  id INTEGER DEFAULT nextval('visual_mapping_edges_id_seq'::regclass) NOT NULL,
  mapping_id INTEGER NOT NULL,
  edge_id VARCHAR(100) NOT NULL,
  source_node_id VARCHAR(100) NOT NULL,
  target_node_id VARCHAR(100) NOT NULL,
  source_handle VARCHAR(50),
  target_handle VARCHAR(50),
  edge_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: visual_mapping_execution_logs
CREATE TABLE visual_mapping_execution_logs (
  id INTEGER DEFAULT nextval('visual_mapping_execution_logs_id_seq'::regclass) NOT NULL,
  mapping_id INTEGER NOT NULL,
  run_id VARCHAR(255) NOT NULL,
  run_name VARCHAR(255) NOT NULL,
  started_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  status VARCHAR(50) DEFAULT 'running'::character varying NOT NULL,
  logs JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  execution_id VARCHAR(255)
);

-- TABLE: visual_mapping_executions
CREATE TABLE visual_mapping_executions (
  id INTEGER DEFAULT nextval('visual_mapping_executions_id_seq'::regclass) NOT NULL,
  execution_id VARCHAR(100) NOT NULL,
  mapping_id INTEGER NOT NULL,
  transformation_job_id VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  started_at TIMESTAMP WITHOUT TIME ZONE,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  triggered_by INTEGER,
  node_executions JSONB DEFAULT '[]'::jsonb,
  edge_metrics JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  rows_processed INTEGER DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  transformation_id INTEGER,
  job_id VARCHAR(255),
  logs JSONB DEFAULT '[]'::jsonb
);

-- TABLE: visual_mapping_nodes
CREATE TABLE visual_mapping_nodes (
  id INTEGER DEFAULT nextval('visual_mapping_nodes_id_seq'::regclass) NOT NULL,
  mapping_id INTEGER NOT NULL,
  node_id VARCHAR(100) NOT NULL,
  node_type VARCHAR(50) NOT NULL,
  node_label VARCHAR(255),
  position_x DOUBLE PRECISION NOT NULL,
  position_y DOUBLE PRECISION NOT NULL,
  config_data JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TABLE: visual_workflow_execution_logs
CREATE TABLE visual_workflow_execution_logs (
  id INTEGER DEFAULT nextval('visual_workflow_execution_logs_id_seq'::regclass) NOT NULL,
  workflow_id INTEGER NOT NULL,
  run_id VARCHAR(255) NOT NULL,
  run_name VARCHAR(255) NOT NULL,
  started_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'running'::character varying,
  logs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  execution_id VARCHAR(255)
);

-- TABLE: visual_workflow_executions
CREATE TABLE visual_workflow_executions (
  id INTEGER DEFAULT nextval('visual_workflow_executions_id_seq'::regclass) NOT NULL,
  workflow_id INTEGER NOT NULL,
  execution_id TEXT NOT NULL,
  status TEXT DEFAULT 'running'::text,
  total_nodes INTEGER DEFAULT 0,
  completed_nodes INTEGER DEFAULT 0,
  failed_nodes INTEGER DEFAULT 0,
  start_time TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP WITHOUT TIME ZONE,
  duration_ms INTEGER,
  triggered_by INTEGER,
  error_message TEXT,
  execution_summary JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  project_id INTEGER
);

-- TABLE: visual_workflows
CREATE TABLE visual_workflows (
  id INTEGER DEFAULT nextval('visual_workflows_id_seq'::regclass) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  graph_data JSONB DEFAULT '{"edges": [], "nodes": []}'::jsonb NOT NULL,
  execution_mode VARCHAR(50) DEFAULT 'sequential'::character varying,
  created_by INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  project_id INTEGER,
  sub_project_id INTEGER
);

-- TABLE: workflow_executions
CREATE TABLE workflow_executions (
  id INTEGER DEFAULT nextval('workflow_executions_id_seq'::regclass) NOT NULL,
  workflow_id INTEGER NOT NULL,
  execution_id TEXT NOT NULL,
  status TEXT DEFAULT 'running'::text,
  current_step_id INTEGER,
  total_steps INTEGER DEFAULT 0,
  completed_steps INTEGER DEFAULT 0,
  failed_steps INTEGER DEFAULT 0,
  start_time TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP WITHOUT TIME ZONE,
  duration_ms INTEGER,
  triggered_by INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  project_id INTEGER NOT NULL
);

-- TABLE: workflow_steps
CREATE TABLE workflow_steps (
  id INTEGER DEFAULT nextval('workflow_steps_id_seq'::regclass) NOT NULL,
  workflow_id INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  step_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  depends_on INTEGER,
  retry_count INTEGER DEFAULT 3,
  retry_delay_seconds INTEGER DEFAULT 60,
  execution_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  project_id INTEGER NOT NULL
);

-- =====================================================
-- SECTION 3: PRIMARY KEY CONSTRAINTS
-- =====================================================

-- PRIMARY KEY: access_group_members.access_group_members_pkey
ALTER TABLE access_group_members ADD CONSTRAINT access_group_members_pkey PRIMARY KEY (group_id, user_id);
-- PRIMARY KEY: access_group_roles.access_group_roles_pkey
ALTER TABLE access_group_roles ADD CONSTRAINT access_group_roles_pkey PRIMARY KEY (id);
-- PRIMARY KEY: access_groups.access_groups_pkey
ALTER TABLE access_groups ADD CONSTRAINT access_groups_pkey PRIMARY KEY (id);
-- PRIMARY KEY: alert_aggregation.alert_aggregation_pkey
ALTER TABLE alert_aggregation ADD CONSTRAINT alert_aggregation_pkey PRIMARY KEY (id);
-- PRIMARY KEY: alert_attachments.alert_attachments_pkey
ALTER TABLE alert_attachments ADD CONSTRAINT alert_attachments_pkey PRIMARY KEY (id);
-- PRIMARY KEY: alert_events.alert_events_pkey
ALTER TABLE alert_events ADD CONSTRAINT alert_events_pkey PRIMARY KEY (id);
-- PRIMARY KEY: alert_history.alert_history_pkey
ALTER TABLE alert_history ADD CONSTRAINT alert_history_pkey PRIMARY KEY (id);
-- PRIMARY KEY: alert_policies.alert_policies_pkey
ALTER TABLE alert_policies ADD CONSTRAINT alert_policies_pkey PRIMARY KEY (id);
-- PRIMARY KEY: alert_policy_recipients.alert_policy_recipients_pkey
ALTER TABLE alert_policy_recipients ADD CONSTRAINT alert_policy_recipients_pkey PRIMARY KEY (id);
-- PRIMARY KEY: alert_rules.alert_rules_pkey
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_pkey PRIMARY KEY (id);
-- PRIMARY KEY: alert_runs.alert_runs_pkey
ALTER TABLE alert_runs ADD CONSTRAINT alert_runs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: allowed_email_domains.allowed_email_domains_pkey
ALTER TABLE allowed_email_domains ADD CONSTRAINT allowed_email_domains_pkey PRIMARY KEY (id);
-- PRIMARY KEY: anomalies.anomalies_pkey
ALTER TABLE anomalies ADD CONSTRAINT anomalies_pkey PRIMARY KEY (id);
-- PRIMARY KEY: api_tokens.api_tokens_pkey
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);
-- PRIMARY KEY: app_settings.app_settings_pkey
ALTER TABLE app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);
-- PRIMARY KEY: archive_extractions.archive_extractions_pkey
ALTER TABLE archive_extractions ADD CONSTRAINT archive_extractions_pkey PRIMARY KEY (id);
-- PRIMARY KEY: archive_members.archive_members_pkey
ALTER TABLE archive_members ADD CONSTRAINT archive_members_pkey PRIMARY KEY (id);
-- PRIMARY KEY: archived_files.archived_files_pkey
ALTER TABLE archived_files ADD CONSTRAINT archived_files_pkey PRIMARY KEY (id);
-- PRIMARY KEY: attribute_definitions.attribute_definitions_pkey
ALTER TABLE attribute_definitions ADD CONSTRAINT attribute_definitions_pkey PRIMARY KEY (id);
-- PRIMARY KEY: audit_ledger.audit_ledger_pkey
ALTER TABLE audit_ledger ADD CONSTRAINT audit_ledger_pkey PRIMARY KEY (id);
-- PRIMARY KEY: audit_ledger_sequence.audit_ledger_sequence_pkey
ALTER TABLE audit_ledger_sequence ADD CONSTRAINT audit_ledger_sequence_pkey PRIMARY KEY (tenant_id);
-- PRIMARY KEY: audit_ledger_verification.audit_ledger_verification_pkey
ALTER TABLE audit_ledger_verification ADD CONSTRAINT audit_ledger_verification_pkey PRIMARY KEY (id);
-- PRIMARY KEY: audit_log.audit_log_pkey
ALTER TABLE audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (audit_id);
-- PRIMARY KEY: audit_log_archive.audit_log_archive_pkey
ALTER TABLE audit_log_archive ADD CONSTRAINT audit_log_archive_pkey PRIMARY KEY (audit_id);
-- PRIMARY KEY: audit_retention_settings.audit_retention_settings_pkey
ALTER TABLE audit_retention_settings ADD CONSTRAINT audit_retention_settings_pkey PRIMARY KEY (id);
-- PRIMARY KEY: bulk_profiling_files.bulk_profiling_files_pkey
ALTER TABLE bulk_profiling_files ADD CONSTRAINT bulk_profiling_files_pkey PRIMARY KEY (id);
-- PRIMARY KEY: bulk_profiling_jobs.bulk_profiling_jobs_pkey
ALTER TABLE bulk_profiling_jobs ADD CONSTRAINT bulk_profiling_jobs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: business_processes.business_processes_pkey
ALTER TABLE business_processes ADD CONSTRAINT business_processes_pkey PRIMARY KEY (id);
-- PRIMARY KEY: column_governance_tag_assignments.column_governance_tag_assignments_pkey
ALTER TABLE column_governance_tag_assignments ADD CONSTRAINT column_governance_tag_assignments_pkey PRIMARY KEY (assignment_id);
-- PRIMARY KEY: column_mappings.column_mappings_pkey
ALTER TABLE column_mappings ADD CONSTRAINT column_mappings_pkey PRIMARY KEY (id);
-- PRIMARY KEY: column_policy_assignments.column_policy_assignments_pkey
ALTER TABLE column_policy_assignments ADD CONSTRAINT column_policy_assignments_pkey PRIMARY KEY (assignment_id);
-- PRIMARY KEY: column_sensitivity_tags.column_sensitivity_tags_pkey
ALTER TABLE column_sensitivity_tags ADD CONSTRAINT column_sensitivity_tags_pkey PRIMARY KEY (tag_id);
-- PRIMARY KEY: config_change_history.config_change_history_pkey
ALTER TABLE config_change_history ADD CONSTRAINT config_change_history_pkey PRIMARY KEY (change_id);
-- PRIMARY KEY: config_change_history_archive.config_change_history_archive_pkey
ALTER TABLE config_change_history_archive ADD CONSTRAINT config_change_history_archive_pkey PRIMARY KEY (change_id);
-- PRIMARY KEY: connections.connections_pkey
ALTER TABLE connections ADD CONSTRAINT connections_pkey PRIMARY KEY (id);
-- PRIMARY KEY: data_access_log.data_access_log_pkey
ALTER TABLE data_access_log ADD CONSTRAINT data_access_log_pkey PRIMARY KEY (access_id);
-- PRIMARY KEY: data_access_log_archive.data_access_log_archive_pkey
ALTER TABLE data_access_log_archive ADD CONSTRAINT data_access_log_archive_pkey PRIMARY KEY (access_id);
-- PRIMARY KEY: dbt_executions.dbt_executions_pkey
ALTER TABLE dbt_executions ADD CONSTRAINT dbt_executions_pkey PRIMARY KEY (execution_id);
-- PRIMARY KEY: dbt_models.dbt_models_pkey
ALTER TABLE dbt_models ADD CONSTRAINT dbt_models_pkey PRIMARY KEY (model_id);
-- PRIMARY KEY: dlq_jobs.dlq_jobs_pkey
ALTER TABLE dlq_jobs ADD CONSTRAINT dlq_jobs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: drop_location_config.drop_location_config_pkey
ALTER TABLE drop_location_config ADD CONSTRAINT drop_location_config_pkey PRIMARY KEY (id);
-- PRIMARY KEY: encrypted_passwords.encrypted_passwords_pkey
ALTER TABLE encrypted_passwords ADD CONSTRAINT encrypted_passwords_pkey PRIMARY KEY (id);
-- PRIMARY KEY: execution_audit.execution_audit_pkey
ALTER TABLE execution_audit ADD CONSTRAINT execution_audit_pkey PRIMARY KEY (audit_id);
-- PRIMARY KEY: execution_audit_archive.execution_audit_archive_pkey
ALTER TABLE execution_audit_archive ADD CONSTRAINT execution_audit_archive_pkey PRIMARY KEY (audit_id);
-- PRIMARY KEY: file_audit_details.file_audit_details_pkey
ALTER TABLE file_audit_details ADD CONSTRAINT file_audit_details_pkey PRIMARY KEY (id);
-- PRIMARY KEY: file_columns.file_columns_pkey
ALTER TABLE file_columns ADD CONSTRAINT file_columns_pkey PRIMARY KEY (id);
-- PRIMARY KEY: file_errors.file_errors_pkey
ALTER TABLE file_errors ADD CONSTRAINT file_errors_pkey PRIMARY KEY (id);
-- PRIMARY KEY: file_history.file_history_pkey
ALTER TABLE file_history ADD CONSTRAINT file_history_pkey PRIMARY KEY (id);
-- PRIMARY KEY: file_lineage.file_lineage_pkey
ALTER TABLE file_lineage ADD CONSTRAINT file_lineage_pkey PRIMARY KEY (id);
-- PRIMARY KEY: file_mappings.file_mappings_pkey
ALTER TABLE file_mappings ADD CONSTRAINT file_mappings_pkey PRIMARY KEY (id);
-- PRIMARY KEY: file_ownership.file_ownership_pkey
ALTER TABLE file_ownership ADD CONSTRAINT file_ownership_pkey PRIMARY KEY (ownership_id);
-- PRIMARY KEY: file_pattern_metrics.file_pattern_metrics_pkey
ALTER TABLE file_pattern_metrics ADD CONSTRAINT file_pattern_metrics_pkey PRIMARY KEY (id);
-- PRIMARY KEY: file_policy_assignments.file_policy_assignments_pkey
ALTER TABLE file_policy_assignments ADD CONSTRAINT file_policy_assignments_pkey PRIMARY KEY (assignment_id);
-- PRIMARY KEY: file_preview_data.file_preview_data_pkey
ALTER TABLE file_preview_data ADD CONSTRAINT file_preview_data_pkey PRIMARY KEY (preview_id);
-- PRIMARY KEY: file_processing_artifacts.file_processing_artifacts_pkey
ALTER TABLE file_processing_artifacts ADD CONSTRAINT file_processing_artifacts_pkey PRIMARY KEY (id);
-- PRIMARY KEY: file_quality_checks.file_quality_checks_pkey
ALTER TABLE file_quality_checks ADD CONSTRAINT file_quality_checks_pkey PRIMARY KEY (id);
-- PRIMARY KEY: file_quality_rules.file_quality_rules_pkey
ALTER TABLE file_quality_rules ADD CONSTRAINT file_quality_rules_pkey PRIMARY KEY (id);
-- PRIMARY KEY: file_restorations.file_restorations_pkey
ALTER TABLE file_restorations ADD CONSTRAINT file_restorations_pkey PRIMARY KEY (id);
-- PRIMARY KEY: file_schedules.file_schedules_pkey
ALTER TABLE file_schedules ADD CONSTRAINT file_schedules_pkey PRIMARY KEY (id);
-- PRIMARY KEY: file_schema_details.file_schema_details_pkey
ALTER TABLE file_schema_details ADD CONSTRAINT file_schema_details_pkey PRIMARY KEY (id);
-- PRIMARY KEY: file_schemas.file_schemas_pkey
ALTER TABLE file_schemas ADD CONSTRAINT file_schemas_pkey PRIMARY KEY (id);
-- PRIMARY KEY: file_tag_assignments.file_tag_assignments_pkey
ALTER TABLE file_tag_assignments ADD CONSTRAINT file_tag_assignments_pkey PRIMARY KEY (assignment_id);
-- PRIMARY KEY: files.files_pkey
ALTER TABLE files ADD CONSTRAINT files_pkey PRIMARY KEY (id);
-- PRIMARY KEY: fixed_width_schemas.fixed_width_schemas_pkey
ALTER TABLE fixed_width_schemas ADD CONSTRAINT fixed_width_schemas_pkey PRIMARY KEY (id);
-- PRIMARY KEY: frontend_audit_log.frontend_audit_log_pkey
ALTER TABLE frontend_audit_log ADD CONSTRAINT frontend_audit_log_pkey PRIMARY KEY (audit_id);
-- PRIMARY KEY: governance_policies.governance_policies_pkey
ALTER TABLE governance_policies ADD CONSTRAINT governance_policies_pkey PRIMARY KEY (policy_id);
-- PRIMARY KEY: governance_tags.governance_tags_pkey
ALTER TABLE governance_tags ADD CONSTRAINT governance_tags_pkey PRIMARY KEY (tag_id);
-- PRIMARY KEY: group_policy_attachments.group_policy_attachments_pkey
ALTER TABLE group_policy_attachments ADD CONSTRAINT group_policy_attachments_pkey PRIMARY KEY (group_id, policy_id);
-- PRIMARY KEY: groups.groups_pkey
ALTER TABLE groups ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
-- PRIMARY KEY: idempotency_keys.idempotency_keys_pkey
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (id);
-- PRIMARY KEY: job_dependencies.job_dependencies_pkey
ALTER TABLE job_dependencies ADD CONSTRAINT job_dependencies_pkey PRIMARY KEY (dependency_id);
-- PRIMARY KEY: job_group_dependencies.job_group_dependencies_pkey
ALTER TABLE job_group_dependencies ADD CONSTRAINT job_group_dependencies_pkey PRIMARY KEY (group_dependency_id);
-- PRIMARY KEY: job_group_jobs.job_group_jobs_pkey
ALTER TABLE job_group_jobs ADD CONSTRAINT job_group_jobs_pkey PRIMARY KEY (group_id, job_id);
-- PRIMARY KEY: job_group_schedules.job_group_schedules_pkey
ALTER TABLE job_group_schedules ADD CONSTRAINT job_group_schedules_pkey PRIMARY KEY (group_schedule_id);
-- PRIMARY KEY: job_groups.job_groups_pkey
ALTER TABLE job_groups ADD CONSTRAINT job_groups_pkey PRIMARY KEY (id);
-- PRIMARY KEY: job_history.job_history_pkey
ALTER TABLE job_history ADD CONSTRAINT job_history_pkey PRIMARY KEY (id);
-- PRIMARY KEY: job_runs.job_runs_pkey
ALTER TABLE job_runs ADD CONSTRAINT job_runs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: job_schedules.job_schedules_pkey
ALTER TABLE job_schedules ADD CONSTRAINT job_schedules_pkey PRIMARY KEY (id);
-- PRIMARY KEY: jobs.jobs_pkey
ALTER TABLE jobs ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: lineage_views.lineage_views_pkey
ALTER TABLE lineage_views ADD CONSTRAINT lineage_views_pkey PRIMARY KEY (id);
-- PRIMARY KEY: logical_file_groups.logical_file_groups_pkey
ALTER TABLE logical_file_groups ADD CONSTRAINT logical_file_groups_pkey PRIMARY KEY (id);
-- PRIMARY KEY: mapping_group_executions.mapping_group_executions_pkey
ALTER TABLE mapping_group_executions ADD CONSTRAINT mapping_group_executions_pkey PRIMARY KEY (id);
-- PRIMARY KEY: mapping_group_members.mapping_group_members_pkey
ALTER TABLE mapping_group_members ADD CONSTRAINT mapping_group_members_pkey PRIMARY KEY (id);
-- PRIMARY KEY: mapping_groups.mapping_groups_pkey
ALTER TABLE mapping_groups ADD CONSTRAINT mapping_groups_pkey PRIMARY KEY (id);
-- PRIMARY KEY: mapping_job_errors.mapping_job_errors_pkey
ALTER TABLE mapping_job_errors ADD CONSTRAINT mapping_job_errors_pkey PRIMARY KEY (id);
-- PRIMARY KEY: migrations.migrations_pkey
ALTER TABLE migrations ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);
-- PRIMARY KEY: n_step_workflow_assets.n_step_workflow_assets_pkey
ALTER TABLE n_step_workflow_assets ADD CONSTRAINT n_step_workflow_assets_pkey PRIMARY KEY (id);
-- PRIMARY KEY: n_step_workflow_run_steps.n_step_workflow_run_steps_pkey
ALTER TABLE n_step_workflow_run_steps ADD CONSTRAINT n_step_workflow_run_steps_pkey PRIMARY KEY (id);
-- PRIMARY KEY: n_step_workflow_runs.n_step_workflow_runs_pkey
ALTER TABLE n_step_workflow_runs ADD CONSTRAINT n_step_workflow_runs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: n_step_workflow_steps.n_step_workflow_steps_pkey
ALTER TABLE n_step_workflow_steps ADD CONSTRAINT n_step_workflow_steps_pkey PRIMARY KEY (id);
-- PRIMARY KEY: n_step_workflows.n_step_workflows_pkey
ALTER TABLE n_step_workflows ADD CONSTRAINT n_step_workflows_pkey PRIMARY KEY (id);
-- PRIMARY KEY: notifications.notifications_pkey
ALTER TABLE notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
-- PRIMARY KEY: password_reset_requests.password_reset_requests_pkey
ALTER TABLE password_reset_requests ADD CONSTRAINT password_reset_requests_pkey PRIMARY KEY (id);
-- PRIMARY KEY: permissions.permissions_pkey
ALTER TABLE permissions ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);
-- PRIMARY KEY: policy_evaluation_cache.policy_evaluation_cache_pkey
ALTER TABLE policy_evaluation_cache ADD CONSTRAINT policy_evaluation_cache_pkey PRIMARY KEY (cache_key);
-- PRIMARY KEY: processing_events.processing_events_pkey
ALTER TABLE processing_events ADD CONSTRAINT processing_events_pkey PRIMARY KEY (id);
-- PRIMARY KEY: profiling_metrics.profiling_metrics_pkey
ALTER TABLE profiling_metrics ADD CONSTRAINT profiling_metrics_pkey PRIMARY KEY (id);
-- PRIMARY KEY: project_access_groups.project_access_groups_pkey
ALTER TABLE project_access_groups ADD CONSTRAINT project_access_groups_pkey PRIMARY KEY (project_id, group_id);
-- PRIMARY KEY: projects.projects_pkey
ALTER TABLE projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
-- PRIMARY KEY: quality_reports.quality_reports_pkey
ALTER TABLE quality_reports ADD CONSTRAINT quality_reports_pkey PRIMARY KEY (report_id);
-- PRIMARY KEY: quality_rule_configurations.quality_rule_configurations_pkey
ALTER TABLE quality_rule_configurations ADD CONSTRAINT quality_rule_configurations_pkey PRIMARY KEY (id);
-- PRIMARY KEY: quality_rule_violations.quality_rule_violations_pkey
ALTER TABLE quality_rule_violations ADD CONSTRAINT quality_rule_violations_pkey PRIMARY KEY (id);
-- PRIMARY KEY: quality_rules.quality_rules_pkey
ALTER TABLE quality_rules ADD CONSTRAINT quality_rules_pkey PRIMARY KEY (id);
-- PRIMARY KEY: rbac_policies.rbac_policies_pkey
ALTER TABLE rbac_policies ADD CONSTRAINT rbac_policies_pkey PRIMARY KEY (id);
-- PRIMARY KEY: refresh_tokens.refresh_tokens_pkey
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);
-- PRIMARY KEY: resource_attributes.resource_attributes_pkey
ALTER TABLE resource_attributes ADD CONSTRAINT resource_attributes_pkey PRIMARY KEY (id);
-- PRIMARY KEY: resource_policy_attachments.resource_policy_attachments_pkey
ALTER TABLE resource_policy_attachments ADD CONSTRAINT resource_policy_attachments_pkey PRIMARY KEY (resource_type, resource_id, policy_id);
-- PRIMARY KEY: retention_policies.retention_policies_pkey
ALTER TABLE retention_policies ADD CONSTRAINT retention_policies_pkey PRIMARY KEY (id);
-- PRIMARY KEY: retention_policy_runs.retention_policy_runs_pkey
ALTER TABLE retention_policy_runs ADD CONSTRAINT retention_policy_runs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: role_permissions.role_permissions_pkey
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);
-- PRIMARY KEY: roles.roles_pkey
ALTER TABLE roles ADD CONSTRAINT roles_pkey PRIMARY KEY (id);
-- PRIMARY KEY: schedules.schedules_pkey
ALTER TABLE schedules ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);
-- PRIMARY KEY: schema_migrations.schema_migrations_pkey
ALTER TABLE schema_migrations ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);
-- PRIMARY KEY: schema_validation_job_files.schema_validation_job_files_pkey
ALTER TABLE schema_validation_job_files ADD CONSTRAINT schema_validation_job_files_pkey PRIMARY KEY (id);
-- PRIMARY KEY: schema_validation_jobs.schema_validation_jobs_pkey
ALTER TABLE schema_validation_jobs ADD CONSTRAINT schema_validation_jobs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: scim_configurations.scim_configurations_pkey
ALTER TABLE scim_configurations ADD CONSTRAINT scim_configurations_pkey PRIMARY KEY (id);
-- PRIMARY KEY: scim_resource_mappings.scim_resource_mappings_pkey
ALTER TABLE scim_resource_mappings ADD CONSTRAINT scim_resource_mappings_pkey PRIMARY KEY (id);
-- PRIMARY KEY: scim_sync_logs.scim_sync_logs_pkey
ALTER TABLE scim_sync_logs ADD CONSTRAINT scim_sync_logs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: security_audit_log.security_audit_log_pkey
ALTER TABLE security_audit_log ADD CONSTRAINT security_audit_log_pkey PRIMARY KEY (security_audit_id);
-- PRIMARY KEY: security_audit_log_archive.security_audit_log_archive_pkey
ALTER TABLE security_audit_log_archive ADD CONSTRAINT security_audit_log_archive_pkey PRIMARY KEY (security_audit_id);
-- PRIMARY KEY: storage_connections.storage_connections_pkey
ALTER TABLE storage_connections ADD CONSTRAINT storage_connections_pkey PRIMARY KEY (connection_id);
-- PRIMARY KEY: sub_project_access_groups.sub_project_access_groups_pkey
ALTER TABLE sub_project_access_groups ADD CONSTRAINT sub_project_access_groups_pkey PRIMARY KEY (id);
-- PRIMARY KEY: sub_project_members.sub_project_members_pkey
ALTER TABLE sub_project_members ADD CONSTRAINT sub_project_members_pkey PRIMARY KEY (id);
-- PRIMARY KEY: tag_permissions.tag_permissions_pkey
ALTER TABLE tag_permissions ADD CONSTRAINT tag_permissions_pkey PRIMARY KEY (id);
-- PRIMARY KEY: transform_connections.transform_connections_pkey
ALTER TABLE transform_connections ADD CONSTRAINT transform_connections_pkey PRIMARY KEY (id);
-- PRIMARY KEY: transformation_executions.transformation_executions_pkey
ALTER TABLE transformation_executions ADD CONSTRAINT transformation_executions_pkey PRIMARY KEY (id);
-- PRIMARY KEY: transformation_jobs.transformation_jobs_pkey
ALTER TABLE transformation_jobs ADD CONSTRAINT transformation_jobs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: transformation_lineage.transformation_lineage_pkey
ALTER TABLE transformation_lineage ADD CONSTRAINT transformation_lineage_pkey PRIMARY KEY (id);
-- PRIMARY KEY: transformation_logs.transformation_logs_pkey
ALTER TABLE transformation_logs ADD CONSTRAINT transformation_logs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: transformation_mappings.transformation_mappings_pkey
ALTER TABLE transformation_mappings ADD CONSTRAINT transformation_mappings_pkey PRIMARY KEY (id);
-- PRIMARY KEY: transformation_outputs.transformation_outputs_pkey
ALTER TABLE transformation_outputs ADD CONSTRAINT transformation_outputs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: transformation_quality_rules.transformation_quality_rules_pkey
ALTER TABLE transformation_quality_rules ADD CONSTRAINT transformation_quality_rules_pkey PRIMARY KEY (id);
-- PRIMARY KEY: transformations.transformations_pkey
ALTER TABLE transformations ADD CONSTRAINT transformations_pkey PRIMARY KEY (id);
-- PRIMARY KEY: upload_batches.upload_batches_pkey
ALTER TABLE upload_batches ADD CONSTRAINT upload_batches_pkey PRIMARY KEY (id);
-- PRIMARY KEY: upload_file_records.upload_file_records_pkey
ALTER TABLE upload_file_records ADD CONSTRAINT upload_file_records_pkey PRIMARY KEY (id);
-- PRIMARY KEY: upload_files.upload_files_pkey
ALTER TABLE upload_files ADD CONSTRAINT upload_files_pkey PRIMARY KEY (id);
-- PRIMARY KEY: user_attributes.user_attributes_pkey
ALTER TABLE user_attributes ADD CONSTRAINT user_attributes_pkey PRIMARY KEY (id);
-- PRIMARY KEY: user_badges.user_badges_pkey
ALTER TABLE user_badges ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);
-- PRIMARY KEY: user_dashboard_settings.user_dashboard_settings_pkey
ALTER TABLE user_dashboard_settings ADD CONSTRAINT user_dashboard_settings_pkey PRIMARY KEY (id);
-- PRIMARY KEY: user_groups.user_groups_pkey
ALTER TABLE user_groups ADD CONSTRAINT user_groups_pkey PRIMARY KEY (user_id, group_id);
-- PRIMARY KEY: user_job_groups.user_job_groups_pkey
ALTER TABLE user_job_groups ADD CONSTRAINT user_job_groups_pkey PRIMARY KEY (user_id, group_id);
-- PRIMARY KEY: user_policy_attachments.user_policy_attachments_pkey
ALTER TABLE user_policy_attachments ADD CONSTRAINT user_policy_attachments_pkey PRIMARY KEY (user_id, policy_id);
-- PRIMARY KEY: user_roles.user_roles_pkey
ALTER TABLE user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);
-- PRIMARY KEY: user_sessions.user_sessions_pkey
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);
-- PRIMARY KEY: user_uuid_mapping.user_uuid_mapping_pkey
ALTER TABLE user_uuid_mapping ADD CONSTRAINT user_uuid_mapping_pkey PRIMARY KEY (user_id);
-- PRIMARY KEY: users.users_pkey
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
-- PRIMARY KEY: vendor_agreement_approvals.vendor_agreement_approvals_pkey
ALTER TABLE vendor_agreement_approvals ADD CONSTRAINT vendor_agreement_approvals_pkey PRIMARY KEY (id);
-- PRIMARY KEY: vendor_agreement_changes.vendor_agreement_changes_pkey
ALTER TABLE vendor_agreement_changes ADD CONSTRAINT vendor_agreement_changes_pkey PRIMARY KEY (id);
-- PRIMARY KEY: vendor_agreement_documents.vendor_agreement_documents_pkey
ALTER TABLE vendor_agreement_documents ADD CONSTRAINT vendor_agreement_documents_pkey PRIMARY KEY (id);
-- PRIMARY KEY: vendor_agreement_file_schemas.vendor_agreement_file_schemas_pkey
ALTER TABLE vendor_agreement_file_schemas ADD CONSTRAINT vendor_agreement_file_schemas_pkey PRIMARY KEY (id);
-- PRIMARY KEY: vendor_agreements.vendor_agreements_pkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_pkey PRIMARY KEY (id);
-- PRIMARY KEY: vendor_file_profiling_results.vendor_file_profiling_results_pkey
ALTER TABLE vendor_file_profiling_results ADD CONSTRAINT vendor_file_profiling_results_pkey PRIMARY KEY (id);
-- PRIMARY KEY: vendor_sla_violations.vendor_sla_violations_pkey
ALTER TABLE vendor_sla_violations ADD CONSTRAINT vendor_sla_violations_pkey PRIMARY KEY (id);
-- PRIMARY KEY: vendor_users.vendor_users_pkey
ALTER TABLE vendor_users ADD CONSTRAINT vendor_users_pkey PRIMARY KEY (id);
-- PRIMARY KEY: vendors.vendors_pkey
ALTER TABLE vendors ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);
-- PRIMARY KEY: visual_lineage_graphs.visual_lineage_graphs_pkey
ALTER TABLE visual_lineage_graphs ADD CONSTRAINT visual_lineage_graphs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: visual_mapping_defs.visual_mapping_defs_pkey
ALTER TABLE visual_mapping_defs ADD CONSTRAINT visual_mapping_defs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: visual_mapping_edges.visual_mapping_edges_pkey
ALTER TABLE visual_mapping_edges ADD CONSTRAINT visual_mapping_edges_pkey PRIMARY KEY (id);
-- PRIMARY KEY: visual_mapping_execution_logs.visual_mapping_execution_logs_pkey
ALTER TABLE visual_mapping_execution_logs ADD CONSTRAINT visual_mapping_execution_logs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: visual_mapping_executions.visual_mapping_executions_pkey
ALTER TABLE visual_mapping_executions ADD CONSTRAINT visual_mapping_executions_pkey PRIMARY KEY (id);
-- PRIMARY KEY: visual_mapping_nodes.visual_mapping_nodes_pkey
ALTER TABLE visual_mapping_nodes ADD CONSTRAINT visual_mapping_nodes_pkey PRIMARY KEY (id);
-- PRIMARY KEY: visual_workflow_execution_logs.visual_workflow_execution_logs_pkey
ALTER TABLE visual_workflow_execution_logs ADD CONSTRAINT visual_workflow_execution_logs_pkey PRIMARY KEY (id);
-- PRIMARY KEY: visual_workflow_executions.visual_workflow_executions_pkey
ALTER TABLE visual_workflow_executions ADD CONSTRAINT visual_workflow_executions_pkey PRIMARY KEY (id);
-- PRIMARY KEY: visual_workflows.visual_workflows_pkey
ALTER TABLE visual_workflows ADD CONSTRAINT visual_workflows_pkey PRIMARY KEY (id);
-- PRIMARY KEY: workflow_executions.workflow_executions_pkey
ALTER TABLE workflow_executions ADD CONSTRAINT workflow_executions_pkey PRIMARY KEY (id);
-- PRIMARY KEY: workflow_steps.workflow_steps_pkey
ALTER TABLE workflow_steps ADD CONSTRAINT workflow_steps_pkey PRIMARY KEY (id);

-- =====================================================
-- SECTION 4: FOREIGN KEY CONSTRAINTS
-- =====================================================

-- FOREIGN KEY: access_group_members.access_group_members_user_id_fkey
ALTER TABLE access_group_members ADD CONSTRAINT access_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: access_group_members.access_group_members_group_id_fkey
ALTER TABLE access_group_members ADD CONSTRAINT access_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES access_groups(id);
-- FOREIGN KEY: access_group_members.access_group_members_added_by_fkey
ALTER TABLE access_group_members ADD CONSTRAINT access_group_members_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id);
-- FOREIGN KEY: access_group_roles.access_group_roles_group_id_fkey
ALTER TABLE access_group_roles ADD CONSTRAINT access_group_roles_group_id_fkey FOREIGN KEY (group_id) REFERENCES access_groups(id);
-- FOREIGN KEY: access_group_roles.access_group_roles_project_id_fkey
ALTER TABLE access_group_roles ADD CONSTRAINT access_group_roles_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: access_group_roles.access_group_roles_role_id_fkey
ALTER TABLE access_group_roles ADD CONSTRAINT access_group_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id);
-- FOREIGN KEY: access_group_roles.access_group_roles_assigned_by_fkey
ALTER TABLE access_group_roles ADD CONSTRAINT access_group_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id);
-- FOREIGN KEY: access_groups.access_groups_created_by_fkey
ALTER TABLE access_groups ADD CONSTRAINT access_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: alert_aggregation.alert_aggregation_policy_id_fkey
ALTER TABLE alert_aggregation ADD CONSTRAINT alert_aggregation_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES alert_policies(id);
-- FOREIGN KEY: alert_attachments.alert_attachments_run_id_fkey
ALTER TABLE alert_attachments ADD CONSTRAINT alert_attachments_run_id_fkey FOREIGN KEY (run_id) REFERENCES alert_runs(id);
-- FOREIGN KEY: alert_events.alert_events_vendor_sla_violation_id_fkey
ALTER TABLE alert_events ADD CONSTRAINT alert_events_vendor_sla_violation_id_fkey FOREIGN KEY (vendor_sla_violation_id) REFERENCES vendor_sla_violations(id);
-- FOREIGN KEY: alert_events.alert_events_run_id_fkey
ALTER TABLE alert_events ADD CONSTRAINT alert_events_run_id_fkey FOREIGN KEY (run_id) REFERENCES alert_runs(id);
-- FOREIGN KEY: alert_history.alert_history_rule_id_fkey
ALTER TABLE alert_history ADD CONSTRAINT alert_history_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES alert_rules(id);
-- FOREIGN KEY: alert_history.alert_history_file_id_fkey
ALTER TABLE alert_history ADD CONSTRAINT alert_history_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: alert_policies.alert_policies_project_id_fkey
ALTER TABLE alert_policies ADD CONSTRAINT alert_policies_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: alert_policies.alert_policies_email_connection_id_fkey
ALTER TABLE alert_policies ADD CONSTRAINT alert_policies_email_connection_id_fkey FOREIGN KEY (email_connection_id) REFERENCES storage_connections(connection_id);
-- FOREIGN KEY: alert_policies.alert_policies_created_by_fkey
ALTER TABLE alert_policies ADD CONSTRAINT alert_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: alert_policy_recipients.alert_policy_recipients_policy_id_fkey
ALTER TABLE alert_policy_recipients ADD CONSTRAINT alert_policy_recipients_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES alert_policies(id);
-- FOREIGN KEY: alert_policy_recipients.alert_policy_recipients_user_id_fkey
ALTER TABLE alert_policy_recipients ADD CONSTRAINT alert_policy_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: alert_runs.alert_runs_email_connection_id_fkey
ALTER TABLE alert_runs ADD CONSTRAINT alert_runs_email_connection_id_fkey FOREIGN KEY (email_connection_id) REFERENCES storage_connections(connection_id);
-- FOREIGN KEY: alert_runs.alert_runs_policy_id_fkey
ALTER TABLE alert_runs ADD CONSTRAINT alert_runs_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES alert_policies(id);
-- FOREIGN KEY: allowed_email_domains.allowed_email_domains_created_by_fkey
ALTER TABLE allowed_email_domains ADD CONSTRAINT allowed_email_domains_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: api_tokens.api_tokens_project_id_fkey
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: api_tokens.api_tokens_created_by_fkey
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: api_tokens.api_tokens_revoked_by_fkey
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES users(id);
-- FOREIGN KEY: api_tokens.api_tokens_user_id_fkey
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: archive_extractions.archive_extractions_file_id_fkey
ALTER TABLE archive_extractions ADD CONSTRAINT archive_extractions_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: archive_members.archive_members_parent_file_id_fkey
ALTER TABLE archive_members ADD CONSTRAINT archive_members_parent_file_id_fkey FOREIGN KEY (parent_file_id) REFERENCES files(file_id);
-- FOREIGN KEY: archive_members.archive_members_extracted_file_id_fkey
ALTER TABLE archive_members ADD CONSTRAINT archive_members_extracted_file_id_fkey FOREIGN KEY (extracted_file_id) REFERENCES files(file_id);
-- FOREIGN KEY: archived_files.archived_files_policy_id_fkey
ALTER TABLE archived_files ADD CONSTRAINT archived_files_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES retention_policies(id);
-- FOREIGN KEY: archived_files.archived_files_archived_by_fkey
ALTER TABLE archived_files ADD CONSTRAINT archived_files_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES users(id);
-- FOREIGN KEY: archived_files.archived_files_deleted_by_fkey
ALTER TABLE archived_files ADD CONSTRAINT archived_files_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
-- FOREIGN KEY: archived_files.archived_files_restored_by_fkey
ALTER TABLE archived_files ADD CONSTRAINT archived_files_restored_by_fkey FOREIGN KEY (restored_by) REFERENCES users(id);
-- FOREIGN KEY: audit_log.audit_log_parent_audit_id_fkey
ALTER TABLE audit_log ADD CONSTRAINT audit_log_parent_audit_id_fkey FOREIGN KEY (parent_audit_id) REFERENCES audit_log(audit_id);
-- FOREIGN KEY: bulk_profiling_files.bulk_profiling_files_job_id_fkey
ALTER TABLE bulk_profiling_files ADD CONSTRAINT bulk_profiling_files_job_id_fkey FOREIGN KEY (job_id) REFERENCES bulk_profiling_jobs(id);
-- FOREIGN KEY: bulk_profiling_jobs.bulk_profiling_jobs_sub_project_id_fkey
ALTER TABLE bulk_profiling_jobs ADD CONSTRAINT bulk_profiling_jobs_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FOREIGN KEY: business_processes.fk_business_processes_project
ALTER TABLE business_processes ADD CONSTRAINT fk_business_processes_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: business_processes.business_processes_group_id_fkey
ALTER TABLE business_processes ADD CONSTRAINT business_processes_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id);
-- FOREIGN KEY: column_governance_tag_assignments.fk_column_tag_file
ALTER TABLE column_governance_tag_assignments ADD CONSTRAINT fk_column_tag_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: column_governance_tag_assignments.fk_column_tag_tag
ALTER TABLE column_governance_tag_assignments ADD CONSTRAINT fk_column_tag_tag FOREIGN KEY (tag_id) REFERENCES governance_tags(tag_id);
-- FOREIGN KEY: column_mappings.column_mappings_source_file_id_fkey
ALTER TABLE column_mappings ADD CONSTRAINT column_mappings_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES files(file_id);
-- FOREIGN KEY: column_policy_assignments.fk_column_policy_policy
ALTER TABLE column_policy_assignments ADD CONSTRAINT fk_column_policy_policy FOREIGN KEY (policy_id) REFERENCES governance_policies(policy_id);
-- FOREIGN KEY: column_policy_assignments.fk_column_policy_file
ALTER TABLE column_policy_assignments ADD CONSTRAINT fk_column_policy_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: column_sensitivity_tags.fk_column_tags_file
ALTER TABLE column_sensitivity_tags ADD CONSTRAINT fk_column_tags_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: dlq_jobs.dlq_jobs_resolved_by_fkey
ALTER TABLE dlq_jobs ADD CONSTRAINT dlq_jobs_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id);
-- FOREIGN KEY: dlq_jobs.dlq_jobs_project_id_fkey
ALTER TABLE dlq_jobs ADD CONSTRAINT dlq_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: dlq_jobs.dlq_jobs_file_id_fkey
ALTER TABLE dlq_jobs ADD CONSTRAINT dlq_jobs_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: dlq_jobs.dlq_jobs_vendor_agreement_id_fkey
ALTER TABLE dlq_jobs ADD CONSTRAINT dlq_jobs_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES vendor_agreements(id);
-- FOREIGN KEY: drop_location_config.drop_location_config_created_by_fkey
ALTER TABLE drop_location_config ADD CONSTRAINT drop_location_config_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: drop_location_config.drop_location_config_updated_by_fkey
ALTER TABLE drop_location_config ADD CONSTRAINT drop_location_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
-- FOREIGN KEY: encrypted_passwords.encrypted_passwords_created_by_fkey
ALTER TABLE encrypted_passwords ADD CONSTRAINT encrypted_passwords_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: file_audit_details.file_audit_details_parent_audit_id_fkey
ALTER TABLE file_audit_details ADD CONSTRAINT file_audit_details_parent_audit_id_fkey FOREIGN KEY (parent_audit_id) REFERENCES file_audit_details(id);
-- FOREIGN KEY: file_audit_details.file_audit_details_transformation_job_id_fkey
ALTER TABLE file_audit_details ADD CONSTRAINT file_audit_details_transformation_job_id_fkey FOREIGN KEY (transformation_job_id) REFERENCES transformation_jobs(id);
-- FOREIGN KEY: file_columns.file_columns_file_id_fkey
ALTER TABLE file_columns ADD CONSTRAINT file_columns_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: file_history.file_history_file_id_fkey
ALTER TABLE file_history ADD CONSTRAINT file_history_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: file_lineage.file_lineage_source_file_id_fkey
ALTER TABLE file_lineage ADD CONSTRAINT file_lineage_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES files(file_id);
-- FOREIGN KEY: file_lineage.file_lineage_target_file_id_fkey
ALTER TABLE file_lineage ADD CONSTRAINT file_lineage_target_file_id_fkey FOREIGN KEY (target_file_id) REFERENCES files(file_id);
-- FOREIGN KEY: file_ownership.fk_file_ownership_file
ALTER TABLE file_ownership ADD CONSTRAINT fk_file_ownership_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: file_ownership.fk_file_ownership_user
ALTER TABLE file_ownership ADD CONSTRAINT fk_file_ownership_user FOREIGN KEY (owner_user_id) REFERENCES users(id);
-- FOREIGN KEY: file_policy_assignments.fk_policy_assignment_policy
ALTER TABLE file_policy_assignments ADD CONSTRAINT fk_policy_assignment_policy FOREIGN KEY (policy_id) REFERENCES governance_policies(policy_id);
-- FOREIGN KEY: file_policy_assignments.fk_policy_assignment_file
ALTER TABLE file_policy_assignments ADD CONSTRAINT fk_policy_assignment_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: file_policy_assignments.fk_policy_assignment_user
ALTER TABLE file_policy_assignments ADD CONSTRAINT fk_policy_assignment_user FOREIGN KEY (assigned_by) REFERENCES users(id);
-- FOREIGN KEY: file_preview_data.fk_file_preview_file
ALTER TABLE file_preview_data ADD CONSTRAINT fk_file_preview_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: file_processing_artifacts.file_processing_artifacts_file_id_fkey
ALTER TABLE file_processing_artifacts ADD CONSTRAINT file_processing_artifacts_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: file_processing_artifacts.file_processing_artifacts_created_by_fkey
ALTER TABLE file_processing_artifacts ADD CONSTRAINT file_processing_artifacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: file_quality_rules.fk_file_quality_rules_file
ALTER TABLE file_quality_rules ADD CONSTRAINT fk_file_quality_rules_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: file_quality_rules.fk_file_quality_rules_rule
ALTER TABLE file_quality_rules ADD CONSTRAINT fk_file_quality_rules_rule FOREIGN KEY (quality_rule_id) REFERENCES quality_rules(id);
-- FOREIGN KEY: file_restorations.file_restorations_requested_by_fkey
ALTER TABLE file_restorations ADD CONSTRAINT file_restorations_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES users(id);
-- FOREIGN KEY: file_restorations.file_restorations_archived_file_id_fkey
ALTER TABLE file_restorations ADD CONSTRAINT file_restorations_archived_file_id_fkey FOREIGN KEY (archived_file_id) REFERENCES archived_files(id);
-- FOREIGN KEY: file_schedules.fk_file
ALTER TABLE file_schedules ADD CONSTRAINT fk_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: file_schedules.fk_file_schedules_project
ALTER TABLE file_schedules ADD CONSTRAINT fk_file_schedules_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: file_schedules.file_schedules_sub_project_id_fkey
ALTER TABLE file_schedules ADD CONSTRAINT file_schedules_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FOREIGN KEY: file_schemas.file_schemas_logical_file_id_fkey
ALTER TABLE file_schemas ADD CONSTRAINT file_schemas_logical_file_id_fkey FOREIGN KEY (logical_file_id) REFERENCES logical_file_groups(logical_file_id);
-- FOREIGN KEY: file_tag_assignments.fk_tag_assignment_tag
ALTER TABLE file_tag_assignments ADD CONSTRAINT fk_tag_assignment_tag FOREIGN KEY (tag_id) REFERENCES governance_tags(tag_id);
-- FOREIGN KEY: file_tag_assignments.fk_tag_assignment_file
ALTER TABLE file_tag_assignments ADD CONSTRAINT fk_tag_assignment_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: file_tag_assignments.fk_tag_assignment_user
ALTER TABLE file_tag_assignments ADD CONSTRAINT fk_tag_assignment_user FOREIGN KEY (assigned_by) REFERENCES users(id);
-- FOREIGN KEY: files.files_vendor_agreement_id_fkey
ALTER TABLE files ADD CONSTRAINT files_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES vendor_agreements(id);
-- FOREIGN KEY: files.files_parent_archive_id_fkey
ALTER TABLE files ADD CONSTRAINT files_parent_archive_id_fkey FOREIGN KEY (parent_archive_id) REFERENCES files(file_id);
-- FOREIGN KEY: files.files_sub_project_id_fkey
ALTER TABLE files ADD CONSTRAINT files_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FOREIGN KEY: files.fk_files_project
ALTER TABLE files ADD CONSTRAINT fk_files_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: files.files_logical_file_id_fkey
ALTER TABLE files ADD CONSTRAINT files_logical_file_id_fkey FOREIGN KEY (logical_file_id) REFERENCES logical_file_groups(logical_file_id);
-- FOREIGN KEY: fixed_width_schemas.fixed_width_schemas_created_by_fkey
ALTER TABLE fixed_width_schemas ADD CONSTRAINT fixed_width_schemas_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: governance_policies.fk_policy_creator
ALTER TABLE governance_policies ADD CONSTRAINT fk_policy_creator FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: governance_tags.fk_tag_creator
ALTER TABLE governance_tags ADD CONSTRAINT fk_tag_creator FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: group_policy_attachments.group_policy_attachments_attached_by_fkey
ALTER TABLE group_policy_attachments ADD CONSTRAINT group_policy_attachments_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES users(id);
-- FOREIGN KEY: group_policy_attachments.group_policy_attachments_policy_id_fkey
ALTER TABLE group_policy_attachments ADD CONSTRAINT group_policy_attachments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES rbac_policies(id);
-- FOREIGN KEY: group_policy_attachments.group_policy_attachments_group_id_fkey
ALTER TABLE group_policy_attachments ADD CONSTRAINT group_policy_attachments_group_id_fkey FOREIGN KEY (group_id) REFERENCES access_groups(id);
-- FOREIGN KEY: idempotency_keys.idempotency_keys_user_id_fkey
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: job_dependencies.job_dependencies_job_id_fkey
ALTER TABLE job_dependencies ADD CONSTRAINT job_dependencies_job_id_fkey FOREIGN KEY (job_id) REFERENCES file_schedules(id);
-- FOREIGN KEY: job_dependencies.job_dependencies_depends_on_job_id_fkey
ALTER TABLE job_dependencies ADD CONSTRAINT job_dependencies_depends_on_job_id_fkey FOREIGN KEY (depends_on_job_id) REFERENCES file_schedules(id);
-- FOREIGN KEY: job_group_dependencies.job_group_dependencies_group_id_fkey
ALTER TABLE job_group_dependencies ADD CONSTRAINT job_group_dependencies_group_id_fkey FOREIGN KEY (group_id) REFERENCES job_groups(id);
-- FOREIGN KEY: job_group_dependencies.job_group_dependencies_depends_on_group_id_fkey
ALTER TABLE job_group_dependencies ADD CONSTRAINT job_group_dependencies_depends_on_group_id_fkey FOREIGN KEY (depends_on_group_id) REFERENCES job_groups(id);
-- FOREIGN KEY: job_group_schedules.job_group_schedules_group_id_fkey
ALTER TABLE job_group_schedules ADD CONSTRAINT job_group_schedules_group_id_fkey FOREIGN KEY (group_id) REFERENCES job_groups(id);
-- FOREIGN KEY: job_group_schedules.fk_job_group_schedules_project
ALTER TABLE job_group_schedules ADD CONSTRAINT fk_job_group_schedules_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: job_history.job_history_job_id_fkey
ALTER TABLE job_history ADD CONSTRAINT job_history_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id);
-- FOREIGN KEY: job_runs.job_runs_job_id_fkey
ALTER TABLE job_runs ADD CONSTRAINT job_runs_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id);
-- FOREIGN KEY: job_schedules.fk_job_schedules_project
ALTER TABLE job_schedules ADD CONSTRAINT fk_job_schedules_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: jobs.jobs_created_by_fkey
ALTER TABLE jobs ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: lineage_views.lineage_views_project_id_fkey
ALTER TABLE lineage_views ADD CONSTRAINT lineage_views_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: lineage_views.lineage_views_user_id_fkey
ALTER TABLE lineage_views ADD CONSTRAINT lineage_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: logical_file_groups.logical_file_groups_project_id_fkey
ALTER TABLE logical_file_groups ADD CONSTRAINT logical_file_groups_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: mapping_group_executions.fk_mapping_group_executions_project
ALTER TABLE mapping_group_executions ADD CONSTRAINT fk_mapping_group_executions_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: mapping_group_executions.mapping_group_executions_group_id_fkey
ALTER TABLE mapping_group_executions ADD CONSTRAINT mapping_group_executions_group_id_fkey FOREIGN KEY (group_id) REFERENCES mapping_groups(id);
-- FOREIGN KEY: mapping_group_members.mapping_group_members_group_id_fkey
ALTER TABLE mapping_group_members ADD CONSTRAINT mapping_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES mapping_groups(id);
-- FOREIGN KEY: mapping_group_members.mapping_group_members_mapping_id_fkey
ALTER TABLE mapping_group_members ADD CONSTRAINT mapping_group_members_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES transformation_mappings(mapping_id);
-- FOREIGN KEY: mapping_groups.fk_mapping_groups_project
ALTER TABLE mapping_groups ADD CONSTRAINT fk_mapping_groups_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: mapping_groups.mapping_groups_sub_project_id_fkey
ALTER TABLE mapping_groups ADD CONSTRAINT mapping_groups_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FOREIGN KEY: n_step_workflow_assets.n_step_workflow_assets_step_id_fkey
ALTER TABLE n_step_workflow_assets ADD CONSTRAINT n_step_workflow_assets_step_id_fkey FOREIGN KEY (step_id) REFERENCES n_step_workflow_steps(id);
-- FOREIGN KEY: n_step_workflow_run_steps.n_step_workflow_run_steps_run_id_fkey
ALTER TABLE n_step_workflow_run_steps ADD CONSTRAINT n_step_workflow_run_steps_run_id_fkey FOREIGN KEY (run_id) REFERENCES n_step_workflow_runs(id);
-- FOREIGN KEY: n_step_workflow_runs.n_step_workflow_runs_triggered_by_fkey
ALTER TABLE n_step_workflow_runs ADD CONSTRAINT n_step_workflow_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES users(id);
-- FOREIGN KEY: n_step_workflow_runs.n_step_workflow_runs_workflow_id_fkey
ALTER TABLE n_step_workflow_runs ADD CONSTRAINT n_step_workflow_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES n_step_workflows(id);
-- FOREIGN KEY: n_step_workflow_steps.n_step_workflow_steps_workflow_id_fkey
ALTER TABLE n_step_workflow_steps ADD CONSTRAINT n_step_workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES n_step_workflows(id);
-- FOREIGN KEY: n_step_workflows.fk_n_step_workflows_project
ALTER TABLE n_step_workflows ADD CONSTRAINT fk_n_step_workflows_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: n_step_workflows.n_step_workflows_sub_project_id_fkey
ALTER TABLE n_step_workflows ADD CONSTRAINT n_step_workflows_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FOREIGN KEY: n_step_workflows.n_step_workflows_created_by_fkey
ALTER TABLE n_step_workflows ADD CONSTRAINT n_step_workflows_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: notifications.notifications_user_id_fkey
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: password_reset_requests.password_reset_requests_user_id_fkey
ALTER TABLE password_reset_requests ADD CONSTRAINT password_reset_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: password_reset_requests.password_reset_requests_approved_by_fkey
ALTER TABLE password_reset_requests ADD CONSTRAINT password_reset_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id);
-- FOREIGN KEY: processing_events.processing_events_file_id_fkey
ALTER TABLE processing_events ADD CONSTRAINT processing_events_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: project_access_groups.project_access_groups_project_id_fkey
ALTER TABLE project_access_groups ADD CONSTRAINT project_access_groups_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: project_access_groups.project_access_groups_group_id_fkey
ALTER TABLE project_access_groups ADD CONSTRAINT project_access_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES access_groups(id);
-- FOREIGN KEY: project_access_groups.project_access_groups_added_by_fkey
ALTER TABLE project_access_groups ADD CONSTRAINT project_access_groups_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id);
-- FOREIGN KEY: project_members.project_members_user_id_fkey
ALTER TABLE project_members ADD CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: project_members.project_members_invited_by_fkey
ALTER TABLE project_members ADD CONSTRAINT project_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES users(id);
-- FOREIGN KEY: project_members.project_members_project_id_fkey
ALTER TABLE project_members ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: projects.projects_parent_id_fkey
ALTER TABLE projects ADD CONSTRAINT projects_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES projects(id);
-- FOREIGN KEY: projects.projects_owner_id_fkey
ALTER TABLE projects ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id);
-- FOREIGN KEY: quality_reports.quality_reports_file_id_fkey
ALTER TABLE quality_reports ADD CONSTRAINT quality_reports_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: quality_rule_configurations.quality_rule_configurations_created_by_fkey
ALTER TABLE quality_rule_configurations ADD CONSTRAINT quality_rule_configurations_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: quality_rule_configurations.quality_rule_configurations_rule_id_fkey
ALTER TABLE quality_rule_configurations ADD CONSTRAINT quality_rule_configurations_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES quality_rules(id);
-- FOREIGN KEY: quality_rule_violations.quality_rule_violations_rule_id_fkey
ALTER TABLE quality_rule_violations ADD CONSTRAINT quality_rule_violations_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES quality_rules(id);
-- FOREIGN KEY: quality_rule_violations.quality_rule_violations_resolved_by_fkey
ALTER TABLE quality_rule_violations ADD CONSTRAINT quality_rule_violations_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id);
-- FOREIGN KEY: quality_rules.quality_rules_created_by_fkey
ALTER TABLE quality_rules ADD CONSTRAINT quality_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: quality_rules.quality_rules_sub_project_id_fkey
ALTER TABLE quality_rules ADD CONSTRAINT quality_rules_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FOREIGN KEY: rbac_policies.rbac_policies_project_id_fkey
ALTER TABLE rbac_policies ADD CONSTRAINT rbac_policies_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: rbac_policies.rbac_policies_created_by_fkey
ALTER TABLE rbac_policies ADD CONSTRAINT rbac_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: refresh_tokens.refresh_tokens_user_id_fkey
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: resource_attributes.resource_attributes_created_by_fkey
ALTER TABLE resource_attributes ADD CONSTRAINT resource_attributes_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: resource_policy_attachments.resource_policy_attachments_attached_by_fkey
ALTER TABLE resource_policy_attachments ADD CONSTRAINT resource_policy_attachments_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES users(id);
-- FOREIGN KEY: resource_policy_attachments.resource_policy_attachments_policy_id_fkey
ALTER TABLE resource_policy_attachments ADD CONSTRAINT resource_policy_attachments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES rbac_policies(id);
-- FOREIGN KEY: retention_policies.retention_policies_created_by_fkey
ALTER TABLE retention_policies ADD CONSTRAINT retention_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: retention_policy_runs.retention_policy_runs_executed_by_fkey
ALTER TABLE retention_policy_runs ADD CONSTRAINT retention_policy_runs_executed_by_fkey FOREIGN KEY (executed_by) REFERENCES users(id);
-- FOREIGN KEY: retention_policy_runs.retention_policy_runs_policy_id_fkey
ALTER TABLE retention_policy_runs ADD CONSTRAINT retention_policy_runs_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES retention_policies(id);
-- FOREIGN KEY: role_permissions.role_permissions_permission_id_fkey
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES permissions(id);
-- FOREIGN KEY: role_permissions.role_permissions_role_id_fkey
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id);
-- FOREIGN KEY: schedules.fk_schedules_project
ALTER TABLE schedules ADD CONSTRAINT fk_schedules_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: schedules.schedules_sub_project_id_fkey
ALTER TABLE schedules ADD CONSTRAINT schedules_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FOREIGN KEY: schema_validation_job_files.schema_validation_job_files_job_id_fkey
ALTER TABLE schema_validation_job_files ADD CONSTRAINT schema_validation_job_files_job_id_fkey FOREIGN KEY (job_id) REFERENCES schema_validation_jobs(id);
-- FOREIGN KEY: schema_validation_jobs.schema_validation_jobs_created_by_fkey
ALTER TABLE schema_validation_jobs ADD CONSTRAINT schema_validation_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: schema_validation_jobs.schema_validation_jobs_vendor_agreement_id_fkey
ALTER TABLE schema_validation_jobs ADD CONSTRAINT schema_validation_jobs_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES vendor_agreements(id);
-- FOREIGN KEY: schema_validation_jobs.schema_validation_jobs_project_id_fkey
ALTER TABLE schema_validation_jobs ADD CONSTRAINT schema_validation_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: scim_resource_mappings.scim_resource_mappings_config_id_fkey
ALTER TABLE scim_resource_mappings ADD CONSTRAINT scim_resource_mappings_config_id_fkey FOREIGN KEY (config_id) REFERENCES scim_configurations(id);
-- FOREIGN KEY: scim_sync_logs.scim_sync_logs_config_id_fkey
ALTER TABLE scim_sync_logs ADD CONSTRAINT scim_sync_logs_config_id_fkey FOREIGN KEY (config_id) REFERENCES scim_configurations(id);
-- FOREIGN KEY: storage_connections.storage_connections_deleted_by_fkey
ALTER TABLE storage_connections ADD CONSTRAINT storage_connections_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
-- FOREIGN KEY: storage_connections.fk_storage_connections_project
ALTER TABLE storage_connections ADD CONSTRAINT fk_storage_connections_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: sub_project_access_groups.sub_project_access_groups_group_id_fkey
ALTER TABLE sub_project_access_groups ADD CONSTRAINT sub_project_access_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES access_groups(id);
-- FOREIGN KEY: sub_project_access_groups.sub_project_access_groups_sub_project_id_fkey
ALTER TABLE sub_project_access_groups ADD CONSTRAINT sub_project_access_groups_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FOREIGN KEY: sub_project_members.sub_project_members_sub_project_id_fkey
ALTER TABLE sub_project_members ADD CONSTRAINT sub_project_members_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FOREIGN KEY: sub_project_members.sub_project_members_user_id_fkey
ALTER TABLE sub_project_members ADD CONSTRAINT sub_project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: tag_permissions.fk_tag_permission_role
ALTER TABLE tag_permissions ADD CONSTRAINT fk_tag_permission_role FOREIGN KEY (role_id) REFERENCES roles(id);
-- FOREIGN KEY: tag_permissions.fk_tag_permission_tag
ALTER TABLE tag_permissions ADD CONSTRAINT fk_tag_permission_tag FOREIGN KEY (tag_id) REFERENCES governance_tags(tag_id);
-- FOREIGN KEY: transform_connections.fk_transform_connections_project
ALTER TABLE transform_connections ADD CONSTRAINT fk_transform_connections_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: transformation_jobs.transformation_jobs_visual_workflow_execution_id_fkey
ALTER TABLE transformation_jobs ADD CONSTRAINT transformation_jobs_visual_workflow_execution_id_fkey FOREIGN KEY (visual_workflow_execution_id) REFERENCES visual_workflow_executions(id);
-- FOREIGN KEY: transformation_jobs.transformation_jobs_mapping_id_fkey
ALTER TABLE transformation_jobs ADD CONSTRAINT transformation_jobs_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES transformation_mappings(mapping_id);
-- FOREIGN KEY: transformation_jobs.fk_transformation_jobs_project
ALTER TABLE transformation_jobs ADD CONSTRAINT fk_transformation_jobs_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: transformation_jobs.transformation_jobs_mapping_group_execution_id_fkey
ALTER TABLE transformation_jobs ADD CONSTRAINT transformation_jobs_mapping_group_execution_id_fkey FOREIGN KEY (mapping_group_execution_id) REFERENCES mapping_group_executions(id);
-- FOREIGN KEY: transformation_jobs.transformation_jobs_workflow_execution_id_fkey
ALTER TABLE transformation_jobs ADD CONSTRAINT transformation_jobs_workflow_execution_id_fkey FOREIGN KEY (workflow_execution_id) REFERENCES n_step_workflow_runs(id);
-- FOREIGN KEY: transformation_logs.transformation_logs_job_id_fkey
ALTER TABLE transformation_logs ADD CONSTRAINT transformation_logs_job_id_fkey FOREIGN KEY (job_id) REFERENCES transformation_jobs(job_id);
-- FOREIGN KEY: transformation_mappings.transformation_mappings_vendor_agreement_file_schema_id_fkey
ALTER TABLE transformation_mappings ADD CONSTRAINT transformation_mappings_vendor_agreement_file_schema_id_fkey FOREIGN KEY (vendor_agreement_file_schema_id) REFERENCES vendor_agreement_file_schemas(id);
-- FOREIGN KEY: transformation_mappings.fk_transformation_mappings_project
ALTER TABLE transformation_mappings ADD CONSTRAINT fk_transformation_mappings_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: transformation_mappings.transformation_mappings_sub_project_id_fkey
ALTER TABLE transformation_mappings ADD CONSTRAINT transformation_mappings_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FOREIGN KEY: transformation_mappings.transformation_mappings_vendor_agreement_id_fkey
ALTER TABLE transformation_mappings ADD CONSTRAINT transformation_mappings_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES vendor_agreements(id);
-- FOREIGN KEY: transformation_mappings.transformation_mappings_visual_mapping_id_fkey
ALTER TABLE transformation_mappings ADD CONSTRAINT transformation_mappings_visual_mapping_id_fkey FOREIGN KEY (visual_mapping_id) REFERENCES visual_mapping_defs(id);
-- FOREIGN KEY: transformation_quality_rules.fk_transformation_quality_rules_mapping
ALTER TABLE transformation_quality_rules ADD CONSTRAINT fk_transformation_quality_rules_mapping FOREIGN KEY (mapping_id) REFERENCES transformation_mappings(mapping_id);
-- FOREIGN KEY: transformation_quality_rules.fk_transformation_quality_rules_rule
ALTER TABLE transformation_quality_rules ADD CONSTRAINT fk_transformation_quality_rules_rule FOREIGN KEY (quality_rule_id) REFERENCES quality_rules(id);
-- FOREIGN KEY: upload_batches.upload_batches_project_id_fkey
ALTER TABLE upload_batches ADD CONSTRAINT upload_batches_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: upload_batches.upload_batches_user_id_fkey
ALTER TABLE upload_batches ADD CONSTRAINT upload_batches_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: upload_batches.upload_batches_api_token_id_fkey
ALTER TABLE upload_batches ADD CONSTRAINT upload_batches_api_token_id_fkey FOREIGN KEY (api_token_id) REFERENCES api_tokens(id);
-- FOREIGN KEY: upload_file_records.upload_file_records_upload_file_id_fkey
ALTER TABLE upload_file_records ADD CONSTRAINT upload_file_records_upload_file_id_fkey FOREIGN KEY (upload_file_id) REFERENCES upload_files(id);
-- FOREIGN KEY: upload_files.upload_files_batch_id_fkey
ALTER TABLE upload_files ADD CONSTRAINT upload_files_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES upload_batches(id);
-- FOREIGN KEY: user_attributes.user_attributes_user_id_fkey
ALTER TABLE user_attributes ADD CONSTRAINT user_attributes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: user_attributes.user_attributes_created_by_fkey
ALTER TABLE user_attributes ADD CONSTRAINT user_attributes_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: user_badges.user_badges_file_id_fkey
ALTER TABLE user_badges ADD CONSTRAINT user_badges_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: user_groups.user_groups_user_id_fkey
ALTER TABLE user_groups ADD CONSTRAINT user_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: user_groups.user_groups_group_id_fkey
ALTER TABLE user_groups ADD CONSTRAINT user_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES access_groups(id);
-- FOREIGN KEY: user_policy_attachments.user_policy_attachments_attached_by_fkey
ALTER TABLE user_policy_attachments ADD CONSTRAINT user_policy_attachments_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES users(id);
-- FOREIGN KEY: user_policy_attachments.user_policy_attachments_user_id_fkey
ALTER TABLE user_policy_attachments ADD CONSTRAINT user_policy_attachments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: user_policy_attachments.user_policy_attachments_policy_id_fkey
ALTER TABLE user_policy_attachments ADD CONSTRAINT user_policy_attachments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES rbac_policies(id);
-- FOREIGN KEY: user_roles.user_roles_user_id_fkey
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: user_roles.user_roles_role_id_fkey
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id);
-- FOREIGN KEY: user_sessions.user_sessions_user_id_fkey
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FOREIGN KEY: users.users_vendor_id_fkey
ALTER TABLE users ADD CONSTRAINT users_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
-- FOREIGN KEY: vendor_agreement_approvals.vendor_agreement_approvals_approver_user_id_fkey
ALTER TABLE vendor_agreement_approvals ADD CONSTRAINT vendor_agreement_approvals_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES users(id);
-- FOREIGN KEY: vendor_agreement_approvals.vendor_agreement_approvals_agreement_id_fkey
ALTER TABLE vendor_agreement_approvals ADD CONSTRAINT vendor_agreement_approvals_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES vendor_agreements(id);
-- FOREIGN KEY: vendor_agreement_changes.vendor_agreement_changes_changed_by_fkey
ALTER TABLE vendor_agreement_changes ADD CONSTRAINT vendor_agreement_changes_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id);
-- FOREIGN KEY: vendor_agreement_changes.vendor_agreement_changes_agreement_id_fkey
ALTER TABLE vendor_agreement_changes ADD CONSTRAINT vendor_agreement_changes_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES vendor_agreements(id);
-- FOREIGN KEY: vendor_agreement_documents.vendor_agreement_documents_uploaded_by_fkey
ALTER TABLE vendor_agreement_documents ADD CONSTRAINT vendor_agreement_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id);
-- FOREIGN KEY: vendor_agreement_documents.vendor_agreement_documents_approval_id_fkey
ALTER TABLE vendor_agreement_documents ADD CONSTRAINT vendor_agreement_documents_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES vendor_agreement_approvals(id);
-- FOREIGN KEY: vendor_agreement_documents.vendor_agreement_documents_agreement_id_fkey
ALTER TABLE vendor_agreement_documents ADD CONSTRAINT vendor_agreement_documents_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES vendor_agreements(id);
-- FOREIGN KEY: vendor_agreement_file_schemas.vendor_agreement_file_schemas_vendor_agreement_id_fkey
ALTER TABLE vendor_agreement_file_schemas ADD CONSTRAINT vendor_agreement_file_schemas_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES vendor_agreements(id);
-- FOREIGN KEY: vendor_agreement_file_schemas.vendor_agreement_file_schemas_created_by_fkey
ALTER TABLE vendor_agreement_file_schemas ADD CONSTRAINT vendor_agreement_file_schemas_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: vendor_agreement_file_schemas.vendor_agreement_file_schemas_updated_by_fkey
ALTER TABLE vendor_agreement_file_schemas ADD CONSTRAINT vendor_agreement_file_schemas_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
-- FOREIGN KEY: vendor_agreements.vendor_agreements_created_by_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: vendor_agreements.vendor_agreements_vendor_id_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
-- FOREIGN KEY: vendor_agreements.vendor_agreements_vendor_connection_id_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_vendor_connection_id_fkey FOREIGN KEY (vendor_connection_id) REFERENCES storage_connections(connection_id);
-- FOREIGN KEY: vendor_agreements.vendor_agreements_vendor_approved_by_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_vendor_approved_by_fkey FOREIGN KEY (vendor_approved_by) REFERENCES users(id);
-- FOREIGN KEY: vendor_agreements.vendor_agreements_updated_by_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
-- FOREIGN KEY: vendor_agreements.vendor_agreements_sub_project_id_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FOREIGN KEY: vendor_agreements.vendor_agreements_project_id_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: vendor_agreements.vendor_agreements_owner_approved_by_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_owner_approved_by_fkey FOREIGN KEY (owner_approved_by) REFERENCES users(id);
-- FOREIGN KEY: vendor_agreements.vendor_agreements_governance_manager_user_id_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_governance_manager_user_id_fkey FOREIGN KEY (governance_manager_user_id) REFERENCES users(id);
-- FOREIGN KEY: vendor_agreements.vendor_agreements_governance_approved_by_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_governance_approved_by_fkey FOREIGN KEY (governance_approved_by) REFERENCES users(id);
-- FOREIGN KEY: vendor_agreements.vendor_agreements_file_owner_user_id_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_file_owner_user_id_fkey FOREIGN KEY (file_owner_user_id) REFERENCES users(id);
-- FOREIGN KEY: vendor_file_profiling_results.vendor_file_profiling_results_connection_id_fkey
ALTER TABLE vendor_file_profiling_results ADD CONSTRAINT vendor_file_profiling_results_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES storage_connections(connection_id);
-- FOREIGN KEY: vendor_file_profiling_results.vendor_file_profiling_results_file_id_fkey
ALTER TABLE vendor_file_profiling_results ADD CONSTRAINT vendor_file_profiling_results_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FOREIGN KEY: vendor_file_profiling_results.vendor_file_profiling_results_uploaded_by_user_id_fkey
ALTER TABLE vendor_file_profiling_results ADD CONSTRAINT vendor_file_profiling_results_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id);
-- FOREIGN KEY: vendor_file_profiling_results.vendor_file_profiling_results_vendor_id_fkey
ALTER TABLE vendor_file_profiling_results ADD CONSTRAINT vendor_file_profiling_results_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
-- FOREIGN KEY: vendor_sla_violations.vendor_sla_violations_agreement_id_fkey
ALTER TABLE vendor_sla_violations ADD CONSTRAINT vendor_sla_violations_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES vendor_agreements(id);
-- FOREIGN KEY: vendor_users.vendor_users_vendor_id_fkey
ALTER TABLE vendor_users ADD CONSTRAINT vendor_users_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
-- FOREIGN KEY: vendor_users.vendor_users_updated_by_fkey
ALTER TABLE vendor_users ADD CONSTRAINT vendor_users_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
-- FOREIGN KEY: vendor_users.vendor_users_created_by_fkey
ALTER TABLE vendor_users ADD CONSTRAINT vendor_users_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: vendors.vendors_project_id_fkey
ALTER TABLE vendors ADD CONSTRAINT vendors_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: vendors.vendors_updated_by_fkey
ALTER TABLE vendors ADD CONSTRAINT vendors_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
-- FOREIGN KEY: vendors.vendors_vendor_user_id_fkey
ALTER TABLE vendors ADD CONSTRAINT vendors_vendor_user_id_fkey FOREIGN KEY (vendor_user_id) REFERENCES users(id);
-- FOREIGN KEY: vendors.vendors_created_by_fkey
ALTER TABLE vendors ADD CONSTRAINT vendors_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: visual_lineage_graphs.visual_lineage_graphs_created_by_fkey
ALTER TABLE visual_lineage_graphs ADD CONSTRAINT visual_lineage_graphs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: visual_lineage_graphs.visual_lineage_graphs_project_id_fkey
ALTER TABLE visual_lineage_graphs ADD CONSTRAINT visual_lineage_graphs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: visual_mapping_defs.visual_mapping_defs_project_id_fkey
ALTER TABLE visual_mapping_defs ADD CONSTRAINT visual_mapping_defs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: visual_mapping_defs.visual_mapping_defs_created_by_fkey
ALTER TABLE visual_mapping_defs ADD CONSTRAINT visual_mapping_defs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: visual_mapping_edges.visual_mapping_edges_mapping_id_fkey
ALTER TABLE visual_mapping_edges ADD CONSTRAINT visual_mapping_edges_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES visual_mapping_defs(id);
-- FOREIGN KEY: visual_mapping_execution_logs.visual_mapping_execution_logs_mapping_id_fkey
ALTER TABLE visual_mapping_execution_logs ADD CONSTRAINT visual_mapping_execution_logs_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES visual_mapping_defs(id);
-- FOREIGN KEY: visual_mapping_executions.visual_mapping_executions_triggered_by_fkey
ALTER TABLE visual_mapping_executions ADD CONSTRAINT visual_mapping_executions_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES users(id);
-- FOREIGN KEY: visual_mapping_executions.visual_mapping_executions_transformation_id_fkey
ALTER TABLE visual_mapping_executions ADD CONSTRAINT visual_mapping_executions_transformation_id_fkey FOREIGN KEY (transformation_id) REFERENCES transformation_mappings(id);
-- FOREIGN KEY: visual_mapping_executions.visual_mapping_executions_mapping_id_fkey
ALTER TABLE visual_mapping_executions ADD CONSTRAINT visual_mapping_executions_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES visual_mapping_defs(id);
-- FOREIGN KEY: visual_mapping_nodes.visual_mapping_nodes_mapping_id_fkey
ALTER TABLE visual_mapping_nodes ADD CONSTRAINT visual_mapping_nodes_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES visual_mapping_defs(id);
-- FOREIGN KEY: visual_workflow_execution_logs.visual_workflow_execution_logs_workflow_id_fkey
ALTER TABLE visual_workflow_execution_logs ADD CONSTRAINT visual_workflow_execution_logs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES visual_workflows(id);
-- FOREIGN KEY: visual_workflow_executions.visual_workflow_executions_project_id_fkey
ALTER TABLE visual_workflow_executions ADD CONSTRAINT visual_workflow_executions_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: visual_workflow_executions.visual_workflow_executions_workflow_id_fkey
ALTER TABLE visual_workflow_executions ADD CONSTRAINT visual_workflow_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES visual_workflows(id);
-- FOREIGN KEY: visual_workflow_executions.visual_workflow_executions_triggered_by_fkey
ALTER TABLE visual_workflow_executions ADD CONSTRAINT visual_workflow_executions_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES users(id);
-- FOREIGN KEY: visual_workflows.visual_workflows_created_by_fkey
ALTER TABLE visual_workflows ADD CONSTRAINT visual_workflows_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FOREIGN KEY: visual_workflows.visual_workflows_sub_project_id_fkey
ALTER TABLE visual_workflows ADD CONSTRAINT visual_workflows_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FOREIGN KEY: visual_workflows.visual_workflows_project_id_fkey
ALTER TABLE visual_workflows ADD CONSTRAINT visual_workflows_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: workflow_executions.workflow_executions_workflow_id_fkey
ALTER TABLE workflow_executions ADD CONSTRAINT workflow_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES business_processes(id);
-- FOREIGN KEY: workflow_executions.workflow_executions_current_step_id_fkey
ALTER TABLE workflow_executions ADD CONSTRAINT workflow_executions_current_step_id_fkey FOREIGN KEY (current_step_id) REFERENCES workflow_steps(id);
-- FOREIGN KEY: workflow_executions.fk_workflow_executions_project
ALTER TABLE workflow_executions ADD CONSTRAINT fk_workflow_executions_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: workflow_steps.workflow_steps_workflow_id_fkey
ALTER TABLE workflow_steps ADD CONSTRAINT workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES business_processes(id);
-- FOREIGN KEY: workflow_steps.fk_workflow_steps_project
ALTER TABLE workflow_steps ADD CONSTRAINT fk_workflow_steps_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FOREIGN KEY: workflow_steps.workflow_steps_depends_on_fkey
ALTER TABLE workflow_steps ADD CONSTRAINT workflow_steps_depends_on_fkey FOREIGN KEY (depends_on) REFERENCES workflow_steps(id);

-- =====================================================
-- SECTION 5: INDEXES
-- =====================================================

-- INDEX: idx_access_group_members_group
CREATE INDEX idx_access_group_members_group ON public.access_group_members USING btree (group_id);
-- INDEX: idx_access_group_members_source
CREATE INDEX idx_access_group_members_source ON public.access_group_members USING btree (source);
-- INDEX: idx_access_group_members_user
CREATE INDEX idx_access_group_members_user ON public.access_group_members USING btree (user_id);
-- INDEX: idx_access_group_roles_global_unique
CREATE UNIQUE INDEX idx_access_group_roles_global_unique ON public.access_group_roles USING btree (group_id, role_id) WHERE (project_id IS NULL);
-- INDEX: idx_access_group_roles_group
CREATE INDEX idx_access_group_roles_group ON public.access_group_roles USING btree (group_id);
-- INDEX: idx_access_group_roles_project
CREATE INDEX idx_access_group_roles_project ON public.access_group_roles USING btree (project_id) WHERE (project_id IS NOT NULL);
-- INDEX: idx_access_group_roles_project_unique
CREATE UNIQUE INDEX idx_access_group_roles_project_unique ON public.access_group_roles USING btree (group_id, role_id, project_id) WHERE (project_id IS NOT NULL);
-- INDEX: idx_access_group_roles_role
CREATE INDEX idx_access_group_roles_role ON public.access_group_roles USING btree (role_id);
-- INDEX: idx_access_groups_external_id
CREATE INDEX idx_access_groups_external_id ON public.access_groups USING btree (external_group_id) WHERE (external_group_id IS NOT NULL);
-- INDEX: idx_access_groups_idp_source
CREATE INDEX idx_access_groups_idp_source ON public.access_groups USING btree (idp_source) WHERE (idp_source IS NOT NULL);
-- INDEX: idx_access_groups_sync_enabled
CREATE INDEX idx_access_groups_sync_enabled ON public.access_groups USING btree (sync_enabled) WHERE (sync_enabled = true);
-- INDEX: idx_access_groups_type
CREATE INDEX idx_access_groups_type ON public.access_groups USING btree (group_type);
-- INDEX: unique_external_group
CREATE UNIQUE INDEX unique_external_group ON public.access_groups USING btree (idp_source, external_group_id);
-- INDEX: unique_group_name
CREATE UNIQUE INDEX unique_group_name ON public.access_groups USING btree (name);
-- INDEX: idx_alert_aggregation_policy_id
CREATE INDEX idx_alert_aggregation_policy_id ON public.alert_aggregation USING btree (policy_id);
-- INDEX: idx_alert_aggregation_ttl
CREATE INDEX idx_alert_aggregation_ttl ON public.alert_aggregation USING btree (aggregation_ttl);
-- INDEX: idx_alert_attachments_run_id
CREATE INDEX idx_alert_attachments_run_id ON public.alert_attachments USING btree (run_id);
-- INDEX: idx_alert_events_run_id
CREATE INDEX idx_alert_events_run_id ON public.alert_events USING btree (run_id);
-- INDEX: idx_alert_events_vendor_sla
CREATE INDEX idx_alert_events_vendor_sla ON public.alert_events USING btree (vendor_sla_violation_id) WHERE (vendor_sla_violation_id IS NOT NULL);
-- INDEX: idx_alert_policies_entity
CREATE INDEX idx_alert_policies_entity ON public.alert_policies USING btree (entity_type, entity_id);
-- INDEX: idx_alert_policies_project_id
CREATE INDEX idx_alert_policies_project_id ON public.alert_policies USING btree (project_id);
-- INDEX: idx_alert_policies_vendor_sla
CREATE INDEX idx_alert_policies_vendor_sla ON public.alert_policies USING btree (entity_type, entity_id) WHERE (((entity_type)::text = 'vendor_sla'::text) AND (enabled = true));
-- INDEX: idx_alert_policy_recipients_policy_id
CREATE INDEX idx_alert_policy_recipients_policy_id ON public.alert_policy_recipients USING btree (policy_id);
-- INDEX: idx_alert_runs_policy_id
CREATE INDEX idx_alert_runs_policy_id ON public.alert_runs USING btree (policy_id);
-- INDEX: allowed_email_domains_domain_key
CREATE UNIQUE INDEX allowed_email_domains_domain_key ON public.allowed_email_domains USING btree (domain);
-- INDEX: idx_allowed_email_domains_domain
CREATE INDEX idx_allowed_email_domains_domain ON public.allowed_email_domains USING btree (domain) WHERE (is_active = true);
-- INDEX: anomalies_anomaly_id_key
CREATE UNIQUE INDEX anomalies_anomaly_id_key ON public.anomalies USING btree (anomaly_id);
-- INDEX: idx_anomalies_detected
CREATE INDEX idx_anomalies_detected ON public.anomalies USING btree (detected_at DESC);
-- INDEX: idx_anomalies_file
CREATE INDEX idx_anomalies_file ON public.anomalies USING btree (file_id);
-- INDEX: idx_anomalies_job
CREATE INDEX idx_anomalies_job ON public.anomalies USING btree (job_id);
-- INDEX: idx_anomalies_mapping
CREATE INDEX idx_anomalies_mapping ON public.anomalies USING btree (mapping_id);
-- INDEX: idx_anomalies_severity_detected
CREATE INDEX idx_anomalies_severity_detected ON public.anomalies USING btree (severity, detected_at DESC);
-- INDEX: idx_anomalies_status
CREATE INDEX idx_anomalies_status ON public.anomalies USING btree (status);
-- INDEX: idx_anomalies_type
CREATE INDEX idx_anomalies_type ON public.anomalies USING btree (anomaly_type);
-- INDEX: idx_anomalies_type_detected
CREATE INDEX idx_anomalies_type_detected ON public.anomalies USING btree (anomaly_type, detected_at DESC);
-- INDEX: api_tokens_token_hash_key
CREATE UNIQUE INDEX api_tokens_token_hash_key ON public.api_tokens USING btree (token_hash);
-- INDEX: idx_api_tokens_active
CREATE INDEX idx_api_tokens_active ON public.api_tokens USING btree (is_active, expires_at);
-- INDEX: idx_api_tokens_token_hash
CREATE INDEX idx_api_tokens_token_hash ON public.api_tokens USING btree (token_hash);
-- INDEX: idx_api_tokens_user_project
CREATE INDEX idx_api_tokens_user_project ON public.api_tokens USING btree (user_id, project_id);
-- INDEX: app_settings_setting_key_key
CREATE UNIQUE INDEX app_settings_setting_key_key ON public.app_settings USING btree (setting_key);
-- INDEX: idx_app_settings_key
CREATE INDEX idx_app_settings_key ON public.app_settings USING btree (setting_key);
-- INDEX: idx_archive_extractions_failed
CREATE INDEX idx_archive_extractions_failed ON public.archive_extractions USING btree (extraction_status, password_required) WHERE ((extraction_status)::text = ANY ((ARRAY['failed'::character varying, 'password_required'::character varying])::text[]));
-- INDEX: idx_archive_extractions_file_id
CREATE INDEX idx_archive_extractions_file_id ON public.archive_extractions USING btree (file_id);
-- INDEX: idx_archive_extractions_status
CREATE INDEX idx_archive_extractions_status ON public.archive_extractions USING btree (extraction_status);
-- INDEX: idx_archive_members_extracted
CREATE INDEX idx_archive_members_extracted ON public.archive_members USING btree (extracted_file_id);
-- INDEX: idx_archive_members_parent
CREATE INDEX idx_archive_members_parent ON public.archive_members USING btree (parent_file_id);
-- INDEX: idx_archive_members_status
CREATE INDEX idx_archive_members_status ON public.archive_members USING btree (extraction_status);
-- INDEX: unique_archive_member
CREATE UNIQUE INDEX unique_archive_member ON public.archive_members USING btree (parent_file_id, logical_name);
-- INDEX: idx_archived_files_archived_at
CREATE INDEX idx_archived_files_archived_at ON public.archived_files USING btree (archived_at);
-- INDEX: idx_archived_files_file_id
CREATE INDEX idx_archived_files_file_id ON public.archived_files USING btree (file_id);
-- INDEX: idx_archived_files_policy_id
CREATE INDEX idx_archived_files_policy_id ON public.archived_files USING btree (policy_id);
-- INDEX: idx_archived_files_restored
CREATE INDEX idx_archived_files_restored ON public.archived_files USING btree (is_restored);
-- INDEX: idx_archived_files_storage_type
CREATE INDEX idx_archived_files_storage_type ON public.archived_files USING btree (archive_storage_type);
-- INDEX: attribute_definitions_attribute_key_key
CREATE UNIQUE INDEX attribute_definitions_attribute_key_key ON public.attribute_definitions USING btree (attribute_key);
-- INDEX: idx_attribute_definitions_scope
CREATE INDEX idx_attribute_definitions_scope ON public.attribute_definitions USING btree (scope);
-- INDEX: idx_attribute_definitions_system
CREATE INDEX idx_attribute_definitions_system ON public.attribute_definitions USING btree (is_system);
-- INDEX: audit_ledger_entry_id_key
CREATE UNIQUE INDEX audit_ledger_entry_id_key ON public.audit_ledger USING btree (entry_id);
-- INDEX: idx_audit_ledger_action
CREATE INDEX idx_audit_ledger_action ON public.audit_ledger USING btree (action_type, event_timestamp DESC);
-- INDEX: idx_audit_ledger_actor
CREATE INDEX idx_audit_ledger_actor ON public.audit_ledger USING btree (actor_id, event_timestamp DESC);
-- INDEX: idx_audit_ledger_correlation
CREATE INDEX idx_audit_ledger_correlation ON public.audit_ledger USING btree (correlation_id, sequence_number);
-- INDEX: idx_audit_ledger_entity
CREATE INDEX idx_audit_ledger_entity ON public.audit_ledger USING btree (entity_type, entity_id);
-- INDEX: idx_audit_ledger_job
CREATE INDEX idx_audit_ledger_job ON public.audit_ledger USING btree (job_id, sequence_number);
-- INDEX: idx_audit_ledger_level
CREATE INDEX idx_audit_ledger_level ON public.audit_ledger USING btree (log_level, event_timestamp DESC);
-- INDEX: idx_audit_ledger_tenant_seq
CREATE INDEX idx_audit_ledger_tenant_seq ON public.audit_ledger USING btree (tenant_id, sequence_number DESC);
-- INDEX: idx_audit_ledger_timestamp
CREATE INDEX idx_audit_ledger_timestamp ON public.audit_ledger USING btree (event_timestamp DESC);
-- INDEX: idx_audit_log_action
CREATE INDEX idx_audit_log_action ON public.audit_log USING btree (action_type, "timestamp" DESC);
-- INDEX: idx_audit_log_entity
CREATE INDEX idx_audit_log_entity ON public.audit_log USING btree (entity_type, entity_id);
-- INDEX: idx_audit_log_entity_action_time
CREATE INDEX idx_audit_log_entity_action_time ON public.audit_log USING btree (entity_type, action_type, "timestamp" DESC);
-- INDEX: idx_audit_log_request
CREATE INDEX idx_audit_log_request ON public.audit_log USING btree (request_id);
-- INDEX: idx_audit_log_timestamp
CREATE INDEX idx_audit_log_timestamp ON public.audit_log USING btree ("timestamp" DESC);
-- INDEX: idx_audit_log_user
CREATE INDEX idx_audit_log_user ON public.audit_log USING btree (user_id, "timestamp" DESC);
-- INDEX: idx_audit_log_user_entity_time
CREATE INDEX idx_audit_log_user_entity_time ON public.audit_log USING btree (user_id, entity_type, "timestamp" DESC);
-- INDEX: idx_audit_log_archive_archived
CREATE INDEX idx_audit_log_archive_archived ON public.audit_log_archive USING btree (archived_at DESC);
-- INDEX: idx_audit_log_archive_timestamp
CREATE INDEX idx_audit_log_archive_timestamp ON public.audit_log_archive USING btree ("timestamp" DESC);
-- INDEX: idx_audit_log_archive_user
CREATE INDEX idx_audit_log_archive_user ON public.audit_log_archive USING btree (user_id, "timestamp" DESC);
-- INDEX: idx_bulk_profiling_files_job_id
CREATE INDEX idx_bulk_profiling_files_job_id ON public.bulk_profiling_files USING btree (job_id);
-- INDEX: idx_bulk_profiling_files_status
CREATE INDEX idx_bulk_profiling_files_status ON public.bulk_profiling_files USING btree (status);
-- INDEX: idx_bulk_profiling_jobs_created_by
CREATE INDEX idx_bulk_profiling_jobs_created_by ON public.bulk_profiling_jobs USING btree (created_by);
-- INDEX: idx_bulk_profiling_jobs_status
CREATE INDEX idx_bulk_profiling_jobs_status ON public.bulk_profiling_jobs USING btree (status);
-- INDEX: idx_business_processes_group_id
CREATE INDEX idx_business_processes_group_id ON public.business_processes USING btree (group_id);
-- INDEX: idx_business_processes_project_id
CREATE INDEX idx_business_processes_project_id ON public.business_processes USING btree (project_id);
-- INDEX: idx_business_processes_updated_at
CREATE INDEX idx_business_processes_updated_at ON public.business_processes USING btree (updated_at DESC);
-- INDEX: idx_column_tag_column
CREATE INDEX idx_column_tag_column ON public.column_governance_tag_assignments USING btree (file_id, column_name);
-- INDEX: idx_column_tag_file_id
CREATE INDEX idx_column_tag_file_id ON public.column_governance_tag_assignments USING btree (file_id);
-- INDEX: unique_column_tag
CREATE UNIQUE INDEX unique_column_tag ON public.column_governance_tag_assignments USING btree (file_id, column_name, tag_id);
-- INDEX: idx_column_policy_column
CREATE INDEX idx_column_policy_column ON public.column_policy_assignments USING btree (file_id, column_name);
-- INDEX: idx_column_policy_file_id
CREATE INDEX idx_column_policy_file_id ON public.column_policy_assignments USING btree (file_id);
-- INDEX: unique_column_policy
CREATE UNIQUE INDEX unique_column_policy ON public.column_policy_assignments USING btree (file_id, column_name, policy_id);
-- INDEX: idx_column_tags_classification
CREATE INDEX idx_column_tags_classification ON public.column_sensitivity_tags USING btree (sensitivity_level);
-- INDEX: idx_column_tags_file_id
CREATE INDEX idx_column_tags_file_id ON public.column_sensitivity_tags USING btree (file_id);
-- INDEX: unique_file_column_tag
CREATE UNIQUE INDEX unique_file_column_tag ON public.column_sensitivity_tags USING btree (file_id, column_name);
-- INDEX: idx_config_change_entity
CREATE INDEX idx_config_change_entity ON public.config_change_history USING btree (entity_type, entity_id, "timestamp" DESC);
-- INDEX: idx_config_change_timestamp
CREATE INDEX idx_config_change_timestamp ON public.config_change_history USING btree ("timestamp" DESC);
-- INDEX: idx_config_change_user
CREATE INDEX idx_config_change_user ON public.config_change_history USING btree (changed_by_user, "timestamp" DESC);
-- INDEX: idx_config_change_history_archive_archived
CREATE INDEX idx_config_change_history_archive_archived ON public.config_change_history_archive USING btree (archived_at DESC);
-- INDEX: idx_config_change_history_archive_timestamp
CREATE INDEX idx_config_change_history_archive_timestamp ON public.config_change_history_archive USING btree ("timestamp" DESC);
-- INDEX: connections_connection_name_key
CREATE UNIQUE INDEX connections_connection_name_key ON public.connections USING btree (connection_name);
-- INDEX: idx_data_access_file
CREATE INDEX idx_data_access_file ON public.data_access_log USING btree (file_id, "timestamp" DESC);
-- INDEX: idx_data_access_pii
CREATE INDEX idx_data_access_pii ON public.data_access_log USING btree (contains_pii, "timestamp" DESC) WHERE (contains_pii = true);
-- INDEX: idx_data_access_timestamp
CREATE INDEX idx_data_access_timestamp ON public.data_access_log USING btree ("timestamp" DESC);
-- INDEX: idx_data_access_user
CREATE INDEX idx_data_access_user ON public.data_access_log USING btree (user_id, "timestamp" DESC);
-- INDEX: idx_data_access_log_archive_archived
CREATE INDEX idx_data_access_log_archive_archived ON public.data_access_log_archive USING btree (archived_at DESC);
-- INDEX: idx_data_access_log_archive_timestamp
CREATE INDEX idx_data_access_log_archive_timestamp ON public.data_access_log_archive USING btree ("timestamp" DESC);
-- INDEX: idx_data_access_log_archive_user
CREATE INDEX idx_data_access_log_archive_user ON public.data_access_log_archive USING btree (user_id, "timestamp" DESC);
-- INDEX: dbt_executions_execution_uuid_key
CREATE UNIQUE INDEX dbt_executions_execution_uuid_key ON public.dbt_executions USING btree (execution_uuid);
-- INDEX: idx_dbt_executions_created
CREATE INDEX idx_dbt_executions_created ON public.dbt_executions USING btree (created_at DESC);
-- INDEX: idx_dbt_executions_status
CREATE INDEX idx_dbt_executions_status ON public.dbt_executions USING btree (status);
-- INDEX: idx_dbt_executions_triggered_by
CREATE INDEX idx_dbt_executions_triggered_by ON public.dbt_executions USING btree (triggered_by);
-- INDEX: idx_dbt_executions_uuid
CREATE INDEX idx_dbt_executions_uuid ON public.dbt_executions USING btree (execution_uuid);
-- INDEX: dbt_models_model_name_key
CREATE UNIQUE INDEX dbt_models_model_name_key ON public.dbt_models USING btree (model_name);
-- INDEX: idx_dbt_models_name
CREATE INDEX idx_dbt_models_name ON public.dbt_models USING btree (model_name);
-- INDEX: idx_dbt_models_status
CREATE INDEX idx_dbt_models_status ON public.dbt_models USING btree (last_run_status);
-- INDEX: idx_dbt_models_type
CREATE INDEX idx_dbt_models_type ON public.dbt_models USING btree (model_type);
-- INDEX: idx_dbt_models_updated
CREATE INDEX idx_dbt_models_updated ON public.dbt_models USING btree (updated_at DESC);
-- INDEX: idx_dlq_jobs_created_at
CREATE INDEX idx_dlq_jobs_created_at ON public.dlq_jobs USING btree (created_at);
-- INDEX: idx_dlq_jobs_error_code
CREATE INDEX idx_dlq_jobs_error_code ON public.dlq_jobs USING btree (error_code);
-- INDEX: idx_dlq_jobs_file_id
CREATE INDEX idx_dlq_jobs_file_id ON public.dlq_jobs USING btree (file_id);
-- INDEX: idx_dlq_jobs_project_id
CREATE INDEX idx_dlq_jobs_project_id ON public.dlq_jobs USING btree (project_id);
-- INDEX: idx_dlq_jobs_status
CREATE INDEX idx_dlq_jobs_status ON public.dlq_jobs USING btree (status);
-- INDEX: idx_dlq_jobs_vendor_agreement
CREATE INDEX idx_dlq_jobs_vendor_agreement ON public.dlq_jobs USING btree (vendor_agreement_id) WHERE (vendor_agreement_id IS NOT NULL);
-- INDEX: idx_encrypted_passwords_entity
CREATE INDEX idx_encrypted_passwords_entity ON public.encrypted_passwords USING btree (entity_type, entity_id);
-- INDEX: idx_encrypted_passwords_rotation
CREATE INDEX idx_encrypted_passwords_rotation ON public.encrypted_passwords USING btree (rotation_scheduled_at) WHERE (rotation_scheduled_at IS NOT NULL);
-- INDEX: unique_entity_password
CREATE UNIQUE INDEX unique_entity_password ON public.encrypted_passwords USING btree (entity_type, entity_id);
-- INDEX: idx_execution_audit_entity
CREATE INDEX idx_execution_audit_entity ON public.execution_audit USING btree (execution_type, entity_id);
-- INDEX: idx_execution_audit_execution
CREATE INDEX idx_execution_audit_execution ON public.execution_audit USING btree (execution_id, "timestamp" DESC);
-- INDEX: idx_execution_audit_status
CREATE INDEX idx_execution_audit_status ON public.execution_audit USING btree (new_status, "timestamp" DESC);
-- INDEX: idx_execution_audit_archive_archived
CREATE INDEX idx_execution_audit_archive_archived ON public.execution_audit_archive USING btree (archived_at DESC);
-- INDEX: idx_execution_audit_archive_timestamp
CREATE INDEX idx_execution_audit_archive_timestamp ON public.execution_audit_archive USING btree ("timestamp" DESC);
-- INDEX: idx_file_audit_correlation_id
CREATE INDEX idx_file_audit_correlation_id ON public.file_audit_details USING btree (correlation_id);
-- INDEX: idx_file_audit_created_dt
CREATE INDEX idx_file_audit_created_dt ON public.file_audit_details USING btree (created_dt);
-- INDEX: idx_file_audit_file_id
CREATE INDEX idx_file_audit_file_id ON public.file_audit_details USING btree (file_id);
-- INDEX: idx_file_audit_file_role
CREATE INDEX idx_file_audit_file_role ON public.file_audit_details USING btree (file_role);
-- INDEX: idx_file_audit_parent
CREATE INDEX idx_file_audit_parent ON public.file_audit_details USING btree (parent_audit_id);
-- INDEX: idx_file_audit_status
CREATE INDEX idx_file_audit_status ON public.file_audit_details USING btree (status);
-- INDEX: file_columns_file_id_column_name_file_role_key
CREATE UNIQUE INDEX file_columns_file_id_column_name_file_role_key ON public.file_columns USING btree (file_id, column_name, file_role);
-- INDEX: idx_file_columns_file_id
CREATE INDEX idx_file_columns_file_id ON public.file_columns USING btree (file_id);
-- INDEX: idx_file_columns_file_timestamp
CREATE INDEX idx_file_columns_file_timestamp ON public.file_columns USING btree (file_id, profile_timestamp DESC);
-- INDEX: idx_file_errors_created_at
CREATE INDEX idx_file_errors_created_at ON public.file_errors USING btree (created_at DESC);
-- INDEX: idx_file_errors_file_id
CREATE INDEX idx_file_errors_file_id ON public.file_errors USING btree (file_id);
-- INDEX: idx_file_errors_severity
CREATE INDEX idx_file_errors_severity ON public.file_errors USING btree (severity);
-- INDEX: idx_file_errors_status
CREATE INDEX idx_file_errors_status ON public.file_errors USING btree (status);
-- INDEX: idx_file_errors_type
CREATE INDEX idx_file_errors_type ON public.file_errors USING btree (error_type);
-- INDEX: file_ownership_file_id_key
CREATE UNIQUE INDEX file_ownership_file_id_key ON public.file_ownership USING btree (file_id);
-- INDEX: idx_file_ownership_file_id
CREATE INDEX idx_file_ownership_file_id ON public.file_ownership USING btree (file_id);
-- INDEX: idx_file_ownership_user_id
CREATE INDEX idx_file_ownership_user_id ON public.file_ownership USING btree (owner_user_id);
-- INDEX: file_pattern_metrics_file_pattern_metric_date_key
CREATE UNIQUE INDEX file_pattern_metrics_file_pattern_metric_date_key ON public.file_pattern_metrics USING btree (file_pattern, metric_date);
-- INDEX: idx_file_pattern_metrics_alerts
CREATE INDEX idx_file_pattern_metrics_alerts ON public.file_pattern_metrics USING btree (has_alerts, file_pattern);
-- INDEX: idx_file_pattern_metrics_date
CREATE INDEX idx_file_pattern_metrics_date ON public.file_pattern_metrics USING btree (metric_date DESC);
-- INDEX: idx_file_pattern_metrics_pattern
CREATE INDEX idx_file_pattern_metrics_pattern ON public.file_pattern_metrics USING btree (file_pattern);
-- INDEX: idx_file_pattern_metrics_pattern_date
CREATE INDEX idx_file_pattern_metrics_pattern_date ON public.file_pattern_metrics USING btree (file_pattern, metric_date DESC);
-- INDEX: idx_file_pattern_metrics_retention
CREATE INDEX idx_file_pattern_metrics_retention ON public.file_pattern_metrics USING btree (retention_until);
-- INDEX: idx_file_pattern_metrics_monthly_pattern_month
CREATE UNIQUE INDEX idx_file_pattern_metrics_monthly_pattern_month ON public.file_pattern_metrics_monthly USING btree (file_pattern, month_start DESC);
-- INDEX: idx_file_pattern_metrics_weekly_pattern_week
CREATE UNIQUE INDEX idx_file_pattern_metrics_weekly_pattern_week ON public.file_pattern_metrics_weekly USING btree (file_pattern, week_start DESC);
-- INDEX: idx_policy_assignments_file_id
CREATE INDEX idx_policy_assignments_file_id ON public.file_policy_assignments USING btree (file_id);
-- INDEX: idx_policy_assignments_policy_id
CREATE INDEX idx_policy_assignments_policy_id ON public.file_policy_assignments USING btree (policy_id);
-- INDEX: unique_file_policy
CREATE UNIQUE INDEX unique_file_policy ON public.file_policy_assignments USING btree (file_id, policy_id);
-- INDEX: idx_file_preview_data_created_at
CREATE INDEX idx_file_preview_data_created_at ON public.file_preview_data USING btree (created_at);
-- INDEX: idx_file_preview_data_file_id
CREATE INDEX idx_file_preview_data_file_id ON public.file_preview_data USING btree (file_id);
-- INDEX: unique_file_row
CREATE UNIQUE INDEX unique_file_row ON public.file_preview_data USING btree (file_id, row_number);
-- INDEX: idx_artifacts_file_id
CREATE INDEX idx_artifacts_file_id ON public.file_processing_artifacts USING btree (file_id);
-- INDEX: idx_artifacts_type
CREATE INDEX idx_artifacts_type ON public.file_processing_artifacts USING btree (artifact_type);
-- INDEX: unique_file_artifact
CREATE UNIQUE INDEX unique_file_artifact ON public.file_processing_artifacts USING btree (file_id, artifact_type);
-- INDEX: idx_file_quality_rules_file_id
CREATE INDEX idx_file_quality_rules_file_id ON public.file_quality_rules USING btree (file_id);
-- INDEX: idx_file_quality_rules_rule_id
CREATE INDEX idx_file_quality_rules_rule_id ON public.file_quality_rules USING btree (quality_rule_id);
-- INDEX: unique_file_quality_rule
CREATE UNIQUE INDEX unique_file_quality_rule ON public.file_quality_rules USING btree (file_id, quality_rule_id);
-- INDEX: idx_file_restorations_archived_file
CREATE INDEX idx_file_restorations_archived_file ON public.file_restorations USING btree (archived_file_id);
-- INDEX: idx_file_restorations_requested_at
CREATE INDEX idx_file_restorations_requested_at ON public.file_restorations USING btree (requested_at);
-- INDEX: idx_file_restorations_status
CREATE INDEX idx_file_restorations_status ON public.file_restorations USING btree (status);
-- INDEX: idx_file_schedules_file_id
CREATE INDEX idx_file_schedules_file_id ON public.file_schedules USING btree (file_id);
-- INDEX: file_schema_details_file_id_file_schema_id_key
CREATE UNIQUE INDEX file_schema_details_file_id_file_schema_id_key ON public.file_schema_details USING btree (file_id, file_schema_id);
-- INDEX: idx_file_schema_active
CREATE INDEX idx_file_schema_active ON public.file_schema_details USING btree (active_flag);
-- INDEX: idx_file_schema_correlation
CREATE INDEX idx_file_schema_correlation ON public.file_schema_details USING btree (correlation_id);
-- INDEX: idx_file_schema_file_id
CREATE INDEX idx_file_schema_file_id ON public.file_schema_details USING btree (file_id);
-- INDEX: idx_file_schema_hash
CREATE INDEX idx_file_schema_hash ON public.file_schema_details USING btree (schema_hash);
-- INDEX: idx_file_schema_schema_id
CREATE INDEX idx_file_schema_schema_id ON public.file_schema_details USING btree (file_schema_id);
-- INDEX: file_schemas_file_id_schema_hash_key
CREATE UNIQUE INDEX file_schemas_file_id_schema_hash_key ON public.file_schemas USING btree (file_id, schema_hash);
-- INDEX: idx_file_schemas_file
CREATE INDEX idx_file_schemas_file ON public.file_schemas USING btree (file_id);
-- INDEX: idx_file_schemas_hash
CREATE INDEX idx_file_schemas_hash ON public.file_schemas USING btree (schema_hash);
-- INDEX: idx_file_schemas_logical_file
CREATE INDEX idx_file_schemas_logical_file ON public.file_schemas USING btree (logical_file_id, captured_at DESC);
-- INDEX: idx_file_schemas_pattern
CREATE INDEX idx_file_schemas_pattern ON public.file_schemas USING btree (file_pattern);
-- INDEX: idx_tag_assignments_file_id
CREATE INDEX idx_tag_assignments_file_id ON public.file_tag_assignments USING btree (file_id);
-- INDEX: idx_tag_assignments_tag_id
CREATE INDEX idx_tag_assignments_tag_id ON public.file_tag_assignments USING btree (tag_id);
-- INDEX: unique_file_tag
CREATE UNIQUE INDEX unique_file_tag ON public.file_tag_assignments USING btree (file_id, tag_id);
-- INDEX: files_file_id_key
CREATE UNIQUE INDEX files_file_id_key ON public.files USING btree (file_id);
-- INDEX: idx_files_correlation_id
CREATE INDEX idx_files_correlation_id ON public.files USING btree (correlation_id);
-- INDEX: idx_files_created_at
CREATE INDEX idx_files_created_at ON public.files USING btree (created_at DESC);
-- INDEX: idx_files_failure_reason_code
CREATE INDEX idx_files_failure_reason_code ON public.files USING btree (failure_reason_code) WHERE (failure_reason_code IS NOT NULL);
-- INDEX: idx_files_file_role
CREATE INDEX idx_files_file_role ON public.files USING btree (file_role);
-- INDEX: idx_files_is_archive
CREATE INDEX idx_files_is_archive ON public.files USING btree (is_archive) WHERE (is_archive = true);
-- INDEX: idx_files_logical_file
CREATE INDEX idx_files_logical_file ON public.files USING btree (logical_file_id);
-- INDEX: idx_files_parent_archive
CREATE INDEX idx_files_parent_archive ON public.files USING btree (parent_archive_id) WHERE (parent_archive_id IS NOT NULL);
-- INDEX: idx_files_project_created
CREATE INDEX idx_files_project_created ON public.files USING btree (project_id, created_at DESC) WHERE (project_id IS NOT NULL);
-- INDEX: idx_files_project_id
CREATE INDEX idx_files_project_id ON public.files USING btree (project_id);
-- INDEX: idx_files_source_format
CREATE INDEX idx_files_source_format ON public.files USING btree (source_format) WHERE (source_format IS NOT NULL);
-- INDEX: idx_files_sub_project
CREATE INDEX idx_files_sub_project ON public.files USING btree (sub_project_id);
-- INDEX: idx_files_updated_at
CREATE INDEX idx_files_updated_at ON public.files USING btree (updated_at DESC);
-- INDEX: idx_files_vendor_agreement_created
CREATE INDEX idx_files_vendor_agreement_created ON public.files USING btree (vendor_agreement_id, created_at DESC) WHERE (vendor_agreement_id IS NOT NULL);
-- INDEX: idx_files_vendor_agreement_id
CREATE INDEX idx_files_vendor_agreement_id ON public.files USING btree (vendor_agreement_id);
-- INDEX: fixed_width_schemas_file_id_key
CREATE UNIQUE INDEX fixed_width_schemas_file_id_key ON public.fixed_width_schemas USING btree (file_id);
-- INDEX: idx_fixed_width_schemas_file_id
CREATE INDEX idx_fixed_width_schemas_file_id ON public.fixed_width_schemas USING btree (file_id);
-- INDEX: idx_frontend_audit_log_error
CREATE INDEX idx_frontend_audit_log_error ON public.frontend_audit_log USING btree ("timestamp" DESC) WHERE (error_message IS NOT NULL);
-- INDEX: idx_frontend_audit_log_event
CREATE INDEX idx_frontend_audit_log_event ON public.frontend_audit_log USING btree (event_type, "timestamp" DESC);
-- INDEX: idx_frontend_audit_log_timestamp
CREATE INDEX idx_frontend_audit_log_timestamp ON public.frontend_audit_log USING btree ("timestamp" DESC);
-- INDEX: idx_frontend_audit_log_user
CREATE INDEX idx_frontend_audit_log_user ON public.frontend_audit_log USING btree (user_id, "timestamp" DESC);
-- INDEX: governance_tags_tag_name_key
CREATE UNIQUE INDEX governance_tags_tag_name_key ON public.governance_tags USING btree (tag_name);
-- INDEX: idx_group_policy_attachments_group
CREATE INDEX idx_group_policy_attachments_group ON public.group_policy_attachments USING btree (group_id);
-- INDEX: idx_group_policy_attachments_policy
CREATE INDEX idx_group_policy_attachments_policy ON public.group_policy_attachments USING btree (policy_id);
-- INDEX: idx_groups_name
CREATE INDEX idx_groups_name ON public.groups USING btree (name);
-- INDEX: idempotency_keys_key_key
CREATE UNIQUE INDEX idempotency_keys_key_key ON public.idempotency_keys USING btree (key);
-- INDEX: idx_idempotency_expires
CREATE INDEX idx_idempotency_expires ON public.idempotency_keys USING btree (expires_at);
-- INDEX: idx_idempotency_key
CREATE INDEX idx_idempotency_key ON public.idempotency_keys USING btree (key);
-- INDEX: idx_idempotency_user
CREATE INDEX idx_idempotency_user ON public.idempotency_keys USING btree (user_id);
-- INDEX: idx_job_dependencies_depends_on
CREATE INDEX idx_job_dependencies_depends_on ON public.job_dependencies USING btree (depends_on_job_id);
-- INDEX: idx_job_dependencies_job
CREATE INDEX idx_job_dependencies_job ON public.job_dependencies USING btree (job_id);
-- INDEX: unique_job_dependency
CREATE UNIQUE INDEX unique_job_dependency ON public.job_dependencies USING btree (job_id, depends_on_job_id);
-- INDEX: idx_job_group_dependencies_depends_on
CREATE INDEX idx_job_group_dependencies_depends_on ON public.job_group_dependencies USING btree (depends_on_group_id);
-- INDEX: idx_job_group_dependencies_group
CREATE INDEX idx_job_group_dependencies_group ON public.job_group_dependencies USING btree (group_id);
-- INDEX: unique_group_dependency
CREATE UNIQUE INDEX unique_group_dependency ON public.job_group_dependencies USING btree (group_id, depends_on_group_id);
-- INDEX: idx_job_group_jobs_group_id
CREATE INDEX idx_job_group_jobs_group_id ON public.job_group_jobs USING btree (group_id);
-- INDEX: idx_job_group_jobs_job_id
CREATE INDEX idx_job_group_jobs_job_id ON public.job_group_jobs USING btree (job_id);
-- INDEX: idx_job_group_schedules_enabled
CREATE INDEX idx_job_group_schedules_enabled ON public.job_group_schedules USING btree (enabled) WHERE (enabled = true);
-- INDEX: idx_job_group_schedules_group
CREATE INDEX idx_job_group_schedules_group ON public.job_group_schedules USING btree (group_id);
-- INDEX: idx_job_schedules_job_id
CREATE INDEX idx_job_schedules_job_id ON public.job_schedules USING btree (job_id);
-- INDEX: idx_jobs_business_process_id
CREATE INDEX idx_jobs_business_process_id ON public.jobs USING btree (business_process_id);
-- INDEX: idx_jobs_updated_at
CREATE INDEX idx_jobs_updated_at ON public.jobs USING btree (updated_at DESC);
-- INDEX: idx_lineage_views_root
CREATE INDEX idx_lineage_views_root ON public.lineage_views USING btree (root_type, root_id);
-- INDEX: idx_lineage_views_user_id
CREATE INDEX idx_lineage_views_user_id ON public.lineage_views USING btree (user_id);
-- INDEX: idx_logical_file_groups_canonical
CREATE INDEX idx_logical_file_groups_canonical ON public.logical_file_groups USING btree (canonical_name);
-- INDEX: idx_logical_file_groups_changes
CREATE INDEX idx_logical_file_groups_changes ON public.logical_file_groups USING btree (has_schema_changes) WHERE (has_schema_changes = true);
-- INDEX: idx_logical_file_groups_pattern
CREATE INDEX idx_logical_file_groups_pattern ON public.logical_file_groups USING btree (file_pattern);
-- INDEX: idx_logical_file_groups_project
CREATE INDEX idx_logical_file_groups_project ON public.logical_file_groups USING btree (project_id);
-- INDEX: logical_file_groups_logical_file_id_key
CREATE UNIQUE INDEX logical_file_groups_logical_file_id_key ON public.logical_file_groups USING btree (logical_file_id);
-- INDEX: logical_file_groups_project_id_canonical_name_key
CREATE UNIQUE INDEX logical_file_groups_project_id_canonical_name_key ON public.logical_file_groups USING btree (project_id, canonical_name);
-- INDEX: idx_mapping_group_executions_group_id
CREATE INDEX idx_mapping_group_executions_group_id ON public.mapping_group_executions USING btree (group_id);
-- INDEX: idx_mapping_group_executions_project_id
CREATE INDEX idx_mapping_group_executions_project_id ON public.mapping_group_executions USING btree (project_id);
-- INDEX: idx_mapping_group_members_group_id
CREATE INDEX idx_mapping_group_members_group_id ON public.mapping_group_members USING btree (group_id);
-- INDEX: idx_mapping_group_members_mapping_id
CREATE INDEX idx_mapping_group_members_mapping_id ON public.mapping_group_members USING btree (mapping_id);
-- INDEX: mapping_group_members_group_id_mapping_id_key
CREATE UNIQUE INDEX mapping_group_members_group_id_mapping_id_key ON public.mapping_group_members USING btree (group_id, mapping_id);
-- INDEX: idx_mapping_groups_project_id
CREATE INDEX idx_mapping_groups_project_id ON public.mapping_groups USING btree (project_id);
-- INDEX: idx_mapping_job_errors_created_at
CREATE INDEX idx_mapping_job_errors_created_at ON public.mapping_job_errors USING btree (created_at DESC);
-- INDEX: idx_mapping_job_errors_job_id
CREATE INDEX idx_mapping_job_errors_job_id ON public.mapping_job_errors USING btree (job_id);
-- INDEX: idx_mapping_job_errors_mapping_id
CREATE INDEX idx_mapping_job_errors_mapping_id ON public.mapping_job_errors USING btree (mapping_id);
-- INDEX: idx_mapping_job_errors_severity
CREATE INDEX idx_mapping_job_errors_severity ON public.mapping_job_errors USING btree (severity);
-- INDEX: idx_mapping_job_errors_status
CREATE INDEX idx_mapping_job_errors_status ON public.mapping_job_errors USING btree (status);
-- INDEX: idx_mapping_job_errors_type
CREATE INDEX idx_mapping_job_errors_type ON public.mapping_job_errors USING btree (error_type);
-- INDEX: migrations_name_key
CREATE UNIQUE INDEX migrations_name_key ON public.migrations USING btree (name);
-- INDEX: idx_mv_file_processing_day_type
CREATE UNIQUE INDEX idx_mv_file_processing_day_type ON public.mv_file_processing_summary USING btree (day, file_type);
-- INDEX: idx_mv_job_trends_hour_status
CREATE UNIQUE INDEX idx_mv_job_trends_hour_status ON public.mv_job_trends_hourly USING btree (hour, status);
-- INDEX: idx_n_step_workflow_assets_step
CREATE INDEX idx_n_step_workflow_assets_step ON public.n_step_workflow_assets USING btree (step_id);
-- INDEX: idx_n_step_workflow_run_steps_run
CREATE INDEX idx_n_step_workflow_run_steps_run ON public.n_step_workflow_run_steps USING btree (run_id);
-- INDEX: idx_n_step_workflow_runs_workflow
CREATE INDEX idx_n_step_workflow_runs_workflow ON public.n_step_workflow_runs USING btree (workflow_id);
-- INDEX: n_step_workflow_runs_run_id_key
CREATE UNIQUE INDEX n_step_workflow_runs_run_id_key ON public.n_step_workflow_runs USING btree (run_id);
-- INDEX: idx_n_step_workflow_steps_workflow
CREATE INDEX idx_n_step_workflow_steps_workflow ON public.n_step_workflow_steps USING btree (workflow_id);
-- INDEX: n_step_workflow_steps_workflow_id_step_index_key
CREATE UNIQUE INDEX n_step_workflow_steps_workflow_id_step_index_key ON public.n_step_workflow_steps USING btree (workflow_id, step_index);
-- INDEX: idx_n_step_workflows_project_id
CREATE INDEX idx_n_step_workflows_project_id ON public.n_step_workflows USING btree (project_id);
-- INDEX: idx_notifications_entity
CREATE INDEX idx_notifications_entity ON public.notifications USING btree (entity_type, entity_id);
-- INDEX: idx_notifications_is_read
CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (user_id, is_read);
-- INDEX: idx_notifications_user_id
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
-- INDEX: idx_password_reset_requests_status
CREATE INDEX idx_password_reset_requests_status ON public.password_reset_requests USING btree (status);
-- INDEX: idx_password_reset_requests_user
CREATE INDEX idx_password_reset_requests_user ON public.password_reset_requests USING btree (user_id);
-- INDEX: idx_permissions_action
CREATE INDEX idx_permissions_action ON public.permissions USING btree (action);
-- INDEX: idx_permissions_id
CREATE INDEX idx_permissions_id ON public.permissions USING btree (id);
-- INDEX: idx_permissions_name
CREATE INDEX idx_permissions_name ON public.permissions USING btree (name);
-- INDEX: idx_permissions_resource
CREATE INDEX idx_permissions_resource ON public.permissions USING btree (resource);
-- INDEX: permissions_name_key
CREATE UNIQUE INDEX permissions_name_key ON public.permissions USING btree (name);
-- INDEX: permissions_resource_action_key
CREATE UNIQUE INDEX permissions_resource_action_key ON public.permissions USING btree (resource, action);
-- INDEX: idx_policy_cache_expires
CREATE INDEX idx_policy_cache_expires ON public.policy_evaluation_cache USING btree (expires_at);
-- INDEX: idx_policy_cache_user
CREATE INDEX idx_policy_cache_user ON public.policy_evaluation_cache USING btree (user_id);
-- INDEX: idx_processing_events_created_at
CREATE INDEX idx_processing_events_created_at ON public.processing_events USING btree (created_at);
-- INDEX: idx_processing_events_file_id
CREATE INDEX idx_processing_events_file_id ON public.processing_events USING btree (file_id);
-- INDEX: idx_processing_events_job_id
CREATE INDEX idx_processing_events_job_id ON public.processing_events USING btree (job_id);
-- INDEX: idx_processing_events_stage
CREATE INDEX idx_processing_events_stage ON public.processing_events USING btree (event_stage);
-- INDEX: idx_processing_events_type
CREATE INDEX idx_processing_events_type ON public.processing_events USING btree (event_type);
-- INDEX: idx_profiling_metrics_date
CREATE INDEX idx_profiling_metrics_date ON public.profiling_metrics USING btree (profiled_at DESC);
-- INDEX: idx_profiling_metrics_file
CREATE INDEX idx_profiling_metrics_file ON public.profiling_metrics USING btree (file_id);
-- INDEX: idx_profiling_metrics_file_timestamp
CREATE INDEX idx_profiling_metrics_file_timestamp ON public.profiling_metrics USING btree (file_id, profile_timestamp DESC);
-- INDEX: idx_profiling_metrics_job_role
CREATE INDEX idx_profiling_metrics_job_role ON public.profiling_metrics USING btree (job_id, file_role);
-- INDEX: idx_profiling_metrics_mapping
CREATE INDEX idx_profiling_metrics_mapping ON public.profiling_metrics USING btree (mapping_id);
-- INDEX: profiling_metrics_file_id_file_role_key
CREATE UNIQUE INDEX profiling_metrics_file_id_file_role_key ON public.profiling_metrics USING btree (file_id, file_role);
-- INDEX: idx_project_access_groups_group_project
CREATE INDEX idx_project_access_groups_group_project ON public.project_access_groups USING btree (group_id, project_id);
-- INDEX: idx_project_members_project
CREATE INDEX idx_project_members_project ON public.project_members USING btree (project_id);
-- INDEX: idx_project_members_user
CREATE INDEX idx_project_members_user ON public.project_members USING btree (user_id);
-- INDEX: idx_project_members_user_project
CREATE INDEX idx_project_members_user_project ON public.project_members USING btree (user_id, project_id);
-- INDEX: project_members_project_user_unique
CREATE UNIQUE INDEX project_members_project_user_unique ON public.project_members USING btree (project_id, user_id);
-- INDEX: idx_projects_active
CREATE INDEX idx_projects_active ON public.projects USING btree (is_active) WHERE (is_active = true);
-- INDEX: idx_projects_is_default
CREATE INDEX idx_projects_is_default ON public.projects USING btree (is_default) WHERE (is_default = true);
-- INDEX: idx_projects_owner
CREATE INDEX idx_projects_owner ON public.projects USING btree (owner_id);
-- INDEX: idx_projects_owner_name_unique
CREATE UNIQUE INDEX idx_projects_owner_name_unique ON public.projects USING btree (owner_id, lower((name)::text));
-- INDEX: idx_projects_parent
CREATE INDEX idx_projects_parent ON public.projects USING btree (parent_id);
-- INDEX: idx_quality_rule_configs_file
CREATE INDEX idx_quality_rule_configs_file ON public.quality_rule_configurations USING btree (file_id);
-- INDEX: idx_quality_rule_configs_rule
CREATE INDEX idx_quality_rule_configs_rule ON public.quality_rule_configurations USING btree (rule_id);
-- INDEX: unique_file_rule
CREATE UNIQUE INDEX unique_file_rule ON public.quality_rule_configurations USING btree (file_id, rule_id);
-- INDEX: idx_quality_rule_violations_created_at
CREATE INDEX idx_quality_rule_violations_created_at ON public.quality_rule_violations USING btree (created_at DESC);
-- INDEX: idx_quality_rule_violations_file_id
CREATE INDEX idx_quality_rule_violations_file_id ON public.quality_rule_violations USING btree (file_id);
-- INDEX: idx_quality_rule_violations_job_id
CREATE INDEX idx_quality_rule_violations_job_id ON public.quality_rule_violations USING btree (job_id);
-- INDEX: idx_quality_rule_violations_rule_id
CREATE INDEX idx_quality_rule_violations_rule_id ON public.quality_rule_violations USING btree (rule_id);
-- INDEX: idx_quality_rule_violations_severity
CREATE INDEX idx_quality_rule_violations_severity ON public.quality_rule_violations USING btree (severity);
-- INDEX: idx_quality_rule_violations_status
CREATE INDEX idx_quality_rule_violations_status ON public.quality_rule_violations USING btree (status);
-- INDEX: idx_quality_rules_enabled
CREATE INDEX idx_quality_rules_enabled ON public.quality_rules USING btree (enabled);
-- INDEX: idx_quality_rules_project_id
CREATE INDEX idx_quality_rules_project_id ON public.quality_rules USING btree (project_id);
-- INDEX: idx_quality_rules_type
CREATE INDEX idx_quality_rules_type ON public.quality_rules USING btree (rule_type);
-- INDEX: idx_rbac_policies_active
CREATE INDEX idx_rbac_policies_active ON public.rbac_policies USING btree (is_active) WHERE (is_active = true);
-- INDEX: idx_rbac_policies_global
CREATE INDEX idx_rbac_policies_global ON public.rbac_policies USING btree (is_global) WHERE (is_global = true);
-- INDEX: idx_rbac_policies_project
CREATE INDEX idx_rbac_policies_project ON public.rbac_policies USING btree (project_id) WHERE (project_id IS NOT NULL);
-- INDEX: idx_rbac_policies_type
CREATE INDEX idx_rbac_policies_type ON public.rbac_policies USING btree (policy_type);
-- INDEX: unique_policy_name_per_project
CREATE UNIQUE INDEX unique_policy_name_per_project ON public.rbac_policies USING btree (name, project_id);
-- INDEX: idx_refresh_tokens_expires_at
CREATE INDEX idx_refresh_tokens_expires_at ON public.refresh_tokens USING btree (expires_at);
-- INDEX: idx_refresh_tokens_token_hash
CREATE INDEX idx_refresh_tokens_token_hash ON public.refresh_tokens USING btree (token);
-- INDEX: idx_refresh_tokens_user_id
CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);
-- INDEX: refresh_tokens_token_hash_key
CREATE UNIQUE INDEX refresh_tokens_token_hash_key ON public.refresh_tokens USING btree (token);
-- INDEX: idx_resource_attributes_key
CREATE INDEX idx_resource_attributes_key ON public.resource_attributes USING btree (attribute_key);
-- INDEX: idx_resource_attributes_resource
CREATE INDEX idx_resource_attributes_resource ON public.resource_attributes USING btree (resource_type, resource_id);
-- INDEX: idx_resource_attributes_type
CREATE INDEX idx_resource_attributes_type ON public.resource_attributes USING btree (resource_type);
-- INDEX: unique_resource_attribute
CREATE UNIQUE INDEX unique_resource_attribute ON public.resource_attributes USING btree (resource_type, resource_id, attribute_key);
-- INDEX: idx_resource_policy_attachments_policy
CREATE INDEX idx_resource_policy_attachments_policy ON public.resource_policy_attachments USING btree (policy_id);
-- INDEX: idx_resource_policy_attachments_resource
CREATE INDEX idx_resource_policy_attachments_resource ON public.resource_policy_attachments USING btree (resource_type, resource_id);
-- INDEX: idx_resource_policy_attachments_type
CREATE INDEX idx_resource_policy_attachments_type ON public.resource_policy_attachments USING btree (resource_type);
-- INDEX: idx_retention_policies_enabled
CREATE INDEX idx_retention_policies_enabled ON public.retention_policies USING btree (enabled);
-- INDEX: idx_retention_policies_next_run
CREATE INDEX idx_retention_policies_next_run ON public.retention_policies USING btree (next_run_at) WHERE (enabled = true);
-- INDEX: idx_retention_policies_priority
CREATE INDEX idx_retention_policies_priority ON public.retention_policies USING btree (priority);
-- INDEX: idx_retention_runs_policy
CREATE INDEX idx_retention_runs_policy ON public.retention_policy_runs USING btree (policy_id);
-- INDEX: idx_retention_runs_started_at
CREATE INDEX idx_retention_runs_started_at ON public.retention_policy_runs USING btree (started_at);
-- INDEX: idx_retention_runs_status
CREATE INDEX idx_retention_runs_status ON public.retention_policy_runs USING btree (status);
-- INDEX: idx_role_permissions_role_id_perm_id
CREATE INDEX idx_role_permissions_role_id_perm_id ON public.role_permissions USING btree (role_id, permission_id);
-- INDEX: idx_roles_name
CREATE INDEX idx_roles_name ON public.roles USING btree (name);
-- INDEX: roles_name_key
CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);
-- INDEX: idx_schedules_entity
CREATE INDEX idx_schedules_entity ON public.schedules USING btree (entity_type, entity_id);
-- INDEX: idx_schedules_next_run
CREATE INDEX idx_schedules_next_run ON public.schedules USING btree (next_run) WHERE (is_active = true);
-- INDEX: idx_schedules_project_id
CREATE INDEX idx_schedules_project_id ON public.schedules USING btree (project_id);
-- INDEX: schema_migrations_migration_name_key
CREATE UNIQUE INDEX schema_migrations_migration_name_key ON public.schema_migrations USING btree (migration_name);
-- INDEX: idx_schema_validation_job_files_job
CREATE INDEX idx_schema_validation_job_files_job ON public.schema_validation_job_files USING btree (job_id);
-- INDEX: idx_schema_validation_jobs_project
CREATE INDEX idx_schema_validation_jobs_project ON public.schema_validation_jobs USING btree (project_id);
-- INDEX: idx_schema_validation_jobs_status
CREATE INDEX idx_schema_validation_jobs_status ON public.schema_validation_jobs USING btree (status);
-- INDEX: idx_scim_configurations_active
CREATE INDEX idx_scim_configurations_active ON public.scim_configurations USING btree (is_active) WHERE (is_active = true);
-- INDEX: idx_scim_configurations_idp_type
CREATE INDEX idx_scim_configurations_idp_type ON public.scim_configurations USING btree (idp_type);
-- INDEX: scim_configurations_name_key
CREATE UNIQUE INDEX scim_configurations_name_key ON public.scim_configurations USING btree (name);
-- INDEX: idx_scim_mappings_config
CREATE INDEX idx_scim_mappings_config ON public.scim_resource_mappings USING btree (config_id);
-- INDEX: idx_scim_mappings_platform
CREATE INDEX idx_scim_mappings_platform ON public.scim_resource_mappings USING btree (platform_resource_type, platform_resource_id);
-- INDEX: idx_scim_mappings_scim_id
CREATE INDEX idx_scim_mappings_scim_id ON public.scim_resource_mappings USING btree (scim_id);
-- INDEX: unique_platform_resource
CREATE UNIQUE INDEX unique_platform_resource ON public.scim_resource_mappings USING btree (config_id, platform_resource_type, platform_resource_id);
-- INDEX: unique_scim_resource
CREATE UNIQUE INDEX unique_scim_resource ON public.scim_resource_mappings USING btree (config_id, scim_id);
-- INDEX: idx_scim_sync_logs_config
CREATE INDEX idx_scim_sync_logs_config ON public.scim_sync_logs USING btree (config_id);
-- INDEX: idx_scim_sync_logs_started
CREATE INDEX idx_scim_sync_logs_started ON public.scim_sync_logs USING btree (started_at DESC);
-- INDEX: idx_scim_sync_logs_status
CREATE INDEX idx_scim_sync_logs_status ON public.scim_sync_logs USING btree (status);
-- INDEX: idx_security_audit_event
CREATE INDEX idx_security_audit_event ON public.security_audit_log USING btree (event_type, "timestamp" DESC);
-- INDEX: idx_security_audit_severity
CREATE INDEX idx_security_audit_severity ON public.security_audit_log USING btree (severity, "timestamp" DESC) WHERE ((severity)::text = ANY ((ARRAY['WARNING'::character varying, 'CRITICAL'::character varying])::text[]));
-- INDEX: idx_security_audit_timestamp
CREATE INDEX idx_security_audit_timestamp ON public.security_audit_log USING btree ("timestamp" DESC);
-- INDEX: idx_security_audit_user
CREATE INDEX idx_security_audit_user ON public.security_audit_log USING btree (user_id, "timestamp" DESC);
-- INDEX: idx_security_audit_log_archive_archived
CREATE INDEX idx_security_audit_log_archive_archived ON public.security_audit_log_archive USING btree (archived_at DESC);
-- INDEX: idx_security_audit_log_archive_timestamp
CREATE INDEX idx_security_audit_log_archive_timestamp ON public.security_audit_log_archive USING btree ("timestamp" DESC);
-- INDEX: idx_security_audit_log_archive_user
CREATE INDEX idx_security_audit_log_archive_user ON public.security_audit_log_archive USING btree (user_id, "timestamp" DESC);
-- INDEX: idx_connections_name_unique_lower
CREATE UNIQUE INDEX idx_connections_name_unique_lower ON public.storage_connections USING btree (lower((name)::text));
-- INDEX: idx_storage_connections_auth_method
CREATE INDEX idx_storage_connections_auth_method ON public.storage_connections USING btree (authentication_method);
-- INDEX: idx_storage_connections_project_id
CREATE INDEX idx_storage_connections_project_id ON public.storage_connections USING btree (project_id);
-- INDEX: idx_storage_connections_user
CREATE INDEX idx_storage_connections_user ON public.storage_connections USING btree (connection_user);
-- INDEX: sub_project_access_groups_sub_project_id_group_id_key
CREATE UNIQUE INDEX sub_project_access_groups_sub_project_id_group_id_key ON public.sub_project_access_groups USING btree (sub_project_id, group_id);
-- INDEX: sub_project_members_sub_project_id_user_id_key
CREATE UNIQUE INDEX sub_project_members_sub_project_id_user_id_key ON public.sub_project_members USING btree (sub_project_id, user_id);
-- INDEX: idx_tag_permissions_role_id
CREATE INDEX idx_tag_permissions_role_id ON public.tag_permissions USING btree (role_id);
-- INDEX: idx_tag_permissions_tag_id
CREATE INDEX idx_tag_permissions_tag_id ON public.tag_permissions USING btree (tag_id);
-- INDEX: unique_tag_role
CREATE UNIQUE INDEX unique_tag_role ON public.tag_permissions USING btree (tag_id, role_id);
-- INDEX: transformation_executions_execution_id_key
CREATE UNIQUE INDEX transformation_executions_execution_id_key ON public.transformation_executions USING btree (execution_id);
-- INDEX: idx_transformation_jobs_failure_reason_code
CREATE INDEX idx_transformation_jobs_failure_reason_code ON public.transformation_jobs USING btree (failure_reason_code) WHERE (failure_reason_code IS NOT NULL);
-- INDEX: idx_transformation_jobs_mapping
CREATE INDEX idx_transformation_jobs_mapping ON public.transformation_jobs USING btree (mapping_id);
-- INDEX: idx_transformation_jobs_mapping_status
CREATE INDEX idx_transformation_jobs_mapping_status ON public.transformation_jobs USING btree (mapping_id, status, created_at DESC);
-- INDEX: idx_transformation_jobs_project_id
CREATE INDEX idx_transformation_jobs_project_id ON public.transformation_jobs USING btree (project_id);
-- INDEX: idx_transformation_jobs_project_status
CREATE INDEX idx_transformation_jobs_project_status ON public.transformation_jobs USING btree (project_id, status, created_at DESC) WHERE (project_id IS NOT NULL);
-- INDEX: idx_transformation_jobs_start
CREATE INDEX idx_transformation_jobs_start ON public.transformation_jobs USING btree (start_time DESC);
-- INDEX: idx_transformation_jobs_status
CREATE INDEX idx_transformation_jobs_status ON public.transformation_jobs USING btree (status);
-- INDEX: idx_transformation_jobs_status_created
CREATE INDEX idx_transformation_jobs_status_created ON public.transformation_jobs USING btree (status, created_at DESC);
-- INDEX: transformation_jobs_job_id_key
CREATE UNIQUE INDEX transformation_jobs_job_id_key ON public.transformation_jobs USING btree (job_id);
-- INDEX: idx_transformation_lineage_column_mappings
CREATE INDEX idx_transformation_lineage_column_mappings ON public.transformation_lineage USING gin (column_mappings);
-- INDEX: idx_transformation_logs_job
CREATE INDEX idx_transformation_logs_job ON public.transformation_logs USING btree (job_id);
-- INDEX: idx_transformation_logs_level
CREATE INDEX idx_transformation_logs_level ON public.transformation_logs USING btree (log_level);
-- INDEX: idx_transformation_logs_timestamp
CREATE INDEX idx_transformation_logs_timestamp ON public.transformation_logs USING btree ("timestamp" DESC);
-- INDEX: idx_transformation_mappings_pattern
CREATE INDEX idx_transformation_mappings_pattern ON public.transformation_mappings USING btree (source_file_pattern);
-- INDEX: idx_transformation_mappings_project_id
CREATE INDEX idx_transformation_mappings_project_id ON public.transformation_mappings USING btree (project_id);
-- INDEX: idx_transformation_mappings_source
CREATE INDEX idx_transformation_mappings_source ON public.transformation_mappings USING btree (source_connection_id);
-- INDEX: idx_transformation_mappings_status
CREATE INDEX idx_transformation_mappings_status ON public.transformation_mappings USING btree (status);
-- INDEX: idx_transformation_mappings_sub_project_id
CREATE INDEX idx_transformation_mappings_sub_project_id ON public.transformation_mappings USING btree (sub_project_id);
-- INDEX: idx_transformation_mappings_vendor_agreement_id
CREATE INDEX idx_transformation_mappings_vendor_agreement_id ON public.transformation_mappings USING btree (vendor_agreement_id);
-- INDEX: transformation_mappings_mapping_id_key
CREATE UNIQUE INDEX transformation_mappings_mapping_id_key ON public.transformation_mappings USING btree (mapping_id);
-- INDEX: idx_transformation_quality_rules_mapping_id
CREATE INDEX idx_transformation_quality_rules_mapping_id ON public.transformation_quality_rules USING btree (mapping_id);
-- INDEX: idx_transformation_quality_rules_rule_id
CREATE INDEX idx_transformation_quality_rules_rule_id ON public.transformation_quality_rules USING btree (quality_rule_id);
-- INDEX: unique_transformation_quality_rule
CREATE UNIQUE INDEX unique_transformation_quality_rule ON public.transformation_quality_rules USING btree (mapping_id, quality_rule_id);
-- INDEX: transformations_transformation_id_key
CREATE UNIQUE INDEX transformations_transformation_id_key ON public.transformations USING btree (transformation_id);
-- INDEX: idx_upload_batches_batch_id
CREATE INDEX idx_upload_batches_batch_id ON public.upload_batches USING btree (batch_id);
-- INDEX: idx_upload_batches_status
CREATE INDEX idx_upload_batches_status ON public.upload_batches USING btree (status, created_at DESC);
-- INDEX: idx_upload_batches_user_project
CREATE INDEX idx_upload_batches_user_project ON public.upload_batches USING btree (user_id, project_id);
-- INDEX: upload_batches_batch_id_key
CREATE UNIQUE INDEX upload_batches_batch_id_key ON public.upload_batches USING btree (batch_id);
-- INDEX: idx_upload_file_records_file_status
CREATE INDEX idx_upload_file_records_file_status ON public.upload_file_records USING btree (upload_file_id, status);
-- INDEX: idx_upload_files_batch_id
CREATE INDEX idx_upload_files_batch_id ON public.upload_files USING btree (batch_id);
-- INDEX: idx_upload_files_catalog
CREATE INDEX idx_upload_files_catalog ON public.upload_files USING btree (catalog_file_id);
-- INDEX: idx_upload_files_file_id
CREATE INDEX idx_upload_files_file_id ON public.upload_files USING btree (file_id);
-- INDEX: idx_upload_files_status
CREATE INDEX idx_upload_files_status ON public.upload_files USING btree (status, uploaded_at DESC);
-- INDEX: upload_files_file_id_key
CREATE UNIQUE INDEX upload_files_file_id_key ON public.upload_files USING btree (file_id);
-- INDEX: idx_user_attributes_key
CREATE INDEX idx_user_attributes_key ON public.user_attributes USING btree (attribute_key);
-- INDEX: idx_user_attributes_source
CREATE INDEX idx_user_attributes_source ON public.user_attributes USING btree (source);
-- INDEX: idx_user_attributes_user
CREATE INDEX idx_user_attributes_user ON public.user_attributes USING btree (user_id);
-- INDEX: unique_user_attribute
CREATE UNIQUE INDEX unique_user_attribute ON public.user_attributes USING btree (user_id, attribute_key);
-- INDEX: user_badges_badge_id_key
CREATE UNIQUE INDEX user_badges_badge_id_key ON public.user_badges USING btree (badge_id);
-- INDEX: idx_user_groups_group_id
CREATE INDEX idx_user_groups_group_id ON public.user_groups USING btree (group_id);
-- INDEX: idx_user_groups_user_group
CREATE INDEX idx_user_groups_user_group ON public.user_groups USING btree (user_id, group_id);
-- INDEX: idx_user_groups_user_id
CREATE INDEX idx_user_groups_user_id ON public.user_groups USING btree (user_id);
-- INDEX: idx_user_policy_attachments_policy
CREATE INDEX idx_user_policy_attachments_policy ON public.user_policy_attachments USING btree (policy_id);
-- INDEX: idx_user_policy_attachments_user
CREATE INDEX idx_user_policy_attachments_user ON public.user_policy_attachments USING btree (user_id);
-- INDEX: idx_user_roles_user_id_role_id
CREATE INDEX idx_user_roles_user_id_role_id ON public.user_roles USING btree (user_id, role_id);
-- INDEX: user_sessions_token_key
CREATE UNIQUE INDEX user_sessions_token_key ON public.user_sessions USING btree (token);
-- INDEX: idx_users_auth_provider
CREATE INDEX idx_users_auth_provider ON public.users USING btree (auth_provider);
-- INDEX: idx_users_external_id
CREATE UNIQUE INDEX idx_users_external_id ON public.users USING btree (external_id) WHERE (external_id IS NOT NULL);
-- INDEX: idx_users_id
CREATE INDEX idx_users_id ON public.users USING btree (id);
-- INDEX: idx_users_username
CREATE INDEX idx_users_username ON public.users USING btree (lower((username)::text));
-- INDEX: users_email_unique
CREATE UNIQUE INDEX users_email_unique ON public.users USING btree (email);
-- INDEX: users_unique
CREATE UNIQUE INDEX users_unique ON public.users USING btree (okta_id);
-- INDEX: users_username_lower_idx
CREATE UNIQUE INDEX users_username_lower_idx ON public.users USING btree (lower((username)::text));
-- INDEX: idx_vendor_agreement_approvals_agreement_id
CREATE INDEX idx_vendor_agreement_approvals_agreement_id ON public.vendor_agreement_approvals USING btree (agreement_id);
-- INDEX: idx_vendor_agreement_approvals_approver
CREATE INDEX idx_vendor_agreement_approvals_approver ON public.vendor_agreement_approvals USING btree (approver_user_id);
-- INDEX: idx_vendor_agreement_changes_agreement_id
CREATE INDEX idx_vendor_agreement_changes_agreement_id ON public.vendor_agreement_changes USING btree (agreement_id);
-- INDEX: idx_vendor_agreement_changes_changed_by
CREATE INDEX idx_vendor_agreement_changes_changed_by ON public.vendor_agreement_changes USING btree (changed_by);
-- INDEX: idx_vendor_agreement_documents_agreement
CREATE INDEX idx_vendor_agreement_documents_agreement ON public.vendor_agreement_documents USING btree (agreement_id);
-- INDEX: idx_vendor_agreement_documents_approval
CREATE INDEX idx_vendor_agreement_documents_approval ON public.vendor_agreement_documents USING btree (approval_id);
-- INDEX: idx_file_schemas_column_metadata
CREATE INDEX idx_file_schemas_column_metadata ON public.vendor_agreement_file_schemas USING gin (column_metadata);
-- INDEX: idx_file_schemas_quality_rules
CREATE INDEX idx_file_schemas_quality_rules ON public.vendor_agreement_file_schemas USING gin (quality_rule_ids);
-- INDEX: idx_vendor_agreement_file_schemas_agreement_id
CREATE INDEX idx_vendor_agreement_file_schemas_agreement_id ON public.vendor_agreement_file_schemas USING btree (vendor_agreement_id);
-- INDEX: idx_vendor_agreement_file_schemas_priority
CREATE INDEX idx_vendor_agreement_file_schemas_priority ON public.vendor_agreement_file_schemas USING btree (vendor_agreement_id, priority, is_active);
-- INDEX: idx_vendor_agreements_agreement_code
CREATE INDEX idx_vendor_agreements_agreement_code ON public.vendor_agreements USING btree (agreement_code);
-- INDEX: idx_vendor_agreements_approval_status
CREATE INDEX idx_vendor_agreements_approval_status ON public.vendor_agreements USING btree (approval_status);
-- INDEX: idx_vendor_agreements_connection_id
CREATE INDEX idx_vendor_agreements_connection_id ON public.vendor_agreements USING btree (vendor_connection_id);
-- INDEX: idx_vendor_agreements_file_owner
CREATE INDEX idx_vendor_agreements_file_owner ON public.vendor_agreements USING btree (file_owner_user_id);
-- INDEX: idx_vendor_agreements_governance_manager
CREATE INDEX idx_vendor_agreements_governance_manager ON public.vendor_agreements USING btree (governance_manager_user_id);
-- INDEX: idx_vendor_agreements_project_id
CREATE INDEX idx_vendor_agreements_project_id ON public.vendor_agreements USING btree (project_id);
-- INDEX: idx_vendor_agreements_sla_enabled
CREATE INDEX idx_vendor_agreements_sla_enabled ON public.vendor_agreements USING btree (sla_enabled) WHERE (sla_enabled = true);
-- INDEX: idx_vendor_agreements_stakeholder_groups
CREATE INDEX idx_vendor_agreements_stakeholder_groups ON public.vendor_agreements USING gin (additional_stakeholder_group_ids);
-- INDEX: idx_vendor_agreements_stakeholder_users
CREATE INDEX idx_vendor_agreements_stakeholder_users ON public.vendor_agreements USING gin (additional_stakeholder_user_ids);
-- INDEX: idx_vendor_agreements_sub_project_id
CREATE INDEX idx_vendor_agreements_sub_project_id ON public.vendor_agreements USING btree (sub_project_id);
-- INDEX: idx_vendor_agreements_vendor_id
CREATE INDEX idx_vendor_agreements_vendor_id ON public.vendor_agreements USING btree (vendor_id);
-- INDEX: unique_agreement_code
CREATE UNIQUE INDEX unique_agreement_code ON public.vendor_agreements USING btree (agreement_code);
-- INDEX: idx_vendor_file_profiling_connection_id
CREATE INDEX idx_vendor_file_profiling_connection_id ON public.vendor_file_profiling_results USING btree (connection_id);
-- INDEX: idx_vendor_file_profiling_file_id
CREATE INDEX idx_vendor_file_profiling_file_id ON public.vendor_file_profiling_results USING btree (file_id);
-- INDEX: idx_vendor_file_profiling_profiled_at
CREATE INDEX idx_vendor_file_profiling_profiled_at ON public.vendor_file_profiling_results USING btree (profiled_at DESC);
-- INDEX: idx_vendor_file_profiling_quality_score
CREATE INDEX idx_vendor_file_profiling_quality_score ON public.vendor_file_profiling_results USING btree (quality_score);
-- INDEX: idx_vendor_file_profiling_vendor_id
CREATE INDEX idx_vendor_file_profiling_vendor_id ON public.vendor_file_profiling_results USING btree (vendor_id);
-- INDEX: idx_vendor_profiling_created_at
CREATE INDEX idx_vendor_profiling_created_at ON public.vendor_file_profiling_results USING btree (created_at DESC);
-- INDEX: idx_vendor_profiling_file_id
CREATE INDEX idx_vendor_profiling_file_id ON public.vendor_file_profiling_results USING btree (file_id);
-- INDEX: idx_vendor_profiling_user_id
CREATE INDEX idx_vendor_profiling_user_id ON public.vendor_file_profiling_results USING btree (uploaded_by_user_id);
-- INDEX: idx_vendor_profiling_vendor_id
CREATE INDEX idx_vendor_profiling_vendor_id ON public.vendor_file_profiling_results USING btree (vendor_id);
-- INDEX: idx_vendor_sla_violations_agreement_id
CREATE INDEX idx_vendor_sla_violations_agreement_id ON public.vendor_sla_violations USING btree (agreement_id);
-- INDEX: idx_vendor_sla_violations_alert_sent
CREATE INDEX idx_vendor_sla_violations_alert_sent ON public.vendor_sla_violations USING btree (alert_sent) WHERE (alert_sent = false);
-- INDEX: idx_vendor_sla_violations_resolved
CREATE INDEX idx_vendor_sla_violations_resolved ON public.vendor_sla_violations USING btree (resolved) WHERE (resolved = false);
-- INDEX: idx_vendor_users_email
CREATE INDEX idx_vendor_users_email ON public.vendor_users USING btree (email);
-- INDEX: idx_vendor_users_is_active
CREATE INDEX idx_vendor_users_is_active ON public.vendor_users USING btree (is_active);
-- INDEX: idx_vendor_users_vendor_id
CREATE INDEX idx_vendor_users_vendor_id ON public.vendor_users USING btree (vendor_id);
-- INDEX: idx_vendors_project_id
CREATE INDEX idx_vendors_project_id ON public.vendors USING btree (project_id);
-- INDEX: idx_vendors_status
CREATE INDEX idx_vendors_status ON public.vendors USING btree (status);
-- INDEX: idx_vendors_vendor_code
CREATE INDEX idx_vendors_vendor_code ON public.vendors USING btree (vendor_code);
-- INDEX: idx_vendors_vendor_user_id
CREATE INDEX idx_vendors_vendor_user_id ON public.vendors USING btree (vendor_user_id);
-- INDEX: unique_vendor_code
CREATE UNIQUE INDEX unique_vendor_code ON public.vendors USING btree (vendor_code);
-- INDEX: idx_visual_lineage_graphs_created_by
CREATE INDEX idx_visual_lineage_graphs_created_by ON public.visual_lineage_graphs USING btree (created_by);
-- INDEX: idx_visual_lineage_graphs_is_active
CREATE INDEX idx_visual_lineage_graphs_is_active ON public.visual_lineage_graphs USING btree (is_active);
-- INDEX: idx_visual_lineage_graphs_project
CREATE INDEX idx_visual_lineage_graphs_project ON public.visual_lineage_graphs USING btree (project_id);
-- INDEX: idx_visual_mapping_defs_active
CREATE INDEX idx_visual_mapping_defs_active ON public.visual_mapping_defs USING btree (is_active);
-- INDEX: idx_visual_mapping_defs_project
CREATE INDEX idx_visual_mapping_defs_project ON public.visual_mapping_defs USING btree (project_id);
-- INDEX: idx_visual_mapping_edges_mapping
CREATE INDEX idx_visual_mapping_edges_mapping ON public.visual_mapping_edges USING btree (mapping_id);
-- INDEX: visual_mapping_edges_mapping_id_edge_id_key
CREATE UNIQUE INDEX visual_mapping_edges_mapping_id_edge_id_key ON public.visual_mapping_edges USING btree (mapping_id, edge_id);
-- INDEX: idx_visual_mapping_exec_logs_exec_id
CREATE INDEX idx_visual_mapping_exec_logs_exec_id ON public.visual_mapping_execution_logs USING btree (execution_id);
-- INDEX: idx_visual_mapping_exec_logs_mapping
CREATE INDEX idx_visual_mapping_exec_logs_mapping ON public.visual_mapping_execution_logs USING btree (mapping_id);
-- INDEX: idx_visual_mapping_exec_logs_started
CREATE INDEX idx_visual_mapping_exec_logs_started ON public.visual_mapping_execution_logs USING btree (started_at DESC);
-- INDEX: idx_visual_mapping_executions_mapping
CREATE INDEX idx_visual_mapping_executions_mapping ON public.visual_mapping_executions USING btree (mapping_id);
-- INDEX: idx_visual_mapping_executions_status
CREATE INDEX idx_visual_mapping_executions_status ON public.visual_mapping_executions USING btree (status);
-- INDEX: visual_mapping_executions_execution_id_key
CREATE UNIQUE INDEX visual_mapping_executions_execution_id_key ON public.visual_mapping_executions USING btree (execution_id);
-- INDEX: idx_visual_mapping_nodes_mapping
CREATE INDEX idx_visual_mapping_nodes_mapping ON public.visual_mapping_nodes USING btree (mapping_id);
-- INDEX: visual_mapping_nodes_mapping_id_node_id_key
CREATE UNIQUE INDEX visual_mapping_nodes_mapping_id_node_id_key ON public.visual_mapping_nodes USING btree (mapping_id, node_id);
-- INDEX: idx_visual_workflow_exec_logs_exec_id
CREATE INDEX idx_visual_workflow_exec_logs_exec_id ON public.visual_workflow_execution_logs USING btree (execution_id);
-- INDEX: idx_visual_workflow_execution_logs_started_at
CREATE INDEX idx_visual_workflow_execution_logs_started_at ON public.visual_workflow_execution_logs USING btree (started_at DESC);
-- INDEX: idx_visual_workflow_execution_logs_workflow_id
CREATE INDEX idx_visual_workflow_execution_logs_workflow_id ON public.visual_workflow_execution_logs USING btree (workflow_id);
-- INDEX: idx_visual_workflow_executions_execution_id
CREATE INDEX idx_visual_workflow_executions_execution_id ON public.visual_workflow_executions USING btree (execution_id);
-- INDEX: idx_visual_workflow_executions_status
CREATE INDEX idx_visual_workflow_executions_status ON public.visual_workflow_executions USING btree (status);
-- INDEX: idx_visual_workflow_executions_triggered_by
CREATE INDEX idx_visual_workflow_executions_triggered_by ON public.visual_workflow_executions USING btree (triggered_by);
-- INDEX: idx_visual_workflow_executions_workflow_id
CREATE INDEX idx_visual_workflow_executions_workflow_id ON public.visual_workflow_executions USING btree (workflow_id);
-- INDEX: visual_workflow_executions_execution_id_key
CREATE UNIQUE INDEX visual_workflow_executions_execution_id_key ON public.visual_workflow_executions USING btree (execution_id);
-- INDEX: idx_visual_workflows_created_by
CREATE INDEX idx_visual_workflows_created_by ON public.visual_workflows USING btree (created_by);
-- INDEX: idx_visual_workflows_is_active
CREATE INDEX idx_visual_workflows_is_active ON public.visual_workflows USING btree (is_active);
-- INDEX: idx_visual_workflows_project_id
CREATE INDEX idx_visual_workflows_project_id ON public.visual_workflows USING btree (project_id);
-- INDEX: idx_visual_workflows_sub_project_id
CREATE INDEX idx_visual_workflows_sub_project_id ON public.visual_workflows USING btree (sub_project_id);
-- INDEX: idx_workflow_executions_project_id
CREATE INDEX idx_workflow_executions_project_id ON public.workflow_executions USING btree (project_id);
-- INDEX: idx_workflow_executions_workflow_id
CREATE INDEX idx_workflow_executions_workflow_id ON public.workflow_executions USING btree (workflow_id);
-- INDEX: idx_workflow_steps_depends_on
CREATE INDEX idx_workflow_steps_depends_on ON public.workflow_steps USING btree (depends_on);
-- INDEX: idx_workflow_steps_project_id
CREATE INDEX idx_workflow_steps_project_id ON public.workflow_steps USING btree (project_id);
-- INDEX: idx_workflow_steps_workflow_id
CREATE INDEX idx_workflow_steps_workflow_id ON public.workflow_steps USING btree (workflow_id);
