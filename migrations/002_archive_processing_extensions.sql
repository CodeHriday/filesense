-- Migration: Archive Processing Extensions
-- Adds support for password-protected archives, SAS datasets, Avro, DAT files
-- Created: 2025-11-11

-- 1. File Processing Artifacts Table
-- Tracks CSV, Parquet, and metadata outputs generated from processed files
CREATE TABLE IF NOT EXISTS file_processing_artifacts (
    id SERIAL PRIMARY KEY,
    file_id VARCHAR(255) NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
    artifact_type VARCHAR(50) NOT NULL, -- 'csv', 'parquet', 'metadata_json'
    storage_uri TEXT NOT NULL, -- Local path or S3/GCS/Azure URI
    file_size_bytes BIGINT,
    checksum_sha256 VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    CONSTRAINT unique_file_artifact UNIQUE(file_id, artifact_type)
);

CREATE INDEX idx_artifacts_file_id ON file_processing_artifacts(file_id);
CREATE INDEX idx_artifacts_type ON file_processing_artifacts(artifact_type);

-- 2. Archive Members Table
-- Tracks files extracted from ZIP/tar archives
CREATE TABLE IF NOT EXISTS archive_members (
    id SERIAL PRIMARY KEY,
    parent_file_id VARCHAR(255) NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
    extracted_file_id VARCHAR(255) REFERENCES files(file_id) ON DELETE SET NULL,
    logical_name TEXT NOT NULL, -- Path within archive (e.g., "folder/data.csv")
    original_name TEXT NOT NULL, -- Filename only
    file_format VARCHAR(20), -- Detected format: csv, json, xlsx, etc.
    file_size_bytes BIGINT,
    extraction_status VARCHAR(50) DEFAULT 'pending', -- pending, extracted, processing, completed, failed
    error_message TEXT,
    extracted_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT unique_archive_member UNIQUE(parent_file_id, logical_name)
);

CREATE INDEX idx_archive_members_parent ON archive_members(parent_file_id);
CREATE INDEX idx_archive_members_extracted ON archive_members(extracted_file_id);
CREATE INDEX idx_archive_members_status ON archive_members(extraction_status);

-- 3. Encrypted Passwords Table
-- Stores encrypted passwords for password-protected archives
CREATE TABLE IF NOT EXISTS encrypted_passwords (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL, -- 'file', 'vendor_agreement_file_schema'
    entity_id TEXT NOT NULL, -- file_id or schema_id
    secret_ciphertext TEXT NOT NULL, -- AES-256-CBC encrypted password
    encryption_version VARCHAR(20) NOT NULL DEFAULT 'v1',
    iv TEXT NOT NULL, -- Initialization vector for decryption
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    rotation_scheduled_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT unique_entity_password UNIQUE(entity_type, entity_id)
);

CREATE INDEX idx_encrypted_passwords_entity ON encrypted_passwords(entity_type, entity_id);
CREATE INDEX idx_encrypted_passwords_rotation ON encrypted_passwords(rotation_scheduled_at) WHERE rotation_scheduled_at IS NOT NULL;

-- 4. Processing Events Table
-- Stores progress milestones and detailed processing logs
CREATE TABLE IF NOT EXISTS processing_events (
    id SERIAL PRIMARY KEY,
    file_id VARCHAR(255) NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
    job_id VARCHAR(100), -- Queue job ID
    event_type VARCHAR(50) NOT NULL, -- 'milestone', 'progress', 'error', 'warning'
    event_stage VARCHAR(50), -- 'virus_scan', 'extraction', 'conversion', 'profiling', 'validation'
    event_message TEXT NOT NULL,
    progress_percentage INTEGER CHECK (progress_percentage BETWEEN 0 AND 100),
    metadata JSONB, -- Additional context (e.g., extracted file count, error details)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_processing_events_file_id ON processing_events(file_id);
CREATE INDEX idx_processing_events_job_id ON processing_events(job_id);
CREATE INDEX idx_processing_events_type ON processing_events(event_type);
CREATE INDEX idx_processing_events_stage ON processing_events(event_stage);
CREATE INDEX idx_processing_events_created_at ON processing_events(created_at);

-- 5. Update files table status enum
-- Add new statuses for archive processing
DO $$ 
BEGIN
    -- Check if the type exists
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'file_status') THEN
        -- Add new enum values if they don't exist
        BEGIN
            ALTER TYPE file_status ADD VALUE IF NOT EXISTS 'awaiting_password';
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;
        
        BEGIN
            ALTER TYPE file_status ADD VALUE IF NOT EXISTS 'extraction_failed';
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;
        
        BEGIN
            ALTER TYPE file_status ADD VALUE IF NOT EXISTS 'extracting';
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;
    ELSE
        -- If file_status type doesn't exist, just note it
        RAISE NOTICE 'file_status type does not exist, skipping enum updates';
    END IF;
END $$;

-- 6. Add archive-related columns to files table
ALTER TABLE files 
    ADD COLUMN IF NOT EXISTS is_archive BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS archive_format VARCHAR(20), -- 'zip', 'tar', 'tar.gz', 'tar.bz2'
    ADD COLUMN IF NOT EXISTS is_password_protected BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS member_count INTEGER, -- Number of files in archive
    ADD COLUMN IF NOT EXISTS parent_archive_id VARCHAR(255) REFERENCES files(file_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_files_is_archive ON files(is_archive) WHERE is_archive = TRUE;
CREATE INDEX IF NOT EXISTS idx_files_parent_archive ON files(parent_archive_id) WHERE parent_archive_id IS NOT NULL;

-- 7. Add format-specific metadata columns to files table
ALTER TABLE files
    ADD COLUMN IF NOT EXISTS source_format VARCHAR(50), -- Original format before conversion (e.g., 'sas7bdat', 'avro', 'dat')
    ADD COLUMN IF NOT EXISTS format_metadata JSONB; -- Format-specific details (SAS labels, Avro schema, DAT layout)

CREATE INDEX IF NOT EXISTS idx_files_source_format ON files(source_format) WHERE source_format IS NOT NULL;

-- 8. Comments for documentation
COMMENT ON TABLE file_processing_artifacts IS 'Tracks standardized artifacts (CSV, Parquet, metadata JSON) generated from processed files';
COMMENT ON TABLE archive_members IS 'Tracks individual files extracted from ZIP/tar archives with their processing status';
COMMENT ON TABLE encrypted_passwords IS 'Stores AES-256 encrypted passwords for password-protected archives';
COMMENT ON TABLE processing_events IS 'Detailed event log for file processing with progress tracking and error messages';
COMMENT ON COLUMN files.is_archive IS 'TRUE if file is a ZIP/tar archive containing other files';
COMMENT ON COLUMN files.archive_format IS 'Archive format: zip, tar, tar.gz, tar.bz2';
COMMENT ON COLUMN files.is_password_protected IS 'TRUE if archive requires password for extraction';
COMMENT ON COLUMN files.member_count IS 'Number of files contained in archive';
COMMENT ON COLUMN files.parent_archive_id IS 'References parent archive if this file was extracted from an archive';
COMMENT ON COLUMN files.source_format IS 'Original format before conversion (sas7bdat, xpt, avro, dat, etc.)';
COMMENT ON COLUMN files.format_metadata IS 'Format-specific metadata (SAS labels, Avro schema, DAT layout specification)';
