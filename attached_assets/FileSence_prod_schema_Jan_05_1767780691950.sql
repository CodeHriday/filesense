-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION pg_database_owner;

COMMENT ON SCHEMA public IS 'standard public schema';

-- DROP TYPE public."file_failure_reason";

CREATE TYPE public."file_failure_reason" AS ENUM (
	'virus_detected',
	'password_missing',
	'unsupported_encoding',
	'conversion_failed',
	'extraction_failed',
	'clamav_unavailable',
	'malformed_file',
	'schema_validation_failed');

-- DROP TYPE public."job_failure_reason";

CREATE TYPE public."job_failure_reason" AS ENUM (
	'conversion_failed',
	'unsupported_encoding',
	'schema_mismatch',
	'source_file_missing',
	'target_write_failed',
	'transformation_error');

-- DROP SEQUENCE public.access_group_roles_id_seq;

CREATE SEQUENCE public.access_group_roles_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.access_group_roles_id_seq1;

CREATE SEQUENCE public.access_group_roles_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.access_groups_id_seq;

CREATE SEQUENCE public.access_groups_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.access_groups_id_seq1;

CREATE SEQUENCE public.access_groups_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_aggregation_id_seq;

CREATE SEQUENCE public.alert_aggregation_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_aggregation_id_seq1;

CREATE SEQUENCE public.alert_aggregation_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_attachments_id_seq;

CREATE SEQUENCE public.alert_attachments_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_attachments_id_seq1;

CREATE SEQUENCE public.alert_attachments_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_events_id_seq;

CREATE SEQUENCE public.alert_events_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_events_id_seq1;

CREATE SEQUENCE public.alert_events_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_history_id_seq;

CREATE SEQUENCE public.alert_history_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_history_id_seq1;

CREATE SEQUENCE public.alert_history_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_policies_id_seq;

CREATE SEQUENCE public.alert_policies_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_policies_id_seq1;

CREATE SEQUENCE public.alert_policies_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_policy_recipients_id_seq;

CREATE SEQUENCE public.alert_policy_recipients_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_policy_recipients_id_seq1;

CREATE SEQUENCE public.alert_policy_recipients_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_rules_id_seq;

CREATE SEQUENCE public.alert_rules_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_rules_id_seq1;

CREATE SEQUENCE public.alert_rules_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_runs_id_seq;

CREATE SEQUENCE public.alert_runs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.alert_runs_id_seq1;

CREATE SEQUENCE public.alert_runs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.allowed_email_domains_id_seq;

CREATE SEQUENCE public.allowed_email_domains_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.allowed_email_domains_id_seq1;

CREATE SEQUENCE public.allowed_email_domains_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.anomalies_id_seq;

CREATE SEQUENCE public.anomalies_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.anomalies_id_seq1;

CREATE SEQUENCE public.anomalies_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.api_tokens_id_seq;

CREATE SEQUENCE public.api_tokens_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.api_tokens_id_seq1;

CREATE SEQUENCE public.api_tokens_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.app_settings_id_seq;

CREATE SEQUENCE public.app_settings_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.app_settings_id_seq1;

CREATE SEQUENCE public.app_settings_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.archive_extractions_id_seq;

CREATE SEQUENCE public.archive_extractions_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.archive_extractions_id_seq1;

CREATE SEQUENCE public.archive_extractions_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.archive_members_id_seq;

CREATE SEQUENCE public.archive_members_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.archive_members_id_seq1;

CREATE SEQUENCE public.archive_members_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.archived_files_id_seq;

CREATE SEQUENCE public.archived_files_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.archived_files_id_seq1;

CREATE SEQUENCE public.archived_files_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.attribute_definitions_id_seq;

CREATE SEQUENCE public.attribute_definitions_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.attribute_definitions_id_seq1;

CREATE SEQUENCE public.attribute_definitions_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.audit_ledger_id_seq;

CREATE SEQUENCE public.audit_ledger_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.audit_ledger_id_seq1;

CREATE SEQUENCE public.audit_ledger_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.audit_ledger_verification_id_seq;

CREATE SEQUENCE public.audit_ledger_verification_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.audit_ledger_verification_id_seq1;

CREATE SEQUENCE public.audit_ledger_verification_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.audit_log_audit_id_seq;

CREATE SEQUENCE public.audit_log_audit_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.audit_log_audit_id_seq1;

CREATE SEQUENCE public.audit_log_audit_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.audit_retention_settings_id_seq;

CREATE SEQUENCE public.audit_retention_settings_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.audit_retention_settings_id_seq1;

CREATE SEQUENCE public.audit_retention_settings_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.bulk_profiling_files_id_seq;

CREATE SEQUENCE public.bulk_profiling_files_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.bulk_profiling_files_id_seq1;

CREATE SEQUENCE public.bulk_profiling_files_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.business_processes_id_seq;

CREATE SEQUENCE public.business_processes_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.business_processes_id_seq1;

CREATE SEQUENCE public.business_processes_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.column_governance_tag_assignments_assignment_id_seq;

CREATE SEQUENCE public.column_governance_tag_assignments_assignment_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.column_governance_tag_assignments_assignment_id_seq1;

CREATE SEQUENCE public.column_governance_tag_assignments_assignment_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.column_mappings_id_seq;

CREATE SEQUENCE public.column_mappings_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.column_mappings_id_seq1;

CREATE SEQUENCE public.column_mappings_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.column_policy_assignments_assignment_id_seq;

CREATE SEQUENCE public.column_policy_assignments_assignment_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.column_policy_assignments_assignment_id_seq1;

CREATE SEQUENCE public.column_policy_assignments_assignment_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.column_sensitivity_tags_tag_id_seq;

CREATE SEQUENCE public.column_sensitivity_tags_tag_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.column_sensitivity_tags_tag_id_seq1;

CREATE SEQUENCE public.column_sensitivity_tags_tag_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.config_change_history_change_id_seq;

CREATE SEQUENCE public.config_change_history_change_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.config_change_history_change_id_seq1;

CREATE SEQUENCE public.config_change_history_change_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.connections_id_seq;

CREATE SEQUENCE public.connections_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.connections_id_seq1;

CREATE SEQUENCE public.connections_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.data_access_log_access_id_seq;

CREATE SEQUENCE public.data_access_log_access_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.data_access_log_access_id_seq1;

CREATE SEQUENCE public.data_access_log_access_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.dbt_executions_execution_id_seq;

CREATE SEQUENCE public.dbt_executions_execution_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.dbt_executions_execution_id_seq1;

CREATE SEQUENCE public.dbt_executions_execution_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.dbt_models_model_id_seq;

CREATE SEQUENCE public.dbt_models_model_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.dbt_models_model_id_seq1;

CREATE SEQUENCE public.dbt_models_model_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.dlq_jobs_id_seq;

CREATE SEQUENCE public.dlq_jobs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.dlq_jobs_id_seq1;

CREATE SEQUENCE public.dlq_jobs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.drop_location_config_id_seq;

CREATE SEQUENCE public.drop_location_config_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.drop_location_config_id_seq1;

CREATE SEQUENCE public.drop_location_config_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.encrypted_passwords_id_seq;

CREATE SEQUENCE public.encrypted_passwords_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.encrypted_passwords_id_seq1;

CREATE SEQUENCE public.encrypted_passwords_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.execution_audit_audit_id_seq;

CREATE SEQUENCE public.execution_audit_audit_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.execution_audit_audit_id_seq1;

CREATE SEQUENCE public.execution_audit_audit_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_audit_details_id_seq;

CREATE SEQUENCE public.file_audit_details_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_audit_details_id_seq1;

CREATE SEQUENCE public.file_audit_details_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_columns_id_seq;

CREATE SEQUENCE public.file_columns_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_columns_id_seq1;

CREATE SEQUENCE public.file_columns_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_errors_id_seq;

CREATE SEQUENCE public.file_errors_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_errors_id_seq1;

CREATE SEQUENCE public.file_errors_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_history_id_seq;

CREATE SEQUENCE public.file_history_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_history_id_seq1;

CREATE SEQUENCE public.file_history_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_lineage_id_seq;

CREATE SEQUENCE public.file_lineage_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_lineage_id_seq1;

CREATE SEQUENCE public.file_lineage_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_mappings_id_seq;

CREATE SEQUENCE public.file_mappings_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_ownership_ownership_id_seq;

CREATE SEQUENCE public.file_ownership_ownership_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_ownership_ownership_id_seq1;

CREATE SEQUENCE public.file_ownership_ownership_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_pattern_metrics_id_seq;

CREATE SEQUENCE public.file_pattern_metrics_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_pattern_metrics_id_seq1;

CREATE SEQUENCE public.file_pattern_metrics_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_policy_assignments_assignment_id_seq;

CREATE SEQUENCE public.file_policy_assignments_assignment_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_policy_assignments_assignment_id_seq1;

CREATE SEQUENCE public.file_policy_assignments_assignment_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_preview_data_preview_id_seq;

CREATE SEQUENCE public.file_preview_data_preview_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_preview_data_preview_id_seq1;

CREATE SEQUENCE public.file_preview_data_preview_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_processing_artifacts_id_seq;

CREATE SEQUENCE public.file_processing_artifacts_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_processing_artifacts_id_seq1;

CREATE SEQUENCE public.file_processing_artifacts_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_quality_checks_id_seq;

CREATE SEQUENCE public.file_quality_checks_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_quality_checks_id_seq1;

CREATE SEQUENCE public.file_quality_checks_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_quality_rules_id_seq;

CREATE SEQUENCE public.file_quality_rules_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_quality_rules_id_seq1;

CREATE SEQUENCE public.file_quality_rules_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_restorations_id_seq;

CREATE SEQUENCE public.file_restorations_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_restorations_id_seq1;

CREATE SEQUENCE public.file_restorations_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_schedules_id_seq;

CREATE SEQUENCE public.file_schedules_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_schedules_id_seq1;

CREATE SEQUENCE public.file_schedules_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_schema_details_id_seq;

CREATE SEQUENCE public.file_schema_details_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_schema_details_id_seq1;

CREATE SEQUENCE public.file_schema_details_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_schemas_id_seq;

CREATE SEQUENCE public.file_schemas_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_schemas_id_seq1;

CREATE SEQUENCE public.file_schemas_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_tag_assignments_assignment_id_seq;

CREATE SEQUENCE public.file_tag_assignments_assignment_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.file_tag_assignments_assignment_id_seq1;

CREATE SEQUENCE public.file_tag_assignments_assignment_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.files_id_seq;

CREATE SEQUENCE public.files_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.files_id_seq1;

CREATE SEQUENCE public.files_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.fixed_width_schemas_id_seq;

CREATE SEQUENCE public.fixed_width_schemas_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.fixed_width_schemas_id_seq1;

CREATE SEQUENCE public.fixed_width_schemas_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.frontend_audit_log_audit_id_seq;

CREATE SEQUENCE public.frontend_audit_log_audit_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.frontend_audit_log_audit_id_seq1;

CREATE SEQUENCE public.frontend_audit_log_audit_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.groups_id_seq;

CREATE SEQUENCE public.groups_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.groups_id_seq1;

CREATE SEQUENCE public.groups_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.idempotency_keys_id_seq;

CREATE SEQUENCE public.idempotency_keys_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.idempotency_keys_id_seq1;

CREATE SEQUENCE public.idempotency_keys_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.job_dependencies_dependency_id_seq;

CREATE SEQUENCE public.job_dependencies_dependency_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.job_dependencies_dependency_id_seq1;

CREATE SEQUENCE public.job_dependencies_dependency_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.job_group_dependencies_group_dependency_id_seq;

CREATE SEQUENCE public.job_group_dependencies_group_dependency_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.job_group_dependencies_group_dependency_id_seq1;

CREATE SEQUENCE public.job_group_dependencies_group_dependency_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.job_group_schedules_group_schedule_id_seq;

CREATE SEQUENCE public.job_group_schedules_group_schedule_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.job_group_schedules_group_schedule_id_seq1;

CREATE SEQUENCE public.job_group_schedules_group_schedule_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.job_history_id_seq;

CREATE SEQUENCE public.job_history_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.job_history_id_seq1;

CREATE SEQUENCE public.job_history_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.job_runs_id_seq;

CREATE SEQUENCE public.job_runs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.job_runs_id_seq1;

CREATE SEQUENCE public.job_runs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.job_schedules_id_seq;

CREATE SEQUENCE public.job_schedules_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.job_schedules_id_seq1;

CREATE SEQUENCE public.job_schedules_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.jobs_id_seq;

CREATE SEQUENCE public.jobs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.jobs_id_seq1;

CREATE SEQUENCE public.jobs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.lineage_views_id_seq;

CREATE SEQUENCE public.lineage_views_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.lineage_views_id_seq1;

CREATE SEQUENCE public.lineage_views_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.logical_file_groups_id_seq;

CREATE SEQUENCE public.logical_file_groups_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.logical_file_groups_id_seq1;

CREATE SEQUENCE public.logical_file_groups_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.mapping_group_executions_id_seq;

CREATE SEQUENCE public.mapping_group_executions_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.mapping_group_executions_id_seq1;

CREATE SEQUENCE public.mapping_group_executions_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.mapping_group_members_id_seq;

CREATE SEQUENCE public.mapping_group_members_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.mapping_group_members_id_seq1;

CREATE SEQUENCE public.mapping_group_members_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.mapping_groups_id_seq;

CREATE SEQUENCE public.mapping_groups_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.mapping_groups_id_seq1;

CREATE SEQUENCE public.mapping_groups_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.mapping_job_errors_id_seq;

CREATE SEQUENCE public.mapping_job_errors_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.mapping_job_errors_id_seq1;

CREATE SEQUENCE public.mapping_job_errors_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.migrations_id_seq;

CREATE SEQUENCE public.migrations_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.migrations_id_seq1;

CREATE SEQUENCE public.migrations_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.n_step_workflow_assets_id_seq;

CREATE SEQUENCE public.n_step_workflow_assets_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.n_step_workflow_assets_id_seq1;

CREATE SEQUENCE public.n_step_workflow_assets_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.n_step_workflow_run_steps_id_seq;

CREATE SEQUENCE public.n_step_workflow_run_steps_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.n_step_workflow_run_steps_id_seq1;

CREATE SEQUENCE public.n_step_workflow_run_steps_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.n_step_workflow_runs_id_seq;

CREATE SEQUENCE public.n_step_workflow_runs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.n_step_workflow_runs_id_seq1;

CREATE SEQUENCE public.n_step_workflow_runs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.n_step_workflow_steps_id_seq;

CREATE SEQUENCE public.n_step_workflow_steps_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.n_step_workflow_steps_id_seq1;

CREATE SEQUENCE public.n_step_workflow_steps_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.n_step_workflows_id_seq;

CREATE SEQUENCE public.n_step_workflows_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.n_step_workflows_id_seq1;

CREATE SEQUENCE public.n_step_workflows_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.notifications_id_seq;

CREATE SEQUENCE public.notifications_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.notifications_id_seq1;

CREATE SEQUENCE public.notifications_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.password_reset_requests_id_seq;

CREATE SEQUENCE public.password_reset_requests_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.password_reset_requests_id_seq1;

CREATE SEQUENCE public.password_reset_requests_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.permissions_id_seq;

CREATE SEQUENCE public.permissions_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.permissions_id_seq1;

CREATE SEQUENCE public.permissions_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.processing_events_id_seq;

CREATE SEQUENCE public.processing_events_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.processing_events_id_seq1;

CREATE SEQUENCE public.processing_events_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.profiling_metrics_id_seq;

CREATE SEQUENCE public.profiling_metrics_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.profiling_metrics_id_seq1;

CREATE SEQUENCE public.profiling_metrics_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.projects_id_seq;

CREATE SEQUENCE public.projects_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.projects_id_seq1;

CREATE SEQUENCE public.projects_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.quality_rule_configurations_id_seq;

CREATE SEQUENCE public.quality_rule_configurations_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.quality_rule_configurations_id_seq1;

CREATE SEQUENCE public.quality_rule_configurations_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.quality_rule_violations_id_seq;

CREATE SEQUENCE public.quality_rule_violations_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.quality_rule_violations_id_seq1;

CREATE SEQUENCE public.quality_rule_violations_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.quality_rules_id_seq;

CREATE SEQUENCE public.quality_rules_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.quality_rules_id_seq1;

CREATE SEQUENCE public.quality_rules_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.rbac_policies_id_seq;

CREATE SEQUENCE public.rbac_policies_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.rbac_policies_id_seq1;

CREATE SEQUENCE public.rbac_policies_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.resource_attributes_id_seq;

CREATE SEQUENCE public.resource_attributes_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.resource_attributes_id_seq1;

CREATE SEQUENCE public.resource_attributes_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.retention_policies_id_seq;

CREATE SEQUENCE public.retention_policies_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.retention_policies_id_seq1;

CREATE SEQUENCE public.retention_policies_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.retention_policy_runs_id_seq;

CREATE SEQUENCE public.retention_policy_runs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.retention_policy_runs_id_seq1;

CREATE SEQUENCE public.retention_policy_runs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.roles_id_seq;

CREATE SEQUENCE public.roles_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.roles_id_seq1;

CREATE SEQUENCE public.roles_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.schedules_id_seq;

CREATE SEQUENCE public.schedules_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.schedules_id_seq1;

CREATE SEQUENCE public.schedules_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.schema_migrations_id_seq;

CREATE SEQUENCE public.schema_migrations_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.schema_migrations_id_seq1;

CREATE SEQUENCE public.schema_migrations_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.schema_validation_job_files_id_seq;

CREATE SEQUENCE public.schema_validation_job_files_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.schema_validation_job_files_id_seq1;

CREATE SEQUENCE public.schema_validation_job_files_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.schema_validation_jobs_id_seq;

CREATE SEQUENCE public.schema_validation_jobs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.schema_validation_jobs_id_seq1;

CREATE SEQUENCE public.schema_validation_jobs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.scim_configurations_id_seq;

CREATE SEQUENCE public.scim_configurations_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.scim_configurations_id_seq1;

CREATE SEQUENCE public.scim_configurations_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.scim_resource_mappings_id_seq;

CREATE SEQUENCE public.scim_resource_mappings_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.scim_resource_mappings_id_seq1;

CREATE SEQUENCE public.scim_resource_mappings_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.scim_sync_logs_id_seq;

CREATE SEQUENCE public.scim_sync_logs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.scim_sync_logs_id_seq1;

CREATE SEQUENCE public.scim_sync_logs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.security_audit_log_security_audit_id_seq;

CREATE SEQUENCE public.security_audit_log_security_audit_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.security_audit_log_security_audit_id_seq1;

CREATE SEQUENCE public.security_audit_log_security_audit_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.sub_project_access_groups_id_seq;

CREATE SEQUENCE public.sub_project_access_groups_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.sub_project_access_groups_id_seq1;

CREATE SEQUENCE public.sub_project_access_groups_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.sub_project_members_id_seq;

CREATE SEQUENCE public.sub_project_members_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.sub_project_members_id_seq1;

CREATE SEQUENCE public.sub_project_members_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.tag_permissions_id_seq;

CREATE SEQUENCE public.tag_permissions_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.tag_permissions_id_seq1;

CREATE SEQUENCE public.tag_permissions_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transform_connections_id_seq;

CREATE SEQUENCE public.transform_connections_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transform_connections_id_seq1;

CREATE SEQUENCE public.transform_connections_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformation_executions_id_seq;

CREATE SEQUENCE public.transformation_executions_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformation_executions_id_seq1;

CREATE SEQUENCE public.transformation_executions_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformation_jobs_id_seq;

CREATE SEQUENCE public.transformation_jobs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformation_jobs_id_seq1;

CREATE SEQUENCE public.transformation_jobs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformation_lineage_id_seq;

CREATE SEQUENCE public.transformation_lineage_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformation_lineage_id_seq1;

CREATE SEQUENCE public.transformation_lineage_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformation_logs_id_seq;

CREATE SEQUENCE public.transformation_logs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformation_logs_id_seq1;

CREATE SEQUENCE public.transformation_logs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformation_mappings_id_seq;

CREATE SEQUENCE public.transformation_mappings_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformation_mappings_id_seq1;

CREATE SEQUENCE public.transformation_mappings_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformation_outputs_id_seq;

CREATE SEQUENCE public.transformation_outputs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformation_outputs_id_seq1;

CREATE SEQUENCE public.transformation_outputs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformation_quality_rules_id_seq;

CREATE SEQUENCE public.transformation_quality_rules_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformation_quality_rules_id_seq1;

CREATE SEQUENCE public.transformation_quality_rules_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformations_id_seq;

CREATE SEQUENCE public.transformations_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transformations_id_seq1;

CREATE SEQUENCE public.transformations_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.upload_batches_id_seq;

CREATE SEQUENCE public.upload_batches_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.upload_batches_id_seq1;

CREATE SEQUENCE public.upload_batches_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.upload_file_records_id_seq;

CREATE SEQUENCE public.upload_file_records_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.upload_file_records_id_seq1;

CREATE SEQUENCE public.upload_file_records_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.upload_files_id_seq;

CREATE SEQUENCE public.upload_files_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.upload_files_id_seq1;

CREATE SEQUENCE public.upload_files_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.user_attributes_id_seq;

CREATE SEQUENCE public.user_attributes_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.user_attributes_id_seq1;

CREATE SEQUENCE public.user_attributes_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.user_badges_id_seq;

CREATE SEQUENCE public.user_badges_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.user_badges_id_seq1;

CREATE SEQUENCE public.user_badges_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.user_dashboard_settings_id_seq;

CREATE SEQUENCE public.user_dashboard_settings_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.user_dashboard_settings_id_seq1;

CREATE SEQUENCE public.user_dashboard_settings_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.user_sessions_id_seq;

CREATE SEQUENCE public.user_sessions_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.user_sessions_id_seq1;

CREATE SEQUENCE public.user_sessions_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.users_id_seq;

CREATE SEQUENCE public.users_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.users_id_seq1;

CREATE SEQUENCE public.users_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_agreement_approvals_id_seq;

CREATE SEQUENCE public.vendor_agreement_approvals_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_agreement_approvals_id_seq1;

CREATE SEQUENCE public.vendor_agreement_approvals_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_agreement_changes_id_seq;

CREATE SEQUENCE public.vendor_agreement_changes_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_agreement_changes_id_seq1;

CREATE SEQUENCE public.vendor_agreement_changes_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_agreement_documents_id_seq;

CREATE SEQUENCE public.vendor_agreement_documents_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_agreement_documents_id_seq1;

CREATE SEQUENCE public.vendor_agreement_documents_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_agreement_file_schemas_id_seq;

CREATE SEQUENCE public.vendor_agreement_file_schemas_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_agreement_file_schemas_id_seq1;

CREATE SEQUENCE public.vendor_agreement_file_schemas_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_agreements_id_seq;

CREATE SEQUENCE public.vendor_agreements_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_agreements_id_seq1;

CREATE SEQUENCE public.vendor_agreements_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_file_profiling_results_id_seq;

CREATE SEQUENCE public.vendor_file_profiling_results_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_file_profiling_results_id_seq1;

CREATE SEQUENCE public.vendor_file_profiling_results_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_sla_violations_id_seq;

CREATE SEQUENCE public.vendor_sla_violations_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_sla_violations_id_seq1;

CREATE SEQUENCE public.vendor_sla_violations_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_users_id_seq;

CREATE SEQUENCE public.vendor_users_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendor_users_id_seq1;

CREATE SEQUENCE public.vendor_users_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendors_id_seq;

CREATE SEQUENCE public.vendors_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.vendors_id_seq1;

CREATE SEQUENCE public.vendors_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_lineage_graphs_id_seq;

CREATE SEQUENCE public.visual_lineage_graphs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_lineage_graphs_id_seq1;

CREATE SEQUENCE public.visual_lineage_graphs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_mapping_defs_id_seq;

CREATE SEQUENCE public.visual_mapping_defs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_mapping_defs_id_seq1;

CREATE SEQUENCE public.visual_mapping_defs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_mapping_edges_id_seq;

CREATE SEQUENCE public.visual_mapping_edges_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_mapping_edges_id_seq1;

CREATE SEQUENCE public.visual_mapping_edges_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_mapping_execution_logs_id_seq;

CREATE SEQUENCE public.visual_mapping_execution_logs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_mapping_execution_logs_id_seq1;

CREATE SEQUENCE public.visual_mapping_execution_logs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_mapping_executions_id_seq;

CREATE SEQUENCE public.visual_mapping_executions_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_mapping_executions_id_seq1;

CREATE SEQUENCE public.visual_mapping_executions_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_mapping_nodes_id_seq;

CREATE SEQUENCE public.visual_mapping_nodes_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_mapping_nodes_id_seq1;

CREATE SEQUENCE public.visual_mapping_nodes_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_workflow_execution_logs_id_seq;

CREATE SEQUENCE public.visual_workflow_execution_logs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_workflow_execution_logs_id_seq1;

CREATE SEQUENCE public.visual_workflow_execution_logs_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_workflow_executions_id_seq;

CREATE SEQUENCE public.visual_workflow_executions_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_workflow_executions_id_seq1;

CREATE SEQUENCE public.visual_workflow_executions_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_workflows_id_seq;

CREATE SEQUENCE public.visual_workflows_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.visual_workflows_id_seq1;

CREATE SEQUENCE public.visual_workflows_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.workflow_executions_id_seq;

CREATE SEQUENCE public.workflow_executions_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.workflow_executions_id_seq1;

CREATE SEQUENCE public.workflow_executions_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.workflow_steps_id_seq;

CREATE SEQUENCE public.workflow_steps_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.workflow_steps_id_seq1;

CREATE SEQUENCE public.workflow_steps_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;-- public.alert_rules definition

-- Drop table

-- DROP TABLE public.alert_rules;

CREATE TABLE public.alert_rules (
	id serial4 NOT NULL,
	rule_name varchar(255) NOT NULL,
	rule_type varchar(50) NOT NULL,
	rule_condition varchar(50) NOT NULL,
	rule_value text NOT NULL,
	severity varchar(20) NOT NULL,
	enabled bool DEFAULT true NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT alert_rules_pkey PRIMARY KEY (id)
);


-- public.anomalies definition

-- Drop table

-- DROP TABLE public.anomalies;

