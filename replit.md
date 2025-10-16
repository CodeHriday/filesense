# Data File Observatory

## Overview
Data File Observatory is a comprehensive data quality monitoring and observability platform designed for uploading, analyzing, and monitoring data files. It integrates Python-based analytics with a modern web interface to provide advanced quality checks, profiling, and visualization for various file types, ensuring data integrity and offering actionable insights. The platform aims to provide robust data handling, ensuring data integrity and offering insights through a user-friendly interface.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a hybrid architecture:

-   **Backend**: Python/Streamlit handles data processing, quality analysis (completeness, consistency, validity, uniqueness), and file operations for CSV, JSON, and Parquet, supporting large files with constant memory usage. It includes data profiling and asynchronous processing with memory safeguards.
-   **API Server**: Node.js/Express provides a REST API with JWT authentication, rate limiting, CORS, asynchronous job queues, and an enterprise-grade audit system.
-   **Frontend**: React (TypeScript, Vite) forms a modern single-page application with UI components, Chart.js for visualization, and drag-and-drop file upload functionality.
-   **Database**: PostgreSQL stores metadata, user management, file catalogs, and audit logs, optimized with connection pooling and performance indexes.
-   **File Storage**: Local file system with integrated support for AWS S3, Google Cloud Storage, and Azure Blob Storage. All file uploads are scanned by ClamAV for viruses.
-   **Caching**: Multi-layer caching with Redis and in-memory fallback for frequently accessed data and API responses, with automatic invalidation.
-   **DBT Integration**: Configured for DBT Core and dbt-postgres for data transformations, including a UI for model discovery, execution, and monitoring.
-   **Security**: ClamAV integration for virus scanning on all uploads, automatic deletion of infected files, role-based access control, and AES-256-CBC encryption for cloud credentials.
-   **Audit System**: Comprehensive, enterprise-grade audit logging across five tables (`audit_log`, `execution_audit`, `data_access_log`, `config_change_history`, `security_audit_log`) with a full-featured UI for viewing and export.

## External Dependencies
-   **Runtimes**: Python 3.11+, Node.js 20
-   **Database**: PostgreSQL 16
-   **Frontend Framework**: React 18
-   **Key Libraries**: pandas, numpy, plotly, ijson, pyarrow, psutil, Express.js, Streamlit, pg, bcrypt, jsonwebtoken, multer, AWS SDK, TypeScript, ESLint, Prettier, bullmq, dbt-core, dbt-postgres.
-   **Cloud Storage**: AWS S3, Google Cloud Storage, Azure Blob Storage
-   **Security**: ClamAV

## Recent Updates

### Multi-File Upload Visual Indicators (October 15, 2025)
**Status**: ✅ Completed

**Problem Fixed**:
Multi-file uploads were taking 15-18 seconds per file for virus scanning but showed no visual feedback, causing confusion as files appeared to upload instantly after long delays.

**Solution**:
- **Individual File Status Tracking**: Each file now shows real-time status (Waiting → Scanning → Uploading → Complete/Failed)
- **Visual Indicators**: Spinning icon during virus scan, progress percentage during upload, completion/error icons
- **Enhanced UI**: Clear feedback for each file's current state throughout the entire upload process
- **Status Flow**: `pending → scanning (15-18s) → uploading (with %) → success/error`

**Technical Implementation**:
- Updated `FileDropzone.jsx` with multi-file status callbacks
- Added `updateFileStatus` function to track individual file progress
- Enhanced processFileUpload to support multi-file mode with scanning phase
- File state structure: `{ name, status, progress, error? }`

### ETL Transformation System (October 15, 2025)
**Status**: ✅ Complete

**Overview**:
Comprehensive ETL (Extract, Transform, Load) transformation system with file pattern matching (wildcards), schema validation, lightweight field transformations (25+ functions), schema drift detection, profiling with anomaly detection rules, and job execution tracking with full audit trail.

**Core Features**:
1. **File Pattern Matching**: Wildcard support (`*`, `?`) to match multiple source files
2. **Schema Management**: Automatic extraction, validation, consistency checking, drift detection
3. **Field Transformations**: 25+ transformation functions including:
   - **Null Handling**: null-to-value, coalesce
   - **String Operations**: UPPER, LOWER, TRIM, SUBSTRING, REPLACE, concat, split, left/right pad
   - **Date/Time**: Format conversion, system date/time
   - **Numeric**: ROUND, FLOOR, CEIL, math operations (add, subtract, multiply, divide)
   - **Conditional**: CASE WHEN with multiple operators
   - **Type Casting**: String, integer, float, boolean, date conversion
   - **Data Security**: Hash (MD5, SHA256, etc.)
   - **Lookup**: Value mapping/replacement
