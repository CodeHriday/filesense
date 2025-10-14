# Data File Observatory

## Overview
Data File Observatory is a comprehensive data quality monitoring and observability platform designed to upload, analyze, and monitor data files. It combines Python-based analytics with a modern web interface, offering advanced quality checks, profiling capabilities, and visualization features. The platform aims to provide robust data handling for various file types, ensuring data integrity and offering insights through a user-friendly interface.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application utilizes a hybrid architecture:
-   **Backend**: Python/Streamlit for data processing, quality analysis, and file operations.
    -   **Data Processing**: Handles CSV, JSON, and Parquet files with streaming capabilities for large files (10GB+) using constant memory (<1GB). Includes data profiling, quality assessment (completeness, consistency, validity, uniqueness), and asynchronous processing with memory safeguards.
    -   **Memory Management**: Implements memory monitoring and circuit breaker protection to prevent exhaustion.
-   **API Server**: Node.js/Express provides a REST API layer for frontend communication with JWT authentication, rate limiting, and CORS configuration. It supports asynchronous job queues for background processing of file uploads and includes an enterprise-grade audit system for compliance.
-   **Frontend**: React (TypeScript, Vite) offers a modern single-page application with UI components, Chart.js integration for data visualization, and drag-and-drop file upload.
-   **Database**: PostgreSQL for persistent storage of metadata, user management, file catalogs, and audit logs. Optimized with connection pooling and performance indexes.
-   **File Storage**: Local file system with integrated support for cloud storage solutions like AWS S3, Google Cloud, and Azure Blob Storage.
-   **Caching**: Multi-layer caching with Redis and in-memory fallback for frequently accessed data and API responses, with automatic invalidation.
-   **DBT Integration**: Configured for DBT Core and dbt-postgres to manage data transformations, including a UI for model discovery, execution, and monitoring.

## Recent Updates

### Phase 5.1: DBT Management UI (October 14, 2025)
**Status**: ✅ Completed

**Achievements**:
- **DBT Management UI** (`src/pages/DBTTransformations.jsx`):
  - Model discovery and listing with metadata
  - Execute DBT commands (run, test, compile, build)
  - Execution history and monitoring
  - Real-time execution status tracking
  - Model selection and batch execution
- **DBT Service** (`backend/services/DBTService.js`):
  - Secure command execution with whitelist validation
  - Command injection protection via input sanitization
  - Model discovery from file system
  - Execution tracking and audit logging
- **DBT API Endpoints** (`backend/routes/dbt.js`):
  - `/api/dbt/models` - List all DBT models
  - `/api/dbt/discover` - Discover models from project
  - `/api/dbt/execute` - Execute DBT commands securely
  - `/api/dbt/executions` - Get execution history
- **Navigation**: Added "Apply Transformations" section in sidebar with Transform and DBT Transformations subsections

**Security Enhancements**:
- Whitelisted allowed DBT commands (run, test, compile, build, snapshot, seed, docs)
- Input validation with regex to prevent command injection
- Safe process spawning without shell execution

### Phase 5: DBT Integration & Audit Logging (October 14, 2025)
**Status**: ✅ Completed

**Achievements**:
- **DBT Project Setup**: dbt-core and dbt-postgres installed and configured
- **Comprehensive Audit System**: Enterprise-grade audit logging for compliance
- **Audit Trail UI**: Full-featured audit log viewer with search, filter, and export
- **Database Schema**: Complete audit and job dependency tables

**Audit Logging Implementation**:
- **5 Audit Tables Created**:
  - `audit_log`: Master audit table tracking all system actions
  - `execution_audit`: Job and transformation execution tracking
  - `data_access_log`: File and data access tracking (GDPR compliance)
  - `config_change_history`: Configuration change tracking with rollback support
  - `security_audit_log`: Security events (login, permissions, access denial)
- **Automatic Logging**: Audit middleware logs all API requests/responses
- **AuditService** (`backend/services/AuditService.js`): Centralized audit logging with context management
- **Audit Trail UI** (`src/pages/AuditTrail.jsx`): Advanced search, filtering, and CSV export

**Database Tables Added**:
- `job_dependencies`: Job-to-job dependencies
- `job_group_schedules`: Group-level scheduling
- `job_group_dependencies`: Group-to-group dependencies
- `dbt_models`: DBT model registry
- `dbt_executions`: DBT run tracking

## External Dependencies
-   **Runtimes**: Python 3.11+, Node.js 20
-   **Database**: PostgreSQL 16
-   **Frontend Framework**: React 18
-   **Key Libraries**:
    -   **Data Processing**: pandas, numpy, plotly, ijson, pyarrow, psutil
    -   **Web Frameworks**: Express.js, Streamlit
    -   **Database Client**: pg
    -   **Authentication**: bcrypt, jsonwebtoken
    -   **File Handling**: multer, AWS SDK
    -   **Development**: TypeScript, ESLint, Prettier
    -   **Job Queues**: bullmq (optional, for Redis-backed queues)
    -   **DBT**: dbt-core, dbt-postgres
-   **Cloud Storage**: AWS S3, Google Cloud Storage, Azure Blob Storage