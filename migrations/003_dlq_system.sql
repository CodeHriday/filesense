-- Migration: Dead Letter Queue (DLQ) System
-- Adds support for failed job tracking and remediation
-- Created: 2025-01-19

-- 1. DLQ Jobs Table
-- Tracks failed processing jobs that require human intervention
CREATE TABLE IF NOT EXISTS dlq_jobs (
    id SERIAL PRIMARY KEY,
    job_type VARCHAR(50) NOT NULL, -- 'archive_extraction', 'file_processing', 'etl_transformation'
    file_id VARCHAR(255) REFERENCES files(file_id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    vendor_agreement_id INTEGER REFERENCES vendor_agreements(id) ON DELETE SET NULL,
    original_payload JSONB, -- Original job data for retry
    error_code VARCHAR(100) NOT NULL, -- 'PASSWORD_REQUIRED', 'PASSWORD_INVALID', 'EXTRACTION_FAILED', 'VIRUS_DETECTED'
    error_message TEXT NOT NULL,
    stack_trace TEXT, -- Sanitized stack trace for debugging
    remediation_instructions TEXT, -- Human-readable instructions for fixing the issue
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'resolved', 'failed', 'abandoned'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by INTEGER REFERENCES users(id),
    resolution_notes TEXT
);

CREATE INDEX idx_dlq_jobs_file_id ON dlq_jobs(file_id);
CREATE INDEX idx_dlq_jobs_project_id ON dlq_jobs(project_id);
CREATE INDEX idx_dlq_jobs_status ON dlq_jobs(status);
CREATE INDEX idx_dlq_jobs_error_code ON dlq_jobs(error_code);
CREATE INDEX idx_dlq_jobs_created_at ON dlq_jobs(created_at);
CREATE INDEX idx_dlq_jobs_vendor_agreement ON dlq_jobs(vendor_agreement_id) WHERE vendor_agreement_id IS NOT NULL;

-- 2. Trigger to auto-update updated_at
CREATE TRIGGER update_dlq_jobs_updated_at
    BEFORE UPDATE ON dlq_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 3. Comments for documentation
COMMENT ON TABLE dlq_jobs IS 'Dead letter queue for failed processing jobs requiring human intervention';
COMMENT ON COLUMN dlq_jobs.error_code IS 'Machine-readable error code for classification';
COMMENT ON COLUMN dlq_jobs.remediation_instructions IS 'User-friendly instructions for resolving the error';
COMMENT ON COLUMN dlq_jobs.original_payload IS 'Original job data stored for retry after remediation';
