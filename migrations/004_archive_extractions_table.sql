-- Migration 004: Create archive_extractions table to track extraction attempts
-- This table stores metadata about each archive extraction attempt, separate from archive_members
-- which tracks individual extracted files.

CREATE TABLE IF NOT EXISTS archive_extractions (
  id SERIAL PRIMARY KEY,
  file_id VARCHAR(255) NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
  archive_type VARCHAR(50) NOT NULL, -- 'zip', '7z', 'tar', 'tar.gz', 'tar.bz2'
  is_encrypted BOOLEAN DEFAULT FALSE,
  password_required BOOLEAN DEFAULT FALSE,
  extraction_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed', 'password_required'
  error_message TEXT,
  extracted_count INTEGER DEFAULT 0, -- Number of files extracted
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for querying by file_id
CREATE INDEX IF NOT EXISTS idx_archive_extractions_file_id ON archive_extractions(file_id);

-- Index for querying by status
CREATE INDEX IF NOT EXISTS idx_archive_extractions_status ON archive_extractions(extraction_status);

-- Index for finding failed extractions
CREATE INDEX IF NOT EXISTS idx_archive_extractions_failed ON archive_extractions(extraction_status, password_required) 
WHERE extraction_status IN ('failed', 'password_required');

-- Add helpful comment
COMMENT ON TABLE archive_extractions IS 'Tracks archive extraction attempts with status, errors, and metadata';
COMMENT ON COLUMN archive_extractions.file_id IS 'Reference to the parent archive file in files table';
COMMENT ON COLUMN archive_extractions.archive_type IS 'Archive format detected (zip, 7z, tar, tar.gz, tar.bz2)';
COMMENT ON COLUMN archive_extractions.extraction_status IS 'Current status of extraction attempt';
COMMENT ON COLUMN archive_extractions.extracted_count IS 'Number of files successfully extracted from archive';
