-- =====================================================
-- DATA FILE OBSERVATORY - Schema Migration Script
-- Generated: 2026-01-07
-- From: Production (Jan 5, 2026) -> Development (Jan 7, 2026)
-- =====================================================
-- 
-- This migration contains:
-- 1. Missing table: groups
-- 2. Missing columns across 5 tables (36 total columns)
-- 3. Missing indexes (43 total)
--
-- IMPORTANT: Run in a transaction and test on staging first
-- All column checks are schema-qualified to avoid false positives
-- =====================================================

BEGIN;

-- =====================================================
-- SECTION 1: SEQUENCES (create before tables)
-- =====================================================

CREATE SEQUENCE IF NOT EXISTS groups_id_seq START WITH 1 INCREMENT BY 1;

-- =====================================================
-- SECTION 2: MISSING TABLE - groups
-- =====================================================

CREATE TABLE IF NOT EXISTS groups (
    id INTEGER NOT NULL DEFAULT nextval('groups_id_seq'::regclass),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

-- =====================================================
-- SECTION 3: MISSING COLUMNS - projects table
-- =====================================================

-- Column: name (if not exists)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'name') THEN
        ALTER TABLE public.projects ADD COLUMN name VARCHAR(255);
    END IF;
END $$;

-- Column: is_active
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'is_active') THEN
        ALTER TABLE public.projects ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Column: is_archived
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'is_archived') THEN
        ALTER TABLE public.projects ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- Column: project_type
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'project_type') THEN
        ALTER TABLE public.projects ADD COLUMN project_type VARCHAR(20) DEFAULT 'internal';
    END IF;
END $$;

-- Column: drop_location_bucket
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'drop_location_bucket') THEN
        ALTER TABLE public.projects ADD COLUMN drop_location_bucket VARCHAR(255);
    END IF;
END $$;

-- Column: drop_location_prefix
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'drop_location_prefix') THEN
        ALTER TABLE public.projects ADD COLUMN drop_location_prefix VARCHAR(500);
    END IF;
END $$;

-- Column: drop_location_connection_id
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'drop_location_connection_id') THEN
        ALTER TABLE public.projects ADD COLUMN drop_location_connection_id VARCHAR(100);
    END IF;
END $$;

-- Column: metadata
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'metadata') THEN
        ALTER TABLE public.projects ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Column: settings
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'settings') THEN
        ALTER TABLE public.projects ADD COLUMN settings JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- =====================================================
-- SECTION 4: MISSING COLUMNS - jobs table
-- =====================================================

-- Column: name
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'name') THEN
        ALTER TABLE public.jobs ADD COLUMN name VARCHAR(255);
    END IF;
END $$;

-- =====================================================
-- SECTION 5: MISSING COLUMNS - transformations table
-- =====================================================

-- Column: name
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transformations' AND column_name = 'name') THEN
        ALTER TABLE public.transformations ADD COLUMN name TEXT;
    END IF;
END $$;

-- Column: type
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transformations' AND column_name = 'type') THEN
        ALTER TABLE public.transformations ADD COLUMN type TEXT;
    END IF;
END $$;

-- Column: error
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transformations' AND column_name = 'error') THEN
        ALTER TABLE public.transformations ADD COLUMN error TEXT;
    END IF;
END $$;

-- Column: result
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transformations' AND column_name = 'result') THEN
        ALTER TABLE public.transformations ADD COLUMN result JSONB;
    END IF;
END $$;

-- Column: progress
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transformations' AND column_name = 'progress') THEN
        ALTER TABLE public.transformations ADD COLUMN progress INTEGER DEFAULT 0;
    END IF;
END $$;

-- Column: task_id
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transformations' AND column_name = 'task_id') THEN
        ALTER TABLE public.transformations ADD COLUMN task_id VARCHAR(255);
    END IF;
END $$;

-- =====================================================
-- SECTION 6: MISSING COLUMNS - visual_workflows table
-- =====================================================

-- Column: name
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'visual_workflows' AND column_name = 'name') THEN
        ALTER TABLE public.visual_workflows ADD COLUMN name VARCHAR(255);
    END IF;
END $$;

-- Column: sub_project_id
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'visual_workflows' AND column_name = 'sub_project_id') THEN
        ALTER TABLE public.visual_workflows ADD COLUMN sub_project_id INTEGER;
    END IF;
END $$;

-- =====================================================
-- SECTION 7: MISSING COLUMNS - vendor_agreements table (26 columns)
-- =====================================================

-- Column: schema (JSONB for file schema definition)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'schema') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN schema JSONB;
    END IF;
END $$;

