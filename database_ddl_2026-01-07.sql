-- =====================================================
-- DATA FILE OBSERVATORY - Database DDL Script
-- Generated: 2026-01-07 07:22:09 UTC
-- PostgreSQL Version: 16
-- Total Tables: 167
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

CREATE TABLE public.access_group_members (
    group_id integer NOT NULL,
    user_id integer NOT NULL,
    source character varying(50) DEFAULT 'MANUAL'::character varying,
    added_by integer,
    added_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: access_group_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_group_roles (
    group_id integer,
    role_id integer,
    project_id integer,
    assigned_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    id integer NOT NULL
);


--
-- Name: access_group_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.access_group_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: access_group_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.access_group_roles_id_seq OWNED BY public.access_group_roles.id;


--
-- Name: access_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_groups (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    group_type character varying(50) DEFAULT 'MANUAL'::character varying,
    idp_source character varying(100),
    external_group_id character varying(255),
    sync_enabled boolean DEFAULT false,
    last_synced_at timestamp without time zone,
    sync_status character varying(50),
    sync_error text,
    created_by integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: access_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.access_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: access_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.access_groups_id_seq OWNED BY public.access_groups.id;


--
-- Name: alert_aggregation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_aggregation (
    id integer NOT NULL,
    policy_id integer NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id character varying(255) NOT NULL,
    event_type character varying(50) NOT NULL,
    status character varying(50) NOT NULL,
    occurred_at timestamp without time zone NOT NULL,
    metadata jsonb,
    aggregation_ttl timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: alert_aggregation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_aggregation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_aggregation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_aggregation_id_seq OWNED BY public.alert_aggregation.id;


--
-- Name: alert_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_attachments (
    id integer NOT NULL,
    run_id integer NOT NULL,
    attachment_type character varying(50) NOT NULL,
    file_name character varying(255) NOT NULL,
    file_size_bytes bigint NOT NULL,
    storage_type character varying(50) NOT NULL,
    storage_path text,
    cloud_url text,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: alert_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_attachments_id_seq OWNED BY public.alert_attachments.id;


--
-- Name: alert_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_events (
    id integer NOT NULL,
    run_id integer NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id character varying(255) NOT NULL,
    event_type character varying(50) NOT NULL,
    status character varying(50) NOT NULL,
    occurred_at timestamp without time zone NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    vendor_sla_violation_id integer
);


--
-- Name: alert_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_events_id_seq OWNED BY public.alert_events.id;


--
-- Name: alert_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_history (
    id integer NOT NULL,
    file_id character varying(255),
    rule_id integer,
    triggered_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    alert_details jsonb
);


--
-- Name: alert_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_history_id_seq OWNED BY public.alert_history.id;


--
-- Name: alert_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_policies (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    project_id integer NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id character varying(255),
    trigger_events jsonb DEFAULT '[]'::jsonb NOT NULL,
    consolidate_alerts boolean DEFAULT true NOT NULL,
    consolidation_window_minutes integer DEFAULT 60 NOT NULL,
    email_connection_id character varying(255),
    enabled boolean DEFAULT true NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT alert_policies_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['job'::character varying, 'mapping_group'::character varying, 'workflow'::character varying, 'schedule'::character varying, 'vendor_sla'::character varying])::text[])))
);


--
-- Name: alert_policies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_policies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_policies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_policies_id_seq OWNED BY public.alert_policies.id;


--
-- Name: alert_policy_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_policy_recipients (
    id integer NOT NULL,
    policy_id integer NOT NULL,
    user_id integer,
    email character varying(255),
    delivery_method character varying(50) DEFAULT 'email'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_recipient CHECK (((user_id IS NOT NULL) OR (email IS NOT NULL)))
);


--
-- Name: alert_policy_recipients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_policy_recipients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_policy_recipients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_policy_recipients_id_seq OWNED BY public.alert_policy_recipients.id;


