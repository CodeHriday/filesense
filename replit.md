# Data File Observatory

## Overview
Data File Observatory is a comprehensive platform for monitoring and analyzing data files. It combines Python-based analytics with a web interface to provide quality checks, profiling, and visualization for various file types, ensuring data integrity and offering actionable insights. The platform aims to provide robust data handling, ensuring data integrity and offering insights through a user-friendly interface with a focus on data governance, ETL, and workflow orchestration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a hybrid architecture:

-   **Backend**: Python/Streamlit handles data processing, quality analysis (completeness, consistency, validity, uniqueness), and file operations for CSV, JSON, XLSX, XML, and Parquet, supporting large files with constant memory usage. Includes data profiling and asynchronous processing with memory safeguards.
-   **API Server**: Node.js/Express provides a REST API with hybrid authentication (local + Okta SSO), JWT tokens, rate limiting, CORS, asynchronous job queues, and an enterprise-grade audit system.
-   **Frontend**: React (TypeScript, Vite) forms a modern single-page application with UI components, Chart.js for visualization, and drag-and-drop file upload functionality.
-   **Database**: PostgreSQL stores metadata, user management, file catalogs, and audit logs, optimized with connection pooling and performance indexes.
-   **File Storage**: Local file system with integrated support for AWS S3, Google Cloud Storage, and Azure Blob Storage. All file uploads are scanned by ClamAV for viruses.
-   **Caching**: Multi-layer caching with Redis and in-memory fallback for frequently accessed data and API responses, with automatic invalidation.
-   **DBT Integration**: Configured for DBT Core and dbt-postgres for data transformations, including a UI for model discovery, execution, and monitoring.
-   **Security**: ClamAV integration for virus scanning on all uploads, automatic deletion of infected files, enterprise-grade RBAC with column-level security, and AES-256-CBC encryption for cloud credentials.
-   **Hybrid Authentication System**: Supports both local authentication with enhanced security and Okta SSO for enterprise users:
    -   **Local Authentication**: Strong password requirements (12+ characters, uppercase, lowercase, numbers, special characters), account lockout after 5 failed attempts (30-minute lockout), password history tracking (prevents reuse of last 5 passwords), password strength meter in UI
    -   **Okta SSO**: Enterprise single sign-on with automatic user provisioning, session-based OIDC flow, seamless JWT token generation for app access
    -   **User Profile Fields**: Comprehensive profile support including first_name, middle_name, last_name, phone_number, full address fields, auto-computed full_name
    -   **Auth Provider Tracking**: Users tagged with auth_provider (local/okta), external_id for SSO users, password field nullable for SSO users
    -   **Session Management**: Express-session middleware with secure cookies for OIDC state persistence
    -   **Environment Variables**: OKTA_ISSUER, OKTA_CLIENT_ID, OKTA_CLIENT_SECRET, OKTA_REDIRECT_URI, SESSION_SECRET
-   **RBAC & Column-Level Security**: Complete role-based access control system with:
    -   **5 Default Roles**: Admin (full access), Data Steward (governance focus with tag management), Data Engineer (transformations/workflows), Analyst (read + execute), Viewer (read-only)
    -   **PII Reader Role**: Special role with permissions for dashboard:read, file_upload:read, file_profile:read, quality_checks:read, tag:pii:read. This role can access the File Catalog page, view file lists, view file details, and access file processing status.
    -   **File Catalog Access**: Requires authentication and at least one of these permissions: file_view, file:read, file_upload:read, or file_profile:read. All file endpoints (/api/files, /api/files/:fileId, /api/files/:fileId/status) enforce permission checks.
    -   **Tag-Based Permissions**: Fine-grained column access via tag permissions (tag:pii:read, tag:pii:edit, tag:confidential:*, tag:financial:*)
    -   **Column Masking**: Intelligent data masking for unauthorized users (email: a***@domain.com, SSN: ***-**-1234, generic: ab****yz)
    -   **Permission Levels**: Tags support permission_level (Public/Restricted/Private) and sensitivity_level for data classification
    -   **Access Control Service**: backend/services/columnAccessControl.js handles permission checks and data filtering
    -   **User-Aware Caching**: Cache keys include user ID (cache:${userId}:${baseKey}) to prevent cross-user data leaks. In-memory cache cleared on server restart.
    -   **Audit Trail**: Enhanced logging captures masked/denied column access with user, role, and operation details
-   **Audit System**: Comprehensive, enterprise-grade audit logging across five tables with a full-featured UI for viewing and export.
-   **ETL Transformation System**: Comprehensive ETL system with file pattern matching (wildcards), schema validation, lightweight field transformations (25+ functions), schema drift detection, profiling with anomaly detection rules, and job execution tracking with full audit trail. Supports CSV, JSON, XLSX, XML, and Parquet file formats with full format conversion capabilities (any input format → any output format). Includes a Variables feature for ETL field mapping with a 3-pane expression builder.
-   **Workflow Orchestration**: Complete orchestration system with:
    -   **Mapping Groups**: Batch execution of multiple transformations with configurable concurrency control (1-10 parallel jobs).
    -   **Workflows**: Multi-step processes with dependency management (topological sort), retry logic (3 attempts), and both parallel/sequential execution modes.
    -   **Scheduler**: Cron-based scheduling using cron-parser library (supports full cron syntax) and interval-based schedules (minute/hour/day/week/month/year).
    -   **Automated Execution**: SchedulerWorker runs every 60 seconds, automatically executing due schedules with overlap prevention, error handling, and graceful shutdown support.
-   **UI/UX Decisions**: Consistent CSS styling using existing design system variables, modals following React best practices with local temporary state, and a three-line DataProfile header layout for improved information hierarchy. Column-level data governance is implemented with Tags and Policies.
-   **Tag Management System**: Admin-only page with full CRUD operations for centrally managed governance tags.
-   **Policy Management**: Redesigned with a table layout and full CRUD operations including a JSON rules editor.
-   **File Insights Dashboard**: Includes time-series metric tracking, smart file pattern extraction, ID field detection, alert integration, and configurable granularity.

## External Dependencies
-   **Runtimes**: Python 3.11+, Node.js 20
-   **Database**: PostgreSQL 16
-   **Frontend Framework**: React 18
-   **Key Libraries**: pandas, numpy, plotly, ijson, pyarrow, psutil, Express.js, Streamlit, pg, bcrypt, jsonwebtoken, multer, AWS SDK, TypeScript, ESLint, Prettier, bullmq, dbt-core, dbt-postgres, xlsx, fast-xml-parser, cron-parser.
-   **Cloud Storage**: AWS S3, Google Cloud Storage, Azure Blob Storage
-   **Security**: ClamAV