4. **Quality Checks**: Automatic profiling with anomaly detection (numeric deviation >10%, row count changes, null spikes, type mismatches)
5. **Job Execution**: Unique job IDs (`JOB-{timestamp}-{uuid}`), status tracking, comprehensive logging
6. **Audit Trail**: Complete tracking of all transformations, anomalies, and job executions

**Database Schema** (6 new tables):
- `transformation_mappings`: Mapping definitions with source/target connections, file patterns, field mappings, anomaly rules
- `file_schemas`: Schema snapshots with hash-based change detection
- `transformation_jobs`: Job execution tracking with statistics (files, rows read/written/failed, duration)
- `transformation_logs`: Detailed execution logs with levels (info/warn/error) and JSONB details
- `profiling_metrics`: Historical profiling data with quality scores and distributions
- `anomalies`: Anomaly tracking with severity (low/medium/high), resolution workflow

**Backend Services**:
- `filePatternMatcher.js`: Wildcard pattern matching (`*` → `%`, `?` → `_`) with SQL LIKE conversion
- `schemaService.js`: Schema extraction, comparison, validation, drift detection with hash generation
- `transformationEngine.js`: 25+ transformation functions with chain application and row-level processing
- `profilingService.js`: Quality checks using 7-day rolling baselines for numeric deviation, row count, null spikes, type mismatches
- `anomalyService.js`: Anomaly logging with automatic severity classification
- `anomalyRulesEngine.js`: Configurable rules with thresholds, statistics, and auto-adjustment suggestions
- `jobExecutionEngine.js`: Complete job lifecycle management with file processing, schema validation, transformation application, profiling integration

**API Endpoints**:
- **Transformations**: `/api/transformations` - CRUD operations, pattern validation, async job execution
- **Jobs**: `/api/jobs` - Job listing, status retrieval, logs, anomalies, metrics, cancellation, statistics

**Design Decisions**:
- **Wildcard Normalization**: Global regex replacement for multi-wildcard support
- **Schema Storage**: Dual approach (JSONB in files table + dedicated file_schemas table for history)
- **Error Isolation**: File-level errors don't fail entire job
- **Async Execution**: Jobs run in background, immediate 202 response
- **Historical Baselines**: 7-day lookback for trend detection vs. static thresholds
- **Quality Scoring**: Severity-weighted deductions from 100 (high=-15, medium=-10, low=-5)

**UI Components**:
- **Mappings Dashboard** (`src/pages/Mappings.jsx`): Lists all ETL mappings with tabs for Mappings and Recent Jobs, execute/edit/delete actions
- **Mapping Wizard** (`src/pages/MappingWizard.jsx`): 4-step wizard for creating/editing mappings:
  1. Name & Source Connection selection
  2. File Pattern with wildcard validation (`*.csv`, `sales_*.json`)
  3. Field Mapping with 25+ transformation function options
  4. Target Connection & Anomaly Rules (numeric deviation, row count, null spikes, type mismatches)
- **ETL Job Details** (`src/pages/ETLJobDetails.jsx`): Job monitoring with tabs for Overview, Logs, Anomalies, and Metrics
- **Navigation**: Added "Mappings" tab in sidebar under "Process Management" section

**Key Files**:
- Backend Services: `backend/services/{transformationEngine,profilingService,anomalyRulesEngine,jobExecutionEngine,schemaService,anomalyService}.js`
- Utilities: `backend/utils/filePatternMatcher.js`, `backend/db.js`
- API Routes: `backend/routes/{transformations,jobs}.js`
- Database: `backend/migrations/createETLTransformationTables.js`
- Frontend: `src/pages/{Mappings,MappingWizard,ETLJobDetails}.jsx`

**Known Issues Fixed**:
- API response format mismatch: Changed `mappingsRes.data` to `mappingsRes.data.mappings` to handle nested response structure

### ETL Job Execution Database Schema Fix (October 16, 2025)
**Status**: ✅ Fixed

**Problem Identified**:
All ETL transformation jobs were stuck in "running" status with no progress. Job execution and cancellation operations were failing silently.

