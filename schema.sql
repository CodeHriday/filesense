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
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: cleanup_expired_policy_cache(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.cleanup_expired_policy_cache() RETURNS void
    LANGUAGE plpgsql
    AS $$
      BEGIN
        DELETE FROM policy_evaluation_cache WHERE expires_at < NOW();
      END;
      $$;


ALTER FUNCTION public.cleanup_expired_policy_cache() OWNER TO neondb_owner;

--
-- Name: refresh_file_pattern_metrics_views(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.refresh_file_pattern_metrics_views() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        -- Refresh weekly view concurrently (non-blocking)
        REFRESH MATERIALIZED VIEW CONCURRENTLY file_pattern_metrics_weekly;
        
        -- Refresh monthly view concurrently (non-blocking)
        REFRESH MATERIALIZED VIEW CONCURRENTLY file_pattern_metrics_monthly;
        
        RETURN NEW;
      END;
      $$;


ALTER FUNCTION public.refresh_file_pattern_metrics_views() OWNER TO neondb_owner;

--
-- Name: trigger_cleanup_policy_cache(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.trigger_cleanup_policy_cache() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        PERFORM cleanup_expired_policy_cache();
        RETURN NEW;
      END;
      $$;


ALTER FUNCTION public.trigger_cleanup_policy_cache() OWNER TO neondb_owner;

--
-- Name: update_full_name(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.update_full_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.full_name := TRIM(CONCAT_WS(' ', 
          NEW.first_name, 
          NEW.middle_name, 
          NEW.last_name
        ));
        RETURN NEW;
      END;
      $$;


ALTER FUNCTION public.update_full_name() OWNER TO neondb_owner;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO neondb_owner;

--
-- Name: update_vendor_users_updated_at(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.update_vendor_users_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$;


ALTER FUNCTION public.update_vendor_users_updated_at() OWNER TO neondb_owner;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_group_members; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.access_group_members (
    group_id integer NOT NULL,
    user_id integer NOT NULL,
    source character varying(50) DEFAULT 'MANUAL'::character varying,
    added_by integer,
    added_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.access_group_members OWNER TO neondb_owner;

--
-- Name: access_group_roles; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.access_group_roles (
    group_id integer,
    role_id integer,
    project_id integer,
    assigned_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    id integer NOT NULL
);


ALTER TABLE public.access_group_roles OWNER TO neondb_owner;

--
-- Name: access_group_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.access_group_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.access_group_roles_id_seq OWNER TO neondb_owner;

--
-- Name: access_group_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.access_group_roles_id_seq OWNED BY public.access_group_roles.id;


--
-- Name: access_groups; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.access_groups OWNER TO neondb_owner;

--
-- Name: access_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.access_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.access_groups_id_seq OWNER TO neondb_owner;

--
-- Name: access_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.access_groups_id_seq OWNED BY public.access_groups.id;


--
-- Name: alert_history; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.alert_history (
    id integer NOT NULL,
    file_id character varying(255),
    rule_id integer,
    triggered_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    alert_details jsonb
);


ALTER TABLE public.alert_history OWNER TO neondb_owner;

--
-- Name: alert_history_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.alert_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.alert_history_id_seq OWNER TO neondb_owner;

--
-- Name: alert_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.alert_history_id_seq OWNED BY public.alert_history.id;


--
-- Name: alert_rules; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.alert_rules OWNER TO neondb_owner;

--
-- Name: alert_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.alert_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.alert_rules_id_seq OWNER TO neondb_owner;

--
-- Name: alert_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.alert_rules_id_seq OWNED BY public.alert_rules.id;


--
-- Name: anomalies; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.anomalies OWNER TO neondb_owner;

--
-- Name: anomalies_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.anomalies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.anomalies_id_seq OWNER TO neondb_owner;

--
-- Name: anomalies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.anomalies_id_seq OWNED BY public.anomalies.id;


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.app_settings (
    id integer NOT NULL,
    setting_key character varying(100) NOT NULL,
    setting_value text NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.app_settings OWNER TO neondb_owner;

--
-- Name: app_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.app_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.app_settings_id_seq OWNER TO neondb_owner;

--
-- Name: app_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.app_settings_id_seq OWNED BY public.app_settings.id;


--
-- Name: attribute_definitions; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.attribute_definitions OWNER TO neondb_owner;

--
-- Name: attribute_definitions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.attribute_definitions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.attribute_definitions_id_seq OWNER TO neondb_owner;

--
-- Name: attribute_definitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.attribute_definitions_id_seq OWNED BY public.attribute_definitions.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.audit_log OWNER TO neondb_owner;

--
-- Name: audit_log_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.audit_log_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_log_audit_id_seq OWNER TO neondb_owner;

--
-- Name: audit_log_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.audit_log_audit_id_seq OWNED BY public.audit_log.audit_id;


--
-- Name: bulk_profiling_files; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.bulk_profiling_files OWNER TO neondb_owner;

--
-- Name: bulk_profiling_files_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.bulk_profiling_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bulk_profiling_files_id_seq OWNER TO neondb_owner;

--
-- Name: bulk_profiling_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.bulk_profiling_files_id_seq OWNED BY public.bulk_profiling_files.id;


--
-- Name: bulk_profiling_jobs; Type: TABLE; Schema: public; Owner: neondb_owner
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
    skipped_files integer DEFAULT 0
);


ALTER TABLE public.bulk_profiling_jobs OWNER TO neondb_owner;

--
-- Name: business_processes; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.business_processes OWNER TO neondb_owner;

--
-- Name: business_processes_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.business_processes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.business_processes_id_seq OWNER TO neondb_owner;

--
-- Name: business_processes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.business_processes_id_seq OWNED BY public.business_processes.id;


--
-- Name: column_governance_tag_assignments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.column_governance_tag_assignments (
    assignment_id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    column_name character varying(255) NOT NULL,
    tag_id character varying(255) NOT NULL,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.column_governance_tag_assignments OWNER TO neondb_owner;

--
-- Name: column_governance_tag_assignments_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.column_governance_tag_assignments_assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.column_governance_tag_assignments_assignment_id_seq OWNER TO neondb_owner;

--
-- Name: column_governance_tag_assignments_assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.column_governance_tag_assignments_assignment_id_seq OWNED BY public.column_governance_tag_assignments.assignment_id;


--
-- Name: column_mappings; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.column_mappings OWNER TO neondb_owner;

--
-- Name: column_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.column_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.column_mappings_id_seq OWNER TO neondb_owner;

--
-- Name: column_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.column_mappings_id_seq OWNED BY public.column_mappings.id;


--
-- Name: column_policy_assignments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.column_policy_assignments (
    assignment_id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    column_name character varying(255) NOT NULL,
    policy_id character varying(255) NOT NULL,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.column_policy_assignments OWNER TO neondb_owner;

--
-- Name: column_policy_assignments_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.column_policy_assignments_assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.column_policy_assignments_assignment_id_seq OWNER TO neondb_owner;

--
-- Name: column_policy_assignments_assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.column_policy_assignments_assignment_id_seq OWNED BY public.column_policy_assignments.assignment_id;


--
-- Name: column_sensitivity_tags; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.column_sensitivity_tags (
    tag_id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    column_name character varying(255) NOT NULL,
    classification_level character varying(50) NOT NULL,
    data_type character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.column_sensitivity_tags OWNER TO neondb_owner;

--
-- Name: column_sensitivity_tags_tag_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.column_sensitivity_tags_tag_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.column_sensitivity_tags_tag_id_seq OWNER TO neondb_owner;

--
-- Name: column_sensitivity_tags_tag_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.column_sensitivity_tags_tag_id_seq OWNED BY public.column_sensitivity_tags.tag_id;


--
-- Name: config_change_history; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.config_change_history OWNER TO neondb_owner;

--
-- Name: config_change_history_change_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.config_change_history_change_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.config_change_history_change_id_seq OWNER TO neondb_owner;

--
-- Name: config_change_history_change_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.config_change_history_change_id_seq OWNED BY public.config_change_history.change_id;


--
-- Name: connections; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.connections OWNER TO neondb_owner;

--
-- Name: connections_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.connections_id_seq OWNER TO neondb_owner;

--
-- Name: connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.connections_id_seq OWNED BY public.connections.id;


--
-- Name: data_access_log; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.data_access_log OWNER TO neondb_owner;

--
-- Name: data_access_log_access_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.data_access_log_access_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.data_access_log_access_id_seq OWNER TO neondb_owner;

--
-- Name: data_access_log_access_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.data_access_log_access_id_seq OWNED BY public.data_access_log.access_id;


--
-- Name: dbt_executions; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.dbt_executions OWNER TO neondb_owner;

--
-- Name: dbt_executions_execution_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.dbt_executions_execution_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dbt_executions_execution_id_seq OWNER TO neondb_owner;

--
-- Name: dbt_executions_execution_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.dbt_executions_execution_id_seq OWNED BY public.dbt_executions.execution_id;


--
-- Name: dbt_models; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.dbt_models OWNER TO neondb_owner;

--
-- Name: dbt_models_model_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.dbt_models_model_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dbt_models_model_id_seq OWNER TO neondb_owner;

--
-- Name: dbt_models_model_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.dbt_models_model_id_seq OWNED BY public.dbt_models.model_id;


--
-- Name: drop_location_config; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.drop_location_config OWNER TO neondb_owner;

--
-- Name: TABLE drop_location_config; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.drop_location_config IS 'Stores S3/cloud storage configuration for drop file uploads (single location allowed)';


--
-- Name: COLUMN drop_location_config.storage_type; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.drop_location_config.storage_type IS 'Storage provider type: s3, gcs, azure';


--
-- Name: COLUMN drop_location_config.path_prefix; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.drop_location_config.path_prefix IS 'Optional path prefix within bucket for drop files';


--
-- Name: COLUMN drop_location_config.access_key_id; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.drop_location_config.access_key_id IS 'Encrypted AWS access key or equivalent';


--
-- Name: COLUMN drop_location_config.secret_access_key; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.drop_location_config.secret_access_key IS 'Encrypted secret access key';


--
-- Name: drop_location_config_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.drop_location_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.drop_location_config_id_seq OWNER TO neondb_owner;

--
-- Name: drop_location_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.drop_location_config_id_seq OWNED BY public.drop_location_config.id;


--
-- Name: execution_audit; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.execution_audit OWNER TO neondb_owner;

--
-- Name: execution_audit_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.execution_audit_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.execution_audit_audit_id_seq OWNER TO neondb_owner;

--
-- Name: execution_audit_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.execution_audit_audit_id_seq OWNED BY public.execution_audit.audit_id;


--
-- Name: file_audit_details; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.file_audit_details OWNER TO neondb_owner;

--
-- Name: file_audit_details_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.file_audit_details_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_audit_details_id_seq OWNER TO neondb_owner;

--
-- Name: file_audit_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.file_audit_details_id_seq OWNED BY public.file_audit_details.id;


--
-- Name: file_columns; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.file_columns OWNER TO neondb_owner;

--
-- Name: file_columns_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.file_columns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_columns_id_seq OWNER TO neondb_owner;

--
-- Name: file_columns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.file_columns_id_seq OWNED BY public.file_columns.id;


--
-- Name: file_history; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.file_history OWNER TO neondb_owner;

--
-- Name: file_history_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.file_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_history_id_seq OWNER TO neondb_owner;

--
-- Name: file_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.file_history_id_seq OWNED BY public.file_history.id;


--
-- Name: file_lineage; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.file_lineage OWNER TO neondb_owner;

--
-- Name: file_lineage_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.file_lineage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_lineage_id_seq OWNER TO neondb_owner;

--
-- Name: file_lineage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.file_lineage_id_seq OWNED BY public.file_lineage.id;


--
-- Name: file_mappings; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.file_mappings OWNER TO neondb_owner;

--
-- Name: file_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.file_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_mappings_id_seq OWNER TO neondb_owner;

--
-- Name: file_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.file_mappings_id_seq OWNED BY public.file_mappings.id;


--
-- Name: file_ownership; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.file_ownership OWNER TO neondb_owner;

--
-- Name: file_ownership_ownership_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.file_ownership_ownership_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_ownership_ownership_id_seq OWNER TO neondb_owner;

--
-- Name: file_ownership_ownership_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.file_ownership_ownership_id_seq OWNED BY public.file_ownership.ownership_id;


--
-- Name: file_pattern_metrics; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.file_pattern_metrics OWNER TO neondb_owner;

--
-- Name: file_pattern_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.file_pattern_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_pattern_metrics_id_seq OWNER TO neondb_owner;

--
-- Name: file_pattern_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.file_pattern_metrics_id_seq OWNED BY public.file_pattern_metrics.id;


--
-- Name: file_pattern_metrics_monthly; Type: MATERIALIZED VIEW; Schema: public; Owner: neondb_owner
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


ALTER MATERIALIZED VIEW public.file_pattern_metrics_monthly OWNER TO neondb_owner;

--
-- Name: file_pattern_metrics_weekly; Type: MATERIALIZED VIEW; Schema: public; Owner: neondb_owner
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


ALTER MATERIALIZED VIEW public.file_pattern_metrics_weekly OWNER TO neondb_owner;

--
-- Name: file_policy_assignments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.file_policy_assignments (
    assignment_id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    policy_id character varying(255) NOT NULL,
    assigned_by integer,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.file_policy_assignments OWNER TO neondb_owner;

--
-- Name: file_policy_assignments_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.file_policy_assignments_assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_policy_assignments_assignment_id_seq OWNER TO neondb_owner;

--
-- Name: file_policy_assignments_assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.file_policy_assignments_assignment_id_seq OWNED BY public.file_policy_assignments.assignment_id;


--
-- Name: file_preview_data; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.file_preview_data (
    preview_id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    row_number integer NOT NULL,
    row_data jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.file_preview_data OWNER TO neondb_owner;

--
-- Name: file_preview_data_preview_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.file_preview_data_preview_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_preview_data_preview_id_seq OWNER TO neondb_owner;

--
-- Name: file_preview_data_preview_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.file_preview_data_preview_id_seq OWNED BY public.file_preview_data.preview_id;


--
-- Name: file_quality_checks; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.file_quality_checks OWNER TO neondb_owner;

--
-- Name: file_quality_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.file_quality_checks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_quality_checks_id_seq OWNER TO neondb_owner;

--
-- Name: file_quality_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.file_quality_checks_id_seq OWNED BY public.file_quality_checks.id;


--
-- Name: file_schedules; Type: TABLE; Schema: public; Owner: neondb_owner
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
    project_id integer NOT NULL
);


ALTER TABLE public.file_schedules OWNER TO neondb_owner;

--
-- Name: file_schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.file_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_schedules_id_seq OWNER TO neondb_owner;

--
-- Name: file_schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.file_schedules_id_seq OWNED BY public.file_schedules.id;


--
-- Name: file_schema_details; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.file_schema_details OWNER TO neondb_owner;

--
-- Name: file_schema_details_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.file_schema_details_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_schema_details_id_seq OWNER TO neondb_owner;

--
-- Name: file_schema_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.file_schema_details_id_seq OWNED BY public.file_schema_details.id;


--
-- Name: file_schemas; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.file_schemas OWNER TO neondb_owner;

--
-- Name: file_schemas_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.file_schemas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_schemas_id_seq OWNER TO neondb_owner;

--
-- Name: file_schemas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.file_schemas_id_seq OWNED BY public.file_schemas.id;


--
-- Name: file_tag_assignments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.file_tag_assignments (
    assignment_id integer NOT NULL,
    file_id character varying(255) NOT NULL,
    tag_id character varying(255) NOT NULL,
    assigned_by integer,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.file_tag_assignments OWNER TO neondb_owner;

--
-- Name: file_tag_assignments_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.file_tag_assignments_assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.file_tag_assignments_assignment_id_seq OWNER TO neondb_owner;

--
-- Name: file_tag_assignments_assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.file_tag_assignments_assignment_id_seq OWNED BY public.file_tag_assignments.assignment_id;


--
-- Name: files; Type: TABLE; Schema: public; Owner: neondb_owner
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
    file_role character varying(50)
);


ALTER TABLE public.files OWNER TO neondb_owner;

--
-- Name: files_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.files_id_seq OWNER TO neondb_owner;

--
-- Name: files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.files_id_seq OWNED BY public.files.id;


--
-- Name: governance_policies; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.governance_policies OWNER TO neondb_owner;

--
-- Name: governance_tags; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.governance_tags OWNER TO neondb_owner;

--
-- Name: COLUMN governance_tags.permission_required; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.governance_tags.permission_required IS 'Base permission name (e.g., pii, confidential) - system will check tag:permission:read and tag:permission:edit';


--
-- Name: COLUMN governance_tags.sensitivity_level; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.governance_tags.sensitivity_level IS 'Sensitivity level: public (anyone), restricted (requires permission), private (admin only)';


--
-- Name: group_policy_attachments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.group_policy_attachments (
    group_id integer NOT NULL,
    policy_id integer NOT NULL,
    attached_by integer,
    attached_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.group_policy_attachments OWNER TO neondb_owner;

--
-- Name: groups; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.groups (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.groups OWNER TO neondb_owner;

--
-- Name: groups_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.groups_id_seq OWNER TO neondb_owner;

--
-- Name: groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.groups_id_seq OWNED BY public.groups.id;


--
-- Name: job_dependencies; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.job_dependencies OWNER TO neondb_owner;

--
-- Name: job_dependencies_dependency_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.job_dependencies_dependency_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.job_dependencies_dependency_id_seq OWNER TO neondb_owner;

--
-- Name: job_dependencies_dependency_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.job_dependencies_dependency_id_seq OWNED BY public.job_dependencies.dependency_id;


--
-- Name: job_group_dependencies; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.job_group_dependencies OWNER TO neondb_owner;

--
-- Name: job_group_dependencies_group_dependency_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.job_group_dependencies_group_dependency_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.job_group_dependencies_group_dependency_id_seq OWNER TO neondb_owner;

--
-- Name: job_group_dependencies_group_dependency_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.job_group_dependencies_group_dependency_id_seq OWNED BY public.job_group_dependencies.group_dependency_id;


--
-- Name: job_group_jobs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.job_group_jobs (
    group_id uuid NOT NULL,
    job_id uuid NOT NULL,
    added_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.job_group_jobs OWNER TO neondb_owner;

--
-- Name: job_group_schedules; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.job_group_schedules OWNER TO neondb_owner;

--
-- Name: job_group_schedules_group_schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.job_group_schedules_group_schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.job_group_schedules_group_schedule_id_seq OWNER TO neondb_owner;

--
-- Name: job_group_schedules_group_schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.job_group_schedules_group_schedule_id_seq OWNED BY public.job_group_schedules.group_schedule_id;


--
-- Name: job_groups; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.job_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.job_groups OWNER TO neondb_owner;

--
-- Name: job_history; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.job_history OWNER TO neondb_owner;

--
-- Name: job_history_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.job_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.job_history_id_seq OWNER TO neondb_owner;

--
-- Name: job_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.job_history_id_seq OWNED BY public.job_history.id;


--
-- Name: job_runs; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.job_runs OWNER TO neondb_owner;

--
-- Name: job_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.job_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.job_runs_id_seq OWNER TO neondb_owner;

--
-- Name: job_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.job_runs_id_seq OWNED BY public.job_runs.id;


--
-- Name: job_schedules; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.job_schedules OWNER TO neondb_owner;

--
-- Name: job_schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.job_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.job_schedules_id_seq OWNER TO neondb_owner;

--
-- Name: job_schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.job_schedules_id_seq OWNED BY public.job_schedules.id;


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.jobs OWNER TO neondb_owner;

--
-- Name: jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.jobs_id_seq OWNER TO neondb_owner;

--
-- Name: jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.jobs_id_seq OWNED BY public.jobs.id;


--
-- Name: mapping_group_executions; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.mapping_group_executions OWNER TO neondb_owner;

--
-- Name: mapping_group_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.mapping_group_executions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.mapping_group_executions_id_seq OWNER TO neondb_owner;

--
-- Name: mapping_group_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.mapping_group_executions_id_seq OWNED BY public.mapping_group_executions.id;


--
-- Name: mapping_group_members; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.mapping_group_members (
    id integer NOT NULL,
    group_id integer NOT NULL,
    mapping_id character varying(255) NOT NULL,
    execution_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.mapping_group_members OWNER TO neondb_owner;

--
-- Name: mapping_group_members_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.mapping_group_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.mapping_group_members_id_seq OWNER TO neondb_owner;

--
-- Name: mapping_group_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.mapping_group_members_id_seq OWNED BY public.mapping_group_members.id;


--
-- Name: mapping_groups; Type: TABLE; Schema: public; Owner: neondb_owner
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
    project_id integer NOT NULL
);


ALTER TABLE public.mapping_groups OWNER TO neondb_owner;

--
-- Name: mapping_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.mapping_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.mapping_groups_id_seq OWNER TO neondb_owner;

--
-- Name: mapping_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.mapping_groups_id_seq OWNED BY public.mapping_groups.id;


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    applied_at timestamp without time zone NOT NULL
);


ALTER TABLE public.migrations OWNER TO neondb_owner;

--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.migrations_id_seq OWNER TO neondb_owner;

--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: n_step_workflow_assets; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.n_step_workflow_assets (
    id integer NOT NULL,
    step_id integer,
    asset_type character varying(20) NOT NULL,
    asset_id character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT n_step_workflow_assets_asset_type_check CHECK (((asset_type)::text = ANY ((ARRAY['mapping'::character varying, 'mapping_group'::character varying])::text[])))
);


ALTER TABLE public.n_step_workflow_assets OWNER TO neondb_owner;

--
-- Name: n_step_workflow_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.n_step_workflow_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.n_step_workflow_assets_id_seq OWNER TO neondb_owner;

--
-- Name: n_step_workflow_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.n_step_workflow_assets_id_seq OWNED BY public.n_step_workflow_assets.id;


--
-- Name: n_step_workflow_run_steps; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.n_step_workflow_run_steps OWNER TO neondb_owner;

--
-- Name: n_step_workflow_run_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.n_step_workflow_run_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.n_step_workflow_run_steps_id_seq OWNER TO neondb_owner;

--
-- Name: n_step_workflow_run_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.n_step_workflow_run_steps_id_seq OWNED BY public.n_step_workflow_run_steps.id;


--
-- Name: n_step_workflow_runs; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.n_step_workflow_runs OWNER TO neondb_owner;

--
-- Name: n_step_workflow_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.n_step_workflow_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.n_step_workflow_runs_id_seq OWNER TO neondb_owner;

--
-- Name: n_step_workflow_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.n_step_workflow_runs_id_seq OWNED BY public.n_step_workflow_runs.id;


--
-- Name: n_step_workflow_steps; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.n_step_workflow_steps (
    id integer NOT NULL,
    workflow_id integer,
    step_index integer NOT NULL,
    is_active boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.n_step_workflow_steps OWNER TO neondb_owner;

--
-- Name: n_step_workflow_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.n_step_workflow_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.n_step_workflow_steps_id_seq OWNER TO neondb_owner;

--
-- Name: n_step_workflow_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.n_step_workflow_steps_id_seq OWNED BY public.n_step_workflow_steps.id;


--
-- Name: n_step_workflows; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.n_step_workflows (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    project_id integer
);


ALTER TABLE public.n_step_workflows OWNER TO neondb_owner;

--
-- Name: n_step_workflows_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.n_step_workflows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.n_step_workflows_id_seq OWNER TO neondb_owner;

--
-- Name: n_step_workflows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.n_step_workflows_id_seq OWNED BY public.n_step_workflows.id;


--
-- Name: password_reset_requests; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.password_reset_requests OWNER TO neondb_owner;

--
-- Name: password_reset_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.password_reset_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.password_reset_requests_id_seq OWNER TO neondb_owner;

--
-- Name: password_reset_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.password_reset_requests_id_seq OWNED BY public.password_reset_requests.id;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.permissions (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    resource character varying(100) NOT NULL,
    action character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.permissions OWNER TO neondb_owner;

--
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.permissions_id_seq OWNER TO neondb_owner;

--
-- Name: permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.permissions_id_seq OWNED BY public.permissions.id;


--
-- Name: policy_evaluation_cache; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.policy_evaluation_cache OWNER TO neondb_owner;

--
-- Name: profiling_metrics; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.profiling_metrics OWNER TO neondb_owner;

--
-- Name: profiling_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.profiling_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.profiling_metrics_id_seq OWNER TO neondb_owner;

--
-- Name: profiling_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.profiling_metrics_id_seq OWNED BY public.profiling_metrics.id;


--
-- Name: project_access_groups; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.project_access_groups (
    project_id integer NOT NULL,
    group_id integer NOT NULL,
    added_by integer,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.project_access_groups OWNER TO neondb_owner;

--
-- Name: project_members; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.project_members OWNER TO neondb_owner;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: neondb_owner
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
    CONSTRAINT check_not_self_parent CHECK ((id <> parent_id)),
    CONSTRAINT projects_project_type_check CHECK (((project_type)::text = ANY ((ARRAY['internal'::character varying, 'external'::character varying])::text[])))
);


ALTER TABLE public.projects OWNER TO neondb_owner;

--
-- Name: COLUMN projects.is_archived; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.projects.is_archived IS 'Whether the project is archived (soft deleted)';


--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.projects_id_seq OWNER TO neondb_owner;

--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: quality_reports; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.quality_reports OWNER TO neondb_owner;

--
-- Name: rbac_policies; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.rbac_policies OWNER TO neondb_owner;

--
-- Name: rbac_policies_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.rbac_policies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.rbac_policies_id_seq OWNER TO neondb_owner;

--
-- Name: rbac_policies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.rbac_policies_id_seq OWNED BY public.rbac_policies.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.refresh_tokens OWNER TO neondb_owner;

--
-- Name: resource_attributes; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.resource_attributes OWNER TO neondb_owner;

--
-- Name: resource_attributes_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.resource_attributes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.resource_attributes_id_seq OWNER TO neondb_owner;

--
-- Name: resource_attributes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.resource_attributes_id_seq OWNED BY public.resource_attributes.id;


--
-- Name: resource_policy_attachments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.resource_policy_attachments (
    resource_type character varying(50) NOT NULL,
    resource_id character varying(255) NOT NULL,
    policy_id integer NOT NULL,
    attached_by integer,
    attached_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.resource_policy_attachments OWNER TO neondb_owner;

--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.role_permissions (
    role_id integer NOT NULL,
    permission_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.role_permissions OWNER TO neondb_owner;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    permissions text[] DEFAULT '{}'::text[],
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.roles OWNER TO neondb_owner;

--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.roles_id_seq OWNER TO neondb_owner;

--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: schedules; Type: TABLE; Schema: public; Owner: neondb_owner
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
    project_id integer NOT NULL,
    CONSTRAINT schedules_entity_type_check CHECK ((entity_type = ANY (ARRAY['mapping'::text, 'mapping_group'::text, 'workflow'::text, 'bulk_profiling_job'::text]))),
    CONSTRAINT schedules_interval_unit_check CHECK ((interval_unit = ANY (ARRAY['minute'::text, 'hour'::text, 'day'::text, 'week'::text, 'month'::text, 'year'::text]))),
    CONSTRAINT schedules_schedule_type_check CHECK ((schedule_type = ANY (ARRAY['cron'::text, 'interval'::text]))),
    CONSTRAINT valid_cron CHECK ((((schedule_type = 'cron'::text) AND (cron_expression IS NOT NULL)) OR ((schedule_type = 'interval'::text) AND (interval_value IS NOT NULL) AND (interval_unit IS NOT NULL))))
);


ALTER TABLE public.schedules OWNER TO neondb_owner;

--
-- Name: schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.schedules_id_seq OWNER TO neondb_owner;

--
-- Name: schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.schedules_id_seq OWNED BY public.schedules.id;


--
-- Name: scim_configurations; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.scim_configurations OWNER TO neondb_owner;

--
-- Name: scim_configurations_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.scim_configurations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.scim_configurations_id_seq OWNER TO neondb_owner;

--
-- Name: scim_configurations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.scim_configurations_id_seq OWNED BY public.scim_configurations.id;


--
-- Name: scim_resource_mappings; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.scim_resource_mappings OWNER TO neondb_owner;

--
-- Name: scim_resource_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.scim_resource_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.scim_resource_mappings_id_seq OWNER TO neondb_owner;

--
-- Name: scim_resource_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.scim_resource_mappings_id_seq OWNED BY public.scim_resource_mappings.id;


--
-- Name: scim_sync_logs; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.scim_sync_logs OWNER TO neondb_owner;

--
-- Name: scim_sync_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.scim_sync_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.scim_sync_logs_id_seq OWNER TO neondb_owner;

--
-- Name: scim_sync_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.scim_sync_logs_id_seq OWNED BY public.scim_sync_logs.id;


--
-- Name: security_audit_log; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.security_audit_log OWNER TO neondb_owner;

--
-- Name: security_audit_log_security_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.security_audit_log_security_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.security_audit_log_security_audit_id_seq OWNER TO neondb_owner;

--
-- Name: security_audit_log_security_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.security_audit_log_security_audit_id_seq OWNED BY public.security_audit_log.security_audit_id;


--
-- Name: storage_connections; Type: TABLE; Schema: public; Owner: neondb_owner
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
    CONSTRAINT storage_connections_authentication_method_check CHECK (((authentication_method)::text = ANY ((ARRAY['key-based'::character varying, 'aws-iam-role'::character varying, 'gcp-sa-oidc'::character varying, 'azure-managed-identity'::character varying, 'db-short-lived-token'::character varying, 'oauth2'::character varying, 'kerberos'::character varying])::text[]))),
    CONSTRAINT storage_connections_connection_user_check CHECK (((connection_user)::text = ANY ((ARRAY['Internal'::character varying, 'External'::character varying])::text[])))
);


ALTER TABLE public.storage_connections OWNER TO neondb_owner;

--
-- Name: tag_permissions; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.tag_permissions OWNER TO neondb_owner;

--
-- Name: tag_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.tag_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tag_permissions_id_seq OWNER TO neondb_owner;

--
-- Name: tag_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.tag_permissions_id_seq OWNED BY public.tag_permissions.id;


--
-- Name: transform_connections; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.transform_connections OWNER TO neondb_owner;

--
-- Name: transform_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.transform_connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transform_connections_id_seq OWNER TO neondb_owner;

--
-- Name: transform_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.transform_connections_id_seq OWNED BY public.transform_connections.id;


--
-- Name: transformation_executions; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.transformation_executions OWNER TO neondb_owner;

--
-- Name: transformation_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.transformation_executions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transformation_executions_id_seq OWNER TO neondb_owner;

--
-- Name: transformation_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.transformation_executions_id_seq OWNED BY public.transformation_executions.id;


--
-- Name: transformation_jobs; Type: TABLE; Schema: public; Owner: neondb_owner
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
    CONSTRAINT transformation_jobs_schema_validation_check CHECK (((schema_validation)::text = ANY ((ARRAY['Pass'::character varying, 'Fail'::character varying, NULL::character varying])::text[])))
);


ALTER TABLE public.transformation_jobs OWNER TO neondb_owner;

--
-- Name: transformation_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.transformation_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transformation_jobs_id_seq OWNER TO neondb_owner;

--
-- Name: transformation_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.transformation_jobs_id_seq OWNED BY public.transformation_jobs.id;


--
-- Name: transformation_lineage; Type: TABLE; Schema: public; Owner: neondb_owner
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
    target_schema jsonb
);


ALTER TABLE public.transformation_lineage OWNER TO neondb_owner;

--
-- Name: transformation_lineage_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.transformation_lineage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transformation_lineage_id_seq OWNER TO neondb_owner;

--
-- Name: transformation_lineage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.transformation_lineage_id_seq OWNED BY public.transformation_lineage.id;


--
-- Name: transformation_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.transformation_logs (
    id integer NOT NULL,
    job_id character varying(255) NOT NULL,
    log_level character varying(20) NOT NULL,
    message text NOT NULL,
    log_details jsonb,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.transformation_logs OWNER TO neondb_owner;

--
-- Name: transformation_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.transformation_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transformation_logs_id_seq OWNER TO neondb_owner;

--
-- Name: transformation_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.transformation_logs_id_seq OWNED BY public.transformation_logs.id;


--
-- Name: transformation_mappings; Type: TABLE; Schema: public; Owner: neondb_owner
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
    CONSTRAINT transformation_mappings_schema_drift_handling_check CHECK (((schema_drift_handling)::text = ANY ((ARRAY['abort'::character varying, 'alert'::character varying, 'none'::character varying])::text[]))),
    CONSTRAINT transformation_mappings_source_exclusivity CHECK ((((source_connection_id IS NOT NULL) AND (vendor_agreement_id IS NULL)) OR ((source_connection_id IS NULL) AND (vendor_agreement_id IS NOT NULL))))
);


ALTER TABLE public.transformation_mappings OWNER TO neondb_owner;

--
-- Name: transformation_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.transformation_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transformation_mappings_id_seq OWNER TO neondb_owner;

--
-- Name: transformation_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.transformation_mappings_id_seq OWNED BY public.transformation_mappings.id;


--
-- Name: transformation_outputs; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.transformation_outputs OWNER TO neondb_owner;

--
-- Name: transformation_outputs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.transformation_outputs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transformation_outputs_id_seq OWNER TO neondb_owner;

--
-- Name: transformation_outputs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.transformation_outputs_id_seq OWNED BY public.transformation_outputs.id;


--
-- Name: transformations; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.transformations OWNER TO neondb_owner;

--
-- Name: transformations_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.transformations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transformations_id_seq OWNER TO neondb_owner;

--
-- Name: transformations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.transformations_id_seq OWNED BY public.transformations.id;


--
-- Name: user_attributes; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.user_attributes OWNER TO neondb_owner;

--
-- Name: user_attributes_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.user_attributes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_attributes_id_seq OWNER TO neondb_owner;

--
-- Name: user_attributes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.user_attributes_id_seq OWNED BY public.user_attributes.id;


--
-- Name: user_badges; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_badges (
    id integer NOT NULL,
    badge_id character varying(50) NOT NULL,
    score numeric,
    file_id character varying(50),
    earned_date timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_badges OWNER TO neondb_owner;

--
-- Name: user_badges_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.user_badges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_badges_id_seq OWNER TO neondb_owner;

--
-- Name: user_badges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.user_badges_id_seq OWNED BY public.user_badges.id;


--
-- Name: user_dashboard_settings; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_dashboard_settings (
    id integer NOT NULL,
    user_id character varying(50) DEFAULT 'default'::character varying,
    settings json NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_dashboard_settings OWNER TO neondb_owner;

--
-- Name: user_dashboard_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.user_dashboard_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_dashboard_settings_id_seq OWNER TO neondb_owner;

--
-- Name: user_dashboard_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.user_dashboard_settings_id_seq OWNED BY public.user_dashboard_settings.id;


--
-- Name: user_groups; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_groups (
    user_id integer NOT NULL,
    group_id integer NOT NULL
);


ALTER TABLE public.user_groups OWNER TO neondb_owner;

--
-- Name: user_job_groups; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_job_groups (
    user_id uuid NOT NULL,
    group_id uuid NOT NULL
);


ALTER TABLE public.user_job_groups OWNER TO neondb_owner;

--
-- Name: user_policy_attachments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_policy_attachments (
    user_id integer NOT NULL,
    policy_id integer NOT NULL,
    attached_by integer,
    attached_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_policy_attachments OWNER TO neondb_owner;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_roles (
    user_id integer NOT NULL,
    role_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_roles OWNER TO neondb_owner;

--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token character varying(1000) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_sessions OWNER TO neondb_owner;

--
-- Name: user_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.user_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_sessions_id_seq OWNER TO neondb_owner;

--
-- Name: user_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.user_sessions_id_seq OWNED BY public.user_sessions.id;


--
-- Name: user_uuid_mapping; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_uuid_mapping (
    user_id integer NOT NULL,
    uuid uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_uuid_mapping OWNER TO neondb_owner;

--
-- Name: users; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.users OWNER TO neondb_owner;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO neondb_owner;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vendor_agreement_approvals; Type: TABLE; Schema: public; Owner: neondb_owner
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
    CONSTRAINT vendor_agreement_approvals_action_check CHECK (((action)::text = ANY ((ARRAY['approved'::character varying, 'rejected'::character varying, 'revoked'::character varying])::text[]))),
    CONSTRAINT vendor_agreement_approvals_approver_type_check CHECK (((approver_type)::text = ANY ((ARRAY['vendor'::character varying, 'owner'::character varying])::text[])))
);


ALTER TABLE public.vendor_agreement_approvals OWNER TO neondb_owner;

--
-- Name: vendor_agreement_approvals_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.vendor_agreement_approvals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendor_agreement_approvals_id_seq OWNER TO neondb_owner;

--
-- Name: vendor_agreement_approvals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.vendor_agreement_approvals_id_seq OWNED BY public.vendor_agreement_approvals.id;


--
-- Name: vendor_agreement_changes; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.vendor_agreement_changes OWNER TO neondb_owner;

--
-- Name: vendor_agreement_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.vendor_agreement_changes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendor_agreement_changes_id_seq OWNER TO neondb_owner;

--
-- Name: vendor_agreement_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.vendor_agreement_changes_id_seq OWNED BY public.vendor_agreement_changes.id;


--
-- Name: vendor_agreements; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.vendor_agreements (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    agreement_code character varying(100) NOT NULL,
    file_name character varying(500) NOT NULL,
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
    CONSTRAINT vendor_agreements_approval_status_check CHECK (((approval_status)::text = ANY ((ARRAY['draft'::character varying, 'pending_approval'::character varying, 'vendor_approved'::character varying, 'owner_approved'::character varying, 'fully_approved'::character varying, 'rejected'::character varying, 'changes_pending'::character varying])::text[]))),
    CONSTRAINT vendor_agreements_data_classification_check CHECK ((((data_classification)::text = ANY ((ARRAY['Public'::character varying, 'Private'::character varying, 'Confidential'::character varying])::text[])) OR (data_classification IS NULL))),
    CONSTRAINT vendor_agreements_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'archived'::character varying, 'draft'::character varying, 'pending'::character varying])::text[])))
);


ALTER TABLE public.vendor_agreements OWNER TO neondb_owner;

--
-- Name: vendor_agreements_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.vendor_agreements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendor_agreements_id_seq OWNER TO neondb_owner;

--
-- Name: vendor_agreements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.vendor_agreements_id_seq OWNED BY public.vendor_agreements.id;


--
-- Name: vendor_file_profiling_results; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.vendor_file_profiling_results OWNER TO neondb_owner;

--
-- Name: vendor_file_profiling_results_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.vendor_file_profiling_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendor_file_profiling_results_id_seq OWNER TO neondb_owner;

--
-- Name: vendor_file_profiling_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.vendor_file_profiling_results_id_seq OWNED BY public.vendor_file_profiling_results.id;


--
-- Name: vendor_users; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.vendor_users OWNER TO neondb_owner;

--
-- Name: vendor_users_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.vendor_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendor_users_id_seq OWNER TO neondb_owner;

--
-- Name: vendor_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.vendor_users_id_seq OWNED BY public.vendor_users.id;


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.vendors OWNER TO neondb_owner;

--
-- Name: vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendors_id_seq OWNER TO neondb_owner;

--
-- Name: vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.vendors_id_seq OWNED BY public.vendors.id;


--
-- Name: visual_workflows; Type: TABLE; Schema: public; Owner: neondb_owner
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
    is_active boolean DEFAULT true
);


ALTER TABLE public.visual_workflows OWNER TO neondb_owner;

--
-- Name: visual_workflows_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.visual_workflows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.visual_workflows_id_seq OWNER TO neondb_owner;

--
-- Name: visual_workflows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.visual_workflows_id_seq OWNED BY public.visual_workflows.id;


--
-- Name: workflow_executions; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.workflow_executions OWNER TO neondb_owner;

--
-- Name: workflow_executions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.workflow_executions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.workflow_executions_id_seq OWNER TO neondb_owner;

--
-- Name: workflow_executions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.workflow_executions_id_seq OWNED BY public.workflow_executions.id;


--
-- Name: workflow_steps; Type: TABLE; Schema: public; Owner: neondb_owner
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


ALTER TABLE public.workflow_steps OWNER TO neondb_owner;

--
-- Name: workflow_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.workflow_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.workflow_steps_id_seq OWNER TO neondb_owner;

--
-- Name: workflow_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.workflow_steps_id_seq OWNED BY public.workflow_steps.id;


--
-- Name: access_group_roles id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_group_roles ALTER COLUMN id SET DEFAULT nextval('public.access_group_roles_id_seq'::regclass);


--
-- Name: access_groups id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_groups ALTER COLUMN id SET DEFAULT nextval('public.access_groups_id_seq'::regclass);


--
-- Name: alert_history id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.alert_history ALTER COLUMN id SET DEFAULT nextval('public.alert_history_id_seq'::regclass);


--
-- Name: alert_rules id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.alert_rules ALTER COLUMN id SET DEFAULT nextval('public.alert_rules_id_seq'::regclass);


--
-- Name: anomalies id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.anomalies ALTER COLUMN id SET DEFAULT nextval('public.anomalies_id_seq'::regclass);


--
-- Name: app_settings id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.app_settings ALTER COLUMN id SET DEFAULT nextval('public.app_settings_id_seq'::regclass);


--
-- Name: attribute_definitions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.attribute_definitions ALTER COLUMN id SET DEFAULT nextval('public.attribute_definitions_id_seq'::regclass);


--
-- Name: audit_log audit_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN audit_id SET DEFAULT nextval('public.audit_log_audit_id_seq'::regclass);


--
-- Name: bulk_profiling_files id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bulk_profiling_files ALTER COLUMN id SET DEFAULT nextval('public.bulk_profiling_files_id_seq'::regclass);


--
-- Name: business_processes id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.business_processes ALTER COLUMN id SET DEFAULT nextval('public.business_processes_id_seq'::regclass);


--
-- Name: column_governance_tag_assignments assignment_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_governance_tag_assignments ALTER COLUMN assignment_id SET DEFAULT nextval('public.column_governance_tag_assignments_assignment_id_seq'::regclass);


--
-- Name: column_mappings id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_mappings ALTER COLUMN id SET DEFAULT nextval('public.column_mappings_id_seq'::regclass);


--
-- Name: column_policy_assignments assignment_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_policy_assignments ALTER COLUMN assignment_id SET DEFAULT nextval('public.column_policy_assignments_assignment_id_seq'::regclass);


--
-- Name: column_sensitivity_tags tag_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_sensitivity_tags ALTER COLUMN tag_id SET DEFAULT nextval('public.column_sensitivity_tags_tag_id_seq'::regclass);


--
-- Name: config_change_history change_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.config_change_history ALTER COLUMN change_id SET DEFAULT nextval('public.config_change_history_change_id_seq'::regclass);


--
-- Name: connections id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connections ALTER COLUMN id SET DEFAULT nextval('public.connections_id_seq'::regclass);


--
-- Name: data_access_log access_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.data_access_log ALTER COLUMN access_id SET DEFAULT nextval('public.data_access_log_access_id_seq'::regclass);


--
-- Name: dbt_executions execution_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.dbt_executions ALTER COLUMN execution_id SET DEFAULT nextval('public.dbt_executions_execution_id_seq'::regclass);


--
-- Name: dbt_models model_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.dbt_models ALTER COLUMN model_id SET DEFAULT nextval('public.dbt_models_model_id_seq'::regclass);


--
-- Name: drop_location_config id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.drop_location_config ALTER COLUMN id SET DEFAULT nextval('public.drop_location_config_id_seq'::regclass);


--
-- Name: execution_audit audit_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.execution_audit ALTER COLUMN audit_id SET DEFAULT nextval('public.execution_audit_audit_id_seq'::regclass);


--
-- Name: file_audit_details id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_audit_details ALTER COLUMN id SET DEFAULT nextval('public.file_audit_details_id_seq'::regclass);


--
-- Name: file_columns id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_columns ALTER COLUMN id SET DEFAULT nextval('public.file_columns_id_seq'::regclass);


--
-- Name: file_history id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_history ALTER COLUMN id SET DEFAULT nextval('public.file_history_id_seq'::regclass);


--
-- Name: file_lineage id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_lineage ALTER COLUMN id SET DEFAULT nextval('public.file_lineage_id_seq'::regclass);


--
-- Name: file_mappings id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_mappings ALTER COLUMN id SET DEFAULT nextval('public.file_mappings_id_seq'::regclass);


--
-- Name: file_ownership ownership_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_ownership ALTER COLUMN ownership_id SET DEFAULT nextval('public.file_ownership_ownership_id_seq'::regclass);


--
-- Name: file_pattern_metrics id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_pattern_metrics ALTER COLUMN id SET DEFAULT nextval('public.file_pattern_metrics_id_seq'::regclass);


--
-- Name: file_policy_assignments assignment_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_policy_assignments ALTER COLUMN assignment_id SET DEFAULT nextval('public.file_policy_assignments_assignment_id_seq'::regclass);


--
-- Name: file_preview_data preview_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_preview_data ALTER COLUMN preview_id SET DEFAULT nextval('public.file_preview_data_preview_id_seq'::regclass);


--
-- Name: file_quality_checks id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_quality_checks ALTER COLUMN id SET DEFAULT nextval('public.file_quality_checks_id_seq'::regclass);


--
-- Name: file_schedules id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_schedules ALTER COLUMN id SET DEFAULT nextval('public.file_schedules_id_seq'::regclass);


--
-- Name: file_schema_details id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_schema_details ALTER COLUMN id SET DEFAULT nextval('public.file_schema_details_id_seq'::regclass);


--
-- Name: file_schemas id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_schemas ALTER COLUMN id SET DEFAULT nextval('public.file_schemas_id_seq'::regclass);


--
-- Name: file_tag_assignments assignment_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_tag_assignments ALTER COLUMN assignment_id SET DEFAULT nextval('public.file_tag_assignments_assignment_id_seq'::regclass);


--
-- Name: files id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.files ALTER COLUMN id SET DEFAULT nextval('public.files_id_seq'::regclass);


--
-- Name: groups id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.groups ALTER COLUMN id SET DEFAULT nextval('public.groups_id_seq'::regclass);


--
-- Name: job_dependencies dependency_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_dependencies ALTER COLUMN dependency_id SET DEFAULT nextval('public.job_dependencies_dependency_id_seq'::regclass);


--
-- Name: job_group_dependencies group_dependency_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_group_dependencies ALTER COLUMN group_dependency_id SET DEFAULT nextval('public.job_group_dependencies_group_dependency_id_seq'::regclass);


--
-- Name: job_group_schedules group_schedule_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_group_schedules ALTER COLUMN group_schedule_id SET DEFAULT nextval('public.job_group_schedules_group_schedule_id_seq'::regclass);


--
-- Name: job_history id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_history ALTER COLUMN id SET DEFAULT nextval('public.job_history_id_seq'::regclass);


--
-- Name: job_runs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_runs ALTER COLUMN id SET DEFAULT nextval('public.job_runs_id_seq'::regclass);


--
-- Name: job_schedules id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_schedules ALTER COLUMN id SET DEFAULT nextval('public.job_schedules_id_seq'::regclass);


--
-- Name: jobs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.jobs ALTER COLUMN id SET DEFAULT nextval('public.jobs_id_seq'::regclass);


--
-- Name: mapping_group_executions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mapping_group_executions ALTER COLUMN id SET DEFAULT nextval('public.mapping_group_executions_id_seq'::regclass);


--
-- Name: mapping_group_members id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mapping_group_members ALTER COLUMN id SET DEFAULT nextval('public.mapping_group_members_id_seq'::regclass);


--
-- Name: mapping_groups id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mapping_groups ALTER COLUMN id SET DEFAULT nextval('public.mapping_groups_id_seq'::regclass);


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: n_step_workflow_assets id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_assets ALTER COLUMN id SET DEFAULT nextval('public.n_step_workflow_assets_id_seq'::regclass);


--
-- Name: n_step_workflow_run_steps id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_run_steps ALTER COLUMN id SET DEFAULT nextval('public.n_step_workflow_run_steps_id_seq'::regclass);


--
-- Name: n_step_workflow_runs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_runs ALTER COLUMN id SET DEFAULT nextval('public.n_step_workflow_runs_id_seq'::regclass);


--
-- Name: n_step_workflow_steps id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_steps ALTER COLUMN id SET DEFAULT nextval('public.n_step_workflow_steps_id_seq'::regclass);


--
-- Name: n_step_workflows id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflows ALTER COLUMN id SET DEFAULT nextval('public.n_step_workflows_id_seq'::regclass);


--
-- Name: password_reset_requests id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.password_reset_requests ALTER COLUMN id SET DEFAULT nextval('public.password_reset_requests_id_seq'::regclass);


--
-- Name: permissions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.permissions ALTER COLUMN id SET DEFAULT nextval('public.permissions_id_seq'::regclass);


--
-- Name: profiling_metrics id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.profiling_metrics ALTER COLUMN id SET DEFAULT nextval('public.profiling_metrics_id_seq'::regclass);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: rbac_policies id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.rbac_policies ALTER COLUMN id SET DEFAULT nextval('public.rbac_policies_id_seq'::regclass);


--
-- Name: resource_attributes id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.resource_attributes ALTER COLUMN id SET DEFAULT nextval('public.resource_attributes_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: schedules id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.schedules ALTER COLUMN id SET DEFAULT nextval('public.schedules_id_seq'::regclass);


--
-- Name: scim_configurations id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.scim_configurations ALTER COLUMN id SET DEFAULT nextval('public.scim_configurations_id_seq'::regclass);


--
-- Name: scim_resource_mappings id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.scim_resource_mappings ALTER COLUMN id SET DEFAULT nextval('public.scim_resource_mappings_id_seq'::regclass);


--
-- Name: scim_sync_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.scim_sync_logs ALTER COLUMN id SET DEFAULT nextval('public.scim_sync_logs_id_seq'::regclass);


--
-- Name: security_audit_log security_audit_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.security_audit_log ALTER COLUMN security_audit_id SET DEFAULT nextval('public.security_audit_log_security_audit_id_seq'::regclass);


--
-- Name: tag_permissions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tag_permissions ALTER COLUMN id SET DEFAULT nextval('public.tag_permissions_id_seq'::regclass);


--
-- Name: transform_connections id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transform_connections ALTER COLUMN id SET DEFAULT nextval('public.transform_connections_id_seq'::regclass);


--
-- Name: transformation_executions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_executions ALTER COLUMN id SET DEFAULT nextval('public.transformation_executions_id_seq'::regclass);


--
-- Name: transformation_jobs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_jobs ALTER COLUMN id SET DEFAULT nextval('public.transformation_jobs_id_seq'::regclass);


--
-- Name: transformation_lineage id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_lineage ALTER COLUMN id SET DEFAULT nextval('public.transformation_lineage_id_seq'::regclass);


--
-- Name: transformation_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_logs ALTER COLUMN id SET DEFAULT nextval('public.transformation_logs_id_seq'::regclass);


--
-- Name: transformation_mappings id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_mappings ALTER COLUMN id SET DEFAULT nextval('public.transformation_mappings_id_seq'::regclass);


--
-- Name: transformation_outputs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_outputs ALTER COLUMN id SET DEFAULT nextval('public.transformation_outputs_id_seq'::regclass);


--
-- Name: transformations id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformations ALTER COLUMN id SET DEFAULT nextval('public.transformations_id_seq'::regclass);


--
-- Name: user_attributes id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_attributes ALTER COLUMN id SET DEFAULT nextval('public.user_attributes_id_seq'::regclass);


--
-- Name: user_badges id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_badges ALTER COLUMN id SET DEFAULT nextval('public.user_badges_id_seq'::regclass);


--
-- Name: user_dashboard_settings id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_dashboard_settings ALTER COLUMN id SET DEFAULT nextval('public.user_dashboard_settings_id_seq'::regclass);


--
-- Name: user_sessions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_sessions ALTER COLUMN id SET DEFAULT nextval('public.user_sessions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vendor_agreement_approvals id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreement_approvals ALTER COLUMN id SET DEFAULT nextval('public.vendor_agreement_approvals_id_seq'::regclass);


--
-- Name: vendor_agreement_changes id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreement_changes ALTER COLUMN id SET DEFAULT nextval('public.vendor_agreement_changes_id_seq'::regclass);


--
-- Name: vendor_agreements id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreements ALTER COLUMN id SET DEFAULT nextval('public.vendor_agreements_id_seq'::regclass);


--
-- Name: vendor_file_profiling_results id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_file_profiling_results ALTER COLUMN id SET DEFAULT nextval('public.vendor_file_profiling_results_id_seq'::regclass);


--
-- Name: vendor_users id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_users ALTER COLUMN id SET DEFAULT nextval('public.vendor_users_id_seq'::regclass);


--
-- Name: vendors id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendors ALTER COLUMN id SET DEFAULT nextval('public.vendors_id_seq'::regclass);


--
-- Name: visual_workflows id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.visual_workflows ALTER COLUMN id SET DEFAULT nextval('public.visual_workflows_id_seq'::regclass);


--
-- Name: workflow_executions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.workflow_executions ALTER COLUMN id SET DEFAULT nextval('public.workflow_executions_id_seq'::regclass);


--
-- Name: workflow_steps id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.workflow_steps ALTER COLUMN id SET DEFAULT nextval('public.workflow_steps_id_seq'::regclass);


--
-- Name: access_group_members access_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_group_members
    ADD CONSTRAINT access_group_members_pkey PRIMARY KEY (group_id, user_id);


--
-- Name: access_group_roles access_group_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_group_roles
    ADD CONSTRAINT access_group_roles_pkey PRIMARY KEY (id);


--
-- Name: access_groups access_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_groups
    ADD CONSTRAINT access_groups_pkey PRIMARY KEY (id);


--
-- Name: alert_history alert_history_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.alert_history
    ADD CONSTRAINT alert_history_pkey PRIMARY KEY (id);


--
-- Name: alert_rules alert_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.alert_rules
    ADD CONSTRAINT alert_rules_pkey PRIMARY KEY (id);


--
-- Name: anomalies anomalies_anomaly_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.anomalies
    ADD CONSTRAINT anomalies_anomaly_id_key UNIQUE (anomaly_id);


--
-- Name: anomalies anomalies_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.anomalies
    ADD CONSTRAINT anomalies_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: attribute_definitions attribute_definitions_attribute_key_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.attribute_definitions
    ADD CONSTRAINT attribute_definitions_attribute_key_key UNIQUE (attribute_key);


--
-- Name: attribute_definitions attribute_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.attribute_definitions
    ADD CONSTRAINT attribute_definitions_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (audit_id);


--
-- Name: bulk_profiling_files bulk_profiling_files_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bulk_profiling_files
    ADD CONSTRAINT bulk_profiling_files_pkey PRIMARY KEY (id);


--
-- Name: bulk_profiling_jobs bulk_profiling_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bulk_profiling_jobs
    ADD CONSTRAINT bulk_profiling_jobs_pkey PRIMARY KEY (id);


--
-- Name: business_processes business_processes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.business_processes
    ADD CONSTRAINT business_processes_pkey PRIMARY KEY (id);


--
-- Name: column_governance_tag_assignments column_governance_tag_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_governance_tag_assignments
    ADD CONSTRAINT column_governance_tag_assignments_pkey PRIMARY KEY (assignment_id);


--
-- Name: column_mappings column_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_mappings
    ADD CONSTRAINT column_mappings_pkey PRIMARY KEY (id);


--
-- Name: column_policy_assignments column_policy_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_policy_assignments
    ADD CONSTRAINT column_policy_assignments_pkey PRIMARY KEY (assignment_id);


--
-- Name: column_sensitivity_tags column_sensitivity_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_sensitivity_tags
    ADD CONSTRAINT column_sensitivity_tags_pkey PRIMARY KEY (tag_id);


--
-- Name: config_change_history config_change_history_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.config_change_history
    ADD CONSTRAINT config_change_history_pkey PRIMARY KEY (change_id);


--
-- Name: connections connections_connection_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_connection_name_key UNIQUE (connection_name);


--
-- Name: connections connections_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_pkey PRIMARY KEY (id);


--
-- Name: data_access_log data_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.data_access_log
    ADD CONSTRAINT data_access_log_pkey PRIMARY KEY (access_id);


--
-- Name: dbt_executions dbt_executions_execution_uuid_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.dbt_executions
    ADD CONSTRAINT dbt_executions_execution_uuid_key UNIQUE (execution_uuid);


--
-- Name: dbt_executions dbt_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.dbt_executions
    ADD CONSTRAINT dbt_executions_pkey PRIMARY KEY (execution_id);


--
-- Name: dbt_models dbt_models_model_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.dbt_models
    ADD CONSTRAINT dbt_models_model_name_key UNIQUE (model_name);


--
-- Name: dbt_models dbt_models_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.dbt_models
    ADD CONSTRAINT dbt_models_pkey PRIMARY KEY (model_id);


--
-- Name: drop_location_config drop_location_config_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.drop_location_config
    ADD CONSTRAINT drop_location_config_pkey PRIMARY KEY (id);


--
-- Name: execution_audit execution_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.execution_audit
    ADD CONSTRAINT execution_audit_pkey PRIMARY KEY (audit_id);


--
-- Name: file_audit_details file_audit_details_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_audit_details
    ADD CONSTRAINT file_audit_details_pkey PRIMARY KEY (id);


--
-- Name: file_columns file_columns_file_id_column_name_file_role_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_columns
    ADD CONSTRAINT file_columns_file_id_column_name_file_role_key UNIQUE (file_id, column_name, file_role);


--
-- Name: file_columns file_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_columns
    ADD CONSTRAINT file_columns_pkey PRIMARY KEY (id);


--
-- Name: file_history file_history_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_history
    ADD CONSTRAINT file_history_pkey PRIMARY KEY (id);


--
-- Name: file_lineage file_lineage_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_lineage
    ADD CONSTRAINT file_lineage_pkey PRIMARY KEY (id);


--
-- Name: file_mappings file_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_mappings
    ADD CONSTRAINT file_mappings_pkey PRIMARY KEY (id);


--
-- Name: file_ownership file_ownership_file_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_ownership
    ADD CONSTRAINT file_ownership_file_id_key UNIQUE (file_id);


--
-- Name: file_ownership file_ownership_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_ownership
    ADD CONSTRAINT file_ownership_pkey PRIMARY KEY (ownership_id);


--
-- Name: file_pattern_metrics file_pattern_metrics_file_pattern_metric_date_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_pattern_metrics
    ADD CONSTRAINT file_pattern_metrics_file_pattern_metric_date_key UNIQUE (file_pattern, metric_date);


--
-- Name: file_pattern_metrics file_pattern_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_pattern_metrics
    ADD CONSTRAINT file_pattern_metrics_pkey PRIMARY KEY (id);


--
-- Name: file_policy_assignments file_policy_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_policy_assignments
    ADD CONSTRAINT file_policy_assignments_pkey PRIMARY KEY (assignment_id);


--
-- Name: file_preview_data file_preview_data_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_preview_data
    ADD CONSTRAINT file_preview_data_pkey PRIMARY KEY (preview_id);


--
-- Name: file_quality_checks file_quality_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_quality_checks
    ADD CONSTRAINT file_quality_checks_pkey PRIMARY KEY (id);


--
-- Name: file_schedules file_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_schedules
    ADD CONSTRAINT file_schedules_pkey PRIMARY KEY (id);


--
-- Name: file_schema_details file_schema_details_file_id_file_schema_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_schema_details
    ADD CONSTRAINT file_schema_details_file_id_file_schema_id_key UNIQUE (file_id, file_schema_id);


--
-- Name: file_schema_details file_schema_details_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_schema_details
    ADD CONSTRAINT file_schema_details_pkey PRIMARY KEY (id);


--
-- Name: file_schemas file_schemas_file_id_schema_hash_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_schemas
    ADD CONSTRAINT file_schemas_file_id_schema_hash_key UNIQUE (file_id, schema_hash);


--
-- Name: file_schemas file_schemas_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_schemas
    ADD CONSTRAINT file_schemas_pkey PRIMARY KEY (id);


--
-- Name: file_tag_assignments file_tag_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_tag_assignments
    ADD CONSTRAINT file_tag_assignments_pkey PRIMARY KEY (assignment_id);


--
-- Name: files files_file_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_file_id_key UNIQUE (file_id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: governance_policies governance_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.governance_policies
    ADD CONSTRAINT governance_policies_pkey PRIMARY KEY (policy_id);


--
-- Name: governance_tags governance_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.governance_tags
    ADD CONSTRAINT governance_tags_pkey PRIMARY KEY (tag_id);


--
-- Name: governance_tags governance_tags_tag_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.governance_tags
    ADD CONSTRAINT governance_tags_tag_name_key UNIQUE (tag_name);


--
-- Name: group_policy_attachments group_policy_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.group_policy_attachments
    ADD CONSTRAINT group_policy_attachments_pkey PRIMARY KEY (group_id, policy_id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: job_dependencies job_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_dependencies
    ADD CONSTRAINT job_dependencies_pkey PRIMARY KEY (dependency_id);


--
-- Name: job_group_dependencies job_group_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_group_dependencies
    ADD CONSTRAINT job_group_dependencies_pkey PRIMARY KEY (group_dependency_id);


--
-- Name: job_group_jobs job_group_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_group_jobs
    ADD CONSTRAINT job_group_jobs_pkey PRIMARY KEY (group_id, job_id);


--
-- Name: job_group_schedules job_group_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_group_schedules
    ADD CONSTRAINT job_group_schedules_pkey PRIMARY KEY (group_schedule_id);


--
-- Name: job_groups job_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_groups
    ADD CONSTRAINT job_groups_pkey PRIMARY KEY (id);


--
-- Name: job_history job_history_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_history
    ADD CONSTRAINT job_history_pkey PRIMARY KEY (id);


--
-- Name: job_runs job_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_runs
    ADD CONSTRAINT job_runs_pkey PRIMARY KEY (id);


--
-- Name: job_schedules job_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_schedules
    ADD CONSTRAINT job_schedules_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: mapping_group_executions mapping_group_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mapping_group_executions
    ADD CONSTRAINT mapping_group_executions_pkey PRIMARY KEY (id);


--
-- Name: mapping_group_members mapping_group_members_group_id_mapping_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mapping_group_members
    ADD CONSTRAINT mapping_group_members_group_id_mapping_id_key UNIQUE (group_id, mapping_id);


--
-- Name: mapping_group_members mapping_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mapping_group_members
    ADD CONSTRAINT mapping_group_members_pkey PRIMARY KEY (id);


--
-- Name: mapping_groups mapping_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mapping_groups
    ADD CONSTRAINT mapping_groups_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: n_step_workflow_assets n_step_workflow_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_assets
    ADD CONSTRAINT n_step_workflow_assets_pkey PRIMARY KEY (id);


--
-- Name: n_step_workflow_run_steps n_step_workflow_run_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_run_steps
    ADD CONSTRAINT n_step_workflow_run_steps_pkey PRIMARY KEY (id);


--
-- Name: n_step_workflow_runs n_step_workflow_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_runs
    ADD CONSTRAINT n_step_workflow_runs_pkey PRIMARY KEY (id);


--
-- Name: n_step_workflow_runs n_step_workflow_runs_run_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_runs
    ADD CONSTRAINT n_step_workflow_runs_run_id_key UNIQUE (run_id);


--
-- Name: n_step_workflow_steps n_step_workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_steps
    ADD CONSTRAINT n_step_workflow_steps_pkey PRIMARY KEY (id);


--
-- Name: n_step_workflow_steps n_step_workflow_steps_workflow_id_step_index_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_steps
    ADD CONSTRAINT n_step_workflow_steps_workflow_id_step_index_key UNIQUE (workflow_id, step_index);


--
-- Name: n_step_workflows n_step_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflows
    ADD CONSTRAINT n_step_workflows_pkey PRIMARY KEY (id);


--
-- Name: password_reset_requests password_reset_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.password_reset_requests
    ADD CONSTRAINT password_reset_requests_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_name_key UNIQUE (name);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_resource_action_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_resource_action_key UNIQUE (resource, action);


--
-- Name: policy_evaluation_cache policy_evaluation_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.policy_evaluation_cache
    ADD CONSTRAINT policy_evaluation_cache_pkey PRIMARY KEY (cache_key);


--
-- Name: profiling_metrics profiling_metrics_file_id_file_role_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.profiling_metrics
    ADD CONSTRAINT profiling_metrics_file_id_file_role_key UNIQUE (file_id, file_role);


--
-- Name: profiling_metrics profiling_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.profiling_metrics
    ADD CONSTRAINT profiling_metrics_pkey PRIMARY KEY (id);


--
-- Name: project_access_groups project_access_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.project_access_groups
    ADD CONSTRAINT project_access_groups_pkey PRIMARY KEY (project_id, group_id);


--
-- Name: project_members project_members_project_user_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_user_unique UNIQUE (project_id, user_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: quality_reports quality_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.quality_reports
    ADD CONSTRAINT quality_reports_pkey PRIMARY KEY (report_id);


--
-- Name: rbac_policies rbac_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.rbac_policies
    ADD CONSTRAINT rbac_policies_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token);


--
-- Name: resource_attributes resource_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.resource_attributes
    ADD CONSTRAINT resource_attributes_pkey PRIMARY KEY (id);


--
-- Name: resource_policy_attachments resource_policy_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.resource_policy_attachments
    ADD CONSTRAINT resource_policy_attachments_pkey PRIMARY KEY (resource_type, resource_id, policy_id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);


--
-- Name: scim_configurations scim_configurations_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.scim_configurations
    ADD CONSTRAINT scim_configurations_name_key UNIQUE (name);


--
-- Name: scim_configurations scim_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.scim_configurations
    ADD CONSTRAINT scim_configurations_pkey PRIMARY KEY (id);


--
-- Name: scim_resource_mappings scim_resource_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.scim_resource_mappings
    ADD CONSTRAINT scim_resource_mappings_pkey PRIMARY KEY (id);


--
-- Name: scim_sync_logs scim_sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.scim_sync_logs
    ADD CONSTRAINT scim_sync_logs_pkey PRIMARY KEY (id);


--
-- Name: security_audit_log security_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.security_audit_log
    ADD CONSTRAINT security_audit_log_pkey PRIMARY KEY (security_audit_id);


--
-- Name: storage_connections storage_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.storage_connections
    ADD CONSTRAINT storage_connections_pkey PRIMARY KEY (connection_id);


--
-- Name: tag_permissions tag_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tag_permissions
    ADD CONSTRAINT tag_permissions_pkey PRIMARY KEY (id);


--
-- Name: transform_connections transform_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transform_connections
    ADD CONSTRAINT transform_connections_pkey PRIMARY KEY (id);


--
-- Name: transformation_executions transformation_executions_execution_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_executions
    ADD CONSTRAINT transformation_executions_execution_id_key UNIQUE (execution_id);


--
-- Name: transformation_executions transformation_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_executions
    ADD CONSTRAINT transformation_executions_pkey PRIMARY KEY (id);


--
-- Name: transformation_jobs transformation_jobs_job_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_jobs
    ADD CONSTRAINT transformation_jobs_job_id_key UNIQUE (job_id);


--
-- Name: transformation_jobs transformation_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_jobs
    ADD CONSTRAINT transformation_jobs_pkey PRIMARY KEY (id);


--
-- Name: transformation_lineage transformation_lineage_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_lineage
    ADD CONSTRAINT transformation_lineage_pkey PRIMARY KEY (id);


--
-- Name: transformation_logs transformation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_logs
    ADD CONSTRAINT transformation_logs_pkey PRIMARY KEY (id);


--
-- Name: transformation_mappings transformation_mappings_mapping_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_mappings
    ADD CONSTRAINT transformation_mappings_mapping_id_key UNIQUE (mapping_id);


--
-- Name: transformation_mappings transformation_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_mappings
    ADD CONSTRAINT transformation_mappings_pkey PRIMARY KEY (id);


--
-- Name: transformation_outputs transformation_outputs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_outputs
    ADD CONSTRAINT transformation_outputs_pkey PRIMARY KEY (id);


--
-- Name: transformations transformations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformations
    ADD CONSTRAINT transformations_pkey PRIMARY KEY (id);


--
-- Name: transformations transformations_transformation_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformations
    ADD CONSTRAINT transformations_transformation_id_key UNIQUE (transformation_id);


--
-- Name: vendor_agreements unique_agreement_code; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreements
    ADD CONSTRAINT unique_agreement_code UNIQUE (agreement_code);


--
-- Name: column_policy_assignments unique_column_policy; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_policy_assignments
    ADD CONSTRAINT unique_column_policy UNIQUE (file_id, column_name, policy_id);


--
-- Name: column_governance_tag_assignments unique_column_tag; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_governance_tag_assignments
    ADD CONSTRAINT unique_column_tag UNIQUE (file_id, column_name, tag_id);


--
-- Name: access_groups unique_external_group; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_groups
    ADD CONSTRAINT unique_external_group UNIQUE (idp_source, external_group_id);


--
-- Name: column_sensitivity_tags unique_file_column_tag; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_sensitivity_tags
    ADD CONSTRAINT unique_file_column_tag UNIQUE (file_id, column_name);


--
-- Name: file_policy_assignments unique_file_policy; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_policy_assignments
    ADD CONSTRAINT unique_file_policy UNIQUE (file_id, policy_id);


--
-- Name: file_preview_data unique_file_row; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_preview_data
    ADD CONSTRAINT unique_file_row UNIQUE (file_id, row_number);


--
-- Name: file_tag_assignments unique_file_tag; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_tag_assignments
    ADD CONSTRAINT unique_file_tag UNIQUE (file_id, tag_id);


--
-- Name: job_group_dependencies unique_group_dependency; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_group_dependencies
    ADD CONSTRAINT unique_group_dependency UNIQUE (group_id, depends_on_group_id);


--
-- Name: access_groups unique_group_name; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_groups
    ADD CONSTRAINT unique_group_name UNIQUE (name);


--
-- Name: job_dependencies unique_job_dependency; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_dependencies
    ADD CONSTRAINT unique_job_dependency UNIQUE (job_id, depends_on_job_id);


--
-- Name: scim_resource_mappings unique_platform_resource; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.scim_resource_mappings
    ADD CONSTRAINT unique_platform_resource UNIQUE (config_id, platform_resource_type, platform_resource_id);


--
-- Name: rbac_policies unique_policy_name_per_project; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.rbac_policies
    ADD CONSTRAINT unique_policy_name_per_project UNIQUE (name, project_id);


--
-- Name: projects unique_project_name; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT unique_project_name UNIQUE (name);


--
-- Name: resource_attributes unique_resource_attribute; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.resource_attributes
    ADD CONSTRAINT unique_resource_attribute UNIQUE (resource_type, resource_id, attribute_key);


--
-- Name: scim_resource_mappings unique_scim_resource; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.scim_resource_mappings
    ADD CONSTRAINT unique_scim_resource UNIQUE (config_id, scim_id);


--
-- Name: tag_permissions unique_tag_role; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tag_permissions
    ADD CONSTRAINT unique_tag_role UNIQUE (tag_id, role_id);


--
-- Name: user_attributes unique_user_attribute; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_attributes
    ADD CONSTRAINT unique_user_attribute UNIQUE (user_id, attribute_key);


--
-- Name: vendors unique_vendor_code; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT unique_vendor_code UNIQUE (vendor_code);


--
-- Name: user_attributes user_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_attributes
    ADD CONSTRAINT user_attributes_pkey PRIMARY KEY (id);


--
-- Name: user_badges user_badges_badge_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_badge_id_key UNIQUE (badge_id);


--
-- Name: user_badges user_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);


--
-- Name: user_dashboard_settings user_dashboard_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_dashboard_settings
    ADD CONSTRAINT user_dashboard_settings_pkey PRIMARY KEY (id);


--
-- Name: user_groups user_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_pkey PRIMARY KEY (user_id, group_id);


--
-- Name: user_job_groups user_job_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_job_groups
    ADD CONSTRAINT user_job_groups_pkey PRIMARY KEY (user_id, group_id);


--
-- Name: user_policy_attachments user_policy_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_policy_attachments
    ADD CONSTRAINT user_policy_attachments_pkey PRIMARY KEY (user_id, policy_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_token_key UNIQUE (token);


--
-- Name: user_uuid_mapping user_uuid_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_uuid_mapping
    ADD CONSTRAINT user_uuid_mapping_pkey PRIMARY KEY (user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_unique UNIQUE (okta_id);


--
-- Name: vendor_agreement_approvals vendor_agreement_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreement_approvals
    ADD CONSTRAINT vendor_agreement_approvals_pkey PRIMARY KEY (id);


--
-- Name: vendor_agreement_changes vendor_agreement_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreement_changes
    ADD CONSTRAINT vendor_agreement_changes_pkey PRIMARY KEY (id);


--
-- Name: vendor_agreements vendor_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreements
    ADD CONSTRAINT vendor_agreements_pkey PRIMARY KEY (id);


--
-- Name: vendor_file_profiling_results vendor_file_profiling_results_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_file_profiling_results
    ADD CONSTRAINT vendor_file_profiling_results_pkey PRIMARY KEY (id);


--
-- Name: vendor_users vendor_users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_users
    ADD CONSTRAINT vendor_users_pkey PRIMARY KEY (id);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: visual_workflows visual_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.visual_workflows
    ADD CONSTRAINT visual_workflows_pkey PRIMARY KEY (id);


--
-- Name: workflow_executions workflow_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_pkey PRIMARY KEY (id);


--
-- Name: workflow_steps workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_pkey PRIMARY KEY (id);


--
-- Name: idx_access_group_members_group; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_access_group_members_group ON public.access_group_members USING btree (group_id);


--
-- Name: idx_access_group_members_source; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_access_group_members_source ON public.access_group_members USING btree (source);


--
-- Name: idx_access_group_members_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_access_group_members_user ON public.access_group_members USING btree (user_id);


--
-- Name: idx_access_group_roles_global_unique; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_access_group_roles_global_unique ON public.access_group_roles USING btree (group_id, role_id) WHERE (project_id IS NULL);


--
-- Name: idx_access_group_roles_group; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_access_group_roles_group ON public.access_group_roles USING btree (group_id);


--
-- Name: idx_access_group_roles_project; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_access_group_roles_project ON public.access_group_roles USING btree (project_id) WHERE (project_id IS NOT NULL);


--
-- Name: idx_access_group_roles_project_unique; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_access_group_roles_project_unique ON public.access_group_roles USING btree (group_id, role_id, project_id) WHERE (project_id IS NOT NULL);


--
-- Name: idx_access_group_roles_role; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_access_group_roles_role ON public.access_group_roles USING btree (role_id);


--
-- Name: idx_access_groups_external_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_access_groups_external_id ON public.access_groups USING btree (external_group_id) WHERE (external_group_id IS NOT NULL);


--
-- Name: idx_access_groups_idp_source; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_access_groups_idp_source ON public.access_groups USING btree (idp_source) WHERE (idp_source IS NOT NULL);


--
-- Name: idx_access_groups_sync_enabled; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_access_groups_sync_enabled ON public.access_groups USING btree (sync_enabled) WHERE (sync_enabled = true);


--
-- Name: idx_access_groups_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_access_groups_type ON public.access_groups USING btree (group_type);


--
-- Name: idx_anomalies_detected; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_anomalies_detected ON public.anomalies USING btree (detected_at DESC);


--
-- Name: idx_anomalies_file; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_anomalies_file ON public.anomalies USING btree (file_id);


--
-- Name: idx_anomalies_job; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_anomalies_job ON public.anomalies USING btree (job_id);


--
-- Name: idx_anomalies_mapping; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_anomalies_mapping ON public.anomalies USING btree (mapping_id);


--
-- Name: idx_anomalies_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_anomalies_status ON public.anomalies USING btree (status);


--
-- Name: idx_anomalies_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_anomalies_type ON public.anomalies USING btree (anomaly_type);


--
-- Name: idx_app_settings_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_app_settings_key ON public.app_settings USING btree (setting_key);


--
-- Name: idx_attribute_definitions_scope; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_attribute_definitions_scope ON public.attribute_definitions USING btree (scope);


--
-- Name: idx_attribute_definitions_system; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_attribute_definitions_system ON public.attribute_definitions USING btree (is_system);


--
-- Name: idx_audit_log_action; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_audit_log_action ON public.audit_log USING btree (action_type, "timestamp" DESC);


--
-- Name: idx_audit_log_entity; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_audit_log_entity ON public.audit_log USING btree (entity_type, entity_id);


--
-- Name: idx_audit_log_request; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_audit_log_request ON public.audit_log USING btree (request_id);


--
-- Name: idx_audit_log_timestamp; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_audit_log_timestamp ON public.audit_log USING btree ("timestamp" DESC);


--
-- Name: idx_audit_log_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_audit_log_user ON public.audit_log USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_bulk_profiling_files_job_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_bulk_profiling_files_job_id ON public.bulk_profiling_files USING btree (job_id);


--
-- Name: idx_bulk_profiling_files_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_bulk_profiling_files_status ON public.bulk_profiling_files USING btree (status);


--
-- Name: idx_bulk_profiling_jobs_created_by; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_bulk_profiling_jobs_created_by ON public.bulk_profiling_jobs USING btree (created_by);


--
-- Name: idx_bulk_profiling_jobs_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_bulk_profiling_jobs_status ON public.bulk_profiling_jobs USING btree (status);


--
-- Name: idx_business_processes_group_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_business_processes_group_id ON public.business_processes USING btree (group_id);


--
-- Name: idx_business_processes_project_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_business_processes_project_id ON public.business_processes USING btree (project_id);


--
-- Name: idx_business_processes_updated_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_business_processes_updated_at ON public.business_processes USING btree (updated_at DESC);


--
-- Name: idx_column_policy_column; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_column_policy_column ON public.column_policy_assignments USING btree (file_id, column_name);


--
-- Name: idx_column_policy_file_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_column_policy_file_id ON public.column_policy_assignments USING btree (file_id);


--
-- Name: idx_column_tag_column; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_column_tag_column ON public.column_governance_tag_assignments USING btree (file_id, column_name);


--
-- Name: idx_column_tag_file_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_column_tag_file_id ON public.column_governance_tag_assignments USING btree (file_id);


--
-- Name: idx_column_tags_classification; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_column_tags_classification ON public.column_sensitivity_tags USING btree (classification_level);


--
-- Name: idx_column_tags_file_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_column_tags_file_id ON public.column_sensitivity_tags USING btree (file_id);


--
-- Name: idx_config_change_entity; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_config_change_entity ON public.config_change_history USING btree (entity_type, entity_id, "timestamp" DESC);


--
-- Name: idx_config_change_timestamp; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_config_change_timestamp ON public.config_change_history USING btree ("timestamp" DESC);


--
-- Name: idx_config_change_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_config_change_user ON public.config_change_history USING btree (changed_by_user, "timestamp" DESC);


--
-- Name: idx_connections_name_unique_lower; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_connections_name_unique_lower ON public.storage_connections USING btree (lower((name)::text));


--
-- Name: idx_data_access_file; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_data_access_file ON public.data_access_log USING btree (file_id, "timestamp" DESC);


--
-- Name: idx_data_access_pii; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_data_access_pii ON public.data_access_log USING btree (contains_pii, "timestamp" DESC) WHERE (contains_pii = true);


--
-- Name: idx_data_access_timestamp; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_data_access_timestamp ON public.data_access_log USING btree ("timestamp" DESC);


--
-- Name: idx_data_access_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_data_access_user ON public.data_access_log USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_dbt_executions_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_dbt_executions_created ON public.dbt_executions USING btree (created_at DESC);


--
-- Name: idx_dbt_executions_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_dbt_executions_status ON public.dbt_executions USING btree (status);


--
-- Name: idx_dbt_executions_triggered_by; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_dbt_executions_triggered_by ON public.dbt_executions USING btree (triggered_by);


--
-- Name: idx_dbt_executions_uuid; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_dbt_executions_uuid ON public.dbt_executions USING btree (execution_uuid);


--
-- Name: idx_dbt_models_name; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_dbt_models_name ON public.dbt_models USING btree (model_name);


--
-- Name: idx_dbt_models_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_dbt_models_status ON public.dbt_models USING btree (last_run_status);


--
-- Name: idx_dbt_models_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_dbt_models_type ON public.dbt_models USING btree (model_type);


--
-- Name: idx_dbt_models_updated; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_dbt_models_updated ON public.dbt_models USING btree (updated_at DESC);


--
-- Name: idx_execution_audit_entity; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_execution_audit_entity ON public.execution_audit USING btree (execution_type, entity_id);


--
-- Name: idx_execution_audit_execution; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_execution_audit_execution ON public.execution_audit USING btree (execution_id, "timestamp" DESC);


--
-- Name: idx_execution_audit_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_execution_audit_status ON public.execution_audit USING btree (new_status, "timestamp" DESC);


--
-- Name: idx_file_audit_correlation_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_audit_correlation_id ON public.file_audit_details USING btree (correlation_id);


--
-- Name: idx_file_audit_created_dt; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_audit_created_dt ON public.file_audit_details USING btree (created_dt);


--
-- Name: idx_file_audit_file_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_audit_file_id ON public.file_audit_details USING btree (file_id);


--
-- Name: idx_file_audit_file_role; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_audit_file_role ON public.file_audit_details USING btree (file_role);


--
-- Name: idx_file_audit_parent; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_audit_parent ON public.file_audit_details USING btree (parent_audit_id);


--
-- Name: idx_file_audit_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_audit_status ON public.file_audit_details USING btree (status);


--
-- Name: idx_file_columns_file_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_columns_file_id ON public.file_columns USING btree (file_id);


--
-- Name: idx_file_columns_file_timestamp; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_columns_file_timestamp ON public.file_columns USING btree (file_id, profile_timestamp DESC);


--
-- Name: idx_file_ownership_file_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_ownership_file_id ON public.file_ownership USING btree (file_id);


--
-- Name: idx_file_ownership_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_ownership_user_id ON public.file_ownership USING btree (owner_user_id);


--
-- Name: idx_file_pattern_metrics_alerts; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_pattern_metrics_alerts ON public.file_pattern_metrics USING btree (has_alerts, file_pattern);


--
-- Name: idx_file_pattern_metrics_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_pattern_metrics_date ON public.file_pattern_metrics USING btree (metric_date DESC);


--
-- Name: idx_file_pattern_metrics_monthly_pattern_month; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_file_pattern_metrics_monthly_pattern_month ON public.file_pattern_metrics_monthly USING btree (file_pattern, month_start DESC);


--
-- Name: idx_file_pattern_metrics_pattern; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_pattern_metrics_pattern ON public.file_pattern_metrics USING btree (file_pattern);


--
-- Name: idx_file_pattern_metrics_pattern_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_pattern_metrics_pattern_date ON public.file_pattern_metrics USING btree (file_pattern, metric_date DESC);


--
-- Name: idx_file_pattern_metrics_retention; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_pattern_metrics_retention ON public.file_pattern_metrics USING btree (retention_until);


--
-- Name: idx_file_pattern_metrics_weekly_pattern_week; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_file_pattern_metrics_weekly_pattern_week ON public.file_pattern_metrics_weekly USING btree (file_pattern, week_start DESC);


--
-- Name: idx_file_preview_data_created_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_preview_data_created_at ON public.file_preview_data USING btree (created_at);


--
-- Name: idx_file_preview_data_file_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_preview_data_file_id ON public.file_preview_data USING btree (file_id);


--
-- Name: idx_file_schedules_file_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_schedules_file_id ON public.file_schedules USING btree (file_id);


--
-- Name: idx_file_schema_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_schema_active ON public.file_schema_details USING btree (active_flag);


--
-- Name: idx_file_schema_correlation; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_schema_correlation ON public.file_schema_details USING btree (correlation_id);


--
-- Name: idx_file_schema_file_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_schema_file_id ON public.file_schema_details USING btree (file_id);


--
-- Name: idx_file_schema_hash; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_schema_hash ON public.file_schema_details USING btree (schema_hash);


--
-- Name: idx_file_schema_schema_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_schema_schema_id ON public.file_schema_details USING btree (file_schema_id);


--
-- Name: idx_file_schemas_file; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_schemas_file ON public.file_schemas USING btree (file_id);


--
-- Name: idx_file_schemas_hash; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_schemas_hash ON public.file_schemas USING btree (schema_hash);


--
-- Name: idx_file_schemas_pattern; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_file_schemas_pattern ON public.file_schemas USING btree (file_pattern);


--
-- Name: idx_files_correlation_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_files_correlation_id ON public.files USING btree (correlation_id);


--
-- Name: idx_files_created_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_files_created_at ON public.files USING btree (created_at DESC);


--
-- Name: idx_files_file_role; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_files_file_role ON public.files USING btree (file_role);


--
-- Name: idx_files_project_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_files_project_id ON public.files USING btree (project_id);


--
-- Name: idx_files_updated_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_files_updated_at ON public.files USING btree (updated_at DESC);


--
-- Name: idx_group_policy_attachments_group; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_group_policy_attachments_group ON public.group_policy_attachments USING btree (group_id);


--
-- Name: idx_group_policy_attachments_policy; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_group_policy_attachments_policy ON public.group_policy_attachments USING btree (policy_id);


--
-- Name: idx_groups_name; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_groups_name ON public.groups USING btree (name);


--
-- Name: idx_job_dependencies_depends_on; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_dependencies_depends_on ON public.job_dependencies USING btree (depends_on_job_id);


--
-- Name: idx_job_dependencies_job; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_dependencies_job ON public.job_dependencies USING btree (job_id);


--
-- Name: idx_job_group_dependencies_depends_on; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_group_dependencies_depends_on ON public.job_group_dependencies USING btree (depends_on_group_id);


--
-- Name: idx_job_group_dependencies_group; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_group_dependencies_group ON public.job_group_dependencies USING btree (group_id);


--
-- Name: idx_job_group_jobs_group_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_group_jobs_group_id ON public.job_group_jobs USING btree (group_id);


--
-- Name: idx_job_group_jobs_job_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_group_jobs_job_id ON public.job_group_jobs USING btree (job_id);


--
-- Name: idx_job_group_schedules_enabled; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_group_schedules_enabled ON public.job_group_schedules USING btree (enabled) WHERE (enabled = true);


--
-- Name: idx_job_group_schedules_group; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_group_schedules_group ON public.job_group_schedules USING btree (group_id);


--
-- Name: idx_job_schedules_job_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_schedules_job_id ON public.job_schedules USING btree (job_id);


--
-- Name: idx_jobs_business_process_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_jobs_business_process_id ON public.jobs USING btree (business_process_id);


--
-- Name: idx_jobs_updated_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_jobs_updated_at ON public.jobs USING btree (updated_at DESC);


--
-- Name: idx_mapping_group_executions_group_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_mapping_group_executions_group_id ON public.mapping_group_executions USING btree (group_id);


--
-- Name: idx_mapping_group_executions_project_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_mapping_group_executions_project_id ON public.mapping_group_executions USING btree (project_id);


--
-- Name: idx_mapping_group_members_group_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_mapping_group_members_group_id ON public.mapping_group_members USING btree (group_id);


--
-- Name: idx_mapping_group_members_mapping_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_mapping_group_members_mapping_id ON public.mapping_group_members USING btree (mapping_id);


--
-- Name: idx_mapping_groups_project_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_mapping_groups_project_id ON public.mapping_groups USING btree (project_id);


--
-- Name: idx_n_step_workflow_assets_step; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_n_step_workflow_assets_step ON public.n_step_workflow_assets USING btree (step_id);


--
-- Name: idx_n_step_workflow_run_steps_run; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_n_step_workflow_run_steps_run ON public.n_step_workflow_run_steps USING btree (run_id);


--
-- Name: idx_n_step_workflow_runs_workflow; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_n_step_workflow_runs_workflow ON public.n_step_workflow_runs USING btree (workflow_id);


--
-- Name: idx_n_step_workflow_steps_workflow; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_n_step_workflow_steps_workflow ON public.n_step_workflow_steps USING btree (workflow_id);


--
-- Name: idx_n_step_workflows_project_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_n_step_workflows_project_id ON public.n_step_workflows USING btree (project_id);


--
-- Name: idx_password_reset_requests_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_password_reset_requests_status ON public.password_reset_requests USING btree (status);


--
-- Name: idx_password_reset_requests_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_password_reset_requests_user ON public.password_reset_requests USING btree (user_id);


--
-- Name: idx_permissions_action; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_permissions_action ON public.permissions USING btree (action);


--
-- Name: idx_permissions_name; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_permissions_name ON public.permissions USING btree (name);


--
-- Name: idx_permissions_resource; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_permissions_resource ON public.permissions USING btree (resource);


--
-- Name: idx_policy_assignments_file_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_policy_assignments_file_id ON public.file_policy_assignments USING btree (file_id);


--
-- Name: idx_policy_assignments_policy_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_policy_assignments_policy_id ON public.file_policy_assignments USING btree (policy_id);


--
-- Name: idx_policy_cache_expires; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_policy_cache_expires ON public.policy_evaluation_cache USING btree (expires_at);


--
-- Name: idx_policy_cache_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_policy_cache_user ON public.policy_evaluation_cache USING btree (user_id);


--
-- Name: idx_profiling_metrics_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_profiling_metrics_date ON public.profiling_metrics USING btree (profiled_at DESC);


--
-- Name: idx_profiling_metrics_file; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_profiling_metrics_file ON public.profiling_metrics USING btree (file_id);


--
-- Name: idx_profiling_metrics_file_timestamp; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_profiling_metrics_file_timestamp ON public.profiling_metrics USING btree (file_id, profile_timestamp DESC);


--
-- Name: idx_profiling_metrics_job_role; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_profiling_metrics_job_role ON public.profiling_metrics USING btree (job_id, file_role);


--
-- Name: idx_profiling_metrics_mapping; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_profiling_metrics_mapping ON public.profiling_metrics USING btree (mapping_id);


--
-- Name: idx_project_members_project; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_project_members_project ON public.project_members USING btree (project_id);


--
-- Name: idx_project_members_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_project_members_user ON public.project_members USING btree (user_id);


--
-- Name: idx_projects_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_projects_active ON public.projects USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_projects_is_default; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_projects_is_default ON public.projects USING btree (is_default) WHERE (is_default = true);


--
-- Name: idx_projects_owner; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_projects_owner ON public.projects USING btree (owner_id);


--
-- Name: idx_projects_parent; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_projects_parent ON public.projects USING btree (parent_id);


--
-- Name: idx_rbac_policies_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_rbac_policies_active ON public.rbac_policies USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_rbac_policies_global; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_rbac_policies_global ON public.rbac_policies USING btree (is_global) WHERE (is_global = true);


--
-- Name: idx_rbac_policies_project; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_rbac_policies_project ON public.rbac_policies USING btree (project_id) WHERE (project_id IS NOT NULL);


--
-- Name: idx_rbac_policies_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_rbac_policies_type ON public.rbac_policies USING btree (policy_type);


--
-- Name: idx_refresh_tokens_expires_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_refresh_tokens_expires_at ON public.refresh_tokens USING btree (expires_at);


--
-- Name: idx_refresh_tokens_token_hash; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_refresh_tokens_token_hash ON public.refresh_tokens USING btree (token);


--
-- Name: idx_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_resource_attributes_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_resource_attributes_key ON public.resource_attributes USING btree (attribute_key);


--
-- Name: idx_resource_attributes_resource; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_resource_attributes_resource ON public.resource_attributes USING btree (resource_type, resource_id);


--
-- Name: idx_resource_attributes_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_resource_attributes_type ON public.resource_attributes USING btree (resource_type);


--
-- Name: idx_resource_policy_attachments_policy; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_resource_policy_attachments_policy ON public.resource_policy_attachments USING btree (policy_id);


--
-- Name: idx_resource_policy_attachments_resource; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_resource_policy_attachments_resource ON public.resource_policy_attachments USING btree (resource_type, resource_id);


--
-- Name: idx_resource_policy_attachments_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_resource_policy_attachments_type ON public.resource_policy_attachments USING btree (resource_type);


--
-- Name: idx_roles_name; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_roles_name ON public.roles USING btree (name);


--
-- Name: idx_schedules_entity; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_schedules_entity ON public.schedules USING btree (entity_type, entity_id);


--
-- Name: idx_schedules_next_run; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_schedules_next_run ON public.schedules USING btree (next_run) WHERE (is_active = true);


--
-- Name: idx_schedules_project_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_schedules_project_id ON public.schedules USING btree (project_id);


--
-- Name: idx_scim_configurations_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_scim_configurations_active ON public.scim_configurations USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_scim_configurations_idp_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_scim_configurations_idp_type ON public.scim_configurations USING btree (idp_type);


--
-- Name: idx_scim_mappings_config; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_scim_mappings_config ON public.scim_resource_mappings USING btree (config_id);


--
-- Name: idx_scim_mappings_platform; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_scim_mappings_platform ON public.scim_resource_mappings USING btree (platform_resource_type, platform_resource_id);


--
-- Name: idx_scim_mappings_scim_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_scim_mappings_scim_id ON public.scim_resource_mappings USING btree (scim_id);


--
-- Name: idx_scim_sync_logs_config; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_scim_sync_logs_config ON public.scim_sync_logs USING btree (config_id);


--
-- Name: idx_scim_sync_logs_started; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_scim_sync_logs_started ON public.scim_sync_logs USING btree (started_at DESC);


--
-- Name: idx_scim_sync_logs_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_scim_sync_logs_status ON public.scim_sync_logs USING btree (status);


--
-- Name: idx_security_audit_event; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_security_audit_event ON public.security_audit_log USING btree (event_type, "timestamp" DESC);


--
-- Name: idx_security_audit_severity; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_security_audit_severity ON public.security_audit_log USING btree (severity, "timestamp" DESC) WHERE ((severity)::text = ANY ((ARRAY['WARNING'::character varying, 'CRITICAL'::character varying])::text[]));


--
-- Name: idx_security_audit_timestamp; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_security_audit_timestamp ON public.security_audit_log USING btree ("timestamp" DESC);


--
-- Name: idx_security_audit_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_security_audit_user ON public.security_audit_log USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_storage_connections_auth_method; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_storage_connections_auth_method ON public.storage_connections USING btree (authentication_method);


--
-- Name: idx_storage_connections_project_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_storage_connections_project_id ON public.storage_connections USING btree (project_id);


--
-- Name: idx_storage_connections_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_storage_connections_user ON public.storage_connections USING btree (connection_user);


--
-- Name: idx_tag_assignments_file_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_tag_assignments_file_id ON public.file_tag_assignments USING btree (file_id);


--
-- Name: idx_tag_assignments_tag_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_tag_assignments_tag_id ON public.file_tag_assignments USING btree (tag_id);


--
-- Name: idx_tag_permissions_role_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_tag_permissions_role_id ON public.tag_permissions USING btree (role_id);


--
-- Name: idx_tag_permissions_tag_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_tag_permissions_tag_id ON public.tag_permissions USING btree (tag_id);


--
-- Name: idx_transformation_jobs_mapping; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_transformation_jobs_mapping ON public.transformation_jobs USING btree (mapping_id);


--
-- Name: idx_transformation_jobs_project_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_transformation_jobs_project_id ON public.transformation_jobs USING btree (project_id);


--
-- Name: idx_transformation_jobs_start; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_transformation_jobs_start ON public.transformation_jobs USING btree (start_time DESC);


--
-- Name: idx_transformation_jobs_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_transformation_jobs_status ON public.transformation_jobs USING btree (status);


--
-- Name: idx_transformation_logs_job; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_transformation_logs_job ON public.transformation_logs USING btree (job_id);


--
-- Name: idx_transformation_logs_level; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_transformation_logs_level ON public.transformation_logs USING btree (log_level);


--
-- Name: idx_transformation_logs_timestamp; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_transformation_logs_timestamp ON public.transformation_logs USING btree ("timestamp" DESC);


--
-- Name: idx_transformation_mappings_pattern; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_transformation_mappings_pattern ON public.transformation_mappings USING btree (source_file_pattern);


--
-- Name: idx_transformation_mappings_project_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_transformation_mappings_project_id ON public.transformation_mappings USING btree (project_id);


--
-- Name: idx_transformation_mappings_source; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_transformation_mappings_source ON public.transformation_mappings USING btree (source_connection_id);


--
-- Name: idx_transformation_mappings_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_transformation_mappings_status ON public.transformation_mappings USING btree (status);


--
-- Name: idx_transformation_mappings_vendor_agreement_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_transformation_mappings_vendor_agreement_id ON public.transformation_mappings USING btree (vendor_agreement_id);


--
-- Name: idx_user_attributes_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_attributes_key ON public.user_attributes USING btree (attribute_key);


--
-- Name: idx_user_attributes_source; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_attributes_source ON public.user_attributes USING btree (source);


--
-- Name: idx_user_attributes_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_attributes_user ON public.user_attributes USING btree (user_id);


--
-- Name: idx_user_groups_group_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_groups_group_id ON public.user_groups USING btree (group_id);


--
-- Name: idx_user_groups_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_groups_user_id ON public.user_groups USING btree (user_id);


--
-- Name: idx_user_policy_attachments_policy; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_policy_attachments_policy ON public.user_policy_attachments USING btree (policy_id);


--
-- Name: idx_user_policy_attachments_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_user_policy_attachments_user ON public.user_policy_attachments USING btree (user_id);


--
-- Name: idx_users_auth_provider; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_users_auth_provider ON public.users USING btree (auth_provider);


--
-- Name: idx_users_external_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_users_external_id ON public.users USING btree (external_id) WHERE (external_id IS NOT NULL);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_users_username ON public.users USING btree (lower((username)::text));


--
-- Name: idx_vendor_agreement_approvals_agreement_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_agreement_approvals_agreement_id ON public.vendor_agreement_approvals USING btree (agreement_id);


--
-- Name: idx_vendor_agreement_approvals_approver; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_agreement_approvals_approver ON public.vendor_agreement_approvals USING btree (approver_user_id);


--
-- Name: idx_vendor_agreement_changes_agreement_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_agreement_changes_agreement_id ON public.vendor_agreement_changes USING btree (agreement_id);


--
-- Name: idx_vendor_agreement_changes_changed_by; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_agreement_changes_changed_by ON public.vendor_agreement_changes USING btree (changed_by);


--
-- Name: idx_vendor_agreements_agreement_code; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_agreements_agreement_code ON public.vendor_agreements USING btree (agreement_code);


--
-- Name: idx_vendor_agreements_approval_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_agreements_approval_status ON public.vendor_agreements USING btree (approval_status);


--
-- Name: idx_vendor_agreements_connection_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_agreements_connection_id ON public.vendor_agreements USING btree (vendor_connection_id);


--
-- Name: idx_vendor_agreements_file_owner; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_agreements_file_owner ON public.vendor_agreements USING btree (file_owner_user_id);


--
-- Name: idx_vendor_agreements_project_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_agreements_project_id ON public.vendor_agreements USING btree (project_id);


--
-- Name: idx_vendor_agreements_vendor_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_agreements_vendor_id ON public.vendor_agreements USING btree (vendor_id);


--
-- Name: idx_vendor_file_profiling_connection_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_file_profiling_connection_id ON public.vendor_file_profiling_results USING btree (connection_id);


--
-- Name: idx_vendor_file_profiling_file_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_file_profiling_file_id ON public.vendor_file_profiling_results USING btree (file_id);


--
-- Name: idx_vendor_file_profiling_profiled_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_file_profiling_profiled_at ON public.vendor_file_profiling_results USING btree (profiled_at DESC);


--
-- Name: idx_vendor_file_profiling_quality_score; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_file_profiling_quality_score ON public.vendor_file_profiling_results USING btree (quality_score);


--
-- Name: idx_vendor_file_profiling_vendor_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_file_profiling_vendor_id ON public.vendor_file_profiling_results USING btree (vendor_id);


--
-- Name: idx_vendor_profiling_created_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_profiling_created_at ON public.vendor_file_profiling_results USING btree (created_at DESC);


--
-- Name: idx_vendor_profiling_file_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_profiling_file_id ON public.vendor_file_profiling_results USING btree (file_id);


--
-- Name: idx_vendor_profiling_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_profiling_user_id ON public.vendor_file_profiling_results USING btree (uploaded_by_user_id);


--
-- Name: idx_vendor_profiling_vendor_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_profiling_vendor_id ON public.vendor_file_profiling_results USING btree (vendor_id);


--
-- Name: idx_vendor_users_email; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_users_email ON public.vendor_users USING btree (email);


--
-- Name: idx_vendor_users_is_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_users_is_active ON public.vendor_users USING btree (is_active);


--
-- Name: idx_vendor_users_vendor_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendor_users_vendor_id ON public.vendor_users USING btree (vendor_id);


--
-- Name: idx_vendors_project_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendors_project_id ON public.vendors USING btree (project_id);


--
-- Name: idx_vendors_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendors_status ON public.vendors USING btree (status);


--
-- Name: idx_vendors_vendor_code; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendors_vendor_code ON public.vendors USING btree (vendor_code);


--
-- Name: idx_vendors_vendor_user_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_vendors_vendor_user_id ON public.vendors USING btree (vendor_user_id);


--
-- Name: idx_visual_workflows_created_by; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_visual_workflows_created_by ON public.visual_workflows USING btree (created_by);


--
-- Name: idx_visual_workflows_is_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_visual_workflows_is_active ON public.visual_workflows USING btree (is_active);


--
-- Name: idx_workflow_executions_project_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_workflow_executions_project_id ON public.workflow_executions USING btree (project_id);


--
-- Name: idx_workflow_executions_workflow_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_workflow_executions_workflow_id ON public.workflow_executions USING btree (workflow_id);


--
-- Name: idx_workflow_steps_depends_on; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_workflow_steps_depends_on ON public.workflow_steps USING btree (depends_on);


--
-- Name: idx_workflow_steps_project_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_workflow_steps_project_id ON public.workflow_steps USING btree (project_id);


--
-- Name: idx_workflow_steps_workflow_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_workflow_steps_workflow_id ON public.workflow_steps USING btree (workflow_id);


--
-- Name: users_username_lower_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX users_username_lower_idx ON public.users USING btree (lower((username)::text));


--
-- Name: policy_evaluation_cache trigger_cleanup_policy_cache_on_insert; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trigger_cleanup_policy_cache_on_insert AFTER INSERT ON public.policy_evaluation_cache FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_cleanup_policy_cache();


--
-- Name: file_pattern_metrics trigger_refresh_file_pattern_metrics_views; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trigger_refresh_file_pattern_metrics_views AFTER INSERT OR UPDATE ON public.file_pattern_metrics FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_file_pattern_metrics_views();


--
-- Name: users trigger_update_full_name; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trigger_update_full_name BEFORE INSERT OR UPDATE OF first_name, middle_name, last_name ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_full_name();


--
-- Name: vendor_users trigger_vendor_users_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trigger_vendor_users_updated_at BEFORE UPDATE ON public.vendor_users FOR EACH ROW EXECUTE FUNCTION public.update_vendor_users_updated_at();


--
-- Name: access_groups update_access_groups_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_access_groups_updated_at BEFORE UPDATE ON public.access_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: attribute_definitions update_attribute_definitions_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_attribute_definitions_updated_at BEFORE UPDATE ON public.attribute_definitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: project_members update_project_members_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_project_members_updated_at BEFORE UPDATE ON public.project_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: rbac_policies update_rbac_policies_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_rbac_policies_updated_at BEFORE UPDATE ON public.rbac_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: resource_attributes update_resource_attributes_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_resource_attributes_updated_at BEFORE UPDATE ON public.resource_attributes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: scim_configurations update_scim_configurations_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_scim_configurations_updated_at BEFORE UPDATE ON public.scim_configurations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: scim_resource_mappings update_scim_resource_mappings_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_scim_resource_mappings_updated_at BEFORE UPDATE ON public.scim_resource_mappings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_attributes update_user_attributes_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_user_attributes_updated_at BEFORE UPDATE ON public.user_attributes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: access_group_members access_group_members_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_group_members
    ADD CONSTRAINT access_group_members_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: access_group_members access_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_group_members
    ADD CONSTRAINT access_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.access_groups(id) ON DELETE CASCADE;


--
-- Name: access_group_members access_group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_group_members
    ADD CONSTRAINT access_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: access_group_roles access_group_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_group_roles
    ADD CONSTRAINT access_group_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: access_group_roles access_group_roles_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_group_roles
    ADD CONSTRAINT access_group_roles_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.access_groups(id) ON DELETE CASCADE;


--
-- Name: access_group_roles access_group_roles_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_group_roles
    ADD CONSTRAINT access_group_roles_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: access_group_roles access_group_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_group_roles
    ADD CONSTRAINT access_group_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: access_groups access_groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.access_groups
    ADD CONSTRAINT access_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: alert_history alert_history_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.alert_history
    ADD CONSTRAINT alert_history_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: alert_history alert_history_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.alert_history
    ADD CONSTRAINT alert_history_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.alert_rules(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_parent_audit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_parent_audit_id_fkey FOREIGN KEY (parent_audit_id) REFERENCES public.audit_log(audit_id);


--
-- Name: bulk_profiling_files bulk_profiling_files_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bulk_profiling_files
    ADD CONSTRAINT bulk_profiling_files_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.bulk_profiling_jobs(id) ON DELETE CASCADE;


--
-- Name: business_processes business_processes_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.business_processes
    ADD CONSTRAINT business_processes_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;


--
-- Name: column_mappings column_mappings_source_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_mappings
    ADD CONSTRAINT column_mappings_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: drop_location_config drop_location_config_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.drop_location_config
    ADD CONSTRAINT drop_location_config_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: drop_location_config drop_location_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.drop_location_config
    ADD CONSTRAINT drop_location_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: file_audit_details file_audit_details_parent_audit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_audit_details
    ADD CONSTRAINT file_audit_details_parent_audit_id_fkey FOREIGN KEY (parent_audit_id) REFERENCES public.file_audit_details(id);


--
-- Name: file_audit_details file_audit_details_transformation_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_audit_details
    ADD CONSTRAINT file_audit_details_transformation_job_id_fkey FOREIGN KEY (transformation_job_id) REFERENCES public.transformation_jobs(id);


--
-- Name: file_columns file_columns_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_columns
    ADD CONSTRAINT file_columns_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: file_history file_history_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_history
    ADD CONSTRAINT file_history_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: file_lineage file_lineage_source_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_lineage
    ADD CONSTRAINT file_lineage_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: file_lineage file_lineage_target_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_lineage
    ADD CONSTRAINT file_lineage_target_file_id_fkey FOREIGN KEY (target_file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: business_processes fk_business_processes_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.business_processes
    ADD CONSTRAINT fk_business_processes_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: column_policy_assignments fk_column_policy_file; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_policy_assignments
    ADD CONSTRAINT fk_column_policy_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: column_policy_assignments fk_column_policy_policy; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_policy_assignments
    ADD CONSTRAINT fk_column_policy_policy FOREIGN KEY (policy_id) REFERENCES public.governance_policies(policy_id) ON DELETE CASCADE;


--
-- Name: column_governance_tag_assignments fk_column_tag_file; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_governance_tag_assignments
    ADD CONSTRAINT fk_column_tag_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: column_governance_tag_assignments fk_column_tag_tag; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_governance_tag_assignments
    ADD CONSTRAINT fk_column_tag_tag FOREIGN KEY (tag_id) REFERENCES public.governance_tags(tag_id) ON DELETE CASCADE;


--
-- Name: column_sensitivity_tags fk_column_tags_file; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.column_sensitivity_tags
    ADD CONSTRAINT fk_column_tags_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: file_schedules fk_file; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_schedules
    ADD CONSTRAINT fk_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: file_ownership fk_file_ownership_file; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_ownership
    ADD CONSTRAINT fk_file_ownership_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: file_ownership fk_file_ownership_user; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_ownership
    ADD CONSTRAINT fk_file_ownership_user FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: file_preview_data fk_file_preview_file; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_preview_data
    ADD CONSTRAINT fk_file_preview_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: file_schedules fk_file_schedules_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_schedules
    ADD CONSTRAINT fk_file_schedules_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: files fk_files_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT fk_files_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: job_group_schedules fk_job_group_schedules_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_group_schedules
    ADD CONSTRAINT fk_job_group_schedules_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: job_schedules fk_job_schedules_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_schedules
    ADD CONSTRAINT fk_job_schedules_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: mapping_group_executions fk_mapping_group_executions_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mapping_group_executions
    ADD CONSTRAINT fk_mapping_group_executions_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: mapping_groups fk_mapping_groups_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mapping_groups
    ADD CONSTRAINT fk_mapping_groups_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: n_step_workflows fk_n_step_workflows_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflows
    ADD CONSTRAINT fk_n_step_workflows_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: file_policy_assignments fk_policy_assignment_file; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_policy_assignments
    ADD CONSTRAINT fk_policy_assignment_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: file_policy_assignments fk_policy_assignment_policy; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_policy_assignments
    ADD CONSTRAINT fk_policy_assignment_policy FOREIGN KEY (policy_id) REFERENCES public.governance_policies(policy_id) ON DELETE CASCADE;


--
-- Name: file_policy_assignments fk_policy_assignment_user; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_policy_assignments
    ADD CONSTRAINT fk_policy_assignment_user FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: governance_policies fk_policy_creator; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.governance_policies
    ADD CONSTRAINT fk_policy_creator FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: schedules fk_schedules_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT fk_schedules_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: storage_connections fk_storage_connections_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.storage_connections
    ADD CONSTRAINT fk_storage_connections_project FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: file_tag_assignments fk_tag_assignment_file; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_tag_assignments
    ADD CONSTRAINT fk_tag_assignment_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: file_tag_assignments fk_tag_assignment_tag; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_tag_assignments
    ADD CONSTRAINT fk_tag_assignment_tag FOREIGN KEY (tag_id) REFERENCES public.governance_tags(tag_id) ON DELETE CASCADE;


--
-- Name: file_tag_assignments fk_tag_assignment_user; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.file_tag_assignments
    ADD CONSTRAINT fk_tag_assignment_user FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: governance_tags fk_tag_creator; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.governance_tags
    ADD CONSTRAINT fk_tag_creator FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tag_permissions fk_tag_permission_role; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tag_permissions
    ADD CONSTRAINT fk_tag_permission_role FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: tag_permissions fk_tag_permission_tag; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tag_permissions
    ADD CONSTRAINT fk_tag_permission_tag FOREIGN KEY (tag_id) REFERENCES public.governance_tags(tag_id) ON DELETE CASCADE;


--
-- Name: transform_connections fk_transform_connections_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transform_connections
    ADD CONSTRAINT fk_transform_connections_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: transformation_jobs fk_transformation_jobs_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_jobs
    ADD CONSTRAINT fk_transformation_jobs_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: transformation_mappings fk_transformation_mappings_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_mappings
    ADD CONSTRAINT fk_transformation_mappings_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: workflow_executions fk_workflow_executions_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT fk_workflow_executions_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: workflow_steps fk_workflow_steps_project; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT fk_workflow_steps_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: group_policy_attachments group_policy_attachments_attached_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.group_policy_attachments
    ADD CONSTRAINT group_policy_attachments_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: group_policy_attachments group_policy_attachments_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.group_policy_attachments
    ADD CONSTRAINT group_policy_attachments_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.access_groups(id) ON DELETE CASCADE;


--
-- Name: group_policy_attachments group_policy_attachments_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.group_policy_attachments
    ADD CONSTRAINT group_policy_attachments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.rbac_policies(id) ON DELETE CASCADE;


--
-- Name: job_dependencies job_dependencies_depends_on_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_dependencies
    ADD CONSTRAINT job_dependencies_depends_on_job_id_fkey FOREIGN KEY (depends_on_job_id) REFERENCES public.file_schedules(id) ON DELETE CASCADE;


--
-- Name: job_dependencies job_dependencies_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_dependencies
    ADD CONSTRAINT job_dependencies_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.file_schedules(id) ON DELETE CASCADE;


--
-- Name: job_group_dependencies job_group_dependencies_depends_on_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_group_dependencies
    ADD CONSTRAINT job_group_dependencies_depends_on_group_id_fkey FOREIGN KEY (depends_on_group_id) REFERENCES public.job_groups(id) ON DELETE CASCADE;


--
-- Name: job_group_dependencies job_group_dependencies_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_group_dependencies
    ADD CONSTRAINT job_group_dependencies_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.job_groups(id) ON DELETE CASCADE;


--
-- Name: job_group_schedules job_group_schedules_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_group_schedules
    ADD CONSTRAINT job_group_schedules_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.job_groups(id) ON DELETE CASCADE;


--
-- Name: job_history job_history_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_history
    ADD CONSTRAINT job_history_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: job_runs job_runs_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_runs
    ADD CONSTRAINT job_runs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: jobs jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: mapping_group_executions mapping_group_executions_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mapping_group_executions
    ADD CONSTRAINT mapping_group_executions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.mapping_groups(id) ON DELETE CASCADE;


--
-- Name: mapping_group_members mapping_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mapping_group_members
    ADD CONSTRAINT mapping_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.mapping_groups(id) ON DELETE CASCADE;


--
-- Name: mapping_group_members mapping_group_members_mapping_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.mapping_group_members
    ADD CONSTRAINT mapping_group_members_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES public.transformation_mappings(mapping_id) ON DELETE CASCADE;


--
-- Name: n_step_workflow_assets n_step_workflow_assets_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_assets
    ADD CONSTRAINT n_step_workflow_assets_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.n_step_workflow_steps(id) ON DELETE CASCADE;


--
-- Name: n_step_workflow_run_steps n_step_workflow_run_steps_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_run_steps
    ADD CONSTRAINT n_step_workflow_run_steps_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.n_step_workflow_runs(id) ON DELETE CASCADE;


--
-- Name: n_step_workflow_runs n_step_workflow_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_runs
    ADD CONSTRAINT n_step_workflow_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES public.users(id);


--
-- Name: n_step_workflow_runs n_step_workflow_runs_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_runs
    ADD CONSTRAINT n_step_workflow_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.n_step_workflows(id);


--
-- Name: n_step_workflow_steps n_step_workflow_steps_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflow_steps
    ADD CONSTRAINT n_step_workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.n_step_workflows(id) ON DELETE CASCADE;


--
-- Name: n_step_workflows n_step_workflows_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.n_step_workflows
    ADD CONSTRAINT n_step_workflows_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: password_reset_requests password_reset_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.password_reset_requests
    ADD CONSTRAINT password_reset_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: password_reset_requests password_reset_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.password_reset_requests
    ADD CONSTRAINT password_reset_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: project_access_groups project_access_groups_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.project_access_groups
    ADD CONSTRAINT project_access_groups_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id);


--
-- Name: project_access_groups project_access_groups_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.project_access_groups
    ADD CONSTRAINT project_access_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.access_groups(id) ON DELETE CASCADE;


--
-- Name: project_access_groups project_access_groups_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.project_access_groups
    ADD CONSTRAINT project_access_groups_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: project_members project_members_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: projects projects_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: projects projects_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: quality_reports quality_reports_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.quality_reports
    ADD CONSTRAINT quality_reports_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: rbac_policies rbac_policies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.rbac_policies
    ADD CONSTRAINT rbac_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: rbac_policies rbac_policies_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.rbac_policies
    ADD CONSTRAINT rbac_policies_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: resource_attributes resource_attributes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.resource_attributes
    ADD CONSTRAINT resource_attributes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: resource_policy_attachments resource_policy_attachments_attached_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.resource_policy_attachments
    ADD CONSTRAINT resource_policy_attachments_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: resource_policy_attachments resource_policy_attachments_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.resource_policy_attachments
    ADD CONSTRAINT resource_policy_attachments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.rbac_policies(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: scim_resource_mappings scim_resource_mappings_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.scim_resource_mappings
    ADD CONSTRAINT scim_resource_mappings_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.scim_configurations(id) ON DELETE CASCADE;


--
-- Name: scim_sync_logs scim_sync_logs_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.scim_sync_logs
    ADD CONSTRAINT scim_sync_logs_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.scim_configurations(id) ON DELETE CASCADE;


--
-- Name: transformation_jobs transformation_jobs_mapping_group_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_jobs
    ADD CONSTRAINT transformation_jobs_mapping_group_execution_id_fkey FOREIGN KEY (mapping_group_execution_id) REFERENCES public.mapping_group_executions(id);


--
-- Name: transformation_jobs transformation_jobs_mapping_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_jobs
    ADD CONSTRAINT transformation_jobs_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES public.transformation_mappings(mapping_id) ON DELETE CASCADE;


--
-- Name: transformation_jobs transformation_jobs_workflow_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_jobs
    ADD CONSTRAINT transformation_jobs_workflow_execution_id_fkey FOREIGN KEY (workflow_execution_id) REFERENCES public.n_step_workflow_runs(id) ON DELETE SET NULL;


--
-- Name: transformation_logs transformation_logs_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_logs
    ADD CONSTRAINT transformation_logs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.transformation_jobs(job_id) ON DELETE CASCADE;


--
-- Name: transformation_mappings transformation_mappings_vendor_agreement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.transformation_mappings
    ADD CONSTRAINT transformation_mappings_vendor_agreement_id_fkey FOREIGN KEY (vendor_agreement_id) REFERENCES public.vendor_agreements(id) ON DELETE SET NULL;


--
-- Name: user_attributes user_attributes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_attributes
    ADD CONSTRAINT user_attributes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_attributes user_attributes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_attributes
    ADD CONSTRAINT user_attributes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_badges user_badges_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id);


--
-- Name: user_groups user_groups_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: user_groups user_groups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_policy_attachments user_policy_attachments_attached_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_policy_attachments
    ADD CONSTRAINT user_policy_attachments_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_policy_attachments user_policy_attachments_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_policy_attachments
    ADD CONSTRAINT user_policy_attachments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.rbac_policies(id) ON DELETE CASCADE;


--
-- Name: user_policy_attachments user_policy_attachments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_policy_attachments
    ADD CONSTRAINT user_policy_attachments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: vendor_agreement_approvals vendor_agreement_approvals_agreement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreement_approvals
    ADD CONSTRAINT vendor_agreement_approvals_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES public.vendor_agreements(id) ON DELETE CASCADE;


--
-- Name: vendor_agreement_approvals vendor_agreement_approvals_approver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreement_approvals
    ADD CONSTRAINT vendor_agreement_approvals_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: vendor_agreement_changes vendor_agreement_changes_agreement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreement_changes
    ADD CONSTRAINT vendor_agreement_changes_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES public.vendor_agreements(id) ON DELETE CASCADE;


--
-- Name: vendor_agreement_changes vendor_agreement_changes_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreement_changes
    ADD CONSTRAINT vendor_agreement_changes_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: vendor_agreements vendor_agreements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreements
    ADD CONSTRAINT vendor_agreements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: vendor_agreements vendor_agreements_file_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreements
    ADD CONSTRAINT vendor_agreements_file_owner_user_id_fkey FOREIGN KEY (file_owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: vendor_agreements vendor_agreements_owner_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreements
    ADD CONSTRAINT vendor_agreements_owner_approved_by_fkey FOREIGN KEY (owner_approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: vendor_agreements vendor_agreements_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreements
    ADD CONSTRAINT vendor_agreements_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: vendor_agreements vendor_agreements_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreements
    ADD CONSTRAINT vendor_agreements_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: vendor_agreements vendor_agreements_vendor_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreements
    ADD CONSTRAINT vendor_agreements_vendor_approved_by_fkey FOREIGN KEY (vendor_approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: vendor_agreements vendor_agreements_vendor_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreements
    ADD CONSTRAINT vendor_agreements_vendor_connection_id_fkey FOREIGN KEY (vendor_connection_id) REFERENCES public.storage_connections(connection_id) ON DELETE SET NULL;


--
-- Name: vendor_agreements vendor_agreements_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_agreements
    ADD CONSTRAINT vendor_agreements_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;


--
-- Name: vendor_file_profiling_results vendor_file_profiling_results_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_file_profiling_results
    ADD CONSTRAINT vendor_file_profiling_results_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.storage_connections(connection_id);


--
-- Name: vendor_file_profiling_results vendor_file_profiling_results_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_file_profiling_results
    ADD CONSTRAINT vendor_file_profiling_results_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: vendor_file_profiling_results vendor_file_profiling_results_uploaded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_file_profiling_results
    ADD CONSTRAINT vendor_file_profiling_results_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id);


--
-- Name: vendor_file_profiling_results vendor_file_profiling_results_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_file_profiling_results
    ADD CONSTRAINT vendor_file_profiling_results_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);


--
-- Name: vendor_users vendor_users_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_users
    ADD CONSTRAINT vendor_users_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: vendor_users vendor_users_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_users
    ADD CONSTRAINT vendor_users_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: vendor_users vendor_users_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendor_users
    ADD CONSTRAINT vendor_users_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;


--
-- Name: vendors vendors_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: vendors vendors_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: vendors vendors_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: vendors vendors_vendor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_vendor_user_id_fkey FOREIGN KEY (vendor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: visual_workflows visual_workflows_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.visual_workflows
    ADD CONSTRAINT visual_workflows_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: workflow_executions workflow_executions_current_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_current_step_id_fkey FOREIGN KEY (current_step_id) REFERENCES public.workflow_steps(id);


--
-- Name: workflow_executions workflow_executions_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.business_processes(id) ON DELETE CASCADE;


--
-- Name: workflow_steps workflow_steps_depends_on_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_depends_on_fkey FOREIGN KEY (depends_on) REFERENCES public.workflow_steps(id) ON DELETE SET NULL;


--
-- Name: workflow_steps workflow_steps_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.business_processes(id) ON DELETE CASCADE;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

