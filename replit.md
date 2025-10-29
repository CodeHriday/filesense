# Data File Observatory

## Overview
Data File Observatory is a comprehensive platform for monitoring and analyzing data files, combining Python-based analytics with a web interface. Its primary purpose is to provide quality checks, profiling, and visualization for various file types, ensuring data integrity and offering actionable insights. The platform focuses on robust data handling, data governance, ETL, and workflow orchestration, aiming to provide a user-friendly interface for critical data management tasks. The project aims to provide a robust solution for data management, ensuring data quality, and offering advanced analytics, targeting businesses that require stringent data governance and efficient data processing.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a hybrid architecture designed for scalability, security, and performance.

-   **Backend**: Python/Streamlit handles data processing, quality analysis (completeness, consistency, validity, uniqueness) for various file types (CSV, JSON, XLSX, XML, Parquet), supporting large files with constant memory usage, data profiling, and asynchronous processing.
-   **API Server**: Node.js/Express provides a REST API with hybrid authentication (local + Okta SSO), JWT tokens, rate limiting, CORS, asynchronous job queues, and an enterprise-grade audit system.
-   **Frontend**: React (TypeScript, Vite) forms a modern single-page application with UI components, Chart.js for visualization, and drag-and-drop file upload. Consistent CSS styling, React modals, and a three-line DataProfile header layout ensure a cohesive user experience.
-   **Database**: PostgreSQL stores metadata, user management, file catalogs, and audit logs, optimized with connection pooling and performance indexes.
-   **File Storage**: Local file system with integrated support for AWS S3, Google Cloud Storage, and Azure Blob Storage. All uploads are scanned by ClamAV.
-   **Caching**: Multi-layer caching with Redis and in-memory fallback for frequently accessed data and API responses, with automatic invalidation.
-   **DBT Integration**: Configured for DBT Core and dbt-postgres for data transformations, including a UI for model discovery, execution, and monitoring.
-   **Security**: Includes ClamAV for virus scanning, automatic deletion of infected files, enterprise-grade RBAC with column-level security, and AES-256-CBC encryption for cloud credentials. Hybrid authentication supports strong password policies, account lockouts, password history for local users, and Okta SSO with automatic user provisioning. RBAC includes 5 default roles (Admin, Data Steward, Data Engineer, Analyst, Viewer) and a PII Reader role with masked access to sensitive data. Column-level security uses tag-based permissions, intelligent data masking, and user-aware caching. An advanced Enterprise RBAC Transformation system features project-level access control, policy-as-data engine (AWS IAM model), ABAC for context-aware policies, and SCIM 2.0 Provisioning. This system provides workspace isolation with a three-layer security model: project membership, global permissions, and project-specific policies. Permissions use a colon-separated format (e.g., `transformation:execute`).
-   **Audit System**: Comprehensive, enterprise-grade audit logging across five tables with a full-featured UI for viewing and export.
-   **ETL Transformation System**: Comprehensive ETL with file pattern matching, schema validation, 25+ field transformations, schema drift detection, profiling with anomaly detection, and job execution tracking. Supports full format conversion between CSV, JSON, XLSX, XML, and Parquet, and includes a Variables feature for ETL field mapping.
-   **Workflow Orchestration**: Complete system for managing data pipelines, including:
    -   **Mapping Groups**: Batch execution of multiple transformations with configurable concurrency.
    -   **Workflows**: Multi-step processes with dependency management, retry logic, and parallel/sequential execution.
    -   **Scheduler**: Cron-based and interval-based scheduling with overlap prevention and error handling.
-   **File Insights Dashboard**: Includes time-series metric tracking, smart file pattern extraction, ID field detection, alert integration, and configurable granularity.
-   **Vendor Onboarding Module**: Comprehensive vendor management system where admins manage vendor connections at the agreement level using UUID identifiers. Vendor agreements integrate into the ETL transformation mapping workflow, allowing users to select agreements as alternative sources to regular connections for automated file processing. Includes file browsing capabilities with folder/file selection and a transformation file catalog with search functionality.

## Recent Changes
-   **2025-10-29**: 
    - Fixed vendor_onboarding_date persistence issue in vendor agreements edit flow by adding date formatting for HTML date input.
    - Implemented Vendor Agreement Schema Validation System for ETL transformations:
        - Added `schema_drift_handling` column to `transformation_mappings` table (values: 'abort', 'alert', 'none').
        - Added `schema_validation` column to `transformation_jobs` table to track Pass/Fail status.
        - Updated MappingWizard Step 1: Auto-populates source file name, target connection, and target file path from vendor agreement when selected.
        - Source file name is read-only when vendor agreement is selected to ensure compliance.
        - Target file name remains editable by users for flexibility.
        - Added schema drift handling UI in MappingWizard Step 2 with two options:
            - **Abort Job**: Stops processing if schema mismatch detected (recommended for critical pipelines).
            - **Alert & Process**: Logs warning with "Fail" status in Monitor and continues processing.
        - Created `schemaValidationService.js` to compare actual file schema against vendor agreement schema.
        - Service supports AWS S3, Google Cloud Storage, and Azure Blob Storage.
        - Detects missing columns, unexpected columns, and column order mismatches.
        - Supports CSV, Excel (XLSX/XLS), and JSON file formats.
-   **2025-10-28**: 
    - Enhanced vendor agreement system with template download/upload and vendor user management.
    - Updated labels: 'Owner Contact' → 'Vendor Department Email', 'Vendor' → 'Vendor Name'.
    - Created `vendor_users` table to store contact information for vendor personnel (name, email, phone, designation).
    - Added backend service `vendorUserService.js` and routes `/api/vendor-users` for vendor user CRUD operations.
    - Implemented VendorUserSelect searchable dropdown component for contact selection in vendor agreements.
    - Contact dropdowns auto-populate name, email, phone, and designation fields from selected vendor user.
    - Excel template system for bulk agreement creation:
        - Download endpoint generates Excel template with headers, instructions, examples, and separate instructions sheet.
        - Upload endpoint parses and validates template with row-level error reporting.
        - Bulk upload modal allows admins to set context (vendor, project, connections, owner) for all agreements in batch.
        - Template includes 17 user-fillable fields, excludes admin-only fields (vendor_id, project_id, connections, contacts).
        - Validation enforces dropdown values, boolean TRUE/FALSE, number formats, and JSON structure.
    - Made `storage_connections.project_id` nullable to support global vendor connections. Vendor connections are admin-managed and not tied to specific projects initially; vendor agreements link them to projects as needed.
    - Implemented email-based contract access control: Users listed as primary or secondary contacts (by email) can now view and approve vendor contracts, enabling designated vendor personnel to participate in the approval workflow without requiring direct vendor_user_id association. JWT tokens now include email field for contact-based authorization. Both frontend and backend authorization layers validate email matching for contract access and approval/rejection operations.

## External Dependencies
-   **Runtimes**: Python 3.11+, Node.js 20
-   **Database**: PostgreSQL 16
-   **Frontend Framework**: React 18
-   **Key Libraries**: pandas, numpy, plotly, ijson, pyarrow, psutil, Express.js, Streamlit, pg, bcrypt, jsonwebtoken, multer, AWS SDK, TypeScript, ESLint, Prettier, bullmq, dbt-core, dbt-postgres, xlsx, fast-xml-parser, cron-parser.
-   **Cloud Storage**: AWS S3, Google Cloud Storage, Azure Blob Storage
-   **Security**: ClamAV