# Data File Observatory

## Overview
Data File Observatory is a platform designed for monitoring, analyzing, and ensuring the integrity of data files through Python-based analytics and a web interface. It provides capabilities for quality checks, profiling, and visualization across various file types, offering actionable insights for data management. The project aims to deliver a robust solution for data governance, ETL, and workflow orchestration, targeting businesses that require stringent data quality and efficient data processing with a user-friendly interface.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application is a modern single-page application built with React (TypeScript, Vite). It utilizes Chart.js for data visualization, features drag-and-drop file uploads, and maintains consistent CSS styling and React modals. A standardized `PageLayout` component ensures consistent spacing and structure across most admin pages, with responsive design principles applied.

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
-   **Vendor Onboarding Module:** A comprehensive vendor management system that allows admins to manage vendor connections at the agreement level. It integrates into the ETL workflow, provides file browsing, and supports file-level data governance (PII detection, data classification, file type, quality rules). Contract validation mode enforces agreement schemas and propagates governance tags to uploaded files.
-   **Project Type Categorization:** Differentiates between internal and external projects, automatically creating external projects for vendors.
-   **Vendor Agreement Schema Validation:** Full-stack system for ETL transformations with schema drift handling policies.
-   **DBT Integration:** Configured for DBT Core and dbt-postgres for data transformations, with a UI for model discovery, execution, and monitoring.
-   **RDM Integration:** External Reference Data Management system integration at rdm.blumetra.com for looking up reference datasets and crosswalks during ETL transformations. Supports two transformation types: `rdm_crosswalk_lookup` (maps source values to target values) and `rdm_dataset_join` (enriches records with reference data). RDM resources are pre-fetched once per job and cached in memory for O(1) lookups. API credentials stored in Replit Secrets (RDM_API_KEY, RDM_BASE_URL).
-   **Email Alerting System:** Cloud-agnostic email notification system for job/workflow/schedule monitoring with 7 email provider types. **Backend complete (tasks 1-21):** Database schema (alert_policies, alert_policy_recipients, alert_runs, alert_events, alert_aggregation, alert_attachments), email provider adapters (SMTP, Gmail OAuth2, Outlook OAuth2, SendGrid, AWS SES, Azure Communication Services, GCP Email), notification service with failover/retry/rate limiting, alert aggregation with Redis+DB dual-backend, email templates with quality violation attachments, REST APIs for policy/recipient/connection management. **UI (task 22 in progress):** Alert policy configuration interface created (`src/pages/AlertsConfig.jsx`), requires field name mapping to database schema (`entity_type`, `trigger_events`, `consolidation_window_minutes`).

### Performance Optimizations
Optimizations include Redis-based permission caching, database indexing on key tables, reduced default audit trail records, an optimized PostgreSQL function for project access, reduced API polling intervals, and a dual-layer response caching middleware with Redis and in-memory fallback.

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