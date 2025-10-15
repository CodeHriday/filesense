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
**Status**: ✅ Backend Complete | ⏳ UI In Progress

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

**Key Files**:
- Backend Services: `backend/services/{transformationEngine,profilingService,anomalyRulesEngine,jobExecutionEngine,schemaService,anomalyService}.js`
- Utilities: `backend/utils/filePatternMatcher.js`
- API Routes: `backend/routes/{transformations,jobs}.js`
- Database: `backend/migrations/createETLTransformationTables.js`

**Remaining Work**:
- UI components for transformation creation and job monitoring
- End-to-end integration testing