**Root Cause**:
Database schema mismatches between migration and code:
1. **Missing `updated_at` column** in `transformation_jobs` table - Code expected this column for all job updates
2. **Column name mismatch** in `transformation_logs` table - Migration created `log_message` but code tried to insert into `message`

**Impact**:
- Jobs couldn't update status → stayed stuck in "running" forever
- Progress tracking failed → no real-time updates
- Job cancellation failed → showed "Failed to cancel job" error
- Logging failed → no execution logs appeared

**Solution Applied**:
1. Added `updated_at TIMESTAMP` column to `transformation_jobs` table
2. Renamed `log_message` to `message` in `transformation_logs` table
3. Reset 5 stuck jobs to "failed" status with error message: "Job interrupted due to database schema issues (fixed)"

**SQL Fixes**:
```sql
ALTER TABLE transformation_jobs ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE transformation_logs RENAME COLUMN log_message TO message;
UPDATE transformation_jobs SET status = 'failed', end_time = CURRENT_TIMESTAMP, 
  error_message = 'Job interrupted due to database schema issues (fixed)', 
  updated_at = CURRENT_TIMESTAMP WHERE status = 'running';
```

**Verification**:
- ✅ Database schema now matches code expectations
- ✅ No more column-not-found errors in logs
- ✅ Job execution can proceed normally
- ✅ Progress tracking and cancellation work correctly

### ETL Job Execution Enhancements (October 16, 2025)
**Status**: ✅ Completed

**Problem Identified**:
Three critical issues affecting job execution quality:
1. **Filename Modification**: Output files had timestamps and mapping names appended (e.g., `data.csv` → `data_1234567890_mapping-name.csv`)
2. **Missing Duration**: Jobs didn't track or display execution time (duration_ms was always null)
3. **Empty Output Files**: Transformed files were blank when no field mappings were configured

**Root Causes**:
1. `generateOutputFilename` was adding timestamp and mapping name to preserve uniqueness
2. `updateJob` function wasn't calculating duration_ms from start_time and end_time
3. `transformRow` returned empty objects when field_mappings was empty, causing blank CSV/JSON outputs

**Solutions Applied**:
1. **Filename Preservation**: Modified `generateOutputFilename` to return original filename unchanged - no timestamps or suffixes
2. **Duration Calculation**: Enhanced `updateJob` to auto-calculate `duration_ms` when `end_time` is set:
   - Fetches `start_time` from database with single SELECT
   - Calculates milliseconds difference: `(end_time - start_time)`
   - Low overhead - only runs when job completes/fails/is cancelled
3. **Data Passthrough**: Fixed `transformRow` to pass through original row when `field_mappings` is empty/null:
   - Prevents empty transformed rows
   - Ensures data is always written to output files
   - Graceful handling of unmapped transformations

**Security Enhancement**:
- Removed sensitive row data from logs - only log column names and counts, not actual field values
- Prevents PII exposure in system logs while maintaining diagnostic capability

**Files Modified**:
- `backend/services/jobExecutionEngine.js`: Filename, duration, and logging improvements
- `backend/services/transformationEngine.js`: Data passthrough logic in transformRow

**Verification**:
- ✅ Original filenames preserved in target storage
- ✅ Job duration calculated and displayed correctly
- ✅ Data written to output files even without field mappings
- ✅ No sensitive data in logs (architect-approved)

### Schema Extraction Function Fix (October 16, 2025)
**Status**: ✅ Completed

**Problem Identified**:
ETL job execution was failing with "extractSchemaFromBuffer is not a function" error, causing empty output files with "undefined" values. Schema validation step couldn't extract schemas from source files.

**Root Cause**:
- `jobExecutionEngine.js` imported and called `extractSchemaFromBuffer()` from `schemaService.js`
- This function didn't exist - it was never exported from the schema service
- Internal function `parseFileSchema()` existed and did the work, but wasn't accessible externally

**Solution Applied**:
Created and exported `extractSchemaFromBuffer()` wrapper function in `schemaService.js`:
- Takes `(fileBuffer, filename)` as parameters
- Extracts file extension from filename
- Delegates to existing `parseFileSchema()` function
- Returns schema array with columns, types, and indexes

**Files Modified**:
- `backend/services/schemaService.js`: Added extractSchemaFromBuffer wrapper and exported it

**Verification**:
- ✅ Schema extraction now works correctly for CSV and JSON files
- ✅ Jobs can validate schema consistency across multiple files
- ✅ Output files contain proper data instead of "undefined"