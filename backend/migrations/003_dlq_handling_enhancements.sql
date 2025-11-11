-- Migration: Add DLQ (Dead Letter Queue) handling enhancements
-- Adds database-enforced ENUM types for failure reason codes with actionable error messages

-- Create ENUM type for file processing failure reasons
DO $$ BEGIN
  CREATE TYPE file_failure_reason AS ENUM (
    'virus_detected',
    'password_missing',
    'unsupported_encoding',
    'conversion_failed',
    'extraction_failed',
    'clamav_unavailable',
    'malformed_file',
    'schema_validation_failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create ENUM type for ETL job failure reasons
DO $$ BEGIN
  CREATE TYPE job_failure_reason AS ENUM (
    'conversion_failed',
    'unsupported_encoding',
    'schema_mismatch',
    'source_file_missing',
    'target_write_failed',
    'transformation_error'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add failure_reason_code column to files table using ENUM
ALTER TABLE files
ADD COLUMN IF NOT EXISTS failure_reason_code file_failure_reason;

-- Add index for querying failed files by reason (consistent naming)
CREATE INDEX IF NOT EXISTS idx_files_failure_reason_code
ON files(failure_reason_code) 
WHERE failure_reason_code IS NOT NULL;

-- Add comment describing the usage
COMMENT ON COLUMN files.failure_reason_code IS 
'Database-enforced failure reason code. Use processing_error column for human-readable actionable messages.';

-- Add failure_reason_code column to transformation_jobs table using ENUM
ALTER TABLE transformation_jobs
ADD COLUMN IF NOT EXISTS failure_reason_code job_failure_reason;

-- Add index for querying failed jobs by reason (consistent naming)
CREATE INDEX IF NOT EXISTS idx_transformation_jobs_failure_reason_code
ON transformation_jobs(failure_reason_code) 
WHERE failure_reason_code IS NOT NULL;

-- Add comment for transformation_jobs failure codes
COMMENT ON COLUMN transformation_jobs.failure_reason_code IS 
'Database-enforced failure reason code for ETL jobs. Use error_message column for human-readable actionable messages.';
