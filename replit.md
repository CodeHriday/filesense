# Data File Observatory

## Overview
Data File Observatory is a platform for monitoring and analyzing data files, combining Python-based analytics with a web interface. Its purpose is to provide quality checks, profiling, and visualization for various file types, ensuring data integrity and offering actionable insights. The platform focuses on robust data handling, data governance, ETL, and workflow orchestration, aiming to provide a user-friendly interface for critical data management tasks. The project aims to provide a robust solution for data management, ensuring data quality, and offering advanced analytics, targeting businesses that require stringent data governance and efficient data processing.

## User Preferences
Preferred communication style: Simple, everyday language.

## UI/UX Layout Standards

**Global PageLayout Template** (November 2025): Created standardized page layout component (`src/components/PageLayout`) for consistent spacing and structure across all admin pages. **Layout Specifications:**
- Container: `padding: 10px 20px 20px 20px` (tighter top spacing), `max-width: 1200px`, centered with `margin: 0 auto`
- Header section: Title (2rem, #025043), optional subtitle, action buttons on right, `margin-bottom: 20px`
- Filters section: Optional, flex-wrap enabled for responsive wrapping, `margin-bottom: 20px`
- Table styling: `#f8f9fa` header background, `#dadce0` borders, `12px 16px` cell padding, `#f8f9fa` hover
- **Responsive**: Flex-wrap on header actions and filters for mobile/tablet support

**Applied to pages**: User Management, Project Management, File Catalog pages, Role Management, Access Groups, Vendor Management, Audit Trail, Dashboard Settings. **Not applied to**: Dashboard (custom layout), specialized wizards.

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
- **Security:** Includes ClamAV for virus scanning, automatic deletion of infected files, enterprise-grade RBAC with column-level security, AES-256-CBC encryption for cloud credentials, and hybrid authentication supporting strong password policies, account lockouts, password history, and Okta SSO with automatic user provisioning. RBAC includes 5 default roles and a PII Reader role with masked access. Column-level security uses tag-based permissions, intelligent data masking, and user-aware caching. An advanced Enterprise RBAC Transformation system features project-level access control, a policy-as-data engine, ABAC for context-aware policies, and SCIM 2.0 Provisioning, providing workspace isolation with a three-layer security model. **Bulk Creation Protection** (November 2025): Multi-layer defense against project creation abuse with database unique constraints, idempotency keys (24h TTL), dual rate limiting (3/min burst, 10/hour), comprehensive audit logging with payload hashing for all attempt types (success, duplicate, rate-limited, failed), spike detection (>5 attempts in 5 minutes triggers security alerts), and frontend protections with loading states and disabled buttons. **Governance Tag Migration** (November 2025): Migrated from legacy column_sensitivity_tags to unified governance_tags system. Supports multi-tag assignment per column with permission-based access control (tag:{name}:read, tag:{name}:edit), sensitivity levels (public/private/restricted), and dynamic badge colors. Migration seeded 5 default tags (PII, Confidential, Internal, Public, Restricted) and auto-migrated 16 legacy sensitivity tags to governance system with deterministic tag_ids.
- **Audit System:** Comprehensive, enterprise-grade audit logging across five tables with a full-featured UI for viewing and export.

**Feature Specifications:**
- **ETL Transformation System:** Comprehensive ETL with file pattern matching, schema validation, 25+ field transformations, schema drift detection, profiling with anomaly detection, job execution tracking, and full format conversion between CSV, JSON, XLSX, XML, and Parquet, including a Variables feature for ETL field mapping.
- **Workflow Orchestration:** Complete system for managing data pipelines, including Mapping Groups (batch execution), Workflows (multi-step processes with dependency management), and a Scheduler (Cron-based and interval-based). **Schedule Project Persistence Fix** (November 2025): Fixed critical bug where schedule project_id was not persisting during updates. Backend route now always fetches entity's project_id and sets it during updates (lines 450-472 in backend/routes/scheduler.js). Frontend SchedulerForm.jsx enhanced to auto-populate project dropdown from entity's project during both create and edit operations by passing loaded entity data directly to fetchSchedule() function, avoiding React state timing issues.
- **File Insights Dashboard:** Includes time-series metric tracking, smart file pattern extraction, ID field detection, alert integration, and configurable granularity.
- **Vendor Onboarding Module:** Comprehensive vendor management system where admins manage vendor connections at the agreement level. Integrates into the ETL transformation mapping workflow, allowing users to select agreements as alternative sources to regular connections. Includes file browsing capabilities and a processed file catalog. Vendor contract security ensures vendor users only see their associated agreements. **File-Level Data Governance** (November 2025): Moved PII detection, data classification, file type, and quality rules from agreement-level to file-level configuration. Each file pattern within a vendor agreement can now have independent governance settings: contains_pii (boolean), data_classification (Public/Internal/Confidential/Highly Confidential), file_type (CSV/JSON/XML/XLSX/Parquet), and quality_rule_ids (array). UI includes Material Design governance section with checkboxes, dropdowns, and multi-select quality rules. File config cards display color-coded badges for PII, classification levels, and quality rule counts. **Contract Validation Upload** (November 2025): Internal file upload module supports two modes: Ad-hoc Upload (standard) and Contract Validation (validates against vendor agreement schemas). Contract validation displays expected schema, auto-populates quality rules, shows governance badges (PII, classification, file type), and enforces agreement selection before upload. **Automatic Governance Tag Propagation** (November 2025): When files are uploaded using Contract Validation mode, PII governance tags automatically propagate from vendor_agreement_file_schemas to uploaded file columns via fileProcessingWorker.applyAgreementGovernance(). The worker queries governance_tags for PII tag_id and bulk inserts into column_governance_tag_assignments for columns marked pii=true in vendor agreement schemas, ensuring uploaded files inherit governance metadata from vendor contracts. This fixes a regression introduced during file processing worker v2 refactor where tag propagation was accidentally removed.
- **Project Type Categorization:** Distinguishes between internal and external projects, automatically creating external projects for vendors.
- **Vendor Agreement Schema Validation:** Full-stack system for ETL transformations with schema drift handling policies (abort, alert, none) integrated into job execution and monitored via the UI.
- **DBT Integration:** Configured for DBT Core and dbt-postgres for data transformations, including a UI for model discovery, execution, and monitoring.

## Performance Optimizations

**Implemented November 2025:**

**Phase 1 - Authentication & Audit Trail Optimizations:**
- **Redis-Based Permission Caching:** Permissions cached for 10 minutes using `permissions:roles:{rolesKey}` pattern, reducing auth overhead from 130ms to near-zero on cache hits. Falls back to in-memory cache when Redis unavailable.
- **Database Indexes:** Created composite indexes on `user_roles(user_id, role_id)`, `role_permissions(role_id, permission_id)`, `project_members(user_id, project_id)`, `user_groups(user_id, group_id)`, and `project_access_groups(group_id, project_id)` for faster joins.
- **Audit Trail Optimization:** Default limit reduced from 1000 to 50 records for faster page loads, maintained even when filters are cleared.

**Phase 2 - Dashboard & Polling Optimizations:**
- **Optimized Project Access Function:** Created PostgreSQL function `get_user_projects(user_id)` to replace expensive UNION queries for direct + group-based project membership across all dashboard metrics (projects, files, schedules, jobs, anomalies).
- **Reduced API Polling:** Notification polling interval increased from 30 to 60 seconds, cutting notification API calls in half. Polling only occurs when tab is visible.
- **Redis Graceful Degradation** (November 2025): Implemented infinite exponential backoff retry strategy (max 10s delay) replacing the 3-attempt limit that caused permanent connection closure. Added `isAvailable()` guard on all cache operations to check both connection flag and client status before executing Redis commands. Set `maxRetriesPerRequest: null` and `enableOfflineQueue: false` to prevent command queuing and premature failures. Silenced "Connection is closed" errors while maintaining reconnection logging. App now works seamlessly whether Redis is available or not, with NodeCache fallback ensuring cache functionality continues during Redis outages.

**Phase 3 - Response Caching Infrastructure:**
- **Dual-Layer Caching Middleware:** Created `backend/src/middleware/cache.js` with Redis primary cache and in-memory (NodeCache) fallback. Supports configurable TTL, custom key generation, and conditional caching based on response status.
- **Dashboard Metrics Caching:** Dashboard endpoint cached for 2 minutes with user-specific cache keys (`dashboard:metrics:user:{userId}:roles:{roles}`) to prevent data leakage. Includes X-Cache headers for monitoring hit/miss ratios.
- **Cache Invalidation Helpers:** Implemented functions for invalidating dashboard, file catalog, user data, and project caches. Uses safe pattern matching with proper regex escaping to prevent under/over-invalidation.
- **File-Specific Cache Invalidation:** Fixed sensitivity tag update endpoints to properly invalidate file details cache using `invalidateFileCache(fileId)` after POST/DELETE operations, ensuring File Attributes and File Profile display latest data immediately after sensitivity tag changes.

**Performance Impact:**
- Authentication overhead reduced from ~130ms to near-zero on cache hits
- Dashboard metric queries optimized by eliminating repeated UNION operations
- Notification API load reduced by 50%
- Page load times improved for audit trail (50 vs 1000 record default)

## Critical Implementation Details

### Group-Based Access Control Database Structure
**IMPORTANT:** The database uses the following tables for group-based project access:
- **`access_groups`** - Group definitions (id, name, description, group_type, etc.)
- **`user_groups`** - Links users to groups (user_id, group_id) - Foreign key to `access_groups.id`
- **`project_access_groups`** - Links groups to projects (project_id, group_id) - Foreign key to `access_groups.id`

**Group Management Routes:** The Group Management UI (`backend/routes/groupRoutes.js`) now uses `user_groups` table for all member operations (November 2025 fix). Previously used `access_group_members` table, causing sync issues.

**DO NOT USE:**
- `access_group_members` (legacy table, no longer used)
- `groups` (legacy table with orphaned data)
- `group_projects` (does not exist)

**Dashboard Metrics Pattern:** For non-admin users, always UNION direct membership (`project_members`) with group-based membership (`user_groups` → `project_access_groups`):
```sql
-- Direct project membership
SELECT project_id FROM project_members WHERE user_id = $1
UNION
-- Group-based project membership
SELECT pag.project_id 
FROM project_access_groups pag
INNER JOIN user_groups ug ON pag.group_id = ug.group_id
WHERE ug.user_id = $1
```

## External Dependencies
-   **Runtimes**: Python 3.11+, Node.js 20
-   **Database**: PostgreSQL 16
-   **Frontend Framework**: React 18
-   **Key Libraries**: pandas, numpy, plotly, ijson, pyarrow, psutil, Express.js, Streamlit, pg, bcrypt, jsonwebtoken, multer, AWS SDK, TypeScript, ESLint, Prettier, bullmq, dbt-core, dbt-postgres, xlsx, fast-xml-parser, cron-parser.
-   **Cloud Storage**: AWS S3, Google Cloud Storage, Azure Blob Storage
-   **Security**: ClamAV