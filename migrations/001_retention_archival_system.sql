-- Migration: Retention & Archival System
-- Created: 2025-11-05
-- Purpose: Add support for automated retention policies, archival, and restoration

-- ============================================================================
-- RETENTION POLICIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS retention_policies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT true,
    
    -- Policy Rules
    retention_days INTEGER, -- Archive files older than X days
    min_quality_score DECIMAL(5,2), -- Archive files below quality threshold
    max_file_size_mb INTEGER, -- Archive files larger than X MB
    file_types VARCHAR(255)[], -- Specific file types to archive (e.g., ['csv', 'xlsx'])
    tags VARCHAR(255)[], -- Archive files with specific tags
    access_pattern VARCHAR(50), -- 'cold' (rarely accessed), 'warm', 'hot'
    
    -- Custom SQL condition for advanced rules
    custom_condition TEXT,
    
    -- Archive Destination (storage-agnostic)
    archive_storage_type VARCHAR(50) NOT NULL, -- 's3', 'gcs', 'azure', 'local'
    archive_connection_id UUID, -- References connections/storage_connections table
    archive_path_prefix VARCHAR(500), -- Path prefix in archive storage
    
    -- Policy Metadata
    priority INTEGER DEFAULT 50, -- Lower number = higher priority
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    run_frequency VARCHAR(50) DEFAULT 'daily', -- 'daily', 'weekly', 'monthly'
    
    -- Audit Fields
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_by INTEGER,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_retention_policies_enabled ON retention_policies(enabled);
CREATE INDEX idx_retention_policies_priority ON retention_policies(priority);
CREATE INDEX idx_retention_policies_next_run ON retention_policies(next_run_at) WHERE enabled = true;

-- ============================================================================
-- ARCHIVED FILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS archived_files (
    id SERIAL PRIMARY KEY,
    file_id VARCHAR(255) NOT NULL, -- References files table
    original_filename VARCHAR(500),
    original_path VARCHAR(1000),
    original_size_bytes BIGINT,
    
    -- Archive Information
    policy_id INTEGER REFERENCES retention_policies(id),
    archive_storage_type VARCHAR(50) NOT NULL,
    archive_connection_id UUID,
    archive_path VARCHAR(1000) NOT NULL, -- Full path in archive storage
    archive_checksum VARCHAR(64), -- Verify integrity
    
    -- Archival Metadata
    archived_at TIMESTAMP DEFAULT NOW(),
    archived_by INTEGER REFERENCES users(id),
    archive_reason TEXT, -- Why was this archived?
    
    -- Original File Metadata (snapshot at archive time)
    original_metadata JSONB, -- Store full file metadata
    quality_score DECIMAL(5,2),
    row_count INTEGER,
    column_count INTEGER,
    file_type VARCHAR(50),
    
    -- Restoration Status
    is_restored BOOLEAN DEFAULT false,
    restored_at TIMESTAMP,
    restored_by INTEGER REFERENCES users(id),
    
    -- Deletion (for permanent removal)
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,
    deleted_by INTEGER REFERENCES users(id),
    
    -- Audit Trail
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_archived_files_file_id ON archived_files(file_id);
CREATE INDEX idx_archived_files_policy_id ON archived_files(policy_id);
CREATE INDEX idx_archived_files_archived_at ON archived_files(archived_at);
CREATE INDEX idx_archived_files_restored ON archived_files(is_restored);
CREATE INDEX idx_archived_files_storage_type ON archived_files(archive_storage_type);

-- ============================================================================
-- FILE RESTORATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS file_restorations (
    id SERIAL PRIMARY KEY,
    archived_file_id INTEGER REFERENCES archived_files(id),
    file_id VARCHAR(255) NOT NULL,
    
    -- Restoration Details
    restored_to_path VARCHAR(1000),
    restoration_method VARCHAR(50) DEFAULT 'full', -- 'full', 'metadata_only'
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed'
    error_message TEXT,
    
    -- Restoration Metadata
    requested_by INTEGER REFERENCES users(id),
    requested_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Audit Information
    restoration_reason TEXT,
    restored_size_bytes BIGINT,
    verification_status VARCHAR(50), -- 'pending', 'verified', 'checksum_mismatch'
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_file_restorations_archived_file ON file_restorations(archived_file_id);
CREATE INDEX idx_file_restorations_status ON file_restorations(status);
CREATE INDEX idx_file_restorations_requested_at ON file_restorations(requested_at);

-- ============================================================================
-- RETENTION POLICY EXECUTION LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS retention_policy_runs (
    id SERIAL PRIMARY KEY,
    policy_id INTEGER REFERENCES retention_policies(id),
    
    -- Execution Details
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'running', -- 'running', 'completed', 'failed'
    error_message TEXT,
    
    -- Statistics
    files_evaluated INTEGER DEFAULT 0,
    files_archived INTEGER DEFAULT 0,
    files_skipped INTEGER DEFAULT 0,
    total_bytes_archived BIGINT DEFAULT 0,
    
    -- Execution Metadata
    triggered_by VARCHAR(50) DEFAULT 'scheduler', -- 'scheduler', 'manual', 'api'
    executed_by INTEGER REFERENCES users(id),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_retention_runs_policy ON retention_policy_runs(policy_id);
CREATE INDEX idx_retention_runs_started_at ON retention_policy_runs(started_at);
CREATE INDEX idx_retention_runs_status ON retention_policy_runs(status);

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_retention_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER retention_policies_updated_at
    BEFORE UPDATE ON retention_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_retention_updated_at();

CREATE TRIGGER archived_files_updated_at
    BEFORE UPDATE ON archived_files
    FOR EACH ROW
    EXECUTE FUNCTION update_retention_updated_at();

CREATE TRIGGER file_restorations_updated_at
    BEFORE UPDATE ON file_restorations
    FOR EACH ROW
    EXECUTE FUNCTION update_retention_updated_at();

CREATE TRIGGER retention_policy_runs_updated_at
    BEFORE UPDATE ON retention_policy_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_retention_updated_at();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE retention_policies IS 'Configurable rules for automated file archival and lifecycle management';
COMMENT ON TABLE archived_files IS 'Tracking table for all archived files with metadata snapshot and restoration status';
COMMENT ON TABLE file_restorations IS 'Audit log of all file restoration operations';
COMMENT ON TABLE retention_policy_runs IS 'Execution history of retention policy evaluations';

COMMENT ON COLUMN retention_policies.custom_condition IS 'Optional SQL WHERE clause for advanced policy rules';
COMMENT ON COLUMN retention_policies.archive_connection_id IS 'References storage connection for archive destination (platform-agnostic)';
COMMENT ON COLUMN archived_files.original_metadata IS 'JSONB snapshot of complete file metadata at archive time for auditability';
