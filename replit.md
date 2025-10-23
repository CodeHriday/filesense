# Data File Observatory

## Overview
Data File Observatory is a comprehensive platform for monitoring and analyzing data files, combining Python-based analytics with a web interface. Its primary purpose is to provide quality checks, profiling, and visualization for various file types, ensuring data integrity and offering actionable insights. The platform focuses on robust data handling, data governance, ETL, and workflow orchestration, aiming to provide a user-friendly interface for critical data management tasks.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a hybrid architecture designed for scalability, security, and performance:

-   **Backend**: Python/Streamlit handles data processing, quality analysis (completeness, consistency, validity, uniqueness) for CSV, JSON, XLSX, XML, and Parquet. It supports large files with constant memory usage, data profiling, and asynchronous processing with memory safeguards.
-   **API Server**: Node.js/Express provides a REST API with hybrid authentication (local + Okta SSO), JWT tokens, rate limiting, CORS, asynchronous job queues, and an enterprise-grade audit system.
-   **Frontend**: React (TypeScript, Vite) forms a modern single-page application with UI components, Chart.js for visualization, and drag-and-drop file upload.
-   **Database**: PostgreSQL stores metadata, user management, file catalogs, and audit logs, optimized with connection pooling and performance indexes.
-   **File Storage**: Local file system with integrated support for AWS S3, Google Cloud Storage, and Azure Blob Storage. All uploads are scanned by ClamAV.
-   **Caching**: Multi-layer caching with Redis and in-memory fallback for frequently accessed data and API responses, with automatic invalidation.
-   **DBT Integration**: Configured for DBT Core and dbt-postgres for data transformations, including a UI for model discovery, execution, and monitoring.
-   **Security**: ClamAV for virus scanning, automatic deletion of infected files, enterprise-grade RBAC with column-level security, and AES-256-CBC encryption for cloud credentials. Hybrid authentication supports strong password policies, account lockouts, password history for local users, and Okta SSO with automatic user provisioning. RBAC includes 5 default roles (Admin, Data Steward, Data Engineer, Analyst, Viewer) and a PII Reader role with masked access to sensitive data. Column-level security uses tag-based permissions, intelligent data masking, and user-aware caching.
-   **Enterprise RBAC Transformation**: An advanced system featuring project-level access control, policy-as-data engine (AWS IAM model), ABAC (Attribute-Based Access Control) for context-aware policies, and SCIM 2.0 Provisioning for automated IdP synchronization. This system provides workspace isolation with a three-layer security model: project membership, global permissions, and project-specific policies.
-   **Audit System**: Comprehensive, enterprise-grade audit logging across five tables with a full-featured UI for viewing and export.
-   **ETL Transformation System**: Comprehensive ETL with file pattern matching, schema validation, 25+ field transformations, schema drift detection, profiling with anomaly detection, and job execution tracking. It supports full format conversion between CSV, JSON, XLSX, XML, and Parquet. Includes a Variables feature for ETL field mapping.
-   **Workflow Orchestration**: Complete system for managing data pipelines, including:
    -   **Mapping Groups**: Batch execution of multiple transformations with configurable concurrency.
    -   **Workflows**: Multi-step processes with dependency management, retry logic, and parallel/sequential execution.
    -   **Scheduler**: Cron-based and interval-based scheduling with overlap prevention and error handling.
-   **UI/UX Decisions**: Consistent CSS styling, React modals with local temporary state, and a three-line DataProfile header layout. Column-level data governance is implemented with Tags and Policies. Admin-only pages for tag and policy management with full CRUD operations and JSON rules editor.
-   **File Insights Dashboard**: Includes time-series metric tracking, smart file pattern extraction, ID field detection, alert integration, and configurable granularity.

## External Dependencies
-   **Runtimes**: Python 3.11+, Node.js 20
-   **Database**: PostgreSQL 16
-   **Frontend Framework**: React 18
-   **Key Libraries**: pandas, numpy, plotly, ijson, pyarrow, psutil, Express.js, Streamlit, pg, bcrypt, jsonwebtoken, multer, AWS SDK, TypeScript, ESLint, Prettier, bullmq, dbt-core, dbt-postgres, xlsx, fast-xml-parser, cron-parser.
-   **Cloud Storage**: AWS S3, Google Cloud Storage, Azure Blob Storage
-   **Security**: ClamAV