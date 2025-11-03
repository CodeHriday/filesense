# Data File Observatory

## Overview
Data File Observatory is a platform for monitoring and analyzing data files, combining Python-based analytics with a web interface. Its purpose is to provide quality checks, profiling, and visualization for various file types, ensuring data integrity and offering actionable insights. The platform focuses on robust data handling, data governance, ETL, and workflow orchestration, aiming to provide a user-friendly interface for critical data management tasks. The project aims to provide a robust solution for data management, ensuring data quality, and offering advanced analytics, targeting businesses that require stringent data governance and efficient data processing.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a hybrid architecture designed for scalability, security, and performance.

**UI/UX Decisions:**
- Modern single-page application built with React (TypeScript, Vite).
- Chart.js for data visualization.
- Drag-and-drop file upload.
- Consistent CSS styling and React modals.
- Three-line DataProfile header layout.

**Technical Implementations:**
- **Backend (Python/Streamlit):** Handles data processing, quality analysis (completeness, consistency, validity, uniqueness) for various file types (CSV, JSON, XLSX, XML, Parquet), supporting large files with constant memory usage, data profiling, and asynchronous processing.
- **API Server (Node.js/Express):** Provides a REST API with hybrid authentication (local + Okta SSO), JWT tokens, rate limiting, CORS, asynchronous job queues, and an enterprise-grade audit system.
- **Database (PostgreSQL):** Stores metadata, user management, file catalogs, and audit logs, optimized with connection pooling and performance indexes.
- **File Storage:** Local file system with integrated support for AWS S3, Google Cloud Storage, and Azure Blob Storage. All uploads are scanned by ClamAV.
- **Caching:** Multi-layer caching with Redis and in-memory fallback for frequently accessed data and API responses, with automatic invalidation.
- **Security:** Includes ClamAV for virus scanning, automatic deletion of infected files, enterprise-grade RBAC with column-level security, AES-256-CBC encryption for cloud credentials, and hybrid authentication supporting strong password policies, account lockouts, password history, and Okta SSO with automatic user provisioning. RBAC includes 5 default roles and a PII Reader role with masked access. Column-level security uses tag-based permissions, intelligent data masking, and user-aware caching. An advanced Enterprise RBAC Transformation system features project-level access control, a policy-as-data engine, ABAC for context-aware policies, and SCIM 2.0 Provisioning, providing workspace isolation with a three-layer security model.
- **Audit System:** Comprehensive, enterprise-grade audit logging across five tables with a full-featured UI for viewing and export.

**Feature Specifications:**
- **ETL Transformation System:** Comprehensive ETL with file pattern matching, schema validation, 25+ field transformations, schema drift detection, profiling with anomaly detection, job execution tracking, and full format conversion between CSV, JSON, XLSX, XML, and Parquet, including a Variables feature for ETL field mapping.
- **Workflow Orchestration:** Complete system for managing data pipelines, including Mapping Groups (batch execution), Workflows (multi-step processes with dependency management), and a Scheduler (Cron-based and interval-based).
- **File Insights Dashboard:** Includes time-series metric tracking, smart file pattern extraction, ID field detection, alert integration, and configurable granularity.
- **Vendor Onboarding Module:** Comprehensive vendor management system where admins manage vendor connections at the agreement level. Integrates into the ETL transformation mapping workflow, allowing users to select agreements as alternative sources to regular connections. Includes file browsing capabilities and a processed file catalog. Vendor contract security ensures vendor users only see their associated agreements.
- **Project Type Categorization:** Distinguishes between internal and external projects, automatically creating external projects for vendors.
- **Vendor Agreement Schema Validation:** Full-stack system for ETL transformations with schema drift handling policies (abort, alert, none) integrated into job execution and monitored via the UI.
- **DBT Integration:** Configured for DBT Core and dbt-postgres for data transformations, including a UI for model discovery, execution, and monitoring.

## External Dependencies
-   **Runtimes**: Python 3.11+, Node.js 20
-   **Database**: PostgreSQL 16
-   **Frontend Framework**: React 18
-   **Key Libraries**: pandas, numpy, plotly, ijson, pyarrow, psutil, Express.js, Streamlit, pg, bcrypt, jsonwebtoken, multer, AWS SDK, TypeScript, ESLint, Prettier, bullmq, dbt-core, dbt-postgres, xlsx, fast-xml-parser, cron-parser.
-   **Cloud Storage**: AWS S3, Google Cloud Storage, Azure Blob Storage
-   **Security**: ClamAV