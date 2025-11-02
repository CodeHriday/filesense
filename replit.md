# Data File Observatory

## Overview
Data File Observatory is a platform for monitoring and analyzing data files, combining Python-based analytics with a web interface. Its purpose is to provide quality checks, profiling, and visualization for various file types, ensuring data integrity and offering actionable insights. The platform focuses on robust data handling, data governance, ETL, and workflow orchestration, aiming to provide a user-friendly interface for critical data management tasks. The project aims to provide a robust solution for data management, ensuring data quality, and offering advanced analytics, targeting businesses that require stringent data governance and efficient data processing.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes
**November 2, 2025** - Added governance rejection handling for vendor managers:
- Vendor Managers now see action buttons when governance rejects an agreement
- Three options available after governance rejection:
  - "Revise & Resubmit to Governance" - Resets to governance stage with notification sent to governance manager
  - "Send Back to Vendor" - Resets to vendor stage, clears all approvals, notifies vendor user
  - "Close Agreement" - Permanently closes the agreement with locked status
- Created new backend endpoint `/manager-handle-governance-rejection` with complete service method
- Frontend approval panel updated with canManagerHandleGovernanceRejection logic
- Full document attachment support for all three actions with 10 KB limit
- Notifications created with deep-linking for governance manager (resubmit) or vendor user (send back)

**November 2, 2025** - Enhanced role-based approval workflow with vendor rejection handling:
- Vendor Managers now see action buttons at manager approval stage (file_owner_user_id check)
- Governance Managers now see approve/reject buttons at governance stage (governance_manager_user_id check)
- Added special workflow for vendor rejection scenario with two manager options:
  - "Send Back to Vendor" - Resets agreement to vendor stage with notification to vendor
  - "Override & Send to Governance" - Bypasses vendor rejection and advances to governance
- Updated button labels based on stage: "Accept Agreement" (vendor), "Approve & Send to Governance" (manager), "Approve"/"Reject" (governance)
- Created new backend endpoint `/manager-handle-rejection` with service method to handle both rejection actions
- Fixed admin role check to properly detect Admin role from roles array
- Notifications now include deep-linking with query parameters (?view={agreementId}) that auto-open specific agreement modals
- Agreement fetching from notifications works across paginated results using direct API call when agreement not in current page

**November 2, 2025** - Fixed vendor agreement approval document upload and SQL parameter errors:
- Resolved "null value in column 'document_name'" database constraint violation
- Fixed field mapping between route handlers and service layer (filename→name, data→path)
- Added proper document type and description fields to all approval routes
- Implemented centralized Multer error handling middleware with clear error messages
- Changed file_path column from VARCHAR(1000) to TEXT to accommodate base64-encoded files
- Fixed "could not determine data type of parameter $2" SQL error in all three approval methods by separating accept/reject UPDATE queries
- Increased button background transparency (85% opacity) for Accept/Reject buttons in approval panel
- All three approval stages (vendor-action, manager-action, governance-action) now correctly handle document attachments
- 10 KB file size limit enforced with 413 responses for oversized files

**November 1, 2025** - Enhanced vendor project lifecycle management:
- Vendor deletion now automatically removes associated projects (with safety checks)
- Project deletion only occurs when: (1) no other vendors use the project, and (2) no other members exist
- Changed vendor project naming from "{vendor_name} - Vendor Project" to unique codes (e.g., "VENDOR-ABC12345")
- Project code generation uses 8-character hex suffix with uniqueness validation to prevent duplicate key conflicts
- All project lifecycle operations logged for monitoring and audit

**November 1, 2025** - Extended schema drift handling to all source types:
- Removed UI restriction limiting schema drift options to vendor agreements only
- Schema drift handling (abort/alert policies) now available for regular connections and all source types
- Backend validates regular connections against stored mapping schema (`transformation_mappings.source_schema`)
- Vendor agreements continue to validate against vendor contract schema (`vendor_agreements.schema`)
- Both source types enforce drift policies consistently with full execution logging

**October 31, 2025** - Fixed Schema History Change Summary to display modified column details:
- Corrected backend property names in schemaService.js (column→name, oldType→previousType, newType→currentType)
- Change Summary panel now properly displays modified column names and type changes (e.g., "Purc_Qty: string → float")

**October 31, 2025** - Renamed "Transformation File Catalog" to "Processed File Catalog":
- Updated component name from TransformationFileCatalog to ProcessedFileCatalog
- Changed navigation label and route from /transformation-catalog to /processed-catalog (with backward compatibility)
- Updated all UI references to use "Processed" terminology for better clarity
- Schema History tab already displays 3-panel layout (Current | Previous | Change Summary) when previous schema versions exist

