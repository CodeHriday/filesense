# Data File Observatory

## Overview
Data File Observatory is a platform designed for monitoring, analyzing, and ensuring the integrity of data files through Python-based analytics and a web interface. It provides capabilities for quality checks, profiling, and visualization across various file types, offering actionable insights for data management. The project aims to deliver a robust solution for data governance, ETL, and workflow orchestration, targeting businesses that require stringent data quality and efficient data processing with a user-friendly interface.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application is a modern single-page application built with React (TypeScript, Vite). It utilizes Chart.js for data visualization, features drag-and-drop file uploads, and maintains consistent CSS styling and React modals. A standardized `PageLayout` component ensures consistent spacing and structure across most admin pages, with responsive design principles applied.

**Typography Standard (November 2025):** The ETL Mapping Wizard uses a comprehensive 10px Inter font system for compact, information-dense interfaces. All text elements (headers, labels, inputs, buttons, helper text) use 10px Inter font with reduced spacing. Headers use 600 weight with Title Case formatting (not uppercase). This provides visual consistency across all wizard steps including TableBasedMapper, RdmLookupStep, and CrosswalkLookupStep components.

**Header Case Standard (December 2025):** All section headers, panel titles, and form section titles should use Title Case (e.g., "Vendor Primary Contact") rather than all caps. This applies to modal headers, card titles, and any UI section headings.

### Technical Implementations
-   **Backend (Python/Streamlit):** Handles data processing, quality analysis (completeness, consistency, validity, uniqueness) for various file types (CSV, JSON, XLSX, XML, Parquet), supports large files with constant memory usage, data profiling, and asynchronous processing.
-   **API Server (Node.js/Express):** Provides a REST API with hybrid authentication (local + Okta SSO), JWT tokens, rate limiting, CORS, asynchronous job queues, and an enterprise-grade audit system.
-   **Database (PostgreSQL):** Stores metadata, user management, file catalogs, and audit logs, optimized with connection pooling and performance indexes.
-   **File Storage:** Local file system with integrated support for AWS S3, Google Cloud Storage, and Azure Blob Storage. All uploads are scanned by ClamAV.
-   **Caching:** Multi-layer caching with Redis and in-memory fallback for frequently accessed data and API responses, with automatic invalidation. Includes Redis graceful degradation with infinite exponential backoff.
-   **Security:** Features ClamAV for virus scanning, enterprise-grade RBAC with column-level security and intelligent data masking, AES-256-CBC encryption for cloud credentials, and hybrid authentication with strong password policies and Okta SSO. RBAC includes project-level access control, a policy-as-data engine, ABAC, and SCIM 2.0 Provisioning. Bulk Creation Protection is implemented against project creation abuse. Governance tags have been migrated to a unified system supporting multi-tag assignment and permission-based access.
-   **Audit System:** Comprehensive, enterprise-grade audit logging across five tables with a full-featured UI.

