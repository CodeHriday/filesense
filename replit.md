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
-   **2025-10-30**:
    - **Fixed Vendor Agreement Access for Read-Only Users in Mapping Workflow**: Updated vendor agreement filtering logic to respect `vendor_agreements:read` permission. Users with this permission (Data Steward, Vendor Approver, Vendor Manager, Vendor User - External) can now see all approved vendor contracts in the mapping wizard, not just contracts where they are directly listed as owner/vendor/contact. Modified `GET /api/vendor-agreements` route to check for `vendor_agreements:read` permission and pass flag to service. Updated `getAllAgreements` service method to bypass relationship-based filtering for users with read permission, allowing them full visibility similar to Admin role.
    - **Fixed Connection Selection UUID Bug in Mapping Wizard**: Removed `parseInt()` calls from both source and target connection dropdowns in MappingWizard.jsx. Connection IDs are UUIDs (strings), and parsing them as integers was returning NaN, preventing selection and causing React warnings. Both dropdowns now properly handle UUID strings.
    - **Fixed Project Management User Pagination Issue**: Added `?limit=1000` parameter to user fetch in ProjectManagement.jsx. Backend was returning only first 10 users (default pagination), hiding users with Data Steward and Data Engineer roles who had higher ID numbers. All users now appear in member selection dropdown.
-   **2025-10-29**: 
    - **Added Dashboard Metrics Cards**: Created new backend endpoint `/api/dashboard/metrics` that returns 5 key metrics (Projects, Files, Schedules, Failed Jobs, Anomalies) with permission-based access control. Updated Dashboard.jsx to display prominent metric cards at the top of the page with clickable navigation to respective pages. Cards visually indicate access status (clickable with hover effects for accessible features, dimmed for restricted access). Moved Data Health Metrics section below the new cards for improved information hierarchy. Fixed backend queries to use correct table names (`files` instead of `file_catalog`, `schedules` with `is_active` instead of `deleted`, `anomalies` instead of `file_alerts`).
    - **Implemented Project Type Categorization System** to distinguish between internal and external projects:
        - **Database Schema**: Added `project_type` column to `projects` table with values 'internal' (default) or 'external'.
        - **Backend Routes**: Updated POST/PUT/GET endpoints in `projectRoutes.js` to handle project_type field creation, updates, and filtering via ?project_type query parameter.
        - **Vendor Integration**: Modified `vendorService.js` to auto-create external projects when vendors are created. Vendor-created projects are always typed as 'external' and vendor associations are validated to ensure only external projects are used.
        - **Frontend Project Management**: Added Project Type dropdown in ProjectManagement.jsx create/edit modals, positioned adjacent to Project Name in a side-by-side layout with Internal/External options.
        - **Mapping Workflow**: Updated MappingWizard.jsx to filter projects by project_type=internal, ensuring transformation mappings only show internal projects for proper scoping.
        - **Vendor Workflow**: VendorAgreements.jsx continues to auto-populate projects from vendor entities, now correctly using external projects created during vendor onboarding.
        - **End-to-End Flow**: Internal projects appear in mapping workflows, external projects are vendor-specific and created automatically, providing clear separation of operational contexts.
    - Fixed vendor_onboarding_date persistence issue in vendor agreements edit flow by adding date formatting for HTML date input.
    - **Completed Full-Stack Vendor Agreement Schema Validation System** for ETL transformations:
        - **Database Schema**: Added `schema_drift_handling` column to `transformation_mappings` table (values: 'abort', 'alert', 'none') and `schema_validation` column to `transformation_jobs` table to track Pass/Fail status.
        - **Backend Routes**: Updated POST/PUT endpoints in `transformations.js` to properly destructure and persist schema_drift_handling field.
        - **Schema Validation Service**: Created `schemaValidationService.js` supporting AWS S3, Google Cloud Storage, and Azure Blob Storage for CSV, Excel (XLSX/XLS), and JSON file formats. Detects missing columns, unexpected columns, and column order mismatches.
        - **Job Execution Integration**: Integrated validation into `jobExecutionEngine.js` to automatically validate files against vendor agreement schema during job execution. Implements policy-driven handling: 'abort' fails the job with detailed error message, 'alert' logs warning with Fail status but continues processing, 'none' skips validation.
        - **Frontend MappingWizard**: Step 1 auto-populates source file name (read-only), target connection, and target file path from vendor agreement. Step 2 provides schema drift handling UI with Abort Job and Alert & Process options. Target file name remains editable for flexibility.
        - **Frontend Monitor**: Added Schema Validation column to Jobs.jsx with color-coded Pass/Fail badges (green for Pass, red for Fail, gray for N/A).
        - **End-to-End Flow**: User selects vendor agreement and drift policy → backend persists configuration → job execution validates schema → results displayed in Monitor with Pass/Fail status.
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