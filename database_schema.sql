--
-- PostgreSQL database dump
--

-- Dumped from database version 16.9 (165f042)
-- Dumped by pg_dump version 16.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

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
-- Name: business_processes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_processes (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    group_id integer,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
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
    last_used_at timestamp with time zone
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
    min_value_decimal numeric(10,2),
    max_value_decimal numeric(10,2),
    top_values json,
    most_frequent_count integer,
    least_frequent_count integer,
    min_frequency integer,
    max_frequency integer,
    min_is_frequent boolean,
    max_is_frequent boolean,
    patterns jsonb
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
    created_by character varying(255)
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
    captured_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
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
    schema_definition jsonb
);


--
-- Name: files_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.files_id_seq OWNED BY public.files.id;


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
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
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
    source_connection_id integer,
    target_connection_id integer,
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
    status text DEFAULT 'active'::text
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
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
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
    job_id character varying(255)
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
    CONSTRAINT schedules_entity_type_check CHECK ((entity_type = ANY (ARRAY['mapping'::text, 'mapping_group'::text, 'workflow'::text]))),
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
    connection_direction character varying(20) DEFAULT 'source'::character varying
);


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
    source_application character varying(50) DEFAULT 'data_observatory'::character varying
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
    workflow_execution_id integer
);


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
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


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
    source_connection_id integer,
    source_file_pattern character varying(500) NOT NULL,
    source_schema jsonb,
    field_mappings jsonb DEFAULT '[]'::jsonb NOT NULL,
    target_connection_id integer,
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
    file_name_pattern text
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
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
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
    password character varying(500) NOT NULL,
    email character varying(255),
    full_name character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_login timestamp without time zone
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
-- Name: alert_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_history ALTER COLUMN id SET DEFAULT nextval('public.alert_history_id_seq'::regclass);


--
-- Name: alert_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_rules ALTER COLUMN id SET DEFAULT nextval('public.alert_rules_id_seq'::regclass);


--
-- Name: anomalies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anomalies ALTER COLUMN id SET DEFAULT nextval('public.anomalies_id_seq'::regclass);


--
-- Name: audit_log audit_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN audit_id SET DEFAULT nextval('public.audit_log_audit_id_seq'::regclass);


--
-- Name: business_processes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_processes ALTER COLUMN id SET DEFAULT nextval('public.business_processes_id_seq'::regclass);


--
-- Name: column_mappings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.column_mappings ALTER COLUMN id SET DEFAULT nextval('public.column_mappings_id_seq'::regclass);


--
-- Name: config_change_history change_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_change_history ALTER COLUMN change_id SET DEFAULT nextval('public.config_change_history_change_id_seq'::regclass);


--
-- Name: connections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections ALTER COLUMN id SET DEFAULT nextval('public.connections_id_seq'::regclass);


--
-- Name: data_access_log access_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_access_log ALTER COLUMN access_id SET DEFAULT nextval('public.data_access_log_access_id_seq'::regclass);


--
-- Name: dbt_executions execution_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbt_executions ALTER COLUMN execution_id SET DEFAULT nextval('public.dbt_executions_execution_id_seq'::regclass);


--
-- Name: dbt_models model_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbt_models ALTER COLUMN model_id SET DEFAULT nextval('public.dbt_models_model_id_seq'::regclass);


--
-- Name: drop_location_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_location_config ALTER COLUMN id SET DEFAULT nextval('public.drop_location_config_id_seq'::regclass);


--
-- Name: execution_audit audit_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_audit ALTER COLUMN audit_id SET DEFAULT nextval('public.execution_audit_audit_id_seq'::regclass);


--
-- Name: file_columns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_columns ALTER COLUMN id SET DEFAULT nextval('public.file_columns_id_seq'::regclass);


--
-- Name: file_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_history ALTER COLUMN id SET DEFAULT nextval('public.file_history_id_seq'::regclass);


--
-- Name: file_lineage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_lineage ALTER COLUMN id SET DEFAULT nextval('public.file_lineage_id_seq'::regclass);


--
-- Name: file_mappings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_mappings ALTER COLUMN id SET DEFAULT nextval('public.file_mappings_id_seq'::regclass);


--
-- Name: file_quality_checks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_quality_checks ALTER COLUMN id SET DEFAULT nextval('public.file_quality_checks_id_seq'::regclass);


--
-- Name: file_schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_schedules ALTER COLUMN id SET DEFAULT nextval('public.file_schedules_id_seq'::regclass);