**October 31, 2025** - Enhanced Vendor File Catalog with logical file grouping:
- Implemented canonical name-based file grouping using logical_file_id
- Files with timestamps (e.g., monthly_purch_data_20251031T131702.xlsx) now consolidate into single logical groups
- Updated header and badge colors to dark teal (#025043) for visual distinction
- Added expandable file groups with count badges showing number of uploads

**October 31, 2025** - Implemented cross-upload schema tracking with logical file grouping:
- Created `logical_file_groups` table to track schema changes across multiple uploads of the same file
- Added filename normalization utility to create canonical names (strips timestamps, handles vendor patterns)
- Updated schema service to auto-create logical file groups and detect schema drift across uploads
- Redesigned Schema History UI with three-panel layout: Current Schema | Previous Schema | Change Summary
- Added orange schema change badges to File Catalog for files with detected drift
- Fixed critical timestamp bug: corrected first_upload_at/last_upload_at ordering in backfill migration
- Fixed API metadata bug: now returns correct upload timeline (firstUploadAt, lastUploadAt, lastSchemaChangeAt)
- Migration backfilled 53 logical file groups from 437 existing files, detected 1 schema change
- All components use consistent `has_schema_changes` naming convention

**October 31, 2025** - Fixed transformation profiling correlation_id mismatch:
- Updated `jobExecutionEngine.js` to use `jobId` as `correlation_id` instead of UUID
- Synced 7,861 existing jobs in database to match the correct format
- Profiling endpoint now correctly retrieves file and column statistics for all transformation jobs
- Both source and target files now display complete profiling data in the UI

## System Architecture
The application features a hybrid architecture designed for scalability, security, and performance.

-   **Backend**: Python/Streamlit handles data processing, quality analysis (completeness, consistency, validity, uniqueness) for various file types (CSV, JSON, XLSX, XML, Parquet), supporting large files with constant memory usage, data profiling, and asynchronous processing.
-   **API Server**: Node.js/Express provides a REST API with hybrid authentication (local + Okta SSO), JWT tokens, rate limiting, CORS, asynchronous job queues, and an enterprise-grade audit system.
-   **Frontend**: React (TypeScript, Vite) forms a modern single-page application with UI components, Chart.js for visualization, drag-and-drop file upload, consistent CSS styling, React modals, and a three-line DataProfile header layout.
-   **Database**: PostgreSQL stores metadata, user management, file catalogs, and audit logs, optimized with connection pooling and performance indexes.
-   **File Storage**: Local file system with integrated support for AWS S3, Google Cloud Storage, and Azure Blob Storage. All uploads are scanned by ClamAV.
-   **Caching**: Multi-layer caching with Redis and in-memory fallback for frequently accessed data and API responses, with automatic invalidation.
-   **DBT Integration**: Configured for DBT Core and dbt-postgres for data transformations, including a UI for model discovery, execution, and monitoring.
-   **Security**: Includes ClamAV for virus scanning, automatic deletion of infected files, enterprise-grade RBAC with column-level security, AES-256-CBC encryption for cloud credentials, and hybrid authentication supporting strong password policies, account lockouts, password history, and Okta SSO with automatic user provisioning. RBAC includes 5 default roles and a PII Reader role with masked access. Column-level security uses tag-based permissions, intelligent data masking, and user-aware caching. An advanced Enterprise RBAC Transformation system features project-level access control, a policy-as-data engine, ABAC for context-aware policies, and SCIM 2.0 Provisioning, providing workspace isolation with a three-layer security model.
-   **Audit System**: Comprehensive, enterprise-grade audit logging across five tables with a full-featured UI for viewing and export.
-   **ETL Transformation System**: Comprehensive ETL with file pattern matching, schema validation, 25+ field transformations, schema drift detection, profiling with anomaly detection, job execution tracking, and full format conversion between CSV, JSON, XLSX, XML, and Parquet, including a Variables feature for ETL field mapping.
-   **Workflow Orchestration**: Complete system for managing data pipelines, including Mapping Groups (batch execution), Workflows (multi-step processes with dependency management), and a Scheduler (Cron-based and interval-based).
-   **File Insights Dashboard**: Includes time-series metric tracking, smart file pattern extraction, ID field detection, alert integration, and configurable granularity.
-   **Vendor Onboarding Module**: Comprehensive vendor management system where admins manage vendor connections at the agreement level using UUID identifiers. Vendor agreements integrate into the ETL transformation mapping workflow, allowing users to select agreements as alternative sources to regular connections for automated file processing. Includes file browsing capabilities with folder/file selection and a processed file catalog with search functionality. Vendor contract security ensures vendor users only see agreements where they're listed as primary or secondary contact (email-based filtering for non-admins).
-   **Project Type Categorization**: Distinguishes between internal and external projects, automatically creating external projects for vendors and ensuring clear separation in workflows.
-   **Vendor Agreement Schema Validation**: Full-stack system for ETL transformations with schema drift handling policies (abort, alert, none) integrated into job execution and monitored via the UI.

## External Dependencies
-   **Runtimes**: Python 3.11+, Node.js 20
-   **Database**: PostgreSQL 16
-   **Frontend Framework**: React 18
-   **Key Libraries**: pandas, numpy, plotly, ijson, pyarrow, psutil, Express.js, Streamlit, pg, bcrypt, jsonwebtoken, multer, AWS SDK, TypeScript, ESLint, Prettier, bullmq, dbt-core, dbt-postgres, xlsx, fast-xml-parser, cron-parser.
-   **Cloud Storage**: AWS S3, Google Cloud Storage, Azure Blob Storage
-   **Security**: ClamAV