### Feature Specifications
-   **Programmatic Upload API:** Production-ready REST API for automated file uploads supporting 15+ file formats (CSV, JSON, Parquet, Excel, XML, ZIP, TAR, SAS datasets, Avro, DAT). Features include: three upload endpoints (vendor agreement, internal project, bulk), API token authentication with scope-based permissions, batch record processing (1,000 records per transaction), multi-row INSERT to upload_staging table, virus scanning integration, asynchronous processing via BullMQ workers (5 concurrent) with exponential backoff retry, graceful degradation to synchronous processing when Redis unavailable, comprehensive status tracking (GET endpoints for batch and file-level progress), and project association security validation. Health check endpoint (/api/health) reports upload queue status and degraded mode.
-   **ETL Transformation System:** Provides comprehensive ETL capabilities including file pattern matching, schema validation, 27+ field transformations, schema drift detection, profiling with anomaly detection, job execution tracking, and format conversion. Includes RDM integration for reference data lookups and crosswalk transformations.
-   **Workflow Orchestration:** Manages data pipelines through Mapping Groups, Workflows with dependency management, and a Cron-based and interval-based Scheduler. Includes fixes for schedule persistence and next_run recalculation.
-   **File Insights Dashboard:** Offers time-series metric tracking, smart file pattern extraction, ID field detection, alert integration, and configurable granularity.
-   **Vendor Onboarding Module:** A comprehensive vendor management system that allows admins to manage vendor connections at the agreement level. It integrates into the ETL workflow, provides file browsing, and supports file-level data governance (PII detection, data classification, file type, quality rules). Contract validation mode enforces agreement schemas and propagates governance tags to uploaded files. **Hybrid Schema Reference Token System (December 2025):** Addresses Excel's 34,000 character cell limit for large schemas (200+ fields). Excel templates support two reference token formats: `{external}` (generic placeholder) and `{schema:filename.json}` (specific file reference) - curly brace syntax avoids Excel formula interpretation issues. Legacy `@external` and `@schema:` formats remain supported for backwards compatibility. During template import, reference tokens are detected and file configurations display an "Attach Schema" button for users to upload separate JSON schema files. Backend endpoint `/api/vendor-agreement-template/upload-schema` validates and normalizes uploaded JSON schema files (up to 10MB). **Quality rules are embedded in schema JSON** at the field level using `quality_rules` array (e.g., `["duplicate_check", "uniqueness"]`). Archive passwords are configured manually in the UI after template import for security.
-   **Project Type Categorization:** Differentiates between internal and external projects, automatically creating external projects for vendors.
-   **Vendor Agreement Schema Validation:** Full-stack system for ETL transformations with schema drift handling policies.
-   **DBT Integration:** Configured for DBT Core and dbt-postgres for data transformations, with a UI for model discovery, execution, and monitoring.
-   **RDM Integration:** External Reference Data Management system integration at rdm.blumetra.com for looking up reference datasets and crosswalks during ETL transformations. Supports two transformation types: `rdm_crosswalk_lookup` (maps source values to target values) and `rdm_dataset_join` (enriches records with reference data). RDM resources are pre-fetched once per job and cached in memory for O(1) lookups. API credentials stored in Replit Secrets (RDM_API_KEY, RDM_BASE_URL).
-   **AI Data Quality Suggestions:** Multi-cloud AI provider system for generating data quality rule suggestions from file profiling data. **Provider abstraction layer** (`backend/ai_providers/`) supports environment-based switching between: OpenAI (Replit AI Integration), AWS Bedrock (Claude/Titan), Azure OpenAI, Google Gemini (API key or service account), and Rule-based (fully private, no external calls). Provider selection via `AI_PROVIDER` environment variable or database setting (`app_settings.ai_provider`). UI includes provider dropdown selector with availability status and privacy indicators. Rule-based provider offers deterministic suggestions based on profiling metrics for air-gapped/regulated environments.
-   **Email Alerting System:** Cloud-agnostic email notification system for job/workflow/schedule monitoring with 7 email provider types. **Backend complete (tasks 1-21):** Database schema (alert_policies, alert_policy_recipients, alert_runs, alert_events, alert_aggregation, alert_attachments), email provider adapters (SMTP, Gmail OAuth2, Outlook OAuth2, SendGrid, AWS SES, Azure Communication Services, GCP Email), notification service with failover/retry/rate limiting, alert aggregation with Redis+DB dual-backend, email templates with quality violation attachments, REST APIs for policy/recipient/connection management. **UI (task 22 in progress):** Alert policy configuration interface created (`src/pages/AlertsConfig.jsx`), requires field name mapping to database schema (`entity_type`, `trigger_events`, `consolidation_window_minutes`).
-   **Password-Protected Archive Extraction:** Automated extraction system for password-protected archives (ZIP, 7z, TAR, TAR.GZ, TAR.BZ2) with DLQ (Dead Letter Queue) for failed jobs. **Backend complete (tasks 1-12):** Database schema (archive_extractions for attempt tracking, archive_members for file provenance, dlq_jobs for failed extractions, encrypted_passwords for vendor agreement passwords), archive detection service (magic bytes + extension validation), streaming extraction services (yauzl for ZIP, tar-stream for TAR formats, node-7z-archive for 7z), virus scanning integration for each extracted file, password vault service with AES-256-CBC encryption, DLQ service with error categorization and remediation instructions, integration with file processing worker (automatic extraction after virus scan passes), REST APIs for password management and DLQ job retry/provision. Features: 25 MB file size limit, single-level extraction only (no nested archives), vendor-specific password storage, two password flows (pre-configured via vendor agreements vs ad-hoc upload with password field). **UI pending (tasks 13-20):** Archive password field in vendor agreement form, dynamic password field in file upload form, DLQ admin page with failed job list and retry interface, file catalog hierarchical display for archive provenance.

