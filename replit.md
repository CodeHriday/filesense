# Data File Observatory

## Overview
Data File Observatory is a platform for monitoring, analyzing, and ensuring data file integrity using Python-based analytics and a web interface. It provides capabilities for quality checks, profiling, and visualization across various file types, offering actionable insights for data management. The project aims to deliver a robust solution for data governance, ETL, and workflow orchestration, targeting businesses that require stringent data quality and efficient data processing with a user-friendly interface.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application is a modern single-page application built with React (TypeScript, Vite). It utilizes Chart.js for data visualization, features drag-and-drop file uploads, maintains consistent CSS styling, and uses React modals. A standardized `PageLayout` component ensures consistent spacing and structure. The UI adheres to a 10px Inter font system for compact interfaces and uses Title Case for all section headers and titles.

### Technical Implementations
-   **Backend (Python/Streamlit):** Handles data processing, quality analysis (completeness, consistency, validity, uniqueness) for various file types (CSV, JSON, XLSX, XML, Parquet), supports large files with constant memory usage, data profiling, and asynchronous processing.
-   **API Server (Node.js/Express):** Provides a REST API with hybrid authentication (local + Okta SSO), JWT tokens, rate limiting, CORS, asynchronous job queues, and an enterprise-grade audit system.
-   **Database (PostgreSQL):** Stores metadata, user management, file catalogs, and audit logs, optimized with connection pooling and performance indexes.
-   **File Storage:** Local file system with integrated support for AWS S3, Google Cloud Storage, and Azure Blob Storage. All uploads are scanned by ClamAV.
-   **Caching:** Multi-layer caching with Redis and in-memory fallback, including automatic invalidation and Redis graceful degradation.
-   **Security:** Features ClamAV for virus scanning, enterprise-grade RBAC with column-level security and intelligent data masking, AES-256-CBC encryption for cloud credentials, and hybrid authentication with strong password policies and Okta SSO.
-   **Audit System:** Comprehensive, enterprise-grade audit logging across five tables with a full-featured UI.

### Feature Specifications
-   **Programmatic Upload API:** Production-ready REST API for automated file uploads supporting 15+ file formats with API token authentication, batch processing, virus scanning, and asynchronous processing via BullMQ.
-   **ETL Transformation System:** Provides comprehensive ETL capabilities including file pattern matching, schema validation, 27+ field transformations, schema drift detection, profiling, job execution tracking, format conversion, and multi-source join support (INNER, LEFT, LEFT OUTER).
-   **Workflow Orchestration:** Manages data pipelines through Mapping Groups, Workflows with dependency management, and a Cron-based and interval-based Scheduler.
-   **File Insights Dashboard:** Offers time-series metric tracking, smart file pattern extraction, ID field detection, alert integration, and configurable granularity.
-   **Vendor Onboarding Module:** A comprehensive vendor management system for managing vendor connections, integrating into the ETL workflow, providing file browsing, and supporting file-level data governance. Includes a hybrid schema reference token system for large Excel schemas and embeds quality rules in schema JSON.
-   **Project Type Categorization:** Differentiates between internal and external projects, automatically creating external projects for vendors.
-   **Vendor Agreement Schema Validation:** Full-stack system for ETL transformations with schema drift handling policies. Includes integrated DQ (Data Quality) rule validation that executes quality rules from vendor agreements against file data after schema validation passes. Supports 12+ rule types including null_check, duplicate_check, email_validity, phone_validity, completeness, validity, uniqueness, range_check, length_check, date_format, timestamp_format, and column_completeness.
-   **DBT Integration:** Configured for DBT Core and dbt-postgres for data transformations, with a UI for model discovery, execution, and monitoring.
-   **RDM Integration:** External Reference Data Management system integration for looking up reference datasets and crosswalks during ETL transformations, caching resources for O(1) lookups.
-   **AI Data Quality Suggestions:** Multi-cloud AI provider system for generating data quality rule suggestions from file profiling data, supporting OpenAI, AWS Bedrock, Azure OpenAI, Google Gemini, and a rule-based private provider.
-   **Email Alerting System:** Cloud-agnostic email notification system for job/workflow/schedule monitoring with 7 email provider types, comprehensive backend, and a UI for alert policy configuration.
-   **Password-Protected Archive Extraction:** Automated extraction system for password-protected archives (ZIP, 7z, TAR, etc.) with DLQ for failed jobs, virus scanning, and password vault service.

### Performance Optimizations
Includes Redis-based permission caching, database indexing, reduced audit trail records, optimized PostgreSQL functions, reduced API polling, and a dual-layer response caching middleware.

### Archived Modules (January 2026)
The following modules have been archived to reduce API calls and improve AWS rate limiting compliance:
-   **DataStories** - Data storytelling feature (route `/stories` disabled)
-   **DBTTransformations** - DBT model execution UI (route `/dbt-transformations` disabled)
-   **WorkflowBuilder, WorkflowTest, WorkflowCanvasStandalone** - Legacy workflow tools replaced by Visual Workflows
-   **HooksDemo** - Development testing page

### API Polling Optimization (January 2026)
To reduce AWS API rate limiting, auto-polling has been disabled in favor of on-demand loading:
-   **Badges page** - Manual refresh button added, loads on page visit
-   **Anomalies page** - Manual refresh button added, loads on page visit
-   **useSLAMonitoring hook** - refetchInterval disabled, loads on mount
-   **useAPINotifications hook** - refetchInterval disabled, loads on mount, 30s delayed invalidation
-   **useApiStatus hook** - refetchInterval disabled, loads on mount

**Adaptive Polling** (smart interval adjustment based on runtime):
-   **Jobs Monitor** - 5s for <1min, 10s for 1-10min, 30s for >10min; list refresh 90s
-   **FileUpload** - 1s for <10s, 3s for 10-30s, 5s for >30s elapsed
-   **DataProfile** - 2s for <30s, 5s for >30s elapsed

**Static Data Caching** (STATIC_DATA staleTime = 15 minutes):
-   **useProjects** - Project lists cached for 15 minutes

### Enterprise Performance Infrastructure
Features database optimizations (composite, partial, and covering indexes, materialized views with background refresh), API performance enhancements (cursor-based pagination, enterprise caching middleware, per-user rate limiting), and streaming file processing (constant memory usage, bulk insert optimization, memory-efficient analysis). Enhanced `/api/health` endpoint reports comprehensive system status.

### Critical Implementation Details
Group-based access control is managed via `access_groups`, `user_groups`, and `project_access_groups` tables. Dashboard metrics for non-admin users combine direct project membership with group-based membership.

## External Dependencies
-   **Runtimes**: Python 3.11+, Node.js 20
-   **Database**: PostgreSQL 16
-   **Frontend Framework**: React 18
-   **Key Libraries**: pandas, numpy, plotly, ijson, pyarrow, psutil, Express.js, Streamlit, pg, bcrypt, jsonwebtoken, multer, AWS SDK, TypeScript, ESLint, Prettier, bullmq, dbt-core, dbt-postgres, xlsx, fast-xml-parser, cron-parser.
-   **Cloud Storage**: AWS S3, Google Cloud Storage, Azure Blob Storage
-   **Security**: ClamAV