--
-- Name: file_schemas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_schemas ALTER COLUMN id SET DEFAULT nextval('public.file_schemas_id_seq'::regclass);


--
-- Name: files id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files ALTER COLUMN id SET DEFAULT nextval('public.files_id_seq'::regclass);


--
-- Name: groups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups ALTER COLUMN id SET DEFAULT nextval('public.groups_id_seq'::regclass);


--
-- Name: job_dependencies dependency_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_dependencies ALTER COLUMN dependency_id SET DEFAULT nextval('public.job_dependencies_dependency_id_seq'::regclass);


--
-- Name: job_group_dependencies group_dependency_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_group_dependencies ALTER COLUMN group_dependency_id SET DEFAULT nextval('public.job_group_dependencies_group_dependency_id_seq'::regclass);


--
-- Name: job_group_schedules group_schedule_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_group_schedules ALTER COLUMN group_schedule_id SET DEFAULT nextval('public.job_group_schedules_group_schedule_id_seq'::regclass);


--
-- Name: job_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_history ALTER COLUMN id SET DEFAULT nextval('public.job_history_id_seq'::regclass);


--
-- Name: job_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_runs ALTER COLUMN id SET DEFAULT nextval('public.job_runs_id_seq'::regclass);


--
-- Name: job_schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_schedules ALTER COLUMN id SET DEFAULT nextval('public.job_schedules_id_seq'::regclass);


--
-- Name: jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs ALTER COLUMN id SET DEFAULT nextval('public.jobs_id_seq'::regclass);


--
-- Name: mapping_group_executions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mapping_group_executions ALTER COLUMN id SET DEFAULT nextval('public.mapping_group_executions_id_seq'::regclass);


--
-- Name: mapping_group_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mapping_group_members ALTER COLUMN id SET DEFAULT nextval('public.mapping_group_members_id_seq'::regclass);


--
-- Name: mapping_groups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mapping_groups ALTER COLUMN id SET DEFAULT nextval('public.mapping_groups_id_seq'::regclass);


--
-- Name: n_step_workflow_assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_assets ALTER COLUMN id SET DEFAULT nextval('public.n_step_workflow_assets_id_seq'::regclass);


--
-- Name: n_step_workflow_run_steps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_run_steps ALTER COLUMN id SET DEFAULT nextval('public.n_step_workflow_run_steps_id_seq'::regclass);


--
-- Name: n_step_workflow_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_runs ALTER COLUMN id SET DEFAULT nextval('public.n_step_workflow_runs_id_seq'::regclass);


--
-- Name: n_step_workflow_steps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_steps ALTER COLUMN id SET DEFAULT nextval('public.n_step_workflow_steps_id_seq'::regclass);


--
-- Name: n_step_workflows id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflows ALTER COLUMN id SET DEFAULT nextval('public.n_step_workflows_id_seq'::regclass);


--
-- Name: permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions ALTER COLUMN id SET DEFAULT nextval('public.permissions_id_seq'::regclass);