### Performance Optimizations
Optimizations include Redis-based permission caching, database indexing on key tables, reduced default audit trail records, an optimized PostgreSQL function for project access, reduced API polling intervals, and a dual-layer response caching middleware with Redis and in-memory fallback.

### Enterprise Performance Infrastructure (November 2025)
Production-grade infrastructure designed to handle terabyte-scale data and 100+ concurrent users:

**Database Optimizations:**
-   **Composite Indexes:** Multi-column indexes on transformation_jobs (status+date), anomalies (severity+type), file_previews (entity+type), and audit_logs (action+timestamp) for 10-50x query performance improvement.
-   **Partial Indexes:** Filtered indexes on active/pending records for common query patterns (e.g., `WHERE status IN ('pending', 'running')`).
-   **Covering Indexes:** Include frequently selected columns to eliminate table lookups.
-   **Materialized Views:** Pre-computed dashboard aggregations (`mv_dashboard_jobs_summary`, `mv_dashboard_anomaly_trends`, `mv_dashboard_file_metrics`) with 60-second background refresh via `materializedViewWorker.js`.

**API Performance:**
-   **Cursor-Based Pagination:** Keyset pagination utilities (`backend/utils/cursorPagination.js`) for constant-time pagination on any page. Jobs API includes `/v2` endpoints coexisting with legacy offset pagination for backward compatibility.
-   **Enterprise Caching Middleware:** Multi-layer caching with Redis primary and in-memory fallback, automatic cache invalidation on mutations, cache key patterns based on user permissions.
-   **Per-User Rate Limiting:** Sliding window rate limits (`backend/middleware/enterpriseRateLimiter.js`) with Redis or memory backend, user tier multipliers (basic/premium/enterprise/admin), and configurable limits by endpoint type (api/upload/search/bulk/export).

**Streaming File Processing:**
-   **Stream-Based Processors:** `backend/services/streamingFileProcessor.js` with constant memory usage regardless of file size, supporting CSV and JSON with automatic type detection.
-   **Bulk Insert Optimization:** PostgreSQL multi-row INSERT with ON CONFLICT handling, 1000 records per batch transaction, progress tracking and checkpointing.
-   **Memory-Efficient Analysis:** File schema detection and sampling without loading entire files into memory.

**Health Monitoring:**
-   Enhanced `/api/health` endpoint reporting: database connection pool status, Redis connectivity, queue status, memory usage, and component readiness for load balancer health probes.

### Critical Implementation Details
-   **Group-Based Access Control:** Uses `access_groups`, `user_groups`, and `project_access_groups` tables for managing group-based project access. `user_groups` is used for all member operations in Group Management UI.
-   **Dashboard Metrics Pattern:** For non-admin users, dashboard metrics always combine direct project membership (`project_members`) with group-based membership (`user_groups` → `project_access_groups`).

## External Dependencies
-   **Runtimes**: Python 3.11+, Node.js 20
-   **Database**: PostgreSQL 16
-   **Frontend Framework**: React 18
-   **Key Libraries**: pandas, numpy, plotly, ijson, pyarrow, psutil, Express.js, Streamlit, pg, bcrypt, jsonwebtoken, multer, AWS SDK, TypeScript, ESLint, Prettier, bullmq, dbt-core, dbt-postgres, xlsx, fast-xml-parser, cron-parser.
-   **Cloud Storage**: AWS S3, Google Cloud Storage, Azure Blob Storage
-   **Security**: ClamAV