CREATE TABLE public.anomalies (
	id serial4 NOT NULL,
	anomaly_id varchar(255) NOT NULL,
	file_id varchar(255) NULL,
	file_name varchar(500) NULL,
	mapping_id varchar(255) NULL,
	job_id varchar(255) NULL,
	anomaly_type varchar(100) NOT NULL,
	severity varchar(20) NOT NULL,
	title varchar(500) NOT NULL,
	description text NULL,
	anomaly_details jsonb NULL,
	expected_value text NULL,
	actual_value text NULL,
	deviation_percentage numeric(10, 2) NULL,
	status varchar(50) DEFAULT 'open'::character varying NULL,
	resolved_at timestamp NULL,
	resolved_by varchar(255) NULL,
	resolution_notes text NULL,
	detected_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT anomalies_anomaly_id_key UNIQUE (anomaly_id),
	CONSTRAINT anomalies_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_anomalies_detected ON public.anomalies USING btree (detected_at DESC);
CREATE INDEX idx_anomalies_file ON public.anomalies USING btree (file_id);
CREATE INDEX idx_anomalies_job ON public.anomalies USING btree (job_id);
CREATE INDEX idx_anomalies_mapping ON public.anomalies USING btree (mapping_id);
CREATE INDEX idx_anomalies_severity_detected ON public.anomalies USING btree (severity, detected_at DESC);
CREATE INDEX idx_anomalies_status ON public.anomalies USING btree (status);
CREATE INDEX idx_anomalies_type ON public.anomalies USING btree (anomaly_type);
CREATE INDEX idx_anomalies_type_detected ON public.anomalies USING btree (anomaly_type, detected_at DESC);


-- public.app_settings definition

-- Drop table

-- DROP TABLE public.app_settings;

CREATE TABLE public.app_settings (
	id serial4 NOT NULL,
	setting_key varchar(100) NOT NULL,
	setting_value text NOT NULL,
	description text NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT app_settings_pkey PRIMARY KEY (id),
	CONSTRAINT app_settings_setting_key_key UNIQUE (setting_key)
);
CREATE INDEX idx_app_settings_key ON public.app_settings USING btree (setting_key);


-- public.attribute_definitions definition

-- Drop table

-- DROP TABLE public.attribute_definitions;

CREATE TABLE public.attribute_definitions (
	id serial4 NOT NULL,
	attribute_key varchar(100) NOT NULL,
	display_name varchar(255) NOT NULL,
	description text NULL,
	attribute_type varchar(50) NOT NULL,
	"scope" varchar(50) NOT NULL,
	allowed_values jsonb NULL,
	validation_regex varchar(255) NULL,
	min_value numeric NULL,
	max_value numeric NULL,
	is_required bool DEFAULT false NULL,
	is_system bool DEFAULT false NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT attribute_definitions_attribute_key_key UNIQUE (attribute_key),
	CONSTRAINT attribute_definitions_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_attribute_definitions_scope ON public.attribute_definitions USING btree (scope);
CREATE INDEX idx_attribute_definitions_system ON public.attribute_definitions USING btree (is_system);

-- Table Triggers

create trigger update_attribute_definitions_updated_at before
update
    on
    public.attribute_definitions for each row execute function update_updated_at_column();


-- public.audit_ledger definition

-- Drop table

-- DROP TABLE public.audit_ledger;

CREATE TABLE public.audit_ledger (
	id bigserial NOT NULL,
	entry_id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id varchar(255) DEFAULT 'default'::character varying NULL,
	job_id varchar(255) NULL,
	correlation_id varchar(255) NULL,
	parent_entry_id uuid NULL,
	actor_id varchar(255) NULL,
	actor_email varchar(255) NULL,
	actor_role varchar(100) NULL,
	actor_ip inet NULL,
	action_type varchar(100) NOT NULL,
	action_category varchar(50) DEFAULT 'EXECUTION'::character varying NOT NULL,
	entity_type varchar(100) NULL,
	entity_id varchar(255) NULL,
	entity_name varchar(500) NULL,
	log_level varchar(20) DEFAULT 'INFO'::character varying NOT NULL,
	message text NOT NULL,
	payload jsonb NULL,
	event_timestamp timestamp DEFAULT now() NOT NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	sequence_number int8 NOT NULL, -- Monotonically increasing sequence number per tenant for ordering
	prev_hash varchar(64) NULL, -- SHA-256 hash of the previous record in the chain, NULL for first record
	record_hash varchar(64) NOT NULL, -- SHA-256 hash of this record including prev_hash for tamper detection
	signature text NULL,
	signature_algorithm varchar(50) NULL,
	source_system varchar(100) DEFAULT 'data_observatory'::character varying NULL,
	"version" varchar(20) DEFAULT '1.0'::character varying NULL,
	CONSTRAINT audit_ledger_entry_id_key UNIQUE (entry_id),
	CONSTRAINT audit_ledger_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_audit_ledger_action ON public.audit_ledger USING btree (action_type, event_timestamp DESC);
CREATE INDEX idx_audit_ledger_actor ON public.audit_ledger USING btree (actor_id, event_timestamp DESC);
CREATE INDEX idx_audit_ledger_correlation ON public.audit_ledger USING btree (correlation_id, sequence_number);
CREATE INDEX idx_audit_ledger_entity ON public.audit_ledger USING btree (entity_type, entity_id);
CREATE INDEX idx_audit_ledger_job ON public.audit_ledger USING btree (job_id, sequence_number);
CREATE INDEX idx_audit_ledger_level ON public.audit_ledger USING btree (log_level, event_timestamp DESC);
CREATE INDEX idx_audit_ledger_tenant_seq ON public.audit_ledger USING btree (tenant_id, sequence_number DESC);
CREATE INDEX idx_audit_ledger_timestamp ON public.audit_ledger USING btree (event_timestamp DESC);
COMMENT ON TABLE public.audit_ledger IS 'Immutable audit ledger with cryptographic hash chaining for regulatory compliance. Records cannot be updated or deleted.';

-- Column comments

COMMENT ON COLUMN public.audit_ledger.sequence_number IS 'Monotonically increasing sequence number per tenant for ordering';
COMMENT ON COLUMN public.audit_ledger.prev_hash IS 'SHA-256 hash of the previous record in the chain, NULL for first record';
COMMENT ON COLUMN public.audit_ledger.record_hash IS 'SHA-256 hash of this record including prev_hash for tamper detection';

-- Table Triggers

create trigger audit_ledger_immutable_delete before
delete
    on
    public.audit_ledger for each row execute function prevent_audit_ledger_delete();
create trigger audit_ledger_immutable_update before
update
    on
    public.audit_ledger for each row execute function prevent_audit_ledger_update();


-- public.audit_ledger_sequence definition

-- Drop table

-- DROP TABLE public.audit_ledger_sequence;

CREATE TABLE public.audit_ledger_sequence (
	tenant_id varchar(255) DEFAULT 'default'::character varying NOT NULL,
	current_sequence int8 DEFAULT 0 NOT NULL,
	last_hash varchar(64) NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT audit_ledger_sequence_pkey PRIMARY KEY (tenant_id)
);


-- public.audit_ledger_verification definition

-- Drop table

-- DROP TABLE public.audit_ledger_verification;

CREATE TABLE public.audit_ledger_verification (
	id serial4 NOT NULL,
	verification_id uuid DEFAULT gen_random_uuid() NOT NULL,
	tenant_id varchar(255) DEFAULT 'default'::character varying NOT NULL,
	start_sequence int8 NOT NULL,
	end_sequence int8 NOT NULL,
	status varchar(20) NOT NULL,
	entries_verified int8 DEFAULT 0 NOT NULL,
	entries_failed int8 DEFAULT 0 NOT NULL,
	first_failed_sequence int8 NULL,
	failure_reason text NULL,
	started_at timestamp DEFAULT now() NOT NULL,
	completed_at timestamp NULL,
	duration_ms int8 NULL,
	verified_by varchar(255) NULL,
	created_at timestamp DEFAULT now() NULL,
	CONSTRAINT audit_ledger_verification_pkey PRIMARY KEY (id)
);


-- public.audit_log_archive definition

-- Drop table

-- DROP TABLE public.audit_log_archive;

CREATE TABLE public.audit_log_archive (
	audit_id int8 NOT NULL,
	"timestamp" timestamp NOT NULL,
	user_id varchar(255) NULL,
	user_email varchar(255) NULL,
	user_role varchar(100) NULL,
	ip_address inet NULL,
	session_id varchar(255) NULL,
	action_type varchar(100) NOT NULL,
	entity_type varchar(100) NOT NULL,
	entity_id varchar(255) NOT NULL,
	entity_name varchar(255) NULL,
	operation varchar(50) NULL,
	old_values jsonb NULL,
	new_values jsonb NULL,
	changes jsonb NULL,
	parent_audit_id int8 NULL,
	request_id varchar(255) NULL,
	api_endpoint varchar(255) NULL,
	http_method varchar(10) NULL,
	status varchar(50) NULL,
	error_message text NULL,
	metadata jsonb NULL,
	retention_until timestamp NULL,
	created_at timestamp NULL,
	archived_at timestamp DEFAULT now() NULL,
	CONSTRAINT audit_log_archive_pkey PRIMARY KEY (audit_id)
);
CREATE INDEX idx_audit_log_archive_archived ON public.audit_log_archive USING btree (archived_at DESC);
CREATE INDEX idx_audit_log_archive_timestamp ON public.audit_log_archive USING btree ("timestamp" DESC);
CREATE INDEX idx_audit_log_archive_user ON public.audit_log_archive USING btree (user_id, "timestamp" DESC);


-- public.audit_retention_settings definition

-- Drop table

-- DROP TABLE public.audit_retention_settings;

CREATE TABLE public.audit_retention_settings (
	id serial4 NOT NULL,
	retention_days int4 DEFAULT 30 NOT NULL,
	auto_archive_enabled bool DEFAULT true NULL,
	auto_delete_enabled bool DEFAULT false NULL,
	last_archive_run timestamp NULL,
	last_cleanup_run timestamp NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT audit_retention_settings_pkey PRIMARY KEY (id)
);


-- public.config_change_history definition

-- Drop table

-- DROP TABLE public.config_change_history;

CREATE TABLE public.config_change_history (
	change_id bigserial NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	changed_by_user varchar(255) NOT NULL,
	changed_by_role varchar(100) NULL,
	config_type varchar(100) NULL,
	entity_type varchar(100) NULL,
	entity_id varchar(255) NULL,
	field_name varchar(255) NULL,
	old_value text NULL,
	new_value text NULL,
	change_reason text NULL,
	ticket_reference varchar(100) NULL,
	requires_approval bool DEFAULT false NULL,
	approved_by varchar(255) NULL,
	approved_at timestamp NULL,
	can_rollback bool DEFAULT true NULL,
	rollback_script text NULL,
	metadata jsonb NULL,
	created_at timestamp DEFAULT now() NULL,
	CONSTRAINT config_change_history_pkey PRIMARY KEY (change_id)
);
CREATE INDEX idx_config_change_entity ON public.config_change_history USING btree (entity_type, entity_id, "timestamp" DESC);
CREATE INDEX idx_config_change_timestamp ON public.config_change_history USING btree ("timestamp" DESC);
CREATE INDEX idx_config_change_user ON public.config_change_history USING btree (changed_by_user, "timestamp" DESC);


-- public.config_change_history_archive definition

-- Drop table

-- DROP TABLE public.config_change_history_archive;

CREATE TABLE public.config_change_history_archive (
	change_id int8 NOT NULL,
	"timestamp" timestamp NOT NULL,
	changed_by_user varchar(255) NOT NULL,
	changed_by_role varchar(100) NULL,
	config_type varchar(100) NULL,
	entity_type varchar(100) NULL,
	entity_id varchar(255) NULL,
	field_name varchar(255) NULL,
	old_value text NULL,
	new_value text NULL,
	change_reason text NULL,
	ticket_reference varchar(100) NULL,
	requires_approval bool DEFAULT false NULL,
	approved_by varchar(255) NULL,
	approved_at timestamp NULL,
	can_rollback bool DEFAULT true NULL,
	rollback_script text NULL,
	metadata jsonb NULL,
	created_at timestamp NULL,
	archived_at timestamp DEFAULT now() NULL,
	CONSTRAINT config_change_history_archive_pkey PRIMARY KEY (change_id)
);
CREATE INDEX idx_config_change_history_archive_archived ON public.config_change_history_archive USING btree (archived_at DESC);
CREATE INDEX idx_config_change_history_archive_timestamp ON public.config_change_history_archive USING btree ("timestamp" DESC);


-- public.connections definition

-- Drop table

-- DROP TABLE public.connections;

CREATE TABLE public.connections (
	id serial4 NOT NULL,
	connection_name varchar(255) NOT NULL,
	connection_type varchar(50) NOT NULL,
	host varchar(255) NULL,
	port int4 NULL,
	username varchar(255) NULL,
	password_encrypted varchar(512) NULL,
	database_name varchar(255) NULL,
	connection_string text NULL,
	parameters jsonb NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	last_used_at timestamptz NULL,
	has_archive_password bool DEFAULT false NULL,
	CONSTRAINT connections_connection_name_key UNIQUE (connection_name),
	CONSTRAINT connections_pkey PRIMARY KEY (id)
);


-- public.data_access_log definition

-- Drop table

-- DROP TABLE public.data_access_log;

CREATE TABLE public.data_access_log (
	access_id bigserial NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	user_id varchar(255) NULL,
	user_role varchar(100) NULL,
	ip_address inet NULL,
	access_type varchar(50) NULL,
	file_id varchar(255) NULL,
	file_name varchar(255) NULL,
	table_name varchar(255) NULL,
	column_names _text NULL,
	access_method varchar(100) NULL,
	query_text text NULL,
	filters_applied jsonb NULL,
	rows_accessed int8 NULL,
	bytes_accessed int8 NULL,
	access_purpose text NULL,
	project_name varchar(255) NULL,
	contains_pii bool DEFAULT false NULL,
	data_classification varchar(50) NULL,
	metadata jsonb NULL,
	created_at timestamp DEFAULT now() NULL,
	CONSTRAINT data_access_log_pkey PRIMARY KEY (access_id)
);
CREATE INDEX idx_data_access_file ON public.data_access_log USING btree (file_id, "timestamp" DESC);
CREATE INDEX idx_data_access_pii ON public.data_access_log USING btree (contains_pii, "timestamp" DESC) WHERE (contains_pii = true);
CREATE INDEX idx_data_access_timestamp ON public.data_access_log USING btree ("timestamp" DESC);
CREATE INDEX idx_data_access_user ON public.data_access_log USING btree (user_id, "timestamp" DESC);


-- public.data_access_log_archive definition

-- Drop table

-- DROP TABLE public.data_access_log_archive;

CREATE TABLE public.data_access_log_archive (
	access_id int8 NOT NULL,
	"timestamp" timestamp NOT NULL,
	user_id varchar(255) NOT NULL,
	user_role varchar(100) NULL,
	ip_address inet NULL,
	access_type varchar(50) NULL,
	file_id varchar(255) NULL,
	file_name varchar(255) NULL,
	table_name varchar(255) NULL,
	column_names _text NULL,
	access_method varchar(100) NULL,
	query_text text NULL,
	filters_applied jsonb NULL,
	rows_accessed int8 NULL,
	bytes_accessed int8 NULL,
	access_purpose text NULL,
	project_name varchar(255) NULL,
	contains_pii bool DEFAULT false NULL,
	data_classification varchar(50) NULL,
	metadata jsonb NULL,
	created_at timestamp NULL,
	archived_at timestamp DEFAULT now() NULL,
	CONSTRAINT data_access_log_archive_pkey PRIMARY KEY (access_id)
);
CREATE INDEX idx_data_access_log_archive_archived ON public.data_access_log_archive USING btree (archived_at DESC);
CREATE INDEX idx_data_access_log_archive_timestamp ON public.data_access_log_archive USING btree ("timestamp" DESC);
CREATE INDEX idx_data_access_log_archive_user ON public.data_access_log_archive USING btree (user_id, "timestamp" DESC);


-- public.dbt_executions definition

-- Drop table

-- DROP TABLE public.dbt_executions;

CREATE TABLE public.dbt_executions (
	execution_id serial4 NOT NULL,
	execution_uuid varchar(255) NOT NULL,
	command varchar(255) NOT NULL,
	models_selector varchar(255) NULL,
	triggered_by varchar(255) NULL,
	trigger_type varchar(50) NULL,
	status varchar(50) DEFAULT 'pending'::character varying NULL,
	started_at timestamp NULL,
	completed_at timestamp NULL,
	duration_ms int8 NULL,
	models_run int4 DEFAULT 0 NULL,
	models_success int4 DEFAULT 0 NULL,
	models_failed int4 DEFAULT 0 NULL,
	models_skipped int4 DEFAULT 0 NULL,
	tests_run int4 DEFAULT 0 NULL,
	tests_passed int4 DEFAULT 0 NULL,
	tests_failed int4 DEFAULT 0 NULL,
	results jsonb NULL,
	logs text NULL,
	error_message text NULL,
	metadata jsonb NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT dbt_executions_execution_uuid_key UNIQUE (execution_uuid),
	CONSTRAINT dbt_executions_pkey PRIMARY KEY (execution_id),
	CONSTRAINT valid_status CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('running'::character varying)::text, ('success'::character varying)::text, ('failed'::character varying)::text, ('cancelled'::character varying)::text]))),
	CONSTRAINT valid_trigger_type CHECK (((trigger_type)::text = ANY (ARRAY[('manual'::character varying)::text, ('scheduled'::character varying)::text, ('api'::character varying)::text, ('dependency'::character varying)::text])))
);
CREATE INDEX idx_dbt_executions_created ON public.dbt_executions USING btree (created_at DESC);
CREATE INDEX idx_dbt_executions_status ON public.dbt_executions USING btree (status);
CREATE INDEX idx_dbt_executions_triggered_by ON public.dbt_executions USING btree (triggered_by);
CREATE INDEX idx_dbt_executions_uuid ON public.dbt_executions USING btree (execution_uuid);


-- public.dbt_models definition

-- Drop table

-- DROP TABLE public.dbt_models;

CREATE TABLE public.dbt_models (
	model_id serial4 NOT NULL,
	model_name varchar(255) NOT NULL,
	model_path varchar(500) NOT NULL,
	model_type varchar(50) NULL,
	materialization varchar(50) NULL,
	description text NULL,
	tags _text NULL,
	upstream_models _text NULL,
	downstream_models _text NULL,
	source_tables _text NULL,
	last_compiled_at timestamp NULL,
	last_run_at timestamp NULL,
	last_run_status varchar(50) NULL,
	last_run_duration_ms int8 NULL,
	row_count int8 NULL,
	byte_size int8 NULL,
	config jsonb NULL,
	metadata jsonb NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT dbt_models_model_name_key UNIQUE (model_name),
	CONSTRAINT dbt_models_pkey PRIMARY KEY (model_id),
	CONSTRAINT valid_materialization CHECK (((materialization)::text = ANY (ARRAY[('table'::character varying)::text, ('view'::character varying)::text, ('incremental'::character varying)::text, ('ephemeral'::character varying)::text]))),
	CONSTRAINT valid_model_type CHECK (((model_type)::text = ANY (ARRAY[('staging'::character varying)::text, ('intermediate'::character varying)::text, ('mart'::character varying)::text, ('snapshot'::character varying)::text, ('seed'::character varying)::text])))
);
CREATE INDEX idx_dbt_models_name ON public.dbt_models USING btree (model_name);
CREATE INDEX idx_dbt_models_status ON public.dbt_models USING btree (last_run_status);
CREATE INDEX idx_dbt_models_type ON public.dbt_models USING btree (model_type);
CREATE INDEX idx_dbt_models_updated ON public.dbt_models USING btree (updated_at DESC);


-- public.execution_audit definition

-- Drop table

-- DROP TABLE public.execution_audit;

CREATE TABLE public.execution_audit (
	audit_id bigserial NOT NULL,
	execution_id varchar(255) NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	execution_type varchar(50) NULL,
	entity_id varchar(255) NULL,
	entity_name varchar(255) NULL,
	previous_status varchar(50) NULL,
	new_status varchar(50) NULL,
	status_reason text NULL,
	cpu_usage_percent numeric(5, 2) NULL,
	memory_usage_mb int4 NULL,
	rows_processed int8 NULL,
	records_affected int8 NULL,
	quality_score numeric(5, 2) NULL,
	validation_errors jsonb NULL,
	triggered_by_user varchar(255) NULL,
	trigger_type varchar(50) NULL,
	parent_execution_id varchar(255) NULL,
	execution_duration_ms int8 NULL,
	database_queries_count int4 NULL,
	network_requests_count int4 NULL,
	metadata jsonb NULL,
	created_at timestamp DEFAULT now() NULL,
	CONSTRAINT execution_audit_pkey PRIMARY KEY (audit_id)
);
CREATE INDEX idx_execution_audit_entity ON public.execution_audit USING btree (execution_type, entity_id);
CREATE INDEX idx_execution_audit_execution ON public.execution_audit USING btree (execution_id, "timestamp" DESC);
CREATE INDEX idx_execution_audit_status ON public.execution_audit USING btree (new_status, "timestamp" DESC);


-- public.execution_audit_archive definition

-- Drop table

-- DROP TABLE public.execution_audit_archive;

CREATE TABLE public.execution_audit_archive (
	audit_id int8 NOT NULL,
	execution_id varchar(255) NOT NULL,
	"timestamp" timestamp NOT NULL,
	execution_type varchar(50) NULL,
	entity_id varchar(255) NULL,
	entity_name varchar(255) NULL,
	previous_status varchar(50) NULL,
	new_status varchar(50) NULL,
	status_reason text NULL,
	cpu_usage_percent numeric(5, 2) NULL,
	memory_usage_mb int4 NULL,
	rows_processed int8 NULL,
	records_affected int8 NULL,
	quality_score numeric(5, 2) NULL,
	validation_errors jsonb NULL,
	triggered_by_user varchar(255) NULL,
	trigger_type varchar(50) NULL,
	parent_execution_id varchar(255) NULL,
	execution_duration_ms int8 NULL,
	database_queries_count int4 NULL,
	network_requests_count int4 NULL,
	metadata jsonb NULL,
	created_at timestamp NULL,
	archived_at timestamp DEFAULT now() NULL,
	CONSTRAINT execution_audit_archive_pkey PRIMARY KEY (audit_id)
);
CREATE INDEX idx_execution_audit_archive_archived ON public.execution_audit_archive USING btree (archived_at DESC);
CREATE INDEX idx_execution_audit_archive_timestamp ON public.execution_audit_archive USING btree ("timestamp" DESC);


-- public.file_errors definition

-- Drop table

-- DROP TABLE public.file_errors;