-- Column: version
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'version') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN version INTEGER DEFAULT 1;
    END IF;
END $$;

-- Column: frequency_description
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'frequency_description') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN frequency_description TEXT;
    END IF;
END $$;

-- Column: vendor_department_team
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'vendor_department_team') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN vendor_department_team VARCHAR(255);
    END IF;
END $$;

-- Column: file_owner_user_id
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'file_owner_user_id') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN file_owner_user_id INTEGER;
    END IF;
END $$;

-- Column: primary_contact_name
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'primary_contact_name') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN primary_contact_name VARCHAR(255);
    END IF;
END $$;

-- Column: owner_contact
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'owner_contact') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN owner_contact VARCHAR(255);
    END IF;
END $$;

-- Column: vendor_approved_at
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'vendor_approved_at') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN vendor_approved_at TIMESTAMP WITHOUT TIME ZONE;
    END IF;
END $$;

-- Column: vendor_approved_by
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'vendor_approved_by') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN vendor_approved_by INTEGER;
    END IF;
END $$;

-- Column: owner_approved_at
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'owner_approved_at') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN owner_approved_at TIMESTAMP WITHOUT TIME ZONE;
    END IF;
END $$;

-- Column: owner_approved_by
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'owner_approved_by') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN owner_approved_by INTEGER;
    END IF;
END $$;

-- Column: is_locked
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'is_locked') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN is_locked BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Column: locked_at
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'locked_at') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN locked_at TIMESTAMP WITHOUT TIME ZONE;
    END IF;
END $$;

-- Column: data_classification
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'data_classification') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN data_classification VARCHAR(50);
    END IF;
END $$;

-- Column: domain
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'domain') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN domain VARCHAR(255);
    END IF;
END $$;

-- Column: retention_days
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'retention_days') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN retention_days INTEGER;
    END IF;
END $$;

-- Column: expected_arrival_time
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'expected_arrival_time') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN expected_arrival_time VARCHAR(50);
    END IF;
END $$;

-- Column: delivery_method
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'delivery_method') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN delivery_method VARCHAR(100);
    END IF;
END $$;

-- Column: vendor_type
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'vendor_type') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN vendor_type VARCHAR(100);
    END IF;
END $$;

-- Column: vendor_department_email
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'vendor_department_email') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN vendor_department_email VARCHAR(255);
    END IF;
END $$;

-- Column: vendor_onboarding_date
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'vendor_onboarding_date') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN vendor_onboarding_date DATE;
    END IF;
END $$;

-- Column: governance_manager_user_id
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'governance_manager_user_id') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN governance_manager_user_id INTEGER;
    END IF;
END $$;

-- Column: governance_approved_at
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'governance_approved_at') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN governance_approved_at TIMESTAMP WITHOUT TIME ZONE;
    END IF;
END $$;

-- Column: governance_approved_by
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'governance_approved_by') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN governance_approved_by INTEGER;
    END IF;
END $$;

-- Column: contract_start_date
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'contract_start_date') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN contract_start_date TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Column: contract_end_date
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'contract_end_date') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN contract_end_date TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Column: sub_project_id
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'sub_project_id') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN sub_project_id INTEGER;
    END IF;
END $$;

-- Column: description
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'description') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN description TEXT;
    END IF;
END $$;

-- Column: sla_enabled
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'sla_enabled') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN sla_enabled BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Column: frequency_pattern
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'frequency_pattern') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN frequency_pattern VARCHAR(50);
    END IF;
END $$;

-- Column: arrival_days
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'arrival_days') THEN
        ALTER TABLE public.vendor_agreements ADD COLUMN arrival_days TEXT;
    END IF;
END $$;

-- =====================================================
-- SECTION 8: CONDITIONAL INDEXES
-- Only create indexes if the underlying columns exist
-- =====================================================

-- Helper function to safely create indexes
CREATE OR REPLACE FUNCTION create_index_if_column_exists(
    p_index_name TEXT,
    p_table_name TEXT,
    p_column_name TEXT,
    p_index_def TEXT
) RETURNS VOID AS $$
BEGIN
    -- Check if column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = p_table_name 
        AND column_name = p_column_name
    ) THEN
        -- Check if index already exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND indexname = p_index_name
        ) THEN
            EXECUTE p_index_def;
            RAISE NOTICE 'Created index: %', p_index_name;
        ELSE
            RAISE NOTICE 'Index already exists: %', p_index_name;
        END IF;
    ELSE
        RAISE NOTICE 'Skipping index % - column % does not exist on table %', p_index_name, p_column_name, p_table_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Index group: projects
