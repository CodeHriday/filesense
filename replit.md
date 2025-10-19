# Data File Observatory

## Overview
Data File Observatory is a comprehensive platform for monitoring and analyzing data files. It combines Python-based analytics with a web interface to provide quality checks, profiling, and visualization for various file types, ensuring data integrity and offering actionable insights. The platform aims to provide robust data handling, ensuring data integrity and offering insights through a user-friendly interface.

## Recent Changes
- **October 19, 2025**: Enhanced Variables feature with 3-pane expression builder
  - Redesigned Add/Edit Variable modals with sophisticated 3-pane layout:
    - Left pane (20%): Source columns and previously defined variables with + buttons
    - Middle pane (15%): Transformation functions grouped by category with + buttons
    - Right pane (65%): Expression builder textarea with real-time preview
  - Click + buttons to insert columns and function templates at cursor position
  - Supports building complex nested expressions like: concat(UPPER(first_name), ' ', last_name)
  - Smart cursor tracking maintains insertion point during edits
  - Expression field stored directly in variables (backwards compatible with legacy format)
  - Built-in help tips and expression preview for better UX
- **October 19, 2025**: Implemented Variables feature for ETL field mapping
  - Added collapsible Variables section in TableBasedMapper with sequential pre-calculations
  - Variables execute in defined order before field mappings for derived columns
  - Variables can reference source fields, previously defined variables, and transformation functions
  - Full CRUD operations: add, edit, delete, reorder (up/down) with visual ordering
  - Backend validation ensures unique names following pattern /^[A-Za-z_][A-Za-z0-9_]*$/
  - Added `variables` JSONB column to transformation_mappings table
  - Variables stored with automatic sequence numbering for deterministic execution
  - Updated MappingWizard to handle variables alongside field mappings
  - Variables referenced in mappings as $variable_name (e.g., $full_name)
- **October 17, 2025**: Implemented automated scheduler execution system
  - Added SchedulerWorker class that runs every 60 seconds
  - Automatic execution of due schedules (transformations, mapping groups, workflows)
  - Graceful shutdown handler for proper resource cleanup
  - User authentication integration via JWT tokens
  - Comprehensive error handling and structured logging
  - Prevents overlapping executions with isProcessing flag
- **October 16, 2025**: Added complete UI for ETL Orchestration features
  - Created three new pages: Mapping Groups, Workflows, and ETL Scheduler
  - Added list/create/edit functionality for all orchestration features
  - Integrated routing in App.jsx with protected routes
  - Added "ETL Orchestration" section in sidebar with navigation items:
    - Batch Groups (Mapping Groups with concurrency control)
    - Workflow Steps (Multi-step processes with dependencies)
    - ETL Scheduler (Cron and interval-based scheduling)
  - Added CSS styling for orchestration pages

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a hybrid architecture:

-   **Backend**: Python/Streamlit handles data processing, quality analysis (completeness, consistency, validity, uniqueness), and file operations for CSV, JSON, XLSX, XML, and Parquet (temporarily disabled), supporting large files with constant memory usage. Includes data profiling and asynchronous processing with memory safeguards.
-   **API Server**: Node.js/Express provides a REST API with JWT authentication, rate limiting, CORS, asynchronous job queues, and an enterprise-grade audit system.
-   **Frontend**: React (TypeScript, Vite) forms a modern single-page application with UI components, Chart.js for visualization, and drag-and-drop file upload functionality.
-   **Database**: PostgreSQL stores metadata, user management, file catalogs, and audit logs, optimized with connection pooling and performance indexes.
-   **File Storage**: Local file system with integrated support for AWS S3, Google Cloud Storage, and Azure Blob Storage. All file uploads are scanned by ClamAV for viruses.
-   **Caching**: Multi-layer caching with Redis and in-memory fallback for frequently accessed data and API responses, with automatic invalidation.
-   **DBT Integration**: Configured for DBT Core and dbt-postgres for data transformations, including a UI for model discovery, execution, and monitoring.
-   **Security**: ClamAV integration for virus scanning on all uploads, automatic deletion of infected files, role-based access control, and AES-256-CBC encryption for cloud credentials.
-   **Audit System**: Comprehensive, enterprise-grade audit logging across five tables with a full-featured UI for viewing and export.
-   **ETL Transformation System**: Comprehensive ETL system with file pattern matching (wildcards), schema validation, lightweight field transformations (25+ functions), schema drift detection, profiling with anomaly detection rules, and job execution tracking with full audit trail. Supports CSV, JSON, XLSX, XML, and Parquet file formats with full format conversion capabilities (any input format → any output format).
-   **Workflow Orchestration**: Complete orchestration system with:
    -   **Mapping Groups**: Batch execution of multiple transformations with configurable concurrency control (1-10 parallel jobs)
    -   **Workflows**: Multi-step processes with dependency management (topological sort), retry logic (3 attempts), and both parallel/sequential execution modes
    -   **Scheduler**: Cron-based scheduling using cron-parser library (supports full cron syntax) and interval-based schedules (minute/hour/day/week/month/year)
    -   **Automated Execution**: SchedulerWorker runs every 60 seconds, automatically executing due schedules with overlap prevention, error handling, and graceful shutdown support
    -   **Known Limitation**: Interval scheduler uses naive calendar math - may drift across DST transitions. Use cron expressions for production-critical schedules.

## External Dependencies
-   **Runtimes**: Python 3.11+, Node.js 20
-   **Database**: PostgreSQL 16
-   **Frontend Framework**: React 18
-   **Key Libraries**: pandas, numpy, plotly, ijson, pyarrow, psutil, Express.js, Streamlit, pg, bcrypt, jsonwebtoken, multer, AWS SDK, TypeScript, ESLint, Prettier, bullmq, dbt-core, dbt-postgres, xlsx, fast-xml-parser, cron-parser.
-   **Cloud Storage**: AWS S3, Google Cloud Storage, Azure Blob Storage
-   **Security**: ClamAV