--
-- Name: alert_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_rules (
    id integer NOT NULL,
    rule_name character varying(255) NOT NULL,
    rule_type character varying(50) NOT NULL,
    rule_condition character varying(50) NOT NULL,
    rule_value text NOT NULL,
    severity character varying(20) NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: alert_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_rules_id_seq OWNED BY public.alert_rules.id;


--
-- Name: alert_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_runs (
    id integer NOT NULL,
    policy_id integer NOT NULL,
    run_type character varying(50) NOT NULL,
    status character varying(50) NOT NULL,
    email_connection_id character varying(255),
    recipients_count integer DEFAULT 0 NOT NULL,
    sent_at timestamp without time zone,
    error_message text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: alert_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_runs_id_seq OWNED BY public.alert_runs.id;


--
-- Name: allowed_email_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allowed_email_domains (
    id integer NOT NULL,
    domain character varying(255) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: allowed_email_domains_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.allowed_email_domains_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: allowed_email_domains_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.allowed_email_domains_id_seq OWNED BY public.allowed_email_domains.id;


--
-- Name: anomalies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anomalies (
    id integer NOT NULL,
    anomaly_id character varying(255) NOT NULL,
    file_id character varying(255),
    file_name character varying(500),
    mapping_id character varying(255),
    job_id character varying(255),
    anomaly_type character varying(100) NOT NULL,
    severity character varying(20) NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    anomaly_details jsonb,
    expected_value text,
    actual_value text,
    deviation_percentage numeric(10,2),
    status character varying(50) DEFAULT 'open'::character varying,
    resolved_at timestamp without time zone,
    resolved_by character varying(255),
    resolution_notes text,
    detected_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: anomalies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.anomalies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: anomalies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.anomalies_id_seq OWNED BY public.anomalies.id;


--
-- Name: api_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_tokens (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    token_hash character varying(255) NOT NULL,
    token_prefix character varying(20) NOT NULL,
    user_id integer,
    project_id integer,
    scopes jsonb DEFAULT '[]'::jsonb NOT NULL,
    rate_limit integer DEFAULT 100,
    rate_window_hours integer DEFAULT 1,
    is_active boolean DEFAULT true,
    expires_at timestamp without time zone,
    last_used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    created_by integer,
    revoked_at timestamp without time zone,
    revoked_by integer,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: api_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.api_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: api_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.api_tokens_id_seq OWNED BY public.api_tokens.id;


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id integer NOT NULL,
    setting_key character varying(100) NOT NULL,
    setting_value text NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: app_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_settings_id_seq OWNED BY public.app_settings.id;


--
-- Name: archive_extractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archive_extractions (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    archive_type character varying(50) NOT NULL,
    is_encrypted boolean DEFAULT false,
    password_required boolean DEFAULT false,
    extraction_status character varying(50) DEFAULT 'pending'::character varying,
    error_message text,
    extracted_count integer DEFAULT 0,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: TABLE archive_extractions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.archive_extractions IS 'Tracks archive extraction attempts with status, errors, and metadata';


--
-- Name: COLUMN archive_extractions.file_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.archive_extractions.file_id IS 'Reference to the parent archive file in files table';


--
-- Name: COLUMN archive_extractions.archive_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.archive_extractions.archive_type IS 'Archive format detected (zip, 7z, tar, tar.gz, tar.bz2)';


--
-- Name: COLUMN archive_extractions.extraction_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.archive_extractions.extraction_status IS 'Current status of extraction attempt';


--
-- Name: COLUMN archive_extractions.extracted_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.archive_extractions.extracted_count IS 'Number of files successfully extracted from archive';


--
-- Name: archive_extractions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.archive_extractions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: archive_extractions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.archive_extractions_id_seq OWNED BY public.archive_extractions.id;


--
-- Name: archive_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archive_members (
    id integer NOT NULL,
    parent_file_id character varying(255) NOT NULL,
    extracted_file_id character varying(255),
    logical_name text NOT NULL,
    original_name text NOT NULL,
    file_format character varying(20),
    file_size_bytes bigint,
    extraction_status character varying(50) DEFAULT 'pending'::character varying,
    error_message text,
    extracted_at timestamp with time zone,
    processed_at timestamp with time zone
);


--
-- Name: TABLE archive_members; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.archive_members IS 'Tracks individual files extracted from ZIP/tar archives with their processing status';


--
-- Name: archive_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.archive_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: archive_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.archive_members_id_seq OWNED BY public.archive_members.id;


--
-- Name: archived_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archived_files (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    original_filename character varying(500),
    original_path character varying(1000),
    original_size_bytes bigint,
    policy_id integer,
    archive_storage_type character varying(50) NOT NULL,
    archive_connection_id uuid,
    archive_path character varying(1000) NOT NULL,
    archive_checksum character varying(64),
    archived_at timestamp without time zone DEFAULT now(),
    archived_by integer,
    archive_reason text,
    original_metadata jsonb,
    quality_score numeric(5,2),
    row_count integer,
    column_count integer,
    file_type character varying(50),
    is_restored boolean DEFAULT false,
    restored_at timestamp without time zone,
    restored_by integer,
    is_deleted boolean DEFAULT false,
    deleted_at timestamp without time zone,
    deleted_by integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: archived_files_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.archived_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: archived_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.archived_files_id_seq OWNED BY public.archived_files.id;


--
-- Name: attribute_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attribute_definitions (
    id integer NOT NULL,
    attribute_key character varying(100) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    attribute_type character varying(50) NOT NULL,
    scope character varying(50) NOT NULL,
    allowed_values jsonb,
    validation_regex character varying(255),
    min_value numeric,
    max_value numeric,
    is_required boolean DEFAULT false,
    is_system boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: attribute_definitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attribute_definitions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attribute_definitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attribute_definitions_id_seq OWNED BY public.attribute_definitions.id;


--
-- Name: audit_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_ledger (
    id bigint NOT NULL,
    entry_id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) DEFAULT 'default'::character varying,
    job_id character varying(255),
    correlation_id character varying(255),
    parent_entry_id uuid,
    actor_id character varying(255),
    actor_email character varying(255),
    actor_role character varying(100),
    actor_ip inet,
    action_type character varying(100) NOT NULL,
    action_category character varying(50) DEFAULT 'EXECUTION'::character varying NOT NULL,
    entity_type character varying(100),
    entity_id character varying(255),
    entity_name character varying(500),
    log_level character varying(20) DEFAULT 'INFO'::character varying NOT NULL,
    message text NOT NULL,
    payload jsonb,
    event_timestamp timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    sequence_number bigint NOT NULL,
    prev_hash character varying(64),
    record_hash character varying(64) NOT NULL,
    signature text,
    signature_algorithm character varying(50),
    source_system character varying(100) DEFAULT 'data_observatory'::character varying,
    version character varying(20) DEFAULT '1.0'::character varying
);


--
-- Name: TABLE audit_ledger; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_ledger IS 'Immutable audit ledger with cryptographic hash chaining for regulatory compliance. Records cannot be updated or deleted.';


--
-- Name: COLUMN audit_ledger.sequence_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_ledger.sequence_number IS 'Monotonically increasing sequence number per tenant for ordering';


--
-- Name: COLUMN audit_ledger.prev_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_ledger.prev_hash IS 'SHA-256 hash of the previous record in the chain, NULL for first record';


--
-- Name: COLUMN audit_ledger.record_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_ledger.record_hash IS 'SHA-256 hash of this record including prev_hash for tamper detection';


--
-- Name: audit_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_ledger_id_seq OWNED BY public.audit_ledger.id;


--
-- Name: audit_ledger_sequence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_ledger_sequence (
    tenant_id character varying(255) DEFAULT 'default'::character varying NOT NULL,
    current_sequence bigint DEFAULT 0 NOT NULL,
    last_hash character varying(64),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: audit_ledger_verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_ledger_verification (
    id integer NOT NULL,
    verification_id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) DEFAULT 'default'::character varying NOT NULL,
    start_sequence bigint NOT NULL,
    end_sequence bigint NOT NULL,
    status character varying(20) NOT NULL,
    entries_verified bigint DEFAULT 0 NOT NULL,
    entries_failed bigint DEFAULT 0 NOT NULL,
    first_failed_sequence bigint,
    failure_reason text,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone,
    duration_ms bigint,
    verified_by character varying(255),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: audit_ledger_verification_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_ledger_verification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_ledger_verification_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_ledger_verification_id_seq OWNED BY public.audit_ledger_verification.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    audit_id bigint NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    user_id character varying(255),
    user_email character varying(255),
    user_role character varying(100),
    ip_address inet,
    session_id character varying(255),
    action_type character varying(100) NOT NULL,
    entity_type character varying(100) NOT NULL,
    entity_id character varying(255),
    entity_name character varying(255),
    operation character varying(50),
    old_values jsonb,
    new_values jsonb,
    changes jsonb,
    parent_audit_id bigint,
    request_id character varying(255),
    api_endpoint character varying(255),
    http_method character varying(10),
    status character varying(50),
    error_message text,
    metadata jsonb,
    retention_until timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: audit_log_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_archive (
    audit_id bigint NOT NULL,
    "timestamp" timestamp without time zone NOT NULL,
    user_id character varying(255),
    user_email character varying(255),
    user_role character varying(100),
    ip_address inet,
    session_id character varying(255),
    action_type character varying(100) NOT NULL,
    entity_type character varying(100) NOT NULL,
    entity_id character varying(255) NOT NULL,
    entity_name character varying(255),
    operation character varying(50),
    old_values jsonb,
    new_values jsonb,
    changes jsonb,
    parent_audit_id bigint,
    request_id character varying(255),
    api_endpoint character varying(255),
    http_method character varying(10),
    status character varying(50),
    error_message text,
    metadata jsonb,
    retention_until timestamp without time zone,
    created_at timestamp without time zone,
    archived_at timestamp without time zone DEFAULT now()
);


--
-- Name: audit_log_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_audit_id_seq OWNED BY public.audit_log.audit_id;


--
-- Name: audit_retention_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_retention_settings (
    id integer NOT NULL,
    retention_days integer DEFAULT 30 NOT NULL,
    auto_archive_enabled boolean DEFAULT true,
    auto_delete_enabled boolean DEFAULT false,
    last_archive_run timestamp without time zone,
    last_cleanup_run timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: audit_retention_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_retention_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_retention_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_retention_settings_id_seq OWNED BY public.audit_retention_settings.id;


--
-- Name: bulk_profiling_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulk_profiling_files (
    id integer NOT NULL,
    job_id character varying(36) NOT NULL,
    file_path text NOT NULL,
    file_name character varying(255) NOT NULL,
    file_size bigint,
    file_type character varying(50),
    status character varying(50) DEFAULT 'pending'::character varying,
    file_id character varying(255),
    error_message text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    started_at timestamp without time zone,
    completed_at timestamp without time zone
);


--
-- Name: bulk_profiling_files_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bulk_profiling_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bulk_profiling_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bulk_profiling_files_id_seq OWNED BY public.bulk_profiling_files.id;


--
-- Name: bulk_profiling_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulk_profiling_jobs (
    id character varying(36) NOT NULL,
    job_name character varying(255) NOT NULL,
    project_id integer,
    connection_id character varying(255) NOT NULL,
    s3_path text NOT NULL,
    file_pattern character varying(255) DEFAULT '*'::character varying,
    duplicate_handling character varying(50) DEFAULT 'skip'::character varying,
    recursive boolean DEFAULT false,
    status character varying(50) DEFAULT 'pending'::character varying,
    total_files integer DEFAULT 0,
    processed_files integer DEFAULT 0,
    successful_files integer DEFAULT 0,
    failed_files integer DEFAULT 0,
    execution_type character varying(50) DEFAULT 'manual'::character varying,
    error_message text,
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT now(),
    schedule_id character varying(36),
    skipped_files integer DEFAULT 0,
    sub_project_id integer,
    quality_rule_ids integer[]
);


--
-- Name: business_processes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_processes (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    group_id integer,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    project_id integer NOT NULL
);


--
-- Name: business_processes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_processes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_processes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_processes_id_seq OWNED BY public.business_processes.id;


--
-- Name: column_governance_tag_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.column_governance_tag_assignments (
    assignment_id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    column_name character varying(255) NOT NULL,
    tag_id character varying(255) NOT NULL,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: column_governance_tag_assignments_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.column_governance_tag_assignments_assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: column_governance_tag_assignments_assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.column_governance_tag_assignments_assignment_id_seq OWNED BY public.column_governance_tag_assignments.assignment_id;


--
-- Name: column_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.column_mappings (
    id integer NOT NULL,
    mapping_name character varying(255) NOT NULL,
    source_file_id character varying(255),
    target_file_type character varying(50) NOT NULL,
    mapping_config jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_used_at timestamp with time zone
);


--
-- Name: column_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.column_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: column_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.column_mappings_id_seq OWNED BY public.column_mappings.id;


--
-- Name: column_policy_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.column_policy_assignments (
    assignment_id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    column_name character varying(255) NOT NULL,
    policy_id character varying(255) NOT NULL,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: column_policy_assignments_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.column_policy_assignments_assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: column_policy_assignments_assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.column_policy_assignments_assignment_id_seq OWNED BY public.column_policy_assignments.assignment_id;


--
-- Name: column_sensitivity_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.column_sensitivity_tags (
    tag_id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    column_name character varying(255) NOT NULL,
    sensitivity_level character varying(50) NOT NULL,
    data_type character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    tagged_by character varying(255),
    tagged_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: column_sensitivity_tags_tag_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.column_sensitivity_tags_tag_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: column_sensitivity_tags_tag_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.column_sensitivity_tags_tag_id_seq OWNED BY public.column_sensitivity_tags.tag_id;


--
-- Name: config_change_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_change_history (
    change_id bigint NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    changed_by_user character varying(255) NOT NULL,
    changed_by_role character varying(100),
    config_type character varying(100),
    entity_type character varying(100),
    entity_id character varying(255),
    field_name character varying(255),
    old_value text,
    new_value text,
    change_reason text,
    ticket_reference character varying(100),
    requires_approval boolean DEFAULT false,
    approved_by character varying(255),
    approved_at timestamp without time zone,
    can_rollback boolean DEFAULT true,
    rollback_script text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: config_change_history_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_change_history_archive (
    change_id bigint NOT NULL,
    "timestamp" timestamp without time zone NOT NULL,
    changed_by_user character varying(255) NOT NULL,
    changed_by_role character varying(100),
    config_type character varying(100),
    entity_type character varying(100),
    entity_id character varying(255),
    field_name character varying(255),
    old_value text,
    new_value text,
    change_reason text,
    ticket_reference character varying(100),
    requires_approval boolean DEFAULT false,
    approved_by character varying(255),
    approved_at timestamp without time zone,
    can_rollback boolean DEFAULT true,
    rollback_script text,
    metadata jsonb,
    created_at timestamp without time zone,
    archived_at timestamp without time zone DEFAULT now()
);


--
-- Name: config_change_history_change_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.config_change_history_change_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: config_change_history_change_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.config_change_history_change_id_seq OWNED BY public.config_change_history.change_id;


--
-- Name: connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connections (
    id integer NOT NULL,
    connection_name character varying(255) NOT NULL,
    connection_type character varying(50) NOT NULL,
    host character varying(255),
    port integer,
    username character varying(255),
    password_encrypted character varying(512),
    database_name character varying(255),
    connection_string text,
    parameters jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_used_at timestamp with time zone,
    has_archive_password boolean DEFAULT false
);


--
-- Name: connections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.connections_id_seq OWNED BY public.connections.id;


--
-- Name: data_access_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_access_log (
    access_id bigint NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    user_id character varying(255),
    user_role character varying(100),
    ip_address inet,
    access_type character varying(50),
    file_id character varying(255),
    file_name character varying(255),
    table_name character varying(255),
    column_names text[],
    access_method character varying(100),
    query_text text,
    filters_applied jsonb,
    rows_accessed bigint,
    bytes_accessed bigint,
    access_purpose text,
    project_name character varying(255),
    contains_pii boolean DEFAULT false,
    data_classification character varying(50),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: data_access_log_access_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.data_access_log_access_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: data_access_log_access_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.data_access_log_access_id_seq OWNED BY public.data_access_log.access_id;


--
-- Name: data_access_log_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_access_log_archive (
    access_id bigint NOT NULL,
    "timestamp" timestamp without time zone NOT NULL,
    user_id character varying(255) NOT NULL,
    user_role character varying(100),
    ip_address inet,
    access_type character varying(50),
    file_id character varying(255),
    file_name character varying(255),
    table_name character varying(255),
    column_names text[],
    access_method character varying(100),
    query_text text,
    filters_applied jsonb,
    rows_accessed bigint,
    bytes_accessed bigint,
    access_purpose text,
    project_name character varying(255),
    contains_pii boolean DEFAULT false,
    data_classification character varying(50),
    metadata jsonb,
    created_at timestamp without time zone,
    archived_at timestamp without time zone DEFAULT now()
);


--
-- Name: dbt_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dbt_executions (
    execution_id integer NOT NULL,
    execution_uuid character varying(255) NOT NULL,
    command character varying(255) NOT NULL,
    models_selector character varying(255),
    triggered_by character varying(255),
    trigger_type character varying(50),
    status character varying(50) DEFAULT 'pending'::character varying,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    duration_ms bigint,
    models_run integer DEFAULT 0,
    models_success integer DEFAULT 0,
    models_failed integer DEFAULT 0,
    models_skipped integer DEFAULT 0,
    tests_run integer DEFAULT 0,
    tests_passed integer DEFAULT 0,
    tests_failed integer DEFAULT 0,
    results jsonb,
    logs text,
    error_message text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT valid_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'running'::character varying, 'success'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT valid_trigger_type CHECK (((trigger_type)::text = ANY ((ARRAY['manual'::character varying, 'scheduled'::character varying, 'api'::character varying, 'dependency'::character varying])::text[])))
);


--
-- Name: dbt_executions_execution_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dbt_executions_execution_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dbt_executions_execution_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dbt_executions_execution_id_seq OWNED BY public.dbt_executions.execution_id;


--
-- Name: dbt_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dbt_models (
    model_id integer NOT NULL,
    model_name character varying(255) NOT NULL,
    model_path character varying(500) NOT NULL,
    model_type character varying(50),
    materialization character varying(50),
    description text,
    tags text[],
    upstream_models text[],
    downstream_models text[],
    source_tables text[],
    last_compiled_at timestamp without time zone,
    last_run_at timestamp without time zone,
    last_run_status character varying(50),
    last_run_duration_ms bigint,
    row_count bigint,
    byte_size bigint,
    config jsonb,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT valid_materialization CHECK (((materialization)::text = ANY ((ARRAY['table'::character varying, 'view'::character varying, 'incremental'::character varying, 'ephemeral'::character varying])::text[]))),
    CONSTRAINT valid_model_type CHECK (((model_type)::text = ANY ((ARRAY['staging'::character varying, 'intermediate'::character varying, 'mart'::character varying, 'snapshot'::character varying, 'seed'::character varying])::text[])))
);


--
-- Name: dbt_models_model_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dbt_models_model_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dbt_models_model_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dbt_models_model_id_seq OWNED BY public.dbt_models.model_id;


--
-- Name: dlq_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dlq_jobs (
    id integer NOT NULL,
    job_type character varying(50) NOT NULL,
    file_id character varying(255),
    project_id integer,
    vendor_agreement_id integer,
    original_payload jsonb,
    error_code character varying(100) NOT NULL,
    error_message text NOT NULL,
    stack_trace text,
    remediation_instructions text,
    retry_count integer DEFAULT 0,
    max_retries integer DEFAULT 3,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamp with time zone,
    resolved_by integer,
    resolution_notes text
);


--
-- Name: dlq_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dlq_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dlq_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dlq_jobs_id_seq OWNED BY public.dlq_jobs.id;


--
-- Name: drop_location_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drop_location_config (
    id integer NOT NULL,
    storage_type character varying(50) DEFAULT 's3'::character varying NOT NULL,
    region character varying(100),
    bucket character varying(255) NOT NULL,
    path_prefix character varying(500),
    access_key_id text,
    secret_access_key text,
    endpoint character varying(500),
    use_ssl boolean DEFAULT true,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    updated_by integer,
    provider character varying(50) DEFAULT 'aws'::character varying,
    project_id character varying(255),
    service_account_json text,
    gcp_bucket character varying(255),
    account_name character varying(255),
    account_key text,
    container_name character varying(255),
    azure_endpoint character varying(500)
);


--
-- Name: TABLE drop_location_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.drop_location_config IS 'Stores S3/cloud storage configuration for drop file uploads (single location allowed)';


--
-- Name: COLUMN drop_location_config.storage_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.drop_location_config.storage_type IS 'Storage provider type: s3, gcs, azure';


--
-- Name: COLUMN drop_location_config.path_prefix; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.drop_location_config.path_prefix IS 'Optional path prefix within bucket for drop files';


--
-- Name: COLUMN drop_location_config.access_key_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.drop_location_config.access_key_id IS 'Encrypted AWS access key or equivalent';


--
-- Name: COLUMN drop_location_config.secret_access_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.drop_location_config.secret_access_key IS 'Encrypted secret access key';


--
-- Name: drop_location_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.drop_location_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: drop_location_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.drop_location_config_id_seq OWNED BY public.drop_location_config.id;


--
-- Name: encrypted_passwords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encrypted_passwords (
    id integer NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id text NOT NULL,
    secret_ciphertext text NOT NULL,
    encryption_version character varying(20) DEFAULT 'v1'::character varying NOT NULL,
    iv text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    last_accessed_at timestamp with time zone,
    rotation_scheduled_at timestamp with time zone,
    auth_tag text
);


--
-- Name: TABLE encrypted_passwords; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.encrypted_passwords IS 'Stores AES-256-GCM encrypted passwords for password-protected archives with authentication';


--
-- Name: COLUMN encrypted_passwords.secret_ciphertext; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.encrypted_passwords.secret_ciphertext IS 'AES-256-GCM encrypted password (or legacy AES-256-CBC)';


--
-- Name: COLUMN encrypted_passwords.iv; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.encrypted_passwords.iv IS 'Initialization vector for encryption/decryption';


--
-- Name: COLUMN encrypted_passwords.auth_tag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.encrypted_passwords.auth_tag IS 'GCM authentication tag for data integrity (null for legacy CBC entries)';


--
-- Name: encrypted_passwords_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.encrypted_passwords_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: encrypted_passwords_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.encrypted_passwords_id_seq OWNED BY public.encrypted_passwords.id;


--
-- Name: execution_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.execution_audit (
    audit_id bigint NOT NULL,
    execution_id character varying(255) NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    execution_type character varying(50),
    entity_id character varying(255),
    entity_name character varying(255),
    previous_status character varying(50),
    new_status character varying(50),
    status_reason text,
    cpu_usage_percent numeric(5,2),
    memory_usage_mb integer,
    rows_processed bigint,
    records_affected bigint,
    quality_score numeric(5,2),
    validation_errors jsonb,
    triggered_by_user character varying(255),
    trigger_type character varying(50),
    parent_execution_id character varying(255),
    execution_duration_ms bigint,
    database_queries_count integer,
    network_requests_count integer,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: execution_audit_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.execution_audit_archive (
    audit_id bigint NOT NULL,
    execution_id character varying(255) NOT NULL,
    "timestamp" timestamp without time zone NOT NULL,
    execution_type character varying(50),
    entity_id character varying(255),
    entity_name character varying(255),
    previous_status character varying(50),
    new_status character varying(50),
    status_reason text,
    cpu_usage_percent numeric(5,2),
    memory_usage_mb integer,
    rows_processed bigint,
    records_affected bigint,
    quality_score numeric(5,2),
    validation_errors jsonb,
    triggered_by_user character varying(255),
    trigger_type character varying(50),
    parent_execution_id character varying(255),
    execution_duration_ms bigint,
    database_queries_count integer,
    network_requests_count integer,
    metadata jsonb,
    created_at timestamp without time zone,
    archived_at timestamp without time zone DEFAULT now()
);


--
-- Name: execution_audit_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.execution_audit_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: execution_audit_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.execution_audit_audit_id_seq OWNED BY public.execution_audit.audit_id;


--
-- Name: file_audit_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_audit_details (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    file_name character varying(500),
    file_schema_id character varying(255),
    file_hash character varying(255),
    file_pattern character varying(500),
    file_type character varying(100),
    file_delimiter character varying(10),
    encoding character varying(50),
    number_of_columns integer,
    source character varying(255),
    source_path text,
    no_of_records_in_source bigint,
    load_step_1 character varying(255),
    load_step_1_path text,
    load_step_1_rec_cnt bigint,
    load_type character varying(100),
    correlation_id character varying(255),
    parent_audit_id integer,
    user_id integer,
    user_email character varying(255),
    ip_address inet,
    session_id character varying(255),
    processing_duration_ms integer,
    status character varying(50) DEFAULT 'success'::character varying,
    error_message text,
    error_type character varying(100),
    retention_until timestamp without time zone,
    created_dt timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    transformation_job_id integer,
    file_size_bytes bigint,
    mapping_name character varying(500),
    file_role character varying(20) DEFAULT NULL::character varying
);


--
-- Name: file_audit_details_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_audit_details_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_audit_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_audit_details_id_seq OWNED BY public.file_audit_details.id;


--
-- Name: file_columns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_columns (
    id integer NOT NULL,
    file_id character varying(255),
    column_name character varying(255) NOT NULL,
    column_type character varying(50) NOT NULL,
    column_index integer NOT NULL,
    null_count integer,
    unique_count integer,
    min_value text,
    max_value text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    file_name character varying(255),
    most_frequent_value text,
    least_frequent_value text,
    min_value_decimal numeric(30,6),
    max_value_decimal numeric(30,6),
    top_values json,
    most_frequent_count integer,
    least_frequent_count integer,
    min_frequency integer,
    max_frequency integer,
    min_is_frequent boolean,
    max_is_frequent boolean,
    patterns jsonb,
    retention_until timestamp without time zone DEFAULT (now() + '1 year 6 mons'::interval),
    profile_timestamp timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    file_role character varying(20) DEFAULT 'adhoc'::character varying,
    null_percentage numeric(5,2),
    CONSTRAINT file_columns_file_role_check CHECK (((file_role)::text = ANY ((ARRAY['source'::character varying, 'target'::character varying, 'adhoc'::character varying])::text[])))
);


--
-- Name: file_columns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_columns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_columns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_columns_id_seq OWNED BY public.file_columns.id;


--
-- Name: file_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_errors (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    error_type character varying(100) NOT NULL,
    severity character varying(20) DEFAULT 'error'::character varying NOT NULL,
    row_number integer,
    column_name character varying(255),
    error_message text NOT NULL,
    error_details jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(20) DEFAULT 'new'::character varying,
    processing_action character varying(20),
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    record_snapshot jsonb
);


--
-- Name: TABLE file_errors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.file_errors IS 'Errors captured during file upload and processing';


--
-- Name: COLUMN file_errors.error_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.file_errors.error_type IS 'Category of error: parsing, encoding, schema, or data quality';


--
-- Name: file_errors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_errors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_errors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_errors_id_seq OWNED BY public.file_errors.id;


--
-- Name: file_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_history (
    id integer NOT NULL,
    file_id character varying(255),
    row_count integer,
    column_count integer,
    quality_score numeric(5,2),
    changed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    changes_detected jsonb
);


--
-- Name: file_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_history_id_seq OWNED BY public.file_history.id;


--
-- Name: file_lineage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_lineage (
    id integer NOT NULL,
    source_file_id character varying(255) NOT NULL,
    target_file_id character varying(255) NOT NULL,
    relationship_type character varying(50) NOT NULL,
    transformation_details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: file_lineage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_lineage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_lineage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_lineage_id_seq OWNED BY public.file_lineage.id;


--
-- Name: file_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_mappings (
    id integer NOT NULL,
    mapping_name character varying(255) NOT NULL,
    source_file_id character varying(255) NOT NULL,
    source_filename character varying(255),
    target_file_type character varying(50) DEFAULT 'csv'::character varying,
    mapping_rules json DEFAULT '{}'::json,
    mapping_config json DEFAULT '{}'::json,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: file_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_mappings_id_seq OWNED BY public.file_mappings.id;


--
-- Name: file_ownership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_ownership (
    ownership_id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    owner_user_id integer,
    owner_name character varying(255),
    owner_email character varying(255),
    owner_contact character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    sensitivity_level character varying(50) DEFAULT 'Public'::character varying,
    creator_user_id integer,
    creator_name character varying(255),
    creator_email character varying(255)
);


--
-- Name: file_ownership_ownership_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_ownership_ownership_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_ownership_ownership_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_ownership_ownership_id_seq OWNED BY public.file_ownership.ownership_id;


--
-- Name: file_pattern_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_pattern_metrics (
    id integer NOT NULL,
    file_pattern character varying(500) NOT NULL,
    metric_date date NOT NULL,
    record_count bigint DEFAULT 0,
    file_count integer DEFAULT 1,
    duplicate_count bigint DEFAULT 0,
    duplicate_percentage numeric(5,2) DEFAULT 0,
    null_counts jsonb DEFAULT '{}'::jsonb,
    null_percentages jsonb DEFAULT '{}'::jsonb,
    numeric_stats jsonb DEFAULT '{}'::jsonb,
    string_stats jsonb DEFAULT '{}'::jsonb,
    completeness_score numeric(5,2),
    consistency_score numeric(5,2),
    validity_score numeric(5,2),
    overall_quality_score numeric(5,2),
    has_alerts boolean DEFAULT false,
    alert_count integer DEFAULT 0,
    column_count integer,
    data_types jsonb DEFAULT '{}'::jsonb,
    retention_until timestamp without time zone DEFAULT (now() + '1 year 6 mons'::interval),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: file_pattern_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_pattern_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_pattern_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_pattern_metrics_id_seq OWNED BY public.file_pattern_metrics.id;


--
-- Name: file_pattern_metrics_monthly; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.file_pattern_metrics_monthly AS
 SELECT file_pattern,
    (date_trunc('month'::text, (metric_date)::timestamp with time zone))::date AS month_start,
    sum(record_count) AS total_records,
    sum(file_count) AS total_files,
    sum(duplicate_count) AS total_duplicates,
    avg(duplicate_percentage) AS avg_duplicate_percentage,
    jsonb_object_agg(to_char((metric_date)::timestamp with time zone, 'YYYY-MM-DD'::text), null_counts) FILTER (WHERE (null_counts IS NOT NULL)) AS daily_null_counts,
    jsonb_object_agg(to_char((metric_date)::timestamp with time zone, 'YYYY-MM-DD'::text), numeric_stats) FILTER (WHERE (numeric_stats IS NOT NULL)) AS daily_numeric_stats,
    avg(completeness_score) AS avg_completeness_score,
    avg(consistency_score) AS avg_consistency_score,
    avg(validity_score) AS avg_validity_score,
    avg(overall_quality_score) AS avg_overall_quality_score,
    bool_or(has_alerts) AS has_alerts,
    sum(alert_count) AS total_alerts,
    max(updated_at) AS last_updated
   FROM public.file_pattern_metrics
  GROUP BY file_pattern, (date_trunc('month'::text, (metric_date)::timestamp with time zone))
  WITH NO DATA;


--
-- Name: file_pattern_metrics_weekly; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.file_pattern_metrics_weekly AS
 SELECT file_pattern,
    (date_trunc('week'::text, (metric_date)::timestamp with time zone))::date AS week_start,
    sum(record_count) AS total_records,
    sum(file_count) AS total_files,
    sum(duplicate_count) AS total_duplicates,
    avg(duplicate_percentage) AS avg_duplicate_percentage,
    jsonb_object_agg((metric_date)::text, null_counts) FILTER (WHERE (null_counts IS NOT NULL)) AS daily_null_counts,
    jsonb_object_agg((metric_date)::text, numeric_stats) FILTER (WHERE (numeric_stats IS NOT NULL)) AS daily_numeric_stats,
    avg(completeness_score) AS avg_completeness_score,
    avg(consistency_score) AS avg_consistency_score,
    avg(validity_score) AS avg_validity_score,
    avg(overall_quality_score) AS avg_overall_quality_score,
    bool_or(has_alerts) AS has_alerts,
    sum(alert_count) AS total_alerts,
    max(updated_at) AS last_updated
   FROM public.file_pattern_metrics
  GROUP BY file_pattern, (date_trunc('week'::text, (metric_date)::timestamp with time zone))
  WITH NO DATA;


--
-- Name: file_policy_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_policy_assignments (
    assignment_id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    policy_id character varying(255) NOT NULL,
    assigned_by integer,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: file_policy_assignments_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_policy_assignments_assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_policy_assignments_assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_policy_assignments_assignment_id_seq OWNED BY public.file_policy_assignments.assignment_id;


--
-- Name: file_preview_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_preview_data (
    preview_id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    row_number integer NOT NULL,
    row_data jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: file_preview_data_preview_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_preview_data_preview_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_preview_data_preview_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_preview_data_preview_id_seq OWNED BY public.file_preview_data.preview_id;


--
-- Name: file_processing_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_processing_artifacts (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    artifact_type character varying(50) NOT NULL,
    storage_uri text NOT NULL,
    file_size_bytes bigint,
    checksum_sha256 character varying(64),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer
);


--
-- Name: TABLE file_processing_artifacts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.file_processing_artifacts IS 'Tracks standardized artifacts (CSV, Parquet, metadata JSON) generated from processed files';


--
-- Name: file_processing_artifacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_processing_artifacts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_processing_artifacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_processing_artifacts_id_seq OWNED BY public.file_processing_artifacts.id;


--
-- Name: file_quality_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_quality_checks (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    check_type character varying(50) NOT NULL,
    check_name character varying(100) NOT NULL,
    status character varying(20) NOT NULL,
    score numeric(5,2),
    details json,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: file_quality_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_quality_checks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_quality_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_quality_checks_id_seq OWNED BY public.file_quality_checks.id;


--
-- Name: file_quality_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_quality_rules (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    quality_rule_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    target_columns text[] DEFAULT ARRAY[]::text[]
);


--
-- Name: file_quality_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_quality_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_quality_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_quality_rules_id_seq OWNED BY public.file_quality_rules.id;


--
-- Name: file_restorations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_restorations (
    id integer NOT NULL,
    archived_file_id integer,
    file_id character varying(255) NOT NULL,
    restored_to_path character varying(1000),
    restoration_method character varying(50) DEFAULT 'full'::character varying,
    status character varying(50) DEFAULT 'pending'::character varying,
    error_message text,
    requested_by integer,
    requested_at timestamp without time zone DEFAULT now(),
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    restoration_reason text,
    restored_size_bytes bigint,
    verification_status character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: file_restorations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_restorations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_restorations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_restorations_id_seq OWNED BY public.file_restorations.id;


--
-- Name: file_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_schedules (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    frequency character varying(50) NOT NULL,
    "time" character varying(10),
    day integer,
    is_active boolean DEFAULT true,
    last_run timestamp without time zone,
    next_run timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by character varying(255),
    project_id integer NOT NULL,
    sub_project_id integer
);


--
-- Name: file_schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_schedules_id_seq OWNED BY public.file_schedules.id;


--
-- Name: file_schema_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_schema_details (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    file_name character varying(500),
    file_schema_id character varying(255) NOT NULL,
    file_schema jsonb NOT NULL,
    schema_hash character varying(255) NOT NULL,
    schema_diff jsonb,
    schema_update_ts timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    active_flag boolean DEFAULT true,
    correlation_id character varying(255),
    previous_schema_id character varying(255),
    created_ts timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer
);


--
-- Name: file_schema_details_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_schema_details_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_schema_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_schema_details_id_seq OWNED BY public.file_schema_details.id;


--
-- Name: file_schemas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_schemas (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    file_name character varying(500) NOT NULL,
    file_pattern character varying(500),
    schema_definition jsonb NOT NULL,
    schema_hash character varying(64) NOT NULL,
    row_count bigint,
    column_count integer,
    captured_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    logical_file_id character varying(255)
);


--
-- Name: file_schemas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_schemas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_schemas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_schemas_id_seq OWNED BY public.file_schemas.id;


--
-- Name: file_tag_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_tag_assignments (
    assignment_id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    tag_id character varying(255) NOT NULL,
    assigned_by integer,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: file_tag_assignments_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.file_tag_assignments_assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: file_tag_assignments_assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.file_tag_assignments_assignment_id_seq OWNED BY public.file_tag_assignments.assignment_id;


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    filename character varying(255) NOT NULL,
    file_type character varying(50) NOT NULL,
    file_size bigint NOT NULL,
    row_count integer,
    column_count integer,
    quality_score numeric(5,2),
    processed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    checksum character varying(255),
    metadata jsonb,
    duplicate_records_count integer DEFAULT 0,
    duplicate_records_percentage numeric(5,2) DEFAULT 0.00,
    schema_definition jsonb,
    processing_step character varying(50) DEFAULT 'pending'::character varying,
    project_id integer NOT NULL,
    processing_error text,
    is_vendor_file boolean DEFAULT false,
    correlation_id character varying(255),
    file_role character varying(50),
    logical_file_id character varying(255),
    sub_project_id integer,
    contains_pii boolean DEFAULT false,
    data_classification character varying(50),
    vendor_agreement_id integer,
    source_format character varying(50),
    format_metadata jsonb,
    is_archive boolean DEFAULT false,
    archive_format character varying(20),
    is_password_protected boolean DEFAULT false,
    member_count integer,
    parent_archive_id character varying(255),
    failure_reason_code public.file_failure_reason
);


--
-- Name: COLUMN files.sub_project_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.sub_project_id IS 'Links file to a sub-project (child project). User access cascades from parent project.';


--
-- Name: COLUMN files.source_format; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.source_format IS 'Original format before conversion (sas7bdat, xpt, avro, dat, etc.)';


--
-- Name: COLUMN files.format_metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.format_metadata IS 'Format-specific metadata (SAS labels, Avro schema, DAT layout specification)';


--
-- Name: COLUMN files.is_archive; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.is_archive IS 'TRUE if file is a ZIP/tar archive containing other files';


--
-- Name: COLUMN files.archive_format; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.archive_format IS 'Archive format: zip, tar, tar.gz, tar.bz2';


--
-- Name: COLUMN files.is_password_protected; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.is_password_protected IS 'TRUE if archive requires password for extraction';


--
-- Name: COLUMN files.member_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.member_count IS 'Number of files contained in archive';


--
-- Name: COLUMN files.parent_archive_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.parent_archive_id IS 'References parent archive if this file was extracted from an archive';


--
-- Name: COLUMN files.failure_reason_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.failure_reason_code IS 'Database-enforced failure reason code. Use processing_error column for human-readable actionable messages.';

--
CREATE TABLE public.fixed_width_schemas (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    schema_definition jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer
);


--
-- Name: fixed_width_schemas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fixed_width_schemas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fixed_width_schemas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fixed_width_schemas_id_seq OWNED BY public.fixed_width_schemas.id;


--
-- Name: frontend_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.frontend_audit_log (
    audit_id bigint NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    user_id character varying(255),
    user_email character varying(255),
    session_id character varying(255),
    event_type character varying(100) NOT NULL,
    event_category character varying(50),
    page_url character varying(500),
    page_title character varying(255),
    component_name character varying(255),
    action_type character varying(100),
    target_element character varying(255),
    element_text text,
    error_message text,
    error_stack text,
    error_component character varying(255),
    api_endpoint character varying(255),
    api_method character varying(10),
    api_status_code integer,
    api_error_message text,
    browser_info jsonb,
    screen_resolution character varying(50),
    viewport_size character varying(50),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: frontend_audit_log_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.frontend_audit_log_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: frontend_audit_log_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.frontend_audit_log_audit_id_seq OWNED BY public.frontend_audit_log.audit_id;


--
-- Name: governance_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_policies (
    policy_id character varying(255) NOT NULL,
    policy_name character varying(255) NOT NULL,
    description text,
    rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: governance_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_tags (
    tag_id character varying(255) NOT NULL,
    tag_name character varying(255) NOT NULL,
    description text,
    color character varying(50) DEFAULT '#3B82F6'::character varying,
    badge_style character varying(50) DEFAULT 'default'::character varying,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    permission_required character varying(255) DEFAULT NULL::character varying,
    requires_view_permission boolean DEFAULT false,
    requires_edit_permission boolean DEFAULT false,
    sensitivity_level character varying(50) DEFAULT 'public'::character varying
);


--
-- Name: COLUMN governance_tags.permission_required; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.governance_tags.permission_required IS 'Base permission name (e.g., pii, confidential) - system will check tag:permission:read and tag:permission:edit';


--
-- Name: COLUMN governance_tags.sensitivity_level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.governance_tags.sensitivity_level IS 'Sensitivity level: public (anyone), restricted (requires permission), private (admin only)';


--
-- Name: group_policy_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_policy_attachments (
    group_id integer NOT NULL,
    policy_id integer NOT NULL,
    attached_by integer,
    attached_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.groups_id_seq OWNED BY public.groups.id;


--
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_keys (
    id integer NOT NULL,
    key character varying(255) NOT NULL,
    resource_type character varying(100) NOT NULL,
    resource_id integer,
    response_status integer,
    response_body jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone NOT NULL,
    user_id integer
);


--
-- Name: idempotency_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.idempotency_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: idempotency_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.idempotency_keys_id_seq OWNED BY public.idempotency_keys.id;


--
-- Name: job_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_dependencies (
    dependency_id integer NOT NULL,
    job_id integer NOT NULL,
    depends_on_job_id integer NOT NULL,
    dependency_type character varying(50) DEFAULT 'completion'::character varying,
    wait_for_success boolean DEFAULT true,
    optional_dependency boolean DEFAULT false,
    timeout_minutes integer,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT no_self_dependency CHECK ((job_id <> depends_on_job_id))
);


--
-- Name: job_dependencies_dependency_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_dependencies_dependency_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_dependencies_dependency_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_dependencies_dependency_id_seq OWNED BY public.job_dependencies.dependency_id;


--
-- Name: job_group_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_group_dependencies (
    group_dependency_id integer NOT NULL,
    group_id uuid NOT NULL,
    depends_on_group_id uuid NOT NULL,
    dependency_type character varying(50) DEFAULT 'all_success'::character varying,
    wait_for_all_jobs boolean DEFAULT true,
    timeout_minutes integer,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT no_self_group_dependency CHECK ((group_id <> depends_on_group_id)),
    CONSTRAINT valid_dependency_type CHECK (((dependency_type)::text = ANY ((ARRAY['all_success'::character varying, 'any_success'::character varying, 'all_complete'::character varying])::text[])))
);


--
-- Name: job_group_dependencies_group_dependency_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_group_dependencies_group_dependency_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_group_dependencies_group_dependency_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_group_dependencies_group_dependency_id_seq OWNED BY public.job_group_dependencies.group_dependency_id;


--
-- Name: job_group_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_group_jobs (
    group_id uuid NOT NULL,
    job_id uuid NOT NULL,
    added_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: job_group_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_group_schedules (
    group_schedule_id integer NOT NULL,
    group_id uuid NOT NULL,
    schedule_name character varying(255) NOT NULL,
    schedule_type character varying(50) NOT NULL,
    cron_expression character varying(100),
    enabled boolean DEFAULT true,
    execution_order character varying(50) DEFAULT 'parallel'::character varying,
    max_concurrent_jobs integer DEFAULT 5,
    retry_policy jsonb DEFAULT '{"maxRetries": 3, "retryDelay": 300}'::jsonb,
    notification_settings jsonb,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    project_id integer NOT NULL,
    CONSTRAINT valid_execution_order CHECK (((execution_order)::text = ANY ((ARRAY['parallel'::character varying, 'sequential'::character varying, 'dependency-based'::character varying])::text[]))),
    CONSTRAINT valid_schedule_type CHECK (((schedule_type)::text = ANY ((ARRAY['cron'::character varying, 'interval'::character varying, 'manual'::character varying])::text[])))
);


--
-- Name: job_group_schedules_group_schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_group_schedules_group_schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_group_schedules_group_schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_group_schedules_group_schedule_id_seq OWNED BY public.job_group_schedules.group_schedule_id;


--
-- Name: job_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: job_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_history (
    id integer NOT NULL,
    job_id integer,
    status character varying(50) NOT NULL,
    start_time timestamp without time zone,
    end_time timestamp without time zone,
    records_processed integer,
    errors_count integer,
    logs text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: job_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_history_id_seq OWNED BY public.job_history.id;


--
-- Name: job_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_runs (
    id integer NOT NULL,
    job_id integer,
    status character varying(50) NOT NULL,
    start_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    end_time timestamp without time zone,
    records_processed integer,
    records_succeeded integer,
    records_failed integer,
    error_details jsonb,
    triggered_by integer,
    run_details jsonb
);


--
-- Name: job_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_runs_id_seq OWNED BY public.job_runs.id;


--
-- Name: job_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_schedules (
    id integer NOT NULL,
    job_id integer NOT NULL,
    type character varying(50) DEFAULT 'one-time'::character varying NOT NULL,
    one_time_date timestamp without time zone,
    cron_expression character varying(100),
    enabled boolean DEFAULT true,
    next_run_time timestamp without time zone,
    last_run_time timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    project_id integer NOT NULL
);


--
-- Name: job_schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_schedules_id_seq OWNED BY public.job_schedules.id;


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    business_process_id integer,
    status character varying(50) DEFAULT 'draft'::character varying,
    source_connection_id character varying(255),
    target_connection_id character varying(255),
    validation_settings jsonb,
    error_handling_settings jsonb,
    notification_settings jsonb,
    schedule_settings jsonb,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.jobs_id_seq OWNED BY public.jobs.id;


--
-- Name: lineage_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lineage_views (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    root_type character varying(50) NOT NULL,
    root_id integer NOT NULL,
    project_id integer,
    depth integer DEFAULT 3,
    include_incidents boolean DEFAULT true,
    layout_state jsonb,
    cached_graph jsonb,
    user_id integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: lineage_views_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lineage_views_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lineage_views_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lineage_views_id_seq OWNED BY public.lineage_views.id;


--
-- Name: logical_file_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logical_file_groups (
    id integer NOT NULL,
    logical_file_id character varying(255) NOT NULL,
    project_id integer,
    canonical_name character varying(500) NOT NULL,
    file_pattern character varying(500),
    pattern_metadata jsonb,
    first_upload_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_upload_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    upload_count integer DEFAULT 0,
    has_schema_changes boolean DEFAULT false,
    last_schema_change_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: logical_file_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.logical_file_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: logical_file_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.logical_file_groups_id_seq OWNED BY public.logical_file_groups.id;


--
-- Name: mapping_group_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mapping_group_executions (
    id integer NOT NULL,
    group_id integer NOT NULL,
    execution_id text NOT NULL,
    status text DEFAULT 'running'::text,
    total_mappings integer DEFAULT 0,
    completed_mappings integer DEFAULT 0,
    failed_mappings integer DEFAULT 0,
    start_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    end_time timestamp without time zone,
    duration_ms integer,
    triggered_by integer,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    project_id integer NOT NULL,
    CONSTRAINT mapping_group_executions_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: mapping_group_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mapping_group_executions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mapping_group_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mapping_group_executions_id_seq OWNED BY public.mapping_group_executions.id;


--
-- Name: mapping_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mapping_group_members (
    id integer NOT NULL,
    group_id integer NOT NULL,
    mapping_id character varying(255) NOT NULL,
    execution_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: mapping_group_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mapping_group_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mapping_group_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mapping_group_members_id_seq OWNED BY public.mapping_group_members.id;


--
-- Name: mapping_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mapping_groups (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    max_concurrency integer DEFAULT 10,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status text DEFAULT 'active'::text,
    project_id integer NOT NULL,
    sub_project_id integer
);


--
-- Name: mapping_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mapping_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mapping_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mapping_groups_id_seq OWNED BY public.mapping_groups.id;


--
-- Name: mapping_job_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mapping_job_errors (
    id integer NOT NULL,
    job_id character varying(255) NOT NULL,
    mapping_id character varying(255) NOT NULL,
    error_type character varying(100) NOT NULL,
    severity character varying(20) DEFAULT 'error'::character varying NOT NULL,
    row_number integer,
    column_name character varying(255),
    error_message text NOT NULL,
    error_details jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(20) DEFAULT 'new'::character varying,
    processing_action character varying(20),
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    record_snapshot jsonb
);


--
-- Name: TABLE mapping_job_errors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mapping_job_errors IS 'Errors captured during ETL mapping job execution';


--
-- Name: COLUMN mapping_job_errors.error_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mapping_job_errors.error_type IS 'Category of error: transformation, validation, output, or data quality';


--
-- Name: mapping_job_errors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mapping_job_errors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mapping_job_errors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mapping_job_errors_id_seq OWNED BY public.mapping_job_errors.id;


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    applied_at timestamp without time zone NOT NULL
);


--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: mv_file_processing_summary; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_file_processing_summary AS
 SELECT date_trunc('day'::text, created_at) AS day,
    file_type,
    count(*) AS file_count,
    COALESCE(sum(file_size), (0)::numeric) AS total_size_bytes,
    COALESCE(avg(file_size), (0)::numeric) AS avg_size_bytes,
    count(DISTINCT project_id) AS projects_count
   FROM public.files f
  WHERE (created_at > (now() - '30 days'::interval))
  GROUP BY (date_trunc('day'::text, created_at)), file_type
  ORDER BY (date_trunc('day'::text, created_at)) DESC
  WITH NO DATA;


--
-- Name: transformation_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transformation_jobs (
    id integer NOT NULL,
    job_id character varying(255) NOT NULL,
    mapping_id character varying(255),
    mapping_name character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    start_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    end_time timestamp without time zone,
    duration_ms bigint,
    files_processed integer DEFAULT 0,
    rows_read bigint DEFAULT 0,
    rows_written bigint DEFAULT 0,
    rows_failed bigint DEFAULT 0,
    error_message text,
    execution_metadata jsonb,
    triggered_by character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    executed_by integer,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    mapping_group_execution_id integer,
    schedule_id integer,
    workflow_execution_id integer,
    file_id character varying(255),
    project_id integer NOT NULL,
    correlation_id character varying(255),
    schema_validation character varying(10),
    failure_reason_code public.job_failure_reason,
    visual_workflow_execution_id integer,
    CONSTRAINT transformation_jobs_schema_validation_check CHECK (((schema_validation)::text = ANY ((ARRAY['Pass'::character varying, 'Fail'::character varying, NULL::character varying])::text[])))
);


--
-- Name: COLUMN transformation_jobs.failure_reason_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transformation_jobs.failure_reason_code IS 'Database-enforced failure reason code for ETL jobs. Use error_message column for human-readable actionable messages.';


--
-- Name: mv_job_trends_hourly; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_job_trends_hourly AS
 SELECT date_trunc('hour'::text, created_at) AS hour,
    status,
    count(*) AS job_count,
    COALESCE(sum(rows_read), (0)::numeric) AS records_processed,
    COALESCE(sum(rows_failed), (0)::numeric) AS records_failed
   FROM public.transformation_jobs
  WHERE (created_at > (now() - '7 days'::interval))
  GROUP BY (date_trunc('hour'::text, created_at)), status
  ORDER BY (date_trunc('hour'::text, created_at)) DESC
  WITH NO DATA;


--
-- Name: n_step_workflow_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.n_step_workflow_assets (
    id integer NOT NULL,
    step_id integer,
    asset_type character varying(20) NOT NULL,
    asset_id character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT n_step_workflow_assets_asset_type_check CHECK (((asset_type)::text = ANY ((ARRAY['mapping'::character varying, 'mapping_group'::character varying])::text[])))
);


--
-- Name: n_step_workflow_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.n_step_workflow_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: n_step_workflow_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.n_step_workflow_assets_id_seq OWNED BY public.n_step_workflow_assets.id;


--
-- Name: n_step_workflow_run_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.n_step_workflow_run_steps (
    id integer NOT NULL,
    run_id integer,
    step_index integer NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    start_time timestamp without time zone,
    end_time timestamp without time zone,
    duration_ms bigint,
    jobs_count integer DEFAULT 0,
    jobs_completed integer DEFAULT 0,
    jobs_failed integer DEFAULT 0,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: n_step_workflow_run_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.n_step_workflow_run_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: n_step_workflow_run_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.n_step_workflow_run_steps_id_seq OWNED BY public.n_step_workflow_run_steps.id;


--
-- Name: n_step_workflow_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.n_step_workflow_runs (
    id integer NOT NULL,
    workflow_id integer,
    run_id character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'running'::character varying,
    triggered_by integer,
    start_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    end_time timestamp without time zone,
    duration_ms bigint,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: n_step_workflow_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.n_step_workflow_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: n_step_workflow_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.n_step_workflow_runs_id_seq OWNED BY public.n_step_workflow_runs.id;


--
-- Name: n_step_workflow_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.n_step_workflow_steps (
    id integer NOT NULL,
    workflow_id integer,
    step_index integer NOT NULL,
    is_active boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: n_step_workflow_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.n_step_workflow_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: n_step_workflow_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.n_step_workflow_steps_id_seq OWNED BY public.n_step_workflow_steps.id;


--
-- Name: n_step_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.n_step_workflows (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    project_id integer,
    sub_project_id integer
);


--
-- Name: n_step_workflows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.n_step_workflows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: n_step_workflows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.n_step_workflows_id_seq OWNED BY public.n_step_workflows.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    notification_type character varying(100) NOT NULL,
    title character varying(500) NOT NULL,
    message text NOT NULL,
    entity_type character varying(100),
    entity_id integer,
    action_url character varying(1000),
    is_read boolean DEFAULT false,
    read_at timestamp without time zone,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: password_reset_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_requests (
    id integer NOT NULL,
    user_id integer,
    requested_at timestamp without time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    approved_by integer,
    approved_at timestamp without time zone,
    denied_at timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT password_reset_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'denied'::character varying])::text[])))
);


--
-- Name: password_reset_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_reset_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_reset_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_reset_requests_id_seq OWNED BY public.password_reset_requests.id;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    resource character varying(100) NOT NULL,
    action character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.permissions_id_seq OWNED BY public.permissions.id;


--
-- Name: policy_evaluation_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_evaluation_cache (
    cache_key character varying(512) NOT NULL,
    user_id integer NOT NULL,
    action character varying(255) NOT NULL,
    resource_type character varying(50),
    resource_id character varying(255),
    decision character varying(20) NOT NULL,
    evaluated_policies jsonb,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT valid_decision CHECK (((decision)::text = ANY ((ARRAY['ALLOW'::character varying, 'DENY'::character varying, 'IMPLICIT_DENY'::character varying])::text[])))
);


--
-- Name: processing_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processing_events (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    job_id character varying(100),
    event_type character varying(50) NOT NULL,
    event_stage character varying(50),
    event_message text NOT NULL,
    progress_percentage integer,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT processing_events_progress_percentage_check CHECK (((progress_percentage >= 0) AND (progress_percentage <= 100)))
);


--
-- Name: TABLE processing_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.processing_events IS 'Detailed event log for file processing with progress tracking and error messages';


--
-- Name: processing_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.processing_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: processing_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.processing_events_id_seq OWNED BY public.processing_events.id;


--
-- Name: profiling_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiling_metrics (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    file_name character varying(500) NOT NULL,
    mapping_id character varying(255),
    row_count bigint,
    column_count integer,
    numeric_sum jsonb,
    null_counts jsonb,
    data_types jsonb,
    value_distributions jsonb,
    completeness_score numeric(5,2),
    consistency_score numeric(5,2),
    validity_score numeric(5,2),
    overall_quality_score numeric(5,2),
    profiled_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    job_id character varying(255),
    retention_until timestamp without time zone DEFAULT (now() + '1 year 6 mons'::interval),
    profile_timestamp timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    file_role character varying(20) DEFAULT 'adhoc'::character varying,
    CONSTRAINT profiling_metrics_file_role_check CHECK (((file_role)::text = ANY ((ARRAY['source'::character varying, 'target'::character varying, 'adhoc'::character varying])::text[])))
);


--
-- Name: profiling_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profiling_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profiling_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profiling_metrics_id_seq OWNED BY public.profiling_metrics.id;


--
-- Name: project_access_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_access_groups (
    project_id integer NOT NULL,
    group_id integer NOT NULL,
    added_by integer,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: project_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_members (
    project_id integer NOT NULL,
    user_id integer NOT NULL,
    can_invite boolean DEFAULT false,
    can_manage_members boolean DEFAULT false,
    invited_by integer,
    invitation_accepted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    owner_id integer,
    parent_id integer,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    project_type character varying(20) DEFAULT 'internal'::character varying,
    drop_location_bucket character varying(255),
    drop_location_prefix character varying(500),
    drop_location_connection_id character varying(100),
    CONSTRAINT check_not_self_parent CHECK ((id <> parent_id)),
    CONSTRAINT projects_project_type_check CHECK (((project_type)::text = ANY ((ARRAY['internal'::character varying, 'external'::character varying])::text[])))
);


--
-- Name: COLUMN projects.is_archived; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.projects.is_archived IS 'Whether the project is archived (soft deleted)';


--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: quality_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quality_reports (
    report_id character varying(255) NOT NULL,
    file_id character varying(255) NOT NULL,
    filename character varying(255) NOT NULL,
    quality_score numeric(5,2),
    rules_evaluated integer DEFAULT 0,
    rules_passed integer DEFAULT 0,
    anomalies_detected integer DEFAULT 0,
    report_data jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: quality_rule_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quality_rule_configurations (
    id integer NOT NULL,
    file_id character varying(255),
    rule_id integer,
    error_action character varying(20) DEFAULT 'log_continue'::character varying NOT NULL,
    apply_to character varying(20) DEFAULT 'both'::character varying NOT NULL,
    enabled boolean DEFAULT true,
    created_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE quality_rule_configurations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.quality_rule_configurations IS 'Defines error handling strategies (log_continue vs log_abort) for quality rules per file';


--
-- Name: COLUMN quality_rule_configurations.error_action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quality_rule_configurations.error_action IS 'Action to take on error: log_continue or log_abort';


--
-- Name: COLUMN quality_rule_configurations.apply_to; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quality_rule_configurations.apply_to IS 'Where to apply: file_upload, etl_job, or both';


--
-- Name: quality_rule_configurations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quality_rule_configurations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quality_rule_configurations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quality_rule_configurations_id_seq OWNED BY public.quality_rule_configurations.id;


--
-- Name: quality_rule_violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quality_rule_violations (
    id integer NOT NULL,
    rule_id integer NOT NULL,
    file_id character varying(255),
    job_id character varying(255),
    row_number integer,
    column_name character varying(255),
    expected_value text,
    actual_value text,
    violation_details jsonb,
    severity character varying(20) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    primary_key_value text,
    primary_key_column text,
    status character varying(20) DEFAULT 'new'::character varying,
    processing_action character varying(20),
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    resolved_by integer,
    resolved_at timestamp with time zone,
    resolution_notes text,
    record_snapshot jsonb,
    CONSTRAINT chk_file_or_job CHECK ((((file_id IS NOT NULL) AND (job_id IS NULL)) OR ((file_id IS NULL) AND (job_id IS NOT NULL))))
);


--
-- Name: TABLE quality_rule_violations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.quality_rule_violations IS 'Violations of quality rules during file uploads and ETL executions';


--
-- Name: CONSTRAINT chk_file_or_job ON quality_rule_violations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT chk_file_or_job ON public.quality_rule_violations IS 'Violation must be associated with either a file or a job, not both';


--
-- Name: quality_rule_violations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quality_rule_violations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quality_rule_violations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quality_rule_violations_id_seq OWNED BY public.quality_rule_violations.id;


--
-- Name: quality_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quality_rules (
    id integer NOT NULL,
    rule_name character varying(255) NOT NULL,
    rule_type character varying(50) NOT NULL,
    description text,
    column_name character varying(255),
    rule_config jsonb NOT NULL,
    severity character varying(20) DEFAULT 'warning'::character varying NOT NULL,
    enabled boolean DEFAULT true,
    project_id integer,
    created_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    sub_project_id integer
);


--
-- Name: TABLE quality_rules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.quality_rules IS 'Data quality rule definitions for validating files and ETL mappings';


--
-- Name: COLUMN quality_rules.rule_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quality_rules.rule_type IS 'Type of quality check: completeness, validity, consistency, uniqueness, freshness';


--
-- Name: COLUMN quality_rules.rule_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quality_rules.rule_config IS 'JSON configuration specific to the rule type (thresholds, patterns, etc.)';


--
-- Name: quality_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quality_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quality_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quality_rules_id_seq OWNED BY public.quality_rules.id;


--
-- Name: rbac_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rbac_policies (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    policy_type character varying(50) NOT NULL,
    project_id integer,
    is_global boolean DEFAULT false,
    policy_document jsonb NOT NULL,
    created_by integer,
    is_active boolean DEFAULT true,
    version integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT policy_document_not_empty CHECK ((jsonb_typeof(policy_document) = 'object'::text)),
    CONSTRAINT valid_policy_type CHECK (((policy_type)::text = ANY ((ARRAY['IDENTITY'::character varying, 'RESOURCE'::character varying])::text[])))
);


--
-- Name: rbac_policies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rbac_policies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rbac_policies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rbac_policies_id_seq OWNED BY public.rbac_policies.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    token character varying(255) NOT NULL,
    user_agent text,
    ip_address character varying(45),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone NOT NULL,
    is_revoked boolean DEFAULT false,
    revoked_at timestamp without time zone
);


--
-- Name: resource_attributes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_attributes (
    id integer NOT NULL,
    resource_type character varying(50) NOT NULL,
    resource_id character varying(255) NOT NULL,
    attribute_key character varying(100) NOT NULL,
    attribute_value text NOT NULL,
    attribute_type character varying(50) DEFAULT 'STRING'::character varying,
    created_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: resource_attributes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.resource_attributes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: resource_attributes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.resource_attributes_id_seq OWNED BY public.resource_attributes.id;


--
-- Name: resource_policy_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_policy_attachments (
    resource_type character varying(50) NOT NULL,
    resource_id character varying(255) NOT NULL,
    policy_id integer NOT NULL,
    attached_by integer,
    attached_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: retention_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retention_policies (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    enabled boolean DEFAULT true,
    retention_days integer,
    min_quality_score numeric(5,2),
    max_file_size_mb integer,
    file_types character varying(255)[],
    tags character varying(255)[],
    access_pattern character varying(50),
    custom_condition text,
    archive_storage_type character varying(50) NOT NULL,
    archive_connection_id uuid,
    archive_path_prefix character varying(500),
    priority integer DEFAULT 50,
    last_run_at timestamp without time zone,
    next_run_at timestamp without time zone,
    run_frequency character varying(50) DEFAULT 'daily'::character varying,
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_by integer,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: retention_policies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retention_policies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retention_policies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retention_policies_id_seq OWNED BY public.retention_policies.id;


--
-- Name: retention_policy_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retention_policy_runs (
    id integer NOT NULL,
    policy_id integer,
    started_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone,
    status character varying(50) DEFAULT 'running'::character varying,
    error_message text,
    files_evaluated integer DEFAULT 0,
    files_archived integer DEFAULT 0,
    files_skipped integer DEFAULT 0,
    total_bytes_archived bigint DEFAULT 0,
    triggered_by character varying(50) DEFAULT 'scheduler'::character varying,
    executed_by integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: retention_policy_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retention_policy_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retention_policy_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retention_policy_runs_id_seq OWNED BY public.retention_policy_runs.id;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id integer NOT NULL,
    permission_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    permissions text[] DEFAULT '{}'::text[],
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedules (
    id integer NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    schedule_name text,
    schedule_type text NOT NULL,
    cron_expression text,
    interval_value integer,
    interval_unit text,
    timezone text DEFAULT 'UTC'::text,
    is_active boolean DEFAULT true,
    last_run timestamp without time zone,
    next_run timestamp without time zone,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    project_id integer,
    sub_project_id integer,
    CONSTRAINT schedules_entity_type_check CHECK ((entity_type = ANY (ARRAY['mapping'::text, 'mapping_group'::text, 'workflow'::text, 'vendor_agreement_expiration'::text]))),
    CONSTRAINT schedules_interval_unit_check CHECK ((interval_unit = ANY (ARRAY['minute'::text, 'hour'::text, 'day'::text, 'week'::text, 'month'::text, 'year'::text]))),
    CONSTRAINT schedules_schedule_type_check CHECK ((schedule_type = ANY (ARRAY['cron'::text, 'interval'::text]))),
    CONSTRAINT valid_cron CHECK ((((schedule_type = 'cron'::text) AND (cron_expression IS NOT NULL)) OR ((schedule_type = 'interval'::text) AND (interval_value IS NOT NULL) AND (interval_unit IS NOT NULL))))
);


--
-- Name: schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schedules_id_seq OWNED BY public.schedules.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    id integer NOT NULL,
    migration_name character varying(255) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    success boolean DEFAULT true,
    error_message text
);


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schema_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schema_migrations_id_seq OWNED BY public.schema_migrations.id;


--
-- Name: schema_validation_job_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_validation_job_files (
    id integer NOT NULL,
    job_id integer,
    file_path text NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    validation_result jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    dq_violation_count integer DEFAULT 0,
    dq_rules_executed integer DEFAULT 0,
    dq_rules_passed integer DEFAULT 0,
    dq_status character varying(20) DEFAULT NULL::character varying
);


--
-- Name: COLUMN schema_validation_job_files.dq_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.schema_validation_job_files.dq_status IS 'DQ validation status: passed, failed, skipped, error';


--
-- Name: schema_validation_job_files_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schema_validation_job_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schema_validation_job_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schema_validation_job_files_id_seq OWNED BY public.schema_validation_job_files.id;


--
-- Name: schema_validation_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_validation_jobs (
    id integer NOT NULL,
    job_name character varying(255) NOT NULL,
    project_id integer,
    connection_id character varying(255),
    vendor_agreement_id integer,
    s3_path text,
    file_pattern character varying(255) DEFAULT '*'::character varying,
    recursive boolean DEFAULT false,
    execution_type character varying(50) DEFAULT 'manual'::character varying,
    schedule_type character varying(50),
    cron_expression character varying(100),
    schedule_start_date timestamp with time zone,
    next_run_at timestamp with time zone,
    is_active boolean DEFAULT true,
    status character varying(50) DEFAULT 'pending'::character varying,
    total_files integer DEFAULT 0,
    processed_count integer DEFAULT 0,
    valid_count integer DEFAULT 0,
    invalid_count integer DEFAULT 0,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    report_path text,
    error_message text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    error_count integer DEFAULT 0,
    dq_violation_count integer DEFAULT 0,
    dq_rules_executed integer DEFAULT 0,
    dq_rules_passed integer DEFAULT 0,
    dq_enabled boolean DEFAULT true
);


--
-- Name: schema_validation_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schema_validation_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schema_validation_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schema_validation_jobs_id_seq OWNED BY public.schema_validation_jobs.id;


--
-- Name: scim_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scim_configurations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    base_url character varying(255),
    bearer_token character varying(512),
    idp_type character varying(50) NOT NULL,
    idp_scim_url character varying(255),
    sync_users boolean DEFAULT true,
    sync_groups boolean DEFAULT true,
    sync_interval_minutes integer DEFAULT 60,
    last_sync_at timestamp without time zone,
    user_attribute_mapping jsonb DEFAULT '{}'::jsonb,
    group_attribute_mapping jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: scim_configurations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scim_configurations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scim_configurations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scim_configurations_id_seq OWNED BY public.scim_configurations.id;


--
-- Name: scim_resource_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scim_resource_mappings (
    id integer NOT NULL,
    config_id integer,
    scim_id character varying(255) NOT NULL,
    scim_resource_type character varying(50) NOT NULL,
    platform_resource_type character varying(50) NOT NULL,
    platform_resource_id integer NOT NULL,
    last_synced_at timestamp without time zone,
    sync_hash character varying(64),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: scim_resource_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scim_resource_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scim_resource_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scim_resource_mappings_id_seq OWNED BY public.scim_resource_mappings.id;


--
-- Name: scim_sync_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scim_sync_logs (
    id integer NOT NULL,
    config_id integer,
    sync_type character varying(50) NOT NULL,
    sync_direction character varying(20) DEFAULT 'INBOUND'::character varying,
    status character varying(50) NOT NULL,
    items_processed integer DEFAULT 0,
    items_created integer DEFAULT 0,
    items_updated integer DEFAULT 0,
    items_deleted integer DEFAULT 0,
    items_failed integer DEFAULT 0,
    error_message text,
    error_details jsonb,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone,
    duration_ms integer
);


--
-- Name: scim_sync_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scim_sync_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scim_sync_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scim_sync_logs_id_seq OWNED BY public.scim_sync_logs.id;


--
-- Name: security_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_audit_log (
    security_audit_id bigint NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    event_type character varying(100),
    severity character varying(20),
    user_id character varying(255),
    username character varying(255),
    ip_address inet,
    user_agent text,
    location jsonb,
    authentication_method character varying(50),
    permission_required character varying(100),
    permission_granted boolean,
    denial_reason text,
    risk_score integer,
    flags jsonb,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: security_audit_log_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_audit_log_archive (
    security_audit_id bigint NOT NULL,
    "timestamp" timestamp without time zone NOT NULL,
    event_type character varying(100),
    severity character varying(20),
    user_id character varying(255),
    username character varying(255),
    ip_address inet,
    user_agent text,
    location jsonb,
    authentication_method character varying(50),
    permission_required character varying(100),
    permission_granted boolean,
    denial_reason text,
    risk_score integer,
    flags jsonb,
    metadata jsonb,
    created_at timestamp without time zone,
    archived_at timestamp without time zone DEFAULT now()
);


--
-- Name: security_audit_log_security_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.security_audit_log_security_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: security_audit_log_security_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.security_audit_log_security_audit_id_seq OWNED BY public.security_audit_log.security_audit_id;


--
-- Name: storage_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_connections (
    connection_id character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    config jsonb NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    connection_direction character varying(20) DEFAULT 'source'::character varying,
    project_id integer,
    connection_user character varying(20) DEFAULT 'Internal'::character varying,
    description text,
    authentication_method character varying(50) DEFAULT 'key-based'::character varying,
    auth_config jsonb DEFAULT '{}'::jsonb,
    path text,
    is_deleted boolean DEFAULT false,
    deleted_at timestamp without time zone,
    deleted_by integer,
    CONSTRAINT storage_connections_authentication_method_check CHECK (((authentication_method)::text = ANY ((ARRAY['key-based'::character varying, 'aws-iam-role'::character varying, 'gcp-sa-oidc'::character varying, 'azure-managed-identity'::character varying, 'db-short-lived-token'::character varying, 'oauth2'::character varying, 'kerberos'::character varying])::text[]))),
    CONSTRAINT storage_connections_connection_user_check CHECK (((connection_user)::text = ANY ((ARRAY['Internal'::character varying, 'External'::character varying])::text[])))
);


--
-- Name: sub_project_access_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sub_project_access_groups (
    id integer NOT NULL,
    sub_project_id integer NOT NULL,
    group_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: sub_project_access_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sub_project_access_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sub_project_access_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sub_project_access_groups_id_seq OWNED BY public.sub_project_access_groups.id;


--
-- Name: sub_project_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sub_project_members (
    id integer NOT NULL,
    sub_project_id integer NOT NULL,
    user_id integer NOT NULL,
    role character varying(50) DEFAULT 'member'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: sub_project_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sub_project_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sub_project_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sub_project_members_id_seq OWNED BY public.sub_project_members.id;


--
-- Name: tag_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tag_permissions (
    id integer NOT NULL,
    tag_id character varying(255) NOT NULL,
    role_id integer NOT NULL,
    can_view boolean DEFAULT false,
    can_edit boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tag_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tag_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tag_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tag_permissions_id_seq OWNED BY public.tag_permissions.id;


--
-- Name: transform_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transform_connections (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    type character varying(50) NOT NULL,
    config jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    last_used_at timestamp without time zone,
    description text,
    shared boolean DEFAULT true,
    source_application character varying(50) DEFAULT 'data_observatory'::character varying,
    project_id integer NOT NULL
);


--
-- Name: transform_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transform_connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transform_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transform_connections_id_seq OWNED BY public.transform_connections.id;


--
-- Name: transformation_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transformation_executions (
    id integer NOT NULL,
    execution_id text NOT NULL,
    transformation_id text NOT NULL,
    status text NOT NULL,
    started_at timestamp without time zone NOT NULL,
    completed_at timestamp without time zone,
    parameters jsonb DEFAULT '{}'::jsonb,
    result jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: transformation_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transformation_executions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transformation_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transformation_executions_id_seq OWNED BY public.transformation_executions.id;


--
-- Name: transformation_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transformation_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transformation_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transformation_jobs_id_seq OWNED BY public.transformation_jobs.id;


--
-- Name: transformation_lineage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transformation_lineage (
    id integer NOT NULL,
    transformation_id text NOT NULL,
    input_file_id text NOT NULL,
    output_file_id text NOT NULL,
    execution_id text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    mapping_id text,
    schema_fingerprint text,
    lineage_type character varying(20) DEFAULT 'file-specific'::character varying,
    source_schema jsonb,
    target_schema jsonb,
    column_mappings jsonb DEFAULT '[]'::jsonb,
    source_owner text,
    target_owner text,
    source_path text,
    target_path text,
    source_agreement_name text
);


--
-- Name: COLUMN transformation_lineage.column_mappings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transformation_lineage.column_mappings IS 'Column-level transformation mappings including PII tag propagation. Structure: [{"source_column": "email", "target_column": "customer_email", "contains_pii": true, "pii_type": "contact", "transformation_applied": "lowercase"}]';


--
-- Name: COLUMN transformation_lineage.source_owner; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transformation_lineage.source_owner IS 'Owner of the source file - from vendor agreement primary contact (if vendor source) or from mapping source config (if regular connection)';


--
-- Name: COLUMN transformation_lineage.target_owner; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transformation_lineage.target_owner IS 'Owner of the target file - from mapping target configuration';


--
-- Name: COLUMN transformation_lineage.source_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transformation_lineage.source_path IS 'Path to source file - vendor drop location (if vendor source) or connection path (if regular connection)';


--
-- Name: COLUMN transformation_lineage.target_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transformation_lineage.target_path IS 'Path to target file - from mapping target configuration';


--
-- Name: COLUMN transformation_lineage.source_agreement_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transformation_lineage.source_agreement_name IS 'Vendor agreement name - only populated if source is from vendor agreement';


--
-- Name: transformation_lineage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transformation_lineage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transformation_lineage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transformation_lineage_id_seq OWNED BY public.transformation_lineage.id;


--
-- Name: transformation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transformation_logs (
    id integer NOT NULL,
    job_id character varying(255) NOT NULL,
    log_level character varying(20) NOT NULL,
    message text NOT NULL,
    log_details jsonb,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: transformation_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transformation_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transformation_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transformation_logs_id_seq OWNED BY public.transformation_logs.id;


--
-- Name: transformation_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transformation_mappings (
    id integer NOT NULL,
    mapping_id character varying(255) NOT NULL,
    mapping_name character varying(255) NOT NULL,
    description text,
    source_connection_id character varying(255),
    source_file_pattern character varying(500) NOT NULL,
    source_schema jsonb,
    field_mappings jsonb DEFAULT '[]'::jsonb NOT NULL,
    target_connection_id character varying(255),
    target_table_name character varying(255),
    target_schema jsonb,
    created_by integer,
    status character varying(50) DEFAULT 'draft'::character varying,
    enabled boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_executed_at timestamp without time zone,
    anomaly_rules jsonb,
    source_type character varying(50) DEFAULT 'files'::character varying,
    file_path text DEFAULT ''::text,
    file_name_pattern text,
    target_file_name character varying(500),
    target_file_format character varying(50) DEFAULT 'csv'::character varying,
    variables jsonb DEFAULT '[]'::jsonb,
    project_id integer NOT NULL,
    target_file_path character varying(1000),
    vendor_agreement_id integer,
    schema_drift_handling character varying(20) DEFAULT 'none'::character varying,
    sub_project_id integer,
    source_owner character varying(255),
    target_owner character varying(255),
    vendor_agreement_file_schema_id integer,
    pii_columns jsonb DEFAULT '[]'::jsonb,
    violation_handling character varying(50) DEFAULT 'log_continue'::character varying,
    rdm_lookup_enabled boolean DEFAULT false,
    rdm_dataset_config jsonb,
    rdm_crosswalk_config jsonb,
    is_visual_mapping boolean DEFAULT false,
    visual_mapping_id integer,
    is_temporary boolean DEFAULT false,
    source_catalog jsonb DEFAULT '[]'::jsonb,
    join_specs jsonb DEFAULT '[]'::jsonb,
    has_multi_source_join boolean DEFAULT false,
    primary_source_node_id character varying(255),
    CONSTRAINT transformation_mappings_schema_drift_handling_check CHECK (((schema_drift_handling)::text = ANY ((ARRAY['abort'::character varying, 'alert'::character varying, 'none'::character varying])::text[]))),
    CONSTRAINT transformation_mappings_source_exclusivity CHECK ((((source_connection_id IS NOT NULL) AND (vendor_agreement_id IS NULL)) OR ((source_connection_id IS NULL) AND (vendor_agreement_id IS NOT NULL))))
);


--
-- Name: transformation_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transformation_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transformation_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transformation_mappings_id_seq OWNED BY public.transformation_mappings.id;


--
-- Name: transformation_outputs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transformation_outputs (
    id integer NOT NULL,
    execution_id text NOT NULL,
    file_id text NOT NULL,
    file_path text NOT NULL,
    file_size bigint,
    row_count integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: transformation_outputs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transformation_outputs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transformation_outputs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transformation_outputs_id_seq OWNED BY public.transformation_outputs.id;


--
-- Name: transformation_quality_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transformation_quality_rules (
    id integer NOT NULL,
    mapping_id character varying(255) NOT NULL,
    quality_rule_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: transformation_quality_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transformation_quality_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transformation_quality_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transformation_quality_rules_id_seq OWNED BY public.transformation_quality_rules.id;


--
-- Name: transformations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transformations (
    id integer NOT NULL,
    transformation_id text NOT NULL,
    name text NOT NULL,
    description text,
    type text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    input_files jsonb DEFAULT '[]'::jsonb,
    output_format text DEFAULT 'csv'::text,
    enabled boolean DEFAULT true,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    task_id character varying(255),
    progress integer DEFAULT 0,
    error text,
    result jsonb
);


--
-- Name: transformations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transformations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transformations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transformations_id_seq OWNED BY public.transformations.id;


--
-- Name: upload_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_batches (
    id integer NOT NULL,
    batch_id character varying(100) NOT NULL,
    user_id integer,
    api_token_id integer,
    project_id integer,
    target_type character varying(50) NOT NULL,
    target_id integer,
    status character varying(50) DEFAULT 'pending'::character varying,
    total_files integer DEFAULT 0,
    completed_files integer DEFAULT 0,
    failed_files integer DEFAULT 0,
    total_records bigint DEFAULT 0,
    processed_records bigint DEFAULT 0,
    failed_records bigint DEFAULT 0,
    total_size_bytes bigint DEFAULT 0,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: upload_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.upload_batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: upload_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.upload_batches_id_seq OWNED BY public.upload_batches.id;


--
-- Name: upload_file_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_file_records (
    id integer NOT NULL,
    upload_file_id integer,
    record_number bigint NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    error_message text,
    error_code character varying(100),
    row_data jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: upload_file_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.upload_file_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: upload_file_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.upload_file_records_id_seq OWNED BY public.upload_file_records.id;


--
-- Name: upload_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_files (
    id integer NOT NULL,
    file_id character varying(100) NOT NULL,
    batch_id integer,
    original_filename character varying(500) NOT NULL,
    normalized_filename character varying(500),
    file_type character varying(50),
    file_size_bytes bigint,
    mime_type character varying(100),
    target_type character varying(50),
    target_id integer,
    status character varying(50) DEFAULT 'pending'::character varying,
    phase character varying(100) DEFAULT 'uploaded'::character varying,
    total_records bigint DEFAULT 0,
    processed_records bigint DEFAULT 0,
    failed_records bigint DEFAULT 0,
    virus_scan_status character varying(50),
    virus_scan_result character varying(255),
    cloud_storage_path character varying(1000),
    cloud_storage_url text,
    catalog_file_id character varying(255),
    etl_job_id character varying(100),
    error_message text,
    error_details jsonb,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    uploaded_at timestamp without time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: upload_files_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.upload_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: upload_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.upload_files_id_seq OWNED BY public.upload_files.id;


--
-- Name: user_attributes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_attributes (
    id integer NOT NULL,
    user_id integer,
    attribute_key character varying(100) NOT NULL,
    attribute_value text NOT NULL,
    attribute_type character varying(50) DEFAULT 'STRING'::character varying,
    source character varying(50) DEFAULT 'MANUAL'::character varying,
    created_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: user_attributes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_attributes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_attributes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_attributes_id_seq OWNED BY public.user_attributes.id;


--
-- Name: user_badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_badges (
    id integer NOT NULL,
    badge_id character varying(50) NOT NULL,
    score numeric,
    file_id character varying(50),
    earned_date timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: user_badges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_badges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_badges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_badges_id_seq OWNED BY public.user_badges.id;


--
-- Name: user_dashboard_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_dashboard_settings (
    id integer NOT NULL,
    user_id character varying(50) DEFAULT 'default'::character varying,
    settings json NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_dashboard_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_dashboard_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_dashboard_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_dashboard_settings_id_seq OWNED BY public.user_dashboard_settings.id;


--
-- Name: user_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_groups (
    user_id integer NOT NULL,
    group_id integer NOT NULL
);


--
-- Name: user_job_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_job_groups (
    user_id uuid NOT NULL,
    group_id uuid NOT NULL
);


--
-- Name: user_policy_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_policy_attachments (
    user_id integer NOT NULL,
    policy_id integer NOT NULL,
    attached_by integer,
    attached_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id integer NOT NULL,
    role_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token character varying(1000) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_sessions_id_seq OWNED BY public.user_sessions.id;


--
-- Name: user_uuid_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_uuid_mapping (
    user_id integer NOT NULL,
    uuid uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(255) NOT NULL,
    password character varying(500),
    email character varying(255),
    full_name character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_login timestamp without time zone,
    okta_id character varying,
    first_name character varying(100),
    middle_name character varying(100),
    last_name character varying(100),
    phone_number character varying(20),
    address_line1 character varying(255),
    address_line2 character varying(255),
    city character varying(100),
    state character varying(100),
    postal_code character varying(20),
    country character varying(100),
    auth_provider character varying(20) DEFAULT 'local'::character varying,
    external_id character varying(255),
    failed_login_attempts integer DEFAULT 0,
    locked_until timestamp without time zone,
    password_history jsonb DEFAULT '[]'::jsonb,
    force_password_change boolean DEFAULT false,
    internal_user boolean DEFAULT false,
    user_type character varying(50),
    must_change_password boolean DEFAULT false,
    vendor_id integer
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vendor_agreement_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_agreement_approvals (
    id integer NOT NULL,
    agreement_id integer NOT NULL,
    approver_type character varying(50) NOT NULL,
    approver_user_id integer NOT NULL,
    action character varying(50) NOT NULL,
    comments text,
    agreement_version integer NOT NULL,
    approval_timestamp timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    ip_address character varying(50),
    user_agent text,
    approval_stage character varying(50),
    CONSTRAINT vendor_agreement_approvals_action_check CHECK (((action)::text = ANY ((ARRAY['approved'::character varying, 'rejected'::character varying, 'revoked'::character varying])::text[]))),
    CONSTRAINT vendor_agreement_approvals_approver_type_check CHECK (((approver_type)::text = ANY ((ARRAY['vendor'::character varying, 'manager'::character varying, 'governance_manager'::character varying])::text[])))
);


--
-- Name: vendor_agreement_approvals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_agreement_approvals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_agreement_approvals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_agreement_approvals_id_seq OWNED BY public.vendor_agreement_approvals.id;


--
-- Name: vendor_agreement_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_agreement_changes (
    id integer NOT NULL,
    agreement_id integer NOT NULL,
    change_type character varying(50) NOT NULL,
    previous_data jsonb,
    new_data jsonb,
    changes_summary text,
    from_version integer,
    to_version integer,
    changed_by integer NOT NULL,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    reason text,
    ip_address character varying(50),
    user_agent text,
    CONSTRAINT vendor_agreement_changes_change_type_check CHECK (((change_type)::text = ANY ((ARRAY['created'::character varying, 'updated'::character varying, 'schema_changed'::character varying, 'reopened'::character varying, 'locked'::character varying, 'unlocked'::character varying])::text[])))
);


--
-- Name: vendor_agreement_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_agreement_changes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_agreement_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_agreement_changes_id_seq OWNED BY public.vendor_agreement_changes.id;


--
-- Name: vendor_agreement_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_agreement_documents (
    id integer NOT NULL,
    agreement_id integer NOT NULL,
    approval_id integer,
    document_name character varying(500) NOT NULL,
    document_type character varying(100),
    file_path text NOT NULL,
    file_size integer,
    mime_type character varying(100),
    uploaded_by integer NOT NULL,
    uploaded_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    description text,
    approval_stage character varying(50)
);


--
-- Name: vendor_agreement_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_agreement_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_agreement_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_agreement_documents_id_seq OWNED BY public.vendor_agreement_documents.id;


--
-- Name: vendor_agreement_file_schemas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_agreement_file_schemas (
    id integer NOT NULL,
    vendor_agreement_id integer NOT NULL,
    file_name_pattern character varying(500) NOT NULL,
    file_description text,
    schema jsonb NOT NULL,
    priority integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    updated_by integer,
    contains_pii boolean DEFAULT false,
    data_classification character varying(50),
    file_type character varying(50),
    quality_rule_ids jsonb DEFAULT '[]'::jsonb,
    column_metadata jsonb DEFAULT '{}'::jsonb,
    has_header boolean DEFAULT true,
    header_definition jsonb
);


--
-- Name: COLUMN vendor_agreement_file_schemas.contains_pii; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendor_agreement_file_schemas.contains_pii IS 'Indicates if this file pattern contains Personally Identifiable Information';


--
-- Name: COLUMN vendor_agreement_file_schemas.data_classification; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendor_agreement_file_schemas.data_classification IS 'Data classification level: Public, Internal, Confidential, Highly Confidential';


--
-- Name: COLUMN vendor_agreement_file_schemas.file_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendor_agreement_file_schemas.file_type IS 'File type: csv, json, xml, xlsx, parquet';


--
-- Name: COLUMN vendor_agreement_file_schemas.quality_rule_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendor_agreement_file_schemas.quality_rule_ids IS 'Array of quality rule IDs that apply to this file pattern';


--
-- Name: COLUMN vendor_agreement_file_schemas.column_metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vendor_agreement_file_schemas.column_metadata IS 'Column-level metadata including PII tags, data types, and transformations. Structure: {"column_name": {"contains_pii": true, "pii_type": "identifier|contact|financial|health|demographic", "data_type": "string", "description": "..."}}';


--
-- Name: vendor_agreement_file_schemas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_agreement_file_schemas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_agreement_file_schemas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_agreement_file_schemas_id_seq OWNED BY public.vendor_agreement_file_schemas.id;


--
-- Name: vendor_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_agreements (
    id integer NOT NULL,
    vendor_id integer,
    agreement_code character varying(100),
    file_name character varying(500),
    file_description text,
    schema jsonb,
    frequency character varying(50),
    frequency_description text,
    vendor_department_team character varying(255),
    file_owner_user_id integer,
    primary_contact_name character varying(255),
    owner_contact character varying(255),
    metadata jsonb,
    approval_status character varying(50) DEFAULT 'draft'::character varying,
    vendor_approved_at timestamp without time zone,
    vendor_approved_by integer,
    owner_approved_at timestamp without time zone,
    owner_approved_by integer,
    is_locked boolean DEFAULT false,
    locked_at timestamp without time zone,
    version integer DEFAULT 1,
    status character varying(50) DEFAULT 'active'::character varying,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_by integer,
    vendor_connection_id character varying,
    drop_location_path character varying(500),
    project_id integer,
    manager_contact text,
    primary_contact_phone character varying(50),
    primary_contact_email character varying(255),
    primary_contact_designation character varying(255),
    secondary_contact_name character varying(255),
    secondary_contact_phone character varying(50),
    secondary_contact_email character varying(255),
    secondary_contact_designation character varying(255),
    contains_pii boolean DEFAULT false,
    file_type character varying(50),
    data_classification character varying(50),
    domain character varying(255),
    retention_days integer,
    expected_arrival_time character varying(50),
    delivery_method character varying(100),
    vendor_type character varying(100),
    vendor_department_email character varying(255),
    vendor_onboarding_date date,
    governance_manager_user_id integer,
    governance_approved_at timestamp without time zone,
    governance_approved_by integer,
    contract_start_date timestamp with time zone,
    contract_end_date timestamp with time zone,
    sub_project_id integer,
    description text,
    sla_enabled boolean DEFAULT false,
    frequency_pattern character varying(50),
    arrival_days text,
    alert_threshold_minutes integer DEFAULT 60,
    arrival_time character varying(10),
    additional_stakeholder_user_ids jsonb DEFAULT '[]'::jsonb,
    additional_stakeholder_group_ids jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT vendor_agreements_approval_status_check CHECK (((approval_status)::text = ANY ((ARRAY['draft'::character varying, 'pending_vendor_acceptance'::character varying, 'vendor_accepted'::character varying, 'vendor_rejected'::character varying, 'pending_manager_approval'::character varying, 'manager_approved'::character varying, 'manager_rejected'::character varying, 'pending_governance_approval'::character varying, 'governance_approved'::character varying, 'governance_rejected'::character varying, 'fully_approved'::character varying, 'rejected'::character varying, 'changes_pending'::character varying])::text[]))),
    CONSTRAINT vendor_agreements_data_classification_check CHECK ((((data_classification)::text = ANY ((ARRAY['Public'::character varying, 'Private'::character varying, 'Confidential'::character varying])::text[])) OR (data_classification IS NULL))),
    CONSTRAINT vendor_agreements_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'archived'::character varying, 'draft'::character varying, 'pending'::character varying])::text[])))
);


--
-- Name: vendor_agreements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_agreements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_agreements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_agreements_id_seq OWNED BY public.vendor_agreements.id;


--
-- Name: vendor_file_profiling_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_file_profiling_results (
    id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    uploaded_by_user_id integer,
    vendor_id integer,
    connection_id character varying(255),
    quality_score numeric(5,2),
    completeness_score numeric(5,2),
    consistency_score numeric(5,2),
    validity_score numeric(5,2),
    uniqueness_score numeric(5,2),
    timeliness_score numeric(5,2),
    issues jsonb DEFAULT '[]'::jsonb,
    header_issues jsonb,
    null_value_summary jsonb,
    date_format_issues jsonb,
    duplicate_data jsonb,
    profiling_metadata jsonb,
    profiled_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: vendor_file_profiling_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_file_profiling_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_file_profiling_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_file_profiling_results_id_seq OWNED BY public.vendor_file_profiling_results.id;


--
-- Name: vendor_sla_violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_sla_violations (
    id integer NOT NULL,
    agreement_id integer NOT NULL,
    expected_arrival_time timestamp without time zone NOT NULL,
    violation_detected_at timestamp without time zone DEFAULT now() NOT NULL,
    alert_sent boolean DEFAULT false,
    alert_sent_at timestamp without time zone,
    resolved boolean DEFAULT false,
    resolved_at timestamp without time zone,
    file_id character varying(255),
    actual_arrival_time timestamp without time zone,
    delay_minutes integer,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: vendor_sla_violations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_sla_violations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_sla_violations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_sla_violations_id_seq OWNED BY public.vendor_sla_violations.id;


--
-- Name: vendor_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_users (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255),
    phone character varying(50),
    designation character varying(255),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    updated_by integer
);


--
-- Name: vendor_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_users_id_seq OWNED BY public.vendor_users.id;


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendors (
    id integer NOT NULL,
    vendor_code character varying(50) NOT NULL,
    vendor_name character varying(255) NOT NULL,
    description text,
    contact_name character varying(255) NOT NULL,
    contact_email character varying(255) NOT NULL,
    contact_phone character varying(50),
    vendor_user_id integer,
    project_id integer,
    status character varying(50) DEFAULT 'active'::character varying,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_by integer,
    address text,
    backup_contact_name character varying(255),
    backup_contact_phone character varying(50),
    backup_contact_email character varying(255),
    vendor_onboarding_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    vendor_type character varying(100),
    CONSTRAINT vendors_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'suspended'::character varying])::text[])))
);


--
-- Name: vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendors_id_seq OWNED BY public.vendors.id;


--
-- Name: visual_lineage_graphs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visual_lineage_graphs (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    root_type character varying(50) NOT NULL,
    root_id integer NOT NULL,
    graph_config jsonb DEFAULT '{"depth": 3, "includeIncidents": true}'::jsonb,
    graph_data jsonb DEFAULT '{"edges": [], "nodes": []}'::jsonb,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true,
    project_id integer
);


--
-- Name: visual_lineage_graphs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visual_lineage_graphs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visual_lineage_graphs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visual_lineage_graphs_id_seq OWNED BY public.visual_lineage_graphs.id;


--
-- Name: visual_mapping_defs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visual_mapping_defs (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    project_id integer,
    sub_project_id integer,
    graph_data jsonb DEFAULT '{"edges": [], "nodes": []}'::jsonb NOT NULL,
    canvas_state jsonb DEFAULT '{"zoom": 1, "position": [0, 0]}'::jsonb,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true,
    last_executed_at timestamp without time zone,
    execution_count integer DEFAULT 0,
    notification_settings jsonb
);


--
-- Name: visual_mapping_defs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visual_mapping_defs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visual_mapping_defs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visual_mapping_defs_id_seq OWNED BY public.visual_mapping_defs.id;


--
-- Name: visual_mapping_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visual_mapping_edges (
    id integer NOT NULL,
    mapping_id integer NOT NULL,
    edge_id character varying(100) NOT NULL,
    source_node_id character varying(100) NOT NULL,
    target_node_id character varying(100) NOT NULL,
    source_handle character varying(50),
    target_handle character varying(50),
    edge_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: visual_mapping_edges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visual_mapping_edges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visual_mapping_edges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visual_mapping_edges_id_seq OWNED BY public.visual_mapping_edges.id;


--
-- Name: visual_mapping_execution_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visual_mapping_execution_logs (
    id integer NOT NULL,
    mapping_id integer NOT NULL,
    run_id character varying(255) NOT NULL,
    run_name character varying(255) NOT NULL,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    status character varying(50) DEFAULT 'running'::character varying NOT NULL,
    logs jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    execution_id character varying(255)
);


--
-- Name: visual_mapping_execution_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visual_mapping_execution_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visual_mapping_execution_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visual_mapping_execution_logs_id_seq OWNED BY public.visual_mapping_execution_logs.id;


--
-- Name: visual_mapping_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visual_mapping_executions (
    id integer NOT NULL,
    execution_id character varying(100) NOT NULL,
    mapping_id integer NOT NULL,
    transformation_job_id character varying(100),
    status character varying(50) DEFAULT 'pending'::character varying,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    triggered_by integer,
    node_executions jsonb DEFAULT '[]'::jsonb,
    edge_metrics jsonb DEFAULT '{}'::jsonb,
    error_message text,
    rows_processed integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    transformation_id integer,
    job_id character varying(255),
    logs jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT visual_mapping_executions_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'running'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: visual_mapping_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visual_mapping_executions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visual_mapping_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visual_mapping_executions_id_seq OWNED BY public.visual_mapping_executions.id;


--
-- Name: visual_mapping_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visual_mapping_nodes (
    id integer NOT NULL,
    mapping_id integer NOT NULL,
    node_id character varying(100) NOT NULL,
    node_type character varying(50) NOT NULL,
    node_label character varying(255),
    position_x double precision NOT NULL,
    position_y double precision NOT NULL,
    config_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT visual_mapping_nodes_node_type_check CHECK (((node_type)::text = ANY ((ARRAY['mapping_config'::character varying, 'source_config'::character varying, 'expression'::character varying, 'rdm_dataset'::character varying, 'rdm_crosswalk'::character varying, 'target_rules'::character varying])::text[])))
);


--
-- Name: visual_mapping_nodes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visual_mapping_nodes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visual_mapping_nodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visual_mapping_nodes_id_seq OWNED BY public.visual_mapping_nodes.id;


--
-- Name: visual_workflow_execution_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visual_workflow_execution_logs (
    id integer NOT NULL,
    workflow_id integer NOT NULL,
    run_id character varying(255) NOT NULL,
    run_name character varying(255) NOT NULL,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(50) DEFAULT 'running'::character varying,
    logs jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    execution_id character varying(255)
);


--
-- Name: visual_workflow_execution_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visual_workflow_execution_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visual_workflow_execution_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visual_workflow_execution_logs_id_seq OWNED BY public.visual_workflow_execution_logs.id;


--
-- Name: visual_workflow_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visual_workflow_executions (
    id integer NOT NULL,
    workflow_id integer NOT NULL,
    execution_id text NOT NULL,
    status text DEFAULT 'running'::text,
    total_nodes integer DEFAULT 0,
    completed_nodes integer DEFAULT 0,
    failed_nodes integer DEFAULT 0,
    start_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    end_time timestamp without time zone,
    duration_ms integer,
    triggered_by integer,
    error_message text,
    execution_summary jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    project_id integer
);


--
-- Name: visual_workflow_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visual_workflow_executions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visual_workflow_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visual_workflow_executions_id_seq OWNED BY public.visual_workflow_executions.id;


--
-- Name: visual_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visual_workflows (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    graph_data jsonb DEFAULT '{"edges": [], "nodes": []}'::jsonb NOT NULL,
    execution_mode character varying(50) DEFAULT 'sequential'::character varying,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true,
    project_id integer,
    sub_project_id integer
);


--
-- Name: visual_workflows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visual_workflows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visual_workflows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visual_workflows_id_seq OWNED BY public.visual_workflows.id;


--
-- Name: workflow_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_executions (
    id integer NOT NULL,
    workflow_id integer NOT NULL,
    execution_id text NOT NULL,
    status text DEFAULT 'running'::text,
    current_step_id integer,
    total_steps integer DEFAULT 0,
    completed_steps integer DEFAULT 0,
    failed_steps integer DEFAULT 0,
    start_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    end_time timestamp without time zone,
    duration_ms integer,
    triggered_by integer,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    project_id integer NOT NULL,
    CONSTRAINT workflow_executions_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: workflow_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_executions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_executions_id_seq OWNED BY public.workflow_executions.id;


--
-- Name: workflow_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_steps (
    id integer NOT NULL,
    workflow_id integer NOT NULL,
    step_name text NOT NULL,
    step_type text NOT NULL,
    entity_id text NOT NULL,
    depends_on integer,
    retry_count integer DEFAULT 3,
    retry_delay_seconds integer DEFAULT 60,
    execution_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    project_id integer NOT NULL,
    CONSTRAINT workflow_steps_step_type_check CHECK ((step_type = ANY (ARRAY['mapping'::text, 'mapping_group'::text])))
);


--
-- Name: workflow_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_steps_id_seq OWNED BY public.workflow_steps.id;


--
-- Name: access_group_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_group_roles ALTER COLUMN id SET DEFAULT nextval('public.access_group_roles_id_seq'::regclass);


--
-- Name: access_groups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_groups ALTER COLUMN id SET DEFAULT nextval('public.access_groups_id_seq'::regclass);


--
-- Name: alert_aggregation id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_aggregation ALTER COLUMN id SET DEFAULT nextval('public.alert_aggregation_id_seq'::regclass);


--
-- Name: alert_attachments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_attachments ALTER COLUMN id SET DEFAULT nextval('public.alert_attachments_id_seq'::regclass);


--
-- Name: alert_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_events ALTER COLUMN id SET DEFAULT nextval('public.alert_events_id_seq'::regclass);


--
-- Name: alert_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_history ALTER COLUMN id SET DEFAULT nextval('public.alert_history_id_seq'::regclass);


--
-- Name: alert_policies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_policies ALTER COLUMN id SET DEFAULT nextval('public.alert_policies_id_seq'::regclass);


--
-- Name: alert_policy_recipients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_policy_recipients ALTER COLUMN id SET DEFAULT nextval('public.alert_policy_recipients_id_seq'::regclass);


--
-- Name: alert_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_rules ALTER COLUMN id SET DEFAULT nextval('public.alert_rules_id_seq'::regclass);


--

-- =====================================================
-- SECTION 3: PRIMARY KEY CONSTRAINTS
-- =====================================================

-- PK: access_group_members_pkey
ALTER TABLE access_group_members ADD CONSTRAINT access_group_members_pkey PRIMARY KEY (group_id, user_id);
-- PK: access_group_roles_pkey
ALTER TABLE access_group_roles ADD CONSTRAINT access_group_roles_pkey PRIMARY KEY (id);
-- PK: access_groups_pkey
ALTER TABLE access_groups ADD CONSTRAINT access_groups_pkey PRIMARY KEY (id);
-- PK: alert_aggregation_pkey
ALTER TABLE alert_aggregation ADD CONSTRAINT alert_aggregation_pkey PRIMARY KEY (id);
-- PK: alert_attachments_pkey
ALTER TABLE alert_attachments ADD CONSTRAINT alert_attachments_pkey PRIMARY KEY (id);
-- PK: alert_events_pkey
ALTER TABLE alert_events ADD CONSTRAINT alert_events_pkey PRIMARY KEY (id);
-- PK: alert_history_pkey
ALTER TABLE alert_history ADD CONSTRAINT alert_history_pkey PRIMARY KEY (id);
-- PK: alert_policies_pkey
ALTER TABLE alert_policies ADD CONSTRAINT alert_policies_pkey PRIMARY KEY (id);
-- PK: alert_policy_recipients_pkey
ALTER TABLE alert_policy_recipients ADD CONSTRAINT alert_policy_recipients_pkey PRIMARY KEY (id);
-- PK: alert_rules_pkey
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_pkey PRIMARY KEY (id);
-- PK: alert_runs_pkey
ALTER TABLE alert_runs ADD CONSTRAINT alert_runs_pkey PRIMARY KEY (id);
-- PK: allowed_email_domains_pkey
ALTER TABLE allowed_email_domains ADD CONSTRAINT allowed_email_domains_pkey PRIMARY KEY (id);
-- PK: anomalies_pkey
ALTER TABLE anomalies ADD CONSTRAINT anomalies_pkey PRIMARY KEY (id);
-- PK: api_tokens_pkey
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);
-- PK: app_settings_pkey
ALTER TABLE app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);
-- PK: archive_extractions_pkey
ALTER TABLE archive_extractions ADD CONSTRAINT archive_extractions_pkey PRIMARY KEY (id);
-- PK: archive_members_pkey
ALTER TABLE archive_members ADD CONSTRAINT archive_members_pkey PRIMARY KEY (id);
-- PK: archived_files_pkey
ALTER TABLE archived_files ADD CONSTRAINT archived_files_pkey PRIMARY KEY (id);
-- PK: attribute_definitions_pkey
ALTER TABLE attribute_definitions ADD CONSTRAINT attribute_definitions_pkey PRIMARY KEY (id);
-- PK: audit_ledger_pkey
ALTER TABLE audit_ledger ADD CONSTRAINT audit_ledger_pkey PRIMARY KEY (id);
-- PK: audit_ledger_sequence_pkey
ALTER TABLE audit_ledger_sequence ADD CONSTRAINT audit_ledger_sequence_pkey PRIMARY KEY (tenant_id);
-- PK: audit_ledger_verification_pkey
ALTER TABLE audit_ledger_verification ADD CONSTRAINT audit_ledger_verification_pkey PRIMARY KEY (id);
-- PK: audit_log_pkey
ALTER TABLE audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (audit_id);
-- PK: audit_log_archive_pkey
ALTER TABLE audit_log_archive ADD CONSTRAINT audit_log_archive_pkey PRIMARY KEY (audit_id);
-- PK: audit_retention_settings_pkey
ALTER TABLE audit_retention_settings ADD CONSTRAINT audit_retention_settings_pkey PRIMARY KEY (id);
-- PK: bulk_profiling_files_pkey
ALTER TABLE bulk_profiling_files ADD CONSTRAINT bulk_profiling_files_pkey PRIMARY KEY (id);
-- PK: bulk_profiling_jobs_pkey
ALTER TABLE bulk_profiling_jobs ADD CONSTRAINT bulk_profiling_jobs_pkey PRIMARY KEY (id);
-- PK: business_processes_pkey
ALTER TABLE business_processes ADD CONSTRAINT business_processes_pkey PRIMARY KEY (id);
-- PK: column_governance_tag_assignments_pkey
ALTER TABLE column_governance_tag_assignments ADD CONSTRAINT column_governance_tag_assignments_pkey PRIMARY KEY (assignment_id);
-- PK: column_mappings_pkey
ALTER TABLE column_mappings ADD CONSTRAINT column_mappings_pkey PRIMARY KEY (id);
-- PK: column_policy_assignments_pkey
ALTER TABLE column_policy_assignments ADD CONSTRAINT column_policy_assignments_pkey PRIMARY KEY (assignment_id);
-- PK: column_sensitivity_tags_pkey
ALTER TABLE column_sensitivity_tags ADD CONSTRAINT column_sensitivity_tags_pkey PRIMARY KEY (tag_id);
-- PK: config_change_history_pkey
ALTER TABLE config_change_history ADD CONSTRAINT config_change_history_pkey PRIMARY KEY (change_id);
-- PK: config_change_history_archive_pkey
ALTER TABLE config_change_history_archive ADD CONSTRAINT config_change_history_archive_pkey PRIMARY KEY (change_id);
-- PK: connections_pkey
ALTER TABLE connections ADD CONSTRAINT connections_pkey PRIMARY KEY (id);
-- PK: data_access_log_pkey
ALTER TABLE data_access_log ADD CONSTRAINT data_access_log_pkey PRIMARY KEY (access_id);
-- PK: data_access_log_archive_pkey
ALTER TABLE data_access_log_archive ADD CONSTRAINT data_access_log_archive_pkey PRIMARY KEY (access_id);
-- PK: dbt_executions_pkey
ALTER TABLE dbt_executions ADD CONSTRAINT dbt_executions_pkey PRIMARY KEY (execution_id);
-- PK: dbt_models_pkey
ALTER TABLE dbt_models ADD CONSTRAINT dbt_models_pkey PRIMARY KEY (model_id);
-- PK: dlq_jobs_pkey
ALTER TABLE dlq_jobs ADD CONSTRAINT dlq_jobs_pkey PRIMARY KEY (id);
-- PK: drop_location_config_pkey
ALTER TABLE drop_location_config ADD CONSTRAINT drop_location_config_pkey PRIMARY KEY (id);
-- PK: encrypted_passwords_pkey
ALTER TABLE encrypted_passwords ADD CONSTRAINT encrypted_passwords_pkey PRIMARY KEY (id);
-- PK: execution_audit_pkey
ALTER TABLE execution_audit ADD CONSTRAINT execution_audit_pkey PRIMARY KEY (audit_id);
-- PK: execution_audit_archive_pkey
ALTER TABLE execution_audit_archive ADD CONSTRAINT execution_audit_archive_pkey PRIMARY KEY (audit_id);
-- PK: file_audit_details_pkey
ALTER TABLE file_audit_details ADD CONSTRAINT file_audit_details_pkey PRIMARY KEY (id);
-- PK: file_columns_pkey
ALTER TABLE file_columns ADD CONSTRAINT file_columns_pkey PRIMARY KEY (id);
-- PK: file_errors_pkey
ALTER TABLE file_errors ADD CONSTRAINT file_errors_pkey PRIMARY KEY (id);
-- PK: file_history_pkey
ALTER TABLE file_history ADD CONSTRAINT file_history_pkey PRIMARY KEY (id);
-- PK: file_lineage_pkey
ALTER TABLE file_lineage ADD CONSTRAINT file_lineage_pkey PRIMARY KEY (id);
-- PK: file_mappings_pkey
ALTER TABLE file_mappings ADD CONSTRAINT file_mappings_pkey PRIMARY KEY (id);
-- PK: file_ownership_pkey
ALTER TABLE file_ownership ADD CONSTRAINT file_ownership_pkey PRIMARY KEY (ownership_id);
-- PK: file_pattern_metrics_pkey
ALTER TABLE file_pattern_metrics ADD CONSTRAINT file_pattern_metrics_pkey PRIMARY KEY (id);
-- PK: file_policy_assignments_pkey
ALTER TABLE file_policy_assignments ADD CONSTRAINT file_policy_assignments_pkey PRIMARY KEY (assignment_id);
-- PK: file_preview_data_pkey
ALTER TABLE file_preview_data ADD CONSTRAINT file_preview_data_pkey PRIMARY KEY (preview_id);
-- PK: file_processing_artifacts_pkey
ALTER TABLE file_processing_artifacts ADD CONSTRAINT file_processing_artifacts_pkey PRIMARY KEY (id);
-- PK: file_quality_checks_pkey
ALTER TABLE file_quality_checks ADD CONSTRAINT file_quality_checks_pkey PRIMARY KEY (id);
-- PK: file_quality_rules_pkey
ALTER TABLE file_quality_rules ADD CONSTRAINT file_quality_rules_pkey PRIMARY KEY (id);
-- PK: file_restorations_pkey
ALTER TABLE file_restorations ADD CONSTRAINT file_restorations_pkey PRIMARY KEY (id);
-- PK: file_schedules_pkey
ALTER TABLE file_schedules ADD CONSTRAINT file_schedules_pkey PRIMARY KEY (id);
-- PK: file_schema_details_pkey
ALTER TABLE file_schema_details ADD CONSTRAINT file_schema_details_pkey PRIMARY KEY (id);
-- PK: file_schemas_pkey
ALTER TABLE file_schemas ADD CONSTRAINT file_schemas_pkey PRIMARY KEY (id);
-- PK: file_tag_assignments_pkey
ALTER TABLE file_tag_assignments ADD CONSTRAINT file_tag_assignments_pkey PRIMARY KEY (assignment_id);
-- PK: files_pkey
ALTER TABLE files ADD CONSTRAINT files_pkey PRIMARY KEY (id);
-- PK: fixed_width_schemas_pkey
ALTER TABLE fixed_width_schemas ADD CONSTRAINT fixed_width_schemas_pkey PRIMARY KEY (id);
-- PK: frontend_audit_log_pkey
ALTER TABLE frontend_audit_log ADD CONSTRAINT frontend_audit_log_pkey PRIMARY KEY (audit_id);
-- PK: governance_policies_pkey
ALTER TABLE governance_policies ADD CONSTRAINT governance_policies_pkey PRIMARY KEY (policy_id);
-- PK: governance_tags_pkey
ALTER TABLE governance_tags ADD CONSTRAINT governance_tags_pkey PRIMARY KEY (tag_id);
-- PK: group_policy_attachments_pkey
ALTER TABLE group_policy_attachments ADD CONSTRAINT group_policy_attachments_pkey PRIMARY KEY (group_id, policy_id);
-- PK: groups_pkey
ALTER TABLE groups ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
-- PK: idempotency_keys_pkey
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (id);
-- PK: job_dependencies_pkey
ALTER TABLE job_dependencies ADD CONSTRAINT job_dependencies_pkey PRIMARY KEY (dependency_id);
-- PK: job_group_dependencies_pkey
ALTER TABLE job_group_dependencies ADD CONSTRAINT job_group_dependencies_pkey PRIMARY KEY (group_dependency_id);
-- PK: job_group_jobs_pkey
ALTER TABLE job_group_jobs ADD CONSTRAINT job_group_jobs_pkey PRIMARY KEY (group_id, job_id);
-- PK: job_group_schedules_pkey
ALTER TABLE job_group_schedules ADD CONSTRAINT job_group_schedules_pkey PRIMARY KEY (group_schedule_id);
-- PK: job_groups_pkey
ALTER TABLE job_groups ADD CONSTRAINT job_groups_pkey PRIMARY KEY (id);
-- PK: job_history_pkey
ALTER TABLE job_history ADD CONSTRAINT job_history_pkey PRIMARY KEY (id);
-- PK: job_runs_pkey
ALTER TABLE job_runs ADD CONSTRAINT job_runs_pkey PRIMARY KEY (id);
-- PK: job_schedules_pkey
ALTER TABLE job_schedules ADD CONSTRAINT job_schedules_pkey PRIMARY KEY (id);
-- PK: jobs_pkey
ALTER TABLE jobs ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);
-- PK: lineage_views_pkey
ALTER TABLE lineage_views ADD CONSTRAINT lineage_views_pkey PRIMARY KEY (id);
-- PK: logical_file_groups_pkey
ALTER TABLE logical_file_groups ADD CONSTRAINT logical_file_groups_pkey PRIMARY KEY (id);
-- PK: mapping_group_executions_pkey
ALTER TABLE mapping_group_executions ADD CONSTRAINT mapping_group_executions_pkey PRIMARY KEY (id);
-- PK: mapping_group_members_pkey
ALTER TABLE mapping_group_members ADD CONSTRAINT mapping_group_members_pkey PRIMARY KEY (id);
-- PK: mapping_groups_pkey
ALTER TABLE mapping_groups ADD CONSTRAINT mapping_groups_pkey PRIMARY KEY (id);
-- PK: mapping_job_errors_pkey
ALTER TABLE mapping_job_errors ADD CONSTRAINT mapping_job_errors_pkey PRIMARY KEY (id);
-- PK: migrations_pkey
ALTER TABLE migrations ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);
-- PK: n_step_workflow_assets_pkey
ALTER TABLE n_step_workflow_assets ADD CONSTRAINT n_step_workflow_assets_pkey PRIMARY KEY (id);
-- PK: n_step_workflow_run_steps_pkey
ALTER TABLE n_step_workflow_run_steps ADD CONSTRAINT n_step_workflow_run_steps_pkey PRIMARY KEY (id);
-- PK: n_step_workflow_runs_pkey
ALTER TABLE n_step_workflow_runs ADD CONSTRAINT n_step_workflow_runs_pkey PRIMARY KEY (id);
-- PK: n_step_workflow_steps_pkey
ALTER TABLE n_step_workflow_steps ADD CONSTRAINT n_step_workflow_steps_pkey PRIMARY KEY (id);
-- PK: n_step_workflows_pkey
ALTER TABLE n_step_workflows ADD CONSTRAINT n_step_workflows_pkey PRIMARY KEY (id);
-- PK: notifications_pkey
ALTER TABLE notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
-- PK: password_reset_requests_pkey
ALTER TABLE password_reset_requests ADD CONSTRAINT password_reset_requests_pkey PRIMARY KEY (id);
-- PK: permissions_pkey
ALTER TABLE permissions ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);
-- PK: policy_evaluation_cache_pkey
ALTER TABLE policy_evaluation_cache ADD CONSTRAINT policy_evaluation_cache_pkey PRIMARY KEY (cache_key);
-- PK: processing_events_pkey
ALTER TABLE processing_events ADD CONSTRAINT processing_events_pkey PRIMARY KEY (id);
-- PK: profiling_metrics_pkey
ALTER TABLE profiling_metrics ADD CONSTRAINT profiling_metrics_pkey PRIMARY KEY (id);
-- PK: project_access_groups_pkey
ALTER TABLE project_access_groups ADD CONSTRAINT project_access_groups_pkey PRIMARY KEY (project_id, group_id);
-- PK: projects_pkey
ALTER TABLE projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
-- PK: quality_reports_pkey
ALTER TABLE quality_reports ADD CONSTRAINT quality_reports_pkey PRIMARY KEY (report_id);
-- PK: quality_rule_configurations_pkey
ALTER TABLE quality_rule_configurations ADD CONSTRAINT quality_rule_configurations_pkey PRIMARY KEY (id);
-- PK: quality_rule_violations_pkey
ALTER TABLE quality_rule_violations ADD CONSTRAINT quality_rule_violations_pkey PRIMARY KEY (id);
-- PK: quality_rules_pkey
ALTER TABLE quality_rules ADD CONSTRAINT quality_rules_pkey PRIMARY KEY (id);
-- PK: rbac_policies_pkey
ALTER TABLE rbac_policies ADD CONSTRAINT rbac_policies_pkey PRIMARY KEY (id);
-- PK: refresh_tokens_pkey
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);
-- PK: resource_attributes_pkey
ALTER TABLE resource_attributes ADD CONSTRAINT resource_attributes_pkey PRIMARY KEY (id);
-- PK: resource_policy_attachments_pkey
ALTER TABLE resource_policy_attachments ADD CONSTRAINT resource_policy_attachments_pkey PRIMARY KEY (resource_type, resource_id, policy_id);
-- PK: retention_policies_pkey
ALTER TABLE retention_policies ADD CONSTRAINT retention_policies_pkey PRIMARY KEY (id);
-- PK: retention_policy_runs_pkey
ALTER TABLE retention_policy_runs ADD CONSTRAINT retention_policy_runs_pkey PRIMARY KEY (id);
-- PK: role_permissions_pkey
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);
-- PK: roles_pkey
ALTER TABLE roles ADD CONSTRAINT roles_pkey PRIMARY KEY (id);
-- PK: schedules_pkey
ALTER TABLE schedules ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);
-- PK: schema_migrations_pkey
ALTER TABLE schema_migrations ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);
-- PK: schema_validation_job_files_pkey
ALTER TABLE schema_validation_job_files ADD CONSTRAINT schema_validation_job_files_pkey PRIMARY KEY (id);
-- PK: schema_validation_jobs_pkey
ALTER TABLE schema_validation_jobs ADD CONSTRAINT schema_validation_jobs_pkey PRIMARY KEY (id);
-- PK: scim_configurations_pkey
ALTER TABLE scim_configurations ADD CONSTRAINT scim_configurations_pkey PRIMARY KEY (id);
-- PK: scim_resource_mappings_pkey
ALTER TABLE scim_resource_mappings ADD CONSTRAINT scim_resource_mappings_pkey PRIMARY KEY (id);
-- PK: scim_sync_logs_pkey
ALTER TABLE scim_sync_logs ADD CONSTRAINT scim_sync_logs_pkey PRIMARY KEY (id);
-- PK: security_audit_log_pkey
ALTER TABLE security_audit_log ADD CONSTRAINT security_audit_log_pkey PRIMARY KEY (security_audit_id);
-- PK: security_audit_log_archive_pkey
ALTER TABLE security_audit_log_archive ADD CONSTRAINT security_audit_log_archive_pkey PRIMARY KEY (security_audit_id);
-- PK: storage_connections_pkey
ALTER TABLE storage_connections ADD CONSTRAINT storage_connections_pkey PRIMARY KEY (connection_id);
-- PK: sub_project_access_groups_pkey
ALTER TABLE sub_project_access_groups ADD CONSTRAINT sub_project_access_groups_pkey PRIMARY KEY (id);
-- PK: sub_project_members_pkey
ALTER TABLE sub_project_members ADD CONSTRAINT sub_project_members_pkey PRIMARY KEY (id);
-- PK: tag_permissions_pkey
ALTER TABLE tag_permissions ADD CONSTRAINT tag_permissions_pkey PRIMARY KEY (id);
-- PK: transform_connections_pkey
ALTER TABLE transform_connections ADD CONSTRAINT transform_connections_pkey PRIMARY KEY (id);
-- PK: transformation_executions_pkey
ALTER TABLE transformation_executions ADD CONSTRAINT transformation_executions_pkey PRIMARY KEY (id);
-- PK: transformation_jobs_pkey
ALTER TABLE transformation_jobs ADD CONSTRAINT transformation_jobs_pkey PRIMARY KEY (id);
-- PK: transformation_lineage_pkey
ALTER TABLE transformation_lineage ADD CONSTRAINT transformation_lineage_pkey PRIMARY KEY (id);
-- PK: transformation_logs_pkey
ALTER TABLE transformation_logs ADD CONSTRAINT transformation_logs_pkey PRIMARY KEY (id);
-- PK: transformation_mappings_pkey
ALTER TABLE transformation_mappings ADD CONSTRAINT transformation_mappings_pkey PRIMARY KEY (id);
-- PK: transformation_outputs_pkey
ALTER TABLE transformation_outputs ADD CONSTRAINT transformation_outputs_pkey PRIMARY KEY (id);
-- PK: transformation_quality_rules_pkey
ALTER TABLE transformation_quality_rules ADD CONSTRAINT transformation_quality_rules_pkey PRIMARY KEY (id);
-- PK: transformations_pkey
ALTER TABLE transformations ADD CONSTRAINT transformations_pkey PRIMARY KEY (id);
-- PK: upload_batches_pkey
ALTER TABLE upload_batches ADD CONSTRAINT upload_batches_pkey PRIMARY KEY (id);
-- PK: upload_file_records_pkey
ALTER TABLE upload_file_records ADD CONSTRAINT upload_file_records_pkey PRIMARY KEY (id);
-- PK: upload_files_pkey
ALTER TABLE upload_files ADD CONSTRAINT upload_files_pkey PRIMARY KEY (id);
-- PK: user_attributes_pkey
ALTER TABLE user_attributes ADD CONSTRAINT user_attributes_pkey PRIMARY KEY (id);
-- PK: user_badges_pkey
ALTER TABLE user_badges ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);
-- PK: user_dashboard_settings_pkey
ALTER TABLE user_dashboard_settings ADD CONSTRAINT user_dashboard_settings_pkey PRIMARY KEY (id);
-- PK: user_groups_pkey
ALTER TABLE user_groups ADD CONSTRAINT user_groups_pkey PRIMARY KEY (user_id, group_id);
-- PK: user_job_groups_pkey
ALTER TABLE user_job_groups ADD CONSTRAINT user_job_groups_pkey PRIMARY KEY (user_id, group_id);
-- PK: user_policy_attachments_pkey
ALTER TABLE user_policy_attachments ADD CONSTRAINT user_policy_attachments_pkey PRIMARY KEY (user_id, policy_id);
-- PK: user_roles_pkey
ALTER TABLE user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);
-- PK: user_sessions_pkey
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);
-- PK: user_uuid_mapping_pkey
ALTER TABLE user_uuid_mapping ADD CONSTRAINT user_uuid_mapping_pkey PRIMARY KEY (user_id);
-- PK: users_pkey
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
-- PK: vendor_agreement_approvals_pkey
ALTER TABLE vendor_agreement_approvals ADD CONSTRAINT vendor_agreement_approvals_pkey PRIMARY KEY (id);
-- PK: vendor_agreement_changes_pkey
ALTER TABLE vendor_agreement_changes ADD CONSTRAINT vendor_agreement_changes_pkey PRIMARY KEY (id);
-- PK: vendor_agreement_documents_pkey
ALTER TABLE vendor_agreement_documents ADD CONSTRAINT vendor_agreement_documents_pkey PRIMARY KEY (id);
-- PK: vendor_agreement_file_schemas_pkey
ALTER TABLE vendor_agreement_file_schemas ADD CONSTRAINT vendor_agreement_file_schemas_pkey PRIMARY KEY (id);
-- PK: vendor_agreements_pkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_pkey PRIMARY KEY (id);
-- PK: vendor_file_profiling_results_pkey
ALTER TABLE vendor_file_profiling_results ADD CONSTRAINT vendor_file_profiling_results_pkey PRIMARY KEY (id);
-- PK: vendor_sla_violations_pkey
ALTER TABLE vendor_sla_violations ADD CONSTRAINT vendor_sla_violations_pkey PRIMARY KEY (id);
-- PK: vendor_users_pkey
ALTER TABLE vendor_users ADD CONSTRAINT vendor_users_pkey PRIMARY KEY (id);
-- PK: vendors_pkey
ALTER TABLE vendors ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);
-- PK: visual_lineage_graphs_pkey
ALTER TABLE visual_lineage_graphs ADD CONSTRAINT visual_lineage_graphs_pkey PRIMARY KEY (id);
-- PK: visual_mapping_defs_pkey
ALTER TABLE visual_mapping_defs ADD CONSTRAINT visual_mapping_defs_pkey PRIMARY KEY (id);
-- PK: visual_mapping_edges_pkey
ALTER TABLE visual_mapping_edges ADD CONSTRAINT visual_mapping_edges_pkey PRIMARY KEY (id);
-- PK: visual_mapping_execution_logs_pkey
ALTER TABLE visual_mapping_execution_logs ADD CONSTRAINT visual_mapping_execution_logs_pkey PRIMARY KEY (id);
-- PK: visual_mapping_executions_pkey
ALTER TABLE visual_mapping_executions ADD CONSTRAINT visual_mapping_executions_pkey PRIMARY KEY (id);
-- PK: visual_mapping_nodes_pkey
ALTER TABLE visual_mapping_nodes ADD CONSTRAINT visual_mapping_nodes_pkey PRIMARY KEY (id);
-- PK: visual_workflow_execution_logs_pkey
ALTER TABLE visual_workflow_execution_logs ADD CONSTRAINT visual_workflow_execution_logs_pkey PRIMARY KEY (id);
-- PK: visual_workflow_executions_pkey
ALTER TABLE visual_workflow_executions ADD CONSTRAINT visual_workflow_executions_pkey PRIMARY KEY (id);
-- PK: visual_workflows_pkey
ALTER TABLE visual_workflows ADD CONSTRAINT visual_workflows_pkey PRIMARY KEY (id);
-- PK: workflow_executions_pkey
ALTER TABLE workflow_executions ADD CONSTRAINT workflow_executions_pkey PRIMARY KEY (id);
-- PK: workflow_steps_pkey
ALTER TABLE workflow_steps ADD CONSTRAINT workflow_steps_pkey PRIMARY KEY (id);

-- =====================================================
-- SECTION 4: FOREIGN KEY CONSTRAINTS
-- =====================================================

-- FK: access_group_members_added_by_fkey
ALTER TABLE access_group_members ADD CONSTRAINT access_group_members_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id);
-- FK: access_group_members_group_id_fkey
ALTER TABLE access_group_members ADD CONSTRAINT access_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES access_groups(id);
-- FK: access_group_members_user_id_fkey
ALTER TABLE access_group_members ADD CONSTRAINT access_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: access_group_roles_assigned_by_fkey
ALTER TABLE access_group_roles ADD CONSTRAINT access_group_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id);
-- FK: access_group_roles_group_id_fkey
ALTER TABLE access_group_roles ADD CONSTRAINT access_group_roles_group_id_fkey FOREIGN KEY (group_id) REFERENCES access_groups(id);
-- FK: access_group_roles_project_id_fkey
ALTER TABLE access_group_roles ADD CONSTRAINT access_group_roles_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: access_group_roles_role_id_fkey
ALTER TABLE access_group_roles ADD CONSTRAINT access_group_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id);
-- FK: access_groups_created_by_fkey
ALTER TABLE access_groups ADD CONSTRAINT access_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: alert_aggregation_policy_id_fkey
ALTER TABLE alert_aggregation ADD CONSTRAINT alert_aggregation_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES alert_policies(id);
-- FK: alert_attachments_run_id_fkey
ALTER TABLE alert_attachments ADD CONSTRAINT alert_attachments_run_id_fkey FOREIGN KEY (run_id) REFERENCES alert_runs(id);
-- FK: alert_events_run_id_fkey
ALTER TABLE alert_events ADD CONSTRAINT alert_events_run_id_fkey FOREIGN KEY (run_id) REFERENCES alert_runs(id);
-- FK: alert_events_vendor_sla_violation_id_fkey
ALTER TABLE alert_events ADD CONSTRAINT alert_events_vendor_sla_violation_id_fkey FOREIGN KEY (vendor_sla_violation_id) REFERENCES vendor_sla_violations(id);
-- FK: alert_history_file_id_fkey
ALTER TABLE alert_history ADD CONSTRAINT alert_history_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: alert_history_rule_id_fkey
ALTER TABLE alert_history ADD CONSTRAINT alert_history_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES alert_rules(id);
-- FK: alert_policies_created_by_fkey
ALTER TABLE alert_policies ADD CONSTRAINT alert_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: alert_policies_email_connection_id_fkey
ALTER TABLE alert_policies ADD CONSTRAINT alert_policies_email_connection_id_fkey FOREIGN KEY (email_connection_id) REFERENCES storage_connections(connection_id);
-- FK: alert_policies_project_id_fkey
ALTER TABLE alert_policies ADD CONSTRAINT alert_policies_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: alert_policy_recipients_policy_id_fkey
ALTER TABLE alert_policy_recipients ADD CONSTRAINT alert_policy_recipients_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES alert_policies(id);
-- FK: alert_policy_recipients_user_id_fkey
ALTER TABLE alert_policy_recipients ADD CONSTRAINT alert_policy_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: alert_runs_email_connection_id_fkey
ALTER TABLE alert_runs ADD CONSTRAINT alert_runs_email_connection_id_fkey FOREIGN KEY (email_connection_id) REFERENCES storage_connections(connection_id);
-- FK: alert_runs_policy_id_fkey
ALTER TABLE alert_runs ADD CONSTRAINT alert_runs_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES alert_policies(id);
-- FK: allowed_email_domains_created_by_fkey
ALTER TABLE allowed_email_domains ADD CONSTRAINT allowed_email_domains_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: api_tokens_created_by_fkey
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: api_tokens_project_id_fkey
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: api_tokens_revoked_by_fkey
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES users(id);
-- FK: api_tokens_user_id_fkey
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: archive_extractions_file_id_fkey
ALTER TABLE archive_extractions ADD CONSTRAINT archive_extractions_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: archive_members_extracted_file_id_fkey
ALTER TABLE archive_members ADD CONSTRAINT archive_members_extracted_file_id_fkey FOREIGN KEY (extracted_file_id) REFERENCES files(file_id);
-- FK: archive_members_parent_file_id_fkey
ALTER TABLE archive_members ADD CONSTRAINT archive_members_parent_file_id_fkey FOREIGN KEY (parent_file_id) REFERENCES files(file_id);
-- FK: archived_files_archived_by_fkey
ALTER TABLE archived_files ADD CONSTRAINT archived_files_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES users(id);
-- FK: archived_files_deleted_by_fkey
ALTER TABLE archived_files ADD CONSTRAINT archived_files_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
-- FK: archived_files_policy_id_fkey
ALTER TABLE archived_files ADD CONSTRAINT archived_files_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES retention_policies(id);
-- FK: archived_files_restored_by_fkey
ALTER TABLE archived_files ADD CONSTRAINT archived_files_restored_by_fkey FOREIGN KEY (restored_by) REFERENCES users(id);
-- FK: audit_log_parent_audit_id_fkey
ALTER TABLE audit_log ADD CONSTRAINT audit_log_parent_audit_id_fkey FOREIGN KEY (parent_audit_id) REFERENCES audit_log(audit_id);
-- FK: bulk_profiling_files_job_id_fkey
ALTER TABLE bulk_profiling_files ADD CONSTRAINT bulk_profiling_files_job_id_fkey FOREIGN KEY (job_id) REFERENCES bulk_profiling_jobs(id);
-- FK: bulk_profiling_jobs_sub_project_id_fkey
ALTER TABLE bulk_profiling_jobs ADD CONSTRAINT bulk_profiling_jobs_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FK: business_processes_group_id_fkey
ALTER TABLE business_processes ADD CONSTRAINT business_processes_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id);
-- FK: fk_business_processes_project
ALTER TABLE business_processes ADD CONSTRAINT fk_business_processes_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: fk_column_tag_file
ALTER TABLE column_governance_tag_assignments ADD CONSTRAINT fk_column_tag_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: fk_column_tag_tag
ALTER TABLE column_governance_tag_assignments ADD CONSTRAINT fk_column_tag_tag FOREIGN KEY (tag_id) REFERENCES governance_tags(tag_id);
-- FK: column_mappings_source_file_id_fkey
ALTER TABLE column_mappings ADD CONSTRAINT column_mappings_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES files(file_id);
-- FK: fk_column_policy_file
ALTER TABLE column_policy_assignments ADD CONSTRAINT fk_column_policy_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: fk_column_policy_policy
ALTER TABLE column_policy_assignments ADD CONSTRAINT fk_column_policy_policy FOREIGN KEY (policy_id) REFERENCES governance_policies(policy_id);
-- FK: fk_column_tags_file
ALTER TABLE column_sensitivity_tags ADD CONSTRAINT fk_column_tags_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: dlq_jobs_file_id_fkey
ALTER TABLE dlq_jobs ADD CONSTRAINT dlq_jobs_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: dlq_jobs_project_id_fkey
ALTER TABLE dlq_jobs ADD CONSTRAINT dlq_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: dlq_jobs_resolved_by_fkey
ALTER TABLE dlq_jobs ADD CONSTRAINT dlq_jobs_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id);
-- FK: dlq_jobs_vendor_agreement_id_fkey
ALTER TABLE dlq_jobs ADD CONSTRAINT dlq_jobs_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES vendor_agreements(id);
-- FK: drop_location_config_created_by_fkey
ALTER TABLE drop_location_config ADD CONSTRAINT drop_location_config_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: drop_location_config_updated_by_fkey
ALTER TABLE drop_location_config ADD CONSTRAINT drop_location_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
-- FK: encrypted_passwords_created_by_fkey
ALTER TABLE encrypted_passwords ADD CONSTRAINT encrypted_passwords_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: file_audit_details_parent_audit_id_fkey
ALTER TABLE file_audit_details ADD CONSTRAINT file_audit_details_parent_audit_id_fkey FOREIGN KEY (parent_audit_id) REFERENCES file_audit_details(id);
-- FK: file_audit_details_transformation_job_id_fkey
ALTER TABLE file_audit_details ADD CONSTRAINT file_audit_details_transformation_job_id_fkey FOREIGN KEY (transformation_job_id) REFERENCES transformation_jobs(id);
-- FK: file_columns_file_id_fkey
ALTER TABLE file_columns ADD CONSTRAINT file_columns_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: file_history_file_id_fkey
ALTER TABLE file_history ADD CONSTRAINT file_history_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: file_lineage_source_file_id_fkey
ALTER TABLE file_lineage ADD CONSTRAINT file_lineage_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES files(file_id);
-- FK: file_lineage_target_file_id_fkey
ALTER TABLE file_lineage ADD CONSTRAINT file_lineage_target_file_id_fkey FOREIGN KEY (target_file_id) REFERENCES files(file_id);
-- FK: fk_file_ownership_file
ALTER TABLE file_ownership ADD CONSTRAINT fk_file_ownership_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: fk_file_ownership_user
ALTER TABLE file_ownership ADD CONSTRAINT fk_file_ownership_user FOREIGN KEY (owner_user_id) REFERENCES users(id);
-- FK: fk_policy_assignment_file
ALTER TABLE file_policy_assignments ADD CONSTRAINT fk_policy_assignment_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: fk_policy_assignment_policy
ALTER TABLE file_policy_assignments ADD CONSTRAINT fk_policy_assignment_policy FOREIGN KEY (policy_id) REFERENCES governance_policies(policy_id);
-- FK: fk_policy_assignment_user
ALTER TABLE file_policy_assignments ADD CONSTRAINT fk_policy_assignment_user FOREIGN KEY (assigned_by) REFERENCES users(id);
-- FK: fk_file_preview_file
ALTER TABLE file_preview_data ADD CONSTRAINT fk_file_preview_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: file_processing_artifacts_created_by_fkey
ALTER TABLE file_processing_artifacts ADD CONSTRAINT file_processing_artifacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: file_processing_artifacts_file_id_fkey
ALTER TABLE file_processing_artifacts ADD CONSTRAINT file_processing_artifacts_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: fk_file_quality_rules_file
ALTER TABLE file_quality_rules ADD CONSTRAINT fk_file_quality_rules_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: fk_file_quality_rules_rule
ALTER TABLE file_quality_rules ADD CONSTRAINT fk_file_quality_rules_rule FOREIGN KEY (quality_rule_id) REFERENCES quality_rules(id);
-- FK: file_restorations_archived_file_id_fkey
ALTER TABLE file_restorations ADD CONSTRAINT file_restorations_archived_file_id_fkey FOREIGN KEY (archived_file_id) REFERENCES archived_files(id);
-- FK: file_restorations_requested_by_fkey
ALTER TABLE file_restorations ADD CONSTRAINT file_restorations_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES users(id);
-- FK: file_schedules_sub_project_id_fkey
ALTER TABLE file_schedules ADD CONSTRAINT file_schedules_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FK: fk_file
ALTER TABLE file_schedules ADD CONSTRAINT fk_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: fk_file_schedules_project
ALTER TABLE file_schedules ADD CONSTRAINT fk_file_schedules_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: file_schemas_logical_file_id_fkey
ALTER TABLE file_schemas ADD CONSTRAINT file_schemas_logical_file_id_fkey FOREIGN KEY (logical_file_id) REFERENCES logical_file_groups(logical_file_id);
-- FK: fk_tag_assignment_file
ALTER TABLE file_tag_assignments ADD CONSTRAINT fk_tag_assignment_file FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: fk_tag_assignment_tag
ALTER TABLE file_tag_assignments ADD CONSTRAINT fk_tag_assignment_tag FOREIGN KEY (tag_id) REFERENCES governance_tags(tag_id);
-- FK: fk_tag_assignment_user
ALTER TABLE file_tag_assignments ADD CONSTRAINT fk_tag_assignment_user FOREIGN KEY (assigned_by) REFERENCES users(id);
-- FK: files_logical_file_id_fkey
ALTER TABLE files ADD CONSTRAINT files_logical_file_id_fkey FOREIGN KEY (logical_file_id) REFERENCES logical_file_groups(logical_file_id);
-- FK: files_parent_archive_id_fkey
ALTER TABLE files ADD CONSTRAINT files_parent_archive_id_fkey FOREIGN KEY (parent_archive_id) REFERENCES files(file_id);
-- FK: files_sub_project_id_fkey
ALTER TABLE files ADD CONSTRAINT files_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FK: files_vendor_agreement_id_fkey
ALTER TABLE files ADD CONSTRAINT files_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES vendor_agreements(id);
-- FK: fk_files_project
ALTER TABLE files ADD CONSTRAINT fk_files_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: fixed_width_schemas_created_by_fkey
ALTER TABLE fixed_width_schemas ADD CONSTRAINT fixed_width_schemas_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: fk_policy_creator
ALTER TABLE governance_policies ADD CONSTRAINT fk_policy_creator FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: fk_tag_creator
ALTER TABLE governance_tags ADD CONSTRAINT fk_tag_creator FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: group_policy_attachments_attached_by_fkey
ALTER TABLE group_policy_attachments ADD CONSTRAINT group_policy_attachments_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES users(id);
-- FK: group_policy_attachments_group_id_fkey
ALTER TABLE group_policy_attachments ADD CONSTRAINT group_policy_attachments_group_id_fkey FOREIGN KEY (group_id) REFERENCES access_groups(id);
-- FK: group_policy_attachments_policy_id_fkey
ALTER TABLE group_policy_attachments ADD CONSTRAINT group_policy_attachments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES rbac_policies(id);
-- FK: idempotency_keys_user_id_fkey
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: job_dependencies_depends_on_job_id_fkey
ALTER TABLE job_dependencies ADD CONSTRAINT job_dependencies_depends_on_job_id_fkey FOREIGN KEY (depends_on_job_id) REFERENCES file_schedules(id);
-- FK: job_dependencies_job_id_fkey
ALTER TABLE job_dependencies ADD CONSTRAINT job_dependencies_job_id_fkey FOREIGN KEY (job_id) REFERENCES file_schedules(id);
-- FK: job_group_dependencies_depends_on_group_id_fkey
ALTER TABLE job_group_dependencies ADD CONSTRAINT job_group_dependencies_depends_on_group_id_fkey FOREIGN KEY (depends_on_group_id) REFERENCES job_groups(id);
-- FK: job_group_dependencies_group_id_fkey
ALTER TABLE job_group_dependencies ADD CONSTRAINT job_group_dependencies_group_id_fkey FOREIGN KEY (group_id) REFERENCES job_groups(id);
-- FK: fk_job_group_schedules_project
ALTER TABLE job_group_schedules ADD CONSTRAINT fk_job_group_schedules_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: job_group_schedules_group_id_fkey
ALTER TABLE job_group_schedules ADD CONSTRAINT job_group_schedules_group_id_fkey FOREIGN KEY (group_id) REFERENCES job_groups(id);
-- FK: job_history_job_id_fkey
ALTER TABLE job_history ADD CONSTRAINT job_history_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id);
-- FK: job_runs_job_id_fkey
ALTER TABLE job_runs ADD CONSTRAINT job_runs_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id);
-- FK: fk_job_schedules_project
ALTER TABLE job_schedules ADD CONSTRAINT fk_job_schedules_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: jobs_created_by_fkey
ALTER TABLE jobs ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: lineage_views_project_id_fkey
ALTER TABLE lineage_views ADD CONSTRAINT lineage_views_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: lineage_views_user_id_fkey
ALTER TABLE lineage_views ADD CONSTRAINT lineage_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: logical_file_groups_project_id_fkey
ALTER TABLE logical_file_groups ADD CONSTRAINT logical_file_groups_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: fk_mapping_group_executions_project
ALTER TABLE mapping_group_executions ADD CONSTRAINT fk_mapping_group_executions_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: mapping_group_executions_group_id_fkey
ALTER TABLE mapping_group_executions ADD CONSTRAINT mapping_group_executions_group_id_fkey FOREIGN KEY (group_id) REFERENCES mapping_groups(id);
-- FK: mapping_group_members_group_id_fkey
ALTER TABLE mapping_group_members ADD CONSTRAINT mapping_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES mapping_groups(id);
-- FK: mapping_group_members_mapping_id_fkey
ALTER TABLE mapping_group_members ADD CONSTRAINT mapping_group_members_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES transformation_mappings(mapping_id);
-- FK: fk_mapping_groups_project
ALTER TABLE mapping_groups ADD CONSTRAINT fk_mapping_groups_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: mapping_groups_sub_project_id_fkey
ALTER TABLE mapping_groups ADD CONSTRAINT mapping_groups_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FK: n_step_workflow_assets_step_id_fkey
ALTER TABLE n_step_workflow_assets ADD CONSTRAINT n_step_workflow_assets_step_id_fkey FOREIGN KEY (step_id) REFERENCES n_step_workflow_steps(id);
-- FK: n_step_workflow_run_steps_run_id_fkey
ALTER TABLE n_step_workflow_run_steps ADD CONSTRAINT n_step_workflow_run_steps_run_id_fkey FOREIGN KEY (run_id) REFERENCES n_step_workflow_runs(id);
-- FK: n_step_workflow_runs_triggered_by_fkey
ALTER TABLE n_step_workflow_runs ADD CONSTRAINT n_step_workflow_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES users(id);
-- FK: n_step_workflow_runs_workflow_id_fkey
ALTER TABLE n_step_workflow_runs ADD CONSTRAINT n_step_workflow_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES n_step_workflows(id);
-- FK: n_step_workflow_steps_workflow_id_fkey
ALTER TABLE n_step_workflow_steps ADD CONSTRAINT n_step_workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES n_step_workflows(id);
-- FK: fk_n_step_workflows_project
ALTER TABLE n_step_workflows ADD CONSTRAINT fk_n_step_workflows_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: n_step_workflows_created_by_fkey
ALTER TABLE n_step_workflows ADD CONSTRAINT n_step_workflows_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: n_step_workflows_sub_project_id_fkey
ALTER TABLE n_step_workflows ADD CONSTRAINT n_step_workflows_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FK: notifications_user_id_fkey
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: password_reset_requests_approved_by_fkey
ALTER TABLE password_reset_requests ADD CONSTRAINT password_reset_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id);
-- FK: password_reset_requests_user_id_fkey
ALTER TABLE password_reset_requests ADD CONSTRAINT password_reset_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: processing_events_file_id_fkey
ALTER TABLE processing_events ADD CONSTRAINT processing_events_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: project_access_groups_added_by_fkey
ALTER TABLE project_access_groups ADD CONSTRAINT project_access_groups_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id);
-- FK: project_access_groups_group_id_fkey
ALTER TABLE project_access_groups ADD CONSTRAINT project_access_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES access_groups(id);
-- FK: project_access_groups_project_id_fkey
ALTER TABLE project_access_groups ADD CONSTRAINT project_access_groups_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: project_members_invited_by_fkey
ALTER TABLE project_members ADD CONSTRAINT project_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES users(id);
-- FK: project_members_project_id_fkey
ALTER TABLE project_members ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: project_members_user_id_fkey
ALTER TABLE project_members ADD CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: projects_owner_id_fkey
ALTER TABLE projects ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id);
-- FK: projects_parent_id_fkey
ALTER TABLE projects ADD CONSTRAINT projects_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES projects(id);
-- FK: quality_reports_file_id_fkey
ALTER TABLE quality_reports ADD CONSTRAINT quality_reports_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: quality_rule_configurations_created_by_fkey
ALTER TABLE quality_rule_configurations ADD CONSTRAINT quality_rule_configurations_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: quality_rule_configurations_rule_id_fkey
ALTER TABLE quality_rule_configurations ADD CONSTRAINT quality_rule_configurations_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES quality_rules(id);
-- FK: quality_rule_violations_resolved_by_fkey
ALTER TABLE quality_rule_violations ADD CONSTRAINT quality_rule_violations_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id);
-- FK: quality_rule_violations_rule_id_fkey
ALTER TABLE quality_rule_violations ADD CONSTRAINT quality_rule_violations_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES quality_rules(id);
-- FK: quality_rules_created_by_fkey
ALTER TABLE quality_rules ADD CONSTRAINT quality_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: quality_rules_sub_project_id_fkey
ALTER TABLE quality_rules ADD CONSTRAINT quality_rules_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FK: rbac_policies_created_by_fkey
ALTER TABLE rbac_policies ADD CONSTRAINT rbac_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: rbac_policies_project_id_fkey
ALTER TABLE rbac_policies ADD CONSTRAINT rbac_policies_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: refresh_tokens_user_id_fkey
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: resource_attributes_created_by_fkey
ALTER TABLE resource_attributes ADD CONSTRAINT resource_attributes_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: resource_policy_attachments_attached_by_fkey
ALTER TABLE resource_policy_attachments ADD CONSTRAINT resource_policy_attachments_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES users(id);
-- FK: resource_policy_attachments_policy_id_fkey
ALTER TABLE resource_policy_attachments ADD CONSTRAINT resource_policy_attachments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES rbac_policies(id);
-- FK: retention_policies_created_by_fkey
ALTER TABLE retention_policies ADD CONSTRAINT retention_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: retention_policy_runs_executed_by_fkey
ALTER TABLE retention_policy_runs ADD CONSTRAINT retention_policy_runs_executed_by_fkey FOREIGN KEY (executed_by) REFERENCES users(id);
-- FK: retention_policy_runs_policy_id_fkey
ALTER TABLE retention_policy_runs ADD CONSTRAINT retention_policy_runs_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES retention_policies(id);
-- FK: role_permissions_permission_id_fkey
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES permissions(id);
-- FK: role_permissions_role_id_fkey
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id);
-- FK: fk_schedules_project
ALTER TABLE schedules ADD CONSTRAINT fk_schedules_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: schedules_sub_project_id_fkey
ALTER TABLE schedules ADD CONSTRAINT schedules_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FK: schema_validation_job_files_job_id_fkey
ALTER TABLE schema_validation_job_files ADD CONSTRAINT schema_validation_job_files_job_id_fkey FOREIGN KEY (job_id) REFERENCES schema_validation_jobs(id);
-- FK: schema_validation_jobs_created_by_fkey
ALTER TABLE schema_validation_jobs ADD CONSTRAINT schema_validation_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: schema_validation_jobs_project_id_fkey
ALTER TABLE schema_validation_jobs ADD CONSTRAINT schema_validation_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: schema_validation_jobs_vendor_agreement_id_fkey
ALTER TABLE schema_validation_jobs ADD CONSTRAINT schema_validation_jobs_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES vendor_agreements(id);
-- FK: scim_resource_mappings_config_id_fkey
ALTER TABLE scim_resource_mappings ADD CONSTRAINT scim_resource_mappings_config_id_fkey FOREIGN KEY (config_id) REFERENCES scim_configurations(id);
-- FK: scim_sync_logs_config_id_fkey
ALTER TABLE scim_sync_logs ADD CONSTRAINT scim_sync_logs_config_id_fkey FOREIGN KEY (config_id) REFERENCES scim_configurations(id);
-- FK: fk_storage_connections_project
ALTER TABLE storage_connections ADD CONSTRAINT fk_storage_connections_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: storage_connections_deleted_by_fkey
ALTER TABLE storage_connections ADD CONSTRAINT storage_connections_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
-- FK: sub_project_access_groups_group_id_fkey
ALTER TABLE sub_project_access_groups ADD CONSTRAINT sub_project_access_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES access_groups(id);
-- FK: sub_project_access_groups_sub_project_id_fkey
ALTER TABLE sub_project_access_groups ADD CONSTRAINT sub_project_access_groups_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FK: sub_project_members_sub_project_id_fkey
ALTER TABLE sub_project_members ADD CONSTRAINT sub_project_members_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FK: sub_project_members_user_id_fkey
ALTER TABLE sub_project_members ADD CONSTRAINT sub_project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: fk_tag_permission_role
ALTER TABLE tag_permissions ADD CONSTRAINT fk_tag_permission_role FOREIGN KEY (role_id) REFERENCES roles(id);
-- FK: fk_tag_permission_tag
ALTER TABLE tag_permissions ADD CONSTRAINT fk_tag_permission_tag FOREIGN KEY (tag_id) REFERENCES governance_tags(tag_id);
-- FK: fk_transform_connections_project
ALTER TABLE transform_connections ADD CONSTRAINT fk_transform_connections_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: fk_transformation_jobs_project
ALTER TABLE transformation_jobs ADD CONSTRAINT fk_transformation_jobs_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: transformation_jobs_mapping_group_execution_id_fkey
ALTER TABLE transformation_jobs ADD CONSTRAINT transformation_jobs_mapping_group_execution_id_fkey FOREIGN KEY (mapping_group_execution_id) REFERENCES mapping_group_executions(id);
-- FK: transformation_jobs_mapping_id_fkey
ALTER TABLE transformation_jobs ADD CONSTRAINT transformation_jobs_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES transformation_mappings(mapping_id);
-- FK: transformation_jobs_visual_workflow_execution_id_fkey
ALTER TABLE transformation_jobs ADD CONSTRAINT transformation_jobs_visual_workflow_execution_id_fkey FOREIGN KEY (visual_workflow_execution_id) REFERENCES visual_workflow_executions(id);
-- FK: transformation_jobs_workflow_execution_id_fkey
ALTER TABLE transformation_jobs ADD CONSTRAINT transformation_jobs_workflow_execution_id_fkey FOREIGN KEY (workflow_execution_id) REFERENCES n_step_workflow_runs(id);
-- FK: transformation_logs_job_id_fkey
ALTER TABLE transformation_logs ADD CONSTRAINT transformation_logs_job_id_fkey FOREIGN KEY (job_id) REFERENCES transformation_jobs(job_id);
-- FK: fk_transformation_mappings_project
ALTER TABLE transformation_mappings ADD CONSTRAINT fk_transformation_mappings_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: transformation_mappings_sub_project_id_fkey
ALTER TABLE transformation_mappings ADD CONSTRAINT transformation_mappings_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FK: transformation_mappings_vendor_agreement_file_schema_id_fkey
ALTER TABLE transformation_mappings ADD CONSTRAINT transformation_mappings_vendor_agreement_file_schema_id_fkey FOREIGN KEY (vendor_agreement_file_schema_id) REFERENCES vendor_agreement_file_schemas(id);
-- FK: transformation_mappings_vendor_agreement_id_fkey
ALTER TABLE transformation_mappings ADD CONSTRAINT transformation_mappings_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES vendor_agreements(id);
-- FK: transformation_mappings_visual_mapping_id_fkey
ALTER TABLE transformation_mappings ADD CONSTRAINT transformation_mappings_visual_mapping_id_fkey FOREIGN KEY (visual_mapping_id) REFERENCES visual_mapping_defs(id);
-- FK: fk_transformation_quality_rules_mapping
ALTER TABLE transformation_quality_rules ADD CONSTRAINT fk_transformation_quality_rules_mapping FOREIGN KEY (mapping_id) REFERENCES transformation_mappings(mapping_id);
-- FK: fk_transformation_quality_rules_rule
ALTER TABLE transformation_quality_rules ADD CONSTRAINT fk_transformation_quality_rules_rule FOREIGN KEY (quality_rule_id) REFERENCES quality_rules(id);
-- FK: upload_batches_api_token_id_fkey
ALTER TABLE upload_batches ADD CONSTRAINT upload_batches_api_token_id_fkey FOREIGN KEY (api_token_id) REFERENCES api_tokens(id);
-- FK: upload_batches_project_id_fkey
ALTER TABLE upload_batches ADD CONSTRAINT upload_batches_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: upload_batches_user_id_fkey
ALTER TABLE upload_batches ADD CONSTRAINT upload_batches_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: upload_file_records_upload_file_id_fkey
ALTER TABLE upload_file_records ADD CONSTRAINT upload_file_records_upload_file_id_fkey FOREIGN KEY (upload_file_id) REFERENCES upload_files(id);
-- FK: upload_files_batch_id_fkey
ALTER TABLE upload_files ADD CONSTRAINT upload_files_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES upload_batches(id);
-- FK: user_attributes_created_by_fkey
ALTER TABLE user_attributes ADD CONSTRAINT user_attributes_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: user_attributes_user_id_fkey
ALTER TABLE user_attributes ADD CONSTRAINT user_attributes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: user_badges_file_id_fkey
ALTER TABLE user_badges ADD CONSTRAINT user_badges_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: user_groups_group_id_fkey
ALTER TABLE user_groups ADD CONSTRAINT user_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES access_groups(id);
-- FK: user_groups_user_id_fkey
ALTER TABLE user_groups ADD CONSTRAINT user_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: user_policy_attachments_attached_by_fkey
ALTER TABLE user_policy_attachments ADD CONSTRAINT user_policy_attachments_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES users(id);
-- FK: user_policy_attachments_policy_id_fkey
ALTER TABLE user_policy_attachments ADD CONSTRAINT user_policy_attachments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES rbac_policies(id);
-- FK: user_policy_attachments_user_id_fkey
ALTER TABLE user_policy_attachments ADD CONSTRAINT user_policy_attachments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: user_roles_role_id_fkey
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id);
-- FK: user_roles_user_id_fkey
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: user_sessions_user_id_fkey
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- FK: users_vendor_id_fkey
ALTER TABLE users ADD CONSTRAINT users_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
-- FK: vendor_agreement_approvals_agreement_id_fkey
ALTER TABLE vendor_agreement_approvals ADD CONSTRAINT vendor_agreement_approvals_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES vendor_agreements(id);
-- FK: vendor_agreement_approvals_approver_user_id_fkey
ALTER TABLE vendor_agreement_approvals ADD CONSTRAINT vendor_agreement_approvals_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES users(id);
-- FK: vendor_agreement_changes_agreement_id_fkey
ALTER TABLE vendor_agreement_changes ADD CONSTRAINT vendor_agreement_changes_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES vendor_agreements(id);
-- FK: vendor_agreement_changes_changed_by_fkey
ALTER TABLE vendor_agreement_changes ADD CONSTRAINT vendor_agreement_changes_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id);
-- FK: vendor_agreement_documents_agreement_id_fkey
ALTER TABLE vendor_agreement_documents ADD CONSTRAINT vendor_agreement_documents_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES vendor_agreements(id);
-- FK: vendor_agreement_documents_approval_id_fkey
ALTER TABLE vendor_agreement_documents ADD CONSTRAINT vendor_agreement_documents_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES vendor_agreement_approvals(id);
-- FK: vendor_agreement_documents_uploaded_by_fkey
ALTER TABLE vendor_agreement_documents ADD CONSTRAINT vendor_agreement_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id);
-- FK: vendor_agreement_file_schemas_created_by_fkey
ALTER TABLE vendor_agreement_file_schemas ADD CONSTRAINT vendor_agreement_file_schemas_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: vendor_agreement_file_schemas_updated_by_fkey
ALTER TABLE vendor_agreement_file_schemas ADD CONSTRAINT vendor_agreement_file_schemas_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
-- FK: vendor_agreement_file_schemas_vendor_agreement_id_fkey
ALTER TABLE vendor_agreement_file_schemas ADD CONSTRAINT vendor_agreement_file_schemas_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES vendor_agreements(id);
-- FK: vendor_agreements_created_by_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: vendor_agreements_file_owner_user_id_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_file_owner_user_id_fkey FOREIGN KEY (file_owner_user_id) REFERENCES users(id);
-- FK: vendor_agreements_governance_approved_by_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_governance_approved_by_fkey FOREIGN KEY (governance_approved_by) REFERENCES users(id);
-- FK: vendor_agreements_governance_manager_user_id_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_governance_manager_user_id_fkey FOREIGN KEY (governance_manager_user_id) REFERENCES users(id);
-- FK: vendor_agreements_owner_approved_by_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_owner_approved_by_fkey FOREIGN KEY (owner_approved_by) REFERENCES users(id);
-- FK: vendor_agreements_project_id_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: vendor_agreements_sub_project_id_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FK: vendor_agreements_updated_by_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
-- FK: vendor_agreements_vendor_approved_by_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_vendor_approved_by_fkey FOREIGN KEY (vendor_approved_by) REFERENCES users(id);
-- FK: vendor_agreements_vendor_connection_id_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_vendor_connection_id_fkey FOREIGN KEY (vendor_connection_id) REFERENCES storage_connections(connection_id);
-- FK: vendor_agreements_vendor_id_fkey
ALTER TABLE vendor_agreements ADD CONSTRAINT vendor_agreements_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
-- FK: vendor_file_profiling_results_connection_id_fkey
ALTER TABLE vendor_file_profiling_results ADD CONSTRAINT vendor_file_profiling_results_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES storage_connections(connection_id);
-- FK: vendor_file_profiling_results_file_id_fkey
ALTER TABLE vendor_file_profiling_results ADD CONSTRAINT vendor_file_profiling_results_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(file_id);
-- FK: vendor_file_profiling_results_uploaded_by_user_id_fkey
ALTER TABLE vendor_file_profiling_results ADD CONSTRAINT vendor_file_profiling_results_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id);
-- FK: vendor_file_profiling_results_vendor_id_fkey
ALTER TABLE vendor_file_profiling_results ADD CONSTRAINT vendor_file_profiling_results_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
-- FK: vendor_sla_violations_agreement_id_fkey
ALTER TABLE vendor_sla_violations ADD CONSTRAINT vendor_sla_violations_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES vendor_agreements(id);
-- FK: vendor_users_created_by_fkey
ALTER TABLE vendor_users ADD CONSTRAINT vendor_users_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: vendor_users_updated_by_fkey
ALTER TABLE vendor_users ADD CONSTRAINT vendor_users_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
-- FK: vendor_users_vendor_id_fkey
ALTER TABLE vendor_users ADD CONSTRAINT vendor_users_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);
-- FK: vendors_created_by_fkey
ALTER TABLE vendors ADD CONSTRAINT vendors_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: vendors_project_id_fkey
ALTER TABLE vendors ADD CONSTRAINT vendors_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: vendors_updated_by_fkey
ALTER TABLE vendors ADD CONSTRAINT vendors_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
-- FK: vendors_vendor_user_id_fkey
ALTER TABLE vendors ADD CONSTRAINT vendors_vendor_user_id_fkey FOREIGN KEY (vendor_user_id) REFERENCES users(id);
-- FK: visual_lineage_graphs_created_by_fkey
ALTER TABLE visual_lineage_graphs ADD CONSTRAINT visual_lineage_graphs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: visual_lineage_graphs_project_id_fkey
ALTER TABLE visual_lineage_graphs ADD CONSTRAINT visual_lineage_graphs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: visual_mapping_defs_created_by_fkey
ALTER TABLE visual_mapping_defs ADD CONSTRAINT visual_mapping_defs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: visual_mapping_defs_project_id_fkey
ALTER TABLE visual_mapping_defs ADD CONSTRAINT visual_mapping_defs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: visual_mapping_edges_mapping_id_fkey
ALTER TABLE visual_mapping_edges ADD CONSTRAINT visual_mapping_edges_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES visual_mapping_defs(id);
-- FK: visual_mapping_execution_logs_mapping_id_fkey
ALTER TABLE visual_mapping_execution_logs ADD CONSTRAINT visual_mapping_execution_logs_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES visual_mapping_defs(id);
-- FK: visual_mapping_executions_mapping_id_fkey
ALTER TABLE visual_mapping_executions ADD CONSTRAINT visual_mapping_executions_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES visual_mapping_defs(id);
-- FK: visual_mapping_executions_transformation_id_fkey
ALTER TABLE visual_mapping_executions ADD CONSTRAINT visual_mapping_executions_transformation_id_fkey FOREIGN KEY (transformation_id) REFERENCES transformation_mappings(id);
-- FK: visual_mapping_executions_triggered_by_fkey
ALTER TABLE visual_mapping_executions ADD CONSTRAINT visual_mapping_executions_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES users(id);
-- FK: visual_mapping_nodes_mapping_id_fkey
ALTER TABLE visual_mapping_nodes ADD CONSTRAINT visual_mapping_nodes_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES visual_mapping_defs(id);
-- FK: visual_workflow_execution_logs_workflow_id_fkey
ALTER TABLE visual_workflow_execution_logs ADD CONSTRAINT visual_workflow_execution_logs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES visual_workflows(id);
-- FK: visual_workflow_executions_project_id_fkey
ALTER TABLE visual_workflow_executions ADD CONSTRAINT visual_workflow_executions_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: visual_workflow_executions_triggered_by_fkey
ALTER TABLE visual_workflow_executions ADD CONSTRAINT visual_workflow_executions_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES users(id);
-- FK: visual_workflow_executions_workflow_id_fkey
ALTER TABLE visual_workflow_executions ADD CONSTRAINT visual_workflow_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES visual_workflows(id);
-- FK: visual_workflows_created_by_fkey
ALTER TABLE visual_workflows ADD CONSTRAINT visual_workflows_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
-- FK: visual_workflows_project_id_fkey
ALTER TABLE visual_workflows ADD CONSTRAINT visual_workflows_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: visual_workflows_sub_project_id_fkey
ALTER TABLE visual_workflows ADD CONSTRAINT visual_workflows_sub_project_id_fkey FOREIGN KEY (sub_project_id) REFERENCES projects(id);
-- FK: fk_workflow_executions_project
ALTER TABLE workflow_executions ADD CONSTRAINT fk_workflow_executions_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: workflow_executions_current_step_id_fkey
ALTER TABLE workflow_executions ADD CONSTRAINT workflow_executions_current_step_id_fkey FOREIGN KEY (current_step_id) REFERENCES workflow_steps(id);
-- FK: workflow_executions_workflow_id_fkey
ALTER TABLE workflow_executions ADD CONSTRAINT workflow_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES business_processes(id);
-- FK: fk_workflow_steps_project
ALTER TABLE workflow_steps ADD CONSTRAINT fk_workflow_steps_project FOREIGN KEY (project_id) REFERENCES projects(id);
-- FK: workflow_steps_depends_on_fkey
ALTER TABLE workflow_steps ADD CONSTRAINT workflow_steps_depends_on_fkey FOREIGN KEY (depends_on) REFERENCES workflow_steps(id);
-- FK: workflow_steps_workflow_id_fkey
ALTER TABLE workflow_steps ADD CONSTRAINT workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES business_processes(id);

-- =====================================================
-- SECTION 5: INDEXES
-- =====================================================

-- INDEX: access_group_members_pkey
CREATE UNIQUE INDEX access_group_members_pkey ON public.access_group_members USING btree (group_id, user_id);
-- INDEX: idx_access_group_members_group
CREATE INDEX idx_access_group_members_group ON public.access_group_members USING btree (group_id);
-- INDEX: idx_access_group_members_source
CREATE INDEX idx_access_group_members_source ON public.access_group_members USING btree (source);
-- INDEX: idx_access_group_members_user
CREATE INDEX idx_access_group_members_user ON public.access_group_members USING btree (user_id);
-- INDEX: access_group_roles_pkey
CREATE UNIQUE INDEX access_group_roles_pkey ON public.access_group_roles USING btree (id);
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
-- INDEX: access_groups_pkey
CREATE UNIQUE INDEX access_groups_pkey ON public.access_groups USING btree (id);
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
-- INDEX: alert_aggregation_pkey
CREATE UNIQUE INDEX alert_aggregation_pkey ON public.alert_aggregation USING btree (id);
-- INDEX: idx_alert_aggregation_policy_id
CREATE INDEX idx_alert_aggregation_policy_id ON public.alert_aggregation USING btree (policy_id);
-- INDEX: idx_alert_aggregation_ttl
CREATE INDEX idx_alert_aggregation_ttl ON public.alert_aggregation USING btree (aggregation_ttl);
-- INDEX: alert_attachments_pkey
CREATE UNIQUE INDEX alert_attachments_pkey ON public.alert_attachments USING btree (id);
-- INDEX: idx_alert_attachments_run_id
CREATE INDEX idx_alert_attachments_run_id ON public.alert_attachments USING btree (run_id);
-- INDEX: alert_events_pkey
CREATE UNIQUE INDEX alert_events_pkey ON public.alert_events USING btree (id);
-- INDEX: idx_alert_events_run_id
CREATE INDEX idx_alert_events_run_id ON public.alert_events USING btree (run_id);
-- INDEX: idx_alert_events_vendor_sla
CREATE INDEX idx_alert_events_vendor_sla ON public.alert_events USING btree (vendor_sla_violation_id) WHERE (vendor_sla_violation_id IS NOT NULL);
-- INDEX: alert_history_pkey
CREATE UNIQUE INDEX alert_history_pkey ON public.alert_history USING btree (id);
-- INDEX: alert_policies_pkey
CREATE UNIQUE INDEX alert_policies_pkey ON public.alert_policies USING btree (id);
-- INDEX: idx_alert_policies_entity
CREATE INDEX idx_alert_policies_entity ON public.alert_policies USING btree (entity_type, entity_id);
-- INDEX: idx_alert_policies_project_id
CREATE INDEX idx_alert_policies_project_id ON public.alert_policies USING btree (project_id);
-- INDEX: idx_alert_policies_vendor_sla
CREATE INDEX idx_alert_policies_vendor_sla ON public.alert_policies USING btree (entity_type, entity_id) WHERE (((entity_type)::text = 'vendor_sla'::text) AND (enabled = true));
-- INDEX: alert_policy_recipients_pkey
CREATE UNIQUE INDEX alert_policy_recipients_pkey ON public.alert_policy_recipients USING btree (id);
-- INDEX: idx_alert_policy_recipients_policy_id
CREATE INDEX idx_alert_policy_recipients_policy_id ON public.alert_policy_recipients USING btree (policy_id);
-- INDEX: alert_rules_pkey
CREATE UNIQUE INDEX alert_rules_pkey ON public.alert_rules USING btree (id);
-- INDEX: alert_runs_pkey
CREATE UNIQUE INDEX alert_runs_pkey ON public.alert_runs USING btree (id);
-- INDEX: idx_alert_runs_policy_id
CREATE INDEX idx_alert_runs_policy_id ON public.alert_runs USING btree (policy_id);
-- INDEX: allowed_email_domains_domain_key
CREATE UNIQUE INDEX allowed_email_domains_domain_key ON public.allowed_email_domains USING btree (domain);
-- INDEX: allowed_email_domains_pkey
CREATE UNIQUE INDEX allowed_email_domains_pkey ON public.allowed_email_domains USING btree (id);
-- INDEX: idx_allowed_email_domains_domain
CREATE INDEX idx_allowed_email_domains_domain ON public.allowed_email_domains USING btree (domain) WHERE (is_active = true);
-- INDEX: anomalies_anomaly_id_key
CREATE UNIQUE INDEX anomalies_anomaly_id_key ON public.anomalies USING btree (anomaly_id);
-- INDEX: anomalies_pkey
CREATE UNIQUE INDEX anomalies_pkey ON public.anomalies USING btree (id);
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
-- INDEX: api_tokens_pkey
CREATE UNIQUE INDEX api_tokens_pkey ON public.api_tokens USING btree (id);
-- INDEX: api_tokens_token_hash_key
CREATE UNIQUE INDEX api_tokens_token_hash_key ON public.api_tokens USING btree (token_hash);
-- INDEX: idx_api_tokens_active
CREATE INDEX idx_api_tokens_active ON public.api_tokens USING btree (is_active, expires_at);
-- INDEX: idx_api_tokens_token_hash
CREATE INDEX idx_api_tokens_token_hash ON public.api_tokens USING btree (token_hash);
-- INDEX: idx_api_tokens_user_project
CREATE INDEX idx_api_tokens_user_project ON public.api_tokens USING btree (user_id, project_id);
-- INDEX: app_settings_pkey
CREATE UNIQUE INDEX app_settings_pkey ON public.app_settings USING btree (id);
-- INDEX: app_settings_setting_key_key
CREATE UNIQUE INDEX app_settings_setting_key_key ON public.app_settings USING btree (setting_key);
-- INDEX: idx_app_settings_key
CREATE INDEX idx_app_settings_key ON public.app_settings USING btree (setting_key);
-- INDEX: archive_extractions_pkey
CREATE UNIQUE INDEX archive_extractions_pkey ON public.archive_extractions USING btree (id);
-- INDEX: idx_archive_extractions_failed
CREATE INDEX idx_archive_extractions_failed ON public.archive_extractions USING btree (extraction_status, password_required) WHERE ((extraction_status)::text = ANY ((ARRAY['failed'::character varying, 'password_required'::character varying])::text[]));
-- INDEX: idx_archive_extractions_file_id
CREATE INDEX idx_archive_extractions_file_id ON public.archive_extractions USING btree (file_id);
-- INDEX: idx_archive_extractions_status
CREATE INDEX idx_archive_extractions_status ON public.archive_extractions USING btree (extraction_status);
-- INDEX: archive_members_pkey
CREATE UNIQUE INDEX archive_members_pkey ON public.archive_members USING btree (id);
-- INDEX: idx_archive_members_extracted
CREATE INDEX idx_archive_members_extracted ON public.archive_members USING btree (extracted_file_id);
-- INDEX: idx_archive_members_parent
CREATE INDEX idx_archive_members_parent ON public.archive_members USING btree (parent_file_id);
-- INDEX: idx_archive_members_status
CREATE INDEX idx_archive_members_status ON public.archive_members USING btree (extraction_status);
-- INDEX: unique_archive_member
CREATE UNIQUE INDEX unique_archive_member ON public.archive_members USING btree (parent_file_id, logical_name);
-- INDEX: archived_files_pkey
CREATE UNIQUE INDEX archived_files_pkey ON public.archived_files USING btree (id);
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
-- INDEX: attribute_definitions_pkey
CREATE UNIQUE INDEX attribute_definitions_pkey ON public.attribute_definitions USING btree (id);
-- INDEX: idx_attribute_definitions_scope
CREATE INDEX idx_attribute_definitions_scope ON public.attribute_definitions USING btree (scope);
-- INDEX: idx_attribute_definitions_system
CREATE INDEX idx_attribute_definitions_system ON public.attribute_definitions USING btree (is_system);
-- INDEX: audit_ledger_entry_id_key
CREATE UNIQUE INDEX audit_ledger_entry_id_key ON public.audit_ledger USING btree (entry_id);
-- INDEX: audit_ledger_pkey
CREATE UNIQUE INDEX audit_ledger_pkey ON public.audit_ledger USING btree (id);
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
-- INDEX: audit_ledger_sequence_pkey
CREATE UNIQUE INDEX audit_ledger_sequence_pkey ON public.audit_ledger_sequence USING btree (tenant_id);
-- INDEX: audit_ledger_verification_pkey
CREATE UNIQUE INDEX audit_ledger_verification_pkey ON public.audit_ledger_verification USING btree (id);
-- INDEX: audit_log_pkey
CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (audit_id);
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
-- INDEX: audit_log_archive_pkey
CREATE UNIQUE INDEX audit_log_archive_pkey ON public.audit_log_archive USING btree (audit_id);
-- INDEX: idx_audit_log_archive_archived
CREATE INDEX idx_audit_log_archive_archived ON public.audit_log_archive USING btree (archived_at DESC);
-- INDEX: idx_audit_log_archive_timestamp
CREATE INDEX idx_audit_log_archive_timestamp ON public.audit_log_archive USING btree ("timestamp" DESC);
-- INDEX: idx_audit_log_archive_user
CREATE INDEX idx_audit_log_archive_user ON public.audit_log_archive USING btree (user_id, "timestamp" DESC);
-- INDEX: audit_retention_settings_pkey
CREATE UNIQUE INDEX audit_retention_settings_pkey ON public.audit_retention_settings USING btree (id);
-- INDEX: bulk_profiling_files_pkey
CREATE UNIQUE INDEX bulk_profiling_files_pkey ON public.bulk_profiling_files USING btree (id);
-- INDEX: idx_bulk_profiling_files_job_id
CREATE INDEX idx_bulk_profiling_files_job_id ON public.bulk_profiling_files USING btree (job_id);
-- INDEX: idx_bulk_profiling_files_status
CREATE INDEX idx_bulk_profiling_files_status ON public.bulk_profiling_files USING btree (status);
-- INDEX: bulk_profiling_jobs_pkey
CREATE UNIQUE INDEX bulk_profiling_jobs_pkey ON public.bulk_profiling_jobs USING btree (id);
-- INDEX: idx_bulk_profiling_jobs_created_by
CREATE INDEX idx_bulk_profiling_jobs_created_by ON public.bulk_profiling_jobs USING btree (created_by);
-- INDEX: idx_bulk_profiling_jobs_status
CREATE INDEX idx_bulk_profiling_jobs_status ON public.bulk_profiling_jobs USING btree (status);
-- INDEX: business_processes_pkey
CREATE UNIQUE INDEX business_processes_pkey ON public.business_processes USING btree (id);
-- INDEX: idx_business_processes_group_id
CREATE INDEX idx_business_processes_group_id ON public.business_processes USING btree (group_id);
-- INDEX: idx_business_processes_project_id
CREATE INDEX idx_business_processes_project_id ON public.business_processes USING btree (project_id);
-- INDEX: idx_business_processes_updated_at
CREATE INDEX idx_business_processes_updated_at ON public.business_processes USING btree (updated_at DESC);
-- INDEX: column_governance_tag_assignments_pkey
CREATE UNIQUE INDEX column_governance_tag_assignments_pkey ON public.column_governance_tag_assignments USING btree (assignment_id);
-- INDEX: idx_column_tag_column
CREATE INDEX idx_column_tag_column ON public.column_governance_tag_assignments USING btree (file_id, column_name);
-- INDEX: idx_column_tag_file_id
CREATE INDEX idx_column_tag_file_id ON public.column_governance_tag_assignments USING btree (file_id);
-- INDEX: unique_column_tag
CREATE UNIQUE INDEX unique_column_tag ON public.column_governance_tag_assignments USING btree (file_id, column_name, tag_id);
-- INDEX: column_mappings_pkey
CREATE UNIQUE INDEX column_mappings_pkey ON public.column_mappings USING btree (id);
-- INDEX: column_policy_assignments_pkey
CREATE UNIQUE INDEX column_policy_assignments_pkey ON public.column_policy_assignments USING btree (assignment_id);
-- INDEX: idx_column_policy_column
CREATE INDEX idx_column_policy_column ON public.column_policy_assignments USING btree (file_id, column_name);
-- INDEX: idx_column_policy_file_id
CREATE INDEX idx_column_policy_file_id ON public.column_policy_assignments USING btree (file_id);
-- INDEX: unique_column_policy
CREATE UNIQUE INDEX unique_column_policy ON public.column_policy_assignments USING btree (file_id, column_name, policy_id);
-- INDEX: column_sensitivity_tags_pkey
CREATE UNIQUE INDEX column_sensitivity_tags_pkey ON public.column_sensitivity_tags USING btree (tag_id);
-- INDEX: idx_column_tags_classification
CREATE INDEX idx_column_tags_classification ON public.column_sensitivity_tags USING btree (sensitivity_level);
-- INDEX: idx_column_tags_file_id
CREATE INDEX idx_column_tags_file_id ON public.column_sensitivity_tags USING btree (file_id);
-- INDEX: unique_file_column_tag
CREATE UNIQUE INDEX unique_file_column_tag ON public.column_sensitivity_tags USING btree (file_id, column_name);
-- INDEX: config_change_history_pkey
CREATE UNIQUE INDEX config_change_history_pkey ON public.config_change_history USING btree (change_id);
-- INDEX: idx_config_change_entity
CREATE INDEX idx_config_change_entity ON public.config_change_history USING btree (entity_type, entity_id, "timestamp" DESC);
-- INDEX: idx_config_change_timestamp
CREATE INDEX idx_config_change_timestamp ON public.config_change_history USING btree ("timestamp" DESC);
-- INDEX: idx_config_change_user
CREATE INDEX idx_config_change_user ON public.config_change_history USING btree (changed_by_user, "timestamp" DESC);
-- INDEX: config_change_history_archive_pkey
CREATE UNIQUE INDEX config_change_history_archive_pkey ON public.config_change_history_archive USING btree (change_id);
-- INDEX: idx_config_change_history_archive_archived
CREATE INDEX idx_config_change_history_archive_archived ON public.config_change_history_archive USING btree (archived_at DESC);
-- INDEX: idx_config_change_history_archive_timestamp
CREATE INDEX idx_config_change_history_archive_timestamp ON public.config_change_history_archive USING btree ("timestamp" DESC);
-- INDEX: connections_connection_name_key
CREATE UNIQUE INDEX connections_connection_name_key ON public.connections USING btree (connection_name);
-- INDEX: connections_pkey
CREATE UNIQUE INDEX connections_pkey ON public.connections USING btree (id);
-- INDEX: data_access_log_pkey
CREATE UNIQUE INDEX data_access_log_pkey ON public.data_access_log USING btree (access_id);
-- INDEX: idx_data_access_file
CREATE INDEX idx_data_access_file ON public.data_access_log USING btree (file_id, "timestamp" DESC);
-- INDEX: idx_data_access_pii
CREATE INDEX idx_data_access_pii ON public.data_access_log USING btree (contains_pii, "timestamp" DESC) WHERE (contains_pii = true);
-- INDEX: idx_data_access_timestamp
CREATE INDEX idx_data_access_timestamp ON public.data_access_log USING btree ("timestamp" DESC);
-- INDEX: idx_data_access_user
CREATE INDEX idx_data_access_user ON public.data_access_log USING btree (user_id, "timestamp" DESC);
-- INDEX: data_access_log_archive_pkey
CREATE UNIQUE INDEX data_access_log_archive_pkey ON public.data_access_log_archive USING btree (access_id);
-- INDEX: idx_data_access_log_archive_archived
CREATE INDEX idx_data_access_log_archive_archived ON public.data_access_log_archive USING btree (archived_at DESC);
-- INDEX: idx_data_access_log_archive_timestamp
CREATE INDEX idx_data_access_log_archive_timestamp ON public.data_access_log_archive USING btree ("timestamp" DESC);
-- INDEX: idx_data_access_log_archive_user
CREATE INDEX idx_data_access_log_archive_user ON public.data_access_log_archive USING btree (user_id, "timestamp" DESC);
-- INDEX: dbt_executions_execution_uuid_key
CREATE UNIQUE INDEX dbt_executions_execution_uuid_key ON public.dbt_executions USING btree (execution_uuid);
-- INDEX: dbt_executions_pkey
CREATE UNIQUE INDEX dbt_executions_pkey ON public.dbt_executions USING btree (execution_id);
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
-- INDEX: dbt_models_pkey
CREATE UNIQUE INDEX dbt_models_pkey ON public.dbt_models USING btree (model_id);
-- INDEX: idx_dbt_models_name
CREATE INDEX idx_dbt_models_name ON public.dbt_models USING btree (model_name);
-- INDEX: idx_dbt_models_status
CREATE INDEX idx_dbt_models_status ON public.dbt_models USING btree (last_run_status);
-- INDEX: idx_dbt_models_type
CREATE INDEX idx_dbt_models_type ON public.dbt_models USING btree (model_type);
-- INDEX: idx_dbt_models_updated
CREATE INDEX idx_dbt_models_updated ON public.dbt_models USING btree (updated_at DESC);
-- INDEX: dlq_jobs_pkey
CREATE UNIQUE INDEX dlq_jobs_pkey ON public.dlq_jobs USING btree (id);
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
-- INDEX: drop_location_config_pkey
CREATE UNIQUE INDEX drop_location_config_pkey ON public.drop_location_config USING btree (id);
-- INDEX: encrypted_passwords_pkey
CREATE UNIQUE INDEX encrypted_passwords_pkey ON public.encrypted_passwords USING btree (id);
-- INDEX: idx_encrypted_passwords_entity
CREATE INDEX idx_encrypted_passwords_entity ON public.encrypted_passwords USING btree (entity_type, entity_id);
-- INDEX: idx_encrypted_passwords_rotation
CREATE INDEX idx_encrypted_passwords_rotation ON public.encrypted_passwords USING btree (rotation_scheduled_at) WHERE (rotation_scheduled_at IS NOT NULL);
-- INDEX: unique_entity_password
CREATE UNIQUE INDEX unique_entity_password ON public.encrypted_passwords USING btree (entity_type, entity_id);
-- INDEX: execution_audit_pkey
CREATE UNIQUE INDEX execution_audit_pkey ON public.execution_audit USING btree (audit_id);
-- INDEX: idx_execution_audit_entity
CREATE INDEX idx_execution_audit_entity ON public.execution_audit USING btree (execution_type, entity_id);
-- INDEX: idx_execution_audit_execution
CREATE INDEX idx_execution_audit_execution ON public.execution_audit USING btree (execution_id, "timestamp" DESC);
-- INDEX: idx_execution_audit_status
CREATE INDEX idx_execution_audit_status ON public.execution_audit USING btree (new_status, "timestamp" DESC);
-- INDEX: execution_audit_archive_pkey
CREATE UNIQUE INDEX execution_audit_archive_pkey ON public.execution_audit_archive USING btree (audit_id);
-- INDEX: idx_execution_audit_archive_archived
CREATE INDEX idx_execution_audit_archive_archived ON public.execution_audit_archive USING btree (archived_at DESC);
-- INDEX: idx_execution_audit_archive_timestamp
CREATE INDEX idx_execution_audit_archive_timestamp ON public.execution_audit_archive USING btree ("timestamp" DESC);
-- INDEX: file_audit_details_pkey
CREATE UNIQUE INDEX file_audit_details_pkey ON public.file_audit_details USING btree (id);
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
-- INDEX: file_columns_pkey
CREATE UNIQUE INDEX file_columns_pkey ON public.file_columns USING btree (id);
-- INDEX: idx_file_columns_file_id
CREATE INDEX idx_file_columns_file_id ON public.file_columns USING btree (file_id);
-- INDEX: idx_file_columns_file_timestamp
CREATE INDEX idx_file_columns_file_timestamp ON public.file_columns USING btree (file_id, profile_timestamp DESC);
-- INDEX: file_errors_pkey
CREATE UNIQUE INDEX file_errors_pkey ON public.file_errors USING btree (id);
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
-- INDEX: file_history_pkey
CREATE UNIQUE INDEX file_history_pkey ON public.file_history USING btree (id);
-- INDEX: file_lineage_pkey
CREATE UNIQUE INDEX file_lineage_pkey ON public.file_lineage USING btree (id);
-- INDEX: file_mappings_pkey
CREATE UNIQUE INDEX file_mappings_pkey ON public.file_mappings USING btree (id);
-- INDEX: file_ownership_file_id_key
CREATE UNIQUE INDEX file_ownership_file_id_key ON public.file_ownership USING btree (file_id);
-- INDEX: file_ownership_pkey
CREATE UNIQUE INDEX file_ownership_pkey ON public.file_ownership USING btree (ownership_id);
-- INDEX: idx_file_ownership_file_id
CREATE INDEX idx_file_ownership_file_id ON public.file_ownership USING btree (file_id);
-- INDEX: idx_file_ownership_user_id
CREATE INDEX idx_file_ownership_user_id ON public.file_ownership USING btree (owner_user_id);
-- INDEX: file_pattern_metrics_file_pattern_metric_date_key
CREATE UNIQUE INDEX file_pattern_metrics_file_pattern_metric_date_key ON public.file_pattern_metrics USING btree (file_pattern, metric_date);
-- INDEX: file_pattern_metrics_pkey
CREATE UNIQUE INDEX file_pattern_metrics_pkey ON public.file_pattern_metrics USING btree (id);
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
-- INDEX: file_policy_assignments_pkey
CREATE UNIQUE INDEX file_policy_assignments_pkey ON public.file_policy_assignments USING btree (assignment_id);
-- INDEX: idx_policy_assignments_file_id
CREATE INDEX idx_policy_assignments_file_id ON public.file_policy_assignments USING btree (file_id);
-- INDEX: idx_policy_assignments_policy_id
CREATE INDEX idx_policy_assignments_policy_id ON public.file_policy_assignments USING btree (policy_id);
-- INDEX: unique_file_policy
CREATE UNIQUE INDEX unique_file_policy ON public.file_policy_assignments USING btree (file_id, policy_id);
-- INDEX: file_preview_data_pkey
CREATE UNIQUE INDEX file_preview_data_pkey ON public.file_preview_data USING btree (preview_id);
-- INDEX: idx_file_preview_data_created_at
CREATE INDEX idx_file_preview_data_created_at ON public.file_preview_data USING btree (created_at);
-- INDEX: idx_file_preview_data_file_id
CREATE INDEX idx_file_preview_data_file_id ON public.file_preview_data USING btree (file_id);
-- INDEX: unique_file_row
CREATE UNIQUE INDEX unique_file_row ON public.file_preview_data USING btree (file_id, row_number);
-- INDEX: file_processing_artifacts_pkey
CREATE UNIQUE INDEX file_processing_artifacts_pkey ON public.file_processing_artifacts USING btree (id);
-- INDEX: idx_artifacts_file_id
CREATE INDEX idx_artifacts_file_id ON public.file_processing_artifacts USING btree (file_id);
-- INDEX: idx_artifacts_type
CREATE INDEX idx_artifacts_type ON public.file_processing_artifacts USING btree (artifact_type);
-- INDEX: unique_file_artifact
CREATE UNIQUE INDEX unique_file_artifact ON public.file_processing_artifacts USING btree (file_id, artifact_type);
-- INDEX: file_quality_checks_pkey
CREATE UNIQUE INDEX file_quality_checks_pkey ON public.file_quality_checks USING btree (id);
-- INDEX: file_quality_rules_pkey
CREATE UNIQUE INDEX file_quality_rules_pkey ON public.file_quality_rules USING btree (id);
-- INDEX: idx_file_quality_rules_file_id
CREATE INDEX idx_file_quality_rules_file_id ON public.file_quality_rules USING btree (file_id);
-- INDEX: idx_file_quality_rules_rule_id
CREATE INDEX idx_file_quality_rules_rule_id ON public.file_quality_rules USING btree (quality_rule_id);
-- INDEX: unique_file_quality_rule
CREATE UNIQUE INDEX unique_file_quality_rule ON public.file_quality_rules USING btree (file_id, quality_rule_id);
-- INDEX: file_restorations_pkey
CREATE UNIQUE INDEX file_restorations_pkey ON public.file_restorations USING btree (id);
-- INDEX: idx_file_restorations_archived_file
CREATE INDEX idx_file_restorations_archived_file ON public.file_restorations USING btree (archived_file_id);
-- INDEX: idx_file_restorations_requested_at
CREATE INDEX idx_file_restorations_requested_at ON public.file_restorations USING btree (requested_at);
-- INDEX: idx_file_restorations_status
CREATE INDEX idx_file_restorations_status ON public.file_restorations USING btree (status);
-- INDEX: file_schedules_pkey
CREATE UNIQUE INDEX file_schedules_pkey ON public.file_schedules USING btree (id);
-- INDEX: idx_file_schedules_file_id
CREATE INDEX idx_file_schedules_file_id ON public.file_schedules USING btree (file_id);
-- INDEX: file_schema_details_file_id_file_schema_id_key
CREATE UNIQUE INDEX file_schema_details_file_id_file_schema_id_key ON public.file_schema_details USING btree (file_id, file_schema_id);
-- INDEX: file_schema_details_pkey
CREATE UNIQUE INDEX file_schema_details_pkey ON public.file_schema_details USING btree (id);
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
-- INDEX: file_schemas_pkey
CREATE UNIQUE INDEX file_schemas_pkey ON public.file_schemas USING btree (id);
-- INDEX: idx_file_schemas_file
CREATE INDEX idx_file_schemas_file ON public.file_schemas USING btree (file_id);
-- INDEX: idx_file_schemas_hash
CREATE INDEX idx_file_schemas_hash ON public.file_schemas USING btree (schema_hash);
-- INDEX: idx_file_schemas_logical_file
CREATE INDEX idx_file_schemas_logical_file ON public.file_schemas USING btree (logical_file_id, captured_at DESC);
-- INDEX: idx_file_schemas_pattern
CREATE INDEX idx_file_schemas_pattern ON public.file_schemas USING btree (file_pattern);
-- INDEX: file_tag_assignments_pkey
CREATE UNIQUE INDEX file_tag_assignments_pkey ON public.file_tag_assignments USING btree (assignment_id);
-- INDEX: idx_tag_assignments_file_id
CREATE INDEX idx_tag_assignments_file_id ON public.file_tag_assignments USING btree (file_id);
-- INDEX: idx_tag_assignments_tag_id
CREATE INDEX idx_tag_assignments_tag_id ON public.file_tag_assignments USING btree (tag_id);
-- INDEX: unique_file_tag
CREATE UNIQUE INDEX unique_file_tag ON public.file_tag_assignments USING btree (file_id, tag_id);
-- INDEX: files_file_id_key
CREATE UNIQUE INDEX files_file_id_key ON public.files USING btree (file_id);
-- INDEX: files_pkey
CREATE UNIQUE INDEX files_pkey ON public.files USING btree (id);
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
-- INDEX: fixed_width_schemas_pkey
CREATE UNIQUE INDEX fixed_width_schemas_pkey ON public.fixed_width_schemas USING btree (id);
-- INDEX: idx_fixed_width_schemas_file_id
CREATE INDEX idx_fixed_width_schemas_file_id ON public.fixed_width_schemas USING btree (file_id);
-- INDEX: frontend_audit_log_pkey
CREATE UNIQUE INDEX frontend_audit_log_pkey ON public.frontend_audit_log USING btree (audit_id);
-- INDEX: idx_frontend_audit_log_error
CREATE INDEX idx_frontend_audit_log_error ON public.frontend_audit_log USING btree ("timestamp" DESC) WHERE (error_message IS NOT NULL);
-- INDEX: idx_frontend_audit_log_event
CREATE INDEX idx_frontend_audit_log_event ON public.frontend_audit_log USING btree (event_type, "timestamp" DESC);
-- INDEX: idx_frontend_audit_log_timestamp
CREATE INDEX idx_frontend_audit_log_timestamp ON public.frontend_audit_log USING btree ("timestamp" DESC);
-- INDEX: idx_frontend_audit_log_user
CREATE INDEX idx_frontend_audit_log_user ON public.frontend_audit_log USING btree (user_id, "timestamp" DESC);
-- INDEX: governance_policies_pkey
CREATE UNIQUE INDEX governance_policies_pkey ON public.governance_policies USING btree (policy_id);
-- INDEX: governance_tags_pkey
CREATE UNIQUE INDEX governance_tags_pkey ON public.governance_tags USING btree (tag_id);
-- INDEX: governance_tags_tag_name_key
CREATE UNIQUE INDEX governance_tags_tag_name_key ON public.governance_tags USING btree (tag_name);
-- INDEX: group_policy_attachments_pkey
CREATE UNIQUE INDEX group_policy_attachments_pkey ON public.group_policy_attachments USING btree (group_id, policy_id);
-- INDEX: idx_group_policy_attachments_group
CREATE INDEX idx_group_policy_attachments_group ON public.group_policy_attachments USING btree (group_id);
-- INDEX: idx_group_policy_attachments_policy
CREATE INDEX idx_group_policy_attachments_policy ON public.group_policy_attachments USING btree (policy_id);
-- INDEX: groups_pkey
CREATE UNIQUE INDEX groups_pkey ON public.groups USING btree (id);
-- INDEX: idx_groups_name
CREATE INDEX idx_groups_name ON public.groups USING btree (name);
-- INDEX: idempotency_keys_key_key
CREATE UNIQUE INDEX idempotency_keys_key_key ON public.idempotency_keys USING btree (key);
-- INDEX: idempotency_keys_pkey
CREATE UNIQUE INDEX idempotency_keys_pkey ON public.idempotency_keys USING btree (id);
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
-- INDEX: job_dependencies_pkey
CREATE UNIQUE INDEX job_dependencies_pkey ON public.job_dependencies USING btree (dependency_id);
-- INDEX: unique_job_dependency
CREATE UNIQUE INDEX unique_job_dependency ON public.job_dependencies USING btree (job_id, depends_on_job_id);
-- INDEX: idx_job_group_dependencies_depends_on
CREATE INDEX idx_job_group_dependencies_depends_on ON public.job_group_dependencies USING btree (depends_on_group_id);
-- INDEX: idx_job_group_dependencies_group
CREATE INDEX idx_job_group_dependencies_group ON public.job_group_dependencies USING btree (group_id);
-- INDEX: job_group_dependencies_pkey
CREATE UNIQUE INDEX job_group_dependencies_pkey ON public.job_group_dependencies USING btree (group_dependency_id);
-- INDEX: unique_group_dependency
CREATE UNIQUE INDEX unique_group_dependency ON public.job_group_dependencies USING btree (group_id, depends_on_group_id);
-- INDEX: idx_job_group_jobs_group_id
CREATE INDEX idx_job_group_jobs_group_id ON public.job_group_jobs USING btree (group_id);
-- INDEX: idx_job_group_jobs_job_id
CREATE INDEX idx_job_group_jobs_job_id ON public.job_group_jobs USING btree (job_id);
-- INDEX: job_group_jobs_pkey
CREATE UNIQUE INDEX job_group_jobs_pkey ON public.job_group_jobs USING btree (group_id, job_id);
-- INDEX: idx_job_group_schedules_enabled
CREATE INDEX idx_job_group_schedules_enabled ON public.job_group_schedules USING btree (enabled) WHERE (enabled = true);
-- INDEX: idx_job_group_schedules_group
CREATE INDEX idx_job_group_schedules_group ON public.job_group_schedules USING btree (group_id);
-- INDEX: job_group_schedules_pkey
CREATE UNIQUE INDEX job_group_schedules_pkey ON public.job_group_schedules USING btree (group_schedule_id);
-- INDEX: job_groups_pkey
CREATE UNIQUE INDEX job_groups_pkey ON public.job_groups USING btree (id);
-- INDEX: job_history_pkey
CREATE UNIQUE INDEX job_history_pkey ON public.job_history USING btree (id);
-- INDEX: job_runs_pkey
CREATE UNIQUE INDEX job_runs_pkey ON public.job_runs USING btree (id);
-- INDEX: idx_job_schedules_job_id
CREATE INDEX idx_job_schedules_job_id ON public.job_schedules USING btree (job_id);
-- INDEX: job_schedules_pkey
CREATE UNIQUE INDEX job_schedules_pkey ON public.job_schedules USING btree (id);
-- INDEX: idx_jobs_business_process_id
CREATE INDEX idx_jobs_business_process_id ON public.jobs USING btree (business_process_id);
-- INDEX: idx_jobs_updated_at
CREATE INDEX idx_jobs_updated_at ON public.jobs USING btree (updated_at DESC);
-- INDEX: jobs_pkey
CREATE UNIQUE INDEX jobs_pkey ON public.jobs USING btree (id);
-- INDEX: idx_lineage_views_root
CREATE INDEX idx_lineage_views_root ON public.lineage_views USING btree (root_type, root_id);
-- INDEX: idx_lineage_views_user_id
CREATE INDEX idx_lineage_views_user_id ON public.lineage_views USING btree (user_id);
-- INDEX: lineage_views_pkey
CREATE UNIQUE INDEX lineage_views_pkey ON public.lineage_views USING btree (id);
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
-- INDEX: logical_file_groups_pkey
CREATE UNIQUE INDEX logical_file_groups_pkey ON public.logical_file_groups USING btree (id);
-- INDEX: logical_file_groups_project_id_canonical_name_key
CREATE UNIQUE INDEX logical_file_groups_project_id_canonical_name_key ON public.logical_file_groups USING btree (project_id, canonical_name);
-- INDEX: idx_mapping_group_executions_group_id
CREATE INDEX idx_mapping_group_executions_group_id ON public.mapping_group_executions USING btree (group_id);
-- INDEX: idx_mapping_group_executions_project_id
CREATE INDEX idx_mapping_group_executions_project_id ON public.mapping_group_executions USING btree (project_id);
-- INDEX: mapping_group_executions_pkey
CREATE UNIQUE INDEX mapping_group_executions_pkey ON public.mapping_group_executions USING btree (id);
-- INDEX: idx_mapping_group_members_group_id
CREATE INDEX idx_mapping_group_members_group_id ON public.mapping_group_members USING btree (group_id);
-- INDEX: idx_mapping_group_members_mapping_id
CREATE INDEX idx_mapping_group_members_mapping_id ON public.mapping_group_members USING btree (mapping_id);
-- INDEX: mapping_group_members_group_id_mapping_id_key
CREATE UNIQUE INDEX mapping_group_members_group_id_mapping_id_key ON public.mapping_group_members USING btree (group_id, mapping_id);
-- INDEX: mapping_group_members_pkey
CREATE UNIQUE INDEX mapping_group_members_pkey ON public.mapping_group_members USING btree (id);
-- INDEX: idx_mapping_groups_project_id
CREATE INDEX idx_mapping_groups_project_id ON public.mapping_groups USING btree (project_id);
-- INDEX: mapping_groups_pkey
CREATE UNIQUE INDEX mapping_groups_pkey ON public.mapping_groups USING btree (id);
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
-- INDEX: mapping_job_errors_pkey
CREATE UNIQUE INDEX mapping_job_errors_pkey ON public.mapping_job_errors USING btree (id);
-- INDEX: migrations_name_key
CREATE UNIQUE INDEX migrations_name_key ON public.migrations USING btree (name);
-- INDEX: migrations_pkey
CREATE UNIQUE INDEX migrations_pkey ON public.migrations USING btree (id);
-- INDEX: idx_mv_file_processing_day_type
CREATE UNIQUE INDEX idx_mv_file_processing_day_type ON public.mv_file_processing_summary USING btree (day, file_type);
-- INDEX: idx_mv_job_trends_hour_status
CREATE UNIQUE INDEX idx_mv_job_trends_hour_status ON public.mv_job_trends_hourly USING btree (hour, status);
-- INDEX: idx_n_step_workflow_assets_step
CREATE INDEX idx_n_step_workflow_assets_step ON public.n_step_workflow_assets USING btree (step_id);
-- INDEX: n_step_workflow_assets_pkey
CREATE UNIQUE INDEX n_step_workflow_assets_pkey ON public.n_step_workflow_assets USING btree (id);
-- INDEX: idx_n_step_workflow_run_steps_run
CREATE INDEX idx_n_step_workflow_run_steps_run ON public.n_step_workflow_run_steps USING btree (run_id);
-- INDEX: n_step_workflow_run_steps_pkey
CREATE UNIQUE INDEX n_step_workflow_run_steps_pkey ON public.n_step_workflow_run_steps USING btree (id);
-- INDEX: idx_n_step_workflow_runs_workflow
CREATE INDEX idx_n_step_workflow_runs_workflow ON public.n_step_workflow_runs USING btree (workflow_id);
-- INDEX: n_step_workflow_runs_pkey
CREATE UNIQUE INDEX n_step_workflow_runs_pkey ON public.n_step_workflow_runs USING btree (id);
-- INDEX: n_step_workflow_runs_run_id_key
CREATE UNIQUE INDEX n_step_workflow_runs_run_id_key ON public.n_step_workflow_runs USING btree (run_id);
-- INDEX: idx_n_step_workflow_steps_workflow
CREATE INDEX idx_n_step_workflow_steps_workflow ON public.n_step_workflow_steps USING btree (workflow_id);
-- INDEX: n_step_workflow_steps_pkey
CREATE UNIQUE INDEX n_step_workflow_steps_pkey ON public.n_step_workflow_steps USING btree (id);
-- INDEX: n_step_workflow_steps_workflow_id_step_index_key
CREATE UNIQUE INDEX n_step_workflow_steps_workflow_id_step_index_key ON public.n_step_workflow_steps USING btree (workflow_id, step_index);
-- INDEX: idx_n_step_workflows_project_id
CREATE INDEX idx_n_step_workflows_project_id ON public.n_step_workflows USING btree (project_id);
-- INDEX: n_step_workflows_pkey
CREATE UNIQUE INDEX n_step_workflows_pkey ON public.n_step_workflows USING btree (id);
-- INDEX: idx_notifications_entity
CREATE INDEX idx_notifications_entity ON public.notifications USING btree (entity_type, entity_id);
-- INDEX: idx_notifications_is_read
CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (user_id, is_read);
-- INDEX: idx_notifications_user_id
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
-- INDEX: notifications_pkey
CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);
-- INDEX: idx_password_reset_requests_status
CREATE INDEX idx_password_reset_requests_status ON public.password_reset_requests USING btree (status);
-- INDEX: idx_password_reset_requests_user
CREATE INDEX idx_password_reset_requests_user ON public.password_reset_requests USING btree (user_id);
-- INDEX: password_reset_requests_pkey
CREATE UNIQUE INDEX password_reset_requests_pkey ON public.password_reset_requests USING btree (id);
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
-- INDEX: permissions_pkey
CREATE UNIQUE INDEX permissions_pkey ON public.permissions USING btree (id);
-- INDEX: permissions_resource_action_key
CREATE UNIQUE INDEX permissions_resource_action_key ON public.permissions USING btree (resource, action);
-- INDEX: idx_policy_cache_expires
CREATE INDEX idx_policy_cache_expires ON public.policy_evaluation_cache USING btree (expires_at);
-- INDEX: idx_policy_cache_user
CREATE INDEX idx_policy_cache_user ON public.policy_evaluation_cache USING btree (user_id);
-- INDEX: policy_evaluation_cache_pkey
CREATE UNIQUE INDEX policy_evaluation_cache_pkey ON public.policy_evaluation_cache USING btree (cache_key);
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
-- INDEX: processing_events_pkey
CREATE UNIQUE INDEX processing_events_pkey ON public.processing_events USING btree (id);
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
-- INDEX: profiling_metrics_pkey
CREATE UNIQUE INDEX profiling_metrics_pkey ON public.profiling_metrics USING btree (id);
-- INDEX: idx_project_access_groups_group_project
CREATE INDEX idx_project_access_groups_group_project ON public.project_access_groups USING btree (group_id, project_id);
-- INDEX: project_access_groups_pkey
CREATE UNIQUE INDEX project_access_groups_pkey ON public.project_access_groups USING btree (project_id, group_id);
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
-- INDEX: projects_pkey
CREATE UNIQUE INDEX projects_pkey ON public.projects USING btree (id);
-- INDEX: quality_reports_pkey
CREATE UNIQUE INDEX quality_reports_pkey ON public.quality_reports USING btree (report_id);
-- INDEX: idx_quality_rule_configs_file
CREATE INDEX idx_quality_rule_configs_file ON public.quality_rule_configurations USING btree (file_id);
-- INDEX: idx_quality_rule_configs_rule
CREATE INDEX idx_quality_rule_configs_rule ON public.quality_rule_configurations USING btree (rule_id);
-- INDEX: quality_rule_configurations_pkey
CREATE UNIQUE INDEX quality_rule_configurations_pkey ON public.quality_rule_configurations USING btree (id);
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
-- INDEX: quality_rule_violations_pkey
CREATE UNIQUE INDEX quality_rule_violations_pkey ON public.quality_rule_violations USING btree (id);
-- INDEX: idx_quality_rules_enabled
CREATE INDEX idx_quality_rules_enabled ON public.quality_rules USING btree (enabled);
-- INDEX: idx_quality_rules_project_id
CREATE INDEX idx_quality_rules_project_id ON public.quality_rules USING btree (project_id);
-- INDEX: idx_quality_rules_type
CREATE INDEX idx_quality_rules_type ON public.quality_rules USING btree (rule_type);
-- INDEX: quality_rules_pkey
CREATE UNIQUE INDEX quality_rules_pkey ON public.quality_rules USING btree (id);
-- INDEX: idx_rbac_policies_active
CREATE INDEX idx_rbac_policies_active ON public.rbac_policies USING btree (is_active) WHERE (is_active = true);
-- INDEX: idx_rbac_policies_global
CREATE INDEX idx_rbac_policies_global ON public.rbac_policies USING btree (is_global) WHERE (is_global = true);
-- INDEX: idx_rbac_policies_project
CREATE INDEX idx_rbac_policies_project ON public.rbac_policies USING btree (project_id) WHERE (project_id IS NOT NULL);
-- INDEX: idx_rbac_policies_type
CREATE INDEX idx_rbac_policies_type ON public.rbac_policies USING btree (policy_type);
-- INDEX: rbac_policies_pkey
CREATE UNIQUE INDEX rbac_policies_pkey ON public.rbac_policies USING btree (id);
-- INDEX: unique_policy_name_per_project
CREATE UNIQUE INDEX unique_policy_name_per_project ON public.rbac_policies USING btree (name, project_id);
-- INDEX: idx_refresh_tokens_expires_at
CREATE INDEX idx_refresh_tokens_expires_at ON public.refresh_tokens USING btree (expires_at);
-- INDEX: idx_refresh_tokens_token_hash
CREATE INDEX idx_refresh_tokens_token_hash ON public.refresh_tokens USING btree (token);
-- INDEX: idx_refresh_tokens_user_id
CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);
-- INDEX: refresh_tokens_pkey
CREATE UNIQUE INDEX refresh_tokens_pkey ON public.refresh_tokens USING btree (id);
-- INDEX: refresh_tokens_token_hash_key
CREATE UNIQUE INDEX refresh_tokens_token_hash_key ON public.refresh_tokens USING btree (token);
-- INDEX: idx_resource_attributes_key
CREATE INDEX idx_resource_attributes_key ON public.resource_attributes USING btree (attribute_key);
-- INDEX: idx_resource_attributes_resource
CREATE INDEX idx_resource_attributes_resource ON public.resource_attributes USING btree (resource_type, resource_id);
-- INDEX: idx_resource_attributes_type
CREATE INDEX idx_resource_attributes_type ON public.resource_attributes USING btree (resource_type);
-- INDEX: resource_attributes_pkey
CREATE UNIQUE INDEX resource_attributes_pkey ON public.resource_attributes USING btree (id);
-- INDEX: unique_resource_attribute
CREATE UNIQUE INDEX unique_resource_attribute ON public.resource_attributes USING btree (resource_type, resource_id, attribute_key);
-- INDEX: idx_resource_policy_attachments_policy
CREATE INDEX idx_resource_policy_attachments_policy ON public.resource_policy_attachments USING btree (policy_id);
-- INDEX: idx_resource_policy_attachments_resource
CREATE INDEX idx_resource_policy_attachments_resource ON public.resource_policy_attachments USING btree (resource_type, resource_id);
-- INDEX: idx_resource_policy_attachments_type
CREATE INDEX idx_resource_policy_attachments_type ON public.resource_policy_attachments USING btree (resource_type);
-- INDEX: resource_policy_attachments_pkey
CREATE UNIQUE INDEX resource_policy_attachments_pkey ON public.resource_policy_attachments USING btree (resource_type, resource_id, policy_id);
-- INDEX: idx_retention_policies_enabled
CREATE INDEX idx_retention_policies_enabled ON public.retention_policies USING btree (enabled);
-- INDEX: idx_retention_policies_next_run
CREATE INDEX idx_retention_policies_next_run ON public.retention_policies USING btree (next_run_at) WHERE (enabled = true);
-- INDEX: idx_retention_policies_priority
CREATE INDEX idx_retention_policies_priority ON public.retention_policies USING btree (priority);
-- INDEX: retention_policies_pkey
CREATE UNIQUE INDEX retention_policies_pkey ON public.retention_policies USING btree (id);
-- INDEX: idx_retention_runs_policy
CREATE INDEX idx_retention_runs_policy ON public.retention_policy_runs USING btree (policy_id);
-- INDEX: idx_retention_runs_started_at
CREATE INDEX idx_retention_runs_started_at ON public.retention_policy_runs USING btree (started_at);
-- INDEX: idx_retention_runs_status
CREATE INDEX idx_retention_runs_status ON public.retention_policy_runs USING btree (status);
-- INDEX: retention_policy_runs_pkey
CREATE UNIQUE INDEX retention_policy_runs_pkey ON public.retention_policy_runs USING btree (id);
-- INDEX: idx_role_permissions_role_id_perm_id
CREATE INDEX idx_role_permissions_role_id_perm_id ON public.role_permissions USING btree (role_id, permission_id);
-- INDEX: role_permissions_pkey
CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (role_id, permission_id);
-- INDEX: idx_roles_name
CREATE INDEX idx_roles_name ON public.roles USING btree (name);
-- INDEX: roles_name_key
CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);
-- INDEX: roles_pkey
CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id);
-- INDEX: idx_schedules_entity
CREATE INDEX idx_schedules_entity ON public.schedules USING btree (entity_type, entity_id);
-- INDEX: idx_schedules_next_run
CREATE INDEX idx_schedules_next_run ON public.schedules USING btree (next_run) WHERE (is_active = true);
-- INDEX: idx_schedules_project_id
CREATE INDEX idx_schedules_project_id ON public.schedules USING btree (project_id);
-- INDEX: schedules_pkey
CREATE UNIQUE INDEX schedules_pkey ON public.schedules USING btree (id);
-- INDEX: schema_migrations_migration_name_key
CREATE UNIQUE INDEX schema_migrations_migration_name_key ON public.schema_migrations USING btree (migration_name);
-- INDEX: schema_migrations_pkey
CREATE UNIQUE INDEX schema_migrations_pkey ON public.schema_migrations USING btree (id);
-- INDEX: idx_schema_validation_job_files_job
CREATE INDEX idx_schema_validation_job_files_job ON public.schema_validation_job_files USING btree (job_id);
-- INDEX: schema_validation_job_files_pkey
CREATE UNIQUE INDEX schema_validation_job_files_pkey ON public.schema_validation_job_files USING btree (id);
-- INDEX: idx_schema_validation_jobs_project
CREATE INDEX idx_schema_validation_jobs_project ON public.schema_validation_jobs USING btree (project_id);
-- INDEX: idx_schema_validation_jobs_status
CREATE INDEX idx_schema_validation_jobs_status ON public.schema_validation_jobs USING btree (status);
-- INDEX: schema_validation_jobs_pkey
CREATE UNIQUE INDEX schema_validation_jobs_pkey ON public.schema_validation_jobs USING btree (id);
-- INDEX: idx_scim_configurations_active
CREATE INDEX idx_scim_configurations_active ON public.scim_configurations USING btree (is_active) WHERE (is_active = true);
-- INDEX: idx_scim_configurations_idp_type
CREATE INDEX idx_scim_configurations_idp_type ON public.scim_configurations USING btree (idp_type);
-- INDEX: scim_configurations_name_key
CREATE UNIQUE INDEX scim_configurations_name_key ON public.scim_configurations USING btree (name);
-- INDEX: scim_configurations_pkey
CREATE UNIQUE INDEX scim_configurations_pkey ON public.scim_configurations USING btree (id);
-- INDEX: idx_scim_mappings_config
CREATE INDEX idx_scim_mappings_config ON public.scim_resource_mappings USING btree (config_id);
-- INDEX: idx_scim_mappings_platform
CREATE INDEX idx_scim_mappings_platform ON public.scim_resource_mappings USING btree (platform_resource_type, platform_resource_id);
-- INDEX: idx_scim_mappings_scim_id
CREATE INDEX idx_scim_mappings_scim_id ON public.scim_resource_mappings USING btree (scim_id);
-- INDEX: scim_resource_mappings_pkey
CREATE UNIQUE INDEX scim_resource_mappings_pkey ON public.scim_resource_mappings USING btree (id);
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
-- INDEX: scim_sync_logs_pkey
CREATE UNIQUE INDEX scim_sync_logs_pkey ON public.scim_sync_logs USING btree (id);
-- INDEX: idx_security_audit_event
CREATE INDEX idx_security_audit_event ON public.security_audit_log USING btree (event_type, "timestamp" DESC);
-- INDEX: idx_security_audit_severity
CREATE INDEX idx_security_audit_severity ON public.security_audit_log USING btree (severity, "timestamp" DESC) WHERE ((severity)::text = ANY ((ARRAY['WARNING'::character varying, 'CRITICAL'::character varying])::text[]));
-- INDEX: idx_security_audit_timestamp
CREATE INDEX idx_security_audit_timestamp ON public.security_audit_log USING btree ("timestamp" DESC);
-- INDEX: idx_security_audit_user
CREATE INDEX idx_security_audit_user ON public.security_audit_log USING btree (user_id, "timestamp" DESC);
-- INDEX: security_audit_log_pkey
CREATE UNIQUE INDEX security_audit_log_pkey ON public.security_audit_log USING btree (security_audit_id);
-- INDEX: idx_security_audit_log_archive_archived
CREATE INDEX idx_security_audit_log_archive_archived ON public.security_audit_log_archive USING btree (archived_at DESC);
-- INDEX: idx_security_audit_log_archive_timestamp
CREATE INDEX idx_security_audit_log_archive_timestamp ON public.security_audit_log_archive USING btree ("timestamp" DESC);
-- INDEX: idx_security_audit_log_archive_user
CREATE INDEX idx_security_audit_log_archive_user ON public.security_audit_log_archive USING btree (user_id, "timestamp" DESC);
-- INDEX: security_audit_log_archive_pkey
CREATE UNIQUE INDEX security_audit_log_archive_pkey ON public.security_audit_log_archive USING btree (security_audit_id);
-- INDEX: idx_connections_name_unique_lower
CREATE UNIQUE INDEX idx_connections_name_unique_lower ON public.storage_connections USING btree (lower((name)::text));
-- INDEX: idx_storage_connections_auth_method
CREATE INDEX idx_storage_connections_auth_method ON public.storage_connections USING btree (authentication_method);
-- INDEX: idx_storage_connections_project_id
CREATE INDEX idx_storage_connections_project_id ON public.storage_connections USING btree (project_id);
-- INDEX: idx_storage_connections_user
CREATE INDEX idx_storage_connections_user ON public.storage_connections USING btree (connection_user);
-- INDEX: storage_connections_pkey
CREATE UNIQUE INDEX storage_connections_pkey ON public.storage_connections USING btree (connection_id);
-- INDEX: sub_project_access_groups_pkey
CREATE UNIQUE INDEX sub_project_access_groups_pkey ON public.sub_project_access_groups USING btree (id);
-- INDEX: sub_project_access_groups_sub_project_id_group_id_key
CREATE UNIQUE INDEX sub_project_access_groups_sub_project_id_group_id_key ON public.sub_project_access_groups USING btree (sub_project_id, group_id);
-- INDEX: sub_project_members_pkey
CREATE UNIQUE INDEX sub_project_members_pkey ON public.sub_project_members USING btree (id);
-- INDEX: sub_project_members_sub_project_id_user_id_key
CREATE UNIQUE INDEX sub_project_members_sub_project_id_user_id_key ON public.sub_project_members USING btree (sub_project_id, user_id);
-- INDEX: idx_tag_permissions_role_id
CREATE INDEX idx_tag_permissions_role_id ON public.tag_permissions USING btree (role_id);
-- INDEX: idx_tag_permissions_tag_id
CREATE INDEX idx_tag_permissions_tag_id ON public.tag_permissions USING btree (tag_id);
-- INDEX: tag_permissions_pkey
CREATE UNIQUE INDEX tag_permissions_pkey ON public.tag_permissions USING btree (id);
-- INDEX: unique_tag_role
CREATE UNIQUE INDEX unique_tag_role ON public.tag_permissions USING btree (tag_id, role_id);
-- INDEX: transform_connections_pkey
CREATE UNIQUE INDEX transform_connections_pkey ON public.transform_connections USING btree (id);
-- INDEX: transformation_executions_execution_id_key
CREATE UNIQUE INDEX transformation_executions_execution_id_key ON public.transformation_executions USING btree (execution_id);
-- INDEX: transformation_executions_pkey
CREATE UNIQUE INDEX transformation_executions_pkey ON public.transformation_executions USING btree (id);
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
-- INDEX: transformation_jobs_pkey
CREATE UNIQUE INDEX transformation_jobs_pkey ON public.transformation_jobs USING btree (id);
-- INDEX: idx_transformation_lineage_column_mappings
CREATE INDEX idx_transformation_lineage_column_mappings ON public.transformation_lineage USING gin (column_mappings);
-- INDEX: transformation_lineage_pkey
CREATE UNIQUE INDEX transformation_lineage_pkey ON public.transformation_lineage USING btree (id);
-- INDEX: idx_transformation_logs_job
CREATE INDEX idx_transformation_logs_job ON public.transformation_logs USING btree (job_id);
-- INDEX: idx_transformation_logs_level
CREATE INDEX idx_transformation_logs_level ON public.transformation_logs USING btree (log_level);
-- INDEX: idx_transformation_logs_timestamp
CREATE INDEX idx_transformation_logs_timestamp ON public.transformation_logs USING btree ("timestamp" DESC);
-- INDEX: transformation_logs_pkey
CREATE UNIQUE INDEX transformation_logs_pkey ON public.transformation_logs USING btree (id);
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
-- INDEX: transformation_mappings_pkey
CREATE UNIQUE INDEX transformation_mappings_pkey ON public.transformation_mappings USING btree (id);
-- INDEX: transformation_outputs_pkey
CREATE UNIQUE INDEX transformation_outputs_pkey ON public.transformation_outputs USING btree (id);
-- INDEX: idx_transformation_quality_rules_mapping_id
CREATE INDEX idx_transformation_quality_rules_mapping_id ON public.transformation_quality_rules USING btree (mapping_id);
-- INDEX: idx_transformation_quality_rules_rule_id
CREATE INDEX idx_transformation_quality_rules_rule_id ON public.transformation_quality_rules USING btree (quality_rule_id);
-- INDEX: transformation_quality_rules_pkey
CREATE UNIQUE INDEX transformation_quality_rules_pkey ON public.transformation_quality_rules USING btree (id);
-- INDEX: unique_transformation_quality_rule
CREATE UNIQUE INDEX unique_transformation_quality_rule ON public.transformation_quality_rules USING btree (mapping_id, quality_rule_id);
-- INDEX: transformations_pkey
CREATE UNIQUE INDEX transformations_pkey ON public.transformations USING btree (id);
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
-- INDEX: upload_batches_pkey
CREATE UNIQUE INDEX upload_batches_pkey ON public.upload_batches USING btree (id);
-- INDEX: idx_upload_file_records_file_status
CREATE INDEX idx_upload_file_records_file_status ON public.upload_file_records USING btree (upload_file_id, status);
-- INDEX: upload_file_records_pkey
CREATE UNIQUE INDEX upload_file_records_pkey ON public.upload_file_records USING btree (id);
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
-- INDEX: upload_files_pkey
CREATE UNIQUE INDEX upload_files_pkey ON public.upload_files USING btree (id);
-- INDEX: idx_user_attributes_key
CREATE INDEX idx_user_attributes_key ON public.user_attributes USING btree (attribute_key);
-- INDEX: idx_user_attributes_source
CREATE INDEX idx_user_attributes_source ON public.user_attributes USING btree (source);
-- INDEX: idx_user_attributes_user
CREATE INDEX idx_user_attributes_user ON public.user_attributes USING btree (user_id);
-- INDEX: unique_user_attribute
CREATE UNIQUE INDEX unique_user_attribute ON public.user_attributes USING btree (user_id, attribute_key);
-- INDEX: user_attributes_pkey
CREATE UNIQUE INDEX user_attributes_pkey ON public.user_attributes USING btree (id);
-- INDEX: user_badges_badge_id_key
CREATE UNIQUE INDEX user_badges_badge_id_key ON public.user_badges USING btree (badge_id);
-- INDEX: user_badges_pkey
CREATE UNIQUE INDEX user_badges_pkey ON public.user_badges USING btree (id);
-- INDEX: user_dashboard_settings_pkey
CREATE UNIQUE INDEX user_dashboard_settings_pkey ON public.user_dashboard_settings USING btree (id);
-- INDEX: idx_user_groups_group_id
CREATE INDEX idx_user_groups_group_id ON public.user_groups USING btree (group_id);
-- INDEX: idx_user_groups_user_group
CREATE INDEX idx_user_groups_user_group ON public.user_groups USING btree (user_id, group_id);
-- INDEX: idx_user_groups_user_id
CREATE INDEX idx_user_groups_user_id ON public.user_groups USING btree (user_id);
-- INDEX: user_groups_pkey
CREATE UNIQUE INDEX user_groups_pkey ON public.user_groups USING btree (user_id, group_id);
-- INDEX: user_job_groups_pkey
CREATE UNIQUE INDEX user_job_groups_pkey ON public.user_job_groups USING btree (user_id, group_id);
-- INDEX: idx_user_policy_attachments_policy
CREATE INDEX idx_user_policy_attachments_policy ON public.user_policy_attachments USING btree (policy_id);
-- INDEX: idx_user_policy_attachments_user
CREATE INDEX idx_user_policy_attachments_user ON public.user_policy_attachments USING btree (user_id);
-- INDEX: user_policy_attachments_pkey
CREATE UNIQUE INDEX user_policy_attachments_pkey ON public.user_policy_attachments USING btree (user_id, policy_id);
-- INDEX: idx_user_roles_user_id_role_id
CREATE INDEX idx_user_roles_user_id_role_id ON public.user_roles USING btree (user_id, role_id);
-- INDEX: user_roles_pkey
CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (user_id, role_id);
-- INDEX: user_sessions_pkey
CREATE UNIQUE INDEX user_sessions_pkey ON public.user_sessions USING btree (id);
-- INDEX: user_sessions_token_key
CREATE UNIQUE INDEX user_sessions_token_key ON public.user_sessions USING btree (token);
-- INDEX: user_uuid_mapping_pkey
CREATE UNIQUE INDEX user_uuid_mapping_pkey ON public.user_uuid_mapping USING btree (user_id);
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
-- INDEX: users_pkey
CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);
-- INDEX: users_unique
CREATE UNIQUE INDEX users_unique ON public.users USING btree (okta_id);
-- INDEX: users_username_lower_idx
CREATE UNIQUE INDEX users_username_lower_idx ON public.users USING btree (lower((username)::text));
-- INDEX: idx_vendor_agreement_approvals_agreement_id
CREATE INDEX idx_vendor_agreement_approvals_agreement_id ON public.vendor_agreement_approvals USING btree (agreement_id);
-- INDEX: idx_vendor_agreement_approvals_approver
CREATE INDEX idx_vendor_agreement_approvals_approver ON public.vendor_agreement_approvals USING btree (approver_user_id);
-- INDEX: vendor_agreement_approvals_pkey
CREATE UNIQUE INDEX vendor_agreement_approvals_pkey ON public.vendor_agreement_approvals USING btree (id);
-- INDEX: idx_vendor_agreement_changes_agreement_id
CREATE INDEX idx_vendor_agreement_changes_agreement_id ON public.vendor_agreement_changes USING btree (agreement_id);
-- INDEX: idx_vendor_agreement_changes_changed_by
CREATE INDEX idx_vendor_agreement_changes_changed_by ON public.vendor_agreement_changes USING btree (changed_by);
-- INDEX: vendor_agreement_changes_pkey
CREATE UNIQUE INDEX vendor_agreement_changes_pkey ON public.vendor_agreement_changes USING btree (id);
-- INDEX: idx_vendor_agreement_documents_agreement
CREATE INDEX idx_vendor_agreement_documents_agreement ON public.vendor_agreement_documents USING btree (agreement_id);
-- INDEX: idx_vendor_agreement_documents_approval
CREATE INDEX idx_vendor_agreement_documents_approval ON public.vendor_agreement_documents USING btree (approval_id);
-- INDEX: vendor_agreement_documents_pkey
CREATE UNIQUE INDEX vendor_agreement_documents_pkey ON public.vendor_agreement_documents USING btree (id);
-- INDEX: idx_file_schemas_column_metadata
CREATE INDEX idx_file_schemas_column_metadata ON public.vendor_agreement_file_schemas USING gin (column_metadata);
-- INDEX: idx_file_schemas_quality_rules
CREATE INDEX idx_file_schemas_quality_rules ON public.vendor_agreement_file_schemas USING gin (quality_rule_ids);
-- INDEX: idx_vendor_agreement_file_schemas_agreement_id
CREATE INDEX idx_vendor_agreement_file_schemas_agreement_id ON public.vendor_agreement_file_schemas USING btree (vendor_agreement_id);
-- INDEX: idx_vendor_agreement_file_schemas_priority
CREATE INDEX idx_vendor_agreement_file_schemas_priority ON public.vendor_agreement_file_schemas USING btree (vendor_agreement_id, priority, is_active);
-- INDEX: vendor_agreement_file_schemas_pkey
CREATE UNIQUE INDEX vendor_agreement_file_schemas_pkey ON public.vendor_agreement_file_schemas USING btree (id);
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
-- INDEX: vendor_agreements_pkey
CREATE UNIQUE INDEX vendor_agreements_pkey ON public.vendor_agreements USING btree (id);
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
-- INDEX: vendor_file_profiling_results_pkey
CREATE UNIQUE INDEX vendor_file_profiling_results_pkey ON public.vendor_file_profiling_results USING btree (id);
-- INDEX: idx_vendor_sla_violations_agreement_id
CREATE INDEX idx_vendor_sla_violations_agreement_id ON public.vendor_sla_violations USING btree (agreement_id);
-- INDEX: idx_vendor_sla_violations_alert_sent
CREATE INDEX idx_vendor_sla_violations_alert_sent ON public.vendor_sla_violations USING btree (alert_sent) WHERE (alert_sent = false);
-- INDEX: idx_vendor_sla_violations_resolved
CREATE INDEX idx_vendor_sla_violations_resolved ON public.vendor_sla_violations USING btree (resolved) WHERE (resolved = false);
-- INDEX: vendor_sla_violations_pkey
CREATE UNIQUE INDEX vendor_sla_violations_pkey ON public.vendor_sla_violations USING btree (id);
-- INDEX: idx_vendor_users_email
CREATE INDEX idx_vendor_users_email ON public.vendor_users USING btree (email);
-- INDEX: idx_vendor_users_is_active
CREATE INDEX idx_vendor_users_is_active ON public.vendor_users USING btree (is_active);
-- INDEX: idx_vendor_users_vendor_id
CREATE INDEX idx_vendor_users_vendor_id ON public.vendor_users USING btree (vendor_id);
-- INDEX: vendor_users_pkey
CREATE UNIQUE INDEX vendor_users_pkey ON public.vendor_users USING btree (id);
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
-- INDEX: vendors_pkey
CREATE UNIQUE INDEX vendors_pkey ON public.vendors USING btree (id);
-- INDEX: idx_visual_lineage_graphs_created_by
CREATE INDEX idx_visual_lineage_graphs_created_by ON public.visual_lineage_graphs USING btree (created_by);
-- INDEX: idx_visual_lineage_graphs_is_active
CREATE INDEX idx_visual_lineage_graphs_is_active ON public.visual_lineage_graphs USING btree (is_active);
-- INDEX: idx_visual_lineage_graphs_project
CREATE INDEX idx_visual_lineage_graphs_project ON public.visual_lineage_graphs USING btree (project_id);
-- INDEX: visual_lineage_graphs_pkey
CREATE UNIQUE INDEX visual_lineage_graphs_pkey ON public.visual_lineage_graphs USING btree (id);
-- INDEX: idx_visual_mapping_defs_active
CREATE INDEX idx_visual_mapping_defs_active ON public.visual_mapping_defs USING btree (is_active);
-- INDEX: idx_visual_mapping_defs_project
CREATE INDEX idx_visual_mapping_defs_project ON public.visual_mapping_defs USING btree (project_id);
-- INDEX: visual_mapping_defs_pkey
CREATE UNIQUE INDEX visual_mapping_defs_pkey ON public.visual_mapping_defs USING btree (id);
-- INDEX: idx_visual_mapping_edges_mapping
CREATE INDEX idx_visual_mapping_edges_mapping ON public.visual_mapping_edges USING btree (mapping_id);
-- INDEX: visual_mapping_edges_mapping_id_edge_id_key
CREATE UNIQUE INDEX visual_mapping_edges_mapping_id_edge_id_key ON public.visual_mapping_edges USING btree (mapping_id, edge_id);
-- INDEX: visual_mapping_edges_pkey
CREATE UNIQUE INDEX visual_mapping_edges_pkey ON public.visual_mapping_edges USING btree (id);
-- INDEX: idx_visual_mapping_exec_logs_exec_id
CREATE INDEX idx_visual_mapping_exec_logs_exec_id ON public.visual_mapping_execution_logs USING btree (execution_id);
-- INDEX: idx_visual_mapping_exec_logs_mapping
CREATE INDEX idx_visual_mapping_exec_logs_mapping ON public.visual_mapping_execution_logs USING btree (mapping_id);
-- INDEX: idx_visual_mapping_exec_logs_started
CREATE INDEX idx_visual_mapping_exec_logs_started ON public.visual_mapping_execution_logs USING btree (started_at DESC);
-- INDEX: visual_mapping_execution_logs_pkey
CREATE UNIQUE INDEX visual_mapping_execution_logs_pkey ON public.visual_mapping_execution_logs USING btree (id);
-- INDEX: idx_visual_mapping_executions_mapping
CREATE INDEX idx_visual_mapping_executions_mapping ON public.visual_mapping_executions USING btree (mapping_id);
-- INDEX: idx_visual_mapping_executions_status
CREATE INDEX idx_visual_mapping_executions_status ON public.visual_mapping_executions USING btree (status);
-- INDEX: visual_mapping_executions_execution_id_key
CREATE UNIQUE INDEX visual_mapping_executions_execution_id_key ON public.visual_mapping_executions USING btree (execution_id);
-- INDEX: visual_mapping_executions_pkey
CREATE UNIQUE INDEX visual_mapping_executions_pkey ON public.visual_mapping_executions USING btree (id);
-- INDEX: idx_visual_mapping_nodes_mapping
CREATE INDEX idx_visual_mapping_nodes_mapping ON public.visual_mapping_nodes USING btree (mapping_id);
-- INDEX: visual_mapping_nodes_mapping_id_node_id_key
CREATE UNIQUE INDEX visual_mapping_nodes_mapping_id_node_id_key ON public.visual_mapping_nodes USING btree (mapping_id, node_id);
-- INDEX: visual_mapping_nodes_pkey
CREATE UNIQUE INDEX visual_mapping_nodes_pkey ON public.visual_mapping_nodes USING btree (id);
-- INDEX: idx_visual_workflow_exec_logs_exec_id
CREATE INDEX idx_visual_workflow_exec_logs_exec_id ON public.visual_workflow_execution_logs USING btree (execution_id);
-- INDEX: idx_visual_workflow_execution_logs_started_at
CREATE INDEX idx_visual_workflow_execution_logs_started_at ON public.visual_workflow_execution_logs USING btree (started_at DESC);
-- INDEX: idx_visual_workflow_execution_logs_workflow_id
CREATE INDEX idx_visual_workflow_execution_logs_workflow_id ON public.visual_workflow_execution_logs USING btree (workflow_id);
-- INDEX: visual_workflow_execution_logs_pkey
CREATE UNIQUE INDEX visual_workflow_execution_logs_pkey ON public.visual_workflow_execution_logs USING btree (id);
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
-- INDEX: visual_workflow_executions_pkey
CREATE UNIQUE INDEX visual_workflow_executions_pkey ON public.visual_workflow_executions USING btree (id);
-- INDEX: idx_visual_workflows_created_by
CREATE INDEX idx_visual_workflows_created_by ON public.visual_workflows USING btree (created_by);
-- INDEX: idx_visual_workflows_is_active
CREATE INDEX idx_visual_workflows_is_active ON public.visual_workflows USING btree (is_active);
-- INDEX: idx_visual_workflows_project_id
CREATE INDEX idx_visual_workflows_project_id ON public.visual_workflows USING btree (project_id);
-- INDEX: idx_visual_workflows_sub_project_id
CREATE INDEX idx_visual_workflows_sub_project_id ON public.visual_workflows USING btree (sub_project_id);
-- INDEX: visual_workflows_pkey
CREATE UNIQUE INDEX visual_workflows_pkey ON public.visual_workflows USING btree (id);
-- INDEX: idx_workflow_executions_project_id
CREATE INDEX idx_workflow_executions_project_id ON public.workflow_executions USING btree (project_id);
-- INDEX: idx_workflow_executions_workflow_id
CREATE INDEX idx_workflow_executions_workflow_id ON public.workflow_executions USING btree (workflow_id);
-- INDEX: workflow_executions_pkey
CREATE UNIQUE INDEX workflow_executions_pkey ON public.workflow_executions USING btree (id);
-- INDEX: idx_workflow_steps_depends_on
CREATE INDEX idx_workflow_steps_depends_on ON public.workflow_steps USING btree (depends_on);
-- INDEX: idx_workflow_steps_project_id
CREATE INDEX idx_workflow_steps_project_id ON public.workflow_steps USING btree (project_id);
-- INDEX: idx_workflow_steps_workflow_id
CREATE INDEX idx_workflow_steps_workflow_id ON public.workflow_steps USING btree (workflow_id);
-- INDEX: workflow_steps_pkey
CREATE UNIQUE INDEX workflow_steps_pkey ON public.workflow_steps USING btree (id);