SELECT create_index_if_column_exists('idx_projects_is_active', 'projects', 'is_active', 
    'CREATE INDEX idx_projects_is_active ON public.projects(is_active)');
SELECT create_index_if_column_exists('idx_projects_owner_id', 'projects', 'owner_id', 
    'CREATE INDEX idx_projects_owner_id ON public.projects(owner_id)');
SELECT create_index_if_column_exists('idx_projects_project_type', 'projects', 'project_type', 
    'CREATE INDEX idx_projects_project_type ON public.projects(project_type)');

-- Index group: jobs
SELECT create_index_if_column_exists('idx_jobs_status', 'jobs', 'status', 
    'CREATE INDEX idx_jobs_status ON public.jobs(status)');
SELECT create_index_if_column_exists('idx_jobs_created_by', 'jobs', 'created_by', 
    'CREATE INDEX idx_jobs_created_by ON public.jobs(created_by)');
SELECT create_index_if_column_exists('idx_jobs_business_process_id', 'jobs', 'business_process_id', 
    'CREATE INDEX idx_jobs_business_process_id ON public.jobs(business_process_id)');

-- Index group: transformations
SELECT create_index_if_column_exists('idx_transformations_type', 'transformations', 'type', 
    'CREATE INDEX idx_transformations_type ON public.transformations(type)');
SELECT create_index_if_column_exists('idx_transformations_created_by', 'transformations', 'created_by', 
    'CREATE INDEX idx_transformations_created_by ON public.transformations(created_by)');

-- Index group: visual_workflows
SELECT create_index_if_column_exists('idx_visual_workflows_project_id', 'visual_workflows', 'project_id', 
    'CREATE INDEX idx_visual_workflows_project_id ON public.visual_workflows(project_id)');
SELECT create_index_if_column_exists('idx_visual_workflows_sub_project_id', 'visual_workflows', 'sub_project_id', 
    'CREATE INDEX idx_visual_workflows_sub_project_id ON public.visual_workflows(sub_project_id)');
SELECT create_index_if_column_exists('idx_visual_workflows_created_by', 'visual_workflows', 'created_by', 
    'CREATE INDEX idx_visual_workflows_created_by ON public.visual_workflows(created_by)');
SELECT create_index_if_column_exists('idx_visual_workflows_is_active', 'visual_workflows', 'is_active', 
    'CREATE INDEX idx_visual_workflows_is_active ON public.visual_workflows(is_active)');

-- Index group: vendor_agreements
SELECT create_index_if_column_exists('idx_vendor_agreements_vendor_id', 'vendor_agreements', 'vendor_id', 
    'CREATE INDEX idx_vendor_agreements_vendor_id ON public.vendor_agreements(vendor_id)');
SELECT create_index_if_column_exists('idx_vendor_agreements_approval_status', 'vendor_agreements', 'approval_status', 
    'CREATE INDEX idx_vendor_agreements_approval_status ON public.vendor_agreements(approval_status)');
SELECT create_index_if_column_exists('idx_vendor_agreements_status', 'vendor_agreements', 'status', 
    'CREATE INDEX idx_vendor_agreements_status ON public.vendor_agreements(status)');
SELECT create_index_if_column_exists('idx_vendor_agreements_file_owner_user_id', 'vendor_agreements', 'file_owner_user_id', 
    'CREATE INDEX idx_vendor_agreements_file_owner_user_id ON public.vendor_agreements(file_owner_user_id)');
SELECT create_index_if_column_exists('idx_vendor_agreements_governance_manager_user_id', 'vendor_agreements', 'governance_manager_user_id', 
    'CREATE INDEX idx_vendor_agreements_governance_manager_user_id ON public.vendor_agreements(governance_manager_user_id)');
SELECT create_index_if_column_exists('idx_vendor_agreements_sub_project_id', 'vendor_agreements', 'sub_project_id', 
    'CREATE INDEX idx_vendor_agreements_sub_project_id ON public.vendor_agreements(sub_project_id)');

-- Index group: files
SELECT create_index_if_column_exists('idx_files_project_id', 'files', 'project_id', 
    'CREATE INDEX idx_files_project_id ON public.files(project_id)');
SELECT create_index_if_column_exists('idx_files_upload_date', 'files', 'upload_date', 
    'CREATE INDEX idx_files_upload_date ON public.files(upload_date DESC)');
SELECT create_index_if_column_exists('idx_files_status', 'files', 'status', 
    'CREATE INDEX idx_files_status ON public.files(status)');
SELECT create_index_if_column_exists('idx_files_file_type', 'files', 'file_type', 
    'CREATE INDEX idx_files_file_type ON public.files(file_type)');
