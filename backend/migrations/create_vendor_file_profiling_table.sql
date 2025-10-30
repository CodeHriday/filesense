-- Migration: Create vendor_file_profiling_results table
-- Description: Stores quality profiling results for vendor-uploaded files

CREATE TABLE IF NOT EXISTS vendor_file_profiling_results (
  id SERIAL PRIMARY KEY,
  file_id VARCHAR(255) NOT NULL UNIQUE,
  uploaded_by_user_id INTEGER REFERENCES users(id),
  vendor_id INTEGER REFERENCES vendors(id),
  connection_id UUID REFERENCES connections(id),
  agreement_id UUID,
  quality_score DECIMAL(5,2),
  completeness_score DECIMAL(5,2),
  consistency_score DECIMAL(5,2),
  validity_score DECIMAL(5,2),
  uniqueness_score DECIMAL(5,2),
  timeliness_score DECIMAL(5,2),
  issues JSONB DEFAULT '[]'::jsonb,
  header_issues JSONB DEFAULT '{}'::jsonb,
  null_value_summary JSONB DEFAULT '{}'::jsonb,
  date_format_issues JSONB DEFAULT '{}'::jsonb,
  duplicate_data JSONB DEFAULT '{}'::jsonb,
  profiling_metadata JSONB DEFAULT '{}'::jsonb,
  profiled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vendor_file_profiling_file_id ON vendor_file_profiling_results(file_id);
CREATE INDEX IF NOT EXISTS idx_vendor_file_profiling_vendor_id ON vendor_file_profiling_results(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_file_profiling_connection_id ON vendor_file_profiling_results(connection_id);
CREATE INDEX IF NOT EXISTS idx_vendor_file_profiling_quality_score ON vendor_file_profiling_results(quality_score);
CREATE INDEX IF NOT EXISTS idx_vendor_file_profiling_profiled_at ON vendor_file_profiling_results(profiled_at DESC);

-- Add comments
COMMENT ON TABLE vendor_file_profiling_results IS 'Stores quality profiling results for vendor-uploaded files';
COMMENT ON COLUMN vendor_file_profiling_results.quality_score IS 'Overall quality score (0-100)';
COMMENT ON COLUMN vendor_file_profiling_results.issues IS 'Array of quality issues found';
COMMENT ON COLUMN vendor_file_profiling_results.header_issues IS 'Detailed header validation issues';
COMMENT ON COLUMN vendor_file_profiling_results.null_value_summary IS 'Summary of NULL values by column';
COMMENT ON COLUMN vendor_file_profiling_results.date_format_issues IS 'Date format inconsistencies by column';
COMMENT ON COLUMN vendor_file_profiling_results.duplicate_data IS 'Duplicate row statistics';