--
-- Name: profiling_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiling_metrics ALTER COLUMN id SET DEFAULT nextval('public.profiling_metrics_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules ALTER COLUMN id SET DEFAULT nextval('public.schedules_id_seq'::regclass);


--
-- Name: security_audit_log security_audit_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_audit_log ALTER COLUMN security_audit_id SET DEFAULT nextval('public.security_audit_log_security_audit_id_seq'::regclass);


--
-- Name: transform_connections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transform_connections ALTER COLUMN id SET DEFAULT nextval('public.transform_connections_id_seq'::regclass);


--
-- Name: transformation_executions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_executions ALTER COLUMN id SET DEFAULT nextval('public.transformation_executions_id_seq'::regclass);


--
-- Name: transformation_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_jobs ALTER COLUMN id SET DEFAULT nextval('public.transformation_jobs_id_seq'::regclass);


--
-- Name: transformation_lineage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_lineage ALTER COLUMN id SET DEFAULT nextval('public.transformation_lineage_id_seq'::regclass);


--
-- Name: transformation_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_logs ALTER COLUMN id SET DEFAULT nextval('public.transformation_logs_id_seq'::regclass);


--
-- Name: transformation_mappings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_mappings ALTER COLUMN id SET DEFAULT nextval('public.transformation_mappings_id_seq'::regclass);


--
-- Name: transformation_outputs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_outputs ALTER COLUMN id SET DEFAULT nextval('public.transformation_outputs_id_seq'::regclass);


--
-- Name: transformations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformations ALTER COLUMN id SET DEFAULT nextval('public.transformations_id_seq'::regclass);


--
-- Name: user_badges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges ALTER COLUMN id SET DEFAULT nextval('public.user_badges_id_seq'::regclass);


--
-- Name: user_dashboard_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_dashboard_settings ALTER COLUMN id SET DEFAULT nextval('public.user_dashboard_settings_id_seq'::regclass);


--
-- Name: user_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions ALTER COLUMN id SET DEFAULT nextval('public.user_sessions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: workflow_executions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_executions ALTER COLUMN id SET DEFAULT nextval('public.workflow_executions_id_seq'::regclass);


--
-- Name: workflow_steps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps ALTER COLUMN id SET DEFAULT nextval('public.workflow_steps_id_seq'::regclass);


--
-- Name: alert_history alert_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_history
    ADD CONSTRAINT alert_history_pkey PRIMARY KEY (id);


--
-- Name: alert_rules alert_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_rules
    ADD CONSTRAINT alert_rules_pkey PRIMARY KEY (id);


--
-- Name: anomalies anomalies_anomaly_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anomalies
    ADD CONSTRAINT anomalies_anomaly_id_key UNIQUE (anomaly_id);


--
-- Name: anomalies anomalies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anomalies
    ADD CONSTRAINT anomalies_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (audit_id);


--
-- Name: business_processes business_processes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_processes
    ADD CONSTRAINT business_processes_pkey PRIMARY KEY (id);


--
-- Name: column_mappings column_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.column_mappings
    ADD CONSTRAINT column_mappings_pkey PRIMARY KEY (id);


--
-- Name: config_change_history config_change_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_change_history
    ADD CONSTRAINT config_change_history_pkey PRIMARY KEY (change_id);


--
-- Name: connections connections_connection_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_connection_name_key UNIQUE (connection_name);


--
-- Name: connections connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_pkey PRIMARY KEY (id);


--
-- Name: data_access_log data_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_access_log
    ADD CONSTRAINT data_access_log_pkey PRIMARY KEY (access_id);


--
-- Name: dbt_executions dbt_executions_execution_uuid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbt_executions
    ADD CONSTRAINT dbt_executions_execution_uuid_key UNIQUE (execution_uuid);


--
-- Name: dbt_executions dbt_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbt_executions
    ADD CONSTRAINT dbt_executions_pkey PRIMARY KEY (execution_id);


--
-- Name: dbt_models dbt_models_model_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbt_models
    ADD CONSTRAINT dbt_models_model_name_key UNIQUE (model_name);


--
-- Name: dbt_models dbt_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dbt_models
    ADD CONSTRAINT dbt_models_pkey PRIMARY KEY (model_id);


--
-- Name: drop_location_config drop_location_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_location_config
    ADD CONSTRAINT drop_location_config_pkey PRIMARY KEY (id);


--
-- Name: execution_audit execution_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execution_audit
    ADD CONSTRAINT execution_audit_pkey PRIMARY KEY (audit_id);


--
-- Name: file_columns file_columns_file_id_column_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_columns
    ADD CONSTRAINT file_columns_file_id_column_name_key UNIQUE (file_id, column_name);


--
-- Name: file_columns file_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_columns
    ADD CONSTRAINT file_columns_pkey PRIMARY KEY (id);


--
-- Name: file_history file_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_history
    ADD CONSTRAINT file_history_pkey PRIMARY KEY (id);


--
-- Name: file_lineage file_lineage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_lineage
    ADD CONSTRAINT file_lineage_pkey PRIMARY KEY (id);


--
-- Name: file_mappings file_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_mappings
    ADD CONSTRAINT file_mappings_pkey PRIMARY KEY (id);


--
-- Name: file_quality_checks file_quality_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_quality_checks
    ADD CONSTRAINT file_quality_checks_pkey PRIMARY KEY (id);


--
-- Name: file_schedules file_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_schedules
    ADD CONSTRAINT file_schedules_pkey PRIMARY KEY (id);


--
-- Name: file_schemas file_schemas_file_id_schema_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_schemas
    ADD CONSTRAINT file_schemas_file_id_schema_hash_key UNIQUE (file_id, schema_hash);


--
-- Name: file_schemas file_schemas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_schemas
    ADD CONSTRAINT file_schemas_pkey PRIMARY KEY (id);


--
-- Name: files files_file_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_file_id_key UNIQUE (file_id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: job_dependencies job_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_dependencies
    ADD CONSTRAINT job_dependencies_pkey PRIMARY KEY (dependency_id);


--
-- Name: job_group_dependencies job_group_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_group_dependencies
    ADD CONSTRAINT job_group_dependencies_pkey PRIMARY KEY (group_dependency_id);


--
-- Name: job_group_jobs job_group_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_group_jobs
    ADD CONSTRAINT job_group_jobs_pkey PRIMARY KEY (group_id, job_id);


--
-- Name: job_group_schedules job_group_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_group_schedules
    ADD CONSTRAINT job_group_schedules_pkey PRIMARY KEY (group_schedule_id);


--
-- Name: job_groups job_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_groups
    ADD CONSTRAINT job_groups_pkey PRIMARY KEY (id);


--
-- Name: job_history job_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_history
    ADD CONSTRAINT job_history_pkey PRIMARY KEY (id);


--
-- Name: job_runs job_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_runs
    ADD CONSTRAINT job_runs_pkey PRIMARY KEY (id);


--
-- Name: job_schedules job_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_schedules
    ADD CONSTRAINT job_schedules_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: mapping_group_executions mapping_group_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mapping_group_executions
    ADD CONSTRAINT mapping_group_executions_pkey PRIMARY KEY (id);


--
-- Name: mapping_group_members mapping_group_members_group_id_mapping_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mapping_group_members
    ADD CONSTRAINT mapping_group_members_group_id_mapping_id_key UNIQUE (group_id, mapping_id);


--
-- Name: mapping_group_members mapping_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mapping_group_members
    ADD CONSTRAINT mapping_group_members_pkey PRIMARY KEY (id);


--
-- Name: mapping_groups mapping_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mapping_groups
    ADD CONSTRAINT mapping_groups_pkey PRIMARY KEY (id);


--
-- Name: n_step_workflow_assets n_step_workflow_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_assets
    ADD CONSTRAINT n_step_workflow_assets_pkey PRIMARY KEY (id);


--
-- Name: n_step_workflow_run_steps n_step_workflow_run_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_run_steps
    ADD CONSTRAINT n_step_workflow_run_steps_pkey PRIMARY KEY (id);


--
-- Name: n_step_workflow_runs n_step_workflow_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_runs
    ADD CONSTRAINT n_step_workflow_runs_pkey PRIMARY KEY (id);


--
-- Name: n_step_workflow_runs n_step_workflow_runs_run_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_runs
    ADD CONSTRAINT n_step_workflow_runs_run_id_key UNIQUE (run_id);


--
-- Name: n_step_workflow_steps n_step_workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_steps
    ADD CONSTRAINT n_step_workflow_steps_pkey PRIMARY KEY (id);


--
-- Name: n_step_workflow_steps n_step_workflow_steps_workflow_id_step_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_steps
    ADD CONSTRAINT n_step_workflow_steps_workflow_id_step_index_key UNIQUE (workflow_id, step_index);


--
-- Name: n_step_workflows n_step_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflows
    ADD CONSTRAINT n_step_workflows_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_name_key UNIQUE (name);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_resource_action_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_resource_action_key UNIQUE (resource, action);


--
-- Name: profiling_metrics profiling_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiling_metrics
    ADD CONSTRAINT profiling_metrics_pkey PRIMARY KEY (id);


--
-- Name: quality_reports quality_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_reports
    ADD CONSTRAINT quality_reports_pkey PRIMARY KEY (report_id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);


--
-- Name: security_audit_log security_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_audit_log
    ADD CONSTRAINT security_audit_log_pkey PRIMARY KEY (security_audit_id);


--
-- Name: storage_connections storage_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_connections
    ADD CONSTRAINT storage_connections_pkey PRIMARY KEY (connection_id);


--
-- Name: transform_connections transform_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transform_connections
    ADD CONSTRAINT transform_connections_pkey PRIMARY KEY (id);


--
-- Name: transformation_executions transformation_executions_execution_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_executions
    ADD CONSTRAINT transformation_executions_execution_id_key UNIQUE (execution_id);


--
-- Name: transformation_executions transformation_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_executions
    ADD CONSTRAINT transformation_executions_pkey PRIMARY KEY (id);


--
-- Name: transformation_jobs transformation_jobs_job_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_jobs
    ADD CONSTRAINT transformation_jobs_job_id_key UNIQUE (job_id);


--
-- Name: transformation_jobs transformation_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_jobs
    ADD CONSTRAINT transformation_jobs_pkey PRIMARY KEY (id);


--
-- Name: transformation_lineage transformation_lineage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_lineage
    ADD CONSTRAINT transformation_lineage_pkey PRIMARY KEY (id);


--
-- Name: transformation_logs transformation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_logs
    ADD CONSTRAINT transformation_logs_pkey PRIMARY KEY (id);


--
-- Name: transformation_mappings transformation_mappings_mapping_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_mappings
    ADD CONSTRAINT transformation_mappings_mapping_id_key UNIQUE (mapping_id);


--
-- Name: transformation_mappings transformation_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_mappings
    ADD CONSTRAINT transformation_mappings_pkey PRIMARY KEY (id);


--
-- Name: transformation_outputs transformation_outputs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_outputs
    ADD CONSTRAINT transformation_outputs_pkey PRIMARY KEY (id);


--
-- Name: transformations transformations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformations
    ADD CONSTRAINT transformations_pkey PRIMARY KEY (id);


--
-- Name: transformations transformations_transformation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformations
    ADD CONSTRAINT transformations_transformation_id_key UNIQUE (transformation_id);


--
-- Name: job_group_dependencies unique_group_dependency; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_group_dependencies
    ADD CONSTRAINT unique_group_dependency UNIQUE (group_id, depends_on_group_id);


--
-- Name: job_dependencies unique_job_dependency; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_dependencies
    ADD CONSTRAINT unique_job_dependency UNIQUE (job_id, depends_on_job_id);


--
-- Name: user_badges user_badges_badge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_badge_id_key UNIQUE (badge_id);


--
-- Name: user_badges user_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);


--
-- Name: user_dashboard_settings user_dashboard_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_dashboard_settings
    ADD CONSTRAINT user_dashboard_settings_pkey PRIMARY KEY (id);


--
-- Name: user_groups user_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_pkey PRIMARY KEY (user_id, group_id);


--
-- Name: user_job_groups user_job_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_job_groups
    ADD CONSTRAINT user_job_groups_pkey PRIMARY KEY (user_id, group_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_token_key UNIQUE (token);


--
-- Name: user_uuid_mapping user_uuid_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_uuid_mapping
    ADD CONSTRAINT user_uuid_mapping_pkey PRIMARY KEY (user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: workflow_executions workflow_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_pkey PRIMARY KEY (id);


--
-- Name: workflow_steps workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_pkey PRIMARY KEY (id);


--
-- Name: idx_anomalies_detected; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anomalies_detected ON public.anomalies USING btree (detected_at DESC);


--
-- Name: idx_anomalies_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anomalies_file ON public.anomalies USING btree (file_id);


--
-- Name: idx_anomalies_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anomalies_job ON public.anomalies USING btree (job_id);


--
-- Name: idx_anomalies_mapping; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anomalies_mapping ON public.anomalies USING btree (mapping_id);


--
-- Name: idx_anomalies_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anomalies_status ON public.anomalies USING btree (status);


--
-- Name: idx_anomalies_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anomalies_type ON public.anomalies USING btree (anomaly_type);


--
-- Name: idx_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_action ON public.audit_log USING btree (action_type, "timestamp" DESC);


--
-- Name: idx_audit_log_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_entity ON public.audit_log USING btree (entity_type, entity_id);


--
-- Name: idx_audit_log_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_request ON public.audit_log USING btree (request_id);


--
-- Name: idx_audit_log_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_timestamp ON public.audit_log USING btree ("timestamp" DESC);


--
-- Name: idx_audit_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_user ON public.audit_log USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_business_processes_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_processes_group_id ON public.business_processes USING btree (group_id);


--
-- Name: idx_business_processes_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_processes_updated_at ON public.business_processes USING btree (updated_at DESC);


--
-- Name: idx_config_change_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_change_entity ON public.config_change_history USING btree (entity_type, entity_id, "timestamp" DESC);


--
-- Name: idx_config_change_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_change_timestamp ON public.config_change_history USING btree ("timestamp" DESC);


--
-- Name: idx_config_change_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_change_user ON public.config_change_history USING btree (changed_by_user, "timestamp" DESC);


--
-- Name: idx_data_access_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_access_file ON public.data_access_log USING btree (file_id, "timestamp" DESC);


--
-- Name: idx_data_access_pii; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_access_pii ON public.data_access_log USING btree (contains_pii, "timestamp" DESC) WHERE (contains_pii = true);


--
-- Name: idx_data_access_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_access_timestamp ON public.data_access_log USING btree ("timestamp" DESC);


--
-- Name: idx_data_access_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_access_user ON public.data_access_log USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_dbt_executions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dbt_executions_created ON public.dbt_executions USING btree (created_at DESC);


--
-- Name: idx_dbt_executions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dbt_executions_status ON public.dbt_executions USING btree (status);


--
-- Name: idx_dbt_executions_triggered_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dbt_executions_triggered_by ON public.dbt_executions USING btree (triggered_by);


--
-- Name: idx_dbt_executions_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dbt_executions_uuid ON public.dbt_executions USING btree (execution_uuid);


--
-- Name: idx_dbt_models_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dbt_models_name ON public.dbt_models USING btree (model_name);


--
-- Name: idx_dbt_models_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dbt_models_status ON public.dbt_models USING btree (last_run_status);


--
-- Name: idx_dbt_models_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dbt_models_type ON public.dbt_models USING btree (model_type);


--
-- Name: idx_dbt_models_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dbt_models_updated ON public.dbt_models USING btree (updated_at DESC);


--
-- Name: idx_execution_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_execution_audit_entity ON public.execution_audit USING btree (execution_type, entity_id);


--
-- Name: idx_execution_audit_execution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_execution_audit_execution ON public.execution_audit USING btree (execution_id, "timestamp" DESC);


--
-- Name: idx_execution_audit_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_execution_audit_status ON public.execution_audit USING btree (new_status, "timestamp" DESC);


--
-- Name: idx_file_columns_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_columns_file_id ON public.file_columns USING btree (file_id);


--
-- Name: idx_file_schedules_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_schedules_file_id ON public.file_schedules USING btree (file_id);


--
-- Name: idx_file_schemas_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_schemas_file ON public.file_schemas USING btree (file_id);


--
-- Name: idx_file_schemas_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_schemas_hash ON public.file_schemas USING btree (schema_hash);


--
-- Name: idx_file_schemas_pattern; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_schemas_pattern ON public.file_schemas USING btree (file_pattern);


--
-- Name: idx_files_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_created_at ON public.files USING btree (created_at DESC);


--
-- Name: idx_files_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_updated_at ON public.files USING btree (updated_at DESC);


--
-- Name: idx_groups_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_name ON public.groups USING btree (name);


--
-- Name: idx_job_dependencies_depends_on; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_dependencies_depends_on ON public.job_dependencies USING btree (depends_on_job_id);


--
-- Name: idx_job_dependencies_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_dependencies_job ON public.job_dependencies USING btree (job_id);


--
-- Name: idx_job_group_dependencies_depends_on; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_group_dependencies_depends_on ON public.job_group_dependencies USING btree (depends_on_group_id);


--
-- Name: idx_job_group_dependencies_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_group_dependencies_group ON public.job_group_dependencies USING btree (group_id);


--
-- Name: idx_job_group_jobs_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_group_jobs_group_id ON public.job_group_jobs USING btree (group_id);


--
-- Name: idx_job_group_jobs_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_group_jobs_job_id ON public.job_group_jobs USING btree (job_id);


--
-- Name: idx_job_group_schedules_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_group_schedules_enabled ON public.job_group_schedules USING btree (enabled) WHERE (enabled = true);


--
-- Name: idx_job_group_schedules_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_group_schedules_group ON public.job_group_schedules USING btree (group_id);


--
-- Name: idx_job_schedules_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_schedules_job_id ON public.job_schedules USING btree (job_id);


--
-- Name: idx_jobs_business_process_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_business_process_id ON public.jobs USING btree (business_process_id);


--
-- Name: idx_jobs_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_updated_at ON public.jobs USING btree (updated_at DESC);


--
-- Name: idx_mapping_group_executions_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mapping_group_executions_group_id ON public.mapping_group_executions USING btree (group_id);


--
-- Name: idx_mapping_group_members_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mapping_group_members_group_id ON public.mapping_group_members USING btree (group_id);


--
-- Name: idx_mapping_group_members_mapping_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mapping_group_members_mapping_id ON public.mapping_group_members USING btree (mapping_id);


--
-- Name: idx_n_step_workflow_assets_step; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_n_step_workflow_assets_step ON public.n_step_workflow_assets USING btree (step_id);


--
-- Name: idx_n_step_workflow_run_steps_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_n_step_workflow_run_steps_run ON public.n_step_workflow_run_steps USING btree (run_id);


--
-- Name: idx_n_step_workflow_runs_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_n_step_workflow_runs_workflow ON public.n_step_workflow_runs USING btree (workflow_id);


--
-- Name: idx_n_step_workflow_steps_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_n_step_workflow_steps_workflow ON public.n_step_workflow_steps USING btree (workflow_id);


--
-- Name: idx_permissions_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permissions_action ON public.permissions USING btree (action);


--
-- Name: idx_permissions_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permissions_name ON public.permissions USING btree (name);


--
-- Name: idx_permissions_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permissions_resource ON public.permissions USING btree (resource);


--
-- Name: idx_profiling_metrics_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiling_metrics_date ON public.profiling_metrics USING btree (profiled_at DESC);


--
-- Name: idx_profiling_metrics_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiling_metrics_file ON public.profiling_metrics USING btree (file_id);


--
-- Name: idx_profiling_metrics_mapping; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiling_metrics_mapping ON public.profiling_metrics USING btree (mapping_id);


--
-- Name: idx_roles_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_name ON public.roles USING btree (name);


--
-- Name: idx_schedules_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedules_entity ON public.schedules USING btree (entity_type, entity_id);


--
-- Name: idx_schedules_next_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedules_next_run ON public.schedules USING btree (next_run) WHERE (is_active = true);


--
-- Name: idx_security_audit_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_audit_event ON public.security_audit_log USING btree (event_type, "timestamp" DESC);


--
-- Name: idx_security_audit_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_audit_severity ON public.security_audit_log USING btree (severity, "timestamp" DESC) WHERE ((severity)::text = ANY ((ARRAY['WARNING'::character varying, 'CRITICAL'::character varying])::text[]));


--
-- Name: idx_security_audit_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_audit_timestamp ON public.security_audit_log USING btree ("timestamp" DESC);


--
-- Name: idx_security_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_audit_user ON public.security_audit_log USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_transformation_jobs_mapping; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transformation_jobs_mapping ON public.transformation_jobs USING btree (mapping_id);


--
-- Name: idx_transformation_jobs_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transformation_jobs_start ON public.transformation_jobs USING btree (start_time DESC);


--
-- Name: idx_transformation_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transformation_jobs_status ON public.transformation_jobs USING btree (status);


--
-- Name: idx_transformation_logs_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transformation_logs_job ON public.transformation_logs USING btree (job_id);


--
-- Name: idx_transformation_logs_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transformation_logs_level ON public.transformation_logs USING btree (log_level);


--
-- Name: idx_transformation_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transformation_logs_timestamp ON public.transformation_logs USING btree ("timestamp" DESC);


--
-- Name: idx_transformation_mappings_pattern; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transformation_mappings_pattern ON public.transformation_mappings USING btree (source_file_pattern);


--
-- Name: idx_transformation_mappings_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transformation_mappings_source ON public.transformation_mappings USING btree (source_connection_id);


--
-- Name: idx_transformation_mappings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transformation_mappings_status ON public.transformation_mappings USING btree (status);


--
-- Name: idx_user_groups_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_groups_group_id ON public.user_groups USING btree (group_id);


--
-- Name: idx_user_groups_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_groups_user_id ON public.user_groups USING btree (user_id);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username ON public.users USING btree (lower((username)::text));


--
-- Name: idx_workflow_executions_workflow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_executions_workflow_id ON public.workflow_executions USING btree (workflow_id);


--
-- Name: idx_workflow_steps_depends_on; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_steps_depends_on ON public.workflow_steps USING btree (depends_on);


--
-- Name: idx_workflow_steps_workflow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_steps_workflow_id ON public.workflow_steps USING btree (workflow_id);


--
-- Name: alert_history alert_history_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_history
    ADD CONSTRAINT alert_history_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: alert_history alert_history_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_history
    ADD CONSTRAINT alert_history_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.alert_rules(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_parent_audit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_parent_audit_id_fkey FOREIGN KEY (parent_audit_id) REFERENCES public.audit_log(audit_id);


--
-- Name: business_processes business_processes_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_processes
    ADD CONSTRAINT business_processes_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;


--
-- Name: column_mappings column_mappings_source_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.column_mappings
    ADD CONSTRAINT column_mappings_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: drop_location_config drop_location_config_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_location_config
    ADD CONSTRAINT drop_location_config_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: drop_location_config drop_location_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_location_config
    ADD CONSTRAINT drop_location_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: file_columns file_columns_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_columns
    ADD CONSTRAINT file_columns_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: file_history file_history_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_history
    ADD CONSTRAINT file_history_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: file_lineage file_lineage_source_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_lineage
    ADD CONSTRAINT file_lineage_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: file_lineage file_lineage_target_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_lineage
    ADD CONSTRAINT file_lineage_target_file_id_fkey FOREIGN KEY (target_file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: file_schedules fk_file; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_schedules
    ADD CONSTRAINT fk_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: job_dependencies job_dependencies_depends_on_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_dependencies
    ADD CONSTRAINT job_dependencies_depends_on_job_id_fkey FOREIGN KEY (depends_on_job_id) REFERENCES public.file_schedules(id) ON DELETE CASCADE;


--
-- Name: job_dependencies job_dependencies_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_dependencies
    ADD CONSTRAINT job_dependencies_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.file_schedules(id) ON DELETE CASCADE;


--
-- Name: job_group_dependencies job_group_dependencies_depends_on_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_group_dependencies
    ADD CONSTRAINT job_group_dependencies_depends_on_group_id_fkey FOREIGN KEY (depends_on_group_id) REFERENCES public.job_groups(id) ON DELETE CASCADE;


--
-- Name: job_group_dependencies job_group_dependencies_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_group_dependencies
    ADD CONSTRAINT job_group_dependencies_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.job_groups(id) ON DELETE CASCADE;


--
-- Name: job_group_schedules job_group_schedules_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_group_schedules
    ADD CONSTRAINT job_group_schedules_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.job_groups(id) ON DELETE CASCADE;


--
-- Name: job_history job_history_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_history
    ADD CONSTRAINT job_history_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: job_runs job_runs_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_runs
    ADD CONSTRAINT job_runs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: jobs jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: mapping_group_executions mapping_group_executions_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mapping_group_executions
    ADD CONSTRAINT mapping_group_executions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.mapping_groups(id) ON DELETE CASCADE;


--
-- Name: mapping_group_members mapping_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mapping_group_members
    ADD CONSTRAINT mapping_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.mapping_groups(id) ON DELETE CASCADE;


--
-- Name: mapping_group_members mapping_group_members_mapping_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mapping_group_members
    ADD CONSTRAINT mapping_group_members_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES public.transformation_mappings(mapping_id) ON DELETE CASCADE;


--
-- Name: n_step_workflow_assets n_step_workflow_assets_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_assets
    ADD CONSTRAINT n_step_workflow_assets_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.n_step_workflow_steps(id) ON DELETE CASCADE;


--
-- Name: n_step_workflow_run_steps n_step_workflow_run_steps_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_run_steps
    ADD CONSTRAINT n_step_workflow_run_steps_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.n_step_workflow_runs(id) ON DELETE CASCADE;


--
-- Name: n_step_workflow_runs n_step_workflow_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_runs
    ADD CONSTRAINT n_step_workflow_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES public.users(id);


--
-- Name: n_step_workflow_runs n_step_workflow_runs_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_runs
    ADD CONSTRAINT n_step_workflow_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.n_step_workflows(id);


--
-- Name: n_step_workflow_steps n_step_workflow_steps_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflow_steps
    ADD CONSTRAINT n_step_workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.n_step_workflows(id) ON DELETE CASCADE;


--
-- Name: n_step_workflows n_step_workflows_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.n_step_workflows
    ADD CONSTRAINT n_step_workflows_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: quality_reports quality_reports_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_reports
    ADD CONSTRAINT quality_reports_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: transformation_jobs transformation_jobs_mapping_group_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_jobs
    ADD CONSTRAINT transformation_jobs_mapping_group_execution_id_fkey FOREIGN KEY (mapping_group_execution_id) REFERENCES public.mapping_group_executions(id);


--
-- Name: transformation_jobs transformation_jobs_mapping_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_jobs
    ADD CONSTRAINT transformation_jobs_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES public.transformation_mappings(mapping_id) ON DELETE CASCADE;


--
-- Name: transformation_jobs transformation_jobs_workflow_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_jobs
    ADD CONSTRAINT transformation_jobs_workflow_execution_id_fkey FOREIGN KEY (workflow_execution_id) REFERENCES public.workflow_executions(id);


--
-- Name: transformation_logs transformation_logs_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transformation_logs
    ADD CONSTRAINT transformation_logs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.transformation_jobs(job_id) ON DELETE CASCADE;


--
-- Name: user_badges user_badges_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id);


--
-- Name: user_groups user_groups_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: user_groups user_groups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workflow_executions workflow_executions_current_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_current_step_id_fkey FOREIGN KEY (current_step_id) REFERENCES public.workflow_steps(id);


--
-- Name: workflow_executions workflow_executions_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.business_processes(id) ON DELETE CASCADE;


--
-- Name: workflow_steps workflow_steps_depends_on_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_depends_on_fkey FOREIGN KEY (depends_on) REFERENCES public.workflow_steps(id) ON DELETE SET NULL;


--
-- Name: workflow_steps workflow_steps_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.business_processes(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