SELECT create_index_if_column_exists('idx_files_created_by', 'files', 'created_by', 
    'CREATE INDEX idx_files_created_by ON public.files(created_by)');

-- Index group: transformation_mappings
SELECT create_index_if_column_exists('idx_transformation_mappings_project_id', 'transformation_mappings', 'project_id', 
    'CREATE INDEX idx_transformation_mappings_project_id ON public.transformation_mappings(project_id)');
SELECT create_index_if_column_exists('idx_transformation_mappings_vendor_agreement_id', 'transformation_mappings', 'vendor_agreement_id', 
    'CREATE INDEX idx_transformation_mappings_vendor_agreement_id ON public.transformation_mappings(vendor_agreement_id)');
SELECT create_index_if_column_exists('idx_transformation_mappings_status', 'transformation_mappings', 'status', 
    'CREATE INDEX idx_transformation_mappings_status ON public.transformation_mappings(status)');
SELECT create_index_if_column_exists('idx_transformation_mappings_sub_project_id', 'transformation_mappings', 'sub_project_id', 
    'CREATE INDEX idx_transformation_mappings_sub_project_id ON public.transformation_mappings(sub_project_id)');

-- Index group: audit_log
SELECT create_index_if_column_exists('idx_audit_log_timestamp', 'audit_log', 'timestamp', 
    'CREATE INDEX idx_audit_log_timestamp ON public.audit_log(timestamp DESC)');
SELECT create_index_if_column_exists('idx_audit_log_user_id', 'audit_log', 'user_id', 
    'CREATE INDEX idx_audit_log_user_id ON public.audit_log(user_id)');
SELECT create_index_if_column_exists('idx_audit_log_action', 'audit_log', 'action', 
    'CREATE INDEX idx_audit_log_action ON public.audit_log(action)');
SELECT create_index_if_column_exists('idx_audit_log_entity_type', 'audit_log', 'entity_type', 
    'CREATE INDEX idx_audit_log_entity_type ON public.audit_log(entity_type)');
SELECT create_index_if_column_exists('idx_audit_log_entity_id', 'audit_log', 'entity_id', 
    'CREATE INDEX idx_audit_log_entity_id ON public.audit_log(entity_id)');

-- Index group: visual_workflow_executions
SELECT create_index_if_column_exists('idx_visual_workflow_executions_workflow_id', 'visual_workflow_executions', 'workflow_id', 
    'CREATE INDEX idx_visual_workflow_executions_workflow_id ON public.visual_workflow_executions(workflow_id)');
SELECT create_index_if_column_exists('idx_visual_workflow_executions_status', 'visual_workflow_executions', 'status', 
    'CREATE INDEX idx_visual_workflow_executions_status ON public.visual_workflow_executions(status)');
SELECT create_index_if_column_exists('idx_visual_workflow_executions_execution_id', 'visual_workflow_executions', 'execution_id', 
    'CREATE INDEX idx_visual_workflow_executions_execution_id ON public.visual_workflow_executions(execution_id)');
SELECT create_index_if_column_exists('idx_visual_workflow_executions_triggered_by', 'visual_workflow_executions', 'triggered_by', 
    'CREATE INDEX idx_visual_workflow_executions_triggered_by ON public.visual_workflow_executions(triggered_by)');

-- Index group: visual_workflow_execution_logs
SELECT create_index_if_column_exists('idx_visual_workflow_execution_logs_workflow_id', 'visual_workflow_execution_logs', 'workflow_id', 
    'CREATE INDEX idx_visual_workflow_execution_logs_workflow_id ON public.visual_workflow_execution_logs(workflow_id)');
SELECT create_index_if_column_exists('idx_visual_workflow_execution_logs_execution_id', 'visual_workflow_execution_logs', 'execution_id', 
    'CREATE INDEX idx_visual_workflow_execution_logs_execution_id ON public.visual_workflow_execution_logs(execution_id)');
SELECT create_index_if_column_exists('idx_visual_workflow_execution_logs_started_at', 'visual_workflow_execution_logs', 'started_at', 
    'CREATE INDEX idx_visual_workflow_execution_logs_started_at ON public.visual_workflow_execution_logs(started_at DESC)');

-- Index group: dlq_jobs
SELECT create_index_if_column_exists('idx_dlq_jobs_project_id', 'dlq_jobs', 'project_id', 
    'CREATE INDEX idx_dlq_jobs_project_id ON public.dlq_jobs(project_id)');
SELECT create_index_if_column_exists('idx_dlq_jobs_status', 'dlq_jobs', 'status', 
    'CREATE INDEX idx_dlq_jobs_status ON public.dlq_jobs(status)');