CREATE TABLE public.file_errors (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	error_type varchar(100) NOT NULL, -- Category of error: parsing, encoding, schema, or data quality
	severity varchar(20) DEFAULT 'error'::character varying NOT NULL,
	"row_number" int4 NULL,
	column_name varchar(255) NULL,
	error_message text NOT NULL,
	error_details jsonb NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	status varchar(20) DEFAULT 'new'::character varying NULL,
	processing_action varchar(20) NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	record_snapshot jsonb NULL,
	CONSTRAINT file_errors_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_file_errors_created_at ON public.file_errors USING btree (created_at DESC);
CREATE INDEX idx_file_errors_file_id ON public.file_errors USING btree (file_id);
CREATE INDEX idx_file_errors_severity ON public.file_errors USING btree (severity);
CREATE INDEX idx_file_errors_status ON public.file_errors USING btree (status);
CREATE INDEX idx_file_errors_type ON public.file_errors USING btree (error_type);
COMMENT ON TABLE public.file_errors IS 'Errors captured during file upload and processing';

-- Column comments

COMMENT ON COLUMN public.file_errors.error_type IS 'Category of error: parsing, encoding, schema, or data quality';


-- public.file_mappings definition

-- Drop table

-- DROP TABLE public.file_mappings;

CREATE TABLE public.file_mappings (
	id serial4 NOT NULL,
	mapping_name varchar(255) NOT NULL,
	source_file_id varchar(255) NOT NULL,
	source_filename varchar(255) NULL,
	target_file_type varchar(50) DEFAULT 'csv'::character varying NULL,
	mapping_rules json DEFAULT '{}'::json NULL,
	mapping_config json DEFAULT '{}'::json NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT file_mappings_pkey PRIMARY KEY (id)
);


-- public.file_pattern_metrics definition

-- Drop table

-- DROP TABLE public.file_pattern_metrics;

CREATE TABLE public.file_pattern_metrics (
	id serial4 NOT NULL,
	file_pattern varchar(500) NOT NULL,
	metric_date date NOT NULL,
	record_count int8 DEFAULT 0 NULL,
	file_count int4 DEFAULT 1 NULL,
	duplicate_count int8 DEFAULT 0 NULL,
	duplicate_percentage numeric(5, 2) DEFAULT 0 NULL,
	null_counts jsonb DEFAULT '{}'::jsonb NULL,
	null_percentages jsonb DEFAULT '{}'::jsonb NULL,
	numeric_stats jsonb DEFAULT '{}'::jsonb NULL,
	string_stats jsonb DEFAULT '{}'::jsonb NULL,
	completeness_score numeric(5, 2) NULL,
	consistency_score numeric(5, 2) NULL,
	validity_score numeric(5, 2) NULL,
	overall_quality_score numeric(5, 2) NULL,
	has_alerts bool DEFAULT false NULL,
	alert_count int4 DEFAULT 0 NULL,
	column_count int4 NULL,
	data_types jsonb DEFAULT '{}'::jsonb NULL,
	retention_until timestamp DEFAULT (now() + '1 year 6 mons'::interval) NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT file_pattern_metrics_file_pattern_metric_date_key UNIQUE (file_pattern, metric_date),
	CONSTRAINT file_pattern_metrics_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_file_pattern_metrics_alerts ON public.file_pattern_metrics USING btree (has_alerts, file_pattern);
CREATE INDEX idx_file_pattern_metrics_date ON public.file_pattern_metrics USING btree (metric_date DESC);
CREATE INDEX idx_file_pattern_metrics_pattern ON public.file_pattern_metrics USING btree (file_pattern);
CREATE INDEX idx_file_pattern_metrics_pattern_date ON public.file_pattern_metrics USING btree (file_pattern, metric_date DESC);
CREATE INDEX idx_file_pattern_metrics_retention ON public.file_pattern_metrics USING btree (retention_until);

-- Table Triggers

create trigger trigger_refresh_file_pattern_metrics_views after
insert
    or
update
    on
    public.file_pattern_metrics for each statement execute function refresh_file_pattern_metrics_views();


-- public.file_quality_checks definition

-- Drop table

-- DROP TABLE public.file_quality_checks;

CREATE TABLE public.file_quality_checks (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	check_type varchar(50) NOT NULL,
	check_name varchar(100) NOT NULL,
	status varchar(20) NOT NULL,
	score numeric(5, 2) NULL,
	details json NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT file_quality_checks_pkey PRIMARY KEY (id)
);


-- public.file_schema_details definition

-- Drop table

-- DROP TABLE public.file_schema_details;

CREATE TABLE public.file_schema_details (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	file_name varchar(500) NULL,
	file_schema_id varchar(255) NOT NULL,
	file_schema jsonb NOT NULL,
	schema_hash varchar(255) NOT NULL,
	schema_diff jsonb NULL,
	schema_update_ts timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	active_flag bool DEFAULT true NULL,
	correlation_id varchar(255) NULL,
	previous_schema_id varchar(255) NULL,
	created_ts timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	created_by int4 NULL,
	CONSTRAINT file_schema_details_file_id_file_schema_id_key UNIQUE (file_id, file_schema_id),
	CONSTRAINT file_schema_details_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_file_schema_active ON public.file_schema_details USING btree (active_flag);
CREATE INDEX idx_file_schema_correlation ON public.file_schema_details USING btree (correlation_id);
CREATE INDEX idx_file_schema_file_id ON public.file_schema_details USING btree (file_id);
CREATE INDEX idx_file_schema_hash ON public.file_schema_details USING btree (schema_hash);
CREATE INDEX idx_file_schema_schema_id ON public.file_schema_details USING btree (file_schema_id);


-- public.frontend_audit_log definition

-- Drop table

-- DROP TABLE public.frontend_audit_log;

CREATE TABLE public.frontend_audit_log (
	audit_id bigserial NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	user_id varchar(255) NULL,
	user_email varchar(255) NULL,
	session_id varchar(255) NULL,
	event_type varchar(100) NOT NULL,
	event_category varchar(50) NULL,
	page_url varchar(500) NULL,
	page_title varchar(255) NULL,
	component_name varchar(255) NULL,
	action_type varchar(100) NULL,
	target_element varchar(255) NULL,
	element_text text NULL,
	error_message text NULL,
	error_stack text NULL,
	error_component varchar(255) NULL,
	api_endpoint varchar(255) NULL,
	api_method varchar(10) NULL,
	api_status_code int4 NULL,
	api_error_message text NULL,
	browser_info jsonb NULL,
	screen_resolution varchar(50) NULL,
	viewport_size varchar(50) NULL,
	metadata jsonb NULL,
	created_at timestamp DEFAULT now() NULL,
	CONSTRAINT frontend_audit_log_pkey PRIMARY KEY (audit_id)
);
CREATE INDEX idx_frontend_audit_log_error ON public.frontend_audit_log USING btree ("timestamp" DESC) WHERE (error_message IS NOT NULL);
CREATE INDEX idx_frontend_audit_log_event ON public.frontend_audit_log USING btree (event_type, "timestamp" DESC);
CREATE INDEX idx_frontend_audit_log_timestamp ON public.frontend_audit_log USING btree ("timestamp" DESC);
CREATE INDEX idx_frontend_audit_log_user ON public.frontend_audit_log USING btree (user_id, "timestamp" DESC);


-- public."groups" definition

-- Drop table

-- DROP TABLE public."groups";

CREATE TABLE public."groups" (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	description text NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT groups_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_groups_name ON public.groups USING btree (name);


-- public.job_group_jobs definition

-- Drop table

-- DROP TABLE public.job_group_jobs;

CREATE TABLE public.job_group_jobs (
	group_id uuid NOT NULL,
	job_id uuid NOT NULL,
	added_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT job_group_jobs_pkey PRIMARY KEY (group_id, job_id)
);
CREATE INDEX idx_job_group_jobs_group_id ON public.job_group_jobs USING btree (group_id);
CREATE INDEX idx_job_group_jobs_job_id ON public.job_group_jobs USING btree (job_id);


-- public.job_groups definition

-- Drop table

-- DROP TABLE public.job_groups;

CREATE TABLE public.job_groups (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	description text NULL,
	created_by uuid NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT job_groups_pkey PRIMARY KEY (id)
);


-- public.mapping_job_errors definition

-- Drop table

-- DROP TABLE public.mapping_job_errors;

CREATE TABLE public.mapping_job_errors (
	id serial4 NOT NULL,
	job_id varchar(255) NOT NULL,
	mapping_id varchar(255) NOT NULL,
	error_type varchar(100) NOT NULL, -- Category of error: transformation, validation, output, or data quality
	severity varchar(20) DEFAULT 'error'::character varying NOT NULL,
	"row_number" int4 NULL,
	column_name varchar(255) NULL,
	error_message text NOT NULL,
	error_details jsonb NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	status varchar(20) DEFAULT 'new'::character varying NULL,
	processing_action varchar(20) NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	record_snapshot jsonb NULL,
	CONSTRAINT mapping_job_errors_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_mapping_job_errors_created_at ON public.mapping_job_errors USING btree (created_at DESC);
CREATE INDEX idx_mapping_job_errors_job_id ON public.mapping_job_errors USING btree (job_id);
CREATE INDEX idx_mapping_job_errors_mapping_id ON public.mapping_job_errors USING btree (mapping_id);
CREATE INDEX idx_mapping_job_errors_severity ON public.mapping_job_errors USING btree (severity);
CREATE INDEX idx_mapping_job_errors_status ON public.mapping_job_errors USING btree (status);
CREATE INDEX idx_mapping_job_errors_type ON public.mapping_job_errors USING btree (error_type);
COMMENT ON TABLE public.mapping_job_errors IS 'Errors captured during ETL mapping job execution';

-- Column comments

COMMENT ON COLUMN public.mapping_job_errors.error_type IS 'Category of error: transformation, validation, output, or data quality';


-- public.migrations definition

-- Drop table

-- DROP TABLE public.migrations;

CREATE TABLE public.migrations (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	applied_at timestamp NOT NULL,
	CONSTRAINT migrations_name_key UNIQUE (name),
	CONSTRAINT migrations_pkey PRIMARY KEY (id)
);


-- public.permissions definition

-- Drop table

-- DROP TABLE public.permissions;

CREATE TABLE public.permissions (
	id serial4 NOT NULL,
	"name" varchar(100) NOT NULL,
	description text NULL,
	resource varchar(100) NOT NULL,
	"action" varchar(50) NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT permissions_name_key UNIQUE (name),
	CONSTRAINT permissions_pkey PRIMARY KEY (id),
	CONSTRAINT permissions_resource_action_key UNIQUE (resource, action)
);
CREATE INDEX idx_permissions_action ON public.permissions USING btree (action);
CREATE INDEX idx_permissions_id ON public.permissions USING btree (id);
CREATE INDEX idx_permissions_name ON public.permissions USING btree (name);
CREATE INDEX idx_permissions_resource ON public.permissions USING btree (resource);


-- public.policy_evaluation_cache definition

-- Drop table

-- DROP TABLE public.policy_evaluation_cache;

CREATE TABLE public.policy_evaluation_cache (
	cache_key varchar(512) NOT NULL,
	user_id int4 NOT NULL,
	"action" varchar(255) NOT NULL,
	resource_type varchar(50) NULL,
	resource_id varchar(255) NULL,
	decision varchar(20) NOT NULL,
	evaluated_policies jsonb NULL,
	expires_at timestamp NOT NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT policy_evaluation_cache_pkey PRIMARY KEY (cache_key),
	CONSTRAINT valid_decision CHECK (((decision)::text = ANY (ARRAY[('ALLOW'::character varying)::text, ('DENY'::character varying)::text, ('IMPLICIT_DENY'::character varying)::text])))
);
CREATE INDEX idx_policy_cache_expires ON public.policy_evaluation_cache USING btree (expires_at);
CREATE INDEX idx_policy_cache_user ON public.policy_evaluation_cache USING btree (user_id);

-- Table Triggers

create trigger trigger_cleanup_policy_cache_on_insert after
insert
    on
    public.policy_evaluation_cache for each statement execute function trigger_cleanup_policy_cache();


-- public.profiling_metrics definition

-- Drop table

-- DROP TABLE public.profiling_metrics;

CREATE TABLE public.profiling_metrics (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	file_name varchar(500) NOT NULL,
	mapping_id varchar(255) NULL,
	row_count int8 NULL,
	column_count int4 NULL,
	numeric_sum jsonb NULL,
	null_counts jsonb NULL,
	data_types jsonb NULL,
	value_distributions jsonb NULL,
	completeness_score numeric(5, 2) NULL,
	consistency_score numeric(5, 2) NULL,
	validity_score numeric(5, 2) NULL,
	overall_quality_score numeric(5, 2) NULL,
	profiled_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	job_id varchar(255) NULL,
	retention_until timestamp DEFAULT (now() + '1 year 6 mons'::interval) NULL,
	profile_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	file_role varchar(20) DEFAULT 'adhoc'::character varying NULL,
	CONSTRAINT profiling_metrics_file_id_file_role_key UNIQUE (file_id, file_role),
	CONSTRAINT profiling_metrics_file_role_check CHECK (((file_role)::text = ANY (ARRAY[('source'::character varying)::text, ('target'::character varying)::text, ('adhoc'::character varying)::text]))),
	CONSTRAINT profiling_metrics_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_profiling_metrics_date ON public.profiling_metrics USING btree (profiled_at DESC);
CREATE INDEX idx_profiling_metrics_file ON public.profiling_metrics USING btree (file_id);
CREATE INDEX idx_profiling_metrics_file_timestamp ON public.profiling_metrics USING btree (file_id, profile_timestamp DESC);
CREATE INDEX idx_profiling_metrics_job_role ON public.profiling_metrics USING btree (job_id, file_role);
CREATE INDEX idx_profiling_metrics_mapping ON public.profiling_metrics USING btree (mapping_id);


-- public.roles definition

-- Drop table

-- DROP TABLE public.roles;

CREATE TABLE public.roles (
	id serial4 NOT NULL,
	"name" varchar(100) NOT NULL,
	description text NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	permissions _text DEFAULT '{}'::text[] NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT roles_name_key UNIQUE (name),
	CONSTRAINT roles_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_roles_name ON public.roles USING btree (name);


-- public.schema_migrations definition

-- Drop table

-- DROP TABLE public.schema_migrations;

CREATE TABLE public.schema_migrations (
	id serial4 NOT NULL,
	migration_name varchar(255) NOT NULL,
	executed_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	success bool DEFAULT true NULL,
	error_message text NULL,
	CONSTRAINT schema_migrations_migration_name_key UNIQUE (migration_name),
	CONSTRAINT schema_migrations_pkey PRIMARY KEY (id)
);


-- public.scim_configurations definition

-- Drop table

-- DROP TABLE public.scim_configurations;

CREATE TABLE public.scim_configurations (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	description text NULL,
	base_url varchar(255) NULL,
	bearer_token varchar(512) NULL,
	idp_type varchar(50) NOT NULL,
	idp_scim_url varchar(255) NULL,
	sync_users bool DEFAULT true NULL,
	sync_groups bool DEFAULT true NULL,
	sync_interval_minutes int4 DEFAULT 60 NULL,
	last_sync_at timestamp NULL,
	user_attribute_mapping jsonb DEFAULT '{}'::jsonb NULL,
	group_attribute_mapping jsonb DEFAULT '{}'::jsonb NULL,
	is_active bool DEFAULT true NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT scim_configurations_name_key UNIQUE (name),
	CONSTRAINT scim_configurations_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_scim_configurations_active ON public.scim_configurations USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_scim_configurations_idp_type ON public.scim_configurations USING btree (idp_type);

-- Table Triggers

create trigger update_scim_configurations_updated_at before
update
    on
    public.scim_configurations for each row execute function update_updated_at_column();


-- public.security_audit_log definition

-- Drop table

-- DROP TABLE public.security_audit_log;

CREATE TABLE public.security_audit_log (
	security_audit_id bigserial NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	event_type varchar(100) NULL,
	severity varchar(20) NULL,
	user_id varchar(255) NULL,
	username varchar(255) NULL,
	ip_address inet NULL,
	user_agent text NULL,
	"location" jsonb NULL,
	authentication_method varchar(50) NULL,
	permission_required varchar(100) NULL,
	permission_granted bool NULL,
	denial_reason text NULL,
	risk_score int4 NULL,
	flags jsonb NULL,
	metadata jsonb NULL,
	created_at timestamp DEFAULT now() NULL,
	CONSTRAINT security_audit_log_pkey PRIMARY KEY (security_audit_id)
);
CREATE INDEX idx_security_audit_event ON public.security_audit_log USING btree (event_type, "timestamp" DESC);
CREATE INDEX idx_security_audit_severity ON public.security_audit_log USING btree (severity, "timestamp" DESC) WHERE ((severity)::text = ANY (ARRAY[('WARNING'::character varying)::text, ('CRITICAL'::character varying)::text]));
CREATE INDEX idx_security_audit_timestamp ON public.security_audit_log USING btree ("timestamp" DESC);
CREATE INDEX idx_security_audit_user ON public.security_audit_log USING btree (user_id, "timestamp" DESC);


-- public.security_audit_log_archive definition

-- Drop table

-- DROP TABLE public.security_audit_log_archive;

CREATE TABLE public.security_audit_log_archive (
	security_audit_id int8 NOT NULL,
	"timestamp" timestamp NOT NULL,
	event_type varchar(100) NULL,
	severity varchar(20) NULL,
	user_id varchar(255) NULL,
	username varchar(255) NULL,
	ip_address inet NULL,
	user_agent text NULL,
	"location" jsonb NULL,
	authentication_method varchar(50) NULL,
	permission_required varchar(100) NULL,
	permission_granted bool NULL,
	denial_reason text NULL,
	risk_score int4 NULL,
	flags jsonb NULL,
	metadata jsonb NULL,
	created_at timestamp NULL,
	archived_at timestamp DEFAULT now() NULL,
	CONSTRAINT security_audit_log_archive_pkey PRIMARY KEY (security_audit_id)
);
CREATE INDEX idx_security_audit_log_archive_archived ON public.security_audit_log_archive USING btree (archived_at DESC);
CREATE INDEX idx_security_audit_log_archive_timestamp ON public.security_audit_log_archive USING btree ("timestamp" DESC);
CREATE INDEX idx_security_audit_log_archive_user ON public.security_audit_log_archive USING btree (user_id, "timestamp" DESC);


-- public.transformation_executions definition

-- Drop table

-- DROP TABLE public.transformation_executions;

CREATE TABLE public.transformation_executions (
	id serial4 NOT NULL,
	execution_id text NOT NULL,
	transformation_id text NOT NULL,
	status text NOT NULL,
	started_at timestamp NOT NULL,
	completed_at timestamp NULL,
	parameters jsonb DEFAULT '{}'::jsonb NULL,
	"result" jsonb DEFAULT '{}'::jsonb NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT transformation_executions_execution_id_key UNIQUE (execution_id),
	CONSTRAINT transformation_executions_pkey PRIMARY KEY (id)
);


-- public.transformation_lineage definition

-- Drop table

-- DROP TABLE public.transformation_lineage;

CREATE TABLE public.transformation_lineage (
	id serial4 NOT NULL,
	transformation_id text NOT NULL,
	input_file_id text NOT NULL,
	output_file_id text NOT NULL,
	execution_id text NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	mapping_id text NULL,
	schema_fingerprint text NULL,
	lineage_type varchar(20) DEFAULT 'file-specific'::character varying NULL,
	source_schema jsonb NULL,
	target_schema jsonb NULL,
	column_mappings jsonb DEFAULT '[]'::jsonb NULL, -- Column-level transformation mappings including PII tag propagation. Structure: [{"source_column": "email", "target_column": "customer_email", "contains_pii": true, "pii_type": "contact", "transformation_applied": "lowercase"}]
	source_owner text NULL, -- Owner of the source file - from vendor agreement primary contact (if vendor source) or from mapping source config (if regular connection)
	target_owner text NULL, -- Owner of the target file - from mapping target configuration
	source_path text NULL, -- Path to source file - vendor drop location (if vendor source) or connection path (if regular connection)
	target_path text NULL, -- Path to target file - from mapping target configuration
	source_agreement_name text NULL, -- Vendor agreement name - only populated if source is from vendor agreement
	CONSTRAINT transformation_lineage_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_transformation_lineage_column_mappings ON public.transformation_lineage USING gin (column_mappings);

-- Column comments

COMMENT ON COLUMN public.transformation_lineage.column_mappings IS 'Column-level transformation mappings including PII tag propagation. Structure: [{"source_column": "email", "target_column": "customer_email", "contains_pii": true, "pii_type": "contact", "transformation_applied": "lowercase"}]';
COMMENT ON COLUMN public.transformation_lineage.source_owner IS 'Owner of the source file - from vendor agreement primary contact (if vendor source) or from mapping source config (if regular connection)';
COMMENT ON COLUMN public.transformation_lineage.target_owner IS 'Owner of the target file - from mapping target configuration';
COMMENT ON COLUMN public.transformation_lineage.source_path IS 'Path to source file - vendor drop location (if vendor source) or connection path (if regular connection)';
COMMENT ON COLUMN public.transformation_lineage.target_path IS 'Path to target file - from mapping target configuration';
COMMENT ON COLUMN public.transformation_lineage.source_agreement_name IS 'Vendor agreement name - only populated if source is from vendor agreement';


-- public.transformation_outputs definition

-- Drop table

-- DROP TABLE public.transformation_outputs;

CREATE TABLE public.transformation_outputs (
	id serial4 NOT NULL,
	execution_id text NOT NULL,
	file_id text NOT NULL,
	file_path text NOT NULL,
	file_size int8 NULL,
	row_count int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT transformation_outputs_pkey PRIMARY KEY (id)
);


-- public.transformations definition

-- Drop table

-- DROP TABLE public.transformations;

CREATE TABLE public.transformations (
	id serial4 NOT NULL,
	transformation_id text NOT NULL,
	"name" text NOT NULL,
	description text NULL,
	"type" text NOT NULL,
	config jsonb DEFAULT '{}'::jsonb NULL,
	input_files jsonb DEFAULT '[]'::jsonb NULL,
	output_format text DEFAULT 'csv'::text NULL,
	enabled bool DEFAULT true NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	task_id varchar(255) NULL,
	progress int4 DEFAULT 0 NULL,
	"error" text NULL,
	"result" jsonb NULL,
	CONSTRAINT transformations_pkey PRIMARY KEY (id),
	CONSTRAINT transformations_transformation_id_key UNIQUE (transformation_id)
);


-- public.user_dashboard_settings definition

-- Drop table

-- DROP TABLE public.user_dashboard_settings;

CREATE TABLE public.user_dashboard_settings (
	id serial4 NOT NULL,
	user_id varchar(50) DEFAULT 'default'::character varying NULL,
	settings json NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT user_dashboard_settings_pkey PRIMARY KEY (id)
);


-- public.user_job_groups definition

-- Drop table

-- DROP TABLE public.user_job_groups;

CREATE TABLE public.user_job_groups (
	user_id uuid NOT NULL,
	group_id uuid NOT NULL,
	CONSTRAINT user_job_groups_pkey PRIMARY KEY (user_id, group_id)
);


-- public.user_uuid_mapping definition

-- Drop table

-- DROP TABLE public.user_uuid_mapping;

CREATE TABLE public.user_uuid_mapping (
	user_id int4 NOT NULL,
	"uuid" uuid NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT user_uuid_mapping_pkey PRIMARY KEY (user_id)
);


-- public.audit_log definition

-- Drop table

-- DROP TABLE public.audit_log;

CREATE TABLE public.audit_log (
	audit_id bigserial NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	user_id varchar(255) NULL,
	user_email varchar(255) NULL,
	user_role varchar(100) NULL,
	ip_address inet NULL,
	session_id varchar(255) NULL,
	action_type varchar(100) NOT NULL,
	entity_type varchar(100) NOT NULL,
	entity_id varchar(255) NULL,
	entity_name varchar(255) NULL,
	operation varchar(50) NULL,
	old_values jsonb NULL,
	new_values jsonb NULL,
	changes jsonb NULL,
	parent_audit_id int8 NULL,
	request_id varchar(255) NULL,
	api_endpoint varchar(255) NULL,
	http_method varchar(10) NULL,
	status varchar(50) NULL,
	error_message text NULL,
	metadata jsonb NULL,
	retention_until timestamp NULL,
	created_at timestamp DEFAULT now() NULL,
	CONSTRAINT audit_log_pkey PRIMARY KEY (audit_id),
	CONSTRAINT audit_log_parent_audit_id_fkey FOREIGN KEY (parent_audit_id) REFERENCES public.audit_log(audit_id)
);
CREATE INDEX idx_audit_log_action ON public.audit_log USING btree (action_type, "timestamp" DESC);
CREATE INDEX idx_audit_log_entity ON public.audit_log USING btree (entity_type, entity_id);
CREATE INDEX idx_audit_log_entity_action_time ON public.audit_log USING btree (entity_type, action_type, "timestamp" DESC);
CREATE INDEX idx_audit_log_request ON public.audit_log USING btree (request_id);
CREATE INDEX idx_audit_log_timestamp ON public.audit_log USING btree ("timestamp" DESC);
CREATE INDEX idx_audit_log_user ON public.audit_log USING btree (user_id, "timestamp" DESC);
CREATE INDEX idx_audit_log_user_entity_time ON public.audit_log USING btree (user_id, entity_type, "timestamp" DESC);


-- public.job_group_dependencies definition

-- Drop table

-- DROP TABLE public.job_group_dependencies;

CREATE TABLE public.job_group_dependencies (
	group_dependency_id serial4 NOT NULL,
	group_id uuid NOT NULL,
	depends_on_group_id uuid NOT NULL,
	dependency_type varchar(50) DEFAULT 'all_success'::character varying NULL,
	wait_for_all_jobs bool DEFAULT true NULL,
	timeout_minutes int4 NULL,
	created_by varchar(255) NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT job_group_dependencies_pkey PRIMARY KEY (group_dependency_id),
	CONSTRAINT no_self_group_dependency CHECK ((group_id <> depends_on_group_id)),
	CONSTRAINT unique_group_dependency UNIQUE (group_id, depends_on_group_id),
	CONSTRAINT valid_dependency_type CHECK (((dependency_type)::text = ANY (ARRAY[('all_success'::character varying)::text, ('any_success'::character varying)::text, ('all_complete'::character varying)::text]))),
	CONSTRAINT job_group_dependencies_depends_on_group_id_fkey FOREIGN KEY (depends_on_group_id) REFERENCES public.job_groups(id) ON DELETE CASCADE,
	CONSTRAINT job_group_dependencies_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.job_groups(id) ON DELETE CASCADE
);
CREATE INDEX idx_job_group_dependencies_depends_on ON public.job_group_dependencies USING btree (depends_on_group_id);
CREATE INDEX idx_job_group_dependencies_group ON public.job_group_dependencies USING btree (group_id);


-- public.role_permissions definition

-- Drop table

-- DROP TABLE public.role_permissions;

CREATE TABLE public.role_permissions (
	role_id int4 NOT NULL,
	permission_id int4 NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id),
	CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE,
	CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE
);
CREATE INDEX idx_role_permissions_role_id_perm_id ON public.role_permissions USING btree (role_id, permission_id);


-- public.scim_resource_mappings definition

-- Drop table

-- DROP TABLE public.scim_resource_mappings;

CREATE TABLE public.scim_resource_mappings (
	id serial4 NOT NULL,
	config_id int4 NULL,
	scim_id varchar(255) NOT NULL,
	scim_resource_type varchar(50) NOT NULL,
	platform_resource_type varchar(50) NOT NULL,
	platform_resource_id int4 NOT NULL,
	last_synced_at timestamp NULL,
	sync_hash varchar(64) NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT scim_resource_mappings_pkey PRIMARY KEY (id),
	CONSTRAINT unique_platform_resource UNIQUE (config_id, platform_resource_type, platform_resource_id),
	CONSTRAINT unique_scim_resource UNIQUE (config_id, scim_id),
	CONSTRAINT scim_resource_mappings_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.scim_configurations(id) ON DELETE CASCADE
);
CREATE INDEX idx_scim_mappings_config ON public.scim_resource_mappings USING btree (config_id);
CREATE INDEX idx_scim_mappings_platform ON public.scim_resource_mappings USING btree (platform_resource_type, platform_resource_id);
CREATE INDEX idx_scim_mappings_scim_id ON public.scim_resource_mappings USING btree (scim_id);

-- Table Triggers

create trigger update_scim_resource_mappings_updated_at before
update
    on
    public.scim_resource_mappings for each row execute function update_updated_at_column();


-- public.scim_sync_logs definition

-- Drop table

-- DROP TABLE public.scim_sync_logs;

CREATE TABLE public.scim_sync_logs (
	id serial4 NOT NULL,
	config_id int4 NULL,
	sync_type varchar(50) NOT NULL,
	sync_direction varchar(20) DEFAULT 'INBOUND'::character varying NULL,
	status varchar(50) NOT NULL,
	items_processed int4 DEFAULT 0 NULL,
	items_created int4 DEFAULT 0 NULL,
	items_updated int4 DEFAULT 0 NULL,
	items_deleted int4 DEFAULT 0 NULL,
	items_failed int4 DEFAULT 0 NULL,
	error_message text NULL,
	error_details jsonb NULL,
	started_at timestamp DEFAULT now() NOT NULL,
	completed_at timestamp NULL,
	duration_ms int4 NULL,
	CONSTRAINT scim_sync_logs_pkey PRIMARY KEY (id),
	CONSTRAINT scim_sync_logs_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.scim_configurations(id) ON DELETE CASCADE
);
CREATE INDEX idx_scim_sync_logs_config ON public.scim_sync_logs USING btree (config_id);
CREATE INDEX idx_scim_sync_logs_started ON public.scim_sync_logs USING btree (started_at DESC);
CREATE INDEX idx_scim_sync_logs_status ON public.scim_sync_logs USING btree (status);


-- public.access_group_members definition

-- Drop table

-- DROP TABLE public.access_group_members;

CREATE TABLE public.access_group_members (
	group_id int4 NOT NULL,
	user_id int4 NOT NULL,
	"source" varchar(50) DEFAULT 'MANUAL'::character varying NULL,
	added_by int4 NULL,
	added_at timestamp DEFAULT now() NOT NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT access_group_members_pkey PRIMARY KEY (group_id, user_id)
);
CREATE INDEX idx_access_group_members_group ON public.access_group_members USING btree (group_id);
CREATE INDEX idx_access_group_members_source ON public.access_group_members USING btree (source);
CREATE INDEX idx_access_group_members_user ON public.access_group_members USING btree (user_id);


-- public.access_group_roles definition

-- Drop table

-- DROP TABLE public.access_group_roles;

CREATE TABLE public.access_group_roles (
	group_id int4 NULL,
	role_id int4 NULL,
	project_id int4 NULL,
	assigned_by int4 NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	id serial4 NOT NULL,
	CONSTRAINT access_group_roles_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX idx_access_group_roles_global_unique ON public.access_group_roles USING btree (group_id, role_id) WHERE (project_id IS NULL);
CREATE INDEX idx_access_group_roles_group ON public.access_group_roles USING btree (group_id);
CREATE INDEX idx_access_group_roles_project ON public.access_group_roles USING btree (project_id) WHERE (project_id IS NOT NULL);
CREATE UNIQUE INDEX idx_access_group_roles_project_unique ON public.access_group_roles USING btree (group_id, role_id, project_id) WHERE (project_id IS NOT NULL);
CREATE INDEX idx_access_group_roles_role ON public.access_group_roles USING btree (role_id);


-- public.access_groups definition

-- Drop table

-- DROP TABLE public.access_groups;

CREATE TABLE public.access_groups (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	description text NULL,
	group_type varchar(50) DEFAULT 'MANUAL'::character varying NULL,
	idp_source varchar(100) NULL,
	external_group_id varchar(255) NULL,
	sync_enabled bool DEFAULT false NULL,
	last_synced_at timestamp NULL,
	sync_status varchar(50) NULL,
	sync_error text NULL,
	created_by int4 NULL,
	metadata jsonb DEFAULT '{}'::jsonb NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT access_groups_pkey PRIMARY KEY (id),
	CONSTRAINT unique_external_group UNIQUE (idp_source, external_group_id),
	CONSTRAINT unique_group_name UNIQUE (name)
);
CREATE INDEX idx_access_groups_external_id ON public.access_groups USING btree (external_group_id) WHERE (external_group_id IS NOT NULL);
CREATE INDEX idx_access_groups_idp_source ON public.access_groups USING btree (idp_source) WHERE (idp_source IS NOT NULL);
CREATE INDEX idx_access_groups_sync_enabled ON public.access_groups USING btree (sync_enabled) WHERE (sync_enabled = true);
CREATE INDEX idx_access_groups_type ON public.access_groups USING btree (group_type);

-- Table Triggers

create trigger update_access_groups_updated_at before
update
    on
    public.access_groups for each row execute function update_updated_at_column();


-- public.alert_aggregation definition

-- Drop table

-- DROP TABLE public.alert_aggregation;

CREATE TABLE public.alert_aggregation (
	id serial4 NOT NULL,
	policy_id int4 NOT NULL,
	entity_type varchar(50) NOT NULL,
	entity_id varchar(255) NOT NULL,
	event_type varchar(50) NOT NULL,
	status varchar(50) NOT NULL,
	occurred_at timestamp NOT NULL,
	metadata jsonb NULL,
	aggregation_ttl timestamp NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT alert_aggregation_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_alert_aggregation_policy_id ON public.alert_aggregation USING btree (policy_id);
CREATE INDEX idx_alert_aggregation_ttl ON public.alert_aggregation USING btree (aggregation_ttl);


-- public.alert_attachments definition

-- Drop table

-- DROP TABLE public.alert_attachments;

CREATE TABLE public.alert_attachments (
	id serial4 NOT NULL,
	run_id int4 NOT NULL,
	attachment_type varchar(50) NOT NULL,
	file_name varchar(255) NOT NULL,
	file_size_bytes int8 NOT NULL,
	storage_type varchar(50) NOT NULL,
	storage_path text NULL,
	cloud_url text NULL,
	expires_at timestamp NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT alert_attachments_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_alert_attachments_run_id ON public.alert_attachments USING btree (run_id);


-- public.alert_events definition

-- Drop table

-- DROP TABLE public.alert_events;

CREATE TABLE public.alert_events (
	id serial4 NOT NULL,
	run_id int4 NOT NULL,
	entity_type varchar(50) NOT NULL,
	entity_id varchar(255) NOT NULL,
	event_type varchar(50) NOT NULL,
	status varchar(50) NOT NULL,
	occurred_at timestamp NOT NULL,
	metadata jsonb NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	vendor_sla_violation_id int4 NULL,
	CONSTRAINT alert_events_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_alert_events_run_id ON public.alert_events USING btree (run_id);
CREATE INDEX idx_alert_events_vendor_sla ON public.alert_events USING btree (vendor_sla_violation_id) WHERE (vendor_sla_violation_id IS NOT NULL);


-- public.alert_history definition

-- Drop table

-- DROP TABLE public.alert_history;

CREATE TABLE public.alert_history (
	id serial4 NOT NULL,
	file_id varchar(255) NULL,
	rule_id int4 NULL,
	triggered_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	alert_details jsonb NULL,
	CONSTRAINT alert_history_pkey PRIMARY KEY (id)
);


-- public.alert_policies definition

-- Drop table

-- DROP TABLE public.alert_policies;

CREATE TABLE public.alert_policies (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	description text NULL,
	project_id int4 NOT NULL,
	entity_type varchar(50) NOT NULL,
	entity_id varchar(255) NULL,
	trigger_events jsonb DEFAULT '[]'::jsonb NOT NULL,
	consolidate_alerts bool DEFAULT true NOT NULL,
	consolidation_window_minutes int4 DEFAULT 60 NOT NULL,
	email_connection_id varchar(255) NULL,
	enabled bool DEFAULT true NOT NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT alert_policies_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['job'::character varying, 'mapping_group'::character varying, 'workflow'::character varying, 'schedule'::character varying, 'vendor_sla'::character varying])::text[]))),
	CONSTRAINT alert_policies_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_alert_policies_entity ON public.alert_policies USING btree (entity_type, entity_id);
CREATE INDEX idx_alert_policies_project_id ON public.alert_policies USING btree (project_id);
CREATE INDEX idx_alert_policies_vendor_sla ON public.alert_policies USING btree (entity_type, entity_id) WHERE (((entity_type)::text = 'vendor_sla'::text) AND (enabled = true));


-- public.alert_policy_recipients definition

-- Drop table

-- DROP TABLE public.alert_policy_recipients;

CREATE TABLE public.alert_policy_recipients (
	id serial4 NOT NULL,
	policy_id int4 NOT NULL,
	user_id int4 NULL,
	email varchar(255) NULL,
	delivery_method varchar(50) DEFAULT 'email'::character varying NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT alert_policy_recipients_pkey PRIMARY KEY (id),
	CONSTRAINT check_recipient CHECK (((user_id IS NOT NULL) OR (email IS NOT NULL)))
);
CREATE INDEX idx_alert_policy_recipients_policy_id ON public.alert_policy_recipients USING btree (policy_id);


-- public.alert_runs definition

-- Drop table

-- DROP TABLE public.alert_runs;

CREATE TABLE public.alert_runs (
	id serial4 NOT NULL,
	policy_id int4 NOT NULL,
	run_type varchar(50) NOT NULL,
	status varchar(50) NOT NULL,
	email_connection_id varchar(255) NULL,
	recipients_count int4 DEFAULT 0 NOT NULL,
	sent_at timestamp NULL,
	error_message text NULL,
	metadata jsonb NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT alert_runs_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_alert_runs_policy_id ON public.alert_runs USING btree (policy_id);


-- public.allowed_email_domains definition

-- Drop table

-- DROP TABLE public.allowed_email_domains;

CREATE TABLE public.allowed_email_domains (
	id serial4 NOT NULL,
	"domain" varchar(255) NOT NULL,
	description text NULL,
	is_active bool DEFAULT true NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT allowed_email_domains_domain_key UNIQUE (domain),
	CONSTRAINT allowed_email_domains_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_allowed_email_domains_domain ON public.allowed_email_domains USING btree (domain) WHERE (is_active = true);


-- public.api_tokens definition

-- Drop table

-- DROP TABLE public.api_tokens;

CREATE TABLE public.api_tokens (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	token_hash varchar(255) NOT NULL,
	token_prefix varchar(20) NOT NULL,
	user_id int4 NULL,
	project_id int4 NULL,
	scopes jsonb DEFAULT '[]'::jsonb NOT NULL,
	rate_limit int4 DEFAULT 100 NULL,
	rate_window_hours int4 DEFAULT 1 NULL,
	is_active bool DEFAULT true NULL,
	expires_at timestamp NULL,
	last_used_at timestamp NULL,
	created_at timestamp DEFAULT now() NULL,
	created_by int4 NULL,
	revoked_at timestamp NULL,
	revoked_by int4 NULL,
	metadata jsonb DEFAULT '{}'::jsonb NULL,
	CONSTRAINT api_tokens_pkey PRIMARY KEY (id),
	CONSTRAINT api_tokens_token_hash_key UNIQUE (token_hash)
);
CREATE INDEX idx_api_tokens_active ON public.api_tokens USING btree (is_active, expires_at);
CREATE INDEX idx_api_tokens_token_hash ON public.api_tokens USING btree (token_hash);
CREATE INDEX idx_api_tokens_user_project ON public.api_tokens USING btree (user_id, project_id);


-- public.archive_extractions definition

-- Drop table

-- DROP TABLE public.archive_extractions;

CREATE TABLE public.archive_extractions (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL, -- Reference to the parent archive file in files table
	archive_type varchar(50) NOT NULL, -- Archive format detected (zip, 7z, tar, tar.gz, tar.bz2)
	is_encrypted bool DEFAULT false NULL,
	password_required bool DEFAULT false NULL,
	extraction_status varchar(50) DEFAULT 'pending'::character varying NULL, -- Current status of extraction attempt
	error_message text NULL,
	extracted_count int4 DEFAULT 0 NULL, -- Number of files successfully extracted from archive
	started_at timestamp NULL,
	completed_at timestamp NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT archive_extractions_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_archive_extractions_failed ON public.archive_extractions USING btree (extraction_status, password_required) WHERE ((extraction_status)::text = ANY (ARRAY[('failed'::character varying)::text, ('password_required'::character varying)::text]));
CREATE INDEX idx_archive_extractions_file_id ON public.archive_extractions USING btree (file_id);
CREATE INDEX idx_archive_extractions_status ON public.archive_extractions USING btree (extraction_status);
COMMENT ON TABLE public.archive_extractions IS 'Tracks archive extraction attempts with status, errors, and metadata';

-- Column comments

COMMENT ON COLUMN public.archive_extractions.file_id IS 'Reference to the parent archive file in files table';
COMMENT ON COLUMN public.archive_extractions.archive_type IS 'Archive format detected (zip, 7z, tar, tar.gz, tar.bz2)';
COMMENT ON COLUMN public.archive_extractions.extraction_status IS 'Current status of extraction attempt';
COMMENT ON COLUMN public.archive_extractions.extracted_count IS 'Number of files successfully extracted from archive';


-- public.archive_members definition

-- Drop table

-- DROP TABLE public.archive_members;

CREATE TABLE public.archive_members (
	id serial4 NOT NULL,
	parent_file_id varchar(255) NOT NULL,
	extracted_file_id varchar(255) NULL,
	logical_name text NOT NULL,
	original_name text NOT NULL,
	file_format varchar(20) NULL,
	file_size_bytes int8 NULL,
	extraction_status varchar(50) DEFAULT 'pending'::character varying NULL,
	error_message text NULL,
	extracted_at timestamptz NULL,
	processed_at timestamptz NULL,
	CONSTRAINT archive_members_pkey PRIMARY KEY (id),
	CONSTRAINT unique_archive_member UNIQUE (parent_file_id, logical_name)
);
CREATE INDEX idx_archive_members_extracted ON public.archive_members USING btree (extracted_file_id);
CREATE INDEX idx_archive_members_parent ON public.archive_members USING btree (parent_file_id);
CREATE INDEX idx_archive_members_status ON public.archive_members USING btree (extraction_status);
COMMENT ON TABLE public.archive_members IS 'Tracks individual files extracted from ZIP/tar archives with their processing status';


-- public.archived_files definition

-- Drop table

-- DROP TABLE public.archived_files;

CREATE TABLE public.archived_files (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	original_filename varchar(500) NULL,
	original_path varchar(1000) NULL,
	original_size_bytes int8 NULL,
	policy_id int4 NULL,
	archive_storage_type varchar(50) NOT NULL,
	archive_connection_id uuid NULL,
	archive_path varchar(1000) NOT NULL,
	archive_checksum varchar(64) NULL,
	archived_at timestamp DEFAULT now() NULL,
	archived_by int4 NULL,
	archive_reason text NULL,
	original_metadata jsonb NULL,
	quality_score numeric(5, 2) NULL,
	row_count int4 NULL,
	column_count int4 NULL,
	file_type varchar(50) NULL,
	is_restored bool DEFAULT false NULL,
	restored_at timestamp NULL,
	restored_by int4 NULL,
	is_deleted bool DEFAULT false NULL,
	deleted_at timestamp NULL,
	deleted_by int4 NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT archived_files_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_archived_files_archived_at ON public.archived_files USING btree (archived_at);
CREATE INDEX idx_archived_files_file_id ON public.archived_files USING btree (file_id);
CREATE INDEX idx_archived_files_policy_id ON public.archived_files USING btree (policy_id);
CREATE INDEX idx_archived_files_restored ON public.archived_files USING btree (is_restored);
CREATE INDEX idx_archived_files_storage_type ON public.archived_files USING btree (archive_storage_type);


-- public.bulk_profiling_files definition

-- Drop table

-- DROP TABLE public.bulk_profiling_files;

CREATE TABLE public.bulk_profiling_files (
	id serial4 NOT NULL,
	job_id varchar(36) NOT NULL,
	file_path text NOT NULL,
	file_name varchar(255) NOT NULL,
	file_size int8 NULL,
	file_type varchar(50) NULL,
	status varchar(50) DEFAULT 'pending'::character varying NULL,
	file_id varchar(255) NULL,
	error_message text NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	started_at timestamp NULL,
	completed_at timestamp NULL,
	CONSTRAINT bulk_profiling_files_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_bulk_profiling_files_job_id ON public.bulk_profiling_files USING btree (job_id);
CREATE INDEX idx_bulk_profiling_files_status ON public.bulk_profiling_files USING btree (status);


-- public.bulk_profiling_jobs definition

-- Drop table

-- DROP TABLE public.bulk_profiling_jobs;

CREATE TABLE public.bulk_profiling_jobs (
	id varchar(36) NOT NULL,
	job_name varchar(255) NOT NULL,
	project_id int4 NULL,
	connection_id varchar(255) NOT NULL,
	s3_path text NOT NULL,
	file_pattern varchar(255) DEFAULT '*'::character varying NULL,
	duplicate_handling varchar(50) DEFAULT 'skip'::character varying NULL,
	"recursive" bool DEFAULT false NULL,
	status varchar(50) DEFAULT 'pending'::character varying NULL,
	total_files int4 DEFAULT 0 NULL,
	processed_files int4 DEFAULT 0 NULL,
	successful_files int4 DEFAULT 0 NULL,
	failed_files int4 DEFAULT 0 NULL,
	execution_type varchar(50) DEFAULT 'manual'::character varying NULL,
	error_message text NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT now() NULL,
	started_at timestamp NULL,
	completed_at timestamp NULL,
	updated_at timestamp DEFAULT now() NULL,
	schedule_id varchar(36) NULL,
	skipped_files int4 DEFAULT 0 NULL,
	sub_project_id int4 NULL,
	quality_rule_ids _int4 NULL,
	CONSTRAINT bulk_profiling_jobs_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_bulk_profiling_jobs_created_by ON public.bulk_profiling_jobs USING btree (created_by);
CREATE INDEX idx_bulk_profiling_jobs_status ON public.bulk_profiling_jobs USING btree (status);


-- public.business_processes definition

-- Drop table

-- DROP TABLE public.business_processes;

CREATE TABLE public.business_processes (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	description text NULL,
	group_id int4 NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	project_id int4 NOT NULL,
	CONSTRAINT business_processes_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_business_processes_group_id ON public.business_processes USING btree (group_id);
CREATE INDEX idx_business_processes_project_id ON public.business_processes USING btree (project_id);
CREATE INDEX idx_business_processes_updated_at ON public.business_processes USING btree (updated_at DESC);


-- public.column_governance_tag_assignments definition

-- Drop table

-- DROP TABLE public.column_governance_tag_assignments;

CREATE TABLE public.column_governance_tag_assignments (
	assignment_id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	column_name varchar(255) NOT NULL,
	tag_id varchar(255) NOT NULL,
	assigned_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT column_governance_tag_assignments_pkey PRIMARY KEY (assignment_id),
	CONSTRAINT unique_column_tag UNIQUE (file_id, column_name, tag_id)
);
CREATE INDEX idx_column_tag_column ON public.column_governance_tag_assignments USING btree (file_id, column_name);
CREATE INDEX idx_column_tag_file_id ON public.column_governance_tag_assignments USING btree (file_id);


-- public.column_mappings definition

-- Drop table

-- DROP TABLE public.column_mappings;

CREATE TABLE public.column_mappings (
	id serial4 NOT NULL,
	mapping_name varchar(255) NOT NULL,
	source_file_id varchar(255) NULL,
	target_file_type varchar(50) NOT NULL,
	mapping_config jsonb NOT NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	last_used_at timestamptz NULL,
	CONSTRAINT column_mappings_pkey PRIMARY KEY (id)
);


-- public.column_policy_assignments definition

-- Drop table

-- DROP TABLE public.column_policy_assignments;

CREATE TABLE public.column_policy_assignments (
	assignment_id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	column_name varchar(255) NOT NULL,
	policy_id varchar(255) NOT NULL,
	assigned_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT column_policy_assignments_pkey PRIMARY KEY (assignment_id),
	CONSTRAINT unique_column_policy UNIQUE (file_id, column_name, policy_id)
);
CREATE INDEX idx_column_policy_column ON public.column_policy_assignments USING btree (file_id, column_name);
CREATE INDEX idx_column_policy_file_id ON public.column_policy_assignments USING btree (file_id);


-- public.column_sensitivity_tags definition

-- Drop table

-- DROP TABLE public.column_sensitivity_tags;

CREATE TABLE public.column_sensitivity_tags (
	tag_id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	column_name varchar(255) NOT NULL,
	sensitivity_level varchar(50) NOT NULL,
	data_type varchar(100) NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	tagged_by varchar(255) NULL,
	tagged_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	classification_level varchar(50) DEFAULT 'unclassified'::character varying NOT NULL,
	CONSTRAINT column_sensitivity_tags_pkey PRIMARY KEY (tag_id),
	CONSTRAINT unique_file_column_tag UNIQUE (file_id, column_name)
);
CREATE INDEX idx_column_tags_classification ON public.column_sensitivity_tags USING btree (sensitivity_level);
CREATE INDEX idx_column_tags_file_id ON public.column_sensitivity_tags USING btree (file_id);


-- public.dlq_jobs definition

-- Drop table

-- DROP TABLE public.dlq_jobs;

CREATE TABLE public.dlq_jobs (
	id serial4 NOT NULL,
	job_type varchar(50) NOT NULL,
	file_id varchar(255) NULL,
	project_id int4 NULL,
	vendor_agreement_id int4 NULL,
	original_payload jsonb NULL,
	error_code varchar(100) NOT NULL,
	error_message text NOT NULL,
	stack_trace text NULL,
	remediation_instructions text NULL,
	retry_count int4 DEFAULT 0 NULL,
	max_retries int4 DEFAULT 3 NULL,
	status varchar(50) DEFAULT 'pending'::character varying NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	resolved_at timestamptz NULL,
	resolved_by int4 NULL,
	resolution_notes text NULL,
	CONSTRAINT dlq_jobs_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_dlq_jobs_created_at ON public.dlq_jobs USING btree (created_at);
CREATE INDEX idx_dlq_jobs_error_code ON public.dlq_jobs USING btree (error_code);
CREATE INDEX idx_dlq_jobs_file_id ON public.dlq_jobs USING btree (file_id);
CREATE INDEX idx_dlq_jobs_project_id ON public.dlq_jobs USING btree (project_id);
CREATE INDEX idx_dlq_jobs_status ON public.dlq_jobs USING btree (status);
CREATE INDEX idx_dlq_jobs_vendor_agreement ON public.dlq_jobs USING btree (vendor_agreement_id) WHERE (vendor_agreement_id IS NOT NULL);

-- Table Triggers

create trigger update_dlq_jobs_updated_at before
update
    on
    public.dlq_jobs for each row execute function update_updated_at_column();


-- public.drop_location_config definition

-- Drop table

-- DROP TABLE public.drop_location_config;

CREATE TABLE public.drop_location_config (
	id serial4 NOT NULL,
	storage_type varchar(50) DEFAULT 's3'::character varying NOT NULL, -- Storage provider type: s3, gcs, azure
	region varchar(100) NULL,
	bucket varchar(255) NOT NULL,
	path_prefix varchar(500) NULL, -- Optional path prefix within bucket for drop files
	access_key_id text NULL, -- Encrypted AWS access key or equivalent
	secret_access_key text NULL, -- Encrypted secret access key
	endpoint varchar(500) NULL,
	use_ssl bool DEFAULT true NULL,
	is_active bool DEFAULT true NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	created_by int4 NULL,
	updated_by int4 NULL,
	provider varchar(50) DEFAULT 'aws'::character varying NULL,
	project_id varchar(255) NULL,
	service_account_json text NULL,
	gcp_bucket varchar(255) NULL,
	account_name varchar(255) NULL,
	account_key text NULL,
	container_name varchar(255) NULL,
	azure_endpoint varchar(500) NULL,
	CONSTRAINT drop_location_config_pkey PRIMARY KEY (id)
);
COMMENT ON TABLE public.drop_location_config IS 'Stores S3/cloud storage configuration for drop file uploads (single location allowed)';

-- Column comments

COMMENT ON COLUMN public.drop_location_config.storage_type IS 'Storage provider type: s3, gcs, azure';
COMMENT ON COLUMN public.drop_location_config.path_prefix IS 'Optional path prefix within bucket for drop files';
COMMENT ON COLUMN public.drop_location_config.access_key_id IS 'Encrypted AWS access key or equivalent';
COMMENT ON COLUMN public.drop_location_config.secret_access_key IS 'Encrypted secret access key';


-- public.encrypted_passwords definition

-- Drop table

-- DROP TABLE public.encrypted_passwords;

CREATE TABLE public.encrypted_passwords (
	id serial4 NOT NULL,
	entity_type varchar(50) NOT NULL,
	entity_id text NOT NULL,
	secret_ciphertext text NOT NULL, -- AES-256-GCM encrypted password (or legacy AES-256-CBC)
	encryption_version varchar(20) DEFAULT 'v1'::character varying NOT NULL,
	iv text NOT NULL, -- Initialization vector for encryption/decryption
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	created_by int4 NULL,
	last_accessed_at timestamptz NULL,
	rotation_scheduled_at timestamptz NULL,
	auth_tag text NULL, -- GCM authentication tag for data integrity (null for legacy CBC entries)
	CONSTRAINT encrypted_passwords_pkey PRIMARY KEY (id),
	CONSTRAINT unique_entity_password UNIQUE (entity_type, entity_id)
);
CREATE INDEX idx_encrypted_passwords_entity ON public.encrypted_passwords USING btree (entity_type, entity_id);
CREATE INDEX idx_encrypted_passwords_rotation ON public.encrypted_passwords USING btree (rotation_scheduled_at) WHERE (rotation_scheduled_at IS NOT NULL);
COMMENT ON TABLE public.encrypted_passwords IS 'Stores AES-256-GCM encrypted passwords for password-protected archives with authentication';

-- Column comments

COMMENT ON COLUMN public.encrypted_passwords.secret_ciphertext IS 'AES-256-GCM encrypted password (or legacy AES-256-CBC)';
COMMENT ON COLUMN public.encrypted_passwords.iv IS 'Initialization vector for encryption/decryption';
COMMENT ON COLUMN public.encrypted_passwords.auth_tag IS 'GCM authentication tag for data integrity (null for legacy CBC entries)';


-- public.file_audit_details definition

-- Drop table

-- DROP TABLE public.file_audit_details;

CREATE TABLE public.file_audit_details (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	file_name varchar(500) NULL,
	file_schema_id varchar(255) NULL,
	file_hash varchar(255) NULL,
	file_pattern varchar(500) NULL,
	file_type varchar(100) NULL,
	file_delimiter varchar(10) NULL,
	"encoding" varchar(50) NULL,
	number_of_columns int4 NULL,
	"source" varchar(255) NULL,
	source_path text NULL,
	no_of_records_in_source int8 NULL,
	load_step_1 varchar(255) NULL,
	load_step_1_path text NULL,
	load_step_1_rec_cnt int8 NULL,
	load_type varchar(100) NULL,
	correlation_id varchar(255) NULL,
	parent_audit_id int4 NULL,
	user_id int4 NULL,
	user_email varchar(255) NULL,
	ip_address inet NULL,
	session_id varchar(255) NULL,
	processing_duration_ms int4 NULL,
	status varchar(50) DEFAULT 'success'::character varying NULL,
	error_message text NULL,
	error_type varchar(100) NULL,
	retention_until timestamp NULL,
	created_dt timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	created_by int4 NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	transformation_job_id int4 NULL,
	file_size_bytes int8 NULL,
	mapping_name varchar(500) NULL,
	file_role varchar(20) DEFAULT NULL::character varying NULL,
	CONSTRAINT file_audit_details_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_file_audit_correlation_id ON public.file_audit_details USING btree (correlation_id);
CREATE INDEX idx_file_audit_created_dt ON public.file_audit_details USING btree (created_dt);
CREATE INDEX idx_file_audit_file_id ON public.file_audit_details USING btree (file_id);
CREATE INDEX idx_file_audit_file_role ON public.file_audit_details USING btree (file_role);
CREATE INDEX idx_file_audit_parent ON public.file_audit_details USING btree (parent_audit_id);
CREATE INDEX idx_file_audit_status ON public.file_audit_details USING btree (status);


-- public.file_columns definition

-- Drop table

-- DROP TABLE public.file_columns;

CREATE TABLE public.file_columns (
	id serial4 NOT NULL,
	file_id varchar(255) NULL,
	column_name varchar(255) NOT NULL,
	column_type varchar(50) NOT NULL,
	column_index int4 NOT NULL,
	null_count int4 NULL,
	unique_count int4 NULL,
	min_value text NULL,
	max_value text NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	file_name varchar(255) NULL,
	most_frequent_value text NULL,
	least_frequent_value text NULL,
	min_value_decimal numeric(30, 6) NULL,
	max_value_decimal numeric(30, 6) NULL,
	top_values json NULL,
	most_frequent_count int4 NULL,
	least_frequent_count int4 NULL,
	min_frequency int4 NULL,
	max_frequency int4 NULL,
	min_is_frequent bool NULL,
	max_is_frequent bool NULL,
	patterns jsonb NULL,
	retention_until timestamp DEFAULT (now() + '1 year 6 mons'::interval) NULL,
	profile_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	file_role varchar(20) DEFAULT 'adhoc'::character varying NULL,
	null_percentage numeric(5, 2) NULL,
	CONSTRAINT file_columns_file_id_column_name_file_role_key UNIQUE (file_id, column_name, file_role),
	CONSTRAINT file_columns_file_role_check CHECK (((file_role)::text = ANY (ARRAY[('source'::character varying)::text, ('target'::character varying)::text, ('adhoc'::character varying)::text]))),
	CONSTRAINT file_columns_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_file_columns_file_id ON public.file_columns USING btree (file_id);
CREATE INDEX idx_file_columns_file_timestamp ON public.file_columns USING btree (file_id, profile_timestamp DESC);


-- public.file_history definition

-- Drop table

-- DROP TABLE public.file_history;

CREATE TABLE public.file_history (
	id serial4 NOT NULL,
	file_id varchar(255) NULL,
	row_count int4 NULL,
	column_count int4 NULL,
	quality_score numeric(5, 2) NULL,
	changed_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	changes_detected jsonb NULL,
	CONSTRAINT file_history_pkey PRIMARY KEY (id)
);


-- public.file_lineage definition

-- Drop table

-- DROP TABLE public.file_lineage;

CREATE TABLE public.file_lineage (
	id serial4 NOT NULL,
	source_file_id varchar(255) NOT NULL,
	target_file_id varchar(255) NOT NULL,
	relationship_type varchar(50) NOT NULL,
	transformation_details jsonb NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT file_lineage_pkey PRIMARY KEY (id)
);


-- public.file_ownership definition

-- Drop table

-- DROP TABLE public.file_ownership;

CREATE TABLE public.file_ownership (
	ownership_id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	owner_user_id int4 NULL,
	owner_name varchar(255) NULL,
	owner_email varchar(255) NULL,
	owner_contact varchar(100) NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	sensitivity_level varchar(50) DEFAULT 'Public'::character varying NULL,
	creator_user_id int4 NULL,
	creator_name varchar(255) NULL,
	creator_email varchar(255) NULL,
	CONSTRAINT file_ownership_file_id_key UNIQUE (file_id),
	CONSTRAINT file_ownership_pkey PRIMARY KEY (ownership_id)
);
CREATE INDEX idx_file_ownership_file_id ON public.file_ownership USING btree (file_id);
CREATE INDEX idx_file_ownership_user_id ON public.file_ownership USING btree (owner_user_id);


-- public.file_policy_assignments definition

-- Drop table

-- DROP TABLE public.file_policy_assignments;

CREATE TABLE public.file_policy_assignments (
	assignment_id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	policy_id varchar(255) NOT NULL,
	assigned_by int4 NULL,
	assigned_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT file_policy_assignments_pkey PRIMARY KEY (assignment_id),
	CONSTRAINT unique_file_policy UNIQUE (file_id, policy_id)
);
CREATE INDEX idx_policy_assignments_file_id ON public.file_policy_assignments USING btree (file_id);
CREATE INDEX idx_policy_assignments_policy_id ON public.file_policy_assignments USING btree (policy_id);


-- public.file_preview_data definition

-- Drop table

-- DROP TABLE public.file_preview_data;

CREATE TABLE public.file_preview_data (
	preview_id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	"row_number" int4 NOT NULL,
	row_data jsonb NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT file_preview_data_pkey PRIMARY KEY (preview_id),
	CONSTRAINT unique_file_row UNIQUE (file_id, row_number)
);
CREATE INDEX idx_file_preview_data_created_at ON public.file_preview_data USING btree (created_at);
CREATE INDEX idx_file_preview_data_file_id ON public.file_preview_data USING btree (file_id);


-- public.file_processing_artifacts definition

-- Drop table

-- DROP TABLE public.file_processing_artifacts;

CREATE TABLE public.file_processing_artifacts (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	artifact_type varchar(50) NOT NULL,
	storage_uri text NOT NULL,
	file_size_bytes int8 NULL,
	checksum_sha256 varchar(64) NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	created_by int4 NULL,
	CONSTRAINT file_processing_artifacts_pkey PRIMARY KEY (id),
	CONSTRAINT unique_file_artifact UNIQUE (file_id, artifact_type)
);
CREATE INDEX idx_artifacts_file_id ON public.file_processing_artifacts USING btree (file_id);
CREATE INDEX idx_artifacts_type ON public.file_processing_artifacts USING btree (artifact_type);
COMMENT ON TABLE public.file_processing_artifacts IS 'Tracks standardized artifacts (CSV, Parquet, metadata JSON) generated from processed files';


-- public.file_quality_rules definition

-- Drop table

-- DROP TABLE public.file_quality_rules;

CREATE TABLE public.file_quality_rules (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	quality_rule_id int4 NOT NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	target_columns _text DEFAULT ARRAY[]::text[] NULL,
	CONSTRAINT file_quality_rules_pkey PRIMARY KEY (id),
	CONSTRAINT unique_file_quality_rule UNIQUE (file_id, quality_rule_id)
);
CREATE INDEX idx_file_quality_rules_file_id ON public.file_quality_rules USING btree (file_id);
CREATE INDEX idx_file_quality_rules_rule_id ON public.file_quality_rules USING btree (quality_rule_id);


-- public.file_restorations definition

-- Drop table

-- DROP TABLE public.file_restorations;

CREATE TABLE public.file_restorations (
	id serial4 NOT NULL,
	archived_file_id int4 NULL,
	file_id varchar(255) NOT NULL,
	restored_to_path varchar(1000) NULL,
	restoration_method varchar(50) DEFAULT 'full'::character varying NULL,
	status varchar(50) DEFAULT 'pending'::character varying NULL,
	error_message text NULL,
	requested_by int4 NULL,
	requested_at timestamp DEFAULT now() NULL,
	started_at timestamp NULL,
	completed_at timestamp NULL,
	restoration_reason text NULL,
	restored_size_bytes int8 NULL,
	verification_status varchar(50) NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT file_restorations_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_file_restorations_archived_file ON public.file_restorations USING btree (archived_file_id);
CREATE INDEX idx_file_restorations_requested_at ON public.file_restorations USING btree (requested_at);
CREATE INDEX idx_file_restorations_status ON public.file_restorations USING btree (status);


-- public.file_schedules definition

-- Drop table

-- DROP TABLE public.file_schedules;

CREATE TABLE public.file_schedules (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	frequency varchar(50) NOT NULL,
	"time" varchar(10) NULL,
	"day" int4 NULL,
	is_active bool DEFAULT true NULL,
	last_run timestamp NULL,
	next_run timestamp NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	created_by varchar(255) NULL,
	project_id int4 NOT NULL,
	sub_project_id int4 NULL,
	CONSTRAINT file_schedules_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_file_schedules_file_id ON public.file_schedules USING btree (file_id);


-- public.file_schemas definition

-- Drop table

-- DROP TABLE public.file_schemas;

CREATE TABLE public.file_schemas (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	file_name varchar(500) NOT NULL,
	file_pattern varchar(500) NULL,
	schema_definition jsonb NOT NULL,
	schema_hash varchar(64) NOT NULL,
	row_count int8 NULL,
	column_count int4 NULL,
	captured_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	logical_file_id varchar(255) NULL,
	CONSTRAINT file_schemas_file_id_schema_hash_key UNIQUE (file_id, schema_hash),
	CONSTRAINT file_schemas_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_file_schemas_file ON public.file_schemas USING btree (file_id);
CREATE INDEX idx_file_schemas_hash ON public.file_schemas USING btree (schema_hash);
CREATE INDEX idx_file_schemas_logical_file ON public.file_schemas USING btree (logical_file_id, captured_at DESC);
CREATE INDEX idx_file_schemas_pattern ON public.file_schemas USING btree (file_pattern);


-- public.file_tag_assignments definition

-- Drop table

-- DROP TABLE public.file_tag_assignments;

CREATE TABLE public.file_tag_assignments (
	assignment_id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	tag_id varchar(255) NOT NULL,
	assigned_by int4 NULL,
	assigned_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT file_tag_assignments_pkey PRIMARY KEY (assignment_id),
	CONSTRAINT unique_file_tag UNIQUE (file_id, tag_id)
);
CREATE INDEX idx_tag_assignments_file_id ON public.file_tag_assignments USING btree (file_id);
CREATE INDEX idx_tag_assignments_tag_id ON public.file_tag_assignments USING btree (tag_id);


-- public.files definition

-- Drop table

-- DROP TABLE public.files;

CREATE TABLE public.files (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	filename varchar(255) NOT NULL,
	file_type varchar(50) NOT NULL,
	file_size int8 NOT NULL,
	row_count int4 NULL,
	column_count int4 NULL,
	quality_score numeric(5, 2) NULL,
	processed_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	checksum varchar(255) NULL,
	metadata jsonb NULL,
	duplicate_records_count int4 DEFAULT 0 NULL,
	duplicate_records_percentage numeric(5, 2) DEFAULT 0.00 NULL,
	schema_definition jsonb NULL,
	processing_step varchar(50) DEFAULT 'pending'::character varying NULL,
	project_id int4 NOT NULL,
	processing_error text NULL,
	is_vendor_file bool DEFAULT false NULL,
	correlation_id varchar(255) NULL,
	file_role varchar(50) NULL,
	logical_file_id varchar(255) NULL,
	sub_project_id int4 NULL, -- Links file to a sub-project (child project). User access cascades from parent project.
	contains_pii bool DEFAULT false NULL,
	data_classification varchar(50) NULL,
	vendor_agreement_id int4 NULL,
	source_format varchar(50) NULL, -- Original format before conversion (sas7bdat, xpt, avro, dat, etc.)
	format_metadata jsonb NULL, -- Format-specific metadata (SAS labels, Avro schema, DAT layout specification)
	is_archive bool DEFAULT false NULL, -- TRUE if file is a ZIP/tar archive containing other files
	archive_format varchar(20) NULL, -- Archive format: zip, tar, tar.gz, tar.bz2
	is_password_protected bool DEFAULT false NULL, -- TRUE if archive requires password for extraction
	member_count int4 NULL, -- Number of files contained in archive
	parent_archive_id varchar(255) NULL, -- References parent archive if this file was extracted from an archive
	failure_reason_code public."file_failure_reason" NULL, -- Database-enforced failure reason code. Use processing_error column for human-readable actionable messages.
	CONSTRAINT files_file_id_key UNIQUE (file_id),
	CONSTRAINT files_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_files_correlation_id ON public.files USING btree (correlation_id);
CREATE INDEX idx_files_created_at ON public.files USING btree (created_at DESC);
CREATE INDEX idx_files_failure_reason_code ON public.files USING btree (failure_reason_code) WHERE (failure_reason_code IS NOT NULL);
CREATE INDEX idx_files_file_role ON public.files USING btree (file_role);
CREATE INDEX idx_files_is_archive ON public.files USING btree (is_archive) WHERE (is_archive = true);
CREATE INDEX idx_files_logical_file ON public.files USING btree (logical_file_id);
CREATE INDEX idx_files_parent_archive ON public.files USING btree (parent_archive_id) WHERE (parent_archive_id IS NOT NULL);
CREATE INDEX idx_files_project_created ON public.files USING btree (project_id, created_at DESC) WHERE (project_id IS NOT NULL);
CREATE INDEX idx_files_project_id ON public.files USING btree (project_id);
CREATE INDEX idx_files_source_format ON public.files USING btree (source_format) WHERE (source_format IS NOT NULL);
CREATE INDEX idx_files_sub_project ON public.files USING btree (sub_project_id);
CREATE INDEX idx_files_updated_at ON public.files USING btree (updated_at DESC);
CREATE INDEX idx_files_vendor_agreement_created ON public.files USING btree (vendor_agreement_id, created_at DESC) WHERE (vendor_agreement_id IS NOT NULL);
CREATE INDEX idx_files_vendor_agreement_id ON public.files USING btree (vendor_agreement_id);

-- Column comments

COMMENT ON COLUMN public.files.sub_project_id IS 'Links file to a sub-project (child project). User access cascades from parent project.';
COMMENT ON COLUMN public.files.source_format IS 'Original format before conversion (sas7bdat, xpt, avro, dat, etc.)';
COMMENT ON COLUMN public.files.format_metadata IS 'Format-specific metadata (SAS labels, Avro schema, DAT layout specification)';
COMMENT ON COLUMN public.files.is_archive IS 'TRUE if file is a ZIP/tar archive containing other files';
COMMENT ON COLUMN public.files.archive_format IS 'Archive format: zip, tar, tar.gz, tar.bz2';
COMMENT ON COLUMN public.files.is_password_protected IS 'TRUE if archive requires password for extraction';
COMMENT ON COLUMN public.files.member_count IS 'Number of files contained in archive';
COMMENT ON COLUMN public.files.parent_archive_id IS 'References parent archive if this file was extracted from an archive';
COMMENT ON COLUMN public.files.failure_reason_code IS 'Database-enforced failure reason code. Use processing_error column for human-readable actionable messages.';


-- public.fixed_width_schemas definition

-- Drop table

-- DROP TABLE public.fixed_width_schemas;

CREATE TABLE public.fixed_width_schemas (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	schema_definition jsonb NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	created_by int4 NULL,
	CONSTRAINT fixed_width_schemas_file_id_key UNIQUE (file_id),
	CONSTRAINT fixed_width_schemas_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_fixed_width_schemas_file_id ON public.fixed_width_schemas USING btree (file_id);


-- public.governance_policies definition

-- Drop table

-- DROP TABLE public.governance_policies;

CREATE TABLE public.governance_policies (
	policy_id varchar(255) NOT NULL,
	policy_name varchar(255) NOT NULL,
	description text NULL,
	rules jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT governance_policies_pkey PRIMARY KEY (policy_id)
);


-- public.governance_tags definition

-- Drop table

-- DROP TABLE public.governance_tags;

CREATE TABLE public.governance_tags (
	tag_id varchar(255) NOT NULL,
	tag_name varchar(255) NOT NULL,
	description text NULL,
	color varchar(50) DEFAULT '#3B82F6'::character varying NULL,
	badge_style varchar(50) DEFAULT 'default'::character varying NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	permission_required varchar(255) DEFAULT NULL::character varying NULL, -- Base permission name (e.g., pii, confidential) - system will check tag:permission:read and tag:permission:edit
	requires_view_permission bool DEFAULT false NULL,
	requires_edit_permission bool DEFAULT false NULL,
	sensitivity_level varchar(50) DEFAULT 'public'::character varying NULL, -- Sensitivity level: public (anyone), restricted (requires permission), private (admin only)
	CONSTRAINT governance_tags_pkey PRIMARY KEY (tag_id),
	CONSTRAINT governance_tags_tag_name_key UNIQUE (tag_name)
);

-- Column comments

COMMENT ON COLUMN public.governance_tags.permission_required IS 'Base permission name (e.g., pii, confidential) - system will check tag:permission:read and tag:permission:edit';
COMMENT ON COLUMN public.governance_tags.sensitivity_level IS 'Sensitivity level: public (anyone), restricted (requires permission), private (admin only)';


-- public.group_policy_attachments definition

-- Drop table

-- DROP TABLE public.group_policy_attachments;

CREATE TABLE public.group_policy_attachments (
	group_id int4 NOT NULL,
	policy_id int4 NOT NULL,
	attached_by int4 NULL,
	attached_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT group_policy_attachments_pkey PRIMARY KEY (group_id, policy_id)
);
CREATE INDEX idx_group_policy_attachments_group ON public.group_policy_attachments USING btree (group_id);
CREATE INDEX idx_group_policy_attachments_policy ON public.group_policy_attachments USING btree (policy_id);


-- public.idempotency_keys definition

-- Drop table

-- DROP TABLE public.idempotency_keys;

CREATE TABLE public.idempotency_keys (
	id serial4 NOT NULL,
	"key" varchar(255) NOT NULL,
	resource_type varchar(100) NOT NULL,
	resource_id int4 NULL,
	response_status int4 NULL,
	response_body jsonb NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	expires_at timestamp NOT NULL,
	user_id int4 NULL,
	CONSTRAINT idempotency_keys_key_key UNIQUE (key),
	CONSTRAINT idempotency_keys_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_idempotency_expires ON public.idempotency_keys USING btree (expires_at);
CREATE INDEX idx_idempotency_key ON public.idempotency_keys USING btree (key);
CREATE INDEX idx_idempotency_user ON public.idempotency_keys USING btree (user_id);


-- public.job_dependencies definition

-- Drop table

-- DROP TABLE public.job_dependencies;

CREATE TABLE public.job_dependencies (
	dependency_id serial4 NOT NULL,
	job_id int4 NOT NULL,
	depends_on_job_id int4 NOT NULL,
	dependency_type varchar(50) DEFAULT 'completion'::character varying NULL,
	wait_for_success bool DEFAULT true NULL,
	optional_dependency bool DEFAULT false NULL,
	timeout_minutes int4 NULL,
	created_by varchar(255) NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT job_dependencies_pkey PRIMARY KEY (dependency_id),
	CONSTRAINT no_self_dependency CHECK ((job_id <> depends_on_job_id)),
	CONSTRAINT unique_job_dependency UNIQUE (job_id, depends_on_job_id)
);
CREATE INDEX idx_job_dependencies_depends_on ON public.job_dependencies USING btree (depends_on_job_id);
CREATE INDEX idx_job_dependencies_job ON public.job_dependencies USING btree (job_id);


-- public.job_group_schedules definition

-- Drop table

-- DROP TABLE public.job_group_schedules;

CREATE TABLE public.job_group_schedules (
	group_schedule_id serial4 NOT NULL,
	group_id uuid NOT NULL,
	schedule_name varchar(255) NOT NULL,
	schedule_type varchar(50) NOT NULL,
	cron_expression varchar(100) NULL,
	enabled bool DEFAULT true NULL,
	execution_order varchar(50) DEFAULT 'parallel'::character varying NULL,
	max_concurrent_jobs int4 DEFAULT 5 NULL,
	retry_policy jsonb DEFAULT '{"maxRetries": 3, "retryDelay": 300}'::jsonb NULL,
	notification_settings jsonb NULL,
	created_by varchar(255) NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	project_id int4 NOT NULL,
	CONSTRAINT job_group_schedules_pkey PRIMARY KEY (group_schedule_id),
	CONSTRAINT valid_execution_order CHECK (((execution_order)::text = ANY (ARRAY[('parallel'::character varying)::text, ('sequential'::character varying)::text, ('dependency-based'::character varying)::text]))),
	CONSTRAINT valid_schedule_type CHECK (((schedule_type)::text = ANY (ARRAY[('cron'::character varying)::text, ('interval'::character varying)::text, ('manual'::character varying)::text])))
);
CREATE INDEX idx_job_group_schedules_enabled ON public.job_group_schedules USING btree (enabled) WHERE (enabled = true);
CREATE INDEX idx_job_group_schedules_group ON public.job_group_schedules USING btree (group_id);


-- public.job_history definition

-- Drop table

-- DROP TABLE public.job_history;

CREATE TABLE public.job_history (
	id serial4 NOT NULL,
	job_id int4 NULL,
	status varchar(50) NOT NULL,
	start_time timestamp NULL,
	end_time timestamp NULL,
	records_processed int4 NULL,
	errors_count int4 NULL,
	logs text NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT job_history_pkey PRIMARY KEY (id)
);


-- public.job_runs definition

-- Drop table

-- DROP TABLE public.job_runs;

CREATE TABLE public.job_runs (
	id serial4 NOT NULL,
	job_id int4 NULL,
	status varchar(50) NOT NULL,
	start_time timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	end_time timestamp NULL,
	records_processed int4 NULL,
	records_succeeded int4 NULL,
	records_failed int4 NULL,
	error_details jsonb NULL,
	triggered_by int4 NULL,
	run_details jsonb NULL,
	CONSTRAINT job_runs_pkey PRIMARY KEY (id)
);


-- public.job_schedules definition

-- Drop table

-- DROP TABLE public.job_schedules;

CREATE TABLE public.job_schedules (
	id serial4 NOT NULL,
	job_id int4 NOT NULL,
	"type" varchar(50) DEFAULT 'one-time'::character varying NOT NULL,
	one_time_date timestamp NULL,
	cron_expression varchar(100) NULL,
	enabled bool DEFAULT true NULL,
	next_run_time timestamp NULL,
	last_run_time timestamp NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	project_id int4 NOT NULL,
	CONSTRAINT job_schedules_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_job_schedules_job_id ON public.job_schedules USING btree (job_id);


-- public.jobs definition

-- Drop table

-- DROP TABLE public.jobs;

CREATE TABLE public.jobs (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	business_process_id int4 NULL,
	status varchar(50) DEFAULT 'draft'::character varying NULL,
	source_connection_id varchar(255) NULL,
	target_connection_id varchar(255) NULL,
	validation_settings jsonb NULL,
	error_handling_settings jsonb NULL,
	notification_settings jsonb NULL,
	schedule_settings jsonb NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT jobs_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_jobs_business_process_id ON public.jobs USING btree (business_process_id);
CREATE INDEX idx_jobs_updated_at ON public.jobs USING btree (updated_at DESC);


-- public.lineage_views definition

-- Drop table

-- DROP TABLE public.lineage_views;

CREATE TABLE public.lineage_views (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	root_type varchar(50) NOT NULL,
	root_id int4 NOT NULL,
	project_id int4 NULL,
	"depth" int4 DEFAULT 3 NULL,
	include_incidents bool DEFAULT true NULL,
	layout_state jsonb NULL,
	cached_graph jsonb NULL,
	user_id int4 NULL,
	created_at timestamptz DEFAULT now() NULL,
	updated_at timestamptz DEFAULT now() NULL,
	CONSTRAINT lineage_views_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_lineage_views_root ON public.lineage_views USING btree (root_type, root_id);
CREATE INDEX idx_lineage_views_user_id ON public.lineage_views USING btree (user_id);


-- public.logical_file_groups definition

-- Drop table

-- DROP TABLE public.logical_file_groups;

CREATE TABLE public.logical_file_groups (
	id serial4 NOT NULL,
	logical_file_id varchar(255) NOT NULL,
	project_id int4 NULL,
	canonical_name varchar(500) NOT NULL,
	file_pattern varchar(500) NULL,
	pattern_metadata jsonb NULL,
	first_upload_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	last_upload_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	upload_count int4 DEFAULT 0 NULL,
	has_schema_changes bool DEFAULT false NULL,
	last_schema_change_at timestamp NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT logical_file_groups_logical_file_id_key UNIQUE (logical_file_id),
	CONSTRAINT logical_file_groups_pkey PRIMARY KEY (id),
	CONSTRAINT logical_file_groups_project_id_canonical_name_key UNIQUE (project_id, canonical_name)
);
CREATE INDEX idx_logical_file_groups_canonical ON public.logical_file_groups USING btree (canonical_name);
CREATE INDEX idx_logical_file_groups_changes ON public.logical_file_groups USING btree (has_schema_changes) WHERE (has_schema_changes = true);
CREATE INDEX idx_logical_file_groups_pattern ON public.logical_file_groups USING btree (file_pattern);
CREATE INDEX idx_logical_file_groups_project ON public.logical_file_groups USING btree (project_id);


-- public.mapping_group_executions definition

-- Drop table

-- DROP TABLE public.mapping_group_executions;

CREATE TABLE public.mapping_group_executions (
	id serial4 NOT NULL,
	group_id int4 NOT NULL,
	execution_id text NOT NULL,
	status text DEFAULT 'running'::text NULL,
	total_mappings int4 DEFAULT 0 NULL,
	completed_mappings int4 DEFAULT 0 NULL,
	failed_mappings int4 DEFAULT 0 NULL,
	start_time timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	end_time timestamp NULL,
	duration_ms int4 NULL,
	triggered_by int4 NULL,
	error_message text NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	project_id int4 NOT NULL,
	CONSTRAINT mapping_group_executions_pkey PRIMARY KEY (id),
	CONSTRAINT mapping_group_executions_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);
CREATE INDEX idx_mapping_group_executions_group_id ON public.mapping_group_executions USING btree (group_id);
CREATE INDEX idx_mapping_group_executions_project_id ON public.mapping_group_executions USING btree (project_id);


-- public.mapping_group_members definition

-- Drop table

-- DROP TABLE public.mapping_group_members;

CREATE TABLE public.mapping_group_members (
	id serial4 NOT NULL,
	group_id int4 NOT NULL,
	mapping_id varchar(255) NOT NULL,
	execution_order int4 DEFAULT 0 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT mapping_group_members_group_id_mapping_id_key UNIQUE (group_id, mapping_id),
	CONSTRAINT mapping_group_members_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_mapping_group_members_group_id ON public.mapping_group_members USING btree (group_id);
CREATE INDEX idx_mapping_group_members_mapping_id ON public.mapping_group_members USING btree (mapping_id);


-- public.mapping_groups definition

-- Drop table

-- DROP TABLE public.mapping_groups;

CREATE TABLE public.mapping_groups (
	id serial4 NOT NULL,
	"name" text NOT NULL,
	description text NULL,
	max_concurrency int4 DEFAULT 10 NULL,
	created_by uuid NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	status text DEFAULT 'active'::text NULL,
	project_id int4 NOT NULL,
	sub_project_id int4 NULL,
	CONSTRAINT mapping_groups_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_mapping_groups_project_id ON public.mapping_groups USING btree (project_id);


-- public.n_step_workflow_assets definition

-- Drop table

-- DROP TABLE public.n_step_workflow_assets;

CREATE TABLE public.n_step_workflow_assets (
	id serial4 NOT NULL,
	step_id int4 NULL,
	asset_type varchar(20) NOT NULL,
	asset_id varchar(255) NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT n_step_workflow_assets_asset_type_check CHECK (((asset_type)::text = ANY (ARRAY[('mapping'::character varying)::text, ('mapping_group'::character varying)::text]))),
	CONSTRAINT n_step_workflow_assets_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_n_step_workflow_assets_step ON public.n_step_workflow_assets USING btree (step_id);


-- public.n_step_workflow_run_steps definition

-- Drop table

-- DROP TABLE public.n_step_workflow_run_steps;

CREATE TABLE public.n_step_workflow_run_steps (
	id serial4 NOT NULL,
	run_id int4 NULL,
	step_index int4 NOT NULL,
	status varchar(50) DEFAULT 'pending'::character varying NULL,
	start_time timestamp NULL,
	end_time timestamp NULL,
	duration_ms int8 NULL,
	jobs_count int4 DEFAULT 0 NULL,
	jobs_completed int4 DEFAULT 0 NULL,
	jobs_failed int4 DEFAULT 0 NULL,
	error_message text NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT n_step_workflow_run_steps_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_n_step_workflow_run_steps_run ON public.n_step_workflow_run_steps USING btree (run_id);


-- public.n_step_workflow_runs definition

-- Drop table

-- DROP TABLE public.n_step_workflow_runs;

CREATE TABLE public.n_step_workflow_runs (
	id serial4 NOT NULL,
	workflow_id int4 NULL,
	run_id varchar(255) NOT NULL,
	status varchar(50) DEFAULT 'running'::character varying NULL,
	triggered_by int4 NULL,
	start_time timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	end_time timestamp NULL,
	duration_ms int8 NULL,
	error_message text NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT n_step_workflow_runs_pkey PRIMARY KEY (id),
	CONSTRAINT n_step_workflow_runs_run_id_key UNIQUE (run_id)
);
CREATE INDEX idx_n_step_workflow_runs_workflow ON public.n_step_workflow_runs USING btree (workflow_id);


-- public.n_step_workflow_steps definition

-- Drop table

-- DROP TABLE public.n_step_workflow_steps;

CREATE TABLE public.n_step_workflow_steps (
	id serial4 NOT NULL,
	workflow_id int4 NULL,
	step_index int4 NOT NULL,
	is_active bool DEFAULT false NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT n_step_workflow_steps_pkey PRIMARY KEY (id),
	CONSTRAINT n_step_workflow_steps_workflow_id_step_index_key UNIQUE (workflow_id, step_index)
);
CREATE INDEX idx_n_step_workflow_steps_workflow ON public.n_step_workflow_steps USING btree (workflow_id);


-- public.n_step_workflows definition

-- Drop table

-- DROP TABLE public.n_step_workflows;

CREATE TABLE public.n_step_workflows (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	description text NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	project_id int4 NULL,
	sub_project_id int4 NULL,
	CONSTRAINT n_step_workflows_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_n_step_workflows_project_id ON public.n_step_workflows USING btree (project_id);


-- public.notifications definition

-- Drop table

-- DROP TABLE public.notifications;

CREATE TABLE public.notifications (
	id serial4 NOT NULL,
	user_id int4 NOT NULL,
	notification_type varchar(100) NOT NULL,
	title varchar(500) NOT NULL,
	message text NOT NULL,
	entity_type varchar(100) NULL,
	entity_id int4 NULL,
	action_url varchar(1000) NULL,
	is_read bool DEFAULT false NULL,
	read_at timestamp NULL,
	metadata jsonb NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	expires_at timestamp NULL,
	CONSTRAINT notifications_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_notifications_entity ON public.notifications USING btree (entity_type, entity_id);
CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (user_id, is_read);
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


-- public.password_reset_requests definition

-- Drop table

-- DROP TABLE public.password_reset_requests;

CREATE TABLE public.password_reset_requests (
	id serial4 NOT NULL,
	user_id int4 NULL,
	requested_at timestamp DEFAULT now() NOT NULL,
	status varchar(20) DEFAULT 'pending'::character varying NULL,
	approved_by int4 NULL,
	approved_at timestamp NULL,
	denied_at timestamp NULL,
	notes text NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT password_reset_requests_pkey PRIMARY KEY (id),
	CONSTRAINT password_reset_requests_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('approved'::character varying)::text, ('denied'::character varying)::text])))
);
CREATE INDEX idx_password_reset_requests_status ON public.password_reset_requests USING btree (status);
CREATE INDEX idx_password_reset_requests_user ON public.password_reset_requests USING btree (user_id);


-- public.processing_events definition

-- Drop table

-- DROP TABLE public.processing_events;

CREATE TABLE public.processing_events (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	job_id varchar(100) NULL,
	event_type varchar(50) NOT NULL,
	event_stage varchar(50) NULL,
	event_message text NOT NULL,
	progress_percentage int4 NULL,
	metadata jsonb NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT processing_events_pkey PRIMARY KEY (id),
	CONSTRAINT processing_events_progress_percentage_check CHECK (((progress_percentage >= 0) AND (progress_percentage <= 100)))
);
CREATE INDEX idx_processing_events_created_at ON public.processing_events USING btree (created_at);
CREATE INDEX idx_processing_events_file_id ON public.processing_events USING btree (file_id);
CREATE INDEX idx_processing_events_job_id ON public.processing_events USING btree (job_id);
CREATE INDEX idx_processing_events_stage ON public.processing_events USING btree (event_stage);
CREATE INDEX idx_processing_events_type ON public.processing_events USING btree (event_type);
COMMENT ON TABLE public.processing_events IS 'Detailed event log for file processing with progress tracking and error messages';


-- public.project_access_groups definition

-- Drop table

-- DROP TABLE public.project_access_groups;

CREATE TABLE public.project_access_groups (
	project_id int4 NOT NULL,
	group_id int4 NOT NULL,
	added_by int4 NULL,
	created_at timestamp DEFAULT now() NULL,
	CONSTRAINT project_access_groups_pkey PRIMARY KEY (project_id, group_id)
);
CREATE INDEX idx_project_access_groups_group_project ON public.project_access_groups USING btree (group_id, project_id);


-- public.project_members definition

-- Drop table

-- DROP TABLE public.project_members;

CREATE TABLE public.project_members (
	project_id int4 NOT NULL,
	user_id int4 NOT NULL,
	can_invite bool DEFAULT false NULL,
	can_manage_members bool DEFAULT false NULL,
	invited_by int4 NULL,
	invitation_accepted_at timestamp NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT project_members_project_user_unique UNIQUE (project_id, user_id)
);
CREATE INDEX idx_project_members_project ON public.project_members USING btree (project_id);
CREATE INDEX idx_project_members_user ON public.project_members USING btree (user_id);
CREATE INDEX idx_project_members_user_project ON public.project_members USING btree (user_id, project_id);

-- Table Triggers

create trigger update_project_members_updated_at before
update
    on
    public.project_members for each row execute function update_updated_at_column();


-- public.projects definition

-- Drop table

-- DROP TABLE public.projects;

CREATE TABLE public.projects (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	description text NULL,
	owner_id int4 NULL,
	parent_id int4 NULL,
	is_default bool DEFAULT false NULL,
	is_active bool DEFAULT true NULL,
	metadata jsonb DEFAULT '{}'::jsonb NULL,
	settings jsonb DEFAULT '{}'::jsonb NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	is_archived bool DEFAULT false NOT NULL, -- Whether the project is archived (soft deleted)
	project_type varchar(20) DEFAULT 'internal'::character varying NULL,
	CONSTRAINT check_not_self_parent CHECK ((id <> parent_id)),
	CONSTRAINT projects_pkey PRIMARY KEY (id),
	CONSTRAINT projects_project_type_check CHECK (((project_type)::text = ANY (ARRAY[('internal'::character varying)::text, ('external'::character varying)::text])))
);
CREATE INDEX idx_projects_active ON public.projects USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_projects_is_default ON public.projects USING btree (is_default) WHERE (is_default = true);
CREATE INDEX idx_projects_owner ON public.projects USING btree (owner_id);
CREATE UNIQUE INDEX idx_projects_owner_name_unique ON public.projects USING btree (owner_id, lower((name)::text));
CREATE INDEX idx_projects_parent ON public.projects USING btree (parent_id);

-- Column comments

COMMENT ON COLUMN public.projects.is_archived IS 'Whether the project is archived (soft deleted)';

-- Table Triggers

create trigger update_projects_updated_at before
update
    on
    public.projects for each row execute function update_updated_at_column();


-- public.quality_reports definition

-- Drop table

-- DROP TABLE public.quality_reports;

CREATE TABLE public.quality_reports (
	report_id varchar(255) NOT NULL,
	file_id varchar(255) NOT NULL,
	filename varchar(255) NOT NULL,
	quality_score numeric(5, 2) NULL,
	rules_evaluated int4 DEFAULT 0 NULL,
	rules_passed int4 DEFAULT 0 NULL,
	anomalies_detected int4 DEFAULT 0 NULL,
	report_data jsonb NULL,
	created_at timestamp DEFAULT now() NULL,
	CONSTRAINT quality_reports_pkey PRIMARY KEY (report_id)
);


-- public.quality_rule_configurations definition

-- Drop table

-- DROP TABLE public.quality_rule_configurations;

CREATE TABLE public.quality_rule_configurations (
	id serial4 NOT NULL,
	file_id varchar(255) NULL,
	rule_id int4 NULL,
	error_action varchar(20) DEFAULT 'log_continue'::character varying NOT NULL, -- Action to take on error: log_continue or log_abort
	apply_to varchar(20) DEFAULT 'both'::character varying NOT NULL, -- Where to apply: file_upload, etl_job, or both
	enabled bool DEFAULT true NULL,
	created_by int4 NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT quality_rule_configurations_pkey PRIMARY KEY (id),
	CONSTRAINT unique_file_rule UNIQUE (file_id, rule_id)
);
CREATE INDEX idx_quality_rule_configs_file ON public.quality_rule_configurations USING btree (file_id);
CREATE INDEX idx_quality_rule_configs_rule ON public.quality_rule_configurations USING btree (rule_id);
COMMENT ON TABLE public.quality_rule_configurations IS 'Defines error handling strategies (log_continue vs log_abort) for quality rules per file';

-- Column comments

COMMENT ON COLUMN public.quality_rule_configurations.error_action IS 'Action to take on error: log_continue or log_abort';
COMMENT ON COLUMN public.quality_rule_configurations.apply_to IS 'Where to apply: file_upload, etl_job, or both';


-- public.quality_rule_violations definition

-- Drop table

-- DROP TABLE public.quality_rule_violations;

CREATE TABLE public.quality_rule_violations (
	id serial4 NOT NULL,
	rule_id int4 NOT NULL,
	file_id varchar(255) NULL,
	job_id varchar(255) NULL,
	"row_number" int4 NULL,
	column_name varchar(255) NULL,
	expected_value text NULL,
	actual_value text NULL,
	violation_details jsonb NULL,
	severity varchar(20) NOT NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	primary_key_value text NULL,
	primary_key_column text NULL,
	status varchar(20) DEFAULT 'new'::character varying NULL,
	processing_action varchar(20) NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	resolved_by int4 NULL,
	resolved_at timestamptz NULL,
	resolution_notes text NULL,
	record_snapshot jsonb NULL,
	CONSTRAINT chk_file_or_job CHECK ((((file_id IS NOT NULL) AND (job_id IS NULL)) OR ((file_id IS NULL) AND (job_id IS NOT NULL)))),
	CONSTRAINT quality_rule_violations_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_quality_rule_violations_created_at ON public.quality_rule_violations USING btree (created_at DESC);
CREATE INDEX idx_quality_rule_violations_file_id ON public.quality_rule_violations USING btree (file_id);
CREATE INDEX idx_quality_rule_violations_job_id ON public.quality_rule_violations USING btree (job_id);
CREATE INDEX idx_quality_rule_violations_rule_id ON public.quality_rule_violations USING btree (rule_id);
CREATE INDEX idx_quality_rule_violations_severity ON public.quality_rule_violations USING btree (severity);
CREATE INDEX idx_quality_rule_violations_status ON public.quality_rule_violations USING btree (status);
COMMENT ON TABLE public.quality_rule_violations IS 'Violations of quality rules during file uploads and ETL executions';

-- Constraint comments

COMMENT ON CONSTRAINT chk_file_or_job ON public.quality_rule_violations IS 'Violation must be associated with either a file or a job, not both';


-- public.quality_rules definition

-- Drop table

-- DROP TABLE public.quality_rules;

CREATE TABLE public.quality_rules (
	id serial4 NOT NULL,
	rule_name varchar(255) NOT NULL,
	rule_type varchar(50) NOT NULL, -- Type of quality check: completeness, validity, consistency, uniqueness, freshness
	description text NULL,
	column_name varchar(255) NULL,
	rule_config jsonb NOT NULL, -- JSON configuration specific to the rule type (thresholds, patterns, etc.)
	severity varchar(20) DEFAULT 'warning'::character varying NOT NULL,
	enabled bool DEFAULT true NULL,
	project_id int4 NULL,
	created_by int4 NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	sub_project_id int4 NULL,
	CONSTRAINT quality_rules_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_quality_rules_enabled ON public.quality_rules USING btree (enabled);
CREATE INDEX idx_quality_rules_project_id ON public.quality_rules USING btree (project_id);
CREATE INDEX idx_quality_rules_type ON public.quality_rules USING btree (rule_type);
COMMENT ON TABLE public.quality_rules IS 'Data quality rule definitions for validating files and ETL mappings';

-- Column comments

COMMENT ON COLUMN public.quality_rules.rule_type IS 'Type of quality check: completeness, validity, consistency, uniqueness, freshness';
COMMENT ON COLUMN public.quality_rules.rule_config IS 'JSON configuration specific to the rule type (thresholds, patterns, etc.)';


-- public.rbac_policies definition

-- Drop table

-- DROP TABLE public.rbac_policies;

CREATE TABLE public.rbac_policies (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	description text NULL,
	policy_type varchar(50) NOT NULL,
	project_id int4 NULL,
	is_global bool DEFAULT false NULL,
	policy_document jsonb NOT NULL,
	created_by int4 NULL,
	is_active bool DEFAULT true NULL,
	"version" int4 DEFAULT 1 NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT policy_document_not_empty CHECK ((jsonb_typeof(policy_document) = 'object'::text)),
	CONSTRAINT rbac_policies_pkey PRIMARY KEY (id),
	CONSTRAINT unique_policy_name_per_project UNIQUE (name, project_id),
	CONSTRAINT valid_policy_type CHECK (((policy_type)::text = ANY (ARRAY[('IDENTITY'::character varying)::text, ('RESOURCE'::character varying)::text])))
);
CREATE INDEX idx_rbac_policies_active ON public.rbac_policies USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_rbac_policies_global ON public.rbac_policies USING btree (is_global) WHERE (is_global = true);
CREATE INDEX idx_rbac_policies_project ON public.rbac_policies USING btree (project_id) WHERE (project_id IS NOT NULL);
CREATE INDEX idx_rbac_policies_type ON public.rbac_policies USING btree (policy_type);

-- Table Triggers

create trigger update_rbac_policies_updated_at before
update
    on
    public.rbac_policies for each row execute function update_updated_at_column();


-- public.refresh_tokens definition

-- Drop table

-- DROP TABLE public.refresh_tokens;

CREATE TABLE public.refresh_tokens (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	user_id int4 NOT NULL,
	"token" varchar(255) NOT NULL,
	user_agent text NULL,
	ip_address varchar(45) NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	expires_at timestamp NOT NULL,
	is_revoked bool DEFAULT false NULL,
	revoked_at timestamp NULL,
	CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id),
	CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token)
);
CREATE INDEX idx_refresh_tokens_expires_at ON public.refresh_tokens USING btree (expires_at);
CREATE INDEX idx_refresh_tokens_token_hash ON public.refresh_tokens USING btree (token);
CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


-- public.resource_attributes definition

-- Drop table

-- DROP TABLE public.resource_attributes;

CREATE TABLE public.resource_attributes (
	id serial4 NOT NULL,
	resource_type varchar(50) NOT NULL,
	resource_id varchar(255) NOT NULL,
	attribute_key varchar(100) NOT NULL,
	attribute_value text NOT NULL,
	attribute_type varchar(50) DEFAULT 'STRING'::character varying NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT resource_attributes_pkey PRIMARY KEY (id),
	CONSTRAINT unique_resource_attribute UNIQUE (resource_type, resource_id, attribute_key)
);
CREATE INDEX idx_resource_attributes_key ON public.resource_attributes USING btree (attribute_key);
CREATE INDEX idx_resource_attributes_resource ON public.resource_attributes USING btree (resource_type, resource_id);
CREATE INDEX idx_resource_attributes_type ON public.resource_attributes USING btree (resource_type);

-- Table Triggers

create trigger update_resource_attributes_updated_at before
update
    on
    public.resource_attributes for each row execute function update_updated_at_column();


-- public.resource_policy_attachments definition

-- Drop table

-- DROP TABLE public.resource_policy_attachments;

CREATE TABLE public.resource_policy_attachments (
	resource_type varchar(50) NOT NULL,
	resource_id varchar(255) NOT NULL,
	policy_id int4 NOT NULL,
	attached_by int4 NULL,
	attached_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT resource_policy_attachments_pkey PRIMARY KEY (resource_type, resource_id, policy_id)
);
CREATE INDEX idx_resource_policy_attachments_policy ON public.resource_policy_attachments USING btree (policy_id);
CREATE INDEX idx_resource_policy_attachments_resource ON public.resource_policy_attachments USING btree (resource_type, resource_id);
CREATE INDEX idx_resource_policy_attachments_type ON public.resource_policy_attachments USING btree (resource_type);


-- public.retention_policies definition

-- Drop table

-- DROP TABLE public.retention_policies;

CREATE TABLE public.retention_policies (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	description text NULL,
	enabled bool DEFAULT true NULL,
	retention_days int4 NULL,
	min_quality_score numeric(5, 2) NULL,
	max_file_size_mb int4 NULL,
	file_types _varchar NULL,
	tags _varchar NULL,
	access_pattern varchar(50) NULL,
	custom_condition text NULL,
	archive_storage_type varchar(50) NOT NULL,
	archive_connection_id uuid NULL,
	archive_path_prefix varchar(500) NULL,
	priority int4 DEFAULT 50 NULL,
	last_run_at timestamp NULL,
	next_run_at timestamp NULL,
	run_frequency varchar(50) DEFAULT 'daily'::character varying NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_by int4 NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT retention_policies_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_retention_policies_enabled ON public.retention_policies USING btree (enabled);
CREATE INDEX idx_retention_policies_next_run ON public.retention_policies USING btree (next_run_at) WHERE (enabled = true);
CREATE INDEX idx_retention_policies_priority ON public.retention_policies USING btree (priority);


-- public.retention_policy_runs definition

-- Drop table

-- DROP TABLE public.retention_policy_runs;

CREATE TABLE public.retention_policy_runs (
	id serial4 NOT NULL,
	policy_id int4 NULL,
	started_at timestamp DEFAULT now() NULL,
	completed_at timestamp NULL,
	status varchar(50) DEFAULT 'running'::character varying NULL,
	error_message text NULL,
	files_evaluated int4 DEFAULT 0 NULL,
	files_archived int4 DEFAULT 0 NULL,
	files_skipped int4 DEFAULT 0 NULL,
	total_bytes_archived int8 DEFAULT 0 NULL,
	triggered_by varchar(50) DEFAULT 'scheduler'::character varying NULL,
	executed_by int4 NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT retention_policy_runs_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_retention_runs_policy ON public.retention_policy_runs USING btree (policy_id);
CREATE INDEX idx_retention_runs_started_at ON public.retention_policy_runs USING btree (started_at);
CREATE INDEX idx_retention_runs_status ON public.retention_policy_runs USING btree (status);


-- public.schedules definition

-- Drop table

-- DROP TABLE public.schedules;

CREATE TABLE public.schedules (
	id serial4 NOT NULL,
	entity_type text NOT NULL,
	entity_id text NOT NULL,
	schedule_name text NULL,
	schedule_type text NOT NULL,
	cron_expression text NULL,
	interval_value int4 NULL,
	interval_unit text NULL,
	timezone text DEFAULT 'UTC'::text NULL,
	is_active bool DEFAULT true NULL,
	last_run timestamp NULL,
	next_run timestamp NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	project_id int4 NOT NULL,
	sub_project_id int4 NULL,
	CONSTRAINT schedules_entity_type_check CHECK ((entity_type = ANY (ARRAY['mapping'::text, 'mapping_group'::text, 'workflow'::text, 'vendor_agreement_expiration'::text]))),
	CONSTRAINT schedules_interval_unit_check CHECK ((interval_unit = ANY (ARRAY['minute'::text, 'hour'::text, 'day'::text, 'week'::text, 'month'::text, 'year'::text]))),
	CONSTRAINT schedules_pkey PRIMARY KEY (id),
	CONSTRAINT schedules_schedule_type_check CHECK ((schedule_type = ANY (ARRAY['cron'::text, 'interval'::text]))),
	CONSTRAINT valid_cron CHECK ((((schedule_type = 'cron'::text) AND (cron_expression IS NOT NULL)) OR ((schedule_type = 'interval'::text) AND (interval_value IS NOT NULL) AND (interval_unit IS NOT NULL))))
);
CREATE INDEX idx_schedules_entity ON public.schedules USING btree (entity_type, entity_id);
CREATE INDEX idx_schedules_next_run ON public.schedules USING btree (next_run) WHERE (is_active = true);
CREATE INDEX idx_schedules_project_id ON public.schedules USING btree (project_id);


-- public.schema_validation_job_files definition

-- Drop table

-- DROP TABLE public.schema_validation_job_files;

CREATE TABLE public.schema_validation_job_files (
	id serial4 NOT NULL,
	job_id int4 NULL,
	file_path text NOT NULL,
	status varchar(50) DEFAULT 'pending'::character varying NULL,
	validation_result jsonb NULL,
	error_message text NULL,
	created_at timestamptz DEFAULT now() NULL,
	updated_at timestamptz DEFAULT now() NULL,
	dq_violation_count int4 DEFAULT 0 NULL,
	dq_rules_executed int4 DEFAULT 0 NULL,
	dq_rules_passed int4 DEFAULT 0 NULL,
	dq_status varchar(20) DEFAULT NULL::character varying NULL, -- DQ validation status: passed, failed, skipped, error
	CONSTRAINT schema_validation_job_files_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_schema_validation_job_files_job ON public.schema_validation_job_files USING btree (job_id);

-- Column comments

COMMENT ON COLUMN public.schema_validation_job_files.dq_status IS 'DQ validation status: passed, failed, skipped, error';


-- public.schema_validation_jobs definition

-- Drop table

-- DROP TABLE public.schema_validation_jobs;

CREATE TABLE public.schema_validation_jobs (
	id serial4 NOT NULL,
	job_name varchar(255) NOT NULL,
	project_id int4 NULL,
	connection_id varchar(255) NULL,
	vendor_agreement_id int4 NULL,
	s3_path text NULL,
	file_pattern varchar(255) DEFAULT '*'::character varying NULL,
	"recursive" bool DEFAULT false NULL,
	execution_type varchar(50) DEFAULT 'manual'::character varying NULL,
	schedule_type varchar(50) NULL,
	cron_expression varchar(100) NULL,
	schedule_start_date timestamptz NULL,
	next_run_at timestamptz NULL,
	is_active bool DEFAULT true NULL,
	status varchar(50) DEFAULT 'pending'::character varying NULL,
	total_files int4 DEFAULT 0 NULL,
	processed_count int4 DEFAULT 0 NULL,
	valid_count int4 DEFAULT 0 NULL,
	invalid_count int4 DEFAULT 0 NULL,
	started_at timestamptz NULL,
	completed_at timestamptz NULL,
	report_path text NULL,
	error_message text NULL,
	created_by int4 NULL,
	created_at timestamptz DEFAULT now() NULL,
	updated_at timestamptz DEFAULT now() NULL,
	error_count int4 DEFAULT 0 NULL,
	dq_violation_count int4 DEFAULT 0 NULL,
	dq_rules_executed int4 DEFAULT 0 NULL,
	dq_rules_passed int4 DEFAULT 0 NULL,
	dq_enabled bool DEFAULT true NULL,
	CONSTRAINT schema_validation_jobs_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_schema_validation_jobs_project ON public.schema_validation_jobs USING btree (project_id);
CREATE INDEX idx_schema_validation_jobs_status ON public.schema_validation_jobs USING btree (status);


-- public.storage_connections definition

-- Drop table

-- DROP TABLE public.storage_connections;

CREATE TABLE public.storage_connections (
	connection_id varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	config jsonb NOT NULL,
	status varchar(50) DEFAULT 'active'::character varying NOT NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	connection_direction varchar(20) DEFAULT 'source'::character varying NULL,
	project_id int4 NULL,
	connection_user varchar(20) DEFAULT 'Internal'::character varying NULL,
	description text NULL,
	authentication_method varchar(50) DEFAULT 'key-based'::character varying NULL,
	auth_config jsonb DEFAULT '{}'::jsonb NULL,
	"path" text NULL,
	is_deleted bool DEFAULT false NULL,
	deleted_at timestamp NULL,
	deleted_by int4 NULL,
	CONSTRAINT storage_connections_authentication_method_check CHECK (((authentication_method)::text = ANY (ARRAY[('key-based'::character varying)::text, ('aws-iam-role'::character varying)::text, ('gcp-sa-oidc'::character varying)::text, ('azure-managed-identity'::character varying)::text, ('db-short-lived-token'::character varying)::text, ('oauth2'::character varying)::text, ('kerberos'::character varying)::text]))),
	CONSTRAINT storage_connections_connection_user_check CHECK (((connection_user)::text = ANY (ARRAY[('Internal'::character varying)::text, ('External'::character varying)::text]))),
	CONSTRAINT storage_connections_pkey PRIMARY KEY (connection_id)
);
CREATE UNIQUE INDEX idx_connections_name_unique_lower ON public.storage_connections USING btree (lower((name)::text));
CREATE INDEX idx_storage_connections_auth_method ON public.storage_connections USING btree (authentication_method);
CREATE INDEX idx_storage_connections_project_id ON public.storage_connections USING btree (project_id);
CREATE INDEX idx_storage_connections_user ON public.storage_connections USING btree (connection_user);


-- public.sub_project_access_groups definition

-- Drop table

-- DROP TABLE public.sub_project_access_groups;

CREATE TABLE public.sub_project_access_groups (
	id serial4 NOT NULL,
	sub_project_id int4 NOT NULL,
	group_id int4 NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT sub_project_access_groups_pkey PRIMARY KEY (id),
	CONSTRAINT sub_project_access_groups_sub_project_id_group_id_key UNIQUE (sub_project_id, group_id)
);


-- public.sub_project_members definition

-- Drop table

-- DROP TABLE public.sub_project_members;

CREATE TABLE public.sub_project_members (
	id serial4 NOT NULL,
	sub_project_id int4 NOT NULL,
	user_id int4 NOT NULL,
	"role" varchar(50) DEFAULT 'member'::character varying NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT sub_project_members_pkey PRIMARY KEY (id),
	CONSTRAINT sub_project_members_sub_project_id_user_id_key UNIQUE (sub_project_id, user_id)
);


-- public.tag_permissions definition

-- Drop table

-- DROP TABLE public.tag_permissions;

CREATE TABLE public.tag_permissions (
	id serial4 NOT NULL,
	tag_id varchar(255) NOT NULL,
	role_id int4 NOT NULL,
	can_view bool DEFAULT false NULL,
	can_edit bool DEFAULT false NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT tag_permissions_pkey PRIMARY KEY (id),
	CONSTRAINT unique_tag_role UNIQUE (tag_id, role_id)
);
CREATE INDEX idx_tag_permissions_role_id ON public.tag_permissions USING btree (role_id);
CREATE INDEX idx_tag_permissions_tag_id ON public.tag_permissions USING btree (tag_id);


-- public.transform_connections definition

-- Drop table

-- DROP TABLE public.transform_connections;

CREATE TABLE public.transform_connections (
	id serial4 NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(50) NOT NULL,
	config jsonb NOT NULL,
	is_active bool DEFAULT true NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	created_by int4 NULL,
	last_used_at timestamp NULL,
	description text NULL,
	shared bool DEFAULT true NULL,
	source_application varchar(50) DEFAULT 'data_observatory'::character varying NULL,
	project_id int4 NOT NULL,
	CONSTRAINT transform_connections_pkey PRIMARY KEY (id)
);


-- public.transformation_jobs definition

-- Drop table

-- DROP TABLE public.transformation_jobs;

CREATE TABLE public.transformation_jobs (
	id serial4 NOT NULL,
	job_id varchar(255) NOT NULL,
	mapping_id varchar(255) NULL,
	mapping_name varchar(255) NOT NULL,
	status varchar(50) DEFAULT 'pending'::character varying NOT NULL,
	start_time timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	end_time timestamp NULL,
	duration_ms int8 NULL,
	files_processed int4 DEFAULT 0 NULL,
	rows_read int8 DEFAULT 0 NULL,
	rows_written int8 DEFAULT 0 NULL,
	rows_failed int8 DEFAULT 0 NULL,
	error_message text NULL,
	execution_metadata jsonb NULL,
	triggered_by varchar(255) NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	executed_by int4 NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	mapping_group_execution_id int4 NULL,
	schedule_id int4 NULL,
	workflow_execution_id int4 NULL,
	file_id varchar(255) NULL,
	project_id int4 NOT NULL,
	correlation_id varchar(255) NULL,
	schema_validation varchar(10) NULL,
	failure_reason_code public."job_failure_reason" NULL, -- Database-enforced failure reason code for ETL jobs. Use error_message column for human-readable actionable messages.
	visual_workflow_execution_id int4 NULL,
	CONSTRAINT transformation_jobs_job_id_key UNIQUE (job_id),
	CONSTRAINT transformation_jobs_pkey PRIMARY KEY (id),
	CONSTRAINT transformation_jobs_schema_validation_check CHECK (((schema_validation)::text = ANY (ARRAY[('Pass'::character varying)::text, ('Fail'::character varying)::text, (NULL::character varying)::text])))
);
CREATE INDEX idx_transformation_jobs_failure_reason_code ON public.transformation_jobs USING btree (failure_reason_code) WHERE (failure_reason_code IS NOT NULL);
CREATE INDEX idx_transformation_jobs_mapping ON public.transformation_jobs USING btree (mapping_id);
CREATE INDEX idx_transformation_jobs_mapping_status ON public.transformation_jobs USING btree (mapping_id, status, created_at DESC);
CREATE INDEX idx_transformation_jobs_project_id ON public.transformation_jobs USING btree (project_id);
CREATE INDEX idx_transformation_jobs_project_status ON public.transformation_jobs USING btree (project_id, status, created_at DESC) WHERE (project_id IS NOT NULL);
CREATE INDEX idx_transformation_jobs_start ON public.transformation_jobs USING btree (start_time DESC);
CREATE INDEX idx_transformation_jobs_status ON public.transformation_jobs USING btree (status);
CREATE INDEX idx_transformation_jobs_status_created ON public.transformation_jobs USING btree (status, created_at DESC);

-- Column comments

COMMENT ON COLUMN public.transformation_jobs.failure_reason_code IS 'Database-enforced failure reason code for ETL jobs. Use error_message column for human-readable actionable messages.';


-- public.transformation_logs definition

-- Drop table

-- DROP TABLE public.transformation_logs;

CREATE TABLE public.transformation_logs (
	id serial4 NOT NULL,
	job_id varchar(255) NOT NULL,
	log_level varchar(20) NOT NULL,
	message text NOT NULL,
	log_details jsonb NULL,
	"timestamp" timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT transformation_logs_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_transformation_logs_job ON public.transformation_logs USING btree (job_id);
CREATE INDEX idx_transformation_logs_level ON public.transformation_logs USING btree (log_level);
CREATE INDEX idx_transformation_logs_timestamp ON public.transformation_logs USING btree ("timestamp" DESC);


-- public.transformation_mappings definition

-- Drop table

-- DROP TABLE public.transformation_mappings;

CREATE TABLE public.transformation_mappings (
	id serial4 NOT NULL,
	mapping_id varchar(255) NOT NULL,
	mapping_name varchar(255) NOT NULL,
	description text NULL,
	source_connection_id varchar(255) NULL,
	source_file_pattern varchar(500) NOT NULL,
	source_schema jsonb NULL,
	field_mappings jsonb DEFAULT '[]'::jsonb NOT NULL,
	target_connection_id varchar(255) NULL,
	target_table_name varchar(255) NULL,
	target_schema jsonb NULL,
	created_by int4 NULL,
	status varchar(50) DEFAULT 'draft'::character varying NULL,
	enabled bool DEFAULT true NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	last_executed_at timestamp NULL,
	anomaly_rules jsonb NULL,
	source_type varchar(50) DEFAULT 'files'::character varying NULL,
	file_path text DEFAULT ''::text NULL,
	file_name_pattern text NULL,
	target_file_name varchar(500) NULL,
	target_file_format varchar(50) DEFAULT 'csv'::character varying NULL,
	variables jsonb DEFAULT '[]'::jsonb NULL,
	project_id int4 NOT NULL,
	target_file_path varchar(1000) NULL,
	vendor_agreement_id int4 NULL,
	schema_drift_handling varchar(20) DEFAULT 'none'::character varying NULL,
	sub_project_id int4 NULL,
	source_owner varchar(255) NULL,
	target_owner varchar(255) NULL,
	vendor_agreement_file_schema_id int4 NULL,
	pii_columns jsonb DEFAULT '[]'::jsonb NULL,
	violation_handling varchar(50) DEFAULT 'log_continue'::character varying NULL,
	rdm_lookup_enabled bool DEFAULT false NULL,
	rdm_dataset_config jsonb NULL,
	rdm_crosswalk_config jsonb NULL,
	is_visual_mapping bool DEFAULT false NULL,
	visual_mapping_id int4 NULL,
	is_temporary bool DEFAULT false NULL,
	source_catalog jsonb DEFAULT '[]'::jsonb NULL,
	join_specs jsonb DEFAULT '[]'::jsonb NULL,
	has_multi_source_join bool DEFAULT false NULL,
	primary_source_node_id varchar(255) NULL,
	CONSTRAINT transformation_mappings_mapping_id_key UNIQUE (mapping_id),
	CONSTRAINT transformation_mappings_pkey PRIMARY KEY (id),
	CONSTRAINT transformation_mappings_schema_drift_handling_check CHECK (((schema_drift_handling)::text = ANY (ARRAY[('abort'::character varying)::text, ('alert'::character varying)::text, ('none'::character varying)::text]))),
	CONSTRAINT transformation_mappings_source_exclusivity CHECK ((((source_connection_id IS NOT NULL) AND (vendor_agreement_id IS NULL)) OR ((source_connection_id IS NULL) AND (vendor_agreement_id IS NOT NULL))))
);
CREATE INDEX idx_transformation_mappings_pattern ON public.transformation_mappings USING btree (source_file_pattern);
CREATE INDEX idx_transformation_mappings_project_id ON public.transformation_mappings USING btree (project_id);
CREATE INDEX idx_transformation_mappings_source ON public.transformation_mappings USING btree (source_connection_id);
CREATE INDEX idx_transformation_mappings_status ON public.transformation_mappings USING btree (status);
CREATE INDEX idx_transformation_mappings_sub_project_id ON public.transformation_mappings USING btree (sub_project_id);
CREATE INDEX idx_transformation_mappings_vendor_agreement_id ON public.transformation_mappings USING btree (vendor_agreement_id);


-- public.transformation_quality_rules definition

-- Drop table

-- DROP TABLE public.transformation_quality_rules;

CREATE TABLE public.transformation_quality_rules (
	id serial4 NOT NULL,
	mapping_id varchar(255) NOT NULL,
	quality_rule_id int4 NOT NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT transformation_quality_rules_pkey PRIMARY KEY (id),
	CONSTRAINT unique_transformation_quality_rule UNIQUE (mapping_id, quality_rule_id)
);
CREATE INDEX idx_transformation_quality_rules_mapping_id ON public.transformation_quality_rules USING btree (mapping_id);
CREATE INDEX idx_transformation_quality_rules_rule_id ON public.transformation_quality_rules USING btree (quality_rule_id);


-- public.upload_batches definition

-- Drop table

-- DROP TABLE public.upload_batches;

CREATE TABLE public.upload_batches (
	id serial4 NOT NULL,
	batch_id varchar(100) NOT NULL,
	user_id int4 NULL,
	api_token_id int4 NULL,
	project_id int4 NULL,
	target_type varchar(50) NOT NULL,
	target_id int4 NULL,
	status varchar(50) DEFAULT 'pending'::character varying NULL,
	total_files int4 DEFAULT 0 NULL,
	completed_files int4 DEFAULT 0 NULL,
	failed_files int4 DEFAULT 0 NULL,
	total_records int8 DEFAULT 0 NULL,
	processed_records int8 DEFAULT 0 NULL,
	failed_records int8 DEFAULT 0 NULL,
	total_size_bytes int8 DEFAULT 0 NULL,
	started_at timestamp NULL,
	completed_at timestamp NULL,
	created_at timestamp DEFAULT now() NULL,
	metadata jsonb DEFAULT '{}'::jsonb NULL,
	CONSTRAINT upload_batches_batch_id_key UNIQUE (batch_id),
	CONSTRAINT upload_batches_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_upload_batches_batch_id ON public.upload_batches USING btree (batch_id);
CREATE INDEX idx_upload_batches_status ON public.upload_batches USING btree (status, created_at DESC);
CREATE INDEX idx_upload_batches_user_project ON public.upload_batches USING btree (user_id, project_id);


-- public.upload_file_records definition

-- Drop table

-- DROP TABLE public.upload_file_records;

CREATE TABLE public.upload_file_records (
	id serial4 NOT NULL,
	upload_file_id int4 NULL,
	record_number int8 NOT NULL,
	status varchar(50) DEFAULT 'pending'::character varying NULL,
	error_message text NULL,
	error_code varchar(100) NULL,
	row_data jsonb NULL,
	created_at timestamp DEFAULT now() NULL,
	CONSTRAINT upload_file_records_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_upload_file_records_file_status ON public.upload_file_records USING btree (upload_file_id, status);


-- public.upload_files definition

-- Drop table

-- DROP TABLE public.upload_files;

CREATE TABLE public.upload_files (
	id serial4 NOT NULL,
	file_id varchar(100) NOT NULL,
	batch_id int4 NULL,
	original_filename varchar(500) NOT NULL,
	normalized_filename varchar(500) NULL,
	file_type varchar(50) NULL,
	file_size_bytes int8 NULL,
	mime_type varchar(100) NULL,
	target_type varchar(50) NULL,
	target_id int4 NULL,
	status varchar(50) DEFAULT 'pending'::character varying NULL,
	phase varchar(100) DEFAULT 'uploaded'::character varying NULL,
	total_records int8 DEFAULT 0 NULL,
	processed_records int8 DEFAULT 0 NULL,
	failed_records int8 DEFAULT 0 NULL,
	virus_scan_status varchar(50) NULL,
	virus_scan_result varchar(255) NULL,
	cloud_storage_path varchar(1000) NULL,
	cloud_storage_url text NULL,
	catalog_file_id varchar(255) NULL,
	etl_job_id varchar(100) NULL,
	error_message text NULL,
	error_details jsonb NULL,
	started_at timestamp NULL,
	completed_at timestamp NULL,
	uploaded_at timestamp DEFAULT now() NULL,
	metadata jsonb DEFAULT '{}'::jsonb NULL,
	CONSTRAINT upload_files_file_id_key UNIQUE (file_id),
	CONSTRAINT upload_files_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_upload_files_batch_id ON public.upload_files USING btree (batch_id);
CREATE INDEX idx_upload_files_catalog ON public.upload_files USING btree (catalog_file_id);
CREATE INDEX idx_upload_files_file_id ON public.upload_files USING btree (file_id);
CREATE INDEX idx_upload_files_status ON public.upload_files USING btree (status, uploaded_at DESC);


-- public.user_attributes definition

-- Drop table

-- DROP TABLE public.user_attributes;

CREATE TABLE public.user_attributes (
	id serial4 NOT NULL,
	user_id int4 NULL,
	attribute_key varchar(100) NOT NULL,
	attribute_value text NOT NULL,
	attribute_type varchar(50) DEFAULT 'STRING'::character varying NULL,
	"source" varchar(50) DEFAULT 'MANUAL'::character varying NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT unique_user_attribute UNIQUE (user_id, attribute_key),
	CONSTRAINT user_attributes_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_user_attributes_key ON public.user_attributes USING btree (attribute_key);
CREATE INDEX idx_user_attributes_source ON public.user_attributes USING btree (source);
CREATE INDEX idx_user_attributes_user ON public.user_attributes USING btree (user_id);

-- Table Triggers

create trigger update_user_attributes_updated_at before
update
    on
    public.user_attributes for each row execute function update_updated_at_column();


-- public.user_badges definition

-- Drop table

-- DROP TABLE public.user_badges;

CREATE TABLE public.user_badges (
	id serial4 NOT NULL,
	badge_id varchar(50) NOT NULL,
	score numeric NULL,
	file_id varchar(50) NULL,
	earned_date timestamp NOT NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT user_badges_badge_id_key UNIQUE (badge_id),
	CONSTRAINT user_badges_pkey PRIMARY KEY (id)
);


-- public.user_groups definition

-- Drop table

-- DROP TABLE public.user_groups;

CREATE TABLE public.user_groups (
	user_id int4 NOT NULL,
	group_id int4 NOT NULL,
	CONSTRAINT user_groups_pkey PRIMARY KEY (user_id, group_id)
);
CREATE INDEX idx_user_groups_group_id ON public.user_groups USING btree (group_id);
CREATE INDEX idx_user_groups_user_group ON public.user_groups USING btree (user_id, group_id);
CREATE INDEX idx_user_groups_user_id ON public.user_groups USING btree (user_id);


-- public.user_policy_attachments definition

-- Drop table

-- DROP TABLE public.user_policy_attachments;

CREATE TABLE public.user_policy_attachments (
	user_id int4 NOT NULL,
	policy_id int4 NOT NULL,
	attached_by int4 NULL,
	attached_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT user_policy_attachments_pkey PRIMARY KEY (user_id, policy_id)
);
CREATE INDEX idx_user_policy_attachments_policy ON public.user_policy_attachments USING btree (policy_id);
CREATE INDEX idx_user_policy_attachments_user ON public.user_policy_attachments USING btree (user_id);


-- public.user_roles definition

-- Drop table

-- DROP TABLE public.user_roles;

CREATE TABLE public.user_roles (
	user_id int4 NOT NULL,
	role_id int4 NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id)
);
CREATE INDEX idx_user_roles_user_id_role_id ON public.user_roles USING btree (user_id, role_id);


-- public.user_sessions definition

-- Drop table

-- DROP TABLE public.user_sessions;

CREATE TABLE public.user_sessions (
	id serial4 NOT NULL,
	user_id int4 NOT NULL,
	"token" varchar(1000) NOT NULL,
	expires_at timestamp NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT user_sessions_pkey PRIMARY KEY (id),
	CONSTRAINT user_sessions_token_key UNIQUE (token)
);


-- public.users definition

-- Drop table

-- DROP TABLE public.users;

CREATE TABLE public.users (
	id serial4 NOT NULL,
	username varchar(255) NOT NULL,
	"password" varchar(500) NULL,
	email varchar(255) NULL,
	full_name varchar(255) NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	last_login timestamp NULL,
	okta_id varchar NULL,
	first_name varchar(100) NULL,
	middle_name varchar(100) NULL,
	last_name varchar(100) NULL,
	phone_number varchar(20) NULL,
	address_line1 varchar(255) NULL,
	address_line2 varchar(255) NULL,
	city varchar(100) NULL,
	state varchar(100) NULL,
	postal_code varchar(20) NULL,
	country varchar(100) NULL,
	auth_provider varchar(20) DEFAULT 'local'::character varying NULL,
	external_id varchar(255) NULL,
	failed_login_attempts int4 DEFAULT 0 NULL,
	locked_until timestamp NULL,
	password_history jsonb DEFAULT '[]'::jsonb NULL,
	force_password_change bool DEFAULT false NULL,
	internal_user bool DEFAULT false NULL,
	user_type varchar(50) NULL,
	must_change_password bool DEFAULT false NULL,
	vendor_id int4 NULL,
	CONSTRAINT users_email_unique UNIQUE (email),
	CONSTRAINT users_pkey PRIMARY KEY (id),
	CONSTRAINT users_unique UNIQUE (okta_id)
);
CREATE INDEX idx_users_auth_provider ON public.users USING btree (auth_provider);
CREATE UNIQUE INDEX idx_users_external_id ON public.users USING btree (external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX idx_users_id ON public.users USING btree (id);
CREATE INDEX idx_users_username ON public.users USING btree (lower((username)::text));
CREATE UNIQUE INDEX users_username_lower_idx ON public.users USING btree (lower((username)::text));

-- Table Triggers

create trigger trigger_update_full_name before
insert
    or
update
    of first_name,
    middle_name,
    last_name on
    public.users for each row execute function update_full_name();


-- public.vendor_agreement_approvals definition

-- Drop table

-- DROP TABLE public.vendor_agreement_approvals;

CREATE TABLE public.vendor_agreement_approvals (
	id serial4 NOT NULL,
	agreement_id int4 NOT NULL,
	approver_type varchar(50) NOT NULL,
	approver_user_id int4 NOT NULL,
	"action" varchar(50) NOT NULL,
	"comments" text NULL,
	agreement_version int4 NOT NULL,
	approval_timestamp timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	ip_address varchar(50) NULL,
	user_agent text NULL,
	approval_stage varchar(50) NULL,
	CONSTRAINT vendor_agreement_approvals_action_check CHECK (((action)::text = ANY (ARRAY[('approved'::character varying)::text, ('rejected'::character varying)::text, ('revoked'::character varying)::text]))),
	CONSTRAINT vendor_agreement_approvals_approver_type_check CHECK (((approver_type)::text = ANY (ARRAY[('vendor'::character varying)::text, ('manager'::character varying)::text, ('governance_manager'::character varying)::text]))),
	CONSTRAINT vendor_agreement_approvals_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_vendor_agreement_approvals_agreement_id ON public.vendor_agreement_approvals USING btree (agreement_id);
CREATE INDEX idx_vendor_agreement_approvals_approver ON public.vendor_agreement_approvals USING btree (approver_user_id);


-- public.vendor_agreement_changes definition

-- Drop table

-- DROP TABLE public.vendor_agreement_changes;

CREATE TABLE public.vendor_agreement_changes (
	id serial4 NOT NULL,
	agreement_id int4 NOT NULL,
	change_type varchar(50) NOT NULL,
	previous_data jsonb NULL,
	new_data jsonb NULL,
	changes_summary text NULL,
	from_version int4 NULL,
	to_version int4 NULL,
	changed_by int4 NOT NULL,
	changed_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	reason text NULL,
	ip_address varchar(50) NULL,
	user_agent text NULL,
	CONSTRAINT vendor_agreement_changes_change_type_check CHECK (((change_type)::text = ANY (ARRAY[('created'::character varying)::text, ('updated'::character varying)::text, ('schema_changed'::character varying)::text, ('reopened'::character varying)::text, ('locked'::character varying)::text, ('unlocked'::character varying)::text]))),
	CONSTRAINT vendor_agreement_changes_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_vendor_agreement_changes_agreement_id ON public.vendor_agreement_changes USING btree (agreement_id);
CREATE INDEX idx_vendor_agreement_changes_changed_by ON public.vendor_agreement_changes USING btree (changed_by);


-- public.vendor_agreement_documents definition

-- Drop table

-- DROP TABLE public.vendor_agreement_documents;

CREATE TABLE public.vendor_agreement_documents (
	id serial4 NOT NULL,
	agreement_id int4 NOT NULL,
	approval_id int4 NULL,
	document_name varchar(500) NOT NULL,
	document_type varchar(100) NULL,
	file_path text NOT NULL,
	file_size int4 NULL,
	mime_type varchar(100) NULL,
	uploaded_by int4 NOT NULL,
	uploaded_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	description text NULL,
	approval_stage varchar(50) NULL,
	CONSTRAINT vendor_agreement_documents_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_vendor_agreement_documents_agreement ON public.vendor_agreement_documents USING btree (agreement_id);
CREATE INDEX idx_vendor_agreement_documents_approval ON public.vendor_agreement_documents USING btree (approval_id);


-- public.vendor_agreement_file_schemas definition

-- Drop table

-- DROP TABLE public.vendor_agreement_file_schemas;

CREATE TABLE public.vendor_agreement_file_schemas (
	id serial4 NOT NULL,
	vendor_agreement_id int4 NOT NULL,
	file_name_pattern varchar(500) NOT NULL,
	file_description text NULL,
	"schema" jsonb NOT NULL,
	priority int4 DEFAULT 0 NULL,
	is_active bool DEFAULT true NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	created_by int4 NULL,
	updated_by int4 NULL,
	contains_pii bool DEFAULT false NULL, -- Indicates if this file pattern contains Personally Identifiable Information
	data_classification varchar(50) NULL, -- Data classification level: Public, Internal, Confidential, Highly Confidential
	file_type varchar(50) NULL, -- File type: csv, json, xml, xlsx, parquet
	quality_rule_ids jsonb DEFAULT '[]'::jsonb NULL, -- Array of quality rule IDs that apply to this file pattern
	column_metadata jsonb DEFAULT '{}'::jsonb NULL, -- Column-level metadata including PII tags, data types, and transformations. Structure: {"column_name": {"contains_pii": true, "pii_type": "identifier|contact|financial|health|demographic", "data_type": "string", "description": "..."}}
	has_header bool DEFAULT true NULL,
	header_definition jsonb NULL,
	CONSTRAINT vendor_agreement_file_schemas_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_file_schemas_column_metadata ON public.vendor_agreement_file_schemas USING gin (column_metadata);
CREATE INDEX idx_file_schemas_quality_rules ON public.vendor_agreement_file_schemas USING gin (quality_rule_ids);
CREATE INDEX idx_vendor_agreement_file_schemas_agreement_id ON public.vendor_agreement_file_schemas USING btree (vendor_agreement_id);
CREATE INDEX idx_vendor_agreement_file_schemas_priority ON public.vendor_agreement_file_schemas USING btree (vendor_agreement_id, priority, is_active);

-- Column comments

COMMENT ON COLUMN public.vendor_agreement_file_schemas.contains_pii IS 'Indicates if this file pattern contains Personally Identifiable Information';
COMMENT ON COLUMN public.vendor_agreement_file_schemas.data_classification IS 'Data classification level: Public, Internal, Confidential, Highly Confidential';
COMMENT ON COLUMN public.vendor_agreement_file_schemas.file_type IS 'File type: csv, json, xml, xlsx, parquet';
COMMENT ON COLUMN public.vendor_agreement_file_schemas.quality_rule_ids IS 'Array of quality rule IDs that apply to this file pattern';
COMMENT ON COLUMN public.vendor_agreement_file_schemas.column_metadata IS 'Column-level metadata including PII tags, data types, and transformations. Structure: {"column_name": {"contains_pii": true, "pii_type": "identifier|contact|financial|health|demographic", "data_type": "string", "description": "..."}}';

-- Table Triggers

create trigger trigger_update_vendor_agreement_file_schemas_updated_at before
update
    on
    public.vendor_agreement_file_schemas for each row execute function update_vendor_agreement_file_schemas_updated_at();


-- public.vendor_agreements definition

-- Drop table

-- DROP TABLE public.vendor_agreements;

CREATE TABLE public.vendor_agreements (
	id serial4 NOT NULL,
	vendor_id int4 NULL,
	agreement_code varchar(100) NULL,
	file_name varchar(500) NULL,
	file_description text NULL,
	"schema" jsonb NULL,
	frequency varchar(50) NULL,
	frequency_description text NULL,
	vendor_department_team varchar(255) NULL,
	file_owner_user_id int4 NULL,
	primary_contact_name varchar(255) NULL,
	owner_contact varchar(255) NULL,
	metadata jsonb NULL,
	approval_status varchar(50) DEFAULT 'draft'::character varying NULL,
	vendor_approved_at timestamp NULL,
	vendor_approved_by int4 NULL,
	owner_approved_at timestamp NULL,
	owner_approved_by int4 NULL,
	is_locked bool DEFAULT false NULL,
	locked_at timestamp NULL,
	"version" int4 DEFAULT 1 NULL,
	status varchar(50) DEFAULT 'active'::character varying NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_by int4 NULL,
	vendor_connection_id varchar NULL,
	drop_location_path varchar(500) NULL,
	project_id int4 NULL,
	manager_contact text NULL,
	primary_contact_phone varchar(50) NULL,
	primary_contact_email varchar(255) NULL,
	primary_contact_designation varchar(255) NULL,
	secondary_contact_name varchar(255) NULL,
	secondary_contact_phone varchar(50) NULL,
	secondary_contact_email varchar(255) NULL,
	secondary_contact_designation varchar(255) NULL,
	contains_pii bool DEFAULT false NULL,
	file_type varchar(50) NULL,
	data_classification varchar(50) NULL,
	"domain" varchar(255) NULL,
	retention_days int4 NULL,
	expected_arrival_time varchar(50) NULL,
	delivery_method varchar(100) NULL,
	vendor_type varchar(100) NULL,
	vendor_department_email varchar(255) NULL,
	vendor_onboarding_date date NULL,
	governance_manager_user_id int4 NULL,
	governance_approved_at timestamp NULL,
	governance_approved_by int4 NULL,
	contract_start_date timestamptz NULL,
	contract_end_date timestamptz NULL,
	sub_project_id int4 NULL,
	description text NULL,
	sla_enabled bool DEFAULT false NULL,
	frequency_pattern varchar(50) NULL,
	arrival_days text NULL,
	alert_threshold_minutes int4 DEFAULT 60 NULL,
	arrival_time varchar(10) NULL,
	additional_stakeholder_user_ids jsonb DEFAULT '[]'::jsonb NULL,
	additional_stakeholder_group_ids jsonb DEFAULT '[]'::jsonb NULL,
	CONSTRAINT unique_agreement_code UNIQUE (agreement_code),
	CONSTRAINT vendor_agreements_approval_status_check CHECK (((approval_status)::text = ANY (ARRAY[('draft'::character varying)::text, ('pending_vendor_acceptance'::character varying)::text, ('vendor_accepted'::character varying)::text, ('vendor_rejected'::character varying)::text, ('pending_manager_approval'::character varying)::text, ('manager_approved'::character varying)::text, ('manager_rejected'::character varying)::text, ('pending_governance_approval'::character varying)::text, ('governance_approved'::character varying)::text, ('governance_rejected'::character varying)::text, ('fully_approved'::character varying)::text, ('rejected'::character varying)::text, ('changes_pending'::character varying)::text]))),
	CONSTRAINT vendor_agreements_data_classification_check CHECK ((((data_classification)::text = ANY (ARRAY[('Public'::character varying)::text, ('Private'::character varying)::text, ('Confidential'::character varying)::text])) OR (data_classification IS NULL))),
	CONSTRAINT vendor_agreements_pkey PRIMARY KEY (id),
	CONSTRAINT vendor_agreements_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text, ('archived'::character varying)::text, ('draft'::character varying)::text, ('pending'::character varying)::text])))
);
CREATE INDEX idx_vendor_agreements_agreement_code ON public.vendor_agreements USING btree (agreement_code);
CREATE INDEX idx_vendor_agreements_approval_status ON public.vendor_agreements USING btree (approval_status);
CREATE INDEX idx_vendor_agreements_connection_id ON public.vendor_agreements USING btree (vendor_connection_id);
CREATE INDEX idx_vendor_agreements_file_owner ON public.vendor_agreements USING btree (file_owner_user_id);
CREATE INDEX idx_vendor_agreements_governance_manager ON public.vendor_agreements USING btree (governance_manager_user_id);
CREATE INDEX idx_vendor_agreements_project_id ON public.vendor_agreements USING btree (project_id);
CREATE INDEX idx_vendor_agreements_sla_enabled ON public.vendor_agreements USING btree (sla_enabled) WHERE (sla_enabled = true);
CREATE INDEX idx_vendor_agreements_stakeholder_groups ON public.vendor_agreements USING gin (additional_stakeholder_group_ids);
CREATE INDEX idx_vendor_agreements_stakeholder_users ON public.vendor_agreements USING gin (additional_stakeholder_user_ids);
CREATE INDEX idx_vendor_agreements_sub_project_id ON public.vendor_agreements USING btree (sub_project_id);
CREATE INDEX idx_vendor_agreements_vendor_id ON public.vendor_agreements USING btree (vendor_id);


-- public.vendor_file_profiling_results definition

-- Drop table

-- DROP TABLE public.vendor_file_profiling_results;

CREATE TABLE public.vendor_file_profiling_results (
	id serial4 NOT NULL,
	file_id varchar(255) NOT NULL,
	uploaded_by_user_id int4 NULL,
	vendor_id int4 NULL,
	connection_id varchar(255) NULL,
	quality_score numeric(5, 2) NULL,
	completeness_score numeric(5, 2) NULL,
	consistency_score numeric(5, 2) NULL,
	validity_score numeric(5, 2) NULL,
	uniqueness_score numeric(5, 2) NULL,
	timeliness_score numeric(5, 2) NULL,
	issues jsonb DEFAULT '[]'::jsonb NULL,
	header_issues jsonb NULL,
	null_value_summary jsonb NULL,
	date_format_issues jsonb NULL,
	duplicate_data jsonb NULL,
	profiling_metadata jsonb NULL,
	profiled_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT vendor_file_profiling_results_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_vendor_file_profiling_connection_id ON public.vendor_file_profiling_results USING btree (connection_id);
CREATE INDEX idx_vendor_file_profiling_file_id ON public.vendor_file_profiling_results USING btree (file_id);
CREATE INDEX idx_vendor_file_profiling_profiled_at ON public.vendor_file_profiling_results USING btree (profiled_at DESC);
CREATE INDEX idx_vendor_file_profiling_quality_score ON public.vendor_file_profiling_results USING btree (quality_score);
CREATE INDEX idx_vendor_file_profiling_vendor_id ON public.vendor_file_profiling_results USING btree (vendor_id);
CREATE INDEX idx_vendor_profiling_created_at ON public.vendor_file_profiling_results USING btree (created_at DESC);
CREATE INDEX idx_vendor_profiling_file_id ON public.vendor_file_profiling_results USING btree (file_id);
CREATE INDEX idx_vendor_profiling_user_id ON public.vendor_file_profiling_results USING btree (uploaded_by_user_id);
CREATE INDEX idx_vendor_profiling_vendor_id ON public.vendor_file_profiling_results USING btree (vendor_id);


-- public.vendor_sla_violations definition

-- Drop table

-- DROP TABLE public.vendor_sla_violations;

CREATE TABLE public.vendor_sla_violations (
	id serial4 NOT NULL,
	agreement_id int4 NOT NULL,
	expected_arrival_time timestamp NOT NULL,
	violation_detected_at timestamp DEFAULT now() NOT NULL,
	alert_sent bool DEFAULT false NULL,
	alert_sent_at timestamp NULL,
	resolved bool DEFAULT false NULL,
	resolved_at timestamp NULL,
	file_id varchar(255) NULL,
	actual_arrival_time timestamp NULL,
	delay_minutes int4 NULL,
	metadata jsonb NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT vendor_sla_violations_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_vendor_sla_violations_agreement_id ON public.vendor_sla_violations USING btree (agreement_id);
CREATE INDEX idx_vendor_sla_violations_alert_sent ON public.vendor_sla_violations USING btree (alert_sent) WHERE (alert_sent = false);
CREATE INDEX idx_vendor_sla_violations_resolved ON public.vendor_sla_violations USING btree (resolved) WHERE (resolved = false);


-- public.vendor_users definition

-- Drop table

-- DROP TABLE public.vendor_users;

CREATE TABLE public.vendor_users (
	id serial4 NOT NULL,
	vendor_id int4 NOT NULL,
	"name" varchar(255) NOT NULL,
	email varchar(255) NULL,
	phone varchar(50) NULL,
	designation varchar(255) NULL,
	is_active bool DEFAULT true NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	created_by int4 NULL,
	updated_by int4 NULL,
	CONSTRAINT vendor_users_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_vendor_users_email ON public.vendor_users USING btree (email);
CREATE INDEX idx_vendor_users_is_active ON public.vendor_users USING btree (is_active);
CREATE INDEX idx_vendor_users_vendor_id ON public.vendor_users USING btree (vendor_id);

-- Table Triggers

create trigger trigger_vendor_users_updated_at before
update
    on
    public.vendor_users for each row execute function update_vendor_users_updated_at();


-- public.vendors definition

-- Drop table

-- DROP TABLE public.vendors;

CREATE TABLE public.vendors (
	id serial4 NOT NULL,
	vendor_code varchar(50) NOT NULL,
	vendor_name varchar(255) NOT NULL,
	description text NULL,
	contact_name varchar(255) NOT NULL,
	contact_email varchar(255) NOT NULL,
	contact_phone varchar(50) NULL,
	vendor_user_id int4 NULL,
	project_id int4 NULL,
	status varchar(50) DEFAULT 'active'::character varying NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_by int4 NULL,
	address text NULL,
	backup_contact_name varchar(255) NULL,
	backup_contact_phone varchar(50) NULL,
	backup_contact_email varchar(255) NULL,
	vendor_onboarding_date timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	vendor_type varchar(100) NULL,
	CONSTRAINT unique_vendor_code UNIQUE (vendor_code),
	CONSTRAINT vendors_pkey PRIMARY KEY (id),
	CONSTRAINT vendors_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text, ('suspended'::character varying)::text])))
);
CREATE INDEX idx_vendors_project_id ON public.vendors USING btree (project_id);
CREATE INDEX idx_vendors_status ON public.vendors USING btree (status);
CREATE INDEX idx_vendors_vendor_code ON public.vendors USING btree (vendor_code);
CREATE INDEX idx_vendors_vendor_user_id ON public.vendors USING btree (vendor_user_id);


-- public.visual_lineage_graphs definition

-- Drop table

-- DROP TABLE public.visual_lineage_graphs;

CREATE TABLE public.visual_lineage_graphs (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	description text NULL,
	root_type varchar(50) NOT NULL,
	root_id int4 NOT NULL,
	graph_config jsonb DEFAULT '{"depth": 3, "includeIncidents": true}'::jsonb NULL,
	graph_data jsonb DEFAULT '{"edges": [], "nodes": []}'::jsonb NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	is_active bool DEFAULT true NULL,
	project_id int4 NULL,
	CONSTRAINT visual_lineage_graphs_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_visual_lineage_graphs_created_by ON public.visual_lineage_graphs USING btree (created_by);
CREATE INDEX idx_visual_lineage_graphs_is_active ON public.visual_lineage_graphs USING btree (is_active);
CREATE INDEX idx_visual_lineage_graphs_project ON public.visual_lineage_graphs USING btree (project_id);


-- public.visual_mapping_defs definition

-- Drop table

-- DROP TABLE public.visual_mapping_defs;

CREATE TABLE public.visual_mapping_defs (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	description text NULL,
	project_id int4 NULL,
	sub_project_id int4 NULL,
	graph_data jsonb DEFAULT '{"edges": [], "nodes": []}'::jsonb NOT NULL,
	canvas_state jsonb DEFAULT '{"zoom": 1, "position": [0, 0]}'::jsonb NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	is_active bool DEFAULT true NULL,
	last_executed_at timestamp NULL,
	execution_count int4 DEFAULT 0 NULL,
	notification_settings jsonb NULL,
	CONSTRAINT visual_mapping_defs_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_visual_mapping_defs_active ON public.visual_mapping_defs USING btree (is_active);
CREATE INDEX idx_visual_mapping_defs_project ON public.visual_mapping_defs USING btree (project_id);


-- public.visual_mapping_edges definition

-- Drop table

-- DROP TABLE public.visual_mapping_edges;

CREATE TABLE public.visual_mapping_edges (
	id serial4 NOT NULL,
	mapping_id int4 NOT NULL,
	edge_id varchar(100) NOT NULL,
	source_node_id varchar(100) NOT NULL,
	target_node_id varchar(100) NOT NULL,
	source_handle varchar(50) NULL,
	target_handle varchar(50) NULL,
	edge_data jsonb DEFAULT '{}'::jsonb NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT visual_mapping_edges_mapping_id_edge_id_key UNIQUE (mapping_id, edge_id),
	CONSTRAINT visual_mapping_edges_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_visual_mapping_edges_mapping ON public.visual_mapping_edges USING btree (mapping_id);


-- public.visual_mapping_execution_logs definition

-- Drop table

-- DROP TABLE public.visual_mapping_execution_logs;

CREATE TABLE public.visual_mapping_execution_logs (
	id serial4 NOT NULL,
	mapping_id int4 NOT NULL,
	run_id varchar(255) NOT NULL,
	run_name varchar(255) NOT NULL,
	started_at timestamp DEFAULT now() NOT NULL,
	status varchar(50) DEFAULT 'running'::character varying NOT NULL,
	logs jsonb DEFAULT '[]'::jsonb NOT NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	execution_id varchar(255) NULL,
	CONSTRAINT visual_mapping_execution_logs_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_visual_mapping_exec_logs_exec_id ON public.visual_mapping_execution_logs USING btree (execution_id);
CREATE INDEX idx_visual_mapping_exec_logs_mapping ON public.visual_mapping_execution_logs USING btree (mapping_id);
CREATE INDEX idx_visual_mapping_exec_logs_started ON public.visual_mapping_execution_logs USING btree (started_at DESC);


-- public.visual_mapping_executions definition

-- Drop table

-- DROP TABLE public.visual_mapping_executions;

CREATE TABLE public.visual_mapping_executions (
	id serial4 NOT NULL,
	execution_id varchar(100) NOT NULL,
	mapping_id int4 NOT NULL,
	transformation_job_id varchar(100) NULL,
	status varchar(50) DEFAULT 'pending'::character varying NULL,
	started_at timestamp NULL,
	completed_at timestamp NULL,
	triggered_by int4 NULL,
	node_executions jsonb DEFAULT '[]'::jsonb NULL,
	edge_metrics jsonb DEFAULT '{}'::jsonb NULL,
	error_message text NULL,
	rows_processed int4 DEFAULT 0 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	transformation_id int4 NULL,
	job_id varchar(255) NULL,
	logs jsonb DEFAULT '[]'::jsonb NULL,
	CONSTRAINT visual_mapping_executions_execution_id_key UNIQUE (execution_id),
	CONSTRAINT visual_mapping_executions_pkey PRIMARY KEY (id),
	CONSTRAINT visual_mapping_executions_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('running'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text, ('cancelled'::character varying)::text])))
);
CREATE INDEX idx_visual_mapping_executions_mapping ON public.visual_mapping_executions USING btree (mapping_id);
CREATE INDEX idx_visual_mapping_executions_status ON public.visual_mapping_executions USING btree (status);


-- public.visual_mapping_nodes definition

-- Drop table

-- DROP TABLE public.visual_mapping_nodes;

CREATE TABLE public.visual_mapping_nodes (
	id serial4 NOT NULL,
	mapping_id int4 NOT NULL,
	node_id varchar(100) NOT NULL,
	node_type varchar(50) NOT NULL,
	node_label varchar(255) NULL,
	position_x float8 NOT NULL,
	position_y float8 NOT NULL,
	config_data jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT visual_mapping_nodes_mapping_id_node_id_key UNIQUE (mapping_id, node_id),
	CONSTRAINT visual_mapping_nodes_node_type_check CHECK (((node_type)::text = ANY (ARRAY[('mapping_config'::character varying)::text, ('source_config'::character varying)::text, ('expression'::character varying)::text, ('rdm_dataset'::character varying)::text, ('rdm_crosswalk'::character varying)::text, ('target_rules'::character varying)::text]))),
	CONSTRAINT visual_mapping_nodes_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_visual_mapping_nodes_mapping ON public.visual_mapping_nodes USING btree (mapping_id);


-- public.visual_workflow_execution_logs definition

-- Drop table

-- DROP TABLE public.visual_workflow_execution_logs;

CREATE TABLE public.visual_workflow_execution_logs (
	id serial4 NOT NULL,
	workflow_id int4 NOT NULL,
	run_id varchar(255) NOT NULL,
	run_name varchar(255) NOT NULL,
	started_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	status varchar(50) DEFAULT 'running'::character varying NULL,
	logs jsonb DEFAULT '[]'::jsonb NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	execution_id varchar(255) NULL,
	CONSTRAINT visual_workflow_execution_logs_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_visual_workflow_exec_logs_exec_id ON public.visual_workflow_execution_logs USING btree (execution_id);
CREATE INDEX idx_visual_workflow_execution_logs_started_at ON public.visual_workflow_execution_logs USING btree (started_at DESC);
CREATE INDEX idx_visual_workflow_execution_logs_workflow_id ON public.visual_workflow_execution_logs USING btree (workflow_id);


-- public.visual_workflow_executions definition

-- Drop table

-- DROP TABLE public.visual_workflow_executions;

CREATE TABLE public.visual_workflow_executions (
	id serial4 NOT NULL,
	workflow_id int4 NOT NULL,
	execution_id text NOT NULL,
	status text DEFAULT 'running'::text NULL,
	total_nodes int4 DEFAULT 0 NULL,
	completed_nodes int4 DEFAULT 0 NULL,
	failed_nodes int4 DEFAULT 0 NULL,
	start_time timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	end_time timestamp NULL,
	duration_ms int4 NULL,
	triggered_by int4 NULL,
	error_message text NULL,
	execution_summary jsonb NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	project_id int4 NULL,
	CONSTRAINT visual_workflow_executions_execution_id_key UNIQUE (execution_id),
	CONSTRAINT visual_workflow_executions_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_visual_workflow_executions_execution_id ON public.visual_workflow_executions USING btree (execution_id);
CREATE INDEX idx_visual_workflow_executions_status ON public.visual_workflow_executions USING btree (status);
CREATE INDEX idx_visual_workflow_executions_triggered_by ON public.visual_workflow_executions USING btree (triggered_by);
CREATE INDEX idx_visual_workflow_executions_workflow_id ON public.visual_workflow_executions USING btree (workflow_id);


-- public.visual_workflows definition

-- Drop table

-- DROP TABLE public.visual_workflows;

CREATE TABLE public.visual_workflows (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	description text NULL,
	graph_data jsonb DEFAULT '{"edges": [], "nodes": []}'::jsonb NOT NULL,
	execution_mode varchar(50) DEFAULT 'sequential'::character varying NULL,
	created_by int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	is_active bool DEFAULT true NULL,
	project_id int4 NULL,
	sub_project_id int4 NULL,
	CONSTRAINT visual_workflows_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_visual_workflows_created_by ON public.visual_workflows USING btree (created_by);
CREATE INDEX idx_visual_workflows_is_active ON public.visual_workflows USING btree (is_active);
CREATE INDEX idx_visual_workflows_project_id ON public.visual_workflows USING btree (project_id);
CREATE INDEX idx_visual_workflows_sub_project_id ON public.visual_workflows USING btree (sub_project_id);


-- public.workflow_executions definition

-- Drop table

-- DROP TABLE public.workflow_executions;

CREATE TABLE public.workflow_executions (
	id serial4 NOT NULL,
	workflow_id int4 NOT NULL,
	execution_id text NOT NULL,
	status text DEFAULT 'running'::text NULL,
	current_step_id int4 NULL,
	total_steps int4 DEFAULT 0 NULL,
	completed_steps int4 DEFAULT 0 NULL,
	failed_steps int4 DEFAULT 0 NULL,
	start_time timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	end_time timestamp NULL,
	duration_ms int4 NULL,
	triggered_by int4 NULL,
	error_message text NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	project_id int4 NOT NULL,
	CONSTRAINT workflow_executions_pkey PRIMARY KEY (id),
	CONSTRAINT workflow_executions_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);
CREATE INDEX idx_workflow_executions_project_id ON public.workflow_executions USING btree (project_id);
CREATE INDEX idx_workflow_executions_workflow_id ON public.workflow_executions USING btree (workflow_id);


-- public.workflow_steps definition

-- Drop table

-- DROP TABLE public.workflow_steps;

CREATE TABLE public.workflow_steps (
	id serial4 NOT NULL,
	workflow_id int4 NOT NULL,
	step_name text NOT NULL,
	step_type text NOT NULL,
	entity_id text NOT NULL,
	depends_on int4 NULL,
	retry_count int4 DEFAULT 3 NULL,
	retry_delay_seconds int4 DEFAULT 60 NULL,
	execution_order int4 DEFAULT 0 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	project_id int4 NOT NULL,
	CONSTRAINT workflow_steps_pkey PRIMARY KEY (id),
	CONSTRAINT workflow_steps_step_type_check CHECK ((step_type = ANY (ARRAY['mapping'::text, 'mapping_group'::text])))
);
CREATE INDEX idx_workflow_steps_depends_on ON public.workflow_steps USING btree (depends_on);
CREATE INDEX idx_workflow_steps_project_id ON public.workflow_steps USING btree (project_id);
CREATE INDEX idx_workflow_steps_workflow_id ON public.workflow_steps USING btree (workflow_id);


-- public.access_group_members foreign keys

ALTER TABLE public.access_group_members ADD CONSTRAINT access_group_members_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.access_group_members ADD CONSTRAINT access_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.access_groups(id) ON DELETE CASCADE;
ALTER TABLE public.access_group_members ADD CONSTRAINT access_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.access_group_roles foreign keys

ALTER TABLE public.access_group_roles ADD CONSTRAINT access_group_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.access_group_roles ADD CONSTRAINT access_group_roles_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.access_groups(id) ON DELETE CASCADE;
ALTER TABLE public.access_group_roles ADD CONSTRAINT access_group_roles_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.access_group_roles ADD CONSTRAINT access_group_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


-- public.access_groups foreign keys

ALTER TABLE public.access_groups ADD CONSTRAINT access_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


-- public.alert_aggregation foreign keys

ALTER TABLE public.alert_aggregation ADD CONSTRAINT alert_aggregation_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.alert_policies(id) ON DELETE CASCADE;


-- public.alert_attachments foreign keys

ALTER TABLE public.alert_attachments ADD CONSTRAINT alert_attachments_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.alert_runs(id) ON DELETE CASCADE;


-- public.alert_events foreign keys

ALTER TABLE public.alert_events ADD CONSTRAINT alert_events_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.alert_runs(id) ON DELETE CASCADE;
ALTER TABLE public.alert_events ADD CONSTRAINT alert_events_vendor_sla_violation_id_fkey FOREIGN KEY (vendor_sla_violation_id) REFERENCES public.vendor_sla_violations(id) ON DELETE SET NULL;


-- public.alert_history foreign keys

ALTER TABLE public.alert_history ADD CONSTRAINT alert_history_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;
ALTER TABLE public.alert_history ADD CONSTRAINT alert_history_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.alert_rules(id) ON DELETE CASCADE;


-- public.alert_policies foreign keys

ALTER TABLE public.alert_policies ADD CONSTRAINT alert_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.alert_policies ADD CONSTRAINT alert_policies_email_connection_id_fkey FOREIGN KEY (email_connection_id) REFERENCES public.storage_connections(connection_id) ON DELETE SET NULL;
ALTER TABLE public.alert_policies ADD CONSTRAINT alert_policies_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


-- public.alert_policy_recipients foreign keys

ALTER TABLE public.alert_policy_recipients ADD CONSTRAINT alert_policy_recipients_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.alert_policies(id) ON DELETE CASCADE;
ALTER TABLE public.alert_policy_recipients ADD CONSTRAINT alert_policy_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.alert_runs foreign keys

ALTER TABLE public.alert_runs ADD CONSTRAINT alert_runs_email_connection_id_fkey FOREIGN KEY (email_connection_id) REFERENCES public.storage_connections(connection_id) ON DELETE SET NULL;
ALTER TABLE public.alert_runs ADD CONSTRAINT alert_runs_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.alert_policies(id) ON DELETE CASCADE;


-- public.allowed_email_domains foreign keys

ALTER TABLE public.allowed_email_domains ADD CONSTRAINT allowed_email_domains_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


-- public.api_tokens foreign keys

ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.users(id);
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.archive_extractions foreign keys

ALTER TABLE public.archive_extractions ADD CONSTRAINT archive_extractions_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


-- public.archive_members foreign keys

ALTER TABLE public.archive_members ADD CONSTRAINT archive_members_extracted_file_id_fkey FOREIGN KEY (extracted_file_id) REFERENCES public.files(file_id) ON DELETE SET NULL;
ALTER TABLE public.archive_members ADD CONSTRAINT archive_members_parent_file_id_fkey FOREIGN KEY (parent_file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


-- public.archived_files foreign keys

ALTER TABLE public.archived_files ADD CONSTRAINT archived_files_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.users(id);
ALTER TABLE public.archived_files ADD CONSTRAINT archived_files_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);
ALTER TABLE public.archived_files ADD CONSTRAINT archived_files_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.retention_policies(id);
ALTER TABLE public.archived_files ADD CONSTRAINT archived_files_restored_by_fkey FOREIGN KEY (restored_by) REFERENCES public.users(id);


-- public.bulk_profiling_files foreign keys

ALTER TABLE public.bulk_profiling_files ADD CONSTRAINT bulk_profiling_files_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.bulk_profiling_jobs(id) ON DELETE CASCADE;


-- public.bulk_profiling_jobs foreign keys

ALTER TABLE public.bulk_profiling_jobs ADD CONSTRAINT bulk_profiling_jobs_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES public.projects(id);


-- public.business_processes foreign keys

ALTER TABLE public.business_processes ADD CONSTRAINT business_processes_group_id_fkey FOREIGN KEY (group_id) REFERENCES public."groups"(id) ON DELETE SET NULL;
ALTER TABLE public.business_processes ADD CONSTRAINT fk_business_processes_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


-- public.column_governance_tag_assignments foreign keys

ALTER TABLE public.column_governance_tag_assignments ADD CONSTRAINT fk_column_tag_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;
ALTER TABLE public.column_governance_tag_assignments ADD CONSTRAINT fk_column_tag_tag FOREIGN KEY (tag_id) REFERENCES public.governance_tags(tag_id) ON DELETE CASCADE;


-- public.column_mappings foreign keys

ALTER TABLE public.column_mappings ADD CONSTRAINT column_mappings_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


-- public.column_policy_assignments foreign keys

ALTER TABLE public.column_policy_assignments ADD CONSTRAINT fk_column_policy_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;
ALTER TABLE public.column_policy_assignments ADD CONSTRAINT fk_column_policy_policy FOREIGN KEY (policy_id) REFERENCES public.governance_policies(policy_id) ON DELETE CASCADE;


-- public.column_sensitivity_tags foreign keys

ALTER TABLE public.column_sensitivity_tags ADD CONSTRAINT fk_column_tags_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


-- public.dlq_jobs foreign keys

ALTER TABLE public.dlq_jobs ADD CONSTRAINT dlq_jobs_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;
ALTER TABLE public.dlq_jobs ADD CONSTRAINT dlq_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.dlq_jobs ADD CONSTRAINT dlq_jobs_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id);
ALTER TABLE public.dlq_jobs ADD CONSTRAINT dlq_jobs_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES public.vendor_agreements(id) ON DELETE SET NULL;


-- public.drop_location_config foreign keys

ALTER TABLE public.drop_location_config ADD CONSTRAINT drop_location_config_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.drop_location_config ADD CONSTRAINT drop_location_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


-- public.encrypted_passwords foreign keys

ALTER TABLE public.encrypted_passwords ADD CONSTRAINT encrypted_passwords_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


-- public.file_audit_details foreign keys

ALTER TABLE public.file_audit_details ADD CONSTRAINT file_audit_details_parent_audit_id_fkey FOREIGN KEY (parent_audit_id) REFERENCES public.file_audit_details(id);
ALTER TABLE public.file_audit_details ADD CONSTRAINT file_audit_details_transformation_job_id_fkey FOREIGN KEY (transformation_job_id) REFERENCES public.transformation_jobs(id);


-- public.file_columns foreign keys

ALTER TABLE public.file_columns ADD CONSTRAINT file_columns_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


-- public.file_history foreign keys

ALTER TABLE public.file_history ADD CONSTRAINT file_history_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


-- public.file_lineage foreign keys

ALTER TABLE public.file_lineage ADD CONSTRAINT file_lineage_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;
ALTER TABLE public.file_lineage ADD CONSTRAINT file_lineage_target_file_id_fkey FOREIGN KEY (target_file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


-- public.file_ownership foreign keys

ALTER TABLE public.file_ownership ADD CONSTRAINT fk_file_ownership_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;
ALTER TABLE public.file_ownership ADD CONSTRAINT fk_file_ownership_user FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


-- public.file_policy_assignments foreign keys

ALTER TABLE public.file_policy_assignments ADD CONSTRAINT fk_policy_assignment_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;
ALTER TABLE public.file_policy_assignments ADD CONSTRAINT fk_policy_assignment_policy FOREIGN KEY (policy_id) REFERENCES public.governance_policies(policy_id) ON DELETE CASCADE;
ALTER TABLE public.file_policy_assignments ADD CONSTRAINT fk_policy_assignment_user FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


-- public.file_preview_data foreign keys

ALTER TABLE public.file_preview_data ADD CONSTRAINT fk_file_preview_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


-- public.file_processing_artifacts foreign keys

ALTER TABLE public.file_processing_artifacts ADD CONSTRAINT file_processing_artifacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.file_processing_artifacts ADD CONSTRAINT file_processing_artifacts_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


-- public.file_quality_rules foreign keys

ALTER TABLE public.file_quality_rules ADD CONSTRAINT fk_file_quality_rules_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;
ALTER TABLE public.file_quality_rules ADD CONSTRAINT fk_file_quality_rules_rule FOREIGN KEY (quality_rule_id) REFERENCES public.quality_rules(id) ON DELETE CASCADE;


-- public.file_restorations foreign keys

ALTER TABLE public.file_restorations ADD CONSTRAINT file_restorations_archived_file_id_fkey FOREIGN KEY (archived_file_id) REFERENCES public.archived_files(id);
ALTER TABLE public.file_restorations ADD CONSTRAINT file_restorations_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


-- public.file_schedules foreign keys

ALTER TABLE public.file_schedules ADD CONSTRAINT file_schedules_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.file_schedules ADD CONSTRAINT fk_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;
ALTER TABLE public.file_schedules ADD CONSTRAINT fk_file_schedules_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


-- public.file_schemas foreign keys

ALTER TABLE public.file_schemas ADD CONSTRAINT file_schemas_logical_file_id_fkey FOREIGN KEY (logical_file_id) REFERENCES public.logical_file_groups(logical_file_id) ON DELETE SET NULL;


-- public.file_tag_assignments foreign keys

ALTER TABLE public.file_tag_assignments ADD CONSTRAINT fk_tag_assignment_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;
ALTER TABLE public.file_tag_assignments ADD CONSTRAINT fk_tag_assignment_tag FOREIGN KEY (tag_id) REFERENCES public.governance_tags(tag_id) ON DELETE CASCADE;
ALTER TABLE public.file_tag_assignments ADD CONSTRAINT fk_tag_assignment_user FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


-- public.files foreign keys

ALTER TABLE public.files ADD CONSTRAINT files_logical_file_id_fkey FOREIGN KEY (logical_file_id) REFERENCES public.logical_file_groups(logical_file_id) ON DELETE SET NULL;
ALTER TABLE public.files ADD CONSTRAINT files_parent_archive_id_fkey FOREIGN KEY (parent_archive_id) REFERENCES public.files(file_id) ON DELETE CASCADE;
ALTER TABLE public.files ADD CONSTRAINT files_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.files ADD CONSTRAINT files_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES public.vendor_agreements(id);
ALTER TABLE public.files ADD CONSTRAINT fk_files_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


-- public.fixed_width_schemas foreign keys

ALTER TABLE public.fixed_width_schemas ADD CONSTRAINT fixed_width_schemas_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


-- public.governance_policies foreign keys

ALTER TABLE public.governance_policies ADD CONSTRAINT fk_policy_creator FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


-- public.governance_tags foreign keys

ALTER TABLE public.governance_tags ADD CONSTRAINT fk_tag_creator FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


-- public.group_policy_attachments foreign keys

ALTER TABLE public.group_policy_attachments ADD CONSTRAINT group_policy_attachments_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.group_policy_attachments ADD CONSTRAINT group_policy_attachments_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.access_groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_policy_attachments ADD CONSTRAINT group_policy_attachments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.rbac_policies(id) ON DELETE CASCADE;


-- public.idempotency_keys foreign keys

ALTER TABLE public.idempotency_keys ADD CONSTRAINT idempotency_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.job_dependencies foreign keys

ALTER TABLE public.job_dependencies ADD CONSTRAINT job_dependencies_depends_on_job_id_fkey FOREIGN KEY (depends_on_job_id) REFERENCES public.file_schedules(id) ON DELETE CASCADE;
ALTER TABLE public.job_dependencies ADD CONSTRAINT job_dependencies_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.file_schedules(id) ON DELETE CASCADE;


-- public.job_group_schedules foreign keys

ALTER TABLE public.job_group_schedules ADD CONSTRAINT fk_job_group_schedules_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.job_group_schedules ADD CONSTRAINT job_group_schedules_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.job_groups(id) ON DELETE CASCADE;


-- public.job_history foreign keys

ALTER TABLE public.job_history ADD CONSTRAINT job_history_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


-- public.job_runs foreign keys

ALTER TABLE public.job_runs ADD CONSTRAINT job_runs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


-- public.job_schedules foreign keys

ALTER TABLE public.job_schedules ADD CONSTRAINT fk_job_schedules_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


-- public.jobs foreign keys

ALTER TABLE public.jobs ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


-- public.lineage_views foreign keys

ALTER TABLE public.lineage_views ADD CONSTRAINT lineage_views_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.lineage_views ADD CONSTRAINT lineage_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.logical_file_groups foreign keys

ALTER TABLE public.logical_file_groups ADD CONSTRAINT logical_file_groups_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


-- public.mapping_group_executions foreign keys

ALTER TABLE public.mapping_group_executions ADD CONSTRAINT fk_mapping_group_executions_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.mapping_group_executions ADD CONSTRAINT mapping_group_executions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.mapping_groups(id) ON DELETE CASCADE;


-- public.mapping_group_members foreign keys

ALTER TABLE public.mapping_group_members ADD CONSTRAINT mapping_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.mapping_groups(id) ON DELETE CASCADE;
ALTER TABLE public.mapping_group_members ADD CONSTRAINT mapping_group_members_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES public.transformation_mappings(mapping_id) ON DELETE CASCADE;


-- public.mapping_groups foreign keys

ALTER TABLE public.mapping_groups ADD CONSTRAINT fk_mapping_groups_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.mapping_groups ADD CONSTRAINT mapping_groups_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


-- public.n_step_workflow_assets foreign keys

ALTER TABLE public.n_step_workflow_assets ADD CONSTRAINT n_step_workflow_assets_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.n_step_workflow_steps(id) ON DELETE CASCADE;


-- public.n_step_workflow_run_steps foreign keys

ALTER TABLE public.n_step_workflow_run_steps ADD CONSTRAINT n_step_workflow_run_steps_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.n_step_workflow_runs(id) ON DELETE CASCADE;


-- public.n_step_workflow_runs foreign keys

ALTER TABLE public.n_step_workflow_runs ADD CONSTRAINT n_step_workflow_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES public.users(id);
ALTER TABLE public.n_step_workflow_runs ADD CONSTRAINT n_step_workflow_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.n_step_workflows(id);


-- public.n_step_workflow_steps foreign keys

ALTER TABLE public.n_step_workflow_steps ADD CONSTRAINT n_step_workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.n_step_workflows(id) ON DELETE CASCADE;


-- public.n_step_workflows foreign keys

ALTER TABLE public.n_step_workflows ADD CONSTRAINT fk_n_step_workflows_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.n_step_workflows ADD CONSTRAINT n_step_workflows_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.n_step_workflows ADD CONSTRAINT n_step_workflows_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


-- public.notifications foreign keys

ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.password_reset_requests foreign keys

ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.processing_events foreign keys

ALTER TABLE public.processing_events ADD CONSTRAINT processing_events_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


-- public.project_access_groups foreign keys

ALTER TABLE public.project_access_groups ADD CONSTRAINT project_access_groups_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id);
ALTER TABLE public.project_access_groups ADD CONSTRAINT project_access_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.access_groups(id) ON DELETE CASCADE;
ALTER TABLE public.project_access_groups ADD CONSTRAINT project_access_groups_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


-- public.project_members foreign keys

ALTER TABLE public.project_members ADD CONSTRAINT project_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.project_members ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.project_members ADD CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.projects foreign keys

ALTER TABLE public.projects ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD CONSTRAINT projects_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.projects(id) ON DELETE CASCADE;


-- public.quality_reports foreign keys

ALTER TABLE public.quality_reports ADD CONSTRAINT quality_reports_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


-- public.quality_rule_configurations foreign keys

ALTER TABLE public.quality_rule_configurations ADD CONSTRAINT quality_rule_configurations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.quality_rule_configurations ADD CONSTRAINT quality_rule_configurations_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.quality_rules(id) ON DELETE CASCADE;


-- public.quality_rule_violations foreign keys

ALTER TABLE public.quality_rule_violations ADD CONSTRAINT quality_rule_violations_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id);
ALTER TABLE public.quality_rule_violations ADD CONSTRAINT quality_rule_violations_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.quality_rules(id) ON DELETE CASCADE;


-- public.quality_rules foreign keys

ALTER TABLE public.quality_rules ADD CONSTRAINT quality_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.quality_rules ADD CONSTRAINT quality_rules_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


-- public.rbac_policies foreign keys

ALTER TABLE public.rbac_policies ADD CONSTRAINT rbac_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.rbac_policies ADD CONSTRAINT rbac_policies_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


-- public.refresh_tokens foreign keys

ALTER TABLE public.refresh_tokens ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.resource_attributes foreign keys

ALTER TABLE public.resource_attributes ADD CONSTRAINT resource_attributes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


-- public.resource_policy_attachments foreign keys

ALTER TABLE public.resource_policy_attachments ADD CONSTRAINT resource_policy_attachments_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.resource_policy_attachments ADD CONSTRAINT resource_policy_attachments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.rbac_policies(id) ON DELETE CASCADE;


-- public.retention_policies foreign keys

ALTER TABLE public.retention_policies ADD CONSTRAINT retention_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


-- public.retention_policy_runs foreign keys

ALTER TABLE public.retention_policy_runs ADD CONSTRAINT retention_policy_runs_executed_by_fkey FOREIGN KEY (executed_by) REFERENCES public.users(id);
ALTER TABLE public.retention_policy_runs ADD CONSTRAINT retention_policy_runs_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.retention_policies(id);


-- public.schedules foreign keys

ALTER TABLE public.schedules ADD CONSTRAINT fk_schedules_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


-- public.schema_validation_job_files foreign keys

ALTER TABLE public.schema_validation_job_files ADD CONSTRAINT schema_validation_job_files_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.schema_validation_jobs(id) ON DELETE CASCADE;


-- public.schema_validation_jobs foreign keys

ALTER TABLE public.schema_validation_jobs ADD CONSTRAINT schema_validation_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.schema_validation_jobs ADD CONSTRAINT schema_validation_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE public.schema_validation_jobs ADD CONSTRAINT schema_validation_jobs_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES public.vendor_agreements(id);


-- public.storage_connections foreign keys

ALTER TABLE public.storage_connections ADD CONSTRAINT fk_storage_connections_project FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE public.storage_connections ADD CONSTRAINT storage_connections_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id) ON DELETE SET NULL;


-- public.sub_project_access_groups foreign keys

ALTER TABLE public.sub_project_access_groups ADD CONSTRAINT sub_project_access_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.access_groups(id) ON DELETE CASCADE;
ALTER TABLE public.sub_project_access_groups ADD CONSTRAINT sub_project_access_groups_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


-- public.sub_project_members foreign keys

ALTER TABLE public.sub_project_members ADD CONSTRAINT sub_project_members_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.sub_project_members ADD CONSTRAINT sub_project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.tag_permissions foreign keys

ALTER TABLE public.tag_permissions ADD CONSTRAINT fk_tag_permission_role FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;
ALTER TABLE public.tag_permissions ADD CONSTRAINT fk_tag_permission_tag FOREIGN KEY (tag_id) REFERENCES public.governance_tags(tag_id) ON DELETE CASCADE;


-- public.transform_connections foreign keys

ALTER TABLE public.transform_connections ADD CONSTRAINT fk_transform_connections_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


-- public.transformation_jobs foreign keys

ALTER TABLE public.transformation_jobs ADD CONSTRAINT fk_transformation_jobs_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.transformation_jobs ADD CONSTRAINT transformation_jobs_mapping_group_execution_id_fkey FOREIGN KEY (mapping_group_execution_id) REFERENCES public.mapping_group_executions(id);
ALTER TABLE public.transformation_jobs ADD CONSTRAINT transformation_jobs_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES public.transformation_mappings(mapping_id) ON DELETE SET NULL;
ALTER TABLE public.transformation_jobs ADD CONSTRAINT transformation_jobs_visual_workflow_execution_id_fkey FOREIGN KEY (visual_workflow_execution_id) REFERENCES public.visual_workflow_executions(id);
ALTER TABLE public.transformation_jobs ADD CONSTRAINT transformation_jobs_workflow_execution_id_fkey FOREIGN KEY (workflow_execution_id) REFERENCES public.n_step_workflow_runs(id) ON DELETE SET NULL;


-- public.transformation_logs foreign keys

ALTER TABLE public.transformation_logs ADD CONSTRAINT transformation_logs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.transformation_jobs(job_id) ON DELETE CASCADE;


-- public.transformation_mappings foreign keys

ALTER TABLE public.transformation_mappings ADD CONSTRAINT fk_transformation_mappings_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.transformation_mappings ADD CONSTRAINT transformation_mappings_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.transformation_mappings ADD CONSTRAINT transformation_mappings_vendor_agreement_file_schema_id_fkey FOREIGN KEY (vendor_agreement_file_schema_id) REFERENCES public.vendor_agreement_file_schemas(id);
ALTER TABLE public.transformation_mappings ADD CONSTRAINT transformation_mappings_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES public.vendor_agreements(id) ON DELETE SET NULL;
ALTER TABLE public.transformation_mappings ADD CONSTRAINT transformation_mappings_visual_mapping_id_fkey FOREIGN KEY (visual_mapping_id) REFERENCES public.visual_mapping_defs(id) ON DELETE SET NULL;


-- public.transformation_quality_rules foreign keys

ALTER TABLE public.transformation_quality_rules ADD CONSTRAINT fk_transformation_quality_rules_mapping FOREIGN KEY (mapping_id) REFERENCES public.transformation_mappings(mapping_id) ON DELETE CASCADE;
ALTER TABLE public.transformation_quality_rules ADD CONSTRAINT fk_transformation_quality_rules_rule FOREIGN KEY (quality_rule_id) REFERENCES public.quality_rules(id) ON DELETE CASCADE;


-- public.upload_batches foreign keys

ALTER TABLE public.upload_batches ADD CONSTRAINT upload_batches_api_token_id_fkey FOREIGN KEY (api_token_id) REFERENCES public.api_tokens(id);
ALTER TABLE public.upload_batches ADD CONSTRAINT upload_batches_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE public.upload_batches ADD CONSTRAINT upload_batches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


-- public.upload_file_records foreign keys

ALTER TABLE public.upload_file_records ADD CONSTRAINT upload_file_records_upload_file_id_fkey FOREIGN KEY (upload_file_id) REFERENCES public.upload_files(id) ON DELETE CASCADE;


-- public.upload_files foreign keys

ALTER TABLE public.upload_files ADD CONSTRAINT upload_files_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.upload_batches(id) ON DELETE CASCADE;


-- public.user_attributes foreign keys

ALTER TABLE public.user_attributes ADD CONSTRAINT user_attributes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.user_attributes ADD CONSTRAINT user_attributes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.user_badges foreign keys

ALTER TABLE public.user_badges ADD CONSTRAINT user_badges_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id);


-- public.user_groups foreign keys

ALTER TABLE public.user_groups ADD CONSTRAINT user_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.access_groups(id) ON DELETE CASCADE;
ALTER TABLE public.user_groups ADD CONSTRAINT user_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.user_policy_attachments foreign keys

ALTER TABLE public.user_policy_attachments ADD CONSTRAINT user_policy_attachments_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.user_policy_attachments ADD CONSTRAINT user_policy_attachments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.rbac_policies(id) ON DELETE CASCADE;
ALTER TABLE public.user_policy_attachments ADD CONSTRAINT user_policy_attachments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.user_roles foreign keys

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.user_sessions foreign keys

ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.users foreign keys

ALTER TABLE public.users ADD CONSTRAINT users_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;


-- public.vendor_agreement_approvals foreign keys

ALTER TABLE public.vendor_agreement_approvals ADD CONSTRAINT vendor_agreement_approvals_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES public.vendor_agreements(id) ON DELETE CASCADE;
ALTER TABLE public.vendor_agreement_approvals ADD CONSTRAINT vendor_agreement_approvals_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.vendor_agreement_changes foreign keys

ALTER TABLE public.vendor_agreement_changes ADD CONSTRAINT vendor_agreement_changes_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES public.vendor_agreements(id) ON DELETE CASCADE;
ALTER TABLE public.vendor_agreement_changes ADD CONSTRAINT vendor_agreement_changes_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.vendor_agreement_documents foreign keys

ALTER TABLE public.vendor_agreement_documents ADD CONSTRAINT vendor_agreement_documents_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES public.vendor_agreements(id) ON DELETE CASCADE;
ALTER TABLE public.vendor_agreement_documents ADD CONSTRAINT vendor_agreement_documents_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES public.vendor_agreement_approvals(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_agreement_documents ADD CONSTRAINT vendor_agreement_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE CASCADE;


-- public.vendor_agreement_file_schemas foreign keys

ALTER TABLE public.vendor_agreement_file_schemas ADD CONSTRAINT vendor_agreement_file_schemas_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_agreement_file_schemas ADD CONSTRAINT vendor_agreement_file_schemas_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_agreement_file_schemas ADD CONSTRAINT vendor_agreement_file_schemas_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES public.vendor_agreements(id) ON DELETE CASCADE;


-- public.vendor_agreements foreign keys

ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_file_owner_user_id_fkey FOREIGN KEY (file_owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_governance_approved_by_fkey FOREIGN KEY (governance_approved_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_governance_manager_user_id_fkey FOREIGN KEY (governance_manager_user_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_owner_approved_by_fkey FOREIGN KEY (owner_approved_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_vendor_approved_by_fkey FOREIGN KEY (vendor_approved_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_vendor_connection_id_fkey FOREIGN KEY (vendor_connection_id) REFERENCES public.storage_connections(connection_id) ON DELETE SET NULL;
ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;


-- public.vendor_file_profiling_results foreign keys

ALTER TABLE public.vendor_file_profiling_results ADD CONSTRAINT vendor_file_profiling_results_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.storage_connections(connection_id);
ALTER TABLE public.vendor_file_profiling_results ADD CONSTRAINT vendor_file_profiling_results_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;
ALTER TABLE public.vendor_file_profiling_results ADD CONSTRAINT vendor_file_profiling_results_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id);
ALTER TABLE public.vendor_file_profiling_results ADD CONSTRAINT vendor_file_profiling_results_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


-- public.vendor_sla_violations foreign keys

ALTER TABLE public.vendor_sla_violations ADD CONSTRAINT vendor_sla_violations_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES public.vendor_agreements(id) ON DELETE CASCADE;


-- public.vendor_users foreign keys

ALTER TABLE public.vendor_users ADD CONSTRAINT vendor_users_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.vendor_users ADD CONSTRAINT vendor_users_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);
ALTER TABLE public.vendor_users ADD CONSTRAINT vendor_users_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;


-- public.vendors foreign keys

ALTER TABLE public.vendors ADD CONSTRAINT vendors_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_vendor_user_id_fkey FOREIGN KEY (vendor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


-- public.visual_lineage_graphs foreign keys

ALTER TABLE public.visual_lineage_graphs ADD CONSTRAINT visual_lineage_graphs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.visual_lineage_graphs ADD CONSTRAINT visual_lineage_graphs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


-- public.visual_mapping_defs foreign keys

ALTER TABLE public.visual_mapping_defs ADD CONSTRAINT visual_mapping_defs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.visual_mapping_defs ADD CONSTRAINT visual_mapping_defs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


-- public.visual_mapping_edges foreign keys

ALTER TABLE public.visual_mapping_edges ADD CONSTRAINT visual_mapping_edges_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES public.visual_mapping_defs(id) ON DELETE CASCADE;


-- public.visual_mapping_execution_logs foreign keys

ALTER TABLE public.visual_mapping_execution_logs ADD CONSTRAINT visual_mapping_execution_logs_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES public.visual_mapping_defs(id) ON DELETE CASCADE;


-- public.visual_mapping_executions foreign keys

ALTER TABLE public.visual_mapping_executions ADD CONSTRAINT visual_mapping_executions_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES public.visual_mapping_defs(id) ON DELETE CASCADE;
ALTER TABLE public.visual_mapping_executions ADD CONSTRAINT visual_mapping_executions_transformation_id_fkey FOREIGN KEY (transformation_id) REFERENCES public.transformation_mappings(id) ON DELETE SET NULL;
ALTER TABLE public.visual_mapping_executions ADD CONSTRAINT visual_mapping_executions_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES public.users(id);


-- public.visual_mapping_nodes foreign keys

ALTER TABLE public.visual_mapping_nodes ADD CONSTRAINT visual_mapping_nodes_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES public.visual_mapping_defs(id) ON DELETE CASCADE;


-- public.visual_workflow_execution_logs foreign keys

ALTER TABLE public.visual_workflow_execution_logs ADD CONSTRAINT visual_workflow_execution_logs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.visual_workflows(id) ON DELETE CASCADE;


-- public.visual_workflow_executions foreign keys

ALTER TABLE public.visual_workflow_executions ADD CONSTRAINT visual_workflow_executions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE public.visual_workflow_executions ADD CONSTRAINT visual_workflow_executions_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES public.users(id);
ALTER TABLE public.visual_workflow_executions ADD CONSTRAINT visual_workflow_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.visual_workflows(id);


-- public.visual_workflows foreign keys

ALTER TABLE public.visual_workflows ADD CONSTRAINT visual_workflows_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.visual_workflows ADD CONSTRAINT visual_workflows_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.visual_workflows ADD CONSTRAINT visual_workflows_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


-- public.workflow_executions foreign keys

ALTER TABLE public.workflow_executions ADD CONSTRAINT fk_workflow_executions_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_executions ADD CONSTRAINT workflow_executions_current_step_id_fkey FOREIGN KEY (current_step_id) REFERENCES public.workflow_steps(id);
ALTER TABLE public.workflow_executions ADD CONSTRAINT workflow_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.business_processes(id) ON DELETE CASCADE;


-- public.workflow_steps foreign keys

ALTER TABLE public.workflow_steps ADD CONSTRAINT fk_workflow_steps_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_steps ADD CONSTRAINT workflow_steps_depends_on_fkey FOREIGN KEY (depends_on) REFERENCES public.workflow_steps(id) ON DELETE SET NULL;
ALTER TABLE public.workflow_steps ADD CONSTRAINT workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.business_processes(id) ON DELETE CASCADE;


-- public.file_pattern_metrics_monthly source

CREATE MATERIALIZED VIEW public.file_pattern_metrics_monthly
TABLESPACE pg_default
AS SELECT file_pattern,
    date_trunc('month'::text, metric_date::timestamp with time zone)::date AS month_start,
    sum(record_count) AS total_records,
    sum(file_count) AS total_files,
    sum(duplicate_count) AS total_duplicates,
    avg(duplicate_percentage) AS avg_duplicate_percentage,
    jsonb_object_agg(to_char(metric_date::timestamp with time zone, 'YYYY-MM-DD'::text), null_counts) FILTER (WHERE null_counts IS NOT NULL) AS daily_null_counts,
    jsonb_object_agg(to_char(metric_date::timestamp with time zone, 'YYYY-MM-DD'::text), numeric_stats) FILTER (WHERE numeric_stats IS NOT NULL) AS daily_numeric_stats,
    avg(completeness_score) AS avg_completeness_score,
    avg(consistency_score) AS avg_consistency_score,
    avg(validity_score) AS avg_validity_score,
    avg(overall_quality_score) AS avg_overall_quality_score,
    bool_or(has_alerts) AS has_alerts,
    sum(alert_count) AS total_alerts,
    max(updated_at) AS last_updated
   FROM file_pattern_metrics
  GROUP BY file_pattern, (date_trunc('month'::text, metric_date::timestamp with time zone))
WITH DATA;

-- View indexes:
CREATE UNIQUE INDEX idx_file_pattern_metrics_monthly_pattern_month ON public.file_pattern_metrics_monthly USING btree (file_pattern, month_start DESC);


-- public.file_pattern_metrics_weekly source

CREATE MATERIALIZED VIEW public.file_pattern_metrics_weekly
TABLESPACE pg_default
AS SELECT file_pattern,
    date_trunc('week'::text, metric_date::timestamp with time zone)::date AS week_start,
    sum(record_count) AS total_records,
    sum(file_count) AS total_files,
    sum(duplicate_count) AS total_duplicates,
    avg(duplicate_percentage) AS avg_duplicate_percentage,
    jsonb_object_agg(metric_date::text, null_counts) FILTER (WHERE null_counts IS NOT NULL) AS daily_null_counts,
    jsonb_object_agg(metric_date::text, numeric_stats) FILTER (WHERE numeric_stats IS NOT NULL) AS daily_numeric_stats,
    avg(completeness_score) AS avg_completeness_score,
    avg(consistency_score) AS avg_consistency_score,
    avg(validity_score) AS avg_validity_score,
    avg(overall_quality_score) AS avg_overall_quality_score,
    bool_or(has_alerts) AS has_alerts,
    sum(alert_count) AS total_alerts,
    max(updated_at) AS last_updated
   FROM file_pattern_metrics
  GROUP BY file_pattern, (date_trunc('week'::text, metric_date::timestamp with time zone))
WITH DATA;

-- View indexes:
CREATE UNIQUE INDEX idx_file_pattern_metrics_weekly_pattern_week ON public.file_pattern_metrics_weekly USING btree (file_pattern, week_start DESC);


-- public.mv_file_processing_summary source

CREATE MATERIALIZED VIEW public.mv_file_processing_summary
TABLESPACE pg_default
AS SELECT date_trunc('day'::text, created_at) AS day,
    file_type,
    count(*) AS file_count,
    COALESCE(sum(file_size), 0::numeric) AS total_size_bytes,
    COALESCE(avg(file_size), 0::numeric) AS avg_size_bytes,
    count(DISTINCT project_id) AS projects_count
   FROM files f
  WHERE created_at > (now() - '30 days'::interval)
  GROUP BY (date_trunc('day'::text, created_at)), file_type
  ORDER BY (date_trunc('day'::text, created_at)) DESC
WITH DATA;

-- View indexes:
CREATE UNIQUE INDEX idx_mv_file_processing_day_type ON public.mv_file_processing_summary USING btree (day, file_type);


-- public.mv_job_trends_hourly source

CREATE MATERIALIZED VIEW public.mv_job_trends_hourly
TABLESPACE pg_default
AS SELECT date_trunc('hour'::text, created_at) AS hour,
    status,
    count(*) AS job_count,
    COALESCE(sum(rows_read), 0::numeric) AS records_processed,
    COALESCE(sum(rows_failed), 0::numeric) AS records_failed
   FROM transformation_jobs
  WHERE created_at > (now() - '7 days'::interval)
  GROUP BY (date_trunc('hour'::text, created_at)), status
  ORDER BY (date_trunc('hour'::text, created_at)) DESC
WITH DATA;

-- View indexes:
CREATE UNIQUE INDEX idx_mv_job_trends_hour_status ON public.mv_job_trends_hourly USING btree (hour, status);



-- DROP FUNCTION public.cleanup_expired_policy_cache();

CREATE OR REPLACE FUNCTION public.cleanup_expired_policy_cache()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
      BEGIN
        DELETE FROM policy_evaluation_cache WHERE expires_at < NOW();
      END;
      $function$
;

-- DROP FUNCTION public.get_user_projects(int4);

CREATE OR REPLACE FUNCTION public.get_user_projects(user_id_param integer)
 RETURNS TABLE(project_id integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT DISTINCT pm.project_id
  FROM project_members pm
  WHERE pm.user_id = user_id_param
  
  UNION
  
  SELECT DISTINCT pag.project_id
  FROM project_access_groups pag
  INNER JOIN user_groups ug ON pag.group_id = ug.group_id
  WHERE ug.user_id = user_id_param;
END;
$function$
;

-- DROP FUNCTION public.prevent_audit_ledger_delete();

CREATE OR REPLACE FUNCTION public.prevent_audit_ledger_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        RAISE EXCEPTION 'Audit ledger entries are immutable and cannot be deleted';
      END;
      $function$
;

-- DROP FUNCTION public.prevent_audit_ledger_update();

CREATE OR REPLACE FUNCTION public.prevent_audit_ledger_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        RAISE EXCEPTION 'Audit ledger entries are immutable and cannot be updated';
      END;
      $function$
;

-- DROP FUNCTION public.refresh_file_pattern_metrics_views();

CREATE OR REPLACE FUNCTION public.refresh_file_pattern_metrics_views()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        -- Refresh weekly view concurrently (non-blocking)
        REFRESH MATERIALIZED VIEW CONCURRENTLY file_pattern_metrics_weekly;
        
        -- Refresh monthly view concurrently (non-blocking)
        REFRESH MATERIALIZED VIEW CONCURRENTLY file_pattern_metrics_monthly;
        
        RETURN NEW;
      END;
      $function$
;

-- DROP FUNCTION public.trigger_cleanup_policy_cache();

CREATE OR REPLACE FUNCTION public.trigger_cleanup_policy_cache()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        PERFORM cleanup_expired_policy_cache();
        RETURN NEW;
      END;
      $function$
;

-- DROP FUNCTION public.update_full_name();

CREATE OR REPLACE FUNCTION public.update_full_name()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        NEW.full_name := TRIM(CONCAT_WS(' ', 
          NEW.first_name, 
          NEW.middle_name, 
          NEW.last_name
        ));
        RETURN NEW;
      END;
      $function$
;

-- DROP FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $function$
;

-- DROP FUNCTION public.update_vendor_agreement_file_schemas_updated_at();

CREATE OR REPLACE FUNCTION public.update_vendor_agreement_file_schemas_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $function$
;

-- DROP FUNCTION public.update_vendor_users_updated_at();

CREATE OR REPLACE FUNCTION public.update_vendor_users_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $function$
;