SELECT create_index_if_column_exists('idx_dlq_jobs_file_id', 'dlq_jobs', 'file_id', 
    'CREATE INDEX idx_dlq_jobs_file_id ON public.dlq_jobs(file_id)');
SELECT create_index_if_column_exists('idx_dlq_jobs_error_code', 'dlq_jobs', 'error_code', 
    'CREATE INDEX idx_dlq_jobs_error_code ON public.dlq_jobs(error_code)');
SELECT create_index_if_column_exists('idx_dlq_jobs_created_at', 'dlq_jobs', 'created_at', 
    'CREATE INDEX idx_dlq_jobs_created_at ON public.dlq_jobs(created_at)');

-- Partial index for vendor_agreement_id (only create if column exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'dlq_jobs' 
        AND column_name = 'vendor_agreement_id'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND indexname = 'idx_dlq_jobs_vendor_agreement'
        ) THEN
            CREATE INDEX idx_dlq_jobs_vendor_agreement ON public.dlq_jobs(vendor_agreement_id) WHERE vendor_agreement_id IS NOT NULL;
            RAISE NOTICE 'Created partial index: idx_dlq_jobs_vendor_agreement';
        END IF;
    END IF;
END $$;

-- Clean up helper function (optional - keep for future migrations)
-- DROP FUNCTION IF EXISTS create_index_if_column_exists(TEXT, TEXT, TEXT, TEXT);

-- =====================================================
-- SECTION 9: FOREIGN KEY CONSTRAINTS
-- Only add if referenced table/column exists
-- =====================================================

-- Foreign key: vendor_agreements.file_owner_user_id -> users.id
DO $$ 
BEGIN 
    -- Check if column and referenced table exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'file_owner_user_id')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
       AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND constraint_name = 'vendor_agreements_file_owner_user_id_fkey')
    THEN
        ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_file_owner_user_id_fkey 
            FOREIGN KEY (file_owner_user_id) REFERENCES public.users(id);
        RAISE NOTICE 'Created FK: vendor_agreements_file_owner_user_id_fkey';
    END IF;
END $$;

-- Foreign key: vendor_agreements.governance_manager_user_id -> users.id
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'governance_manager_user_id')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
       AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND constraint_name = 'vendor_agreements_governance_manager_user_id_fkey')
    THEN
        ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_governance_manager_user_id_fkey 
            FOREIGN KEY (governance_manager_user_id) REFERENCES public.users(id);
        RAISE NOTICE 'Created FK: vendor_agreements_governance_manager_user_id_fkey';
    END IF;
END $$;

-- Foreign key: vendor_agreements.vendor_approved_by -> users.id
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'vendor_approved_by')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
       AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND constraint_name = 'vendor_agreements_vendor_approved_by_fkey')
    THEN
        ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_vendor_approved_by_fkey 
            FOREIGN KEY (vendor_approved_by) REFERENCES public.users(id);
        RAISE NOTICE 'Created FK: vendor_agreements_vendor_approved_by_fkey';
    END IF;
END $$;

-- Foreign key: vendor_agreements.owner_approved_by -> users.id
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'owner_approved_by')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
       AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND constraint_name = 'vendor_agreements_owner_approved_by_fkey')
    THEN
        ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_owner_approved_by_fkey 
            FOREIGN KEY (owner_approved_by) REFERENCES public.users(id);
        RAISE NOTICE 'Created FK: vendor_agreements_owner_approved_by_fkey';
    END IF;
END $$;

-- Foreign key: vendor_agreements.governance_approved_by -> users.id
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vendor_agreements' AND column_name = 'governance_approved_by')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
       AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND constraint_name = 'vendor_agreements_governance_approved_by_fkey')
    THEN
        ALTER TABLE public.vendor_agreements ADD CONSTRAINT vendor_agreements_governance_approved_by_fkey 
            FOREIGN KEY (governance_approved_by) REFERENCES public.users(id);
        RAISE NOTICE 'Created FK: vendor_agreements_governance_approved_by_fkey';
    END IF;
END $$;

COMMIT;

-- =====================================================
-- MIGRATION SUMMARY
-- =====================================================
-- 
-- Tables created: 1 (groups)
-- Columns added: 36
--   - projects: 9 columns
--   - jobs: 1 column
--   - transformations: 6 columns
--   - visual_workflows: 2 columns
--   - vendor_agreements: 26 columns
-- Indexes created: 43 (conditionally, only if columns exist)
-- Foreign keys added: 5 (conditionally, only if columns and tables exist)
--
-- All operations are idempotent and can be safely re-run.
-- All column existence checks are schema-qualified (public schema).
-- =====================================================
